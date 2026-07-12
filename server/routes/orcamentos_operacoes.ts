import { Router, Request, Response } from "express";
import type { Pool } from "pg";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ChromiumLaunchError } from "../services/chromiumLauncher";
import { generateBrandedPdfBuffer } from "../services/brandedPdfLayout";
import { getDataDir } from "../services/documentStorage";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  const ocultarConteudo = body.ocultar_conteudo === true || body.ocultar_conteudo === "true";
  const payloadAnterior = parseJsonMaybe(body.payload, {});

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
      ocultar_conteudo: ocultarConteudo,
      valor_total: valorTotal,
      validade_dias: Number(body.validade_dias) || 30,
      validade_ate: safeDate(body.validade_ate),
      assinaturas: JSON.stringify(assinaturas),
      // Mantém a preferência do checkbox também no JSONB. Isso preserva o
      // comportamento mesmo em bancos antigos que ainda não tenham a coluna
      // física ocultar_conteudo.
      payload: JSON.stringify({
        ...(payloadAnterior && typeof payloadAnterior === "object" ? payloadAnterior : {}),
        origem_painel_orcamentos: true,
        ocultar_conteudo: ocultarConteudo,
      }),
    } as Record<string, unknown>,
  };
}

function gerarNumeroOrcamento(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `ORC-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function garantirNumeroFinalizado(pool: Pool, id: string): Promise<Row | null> {
  const filtrosAtivo = await filtroOrcamentoAtivo(pool);
  const whereAtivo = filtrosAtivo.length ? ` AND ${filtrosAtivo.join(" AND ")}` : "";
  const atual = await pool.query(
    `SELECT * FROM public.orcamentos_timbrados WHERE id = $1${whereAtivo} LIMIT 1`,
    [id],
  );
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
      WHERE id = $1${whereAtivo}
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

function tituloPdfOrcamento(value: unknown): string {
  const titulo = String(value || "").trim();
  if (!titulo || /^orçamento(?:\s+de\s+serviços)?$/i.test(titulo)) return "Orçamento";
  return titulo;
}

function gerarHtmlOrcamento(orcamento: Row): string {
  const marca = normalizeMarca(orcamento.marca);
  const cor = marca === "permupay" ? "#075FAE" : marca === "aragao" ? "#7A4328" : "#173A79";
  const corEscura = marca === "permupay" ? "#064D8D" : marca === "aragao" ? "#5F321E" : "#102E63";
  const corSuave = marca === "permupay" ? "#EFF7FF" : marca === "aragao" ? "#FFF8F2" : "#F3F6FC";
  const borda = marca === "permupay" ? "#C7DDF2" : marca === "aragao" ? "#E6D4C8" : "#D7E0F0";
  const servicos = normalizeServicos(orcamento.itens || []);
  const valorTotal = Number(orcamento.valor_total || 0);
  const assinaturas = normalizeAssinaturas(orcamento.assinaturas || []);
  const numero = escapeHtml(orcamento.numero || "Rascunho");
  const validadeTexto = orcamento.validade_ate
    ? fmtDate(orcamento.validade_ate)
    : `${orcamento.validade_dias || 30} dias`;
  const titulo = tituloPdfOrcamento(orcamento.titulo);
  const ocultarConteudo = orcamento.ocultar_conteudo === true || orcamento.ocultar_conteudo === "true";
  const conteudoLivre = String(orcamento.conteudo || "").trim();

  const dadosContato = [
    orcamento.cliente_email ? `E-mail: ${escapeHtml(String(orcamento.cliente_email))}` : "",
    orcamento.cliente_telefone ? `Telefone: ${escapeHtml(String(orcamento.cliente_telefone))}` : "",
  ].filter(Boolean);

  const servicosHtml = servicos.length > 0
    ? `<section class="services-section">
        <div class="section-heading">
          <div>
            <span class="section-eyebrow">COMPOSIÇÃO DA PROPOSTA</span>
            <h2>Itens e valores</h2>
          </div>
          <span class="item-count">${servicos.length} ${servicos.length === 1 ? "item" : "itens"}</span>
        </div>
        <table>
          <thead><tr>
            <th class="description-col">Serviço</th>
            <th class="qty-col">Qtd.</th>
            <th class="money-col">Valor unit.</th>
            <th class="money-col">Total</th>
          </tr></thead>
          <tbody>
            ${servicos.map(s => {
              const sub = (s.quantidade || 1) * (s.valor_unitario || 0);
              return `<tr>
                <td class="description-cell">${escapeHtml(limparDescricaoServico(s.descricao))}</td>
                <td class="qty-cell">${s.quantidade}</td>
                <td class="money-cell">${moneyBR(s.valor_unitario)}</td>
                <td class="money-cell subtotal">${moneyBR(sub)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </section>`
    : `<section class="services-section empty-services">
        <div class="section-heading">
          <div>
            <span class="section-eyebrow">COMPOSIÇÃO DA PROPOSTA</span>
            <h2>Valor contratado</h2>
          </div>
        </div>
        <p>Proposta cadastrada por valor direto, sem detalhamento de itens.</p>
      </section>`;

  // O texto livre continua opcional e controlado pelo checkbox da tela.
  // Quando visível, ele entra sem o antigo título "Escopo e condições", com
  // tipografia discreta para manter o documento compacto e profissional.
  const conteudoLivreHtml = !ocultarConteudo && conteudoLivre
    ? `<section class="proposal-copy">
         <div class="proposal-copy-text">${textoHtmlComQuebras(conteudoLivre)}</div>
       </section>`
    : "";

  const assinaturasHtml = assinaturas.length
    ? assinaturas.map(a => `
        <div class="sig-box">
          <div class="sig-line"></div>
          <strong>${escapeHtml(a.nome || "Assinante")}</strong>
          <span>${escapeHtml(a.cargo || a.tipo || "")}</span>
          ${a.documento ? `<small>${escapeHtml(a.documento)}</small>` : ""}
        </div>`).join("")
    : `<div class="sig-box"><div class="sig-line"></div><strong>${escapeHtml(marcaNome(marca))}</strong><span>Contratada</span></div>
       <div class="sig-box"><div class="sig-line"></div><strong>${escapeHtml(orcamento.cliente_nome || "Cliente")}</strong><span>Cliente / Contratante</span></div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(titulo)}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: #162033;
    font-size: 9.15pt;
    line-height: 1.38;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  .document-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    padding: 1px 0 11px;
    margin-bottom: 13px;
    border-bottom: 1px solid ${borda};
  }
  .document-kicker,
  .section-eyebrow,
  .meta-label {
    display: block;
    color: #68758A;
    font-size: 7.1pt;
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: .085em;
    text-transform: uppercase;
  }
  h1 {
    margin: 3px 0 0;
    color: ${corEscura};
    font-size: 15.5pt;
    line-height: 1.12;
    font-weight: 700;
    letter-spacing: -.015em;
  }
  .document-number {
    max-width: 47%;
    text-align: right;
  }
  .document-number strong {
    display: block;
    margin-top: 4px;
    color: #25324A;
    font-size: 8.5pt;
    line-height: 1.25;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .client-card {
    border: 1px solid ${borda};
    border-left: 3px solid ${cor};
    border-radius: 7px;
    background: #FFFFFF;
    padding: 11px 13px 10px;
    margin-bottom: 12px;
  }
  .client-name {
    margin: 3px 0 7px;
    color: #111A2B;
    font-size: 10.6pt;
    line-height: 1.25;
    font-weight: 700;
  }
  .client-details {
    display: grid;
    grid-template-columns: minmax(150px, .8fr) minmax(260px, 1.55fr) minmax(100px, .55fr);
    gap: 10px 18px;
    padding-top: 7px;
    border-top: 1px solid #E9EDF3;
  }
  .detail-value {
    display: block;
    margin-top: 2px;
    color: #44516A;
    font-size: 8.35pt;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .detail-value.contact { color: #526078; }
  .proposal-copy {
    margin: 10px 1px 13px;
    padding: 0 1px 11px;
    border-bottom: 1px solid ${borda};
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .proposal-copy-text {
    color: #37445A;
    font-size: 8.35pt;
    line-height: 1.48;
    font-weight: 400;
    overflow-wrap: anywhere;
  }
  .services-section { margin-top: 13px; }
  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 7px;
  }
  h2 {
    margin: 2px 0 0;
    color: ${corEscura};
    font-size: 10.8pt;
    line-height: 1.2;
    font-weight: 700;
  }
  .item-count {
    color: #718096;
    font-size: 7.8pt;
    white-space: nowrap;
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    border: 1px solid ${borda};
    border-radius: 6px;
    overflow: hidden;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th {
    background: ${corEscura};
    color: #FFFFFF;
    padding: 6px 8px;
    font-size: 7.45pt;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: .018em;
  }
  td {
    padding: 6.5px 8px;
    border-bottom: 1px solid #E6EBF2;
    background: #FFFFFF;
    color: #27344B;
    font-size: 8.25pt;
    line-height: 1.3;
    vertical-align: middle;
  }
  tbody tr:nth-child(even) td { background: #F8FAFD; }
  tbody tr:last-child td { border-bottom: 0; }
  .description-col { width: 55%; text-align: left; }
  .qty-col { width: 9%; text-align: center; }
  .money-col { width: 18%; text-align: right; }
  .description-cell { font-weight: 500; overflow-wrap: anywhere; }
  .qty-cell { text-align: center; color: #56647B; }
  .money-cell { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .subtotal { color: #17233A; font-weight: 700; }
  .empty-services {
    border: 1px solid ${borda};
    border-radius: 6px;
    padding: 10px 12px;
    background: #FAFBFD;
  }
  .empty-services p { margin: 6px 0 0; color: #637089; font-size: 8.4pt; }
  .summary-wrap {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .summary-box {
    width: 285px;
    border: 1px solid ${borda};
    border-radius: 7px;
    background: ${corSuave};
    padding: 10px 13px 9px;
  }
  .summary-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 18px;
  }
  .summary-label {
    color: #5F6D83;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .summary-total {
    color: ${corEscura};
    font-size: 17pt;
    line-height: 1;
    font-weight: 800;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .summary-validity {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid ${borda};
    color: #68758A;
    font-size: 7.45pt;
    text-align: right;
  }
  .signature-section {
    margin-top: 18px;
    padding-top: 9px;
    border-top: 1px solid ${borda};
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .signature-title {
    margin: 0;
    color: ${corEscura};
    font-size: 9.5pt;
    line-height: 1.2;
    font-weight: 700;
  }
  .sig-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px;
    margin-top: 27px;
  }
  .sig-box { text-align: center; min-width: 0; }
  .sig-line { border-top: .8px solid #334155; margin-bottom: 7px; }
  .sig-box strong {
    display: block;
    color: #1D293D;
    font-size: 8.55pt;
    line-height: 1.25;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .sig-box span,
  .sig-box small {
    display: block;
    margin-top: 2px;
    color: #718096;
    font-size: 7.35pt;
    line-height: 1.25;
  }
</style>
</head>
<body>
  <header class="document-head">
    <div>
      <span class="document-kicker">Proposta comercial</span>
      <h1>${escapeHtml(titulo)}</h1>
    </div>
    <div class="document-number">
      <span class="meta-label">Número da proposta</span>
      <strong>${numero}</strong>
    </div>
  </header>

  <section class="client-card">
    <span class="meta-label">Cliente</span>
    <div class="client-name">${escapeHtml(orcamento.cliente_nome || "Cliente não informado")}</div>
    <div class="client-details">
      <div>
        <span class="meta-label">Documento</span>
        <span class="detail-value">${escapeHtml(orcamento.cliente_documento || "Não informado")}</span>
      </div>
      <div>
        <span class="meta-label">Contato</span>
        <span class="detail-value contact">${dadosContato.length ? dadosContato.join(" &nbsp;•&nbsp; ") : "Não informado"}</span>
      </div>
      <div>
        <span class="meta-label">Validade</span>
        <span class="detail-value"><strong>${escapeHtml(validadeTexto)}</strong></span>
      </div>
    </div>
  </section>

  ${conteudoLivreHtml}

  ${servicosHtml}

  <div class="summary-wrap">
    <div class="summary-box">
      <div class="summary-line">
        <span class="summary-label">Total da proposta</span>
        <strong class="summary-total">${moneyBR(valorTotal)}</strong>
      </div>
      <div class="summary-validity">Condições válidas até ${escapeHtml(validadeTexto)}.</div>
    </div>
  </div>

  <section class="signature-section">
    <h2 class="signature-title">Aceite da proposta</h2>
    <div class="sig-grid">${assinaturasHtml}</div>
  </section>
</body>
</html>`;
}

// Gera o orçamento com o MESMO papel timbrado e o MESMO comportamento dos contratos:
// logomarca na primeira página e rodapé institucional completo na última página.
async function gerarPdfOrcamentoPuppeteer(orcamento: Row): Promise<Buffer> {
  return generateBrandedPdfBuffer(gerarHtmlOrcamento(orcamento), {
    brand: normalizeMarca(orcamento.marca),
  });
}
function safePdfFileName(value: unknown, fallback = 'orcamento'): string {
  const base = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return base || fallback;
}

function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\u0020-\u00ff]/g, '')
    .trim();
}

function wrapLine(text: string, maxChars: number): string[] {
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

async function gerarPdfOrcamentoFallback(orcamento: Row, motivo: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = 790;

  const addPageIfNeeded = (needed = 40) => {
    if (y < 70 + needed) {
      page = doc.addPage([595.28, 841.89]);
      y = 790;
    }
  };

  const draw = (text: unknown, opts: { size?: number; bold?: boolean; gap?: number; maxChars?: number; color?: any } = {}) => {
    const lines = wrapLine(String(text ?? ''), opts.maxChars || 92);
    for (const line of lines) {
      addPageIfNeeded(18);
      page.drawText(pdfText(line), {
        x: margin,
        y,
        size: opts.size || 10,
        font: opts.bold ? bold : font,
        color: opts.color || rgb(0.12, 0.16, 0.24),
      });
      y -= (opts.size || 10) + 4;
    }
    y -= opts.gap ?? 6;
  };

  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(1, 1, 1) });
  draw(marcaNome(orcamento.marca), { size: 18, bold: true, gap: 8, maxChars: 50, color: rgb(0.06, 0.18, 0.38) });
  draw('ORÇAMENTO / PROPOSTA COMERCIAL', { size: 15, bold: true, gap: 12, maxChars: 70 });
  draw(`Número: ${orcamento.numero || 'Rascunho'}`, { bold: true });
  draw(`Cliente: ${orcamento.cliente_nome || 'Cliente não informado'}`);
  draw(`Documento: ${orcamento.cliente_documento || 'Não informado'}`);
  draw(`Contato: ${[orcamento.cliente_email, orcamento.cliente_telefone].filter(Boolean).join(' | ') || 'Não informado'}`);
  draw(`Validade: ${orcamento.validade_ate ? fmtDate(orcamento.validade_ate) : `${orcamento.validade_dias || 30} dias`}`);
  draw(`Valor total: ${moneyBR(orcamento.valor_total)}`, { size: 13, bold: true, gap: 12, color: rgb(0.06, 0.25, 0.48) });

  if (String(orcamento.conteudo || '').trim() && orcamento.ocultar_conteudo !== true && orcamento.ocultar_conteudo !== 'true') {
    draw('Escopo / observações:', { bold: true, gap: 4 });
    String(orcamento.conteudo || '').split(/\n+/).forEach((line) => draw(line, { maxChars: 96, gap: 2 }));
    y -= 8;
  }

  const servicos = normalizeServicos(orcamento.itens || []);
  if (servicos.length) {
    draw('Itens e serviços:', { bold: true, gap: 4 });
    servicos.forEach((item, idx) => {
      draw(`${idx + 1}. ${item.descricao} - qtd. ${item.quantidade} - unit. ${moneyBR(item.valor_unitario)} - subtotal ${moneyBR(item.quantidade * item.valor_unitario)}`, { maxChars: 96, gap: 2 });
    });
    y -= 8;
  }

  const assinaturas = normalizeAssinaturas(orcamento.assinaturas || []);
  if (assinaturas.length) {
    draw('Assinaturas:', { bold: true, gap: 8 });
    assinaturas.forEach((a) => draw(`${a.nome || 'Assinante'} - ${a.cargo || a.tipo || 'assinatura'} ${a.documento ? `- ${a.documento}` : ''}`, { maxChars: 92, gap: 3 }));
  }

  addPageIfNeeded(45);
  page.drawText(pdfText('PDF emitido em modo de contingência porque o motor Chromium não respondeu.'), { x: margin, y: 42, size: 8, font, color: rgb(0.6, 0.38, 0.05) });
  page.drawText(pdfText(`Motivo técnico registrado: ${motivo}`.slice(0, 110)), { x: margin, y: 30, size: 7, font, color: rgb(0.55, 0.55, 0.55) });

  return Buffer.from(await doc.save());
}

export async function gerarPdfOrcamentoComFallback(orcamento: Row): Promise<{ pdf: Buffer; fallback: boolean; reason?: string }> {
  try {
    return { pdf: await gerarPdfOrcamentoPuppeteer(orcamento), fallback: false };
  } catch (err: any) {
    const reason = err?.message || String(err);
    console.warn('[orcamentos][pdf] usando fallback sem Chromium:', reason);
    return { pdf: await gerarPdfOrcamentoFallback(orcamento, reason), fallback: true, reason };
  }
}

export async function salvarPdfOrcamento(pool: Pool, orcamento: Row, pdf: Buffer): Promise<string | null> {
  try {
    const columns = await getColumns(pool, 'orcamentos_timbrados');
    const dir = uploadsOrcamentosDir(orcamento.id);
    await fs.promises.mkdir(dir, { recursive: true });
    const nome = `${safePdfFileName(orcamento.numero || orcamento.id, 'orcamento')}.pdf`;
    const filePath = path.join(dir, nome);
    await fs.promises.writeFile(filePath, pdf, { mode: 0o640 });
    if (columns.has('pdf_path')) {
      await pool.query('UPDATE public.orcamentos_timbrados SET pdf_path=$1, atualizado_em=NOW() WHERE id=$2', [filePath, orcamento.id]);
    }
    return filePath;
  } catch (err: any) {
    console.warn('[orcamentos][pdf] não foi possível armazenar PDF:', err?.message || err);
    return null;
  }
}

export async function carregarPdfArmazenado(filePath: unknown): Promise<Buffer | null> {
  const raw = String(filePath || '').trim();
  if (!raw) return null;
  const candidates = [
    path.resolve(raw),
    path.join(getDataDir(), 'uploads', 'orcamentos', path.basename(raw)),
    path.join(getDataDir(), 'uploads', 'orcamentos', path.basename(path.dirname(raw)), path.basename(raw)),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return await fs.promises.readFile(candidate);
    } catch {}
  }
  return null;
}

function uploadsOrcamentosDir(orcamentoId: string): string {
  const dataDir = getDataDir();
  return path.join(dataDir, "uploads", "orcamentos", orcamentoId);
}

async function filtroOrcamentoAtivo(pool: Pool, alias = ""): Promise<string[]> {
  const columns = await getColumns(pool, "orcamentos_timbrados");
  const prefix = alias ? `${alias}.` : "";
  const conditions: string[] = [];
  if (columns.has("arquivado_em")) conditions.push(`${prefix}arquivado_em IS NULL`);
  if (columns.has("payload")) conditions.push(`COALESCE(${prefix}payload->>'_arquivado', 'false') <> 'true'`);
  return conditions;
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
        `SELECT nome_original, mime_type, storage_path
           FROM public.orcamentos_timbrados_anexos
          WHERE id = $1
            AND COALESCE(status, 'ativo') <> 'arquivado'
          LIMIT 1`,
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
        `UPDATE public.orcamentos_timbrados_anexos
            SET status = 'arquivado',
                arquivado_em = NOW(),
                arquivado_por = $2
          WHERE id = $1
            AND COALESCE(status, 'ativo') <> 'arquivado'
          RETURNING orcamento_id, storage_path`,
        [req.params.id, (req as any)?.colaborador?.id || null],
      );
      if (!result.rows.length) return res.status(404).json({ error: "Anexo não encontrado" });
      const row = result.rows[0];
      await pool.query(
        `UPDATE public.orcamentos_timbrados
            SET anexos_count = (
                  SELECT COUNT(*)
                    FROM public.orcamentos_timbrados_anexos
                   WHERE orcamento_id = $1
                     AND COALESCE(status, 'ativo') <> 'arquivado'
                ),
                atualizado_em = NOW(),
                pdf_path = NULL
          WHERE id = $1`,
        [row.orcamento_id],
      );
      res.json({
        ok: true,
        arquivado: true,
        removido_definitivo: false,
        arquivo_fisico_preservado: true,
      });
    } catch (err: any) {
      console.error("[orcamentos][anexo arquivar]", err);
      res.status(500).json({ error: err?.message || "Erro ao arquivar anexo" });
    }
  });

  router.get("/", async (req: Request, res: Response) => {
    try {
      const busca = String(req.query.busca || "").trim();
      const params: any[] = [];
      const conditions = await filtroOrcamentoAtivo(pool);
      if (busca) {
        params.push(`%${busca.toLowerCase()}%`);
        conditions.push(`lower(COALESCE(numero,'') || ' ' || COALESCE(cliente_nome,'') || ' ' || COALESCE(titulo,'')) LIKE $1`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
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
      const filtrosAtivo = await filtroOrcamentoAtivo(pool);
      const whereAtivo = filtrosAtivo.length ? ` AND ${filtrosAtivo.join(" AND ")}` : "";
      const { rows } = await pool.query(
        `SELECT * FROM public.orcamentos_timbrados WHERE id = $1${whereAtivo} LIMIT 1`,
        [req.params.id],
      );
      if (!rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
      const anexos = await pool.query(
        `SELECT id, nome_original, descricao, mime_type, tamanho_bytes,
                '/api/orcamentos/anexos/' || id || '/download' AS url,
                criado_em
           FROM public.orcamentos_timbrados_anexos
          WHERE orcamento_id = $1
            AND COALESCE(status, 'ativo') <> 'arquivado'
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
      const filtrosAtivo = await filtroOrcamentoAtivo(pool);
      const whereAtivo = filtrosAtivo.length ? ` AND ${filtrosAtivo.join(" AND ")}` : "";
      const atual = await pool.query(
        `SELECT id, status FROM public.orcamentos_timbrados WHERE id = $1${whereAtivo} LIMIT 1`,
        [id],
      );
      if (!atual.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });

      const { servicos, payload } = buildPayload(req.body || {});
      if (columns.has("itens")) payload.itens = JSON.stringify(servicos);
      if (columns.has("pdf_path")) payload.pdf_path = null;

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
          WHERE id = $${values.length}${whereAtivo}
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
      const columns = await getColumns(pool, "orcamentos_timbrados");
      const filtrosAtivo = await filtroOrcamentoAtivo(pool);
      const whereAtivo = filtrosAtivo.length ? ` AND ${filtrosAtivo.join(" AND ")}` : "";
      const updates: string[] = ["status = 'cancelado'", "atualizado_em = NOW()"];
      const values: any[] = [id];
      const colaboradorId = (req as any)?.colaborador?.id || null;

      if (columns.has("arquivado_em")) updates.push("arquivado_em = NOW()");
      if (columns.has("arquivado_por")) {
        values.push(colaboradorId);
        updates.push(`arquivado_por = $${values.length}`);
      }
      if (columns.has("payload")) {
        values.push(colaboradorId);
        updates.push(
          `payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
             '_arquivado', true,
             '_arquivado_em', NOW()::text,
             '_arquivado_por', $${values.length}::text
           )`,
        );
      }

      const result = await pool.query(
        `UPDATE public.orcamentos_timbrados
            SET ${updates.join(", ")}
          WHERE id = $1${whereAtivo}
          RETURNING id, numero`,
        values,
      );
      if (!result.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
      res.json({
        ok: true,
        arquivado: result.rows[0],
        removido_definitivo: false,
        anexos_preservados: true,
      });
    } catch (err: any) {
      console.error("[orcamentos][ARQUIVAR]", err);
      res.status(500).json({ error: err?.message || "Erro ao arquivar orçamento" });
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

  async function responderPdfOrcamento(req: Request, res: Response) {
    try {
      const orcamento = await garantirNumeroFinalizado(pool, req.params.id);
      if (!orcamento) return res.status(404).json({ error: "Orçamento não encontrado" });

      const force = ["1", "true", "sim"].includes(String(req.query.regenerar || req.query.force || "").toLowerCase());
      let pdf = force ? null : await carregarPdfArmazenado(orcamento.pdf_path);
      let fallback = false;
      let fallbackReason = "";

      if (!pdf) {
        const generated = await gerarPdfOrcamentoComFallback(orcamento);
        pdf = generated.pdf;
        fallback = generated.fallback;
        fallbackReason = generated.reason || "";
        await salvarPdfOrcamento(pool, orcamento, pdf);
      }

      const nome = `${safePdfFileName(orcamento.numero || "orcamento", "orcamento")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
      res.setHeader("X-Destrava-Pdf-Fallback", fallback ? "true" : "false");
      if (fallbackReason) res.setHeader("X-Destrava-Pdf-Fallback-Reason", encodeURIComponent(fallbackReason.slice(0, 180)));
      res.send(pdf);
    } catch (err: any) {
      console.error("[orcamentos][download]", err);
      res.status(500).json({
        error: "Erro ao gerar PDF do orçamento. Tente novamente e verifique os logs do servidor.",
        code: err?.code || "PDF_GENERATION_FAILED",
      });
    }
  }

  router.get("/:id/download", responderPdfOrcamento);
  router.get("/:id/pdf", responderPdfOrcamento);

  router.post("/:id/anexos", upload.array("arquivos", 10), async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "").trim();
      const filtrosAtivo = await filtroOrcamentoAtivo(pool);
      const whereAtivo = filtrosAtivo.length ? ` AND ${filtrosAtivo.join(" AND ")}` : "";
      const exists = await pool.query(
        `SELECT id FROM public.orcamentos_timbrados WHERE id = $1${whereAtivo} LIMIT 1`,
        [id],
      );
      if (!exists.rows.length) return res.status(404).json({ error: "Orçamento não encontrado" });
      const files = (req.files || []) as Express.Multer.File[];
      if (!files.length) return res.status(400).json({ error: "Nenhum arquivo enviado" });

      const dir = uploadsOrcamentosDir(id);
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
             (orcamento_id, tipo, descricao, nome_original, mime_type, tamanho_bytes, storage_path, hash_sha256, criado_por)
           VALUES ($1, 'anexo', $2, $3, $4, $5, $6, $7, $8)
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
                atualizado_em = NOW(),
                pdf_path = NULL
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
