import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, User, Search, Phone, Mail, MapPin, ShieldCheck, Clock, Target, FileText, Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import Layout from './Layout';

interface ClientePF {
  id: string;
  nome: string;
  cpf: string;
  rg?: string;
  data_nascimento?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  profissao?: string;
  estado_civil?: string;
  observacoes?: string;
  ativo: boolean;
  created_at: string;
  origem?: string;
  status?: string;
  produto_interesse?: string;
  ultima_interacao?: string;
  proxima_acao?: string;
}

const EMPTY_FORM: Omit<ClientePF, 'id' | 'created_at' | 'ativo'> = {
  nome: '', cpf: '', rg: '', data_nascimento: '', email: '',
  telefone: '', endereco: '', cidade: '', uf: '', cep: '',
  profissao: '', estado_civil: '', observacoes: '', origem: 'manual', status: 'ativo',
  produto_interesse: '', proxima_acao: '',
};

const cls = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
const lbl = 'block text-xs font-bold text-slate-600 mb-1';

function origemLabel(cliente: ClientePF) {
  const raw = String(cliente.origem || '').trim().toLowerCase();
  if (!raw) return 'Manual';
  if (raw.includes('meta') || raw.includes('facebook') || raw.includes('instagram')) return 'Meta Ads';
  if (raw.includes('google')) return 'Google Ads';
  if (raw.includes('site')) return 'Site';
  if (raw.includes('simul')) return 'Simulador';
  if (raw.includes('whats')) return 'WhatsApp';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function origemTone(origem: string) {
  const v = origem.toLowerCase();
  if (v.includes('meta') || v.includes('google')) return 'bg-violet-50 text-violet-700 border-violet-200';
  if (v.includes('site') || v.includes('simul')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (v.includes('whats')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function initials(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'PF';
}

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

function MiniStat({ label, value, tone = 'slate' }: { label: string; value: string | number; tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'violet' }) {
  const palette = {
    slate: 'border-slate-200 bg-white text-slate-700',
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    violet: 'border-violet-100 bg-violet-50 text-violet-700',
  }[tone];
  return (
    <div className={`rounded-xl border px-3 py-2 ${palette}`}>
      <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-lg font-black leading-none">{value}</p>
    </div>
  );
}

export default function ClientesPF() {
  const [clientes, setClientes]     = useState<ClientePF[]>([]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState(false);
  const [busca, setBusca]           = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [editando, setEditando]     = useState<ClientePF | null>(null);
  const [selecionado, setSelecionado] = useState<ClientePF | null>(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm]             = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });

  const carregarClientes = async () => {
    setLoading(true);
    try {
      const data: ClientePF[] = await apiFetch('/api/clientes-pf');
      const lista = Array.isArray(data) ? data : [];
      setClientes(lista);
      setSelecionado(prev => prev || lista[0] || null);
    } catch {
      toast.error('Erro ao carregar clientes PF');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void carregarClientes(); }, []);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ ...EMPTY_FORM });
    setMostraForm(true);
  };

  const abrirEditar = (c: ClientePF) => {
    setEditando(c);
    setForm({
      nome: c.nome, cpf: c.cpf, rg: c.rg || '', data_nascimento: c.data_nascimento?.slice(0, 10) || '',
      email: c.email || '', telefone: c.telefone || '', endereco: c.endereco || '',
      cidade: c.cidade || '', uf: c.uf || '', cep: c.cep || '',
      profissao: c.profissao || '', estado_civil: c.estado_civil || '', observacoes: c.observacoes || '',
      origem: c.origem || 'manual', status: c.status || (c.ativo ? 'ativo' : 'inativo'),
      produto_interesse: c.produto_interesse || '', proxima_acao: c.proxima_acao || '',
    });
    setMostraForm(true);
  };

  const fecharForm = () => { setMostraForm(false); setEditando(null); };

  const handleSalvar = async () => {
    if (!form.nome.trim() || !form.cpf.trim()) {
      toast.error('Nome e CPF são obrigatórios');
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        const atualizado: ClientePF = await apiFetch(`/api/clientes-pf/${editando.id}`, {
          method: 'PUT', body: JSON.stringify({ ...form, ativo: true }),
        });
        setClientes(prev => prev.map(c => c.id === atualizado.id ? atualizado : c));
        setSelecionado(atualizado);
        toast.success('Cliente atualizado!');
      } else {
        const novo: ClientePF = await apiFetch('/api/clientes-pf', {
          method: 'POST', body: JSON.stringify(form),
        });
        setClientes(prev => [novo, ...prev]);
        setSelecionado(novo);
        toast.success('Cliente cadastrado!');
      }
      fecharForm();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar cliente');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id: string, nome: string) => {
    if (!confirm(`Desativar cliente "${nome}"?`)) return;
    try {
      await apiFetch(`/api/clientes-pf/${id}`, { method: 'DELETE' });
      setClientes(prev => prev.filter(c => c.id !== id));
      setSelecionado(prev => prev?.id === id ? null : prev);
      toast.success('Cliente desativado');
    } catch {
      toast.error('Erro ao desativar cliente');
    }
  };

  const buscaLower = busca.toLowerCase();
  const filtrados = clientes.filter(c => {
    const origem = origemLabel(c).toLowerCase();
    const matchesBusca =
      c.nome.toLowerCase().includes(buscaLower) ||
      c.cpf.includes(busca) ||
      (c.email || '').toLowerCase().includes(buscaLower) ||
      (c.telefone || '').includes(busca) ||
      origem.includes(buscaLower);
    const matchesOrigem = filtroOrigem === 'todos' || origem === filtroOrigem.toLowerCase();
    return matchesBusca && matchesOrigem;
  });

  const origens = Array.from(new Set(clientes.map(origemLabel))).sort();
  const comContato = clientes.filter(c => c.telefone || c.email).length;
  const deCampanha = clientes.filter(c => origemLabel(c) !== 'Manual').length;
  const incompletos = clientes.filter(c => !c.telefone || !c.email).length;

  return (
    <Layout>
      <div className="min-h-screen bg-[#f8f9fc]">
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><User className="h-5 w-5" /></div>
              <div>
                <h1 className="text-xl font-black text-slate-900">Central de Clientes PF</h1>
                <p className="text-xs text-slate-500">Clientes cadastrados, vindos de site/campanha ou usados em contratos PF.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MiniStat label="Total" value={clientes.length} tone="blue" />
              <MiniStat label="Com contato" value={comContato} tone="emerald" />
              <MiniStat label="Campanhas" value={deCampanha} tone="violet" />
              <MiniStat label="Incompletos" value={incompletos} tone="amber" />
              <button
                onClick={abrirNovo}
                className="ml-0 flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700 lg:ml-2"
              >
                <Plus className="h-4 w-4" /> Novo Cliente PF
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-[390px_1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    placeholder="Buscar por nome, CPF, telefone, origem..."
                  />
                  {busca && <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button>}
                </div>
                <div className="mt-2 flex gap-2">
                  <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)} className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="todos">Todas as origens</option>
                    {origens.map(o => <option key={o} value={o.toLowerCase()}>{o}</option>)}
                  </select>
                  <button onClick={() => void carregarClientes()} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                    <Filter className="h-4 w-4" /> {filtrados.length}
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
                {loading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                ) : filtrados.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                    <User className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    {busca ? 'Nenhum resultado para a busca' : 'Nenhum cliente PF cadastrado'}
                  </div>
                ) : filtrados.map(c => {
                  const ativo = selecionado?.id === c.id;
                  const origem = origemLabel(c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelecionado(c)}
                      className={`mb-2 w-full rounded-xl border p-3 text-left transition-all ${ativo ? 'border-blue-200 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white ${ativo ? 'bg-blue-600' : 'bg-slate-700'}`}>{initials(c.nome)}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-900">{c.nome}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">{c.cpf || 'CPF não informado'}{c.profissao ? ` · ${c.profissao}` : ''}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${origemTone(origem)}`}>{origem}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${c.telefone || c.email ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{c.telefone || c.email ? 'Com contato' : 'Contato pendente'}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="min-h-[520px] rounded-2xl border border-slate-200 bg-white shadow-sm">
              {!selecionado ? (
                <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-300"><User className="h-7 w-7" /></div>
                  <p className="text-sm font-bold text-slate-500">Selecione um cliente</p>
                  <p className="max-w-md text-xs text-slate-400">A lista à esquerda mostra clientes cadastrados manualmente e contatos vindos de campanhas/site quando a origem estiver disponível.</p>
                </div>
              ) : (
                <div>
                  <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm">{initials(selecionado.nome)}</div>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-black text-slate-900">{selecionado.nome}</h2>
                        <p className="mt-0.5 text-xs text-slate-500">CPF {selecionado.cpf || 'não informado'} · {origemLabel(selecionado)} · Cadastro em {fmtDate(selecionado.created_at)}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{selecionado.ativo ? 'Ativo' : 'Inativo'}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${origemTone(origemLabel(selecionado))}`}>{origemLabel(selecionado)}</span>
                          {selecionado.produto_interesse && <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{selecionado.produto_interesse}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => abrirEditar(selecionado)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><Pencil className="h-4 w-4" /> Editar</button>
                      <button onClick={() => handleExcluir(selecionado.id, selecionado.nome)} className="inline-flex items-center gap-2 rounded-xl border border-red-100 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Desativar</button>
                    </div>
                  </div>

                  <div className="grid gap-3 p-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><Phone className="mb-2 h-4 w-4 text-blue-600" /><p className="text-[10px] font-black uppercase text-blue-500">Telefone</p><p className="mt-1 text-sm font-black text-slate-900">{selecionado.telefone || 'Pendente'}</p></div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><Mail className="mb-2 h-4 w-4 text-emerald-600" /><p className="text-[10px] font-black uppercase text-emerald-500">E-mail</p><p className="mt-1 truncate text-sm font-black text-slate-900">{selecionado.email || 'Pendente'}</p></div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><MapPin className="mb-2 h-4 w-4 text-violet-600" /><p className="text-[10px] font-black uppercase text-violet-500">Cidade/UF</p><p className="mt-1 text-sm font-black text-slate-900">{[selecionado.cidade, selecionado.uf].filter(Boolean).join('/') || 'Pendente'}</p></div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><Target className="mb-2 h-4 w-4 text-amber-600" /><p className="text-[10px] font-black uppercase text-amber-500">Próxima ação</p><p className="mt-1 text-sm font-black text-slate-900">{selecionado.proxima_acao || (!selecionado.telefone ? 'Confirmar telefone' : 'Follow-up comercial')}</p></div>
                  </div>

                  <div className="grid gap-4 p-4 pt-0 lg:grid-cols-[1fr_360px]">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800"><FileText className="h-4 w-4 text-slate-400" /> Dados do cliente</h3>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div><p className="text-[10px] font-black uppercase text-slate-400">RG</p><p className="font-bold text-slate-700">{selecionado.rg || 'Não informado'}</p></div>
                        <div><p className="text-[10px] font-black uppercase text-slate-400">Nascimento</p><p className="font-bold text-slate-700">{fmtDate(selecionado.data_nascimento)}</p></div>
                        <div><p className="text-[10px] font-black uppercase text-slate-400">Estado civil</p><p className="font-bold text-slate-700">{selecionado.estado_civil || 'Não informado'}</p></div>
                        <div><p className="text-[10px] font-black uppercase text-slate-400">Profissão</p><p className="font-bold text-slate-700">{selecionado.profissao || 'Não informado'}</p></div>
                        <div className="sm:col-span-2"><p className="text-[10px] font-black uppercase text-slate-400">Endereço</p><p className="font-bold text-slate-700">{[selecionado.endereco, selecionado.cidade, selecionado.uf, selecionado.cep].filter(Boolean).join(' · ') || 'Não informado'}</p></div>
                        <div className="sm:col-span-2"><p className="text-[10px] font-black uppercase text-slate-400">Observações</p><p className="whitespace-pre-wrap text-slate-700">{selecionado.observacoes || 'Nenhuma observação cadastrada.'}</p></div>
                      </div>
                    </div>

                    <aside className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-800"><Clock className="h-4 w-4 text-slate-400" /> Operação</h3>
                        <div className="space-y-2 text-sm">
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-400">Origem</p><p className="font-bold text-slate-800">{origemLabel(selecionado)}</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-400">Última interação</p><p className="font-bold text-slate-800">{fmtDate(selecionado.ultima_interacao)}</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-400">Pendência</p><p className="font-bold text-slate-800">{!selecionado.telefone ? 'Telefone pendente' : !selecionado.email ? 'E-mail pendente' : 'Cadastro básico completo'}</p></div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-emerald-800"><ShieldCheck className="h-4 w-4" /> Próxima melhoria</h3>
                        <p className="text-xs leading-5 text-emerald-700">Conectar clientes PF aos leads/campanhas e contratos para preservar origem, histórico, próximos passos e conversão.</p>
                      </div>
                    </aside>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        {mostraForm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-black text-slate-900">{editando ? `Editar: ${editando.nome}` : 'Novo Cliente PF'}</h2>
                  <p className="text-xs text-slate-500">Use origem e próxima ação para manter clientes manuais, site e campanhas organizados.</p>
                </div>
                <button onClick={fecharForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
              <div className="overflow-y-auto p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2"><label className={lbl}>Nome Completo *</label><input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className={cls} placeholder="Nome completo" /></div>
                  <div><label className={lbl}>CPF *</label><input type="text" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} className={cls} placeholder="000.000.000-00" /></div>
                  <div><label className={lbl}>Origem</label><select value={form.origem || 'manual'} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))} className={cls}><option value="manual">Manual</option><option value="site">Site</option><option value="simulador">Simulador</option><option value="meta_ads">Meta Ads</option><option value="google_ads">Google Ads</option><option value="whatsapp">WhatsApp</option><option value="indicacao">Indicação</option></select></div>
                  <div><label className={lbl}>Produto/Serviço de interesse</label><input value={form.produto_interesse || ''} onChange={e => setForm(f => ({ ...f, produto_interesse: e.target.value }))} className={cls} placeholder="Limpa Nome, Bacen, contrato..." /></div>
                  <div><label className={lbl}>Próxima ação</label><input value={form.proxima_acao || ''} onChange={e => setForm(f => ({ ...f, proxima_acao: e.target.value }))} className={cls} placeholder="Ligar, pedir documentos..." /></div>
                  <div><label className={lbl}>RG</label><input type="text" value={form.rg} onChange={e => setForm(f => ({ ...f, rg: e.target.value }))} className={cls} /></div>
                  <div><label className={lbl}>Data de Nascimento</label><input type="date" value={form.data_nascimento} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))} className={cls} /></div>
                  <div><label className={lbl}>Estado Civil</label><input type="text" value={form.estado_civil} onChange={e => setForm(f => ({ ...f, estado_civil: e.target.value }))} className={cls} placeholder="Solteiro, casado..." /></div>
                  <div><label className={lbl}>Profissão</label><input type="text" value={form.profissao} onChange={e => setForm(f => ({ ...f, profissao: e.target.value }))} className={cls} placeholder="Profissão" /></div>
                  <div><label className={lbl}>E-mail</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={cls} placeholder="email@exemplo.com" /></div>
                  <div><label className={lbl}>Telefone</label><input type="text" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} className={cls} placeholder="(61) 99999-9999" /></div>
                  <div className="sm:col-span-2 lg:col-span-3"><label className={lbl}>Endereço</label><input type="text" value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} className={cls} placeholder="Rua, número, complemento, bairro" /></div>
                  <div><label className={lbl}>Cidade</label><input type="text" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} className={cls} placeholder="Brasília" /></div>
                  <div><label className={lbl}>UF</label><select value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value }))} className={cls}><option value="">UF</option>{['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(uf => <option key={uf} value={uf}>{uf}</option>)}</select></div>
                  <div><label className={lbl}>CEP</label><input type="text" value={form.cep} onChange={e => setForm(f => ({ ...f, cep: e.target.value }))} className={cls} placeholder="72000-000" /></div>
                  <div className="sm:col-span-2 lg:col-span-3"><label className={lbl}>Observações</label><textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} className={cls} rows={3} placeholder="Histórico, restrições, combinado com cliente..." /></div>
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
                <button onClick={fecharForm} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white">Cancelar</button>
                <button onClick={handleSalvar} disabled={salvando} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{salvando ? 'Salvando...' : (editando ? 'Salvar alterações' : 'Cadastrar cliente')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
