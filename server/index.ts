import { useEffect, useMemo, useState } from "react";
import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";

type Acompanhamento = Record<string, any>;

type AtualizacaoForm = Record<string, any>;

const MONEY_KEYS = [
  "entrada_maquininha",
  "entrada_pix",
  "entrada_boleto",
  "entrada_ted",
  "entrada_dinheiro",
  "outras_entradas",
  "total_saidas",
  "saldo_medio",
  "saldo_final",
];

const NOVO_FIELDS = [
  { key: "nome_empresa", label: "Empresa", required: true },
  { key: "cnpj", label: "CNPJ" },
  { key: "telefone_cliente", label: "Telefone" },
  { key: "whatsapp_cliente", label: "WhatsApp" },
  { key: "email_cliente", label: "E-mail" },
  { key: "banco_observado", label: "Banco observado", required: true },
  { key: "agencia", label: "Agência" },
  { key: "conta", label: "Conta" },
  { key: "gerente_banco", label: "Gerente do banco" },
  { key: "contato_banco", label: "Contato do banco" },
  { key: "data_abertura_conta", label: "Data de abertura/relacionamento", type: "date" },
  { key: "objetivo_credito", label: "Objetivo do crédito" },
  { key: "valor_credito_pretendido", label: "Valor pretendido", type: "number" },
  { key: "linha_credito_pretendida", label: "Linha pretendida" },
  { key: "rating_bacen_inicial", label: "Rating Bacen inicial" },
  { key: "rating_interno_inicial", label: "Rating interno inicial" },
  { key: "faturamento_anual", label: "Faturamento anual", type: "number" },
  { key: "media_mensal", label: "Média mensal", type: "number" },
  { key: "margem_seguranca_30", label: "Margem de segurança 30%", type: "number" },
  { key: "observacoes_iniciais", label: "Observações iniciais", textarea: true },
];

const ATUALIZACAO_FIELDS = [
  { key: "numero_semana", label: "Número da semana", type: "number" },
  { key: "data_referencia_inicio", label: "Início do período", type: "date" },
  { key: "data_referencia_fim", label: "Fim do período", type: "date" },
  { key: "entrada_maquininha", label: "Entrada maquininha", type: "number" },
  { key: "entrada_pix", label: "Entrada Pix", type: "number" },
  { key: "entrada_boleto", label: "Entrada boleto", type: "number" },
  { key: "entrada_ted", label: "Entrada TED", type: "number" },
  { key: "entrada_dinheiro", label: "Entrada dinheiro", type: "number" },
  { key: "outras_entradas", label: "Outras entradas", type: "number" },
  { key: "total_saidas", label: "Total de saídas", type: "number" },
  { key: "saldo_medio", label: "Saldo médio", type: "number" },
  { key: "saldo_final", label: "Saldo final", type: "number" },
  { key: "quantidade_transacoes", label: "Quantidade de transações", type: "number" },
  { key: "rating_bacen", label: "Rating Bacen" },
  { key: "rating_interno", label: "Rating interno" },
  { key: "scr_status", label: "SCR" },
  { key: "cenprot_status", label: "Cenprot" },
  { key: "serasa_status", label: "Serasa" },
  { key: "cnd_status", label: "CND" },
  { key: "pld_aml_status", label: "PLD/AML" },
  { key: "coaf_status", label: "COAF" },
  { key: "analise_semana", label: "Análise da semana", textarea: true },
  { key: "orientacao_cliente", label: "Orientação ao cliente", textarea: true },
  { key: "proxima_acao", label: "Próxima ação", textarea: true },
];

function normalizePermValue(value?: string | null) {
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
  ]);

  return (
    permitidos.has(normalizePermValue(user?.cargo)) ||
    permitidos.has(normalizePermValue(user?.perfil)) ||
    permitidos.has(normalizePermValue(user?.role))
  );
}

function hojeEhQuarta() {
  return new Date().getDay() === 3;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function toMoney(value: unknown) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeRows(payload: any): Acompanhamento[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.acompanhamentos)) return payload.acompanhamentos;
  return [];
}

function getToken() {
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

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

function whatsappUrl(row: Acompanhamento) {
  if (row.whatsapp_lembrete_url) return row.whatsapp_lembrete_url;

  const rawPhone = String(row.whatsapp_cliente || row.telefone_cliente || "").replace(/\D/g, "");
  if (!rawPhone) return "";

  const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
  const message = `Olá! Aqui é a equipe da Destrava Crédito. Estamos aguardando os dados semanais da empresa ${row.nome_empresa || ""} para atualizar o acompanhamento bancário e evolução de rating. Pode nos enviar as movimentações da semana: Pix, maquininha, boletos, TED, dinheiro, saídas e saldo?`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function statusBadge(status?: string | null) {
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

function labelStatus(status?: string | null) {
  const value = String(status || "").trim();
  if (!value) return "Pendente";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function calcularStatusSemana(form: AtualizacaoForm, saldoSemanal: number) {
  if (form.restricao_nova || form.ocorrencia_negativa || form.devolucao_ou_estorno) return "atencao";
  if (saldoSemanal > 0) return "positiva";
  if (saldoSemanal < 0) return "negativa";
  return "neutra";
}

function proximaRecomendacao(row: Acompanhamento) {
  if (row.status_pendente) return "Pendente de dados";
  const status = String(row.status_semana || "").toLowerCase();
  if (status === "positiva") return "Evolução favorável";
  if (status === "negativa") return "Ponto de atenção";
  if (status === "atencao" || status === "atenção") return "Revisar restrições";
  if (row.status === "prorrogado") return "Acompanhamento prorrogado";
  return "Continuar acompanhamento";
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: any;
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

export default function AcompanhamentoBancario() {
  const { colaborador } = useAuth();
  const canAccess = podeAcessarAcompanhamentoBancario(colaborador);

  const [rows, setRows] = useState<Acompanhamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
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

  const [upd, setUpd] = useState<AtualizacaoForm>({
    numero_semana: "",
    data_referencia_inicio: "",
    data_referencia_fim: "",
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
    possui_restricao: false,
    restricao_nova: false,
    devolucao_ou_estorno: false,
    ocorrencia_negativa: false,
  });

  const fetchData = async () => {
    if (!canAccess) return;

    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("busca", search.trim());
      if (status && status !== "todos") q.set("status", status);
      if (pendentes) q.set("pendentes", "true");

      const response = await fetch(`/api/acompanhamentos-bancarios?${q.toString()}`, {
        headers: authHeaders(),
      });

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

  const resumo = useMemo(() => {
    return {
      acompanhamento: filtered.filter((row) => row.status === "em_acompanhamento").length,
      pendentes: filtered.filter((row) => row.status_pendente).length,
      positivas: filtered.filter((row) => row.status_semana === "positiva").length,
      negativas: filtered.filter((row) => row.status_semana === "negativa").length,
      prorrogados: filtered.filter((row) => row.status === "prorrogado").length,
      prontos: filtered.filter((row) => {
        const recomendacao = String(row.recomendacao || "").toLowerCase();
        return recomendacao.includes("pronto") || row.status_semana === "positiva";
      }).length,
    };
  }, [filtered]);

  const totalEntradas = MONEY_KEYS.filter((key) => key !== "total_saidas" && key !== "saldo_medio" && key !== "saldo_final").reduce(
    (total, key) => total + Number(upd[key] || 0),
    0
  );

  const saldoSemanal = totalEntradas - Number(upd.total_saidas || 0);
  const statusSemanaCalculado = calcularStatusSemana(upd, saldoSemanal);

  const abrirAtualizacao = (row: Acompanhamento) => {
    setUpdOpen(row);
    const proximaSemana = Number(row.ultima_semana || row.numero_semana || 0) + 1;
    setUpd({
      numero_semana: proximaSemana || "",
      data_referencia_inicio: "",
      data_referencia_fim: "",
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
      possui_restricao: false,
      restricao_nova: false,
      devolucao_ou_estorno: false,
      ocorrencia_negativa: false,
    });
  };

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

  const prorrogar = async (id: string) => {
    if (!confirm("Prorrogar este acompanhamento por mais 30 dias?")) return;

    await fetch(`/api/acompanhamentos-bancarios/${id}/prorrogar`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    fetchData();
  };

  const encerrar = async (id: string) => {
    const observacoes_finais = prompt("Observações finais do encerramento:") || "";

    await fetch(`/api/acompanhamentos-bancarios/${id}/encerrar`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ observacoes_finais }),
    });

    fetchData();
  };

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

  return (
    <ColaboradorLayout title="Acompanhamento Bancário">
      <div className="space-y-4 p-6">
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

        {hojeEhQuarta() && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
            Hoje é quarta-feira: dia de atualizar os acompanhamentos bancários.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Em acompanhamento", resumo.acompanhamento],
            ["Atualizações pendentes", resumo.pendentes],
            ["Semanas positivas", resumo.positivas],
            ["Semanas negativas", resumo.negativas],
            ["Prontos para análise", resumo.prontos],
            ["Prorrogados", resumo.prorrogados],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="mt-1 text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <input
              className="rounded border border-gray-300 p-2 text-sm"
              placeholder="Buscar empresa/CNPJ"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <input
              className="rounded border border-gray-300 p-2 text-sm"
              placeholder="Banco observado"
              value={banco}
              onChange={(event) => setBanco(event.target.value)}
            />
            <select
              className="rounded border border-gray-300 p-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
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
                onChange={(event) => setPendentes(event.target.checked)}
              />
              Apenas pendentes
            </label>
            <button className="rounded border border-gray-300 px-3 py-2 text-sm" onClick={fetchData}>
              Aplicar filtros
            </button>
          </div>
        </div>

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
                  <td className="p-4 text-gray-500" colSpan={10}>
                    Carregando acompanhamentos...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="p-4 text-gray-500" colSpan={10}>
                    Nenhum acompanhamento cadastrado.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const whats = whatsappUrl(row);

                  return (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="p-3 font-medium">{row.nome_empresa}</td>
                      <td>{row.cnpj || "-"}</td>
                      <td>{row.banco_observado || "-"}</td>
                      <td>{row.rating_interno_atual || row.rating_bacen_atual || "-"}</td>
                      <td>{row.ultima_atualizacao_em?.slice?.(0, 10) || row.ultimo_update_em?.slice?.(0, 10) || "-"}</td>
                      <td>{row.proxima_atualizacao?.slice?.(0, 10) || "-"}</td>
                      <td>{toMoney(row.saldo_semanal || row.saldo_ultima_semana || 0)}</td>
                      <td>
                        <span className={`rounded-full border px-2 py-1 text-xs ${statusBadge(row.status_semana)}`}>
                          {labelStatus(row.status_semana)}
                        </span>
                      </td>
                      <td>{proximaRecomendacao(row)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <button className="rounded border px-2 py-1 text-xs" onClick={() => carregarDetalhe(row.id)}>
                            Detalhes
                          </button>
                          <button className="rounded border px-2 py-1 text-xs" onClick={() => abrirAtualizacao(row)}>
                            Atualizar
                          </button>
                          {whats && (
                            <a className="rounded border px-2 py-1 text-xs" href={whats} target="_blank" rel="noreferrer">
                              WhatsApp
                            </a>
                          )}
                          <button className="rounded border px-2 py-1 text-xs" onClick={() => prorrogar(row.id)}>
                            Prorrogar
                          </button>
                          <button className="rounded border px-2 py-1 text-xs" onClick={() => encerrar(row.id)}>
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

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {NOVO_FIELDS.map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={novo[field.key]}
                    onChange={(value) => setNovo((prev) => ({ ...prev, [field.key]: value }))}
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

        {updOpen && (
          <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-6">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">Atualização Semanal</h3>
                  <p className="text-sm text-gray-600">{updOpen.nome_empresa}</p>
                </div>
                <button className="rounded border px-3 py-1 text-sm" onClick={() => setUpdOpen(null)}>
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {ATUALIZACAO_FIELDS.map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={upd[field.key]}
                    onChange={(value) => {
                      const parsedValue = field.type === "number" && value !== "" ? Number(value) : value;
                      setUpd((prev) => ({ ...prev, [field.key]: parsedValue }));
                    }}
                  />
                ))}

                {[
                  ["possui_restricao", "Possui restrição"],
                  ["restricao_nova", "Restrição nova"],
                  ["devolucao_ou_estorno", "Devolução ou estorno"],
                  ["ocorrencia_negativa", "Ocorrência negativa"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded border border-gray-200 p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(upd[key])}
                      onChange={(event) => setUpd((prev) => ({ ...prev, [key]: event.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <strong>Total de entradas:</strong> {toMoney(totalEntradas)} |{" "}
                <strong>Saldo semanal:</strong> {toMoney(saldoSemanal)} |{" "}
                <strong>Status:</strong> {labelStatus(statusSemanaCalculado)}
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

        {detalhe && (
          <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-6">
            <div className="mx-auto max-w-5xl rounded-lg bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">Detalhes do Acompanhamento</h3>
                  <p className="text-sm text-gray-600">{detalhe.nome_empresa}</p>
                </div>
                <button className="rounded border px-3 py-1 text-sm" onClick={() => setDetalhe(null)}>
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                <div className="rounded border p-3">
                  <div className="text-gray-500">Banco observado</div>
                  <div className="font-semibold">{detalhe.banco_observado || "-"}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-gray-500">Objetivo do crédito</div>
                  <div className="font-semibold">{detalhe.objetivo_credito || "-"}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-gray-500">Rating inicial/atual</div>
                  <div className="font-semibold">
                    {detalhe.rating_interno_inicial || detalhe.rating_bacen_inicial || "-"} /{" "}
                    {detalhe.rating_interno_atual || detalhe.rating_bacen_atual || "-"}
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-gray-500">Faturamento anual</div>
                  <div className="font-semibold">{toMoney(detalhe.faturamento_anual)}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-gray-500">Média mensal</div>
                  <div className="font-semibold">{toMoney(detalhe.media_mensal)}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-gray-500">Recomendação</div>
                  <div className="font-semibold">{proximaRecomendacao(detalhe)}</div>
                </div>
              </div>

              <h4 className="mt-5 font-semibold">Histórico semanal</h4>
              <div className="mt-2 max-h-80 overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="p-2">Semana</th>
                      <th>Entradas</th>
                      <th>Saídas</th>
                      <th>Saldo</th>
                      <th>Rating</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(detalhe.atualizacoes) && detalhe.atualizacoes.length > 0 ? (
                      detalhe.atualizacoes.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="p-2">{item.numero_semana}</td>
                          <td>{toMoney(item.total_entradas)}</td>
                          <td>{toMoney(item.total_saidas)}</td>
                          <td>{toMoney(item.saldo_semanal)}</td>
                          <td>{item.rating_interno || item.rating_bacen || "-"}</td>
                          <td>{labelStatus(item.status_semana || item.status)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-gray-500" colSpan={6}>
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
