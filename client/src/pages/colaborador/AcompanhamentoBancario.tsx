import { useEffect, useMemo, useState } from "react";
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

/** Formata data ISO (yyyy-mm-dd ou ISO full) para dd/mm/aaaa usando UTC para não mudar o dia */
function formatDateBR(value?: string | null): string {
  if (!value) return "-";
  try {
    const d = new Date(value.length === 10 ? value + "T00:00:00Z" : value);
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
  const d = typeof base === "string" ? new Date(base + (base.length === 10 ? "T00:00:00Z" : "")) : new Date(base);
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
  "numero_semana" | "data_referencia_inicio" | "data_referencia_fim" | "data_atualizacao" | "proxima_atualizacao_apos_salvar"
> {
  const atualizacoes: any[] = Array.isArray(row.atualizacoes) ? row.atualizacoes : [];
  const dataInicio = String(row.data_inicio || hojeISO()).slice(0, 10);

  if (atualizacoes.length === 0) {
    // Semana 1
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

  // Semana N+1
  const ordenadas = [...atualizacoes].sort((a, b) => Number(a.numero_semana) - Number(b.numero_semana));
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
function calcularStatusSemana(form: AtualizacaoForm, saldoSemanal: number): string {
  if (form.restricao_nova || form.ocorrencia_negativa || form.devolucao_ou_estorno) return "atencao";
  if (saldoSemanal > 0) return "positiva";
  if (saldoSemanal < 0) return "negativa";
  return "neutra";
}

/** Recomendação baseada no histórico */
function calcularRecomendacao(row: Acompanhamento): string {
  if (row.recomendacao) return row.recomendacao;
  if (row.status_pendente) return "Dados semanais pendentes.";
  const status = String(row.status_semana || "").toLowerCase();
  if (status === "negativa") return "Ponto de atenção: reforçar movimentação e acompanhar saídas.";
  if (status === "positiva") return "Evolução favorável.";
  if (status === "atencao") return "Revisar restrições.";
  if (row.status === "prorrogado") return "Acompanhamento prorrogado.";
  return "Continuar acompanhamento.";
}

/** Monta URL do WhatsApp com mensagem completa incluindo semana e período */
function whatsappUrl(row: Acompanhamento): string {
  if (row.whatsapp_lembrete_url) return row.whatsapp_lembrete_url;
  const rawPhone = String(row.whatsapp_cliente || row.telefone_cliente || "").replace(/\D/g, "");
  if (!rawPhone) return "";
  const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;

  // Determina semana e período para a mensagem
  const atualizacoes: any[] = Array.isArray(row.atualizacoes) ? row.atualizacoes : [];
  const proxSemana = atualizacoes.length > 0
    ? Math.max(...atualizacoes.map((a: any) => Number(a.numero_semana || 0))) + 1
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
  return value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
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

// ─── Campos do formulário Novo Acompanhamento ─────────────────────────────────
const NOVO_FIELDS = [
  // Dados da empresa
  { key: "nome_empresa", label: "Empresa", required: true, group: "empresa" },
  { key: "cnpj", label: "CNPJ", group: "empresa" },
  { key: "telefone_cliente", label: "Telefone", group: "empresa" },
  { key: "whatsapp_cliente", label: "WhatsApp", group: "empresa" },
  { key: "email_cliente", label: "E-mail", group: "empresa" },
  // Dados bancários
  { key: "banco_observado", label: "Banco observado", required: true, group: "banco" },
  { key: "agencia", label: "Agência", group: "banco" },
  { key: "conta", label: "Conta", group: "banco" },
  { key: "gerente_banco", label: "Gerente do banco", group: "banco" },
  { key: "contato_banco", label: "Contato do banco", group: "banco" },
  { key: "data_abertura_conta", label: "Data de abertura/relacionamento", type: "date", group: "banco" },
  // Objetivo
  { key: "objetivo_credito", label: "Objetivo do crédito", group: "objetivo" },
  { key: "valor_credito_pretendido", label: "Valor pretendido", type: "number", group: "objetivo" },
  { key: "linha_credito_pretendida", label: "Linha pretendida", group: "objetivo" },
  // Rating/faturamento
  { key: "rating_bacen_inicial", label: "Rating Bacen inicial", group: "rating" },
  { key: "rating_interno_inicial", label: "Rating interno inicial", group: "rating" },
  { key: "faturamento_anual", label: "Faturamento anual", type: "number", group: "rating" },
  { key: "media_mensal", label: "Média mensal", type: "number", group: "rating" },
  { key: "margem_seguranca_30", label: "Margem de segurança 30%", type: "number", group: "rating" },
  // Gestão
  { key: "observacoes_iniciais", label: "Observações iniciais", textarea: true, group: "gestao" },
];

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

  const [novo, setNovo] = useState<Acompanhamento>({
    nome_empresa: "",
    banco_observado: "",
    data_inicio: hojeISO(),
  });

  const [upd, setUpd] = useState<AtualizacaoForm>(updFormInicial());

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

      const response = await fetch(`/api/acompanhamentos-bancarios?${q.toString()}`, {
        headers: authHeaders(),
      });
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
        String(row.banco_observado || "").toLowerCase().includes(banco.trim().toLowerCase());
      return matchesBanco;
    });
  }, [rows, banco]);

  // ─── Resumo ──────────────────────────────────────────────────────────────────
  const resumo = useMemo(() => ({
    acompanhamento: filtered.filter((r) => r.status === "em_acompanhamento").length,
    pendentes: filtered.filter((r) => r.status_pendente || r.atualizacao_pendente).length,
    positivas: filtered.filter((r) => r.status_semana === "positiva").length,
    negativas: filtered.filter((r) => r.status_semana === "negativa").length,
    prorrogados: filtered.filter((r) => r.status === "prorrogado").length,
    prontos: filtered.filter((r) => {
      const rec = String(r.recomendacao || "").toLowerCase();
      return rec.includes("pronto") || rec.includes("nova análise");
    }).length,
  }), [filtered]);

  // ─── Abrir modal de atualização ───────────────────────────────────────────────
  const abrirAtualizacao = async (row: Acompanhamento) => {
    // Busca detalhe para ter as atualizações anteriores
    let rowComAtualizacoes = row;
    try {
      const resp = await fetch(`/api/acompanhamentos-bancarios/${row.id}`, { headers: authHeaders() });
      if (resp.ok) rowComAtualizacoes = await resp.json();
    } catch {
      // usa row sem atualizações
    }

    const campos = calcularCamposSemana(rowComAtualizacoes);
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
      const response = await fetch("/api/acompanhamentos-bancarios", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(novo),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        alert(`Erro ao salvar acompanhamento. ${errorText}`);
        return;
      }
      setNovoOpen(false);
      setNovo({ nome_empresa: "", banco_observado: "", data_inicio: hojeISO() });
      fetchData();
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
      const response = await fetch(`/api/acompanhamentos-bancarios/${updOpen.id}/atualizacoes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        alert(`Erro ao salvar atualização. ${errorText}`);
        return;
      }
      setUpdOpen(null);
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  // ─── Carregar detalhe ─────────────────────────────────────────────────────────
  const carregarDetalhe = async (id: string) => {
    const response = await fetch(`/api/acompanhamentos-bancarios/${id}`, { headers: authHeaders() });
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
      <div className="space-y-4 p-6">

        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5 md:flex-row">
          <div>
            <h1 className="text-2xl font-bold">Acompanhamento Bancário</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Monitoramento semanal de empresas em relacionamento bancário para evolução de rating,
              movimentação e preparação para crédito.
            </p>
          </div>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => setNovoOpen(true)}
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
            Existem acompanhamentos pendentes de atualização.
          </div>
        )}

        {/* Cards resumo */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {([
            ["Em acompanhamento", resumo.acompanhamento],
            ["Atualizações pendentes", resumo.pendentes],
            ["Semanas positivas", resumo.positivas],
            ["Semanas negativas", resumo.negativas],
            ["Prontos para análise", resumo.prontos],
            ["Prorrogados", resumo.prorrogados],
          ] as [string, number][]).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="mt-1 text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
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
            <button className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={fetchData}>
              Aplicar filtros
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="p-3">Empresa</th>
                <th>CNPJ</th>
                <th>Banco</th>
                <th>Rating atual</th>
                <th>Última atualização</th>
                <th>Próxima atualização</th>
                <th>Saldo última semana</th>
                <th>Status semana</th>
                <th>Recomendação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-4 text-gray-500" colSpan={10}>Carregando acompanhamentos...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="p-4 text-gray-500" colSpan={10}>Nenhum acompanhamento cadastrado.</td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const whats = whatsappUrl(row);
                  const pendente = row.status_pendente || row.atualizacao_pendente;
                  return (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="p-3 font-medium">
                        {row.nome_empresa}
                        {pendente && (
                          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td>{row.cnpj || "-"}</td>
                      <td>{row.banco_observado || "-"}</td>
                      <td>{row.rating_interno_atual || row.rating_bacen_atual || "-"}</td>
                      <td>{formatDateBR(row.ultima_atualizacao_em || row.ultimo_update_em)}</td>
                      <td>{formatDateBR(row.proxima_atualizacao)}</td>
                      <td>{moneyBR(row.saldo_semanal || row.saldo_ultima_semana)}</td>
                      <td>
                        <span className={`rounded-full border px-2 py-1 text-xs ${statusBadge(row.status_semana)}`}>
                          {labelStatus(row.status_semana)}
                        </span>
                      </td>
                      <td className="max-w-[180px] text-xs text-gray-600">{calcularRecomendacao(row)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <button
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                            onClick={() => carregarDetalhe(row.id)}
                          >
                            Detalhes
                          </button>
                          <button
                            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                            onClick={() => abrirAtualizacao(row)}
                          >
                            Atualizar
                          </button>
                          {whats && (
                            <a
                              className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100"
                              href={whats}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                          )}
                          <button
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                            onClick={() => prorrogar(row.id)}
                          >
                            Prorrogar
                          </button>
                          <button
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            onClick={() => encerrar(row.id)}
                          >
                            Encerrar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal — Novo Acompanhamento */}
        {novoOpen && (
          <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-6">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">Novo Acompanhamento</h3>
                  <p className="text-sm text-gray-600">
                    Cadastre a empresa, o banco observado e os dados iniciais para acompanhamento de 30 dias.
                  </p>
                </div>
                <button className="rounded border px-3 py-1 text-sm" onClick={() => setNovoOpen(false)}>
                  Fechar
                </button>
              </div>

              {/* Dados da empresa */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Dados da empresa</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "empresa").map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={novo[field.key]}
                    onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))}
                  />
                ))}
              </div>

              {/* Dados bancários */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Dados bancários</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "banco").map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={novo[field.key]}
                    onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))}
                  />
                ))}
              </div>

              {/* Objetivo */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Objetivo</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "objetivo").map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={novo[field.key]}
                    onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))}
                  />
                ))}
              </div>

              {/* Rating/faturamento */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Rating e faturamento</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "rating").map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={novo[field.key]}
                    onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))}
                  />
                ))}
              </div>

              {/* Gestão */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Gestão</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.filter((f) => f.group === "gestao").map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={novo[field.key]}
                    onChange={(v) => setNovo((p) => ({ ...p, [field.key]: v }))}
                  />
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={saving}
                  onClick={salvarNovo}
                >
                  {saving ? "Salvando..." : "Salvar acompanhamento"}
                </button>
                <button className="rounded border px-4 py-2 text-sm" onClick={() => setNovoOpen(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal — Atualização Semanal */}
        {updOpen && (
          <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-6">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">Atualização Semanal</h3>
                  <p className="text-sm font-medium text-gray-700">
                    {updOpen.nome_empresa} — {updOpen.banco_observado}
                  </p>
                </div>
                <button className="rounded border px-3 py-1 text-sm" onClick={() => setUpdOpen(null)}>
                  Fechar
                </button>
              </div>

              {/* Contexto da semana */}
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">
                <strong>Semana {upd.numero_semana}</strong>
                {" | "}
                Período: {formatDateBR(upd.data_referencia_inicio)} a {formatDateBR(upd.data_referencia_fim)}
                {" | "}
                Atualização prevista: {formatDateBR(upd.data_atualizacao)}
                {" | "}
                Próxima atualização: {formatDateBR(upd.proxima_atualizacao_apos_salvar)}
              </div>

              {/* Bloco A — Período da semana (readonly) */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">A — Período da semana</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <ReadonlyField label="Número da semana" value={String(upd.numero_semana)} />
                <ReadonlyField label="Início do período" value={formatDateBR(upd.data_referencia_inicio)} />
                <ReadonlyField label="Fim do período" value={formatDateBR(upd.data_referencia_fim)} />
                <ReadonlyField label="Data da atualização" value={formatDateBR(upd.data_atualizacao)} />
                <ReadonlyField label="Próxima atualização após salvar" value={formatDateBR(upd.proxima_atualizacao_apos_salvar)} />
              </div>

              {/* Bloco B — Entradas */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">B — Entradas da semana</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {(["entrada_maquininha", "entrada_pix", "entrada_boleto", "entrada_ted", "entrada_dinheiro", "outras_entradas"] as const).map((key) => (
                  <NumberField
                    key={key}
                    label={labelEntrada(key)}
                    value={upd[key]}
                    onChange={(v) => setUpd((p) => ({ ...p, [key]: v }))}
                  />
                ))}
                <ReadonlyField label="Total de entradas" value={moneyBR(totalEntradas)} highlight />
              </div>

              {/* Bloco C — Saídas e saldos */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">C — Saídas e saldos</h4>
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
                  onChange={(v) => setUpd((p) => ({ ...p, quantidade_transacoes: v }))}
                  integer
                />
                <ReadonlyField label="Saldo semanal calculado" value={moneyBR(saldoSemanal)} highlight />
              </div>

              {/* Bloco D — Rating e conformidade */}
              <h4 className="mb-2 text-sm font-semibold text-gray-700">D — Rating e conformidade</h4>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <TextFieldSimple label="Rating Bacen" value={upd.rating_bacen} onChange={(v) => setUpd((p) => ({ ...p, rating_bacen: v }))} />
                <TextFieldSimple label="Rating interno" value={upd.rating_interno} onChange={(v) => setUpd((p) => ({ ...p, rating_interno: v }))} />
                <TextFieldSimple label="SCR" value={upd.scr_status} onChange={(v) => setUpd((p) => ({ ...p, scr_status: v }))} />
                <TextFieldSimple label="Cenprot" value={upd.cenprot_status} onChange={(v) => setUpd((p) => ({ ...p, cenprot_status: v }))} />
                <TextFieldSimple label="Serasa" value={upd.serasa_status} onChange={(v) => setUpd((p) => ({ ...p, serasa_status: v }))} />
                <TextFieldSimple label="CND" value={upd.cnd_status} onChange={(v) => setUpd((p) => ({ ...p, cnd_status: v }))} />
                <TextFieldSimple label="PLD/AML" value={upd.pld_aml_status} onChange={(v) => setUpd((p) => ({ ...p, pld_aml_status: v }))} />
                <TextFieldSimple label="COAF" value={upd.coaf_status} onChange={(v) => setUpd((p) => ({ ...p, coaf_status: v }))} />
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

              {/* Resumo calculado */}
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <strong>Total de entradas:</strong> {moneyBR(totalEntradas)}
                {" | "}
                <strong>Saldo semanal:</strong> {moneyBR(saldoSemanal)}
                {" | "}
                <strong>Status estimado:</strong>{" "}
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(statusSemanaCalculado)}`}>
                  {labelStatus(statusSemanaCalculado)}
                </span>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={saving}
                  onClick={salvarAtualizacao}
                >
                  {saving ? "Salvando..." : "Salvar atualização"}
                </button>
                <button className="rounded border px-4 py-2 text-sm" onClick={() => setUpdOpen(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal — Detalhes */}
        {detalhe && (
          <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-6">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">Detalhes do Acompanhamento</h3>
                  <p className="text-sm text-gray-600">
                    {detalhe.nome_empresa} — {detalhe.banco_observado}
                  </p>
                </div>
                <button className="rounded border px-3 py-1 text-sm" onClick={() => setDetalhe(null)}>
                  Fechar
                </button>
              </div>

              {/* Dados gerais */}
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                <InfoCard label="Empresa" value={detalhe.nome_empresa} />
                <InfoCard label="CNPJ" value={detalhe.cnpj} />
                <InfoCard label="Banco observado" value={detalhe.banco_observado} />
                <InfoCard label="Objetivo do crédito" value={detalhe.objetivo_credito} />
                <InfoCard
                  label="Rating inicial / atual"
                  value={`${detalhe.rating_interno_inicial || detalhe.rating_bacen_inicial || "-"} / ${detalhe.rating_interno_atual || detalhe.rating_bacen_atual || "-"}`}
                />
                <InfoCard label="Faturamento anual" value={moneyBR(detalhe.faturamento_anual)} />
                <InfoCard label="Média mensal" value={moneyBR(detalhe.media_mensal)} />
                <InfoCard label="Margem de segurança 30%" value={moneyBR(detalhe.margem_seguranca_30)} />
                <InfoCard label="Recomendação" value={calcularRecomendacao(detalhe)} />
              </div>

              {/* Histórico semanal */}
              <h4 className="mt-5 font-semibold">Histórico semanal</h4>
              <div className="mt-2 max-h-80 overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="p-2">Semana</th>
                      <th>Período</th>
                      <th>Entradas</th>
                      <th>Saídas</th>
                      <th>Saldo</th>
                      <th>Rating Bacen</th>
                      <th>Rating Interno</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(detalhe.atualizacoes) && detalhe.atualizacoes.length > 0 ? (
                      detalhe.atualizacoes.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="p-2">{item.numero_semana}</td>
                          <td className="whitespace-nowrap">
                            {formatDateBR(item.data_referencia_inicio)} a {formatDateBR(item.data_referencia_fim)}
                          </td>
                          <td>{moneyBR(item.total_entradas)}</td>
                          <td>{moneyBR(item.total_saidas)}</td>
                          <td>{moneyBR(item.saldo_semanal)}</td>
                          <td>{item.rating_bacen || "-"}</td>
                          <td>{item.rating_interno || "-"}</td>
                          <td>
                            <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(item.status_semana || item.status)}`}>
                              {labelStatus(item.status_semana || item.status)}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-gray-500" colSpan={8}>
                          Nenhuma atualização semanal registrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: { key: string; label: string; type?: string; textarea?: boolean; required?: boolean };
  value: any;
  onChange: (value: any) => void;
}) {
  if (field.textarea) {
    return (
      <label className="md:col-span-3">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {field.label}{field.required ? " *" : ""}
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
        {field.label}{field.required ? " *" : ""}
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

function ReadonlyField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <div className={`w-full rounded border p-2 text-sm ${highlight ? "border-blue-200 bg-blue-50 font-semibold text-blue-800" : "border-gray-200 bg-gray-50 text-gray-700"}`}>
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
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        className="w-full rounded border border-gray-300 p-2 text-sm"
        type="number"
        step={integer ? "1" : "0.01"}
        value={value || 0}
        onChange={(e) => onChange(integer ? parseInt(e.target.value || "0", 10) : parseFloat(e.target.value || "0"))}
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
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
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
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <textarea
        className="min-h-20 w-full rounded border border-gray-300 p-2 text-sm"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function InfoCard({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 font-semibold">{value || "-"}</div>
    </div>
  );
}
