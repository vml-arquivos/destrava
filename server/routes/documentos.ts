import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pkg from 'pg';
import { auth } from '../middleware/auth';

// Importa utilitários de validação/sanitização centralizados. Estas funções
// fornecem validações padrão como isUuid, safeJson e sanitizeFileName. A
// presença deste import permite futura refatoração para remover as
// implementações duplicadas neste arquivo.
import { isUuid as uuidValidator, safeJson as toSafeJson, sanitizeFileName as normalizeFileName } from '../utils/validators';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const router = Router();

const ENTIDADES = [
  'empresa', 'cliente_pf', 'lead', 'socio', 'contrato', 'simulacao',
  'acompanhamento_bancario', 'acompanhamento_financeiro', 'faturamento', 'contador', 'outros',
] as const;

const STATUS = ['ativo', 'arquivado', 'substituido', 'excluido', 'pendente_validacao', 'validado', 'recusado'];
const ORIGENS = ['upload_manual', 'gerado_sistema', 'importado_api', 'sincronizacao', 'migracao'];

const TIPOS_DOCUMENTO = [
  // Contratos
  'contrato_prestacao_servicos', 'contrato_assessoria', 'contrato_social', 'alteracao_contratual',
  'contrato_gerado', 'contrato_assinado',
  // Empresa
  'cartao_cnpj', 'qsa', 'atos_junta_comercial', 'nire', 'estatuto', 'procuracao',
  // Sócios / Pessoal
  'documento_socio', 'rg', 'cpf', 'cnh', 'comprovante_residencia', 'comprovante_endereco',
  'imposto_renda', 'irpf', 'recibo_irpf', 'certidao_casamento', 'averbacao_divorcio', 'certidao_obito',
  // Certidões CNPJ
  'rating_bacen_cnpj', 'cenprot_cnpj', 'cnd_rfb_cnpj', 'cadin_cnpj', 'pgfn_cnpj',
  'scr_cnpj', 'ccs_cnpj', 'ccf_cnpj', 'consulta_serasa_cnpj',
  // Certidões CPF
  'rating_bacen_cpf', 'cenprot_cpf', 'cnd_rfb_cpf', 'cadin_cpf', 'pgfn_cpf',
  'scr_cpf', 'ccs_cpf', 'ccf_cpf', 'consulta_serasa_cpf',
  // Fiscal / Tributário
  'simples_nacional', 'pgdas', 'pgmei', 'ecf',
  'recibo_ecf', 'recibo_pgdas', 'recibo_pgmei',
  'defis', 'dasn_simei', 'recibo_defis', 'recibo_dasn_simei',
  // Financeiro
  'faturamento_12_meses', 'comprovante_faturamento', 'declaracao_faturamento',
  'extrato_bancario', 'balanco', 'dre', 'certidao',
  // eCAC / Fotos
  'compartilhamento_ecac',
  'foto_fachada', 'foto_interna_1', 'foto_interna_2', 'foto_interna_3',
  // Outros
  'outros',
];

const DOCUMENTOS_PESSOAIS = new Set([
  'documento_socio', 'rg', 'cpf', 'cnh', 'comprovante_residencia', 'imposto_renda', 'irpf', 'recibo_irpf',
  'certidao_casamento', 'averbacao_divorcio', 'certidao_obito', 'rating_bacen_cpf', 'cenprot_cpf',
  'cnd_rfb_cpf', 'cadin_cpf', 'pgfn_cpf', 'scr_cpf', 'ccs_cpf', 'ccf_cpf', 'consulta_serasa_cpf',
]);
const DOCUMENTOS_EMPRESA = new Set([
  'contrato_prestacao_servicos', 'contrato_assessoria', 'cartao_cnpj', 'qsa', 'atos_junta_comercial',
  'contrato_social', 'alteracao_contratual', 'comprovante_endereco', 'rating_bacen_cnpj', 'cenprot_cnpj',
  'cnd_rfb_cnpj', 'cadin_cnpj', 'pgfn_cnpj', 'simples_nacional', 'pgdas', 'pgmei', 'ecf',
  'recibo_ecf', 'recibo_pgdas', 'recibo_pgmei', 'defis', 'dasn_simei', 'recibo_defis', 'recibo_dasn_simei',
  'scr_cnpj', 'ccs_cnpj', 'ccf_cnpj', 'consulta_serasa_cnpj', 'compartilhamento_ecac', 'foto_fachada',
  'foto_interna_1', 'foto_interna_2', 'foto_interna_3', 'faturamento_12_meses', 'nire', 'estatuto',
]);

const MIME_EXT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'application/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeFileName(original: string): string {
  const base = path.basename(original || 'arquivo');
  const normalized = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^\.+/, '').slice(0, 140) || 'arquivo';
}


const EXPORT_FOLDER_LABELS: Record<string, string> = {
  contrato_prestacao_servicos: '01_Contrato_de_prestacao_de_servicos',
  contrato_assessoria: '01_Contrato_de_prestacao_de_servicos',
  cartao_cnpj: '02_CNPJ_Cartao_CNPJ',
  qsa: '03_QSA',
  atos_junta_comercial: '04_Atos_da_Junta_Comercial',
  contrato_social: '05_Contrato_social_e_alteracoes',
  alteracao_contratual: '05_Contrato_social_e_alteracoes',
  documento_socio: '06A_Documento_de_identificacao_do_socio',
  rg: '06A_Documento_de_identificacao_do_socio',
  cnh: '06A_Documento_de_identificacao_do_socio',
  cpf: '06A_Documento_de_identificacao_do_socio',
  comprovante_residencia: '06B_Comprovante_de_endereco_do_socio',
  irpf: '06C_IRPF_do_socio',
  imposto_renda: '06C_IRPF_do_socio',
  recibo_irpf: '06D_Recibo_IRPF',
  certidao_casamento: '06E_Estado_civil_conjuge_averbacoes',
  averbacao_divorcio: '06E_Estado_civil_conjuge_averbacoes',
  certidao_obito: '06E_Estado_civil_conjuge_averbacoes',
  rating_bacen_cnpj: '07_Rating_BACEN_CNPJ',
  rating_bacen_cpf: '08_Rating_BACEN_CPF',
  cenprot_cnpj: '09_CENPROT_CNPJ',
  cenprot_cpf: '10_CENPROT_CPF',
  cnd_rfb_cnpj: '11_CND_RFB_CNPJ',
  cnd_rfb_cpf: '12_CND_RFB_CPF',
  cadin_cnpj: '12A_CADIN_CNPJ',
  cadin_cpf: '12A_CADIN_CPF',
  pgfn_cnpj: '12B_PGFN_CNPJ',
  pgfn_cpf: '12B_PGFN_CPF',
  simples_nacional: '13_Simples_Nacional',
  pgdas: '14_PGDAS_ECF_PGMEI',
  pgmei: '14_PGDAS_ECF_PGMEI',
  ecf: '14_PGDAS_ECF_PGMEI',
  recibo_pgdas: '15_Recibo_ECF_PGDAS_PGMEI',
  recibo_pgmei: '15_Recibo_ECF_PGDAS_PGMEI',
  recibo_ecf: '15_Recibo_ECF_PGDAS_PGMEI',
  defis: '16_DEFIS_DASN_SIMEI',
  dasn_simei: '16_DEFIS_DASN_SIMEI',
  recibo_defis: '17_Recibo_DEFIS_DASN_SIMEI_ECF',
  recibo_dasn_simei: '17_Recibo_DEFIS_DASN_SIMEI_ECF',
  scr_cnpj: '18_SCR_CNPJ',
  ccs_cnpj: '19_CCS_CNPJ',
  ccf_cnpj: '20_CCF_CNPJ',
  scr_cpf: '21_SCR_CPF',
  ccs_cpf: '22_CCS_CPF',
  ccf_cpf: '23_CCF_CPF',
  compartilhamento_ecac: '24_Compartilhamento_eCAC',
  foto_fachada: '25_Fotos_da_empresa',
  foto_interna_1: '25_Fotos_da_empresa',
  foto_interna_2: '25_Fotos_da_empresa',
  foto_interna_3: '25_Fotos_da_empresa',
  faturamento_12_meses: '26_Faturamento_12_meses',
  comprovante_faturamento: '26_Faturamento_12_meses',
  declaracao_faturamento: '26_Faturamento_12_meses',
  outros: '99_Outros_documentos',
};

function exportFolderForTipo(tipoDocumento: string): string {
  return EXPORT_FOLDER_LABELS[tipoDocumento] || tipoDocumento || 'documento';
}


function escapeZipName(name: string): Buffer {
  return Buffer.from(name.replace(/\\/g, '/').replace(/^\/+/, ''), 'utf8');
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function createZip(files: Array<{ name: string; data: Buffer; mtime?: Date }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = escapeZipName(file.name);
    const data = file.data;
    const crc = crc32(data);
    const dt = dosDateTime(file.mtime || new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dt.time, 10);
    local.writeUInt16LE(dt.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dt.time, 12);
    central.writeUInt16LE(dt.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function getMaxSize(tipoDocumento: string, mime: string): number {
  if (tipoDocumento === 'contrato_social' || tipoDocumento === 'alteracao_contratual' || tipoDocumento === 'contrato_gerado') return 20 * 1024 * 1024;
  if (mime.startsWith('image/')) return 10 * 1024 * 1024;
  return 10 * 1024 * 1024;
}

async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function existsIn(table: string, id: string): Promise<boolean> {
  if (!(await tableExists(table))) return false;
  const { rows } = await pool.query(`SELECT 1 FROM public.${table} WHERE id=$1 LIMIT 1`, [id]);
  return rows.length > 0;
}

async function getSocioEmpresaId(socioId: string): Promise<string | null> {
  if (!(await tableExists('socios_empresa'))) return null;
  const { rows } = await pool.query('SELECT empresa_id FROM public.socios_empresa WHERE id=$1 LIMIT 1', [socioId]);
  return rows[0]?.empresa_id || null;
}

async function getContratoRefs(contratoId: string): Promise<{ empresa_id?: string | null; cliente_pf_id?: string | null; lead_id?: string | null } | null> {
  const tables = ['contratos_gerados', 'contratos'];
  for (const table of tables) {
    if (!(await tableExists(table))) continue;
    const { rows } = await pool.query(`SELECT * FROM public.${table} WHERE id=$1 LIMIT 1`, [contratoId]);
    if (rows.length) return rows[0];
  }
  return null;
}

async function existsSimulacao(id: string): Promise<boolean> {
  for (const table of ['simulacoes', 'simulacoes_colaborador']) {
    if (await existsIn(table, id)) return true;
  }
  return false;
}

function assertAllowedRelation(entidadeTipo: string, tipoDocumento: string, body: any) {
  // Documentos pessoais podem ser vinculados à empresa NO ACERVO DOCUMENTAL da empresa
  // (sem exigir socio_id) para simplificar o fluxo de upload da ficha da empresa.
  // Quando socio_id for informado, o documento fica vinculado ao sócio específico.
  // A restrição original (entidade_tipo='empresa' sem socio_id) bloqueava uploads legítimos.
  if (entidadeTipo === 'cliente_pf' && DOCUMENTOS_EMPRESA.has(tipoDocumento)) {
    throw new Error('Documento empresarial não pode ser vinculado a cliente PF.');
  }
  if (!tipoDocumento) throw new Error('tipo_documento é obrigatório.');
}

async function validarEntidade(entidadeTipo: string, entidadeId: string, body: any) {
  if (!ENTIDADES.includes(entidadeTipo as any)) throw new Error('entidade_tipo inválido.');
  if (!uuidValidator(entidadeId)) throw new Error('entidade_id inválido ou ausente.');

  if (entidadeTipo === 'empresa') {
    if (!(await existsIn('empresas', entidadeId))) throw new Error('Empresa não encontrada.');
    if (body.empresa_id && body.empresa_id !== entidadeId) throw new Error('empresa_id deve ser igual a entidade_id para entidade empresa.');
    return { empresa_id: entidadeId };
  }

  if (entidadeTipo === 'cliente_pf') {
    if (!(await existsIn('clientes_pf', entidadeId))) throw new Error('Cliente PF não encontrado.');
    if (body.cliente_pf_id && body.cliente_pf_id !== entidadeId) throw new Error('cliente_pf_id deve ser igual a entidade_id para entidade cliente_pf.');
    return { cliente_pf_id: entidadeId };
  }

  if (entidadeTipo === 'lead') {
    if (!(await existsIn('leads', entidadeId))) throw new Error('Lead não encontrado.');
    return { lead_id: entidadeId };
  }

  if (entidadeTipo === 'socio') {
    const empresaSocio = await getSocioEmpresaId(entidadeId);
    if (!empresaSocio) throw new Error('Sócio/representante não encontrado.');
    if (!body.empresa_id || body.empresa_id !== empresaSocio) throw new Error('empresa_id é obrigatório e deve bater com o sócio.');
    if (body.socio_id && body.socio_id !== entidadeId) throw new Error('socio_id deve ser igual a entidade_id para entidade socio.');
    return { socio_id: entidadeId, empresa_id: empresaSocio };
  }

  if (entidadeTipo === 'contrato') {
    const refs = await getContratoRefs(entidadeId);
    if (!refs) throw new Error('Contrato não encontrado.');
    return { contrato_id: entidadeId, empresa_id: body.empresa_id || refs.empresa_id || null, cliente_pf_id: body.cliente_pf_id || refs.cliente_pf_id || null, lead_id: body.lead_id || refs.lead_id || null };
  }

  if (entidadeTipo === 'simulacao') {
    if (!(await existsSimulacao(entidadeId))) throw new Error('Simulação/análise não encontrada.');
    return { simulacao_id: entidadeId, empresa_id: body.empresa_id || null, cliente_pf_id: body.cliente_pf_id || null };
  }

  return {};
}

function validarArquivo(file: Express.Multer.File, tipoDocumento: string) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExt = MIME_EXT[file.mimetype];
  if (!allowedExt) throw new Error(`MIME type não permitido: ${file.mimetype || 'desconhecido'}`);
  if (!allowedExt.includes(ext)) throw new Error(`Extensão incompatível com o MIME type. Esperado: ${allowedExt.join(', ')}`);
  const max = getMaxSize(tipoDocumento, file.mimetype);
  if (file.size > max) throw new Error(`Arquivo excede o limite de ${(max / 1024 / 1024).toFixed(0)}MB para este tipo.`);
}

async function auditar(documentoId: string, acao: string, antes: any, depois: any, usuarioId: string | null) {
  await pool.query(
    `INSERT INTO public.auditoria_documentos (documento_id, acao, antes, depois, usuario_id)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
    [documentoId, acao, JSON.stringify(antes || null), JSON.stringify(depois || null), usuarioId]
  ).catch((err) => console.warn('[auditoria_documentos]', err.message));
}

router.get('/', auth, async (req: Request, res: Response) => {
  try {
    const filtrosPermitidos = ['entidade_tipo', 'entidade_id', 'empresa_id', 'cliente_pf_id', 'lead_id', 'socio_id', 'contrato_id', 'simulacao_id', 'tipo_documento', 'status'];
    const where: string[] = ['excluido_em IS NULL', "status <> 'excluido'"];
    const values: unknown[] = [];

    // Quando busca por empresa (entidade_tipo='empresa' + entidade_id=UUID),
    // retornar TAMBÉM documentos de sócios/entidades vinculadas via empresa_id.
    // Isso garante que o Acervo Documental mostre tudo relacionado à empresa.
    const entidadeTipoBusca = typeof req.query.entidade_tipo === 'string' ? req.query.entidade_tipo.trim() : '';
    const entidadeIdBusca = typeof req.query.entidade_id === 'string' ? req.query.entidade_id.trim() : '';

    if (entidadeTipoBusca === 'empresa' && entidadeIdBusca) {
      // Busca ampla: docs diretamente da empresa OU vinculados via empresa_id
      values.push(entidadeIdBusca);
      where.push(`(entidade_id = $${values.length} OR empresa_id = $${values.length})`);
      // Aplicar outros filtros opcionais (exceto entidade_tipo e entidade_id já tratados)
      for (const f of filtrosPermitidos) {
        if (f === 'entidade_tipo' || f === 'entidade_id') continue;
        const value = req.query[f];
        if (typeof value === 'string' && value.trim()) {
          values.push(value.trim());
          where.push(`${f} = $${values.length}`);
        }
      }
    } else {
      // Comportamento padrão para outras entidades
      for (const f of filtrosPermitidos) {
        const value = req.query[f];
        if (typeof value === 'string' && value.trim()) {
          values.push(value.trim());
          where.push(`${f} = $${values.length}`);
        }
      }
    }

    const { rows } = await pool.query(
      `SELECT id, entidade_tipo, entidade_id, empresa_id, cliente_pf_id, lead_id, socio_id, contrato_id, simulacao_id,
              tipo_documento, nome_original, nome_arquivo, url_arquivo, mime_type, tamanho_bytes, hash_arquivo,
              status, origem, obrigatorio, validado, validado_por, validado_em, observacoes, metadados,
              data_emissao_documento, data_validade_documento, validade_dias, status_validade, exige_revisao_humana,
              nome_customizado, resultado_validacao, ultima_extracao_ia_id, ultima_indexacao_rag_id,
              criado_por, criado_em, atualizado_em, excluido_em
         FROM public.documentos_arquivos
        WHERE ${where.join(' AND ')}
        ORDER BY criado_em DESC`,
      values
    );
    res.json(rows);
  } catch (err: any) {
    console.error('[GET /api/documentos]', err);
    res.status(500).json({ error: 'Erro ao listar documentos' });
  }
});

router.post('/upload', auth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    if (!user?.id) { res.status(401).json({ error: 'Usuário autenticado é obrigatório' }); return; }
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'Arquivo é obrigatório' }); return; }

    const entidadeTipo = String(req.body.entidade_tipo || '').trim();
    const entidadeId = String(req.body.entidade_id || '').trim();
    const tipoDocumento = String(req.body.tipo_documento || '').trim();
    if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) { res.status(400).json({ error: 'tipo_documento inválido' }); return; }
    assertAllowedRelation(entidadeTipo, tipoDocumento, req.body);
    const refs = await validarEntidade(entidadeTipo, entidadeId, req.body);
    validarArquivo(file, tipoDocumento);

    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const safeOriginal = normalizeFileName(file.originalname || 'arquivo');
    const ext = path.extname(safeOriginal).toLowerCase();
    const nomeArquivo = `${crypto.randomUUID()}${ext}`;
    const dataDir = process.env.DATA_DIR || '/data';
    const uploadDir = path.join(dataDir, 'uploads', 'documentos', entidadeTipo, entidadeId);
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const caminhoArquivo = path.join(uploadDir, nomeArquivo);
    if (!caminhoArquivo.startsWith(uploadDir)) throw new Error('Caminho de arquivo inválido.');
    await fs.promises.writeFile(caminhoArquivo, file.buffer, { flag: 'wx' });

    const origem = ORIGENS.includes(String(req.body.origem)) ? String(req.body.origem) : 'upload_manual';
    let status = STATUS.includes(String(req.body.status)) ? String(req.body.status) : 'ativo';
    const nomeCustomizado = String(req.body.nome_customizado || '').trim() || null;
    const dataEmissaoDocumento = String(req.body.data_emissao_documento || '').trim() || null;
    let statusValidade = 'nao_verificado';
    let dataValidadeDocumento: string | null = null;
    let exigeRevisaoHumana = false;
    const resultadoValidacao: Record<string, unknown> = {};

    if (dataEmissaoDocumento) {
      const emissao = new Date(`${dataEmissaoDocumento}T00:00:00`);
      if (!Number.isNaN(emissao.getTime())) {
        const dias = Math.floor((Date.now() - emissao.getTime()) / (1000 * 60 * 60 * 24));
        resultadoValidacao.dias_desde_emissao = dias;
        if (tipoDocumento === 'cartao_cnpj') {
          const validade = new Date(emissao);
          validade.setDate(validade.getDate() + 30);
          dataValidadeDocumento = validade.toISOString().slice(0, 10);
          statusValidade = dias > 30 ? 'vencido' : 'valido';
          if (dias > 30) {
            status = 'recusado';
            exigeRevisaoHumana = true;
            resultadoValidacao.mensagem = 'Cartão CNPJ emitido há mais de 30 dias. Envie documento atualizado.';
          }
        } else {
          statusValidade = 'pendente';
        }
      }
    } else if (tipoDocumento === 'cartao_cnpj') {
      statusValidade = 'pendente';
      exigeRevisaoHumana = true;
      resultadoValidacao.mensagem = 'Aguardando extração automática por IA/OCR da data de emissão do Cartão CNPJ antes do relatório.';
    }

    const { rows } = await pool.query(
      `INSERT INTO public.documentos_arquivos
        (entidade_tipo, entidade_id, empresa_id, cliente_pf_id, lead_id, socio_id, contrato_id, simulacao_id,
         tipo_documento, nome_original, nome_arquivo, caminho_arquivo, url_arquivo, mime_type, tamanho_bytes,
         hash_arquivo, status, origem, obrigatorio, validado, observacoes, metadados, criado_por,
         data_emissao_documento, data_validade_documento, validade_dias, status_validade, exige_revisao_humana, nome_customizado, resultado_validacao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,
               $23,$24,$25,$26,$27,$28,$29::jsonb)
       RETURNING id, entidade_tipo, entidade_id, empresa_id, cliente_pf_id, lead_id, socio_id, contrato_id, simulacao_id,
                 tipo_documento, nome_original, nome_customizado, nome_arquivo, mime_type, tamanho_bytes, hash_arquivo, status, origem,
                 obrigatorio, validado, observacoes, metadados, data_emissao_documento, data_validade_documento, validade_dias,
                 status_validade, exige_revisao_humana, resultado_validacao, criado_por, criado_em, atualizado_em`,
      [
        entidadeTipo, entidadeId, (refs as any).empresa_id || req.body.empresa_id || null, (refs as any).cliente_pf_id || req.body.cliente_pf_id || null,
        (refs as any).lead_id || req.body.lead_id || null, (refs as any).socio_id || req.body.socio_id || null,
        (refs as any).contrato_id || req.body.contrato_id || null, (refs as any).simulacao_id || req.body.simulacao_id || null,
        tipoDocumento, file.originalname || safeOriginal, nomeArquivo, caminhoArquivo, file.mimetype, file.size,
        hash, status, origem, String(req.body.obrigatorio) === 'true', status === 'validado', req.body.observacoes || null,
        JSON.stringify(toSafeJson(req.body.metadados)), user.id,
        dataEmissaoDocumento, dataValidadeDocumento, tipoDocumento === 'cartao_cnpj' ? 30 : null, statusValidade,
        exigeRevisaoHumana, nomeCustomizado, JSON.stringify(resultadoValidacao),
      ]
    );
    await auditar(rows[0].id, 'upload', null, rows[0], user.id);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error('[POST /api/documentos/upload]', err);
    res.status(400).json({ error: err.message || 'Erro ao enviar documento' });
  }
});

router.patch('/:id', auth, async (req: Request, res: Response) => {
  try {
    if (!uuidValidator(req.params.id)) { res.status(400).json({ error: 'ID inválido' }); return; }
    const user = (req as any).colaborador || (req as any).user;
    const before = await pool.query('SELECT * FROM public.documentos_arquivos WHERE id=$1 AND excluido_em IS NULL', [req.params.id]);
    if (!before.rows.length) { res.status(404).json({ error: 'Documento não encontrado' }); return; }

    const fields: string[] = [];
    const values: unknown[] = [];
    const body = req.body || {};
    if (body.tipo_documento !== undefined) {
      if (!TIPOS_DOCUMENTO.includes(String(body.tipo_documento))) { res.status(400).json({ error: 'tipo_documento inválido' }); return; }
      values.push(String(body.tipo_documento)); fields.push(`tipo_documento=$${values.length}`);
    }
    if (body.status !== undefined) {
      if (!STATUS.includes(String(body.status))) { res.status(400).json({ error: 'status inválido' }); return; }
      values.push(String(body.status)); fields.push(`status=$${values.length}`);
    }
    if (body.observacoes !== undefined) { values.push(body.observacoes || null); fields.push(`observacoes=$${values.length}`); }
    if (body.nome_customizado !== undefined) { values.push(String(body.nome_customizado || '').trim() || null); fields.push(`nome_customizado=$${values.length}`); }
    if (body.data_emissao_documento !== undefined) { values.push(body.data_emissao_documento || null); fields.push(`data_emissao_documento=$${values.length}`); }
    if (body.status_validade !== undefined) { values.push(String(body.status_validade || 'nao_verificado')); fields.push(`status_validade=$${values.length}`); }
    if (body.resultado_validacao !== undefined) { values.push(JSON.stringify(toSafeJson(body.resultado_validacao))); fields.push(`resultado_validacao=$${values.length}::jsonb`); }
    if (body.metadados !== undefined) { values.push(JSON.stringify(toSafeJson(body.metadados))); fields.push(`metadados=$${values.length}::jsonb`); }
    if (body.obrigatorio !== undefined) { values.push(Boolean(body.obrigatorio)); fields.push(`obrigatorio=$${values.length}`); }
    if (body.validado !== undefined) {
      values.push(Boolean(body.validado)); fields.push(`validado=$${values.length}`);
      values.push(Boolean(body.validado) ? user?.id || null : null); fields.push(`validado_por=$${values.length}`);
      fields.push(`validado_em=${Boolean(body.validado) ? 'NOW()' : 'NULL'}`);
    }
    if (!fields.length) { res.status(400).json({ error: 'Nenhum campo permitido para atualizar' }); return; }
    fields.push('atualizado_em=NOW()');
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE public.documentos_arquivos SET ${fields.join(', ')} WHERE id=$${values.length} RETURNING *`,
      values
    );
    await auditar(req.params.id, 'atualizacao', before.rows[0], rows[0], user?.id || null);
    res.json(rows[0]);
  } catch (err: any) {
    console.error('[PATCH /api/documentos/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar documento' });
  }
});

router.delete('/:id', auth, async (req: Request, res: Response) => {
  try {
    if (!uuidValidator(req.params.id)) { res.status(400).json({ error: 'ID inválido' }); return; }
    const user = (req as any).colaborador || (req as any).user;
    const before = await pool.query('SELECT * FROM public.documentos_arquivos WHERE id=$1 AND excluido_em IS NULL', [req.params.id]);
    if (!before.rows.length) { res.status(404).json({ error: 'Documento não encontrado' }); return; }
    const { rows } = await pool.query(
      `UPDATE public.documentos_arquivos
          SET status='excluido', excluido_em=NOW(), atualizado_em=NOW()
        WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    await auditar(req.params.id, 'exclusao_logica', before.rows[0], rows[0], user?.id || null);
    res.json({ success: true, documento: rows[0] });
  } catch (err: any) {
    console.error('[DELETE /api/documentos/:id]', err);
    res.status(500).json({ error: 'Erro ao excluir documento' });
  }
});

async function sendProtectedFile(req: Request, res: Response, inline: boolean) {
  if (!uuidValidator(req.params.id)) { res.status(400).json({ error: 'ID inválido' }); return; }
  const { rows } = await pool.query(
    `SELECT * FROM public.documentos_arquivos WHERE id=$1 AND excluido_em IS NULL AND status <> 'excluido' LIMIT 1`,
    [req.params.id]
  );
  if (!rows.length) { res.status(404).json({ error: 'Documento não encontrado' }); return; }
  const doc = rows[0];
  const filePath = path.resolve(doc.caminho_arquivo);

  // Aceitar qualquer caminho dentro de diretórios de upload válidos
  const dataDir = path.resolve(process.env.DATA_DIR || '/data');
  const localUploads = path.resolve('uploads');
  const appUploads = '/app/uploads';
  const varData = '/var/data';

  const isAllowed = filePath.startsWith(dataDir)
    || filePath.startsWith(localUploads)
    || filePath.startsWith(appUploads)
    || filePath.startsWith(varData);

  if (!isAllowed) {
    console.error(`[sendProtectedFile] Caminho bloqueado: ${filePath} (dataDir=${dataDir})`);
    res.status(403).json({ error: 'Caminho de arquivo não permitido' }); return;
  }
  if (!fs.existsSync(filePath)) {
    console.error(`[sendProtectedFile] Arquivo não encontrado: ${filePath}`);
    res.status(404).json({ error: 'Arquivo físico não encontrado no servidor' }); return;
  }
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
  const disposition = inline ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename="${normalizeFileName(doc.nome_original || doc.nome_arquivo)}"`);
  fs.createReadStream(filePath).pipe(res);
}

router.get('/:id/download', auth, async (req, res) => {
  try { await sendProtectedFile(req, res, false); }
  catch (err) { console.error('[GET /api/documentos/:id/download]', err); res.status(500).json({ error: 'Erro ao baixar documento' }); }
});

router.get('/:id/view', auth, async (req, res) => {
  try { await sendProtectedFile(req, res, true); }
  catch (err) { console.error('[GET /api/documentos/:id/view]', err); res.status(500).json({ error: 'Erro ao visualizar documento' }); }
});


router.post('/exportar', auth, async (req: Request, res: Response) => {
  try {
    const idsRaw = Array.isArray(req.body?.documento_ids) ? req.body.documento_ids : Array.isArray(req.body?.documentoIds) ? req.body.documentoIds : [];
    const ids = Array.from(new Set(idsRaw.map((id: unknown) => String(id || '').trim()).filter(isUuid)));
    if (!ids.length) { res.status(400).json({ error: 'Informe ao menos um documento para exportar.' }); return; }
    if (ids.length > 100) { res.status(400).json({ error: 'Exporte no máximo 100 documentos por vez.' }); return; }

    const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT * FROM public.documentos_arquivos
        WHERE id IN (${placeholders}) AND excluido_em IS NULL AND status <> 'excluido'
        ORDER BY tipo_documento, criado_em DESC`,
      ids
    );
    if (!rows.length) { res.status(404).json({ error: 'Nenhum documento encontrado para exportação.' }); return; }

    const dataDir = path.resolve(process.env.DATA_DIR || '/data');
    const localUploads = path.resolve('uploads');
    const appUploads = '/app/uploads';
    const varData = '/var/data';
    const files: Array<{ name: string; data: Buffer; mtime?: Date }> = [];
    const usedNames = new Map<string, number>();

    for (const doc of rows as any[]) {
      const filePath = path.resolve(doc.caminho_arquivo || '');
      const isAllowed = filePath.startsWith(dataDir)
        || filePath.startsWith(localUploads)
        || filePath.startsWith(appUploads)
        || filePath.startsWith(varData);
      if (!filePath || !isAllowed || !fs.existsSync(filePath)) {
        continue;
      }
      const baseName = normalizeFileName(doc.nome_customizado || doc.nome_original || doc.nome_arquivo || `${doc.id}.bin`);
      const folder = normalizeFileName(exportFolderForTipo(doc.tipo_documento || 'documento'));
      const key = `${folder}/${baseName}`;
      const count = usedNames.get(key) || 0;
      usedNames.set(key, count + 1);
      const parsed = path.parse(baseName);
      const finalName = count > 0 ? `${folder}/${parsed.name}_${count + 1}${parsed.ext}` : `${folder}/${baseName}`;
      files.push({ name: finalName, data: await fs.promises.readFile(filePath), mtime: doc.criado_em ? new Date(doc.criado_em) : new Date() });
    }

    if (!files.length) { res.status(404).json({ error: 'Os registros existem, mas os arquivos físicos não foram encontrados no servidor.' }); return; }
    const zip = createZip(files);
    const filename = `documentos-destrava-${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(zip.length));
    res.send(zip);
  } catch (err: any) {
    console.error('[POST /api/documentos/exportar]', err);
    res.status(500).json({ error: 'Erro ao exportar documentos' });
  }
});

router.get('/pendencias/:entidadeTipo/:entidadeId', auth, async (req: Request, res: Response) => {
  try {
    const resultado = await calcularPendenciasDocumentais(req.params.entidadeTipo, req.params.entidadeId);
    res.json(resultado);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao calcular pendências documentais' });
  }
});

export async function calcularPendenciasDocumentais(entidadeTipo: string, entidadeId: string) {
  if (!ENTIDADES.includes(entidadeTipo as any) || !uuidValidator(entidadeId)) throw new Error('Entidade inválida');

  const obrigatoriosPorEntidade: Record<string, string[]> = {
    empresa: ['contrato_social'],
    cliente_pf: ['cpf', 'rg', 'comprovante_residencia'],
    socio: ['cpf', 'rg', 'comprovante_residencia'],
    contrato: ['contrato_gerado'],
    simulacao: ['comprovante_faturamento', 'extrato_bancario'],
  };
  const obrigatorios = obrigatoriosPorEntidade[entidadeTipo] || [];
  const { rows } = await pool.query(
    `SELECT tipo_documento, status, validado
       FROM public.documentos_arquivos
      WHERE entidade_tipo=$1 AND entidade_id=$2 AND excluido_em IS NULL AND status <> 'excluido'`,
    [entidadeTipo, entidadeId]
  );
  const porTipo = new Map<string, any[]>();
  for (const row of rows) porTipo.set(row.tipo_documento, [...(porTipo.get(row.tipo_documento) || []), row]);

  const documentos_obrigatorios = obrigatorios.map((tipo_documento) => {
    const docs = porTipo.get(tipo_documento) || [];
    const melhor = docs.find((d) => d.status === 'validado' || d.validado) || docs[0];
    return {
      tipo_documento,
      presente: docs.length > 0,
      validado: Boolean(melhor?.validado || melhor?.status === 'validado'),
      status: melhor?.status || 'ausente',
    };
  });

  const pendencias: string[] = [];
  for (const doc of documentos_obrigatorios) {
    if (!doc.presente) pendencias.push(`Falta documento obrigatório: ${doc.tipo_documento}`);
    else if (doc.status === 'recusado') pendencias.push(`Documento recusado: ${doc.tipo_documento}`);
    else if (doc.status === 'pendente_validacao' || !doc.validado) pendencias.push(`Documento pendente de validação: ${doc.tipo_documento}`);
  }

  return { completo: pendencias.length === 0, pendencias, documentos_obrigatorios };
}

export default router;
