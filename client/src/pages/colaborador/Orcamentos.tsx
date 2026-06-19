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
  BadgeDollarSign,
  RefreshCw,
  FileText,
  PenLine,
  PackagePlus,
} from "lucide-react";

type TipoCliente = "empresa" | "pessoa_fisica" | "livre";
type MarcaOrcamento = "destrava" | "permupay";

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

interface ItemOrcamento {
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
  itens?: ItemOrcamento[];
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
  { tipo: "contratada", nome: "DESTRAVA CRÉDITO LTDA", cargo: "Contratada", documento: "CNPJ 35.427.182/0001-66" },
  { tipo: "cliente", nome: "", cargo: "Cliente / Contratante", documento: "" },
];

const CONTEUDO_PADRAO = `1. Objeto do orçamento
Prestação de serviços de organização, análise, estruturação e acompanhamento para soluções financeiras, crédito empresarial, meios de pagamento ou serviços correlatos, conforme necessidade do cliente selecionado.

2. Condições comerciais
As condições finais podem variar conforme documentação apresentada, escopo contratado, complexidade da operação e aprovação interna.

3. Observações
Este orçamento é editável antes da finalização. Documentos complementares podem ser anexados ao orçamento para conferência, comprovação ou suporte da proposta.`;

const ITEM_VAZIO: ItemOrcamento = { descricao: "", quantidade: 1, valor_unitario: 0 };

function moneyBR(value: any): string {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(date?: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function calcularTotalItens(itens: ItemOrcamento[]): number {
  return itens.reduce((acc, item) => acc + (Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0), 0);
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
  itens: [{ ...ITEM_VAZIO }] as ItemOrcamento[],
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
  const [aba, setAba] = useState<"editor" | "itens" | "anexos" | "preview">("editor");
  const [arquivos, setArquivos] = useState<FileList | null>(null);
  const [descricaoAnexo, setDescricaoAnexo] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const marca = form.marca as MarcaOrcamento;
  const isFinalizado = selecionado?.status === "finalizado";
  const itens: ItemOrcamento[] = Array.isArray(form.itens) && form.itens.length > 0 ? form.itens : [{ ...ITEM_VAZIO }];
  const totalItens = calcularTotalItens(itens);
  const hasItens = itens.some((it) => it.descricao?.trim() || Number(it.valor_unitario) > 0);

  // Sincronizar valor_total com total dos itens automaticamente
  useEffect(() => {
    if (hasItens) {
      setForm((f: any) => ({ ...f, valor_total: String(totalItens) }));
    }
  }, [totalItens, hasItens]);

  async function carregarTudo() {
    setLoading(true);
    try {
      const [lista, clientes] = await Promise.all([
        apiFetch(`/api/orcamentos${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`),
        apiFetch("/api/orcamentos/clientes"),
      ]);
      setOrcamentos(Array.isArray(lista) ? lista : []);
      setEmpresas(Array.isArray(clientes?.empresas) ? clientes.empresas : []);
      setClientesPf(Array.isArray(clientes?.clientes_pf) ? clientes.clientes_pf : []);
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

  const empresasFiltradas = useMemo(() => empresas, [empresas]);
  const clientesPfFiltrados = useMemo(() => clientesPf, [clientesPf]);

  function novoOrcamento() {
    setSelecionado(null);
    setForm({ ...estadoInicial, itens: [{ ...ITEM_VAZIO }], assinaturas: ASSINATURAS_PADRAO.map((a) => ({ ...a })) });
    setAba("editor");
  }

  async function abrirOrcamento(orc: Orcamento) {
    try {
      const full = await apiFetch(`/api/orcamentos/${orc.id}`);
      setSelecionado(full);
      const itensCarregados = Array.isArray(full.itens) && full.itens.length > 0 ? full.itens : [{ ...ITEM_VAZIO }];
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
        itens: itensCarregados,
        valor_total: String(full.valor_total ?? "0"),
        validade_dias: full.validade_dias || 30,
        validade_ate: full.validade_ate || "",
        assinaturas: Array.isArray(full.assinaturas) && full.assinaturas.length ? full.assinaturas : ASSINATURAS_PADRAO.map((a) => ({ ...a })),
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
        a.tipo === "cliente" ? { ...a, nome: emp?.razao_social || emp?.nome_fantasia || "", documento: emp?.cnpj || "" } : a
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
        a.tipo === "cliente" ? { ...a, nome: cli?.nome || "", documento: cli?.cpf || "" } : a
      ),
    }));
  }

  // ── Itens ────────────────────────────────────────────────────────────────
  function addItem() {
    setForm((f: any) => ({ ...f, itens: [...(f.itens || []), { ...ITEM_VAZIO }] }));
  }

  function removeItem(idx: number) {
    setForm((f: any) => {
      const novos = (f.itens || []).filter((_: any, i: number) => i !== idx);
      return { ...f, itens: novos.length > 0 ? novos : [{ ...ITEM_VAZIO }] };
    });
  }

  function updateItem(idx: number, key: keyof ItemOrcamento, value: string | number) {
    setForm((f: any) => {
      const itensNovos = [...(f.itens || [])];
      itensNovos[idx] = { ...(itensNovos[idx] || ITEM_VAZIO), [key]: value };
      return { ...f, itens: itensNovos };
    });
  }

  // ── Assinaturas ───────────────────────────────────────────────────────────
  function updateAssinatura(index: number, key: string, value: string) {
    const assinaturas = [...(form.assinaturas || [])];
    assinaturas[index] = { ...(assinaturas[index] || {}), [key]: value };
    setForm((f: any) => ({ ...f, assinaturas }));
  }

  function addAssinatura() {
    setForm((f: any) => ({
      ...f,
      assinaturas: [...(f.assinaturas || []), { tipo: "testemunha", nome: "", cargo: "Testemunha", documento: "" }],
    }));
  }

  function removeAssinatura(index: number) {
    setForm((f: any) => ({
      ...f,
      assinaturas: (f.assinaturas || []).filter((_: any, i: number) => i !== index),
    }));
  }

  // ── Persistência ─────────────────────────────────────────────────────────
  async function salvar() {
    if (!form.cliente_nome?.trim()) {
      toast.error("Informe ou selecione o cliente do orçamento");
      return null;
    }
    setSalvando(true);
    try {
      const itensValidos = (form.itens || []).filter((it: ItemOrcamento) => it.descricao?.trim());
      const valorFinal = itensValidos.length > 0 ? calcularTotalItens(itensValidos) : Number(String(form.valor_total || 0).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
      const payload = {
        ...form,
        itens: itensValidos,
        valor_total: valorFinal,
      };
      const saved = selecionado
        ? await apiFetch(`/api/orcamentos/${selecionado.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch("/api/orcamentos", { method: "POST", body: JSON.stringify(payload) });
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
    const saved = selecionado || await salvar();
    if (!saved?.id) return;
    setSalvando(true);
    try {
      const result = await apiFetch(`/api/orcamentos/${saved.id}/finalizar`, { method: "POST" });
      setSelecionado(result?.orcamento || saved);
      toast.success("Orçamento finalizado com papel timbrado");
      await carregarTudo();
    } catch (err: any) {
      toast.error(err.message || "Erro ao finalizar orçamento");
    } finally {
      setSalvando(false);
    }
  }

  async function baixarPdf() {
    const saved = selecionado || await salvar();
    if (!saved?.id) return;
    try {
      const { blob, filename } = await apiFetchBlob(`/api/orcamentos/${saved.id}/download`);
      downloadBlob(blob, filename || `${saved.numero || "orcamento"}.pdf`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao baixar PDF");
    }
  }

  async function enviarAnexos() {
    const saved = selecionado || await salvar();
    if (!saved?.id || !arquivos?.length) {
      toast.error("Selecione arquivos para anexar");
      return;
    }
    setSalvando(true);
    try {
      const fd = new FormData();
      Array.from(arquivos).forEach((file) => fd.append("arquivos", file, file.name));
      if (descricaoAnexo) fd.append("descricao", descricaoAnexo);
      await apiFetch(`/api/orcamentos/${saved.id}/anexos`, { method: "POST", body: fd });
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
                <h1 className="text-xl font-black tracking-tight text-slate-900">Orçamentos timbrados</h1>
                <p className="text-sm text-slate-500">Destrava e PermuPay · Clientes PJ ou PF · Itens configuráveis com cálculo automático.</p>
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
            {/* Lista lateral */}
            <aside className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void carregarTudo(); }}
                    placeholder="Buscar orçamento..."
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button onClick={carregarTudo} className="rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto pr-1">
                {orcamentos.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                    Nenhum orçamento encontrado.
                  </div>
                ) : orcamentos.map((orc) => (
                  <button
                    key={orc.id}
                    onClick={() => abrirOrcamento(orc)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      selecionado?.id === orc.id
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold uppercase tracking-wide text-slate-400">{orc.numero || "Rascunho"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                        orc.status === "finalizado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {orc.status}
                      </span>
                    </div>
                    <p className="truncate text-sm font-black text-slate-900">{orc.cliente_nome || "Cliente não informado"}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{orc.titulo}</p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">{moneyBR(orc.valor_total)}</span>
                      <span className="text-slate-400">{fmtDate(orc.atualizado_em || orc.criado_em)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            {/* Painel editor */}
            <section className="min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
                <div className="flex flex-wrap gap-1">
                  {[
                    ["editor", "Editor"],
                    ["itens", `Itens (${itens.filter(it => it.descricao?.trim()).length || 0})`],
                    ["anexos", "Anexos"],
                    ["preview", "Prévia"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setAba(id as any)}
                      className={`rounded-2xl px-3 py-2 text-xs font-black transition ${
                        aba === id ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={salvar} disabled={salvando || isFinalizado} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Save className="h-4 w-4" /> Salvar rascunho
                  </button>
                  <button onClick={finalizar} disabled={salvando} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    <CheckCircle2 className="h-4 w-4" /> Finalizar
                  </button>
                  <button onClick={baixarPdf} disabled={salvando} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
                    <Download className="h-4 w-4" /> PDF
                  </button>
                </div>
              </div>

              <div className="p-4">
                {isFinalizado && (
                  <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    Orçamento finalizado. Para alterar texto ou valores, crie um novo orçamento.
                  </div>
                )}

                {/* ── Aba Editor ─────────────────────────────────────────── */}
                {aba === "editor" && (
                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Tipo de cliente</span>
                          <select
                            value={form.tipo_cliente}
                            disabled={isFinalizado}
                            onChange={(e) => setForm((f: any) => ({ ...f, tipo_cliente: e.target.value, empresa_id: "", cliente_pf_id: "", cliente_nome: "", cliente_documento: "" }))}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            <option value="empresa">Clientes PJ (Empresa)</option>
                            <option value="pessoa_fisica">Clientes PF (Pessoa Física)</option>
                            <option value="livre">Livre / manual</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Papel timbrado</span>
                          <select
                            value={form.marca}
                            disabled={isFinalizado}
                            onChange={(e) => setForm((f: any) => ({ ...f, marca: e.target.value }))}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            <option value="destrava">Destrava Crédito</option>
                            <option value="permupay">PermuPay</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            Validade (dias)
                          </span>
                          <input
                            type="number"
                            value={form.validade_dias}
                            disabled={isFinalizado}
                            onChange={(e) => setForm((f: any) => ({ ...f, validade_dias: Number(e.target.value || 30) }))}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                            placeholder="30"
                            min={1}
                          />
                        </label>
                      </div>

                      {/* Seleção de cliente PJ */}
                      {form.tipo_cliente === "empresa" && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            <Building2 className="mr-1 inline h-3.5 w-3.5" />
                            Selecionar cliente PJ
                          </span>
                          <select
                            value={form.empresa_id}
                            disabled={isFinalizado}
                            onChange={(e) => aplicarEmpresa(e.target.value)}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            <option value="">Selecione uma empresa...</option>
                            {empresasFiltradas.map((e) => (
                              <option key={e.id} value={e.id}>{e.razao_social || e.nome_fantasia} — {e.cnpj}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Seleção de cliente PF */}
                      {form.tipo_cliente === "pessoa_fisica" && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                            <User className="mr-1 inline h-3.5 w-3.5" />
                            Selecionar cliente PF
                          </span>
                          <select
                            value={form.cliente_pf_id}
                            disabled={isFinalizado}
                            onChange={(e) => aplicarClientePf(e.target.value)}
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                          >
                            <option value="">Selecione uma pessoa física...</option>
                            {clientesPfFiltrados.map((c) => (
                              <option key={c.id} value={c.id}>{c.nome} — {c.cpf}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Dados do cliente */}
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <input disabled={isFinalizado} value={form.cliente_nome} onChange={(e) => setForm((f: any) => ({ ...f, cliente_nome: e.target.value }))} className="h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" placeholder="Nome / Razão social do cliente" />
                        <input disabled={isFinalizado} value={form.cliente_documento} onChange={(e) => setForm((f: any) => ({ ...f, cliente_documento: e.target.value }))} className="h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" placeholder="CPF / CNPJ" />
                        <input disabled={isFinalizado} value={form.cliente_email} onChange={(e) => setForm((f: any) => ({ ...f, cliente_email: e.target.value }))} className="h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" placeholder="E-mail" />
                        <input disabled={isFinalizado} value={form.cliente_telefone} onChange={(e) => setForm((f: any) => ({ ...f, cliente_telefone: e.target.value }))} className="h-11 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" placeholder="Telefone / WhatsApp" />
                      </div>

                      <input disabled={isFinalizado} value={form.titulo} onChange={(e) => setForm((f: any) => ({ ...f, titulo: e.target.value }))} className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-300" placeholder="Título do orçamento" />

                      <textarea disabled={isFinalizado} value={form.descricao} onChange={(e) => setForm((f: any) => ({ ...f, descricao: e.target.value }))} rows={2} className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-300" placeholder="Descrição curta / subtítulo do orçamento" />

                      <div>
                        <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
                          <PenLine className="h-4 w-4 text-blue-600" />
                          Texto livre do orçamento
                        </div>
                        <textarea
                          disabled={isFinalizado}
                          value={form.conteudo}
                          onChange={(e) => setForm((f: any) => ({ ...f, conteudo: e.target.value }))}
                          rows={14}
                          className="w-full rounded-3xl border border-slate-200 bg-slate-50/60 px-4 py-4 text-sm leading-relaxed outline-none focus:border-blue-300 focus:bg-white"
                          placeholder="Escreva livremente o escopo, condições, observações e demais informações do orçamento..."
                        />
                      </div>
                    </div>

                    {/* Coluna lateral — resumo + assinaturas */}
                    <div className="space-y-4">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                          <FileText className="h-4 w-4 text-blue-600" />
                          Resumo
                        </div>
                        <div className="space-y-3 text-sm">
                          <div><span className="text-xs font-bold uppercase text-slate-400">Cliente</span><p className="font-bold text-slate-900">{form.cliente_nome || "Não informado"}</p></div>
                          <div><span className="text-xs font-bold uppercase text-slate-400">Marca</span><p className="font-bold text-slate-900">{marca === "permupay" ? "PermuPay" : "Destrava Crédito"}</p></div>
                          <div>
                            <span className="text-xs font-bold uppercase text-slate-400">Valor total</span>
                            <p className="text-xl font-black text-blue-700">{moneyBR(hasItens ? totalItens : String(form.valor_total).replace(",", "."))}</p>
                            {hasItens && <p className="mt-0.5 text-xs text-slate-400">Calculado automaticamente pelos itens</p>}
                          </div>
                          <div><span className="text-xs font-bold uppercase text-slate-400">Validade</span><p className="font-bold text-slate-900">{form.validade_dias || 30} dias</p></div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-black text-slate-900">Assinaturas</div>
                          {!isFinalizado && <button onClick={addAssinatura} className="text-xs font-bold text-blue-600 hover:underline">+ adicionar</button>}
                        </div>
                        <div className="space-y-3">
                          {(form.assinaturas || []).map((a: any, idx: number) => (
                            <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-bold uppercase text-slate-400">{a.tipo || "assinatura"}</span>
                                {!isFinalizado && idx > 1 && <button onClick={() => removeAssinatura(idx)} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>}
                              </div>
                              <input disabled={isFinalizado} value={a.nome || ""} onChange={(e) => updateAssinatura(idx, "nome", e.target.value)} className="mb-2 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none" placeholder="Nome" />
                              <input disabled={isFinalizado} value={a.cargo || ""} onChange={(e) => updateAssinatura(idx, "cargo", e.target.value)} className="mb-2 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none" placeholder="Cargo / qualificação" />
                              <input disabled={isFinalizado} value={a.documento || ""} onChange={(e) => updateAssinatura(idx, "documento", e.target.value)} className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none" placeholder="CPF / CNPJ" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Aba Itens ─────────────────────────────────────────── */}
                {aba === "itens" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                        <PackagePlus className="h-5 w-5 text-blue-600" />
                        Itens do orçamento
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-black text-blue-700">
                          O valor total é calculado automaticamente
                        </span>
                      </div>
                      {!isFinalizado && (
                        <button onClick={addItem} className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
                          <Plus className="h-3.5 w-3.5" /> Adicionar item
                        </button>
                      )}
                    </div>

                    {/* Cabeçalho da tabela */}
                    <div className="hidden grid-cols-[2fr_80px_140px_36px] gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid">
                      <span>Descrição do item / serviço</span>
                      <span className="text-center">Qtd</span>
                      <span className="text-right">Valor unitário</span>
                      <span></span>
                    </div>

                    {/* Linhas de itens */}
                    <div className="space-y-2">
                      {itens.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[2fr_80px_140px_36px] md:items-center">
                          <div>
                            <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 md:hidden">Descrição</span>
                            <input
                              disabled={isFinalizado}
                              value={item.descricao}
                              onChange={(e) => updateItem(idx, "descricao", e.target.value)}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300"
                              placeholder={`Item ${idx + 1} — descreva o serviço ou produto`}
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 md:hidden">Qtd</span>
                            <input
                              disabled={isFinalizado}
                              type="number"
                              min={1}
                              value={item.quantidade}
                              onChange={(e) => updateItem(idx, "quantidade", Number(e.target.value) || 1)}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-bold outline-none focus:border-blue-300"
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400 md:hidden">Valor unitário (R$)</span>
                            <input
                              disabled={isFinalizado}
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.valor_unitario}
                              onChange={(e) => updateItem(idx, "valor_unitario", Number(e.target.value) || 0)}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-bold outline-none focus:border-blue-300"
                              placeholder="0,00"
                            />
                          </div>
                          <div className="flex items-center justify-end">
                            {!isFinalizado && (
                              <button
                                onClick={() => removeItem(idx)}
                                className="rounded-xl p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Remover item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          {/* Total por linha */}
                          {(item.descricao || Number(item.valor_unitario) > 0) && (
                            <div className="col-span-full -mt-1 flex justify-end">
                              <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                                Subtotal: {moneyBR((Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0))}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Total geral */}
                    {itens.length > 0 && (
                      <div className="flex justify-end">
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-4">
                          <div className="text-xs font-bold uppercase text-blue-500">Total do orçamento</div>
                          <div className="text-3xl font-black text-blue-700">{moneyBR(totalItens)}</div>
                          <div className="mt-0.5 text-xs text-blue-400">Calculado automaticamente • {itens.filter(it => it.descricao?.trim()).length} item(ns)</div>
                        </div>
                      </div>
                    )}

                    {!isFinalizado && (
                      <button onClick={addItem} className="w-full rounded-2xl border-2 border-dashed border-blue-200 py-3 text-sm font-bold text-blue-500 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 transition">
                        <Plus className="mr-1.5 inline h-4 w-4" /> Adicionar mais um item
                      </button>
                    )}
                  </div>
                )}

                {/* ── Aba Anexos ────────────────────────────────────────── */}
                {aba === "anexos" && (
                  <div className="space-y-4">
                    <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/60 p-4">
                      <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                        <Paperclip className="h-4 w-4 text-blue-600" />
                        Anexar documentos livremente
                      </div>
                      <input ref={fileRef} type="file" multiple onChange={(e) => setArquivos(e.target.files)} className="mb-3 block w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                      <input value={descricaoAnexo} onChange={(e) => setDescricaoAnexo(e.target.value)} placeholder="Descrição opcional dos anexos" className="mb-3 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" />
                      <button onClick={enviarAnexos} disabled={salvando || !arquivos?.length} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                        <Paperclip className="h-4 w-4" /> Enviar anexos
                      </button>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-4 py-3 text-sm font-black text-slate-900">Documentos anexados</div>
                      <div className="divide-y divide-slate-100">
                        {(selecionado?.anexos || []).length === 0 ? (
                          <div className="p-8 text-center text-sm text-slate-500">Nenhum documento anexado a este orçamento.</div>
                        ) : (selecionado?.anexos || []).map((anexo) => (
                          <div key={anexo.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">{anexo.nome_original}</p>
                              <p className="text-xs text-slate-500">{anexo.descricao || "Anexo"} · {fmtDate(anexo.criado_em)}</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => baixarAnexo(anexo)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Baixar</button>
                              <button onClick={() => excluirAnexo(anexo.id)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50">Excluir</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Aba Prévia ────────────────────────────────────────── */}
                {aba === "preview" && (
                  <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                    <div className={`mb-6 flex items-center justify-between border-b-4 pb-4 ${marca === "permupay" ? "border-blue-600" : "border-[#1B3A8C]"}`}>
                      <img src={marca === "permupay" ? "/logo-permupay.png" : "/destrava-logo.svg"} onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/destrava-logo.svg"; }} className="h-12 max-w-[190px] object-contain" />
                      <div className="text-right text-xs text-slate-500">
                        <div className="font-black text-slate-800">{selecionado?.numero || "Rascunho"}</div>
                        <div>Validade: {form.validade_dias || 30} dias</div>
                      </div>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">{form.titulo}</h2>
                    {form.descricao && <p className="mt-1 text-sm font-semibold text-slate-500">{form.descricao}</p>}
                    <div className="my-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-bold uppercase text-slate-400">Cliente</div>
                      <div className="font-black text-slate-900">{form.cliente_nome || "Cliente não informado"}</div>
                      <div className="text-sm text-slate-600">{form.cliente_documento}</div>
                    </div>

                    {/* Itens na prévia */}
                    {hasItens && (
                      <div className="my-5">
                        <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-black text-slate-800">Itens do orçamento</div>
                        <div className="space-y-2">
                          {itens.filter(it => it.descricao?.trim()).map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                              <span className="text-sm text-slate-700">{item.descricao}</span>
                              <div className="text-right text-sm">
                                <span className="text-slate-400">{item.quantidade}x {moneyBR(item.valor_unitario)} = </span>
                                <span className="font-bold text-slate-900">{moneyBR(Number(item.quantidade) * Number(item.valor_unitario))}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">{form.conteudo}</div>
                    <div className="my-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-bold uppercase text-slate-400">Valor total</div>
                      <div className="text-2xl font-black text-blue-700">{moneyBR(hasItens ? totalItens : String(form.valor_total).replace(",", "."))}</div>
                    </div>
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
