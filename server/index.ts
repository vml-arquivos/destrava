import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import pkg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { auth } from "./middleware/auth.ts";
import { authorize } from "./middleware/authorize.ts";
import cnpjRouter from './routes/cnpj.ts';
import sociosDocumentosRouter from './routes/socios_documentos.ts';
import { ETAPA_FUNIL_DEFAULT, ETAPAS_FUNIL_VALIDAS, normalizarEtapaFunil } from "../shared/funnel.ts";
import { gerarHtmlTimbrado, getPuppeteerHeaderTemplate, getPuppeteerFooterTemplate, getDocumentStyles, CONTRATADA_DADOS, getHtmlHeaderEmbutido, getHtmlFooterEmbutido } from "./letterhead.ts";
import {
  calcularReferenciasAcompanhamento,
  calcularTotaisSemana as calcTotaisSem,
  calcularCompensacaoMensal,
  gerarDiagnosticoSemana,
  calcularAcumulados,
} from "./funcoes_acompanhamento.ts";

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── PostgreSQL Pool ─────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[DB] Erro inesperado no pool:", err.message);
});

// Testa a conexão ao iniciar
pool.query("SELECT 1").then(() => {
  console.log("🗄️  PostgreSQL: ✅ Conectado");
  // Auto-migrate removido. Toda DDL é executada via scripts SQL manuais em /db/.
}).catch((e) => {
  console.error("🗄️  PostgreSQL: ❌ Falha na conexão —", e.message);
});

// ─── n8n Webhook helper ──────────────────────────────────────────────────────
async function dispararN8n(evento: string, payload: Record<string, unknown>): Promise<boolean> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log(`[n8n] Webhook não configurado — evento "${evento}" ignorado.`);
    return false;
  }
  try {
    const body = JSON.stringify({ evento, timestamp: new Date().toISOString(), ...payload });
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      console.log(`[n8n] Webhook "${evento}" enviado (${res.status})`);
      return true;
    } else {
      console.warn(`[n8n] Webhook "${evento}" retornou ${res.status}`);
      return false;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[n8n] Erro ao enviar webhook "${evento}": ${msg}`);
    return false;
  }
}


async function processarEmpresaDaSimulacao(
  client: any,
  dados: {
    razao_social: string;
    cnpj?: string | null;
    telefone?: string | null;
    email?: string | null;
    colaborador_id?: string | null;
  }
): Promise<string | null> {
  if (!dados.razao_social || !dados.razao_social.trim()) return null;

  const cleanCnpj = dados.cnpj ? dados.cnpj.replace(/\D/g, "") : null;
  const cleanPhone = dados.telefone ? dados.telefone.replace(/\D/g, "") : null;
  const cleanNome = dados.razao_social.trim();

  if (cleanCnpj && cleanCnpj.length >= 11) {
    const res = await client.query(
      `SELECT id FROM empresas WHERE regexp_replace(cnpj, '\\D', '', 'g') = $1 LIMIT 1`,
      [cleanCnpj]
    );
    if (res.rows.length > 0) return res.rows[0].id;
  }

  if (cleanPhone) {
    const res = await client.query(
      `SELECT id FROM empresas 
       WHERE lower(trim(razao_social)) = lower($1) 
       AND regexp_replace(telefone, '\\D', '', 'g') = $2 LIMIT 1`,
      [cleanNome, cleanPhone]
    );
    if (res.rows.length > 0) return res.rows[0].id;
  }

  if (dados.email && dados.email.trim()) {
    const res = await client.query(
      `SELECT id FROM empresas 
       WHERE lower(trim(razao_social)) = lower($1) 
       AND lower(trim(email)) = lower($2) LIMIT 1`,
      [cleanNome, dados.email.trim()]
    );
    if (res.rows.length > 0) return res.rows[0].id;
  }

  const res = await client.query(
    `INSERT INTO empresas (razao_social, cnpj, telefone, email, responsavel_id, origem)
     VALUES ($1, $2, $3, $4, $5, 'simulador')
     RETURNING id`,
    [cleanNome, dados.cnpj || null, dados.telefone || null, dados.email || null, dados.colaborador_id || null]
  );
  return res.rows[0].id;
}

// ─── Cargos e hierarquia de permissões ──────────────────────────────────────
const CARGOS_VALIDOS = [
  'Administrador',
  'Diretor',
  'Gerente Comercial',
  'Analista de Crédito',
  'Consultor de Crédito',
  'Captador Externo',
  'Estagiário',
] as const;

const CARGOS_GESTAO = ['administrador', 'diretor', 'gerente comercial', 'admin', 'gerente', 'gestor'];
const CARGOS_PODEM_CRIAR_USUARIOS = ['administrador', 'diretor', 'gerente comercial', 'admin'];
const CARGOS_BLOQUEADOS_ATENDIMENTO = ['captador externo', 'estagiário', 'estagiario'];
const CARGOS_CAPTACAO = ['captador externo', 'gerente comercial', 'diretor', 'consultor de crédito', 'consultor de credito', 'administrador', 'admin'];

// ─── Hierarquia de cargos (nível 0 = mais alto) ───────────────────────────────
// Regra: cada cargo só pode ver/criar/editar cargos com nível ESTRITAMENTE MAIOR
const HIERARQUIA_CARGOS: Record<string, number> = {
  'administrador': 0,
  'admin':         0,
  'diretor':       1,
  'gerente comercial': 2,
  'analista de crédito':  3,
  'analista de credito':  3,
  'consultor de crédito': 4,
  'consultor de credito': 4,
  'captador externo': 5,
  'estagiário': 6,
  'estagiario': 6,
};

/** Retorna o nível numérico do cargo (menor = mais alto na hierarquia) */
function nivelCargo(cargo: string): number {
  return HIERARQUIA_CARGOS[(cargo || '').toLowerCase()] ?? 99;
}

/** Retorna true se o solicitante pode gerenciar o alvo (nível do alvo > nível do solicitante) */
function podeGerenciarCargo(solicitanteCargo: string, alvoCargo: string): boolean {
  return nivelCargo(alvoCargo) > nivelCargo(solicitanteCargo);
}

/** Retorna os cargos que o solicitante pode criar/atribuir */
function cargosGerenciaveis(solicitanteCargo: string): string[] {
  const nivel = nivelCargo(solicitanteCargo);
  return CARGOS_VALIDOS.filter(c => nivelCargo(c) > nivel);
}

function isGestorCargo(cargo: string): boolean {
  return CARGOS_GESTAO.includes((cargo || '').toLowerCase());
}

function perfilOperacionalPorCargo(cargo: string | null | undefined): 'admin' | 'gestor' | 'agente' | 'analista' {
  const cargoNormalizado = (cargo || '').toLowerCase();
  if (['administrador', 'admin', 'diretor'].includes(cargoNormalizado)) return 'admin';
  if (['gerente comercial', 'gerente', 'gestor'].includes(cargoNormalizado)) return 'gestor';
  if (['analista de crédito', 'analista de credito', 'analista'].includes(cargoNormalizado)) return 'analista';
  return 'agente';
}

function podeAtenderLeadsPorCargo(cargo: string | null | undefined): boolean {
  return !CARGOS_BLOQUEADOS_ATENDIMENTO.includes((cargo || '').toLowerCase());
}

function podeVerTodosLeadsPorPerfilOuCargo(perfil: string | null | undefined, cargo: string | null | undefined): boolean {
  return ['admin', 'gestor'].includes((perfil || '').toLowerCase()) || isGestorCargo(cargo || '');
}

function colaboradorPodeVerTudo(colaborador: any): boolean {
  return Boolean(
    colaborador?.pode_ver_todos_leads
    || podeVerTodosLeadsPorPerfilOuCargo(colaborador?.perfil, colaborador?.cargo)
  );
}

function aplicarFiltroVisibilidadeLead({
  conditions,
  params,
  colaborador,
  scope,
  responsavelId,
  alias = '',
}: {
  conditions: string[];
  params: any[];
  colaborador: any;
  scope?: string;
  responsavelId?: string;
  alias?: string;
}) {
  const podeVerTudo = colaboradorPodeVerTudo(colaborador);
  const prefix = alias ? `${alias}.` : '';
  const responsavelExpr = `${prefix}responsavel_id`;
  const leadIdExpr = `${prefix}id`;

  if (podeVerTudo) {
    if (scope === 'meus' && colaborador?.id) {
      params.push(colaborador.id);
      conditions.push(`${responsavelExpr} = $${params.length}`);
    } else if (scope === 'sem_responsavel') {
      conditions.push(`${responsavelExpr} IS NULL`);
    } else if (responsavelId) {
      params.push(responsavelId);
      conditions.push(`${responsavelExpr} = $${params.length}`);
    }
    return;
  }

  if (!colaborador?.id) return;

  params.push(colaborador.id);
  const responsavelParam = params.length;

  let chatwootClause = '';
  if (colaborador?.chatwoot_agente_id !== undefined && colaborador?.chatwoot_agente_id !== null) {
    params.push(Number(colaborador.chatwoot_agente_id));
    const chatwootParam = params.length;
    chatwootClause = ` OR EXISTS (
      SELECT 1
        FROM crm_conversas cc
       WHERE cc.lead_id = ${leadIdExpr}
         AND (
           cc.agente_responsavel_id = $${responsavelParam}
           OR cc.chatwoot_assignee_id = $${chatwootParam}
         )
    )`;
  }

  conditions.push(`(${responsavelExpr} = $${responsavelParam}${chatwootClause})`);
}

async function leadPertenceAoColaborador(leadId: string, colaborador: any): Promise<boolean> {
  if (colaboradorPodeVerTudo(colaborador)) return true;
  if (!leadId || !colaborador?.id) return false;

  const params: any[] = [];
  const conditions: string[] = ['id = $1'];
  params.push(leadId);
  aplicarFiltroVisibilidadeLead({
    conditions,
    params,
    colaborador,
  });

  const { rows } = await pool.query(
    `SELECT id FROM leads WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params
  );

  return rows.length > 0;
}

function validarEtapaFunil(value: string | null | undefined): string {
  return normalizarEtapaFunil(value);
}

function etapaFunilPermitida(value: string | null | undefined): boolean {
  return ETAPAS_FUNIL_VALIDAS.includes(validarEtapaFunil(value) as (typeof ETAPAS_FUNIL_VALIDAS)[number]);
}

const MAPA_ETAPA_UI_PARA_LEGADA: Record<string, string> = {
  entrada: "novo",
  triagem: "novo",
  contato: "contato_feito",
  qualificacao: "qualificado",
  documentos: "documentacao",
  analise: "negociacao",
  proposta: "proposta_enviada",
  negociacao: "negociacao",
  ganho: "ganho",
  perdido: "perdido",
  reativacao: "novo",
  carteira: "ganho",
};

const MAPA_ETAPA_LEGADA_PARA_UI: Record<string, string> = {
  novo: "entrada",
  contato_feito: "contato",
  qualificado: "qualificacao",
  documentacao: "documentos",
  proposta_enviada: "analise",
  negociacao: "analise",
  ganho: "ganho",
  perdido: "perdido",
};

function etapaUiParaLegada(value: string | null | undefined): string {
  const etapaUi = validarEtapaFunil(value);
  return MAPA_ETAPA_UI_PARA_LEGADA[etapaUi] || "novo";
}

function etapaLegadaParaUi(value: string | null | undefined): string {
  const etapa = String(value || "").trim().toLowerCase();
  return MAPA_ETAPA_LEGADA_PARA_UI[etapa] || validarEtapaFunil(etapa);
}

function podecriarUsuarios(cargo: string): boolean {
  return CARGOS_PODEM_CRIAR_USUARIOS.includes((cargo || '').toLowerCase());
}

function colaboradorPodeGerenciarCarteira(colaborador: any): boolean {
  return colaboradorPodeVerTudo(colaborador);
}

function colaboradorPodeAtribuirResponsavel(colaborador: any, responsavelAtual: string | null | undefined, novoResponsavel: string | null | undefined): boolean {
  if (colaboradorPodeGerenciarCarteira(colaborador)) return true;
  if (!colaborador?.id) return false;
  if (!novoResponsavel) return false;
  const colaboradorId = String(colaborador.id);
  const responsavelAtualId = responsavelAtual ? String(responsavelAtual) : null;
  return String(novoResponsavel) === colaboradorId && (!responsavelAtualId || responsavelAtualId === colaboradorId);
}

async function colaboradorAtivoExiste(colaboradorId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT id FROM colaboradores WHERE id = $1 AND ativo = true LIMIT 1`,
    [colaboradorId]
  );
  return rows.length > 0;
}

async function registrarCrmLog({
  leadId,
  usuarioId,
  acao,
}: {
  leadId: string;
  usuarioId?: string | null;
  acao: string;
}) {
  if (!leadId || !acao) return;

  try {
    await pool.query(
      `INSERT INTO crm_logs (lead_id, usuario_id, acao, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [leadId, usuarioId || null, acao]
    );
  } catch (err) {
    console.error("[CRM LOG ERROR]", err);
  }
}

async function garantirEntradaAutomaticaFunil(leadId: string) {
  if (!leadId) return;

  const { rows } = await pool.query(
    `UPDATE leads
        SET etapa_funil = $2,
            status = CASE WHEN status IS NULL OR btrim(status) = '' THEN $2 ELSE status END,
            updated_at = NOW()
      WHERE id = $1
        AND (etapa_funil IS NULL OR btrim(etapa_funil) = '')
      RETURNING id`,
    [leadId, ETAPA_FUNIL_DEFAULT]
  );

  if (rows.length > 0) {
    await registrarCrmLog({
      leadId,
      usuarioId: null,
      acao: `entrada_funil_automatica:${ETAPA_FUNIL_DEFAULT}`,
    });
  }
}

type ChatwootConversationPayload = {
  id?: number | string | null;
  inbox_id?: number | string | null;
  status?: string | null;
  meta?: {
    sender?: {
      id?: number | string | null;
      name?: string | null;
      phone_number?: string | null;
    } | null;
    assignee?: {
      id?: number | string | null;
      name?: string | null;
    } | null;
  } | null;
  messages?: Array<Record<string, any>>;
  last_non_activity_message?: Record<string, any> | null;
  last_activity_at?: number | string | null;
  created_at?: number | string | null;
  updated_at?: number | string | null;
};

function obterConfigChatwoot() {
  const baseUrl = (process.env.CHATWOOT_URL || '').trim().replace(/\/+$/, '');
  const apiToken = (process.env.CHATWOOT_API_TOKEN || '').trim();
  const accountId = Number(process.env.CHATWOOT_ACCOUNT_ID || 0);

  if (!baseUrl || !apiToken || !Number.isFinite(accountId) || accountId <= 0) {
    throw new Error('Configuração do Chatwoot incompleta. Defina CHATWOOT_URL, CHATWOOT_API_TOKEN e CHATWOOT_ACCOUNT_ID.');
  }

  return { baseUrl, apiToken, accountId };
}

function normalizarTelefone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizarStatusConversaChatwoot(status: string | null | undefined): 'aberta' | 'fechada' | 'pendente_ia' {
  const normalizedStatus = String(status || '').trim().toLowerCase();

  if (['resolved', 'resolvida', 'closed'].includes(normalizedStatus)) {
    return 'fechada';
  }

  if (['pending', 'snoozed'].includes(normalizedStatus)) {
    return 'pendente_ia';
  }

  return 'aberta';
}

function toIsoFromUnix(value: unknown): string | null {
  const numeric = toNullableNumber(value);
  if (!numeric) return null;
  const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function escolherMensagemChatwoot(conversation: ChatwootConversationPayload): Record<string, any> | null {
  if (Array.isArray(conversation.messages) && conversation.messages.length > 0) {
    return conversation.messages[conversation.messages.length - 1] || null;
  }
  return conversation.last_non_activity_message || null;
}

async function sincronizarConversaChatwoot(conversation: ChatwootConversationPayload, origem: 'chatwoot_sync' | 'chatwoot_backfill' = 'chatwoot_sync') {
  const chatwootConvId = conversation?.id?.toString() || null;
  if (!chatwootConvId) {
    return { updated: false, reason: 'sem_chatwoot_conv_id' };
  }

  const sender = conversation?.meta?.sender || null;
  const assignee = conversation?.meta?.assignee || null;
  const chatwootContactId = toNullableNumber(sender?.id);
  const chatwootInboxId = toNullableNumber(conversation?.inbox_id);
  const chatwootAssigneeId = toNullableNumber(assignee?.id);
  const telefone = normalizarTelefone(sender?.phone_number);
  const nomeContato = (sender?.name || '').trim() || null;
  const statusConversa = normalizarStatusConversaChatwoot(conversation?.status);
  const ultimaMensagem = escolherMensagemChatwoot(conversation);
  const lastActivityIso = toIsoFromUnix(conversation?.last_activity_at)
    || toIsoFromUnix(ultimaMensagem?.created_at)
    || toIsoFromUnix(conversation?.updated_at)
    || toIsoFromUnix(conversation?.created_at);
  const lastActivityTs = lastActivityIso ?? null;
  const payloadUltimoEvento = conversation ? JSON.stringify(conversation) : null;

  let agenteResponsavelId: string | null = null;
  if (chatwootAssigneeId) {
    const agenteResponsavel = await pool.query(
      `SELECT id FROM colaboradores WHERE chatwoot_agente_id = $1 LIMIT 1`,
      [chatwootAssigneeId]
    );
    agenteResponsavelId = agenteResponsavel.rows[0]?.id || null;
  }

  let leadId: string | null = null;
  const leadPorConv = await pool.query(
    `SELECT id FROM leads WHERE chatwoot_conv_id = $1 LIMIT 1`,
    [Number(chatwootConvId)]
  );
  if (leadPorConv.rows.length > 0) {
    leadId = leadPorConv.rows[0].id;
  }

  if (!leadId && telefone) {
    const leadPorTelefone = await pool.query(
      `SELECT id FROM leads WHERE regexp_replace(COALESCE(telefone, ''), '\\D', '', 'g') = $1 ORDER BY created_at DESC LIMIT 1`,
      [telefone]
    );
    if (leadPorTelefone.rows.length > 0) {
      leadId = leadPorTelefone.rows[0].id;
    }
  }

  if (!leadId && nomeContato && telefone) {
    const novoLead = await pool.query(
      `INSERT INTO leads (nome, telefone, origem, status, etapa_funil, temperatura, canal_origem, tipo_registro, chatwoot_conv_id, responsavel_id)
       VALUES ($1, $2, 'chatwoot', 'entrada', 'entrada', 'frio', 'whatsapp', 'lead', $3, $4)
       RETURNING id`,
      [nomeContato, telefone, Number(chatwootConvId), agenteResponsavelId]
    );
    leadId = novoLead.rows[0]?.id || null;
  }

  if (leadId) {
    const updateLeadParams: any[] = [leadId];
    const leadSets = [
      `chatwoot_conv_id = COALESCE(chatwoot_conv_id, $2)`
    ];
    updateLeadParams.push(Number(chatwootConvId));

    if (agenteResponsavelId) {
      updateLeadParams.push(agenteResponsavelId);
      leadSets.push(`responsavel_id = $${updateLeadParams.length}`);
    }

    updateLeadParams.push(lastActivityIso);
    leadSets.push(`updated_at = COALESCE($${updateLeadParams.length}::timestamptz, NOW())`);

    await pool.query(
      `UPDATE leads
          SET ${leadSets.join(', ')}
        WHERE id = $1`,
      updateLeadParams
    );

    await garantirEntradaAutomaticaFunil(leadId);
  }

  const convRes = await pool.query(
    `INSERT INTO crm_conversas (
       lead_id,
       canal,
       canal_id_externo,
       status,
       chatwoot_contact_id,
       chatwoot_inbox_id,
       chatwoot_assignee_id,
       agente_responsavel_id,
       origem_atribuicao_agente,
       agente_ultima_atribuicao_em,
       ultima_sincronizacao_chatwoot_em,
       payload_ultimo_evento,
       ultima_interacao_em,
       updated_at
     )
     VALUES (
       $1::uuid,
       'whatsapp',
       $2::text,
       $3::text,
       $4::bigint,
       $5::bigint,
       $6::bigint,
       $7::uuid,
       CASE WHEN $7::uuid IS NOT NULL THEN 'chatwoot_assignee'::text ELSE NULL END,
       CASE WHEN $7::uuid IS NOT NULL THEN NOW() ELSE NULL END,
       NOW(),
       $8::jsonb,
       COALESCE($9::timestamptz, NOW()),
       NOW()
     )
     ON CONFLICT (canal_id_externo) DO UPDATE
       SET lead_id = COALESCE(EXCLUDED.lead_id, crm_conversas.lead_id),
           status = EXCLUDED.status,
           chatwoot_contact_id = COALESCE(EXCLUDED.chatwoot_contact_id, crm_conversas.chatwoot_contact_id),
           chatwoot_inbox_id = COALESCE(EXCLUDED.chatwoot_inbox_id, crm_conversas.chatwoot_inbox_id),
           chatwoot_assignee_id = COALESCE(EXCLUDED.chatwoot_assignee_id, crm_conversas.chatwoot_assignee_id),
           agente_responsavel_id = COALESCE(EXCLUDED.agente_responsavel_id, crm_conversas.agente_responsavel_id),
           origem_atribuicao_agente = COALESCE(EXCLUDED.origem_atribuicao_agente, crm_conversas.origem_atribuicao_agente),
           agente_ultima_atribuicao_em = CASE
             WHEN EXCLUDED.agente_responsavel_id IS NOT NULL THEN NOW()
             ELSE crm_conversas.agente_ultima_atribuicao_em
           END,
           ultima_sincronizacao_chatwoot_em = NOW(),
           payload_ultimo_evento = EXCLUDED.payload_ultimo_evento,
           ultima_interacao_em = COALESCE(EXCLUDED.ultima_interacao_em, crm_conversas.ultima_interacao_em, NOW()),
           updated_at = NOW()
     RETURNING id, lead_id, agente_responsavel_id`,
    [
      leadId,
      chatwootConvId,
      statusConversa,
      chatwootContactId,
      chatwootInboxId,
      chatwootAssigneeId,
      agenteResponsavelId,
      payloadUltimoEvento,
      lastActivityTs,
    ]
  );

  return {
    updated: true,
    conversaId: convRes.rows[0]?.id || null,
    leadId: convRes.rows[0]?.lead_id || leadId,
    agenteResponsavelId: convRes.rows[0]?.agente_responsavel_id || agenteResponsavelId,
    chatwootConvId,
    chatwootAssigneeId,
    origem,
  };
}

async function listarConversasChatwoot({
  status = 'all',
  assigneeType = 'assigned',
  page = 1,
}: {
  status?: 'all' | 'open' | 'resolved' | 'pending' | 'snoozed';
  assigneeType?: 'me' | 'unassigned' | 'all' | 'assigned';
  page?: number;
}) {
  const { baseUrl, apiToken, accountId } = obterConfigChatwoot();
  const url = new URL(`${baseUrl}/api/v1/accounts/${accountId}/conversations`);
  url.searchParams.set('status', status);
  url.searchParams.set('assignee_type', assigneeType);
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': apiToken,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Falha ao consultar Chatwoot (${response.status}): ${body || 'sem detalhes'}`);
  }

  const data = await response.json() as { data?: { payload?: ChatwootConversationPayload[]; meta?: Record<string, any> } };
  return {
    payload: Array.isArray(data?.data?.payload) ? data.data.payload : [],
    meta: data?.data?.meta || {},
  };
}

// ─── App ─────────────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  // Rota para consulta de CNPJ (proxy para BrasilAPI)
  app.use('/api/cnpj', cnpjRouter);
  app.use('/api/empresas', sociosDocumentosRouter);
  const server = createServer(app);

  // ─── AUTO-CREATE: Módulos de Faturamento e Contratos ─────────────────────────
  // Garante que as tabelas existam mesmo sem executar a migration manual.
  // Idempotente: usa CREATE TABLE IF NOT EXISTS e ADD COLUMN IF NOT EXISTS.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS faturamento_historico (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        competencia   DATE NOT NULL,
        valor         NUMERIC(15, 2) NOT NULL CHECK (valor >= 0),
        origem        TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'importado')),
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(empresa_id, competencia)
      );
      CREATE INDEX IF NOT EXISTS idx_fat_historico_empresa ON faturamento_historico(empresa_id);
      CREATE INDEX IF NOT EXISTS idx_fat_historico_competencia ON faturamento_historico(competencia DESC);

      CREATE TABLE IF NOT EXISTS previsao_faturamento (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
        gerada_em            TIMESTAMPTZ DEFAULT NOW(),
        modelo_usado         TEXT NOT NULL,
        horizonte_meses      INTEGER NOT NULL,
        capacidade_pgto_min  NUMERIC(15, 2) NOT NULL,
        capacidade_pgto_max  NUMERIC(15, 2) NOT NULL,
        payload_completo     JSONB NOT NULL,
        created_at           TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_previsao_empresa ON previsao_faturamento(empresa_id);
      CREATE INDEX IF NOT EXISTS idx_previsao_gerada  ON previsao_faturamento(gerada_em DESC);

      CREATE TABLE IF NOT EXISTS parceiros_comerciais (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome       TEXT NOT NULL,
        cpf        TEXT NOT NULL,
        email      TEXT,
        telefone   TEXT,
        ativo      BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(cpf)
      );

      CREATE TABLE IF NOT EXISTS prestadores_servico (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tipo_pessoa           TEXT NOT NULL DEFAULT 'pj',
        razao_social          TEXT,
        nome_fantasia         TEXT,
        nome                  TEXT,
        cnpj                  TEXT,
        cpf                   TEXT,
        email                 TEXT,
        telefone              TEXT,
        endereco              TEXT,
        cidade                TEXT,
        uf                    CHAR(2),
        cep                   TEXT,
        representante_nome    TEXT,
        representante_cpf     TEXT,
        representante_cargo   TEXT,
        observacoes           TEXT,
        ativo                 BOOLEAN DEFAULT TRUE,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prestadores_servico_ativo ON prestadores_servico(ativo);
      CREATE INDEX IF NOT EXISTS idx_prestadores_servico_nome ON prestadores_servico(razao_social, nome);

      CREATE TABLE IF NOT EXISTS contratos_gerados (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tipo_contrato          TEXT NOT NULL DEFAULT 'assessoria',
        cliente_tipo           TEXT,
        empresa_id             UUID REFERENCES empresas(id) ON DELETE RESTRICT,
        parceiro_id            UUID REFERENCES parceiros_comerciais(id) ON DELETE SET NULL,
        contratada_id          UUID REFERENCES prestadores_servico(id) ON DELETE SET NULL,
        responsavel_contrato_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
        lead_id                UUID REFERENCES leads(id) ON DELETE SET NULL,
        valor_referencia       NUMERIC(15, 2),
        valor_contrato         NUMERIC(15, 2),
        condicao_pagamento     TEXT,
        taxa_comissao          NUMERIC(5, 2) DEFAULT 10.00,
        honorario_minimo_mes   NUMERIC(5, 2) DEFAULT 1.00,
        honorario_minimo_total NUMERIC(5, 2) DEFAULT 12.00,
        data_assinatura        DATE NOT NULL,
        foro_eleito            TEXT NOT NULL,
        status                 TEXT NOT NULL DEFAULT 'gerado',
        pdf_path               TEXT,
        hash_documento         TEXT UNIQUE,
        payload_snapshot       JSONB NOT NULL,
        contratada_snapshot    JSONB,
        responsavel_contrato_snapshot JSONB,
        criado_por             UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos_gerados(empresa_id);
      CREATE INDEX IF NOT EXISTS idx_contratos_status  ON contratos_gerados(status);
      CREATE INDEX IF NOT EXISTS idx_contratos_created ON contratos_gerados(created_at DESC);

      CREATE TABLE IF NOT EXISTS contadores (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome                 TEXT NOT NULL,
        cpf                  TEXT NOT NULL,
        crc                  TEXT NOT NULL,
        email                TEXT,
        telefone             TEXT,
        nome_escritorio      TEXT,
        cnpj_escritorio      TEXT,
        endereco_escritorio  TEXT,
        cidade_escritorio    TEXT,
        uf_escritorio        TEXT,
        ativo                BOOLEAN DEFAULT TRUE,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(cpf)
      );
      CREATE INDEX IF NOT EXISTS idx_contadores_ativo ON contadores(ativo);

      CREATE TABLE IF NOT EXISTS clientes_pf (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome             TEXT NOT NULL,
        cpf              TEXT NOT NULL,
        rg               TEXT,
        data_nascimento  DATE,
        email            TEXT,
        telefone         TEXT,
        endereco         TEXT,
        cidade           TEXT,
        uf               CHAR(2),
        cep              TEXT,
        profissao        TEXT,
        estado_civil     TEXT,
        observacoes      TEXT,
        ativo            BOOLEAN DEFAULT TRUE,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(cpf)
      );
      CREATE INDEX IF NOT EXISTS idx_clientes_pf_ativo ON clientes_pf(ativo);
      CREATE INDEX IF NOT EXISTS idx_clientes_pf_nome  ON clientes_pf(nome);
    `);
    console.log('[startup] Tabelas de faturamento/contratos verificadas/criadas com sucesso.');
  } catch (err: any) {
    console.error('[startup] Aviso: falha ao auto-criar tabelas de faturamento/contratos:', err.message);
    // Não aborta o servidor — pode ser que as tabelas já existam com constraints diferentes
  }

  // ─── PATCH: Remove CHECK constraint legado de modelo_usado ─────────────────────
  // A migration 016 criou CHECK (modelo_usado IN ('prophet','arima')).
  // O fallback linear precisa inserir 'linear_fallback', por isso removemos
  // o constraint. Idempotente: usa IF EXISTS.
  try {
    await pool.query(`
      ALTER TABLE previsao_faturamento
        DROP CONSTRAINT IF EXISTS previsao_faturamento_modelo_usado_check;
    `);
    console.log('[startup] Constraint previsao_faturamento_modelo_usado_check removido (ou já inexistente).');
  } catch (err: any) {
    console.error('[startup] Aviso: não foi possível remover constraint de modelo_usado:', err.message);
  }
  // ─── PATCHES DE BANCO: contratos_gerados ────────────────────────────────────
  // Cada ALTER TABLE roda em try/catch INDIVIDUAL e silencioso.
  // Se uma coluna já foi alterada, o erro é ignorado e o próximo passo continua.
  // O servidor NUNCA aborta por causa de um patch de banco.
  // ─────────────────────────────────────────────────────────────────────────────

  // P1: empresa_id -> nullable (Limpa Nome PF não tem empresa)
  try { await pool.query(`ALTER TABLE contratos_gerados ALTER COLUMN empresa_id DROP NOT NULL`); }
  catch { /* já nullable */ }

  // P2: ADD COLUMN tipo_contrato (discriminador de tipo)
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS tipo_contrato TEXT NOT NULL DEFAULT 'assessoria'`); }
  catch { /* já existe */ }

  // P3: ADD COLUMN cliente_tipo (empresa | lead)
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS cliente_tipo TEXT`); }
  catch { /* já existe */ }

  // P4: ADD COLUMN valor_contrato (Limpa Nome, BACEN, Rating)
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC(15,2)`); }
  catch { /* já existe */ }

  // P5: ADD COLUMN condicao_pagamento
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT`); }
  catch { /* já existe */ }

  // P6: valor_referencia -> nullable (novos tipos não usam este campo)
  try { await pool.query(`ALTER TABLE contratos_gerados ALTER COLUMN valor_referencia DROP NOT NULL`); }
  catch { /* já nullable */ }

  // P7: taxa_comissao -> nullable
  try { await pool.query(`ALTER TABLE contratos_gerados ALTER COLUMN taxa_comissao DROP NOT NULL`); }
  catch { /* já nullable */ }

  // P8: honorario_minimo_mes -> nullable
  try { await pool.query(`ALTER TABLE contratos_gerados ALTER COLUMN honorario_minimo_mes DROP NOT NULL`); }
  catch { /* já nullable */ }

  // P9: honorario_minimo_total -> nullable
  try { await pool.query(`ALTER TABLE contratos_gerados ALTER COLUMN honorario_minimo_total DROP NOT NULL`); }
  catch { /* já nullable */ }

  // P10: remover CHECK constraint de status (permite extensibilidade)
  try { await pool.query(`ALTER TABLE contratos_gerados DROP CONSTRAINT IF EXISTS contratos_gerados_status_check`); }
  catch { /* não existia */ }

  // P11: índices adicionais
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_lead     ON contratos_gerados(lead_id)`); }     catch { /* já existe */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_tipo     ON contratos_gerados(tipo_contrato)`); } catch { /* já existe */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_parceiro ON contratos_gerados(parceiro_id)`); }  catch { /* já existe */ }

  // P11B: prestadores/contratadas para contratos Limpa Nome e Limpa BACEN
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prestadores_servico (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tipo_pessoa           TEXT NOT NULL DEFAULT 'pj',
        razao_social          TEXT,
        nome_fantasia         TEXT,
        nome                  TEXT,
        cnpj                  TEXT,
        cpf                   TEXT,
        email                 TEXT,
        telefone              TEXT,
        endereco              TEXT,
        cidade                TEXT,
        uf                    CHAR(2),
        cep                   TEXT,
        representante_nome    TEXT,
        representante_cpf     TEXT,
        representante_cargo   TEXT,
        observacoes           TEXT,
        ativo                 BOOLEAN DEFAULT TRUE,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch { /* tabela já existe ou usuário sem permissão */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_prestadores_servico_ativo ON prestadores_servico(ativo)`); } catch { /* já existe */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_prestadores_servico_nome ON prestadores_servico(razao_social, nome)`); } catch { /* já existe */ }

  // P11C: identidade visual opcional das contratadas no PDF
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS logo_url TEXT`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS logo_path TEXT`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS usar_papel_personalizado BOOLEAN NOT NULL DEFAULT true`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS cabecalho_html TEXT`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS rodape_html TEXT`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS cor_primaria TEXT`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS cor_secundaria TEXT`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS cidade_assinatura TEXT`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS uf_assinatura TEXT`); } catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS mostrar_logo_contrato BOOLEAN NOT NULL DEFAULT true`); } catch { /* já existe */ }

  try {
    await pool.query(`
      INSERT INTO prestadores_servico (
        tipo_pessoa, razao_social, nome_fantasia, cnpj, email, telefone,
        endereco, cidade, uf, cep, representante_nome, representante_cpf,
        representante_cargo, observacoes, ativo
      )
      SELECT
        'pj',
        'DESTRAVA CREDITO LTDA',
        'Destrava Crédito',
        '35.427.182/0001-66',
        'fernandoelipro@gmail.com',
        NULL,
        'St. D Norte QND 25 LOTE 40 - Taguatinga',
        'Brasília',
        'DF',
        '72120-250',
        'FERNANDO ELI OLIVEIRA MARQUES',
        '718.517.041-91',
        'Sócio Administrador',
        'Contratada padrão migrada do contrato legado.',
        TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM prestadores_servico
        WHERE regexp_replace(COALESCE(cnpj, ''), '\\D', '', 'g') = '35427182000166'
      )
    `);
  } catch { /* seed opcional */ }

  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS contratada_id UUID REFERENCES prestadores_servico(id) ON DELETE SET NULL`); }
  catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS contratada_snapshot JSONB`); }
  catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS responsavel_contrato_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL`); }
  catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS responsavel_contrato_snapshot JSONB`); }
  catch { /* já existe */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_contratada ON contratos_gerados(contratada_id)`); } catch { /* já existe */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_responsavel_contrato ON contratos_gerados(responsavel_contrato_id)`); } catch { /* já existe */ }

  // P12: ADD COLUMN cliente_pf_id (referência a clientes_pf para contratos Limpa Nome PF)
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS cliente_pf_id UUID REFERENCES clientes_pf(id) ON DELETE SET NULL`); }
  catch { /* já existe */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_cliente_pf ON contratos_gerados(cliente_pf_id)`); }
  catch { /* já existe */ }

  // P13: ADD COLUMN percentual_multa (legado)
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS percentual_multa NUMERIC(5,2) DEFAULT 10.00`); }
  catch { /* já existe */ }

  // P13B: Campos atuais do contrato de assessoria
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS taxa_desistencia NUMERIC(5,2) DEFAULT 5.00`); }
  catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS custeio_mensal NUMERIC(15,2) DEFAULT 250.00`); }
  catch { /* já existe */ }

  // P13C: Identificação operacional de contratos (número e protocolo)
  try { await pool.query(`CREATE SEQUENCE IF NOT EXISTS contratos_gerados_sequencial_global_seq START WITH 1 INCREMENT BY 1`); }
  catch { /* já existe ou sem permissão */ }
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS numero_contrato TEXT`); }
  catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS protocolo_contrato TEXT`); }
  catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS codigo_tipo_contrato TEXT`); }
  catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS sequencial_contrato INTEGER`); }
  catch { /* já existe */ }
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_numero_contrato_unique ON contratos_gerados(numero_contrato) WHERE numero_contrato IS NOT NULL`); }
  catch { /* já existe */ }
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_protocolo_contrato_unique ON contratos_gerados(protocolo_contrato) WHERE protocolo_contrato IS NOT NULL`); }
  catch { /* já existe */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_codigo_tipo_contrato ON contratos_gerados(codigo_tipo_contrato)`); }
  catch { /* já existe */ }

  // P14: ADD COLUMN contador_id para faturamento
  try { await pool.query(`ALTER TABLE faturamento_historico ADD COLUMN IF NOT EXISTS contador_id UUID REFERENCES contadores(id) ON DELETE SET NULL`); }
  catch { /* já existe */ }
  try { await pool.query(`ALTER TABLE previsao_faturamento ADD COLUMN IF NOT EXISTS contador_id UUID REFERENCES contadores(id) ON DELETE SET NULL`); }
  catch { /* já existe */ }

  // P15: módulo completo de contratos, parceiros/responsáveis e usuários (espelho seguro da migration 020)
  const alteracoesPrestadores020 = [
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS rg TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS data_nascimento DATE`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS estado_civil TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS profissao TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS numero TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS complemento TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS bairro TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS cargo TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS texto_cabecalho TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS texto_rodape TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS origem_cadastro TEXT`,
    `ALTER TABLE prestadores_servico ADD COLUMN IF NOT EXISTS metadados JSONB NOT NULL DEFAULT '{}'::jsonb`,
  ];
  for (const sql of alteracoesPrestadores020) { try { await pool.query(sql); } catch { /* compat */ } }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pessoa_juridica_responsaveis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prestador_id UUID REFERENCES prestadores_servico(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,
        cpf TEXT,
        rg TEXT,
        email TEXT,
        telefone TEXT,
        cargo TEXT,
        profissao TEXT,
        estado_civil TEXT,
        nacionalidade TEXT,
        endereco TEXT,
        numero TEXT,
        complemento TEXT,
        bairro TEXT,
        cidade TEXT,
        uf TEXT,
        cep TEXT,
        principal BOOLEAN NOT NULL DEFAULT false,
        ativo BOOLEAN NOT NULL DEFAULT true,
        observacoes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch { /* compat */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_pj_responsaveis_prestador ON pessoa_juridica_responsaveis(prestador_id, ativo)`); } catch { /* compat */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_pj_responsaveis_cpf ON pessoa_juridica_responsaveis(cpf)`); } catch { /* compat */ }

  const alteracoesContratos020 = [
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS parceiro_snapshot JSONB`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS parceiro_responsavel_id UUID REFERENCES pessoa_juridica_responsaveis(id) ON DELETE SET NULL`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS parceiro_responsavel_snapshot JSONB`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS contratante_tipo TEXT`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS contratante_pf_id UUID`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS contratante_pj_id UUID`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS contratante_snapshot JSONB`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS contratante_responsavel_id UUID REFERENCES pessoa_juridica_responsaveis(id) ON DELETE SET NULL`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS contratante_responsavel_snapshot JSONB`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS responsavel_interno_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS responsavel_interno_snapshot JSONB`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS local_assinatura TEXT`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS observacoes TEXT`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS dados_editaveis JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS pdf_regenerado_em TIMESTAMPTZ`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS assinado_em TIMESTAMPTZ`,
    `ALTER TABLE contratos_gerados ADD COLUMN IF NOT EXISTS assinado_pdf_path TEXT`,
  ];
  for (const sql of alteracoesContratos020) { try { await pool.query(sql); } catch { /* compat */ } }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_gerados_contratante_pf ON contratos_gerados(contratante_pf_id)`); } catch { /* compat */ }
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_gerados_contratante_pj ON contratos_gerados(contratante_pj_id)`); } catch { /* compat */ }

  const alteracoesColaboradores020 = [
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS cpf TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS rg TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS data_nascimento DATE`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS estado_civil TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS profissao TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS endereco TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS numero TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS complemento TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS bairro TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS cidade TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS uf TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS cep TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS assinatura_url TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS precisa_redefinir_senha BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS ultimo_reset_senha_em TIMESTAMPTZ`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS reset_senha_solicitado_em TIMESTAMPTZ`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS reset_senha_token_hash TEXT`,
    `ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS reset_senha_expira_em TIMESTAMPTZ`,
  ];
  for (const sql of alteracoesColaboradores020) { try { await pool.query(sql); } catch { /* compat */ } }
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_email_lower_unique ON colaboradores(LOWER(email))`); } catch { /* compat */ }

  // P16: colunas de identidade visual em parceiros_comerciais
  const alteracoesParceiros016 = [
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS rg TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS data_nascimento DATE`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS estado_civil TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS profissao TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS endereco TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS numero TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS complemento TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS bairro TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS cidade TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS uf CHAR(2)`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS cep TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS observacoes TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS percentual_comissao NUMERIC(5,2)`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS logo_url TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS cabecalho_html TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS rodape_html TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS cor_primaria TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS cor_secundaria TEXT`,
    `ALTER TABLE parceiros_comerciais ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const sql of alteracoesParceiros016) { try { await pool.query(sql); } catch { /* compat */ } }
  console.log('[startup] Patches de banco (contratos_gerados) aplicados/verificados.');
  // ─────────────────────────────────────────────────────────────────────────────

  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));

  // CORS
  app.use((req: Request, res: Response, next: NextFunction) => {
    const siteDomain = process.env.SITE_DOMAIN || "destravacredito.com";
    const allowedOrigins = [
      `https://${siteDomain}`,
      `http://${siteDomain}`,
      "http://localhost:5173",
      "http://localhost:4000",
    ];
    const origin = req.headers.origin ?? "";
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
      res.header("Access-Control-Allow-Origin", origin || "*");
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") { res.sendStatus(200); return; }
    next();
  });

  // Evita cache/304 em respostas de API e impede que listas do painel fiquem presas em bundle/cache antigo.
  app.use("/api", (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  });

  // ─── Health check ──────────────────────────────────────────────────────────
  app.get("/api/health", async (_req: Request, res: Response) => {
    let dbOk = false;
    try { await pool.query("SELECT 1"); dbOk = true; } catch { /* ignore */ }
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "4.0.0",
      db: dbOk ? "connected" : "error",
      n8n_configured: !!process.env.N8N_WEBHOOK_URL,
    });
  });

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: "Email e senha são obrigatórios" });
        return;
      }
      const result = await pool.query(
        `SELECT id, email, nome, cargo, senha_hash, ativo, chatwoot_agente_id,
                COALESCE(acesso_acompanhamento_bancario, false) AS acesso_acompanhamento_bancario,
                COALESCE(perfil, CASE
                  WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor') THEN 'admin'
                  WHEN LOWER(COALESCE(cargo, '')) IN ('gerente comercial', 'gerente', 'gestor') THEN 'gestor'
                  WHEN LOWER(COALESCE(cargo, '')) IN ('analista de crédito', 'analista de credito', 'analista') THEN 'analista'
                  ELSE 'agente'
                END) AS perfil,
                COALESCE(pode_atender_leads, CASE WHEN LOWER(COALESCE(cargo, '')) IN ('captador externo', 'estagiário', 'estagiario') THEN FALSE ELSE TRUE END) AS pode_atender_leads,
                COALESCE(pode_ver_todos_leads, CASE
                  WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor', 'gerente comercial', 'gerente', 'gestor') THEN TRUE
                  ELSE FALSE
                END) AS pode_ver_todos_leads
           FROM colaboradores
          WHERE email = $1`,
        [email.trim().toLowerCase()]
      );
      const user = result.rows[0];
      if (!user || !user.ativo) {
        res.status(401).json({ error: "Credenciais inválidas" });
        return;
      }
      const senhaOk = await bcrypt.compare(password, user.senha_hash);
      if (!senhaOk) {
        res.status(401).json({ error: "Credenciais inválidas" });
        return;
      }
      const colaboradorData = {
        id: user.id,
        email: user.email,
        nome: user.nome,
        cargo: user.cargo,
        perfil: user.perfil || perfilOperacionalPorCargo(user.cargo),
        pode_atender_leads: user.pode_atender_leads ?? podeAtenderLeadsPorCargo(user.cargo),
        pode_ver_todos_leads: user.pode_ver_todos_leads ?? podeVerTodosLeadsPorPerfilOuCargo(user.perfil, user.cargo),
        chatwoot_agente_id: user.chatwoot_agente_id ?? null,
        acesso_acompanhamento_bancario: user.acesso_acompanhamento_bancario ?? false,
        ativo: user.ativo,
      };
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          nome: user.nome,
          cargo: user.cargo,
          perfil: colaboradorData.perfil,
          pode_atender_leads: colaboradorData.pode_atender_leads,
          pode_ver_todos_leads: colaboradorData.pode_ver_todos_leads,
          chatwoot_agente_id: colaboradorData.chatwoot_agente_id,
          acesso_acompanhamento_bancario: colaboradorData.acesso_acompanhamento_bancario,
        },
        process.env.JWT_SECRET!,
        { expiresIn: "24h" }
      );
      console.log(`[LOGIN] Colaborador autenticado: ${user.nome} (${user.email})`);
      res.json({
        token,
        user: colaboradorData,
        colaborador: colaboradorData,
      });
    } catch (err) {
      console.error("[LOGIN ERROR]", err);
      res.status(500).json({ error: "Erro ao autenticar" });
    }
  });

  // ─── LEADS API ─────────────────────────────────────────────────────────────
  app.post("/api/leads", async (req: Request, res: Response) => {
    try {
      const b = req.body;
      const now = new Date().toISOString();
      const nome         = b.nome || "";
      const email        = b.email || null;
      const telefone     = b.telefone || "";
      const empresa      = b.empresa || null;
      const cpf_cnpj     = b.cpf_cnpj || b.cpfCnpj || null;
      const rawTipo      = b.tipo_pessoa || b.tipoPessoa || "pf";
      const tipo_pessoa  = rawTipo === "empresa" ? "pj" : rawTipo;
      const produto      = b.produto_interesse || b.produto || null;
      const valor        = Number(b.valor_solicitado || b.valorSolicitado || b.valorDesejado) || null;
      const prazo        = Number(b.prazo_meses || b.prazo || b.parcelas) || null;
      const finalidade   = b.finalidade || b.mensagem || null;
      const origem       = b.origem || "site";
      const tipo_registro = (
        b.tipo_registro
        || (origem === "contato_site" ? "contato"
          : origem === "simulador_publico" || origem === "simulador-publico" || origem === "site" ? "simulacao"
          : b.etapa_funil === "carteira" ? "carteira"
          : "lead")
      );
      const etapa_funilBruta = b.etapa_funil || b.status || ETAPA_FUNIL_DEFAULT;
      const etapa_funil = validarEtapaFunil(etapa_funilBruta);
      const status_lead  = b.status || etapa_funil;
      const temperatura  = b.temperatura || "frio";
      const score_ia     = Number(b.score_ia) || 0;
      const cidade       = b.cidade || null;
      const estado       = b.estado || null;
      const observacoes_ia    = b.observacoes_ia || null;
      const proximo_followup  = b.proximo_followup || null;
      const utm_source   = b.utm_source   || null;
      const utm_medium   = b.utm_medium   || null;
      const utm_campaign = b.utm_campaign || null;
      const pagina_origem = b.pagina || b.pagina_origem || null;
      let empresa_id = null;
      if (empresa) {
        empresa_id = await processarEmpresaDaSimulacao(pool, {
          razao_social: empresa,
          cnpj: cpf_cnpj,
          telefone: telefone,
          email: email
        });
      }

      if (origem === "simulador_publico" || origem === "simulador-publico" || origem === "site") {
        const { rows: tRows } = await pool.query(
          `INSERT INTO triagem_leads
            (nome, email, telefone, empresa, cpf_cnpj, tipo_pessoa, produto,
             valor, prazo, parcela, taxa, cidade, estado,
             utm_source, utm_medium, utm_campaign, status, empresa_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pendente',$17,$18,$18)
           RETURNING *`,
          [
            nome, email, telefone, empresa, cpf_cnpj, tipo_pessoa, produto,
            valor, prazo,
            Number(b.parcelaMensal || b.parcela_mensal) || null,
            Number(b.taxaEstimada || b.taxa_estimada) || null,
            cidade, estado,
            utm_source, utm_medium, utm_campaign,
            empresa_id,
            now,
          ]
        );
        const triagem = tRows[0];
        console.log(`[TRIAGEM] Lead do simulador salvo na fila: ${nome} — ${produto || origem}`);

        if (empresa_id) {
          const desc = `Simulação pública recebida: ${valor ? 'R$ ' + valor : 'Valor não informado'} em ${prazo ? prazo + 'x' : 'prazo não informado'}. Produto: ${produto || 'Não informado'}.`;
          await pool.query(
            `INSERT INTO empresa_historico (empresa_id, tipo, descricao, autor) VALUES ($1, 'simulacao', $2, 'Sistema')`,
            [empresa_id, desc]
          );
        }

        dispararN8n("triagem_novo_lead", {
          event: "triagem_novo_lead",
          source: origem,
          triagem: { id: triagem.id, nome, telefone, email, empresa, produto, valor, prazo },
          context: { pagina: b.pagina || "/simular", utm_source, utm_medium, utm_campaign },
        });

        return res.status(201).json({ ...triagem, _triagem: true });
      }

      const { rows } = await pool.query(
        `INSERT INTO leads
          (nome, email, telefone, empresa, cpf_cnpj, tipo_pessoa, produto_interesse,
           valor_solicitado, prazo_meses, finalidade, origem, status, etapa_funil,
           temperatura, score_ia, cidade, estado, observacoes_ia, proximo_followup,
           tipo_registro, empresa_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)
         RETURNING *`,
        [
          nome, email, telefone, empresa, cpf_cnpj, tipo_pessoa, produto,
          valor, prazo, finalidade, origem, status_lead, etapa_funil,
          temperatura, score_ia, cidade, estado, observacoes_ia, proximo_followup,
          tipo_registro, empresa_id,
          now,
        ]
      );
      const lead = rows[0];
      console.log(`[LEAD] Salvo: ${nome} — ${produto || origem}`);

      if (empresa_id) {
        const desc = `Lead manual/API recebido: ${valor ? 'R$ ' + valor : 'Valor não informado'}. Origem: ${origem}.`;
        await pool.query(
          `INSERT INTO empresa_historico (empresa_id, tipo, descricao, autor) VALUES ($1, 'nota', $2, 'Sistema')`,
          [empresa_id, desc]
        );
      }

      dispararN8n("novo_lead", {
        event:       "novo_lead",
        source:      origem,
        environment: process.env.NODE_ENV || "production",
        protocol:    "https",
        lead: {
          id:               lead.id,
          nome,
          telefone,
          email:            email || null,
          empresa:          empresa || null,
          tipo_pessoa,
          origem,
          produto_interesse: produto || null,
        },
        simulation: {
          valor_solicitado:  valor,
          prazo,
          parcela_estimada:  Number(b.parcelaMensal || b.parcela_mensal) || null,
          taxa_estimada:     Number(b.taxaEstimada || b.taxa_estimada) || null,
        },
        context: {
          pagina:       b.pagina || "/simular",
          utm_source:   b.utm_source || null,
          utm_medium:   b.utm_medium || null,
          utm_campaign: b.utm_campaign || null,
        },
        routing: {
          priority: origem === "simulador_publico" ? "high" : "normal",
          channel:  "whatsapp",
        },
        id:             lead.id,
        nome,
        telefone,
        empresa:        empresa || null,
        email:          email || null,
        produto,
        valorSolicitado: valor,
        prazo,
        criadoEm:       now,
      });

      res.status(201).json(lead);
    } catch (err) {
      console.error("[LEAD ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao registrar lead." });
    }
  });

  app.get("/api/leads", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const status = req.query.status as string | undefined;
      const busca = req.query.busca as string | undefined;
      const responsavelId = req.query.responsavel_id as string | undefined;
      const scope = (req.query.scope as string | undefined)?.toLowerCase();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const params: any[] = [];
      const conditions: string[] = [];
      aplicarFiltroVisibilidadeLead({ conditions, params, colaborador, scope, responsavelId });
      if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
      if (busca && busca.trim()) {
        const term = `%${busca.trim()}%`;
        params.push(term);
        const idx = params.length;
        conditions.push(`(nome ILIKE $${idx} OR empresa ILIKE $${idx} OR telefone ILIKE $${idx})`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitClause = limit ? `LIMIT ${limit}` : "";
      const { rows } = await pool.query(
        `SELECT * FROM leads ${where} ORDER BY created_at DESC ${limitClause}`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error("[LEADS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar leads." });
    }
  });

  app.get("/api/leads/fila", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const responsavelId = req.query.responsavel_id as string | undefined;
      const scope = (req.query.scope as string | undefined)?.toLowerCase();
      const params: any[] = [];
      const conditions = ["etapa_funil NOT IN ('ganho','perdido')"];
      aplicarFiltroVisibilidadeLead({ conditions, params, colaborador, scope, responsavelId });

      const { rows } = await pool.query(
        `SELECT
           l.*,
           COALESCE(
             l.chatwoot_conv_id,
             CASE
               WHEN cc.canal_id_externo ~ '^[0-9]+$' THEN cc.canal_id_externo::BIGINT
               ELSE NULL
             END
           ) AS chatwoot_conv_id,
           cc.ultima_interacao_em AS ultima_conversa,
           cc.status AS status_conversa
         FROM leads l
         LEFT JOIN LATERAL (
           SELECT canal_id_externo, status, ultima_interacao_em, updated_at, created_at
             FROM crm_conversas
            WHERE lead_id = l.id
            ORDER BY ultima_interacao_em DESC NULLS LAST,
                     updated_at DESC NULLS LAST,
                     created_at DESC NULLS LAST
            LIMIT 1
         ) cc ON TRUE
        WHERE ${conditions.join(" AND ")}
        ORDER BY l.score_ia DESC NULLS LAST,
                 l.proximo_followup ASC NULLS LAST,
                 l.created_at ASC`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error("[LEADS FILA GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar fila de leads." });
    }
  });

  app.get("/api/leads/atrasados", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const responsavelId = req.query.responsavel_id as string | undefined;
      const scope = (req.query.scope as string | undefined)?.toLowerCase();
      const params: any[] = [];
      const conditions = [
        "proximo_followup IS NOT NULL",
        "proximo_followup < NOW()",
        "etapa_funil NOT IN ('ganho','perdido')",
      ];
      aplicarFiltroVisibilidadeLead({ conditions, params, colaborador, scope, responsavelId });

      const { rows } = await pool.query(
        `SELECT * FROM leads WHERE ${conditions.join(" AND ")} ORDER BY proximo_followup ASC, created_at ASC`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error("[LEADS ATRASADOS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar leads atrasados." });
    }
  });

  app.get("/api/leads/hoje", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const responsavelId = req.query.responsavel_id as string | undefined;
      const scope = (req.query.scope as string | undefined)?.toLowerCase();
      const params: any[] = [];
      const conditions = [
        "proximo_followup IS NOT NULL",
        "proximo_followup >= date_trunc('day', NOW())",
        "proximo_followup < date_trunc('day', NOW()) + INTERVAL '1 day'",
        "etapa_funil NOT IN ('ganho','perdido')",
      ];
      aplicarFiltroVisibilidadeLead({ conditions, params, colaborador, scope, responsavelId });

      const { rows } = await pool.query(
        `SELECT * FROM leads WHERE ${conditions.join(" AND ")} ORDER BY proximo_followup ASC, created_at ASC`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error("[LEADS HOJE GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar follow-ups de hoje." });
    }
  });

  app.patch("/api/leads/:id", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const { rows: atuais } = await pool.query(
        "SELECT id, etapa_funil, responsavel_id FROM leads WHERE id = $1 LIMIT 1",
        [req.params.id]
      );

      if (!atuais.length) {
        res.status(404).json({ error: "Lead não encontrado." });
        return;
      }

      const atual = atuais[0];
      const podeEditarLead = await leadPertenceAoColaborador(req.params.id, colaborador);
      if (!podeEditarLead) {
        res.status(403).json({ error: "Você não tem permissão para alterar este lead." });
        return;
      }
      const fields: Record<string, unknown> = { ...req.body, updated_at: new Date().toISOString() };
      const usuarioLogId = colaborador?.id || null;

      if (fields.etapa_funil !== undefined) {
        fields.etapa_funil = validarEtapaFunil(String(fields.etapa_funil));
        fields.status = fields.etapa_funil;
        fields.ultimo_contato_em = new Date().toISOString();
      }

      if (fields.responsavel_id !== undefined) {
        const novoResponsavel = fields.responsavel_id === null || fields.responsavel_id === ''
          ? null
          : String(fields.responsavel_id);

        if (!colaboradorPodeAtribuirResponsavel(colaborador, atual.responsavel_id, novoResponsavel)) {
          res.status(403).json({ error: "Você não tem permissão para atribuir este lead a outro responsável." });
          return;
        }

        if (novoResponsavel && !(await colaboradorAtivoExiste(novoResponsavel))) {
          res.status(400).json({ error: "Responsável inválido ou inativo." });
          return;
        }

        fields.responsavel_id = novoResponsavel;
      }

      const etapaFinal = validarEtapaFunil(String(fields.etapa_funil ?? atual.etapa_funil ?? ETAPA_FUNIL_DEFAULT));
      const responsavelFinal = (fields.responsavel_id ?? atual.responsavel_id ?? colaborador?.id ?? null) as string | null;

      if (etapaFinal !== ETAPA_FUNIL_DEFAULT && !responsavelFinal) {
        res.status(400).json({ error: "Leads fora da etapa de entrada precisam de responsável." });
        return;
      }

      if (etapaFinal !== ETAPA_FUNIL_DEFAULT && !fields.responsavel_id && !atual.responsavel_id && colaborador?.id) {
        fields.responsavel_id = colaborador.id;
      }

      if (fields.responsavel_id === null && etapaFinal !== ETAPA_FUNIL_DEFAULT) {
        res.status(400).json({ error: "Não é permitido remover o responsável fora da etapa de entrada." });
        return;
      }

      const keys = Object.keys(fields);
      const values = Object.values(fields);
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `UPDATE leads SET ${set} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, req.params.id]
      );
      const leadAtualizado = rows[0];

      if (fields.etapa_funil !== undefined && leadAtualizado?.etapa_funil !== atual.etapa_funil) {
        await registrarCrmLog({
          leadId: req.params.id,
          usuarioId: usuarioLogId,
          acao: `mudanca_etapa:${atual.etapa_funil || 'sem_etapa'}->${leadAtualizado.etapa_funil}`,
        });
      }

      if (fields.responsavel_id !== undefined && (leadAtualizado?.responsavel_id || null) !== (atual.responsavel_id || null)) {
        await registrarCrmLog({
          leadId: req.params.id,
          usuarioId: usuarioLogId,
          acao: `mudanca_responsavel:${atual.responsavel_id || 'sem_responsavel'}->${leadAtualizado.responsavel_id || 'sem_responsavel'}`,
        });
      }

      if (fields.proximo_followup !== undefined) {
        await registrarCrmLog({
          leadId: req.params.id,
          usuarioId: usuarioLogId,
          acao: `mudanca_followup:${leadAtualizado?.proximo_followup || 'null'}`,
        });
      }

      res.json({ success: true, lead: leadAtualizado });
    } catch (err) {
      console.error("[LEAD PATCH ERROR]", err);
      res.status(500).json({ error: "Erro ao atualizar lead." });
    }
  });

  app.get("/api/admin/simulacoes-publicas", auth, authorize(["Administrador"]), async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM leads WHERE origem IN ('simulador_publico','simulador-publico','site') ORDER BY created_at DESC`
      );
      res.json({ total: rows.length, simulacoes: rows });
    } catch (err) {
      console.error("[ADMIN SIMS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar simulações públicas." });
    }
  });

  app.post("/api/contato", async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const { rows } = await pool.query(
        `INSERT INTO leads
          (nome, email, telefone, finalidade, origem, status, etapa_funil,
           temperatura, score_ia, tipo_registro, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'contato_site','entrada','entrada','frio',0,'contato',$5,$5)
         RETURNING id`,
        [
          req.body.nome || "",
          req.body.email || null,
          req.body.telefone || null,
          `[${req.body.assunto || "contato"}] ${req.body.mensagem || ""}`.substring(0, 500),
          now,
        ]
      );
      const contatoId = rows[0].id;
      console.log(`[CONTATO] Salvo: ${req.body.nome} — ${req.body.assunto}`);

      dispararN8n("novo_contato", {
        id: contatoId, nome: req.body.nome, email: req.body.email,
        telefone: req.body.telefone, assunto: req.body.assunto,
        mensagem: req.body.mensagem, criadoEm: now,
      });

      res.status(201).json({ success: true, message: "Mensagem enviada com sucesso!" });
    } catch (err) {
      console.error("[CONTATO ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao enviar mensagem." });
    }
  });

  app.get("/api/contatos", auth, authorize(["Administrador"]), async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM leads WHERE origem = 'contato_site' ORDER BY created_at DESC`
      );
      res.json({ total: rows.length, contatos: rows });
    } catch (err) {
      console.error("[CONTATOS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar contatos." });
    }
  });

  app.get("/api/stats", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const isGestor = isGestorCargo(colaborador?.cargo || '');

      // Filtros de período via query string: ?periodo=7d|30d|90d|all
      const periodo = (req.query.periodo as string) || '30d';
      const captadorFiltro = req.query.captador_id as string | undefined;
      const analistaFiltro = req.query.analista_id as string | undefined;

      let dataInicio: string | null = null;
      if (periodo === '7d')  dataInicio = new Date(Date.now() - 7  * 86400000).toISOString();
      if (periodo === '30d') dataInicio = new Date(Date.now() - 30 * 86400000).toISOString();
      if (periodo === '90d') dataInicio = new Date(Date.now() - 90 * 86400000).toISOString();

      // Condições de filtro base para leads
      const leadsParams: any[] = [];
      const leadsConds: string[] = [];
      if (dataInicio) { leadsParams.push(dataInicio); leadsConds.push(`created_at >= $${leadsParams.length}`); }
      if (captadorFiltro) { leadsParams.push(captadorFiltro); leadsConds.push(`captador_id = $${leadsParams.length}`); }
      if (!isGestor && colaborador?.id) { leadsParams.push(colaborador.id); leadsConds.push(`responsavel_id = $${leadsParams.length}`); }
      const leadsWhere = leadsConds.length ? `WHERE ${leadsConds.join(' AND ')}` : '';

      const [leadsRes, simsRes, contatosRes, evolucaoRes, porCaptadorRes, porAnalistaRes] = await Promise.all([
        pool.query(`SELECT status, produto_interesse, valor_solicitado FROM leads ${leadsWhere}`, leadsParams),
        pool.query("SELECT valor_solicitado FROM leads WHERE origem = 'simulador_publico'"),
        pool.query("SELECT COUNT(*) FROM leads WHERE origem = 'contato_site'"),
        // Evolução diária de leads (últimos 30 dias por padrão)
        pool.query(
          `SELECT DATE(created_at) AS dia, COUNT(*) AS total
           FROM leads
           WHERE created_at >= NOW() - INTERVAL '${periodo === '7d' ? 7 : periodo === '90d' ? 90 : 30} days'
           GROUP BY DATE(created_at)
           ORDER BY dia ASC`
        ),
        // Ranking por captador (apenas gestores)
        isGestor ? pool.query(
          `SELECT
             c.id,
             c.nome,
             c.cargo,
             COUNT(l.id)                                          AS total_leads,
             COUNT(l.id) FILTER (WHERE l.status = 'convertido')   AS convertidos,
             COUNT(e.id)                                          AS total_empresas
           FROM colaboradores c
           LEFT JOIN leads    l ON l.captador_id = c.id ${dataInicio ? `AND l.created_at >= '${dataInicio}'` : ''}
           LEFT JOIN empresas e ON e.captador_id = c.id
           WHERE c.ativo = true
           GROUP BY c.id, c.nome, c.cargo
           ORDER BY total_leads DESC, total_empresas DESC
           LIMIT 20`
        ) : Promise.resolve({ rows: [] }),
        // Ranking por analista (apenas gestores)
        isGestor ? pool.query(
          `SELECT
             c.id,
             c.nome,
             c.cargo,
             COUNT(DISTINCT e.id)                                 AS empresas_atendidas,
             COUNT(l.id)                                          AS total_leads,
             COUNT(l.id) FILTER (WHERE l.status = 'convertido')   AS convertidos
           FROM colaboradores c
           LEFT JOIN empresas e ON e.analista_id = c.id
           LEFT JOIN leads    l ON l.responsavel_id = c.id ${dataInicio ? `AND l.created_at >= '${dataInicio}'` : ''}
           WHERE c.ativo = true
           GROUP BY c.id, c.nome, c.cargo
           ORDER BY empresas_atendidas DESC, convertidos DESC
           LIMIT 20`
        ) : Promise.resolve({ rows: [] }),
      ]);

      const leads = leadsRes.rows;
      const sims = simsRes.rows;
      const byStatus = leads.reduce((acc: Record<string, number>, l) => {
        acc[l.status] = (acc[l.status] || 0) + 1; return acc;
      }, {});
      const byProduto = leads.reduce((acc: Record<string, number>, l) => {
        if (l.produto_interesse) acc[l.produto_interesse] = (acc[l.produto_interesse] || 0) + 1;
        return acc;
      }, {});

      res.json({
        leads: { total: leads.length, byStatus, byProduto },
        simulacoes: {
          total: sims.length,
          totalValorSimulado: sims.reduce((s, r) => s + (Number(r.valor_solicitado) || 0), 0),
          totalCustoSimulado: 0,
        },
        contatos: { total: Number(contatosRes.rows[0].count) },
        n8n: { configured: !!process.env.N8N_WEBHOOK_URL },
        // Novos agregados para o Dashboard Interativo
        evolucaoDiaria: evolucaoRes.rows.map(r => ({
          dia: r.dia instanceof Date ? r.dia.toISOString().slice(0, 10) : String(r.dia).slice(0, 10),
          total: Number(r.total),
        })),
        rankingCaptadores: porCaptadorRes.rows.map(r => ({
          id: r.id,
          nome: r.nome,
          cargo: r.cargo,
          totalLeads: Number(r.total_leads),
          convertidos: Number(r.convertidos),
          totalEmpresas: Number(r.total_empresas),
          taxaConversao: r.total_leads > 0 ? Math.round((r.convertidos / r.total_leads) * 100) : 0,
        })),
        rankingAnalistas: porAnalistaRes.rows.map(r => ({
          id: r.id,
          nome: r.nome,
          cargo: r.cargo,
          empresasAtendidas: Number(r.empresas_atendidas),
          totalLeads: Number(r.total_leads),
          convertidos: Number(r.convertidos),
          taxaConversao: r.total_leads > 0 ? Math.round((r.convertidos / r.total_leads) * 100) : 0,
        })),
        periodo,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[STATS ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar estatísticas." });
    }
  });

  // ─── COLABORADORES API ────────────────────────────────────────────────────
  app.post("/api/colaboradores", auth, async (req: Request, res: Response) => {
    try {
      const solicitante = (req as Request & { colaborador: any }).colaborador;
      const cargoSolicitante = solicitante?.cargo || '';

      if (!podecriarUsuarios(cargoSolicitante)) {
        res.status(403).json({ error: "Apenas Administrador, Diretor e Gerente Comercial podem criar colaboradores." });
        return;
      }
      const { nome, email, cargo, senha, telefone, perfil, pode_atender_leads, pode_ver_todos_leads, chatwoot_agente_id } = req.body;
      if (!nome || !email || !cargo || !senha) {
        res.status(400).json({ error: "Campos obrigatórios: nome, email, cargo, senha" });
        return;
      }
      const cargosValidos = CARGOS_VALIDOS.map(c => c.toLowerCase());
      if (!cargosValidos.includes((cargo || '').toLowerCase())) {
        res.status(400).json({ error: `Cargo inválido. Cargos permitidos: ${CARGOS_VALIDOS.join(', ')}` });
        return;
      }
      // Verifica hierarquia: só pode criar cargos de nível inferior ao seu
      if (!podeGerenciarCargo(cargoSolicitante, cargo)) {
        res.status(403).json({ error: `Você não tem permissão para criar um colaborador com cargo "${cargo}".` });
        return;
      }
      const senhaHash = await bcrypt.hash(senha, 12);
      const cleanTelefone = telefone ? telefone.replace(/\D/g, '') : null;
      const perfilFinal = perfil || perfilOperacionalPorCargo(cargo);
      const podeAtenderLeadsFinal = pode_atender_leads ?? podeAtenderLeadsPorCargo(cargo);
      const podeVerTodosLeadsFinal = pode_ver_todos_leads ?? podeVerTodosLeadsPorPerfilOuCargo(perfilFinal, cargo);
      const chatwootAgenteIdFinal = chatwoot_agente_id !== undefined && chatwoot_agente_id !== null && String(chatwoot_agente_id).trim() !== ''
        ? Number(chatwoot_agente_id)
        : null;
      const { rows } = await pool.query(
        `INSERT INTO colaboradores (nome, email, cargo, senha_hash, ativo, telefone, perfil, pode_atender_leads, pode_ver_todos_leads, chatwoot_agente_id)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)
         RETURNING id`,
        [nome.trim(), email.trim().toLowerCase(), cargo, senhaHash, cleanTelefone, perfilFinal, podeAtenderLeadsFinal, podeVerTodosLeadsFinal, chatwootAgenteIdFinal]
      );
      const userId = rows[0].id;
      console.log(`[COLAB] Colaborador criado: ${nome} (${email}) cargo=${cargo}`);
      res.status(201).json({ success: true, id: userId, message: `Colaborador "${nome}" criado com sucesso!` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("unique") || msg.includes("duplicate")) {
        res.status(409).json({ error: "E-mail já cadastrado" });
        return;
      }
      console.error("[COLAB ERROR]", err);
      res.status(500).json({ error: "Erro ao criar colaborador." });
    }
  });

  app.get("/api/colaboradores", auth, async (req: Request, res: Response) => {
    try {
      const solicitante = (req as Request & { colaborador: any }).colaborador;
      const cargoSolicitante = solicitante?.cargo || '';
      const nivelSolicitante = nivelCargo(cargoSolicitante);

      // COALESCE garante compatibilidade com schemas que usam created_at ou criado_em
      const { rows } = await pool.query(
        `SELECT id, email, nome, cargo, telefone, ativo, chatwoot_agente_id,
                COALESCE(perfil, CASE
                  WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor') THEN 'admin'
                  WHEN LOWER(COALESCE(cargo, '')) IN ('gerente comercial', 'gerente', 'gestor') THEN 'gestor'
                  WHEN LOWER(COALESCE(cargo, '')) IN ('analista de crédito', 'analista de credito', 'analista') THEN 'analista'
                  ELSE 'agente'
                END) AS perfil,
                COALESCE(pode_atender_leads, CASE WHEN LOWER(COALESCE(cargo, '')) IN ('captador externo', 'estagiário', 'estagiario') THEN FALSE ELSE TRUE END) AS pode_atender_leads,
                COALESCE(pode_ver_todos_leads, CASE
                  WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor', 'gerente comercial', 'gerente', 'gestor') THEN TRUE
                  ELSE FALSE
                END) AS pode_ver_todos_leads,
                COALESCE(created_at, criado_em, NOW()) AS created_at
         FROM colaboradores ORDER BY nome`
      );

      // Filtra: Administrador vê todos; demais veem apenas cargos de nível inferior
      const filtrados = nivelSolicitante === 0
        ? rows
        : rows.filter(r => nivelCargo(r.cargo) > nivelSolicitante);

      res.json(filtrados);
    } catch (err) {
      console.error("[COLAB GET ERROR]", err);
      // Fallback: tenta sem o campo de timestamp para não quebrar a listagem
      try {
        const solicitante = (req as Request & { colaborador: any }).colaborador;
        const cargoSolicitante = solicitante?.cargo || '';
        const nivelSolicitante = nivelCargo(cargoSolicitante);
        const { rows } = await pool.query(
          `SELECT id, email, nome, cargo, telefone, ativo, chatwoot_agente_id,
                  COALESCE(perfil, CASE
                    WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor') THEN 'admin'
                    WHEN LOWER(COALESCE(cargo, '')) IN ('gerente comercial', 'gerente', 'gestor') THEN 'gestor'
                    WHEN LOWER(COALESCE(cargo, '')) IN ('analista de crédito', 'analista de credito', 'analista') THEN 'analista'
                    ELSE 'agente'
                  END) AS perfil,
                  COALESCE(pode_atender_leads, CASE WHEN LOWER(COALESCE(cargo, '')) IN ('captador externo', 'estagiário', 'estagiario') THEN FALSE ELSE TRUE END) AS pode_atender_leads,
                  COALESCE(pode_ver_todos_leads, CASE
                    WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor', 'gerente comercial', 'gerente', 'gestor') THEN TRUE
                    ELSE FALSE
                  END) AS pode_ver_todos_leads
             FROM colaboradores ORDER BY nome`
        );
        const filtrados = nivelSolicitante === 0
          ? rows
          : rows.filter(r => nivelCargo(r.cargo) > nivelSolicitante);
        res.json(filtrados.map(r => ({ ...r, created_at: null })));
      } catch (err2) {
        console.error("[COLAB GET FALLBACK ERROR]", err2);
        res.status(500).json({ error: "Erro ao buscar colaboradores." });
      }
    }
  });



  // GET /api/colaboradores/para-empresa — retorna listas separadas para os selects do formulário de empresa
  // NOTA: rota declarada ANTES do patch /:id para evitar conflito de parâmetro de rota
  app.get("/api/colaboradores/para-empresa", auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        "SELECT id, nome, cargo FROM colaboradores WHERE ativo = true ORDER BY nome"
      );
      // Responsáveis pela captação: qualquer cargo exceto Analista de Crédito e Estagiário
      const captacao = rows.filter(c =>
        !['analista de crédito', 'analista de credito', 'estagiário', 'estagiario'].includes(c.cargo.toLowerCase())
      );
      // Responsáveis pelo atendimento: qualquer cargo exceto Captador Externo e Estagiário
      const atendimento = rows.filter(c =>
        !CARGOS_BLOQUEADOS_ATENDIMENTO.includes(c.cargo.toLowerCase())
      );
      res.json({ captacao, atendimento });
    } catch (err) {
      console.error("[COLAB PARA-EMPRESA ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar colaboradores." });
    }
  });

  app.patch("/api/colaboradores/:id", auth, async (req: Request, res: Response) => {
    try {
      const solicitante = (req as Request & { colaborador: any }).colaborador;
      const cargoSolicitante = solicitante?.cargo || '';

      // Busca o cargo atual do alvo para verificar hierarquia
      const alvoResult = await pool.query(
        "SELECT id, cargo FROM colaboradores WHERE id = $1",
        [req.params.id]
      );
      if (!alvoResult.rows[0]) {
        res.status(404).json({ error: "Colaborador não encontrado." });
        return;
      }
      const cargoAlvo = alvoResult.rows[0].cargo;

      // Bloqueia edição de cargos iguais ou superiores (exceto admin-key)
      if (!podeGerenciarCargo(cargoSolicitante, cargoAlvo)) {
        res.status(403).json({ error: "Você não tem permissão para editar este colaborador." });
        return;
      }

      const { nome, email, cargo, ativo, senha, telefone, perfil, pode_atender_leads, pode_ver_todos_leads, chatwoot_agente_id } = req.body;

      // Se está tentando alterar o cargo, verifica se o novo cargo também é inferior
      if (cargo && !podeGerenciarCargo(cargoSolicitante, cargo)) {
        res.status(403).json({ error: `Você não pode atribuir o cargo "${cargo}" a este colaborador.` });
        return;
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const cargoFinal = cargo || cargoAlvo;
      if (nome) updates.nome = nome.trim();
      if (email) updates.email = email.trim().toLowerCase();
      if (cargo) updates.cargo = cargo;
      if (ativo !== undefined) updates.ativo = ativo;
      if (senha) updates.senha_hash = await bcrypt.hash(senha, 12);
      if (telefone !== undefined) updates.telefone = telefone ? telefone.replace(/\D/g, '') : null;
      if (chatwoot_agente_id !== undefined) updates.chatwoot_agente_id = chatwoot_agente_id !== null && String(chatwoot_agente_id).trim() !== '' ? Number(chatwoot_agente_id) : null;
      if (perfil !== undefined) updates.perfil = perfil || perfilOperacionalPorCargo(cargoFinal);
      else if (cargo !== undefined) updates.perfil = perfilOperacionalPorCargo(cargoFinal);
      if (pode_atender_leads !== undefined) updates.pode_atender_leads = pode_atender_leads;
      else if (cargo !== undefined) updates.pode_atender_leads = podeAtenderLeadsPorCargo(cargoFinal);
      if (pode_ver_todos_leads !== undefined) updates.pode_ver_todos_leads = pode_ver_todos_leads;
      else if (cargo !== undefined || perfil !== undefined) updates.pode_ver_todos_leads = podeVerTodosLeadsPorPerfilOuCargo(String(updates.perfil || perfil || ''), cargoFinal);
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `UPDATE colaboradores SET ${set} WHERE id = $${keys.length + 1} RETURNING id, nome, email, cargo, telefone, ativo, perfil, pode_atender_leads, pode_ver_todos_leads, chatwoot_agente_id`,
        [...values, req.params.id]
      );
      res.json({ success: true, colaborador: rows[0] });
    } catch (err) {
      console.error("[COLAB PATCH ERROR]", err);
      res.status(500).json({ error: "Erro ao atualizar colaborador." });
    }
  });

  // ─── n8n WEBHOOK CONFIG API ─────────────────────────────────────────────────────────────────────────
  app.get("/api/n8n/status", auth, authorize(["Administrador"]), (_req: Request, res: Response) => {
    res.json({
      configured: !!process.env.N8N_WEBHOOK_URL,
      webhookUrl: process.env.N8N_WEBHOOK_URL ? "***configurado***" : null,
      eventos: ["novo_lead", "nova_simulacao", "novo_contato"],
      payload_version: "2.0",
      campos_canonicos: {
        novo_lead: ["event","source","environment","lead.id","lead.nome","lead.telefone","lead.email","lead.tipo_pessoa","lead.origem","lead.produto_interesse","simulation.valor_solicitado","simulation.prazo","simulation.parcela_estimada","context.pagina","context.utm_source","context.utm_medium","context.utm_campaign","routing.priority","routing.channel"],
      },
    });
  });

  app.post("/api/n8n/test", auth, authorize(["Administrador"]), async (_req: Request, res: Response) => {
    const ok = await dispararN8n("teste_webhook", {
      mensagem: "Teste de integração Destrava Crédito → n8n",
      ambiente: process.env.NODE_ENV || "development",
    });
    res.json({ success: ok, message: ok ? "Webhook enviado com sucesso!" : "Falha ao enviar webhook. Verifique a URL." });
  });

  // ─── GET /api/me ──────────────────────────────────────────────────────────
  app.get("/api/me", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const result = await pool.query(
        `SELECT id, email, nome, cargo, telefone, ativo, chatwoot_agente_id,
                COALESCE(perfil, CASE
                  WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor') THEN 'admin'
                  WHEN LOWER(COALESCE(cargo, '')) IN ('gerente comercial', 'gerente', 'gestor') THEN 'gestor'
                  WHEN LOWER(COALESCE(cargo, '')) IN ('analista de crédito', 'analista de credito', 'analista') THEN 'analista'
                  ELSE 'agente'
                END) AS perfil,
                COALESCE(pode_atender_leads, CASE WHEN LOWER(COALESCE(cargo, '')) IN ('captador externo', 'estagiário', 'estagiario') THEN FALSE ELSE TRUE END) AS pode_atender_leads,
                COALESCE(pode_ver_todos_leads, CASE
                  WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor', 'gerente comercial', 'gerente', 'gestor') THEN TRUE
                  ELSE FALSE
                END) AS pode_ver_todos_leads
           FROM colaboradores WHERE id = $1`,
        [colaborador.id]
      );
      const user = result.rows[0];
      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }
      const cargoLower = (user.cargo || '').toLowerCase();
      const perfil = user.perfil || perfilOperacionalPorCargo(user.cargo);
      const podeVerTudo = user.pode_ver_todos_leads ?? podeVerTodosLeadsPorPerfilOuCargo(perfil, user.cargo);
      res.json({
        ...user,
        perfil,
        pode_atender_leads: user.pode_atender_leads ?? podeAtenderLeadsPorCargo(user.cargo),
        pode_ver_todos_leads: podeVerTudo,
        permissoes: {
          isGestor: isGestorCargo(cargoLower),
          podeGerenciarUsuarios: podecriarUsuarios(cargoLower),
          podeVerTudo,
          isCaptador: cargoLower === 'captador externo',
          isEstagiario: cargoLower === 'estagiário' || cargoLower === 'estagiario',
        },
      });
    } catch (err) {
      console.error("[GET /api/me]", err);
      res.status(500).json({ error: "Erro ao obter usuário" });
    }
  });

  // ─── POST /api/simulacoes ─────────────────────────────────────────────────
  app.post("/api/simulacoes", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const now = new Date().toISOString();
      
      let empresa_id = null;
      if (req.body.cliente_empresa) {
        empresa_id = await processarEmpresaDaSimulacao(pool, {
          razao_social: req.body.cliente_empresa,
          cnpj: req.body.cliente_cpf_cnpj,
          telefone: req.body.cliente_telefone,
          colaborador_id: colaborador.id
        });
      }

      const { rows } = await pool.query(
        `INSERT INTO simulacoes_colaborador
          (colaborador_id, cliente_nome, cliente_telefone, cliente_cpf_cnpj, cliente_empresa, empresa_id,
           valor_solicitado, quantidade_parcelas, taxa_juros_mensal, comissao_percentual,
           total_comissao, valor_parcela, valor_total_pagar, total_juros,
           custo_efetivo_total, imposto_percentual, total_imposto,
           banco, linha_credito, observacoes, status, criado_em, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'rascunho',$21,$21)
         RETURNING id`,
        [
          colaborador.id,
          req.body.cliente_nome || "",
          req.body.cliente_telefone || null,
          req.body.cliente_cpf_cnpj || null,
          req.body.cliente_empresa || null,
          empresa_id,
          req.body.valor_solicitado ?? null,
          req.body.quantidade_parcelas ?? null,
          req.body.taxa_juros_mensal ?? null,
          req.body.comissao_percentual ?? 0,
          req.body.total_comissao ?? 0,
          req.body.valor_parcela ?? null,
          req.body.valor_total_pagar ?? null,
          req.body.total_juros ?? null,
          req.body.custo_efetivo_total ?? null,
          req.body.imposto_percentual ?? 0,
          req.body.total_imposto ?? 0,
          req.body.banco || null,
          req.body.linha_credito || null,
          req.body.observacoes || null,
          now,
        ]
      );
      
      const simId = rows[0].id;
      console.log(`[SIMULACAO] Salva para colaborador ${colaborador.id}: ${req.body.cliente_nome}`);
      
      if (empresa_id) {
        const cenario = req.body.imposto_percentual ? 'com imposto' : 'sem imposto';
        const desc = `Simulação (${cenario}) criada por ${colaborador.nome}: R$ ${req.body.valor_solicitado || 0} em ${req.body.quantidade_parcelas || 0}x. Taxa: ${req.body.taxa_juros_mensal || 0}%.`;
        await pool.query(
          `INSERT INTO empresa_historico (empresa_id, tipo, descricao, autor) VALUES ($1, 'simulacao', $2, $3)`,
          [empresa_id, desc, colaborador.nome]
        );
      }
      
      res.status(201).json({ success: true, id: simId, message: "Simulação salva com sucesso!" });
    } catch (err) {
      console.error("[POST /api/simulacoes]", err);
      res.status(500).json({ error: "Erro ao salvar simulação" });
    }
  });

  // ─── GET /api/simulacoes ──────────────────────────────────────────────────
  app.get("/api/simulacoes", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const isGestor = isGestorCargo(colaborador?.cargo || '');
      const query = isGestor
        ? `SELECT * FROM simulacoes_colaborador ORDER BY criado_em DESC`
        : `SELECT * FROM simulacoes_colaborador WHERE colaborador_id = $1 ORDER BY criado_em DESC`;
      const params = isGestor ? [] : [colaborador.id];
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/simulacoes]", err);
      res.status(500).json({ error: "Erro ao listar simulações" });
    }
  });

  // ─── PATCH /api/simulacoes/:id ────────────────────────────────────────────
  app.patch("/api/simulacoes/:id", auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const checkResult = await pool.query(
        "SELECT id FROM simulacoes_colaborador WHERE id = $1 AND colaborador_id = $2",
        [id, colaborador.id]
      );
      if (checkResult.rows.length === 0) {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }
      await pool.query(
        "UPDATE simulacoes_colaborador SET status = $1, atualizado_em = NOW() WHERE id = $2",
        [status, id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("[PATCH /api/simulacoes/:id]", err);
      res.status(500).json({ error: "Erro ao atualizar simulação" });
    }
  });

  // ─── DELETE /api/simulacoes/:id ───────────────────────────────────────────
  app.delete("/api/simulacoes/:id", auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const checkResult = await pool.query(
        "SELECT id FROM simulacoes_colaborador WHERE id = $1 AND colaborador_id = $2",
        [id, colaborador.id]
      );
      if (checkResult.rows.length === 0) {
        res.status(403).json({ error: "Acesso negado" });
        return;
      }
      await pool.query("DELETE FROM simulacoes_colaborador WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/simulacoes/:id]", err);
      res.status(500).json({ error: "Erro ao deletar simulação" });
    }
  });

  // ─── DELETE /api/leads/:id ────────────────────────────────────────────────
  app.delete("/api/leads/:id", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      if (!colaboradorPodeGerenciarCarteira(colaborador)) {
        res.status(403).json({ error: "Apenas perfis de gestão podem excluir leads." });
        return;
      }

      const { id } = req.params;
      await pool.query("DELETE FROM leads WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/leads/:id]", err);
      res.status(500).json({ error: "Erro ao deletar lead" });
    }
  });

  // ─── POST /api/crm/atividades ─────────────────────────────────────────────
  app.post("/api/crm/atividades", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const { lead_id, tipo, titulo, descricao, resultado, origem_ia } = req.body;
      const tituloFinal = titulo || descricao || tipo || 'Atividade';
      const now = new Date().toISOString();
      const result = await pool.query(
        `INSERT INTO crm_atividades (lead_id, colaborador_id, tipo, titulo, descricao, resultado, origem_ia, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [lead_id, colaborador.id, tipo || 'nota', tituloFinal, descricao || null, resultado || null, origem_ia || false, now]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[POST /api/crm/atividades]", err);
      res.status(500).json({ error: "Erro ao criar atividade" });
    }
  });

  // ─── GET /api/crm/atividades ──────────────────────────────────────────────
  app.get("/api/crm/atividades", auth, async (req: Request, res: Response) => {
    try {
      const { lead_id } = req.query;
      let query = "SELECT * FROM crm_atividades";
      const params: any[] = [];
      if (lead_id) {
        query += " WHERE lead_id = $1";
        params.push(lead_id);
      }
      query += " ORDER BY created_at DESC LIMIT 100";
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/atividades]", err);
      res.status(500).json({ error: "Erro ao listar atividades" });
    }
  });

  // ─── POST /api/crm/documentos ─────────────────────────────────────────────
  app.post("/api/crm/documentos", auth, async (req: Request, res: Response) => {
    try {
      const { lead_id, nome, tipo, status, obrigatorio, observacao, url_arquivo } = req.body;
      const now = new Date().toISOString();
      const result = await pool.query(
        `INSERT INTO crm_documentos (lead_id, nome, tipo, status, obrigatorio, observacao, url_arquivo, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING *`,
        [
          lead_id,
          nome || tipo || 'Documento',
          tipo || 'outro',
          status || 'pendente',
          obrigatorio ?? false,
          observacao || null,
          url_arquivo || null,
          now,
        ]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[POST /api/crm/documentos]", err);
      res.status(500).json({ error: "Erro ao criar documento" });
    }
  });

  // ─── GET /api/crm/documentos ──────────────────────────────────────────────
  app.get("/api/crm/documentos", auth, async (req: Request, res: Response) => {
    try {
      const { lead_id } = req.query;
      let query = "SELECT * FROM crm_documentos";
      const params: any[] = [];
      if (lead_id) {
        query += " WHERE lead_id = $1";
        params.push(lead_id);
      }
      query += " ORDER BY created_at DESC";
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/documentos]", err);
      res.status(500).json({ error: "Erro ao listar documentos" });
    }
  });

  // ─── PATCH /api/crm/documentos/:id ───────────────────────────────────────
  app.patch("/api/crm/documentos/:id", auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = { ...req.body, updated_at: new Date().toISOString() };
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const result = await pool.query(
        `UPDATE crm_documentos SET ${set} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[PATCH /api/crm/documentos/:id]", err);
      res.status(500).json({ error: "Erro ao atualizar documento" });
    }
  });

  // ─── POST /api/crm/qualificacoes ──────────────────────────────────────────
  app.post("/api/crm/qualificacoes", auth, async (req: Request, res: Response) => {
    try {
      const { lead_id, score, temperatura, etapa_sugerida, resumo, proxima_acao,
              pontos_positivos, pontos_atencao, documentos_faltando, probabilidade_conv,
              recomendacao, analise } = req.body;
      const now = new Date().toISOString();
      const result = await pool.query(
        `INSERT INTO crm_qualificacoes_ia
          (lead_id, score, temperatura, etapa_sugerida, resumo, proxima_acao,
           pontos_positivos, pontos_atencao, documentos_faltando, probabilidade_conv, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          lead_id, score || 0, temperatura || 'frio',
          validarEtapaFunil(etapa_sugerida || recomendacao || ETAPA_FUNIL_DEFAULT),
          resumo || analise || '', proxima_acao || null,
          pontos_positivos || [], pontos_atencao || [],
          documentos_faltando || [], probabilidade_conv || null, now,
        ]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[POST /api/crm/qualificacoes]", err);
      res.status(500).json({ error: "Erro ao criar qualificação" });
    }
  });

  // ─── GET /api/crm/qualificacoes ───────────────────────────────────────────
  app.get("/api/crm/qualificacoes", auth, async (req: Request, res: Response) => {
    try {
      const { lead_id } = req.query;
      let query = "SELECT * FROM crm_qualificacoes_ia";
      const params: any[] = [];
      if (lead_id) { query += " WHERE lead_id = $1"; params.push(lead_id); }
      query += " ORDER BY created_at DESC LIMIT 10";
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/qualificacoes]", err);
      res.status(500).json({ error: "Erro ao listar qualificações" });
    }
  });

  // ─── POST /api/crm/mover-funil ────────────────────────────────────────────
  app.post("/api/crm/mover-funil", auth, async (req: Request, res: Response) => {
    try {
      const { lead_id, etapa_funil, temperatura } = req.body;
      const colaborador = (req as Request & { colaborador: any }).colaborador;

      console.info("[POST /api/crm/mover-funil] payload recebido", {
        body: req.body,
        lead_id,
        etapa_funil,
        temperatura,
        usuario: colaborador ? { id: colaborador.id, email: colaborador.email, perfil: colaborador.perfil } : null,
      });

      if (!lead_id) {
        res.status(400).json({ error: "lead_id é obrigatório." });
        return;
      }

      if (typeof etapa_funil !== "string" || !etapa_funil.trim()) {
        res.status(400).json({ error: "etapa_funil é obrigatória e deve ser string." });
        return;
      }

      const etapaNormalizada = validarEtapaFunil(etapa_funil);
      const etapaPersistencia = etapaUiParaLegada(etapaNormalizada);
      console.info("[POST /api/crm/mover-funil] etapa compat", { etapa_ui: etapaNormalizada, etapa_legada: etapaPersistencia });

      if (!etapaFunilPermitida(etapaNormalizada)) {
        res.status(400).json({
          error: "Etapa do funil inválida.",
          detalhe: `Recebido: "${String(etapa_funil)}"`,
        });
        return;
      }
      const { rows: atuais } = await pool.query(
        "SELECT id, etapa_funil, responsavel_id FROM leads WHERE id = $1 LIMIT 1",
        [lead_id]
      );

      if (!atuais.length) {
        res.status(404).json({ error: "Lead não encontrado." });
        return;
      }

      const podeMoverLead = await leadPertenceAoColaborador(lead_id, colaborador);
      if (!podeMoverLead) {
        res.status(403).json({ error: "Você não tem permissão para mover este lead." });
        return;
      }

      const responsavelFinal = atuais[0].responsavel_id || colaborador?.id || null;

      if (etapaNormalizada !== ETAPA_FUNIL_DEFAULT && !responsavelFinal) {
        res.status(400).json({ error: "Leads fora da etapa de entrada precisam de responsável." });
        return;
      }

      await pool.query(
        `UPDATE leads
            SET etapa_funil = $1,
                responsavel_id = COALESCE(responsavel_id, $2),
                ultimo_contato_em = NOW(),
                updated_at = NOW()
          WHERE id = $3`,
        [etapaPersistencia, responsavelFinal, lead_id]
      );

      if (etapaLegadaParaUi(atuais[0]?.etapa_funil) !== etapaNormalizada) {
        await registrarCrmLog({
          leadId: lead_id,
          usuarioId: colaborador?.id || null,
          acao: `mudanca_etapa:${etapaLegadaParaUi(atuais[0]?.etapa_funil) || 'sem_etapa'}->${etapaNormalizada}`,
        });
      }

      if ((atuais[0]?.responsavel_id || null) !== (responsavelFinal || null)) {
        await registrarCrmLog({
          leadId: lead_id,
          usuarioId: colaborador?.id || null,
          acao: `mudanca_responsavel:${atuais[0]?.responsavel_id || 'sem_responsavel'}->${responsavelFinal || 'sem_responsavel'}`,
        });
      }

      res.json({ success: true, etapa_funil: etapaNormalizada, responsavel_id: responsavelFinal });
    } catch (err: any) {
      console.error("[POST /api/crm/mover-funil] erro", {
        message: err?.message || null,
        code: err?.code || null,
        detail: err?.detail || null,
        hint: err?.hint || null,
        constraint: err?.constraint || null,
        table: err?.table || null,
        column: err?.column || null,
        where: err?.where || null,
      });
      res.status(500).json({
        error: "Erro ao mover lead.",
        detalhe: err?.message || null,
        codigo: err?.code || null,
        constraint: err?.constraint || null,
        table: err?.table || null,
        column: err?.column || null,
      });
    }
  });

  // ─── GET /api/crm/pipeline ────────────────────────────────────────────────
  app.get("/api/crm/pipeline", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const responsavelId = req.query.responsavel_id as string | undefined;
      const scope = (req.query.scope as string | undefined)?.toLowerCase();
      const params: any[] = [];
      const conditions: string[] = [];
      aplicarFiltroVisibilidadeLead({ conditions, params, colaborador, scope, responsavelId });

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      let result;
      try {
        result = await pool.query(`SELECT * FROM vw_crm_pipeline ${where} ORDER BY created_at DESC LIMIT 500`, params);
      } catch {
        result = await pool.query(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT 500`, params);
      }
      const rowsCompat = result.rows.map((row: any) => ({
        ...row,
        etapa_funil: etapaLegadaParaUi(row.etapa_funil),
      }));
      res.json(rowsCompat);
    } catch (err) {
      console.error("[GET /api/crm/pipeline]", err);
      res.status(500).json({ error: "Erro ao obter pipeline" });
    }
  });

  app.get("/api/crm/contexto/:leadId", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const { leadId } = req.params;

      const podeVisualizar = await leadPertenceAoColaborador(leadId, colaborador);
      if (!podeVisualizar) {
        res.status(403).json({ error: "Sem permissão para visualizar este lead." });
        return;
      }

      const leadResult = await pool.query(
        `SELECT *
           FROM leads
          WHERE id = $1
          LIMIT 1`,
        [leadId]
      );

      if (!leadResult.rows.length) {
        res.status(404).json({ error: "Lead não encontrado." });
        return;
      }

      const conversaResult = await pool.query(
        `SELECT *
           FROM crm_conversas
          WHERE lead_id = $1
          ORDER BY ultima_interacao_em DESC NULLS LAST,
                   updated_at DESC NULLS LAST,
                   created_at DESC NULLS LAST
          LIMIT 1`,
        [leadId]
      );

      const lead = leadResult.rows[0];
      const conversaMaisRecente = conversaResult.rows[0] || null;

      res.json({
        lead,
        conversaMaisRecente,
        etapaAtual: lead.etapa_funil || null,
      });
    } catch (err) {
      console.error("[GET /api/crm/contexto/:leadId]", err);
      res.status(500).json({ error: "Erro ao carregar contexto do lead." });
    }
  });

  // ─── GET /api/crm/pipeline/metricas ──────────────────────────────────────
  app.get("/api/crm/pipeline/metricas", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const responsavelId = req.query.responsavel_id as string | undefined;
      const scope = (req.query.scope as string | undefined)?.toLowerCase();
      const params: any[] = [];
      const conditions = ["etapa_funil IS NOT NULL"];
      aplicarFiltroVisibilidadeLead({ conditions, params, colaborador, scope, responsavelId });

      const result = await pool.query(
        `SELECT etapa_funil, COUNT(*) as total, SUM(valor_solicitado) as valor_total
         FROM leads WHERE ${conditions.join(' AND ')}
         GROUP BY etapa_funil ORDER BY etapa_funil`,
        params
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/pipeline/metricas]", err);
      res.status(500).json({ error: "Erro ao obter métricas do pipeline" });
    }
  });

  // ─── PATCH /api/colaboradores/:id/toggle ──────────────────────────────────────────────────────────────────────────────────────
  app.patch("/api/colaboradores/:id/toggle", auth, async (req: Request, res: Response) => {
    try {
      const solicitante = (req as Request & { colaborador: any }).colaborador;
      const cargoSolicitante = solicitante?.cargo || '';

      // Busca o cargo do alvo
      const alvoResult = await pool.query(
        "SELECT id, cargo FROM colaboradores WHERE id = $1",
        [req.params.id]
      );
      if (!alvoResult.rows[0]) {
        res.status(404).json({ error: "Colaborador não encontrado." });
        return;
      }
      const cargoAlvo = alvoResult.rows[0].cargo;

      // Bloqueia toggle de cargos iguais ou superiores
      if (!podeGerenciarCargo(cargoSolicitante, cargoAlvo)) {
        res.status(403).json({ error: "Você não tem permissão para alterar o status deste colaborador." });
        return;
      }

      const { id } = req.params;
      const result = await pool.query(
        "UPDATE colaboradores SET ativo = NOT ativo WHERE id = $1 RETURNING *",
        [id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[PATCH /api/colaboradores/:id/toggle]", err);
      res.status(500).json({ error: "Erro ao atualizar colaborador" });
    }
  });

  // ─── POST /api/admin/sql ──────────────────────────────────────────────────────────────────────────────────────
  app.post("/api/admin/sql", auth, authorize(["Administrador"]), async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "Query inválida" });
        return;
      }
      const result = await pool.query(query);
      res.json(result.rows);
    } catch (err: any) {
      console.error("[POST /api/admin/sql]", err);
      res.status(500).json({ error: err.message || "Erro ao executar SQL" });
    }
  });

  // ─── POST /api/leads/:id/solicitar-pdf ───────────────────────────────────
  app.post("/api/leads/:id/solicitar-pdf", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { email, nome, produto, valor, prazo, parcela, taxa } = req.body;
      if (!email) {
        res.status(400).json({ error: "E-mail é obrigatório para envio do PDF" });
        return;
      }
      const ok = await dispararN8n("solicitar_pdf_simulacao", {
        event:      "solicitar_pdf_simulacao",
        source:     "simulador_publico",
        environment: process.env.NODE_ENV || "production",
        lead: { id, nome, email },
        simulation: { produto, valor, prazo, parcela, taxa },
        routing: { channel: "email", priority: "high" },
        timestamp: new Date().toISOString(),
      });
      if (ok) {
        res.json({ success: true, message: "Solicitação de PDF enviada! Você receberá por e-mail em breve." });
      } else {
        res.json({ success: false, message: "Envio por e-mail indisponível no momento. Use o botão de download direto." });
      }
    } catch (err) {
      console.error("[POST /api/leads/:id/solicitar-pdf]", err);
      res.status(500).json({ error: "Erro ao solicitar PDF" });
    }
  });

  // ─── PATCH /api/leads/:id/ia ──────────────────────────────────────────────
  app.patch("/api/leads/:id/ia", auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        score_ia, probabilidade_aprovacao, probabilidade_conversao,
        proxima_acao_ia, linha_recomendada, prazo_aprovacao_estimado,
        analise_credito_ia, resumo_ia, observacoes_ia, temperatura,
      } = req.body;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (score_ia !== undefined)                updates.score_ia = score_ia;
      if (probabilidade_aprovacao !== undefined) updates.probabilidade_aprovacao = probabilidade_aprovacao;
      if (probabilidade_conversao !== undefined) updates.probabilidade_conversao = probabilidade_conversao;
      if (proxima_acao_ia !== undefined)         updates.proxima_acao_ia = proxima_acao_ia;
      if (linha_recomendada !== undefined)       updates.linha_recomendada = linha_recomendada;
      if (prazo_aprovacao_estimado !== undefined) updates.prazo_aprovacao_estimado = prazo_aprovacao_estimado;
      if (analise_credito_ia !== undefined)      updates.analise_credito_ia = analise_credito_ia;
      if (resumo_ia !== undefined)               updates.resumo_ia = resumo_ia;
      if (observacoes_ia !== undefined)          updates.observacoes_ia = observacoes_ia;
      if (temperatura !== undefined)             updates.temperatura = temperatura;

      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");

      const { rows } = await pool.query(
        `UPDATE leads SET ${set} WHERE id = $${keys.length + 1} RETURNING id, nome, score_ia, temperatura, proxima_acao_ia, linha_recomendada`,
        [...values, id]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: "Lead não encontrado" });
        return;
      }

      console.log(`[IA] Lead ${id} atualizado com dados de IA`);
      res.json({ success: true, lead: rows[0] });
    } catch (err) {
      console.error("[PATCH /api/leads/:id/ia]", err);
      res.status(500).json({ error: "Erro ao atualizar dados de IA" });
    }
  });

  // ─── GET /api/leads/para-ia ───────────────────────────────────────────────
  app.get("/api/leads/para-ia", auth, async (_req: Request, res: Response) => {
    try {
      let result;
      try {
        result = await pool.query(`SELECT * FROM vw_leads_para_ia WHERE precisa_score = TRUE ORDER BY created_at DESC LIMIT 50`);
      } catch {
        result = await pool.query(
          `SELECT id, nome, telefone, email, empresa, tipo_pessoa, produto_interesse,
                  valor_solicitado, prazo_meses, origem, etapa_funil, temperatura,
                  score_ia, resumo_ia, proxima_acao_ia, created_at
           FROM leads
           WHERE (score_ia = 0 OR score_ia IS NULL)
             AND etapa_funil NOT IN ('reativacao','perdido','ganho','carteira')
           ORDER BY created_at DESC LIMIT 50`
        );
      }
      res.json({ total: result.rows.length, leads: result.rows });
    } catch (err) {
      console.error("[GET /api/leads/para-ia]", err);
      res.status(500).json({ error: "Erro ao buscar leads para IA" });
    }
  });

  // ─── EMPRESAS API ─────────────────────────────────────────────────────────
  app.get("/api/empresas", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const isGestor = isGestorCargo(colaborador?.cargo || '');
      const busca = req.query.busca as string | undefined;
      const status = req.query.status as string | undefined;
      const params: any[] = [];
      const conditions: string[] = [];
      if (!isGestor && colaborador?.id) {
        params.push(colaborador.id);
        conditions.push(`(responsavel_id = $${params.length} OR analista_id = $${params.length})`);
      }
      if (status && status !== "todos") {
        params.push(status);
        conditions.push(`e.status = $${params.length}`);
      }
      if (busca && busca.trim()) {
        const term = `%${busca.trim()}%`;
        params.push(term);
        const idx = params.length;
        conditions.push(`(e.razao_social ILIKE $${idx} OR e.nome_fantasia ILIKE $${idx} OR e.cnpj ILIKE $${idx} OR e.responsavel_nome ILIKE $${idx})`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT e.*,
                cap.nome AS captador_nome,
                ana.nome AS analista_nome
         FROM empresas e
         LEFT JOIN colaboradores cap ON cap.id = e.captador_id
         LEFT JOIN colaboradores ana ON ana.id = e.analista_id
         ${where} ORDER BY e.razao_social ASC`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error("[GET /api/empresas]", err);
      res.status(500).json({ error: "Erro ao listar empresas" });
    }
  });

  app.get("/api/empresas/:id", auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query("SELECT * FROM empresas WHERE id = $1", [req.params.id]);
      if (rows.length === 0) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error("[GET /api/empresas/:id]", err);
      res.status(500).json({ error: "Erro ao buscar empresa" });
    }
  });

  app.post("/api/empresas", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const {
        razao_social, nome_fantasia, cnpj, inscricao_estadual,
        email, telefone, whatsapp, site,
        segmento, porte, faturamento_anual, numero_funcionarios,
        cep, logradouro, numero, complemento, bairro, cidade, estado,
        responsavel_nome, responsavel_cpf, responsavel_cargo, responsavel_telefone, responsavel_email,
        banco_principal, agencia, conta, limite_credito_atual, score_serasa, score_spc,
        status, origem, tags, observacoes, captador_id, analista_id,
      } = req.body;
      if (!razao_social || !razao_social.trim()) {
        res.status(400).json({ error: "Razão social é obrigatória" });
        return;
      }
      const { rows } = await pool.query(
        `INSERT INTO empresas (
          razao_social, nome_fantasia, cnpj, inscricao_estadual,
          email, telefone, whatsapp, site,
          segmento, porte, faturamento_anual, numero_funcionarios,
          cep, logradouro, numero, complemento, bairro, cidade, estado,
          responsavel_nome, responsavel_cpf, responsavel_cargo, responsavel_telefone, responsavel_email,
          banco_principal, agencia, conta, limite_credito_atual, score_serasa, score_spc,
          responsavel_id, status, origem, tags, observacoes, captador_id, analista_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
          $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37
        ) RETURNING *`,
        [
          razao_social.trim(), nome_fantasia || null, cnpj || null, inscricao_estadual || null,
          email || null, telefone || null, whatsapp || null, site || null,
          segmento || null, porte || 'mei', faturamento_anual || null, numero_funcionarios || null,
          cep || null, logradouro || null, numero || null, complemento || null, bairro || null, cidade || null, estado || null,
          responsavel_nome || null, responsavel_cpf || null, responsavel_cargo || null, responsavel_telefone || null, responsavel_email || null,
          banco_principal || null, agencia || null, conta || null, limite_credito_atual || null, score_serasa || null, score_spc || null,
          colaborador.id, status || 'ativo', origem || 'manual', tags || [], observacoes || null, captador_id || null, analista_id || null,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error("[POST /api/empresas]", err);
      res.status(500).json({ error: "Erro ao criar empresa" });
    }
  });

  app.patch("/api/empresas/:id", auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = { ...req.body, updated_at: new Date().toISOString() };
      delete updates.id;
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `UPDATE empresas SET ${set} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, id]
      );
      if (rows.length === 0) { res.status(404).json({ error: "Empresa não encontrada" }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error("[PATCH /api/empresas/:id]", err);
      res.status(500).json({ error: "Erro ao atualizar empresa" });
    }
  });

  app.delete("/api/empresas/:id", auth, async (req: Request, res: Response) => {
    try {
      await pool.query("DELETE FROM empresas WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/empresas/:id]", err);
      res.status(500).json({ error: "Erro ao excluir empresa" });
    }
  });

  // ─── TRIAGEM API ──────────────────────────────────────────────────────────
  app.get("/api/triagem", auth, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const busca  = req.query.busca  as string | undefined;
      const params: any[] = [];
      const conds: string[] = [];
      if (status && status !== "todos") {
        params.push(status); conds.push(`status = $${params.length}`);
      }
      if (busca && busca.trim()) {
        const t = `%${busca.trim()}%`; params.push(t);
        const i = params.length;
        conds.push(`(nome ILIKE $${i} OR empresa ILIKE $${i} OR telefone ILIKE $${i} OR cpf_cnpj ILIKE $${i})`);
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT * FROM triagem_leads ${where} ORDER BY created_at DESC LIMIT 200`, params
      );
      res.json(rows);
    } catch (err) {
      console.error("[GET /api/triagem]", err);
      res.status(500).json({ error: "Erro ao listar triagem" });
    }
  });

  app.get("/api/triagem/stats", auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT status, COUNT(*)::int as total FROM triagem_leads GROUP BY status`
      );
      const stats: Record<string, number> = {};
      rows.forEach((r: any) => { stats[r.status] = r.total; });
      res.json(stats);
    } catch (err) {
      console.error("[GET /api/triagem/stats]", err);
      res.status(500).json({ error: "Erro ao buscar stats" });
    }
  });

  app.patch("/api/triagem/:id", auth, async (req: Request, res: Response) => {
    try {
      const { status, classificacao, observacoes, responsavel_id } = req.body;
      const sets: string[] = ["updated_at = NOW()"];
      const params: any[] = [req.params.id];
      if (status)         { params.push(status);         sets.push(`status = $${params.length}`); }
      if (classificacao)  { params.push(classificacao);  sets.push(`classificacao = $${params.length}`); }
      if (observacoes !== undefined) { params.push(observacoes); sets.push(`observacoes = $${params.length}`); }
      if (responsavel_id) { params.push(responsavel_id); sets.push(`responsavel_id = $${params.length}`); }
      const { rows } = await pool.query(
        `UPDATE triagem_leads SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, params
      );
      res.json(rows[0]);
    } catch (err) {
      console.error("[PATCH /api/triagem/:id]", err);
      res.status(500).json({ error: "Erro ao atualizar triagem" });
    }
  });

  app.post("/api/triagem/:id/converter", auth, async (req: Request, res: Response) => {
    try {
      const { rows: tRows } = await pool.query(
        "SELECT * FROM triagem_leads WHERE id = $1", [req.params.id]
      );
      if (!tRows.length) return res.status(404).json({ error: "Item não encontrado" });
      const t = tRows[0];
      const now = new Date().toISOString();
      const { rows: lRows } = await pool.query(
        `INSERT INTO leads
          (nome, email, telefone, empresa, cpf_cnpj, tipo_pessoa, produto_interesse,
           valor_solicitado, prazo_meses, origem, status, etapa_funil, temperatura,
           cidade, estado, score_ia, tipo_registro, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'simulador_publico','entrada','entrada','morno',$10,$11,0,'simulacao',$12,$12)
         RETURNING *`,
        [t.nome, t.email, t.telefone, t.empresa, t.cpf_cnpj, t.tipo_pessoa, t.produto,
         t.valor, t.prazo, t.cidade, t.estado, now]
      );
      const lead = lRows[0];
      await pool.query(
        `UPDATE triagem_leads SET status='convertido', lead_id=$1, convertido_em=NOW(), updated_at=NOW() WHERE id=$2`,
        [lead.id, t.id]
      );
      dispararN8n("triagem_convertida", {
        triagem_id: t.id, lead_id: lead.id,
        nome: t.nome, telefone: t.telefone, produto: t.produto,
      });
      res.status(201).json({ lead, triagem_id: t.id });
    } catch (err) {
      console.error("[POST /api/triagem/:id/converter]", err);
      res.status(500).json({ error: "Erro ao converter para lead" });
    }
  });

  app.delete("/api/triagem/:id", auth, async (req: Request, res: Response) => {
    try {
      await pool.query(
        "UPDATE triagem_leads SET status='descartado', updated_at=NOW() WHERE id=$1", [req.params.id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/triagem/:id]", err);
      res.status(500).json({ error: "Erro ao descartar" });
    }
  });

  // ─── Empresas: Followup, Histórico, Documentos ───────────────────────────
  app.get("/api/empresas/:id/followups", auth, async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        "SELECT * FROM empresa_followups WHERE empresa_id=$1 ORDER BY data_agendada ASC NULLS LAST, created_at DESC",
        [req.params.id]
      );
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro" }); }
  });

  app.post("/api/empresas/:id/followups", auth, async (req: Request, res: Response) => {
    const { titulo, tipo = "ligacao", data_agendada, descricao } = req.body;
    try {
      const r = await pool.query(
        `INSERT INTO empresa_followups (empresa_id, titulo, tipo, data_agendada, descricao)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, titulo, tipo, data_agendada || null, descricao || null]
      );
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro" }); }
  });

  app.patch("/api/empresas/:id/followups/:fid/concluir", auth, async (req: Request, res: Response) => {
    try {
      await pool.query(
        "UPDATE empresa_followups SET concluido=true, concluido_em=NOW() WHERE id=$1 AND empresa_id=$2",
        [req.params.fid, req.params.id]
      );
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro" }); }
  });

  app.get("/api/empresas/:id/historico", auth, async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        "SELECT * FROM empresa_historico WHERE empresa_id=$1 ORDER BY created_at DESC",
        [req.params.id]
      );
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro" }); }
  });

  app.post("/api/empresas/:id/historico", auth, async (req: Request, res: Response) => {
    const { tipo = "nota", descricao } = req.body;
    const colab = (req as any).colaborador;
    try {
      const r = await pool.query(
        `INSERT INTO empresa_historico (empresa_id, tipo, descricao, autor)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, tipo, descricao, colab?.nome || "Sistema"]
      );
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro" }); }
  });

  app.get("/api/empresas/:id/documentos", auth, async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        "SELECT * FROM empresa_documentos WHERE empresa_id=$1 ORDER BY created_at DESC",
        [req.params.id]
      );
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro" }); }
  });

  app.post("/api/empresas/:id/documentos", auth, async (req: Request, res: Response) => {
    try {
      const dataDir = process.env.DATA_DIR || "/data";
      const uploadDir = path.join(dataDir, "uploads", "empresas", req.params.id);
      await fs.promises.mkdir(uploadDir, { recursive: true });

      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      await new Promise(r => req.on("end", r));
      const buf = Buffer.concat(chunks);

      const contentDisp = req.headers["content-disposition"] || "";
      const match = contentDisp.match(/filename="?([^"\n]+)"?/);
      const nomeArq = match?.[1] || `doc_${Date.now()}`;
      const filePath = path.join(uploadDir, nomeArq);
      await fs.promises.writeFile(filePath, buf);

      const r = await pool.query(
        `INSERT INTO empresa_documentos (empresa_id, nome, tipo, tamanho, url)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, nomeArq, path.extname(nomeArq).replace(".", "") || "arquivo", buf.length, `/uploads/empresas/${req.params.id}/${nomeArq}`]
      );
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro ao salvar documento" }); }
  });

  // ─── Triagem: Qualificação por IA ────────────────────────────────────────
  app.post("/api/triagem/:id/qualificar-ia", auth, async (req: Request, res: Response) => {
    try {
      const r = await pool.query("SELECT * FROM triagem_leads WHERE id=$1", [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "Não encontrado" });
      const lead = r.rows[0];

      const { OpenAI } = await import("openai");
      const openai = new OpenAI();

      const prompt = `Você é um analista de crédito empresarial especializado em assessoria de crédito para PMEs.
Analise o perfil abaixo e classifique o potencial deste lead para crédito empresarial.

Dados do lead:
- Nome: ${lead.nome}
- Empresa: ${lead.empresa || "Não informado"}
- Telefone: ${lead.telefone}
- CNPJ: ${lead.cnpj || "Não informado"}
- Produto de interesse: ${lead.produto_interesse || "Não informado"}
- Prazo desejado: ${lead.prazo_meses ? lead.prazo_meses + " meses" : "Não informado"}
- Canal de origem: ${lead.canal_origem || "simulador_publico"}
- Data de entrada: ${new Date(lead.created_at).toLocaleDateString("pt-BR")}

Responda APENAS com um JSON válido no seguinte formato:
{
  "classificacao": "possivel_cliente" | "curioso" | "sem_perfil" | "pendente",
  "score": <número de 0 a 100>,
  "temperatura": "frio" | "morno" | "quente",
  "resumo": "<2-3 frases explicando a classificação>",
  "pontos_positivos": ["<ponto1>", "<ponto2>"],
  "pontos_atencao": ["<ponto1>", "<ponto2>"],
  "proxima_acao": "<ação recomendada para o consultor>"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const analise = JSON.parse(completion.choices[0].message.content || "{}");

      const novoStatus = analise.classificacao === "possivel_cliente" ? "possivel_cliente"
        : analise.classificacao === "curioso" ? "curioso"
        : analise.classificacao === "sem_perfil" ? "sem_perfil"
        : "pendente";

      await pool.query(
        `UPDATE triagem_leads SET status=$1, observacoes_ia=$2, score_ia=$3, updated_at=NOW() WHERE id=$4`,
        [novoStatus, JSON.stringify(analise), analise.score || null, req.params.id]
      );

      res.json({ success: true, analise });
    } catch (err) {
      console.error("[POST /api/triagem/:id/qualificar-ia]", err);
      res.status(500).json({ error: "Erro ao qualificar com IA" });
    }
  });

  app.post("/api/chatwoot/sincronizar", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      if (!colaboradorPodeGerenciarCarteira(colaborador)) {
        res.status(403).json({ error: "Apenas perfis de gestão podem sincronizar conversas do Chatwoot." });
        return;
      }

      const status = ['all', 'open', 'resolved', 'pending', 'snoozed'].includes(String(req.body?.status || '').toLowerCase())
        ? String(req.body?.status).toLowerCase() as 'all' | 'open' | 'resolved' | 'pending' | 'snoozed'
        : 'all';
      const assigneeType = ['me', 'unassigned', 'all', 'assigned'].includes(String(req.body?.assignee_type || '').toLowerCase())
        ? String(req.body?.assignee_type).toLowerCase() as 'me' | 'unassigned' | 'all' | 'assigned'
        : 'assigned';
      const pageLimitRaw = Number(req.body?.max_paginas ?? req.query?.max_paginas ?? 10);
      const pageLimit = Number.isFinite(pageLimitRaw) ? Math.min(Math.max(Math.trunc(pageLimitRaw), 1), 50) : 10;

      const processadas: Array<Record<string, any>> = [];
      let totalConversasLidas = 0;
      let paginaAtual = 1;
      let paginasPercorridas = 0;

      while (paginaAtual <= pageLimit) {
        const { payload } = await listarConversasChatwoot({
          status,
          assigneeType,
          page: paginaAtual,
        });

        paginasPercorridas += 1;
        totalConversasLidas += payload.length;

        if (!payload.length) break;

        for (const conversation of payload) {
          const resultado = await sincronizarConversaChatwoot(conversation, 'chatwoot_backfill');
          processadas.push(resultado);
        }

        if (payload.length < 25) break;
        paginaAtual += 1;
      }

      const atualizadas = processadas.filter((item) => item?.updated).length;
      const semAssigneeMapeado = processadas.filter((item) => item?.updated && item?.chatwootAssigneeId && !item?.agenteResponsavelId).length;
      const semLead = processadas.filter((item) => item?.updated && !item?.leadId).length;

      res.json({
        ok: true,
        status,
        assignee_type: assigneeType,
        paginas_percorridas: paginasPercorridas,
        conversas_lidas: totalConversasLidas,
        conversas_atualizadas: atualizadas,
        conversas_sem_mapeamento_de_agente: semAssigneeMapeado,
        conversas_sem_lead_vinculado: semLead,
        exemplos: processadas.slice(0, 20),
      });
    } catch (err: any) {
      console.error('[POST /api/chatwoot/sincronizar]', err);
      res.status(500).json({ error: err?.message || 'Erro ao sincronizar conversas do Chatwoot.' });
    }
  });

  // ─── POST /api/webhook/chatwoot ───────────────────────────────────────────
  // Middleware de autenticação para webhook externo do Chatwoot (server-to-server, sem JWT)
  const chatwootWebhookAuth = (req: Request, res: Response, next: NextFunction): void => {
    const secret = process.env.CHATWOOT_WEBHOOK_SECRET;
    const token = req.headers['x-chatwoot-token'] || req.headers['api_access_token'];
    if (secret && token !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  app.post("/api/webhook/chatwoot", chatwootWebhookAuth, async (req: Request, res: Response) => {
    const { event_id, tipo_evento, origem = 'chatwoot', payload } = req.body;

    res.json({ received: true });

    setImmediate(async () => {
      let eventoDbId: string | null = null;
      try {
        if (event_id) {
          const existe = await pool.query(
            `SELECT id, status_processamento FROM crm_eventos_webhook WHERE event_id = $1 LIMIT 1`,
            [event_id]
          );
          if (existe.rows.length > 0 && existe.rows[0].status_processamento === 'processado') {
            console.log(`[WEBHOOK] Evento ${event_id} já processado — ignorado.`);
            return;
          }
        }

        const evRes = await pool.query(
          `INSERT INTO crm_eventos_webhook (event_id, origem, tipo_evento, payload, status_processamento)
           VALUES ($1, $2, $3, $4, 'pendente')
           ON CONFLICT (event_id) DO UPDATE SET payload = EXCLUDED.payload, status_processamento = 'pendente'
           RETURNING id`,
          [event_id || null, origem, tipo_evento || 'desconhecido', JSON.stringify(payload || {})]
        );
        eventoDbId = evRes.rows[0]?.id || null;

        const chatwootConvId = payload?.conversation?.id?.toString()
          || payload?.id?.toString()
          || null;
        const chatwootContactId = payload?.contact?.id || payload?.conversation?.meta?.sender?.id || null;
        const chatwootInboxId = payload?.conversation?.inbox_id || payload?.inbox?.id || null;
        const chatwootAssigneeId = payload?.conversation?.assignee_id || payload?.assignee?.id || null;
        const telefone = payload?.contact?.phone_number
          || payload?.conversation?.meta?.sender?.phone_number
          || null;
        const nomeContato = payload?.contact?.name
          || payload?.conversation?.meta?.sender?.name
          || null;
        const messageIdExterno = payload?.message?.id?.toString()
          || payload?.id?.toString()
          || `${chatwootConvId}-${Date.now()}`;
        const conteudo = payload?.message?.content || payload?.content || null;
        const direcao = (payload?.message?.message_type === 'outgoing' || payload?.message_type === 'outgoing')
          ? 'outbound' : 'inbound';
        const remetenteType = direcao === 'outbound'
          ? (payload?.message?.sender?.type === 'agent_bot' ? 'ia' : 'humano')
          : 'cliente';

        if (!chatwootConvId) {
          await pool.query(
            `UPDATE crm_eventos_webhook SET status_processamento='ignorado', erro_detalhe='sem chatwoot_conv_id', processado_em=NOW() WHERE id=$1`,
            [eventoDbId]
          );
          return;
        }

        if (telefone) {
          const cleanPhoneColab = telefone.replace(/\D/g, '');
          const colaboradorCheck = await pool.query(
            `SELECT id, nome, cargo FROM colaboradores
             WHERE regexp_replace(COALESCE(telefone,''), '\\D', '', 'g') = $1
               AND ativo = true
               AND telefone IS NOT NULL
               AND telefone <> ''
             LIMIT 1`,
            [cleanPhoneColab]
          );
          if (colaboradorCheck.rows.length > 0) {
            const colabNome = colaboradorCheck.rows[0].nome;
            const colabCargo = colaboradorCheck.rows[0].cargo;
            console.log(`[WEBHOOK] Telefone ${cleanPhoneColab} pertence ao colaborador "${colabNome}" (${colabCargo}) — apenas gravando conversa, sem criar lead.`);
            const convResColab = await pool.query(
              `INSERT INTO crm_conversas (lead_id, canal, canal_id_externo, status)
               VALUES (NULL, 'whatsapp', $1, 'aberta')
               ON CONFLICT (canal_id_externo) DO UPDATE
                 SET ultima_interacao_em = NOW(),
                     updated_at = NOW()
               RETURNING id`,
              [chatwootConvId]
            );
            const conversaIdColab = convResColab.rows[0].id;
            if (conteudo || tipo_evento === 'message_created') {
              const tipoConteudoColab = payload?.message?.content_type || 'text';
              await pool.query(
                `INSERT INTO crm_mensagens (conversa_id, evento_id, message_id_externo, direcao, remetente_tipo, tipo_conteudo, conteudo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (message_id_externo) DO NOTHING`,
                [conversaIdColab, eventoDbId, messageIdExterno, direcao, colabCargo, tipoConteudoColab, conteudo]
              );
            }
            await pool.query(
              `UPDATE crm_eventos_webhook SET status_processamento='processado', erro_detalhe=$2, processado_em=NOW() WHERE id=$1`,
              [eventoDbId, `colaborador (${colabCargo}) — sem lead criado`]
            );
            console.log(`[WEBHOOK] Evento de colaborador processado — conversa ${conversaIdColab}`);
            return;
          }
        }

        let agenteResponsavelId: string | null = null;
        if (chatwootAssigneeId) {
          const agenteResponsavel = await pool.query(
            `SELECT id FROM colaboradores WHERE chatwoot_agente_id = $1 LIMIT 1`,
            [chatwootAssigneeId]
          );
          agenteResponsavelId = agenteResponsavel.rows[0]?.id || null;
        }

        let leadId: string | null = null;
        if (chatwootContactId) {
          const r = await pool.query(
            `SELECT id FROM leads WHERE chatwoot_conv_id = $1 LIMIT 1`,
            [parseInt(chatwootConvId)]
          );
          if (r.rows.length > 0) leadId = r.rows[0].id;
        }
        if (!leadId && telefone) {
          const cleanPhone = telefone.replace(/\D/g, '');
          const r = await pool.query(
            `SELECT id FROM leads WHERE regexp_replace(telefone, '\\D', '', 'g') = $1 ORDER BY created_at DESC LIMIT 1`,
            [cleanPhone]
          );
          if (r.rows.length > 0) leadId = r.rows[0].id;
        }
        // Tentar deduplicar por email se não encontrou por telefone/conv_id
        const emailContato = payload?.contact?.email || null;
        if (!leadId && emailContato) {
          const rEmail = await pool.query(
            `SELECT id FROM leads WHERE LOWER(email) = LOWER($1) ORDER BY created_at DESC LIMIT 1`,
            [emailContato]
          );
          if (rEmail.rows.length > 0) leadId = rEmail.rows[0].id;
        }
        const isNovoLead = !leadId;
        if (!leadId && nomeContato && (telefone || emailContato)) {
          const cleanPhone = telefone ? telefone.replace(/\D/g, '') : null;
          const r = await pool.query(
            `INSERT INTO leads (nome, telefone, email, origem, status, etapa_funil, temperatura, canal_origem, tipo_registro, chatwoot_conv_id, responsavel_id, ultimo_contato_em)
             VALUES ($1, $2, $3, 'chatwoot', 'entrada', 'entrada', 'frio', 'whatsapp', 'lead', $4, $5, NOW())
             RETURNING id`,
            [nomeContato, cleanPhone, emailContato, parseInt(chatwootConvId), agenteResponsavelId]
          );
          leadId = r.rows[0].id;
          console.log(`[WEBHOOK] Lead criado automaticamente: ${leadId}`);
        }
        if (leadId && !isNovoLead) {
          await pool.query(
            `UPDATE leads
                SET chatwoot_conv_id = COALESCE(chatwoot_conv_id, $2),
                    responsavel_id = COALESCE($3::uuid, responsavel_id),
                    ultimo_contato_em = NOW(),
                    updated_at = NOW()
              WHERE id = $1`,
            [leadId, parseInt(chatwootConvId), agenteResponsavelId]
          );
        } else if (leadId && agenteResponsavelId) {
          await pool.query(
            `UPDATE leads SET responsavel_id = $2, updated_at = NOW() WHERE id = $1`,
            [leadId, agenteResponsavelId]
          );
        }
        if (leadId) {
          await garantirEntradaAutomaticaFunil(leadId);
        }

        // Normalizar status do Chatwoot para valores aceitos pelo CHECK constraint
        const statusWebhook = normalizarStatusConversaChatwoot(payload?.conversation?.status);

        const convRes = await pool.query(
          `INSERT INTO crm_conversas (
             lead_id,
             canal,
             canal_id_externo,
             status,
             chatwoot_contact_id,
             chatwoot_inbox_id,
             chatwoot_assignee_id,
             agente_responsavel_id,
             origem_atribuicao_agente,
             agente_ultima_atribuicao_em,
             ultima_sincronizacao_chatwoot_em,
             payload_ultimo_evento
           )
           VALUES ($1, 'whatsapp', $2, $9, $3, $4, $5, $6, $7, CASE WHEN $6 IS NOT NULL THEN NOW() ELSE NULL END, NOW(), $8)
           ON CONFLICT (canal_id_externo) DO UPDATE
             SET lead_id = COALESCE(EXCLUDED.lead_id, crm_conversas.lead_id),
                 chatwoot_contact_id = COALESCE(EXCLUDED.chatwoot_contact_id, crm_conversas.chatwoot_contact_id),
                 chatwoot_inbox_id = COALESCE(EXCLUDED.chatwoot_inbox_id, crm_conversas.chatwoot_inbox_id),
                 chatwoot_assignee_id = COALESCE(EXCLUDED.chatwoot_assignee_id, crm_conversas.chatwoot_assignee_id),
                 agente_responsavel_id = COALESCE(EXCLUDED.agente_responsavel_id, crm_conversas.agente_responsavel_id),
                 origem_atribuicao_agente = COALESCE(EXCLUDED.origem_atribuicao_agente, crm_conversas.origem_atribuicao_agente),
                 agente_ultima_atribuicao_em = CASE
                   WHEN EXCLUDED.agente_responsavel_id IS NOT NULL THEN NOW()
                   ELSE crm_conversas.agente_ultima_atribuicao_em
                 END,
                 ultima_sincronizacao_chatwoot_em = NOW(),
                 payload_ultimo_evento = $8,
                 ultima_interacao_em = NOW(),
                 updated_at = NOW()
           RETURNING id`,
          [
            leadId,
            chatwootConvId,
            chatwootContactId,
            chatwootInboxId,
            chatwootAssigneeId,
            agenteResponsavelId,
            agenteResponsavelId ? 'chatwoot_assignee' : null,
            JSON.stringify(payload || {}),
            statusWebhook,
          ]
        );
        const conversaId = convRes.rows[0].id;

        if (conteudo || tipo_evento === 'message_created') {
          const tipoConteudo = payload?.message?.content_type || 'text';
          await pool.query(
            `INSERT INTO crm_mensagens (conversa_id, evento_id, message_id_externo, direcao, remetente_tipo, tipo_conteudo, conteudo)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (message_id_externo) DO NOTHING`,
            [conversaId, eventoDbId, messageIdExterno, direcao, remetenteType, tipoConteudo, conteudo]
          );
        }

        if (tipo_evento === 'conversation_resolved' || tipo_evento === 'conversation_status_changed') {
          // Usar normalizador para garantir valor dentro do CHECK constraint ('fechada' para resolved)
          const novoStatus = normalizarStatusConversaChatwoot(payload?.conversation?.status);
          await pool.query(
            `UPDATE crm_conversas SET status = $1, updated_at = NOW() WHERE id = $2`,
            [novoStatus, conversaId]
          );
        }

        // Registrar atividade no CRM para mensagens e eventos relevantes
        if (leadId && (tipo_evento === 'message_created' || tipo_evento === 'conversation_created' || tipo_evento === 'conversation_resolved')) {
          const tipoAtiv = tipo_evento === 'conversation_resolved' ? 'whatsapp_encerrado'
            : tipo_evento === 'conversation_created' ? 'whatsapp_inicio'
            : 'whatsapp_mensagem';
          const tituloAtiv = tipo_evento === 'conversation_resolved' ? 'Conversa encerrada (Chatwoot)'
            : tipo_evento === 'conversation_created' ? `Nova conversa via WhatsApp — ${nomeContato || 'contato'}`
            : `Mensagem WhatsApp ${direcao === 'inbound' ? 'recebida' : 'enviada'}`;
          const descAtiv = conteudo ? String(conteudo).slice(0, 500) : `Evento: ${tipo_evento}`;
          await pool.query(
            `INSERT INTO crm_atividades (lead_id, colaborador_id, tipo, titulo, descricao, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [leadId, agenteResponsavelId, tipoAtiv, tituloAtiv, descAtiv]
          ).catch((e: any) => console.warn('[WEBHOOK] crm_atividades warn:', e.message));
        }
        await pool.query(
          `UPDATE crm_eventos_webhook SET status_processamento='processado', processado_em=NOW() WHERE id=$1`,
          [eventoDbId]
        );

        console.log(`[WEBHOOK] Evento ${event_id || tipo_evento} processado — conversa ${conversaId}`);

      } catch (err: any) {
        console.error(`[WEBHOOK] Erro ao processar evento:`, err.message);
        if (eventoDbId) {
          await pool.query(
            `UPDATE crm_eventos_webhook SET status_processamento='erro', erro_detalhe=$1, processado_em=NOW() WHERE id=$2`,
            [err.message, eventoDbId]
          ).catch(() => {});
        }
      }
    });
  });

  // ─── GET /api/crm/conversas ───────────────────────────────────────────────
  app.get("/api/crm/conversas", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const isAdmin = isGestorCargo(colaborador.cargo || '');
      const { lead_id, status } = req.query;
      const params: any[] = [];
      const conditions: string[] = [];

      if (!isAdmin) {
        params.push(colaborador.id);
        const agenteResponsavelParam = params.length;
        let chatwootClause = '';
        if (colaborador?.chatwoot_agente_id !== undefined && colaborador?.chatwoot_agente_id !== null) {
          params.push(Number(colaborador.chatwoot_agente_id));
          chatwootClause = ` OR c.chatwoot_assignee_id = $${params.length}`;
        }
        conditions.push(`(
          c.agente_responsavel_id = $${agenteResponsavelParam}
          OR c.lead_id IN (SELECT id FROM leads WHERE responsavel_id = $${agenteResponsavelParam})${chatwootClause}
        )`);
      }
      if (lead_id) { params.push(lead_id); conditions.push(`c.lead_id = $${params.length}`); }
      if (status) { params.push(status); conditions.push(`c.status = $${params.length}`); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await pool.query(
        `SELECT c.*, l.nome as lead_nome, l.telefone as lead_telefone
         FROM crm_conversas c
         LEFT JOIN leads l ON l.id = c.lead_id
         ${where}
         ORDER BY c.ultima_interacao_em DESC LIMIT 200`,
        params
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/conversas]", err);
      res.status(500).json({ error: "Erro ao listar conversas" });
    }
  });

  // ─── GET /api/crm/conversas/:id/mensagens ────────────────────────────────
  app.get("/api/crm/conversas/:id/mensagens", auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `SELECT * FROM crm_mensagens WHERE conversa_id = $1 ORDER BY created_at ASC`,
        [id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/conversas/:id/mensagens]", err);
      res.status(500).json({ error: "Erro ao listar mensagens" });
    }
  });

  app.patch("/api/crm/conversas/:id/atribuir", auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      if (!colaboradorPodeGerenciarCarteira(colaborador)) {
        res.status(403).json({ error: "Apenas perfis de gestão podem atribuir conversas pelo CRM." });
        return;
      }

      const { agente_responsavel_id } = req.body;
      const agenteResponsavelId = agente_responsavel_id === null || agente_responsavel_id === ''
        ? null
        : String(agente_responsavel_id);

      if (agenteResponsavelId && !(await colaboradorAtivoExiste(agenteResponsavelId))) {
        res.status(400).json({ error: "Responsável inválido ou inativo." });
        return;
      }

      const convResult = await pool.query(
        `SELECT id, lead_id FROM crm_conversas WHERE id = $1 LIMIT 1`,
        [req.params.id]
      );

      if (!convResult.rows.length) {
        res.status(404).json({ error: "Conversa não encontrada." });
        return;
      }

      const conversa = convResult.rows[0];
      const convUpdate = await pool.query(
        `UPDATE crm_conversas
            SET agente_responsavel_id = $2,
                origem_atribuicao_agente = CASE WHEN $2 IS NULL THEN NULL ELSE 'crm_manual' END,
                agente_ultima_atribuicao_em = CASE WHEN $2 IS NULL THEN agente_ultima_atribuicao_em ELSE NOW() END,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [req.params.id, agenteResponsavelId]
      );

      if (conversa.lead_id) {
        await pool.query(
          `UPDATE leads
              SET responsavel_id = $2,
                  updated_at = NOW()
            WHERE id = $1`,
          [conversa.lead_id, agenteResponsavelId]
        );
      }

      res.json({ success: true, conversa: convUpdate.rows[0] });
    } catch (err) {
      console.error("[PATCH /api/crm/conversas/:id/atribuir]", err);
      res.status(500).json({ error: "Erro ao atribuir conversa." });
    }
  });

  // ─── FUNÇÕES AUXILIARES PARA CONTRATOS ────────────────────────────────────


  // ─── IDENTIFICAÇÃO OPERACIONAL DOS CONTRATOS ───────────────────────────────
  type IdentificacaoContrato = {
    numero_contrato: string;
    protocolo_contrato: string;
    codigo_tipo_contrato: string;
    tipo_contrato_nome: string;
    sequencial_contrato: number;
    documento_referencia_codigo: string;
  };

  const CONFIG_TIPOS_CONTRATO: Record<string, { codigo: string; nome: string }> = {
    assessoria: {
      codigo: 'ASS',
      nome: 'Assessoria de Crédito',
    },
    limpa_nome: {
      codigo: 'LNR',
      nome: 'Limpa Nome / Não Exposição de Restrições',
    },
    limpa_bacen: {
      codigo: 'SCR',
      nome: 'Limpa BACEN / SCR',
    },
    rating: {
      codigo: 'RAT',
      nome: 'Rating / Algoritmo Financeiro',
    },
    parceria_comercial: {
      codigo: 'PAR',
      nome: 'Parceria Comercial',
    },
  };

  function escapeHtmlContrato(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function somenteDigitosContrato(value: unknown): string {
    return String(value ?? '').replace(/\D/g, '');
  }

  function documentoReferenciaContrato(payload: any): string {
    const candidatos = [
      payload?.contratante?.cnpj,
      payload?.contratante?.cpf,
      payload?.contratante?.cpf_representante,
      payload?.representante?.cpf,
      payload?.parceiro?.cpf,
      payload?.parceiro?.cnpj,
      payload?.contratada?.cnpj,
      payload?.contratada?.cpf,
    ];

    for (const candidato of candidatos) {
      const digitos = somenteDigitosContrato(candidato);
      if (digitos.length >= 4) return digitos.slice(-4);
    }

    return '0000';
  }

  function nomeArquivoSeguroContrato(value: unknown, fallback = 'contrato'): string {
    const base = String(value || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 140);

    return base || fallback;
  }

  async function gerarIdentificacaoContrato(tipoContrato: string, payload: any): Promise<IdentificacaoContrato> {
    const config = CONFIG_TIPOS_CONTRATO[tipoContrato] || {
      codigo: 'CTR',
      nome: 'Contrato',
    };

    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS contratos_gerados_sequencial_global_seq
      START WITH 1
      INCREMENT BY 1
    `);

    const { rows } = await pool.query(
      `SELECT nextval('contratos_gerados_sequencial_global_seq')::integer AS sequencial`
    );

    const sequencial = Number(rows[0]?.sequencial || 0);
    const seqFormatado = String(sequencial).padStart(6, '0');
    const agora = new Date();
    const ano = String(agora.getFullYear());
    const data = [
      agora.getFullYear(),
      String(agora.getMonth() + 1).padStart(2, '0'),
      String(agora.getDate()).padStart(2, '0'),
    ].join('');
    const docCodigo = documentoReferenciaContrato(payload).padStart(4, '0').slice(-4);

    return {
      numero_contrato: `${config.codigo}-${ano}-${seqFormatado}`,
      protocolo_contrato: `DC-${config.codigo}-${data}-DOC${docCodigo}-${seqFormatado}`,
      codigo_tipo_contrato: config.codigo,
      tipo_contrato_nome: config.nome,
      sequencial_contrato: sequencial,
      documento_referencia_codigo: docCodigo,
    };
  }

  function aplicarIdentificacaoContrato(payload: any, identificacao: IdentificacaoContrato) {
    payload.contrato = {
      ...(payload.contrato || {}),
      ...identificacao,
    };
    return payload;
  }

  async function salvarIdentificacaoContrato(contratoId: string, contrato: any) {
    if (!contratoId || !contrato?.numero_contrato || !contrato?.protocolo_contrato) return;

    await pool.query(
      `UPDATE contratos_gerados
          SET numero_contrato = $1,
              protocolo_contrato = $2,
              codigo_tipo_contrato = $3,
              sequencial_contrato = $4,
              updated_at = NOW()
        WHERE id = $5`,
      [
        contrato.numero_contrato,
        contrato.protocolo_contrato,
        contrato.codigo_tipo_contrato || null,
        contrato.sequencial_contrato || null,
        contratoId,
      ]
    );
  }

  function identificacaoContratoExistente(contrato: any): Partial<IdentificacaoContrato> {
    return {
      numero_contrato: contrato?.numero_contrato || '',
      protocolo_contrato: contrato?.protocolo_contrato || '',
      codigo_tipo_contrato: contrato?.codigo_tipo_contrato || '',
      tipo_contrato_nome: CONFIG_TIPOS_CONTRATO[contrato?.tipo_contrato || '']?.nome || 'Contrato',
      sequencial_contrato: Number(contrato?.sequencial_contrato || 0),
      documento_referencia_codigo: '',
    };
  }

  function blocoIdentificacaoContrato(contrato: any): string {
    if (!contrato?.numero_contrato && !contrato?.protocolo_contrato) return '';

    const numero = escapeHtmlContrato(contrato.numero_contrato || '—');
    const protocolo = escapeHtmlContrato(contrato.protocolo_contrato || '—');
    const codigo = escapeHtmlContrato(contrato.codigo_tipo_contrato || 'CTR');
    const tipo = escapeHtmlContrato(contrato.tipo_contrato_nome || 'Contrato');

    return `
<div style="border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;margin:0 0 18px 0;background:#f9fafb;font-size:11px;line-height:1.45;">
  <div style="font-weight:700;text-transform:uppercase;color:#111827;margin-bottom:4px;">Identificação do contrato</div>
  <div><strong>Tipo:</strong> ${codigo} — ${tipo}</div>
  <div><strong>Nº do contrato:</strong> ${numero}</div>
  <div><strong>Protocolo:</strong> ${protocolo}</div>
</div>`;
  }


  async function gerarHtmlContrato(payload: any): Promise<string> {
    const { contratante, parceiro, contrato } = payload;

    // CONTRATADA sempre é a Destrava
    const contratada = CONTRATADA_DADOS;

    const temParceiro = parceiro && parceiro.nome;
    const vigenciaMeses = contrato.vigencia_meses || 12;
    const comissaoPct   = Number(contrato.taxa_comissao ?? 10);
    const valorRefNumBruto = Number(contrato.valor_referencia ?? 0);
    const taxaDesistenciaPct = Number(contrato.taxa_desistencia ?? contrato.percentual_multa ?? 5);
    const custeioMensal = Number(contrato.custeio_mensal ?? 250);
    const valorDesistencia = valorRefNumBruto * taxaDesistenciaPct / 100;
    const valorRef      = contrato.valor_referencia_formatado || new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorRefNumBruto || 0);
    const foro          = contrato.foro_eleito || 'Taguatinga';
    const dataAss       = contrato.data_assinatura_formatada || '';
    const cidadeAss     = contrato.cidade_assinatura || 'BRASÍLIA – DF';
    const pctExtenso = (pct: number) => {
      const mapa: Record<number, string> = {
        1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco',
        6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
        12: 'doze', 15: 'quinze', 20: 'vinte', 25: 'vinte e cinco',
      };
      return mapa[pct] || String(pct);
    };
    const brl = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(valor) ? valor : 0);

    const body = `
<h1 class="doc-title">CONTRATO DE ANÁLISE DOCUMENTAL PARA ACESSO A LINHA DE CRÉDITO</h1>

${blocoIdentificacaoContrato(contrato)}

<h2 class="section-title">I – IDENTIFICAÇÃO DAS PARTES</h2>

<p class="clause"><strong>CONTRATADA:</strong> denominada ${contratada.razao_social}, com sede na ${contratada.endereco_sede}, inscrita no CNPJ n° ${contratada.cnpj}, devidamente representada por: ${contratada.representante}, identificado como, ${contratada.cargo_representante} nesta data através da consulta do Quadro de Sócios e Administradores – QSA, disponibilizado pela República Federativa do Brasil – RFB, CPF n° ${contratada.cpf_representante}.</p>

<p class="clause"><strong>CONTRATANTE:</strong> ${contratante.razao_social}, pessoa jurídica de direito privado, inscrita no CNPJ n° ${contratante.cnpj}, com sede em ${contratante.endereco}, neste ato representada por seu representante legal ${contratante.representante}, ${contratante.nacionalidade || 'brasileiro(a)'}, portador(a) do CPF n° ${contratante.cpf_representante}, conforme poderes que lhe são conferidos pelo contrato social e/ou procuração.</p>

${temParceiro ? `<p class="clause"><strong>PARCEIRO COMERCIAL:</strong> ${parceiro.nome}, pessoa física, inscrita no CPF n° ${parceiro.cpf}, indicada pela CONTRATANTE como parceira comercial para fins de acompanhamento e suporte nas atividades relacionadas ao presente contrato.</p>` : ''}

<h2 class="section-title">II - DO OBJETO DO CONTRATO E VALOR DE REFERÊNCIA</h2>

<p class="clause"><strong>Cláusula 1</strong> - O presente contrato tem como objeto a prestação de serviços de análise e organização documental pela CONTRATADA, com o objetivo de orientar a CONTRATANTE quanto à adequação de sua documentação jurídica, contábil e financeira para fins de acesso e aquisição de linhas de crédito no sistema bancário nacional, governamental e ou fintech.</p>

<p class="clause"><strong>1.1</strong> - A CONTRATANTE estabelece que o montante de <strong>${valorRef}</strong> será utilizado como valor de referência para a projeção de crédito e planejamento financeiro, servindo como pilar para a análise documental a ser realizada pela CONTRATADA.</p>

<p class="clause"><strong>1.2</strong> - O relatório de análise documental indicará as condições atuais e ideais para que a CONTRATANTE possa acessar o valor de referência projetado. Contudo, a CONTRATADA não garante a aprovação de crédito no valor de referência nem se responsabiliza por fatores externos, restrições financeiras ou fiscais, erros cadastrais, comprometimento financeiro, incapacidade de pagamento ou políticas de crédito das instituições financeiras.</p>

<p class="clause"><strong>1.3</strong> - Fica expressamente acordado que, caso não seja possível alcançar dentro do prazo de validade do contrato, o valor de referência, devido a limitações documentais, cadastrais, fiscais ou financeiras da CONTRATANTE, a CONTRATADA estará isenta de qualquer responsabilidade ou obrigação de resultado, limitando-se a prestar os serviços de análise e orientação contratados.</p>

<p class="clause"><strong>1.4</strong> - A CONTRATADA realizará análise técnica da documentação enviada, emitirá pareceres, apontará inconsistências e poderá sugerir correções, ficando a decisão sobre acatar tais sugestões sob responsabilidade exclusiva da CONTRATANTE.</p>

<h2 class="section-title">III - DAS RESPONSABILIDADES DAS PARTES</h2>

<p class="clause"><strong>Cláusula 2</strong> - Toda e qualquer informação, documento, dado ou acesso fornecido à CONTRATADA será de inteira responsabilidade da CONTRATANTE, inclusive quanto à sua veracidade, legalidade e atualidade. A CONTRATADA não se responsabiliza por prejuízos diretos ou indiretos decorrentes de informações incorretas, incompletas ou fraudulentas fornecidas.</p>

<p class="clause"><strong>2.1</strong> - A CONTRATADA poderá emitir pareceres e recomendações sobre a documentação enviada, sem que isso constitua obrigação de resultado ou responsabilidade técnica por atos praticados pela CONTRATANTE com base nessas orientações. Caso a CONTRATANTE opte por adotar qualquer sugestão, a responsabilidade por seus efeitos será exclusivamente sua.</p>

<p class="clause"><strong>2.2</strong> - A CONTRATANTE compromete-se a apresentar, atualizados, sempre que solicitado, todos os documentos e informações para a execução dos serviços.</p>

${temParceiro ? `<p class="clause"><strong>2.3</strong> - O PARCEIRO COMERCIAL poderá acompanhar o desenvolvimento dos serviços e ter acesso às informações pertinentes, mediante autorização expressa da CONTRATANTE, ficando igualmente sujeito às cláusulas de confidencialidade deste contrato.</p>` : ''}

<h2 class="section-title">IV – DA VIGÊNCIA E RENOVAÇÃO</h2>

<p class="clause"><strong>Cláusula 3</strong> - Este contrato terá vigência de <strong>${vigenciaMeses} (doze) meses</strong> a contar da data de sua assinatura, sendo automaticamente renovado por igual período, caso não haja manifestação contrária de qualquer das partes, comunicada com no mínimo 30 (trinta) dias de antecedência do vencimento, por meio de e-mail enviado ao endereço: fernandoelipro@gmail.com.</p>

<h2 class="section-title">V - DA REMUNERAÇÃO POR COMISSÃO E HONORÁRIO MÍNIMO</h2>

<p class="clause"><strong>Cláusula 4</strong> - A CONTRATADA fará jus a comissão de <strong>${comissaoPct}% (${pctExtenso(comissaoPct)} por cento)</strong> sobre qualquer valor efetivamente liberado em favor da CONTRATANTE, no prazo de até 12 meses da entrega do relatório inicial. A CONTRATANTE compromete-se a comunicar qualquer operação de crédito aprovada e contratada dentro do período de vigência deste contrato e a fornecer cópia do contrato, comprovante de liberação e/ou extrato bancário correspondente.</p>

<p class="clause"><strong>4.1</strong> - A comissão deverá ser paga pela CONTRATANTE à CONTRATADA no prazo máximo de 1 (um) dia útil após a liberação do crédito, mediante transferência bancária para conta informada pela CONTRATADA.</p>

<p class="clause"><strong>4.2</strong> - A CONTRATADA declara, que não realiza, direta ou indiretamente, qualquer tipo de pagamento, vantagem indevida, comissão oculta ou propina, seja a servidores públicos, agentes privados ou terceiros, sendo vedada qualquer prática que contrarie a legislação anticorrupção vigente (Lei nº 12.846/2013 e demais normas aplicáveis).</p>

<p class="clause"><strong>4.3</strong> - Fica estabelecido que, caso a CONTRATANTE não contrate operações de crédito em valor igual ou superior a <strong>${valorRef}</strong> no período de vigência do contrato, 12 (doze) meses, por motivos causados por ela, será devido à CONTRATADA, a título de honorário mínimo garantido, o valor correspondente a <strong>${taxaDesistenciaPct}% (${pctExtenso(taxaDesistenciaPct)} por cento)</strong> sobre o valor de referência pretendido inicialmente, totalizando <strong>${brl(valorDesistencia)}</strong>.</p>

<p class="clause"><strong>PARÁGRAFO ÚNICO - CAUSAS DE IMPEDIMENTO A CRÉDITO POR PARTE DA CONTRATANTE</strong><br>
As causas de impedimento a crédito por parte da CONTRATANTE são: 1 – Apontamento, direto ou indireto (replicação) de restrição financeira, fiscal ou de simples protesto, inclusive em grupo econômico e cônjuge. 2 – Rating Bacen diferente de C, B ou A. 3 – Movimentação bancária inferior à declarada no faturamento bruto e quando exigido na declaração de imposto de renda. 4 – Anotação de apontamento de fraude documental ou ideológica no Banco Central. 5 – Mudança de endereço da sede empresarial sem comunicação prévia. 6 – Falta de comprovação de endereço da sede ou endereço divergente ao registrado nos órgãos competentes.</p>

<p class="clause"><strong>4.4</strong> - O valor do honorário mínimo poderá ser cobrado integralmente ao final do contrato, ou em parcelas mensais, conforme acordo entre as partes.</p>

<p class="clause"><strong>4.5</strong> - Caso a CONTRATANTE venha a contratar operações de crédito que, somadas, ultrapassem o valor de <strong>${valorRef}</strong> durante a vigência do contrato, 12 (doze) meses, a CONTRATADA renunciará ao recebimento do honorário mínimo, mantendo-se exclusivamente o direito à comissão de ${comissaoPct}% sobre o valor contratado.</p>

<p class="clause"><strong>4.6</strong> - Caso o Rating Bancário interno, no ato da abertura da conta ou após o término do primeiro ciclo de validação, seja inferior a <strong>"C"</strong>, será cobrado o valor mensal de <strong>${brl(custeioMensal)}</strong> a título de custeio do acompanhamento intensivo de extratos bancários, certidões fiscais e restrições comerciais ou bancárias, enquanto o Rating permanecer abaixo do nível "C".</p>

<h2 class="section-title">VI – CONFIDENCIALIDADE</h2>

<p class="clause"><strong>Cláusula 5</strong> - A CONTRATADA compromete-se a manter em absoluto sigilo todas as informações e documentos recebidos da CONTRATANTE, não os utilizando para qualquer outro fim que não a execução do presente contrato, exceto quando exigido por lei ou ordem judicial.</p>

${temParceiro ? `<p class="clause"><strong>5.1</strong> - O PARCEIRO COMERCIAL, quando autorizado pela CONTRATANTE a ter acesso às informações, compromete-se igualmente a manter sigilo absoluto sobre todos os dados e documentos relacionados ao presente contrato.</p>` : ''}

<h2 class="section-title">VII – RESCISÃO</h2>

<p class="clause"><strong>Cláusula 6</strong> - A CONTRATANTE poderá rescindir este contrato até a entrega pela CONTRATADA do relatório de análise dos documentos apresentados, mediante pagamento de 1% (um por cento) do valor informado na Cláusula 1.1, pelos serviços de análise documental, já prestados.</p>

<p class="clause"><strong>6.1</strong> - Na ausência do pagamento pelos serviços já prestados pela CONTRATADA à CONTRATANTE, deve a CONTRATADA entender automaticamente, que é o interesse da CONTRATANTE, seguir de forma IRREVOGÁVEL e IRRETRATÁVEL as cláusulas deste contrato, sob a isenção de cobrança do pagamento de 1% (um por cento), referente ao relatório de análise dos documentos apresentados.</p>

<h2 class="section-title">VIII – CLÁUSULA PENAL POR INADIMPLÊNCIA</h2>

<p class="clause"><strong>Cláusula 7</strong> - Fica estabelecida uma Cláusula Penal em favor da CONTRATADA, aplicável na hipótese de inadimplência da CONTRATANTE em relação aos contratos de crédito obtidos com o suporte dos serviços objeto deste instrumento.</p>

<p class="clause"><strong>7.1</strong> - A Cláusula Penal será acionada caso a CONTRATANTE atrase o pagamento de 3 (três) parcelas consecutivas ou 5 (cinco) parcelas alternadas do contrato de crédito obtido junto à instituição financeira.</p>

<p class="clause"><strong>7.2</strong> - O valor da multa será de ${taxaDesistenciaPct}% (${pctExtenso(taxaDesistenciaPct)} por cento) sobre o valor total do crédito contratado pela CONTRATANTE junto à instituição financeira, a ser pago à CONTRATADA no prazo de 10 (dez) dias úteis após a notificação da inadimplência.</p>

<p class="clause"><strong>7.3</strong> - A aplicação desta Cláusula Penal não impede a CONTRATADA de buscar outras medidas legais cabíveis para a recuperação de quaisquer valores devidos, incluindo, mas não se limitando, aos honorários e comissões previstos na Cláusula 4.</p>

<h2 class="section-title">IX – DO FORO E CONDIÇÕES GERAIS</h2>

<p class="clause">Para dirimir quaisquer controvérsias oriundas do CONTRATO, as partes elegem o foro da Circunscrição Judiciária de <strong>${foro}</strong>.</p>

<p class="clause">Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias de igual teor.</p>

<p class="city-date"><strong>${cidadeAss}, ${dataAss}.</strong></p>

<div class="signature-section">
  ${temParceiro ? `
  <div class="signature-grid" style="grid-template-columns: 1fr 1fr 1fr; max-width: 180mm;">
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">${contratante.razao_social}</p>
      <p class="sig-sub">CNPJ: ${contratante.cnpj}</p>
      <p class="sig-sub">CONTRATANTE</p>
    </div>
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">${parceiro.nome}</p>
      <p class="sig-sub">CPF: ${parceiro.cpf}</p>
      <p class="sig-sub">PARCEIRO COMERCIAL</p>
    </div>
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">DESTRAVA CRÉDITO LTDA</p>
      <p class="sig-sub">CNPJ: ${contratada.cnpj}</p>
      <p class="sig-sub">CONTRATADA</p>
    </div>
  </div>
  ` : `
  <div class="signature-grid">
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">${contratante.razao_social}</p>
      <p class="sig-sub">CNPJ: ${contratante.cnpj}</p>
      <p class="sig-sub">CONTRATANTE</p>
    </div>
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">DESTRAVA CRÉDITO LTDA</p>
      <p class="sig-sub">CNPJ: ${contratada.cnpj}</p>
      <p class="sig-sub">CONTRATADA</p>
    </div>
  </div>
  `}
</div>

<div class="page-break"></div>

<div class="witness-grid" style="max-width: 160mm; margin: 40px auto 0;">
  <div class="witness-box">
    <p style="font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#1e3a5f; margin:0 0 8px;">Testemunha 1</p>
    <div class="sig-line"></div>
    <p class="sig-sub">Nome: ___________________________________</p>
    <p class="sig-sub">CPF: ____________________________________</p>
  </div>
  <div class="witness-box">
    <p style="font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#1e3a5f; margin:0 0 8px;">Testemunha 2</p>
    <div class="sig-line"></div>
    <p class="sig-sub">Nome: ___________________________________</p>
    <p class="sig-sub">CPF: ____________________________________</p>
  </div>
</div>
`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Destrava Crédito — CONTRATO DE ANÁLISE DOCUMENTAL</title>
  <style>
    ${getDocumentStyles()}
    body { padding: 0; background: #fff; }
    .contract-content { width: 100%; }
  </style>
</head>
<body>
  ${getHtmlHeaderEmbutido()}
  <main class="contract-content">
    ${body}
  </main>
  ${getHtmlFooterEmbutido()}
</body>
</html>`;
  }


  // ─── HTML PREVISÃO DE FATURAMENTO (documento contábil) ───────────────────────
  function gerarHtmlPrevisaoFaturamento(payload: {
    empresa: {
      razao_social?: string | null;
      cnpj?: string | null;
      endereco_completo?: string | null;
      endereco?: string | null;
      logradouro?: string | null;
      numero?: string | null;
      complemento?: string | null;
      bairro?: string | null;
      cidade?: string | null;
      estado?: string | null;
      segmento?: string | null;
    };
    horizonte_meses: number;
    modelo_usado: string;
    gerada_em: string;
    capacidade_pgto_min: number;
    capacidade_pgto_max: number;
    historico: { competencia: string; valor: number }[];
    previsoes: { ds: string; yhat: number; yhat_lower: number; yhat_upper: number }[];
    chartImageBase64?: string;
    contador?: {
      nome?: string | null;
      crc?: string | null;
      cpf?: string | null;
      email?: string | null;
      telefone?: string | null;
      nome_escritorio?: string | null;
      cnpj_escritorio?: string | null;
      endereco_escritorio?: string | null;
      cidade_escritorio?: string | null;
      uf_escritorio?: string | null;
    } | null;
  }): string {
    const esc = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
    const fmtMes = (value: string | Date) => new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const enderecoEmpresa = payload.empresa.endereco_completo
      || payload.empresa.endereco
      || [payload.empresa.logradouro, payload.empresa.numero, payload.empresa.complemento, payload.empresa.bairro, payload.empresa.cidade, payload.empresa.estado]
        .filter(Boolean)
        .join(', ')
      || '—';
    const enderecoContador = [payload.contador?.endereco_escritorio, [payload.contador?.cidade_escritorio, payload.contador?.uf_escritorio].filter(Boolean).join('/')]
      .filter(Boolean)
      .join(', ') || '—';
    const totalPrevisto = payload.previsoes.reduce((s, r) => s + (Number(r.yhat) || 0), 0);
    const linhasPrevisao = payload.previsoes.map(r => `
      <tr>
        <td>${esc(fmtMes(r.ds))}</td>
        <td>${fmt(r.yhat)}</td>
        <td>R$ 0,00</td>
        <td>${fmt(r.yhat)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Demonstrativo de Previsão de Faturamento</title>
  <style>
@page { size: A4; margin: 12mm 14mm; }
body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #222; margin: 0; padding: 0; line-height: 1.3; }
.doc-title { text-align: center; font-size: 14pt; font-weight: bold; color: #1B3A8C; margin: 0 0 4px; }
.empresa-linha { text-align: center; font-size: 9.5pt; margin-bottom: 8px; }
hr.divider { border: none; border-top: 1px solid #aaa; margin: 8px 0; }
.declaracao { text-align: justify; font-size: 9.5pt; margin: 8px 0 12px; line-height: 1.4; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 12px; }
th { background: #1B3A8C; color: #fff; padding: 6px 8px; text-align: center; font-weight: bold; font-size: 9pt; }
td { border: 1px solid #ccc; padding: 5px 8px; text-align: center; }
tr:nth-child(even) td { background: #f4f7ff; }
.total-row td { font-weight: bold; background: #dce3f5; border: 1px solid #999; }
.city-date { text-align: right; font-style: italic; margin: 28px 0 36px; font-size: 10pt; color: #374151; }
.signature-section { margin-top: 44px; page-break-inside: avoid; break-inside: avoid; }
.signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24mm; max-width: 160mm; margin: 0 auto; align-items: end; page-break-inside: avoid; break-inside: avoid; }
.signature-card { text-align: center; min-height: 120px; display: flex; flex-direction: column; justify-content: flex-end; }
.signature-line { border: none; border-top: 1.5px solid #1e293b; max-width: 76mm; width: 100%; margin: 0 auto 8px; height: 0; }
.sig-name { font-size: 9pt; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 3px; }
.sig-sub { font-size: 8pt; color: #475569; margin: 0 0 2px; }
  </style>
</head>
<body>
  <div class="doc-title">DEMONSTRATIVO DE PREVISÃO DE FATURAMENTO</div>
  <div class="empresa-linha"><strong>${esc(payload.empresa.razao_social || '—')}</strong>${payload.empresa.cnpj ? ` &nbsp;|&nbsp; CNPJ: ${esc(payload.empresa.cnpj)}` : ''}</div>
  <hr class="divider">
  <p class="declaracao">
    Declaramos para os devidos fins, a pedido da empresa supra qualificada,
    e sob as penas da lei, que a previsão de faturamento para os próximos
    ${esc(payload.horizonte_meses)} meses, baseada no histórico de crescimento, contratos
    vigentes e projeções de mercado, apresenta os seguintes valores estimados:
  </p>
  <table>
    <thead>
      <tr>
        <th>Mês/Ano</th>
        <th>Receita Bruta de Vendas (R$)</th>
        <th>Receita de Serviços (R$)</th>
        <th>Faturamento Total (R$)</th>
      </tr>
    </thead>
    <tbody>
      ${linhasPrevisao}
      <tr class="total-row">
        <td>TOTAL PREVISTO</td>
        <td>${fmt(totalPrevisto)}</td>
        <td>R$ 0,00</td>
        <td>${fmt(totalPrevisto)}</td>
      </tr>
    </tbody>
  </table>
  <div class="city-date">Brasília - DF, ${esc(dataEmissao)}.</div>
  <div class="signature-section">
    <div class="signature-grid">
      <div class="signature-card">
        <div class="signature-line"></div>
        <div><strong>${esc(payload.contador?.nome || '________________________________')}</strong></div>
        <div>Contador Responsável</div>
        <div>CRC: ${esc(payload.contador?.crc || '—')}</div>
      </div>
      <div class="signature-card">
        <div class="signature-line"></div>
        <div><strong>${esc(payload.empresa.razao_social || '—')}</strong></div>
        <div>Representante Legal</div>
        <div>CNPJ: ${esc(payload.empresa.cnpj || '—')}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
  // ─── HTML DECLARAÇÃO ANUAL DE FATURAMENTO (documento contábil) ─────────────
  function gerarHtmlDeclaracaoAnual(payload: {
    empresa: {
      razao_social?: string | null;
      cnpj?: string | null;
      endereco?: string | null;
      endereco_completo?: string | null;
      logradouro?: string | null;
      numero?: string | null;
      complemento?: string | null;
      bairro?: string | null;
      cidade?: string | null;
      estado?: string | null;
      segmento?: string | null;
    };
    historico: { competencia: string | Date; valor: number | string }[];
    contador?: {
      nome?: string | null;
      cpf?: string | null;
      crc?: string | null;
      email?: string | null;
      telefone?: string | null;
      nome_escritorio?: string | null;
      cnpj_escritorio?: string | null;
      endereco_escritorio?: string | null;
      cidade_escritorio?: string | null;
      uf_escritorio?: string | null;
    } | null;
    cidade?: string;
    dataEmissao?: Date;
    data_referencia?: Date | string | null;
  }): string {
    const esc = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
    const toDate = (value: string | Date) => value instanceof Date ? value : new Date(String(value).slice(0, 10) + 'T12:00:00');
    const fmtMesAno = (value: string | Date) => toDate(value).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const fmtMesAnoAbrev = (value: string | Date) => toDate(value).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
    const dataEmissao = payload.dataEmissao || new Date();
    // ── Rolling 12 meses a partir da data de referência (ou hoje) ──
    const dataRef = payload.data_referencia
      ? (payload.data_referencia instanceof Date ? payload.data_referencia : new Date(String(payload.data_referencia).slice(0, 10) + 'T12:00:00'))
      : new Date();
    const anoFim = dataRef.getFullYear();
    const mesFim = dataRef.getMonth();
    const meses12: { ano: number; mes: number; chave: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      let m = mesFim - i;
      let a = anoFim;
      while (m < 0) { m += 12; a--; }
      const chave = `${a}-${String(m + 1).padStart(2, '0')}`;
      meses12.push({ ano: a, mes: m, chave });
    }
    const periodoInicio = meses12[0].chave + '-01';
    const periodoFim = meses12[11].chave + '-01';
    const mapaHistorico: Record<string, number> = {};
    for (const r of payload.historico) {
      const d = toDate(r.competencia);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      mapaHistorico[chave] = (mapaHistorico[chave] || 0) + (Number(r.valor) || 0);
    }
    const registros12 = meses12.map(({ chave }) => ({
      competencia: chave + '-01',
      valor: mapaHistorico[chave] || 0,
    }));
    const total12 = registros12.reduce((s, r) => s + r.valor, 0);
    const linhasHistorico = registros12.map(r => `
      <tr>
        <td>${esc(fmtMesAno(r.competencia))}</td>
        <td>${fmt(r.valor)}</td>
      </tr>`).join('');
    const labelPeriodo = `${fmtMesAnoAbrev(periodoInicio)} a ${fmtMesAnoAbrev(periodoFim)}`;
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Declaração de Faturamento — Últimos 12 Meses</title>
  <style>
@page { size: A4; margin: 12mm 14mm; }
body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #222; margin: 0; padding: 0; line-height: 1.3; }
.doc-title { text-align: center; font-size: 14pt; font-weight: bold; color: #1B3A8C; margin: 0 0 4px; }
.empresa-linha { text-align: center; font-size: 9.5pt; margin-bottom: 2px; }
.periodo-linha { text-align: center; font-size: 9.5pt; color: #1B3A8C; font-weight: bold; margin-bottom: 10px; }
hr.divider { border: none; border-top: 1px solid #aaa; margin: 8px 0; }
.declaracao { text-align: justify; font-size: 9.5pt; margin: 8px 0 12px; line-height: 1.4; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 12px; }
th { background: #1B3A8C; color: #fff; padding: 6px 8px; text-align: center; font-weight: bold; font-size: 9pt; }
td { border: 1px solid #ccc; padding: 5px 8px; text-align: center; }
tr:nth-child(even) td { background: #f4f7ff; }
.total-row td { font-weight: bold; background: #dce3f5; border: 1px solid #999; }
.city-date { text-align: right; font-style: italic; margin: 28px 0 36px; font-size: 10pt; color: #374151; }
.signature-section { margin-top: 44px; page-break-inside: avoid; break-inside: avoid; }
.signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24mm; max-width: 160mm; margin: 0 auto; align-items: end; page-break-inside: avoid; break-inside: avoid; }
.signature-card { text-align: center; min-height: 120px; display: flex; flex-direction: column; justify-content: flex-end; }
.signature-line { border: none; border-top: 1.5px solid #1e293b; max-width: 76mm; width: 100%; margin: 0 auto 8px; height: 0; }
.sig-name { font-size: 9pt; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 3px; }
.sig-sub { font-size: 8pt; color: #475569; margin: 0 0 2px; }
  </style>
</head>
<body>
  <div class="doc-title">DECLARAÇÃO DE FATURAMENTO DOS ÚLTIMOS 12 MESES</div>
  <div class="empresa-linha"><strong>${esc(payload.empresa.razao_social || '—')}</strong>${payload.empresa.cnpj ? ` &nbsp;|&nbsp; CNPJ: ${esc(payload.empresa.cnpj)}` : ''}</div>
  <div class="periodo-linha">Período apurado: ${esc(labelPeriodo)}</div>
  <hr class="divider">
  <p class="declaracao">
    Declaramos para os devidos fins, a pedido da empresa supra qualificada,
    e sob as penas da lei, que o faturamento realizado nos últimos 12 meses
    apresentou os seguintes valores:
  </p>
  <table>
    <thead>
      <tr>
        <th>Mês/Ano</th>
        <th>Faturamento Total (R$)</th>
      </tr>
    </thead>
    <tbody>
      ${linhasHistorico}
      <tr class="total-row">
        <td>TOTAL (12 MESES)</td>
        <td>${fmt(total12)}</td>
      </tr>
    </tbody>
  </table>
  <div class="city-date">Brasília - DF, ${esc(dataEmissao.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }))}.</div>
  <div class="signature-section">
    <div class="signature-grid">
      <div class="signature-card">
        <div class="signature-line"></div>
        <div><strong>${esc(payload.contador?.nome || '________________________________')}</strong></div>
        <div>Contador Responsável</div>
        <div>CRC: ${esc(payload.contador?.crc || '—')}</div>
      </div>
      <div class="signature-card">
        <div class="signature-line"></div>
        <div><strong>${esc(payload.empresa.razao_social || '—')}</strong></div>
        <div>Representante Legal</div>
        <div>CNPJ: ${esc(payload.empresa.cnpj || '—')}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }


  // ─── HTML SIMULAÇÃO / PROPOSTA (papel timbrado) ──────────────────────────
  function gerarHtmlSimulacao(payload: {
    cliente: { nome: string; email?: string; telefone?: string; cnpj?: string };
    simulacao: {
      produto: string;
      valor: number;
      prazo: number;
      parcela: number;
      taxa: number;
      data?: string;
    };
    consultor?: string;
  }): string {
    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const fmtPct = (v: number) => v.toFixed(2).replace('.', ',') + '%';

    const body = `
<h1 class="doc-title">PROPOSTA DE CRÉDITO</h1>
<h1 class="doc-title" style="font-size:11pt; font-weight:normal; margin-bottom:24px;">Simulação de Financiamento — Destrava Crédito</h1>

<table class="data-table" style="margin-bottom:20px">
  <tr>
    <th colspan="2">Dados do Cliente</th>
  </tr>
  <tr>
    <td style="width:30%"><strong>Nome / Razão Social</strong></td>
    <td>${payload.cliente.nome}</td>
  </tr>
  ${payload.cliente.cnpj ? `<tr><td><strong>CNPJ</strong></td><td>${payload.cliente.cnpj}</td></tr>` : ''}
  ${payload.cliente.email ? `<tr><td><strong>E-mail</strong></td><td>${payload.cliente.email}</td></tr>` : ''}
  ${payload.cliente.telefone ? `<tr><td><strong>Telefone</strong></td><td>${payload.cliente.telefone}</td></tr>` : ''}
  ${payload.consultor ? `<tr><td><strong>Consultor</strong></td><td>${payload.consultor}</td></tr>` : ''}
</table>

<h2 class="section-title">Detalhes da Simulação</h2>

<div style="display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
  <div class="highlight-box" style="flex:1; min-width:150px;">
    <div class="label">Produto</div>
    <div class="value" style="font-size:14pt">${payload.simulacao.produto}</div>
  </div>
  <div class="highlight-box" style="flex:1; min-width:150px;">
    <div class="label">Valor Solicitado</div>
    <div class="value">${fmt(payload.simulacao.valor)}</div>
  </div>
  <div class="highlight-box" style="flex:1; min-width:150px;">
    <div class="label">Parcela Estimada</div>
    <div class="value">${fmt(payload.simulacao.parcela)}<span style="font-size:10pt; font-weight:normal">/mês</span></div>
  </div>
</div>

<table class="data-table">
  <tr>
    <th style="width:50%">Parâmetro</th>
    <th style="width:50%">Valor</th>
  </tr>
  <tr><td>Produto / Modalidade</td><td><strong>${payload.simulacao.produto}</strong></td></tr>
  <tr><td>Valor de Crédito</td><td><strong>${fmt(payload.simulacao.valor)}</strong></td></tr>
  <tr><td>Prazo</td><td>${payload.simulacao.prazo} meses</td></tr>
  <tr><td>Taxa de Juros (a.m.)</td><td>${fmtPct(payload.simulacao.taxa)}</td></tr>
  <tr><td>Parcela Estimada</td><td><strong>${fmt(payload.simulacao.parcela)}</strong></td></tr>
  <tr><td>Total a Pagar</td><td><strong>${fmt(payload.simulacao.parcela * payload.simulacao.prazo)}</strong></td></tr>
  <tr><td>Data da Simulação</td><td>${payload.simulacao.data || new Date().toLocaleDateString('pt-BR')}</td></tr>
</table>

<p style="margin-top:16px; font-size:9pt; color:#666; font-style:italic;">
  <strong>Importante:</strong> Esta proposta é uma simulação com fins informativos. Os valores apresentados são estimativas e podem variar conforme análise de crédito, perfil do solicitante e condições da instituição financeira parceira. A aprovação do crédito está sujeita à análise documental completa pela equipe Destrava Crédito.
</p>

<p class="city-date" style="margin-top:36px;">Brasília – DF, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.</p>

<div class="signature-block">
  <p>Consultor Responsável:</p>
  <div class="signature-line"></div>
  <p class="signature-label">DESTRAVA CRÉDITO LTDA — CNPJ nº 35.427.182/0001-66</p>
</div>
`;

    return gerarHtmlTimbrado(body, 'PROPOSTA DE CRÉDITO');
  }


  function formatarEnderecoPartes(dados: any): string {
    return [dados?.endereco, dados?.cidade, dados?.uf, dados?.cep].filter(Boolean).join(', ');
  }

  function normalizarPrestadorServico(row: any): any {
    if (!row) return null;
    const tipoPessoa = row.tipo_pessoa || (row.cpf && !row.cnpj ? 'pf' : 'pj');
    const nomeExibicao = tipoPessoa === 'pf'
      ? (row.nome || row.razao_social || row.nome_fantasia || '')
      : (row.razao_social || row.nome_fantasia || row.nome || '');
    const documento = tipoPessoa === 'pf' ? (row.cpf || '') : (row.cnpj || '');
    const enderecoCompleto = formatarEnderecoPartes(row) || row.endereco || '';

    return {
      id: row.id,
      tipo_pessoa: tipoPessoa,
      razao_social: row.razao_social || '',
      nome_fantasia: row.nome_fantasia || '',
      nome: row.nome || '',
      nome_exibicao: nomeExibicao,
      documento_label: tipoPessoa === 'pf' ? 'CPF' : 'CNPJ',
      documento,
      cnpj: row.cnpj || '',
      cpf: row.cpf || '',
      email: row.email || '',
      telefone: row.telefone || '',
      endereco: enderecoCompleto,
      cidade: row.cidade || '',
      uf: row.uf || '',
      cep: row.cep || '',
      representante_nome: row.representante_nome || '',
      representante_cpf: row.representante_cpf || '',
      representante_cargo: row.representante_cargo || '',
      observacoes: row.observacoes || '',
      logo_url: row.logo_url || '',
      logo_path: row.logo_path || '',
      usar_papel_personalizado: row.usar_papel_personalizado !== false,
      cabecalho_html: row.cabecalho_html || '',
      rodape_html: row.rodape_html || '',
      cor_primaria: row.cor_primaria || '',
      cor_secundaria: row.cor_secundaria || '',
      cidade_assinatura: row.cidade_assinatura || '',
      uf_assinatura: row.uf_assinatura || '',
      mostrar_logo_contrato: row.mostrar_logo_contrato !== false,
    };
  }

  function qualificacaoContratada(contratada: any): string {
    if (!contratada) return 'PRESTADORA DE SERVIÇOS.';
    const nome = contratada.nome_exibicao || contratada.razao_social || contratada.nome || 'PRESTADORA DE SERVIÇOS';
    const documento = contratada.documento ? `${contratada.documento_label || 'Documento'} n° ${contratada.documento}` : '';
    const endereco = contratada.endereco ? `, com endereço/sede em ${contratada.endereco}` : '';
    const representante = contratada.representante_nome
      ? `, representada neste ato por ${contratada.representante_nome}${contratada.representante_cargo ? `, ${contratada.representante_cargo}` : ''}${contratada.representante_cpf ? `, CPF n° ${contratada.representante_cpf}` : ''}`
      : '';
    if (contratada.tipo_pessoa === 'pf') {
      return `${nome}${documento ? `, inscrita no ${documento}` : ''}${endereco}.`;
    }
    return `${nome}${documento ? `, pessoa jurídica inscrita no ${documento}` : ''}${endereco}${representante}.`;
  }

  async function buscarPrestadorServicoAtivo(id: string): Promise<any | null> {
    if (!id) return null;
    const { rows } = await pool.query(
      `SELECT * FROM prestadores_servico WHERE id = $1 AND ativo = true LIMIT 1`,
      [id]
    );
    return rows.length ? normalizarPrestadorServico(rows[0]) : null;
  }

  async function buscarResponsavelContrato(id: string): Promise<any | null> {
    if (!id) return null;
    const { rows } = await pool.query(
      `SELECT id, nome, cargo, email, telefone
         FROM colaboradores
        WHERE id = $1 AND ativo = true
        LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  function escapeHtmlContrato(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function corContrato(value: any, fallback: string): string {
    const cor = String(value || '').trim();
    return /^#[0-9A-Fa-f]{6}$/.test(cor) ? cor : fallback;
  }

  function cidadeUfAssinaturaContrato(contrato: any, contratada: any, fallback = 'BRASÍLIA – DF'): string {
    if (contrato?.cidade_assinatura) return contrato.cidade_assinatura;
    const cidade = contratada?.cidade_assinatura || contratada?.cidade || '';
    const uf = contratada?.uf_assinatura || contratada?.uf || '';
    if (cidade && uf) return `${cidade.toUpperCase()} – ${uf.toUpperCase()}`;
    if (cidade) return cidade.toUpperCase();
    return fallback;
  }

  function contratadaDestravaNormalizada(): any {
    return normalizarPrestadorServico({
      tipo_pessoa: 'pj',
      razao_social: CONTRATADA_DADOS.razao_social,
      nome_fantasia: 'Destrava Crédito',
      cnpj: CONTRATADA_DADOS.cnpj,
      endereco: CONTRATADA_DADOS.endereco_sede,
      representante_nome: CONTRATADA_DADOS.representante,
      representante_cpf: CONTRATADA_DADOS.cpf_representante,
      representante_cargo: CONTRATADA_DADOS.cargo_representante,
      logo_url: 'https://destravacredito.com/logo-destrava.png',
      cor_primaria: '#1B3A8C',
      cor_secundaria: '#f0a500',
      cidade_assinatura: 'BRASÍLIA',
      uf_assinatura: 'DF',
      rodape_html: '<strong>BRASÍLIA - SEDE</strong><br/>St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250<br/><strong>GOIÂNIA - FILIAL</strong><br/>Avenida Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-GO',
    });
  }

  function renderContratoPdfHtml(titulo: string, body: string, contratada: any): string {
    const nome = contratada?.nome_exibicao || contratada?.razao_social || contratada?.nome || 'DESTRAVA CRÉDITO';
    const documento = contratada?.documento
      ? `${contratada.documento_label || 'Documento'}: ${contratada.documento}`
      : '';
    const contato = [contratada?.telefone, contratada?.email].filter(Boolean).join(' • ');
    const endereco = contratada?.endereco || '';
    const corPrimaria = corContrato(contratada?.cor_primaria, '#1e3a8a');
    const corSecundaria = corContrato(contratada?.cor_secundaria, '#334155');
    const logo = contratada?.mostrar_logo_contrato !== false ? (contratada?.logo_url || contratada?.logo_path || '') : '';
    const nomeNormalizado = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const isPermuPay = nomeNormalizado.includes('permupay') || nomeNormalizado.includes('permu pay');
    const logoHtml = logo
      ? `<img class="brand-logo" src="${escapeHtmlContrato(logo)}" alt="${escapeHtmlContrato(nome)}" />`
      : isPermuPay
        ? `<div class="brand-wordmark brand-wordmark-permupay"><span>Permu</span><strong>Pay</strong></div>`
        : `<div class="brand-mark">${escapeHtmlContrato((nome || 'D').trim().charAt(0).toUpperCase())}</div>`;

    const cabecalhoCustom = contratada?.usar_papel_personalizado !== false && contratada?.cabecalho_html
      ? `<div class="brand-custom-header">${contratada.cabecalho_html}</div>`
      : '';

    const rodapeDefault = `
      <strong>${escapeHtmlContrato(nome)}</strong>
      ${documento ? ` • ${escapeHtmlContrato(documento)}` : ''}
      ${contato ? ` • ${escapeHtmlContrato(contato)}` : ''}
      ${endereco ? `<br/>${escapeHtmlContrato(endereco)}` : ''}
    `;

    const rodapeHtml = contratada?.usar_papel_personalizado !== false && contratada?.rodape_html
      ? contratada.rodape_html
      : rodapeDefault;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeHtmlContrato(titulo)}</title>
  <style>
    ${getDocumentStyles()}

    :root {
      --brand-primary: ${corPrimaria};
      --brand-secondary: ${corSecundaria};
      --text-main: #0f172a;
      --text-muted: #475569;
      --line-soft: #d7deea;
      --table-soft: #f4f7fb;
    }

    * { box-sizing: border-box; }

    html, body {
      background: #fff;
      color: var(--text-main);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9.2pt;
      line-height: 1.38;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-header {
      width: 100%;
      height: 22mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--line-soft);
      padding-bottom: 7px;
      background: #fff;
      margin-bottom: 14px;
      /* SEM position:fixed — aparece apenas na 1ª página (fluxo normal) */
    }

    .brand-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .brand-logo {
      max-width: 38mm;
      max-height: 14mm;
      object-fit: contain;
      display: block;
    }

    .brand-wordmark {
      min-width: 34mm;
      height: 13mm;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
      border-radius: 999px;
      border: 1px solid rgba(30, 58, 138, .18);
      background: linear-gradient(135deg, rgba(30,58,138,.06), rgba(14,165,233,.10));
      color: var(--brand-primary);
      font-size: 13pt;
      font-weight: 800;
      letter-spacing: -.02em;
      line-height: 1;
      white-space: nowrap;
    }

    .brand-wordmark strong {
      color: #0ea5e9;
      margin-left: 1px;
      font-weight: 900;
    }

    .brand-wordmark-permupay {
      color: #0f172a;
      border-color: rgba(14, 165, 233, .26);
      background: linear-gradient(135deg, #ffffff, rgba(14,165,233,.12));
    }

    .brand-mark {
      width: 12mm;
      height: 12mm;
      border-radius: 50%;
      background: var(--brand-primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13pt;
      font-weight: 700;
    }

    .brand-info {
      min-width: 0;
    }

    .brand-name {
      color: var(--brand-primary);
      font-size: 10.5pt;
      font-weight: 800;
      line-height: 1.2;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 115mm;
    }

    .brand-doc {
      color: var(--text-muted);
      font-size: 8.4pt;
      margin-top: 2px;
    }

    .brand-custom-header {
      color: var(--text-muted);
      font-size: 8.4pt;
      text-align: right;
      max-width: 62mm;
      line-height: 1.25;
    }

    .page-footer {
      width: 100%;
      min-height: 14mm;
      border-top: 1px solid var(--line-soft);
      padding-top: 5px;
      margin-top: 28px;
      color: #64748b;
      font-size: 7.8pt;
      line-height: 1.28;
      background: #fff;
      text-align: center;
      /* SEM position:fixed — aparece apenas na última página (fluxo normal) */
    }

    .contract-content {
      width: 100%;
      /* padding-top zerado: header agora é inline, não fixed */
      padding-top: 0;
      padding-bottom: 0;
    }

    .doc-title {
      color: var(--brand-primary);
      text-align: center;
      font-size: 12pt;
      line-height: 1.2;
      letter-spacing: .03em;
      text-transform: uppercase;
      margin: 0 0 12px 0;
      padding-bottom: 7px;
      border-bottom: 2px solid var(--brand-primary);
    }

    .section-title {
      color: var(--brand-primary);
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: .01em;
      text-transform: uppercase;
      margin: 8px 0 3px;
      padding: 3px 6px;
      background: linear-gradient(90deg, rgba(30,58,138,.10), rgba(30,58,138,.02));
      border-left: 3px solid var(--brand-primary);
      break-after: avoid;
      page-break-after: avoid;
    }

    .clause {
      margin: 0 0 4px;
      text-align: justify;
      orphans: 3;
      widows: 3;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.8pt;
      margin: 6px 0 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .data-table td {
      border: 1px solid var(--line-soft);
      padding: 7px 8px;
      vertical-align: top;
    }

    .data-table td:first-child {
      color: var(--brand-primary);
      background: var(--table-soft) !important;
      font-weight: 800;
      width: 38%;
    }

    .city-date {
      text-align: right;
      margin: 20px 0 28px;
      font-weight: 500;
    }
    .sig-wrapper {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .signature-grid {
      width: 100%;
      max-width: 148mm;
      margin: 24px auto 0;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      gap: 14mm;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-before: avoid;
    }

    .signature-party {
      flex: 0 0 60mm;
      max-width: 60mm;
      text-align: center;
    }

    .sig-line {
      width: 60mm;
      height: 1px;
      border-top: 1.2px solid #111827;
      margin: 0 auto 6px;
    }

    .sig-name {
      margin: 0 0 3px;
      font-size: 8.8pt;
      line-height: 1.2;
      font-weight: 800;
      color: #111827;
      text-transform: none;
    }

    .sig-sub {
      margin: 0 0 2px;
      font-size: 7.8pt;
      line-height: 1.2;
      color: #334155;
    }

    @media print {
      .section-title,
      .data-table,
      .signature-grid,
      .sig-wrapper {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .city-date + .signature-grid,
      .sig-wrapper {
        page-break-before: avoid;
      }
    }
  </style>
</head>
<body>
  <header class="page-header">
    <div class="brand-left">
      ${logoHtml}
      <div class="brand-info">
        <div class="brand-name">${escapeHtmlContrato(nome)}</div>
        ${documento ? `<div class="brand-doc">${escapeHtmlContrato(documento)}</div>` : ''}
      </div>
    </div>
    ${cabecalhoCustom}
  </header>

  <main class="contract-content">
    ${body}
  </main>

  <footer class="page-footer">
    ${rodapeHtml}
  </footer>
</body>
</html>`;
  }

  // ─── HTML CONTRATO LIMPA NOME (papel timbrado) ──────────────────────────────
  async function gerarHtmlContratoLimpaNome(payload: any): Promise<string> {
    const { contratante, contrato } = payload;
    const contratada      = payload.contratada || normalizarPrestadorServico({});
    const responsavelContrato = payload.responsavel_contrato || null;
    const nomeContratada  = contratada?.nome_exibicao || contratada?.razao_social || contratada?.nome || 'PRESTADORA DE SERVIÇOS';
    const docContratada   = contratada?.documento ? `${contratada.documento_label || 'Documento'}: ${contratada.documento}` : '';
    const qualifContratada = qualificacaoContratada(contratada);
    const responsavelTexto = responsavelContrato?.nome
      ? responsavelContrato.nome
      : '';
    const valorContrato   = contrato.valor_contrato_formatado || 'R$ 0,00';
    const condicaoPgto    = contrato.condicao_pagamento || 'a combinar';
    const prazoEntrega    = contrato.prazo_entrega_dias || 30;
    const prazoGarantia   = contrato.prazo_garantia_meses || 6;
    const foro            = contrato.foro_eleito || 'Taguatinga';
    const dataAss         = contrato.data_assinatura_formatada || new Date().toLocaleDateString('pt-BR');
    const cidadeAss       = cidadeUfAssinaturaContrato(contrato, contratada, 'BRASÍLIA – DF');
    const taxaConsulta    = contrato.taxa_consulta_serasa || 'R$ 50,00';
    const taxaReprotocolo = contrato.taxa_reprotocolo || 'R$ 300,00';
    const isPJ = !!contratante.cnpj;
    const endContratante  = contratante.endereco || contratante.domicilio || '';

    const body = `
<h1 class="doc-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>

${blocoIdentificacaoContrato(contrato)}

<h2 class="section-title">QUADRO RESUMIDO</h2>
<table class="data-table" style="margin-bottom:20px;">
  <tr><td style="width:40%; font-weight:bold; background:#f0f4ff;">CONTRATADA</td><td>${nomeContratada}${docContratada ? ` — ${docContratada}` : ''}</td></tr>
  ${responsavelTexto ? `<tr><td style="font-weight:bold; background:#f0f4ff;">Responsável pela assessoria</td><td>${responsavelTexto}</td></tr>` : ''}
  <tr><td style="font-weight:bold; background:#f0f4ff;">CONTRATANTE</td><td>${contratante.nome || contratante.razao_social}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">${isPJ ? 'CNPJ' : 'CPF'}</td><td>${isPJ ? contratante.cnpj : contratante.cpf}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Domicílio</td><td>${endContratante}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Valor do Contrato</td><td><strong>${valorContrato}</strong></td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Condição de Pagamento</td><td>${condicaoPgto}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Prazo de Entrega</td><td>Até ${prazoEntrega} dias corridos</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Prazo Total de Garantia</td><td>${prazoGarantia} meses</td></tr>
</table>

<h2 class="section-title">IDENTIFICAÇÃO DA CONTRATADA</h2>
<p class="clause"><strong>CONTRATADA:</strong> ${qualifContratada}</p>
${responsavelTexto ? `<p class="clause"><strong>RESPONSÁVEL OPERACIONAL PELA ASSESSORIA:</strong> ${responsavelTexto}.</p>` : ''}

<h2 class="section-title">CLÁUSULA 1 – DO OBJETO</h2>
<p class="clause"><strong>1.1</strong> - O presente instrumento tem por objeto a prestação de serviços de assessoria jurídica pela CONTRATADA, consistente na elaboração, protocolo e acompanhamento de medida judicial para a não exposição pública das restrições financeiras do CONTRATANTE perante os órgãos de proteção ao crédito (Serasa, SPC e similares), por meio de liminar judicial.</p>
<p class="clause"><strong>1.2</strong> - O serviço consiste exclusivamente na não exposição das restrições, não implicando na quitação ou cancelamento das dívidas subjacentes.</p>

<h2 class="section-title">CLÁUSULA 2 – DA NATUREZA JURÍDICA DO SERVIÇO E DA POSSIBILIDADE DE CASSAÇÃO DA LIMINAR</h2>
<p class="clause"><strong>2.1</strong> - O CONTRATANTE está ciente de que o serviço é baseado em medida judicial liminar, de caráter provisório, podendo ser cassada a qualquer momento por decisão judicial superveniente, independentemente da vontade das partes.</p>
<p class="clause"><strong>2.2</strong> - A CONTRATADA não se responsabiliza pela cassação da liminar por decisão judicial, sendo que, neste caso, o serviço será reprotocolado sem custo adicional, desde que dentro do prazo de garantia contratual.</p>

<h2 class="section-title">CLÁUSULA 3 – DO PRAZO DE ENTREGA DO SERVIÇO</h2>
<p class="clause"><strong>3.1</strong> - A CONTRATADA se compromete a entregar o serviço no prazo de até ${prazoEntrega} (${prazoEntrega === 30 ? 'trinta' : String(prazoEntrega)}) dias corridos, contados da data de assinatura deste contrato e do pagamento integral do valor acordado.</p>
<p class="clause"><strong>3.2</strong> - Em casos excepcionais, devidamente justificados, o prazo poderá ser prorrogado por mais 30 (trinta) dias, mediante comunicação prévia ao CONTRATANTE.</p>

<h2 class="section-title">CLÁUSULA 4 – DO PREÇO E DA CONDIÇÃO DE PAGAMENTO</h2>
<p class="clause"><strong>4.1</strong> - Pelo serviço ora contratado, o CONTRATANTE pagará à CONTRATADA o valor de <strong>${valorContrato}</strong>, nas seguintes condições: <strong>${condicaoPgto}</strong>.</p>
<p class="clause"><strong>4.2</strong> - O não pagamento nas condições acordadas implicará na suspensão imediata dos serviços, sem prejuízo das medidas legais cabíveis.</p>

<h2 class="section-title">CLÁUSULA 5 – DA CONCLUSÃO DO SERVIÇO</h2>
<p class="clause"><strong>5.1</strong> - O serviço será considerado concluído quando o CONTRATANTE apresentar consulta ao Serasa demonstrando a não exposição das restrições financeiras.</p>

<h2 class="section-title">CLÁUSULA 6 – DA GARANTIA CONTRATUAL DE ${prazoGarantia} MESES</h2>
<p class="clause"><strong>6.1</strong> - A CONTRATADA oferece garantia de ${prazoGarantia} (${prazoGarantia === 6 ? 'seis' : String(prazoGarantia)}) meses, contados da data da consulta Serasa que comprove a não exposição das restrições.</p>
<p class="clause"><strong>6.2</strong> - Durante o período de garantia, caso haja retorno da exposição das restrições, a CONTRATADA reprotocolará o serviço sem custo adicional, desde que comprovado mediante consulta ao Serasa, cujo custo de ${taxaConsulta} será de responsabilidade do CONTRATANTE.</p>

<h2 class="section-title">CLÁUSULA 7 – DA NECESSIDADE DE CONSULTA PARA COMPROVAÇÃO DE RETORNO DA RESTRIÇÃO</h2>
<p class="clause"><strong>7.1</strong> - Para acionamento da garantia, o CONTRATANTE deverá apresentar consulta ao Serasa, com custo de ${taxaConsulta}, a ser pago pelo CONTRATANTE, comprovando o retorno da exposição da restrição.</p>

<h2 class="section-title">CLÁUSULA 8 – DAS NOVAS RESTRIÇÕES E DA TAXA DE REPROTOCOLO</h2>
<p class="clause"><strong>8.1</strong> - Restrições financeiras inseridas após a data de assinatura deste contrato não estão cobertas pela garantia e serão tratadas como novo serviço.</p>
<p class="clause"><strong>8.2</strong> - Caso o CONTRATANTE solicite o reprotocolo de novas restrições, será cobrada taxa de ${taxaReprotocolo} por restrição.</p>

<h2 class="section-title">CLÁUSULA 9 – DAS OBRIGAÇÕES DO CONTRATANTE</h2>
<p class="clause"><strong>9.1</strong> - Fornecer todos os documentos necessários para a prestação do serviço.</p>
<p class="clause"><strong>9.2</strong> - Não contrair novas dívidas durante o período de prestação do serviço.</p>
<p class="clause"><strong>9.3</strong> - Efetuar o pagamento nas condições acordadas.</p>

<h2 class="section-title">CLÁUSULA 10 – DAS OBRIGAÇÕES DA CONTRATADA</h2>
<p class="clause"><strong>10.1</strong> - Prestar o serviço com diligência, técnica e dentro do prazo acordado.</p>
<p class="clause"><strong>10.2</strong> - Manter sigilo sobre todas as informações do CONTRATANTE.</p>
<p class="clause"><strong>10.3</strong> - Comunicar ao CONTRATANTE qualquer impedimento ou dificuldade na prestação do serviço.</p>

<h2 class="section-title">CLÁUSULA 11 – DA AUSÊNCIA DE VÍNCULO E DO SIGILO</h2>
<p class="clause"><strong>11.1</strong> - O presente contrato não estabelece qualquer vínculo empregatício entre as partes.</p>
<p class="clause"><strong>11.2</strong> - As partes se comprometem a manter sigilo sobre todas as informações trocadas em razão deste contrato.</p>

<h2 class="section-title">CLÁUSULA 12 – DA RESCISÃO</h2>
<p class="clause"><strong>12.1</strong> - O presente contrato poderá ser rescindido por qualquer das partes, mediante notificação prévia de 15 (quinze) dias.</p>
<p class="clause"><strong>12.2</strong> - Em caso de rescisão por iniciativa do CONTRATANTE após o início dos serviços, será devida à CONTRATADA a remuneração proporcional aos serviços já prestados.</p>

<h2 class="section-title">CLÁUSULA 13 – DO FORO</h2>
<p class="clause">Para dirimir quaisquer controvérsias oriundas deste contrato, as partes elegem o foro da Circunscrição Judiciária de <strong>${foro}</strong>, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>

<p class="city-date">${cidadeAss}, ${dataAss}.</p>

<div class="signature-grid">
  <div class="signature-party">
    <div class="sig-line"></div>
    <p class="sig-name">${contratante.nome || contratante.razao_social}</p>
    <p class="sig-sub">${isPJ ? 'CNPJ: ' + contratante.cnpj : 'CPF: ' + contratante.cpf}</p>
    <p class="sig-sub">CONTRATANTE</p>
  </div>
  <div class="signature-party">
    <div class="sig-line"></div>
    <p class="sig-name">${nomeContratada}</p>
    ${docContratada ? `<p class="sig-sub">${docContratada}</p>` : ''}
    <p class="sig-sub">CONTRATADA</p>
  </div>
</div>
`;

    return renderContratoPdfHtml('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', body, contratada);
  }

  // ─── CONTRATO LIMPA BACEN ─────────────────────────────────────────────────
  async function gerarHtmlContratoBacen(payload: any): Promise<string> {
    const { contratante, representante, contrato } = payload;
    const contratada      = payload.contratada || normalizarPrestadorServico({});
    const responsavelContrato = payload.responsavel_contrato || null;
    const nomeContratada  = contratada?.nome_exibicao || contratada?.razao_social || contratada?.nome || 'PRESTADORA DE SERVIÇOS';
    const docContratada   = contratada?.documento ? `${contratada.documento_label || 'Documento'}: ${contratada.documento}` : '';
    const qualifContratada = qualificacaoContratada(contratada);
    const responsavelTexto = responsavelContrato?.nome
      ? responsavelContrato.nome
      : '';
    const valorContrato    = contrato.valor_contrato_formatado || 'R$ 0,00';
    const condicaoPgto     = contrato.condicao_pagamento || 'a combinar';
    const prazoExecucao    = contrato.prazo_execucao_dias_uteis || 120;
    const prazoAtualizacao = contrato.prazo_atualizacao_orgao_dias || 60;
    const foro             = contrato.foro_eleito || 'Brasília/DF';
    const dataAss          = contrato.data_assinatura_formatada || new Date().toLocaleDateString('pt-BR');
    const cidadeAss        = cidadeUfAssinaturaContrato(contrato, contratada, 'BRASÍLIA – DF');

    const isContratantePJ = !!contratante?.cnpj && !!contratante?.razao_social;
    const nomeContratante = isContratantePJ
      ? contratante.razao_social
      : (contratante?.nome || contratante?.razao_social || 'CONTRATANTE');
    const docContratante = isContratantePJ ? (contratante.cnpj || '') : (contratante?.cpf || '');
    const docContratanteLabel = isContratantePJ ? 'CNPJ' : 'CPF';
    const enderecoContratante = contratante?.endereco || contratante?.domicilio || '';
    const representanteNome = representante?.nome || contratante?.representante || '';
    const representanteCpf = representante?.cpf || contratante?.cpf_representante || '';
    const qualifContratante = isContratantePJ
      ? `${nomeContratante}, CNPJ n° ${docContratante}${enderecoContratante ? `, com sede em ${enderecoContratante}` : ''}${representanteNome ? `, representada neste ato por ${representanteNome}${representanteCpf ? `, CPF n° ${representanteCpf}` : ''}` : ''}.`
      : `${nomeContratante}${docContratante ? `, CPF n° ${docContratante}` : ''}${contratante?.rg ? `, RG n° ${contratante.rg}` : ''}${contratante?.estado_civil ? `, ${contratante.estado_civil}` : ''}${contratante?.profissao ? `, ${contratante.profissao}` : ''}${enderecoContratante ? `, residente e domiciliado(a) em ${enderecoContratante}` : ''}.`;

    const body = `
<h1 class="doc-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>

${blocoIdentificacaoContrato(contrato)}
<h2 class="section-title">IDENTIFICAÇÃO DAS PARTES</h2>
<p class="clause"><strong>CONTRATADA:</strong> ${qualifContratada}</p>
${responsavelTexto ? `<p class="clause"><strong>RESPONSÁVEL OPERACIONAL PELA ASSESSORIA:</strong> ${responsavelTexto}.</p>` : ''}
<p class="clause"><strong>CONTRATANTE:</strong> ${qualifContratante}</p>
<h2 class="section-title">1. CLÁUSULA PRIMEIRA – OBJETO DO CONTRATO</h2>
<p class="clause"><strong>1.1.</strong> O presente CONTRATO, mediante a propositura de ação judicial, objetiva a suspensão da exposição dos apontamentos do CONTRATANTE identificados no relatório BACEN/SCR. Desta forma serão retiradas as anotações e vencidos do relatório SCR, existentes até o mês de referência da consulta feita no ato da assinatura deste contrato.</p>
<p class="clause"><strong>1.2.</strong> Os serviços contratados diante deste contrato não são uma garantia de crédito para o CONTRATANTE.</p>
<h2 class="section-title">2. CLÁUSULA SEGUNDA – DAS DESPESAS E HONORÁRIOS</h2>
<p class="clause"><strong>2.1.</strong> As despesas extraordinárias, custas e despesas administrativas são de responsabilidade do CONTRATANTE.</p>
<p class="clause"><strong>2.2.</strong> O valor do serviço contratado é de <strong>${valorContrato}</strong> e deve ser pago nas seguintes condições: <strong>${condicaoPgto}</strong>, ou em conta corrente jurídica de titularidade da CONTRATADA, inexistindo a possibilidade de cancelamento após o processo ser protocolado em órgão competente.</p>
<h2 class="section-title">3. CLÁUSULA TERCEIRA – PRAZO</h2>
<p class="clause"><strong>3.1.</strong> A CONTRATADA pede o prazo máximo de <strong>${prazoExecucao} (${prazoExecucao === 120 ? 'cento e vinte' : String(prazoExecucao)}) dias úteis</strong> contados da data da assinatura do contrato, para a execução integral do serviço e <strong>${prazoAtualizacao} dias</strong> após a conclusão do processo, para atualização do órgão competente.</p>
<h2 class="section-title">4. CLÁUSULA QUARTA – DISPOSIÇÕES GERAIS</h2>
<p class="clause"><strong>4.1.</strong> O CONTRATANTE declara ter sido devidamente cientificado pela CONTRATADA de todas as peculiaridades da situação em que se encontra, com base no relatório SCR/BACEN. Contrato em aberto (EM DIA) não está incluso neste processo e, vindo a ser inserido posteriormente no relatório de VENCIDO, deverá o CONTRATANTE solicitar e pagar à CONTRATADA um novo contrato de prestação de serviço.</p>
<p class="clause"><strong>4.2.</strong> Sob exclusiva responsabilidade do CONTRATANTE, e a seu ônus, serão contratados profissionais da área para a prática dos atos que forem privativos de profissões regulamentadas, quando assim for determinado judicialmente, tais como Perito Judicial e Assistente Técnico.</p>
<p class="clause"><strong>4.3.</strong> Se, sem culpa da CONTRATADA, lhe for cassado o mandato, ou se o CONTRATANTE ajustar outro patrono ou terceiros, ou ainda acordar diretamente com a outra parte sem a ciência e anuência da CONTRATADA, ou se por ato prejudicial aos objetivos do presente instrumento por parte do CONTRATANTE a CONTRATADA vier a renunciar ao mandato, a quantia fixada na cláusula segunda torna o presente contrato imediatamente exigível como dívida líquida e certa, independentemente de quaisquer formalidades, inclusive notificação ou interpelação, e serão cobrados por via de Ação de Execução.</p>
<h2 class="section-title">5. CLÁUSULA QUINTA – DISPOSIÇÕES FINAIS</h2>
<p class="clause"><strong>5.1.</strong> O CONTRATANTE se obriga por si, seus herdeiros e sucessores ao fiel cumprimento de todas as cláusulas e condições pactuadas. Qualquer tolerância ou concessão por parte da CONTRATADA não implicará em novação e não terá a faculdade de alterar o pactuado, permanecendo íntegras todas as cláusulas e condições ora avençadas.</p>
<p class="clause"><strong>5.2.</strong> O presente contrato é um título executivo extrajudicial conforme previsão legal e, em caso de inadimplemento do cliente, permite a propositura de ação de execução autônoma para o recebimento dos honorários devidos e não pagos.</p>
<p class="clause"><strong>5.3.</strong> Suficientemente informado, declaro que li e compreendi o conceito do "BACEN/SCR".</p>
<h2 class="section-title">6. CLÁUSULA SEXTA – DO FORO</h2>
<p class="clause"><strong>6.1.</strong> Para dirimir quaisquer controvérsias oriundas do CONTRATO, as partes elegem o foro da comarca de <strong>${foro}</strong>.</p>
<p class="clause">Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias de igual teor.</p>
<p class="city-date">${cidadeAss}, ${dataAss}.</p>
<div class="signature-grid">
  <div class="signature-party">
    <div class="sig-line"></div>
    <p class="sig-name">${nomeContratante}</p>
    ${docContratante ? `<p class="sig-sub">${docContratanteLabel}: ${docContratante}</p>` : ''}
    <p class="sig-sub">CONTRATANTE</p>
  </div>
  <div class="signature-party">
    <div class="sig-line"></div>
    <p class="sig-name">${nomeContratada}</p>
    ${docContratada ? `<p class="sig-sub">${docContratada}</p>` : ''}
    <p class="sig-sub">CONTRATADA</p>
  </div>
</div>
`;
    return renderContratoPdfHtml('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', body, contratada);
  }

  // ─── CONTRATO RATING ──────────────────────────────────────────────────────
  async function gerarHtmlContratoRating(payload: any): Promise<string> {
    const { contratante, representante, contrato } = payload;
    const contratada   = payload.contratada || contratadaDestravaNormalizada();
    const responsavelContrato = payload.responsavel_contrato || null;
    const nomeContratada = contratada?.nome_exibicao || contratada?.razao_social || contratada?.nome || CONTRATADA_DADOS.razao_social;
    const docContratada = contratada?.documento ? `${contratada.documento_label || 'Documento'}: ${contratada.documento}` : '';
    const qualifContratada = qualificacaoContratada(contratada);
    const responsavelTexto = responsavelContrato?.nome ? responsavelContrato.nome : '';
    const valorContrato = contrato.valor_contrato_formatado || 'R$ 0,00';
    const condicaoPgto  = contrato.condicao_pagamento || 'a combinar';
    const prazoAcomp    = contrato.prazo_acompanhamento_dias || 90;
    const prazoProrrog  = contrato.prazo_prorrogacao_dias || 90;
    const foro          = contrato.foro_eleito || 'Taguatinga/DF';
    const dataAss       = contrato.data_assinatura_formatada || new Date().toLocaleDateString('pt-BR');
    const cidadeAss     = contrato.cidade_assinatura || 'BRASÍLIA – DF';
    const body = `
<h1 class="doc-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ASSESSORIA FINANCEIRA</h1>

${blocoIdentificacaoContrato(contrato)}
<h1 class="doc-title" style="font-size:10pt; font-weight:normal; margin-bottom:20px;">ALGORITMO FINANCEIRO / RATING DE CRÉDITO</h1>
<h2 class="section-title">I – IDENTIFICAÇÃO DAS PARTES</h2>
<p class="clause"><strong>CONTRATADA:</strong> ${qualifContratada}</p>
${responsavelTexto ? `<p class="clause"><strong>RESPONSÁVEL OPERACIONAL PELA ASSESSORIA:</strong> ${responsavelTexto}.</p>` : ''}
<p class="clause"><strong>CONTRATANTE:</strong> ${contratante.razao_social}, CNPJ n° ${contratante.cnpj}, com sede em ${contratante.endereco}, representada neste ato por ${representante.nome}, CPF n° ${representante.cpf}.</p>
<h2 class="section-title">CLÁUSULA PRIMEIRA – DO OBJETO</h2>
<p class="clause"><strong>1.1.</strong> O presente contrato tem por objeto a prestação de serviços de assessoria financeira especializada pela CONTRATADA, consistente na análise, monitoramento e orientação para melhoria do rating de crédito e do score financeiro do CONTRATANTE junto às instituições financeiras, bureaus de crédito e demais órgãos competentes, por meio da aplicação de metodologias e algoritmos financeiros proprietários.</p>
<p class="clause"><strong>1.2.</strong> Os serviços incluem: análise do perfil financeiro atual, identificação de pontos de melhoria, orientação sobre boas práticas financeiras, acompanhamento da evolução do rating e emissão de relatórios periódicos de desempenho.</p>
<p class="clause"><strong>1.3.</strong> A CONTRATADA não garante resultado específico de score, aprovação de crédito ou liberação de financiamentos, uma vez que tais decisões são de competência exclusiva das instituições financeiras.</p>
<h2 class="section-title">CLÁUSULA SEGUNDA – DO PRAZO</h2>
<p class="clause"><strong>2.1.</strong> O acompanhamento será realizado pelo prazo de <strong>${prazoAcomp} (${prazoAcomp === 90 ? 'noventa' : String(prazoAcomp)}) dias</strong>, podendo ser prorrogado por igual período mediante acordo entre as partes.</p>
<p class="clause"><strong>2.2.</strong> Em casos excepcionais devidamente justificados, o prazo poderá ser prorrogado por mais <strong>${prazoProrrog} (${prazoProrrog === 90 ? 'noventa' : String(prazoProrrog)}) dias</strong>, mediante comunicação prévia ao CONTRATANTE.</p>
<h2 class="section-title">CLÁUSULA TERCEIRA – DO PREÇO E DA CONDIÇÃO DE PAGAMENTO</h2>
<p class="clause"><strong>3.1.</strong> Pelos serviços ora contratados, o CONTRATANTE pagará à CONTRATADA o valor de <strong>${valorContrato}</strong>, nas seguintes condições: <strong>${condicaoPgto}</strong>.</p>
<p class="clause"><strong>3.2.</strong> O não pagamento nas condições acordadas implicará na suspensão imediata dos serviços, sem prejuízo das medidas legais cabíveis.</p>
<h2 class="section-title">CLÁUSULA QUARTA – DAS OBRIGAÇÕES DA CONTRATADA</h2>
<p class="clause"><strong>4.1.</strong> Realizar análise técnica do perfil financeiro do CONTRATANTE e apresentar relatório inicial no prazo de até 15 (quinze) dias úteis após a assinatura do contrato e recebimento da documentação necessária.</p>
<p class="clause"><strong>4.2.</strong> Fornecer orientações personalizadas e acompanhamento periódico durante a vigência do contrato.</p>
<p class="clause"><strong>4.3.</strong> Manter sigilo absoluto sobre todas as informações financeiras do CONTRATANTE.</p>
<h2 class="section-title">CLÁUSULA QUINTA – DAS OBRIGAÇÕES DO CONTRATANTE</h2>
<p class="clause"><strong>5.1.</strong> Fornecer todos os documentos e informações necessários para a prestação do serviço, garantindo sua veracidade e atualidade.</p>
<p class="clause"><strong>5.2.</strong> Seguir as orientações fornecidas pela CONTRATADA para a melhoria do rating de crédito.</p>
<p class="clause"><strong>5.3.</strong> Efetuar o pagamento nas condições acordadas.</p>
<h2 class="section-title">CLÁUSULA SEXTA – DA AUSÊNCIA DE VÍNCULO E DO SIGILO</h2>
<p class="clause"><strong>6.1.</strong> O presente contrato não estabelece qualquer vínculo empregatício, societário ou de representação comercial entre as partes.</p>
<p class="clause"><strong>6.2.</strong> As partes se comprometem a manter sigilo sobre todas as informações trocadas em razão deste contrato, inclusive após o seu término.</p>
<h2 class="section-title">CLÁUSULA SÉTIMA – DA RESCISÃO</h2>
<p class="clause"><strong>7.1.</strong> O presente contrato poderá ser rescindido por qualquer das partes mediante notificação prévia de 15 (quinze) dias, sem prejuízo das obrigações já constituídas.</p>
<h2 class="section-title">CLÁUSULA OITAVA – DO FORO</h2>
<p class="clause">Para dirimir quaisquer controvérsias oriundas deste contrato, as partes elegem o foro da Circunscrição Judiciária de <strong>${foro}</strong>, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
<p class="city-date">${cidadeAss}, ${dataAss}.</p>
<div class="signature-section">
  <div class="signature-grid">
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">${contratante.razao_social}</p>
      <p class="sig-sub">CNPJ: ${contratante.cnpj}</p>
      <p class="sig-sub">CONTRATANTE</p>
    </div>
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">${nomeContratada}</p>
      ${docContratada ? `<p class="sig-sub">${docContratada}</p>` : ''}
      <p class="sig-sub">CONTRATADA</p>
    </div>
  </div>
</div>
`;
    return renderContratoPdfHtml('CONTRATO RATING / ALGORITMO FINANCEIRO', body, contratada);
  }

  // ─── CONTRATO PARCERIA COMERCIAL ──────────────────────────────────────────
  async function gerarHtmlContratoParceriaComercial(payload: any): Promise<string> {
    const { parceiro, contrato } = payload;
    const contratada  = contratadaDestravaNormalizada();
    const pctDestrava = contrato.percentual_destrava || 70;
    const pctParceiro = contrato.percentual_parceiro || 30;
    const prazoPgto   = contrato.prazo_pagamento_dias_uteis || 5;
    const avisoPrevio = contrato.aviso_previo_rescisao_dias || 30;
    const foro        = contrato.foro_eleito || 'Taguatinga/DF';
    const dataAss     = contrato.data_assinatura_formatada || new Date().toLocaleDateString('pt-BR');
    const cidadeAss   = contrato.cidade_assinatura || 'BRASÍLIA – DF';
    const temTest1    = !!(contrato.testemunha_1_nome);
    const temTest2    = !!(contrato.testemunha_2_nome);
    const qualificacaoParceiro = [
      parceiro.estado_civil ? `, ${parceiro.estado_civil}` : '',
      parceiro.profissao ? `, ${parceiro.profissao}` : '',
      `, inscrita no CPF sob o n° ${parceiro.cpf}`,
      parceiro.cnpj ? ` e no CNPJ sob o n° ${parceiro.cnpj}` : '',
      `, residente e domiciliada em ${parceiro.endereco}`,
    ].join('');
    const body = `
<h1 class="doc-title">CONTRATO DE PARCERIA COMERCIAL</h1>

${blocoIdentificacaoContrato(contrato)}
<p class="clause"><strong>CONTRATADA:</strong> ${qualificacaoContratada(contratada)}, doravante denominada simplesmente DESTRAVA CRÉDITO.</p>
<p class="clause"><strong>PARCEIRA COMERCIAL:</strong> ${parceiro.nome}, brasileira${qualificacaoParceiro}, doravante denominada simplesmente PARCEIRA.</p>
<p class="clause">As partes acima qualificadas celebram o presente Contrato de Parceria Comercial, que se regerá pelas seguintes cláusulas e condições:</p>
<h2 class="section-title">CLÁUSULA PRIMEIRA – DO OBJETO</h2>
<p class="clause"><strong>1.1.</strong> O presente contrato tem como objeto a formalização de parceria comercial entre a DESTRAVA CRÉDITO e a PARCEIRA para a prospecção e captação de clientes (pessoas físicas ou jurídicas) interessados na obtenção de crédito bancário, doravante denominados CLIENTES.</p>
<p class="clause"><strong>1.2.</strong> A PARCEIRA atuará como intermediária autônoma, identificando potenciais CLIENTES, apresentando os serviços da DESTRAVA CRÉDITO, recolhendo a documentação necessária para análise de crédito e prestando o suporte inicial.</p>
<p class="clause"><strong>1.3.</strong> A DESTRAVA CRÉDITO será responsável por analisar a documentação fornecida, avaliar o perfil de crédito do CLIENTE, identificar a instituição financeira mais adequada e orientar o CLIENTE no processo de contratação do crédito.</p>
<h2 class="section-title">CLÁUSULA SEGUNDA – DAS OBRIGAÇÕES DA DESTRAVA CRÉDITO</h2>
<p class="clause"><strong>2.1.</strong> Realizar a análise técnica e criteriosa dos documentos dos CLIENTES indicados pela PARCEIRA.</p>
<p class="clause"><strong>2.2.</strong> Indicar ao CLIENTE a instituição financeira que apresente a linha de crédito mais vantajosa e compatível com seu perfil, ou identificar oportunidades em bancos com os quais o CLIENTE já possua relacionamento.</p>
<p class="clause"><strong>2.3.</strong> Prestar assessoria ao CLIENTE durante o processo de negociação e formalização do crédito junto à instituição financeira.</p>
<p class="clause"><strong>2.4.</strong> Repassar à PARCEIRA a quota-parte da comissão de sucesso, conforme estipulado na Cláusula Quarta, após o efetivo recebimento dos valores pagos pelo CLIENTE.</p>
<p class="clause"><strong>2.5.</strong> Manter a PARCEIRA informada sobre o andamento das negociações com os CLIENTES por ela captados.</p>
<h2 class="section-title">CLÁUSULA TERCEIRA – DAS OBRIGAÇÕES DA PARCEIRA</h2>
<p class="clause"><strong>3.1.</strong> Prospectar e captar ativamente novos CLIENTES com potencial interesse na contratação de produtos de crédito bancário.</p>
<p class="clause"><strong>3.2.</strong> Realizar o atendimento inicial, apresentar os serviços da DESTRAVA CRÉDITO e esclarecer as condições gerais da prestação de serviços.</p>
<p class="clause"><strong>3.3.</strong> Recolher junto aos CLIENTES toda a documentação solicitada pela DESTRAVA CRÉDITO, garantindo sua correta e completa entrega.</p>
<p class="clause"><strong>3.4.</strong> Arcar integralmente com todas as despesas decorrentes de sua atividade de prospecção e captação, incluindo, mas não se limitando a, custos com transporte, comunicação, alimentação e material de escritório. A DESTRAVA CRÉDITO não realizará qualquer tipo de reembolso ou ajuda de custo.</p>
<p class="clause"><strong>3.5.</strong> Atuar com ética, boa-fé e transparência, zelando pela imagem e bom nome da DESTRAVA CRÉDITO perante os CLIENTES e o mercado.</p>
<p class="clause"><strong>3.6.</strong> Encaminhar à DESTRAVA CRÉDITO todas as propostas e documentos dos CLIENTES captados para a devida análise e processamento.</p>
<h2 class="section-title">CLÁUSULA QUARTA – DA REMUNERAÇÃO E FORMA DE PAGAMENTO</h2>
<p class="clause"><strong>4.1.</strong> A título de remuneração pelos serviços de assessoria prestados pela DESTRAVA CRÉDITO, o CLIENTE pagará uma comissão de sucesso correspondente a 10% (dez por cento) sobre o valor total do crédito efetivamente contratado ou liberado pela instituição financeira.</p>
<p class="clause"><strong>4.2.</strong> A comissão de sucesso mencionada no item 4.1 será dividida em 2 partes entre a DESTRAVA CRÉDITO e a PARCEIRA, cabendo <strong>${pctDestrava}% (${pctDestrava === 70 ? 'setenta' : String(pctDestrava)} por cento)</strong> para DESTRAVA CRÉDITO e <strong>${pctParceiro}% (${pctParceiro === 30 ? 'trinta' : String(pctParceiro)} por cento)</strong> para a PARCEIRA COMERCIAL.</p>
<p class="clause"><strong>4.3.</strong> O pagamento da parcela devida à PARCEIRA será realizado pela DESTRAVA CRÉDITO em até <strong>${prazoPgto} (${prazoPgto === 5 ? 'cinco' : String(prazoPgto)}) dias úteis</strong> após a confirmação do recebimento integral da comissão paga pelo CLIENTE.</p>
<p class="clause"><strong>4.4.</strong> Fica expressamente estabelecido que a remuneração somente será devida em caso de sucesso na operação, ou seja, com a efetiva contratação e liberação dos recursos ao CLIENTE. Nenhuma remuneração será devida pela simples assinatura do contrato de prestação de serviços ou pela análise de documentos.</p>
<h2 class="section-title">CLÁUSULA QUINTA – DA AUSÊNCIA DE OBRIGAÇÃO DE RESULTADO</h2>
<p class="clause"><strong>5.1.</strong> As partes reconhecem que a prestação de serviços objeto deste contrato é uma atividade de meio, e não de resultado. A DESTRAVA CRÉDITO e a PARCEIRA se comprometem a empregar seus melhores esforços e conhecimentos técnicos na busca pela obtenção do crédito para o CLIENTE, contudo, não garantem a sua efetiva contratação, que depende de critérios exclusivos da instituição financeira.</p>
<p class="clause"><strong>5.2.</strong> A não obtenção do crédito não gerará qualquer direito a indenização ou penalidade para qualquer das partes, tampouco obrigará a DESTRAVA CRÉDITO ou a PARCEIRA a devolverem eventuais valores recebidos a título de taxas administrativas ou custos operacionais, caso aplicável e previamente acordado com o CLIENTE.</p>
<h2 class="section-title">CLÁUSULA SEXTA – DA AUSÊNCIA DE VÍNCULO EMPREGATÍCIO</h2>
<p class="clause"><strong>6.1.</strong> O presente contrato é de natureza estritamente cível e comercial, não gerando qualquer tipo de vínculo empregatício, societário ou de representação comercial entre a DESTRAVA CRÉDITO e a PARCEIRA.</p>
<p class="clause"><strong>6.2.</strong> A PARCEIRA declara ser profissional autônoma, com total liberdade para definir seus horários, métodos de trabalho e carteira de clientes, não estando sujeita a qualquer tipo de subordinação hierárquica ou cumprimento de jornada de trabalho.</p>
<h2 class="section-title">CLÁUSULA SÉTIMA – DA CONFIDENCIALIDADE</h2>
<p class="clause"><strong>7.1.</strong> As partes se obrigam a manter sigilo absoluto sobre todas as informações comerciais, financeiras, técnicas e dados pessoais de clientes a que tiverem acesso em razão deste contrato, não podendo divulgá-las, compartilhá-las ou utilizá-las para fins diversos dos aqui previstos, sob pena de rescisão imediata e apuração de perdas e danos.</p>
<p class="clause"><strong>7.2.</strong> A obrigação de sigilo perdurará mesmo após o término ou rescisão deste contrato.</p>
<h2 class="section-title">CLÁUSULA OITAVA – DA VIGÊNCIA E RESCISÃO</h2>
<p class="clause"><strong>8.1.</strong> O presente contrato vigorará por prazo indeterminado, a contar da data de sua assinatura.</p>
<p class="clause"><strong>8.2.</strong> Qualquer das partes poderá rescindir o presente contrato a qualquer tempo, sem ônus ou penalidades, mediante comunicação por escrito à outra parte com antecedência mínima de <strong>${avisoPrevio} (${avisoPrevio === 30 ? 'trinta' : String(avisoPrevio)}) dias</strong>.</p>
<p class="clause"><strong>8.3.</strong> A rescisão do contrato não afetará o direito ao recebimento das comissões por negócios já concluídos ou em andamento, que serão pagas na forma da Cláusula Quarta.</p>
<h2 class="section-title">CLÁUSULA NONA – DO FORO</h2>
<p class="clause"><strong>9.1.</strong> Para dirimir quaisquer controvérsias oriundas deste contrato, as partes elegem o foro da Circunscrição Judiciária de <strong>${foro}</strong>, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
<p class="clause">E, por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.</p>
<p class="city-date">${cidadeAss}, ${dataAss}.</p>
<div class="signature-section">
  <div class="signature-grid">
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">${contratada.nome_exibicao || contratada.razao_social}</p>
      <p class="sig-sub">${contratada.documento_label || 'CNPJ'}: ${contratada.documento || contratada.cnpj}</p>
      <p class="sig-sub">CONTRATADA</p>
    </div>
    <div class="signature-party">
      <div class="sig-line"></div>
      <p class="sig-name">${parceiro.nome}</p>
      <p class="sig-sub">CPF: ${parceiro.cpf}</p>
      <p class="sig-sub">PARCEIRA COMERCIAL</p>
    </div>
  </div>
</div>
${(temTest1 || temTest2) ? `
<div class="witness-grid" style="max-width: 160mm; margin: 36px auto 0;">
  <div class="witness-box">
    <p style="font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#1e3a5f; margin:0 0 8px;">Testemunha 1</p>
    <div class="sig-line"></div>
    <p class="sig-sub">${contrato.testemunha_1_nome || 'Nome: ___________________________________'}</p>
    <p class="sig-sub">${contrato.testemunha_1_cpf ? 'CPF: ' + contrato.testemunha_1_cpf : 'CPF: ____________________________________'}</p>
  </div>
  <div class="witness-box">
    <p style="font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#1e3a5f; margin:0 0 8px;">Testemunha 2</p>
    <div class="sig-line"></div>
    <p class="sig-sub">${contrato.testemunha_2_nome || 'Nome: ___________________________________'}</p>
    <p class="sig-sub">${contrato.testemunha_2_cpf ? 'CPF: ' + contrato.testemunha_2_cpf : 'CPF: ____________________________________'}</p>
  </div>
</div>` : ''}
`;
    return renderContratoPdfHtml('CONTRATO DE PARCERIA COMERCIAL', body, contratada);
  }

    async function gerarPdfContrato(payload: any): Promise<string> {
    const uploadsDir = path.resolve('uploads', 'contratos');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const html = await gerarHtmlContrato(payload);
    const fileName = `${nomeArquivoSeguroContrato(payload?.contrato?.protocolo_contrato, 'contrato-assessoria')}.pdf`;
    const filePath = path.join(uploadsDir, fileName);

    let browser;
    try {
      const puppeteer = await import('puppeteer-core');
      let executablePath: string;
      if (process.env.CHROMIUM_PATH) {
        executablePath = process.env.CHROMIUM_PATH;
      } else {
        try {
          const chromium = await import('@sparticuz/chromium');
          executablePath = await chromium.default.executablePath();
        } catch {
          executablePath = '/usr/bin/chromium-browser';
        }
      }
      browser = await puppeteer.default.launch({
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        margin: { top: '18mm', bottom: '18mm', left: '22mm', right: '22mm' },
      });
    } finally {
      if (browser) await browser.close();
    }
    return filePath;
  }

  async function calcularHashArquivo(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // ─── EXPORTAR PDF DE PREVISÃO DE FATURAMENTO ────────────────────────────────

  // ─── MULTER — Upload de documentos para contratos ──────────────────────────
  const uploadContratos = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB por arquivo
    fileFilter: (_req: any, file: any, cb: any) => {
      const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
    },
  });

  /**
   * Mescla o PDF do contrato com documentos anexos (imagens e PDFs) em layout A4 universal.
   *
   * Correção definitiva aplicada:
   * - Todo anexo é renderizado dentro de uma nova página A4 retrato fixa (595.28 x 841.89 pt).
   * - PDFs anexados NÃO são mais adicionados com o tamanho/orientação original da página.
   * - Cada página de PDF/imagem usa algoritmo FIT-CONTAIN: encaixa na área útil sem cortar, sem esticar e sem distorcer.
   * - Não cria páginas em branco/capas separadas: o cabeçalho do anexo fica na mesma página do conteúdo.
   * - Primeira página de cada anexo recebe cabeçalho com número do anexo e número do contrato.
   * - Todas as páginas anexas recebem marca d'água e rodapé com vínculo ao contrato.
   * - Funciona para qualquer quantidade de anexos, tanto PDF quanto JPG/PNG.
   */
  async function mergeAnexosNoPdf(
    contratoPath: string,
    anexos: Array<{ buffer: Buffer; mimetype: string; categoria: string; descricao: string }>,
    numeroContrato?: string,
  ): Promise<string> {
    const anexosValidos = (anexos || []).filter((a) => a?.buffer?.length);
    if (anexosValidos.length === 0) return contratoPath;

    const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');

    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const SAFE_MARGIN = 24;
    const FIRST_PAGE_HEADER_HEIGHT = 36;
    const FOOTER_HEIGHT = 24;
    const CONTENT_GAP = 10;

    const contratoPdfBytes = fs.readFileSync(contratoPath);
    const pdfFinal = await PDFDocument.load(contratoPdfBytes);
    const helveticaBold = await pdfFinal.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfFinal.embedFont(StandardFonts.Helvetica);

    const LABEL_CATEGORIA: Record<string, string> = {
      rg_frente: 'RG — Frente',
      rg_verso: 'RG — Verso',
      cnh_frente: 'CNH — Frente',
      cnh_verso: 'CNH — Verso',
      comprovante_endereco: 'Comprovante de Endereço',
      contrato_social: 'Contrato Social',
      alteracao_contratual: 'Alteração Contratual',
      procuracao: 'Procuração',
      rating_scr: 'Rating SCR / BACEN',
      boa_vista: 'Consulta Boa Vista',
      cemprot: 'Consulta CEMPROT',
      cenprot: 'Consulta CENPROT',
      serasa: 'Consulta Serasa',
      spc: 'Consulta SPC',
      receita_federal: 'Consulta Receita Federal',
      outros: 'Documento Anexo',
    };

    function fitContain(srcW: number, srcH: number, maxW: number, maxH: number) {
      if (!srcW || !srcH || !maxW || !maxH) {
        throw new Error('Dimensões inválidas ao encaixar anexo no PDF.');
      }
      const scale = Math.min(maxW / srcW, maxH / srcH);
      return {
        width: srcW * scale,
        height: srcH * scale,
        scale,
      };
    }

    function getContentBox(page: any, hasHeader: boolean) {
      const { width, height } = page.getSize();
      const topReserved = hasHeader
        ? SAFE_MARGIN + FIRST_PAGE_HEADER_HEIGHT + CONTENT_GAP
        : SAFE_MARGIN;
      const bottomReserved = FOOTER_HEIGHT + SAFE_MARGIN;

      return {
        x: SAFE_MARGIN,
        y: bottomReserved,
        width: width - SAFE_MARGIN * 2,
        height: height - topReserved - bottomReserved,
      };
    }

    function drawWatermark(page: any, contratoNumero?: string) {
      if (!contratoNumero) return;
      const { width, height } = page.getSize();
      const text = `ANEXO DO CONTRATO Nº ${contratoNumero}`;
      page.drawText(text, {
        x: width * 0.08,
        y: height * 0.28,
        size: 22,
        font: helveticaBold,
        color: rgb(0.60, 0.60, 0.60),
        opacity: 0.13,
        rotate: degrees(38),
      });
    }

    function drawFooter(page: any, labelCat: string, contratoNumero?: string) {
      const { width } = page.getSize();
      page.drawText(labelCat, {
        x: SAFE_MARGIN,
        y: 12,
        font: helvetica,
        size: 7,
        color: rgb(0.45, 0.45, 0.45),
      });
      if (contratoNumero) {
        page.drawText(`Anexo contrato nº: ${contratoNumero}`, {
          x: Math.max(SAFE_MARGIN, width - 210),
          y: 12,
          font: helvetica,
          size: 7,
          color: rgb(0.45, 0.45, 0.45),
        });
      }
    }

    function drawFirstPageHeader(page: any, numAnexo: number, labelCat: string, contratoNumero?: string) {
      const { width, height } = page.getSize();
      const title = `ANEXO Nº ${numAnexo} — ${labelCat.toUpperCase()}`;
      page.drawRectangle({
        x: SAFE_MARGIN,
        y: height - SAFE_MARGIN - FIRST_PAGE_HEADER_HEIGHT,
        width: width - SAFE_MARGIN * 2,
        height: FIRST_PAGE_HEADER_HEIGHT,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.82, 0.82, 0.82),
        borderWidth: 0.5,
        opacity: 0.96,
      });
      page.drawText(title, {
        x: SAFE_MARGIN + 8,
        y: height - SAFE_MARGIN - 21,
        font: helveticaBold,
        size: 10,
        color: rgb(0.106, 0.227, 0.549),
      });
      if (contratoNumero) {
        page.drawText(`Contrato nº: ${contratoNumero}`, {
          x: SAFE_MARGIN + 8,
          y: height - SAFE_MARGIN - 32,
          font: helvetica,
          size: 7,
          color: rgb(0.25, 0.25, 0.25),
        });
      }
    }

    function criarPaginaA4Anexo(numAnexo: number, labelCat: string, contratoNumero: string | undefined, primeiraPaginaDoAnexo: boolean) {
      const page = pdfFinal.addPage([A4_WIDTH, A4_HEIGHT]);
      if (primeiraPaginaDoAnexo) {
        drawFirstPageHeader(page, numAnexo, labelCat, contratoNumero);
      }
      return page;
    }

    for (let i = 0; i < anexosValidos.length; i++) {
      const anexo = anexosValidos[i];
      const labelCat = LABEL_CATEGORIA[anexo.categoria] ?? anexo.descricao ?? 'Documento Anexo';
      const numAnexo = i + 1;

      if (anexo.mimetype === 'application/pdf') {
        const pdfAnexo = await PDFDocument.load(anexo.buffer, { ignoreEncryption: true });
        const pageIndices = pdfAnexo.getPageIndices();
        const embeddedPages = await pdfFinal.embedPdf(anexo.buffer, pageIndices);

        embeddedPages.forEach((embeddedPage: any, pageIndex: number) => {
          const primeiraPaginaDoAnexo = pageIndex === 0;
          const page = criarPaginaA4Anexo(numAnexo, labelCat, numeroContrato, primeiraPaginaDoAnexo);
          const box = getContentBox(page, primeiraPaginaDoAnexo);
          const fitted = fitContain(embeddedPage.width, embeddedPage.height, box.width, box.height);
          const x = box.x + (box.width - fitted.width) / 2;
          const y = box.y + (box.height - fitted.height) / 2;

          page.drawPage(embeddedPage, {
            x,
            y,
            width: fitted.width,
            height: fitted.height,
          });

          drawWatermark(page, numeroContrato);
          drawFooter(page, labelCat, numeroContrato);
        });
      } else {
        let imgEmbed: any;
        if (anexo.mimetype === 'image/png') {
          imgEmbed = await pdfFinal.embedPng(anexo.buffer);
        } else {
          imgEmbed = await pdfFinal.embedJpg(anexo.buffer);
        }

        const page = criarPaginaA4Anexo(numAnexo, labelCat, numeroContrato, true);
        const box = getContentBox(page, true);
        const fitted = fitContain(imgEmbed.width, imgEmbed.height, box.width, box.height);
        const x = box.x + (box.width - fitted.width) / 2;
        const y = box.y + (box.height - fitted.height) / 2;

        page.drawRectangle({
          x: x - 3,
          y: y - 3,
          width: fitted.width + 6,
          height: fitted.height + 6,
          color: rgb(0.985, 0.985, 0.985),
          borderColor: rgb(0.82, 0.82, 0.82),
          borderWidth: 0.5,
        });
        page.drawImage(imgEmbed, {
          x,
          y,
          width: fitted.width,
          height: fitted.height,
        });

        drawWatermark(page, numeroContrato);
        drawFooter(page, labelCat, numeroContrato);
      }
    }

    const dir = path.dirname(contratoPath);
    const base = path.basename(contratoPath, '.pdf');
    const finalPath = path.join(dir, `${base}_completo.pdf`);
    const finalBytes = await pdfFinal.save();
    fs.writeFileSync(finalPath, finalBytes);
    return finalPath;
  }

  app.post('/api/faturamento/previsao/:id/exportar-pdf', auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { chartImageBase64, contador_id } = req.body || {};

      // Buscar dados do contador se informado
      let contadorData: any = null;
      if (contador_id) {
        const { rows: cRows } = await pool.query('SELECT * FROM contadores WHERE id=$1', [contador_id]);
        if (cRows.length) contadorData = cRows[0];
      }

      // Buscar previsão
      const { rows: prevRows } = await pool.query(
        `SELECT pf.*, e.razao_social, e.cnpj, e.logradouro, e.numero, e.complemento,
                e.bairro, e.cidade, e.estado, e.segmento,
                pf.payload_completo, pf.modelo_usado, pf.horizonte_meses,
                pf.capacidade_pgto_min, pf.capacidade_pgto_max, pf.gerada_em
           FROM previsao_faturamento pf
           JOIN empresas e ON e.id = pf.empresa_id
          WHERE pf.id = $1`,
        [id]
      );
      if (!prevRows.length) {
        res.status(404).json({ error: 'Previsão não encontrada' });
        return;
      }
      const prev = prevRows[0];
      if (!contadorData && prev.contador_id) {
        const { rows: ctRows } = await pool.query(
          'SELECT * FROM contadores WHERE id=$1',
          [prev.contador_id]
        );
        if (ctRows.length) contadorData = ctRows[0];
      }
      const pontos: any[] = prev.payload_completo || [];
      const historico = pontos.filter((p: any) => p.is_historico).map((p: any) => ({
        competencia: p.ds,
        valor: p.yhat,
      }));
      const previsoes = pontos.filter((p: any) => !p.is_historico);

      const htmlPayload = {
        empresa: {
          razao_social: prev.razao_social,
          cnpj: prev.cnpj,
          logradouro: prev.logradouro,
          numero: prev.numero,
          complemento: prev.complemento,
          bairro: prev.bairro,
          cidade: prev.cidade,
          estado: prev.estado,
          segmento: prev.segmento,
        },
        horizonte_meses: prev.horizonte_meses,
        modelo_usado: prev.modelo_usado,
        gerada_em: prev.gerada_em,
        capacidade_pgto_min: parseFloat(prev.capacidade_pgto_min),
        capacidade_pgto_max: parseFloat(prev.capacidade_pgto_max),
        historico,
        previsoes,
        chartImageBase64: chartImageBase64 || undefined,
        contador: contadorData,
      };

      const html = gerarHtmlPrevisaoFaturamento(htmlPayload);

      // Gerar PDF via Puppeteer
      const uploadsDir = path.resolve('uploads', 'previsoes');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const fileName = `previsao-${id}-${Date.now()}.pdf`;
      const filePath = path.join(uploadsDir, fileName);

      let browser;
      try {
        const puppeteer = await import('puppeteer-core');
        let executablePath: string;
        if (process.env.CHROMIUM_PATH) {
          executablePath = process.env.CHROMIUM_PATH;
        } else {
          try {
            const chromium = await import('@sparticuz/chromium');
            executablePath = await chromium.default.executablePath();
          } catch {
            executablePath = '/usr/bin/chromium-browser';
          }
        }
        browser = await puppeteer.default.launch({
          executablePath,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
          headless: true,
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({
          path: filePath,
          format: 'A4',
          printBackground: true,
          displayHeaderFooter: false,
          margin: { top: '18mm', bottom: '18mm', left: '20mm', right: '20mm' },
        });
      } finally {
        if (browser) await (browser as any).close();
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="previsao-faturamento-${prev.razao_social.replace(/[^a-zA-Z0-9]/g, '-')}.pdf"`);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('end', () => {
        fs.unlink(filePath, () => {});
      });
    } catch (err: any) {
      console.error('[POST /api/faturamento/previsao/:id/exportar-pdf]', err);
      res.status(500).json({ error: err.message || 'Erro ao gerar PDF da previsão' });
    }
  });

    // ─── FATURAMENTO HISTÓRICO ────────────────────────────────────────────────

  app.post('/api/faturamento/historico', auth, async (req: Request, res: Response) => {
    try {
      const { empresa_id, registros } = req.body;

      if (!empresa_id) {
        res.status(400).json({ error: 'empresa_id é obrigatório' });
        return;
      }
      if (!Array.isArray(registros) || registros.length < 12) {
        res.status(400).json({ error: 'É necessário pelo menos 12 meses de histórico' });
        return;
      }

      const empresaCheck = await pool.query('SELECT id FROM empresas WHERE id = $1', [empresa_id]);
      if (!empresaCheck.rows.length) {
        res.status(404).json({ error: 'Empresa não encontrada' });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const resultados = [];
        for (const reg of registros) {
          const competencia = new Date(reg.competencia);
          competencia.setDate(1);
          const r = await client.query(
            `INSERT INTO faturamento_historico (empresa_id, competencia, valor, origem)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (empresa_id, competencia) DO UPDATE
               SET valor = EXCLUDED.valor,
                   origem = EXCLUDED.origem,
                   updated_at = NOW()
             RETURNING *`,
            [empresa_id, competencia.toISOString().slice(0, 10), parseFloat(reg.valor), reg.origem || 'manual']
          );
          resultados.push(r.rows[0]);
        }
        await client.query('COMMIT');
        res.status(201).json({ success: true, total: resultados.length, registros: resultados });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[POST /api/faturamento/historico]', err);
      res.status(500).json({ error: 'Erro ao salvar histórico de faturamento' });
    }
  });

  app.get('/api/faturamento/historico/:empresaId', auth, async (req: Request, res: Response) => {
    try {
      const { empresaId } = req.params;
      const { rows } = await pool.query(
        `SELECT * FROM faturamento_historico
         WHERE empresa_id = $1
         ORDER BY competencia ASC`,
        [empresaId]
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/faturamento/historico/:empresaId]', err);
      res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
  });

  app.post('/api/faturamento/prever', auth, async (req: Request, res: Response) => {
    try {
      const { empresa_id, horizonte_meses = 12 } = req.body;

      if (!empresa_id) {
        res.status(400).json({ error: 'empresa_id é obrigatório' });
        return;
      }

      const { rows: historico } = await pool.query(
        `SELECT TO_CHAR(competencia, 'YYYY-MM-DD') as ds, valor::float as y
         FROM faturamento_historico
         WHERE empresa_id = $1
         ORDER BY competencia ASC`,
        [empresa_id]
      );

      if (historico.length < 12) {
        res.status(422).json({
          error: `Erro de validação: Você precisa preencher pelo menos 12 meses na tabela antes de gerar a previsão. O banco detectou apenas ${historico.length} mês(es).`
        });
        return;
      }

      // Em Docker, 'localhost' aponta para o próprio container, não para o host.
      // O IP padrão da interface docker0 é 172.17.0.1 — usado como fallback quando
      // PREDICAO_SERVICE_URL não está configurado nas variáveis de ambiente.
      const predicaoUrl = process.env.PREDICAO_SERVICE_URL || 'http://172.17.0.1:8001';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      let predicaoResult: any;
      let usouFallback = false;
      try {
        const response = await fetch(`${predicaoUrl}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ historico, horizonte_meses }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Serviço de previsão retornou ${response.status}: ${errBody}`);
        }
        predicaoResult = await response.json();
      } catch (err: any) {
        clearTimeout(timeout);
        // ── FALLBACK: Previsão linear simples quando Python está offline ──────────
        // Usa regressão linear (mínimos quadrados) sobre o histórico para projetar
        // os próximos N meses. Menos preciso que Prophet/ARIMA mas sempre disponível.
        console.warn('[POST /api/faturamento/prever] Microsserviço Python indisponível. Usando fallback linear:', err.message);
        usouFallback = true;

        const n = historico.length;
        const valores = historico.map((h: any) => parseFloat(h.y));

        // Regressão linear simples: y = a + b*x
        const sumX = (n * (n - 1)) / 2;
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
        const sumY = valores.reduce((s: number, v: number) => s + v, 0);
        const sumXY = valores.reduce((s: number, v: number, i: number) => s + i * v, 0);
        const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const a = (sumY - b * sumX) / n;

        // Desvio padrão para intervalo de confiança (~95% = ±1.96 * std)
        const media = sumY / n;
        const std = Math.sqrt(valores.reduce((s: number, v: number) => s + Math.pow(v - media, 2), 0) / n);
        const margem = 1.96 * std;

        // Montar pontos históricos
        const pontosHistorico = historico.map((h: any, i: number) => ({
          ds: h.ds,
          yhat: parseFloat(h.y),
          yhat_lower: parseFloat(h.y),
          yhat_upper: parseFloat(h.y),
          is_historico: true,
        }));

        // Montar pontos de previsão
        const ultimaData = new Date(historico[n - 1].ds + 'T12:00:00');
        const pontosPrevisao = Array.from({ length: horizonte_meses }, (_, i) => {
          const d = new Date(ultimaData);
          d.setMonth(d.getMonth() + i + 1);
          const ds = d.toISOString().slice(0, 10);
          const yhat = Math.max(0, a + b * (n + i));
          return {
            ds,
            yhat: Math.round(yhat * 100) / 100,
            yhat_lower: Math.max(0, Math.round((yhat - margem) * 100) / 100),
            yhat_upper: Math.round((yhat + margem) * 100) / 100,
            is_historico: false,
          };
        });

        const mediaPrevisao = pontosPrevisao.reduce((s, p) => s + p.yhat, 0) / pontosPrevisao.length;
        predicaoResult = {
          modelo_usado: 'linear_fallback',
          horizonte_meses,
          capacidade_pgto_min: Math.round(mediaPrevisao * 0.15 * 100) / 100,
          capacidade_pgto_max: Math.round(mediaPrevisao * 0.25 * 100) / 100,
          pontos: [...pontosHistorico, ...pontosPrevisao],
          aviso: 'Previsão gerada com modelo linear (serviço IA indisponível). Para maior precisão, ative o microsserviço Prophet.',
        };
        // ─────────────────────────────────────────────────────────────────────────
      }

      const { rows: saved } = await pool.query(
        `INSERT INTO previsao_faturamento
           (empresa_id, modelo_usado, horizonte_meses, capacidade_pgto_min, capacidade_pgto_max, payload_completo)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, gerada_em, modelo_usado, capacidade_pgto_min, capacidade_pgto_max`,
        [
          empresa_id,
          predicaoResult.modelo_usado,
          horizonte_meses,
          predicaoResult.capacidade_pgto_min,
          predicaoResult.capacidade_pgto_max,
          JSON.stringify(predicaoResult.pontos),
        ]
      );

      const resposta: any = {
        ...predicaoResult,
        previsao_id: saved[0].id,
        gerada_em: saved[0].gerada_em,
      };
      if (usouFallback) {
        resposta.aviso = predicaoResult.aviso;
        resposta.modelo_usado = 'linear_fallback';
      }
      res.json(resposta);
    } catch (err) {
      console.error('[POST /api/faturamento/prever]', err);
      res.status(500).json({ error: 'Erro ao gerar previsão' });
    }
  });

  app.get('/api/faturamento/previsao/:empresaId/ultima', auth, async (req: Request, res: Response) => {
    try {
      const { empresaId } = req.params;
      const { rows } = await pool.query(
        `SELECT * FROM previsao_faturamento
         WHERE empresa_id = $1
         ORDER BY gerada_em DESC
         LIMIT 1`,
        [empresaId]
      );
      if (!rows.length) {
        res.status(404).json({ error: 'Nenhuma previsão encontrada para esta empresa' });
        return;
      }
      const previsao = rows[0];
      res.json({
        ...previsao,
        pontos: previsao.payload_completo,
      });
    } catch (err) {
      console.error('[GET /api/faturamento/previsao/:empresaId/ultima]', err);
      res.status(500).json({ error: 'Erro ao buscar previsão' });
    }
  });

   // ─── CONTADORES ──────────────────────────────────────────────────────────
  app.get('/api/contadores', auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM contadores ORDER BY nome'
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/contadores]', err);
      res.status(500).json({ error: 'Erro ao listar contadores' });
    }
  });

  app.post('/api/contadores', auth, async (req: Request, res: Response) => {
    try {
      const { nome, cpf, crc, email, telefone, nome_escritorio, cnpj_escritorio, endereco_escritorio, cidade_escritorio, uf_escritorio, ativo } = req.body;
      if (!nome || !cpf || !crc) {
        res.status(400).json({ error: 'Nome, CPF e CRC são obrigatórios' });
        return;
      }
      const { rows } = await pool.query(
        `INSERT INTO contadores (nome, cpf, crc, email, telefone, nome_escritorio, cnpj_escritorio, endereco_escritorio, cidade_escritorio, uf_escritorio, ativo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (cpf) DO UPDATE SET nome = EXCLUDED.nome, crc = EXCLUDED.crc, email = EXCLUDED.email, updated_at = NOW()
         RETURNING *`,
        [nome.trim(), cpf.replace(/\D/g, ''), crc.trim(), email || null, telefone || null, nome_escritorio || null, cnpj_escritorio ? cnpj_escritorio.replace(/\D/g, '') : null, endereco_escritorio || null, cidade_escritorio || null, uf_escritorio || null, ativo !== false]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[POST /api/contadores]', err);
      res.status(500).json({ error: 'Erro ao criar contador' });
    }
  });

  app.put('/api/contadores/:id', auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { nome, cpf, crc, email, telefone, nome_escritorio, cnpj_escritorio, endereco_escritorio, cidade_escritorio, uf_escritorio, ativo } = req.body;
      if (!nome || !cpf || !crc) {
        res.status(400).json({ error: 'Nome, CPF e CRC são obrigatórios' });
        return;
      }
      const { rows } = await pool.query(
        `UPDATE contadores SET nome=$1, cpf=$2, crc=$3, email=$4, telefone=$5, nome_escritorio=$6, cnpj_escritorio=$7, endereco_escritorio=$8, cidade_escritorio=$9, uf_escritorio=$10, ativo=$11, updated_at=NOW()
         WHERE id=$12 RETURNING *`,
        [nome.trim(), cpf.replace(/\D/g, ''), crc.trim(), email || null, telefone || null, nome_escritorio || null, cnpj_escritorio ? cnpj_escritorio.replace(/\D/g, '') : null, endereco_escritorio || null, cidade_escritorio || null, uf_escritorio || null, ativo !== false, id]
      );
      if (rows.length === 0) { res.status(404).json({ error: 'Contador não encontrado' }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error('[PUT /api/contadores/:id]', err);
      res.status(500).json({ error: 'Erro ao atualizar contador' });
    }
  });

  app.delete('/api/contadores/:id', auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM contadores WHERE id=$1', [id]);
      res.status(204).end();
    } catch (err) {
      console.error('[DELETE /api/contadores/:id]', err);
      res.status(500).json({ error: 'Erro ao excluir contador' });
    }
  });

  // ─── DECLARAÇÃO ANUAL DE FATURAMENTO (rolling 12 meses) ────────────────────
  app.post('/api/faturamento/declaracao-anual/:empresaId/exportar-pdf', auth, async (req: Request, res: Response) => {
    try {
      const { empresaId } = req.params;
      const { contador_id, data_referencia } = req.body || {};
      const { rows: empRows } = await pool.query('SELECT * FROM empresas WHERE id=$1', [empresaId]);
      if (empRows.length === 0) {
        res.status(404).json({ error: 'Empresa não encontrada' });
        return;
      }
      // Rolling 12 meses: data de referência ou hoje
      const dataRef = data_referencia
        ? new Date(String(data_referencia).slice(0, 10) + 'T12:00:00')
        : new Date();
      const dataInicio = new Date(dataRef);
      dataInicio.setMonth(dataInicio.getMonth() - 11);
      dataInicio.setDate(1);
      const { rows: histRows } = await pool.query(
        `SELECT competencia, valor, origem
           FROM faturamento_historico
          WHERE empresa_id=$1
            AND competencia >= $2::date
            AND competencia <= $3::date
          ORDER BY competencia ASC`,
        [empresaId, dataInicio.toISOString().slice(0, 10), dataRef.toISOString().slice(0, 10)]
      );
      // Gera mesmo sem histórico (meses sem lançamento aparecem como R$ 0,00)
      let contador: any = null;
      if (contador_id) {
        const { rows: cRows } = await pool.query('SELECT * FROM contadores WHERE id=$1', [contador_id]);
        if (cRows.length > 0) contador = cRows[0];
      }
      const htmlFinal = gerarHtmlDeclaracaoAnual({
        empresa: empRows[0],
        historico: histRows,
        contador,
        data_referencia: dataRef,
      });

      const fileName = `declaracao-${crypto.randomUUID()}.pdf`;
      const uploadsDir = path.resolve('uploads', 'declaracoes');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filePath = path.join(uploadsDir, fileName);

      let browser;
      try {
        const puppeteer = await import('puppeteer-core');
        let executablePath: string;

        if (process.env.CHROMIUM_PATH) {
          executablePath = process.env.CHROMIUM_PATH;
        } else {
          try {
            const chromium = await import('@sparticuz/chromium');
            executablePath = await chromium.default.executablePath();
          } catch {
            executablePath = '/usr/bin/chromium-browser';
          }
        }

        browser = await puppeteer.default.launch({
          executablePath,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
          headless: true,
        });

        const page = await browser.newPage();
        await page.setContent(htmlFinal, { waitUntil: 'networkidle0' });
        await page.pdf({
          path: filePath,
          format: 'A4',
          printBackground: true,
          displayHeaderFooter: false,
          margin: { top: '18mm', bottom: '18mm', left: '20mm', right: '20mm' },
        });
      } finally {
        if (browser) await (browser as any).close();
      }

      const nomeArquivoEmpresa = (empRows[0].razao_social || 'empresa').replace(/[^a-zA-Z0-9]/g, '-');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="declaracao-faturamento-${nomeArquivoEmpresa}.pdf"`);

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('end', () => { fs.unlink(filePath, () => {}); });
    } catch (err) {
      console.error('[POST /api/faturamento/declaracao-anual]', err);
      res.status(500).json({ error: 'Erro ao gerar declaração anual' });
    }
  });

  // ─── CLIENTES PF ─────────────────────────────────────────────────────────────

  app.get('/api/clientes-pf', auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, nome, cpf, rg, data_nascimento, email, telefone,
                endereco, cidade, uf, cep, profissao, estado_civil,
                observacoes, ativo, created_at, updated_at
           FROM clientes_pf
          WHERE ativo = true
          ORDER BY nome`
      );
      res.json(rows);
    } catch (err: any) {
      console.error('[GET /api/clientes-pf]', err);
      res.status(500).json({ error: 'Erro ao listar clientes PF' });
    }
  });

  app.get('/api/clientes-pf/buscar', auth, async (req: Request, res: Response) => {
    try {
      const { q = '' } = req.query as { q?: string };
      const { rows } = await pool.query(
        `SELECT id, nome, cpf, rg, email, telefone, cidade, uf
           FROM clientes_pf
          WHERE ativo = true
            AND (nome ILIKE $1 OR cpf ILIKE $1 OR email ILIKE $1)
          ORDER BY nome
          LIMIT 30`,
        [`%${q}%`]
      );
      res.json(rows);
    } catch (err: any) {
      console.error('[GET /api/clientes-pf/buscar]', err);
      res.status(500).json({ error: 'Erro ao buscar clientes PF' });
    }
  });

  app.get('/api/clientes-pf/:id', auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query('SELECT * FROM clientes_pf WHERE id=$1', [req.params.id]);
      if (!rows.length) { res.status(404).json({ error: 'Cliente não encontrado' }); return; }
      res.json(rows[0]);
    } catch (err: any) {
      console.error('[GET /api/clientes-pf/:id]', err);
      res.status(500).json({ error: 'Erro ao buscar cliente' });
    }
  });

  app.post('/api/clientes-pf', auth, async (req: Request, res: Response) => {
    try {
      const {
        nome, cpf, rg, data_nascimento, email, telefone,
        endereco, cidade, uf, cep, profissao, estado_civil, observacoes
      } = req.body;
      if (!nome || !cpf) {
        res.status(400).json({ error: 'nome e cpf são obrigatórios' });
        return;
      }
      const { rows } = await pool.query(
        `INSERT INTO clientes_pf
           (nome, cpf, rg, data_nascimento, email, telefone,
            endereco, cidade, uf, cep, profissao, estado_civil, observacoes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          nome, cpf,
          rg || null, data_nascimento || null,
          email || null, telefone || null,
          endereco || null, cidade || null,
          uf || null, cep || null,
          profissao || null, estado_civil || null,
          observacoes || null,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      console.error('[POST /api/clientes-pf]', err);
      const msg = err.code === '23505' ? 'CPF já cadastrado' : (err.detail || 'Erro ao criar cliente');
      res.status(err.code === '23505' ? 409 : 500).json({ error: msg });
    }
  });

  app.put('/api/clientes-pf/:id', auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        nome, cpf, rg, data_nascimento, email, telefone,
        endereco, cidade, uf, cep, profissao, estado_civil, observacoes, ativo
      } = req.body;
      const { rows } = await pool.query(
        `UPDATE clientes_pf SET
           nome=$1, cpf=$2, rg=$3, data_nascimento=$4, email=$5, telefone=$6,
           endereco=$7, cidade=$8, uf=$9, cep=$10, profissao=$11,
           estado_civil=$12, observacoes=$13, ativo=$14, updated_at=NOW()
         WHERE id=$15 RETURNING *`,
        [
          nome, cpf,
          rg || null, data_nascimento || null,
          email || null, telefone || null,
          endereco || null, cidade || null,
          uf || null, cep || null,
          profissao || null, estado_civil || null,
          observacoes || null, ativo !== false,
          id
        ]
      );
      if (!rows.length) { res.status(404).json({ error: 'Cliente não encontrado' }); return; }
      res.json(rows[0]);
    } catch (err: any) {
      console.error('[PUT /api/clientes-pf/:id]', err);
      const msg = err.code === '23505' ? 'CPF já cadastrado' : (err.detail || 'Erro ao atualizar cliente');
      res.status(err.code === '23505' ? 409 : 500).json({ error: msg });
    }
  });

  app.delete('/api/clientes-pf/:id', auth, async (req: Request, res: Response) => {
    try {
      await pool.query('UPDATE clientes_pf SET ativo=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[DELETE /api/clientes-pf/:id]', err);
      res.status(500).json({ error: 'Erro ao desativar cliente' });
    }
  });

  // ─── PARCEIROS COMERCIAIS ────────────────────────────────────────────────
  const listarParceirosComerciais = async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM parceiros_comerciais WHERE ativo = true ORDER BY nome'
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/parceiros]', err);
      res.status(500).json({ error: 'Erro ao listar parceiros' });
    }
  };

  app.get('/api/parceiros', auth, listarParceirosComerciais);

  // Alias mantido por compatibilidade com o frontend do gerador de contratos.
  // Sem essa rota, o Express caía no fallback da SPA e devolvia index.html,
  // causando "Unexpected token '<'" ao tentar fazer response.json().
  app.get('/api/parceiros-comerciais', auth, listarParceirosComerciais);

  app.get('/api/parceiros/:id', auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM parceiros_comerciais WHERE id = $1 AND ativo = true',
        [req.params.id]
      );
      if (!rows.length) { res.status(404).json({ error: 'Parceiro não encontrado' }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error('[GET /api/parceiros/:id]', err);
      res.status(500).json({ error: 'Erro ao buscar parceiro' });
    }
  });

  app.get('/api/parceiros-comerciais/:id', auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM parceiros_comerciais WHERE id = $1 AND ativo = true',
        [req.params.id]
      );
      if (!rows.length) { res.status(404).json({ error: 'Parceiro não encontrado' }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error('[GET /api/parceiros-comerciais/:id]', err);
      res.status(500).json({ error: 'Erro ao buscar parceiro' });
    }
  });


  app.post('/api/parceiros', auth, async (req: Request, res: Response) => {
    try {
      const {
        nome, cpf, rg, data_nascimento, email, telefone, endereco, numero,
        complemento, bairro, cidade, uf, cep, profissao, estado_civil,
        observacoes, percentual_comissao, ativo,
      } = req.body || {};
      if (!nome || !cpf) {
        res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
        return;
      }
      const cpfLimpo = String(cpf).replace(/\D/g, '');
      const { rows } = await pool.query(
        `INSERT INTO parceiros_comerciais (
           nome, cpf, rg, data_nascimento, email, telefone, endereco, numero,
           complemento, bairro, cidade, uf, cep, profissao, estado_civil,
           observacoes, percentual_comissao, ativo
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (cpf) DO UPDATE SET
           nome=EXCLUDED.nome, rg=EXCLUDED.rg, data_nascimento=EXCLUDED.data_nascimento,
           email=EXCLUDED.email, telefone=EXCLUDED.telefone, endereco=EXCLUDED.endereco,
           numero=EXCLUDED.numero, complemento=EXCLUDED.complemento, bairro=EXCLUDED.bairro,
           cidade=EXCLUDED.cidade, uf=EXCLUDED.uf, cep=EXCLUDED.cep, profissao=EXCLUDED.profissao,
           estado_civil=EXCLUDED.estado_civil, observacoes=EXCLUDED.observacoes,
           percentual_comissao=EXCLUDED.percentual_comissao, ativo=EXCLUDED.ativo,
           updated_at=NOW()
         RETURNING *`,
        [
          nome.trim(), cpfLimpo, rg || null, data_nascimento || null, email || null,
          telefone || null, endereco || null, numero || null, complemento || null,
          bairro || null, cidade || null, uf ? String(uf).toUpperCase().slice(0, 2) : null,
          cep || null, profissao || null, estado_civil || null, observacoes || null,
          percentual_comissao === '' || percentual_comissao == null ? null : Number(percentual_comissao),
          ativo !== false,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      console.error('[POST /api/parceiros]', err);
      res.status(500).json({ error: err?.detail || 'Erro ao criar parceiro' });
    }
  });

  const patchParceiroHandler = async (req: Request, res: Response) => {
    try {
      const {
        nome, cpf, rg, data_nascimento, email, telefone, endereco, numero,
        complemento, bairro, cidade, uf, cep, profissao, estado_civil,
        observacoes, percentual_comissao, ativo,
        logo_url, cabecalho_html, rodape_html, cor_primaria, cor_secundaria,
      } = req.body || {};
      if (!nome || !cpf) {
        res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
        return;
      }
      const { rows } = await pool.query(
        `UPDATE parceiros_comerciais SET
           nome=$1, cpf=$2, rg=$3, data_nascimento=$4, email=$5, telefone=$6,
           endereco=$7, numero=$8, complemento=$9, bairro=$10, cidade=$11,
           uf=$12, cep=$13, profissao=$14, estado_civil=$15, observacoes=$16,
           percentual_comissao=$17, ativo=$18,
           logo_url=COALESCE($19::text, logo_url),
           cabecalho_html=COALESCE($20::text, cabecalho_html),
           rodape_html=COALESCE($21::text, rodape_html),
           cor_primaria=COALESCE($22::text, cor_primaria),
           cor_secundaria=COALESCE($23::text, cor_secundaria),
           updated_at=NOW()
         WHERE id=$24 RETURNING *`,
        [
          nome.trim(), String(cpf).replace(/\D/g, ''), rg || null, data_nascimento || null,
          email || null, telefone || null, endereco || null, numero || null, complemento || null,
          bairro || null, cidade || null, uf ? String(uf).toUpperCase().slice(0, 2) : null,
          cep || null, profissao || null, estado_civil || null, observacoes || null,
          percentual_comissao === '' || percentual_comissao == null ? null : Number(percentual_comissao),
          ativo !== false,
          logo_url !== undefined ? (logo_url?.trim() || null) : null,
          cabecalho_html !== undefined ? (cabecalho_html?.trim() || null) : null,
          rodape_html !== undefined ? (rodape_html?.trim() || null) : null,
          cor_primaria !== undefined ? (cor_primaria?.trim() || null) : null,
          cor_secundaria !== undefined ? (cor_secundaria?.trim() || null) : null,
          req.params.id,
        ]
      );
      if (!rows.length) { res.status(404).json({ error: 'Parceiro não encontrado' }); return; }
      res.json(rows[0]);
    } catch (err: any) {
      console.error('[PATCH /api/parceiros/:id]', err);
      res.status(500).json({ error: err?.detail || 'Erro ao atualizar parceiro' });
    }
  };
  app.patch('/api/parceiros/:id', auth, patchParceiroHandler);
  app.patch('/api/parceiros-comerciais/:id', auth, patchParceiroHandler);

  app.delete('/api/parceiros/:id', auth, async (req: Request, res: Response) => {
    try {
      await pool.query('UPDATE parceiros_comerciais SET ativo=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[DELETE /api/parceiros/:id]', err);
      res.status(500).json({ error: 'Erro ao desativar parceiro' });
    }
  });


  // ─── PRESTADORES / CONTRATADAS DE CONTRATOS ──────────────────────────────
  app.get('/api/prestadores-servico', auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT *
           FROM prestadores_servico
          WHERE ativo = true
          ORDER BY COALESCE(razao_social, nome, nome_fantasia)`
      );
      res.json(rows.map(normalizarPrestadorServico));
    } catch (err) {
      console.error('[GET /api/prestadores-servico]', err);
      res.status(500).json({ error: 'Erro ao listar prestadores/contratadas' });
    }
  });

  app.post('/api/prestadores-servico', auth, async (req: Request, res: Response) => {
    try {
      const {
        tipo_pessoa = 'pj',
        razao_social,
        nome_fantasia,
        nome,
        cnpj,
        cpf,
        email,
        telefone,
        endereco,
        cidade,
        uf,
        cep,
        representante_nome,
        representante_cpf,
        representante_cargo,
        observacoes,
        ativo,
      } = req.body || {};

      const tipo = tipo_pessoa === 'pf' ? 'pf' : 'pj';

      if (tipo === 'pj' && (!razao_social || !cnpj)) {
        res.status(400).json({ error: 'Para pessoa jurídica, razão social e CNPJ são obrigatórios.' });
        return;
      }
      if (tipo === 'pf' && (!nome || !cpf)) {
        res.status(400).json({ error: 'Para pessoa física, nome e CPF são obrigatórios.' });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO prestadores_servico (
           tipo_pessoa, razao_social, nome_fantasia, nome, cnpj, cpf, email, telefone,
           endereco, cidade, uf, cep, representante_nome, representante_cpf,
           representante_cargo, observacoes, ativo
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          tipo,
          razao_social?.trim() || null,
          nome_fantasia?.trim() || null,
          nome?.trim() || null,
          cnpj?.trim() || null,
          cpf?.trim() || null,
          email?.trim() || null,
          telefone?.trim() || null,
          endereco?.trim() || null,
          cidade?.trim() || null,
          uf?.trim()?.toUpperCase()?.slice(0, 2) || null,
          cep?.trim() || null,
          representante_nome?.trim() || null,
          representante_cpf?.trim() || null,
          representante_cargo?.trim() || null,
          observacoes?.trim() || null,
          ativo !== false,
        ]
      );

      res.status(201).json(normalizarPrestadorServico(rows[0]));
    } catch (err: any) {
      console.error('[POST /api/prestadores-servico]', err);
      res.status(500).json({ error: err?.detail || 'Erro ao cadastrar prestador/contratada' });
    }
  });

  app.patch('/api/prestadores-servico/:id', auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        tipo_pessoa = 'pj',
        razao_social,
        nome_fantasia,
        nome,
        cnpj,
        cpf,
        email,
        telefone,
        endereco,
        cidade,
        uf,
        cep,
        representante_nome,
        representante_cpf,
        representante_cargo,
        observacoes,
        ativo,
        logo_url,
        cabecalho_html,
        rodape_html,
        cor_primaria,
        cor_secundaria,
        cidade_assinatura,
        uf_assinatura,
        usar_papel_personalizado,
        mostrar_logo_contrato,
      } = req.body || {};
      const tipo = tipo_pessoa === 'pf' ? 'pf' : 'pj';
      if (tipo === 'pj' && (!razao_social || !cnpj)) {
        res.status(400).json({ error: 'Para pessoa jurídica, razão social e CNPJ são obrigatórios.' });
        return;
      }
      if (tipo === 'pf' && (!nome || !cpf)) {
        res.status(400).json({ error: 'Para pessoa física, nome e CPF são obrigatórios.' });
        return;
      }
      const { rows } = await pool.query(
        `UPDATE prestadores_servico SET
           tipo_pessoa=$1, razao_social=$2, nome_fantasia=$3, nome=$4,
           cnpj=$5, cpf=$6, email=$7, telefone=$8, endereco=$9,
           cidade=$10, uf=$11, cep=$12, representante_nome=$13,
           representante_cpf=$14, representante_cargo=$15, observacoes=$16,
           ativo=$17,
           logo_url=COALESCE($18::text, logo_url),
           cabecalho_html=COALESCE($19::text, cabecalho_html),
           rodape_html=COALESCE($20::text, rodape_html),
           cor_primaria=COALESCE($21::text, cor_primaria),
           cor_secundaria=COALESCE($22::text, cor_secundaria),
           cidade_assinatura=COALESCE($23::text, cidade_assinatura),
           uf_assinatura=COALESCE($24::text, uf_assinatura),
           usar_papel_personalizado=COALESCE($25::boolean, usar_papel_personalizado),
           mostrar_logo_contrato=COALESCE($26::boolean, mostrar_logo_contrato),
           updated_at=NOW()
         WHERE id=$27
         RETURNING *`,
        [
          tipo,
          razao_social?.trim() || null,
          nome_fantasia?.trim() || null,
          nome?.trim() || null,
          cnpj?.trim() || null,
          cpf?.trim() || null,
          email?.trim() || null,
          telefone?.trim() || null,
          endereco?.trim() || null,
          cidade?.trim() || null,
          uf?.trim()?.toUpperCase()?.slice(0, 2) || null,
          cep?.trim() || null,
          representante_nome?.trim() || null,
          representante_cpf?.trim() || null,
          representante_cargo?.trim() || null,
          observacoes?.trim() || null,
          ativo !== false,
          logo_url !== undefined ? (logo_url?.trim() || null) : null,
          cabecalho_html !== undefined ? (cabecalho_html?.trim() || null) : null,
          rodape_html !== undefined ? (rodape_html?.trim() || null) : null,
          cor_primaria !== undefined ? (cor_primaria?.trim() || null) : null,
          cor_secundaria !== undefined ? (cor_secundaria?.trim() || null) : null,
          cidade_assinatura !== undefined ? (cidade_assinatura?.trim() || null) : null,
          uf_assinatura !== undefined ? (uf_assinatura?.trim()?.toUpperCase()?.slice(0, 2) || null) : null,
          usar_papel_personalizado !== undefined ? usar_papel_personalizado : null,
          mostrar_logo_contrato !== undefined ? mostrar_logo_contrato : null,
          id,
        ]
      );
      if (!rows.length) {
        res.status(404).json({ error: 'Prestador/contratada não encontrado.' });
        return;
      }
      res.json(normalizarPrestadorServico(rows[0]));
    } catch (err: any) {
      console.error('[PATCH /api/prestadores-servico/:id]', err);
      res.status(500).json({ error: err?.detail || 'Erro ao atualizar prestador/contratada' });
    }
  });

  app.delete('/api/prestadores-servico/:id', auth, async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE prestadores_servico SET ativo=false, updated_at=NOW() WHERE id=$1`,
        [req.params.id]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[DELETE /api/prestadores-servico/:id]', err);
      res.status(500).json({ error: 'Erro ao desativar prestador/contratada' });
    }
  });

  app.get('/api/contratos/responsaveis', auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, nome, cargo, email, telefone
           FROM colaboradores
          WHERE ativo = true
          ORDER BY nome`
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/contratos/responsaveis]', err);
      res.status(500).json({ error: 'Erro ao listar responsáveis pelo contrato' });
    }
  });

  // ─── CONTRATOS GERADOS ───────────────────────────────────────────────────

  app.post('/api/contratos/gerar', auth, uploadContratos.any(), async (req: Request, res: Response) => {
    try {
      const colaborador = (req as any).colaborador;

      // Suporte a multipart/form-data (com arquivos) e application/json (sem arquivos)
      let bodyData: any = req.body;
      if (req.body?.dados) {
        try { bodyData = JSON.parse(req.body.dados); } catch { bodyData = req.body; }
      }

      // Coleta os arquivos enviados
      const arquivosMultipart: Array<{ buffer: Buffer; mimetype: string; categoria: string; descricao: string }> = [];
      const totalArquivos = parseInt(req.body?.total_arquivos || '0', 10);
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (files && totalArquivos > 0) {
        for (let i = 0; i < totalArquivos; i++) {
          const arquivo = files.find((f: any) => f.fieldname === `arquivo_${i}`);
          const metaStr = req.body?.[`meta_${i}`];
          if (arquivo && metaStr) {
            const meta = JSON.parse(metaStr);
            arquivosMultipart.push({
              buffer: arquivo.buffer,
              mimetype: arquivo.mimetype,
              categoria: meta.categoria || 'outros',
              descricao: meta.descricao || 'Documento Anexo',
            });
          }
        }
      }

      const {
        tipo_contrato = 'assessoria',
        empresa_id, parceiro_id, lead_id,
        contratada_id, responsavel_contrato_id,
        // campos contrato assessoria
        valor_referencia, taxa_comissao = 10, taxa_desistencia = 5, custeio_mensal = 250, percentual_multa,
        empresa_razao_social, empresa_cnpj, empresa_endereco,
        empresa_representante, empresa_cpf_representante,
        // campos contrato limpa nome
        cliente_id, cliente_pf_id, cliente_tipo, // 'empresa', 'pf' ou 'lead'
        valor_contrato, condicao_pagamento, prazo_entrega_dias = 30,
        prazo_garantia_meses = 6, taxa_consulta_serasa, taxa_reprotocolo,
        // campos contrato bacen
        prazo_execucao_dias_uteis = 120, prazo_atualizacao_orgao_dias = 60,
        // campos contrato rating
        prazo_acompanhamento_dias = 90, prazo_prorrogacao_dias = 90,
        // campos contrato parceria comercial
        percentual_destrava = 70, percentual_parceiro = 30,
        prazo_pagamento_dias_uteis = 5, aviso_previo_rescisao_dias = 30,
        testemunha_1_nome, testemunha_1_cpf, testemunha_2_nome, testemunha_2_cpf,
        // representante (bacen/rating)
        representante_nome, representante_cpf,
        // parceiro comercial (parceria)
        parceiro_nome, parceiro_cpf, parceiro_cnpj, parceiro_estado_civil,
        parceiro_profissao, parceiro_endereco,
        // campos comuns
        data_assinatura, foro_eleito, cidade_assinatura,
      } = bodyData;

      if (!data_assinatura || !foro_eleito) {
        res.status(400).json({ error: 'Campos obrigatórios: data_assinatura, foro_eleito' });
        return;
      }

      const CONTRATADA = {
        razao_social: 'DESTRAVA CREDITO LTDA',
        cnpj: '35.427.182/0001-66',
        representante: 'FERNANDO ELI OLIVEIRA MARQUES',
        cpf_representante: '718.517.041-91',
        cargo_representante: 'Sócio Administrador',
        endereco_sede: 'St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250',
        endereco_filial: 'Avenida Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-Go',
        email: 'fernandoelipro@gmail.com',
      };

      let pdfPath: string;

      if (tipo_contrato === 'limpa_nome') {
        // ── CONTRATO LIMPA NOME (PF ou PJ) ──────────────────────────────────
        if (!valor_contrato || !condicao_pagamento) {
          res.status(400).json({ error: 'Campos obrigatórios para Limpa Nome: valor_contrato, condicao_pagamento' });
          return;
        }
        if (!contratada_id) {
          res.status(400).json({ error: 'Selecione a empresa/PF contratada para o contrato Limpa Nome.' });
          return;
        }

        const contratadaSelecionada = await buscarPrestadorServicoAtivo(contratada_id);
        if (!contratadaSelecionada) {
          res.status(404).json({ error: 'Contratada/prestadora não encontrada ou inativa.' });
          return;
        }

        const responsavelContrato = responsavel_contrato_id
          ? await buscarResponsavelContrato(responsavel_contrato_id)
          : null;

        // Buscar contratante: pode ser empresa (PJ), cliente PF ou lead
        let contratanteData: any = null;
        if (cliente_tipo === 'empresa' && empresa_id) {
          const { rows } = await pool.query('SELECT * FROM empresas WHERE id=$1', [empresa_id]);
          if (!rows.length) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
          const e = rows[0];
          contratanteData = {
            razao_social: e.razao_social,
            cnpj: e.cnpj || '',
            endereco: [e.logradouro, e.numero, e.bairro, e.cidade, e.estado].filter(Boolean).join(', '),
            representante: e.responsavel_nome || '',
            cpf_representante: e.responsavel_cpf || '',
          };
        } else if (cliente_tipo === 'pf' && cliente_pf_id) {
          const { rows } = await pool.query('SELECT * FROM clientes_pf WHERE id=$1', [cliente_pf_id]);
          if (!rows.length) { res.status(404).json({ error: 'Cliente PF não encontrado' }); return; }
          const pf = rows[0];
          contratanteData = {
            nome: pf.nome,
            cpf: pf.cpf || '',
            rg: pf.rg || '',
            data_nascimento: pf.data_nascimento || '',
            estado_civil: pf.estado_civil || '',
            profissao: pf.profissao || '',
            email: pf.email || '',
            telefone: pf.telefone || '',
            domicilio: [pf.endereco, pf.cidade, pf.uf, pf.cep].filter(Boolean).join(', '),
          };
        } else if (cliente_tipo === 'lead' && cliente_id) {
          const { rows } = await pool.query('SELECT * FROM leads WHERE id=$1', [cliente_id]);
          if (!rows.length) { res.status(404).json({ error: 'Lead não encontrado' }); return; }
          const l = rows[0];
          contratanteData = {
            nome: l.nome || l.razao_social || '',
            cpf: l.cpf || '',
            cnpj: l.cnpj || '',
            domicilio: l.endereco || '',
          };
        } else {
          res.status(400).json({ error: 'Informe cliente_tipo (empresa/lead/pf) e o respectivo ID' });
          return;
        }

        const payloadLN: any = {
          contratante: contratanteData,
          contratada: contratadaSelecionada,
          responsavel_contrato: responsavelContrato,
          contrato: {
            valor_contrato_formatado: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor_contrato)),
            condicao_pagamento,
            prazo_entrega_dias: parseInt(prazo_entrega_dias),
            prazo_garantia_meses: parseInt(prazo_garantia_meses),
            taxa_consulta_serasa: taxa_consulta_serasa || 'R$ 50,00',
            taxa_reprotocolo: taxa_reprotocolo || 'R$ 300,00',
            data_assinatura_formatada: new Date(data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
            foro_eleito,
          },
        };

        aplicarIdentificacaoContrato(payloadLN, await gerarIdentificacaoContrato('limpa_nome', payloadLN));
        const htmlLN = await gerarHtmlContratoLimpaNome(payloadLN);
        const uploadsDir2 = path.resolve('uploads', 'contratos');
        if (!fs.existsSync(uploadsDir2)) fs.mkdirSync(uploadsDir2, { recursive: true });
        const fileNameLN = `${nomeArquivoSeguroContrato(payloadLN.contrato?.protocolo_contrato, 'contrato-limpa-nome')}.pdf`;
        const filePathLN = path.join(uploadsDir2, fileNameLN);
        let browser2;
        try {
          const puppeteer2 = await import('puppeteer-core');
          let executablePath2: string;
          if (process.env.CHROMIUM_PATH) {
            executablePath2 = process.env.CHROMIUM_PATH;
          } else {
            const chromium2 = await import('@sparticuz/chromium');
            executablePath2 = await chromium2.default.executablePath();
          }
          browser2 = await puppeteer2.default.launch({ executablePath: executablePath2, args: ['--no-sandbox','--disable-setuid-sandbox'], headless: true });
          const page2 = await browser2.newPage();
          await page2.setContent(htmlLN, { waitUntil: 'networkidle0' });
          await page2.pdf({ path: filePathLN, format: 'A4', printBackground: true, displayHeaderFooter: false, margin: { top: '20mm', bottom: '20mm', left: '22mm', right: '22mm' } });
        } finally {
          if (browser2) await (browser2 as any).close();
        }
        pdfPath = filePathLN;
        if (arquivosMultipart.length > 0) {
          pdfPath = await mergeAnexosNoPdf(pdfPath, arquivosMultipart, payloadLN.contrato?.numero_contrato);
        }

        const hash2 = await calcularHashArquivo(pdfPath);
        const empresaContratoId = cliente_tipo === 'empresa' ? empresa_id : null;
        const leadContratoId = cliente_tipo === 'lead' ? cliente_id : null;

        const { rows: contratoRows2 } = await pool.query(
          `INSERT INTO contratos_gerados
             (tipo_contrato, cliente_tipo, empresa_id, parceiro_id, lead_id, cliente_pf_id,
              contratada_id, responsavel_contrato_id,
              valor_referencia, valor_contrato, condicao_pagamento, taxa_comissao,
              honorario_minimo_mes, honorario_minimo_total, data_assinatura,
              foro_eleito, pdf_path, hash_documento, payload_snapshot,
              contratada_snapshot, responsavel_contrato_snapshot, criado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
           RETURNING id, created_at`,
          [
            'limpa_nome',
            cliente_tipo || null,
            empresaContratoId,
            parceiro_id || null,
            leadContratoId,
            cliente_pf_id || null,
            contratadaSelecionada.id,
            responsavelContrato?.id || null,
            null,
            valor_contrato,
            condicao_pagamento,
            null,
            null,
            null,
            data_assinatura,
            foro_eleito,
            pdfPath,
            hash2,
            JSON.stringify(payloadLN),
            JSON.stringify(contratadaSelecionada),
            responsavelContrato ? JSON.stringify(responsavelContrato) : null,
            colaborador.id,
          ]
        );
        const contrato2 = contratoRows2[0];
        await salvarIdentificacaoContrato(contrato2.id, payloadLN.contrato);
        res.status(201).json({
          success: true,
          contrato_id: contrato2.id,
          numero_contrato: payloadLN.contrato.numero_contrato,
          protocolo_contrato: payloadLN.contrato.protocolo_contrato,
          pdf_url: `/uploads/contratos/${path.basename(pdfPath)}`,
          hash_documento: hash2,
          created_at: contrato2.created_at,
        });
        return;
      }

      // ── CONTRATO LIMPA BACEN ────────────────────────────────────────────────
      if (tipo_contrato === 'limpa_bacen') {
        const clienteTipoBacen = cliente_tipo || (cliente_pf_id ? 'pf' : 'empresa');

        if (!valor_contrato || !condicao_pagamento) {
          res.status(400).json({ error: 'Campos obrigatórios para Limpa BACEN: cliente, valor_contrato, condicao_pagamento' });
          return;
        }
        if (clienteTipoBacen === 'empresa' && !empresa_id) {
          res.status(400).json({ error: 'Selecione uma empresa para o contrato Limpa BACEN.' });
          return;
        }
        if (clienteTipoBacen === 'pf' && !cliente_pf_id) {
          res.status(400).json({ error: 'Selecione uma pessoa física para o contrato Limpa BACEN.' });
          return;
        }
        if (clienteTipoBacen === 'lead' && !cliente_id) {
          res.status(400).json({ error: 'Selecione um lead para o contrato Limpa BACEN.' });
          return;
        }
        if (!contratada_id) {
          res.status(400).json({ error: 'Selecione a empresa/PF contratada para o contrato Limpa BACEN.' });
          return;
        }

        const contratadaSelecionada = await buscarPrestadorServicoAtivo(contratada_id);
        if (!contratadaSelecionada) {
          res.status(404).json({ error: 'Contratada/prestadora não encontrada ou inativa.' });
          return;
        }

        const responsavelContrato = responsavel_contrato_id
          ? await buscarResponsavelContrato(responsavel_contrato_id)
          : null;

        let contratanteBacenData: any = null;
        let representanteBacenData: any = { nome: '', cpf: '' };

        if (clienteTipoBacen === 'empresa') {
          const { rows: empBacen } = await pool.query('SELECT * FROM empresas WHERE id=$1', [empresa_id]);
          if (!empBacen.length) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
          const eb = empBacen[0];
          contratanteBacenData = {
            razao_social: eb.razao_social,
            cnpj: eb.cnpj || '',
            endereco: [eb.logradouro, eb.numero, eb.bairro, eb.cidade, eb.estado].filter(Boolean).join(', '),
          };
          representanteBacenData = {
            nome: representante_nome || eb.responsavel_nome || '',
            cpf: representante_cpf || eb.responsavel_cpf || '',
          };
        } else if (clienteTipoBacen === 'pf') {
          const { rows: pfRows } = await pool.query('SELECT * FROM clientes_pf WHERE id=$1', [cliente_pf_id]);
          if (!pfRows.length) { res.status(404).json({ error: 'Cliente PF não encontrado' }); return; }
          const pf = pfRows[0];
          contratanteBacenData = {
            nome: pf.nome,
            cpf: pf.cpf || '',
            rg: pf.rg || '',
            data_nascimento: pf.data_nascimento || '',
            estado_civil: pf.estado_civil || '',
            profissao: pf.profissao || '',
            email: pf.email || '',
            telefone: pf.telefone || '',
            domicilio: [pf.endereco, pf.cidade, pf.uf, pf.cep].filter(Boolean).join(', '),
          };
        } else {
          const { rows: leadRows } = await pool.query('SELECT * FROM leads WHERE id=$1', [cliente_id]);
          if (!leadRows.length) { res.status(404).json({ error: 'Lead não encontrado' }); return; }
          const l = leadRows[0];
          contratanteBacenData = {
            nome: l.nome || l.razao_social || '',
            cpf: l.cpf || '',
            cnpj: l.cnpj || '',
            domicilio: l.endereco || '',
          };
        }

        const payloadBacen: any = {
          contratante: contratanteBacenData,
          representante: representanteBacenData,
          contratada: contratadaSelecionada,
          responsavel_contrato: responsavelContrato,
          contrato: {
            valor_contrato_formatado: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor_contrato)),
            condicao_pagamento,
            prazo_execucao_dias_uteis: parseInt(prazo_execucao_dias_uteis),
            prazo_atualizacao_orgao_dias: parseInt(prazo_atualizacao_orgao_dias),
            data_assinatura_formatada: new Date(data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
            foro_eleito,
            cidade_assinatura: cidade_assinatura || 'BRASÍLIA – DF',
          },
        };
        aplicarIdentificacaoContrato(payloadBacen, await gerarIdentificacaoContrato('limpa_bacen', payloadBacen));
        const htmlBacen = await gerarHtmlContratoBacen(payloadBacen);
        const uploadsDir3 = path.resolve('uploads', 'contratos');
        if (!fs.existsSync(uploadsDir3)) fs.mkdirSync(uploadsDir3, { recursive: true });
        const fileNameBacen = `${nomeArquivoSeguroContrato(payloadBacen.contrato?.protocolo_contrato, 'contrato-limpa-bacen')}.pdf`;
        const filePathBacen = path.join(uploadsDir3, fileNameBacen);
        let browserBacen;
        try {
          const puppeteerB = await import('puppeteer-core');
          let execPathB: string;
          if (process.env.CHROMIUM_PATH) { execPathB = process.env.CHROMIUM_PATH; }
          else { try { const chromB = await import('@sparticuz/chromium'); execPathB = await chromB.default.executablePath(); } catch { execPathB = '/usr/bin/chromium-browser'; } }
          browserBacen = await puppeteerB.default.launch({ executablePath: execPathB, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'], headless: true });
          const pageB = await browserBacen.newPage();
          await pageB.setContent(htmlBacen, { waitUntil: 'networkidle0' });
          await pageB.pdf({ path: filePathBacen, format: 'A4', printBackground: true, displayHeaderFooter: false, margin: { top: '20mm', bottom: '20mm', left: '22mm', right: '22mm' } });
        } finally { if (browserBacen) await (browserBacen as any).close(); }
        pdfPath = filePathBacen;
        if (arquivosMultipart.length > 0) {
          pdfPath = await mergeAnexosNoPdf(pdfPath, arquivosMultipart, payloadBacen.contrato?.numero_contrato);
        }
        const hashBacen = await calcularHashArquivo(pdfPath);
        const { rows: contratoRowsBacen } = await pool.query(
          `INSERT INTO contratos_gerados
             (tipo_contrato, cliente_tipo, empresa_id, parceiro_id, lead_id, cliente_pf_id,
              contratada_id, responsavel_contrato_id,
              valor_referencia, valor_contrato, condicao_pagamento, taxa_comissao,
              honorario_minimo_mes, honorario_minimo_total, data_assinatura,
              foro_eleito, pdf_path, hash_documento, payload_snapshot,
              contratada_snapshot, responsavel_contrato_snapshot, criado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
           RETURNING id, created_at`,
          ['limpa_bacen',
           clienteTipoBacen,
           clienteTipoBacen === 'empresa' ? empresa_id : null,
           parceiro_id || null,
           clienteTipoBacen === 'lead' ? cliente_id : null,
           clienteTipoBacen === 'pf' ? cliente_pf_id : null,
           contratadaSelecionada.id, responsavelContrato?.id || null,
           null, valor_contrato, condicao_pagamento, null, null, null,
           data_assinatura, foro_eleito, pdfPath, hashBacen, JSON.stringify(payloadBacen),
           JSON.stringify(contratadaSelecionada),
           responsavelContrato ? JSON.stringify(responsavelContrato) : null,
           colaborador.id]
        );
        const contratoBacen = contratoRowsBacen[0];
        await salvarIdentificacaoContrato(contratoBacen.id, payloadBacen.contrato);
        res.status(201).json({
          success: true,
          contrato_id: contratoBacen.id,
          numero_contrato: payloadBacen.contrato.numero_contrato,
          protocolo_contrato: payloadBacen.contrato.protocolo_contrato,
          pdf_url: `/uploads/contratos/${path.basename(pdfPath)}`,
          hash_documento: hashBacen,
          created_at: contratoBacen.created_at,
        });
        return;
      }

      // ── CONTRATO RATING ─────────────────────────────────────────────────────
      if (tipo_contrato === 'rating') {
        if (!valor_contrato || !condicao_pagamento) {
          res.status(400).json({ error: 'Campos obrigatórios para Rating: empresa_id, valor_contrato, condicao_pagamento' });
          return;
        }
        if (!empresa_id) {
          res.status(400).json({ error: 'empresa_id é obrigatório para contrato Rating' });
          return;
        }
        const { rows: empRating } = await pool.query('SELECT * FROM empresas WHERE id=$1', [empresa_id]);
        if (!empRating.length) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
        const er = empRating[0];

        const contratadaRating = contratada_id
          ? await buscarPrestadorServicoAtivo(contratada_id)
          : contratadaDestravaNormalizada();
        if (contratada_id && !contratadaRating) {
          res.status(404).json({ error: 'Contratada/prestadora não encontrada ou inativa.' });
          return;
        }

        const responsavelContratoRating = responsavel_contrato_id
          ? await buscarResponsavelContrato(responsavel_contrato_id)
          : null;

        const payloadRating: any = {
          contratada: contratadaRating,
          responsavel_contrato: responsavelContratoRating,
          contratante: {
            razao_social: er.razao_social,
            cnpj: er.cnpj || '',
            endereco: [er.logradouro, er.numero, er.bairro, er.cidade, er.estado].filter(Boolean).join(', '),
          },
          representante: {
            nome: representante_nome || er.responsavel_nome || '',
            cpf: representante_cpf || er.responsavel_cpf || '',
          },
          contrato: {
            valor_contrato_formatado: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(valor_contrato)),
            condicao_pagamento,
            prazo_acompanhamento_dias: parseInt(prazo_acompanhamento_dias),
            prazo_prorrogacao_dias: parseInt(prazo_prorrogacao_dias),
            data_assinatura_formatada: new Date(data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
            foro_eleito,
            cidade_assinatura: cidade_assinatura || 'BRASÍLIA – DF',
          },
        };
        aplicarIdentificacaoContrato(payloadRating, await gerarIdentificacaoContrato('rating', payloadRating));
        const htmlRating = await gerarHtmlContratoRating(payloadRating);
        const uploadsDir4 = path.resolve('uploads', 'contratos');
        if (!fs.existsSync(uploadsDir4)) fs.mkdirSync(uploadsDir4, { recursive: true });
        const fileNameRating = `${nomeArquivoSeguroContrato(payloadRating.contrato?.protocolo_contrato, 'contrato-rating')}.pdf`;
        const filePathRating = path.join(uploadsDir4, fileNameRating);
        let browserRating;
        try {
          const puppeteerR = await import('puppeteer-core');
          let execPathR: string;
          if (process.env.CHROMIUM_PATH) { execPathR = process.env.CHROMIUM_PATH; }
          else { try { const chromR = await import('@sparticuz/chromium'); execPathR = await chromR.default.executablePath(); } catch { execPathR = '/usr/bin/chromium-browser'; } }
          browserRating = await puppeteerR.default.launch({ executablePath: execPathR, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'], headless: true });
          const pageR = await browserRating.newPage();
          await pageR.setContent(htmlRating, { waitUntil: 'networkidle0' });
          await pageR.pdf({ path: filePathRating, format: 'A4', printBackground: true, displayHeaderFooter: false, margin: { top: '18mm', bottom: '18mm', left: '22mm', right: '22mm' } });
        } finally { if (browserRating) await (browserRating as any).close(); }
        pdfPath = filePathRating;
        if (arquivosMultipart.length > 0) {
          pdfPath = await mergeAnexosNoPdf(pdfPath, arquivosMultipart, payloadRating.contrato?.numero_contrato);
        }
        const hashRating = await calcularHashArquivo(pdfPath);
        const { rows: contratoRowsRating } = await pool.query(
          `INSERT INTO contratos_gerados
             (tipo_contrato, cliente_tipo, empresa_id, parceiro_id, lead_id,
              contratada_id, responsavel_contrato_id,
              valor_referencia, valor_contrato, condicao_pagamento, taxa_comissao,
              honorario_minimo_mes, honorario_minimo_total, data_assinatura,
              foro_eleito, pdf_path, hash_documento, payload_snapshot,
              contratada_snapshot, responsavel_contrato_snapshot, criado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING id, created_at`,
          ['rating', 'empresa', empresa_id, parceiro_id || null, null,
           contratadaRating?.id || null, responsavelContratoRating?.id || null,
           null, valor_contrato, condicao_pagamento, null, null, null,
           data_assinatura, foro_eleito, pdfPath, hashRating, JSON.stringify(payloadRating),
           contratadaRating ? JSON.stringify(contratadaRating) : null,
           responsavelContratoRating ? JSON.stringify(responsavelContratoRating) : null,
           colaborador.id]
        );
        const contratoRating = contratoRowsRating[0];
        await salvarIdentificacaoContrato(contratoRating.id, payloadRating.contrato);
        res.status(201).json({
          success: true,
          contrato_id: contratoRating.id,
          numero_contrato: payloadRating.contrato.numero_contrato,
          protocolo_contrato: payloadRating.contrato.protocolo_contrato,
          pdf_url: `/uploads/contratos/${path.basename(pdfPath)}`,
          hash_documento: hashRating,
          created_at: contratoRating.created_at,
        });
        return;
      }

      // ── CONTRATO PARCERIA COMERCIAL ─────────────────────────────────────────
      if (tipo_contrato === 'parceria_comercial') {
        // Apenas Administrador e Diretor podem gerar contrato de parceria comercial
        const cargoColaborador = (colaborador.cargo || colaborador.role || '').toLowerCase();
        const CARGOS_PARCERIA = ['administrador', 'admin', 'diretor'];
        if (!CARGOS_PARCERIA.includes(cargoColaborador)) {
          res.status(403).json({ error: 'Apenas Administradores e Diretores podem gerar contratos de Parceria Comercial.' });
          return;
        }
        if (!parceiro_nome || !parceiro_cpf) {
          res.status(400).json({ error: 'Campos obrigatórios para Parceria Comercial: parceiro_nome, parceiro_cpf' });
          return;
        }
        const payloadParceria: any = {
          parceiro: {
            nome: parceiro_nome,
            cpf: parceiro_cpf,
            cnpj: parceiro_cnpj || '',
            estado_civil: parceiro_estado_civil || '',
            profissao: parceiro_profissao || '',
            endereco: parceiro_endereco || '',
          },
          contrato: {
            percentual_destrava: parseFloat(percentual_destrava),
            percentual_parceiro: parseFloat(percentual_parceiro),
            prazo_pagamento_dias_uteis: parseInt(prazo_pagamento_dias_uteis),
            aviso_previo_rescisao_dias: parseInt(aviso_previo_rescisao_dias),
            data_assinatura_formatada: new Date(data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
            foro_eleito,
            cidade_assinatura: cidade_assinatura || 'BRASÍLIA – DF',
            testemunha_1_nome: testemunha_1_nome || '',
            testemunha_1_cpf: testemunha_1_cpf || '',
            testemunha_2_nome: testemunha_2_nome || '',
            testemunha_2_cpf: testemunha_2_cpf || '',
          },
        };
        aplicarIdentificacaoContrato(payloadParceria, await gerarIdentificacaoContrato('parceria_comercial', payloadParceria));
        const htmlParceria = await gerarHtmlContratoParceriaComercial(payloadParceria);
        const uploadsDir5 = path.resolve('uploads', 'contratos');
        if (!fs.existsSync(uploadsDir5)) fs.mkdirSync(uploadsDir5, { recursive: true });
        const fileNameParceria = `${nomeArquivoSeguroContrato(payloadParceria.contrato?.protocolo_contrato, 'contrato-parceria')}.pdf`;
        const filePathParceria = path.join(uploadsDir5, fileNameParceria);
        let browserParceria;
        try {
          const puppeteerP = await import('puppeteer-core');
          let execPathP: string;
          if (process.env.CHROMIUM_PATH) { execPathP = process.env.CHROMIUM_PATH; }
          else { try { const chromP = await import('@sparticuz/chromium'); execPathP = await chromP.default.executablePath(); } catch { execPathP = '/usr/bin/chromium-browser'; } }
          browserParceria = await puppeteerP.default.launch({ executablePath: execPathP, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'], headless: true });
          const pageP = await browserParceria.newPage();
          await pageP.setContent(htmlParceria, { waitUntil: 'networkidle0' });
          await pageP.pdf({ path: filePathParceria, format: 'A4', printBackground: true, displayHeaderFooter: false, margin: { top: '18mm', bottom: '18mm', left: '22mm', right: '22mm' } });
        } finally { if (browserParceria) await (browserParceria as any).close(); }
        pdfPath = filePathParceria;
        if (arquivosMultipart.length > 0) {
          pdfPath = await mergeAnexosNoPdf(pdfPath, arquivosMultipart, payloadParceria.contrato?.numero_contrato);
        }
        const hashParceria = await calcularHashArquivo(pdfPath);
        const { rows: contratoRowsParceria } = await pool.query(
          `INSERT INTO contratos_gerados
             (tipo_contrato, cliente_tipo, empresa_id, parceiro_id, lead_id,
              valor_referencia, valor_contrato, condicao_pagamento, taxa_comissao,
              honorario_minimo_mes, honorario_minimo_total, data_assinatura,
              foro_eleito, pdf_path, hash_documento, payload_snapshot, criado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           RETURNING id, created_at`,
          ['parceria_comercial', null, empresa_id || null, parceiro_id || null, null,
           null, null, null, null, null, null,
           data_assinatura, foro_eleito, pdfPath, hashParceria, JSON.stringify(payloadParceria), colaborador.id]
        );
        const contratoParceria = contratoRowsParceria[0];
        await salvarIdentificacaoContrato(contratoParceria.id, payloadParceria.contrato);
        res.status(201).json({
          success: true,
          contrato_id: contratoParceria.id,
          numero_contrato: payloadParceria.contrato.numero_contrato,
          protocolo_contrato: payloadParceria.contrato.protocolo_contrato,
          pdf_url: `/uploads/contratos/${path.basename(pdfPath)}`,
          hash_documento: hashParceria,
          created_at: contratoParceria.created_at,
        });
        return;
      }

      // ── CONTRATO DE ASSESSORIA (padrão) ─────────────────────────────────────
      const parseNumeroContrato = (valor: any, fallback = 0): number => {
        if (valor === undefined || valor === null || valor === '') return fallback;
        if (typeof valor === 'number') return Number.isFinite(valor) ? valor : fallback;
        let normalizado = String(valor)
          .trim()
          .replace(/\s/g, '')
          .replace(/R\$/gi, '');
        if (normalizado.includes(',') && normalizado.includes('.')) {
          normalizado = normalizado.replace(/\./g, '').replace(',', '.');
        } else if (normalizado.includes(',')) {
          normalizado = normalizado.replace(',', '.');
        }
        const parsed = Number.parseFloat(normalizado);
        return Number.isFinite(parsed) ? parsed : fallback;
      };

      const valorReferenciaNum = parseNumeroContrato(valor_referencia);
      const taxaComissaoNum = parseNumeroContrato(taxa_comissao, 10);
      const taxaDesistenciaNum = parseNumeroContrato(
        taxa_desistencia !== undefined ? taxa_desistencia : percentual_multa,
        5,
      );
      const custeioMensalNum = parseNumeroContrato(custeio_mensal, 250);

      if (!valorReferenciaNum) {
        res.status(400).json({ error: 'Campos obrigatórios: valor_referencia, data_assinatura, foro_eleito' });
        return;
      }
      if (valorReferenciaNum < 1000) {
        res.status(400).json({ error: 'Valor de referência mínimo é R$ 1.000,00' });
        return;
      }
      if (!empresa_id && !empresa_razao_social) {
        res.status(400).json({ error: 'Informe empresa_id ou os dados editados da contratante.' });
        return;
      }

      let empresa: any = null;
      if (empresa_id) {
        const { rows: empresaRows } = await pool.query('SELECT * FROM empresas WHERE id = $1', [empresa_id]);
        if (!empresaRows.length) {
          res.status(404).json({ error: 'Empresa não encontrada' });
          return;
        }
        empresa = empresaRows[0];
      }

      let parceiro: any = null;
      if (parceiro_id) {
        const { rows: parceiroRows } = await pool.query(
          'SELECT * FROM parceiros_comerciais WHERE id = $1',
          [parceiro_id]
        );
        parceiro = parceiroRows[0] || null;
      }
      if (parceiro_nome || parceiro_cpf) {
        parceiro = {
          ...(parceiro || {}),
          nome: parceiro_nome || parceiro?.nome || '',
          cpf: parceiro_cpf || parceiro?.cpf || '',
        };
      }

      const enderecoEmpresaBanco = empresa
        ? [empresa.logradouro, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado || empresa.uf]
            .filter(Boolean).join(', ')
        : '';

      const payload: any = {
        contratada: CONTRATADA,
        contratante: {
          razao_social: empresa_razao_social || empresa?.razao_social || '',
          cnpj: empresa_cnpj || empresa?.cnpj || '',
          endereco: empresa_endereco || enderecoEmpresaBanco,
          representante: empresa_representante || empresa?.responsavel_nome || empresa?.representante_nome || '',
          cpf_representante: empresa_cpf_representante || empresa?.responsavel_cpf || empresa?.representante_cpf || '',
        },
        parceiro: parceiro && parceiro.nome ? { nome: parceiro.nome, cpf: parceiro.cpf || '' } : null,
        contrato: {
          valor_referencia: valorReferenciaNum,
          valor_referencia_formatado: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorReferenciaNum),
          taxa_comissao: taxaComissaoNum,
          taxa_desistencia: taxaDesistenciaNum,
          custeio_mensal: custeioMensalNum,
          percentual_multa: taxaDesistenciaNum, // compatibilidade com PDFs antigos
          honorario_minimo_mes: null,
          honorario_minimo_total: null,
          data_assinatura,
          data_assinatura_formatada: new Date(data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'long', year: 'numeric'
          }),
          cidade_assinatura: cidade_assinatura || empresa?.cidade || 'BRASÍLIA – DF',
          foro_eleito,
          vigencia_meses: 12,
        },
      };

      aplicarIdentificacaoContrato(payload, await gerarIdentificacaoContrato('assessoria', payload));
      pdfPath = await gerarPdfContrato(payload);
      // Mescla documentos anexos ao PDF do contrato
      if (arquivosMultipart.length > 0) {
        pdfPath = await mergeAnexosNoPdf(pdfPath, arquivosMultipart, payload.contrato?.numero_contrato);
      }
      const hash = await calcularHashArquivo(pdfPath);

      const { rows: contratoRows } = await pool.query(
        `INSERT INTO contratos_gerados
           (tipo_contrato, cliente_tipo, empresa_id, parceiro_id, lead_id,
            valor_referencia, valor_contrato, condicao_pagamento, taxa_comissao,
            taxa_desistencia, custeio_mensal,
            honorario_minimo_mes, honorario_minimo_total, data_assinatura,
            foro_eleito, pdf_path, hash_documento, payload_snapshot, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING id, created_at`,
        [
          'assessoria',
          null,
          empresa_id || null,
          parceiro_id || null,
          lead_id || null,
          valorReferenciaNum,
          null,
          null,
          taxaComissaoNum,
          taxaDesistenciaNum,
          custeioMensalNum,
          null,
          null,
          data_assinatura,
          foro_eleito,
          pdfPath,
          hash,
          JSON.stringify(payload),
          colaborador.id,
        ]
      );

      const contrato = contratoRows[0];
      await salvarIdentificacaoContrato(contrato.id, payload.contrato);
      const pdfUrl = `/uploads/contratos/${path.basename(pdfPath)}`;

      res.status(201).json({
        success: true,
        contrato_id: contrato.id,
        numero_contrato: payload.contrato.numero_contrato,
        protocolo_contrato: payload.contrato.protocolo_contrato,
        pdf_url: pdfUrl,
        hash_documento: hash,
        created_at: contrato.created_at,
      });
    } catch (err: any) {
      const message = err?.message || 'Erro desconhecido';
      const code = err?.code || undefined;
      const detail = err?.detail || undefined;

      console.error('[POST /api/contratos/gerar]', {
        message,
        code,
        detail,
        stack: err?.stack,
        body: {
          tipo_contrato: req.body?.tipo_contrato,
          cliente_tipo: req.body?.cliente_tipo,
          empresa_id: req.body?.empresa_id || null,
          cliente_id: req.body?.cliente_id || null,
        },
      });

      res.status(500).json({
        error: `Erro ao gerar contrato: ${message}`,
        code,
      });
    }
  });

  app.get('/api/contratos/:id/download', auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT pdf_path, empresa_id, numero_contrato, protocolo_contrato FROM contratos_gerados WHERE id = $1',
        [req.params.id]
      );
      if (!rows.length || !rows[0].pdf_path) {
        res.status(404).json({ error: 'Contrato não encontrado' });
        return;
      }
      const filePath = path.resolve(rows[0].pdf_path);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Arquivo PDF não encontrado no servidor' });
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      const nomeDownload = nomeArquivoSeguroContrato(rows[0].protocolo_contrato || rows[0].numero_contrato || `contrato-${req.params.id}`, `contrato-${req.params.id}`);
      res.setHeader('Content-Disposition', `attachment; filename="${nomeDownload}.pdf"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error('[GET /api/contratos/:id/download]', err);
      res.status(500).json({ error: 'Erro ao fazer download do contrato' });
    }
  });

  // ─── VISUALIZAR CONTRATO (inline, abre no browser) ────────────────────────
  app.get('/api/contratos/:id/visualizar', auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM contratos_gerados WHERE id = $1',
        [req.params.id]
      );
      if (!rows.length) {
        res.status(404).json({ error: 'Contrato não encontrado' });
        return;
      }
      const contrato = rows[0];

      // Tenta localizar o arquivo PDF em múltiplos caminhos possíveis
      const candidatos: string[] = [];
      if (contrato.pdf_path) {
        candidatos.push(path.resolve(contrato.pdf_path));
        candidatos.push(path.join('/app/uploads/contratos', path.basename(contrato.pdf_path)));
        candidatos.push(path.join('/app/uploads', path.basename(contrato.pdf_path)));
        candidatos.push(path.join('/var/data/destrava', path.basename(contrato.pdf_path)));
        if (process.env.DATA_DIR) {
          candidatos.push(path.join(process.env.DATA_DIR, path.basename(contrato.pdf_path)));
        }
      }
      candidatos.push(path.join(path.resolve('uploads', 'contratos'), `contrato-${req.params.id}.pdf`));

      let filePath: string | null = null;
      for (const c of candidatos) {
        if (fs.existsSync(c)) { filePath = c; break; }
      }

      // Se não encontrou, tenta regenerar pelo payload_snapshot
      if (!filePath) {
        try {
          const contratoDetalhado = await buscarContratoDetalhado(req.params.id);
          if (contratoDetalhado && contratoDetalhado.payload_snapshot) {
            const { pdfPath } = await renderizarPdfContratoExistente(contratoDetalhado);
            await pool.query(
              'UPDATE contratos_gerados SET pdf_path=$1, pdf_regenerado_em=NOW() WHERE id=$2',
              [pdfPath, req.params.id]
            );
            filePath = pdfPath;
          }
        } catch (regenErr) {
          console.warn('[GET /api/contratos/:id/visualizar] Falha ao regenerar:', regenErr);
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({
          error: 'PDF não encontrado no servidor. Use "Regenerar PDF" para recriá-lo.',
          contrato_id: req.params.id,
          pdf_path_registrado: contrato.pdf_path || null,
        });
        return;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="contrato-${req.params.id}.pdf"`);
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error('[GET /api/contratos/:id/visualizar]', err);
      res.status(500).json({ error: 'Erro ao visualizar contrato' });
    }
  });

  app.get('/api/contratos/empresa/:empresaId', auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT cg.*, pc.nome as parceiro_nome,
                COALESCE(ps.razao_social, ps.nome, ps.nome_fantasia, cg.contratada_snapshot->>'nome_exibicao') AS contratada_nome,
                col_resp.nome AS responsavel_contrato_nome
         FROM contratos_gerados cg
         LEFT JOIN parceiros_comerciais pc ON pc.id = cg.parceiro_id
         LEFT JOIN prestadores_servico ps ON ps.id = cg.contratada_id
         LEFT JOIN colaboradores col_resp ON col_resp.id = cg.responsavel_contrato_id
         WHERE cg.empresa_id = $1
         ORDER BY cg.created_at DESC`,
        [req.params.empresaId]
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/contratos/empresa/:empresaId]', err);
      res.status(500).json({ error: 'Erro ao listar contratos' });
    }
  });

  app.patch('/api/contratos/:id/status', auth, async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const statusValidos = ['gerado', 'assinado', 'cancelado'];
      if (!statusValidos.includes(status)) {
        res.status(400).json({ error: `Status inválido. Valores aceitos: ${statusValidos.join(', ')}` });
        return;
      }
      const { rows } = await pool.query(
        `UPDATE contratos_gerados SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
        [status, req.params.id]
      );
      if (!rows.length) {
        res.status(404).json({ error: 'Contrato não encontrado' });
        return;
      }
      res.json({ success: true, ...rows[0] });
    } catch (err) {
      console.error('[PATCH /api/contratos/:id/status]', err);
      res.status(500).json({ error: 'Erro ao atualizar status' });
    }
  });

  // ─── LISTA GERAL DE CONTRATOS (todos os tipos) ───────────────────────────────
  app.get('/api/contratos', auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as any).colaborador;
      const cargoRaw = (colaborador?.cargo || colaborador?.role || '').toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Hierarquia de visibilidade:
      // admin/administrador/diretor → vê TODOS
      // gerente comercial/gerente/gestor → vê TODOS (escopo comercial)
      // demais → vê apenas os próprios (criado_por = seu id)
      const CARGOS_VE_TUDO = ['administrador', 'admin', 'diretor', 'gerente comercial', 'gerente', 'gestor'];
      const podeTudo = CARGOS_VE_TUDO.includes(cargoRaw);

      const { tipo, status, empresa_id: empId, data_inicio, data_fim, responsavel_id, limit = '100', offset = '0' } = req.query as Record<string, string>;
      const params: any[] = [];
      const conditions: string[] = [];

      // RBAC: usuário comum só vê os próprios contratos
      if (!podeTudo) {
        params.push(colaborador.id);
        conditions.push(`cg.criado_por = $${params.length}`);
      }

      if (tipo) { params.push(tipo); conditions.push(`cg.tipo_contrato = $${params.length}`); }
      if (status) { params.push(status); conditions.push(`cg.status = $${params.length}`); }
      if (empId) { params.push(empId); conditions.push(`cg.empresa_id = $${params.length}`); }
      if (data_inicio) { params.push(data_inicio); conditions.push(`cg.created_at >= $${params.length}::date`); }
      if (data_fim) { params.push(data_fim); conditions.push(`cg.created_at < ($${params.length}::date + interval '1 day')`); }
      // Gerente/admin podem filtrar por responsável específico
      if (responsavel_id && podeTudo) { params.push(responsavel_id); conditions.push(`cg.criado_por = $${params.length}`); }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      params.push(parseInt(limit) || 100);
      params.push(parseInt(offset) || 0);
      const { rows } = await pool.query(
        `SELECT cg.id, cg.tipo_contrato, cg.status, cg.data_assinatura, cg.created_at,
                cg.valor_referencia, cg.valor_contrato, cg.condicao_pagamento,
                cg.foro_eleito, cg.hash_documento, cg.pdf_path,
                cg.empresa_id, cg.lead_id, cg.parceiro_id, cg.criado_por,
                cg.contratada_id, cg.responsavel_contrato_id,
                e.razao_social AS empresa_nome,
                l.nome AS lead_nome,
                pc.nome AS parceiro_nome,
                COALESCE(ps.razao_social, ps.nome, ps.nome_fantasia, cg.contratada_snapshot->>'nome_exibicao') AS contratada_nome,
                col_resp.nome AS responsavel_contrato_nome,
                col.nome AS criado_por_nome
         FROM contratos_gerados cg
         LEFT JOIN empresas e ON e.id = cg.empresa_id
         LEFT JOIN leads l ON l.id = cg.lead_id
         LEFT JOIN parceiros_comerciais pc ON pc.id = cg.parceiro_id
         LEFT JOIN prestadores_servico ps ON ps.id = cg.contratada_id
         LEFT JOIN colaboradores col_resp ON col_resp.id = cg.responsavel_contrato_id
         LEFT JOIN colaboradores col ON col.id = cg.criado_por
         ${where}
         ORDER BY cg.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/contratos]', err);
      res.status(500).json({ error: 'Erro ao listar contratos' });
    }
  });

  async function buscarContratoDetalhado(id: string) {
    const { rows } = await pool.query(
      `SELECT cg.*,
              e.razao_social AS empresa_nome,
              l.nome AS lead_nome,
              pc.nome AS parceiro_nome,
              COALESCE(ps.razao_social, ps.nome, ps.nome_fantasia, cg.contratada_snapshot->>'nome_exibicao') AS contratada_nome,
              col_resp.nome AS responsavel_contrato_nome,
              col.nome AS criado_por_nome
         FROM contratos_gerados cg
         LEFT JOIN empresas e ON e.id = cg.empresa_id
         LEFT JOIN leads l ON l.id = cg.lead_id
         LEFT JOIN parceiros_comerciais pc ON pc.id = cg.parceiro_id
         LEFT JOIN prestadores_servico ps ON ps.id = cg.contratada_id
         LEFT JOIN colaboradores col_resp ON col_resp.id = cg.responsavel_contrato_id
         LEFT JOIN colaboradores col ON col.id = cg.criado_por
        WHERE cg.id=$1`,
      [id]
    );
    return rows[0] || null;
  }

  async function renderizarPdfContratoExistente(contrato: any): Promise<{ pdfPath: string; hash: string }> {
    const payload = {
      ...(contrato.payload_snapshot || {}),
      contrato: {
        ...((contrato.payload_snapshot || {}).contrato || {}),
        ...(contrato.dados_editaveis || {}),
        ...identificacaoContratoExistente(contrato),
      },
    };
    let html: string;
    switch (contrato.tipo_contrato) {
      case 'limpa_nome': html = await gerarHtmlContratoLimpaNome(payload); break;
      case 'limpa_bacen': html = await gerarHtmlContratoBacen(payload); break;
      case 'rating': html = await gerarHtmlContratoRating(payload); break;
      case 'parceria_comercial': html = await gerarHtmlContratoParceriaComercial(payload); break;
      default: html = await gerarHtmlContrato(payload); break;
    }
    const uploadsDir = path.resolve('uploads', 'contratos');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName = `${nomeArquivoSeguroContrato(payload?.contrato?.protocolo_contrato, `contrato-${contrato.tipo_contrato || 'gerado'}`)}.pdf`;
    const pdfPath = path.join(uploadsDir, fileName);
    let browser: any;
    try {
      const puppeteer = await import('puppeteer-core');
      let executablePath: string;
      if (process.env.CHROMIUM_PATH) executablePath = process.env.CHROMIUM_PATH;
      else {
        const chromium = await import('@sparticuz/chromium');
        executablePath = await chromium.default.executablePath();
      }
      browser = await puppeteer.default.launch({ executablePath, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'], headless: true });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, displayHeaderFooter: false, margin: { top: '20mm', bottom: '20mm', left: '22mm', right: '22mm' } });
    } finally {
      if (browser) await browser.close();
    }
    const hash = await calcularHashArquivo(pdfPath);
    return { pdfPath, hash };
  }

  app.get('/api/contratos/:id', auth, async (req: Request, res: Response) => {
    try {
      const contrato = await buscarContratoDetalhado(req.params.id);
      if (!contrato) { res.status(404).json({ error: 'Contrato não encontrado' }); return; }
      res.json(contrato);
    } catch (err) {
      console.error('[GET /api/contratos/:id]', err);
      res.status(500).json({ error: 'Erro ao carregar contrato' });
    }
  });

  app.patch('/api/contratos/:id', auth, async (req: Request, res: Response) => {
    try {
      const permitido = ['gerado', 'assinado', 'cancelado'];
      const { dados_editaveis, status, data_assinatura, foro_eleito, local_assinatura, observacoes } = req.body || {};
      if (status && !permitido.includes(status)) {
        res.status(400).json({ error: 'Status inválido.' });
        return;
      }
      const { rows } = await pool.query(
        `UPDATE contratos_gerados SET
           dados_editaveis=COALESCE($1::jsonb, dados_editaveis),
           status=COALESCE($2, status),
           data_assinatura=COALESCE($3::date, data_assinatura),
           foro_eleito=COALESCE($4, foro_eleito),
           local_assinatura=COALESCE($5, local_assinatura),
           observacoes=COALESCE($6, observacoes),
           updated_at=NOW()
         WHERE id=$7 RETURNING *`,
        [
          dados_editaveis ? JSON.stringify(dados_editaveis) : null,
          status || null,
          data_assinatura || null,
          foro_eleito || null,
          local_assinatura || null,
          observacoes || null,
          req.params.id,
        ]
      );
      if (!rows.length) { res.status(404).json({ error: 'Contrato não encontrado' }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error('[PATCH /api/contratos/:id]', err);
      res.status(500).json({ error: 'Erro ao atualizar contrato' });
    }
  });

  app.post('/api/contratos/:id/regenerar', auth, async (req: Request, res: Response) => {
    try {
      const contrato = await buscarContratoDetalhado(req.params.id);
      if (!contrato) { res.status(404).json({ error: 'Contrato não encontrado' }); return; }
      const { pdfPath, hash } = await renderizarPdfContratoExistente(contrato);
      const { rows } = await pool.query(
        `UPDATE contratos_gerados
            SET pdf_path=$1, hash_documento=$2, pdf_regenerado_em=NOW(), updated_at=NOW()
          WHERE id=$3 RETURNING id, pdf_path, hash_documento, pdf_regenerado_em`,
        [pdfPath, hash, req.params.id]
      );
      res.json({ success: true, ...rows[0], pdf_url: `/uploads/contratos/${path.basename(pdfPath)}` });
    } catch (err) {
      console.error('[POST /api/contratos/:id/regenerar]', err);
      res.status(500).json({ error: 'Erro ao regenerar contrato' });
    }
  });

  app.post('/api/contratos/:id/anexo-assinado', auth, async (req: Request, res: Response) => {
    try {
      const { arquivo_base64, pdf_base64, nome_arquivo } = req.body || {};
      const conteudo = arquivo_base64 || pdf_base64;
      if (!conteudo) { res.status(400).json({ error: 'Informe o PDF assinado em base64.' }); return; }
      const base64 = String(conteudo).includes(',') ? String(conteudo).split(',').pop()! : String(conteudo);
      const uploadsDir = path.resolve('uploads', 'contratos', 'assinados');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const fileName = `${crypto.randomUUID()}-${String(nome_arquivo || 'contrato-assinado.pdf').replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
      const pdfPath = path.join(uploadsDir, fileName);
      fs.writeFileSync(pdfPath, Buffer.from(base64, 'base64'));
      const { rows } = await pool.query(
        `UPDATE contratos_gerados SET status='assinado', assinado_em=NOW(), assinado_pdf_path=$1, updated_at=NOW()
          WHERE id=$2 RETURNING id, status, assinado_em, assinado_pdf_path`,
        [pdfPath, req.params.id]
      );
      if (!rows.length) { res.status(404).json({ error: 'Contrato não encontrado' }); return; }
      res.json({ success: true, ...rows[0] });
    } catch (err) {
      console.error('[POST /api/contratos/:id/anexo-assinado]', err);
      res.status(500).json({ error: 'Erro ao anexar contrato assinado' });
    }
  });

  // ─── EXCLUIR CONTRATO (apenas Administrador e Diretor) ─────────────────────────
  app.delete('/api/contratos/:id', auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as any).colaborador;
      const cargoColaborador = (colaborador.cargo || colaborador.role || '').toLowerCase();
      const CARGOS_PODEM_EXCLUIR = ['administrador', 'admin', 'diretor'];
      if (!CARGOS_PODEM_EXCLUIR.includes(cargoColaborador)) {
        res.status(403).json({ error: 'Apenas Administradores e Diretores podem excluir contratos.' });
        return;
      }
      const { rows } = await pool.query(
        'SELECT id, pdf_path FROM contratos_gerados WHERE id = $1',
        [req.params.id]
      );
      if (!rows.length) {
        res.status(404).json({ error: 'Contrato não encontrado' });
        return;
      }
      const contrato = rows[0];
      // Remover arquivo PDF do disco se existir
      if (contrato.pdf_path) {
        const filePath = path.resolve(contrato.pdf_path);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) { console.warn('[DELETE contrato] Não foi possível remover PDF:', e); }
        }
      }
      await pool.query('DELETE FROM contratos_gerados WHERE id = $1', [req.params.id]);
      res.json({ success: true, message: 'Contrato excluído com sucesso.' });
    } catch (err) {
      console.error('[DELETE /api/contratos/:id]', err);
      res.status(500).json({ error: 'Erro ao excluir contrato' });
    }
  });

  // Servir arquivos de contratos gerados
  app.use('/uploads/contratos', express.static(path.resolve('uploads', 'contratos')));

  app.patch('/api/me', auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as any).colaborador;
      const {
        nome, telefone, cpf, rg, data_nascimento, estado_civil, profissao,
        endereco, numero, complemento, bairro, cidade, uf, cep, assinatura_url,
      } = req.body || {};
      const { rows } = await pool.query(
        `UPDATE colaboradores SET
           nome=COALESCE($1, nome), telefone=COALESCE($2, telefone), cpf=COALESCE($3, cpf),
           rg=COALESCE($4, rg), data_nascimento=COALESCE($5::date, data_nascimento),
           estado_civil=COALESCE($6, estado_civil), profissao=COALESCE($7, profissao),
           endereco=COALESCE($8, endereco), numero=COALESCE($9, numero), complemento=COALESCE($10, complemento),
           bairro=COALESCE($11, bairro), cidade=COALESCE($12, cidade), uf=COALESCE($13, uf),
           cep=COALESCE($14, cep), assinatura_url=COALESCE($15, assinatura_url), updated_at=NOW()
         WHERE id=$16 RETURNING id, nome, email, cargo, perfil, telefone, ativo,
           pode_atender_leads, pode_ver_todos_leads, chatwoot_agente_id, cpf, rg,
           data_nascimento, estado_civil, profissao, endereco, numero, complemento,
           bairro, cidade, uf, cep, assinatura_url, precisa_redefinir_senha`,
        [nome || null, telefone || null, cpf || null, rg || null, data_nascimento || null,
         estado_civil || null, profissao || null, endereco || null, numero || null,
         complemento || null, bairro || null, cidade || null,
         uf ? String(uf).toUpperCase().slice(0, 2) : null, cep || null,
         assinatura_url || null, colaborador.id]
      );
      res.json(rows[0]);
    } catch (err) {
      console.error('[PATCH /api/me]', err);
      res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
  });

  app.post('/api/me/alterar-senha', auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as any).colaborador;
      const { senha_atual, nova_senha } = req.body || {};
      if (!nova_senha || String(nova_senha).length < 8) {
        res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
        return;
      }
      const { rows } = await pool.query('SELECT senha_hash FROM colaboradores WHERE id=$1', [colaborador.id]);
      if (!rows.length) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
      if (rows[0].senha_hash && senha_atual) {
        const ok = await bcrypt.compare(String(senha_atual), rows[0].senha_hash);
        if (!ok) { res.status(400).json({ error: 'Senha atual incorreta.' }); return; }
      }
      const hash = await bcrypt.hash(String(nova_senha), 10);
      await pool.query(
        `UPDATE colaboradores
            SET senha_hash=$1, precisa_redefinir_senha=false, reset_senha_token_hash=NULL,
                reset_senha_expira_em=NULL, ultimo_reset_senha_em=NOW(), updated_at=NOW()
          WHERE id=$2`,
        [hash, colaborador.id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/me/alterar-senha]', err);
      res.status(500).json({ error: 'Erro ao alterar senha' });
    }
  });

  app.post('/api/auth/solicitar-reset-senha', async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (!email) { res.status(400).json({ error: 'Informe o e-mail.' }); return; }
      const tokenReset = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenReset).digest('hex');
      const { rows } = await pool.query(
        `UPDATE colaboradores
            SET reset_senha_solicitado_em=NOW(), reset_senha_token_hash=$1,
                reset_senha_expira_em=NOW() + INTERVAL '2 hours', updated_at=NOW()
          WHERE LOWER(email)=LOWER($2) AND ativo=true
          RETURNING id, email, nome`,
        [tokenHash, String(email).trim()]
      );
      if (rows.length) {
        console.log(`[auth] Token de redefinição para ${rows[0].email}: ${tokenReset}`);
      }
      res.json({ success: true, message: 'Se o e-mail estiver cadastrado, as instruções de redefinição serão enviadas pelo canal configurado.', token_dev: process.env.NODE_ENV !== 'production' && rows.length ? tokenReset : undefined });
    } catch (err) {
      console.error('[POST /api/auth/solicitar-reset-senha]', err);
      res.status(500).json({ error: 'Erro ao solicitar redefinição de senha' });
    }
  });

  app.post('/api/auth/redefinir-senha', async (req: Request, res: Response) => {
    try {
      const { token, nova_senha } = req.body || {};
      if (!token || !nova_senha || String(nova_senha).length < 8) {
        res.status(400).json({ error: 'Token e nova senha com pelo menos 8 caracteres são obrigatórios.' });
        return;
      }
      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
      const senhaHash = await bcrypt.hash(String(nova_senha), 10);
      const { rows } = await pool.query(
        `UPDATE colaboradores
            SET senha_hash=$1, precisa_redefinir_senha=false, reset_senha_token_hash=NULL,
                reset_senha_expira_em=NULL, ultimo_reset_senha_em=NOW(), updated_at=NOW()
          WHERE reset_senha_token_hash=$2 AND reset_senha_expira_em > NOW() AND ativo=true
          RETURNING id`,
        [senhaHash, tokenHash]
      );
      if (!rows.length) { res.status(400).json({ error: 'Token inválido ou expirado.' }); return; }
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/auth/redefinir-senha]', err);
      res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
  });

  app.post('/api/colaboradores/:id/resetar-senha', auth, async (req: Request, res: Response) => {
    try {
      const ator = (req as any).colaborador;
      const cargo = String(ator.cargo || ator.role || '').toLowerCase();
      if (!['administrador', 'admin', 'diretor', 'gerente comercial'].includes(cargo)) {
        res.status(403).json({ error: 'Sem permissão para redefinir senhas.' });
        return;
      }
      const senhaTemporaria = req.body?.senha_temporaria || crypto.randomBytes(6).toString('base64url') + 'A1!';
      const hash = await bcrypt.hash(String(senhaTemporaria), 10);
      const { rows } = await pool.query(
        `UPDATE colaboradores SET senha_hash=$1, precisa_redefinir_senha=true,
          ultimo_reset_senha_em=NOW(), updated_at=NOW() WHERE id=$2 RETURNING id, email, nome`,
        [hash, req.params.id]
      );
      if (!rows.length) { res.status(404).json({ error: 'Colaborador não encontrado' }); return; }
      res.json({ success: true, senha_temporaria: senhaTemporaria });
    } catch (err) {
      console.error('[POST /api/colaboradores/:id/resetar-senha]', err);
      res.status(500).json({ error: 'Erro ao resetar senha' });
    }
  });


  // ─── Acompanhamento Bancário ───────────────────────────────────────────────
  type AcessoUser = {
    id?: string;
    cargo?: string | null;
    perfil?: string | null;
    acesso_acompanhamento_bancario?: boolean | null;
  };

  function normalizarPermissaoAcompanhamento(value?: string | null): string {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");
  }

  function usuarioPodeAcessarAcompanhamento(user: AcessoUser | null | undefined): boolean {
    if (!user) return false;
    if (user.acesso_acompanhamento_bancario === true) return true;

    const permitidos = new Set([
      "admin",
      "administrador",
      "super_admin",
      "superadmin",
      "gestor_credito",
      "diretor",
    ]);

    return (
      permitidos.has(normalizarPermissaoAcompanhamento(user.cargo)) ||
      permitidos.has(normalizarPermissaoAcompanhamento(user.perfil))
    );
  }

  async function carregarPermissaoAcompanhamento(colaborador: any): Promise<AcessoUser | null> {
    if (!colaborador?.id) return colaborador || null;

    try {
      const { rows } = await pool.query(
        `SELECT id, cargo, perfil, COALESCE(acesso_acompanhamento_bancario, false) AS acesso_acompanhamento_bancario
           FROM colaboradores
          WHERE id = $1 AND ativo = true
          LIMIT 1`,
        [colaborador.id]
      );

      return rows[0] || colaborador;
    } catch (err) {
      console.error("[ACOMPANHAMENTO PERMISSÃO]", err);
      return colaborador;
    }
  }

  async function requireAcessoAcompanhamento(req: Request, res: Response, next: NextFunction) {
    const colaborador = (req as Request & { colaborador?: any }).colaborador;
    const usuario = await carregarPermissaoAcompanhamento(colaborador);

    if (!usuarioPodeAcessarAcompanhamento(usuario)) {
      res.status(403).json({
        error: "Acesso restrito a Gestor de Crédito ou superior.",
      });
      return;
    }

    (req as any).colaborador = { ...(colaborador || {}), ...(usuario || {}) };
    next();
  }

  function normalizarNumeroAcompanhamento(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === "") return null;

    const texto = String(valor)
      .replace(/[R$\s]/g, "")
      .trim();

    if (!texto) return null;

    const normalizado = texto.includes(",")
      ? texto.replace(/\./g, "").replace(",", ".")
      : texto.replace(/,/g, "");

    const n = Number(normalizado);
    return Number.isFinite(n) ? n : null;
  }

  function proximaQuartaFeira(base = new Date()): string {
    const d = new Date(base);
    d.setHours(12, 0, 0, 0);
    const dia = d.getDay(); // 0 domingo, 3 quarta
    const diff = (3 - dia + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function montarWhatsappAcompanhamento(telefone?: string | null, mensagem?: string): string | null {
    const digits = String(telefone || "").replace(/\D/g, "");
    if (!digits) return null;
    const numero = digits.startsWith("55") ? digits : `55${digits}`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem || "")}`;
  }

  function statusSemanaAcompanhamento({
    saldo,
    restricaoNova,
    ocorrenciaNegativa,
    devolucaoOuEstorno,
  }: {
    saldo: number;
    restricaoNova?: boolean;
    ocorrenciaNegativa?: boolean;
    devolucaoOuEstorno?: boolean;
  }): string {
    if (restricaoNova || ocorrenciaNegativa || devolucaoOuEstorno) return "atencao";
    if (saldo > 0) return "positiva";
    if (saldo < 0) return "negativa";
    return "neutra";
  }

  function moneyBRAcompanhamento(value: unknown): string {
    return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function textoStatusAderencia(status?: string | null): string {
    const mapa: Record<string, string> = {
      aguardando_atualizacao: "Aguardando atualização",
      abaixo_da_referencia: "Abaixo da referência",
      dentro_da_faixa: "Dentro da faixa",
      acima_do_teto: "Acima do teto",
      critico: "Crítico",
    };
    return mapa[String(status || "")] || String(status || "Não classificado");
  }

  async function registrarAlertasAcompanhamentoBancario(
    db: { query: Function },
    payload: {
      acompanhamentoId: string;
      atualizacaoId?: string | null;
      numeroSemana: number;
      nomeEmpresa?: string | null;
      banco?: string | null;
      responsavelId?: string | null;
      totalEntradas: number;
      refs: any;
      comp: any;
      dadosSemana?: Record<string, any>;
    }
  ) {
    const {
      acompanhamentoId,
      atualizacaoId,
      numeroSemana,
      nomeEmpresa,
      banco,
      responsavelId,
      totalEntradas,
      refs,
      comp,
      dadosSemana = {},
    } = payload;

    const hoje = new Date().toISOString().slice(0, 10);
    const alertas: Array<{ tipo: string; titulo: string; mensagem: string; prioridade: string }> = [];
    const status = String(comp?.status_aderencia || "");

    if (status === "acima_do_teto" || status === "critico") {
      alertas.push({
        tipo: status === "critico" ? "movimentacao_critica" : "movimentacao_acima_teto",
        prioridade: status === "critico" ? "critica" : "alta",
        titulo: status === "critico"
          ? `Semana ${numeroSemana}: movimentação crítica acima do teto`
          : `Semana ${numeroSemana}: movimentação acima do teto operacional`,
        mensagem:
          `A empresa ${nomeEmpresa || "acompanhada"} movimentou ${moneyBRAcompanhamento(totalEntradas)} na semana ${numeroSemana}, ` +
          `acima do teto semanal de ${moneyBRAcompanhamento(refs?.teto_semanal_movimentacao)}. ` +
          `Excedente aproximado: ${moneyBRAcompanhamento(comp?.valor_excedente_semana)}. ` +
          `Orientação: reduzir/compensar a movimentação nas próximas semanas, revisar documentação de origem dos recursos e evitar inconsistência com faturamento declarado. ` +
          `Ponto de atenção: variação elevada pode gerar alerta operacional, questionamento bancário ou risco de fiscalização/COAF.`,
      });
    }

    if (status === "abaixo_da_referencia") {
      alertas.push({
        tipo: "movimentacao_abaixo_referencia",
        prioridade: "media",
        titulo: `Semana ${numeroSemana}: movimentação abaixo da referência`,
        mensagem:
          `A empresa ${nomeEmpresa || "acompanhada"} movimentou ${moneyBRAcompanhamento(totalEntradas)} na semana ${numeroSemana}, ` +
          `abaixo da referência semanal base de ${moneyBRAcompanhamento(refs?.referencia_semanal_base)}. ` +
          `Diferença aproximada: ${moneyBRAcompanhamento(comp?.valor_abaixo_semana)}. ` +
          `Orientação: reforçar movimentação comprovada nas próximas semanas para preservar coerência com o faturamento declarado e melhorar avaliação/rating bancário.`,
      });
    }

    const coafStatus = String(dadosSemana?.coaf_status || "").toLowerCase();
    const pldStatus = String(dadosSemana?.pld_aml_status || "").toLowerCase();
    if (
      coafStatus.includes("suspe") ||
      coafStatus.includes("alert") ||
      coafStatus.includes("aten") ||
      pldStatus.includes("suspe") ||
      pldStatus.includes("alert") ||
      pldStatus.includes("aten")
    ) {
      alertas.push({
        tipo: "coaf_pld_aml_atencao",
        prioridade: "alta",
        titulo: `Semana ${numeroSemana}: atenção COAF/PLD-AML`,
        mensagem:
          `A semana ${numeroSemana} possui marcação de atenção em COAF/PLD-AML. ` +
          `Orientação: revisar origem dos recursos, comprovantes, movimentações incomuns e manter evidências organizadas para eventual solicitação do banco.`,
      });
    }

    if (
      Boolean(dadosSemana?.possui_restricao) ||
      Boolean(dadosSemana?.restricao_nova) ||
      Boolean(dadosSemana?.devolucao_ou_estorno) ||
      Boolean(dadosSemana?.ocorrencia_negativa)
    ) {
      alertas.push({
        tipo: "restricao_ocorrencia_negativa",
        prioridade: "alta",
        titulo: `Semana ${numeroSemana}: restrição ou ocorrência negativa`,
        mensagem:
          `Foram registradas restrições, devoluções/estornos ou ocorrência negativa na semana ${numeroSemana}. ` +
          `Orientação: tratar pendência imediatamente, registrar evidências e atualizar a orientação ao cliente.`,
      });
    }

    if (!alertas.length && status === "dentro_da_faixa") {
      await db.query(
        `UPDATE acompanhamento_bancario_alertas
            SET status = 'resolvido',
                resolvido_em = COALESCE(resolvido_em, NOW())
          WHERE acompanhamento_id = $1
            AND numero_semana = $2
            AND tipo IN ('movimentacao_critica','movimentacao_acima_teto','movimentacao_abaixo_referencia')`,
        [acompanhamentoId, numeroSemana]
      ).catch(() => null);
      return [];
    }

    const salvos: any[] = [];
    for (const alerta of alertas) {
      const { rows } = await db.query(
        `INSERT INTO acompanhamento_bancario_alertas (
           acompanhamento_id,
           atualizacao_id,
           numero_semana,
           tipo,
           titulo,
           mensagem,
           data_alerta,
           status,
           responsavel_id,
           origem,
           prioridade,
           payload
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,'pendente',$8,'sistema',$9,$10::jsonb
         )
         ON CONFLICT (acompanhamento_id, numero_semana, tipo) DO UPDATE SET
           atualizacao_id = COALESCE(EXCLUDED.atualizacao_id, acompanhamento_bancario_alertas.atualizacao_id),
           titulo = EXCLUDED.titulo,
           mensagem = EXCLUDED.mensagem,
           data_alerta = EXCLUDED.data_alerta,
           status = CASE
             WHEN acompanhamento_bancario_alertas.status = 'resolvido' THEN 'pendente'
             ELSE acompanhamento_bancario_alertas.status
           END,
           responsavel_id = COALESCE(EXCLUDED.responsavel_id, acompanhamento_bancario_alertas.responsavel_id),
           prioridade = EXCLUDED.prioridade,
           payload = EXCLUDED.payload
         RETURNING *`,
        [
          acompanhamentoId,
          atualizacaoId || null,
          numeroSemana,
          alerta.tipo,
          alerta.titulo,
          alerta.mensagem,
          hoje,
          responsavelId || null,
          alerta.prioridade,
          JSON.stringify({
            nome_empresa: nomeEmpresa || null,
            banco: banco || null,
            total_entradas: totalEntradas,
            status_aderencia: comp?.status_aderencia || null,
            percentual_uso_semanal: comp?.percentual_uso_semanal || 0,
            percentual_uso_mensal: comp?.percentual_uso_mensal || 0,
            percentual_uso_anual: comp?.percentual_uso_anual || 0,
            referencia_semanal_base: refs?.referencia_semanal_base || 0,
            teto_semanal_movimentacao: refs?.teto_semanal_movimentacao || 0,
            motivo_alerta_aderencia: comp?.motivo_alerta_aderencia || null,
          }),
        ]
      );
      salvos.push(rows[0]);
    }

    return salvos;
  }

  function escapeHtmlAcompanhamento(value: unknown): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function gerarHtmlRelatorioMensalAcompanhamento(payload: {
    acompanhamento: any;
    atualizacoes: any[];
    alertas: any[];
    ano: number;
    mes: number;
    geradoPor?: string | null;
  }): string {
    const esc = escapeHtmlAcompanhamento;
    const fmt = (v: unknown) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const fmtPct = (v: unknown) => `${(Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace(".", ",")}%`;
    const fmtDate = (value?: string | null) => {
      if (!value) return "—";
      const s = String(value).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return esc(value);
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    };
    const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const nomeMes = meses[payload.mes - 1] || String(payload.mes);
    const a = payload.acompanhamento || {};
    const semanas = payload.atualizacoes || [];
    const hoje = new Date();
    const hojeIso = hoje.toISOString().slice(0, 10);
    const semanaAtual = semanas.find((s: any) => String(s.data_referencia_inicio || "").slice(0,10) <= hojeIso && String(s.data_referencia_fim || "").slice(0,10) >= hojeIso)
      || [...semanas].reverse().find((s: any) => String(s.data_referencia_inicio || "").slice(0,10) <= hojeIso)
      || semanas[semanas.length - 1]
      || null;

    const totalMes = semanas.reduce((acc: number, s: any) => acc + Number(s.total_entradas || 0), 0);
    const totalSaidas = semanas.reduce((acc: number, s: any) => acc + Number(s.total_saidas || 0), 0);
    const saldoMes = totalMes - totalSaidas;
    const tetoMensal = Number(semanaAtual?.teto_mensal_movimentacao || 0) || Number(a.margem_seguranca_30 || 0) || Number(a.media_mensal || 0) * 1.3;
    const percentualUsoMes = tetoMensal > 0 ? (totalMes / tetoMensal) * 100 : 0;

    const linhasSemanas = semanas.map((s: any) => {
      const isAtual = semanaAtual && Number(s.numero_semana) === Number(semanaAtual.numero_semana);
      const status = textoStatusAderencia(s.status_aderencia || s.status_semana || s.status);
      return `
        <tr class="${isAtual ? "atual" : ""}">
          <td>Semana ${esc(s.numero_semana)}${isAtual ? " — atual" : ""}</td>
          <td>${fmtDate(s.data_referencia_inicio)} a ${fmtDate(s.data_referencia_fim)}</td>
          <td>${fmt(s.total_entradas)}</td>
          <td>${fmt(s.total_saidas)}</td>
          <td>${fmt(s.saldo_semanal)}</td>
          <td>${esc(s.rating_bacen || "—")}</td>
          <td>${esc(s.rating_interno || "—")}</td>
          <td>${esc(status)}</td>
          <td>${esc(s.motivo_alerta_aderencia || s.diagnostico_tecnico || s.analise_semana || "—")}</td>
        </tr>`;
    }).join("");

    const linhasAlertas = (payload.alertas || []).map((al: any) => `
      <tr>
        <td>${fmtDate(al.data_alerta)}</td>
        <td>${esc(al.prioridade || "—")}</td>
        <td>${esc(al.titulo || "—")}</td>
        <td>${esc(al.mensagem || "—")}</td>
        <td>${esc(al.status || "—")}</td>
      </tr>
    `).join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; }
    .topo { border-bottom: 4px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin: 0; color: #0f172a; }
    h2 { margin-top: 20px; font-size: 13px; text-transform: uppercase; color: #1d4ed8; letter-spacing: .04em; }
    .sub { color: #475569; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .card { border: 1px solid #dbe4f0; border-radius: 10px; padding: 9px; background: #f8fafc; }
    .card.atual { border: 2px solid #f59e0b; background: #fffbeb; }
    .label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
    .value { margin-top: 4px; font-size: 13px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
    th { background: #e0ecff; color: #1d4ed8; text-align: left; border: 1px solid #cbd5e1; padding: 6px; }
    td { border: 1px solid #e2e8f0; padding: 6px; vertical-align: top; }
    tr.atual td { background: #fffbeb; border-top: 2px solid #f59e0b; border-bottom: 2px solid #f59e0b; }
    .alerta { border-left: 4px solid #dc2626; background: #fef2f2; padding: 10px; border-radius: 8px; margin-top: 10px; }
    .nota { border-left: 4px solid #1d4ed8; background: #eff6ff; padding: 10px; border-radius: 8px; margin-top: 10px; }
    .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 38px; margin-top: 44px; page-break-inside: avoid; }
    .assinatura { border-top: 1px solid #334155; padding-top: 8px; text-align: center; font-size: 11px; }
  </style>
</head>
<body>
  <div class="topo">
    <h1>Relatório Mensal de Acompanhamento Bancário</h1>
    <div class="sub">${esc(nomeMes)} de ${payload.ano} — ${esc(a.nome_empresa)} — ${esc(a.banco_observado || "Banco não informado")}</div>
    <div class="sub">Gerado em ${fmtDate(new Date().toISOString())} por ${esc(payload.geradoPor || "Sistema")}</div>
  </div>

  <h2>Semana atual em evidência</h2>
  <div class="grid">
    <div class="card atual"><div class="label">Semana atual</div><div class="value">Semana ${esc(semanaAtual?.numero_semana || "—")}</div></div>
    <div class="card atual"><div class="label">Período</div><div class="value">${fmtDate(semanaAtual?.data_referencia_inicio)} a ${fmtDate(semanaAtual?.data_referencia_fim)}</div></div>
    <div class="card atual"><div class="label">Entradas</div><div class="value">${fmt(semanaAtual?.total_entradas)}</div></div>
    <div class="card atual"><div class="label">Status</div><div class="value">${esc(textoStatusAderencia(semanaAtual?.status_aderencia || semanaAtual?.status_semana))}</div></div>
  </div>

  <h2>Resumo mensal</h2>
  <div class="grid">
    <div class="card"><div class="label">Faturamento anual declarado</div><div class="value">${fmt(a.faturamento_anual)}</div></div>
    <div class="card"><div class="label">Média mensal base</div><div class="value">${fmt(a.media_mensal)}</div></div>
    <div class="card"><div class="label">Teto mensal + margem</div><div class="value">${fmt(tetoMensal)}</div></div>
    <div class="card"><div class="label">Uso do teto mensal</div><div class="value">${fmtPct(percentualUsoMes)}</div></div>
    <div class="card"><div class="label">Entradas do mês</div><div class="value">${fmt(totalMes)}</div></div>
    <div class="card"><div class="label">Saídas do mês</div><div class="value">${fmt(totalSaidas)}</div></div>
    <div class="card"><div class="label">Saldo do mês</div><div class="value">${fmt(saldoMes)}</div></div>
    <div class="card"><div class="label">Alertas pendentes</div><div class="value">${payload.alertas.filter((x: any) => x.status !== "resolvido").length}</div></div>
  </div>

  ${percentualUsoMes > 100 ? `<div class="alerta"><strong>Atenção:</strong> o acumulado mensal ultrapassou o teto operacional. Recomenda-se compensação imediata nas próximas semanas e documentação da origem dos recursos.</div>` : `<div class="nota"><strong>Leitura:</strong> acompanhamento mensal gerado com base na fórmula oficial de faturamento anual / 12 / 4 acrescida da margem operacional configurada.</div>`}

  <h2>Histórico semanal do mês</h2>
  <table>
    <thead>
      <tr><th>Semana</th><th>Período</th><th>Entradas</th><th>Saídas</th><th>Saldo</th><th>Rating Bacen</th><th>Rating interno</th><th>Status</th><th>Diagnóstico / orientação</th></tr>
    </thead>
    <tbody>${linhasSemanas || `<tr><td colspan="9">Nenhuma atualização registrada para o mês selecionado.</td></tr>`}</tbody>
  </table>

  <h2>Alertas operacionais</h2>
  <table>
    <thead><tr><th>Data</th><th>Prioridade</th><th>Título</th><th>Mensagem</th><th>Status</th></tr></thead>
    <tbody>${linhasAlertas || `<tr><td colspan="5">Nenhum alerta registrado para o mês.</td></tr>`}</tbody>
  </table>

  <div class="nota">
    Este relatório é parte da consultoria de acompanhamento bancário prestada para apoiar a coerência entre faturamento declarado, movimentação financeira, rating, restrições e preparação para crédito empresarial.
  </div>

  <div class="assinaturas">
    <div class="assinatura">
      ${esc(a.responsavel_nome || payload.geradoPor || "Responsável pelo acompanhamento")}<br/>
      Responsável técnico — Destrava Crédito
    </div>
    <div class="assinatura">
      Responsável legal da empresa acompanhada<br/>
      ${esc(a.nome_empresa)} — CNPJ ${esc(a.cnpj || "—")}
    </div>
  </div>
</body>
</html>`;
  }


  app.get("/api/acompanhamentos-bancarios", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const status = String(req.query.status || "todos");
      const busca = String(req.query.busca || "").trim();
      const somentePendentes = String(req.query.pendentes || "false") === "true";
      const banco = String(req.query.banco || "").trim();

      const params: any[] = [];
      const conditions: string[] = [];

      if (status && status !== "todos") {
        params.push(status);
        conditions.push(`a.status = $${params.length}`);
      }

      if (somentePendentes) {
        conditions.push(`a.proxima_atualizacao IS NOT NULL`);
        conditions.push(`a.proxima_atualizacao <= CURRENT_DATE`);
        conditions.push(`a.status IN ('em_acompanhamento','atualizacao_pendente','prorrogado')`);
      }

      if (busca) {
        params.push(`%${busca}%`);
        const idx = params.length;
        conditions.push(`(a.nome_empresa ILIKE $${idx} OR COALESCE(a.cnpj, '') ILIKE $${idx} OR COALESCE(a.banco_observado, '') ILIKE $${idx})`);
      }

      if (banco) {
        params.push(`%${banco}%`);
        conditions.push(`COALESCE(a.banco_observado, '') ILIKE $${params.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const { rows } = await pool.query(
        `SELECT
            a.*,
            c.nome AS responsavel_nome,
            ult.data_atualizacao AS ultima_atualizacao_em,
            ult.total_entradas AS total_entradas_ultima_semana,
            ult.total_saidas AS total_saidas_ultima_semana,
            ult.saldo_semanal AS saldo_semanal,
            ult.status_semana AS status_semana,
            COALESCE(cont.total_atualizacoes, 0)::int AS total_atualizacoes
          FROM acompanhamentos_bancarios a
          LEFT JOIN colaboradores c ON c.id = a.responsavel_id
          LEFT JOIN LATERAL (
            -- REGRA INEGÓCIÁVEL: semana da data atual (nunca futura)
            -- Prioridade 1: semana em curso COM dados reais (entradas > 0)
            -- Prioridade 2: última semana encerrada COM dados reais
            -- Prioridade 3: semana em curso sem dados (aguardando alimentação)
            -- Prioridade 4: qualquer semana encerrada
            SELECT
              data_atualizacao,
              total_entradas,
              total_saidas,
              saldo_semanal,
              status_semana
            FROM acompanhamento_bancario_atualizacoes u
            WHERE u.acompanhamento_id = a.id
              AND u.data_referencia_inicio <= CURRENT_DATE
              AND (
                (u.data_referencia_inicio <= CURRENT_DATE AND u.data_referencia_fim >= CURRENT_DATE)
                OR (u.data_referencia_fim < CURRENT_DATE)
              )
            ORDER BY
              CASE
                WHEN u.data_referencia_inicio <= CURRENT_DATE
                     AND u.data_referencia_fim >= CURRENT_DATE
                     AND COALESCE(u.total_entradas, 0) > 0 THEN 0
                WHEN u.data_referencia_fim < CURRENT_DATE
                     AND COALESCE(u.total_entradas, 0) > 0 THEN 1
                WHEN u.data_referencia_inicio <= CURRENT_DATE
                     AND u.data_referencia_fim >= CURRENT_DATE THEN 2
                ELSE 3
              END ASC,
              u.numero_semana DESC,
              u.created_at DESC
            LIMIT 1
          ) ult ON TRUE
          LEFT JOIN LATERAL (
            SELECT COUNT(*) AS total_atualizacoes
            FROM acompanhamento_bancario_atualizacoes u
            WHERE u.acompanhamento_id = a.id
          ) cont ON TRUE
          ${where}
          ORDER BY
            CASE WHEN a.proxima_atualizacao IS NOT NULL AND a.proxima_atualizacao <= CURRENT_DATE THEN 0 ELSE 1 END,
            a.proxima_atualizacao ASC NULLS LAST,
            a.created_at DESC`,
        params
      );

      const hoje = new Date().toISOString().slice(0, 10);

      const enriquecidos = rows.map((row: any) => {
        // Calcula semana e período para a mensagem de WhatsApp
        const totalAtualizacoes = Number(row.total_atualizacoes || 0);
        const proxSemanaNum = totalAtualizacoes + 1;
        let fimPeriodoStr = '-';
        let inicioPeriodoStr = '-';
        if (row.proxima_atualizacao) {
          const dFim = new Date(String(row.proxima_atualizacao) + 'T00:00:00Z');
          fimPeriodoStr = dFim.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
          const dIni = new Date(String(row.proxima_atualizacao) + 'T00:00:00Z');
          dIni.setUTCDate(dIni.getUTCDate() - 6);
          inicioPeriodoStr = dIni.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        }
        const msg = `Olá! Aqui é a equipe da Destrava Crédito. Hoje é dia de atualizar o acompanhamento bancário da empresa ${row.nome_empresa} no banco ${row.banco_observado || ''}. Pode nos enviar os dados da semana ${proxSemanaNum}, período de ${inicioPeriodoStr} a ${fimPeriodoStr}: entradas por Pix, maquininha, boletos, TED, dinheiro, total de saídas, saldo e informações de rating?`;
        const isPendente = Boolean(
          row.proxima_atualizacao &&
          row.proxima_atualizacao <= hoje &&
          ["em_acompanhamento", "atualizacao_pendente", "prorrogado"].includes(row.status)
        );
        return {
          ...row,
          status_pendente: isPendente,
          atualizacao_pendente: isPendente,
          whatsapp_lembrete_url: montarWhatsappAcompanhamento(row.whatsapp_cliente || row.telefone_cliente, msg),
        };
      });

      res.json(enriquecidos);
    } catch (err) {
      console.error("[GET /api/acompanhamentos-bancarios]", err);
      res.status(500).json({ error: "Erro ao listar acompanhamentos bancários." });
    }
  });

  app.get("/api/acompanhamentos-bancarios/alertas", auth, requireAcessoAcompanhamento, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT
            a.id,
            a.nome_empresa,
            a.cnpj,
            a.banco_observado,
            a.status,
            a.proxima_atualizacao,
            a.responsavel_id,
            a.whatsapp_cliente,
            a.telefone_cliente,
            c.nome AS responsavel_nome
          FROM acompanhamentos_bancarios a
          LEFT JOIN colaboradores c ON c.id = a.responsavel_id
          WHERE a.status IN ('em_acompanhamento','atualizacao_pendente','prorrogado')
            AND a.proxima_atualizacao IS NOT NULL
            AND a.proxima_atualizacao <= CURRENT_DATE
          ORDER BY a.proxima_atualizacao ASC, a.nome_empresa ASC`
      );

      res.json(rows);
    } catch (err) {
      console.error("[GET /api/acompanhamentos-bancarios/alertas]", err);
      res.status(500).json({ error: "Erro ao listar alertas de acompanhamento." });
    }
  });

  app.get("/api/acompanhamentos-bancarios/:id/atualizacoes", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT *
           FROM acompanhamento_bancario_atualizacoes
          WHERE acompanhamento_id = $1
          ORDER BY numero_semana DESC, created_at DESC`,
        [req.params.id]
      );

      res.json(rows);
    } catch (err) {
      console.error("[GET /api/acompanhamentos-bancarios/:id/atualizacoes]", err);
      res.status(500).json({ error: "Erro ao listar atualizações semanais." });
    }
  });

  app.get("/api/acompanhamentos-bancarios/:id", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT a.*, c.nome AS responsavel_nome
           FROM acompanhamentos_bancarios a
           LEFT JOIN colaboradores c ON c.id = a.responsavel_id
          WHERE a.id = $1
          LIMIT 1`,
        [req.params.id]
      );

      if (!rows.length) {
        res.status(404).json({ error: "Acompanhamento não encontrado." });
        return;
      }

      const atualizacoes = await pool.query(
        `SELECT *
           FROM acompanhamento_bancario_atualizacoes
          WHERE acompanhamento_id = $1
          ORDER BY numero_semana ASC, created_at ASC`,
        [req.params.id]
      );

      res.json({ ...rows[0], atualizacoes: atualizacoes.rows });
    } catch (err) {
      console.error("[GET /api/acompanhamentos-bancarios/:id]", err);
      res.status(500).json({ error: "Erro ao buscar acompanhamento." });
    }
  });

  app.post("/api/acompanhamentos-bancarios/:id/relatorio-mensal", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const hoje = new Date();
      const ano = Number(req.body?.ano || hoje.getFullYear());
      const mes = Number(req.body?.mes || hoje.getMonth() + 1);

      if (!ano || !mes || mes < 1 || mes > 12) {
        res.status(400).json({ error: "Informe ano e mês válidos para o relatório." });
        return;
      }

      const { rows } = await pool.query(
        `SELECT a.*, c.nome AS responsavel_nome
           FROM acompanhamentos_bancarios a
           LEFT JOIN colaboradores c ON c.id = a.responsavel_id
          WHERE a.id = $1
          LIMIT 1`,
        [req.params.id]
      );

      if (!rows.length) {
        res.status(404).json({ error: "Acompanhamento não encontrado." });
        return;
      }

      const acompanhamento = rows[0];

      const { rows: atualizacoes } = await pool.query(
        `SELECT *
           FROM acompanhamento_bancario_atualizacoes
          WHERE acompanhamento_id = $1
            AND EXTRACT(YEAR FROM COALESCE(data_referencia_inicio, data_atualizacao)) = $2
            AND EXTRACT(MONTH FROM COALESCE(data_referencia_inicio, data_atualizacao)) = $3
          ORDER BY numero_semana ASC, data_referencia_inicio ASC, created_at ASC`,
        [req.params.id, ano, mes]
      );

      const { rows: alertas } = await pool.query(
        `SELECT *
           FROM acompanhamento_bancario_alertas
          WHERE acompanhamento_id = $1
            AND (
              numero_semana IN (
                SELECT numero_semana
                  FROM acompanhamento_bancario_atualizacoes
                 WHERE acompanhamento_id = $1
                   AND EXTRACT(YEAR FROM COALESCE(data_referencia_inicio, data_atualizacao)) = $2
                   AND EXTRACT(MONTH FROM COALESCE(data_referencia_inicio, data_atualizacao)) = $3
              )
              OR (
                EXTRACT(YEAR FROM data_alerta) = $2
                AND EXTRACT(MONTH FROM data_alerta) = $3
              )
            )
          ORDER BY data_alerta DESC, created_at DESC`,
        [req.params.id, ano, mes]
      );

      const html = gerarHtmlRelatorioMensalAcompanhamento({
        acompanhamento,
        atualizacoes,
        alertas,
        ano,
        mes,
        geradoPor: colaborador?.nome || colaborador?.email || null,
      });

      const uploadsDir = path.resolve("uploads", "acompanhamento-bancario");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const slugEmpresa = String(acompanhamento.nome_empresa || "empresa")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();

      const fileName = `relatorio-bancario-${slugEmpresa}-${ano}-${String(mes).padStart(2, "0")}-${Date.now()}.pdf`;
      const filePath = path.join(uploadsDir, fileName);

      let browser: any;
      try {
        const puppeteer = await import("puppeteer-core");
        let executablePath: string;
        if (process.env.CHROMIUM_PATH) {
          executablePath = process.env.CHROMIUM_PATH;
        } else {
          try {
            const chromium = await import("@sparticuz/chromium");
            executablePath = await chromium.default.executablePath();
          } catch {
            executablePath = "/usr/bin/chromium-browser";
          }
        }

        browser = await puppeteer.default.launch({
          executablePath,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
          headless: true,
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        await page.pdf({
          path: filePath,
          format: "A4",
          printBackground: true,
          margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" },
        });
      } finally {
        if (browser) await browser.close();
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on("end", () => fs.unlink(filePath, () => {}));
    } catch (err: any) {
      console.error("[POST /api/acompanhamentos-bancarios/:id/relatorio-mensal]", err);
      res.status(500).json({ error: err.message || "Erro ao gerar relatório mensal." });
    }
  });


  app.post("/api/acompanhamentos-bancarios", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const {
        empresa_id,
        lead_id,
        nome_empresa,
        cnpj,
        telefone_cliente,
        whatsapp_cliente,
        email_cliente,
        banco_observado,
        agencia,
        conta,
        gerente_banco,
        contato_banco,
        data_abertura_conta,
        objetivo_credito,
        valor_credito_pretendido,
        linha_credito_pretendida,
        data_inicio,
        data_fim_prevista,
        responsavel_id,
        rating_bacen_inicial,
        rating_interno_inicial,
        faturamento_anual,
        media_mensal,
        margem_seguranca_30,
        percentual_operacional,
        observacoes_iniciais,
      } = req.body || {};

      let empresa: any = null;
      if (empresa_id) {
        const result = await pool.query("SELECT * FROM empresas WHERE id = $1 LIMIT 1", [empresa_id]);
        empresa = result.rows[0] || null;
      }

      const nomeFinal = String(nome_empresa || empresa?.razao_social || empresa?.nome_fantasia || "").trim();
      if (!nomeFinal) {
        res.status(400).json({ error: "Informe a empresa do acompanhamento." });
        return;
      }

      const bancoFinal = String(banco_observado || "").trim();
      if (!bancoFinal) {
        res.status(400).json({ error: "Informe o banco observado." });
        return;
      }

      const inicio = data_inicio || new Date().toISOString().slice(0, 10);
      const dtInicio = new Date(`${inicio}T12:00:00`);
      const fimCalculado = new Date(dtInicio);
      fimCalculado.setDate(fimCalculado.getDate() + 30);

      const faturamento = normalizarNumeroAcompanhamento(faturamento_anual ?? empresa?.faturamento_anual) || 0;
      const mediaInformada = normalizarNumeroAcompanhamento(media_mensal);
      const media = mediaInformada ?? (faturamento ? faturamento / 12 : 0);
      const margemInformada = normalizarNumeroAcompanhamento(margem_seguranca_30);
      const percentualOperacional = normalizarNumeroAcompanhamento(percentual_operacional) ?? 30;
      const margem30 = margemInformada ?? (media ? media * (1 + percentualOperacional / 100) : 0);
      const responsavelFinal = responsavel_id || colaborador?.id || null;

      const { rows } = await pool.query(
        `INSERT INTO acompanhamentos_bancarios (
          empresa_id,
          lead_id,
          nome_empresa,
          cnpj,
          telefone_cliente,
          whatsapp_cliente,
          email_cliente,
          banco_observado,
          agencia,
          conta,
          gerente_banco,
          contato_banco,
          data_abertura_conta,
          objetivo_credito,
          valor_credito_pretendido,
          linha_credito_pretendida,
          status,
          etapa,
          data_inicio,
          data_fim_prevista,
          responsavel_id,
          rating_bacen_inicial,
          rating_bacen_atual,
          rating_interno_inicial,
          rating_interno_atual,
          faturamento_anual,
          media_mensal,
          margem_seguranca_30,
          percentual_operacional,
          proxima_atualizacao,
          observacoes_iniciais
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,'em_acompanhamento','inicio',
          $17,$18,$19,$20,$20,$21,$21,$22,$23,$24,$25,$26,$27
        )
        RETURNING *`,
        [
          empresa_id || null,
          lead_id || null,
          nomeFinal,
          cnpj || empresa?.cnpj || null,
          telefone_cliente || empresa?.telefone || null,
          whatsapp_cliente || empresa?.whatsapp || telefone_cliente || empresa?.telefone || null,
          email_cliente || empresa?.email || null,
          bancoFinal,
          agencia || null,
          conta || null,
          gerente_banco || null,
          contato_banco || null,
          data_abertura_conta || null,
          objetivo_credito || null,
          normalizarNumeroAcompanhamento(valor_credito_pretendido),
          linha_credito_pretendida || null,
          inicio,
          data_fim_prevista || fimCalculado.toISOString().slice(0, 10),
          responsavelFinal,
          rating_bacen_inicial || null,
          rating_interno_inicial || null,
          faturamento,
          media,
          margem30,
          percentualOperacional,
          proximaQuartaFeira(dtInicio),
          observacoes_iniciais || null,
        ]
      );

      await dispararN8n("acompanhamento_bancario_criado", { acompanhamento: rows[0] });
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error("[POST /api/acompanhamentos-bancarios]", err);
      res.status(500).json({ error: "Erro ao criar acompanhamento bancário." });
    }
  });

  app.patch("/api/acompanhamentos-bancarios/:id", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const rawUpdates = { ...(req.body || {}) } as Record<string, any>;

      // Compatibilidade com nomes usados pela tela: "fim_previsto" vira a coluna real.
      if (
        Object.prototype.hasOwnProperty.call(rawUpdates, "fim_previsto") &&
        !Object.prototype.hasOwnProperty.call(rawUpdates, "data_fim_prevista")
      ) {
        rawUpdates.data_fim_prevista = rawUpdates.fim_previsto;
      }

      const DATE_FIELDS = new Set([
        "data_abertura_conta",
        "data_inicio",
        "data_fim_prevista",
        "data_fim_prorrogada",
        "data_prorrogacao",
        "proxima_atualizacao",
      ]);

      const NUMERIC_FIELDS = new Set([
        "valor_credito_pretendido",
        "faturamento_anual",
        "media_mensal",
        "margem_seguranca_30",
        "percentual_operacional",
        "limite_operacional_anual",
        "media_mensal_base",
        "teto_mensal",
        "referencia_semanal",
        "teto_semanal",
      ]);

      const BOOLEAN_FIELDS = new Set(["prorrogado"]);

      const REQUIRED_TEXT_FIELDS = new Set(["nome_empresa", "banco_observado", "status", "etapa"]);

      const ALLOWED_FIELDS = new Set([
        "empresa_id",
        "lead_id",
        "nome_empresa",
        "cnpj",
        "telefone_cliente",
        "whatsapp_cliente",
        "email_cliente",
        "banco_observado",
        "agencia",
        "conta",
        "gerente_banco",
        "contato_banco",
        "data_abertura_conta",
        "objetivo_credito",
        "valor_credito_pretendido",
        "linha_credito_pretendida",
        "status",
        "etapa",
        "data_inicio",
        "data_fim_prevista",
        "data_fim_prorrogada",
        "data_prorrogacao",
        "responsavel_id",
        "rating_bacen_inicial",
        "rating_bacen_atual",
        "rating_interno_inicial",
        "rating_interno_atual",
        "faturamento_anual",
        "media_mensal",
        "margem_seguranca_30",
        "percentual_operacional",
        "limite_operacional_anual",
        "media_mensal_base",
        "teto_mensal",
        "referencia_semanal",
        "teto_semanal",
        "status_operacional",
        "diagnostico_operacional",
        "proxima_atualizacao",
        "observacoes_iniciais",
        "observacoes_finais",
        "prorrogado",
      ]);

      const updates: Record<string, any> = {};

      for (const [field, value] of Object.entries(rawUpdates)) {
        if (!ALLOWED_FIELDS.has(field)) continue;

        let normalized = value;

        if (typeof normalized === "string") {
          const trimmed = normalized.trim();

          if (trimmed === "") {
            if (REQUIRED_TEXT_FIELDS.has(field)) continue;
            normalized = null;
          } else if (NUMERIC_FIELDS.has(field)) {
            normalized = normalizarNumeroAcompanhamento(trimmed);
          } else {
            normalized = trimmed;
          }
        } else if (normalized === undefined) {
          continue;
        }

        if (DATE_FIELDS.has(field) && normalized === "") {
          normalized = null;
        }

        if (NUMERIC_FIELDS.has(field) && normalized !== null && normalized !== undefined && typeof normalized !== "number") {
          normalized = normalizarNumeroAcompanhamento(normalized);
        }

        if (BOOLEAN_FIELDS.has(field) && normalized !== null && normalized !== undefined) {
          normalized = normalized === true || normalized === "true" || normalized === 1 || normalized === "1";
        }

        updates[field] = normalized;
      }

      updates.updated_at = new Date().toISOString();

      const keys = Object.keys(updates);
      if (!keys.length) {
        res.json({ success: true });
        return;
      }

      const values = Object.values(updates);
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");

      const { rows } = await pool.query(
        `UPDATE acompanhamentos_bancarios
            SET ${set}
          WHERE id = $${keys.length + 1}
          RETURNING *`,
        [...values, req.params.id]
      );

      if (!rows.length) {
        res.status(404).json({ error: "Acompanhamento não encontrado." });
        return;
      }

      res.json(rows[0]);
    } catch (err) {
      console.error("[PATCH /api/acompanhamentos-bancarios/:id]", err);
      res.status(500).json({ error: "Erro ao atualizar acompanhamento." });
    }
  });

    // ── PATCH: Editar semana existente ────────────────────────────────────────
  app.patch("/api/acompanhamentos-bancarios/:id/atualizacoes/:semana", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const numeroSemana = Number(req.params.semana || 0);
      if (!numeroSemana) {
        res.status(400).json({ error: "Número da semana inválido." });
        return;
      }
      const b = req.body || {};
      // Verificar se a semana existe
      const semanaExistente = await client.query(
        `SELECT * FROM acompanhamento_bancario_atualizacoes WHERE acompanhamento_id = $1 AND numero_semana = $2 LIMIT 1`,
        [req.params.id, numeroSemana]
      );
      if (!semanaExistente.rows.length) {
        res.status(404).json({ error: "Semana não encontrada." });
        return;
      }
      // Buscar acompanhamento para faturamento
      const acompResult = await client.query(
        `SELECT faturamento_anual, percentual_operacional, nome_empresa, banco_observado, responsavel_id FROM acompanhamentos_bancarios WHERE id = $1 LIMIT 1`,
        [req.params.id]
      );
      const acomp = acompResult.rows[0] || {};
      const faturamentoAnual = Number(acomp.faturamento_anual || 0);
      // Calcular entradas
      const entradas = {
        entrada_maquininha: normalizarNumeroAcompanhamento(b.entrada_maquininha) ?? Number(semanaExistente.rows[0].entrada_maquininha || 0),
        entrada_pix: normalizarNumeroAcompanhamento(b.entrada_pix) ?? Number(semanaExistente.rows[0].entrada_pix || 0),
        entrada_boleto: normalizarNumeroAcompanhamento(b.entrada_boleto) ?? Number(semanaExistente.rows[0].entrada_boleto || 0),
        entrada_ted: normalizarNumeroAcompanhamento(b.entrada_ted) ?? Number(semanaExistente.rows[0].entrada_ted || 0),
        entrada_dinheiro: normalizarNumeroAcompanhamento(b.entrada_dinheiro) ?? Number(semanaExistente.rows[0].entrada_dinheiro || 0),
        outras_entradas: normalizarNumeroAcompanhamento(b.outras_entradas) ?? Number(semanaExistente.rows[0].outras_entradas || 0),
      };
      const totalEntradas = entradas.entrada_maquininha + entradas.entrada_pix + entradas.entrada_boleto + entradas.entrada_ted + entradas.entrada_dinheiro + entradas.outras_entradas;
      const totalSaidas = normalizarNumeroAcompanhamento(b.total_saidas) ?? Number(semanaExistente.rows[0].total_saidas || 0);
      const saldoSemanal = totalEntradas - totalSaidas;
      const statusSemana = statusSemanaAcompanhamento({
        saldo: saldoSemanal,
        restricaoNova: Boolean(b.restricao_nova ?? semanaExistente.rows[0].restricao_nova),
        ocorrenciaNegativa: Boolean(b.ocorrencia_negativa ?? semanaExistente.rows[0].ocorrencia_negativa),
        devolucaoOuEstorno: Boolean(b.devolucao_ou_estorno ?? semanaExistente.rows[0].devolucao_ou_estorno),
      });
      // Calcular referências e compensação
      const dataRef = b.data_referencia_inicio || semanaExistente.rows[0].data_referencia_inicio;
      const anoRef = dataRef ? new Date(String(dataRef) + 'T00:00:00Z').getUTCFullYear() : new Date().getFullYear();
      const mesRef = dataRef ? new Date(String(dataRef) + 'T00:00:00Z').getUTCMonth() + 1 : new Date().getMonth() + 1;
      const refs = calcularReferenciasAcompanhamento(faturamentoAnual, anoRef, mesRef, Number(acomp.percentual_operacional || 30));
      // Buscar todas as semanas exceto a atual para calcular acumulados
      const todasSemanas = await client.query(
        `SELECT * FROM acompanhamento_bancario_atualizacoes WHERE acompanhamento_id = $1 ORDER BY numero_semana ASC`,
        [req.params.id]
      );
      const semanasParaAcumulo = todasSemanas.rows.filter((s: any) => Number(s.numero_semana) !== numeroSemana);
      const { acumuladoMensalAnterior, acumuladoAnual } = calcularAcumulados(semanasParaAcumulo, numeroSemana, mesRef, anoRef);
      const comp = calcularCompensacaoMensal(totalEntradas, acumuladoMensalAnterior, acumuladoAnual, numeroSemana, refs);
      const diagnostico = gerarDiagnosticoSemana(comp, refs, numeroSemana);
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE acompanhamento_bancario_atualizacoes SET
          data_referencia_inicio = COALESCE($3::date, data_referencia_inicio),
          data_referencia_fim = COALESCE($4::date, data_referencia_fim),
          data_atualizacao = COALESCE($5::date, data_atualizacao),
          entrada_maquininha = $6, entrada_pix = $7, entrada_boleto = $8,
          entrada_ted = $9, entrada_dinheiro = $10, outras_entradas = $11,
          total_entradas = $12, total_saidas = $13, saldo_semanal = $14,
          saldo_medio = $15, saldo_final = $16, quantidade_transacoes = $17,
          rating_bacen = COALESCE($18, rating_bacen), rating_interno = COALESCE($19, rating_interno),
          possui_restricao = $20, restricao_nova = $21,
          scr_status = COALESCE($22, scr_status), cenprot_status = COALESCE($23, cenprot_status),
          serasa_status = COALESCE($24, serasa_status), cnd_status = COALESCE($25, cnd_status),
          pld_aml_status = COALESCE($26, pld_aml_status), coaf_status = COALESCE($27, coaf_status),
          devolucao_ou_estorno = $28, ocorrencia_negativa = $29, status_semana = $30,
          analise_semana = COALESCE($31, analise_semana),
          orientacao_cliente = COALESCE($32, orientacao_cliente),
          proxima_acao = COALESCE($33, proxima_acao),
          faturamento_anual_ref = $34, teto_anual_movimentacao = $35,
          faturamento_mensal_base = $36, teto_mensal_movimentacao = $37,
          referencia_semanal_base = $38, teto_semanal_movimentacao = $39,
          semanas_no_mes = $40, acumulado_mensal = $41, acumulado_anual = $42,
          valor_abaixo_semana = $43, valor_excedente_semana = $44,
          saldo_faltante_ref_mensal = $45, saldo_disponivel_teto_mensal = $46,
          semanas_restantes_mes = $47, meta_base_dinamica = $48, teto_dinamico_proxima = $49,
          percentual_uso_semanal = $50, percentual_uso_mensal = $51, percentual_uso_anual = $52,
          status_aderencia = $53, alerta_aderencia = $54, motivo_alerta_aderencia = $55,
          diagnostico_tecnico = $56, updated_at = NOW()
        WHERE acompanhamento_id = $1 AND numero_semana = $2
        RETURNING *`,
        [
          req.params.id, numeroSemana,
          b.data_referencia_inicio || null, b.data_referencia_fim || null, b.data_atualizacao || null,
          entradas.entrada_maquininha, entradas.entrada_pix, entradas.entrada_boleto,
          entradas.entrada_ted, entradas.entrada_dinheiro, entradas.outras_entradas,
          totalEntradas, totalSaidas, saldoSemanal,
          normalizarNumeroAcompanhamento(b.saldo_medio) ?? Number(semanaExistente.rows[0].saldo_medio || 0),
          normalizarNumeroAcompanhamento(b.saldo_final) ?? Number(semanaExistente.rows[0].saldo_final || 0),
          Number(b.quantidade_transacoes ?? semanaExistente.rows[0].quantidade_transacoes ?? 0),
          b.rating_bacen || null, b.rating_interno || null,
          Boolean(b.possui_restricao ?? semanaExistente.rows[0].possui_restricao),
          Boolean(b.restricao_nova ?? semanaExistente.rows[0].restricao_nova),
          b.scr_status || null, b.cenprot_status || null, b.serasa_status || null,
          b.cnd_status || null, b.pld_aml_status || null, b.coaf_status || null,
          Boolean(b.devolucao_ou_estorno ?? semanaExistente.rows[0].devolucao_ou_estorno),
          Boolean(b.ocorrencia_negativa ?? semanaExistente.rows[0].ocorrencia_negativa),
          statusSemana,
          b.analise_semana || null, b.orientacao_cliente || null, b.proxima_acao || null,
          refs.faturamento_anual_ref, refs.teto_anual_movimentacao,
          refs.faturamento_mensal_base, refs.teto_mensal_movimentacao,
          refs.referencia_semanal_base, refs.teto_semanal_movimentacao,
          refs.semanas_no_mes, comp.acumulado_mensal, Number(acumuladoAnual) + totalEntradas,
          comp.valor_abaixo_semana, comp.valor_excedente_semana,
          comp.saldo_faltante_ref_mensal, comp.saldo_disponivel_teto_mensal,
          comp.semanas_restantes_mes, comp.meta_base_dinamica, comp.teto_dinamico_proxima,
          comp.percentual_uso_semanal, comp.percentual_uso_mensal, comp.percentual_uso_anual,
          comp.status_aderencia, comp.alerta_aderencia, comp.motivo_alerta_aderencia,
          diagnostico,
        ]
      );
      await registrarAlertasAcompanhamentoBancario(client, {
        acompanhamentoId: req.params.id,
        atualizacaoId: rows[0]?.id || null,
        numeroSemana,
        nomeEmpresa: acomp.nome_empresa || null,
        banco: acomp.banco_observado || null,
        responsavelId: acomp.responsavel_id || colaborador?.id || null,
        totalEntradas,
        refs,
        comp,
        dadosSemana: { ...semanaExistente.rows[0], ...b },
      });
      // Salvar histórico de compensação
      await client.query(
        `INSERT INTO acompanhamento_compensacoes_historico (
          acompanhamento_id, numero_semana, data_referencia_inicio, data_referencia_fim,
          entrada_realizada, faturamento_anual_ref, teto_anual_movimentacao,
          faturamento_mensal_base, teto_mensal_movimentacao, referencia_semanal_base,
          teto_semanal_movimentacao, acumulado_mensal, valor_abaixo_semana, valor_excedente_semana,
          saldo_faltante_ref_mensal, saldo_disponivel_teto_mensal, meta_base_dinamica,
          teto_dinamico_proxima, percentual_uso_semanal, percentual_uso_mensal, percentual_uso_anual,
          status_aderencia, alerta_aderencia, motivo_alerta, diagnostico_tecnico, criado_por
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        ON CONFLICT (acompanhamento_id, numero_semana) DO UPDATE SET
          entrada_realizada = EXCLUDED.entrada_realizada, acumulado_mensal = EXCLUDED.acumulado_mensal,
          valor_abaixo_semana = EXCLUDED.valor_abaixo_semana, valor_excedente_semana = EXCLUDED.valor_excedente_semana,
          status_aderencia = EXCLUDED.status_aderencia, alerta_aderencia = EXCLUDED.alerta_aderencia,
          motivo_alerta = EXCLUDED.motivo_alerta, diagnostico_tecnico = EXCLUDED.diagnostico_tecnico`,
        [
          req.params.id, numeroSemana,
          b.data_referencia_inicio || null, b.data_referencia_fim || null,
          totalEntradas, refs.faturamento_anual_ref, refs.teto_anual_movimentacao,
          refs.faturamento_mensal_base, refs.teto_mensal_movimentacao, refs.referencia_semanal_base,
          refs.teto_semanal_movimentacao, comp.acumulado_mensal, comp.valor_abaixo_semana, comp.valor_excedente_semana,
          comp.saldo_faltante_ref_mensal, comp.saldo_disponivel_teto_mensal, comp.meta_base_dinamica,
          comp.teto_dinamico_proxima, comp.percentual_uso_semanal, comp.percentual_uso_mensal, comp.percentual_uso_anual,
          comp.status_aderencia, comp.alerta_aderencia, comp.motivo_alerta_aderencia, diagnostico,
          colaborador?.id || null,
        ]
      );
      // Atualizar acompanhamento principal
      const baseDataAtualizacao = b.data_atualizacao ? new Date(String(b.data_atualizacao) + 'T00:00:00Z') : new Date();
      await client.query(
        `UPDATE acompanhamentos_bancarios SET
          rating_bacen_atual = COALESCE($2, rating_bacen_atual),
          rating_interno_atual = COALESCE($3, rating_interno_atual),
          ultimo_update_em = NOW(), proxima_atualizacao = $4, updated_at = NOW()
        WHERE id = $1`,
        [req.params.id, b.rating_bacen || null, b.rating_interno || null, proximaQuartaFeira(baseDataAtualizacao)]
      );
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[PATCH /api/acompanhamentos-bancarios/:id/atualizacoes/:semana]', err);
      res.status(500).json({ error: 'Erro ao editar semana.' });
    } finally {
      client.release();
    }
  });

  app.post("/api/acompanhamentos-bancarios/:id/atualizacoes", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const b = req.body || {};
      const entradas = {
        entrada_maquininha: normalizarNumeroAcompanhamento(b.entrada_maquininha) || 0,
        entrada_pix: normalizarNumeroAcompanhamento(b.entrada_pix) || 0,
        entrada_boleto: normalizarNumeroAcompanhamento(b.entrada_boleto) || 0,
        entrada_ted: normalizarNumeroAcompanhamento(b.entrada_ted) || 0,
        entrada_dinheiro: normalizarNumeroAcompanhamento(b.entrada_dinheiro) || 0,
        outras_entradas: normalizarNumeroAcompanhamento(b.outras_entradas) || 0,
      };
      const totalEntradas =
        entradas.entrada_maquininha +
        entradas.entrada_pix +
        entradas.entrada_boleto +
        entradas.entrada_ted +
        entradas.entrada_dinheiro +
        entradas.outras_entradas;
      const totalSaidas = normalizarNumeroAcompanhamento(b.total_saidas) || 0;
      const saldoSemanal = totalEntradas - totalSaidas;
      const statusSemana = statusSemanaAcompanhamento({
        saldo: saldoSemanal,
        restricaoNova: Boolean(b.restricao_nova),
        ocorrenciaNegativa: Boolean(b.ocorrencia_negativa),
        devolucaoOuEstorno: Boolean(b.devolucao_ou_estorno),
      });
      const numeroSemana = Number(b.numero_semana || 1);
      // Buscar acompanhamento para calcular referências
      const acompResult = await pool.query(
        `SELECT faturamento_anual, percentual_operacional, nome_empresa, banco_observado, responsavel_id FROM acompanhamentos_bancarios WHERE id = $1 LIMIT 1`,
        [req.params.id]
      );
      const acomp = acompResult.rows[0] || {};
      const faturamentoAnual = Number(acomp.faturamento_anual || 0);
      // Calcular referências de aderência
      const dataRef = b.data_referencia_inicio;
      const anoRef = dataRef ? new Date(String(dataRef) + 'T00:00:00Z').getUTCFullYear() : new Date().getFullYear();
      const mesRef = dataRef ? new Date(String(dataRef) + 'T00:00:00Z').getUTCMonth() + 1 : new Date().getMonth() + 1;
      const refs = calcularReferenciasAcompanhamento(faturamentoAnual, anoRef, mesRef, Number(acomp.percentual_operacional || 30));
      // Buscar semanas anteriores para acumulados
      const semanasAnteriores = await pool.query(
        `SELECT * FROM acompanhamento_bancario_atualizacoes WHERE acompanhamento_id = $1 AND numero_semana < $2 ORDER BY numero_semana ASC`,
        [req.params.id, numeroSemana]
      );
      const { acumuladoMensalAnterior, acumuladoAnual } = calcularAcumulados(semanasAnteriores.rows, numeroSemana, mesRef, anoRef);
      const comp = calcularCompensacaoMensal(totalEntradas, acumuladoMensalAnterior, acumuladoAnual, numeroSemana, refs);
      const diagnostico = gerarDiagnosticoSemana(comp, refs, numeroSemana);
      const { rows } = await pool.query(
        `INSERT INTO acompanhamento_bancario_atualizacoes (
          acompanhamento_id, numero_semana,
          data_referencia_inicio, data_referencia_fim, data_atualizacao,
          entrada_maquininha, entrada_pix, entrada_boleto, entrada_ted, entrada_dinheiro, outras_entradas,
          total_entradas, total_saidas, saldo_semanal, saldo_medio, saldo_final, quantidade_transacoes,
          rating_bacen, rating_interno, possui_restricao, restricao_nova,
          scr_status, cenprot_status, serasa_status, cnd_status, pld_aml_status, coaf_status,
          devolucao_ou_estorno, ocorrencia_negativa, status_semana,
          analise_semana, orientacao_cliente, proxima_acao, criado_por,
          faturamento_anual_ref, teto_anual_movimentacao, faturamento_mensal_base, teto_mensal_movimentacao,
          referencia_semanal_base, teto_semanal_movimentacao, semanas_no_mes,
          acumulado_mensal, acumulado_anual, valor_abaixo_semana, valor_excedente_semana,
          saldo_faltante_ref_mensal, saldo_disponivel_teto_mensal, semanas_restantes_mes,
          meta_base_dinamica, teto_dinamico_proxima,
          percentual_uso_semanal, percentual_uso_mensal, percentual_uso_anual,
          status_aderencia, alerta_aderencia, motivo_alerta_aderencia, diagnostico_tecnico
        ) VALUES (
          $1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),
          $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
          $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56
        )
        ON CONFLICT (acompanhamento_id, numero_semana) DO UPDATE SET
          data_referencia_inicio = EXCLUDED.data_referencia_inicio,
          data_referencia_fim = EXCLUDED.data_referencia_fim,
          data_atualizacao = EXCLUDED.data_atualizacao,
          entrada_maquininha = EXCLUDED.entrada_maquininha, entrada_pix = EXCLUDED.entrada_pix,
          entrada_boleto = EXCLUDED.entrada_boleto, entrada_ted = EXCLUDED.entrada_ted,
          entrada_dinheiro = EXCLUDED.entrada_dinheiro, outras_entradas = EXCLUDED.outras_entradas,
          total_entradas = EXCLUDED.total_entradas, total_saidas = EXCLUDED.total_saidas,
          saldo_semanal = EXCLUDED.saldo_semanal, saldo_medio = EXCLUDED.saldo_medio,
          saldo_final = EXCLUDED.saldo_final, quantidade_transacoes = EXCLUDED.quantidade_transacoes,
          rating_bacen = EXCLUDED.rating_bacen, rating_interno = EXCLUDED.rating_interno,
          possui_restricao = EXCLUDED.possui_restricao, restricao_nova = EXCLUDED.restricao_nova,
          scr_status = EXCLUDED.scr_status, cenprot_status = EXCLUDED.cenprot_status,
          serasa_status = EXCLUDED.serasa_status, cnd_status = EXCLUDED.cnd_status,
          pld_aml_status = EXCLUDED.pld_aml_status, coaf_status = EXCLUDED.coaf_status,
          devolucao_ou_estorno = EXCLUDED.devolucao_ou_estorno, ocorrencia_negativa = EXCLUDED.ocorrencia_negativa,
          status_semana = EXCLUDED.status_semana, analise_semana = EXCLUDED.analise_semana,
          orientacao_cliente = EXCLUDED.orientacao_cliente, proxima_acao = EXCLUDED.proxima_acao,
          faturamento_anual_ref = EXCLUDED.faturamento_anual_ref, teto_anual_movimentacao = EXCLUDED.teto_anual_movimentacao,
          faturamento_mensal_base = EXCLUDED.faturamento_mensal_base, teto_mensal_movimentacao = EXCLUDED.teto_mensal_movimentacao,
          referencia_semanal_base = EXCLUDED.referencia_semanal_base, teto_semanal_movimentacao = EXCLUDED.teto_semanal_movimentacao,
          semanas_no_mes = EXCLUDED.semanas_no_mes, acumulado_mensal = EXCLUDED.acumulado_mensal,
          acumulado_anual = EXCLUDED.acumulado_anual, valor_abaixo_semana = EXCLUDED.valor_abaixo_semana,
          valor_excedente_semana = EXCLUDED.valor_excedente_semana,
          saldo_faltante_ref_mensal = EXCLUDED.saldo_faltante_ref_mensal,
          saldo_disponivel_teto_mensal = EXCLUDED.saldo_disponivel_teto_mensal,
          semanas_restantes_mes = EXCLUDED.semanas_restantes_mes,
          meta_base_dinamica = EXCLUDED.meta_base_dinamica, teto_dinamico_proxima = EXCLUDED.teto_dinamico_proxima,
          percentual_uso_semanal = EXCLUDED.percentual_uso_semanal,
          percentual_uso_mensal = EXCLUDED.percentual_uso_mensal, percentual_uso_anual = EXCLUDED.percentual_uso_anual,
          status_aderencia = EXCLUDED.status_aderencia, alerta_aderencia = EXCLUDED.alerta_aderencia,
          motivo_alerta_aderencia = EXCLUDED.motivo_alerta_aderencia,
          diagnostico_tecnico = EXCLUDED.diagnostico_tecnico, updated_at = NOW()
        RETURNING *`,
        [
          req.params.id, numeroSemana,
          b.data_referencia_inicio || null, b.data_referencia_fim || null, b.data_atualizacao || null,
          entradas.entrada_maquininha, entradas.entrada_pix, entradas.entrada_boleto,
          entradas.entrada_ted, entradas.entrada_dinheiro, entradas.outras_entradas,
          totalEntradas, totalSaidas, saldoSemanal,
          normalizarNumeroAcompanhamento(b.saldo_medio) || 0,
          normalizarNumeroAcompanhamento(b.saldo_final) || 0,
          Number(b.quantidade_transacoes || 0),
          b.rating_bacen || null, b.rating_interno || null,
          Boolean(b.possui_restricao), Boolean(b.restricao_nova),
          b.scr_status || null, b.cenprot_status || null, b.serasa_status || null,
          b.cnd_status || null, b.pld_aml_status || null, b.coaf_status || null,
          Boolean(b.devolucao_ou_estorno), Boolean(b.ocorrencia_negativa),
          statusSemana,
          b.analise_semana || null, b.orientacao_cliente || null, b.proxima_acao || null,
          colaborador?.id || null,
          refs.faturamento_anual_ref, refs.teto_anual_movimentacao,
          refs.faturamento_mensal_base, refs.teto_mensal_movimentacao,
          refs.referencia_semanal_base, refs.teto_semanal_movimentacao, refs.semanas_no_mes,
          comp.acumulado_mensal, Number(acumuladoAnual) + totalEntradas,
          comp.valor_abaixo_semana, comp.valor_excedente_semana,
          comp.saldo_faltante_ref_mensal, comp.saldo_disponivel_teto_mensal, comp.semanas_restantes_mes,
          comp.meta_base_dinamica, comp.teto_dinamico_proxima,
          comp.percentual_uso_semanal, comp.percentual_uso_mensal, comp.percentual_uso_anual,
          comp.status_aderencia, comp.alerta_aderencia, comp.motivo_alerta_aderencia, diagnostico,
        ]
      );
      await registrarAlertasAcompanhamentoBancario(pool, {
        acompanhamentoId: req.params.id,
        atualizacaoId: rows[0]?.id || null,
        numeroSemana,
        nomeEmpresa: acomp.nome_empresa || null,
        banco: acomp.banco_observado || null,
        responsavelId: acomp.responsavel_id || colaborador?.id || null,
        totalEntradas,
        refs,
        comp,
        dadosSemana: b,
      });
      // Salvar histórico de compensação
      await pool.query(
        `INSERT INTO acompanhamento_compensacoes_historico (
          acompanhamento_id, numero_semana, data_referencia_inicio, data_referencia_fim,
          entrada_realizada, faturamento_anual_ref, teto_anual_movimentacao,
          faturamento_mensal_base, teto_mensal_movimentacao, referencia_semanal_base,
          teto_semanal_movimentacao, acumulado_mensal, valor_abaixo_semana, valor_excedente_semana,
          saldo_faltante_ref_mensal, saldo_disponivel_teto_mensal, meta_base_dinamica,
          teto_dinamico_proxima, percentual_uso_semanal, percentual_uso_mensal, percentual_uso_anual,
          status_aderencia, alerta_aderencia, motivo_alerta, diagnostico_tecnico, criado_por
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        ON CONFLICT (acompanhamento_id, numero_semana) DO UPDATE SET
          entrada_realizada = EXCLUDED.entrada_realizada, acumulado_mensal = EXCLUDED.acumulado_mensal,
          valor_abaixo_semana = EXCLUDED.valor_abaixo_semana, valor_excedente_semana = EXCLUDED.valor_excedente_semana,
          status_aderencia = EXCLUDED.status_aderencia, alerta_aderencia = EXCLUDED.alerta_aderencia,
          motivo_alerta = EXCLUDED.motivo_alerta, diagnostico_tecnico = EXCLUDED.diagnostico_tecnico`,
        [
          req.params.id, numeroSemana,
          b.data_referencia_inicio || null, b.data_referencia_fim || null,
          totalEntradas, refs.faturamento_anual_ref, refs.teto_anual_movimentacao,
          refs.faturamento_mensal_base, refs.teto_mensal_movimentacao, refs.referencia_semanal_base,
          refs.teto_semanal_movimentacao, comp.acumulado_mensal, comp.valor_abaixo_semana, comp.valor_excedente_semana,
          comp.saldo_faltante_ref_mensal, comp.saldo_disponivel_teto_mensal, comp.meta_base_dinamica,
          comp.teto_dinamico_proxima, comp.percentual_uso_semanal, comp.percentual_uso_mensal, comp.percentual_uso_anual,
          comp.status_aderencia, comp.alerta_aderencia, comp.motivo_alerta_aderencia, diagnostico,
          colaborador?.id || null,
        ]
      );
      // Calcula próxima atualização a partir da data de atualização enviada (ou hoje)
      const baseDataAtualizacao = b.data_atualizacao
        ? new Date(String(b.data_atualizacao) + 'T00:00:00Z')
        : new Date();
      const prox = proximaQuartaFeira(baseDataAtualizacao);
      await pool.query(
        `UPDATE acompanhamentos_bancarios
            SET rating_bacen_atual = COALESCE($2, rating_bacen_atual),
                rating_interno_atual = COALESCE($3, rating_interno_atual),
                ultimo_update_em = NOW(),
                proxima_atualizacao = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [req.params.id, b.rating_bacen || null, b.rating_interno || null, prox]
      );
      await dispararN8n("acompanhamento_bancario_atualizado", {
        acompanhamento_id: req.params.id,
        atualizacao: rows[0],
      });
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error("[POST /api/acompanhamentos-bancarios/:id/atualizacoes]", err);
      res.status(500).json({ error: "Erro ao registrar atualização semanal." });
    }
  });

  app.delete("/api/acompanhamentos-bancarios/:id/atualizacoes/:numeroSemana", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const numeroSemana = Number(req.params.numeroSemana || 0);
      if (!numeroSemana) {
        res.status(400).json({ error: "Número da semana inválido." });
        return;
      }

      await client.query("BEGIN");

      const deleted = await client.query(
        `DELETE FROM acompanhamento_bancario_atualizacoes
          WHERE acompanhamento_id = $1
            AND numero_semana = $2
          RETURNING id, acompanhamento_id, numero_semana,
            data_referencia_inicio, data_referencia_fim, data_atualizacao,
            total_entradas, total_saidas, saldo_semanal, status_semana`,
        [req.params.id, numeroSemana]
      );

      if (!deleted.rows.length) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Atualização semanal não encontrada." });
        return;
      }

      const ultima = await client.query(
        `SELECT id, numero_semana, data_referencia_inicio, data_referencia_fim,
                data_atualizacao, total_entradas, total_saidas, saldo_semanal,
                rating_bacen, rating_interno, status_semana
           FROM acompanhamento_bancario_atualizacoes
          WHERE acompanhamento_id = $1
          ORDER BY numero_semana DESC, created_at DESC
          LIMIT 1`,
        [req.params.id]
      );

      if (ultima.rows.length) {
        const u = ultima.rows[0];
        const baseAtualizacao = u.data_atualizacao || u.data_referencia_fim || new Date().toISOString().slice(0, 10);
        await client.query(
          `UPDATE acompanhamentos_bancarios
              SET rating_bacen_atual = COALESCE($2, rating_bacen_atual),
                  rating_interno_atual = COALESCE($3, rating_interno_atual),
                  ultimo_update_em = $4,
                  proxima_atualizacao = $5,
                  updated_at = NOW()
            WHERE id = $1`,
          [
            req.params.id,
            u.rating_bacen || null,
            u.rating_interno || null,
            u.data_atualizacao || null,
            proximaQuartaFeira(new Date(String(baseAtualizacao) + "T00:00:00Z")),
          ]
        );
      } else {
        const acompanhamento = await client.query(
          `SELECT data_inicio FROM acompanhamentos_bancarios WHERE id = $1 LIMIT 1`,
          [req.params.id]
        );
        const dataInicio = acompanhamento.rows[0]?.data_inicio || new Date().toISOString().slice(0, 10);
        await client.query(
          `UPDATE acompanhamentos_bancarios
              SET ultimo_update_em = NULL,
                  proxima_atualizacao = $2,
                  updated_at = NOW()
            WHERE id = $1`,
          [req.params.id, proximaQuartaFeira(new Date(String(dataInicio) + "T00:00:00Z"))]
        );
      }

      await client.query("COMMIT");
      res.json({ success: true, deleted: deleted.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[DELETE /api/acompanhamentos-bancarios/:id/atualizacoes/:numeroSemana]", err);
      res.status(500).json({ error: "Erro ao apagar atualização semanal." });
    } finally {
      client.release();
    }
  });

  app.delete("/api/acompanhamentos-bancarios/:id", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const acompanhamento = await client.query(
        `SELECT id, nome_empresa, banco_observado
           FROM acompanhamentos_bancarios
          WHERE id = $1
          LIMIT 1`,
        [req.params.id]
      );

      if (!acompanhamento.rows.length) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Acompanhamento não encontrado." });
        return;
      }

      await client.query(
        `DELETE FROM acompanhamento_bancario_atualizacoes
          WHERE acompanhamento_id = $1`,
        [req.params.id]
      );

      await client.query(
        `DELETE FROM acompanhamento_bancario_alertas
          WHERE acompanhamento_id = $1`,
        [req.params.id]
      ).catch(() => null);

      const deleted = await client.query(
        `DELETE FROM acompanhamentos_bancarios
          WHERE id = $1
          RETURNING *`,
        [req.params.id]
      );

      await client.query("COMMIT");
      res.json({ success: true, deleted: deleted.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[DELETE /api/acompanhamentos-bancarios/:id]", err);
      res.status(500).json({ error: "Erro ao apagar acompanhamento bancário." });
    } finally {
      client.release();
    }
  });

  app.post("/api/acompanhamentos-bancarios/:id/prorrogar", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const { rows: atuais } = await pool.query(
        `SELECT data_fim_prevista, data_fim_prorrogada
           FROM acompanhamentos_bancarios
          WHERE id = $1
          LIMIT 1`,
        [req.params.id]
      );

      if (!atuais.length) {
        res.status(404).json({ error: "Acompanhamento não encontrado." });
        return;
      }

      const base = atuais[0].data_fim_prorrogada || atuais[0].data_fim_prevista || new Date().toISOString().slice(0, 10);

      const { rows } = await pool.query(
        `UPDATE acompanhamentos_bancarios
            SET prorrogado = true,
                data_prorrogacao = CURRENT_DATE,
                data_fim_prorrogada = ($2::date + INTERVAL '30 days')::date,
                status = 'prorrogado',
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [req.params.id, base]
      );

      res.json(rows[0]);
    } catch (err) {
      console.error("[POST /api/acompanhamentos-bancarios/:id/prorrogar]", err);
      res.status(500).json({ error: "Erro ao prorrogar acompanhamento." });
    }
  });

  app.post("/api/acompanhamentos-bancarios/:id/encerrar", auth, requireAcessoAcompanhamento, async (req: Request, res: Response) => {
    try {
      const { observacoes_finais } = req.body || {};

      const { rows } = await pool.query(
        `UPDATE acompanhamentos_bancarios
            SET status = 'encerrado',
                observacoes_finais = COALESCE($2, observacoes_finais),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [req.params.id, observacoes_finais || null]
      );

      if (!rows.length) {
        res.status(404).json({ error: "Acompanhamento não encontrado." });
        return;
      }

      res.json(rows[0]);
    } catch (err) {
      console.error("[POST /api/acompanhamentos-bancarios/:id/encerrar]", err);
      res.status(500).json({ error: "Erro ao encerrar acompanhamento." });
    }
  });


  // ═══════════════════════════════════════════════════════════════════════════════
  // MÓDULO: ACOMPANHAMENTO FINANCEIRO SEMANAL
  // Acesso: Gestor de Crédito, Diretor e Administrador
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── Helpers de cálculo financeiro ──────────────────────────────────────────

  /**
   * Calcula os limites de acompanhamento com base no faturamento anual
   * declarado e no percentual operacional configurável.
   */
  function calcularLimitesAcompanhamento(
    faturamentoAnualDeclarado: number,
    percentualOperacional: number,
    anoRef: number,
    mesRef: number
  ): { limite_anual: number; limite_mensal: number; limite_semanal: number; semanas_no_mes: number } {
    const limiteAnual = Math.round((faturamentoAnualDeclarado * percentualOperacional / 100) * 100) / 100;
    const limiteMensal = Math.round((limiteAnual / 12) * 100) / 100;
    const semanasNoMes = calcularSemanasDoMes(anoRef, mesRef);
    const limiteSemanal = Math.round((limiteMensal / semanasNoMes) * 100) / 100;
    return { limite_anual: limiteAnual, limite_mensal: limiteMensal, limite_semanal: limiteSemanal, semanas_no_mes: semanasNoMes };
  }

  /**
   * Calcula a quantidade de semanas (segunda a domingo) que iniciam dentro
   * de um determinado mês/ano.
   */
  function calcularSemanasDoMes(ano: number, mes: number): number {
    const primeiroDia = new Date(ano, mes - 1, 1);
    const ultimoDia = new Date(ano, mes, 0);
    let semanas = 0;
    for (let d = new Date(primeiroDia); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 1) semanas++;
    }
    return semanas > 0 ? semanas : 4;
  }

  /**
   * Calcula o resumo semanal: saldo final e saldo médio.
   * Prefere média dos saldos diários; usa fallback se não houver.
   */
  function calcularResumoSemanal(
    saldoInicial: number,
    totalEntradas: number,
    totalSaidas: number,
    saldosDiarios: number[]
  ): { saldo_final: number; saldo_medio: number } {
    const saldoFinal = Math.round((saldoInicial + totalEntradas - totalSaidas) * 100) / 100;
    let saldoMedio: number;
    if (saldosDiarios.length > 0) {
      // Cálculo ideal: média dos saldos diários informados
      const soma = saldosDiarios.reduce((acc, s) => acc + s, 0);
      saldoMedio = Math.round((soma / saldosDiarios.length) * 100) / 100;
    } else {
      // Fallback seguro: média entre saldo inicial e saldo final
      saldoMedio = Math.round(((saldoInicial + saldoFinal) / 2) * 100) / 100;
    }
    return { saldo_final: saldoFinal, saldo_medio: saldoMedio };
  }

  /**
   * Classifica o status de acompanhamento com base nos percentuais
   * de uso semanal, mensal e anual.
   * Regras de tolerância: semana acima não é erro definitivo se mês OK.
   */
  function classificarStatusAcompanhamento(
    percentualSemana: number,
    percentualMes: number,
    percentualAno: number
  ): string {
    // Critério anual é o mais grave
    if (percentualAno > 100) return 'critico';
    // Critério mensal
    if (percentualMes > 120) return 'critico';
    if (percentualMes > 100) return 'incompativel';
    // Critério semanal (tolerância: semana acima não é erro definitivo se mês ok)
    if (percentualSemana > 200) return 'incompativel';
    if (percentualSemana > 150) return 'atencao_media';
    if (percentualSemana > 120) return 'atencao_media';
    if (percentualSemana > 100) return 'atencao_leve';
    return 'dentro_da_referencia';
  }

  /**
   * Gera o diagnóstico técnico automático com linguagem adequada
   * para análise de crédito e conformidade documental.
   */
  function gerarDiagnosticoAcompanhamento(
    percentualSemana: number,
    percentualMes: number,
    percentualAno: number,
    status: string,
    limiteSemanal: number,
    limiteMensal: number,
    limiteAnual: number,
    acumuladoMensal: number,
    acumuladoAnual: number
  ): string {
    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const pct = (v: number) => `${(Math.round(v * 100) / 100).toFixed(2).replace('.', ',')}%`;
    if (status === 'aguardando_atualizacao') {
      return 'Configuração de acompanhamento financeiro pendente. É necessário informar o faturamento anual declarado para iniciar o monitoramento de coerência financeira.';
    }
    if (status === 'critico') {
      if (percentualAno > 100) {
        return `O acumulado anual de ${fmt(acumuladoAnual)} ultrapassou o limite de referência anual de ${fmt(limiteAnual)} (${pct(percentualAno)} do limite). É necessário revisar os lançamentos, documentos comprobatórios e a aderência ao faturamento anual declarado antes da emissão de novos relatórios ou análise de crédito.`;
      }
      return `O acumulado mensal de ${fmt(acumuladoMensal)} ultrapassou em ${pct(percentualMes - 100)} o limite de referência mensal de ${fmt(limiteMensal)}. É necessário revisar os lançamentos, documentos comprobatórios e a aderência ao faturamento anual declarado antes da emissão de novos relatórios ou análise de crédito.`;
    }
    if (status === 'incompativel') {
      if (percentualMes > 100) {
        return `O acumulado mensal de ${fmt(acumuladoMensal)} ultrapassou o limite de referência mensal de ${fmt(limiteMensal)} (${pct(percentualMes)} do limite). Recomenda-se revisão dos lançamentos e verificação da capacidade de comprovação documental para preservar a conformidade com o faturamento anual declarado.`;
      }
      return `A movimentação semanal atingiu ${pct(percentualSemana)} do limite semanal de referência de ${fmt(limiteSemanal)}. O acumulado mensal permanece em ${pct(percentualMes)} do limite mensal. Recomenda-se atenção ao controle de movimentação das próximas semanas para preservar a coerência financeira.`;
    }
    if (status === 'atencao_media') {
      return `A semana analisada apresentou movimentação de ${pct(percentualSemana)} do limite semanal de referência de ${fmt(limiteSemanal)}. O acumulado mensal permanece em ${pct(percentualMes)} do limite mensal de ${fmt(limiteMensal)}. Recomenda-se monitoramento rigoroso das próximas semanas para preservar a coerência entre faturamento declarado, movimentação financeira e capacidade de comprovação documental.`;
    }
    if (status === 'atencao_leve') {
      return `A semana analisada apresentou entradas acima da referência semanal calculada (${pct(percentualSemana)} do limite de ${fmt(limiteSemanal)}). Entretanto, o acumulado mensal permanece dentro da faixa de acompanhamento definida com base no faturamento anual declarado (${pct(percentualMes)} do limite mensal). Recomenda-se manter o monitoramento das próximas semanas para preservar a coerência entre faturamento declarado, movimentação financeira e capacidade de comprovação documental.`;
    }
    return `A movimentação da semana analisada está dentro da referência semanal calculada (${pct(percentualSemana)} do limite de ${fmt(limiteSemanal)}). O acumulado mensal corresponde a ${pct(percentualMes)} do limite mensal de ${fmt(limiteMensal)} e o acumulado anual a ${pct(percentualAno)} do limite anual de ${fmt(limiteAnual)}. O acompanhamento financeiro está em conformidade com o faturamento anual declarado.`;
  }

  // ── Middleware de acesso ao módulo financeiro ────────────────────────────────
  // Acesso: Gestor de Crédito, Diretor e Administrador

  function normalizarCargoFinanceiro(v?: string | null): string {
    return String(v || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_').replace(/-/g, '_');
  }

  function usuarioPodeAcessarFinanceiro(user: { cargo?: string | null; perfil?: string | null; acesso_acompanhamento_financeiro?: boolean | null } | null | undefined): boolean {
    if (!user) return false;
    if (user.acesso_acompanhamento_financeiro === true) return true;
    // Apenas: administrador, diretor, gestor_de_credito
    const permitidos = new Set([
      'admin', 'administrador', 'super_admin', 'superadmin',
      'diretor',
      'gestor_credito', 'gestor_de_credito', 'gestor de credito',
    ]);
    return (
      permitidos.has(normalizarCargoFinanceiro(user.cargo)) ||
      permitidos.has(normalizarCargoFinanceiro(user.perfil))
    );
  }

  async function requireAcessoFinanceiro(req: Request, res: Response, next: NextFunction) {
    const colaborador = (req as any).colaborador;
    if (!colaborador?.id) {
      res.status(403).json({ error: 'Acesso não autorizado.' });
      return;
    }
    try {
      const { rows } = await pool.query(
        `SELECT id, cargo, perfil,
                COALESCE(acesso_acompanhamento_financeiro, false) AS acesso_acompanhamento_financeiro
           FROM colaboradores
          WHERE id = $1 AND ativo = true
          LIMIT 1`,
        [colaborador.id]
      );
      const user = rows[0] || colaborador;
      if (!usuarioPodeAcessarFinanceiro(user)) {
        res.status(403).json({ error: 'Acesso restrito a Gestor de Crédito, Diretor ou Administrador.' });
        return;
      }
      (req as any).colaborador = { ...(colaborador || {}), ...(user || {}) };
      next();
    } catch (err) {
      console.error('[requireAcessoFinanceiro]', err);
      res.status(500).json({ error: 'Erro ao verificar permissão.' });
    }
  }

  // ── Geração do HTML do Relatório PDF ────────────────────────────────────────

  // ── Geração do HTML do Relatório PDF (padrão letterhead oficial) ──────────
  function gerarHtmlRelatorioFinanceiro(payload: {
    empresa: { razao_social: string; cnpj?: string; cidade?: string; estado?: string };
    config: { faturamento_anual_declarado: number; percentual_operacional: number; limite_anual: number };
    semana: {
      ano: number; mes: number; numero_semana: number;
      semana_inicio: string; semana_fim: string;
      saldo_inicial: number; total_entradas: number; total_saidas: number;
      saldo_final: number; saldo_medio: number;
      limite_semanal_referencia: number; limite_mensal_referencia: number; limite_anual_referencia: number;
      acumulado_mensal: number; acumulado_anual: number;
      percentual_uso_semana: number; percentual_uso_mes: number; percentual_uso_ano: number;
      status: string; diagnostico?: string; observacoes?: string;
    };
    movimentacoes?: Array<{ data_movimento: string; tipo: string; categoria?: string; descricao?: string; valor: number }>;
    saldosDiarios?: Array<{ data_referencia: string; saldo_dia: number }>;
    geradoPor?: string;
  }): string {
    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
    const fmtDate = (s: string) => {
      if (!s) return '—';
      const d = String(s).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return s;
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    };
    const fmtPct = (v: number) => `${(Math.round((Number(v) || 0) * 100) / 100).toFixed(2).replace('.', ',')}%`;
    const esc = (s?: string | null) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const nomeMesStr = meses[(payload.semana.mes - 1)] || String(payload.semana.mes);
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    const statusLabel: Record<string, string> = {
      dentro_da_referencia: 'Dentro da Referência',
      atencao_leve: 'Atenção Leve',
      atencao_media: 'Atenção Média',
      incompativel: 'Incompatível',
      critico: 'Crítico',
      sem_documentacao: 'Sem Documentação',
      aguardando_atualizacao: 'Aguardando Atualização',
      regularizado: 'Regularizado',
    };
    const statusCor: Record<string, string> = {
      dentro_da_referencia: '#166534', atencao_leve: '#854d0e', atencao_media: '#c2410c',
      incompativel: '#991b1b', critico: '#7f1d1d', sem_documentacao: '#374151',
      aguardando_atualizacao: '#1e40af', regularizado: '#065f46',
    };
    const statusBg: Record<string, string> = {
      dentro_da_referencia: '#dcfce7', atencao_leve: '#fef9c3', atencao_media: '#ffedd5',
      incompativel: '#fee2e2', critico: '#fecaca', sem_documentacao: '#f3f4f6',
      aguardando_atualizacao: '#dbeafe', regularizado: '#d1fae5',
    };
    const st = payload.semana.status || 'aguardando_atualizacao';
    const stLabel = statusLabel[st] || st;
    const stCor = statusCor[st] || '#374151';
    const stBg = statusBg[st] || '#f3f4f6';

    // Barra de progresso HTML
    const barraProgresso = (pct: number, label: string) => {
      const clamped = Math.min(pct, 100);
      const cor = pct > 120 ? '#dc2626' : pct > 100 ? '#f97316' : '#16a34a';
      return `<div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:8pt;margin-bottom:2px;">
          <span style="color:#374151;">${esc(label)}</span>
          <span style="font-weight:700;color:${pct > 100 ? '#dc2626' : '#374151'};">${fmtPct(pct)}</span>
        </div>
        <div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${clamped}%;background:${cor};border-radius:4px;"></div>
        </div>
      </div>`;
    };

    const linhasMovimentacoes = (payload.movimentacoes || []).map(m => `
      <tr>
        <td style="padding:4px 7px;border:1px solid #d1d5db;">${esc(fmtDate(m.data_movimento))}</td>
        <td style="padding:4px 7px;border:1px solid #d1d5db;text-transform:capitalize;font-weight:600;color:${m.tipo === 'entrada' ? '#166534' : '#991b1b'};">${esc(m.tipo === 'entrada' ? 'Entrada' : 'Saída')}</td>
        <td style="padding:4px 7px;border:1px solid #d1d5db;">${esc(m.categoria || '—')}</td>
        <td style="padding:4px 7px;border:1px solid #d1d5db;">${esc(m.descricao || '—')}</td>
        <td style="padding:4px 7px;border:1px solid #d1d5db;text-align:right;font-weight:${m.tipo === 'entrada' ? '700' : '400'};color:${m.tipo === 'entrada' ? '#166534' : '#991b1b'};">${fmt(m.valor)}</td>
      </tr>`).join('');

    const linhasSaldosDiarios = (payload.saldosDiarios || []).map(s => `
      <tr>
        <td style="padding:4px 7px;border:1px solid #d1d5db;">${esc(fmtDate(s.data_referencia))}</td>
        <td style="padding:4px 7px;border:1px solid #d1d5db;text-align:right;font-weight:600;">${fmt(s.saldo_dia)}</td>
      </tr>`).join('');

    let secNum = 1;

    const body = `
    <h1 class="doc-title" style="font-size:13pt;font-weight:700;text-align:center;text-transform:uppercase;margin:0 0 4px;">
      Relatório Técnico de Acompanhamento Financeiro Semanal
    </h1>
    <p style="text-align:center;font-size:9pt;color:#374151;margin:0 0 16px;">
      ${esc(payload.empresa.razao_social)}${payload.empresa.cnpj ? ` &nbsp;|&nbsp; CNPJ: ${esc(payload.empresa.cnpj)}` : ''} &nbsp;|&nbsp; ${esc(nomeMesStr)}/${payload.semana.ano} — Semana ${payload.semana.numero_semana}
    </p>

    <h2 class="section-title">${secNum++}. Dados da Empresa e Período Analisado</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:12px;">
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">Razão Social</span><span style="font-size:9.5pt;font-weight:600;">${esc(payload.empresa.razao_social)}</span></div>
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">CNPJ</span><span style="font-size:9.5pt;font-weight:600;">${esc(payload.empresa.cnpj || '—')}</span></div>
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">Período da Semana</span><span style="font-size:9.5pt;font-weight:600;">${esc(fmtDate(payload.semana.semana_inicio))} a ${esc(fmtDate(payload.semana.semana_fim))}</span></div>
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">Referência</span><span style="font-size:9.5pt;font-weight:600;">${esc(nomeMesStr)}/${payload.semana.ano} — Semana ${payload.semana.numero_semana}</span></div>
    </div>

    <h2 class="section-title">${secNum++}. Parâmetros de Acompanhamento</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 14px;margin-bottom:12px;">
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">Faturamento Anual Declarado</span><span style="font-size:9.5pt;font-weight:600;">${fmt(payload.config.faturamento_anual_declarado)}</span></div>
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">Percentual Operacional</span><span style="font-size:9.5pt;font-weight:600;">${fmtPct(payload.config.percentual_operacional)}</span></div>
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">Limite Anual de Referência</span><span style="font-size:9.5pt;font-weight:600;">${fmt(payload.semana.limite_anual_referencia)}</span></div>
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">Limite Mensal de Referência</span><span style="font-size:9.5pt;font-weight:600;">${fmt(payload.semana.limite_mensal_referencia)}</span></div>
      <div><span style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;display:block;">Limite Semanal de Referência</span><span style="font-size:9.5pt;font-weight:600;">${fmt(payload.semana.limite_semanal_referencia)}</span></div>
    </div>

    <h2 class="section-title">${secNum++}. Resumo Financeiro da Semana</h2>
    <table class="data-table" style="margin-bottom:12px;">
      <thead>
        <tr>
          <th style="background:#1B3A8C;color:#fff;padding:5px 8px;text-align:left;font-weight:700;font-size:8pt;">Indicador</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 8px;text-align:right;font-weight:700;font-size:8pt;">Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="padding:4px 8px;border:1px solid #d1d5db;">Saldo Inicial da Semana</td><td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(payload.semana.saldo_inicial)}</td></tr>
        <tr style="background:#f0f7ff;"><td style="padding:4px 8px;border:1px solid #d1d5db;"><strong>Total de Entradas</strong></td><td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;color:#166534;font-weight:700;">${fmt(payload.semana.total_entradas)}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #d1d5db;">Total de Saídas</td><td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;color:#991b1b;">${fmt(payload.semana.total_saidas)}</td></tr>
        <tr style="background:#dce3f5;"><td style="padding:4px 8px;border:1px solid #9ca3af;font-weight:700;"><strong>Saldo Final da Semana</strong></td><td style="padding:4px 8px;border:1px solid #9ca3af;text-align:right;font-weight:700;">${fmt(payload.semana.saldo_final)}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #d1d5db;">Saldo Médio Semanal</td><td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(payload.semana.saldo_medio)}</td></tr>
      </tbody>
    </table>

    <h2 class="section-title">${secNum++}. Análise de Conformidade com os Limites de Referência</h2>
    <table class="data-table" style="margin-bottom:10px;">
      <thead>
        <tr>
          <th style="background:#1B3A8C;color:#fff;padding:5px 8px;text-align:left;font-weight:700;font-size:8pt;">Indicador</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 8px;text-align:right;font-weight:700;font-size:8pt;">Valor Acumulado</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 8px;text-align:right;font-weight:700;font-size:8pt;">Limite de Referência</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 8px;text-align:right;font-weight:700;font-size:8pt;">% Utilizado</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:4px 8px;border:1px solid #d1d5db;">Acumulado Semanal</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(payload.semana.total_entradas)}</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(payload.semana.limite_semanal_referencia)}</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;font-weight:700;color:${payload.semana.percentual_uso_semana > 100 ? '#dc2626' : '#166534'};">${fmtPct(payload.semana.percentual_uso_semana)}</td>
        </tr>
        <tr style="background:#f0f7ff;">
          <td style="padding:4px 8px;border:1px solid #d1d5db;font-weight:600;">Acumulado Mensal</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(payload.semana.acumulado_mensal)}</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(payload.semana.limite_mensal_referencia)}</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;font-weight:700;color:${payload.semana.percentual_uso_mes > 100 ? '#dc2626' : '#166534'};">${fmtPct(payload.semana.percentual_uso_mes)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;border:1px solid #d1d5db;">Acumulado Anual</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(payload.semana.acumulado_anual)}</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;">${fmt(payload.semana.limite_anual_referencia)}</td>
          <td style="padding:4px 8px;border:1px solid #d1d5db;text-align:right;font-weight:700;color:${payload.semana.percentual_uso_ano > 100 ? '#dc2626' : '#166534'};">${fmtPct(payload.semana.percentual_uso_ano)}</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-bottom:12px;">
      ${barraProgresso(payload.semana.percentual_uso_semana, `Semanal — ${fmt(payload.semana.total_entradas)} / ${fmt(payload.semana.limite_semanal_referencia)}`)}
      ${barraProgresso(payload.semana.percentual_uso_mes, `Mensal — ${fmt(payload.semana.acumulado_mensal)} / ${fmt(payload.semana.limite_mensal_referencia)}`)}
      ${barraProgresso(payload.semana.percentual_uso_ano, `Anual — ${fmt(payload.semana.acumulado_anual)} / ${fmt(payload.semana.limite_anual_referencia)}`)}
    </div>

    <h2 class="section-title">${secNum++}. Status e Diagnóstico Técnico</h2>
    <div style="margin-bottom:8px;">
      <span style="font-size:8pt;color:#374151;">Status de Conformidade: </span>
      <span style="display:inline-block;padding:3px 12px;border-radius:4px;font-size:9pt;font-weight:700;background:${stBg};color:${stCor};">${esc(stLabel)}</span>
    </div>
    <div style="background:#f8fafc;border-left:3px solid #1B3A8C;padding:9px 12px;font-size:9pt;line-height:1.55;text-align:justify;margin:6px 0 12px;page-break-inside:avoid;">
      ${esc(payload.semana.diagnostico || 'Diagnóstico não disponível para este período.')}
    </div>

    ${(payload.movimentacoes && payload.movimentacoes.length > 0) ? `
    <h2 class="section-title">${secNum++}. Movimentações Registradas</h2>
    <table class="data-table" style="margin-bottom:12px;font-size:8.5pt;">
      <thead>
        <tr>
          <th style="background:#1B3A8C;color:#fff;padding:5px 7px;text-align:left;font-size:8pt;">Data</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 7px;text-align:left;font-size:8pt;">Tipo</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 7px;text-align:left;font-size:8pt;">Categoria</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 7px;text-align:left;font-size:8pt;">Descrição</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 7px;text-align:right;font-size:8pt;">Valor</th>
        </tr>
      </thead>
      <tbody>${linhasMovimentacoes}</tbody>
    </table>` : ''}

    ${(payload.saldosDiarios && payload.saldosDiarios.length > 0) ? `
    <h2 class="section-title">${secNum++}. Saldos Diários</h2>
    <table class="data-table" style="max-width:320px;margin-bottom:12px;font-size:8.5pt;">
      <thead>
        <tr>
          <th style="background:#1B3A8C;color:#fff;padding:5px 7px;text-align:left;font-size:8pt;">Data</th>
          <th style="background:#1B3A8C;color:#fff;padding:5px 7px;text-align:right;font-size:8pt;">Saldo do Dia</th>
        </tr>
      </thead>
      <tbody>${linhasSaldosDiarios}</tbody>
    </table>` : ''}

    ${payload.semana.observacoes ? `
    <h2 class="section-title">Observações</h2>
    <div style="background:#fffbeb;border-left:3px solid #f0a500;padding:8px 12px;font-size:9pt;line-height:1.5;margin:6px 0 12px;page-break-inside:avoid;">
      ${esc(payload.semana.observacoes)}
    </div>` : ''}

    <div style="margin-top:18px;padding-top:8px;border-top:1px solid #d1d5db;font-size:7.5pt;color:#6b7280;display:flex;justify-content:space-between;">
      <span>Emitido em: ${esc(dataEmissao)}${payload.geradoPor ? ` &nbsp;|&nbsp; Responsável: ${esc(payload.geradoPor)}` : ''}</span>
      <span>DESTRAVA CRÉDITO LTDA &nbsp;|&nbsp; CNPJ 35.427.182/0001-66</span>
    </div>
    `;

    return gerarHtmlTimbrado(body, 'Relatório de Acompanhamento Financeiro Semanal');
  }

  // ── ROTA: Configuração de Acompanhamento Financeiro ─────────────────────────

  // GET /api/acompanhamento-financeiro/config/:empresaId
  app.get('/api/acompanhamento-financeiro/config/:empresaId', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const { empresaId } = req.params;
      const { rows } = await pool.query(
        `SELECT c.*, e.razao_social, e.cnpj, e.faturamento_anual AS faturamento_anual_empresa
           FROM acompanhamento_financeiro_config c
           JOIN empresas e ON e.id = c.empresa_id
          WHERE c.empresa_id = $1
          LIMIT 1`,
        [empresaId]
      );
      if (!rows.length) {
        const { rows: emp } = await pool.query(
          `SELECT id, razao_social, cnpj, faturamento_anual FROM empresas WHERE id = $1 LIMIT 1`,
          [empresaId]
        );
        if (!emp.length) { res.status(404).json({ error: 'Empresa não encontrada.' }); return; }
        res.json({
          configurado: false,
          empresa: emp[0],
          faturamento_anual_empresa: emp[0].faturamento_anual,
          percentual_operacional_padrao: 30,
          status_config: 'pendente',
        });
        return;
      }
      res.json({ configurado: true, ...rows[0] });
    } catch (err) {
      console.error('[GET /api/acompanhamento-financeiro/config/:empresaId]', err);
      res.status(500).json({ error: 'Erro ao buscar configuração.' });
    }
  });

  // POST /api/acompanhamento-financeiro/config
  app.post('/api/acompanhamento-financeiro/config', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const { empresa_id, faturamento_anual_declarado, percentual_operacional = 30 } = req.body;
      if (!empresa_id) { res.status(400).json({ error: 'empresa_id é obrigatório.' }); return; }
      const fat = Number(faturamento_anual_declarado);
      const pct = Number(percentual_operacional);
      if (!Number.isFinite(fat) || fat < 0) { res.status(400).json({ error: 'Faturamento anual declarado inválido.' }); return; }
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) { res.status(400).json({ error: 'Percentual operacional deve estar entre 0,01 e 100.' }); return; }
      const colaboradorId = (req as any).colaborador?.id || null;
      const { rows } = await pool.query(
        `INSERT INTO acompanhamento_financeiro_config
           (empresa_id, faturamento_anual_declarado, percentual_operacional, ativo, criado_por)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (empresa_id) DO UPDATE SET
           faturamento_anual_declarado = EXCLUDED.faturamento_anual_declarado,
           percentual_operacional = EXCLUDED.percentual_operacional,
           ativo = true,
           updated_at = NOW()
         RETURNING *`,
        [empresa_id, fat, pct, colaboradorId]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[POST /api/acompanhamento-financeiro/config]', err);
      res.status(500).json({ error: 'Erro ao salvar configuração.' });
    }
  });

  // ── ROTA: Listar semanas de uma empresa ─────────────────────────────────────

  // GET /api/acompanhamento-financeiro/semanas/:empresaId
  app.get('/api/acompanhamento-financeiro/semanas/:empresaId', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const { empresaId } = req.params;
      const { ano, mes } = req.query;
      const conditions: string[] = ['s.empresa_id = $1'];
      const params: any[] = [empresaId];
      if (ano) { params.push(Number(ano)); conditions.push(`s.ano = $${params.length}`); }
      if (mes) { params.push(Number(mes)); conditions.push(`s.mes = $${params.length}`); }
      const { rows } = await pool.query(
        `SELECT s.*,
                e.razao_social, e.cnpj,
                c.faturamento_anual_declarado, c.percentual_operacional
           FROM acompanhamento_financeiro_semanal s
           JOIN empresas e ON e.id = s.empresa_id
           LEFT JOIN acompanhamento_financeiro_config c ON c.empresa_id = s.empresa_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY s.ano DESC, s.mes DESC, s.numero_semana DESC`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/acompanhamento-financeiro/semanas/:empresaId]', err);
      res.status(500).json({ error: 'Erro ao listar semanas.' });
    }
  });

  // GET /api/acompanhamento-financeiro/semana/:id
  app.get('/api/acompanhamento-financeiro/semana/:id', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT s.*,
                e.razao_social, e.cnpj, e.cidade, e.estado,
                c.faturamento_anual_declarado, c.percentual_operacional
           FROM acompanhamento_financeiro_semanal s
           JOIN empresas e ON e.id = s.empresa_id
           LEFT JOIN acompanhamento_financeiro_config c ON c.empresa_id = s.empresa_id
          WHERE s.id = $1
          LIMIT 1`,
        [id]
      );
      if (!rows.length) { res.status(404).json({ error: 'Registro não encontrado.' }); return; }
      const semana = rows[0];
      const { rows: movs } = await pool.query(
        `SELECT * FROM acompanhamento_financeiro_movimentacoes WHERE acompanhamento_id = $1 ORDER BY data_movimento ASC, tipo ASC`,
        [id]
      );
      const { rows: saldos } = await pool.query(
        `SELECT * FROM acompanhamento_financeiro_saldos_diarios WHERE acompanhamento_id = $1 ORDER BY data_referencia ASC`,
        [id]
      );
      res.json({ ...semana, movimentacoes: movs, saldos_diarios: saldos });
    } catch (err) {
      console.error('[GET /api/acompanhamento-financeiro/semana/:id]', err);
      res.status(500).json({ error: 'Erro ao buscar semana.' });
    }
  });

  // ── ROTA: Criar/Atualizar semana ────────────────────────────────────────────

  // POST /api/acompanhamento-financeiro/semana
  app.post('/api/acompanhamento-financeiro/semana', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const {
        empresa_id, ano, mes, numero_semana,
        semana_inicio, semana_fim,
        saldo_inicial = 0,
        total_entradas = 0, total_saidas = 0,
        saldos_diarios = [],
        movimentacoes = [],
        observacoes,
      } = req.body;

      if (!empresa_id) { res.status(400).json({ error: 'empresa_id é obrigatório.' }); return; }
      if (!ano || !mes || !numero_semana) { res.status(400).json({ error: 'ano, mes e numero_semana são obrigatórios.' }); return; }
      if (!semana_inicio || !semana_fim) { res.status(400).json({ error: 'semana_inicio e semana_fim são obrigatórios.' }); return; }
      if (new Date(semana_fim) < new Date(semana_inicio)) { res.status(400).json({ error: 'semana_fim não pode ser anterior a semana_inicio.' }); return; }

      const saldoIni = Number(saldo_inicial);
      const entradas = Number(total_entradas);
      const saidas = Number(total_saidas);
      if (!Number.isFinite(saldoIni) || saldoIni < 0) { res.status(400).json({ error: 'saldo_inicial inválido.' }); return; }
      if (!Number.isFinite(entradas) || entradas < 0) { res.status(400).json({ error: 'total_entradas inválido.' }); return; }
      if (!Number.isFinite(saidas) || saidas < 0) { res.status(400).json({ error: 'total_saidas inválido.' }); return; }

      // Buscar configuração da empresa
      const { rows: cfgRows } = await pool.query(
        `SELECT faturamento_anual_declarado, percentual_operacional, limite_anual
           FROM acompanhamento_financeiro_config
          WHERE empresa_id = $1 AND ativo = true
          LIMIT 1`,
        [empresa_id]
      );
      let limites = { limite_anual: 0, limite_mensal: 0, limite_semanal: 0, semanas_no_mes: 4 };
      if (cfgRows.length) {
        limites = calcularLimitesAcompanhamento(
          Number(cfgRows[0].faturamento_anual_declarado),
          Number(cfgRows[0].percentual_operacional),
          Number(ano), Number(mes)
        );
      }

      // Calcular resumo semanal
      const saldosDiariosNums = (saldos_diarios as any[]).map(s => Number(s.saldo_dia)).filter(n => Number.isFinite(n));
      const { saldo_final, saldo_medio } = calcularResumoSemanal(saldoIni, entradas, saidas, saldosDiariosNums);

      // Calcular acumulados (excluindo semana atual para evitar dupla contagem)
      const colaboradorId = (req as any).colaborador?.id || null;
      const { rows: acumMes } = await pool.query(
        `SELECT COALESCE(SUM(total_entradas), 0) AS total
           FROM acompanhamento_financeiro_semanal
          WHERE empresa_id = $1 AND ano = $2 AND mes = $3 AND numero_semana != $4`,
        [empresa_id, ano, mes, numero_semana]
      );
      const { rows: acumAno } = await pool.query(
        `SELECT COALESCE(SUM(total_entradas), 0) AS total
           FROM acompanhamento_financeiro_semanal
          WHERE empresa_id = $1 AND ano = $2 AND NOT (mes = $3 AND numero_semana = $4)`,
        [empresa_id, ano, mes, numero_semana]
      );
      const acumuladoMensal = Math.round((Number(acumMes[0]?.total || 0) + entradas) * 100) / 100;
      const acumuladoAnual = Math.round((Number(acumAno[0]?.total || 0) + entradas) * 100) / 100;

      // Calcular percentuais (protegido contra divisão por zero)
      const pctSemana = limites.limite_semanal > 0 ? Math.round((entradas / limites.limite_semanal) * 10000) / 100 : 0;
      const pctMes = limites.limite_mensal > 0 ? Math.round((acumuladoMensal / limites.limite_mensal) * 10000) / 100 : 0;
      const pctAno = limites.limite_anual > 0 ? Math.round((acumuladoAnual / limites.limite_anual) * 10000) / 100 : 0;

      // Classificar status e gerar diagnóstico
      const semConfig = cfgRows.length === 0;
      const status = semConfig ? 'aguardando_atualizacao' : classificarStatusAcompanhamento(pctSemana, pctMes, pctAno);
      const diagnostico = gerarDiagnosticoAcompanhamento(
        pctSemana, pctMes, pctAno, status,
        limites.limite_semanal, limites.limite_mensal, limites.limite_anual,
        acumuladoMensal, acumuladoAnual
      );

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: semRows } = await client.query(
          `INSERT INTO acompanhamento_financeiro_semanal (
             empresa_id, ano, mes, numero_semana, semana_inicio, semana_fim,
             saldo_inicial, total_entradas, total_saidas, saldo_final, saldo_medio,
             limite_semanal_referencia, limite_mensal_referencia, limite_anual_referencia,
             acumulado_mensal, acumulado_anual,
             percentual_uso_semana, percentual_uso_mes, percentual_uso_ano,
             status, diagnostico, observacoes, criado_por
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
           ON CONFLICT (empresa_id, ano, mes, numero_semana) DO UPDATE SET
             semana_inicio = EXCLUDED.semana_inicio,
             semana_fim = EXCLUDED.semana_fim,
             saldo_inicial = EXCLUDED.saldo_inicial,
             total_entradas = EXCLUDED.total_entradas,
             total_saidas = EXCLUDED.total_saidas,
             saldo_final = EXCLUDED.saldo_final,
             saldo_medio = EXCLUDED.saldo_medio,
             limite_semanal_referencia = EXCLUDED.limite_semanal_referencia,
             limite_mensal_referencia = EXCLUDED.limite_mensal_referencia,
             limite_anual_referencia = EXCLUDED.limite_anual_referencia,
             acumulado_mensal = EXCLUDED.acumulado_mensal,
             acumulado_anual = EXCLUDED.acumulado_anual,
             percentual_uso_semana = EXCLUDED.percentual_uso_semana,
             percentual_uso_mes = EXCLUDED.percentual_uso_mes,
             percentual_uso_ano = EXCLUDED.percentual_uso_ano,
             status = EXCLUDED.status,
             diagnostico = EXCLUDED.diagnostico,
             observacoes = EXCLUDED.observacoes,
             updated_at = NOW()
           RETURNING *`,
          [
            empresa_id, ano, mes, numero_semana, semana_inicio, semana_fim,
            saldoIni, entradas, saidas, saldo_final, saldo_medio,
            limites.limite_semanal, limites.limite_mensal, limites.limite_anual,
            acumuladoMensal, acumuladoAnual,
            pctSemana, pctMes, pctAno,
            status, diagnostico, observacoes || null, colaboradorId,
          ]
        );
        const semanaId = semRows[0].id;

        // Saldos diários: apaga e reinsere
        await client.query('DELETE FROM acompanhamento_financeiro_saldos_diarios WHERE acompanhamento_id = $1', [semanaId]);
        for (const sd of (saldos_diarios as any[])) {
          const sdVal = Number(sd.saldo_dia);
          if (!Number.isFinite(sdVal)) continue;
          await client.query(
            `INSERT INTO acompanhamento_financeiro_saldos_diarios
               (acompanhamento_id, empresa_id, data_referencia, saldo_dia, criado_por)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (acompanhamento_id, data_referencia) DO UPDATE SET saldo_dia = EXCLUDED.saldo_dia`,
            [semanaId, empresa_id, sd.data_referencia, sdVal, colaboradorId]
          );
        }

        // Movimentações: apaga e reinsere
        await client.query('DELETE FROM acompanhamento_financeiro_movimentacoes WHERE acompanhamento_id = $1', [semanaId]);
        for (const mv of (movimentacoes as any[])) {
          const mvVal = Number(mv.valor);
          if (!Number.isFinite(mvVal) || mvVal <= 0) continue;
          if (!['entrada', 'saida'].includes(mv.tipo)) continue;
          await client.query(
            `INSERT INTO acompanhamento_financeiro_movimentacoes
               (acompanhamento_id, empresa_id, data_movimento, tipo, categoria, descricao, valor, comprovante_url, criado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [semanaId, empresa_id, mv.data_movimento, mv.tipo, mv.categoria || null, mv.descricao || null, mvVal, mv.comprovante_url || null, colaboradorId]
          );
        }

        await client.query('COMMIT');
        res.status(201).json({ ...semRows[0], id: semanaId });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[POST /api/acompanhamento-financeiro/semana]', err);
      res.status(500).json({ error: 'Erro ao salvar semana de acompanhamento.' });
    }
  });

  // PATCH /api/acompanhamento-financeiro/semana/:id/status
  app.patch('/api/acompanhamento-financeiro/semana/:id/status', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, observacoes } = req.body;
      const statusValidos = ['dentro_da_referencia','atencao_leve','atencao_media','incompativel','critico','sem_documentacao','aguardando_atualizacao','regularizado'];
      if (!statusValidos.includes(status)) { res.status(400).json({ error: 'Status inválido.' }); return; }
      const { rows } = await pool.query(
        `UPDATE acompanhamento_financeiro_semanal
            SET status = $2, observacoes = COALESCE($3, observacoes), updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, status, observacoes || null]
      );
      if (!rows.length) { res.status(404).json({ error: 'Registro não encontrado.' }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error('[PATCH /api/acompanhamento-financeiro/semana/:id/status]', err);
      res.status(500).json({ error: 'Erro ao atualizar status.' });
    }
  });

  // DELETE /api/acompanhamento-financeiro/semana/:id
  app.delete('/api/acompanhamento-financeiro/semana/:id', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const colaborador = (req as any).colaborador;
      const normC = (v?: string | null) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
      const isAdmin = ['admin','administrador','super_admin','superadmin','diretor'].includes(normC(colaborador?.cargo));
      if (!isAdmin) { res.status(403).json({ error: 'Apenas Administradores e Diretores podem excluir registros.' }); return; }
      const { rows } = await pool.query('DELETE FROM acompanhamento_financeiro_semanal WHERE id = $1 RETURNING id', [id]);
      if (!rows.length) { res.status(404).json({ error: 'Registro não encontrado.' }); return; }
      res.json({ success: true, id: rows[0].id });
    } catch (err) {
      console.error('[DELETE /api/acompanhamento-financeiro/semana/:id]', err);
      res.status(500).json({ error: 'Erro ao excluir registro.' });
    }
  });

  // ── ROTA: Calcular limites (preview sem salvar) ──────────────────────────────

  // POST /api/acompanhamento-financeiro/calcular-limites
  app.post('/api/acompanhamento-financeiro/calcular-limites', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const { faturamento_anual_declarado, percentual_operacional = 30, ano, mes } = req.body;
      const fat = Number(faturamento_anual_declarado);
      const pct = Number(percentual_operacional);
      const anoN = Number(ano) || new Date().getFullYear();
      const mesN = Number(mes) || (new Date().getMonth() + 1);
      if (!Number.isFinite(fat) || fat < 0) { res.status(400).json({ error: 'Faturamento inválido.' }); return; }
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) { res.status(400).json({ error: 'Percentual inválido.' }); return; }
      const limites = calcularLimitesAcompanhamento(fat, pct, anoN, mesN);
      res.json(limites);
    } catch (err) {
      console.error('[POST /api/acompanhamento-financeiro/calcular-limites]', err);
      res.status(500).json({ error: 'Erro ao calcular limites.' });
    }
  });

  // ── ROTA: Exportar PDF do relatório ─────────────────────────────────────────

  // POST /api/acompanhamento-financeiro/semana/:id/exportar-pdf
  app.post('/api/acompanhamento-financeiro/semana/:id/exportar-pdf', auth, requireAcessoFinanceiro, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT s.*,
                e.razao_social, e.cnpj, e.cidade, e.estado,
                c.faturamento_anual_declarado, c.percentual_operacional
           FROM acompanhamento_financeiro_semanal s
           JOIN empresas e ON e.id = s.empresa_id
           LEFT JOIN acompanhamento_financeiro_config c ON c.empresa_id = s.empresa_id
          WHERE s.id = $1
          LIMIT 1`,
        [id]
      );
      if (!rows.length) { res.status(404).json({ error: 'Registro não encontrado.' }); return; }
      const semana = rows[0];
      const { rows: movs } = await pool.query(
        `SELECT * FROM acompanhamento_financeiro_movimentacoes WHERE acompanhamento_id = $1 ORDER BY data_movimento ASC`,
        [id]
      );
      const { rows: saldos } = await pool.query(
        `SELECT * FROM acompanhamento_financeiro_saldos_diarios WHERE acompanhamento_id = $1 ORDER BY data_referencia ASC`,
        [id]
      );
      const colaborador = (req as any).colaborador;
      const geradoPor = colaborador?.nome || colaborador?.email || null;
      const html = gerarHtmlRelatorioFinanceiro({
        empresa: { razao_social: semana.razao_social, cnpj: semana.cnpj, cidade: semana.cidade, estado: semana.estado },
        config: {
          faturamento_anual_declarado: Number(semana.faturamento_anual_declarado) || 0,
          percentual_operacional: Number(semana.percentual_operacional) || 30,
          limite_anual: Number(semana.limite_anual_referencia) || 0,
        },
        semana: {
          ano: semana.ano, mes: semana.mes, numero_semana: semana.numero_semana,
          semana_inicio: semana.semana_inicio, semana_fim: semana.semana_fim,
          saldo_inicial: Number(semana.saldo_inicial) || 0,
          total_entradas: Number(semana.total_entradas) || 0,
          total_saidas: Number(semana.total_saidas) || 0,
          saldo_final: Number(semana.saldo_final) || 0,
          saldo_medio: Number(semana.saldo_medio) || 0,
          limite_semanal_referencia: Number(semana.limite_semanal_referencia) || 0,
          limite_mensal_referencia: Number(semana.limite_mensal_referencia) || 0,
          limite_anual_referencia: Number(semana.limite_anual_referencia) || 0,
          acumulado_mensal: Number(semana.acumulado_mensal) || 0,
          acumulado_anual: Number(semana.acumulado_anual) || 0,
          percentual_uso_semana: Number(semana.percentual_uso_semana) || 0,
          percentual_uso_mes: Number(semana.percentual_uso_mes) || 0,
          percentual_uso_ano: Number(semana.percentual_uso_ano) || 0,
          status: semana.status,
          diagnostico: semana.diagnostico,
          observacoes: semana.observacoes,
        },
        movimentacoes: movs,
        saldosDiarios: saldos,
        geradoPor,
      });
      const uploadsDir = path.resolve('uploads', 'acompanhamento-financeiro');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const fileName = `acomp-financeiro-${id}-${Date.now()}.pdf`;
      const filePath = path.join(uploadsDir, fileName);
      let browser: any;
      try {
        const puppeteer = await import('puppeteer-core');
        let executablePath: string;
        if (process.env.CHROMIUM_PATH) {
          executablePath = process.env.CHROMIUM_PATH;
        } else {
          try {
            const chromium = await import('@sparticuz/chromium');
            executablePath = await chromium.default.executablePath();
          } catch {
            executablePath = '/usr/bin/chromium-browser';
          }
        }
        browser = await puppeteer.default.launch({
          executablePath,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
          headless: true,
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({
          path: filePath,
          format: 'A4',
          printBackground: true,
          displayHeaderFooter: false,
          margin: { top: '6mm', bottom: '6mm', left: '0mm', right: '0mm' },
        });
      } finally {
        if (browser) await browser.close();
      }
      const nomeArquivo = `relatorio-financeiro-${semana.razao_social.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-sem${semana.numero_semana}-${semana.mes}-${semana.ano}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('end', () => { fs.unlink(filePath, () => {}); });
    } catch (err: any) {
      console.error('[POST /api/acompanhamento-financeiro/semana/:id/exportar-pdf]', err);
      res.status(500).json({ error: err.message || 'Erro ao gerar PDF.' });
    }
  });

  // ── FIM DO MÓDULO: ACOMPANHAMENTO FINANCEIRO SEMANAL ────────────────────────



  // Qualquer /api não encontrada deve responder JSON, nunca o index.html da SPA.
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      error: 'Rota API não encontrada',
      path: req.originalUrl,
    });
  });

  // ─── Static files ─────────────────────────────────────────────────────────
  const staticPath = process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "public")
    : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  app.get("*", (_req: Request, res: Response) => {
    const indexPath = path.join(staticPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Execute 'npm run build' para gerar os arquivos.");
    }
  });

  const port = Number(process.env.PORT) || 4000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`✅ Destrava Crédito v4.0 — http://0.0.0.0:${port}/`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔗 n8n: ${process.env.N8N_WEBHOOK_URL ? "✅ Configurado" : "⚠️ Não configurado"}`);
  });
}

startServer().catch(console.error);
