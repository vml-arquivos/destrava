import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, User, Search } from 'lucide-react';
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
}

const EMPTY_FORM: Omit<ClientePF, 'id' | 'created_at' | 'ativo'> = {
  nome: '', cpf: '', rg: '', data_nascimento: '', email: '',
  telefone: '', endereco: '', cidade: '', uf: '', cep: '',
  profissao: '', estado_civil: '', observacoes: '',
};

const cls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

export default function ClientesPF() {
  const [clientes, setClientes]     = useState<ClientePF[]>([]);
  const [loading, setLoading]       = useState(true);
  const [salvando, setSalvando]     = useState(false);
  const [busca, setBusca]           = useState('');
  const [editando, setEditando]     = useState<ClientePF | null>(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm]             = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });

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
      toast.success('Cliente desativado');
    } catch {
      toast.error('Erro ao desativar cliente');
    }
  };

  const buscaLower = busca.toLowerCase();
  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(buscaLower) ||
    c.cpf.includes(busca) ||
    (c.email || '').toLowerCase().includes(buscaLower) ||
    (c.telefone || '').includes(busca)
  );

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Clientes Pessoa Física</h1>
              <p className="text-sm text-gray-500">Cadastro de clientes PF para contratos (Limpa Nome, etc.)</p>
            </div>
          </div>
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Novo Cliente PF
          </button>
        </div>

        {/* Formulário */}
        {mostraForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">
              {editando ? `Editar: ${editando.nome}` : 'Novo Cliente PF'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className={lbl}>Nome Completo *</label>
                <input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className={cls} placeholder="Nome completo" />
              </div>
              <div>
                <label className={lbl}>CPF *</label>
                <input type="text" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
                  className={cls} placeholder="000.000.000-00" />
              </div>
              <div>
                <label className={lbl}>RG</label>
                <input type="text" value={form.rg} onChange={e => setForm(f => ({ ...f, rg: e.target.value }))}
                  className={cls} placeholder="00.000.000-0" />
              </div>
              <div>
                <label className={lbl}>Data de Nascimento</label>
                <input type="date" value={form.data_nascimento} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))}
                  className={cls} />
              </div>
              <div>
                <label className={lbl}>Estado Civil</label>
                <select value={form.estado_civil} onChange={e => setForm(f => ({ ...f, estado_civil: e.target.value }))} className={cls}>
                  <option value="">Selecione...</option>
                  {['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'].map(v => (
                    <option key={v} value={v.toLowerCase()}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Profissão</label>
                <input type="text" value={form.profissao} onChange={e => setForm(f => ({ ...f, profissao: e.target.value }))}
                  className={cls} placeholder="Ex: empresário(a)" />
              </div>
              <div>
                <label className={lbl}>E-mail</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className={cls} placeholder="email@exemplo.com" />
              </div>
              <div>
                <label className={lbl}>Telefone</label>
                <input type="text" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                  className={cls} placeholder="(61) 99999-9999" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={lbl}>Endereço</label>
                <input type="text" value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                  className={cls} placeholder="Rua, número, complemento, bairro" />
              </div>
              <div>
                <label className={lbl}>Cidade</label>
                <input type="text" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                  className={cls} placeholder="Brasília" />
              </div>
              <div>
                <label className={lbl}>UF</label>
                <select value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value }))} className={cls}>
                  <option value="">UF</option>
                  {['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>CEP</label>
                <input type="text" value={form.cep} onChange={e => setForm(f => ({ ...f, cep: e.target.value }))}
                  className={cls} placeholder="72000-000" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={lbl}>Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  className={cls} rows={2} placeholder="Informações adicionais..." />
              </div>
            </div>
            <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
              <button onClick={handleSalvar} disabled={salvando}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {salvando ? 'Salvando...' : (editando ? 'Salvar Alterações' : 'Cadastrar Cliente')}
              </button>
              <button onClick={fecharForm}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Busca + Lista */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              className="flex-1 text-sm outline-none placeholder-gray-400"
              placeholder="Buscar por nome, CPF, e-mail ou telefone..." />
            <span className="text-xs text-gray-400">{filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{busca ? 'Nenhum resultado para a busca' : 'Nenhum cliente PF cadastrado'}</p>
              {!busca && <button onClick={abrirNovo} className="mt-2 text-sm text-blue-600 hover:underline">Cadastrar primeiro cliente</button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    <th className="py-3 px-4 font-medium text-gray-600">Nome</th>
                    <th className="py-3 px-4 font-medium text-gray-600">CPF</th>
                    <th className="py-3 px-4 font-medium text-gray-600 hidden md:table-cell">Telefone</th>
                    <th className="py-3 px-4 font-medium text-gray-600 hidden lg:table-cell">Cidade/UF</th>
                    <th className="py-3 px-4 font-medium text-gray-600 hidden lg:table-cell">Profissão</th>
                    <th className="py-3 px-4 text-right font-medium text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtrados.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">{c.nome}</td>
                      <td className="py-3 px-4 text-gray-600 font-mono text-xs">{c.cpf}</td>
                      <td className="py-3 px-4 text-gray-600 hidden md:table-cell">{c.telefone || '—'}</td>
                      <td className="py-3 px-4 text-gray-600 hidden lg:table-cell">
                        {c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade || c.uf || '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-600 hidden lg:table-cell">{c.profissao || '—'}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => abrirEditar(c)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleExcluir(c.id, c.nome)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Desativar">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
