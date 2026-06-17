import fs from 'fs/promises';
import path from 'path';
import pkg from 'pg';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  detalhes?: any;
};

type DocCartao = {
  id: string;
  nome_original?: string | null;
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
  situacao_cadastral?: string | null;
  data_emissao?: string | null;
  data_situacao_cadastral?: string | null;
  data_emissao_texto?: string | null;
  modelo?: string | null;
  fonte?: string | null;
  confianca?: number | null;
  raw_text?: string | null;
};

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function diffDays(dateIso?: string | null): number | null {
  const iso = parseDate(dateIso);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function monthsSince(dateIso?: string | null): number | null {
  const iso = parseDate(dateIso);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  return Math.max(months, 0);
}

function tempoAberturaDescricao(meses: number | null): string | null {
  if (meses === null) return null;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anos <= 0) return `${resto} mês${resto === 1 ? '' : 'es'}`;
  if (resto === 0) return `${anos} ano${anos === 1 ? '' : 's'}`;
  return `${anos} ano${anos === 1 ? '' : 's'} e ${resto} mês${resto === 1 ? '' : 'es'}`;
}

function detectarMatrizFilial(cnpjInput: unknown, valorExistente?: unknown): string | null {
  const existente = normalizeText(valorExistente);
  if (existente.includes('matriz')) return 'matriz';
  if (existente.includes('filial')) return 'filial';
  const cnpj = onlyDigits(cnpjInput);
  if (cnpj.length === 14) return cnpj.slice(8, 12) === '0001' ? 'matriz' : 'filial';
  return null;
}

function enderecoEmpresa(empresa: any): string | null {
  return [empresa?.logradouro || empresa?.endereco, empresa?.numero, empresa?.complemento, empresa?.bairro, empresa?.cidade, empresa?.estado, empresa?.cep]
    .filter(Boolean)
    .join(', ') || null;
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

function normalizarBaseComparacao(value: unknown): string {
  return normalizeText(value)
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensRelevantes(value: unknown): string[] {
  const stop = new Set(['de','da','do','das','dos','e','em','com','sem','a','o','as','os','r','rua','av','avenida','quadra','qd','lote','lt','sala','numero','n','sn','cep','go','brasil']);
  return normalizarBaseComparacao(value)
    .split(' ')
    .filter((t) => t.length >= 2 && !stop.has(t));
}

function similaridadeTokens(a: unknown, b: unknown): number {
  const ta = Array.from(new Set(tokensRelevantes(a)));
  const tb = Array.from(new Set(tokensRelevantes(b)));
  if (!ta.length || !tb.length) return 0;
  const menor = ta.length <= tb.length ? ta : tb;
  const maior = new Set(ta.length <= tb.length ? tb : ta);
  const iguais = menor.filter((t) => maior.has(t)).length;
  return iguais / Math.max(1, menor.length);
}

function textosEquivalentes(receita: unknown, cartao: unknown): boolean {
  const r = normalizarBaseComparacao(receita);
  const c = normalizarBaseComparacao(cartao);
  if (!r || !c) return false;
  if (r === c) return true;
  if (r.length >= 8 && c.length >= 8 && (r.includes(c) || c.includes(r))) return true;
  return similaridadeTokens(r, c) >= 0.86;
}

function codigoCnae(value: unknown): string | null {
  const text = String(value || '');
  const match = text.match(/\b\d{2}\.?\d{2}-?\d-?\d{2}\b/);
  if (match) {
    const digits = onlyDigits(match[0]);
    if (digits.length === 7) return digits;
  }
  const digits = onlyDigits(text);
  return digits.length >= 7 ? digits.slice(0, 7) : null;
}

function codigoNatureza(value: unknown): string | null {
  const text = String(value || '');
  const match = text.match(/\b\d{3}-?\d\b/);
  if (match) {
    const digits = onlyDigits(match[0]);
    if (digits.length === 4) return digits;
  }
  const digits = onlyDigits(text);
  return digits.length >= 4 ? digits.slice(0, 4) : null;
}

function cepEndereco(value: unknown): string | null {
  const digits = onlyDigits(value);
  const match = digits.match(/\d{8}/);
  return match ? match[0] : null;
}

function dataDiferencaDias(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24)));
}

function compararCampo(label: string, receita: unknown, cartao: unknown, tipo: 'texto' | 'cnpj' | 'data' | 'cnae' | 'natureza' | 'endereco' = 'texto') {
  const receitaOriginal = receita === undefined || receita === null ? '' : String(receita).trim();
  const cartaoOriginal = cartao === undefined || cartao === null ? '' : String(cartao).trim();

  if (!cartaoOriginal) {
    return {
      label,
      status: 'nao_extraido',
      receita,
      cartao,
      receita_normalizado: null,
      cartao_normalizado: null,
      divergente: false,
      motivo_tecnico: 'Campo não extraído do Cartão CNPJ; não há base para apontar divergência.',
      evidencia: null,
    };
  }

  if (!receitaOriginal) {
    return {
      label,
      status: 'sem_base_receita',
      receita,
      cartao,
      receita_normalizado: null,
      cartao_normalizado: null,
      divergente: false,
      motivo_tecnico: 'Campo ausente na base da Receita/cadastro; não há base para apontar divergência.',
      evidencia: null,
    };
  }

  let receitaNormalizado: string | null = null;
  let cartaoNormalizado: string | null = null;
  let divergente = false;
  let motivoTecnico = 'Campos equivalentes após normalização.';

  if (tipo === 'cnpj') {
    receitaNormalizado = onlyDigits(receitaOriginal);
    cartaoNormalizado = onlyDigits(cartaoOriginal);
    divergente = receitaNormalizado.length === 14 && cartaoNormalizado.length === 14 && receitaNormalizado !== cartaoNormalizado;
    motivoTecnico = divergente
      ? 'CNPJ com 14 dígitos diferente entre Receita e Cartão CNPJ.'
      : 'CNPJ conferido por comparação dos 14 dígitos.';
  } else if (tipo === 'data') {
    receitaNormalizado = parseDate(receitaOriginal);
    cartaoNormalizado = parseDate(cartaoOriginal);
    divergente = !!receitaNormalizado && !!cartaoNormalizado && dataDiferencaDias(receitaNormalizado, cartaoNormalizado) > 1;
    motivoTecnico = divergente
      ? 'Datas normalizadas diferentes, com tolerância de 1 dia para evitar falso positivo de timezone.'
      : 'Data conferida após normalização, com tolerância de 1 dia.';
  } else if (tipo === 'cnae') {
    receitaNormalizado = codigoCnae(receitaOriginal);
    cartaoNormalizado = codigoCnae(cartaoOriginal);
    divergente = !!receitaNormalizado && !!cartaoNormalizado && receitaNormalizado !== cartaoNormalizado;
    motivoTecnico = divergente
      ? 'Código CNAE de 7 dígitos diferente entre Receita e Cartão CNPJ.'
      : (receitaNormalizado && cartaoNormalizado ? 'CNAE conferido pelo código de 7 dígitos.' : 'Código CNAE ausente em um dos lados; não foi apontada divergência sem prova objetiva.');
  } else if (tipo === 'natureza') {
    receitaNormalizado = codigoNatureza(receitaOriginal);
    cartaoNormalizado = codigoNatureza(cartaoOriginal);
    divergente = !!receitaNormalizado && !!cartaoNormalizado && receitaNormalizado !== cartaoNormalizado;
    motivoTecnico = divergente
      ? 'Código da natureza jurídica diferente entre Receita e Cartão CNPJ.'
      : (receitaNormalizado && cartaoNormalizado ? 'Natureza jurídica conferida pelo código numérico.' : 'Código da natureza jurídica ausente em um dos lados; não foi apontada divergência sem prova objetiva.');
  } else if (tipo === 'endereco') {
    const cepReceita = cepEndereco(receitaOriginal);
    const cepCartao = cepEndereco(cartaoOriginal);
    receitaNormalizado = cepReceita || normalizarBaseComparacao(receitaOriginal);
    cartaoNormalizado = cepCartao || normalizarBaseComparacao(cartaoOriginal);

    if (cepReceita && cepCartao) {
      divergente = cepReceita !== cepCartao;
      motivoTecnico = divergente
        ? 'CEP diferente entre Receita e Cartão CNPJ.'
        : 'Endereço considerado conferido porque o CEP é igual; diferenças de pontuação, abreviação e ordem dos componentes são ignoradas.';
    } else {
      const sim = similaridadeTokens(receitaOriginal, cartaoOriginal);
      divergente = tokensRelevantes(receitaOriginal).length >= 3 && tokensRelevantes(cartaoOriginal).length >= 3 && sim < 0.45;
      motivoTecnico = divergente
        ? `Endereço com baixa similaridade de tokens (${Math.round(sim * 100)}%) e sem CEP equivalente para confirmação.`
        : `Endereço considerado equivalente por similaridade de tokens (${Math.round(sim * 100)}%) ou por falta de prova objetiva.`;
    }
  } else {
    receitaNormalizado = normalizarBaseComparacao(receitaOriginal);
    cartaoNormalizado = normalizarBaseComparacao(cartaoOriginal);
    divergente = !textosEquivalentes(receitaOriginal, cartaoOriginal);
    motivoTecnico = divergente
      ? 'Texto diferente após normalização de acentos, pontuação, caixa e espaços.'
      : 'Texto equivalente após normalização de acentos, pontuação, caixa e espaços.';
  }

  const evidencia = divergente
    ? `Receita: "${receitaOriginal}" | Cartão CNPJ: "${cartaoOriginal}"`
    : null;

  return {
    label,
    status: divergente ? 'divergente' : 'conferido',
    receita,
    cartao,
    receita_normalizado: receitaNormalizado,
    cartao_normalizado: cartaoNormalizado,
    divergente,
    motivo_tecnico: motivoTecnico,
    evidencia,
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
  return String(process.env.GEMINI_DOCUMENT_OCR_ENABLED || 'true').toLowerCase() !== 'false';
}

function normalizarConfianca(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n <= 100) return Math.round(n) / 100;
  return Math.max(0, Math.min(1, n));
}

function extracaoTemQualidade(extracao: ExtracaoCartao | null): boolean {
  if (!extracao) return false;
  const confianca = normalizarConfianca(extracao.confianca);
  const temCamposCriticos = !!(extracao.cnpj && extracao.data_abertura && extracao.data_emissao && extracao.situacao_cadastral);
  if (!temCamposCriticos) return false;
  if (confianca !== null && confianca < 0.72) return false;
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

async function arquivoExiste(filePath: string): Promise<boolean> {
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function resolverCaminhoDocumento(caminhoArquivo?: string | null): Promise<string | null> {
  const raw = String(caminhoArquivo || '').trim();
  if (!raw) return null;

  const cwd = process.cwd();
  const dataDir = path.resolve(process.env.DATA_DIR || '/data');
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(dataDir, 'uploads'));
  const candidatos = new Set<string>();

  if (path.isAbsolute(raw)) candidatos.add(path.resolve(raw));
  candidatos.add(path.resolve(cwd, raw));
  candidatos.add(path.resolve(dataDir, raw));
  candidatos.add(path.resolve(uploadDir, raw));
  if (raw.startsWith('/app/')) candidatos.add(path.resolve(raw.replace('/app/', `${cwd}/`)));
  if (raw.includes('/uploads/')) candidatos.add(path.resolve(dataDir, raw.slice(raw.indexOf('/uploads/') + 1)));

  for (const candidato of candidatos) {
    if (await arquivoExiste(candidato)) return candidato;
  }

  console.warn('[analiseCnpjReceitaCartao] Arquivo do Cartão CNPJ não encontrado para IA/OCR:', raw);
  return null;
}

function montarPromptCartaoCnpj() {
  return `Você é um auditor documental brasileiro especializado em Cartão CNPJ da Receita Federal.

Tarefa: leia o PDF/imagem anexado e extraia campos estruturados. A DATA DE EMISSÃO DO COMPROVANTE normalmente aparece no rodapé, em frase parecida com: "Emitido no dia DD/MM/AAAA às HH:MM:SS". NÃO confunda com DATA DE ABERTURA nem com DATA DA SITUAÇÃO CADASTRAL.

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
  "situacao_cadastral": "texto ou null",
  "data_situacao_cadastral": "YYYY-MM-DD ou null",
  "data_emissao": "YYYY-MM-DD ou null",
  "data_emissao_texto": "texto completo encontrado no rodapé ou null",
  "horario_emissao": "HH:MM:SS ou null",
  "confianca": 0.0
}

Regras:
- Se o arquivo não for Cartão CNPJ, use documento_e_cartao_cnpj=false.
- Se a data de emissão não estiver visível, data_emissao=null.
- Preserve números, códigos CNAE e natureza jurídica.
- Confianca deve ir de 0 a 1.`;
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
    situacao_cadastral: firstNonEmpty(json.situacao_cadastral, json.situacaoCadastral),
    data_situacao_cadastral: parseDate(json.data_situacao_cadastral || json.dataSituacaoCadastral),
    data_emissao: parseDate(json.data_emissao || json.dataEmissao),
    data_emissao_texto: firstNonEmpty(json.data_emissao_texto, json.texto_emissao, json.emitido_no_dia),
    modelo: modelName,
    fonte: 'gemini_document_ocr',
    confianca: normalizarConfianca(json.confianca),
    raw_text: responseText,
  };
}

async function tentarExtrairCartaoComGemini(doc: DocCartao | null): Promise<ExtracaoCartao | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiOcrEnabled() || !apiKey || !doc?.caminho_arquivo) return null;
  if (!documentoSuportadoPorGemini(doc)) return null;

  const filePath = await resolverCaminhoDocumento(doc.caminho_arquivo);
  if (!filePath) return null;

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
    if (ultimoErro) throw ultimoErro;
    return null;
  } catch (err) {
    console.warn('[analiseCnpjReceitaCartao] Gemini não conseguiu extrair Cartão CNPJ:', (err as any)?.message || err);
    return null;
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

async function buscarUltimoCartaoCnpj(empresaId: string): Promise<DocCartao | null> {
  const exists = await tableExists('documentos_arquivos');
  if (!exists) return null;
  const { rows } = await pool.query(
    `SELECT id, nome_original, mime_type, caminho_arquivo, data_emissao_documento, status_validade, resultado_validacao, criado_em
       FROM public.documentos_arquivos
      WHERE empresa_id = $1
        AND tipo_documento = 'cartao_cnpj'
        AND excluido_em IS NULL
        AND status <> 'excluido'
      ORDER BY criado_em DESC
      LIMIT 1`,
    [empresaId]
  );
  return rows[0] || null;
}

function classificarSituacao(situacao: unknown): { risco: string; alerta?: AlertaAnalise } {
  const s = normalizeText(situacao);
  if (!s) return { risco: 'medio', alerta: { codigo: 'situacao_cadastral_ausente', mensagem: 'Situação cadastral não informada na Receita.', severidade: 'media', recomendacao: 'Atualizar dados da Receita antes de avançar.' } };
  if (s.includes('ativa')) return { risco: 'baixo' };
  if (s.includes('baixada') || s.includes('inapta')) return { risco: 'critico', alerta: { codigo: 'situacao_cadastral_impeditiva', mensagem: `Situação cadastral impeditiva: ${situacao}.`, severidade: 'critica', recomendacao: 'Não enviar ao banco antes de regularizar a situação cadastral.' } };
  return { risco: 'alto', alerta: { codigo: 'situacao_cadastral_atencao', mensagem: `Situação cadastral requer atenção: ${situacao}.`, severidade: 'alta', recomendacao: 'Validar situação cadastral antes de seguir.' } };
}

function calcularScore(input: { camposReceita: any; cartao: DocCartao | null; extracao: ExtracaoCartao | null; divergencias: any[]; alertas: AlertaAnalise[]; socios: any[] }) {
  let score = 100;
  if (!input.camposReceita.cnpj_limpo || input.camposReceita.cnpj_limpo.length !== 14) score -= 25;
  if (!input.camposReceita.nome_empresarial) score -= 10;
  if (!input.camposReceita.data_abertura) score -= 10;
  if (!input.camposReceita.cnae_principal) score -= 8;
  if (!input.camposReceita.natureza_juridica) score -= 6;
  if (!input.camposReceita.situacao_cadastral) score -= 10;
  if (normalizeText(input.camposReceita.situacao_cadastral) && !normalizeText(input.camposReceita.situacao_cadastral).includes('ativa')) score -= 35;
  if ((input.camposReceita.idade_meses ?? 999) < 12) score -= 15;
  if (!input.cartao) score -= 10;
  if (input.cartao && !input.extracao && !input.cartao.data_emissao_documento) score -= 5;
  if (input.divergencias.length) score -= Math.min(30, input.divergencias.length * 10);
  if (input.alertas.some((a) => a.severidade === 'critica')) score -= 25;
  if (input.alertas.some((a) => a.codigo === 'cartao_cnpj_vencido')) score -= 10;
  if (!input.socios.length) score -= 10;
  score = Math.max(0, Math.min(100, score));
  const risco = score >= 80 ? 'baixo' : score >= 60 ? 'medio' : score >= 40 ? 'alto' : 'critico';
  return { score, risco };
}

export async function buscarUltimaAnaliseCnpjEmpresa(empresaId: string) {
  const exists = await tableExists('analises_cnpj_empresa');
  if (!exists) return null;
  const { rows } = await pool.query('SELECT * FROM public.analises_cnpj_empresa WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT 1', [empresaId]);
  return rows[0] || null;
}

export async function analisarCnpjReceitaCartaoEmpresa(empresaId: string, criadoPor?: string | null) {
  const empresa = await buscarEmpresa(empresaId);
  if (!empresa) return null;

  const socios = await buscarSocios(empresaId);
  const cartao = await buscarUltimoCartaoCnpj(empresaId);
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

  if (normalizeText(camposReceita.situacao_cadastral).includes('ativa')) pontosPositivos.push('Empresa com situação cadastral ativa na Receita Federal.');

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
      alertas.push({ codigo: 'cartao_cnpj_pendente_ocr', mensagem: 'Cartão CNPJ anexado, mas a data de emissão ainda não foi identificada.', severidade: 'media', recomendacao: 'Configurar GEMINI_API_KEY para OCR automático ou submeter documento para revisão humana.' });
      pontosAtencao.push('Cartão CNPJ pendente de leitura IA/OCR para validar data de emissão.');
    }
  }

  const comparacao = {
    cnpj: compararCampo('CNPJ', camposReceita.cnpj, camposCartao.cnpj, 'cnpj'),
    nome_empresarial: compararCampo('Nome empresarial', camposReceita.nome_empresarial, camposCartao.nome_empresarial),
    cnae_principal: compararCampo('CNAE principal', camposReceita.cnae_principal, camposCartao.cnae_principal, 'cnae'),
    natureza_juridica: compararCampo('Natureza jurídica', camposReceita.natureza_juridica, camposCartao.natureza_juridica, 'natureza'),
    endereco_completo: compararCampo('Endereço completo', camposReceita.endereco_completo, camposCartao.endereco_completo, 'endereco'),
    situacao_cadastral: compararCampo('Situação cadastral', camposReceita.situacao_cadastral, camposCartao.situacao_cadastral),
    data_abertura: compararCampo('Data de abertura', camposReceita.data_abertura, camposCartao.data_abertura, 'data'),
  };
  const divergencias = Object.entries(comparacao)
    .filter(([, item]: any) => item.divergente && item.evidencia && item.receita_normalizado && item.cartao_normalizado)
    .map(([campo, item]: any) => ({
      campo,
      label: item.label,
      receita: item.receita,
      cartao: item.cartao,
      receita_normalizado: item.receita_normalizado,
      cartao_normalizado: item.cartao_normalizado,
      motivo_tecnico: item.motivo_tecnico,
      evidencia: item.evidencia,
      severidade: (campo === 'cnpj' || campo === 'situacao_cadastral' ? 'critica' : 'alta') as Severidade,
    }));

  for (const div of divergencias) {
    alertas.push({
      codigo: `divergencia_${div.campo}`,
      mensagem: `${div.label} divergente. Receita: "${div.receita || 'não informado'}". Cartão CNPJ: "${div.cartao || 'não informado'}". Motivo: ${div.motivo_tecnico}`,
      severidade: div.severidade,
      recomendacao: 'Revisar a evidência exibida antes de concluir o laudo final. Se a divergência for real, atualizar Receita/cadastro ou substituir o documento anexado.',
      detalhes: div,
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
  const status = !cartao ? 'pendente_documento' : (statusValidadeCartao === 'pendente' ? 'pendente_ocr' : (alertas.some((a) => a.severidade === 'critica') ? 'revisao_humana' : 'concluida'));
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
      !!cartao && !dataEmissaoCartao,
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

  if (cartao?.id) {
    await pool.query(
      `UPDATE public.documentos_arquivos
          SET status_validade = $2,
              data_emissao_documento = COALESCE(data_emissao_documento, $3::date),
              resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) || $4::jsonb,
              exige_revisao_humana = CASE WHEN $2 IN ('vencido','divergente','ilegivel') THEN true ELSE exige_revisao_humana END,
              atualizado_em = NOW()
        WHERE id = $1`,
      [cartao.id, statusValidadeCartao, dataEmissaoCartao, JSON.stringify({ analise_cnpj_empresa_id: rows[0].id, dias_emissao_cartao: diasEmissaoCartao, divergencias: divergencias.length })]
    ).catch(() => undefined);
  }

  return rows[0];
}

function gerarDiagnostico(args: { empresa: any; camposReceita: any; cartao: DocCartao | null; statusValidadeCartao: string; diasEmissaoCartao: number | null; score: number; risco: string; alertas: AlertaAnalise[]; recomendacoes: string[] }) {
  const partes: string[] = [];
  partes.push(`A empresa ${args.empresa?.razao_social || 'selecionada'} possui CNPJ ${args.camposReceita.cnpj || 'não informado'}, natureza jurídica ${args.camposReceita.natureza_juridica || 'não informada'}, porte ${args.camposReceita.porte || 'não informado'} e situação cadastral ${args.camposReceita.situacao_cadastral || 'não informada'}.`);
  if (args.camposReceita.tempo_abertura_descricao) partes.push(`Tempo de abertura: ${args.camposReceita.tempo_abertura_descricao}.`);
  if (args.cartao) {
    if (args.statusValidadeCartao === 'valido') partes.push(`O Cartão CNPJ foi anexado e está dentro do prazo de validade documental (${args.diasEmissaoCartao} dias desde a emissão).`);
    else if (args.statusValidadeCartao === 'vencido') partes.push(`O Cartão CNPJ foi anexado, porém está vencido para análise documental (${args.diasEmissaoCartao} dias desde a emissão).`);
    else partes.push('O Cartão CNPJ foi anexado, mas ainda depende de leitura IA/OCR ou revisão para confirmar a data de emissão e os campos do arquivo.');
  } else {
    partes.push('O Cartão CNPJ ainda não foi anexado ao acervo documental.');
  }
  partes.push(`Score CNPJ atual: ${args.score}/100, risco ${args.risco}.`);
  const criticos = args.alertas.filter((a) => a.severidade === 'critica' || a.severidade === 'alta');
  if (criticos.length) partes.push(`Pontos de atenção principais: ${criticos.slice(0, 3).map((a) => a.mensagem).join(' | ')}.`);
  partes.push(`Próxima ação recomendada: ${args.recomendacoes[0] || 'seguir para análise documental completa'}`);
  return partes.join('\n\n');
}
