import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import pkg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { auth } from "./middleware/auth.ts";
import { authorize } from "./middleware/authorize.ts";
import { ETAPA_FUNIL_DEFAULT, ETAPAS_FUNIL_VALIDAS, normalizarEtapaFunil } from "../shared/funnel.ts";

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
      `SELECT id FROM empresas WHERE regexp_replace(cnpj, '\D', '', 'g') = $1 LIMIT 1`,
      [cleanCnpj]
    );
    if (res.rows.length > 0) return res.rows[0].id;
  }

  if (cleanPhone) {
    const res = await client.query(
      `SELECT id FROM empresas 
       WHERE lower(trim(razao_social)) = lower($1) 
       AND regexp_replace(telefone, '\D', '', 'g') = $2 LIMIT 1`,
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

function normalizarStatusConversaChatwoot(
  status: string | null | undefined
): 'aberta' | 'fechada' | 'pendente_ia' | 'escalada_humano' {
  const statusNormalizado = String(status || '').toLowerCase();

  if (statusNormalizado === 'resolved' || statusNormalizado === 'resolvida' || statusNormalizado === 'closed') {
    return 'fechada';
  }

  if (statusNormalizado === 'pending' || statusNormalizado === 'snoozed') {
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
      const { lead_id, etapa_funil } = req.body;
      const etapaNormalizada = validarEtapaFunil(etapa_funil);

      if (!etapaFunilPermitida(etapa_funil)) {
        res.status(400).json({ error: "Etapa do funil inválida." });
        return;
      }

      const colaborador = (req as Request & { colaborador: any }).colaborador;
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
                status = $1,
                responsavel_id = COALESCE(responsavel_id, $2),
                ultimo_contato_em = NOW(),
                updated_at = NOW()
          WHERE id = $3`,
        [etapaNormalizada, responsavelFinal, lead_id]
      );

      if (atuais[0]?.etapa_funil !== etapaNormalizada) {
        await registrarCrmLog({
          leadId: lead_id,
          usuarioId: colaborador?.id || null,
          acao: `mudanca_etapa:${atuais[0]?.etapa_funil || 'sem_etapa'}->${etapaNormalizada}`,
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
    } catch (err) {
      console.error("[POST /api/crm/mover-funil]", err);
      res.status(500).json({ error: "Erro ao mover lead" });
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
      res.json(result.rows);
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
  app.post("/api/webhook/chatwoot", auth, authorize(["Administrador"]), async (req: Request, res: Response) => {
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
           VALUES ($1, 'whatsapp', $2, 'aberta', $3, $4, $5, $6, $7, CASE WHEN $6 IS NOT NULL THEN NOW() ELSE NULL END, NOW(), $8)
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
          const novoStatus = payload?.conversation?.status === 'resolved' ? 'resolvida' : 'aberta';
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
