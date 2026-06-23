import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "./Layout";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import {
  FileSignature,
  Plus,
  Search,
  Save,
  CheckCircle2,
  Download,
  Paperclip,
  Trash2,
  Building2,
  User,
  RefreshCw,
  FileText,
  PenLine,
  PackagePlus,
  BadgeDollarSign,
  Pencil,
} from "lucide-react";

type TipoCliente = "empresa" | "pessoa_fisica" | "livre";
type MarcaOrcamento = "destrava" | "permupay" | "aragao";

type AbaOrcamento = "editor" | "servicos" | "anexos" | "preview";

interface EmpresaOpcao {
  id: string;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  whatsapp?: string;
}

interface ClientePfOpcao {
  id: string;
  nome?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
}

interface ServicoOrcamento {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

interface Orcamento {
  id: string;
  numero?: string;
  tipo_cliente: TipoCliente;
  empresa_id?: string | null;
  cliente_pf_id?: string | null;
  cliente_nome?: string | null;
  cliente_documento?: string | null;
  cliente_email?: string | null;
  cliente_telefone?: string | null;
  marca: MarcaOrcamento;
  titulo: string;
  descricao?: string | null;
  conteudo: string;
  itens?: ServicoOrcamento[];
  valor_total?: number | string | null;
  validade_dias?: number | null;
  validade_ate?: string | null;
  status: "rascunho" | "finalizado" | "enviado" | "cancelado";
  assinaturas?: any[];
  anexos_count?: number;
  criado_em?: string;
  atualizado_em?: string;
  finalizado_em?: string;
  anexos?: Anexo[];
}

interface Anexo {
  id: string;
  nome_original: string;
  descricao?: string | null;
  mime_type?: string | null;
  tamanho_bytes?: number;
  url?: string;
  criado_em?: string;
}

const ASSINATURAS_PADRAO = [
  {
    tipo: "contratada",
    nome: "DESTRAVA CRÉDITO LTDA",
    cargo: "Contratada",
    documento: "CNPJ 35.427.182/0001-66",
  },
  { tipo: "cliente", nome: "", cargo: "Cliente / Contratante", documento: "" },
];

const CONTEUDO_PADRAO = `1. Objeto do orçamento
Prestação de serviços especializados de assessoria, consultoria, diagnóstico, estruturação documental, estratégia financeira, captação de crédito, acompanhamento bancário ou serviços correlatos, conforme o escopo definido com o cliente.

2. Condições comerciais
Os honorários e condições de pagamento serão definidos conforme complexidade, prazo, documentação apresentada, volume da operação e escopo contratado.

3. Observações
Este orçamento é editável antes da finalização. Serviços prestados, documentos complementares e anexos podem acompanhar esta proposta para conferência, aceite e formalização.`;

const SERVICO_VAZIO: ServicoOrcamento = {
  descricao: "",
  quantidade: 1,
  valor_unitario: 0,
};

function moneyBR(value: any): string {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoney(value: any): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return (
    Number(
      String(value || 0)
        .replace(/[R$\s]/g, "")
        .replace(/\./g, "")
        .replace(",", "."),
    ) || 0
  );
}

function fmtDate(date?: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function calcularTotalServicos(servicos: ServicoOrcamento[]): number {
  return servicos.reduce(
    (acc, servico) =>
      acc +
      (Number(servico.quantidade) || 0) * (Number(servico.valor_unitario) || 0),
    0,
  );
}

function limparDescricaoServico(value: any): string {
  return String(value ?? "")
    .replace(/^\s*descri[cç][aã]o\s+do\s+item\s*\/\s*servi[cç]o\s*:\s*/i, "")
    .replace(/^\s*item\s*\d*\s*[-–—:]\s*/i, "")
    .trim();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const estadoInicial = {
  tipo_cliente: "empresa" as TipoCliente,
  empresa_id: "",
  cliente_pf_id: "",
  cliente_nome: "",
  cliente_documento: "",
  cliente_email: "",
  cliente_telefone: "",
  marca: "destrava" as MarcaOrcamento,
  titulo: "Orçamento de Serviços",
  descricao: "",
  conteudo: CONTEUDO_PADRAO,
  ocultar_conteudo: false,
  itens: [] as ServicoOrcamento[],
  valor_total: "0",
  validade_dias: 30,
  validade_ate: "",
  assinaturas: ASSINATURAS_PADRAO,
};

export default function Orcamentos() {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [clientesPf, setClientesPf] = useState<ClientePfOpcao[]>([]);
  const [selecionado, setSelecionado] = useState<Orcamento | null>(null);
  const [form, setForm] = useState<any>(estadoInicial);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [edicaoFinalizadoLiberada, setEdicaoFinalizadoLiberada] =
    useState(false);
  const [aba, setAba] = useState<AbaOrcamento>("editor");
  const [mostrarDescricao, setMostrarDescricao] = useState(true);
  const [arquivos, setArquivos] = useState<FileList | null>(null);
  const [descricaoAnexo, setDescricaoAnexo] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const marca = form.marca as MarcaOrcamento;
  const isFinalizado = selecionado?.status === "finalizado";
  const camposBloqueados = isFinalizado && !edicaoFinalizadoLiberada;
  const servicos: ServicoOrcamento[] = Array.isArray(form.itens)
    ? form.itens
    : [];
  const servicosValidos = servicos.filter((servico) =>
    servico.descricao?.trim(),
  );
  const hasServicos = servicosValidos.length > 0;
  const totalServicos = calcularTotalServicos(servicosValidos);
  const valorManual = parseMoney(form.valor_total);
  const valorTotalExibicao = hasServicos ? totalServicos : valorManual;

  useEffect(() => {
    if (hasServicos && String(form.valor_total) !== String(totalServicos)) {
      setForm((f: any) => ({ ...f, valor_total: String(totalServicos) }));
    }
  }, [hasServicos, totalServicos]);

  async function carregarTudo() {
    setLoading(true);
    try {
      const [lista, clientes] = await Promise.all([
        apiFetch(
          `/api/orcamentos${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`,
        ),
        apiFetch("/api/orcamentos/clientes"),
      ]);
      setOrcamentos(Array.isArray(lista) ? lista : []);
      setEmpresas(Array.isArray(clientes?.empresas) ? clientes.empresas : []);
      setClientesPf(
        Array.isArray(clientes?.clientes_pf) ? clientes.clientes_pf : [],
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar orçamentos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientesPjFiltrados = useMemo(() => empresas, [empresas]);
  const clientesPfFiltrados = useMemo(() => clientesPf, [clientesPf]);

  function novoOrcamento() {
    setSelecionado(null);
    setEdicaoFinalizadoLiberada(false);
    setForm({
      ...estadoInicial,
      itens: [],
      assinaturas: ASSINATURAS_PADRAO.map((a) => ({ ...a })),
    });
    setAba("editor");
  }

  async function abrirOrcamento(orc: Orcamento) {
    try {
      const full = await apiFetch(`/api/orcamentos/${orc.id}`);
      setSelecionado(full);
      setEdicaoFinalizadoLiberada(false);
      const servicosCarregados = Array.isArray(full.itens) ? full.itens : [];
      const ocultarConteudo = full.ocultar_conteudo === true || full.ocultar_conteudo === "true";
      setMostrarDescricao(!ocultarConteudo);
      setForm({
        tipo_cliente: full.tipo_cliente || "empresa",
        empresa_id: full.empresa_id || "",
        cliente_pf_id: full.cliente_pf_id || "",
        cliente_nome: full.cliente_nome || "",
        cliente_documento: full.cliente_documento || "",
        cliente_email: full.cliente_email || "",
        cliente_telefone: full.cliente_telefone || "",
        marca: full.marca || "destrava",
        titulo: full.titulo || "Orçamento de Serviços",
        descricao: full.descricao || "",
        conteudo: full.conteudo || CONTEUDO_PADRAO,
        ocultar_conteudo: ocultarConteudo,
        itens: servicosCarregados,
        valor_total: String(full.valor_total ?? "0"),
        validade_dias: full.validade_dias || 30,
        validade_ate: full.validade_ate || "",
        assinaturas:
          Array.isArray(full.assinaturas) && full.assinaturas.length
            ? full.assinaturas
            : ASSINATURAS_PADRAO.map((a) => ({ ...a })),
      });
      setAba("editor");
    } catch (err: any) {
      toast.error(err.message || "Erro ao abrir orçamento");
    }
  }

  function aplicarEmpresa(id: string) {
    const emp = empresas.find((e) => e.id === id);
    setForm((f: any) => ({
      ...f,
      empresa_id: id,
      cliente_pf_id: "",
      cliente_nome: emp?.razao_social || emp?.nome_fantasia || "",
      cliente_documento: emp?.cnpj || "",
      cliente_email: emp?.email || "",
      cliente_telefone: emp?.whatsapp || emp?.telefone || "",
      assinaturas: (f.assinaturas || ASSINATURAS_PADRAO).map((a: any) =>
        a.tipo === "cliente"
          ? {
              ...a,
              nome: emp?.razao_social || emp?.nome_fantasia || "",
              documento: emp?.cnpj || "",
            }
          : a,
      ),
    }));
  }

  function aplicarClientePf(id: string) {
    const cli = clientesPf.find((c) => c.id === id);
    setForm((f: any) => ({
      ...f,
      cliente_pf_id: id,
      empresa_id: "",
      cliente_nome: cli?.nome || "",
      cliente_documento: cli?.cpf || "",
      cliente_email: cli?.email || "",
      cliente_telefone: cli?.telefone || "",
      assinaturas: (f.assinaturas || ASSINATURAS_PADRAO).map((a: any) =>
        a.tipo === "cliente"
          ? { ...a, nome: cli?.nome || "", documento: cli?.cpf || "" }
          : a,
      ),
    }));
  }

  function adicionarServico() {
    setForm((f: any) => ({
      ...f,
      itens: [...(f.itens || []), { ...SERVICO_VAZIO }],
    }));
    setAba("servicos");
  }

  function removerServico(idx: number) {
    setForm((f: any) => ({
      ...f,
      itens: (f.itens || []).filter((_: any, i: number) => i !== idx),
    }));
  }

  function atualizarServico(
    idx: number,
    key: keyof ServicoOrcamento,
    value: string | number,
  ) {
    setForm((f: any) => {
      const atual = Array.isArray(f.itens) ? [...f.itens] : [];
      atual[idx] = { ...(atual[idx] || SERVICO_VAZIO), [key]: value };
      return { ...f, itens: atual };
    });
  }

  function limparServicosUsarValorDireto() {
    setForm((f: any) => ({ ...f, itens: [] }));
    setAba("editor");
    toast.success("Serviços removidos. Informe o valor direto no editor.");
  }

  function updateAssinatura(index: number, key: string, value: string) {
    const assinaturas = [...(form.assinaturas || [])];
    assinaturas[index] = { ...(assinaturas[index] || {}), [key]: value };
    setForm((f: any) => ({ ...f, assinaturas }));
  }

  function addAssinatura() {
    setForm((f: any) => ({
      ...f,
      assinaturas: [
        ...(f.assinaturas || []),
        { tipo: "testemunha", nome: "", cargo: "Testemunha", documento: "" },
      ],
    }));
  }

  function removeAssinatura(index: number) {
    setForm((f: any) => ({
      ...f,
      assinaturas: (f.assinaturas || []).filter(
        (_: any, i: number) => i !== index,
      ),
    }));
  }

  async function salvar() {
    if (!form.cliente_nome?.trim()) {
      toast.error("Informe ou selecione o cliente do orçamento");
      return null;
    }
    setSalvando(true);
    try {
      const servicosParaSalvar = (form.itens || [])
        .filter((servico: ServicoOrcamento) => servico.descricao?.trim())
        .map((servico: ServicoOrcamento) => ({
          descricao: limparDescricaoServico(servico.descricao),
          quantidade: Number(servico.quantidade) || 1,
          valor_unitario: Number(servico.valor_unitario) || 0,
        }));
      const valorFinal =
        servicosParaSalvar.length > 0
          ? calcularTotalServicos(servicosParaSalvar)
          : parseMoney(form.valor_total);
      const payload = {
        ...form,
        itens: servicosParaSalvar,
        valor_total: valorFinal,
      };
      const saved = selecionado
        ? await apiFetch(`/api/orcamentos/${selecionado.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/orcamentos", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      setSelecionado(saved);
      toast.success("Orçamento salvo");
      await carregarTudo();
      return saved;
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar orçamento");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function finalizar() {
    const saved = await salvar();
    if (!saved?.id) return null;
    setSalvando(true);
    try {
      const result = await apiFetch(`/api/orcamentos/${saved.id}/finalizar`, {
        method: "POST",
      });
      const finalizado = result?.orcamento ||
        result || { ...saved, status: "finalizado" };
      setSelecionado(finalizado);
      setEdicaoFinalizadoLiberada(false);
      toast.success("Orçamento finalizado");
      await carregarTudo();
      return finalizado;
    } catch (err: any) {
      toast.error(err.message || "Erro ao finalizar orçamento");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function baixarPdf() {
    // Sempre salvar o estado atual antes de gerar o PDF
    // Isso garante que ocultar_conteudo e outros campos refletem o que está na tela
    setSalvando(true);
    try {
      let base = selecionado;
      if (base?.id) {
        // Se já existe, atualiza silenciosamente com o estado atual do form
        const servicosParaSalvar = (form.itens || [])
          .filter((s: ServicoOrcamento) => s.descricao?.trim())
          .map((s: ServicoOrcamento) => ({
            descricao: limparDescricaoServico(s.descricao),
            quantidade: Number(s.quantidade) || 1,
            valor_unitario: Number(s.valor_unitario) || 0,
          }));
        const valorFinal = servicosParaSalvar.length > 0
          ? calcularTotalServicos(servicosParaSalvar)
          : parseMoney(form.valor_total);
        const atualizado = await apiFetch(`/api/orcamentos/${base.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...form, itens: servicosParaSalvar, valor_total: valorFinal }),
        }).catch(() => null);
        if (atualizado) { base = atualizado; setSelecionado(atualizado); }
      } else {
        base = await salvar();
        if (!base?.id) return;
      }
      // Garantir que está finalizado
      if (base.status !== "finalizado") {
        const result = await apiFetch(`/api/orcamentos/${base.id}/finalizar`, { method: "POST" });
        base = result?.orcamento || base;
        setSelecionado(base);
      }
      const { blob, filename } = await apiFetchBlob(
        `/api/orcamentos/${base.id}/download?t=${Date.now()}`,
      );
      downloadBlob(blob, filename || `${base.numero || "orcamento"}.pdf`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao baixar PDF");
    } finally {
      setSalvando(false);
    }
  }

  function editarOrcamento(orc: Orcamento) {
    void abrirOrcamento(orc).then(() => {
      setEdicaoFinalizadoLiberada(true);
      setAba("editor");
    });
  }

  async function excluirOrcamento(orc: Orcamento) {
    const nome = orc.numero || orc.cliente_nome || "este orçamento";
    if (!window.confirm(`Excluir ${nome}? Esta ação não pode ser desfeita.`))
      return;
    setSalvando(true);
    try {
      await apiFetch(`/api/orcamentos/${orc.id}`, { method: "DELETE" });
      toast.success("Orçamento excluído");
      if (selecionado?.id === orc.id) novoOrcamento();
      await carregarTudo();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir orçamento");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAnexos() {
    const saved = selecionado || (await salvar());
    if (!saved?.id || !arquivos?.length) {
      toast.error("Selecione arquivos para anexar");
      return;
    }
    setSalvando(true);
    try {
      const fd = new FormData();
      Array.from(arquivos).forEach((file) =>
        fd.append("arquivos", file, file.name),
      );
      if (descricaoAnexo) fd.append("descricao", descricaoAnexo);
      await apiFetch(`/api/orcamentos/${saved.id}/anexos`, {
        method: "POST",
        body: fd,
      });
      toast.success("Documentos anexados ao orçamento");
      setArquivos(null);
      setDescricaoAnexo("");
      if (fileRef.current) fileRef.current.value = "";
      await abrirOrcamento({ ...saved, id: saved.id });
      await carregarTudo();
    } catch (err: any) {
      toast.error(err.message || "Erro ao anexar documentos");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirAnexo(anexoId: string) {
    try {
      await apiFetch(`/api/orcamentos/anexos/${anexoId}`, { method: "DELETE" });
      toast.success("Anexo removido");
      if (selecionado?.id) await abrirOrcamento(selecionado);
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover anexo");
    }
  }

  async function baixarAnexo(anexo: Anexo) {
    if (!anexo.url) return;
    try {
      const { blob, filename } = await apiFetchBlob(anexo.url);
      downloadBlob(blob, filename || anexo.nome_original || "anexo");
    } catch (err: any) {
      toast.error(err.message || "Erro ao baixar anexo");
    }
  }

  return (
    <Layout title="Orçamentos">
      <div className="h-full min-h-0 overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-[1560px] px-4 py-4 lg:px-6 lg:py-5">
          <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-100">
                <FileSignature className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900">
                  Orçamentos
                </h1>
                <p className="text-sm text-slate-500">
                  Propostas de assessoria empresarial e financeira · valor direto ou serviços prestados com
                  cálculo automático.
                </p>
              </div>
            </div>
            <button
              onClick={novoOrcamento}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Novo orçamento
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void carregarTudo();
                    }}
                    placeholder="Buscar orçamento..."
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button
                  onClick={carregarTudo}
                  className="rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>

              <div className="max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto pr-1">
                {orcamentos.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                    Nenhum orçamento encontrado.
                  </div>
                ) : (
                  orcamentos.map((orc) => (
                    <div
                      key={orc.id}
                      className={`rounded-2xl border p-3 text-left transition ${
                        selecionado?.id === orc.id
                          ? "border-blue-200 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => abrirOrcamento(orc)}
                        className="w-full text-left"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-bold uppercase tracking-wide text-slate-400">
                            {orc.numero || "Rascunho"}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${orc.status === "finalizado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                          >
                            {orc.status}
                          </span>
                        </div>
                        <p className="truncate text-sm font-black text-slate-900">
                          {orc.cliente_nome || "Cliente não informado"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {orc.titulo}
                        </p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-700">
                            {moneyBR(orc.valor_total)}
                          </span>
                          <span className="text-slate-400">
                            {fmtDate(orc.atualizado_em || orc.criado_em)}
                          </span>
                        </div>
                      </button>
                      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          onClick={() => editarOrcamento(orc)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-blue-100 bg-white px-2 py-1.5 text-[11px] font-black text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => excluirOrcamento(orc)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-white px-2 py-1.5 text-[11px] font-black text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>

            <section className="min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
                <div className="flex flex-wrap gap-1">
                  {[
                    ["editor", "Editor"],
                    ["servicos", `Serviços (${servicosValidos.length})`],
                    ["anexos", "Anexos"],
                    ["preview", "Prévia"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setAba(id as AbaOrcamento)}
                      className={`rounded-2xl px-3 py-2 text-xs font-black transition ${aba === id ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={salvar}
                    disabled={salvando || camposBloqueados}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> Salvar rascunho
                  </button>
                  <button
                    onClick={finalizar}
                    disabled={salvando}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Finalizar
                  </button>
                  <button
                    onClick={baixarPdf}
                    disabled={salvando}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" /> PDF
                  </button>
                </div>
              </div>

              <div className="p-4">
                {isFinalizado && (
                  <div
                    className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${edicaoFinalizadoLiberada ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
                  >
                    {edicaoFinalizadoLiberada
                      ? "Edição liberada para este orçamento finalizado. Salve e finalize novamente para atualizar o PDF."
                      : "Orçamento finalizado. Use Editar para liberar alterações ou PDF para baixar a versão finalizada."}
                  </div>
                )}

                {aba === "editor" && (
                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            Tipo de cliente
                          </span>
                          <select
                            value={form.tipo_cliente}
                            disabled={camposBloqueados}
                            onChange={(e) =>
                              setForm((f: any) => ({
                                ...f,
                                tipo_cliente: e.target.value,
                                empresa_id: "",
                                cliente_pf_id: "",
                                cliente_nome: "",
                                cliente_documento: "",
                              }))
                            }
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            <option value="empresa">
                              Cliente PJ
                            </option>
                            <option value="pessoa_fisica">
                              Clientes PF (Pessoa Física)
                            </option>
                            <option value="livre">Livre / manual</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            Empresa prestadora
                          </span>
                          <select
                            value={form.marca}
                            disabled={camposBloqueados}
                            onChange={(e) =>
                              setForm((f: any) => ({
                                ...f,
                                marca: e.target.value,
                              }))
                            }
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            <option value="destrava">Destrava Crédito</option>
                            <option value="permupay">PermuPay</option>
                            <option value="aragao">Aragão Serviços</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            Validade (dias)
                          </span>
                          <input
                            type="number"
                            value={form.validade_dias}
                            disabled={camposBloqueados}
                            onChange={(e) =>
                              setForm((f: any) => ({
                                ...f,
                                validade_dias: Number(e.target.value || 30),
                              }))
                            }
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                            min={1}
                            placeholder="30"
                          />
                        </label>
                      </div>

                      {form.tipo_cliente === "empresa" && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            <Building2 className="mr-1 inline h-3.5 w-3.5" />{" "}
                            Selecionar cliente PJ
                          </span>
                          <select
                            value={form.empresa_id}
                            disabled={camposBloqueados}
                            onChange={(e) => aplicarEmpresa(e.target.value)}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            <option value="">Selecione um cliente PJ...</option>
                            {clientesPjFiltrados.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.razao_social || e.nome_fantasia} — {e.cnpj}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {form.tipo_cliente === "pessoa_fisica" && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            <User className="mr-1 inline h-3.5 w-3.5" />{" "}
                            Selecionar cliente PF
                          </span>
                          <select
                            value={form.cliente_pf_id}
                            disabled={camposBloqueados}
                            onChange={(e) => aplicarClientePf(e.target.value)}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            <option value="">
                              Selecione uma pessoa física...
                            </option>
                            {clientesPfFiltrados.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome} — {c.cpf}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <input
                          disabled={camposBloqueados}
                          value={form.cliente_nome}
                          onChange={(e) =>
                            setForm((f: any) => ({
                              ...f,
                              cliente_nome: e.target.value,
                            }))
                          }
                          className="h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
                          placeholder="Nome / Razão social do cliente"
                        />
                        <input
                          disabled={camposBloqueados}
                          value={form.cliente_documento}
                          onChange={(e) =>
                            setForm((f: any) => ({
                              ...f,
                              cliente_documento: e.target.value,
                            }))
                          }
                          className="h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
                          placeholder="CPF / CNPJ"
                        />
                        <input
                          disabled={camposBloqueados}
                          value={form.cliente_email}
                          onChange={(e) =>
                            setForm((f: any) => ({
                              ...f,
                              cliente_email: e.target.value,
                            }))
                          }
                          className="h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
                          placeholder="E-mail"
                        />
                        <input
                          disabled={camposBloqueados}
                          value={form.cliente_telefone}
                          onChange={(e) =>
                            setForm((f: any) => ({
                              ...f,
                              cliente_telefone: e.target.value,
                            }))
                          }
                          className="h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
                          placeholder="Telefone / WhatsApp"
                        />
                      </div>

                      <input
                        disabled={camposBloqueados}
                        value={form.titulo}
                        onChange={(e) =>
                          setForm((f: any) => ({
                            ...f,
                            titulo: e.target.value,
                          }))
                        }
                        className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-300"
                        placeholder="Título do orçamento"
                      />

                      <textarea
                        disabled={camposBloqueados}
                        value={form.descricao}
                        onChange={(e) =>
                          setForm((f: any) => ({
                            ...f,
                            descricao: e.target.value,
                          }))
                        }
                        rows={2}
                        className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-300"
                        placeholder="Descrição curta / subtítulo do orçamento"
                      />

                      <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                              <BadgeDollarSign className="h-4 w-4 text-blue-600" />{" "}
                              Valor do orçamento
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Use valor direto quando a proposta não precisar
                              detalhar serviços prestados.
                            </p>
                          </div>
                          {!camposBloqueados && (
                            <button
                              onClick={adicionarServico}
                              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                            >
                              <Plus className="h-3.5 w-3.5" /> Adicionar
                              serviços
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                              Valor direto
                            </span>
                            <input
                              disabled={camposBloqueados || hasServicos}
                              type="number"
                              min={0}
                              step={0.01}
                              value={form.valor_total}
                              onChange={(e) =>
                                setForm((f: any) => ({
                                  ...f,
                                  valor_total: e.target.value,
                                }))
                              }
                              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-300 disabled:bg-slate-100 disabled:text-slate-400"
                              placeholder="0,00"
                            />
                          </label>
                          {hasServicos && !camposBloqueados && (
                            <button
                              onClick={limparServicosUsarValorDireto}
                              className="h-11 rounded-2xl border border-amber-200 bg-white px-4 text-xs font-bold text-amber-700 hover:bg-amber-50"
                            >
                              Usar valor direto
                            </button>
                          )}
                        </div>
                        {hasServicos && (
                          <p className="mt-2 text-xs font-semibold text-blue-700">
                            Valor calculado automaticamente pelos serviços
                            prestados: {moneyBR(totalServicos)}.
                          </p>
                        )}
                      </div>

                      <div>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                            <PenLine className="h-4 w-4 text-blue-600" /> Texto livre do orçamento
                          </div>
                          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={mostrarDescricao}
                              onChange={(e) => {
                                setMostrarDescricao(e.target.checked);
                                setForm((f: any) => ({ ...f, ocultar_conteudo: !e.target.checked }));
                              }}
                              className="h-3.5 w-3.5 rounded"
                            />
                            {mostrarDescricao ? "Texto visível no orçamento" : "Texto oculto no orçamento"}
                          </label>
                        </div>
                        {mostrarDescricao && (
                          <textarea
                            readOnly={camposBloqueados}
                            value={form.conteudo}
                            onChange={(e) =>
                              !camposBloqueados && setForm((f: any) => ({
                                ...f,
                                conteudo: e.target.value,
                              }))
                            }
                            rows={14}
                            className={`w-full rounded-3xl border border-slate-200 bg-slate-50/60 px-4 py-4 text-sm leading-relaxed outline-none focus:border-blue-300 focus:bg-white ${camposBloqueados ? "cursor-default select-text opacity-70" : ""}`}
                            placeholder="Escreva livremente o escopo, condições, observações e demais informações do orçamento..."
                          />
                        )}
                        {!mostrarDescricao && (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-400">
                            Texto ocultado — não aparecerá no PDF do orçamento. Marque a opção acima para incluir.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                          <FileText className="h-4 w-4 text-blue-600" /> Resumo
                        </div>
                        <div className="space-y-3 text-sm">
                          <div>
                            <span className="text-xs font-bold uppercase text-slate-400">
                              Cliente
                            </span>
                            <p className="font-bold text-slate-900">
                              {form.cliente_nome || "Não informado"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-bold uppercase text-slate-400">
                              Empresa prestadora
                            </span>
                            <p className="font-bold text-slate-900">
                              {marca === "permupay"
                                ? "PermuPay"
                                : "Destrava Crédito"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-bold uppercase text-slate-400">
                              Modelo de valor
                            </span>
                            <p className="font-bold text-slate-900">
                              {hasServicos
                                ? "Serviços prestados"
                                : "Valor direto"}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-bold uppercase text-slate-400">
                              Valor total
                            </span>
                            <p className="text-xl font-black text-blue-700">
                              {moneyBR(valorTotalExibicao)}
                            </p>
                          </div>
                          <div>
                            <span className="text-xs font-bold uppercase text-slate-400">
                              Validade
                            </span>
                            <p className="font-bold text-slate-900">
                              {form.validade_dias || 30} dias
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-black text-slate-900">
                            Assinaturas
                          </div>
                          {!camposBloqueados && (
                            <button
                              onClick={addAssinatura}
                              className="text-xs font-bold text-blue-600 hover:underline"
                            >
                              + adicionar
                            </button>
                          )}
                        </div>
                        <div className="space-y-3">
                          {(form.assinaturas || []).map(
                            (a: any, idx: number) => (
                              <div
                                key={idx}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                              >
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs font-bold uppercase text-slate-400">
                                    {a.tipo || "assinatura"}
                                  </span>
                                  {!camposBloqueados && idx > 1 && (
                                    <button
                                      onClick={() => removeAssinatura(idx)}
                                      className="text-rose-500"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                                <input
                                  disabled={camposBloqueados}
                                  value={a.nome || ""}
                                  onChange={(e) =>
                                    updateAssinatura(
                                      idx,
                                      "nome",
                                      e.target.value,
                                    )
                                  }
                                  className="mb-2 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none"
                                  placeholder="Nome"
                                />
                                <input
                                  disabled={camposBloqueados}
                                  value={a.cargo || ""}
                                  onChange={(e) =>
                                    updateAssinatura(
                                      idx,
                                      "cargo",
                                      e.target.value,
                                    )
                                  }
                                  className="mb-2 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none"
                                  placeholder="Cargo / qualificação"
                                />
                                <input
                                  disabled={camposBloqueados}
                                  value={a.documento || ""}
                                  onChange={(e) =>
                                    updateAssinatura(
                                      idx,
                                      "documento",
                                      e.target.value,
                                    )
                                  }
                                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none"
                                  placeholder="CPF / CNPJ"
                                />
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {aba === "servicos" && (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                          <PackagePlus className="h-5 w-5 text-blue-600" />{" "}
                          Serviços prestados
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Descreva assessoria, consultoria, diagnóstico,
                          acompanhamento ou qualquer serviço contratado.
                        </p>
                      </div>
                      {!camposBloqueados && (
                        <button
                          onClick={adicionarServico}
                          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                        >
                          <Plus className="h-3.5 w-3.5" /> Adicionar serviço
                        </button>
                      )}
                    </div>

                    {servicos.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                          <BadgeDollarSign className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">
                          Nenhum serviço detalhado.
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Você pode usar somente o valor direto no Editor ou
                          detalhar os serviços prestados aqui.
                        </p>
                        {!camposBloqueados && (
                          <button
                            onClick={adicionarServico}
                            className="mt-4 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
                          >
                            Adicionar primeiro serviço
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="hidden grid-cols-[2fr_80px_140px_80px] gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid">
                          <span>Serviço prestado</span>
                          <span className="text-center">Qtd</span>
                          <span className="text-right">Valor unitário</span>
                          <span className="text-right">Ações</span>
                        </div>

                        <div className="space-y-2">
                          {servicos.map((servico, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[2fr_80px_140px_80px] md:items-center"
                            >
                              <div>
                                <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 md:hidden">
                                  Serviço prestado
                                </span>
                                <input
                                  disabled={camposBloqueados}
                                  value={servico.descricao}
                                  onChange={(e) =>
                                    atualizarServico(
                                      idx,
                                      "descricao",
                                      e.target.value,
                                    )
                                  }
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                                  placeholder={`Ex.: Assessoria de crédito empresarial`}
                                />
                              </div>
                              <div>
                                <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 md:hidden">
                                  Qtd
                                </span>
                                <input
                                  disabled={camposBloqueados}
                                  type="number"
                                  min={1}
                                  value={servico.quantidade}
                                  onChange={(e) =>
                                    atualizarServico(
                                      idx,
                                      "quantidade",
                                      Number(e.target.value) || 1,
                                    )
                                  }
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-bold outline-none focus:border-blue-300"
                                />
                              </div>
                              <div>
                                <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 md:hidden">
                                  Valor unitário (R$)
                                </span>
                                <input
                                  disabled={camposBloqueados}
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={servico.valor_unitario}
                                  onChange={(e) =>
                                    atualizarServico(
                                      idx,
                                      "valor_unitario",
                                      Number(e.target.value) || 0,
                                    )
                                  }
                                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-bold outline-none focus:border-blue-300"
                                  placeholder="0,00"
                                />
                              </div>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setAba("servicos")}
                                  className="rounded-xl p-2 text-slate-400"
                                  title="Atualização automática"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                {!camposBloqueados && (
                                  <button
                                    onClick={() => removerServico(idx)}
                                    className="rounded-xl p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                                    title="Remover serviço"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                              {(servico.descricao ||
                                Number(servico.valor_unitario) > 0) && (
                                <div className="col-span-full -mt-1 flex justify-end">
                                  <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                                    Subtotal:{" "}
                                    {moneyBR(
                                      (Number(servico.quantidade) || 0) *
                                        (Number(servico.valor_unitario) || 0),
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          {!camposBloqueados && (
                            <button
                              onClick={adicionarServico}
                              className="rounded-2xl border-2 border-dashed border-blue-200 px-4 py-3 text-sm font-bold text-blue-500 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                            >
                              <Plus className="mr-1.5 inline h-4 w-4" />{" "}
                              Adicionar mais um serviço
                            </button>
                          )}
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-4 sm:ml-auto">
                            <div className="text-xs font-bold uppercase text-blue-500">
                              Total dos serviços
                            </div>
                            <div className="text-3xl font-black text-blue-700">
                              {moneyBR(totalServicos)}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {aba === "anexos" && (
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/60 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                        <Paperclip className="h-4 w-4 text-blue-600" /> Anexar
                        documentos livremente
                      </div>
                      <input
                        ref={fileRef}
                        type="file"
                        multiple
                        onChange={(e) => setArquivos(e.target.files)}
                        className="mb-3 block w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        value={descricaoAnexo}
                        onChange={(e) => setDescricaoAnexo(e.target.value)}
                        placeholder="Descrição opcional dos anexos"
                        className="mb-3 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                      />
                      <button
                        onClick={enviarAnexos}
                        disabled={salvando || !arquivos?.length}
                        className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Paperclip className="h-4 w-4" /> Enviar anexos
                      </button>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-4 py-3 text-sm font-black text-slate-900">
                        Documentos anexados
                      </div>
                      <div className="divide-y divide-slate-100">
                        {(selecionado?.anexos || []).length === 0 ? (
                          <div className="p-8 text-center text-sm text-slate-500">
                            Nenhum documento anexado a este orçamento.
                          </div>
                        ) : (
                          (selecionado?.anexos || []).map((anexo) => (
                            <div
                              key={anexo.id}
                              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">
                                  {anexo.nome_original}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {anexo.descricao || "Anexo"} ·{" "}
                                  {fmtDate(anexo.criado_em)}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => baixarAnexo(anexo)}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                >
                                  Baixar
                                </button>
                                <button
                                  onClick={() => excluirAnexo(anexo.id)}
                                  className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {aba === "preview" && (
                  <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                    <div
                      className={`mb-6 flex items-center justify-between border-b-4 pb-4 ${marca === "permupay" ? "border-blue-600" : marca === "aragao" ? "border-amber-600" : "border-[#1B3A8C]"}`}
                    >
                      <img
                        src={
                          marca === "permupay"
                            ? "/logo-permupay.png"
                            : marca === "aragao"
                              ? "/logo-aragao-servicos.svg"
                              : "/destrava-logo.svg"
                        }
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/destrava-logo.svg";
                        }}
                        className={`${marca === "permupay" ? "h-20 max-w-[280px]" : marca === "aragao" ? "h-16 max-w-[260px]" : "h-12 max-w-[190px]"} object-contain`}
                      />
                      <div className="text-right text-xs text-slate-500">
                        <div className="font-black text-slate-800">{selecionado?.numero || "Rascunho"}</div>
                        <div>Validade: {form.validade_dias || 30} dias</div>
                      </div>
                    </div>

                    {/* Título e subtítulo */}
                    <h2 className="text-2xl font-black text-slate-900">{form.titulo}</h2>
                    {form.descricao && (
                      <p className="mt-1 text-sm font-semibold text-slate-500">{form.descricao}</p>
                    )}

                    {/* Cliente */}
                    <div className="my-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-bold uppercase text-slate-400">Cliente</div>
                      <div className="font-black text-slate-900">{form.cliente_nome || "Cliente não informado"}</div>
                      <div className="text-sm text-slate-600">{form.cliente_documento}</div>
                    </div>

                    {/* Texto livre (se habilitado) */}
                    {mostrarDescricao && form.conteudo && (
                      <div className="mb-5">
                        <div className="mb-2 text-sm font-black text-slate-800">Escopo e condições</div>
                        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">{form.conteudo}</div>
                      </div>
                    )}

                    {/* Itens / Serviços — sempre depois da descrição, antes do valor */}
                    {hasServicos ? (
                      <div className="my-5">
                        <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-black text-slate-800">
                          Serviços prestados
                        </div>
                        <div className="space-y-2">
                          {servicosValidos.map((servico, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                            >
                              <span className="text-sm text-slate-700">{limparDescricaoServico(servico.descricao)}</span>
                              <div className="text-right text-sm">
                                <span className="text-slate-400">
                                  {servico.quantidade}x {moneyBR(servico.valor_unitario)} ={" "}
                                </span>
                                <span className="font-bold text-slate-900">
                                  {moneyBR(Number(servico.quantidade) * Number(servico.valor_unitario))}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="my-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                        Orçamento lançado por valor direto, sem detalhamento de serviços na proposta.
                      </div>
                    )}

                    {/* Valor total — sempre por último antes das assinaturas */}
                    <div className="my-6 rounded-2xl border-2 border-blue-200 bg-blue-50 p-4">
                      <div className="text-xs font-bold uppercase text-blue-500">Valor total do orçamento</div>
                      <div className="text-3xl font-black text-blue-700">{moneyBR(valorTotalExibicao)}</div>
                      {form.validade_dias && (
                        <div className="mt-1 text-xs text-blue-400">Válido por {form.validade_dias} dias</div>
                      )}
                    </div>

                    {/* Assinaturas */}
                    <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
                      {(form.assinaturas || []).map((a: any, idx: number) => (
                        <div key={idx} className="text-center">
                          <div className="mb-2 border-t border-slate-900 pt-2" />
                          <div className="text-sm font-black text-slate-900">{a.nome || "Assinante"}</div>
                          <div className="text-xs text-slate-500">{a.cargo}</div>
                          <div className="text-xs text-slate-400">{a.documento}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </Layout>
  );
}
