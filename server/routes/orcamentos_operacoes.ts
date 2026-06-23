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
  const payloadParsed = parseJsonMaybe(row.payload, {});
  // ocultar_conteudo pode estar na coluna direta (se existir) ou dentro do payload JSONB
  const ocultarConteudo = row.ocultar_conteudo === true || row.ocultar_conteudo === 'true'
    || payloadParsed?.ocultar_conteudo === true || payloadParsed?.ocultar_conteudo === 'true';
  return {
    ...row,
    valor_total: row.valor_total === null || row.valor_total === undefined ? 0 : Number(row.valor_total),
    itens: parseJsonMaybe(row.itens, []),
    assinaturas: parseJsonMaybe(row.assinaturas, []),
    payload: payloadParsed,
    ocultar_conteudo: ocultarConteudo,
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
      ocultar_conteudo: body.ocultar_conteudo === true || body.ocultar_conteudo === "true" ? true : false,
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

// ── Geração de HTML do orçamento para Puppeteer ──────────────────────────────
// Usa o mesmo pipeline de contratos (Puppeteer + pdf-lib merge) para garantir
// suporte completo a caracteres PT-BR (ã, ç, é, etc.) e papel timbrado.

function gerarHtmlOrcamento(orcamento: Row): string {
  const marca = normalizeMarca(orcamento.marca);
  const cor = marca === "permupay" ? "#0066CC" : marca === "aragao" ? "#8B4513" : "#1B3A8C";
  const corLight = marca === "permupay" ? "#EBF5FF" : marca === "aragao" ? "#FFF8F0" : "#EEF2FF";
  const servicos = normalizeServicos(orcamento.itens || []);
  const valorTotal = Number(orcamento.valor_total || 0);
  const assinaturas = normalizeAssinaturas(orcamento.assinaturas || []);
  const numero = escapeHtml(orcamento.numero || "Rascunho");
  const validadeTexto = orcamento.validade_ate
    ? fmtDate(orcamento.validade_ate)
    : `${orcamento.validade_dias || 30} dias`;

  const servicosHtml = servicos.length > 0
    ? `<section>
        <h3>Serviços prestados</h3>
        <table>
          <thead><tr>
            <th style="text-align:left;width:55%">Descrição</th>
            <th style="text-align:center;width:10%">Qtd</th>
            <th style="text-align:right;width:20%">Unitário</th>
            <th style="text-align:right;width:15%">Subtotal</th>
          </tr></thead>
          <tbody>
            ${servicos.map(s => {
              const sub = (s.quantidade || 1) * (s.valor_unitario || 0);
              return `<tr>
                <td>${escapeHtml(limparDescricaoServico(s.descricao))}</td>
                <td style="text-align:center">${s.quantidade}</td>
                <td style="text-align:right">${moneyBR(s.valor_unitario)}</td>
                <td style="text-align:right;font-weight:700">${moneyBR(sub)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </section>`
    : `<section>
        <h3>Serviços prestados</h3>
        <p style="color:#64748b;font-size:10pt">Orçamento lançado por valor direto, sem detalhamento de itens na proposta.</p>
      </section>`;

  const assinaturasHtml = assinaturas.length
    ? assinaturas.map(a => `
        <div class="sig-box">
          <div class="sig-line"></div>
          <strong>${escapeHtml(a.nome || "Assinante")}</strong>
          <span>${escapeHtml(a.cargo || a.tipo || "")}</span>
          <small>${escapeHtml(a.documento || "")}</small>
        </div>`).join("")
    : `<div class="sig-box"><div class="sig-line"></div><strong>Destrava Crédito</strong><span>Contratada</span></div>
       <div class="sig-box"><div class="sig-line"></div><strong>${escapeHtml(orcamento.cliente_nome || "Cliente")}</strong><span>Cliente</span></div>`;

  const conteudoHtml = String(orcamento.conteudo || "")
    .split(/\n{2,}/)
    .map(p => `<p>${textoHtmlComQuebras(p)}</p>`)
    .join("\n");

  // ocultar_conteudo flag vem do payload quando usuário desmarcou "texto visível"
  const ocultarConteudo = orcamento.ocultar_conteudo === true || orcamento.ocultar_conteudo === 'true';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(orcamento.titulo || "Orçamento")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 10.5pt; line-height: 1.6; }
  h1 { color:${cor}; font-size:20pt; margin:0 0 4px; }
  h2 { font-size:12pt; color:#334155; margin:0 0 16px; font-weight:600; }
  h3 { font-size:11.5pt; color:${cor}; margin:24px 0 10px; border-bottom:1.5px solid #e2e8f0; padding-bottom:5px; }
  p { margin:0 0 8px; }
  .info-box { background:${corLight}; border:1px solid ${cor}22; border-radius:10px; padding:14px 16px; margin:14px 0; }
  .info-label { font-size:8pt; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.05em; display:block; }
  .info-val { font-weight:700; font-size:11pt; color:#0f172a; }
  .valor-final-box { background:${corLight}; border:2px solid ${cor}44; border-radius:10px; padding:16px 18px; margin:20px 0; }
  .valor-total { font-size:22pt; font-weight:800; color:${cor}; }
  .metainfo { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:14px 0; }
  table { width:100%; border-collapse:collapse; margin:0; }
  th { background:${cor}; color:#fff; padding:7px 9px; font-size:8.5pt; font-weight:700; }
  td { padding:6px 9px; border-bottom:1px solid #e2e8f0; font-size:9.5pt; }
  tr:nth-child(even) td { background:#f8fafc; }
  .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-top:40px; }
  .sig-box { text-align:center; }
  .sig-line { border-top:1px solid #0f172a; margin-bottom:10px; }
  .sig-box strong { display:block; font-size:10pt; }
  .sig-box span, .sig-box small { display:block; font-size:8.5pt; color:#64748b; }
  section { page-break-inside:avoid; }
</style>
</head>
<body>
  <h1>${escapeHtml(orcamento.titulo || "Orçamento de Serviços")}</h1>
  ${orcamento.descricao ? `<h2>${escapeHtml(String(orcamento.descricao || ""))}</h2>` : ""}

  <div class="info-box">
    <span class="info-label">Cliente</span>
    <span class="info-val">${escapeHtml(orcamento.cliente_nome || "Cliente não informado")}</span>
    ${orcamento.cliente_documento ? `<span style="font-size:9.5pt;color:#475569">${escapeHtml(String(orcamento.cliente_documento))}</span>` : ""}
    ${orcamento.cliente_email ? `<span style="font-size:9pt;color:#64748b">E-mail: ${escapeHtml(String(orcamento.cliente_email))}</span>` : ""}
    ${orcamento.cliente_telefone ? `<span style="font-size:9pt;color:#64748b">Tel: ${escapeHtml(String(orcamento.cliente_telefone))}</span>` : ""}
  </div>

  <div class="metainfo">
    <div class="info-box">
      <span class="info-label">Número</span>
      <span class="info-val" style="font-size:9pt">${numero}</span>
    </div>
    <div class="info-box">
      <span class="info-label">Validade</span>
      <span class="info-val">${escapeHtml(validadeTexto)}</span>
    </div>
  </div>

  ${!ocultarConteudo && String(orcamento.conteudo || "").trim() ? `
  <section>
    <h3>Escopo e condições</h3>
    ${conteudoHtml}
  </section>` : ""}

  ${servicosHtml}

  <div class="valor-final-box">
    <span class="info-label">Valor total do orçamento</span>
    <div class="valor-total">${moneyBR(valorTotal)}</div>
  </div>

  <section>
    <h3>Assinaturas</h3>
    <div class="sig-grid">${assinaturasHtml}</div>
  </section>
</body>
</html>`;
}

// Gera PDF via Puppeteer (mesmo pipeline dos contratos — suporte completo a PT-BR)
async function gerarPdfOrcamentoPuppeteer(orcamento: Row): Promise<Buffer> {
  const puppeteerL = await import("puppeteer-core");
  let executablePath: string;
  if (process.env.CHROMIUM_PATH) {
    executablePath = process.env.CHROMIUM_PATH;
  } else {
    try {
      const chromiumL = await import("@sparticuz/chromium");
      executablePath = await chromiumL.default.executablePath();
    } catch { executablePath = "/usr/bin/chromium-browser"; }
  }

  const marca = normalizeMarca(orcamento.marca);
  const isPermuPay = marca === "permupay";
  // Logos em base64 — lidas do mesmo módulo do servidor principal
  // Fallback: usar texto simples como cabeçalho se logos não estiverem disponíveis
  const nomeEmpresa = marcaNome(marca);
  const corBorda = isPermuPay ? "#0066CC" : marca === "aragao" ? "#8B4513" : "#1B3A8C";

  const headerTemplate = `<style>*{margin:0;padding:0;box-sizing:border-box}#h{width:100%;padding:5px 22mm 7px;border-bottom:2px solid ${corBorda};display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-size:11pt;font-weight:700;color:${corBorda}}</style><div id="h">${escapeHtml(nomeEmpresa)}</div>`;
  const footerTemplate = `<style>*{margin:0;padding:0;box-sizing:border-box}#f{width:100%;padding:7px 22mm 5px;border-top:1px solid #e2e8f0;text-align:center;font-family:Arial,sans-serif;font-size:7.5pt;color:#64748b;line-height:1.5}</style><div id="f"><strong>BRASÍLIA - SEDE</strong> · St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250</div>`;

  const html = gerarHtmlOrcamento(orcamento);
  let browser: any;
  try {
    browser = await puppeteerL.default.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfOpts = {
      format: "A4" as const,
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: "26mm", bottom: "24mm", left: "20mm", right: "20mm" },
      headerTemplate,
      footerTemplate,
    };
    const buf = await page.pdf(pdfOpts);
    return Buffer.from(buf);
  } finally {
    if (browser) await browser.close();
  }
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
      const pdf = await gerarPdfOrcamentoPuppeteer(orcamento);
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
