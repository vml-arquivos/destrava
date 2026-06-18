import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";
import CompensacaoSemanalCard from "@/components/CompensacaoSemanalCard";
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from "@/lib/currency";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Acompanhamento = Record<string, any>;
type AtualizacaoForm = {
  numero_semana: number;
  data_referencia_inicio: string;
  data_referencia_fim: string;
  data_atualizacao: string;
  proxima_atualizacao_apos_salvar: string;
  entrada_maquininha: number;
  entrada_pix: number;
  entrada_boleto: number;
  entrada_ted: number;
  entrada_dinheiro: number;
  outras_entradas: number;
  total_saidas: number;
  saldo_medio: number;
  saldo_final: number;
  quantidade_transacoes: number;
  rating_bacen: string;
  rating_interno: string;
  scr_status: string;
  cenprot_status: string;
  serasa_status: string;
  cnd_status: string;
  pld_aml_status: string;
  coaf_status: string;
  possui_restricao: boolean;
  restricao_nova: boolean;
  devolucao_ou_estorno: boolean;
  ocorrencia_negativa: boolean;
  analise_semana: string;
  orientacao_cliente: string;
  proxima_acao: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateBR(value?: string | null): string {
  if (!value) return "-";
  try {
    const s = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return value;
    const d = new Date(s + "T00:00:00Z");
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  } catch {
    return "-";
  }
}

function moneyBR(value?: unknown): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizePermValue(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function podeAcessarAcompanhamentoBancario(user: any): boolean {
  if (!user) return false;
  if (user?.acesso_acompanhamento_bancario === true) return true;
  const permitidos = new Set([
    "admin",
    "administrador",
    "super_admin",
    "superadmin",
    "gestor_credito",
    "gestor de credito",
    "gestor_de_credito",
  ]);
  return (
    permitidos.has(normalizePermValue(user?.cargo)) ||
    permitidos.has(normalizePermValue(user?.perfil)) ||
    permitidos.has(normalizePermValue(user?.role))
  );
}

function hojeEhQuarta(): boolean {
  return new Date().getDay() === 3;
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function proximaQuartaFeira(base: string | Date): string {
  const d =
    typeof base === "string"
      ? new Date(base + (base.length === 10 ? "T00:00:00Z" : ""))
      : new Date(base);
  d.setUTCHours(12, 0, 0, 0);
  const dia = d.getUTCDay();
  const diff = ((3 - dia + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseDateLocal(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function todayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function calcularCamposSemana(row: Acompanhamento): Pick<
  AtualizacaoForm,
  | "numero_semana"
  | "data_referencia_inicio"
  | "data_referencia_fim"
  | "data_atualizacao"
  | "proxima_atualizacao_apos_salvar"
> {
  const atualizacoes: any[] = Array.isArray(row.atualizacoes)
    ? row.atualizacoes
    : [];
  const dataInicio = String(row.data_inicio || hojeISO()).slice(0, 10);

  if (atualizacoes.length === 0) {
    const fimPeriodo = proximaQuartaFeira(dataInicio);
    const proxima = proximaQuartaFeira(fimPeriodo);
    return {
      numero_semana: 1,
      data_referencia_inicio: dataInicio,
      data_referencia_fim: fimPeriodo,
      data_atualizacao: fimPeriodo,
      proxima_atualizacao_apos_salvar: proxima,
    };
  }

  const ordenadas = [...atualizacoes].sort(
    (a, b) => Number(a.numero_semana) - Number(b.numero_semana)
  );
  const ultima = ordenadas[ordenadas.length - 1];
  const ultimoFim = String(ultima.data_referencia_fim || "").slice(0, 10);
  const novoInicio = ultimoFim ? addDays(ultimoFim, 1) : dataInicio;
  const novoFim = proximaQuartaFeira(novoInicio);
  const proxima = proximaQuartaFeira(novoFim);

  return {
    numero_semana: Number(ultima.numero_semana || 0) + 1,
    data_referencia_inicio: novoInicio,
    data_referencia_fim: novoFim,
    data_atualizacao: novoFim,
    proxima_atualizacao_apos_salvar: proxima,
  };
}

function calcularStatusSemana(
  form: AtualizacaoForm,
  saldoSemanal: number
): string {
  if (
    form.restricao_nova ||
    form.ocorrencia_negativa ||
    form.devolucao_ou_estorno
  )
    return "atencao";
  if (saldoSemanal > 0) return "positiva";
  if (saldoSemanal < 0) return "negativa";
  return "neutra";
}

function calcularRecomendacao(row: Acompanhamento): string {
  if (row.recomendacao) return row.recomendacao;
  if (row.status_pendente || row.atualizacao_pendente)
    return "Dados semanais pendentes.";
  const status = String(row.status_semana || "").toLowerCase();
  if (status === "negativa")
    return "Ponto de atenção: reforçar movimentação e acompanhar saídas.";
  if (status === "positiva") return "Evolução favorável.";
  if (status === "atencao") return "Revisar restrições.";
  if (row.status === "prorrogado") return "Acompanhamento prorrogado.";
  return "Continuar acompanhamento.";
}

function whatsappUrl(row: Acompanhamento): string {
  if (row.whatsapp_lembrete_url) return row.whatsapp_lembrete_url;
  const rawPhone = String(
    row.whatsapp_cliente || row.telefone_cliente || ""
  ).replace(/\D/g, "");
  if (!rawPhone) return "";
  const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;

  const atualizacoes: any[] = Array.isArray(row.atualizacoes)
    ? row.atualizacoes
    : [];
  const proxSemana =
    atualizacoes.length > 0
      ? Math.max(...atualizacoes.map((a: any) => Number(a.numero_semana || 0))) +
        1
      : 1;
  const campos = calcularCamposSemana(row);
  const dataInicio = formatDateBR(campos.data_referencia_inicio);
  const dataFim = formatDateBR(campos.data_referencia_fim);

  const message =
    `Olá! Aqui é a equipe da Destrava Crédito. Hoje é dia de atualizar o acompanhamento bancário da empresa ${row.nome_empresa || ""} no banco ${row.banco_observado || ""}. ` +
    `Pode nos enviar os dados da semana ${proxSemana}, período de ${dataInicio} a ${dataFim}: ` +
    `entradas por Pix, maquininha, boletos, TED, dinheiro, total de saídas, saldo e informações de rating?`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function statusBadge(status?: string | null): string {
  const value = String(status || "pendente").toLowerCase();
  const classes: Record<string, string> = {
    positiva: "bg-green-50 text-green-700 border-green-200",
    negativo: "bg-red-50 text-red-700 border-red-200",
    negativa: "bg-red-50 text-red-700 border-red-200",
    atencao: "bg-amber-50 text-amber-700 border-amber-200",
    atenção: "bg-amber-50 text-amber-700 border-amber-200",
    pendente: "bg-blue-50 text-blue-700 border-blue-200",
    neutra: "bg-gray-50 text-gray-700 border-gray-200",
  };
  return classes[value] || "bg-gray-50 text-gray-700 border-gray-200";
}

function labelStatus(status?: string | null): string {
  const value = String(status || "").trim();
  if (!value) return "Pendente";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function normalizeRows(payload: any): Acompanhamento[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.acompanhamentos)) return payload.acompanhamentos;
  return [];
}

function getToken(): string {
  try {
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      localStorage.getItem("jwt") ||
      localStorage.getItem("destrava_token") ||
      ""
    );
  } catch {
    return "";
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}


const PRESTADORAS_RELATORIO = {
  destrava: {
    key: "destrava",
    nome: "Destrava Crédito",
    marca: "DESTRAVA",
    documento: "Destrava Crédito",
    corPrimaria: "#0B3B82",
    corSecundaria: "#EAF1FB",
    slogan: "Assessoria de crédito empresarial",
    logoUrl: "/destrava-logo-color.svg",
    logoAlt: "Logo oficial Destrava Crédito",
  },
  permupay: {
    key: "permupay",
    nome: "PermuPay",
    marca: "PERMUPAY",
    documento: "PermuPay",
    corPrimaria: "#111827",
    corSecundaria: "#F3F4F6",
    slogan: "Soluções financeiras e relacionamento bancário",
    logoUrl: "",
    logoAlt: "PermuPay",
  },
} as const;

type PrestadoraKey = keyof typeof PRESTADORAS_RELATORIO;

function prestadoraMeta(key?: string | null) {
  return PRESTADORAS_RELATORIO[(key as PrestadoraKey) || "destrava"] || PRESTADORAS_RELATORIO.destrava;
}

function slugArquivo(value: unknown): string {
  return String(value || "arquivo")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nomeArquivoRelatorio(row: Acompanhamento, prestadoraKey: PrestadoraKey = "destrava", ext = "pdf"): string {
  const prestadora = prestadoraMeta(prestadoraKey);
  const empresa = slugArquivo(row?.nome_empresa || "EMPRESA");
  const banco = slugArquivo(row?.banco_observado || "BANCO");
  const cnpj = slugArquivo(row?.cnpj || "");
  const data = hojeISO();
  const sufixoCnpj = cnpj ? `-${cnpj}` : "";
  return `relatorio-acompanhamento-bancario-${slugArquivo(prestadora.nome)}-${empresa}-${banco}${sufixoCnpj}-${data}.${ext}`;
}

function logoRelatorioHtml(prestadoraKey: PrestadoraKey = "destrava"): string {
  const prestadora = prestadoraMeta(prestadoraKey);
  if (prestadora.logoUrl) {
    const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
    return `<img class="brand-logo-img" src="${base}${prestadora.logoUrl}" alt="${prestadora.logoAlt}" />`;
  }
  return `<div class="brand-logo-text">${prestadora.marca}</div>`;
}

function totalEntradasSemana(item: any): number {
  return (
    Number(item?.total_entradas || 0) ||
    Number(item?.entrada_maquininha || 0) +
      Number(item?.entrada_pix || 0) +
      Number(item?.entrada_boleto || 0) +
      Number(item?.entrada_ted || 0) +
      Number(item?.entrada_dinheiro || 0) +
      Number(item?.outras_entradas || 0)
  );
}

function atualizacoesOrdenadas(row: Acompanhamento): any[] {
  return (Array.isArray(row?.atualizacoes) ? row.atualizacoes : [])
    .filter(Boolean)
    .sort((a: any, b: any) => Number(a.numero_semana || 0) - Number(b.numero_semana || 0));
}

/**
 * REGRA INEGOCIÁVEL: A semana em evidência é SEMPRE a semana da data atual.
 *
 * Lógica:
 * 1. Procura a semana cujo período (início–fim) contém hoje.
 *    → Se encontrada, essa é a semana atual (mesmo que ainda não tenha sido
 *      alimentada na quarta-feira — ela existe no sistema e está em andamento).
 * 2. Se hoje não está dentro de nenhum período registrado, exibe a última
 *    semana cujo fim já passou (semana mais recente encerrada).
 * 3. NUNCA exibe semana futura (início > hoje).
 * 4. A alimentação ocorre toda quarta-feira; antes disso, a semana em curso
 *    pode aparecer sem dados completos — isso é esperado.
 */
function getSemanaAtual(row: Acompanhamento): any | null {
  const atualizacoes = atualizacoesOrdenadas(row);
  if (!atualizacoes.length) return null;

  const hoje = todayLocal();

  // Passo 1: semana cujo período contém hoje (início <= hoje <= fim)
  const semanaEmCurso = atualizacoes.find((semana) => {
    const inicio = parseDateLocal(semana?.data_referencia_inicio);
    const fim = parseDateLocal(semana?.data_referencia_fim);
    if (!inicio || !fim) return false;
    if (fim < inicio) return false;
    // Semana futura: bloqueada
    if (inicio > hoje) return false;
    // Hoje está dentro do período
    return inicio <= hoje && hoje <= fim;
  });

  if (semanaEmCurso) return semanaEmCurso;

  // Passo 2: semanas encerradas (fim < hoje) — retorna a mais recente
  const semanasEncerradas = atualizacoes.filter((semana) => {
    const inicio = parseDateLocal(semana?.data_referencia_inicio);
    const fim = parseDateLocal(semana?.data_referencia_fim);
    if (!inicio || !fim) return false;
    if (fim < inicio) return false;
    // Nunca futura
    if (inicio > hoje) return false;
    return fim < hoje;
  });

  if (semanasEncerradas.length) {
    return semanasEncerradas[semanasEncerradas.length - 1];
  }

  // Passo 3: nenhuma semana válida para hoje
  return null;
}

function calcularEvolucaoAcompanhamento(row: Acompanhamento) {
  const atualizacoes = atualizacoesOrdenadas(row);
  if (atualizacoes.length === 0) {
    return {
      primeira: null,
      atual: null,
      variacaoEntradas: 0,
      variacaoSaldo: 0,
      leitura: "Nenhuma semana registrada ainda.",
      tendencia: "neutra",
    };
  }

  const primeira = atualizacoes[0];
  const atual = atualizacoes[atualizacoes.length - 1];
  const entradasPrimeira = totalEntradasSemana(primeira);
  const entradasAtual = totalEntradasSemana(atual);
  const saldoPrimeiro = Number(primeira.saldo_semanal || 0);
  const saldoAtual = Number(atual.saldo_semanal || 0);
  const variacaoEntradas = entradasAtual - entradasPrimeira;
  const variacaoSaldo = saldoAtual - saldoPrimeiro;

  let leitura = "Acompanhamento estável. Manter rotina semanal e observar rating.";
  let tendencia = "neutra";
  if (variacaoEntradas > 0 && variacaoSaldo >= 0) {
    leitura = "Evolução favorável: entradas e saldo mostram melhora frente ao início.";
    tendencia = "positiva";
  } else if (variacaoEntradas < 0 || variacaoSaldo < 0) {
    leitura = "Ponto de atenção: a semana atual mostra piora em relação ao início.";
    tendencia = "negativa";
  }

  return { primeira, atual, variacaoEntradas, variacaoSaldo, leitura, tendencia };
}

function exportarCSV(row: Acompanhamento, prestadoraKey: PrestadoraKey = "destrava") {
  const prestadora = prestadoraMeta(prestadoraKey);
  const atualizacoes = atualizacoesOrdenadas(row);
  const semanaAtual = getSemanaAtual(row);
  const evolucao = calcularEvolucaoAcompanhamento(row);

  const safe = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const slug = (value: unknown) =>
    String(value || "arquivo")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const saldoUltimaSemana = semanaAtual?.saldo_semanal ?? row.saldo_semanal;

  const statusClass = (value: unknown) => {
    const normalized = String(value || "").toLowerCase();
    if (normalized.includes("neg")) return "negativo";
    if (normalized.includes("aten")) return "atencao";
    if (normalized.includes("pos")) return "positivo";
    return "neutro";
  };

  const semanaRows = atualizacoes
    .map((item) => {
      const totalEntradas = totalEntradasSemana(item);
      const isAtual = Number(item.numero_semana) === Number(semanaAtual?.numero_semana);
      return `
        <tr class="${isAtual ? "current-row" : ""}">
          <td>Semana ${safe(item.numero_semana)}${isAtual ? " — Atual" : ""}</td>
          <td>${safe(formatDateBR(item.data_referencia_inicio))} a ${safe(formatDateBR(item.data_referencia_fim))}</td>
          <td class="money">${safe(moneyBR(item.entrada_maquininha))}</td>
          <td class="money">${safe(moneyBR(item.entrada_pix))}</td>
          <td class="money">${safe(moneyBR(item.entrada_boleto))}</td>
          <td class="money">${safe(moneyBR(item.entrada_ted))}</td>
          <td class="money">${safe(moneyBR(item.entrada_dinheiro))}</td>
          <td class="money">${safe(moneyBR(item.outras_entradas))}</td>
          <td class="money strong">${safe(moneyBR(totalEntradas))}</td>
          <td class="money">${safe(moneyBR(item.total_saidas))}</td>
          <td class="money ${Number(item.saldo_semanal || 0) < 0 ? "negative" : "positive"}">${safe(moneyBR(item.saldo_semanal))}</td>
          <td class="money">${safe(moneyBR(item.saldo_medio))}</td>
          <td class="money">${safe(moneyBR(item.saldo_final))}</td>
          <td>${safe(item.quantidade_transacoes || 0)}</td>
          <td>${safe(item.rating_bacen || "-")}</td>
          <td>${safe(item.rating_interno || "-")}</td>
          <td>${safe(item.scr_status || item.restricao_scr || "-")}</td>
          <td>${safe(item.cenprot_status || item.restricao_cenprot || "-")}</td>
          <td>${safe(item.serasa_status || item.restricao_serasa || "-")}</td>
          <td>${safe(item.cnd_status || item.cnd_regular || "-")}</td>
          <td>${safe(item.pld_aml_status || item.pld_aml || "-")}</td>
          <td>${safe(item.coaf_status || item.operacao_suspeita_coaf || "-")}</td>
          <td><span class="badge ${statusClass(item.status_semana || item.status)}">${safe(labelStatus(item.status_semana || item.status))}</span></td>
          <td>${safe(item.analise_semana || "-")}</td>
          <td>${safe(item.orientacao_cliente || "-")}</td>
          <td>${safe(item.proxima_acao || "-")}</td>
        </tr>`;
    })
    .join("");

  const assinaturaResponsavel = row.responsavel_nome || "Responsável pelo acompanhamento";
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #ffffff; }
    .brand { background: ${prestadora.corPrimaria}; color: white; padding: 20px 24px; border-radius: 14px; }
    .brand-row { display: flex; align-items: center; gap: 16px; }
    .brand-logo-box { width: 150px; min-width: 150px; height: 58px; border: 2px solid rgba(255,255,255,.72); border-radius: 14px; background: rgba(255,255,255,.96); display: inline-flex; align-items: center; justify-content: center; padding: 8px; }
    .brand-logo-img { max-width: 132px; max-height: 42px; object-fit: contain; display: block; }
    .brand-logo-text { color: ${prestadora.corPrimaria}; font-weight: 900; letter-spacing: .08em; font-size: 16px; }
    .brand h1 { margin: 0; font-size: 22px; }
    .brand p { margin: 4px 0 0; font-size: 12px; opacity: .92; }
    .section { margin-top: 18px; }
    .section-title { color: ${prestadora.corPrimaria}; font-weight: 800; font-size: 14px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .card { border: 1px solid #dbe4f0; border-radius: 10px; padding: 10px; background: #f8fafc; min-height: 58px; }
    .featured { border: 2px solid ${prestadora.corPrimaria}; background: ${prestadora.corSecundaria}; }
    .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
    .value { font-size: 14px; font-weight: 700; margin-top: 4px; }
    .value.negative, .negative { color: #dc2626; font-weight: 700; }
    .value.positive, .positive { color: #15803d; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 11px; }
    th { background: ${prestadora.corSecundaria}; color: ${prestadora.corPrimaria}; border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    td { border: 1px solid #e2e8f0; padding: 7px; vertical-align: top; }
    tr.current-row td { background: #fff7ed; border-top: 2px solid #f59e0b; border-bottom: 2px solid #f59e0b; }
    .money { text-align: right; white-space: nowrap; }
    .strong { font-weight: 700; }
    .badge { border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 700; }
    .badge.negativo { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge.positivo { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge.atencao { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .badge.neutro { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .note { border-left: 4px solid ${prestadora.corPrimaria}; background: #eff6ff; padding: 12px; border-radius: 8px; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 28px; }
    .signature { border-top: 1px solid #334155; padding-top: 8px; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="brand">
    <div class="brand-row">
      <div class="brand-logo-box">${logoRelatorioHtml(prestadoraKey)}</div>
      <div>
        <h1>Relatório Técnico de Acompanhamento Financeiro Semanal</h1>
        <p>${safe(prestadora.nome)} — ${safe(prestadora.slogan)}</p>
        <p>${safe(row.nome_empresa)} — ${safe(row.banco_observado)} | Gerado em ${safe(new Date().toLocaleDateString("pt-BR"))}</p>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Semana atual em evidência (data de hoje)</div>
    <div class="grid">
      <div class="card featured"><div class="label">Semana atual</div><div class="value">Semana ${safe(semanaAtual?.numero_semana || "-")}</div></div>
      <div class="card featured"><div class="label">Período</div><div class="value">${safe(formatDateBR(semanaAtual?.data_referencia_inicio))} a ${safe(formatDateBR(semanaAtual?.data_referencia_fim))}</div></div>
      <div class="card featured"><div class="label">Total de entradas</div><div class="value">${safe(moneyBR(totalEntradasSemana(semanaAtual)))}</div></div>
      <div class="card featured"><div class="label">Saldo semanal</div><div class="value ${Number(semanaAtual?.saldo_semanal || 0) < 0 ? "negative" : "positive"}">${safe(moneyBR(semanaAtual?.saldo_semanal))}</div></div>
      <div class="card"><div class="label">Rating Bacen</div><div class="value">${safe(semanaAtual?.rating_bacen || row.rating_bacen_atual || "-")}</div></div>
      <div class="card"><div class="label">Rating interno</div><div class="value">${safe(semanaAtual?.rating_interno || row.rating_interno_atual || "-")}</div></div>
      <div class="card"><div class="label">Status</div><div class="value">${safe(labelStatus(semanaAtual?.status_semana || semanaAtual?.status || row.status_semana))}</div></div>
      <div class="card"><div class="label">Atualização</div><div class="value">${safe(formatDateBR(semanaAtual?.data_atualizacao || semanaAtual?.data_referencia_fim))}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Resumo executivo</div>
    <div class="grid">
      <div class="card"><div class="label">Empresa</div><div class="value">${safe(row.nome_empresa || "-")}</div></div>
      <div class="card"><div class="label">CNPJ</div><div class="value">${safe(row.cnpj || "-")}</div></div>
      <div class="card"><div class="label">Banco</div><div class="value">${safe(row.banco_observado || "-")}</div></div>
      <div class="card"><div class="label">Responsável</div><div class="value">${safe(row.responsavel_nome || "-")}</div></div>
      <div class="card"><div class="label">Status</div><div class="value">${safe(labelStatus(row.status))}</div></div>
      <div class="card"><div class="label">Próxima atualização</div><div class="value">${safe(formatDateBR(row.proxima_atualizacao))}</div></div>
      <div class="card"><div class="label">Rating atual</div><div class="value">${safe(row.rating_interno_atual || row.rating_bacen_atual || "-")}</div></div>
      <div class="card"><div class="label">Saldo última semana</div><div class="value ${Number(saldoUltimaSemana || 0) < 0 ? "negative" : "positive"}">${safe(moneyBR(saldoUltimaSemana))}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Evolução do acompanhamento</div>
    <div class="grid">
      <div class="card"><div class="label">Variação de entradas</div><div class="value ${evolucao.variacaoEntradas < 0 ? "negative" : "positive"}">${safe(moneyBR(evolucao.variacaoEntradas))}</div></div>
      <div class="card"><div class="label">Variação de saldo</div><div class="value ${evolucao.variacaoSaldo < 0 ? "negative" : "positive"}">${safe(moneyBR(evolucao.variacaoSaldo))}</div></div>
      <div class="card" style="grid-column: span 2;"><div class="label">Leitura operacional</div><div class="value">${safe(evolucao.leitura)}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Indicadores financeiros</div>
    <div class="grid">
      <div class="card"><div class="label">Faturamento anual</div><div class="value">${safe(moneyBR(row.faturamento_anual))}</div></div>
      <div class="card"><div class="label">Média mensal</div><div class="value">${safe(moneyBR(row.media_mensal))}</div></div>
      <div class="card"><div class="label">Margem ±30%</div><div class="value">${safe(moneyBR(row.margem_seguranca_30))}</div></div>
      <div class="card"><div class="label">Valor pretendido</div><div class="value">${safe(moneyBR(row.valor_credito_pretendido))}</div></div>
    </div>
  </div>
  <div class="section note">
    <strong>Objetivo do crédito:</strong> ${safe(row.objetivo_credito || "-")}<br />
    <strong>Linha pretendida:</strong> ${safe(row.linha_credito_pretendida || "-")}<br />
    <strong>Recomendação operacional:</strong> ${safe(calcularRecomendacao(row))}
  </div>
  <div class="section">
    <div class="section-title">Histórico semanal completo</div>
    <table>
      <thead>
        <tr>
          <th>Semana</th><th>Período</th><th>Máquina</th><th>PIX</th><th>Boleto</th><th>TED</th><th>Dinheiro</th><th>Outras</th>
          <th>Total entradas</th><th>Saídas</th><th>Saldo</th><th>Saldo médio</th><th>Saldo final</th><th>Transações</th><th>Rating Bacen</th><th>Rating interno</th>
          <th>SCR</th><th>Cenprot</th><th>Serasa</th><th>CND</th><th>PLD/AML</th><th>COAF</th><th>Status</th>
          <th>Análise</th><th>Orientação</th><th>Próxima ação</th>
        </tr>
      </thead>
      <tbody>
        ${semanaRows || `<tr><td colspan="26">Nenhuma atualização semanal registrada.</td></tr>`}
      </tbody>
    </table>
  </div>

  <div class="section note">
    Declaro, para fins de registro operacional, que este relatório representa o acompanhamento bancário semanal prestado pela ${safe(prestadora.nome)} à empresa ${safe(row.nome_empresa || "-")}, com base nas informações fornecidas e registradas no sistema.
  </div>

  <div class="signature-grid">
    <div class="signature">
      ${safe(assinaturaResponsavel)}<br />
      Responsável ${safe(prestadora.nome)}
    </div>
    <div class="signature">
      Responsável legal da empresa contratante<br />
      ${safe(row.nome_empresa || "-")} — CNPJ ${safe(row.cnpj || "-")}
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivoRelatorio(row, prestadoraKey, "xls");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportarRelatorioMensalPDF(row: Acompanhamento, authHeaders: () => Record<string, string>) {
  if (!row?.id) return;
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}/relatorio-mensal`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ano, mes }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    alert(`Erro ao gerar relatório mensal: ${text || resp.statusText}`);
    return;
  }

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const contentDisposition = resp.headers.get("content-disposition") || "";
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  const fileName = match?.[1] || nomeArquivoRelatorio(row, "destrava", "pdf").replace("relatorio-", "relatorio-mensal-bancario-");

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ─── Bancos sugeridos ─────────────────────────────────────────────────────────
const BANCOS_SUGERIDOS = [
  "SICOOB", "Caixa", "Banco do Brasil", "Bradesco", "Itaú",
  "Santander", "Sicredi", "Cresol", "Inter", "Cora", "Stone", "Outro",
];

// ─── Campos do formulário Novo Acompanhamento ─────────────────────────────────
const NOVO_FIELDS = [
  { key: "nome_empresa", label: "Empresa", required: true, group: "empresa" },
  { key: "cnpj", label: "CNPJ", group: "empresa" },
  { key: "telefone_cliente", label: "Telefone", group: "empresa" },
  { key: "whatsapp_cliente", label: "WhatsApp", group: "empresa" },
  { key: "email_cliente", label: "E-mail", group: "empresa" },
  { key: "banco_observado", label: "Banco observado", required: true, group: "banco", type: "banco" },
  { key: "agencia", label: "Agência", group: "banco" },
  { key: "conta", label: "Conta", group: "banco" },
  { key: "gerente_banco", label: "Gerente do banco", group: "banco" },
  { key: "contato_banco", label: "Contato do banco", group: "banco" },
  { key: "data_abertura_conta", label: "Data de abertura/relacionamento", type: "date", group: "banco" },
  { key: "data_inicio", label: "Início do acompanhamento", type: "date", group: "banco", required: true },
  { key: "objetivo_credito", label: "Objetivo do crédito", group: "objetivo" },
  { key: "valor_credito_pretendido", label: "Valor pretendido", type: "number", group: "objetivo" },
  { key: "linha_credito_pretendida", label: "Linha pretendida", group: "objetivo" },
  { key: "rating_bacen_inicial", label: "Rating Bacen inicial", group: "rating" },
  { key: "rating_interno_inicial", label: "Rating interno inicial", group: "rating" },
  { key: "faturamento_anual", label: "Faturamento anual", type: "number", group: "rating" },
  { key: "media_mensal", label: "Média mensal", type: "number", group: "rating" },
  { key: "margem_seguranca_30", label: "Margem de segurança 30%", type: "number", group: "rating" },
  { key: "observacoes_iniciais", label: "Observações iniciais", textarea: true, group: "gestao" },
];


const EDIT_FIELDS = [
  { key: "status", label: "Status", group: "controle" },
  { key: "data_fim_prevista", label: "Fim previsto", type: "date", group: "controle" },
  { key: "proxima_atualizacao", label: "Próxima atualização", type: "date", group: "controle" },
  { key: "rating_bacen_atual", label: "Rating Bacen atual", group: "controle" },
  { key: "rating_interno_atual", label: "Rating interno atual", group: "controle" },
  { key: "observacoes_finais", label: "Observações finais", textarea: true, group: "controle" },
];

// ─── Estado inicial do formulário de atualização ──────────────────────────────
function updFormInicial(): AtualizacaoForm {
  return {
    numero_semana: 1,
    data_referencia_inicio: "",
    data_referencia_fim: "",
    data_atualizacao: "",
    proxima_atualizacao_apos_salvar: "",
    entrada_maquininha: 0,
    entrada_pix: 0,
    entrada_boleto: 0,
    entrada_ted: 0,
    entrada_dinheiro: 0,
    outras_entradas: 0,
    total_saidas: 0,
    saldo_medio: 0,
    saldo_final: 0,
    quantidade_transacoes: 0,
    rating_bacen: "",
    rating_interno: "",
    scr_status: "",
    cenprot_status: "",
    serasa_status: "",
    cnd_status: "",
    pld_aml_status: "",
    coaf_status: "",
    possui_restricao: false,
    restricao_nova: false,
    devolucao_ou_estorno: false,
    ocorrencia_negativa: false,
    analise_semana: "",
    orientacao_cliente: "",
    proxima_acao: "",
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function AcompanhamentoBancario() {
  const { colaborador } = useAuth();
  const canAccess = podeAcessarAcompanhamentoBancario(colaborador);

  const [rows, setRows] = useState<Acompanhamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [banco, setBanco] = useState("");
  const [pendentes, setPendentes] = useState(false);

  const [novoOpen, setNovoOpen] = useState(false);
  const [updOpen, setUpdOpen] = useState<Acompanhamento | null>(null);
  const [detalhe, setDetalhe] = useState<Acompanhamento | null>(null);
  const [imprimirOpen, setImprimirOpen] = useState<Acompanhamento | null>(null);
  const [prestadoraRelatorio, setPrestadoraRelatorio] = useState<PrestadoraKey>("destrava");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoSemanaNumero, setEditandoSemanaNumero] = useState<number | null>(null);

  const [novo, setNovo] = useState<Acompanhamento>({
    nome_empresa: "",
    banco_observado: "",
    data_inicio: hojeISO(),
  });

  const [upd, setUpd] = useState<AtualizacaoForm>(updFormInicial());

  const printFrameRef = useRef<HTMLIFrameElement>(null);

  // ─── Cálculos automáticos ────────────────────────────────────────────────────
  const totalEntradas =
    Number(upd.entrada_maquininha || 0) +
    Number(upd.entrada_pix || 0) +
    Number(upd.entrada_boleto || 0) +
    Number(upd.entrada_ted || 0) +
    Number(upd.entrada_dinheiro || 0) +
    Number(upd.outras_entradas || 0);

  const saldoSemanal = totalEntradas - Number(upd.total_saidas || 0);
  const statusSemanaCalculado = calcularStatusSemana(upd, saldoSemanal);

  // ─── Fetch de dados ──────────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("busca", search.trim());
      if (statusFiltro && statusFiltro !== "todos") q.set("status", statusFiltro);
      if (pendentes) q.set("pendentes", "true");

      const response = await fetch(
        `/api/acompanhamentos-bancarios?${q.toString()}`,
        { headers: authHeaders() }
      );
      if (!response.ok) { setRows([]); return; }
      const payload = await response.json();
      setRows(normalizeRows(payload));
    } catch (error) {
      console.error("[ACOMPANHAMENTO] Erro ao buscar dados:", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  // ─── Filtros locais ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesBanco =
        !banco.trim() ||
        String(row.banco_observado || "")
          .toLowerCase()
          .includes(banco.trim().toLowerCase());
      return matchesBanco;
    });
  }, [rows, banco]);

  // ─── Resumo ──────────────────────────────────────────────────────────────────
  const resumo = useMemo(
    () => ({
      acompanhamento: filtered.filter((r) => r.status === "em_acompanhamento").length,
      pendentes: filtered.filter((r) => r.status_pendente || r.atualizacao_pendente).length,
      positivas: filtered.filter((r) => r.status_semana === "positiva").length,
      negativas: filtered.filter((r) => r.status_semana === "negativa").length,
      prorrogados: filtered.filter((r) => r.status === "prorrogado").length,
      prontos: filtered.filter((r) => {
        const rec = String(r.recomendacao || "").toLowerCase();
        return rec.includes("pronto") || rec.includes("nova análise");
      }).length,
    }),
    [filtered]
  );


  const limparNovo = () => {
    setNovo({ nome_empresa: "", banco_observado: "", data_inicio: hojeISO() });
    setEditandoId(null);
    setNovoOpen(false);
  };

  const abrirEditarAcompanhamento = async (row: Acompanhamento) => {
    let rowCompleto = row;
    try {
      const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, {
        headers: authHeaders(),
      });
      if (resp.ok) rowCompleto = await resp.json();
    } catch {
      /* usa row original */
    }

    setNovo({
      id: rowCompleto.id,
      nome_empresa: rowCompleto.nome_empresa || "",
      cnpj: rowCompleto.cnpj || "",
      telefone_cliente: rowCompleto.telefone_cliente || "",
      whatsapp_cliente: rowCompleto.whatsapp_cliente || "",
      email_cliente: rowCompleto.email_cliente || "",
      banco_observado: rowCompleto.banco_observado || "",
      agencia: rowCompleto.agencia || "",
      conta: rowCompleto.conta || "",
      gerente_banco: rowCompleto.gerente_banco || "",
      contato_banco: rowCompleto.contato_banco || "",
      data_abertura_conta: String(rowCompleto.data_abertura_conta || "").slice(0, 10),
      data_inicio: String(rowCompleto.data_inicio || hojeISO()).slice(0, 10),
      data_fim_prevista: String(rowCompleto.data_fim_prevista || "").slice(0, 10),
      proxima_atualizacao: String(rowCompleto.proxima_atualizacao || "").slice(0, 10),
      objetivo_credito: rowCompleto.objetivo_credito || "",
      valor_credito_pretendido: rowCompleto.valor_credito_pretendido ?? "",
      linha_credito_pretendida: rowCompleto.linha_credito_pretendida || "",
      rating_bacen_inicial: rowCompleto.rating_bacen_inicial || "",
      rating_bacen_atual: rowCompleto.rating_bacen_atual || "",
      rating_interno_inicial: rowCompleto.rating_interno_inicial || "",
      rating_interno_atual: rowCompleto.rating_interno_atual || "",
      faturamento_anual: rowCompleto.faturamento_anual ?? "",
      media_mensal: rowCompleto.media_mensal ?? "",
      margem_seguranca_30: rowCompleto.margem_seguranca_30 ?? "",
      status: rowCompleto.status || "em_acompanhamento",
      observacoes_iniciais: rowCompleto.observacoes_iniciais || "",
      observacoes_finais: rowCompleto.observacoes_finais || "",
    });

    setEditandoId(rowCompleto.id);
    setDetalhe(null);
    setUpdOpen(null);
    setNovoOpen(true);
  };

  const abrirEditarSemana = async (row: Acompanhamento, semana: any) => {
    let rowCompleto = row;
    try {
      const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, {
        headers: authHeaders(),
      });
      if (resp.ok) rowCompleto = await resp.json();
    } catch {
      /* usa row original */
    }

    // Normalizar o número da semana: alguns registros legados podem ter "0" ou valor falsy
    // O back-end só aceita semanas >= 1, portanto convertemos qualquer valor 0, "0", null ou undefined para 1.
    let numeroSemana: number;
    {
      const raw = (semana as any).numero_semana;
      const parsed = raw !== null && raw !== undefined && raw !== "" ? Number(raw) : NaN;
      numeroSemana = !isNaN(parsed) && parsed > 0 ? parsed : 1;
    }
    const dataFim = String(semana.data_referencia_fim || semana.data_atualizacao || rowCompleto.proxima_atualizacao || hojeISO()).slice(0, 10);
    const proxima = semana.proxima_atualizacao_apos_salvar || proximaQuartaFeira(dataFim);

    setUpdOpen(rowCompleto);
    setEditandoSemanaNumero(numeroSemana);
    setUpd({
      ...updFormInicial(),
      numero_semana: numeroSemana,
      data_referencia_inicio: String(semana.data_referencia_inicio || "").slice(0, 10),
      data_referencia_fim: String(semana.data_referencia_fim || "").slice(0, 10),
      data_atualizacao: String(semana.data_atualizacao || semana.data_referencia_fim || "").slice(0, 10),
      proxima_atualizacao_apos_salvar: String(proxima || "").slice(0, 10),
      entrada_maquininha: Number(semana.entrada_maquininha || 0),
      entrada_pix: Number(semana.entrada_pix || 0),
      entrada_boleto: Number(semana.entrada_boleto || 0),
      entrada_ted: Number(semana.entrada_ted || 0),
      entrada_dinheiro: Number(semana.entrada_dinheiro || 0),
      outras_entradas: Number(semana.outras_entradas || 0),
      total_saidas: Number(semana.total_saidas || 0),
      saldo_medio: Number(semana.saldo_medio || 0),
      saldo_final: Number(semana.saldo_final || 0),
      quantidade_transacoes: Number(semana.quantidade_transacoes || 0),
      rating_bacen: semana.rating_bacen || "",
      rating_interno: semana.rating_interno || "",
      scr_status: semana.scr_status || semana.restricao_scr || "",
      cenprot_status: semana.cenprot_status || semana.restricao_cenprot || "",
      serasa_status: semana.serasa_status || semana.restricao_serasa || "",
      cnd_status: semana.cnd_status || semana.cnd_regular || "",
      pld_aml_status: semana.pld_aml_status || semana.pld_aml || "",
      coaf_status: semana.coaf_status || semana.operacao_suspeita_coaf || "",
      possui_restricao: Boolean(semana.possui_restricao),
      restricao_nova: Boolean(semana.restricao_nova),
      devolucao_ou_estorno: Boolean(semana.devolucao_ou_estorno),
      ocorrencia_negativa: Boolean(semana.ocorrencia_negativa),
      analise_semana: semana.analise_semana || "",
      orientacao_cliente: semana.orientacao_cliente || "",
      proxima_acao: semana.proxima_acao || "",
    });
    setDetalhe(null);
  };

  // ─── Abrir modal de atualização ───────────────────────────────────────────────
  const abrirAtualizacao = async (row: Acompanhamento) => {
    let rowComAtualizacoes = row;
    try {
      const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, {
        headers: authHeaders(),
      });
      if (resp.ok) rowComAtualizacoes = await resp.json();
    } catch { /* usa row sem atualizações */ }

    const campos = calcularCamposSemana(rowComAtualizacoes);
    setEditandoSemanaNumero(null);
    setUpdOpen(rowComAtualizacoes);
    setUpd({ ...updFormInicial(), ...campos });
  };

  // ─── Salvar novo acompanhamento ───────────────────────────────────────────────
  const salvarNovo = async () => {
    if (!novo.nome_empresa?.trim() || !novo.banco_observado?.trim()) {
      alert("Informe pelo menos empresa e banco observado.");
      return;
    }
    setSaving(true);
    try {
      const url = editandoId
        ? `/api/acompanhamentos-bancarios/${editandoId}`
        : "/api/acompanhamentos-bancarios";

      const response = await fetch(url, {
        method: editandoId ? "PATCH" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(novo),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        alert(`Erro ao ${editandoId ? "atualizar" : "salvar"} acompanhamento. ${errorText}`);
        return;
      }
      setNovoOpen(false);
      setEditandoId(null);
      setNovo({ nome_empresa: "", banco_observado: "", data_inicio: hojeISO() });
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  // ─── Sincronizar dados cadastrais do acompanhamento com o cadastro oficial da empresa ──
  const sincronizarCadastroEmpresa = async (row: Acompanhamento) => {
    if (!row?.id) return;
    const ok = confirm(
      "Atualizar os dados cadastrais deste acompanhamento com o cadastro oficial da empresa? Nome, CNPJ, telefone, WhatsApp, e-mail e faturamento serão sincronizados."
    );
    if (!ok) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/acompanhamentos-bancarios/${row.id}/sincronizar-cadastro`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        alert(payload?.error || "Erro ao atualizar os dados cadastrais do acompanhamento.");
        return;
      }

      alert(payload?.message || "Dados cadastrais atualizados com sucesso.");
      await fetchData();

      if (detalhe?.id === row.id) {
        const detalheResp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, { headers: authHeaders() });
        if (detalheResp.ok) setDetalhe(await detalheResp.json());
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Salvar atualização semanal / edição de semana já salva ──────────────────
  const salvarAtualizacao = async () => {
    if (!updOpen?.id) return;
    setSaving(true);
    try {
      // Monta o payload apenas com os campos aceitos pela API.  
      // Desestruturamos o objeto `upd` para remover propriedades internas
      // que não são reconhecidas pelo backend (por exemplo,
      // `proxima_atualizacao_apos_salvar`) e evitamos enviar a string
      // formatada de período, que causava falhas na atualização.  
      const { proxima_atualizacao_apos_salvar, ...updData } = upd;
      const payload = {
        ...updData,
        total_entradas: totalEntradas,
        saldo_semanal: saldoSemanal,
        status_semana: statusSemanaCalculado,
      };
      const url = editandoSemanaNumero
        ? `/api/acompanhamentos-bancarios/${updOpen.id}/atualizacoes/${editandoSemanaNumero}`
        : `/api/acompanhamentos-bancarios/${updOpen.id}/atualizacoes`;
      const method = editandoSemanaNumero ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        alert(`Erro ao ${editandoSemanaNumero ? "editar a semana" : "salvar atualização"}. ${errorText}`);
        return;
      }

      const acompanhamentoId = updOpen.id;
      setUpdOpen(null);
      setEditandoSemanaNumero(null);
      await fetchData();

      // Se a edição partiu do relatório de detalhes, reabre o detalhe já atualizado
      try {
        const detalheResp = await fetch(`/api/acompanhamentos-bancarios/${acompanhamentoId}`, {
          headers: authHeaders(),
        });
        if (detalheResp.ok) setDetalhe(await detalheResp.json());
      } catch {
        /* detalhe é reaberto apenas se a API responder */
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Apagar semana lançada ───────────────────────────────────────────────────
  const apagarSemana = async (row: Acompanhamento, semana: any) => {
    if (!row?.id || !semana) return;

    // Normaliza a referência da semana a ser apagada. Existem registros legados onde
    // `numero_semana` é "0" ou 0. O back-end rejeita número 0, portanto, quando
    // o valor for 0 ou inválido, usamos o UUID (semana.id) como referência.
    let semanaRef: any;
    {
      const raw = (semana as any).numero_semana;
      const parsed = raw !== null && raw !== undefined && raw !== "" ? Number(raw) : NaN;
      // Se parsed for um número >= 1 usamos esse número; caso contrário, use o id (UUID) da semana.
      semanaRef = !isNaN(parsed) && parsed > 0 ? parsed : (semana as any).id;
    }

    if (semanaRef === null || semanaRef === undefined) {
      alert("Não foi possível identificar a semana para apagar.");
      return;
    }

    const ok = confirm(
      "Tem certeza que deseja apagar esta semana? Essa ação removerá os lançamentos da semana e recalculará todo o acompanhamento."
    );

    if (!ok) return;

    setSaving(true);

    try {
      const response = await fetch(
        `/api/acompanhamentos-bancarios/${row.id}/atualizacoes/${semanaRef}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        alert(`Erro ao apagar semana. ${errorText}`);
        return;
      }

      await fetchData();

      const detalheResp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, {
        headers: authHeaders(),
      });

      if (detalheResp.ok) {
        const atualizado = await detalheResp.json();
        setDetalhe(atualizado);
        setImprimirOpen((prev) => (prev?.id === atualizado.id ? atualizado : prev));
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Carregar detalhe ─────────────────────────────────────────────────────────
  const carregarDetalhe = async (id: string) => {
    const response = await fetch(`/api/acompanhamentos-bancarios/${id}`, {
      headers: authHeaders(),
    });
    if (!response.ok) { alert("Não foi possível carregar os detalhes."); return; }
    setDetalhe(await response.json());
  };

  // ─── Prorrogar ────────────────────────────────────────────────────────────────
  const prorrogar = async (id: string) => {
    if (!confirm("Prorrogar este acompanhamento por mais 30 dias?")) return;
    await fetch(`/api/acompanhamentos-bancarios/${id}/prorrogar`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    fetchData();
  };

  // ─── Encerrar ─────────────────────────────────────────────────────────────────
  const encerrar = async (id: string) => {
    const observacoes_finais = prompt("Observações finais do encerramento:") || "";
    await fetch(`/api/acompanhamentos-bancarios/${id}/encerrar`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ observacoes_finais }),
    });
    fetchData();
  };

  // ─── Adicionar outro banco ────────────────────────────────────────────────────
  const adicionarOutroBanco = (row: Acompanhamento) => {
    setNovo({
      nome_empresa: row.nome_empresa || "",
      cnpj: row.cnpj || "",
      telefone_cliente: row.telefone_cliente || "",
      whatsapp_cliente: row.whatsapp_cliente || "",
      email_cliente: row.email_cliente || "",
      banco_observado: "",
      agencia: "",
      conta: "",
      gerente_banco: "",
      contato_banco: "",
      data_abertura_conta: "",
      data_inicio: hojeISO(),
      objetivo_credito: "",
      observacoes_iniciais: "",
    });
    setEditandoId(null);
    setDetalhe(null);
    setUpdOpen(null);
    setNovoOpen(true);
  };

  // ─── Imprimir ─────────────────────────────────────────────────────────────────
  const abrirImpressao = async (row: Acompanhamento) => {
    let rowCompleto = row;
    try {
      const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, {
        headers: authHeaders(),
      });
      if (resp.ok) rowCompleto = await resp.json();
    } catch { /* usa row sem atualizações */ }
    setImprimirOpen(rowCompleto);
  };

  const htmlEscape = (value: any) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const gerarHtmlRelatorioA4 = (acomp: Acompanhamento, prestadora: PrestadoraKey) => {
    const meta = prestadoraMeta(prestadora);
    const semanaAtual = getSemanaAtual(acomp);
    const evolucao = calcularEvolucaoAcompanhamento(acomp);
    // REGRA: somente semanas cuja data de início <= hoje (nunca futuras)
    const hoje = todayLocal();
    const atualizacoes = (Array.isArray(acomp.atualizacoes) ? acomp.atualizacoes : [])
      .filter((s: any) => {
        const ini = parseDateLocal(s?.data_referencia_inicio);
        return !ini || ini <= hoje;
      })
      .sort((a: any, b: any) => Number(a.numero_semana || 0) - Number(b.numero_semana || 0));
    const saldoAtual = Number(semanaAtual?.saldo_semanal || 0);
    const logoBlock = meta.logoUrl
      ? `<img src="${htmlEscape(meta.logoUrl)}" alt="${htmlEscape(meta.logoAlt)}" />`
      : `<strong>${htmlEscape(meta.marca)}</strong>`;

    // Fallback de cálculo de aderência por semana (quando migration 025 não foi aplicada)
    const fatAnual = Number(acomp.faturamento_anual || 0);
    const semanasMes = 4;
    const tetoMensalBase = fatAnual > 0 ? Math.round((fatAnual / 12 * 1.30) * 100) / 100 : 0;
    const refSemanalBase = fatAnual > 0 ? Math.round((tetoMensalBase / semanasMes) * 100) / 100 : 0;

    // Acumulados mensais por mês
    const acumuladosPorMes: Record<string, number> = {};
    for (const s of atualizacoes) {
      const mes = (s.data_referencia_inicio || '').slice(0, 7);
      if (mes) {
        const ent = Number(s.total_entradas || 0) || totalEntradasSemana(s);
        acumuladosPorMes[mes] = (acumuladosPorMes[mes] || 0) + ent;
      }
    }

    const rows = atualizacoes.length
      ? atualizacoes.map((item: any) => {
          const saldo = Number(item.saldo_semanal || 0);
          const entradas = Number(item.total_entradas || 0) || totalEntradasSemana(item);
          const isAtual = Number(item.numero_semana) === Number(semanaAtual?.numero_semana);
          // Aderência: usa campos do banco ou calcula fallback
          const refSem = Number(item.referencia_semanal_base || 0) || refSemanalBase;
          const tetoSem = Number(item.teto_semanal_movimentacao || 0) || refSemanalBase;
          const pctSem = refSem > 0 ? Number(item.percentual_uso_semanal || 0) || Math.round((entradas / refSem) * 1000) / 10 : 0;
          const mes = (item.data_referencia_inicio || '').slice(0, 7);
          const acumMes = Number(item.acumulado_mensal || 0) || (acumuladosPorMes[mes] || 0);
          const tetoMes = Number(item.teto_mensal_movimentacao || 0) || tetoMensalBase;
          const pctMes = tetoMes > 0 ? Number(item.percentual_uso_mensal || 0) || Math.round((acumMes / tetoMes) * 1000) / 10 : 0;
          const statusAd = item.status_aderencia || (pctSem > 130 ? 'acima_do_teto' : pctSem < 50 ? 'abaixo_da_referencia' : 'dentro_da_faixa');
          const alertaAd = Boolean(item.alerta_aderencia) || pctSem > 130 || pctSem < 50;
          const corAd = statusAd === 'dentro_da_faixa' ? '#047857' : statusAd === 'abaixo_da_referencia' ? '#b45309' : '#dc2626';
          const labelAd = statusAd === 'dentro_da_faixa' ? '✔ OK' : statusAd === 'abaixo_da_referencia' ? '▼ Baixo' : '▲ Alto';
          const rowStyle = isAtual ? 'background:#fff9df;font-weight:bold;' : '';
          return `
            <tr style="${rowStyle}">
              <td class="center" style="${isAtual ? 'color:#92400e;font-weight:bold;' : ''}">${htmlEscape(item.numero_semana || "-")}${isAtual ? '<br/><span style="font-size:5.5pt;color:#92400e;">● Atual</span>' : ''}</td>
              <td style="font-size:6.5pt;">${htmlEscape(formatDateBR(item.data_referencia_inicio))}<br/>a ${htmlEscape(formatDateBR(item.data_referencia_fim))}</td>
              <td class="right">${htmlEscape(moneyBR(item.entrada_maquininha))}</td>
              <td class="right">${htmlEscape(moneyBR(item.entrada_pix))}</td>
              <td class="right">${htmlEscape(moneyBR(item.entrada_boleto))}</td>
              <td class="right">${htmlEscape(moneyBR(item.entrada_ted))}</td>
              <td class="right">${htmlEscape(moneyBR(item.entrada_dinheiro))}</td>
              <td class="right">${htmlEscape(moneyBR(item.outras_entradas))}</td>
              <td class="right strong green">${htmlEscape(moneyBR(entradas))}</td>
              <td class="right red">${htmlEscape(moneyBR(item.total_saidas))}</td>
              <td class="right ${saldo < 0 ? 'red' : 'green'} strong">${htmlEscape(moneyBR(saldo))}</td>
              <td class="right" style="font-size:6pt;">${htmlEscape(moneyBR(item.saldo_medio))}</td>
              <td class="center">${htmlEscape(item.rating_bacen || "-")}</td>
              <td class="center">${htmlEscape(item.rating_interno || "-")}</td>
              <td class="right" style="font-size:6pt;">${htmlEscape(moneyBR(refSem))}</td>
              <td class="right ${pctSem > 130 ? 'red' : pctSem < 50 ? 'amber' : 'green'}">${htmlEscape(pctSem.toFixed(1))}%</td>
              <td class="right" style="font-size:6pt;">${htmlEscape(pctMes.toFixed(1))}%</td>
              <td class="center" style="color:${corAd};font-weight:bold;font-size:6.5pt;">${alertaAd ? '⚠ ' : ''}${labelAd}</td>
              <td>${htmlEscape(labelStatus(item.status_semana || item.status || "-"))}</td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="18">Nenhuma atualização registrada.</td></tr>`;
    const analises = atualizacoes.filter((item: any) => item.analise_semana || item.orientacao_cliente || item.proxima_acao).length
      ? atualizacoes.filter((item: any) => item.analise_semana || item.orientacao_cliente || item.proxima_acao).map((item: any) => `
        <div class="analysis-row">
          <strong>Semana ${htmlEscape(item.numero_semana || "-")}</strong>
          <span><b>Análise:</b> ${htmlEscape(item.analise_semana || "-")}</span>
          <span><b>Orientação:</b> ${htmlEscape(item.orientacao_cliente || "-")}</span>
          <span><b>Próxima ação:</b> ${htmlEscape(item.proxima_acao || "-")}</span>
        </div>
      `).join("")
      : `<div class="analysis-row">Nenhuma análise semanal registrada.</div>`;


    // === Cálculos de aderência para o PDF (fallback sem migration 025) ===
    const pdfFatAno = Number(acomp.faturamento_anual || 0);
    const pdfTetoMesRef = pdfFatAno > 0 ? Math.round((pdfFatAno / 12 * 1.30) * 100) / 100 : 0;
    const pdfRefSemRef = pdfFatAno > 0 ? Math.round((pdfTetoMesRef / 4) * 100) / 100 : 0;
    const pdfMediaMesRef = pdfFatAno > 0 ? Math.round((pdfFatAno / 12) * 100) / 100 : 0;
    const pdfEntradasSemAtual = totalEntradasSemana(semanaAtual);
    const pdfMesSemAtual = semanaAtual?.data_referencia_inicio?.slice(0, 7) || '';
    const pdfAcumMesAtual = atualizacoes
      .filter((s: any) => (s.data_referencia_inicio || '').slice(0, 7) === pdfMesSemAtual)
      .reduce((acc: number, s: any) => acc + (Number(s.total_entradas || 0) || totalEntradasSemana(s)), 0);
    const pdfRefSemFinal = Number(semanaAtual?.referencia_semanal_base || 0) || pdfRefSemRef;
    const pdfTetoMesFinal = Number(semanaAtual?.teto_mensal_movimentacao || 0) || pdfTetoMesRef;
    const pdfMediaMesFinal = Number(semanaAtual?.faturamento_mensal_base || 0) || pdfMediaMesRef;
    const pdfAcumMesFinal = Number(semanaAtual?.acumulado_mensal || 0) || pdfAcumMesAtual;
    const pdfPctSemFinal = pdfRefSemFinal > 0 ? Number(semanaAtual?.percentual_uso_semanal || 0) || Math.round((pdfEntradasSemAtual / pdfRefSemFinal) * 1000) / 10 : 0;
    const pdfPctMesFinal = pdfTetoMesFinal > 0 ? Number(semanaAtual?.percentual_uso_mensal || 0) || Math.round((pdfAcumMesFinal / pdfTetoMesFinal) * 1000) / 10 : 0;
    const pdfStatusAdFinal = semanaAtual?.status_aderencia || (pdfPctSemFinal > 130 ? 'acima_do_teto' : pdfPctSemFinal < 50 ? 'abaixo_da_referencia' : 'dentro_da_faixa');
    const pdfAlertaFinal = Boolean(semanaAtual?.alerta_aderencia) || pdfPctSemFinal > 130 || pdfPctSemFinal < 50;
    const pdfMotivoFinal = semanaAtual?.motivo_alerta_aderencia || (pdfPctSemFinal > 130 ? `Movimentação acima do teto semanal (${pdfPctSemFinal.toFixed(1)}%). Reduza nas próximas semanas.` : pdfPctSemFinal < 50 ? `Movimentação muito abaixo da referência (${pdfPctSemFinal.toFixed(1)}%). Aumente para manter o padrão.` : '');
    const pdfDiagFinal = semanaAtual?.diagnostico_tecnico || semanaAtual?.diagnostico_compensacao || '';
    const pdfCorAdFinal = pdfStatusAdFinal === 'dentro_da_faixa' ? '#047857' : pdfStatusAdFinal === 'abaixo_da_referencia' ? '#b45309' : '#dc2626';
    const pdfLabelAdFinal = pdfStatusAdFinal === 'dentro_da_faixa' ? '✔ Dentro da faixa' : pdfStatusAdFinal === 'abaixo_da_referencia' ? '▼ Abaixo da referência' : '▲ Acima do teto';
    const pdfPctAnualFinal = Number(semanaAtual?.percentual_uso_anual || 0);
    const pdfMetaDinamica = Number(semanaAtual?.meta_base_dinamica || 0) || pdfRefSemFinal;
    const pdfTetoDinamico = Number(semanaAtual?.teto_dinamico_proxima || 0) || pdfRefSemFinal;
    const pdfSemanasRestantes = semanaAtual?.semanas_restantes_mes || '-';

    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${htmlEscape(nomeArquivoRelatorio(acomp, prestadora, "pdf").replace(/\.pdf$/i, ""))}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #0f172a;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { width: 281mm; }
  .page {
    width: 281mm;
    min-height: 194mm;
    margin: 0 auto;
    padding: 0;
    background: #fff;
  }
  .header {
    display: grid;
    grid-template-columns: 44mm 1fr;
    align-items: center;
    gap: 8mm;
    padding: 7mm;
    border-radius: 5mm;
    background: ${htmlEscape(meta.corPrimaria)};
    color: #fff;
    page-break-inside: avoid;
  }
  .logo {
    height: 22mm;
    border-radius: 4mm;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3mm;
  }
  .logo img { max-width: 35mm; max-height: 16mm; object-fit: contain; }
  .logo strong { color: ${htmlEscape(meta.corPrimaria)}; font-size: 17pt; letter-spacing: .12em; }
  h1 { margin: 0; font-size: 20pt; line-height: 1.1; }
  .subtitle { margin: 1.5mm 0 0; font-size: 8.5pt; opacity: .9; }
  h2 { margin: 3mm 0 0; font-size: 13pt; line-height: 1.15; }
  .meta { margin-top: 1.5mm; font-size: 8pt; opacity: .9; }
  .current {
    margin-top: 5mm;
    padding: 5mm;
    border: 1.2pt solid #f6d766;
    border-radius: 4mm;
    background: #fff9df;
    page-break-inside: avoid;
  }
  .section-title {
    margin: 0 0 3mm;
    font-size: 12pt;
    color: #92400e;
  }
  .grid-6 {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 3mm;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3mm;
  }
  .item { font-size: 8.5pt; line-height: 1.25; }
  .item b { display: block; font-size: 7.2pt; text-transform: uppercase; color: #64748b; margin-bottom: .8mm; }
  .kpis {
    margin-top: 5mm;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 3mm;
    page-break-inside: avoid;
  }
  .kpi {
    border: 1px solid #dbe4ef;
    border-radius: 3mm;
    padding: 3mm;
    min-height: 16mm;
    background: #f8fafc;
    font-size: 8.2pt;
  }
  .kpi b { display:block; color:#64748b; font-size: 6.8pt; text-transform: uppercase; margin-bottom: 1mm; }
  .kpi strong { font-size: 9.6pt; }
  h3 {
    margin: 5mm 0 2.5mm;
    font-size: 12pt;
    color: #0f172a;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 6.8pt;
    page-break-inside: auto;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 1.35mm 1mm;
    text-align: left;
    vertical-align: middle;
    overflow-wrap: anywhere;
    word-break: normal;
  }
  th {
    background: #eef3f8;
    color: #334155;
    font-weight: 700;
  }
  tr { page-break-inside: avoid; }
  .center { text-align: center; }
  .right { text-align: right; }
  .strong { font-weight: 700; }
  .green { color: #047857; }
  .red { color: #dc2626; }
  .amber { color: #b45309; }
  .note {
    margin-top: 4mm;
    padding: 3.2mm;
    border: 1px solid #bfdbfe;
    border-radius: 3mm;
    background: #eff6ff;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }
  .declaration {
    margin-top: 4mm;
    padding: 3.2mm;
    border: 1px solid #d1d5db;
    border-radius: 3mm;
    background: #f9fafb;
    font-size: 8.2pt;
    line-height: 1.35;
    page-break-inside: avoid;
  }
  .analysis {
    margin-top: 4mm;
    display: grid;
    gap: 2mm;
    page-break-inside: avoid;
  }
  .analysis-row {
    border: 1px solid #e2e8f0;
    border-radius: 2.5mm;
    padding: 2.5mm;
    display: grid;
    grid-template-columns: 20mm 1fr 1fr 1fr;
    gap: 3mm;
    font-size: 7.6pt;
    background: #fff;
  }
  .signatures {
    margin-top: 10mm;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 25mm;
    page-break-inside: avoid;
  }
  .signature {
    border-top: 1px solid #111827;
    padding-top: 2mm;
    text-align: center;
    font-size: 8pt;
  }
  .footer {
    margin-top: 5mm;
    border-top: 1px solid #e5e7eb;
    padding-top: 2mm;
    color: #64748b;
    font-size: 7.2pt;
  }
  @media print {
    @page { size: A4 landscape; margin: 8mm; }
    html {
      width: 281mm !important;
      height: auto !important;
    }
    body {
      width: 281mm !important;
      height: auto !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      /* Garantir que não haja duplicidade: body só tem um filho (main.page) */
    }
    /* Apenas o main.page é visível; nada mais no body */
    body > * { display: none !important; }
    body > main.page { display: block !important; }
    .page {
      width: 281mm !important;
      max-width: 281mm !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
    }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    .signatures { page-break-inside: avoid; }
    .declaration { page-break-inside: avoid; }
    .current { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="logo">${logoBlock}</div>
      <div>
        <h1>Relatório Técnico de Acompanhamento Financeiro Semanal</h1>
        <p class="subtitle">${htmlEscape(meta.nome)} — ${htmlEscape(meta.slogan)}</p>
        <h2>${htmlEscape(acomp.nome_empresa || "-")} — ${htmlEscape(acomp.banco_observado || "-")}</h2>
        <p class="meta">CNPJ: ${htmlEscape(acomp.cnpj || "-")} | Gerado em: ${htmlEscape(new Date().toLocaleDateString("pt-BR"))}</p>
      </div>
    </header>

    <section class="current">
      <h3 class="section-title">Semana atual em evidência (data de hoje)</h3>
      <div class="grid-6">
        <div class="item"><b>Semana</b>${semanaAtual ? `Semana ${htmlEscape(semanaAtual.numero_semana)}` : "-"}</div>
        <div class="item"><b>Período</b>${htmlEscape(formatDateBR(semanaAtual?.data_referencia_inicio))} a ${htmlEscape(formatDateBR(semanaAtual?.data_referencia_fim))}</div>
        <div class="item"><b>Entradas</b>${htmlEscape(moneyBR(totalEntradasSemana(semanaAtual)))}</div>
        <div class="item"><b>Saldo</b><span class="${saldoAtual < 0 ? "red" : "green"} strong">${htmlEscape(moneyBR(saldoAtual))}</span></div>
        <div class="item"><b>Rating interno</b>${htmlEscape(semanaAtual?.rating_interno || acomp.rating_interno_atual || "-")}</div>
        <div class="item"><b>Status</b>${htmlEscape(labelStatus(semanaAtual?.status_semana || semanaAtual?.status || acomp.status_semana))}</div>
      </div>
    </section>


    <section class="kpis" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:3mm;padding:3mm;margin-top:5mm;">
      <div class="kpi" style="background:#fff;"><b>Faturamento anual</b><strong>${htmlEscape(moneyBR(pdfFatAno))}</strong></div>
      <div class="kpi" style="background:#fff;"><b>Média mensal</b><strong>${htmlEscape(moneyBR(pdfMediaMesFinal))}</strong></div>
      <div class="kpi" style="background:#fff;"><b>Teto mensal (+30%)</b><strong>${htmlEscape(moneyBR(pdfTetoMesFinal))}</strong></div>
      <div class="kpi" style="background:#fff;"><b>Referência semanal</b><strong>${htmlEscape(moneyBR(pdfRefSemFinal))}</strong></div>
      <div class="kpi" style="background:#fff;"><b>Acumulado mês</b><strong>${htmlEscape(moneyBR(pdfAcumMesFinal))}</strong></div>
      <div class="kpi" style="background:#fff;color:${pdfCorAdFinal};"><b>Status aderência</b><strong>${pdfAlertaFinal ? '⚠ ' : ''}${pdfLabelAdFinal}</strong></div>
    </section>
    <section class="kpis">
      <div class="kpi"><b>Uso semanal</b><strong style="color:${pdfPctSemFinal > 130 ? '#dc2626' : pdfPctSemFinal < 50 ? '#b45309' : '#047857'}">${htmlEscape(pdfPctSemFinal.toFixed(1))}%</strong></div>
      <div class="kpi"><b>Uso mensal</b><strong style="color:${pdfPctMesFinal > 100 ? '#dc2626' : pdfPctMesFinal < 70 ? '#b45309' : '#047857'}">${htmlEscape(pdfPctMesFinal.toFixed(1))}%</strong></div>
      <div class="kpi"><b>Uso anual</b><strong>${htmlEscape(pdfPctAnualFinal.toFixed(1))}%</strong></div>
      <div class="kpi"><b>Meta dinâmica/sem.</b><strong>${htmlEscape(moneyBR(pdfMetaDinamica))}</strong></div>
      <div class="kpi"><b>Teto dinâmico/sem.</b><strong>${htmlEscape(moneyBR(pdfTetoDinamico))}</strong></div>
      <div class="kpi"><b>Sem. restantes mês</b><strong>${htmlEscape(String(pdfSemanasRestantes))}</strong></div>
    </section>
    ${pdfAlertaFinal && pdfMotivoFinal ? `<div class="note" style="border-color:#fca5a5;background:#fff1f2;"><b>⚠ Alerta de aderência:</b> ${htmlEscape(pdfMotivoFinal)}</div>` : ''}
    ${pdfDiagFinal ? `<div class="note"><b>Diagnóstico técnico:</b><br/>${htmlEscape(pdfDiagFinal).replace(/\n/g, '<br/>')}</div>` : ''}

    <section class="kpis">
      <div class="kpi"><b>Rating Bacen</b><strong>${htmlEscape(acomp.rating_bacen_atual || acomp.rating_bacen_inicial || "-")}</strong></div>
      <div class="kpi"><b>Rating Inicial</b><strong>${htmlEscape(acomp.rating_interno_inicial || "-")}</strong></div>
      <div class="kpi"><b>Rating Atual</b><strong>${htmlEscape(acomp.rating_interno_atual || "-")}</strong></div>
      <div class="kpi"><b>Faturamento anual</b><strong>${htmlEscape(moneyBR(acomp.faturamento_anual))}</strong></div>
      <div class="kpi"><b>Média mensal</b><strong>${htmlEscape(moneyBR(acomp.media_mensal))}</strong></div>
      <div class="kpi"><b>Margem ±30%</b><strong>${htmlEscape(moneyBR(acomp.margem_seguranca_30))}</strong></div>
    </section>

    <section class="kpis">
      <div class="kpi"><b>Início</b><strong>${htmlEscape(formatDateBR(acomp.data_inicio))}</strong></div>
      <div class="kpi"><b>Fim previsto</b><strong>${htmlEscape(formatDateBR(acomp.data_fim_prevista))}</strong></div>
      <div class="kpi"><b>Próxima atualização</b><strong>${htmlEscape(formatDateBR(acomp.proxima_atualizacao))}</strong></div>
      <div class="kpi"><b>Status</b><strong>${htmlEscape(labelStatus(acomp.status))}</strong></div>
      <div class="kpi"><b>Responsável</b><strong>${htmlEscape(acomp.responsavel_nome || "-")}</strong></div>
      <div class="kpi"><b>Evolução</b><strong>${htmlEscape(evolucao.leitura)}</strong></div>
    </section>

    <h3>Histórico Semanal — Movimentação e Aderência</h3>
    <p style="font-size:7pt;color:#64748b;margin:0 0 2mm;">Referência: faturamento anual × 130% ÷ 12 ÷ semanas do mês. Semanas futuras não aparecem.</p>
    <table>
      <thead>
        <tr>
          <th rowspan="2" style="width: 8mm;">Sem.</th>
          <th rowspan="2" style="width: 20mm;">Período</th>
          <th colspan="7" style="text-align:center;background:#d1fae5;color:#065f46;">Entradas</th>
          <th colspan="3" style="text-align:center;background:#fee2e2;color:#991b1b;">Saídas e Saldos</th>
          <th colspan="2" style="text-align:center;background:#dbeafe;color:#1e40af;">Rating</th>
          <th colspan="4" style="text-align:center;background:#fef9c3;color:#92400e;">Aderência Financeira</th>
          <th rowspan="2" style="width: 14mm;">Status</th>
        </tr>
        <tr>
          <th>Máquina</th>
          <th>PIX</th>
          <th>Boleto</th>
          <th>TED</th>
          <th>Dinheiro</th>
          <th>Outras</th>
          <th style="background:#d1fae5;color:#065f46;">Total</th>
          <th>Saídas</th>
          <th>Saldo</th>
          <th>Saldo méd.</th>
          <th style="width: 9mm;">Bacen</th>
          <th style="width: 9mm;">Interno</th>
          <th style="background:#fef9c3;color:#92400e;">Ref. sem.</th>
          <th style="background:#fef9c3;color:#92400e;">% sem.</th>
          <th style="background:#fef9c3;color:#92400e;">% mês</th>
          <th style="background:#fef9c3;color:#92400e;">Aderência</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="note"><b>Recomendação operacional:</b> ${htmlEscape(calcularRecomendacao(acomp))}</div>

    <section class="analysis">
      ${analises}
    </section>

    <div class="declaration">
      <b>Declaração de prestação de serviço:</b> Este relatório registra o acompanhamento bancário semanal prestado pela ${htmlEscape(meta.nome)} à empresa ${htmlEscape(acomp.nome_empresa || "-")}, com base nos dados fornecidos e atualizados no sistema.
    </div>

    <section class="signatures">
      <div class="signature">
        ${htmlEscape(acomp.responsavel_nome || "Responsável pelo acompanhamento")}<br/>
        Responsável ${htmlEscape(meta.nome)}
      </div>
      <div class="signature">
        Responsável legal da empresa contratante<br/>
        ${htmlEscape(acomp.nome_empresa || "-")} — CNPJ ${htmlEscape(acomp.cnpj || "-")}
      </div>
    </section>

    <footer class="footer">
      ${htmlEscape(meta.nome)} — Documento gerado em ${htmlEscape(new Date().toLocaleDateString("pt-BR"))} às ${htmlEscape(new Date().toLocaleTimeString("pt-BR"))}
    </footer>
  </main>
</body>
</html>`;
  };

  const handleImprimir = () => {
    if (!imprimirOpen) return;

    const frame = printFrameRef.current;
    const win = frame?.contentWindow;

    if (!win) {
      alert("Não foi possível carregar o relatório para impressão. Feche e abra o relatório novamente.");
      return;
    }

    try {
      win.document.title = nomeArquivoRelatorio(imprimirOpen, prestadoraRelatorio, "pdf").replace(/\.pdf$/i, "");
      win.focus();
      win.print();
    } catch {
      alert("Não foi possível iniciar a impressão. Atualize a página e tente novamente.");
    }
  };

  const renderActionButtons = (row: Acompanhamento) => {
    const whats = whatsappUrl(row);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={() => carregarDetalhe(row.id)}
        >Detalhes</button>
        <button
          className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
          onClick={() => abrirEditarAcompanhamento(row)}
        >Editar</button>
        <button
          className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
          disabled={saving}
          onClick={() => sincronizarCadastroEmpresa(row)}
          title="Puxa para este acompanhamento os mesmos dados cadastrais já atualizados no módulo Empresas"
        >Atualizar cadastro</button>
        <button
          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          onClick={() => abrirAtualizacao(row)}
        >Atualizar semana</button>
        <button
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          onClick={() => adicionarOutroBanco(row)}
          title="Criar acompanhamento separado para outro banco da mesma empresa"
        >+ Banco</button>
        {whats && (
          <a
            className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100"
            href={whats}
            target="_blank"
            rel="noreferrer"
          >WhatsApp</a>
        )}
        <button
          className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 transition hover:bg-purple-100"
          onClick={() => abrirImpressao(row)}
        >Imprimir</button>
        <button
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"
          onClick={async () => {
            let rowCompleto = row;
            try {
              const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, { headers: authHeaders() });
              if (resp.ok) rowCompleto = await resp.json();
            } catch { /* usa row sem atualizações */ }
            exportarCSV(rowCompleto, prestadoraRelatorio);
          }}
        >Exportar XLS</button>
        <button
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          onClick={async () => {
            let rowCompleto = row;
            try {
              const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, { headers: authHeaders() });
              if (resp.ok) rowCompleto = await resp.json();
            } catch { /* usa row sem atualizações */ }
            await exportarRelatorioMensalPDF(rowCompleto, authHeaders);
          }}
        >Relatório mensal PDF</button>
        <button
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          onClick={() => prorrogar(row.id)}
        >Prorrogar</button>
        <button
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
          onClick={() => encerrar(row.id)}
        >Encerrar</button>
      </div>
    );
  };

  // ─── Acesso negado ────────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <ColaboradorLayout title="Acompanhamento Bancário">
        <div className="p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="text-lg font-semibold text-red-700">Acesso restrito</h2>
            <p className="mt-1 text-sm text-red-600">
              Este módulo é exclusivo para Gestor de Crédito ou superior.
            </p>
          </div>
        </div>
      </ColaboradorLayout>
    );
  }

  // ─── Render principal ─────────────────────────────────────────────────────────
  return (
    <ColaboradorLayout title="Acompanhamento Bancário">
      <div className="w-full space-y-3 overflow-x-hidden p-3 md:p-4">

        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center">
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">Acompanhamento Bancário</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoramento semanal · evolução de rating · preparação para crédito
            </p>
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 shrink-0"
            onClick={() => {
              setEditandoId(null);
              setNovo({ nome_empresa: "", banco_observado: "", data_inicio: hojeISO() });
              setNovoOpen(true);
            }}
          >+ Novo Acompanhamento</button>
        </div>

        {/* Alertas */}
        {hojeEhQuarta() && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
            Hoje é quarta-feira: dia de atualizar os acompanhamentos bancários.
          </div>
        )}
        {resumo.pendentes > 0 && (
          <div className="rounded border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-800">
            Existem {resumo.pendentes} acompanhamento(s) pendente(s) de atualização.
          </div>
        )}

        {/* Cards resumo */}
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {(
            [
              { label: "Ativos", value: resumo.acompanhamento, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-100" },
              { label: "Pendentes", value: resumo.pendentes, color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-100" },
              { label: "Positivas", value: resumo.positivas, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
              { label: "Negativas", value: resumo.negativas, color: "text-red-700", bg: "bg-red-50", border: "border-red-100" },
              { label: "Prontos", value: resumo.prontos, color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-100" },
              { label: "Prorrogados", value: resumo.prorrogados, color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" },
            ]
          ).map(({ label, value, color, bg, border }) => (
            <div key={label} className={`rounded-xl border ${border} ${bg} px-3 py-2.5`}>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
              <div className={`mt-0.5 text-xl font-black ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="h-8 rounded-lg border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-48"
              placeholder="Buscar empresa/CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <input
              className="h-8 rounded-lg border border-slate-200 px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-36"
              placeholder="Banco..."
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
            />
            <select
              className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
            >
              <option value="todos">Todos os status</option>
              <option value="em_acompanhamento">Em acompanhamento</option>
              <option value="prorrogado">Prorrogado</option>
              <option value="encerrado">Encerrado</option>
              <option value="pronto_credito">Pronto para crédito</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={pendentes}
                onChange={(e) => setPendentes(e.target.checked)}
              />
              Apenas pendentes
            </label>
            <button
              className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={fetchData}
            >Filtrar</button>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2.5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Acompanhamentos cadastrados</h2>
              <p className="text-[10px] text-slate-400">{filtered.length} registro(s) · ações disponíveis em cada linha</p>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[22%]" /><col className="w-[13%]" /><col className="w-[10%]" />
                <col className="w-[8%]" /><col className="w-[12%]" /><col className="w-[12%]" />
                <col className="w-[12%]" /><col className="w-[7%]" /><col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-3 py-3">CNPJ</th>
                  <th className="px-3 py-3">Banco</th>
                  <th className="px-3 py-3">Rating</th>
                  <th className="px-3 py-3">Última atualização</th>
                  <th className="px-3 py-3">Próxima atualização</th>
                  <th className="px-3 py-3 text-right">Saldo semana atual</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-4 py-5 text-gray-500" colSpan={9}>Carregando acompanhamentos...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td className="px-4 py-5 text-gray-500" colSpan={9}>Nenhum acompanhamento cadastrado.</td></tr>
                ) : (
                  filtered.map((row) => {
                    const pendente = row.status_pendente || row.atualizacao_pendente;
                    const saldo = Number(row.saldo_semanal || row.saldo_ultima_semana || 0);
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-t border-gray-100 align-middle hover:bg-gray-50/60">
                          <td className="px-4 py-4">
                            <div className="min-w-0">
                              <div className="break-words font-semibold leading-snug text-gray-900">{row.nome_empresa || "-"}</div>
                              {pendente && (
                                <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Pendente</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-gray-700"><span className="break-words">{row.cnpj || "-"}</span></td>
                          <td className="px-3 py-4 font-medium text-gray-800">{row.banco_observado || "-"}</td>
                          <td className="px-3 py-4 text-gray-700">{row.rating_interno_atual || row.rating_bacen_atual || "-"}</td>
                          <td className="px-3 py-4 text-gray-700">{formatDateBR(row.ultima_atualizacao_em || row.ultimo_update_em)}</td>
                          <td className="px-3 py-4 text-gray-700">{formatDateBR(row.proxima_atualizacao)}</td>
                          <td className={`px-3 py-4 text-right font-semibold ${saldo < 0 ? "text-red-600" : saldo > 0 ? "text-green-700" : "text-gray-700"}`}>
                            {moneyBR(saldo)}
                          </td>
                          <td className="px-3 py-4">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(row.status_semana)}`}>
                              {labelStatus(row.status_semana)}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-gray-700">{row.responsavel_nome || "-"}</td>
                        </tr>
                        <tr className="border-t border-gray-100 bg-gray-50/70">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Ações do acompanhamento</div>
                              {renderActionButtons(row)}
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="grid gap-3 p-3 lg:hidden">
            {loading ? (
              <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">Carregando acompanhamentos...</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">Nenhum acompanhamento cadastrado.</div>
            ) : (
              filtered.map((row) => {
                const pendente = row.status_pendente || row.atualizacao_pendente;
                const saldo = Number(row.saldo_semanal || row.saldo_ultima_semana || 0);
                return (
                  <article key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold leading-snug text-gray-900">{row.nome_empresa || "-"}</h3>
                        <p className="mt-1 text-xs text-gray-500">{row.cnpj || "-"} · {row.banco_observado || "-"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(row.status_semana)}`}>
                        {labelStatus(row.status_semana)}
                      </span>
                    </div>
                    {pendente && (
                      <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">
                        Atualização pendente
                      </div>
                    )}
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-gray-500">Rating</dt>
                        <dd className="font-semibold">{row.rating_interno_atual || row.rating_bacen_atual || "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Responsável</dt>
                        <dd className="font-semibold">{row.responsavel_nome || "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Última atualização</dt>
                        <dd className="font-semibold">{formatDateBR(row.ultima_atualizacao_em || row.ultimo_update_em)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Próxima atualização</dt>
                        <dd className="font-semibold">{formatDateBR(row.proxima_atualizacao)}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs text-gray-500">Saldo última semana</dt>
                        <dd className={`font-bold ${saldo < 0 ? "text-red-600" : saldo > 0 ? "text-green-700" : "text-gray-700"}`}>
                          {moneyBR(saldo)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 border-t border-gray-100 pt-3">{renderActionButtons(row)}</div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {/* ── Modal — Novo Acompanhamento ──────────────────────────────────── */}
        {novoOpen && (
          <div className="fixed inset-0 z-[99999] overflow-auto bg-black/40 p-4">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{editandoId ? "Editar Acompanhamento" : "Novo Acompanhamento"}</h3>
                  <p className="text-sm text-gray-600">
                    {editandoId
                      ? "Corrija os dados do acompanhamento já cadastrado sem alterar o visual da tela."
                      : "Cadastre a empresa, o banco observado e os dados iniciais para acompanhamento de 30 dias."}
                  </p>
                </div>
                <button className="rounded border px-3 py-1 text-sm" onClick={limparNovo}>Fechar</button>
              </div>

              <h4 className="mb-2 text-sm font-semibold text-gray-700">Dados da empresa</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "empresa").map((field) => (
                  <FieldInput key={field.key} field={field} value={novo[field.key]} onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))} />
                ))}
              </div>

              <h4 className="mb-2 text-sm font-semibold text-gray-700">Dados bancários</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "banco").map((field) =>
                  field.type === "banco" ? (
                    <BancoField key={field.key} label={field.label} required={field.required} value={novo[field.key] || ""} onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))} />
                  ) : (
                    <FieldInput key={field.key} field={field} value={novo[field.key]} onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))} />
                  )
                )}
              </div>

              <h4 className="mb-2 text-sm font-semibold text-gray-700">Objetivo</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "objetivo").map((field) => (
                  <FieldInput key={field.key} field={field} value={novo[field.key]} onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))} />
                ))}
              </div>

              <h4 className="mb-2 text-sm font-semibold text-gray-700">Rating e faturamento</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "rating").map((field) => (
                  <FieldInput key={field.key} field={field} value={novo[field.key]} onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))} />
                ))}
              </div>

              <h4 className="mb-2 text-sm font-semibold text-gray-700">Gestão</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "gestao").map((field) => (
                  <FieldInput key={field.key} field={field} value={novo[field.key]} onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))} />
                ))}
              </div>

              {editandoId && (
                <>
                  <h4 className="mb-2 text-sm font-semibold text-gray-700">Controle do acompanhamento</h4>
                  <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {EDIT_FIELDS.map((field) => (
                      <FieldInput key={field.key} field={field} value={novo[field.key]} onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))} />
                    ))}
                  </div>
                </>
              )}

              <div className="mt-4 flex gap-2">
                <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} onClick={salvarNovo}>
                  {saving ? "Salvando..." : editandoId ? "Salvar alterações" : "Salvar acompanhamento"}
                </button>
                <button className="rounded border px-4 py-2 text-sm" onClick={limparNovo}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal — Atualização Semanal ──────────────────────────────────── */}
        {updOpen && (
          <div className="fixed inset-0 z-[99999] overflow-auto bg-black/40 p-4">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{editandoSemanaNumero ? `Editar Semana ${editandoSemanaNumero}` : "Atualização Semanal"}</h3>
                  <p className="text-sm font-medium text-gray-700">
                    {updOpen.nome_empresa} — {updOpen.banco_observado}
                  </p>
                  {editandoSemanaNumero && (
                    <p className="mt-1 max-w-3xl text-xs font-semibold text-amber-700">
                      Modo edição: corrija entradas, saídas, saldos, rating, restrições, datas, análise, orientação e próxima ação da semana já salva.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                    onClick={() => adicionarOutroBanco(updOpen)}
                  >+ Outro banco</button>
                  <button className="rounded border px-3 py-1 text-sm" onClick={() => { setUpdOpen(null); setEditandoSemanaNumero(null); }}>Fechar</button>
                </div>
              </div>

              {/* Banner de contexto */}
              <div className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
                editandoSemanaNumero
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-blue-100 bg-blue-50 text-blue-800"
              }`}>
                <strong>{editandoSemanaNumero ? "Editando" : "Nova atualização"} — Semana {upd.numero_semana}</strong>
                {" | "}Período: {formatDateBR(upd.data_referencia_inicio)} a {formatDateBR(upd.data_referencia_fim)}
                {" | "}Atualização prevista: {formatDateBR(upd.data_atualizacao)}
                {" | "}Próxima: {formatDateBR(upd.proxima_atualizacao_apos_salvar)}
              </div>

              {/* Bloco A — Período */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                A — Período da semana {editandoSemanaNumero ? "(editável)" : "(automático)"}
              </h4>
              {editandoSemanaNumero ? (
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <NumberField
                    label="Número da semana"
                    value={upd.numero_semana}
                    integer
                    onChange={(v) => setUpd((p) => ({ ...p, numero_semana: v }))}
                  />
                  <DateEditField
                    label="Início do período"
                    value={upd.data_referencia_inicio}
                    onChange={(v) => setUpd((p) => ({ ...p, data_referencia_inicio: v }))}
                  />
                  <DateEditField
                    label="Fim do período"
                    value={upd.data_referencia_fim}
                    onChange={(v) => setUpd((p) => ({ ...p, data_referencia_fim: v }))}
                  />
                  <DateEditField
                    label="Data da atualização"
                    value={upd.data_atualizacao}
                    onChange={(v) => setUpd((p) => ({ ...p, data_atualizacao: v }))}
                  />
                  <DateEditField
                    label="Próxima atualização após salvar"
                    value={upd.proxima_atualizacao_apos_salvar}
                    onChange={(v) => setUpd((p) => ({ ...p, proxima_atualizacao_apos_salvar: v }))}
                  />
                </div>
              ) : (
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <ReadonlyField label="Número da semana" value={String(upd.numero_semana)} />
                  <ReadonlyField label="Início do período" value={formatDateBR(upd.data_referencia_inicio)} />
                  <ReadonlyField label="Fim do período" value={formatDateBR(upd.data_referencia_fim)} />
                  <ReadonlyField label="Data da atualização" value={formatDateBR(upd.data_atualizacao)} />
                  <ReadonlyField label="Próxima atualização após salvar" value={formatDateBR(upd.proxima_atualizacao_apos_salvar)} />
                </div>
              )}

              {/* Bloco B — Entradas */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">B — Entradas da semana</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {(["entrada_maquininha", "entrada_pix", "entrada_boleto", "entrada_ted", "entrada_dinheiro", "outras_entradas"] as const).map((key) => (
                  <CurrencyField
                    key={key}
                    label={labelEntrada(key)}
                    value={upd[key]}
                    onChange={(v) => setUpd((p) => ({ ...p, [key]: v }))}
                  />
                ))}
                {/* Total de entradas calculado automaticamente */}
                <ReadonlyField
                  label="Total de entradas"
                  value={moneyBR(totalEntradas)}
                  highlight
                />
              </div>

              {/* Bloco C — Saídas e saldos */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">C — Saídas e saldos</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <CurrencyField
                  label="Total de saídas"
                  value={upd.total_saidas}
                  onChange={(v) => setUpd((p) => ({ ...p, total_saidas: v }))}
                />
                <CurrencyField
                  label="Saldo médio"
                  value={upd.saldo_medio}
                  onChange={(v) => setUpd((p) => ({ ...p, saldo_medio: v }))}
                />
                <CurrencyField
                  label="Saldo final"
                  value={upd.saldo_final}
                  onChange={(v) => setUpd((p) => ({ ...p, saldo_final: v }))}
                />
                <NumberField
                  label="Quantidade de transações"
                  value={upd.quantidade_transacoes}
                  onChange={(v) => setUpd((p) => ({ ...p, quantidade_transacoes: v }))}
                  integer
                />
                {/* Saldo semanal calculado automaticamente (entradas - saídas) */}
                <ReadonlyField
                  label="Saldo semanal calculado (entradas − saídas)"
                  value={moneyBR(saldoSemanal)}
                  highlight
                  negative={saldoSemanal < 0}
                />
              </div>

              {/* Bloco D — Rating e conformidade */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">D — Rating e conformidade</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                {(["rating_bacen", "rating_interno", "scr_status", "cenprot_status", "serasa_status", "cnd_status", "pld_aml_status", "coaf_status"] as const).map((key) => (
                  <TextFieldSimple
                    key={key}
                    label={labelRating(key)}
                    value={upd[key]}
                    onChange={(v) => setUpd((p) => ({ ...p, [key]: v }))}
                  />
                ))}
              </div>

              {/* Bloco E — Ocorrências */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">E — Ocorrências</h4>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {(
                  [
                    ["possui_restricao", "Possui restrição?"],
                    ["restricao_nova", "Restrição nova?"],
                    ["devolucao_ou_estorno", "Devolução ou estorno?"],
                    ["ocorrencia_negativa", "Ocorrência negativa?"],
                  ] as [keyof AtualizacaoForm, string][]
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded border border-gray-200 p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(upd[key])}
                      onChange={(e) => setUpd((p) => ({ ...p, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Bloco F — Análise */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">F — Análise</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <TextareaField label="Análise da semana" value={upd.analise_semana} onChange={(v) => setUpd((p) => ({ ...p, analise_semana: v }))} />
                <TextareaField label="Orientação ao cliente" value={upd.orientacao_cliente} onChange={(v) => setUpd((p) => ({ ...p, orientacao_cliente: v }))} />
                <TextareaField label="Próxima ação" value={upd.proxima_acao} onChange={(v) => setUpd((p) => ({ ...p, proxima_acao: v }))} />
              </div>

              {/* Painel de resumo calculado */}
              <div className="mt-2 grid grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-center">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total de entradas</div>
                  <div className="mt-1 text-lg font-bold text-emerald-700">{moneyBR(totalEntradas)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo semanal</div>
                  <div className={`mt-1 text-lg font-bold ${saldoSemanal < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {moneyBR(saldoSemanal)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status estimado</div>
                  <div className="mt-1">
                    <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusBadge(statusSemanaCalculado)}`}>
                      {labelStatus(statusSemanaCalculado)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={saving}
                  onClick={salvarAtualizacao}
                >
                  {saving ? "Salvando..." : editandoSemanaNumero ? "Salvar correção da semana" : "Salvar atualização semanal"}
                </button>
                <button
                  className="rounded border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700"
                  onClick={() => adicionarOutroBanco(updOpen)}
                >+ Outro banco</button>
                <button className="rounded border px-4 py-2 text-sm" onClick={() => { setUpdOpen(null); setEditandoSemanaNumero(null); }}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal — Detalhes ─────────────────────────────────────────────── */}
        {detalhe && (
          <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/50 p-3 sm:p-5">
            <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Relatório operacional</p>
                    <h3 className="mt-0.5 text-xl font-bold text-slate-950">Detalhes do Acompanhamento</h3>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {detalhe.nome_empresa} — CNPJ {detalhe.cnpj || "-"} — {detalhe.banco_observado}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                      Prestadora
                      <select
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
                        value={prestadoraRelatorio}
                        onChange={(e) => setPrestadoraRelatorio(e.target.value as PrestadoraKey)}
                      >
                        <option value="destrava">Destrava</option>
                        <option value="permupay">PermuPay</option>
                      </select>
                    </label>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(detalhe.status_semana || detalhe.status)}`}>
                      {labelStatus(detalhe.status_semana || detalhe.status)}
                    </span>
                    <button className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100" onClick={() => abrirEditarAcompanhamento(detalhe)}>Editar acompanhamento</button>
                    {/* Botão Atualizar semana: só ativo se a próxima semana já iniciou */}
                    {(() => {
                      const campos = calcularCamposSemana(detalhe);
                      const inicioProxima = parseDateLocal(campos.data_referencia_inicio);
                      const hoje = todayLocal();
                      const bloqueado = inicioProxima ? inicioProxima > hoje : false;
                      return (
                        <button
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                            bloqueado
                              ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                          onClick={() => { if (!bloqueado) abrirAtualizacao(detalhe); }}
                          title={bloqueado
                            ? `Próxima semana inicia em ${formatDateBR(campos.data_referencia_inicio)} — ainda não chegou`
                            : 'Registrar dados da semana atual'}
                          disabled={bloqueado}
                        >
                          {bloqueado ? `Aguardando ${formatDateBR(campos.data_referencia_inicio)}` : 'Atualizar semana'}
                        </button>
                      );
                    })()}
                    <button className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100" onClick={() => adicionarOutroBanco(detalhe)}>+ Outro banco</button>
                    <button className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-100" onClick={() => exportarCSV(detalhe, prestadoraRelatorio)}>Exportar XLS</button>
                    <button className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100" onClick={() => exportarRelatorioMensalPDF(detalhe, authHeaders)}>Relatório mensal PDF</button>
                    <button className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100" onClick={() => { setImprimirOpen(detalhe); setDetalhe(null); }}>Imprimir</button>
                    <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => setDetalhe(null)}>Fechar</button>
                  </div>
                </div>
              </div>

              <div className="space-y-5 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Resumo geral</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      { label: "Banco observado", value: detalhe.banco_observado },
                      { label: "Responsável", value: detalhe.responsavel_nome || "Admin" },
                      { label: "Início", value: formatDateBR(detalhe.data_inicio) },
                      { label: "Fim previsto", value: formatDateBR(detalhe.data_fim_prevista) },
                      { label: "Próxima atualização", value: formatDateBR(detalhe.proxima_atualizacao) },
                      { label: "Prorrogado", value: detalhe.prorrogado ? "Sim" : "Não" },
                    ].map(({ label, value }) => (
                      <div key={label} className="border-b border-slate-100 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-800">{value || "-"}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Indicadores financeiros e rating</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0 sm:grid-cols-3">
                      {[
                        { label: "Rating Bacen atual", value: detalhe.rating_bacen_atual || detalhe.rating_bacen_inicial },
                        { label: "Rating interno inicial", value: detalhe.rating_interno_inicial },
                        { label: "Rating interno atual", value: detalhe.rating_interno_atual },
                        { label: "Faturamento anual", value: moneyBR(detalhe.faturamento_anual) },
                        { label: "Média mensal", value: moneyBR(detalhe.media_mensal) },
                        { label: "Margem ±30%", value: moneyBR(detalhe.margem_seguranca_30) },
                      ].map(({ label, value }) => (
                        <div key={label} className="border-b border-slate-100 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                          <div className="mt-0.5 text-sm font-semibold text-slate-800">{value || "-"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
                    <h4 className="text-sm font-bold uppercase tracking-wide text-blue-700">Recomendação operacional</h4>
                    <p className="mt-2 text-sm leading-6 text-blue-900">{calcularRecomendacao(detalhe)}</p>
                    <div className="mt-4 rounded-xl border border-blue-200 bg-white/70 p-3">
                      {(() => {
                        // Mostrar saldo da última semana COM DADOS REAIS
                        // Se a semana atual está zerada (não alimentada), usa a anterior
                        const semAtual = getSemanaAtual(detalhe);
                        const entradasAtual = totalEntradasSemana(semAtual);
                        const semanasOrdenadas = atualizacoesOrdenadas(detalhe);
                        const hoje = todayLocal();
                        const semanasComDados = semanasOrdenadas.filter((s: any) => {
                          const ini = parseDateLocal(s?.data_referencia_inicio);
                          if (!ini || ini > hoje) return false;
                          return (Number(s.total_entradas || 0) || totalEntradasSemana(s)) > 0;
                        });
                        const semanaComSaldo = semanasComDados.length > 0
                          ? semanasComDados[semanasComDados.length - 1]
                          : semAtual;
                        const saldoExibir = Number(semanaComSaldo?.saldo_semanal || 0);
                        const naoAlimentada = entradasAtual === 0 && semAtual && semAtual !== semanaComSaldo;
                        return (
                          <>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                              {naoAlimentada ? `Saldo S${semanaComSaldo?.numero_semana || ''} (última com dados)` : 'Saldo semana atual'}
                            </div>
                            <div className={`mt-1 text-lg font-bold ${saldoExibir < 0 ? "text-red-600" : "text-emerald-700"}`}>
                              {moneyBR(saldoExibir)}
                            </div>
                            {naoAlimentada && (
                              <div className="mt-1 text-[10px] text-amber-700 font-medium">
                                ⏳ S{semAtual?.numero_semana} aguardando alimentação (quarta-feira)
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </section>

                {(() => {
                  const semanaAtual = getSemanaAtual(detalhe);
                  const evolucao = calcularEvolucaoAcompanhamento(detalhe);
                  const entradasAtual = totalEntradasSemana(semanaAtual);
                  const saldoAtual = Number(semanaAtual?.saldo_semanal || 0);
                  return (
                    <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                      <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm xl:col-span-2">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold uppercase tracking-wide text-amber-700">Semana atual em evidência</h4>
                            <p className="text-xs text-amber-700/80">Semana da data de hoje. Semanas futuras nunca aparecem. Alimentação toda quarta-feira.</p>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(semanaAtual?.status_semana || semanaAtual?.status)}`}>
                            {labelStatus(semanaAtual?.status_semana || semanaAtual?.status)}
                          </span>
                        </div>
                        {semanaAtual ? (
                          <>
                          {entradasAtual === 0 && (() => {
                            const ini = parseDateLocal(semanaAtual.data_referencia_inicio);
                            const fim = parseDateLocal(semanaAtual.data_referencia_fim);
                            const hj = todayLocal();
                            const emAndamento = ini && fim && ini <= hj && hj <= fim;
                            return emAndamento ? (
                              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                                ⏳ Semana {semanaAtual.numero_semana} em andamento — dados serão alimentados na próxima quarta-feira
                              </div>
                            ) : null;
                          })()}
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <InfoCard label="Semana" value={`Semana ${semanaAtual.numero_semana || "-"}`} />
                            <InfoCard label="Período" value={`${formatDateBR(semanaAtual.data_referencia_inicio)} a ${formatDateBR(semanaAtual.data_referencia_fim)}`} />
                            <InfoCard label="Entradas" value={moneyBR(entradasAtual)} positive />
                            <InfoCard label="Saídas" value={moneyBR(semanaAtual.total_saidas)} negative />
                            <InfoCard label="Saldo semanal" value={moneyBR(saldoAtual)} negative={saldoAtual < 0} positive={saldoAtual > 0} />
                            <InfoCard label="Rating Bacen" value={semanaAtual.rating_bacen || detalhe.rating_bacen_atual || "-"} />
                            <InfoCard label="Rating interno" value={semanaAtual.rating_interno || detalhe.rating_interno_atual || "-"} />
                            <InfoCard label="Atualização" value={formatDateBR(semanaAtual.data_atualizacao || semanaAtual.data_referencia_fim)} />
                          </div>
                          </>
                        ) : (
                          <div className="rounded-xl border border-dashed border-amber-300 bg-white/70 p-4 text-sm text-amber-800">
                            Nenhuma semana preenchida ainda. Clique em <strong>Atualizar semana</strong> para registrar a primeira atualização.
                          </div>
                        )}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Evolução</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{evolucao.leitura}</p>
                        <div className="mt-4 grid grid-cols-1 gap-3">
                          <InfoCard label="Variação de entradas" value={moneyBR(evolucao.variacaoEntradas)} negative={evolucao.variacaoEntradas < 0} positive={evolucao.variacaoEntradas > 0} />
                          <InfoCard label="Variação de saldo" value={moneyBR(evolucao.variacaoSaldo)} negative={evolucao.variacaoSaldo < 0} positive={evolucao.variacaoSaldo > 0} />
                        </div>
                      </div>
                    </section>
                  );
                })()}
                {/* ── Painel de Aderência Financeira ─────────────────────────────── */}
                {(() => {
                  const semanaAtual = getSemanaAtual(detalhe);
                  if (!semanaAtual) return null;
                  // Fallback: calcula aderência direto do faturamento_anual se migration 025 não foi aplicada
                  const fatAnual = Number(detalhe.faturamento_anual || 0);
                  const semanasMes = 4;
                  const refMensalCalc = fatAnual > 0 ? Math.round((fatAnual / 12) * 100) / 100 : 0;
                  const tetoMensalCalc = fatAnual > 0 ? Math.round((fatAnual / 12 * 1.30) * 100) / 100 : 0;
                  const refSemanalCalc = fatAnual > 0 ? Math.round((refMensalCalc / semanasMes) * 100) / 100 : 0;
                  const tetoSemanalCalc = fatAnual > 0 ? Math.round((tetoMensalCalc / semanasMes) * 100) / 100 : 0;
                  const entradasSemanaAtual = totalEntradasSemana(semanaAtual);
                  // Acumulado mensal: soma de todas as semanas do mesmo mês
                  const mesAtual = semanaAtual.data_referencia_inicio?.slice(0, 7) || '';
                  const acumuladoMensalCalc = Array.isArray(detalhe.atualizacoes)
                    ? detalhe.atualizacoes
                        .filter((s: any) => (s.data_referencia_inicio || '').slice(0, 7) === mesAtual)
                        .reduce((acc: number, s: any) => acc + (Number(s.total_entradas || 0) || totalEntradasSemana(s)), 0)
                    : 0;

                  const refSemanal = Number(semanaAtual.referencia_semanal_base || 0) || refSemanalCalc;
                  const tetoSemanal = Number(semanaAtual.teto_semanal_movimentacao || 0) || tetoSemanalCalc;
                  const refMensal = Number(semanaAtual.faturamento_mensal_base || 0) || refMensalCalc;
                  const tetoMensal = Number(semanaAtual.teto_mensal_movimentacao || 0) || tetoMensalCalc;
                  const acumuladoMensal = Number(semanaAtual.acumulado_mensal || 0) || acumuladoMensalCalc;
                  const pctSemanal = tetoSemanal > 0 ? Number(semanaAtual.percentual_uso_semanal || 0) || Math.round((entradasSemanaAtual / tetoSemanal) * 1000) / 10 : 0;
                  const pctMensal = tetoMensal > 0 ? Number(semanaAtual.percentual_uso_mensal || 0) || Math.round((acumuladoMensal / tetoMensal) * 1000) / 10 : 0;
                  const pctAnual = Number(semanaAtual.percentual_uso_anual || 0);
                  // Semana em andamento mas ainda não alimentada (quarta-feira)
                  const semanaEmAndamento = (() => {
                    const ini = parseDateLocal(semanaAtual.data_referencia_inicio);
                    const fim = parseDateLocal(semanaAtual.data_referencia_fim);
                    const hj = todayLocal();
                    return ini && fim && ini <= hj && hj <= fim;
                  })();
                  const naoAlimentada = semanaEmAndamento && entradasSemanaAtual === 0;
                  const statusAd = naoAlimentada
                    ? 'aguardando_alimentacao'
                    : (semanaAtual.status_aderencia || (pctSemanal > 100 ? 'acima_do_teto' : pctSemanal > 0 && entradasSemanaAtual < refSemanal ? 'abaixo_da_referencia' : 'dentro_da_faixa'));
                  const alerta = !naoAlimentada && (Boolean(semanaAtual.alerta_aderencia) || pctSemanal > 100 || (pctSemanal > 0 && entradasSemanaAtual < refSemanal));
                  const motivo = naoAlimentada
                    ? `Semana ${semanaAtual.numero_semana} em andamento. Dados serão alimentados na próxima quarta-feira.`
                    : (semanaAtual.motivo_alerta_aderencia || (pctSemanal > 100 ? `Movimentação acima do teto semanal (${pctSemanal.toFixed(1)}%). Reduza nas próximas semanas para compensar.` : pctSemanal > 0 && entradasSemanaAtual < refSemanal ? `Movimentação abaixo da referência (${pctSemanal.toFixed(1)}%). Aumente para manter o padrão.` : ''));
                  const diagnostico = semanaAtual.diagnostico_tecnico || '';
                  const metaDinamica = Number(semanaAtual.meta_base_dinamica || 0) || refSemanal;
                  const tetoDinamico = Number(semanaAtual.teto_dinamico_proxima || 0) || tetoSemanal;
                  const semanasRestantes = Number(semanaAtual.semanas_restantes_mes || 0);
                  if (!refSemanal && !tetoSemanal && !fatAnual) return null;
                  const corStatus = naoAlimentada ? 'amber' : (statusAd === 'dentro_da_faixa' ? 'emerald' : statusAd === 'abaixo_da_referencia' ? 'amber' : 'red');
                  const labelAd = naoAlimentada ? '⏳ Aguardando alimentação' : (statusAd === 'dentro_da_faixa' ? 'Dentro da faixa' : statusAd === 'abaixo_da_referencia' ? 'Abaixo da referência' : statusAd === 'acima_do_teto' ? 'Acima do teto' : statusAd === 'critico' ? 'Crítico' : 'Aguardando');
                  return (
                    <section className={`rounded-2xl border-2 p-4 shadow-sm ${ naoAlimentada ? 'border-amber-300 bg-amber-50/60' : alerta ? 'border-red-300 bg-red-50' : 'border-emerald-200 bg-emerald-50/40' }`}>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">Aderência Financeira — Semana {semanaAtual.numero_semana}</h4>
                          <p className="text-xs text-slate-500">Referência: faturamento anual × 130% ÷ 12 ÷ semanas do mês</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold bg-${corStatus}-50 text-${corStatus}-700 border-${corStatus}-200`}>{labelAd}</span>
                      </div>
                      {motivo && (
                        <div className={`mb-3 rounded-xl border p-3 text-xs ${naoAlimentada ? 'border-amber-200 bg-white/80 text-amber-800' : 'border-red-200 bg-white/80 text-red-800'}`}>{motivo}</div>
                      )}
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <InfoCard label="Ref. semanal base" value={moneyBR(refSemanal)} />
                        <InfoCard label="Teto semanal" value={moneyBR(tetoSemanal)} />
                        <InfoCard label="Ref. mensal base" value={moneyBR(refMensal)} />
                        <InfoCard label="Teto mensal" value={moneyBR(tetoMensal)} />
                        <InfoCard label="Acumulado mensal" value={moneyBR(acumuladoMensal)} positive={acumuladoMensal >= refMensal} negative={acumuladoMensal > tetoMensal} />
                        <InfoCard label="Uso semanal" value={`${pctSemanal.toFixed(1)}%`} negative={pctSemanal > 130} positive={pctSemanal >= 80 && pctSemanal <= 130} />
                        <InfoCard label="Uso mensal" value={`${pctMensal.toFixed(1)}%`} negative={pctMensal > 100} positive={pctMensal >= 70 && pctMensal <= 100} />
                        <InfoCard label="Uso anual" value={`${pctAnual.toFixed(1)}%`} negative={pctAnual > 100} positive={pctAnual >= 70 && pctAnual <= 100} />
                      </div>
                      {semanasRestantes > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                          <InfoCard label="Semanas restantes" value={`${semanasRestantes}`} />
                          <InfoCard label="Meta dinâmica/semana" value={moneyBR(metaDinamica)} />
                          <InfoCard label="Teto dinâmico/semana" value={moneyBR(tetoDinamico)} />
                        </div>
                      )}
                      {diagnostico && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-700">
                          <strong className="text-slate-500">Diagnóstico técnico:</strong> {diagnostico}
                        </div>
                      )}
                    </section>
                  );
                })()}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Histórico semanal</h4>
                      <p className="text-xs text-slate-400">Evolução semana a semana — entradas, saídas, saldos e conformidade</p>
                    </div>
                    <span className="text-xs font-medium text-slate-400">
                      {Array.isArray(detalhe.atualizacoes)
                        ? detalhe.atualizacoes.filter((s: any) => {
                            const ini = parseDateLocal(s?.data_referencia_inicio);
                            return !ini || ini <= todayLocal();
                          }).length
                        : 0} semana(s)
                    </span>
                  </div>

                  {Array.isArray(detalhe.atualizacoes) && detalhe.atualizacoes.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-xs">
                        {/* REGRA: semanas futuras nunca aparecem no histórico */}
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-500" rowSpan={2}>Semana</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-slate-500" rowSpan={2}>Período</th>
                            <th className="border-l border-slate-200 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-emerald-700" colSpan={7}>Entradas</th>
                            <th className="border-l border-slate-200 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-red-600" colSpan={5}>Saídas e Saldos</th>
                            <th className="border-l border-slate-200 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-blue-700" colSpan={8}>Rating e Conformidade</th>
                            <th className="border-l border-slate-200 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500" rowSpan={2}>Status</th>
                          </tr>
                          <tr className="border-b-2 border-slate-300 bg-slate-50">
                            <th className="border-l border-slate-200 px-3 py-2 text-right font-medium text-slate-500">Maquininha</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">Pix</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">Boleto</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">TED</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">Dinheiro</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">Outras</th>
                            <th className="px-3 py-2 text-right font-bold text-emerald-700">Total</th>
                            <th className="border-l border-slate-200 px-3 py-2 text-right font-medium text-slate-500">Saídas</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">Saldo sem.</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">Saldo médio</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">Saldo final</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-500">Transações</th>
                            <th className="border-l border-slate-200 px-3 py-2 text-center font-medium text-slate-500">Bacen</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-500">Interno</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-500">SCR</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-500">Cenprot</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-500">Serasa</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-500">CND</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-500">PLD/AML</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-500">COAF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalhe.atualizacoes
                            .filter((item: any) => {
                              // Bloquear semanas futuras: início > hoje
                              const inicio = parseDateLocal(item?.data_referencia_inicio);
                              if (!inicio) return true; // sem data: exibe (pode ser rascunho)
                              return inicio <= todayLocal();
                            })
                            .map((item: any, idx: number) => {
                            const entradas =
                              Number(item.total_entradas || 0) ||
                              Number(item.entrada_maquininha || 0) +
                              Number(item.entrada_pix || 0) +
                              Number(item.entrada_boleto || 0) +
                              Number(item.entrada_ted || 0) +
                              Number(item.entrada_dinheiro || 0) +
                              Number(item.outras_entradas || 0);
                            const saldo = Number(item.saldo_semanal || 0);
                            const isEven = idx % 2 === 0;
                            const isAtual = Number(item.numero_semana) === Number(getSemanaAtual(detalhe)?.numero_semana);
                            return (
                              <tr key={item.id || item.numero_semana} className={`border-b border-slate-100 transition hover:bg-blue-50/40 ${isAtual ? "bg-amber-50/80 ring-1 ring-amber-200" : isEven ? "bg-white" : "bg-slate-50/50"}`}>
                                <td className="px-3 py-2.5 font-bold text-slate-700">
                                  <div className="flex items-center gap-1">
                                    <span>S{item.numero_semana}</span>
                                    {isAtual && <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">Atual</span>}
                                  </div>
                                  <button
                                    className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 shadow-sm hover:bg-amber-100"
                                    onClick={() => abrirEditarSemana(detalhe, item)}
                                    title="Editar todos os valores, entradas, saídas, rating e análise desta semana"
                                  >
                                    Editar valores
                                  </button>
                                  <button
                                    className="mt-1 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-60"
                                    onClick={() => apagarSemana(detalhe, item)}
                                    title="Apagar esta semana e recalcular o acompanhamento"
                                    disabled={saving}
                                  >
                                    Apagar semana
                                  </button>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                                  {formatDateBR(item.data_referencia_inicio)}<br/>
                                  <span className="text-[10px]">a {formatDateBR(item.data_referencia_fim)}</span>
                                </td>
                                <td className="border-l border-slate-100 px-3 py-2.5 text-right text-slate-700">{moneyBR(item.entrada_maquininha)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{moneyBR(item.entrada_pix)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{moneyBR(item.entrada_boleto)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{moneyBR(item.entrada_ted)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{moneyBR(item.entrada_dinheiro)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{moneyBR(item.outras_entradas)}</td>
                                <td className="px-3 py-2.5 text-right font-bold text-emerald-700">{moneyBR(entradas)}</td>
                                <td className="border-l border-slate-100 px-3 py-2.5 text-right text-red-600">{moneyBR(item.total_saidas)}</td>
                                <td className={`px-3 py-2.5 text-right font-bold ${saldo < 0 ? "text-red-600" : "text-emerald-700"}`}>{moneyBR(item.saldo_semanal)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{moneyBR(item.saldo_medio)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-700">{moneyBR(item.saldo_final)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{item.quantidade_transacoes || 0}</td>
                                <td className="border-l border-slate-100 px-3 py-2.5 text-center font-bold text-slate-800">{item.rating_bacen || "-"}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-blue-700">{item.rating_interno || "-"}</td>
                                <td className="px-3 py-2.5 text-center">{item.scr_status || item.restricao_scr || "-"}</td>
                                <td className="px-3 py-2.5 text-center">{item.cenprot_status || item.restricao_cenprot || "-"}</td>
                                <td className="px-3 py-2.5 text-center">{item.serasa_status || item.restricao_serasa || "-"}</td>
                                <td className="px-3 py-2.5 text-center">{item.cnd_status || item.cnd_regular || "-"}</td>
                                <td className="px-3 py-2.5 text-center">{item.pld_aml_status || item.pld_aml || "-"}</td>
                                <td className="px-3 py-2.5 text-center">{item.coaf_status || item.operacao_suspeita_coaf || "-"}</td>
                                <td className="border-l border-slate-100 px-3 py-2.5">
                                  <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(item.status_semana || item.status)}`}>
                                    {labelStatus(item.status_semana || item.status)}
                                  </span>
                                  <button
                                    className="mt-2 block whitespace-nowrap rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50"
                                    onClick={() => abrirEditarSemana(detalhe, item)}
                                  >
                                    Corrigir semana
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      Nenhuma atualização semanal registrada.
                    </div>
                  )}
                </section>

                {Array.isArray(detalhe.atualizacoes) && detalhe.atualizacoes.some((i: any) => i.analise_semana || i.orientacao_cliente || i.proxima_acao) && (
                  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Análises e orientações por semana</h4>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {detalhe.atualizacoes.filter((i: any) => i.analise_semana || i.orientacao_cliente || i.proxima_acao).map((item: any) => (
                        <div key={`analise-${item.id || item.numero_semana}`} className="px-4 py-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-700">Semana {item.numero_semana}</span>
                            <span className="text-[10px] text-slate-400">{formatDateBR(item.data_referencia_inicio)} a {formatDateBR(item.data_referencia_fim)}</span>
                            <button
                              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                              onClick={() => abrirEditarSemana(detalhe, item)}
                            >
                              Editar análise/semana
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 text-xs text-slate-700 sm:grid-cols-3">
                            {item.analise_semana && <div><span className="font-semibold text-slate-500">Análise: </span>{item.analise_semana}</div>}
                            {item.orientacao_cliente && <div><span className="font-semibold text-slate-500">Orientação: </span>{item.orientacao_cliente}</div>}
                            {item.proxima_acao && <div><span className="font-semibold text-slate-500">Próxima ação: </span>{item.proxima_acao}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Objetivo e estratégia de crédito</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                      {[
                        { label: "Objetivo do crédito", value: detalhe.objetivo_credito },
                        { label: "Linha pretendida", value: detalhe.linha_credito_pretendida },
                        { label: "Valor pretendido", value: moneyBR(detalhe.valor_credito_pretendido) },
                        { label: "Status", value: labelStatus(detalhe.status) },
                      ].map(({ label, value }) => (
                        <div key={label} className="border-b border-slate-100 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                          <div className="mt-0.5 text-sm text-slate-700">{value || "-"}</div>
                        </div>
                      ))}
                    </div>
                    {detalhe.observacoes_iniciais && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                        <span className="font-semibold">Observações: </span>{detalhe.observacoes_iniciais}
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Dados bancários e relacionamento</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                      {[
                        { label: "Agência", value: detalhe.agencia },
                        { label: "Conta", value: detalhe.conta },
                        { label: "Gerente do banco", value: detalhe.gerente_banco },
                        { label: "Contato do banco", value: detalhe.contato_banco },
                        { label: "Abertura de conta", value: formatDateBR(detalhe.data_abertura_conta) },
                        { label: "E-mail", value: detalhe.email_cliente },
                      ].map(({ label, value }) => (
                        <div key={label} className="border-b border-slate-100 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                          <div className="mt-0.5 text-sm text-slate-700">{value || "-"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal — Impressão ────────────────────────────────────────────── */}
        {imprimirOpen && (
          <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b bg-gray-50 p-4 print:hidden">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                Prestadora
                <select
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={prestadoraRelatorio}
                  onChange={(e) => setPrestadoraRelatorio(e.target.value as PrestadoraKey)}
                >
                  <option value="destrava">Destrava Crédito</option>
                  <option value="permupay">PermuPay</option>
                </select>
              </label>

              <button
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={handleImprimir}
              >
                Imprimir / Salvar PDF
              </button>

              <button
                className="rounded border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100"
                onClick={() => exportarCSV(imprimirOpen, prestadoraRelatorio)}
              >
                Exportar XLS personalizado
              </button>

              <span className="min-w-0 flex-1 break-words text-xs text-slate-500">
                Arquivo: {nomeArquivoRelatorio(imprimirOpen, prestadoraRelatorio, "pdf")}
              </span>

              <button
                className="rounded border px-4 py-2 text-sm"
                onClick={() => setImprimirOpen(null)}
              >
                Fechar
              </button>
            </div>

            <iframe
              ref={printFrameRef}
              title="Preview do relatório técnico de acompanhamento financeiro semanal"
              srcDoc={gerarHtmlRelatorioA4(imprimirOpen, prestadoraRelatorio)}
              className="h-full w-full flex-1 border-0 bg-white"
            />
          </div>
        )}
      </div>
    </ColaboradorLayout>
  );
}

// ─── Helpers de label ─────────────────────────────────────────────────────────

function labelEntrada(key: string): string {
  const map: Record<string, string> = {
    entrada_maquininha: "Entrada maquininha",
    entrada_pix: "Entrada Pix",
    entrada_boleto: "Entrada boleto",
    entrada_ted: "Entrada TED",
    entrada_dinheiro: "Entrada dinheiro",
    outras_entradas: "Outras entradas",
  };
  return map[key] || key;
}

function labelRating(key: string): string {
  const map: Record<string, string> = {
    rating_bacen: "Rating Bacen",
    rating_interno: "Rating interno",
    scr_status: "SCR",
    cenprot_status: "Cenprot",
    serasa_status: "Serasa",
    cnd_status: "CND",
    pld_aml_status: "PLD/AML",
    coaf_status: "COAF",
  };
  return map[key] || key;
}


function InfoCard({ label, value, positive, negative }: {
  label: string;
  value: any;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${
      negative
        ? "border-red-100 bg-red-50 text-red-700"
        : positive
        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
        : "border-slate-100 bg-white text-slate-800"
    }`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-bold leading-snug">{value || "-"}</div>
    </div>
  );
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function BancoField({ label, required, value, onChange }: {
  label: string; required?: boolean; value: string; onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}{required ? " *" : ""}</span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-sm"
        list="bancos-sugeridos"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite ou selecione o banco"
      />
      <datalist id="bancos-sugeridos">
        {BANCOS_SUGERIDOS.map((b) => <option key={b} value={b} />)}
      </datalist>
    </label>
  );
}

function FieldInput({ field, value, onChange }: {
  field: { key: string; label: string; type?: string; textarea?: boolean; required?: boolean };
  value: any;
  onChange: (value: any) => void;
}) {
  if (field.textarea) {
    return (
      <label className="md:col-span-3">
        <span className="mb-1 block text-xs font-medium text-gray-600">{field.label}{field.required ? " *" : ""}</span>
        <textarea className="min-h-20 w-full rounded border border-gray-300 p-2 text-sm" value={value || ""} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  // Campos monetários usam máscara automática de digitação
  if (field.type === "number") {
    const numericValue = typeof value === "number" ? value : (parseFloat(String(value || "0")) || 0);
    return (
      <label>
        <span className="mb-1 block text-xs font-medium text-gray-600">{field.label}{field.required ? " *" : ""}</span>
        <FieldCurrencyInput
          value={numericValue}
          onChange={(num) => onChange(num)}
        />
      </label>
    );
  }
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">{field.label}{field.required ? " *" : ""}</span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-sm"
        type={field.type || "text"}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}


function DateEditField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        className="w-full rounded border border-amber-200 bg-amber-50/40 p-2 text-sm font-semibold text-gray-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        type="date"
        value={String(value || "").slice(0, 10)}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ReadonlyField({ label, value, highlight, negative }: {
  label: string; value: string; highlight?: boolean; negative?: boolean;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <div className={`w-full rounded border p-2 text-sm font-semibold ${
        negative
          ? "border-red-200 bg-red-50 text-red-700"
          : highlight
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-gray-200 bg-gray-50 text-gray-700"
      }`}>
        {value}
      </div>
    </div>
  );
}

/**
 * FieldCurrencyInput — input monetário inline para uso no FieldInput.
 * Usa máscara automática de digitação.
 */
function FieldCurrencyInput({ value, onChange }: {
  value: number; onChange: (v: number) => void;
}) {
  const [displayValue, setDisplayValue] = useState<string>(() =>
    value ? formatBRLCurrency(value) : ""
  );
  const prevRef = useRef<number>(value);
  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setDisplayValue(value ? formatBRLCurrency(value) : "");
    }
  }, [value]);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = maskCurrencyInput(e.target.value);
    setDisplayValue(formatted);
    const num = unmaskCurrencyInput(formatted);
    prevRef.current = num;
    onChange(num);
  };
  return (
    <input
      className="w-full rounded border border-gray-300 p-2 text-right font-mono text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      type="text"
      inputMode="numeric"
      value={displayValue}
      placeholder="0,00"
      onChange={handleChange}
      autoComplete="off"
    />
  );
}

/**
 * parseBRLInput — converte qualquer string digitada pelo usuário para float.
 *
 * Estratégia: trata vírgula e ponto como separadores intercambiáveis.
 * Regra central: o ÚLTIMO separador (vírgula ou ponto) é o decimal.
 * Todos os separadores antes do último são de milhar e são descartados.
 *
 * Exemplos:
 *   "175,49"    → 175.49   (BR decimal)
 *   "175.49"    → 175.49   (EN decimal)
 *   "1.234,56"  → 1234.56  (BR com milhar)
 *   "1,234.56"  → 1234.56  (EN com milhar)
 *   "1.234"     → 1234     (milhar sem decimal — 3 casas após ponto = milhar)
 *   "1,234"     → 1234     (milhar sem decimal — 3 casas após vírgula = milhar)
 *   "1234"      → 1234
 *   "0,5"       → 0.5
 *   ""          → 0
 */
function parseBRLInput(raw: string): number {
  // Remove espaços e símbolo R$
  const s = raw.replace(/\s|R\$\s*/g, "").trim();
  if (!s) return 0;

  // Encontra o último separador (vírgula ou ponto)
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  const lastSep = Math.max(lastComma, lastDot);

  if (lastSep === -1) {
    // Sem separador — número puro
    return parseFloat(s.replace(/\D/g, "")) || 0;
  }

  const afterLastSep = s.slice(lastSep + 1);

  // Se depois do último separador há exatamente 3 dígitos, é milhar (não decimal)
  // Ex: "1.234" ou "1,234"
  if (/^\d{3}$/.test(afterLastSep)) {
    // Remove todos os separadores — trata como número inteiro
    return parseFloat(s.replace(/[.,]/g, "")) || 0;
  }

  // Caso geral: o último separador é decimal
  // Remove todos os separadores anteriores ao último e troca o último por ponto
  const intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
  const decPart = afterLastSep.replace(/\D/g, ""); // só dígitos após decimal
  const normalized = decPart ? `${intPart}.${decPart}` : intPart;
  return parseFloat(normalized) || 0;
}

/**
 * CurrencyField — input de valor monetário BRL.
 *
 * Comportamento (máscara automática):
 * - Ao digitar dígitos, o campo formata automaticamente com separadores pt-BR.
 * - Ex: digitar "100000000" → exibe "1.000.000,00"
 * - Campo em branco quando value = 0 (não exibe "0" fantasma).
 * - Atualiza totalEntradas/saldoSemanal em tempo real durante a digitação.
 */
function CurrencyField({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  const [displayValue, setDisplayValue] = useState<string>(() =>
    value ? formatBRLCurrency(value) : ""
  );

  // Sincroniza quando o valor externo muda (ex: reset do formulário)
  const prevValueRef = useRef<number>(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setDisplayValue(value ? formatBRLCurrency(value) : "");
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = maskCurrencyInput(e.target.value);
    setDisplayValue(formatted);
    const num = unmaskCurrencyInput(formatted);
    prevValueRef.current = num;
    onChange(num);
  };

  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-right font-mono text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        type="text"
        inputMode="numeric"
        value={displayValue}
        placeholder="0,00"
        onChange={handleChange}
        autoComplete="off"
      />
    </label>
  );
}

/**
 * NumberField — para campos inteiros (ex: quantidade de transações).
 */
function NumberField({ label, value, onChange, integer }: {
  label: string; value: number; onChange: (v: number) => void; integer?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const formatted = value ? value.toLocaleString("pt-BR") : "";

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    setDraft(value ? String(value) : "");
    setTimeout(() => e.target.select(), 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleaned = integer
      ? raw.replace(/\D/g, "")
      : raw.replace(/[^\d.,]/g, "");
    setDraft(cleaned);
    const parsed = integer
      ? parseInt(cleaned || "0", 10)
      : parseBRLInput(cleaned);
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = integer
      ? parseInt(draft.replace(/\D/g, "") || "0", 10)
      : parseBRLInput(draft);
    onChange(isNaN(parsed) ? 0 : parsed);
    setDraft("");
  };

  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-right font-mono text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        type="text"
        inputMode="numeric"
        value={focused ? draft : formatted}
        placeholder="0"
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </label>
  );
}

function TextFieldSimple({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input className="w-full rounded border border-gray-300 p-2 text-sm" type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TextareaField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <textarea className="min-h-20 w-full rounded border border-gray-300 p-2 text-sm" value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
