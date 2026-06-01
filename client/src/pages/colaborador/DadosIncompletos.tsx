import { useEffect, useMemo, useState } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { AlertTriangle, Building2, RefreshCw, Search, UserCheck, Users, ShieldAlert } from "lucide-react";

type Item = {
  id: string;
  tipo: "empresa" | "cliente_pf" | "lead";
  nome?: string;
  razao_social?: string;
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

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function formatDoc(value?: string) {
  const d = String(value || "").replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return value || "Documento não informado";
}

export default function DadosIncompletos() {
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [empresas, setEmpresas] = useState<Item[]>([]);
  const [clientesPf, setClientesPf] = useState<Item[]>([]);
  const [leads, setLeads] = useState<Item[]>([]);

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
  const totalDuplicados = itens.filter(i => i.arquivado_por_duplicidade).length;
  const totalBloqueados = itens.filter(i => i.bloqueado_operacional || !i.arquivado_por_duplicidade).length;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                <ShieldAlert className="w-4 h-4" /> Área de saneamento cadastral
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">Dados cadastrais incompletos/desatualizados</h1>
              <p className="text-sm text-slate-500 mt-1">
                Registros sem CPF/CNPJ válido, incompletos ou duplicados ficam bloqueados aqui e não aparecem nas telas operacionais.
              </p>
            </div>
            <button onClick={carregar} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
              <RefreshCw className="w-4 h-4" /> Atualizar lista
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border bg-white p-4"><p className="text-2xl font-black text-slate-900">{itens.length}</p><p className="text-xs text-slate-500">Total para saneamento</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-2xl font-black text-amber-600">{totalBloqueados}</p><p className="text-xs text-slate-500">Bloqueados operacionalmente</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-2xl font-black text-red-600">{totalDuplicados}</p><p className="text-xs text-slate-500">Arquivados por duplicidade</p></div>
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
                return (
                  <div key={`${item.tipo}-${item.id}`} className="rounded-2xl border bg-white p-4 flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900 truncate">{nome}</h3>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">{tipoLabel[item.tipo] || item.tipo}</span>
                        {item.arquivado_por_duplicidade && <span className="text-[11px] px-2 py-1 rounded-full bg-red-50 text-red-700 font-semibold">Duplicado arquivado</span>}
                        {item.bloqueado_operacional && <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-semibold">Bloqueado para operação</span>}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{formatDoc(item.documento)} {item.email ? `• ${item.email}` : ""} {item.telefone ? `• ${item.telefone}` : ""}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {pendencias.length ? pendencias.map((p) => <span key={p} className="text-xs px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">{p}</span>) : <span className="text-xs px-2 py-1 rounded-lg bg-slate-50 text-slate-600">Pendente de revisão</span>}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 lg:text-right shrink-0">
                      Atualizado em<br />{formatDate(item.updated_at || item.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
