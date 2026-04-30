import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import pkg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { auth } from "./middleware/auth.ts";
import { authorize } from "./middleware/authorize.ts";
import { ETAPA_FUNIL_DEFAULT, ETAPAS_FUNIL_VALIDAS, normalizarEtapaFunil } from "../shared/funnel.ts";
import { gerarHtmlTimbrado, getPuppeteerHeaderTemplate, getPuppeteerFooterTemplate, getDocumentStyles, CONTRATADA_DADOS } from "./letterhead.ts";

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

      CREATE TABLE IF NOT EXISTS contratos_gerados (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id             UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
        parceiro_id            UUID REFERENCES parceiros_comerciais(id) ON DELETE SET NULL,
        lead_id                UUID REFERENCES leads(id) ON DELETE SET NULL,
        valor_referencia       NUMERIC(15, 2) NOT NULL,
        taxa_comissao          NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
        honorario_minimo_mes   NUMERIC(5, 2) NOT NULL DEFAULT 1.00,
        honorario_minimo_total NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
        data_assinatura        DATE NOT NULL,
        foro_eleito            TEXT NOT NULL,
        status                 TEXT NOT NULL DEFAULT 'gerado',
        pdf_path               TEXT,
        hash_documento         TEXT UNIQUE,
        payload_snapshot       JSONB NOT NULL,
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
  // ─────────────────────────────────────────────────────────────────────────────
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

      const { nome, cargo, ativo, senha, telefone, perfil, pode_atender_leads, pode_ver_todos_leads, chatwoot_agente_id } = req.body;

      // Se está tentando alterar o cargo, verifica se o novo cargo também é inferior
      if (cargo && !podeGerenciarCargo(cargoSolicitante, cargo)) {
        res.status(403).json({ error: `Você não pode atribuir o cargo "${cargo}" a este colaborador.` });
        return;
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const cargoFinal = cargo || cargoAlvo;
      if (nome) updates.nome = nome.trim();
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
        if (!leadId && nomeContato && telefone) {
          const cleanPhone = telefone.replace(/\D/g, '');
          const r = await pool.query(
            `INSERT INTO leads (nome, telefone, origem, status, etapa_funil, temperatura, canal_origem, tipo_registro, chatwoot_conv_id, responsavel_id)
             VALUES ($1, $2, 'chatwoot', 'entrada', 'entrada', 'frio', 'whatsapp', 'lead', $3, $4)
             RETURNING id`,
            [nomeContato, cleanPhone, parseInt(chatwootConvId), agenteResponsavelId]
          );
          leadId = r.rows[0].id;
          console.log(`[WEBHOOK] Lead criado automaticamente: ${leadId}`);
        }

        if (leadId && agenteResponsavelId) {
          await pool.query(
            `UPDATE leads
                SET responsavel_id = $2,
                    updated_at = NOW()
              WHERE id = $1`,
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

  async function gerarHtmlContrato(payload: any): Promise<string> {
    const { contratante, parceiro, contrato } = payload;

    // CONTRATADA sempre é a Destrava
    const contratada = CONTRATADA_DADOS;

    const temParceiro = parceiro && parceiro.nome;
    const vigenciaMeses = contrato.vigencia_meses || 12;
    const comissaoPct   = contrato.taxa_comissao || 10;
    const honorMinMes   = contrato.honorario_minimo_mes || 1;
    const honorMinTotal = contrato.honorario_minimo_total || 12;
    const valorRef      = contrato.valor_referencia_formatado || 'R$ 0,00';
    const valorRefNum   = contrato.valor_referencia_str || '0,00';
    const foro          = contrato.foro_eleito || 'Taguatinga';
    const dataAss       = contrato.data_assinatura_formatada || '';
    const cidadeAss     = contrato.cidade_assinatura || 'BRASÍLIA – DF';
    const pctMulta      = contrato.percentual_multa || 10;
    const pctMultaExtenso = pctMulta === 10 ? 'dez' : pctMulta === 5 ? 'cinco' : pctMulta === 15 ? 'quinze' : pctMulta === 20 ? 'vinte' : pctMulta === 25 ? 'vinte e cinco' : String(pctMulta);

    const body = `
<h1 class="doc-title">CONTRATO DE ANÁLISE DOCUMENTAL PARA ACESSO A LINHA DE CRÉDITO</h1>

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

<p class="clause"><strong>Cláusula 4</strong> - A CONTRATADA fará jus a comissão de <strong>${comissaoPct}% (${comissaoPct === 10 ? 'dez' : comissaoPct} por cento)</strong> sobre qualquer valor efetivamente liberado em favor da CONTRATANTE, no prazo de até 12 meses da entrega do relatório inicial. A CONTRATANTE compromete-se a comunicar qualquer operação de crédito aprovada e contratada dentro do período de vigência deste contrato e a fornecer cópia do contrato, comprovante de liberação e/ou extrato bancário correspondente.</p>

<p class="clause"><strong>4.1</strong> - A comissão deverá ser paga pela CONTRATANTE à CONTRATADA no prazo máximo de 1 (um) dia útil após a liberação do crédito, mediante transferência bancária para conta informada pela CONTRATADA.</p>

<p class="clause"><strong>4.2</strong> - A CONTRATADA declara, que não realiza, direta ou indiretamente, qualquer tipo de pagamento, vantagem indevida, comissão oculta ou propina, seja a servidores públicos, agentes privados ou terceiros, sendo vedada qualquer prática que contrarie a legislação anticorrupção vigente (Lei nº 12.846/2013 e demais normas aplicáveis).</p>

<p class="clause"><strong>4.3</strong> - Fica estabelecido que, caso a CONTRATANTE não contrate operações de crédito em valor igual ou superior a <strong>${valorRef}</strong> no período de vigência do contrato, 12 (doze) meses, por motivos causados por ela, será devido à CONTRATADA, a título de honorário mínimo garantido, o valor de <strong>${honorMinMes}% (um por cento) por mês</strong>, totalizando <strong>${honorMinTotal}% (doze por cento)</strong> ao final do contrato de 12 (doze) meses, independente da sua renovação.</p>

<p class="clause"><strong>PARÁGRAFO ÚNICO - CAUSAS DE IMPEDIMENTO A CRÉDITO POR PARTE DA CONTRATANTE</strong><br>
As causas de impedimento a crédito por parte da CONTRATANTE são: 1 – Apontamento, direto ou indireto (replicação) de restrição financeira, fiscal ou de simples protesto, inclusive em grupo econômico e cônjuge. 2 – Rating Bacen diferente de C, B ou A. 3 – Movimentação bancária inferior à declarada no faturamento bruto e quando exigido na declaração de imposto de renda. 4 – Anotação de apontamento de fraude documental ou ideológica no Banco Central. 5 – Mudança de endereço da sede empresarial sem comunicação prévia. 6 – Falta de comprovação de endereço da sede ou endereço divergente ao registrado nos órgãos competentes.</p>

<p class="clause"><strong>4.4</strong> - O valor do honorário mínimo poderá ser cobrado integralmente ao final do contrato, ou em parcelas mensais, conforme acordo entre as partes.</p>

<p class="clause"><strong>4.5</strong> - Caso a CONTRATANTE venha a contratar operações de crédito que, somadas, ultrapassem o valor de <strong>${valorRef}</strong> durante a vigência do contrato, 12 (doze) meses, a CONTRATADA renunciará ao recebimento do honorário mínimo, mantendo-se exclusivamente o direito à comissão de ${comissaoPct}% sobre o valor contratado.</p>

<h2 class="section-title">VI – CONFIDENCIALIDADE</h2>

<p class="clause"><strong>Cláusula 5</strong> - A CONTRATADA compromete-se a manter em absoluto sigilo todas as informações e documentos recebidos da CONTRATANTE, não os utilizando para qualquer outro fim que não a execução do presente contrato, exceto quando exigido por lei ou ordem judicial.</p>

${temParceiro ? `<p class="clause"><strong>5.1</strong> - O PARCEIRO COMERCIAL, quando autorizado pela CONTRATANTE a ter acesso às informações, compromete-se igualmente a manter sigilo absoluto sobre todos os dados e documentos relacionados ao presente contrato.</p>` : ''}

<h2 class="section-title">VII – RESCISÃO</h2>

<p class="clause"><strong>Cláusula 6</strong> - A CONTRATANTE poderá rescindir este contrato até a entrega pela CONTRATADA do relatório de análise dos documentos apresentados, mediante pagamento de 1% (um por cento) do valor informado na Cláusula 1.1, pelos serviços de análise documental, já prestados.</p>

<p class="clause"><strong>6.1</strong> - Na ausência do pagamento pelos serviços já prestados pela CONTRATADA à CONTRATANTE, deve a CONTRATADA entender automaticamente, que é o interesse da CONTRATANTE, seguir de forma IRREVOGÁVEL e IRRETRATÁVEL as cláusulas deste contrato, sob a isenção de cobrança do pagamento de 1% (um por cento), referente ao relatório de análise dos documentos apresentados.</p>

<h2 class="section-title">VIII – CLÁUSULA PENAL POR INADIMPLÊNCIA</h2>

<p class="clause"><strong>Cláusula 7</strong> - Fica estabelecida uma Cláusula Penal em favor da CONTRATADA, aplicável na hipótese de inadimplência da CONTRATANTE em relação aos contratos de crédito obtidos com o suporte dos serviços objeto deste instrumento.</p>

<p class="clause"><strong>7.1</strong> - A Cláusula Penal será acionada caso a CONTRATANTE atrase o pagamento de 3 (três) parcelas consecutivas ou 5 (cinco) parcelas alternadas do contrato de crédito obtido junto à instituição financeira.</p>

<p class="clause"><strong>7.2</strong> - O valor da multa será de ${pctMulta}% (${pctMultaExtenso} por cento) sobre o valor total do crédito contratado pela CONTRATANTE junto à instituição financeira, a ser pago à CONTRATADA no prazo de 10 (dez) dias úteis após a notificação da inadimplência.</p>

<p class="clause"><strong>7.3</strong> - A aplicação desta Cláusula Penal não impede a CONTRATADA de buscar outras medidas legais cabíveis para a recuperação de quaisquer valores devidos, incluindo, mas não se limitando, aos honorários e comissões previstos na Cláusula 4.</p>

<h2 class="section-title">IX – DO FORO E CONDIÇÕES GERAIS</h2>

<p class="clause">Para dirimir quaisquer controvérsias oriundas do CONTRATO, as partes elegem o foro da Circunscrição Judiciária de <strong>${foro}</strong>.</p>

<p class="clause">Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias de igual teor.</p>

<p class="city-date"><strong>${cidadeAss}, ${dataAss}.</strong></p>

<div class="sig-block">
  <p><strong>CONTRATANTE:</strong></p>
  <div class="sig-line"></div>
  <p class="sig-name">${contratante.razao_social}</p>

  ${temParceiro ? `
  <p style="margin-top:28px;"><strong>PARCEIRO COMERCIAL:</strong></p>
  <div class="sig-line"></div>
  <p class="sig-name">${parceiro.nome} - CPF n° ${parceiro.cpf}</p>
  ` : ''}

  <p style="margin-top:28px;"><strong>CONTRATADA:</strong></p>
  <div class="sig-line"></div>
  <p class="sig-name">DESTRAVA CRÉDITO LTDA - CNPJ n° ${contratada.cnpj}</p>
</div>

<div class="page-break"></div>

<div class="sig-block">
  <p style="margin-bottom:6px;"><strong>TESTEMUNHA 1:</strong></p>
  <div class="sig-line"></div>

  <p style="margin-top:40px;margin-bottom:6px;"><strong>TESTEMUNHA 2:</strong></p>
  <div class="sig-line"></div>
</div>
`;

    return gerarHtmlTimbrado(body, 'CONTRATO DE ANÁLISE DOCUMENTAL');
  }


  // ─── HTML PREVISÃO DE FATURAMENTO (papel timbrado) ─────────────────────────
  function gerarHtmlPrevisaoFaturamento(payload: {
    empresa: { razao_social: string; cnpj?: string };
    horizonte_meses: number;
    modelo_usado: string;
    gerada_em: string;
    capacidade_pgto_min: number;
    capacidade_pgto_max: number;
    historico: { competencia: string; valor: number }[];
    previsoes: { ds: string; yhat: number; yhat_lower: number; yhat_upper: number }[];
    chartImageBase64?: string;
    contador?: { nome: string; crc: string; cpf?: string; nome_escritorio?: string; cnpj_escritorio?: string; cidade_escritorio?: string; uf_escritorio?: string } | null;
  }): string {
    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

    const tabelaHistorico = payload.historico.map(r => `
      <tr>
        <td>${fmtDate(r.competencia)}</td>
        <td style="text-align:right">${fmt(r.valor)}</td>
        <td style="text-align:center; color:#1B3A6B; font-weight:bold">Histórico</td>
      </tr>`).join('');

    const tabelaPrevisao = payload.previsoes.map(r => `
      <tr>
        <td>${fmtDate(r.ds)}</td>
        <td style="text-align:right; font-weight:bold">${fmt(r.yhat)}</td>
        <td style="text-align:right; color:#666; font-size:9pt">${fmt(r.yhat_lower)} – ${fmt(r.yhat_upper)}</td>
      </tr>`).join('');

    const body = `
<h1 class="doc-title">RELATÓRIO DE PREVISÃO DE FATURAMENTO</h1>
<h1 class="doc-title" style="font-size:11pt; font-weight:normal; margin-bottom:24px;">Análise Preditiva com Inteligência Artificial — ${payload.horizonte_meses} meses</h1>

<table class="data-table" style="margin-bottom:20px">
  <tr>
    <th style="width:50%">Empresa</th>
    <th style="width:25%">Modelo IA</th>
    <th style="width:25%">Gerado em</th>
  </tr>
  <tr>
    <td><strong>${payload.empresa.razao_social}</strong>${payload.empresa.cnpj ? ' — CNPJ: ' + payload.empresa.cnpj : ''}</td>
    <td style="text-align:center">${payload.modelo_usado.toUpperCase()}</td>
    <td style="text-align:center">${new Date(payload.gerada_em).toLocaleDateString('pt-BR')}</td>
  </tr>
</table>

<div style="display:flex; gap:16px; margin-bottom:20px;">
  <div class="highlight-box" style="flex:1">
    <div class="label">Capacidade de Pagamento Mínima (15%)</div>
    <div class="value">${fmt(payload.capacidade_pgto_min)}<span style="font-size:10pt; font-weight:normal">/mês</span></div>
  </div>
  <div class="highlight-box" style="flex:1">
    <div class="label">Capacidade de Pagamento Máxima (25%)</div>
    <div class="value">${fmt(payload.capacidade_pgto_max)}<span style="font-size:10pt; font-weight:normal">/mês</span></div>
  </div>
</div>

${payload.chartImageBase64 ? `
<div class="chart-container">
  <img src="${payload.chartImageBase64}" alt="Gráfico de Previsão" style="max-width:100%; border:1px solid #ddd; border-radius:4px;" />
</div>` : ''}

<h2 class="section-title" style="margin-top:20px;">Histórico de Faturamento</h2>
<table class="data-table">
  <thead>
    <tr>
      <th>Competência</th>
      <th style="text-align:right">Faturamento</th>
      <th style="text-align:center">Tipo</th>
    </tr>
  </thead>
  <tbody>
    ${tabelaHistorico}
  </tbody>
</table>

<h2 class="section-title" style="margin-top:20px;">Previsão para os Próximos ${payload.horizonte_meses} Meses</h2>
<table class="data-table">
  <thead>
    <tr>
      <th>Competência</th>
      <th style="text-align:right">Previsão Central</th>
      <th style="text-align:right">Intervalo de Confiança</th>
    </tr>
  </thead>
  <tbody>
    ${tabelaPrevisao}
  </tbody>
</table>

<p style="margin-top:16px; font-size:9pt; color:#666; font-style:italic;">
  <strong>Nota:</strong> Este relatório foi gerado automaticamente pelo sistema Destrava Crédito com base nos dados históricos fornecidos pela empresa. 
  Os valores de previsão são estimativas estatísticas e não constituem garantia de resultado. 
  O intervalo de confiança representa a faixa de variação esperada com 95% de probabilidade.
</p>

<p class="city-date" style="margin-top:24px;">Brasília – DF, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.</p>

${payload.contador ? `
<div style="margin-top:40px; display:flex; justify-content:space-between; align-items:flex-end;">
  <div style="text-align:center; width:45%;">
    <div style="border-top:1px solid #333; padding-top:8px;">
      <p style="font-size:10pt; font-weight:bold; margin:2px 0;">${payload.contador.nome}</p>
      <p style="font-size:9pt; margin:2px 0;">CRC: ${payload.contador.crc}</p>
      ${payload.contador.cpf ? `<p style="font-size:9pt; margin:2px 0;">CPF: ${payload.contador.cpf}</p>` : ''}
      ${payload.contador.nome_escritorio ? `<p style="font-size:9pt; margin:2px 0; color:#555;">${payload.contador.nome_escritorio}</p>` : ''}
      ${payload.contador.cnpj_escritorio ? `<p style="font-size:9pt; margin:2px 0; color:#555;">CNPJ: ${payload.contador.cnpj_escritorio}</p>` : ''}
      ${(payload.contador.cidade_escritorio || payload.contador.uf_escritorio) ? `<p style="font-size:9pt; margin:2px 0; color:#555;">${[payload.contador.cidade_escritorio, payload.contador.uf_escritorio].filter(Boolean).join(' – ')}</p>` : ''}
    </div>
  </div>
  <div style="text-align:center; width:45%;">
    <img src="https://destravacredito.com/logo-destrava.png" alt="Destrava Crédito" style="height:40px; margin-bottom:8px;" onerror="this.style.display='none'"/>
    <div style="border-top:1px solid #333; padding-top:8px;">
      <p style="font-size:10pt; font-weight:bold; margin:2px 0;">DESTRAVA CRÉDITO LTDA</p>
      <p style="font-size:9pt; margin:2px 0;">CNPJ: 35.427.182/0001-66</p>
      <p style="font-size:9pt; margin:2px 0; color:#555;">Responsável Técnico</p>
    </div>
  </div>
</div>
` : `
<div style="margin-top:40px; text-align:center;">
  <img src="https://destravacredito.com/logo-destrava.png" alt="Destrava Crédito" style="height:40px; margin-bottom:8px;" onerror="this.style.display='none'"/>
  <div style="border-top:1px solid #333; width:280px; margin:0 auto; padding-top:8px;">
    <p style="font-size:10pt; font-weight:bold; margin:2px 0;">DESTRAVA CRÉDITO LTDA</p>
    <p style="font-size:9pt; margin:2px 0;">CNPJ: 35.427.182/0001-66</p>
  </div>
</div>
`}
`;

    return gerarHtmlTimbrado(body, 'RELATÓRIO DE PREVISÃO DE FATURAMENTO');
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

<p class="city-date" style="margin-top:24px;">Brasília – DF, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.</p>

<div class="signature-block">
  <p>Consultor Responsável:</p>
  <div class="signature-line"></div>
  <p class="signature-label">DESTRAVA CRÉDITO LTDA — CNPJ nº 35.427.182/0001-66</p>
</div>
`;

    return gerarHtmlTimbrado(body, 'PROPOSTA DE CRÉDITO');
  }

  // ─── HTML CONTRATO LIMPA NOME (papel timbrado) ──────────────────────────────
  async function gerarHtmlContratoLimpaNome(payload: any): Promise<string> {
    const { contratante, contrato } = payload;
    const contratada = CONTRATADA_DADOS;
    const valorContrato   = contrato.valor_contrato_formatado || 'R$ 0,00';
    const condicaoPgto    = contrato.condicao_pagamento || 'a combinar';
    const prazoEntrega    = contrato.prazo_entrega_dias || 30;
    const prazoGarantia   = contrato.prazo_garantia_meses || 6;
    const foro            = contrato.foro_eleito || 'Taguatinga';
    const dataAss         = contrato.data_assinatura_formatada || new Date().toLocaleDateString('pt-BR');
    const cidadeAss       = contrato.cidade_assinatura || 'BRASÍLIA – DF';
    const taxaConsulta    = contrato.taxa_consulta_serasa || 'R$ 50,00';
    const taxaReprotocolo = contrato.taxa_reprotocolo || 'R$ 300,00';
    const isPJ = !!contratante.cnpj;
    const endContratante  = contratante.endereco || contratante.domicilio || '';

    const body = `
<h1 class="doc-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ASSESSORIA JURÍDICA</h1>
<h1 class="doc-title" style="font-size:10pt; font-weight:normal; margin-bottom:20px;">PARA NÃO EXPOSIÇÃO DE RESTRIÇÕES</h1>

<h2 class="section-title">QUADRO RESUMIDO</h2>
<table class="data-table" style="margin-bottom:20px;">
  <tr><td style="width:40%; font-weight:bold; background:#f0f4ff;">CONTRATADA</td><td>${contratada.razao_social} — CNPJ: ${contratada.cnpj}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Endereço</td><td>${contratada.endereco_sede}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">CONTRATANTE</td><td>${contratante.nome || contratante.razao_social}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">${isPJ ? 'CNPJ' : 'CPF'}</td><td>${isPJ ? contratante.cnpj : contratante.cpf}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Domicílio</td><td>${endContratante}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Valor do Contrato</td><td><strong>${valorContrato}</strong></td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Condição de Pagamento</td><td>${condicaoPgto}</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Prazo de Entrega</td><td>Até ${prazoEntrega} dias corridos</td></tr>
  <tr><td style="font-weight:bold; background:#f0f4ff;">Prazo Total de Garantia</td><td>${prazoGarantia} meses</td></tr>
</table>

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

<div class="sig-block" style="display:flex; justify-content:space-between; margin-top:40px;">
  <div style="text-align:center; width:45%;">
    <div class="sig-line"></div>
    <p class="sig-name">${contratante.nome || contratante.razao_social}</p>
    <p class="sig-sub">${isPJ ? 'CNPJ: ' + contratante.cnpj : 'CPF: ' + contratante.cpf}</p>
    <p class="sig-sub">CONTRATANTE</p>
  </div>
  <div style="text-align:center; width:45%;">
    <div class="sig-line"></div>
    <p class="sig-name">${contratada.razao_social}</p>
    <p class="sig-sub">CNPJ: ${contratada.cnpj}</p>
    <p class="sig-sub">CONTRATADA</p>
  </div>
</div>
`;

    return gerarHtmlTimbrado(body, 'CONTRATO LIMPA NOME');
  }

    async function gerarPdfContrato(payload: any): Promise<string> {
    const uploadsDir = path.resolve('uploads', 'contratos');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const html = await gerarHtmlContrato(payload);
    const fileName = `contrato-${crypto.randomUUID()}.pdf`;
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
        displayHeaderFooter: true,
        headerTemplate: getPuppeteerHeaderTemplate(),
        footerTemplate: getPuppeteerFooterTemplate(),
        margin: { top: '34mm', bottom: '26mm', left: '20mm', right: '20mm' },
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
  app.post('/api/faturamento/previsao/:id/exportar-pdf', auth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { chartImageBase64, contador_id } = req.body || {};

      // Buscar dados do contador se informado
      let contadorData: any = null;
      if (contador_id) {
        const { rows: cRows } = await pool.query('SELECT * FROM contadores WHERE id=$1', [contador_id]);
        if (cRows.length) {
          const c = cRows[0];
          contadorData = { nome: c.nome, crc: c.crc, cpf: c.cpf, nome_escritorio: c.nome_escritorio, cnpj_escritorio: c.cnpj_escritorio, cidade_escritorio: c.cidade_escritorio, uf_escritorio: c.uf_escritorio };
        }
      }

      // Buscar previsão
      const { rows: prevRows } = await pool.query(
        `SELECT pf.*, e.razao_social, e.cnpj,
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
      const pontos: any[] = prev.payload_completo || [];
      const historico = pontos.filter((p: any) => p.is_historico).map((p: any) => ({
        competencia: p.ds,
        valor: p.yhat,
      }));
      const previsoes = pontos.filter((p: any) => !p.is_historico);

      const htmlPayload = {
        empresa: { razao_social: prev.razao_social, cnpj: prev.cnpj },
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
          displayHeaderFooter: true,
          headerTemplate: getPuppeteerHeaderTemplate(),
          footerTemplate: getPuppeteerFooterTemplate(),
          margin: { top: '34mm', bottom: '26mm', left: '20mm', right: '20mm' },
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

  // ─── DECLARAÇÃO ANUAL DE FATURAMENTO ────────────────────────────────────
  app.post('/api/faturamento/declaracao-anual/:empresaId/exportar-pdf', auth, async (req: Request, res: Response) => {
    try {
      const { empresaId } = req.params;
      const { contador_id } = req.body;

      // Buscar dados da empresa
      const { rows: empRows } = await pool.query('SELECT * FROM empresas WHERE id=$1', [empresaId]);
      if (empRows.length === 0) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
      const empresa = empRows[0];

      // Buscar histórico de faturamento
      const { rows: histRows } = await pool.query(
        `SELECT competencia, valor, origem FROM faturamento_historico
         WHERE empresa_id=$1 ORDER BY competencia ASC`,
        [empresaId]
      );
      if (histRows.length === 0) {
        res.status(422).json({ error: 'Nenhum histórico de faturamento encontrado para esta empresa.' });
        return;
      }

      // Buscar contador (opcional)
      let contador: any = null;
      if (contador_id) {
        const { rows: cRows } = await pool.query('SELECT * FROM contadores WHERE id=$1', [contador_id]);
        if (cRows.length > 0) contador = cRows[0];
      }

      // Calcular totais por ano
      const porAno: Record<string, { total: number; meses: { competencia: string; valor: number }[] }> = {};
      for (const r of histRows) {
        const ano = new Date(r.competencia).getFullYear().toString();
        if (!porAno[ano]) porAno[ano] = { total: 0, meses: [] };
        porAno[ano].total += parseFloat(r.valor);
        porAno[ano].meses.push({ competencia: r.competencia, valor: parseFloat(r.valor) });
      }

      const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const formatMes = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      const tabelaAnos = Object.entries(porAno).map(([ano, dados]) => `
        <div class="ano-bloco">
          <h3 class="ano-titulo">Exercício ${ano}</h3>
          <table class="tabela-faturamento">
            <thead><tr><th>Competência</th><th>Faturamento</th></tr></thead>
            <tbody>
              ${dados.meses.map(m => `<tr><td>${formatMes(m.competencia)}</td><td class="valor">${formatBRL(m.valor)}</td></tr>`).join('')}
              <tr class="total-row"><td><strong>Total ${ano}</strong></td><td class="valor"><strong>${formatBRL(dados.total)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      `).join('');

      const totalGeral = histRows.reduce((s: number, r: any) => s + parseFloat(r.valor), 0);
      const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

      const bodyHtml = `
        <div class="declaracao-header">
          <h2>DECLARAÇÃO DE FATURAMENTO</h2>
          <p class="subtitulo">Documento emitido para fins de comprovação de capacidade financeira</p>
        </div>

        <div class="empresa-info">
          <table class="info-table">
            <tr><td class="label">Razão Social:</td><td>${empresa.razao_social || '—'}</td></tr>
            <tr><td class="label">CNPJ:</td><td>${empresa.cnpj || '—'}</td></tr>
            ${empresa.endereco ? `<tr><td class="label">Endereço:</td><td>${empresa.endereco}</td></tr>` : ''}
          </table>
        </div>

        <div class="historico-section">
          <h3>Histórico de Faturamento</h3>
          ${tabelaAnos}
          <div class="total-geral">
            <strong>Total Geral do Período: ${formatBRL(totalGeral)}</strong>
          </div>
        </div>

        <div class="declaracao-texto">
          <p>Declaro, para os devidos fins, que as informações de faturamento acima são verdadeiras e correspondem aos registros contábeis da empresa ${empresa.razao_social || ''}, inscrita no CNPJ sob o nº ${empresa.cnpj || ''}.</p>
          <p>Brasília, ${dataHoje}.</p>
        </div>

        <div style="margin-top:40px; display:flex; justify-content:space-between; align-items:flex-end;">
          ${contador ? `
          <div style="text-align:center; width:45%;">
            <div style="border-top:1px solid #333; padding-top:8px;">
              <p style="font-size:10pt; font-weight:bold; margin:2px 0;">${contador.nome}</p>
              <p style="font-size:9pt; margin:2px 0;">CRC: ${contador.crc}</p>
              ${contador.cpf ? `<p style="font-size:9pt; margin:2px 0;">CPF: ${contador.cpf}</p>` : ''}
              ${contador.nome_escritorio ? `<p style="font-size:9pt; margin:2px 0; color:#555;">${contador.nome_escritorio}</p>` : ''}
              ${contador.cnpj_escritorio ? `<p style="font-size:9pt; margin:2px 0; color:#555;">CNPJ: ${contador.cnpj_escritorio}</p>` : ''}
              ${(contador.cidade_escritorio || contador.uf_escritorio) ? `<p style="font-size:9pt; margin:2px 0; color:#555;">${[contador.cidade_escritorio, contador.uf_escritorio].filter(Boolean).join(' – ')}</p>` : ''}
            </div>
          </div>
          ` : '<div style="width:45%;"></div>'}
          <div style="text-align:center; width:45%;">
            <img src="https://destravacredito.com/logo-destrava.png" alt="Destrava Crédito" style="height:40px; margin-bottom:8px;" onerror="this.style.display='none'"/>
            <div style="border-top:1px solid #333; padding-top:8px;">
              <p style="font-size:10pt; font-weight:bold; margin:2px 0;">DESTRAVA CRÉDITO LTDA</p>
              <p style="font-size:9pt; margin:2px 0;">CNPJ: 35.427.182/0001-66</p>
            </div>
          </div>
        </div>

        <style>
          .declaracao-header { text-align: center; margin-bottom: 24px; }
          .declaracao-header h2 { font-size: 18px; font-weight: 700; color: #1B3A6B; text-transform: uppercase; letter-spacing: 1px; }
          .subtitulo { font-size: 12px; color: #666; margin-top: 4px; }
          .empresa-info { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 16px; margin-bottom: 24px; }
          .info-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .info-table td { padding: 4px 8px; }
          .info-table .label { font-weight: 600; color: #1B3A6B; width: 140px; }
          .historico-section h3 { font-size: 14px; font-weight: 700; color: #1B3A6B; margin-bottom: 12px; }
          .ano-bloco { margin-bottom: 20px; }
          .ano-titulo { font-size: 13px; font-weight: 700; color: #333; margin-bottom: 8px; border-bottom: 2px solid #C9A227; padding-bottom: 4px; }
          .tabela-faturamento { width: 100%; border-collapse: collapse; font-size: 12px; }
          .tabela-faturamento th { background: #1B3A6B; color: white; padding: 8px 12px; text-align: left; }
          .tabela-faturamento td { padding: 6px 12px; border-bottom: 1px solid #e9ecef; }
          .tabela-faturamento .valor { text-align: right; font-family: monospace; }
          .total-row td { background: #f0f4ff; font-weight: 700; }
          .total-geral { text-align: right; font-size: 14px; margin-top: 12px; padding: 10px 12px; background: #1B3A6B; color: white; border-radius: 4px; }
          .declaracao-texto { margin-top: 24px; font-size: 12px; color: #333; line-height: 1.6; }
          .declaracao-texto p { margin-bottom: 8px; }
          .assinatura-section { margin-top: 40px; text-align: center; }
          .linha-assinatura { border-top: 1px solid #333; width: 280px; margin: 0 auto 8px; }
          .assinatura-section p { font-size: 12px; margin: 2px 0; }
        </style>
      `;

      const htmlFinal = gerarHtmlTimbrado(bodyHtml, 'Declaração de Faturamento');
      const fileName = `declaracao-${crypto.randomUUID()}.pdf`;
      const uploadsDir = path.resolve('uploads', 'declaracoes');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filePath = path.join(uploadsDir, fileName);

      let browser2;
      try {
        const puppeteer2 = await import('puppeteer-core');
        let executablePath2: string;
        if (process.env.CHROMIUM_PATH) {
          executablePath2 = process.env.CHROMIUM_PATH;
        } else {
          try {
            const chromium2 = await import('@sparticuz/chromium');
            executablePath2 = await chromium2.default.executablePath();
          } catch {
            executablePath2 = '/usr/bin/chromium-browser';
          }
        }
        browser2 = await puppeteer2.default.launch({
          executablePath: executablePath2,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
          headless: true,
        });
        const page2 = await browser2.newPage();
        await page2.setContent(htmlFinal, { waitUntil: 'networkidle0' });
        await page2.pdf({
          path: filePath,
          format: 'A4',
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: getPuppeteerHeaderTemplate(),
          footerTemplate: getPuppeteerFooterTemplate(),
          margin: { top: '34mm', bottom: '26mm', left: '20mm', right: '20mm' },
        });
      } finally {
        if (browser2) await (browser2 as any).close();
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="declaracao-faturamento-${empresa.razao_social?.replace(/[^a-zA-Z0-9]/g, '-') || 'empresa'}.pdf"`);
      const stream2 = fs.createReadStream(filePath);
      stream2.pipe(res);
      stream2.on('end', () => { fs.unlink(filePath, () => {}); });
    } catch (err) {
      console.error('[POST /api/faturamento/declaracao-anual]', err);
      res.status(500).json({ error: 'Erro ao gerar declaração anual' });
    }
  });

  // ─── PARCEIROS COMERCIAIS ────────────────────────────────────────────────
  app.get('/api/parceiros', auth, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM parceiros_comerciais WHERE ativo = true ORDER BY nome'
      );
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/parceiros]', err);
      res.status(500).json({ error: 'Erro ao listar parceiros' });
    }
  });

  app.post('/api/parceiros', auth, async (req: Request, res: Response) => {
    try {
      const { nome, cpf, email, telefone } = req.body;
      if (!nome || !cpf) {
        res.status(400).json({ error: 'Nome e CPF são obrigatórios' });
        return;
      }
      const { rows } = await pool.query(
        `INSERT INTO parceiros_comerciais (nome, cpf, email, telefone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cpf) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email
         RETURNING *`,
        [nome.trim(), cpf.replace(/\D/g, ''), email || null, telefone || null]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[POST /api/parceiros]', err);
      res.status(500).json({ error: 'Erro ao criar parceiro' });
    }
  });

  // ─── CONTRATOS GERADOS ───────────────────────────────────────────────────

  app.post('/api/contratos/gerar', auth, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as any).colaborador;
      const {
        tipo_contrato = 'assessoria',
        empresa_id, parceiro_id, lead_id,
        // campos contrato assessoria
        valor_referencia, taxa_comissao = 10, percentual_multa = 10,
        // campos contrato limpa nome
        cliente_id, cliente_tipo, // 'empresa' ou 'lead'
        valor_contrato, condicao_pagamento, prazo_entrega_dias = 30,
        prazo_garantia_meses = 6, taxa_consulta_serasa, taxa_reprotocolo,
        // campos comuns
        data_assinatura, foro_eleito,
      } = req.body;

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

        // Buscar contratante: pode ser empresa (PJ) ou lead (PF)
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
          res.status(400).json({ error: 'Informe cliente_tipo (empresa/lead) e o respectivo ID' });
          return;
        }

        const payloadLN = {
          contratante: contratanteData,
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

        const htmlLN = await gerarHtmlContratoLimpaNome(payloadLN);
        const uploadsDir2 = path.resolve('uploads', 'contratos');
        if (!fs.existsSync(uploadsDir2)) fs.mkdirSync(uploadsDir2, { recursive: true });
        const fileNameLN = `contrato-limpa-nome-${crypto.randomUUID()}.pdf`;
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
          await page2.pdf({ path: filePathLN, format: 'A4', printBackground: true, margin: { top: '35mm', bottom: '28mm', left: '20mm', right: '20mm' }, displayHeaderFooter: true, headerTemplate: getPuppeteerHeaderTemplate(), footerTemplate: getPuppeteerFooterTemplate() });
        } finally {
          if (browser2) await (browser2 as any).close();
        }
        pdfPath = filePathLN;

        const hash2 = await calcularHashArquivo(pdfPath);
        const { rows: contratoRows2 } = await pool.query(
          `INSERT INTO contratos_gerados (empresa_id, parceiro_id, lead_id, valor_referencia, taxa_comissao, honorario_minimo_mes, honorario_minimo_total, data_assinatura, foro_eleito, pdf_path, hash_documento, payload_snapshot, criado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, created_at`,
          [empresa_id || null, parceiro_id || null, cliente_id || null, valor_contrato, 0, 0, 0, data_assinatura, foro_eleito, pdfPath, hash2, JSON.stringify(payloadLN), colaborador.id]
        );
        const contrato2 = contratoRows2[0];
        res.status(201).json({ success: true, contrato_id: contrato2.id, pdf_url: `/uploads/contratos/${path.basename(pdfPath)}`, hash_documento: hash2, created_at: contrato2.created_at });
        return;
      }

      // ── CONTRATO DE ASSESSORIA (padrão) ─────────────────────────────────────
      if (!empresa_id || !valor_referencia) {
        res.status(400).json({ error: 'Campos obrigatórios: empresa_id, valor_referencia, data_assinatura, foro_eleito' });
        return;
      }
      if (valor_referencia < 1000) {
        res.status(400).json({ error: 'Valor de referência mínimo é R$ 1.000,00' });
        return;
      }

      const { rows: empresaRows } = await pool.query('SELECT * FROM empresas WHERE id = $1', [empresa_id]);
      if (!empresaRows.length) {
        res.status(404).json({ error: 'Empresa não encontrada' });
        return;
      }
      const empresa = empresaRows[0];

      let parceiro = null;
      if (parceiro_id) {
        const { rows: parceiroRows } = await pool.query(
          'SELECT * FROM parceiros_comerciais WHERE id = $1',
          [parceiro_id]
        );
        parceiro = parceiroRows[0] || null;
      }

      const payload = {
        contratada: CONTRATADA,
        contratante: {
          razao_social: empresa.razao_social,
          cnpj: empresa.cnpj || '',
          endereco: [empresa.logradouro, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado]
            .filter(Boolean).join(', '),
          representante: empresa.responsavel_nome || '',
          cpf_representante: empresa.responsavel_cpf || '',
        },
        parceiro: parceiro ? { nome: parceiro.nome, cpf: parceiro.cpf } : null,
        contrato: {
          valor_referencia: parseFloat(valor_referencia),
          valor_referencia_formatado: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor_referencia),
          taxa_comissao: parseFloat(taxa_comissao),
          percentual_multa: parseFloat(percentual_multa),
          honorario_minimo_mes: 1,
          honorario_minimo_total: 12,
          data_assinatura,
          data_assinatura_formatada: new Date(data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'long', year: 'numeric'
          }),
          foro_eleito,
          vigencia_meses: 12,
        },
      };

      pdfPath = await gerarPdfContrato(payload);
      const hash = await calcularHashArquivo(pdfPath);

      const { rows: contratoRows } = await pool.query(
        `INSERT INTO contratos_gerados
           (empresa_id, parceiro_id, lead_id, valor_referencia, taxa_comissao,
            honorario_minimo_mes, honorario_minimo_total, data_assinatura,
            foro_eleito, pdf_path, hash_documento, payload_snapshot, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, created_at`,
        [
          empresa_id, parceiro_id || null, lead_id || null,
          valor_referencia, taxa_comissao, 1, 12,
          data_assinatura, foro_eleito, pdfPath, hash,
          JSON.stringify(payload), colaborador.id,
        ]
      );

      const contrato = contratoRows[0];
      const pdfUrl = `/uploads/contratos/${path.basename(pdfPath)}`;

      res.status(201).json({
        success: true,
        contrato_id: contrato.id,
        pdf_url: pdfUrl,
        hash_documento: hash,
        created_at: contrato.created_at,
      });
    } catch (err) {
      console.error('[POST /api/contratos/gerar]', err);
      res.status(500).json({ error: 'Erro ao gerar contrato' });
    }
  });

  app.get('/api/contratos/:id/download', auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT pdf_path, empresa_id FROM contratos_gerados WHERE id = $1',
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
      res.setHeader('Content-Disposition', `attachment; filename="contrato-${req.params.id}.pdf"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error('[GET /api/contratos/:id/download]', err);
      res.status(500).json({ error: 'Erro ao fazer download do contrato' });
    }
  });

  app.get('/api/contratos/empresa/:empresaId', auth, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT cg.*, pc.nome as parceiro_nome
         FROM contratos_gerados cg
         LEFT JOIN parceiros_comerciais pc ON pc.id = cg.parceiro_id
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

  // Servir arquivos de contratos gerados
  app.use('/uploads/contratos', express.static(path.resolve('uploads', 'contratos')));

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
