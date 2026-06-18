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
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
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


function normalizarBasico(value: unknown): string {
  return normalizeText(value)
    .replace(/[.,;:()\[\]{}\/\\|_+*=!?'"´`^~<>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarNomeEmpresarial(value: unknown): string {
  return normalizeText(value)
    .replace(/\b(ltda|limitada|me|epp|eireli)\b/g, (m) => m)
    .replace(/[^a-z0-9]/g, '');
}

function normalizarCodigo(value: unknown, minDigits = 4): string {
  const digits = onlyDigits(value);
  return digits.length >= minDigits ? digits : '';
}

function codigoCnae(value: unknown): string {
  const digits = onlyDigits(value);
  // CNAE tem 7 dígitos. Ex.: 86.30-5-06 => 8630506.
  if (digits.length >= 7) return digits.slice(0, 7);
  return digits;
}

function codigoNatureza(value: unknown): string {
  const digits = onlyDigits(value);
  // Natureza jurídica costuma ter 4 dígitos. Ex.: 206-2 => 2062.
  if (digits.length >= 4) return digits.slice(0, 4);
  return digits;
}

function normalizarSituacao(value: unknown): string {
  const t = normalizarBasico(value);
  if (t.includes('ativa')) return 'ativa';
  if (t.includes('baixada')) return 'baixada';
  if (t.includes('inapta')) return 'inapta';
  if (t.includes('suspensa')) return 'suspensa';
  return t;
}

function tokensEndereco(value: unknown): Set<string> {
  const ignorar = new Set(['rua','r','avenida','av','numero','n','sn','sem','quadra','qd','lote','lt','sala','sl','go','goias','cep','bairro','distrito','municipio']);
  const t = normalizarBasico(value)
    .replace(/\b(s\/n|s n)\b/g, 'sn')
    .split(' ')
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !ignorar.has(x));
  return new Set(t);
}

function compararEndereco(receita: unknown, cartao: unknown) {
  const rOriginal = String(receita || '').trim();
  const cOriginal = String(cartao || '').trim();
  if (!rOriginal || !cOriginal) {
    return { label: 'Endereço completo', status: 'nao_comparado', receita, cartao, divergente: false, normalizado_receita: '', normalizado_cartao: '', motivo: 'Valor ausente em uma das fontes.' };
  }

  const cepR = onlyDigits(rOriginal).match(/\d{8}/)?.[0] || '';
  const cepC = onlyDigits(cOriginal).match(/\d{8}/)?.[0] || '';
  const normR = normalizarBasico(rOriginal);
  const normC = normalizarBasico(cOriginal);

  // Se o CEP é igual, não marcar divergência por diferença de ordem, abreviação, vírgula ou complemento.
  if (cepR && cepC && cepR === cepC) {
    return { label: 'Endereço completo', status: 'conferido', receita, cartao, divergente: false, normalizado_receita: normR, normalizado_cartao: normC, motivo: 'CEP igual; diferenças de formatação/ordem não são divergência.' };
  }

  const tr = tokensEndereco(rOriginal);
  const tc = tokensEndereco(cOriginal);
  const comum = [...tr].filter((x) => tc.has(x)).length;
  const base = Math.max(1, Math.min(tr.size, tc.size));
  const similaridade = comum / base;
  const divergente = similaridade < 0.65 && !(normR.includes(normC) || normC.includes(normR));

  return {
    label: 'Endereço completo',
    status: divergente ? 'divergente' : 'conferido',
    receita,
    cartao,
    divergente,
    normalizado_receita: normR,
    normalizado_cartao: normC,
    motivo: divergente ? `Tokens relevantes em comum insuficientes (${comum}/${base}).` : 'Endereço equivalente após normalização.',
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

async function buscarUltimoCartaoCnpj(empresaId: string): Promise<DocCartao | null> {
  // Fonte principal: acervo documental novo. Aceita sinônimos porque versões
  // anteriores/classificação IA usavam "cnpj_cartao".
  const existsCentral = await tableExists('documentos_arquivos');
  if (existsCentral) {
    const { rows } = await pool.query(
      `SELECT id, nome_original, mime_type, caminho_arquivo, data_emissao_documento, status_validade, resultado_validacao, criado_em
         FROM public.documentos_arquivos
        WHERE empresa_id = $1
          AND (tipo_documento IN ('cartao_cnpj','cnpj_cartao')
               OR lower(COALESCE(nome_original, '')) LIKE '%cartao%cnpj%'
               OR lower(COALESCE(nome_original, '')) LIKE '%comprovante%inscricao%'
               OR lower(COALESCE(nome_original, '')) LIKE '%receita%')
          AND excluido_em IS NULL
          AND COALESCE(status, 'ativo') <> 'excluido'
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
