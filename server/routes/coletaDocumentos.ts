import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { auth } from "../middleware/auth";
import {
  sanitizeFileName,
  validarArquivo,
} from "./documentos";
import { montarDossieCreditoEmpresa } from "./documentacao";
import {
  analiseDocumentalService,
  type AnaliseDocumentalResult,
} from "../services/analiseDocumentalEspecializada";
import { analisarCnpjReceitaCartaoEmpresa } from "../services/analiseCnpjReceitaCartao";
import { gerarMapaDocumentalCredito, type DocumentoMapa, type MapaDocumentalCredito } from "../services/mapaDocumentalCreditoService";
import { saveDocumentBuffer } from "../services/documentStorage";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PUBLIC_LINK_DAYS = 30;
const PUBLIC_ACCEPT = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".xlsx", ".csv", ".docx"].join(",");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const uploadWithFriendlyError = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (error: any) => {
    if (!error) return next();
    const mensagem = error?.code === "LIMIT_FILE_SIZE"
      ? "O arquivo excede o limite de 25 MB. Envie um PDF ou imagem menor."
      : error?.message || "Não foi possível receber o arquivo.";
    res.status(400).json({ error: mensagem, code: error?.code || "UPLOAD_INVALIDO" });
  });
};

const readRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas consultas. Aguarde alguns minutos e tente novamente." },
});

const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitos envios em pouco tempo. Aguarde alguns minutos antes de tentar novamente." },
});

const FISICOS_DOCUMENTOS_ARQUIVOS = new Set([
  "contrato_prestacao_servicos", "contrato_assessoria", "contrato_social", "alteracao_contratual", "contrato_gerado", "contrato_assinado",
  "cartao_cnpj", "qsa", "atos_junta_comercial", "nire", "estatuto", "procuracao",
  "documento_socio", "rg", "cpf", "cnh", "comprovante_residencia", "comprovante_endereco", "imposto_renda", "irpf", "recibo_irpf", "certidao_casamento", "averbacao_divorcio", "certidao_obito",
  "rating_bacen_cnpj", "cenprot_cnpj", "cnd_rfb_cnpj", "cadin_cnpj", "pgfn_cnpj", "enquadramento_tributario_cnpj", "situacao_fiscal_cnpj", "scr_cnpj", "ccs_cnpj", "ccf_cnpj", "consulta_serasa_cnpj",
  "rating_bacen_cpf", "cenprot_cpf", "cnd_rfb_cpf", "cadin_cpf", "pgfn_cpf", "enquadramento_tributario_cpf", "situacao_fiscal_cpf", "scr_cpf", "ccs_cpf", "ccf_cpf", "consulta_serasa_cpf",
  "simples_nacional", "pgdas", "pgmei", "ecf", "recibo_ecf", "recibo_pgdas", "recibo_pgmei", "defis", "dasn_simei", "recibo_defis",
  "faturamento_12_meses", "comprovante_faturamento", "declaracao_faturamento", "extrato_bancario", "balanco", "dre", "certidao",
  "compartilhamento_ecac", "foto_fachada", "foto_interna_1", "foto_interna_2", "foto_interna_3", "outros",
]);

const ANALISE_POR_TIPO: Record<string, { tipo: "qsa" | "simples_nacional" | "atos_junta_comercial" | "faturamento_12_meses" | "comprovante_residencia"; prompt: string }> = {
  qsa: { tipo: "qsa", prompt: "qsa_extract" },
  simples_nacional: { tipo: "simples_nacional", prompt: "simples_extract" },
  enquadramento_tributario_cnpj: { tipo: "simples_nacional", prompt: "simples_extract" },
  atos_junta_comercial: { tipo: "atos_junta_comercial", prompt: "atos_junta_extract" },
  faturamento_12_meses: { tipo: "faturamento_12_meses", prompt: "faturamento_12m_extract" },
  comprovante_faturamento: { tipo: "faturamento_12_meses", prompt: "faturamento_12m_extract" },
  declaracao_faturamento: { tipo: "faturamento_12_meses", prompt: "faturamento_12m_extract" },
  comprovante_residencia: { tipo: "comprovante_residencia", prompt: "comprovante_residencia_extract" },
};

type RequireEmpresaAccess = (req: Request, res: Response, empresaId: string) => Promise<boolean>;
type LinkRow = {
  id: string;
  empresa_id: string;
  status: "ativo" | "expirado" | "concluido" | "revogado";
  expira_em: string;
};
type PublicState = {
  link: { status: string; expira_em: string };
  empresa: { nome: string };
  progresso: { enviados: number; total: number; faltam: number; percentual: number };
  etapa_atual: { numero: number; titulo: string; objetivo: string } | null;
  proximo_documento: null | {
    codigo: string;
    nome: string;
    finalidade: string;
    obrigatorio: boolean;
    tipos_arquivo: string[];
    aceitar: string;
    observacao?: string;
  };
  ultimo_envio: null | {
    status: "processando" | "promovido" | "revisao_humana" | "recusado";
    item_codigo: string;
    mensagem: string;
    criado_em: string;
  };
  concluido: boolean;
};

type AnalysisDecision = {
  extractionId: string | null;
  analysisStatus: string;
  accepted: boolean;
  result: Record<string, any>;
  reason: string | null;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeText(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function publicBaseUrl(): string {
  return (process.env.PUBLIC_SITE_URL || "https://destravacredito.com").replace(/\/$/, "");
}

function friendlyAnalysisMessage(status: string, reason?: string | null): string {
  if (status === "promovido") return "Documento recebido e validado. Avançando para o próximo passo.";
  if (status === "recusado") return "Este documento precisa ser reenviado após a conferência da equipe.";
  if (reason === "sem_analisador_automatico") return "Recebemos o arquivo. Nossa equipe fará a conferência necessária antes de aceitá-lo.";
  return "Recebemos o arquivo, mas precisamos confirmar este documento. Se puder, envie uma foto ou PDF mais nítido; nossa equipe também fará a conferência.";
}

function severeAlert(result: any): boolean {
  const alertas = [
    ...(Array.isArray(result?.alertas) ? result.alertas : []),
    ...(Array.isArray(result?.divergencias) ? result.divergencias : []),
  ];
  return alertas.some((alerta: any) => ["alta", "critica"].includes(String(alerta?.severidade || "").toLowerCase()));
}

function mapItemToPhysicalType(item: DocumentoMapa): string {
  const firstSupported = item.tipos_arquivo.find((tipo) => FISICOS_DOCUMENTOS_ARQUIVOS.has(tipo));
  return firstSupported || "outros";
}

function mapearBlocoPorItem(itemCodigo: string, etapaNumero: number): string | null {
  const explicit: Record<string, string> = {
    cartao_cnpj: "cnpj_receita",
    qsa: "qsa_quadro_societario",
    enquadramento: "enquadramento_tributario",
    atos_junta: "atos_junta_comercial",
    contrato_social_vigente: "contrato_social_alteracoes",
    socios_identidade: "socios_representantes",
    socios_endereco: "socios_representantes",
    cnd_federal: "certidoes_regularidade",
    regularidade_fgts: "certidoes_regularidade",
    cndt: "certidoes_regularidade",
    certidao_estadual: "certidoes_regularidade",
    certidao_municipal: "certidoes_regularidade",
    estatuto_ata: "contrato_social_alteracoes",
    extratos_bancarios: "extratos_movimentacao_bancaria",
    faturamento_12m: "faturamento_historico",
    projecao_receitas: "previsao_faturamento",
    scr_pj: "scr_endividamento",
    rating_bureau_privado: "certidoes_regularidade",
    consulta_protestos: "certidoes_regularidade",
    ccmei: "enquadramento_tributario",
  };
  return explicit[itemCodigo] || (etapaNumero === 4 ? "faturamento_historico" : etapaNumero === 3 ? "certidoes_regularidade" : null);
}

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${tableName}`],
  );
  return rows[0]?.exists === true;
}

async function schemaReady(pool: Pool): Promise<boolean> {
  const tables = [
    "links_coleta_documentos",
    "coleta_documentos",
    "documentos_arquivos",
    "documentacao_blocos",
    "documentacao_entidade_blocos",
    "documentacao_bloco_arquivos",
  ];
  const values = await Promise.all(tables.map((table) => tableExists(pool, table).catch(() => false)));
  return values.every(Boolean);
}

async function resolveLink(pool: Pool, token: string): Promise<{ link: LinkRow | null; statusMessage?: string }> {
  if (!token || token.length > 160) return { link: null, statusMessage: "Link inválido. Solicite um novo link ao consultor responsável." };
  const { rows } = await pool.query(
    `SELECT id, empresa_id, status, expira_em
       FROM public.links_coleta_documentos
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash(token)],
  );
  const link = rows[0] as LinkRow | undefined;
  if (!link) return { link: null, statusMessage: "Link inválido. Solicite um novo link ao consultor responsável." };
  if (link.status === "ativo" && new Date(link.expira_em).getTime() <= Date.now()) {
    await pool.query(
      `UPDATE public.links_coleta_documentos
          SET status = 'expirado', atualizado_em = NOW()
        WHERE id = $1 AND status = 'ativo'`,
      [link.id],
    ).catch(() => undefined);
    return { link: null, statusMessage: "Este link expirou. Fale com o consultor responsável para receber um novo link." };
  }
  if (link.status === "expirado") return { link: null, statusMessage: "Este link expirou. Fale com o consultor responsável para receber um novo link." };
  if (link.status === "revogado") return { link: null, statusMessage: "Este link foi substituído ou revogado. Fale com o consultor responsável para receber um novo link." };
  if (link.status === "concluido") return { link, statusMessage: "Esta coleta já foi concluída. Fale com o consultor responsável se precisar atualizar algum documento." };
  return { link };
}

function findNextMapStep(mapa: MapaDocumentalCredito): { etapa: MapaDocumentalCredito["etapas"][number] | null; item: DocumentoMapa | null } {
  for (const etapa of Array.isArray(mapa?.etapas) ? mapa.etapas : []) {
    if (etapa.bloqueada) continue;
    const item = (etapa.documentos || []).find((candidate) => candidate.obrigatorio && !candidate.anexado);
    if (item) return { etapa, item };
  }
  return { etapa: null, item: null };
}

function toPublicDocument(item: DocumentoMapa) {
  return {
    codigo: item.codigo,
    nome: item.nome,
    finalidade: item.finalidade,
    obrigatorio: item.obrigatorio,
    tipos_arquivo: item.tipos_arquivo,
    aceitar: PUBLIC_ACCEPT,
    ...(item.observacao ? { observacao: item.observacao } : {}),
  };
}

async function latestPublicSubmission(pool: Pool, linkId: string): Promise<PublicState["ultimo_envio"]> {
  const { rows } = await pool.query(
    `SELECT status, item_codigo, criado_em
       FROM public.coleta_documentos
      WHERE link_id = $1
      ORDER BY criado_em DESC
      LIMIT 1`,
    [linkId],
  );
  const row = rows[0];
  if (!row || !["processando", "promovido", "revisao_humana", "recusado"].includes(String(row.status))) return null;
  const status = String(row.status) as NonNullable<PublicState["ultimo_envio"]>["status"];
  return {
    status,
    item_codigo: String(row.item_codigo),
    mensagem: friendlyAnalysisMessage(status),
    criado_em: row.criado_em,
  };
}

async function publicState(pool: Pool, link: LinkRow): Promise<PublicState> {
  const dossie = await montarDossieCreditoEmpresa(link.empresa_id);
  if (!dossie) throw Object.assign(new Error("Empresa não encontrada."), { statusCode: 404 });
  const mapa = dossie.mapa_documental_credito as MapaDocumentalCredito;
  const etapas = Array.isArray(mapa?.etapas) ? mapa.etapas : [];
  const obrigatorios = etapas.flatMap((etapa) => (etapa.documentos || []).filter((item) => item.obrigatorio));
  const enviados = obrigatorios.filter((item) => item.anexado).length;
  const proximoPasso = findNextMapStep(mapa);
  const etapaAtual = proximoPasso.etapa;
  const proximo = proximoPasso.item;
  const total = obrigatorios.length;
  const faltam = Math.max(0, total - enviados);
  const concluido = !proximo && faltam === 0;

  if (concluido) {
    await pool.query(
      `UPDATE public.links_coleta_documentos
          SET status = 'concluido', concluido_em = COALESCE(concluido_em, NOW()), atualizado_em = NOW()
        WHERE id = $1 AND status = 'ativo'`,
      [link.id],
    ).catch(() => undefined);
  }

  const empresaNome = String(dossie.empresa?.nome_fantasia || dossie.empresa?.razao_social || "sua empresa");
  return {
    link: { status: concluido ? "concluido" : link.status, expira_em: link.expira_em },
    empresa: { nome: empresaNome },
    progresso: {
      enviados,
      total,
      faltam,
      percentual: total ? Math.round((enviados / total) * 100) : 100,
    },
    etapa_atual: etapaAtual ? { numero: etapaAtual.numero, titulo: etapaAtual.titulo, objetivo: etapaAtual.objetivo } : null,
    proximo_documento: proximo ? toPublicDocument(proximo) : null,
    ultimo_envio: await latestPublicSubmission(pool, link.id),
    concluido,
  };
}

async function loadCurrentStep(pool: Pool, link: LinkRow, itemCodigo: string): Promise<{ dossie: any; item: DocumentoMapa; mapa: MapaDocumentalCredito }> {
  const dossie = await montarDossieCreditoEmpresa(link.empresa_id);
  if (!dossie) throw Object.assign(new Error("Empresa não encontrada."), { statusCode: 404 });
  const mapa = dossie.mapa_documental_credito as MapaDocumentalCredito;
  const proximoPasso = findNextMapStep(mapa);
  const etapa = proximoPasso.etapa;
  const item = proximoPasso.item && proximoPasso.item.codigo === itemCodigo ? proximoPasso.item : null;
  if (!item) throw Object.assign(new Error("Este documento não é o próximo passo desta coleta. Atualize a página e tente novamente."), { statusCode: 409, code: "COLETA_ETAPA_DESATUALIZADA" });
  return { dossie, item, mapa };
}

async function notifyFollowup(pool: Pool, empresaId: string, titulo: string, descricao: string): Promise<void> {
  try {
    if (!(await tableExists(pool, "empresa_followups"))) return;
    await pool.query(
      `INSERT INTO public.empresa_followups (empresa_id, titulo, tipo, descricao, data_agendada)
       VALUES ($1, $2, 'documento', $3, NOW())`,
      [empresaId, titulo.slice(0, 240), descricao.slice(0, 4000)],
    );
  } catch (error: any) {
    console.warn("[coleta-documentos] Não foi possível registrar follow-up:", error?.message || error);
  }
}

async function latestOfficialFile(pool: Pool, empresaId: string, types: string[]): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id
       FROM public.documentos_arquivos
      WHERE empresa_id = $1
        AND tipo_documento = ANY($2::text[])
        AND excluido_em IS NULL
        AND COALESCE(status, 'ativo') IN ('ativo', 'validado')
        AND COALESCE(metadados->>'coleta_status', '') <> 'staging'
      ORDER BY criado_em DESC
      LIMIT 1`,
    [empresaId, types],
  );
  return rows[0]?.id || null;
}

async function executeAnalysis(pool: Pool, empresaId: string, arquivoId: string, physicalType: string): Promise<AnalysisDecision> {
  if (["cartao_cnpj", "cnpj_cartao"].includes(physicalType)) {
    const analysis = await analisarCnpjReceitaCartaoEmpresa(empresaId, null, arquivoId, { persistir: false });
    const result = analysis?.resultado && typeof analysis.resultado === "object" ? analysis.resultado : analysis || {};
    const accepted = String(analysis?.status || "") === "concluida" && !severeAlert(result);
    return {
      extractionId: null,
      analysisStatus: String(analysis?.status || "falhou"),
      accepted,
      result,
      reason: accepted ? null : "revisao_humana",
    };
  }

  if (["contrato_social", "alteracao_contratual", "estatuto"].includes(physicalType)) {
    const atosId = await latestOfficialFile(pool, empresaId, ["atos_junta_comercial"]);
    if (!atosId) return { extractionId: null, analysisStatus: "revisao_humana", accepted: false, result: {}, reason: "atos_junta_ausentes" };
    const result = await analiseDocumentalService.analisarContratoComAtosJunta(empresaId, arquivoId, atosId);
    const extraction = await pool.query(
      `INSERT INTO public.documentos_extracoes_ia
        (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, campos_extraidos, pendencias, erros, processado_em)
       VALUES ($1, NULL, $2, 'contrato_junta_crosscheck', '1.0.0', $3::jsonb, $4::jsonb, $5::jsonb, '[]'::jsonb, NOW())
       RETURNING id`,
      [arquivoId, result.status, JSON.stringify(result), JSON.stringify(result.dados_extraidos || {}), JSON.stringify(result.alertas || [])],
    );
    const accepted = result.status === "concluido" && !severeAlert(result);
    return { extractionId: extraction.rows[0]?.id || null, analysisStatus: result.status, accepted, result, reason: accepted ? null : "revisao_humana" };
  }

  const config = ANALISE_POR_TIPO[physicalType];
  if (!config) return { extractionId: null, analysisStatus: "nao_disponivel", accepted: false, result: {}, reason: "sem_analisador_automatico" };

  const extraction = await pool.query(
    `INSERT INTO public.documentos_extracoes_ia
      (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, campos_extraidos, pendencias, erros)
     VALUES ($1, NULL, 'processando', $2, '1.0.0', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)
     RETURNING id`,
    [arquivoId, config.prompt],
  );
  const extractionId = extraction.rows[0]?.id || null;
  try {
    const result: AnaliseDocumentalResult = config.tipo === "qsa"
      ? await analiseDocumentalService.analisarQSA(empresaId, arquivoId)
      : config.tipo === "simples_nacional"
        ? await analiseDocumentalService.analisarSimplesNacional(empresaId, arquivoId)
        : config.tipo === "atos_junta_comercial"
          ? await analiseDocumentalService.analisarAtosJuntaComercial(empresaId, arquivoId)
          : config.tipo === "faturamento_12_meses"
            ? await analiseDocumentalService.analisarFaturamento(empresaId, arquivoId)
            : await analiseDocumentalService.analisarComprovanteResidencia(empresaId, arquivoId);
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = $2, modelo = $3, campos_extraidos = $4::jsonb, resultado = $5::jsonb,
              nivel_confianca = $6, pendencias = $7::jsonb, erros = '[]'::jsonb, processado_em = NOW(), atualizado_em = NOW()
        WHERE id = $1`,
      [extractionId, result.status, result.modelo_ia, JSON.stringify(result.dados_extraidos || {}), JSON.stringify(result), JSON.stringify(result.nivel_confianca), JSON.stringify(result.alertas || [])],
    );
    const accepted = result.status === "concluido" && !severeAlert(result);
    return { extractionId, analysisStatus: result.status, accepted, result, reason: accepted ? null : "revisao_humana" };
  } catch (error: any) {
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = 'falhou', erros = $2::jsonb, pendencias = $2::jsonb, processado_em = NOW(), atualizado_em = NOW()
        WHERE id = $1`,
      [extractionId, JSON.stringify([{ codigo: "analise_documental_falhou", mensagem: String(error?.message || "Falha de leitura").slice(0, 1000) }])],
    ).catch(() => undefined);
    return { extractionId, analysisStatus: "falhou", accepted: false, result: {}, reason: "falha_analise" };
  }
}

async function linkOfficialDocument(client: PoolClient, coleta: any, arquivoId: string, colaboradorId: string | null) {
  const blocoCodigo = mapearBlocoPorItem(String(coleta.item_codigo), Number(coleta.etapa_numero));
  if (!blocoCodigo) return;
  try {
    const block = await client.query("SELECT id FROM public.documentacao_blocos WHERE codigo = $1 LIMIT 1", [blocoCodigo]);
    if (!block.rows[0]?.id) return;
    const entityBlock = await client.query(
      `INSERT INTO public.documentacao_entidade_blocos
        (bloco_id, entidade_tipo, entidade_id, empresa_id, status, completo, validado, origem, atualizado_por)
       VALUES ($1, 'empresa', $2, $2, 'pendente', false, false, 'manual', $3)
       ON CONFLICT (entidade_tipo, entidade_id, bloco_id) DO UPDATE SET atualizado_por = EXCLUDED.atualizado_por, atualizacao_em = NOW()
       RETURNING id`,
      [block.rows[0].id, coleta.empresa_id, colaboradorId],
    );
    const entityBlockId = entityBlock.rows[0]?.id;
    if (!entityBlockId) return;
    await client.query(
      `INSERT INTO public.documentacao_bloco_arquivos
        (entidade_bloco_id, arquivo_id, tipo_documento, papel_documento, principal, status, observacoes)
       VALUES ($1, $2, $3, $4, false, 'validado', 'Recebido pela coleta pública e promovido após análise/revisão.')
       ON CONFLICT (entidade_bloco_id, arquivo_id) DO UPDATE SET status = 'validado', papel_documento = EXCLUDED.papel_documento, atualizacao_em = NOW()`,
      [entityBlockId, arquivoId, coleta.tipo_documento_fisico, coleta.item_codigo],
    );
  } catch (error: any) {
    console.warn("[coleta-documentos] Vínculo oficial não criado durante promoção:", error?.message || error);
  }
}

async function promoteSubmission(pool: Pool, coleta: any, colaboradorId: string | null, manualReason?: string | null): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE public.documentos_arquivos
          SET status = 'validado', validado = true, validado_por = $2, validado_em = NOW(),
              exige_revisao_humana = false,
              resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) || $3::jsonb,
              metadados = COALESCE(metadados, '{}'::jsonb) || jsonb_build_object('coleta_status', 'promovido', 'coleta_promovido_em', NOW()),
              atualizado_em = NOW()
        WHERE id = $1 AND excluido_em IS NULL
        RETURNING id`,
      [coleta.documento_arquivo_id, colaboradorId, JSON.stringify({ coleta_publica: { status: "promovido", item_codigo: coleta.item_codigo, revisao_manual: Boolean(manualReason), motivo: manualReason || null } })],
    );
    if (!updated.rows[0]) throw new Error("Arquivo da coleta não encontrado para promoção.");
    await client.query(
      `UPDATE public.coleta_documentos
          SET status = 'promovido', motivo_revisao = $2, revisado_por = $3, revisado_em = CASE WHEN $3 IS NULL THEN revisado_em ELSE NOW() END,
              promovido_em = NOW(), atualizado_em = NOW()
        WHERE id = $1`,
      [coleta.id, manualReason || null, colaboradorId],
    );
    await linkOfficialDocument(client, coleta, coleta.documento_arquivo_id, colaboradorId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function markLinkCompleteIfReady(pool: Pool, linkId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT empresa_id, status, expira_em FROM public.links_coleta_documentos WHERE id = $1 LIMIT 1`,
    [linkId],
  );
  const link = rows[0] as LinkRow | undefined;
  if (!link || link.status !== "ativo" || new Date(link.expira_em).getTime() <= Date.now()) return;
  try {
    const state = await publicState(pool, link);
    if (state.concluido) {
      await pool.query(
        `UPDATE public.links_coleta_documentos SET status = 'concluido', concluido_em = COALESCE(concluido_em, NOW()), atualizado_em = NOW() WHERE id = $1 AND status = 'ativo'`,
        [linkId],
      );
    }
  } catch (error: any) {
    console.warn("[coleta-documentos] Não foi possível recalcular conclusão do link:", error?.message || error);
  }
}

async function createLink(pool: Pool, empresaId: string, colaboradorId: string | null): Promise<{ token: string; url: string; expiraEm: Date }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`coleta-link:${empresaId}`]);
    await client.query(
      `UPDATE public.links_coleta_documentos
          SET status = 'revogado', revogado_em = NOW(), atualizado_em = NOW()
        WHERE empresa_id = $1 AND status = 'ativo'`,
      [empresaId],
    );
    const token = crypto.randomBytes(24).toString("base64url");
    const expiraEm = new Date(Date.now() + PUBLIC_LINK_DAYS * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO public.links_coleta_documentos (empresa_id, token_hash, status, criado_por, expira_em)
       VALUES ($1, $2, 'ativo', $3, $4)`,
      [empresaId, tokenHash(token), colaboradorId, expiraEm],
    );
    await client.query("COMMIT");
    return { token, url: `${publicBaseUrl()}/documentos/${token}`, expiraEm };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function sendSolicitationEmail(email: string, nome: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Envio de e-mail não configurado neste ambiente."), { statusCode: 503 });
  const remetente = process.env.RESEND_FROM_EMAIL || "Destrava Crédito <nao-responda@destravacredito.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: remetente,
      to: [email],
      subject: "Destrava Crédito — envio de documentos",
      html: `<p>Olá, ${escapeHtml(nome || "")}!</p><p>Para enviar os documentos da sua empresa com segurança, acesse o link abaixo:</p><p><a href="${escapeHtml(url)}">Enviar documentos</a></p><p>O link é válido por ${PUBLIC_LINK_DAYS} dias.</p>`,
    }),
  });
  if (!response.ok) throw Object.assign(new Error(`Falha ao enviar e-mail (HTTP ${response.status}).`), { statusCode: 502 });
}

function whatsappUrl(numero: string, nome: string, url: string): string {
  const digits = onlyDigits(numero);
  const ddi = digits.length <= 11 ? `55${digits}` : digits;
  const mensagem = `Olá${nome ? `, ${nome}` : ""}! Para enviar os documentos da sua empresa com segurança, acesse: ${url}`;
  return `https://wa.me/${ddi}?text=${encodeURIComponent(mensagem)}`;
}

export function createColetaDocumentosRouter(pool: Pool, requireEmpresaAccess: RequireEmpresaAccess): Router {
  const router = Router();

  router.post("/interno/empresas/:empresaId/link", auth, async (req: Request, res: Response) => {
    try {
      const empresaId = req.params.empresaId;
      if (!isUuid(empresaId)) { res.status(400).json({ error: "Empresa inválida." }); return; }
      if (!(await requireEmpresaAccess(req, res, empresaId))) return;
      const user = (req as any).colaborador || (req as any).user;
      const { rows } = await pool.query(
        `SELECT id, razao_social, nome_fantasia, email, telefone, whatsapp, responsavel_nome, responsavel_email, responsavel_telefone
           FROM public.empresas WHERE id = $1 LIMIT 1`,
        [empresaId],
      );
      const empresa = rows[0];
      if (!empresa) { res.status(404).json({ error: "Empresa não encontrada." }); return; }
      const link = await createLink(pool, empresaId, user?.id || null);
      const canal = String(req.body?.canal || "").toLowerCase();
      const destinatario = req.body?.destinatario && typeof req.body.destinatario === "object" ? req.body.destinatario : {};
      const nome = safeText(destinatario.nome || empresa.responsavel_nome || empresa.nome_fantasia || empresa.razao_social, 200);
      const email = safeText(destinatario.email || empresa.responsavel_email || empresa.email, 320);
      const telefone = safeText(destinatario.whatsapp || destinatario.telefone || empresa.responsavel_telefone || empresa.whatsapp || empresa.telefone, 40);
      const payload: Record<string, unknown> = { ok: true, url: link.url, expira_em: link.expiraEm, dias_validade: PUBLIC_LINK_DAYS, canal: "link" };
      if (canal === "email") {
        if (!email) { res.status(400).json({ error: "A empresa não possui e-mail de destino cadastrado.", url: link.url, expira_em: link.expiraEm }); return; }
        await sendSolicitationEmail(email, nome, link.url);
        payload.canal = "email";
        payload.mensagem = "Link de coleta enviado por e-mail.";
      } else if (canal === "whatsapp") {
        if (!telefone) { res.status(400).json({ error: "A empresa não possui telefone/WhatsApp de destino cadastrado.", url: link.url, expira_em: link.expiraEm }); return; }
        payload.canal = "whatsapp";
        payload.link_whatsapp = whatsappUrl(telefone, nome, link.url);
        payload.mensagem = "Link do WhatsApp preparado. Confirme o envio na janela aberta.";
      }
      res.status(201).json(payload);
    } catch (error: any) {
      console.error("[POST /api/coleta-documentos/interno/empresas/:empresaId/link]", error);
      res.status(Number(error?.statusCode || 500)).json({ error: error?.message || "Não foi possível gerar o link de coleta." });
    }
  });

  router.get("/interno/empresas/:empresaId/pendencias", auth, async (req: Request, res: Response) => {
    try {
      const empresaId = req.params.empresaId;
      if (!isUuid(empresaId)) { res.status(400).json({ error: "Empresa inválida." }); return; }
      if (!(await requireEmpresaAccess(req, res, empresaId))) return;
      const { rows } = await pool.query(
        `SELECT c.id, c.link_id, c.etapa_numero, c.item_codigo, c.tipo_documento_solicitado,
                c.tipo_documento_fisico, c.documento_arquivo_id, c.status, c.analise_status,
                c.motivo_revisao, c.criado_em, c.atualizado_em, c.promovido_em,
                d.nome_original, d.mime_type, d.tamanho_bytes,
                '/api/documentos/' || d.id::text || '/view' AS view_url
           FROM public.coleta_documentos c
           LEFT JOIN public.documentos_arquivos d ON d.id = c.documento_arquivo_id
          WHERE c.empresa_id = $1
            AND c.status IN ('pendente_analise','processando','revisao_humana','recusado')
          ORDER BY c.criado_em DESC
          LIMIT 100`,
        [empresaId],
      );
      res.json(rows);
    } catch (error: any) {
      console.error("[GET /api/coleta-documentos/interno/empresas/:empresaId/pendencias]", error);
      res.status(500).json({ error: "Não foi possível carregar as pendências da coleta." });
    }
  });

  router.post("/interno/pendencias/:id/revisar", auth, async (req: Request, res: Response) => {
    try {
      if (!isUuid(req.params.id)) { res.status(400).json({ error: "Pendência inválida." }); return; }
      const { rows } = await pool.query("SELECT * FROM public.coleta_documentos WHERE id = $1 LIMIT 1", [req.params.id]);
      const coleta = rows[0];
      if (!coleta) { res.status(404).json({ error: "Pendência não encontrada." }); return; }
      if (!(await requireEmpresaAccess(req, res, coleta.empresa_id))) return;
      const acao = String(req.body?.acao || "").toLowerCase();
      const motivo = safeText(req.body?.motivo, 4000) || null;
      if (!["aceitar", "recusar"].includes(acao)) { res.status(400).json({ error: "Informe a ação aceitar ou recusar." }); return; }
      if (!["pendente_analise", "processando", "revisao_humana", "recusado"].includes(String(coleta.status))) {
        res.status(409).json({ error: "Esta pendência já foi resolvida." }); return;
      }
      const user = (req as any).colaborador || (req as any).user;
      if (acao === "aceitar") {
        await promoteSubmission(pool, coleta, user?.id || null, motivo || "Aceito após revisão humana.");
        await notifyFollowup(pool, coleta.empresa_id, "Documento da coleta pública aceito", `O documento ${coleta.item_codigo} foi conferido e promovido ao Acervo Documental.`);
        await markLinkCompleteIfReady(pool, coleta.link_id);
        res.json({ ok: true, status: "promovido", mensagem: friendlyAnalysisMessage("promovido") });
        return;
      }
      await pool.query(
        `UPDATE public.coleta_documentos
            SET status = 'recusado', motivo_revisao = $2, revisado_por = $3, revisado_em = NOW(), atualizado_em = NOW()
          WHERE id = $1`,
        [coleta.id, motivo || "Documento não aceito após revisão humana.", user?.id || null],
      );
      await pool.query(
        `UPDATE public.documentos_arquivos
            SET status = 'recusado', exige_revisao_humana = true,
                resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) || $2::jsonb,
                atualizado_em = NOW()
          WHERE id = $1`,
        [coleta.documento_arquivo_id, JSON.stringify({ coleta_publica: { status: "recusado", item_codigo: coleta.item_codigo, motivo: motivo || null } })],
      );
      await notifyFollowup(pool, coleta.empresa_id, "Documento da coleta pública precisa de reenvio", `O documento ${coleta.item_codigo} foi recusado na revisão humana. Motivo: ${motivo || "não informado"}`);
      res.json({ ok: true, status: "recusado", mensagem: friendlyAnalysisMessage("recusado") });
    } catch (error: any) {
      console.error("[POST /api/coleta-documentos/interno/pendencias/:id/revisar]", error);
      res.status(Number(error?.statusCode || 500)).json({ error: error?.message || "Não foi possível revisar a pendência." });
    }
  });

  router.get("/:token", readRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!(await schemaReady(pool))) { res.status(503).json({ error: "A coleta documental ainda está sendo preparada. Tente novamente em instantes.", code: "MIGRATION_PENDING" }); return; }
      const resolved = await resolveLink(pool, req.params.token);
      if (!resolved.link) { res.status(410).json({ error: resolved.statusMessage }); return; }
      const state = await publicState(pool, resolved.link);
      res.json(state);
    } catch (error: any) {
      console.error("[GET /api/coleta-documentos/:token]", error);
      res.status(Number(error?.statusCode || 500)).json({ error: "Não foi possível carregar esta coleta. Tente novamente ou fale com o consultor responsável." });
    }
  });

  router.post("/:token/upload", uploadRateLimiter, uploadWithFriendlyError, async (req: Request, res: Response) => {
    let arquivoSalvo: { absolutePath: string; relativePath: string; sha256: string } | null = null;
    try {
      if (!(await schemaReady(pool))) { res.status(503).json({ error: "A coleta documental ainda está sendo preparada. Tente novamente em instantes.", code: "MIGRATION_PENDING" }); return; }
      const resolved = await resolveLink(pool, req.params.token);
      if (!resolved.link) { res.status(410).json({ error: resolved.statusMessage }); return; }
      if (resolved.link.status !== "ativo") { res.status(410).json({ error: resolved.statusMessage || "Esta coleta não aceita novos envios." }); return; }
      const itemCodigo = safeText(req.body?.item_codigo, 160);
      if (!itemCodigo) { res.status(400).json({ error: "Informe o documento solicitado nesta etapa." }); return; }
      const { item, mapa } = await loadCurrentStep(pool, resolved.link, itemCodigo);
      const file = req.file;
      if (!file) { res.status(400).json({ error: "Anexe um PDF, foto ou arquivo do documento solicitado." }); return; }
      const physicalType = mapItemToPhysicalType(item);
      validarArquivo(file, physicalType);

      const previous = await pool.query(
        `SELECT id, status FROM public.coleta_documentos
          WHERE link_id = $1 AND item_codigo = $2
          ORDER BY criado_em DESC LIMIT 1`,
        [resolved.link.id, itemCodigo],
      );
      const previousStatus = String(previous.rows[0]?.status || "");
      if (["pendente_analise", "processando"].includes(previousStatus)) {
        res.status(409).json({ error: "Este documento já está sendo analisado. Aguarde o resultado.", code: "COLETA_EM_PROCESSAMENTO" }); return;
      }
      if (previousStatus === "promovido") {
        res.status(409).json({ error: "Este documento já foi aceito. Atualize a página para seguir ao próximo passo.", code: "COLETA_DOCUMENTO_JA_ACEITO" }); return;
      }

      const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
      const safeOriginal = sanitizeFileName(file.originalname || "arquivo");
      const ext = safeOriginal.includes(".") ? safeOriginal.slice(safeOriginal.lastIndexOf(".")).toLowerCase() : "";
      const nomeArquivo = `${crypto.randomUUID()}${ext}`;
      arquivoSalvo = await saveDocumentBuffer({ entidadeTipo: "empresa", entidadeId: resolved.link.empresa_id, filename: nomeArquivo, buffer: file.buffer, expectedSha256: hash });
      const documentoResult = await pool.query(
        `INSERT INTO public.documentos_arquivos
          (entidade_tipo, entidade_id, empresa_id, tipo_documento, nome_original, nome_arquivo, caminho_arquivo,
           mime_type, tamanho_bytes, hash_arquivo, status, origem, obrigatorio, validado, exige_revisao_humana, metadados)
         VALUES ('empresa', $1, $1, $2, $3, $4, $5, $6, $7, $8, 'pendente_validacao', 'upload_manual', true, false, true, $9::jsonb)
         RETURNING id`,
        [resolved.link.empresa_id, physicalType, file.originalname || safeOriginal, nomeArquivo, arquivoSalvo.relativePath, file.mimetype, file.size, hash, JSON.stringify({ coleta_status: "staging", coleta_link_id: resolved.link.id, coleta_item_codigo: itemCodigo, coleta_tipo_solicitado: item.tipos_arquivo })],
      ).catch(async (error) => {
        if (arquivoSalvo) await fs.unlink(arquivoSalvo.absolutePath).catch(() => undefined);
        throw error;
      });
      const arquivoId = documentoResult.rows[0]?.id;
      if (!arquivoId) throw new Error("Não foi possível registrar o arquivo recebido.");
      const coletaResult = await pool.query(
        `INSERT INTO public.coleta_documentos
          (link_id, empresa_id, etapa_numero, item_codigo, tipo_documento_solicitado, tipo_documento_fisico, documento_arquivo_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'processando')
         RETURNING *`,
        [resolved.link.id, resolved.link.empresa_id, mapa.etapa_atual, itemCodigo, item.tipos_arquivo[0] || physicalType, physicalType, arquivoId],
      );
      const coleta = coletaResult.rows[0];
      let decision: AnalysisDecision;
      try {
        decision = await executeAnalysis(pool, resolved.link.empresa_id, arquivoId, physicalType);
      } catch (error: any) {
        decision = { extractionId: null, analysisStatus: "falhou", accepted: false, result: {}, reason: "falha_analise" };
        console.warn("[coleta-documentos] Falha controlada na análise:", error?.message || error);
      }
      const status = decision.accepted ? "processando" : "revisao_humana";
      const reason = decision.accepted ? null : decision.reason;
      await pool.query(
        `UPDATE public.coleta_documentos
            SET status = $2, analise_status = $3, analise_extracao_id = $4,
                analise_resultado = $5::jsonb, motivo_revisao = $6, atualizado_em = NOW(),
                promovido_em = CASE WHEN $2 = 'promovido' THEN NOW() ELSE NULL END
          WHERE id = $1`,
        [coleta.id, status, decision.analysisStatus, decision.extractionId, JSON.stringify(decision.result || {}), reason],
      );
      await pool.query(
        `UPDATE public.documentos_arquivos
            SET resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) || $2::jsonb,
                exige_revisao_humana = $3, atualizado_em = NOW()
          WHERE id = $1`,
        [arquivoId, JSON.stringify({ coleta_publica: { status, item_codigo: itemCodigo, analise_status: decision.analysisStatus, motivo: reason, analise: decision.result || {} } }), !decision.accepted],
      );
      if (decision.accepted) {
        await promoteSubmission(pool, { ...coleta, documento_arquivo_id: arquivoId, empresa_id: resolved.link.empresa_id, item_codigo: itemCodigo, etapa_numero: mapa.etapa_atual }, null);
        await notifyFollowup(pool, resolved.link.empresa_id, "Novo documento recebido pela coleta pública", `O documento ${item.nome} foi recebido e aceito automaticamente no Acervo Documental.`);
        await markLinkCompleteIfReady(pool, resolved.link.id);
        res.status(201).json({ ok: true, status: "promovido", mensagem: friendlyAnalysisMessage("promovido") });
        return;
      }
      await notifyFollowup(pool, resolved.link.empresa_id, "Novo documento recebido pela coleta pública", `O documento ${item.nome} chegou pelo link público e aguarda revisão humana.`);
      res.status(202).json({ ok: true, status: "revisao_humana", mensagem: friendlyAnalysisMessage("revisao_humana", reason), pode_reenviar: true });
    } catch (error: any) {
      if (arquivoSalvo && error?.code !== "COLETA_DOCUMENTO_JA_ACEITO" && error?.code !== "COLETA_EM_PROCESSAMENTO") await fs.unlink(arquivoSalvo.absolutePath).catch(() => undefined);
      console.error("[POST /api/coleta-documentos/:token/upload]", error);
      res.status(Number(error?.statusCode || 400)).json({ error: error?.message || "Não foi possível receber o documento." });
    }
  });

  return router;
}

export { FISICOS_DOCUMENTOS_ARQUIVOS, PUBLIC_LINK_DAYS, tokenHash, mapItemToPhysicalType, severeAlert };
