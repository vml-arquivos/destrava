import { useState, useEffect } from 'react';
import { FileText, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import Layout from './Layout';
import { FormGerarContrato } from '../../components/contratos/FormGerarContrato';
import { ListaContratos } from '../../components/contratos/ListaContratos';

interface Empresa {
  id: string;
  razao_social: string;
  cnpj?: string;
}

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
}

interface Contrato {
  id: string;
  empresa_id: string;
  parceiro_nome?: string;
  valor_referencia: number;
  taxa_comissao: number;
  data_assinatura: string;
  foro_eleito: string;
  status: 'gerado' | 'assinado' | 'cancelado';
  created_at: string;
  pdf_path?: string;
}

export default function GeradorContratos() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingContratos, setLoadingContratos] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'gerar' | 'lista' | 'parceiros'>('gerar');

  // Novo parceiro
  const [novoParceiro, setNovoParceiro] = useState({ nome: '', cpf: '', email: '', telefone: '' });
  const [salvandoParceiro, setSalvandoParceiro] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/empresas?limit=500'),
      apiFetch('/api/parceiros'),
    ]).then(([emp, par]: any[]) => {
      setEmpresas(Array.isArray(emp) ? emp : emp.empresas || []);
      setParceiros(Array.isArray(par) ? par : []);
    }).catch(() => toast.error('Erro ao carregar dados'));
  }, []);

  const carregarContratos = async (empresaId: string) => {
    if (!empresaId) { setContratos([]); return; }
    setLoadingContratos(true);
    try {
      const data: Contrato[] = await apiFetch(`/api/contratos/empresa/${empresaId}`);
      setContratos(data);
    } catch {
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoadingContratos(false);
    }
  };

  const handleEmpresaFiltroChange = (id: string) => {
    setEmpresaFiltro(id);
    carregarContratos(id);
  };

  const handleGerarContrato = async (data: any) => {
    setLoading(true);
    try {
      const result: any = await apiFetch('/api/contratos/gerar', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      toast.success('Contrato gerado com sucesso! Baixando PDF...');

      // Download automático
      const token = localStorage.getItem('destrava_token');
      const response = await fetch(`/api/contratos/${result.contrato_id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato-${result.contrato_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      // Recarregar lista se a empresa selecionada for a mesma
      if (empresaFiltro === data.empresa_id) {
        carregarContratos(empresaFiltro);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar contrato');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (id: string, status: string) => {
    setContratos(prev => prev.map(c => c.id === id ? { ...c, status: status as any } : c));
  };

  const handleSalvarParceiro = async () => {
    if (!novoParceiro.nome || !novoParceiro.cpf) {
      toast.error('Nome e CPF são obrigatórios');
      return;
    }
    setSalvandoParceiro(true);
    try {
      const novo: Parceiro = await apiFetch('/api/parceiros', {
        method: 'POST',
        body: JSON.stringify(novoParceiro),
      });
      setParceiros(prev => [...prev, novo]);
      setNovoParceiro({ nome: '', cpf: '', email: '', telefone: '' });
      toast.success('Parceiro cadastrado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar parceiro');
    } finally {
      setSalvandoParceiro(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gerador de Contratos</h1>
            <p className="text-sm text-gray-500">Gere contratos PDF de assessoria de crédito</p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: 'gerar', label: 'Gerar Contrato', icon: FileText },
            { key: 'lista', label: 'Contratos por Empresa', icon: FileText },
            { key: 'parceiros', label: 'Parceiros', icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAbaAtiva(key as any)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Aba: Gerar Contrato */}
        {abaAtiva === 'gerar' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Novo Contrato</h2>
            <FormGerarContrato
              empresas={empresas}
              parceiros={parceiros}
              onSubmit={handleGerarContrato}
              loading={loading}
            />
          </div>
        )}

        {/* Aba: Lista de contratos */}
        {abaAtiva === 'lista' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Contratos por Empresa</h2>
            <select
              value={empresaFiltro}
              onChange={e => handleEmpresaFiltroChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione uma empresa para ver os contratos...</option>
              {empresas.map(e => (
                <option key={e.id} value={e.id}>
                  {e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ''}
                </option>
              ))}
            </select>
            {loadingContratos ? (
              <div className="text-center py-6 text-gray-400 text-sm">Carregando contratos...</div>
            ) : (
              <ListaContratos contratos={contratos} onStatusChange={handleStatusChange} />
            )}
          </div>
        )}

        {/* Aba: Parceiros */}
        {abaAtiva === 'parceiros' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Cadastrar Parceiro
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
                  <input
                    type="text"
                    value={novoParceiro.nome}
                    onChange={e => setNovoParceiro(p => ({ ...p, nome: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CPF *</label>
                  <input
                    type="text"
                    value={novoParceiro.cpf}
                    onChange={e => setNovoParceiro(p => ({ ...p, cpf: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={novoParceiro.email}
                    onChange={e => setNovoParceiro(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={novoParceiro.telefone}
                    onChange={e => setNovoParceiro(p => ({ ...p, telefone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(61) 99999-9999"
                  />
                </div>
              </div>
              <button
                onClick={handleSalvarParceiro}
                disabled={salvandoParceiro}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {salvandoParceiro ? 'Salvando...' : 'Cadastrar Parceiro'}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-800 mb-3">Parceiros Cadastrados</h2>
              {parceiros.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum parceiro cadastrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-600">Nome</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">CPF</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">E-mail</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">Telefone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parceiros.map(p => (
                        <tr key={p.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 font-medium text-gray-900">{p.nome}</td>
                          <td className="py-2 px-3 text-gray-600">{p.cpf}</td>
                          <td className="py-2 px-3 text-gray-600">{(p as any).email || '—'}</td>
                          <td className="py-2 px-3 text-gray-600">{(p as any).telefone || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
