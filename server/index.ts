import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Supabase (backend service role) — inicialização lazy ──────────────────
// IMPORTANTE: createClient() lança exceção se supabaseUrl for vazio (v2.100+).
// Por isso usamos inicialização lazy: o cliente só é criado quando as variáveis
// estiverem disponíveis, evitando crash no startup do container.
let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

const supabaseReady = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Alias para manter compatibilidade com o restante do código
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = new Proxy({} as any, {
  get(_target: unknown, prop: string | symbol) {
    const client = getSupabase();
    if (!client) throw new Error("[Supabase] Cliente não disponível — variáveis não configuradas.");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client as any)[prop];
  },
}) as ReturnType<typeof createClient>;

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
      // Colunas alinhadas ao schema real da tabela leads
      const lead = {
        nome: req.body.nome || "",
        email: req.body.email || null,
        telefone: req.body.telefone || "",
        empresa: req.body.empresa || null,
        cpf_cnpj: req.body.cpfCnpj || null,
        tipo_pessoa: req.body.tipoPessoa || "pf",
        produto_interesse: req.body.produto || null,   // coluna real: produto_interesse
        valor_solicitado: Number(req.body.valorSolicitado) || null,
        prazo_meses: Number(req.body.prazo) || null,   // coluna real: prazo_meses
        finalidade: req.body.mensagem || null,         // coluna real: finalidade (sem coluna 'mensagem')
        origem: req.body.origem || "site",
        status: "novo",
        etapa_funil: "Novo",
        temperatura: "frio",
        score_ia: 0,
        created_at: now,
        updated_at: now,
      };

      let leadId = `local-${Date.now()}`;

      if (supabaseReady) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("leads").insert(lead).select("id").single();
        if (error) {
          console.error("[LEAD] Erro Supabase:", error.message);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          leadId = (data as any).id;
          console.log(`[LEAD] Salvo no Supabase: ${lead.nome} — ${lead.produto_interesse}`);
        }
      }

      dispararN8n("novo_lead", {
        id: leadId, nome: lead.nome, telefone: lead.telefone,
        empresa: lead.empresa, email: lead.email, produto: lead.produto_interesse,
        valorSolicitado: lead.valor_solicitado, prazo: lead.prazo_meses,
        origem: lead.origem, criadoEm: now,
      }).then(async (ok) => {
        // n8n_notificado não existe no schema real — sem update
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("leads")
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.json({ success: true, lead: data as any });
    } catch (err) {
      console.error("[LEAD PATCH ERROR]", err);
      res.status(500).json({ error: "Erro ao atualizar lead." });
    }
  });

  // ─── SIMULAÇÕES API ────────────────────────────────────────────────────────
  // NOTA: tabela simulacoes_publicas NÃO existe no banco.
  // Simulações públicas são gravadas como leads com origem='simulador_publico'.
  app.post("/api/simulacoes", async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      // Gravar como lead com origem simulador_publico (schema real não tem simulacoes_publicas)
      const sim = {
        nome: req.body.nome || "",
        email: req.body.email || null,
        telefone: req.body.telefone || "",
        empresa: req.body.empresa || null,
        cpf_cnpj: req.body.cpfCnpj || null,
        tipo_pessoa: req.body.tipoPessoa || "pf",
        produto_interesse: req.body.produto || null,
        valor_solicitado: Number(req.body.valorSolicitado) || null,
        prazo_meses: Number(req.body.prazo) || null,
        finalidade: `Parcela estimada: R$ ${req.body.parcelaMensal || 0} | Total: R$ ${req.body.totalPagar || 0}`,
        origem: "simulador_publico",
        status: "novo",
        etapa_funil: "Novo",
        temperatura: "frio",
        score_ia: 0,
        created_at: now,
        updated_at: now,
      };

      let simId = `local-${Date.now()}`;

      if (supabaseReady) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("leads").insert(sim).select("id").single();
        if (error) {
          console.error("[SIM] Erro Supabase:", error.message);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          simId = (data as any).id;
          console.log(`[SIM] Salvo como lead: ${sim.nome} — ${sim.produto_interesse}`);
        }
      }

      dispararN8n("nova_simulacao", {
        id: simId, nome: sim.nome, telefone: sim.telefone,
        empresa: sim.empresa, email: sim.email, produto: sim.produto_interesse,
        valorSolicitado: sim.valor_solicitado, prazo: sim.prazo_meses,
        parcelaMensal: req.body.parcelaMensal, custoTotal: req.body.totalPagar, criadoEm: now,
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
      // Buscar leads com origem simulador_publico (tabela simulacoes_publicas não existe)
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("origem", "simulador_publico")
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ total: data?.length ?? 0, simulacoes: data ?? [] });
    } catch (err) {
      console.error("[SIMS GET ERROR]", err);
      res.status(500).json({ error: "Erro ao buscar simulações." });
    }
  });

  // ─── CONTATO API ────────────────────────────────────────────────────────
  // NOTA: tabela contatos NÃO existe no banco.
  // Contatos do site são gravados como leads com origem='contato_site'.
  app.post("/api/contato", async (req: Request, res: Response) => {
    try {
      const now = new Date().toISOString();
      const contato = {
        nome: req.body.nome || "",
        email: req.body.email || null,
        telefone: req.body.telefone || null,
        finalidade: `[${req.body.assunto || "contato"}] ${req.body.mensagem || ""}`.substring(0, 500),
        origem: "contato_site",
        status: "novo",
        etapa_funil: "Novo",
        temperatura: "frio",
        score_ia: 0,
        created_at: now,
        updated_at: now,
      };

      let contatoId = `local-${Date.now()}`;

      if (supabaseReady) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("leads").insert(contato).select("id").single();
        if (error) {
          console.error("[CONTATO] Erro Supabase:", error.message);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contatoId = (data as any).id;
          console.log(`[CONTATO] Salvo como lead: ${contato.nome} — ${req.body.assunto}`);
        }
      }

      dispararN8n("novo_contato", {
        id: contatoId, nome: contato.nome, email: contato.email, telefone: contato.telefone,
        assunto: req.body.assunto, mensagem: req.body.mensagem, criadoEm: now,
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
      // Buscar leads com origem contato_site (tabela contatos não existe)
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("origem", "contato_site")
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

        // Todas as origens são gravadas na tabela leads
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [leadsRes, simsRes, contatosRes] = await Promise.all([
        sb.from("leads").select("status, produto_interesse, valor_solicitado"),
        sb.from("leads").select("valor_solicitado").eq("origem", "simulador_publico"),
        sb.from("leads").select("id", { count: "exact", head: true }).eq("origem", "contato_site"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leads: any[] = leadsRes.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sims: any[] = simsRes.data ?? [];
      const byStatus = leads.reduce((acc: Record<string, number>, l: any) => {
        acc[l.status] = (acc[l.status] || 0) + 1;
        return acc;
      }, {});
      const byProduto = leads.reduce((acc: Record<string, number>, l: any) => {
        if (l.produto_interesse) acc[l.produto_interesse] = (acc[l.produto_interesse] || 0) + 1;
        return acc;
      }, {});
      res.json({
        leads: { total: leads.length, byStatus, byProduto },
        simulacoes: {
          total: sims.length,
          totalValorSimulado: sims.reduce((s: number, r: Record<string, number>) => s + (r.valor_solicitado || 0), 0),
          totalCustoSimulado: 0, // campo total_pagar não existe na tabela leads
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

  // ─── COLABORADORES API (admin flow — sem confirmação de e-mail) ───────────────
  // Usa service_role para criar usuário diretamente sem exigir confirmação de e-mail
  app.post("/api/colaboradores", requireAdmin, async (req: Request, res: Response) => {
    try {
      if (!supabaseReady) { res.status(503).json({ error: "Supabase não configurado" }); return; }
      const { nome, email, cargo, senha } = req.body;
      if (!nome || !email || !cargo || !senha) {
        res.status(400).json({ error: "Campos obrigatórios: nome, email, cargo, senha" });
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminAuth = (supabase as any).auth.admin;
      // Criar usuário no Auth com email_confirm=true (pula confirmação)
      const { data: authData, error: authError } = await adminAuth.createUser({
        email: email.trim().toLowerCase(),
        password: senha,
        email_confirm: true,
        user_metadata: { nome, cargo },
      });
      if (authError) {
        console.error("[COLAB] Auth error:", authError.message);
        res.status(400).json({ error: authError.message });
        return;
      }
      const userId = authData.user.id;
      // Inserir perfil na tabela colaboradores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profileError } = await (supabase as any)
        .from("colaboradores")
        .insert({
          id: userId,
          nome: nome.trim(),
          cargo,
          email: email.trim().toLowerCase(),
          ativo: true,
        });
      if (profileError) {
        console.error("[COLAB] Profile error:", profileError.message);
        // Tentar reverter criação do usuário no Auth
        await adminAuth.deleteUser(userId).catch(() => {});
        res.status(500).json({ error: profileError.message });
        return;
      }
      console.log(`[COLAB] Colaborador criado: ${nome} (${email})`);
      res.status(201).json({ success: true, id: userId, message: `Colaborador "${nome}" criado com sucesso!` });
    } catch (err) {
      console.error("[COLAB ERROR]", err);
      res.status(500).json({ error: "Erro ao criar colaborador." });
    }
  });

  // ─── n8n WEBHOOK CONFIG API ────────────────────────────────────────────────────────
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
