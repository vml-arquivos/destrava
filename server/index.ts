import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Supabase (backend service role) ────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const supabaseReady = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);
if (!supabaseReady) {
  console.warn("[Supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas. Persistência desativada.");
}

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

  // CORS — restrito ao domínio de produção
  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowedOrigins = [
      "https://destrava.permupay.com.br",
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

  // ─── Middleware de autenticação admin ──────────────────────────────────────
  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const adminKey = req.headers["x-admin-key"];
    if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  }

  // ─── Health check ──────────────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "3.0.0",
      n8n_configured: !!process.env.N8N_WEBHOOK_URL,
      supabase_configured: supabaseReady,
    });
  });

  // ─── LEADS API ─────────────────────────────────────────────────────────────
  app.post("/api/leads", async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const lead = {
        nome: req.body.nome || "",
        email: req.body.email || null,
        telefone: req.body.telefone || "",
        empresa: req.body.empresa || null,
        cpf_cnpj: req.body.cpfCnpj || null,
        tipo_pessoa: req.body.tipoPessoa || "pf",
        produto: req.body.produto || null,
        valor_solicitado: Number(req.body.valorSolicitado) || null,
        prazo: Number(req.body.prazo) || null,
        mensagem: req.body.mensagem || null,
        origem: req.body.origem || "site",
        status: "novo",
        n8n_notificado: false,
        created_at: now,
        updated_at: now,
      };

      let leadId = `local-${Date.now()}`;

      if (supabaseReady) {
        const { data, error } = await supabase.from("leads").insert(lead).select("id").single();
        if (error) {
          console.error("[LEAD] Erro Supabase:", error.message);
        } else {
          leadId = data.id;
          console.log(`[LEAD] Salvo no Supabase: ${lead.nome} — ${lead.produto}`);
        }
      }

      dispararN8n("novo_lead", {
        id: leadId, nome: lead.nome, telefone: lead.telefone,
        empresa: lead.empresa, email: lead.email, produto: lead.produto,
        valorSolicitado: lead.valor_solicitado, prazo: lead.prazo,
        origem: lead.origem, criadoEm: now,
      }).then(async (ok) => {
        if (ok && supabaseReady) {
          await supabase.from("leads").update({ n8n_notificado: true }).eq("id", leadId);
        }
      });

      res.status(201).json({ success: true, id: leadId, message: "Lead registrado com sucesso!" });
    } catch (err) {
      console.error("[LEAD ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao registrar lead." });
    }
  });

  app.get("/api/leads", requireAdmin, async (req: Request, res: Response) => {
    try {
      if (!supabaseReady) { res.json({ total: 0, leads: [], warning: "Supabase não configurado" }); return; }
      const status = req.query.status as string | undefined;
      let query = supabase.from("leads").select("*").order("created_at", { ascending: false });
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      res.json({ total: data?.length ?? 0, leads: data ?? [] });
    } catch (err) {
      console.error("[LEADS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar leads." });
    }
  });

  app.patch("/api/leads/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      if (!supabaseReady) { res.status(503).json({ error: "Supabase não configurado" }); return; }
      const { data, error } = await supabase
        .from("leads")
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;
      res.json({ success: true, lead: data });
    } catch (err) {
      console.error("[LEAD PATCH ERROR]", err);
      res.status(500).json({ error: "Erro ao atualizar lead." });
    }
  });

  // ─── SIMULAÇÕES API ────────────────────────────────────────────────────────
  app.post("/api/simulacoes", async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const sim = {
        nome: req.body.nome || "",
        email: req.body.email || null,
        telefone: req.body.telefone || "",
        empresa: req.body.empresa || null,
        cpf_cnpj: req.body.cpfCnpj || null,
        tipo_pessoa: req.body.tipoPessoa || "pf",
        produto: req.body.produto || "",
        valor_solicitado: Number(req.body.valorSolicitado) || 0,
        prazo: Number(req.body.prazo) || 0,
        taxa_aplicada: Number(req.body.taxaEstimada) || null,
        parcela_mensal: Number(req.body.parcelaMensal) || null,
        total_pagar: Number(req.body.totalPagar) || null,
        origem: "simulador_publico",
        n8n_notificado: false,
        created_at: now,
      };

      let simId = `local-${Date.now()}`;

      if (supabaseReady) {
        const { data, error } = await supabase.from("simulacoes_publicas").insert(sim).select("id").single();
        if (error) {
          console.error("[SIM] Erro Supabase:", error.message);
        } else {
          simId = data.id;
        }
      }

      dispararN8n("nova_simulacao", {
        id: simId, nome: sim.nome, telefone: sim.telefone,
        empresa: sim.empresa, email: sim.email, produto: sim.produto,
        valorSolicitado: sim.valor_solicitado, prazo: sim.prazo,
        parcelaMensal: sim.parcela_mensal, custoTotal: sim.total_pagar, criadoEm: now,
      });

      res.status(201).json({ success: true, id: simId, message: "Simulação registrada!" });
    } catch (err) {
      console.error("[SIM ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao registrar simulação." });
    }
  });

  app.get("/api/simulacoes", requireAdmin, async (_req: Request, res: Response) => {
    try {
      if (!supabaseReady) { res.json({ total: 0, simulacoes: [] }); return; }
      const { data, error } = await supabase
        .from("simulacoes_publicas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ total: data?.length ?? 0, simulacoes: data ?? [] });
    } catch (err) {
      console.error("[SIMS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar simulações." });
    }
  });

  // ─── CONTATO API ───────────────────────────────────────────────────────────
  app.post("/api/contato", async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const contato = {
        nome: req.body.nome || "",
        email: req.body.email || "",
        telefone: req.body.telefone || null,
        assunto: req.body.assunto || "",
        mensagem: req.body.mensagem || "",
        status: "novo",
        created_at: now,
      };

      if (supabaseReady) {
        const { error } = await supabase.from("contatos").insert(contato);
        if (error) console.error("[CONTATO] Erro Supabase:", error.message);
        else console.log(`[CONTATO] Salvo: ${contato.nome} — ${contato.assunto}`);
      }

      dispararN8n("novo_contato", {
        nome: contato.nome, email: contato.email, telefone: contato.telefone,
        assunto: contato.assunto, mensagem: contato.mensagem, criadoEm: now,
      });

      res.status(201).json({ success: true, message: "Mensagem enviada com sucesso!" });
    } catch (err) {
      console.error("[CONTATO ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao enviar mensagem." });
    }
  });

  app.get("/api/contatos", requireAdmin, async (_req: Request, res: Response) => {
    try {
      if (!supabaseReady) { res.json({ total: 0, contatos: [] }); return; }
      const { data, error } = await supabase
        .from("contatos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ total: data?.length ?? 0, contatos: data ?? [] });
    } catch (err) {
      console.error("[CONTATOS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar contatos." });
    }
  });

  // ─── ESTATÍSTICAS API ──────────────────────────────────────────────────────
  app.get("/api/stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      if (!supabaseReady) {
        res.json({
          leads: { total: 0, byStatus: {}, byProduto: {} },
          simulacoes: { total: 0, totalValorSimulado: 0, totalCustoSimulado: 0 },
          contatos: { total: 0 },
          n8n: { configured: !!process.env.N8N_WEBHOOK_URL },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const [leadsRes, simsRes, contatosRes] = await Promise.all([
        supabase.from("leads").select("status, produto, valor_solicitado"),
        supabase.from("simulacoes_publicas").select("valor_solicitado, total_pagar"),
        supabase.from("contatos").select("id", { count: "exact", head: true }),
      ]);

      const leads = leadsRes.data ?? [];
      const sims = simsRes.data ?? [];

      const byStatus = leads.reduce((acc: Record<string, number>, l) => {
        acc[l.status] = (acc[l.status] || 0) + 1;
        return acc;
      }, {});

      const byProduto = leads.reduce((acc: Record<string, number>, l) => {
        if (l.produto) acc[l.produto] = (acc[l.produto] || 0) + 1;
        return acc;
      }, {});

      res.json({
        leads: { total: leads.length, byStatus, byProduto },
        simulacoes: {
          total: sims.length,
          totalValorSimulado: sims.reduce((s, r) => s + (r.valor_solicitado || 0), 0),
          totalCustoSimulado: sims.reduce((s, r) => s + (r.total_pagar || 0), 0),
        },
        contatos: { total: contatosRes.count ?? 0 },
        n8n: { configured: !!process.env.N8N_WEBHOOK_URL },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[STATS ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar estatísticas." });
    }
  });

  // ─── n8n WEBHOOK CONFIG API ────────────────────────────────────────────────
  app.get("/api/n8n/status", requireAdmin, (_req: Request, res: Response) => {
    res.json({
      configured: !!process.env.N8N_WEBHOOK_URL,
      webhookUrl: process.env.N8N_WEBHOOK_URL ? "***configurado***" : null,
      eventos: ["novo_lead", "nova_simulacao", "novo_contato"],
    });
  });

  app.post("/api/n8n/test", requireAdmin, async (_req: Request, res: Response) => {
    const ok = await dispararN8n("teste_webhook", {
      mensagem: "Teste de integração Destrava Crédito → n8n",
      ambiente: process.env.NODE_ENV || "development",
    });
    res.json({ success: ok, message: ok ? "Webhook enviado com sucesso!" : "Falha ao enviar webhook. Verifique a URL." });
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

  // Porta 4000 — não conflita com Chatwoot (3000) na mesma VPS
  const port = Number(process.env.PORT) || 4000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`✅ Destrava Crédito v3.0 — http://0.0.0.0:${port}/`);
    console.log(`🗄️  Supabase: ${supabaseReady ? "✅ Configurado" : "⚠️ Não configurado"}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔗 n8n: ${process.env.N8N_WEBHOOK_URL ? "✅ Configurado" : "⚠️ Não configurado"}`);
  });
}

startServer().catch(console.error);
