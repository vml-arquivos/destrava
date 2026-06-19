import { Router, Request, Response } from "express";
import type { Pool } from "pg";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

type Row = Record<string, any>;

function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "")
    .replace(/R\$/g, "")
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep === -1) {
    const n = Number(raw.replace(/[^0-9-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  const decimals = raw.slice(lastSep + 1).replace(/\D/g, "");
  const intPart = raw.slice(0, lastSep).replace(/[^0-9-]/g, "");
  const n = Number(`${intPart}.${decimals}`);
  return Number.isFinite(n) ? n : 0;
}

async function getColumns(pool: Pool, tableName: string): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName],
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

function safeDate(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

function normalizeServicos(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      descricao: String(item?.descricao || "").trim(),
      quantidade: Math.max(1, Number(item?.quantidade) || 1),
      valor_unitario: parseMoney(item?.valor_unitario),
    }))
    .filter((item) => item.descricao);
}

function normalizeAssinaturas(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((a) => ({
    tipo: String(a?.tipo || "assinatura").trim() || "assinatura",
    nome: String(a?.nome || "").trim(),
    cargo: String(a?.cargo || "").trim(),
    documento: String(a?.documento || "").trim(),
  }));
}

function normalizeMarca(value: unknown): "destrava" | "permupay" | "aragao" {
  const marca = String(value || "destrava").trim().toLowerCase();
  if (marca === "permupay" || marca === "aragao") return marca;
  return "destrava";
}

function marcaNome(marca: unknown): string {
  const m = normalizeMarca(marca);
  if (m === "permupay") return "PermuPay";
  if (m === "aragao") return "Aragão Serviços";
  return "Destrava Crédito";
}

function limparDescricaoServico(value: unknown): string {
  return String(value ?? "")
    .replace(/^\s*descri[cç][aã]o\s+do\s+item\s*\/\s*servi[cç]o\s*:\s*/i, "")
    .replace(/^\s*item\s*\d*\s*[-–—:]\s*/i, "")
    .trim();
}

function moneyBR(value: unknown): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(date?: string | Date | null): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function parseJsonMaybe(value: any, fallback: any) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

function mapOrcamento(row: Row): Row {
  if (!row) return row;
  return {
    ...row,
    valor_total: row.valor_total === null || row.valor_total === undefined ? 0 : Number(row.valor_total),
    itens: parseJsonMaybe(row.itens, []),
    assinaturas: parseJsonMaybe(row.assinaturas, []),
    payload: parseJsonMaybe(row.payload, {}),
  };
}

function buildPayload(body: any) {
  const servicos = normalizeServicos(body.itens);
  const valorTotal = servicos.length
    ? servicos.reduce((acc, item) => acc + item.quantidade * item.valor_unitario, 0)
    : parseMoney(body.valor_total);
  const assinaturas = normalizeAssinaturas(body.assinaturas);

  return {
    servicos,
    valorTotal,
    payload: {
      tipo_cliente: body.tipo_cliente || "empresa",
      empresa_id: body.empresa_id || null,
      cliente_pf_id: body.cliente_pf_id || null,
      cliente_nome: body.cliente_nome || null,
      cliente_documento: body.cliente_documento || null,
      cliente_email: body.cliente_email || null,
      cliente_telefone: body.cliente_telefone || null,
      marca: normalizeMarca(body.marca),
      titulo: body.titulo || "Orçamento de Serviços",
      descricao: body.descricao || null,
      conteudo: body.conteudo || "",
      valor_total: valorTotal,
      validade_dias: Number(body.validade_dias) || 30,
      validade_ate: safeDate(body.validade_ate),
      assinaturas: JSON.stringify(assinaturas),
      payload: JSON.stringify({ ...(body.payload || {}), origem_painel_orcamentos: true }),
    } as Record<string, unknown>,
  };
}

function gerarNumeroOrcamento(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `ORC-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

async function garantirNumeroFinalizado(pool: Pool, id: string): Promise<Row | null> {
  const atual = await pool.query(`SELECT * FROM public.orcamentos_timbrados WHERE id = $1 LIMIT 1`, [id]);
  if (!atual.rows.length) return null;
  const row = atual.rows[0];
  if (row.status === "finalizado" && row.numero) return mapOrcamento(row);

  const numero = row.numero || gerarNumeroOrcamento();
  const validadeDias = Number(row.validade_dias || 30);
  const validadeAte = new Date();
  validadeAte.setDate(validadeAte.getDate() + validadeDias);

  const updated = await pool.query(
    `UPDATE public.orcamentos_timbrados
        SET status = 'finalizado',
            numero = COALESCE(numero, $2),
            validade_ate = COALESCE(validade_ate, $3::date),
            finalizado_em = COALESCE(finalizado_em, NOW()),
            atualizado_em = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, numero, validadeAte.toISOString().slice(0, 10)],
  );
  return mapOrcamento(updated.rows[0]);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textoHtmlComQuebras(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

async function gerarPdfOrcamentoBuffer(orcamento: Row): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.06, 0.34, 0.82);
  const dark = rgb(0.08, 0.12, 0.2);
  const gray = rgb(0.35, 0.4, 0.5);
  const light = rgb(0.95, 0.97, 1);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 52;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 52;

  function drawText(text: string, x: number, yy: number, size = 10, f = font, color = dark, maxWidth = pageWidth - margin * 2) {
    const clean = String(text || "");
    page.drawText(clean.slice(0, 160), { x, y: yy, size, font: f, color, maxWidth });
  }

  function newPageIfNeeded(height = 60) {
    if (y - height > 60) return;
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 52;
  }

  function wrap(text: string, maxChars: number) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if ((line + " " + word).trim().length > maxChars) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = (line + " " + word).trim();
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  const marca = normalizeMarca(orcamento.marca);
  const empresa = marcaNome(marca);
  const numero = orcamento.numero || "Rascunho";
  const servicos = normalizeServicos(orcamento.itens || []);
  const valorTotal = Number(orcamento.valor_total || 0);

  page.drawText(empresa, { x: margin, y, size: marca === "permupay" ? 20 : 17, font: bold, color: marca === "aragao" ? rgb(0.55, 0.32, 0.04) : blue });
  drawText(numero, pageWidth - 185, y + 3, 10, bold, dark, 130);
  y -= 20;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 3, color: marca === "aragao" ? rgb(0.8, 0.54, 0.18) : blue });
  y -= 36;

  drawText(orcamento.titulo || "Orçamento de Serviços", margin, y, 24, bold, dark);
  y -= 34;

  page.drawRectangle({ x: margin, y: y - 72, width: pageWidth - margin * 2, height: 82, color: light, borderColor: rgb(0.85, 0.89, 0.96), borderWidth: 1 });
  drawText("CLIENTE", margin + 12, y - 12, 8, bold, gray);
  drawText(orcamento.cliente_nome || "Cliente não informado", margin + 12, y - 30, 12, bold, dark);
  drawText(orcamento.cliente_documento || "", margin + 12, y - 48, 10, font, dark);
  if (orcamento.cliente_email) drawText(`E-mail: ${orcamento.cliente_email}`, margin + 12, y - 64, 9, font, gray);
  y -= 104;

  page.drawRectangle({ x: margin, y: y - 62, width: pageWidth - margin * 2, height: 72, color: rgb(0.98, 0.99, 1), borderColor: rgb(0.88, 0.91, 0.96), borderWidth: 1 });
  drawText("VALOR TOTAL", margin + 12, y - 14, 8, bold, gray);
  drawText(moneyBR(valorTotal), margin + 12, y - 40, 20, bold, blue);
  drawText("VALIDADE", margin + 250, y - 14, 8, bold, gray);
  drawText(orcamento.validade_ate ? fmtDate(orcamento.validade_ate) : `${orcamento.validade_dias || 30} dias`, margin + 250, y - 40, 12, bold, dark);
  drawText("STATUS", margin + 390, y - 14, 8, bold, gray);
  drawText(String(orcamento.status || "rascunho").toUpperCase(), margin + 390, y - 40, 12, bold, dark);
  y -= 96;

  drawText("Escopo e condições", margin, y, 15, bold, blue);
  y -= 22;
  for (const paragraph of String(orcamento.conteudo || "").split(/\n+/)) {
    for (const line of wrap(paragraph, 86)) {
      newPageIfNeeded(18);
      drawText(line, margin, y, 10.5, font, dark);
      y -= 16;
    }
    y -= 4;
  }

  if (servicos.length > 0) {
    y -= 12;
    newPageIfNeeded(120);
    drawText("Serviços prestados", margin, y, 15, bold, blue);
    y -= 24;
    for (const servico of servicos) {
      newPageIfNeeded(50);
      const subtotal = Number(servico.quantidade || 0) * Number(servico.valor_unitario || 0);
      page.drawRectangle({ x: margin, y: y - 32, width: pageWidth - margin * 2, height: 42, color: rgb(0.97, 0.98, 1) });
      const lines = wrap(limparDescricaoServico(servico.descricao), 58);
      drawText(lines[0], margin + 10, y - 8, 9.5, bold, dark, 310);
      if (lines[1]) drawText(lines[1], margin + 10, y - 22, 9, font, gray, 310);
      drawText(`${servico.quantidade}x`, pageWidth - 180, y - 12, 9, font, gray);
      drawText(moneyBR(subtotal), pageWidth - 128, y - 12, 10, bold, dark);
      y -= 48;
    }
  } else {
    y -= 10;
    newPageIfNeeded(45);
    drawText("Serviços prestados", margin, y, 15, bold, blue);
    y -= 22;
    drawText("Orçamento lançado por valor direto, sem detalhamento de serviços na proposta.", margin, y, 10, font, gray);
    y -= 24;
  }

  y -= 36;
  newPageIfNeeded(140);
  drawText("Assinaturas", margin, y, 15, bold, blue);
  y -= 68;
  const assinaturas = normalizeAssinaturas(orcamento.assinaturas || []);
  const sigs = assinaturas.length ? assinaturas : [];
  const colW = (pageWidth - margin * 2 - 30) / 2;
  sigs.slice(0, 4).forEach((a, idx) => {
    const x = margin + (idx % 2) * (colW + 30);
    const yy = y - Math.floor(idx / 2) * 88;
    page.drawLine({ start: { x, y: yy }, end: { x: x + colW, y: yy }, thickness: 1, color: dark });
    drawText(a.nome || "Assinante", x + 8, yy - 18, 10, bold, dark, colW - 16);
    drawText(a.cargo || "", x + 8, yy - 34, 9, font, gray, colW - 16);
    drawText(a.documento || "", x + 8, yy - 49, 8, font, gray, colW - 16);
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export default function createOrcamentosOperacoesRouter(pool: Pool) {
  const router = Router();

  router.get("/clientes", async (_req: Request, res: Response) => {
    try {
      const [empresas, clientesPf] = await Promise.all([
        pool.query(
          `SELECT id, razao_social, nome_fantasia, cnpj, email, telefone, whatsapp
             FROM public.empresas
            WHERE COALESCE(arquivado_por_duplicidade, false) = false
            ORDER BY COALESCE(razao_social, nome_fantasia, '') ASC
            LIMIT 500`,
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT id, nome, cpf, email, telefone
             FROM public.clientes_pf
            ORDER BY nome ASC
            LIMIT 500`,
        ).catch(() => ({ rows: [] })),
      ]);
      res.json({ empresas: empresas.rows, clientes_pj: empresas.rows, clientes_pf: clientesPf.rows });
    } catch (err: any) {
      console.error("[orcamentos][clientes]", err);
      res.status(500).json({ error: err?.message || "Erro ao listar clientes" });
    }
  });

  router.get("/anexos/:id/download", async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT nome_original, mime_type, storage_path FROM public.orcamentos_timbrados_anexos WHERE id = $1 LIMIT 1`,
        [req.params.id],
      );
      if (!rows.length) return res.status(404).json({ error: "Anexo não encontrado" });
      const anexo = rows[0];
      if (!anexo.storage_path || !fs.existsSync(anexo.storage_path)) {
        return res.status(404).json({ error: "Arquivo do anexo não encontrado" });
      }
      res.setHeader("Content-Type", anexo.mime_type || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${String(anexo.nome_original || "anexo").replace(/"/g, "")}"`);
      fs.createReadStream(anexo.storage_path).pipe(res);
    } catch (err: any) {
      console.error("[orcamentos][anexo download]", err);
      res.status(500).json({ error: err?.message || "Erro ao baixar anexo" });
    }
  });

  router.delete("/anexos/:id", async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `DELETE FROM public.orcamentos_timbrados_anexos WHERE id = $1 RETURNING orcamento_id, storage_path`,
        [req.params.id],
      );
      if (!result.rows.length) return res.status(404).json({ error: "Anexo não encontrado" });
      const row = result.rows[0];
      if (row.storage_path && fs.existsSync(row.storage_path)) {
        try { await fs.promises.unlink(row.storage_path); } catch { /* ignora */ }
      }
      await pool.query(
        `UPDATE public.orcamentos_timbrados
            SET anexos_count = GREATEST(COALESCE(anexos_count, 0) - 1, 0), atualizado_em = NOW()
          WHERE id = $1`,
        [row.orcamento_id],
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[orcamentos][anexo delete]", err);
      res.status(500).json({ error: err?.message || "Erro ao excluir anexo" });
    }
  });

  router.get("/", async (req: Request, res: Response) => {
    try {
      const busca = String(req.query.busca || "").trim();
      const params: any[] = [];
      let where = "";
      if (busca) {
        params.push(`%${busca.toLowerCase()}%`);
        where = `WHERE lower(COALESCE(numero,'') || ' ' || COALESCE(cliente_nome,'') || ' ' || COALESCE(titulo,'')) LIKE $1`;
      }
      const { rows } = await pool.query(
        `SELECT id, numero, tipo_cliente, empresa_id, cliente_pf_id, cliente_nome, cliente_documento,
                cliente_email, cliente_telefone, marca, titulo, descricao, valor_total, validade_dias,
                validade_ate, status, anexos_count, criado_em, atualizado_em, finalizado_em
           FROM public.orcamentos_timbrados
           ${where}
          ORDER BY atualizado_em DESC NULLS LAST, criado_em DESC
          LIMIT 200`,
        params,
      );
      res.json(rows.map(mapOrcamento));
    } catch (err: any) {
      console.error("[orcamentos][GET /]", err);
      res.status(500).json({ error: err?.message || "Erro ao listar orçamentos" });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    try {
      const columns = await getColumns(pool, "orcamentos_timbrados");
      const { servicos, payload } = buildPayload(req.body || {});
      if (columns.has("itens")) payload.itens = JSON.stringify(servicos);
      const colaboradorId = (req as any)?.colaborador?.id || null;
      if (columns.has("criado_por")) payload.criado_por = colaboradorId;

      const entries = Object.entries(payload).filter(([key]) => columns.has(key));
      const keys = entries.map(([key]) => key);
      const values = entries.map(([, value]) => value);
      const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
      const { rows } = await pool.query(
        `INSERT INTO public.orcamentos_timbrados (${keys.join(", ")})
         VALUES (${placeholders})
         RETURNING *`,
        values,
      );
      res.status(201).json(mapOrcamento(rows[0]));
    } catch (err: any) {
      console.error("[orcamentos][POST]", err);
      res.status(500).json({ error: err?.message || "Erro ao criar orçamento" });
    }
  });

  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM public.orcamentos_timbrados WHERE id = $1 LIMIT 1`,
        [req.params.id],
      );
      if (!rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
      const anexos = await pool.query(
        `SELECT id, nome_original, descricao, mime_type, tamanho_bytes,
                '/api/orcamentos/anexos/' || id || '/download' AS url,
                criado_em
           FROM public.orcamentos_timbrados_anexos
          WHERE orcamento_id = $1
          ORDER BY criado_em DESC`,
        [req.params.id],
      ).catch(() => ({ rows: [] }));
      res.json({ ...mapOrcamento(rows[0]), anexos: anexos.rows });
    } catch (err: any) {
      console.error("[orcamentos][GET id]", err);
      res.status(500).json({ error: err?.message || "Erro ao abrir orçamento" });
    }
  });

  router.put("/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID do orçamento é obrigatório" });

    try {
      const columns = await getColumns(pool, "orcamentos_timbrados");
      const atual = await pool.query(
        `SELECT id, status FROM public.orcamentos_timbrados WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (!atual.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });

      const { servicos, payload } = buildPayload(req.body || {});
      if (columns.has("itens")) payload.itens = JSON.stringify(servicos);

      // Ao editar um orçamento finalizado, volta para rascunho para gerar novo PDF atualizado.
      if (atual.rows[0]?.status === "finalizado") {
        payload.status = "rascunho";
        if (columns.has("finalizado_em")) payload.finalizado_em = null;
      }

      const entries = Object.entries(payload).filter(([key]) => columns.has(key));
      if (!entries.length) return res.status(400).json({ error: "Nenhum campo válido para atualizar" });

      const sets = entries.map(([key], idx) => `${key} = $${idx + 1}`);
      if (columns.has("atualizado_em")) sets.push(`atualizado_em = NOW()`);
      const values = entries.map(([, value]) => value);
      values.push(id);

      const result = await pool.query(
        `UPDATE public.orcamentos_timbrados
            SET ${sets.join(", ")}
          WHERE id = $${values.length}
          RETURNING *`,
        values,
      );

      res.json(mapOrcamento(result.rows[0]));
    } catch (err: any) {
      console.error("[orcamentos][PUT]", err);
      res.status(500).json({ error: err?.message || "Erro ao atualizar orçamento" });
    }
  });

  router.delete("/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID do orçamento é obrigatório" });

    try {
      const anexos = await pool.query(
        `SELECT storage_path FROM public.orcamentos_timbrados_anexos WHERE orcamento_id = $1`,
        [id],
      ).catch(() => ({ rows: [] }));
      const result = await pool.query(
        `DELETE FROM public.orcamentos_timbrados WHERE id = $1 RETURNING id, numero`,
        [id],
      );
      if (!result.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
      for (const anexo of anexos.rows) {
        if (anexo.storage_path && fs.existsSync(anexo.storage_path)) {
          try { await fs.promises.unlink(anexo.storage_path); } catch { /* ignora */ }
        }
      }
      res.json({ ok: true, excluido: result.rows[0] });
    } catch (err: any) {
      console.error("[orcamentos][DELETE]", err);
      res.status(500).json({ error: err?.message || "Erro ao excluir orçamento" });
    }
  });

  router.post("/:id/finalizar", async (req: Request, res: Response) => {
    try {
      const orcamento = await garantirNumeroFinalizado(pool, req.params.id);
      if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado" });
      res.json({ ok: true, orcamento });
    } catch (err: any) {
      console.error("[orcamentos][finalizar]", err);
      res.status(500).json({ error: err?.message || "Erro ao finalizar orçamento" });
    }
  });

  router.get("/:id/download", async (req: Request, res: Response) => {
    try {
      const orcamento = await garantirNumeroFinalizado(pool, req.params.id);
      if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado" });
      const pdf = await gerarPdfOrcamentoBuffer(orcamento);
      const nome = `${String(orcamento.numero || "orcamento").replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
      res.send(pdf);
    } catch (err: any) {
      console.error("[orcamentos][download]", err);
      res.status(500).json({ error: err?.message || "Erro ao gerar PDF" });
    }
  });

  router.post("/:id/anexos", upload.array("arquivos", 10), async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "").trim();
      const exists = await pool.query(`SELECT id FROM public.orcamentos_timbrados WHERE id = $1 LIMIT 1`, [id]);
      if (!exists.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
      const files = (req.files || []) as Express.Multer.File[];
      if (!files.length) return res.status(400).json({ error: "Nenhum arquivo enviado" });

      const dir = path.resolve("uploads", "orcamentos", id);
      await fs.promises.mkdir(dir, { recursive: true });
      const inseridos: Row[] = [];
      for (const file of files) {
        const ext = path.extname(file.originalname || "");
        const safeName = `${crypto.randomUUID()}${ext}`;
        const storagePath = path.join(dir, safeName);
        await fs.promises.writeFile(storagePath, file.buffer);
        const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
        const result = await pool.query(
          `INSERT INTO public.orcamentos_timbrados_anexos
             (orcamento_id, tipo, descricao, nome_original, mime_type, tamanho_bytes, storage_path, url, hash_sha256, criado_por)
           VALUES ($1, 'anexo', $2, $3, $4, $5, $6, '/api/orcamentos/anexos/' || gen_random_uuid() || '/download', $7, $8)
           RETURNING id, nome_original, descricao, mime_type, tamanho_bytes,
                     '/api/orcamentos/anexos/' || id || '/download' AS url,
                     criado_em`,
          [
            id,
            String(req.body?.descricao || "").trim() || null,
            file.originalname || safeName,
            file.mimetype || "application/octet-stream",
            file.size || file.buffer.length,
            storagePath,
            hash,
            (req as any)?.colaborador?.id || null,
          ],
        );
        inseridos.push(result.rows[0]);
      }
      await pool.query(
        `UPDATE public.orcamentos_timbrados
            SET anexos_count = COALESCE(anexos_count, 0) + $2,
                atualizado_em = NOW()
          WHERE id = $1`,
        [id, inseridos.length],
      );
      res.status(201).json({ ok: true, anexos: inseridos });
    } catch (err: any) {
      console.error("[orcamentos][anexos]", err);
      res.status(500).json({ error: err?.message || "Erro ao enviar anexos" });
    }
  });

  return router;
}
