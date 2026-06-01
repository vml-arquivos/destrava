import { useState, useEffect } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, User, Search,
  Phone, Mail, MapPin, Briefcase, Calendar,
  ChevronRight, X, FileText, Clock, AlertCircle,
  CheckCircle, UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import Layout from './Layout';

// ─── Tipos ────────────────────────────────────────────────────────────────────
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
}

const EMPTY_FORM: Omit<ClientePF, 'id' | 'created_at' | 'ativo'> = {
  nome: '', cpf: '', rg: '', data_nascimento: '', email: '',
  telefone: '', endereco: '', cidade: '', uf: '', cep: '',
  profissao: '', estado_civil: '', observacoes: '',
};

const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'];
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const cls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const fmtNasc = (d?: string) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};

const onlyDigits = (v: string) => String(v || '').replace(/\D/g, '');
const formatCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ClientesPF() {
  const [clientes, setClientes]           = useState<ClientePF[]>([]);
  const [loading, setLoading]             = useState(true);
  const [salvando, setSalvando]           = useState(false);
  const [busca, setBusca]                 = useState('');
  const [editando, setEditando]           = useState<ClientePF | null>(null);
  const [mostraForm, setMostraForm]       = useState(false);
  const [selecionado, setSelecionado]     = useState<ClientePF | null>(null);
  const [form, setForm]                   = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });

  // ── Carregar ──────────────────────────────────────────────────────────────
  const carregarClientes = async () => {
    setLoading(true);
    try {
      const data: ClientePF[] = await apiFetch('/api/clientes-pf');
      setClientes(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar clientes PF');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void carregarClientes(); }, []);

  // ── Formulário ────────────────────────────────────────────────────────────
  const abrirNovo = () => {
    setEditando(null);
    setForm({ ...EMPTY_FORM });
    setMostraForm(true);
    setSelecionado(null);
  };

  const abrirEditar = (c: ClientePF) => {
    setEditando(c);
    setForm({
      nome: c.nome, cpf: c.cpf, rg: c.rg || '',
      data_nascimento: c.data_nascimento?.slice(0, 10) || '',
      email: c.email || '', telefone: c.telefone || '',
      endereco: c.endereco || '', cidade: c.cidade || '',
      uf: c.uf || '', cep: c.cep || '',
      profissao: c.profissao || '', estado_civil: c.estado_civil || '',
      observacoes: c.observacoes || '',
    });
    setMostraForm(true);
  };

  const fecharForm = () => { setMostraForm(false); setEditando(null); };

  const handleSalvar = async () => {
    if (!form.cpf.trim() || onlyDigits(form.cpf).length !== 11) {
      toast.error('CPF válido é obrigatório antes de cadastrar cliente');
      return;
    }
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        const atualizado: ClientePF = await apiFetch(`/api/clientes-pf/${editando.id}`, {
          method: 'PUT', body: JSON.stringify({ ...form, ativo: true }),
        });
        setClientes(prev => prev.map(c => c.id === atualizado.id ? atualizado : c));
        if (selecionado?.id === atualizado.id) setSelecionado(atualizado);
        toast.success('Cliente atualizado!');
      } else {
        const novo: ClientePF = await apiFetch('/api/clientes-pf', {
          method: 'POST', body: JSON.stringify(form),
        });
        setClientes(prev => [novo, ...prev]);
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
      if (selecionado?.id === id) setSelecionado(null);
      toast.success('Cliente desativado');
    } catch {
      toast.error('Erro ao desativar cliente');
    }
  };

  // ── Filtro ────────────────────────────────────────────────────────────────
  const buscaLower = busca.toLowerCase();
  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(buscaLower) ||
    c.cpf.includes(busca) ||
    (c.email || '').toLowerCase().includes(buscaLower) ||
    (c.telefone || '').includes(busca) ||
    (c.cidade || '').toLowerCase().includes(buscaLower)
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="flex h-full overflow-hidden">

        {/* ══ Painel principal (lista) ══════════════════════════════════════ */}
        <div className={`flex flex-col flex-1 overflow-hidden transition-all ${selecionado ? 'w-[55%]' : 'w-full'}`}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-white flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                <User className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Clientes Pessoa Física</h1>
                <p className="text-xs text-gray-500">
                  {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              onClick={abrirNovo}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Novo Cliente PF
            </button>
          </div>

          {/* Busca */}
          <div className="px-6 py-3 bg-white border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, CPF, e-mail, telefone ou cidade..."
                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              {busca && (
                <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
              </div>
            ) : filtrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <User className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">{busca ? 'Nenhum resultado para a busca' : 'Nenhum cliente PF cadastrado'}</p>
                {!busca && (
                  <button onClick={abrirNovo} className="mt-3 text-violet-600 text-sm hover:underline">
                    + Cadastrar primeiro cliente PF
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtrados.map(c => (
                  <div
                    key={c.id}
                    onClick={() => { setSelecionado(c); setMostraForm(false); }}
                    className={`flex items-center gap-3 px-6 py-3.5 hover:bg-violet-50/50 cursor-pointer transition-colors ${
                      selecionado?.id === c.id
                        ? 'bg-violet-50 border-l-4 border-l-violet-600'
                        : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {c.nome.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm truncate">{c.nome}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-medium">PF</span>
                        {!c.email && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium flex items-center gap-0.5">
                            <AlertCircle className="w-2.5 h-2.5" /> Sem e-mail
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span className="font-mono">{c.cpf}</span>
                        {c.telefone && <span>{c.telefone}</span>}
                        {c.cidade && c.uf && <span>{c.cidade}/{c.uf}</span>}
                      </div>
                    </div>

                    {/* Data + seta */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                      {c.profissao && (
                        <span className="text-xs text-gray-500 truncate max-w-[100px]">{c.profissao}</span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══ Painel de detalhes / formulário ══════════════════════════════ */}
        {(selecionado || mostraForm) && (
          <div className="flex-1 border-l bg-white flex flex-col overflow-hidden min-w-0">

            {/* ── Formulário de cadastro/edição ── */}
            {mostraForm ? (
              <>
                <div className="px-5 py-4 border-b bg-gradient-to-r from-violet-900 to-violet-700 text-white flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold">
                      {editando ? `Editar: ${editando.nome}` : 'Novo Cliente PF'}
                    </h2>
                    <p className="text-violet-200 text-xs mt-0.5">Pessoa Física • CPF obrigatório e único</p>
                  </div>
                  <button onClick={fecharForm} className="text-violet-200 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={lbl}>CPF * — primeiro dado obrigatório</label>
                      <input type="text" value={form.cpf}
                        onChange={e => setForm(f => ({ ...f, cpf: formatCPF(e.target.value) }))}
                        className={cls} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={lbl}>Nome Completo *</label>
                      <input type="text" value={form.nome}
                        onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                        className={cls} placeholder="Nome completo" />
                    </div>
                    <div>
                      <label className={lbl}>RG</label>
                      <input type="text" value={form.rg}
                        onChange={e => setForm(f => ({ ...f, rg: e.target.value }))}
                        className={cls} placeholder="00.000.000-0" />
                    </div>
                    <div>
                      <label className={lbl}>Data de Nascimento</label>
                      <input type="date" value={form.data_nascimento}
                        onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))}
                        className={cls} />
                    </div>
                    <div>
                      <label className={lbl}>Estado Civil</label>
                      <select value={form.estado_civil}
                        onChange={e => setForm(f => ({ ...f, estado_civil: e.target.value }))}
                        className={cls}>
                        <option value="">Selecione...</option>
                        {ESTADOS_CIVIS.map(v => (
                          <option key={v} value={v.toLowerCase()}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Profissão</label>
                      <input type="text" value={form.profissao}
                        onChange={e => setForm(f => ({ ...f, profissao: e.target.value }))}
                        className={cls} placeholder="Ex: empresário(a)" />
                    </div>
                    <div>
                      <label className={lbl}>E-mail</label>
                      <input type="email" value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        className={cls} placeholder="email@exemplo.com" />
                    </div>
                    <div>
                      <label className={lbl}>Telefone</label>
                      <input type="text" value={form.telefone}
                        onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                        className={cls} placeholder="(61) 99999-9999" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={lbl}>Endereço</label>
                      <input type="text" value={form.endereco}
                        onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                        className={cls} placeholder="Rua, número, complemento, bairro" />
                    </div>
                    <div>
                      <label className={lbl}>Cidade</label>
                      <input type="text" value={form.cidade}
                        onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                        className={cls} placeholder="Brasília" />
                    </div>
                    <div>
                      <label className={lbl}>UF</label>
                      <select value={form.uf}
                        onChange={e => setForm(f => ({ ...f, uf: e.target.value }))}
                        className={cls}>
                        <option value="">UF</option>
                        {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>CEP</label>
                      <input type="text" value={form.cep}
                        onChange={e => setForm(f => ({ ...f, cep: e.target.value }))}
                        className={cls} placeholder="72000-000" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={lbl}>Observações</label>
                      <textarea value={form.observacoes}
                        onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                        className={cls} rows={3} placeholder="Informações adicionais..." />
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 border-t bg-white flex gap-3 sticky bottom-0">
                  <button onClick={handleSalvar} disabled={salvando}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {salvando ? 'Salvando...' : (editando ? 'Salvar Alterações' : 'Cadastrar Cliente')}
                  </button>
                  <button onClick={fecharForm}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                    Cancelar
                  </button>
                </div>
              </>
            ) : selecionado ? (
              /* ── Painel de detalhes do cliente selecionado ── */
              <>
                {/* Header do cliente */}
                <div className="px-5 py-4 border-b bg-gradient-to-r from-violet-900 to-violet-700 text-white">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold truncate">{selecionado.nome}</h2>
                      {selecionado.profissao && (
                        <p className="text-violet-200 text-sm truncate">{selecionado.profissao}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/20 text-white">
                          Pessoa Física
                        </span>
                        {selecionado.estado_civil && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-violet-100 capitalize">
                            {selecionado.estado_civil}
                          </span>
                        )}
                        <span className="text-xs text-violet-200">
                          Desde {fmtDate(selecionado.created_at)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelecionado(null)}
                      className="text-violet-200 hover:text-white ml-3 flex-shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">

                  {/* Ações rápidas */}
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <div className="flex gap-2 flex-wrap">
                      {selecionado.telefone && (
                        <a
                          href={`https://wa.me/55${selecionado.telefone.replace(/\D/g, '')}?text=Olá ${selecionado.nome}, sou da Destrava Crédito!`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
                        >
                          💬 WhatsApp
                        </a>
                      )}
                      {selecionado.email && (
                        <a
                          href={`mailto:${selecionado.email}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                        >
                          📧 E-mail
                        </a>
                      )}
                      <button
                        onClick={() => abrirEditar(selecionado)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white text-gray-700 border rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                      <button
                        onClick={() => handleExcluir(selecionado.id, selecionado.nome)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Desativar
                      </button>
                    </div>
                  </div>

                  {/* Dados pessoais */}
                  <div className="px-4 py-4 border-b">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Dados Pessoais</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-400 text-xs block">CPF</span>
                        <p className="font-medium font-mono">{selecionado.cpf}</p>
                      </div>
                      {selecionado.rg && (
                        <div>
                          <span className="text-gray-400 text-xs block">RG</span>
                          <p className="font-medium font-mono">{selecionado.rg}</p>
                        </div>
                      )}
                      {selecionado.data_nascimento && (
                        <div>
                          <span className="text-gray-400 text-xs block">Data de Nascimento</span>
                          <p className="font-medium flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            {fmtNasc(selecionado.data_nascimento)}
                          </p>
                        </div>
                      )}
                      {selecionado.estado_civil && (
                        <div>
                          <span className="text-gray-400 text-xs block">Estado Civil</span>
                          <p className="font-medium capitalize">{selecionado.estado_civil}</p>
                        </div>
                      )}
                      {selecionado.profissao && (
                        <div>
                          <span className="text-gray-400 text-xs block">Profissão</span>
                          <p className="font-medium flex items-center gap-1">
                            <Briefcase className="w-3 h-3 text-gray-400" />
                            {selecionado.profissao}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contato */}
                  <div className="px-4 py-4 border-b">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contato</p>
                    <div className="space-y-2 text-sm">
                      {selecionado.telefone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="font-medium">{selecionado.telefone}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-orange-500">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-xs font-medium">Telefone não informado</span>
                        </div>
                      )}
                      {selecionado.email ? (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="font-medium truncate">{selecionado.email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-orange-500">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-xs font-medium">E-mail não informado</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Endereço */}
                  {(selecionado.endereco || selecionado.cidade || selecionado.uf) && (
                    <div className="px-4 py-4 border-b">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Endereço</p>
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          {selecionado.endereco && <p className="font-medium">{selecionado.endereco}</p>}
                          <p className="text-gray-600">
                            {[selecionado.cidade, selecionado.uf].filter(Boolean).join(' — ')}
                            {selecionado.cep ? ` · CEP ${selecionado.cep}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Observações */}
                  {selecionado.observacoes && (
                    <div className="px-4 py-4 border-b">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Observações</p>
                      <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                        {selecionado.observacoes}
                      </div>
                    </div>
                  )}

                  {/* Rodapé informativo */}
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Cadastrado em {fmtDate(selecionado.created_at)}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </Layout>
  );
}
