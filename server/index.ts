import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Data persistence helpers ───────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "..", "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON<T>(filename: string, fallback: T): T {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    }
  } catch {
    // ignore parse errors
  }
  return fallback;
}

function writeJSON(filename: string, data: unknown): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpfCnpj?: string;
  tipoPessoa: "pf" | "pj";
  produto?: string;
  valorSolicitado?: number;
  prazo?: number;
  mensagem?: string;
  origem: string;
  status: "novo" | "em_atendimento" | "aprovado" | "reprovado" | "convertido";
  criadoEm: string;
  atualizadoEm: string;
}

interface Simulacao {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpfCnpj?: string;
  tipoPessoa: "pf" | "pj";
  produto: string;
  valorSolicitado: number;
  prazo: number;
  taxaAplicada?: number;
  parcelaMensal?: number;
  totalPagar?: number;
  criadoEm: string;
}

interface Contato {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  assunto: string;
  mensagem: string;
  status: "novo" | "respondido";
  criadoEm: string;
}

// ─── ID generator ────────────────────────────────────────────────────────────
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── App ─────────────────────────────────────────────────────────────────────
async function startServer() {
  ensureDataDir();

  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // CORS for dev
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // ─── Health check ──────────────────────────────────────────────────────────
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), version: "1.0.0" });
  });

  // ─── LEADS API ─────────────────────────────────────────────────────────────
  // POST /api/leads - Criar novo lead
  app.post("/api/leads", (req: Request, res: Response) => {
    try {
      const leads = readJSON<Lead[]>("leads.json", []);
      const now = new Date().toISOString();
      const newLead: Lead = {
        id: generateId(),
        nome: req.body.nome || "",
        email: req.body.email || "",
        telefone: req.body.telefone || "",
        cpfCnpj: req.body.cpfCnpj || "",
        tipoPessoa: req.body.tipoPessoa || "pf",
        produto: req.body.produto || "",
        valorSolicitado: Number(req.body.valorSolicitado) || 0,
        prazo: Number(req.body.prazo) || 0,
        mensagem: req.body.mensagem || "",
        origem: req.body.origem || "site",
        status: "novo",
        criadoEm: now,
        atualizadoEm: now,
      };
      leads.push(newLead);
      writeJSON("leads.json", leads);
      console.log(`[LEAD] Novo lead: ${newLead.nome} - ${newLead.produto}`);
      res.status(201).json({ success: true, id: newLead.id, message: "Lead registrado com sucesso!" });
    } catch (err) {
      console.error("[LEAD ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao registrar lead." });
    }
  });

  // GET /api/leads - Listar leads (admin)
  app.get("/api/leads", (req: Request, res: Response) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== (process.env.ADMIN_KEY || "destrava2024admin")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const leads = readJSON<Lead[]>("leads.json", []);
    const status = req.query.status as string | undefined;
    const filtered = status ? leads.filter((l) => l.status === status) : leads;
    res.json({ total: filtered.length, leads: filtered.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) });
  });

  // PATCH /api/leads/:id - Atualizar status do lead
  app.patch("/api/leads/:id", (req: Request, res: Response) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== (process.env.ADMIN_KEY || "destrava2024admin")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const leads = readJSON<Lead[]>("leads.json", []);
    const idx = leads.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: "Lead não encontrado" });
      return;
    }
    leads[idx] = { ...leads[idx], ...req.body, atualizadoEm: new Date().toISOString() };
    writeJSON("leads.json", leads);
    res.json({ success: true, lead: leads[idx] });
  });

  // ─── SIMULAÇÕES API ────────────────────────────────────────────────────────
  // POST /api/simulacoes - Registrar simulação
  app.post("/api/simulacoes", (req: Request, res: Response) => {
    try {
      const simulacoes = readJSON<Simulacao[]>("simulacoes.json", []);
      const newSim: Simulacao = {
        id: generateId(),
        nome: req.body.nome || "",
        email: req.body.email || "",
        telefone: req.body.telefone || "",
        cpfCnpj: req.body.cpfCnpj || "",
        tipoPessoa: req.body.tipoPessoa || "pf",
        produto: req.body.produto || "",
        valorSolicitado: Number(req.body.valorSolicitado) || 0,
        prazo: Number(req.body.prazo) || 0,
        taxaAplicada: Number(req.body.taxaAplicada) || 0,
        parcelaMensal: Number(req.body.parcelaMensal) || 0,
        totalPagar: Number(req.body.totalPagar) || 0,
        criadoEm: new Date().toISOString(),
      };
      simulacoes.push(newSim);
      writeJSON("simulacoes.json", simulacoes);
      console.log(`[SIM] Nova simulação: ${newSim.nome} - ${newSim.produto} - R$ ${newSim.valorSolicitado}`);
      res.status(201).json({ success: true, id: newSim.id });
    } catch (err) {
      console.error("[SIM ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao registrar simulação." });
    }
  });

  // GET /api/simulacoes - Listar simulações (admin)
  app.get("/api/simulacoes", (req: Request, res: Response) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== (process.env.ADMIN_KEY || "destrava2024admin")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const simulacoes = readJSON<Simulacao[]>("simulacoes.json", []);
    res.json({ total: simulacoes.length, simulacoes: simulacoes.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) });
  });

  // ─── CONTATO API ───────────────────────────────────────────────────────────
  // POST /api/contato - Enviar mensagem de contato
  app.post("/api/contato", (req: Request, res: Response) => {
    try {
      const contatos = readJSON<Contato[]>("contatos.json", []);
      const newContato: Contato = {
        id: generateId(),
        nome: req.body.nome || "",
        email: req.body.email || "",
        telefone: req.body.telefone || "",
        assunto: req.body.assunto || "",
        mensagem: req.body.mensagem || "",
        status: "novo",
        criadoEm: new Date().toISOString(),
      };
      contatos.push(newContato);
      writeJSON("contatos.json", contatos);
      console.log(`[CONTATO] Novo contato: ${newContato.nome} - ${newContato.assunto}`);
      res.status(201).json({ success: true, id: newContato.id, message: "Mensagem enviada com sucesso!" });
    } catch (err) {
      console.error("[CONTATO ERROR]", err);
      res.status(500).json({ success: false, message: "Erro ao enviar mensagem." });
    }
  });

  // GET /api/contatos - Listar contatos (admin)
  app.get("/api/contatos", (req: Request, res: Response) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== (process.env.ADMIN_KEY || "destrava2024admin")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const contatos = readJSON<Contato[]>("contatos.json", []);
    res.json({ total: contatos.length, contatos: contatos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) });
  });

  // ─── ESTATÍSTICAS API ──────────────────────────────────────────────────────
  app.get("/api/stats", (req: Request, res: Response) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== (process.env.ADMIN_KEY || "destrava2024admin")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const leads = readJSON<Lead[]>("leads.json", []);
    const simulacoes = readJSON<Simulacao[]>("simulacoes.json", []);
    const contatos = readJSON<Contato[]>("contatos.json", []);

    const leadsByStatus = leads.reduce((acc: Record<string, number>, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {});

    const leadsByProduto = leads.reduce((acc: Record<string, number>, l) => {
      if (l.produto) acc[l.produto] = (acc[l.produto] || 0) + 1;
      return acc;
    }, {});

    const totalValorSimulado = simulacoes.reduce((sum, s) => sum + (s.valorSolicitado || 0), 0);

    res.json({
      leads: { total: leads.length, byStatus: leadsByStatus, byProduto: leadsByProduto },
      simulacoes: { total: simulacoes.length, totalValorSimulado },
      contatos: { total: contatos.length },
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Static files ──────────────────────────────────────────────────────────
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // SPA fallback
  app.get("*", (_req: Request, res: Response) => {
    const indexPath = path.join(staticPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Site em construção. Execute 'npm run build' para gerar os arquivos.");
    }
  });

  // Porta padrão 4000 para não conflitar com Chatwoot (3000) na mesma VPS
  const port = Number(process.env.PORT) || 4000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`✅ Destrava Crédito - Server running on http://0.0.0.0:${port}/`);
    console.log(`📁 Data dir: ${DATA_DIR}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer().catch(console.error);
