import fs from 'fs/promises';
import pkg from 'pg';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isSituacaoAtiva, isSituacaoIrregular, normalizarSituacaoCadastral } from '../utils/situacaoCadastral';
import { montarPatchConfirmacaoCadastralDocumento } from '../utils/confirmacaoCadastralDocumento';
import { campoFoiEditadoManualmente } from '../utils/edicaoManualCamposEmpresa';
import { colunasDaTabela, registrarHistoricoSincronizacaoSeguro } from './sincronizacaoReceitaAutomaticaService';
import {
  codigoCnae,
  codigoNatureza,
  compararEndereco,
  detectarMatrizFilial,
  diffDays,
  enderecoEmpresa,
  monthsSince,
  normalizeText,
  normalizarBasico,
  normalizarNomeEmpresarial,
  normalizarSituacao,
  onlyDigits,
  parseDate,
  tempoAberturaDescricao,
} from '../utils/helpers';
import { extrairDocumentoLocal } from './extracaoDocumentalLocal';
import { resolveDocumentPath } from './documentStorage';
import { externalAiFallbackDocumentalEnabled } from './documentExternalAiPolicy';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

type Severidade = 'baixa' | 'media' | 'alta' | 'critica';

type AlertaAnalise = {
  codigo: string;
  mensagem: string;
  severidade: Severidade;
  recomendacao?: string;
};

type DocCartao = {
  id: string;
  entidade_tipo?: string | null;
  entidade_id?: string | null;
  empresa_id?: string | null;
  nome_original?: string | null;
  nome_arquivo?: string | null;
  hash_arquivo?: string | null;
  mime_type?: string | null;
  caminho_arquivo?: string | null;
  data_emissao_documento?: string | null;
  status_validade?: string | null;
  resultado_validacao?: any;
  criado_em?: string | null;
};

type ExtracaoCartao = {
  cnpj?: string | null;
  matriz_filial?: string | null;
  data_abertura?: string | null;
  nome_empresarial?: string | null;
  nome_fantasia?: string | null;
  cnae_principal?: string | null;
  natureza_juridica?: string | null;
  porte?: string | null;
  endereco_completo?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  situacao_cadastral?: string | null;
  email?: string | null;
  telefone?: string | null;
  data_emissao?: string | null;
  data_situacao_cadastral?: string | null;
  data_emissao_texto?: string | null;
  modelo?: string | null;
  fonte?: string | null;
  confianca?: number | null;
  raw_text?: string | null;
};

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function montarCamposReceita(empresa: any) {
  const dataAbertura = parseDate(empresa?.data_abertura);
  const idadeMeses = monthsSince(dataAbertura);
  return {
    cnpj: empresa?.cnpj || null,
    cnpj_limpo: onlyDigits(empresa?.cnpj),
    matriz_filial: detectarMatrizFilial(empresa?.cnpj, empresa?.matriz_filial),
    data_abertura: dataAbertura,
    idade_meses: idadeMeses,
    tempo_abertura_descricao: tempoAberturaDescricao(idadeMeses),
    nome_empresarial: empresa?.razao_social || null,
    nome_fantasia: empresa?.nome_fantasia || null,
    cnae_principal: empresa?.cnae_principal || empresa?.segmento || null,
    cnaes_secundarios: Array.isArray(empresa?.cnaes_secundarios) ? empresa.cnaes_secundarios : [],
    natureza_juridica: empresa?.natureza_juridica || null,
    porte: empresa?.porte || empresa?.porte_receita || null,
    capital_social: empresa?.capital_social === null || empresa?.capital_social === undefined ? null : Number(empresa.capital_social),
    situacao_cadastral: empresa?.situacao_cadastral || null,
    data_situacao_cadastral: parseDate(empresa?.data_situacao_cadastral),
    motivo_situacao_cadastral: empresa?.motivo_situacao_cadastral || null,
    endereco_completo: enderecoEmpresa(empresa),
    cidade: empresa?.cidade || null,
    estado: empresa?.estado || null,
    ultima_sincronizacao_receita: empresa?.ultima_sincronizacao_receita || empresa?.atualizado_receita_em || null,
    fonte_dados: empresa?.fonte_dados_empresa || empresa?.provedor_cnpj || 'cadastro_receita',
  };
}


type ComparacaoCampo = {
  label: string;
  status: string;
  receita: unknown;
  cartao: unknown;
  divergente: boolean;
  normalizado_receita?: string;
  normalizado_cartao?: string;
  motivo?: string;
};

function compararCampo(label: string, receita: unknown, cartao: unknown, tipo: 'texto' | 'nome' | 'cnpj' | 'data' | 'cnae' | 'natureza' | 'situacao' | 'endereco' = 'texto'): ComparacaoCampo {
  if (cartao === undefined || cartao === null || String(cartao).trim() === '') {
    return { label, status: 'nao_extraido', receita, cartao, divergente: false, motivo: 'Campo não extraído do Cartão CNPJ.' };
  }
  if (receita === undefined || receita === null || String(receita).trim() === '') {
    return { label, status: 'sem_base_receita', receita, cartao, divergente: false, motivo: 'Campo não existe na base Receita/cadastro para comparação segura.' };
  }

  if (tipo === 'endereco') return compararEndereco(receita, cartao);

  let r = String(receita || '').trim();
  let c = String(cartao || '').trim();
  let motivoConferido = 'Valores equivalentes após normalização.';
  let motivoDivergente = 'Valores normalizados são diferentes.';

  if (tipo === 'cnpj') {
    r = onlyDigits(r); c = onlyDigits(c);
    motivoDivergente = 'CNPJs numéricos diferentes.';
  } else if (tipo === 'data') {
    const dr = parseDate(r); const dc = parseDate(c);
    r = dr || ''; c = dc || '';
    motivoDivergente = 'Datas diferentes.';
  } else if (tipo === 'cnae') {
    r = codigoCnae(r); c = codigoCnae(c);
    motivoConferido = 'Código CNAE igual; descrição textual/formatação ignorada.';
    motivoDivergente = 'Código CNAE principal diferente.';
  } else if (tipo === 'natureza') {
    r = codigoNatureza(r); c = codigoNatureza(c);
    motivoConferido = 'Código da natureza jurídica igual; descrição textual/formatação ignorada.';
    motivoDivergente = 'Código da natureza jurídica diferente.';
  } else if (tipo === 'situacao') {
    r = normalizarSituacao(r); c = normalizarSituacao(c);
    motivoDivergente = 'Situação cadastral normalizada diferente.';
  } else if (tipo === 'nome') {
    r = normalizarNomeEmpresarial(r); c = normalizarNomeEmpresarial(c);
    motivoConferido = 'Nome empresarial equivalente após remover espaços, pontuação e caixa.';
    motivoDivergente = 'Nome empresarial diferente após normalização forte.';
  } else {
    r = normalizarBasico(r); c = normalizarBasico(c);
  }

  // Regra inquebrável: só existe divergência quando os dois lados existem e a diferença objetiva fica preservada após normalização.
  const divergente = !!r && !!c && r !== c;
  return {
    label,
    status: divergente ? 'divergente' : 'conferido',
    receita,
    cartao,
    divergente,
    normalizado_receita: r,
    normalizado_cartao: c,
    motivo: divergente ? motivoDivergente : motivoConferido,
  };
}

function montarDivergencia(campo: string, item: ComparacaoCampo) {
  return {
    campo,
    label: item.label,
    receita: item.receita ?? null,
    cartao: item.cartao ?? null,
    valor_receita: item.receita ?? null,
    valor_cartao: item.cartao ?? null,
    normalizado_receita: item.normalizado_receita ?? null,
    normalizado_cartao: item.normalizado_cartao ?? null,
    motivo: item.motivo || 'Diferença objetiva identificada pelo backend.',
    evidencia: `${item.label}: Receita/cadastro = "${String(item.receita ?? '')}" | Cartão CNPJ = "${String(item.cartao ?? '')}".`,
    severidade: (campo === 'cnpj' || campo === 'situacao_cadastral' ? 'critica' : 'alta') as Severidade,
  };
}

function extrairJson(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch {}
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

function geminiOcrEnabled(): boolean {
  return externalAiFallbackDocumentalEnabled();
}

function normalizarConfianca(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n <= 100) return Math.round(n) / 100;
  return Math.max(0, Math.min(1, n));
}

export function extracaoTemQualidade(extracao: ExtracaoCartao | null): boolean {
  if (!extracao) return false;
  const confianca = normalizarConfianca(extracao.confianca);
  const camposIdentidade = [
    extracao.data_abertura,
    extracao.nome_empresarial,
    extracao.cnae_principal,
    extracao.natureza_juridica,
    extracao.situacao_cadastral,
  ].filter(Boolean).length;
  // A data de emissão é uma validação de atualidade, não a condição para dizer
  // que o documento foi lido. Quando ela não for identificada, o relatório
  // deve mostrar uma pendência clara, nunca voltar para "aguardando análise".
  const temIdentidadeMinima = !!extracao.cnpj && camposIdentidade >= 3;
  if (!temIdentidadeMinima) return false;
  if (confianca !== null && confianca < 0.55) return false;
  return true;
}

function inferirMimeDocumento(doc: DocCartao): string | null {
  const explicit = String(doc.mime_type || '').toLowerCase().trim();
  if (explicit && explicit !== 'application/octet-stream') return explicit;
  const nome = String(doc.nome_original || doc.caminho_arquivo || '').toLowerCase();
  if (nome.endsWith('.pdf')) return 'application/pdf';
  if (nome.endsWith('.png')) return 'image/png';
  if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg';
  if (nome.endsWith('.webp')) return 'image/webp';
  return explicit || null;
}

function documentoSuportadoPorGemini(doc: DocCartao): boolean {
  const mime = inferirMimeDocumento(doc);
  return !!mime && (mime.includes('pdf') || mime.startsWith('image/'));
}

async function resolverCaminhoDocumento(doc?: DocCartao | null): Promise<string | null> {
  if (!doc) return null;
  const resolved = resolveDocumentPath(doc);
  if (resolved.absolutePath) return resolved.absolutePath;
  console.warn(
    '[analiseCnpjReceitaCartao] Arquivo do Cartão CNPJ não encontrado no mesmo armazenamento usado pelo Acervo:',
    doc.nome_original || doc.caminho_arquivo || doc.id,
  );
  return null;
}

function montarPromptCartaoCnpj() {
  return `Você é um auditor documental brasileiro especializado em Cartão CNPJ da Receita Federal.

Tarefa: leia o PDF/imagem anexado e EXTRAIA campos estruturados. NÃO diagnostique divergências e NÃO compare com a Receita. Divergências são calculadas somente pelo backend. A DATA DE EMISSÃO DO COMPROVANTE normalmente aparece no rodapé, em frase parecida com: "Emitido no dia DD/MM/AAAA às HH:MM:SS". NÃO confunda com DATA DE ABERTURA nem com DATA DA SITUAÇÃO CADASTRAL.

Responda SOMENTE JSON válido, sem markdown, sem comentários, com exatamente estas chaves:
{
  "documento_e_cartao_cnpj": true,
  "cnpj": "00.000.000/0000-00 ou null",
  "matriz_filial": "matriz|filial|null",
  "data_abertura": "YYYY-MM-DD ou null",
  "nome_empresarial": "texto ou null",
  "nome_fantasia": "texto ou null",
  "cnae_principal": "código - descrição ou null",
  "cnaes_secundarios": ["código - descrição"],
  "natureza_juridica": "código - descrição ou null",
  "porte": "texto ou null",
  "endereco_completo": "texto ou null",
  "cep": "00.000-000 ou null",
  "logradouro": "texto ou null",
  "numero": "texto ou null",
  "complemento": "texto ou null",
  "bairro": "texto ou null",
  "municipio": "texto ou null",
  "uf": "UF ou null",
  "situacao_cadastral": "texto ou null",
  "data_situacao_cadastral": "YYYY-MM-DD ou null",
  "email": "texto do campo ENDEREÇO ELETRÔNICO ou null",
  "telefone": "texto do campo TELEFONE ou null",
  "data_emissao": "YYYY-MM-DD ou null",
  "data_emissao_texto": "texto completo encontrado no rodapé ou null",
  "horario_emissao": "HH:MM:SS ou null",
  "confianca": 0.0
}

Regras:
- Se o arquivo não for Cartão CNPJ, use documento_e_cartao_cnpj=false.
- Se a data de emissão não estiver visível, data_emissao=null.
- Preserve números, códigos CNAE e natureza jurídica.
- Para endereço, extraia também os campos separados exatamente como aparecem no Cartão CNPJ: CEP, logradouro, número, complemento, bairro/distrito, município e UF.
- Não invente campos. Se não estiver visível, use null.
- Confianca deve ir de 0 a 1.`;
}

function adaptarExtracaoCartaoLocal(dados: Record<string, any>, confianca: number): ExtracaoCartao {
  return {
    cnpj: firstNonEmpty(dados.cnpj),
    matriz_filial: firstNonEmpty(dados.matriz_filial),
    data_abertura: parseDate(dados.data_abertura),
    nome_empresarial: firstNonEmpty(dados.nome_empresarial, dados.razao_social),
    nome_fantasia: firstNonEmpty(dados.nome_fantasia),
    cnae_principal: firstNonEmpty(dados.cnae_principal),
    natureza_juridica: firstNonEmpty(dados.natureza_juridica),
    porte: firstNonEmpty(dados.porte),
    endereco_completo: firstNonEmpty(dados.endereco_completo),
    cep: firstNonEmpty(dados.cep),
    logradouro: firstNonEmpty(dados.logradouro),
    numero: firstNonEmpty(dados.numero),
    complemento: firstNonEmpty(dados.complemento),
    bairro: firstNonEmpty(dados.bairro),
    municipio: firstNonEmpty(dados.municipio, dados.cidade),
    uf: firstNonEmpty(dados.uf),
    situacao_cadastral: firstNonEmpty(dados.situacao_cadastral),
    email: firstNonEmpty(dados.email),
    telefone: firstNonEmpty(dados.telefone),
    data_situacao_cadastral: parseDate(dados.data_situacao_cadastral),
    data_emissao: parseDate(dados.data_emissao),
    data_emissao_texto: firstNonEmpty(dados.data_emissao_texto),
    modelo: 'local:pdftotext-v1',
    fonte: 'local_deterministica',
    confianca: normalizarConfianca(confianca),
    raw_text: null,
  };
}

async function gerarGeminiCartao(modelName: string, doc: DocCartao, buffer: Buffer): Promise<ExtracaoCartao | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    } as any,
  });

  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 30000);
  const request = model.generateContent([
    { text: montarPromptCartaoCnpj() },
    { inlineData: { mimeType: inferirMimeDocumento(doc) || 'application/pdf', data: buffer.toString('base64') } },
  ] as any);

  const result = await Promise.race([
    request,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout Gemini após ${timeoutMs}ms`)), timeoutMs)),
  ]);

  const responseText = result.response.text();
  const json = extrairJson(responseText);
  if (!json || typeof json !== 'object') return null;

  return {
    cnpj: firstNonEmpty(json.cnpj, json.CNPJ),
    matriz_filial: firstNonEmpty(json.matriz_filial, json.matrizFilial),
    data_abertura: parseDate(json.data_abertura || json.dataAbertura),
    nome_empresarial: firstNonEmpty(json.nome_empresarial, json.razao_social, json.nomeEmpresarial),
    nome_fantasia: firstNonEmpty(json.nome_fantasia, json.nomeFantasia),
    cnae_principal: firstNonEmpty(json.cnae_principal, json.cnaePrincipal),
    natureza_juridica: firstNonEmpty(json.natureza_juridica, json.naturezaJuridica),
    porte: firstNonEmpty(json.porte),
    endereco_completo: firstNonEmpty(json.endereco_completo, json.endereco),
    cep: firstNonEmpty(json.cep),
    logradouro: firstNonEmpty(json.logradouro),
    numero: firstNonEmpty(json.numero),
    complemento: firstNonEmpty(json.complemento),
    bairro: firstNonEmpty(json.bairro, json.bairro_distrito, json.bairroDistrito),
    municipio: firstNonEmpty(json.municipio, json.cidade),
    uf: firstNonEmpty(json.uf),
    situacao_cadastral: firstNonEmpty(json.situacao_cadastral, json.situacaoCadastral),
    data_situacao_cadastral: parseDate(json.data_situacao_cadastral || json.dataSituacaoCadastral),
    email: firstNonEmpty(json.email, json.endereco_eletronico, json.enderecoEletronico)?.toLowerCase() || null,
    telefone: firstNonEmpty(json.telefone),
    data_emissao: parseDate(json.data_emissao || json.dataEmissao),
    data_emissao_texto: firstNonEmpty(json.data_emissao_texto, json.texto_emissao, json.emitido_no_dia),
    modelo: modelName,
    fonte: 'gemini_document_ocr',
    confianca: normalizarConfianca(json.confianca),
    raw_text: responseText,
  };
}

async function tentarExtrairCartaoComGemini(doc: DocCartao | null): Promise<ExtracaoCartao | null> {
  if (!doc) return null;
  if (!documentoSuportadoPorGemini(doc)) return null;

  const filePath = await resolverCaminhoDocumento(doc);
  if (!filePath) return null;

  let extracaoLocalParcial: ExtracaoCartao | null = null;

  try {
    const local = await extrairDocumentoLocal(filePath, inferirMimeDocumento(doc), 'cartao_cnpj');
    if (local.dados?.documento_compativel !== false && Object.keys(local.dados || {}).length > 0) {
      const extracaoLocal = adaptarExtracaoCartaoLocal(local.dados, local.confianca);
      if (extracaoTemQualidade(extracaoLocal)) return extracaoLocal;
      // Mesmo abaixo do limiar de confirmação automática, os campos lidos
      // localmente continuam úteis para diagnóstico/revisão e não devem ser
      // descartados só porque o fallback externo está desligado.
      extracaoLocalParcial = extracaoLocal;
    }
  } catch (error: any) {
    console.warn('[analiseCnpjReceitaCartao] Extração local do Cartão CNPJ falhou de forma controlada:', error?.message || error);
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiOcrEnabled() || !apiKey) return extracaoLocalParcial;

  try {
    const buffer = await fs.readFile(filePath);
    const maxBytes = Number(process.env.GEMINI_MAX_INLINE_BYTES || 20 * 1024 * 1024);
    if (buffer.length > maxBytes) {
      console.warn('[analiseCnpjReceitaCartao] Cartão CNPJ acima do limite para IA/OCR:', buffer.length);
      return null;
    }

    const principal = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const fallback = process.env.GEMINI_MODEL_FALLBACK || 'gemini-2.5-pro';
    const modelos = Array.from(new Set([principal, fallback].filter(Boolean)));

    let ultimaExtracao: ExtracaoCartao | null = null;
    let ultimoErro: unknown = null;

    for (const modelName of modelos) {
      try {
        const extracao = await gerarGeminiCartao(modelName, doc, buffer);
        if (extracao) ultimaExtracao = extracao;
        if (extracaoTemQualidade(extracao)) return extracao;
        console.warn('[analiseCnpjReceitaCartao] Extração Gemini incompleta/baixa confiança, tentando fallback se disponível:', modelName, extracao?.confianca, {
          cnpj: !!extracao?.cnpj,
          data_abertura: !!extracao?.data_abertura,
          data_emissao: !!extracao?.data_emissao,
          situacao: !!extracao?.situacao_cadastral,
        });
      } catch (err) {
        ultimoErro = err;
        console.warn('[analiseCnpjReceitaCartao] Falha no Gemini com modelo:', modelName, (err as any)?.message || err);
      }
    }

    if (ultimaExtracao) return ultimaExtracao;
    if (extracaoLocalParcial) return extracaoLocalParcial;
    if (ultimoErro) throw ultimoErro;
    return extracaoLocalParcial;
  } catch (err) {
    console.warn('[analiseCnpjReceitaCartao] Gemini não conseguiu extrair Cartão CNPJ:', (err as any)?.message || err);
    return extracaoLocalParcial;
  }
}

async function buscarEmpresa(empresaId: string) {
  const { rows } = await pool.query('SELECT * FROM public.empresas WHERE id = $1 LIMIT 1', [empresaId]);
  return rows[0] || null;
}

async function buscarSocios(empresaId: string) {
  const exists = await tableExists('socios_empresa');
  if (!exists) return [];
  const { rows } = await pool.query('SELECT * FROM public.socios_empresa WHERE empresa_id = $1 ORDER BY COALESCE(nome, \'\') ASC', [empresaId]);
  return rows;
}

async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = $1 LIMIT 1', [tableName]);
  return rows.length > 0;
}

// AUTO-CREATE idempotente: garante a tabela de análises de CNPJ antes de qualquer
// INSERT, sem depender de migration manual ter sido executada em produção. Mesmo
// schema da migration 062 (idempotente, pode ser chamada quantas vezes for preciso).
let analisesCnpjSchemaReady = false;
async function ensureAnalisesCnpjSchema(): Promise<void> {
  if (analisesCnpjSchemaReady) return;
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`CREATE TABLE IF NOT EXISTS public.analises_cnpj_empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cartao_cnpj_arquivo_id UUID NULL REFERENCES public.documentos_arquivos(id) ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'concluida',
    score_cnpj INTEGER NOT NULL DEFAULT 0,
    risco_cnpj TEXT NOT NULL DEFAULT 'nao_calculado',

    cnpj TEXT NULL,
    matriz_filial TEXT NULL,
    data_abertura DATE NULL,
    idade_meses INTEGER NULL,
    tempo_abertura_descricao TEXT NULL,
    alerta_menos_12_meses BOOLEAN NOT NULL DEFAULT false,
    alerta_mais_36_meses BOOLEAN NOT NULL DEFAULT false,

    situacao_cadastral TEXT NULL,
    risco_situacao TEXT NULL,
    cnae_principal TEXT NULL,
    natureza_juridica TEXT NULL,
    porte TEXT NULL,
    capital_social NUMERIC NULL,

    data_emissao_cartao DATE NULL,
    dias_emissao_cartao INTEGER NULL,
    status_validade_cartao TEXT NOT NULL DEFAULT 'nao_verificado',
    cartao_pendente_ocr BOOLEAN NOT NULL DEFAULT false,
    cartao_anexado BOOLEAN NOT NULL DEFAULT false,

    campos_receita JSONB NOT NULL DEFAULT '{}'::jsonb,
    campos_cartao JSONB NOT NULL DEFAULT '{}'::jsonb,
    comparacao JSONB NOT NULL DEFAULT '{}'::jsonb,
    divergencias JSONB NOT NULL DEFAULT '[]'::jsonb,
    alertas JSONB NOT NULL DEFAULT '[]'::jsonb,
    pontos_positivos JSONB NOT NULL DEFAULT '[]'::jsonb,
    pontos_atencao JSONB NOT NULL DEFAULT '[]'::jsonb,
    pontos_impeditivos JSONB NOT NULL DEFAULT '[]'::jsonb,
    recomendacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
    diagnostico TEXT NULL,
    resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
    fonte_receita TEXT NULL,

    criado_por UUID NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`DO $$ BEGIN
    ALTER TABLE public.analises_cnpj_empresa ADD CONSTRAINT analises_cnpj_empresa_status_chk CHECK (status IN ('concluida','pendente_documento','pendente_ocr','revisao_humana','falhou'));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await pool.query(`DO $$ BEGIN
    ALTER TABLE public.analises_cnpj_empresa ADD CONSTRAINT analises_cnpj_empresa_risco_chk CHECK (risco_cnpj IN ('baixo','medio','alto','critico','nao_calculado'));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await pool.query(`DO $$ BEGIN
    ALTER TABLE public.analises_cnpj_empresa ADD CONSTRAINT analises_cnpj_empresa_validade_chk CHECK (status_validade_cartao IN ('valido','vencido','pendente','nao_verificado','divergente','ilegivel'));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_analises_cnpj_empresa_empresa_id ON public.analises_cnpj_empresa (empresa_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_analises_cnpj_empresa_criado_em ON public.analises_cnpj_empresa (criado_em DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_analises_cnpj_empresa_score ON public.analises_cnpj_empresa (score_cnpj)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_analises_cnpj_empresa_resultado_gin ON public.analises_cnpj_empresa USING GIN (resultado)');
  analisesCnpjSchemaReady = true;
}

// Remove (de forma definitiva, pois são apenas resultados derivados e recalculáveis
// pela IA — não dados primários do cliente) o histórico de análises de CNPJ de uma
// empresa, permitindo "limpar a análise da IA" e gerar um laudo novo do zero.
export async function limparAnalisesCnpjEmpresa(empresaId: string): Promise<number> {
  const exists = await tableExists('analises_cnpj_empresa');
  if (!exists) return 0;
  const { rowCount } = await pool.query('DELETE FROM public.analises_cnpj_empresa WHERE empresa_id = $1', [empresaId]);
  return rowCount || 0;
}

async function buscarUltimoCartaoCnpj(empresaId: string, overrideArquivoId?: string): Promise<DocCartao | null> {
  if (overrideArquivoId) {
    const { rows } = await pool.query(
      `SELECT id, entidade_tipo, entidade_id, empresa_id, nome_original, nome_arquivo, hash_arquivo, mime_type, caminho_arquivo, data_emissao_documento, status_validade, resultado_validacao, criado_em
         FROM public.documentos_arquivos
        WHERE id = $1
          AND (empresa_id = $2 OR (entidade_tipo = 'empresa' AND entidade_id = $2))
          AND excluido_em IS NULL
        LIMIT 1`,
      [overrideArquivoId, empresaId],
    );
    if (rows[0]) return rows[0];
  }

  // Fonte principal: acervo documental novo. Aceita sinônimos porque versões
  // anteriores/classificação IA usavam "cnpj_cartao".
  const existsCentral = await tableExists('documentos_arquivos');
  if (existsCentral) {
    const { rows } = await pool.query(
      `SELECT id, entidade_tipo, entidade_id, empresa_id, nome_original, nome_arquivo, hash_arquivo, mime_type, caminho_arquivo, data_emissao_documento, status_validade, resultado_validacao, criado_em
         FROM public.documentos_arquivos
        WHERE (empresa_id = $1 OR (entidade_tipo = 'empresa' AND entidade_id = $1))
          AND (tipo_documento IN ('cartao_cnpj','cnpj_cartao')
               OR lower(COALESCE(nome_original, '')) LIKE '%cartao%cnpj%'
               OR lower(COALESCE(nome_original, '')) LIKE '%comprovante%inscricao%'
               OR lower(COALESCE(nome_original, '')) LIKE '%receita%')
          AND excluido_em IS NULL
          AND COALESCE(status, 'ativo') <> 'excluido'
          AND COALESCE(metadados->>'coleta_status', '') <> 'staging'
        ORDER BY
          CASE WHEN tipo_documento IN ('cartao_cnpj','cnpj_cartao') THEN 0 ELSE 1 END,
          criado_em DESC
        LIMIT 1`,
      [empresaId]
    );
    if (rows[0]) return rows[0];
  }

  // Fallback legado: documentos antigos anexados na aba antiga de empresas
  // ficavam em empresa_documentos e por isso a sincronização não encontrava o
  // Cartão CNPJ oficial, caindo em APIs cacheadas/desatualizadas.
  const existsLegacy = await tableExists('empresa_documentos');
  if (existsLegacy) {
    const { rows } = await pool.query(
      `SELECT id,
              nome AS nome_original,
              CASE
                WHEN lower(COALESCE(nome, url, '')) LIKE '%.pdf%' THEN 'application/pdf'
                WHEN lower(COALESCE(nome, url, '')) LIKE '%.png%' THEN 'image/png'
                WHEN lower(COALESCE(nome, url, '')) LIKE '%.webp%' THEN 'image/webp'
                WHEN lower(COALESCE(nome, url, '')) LIKE '%.jpg%' OR lower(COALESCE(nome, url, '')) LIKE '%.jpeg%' THEN 'image/jpeg'
                ELSE NULL
              END AS mime_type,
              url AS caminho_arquivo,
              NULL::date AS data_emissao_documento,
              NULL::text AS status_validade,
              NULL::jsonb AS resultado_validacao,
              created_at AS criado_em
         FROM public.empresa_documentos
        WHERE empresa_id = $1
          AND (tipo IN ('cartao_cnpj','cnpj_cartao')
               OR lower(COALESCE(nome, '')) LIKE '%cartao%cnpj%'
               OR lower(COALESCE(nome, '')) LIKE '%comprovante%inscricao%'
               OR lower(COALESCE(nome, '')) LIKE '%receita%')
        ORDER BY created_at DESC
        LIMIT 1`,
      [empresaId]
    );
    if (rows[0]) return rows[0];
  }

  return null;
}


// Usado pela sincronização cadastral da empresa: quando existe Cartão CNPJ oficial
// anexado, a leitura OCR/IA do documento oficial deve prevalecer sobre APIs gratuitas
// cacheadas/desatualizadas como BrasilAPI/OpenCNPJ.
export async function extrairCamposUltimoCartaoCnpjEmpresa(empresaId: string): Promise<{ cartao: DocCartao | null; extracao: ExtracaoCartao | null }> {
  const cartao = await buscarUltimoCartaoCnpj(empresaId);
  const extracao = await tentarExtrairCartaoComGemini(cartao);
  return { cartao, extracao };
}

function classificarSituacao(situacao: unknown): { risco: string; alerta?: AlertaAnalise } {
  const s = normalizeText(situacao);
  if (!s) return { risco: 'medio', alerta: { codigo: 'situacao_cadastral_ausente', mensagem: 'Situação cadastral não informada na Receita.', severidade: 'media', recomendacao: 'Atualizar dados da Receita antes de avançar.' } };
  if (isSituacaoAtiva(situacao)) return { risco: 'baixo' };
  if (isSituacaoIrregular(situacao)) return { risco: 'critico', alerta: { codigo: 'situacao_cadastral_impeditiva', mensagem: `Situação cadastral impeditiva: ${situacao}.`, severidade: 'critica', recomendacao: 'Não enviar ao banco antes de regularizar a situação cadastral.' } };
  return { risco: 'alto', alerta: { codigo: 'situacao_cadastral_atencao', mensagem: `Situação cadastral requer atenção: ${situacao}.`, severidade: 'alta', recomendacao: 'Validar situação cadastral antes de seguir.' } };
}

export function calcularScore(input: { camposReceita: any; cartao: DocCartao | null; extracao: ExtracaoCartao | null; divergencias: any[]; alertas: AlertaAnalise[]; socios: any[] }) {
  let score = 100;
  if (!input.camposReceita.cnpj_limpo || input.camposReceita.cnpj_limpo.length !== 14) score -= 25;
  if (!input.camposReceita.nome_empresarial) score -= 10;
  if (!input.camposReceita.data_abertura) score -= 10;
  if (!input.camposReceita.cnae_principal) score -= 8;
  if (!input.camposReceita.natureza_juridica) score -= 6;
  if (!input.camposReceita.situacao_cadastral) score -= 10;
  if (isSituacaoIrregular(input.camposReceita.situacao_cadastral)) score -= 35;
  if ((input.camposReceita.idade_meses ?? 999) < 12) score -= 15;
  if (!input.cartao) score -= 10;
  if (input.cartao && !input.extracao && !input.cartao.data_emissao_documento) {
    score -= 5;
    input.alertas.push({
      codigo: 'cartao_cnpj_extracao_falhou',
      mensagem: 'Não foi possível ler os dados do Cartão CNPJ automaticamente, e não há data de emissão informada manualmente.',
      severidade: 'media',
      recomendacao: 'Revisar manualmente o Cartão CNPJ antes de aprovar — a leitura automática falhou e o documento não foi conferido.',
    });
  }
  if (input.divergencias.length) score -= Math.min(30, input.divergencias.length * 10);
  if (input.alertas.some((a) => a.severidade === 'critica')) score -= 25;
  if (input.alertas.some((a) => a.codigo === 'cartao_cnpj_vencido')) score -= 10;
  if (!input.socios.length) score -= 10;
  score = Math.max(0, Math.min(100, score));
  const risco = score >= 80 ? 'baixo' : score >= 60 ? 'medio' : score >= 40 ? 'alto' : 'critico';
  return { score, risco };
}

function sanitizarAnaliseCnpjPersistida(row: any) {
  if (!row || typeof row !== 'object') return row;
  const camposReceita = row.campos_receita && typeof row.campos_receita === 'object' ? row.campos_receita : {};
  const camposCartao = row.campos_cartao && typeof row.campos_cartao === 'object' ? row.campos_cartao : {};
  const comparacaoEndereco = compararCampo(
    'Endereço completo',
    camposReceita.endereco_completo,
    camposCartao.endereco_completo,
    'endereco',
  );

  // Corrige também laudos já persistidos antes deste fix. Se o registro antigo
  // marcou endereço como divergente apenas porque o OCR misturou cabeçalhos/CNPJ,
  // a leitura da análise deixa de reutilizar esse falso positivo imediatamente,
  // sem apagar histórico ou exigir migration.
  if (comparacaoEndereco.divergente) return row;

  const removerEndereco = (items: any[]) => (Array.isArray(items) ? items : []).filter((item: any) => {
    const codigo = String(item?.codigo || '').toLowerCase();
    const campo = String(item?.campo || '').toLowerCase();
    return codigo !== 'divergencia_endereco_completo' && campo !== 'endereco_completo';
  });
  const resultadoAtual = row.resultado && typeof row.resultado === 'object' ? row.resultado : {};
  const comparacaoAtual = row.comparacao && typeof row.comparacao === 'object' ? row.comparacao : {};
  const comparacaoResultado = resultadoAtual.comparacao && typeof resultadoAtual.comparacao === 'object'
    ? resultadoAtual.comparacao
    : comparacaoAtual;

  const divergencias = removerEndereco(row.divergencias);
  const alertas = removerEndereco(row.alertas);
  return {
    ...row,
    comparacao: { ...comparacaoAtual, endereco_completo: comparacaoEndereco },
    divergencias,
    alertas,
    resultado: {
      ...resultadoAtual,
      comparacao: { ...comparacaoResultado, endereco_completo: comparacaoEndereco },
      divergencias: removerEndereco(resultadoAtual.divergencias),
      alertas: removerEndereco(resultadoAtual.alertas),
    },
  };
}

export type ResultadoConfirmacaoCadastralDocumento = {
  aplicado: boolean;
  motivo: string;
  situacaoAnterior?: string | null;
  situacaoAtual?: string | null;
};

/**
 * Decide (sem tocar banco/rede) se a leitura do Cartão CNPJ deve confirmar e
 * travar a situação cadastral da empresa contra a sincronização automática.
 * Extraída como função pura -- mesmo padrão já usado em `precisaSincronizar`
 * (`sincronizacaoReceitaAutomaticaService.ts`) -- para ser diretamente
 * testável sem precisar simular banco de dados.
 *
 * Regra geral, sem nenhuma condição específica a uma empresa/regime/porte:
 * só autoriza quando (a) existe Cartão CNPJ anexado, (b) a leitura teve
 * qualidade mínima confirmada -- não é um resultado degradado de fallback --,
 * (c) o documento mostra a empresa ATIVA (pedido explícito do usuário: "se o
 * status da situação estiver apta... vai alterar no cadastro"), e (d) o
 * documento está dentro do prazo de validade documental de 30 dias já usado
 * no resto da análise, contado a partir da data de emissão/consulta impressa
 * no rodapé do Cartão CNPJ ("Emitido no dia... às...") -- NUNCA a partir da
 * data de abertura da empresa, que é permanente e não indica atualidade.
 *
 * CORREÇÃO (Rodada 22, 02/09/2026, pedido explícito do usuário: "coloque
 * como regra que o documento para atualização dos dados não pode ter mais de
 * 5 dias da consulta e emissão, isso é só se a empresa tiver alterações e a
 * API da Receita ainda não estiver atualizada; caso contrário deixo os dados
 * como está"): quando o documento efetivamente CORRIGE a situação cadastral
 * gravada (ou seja, a API gratuita da Receita ainda não refletiu a mudança
 * que o Cartão CNPJ já mostra), a janela de 30 dias acima -- pensada para a
 * análise documental em geral -- é permissiva demais para uma correção
 * automática de cadastro; nesse caso específico, o documento precisa ter
 * sido emitido há no máximo 5 dias contados da consulta/leitura atual. Se a
 * situação do documento já é a mesma que já está gravada (nada para
 * corrigir -- a API já está atualizada), o cadastro "fica como está" de
 * qualquer forma (é um no-op) e a janela de 30 dias já existente continua
 * suficiente para apenas travar contra a sincronização automática. Regra
 * geral: não depende de qual seja a situação, só do fato objetivo de haver
 * (ou não) uma divergência a corrigir.
 *
 * CORREÇÃO (Rodada 22, mesma mensagem, "depois de atualizar manualmente
 * dados de contato e informações, não alterar automaticamente de forma
 * alguma"): se o colaborador já editou manualmente a situação cadastral
 * (`campoFoiEditadoManualmente`, ver `edicaoManualCamposEmpresa.ts`), a
 * leitura automática do documento nunca mais sobrescreve esse campo.
 */
export function deveConfirmarSituacaoCadastralViaCartao(args: {
  cartao: DocCartao | null;
  camposCartao: ExtracaoCartao | null;
  extracaoGemini: ExtracaoCartao | null;
  statusValidadeCartao: string;
  situacaoAtualEmpresa?: string | null;
  diasEmissaoCartao?: number | null;
  situacaoEditadaManualmente?: boolean;
}): { pode: boolean; motivo: string } {
  const { cartao, camposCartao, extracaoGemini, statusValidadeCartao, situacaoAtualEmpresa, diasEmissaoCartao, situacaoEditadaManualmente } = args;
  if (!cartao) return { pode: false, motivo: 'sem_cartao_cnpj_anexado' };
  if (situacaoEditadaManualmente) return { pode: false, motivo: 'situacao_cadastral_editada_manualmente_pelo_usuario' };
  if (!camposCartao?.situacao_cadastral) return { pode: false, motivo: 'situacao_nao_extraida_do_documento' };
  if (!isSituacaoAtiva(camposCartao.situacao_cadastral)) return { pode: false, motivo: 'documento_nao_confirma_situacao_ativa' };
  if (statusValidadeCartao !== 'valido') return { pode: false, motivo: 'cartao_cnpj_fora_do_prazo_de_validade_documental' };
  if (!extracaoTemQualidade(extracaoGemini)) return { pode: false, motivo: 'leitura_do_documento_sem_qualidade_minima_confirmada' };

  const haCorrecaoPendente = !!situacaoAtualEmpresa
    && normalizarSituacaoCadastral(situacaoAtualEmpresa) !== normalizarSituacaoCadastral(camposCartao.situacao_cadastral);
  if (haCorrecaoPendente) {
    const documentoRecenteOSuficiente = typeof diasEmissaoCartao === 'number' && diasEmissaoCartao <= 5;
    if (!documentoRecenteOSuficiente) return { pode: false, motivo: 'correcao_cadastral_exige_documento_emitido_ha_no_maximo_5_dias' };
  }
  return { pode: true, motivo: haCorrecaoPendente ? 'correcao_cadastral_aplicada_com_documento_recente' : 'documento_ativo_valido_e_com_qualidade_confirmada' };
}

/**
 * CORREÇÃO (Rodada 20, 2026-09-02, pedido explícito do usuário -- "quando
 * colocar o cartão do CNPJ, ele vai ler o cartão do CNPJ e se o status da
 * situação estiver apta... vai alterar no cadastro da empresa... e não vai
 * sincronizar automaticamente alterando novamente pra inapta"): quando
 * `deveConfirmarSituacaoCadastralViaCartao` autoriza, esta função grava a
 * confirmação em `empresas.situacao_cadastral`/`data_situacao_cadastral` e
 * registra um selo em `dados_extra_receita`
 * (`../utils/confirmacaoCadastralDocumento`) que a sincronização automática
 * com as APIs gratuitas passa a respeitar
 * (`sincronizacaoReceitaAutomaticaService.ts`), parando de reverter o valor
 * para uma leitura potencialmente desatualizada (até 45 dias de atraso
 * documentado nas fontes gratuitas). Fora dos quatro requisitos da função de
 * decisão, esta função é um no-op seguro: nenhuma outra situação cadastral
 * lida do documento é gravada automaticamente nesta correção, por não ter
 * sido pedida e para manter o escopo cirúrgico. Nunca lança -- uma falha
 * aqui não pode derrubar a análise documental que já foi calculada e
 * persistida.
 */
export async function aplicarConfirmacaoCadastralDocumentoEmpresa(args: {
  empresaId: string;
  empresaAtual: any;
  cartao: DocCartao | null;
  camposCartao: ExtracaoCartao;
  extracaoGemini: ExtracaoCartao | null;
  dataEmissaoCartao: string | null;
  diasEmissaoCartao: number | null;
  statusValidadeCartao: string;
}): Promise<ResultadoConfirmacaoCadastralDocumento> {
  const { empresaId, empresaAtual, cartao, camposCartao, extracaoGemini, dataEmissaoCartao, diasEmissaoCartao, statusValidadeCartao } = args;

  const decisao = deveConfirmarSituacaoCadastralViaCartao({
    cartao,
    camposCartao,
    extracaoGemini,
    statusValidadeCartao,
    situacaoAtualEmpresa: empresaAtual?.situacao_cadastral ?? null,
    diasEmissaoCartao,
    situacaoEditadaManualmente: campoFoiEditadoManualmente(empresaAtual?.dados_extra_receita, 'situacao_cadastral'),
  });
  const situacaoCadastralConfirmada = camposCartao?.situacao_cadastral;
  if (!decisao.pode || !cartao || !situacaoCadastralConfirmada) return { aplicado: false, motivo: decisao.motivo };

  try {
    const colunas = await colunasDaTabela(pool, 'empresas');
    if (!colunas.has('situacao_cadastral')) return { aplicado: false, motivo: 'coluna_situacao_cadastral_ausente' };

    const assignments: string[] = [];
    const values: unknown[] = [empresaId];

    values.push(situacaoCadastralConfirmada);
    assignments.push(`"situacao_cadastral" = $${values.length}`);

    const dataSituacaoDocumento = parseDate(camposCartao.data_situacao_cadastral) || dataEmissaoCartao;
    if (colunas.has('data_situacao_cadastral') && dataSituacaoDocumento) {
      values.push(dataSituacaoDocumento);
      assignments.push(`"data_situacao_cadastral" = $${values.length}`);
    }

    if (colunas.has('dados_extra_receita')) {
      const patch = montarPatchConfirmacaoCadastralDocumento({
        situacaoCadastral: situacaoCadastralConfirmada,
        cartaoCnpjArquivoId: cartao.id,
        dataEmissaoCartao,
        diasEmissaoCartao,
      });
      values.push(JSON.stringify(patch));
      assignments.push(`"dados_extra_receita" = COALESCE("dados_extra_receita", '{}'::jsonb) || $${values.length}::jsonb`);
    }

    if (colunas.has('updated_at')) assignments.push('"updated_at" = NOW()');

    const { rows } = await pool.query(
      `UPDATE public.empresas SET ${assignments.join(', ')} WHERE id = $1 RETURNING situacao_cadastral`,
      values,
    );

    const situacaoAnterior = empresaAtual?.situacao_cadastral ?? null;
    const situacaoAtual = rows[0]?.situacao_cadastral ?? situacaoCadastralConfirmada;
    const mudou = normalizarSituacaoCadastral(situacaoAnterior) !== normalizarSituacaoCadastral(situacaoAtual);

    if (mudou) {
      await registrarHistoricoSincronizacaoSeguro(
        pool,
        empresaId,
        `Leitura do Cartão CNPJ anexado confirmou a situação cadastral ATIVA e corrigiu o cadastro: "${situacaoAnterior || 'não informada'}" -> "${situacaoAtual || 'não informada'}". Esse valor não será mais revertido automaticamente pela sincronização com as APIs gratuitas.`,
      );
    }

    return {
      aplicado: true,
      motivo: mudou ? 'situacao_corrigida_e_travada' : 'situacao_ja_ativa_travada_contra_sincronizacao_automatica',
      situacaoAnterior,
      situacaoAtual,
    };
  } catch (error: any) {
    console.warn('[analiseCnpjReceitaCartao] Falha ao aplicar confirmação cadastral via Cartão CNPJ (best-effort, não interrompe a análise):', error?.message || error);
    return { aplicado: false, motivo: 'erro_ao_gravar_confirmacao' };
  }
}

export type ResultadoConfirmacaoNomeEmpresarialDocumento = {
  aplicado: boolean;
  motivo: string;
  nomeAnterior?: string | null;
  nomeAtual?: string | null;
};

/**
 * CORREÇÃO (Rodada 26, 02/09/2026, pedido explícito do usuário, sobre um
 * segundo caso concreto -- Cartão CNPJ mostrando "OFICINA DA BELEZA LTDA"
 * para uma empresa cadastrada como "43.843.322 ANA AMELIA DA SILVA
 * FREITAS": "esse caso é igual [ao da situação cadastral], os dados da
 * receita vêm desatualizado pela api, e o cartão anexado tá certo, tem que
 * atualizar os dados faltantes automático e aparecer no modal a análise"):
 * mesmo padrão de `deveConfirmarSituacaoCadastralViaCartao` (Rodada 20),
 * agora para o NOME EMPRESARIAL -- quando o Cartão CNPJ oficial mostra um
 * nome empresarial genuinamente diferente do que está sincronizado (depois
 * de `normalizarNomeEmpresarial` já ter removido diferenças de
 * formatação/radical de CNPJ/CPF -- ou seja, uma divergência REAL, não um
 * falso positivo dos já cobertos pelas Rodadas 21/22), o cadastro é
 * corrigido automaticamente. Mesmos quatro requisitos objetivos do padrão já
 * estabelecido: (a) Cartão CNPJ anexado; (b) leitura com qualidade mínima
 * confirmada; (c) documento dentro do prazo de validade documental de 30
 * dias; e (d) quando há uma correção de fato pendente (nome divergente),
 * documento emitido há no máximo 5 dias -- para não deixar um Cartão CNPJ
 * antigo, ele mesmo desatualizado, substituir um nome já correto por um nome
 * antigo. Sem exigir situação ATIVA (o nome empresarial impresso no Cartão
 * CNPJ vale independentemente da situação cadastral da empresa). Se o
 * colaborador já editou manualmente a razão social
 * (`campoFoiEditadoManualmente(..., 'razao_social')`), a leitura automática
 * nunca mais sobrescreve esse campo -- mesma trava da Rodada 22, agora
 * também aplicada a este campo (`edicaoManualCamposEmpresa.ts`).
 *
 * Regra geral, válida para qualquer empresa/regime/porte -- nunca
 * condicionada a nenhum nome/CNPJ específico: a decisão depende só de fatos
 * objetivos sobre o documento e a comparação normalizada dos dois nomes.
 *
 * TRAVA DE SEGURANÇA ADICIONAL (mesmo CNPJ exigido): um nome divergente
 * sozinho não distingue "esta empresa mudou de razão social e a API
 * gratuita ainda não atualizou" de "foi anexado por engano o Cartão CNPJ de
 * OUTRA empresa". Os dois números de CNPJ (cadastro e documento), quando
 * ambos legíveis, precisam ser o MESMO número -- se divergirem, isso é sinal
 * objetivo de que o documento é de uma empresa diferente, e a correção de
 * nome não é aplicada (a divergência de CNPJ já é sinalizada separadamente,
 * sem alteração desta rodada). Quando o CNPJ do documento não pôde ser lido,
 * a correção segue os demais requisitos normalmente -- não é razoável exigir
 * um dado que o documento não forneceu.
 */
export function deveConfirmarNomeEmpresarialViaCartao(args: {
  cartao: DocCartao | null;
  camposCartao: ExtracaoCartao | null;
  extracaoGemini: ExtracaoCartao | null;
  statusValidadeCartao: string;
  razaoSocialAtualEmpresa?: string | null;
  diasEmissaoCartao?: number | null;
  nomeEditadoManualmente?: boolean;
  cnpjEmpresaLimpo?: string | null;
  cnpjCartaoLimpo?: string | null;
}): { pode: boolean; motivo: string } {
  const { cartao, camposCartao, extracaoGemini, statusValidadeCartao, razaoSocialAtualEmpresa, diasEmissaoCartao, nomeEditadoManualmente, cnpjEmpresaLimpo, cnpjCartaoLimpo } = args;
  if (!cartao) return { pode: false, motivo: 'sem_cartao_cnpj_anexado' };
  if (nomeEditadoManualmente) return { pode: false, motivo: 'razao_social_editada_manualmente_pelo_usuario' };
  if (!camposCartao?.nome_empresarial) return { pode: false, motivo: 'nome_empresarial_nao_extraido_do_documento' };
  if (statusValidadeCartao !== 'valido') return { pode: false, motivo: 'cartao_cnpj_fora_do_prazo_de_validade_documental' };
  if (!extracaoTemQualidade(extracaoGemini)) return { pode: false, motivo: 'leitura_do_documento_sem_qualidade_minima_confirmada' };
  if (cnpjEmpresaLimpo && cnpjCartaoLimpo && cnpjEmpresaLimpo !== cnpjCartaoLimpo) {
    return { pode: false, motivo: 'cnpj_do_documento_diverge_do_cadastro_provavel_empresa_diferente' };
  }

  const haCorrecaoPendente = !!razaoSocialAtualEmpresa
    && normalizarNomeEmpresarial(razaoSocialAtualEmpresa) !== normalizarNomeEmpresarial(camposCartao.nome_empresarial);
  if (haCorrecaoPendente) {
    const documentoRecenteOSuficiente = typeof diasEmissaoCartao === 'number' && diasEmissaoCartao <= 5;
    if (!documentoRecenteOSuficiente) return { pode: false, motivo: 'correcao_de_nome_exige_documento_emitido_ha_no_maximo_5_dias' };
  }
  return { pode: true, motivo: haCorrecaoPendente ? 'correcao_de_nome_aplicada_com_documento_recente' : 'nome_ja_confere_documento_valido_e_com_qualidade_confirmada' };
}

/**
 * Quando `deveConfirmarNomeEmpresarialViaCartao` autoriza, grava
 * `empresas.razao_social` com o nome lido no Cartão CNPJ e registra o evento
 * em `empresa_historico` quando o valor de fato mudou. Diferente da
 * confirmação de situação cadastral (Rodada 20), NÃO precisa de nenhum selo
 * de trava contra a sincronização automática com as APIs gratuitas: essa
 * sincronização (`sincronizacaoReceitaAutomaticaService.ts`,
 * `montarCamposRegistroReceita`) nunca escreve `razao_social` -- confirmado
 * por leitura direta do código --, então não há nenhum job em segundo plano
 * que possa reverter esta correção. Nunca lança -- uma falha aqui não pode
 * derrubar a análise documental já calculada e persistida.
 */
export async function aplicarConfirmacaoNomeEmpresarialDocumentoEmpresa(args: {
  empresaId: string;
  empresaAtual: any;
  cartao: DocCartao | null;
  camposCartao: ExtracaoCartao;
  extracaoGemini: ExtracaoCartao | null;
  dataEmissaoCartao: string | null;
  diasEmissaoCartao: number | null;
  statusValidadeCartao: string;
}): Promise<ResultadoConfirmacaoNomeEmpresarialDocumento> {
  const { empresaId, empresaAtual, cartao, camposCartao, extracaoGemini, diasEmissaoCartao, statusValidadeCartao } = args;

  const decisao = deveConfirmarNomeEmpresarialViaCartao({
    cartao,
    camposCartao,
    extracaoGemini,
    statusValidadeCartao,
    razaoSocialAtualEmpresa: empresaAtual?.razao_social ?? null,
    diasEmissaoCartao,
    nomeEditadoManualmente: campoFoiEditadoManualmente(empresaAtual?.dados_extra_receita, 'razao_social'),
    cnpjEmpresaLimpo: onlyDigits(empresaAtual?.cnpj) || null,
    cnpjCartaoLimpo: onlyDigits(camposCartao?.cnpj) || null,
  });
  const nomeEmpresarialConfirmado = camposCartao?.nome_empresarial;
  if (!decisao.pode || !cartao || !nomeEmpresarialConfirmado) return { aplicado: false, motivo: decisao.motivo };

  // No-op idempotente: o nome já confere (normalizado) -- nada a gravar/registrar.
  if (empresaAtual?.razao_social
    && normalizarNomeEmpresarial(empresaAtual.razao_social) === normalizarNomeEmpresarial(nomeEmpresarialConfirmado)) {
    return { aplicado: true, motivo: 'nome_ja_correto', nomeAnterior: empresaAtual.razao_social, nomeAtual: empresaAtual.razao_social };
  }

  try {
    const colunas = await colunasDaTabela(pool, 'empresas');
    if (!colunas.has('razao_social')) return { aplicado: false, motivo: 'coluna_razao_social_ausente' };

    const assignments: string[] = [];
    const values: unknown[] = [empresaId];

    values.push(nomeEmpresarialConfirmado);
    assignments.push(`"razao_social" = $${values.length}`);
    if (colunas.has('updated_at')) assignments.push('"updated_at" = NOW()');

    const { rows } = await pool.query(
      `UPDATE public.empresas SET ${assignments.join(', ')} WHERE id = $1 RETURNING razao_social`,
      values,
    );

    const nomeAnterior = empresaAtual?.razao_social ?? null;
    const nomeAtual = rows[0]?.razao_social ?? nomeEmpresarialConfirmado;

    await registrarHistoricoSincronizacaoSeguro(
      pool,
      empresaId,
      `Leitura do Cartão CNPJ anexado corrigiu o nome empresarial (a API gratuita da Receita ainda não tinha refletido a atualização): "${nomeAnterior || 'não informado'}" -> "${nomeAtual}".`,
    );

    return { aplicado: true, motivo: 'nome_empresarial_corrigido', nomeAnterior, nomeAtual };
  } catch (error: any) {
    console.warn('[analiseCnpjReceitaCartao] Falha ao aplicar confirmação de nome empresarial via Cartão CNPJ (best-effort, não interrompe a análise):', error?.message || error);
    return { aplicado: false, motivo: 'erro_ao_gravar_confirmacao' };
  }
}

export type ResultadoAtualizacaoContatoDocumento = {
  aplicado: boolean;
  motivo: string;
  telefoneAtualizado?: boolean;
  emailAtualizado?: boolean;
};

/**
 * CORREÇÃO (Rodada 21, 02/09/2026, pedido explícito do usuário -- "quando ler
 * o cartão do cnpj e ver [...] se a emissão dele foi recente e puxar os dados
 * [...] se tiver telefone atualizado, pegar o email e já atualizar
 * automaticamente na [...] parte da receita. Substituir e não sincronizar e
 * mudar automático"): decide (sem tocar banco/rede) se a leitura do Cartão
 * CNPJ deve atualizar telefone/e-mail da empresa. Mesmo padrão de qualidade e
 * validade documental de `deveConfirmarSituacaoCadastralViaCartao` -- só que
 * sem exigir situação ATIVA, porque o contato impresso no documento é válido
 * independentemente da situação cadastral da empresa. Regra geral, sem
 * condição específica de nenhuma empresa/regime/porte.
 */
export function deveAtualizarContatoViaCartao(args: {
  cartao: DocCartao | null;
  camposCartao: ExtracaoCartao | null;
  extracaoGemini: ExtracaoCartao | null;
  statusValidadeCartao: string;
}): { pode: boolean; motivo: string } {
  const { cartao, camposCartao, extracaoGemini, statusValidadeCartao } = args;
  if (!cartao) return { pode: false, motivo: 'sem_cartao_cnpj_anexado' };
  if (!extracaoTemQualidade(extracaoGemini)) return { pode: false, motivo: 'leitura_do_documento_sem_qualidade_minima_confirmada' };
  if (statusValidadeCartao !== 'valido') return { pode: false, motivo: 'cartao_cnpj_fora_do_prazo_de_validade_documental' };
  if (!camposCartao?.telefone && !camposCartao?.email) return { pode: false, motivo: 'telefone_e_email_nao_extraidos_do_documento' };
  return { pode: true, motivo: 'cartao_cnpj_valido_com_contato_extraido' };
}

/**
 * CORREÇÃO (Rodada 22, 02/09/2026, pedido explícito do usuário: "depois de
 * atualizar manualmente dados de contato e informações, não alterar
 * automaticamente de forma alguma"): decisão pura (sem banco/rede) por
 * CAMPO -- telefone e e-mail são independentes, então uma edição manual só
 * bloqueia o campo que foi editado, nunca os dois juntos. Extraída para ser
 * diretamente testável, no mesmo padrão das demais funções de decisão deste
 * arquivo. Regra geral: vale para qualquer empresa/campo, sem expiração por
 * tempo -- uma vez editado manualmente, o campo nunca mais é sobrescrito
 * automaticamente por esta leitura documental.
 */
export function deveAtualizarCampoContatoViaCartao(args: {
  valorCartao: string | null | undefined;
  valorAtual: string | null | undefined;
  editadoManualmente: boolean;
}): boolean {
  if (!args.valorCartao) return false;
  if (args.valorCartao === args.valorAtual) return false;
  if (args.editadoManualmente) return false;
  return true;
}

/**
 * Quando `deveAtualizarContatoViaCartao` autoriza, substitui
 * `empresas.telefone`/`empresas.email` pelo valor lido no Cartão CNPJ --
 * "substituir", como pedido explicitamente pelo usuário, não apenas
 * preencher se estiver vazio. Só grava os campos que o documento realmente
 * trouxe (telefone e email são independentes -- se só um dos dois foi lido,
 * só esse é atualizado). Não interage com `EMPRESA_CAMPOS_PROTEGIDOS_SYNC`
 * (`server/index.ts`): aquela proteção é específica da sincronização
 * automática com as APIs gratuitas de CNPJ (que nunca trazem telefone/e-mail),
 * feita por uma rota HTTP diferente (PATCH /api/empresas/:id) -- esta função
 * grava direto no banco a partir da leitura do próprio documento oficial
 * anexado pela empresa, um caso completamente diferente. Nunca lança -- uma
 * falha aqui não pode derrubar a análise documental já calculada e
 * persistida.
 */
export async function aplicarAtualizacaoContatoDocumentoEmpresa(args: {
  empresaId: string;
  empresaAtual: any;
  cartao: DocCartao | null;
  camposCartao: ExtracaoCartao;
  extracaoGemini: ExtracaoCartao | null;
  statusValidadeCartao: string;
}): Promise<ResultadoAtualizacaoContatoDocumento> {
  const { empresaId, empresaAtual, cartao, camposCartao, extracaoGemini, statusValidadeCartao } = args;

  const decisao = deveAtualizarContatoViaCartao({ cartao, camposCartao, extracaoGemini, statusValidadeCartao });
  if (!decisao.pode) return { aplicado: false, motivo: decisao.motivo };

  try {
    const colunas = await colunasDaTabela(pool, 'empresas');
    const assignments: string[] = [];
    const values: unknown[] = [empresaId];
    let telefoneAtualizado = false;
    let emailAtualizado = false;

    // CORREÇÃO (Rodada 22, 02/09/2026, pedido explícito do usuário: "depois
    // de atualizar manualmente dados de contato e informações, não alterar
    // automaticamente de forma alguma"): telefone e e-mail são independentes
    // -- se o colaborador já corrigiu manualmente só um dos dois, o outro
    // continua sendo atualizado normalmente pela leitura do documento; só o
    // campo que teve edição manual registrada fica protegido, para sempre
    // (ver `edicaoManualCamposEmpresa.ts`).
    const telefoneEditadoManualmente = campoFoiEditadoManualmente(empresaAtual?.dados_extra_receita, 'telefone');
    const emailEditadoManualmente = campoFoiEditadoManualmente(empresaAtual?.dados_extra_receita, 'email');

    if (colunas.has('telefone') && deveAtualizarCampoContatoViaCartao({
      valorCartao: camposCartao.telefone,
      valorAtual: empresaAtual?.telefone,
      editadoManualmente: telefoneEditadoManualmente,
    })) {
      values.push(camposCartao.telefone);
      assignments.push(`"telefone" = $${values.length}`);
      telefoneAtualizado = true;
    }
    if (colunas.has('email') && deveAtualizarCampoContatoViaCartao({
      valorCartao: camposCartao.email,
      valorAtual: empresaAtual?.email,
      editadoManualmente: emailEditadoManualmente,
    })) {
      values.push(camposCartao.email);
      assignments.push(`"email" = $${values.length}`);
      emailAtualizado = true;
    }

    if (!assignments.length) {
      return {
        aplicado: false,
        motivo: (telefoneEditadoManualmente || emailEditadoManualmente)
          ? 'contato_editado_manualmente_pelo_usuario'
          : 'contato_do_documento_igual_ao_ja_cadastrado',
      };
    }

    if (colunas.has('updated_at')) assignments.push('"updated_at" = NOW()');

    await pool.query(`UPDATE public.empresas SET ${assignments.join(', ')} WHERE id = $1`, values);

    const mensagemHistorico = [
      telefoneAtualizado ? `telefone -> "${camposCartao.telefone}"` : null,
      emailAtualizado ? `e-mail -> "${camposCartao.email}"` : null,
    ].filter(Boolean).join('; ');
    await registrarHistoricoSincronizacaoSeguro(
      pool,
      empresaId,
      `Leitura do Cartão CNPJ anexado atualizou o contato cadastral a partir do documento oficial: ${mensagemHistorico}.`,
    );

    return { aplicado: true, motivo: 'contato_atualizado_via_cartao_cnpj', telefoneAtualizado, emailAtualizado };
  } catch (error: any) {
    console.warn('[analiseCnpjReceitaCartao] Falha ao aplicar atualização de contato via Cartão CNPJ (best-effort, não interrompe a análise):', error?.message || error);
    return { aplicado: false, motivo: 'erro_ao_gravar_contato' };
  }
}

export async function buscarUltimaAnaliseCnpjEmpresa(empresaId: string) {
  const exists = await tableExists('analises_cnpj_empresa');
  if (!exists) return null;
  const { rows } = await pool.query('SELECT * FROM public.analises_cnpj_empresa WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT 1', [empresaId]);
  return sanitizarAnaliseCnpjPersistida(rows[0] || null);
}

export async function analisarCnpjReceitaCartaoEmpresa(empresaId: string, criadoPor?: string | null, overrideArquivoId?: string, opcoes?: { persistir?: boolean }) {
  const empresa = await buscarEmpresa(empresaId);
  if (!empresa) return null;

  const persistir = opcoes?.persistir !== false;
  const socios = await buscarSocios(empresaId);
  const cartao = await buscarUltimoCartaoCnpj(empresaId, overrideArquivoId);
  const camposReceita = montarCamposReceita(empresa);
  const extracaoGemini = await tentarExtrairCartaoComGemini(cartao);

  const camposCartao: ExtracaoCartao = extracaoGemini || {
    data_emissao: parseDate(cartao?.data_emissao_documento),
    fonte: cartao?.data_emissao_documento ? 'metadados_documento' : null,
  };

  const dataEmissaoCartao = parseDate(camposCartao.data_emissao || cartao?.data_emissao_documento);
  const diasEmissaoCartao = diffDays(dataEmissaoCartao);
  let statusValidadeCartao = cartao ? 'pendente' : 'nao_verificado';
  const alertas: AlertaAnalise[] = [];
  const pontosPositivos: string[] = [];
  const pontosAtencao: string[] = [];
  const pontosImpeditivos: string[] = [];
  const recomendacoes: string[] = [];

  const situacao = classificarSituacao(camposReceita.situacao_cadastral);
  if (situacao.alerta) alertas.push(situacao.alerta);

  if (camposReceita.cnpj_limpo?.length === 14) pontosPositivos.push('CNPJ válido e estruturado no cadastro.');
  else alertas.push({ codigo: 'cnpj_invalido', mensagem: 'CNPJ ausente ou inválido no cadastro.', severidade: 'critica', recomendacao: 'Corrigir CNPJ e sincronizar Receita.' });

  if (isSituacaoAtiva(camposReceita.situacao_cadastral)) pontosPositivos.push('Empresa com situação cadastral ativa na Receita Federal.');

  if (camposReceita.idade_meses !== null && camposReceita.idade_meses < 12) {
    alertas.push({ codigo: 'empresa_menos_12_meses', mensagem: `Empresa com apenas ${tempoAberturaDescricao(camposReceita.idade_meses)} de abertura.`, severidade: 'alta', recomendacao: 'Direcionar para linhas compatíveis com empresas novas ou aguardar maturação cadastral.' });
    pontosImpeditivos.push('Tempo de abertura inferior a 12 meses para algumas linhas bancárias.');
  } else if (camposReceita.idade_meses !== null && camposReceita.idade_meses >= 36) {
    pontosPositivos.push('Empresa com mais de 3 anos de constituição, ponto positivo para análise bancária.');
  }

  if (!cartao) {
    alertas.push({ codigo: 'cartao_cnpj_nao_anexado', mensagem: 'Cartão CNPJ ainda não anexado no acervo documental.', severidade: 'media', recomendacao: 'Anexar o Cartão CNPJ para comprovação e conferência com a Receita.' });
    pontosAtencao.push('Anexar Cartão CNPJ para validar o documento comprobatório.');
  } else {
    pontosPositivos.push('Cartão CNPJ anexado ao acervo documental.');
    if (dataEmissaoCartao && diasEmissaoCartao !== null) {
      statusValidadeCartao = diasEmissaoCartao > 30 ? 'vencido' : 'valido';
      if (diasEmissaoCartao > 30) {
        alertas.push({ codigo: 'cartao_cnpj_vencido', mensagem: `Cartão CNPJ emitido há ${diasEmissaoCartao} dias.`, severidade: 'alta', recomendacao: 'Solicitar novo Cartão CNPJ emitido há menos de 31 dias.' });
        pontosImpeditivos.push('Cartão CNPJ vencido para o dossiê atual.');
      } else {
        pontosPositivos.push('Cartão CNPJ com emissão dentro do prazo de 30 dias.');
      }
    } else {
      statusValidadeCartao = extracaoGemini ? 'nao_verificado' : 'pendente';
      alertas.push({ codigo: 'cartao_cnpj_emissao_nao_confirmada', mensagem: 'O Cartão CNPJ foi lido, mas a data de emissão não pôde ser confirmada no arquivo.', severidade: 'alta', recomendacao: 'Confirmar visualmente a data de emissão ou anexar um Cartão CNPJ atualizado e legível.' });
      pontosAtencao.push('Data de emissão do Cartão CNPJ não confirmada; o documento foi analisado, mas exige correção antes do avanço.');
    }
  }

  // CORREÇÃO (Rodada 26, 02/09/2026, pedido explícito do usuário -- "esse caso
  // é igual [à situação cadastral], os dados da receita vêm desatualizado
  // pela api, e o cartão anexado tá certo, tem que atualizar os dados
  // faltantes automático e aparecer no modal a análise"): diferente da
  // confirmação de situação cadastral (Rodada 20, que roda só DEPOIS de
  // persistir esta análise -- ver bloco `if (persistir)` mais abaixo), a
  // correção do nome empresarial roda AQUI, ANTES de montar `comparacao` --
  // se rodasse só depois (como a de situação cadastral), o alerta "Nome
  // empresarial divergente" já teria sido calculado e persistido com o nome
  // ANTIGO, e o card de identidade só mostraria o resultado correto na
  // PRÓXIMA análise (upload novo, retentativa de 15 min, ou F5) -- exatamente
  // o "aparecer no modal a análise" que o usuário pediu para acontecer já
  // nesta mesma leitura. Corrigindo e sobrescrevendo `camposReceita.nome_empresarial`
  // em memória ANTES da comparação, o card já nasce consistente na mesma
  // leitura que corrigiu o cadastro -- sem exigir uma segunda análise.
  if (persistir) {
    const resultadoNome = await aplicarConfirmacaoNomeEmpresarialDocumentoEmpresa({
      empresaId,
      empresaAtual: empresa,
      cartao,
      camposCartao,
      extracaoGemini,
      dataEmissaoCartao,
      diasEmissaoCartao,
      statusValidadeCartao,
    });
    if (resultadoNome.aplicado && resultadoNome.nomeAtual) {
      camposReceita.nome_empresarial = resultadoNome.nomeAtual;
      empresa.razao_social = resultadoNome.nomeAtual;
    }
  }

  const comparacao = {
    cnpj: compararCampo('CNPJ', camposReceita.cnpj, camposCartao.cnpj, 'cnpj'),
    nome_empresarial: compararCampo('Nome empresarial', camposReceita.nome_empresarial, camposCartao.nome_empresarial, 'nome'),
    cnae_principal: compararCampo('CNAE principal', camposReceita.cnae_principal, camposCartao.cnae_principal, 'cnae'),
    natureza_juridica: compararCampo('Natureza jurídica', camposReceita.natureza_juridica, camposCartao.natureza_juridica, 'natureza'),
    endereco_completo: compararCampo('Endereço completo', camposReceita.endereco_completo, camposCartao.endereco_completo, 'endereco'),
    situacao_cadastral: compararCampo('Situação cadastral', camposReceita.situacao_cadastral, camposCartao.situacao_cadastral, 'situacao'),
    data_abertura: compararCampo('Data de abertura', camposReceita.data_abertura, camposCartao.data_abertura, 'data'),
  };
  const divergencias = Object.entries(comparacao)
    .filter(([, item]: any) => item.divergente && item.normalizado_receita && item.normalizado_cartao)
    .map(([campo, item]: any) => montarDivergencia(campo, item));

  for (const div of divergencias) {
    alertas.push({
      codigo: `divergencia_${div.campo}`,
      mensagem: `${div.label} divergente. Receita/cadastro: "${String(div.valor_receita || 'não informado')}". Cartão CNPJ: "${String(div.valor_cartao || 'não informado')}". Motivo: ${div.motivo}`,
      severidade: div.severidade,
      recomendacao: 'Revisar a evidência da divergência antes do laudo final. Se os valores forem equivalentes, atualizar normalização/comparação antes de marcar como divergente.',
    });
  }

  if (!camposReceita.cnae_principal) recomendacoes.push('Atualizar CNAE principal da Receita antes de gerar o laudo final.');
  if (!camposReceita.endereco_completo) recomendacoes.push('Completar endereço cadastral da empresa.');
  if (!socios.length) recomendacoes.push('Confirmar QSA/administrador para validar quem assina contratos e operações.');
  if (!cartao) recomendacoes.push('Anexar Cartão CNPJ para comprovar os dados cadastrais.');
  if (statusValidadeCartao === 'vencido') recomendacoes.push('Solicitar novo Cartão CNPJ atualizado.');
  if (!recomendacoes.length) recomendacoes.push('Prosseguir para análise documental completa: QSA, contrato social, SCR/CCS/CCF, CND e faturamento.');

  const { score, risco } = calcularScore({ camposReceita, cartao, extracao: camposCartao, divergencias, alertas, socios });
  const diagnostico = gerarDiagnostico({ empresa, camposReceita, cartao, statusValidadeCartao, diasEmissaoCartao, score, risco, alertas, recomendacoes });
  const cartaoFoiLido = !!extracaoGemini;
  const exigeRevisao = alertas.some((a) => a.severidade === 'critica' || a.severidade === 'alta');
  const status = !cartao
    ? 'pendente_documento'
    : !cartaoFoiLido
      ? 'pendente_ocr'
      : exigeRevisao ? 'revisao_humana' : 'concluida';
  const resultado = {
    campos_receita: camposReceita,
    campos_cartao: camposCartao,
    comparacao,
    divergencias,
    alertas,
    pontos_positivos: pontosPositivos,
    pontos_atencao: pontosAtencao,
    pontos_impeditivos: pontosImpeditivos,
    recomendacoes,
    diagnostico,
  };

  let persistedRow: any = null;
  if (persistir) {
    await ensureAnalisesCnpjSchema();
    const { rows } = await pool.query(
      `INSERT INTO public.analises_cnpj_empresa
        (empresa_id, cartao_cnpj_arquivo_id, status, score_cnpj, risco_cnpj, cnpj, matriz_filial, data_abertura,
         idade_meses, tempo_abertura_descricao, alerta_menos_12_meses, alerta_mais_36_meses, situacao_cadastral,
         risco_situacao, cnae_principal, natureza_juridica, porte, capital_social, data_emissao_cartao,
         dias_emissao_cartao, status_validade_cartao, cartao_pendente_ocr, cartao_anexado, campos_receita,
         campos_cartao, comparacao, divergencias, alertas, pontos_positivos, pontos_atencao, pontos_impeditivos,
         recomendacoes, diagnostico, resultado, fonte_receita, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb,$26::jsonb,$27::jsonb,$28::jsonb,$29::jsonb,$30::jsonb,$31::jsonb,$32::jsonb,$33,$34::jsonb,$35,$36)
       RETURNING *`,
      [
        empresaId,
        cartao?.id || null,
        status,
        score,
        risco,
        camposReceita.cnpj,
        camposReceita.matriz_filial,
        camposReceita.data_abertura,
        camposReceita.idade_meses,
        camposReceita.tempo_abertura_descricao,
        (camposReceita.idade_meses ?? 999) < 12,
        (camposReceita.idade_meses ?? 0) >= 36,
        camposReceita.situacao_cadastral,
        situacao.risco,
        camposReceita.cnae_principal,
        camposReceita.natureza_juridica,
        camposReceita.porte,
        camposReceita.capital_social,
        dataEmissaoCartao,
        diasEmissaoCartao,
        statusValidadeCartao,
        !!cartao && !cartaoFoiLido,
        !!cartao,
        JSON.stringify(camposReceita),
        JSON.stringify(camposCartao),
        JSON.stringify(comparacao),
        JSON.stringify(divergencias),
        JSON.stringify(alertas),
        JSON.stringify(pontosPositivos),
        JSON.stringify(pontosAtencao),
        JSON.stringify(pontosImpeditivos),
        JSON.stringify(recomendacoes),
        diagnostico,
        JSON.stringify(resultado),
        camposReceita.fonte_dados,
        criadoPor || null,
      ]
    );
    persistedRow = rows[0] || null;
  }

  if (cartao?.id) {
    // Rodada 38: persistir também um laudo documental autocontido no próprio
    // arquivo. A tela do Acervo não deve depender de reconstruir o dossiê
    // completo só para reapresentar dados que já foram lidos/validados antes.
    // Isso restaura imediatamente CNPJ, razão social, abertura, CNAE, natureza,
    // porte, endereço, situação, e-mail/telefone etc. após refresh/redeploy.
    const dadosDocumentaisCartao = {
      ...camposCartao,
      cnpj: camposCartao?.cnpj || camposReceita.cnpj || null,
      razao_social: camposCartao?.nome_empresarial || camposReceita.nome_empresarial || null,
      nome_empresarial: camposCartao?.nome_empresarial || camposReceita.nome_empresarial || null,
      nome_fantasia: camposCartao?.nome_fantasia || camposReceita.nome_fantasia || null,
      data_abertura: camposCartao?.data_abertura || camposReceita.data_abertura || null,
      cnae_principal: camposCartao?.cnae_principal || camposReceita.cnae_principal || null,
      natureza_juridica: camposCartao?.natureza_juridica || camposReceita.natureza_juridica || null,
      porte: camposCartao?.porte || camposReceita.porte || null,
      situacao_cadastral: camposCartao?.situacao_cadastral || camposReceita.situacao_cadastral || null,
      data_situacao_cadastral: camposCartao?.data_situacao_cadastral || camposReceita.data_situacao_cadastral || null,
      endereco_completo: camposCartao?.endereco_completo || camposReceita.endereco_completo || null,
      data_emissao: camposCartao?.data_emissao || dataEmissaoCartao || null,
      documento_compativel: cartaoFoiLido,
      satisfaz_requisito: cartaoFoiLido && statusValidadeCartao === 'valido' && !exigeRevisao,
      confianca: extracaoGemini?.confianca ?? null,
      fonte_extracao: extracaoGemini?.fonte || 'local_deterministica',
    };
    const laudoDocumentalCartao = {
      arquivo_id: cartao.id,
      empresa_id: empresaId,
      tipo_analise: 'cartao_cnpj',
      status: !cartaoFoiLido ? 'revisao_humana' : exigeRevisao ? 'revisao_humana' : 'concluido',
      revisao_humana_necessaria: !cartaoFoiLido || exigeRevisao,
      nivel_confianca: extracaoGemini?.confianca ?? null,
      dados_extraidos: dadosDocumentaisCartao,
      alertas,
      diagnostico,
      fonte_extracao: extracaoGemini?.fonte || 'local_deterministica',
      analisado_em: new Date().toISOString(),
    };
    await pool.query(
      `UPDATE public.documentos_arquivos
          SET status_validade = $2,
              data_emissao_documento = COALESCE(data_emissao_documento, $3::date),
              resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) || $4::jsonb,
              exige_revisao_humana = CASE WHEN $2 IN ('vencido','divergente','ilegivel') THEN true ELSE exige_revisao_humana END,
              atualizado_em = NOW()
        WHERE id = $1`,
      [
        cartao.id,
        statusValidadeCartao,
        dataEmissaoCartao,
        JSON.stringify({
          analise_cnpj_empresa_id: persistedRow?.id || null,
          dias_emissao_cartao: diasEmissaoCartao,
          divergencias: divergencias.length,
          analise_regra_documental: laudoDocumentalCartao,
          analise_automatica_status: laudoDocumentalCartao.status,
          analise_automatica_concluida_em: new Date().toISOString(),
        }),
      ]
    ).catch(() => undefined);
  }

  // CORREÇÃO (Rodada 20): só aplica a confirmação/trava cadastral quando esta
  // é uma análise "de verdade" (persistir !== false) -- a checagem de
  // qualidade documental feita durante a coleta de documentos (`coletaDocumentos.ts`,
  // `{ persistir: false }`) é só uma pré-visualização antes de o documento
  // ser aceito no acervo, e não deve gravar nada em `empresas` ainda.
  if (persistir) {
    await aplicarConfirmacaoCadastralDocumentoEmpresa({
      empresaId,
      empresaAtual: empresa,
      cartao,
      camposCartao,
      extracaoGemini,
      dataEmissaoCartao,
      diasEmissaoCartao,
      statusValidadeCartao,
    });
    // CORREÇÃO (Rodada 21): mesma regra -- só roda numa análise "de verdade",
    // nunca na pré-visualização de `coletaDocumentos.ts` (`{ persistir: false }`).
    await aplicarAtualizacaoContatoDocumentoEmpresa({
      empresaId,
      empresaAtual: empresa,
      cartao,
      camposCartao,
      extracaoGemini,
      statusValidadeCartao,
    });
  }

  return persistedRow || {
    id: null,
    empresa_id: empresaId,
    cartao_cnpj_arquivo_id: cartao?.id || null,
    status,
    score_cnpj: score,
    risco_cnpj: risco,
    resultado,
    alertas,
    divergencias,
  };
}

function gerarDiagnostico(args: { empresa: any; camposReceita: any; cartao: DocCartao | null; statusValidadeCartao: string; diasEmissaoCartao: number | null; score: number; risco: string; alertas: AlertaAnalise[]; recomendacoes: string[] }) {
  const partes: string[] = [];
  partes.push(`A empresa ${args.empresa?.razao_social || 'selecionada'} possui CNPJ ${args.camposReceita.cnpj || 'não informado'}, natureza jurídica ${args.camposReceita.natureza_juridica || 'não informada'}, porte ${args.camposReceita.porte || 'não informado'} e situação cadastral ${args.camposReceita.situacao_cadastral || 'não informada'}.`);
  if (args.camposReceita.tempo_abertura_descricao) partes.push(`Tempo de abertura: ${args.camposReceita.tempo_abertura_descricao}.`);
  if (args.cartao) {
    if (args.statusValidadeCartao === 'valido') partes.push(`O Cartão CNPJ foi anexado e está dentro do prazo de validade documental (${args.diasEmissaoCartao} dias desde a emissão).`);
    else if (args.statusValidadeCartao === 'vencido') partes.push(`O Cartão CNPJ foi anexado, porém está vencido para análise documental (${args.diasEmissaoCartao} dias desde a emissão).`);
    else partes.push('O Cartão CNPJ foi analisado, porém a data de emissão ainda precisa de confirmação antes do avanço.');
  } else {
    partes.push('O Cartão CNPJ ainda não foi anexado ao acervo documental.');
  }
  partes.push(`Score CNPJ atual: ${args.score}/100, risco ${args.risco}.`);
  const criticos = args.alertas.filter((a) => a.severidade === 'critica' || a.severidade === 'alta');
  if (criticos.length) partes.push(`Pontos de atenção principais: ${criticos.slice(0, 3).map((a) => a.mensagem).join(' | ')}.`);
  partes.push(`Próxima ação recomendada: ${args.recomendacoes[0] || 'seguir para análise documental completa'}`);
  return partes.join('\n\n');
}
