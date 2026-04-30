import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, BookUser, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import Layout from './Layout';

interface Contador {
  id: string;
  nome: string;
  cpf: string;
  crc: string;
  email?: string;
  telefone?: string;
  nome_escritorio?: string;
  cnpj_escritorio?: string;
  endereco_escritorio?: string;
  cidade_escritorio?: string;
  uf_escritorio?: string;
  ativo: boolean;
  created_at: string;
}

const EMPTY_FORM: Omit<Contador, 'id' | 'created_at'> = {
  nome: '',
  cpf: '',
  crc: '',
  email: '',
  telefone: '',
  nome_escritorio: '',
  cnpj_escritorio: '',
  endereco_escritorio: '',
  cidade_escritorio: '',
  uf_escritorio: '',
  ativo: true,
};

function formatCpf(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14);
}
function formatCnpj(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').slice(0, 18);
}
function formatTel(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

export default function Contadores() {
  const [contadores, setContadores] = useState<Contador[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Contador | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      const data: Contador[] = await apiFetch('/api/contadores');
      setContadores(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar contadores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => {
    setEditando(null);
    setForm({ ...EMPTY_FORM });
    setModalAberto(true);
  };

  const abrirEditar = (c: Contador) => {
    setEditando(c);
    setForm({
      nome: c.nome,
      cpf: c.cpf,
      crc: c.crc,
      email: c.email || '',
      telefone: c.telefone || '',
      nome_escritorio: c.nome_escritorio || '',
      cnpj_escritorio: c.cnpj_escritorio || '',
      endereco_escritorio: c.endereco_escritorio || '',
      cidade_escritorio: c.cidade_escritorio || '',
      uf_escritorio: c.uf_escritorio || '',
      ativo: c.ativo,
    });
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setEditando(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleChange = (campo: string, valor: string | boolean) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
  };

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!form.cpf.trim()) { toast.error('CPF é obrigatório'); return; }
    if (!form.crc.trim()) { toast.error('CRC é obrigatório'); return; }

    setSalvando(true);
    try {
      if (editando) {
        await apiFetch(`/api/contadores/${editando.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        toast.success('Contador atualizado com sucesso');
      } else {
        await apiFetch('/api/contadores', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        toast.success('Contador cadastrado com sucesso');
      }
      fecharModal();
      carregar();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar contador');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id: string) => {
    if (!confirm('Confirma a exclusão deste contador?')) return;
    setExcluindo(id);
    try {
      await apiFetch(`/api/contadores/${id}`, { method: 'DELETE' });
      toast.success('Contador excluído');
      carregar();
    } catch {
      toast.error('Erro ao excluir contador');
    } finally {
      setExcluindo(null);
    }
  };

  const filtrados = contadores.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    c.cpf.includes(busca) ||
    c.crc.toLowerCase().includes(busca.toLowerCase()) ||
    (c.nome_escritorio || '').toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <Layout title="Contadores">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <BookUser className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Contadores</h1>
              <p className="text-sm text-gray-500">Cadastro de contadores parceiros para emissão de declarações</p>
            </div>
          </div>
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Contador
          </button>
        </div>

        {/* Busca */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <input
            type="text"
            placeholder="Buscar por nome, CPF, CRC ou escritório..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <BookUser className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">{busca ? 'Nenhum contador encontrado para essa busca' : 'Nenhum contador cadastrado'}</p>
              {!busca && (
                <button onClick={abrirNovo} className="mt-3 text-sm text-blue-600 hover:underline">
                  Cadastrar o primeiro contador
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Nome</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">CPF</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">CRC</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Escritório</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Contato</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtrados.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.cpf}</td>
                      <td className="px-4 py-3 text-gray-600">{c.crc}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                        {c.nome_escritorio || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                        {c.email || c.telefone ? (
                          <div>
                            {c.email && <div className="text-xs">{c.email}</div>}
                            {c.telefone && <div className="text-xs text-gray-400">{c.telefone}</div>}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.ativo ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => abrirEditar(c)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleExcluir(c.id)}
                            disabled={excluindo === c.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Excluir"
                          >
                            {excluindo === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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

      {/* Modal de cadastro/edição */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {editando ? 'Editar Contador' : 'Novo Contador'}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Preencha os dados do contador parceiro
              </p>
            </div>
            <div className="p-6 space-y-5">
              {/* Dados pessoais */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Dados Pessoais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo *</label>
                    <input
                      type="text"
                      value={form.nome}
                      onChange={e => handleChange('nome', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nome do contador"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CPF *</label>
                    <input
                      type="text"
                      value={form.cpf}
                      onChange={e => handleChange('cpf', formatCpf(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="000.000.000-00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CRC *</label>
                    <input
                      type="text"
                      value={form.crc}
                      onChange={e => handleChange('crc', e.target.value.toUpperCase())}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="DF-123456/O-5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => handleChange('email', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="contador@escritorio.com.br"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={form.telefone}
                      onChange={e => handleChange('telefone', formatTel(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="(61) 99999-9999"
                    />
                  </div>
                </div>
              </div>

              {/* Dados do escritório */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Escritório de Contabilidade</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome do escritório</label>
                    <input
                      type="text"
                      value={form.nome_escritorio}
                      onChange={e => handleChange('nome_escritorio', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Escritório de Contabilidade XYZ"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ do escritório</label>
                    <input
                      type="text"
                      value={form.cnpj_escritorio}
                      onChange={e => handleChange('cnpj_escritorio', formatCnpj(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Endereço</label>
                    <input
                      type="text"
                      value={form.endereco_escritorio}
                      onChange={e => handleChange('endereco_escritorio', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="SCS Quadra 2, Bloco C, Sala 301"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
                    <input
                      type="text"
                      value={form.cidade_escritorio}
                      onChange={e => handleChange('cidade_escritorio', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Brasília"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">UF</label>
                    <select
                      value={form.uf_escritorio}
                      onChange={e => handleChange('uf_escritorio', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione</option>
                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={form.ativo}
                  onChange={e => handleChange('ativo', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="ativo" className="text-sm text-gray-700 font-medium">
                  Contador ativo (disponível para seleção nas declarações)
                </label>
              </div>
            </div>

            {/* Rodapé do modal */}
            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                onClick={fecharModal}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={salvando}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editando ? 'Salvar alterações' : 'Cadastrar contador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
