import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";

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

/** Formata data ISO para dd/mm/aaaa usando UTC para não mudar o dia */
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

/** Formata número como moeda BRL */
function moneyBR(value?: unknown): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Normaliza string para comparação de permissão */
function normalizePermValue(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

/** Verifica se o usuário pode acessar o módulo */
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

/** Retorna true se hoje for quarta-feira */
function hojeEhQuarta(): boolean {
  return new Date().getDay() === 3;
}

/** Data de hoje em ISO yyyy-mm-dd */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Retorna a próxima quarta-feira a partir de uma data base (ISO string ou Date).
 * Se a base já for quarta, avança para a próxima quarta.
 */
function proximaQuartaFeira(base: string | Date): string {
  const d =
    typeof base === "string"
      ? new Date(base + (base.length === 10 ? "T00:00:00Z" : ""))
      : new Date(base);
  d.setUTCHours(12, 0, 0, 0);
  const dia = d.getUTCDay(); // 0=dom, 3=qua
  const diff = ((3 - dia + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Adiciona N dias a uma data ISO */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calcula os campos automáticos da semana com base no acompanhamento */
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

/** Calcula o status da semana */
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

/** Recomendação baseada no histórico */
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

/** Monta URL do WhatsApp com mensagem completa incluindo semana e período */
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

/** Badge de status */
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

/** Label legível de status */
function labelStatus(status?: string | null): string {
  const value = String(status || "").trim();
  if (!value) return "Pendente";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/** Normaliza rows da API */
function normalizeRows(payload: any): Acompanhamento[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.acompanhamentos)) return payload.acompanhamentos;
  return [];
}

/** Obtém token de autenticação */
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

/** Headers de autenticação */
function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

/** Exporta acompanhamento como CSV */
function exportarCSV(row: Acompanhamento) {
  const atualizacoes: any[] = Array.isArray(row.atualizacoes)
    ? row.atualizacoes
    : [];

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

  const saldoUltimaSemana =
    atualizacoes.length > 0
      ? atualizacoes[atualizacoes.length - 1]?.saldo_semanal
      : row.saldo_semanal;

  const statusUltimaSemana =
    atualizacoes.length > 0
      ? atualizacoes[atualizacoes.length - 1]?.status_semana ||
        atualizacoes[atualizacoes.length - 1]?.status
      : row.status_semana || row.status;

  const statusClass = (value: unknown) => {
    const normalized = String(value || "").toLowerCase();
    if (normalized.includes("neg")) return "negativo";
    if (normalized.includes("aten")) return "atencao";
    if (normalized.includes("pos")) return "positivo";
    return "neutro";
  };

  const semanaRows = atualizacoes
    .map((item) => {
      const totalEntradas =
        Number(item.total_entradas || 0) ||
        Number(item.entrada_maquininha || 0) +
          Number(item.entrada_pix || 0) +
          Number(item.entrada_boleto || 0) +
          Number(item.entrada_ted || 0) +
          Number(item.entrada_dinheiro || 0) +
          Number(item.outras_entradas || 0);
      return `
        <tr>
          <td>Semana ${safe(item.numero_semana)}</td>
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

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
    .brand { background: #0B3B82; color: white; padding: 18px 22px; border-radius: 12px; }
    .brand h1 { margin: 0; font-size: 22px; }
    .brand p { margin: 4px 0 0; font-size: 12px; opacity: .92; }
    .section { margin-top: 18px; }
    .section-title { color: #0B3B82; font-weight: 700; font-size: 14px; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .card { border: 1px solid #dbe4f0; border-radius: 10px; padding: 10px; background: #f8fafc; min-height: 58px; }
    .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
    .value { font-size: 14px; font-weight: 700; margin-top: 4px; }
    .value.negative, .negative { color: #dc2626; font-weight: 700; }
    .value.positive, .positive { color: #15803d; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 11px; }
    th { background: #eaf1fb; color: #0B3B82; border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    td { border: 1px solid #e2e8f0; padding: 7px; vertical-align: top; }
    .money { text-align: right; white-space: nowrap; }
    .strong { font-weight: 700; }
    .badge { border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 700; }
    .badge.negativo { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge.positivo { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge.atencao { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .badge.neutro { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .note { border-left: 4px solid #0B3B82; background: #eff6ff; padding: 12px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="brand">
    <h1>Acompanhamento Bancário — Destrava Crédito</h1>
    <p>${safe(row.nome_empresa)} — ${safe(row.banco_observado)} | Gerado em ${safe(new Date().toLocaleDateString("pt-BR"))}</p>
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
          <th>Total entradas</th><th>Saídas</th><th>Saldo</th><th>Rating Bacen</th><th>Rating interno</th>
          <th>SCR</th><th>Cenprot</th><th>Serasa</th><th>CND</th><th>PLD/AML</th><th>COAF</th><th>Status</th>
          <th>Análise</th><th>Orientação</th><th>Próxima ação</th>
        </tr>
      </thead>
      <tbody>
        ${
          semanaRows ||
          `<tr><td colspan="23">Nenhuma atualização semanal registrada.</td></tr>`
        }
      </tbody>
    </table>
  </div>
</body>
</html>`;

  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `acompanhamento-bancario-${slug(row.nome_empresa)}-${slug(row.banco_observado)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ─── Bancos sugeridos ─────────────────────────────────────────────────────────
const BANCOS_SUGERIDOS = [
  "SICOOB",
  "Caixa",
  "Banco do Brasil",
  "Bradesco",
  "Itaú",
  "Santander",
  "Sicredi",
  "Cresol",
  "Inter",
  "Cora",
  "Stone",
  "Outro",
];

// ─── Campos do formulário Novo Acompanhamento ─────────────────────────────────
const NOVO_FIELDS = [
  // Dados da empresa
  { key: "nome_empresa", label: "Empresa", required: true, group: "empresa" },
  { key: "cnpj", label: "CNPJ", group: "empresa" },
  { key: "telefone_cliente", label: "Telefone", group: "empresa" },
  { key: "whatsapp_cliente", label: "WhatsApp", group: "empresa" },
  { key: "email_cliente", label: "E-mail", group: "empresa" },
  // Dados bancários
  {
    key: "banco_observado",
    label: "Banco observado",
    required: true,
    group: "banco",
    type: "banco",
  },
  { key: "agencia", label: "Agência", group: "banco" },
  { key: "conta", label: "Conta", group: "banco" },
  { key: "gerente_banco", label: "Gerente do banco", group: "banco" },
  { key: "contato_banco", label: "Contato do banco", group: "banco" },
  {
    key: "data_abertura_conta",
    label: "Data de abertura/relacionamento",
    type: "date",
    group: "banco",
  },
  {
    key: "data_inicio",
    label: "Início do acompanhamento",
    type: "date",
    group: "banco",
    required: true,
  },
  // Objetivo
  { key: "objetivo_credito", label: "Objetivo do crédito", group: "objetivo" },
  {
    key: "valor_credito_pretendido",
    label: "Valor pretendido",
    type: "number",
    group: "objetivo",
  },
  { key: "linha_credito_pretendida", label: "Linha pretendida", group: "objetivo" },
  // Rating/faturamento
  { key: "rating_bacen_inicial", label: "Rating Bacen inicial", group: "rating" },
  {
    key: "rating_interno_inicial",
    label: "Rating interno inicial",
    group: "rating",
  },
  {
    key: "faturamento_anual",
    label: "Faturamento anual",
    type: "number",
    group: "rating",
  },
  {
    key: "media_mensal",
    label: "Média mensal",
    type: "number",
    group: "rating",
  },
  {
    key: "margem_seguranca_30",
    label: "Margem de segurança 30%",
    type: "number",
    group: "rating",
  },
  // Gestão
  {
    key: "observacoes_iniciais",
    label: "Observações iniciais",
    textarea: true,
    group: "gestao",
  },
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
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [updOpen, setUpdOpen] = useState<Acompanhamento | null>(null);
  const [modoEdicaoSemana, setModoEdicaoSemana] = useState(false);
  const [detalhe, setDetalhe] = useState<Acompanhamento | null>(null);
  const [imprimirOpen, setImprimirOpen] = useState<Acompanhamento | null>(null);

  const [novo, setNovo] = useState<Acompanhamento>({
    nome_empresa: "",
    banco_observado: "",
    data_inicio: hojeISO(),
  });

  const [upd, setUpd] = useState<AtualizacaoForm>(updFormInicial());

  const printRef = useRef<HTMLDivElement>(null);

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
      if (!response.ok) {
        setRows([]);
        return;
      }
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
      acompanhamento: filtered.filter((r) => r.status === "em_acompanhamento")
        .length,
      pendentes: filtered.filter(
        (r) => r.status_pendente || r.atualizacao_pendente
      ).length,
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

  // ─── Abrir modal de atualização ───────────────────────────────────────────────
  const abrirAtualizacao = async (row: Acompanhamento) => {
    let rowComAtualizacoes = row;
    try {
      const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, {
        headers: authHeaders(),
      });
      if (resp.ok) rowComAtualizacoes = await resp.json();
    } catch {
      // usa row sem atualizações
    }

    const campos = calcularCamposSemana(rowComAtualizacoes);
    setModoEdicaoSemana(false);
    setUpdOpen(rowComAtualizacoes);
    setUpd({ ...updFormInicial(), ...campos });
  };

  // ─── Salvar / editar acompanhamento ──────────────────────────────────────────
  const limparFormularioAcompanhamento = () => {
    setEditandoId(null);
    setNovo({ nome_empresa: "", banco_observado: "", data_inicio: hojeISO() });
  };

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
      const method = editandoId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(novo),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        alert(`Erro ao salvar acompanhamento. ${errorText}`);
        return;
      }

      const idEditado = editandoId;
      setNovoOpen(false);
      limparFormularioAcompanhamento();
      await fetchData();

      if (idEditado && detalhe?.id === idEditado) {
        carregarDetalhe(idEditado);
      }
    } finally {
      setSaving(false);
    }
  };

  const editarAcompanhamento = async (row: Acompanhamento) => {
    let rowCompleto = row;
    try {
      const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, {
        headers: authHeaders(),
      });
      if (resp.ok) rowCompleto = await resp.json();
    } catch {
      // mantém dados da linha caso o detalhe falhe
    }

    setEditandoId(String(rowCompleto.id));
    setNovo({
      empresa_id: rowCompleto.empresa_id || "",
      lead_id: rowCompleto.lead_id || "",
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
      objetivo_credito: rowCompleto.objetivo_credito || "",
      valor_credito_pretendido: rowCompleto.valor_credito_pretendido ?? "",
      linha_credito_pretendida: rowCompleto.linha_credito_pretendida || "",
      rating_bacen_inicial: rowCompleto.rating_bacen_inicial || "",
      rating_interno_inicial: rowCompleto.rating_interno_inicial || "",
      faturamento_anual: rowCompleto.faturamento_anual ?? "",
      media_mensal: rowCompleto.media_mensal ?? "",
      margem_seguranca_30: rowCompleto.margem_seguranca_30 ?? "",
      observacoes_iniciais: rowCompleto.observacoes_iniciais || "",
    });
    setDetalhe(null);
    setUpdOpen(null);
    setModoEdicaoSemana(false);
    setNovoOpen(true);
  };

  const excluirAcompanhamento = async (row: Acompanhamento) => {
    const ok = confirm(
      `Apagar definitivamente o acompanhamento de ${row.nome_empresa || "empresa"} no banco ${row.banco_observado || ""}?\n\nEssa ação remove também o histórico semanal vinculado a este acompanhamento.`
    );
    if (!ok) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        alert(`Erro ao apagar acompanhamento. ${errorText}`);
        return;
      }

      if (detalhe?.id === row.id) setDetalhe(null);
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  // ─── Salvar atualização semanal ───────────────────────────────────────────────
  const salvarAtualizacao = async () => {
    if (!updOpen?.id) return;
    setSaving(true);
    try {
      const payload = {
        ...upd,
        total_entradas: totalEntradas,
        saldo_semanal: saldoSemanal,
        status_semana: statusSemanaCalculado,
      };
      const response = await fetch(
        `/api/acompanhamentos-bancarios/${updOpen.id}/atualizacoes`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        alert(`Erro ao salvar atualização. ${errorText}`);
        return;
      }
      const idAtualizado = updOpen.id;
      setUpdOpen(null);
      setModoEdicaoSemana(false);
      await fetchData();
      if (detalhe?.id === idAtualizado) {
        carregarDetalhe(idAtualizado);
      }

    } finally {
      setSaving(false);
    }
  };

  const editarAtualizacaoSemanal = (row: Acompanhamento, item: any) => {
    setModoEdicaoSemana(true);
    setUpdOpen(row);
    setUpd({
      ...updFormInicial(),
      numero_semana: Number(item.numero_semana || 1),
      data_referencia_inicio: String(item.data_referencia_inicio || "").slice(0, 10),
      data_referencia_fim: String(item.data_referencia_fim || "").slice(0, 10),
      data_atualizacao: String(item.data_atualizacao || item.data_referencia_fim || "").slice(0, 10),
      proxima_atualizacao_apos_salvar: proximaQuartaFeira(String(item.data_atualizacao || item.data_referencia_fim || hojeISO()).slice(0, 10)),
      entrada_maquininha: Number(item.entrada_maquininha || 0),
      entrada_pix: Number(item.entrada_pix || 0),
      entrada_boleto: Number(item.entrada_boleto || 0),
      entrada_ted: Number(item.entrada_ted || 0),
      entrada_dinheiro: Number(item.entrada_dinheiro || 0),
      outras_entradas: Number(item.outras_entradas || 0),
      total_saidas: Number(item.total_saidas || 0),
      saldo_medio: Number(item.saldo_medio || 0),
      saldo_final: Number(item.saldo_final || 0),
      quantidade_transacoes: Number(item.quantidade_transacoes || 0),
      rating_bacen: item.rating_bacen || "",
      rating_interno: item.rating_interno || "",
      scr_status: item.scr_status || item.restricao_scr || "",
      cenprot_status: item.cenprot_status || item.restricao_cenprot || "",
      serasa_status: item.serasa_status || item.restricao_serasa || "",
      cnd_status: item.cnd_status || item.cnd_regular || "",
      pld_aml_status: item.pld_aml_status || item.pld_aml || "",
      coaf_status: item.coaf_status || item.operacao_suspeita_coaf || "",
      possui_restricao: Boolean(item.possui_restricao),
      restricao_nova: Boolean(item.restricao_nova),
      devolucao_ou_estorno: Boolean(item.devolucao_ou_estorno),
      ocorrencia_negativa: Boolean(item.ocorrencia_negativa),
      analise_semana: item.analise_semana || "",
      orientacao_cliente: item.orientacao_cliente || "",
      proxima_acao: item.proxima_acao || "",
    });
  };

  const excluirAtualizacaoSemanal = async (row: Acompanhamento, item: any) => {
    const numeroSemana = Number(item.numero_semana || 0);
    if (!numeroSemana) return;
    const ok = confirm(`Apagar a Semana ${numeroSemana} deste acompanhamento?`);
    if (!ok) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/acompanhamentos-bancarios/${row.id}/atualizacoes/${numeroSemana}`,
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
      await carregarDetalhe(row.id);
    } finally {
      setSaving(false);
    }
  };

  // ─── Carregar detalhe ─────────────────────────────────────────────────────────
  const carregarDetalhe = async (id: string) => {
    const response = await fetch(`/api/acompanhamentos-bancarios/${id}`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      alert("Não foi possível carregar os detalhes.");
      return;
    }
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
    const observacoes_finais =
      prompt("Observações finais do encerramento:") || "";
    await fetch(`/api/acompanhamentos-bancarios/${id}/encerrar`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ observacoes_finais }),
    });
    fetchData();
  };

  // ─── Adicionar outro banco ────────────────────────────────────────────────────
  const adicionarOutroBanco = (row: Acompanhamento) => {
    setEditandoId(null);
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
    } catch {
      // usa row sem atualizações
    }
    setImprimirOpen(rowCompleto);
  };

  const handleImprimir = () => {
    window.print();
  };

  const renderActionButtons = (row: Acompanhamento) => {
    const whats = whatsappUrl(row);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          onClick={() => carregarDetalhe(row.id)}
        >Detalhes</button>
        <button
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={() => editarAcompanhamento(row)}
          title="Editar dados cadastrais, banco, rating e parâmetros do acompanhamento"
        >Editar</button>
        <button
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          onClick={() => abrirAtualizacao(row)}
        >Atualizar</button>
        <button
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          onClick={() => adicionarOutroBanco(row)}
          title="Criar acompanhamento separado para outro banco da mesma empresa"
        >+ Outro banco</button>
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
            exportarCSV(rowCompleto);
          }}
        >Exportar XLS</button>
        <button
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          onClick={() => prorrogar(row.id)}
        >Prorrogar</button>
        <button
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
          onClick={() => encerrar(row.id)}
        >Encerrar</button>
        <button
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
          onClick={() => excluirAcompanhamento(row)}
          title="Apagar acompanhamento e histórico semanal vinculado"
        >Apagar</button>
      </div>
    );
  };

  // ─── Acesso negado ────────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <ColaboradorLayout title="Acompanhamento Bancário">
        <div className="p-6">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="text-lg font-semibold text-red-700">
              Acesso restrito
            </h2>
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
      <div className="w-full space-y-4 overflow-x-hidden p-4 md:p-6">

        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:flex-row">
          <div>
            <h1 className="text-2xl font-bold">Acompanhamento Bancário</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Monitoramento semanal de empresas em relacionamento bancário para
              evolução de rating, movimentação e preparação para crédito.
            </p>
          </div>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => {
              setEditandoId(null);
              setNovo({ nome_empresa: "", banco_observado: "", data_inicio: hojeISO() });
              setNovoOpen(true);
            }}
          >
            Novo Acompanhamento
          </button>
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Em acompanhamento", resumo.acompanhamento],
              ["Atualizações pendentes", resumo.pendentes],
              ["Semanas positivas", resumo.positivas],
              ["Semanas negativas", resumo.negativas],
              ["Prontos para análise", resumo.prontos],
              ["Prorrogados", resumo.prorrogados],
            ] as [string, number][]
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="text-xs text-gray-500">{label}</div>
              <div className="mt-1 text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              className="rounded border border-gray-300 p-2 text-sm"
              placeholder="Buscar empresa/CNPJ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <input
              className="rounded border border-gray-300 p-2 text-sm"
              placeholder="Banco observado"
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
            />
            <select
              className="rounded border border-gray-300 p-2 text-sm"
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value)}
            >
              <option value="todos">Todos os status</option>
              <option value="em_acompanhamento">Em acompanhamento</option>
              <option value="prorrogado">Prorrogado</option>
              <option value="encerrado">Encerrado</option>
              <option value="pronto_credito">Pronto para crédito</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pendentes}
                onChange={(e) => setPendentes(e.target.checked)}
              />
              Apenas pendentes
            </label>
            <button
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              onClick={fetchData}
            >
              Aplicar filtros
            </button>
          </div>
        </div>

        {/* Tabela / cards operacionais */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Acompanhamentos cadastrados
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              As ações ficam abaixo de cada registro para manter a planilha alinhada e legível.
            </p>
          </div>

          {/* Desktop/tablet largo */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[13%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-3 py-3">CNPJ</th>
                  <th className="px-3 py-3">Banco</th>
                  <th className="px-3 py-3">Rating</th>
                  <th className="px-3 py-3">Última atualização</th>
                  <th className="px-3 py-3">Próxima atualização</th>
                  <th className="px-3 py-3 text-right">Saldo última semana</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-5 text-gray-500" colSpan={9}>
                      Carregando acompanhamentos...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-gray-500" colSpan={9}>
                      Nenhum acompanhamento cadastrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const pendente = row.status_pendente || row.atualizacao_pendente;
                    const saldo = Number(row.saldo_semanal || row.saldo_ultima_semana || 0);

                    return (
                      <Fragment key={row.id}>
                        <tr className="border-t border-gray-100 align-middle hover:bg-gray-50/60">
                          <td className="px-4 py-4">
                            <div className="min-w-0">
                              <div className="break-words font-semibold leading-snug text-gray-900">
                                {row.nome_empresa || "-"}
                              </div>
                              {pendente && (
                                <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                                  Pendente
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-gray-700">
                            <span className="break-words">{row.cnpj || "-"}</span>
                          </td>
                          <td className="px-3 py-4 font-medium text-gray-800">
                            {row.banco_observado || "-"}
                          </td>
                          <td className="px-3 py-4 text-gray-700">
                            {row.rating_interno_atual || row.rating_bacen_atual || "-"}
                          </td>
                          <td className="px-3 py-4 text-gray-700">
                            {formatDateBR(row.ultima_atualizacao_em || row.ultimo_update_em)}
                          </td>
                          <td className="px-3 py-4 text-gray-700">
                            {formatDateBR(row.proxima_atualizacao)}
                          </td>
                          <td
                            className={`px-3 py-4 text-right font-semibold ${
                              saldo < 0 ? "text-red-600" : saldo > 0 ? "text-green-700" : "text-gray-700"
                            }`}
                          >
                            {moneyBR(saldo)}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(row.status_semana)}`}
                            >
                              {labelStatus(row.status_semana)}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-gray-700">
                            {row.responsavel_nome || "-"}
                          </td>
                        </tr>
                        <tr className="border-t border-gray-100 bg-gray-50/70">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                Ações do acompanhamento
                              </div>
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

          {/* Mobile/tablet estreito */}
          <div className="grid gap-3 p-3 lg:hidden">
            {loading ? (
              <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
                Carregando acompanhamentos...
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
                Nenhum acompanhamento cadastrado.
              </div>
            ) : (
              filtered.map((row) => {
                const pendente = row.status_pendente || row.atualizacao_pendente;
                const saldo = Number(row.saldo_semanal || row.saldo_ultima_semana || 0);

                return (
                  <article key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold leading-snug text-gray-900">
                          {row.nome_empresa || "-"}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          {row.cnpj || "-"} · {row.banco_observado || "-"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(row.status_semana)}`}
                      >
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

                    <div className="mt-4 border-t border-gray-100 pt-3">
                      {renderActionButtons(row)}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {/* ── Modal — Novo Acompanhamento ──────────────────────────────────── */}
        {novoOpen && (
          <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-4">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{editandoId ? "Editar Acompanhamento" : "Novo Acompanhamento"}</h3>
                  <p className="text-sm text-gray-600">
                    {editandoId ? "Altere dados cadastrais, banco, rating e parâmetros do acompanhamento salvo." : "Cadastre a empresa, o banco observado e os dados iniciais para acompanhamento de 30 dias."}
                  </p>
                </div>
                <button
                  className="rounded border px-3 py-1 text-sm"
                  onClick={() => setNovoOpen(false)}
                >
                  Fechar
                </button>
              </div>

              {/* Dados da empresa */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                Dados da empresa
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "empresa").map(
                  (field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={novo[field.key]}
                      onChange={(v) =>
                        setNovo((p) => ({ ...p, [field.key]: v }))
                      }
                    />
                  )
                )}
              </div>

              {/* Dados bancários */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                Dados bancários
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "banco").map((field) =>
                  field.type === "banco" ? (
                    <BancoField
                      key={field.key}
                      label={field.label}
                      required={field.required}
                      value={novo[field.key] || ""}
                      onChange={(v) =>
                        setNovo((p) => ({ ...p, [field.key]: v }))
                      }
                    />
                  ) : (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={novo[field.key]}
                      onChange={(v) =>
                        setNovo((p) => ({ ...p, [field.key]: v }))
                      }
                    />
                  )
                )}
              </div>

              {/* Objetivo */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                Objetivo
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "objetivo").map(
                  (field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={novo[field.key]}
                      onChange={(v) =>
                        setNovo((p) => ({ ...p, [field.key]: v }))
                      }
                    />
                  )
                )}
              </div>

              {/* Rating/faturamento */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                Rating e faturamento
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "rating").map(
                  (field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={novo[field.key]}
                      onChange={(v) =>
                        setNovo((p) => ({ ...p, [field.key]: v }))
                      }
                    />
                  )
                )}
              </div>

              {/* Gestão */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                Gestão
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "gestao").map(
                  (field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={novo[field.key]}
                      onChange={(v) =>
                        setNovo((p) => ({ ...p, [field.key]: v }))
                      }
                    />
                  )
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={saving}
                  onClick={salvarNovo}
                >
                  {saving ? "Salvando..." : editandoId ? "Salvar alterações" : "Salvar acompanhamento"}
                </button>
                <button
                  className="rounded border px-4 py-2 text-sm"
                  onClick={() => setNovoOpen(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal — Atualização Semanal ──────────────────────────────────── */}
        {updOpen && (
          <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-4">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{modoEdicaoSemana ? "Editar Semana Salva" : "Atualização Semanal"}</h3>
                  <p className="text-sm font-medium text-gray-700">
                    {updOpen.nome_empresa} — {updOpen.banco_observado}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                    onClick={() => adicionarOutroBanco(updOpen)}
                  >
                    + Outro banco
                  </button>
                  <button
                    className="rounded border px-3 py-1 text-sm"
                    onClick={() => setUpdOpen(null)}
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {/* Contexto da semana */}
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                <strong>Semana {upd.numero_semana}</strong>
                {" | "}
                Período: {formatDateBR(upd.data_referencia_inicio)} a{" "}
                {formatDateBR(upd.data_referencia_fim)}
                {" | "}
                Atualização prevista: {formatDateBR(upd.data_atualizacao)}
                {" | "}
                Próxima atualização:{" "}
                {formatDateBR(upd.proxima_atualizacao_apos_salvar)}
              </div>

              {/* Bloco A — Período da semana (readonly) */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                A — Período da semana
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <ReadonlyField
                  label="Número da semana"
                  value={String(upd.numero_semana)}
                />
                <ReadonlyField
                  label="Início do período"
                  value={formatDateBR(upd.data_referencia_inicio)}
                />
                <ReadonlyField
                  label="Fim do período"
                  value={formatDateBR(upd.data_referencia_fim)}
                />
                <ReadonlyField
                  label="Data da atualização"
                  value={formatDateBR(upd.data_atualizacao)}
                />
                <ReadonlyField
                  label="Próxima atualização após salvar"
                  value={formatDateBR(upd.proxima_atualizacao_apos_salvar)}
                />
              </div>

              {/* Bloco B — Entradas */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                B — Entradas da semana
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {(
                  [
                    "entrada_maquininha",
                    "entrada_pix",
                    "entrada_boleto",
                    "entrada_ted",
                    "entrada_dinheiro",
                    "outras_entradas",
                  ] as const
                ).map((key) => (
                  <NumberField
                    key={key}
                    label={labelEntrada(key)}
                    value={upd[key]}
                    onChange={(v) => setUpd((p) => ({ ...p, [key]: v }))}
                  />
                ))}
                <ReadonlyField
                  label="Total de entradas"
                  value={moneyBR(totalEntradas)}
                  highlight
                />
              </div>

              {/* Bloco C — Saídas e saldos */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                C — Saídas e saldos
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <NumberField
                  label="Total de saídas"
                  value={upd.total_saidas}
                  onChange={(v) => setUpd((p) => ({ ...p, total_saidas: v }))}
                />
                <NumberField
                  label="Saldo médio"
                  value={upd.saldo_medio}
                  onChange={(v) => setUpd((p) => ({ ...p, saldo_medio: v }))}
                />
                <NumberField
                  label="Saldo final"
                  value={upd.saldo_final}
                  onChange={(v) => setUpd((p) => ({ ...p, saldo_final: v }))}
                />
                <NumberField
                  label="Quantidade de transações"
                  value={upd.quantidade_transacoes}
                  onChange={(v) =>
                    setUpd((p) => ({ ...p, quantidade_transacoes: v }))
                  }
                  integer
                />
                <ReadonlyField
                  label="Saldo semanal calculado"
                  value={moneyBR(saldoSemanal)}
                  highlight
                />
              </div>

              {/* Bloco D — Rating e conformidade */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                D — Rating e conformidade
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <TextFieldSimple
                  label="Rating Bacen"
                  value={upd.rating_bacen}
                  onChange={(v) => setUpd((p) => ({ ...p, rating_bacen: v }))}
                />
                <TextFieldSimple
                  label="Rating interno"
                  value={upd.rating_interno}
                  onChange={(v) => setUpd((p) => ({ ...p, rating_interno: v }))}
                />
                <TextFieldSimple
                  label="SCR"
                  value={upd.scr_status}
                  onChange={(v) => setUpd((p) => ({ ...p, scr_status: v }))}
                />
                <TextFieldSimple
                  label="Cenprot"
                  value={upd.cenprot_status}
                  onChange={(v) => setUpd((p) => ({ ...p, cenprot_status: v }))}
                />
                <TextFieldSimple
                  label="Serasa"
                  value={upd.serasa_status}
                  onChange={(v) => setUpd((p) => ({ ...p, serasa_status: v }))}
                />
                <TextFieldSimple
                  label="CND"
                  value={upd.cnd_status}
                  onChange={(v) => setUpd((p) => ({ ...p, cnd_status: v }))}
                />
                <TextFieldSimple
                  label="PLD/AML"
                  value={upd.pld_aml_status}
                  onChange={(v) => setUpd((p) => ({ ...p, pld_aml_status: v }))}
                />
                <TextFieldSimple
                  label="COAF"
                  value={upd.coaf_status}
                  onChange={(v) => setUpd((p) => ({ ...p, coaf_status: v }))}
                />
              </div>

              {/* Bloco E — Ocorrências */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                E — Ocorrências
              </h4>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {(
                  [
                    ["possui_restricao", "Possui restrição?"],
                    ["restricao_nova", "Restrição nova?"],
                    ["devolucao_ou_estorno", "Devolução ou estorno?"],
                    ["ocorrencia_negativa", "Ocorrência negativa?"],
                  ] as [keyof AtualizacaoForm, string][]
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded border border-gray-200 p-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(upd[key])}
                      onChange={(e) =>
                        setUpd((p) => ({ ...p, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Bloco F — Análise */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                F — Análise
              </h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <TextareaField
                  label="Análise da semana"
                  value={upd.analise_semana}
                  onChange={(v) =>
                    setUpd((p) => ({ ...p, analise_semana: v }))
                  }
                />
                <TextareaField
                  label="Orientação ao cliente"
                  value={upd.orientacao_cliente}
                  onChange={(v) =>
                    setUpd((p) => ({ ...p, orientacao_cliente: v }))
                  }
                />
                <TextareaField
                  label="Próxima ação"
                  value={upd.proxima_acao}
                  onChange={(v) => setUpd((p) => ({ ...p, proxima_acao: v }))}
                />
              </div>

              {/* Resumo calculado */}
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <strong>Total de entradas:</strong> {moneyBR(totalEntradas)}
                {" | "}
                <strong>Saldo semanal:</strong> {moneyBR(saldoSemanal)}
                {" | "}
                <strong>Status estimado:</strong>{" "}
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(statusSemanaCalculado)}`}
                >
                  {labelStatus(statusSemanaCalculado)}
                </span>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={saving}
                  onClick={salvarAtualizacao}
                >
                  {saving ? "Salvando..." : modoEdicaoSemana ? "Salvar edição da semana" : "Salvar atualização semanal"}
                </button>
                <button
                  className="rounded border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700"
                  onClick={() => adicionarOutroBanco(updOpen)}
                >
                  + Outro banco
                </button>
                <button
                  className="rounded border px-4 py-2 text-sm"
                  onClick={() => setUpdOpen(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal — Detalhes ─────────────────────────────────────────────── */}
        {detalhe && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 p-3 sm:p-5">
            <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                      Relatório operacional
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-slate-950">
                      Detalhes do Acompanhamento
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {detalhe.nome_empresa} — {detalhe.banco_observado}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                      onClick={() => abrirAtualizacao(detalhe)}
                    >
                      Atualizar semana
                    </button>
                    <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => editarAcompanhamento(detalhe)}>Editar acompanhamento</button>
                    <button
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                      onClick={() => adicionarOutroBanco(detalhe)}
                    >
                      + Outro banco
                    </button>
                    <button
                      className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-100"
                      onClick={() => exportarCSV(detalhe)}
                    >
                      Exportar XLS
                    </button>
                    <button
                      className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100"
                      onClick={() => {
                        setImprimirOpen(detalhe);
                        setDetalhe(null);
                      }}
                    >
                      Imprimir
                    </button>
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      onClick={() => setDetalhe(null)}
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-5 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6">
                {/* Resumo executivo */}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">
                        Resumo executivo
                      </h4>
                      <p className="text-xs text-slate-500">
                        Visão rápida do acompanhamento, próximo vencimento e situação atual.
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(detalhe.status_semana || detalhe.status)}`}
                    >
                      {labelStatus(detalhe.status_semana || detalhe.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoCard label="Empresa" value={detalhe.nome_empresa} />
                    <InfoCard label="CNPJ" value={detalhe.cnpj} />
                    <InfoCard label="Banco observado" value={detalhe.banco_observado} />
                    <InfoCard label="Responsável" value={detalhe.responsavel_nome || "Admin"} />
                    <InfoCard label="Início do acompanhamento" value={formatDateBR(detalhe.data_inicio)} />
                    <InfoCard label="Fim previsto" value={formatDateBR(detalhe.data_fim_prevista)} />
                    <InfoCard label="Próxima atualização" value={formatDateBR(detalhe.proxima_atualizacao)} />
                    <InfoCard label="Prorrogado" value={detalhe.prorrogado ? "Sim" : "Não"} />
                  </div>
                </section>

                {/* Indicadores */}
                <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
                    <h4 className="text-base font-bold text-slate-900">
                      Indicadores financeiros e rating
                    </h4>
                    <p className="mb-3 text-xs text-slate-500">
                      Números centrais para análise de evolução e capacidade.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <InfoCard label="Rating Bacen atual" value={detalhe.rating_bacen_atual || detalhe.rating_bacen_inicial} />
                      <InfoCard label="Rating interno inicial" value={detalhe.rating_interno_inicial} />
                      <InfoCard label="Rating interno atual" value={detalhe.rating_interno_atual} />
                      <InfoCard label="Faturamento anual" value={moneyBR(detalhe.faturamento_anual)} />
                      <InfoCard label="Média mensal" value={moneyBR(detalhe.media_mensal)} />
                      <InfoCard label="Margem ±30%" value={moneyBR(detalhe.margem_seguranca_30)} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
                    <h4 className="text-base font-bold text-blue-950">
                      Recomendação operacional
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-blue-900">
                      {calcularRecomendacao(detalhe)}
                    </p>
                    <div className="mt-4 rounded-xl border border-blue-200 bg-white/70 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                        Saldo última semana
                      </div>
                      <div
                        className={`mt-1 text-lg font-bold ${
                          Number(detalhe.saldo_semanal || 0) < 0
                            ? "text-red-600"
                            : "text-emerald-700"
                        }`}
                      >
                        {moneyBR(detalhe.saldo_semanal)}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Objetivo e dados bancários */}
                <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h4 className="text-base font-bold text-slate-900">
                      Objetivo e estratégia de crédito
                    </h4>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InfoCard label="Objetivo do crédito" value={detalhe.objetivo_credito} />
                      <InfoCard label="Linha pretendida" value={detalhe.linha_credito_pretendida} />
                      <InfoCard label="Valor pretendido" value={moneyBR(detalhe.valor_credito_pretendido)} />
                      <InfoCard label="Status" value={labelStatus(detalhe.status)} />
                    </div>
                    {detalhe.observacoes_iniciais && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <strong>Observações:</strong> {detalhe.observacoes_iniciais}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h4 className="text-base font-bold text-slate-900">
                      Dados bancários e relacionamento
                    </h4>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InfoCard label="Agência" value={detalhe.agencia} />
                      <InfoCard label="Conta" value={detalhe.conta} />
                      <InfoCard label="Gerente do banco" value={detalhe.gerente_banco} />
                      <InfoCard label="Contato do banco" value={detalhe.contato_banco} />
                      <InfoCard label="Abertura de conta" value={formatDateBR(detalhe.data_abertura_conta)} />
                      <InfoCard label="E-mail" value={detalhe.email_cliente} />
                    </div>
                  </div>
                </section>

                {/* Histórico semanal */}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">
                        Histórico semanal
                      </h4>
                      <p className="text-xs text-slate-500">
                        Cada semana fica organizada em blocos: entradas, saídas, rating, conformidade e análise.
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {Array.isArray(detalhe.atualizacoes) ? detalhe.atualizacoes.length : 0} semana(s)
                    </span>
                  </div>

                  <div className="space-y-4">
                    {Array.isArray(detalhe.atualizacoes) &&
                    detalhe.atualizacoes.length > 0 ? (
                      detalhe.atualizacoes.map((item: any) => {
                        const entradas =
                          Number(item.total_entradas || 0) ||
                          Number(item.entrada_maquininha || 0) +
                            Number(item.entrada_pix || 0) +
                            Number(item.entrada_boleto || 0) +
                            Number(item.entrada_ted || 0) +
                            Number(item.entrada_dinheiro || 0) +
                            Number(item.outras_entradas || 0);
                        const saldo = Number(item.saldo_semanal || 0);

                        return (
                          <article
                            key={item.id || item.numero_semana}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h5 className="text-sm font-bold text-slate-900">
                                  Semana {item.numero_semana}
                                </h5>
                                <p className="text-xs text-slate-500">
                                  {formatDateBR(item.data_referencia_inicio)} a{" "}
                                  {formatDateBR(item.data_referencia_fim)}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(item.status_semana || item.status)}`}
                                >
                                  {labelStatus(item.status_semana || item.status)}
                                </span>
                                <button
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  onClick={() => editarAtualizacaoSemanal(detalhe, item)}
                                  title="Editar dados já salvos desta semana"
                                >Editar semana</button>
                                <button
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                  onClick={() => excluirAtualizacaoSemanal(detalhe, item)}
                                  title="Apagar esta semana do histórico"
                                >Apagar semana</button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <h6 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Entradas
                                </h6>
                                <div className="space-y-1 text-xs text-slate-700">
                                  <div className="flex justify-between gap-3"><span>Maquininha</span><strong>{moneyBR(item.entrada_maquininha)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Pix</span><strong>{moneyBR(item.entrada_pix)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Boleto</span><strong>{moneyBR(item.entrada_boleto)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>TED</span><strong>{moneyBR(item.entrada_ted)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Dinheiro</span><strong>{moneyBR(item.entrada_dinheiro)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Outras</span><strong>{moneyBR(item.outras_entradas)}</strong></div>
                                  <div className="mt-2 flex justify-between border-t pt-2 text-sm"><span>Total</span><strong>{moneyBR(entradas)}</strong></div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <h6 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Saídas e saldos
                                </h6>
                                <div className="space-y-1 text-xs text-slate-700">
                                  <div className="flex justify-between gap-3"><span>Saídas</span><strong>{moneyBR(item.total_saidas)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Saldo semanal</span><strong className={saldo < 0 ? "text-red-600" : "text-emerald-700"}>{moneyBR(item.saldo_semanal)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Saldo médio</span><strong>{moneyBR(item.saldo_medio)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Saldo final</span><strong>{moneyBR(item.saldo_final)}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Transações</span><strong>{item.quantidade_transacoes || 0}</strong></div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <h6 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Rating e conformidade
                                </h6>
                                <div className="space-y-1 text-xs text-slate-700">
                                  <div className="flex justify-between gap-3"><span>Bacen</span><strong>{item.rating_bacen || "-"}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Interno</span><strong>{item.rating_interno || "-"}</strong></div>
                                  <div className="flex justify-between gap-3"><span>SCR</span><strong>{item.scr_status || item.restricao_scr || "-"}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Cenprot</span><strong>{item.cenprot_status || item.restricao_cenprot || "-"}</strong></div>
                                  <div className="flex justify-between gap-3"><span>Serasa</span><strong>{item.serasa_status || item.restricao_serasa || "-"}</strong></div>
                                  <div className="flex justify-between gap-3"><span>CND</span><strong>{item.cnd_status || item.cnd_regular || "-"}</strong></div>
                                  <div className="flex justify-between gap-3"><span>PLD/AML</span><strong>{item.pld_aml_status || item.pld_aml || "-"}</strong></div>
                                  <div className="flex justify-between gap-3"><span>COAF</span><strong>{item.coaf_status || item.operacao_suspeita_coaf || "-"}</strong></div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <h6 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                                  Análise e orientação
                                </h6>
                                <div className="space-y-2 text-xs leading-5 text-slate-700">
                                  <p><strong>Análise:</strong> {item.analise_semana || "-"}</p>
                                  <p><strong>Orientação:</strong> {item.orientacao_cliente || "-"}</p>
                                  <p><strong>Próxima ação:</strong> {item.proxima_acao || "-"}</p>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        Nenhuma atualização semanal registrada.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal — Impressão ────────────────────────────────────────────── */}
        {imprimirOpen && (
          <div className="fixed inset-0 z-50 overflow-auto bg-white p-0">
            {/* Barra de ações — oculta na impressão */}
            <div className="flex items-center gap-3 border-b bg-gray-50 p-4 print:hidden">
              <button
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={handleImprimir}
              >
                Imprimir / Salvar PDF
              </button>
              <button
                className="rounded border px-4 py-2 text-sm"
                onClick={() => setImprimirOpen(null)}
              >
                Fechar
              </button>
            </div>

            {/* Conteúdo imprimível */}
            <div
              ref={printRef}
              className="mx-auto max-w-5xl p-8 text-sm"
              style={{ fontFamily: "Arial, sans-serif" }}
            >
              <div className="mb-6 border-b-2 border-gray-800 pb-4">
                <h1 className="text-2xl font-bold">
                  Acompanhamento Bancário — Destrava Crédito
                </h1>
                <h2 className="mt-1 text-xl font-semibold">
                  {imprimirOpen.nome_empresa} — {imprimirOpen.banco_observado}
                </h2>
                <p className="mt-1 text-gray-600">
                  CNPJ: {imprimirOpen.cnpj || "-"} | Gerado em:{" "}
                  {new Date().toLocaleDateString("pt-BR")}
                </p>
              </div>

              {/* Rating */}
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div>
                  <strong>Rating Bacen:</strong>{" "}
                  {imprimirOpen.rating_bacen_atual ||
                    imprimirOpen.rating_bacen_inicial ||
                    "-"}
                </div>
                <div>
                  <strong>Rating Interno Inicial:</strong>{" "}
                  {imprimirOpen.rating_interno_inicial || "-"}
                </div>
                <div>
                  <strong>Rating Interno Atual:</strong>{" "}
                  {imprimirOpen.rating_interno_atual || "-"}
                </div>
              </div>

              {/* Dados financeiros */}
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div>
                  <strong>Faturamento anual:</strong>{" "}
                  {moneyBR(imprimirOpen.faturamento_anual)}
                </div>
                <div>
                  <strong>Média mensal:</strong>{" "}
                  {moneyBR(imprimirOpen.media_mensal)}
                </div>
                <div>
                  <strong>Margem ±30%:</strong>{" "}
                  {moneyBR(imprimirOpen.margem_seguranca_30)}
                </div>
              </div>

              {/* Relacionamento */}
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div>
                  <strong>Início do acompanhamento:</strong>{" "}
                  {formatDateBR(imprimirOpen.data_inicio)}
                </div>
                <div>
                  <strong>Fim previsto:</strong>{" "}
                  {formatDateBR(imprimirOpen.data_fim_prevista)}
                </div>
                <div>
                  <strong>Status:</strong>{" "}
                  {labelStatus(imprimirOpen.status)}
                </div>
              </div>

              {/* Histórico semanal */}
              <h3 className="mb-2 mt-6 text-base font-bold">
                Histórico Semanal
              </h3>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11px",
                }}
              >
                <thead>
                  <tr style={{ background: "#f3f4f6" }}>
                    {[
                      "Semana",
                      "Período",
                      "Máquina",
                      "PIX",
                      "Boleto",
                      "TED",
                      "Dinheiro",
                      "Outras",
                      "Total Entradas",
                      "Saídas",
                      "Saldo Semanal",
                      "Rating B.",
                      "Rating I.",
                      "SCR",
                      "CND",
                      "Status",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          border: "1px solid #d1d5db",
                          padding: "4px 6px",
                          textAlign: "left",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(imprimirOpen.atualizacoes) &&
                  imprimirOpen.atualizacoes.length > 0 ? (
                    imprimirOpen.atualizacoes.map((item: any) => (
                      <tr key={item.id}>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {item.numero_semana}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatDateBR(item.data_referencia_inicio)} a{" "}
                          {formatDateBR(item.data_referencia_fim)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {moneyBR(item.entrada_maquininha)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {moneyBR(item.entrada_pix)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {moneyBR(item.entrada_boleto)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {moneyBR(item.entrada_ted)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {moneyBR(item.entrada_dinheiro)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {moneyBR(item.outras_entradas)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                            fontWeight: "bold",
                          }}
                        >
                          {moneyBR(item.total_entradas)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {moneyBR(item.total_saidas)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                            fontWeight: "bold",
                          }}
                        >
                          {moneyBR(item.saldo_semanal)}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {item.rating_bacen || "-"}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {item.rating_interno || "-"}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {item.scr_status || item.restricao_scr || "-"}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {item.cnd_status || item.cnd_regular || "-"}
                        </td>
                        <td
                          style={{
                            border: "1px solid #d1d5db",
                            padding: "4px 6px",
                          }}
                        >
                          {item.status_semana || item.status || "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={16} style={{ padding: "8px" }}>
                        Nenhuma atualização registrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Recomendação */}
              <div
                style={{
                  marginTop: "24px",
                  padding: "12px",
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                  borderRadius: "6px",
                }}
              >
                <strong>Recomendação operacional:</strong>{" "}
                {calcularRecomendacao(imprimirOpen)}
              </div>

              <div
                style={{
                  marginTop: "32px",
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: "8px",
                  color: "#9ca3af",
                  fontSize: "10px",
                }}
              >
                Destrava Crédito — Documento gerado em{" "}
                {new Date().toLocaleDateString("pt-BR")} às{" "}
                {new Date().toLocaleTimeString("pt-BR")}
              </div>
            </div>
          </div>
        )}
      </div>
    </ColaboradorLayout>
  );
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

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

function BancoField({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-sm"
        list="bancos-sugeridos"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite ou selecione o banco"
      />
      <datalist id="bancos-sugeridos">
        {BANCOS_SUGERIDOS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </label>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: {
    key: string;
    label: string;
    type?: string;
    textarea?: boolean;
    required?: boolean;
  };
  value: any;
  onChange: (value: any) => void;
}) {
  if (field.textarea) {
    return (
      <label className="md:col-span-3">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {field.label}
          {field.required ? " *" : ""}
        </span>
        <textarea
          className="min-h-20 w-full rounded border border-gray-300 p-2 text-sm"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-sm"
        type={field.type || "text"}
        step={field.type === "number" ? "0.01" : undefined}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ReadonlyField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </span>
      <div
        className={`w-full rounded border p-2 text-sm ${
          highlight
            ? "border-blue-200 bg-blue-50 font-semibold text-blue-800"
            : "border-gray-200 bg-gray-50 text-gray-700"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  integer,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  integer?: boolean;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-sm"
        type="number"
        step={integer ? "1" : "0.01"}
        value={value || 0}
        onChange={(e) =>
          onChange(
            integer
              ? parseInt(e.target.value || "0", 10)
              : parseFloat(e.target.value || "0")
          )
        }
      />
    </label>
  );
}

function TextFieldSimple({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-sm"
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </span>
      <textarea
        className="min-h-20 w-full rounded border border-gray-300 p-2 text-sm"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 font-semibold">{value || "-"}</div>
    </div>
  );
}
