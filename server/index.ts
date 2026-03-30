import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import pkg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

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

// ─── App ─────────────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));

  // CORS — origens permitidas via variável de ambiente (sem hardcode)
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
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,x-admin-key");
    if (req.method === "OPTIONS") { res.sendStatus(200); return; }
    next();
  });

  // ─── Middleware admin (x-admin-key) ──────────────────────────────────────
  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const adminKey = req.headers["x-admin-key"];
    if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  }

    // ─── Middleware que aceita JWT OU admin-key (para rotas de gestão de usuários) ────
  function requireJwtOrAdmin(req: Request, res: Response, next: NextFunction) {
    // Tenta JWT primeiro
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as any;
        (req as Request & { colaborador: any }).colaborador = decoded;
        return next();
      } catch { /* cai para admin-key */ }
    }
    // Fallback: admin-key (para scripts e n8n)
    const adminKey = req.headers["x-admin-key"];
    if (process.env.ADMIN_KEY && adminKey === process.env.ADMIN_KEY) {
      (req as Request & { colaborador: any }).colaborador = { id: 'admin', email: 'admin', nome: 'Admin', cargo: 'Admin' };
      return next();
    }
    res.status(401).json({ error: "Unauthorized" });
  }

  // ─── Middleware JWT (Bearer token) ────────────────────────────────────
  function requireJwt(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token não fornecido" });
      return;
    }
    try {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET!);
      (req as Request & { colaborador: unknown }).colaborador = decoded;
      next();
    } catch {
      res.status(401).json({ error: "Token inválido ou expirado" });
    }
  }

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
        "SELECT id, email, nome, cargo, senha_hash, ativo FROM colaboradores WHERE email = $1",
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
      const token = jwt.sign(
        { id: user.id, email: user.email, nome: user.nome, cargo: user.cargo },
        process.env.JWT_SECRET!,
        { expiresIn: "24h" }
      );
      console.log(`[LOGIN] Colaborador autenticado: ${user.nome} (${user.email})`);
      const colaboradorData = { id: user.id, email: user.email, nome: user.nome, cargo: user.cargo, ativo: user.ativo };
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
  // POST /api/leads — aceita tanto payload público (camelCase) quanto painel interno (snake_case)
  app.post("/api/leads", async (req: Request, res: Response) => {
    try {
      const b = req.body;
      const now = new Date().toISOString();
      // Normaliza campos: suporta camelCase (público) e snake_case (painel interno)
      const nome         = b.nome || "";
      const email        = b.email || null;
      const telefone     = b.telefone || "";
      const empresa      = b.empresa || null;
      const cpf_cnpj     = b.cpf_cnpj || b.cpfCnpj || null;
      // Normaliza tipo_pessoa: aceita "empresa" (frontend público) → "pj" (schema DB)
      const rawTipo      = b.tipo_pessoa || b.tipoPessoa || "pf";
      const tipo_pessoa  = rawTipo === "empresa" ? "pj" : rawTipo;
      const produto      = b.produto_interesse || b.produto || null;
      const valor        = Number(b.valor_solicitado || b.valorSolicitado || b.valorDesejado) || null;
      const prazo        = Number(b.prazo_meses || b.prazo || b.parcelas) || null;
      const finalidade   = b.finalidade || b.mensagem || null;
      const origem       = b.origem || "site";
      const status_lead  = b.status || "novo";
      const etapa_funil  = b.etapa_funil || "novo";
      const temperatura  = b.temperatura || "frio";
      const score_ia     = Number(b.score_ia) || 0;
      const cidade       = b.cidade || null;
      const estado       = b.estado || null;
      const observacoes_ia    = b.observacoes_ia || null;
      const proximo_followup  = b.proximo_followup || null;
      // UTM — capturados para o payload n8n mas gravados apenas se a coluna existir no banco
      // O banco atual (validado em produção) não tem essas colunas ainda.
      // Elas são passadas ao n8n via payload sem precisar estar no INSERT.
      const utm_source   = b.utm_source   || null;
      const utm_medium   = b.utm_medium   || null;
      const utm_campaign = b.utm_campaign || null;
      const pagina_origem = b.pagina || b.pagina_origem || null;

      // INSERT com exatamente 20 colunas e 20 valores ($1..$19, $19 reutilizado para updated_at)
      // Colunas confirmadas no banco real (diagnóstico 30/03/2026)
      const { rows } = await pool.query(
        `INSERT INTO leads
          (nome, email, telefone, empresa, cpf_cnpj, tipo_pessoa, produto_interesse,
           valor_solicitado, prazo_meses, finalidade, origem, status, etapa_funil,
           temperatura, score_ia, cidade, estado, observacoes_ia, proximo_followup,
           created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)
         RETURNING *`,
        [
          nome, email, telefone, empresa, cpf_cnpj, tipo_pessoa, produto,
          valor, prazo, finalidade, origem, status_lead, etapa_funil,
          temperatura, score_ia, cidade, estado, observacoes_ia, proximo_followup,
          now,
        ]
      );
      const lead = rows[0];
      console.log(`[LEAD] Salvo: ${nome} — ${produto || origem}`);

      // Payload canônico — alinhado com especificação Destrava v2
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
        // Compatível com payload legado (campos na raiz)
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

      // Retorna o lead completo para que o frontend possa atualizar a lista localmente
      res.status(201).json(lead);
    } catch (err) {
      console.error("[LEAD ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao registrar lead." });
    }
  });

  // GET /api/leads — aceita JWT (painel interno) ou admin-key (scripts/n8n)
  // Retorna { leads: [...], total: N } para o Dashboard (admin-key) e array direto para o painel (JWT)
  app.get("/api/leads", requireJwtOrAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const params: string[] = [];
      let where = "";
      if (status) { params.push(status); where = `WHERE status = $1`; }
      const { rows } = await pool.query(
        `SELECT * FROM leads ${where} ORDER BY created_at DESC`,
        params
      );
      // Retorna shape compatível com ambos os consumidores:
      // Dashboard (admin-key) usa data.leads; Clientes.tsx (JWT) usa array direto
      // Enviamos ambos para máxima compatibilidade
      const isAdmin = !req.headers.authorization && req.headers["x-admin-key"];
      if (isAdmin) {
        res.json({ leads: rows, total: rows.length });
      } else {
        res.json(rows);
      }
    } catch (err) {
      console.error("[LEADS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar leads." });
    }
  });

  // PATCH /api/leads/:id — aceita JWT (CRM) ou admin-key
  app.patch("/api/leads/:id", requireJwtOrAdmin, async (req: Request, res: Response) => {
    try {
      const fields = { ...req.body, updated_at: new Date().toISOString() };
      const keys = Object.keys(fields);
      const values = Object.values(fields);
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `UPDATE leads SET ${set} WHERE id = $${keys.length + 1} RETURNING *`,
        [...values, req.params.id]
      );
      res.json({ success: true, lead: rows[0] });
    } catch (err) {
      console.error("[LEAD PATCH ERROR]", err);
      res.status(500).json({ error: "Erro ao atualizar lead." });
    }
  });

  // ─── SIMULAÇÕES API ────────────────────────────────────────────────────────
  // NOTA: POST /api/simulacoes público foi REMOVIDO — era handler legado nunca chamado pelo frontend.
  // O frontend público (SimuladorPublico.tsx, CapturaLead.tsx) usa POST /api/leads.
  // As rotas /api/simulacoes com requireJwt (abaixo) são as corretas para o painel interno.

  // GET /api/admin/simulacoes-publicas — lista leads do simulador público (admin-key)
  app.get("/api/admin/simulacoes-publicas", requireAdmin, async (_req: Request, res: Response) => {
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

  // ─── CONTATO API ────────────────────────────────────────────────────────────
  app.post("/api/contato", async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const { rows } = await pool.query(
        `INSERT INTO leads
          (nome, email, telefone, finalidade, origem, status, etapa_funil,
           temperatura, score_ia, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'contato_site','novo','novo','frio',0,$5,$5)
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

  app.get("/api/contatos", requireAdmin, async (_req: Request, res: Response) => {
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

  // ─── ESTATÍSTICAS API ──────────────────────────────────────────────────────
  // GET /api/stats — aceita JWT (Dashboard) ou admin-key (scripts externos)
  app.get("/api/stats", requireJwtOrAdmin, async (_req: Request, res: Response) => {
    try {
      const [leadsRes, simsRes, contatosRes] = await Promise.all([
        pool.query("SELECT status, produto_interesse, valor_solicitado FROM leads"),
        pool.query("SELECT valor_solicitado FROM leads WHERE origem = 'simulador_publico'"),
        pool.query("SELECT COUNT(*) FROM leads WHERE origem = 'contato_site'"),
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
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[STATS ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar estatísticas." });
    }
  });

  // ─── COLABORADORES API ────────────────────────────────────────────────────
  app.post("/api/colaboradores", requireJwtOrAdmin, async (req: Request, res: Response) => {
    try {
      const { nome, email, cargo, senha } = req.body;
      if (!nome || !email || !cargo || !senha) {
        res.status(400).json({ error: "Campos obrigatórios: nome, email, cargo, senha" });
        return;
      }
      const senhaHash = await bcrypt.hash(senha, 12);
      const { rows } = await pool.query(
        `INSERT INTO colaboradores (nome, email, cargo, senha_hash, ativo)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [nome.trim(), email.trim().toLowerCase(), cargo, senhaHash]
      );
      const userId = rows[0].id;
      console.log(`[COLAB] Colaborador criado: ${nome} (${email})`);
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

  app.get("/api/colaboradores", requireJwtOrAdmin, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        "SELECT id, email, nome, cargo, ativo, criado_em FROM colaboradores ORDER BY nome"
      );
      res.json(rows);
    } catch (err) {
      console.error("[COLAB GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar colaboradores." });
    }
  });

  app.patch("/api/colaboradores/:id", requireJwtOrAdmin, async (req: Request, res: Response) => {
    try {
      const { nome, cargo, ativo, senha } = req.body;
      const updates: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
      if (nome) updates.nome = nome.trim();
      if (cargo) updates.cargo = cargo;
      if (ativo !== undefined) updates.ativo = ativo;
      if (senha) updates.senha_hash = await bcrypt.hash(senha, 12);
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `UPDATE colaboradores SET ${set} WHERE id = $${keys.length + 1} RETURNING id, nome, email, cargo, ativo`,
        [...values, req.params.id]
      );
      res.json({ success: true, colaborador: rows[0] });
    } catch (err) {
      console.error("[COLAB PATCH ERROR]", err);
      res.status(500).json({ error: "Erro ao atualizar colaborador." });
    }
  });

  // ─── n8n WEBHOOK CONFIG API ────────────────────────────────────────────────
  app.get("/api/n8n/status", requireJwtOrAdmin, (_req: Request, res: Response) => {
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

  app.post("/api/n8n/test", requireJwtOrAdmin, async (_req: Request, res: Response) => {
    const ok = await dispararN8n("teste_webhook", {
      mensagem: "Teste de integração Destrava Crédito → n8n",
      ambiente: process.env.NODE_ENV || "development",
    });
    res.json({ success: ok, message: ok ? "Webhook enviado com sucesso!" : "Falha ao enviar webhook. Verifique a URL." });
  });

  // ─── GET /api/me — Obter dados do usuário logado ───────────────────────────
  app.get("/api/me", requireJwt, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const result = await pool.query(
        "SELECT id, email, nome, cargo, ativo FROM colaboradores WHERE id = $1",
        [colaborador.id]
      );
      const user = result.rows[0];
      if (!user) {
        res.status(404).json({ error: "Usuário não encontrado" });
        return;
      }
      res.json(user);
    } catch (err) {
      console.error("[GET /api/me]", err);
      res.status(500).json({ error: "Erro ao obter usuário" });
    }
  });

  // ─── POST /api/simulacoes — Salvar simulação do colaborador ────────────────
  app.post("/api/simulacoes", requireJwt, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const now = new Date().toISOString();
      
      const { rows } = await pool.query(
        `INSERT INTO simulacoes_colaborador
          (colaborador_id, cliente_nome, cliente_telefone, cliente_cpf_cnpj,
           valor_solicitado, quantidade_parcelas, taxa_juros_mensal, comissao_percentual,
           total_comissao, valor_parcela, valor_total_pagar, total_juros,
           custo_efetivo_total, imposto_percentual, total_imposto,
           banco, linha_credito, observacoes, status, criado_em, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'rascunho',$19,$19)
         RETURNING id`,
        [
          colaborador.id,
          req.body.cliente_nome || "",
          req.body.cliente_telefone || null,
          req.body.cliente_cpf_cnpj || null,
          req.body.valor_solicitado || null,
          req.body.quantidade_parcelas || null,
          req.body.taxa_juros_mensal || null,
          req.body.comissao_percentual || null,
          req.body.total_comissao || null,
          req.body.valor_parcela || null,
          req.body.valor_total_pagar || null,
          req.body.total_juros || null,
          req.body.custo_efetivo_total || null,
          req.body.imposto_percentual || null,
          req.body.total_imposto || null,
          req.body.banco || null,
          req.body.linha_credito || null,
          req.body.observacoes || null,
          now,
        ]
      );
      
      const simId = rows[0].id;
      console.log(`[SIMULACAO] Salva para colaborador ${colaborador.id}: ${req.body.cliente_nome}`);
      
      res.status(201).json({ success: true, id: simId, message: "Simulação salva com sucesso!" });
    } catch (err) {
      console.error("[POST /api/simulacoes]", err);
      res.status(500).json({ error: "Erro ao salvar simulação" });
    }
  });

  // ─── GET /api/simulacoes — Listar simulações do colaborador ────────────────
  app.get("/api/simulacoes", requireJwt, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const result = await pool.query(
        "SELECT * FROM simulacoes_colaborador WHERE colaborador_id = $1 ORDER BY criado_em DESC",
        [colaborador.id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/simulacoes]", err);
      res.status(500).json({ error: "Erro ao listar simulações" });
    }
  });

  // ─── PATCH /api/simulacoes/:id — Atualizar simulação ──────────────────────
  app.patch("/api/simulacoes/:id", requireJwt, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      
      // Verificar se a simulação pertence ao colaborador
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

  // ─── DELETE /api/simulacoes/:id — Deletar simulação ───────────────────────
  app.delete("/api/simulacoes/:id", requireJwt, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      
      // Verificar se a simulação pertence ao colaborador
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

  // ─── DELETE /api/leads/:id — Deletar lead ────────────────────────────────
  app.delete("/api/leads/:id", requireJwt, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM leads WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/leads/:id]", err);
      res.status(500).json({ error: "Erro ao deletar lead" });
    }
  });

   // ─── POST /api/crm/atividades — Criar atividade ──────────────────────
  app.post("/api/crm/atividades", requireJwt, async (req: Request, res: Response) => {
    try {
      const colaborador = (req as Request & { colaborador: any }).colaborador;
      const { lead_id, tipo, titulo, descricao, resultado, origem_ia } = req.body;
      // titulo é obrigatório no schema CRM; usa descricao como fallback para compatibilidade
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

  // ─── GET /api/crm/atividades — Listar atividades ──────────────────────────
  app.get("/api/crm/atividades", requireJwt, async (req: Request, res: Response) => {
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

  // ─── POST /api/crm/documentos — Criar documento ──────────────────────
  app.post("/api/crm/documentos", requireJwt, async (req: Request, res: Response) => {
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

  // ─── GET /api/crm/documentos — Listar documentos ──────────────────────────
  app.get("/api/crm/documentos", requireJwt, async (req: Request, res: Response) => {
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

  // ─── PATCH /api/crm/documentos/:id — Atualizar documento ─────────────────
  app.patch("/api/crm/documentos/:id", requireJwt, async (req: Request, res: Response) => {
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

  // ─── POST /api/crm/qualificacoes — Criar qualificação IA ──────────────────
  app.post("/api/crm/qualificacoes", requireJwt, async (req: Request, res: Response) => {
    try {
      const { lead_id, score, temperatura, etapa_sugerida, resumo, proxima_acao,
              pontos_positivos, pontos_atencao, documentos_faltando, probabilidade_conv,
              recomendacao, analise } = req.body;
      const now = new Date().toISOString();
      // Suporta tanto o schema novo (schema_crm.sql) quanto o legado
      const result = await pool.query(
        `INSERT INTO crm_qualificacoes_ia
          (lead_id, score, temperatura, etapa_sugerida, resumo, proxima_acao,
           pontos_positivos, pontos_atencao, documentos_faltando, probabilidade_conv, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          lead_id,
          score || 0,
          temperatura || 'frio',
          etapa_sugerida || recomendacao || 'novo',
          resumo || analise || '',
          proxima_acao || null,
          pontos_positivos || [],
          pontos_atencao || [],
          documentos_faltando || [],
          probabilidade_conv || null,
          now,
        ]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[POST /api/crm/qualificacoes]", err);
      res.status(500).json({ error: "Erro ao criar qualificação" });
    }
  });

  // ─── GET /api/crm/qualificacoes — Listar qualificações ────────────────────
  app.get("/api/crm/qualificacoes", requireJwt, async (req: Request, res: Response) => {
    try {
      const { lead_id } = req.query;
      let query = "SELECT * FROM crm_qualificacoes_ia";
      const params: any[] = [];
      
      if (lead_id) {
        query += " WHERE lead_id = $1";
        params.push(lead_id);
      }
      query += " ORDER BY created_at DESC LIMIT 10";
      
      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/qualificacoes]", err);
      res.status(500).json({ error: "Erro ao listar qualificações" });
    }
  });

  // ─── POST /api/crm/mover-funil — Mover lead no funil ──────────────────────
  app.post("/api/crm/mover-funil", requireJwt, async (req: Request, res: Response) => {
    try {
      const { lead_id, etapa_funil } = req.body;
      await pool.query(
        "UPDATE leads SET etapa_funil = $1, updated_at = NOW() WHERE id = $2",
        [etapa_funil, lead_id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("[POST /api/crm/mover-funil]", err);
      res.status(500).json({ error: "Erro ao mover lead" });
    }
  });

  // ─── GET /api/crm/pipeline — Obter leads completos para o kanban (usa view) ────
  app.get("/api/crm/pipeline", requireJwt, async (_req: Request, res: Response) => {
    try {
      // Tenta usar a view vw_crm_pipeline (schema CRM completo)
      // Fallback para tabela leads simples se a view não existir
      let result;
      try {
        result = await pool.query(`SELECT * FROM vw_crm_pipeline ORDER BY created_at DESC LIMIT 500`);
      } catch {
        result = await pool.query(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 500`);
      }
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/pipeline]", err);
      res.status(500).json({ error: "Erro ao obter pipeline" });
    }
  });

  // ─── GET /api/crm/pipeline/metricas — Métricas agrupadas por etapa ──────────
  app.get("/api/crm/pipeline/metricas", requireJwt, async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT etapa_funil, COUNT(*) as total, SUM(valor_solicitado) as valor_total
         FROM leads WHERE etapa_funil IS NOT NULL
         GROUP BY etapa_funil ORDER BY etapa_funil`
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[GET /api/crm/pipeline/metricas]", err);
      res.status(500).json({ error: "Erro ao obter métricas do pipeline" });
    }
  });

  // ─── PATCH /api/colaboradores/:id/toggle — Ativar/desativar colaborador ───
  app.patch("/api/colaboradores/:id/toggle", requireJwtOrAdmin, async (req: Request, res: Response) => {
    try {
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

  // ─── POST /api/admin/sql — Executar SQL (admin) ────────────────────────────
  app.post("/api/admin/sql", requireAdmin, async (req: Request, res: Response) => {
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

  // ─── POST /api/leads/:id/solicitar-pdf — Solicitar PDF por e-mail via n8n ────
  // Delega o envio ao n8n (que usa SMTP/Gmail configurado no workflow)
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
        // n8n não configurado ou falhou — informa sem quebrar o fluxo
        res.json({ success: false, message: "Envio por e-mail indisponível no momento. Use o botão de download direto." });
      }
    } catch (err) {
      console.error("[POST /api/leads/:id/solicitar-pdf]", err);
      res.status(500).json({ error: "Erro ao solicitar PDF" });
    }
  });

  // ─── PATCH /api/leads/:id/ia — Atualizar campos de IA no lead ─────────────
  // Rota dedicada para o copiloto IA atualizar score, probabilidades e recomendações
  app.patch("/api/leads/:id/ia", requireJwtOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        score_ia, probabilidade_aprovacao, probabilidade_conversao,
        proxima_acao_ia, linha_recomendada, prazo_aprovacao_estimado,
        analise_credito_ia, resumo_ia, observacoes_ia, temperatura,
      } = req.body;

      // Monta apenas os campos enviados (partial update seguro)
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

  // ─── GET /api/leads/para-ia — Leads que precisam de qualificação IA ─────────
  app.get("/api/leads/para-ia", requireJwtOrAdmin, async (_req: Request, res: Response) => {
    try {
      let result;
      try {
        result = await pool.query(`SELECT * FROM vw_leads_para_ia WHERE precisa_score = TRUE ORDER BY created_at DESC LIMIT 50`);
      } catch {
        // Fallback se a view ainda não foi criada no banco
        result = await pool.query(
          `SELECT id, nome, telefone, email, empresa, tipo_pessoa, produto_interesse,
                  valor_solicitado, prazo_meses, origem, etapa_funil, temperatura,
                  score_ia, resumo_ia, proxima_acao_ia, created_at
           FROM leads
           WHERE (score_ia = 0 OR score_ia IS NULL)
             AND etapa_funil NOT IN ('inativo','perdido','ganho')
           ORDER BY created_at DESC LIMIT 50`
        );
      }
      res.json({ total: result.rows.length, leads: result.rows });
    } catch (err) {
      console.error("[GET /api/leads/para-ia]", err);
      res.status(500).json({ error: "Erro ao buscar leads para IA" });
    }
  });

  // ─── Static files ──────────────────────────────────────────────────────────
  const staticPath =
    process.env.NODE_ENV === "production"
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
