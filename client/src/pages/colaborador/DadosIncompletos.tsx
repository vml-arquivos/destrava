import { useEffect, useMemo, useState } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";

type Item = {
  id: string;
  tipo: "empresa" | "cliente_pf" | "lead";
  nome?: string;
  razao_social?: string;
  nome_fantasia?: string;
  empresa?: string;
  documento?: string;
  email?: string;
  telefone?: string;
  cadastro_pendencias?: string[];
  cadastro_status?: string;
  bloqueado_operacional?: boolean;
  arquivado_por_duplicidade?: boolean;
  duplicado_de?: string;
  updated_at?: string;
  created_at?: string;
};

type EditForm = {
  nome: string;
  documento: string;
  email: string;
  telefone: string;
};

const tipoLabel: Record<string, string> = {
  empresa: "Empresa",
  cliente_pf: "Cliente PF",
  lead: "Cliente/Lead",
};

const tipoIcon: Record<string, any> = {
  empresa: Building2,
  cliente_pf: UserCheck,
  lead: Users,
};

function onlyDigits(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function formatDoc(value?: string) {
  const d = onlyDigits(value);
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return value || "Documento não informado";
}

function parseCapitalSocial(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  const raw = String(valor).trim().replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep === -1) {
    const parsed = Number(raw.replace(/[^\d-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const decimals = raw.slice(lastSep + 1).replace(/\D/g, "");
  const before = raw.slice(0, lastSep).replace(/[^\d-]/g, "");
  if (decimals.length > 0 && decimals.length <= 2) {
    const parsed = Number(`${before}.${decimals}`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(raw.replace(/[.,]/g, "").replace(/[^\d-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function telefoneReceita(numero?: string | null) {
  const d = onlyDigits(numero || "");
  if (!d) return "";
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return d;
}

function primeiraInscricaoEstadualReceita(data: any): string | null {
  if (data?.inscricao_estadual) return String(data.inscricao_estadual);
  const regs = Array.isArray(data?.inscricoes_estaduais) ? data.inscricoes_estaduais : [];
  const active = regs.find((r: any) => String(r?.situacao || "").toLowerCase().includes("ativ") || String(r?.situacao || "").toLowerCase().includes("habilit"));
  return (active || regs[0])?.numero || null;
}

function regimeTributarioReceita(data: any): string | null {
  if (data?.opcao_pelo_mei === true || data?.opcao_pelo_mei === "true") return "MEI";
  if (data?.opcao_pelo_simples === true || data?.opcao_pelo_simples === "true") return "Simples Nacional";
  return null;
}

function porteReceita(data: any, atual?: string): string {
  const raw = String(data?.porte || data?.descricao_porte || "").toLowerCase();
  if (raw.includes("mei")) return "mei";
  if (raw.includes("micro") || raw === "me") return "me";
  if (raw.includes("pequeno") || raw.includes("epp")) return "epp";
  if (raw.includes("medio") || raw.includes("médio")) return "medio";
  if (raw.includes("grande")) return "grande";
  return atual || "mei";
}

function normalizarSociosReceita(qsa: any[] | undefined | null) {
  if (!Array.isArray(qsa)) return [];
  return qsa
    .map((s) => ({
      nome: s.nome_socio || s.nome || s.name || "",
      cpf_cnpj: onlyDigits(s.cnpj_cpf_do_socio || s.cpf_cnpj || s.documento || ""),
      qualificacao_socio: s.descricao_qualificacao_socio || s.qualificacao_socio || s.cargo || "Sócio",
      data_entrada: s.data_entrada_sociedade || s.data_entrada || null,
      pais: s.pais || null,
      representante_legal: s.representante_legal || null,
      nome_do_representante: s.nome_do_representante || null,
      dados_extra: s,
    }))
    .filter((s) => s.nome);
}

export default function DadosIncompletos() {
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [empresas, setEmpresas] = useState<Item[]>([]);
  const [clientesPf, setClientesPf] = useState<Item[]>([]);
  const [leads, setLeads] = useState<Item[]>([]);
  const [editando, setEditando] = useState<Item | null>(null);
  const [form, setForm] = useState<EditForm>({ nome: "", documento: "", email: "", telefone: "" });

  async function carregar() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (tipo !== "todos") p.set("tipo", tipo);
      if (busca.trim()) p.set("busca", busca.trim());
      const data = await apiFetch(`/api/cadastros-incompletos?${p.toString()}`);
      setEmpresas(Array.isArray(data?.empresas) ? data.empresas : []);
      setClientesPf(Array.isArray(data?.clientes_pf) ? data.clientes_pf : []);
      setLeads(Array.isArray(data?.leads) ? data.leads : []);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar cadastros incompletos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void carregar(), busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [busca, tipo]);

  const itens = useMemo(() => [...empresas, ...clientesPf, ...leads], [empresas, clientesPf, leads]);
  const totalDuplicados = itens.filter(i => i.arquivado_por_duplicidade || i.cadastro_status === "duplicado").length;
  const totalBloqueados = itens.filter(i => i.bloqueado_operacional).length;

  function abrirEdicao(item: Item) {
    setEditando(item);
    setForm({
      nome: item.nome || item.razao_social || item.empresa || "",
      documento: item.documento || "",
      email: item.email || "",
      telefone: item.telefone || "",
    });
  }

  async function salvarEdicao() {
    if (!editando) return;
    const key = `${editando.tipo}-${editando.id}`;
    setProcessando(key);
    try {
      if (editando.tipo === "empresa") {
        await apiFetch(`/api/empresas/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({ razao_social: form.nome, cnpj: form.documento, email: form.email, telefone: form.telefone }),
        });
      } else if (editando.tipo === "cliente_pf") {
        const atual = await apiFetch(`/api/clientes-pf/${editando.id}`);
        await apiFetch(`/api/clientes-pf/${editando.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...atual, nome: form.nome, cpf: form.documento, email: form.email, telefone: form.telefone }),
        });
      } else {
        await apiFetch(`/api/leads/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nome: form.nome, cpf_cnpj: form.documento, email: form.email, telefone: form.telefone }),
        });
      }
      await apiFetch(`/api/cadastros-incompletos/${editando.tipo}/${editando.id}/reprocessar`, { method: "PATCH" }).catch(() => null);
      toast.success("Cadastro editado e reprocessado.");
      setEditando(null);
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar cadastro");
    } finally {
      setProcessando(null);
    }
  }

  async function atualizarCadastro(item: Item) {
    const key = `${item.tipo}-${item.id}`;
    setProcessando(key);
    try {
      if (item.tipo === "empresa") {
        const cnpj = onlyDigits(item.documento);
        if (cnpj.length !== 14) throw new Error("Informe um CNPJ válido antes de sincronizar.");
        toast.loading("Consultando Receita/API CNPJ e salvando atualização...", { id: key });
        const res = await apiFetch(`/api/cnpj/${cnpj}`);
        const sociosReceita = normalizarSociosReceita(res?.qsa);
        const socio = sociosReceita[0];
        const payload: Record<string, any> = {
          razao_social: res.razao_social || item.nome,
          nome_fantasia: res.nome_fantasia || item.nome_fantasia || null,
          cnpj,
          email: res.email || item.email || null,
          telefone: telefoneReceita(res.ddd_telefone_1) || item.telefone || null,
          telefone_2: telefoneReceita(res.ddd_telefone_2) || null,
          cep: res.cep || null,
          logradouro: res.logradouro || null,
          numero: res.numero || null,
          complemento: res.complemento || null,
          bairro: res.bairro || null,
          cidade: res.municipio || null,
          estado: res.uf || null,
          porte: porteReceita(res),
          segmento: res.cnae_fiscal_descricao || null,
          inscricao_estadual: primeiraInscricaoEstadualReceita(res),
          natureza_juridica: res.natureza_juridica || null,
          capital_social: parseCapitalSocial(res.capital_social),
          cnae_principal: res.cnae_fiscal_descricao ? `${res.cnae_fiscal || ""} — ${res.cnae_fiscal_descricao}`.trim() : null,
          cnaes_secundarios: Array.isArray(res.cnaes_secundarios) ? res.cnaes_secundarios.map((c: any) => c.descricao ? `${c.codigo || c.cnae_fiscal || ""} — ${c.descricao || c.cnae_fiscal_descricao}`.trim() : String(c)).filter(Boolean) : [],
          data_abertura: res.data_inicio_atividade || null,
          situacao_cadastral: res.descricao_situacao_cadastral || null,
          data_situacao_cadastral: res.data_situacao_cadastral || null,
          motivo_situacao_cadastral: res.motivo_situacao_cadastral || null,
          regime_tributario: regimeTributarioReceita(res),
          matriz_filial: res.identificador_matriz_filial === 1 ? "Matriz" : res.identificador_matriz_filial === 2 ? "Filial" : res.descricao_identificador_matriz_filial || null,
          ultima_sincronizacao_receita: new Date().toISOString(),
          dados_extra_receita: {
            provedor_principal: res.provedor_principal || null,
            fontes_consulta: res.fontes_consulta || [],
            dados_fontes: res.dados_fontes || {},
            inscricoes_estaduais: res.inscricoes_estaduais || [],
            suframa: res.suframa || [],
            payload_normalizado: res,
          },
          responsavel_nome: socio?.nome || undefined,
          responsavel_cpf: socio?.cpf_cnpj || undefined,
          responsavel_cargo: socio?.qualificacao_socio || undefined,
        };
        await apiFetch(`/api/empresas/${item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        if (sociosReceita.length > 0) {
          await apiFetch(`/api/empresas/${item.id}/socios/bulk`, {
            method: "POST",
            body: JSON.stringify({ socios: sociosReceita, replace: true }),
          }).catch(() => null);
        }
        toast.success("Empresa sincronizada, salva e reprocessada.", { id: key });
      } else {
        await apiFetch(`/api/cadastros-incompletos/${item.tipo}/${item.id}/reprocessar`, { method: "PATCH" });
        toast.success("Cadastro reprocessado.");
      }
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar cadastro", { id: key });
    } finally {
      setProcessando(null);
    }
  }

  async function apagarCadastro(item: Item) {
    const nome = item.nome || item.razao_social || item.empresa || "cadastro";
    if (!confirm(`Apagar definitivamente este cadastro?\n\n${nome}\n${formatDoc(item.documento)}`)) return;
    const key = `${item.tipo}-${item.id}`;
    setProcessando(key);
    try {
      await apiFetch(`/api/cadastros-incompletos/${item.tipo}/${item.id}`, { method: "DELETE" });
      toast.success("Cadastro apagado/removido da lista.");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao apagar cadastro");
    } finally {
      setProcessando(null);
    }
  }

  async function removerDuplicados() {
    if (!confirm("Remover automaticamente todos os cadastros marcados como duplicados?")) return;
    setProcessando("duplicados");
    try {
      const res = await apiFetch(`/api/cadastros-incompletos/remover-duplicados`, { method: "POST" });
      toast.success(`Duplicados removidos: ${res?.total_removidos ?? 0}`);
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao remover duplicados");
    } finally {
      setProcessando(null);
    }
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                <ShieldAlert className="w-4 h-4" /> Área de saneamento cadastral
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">Cadastros incompletos</h1>
              <p className="text-sm text-slate-500 mt-1">
                Empresas, clientes PF e leads sem CPF/CNPJ, incompletos, desatualizados ou duplicados ficam aqui. Eles não aparecem nas telas principais e não podem ser usados em contrato, simulação ou operação.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={removerDuplicados} disabled={processando === "duplicados"} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                <Trash2 className="w-4 h-4" /> Remover duplicados
              </button>
              <button onClick={carregar} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
                <RefreshCw className="w-4 h-4" /> Atualizar lista
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border bg-white p-4"><p className="text-2xl font-black text-slate-900">{itens.length}</p><p className="text-xs text-slate-500">Total para saneamento</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-2xl font-black text-amber-600">{totalBloqueados}</p><p className="text-xs text-slate-500">Bloqueados operacionalmente</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-2xl font-black text-red-600">{totalDuplicados}</p><p className="text-xs text-slate-500">Duplicados encontrados</p></div>
          </div>

          <div className="rounded-2xl border bg-white p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, empresa, CPF ou CNPJ..." className="w-full pl-10 pr-4 h-11 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm bg-white">
              <option value="todos">Todos</option>
              <option value="empresas">Empresas</option>
              <option value="clientes_pf">Clientes PF</option>
              <option value="leads">Clientes/Leads</option>
            </select>
          </div>

          {loading ? (
            <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">Carregando...</div>
          ) : itens.length === 0 ? (
            <div className="rounded-2xl border bg-white p-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-3">✓</div>
              <h2 className="font-bold text-slate-900">Nenhum cadastro incompleto encontrado</h2>
              <p className="text-sm text-slate-500 mt-1">As telas de Empresas e Clientes estão exibindo somente registros completos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {itens.map((item) => {
                const Icon = tipoIcon[item.tipo] || AlertTriangle;
                const nome = item.nome || item.razao_social || item.empresa || "Sem nome";
                const pendencias = Array.isArray(item.cadastro_pendencias) ? item.cadastro_pendencias : [];
                const key = `${item.tipo}-${item.id}`;
                const busy = processando === key;
                return (
                  <div key={key} className="rounded-2xl border bg-white p-4 flex flex-col xl:flex-row xl:items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900 truncate">{nome}</h3>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">{tipoLabel[item.tipo] || item.tipo}</span>
                        {(item.arquivado_por_duplicidade || item.cadastro_status === "duplicado") && <span className="text-[11px] px-2 py-1 rounded-full bg-red-50 text-red-700 font-semibold">Duplicado</span>}
                        {item.bloqueado_operacional && <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">Bloqueado</span>}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{formatDoc(item.documento)} {item.email ? `• ${item.email}` : ""} {item.telefone ? `• ${item.telefone}` : ""}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {pendencias.length ? pendencias.map((p) => <span key={p} className="text-xs px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">{p}</span>) : <span className="text-xs px-2 py-1 rounded-lg bg-slate-50 text-slate-600">Pendente de revisão</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap xl:flex-col gap-2 xl:w-40 shrink-0">
                      <button disabled={busy} onClick={() => abrirEdicao(item)} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60">
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button disabled={busy} onClick={() => atualizarCadastro(item)} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 disabled:opacity-60">
                        <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Atualizar
                      </button>
                      <button disabled={busy} onClick={() => apagarCadastro(item)} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-60">
                        <Trash2 className="w-3.5 h-3.5" /> Apagar
                      </button>
                      <div className="text-[11px] text-slate-400 xl:text-right pt-1">Atualizado em<br />{formatDate(item.updated_at || item.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-bold text-slate-900">Editar cadastro incompleto</h2>
                <p className="text-xs text-slate-500">Após salvar, o cadastro será reprocessado automaticamente.</p>
              </div>
              <button onClick={() => setEditando(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Nome / Razão social</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">CPF/CNPJ</label>
                <input value={form.documento} onChange={e => setForm(f => ({ ...f, documento: e.target.value }))} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">E-mail</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Telefone</label>
                  <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm" />
                </div>
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-2">
              <button onClick={() => setEditando(null)} className="px-4 py-2 rounded-xl border text-sm font-semibold">Cancelar</button>
              <button onClick={salvarEdicao} disabled={!!processando} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-60">
                <Save className="w-4 h-4" /> Salvar e reprocessar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
