import { useState, useEffect } from 'react';
import { FileText, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, getToken } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import Layout from './Layout';
import { FormGerarContrato } from '../../components/contratos/FormGerarContrato';
import { ListaContratos } from '../../components/contratos/ListaContratos';

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  email?: string;
  telefone?: string;
}

interface Contrato {
  id: string;
  tipo_contrato?: string;
  empresa_id?: string;
  lead_id?: string;
  parceiro_id?: string;
  parceiro_nome?: string;
  empresa_nome?: string;
  lead_nome?: string;
  valor_referencia?: number;
  valor_contrato?: number;
  taxa_comissao?: number;
  data_assinatura: string;
  foro_eleito: string;
  status: 'gerado' | 'assinado' | 'cancelado';
  created_at: string;
  pdf_path?: string;
  criado_por_nome?: string;
}

export default function GeradorContratos() {
  const { colaborador } = useAuth();
  const userCargo = colaborador?.cargo;

  const [contratos, setContratos]         = useState<Contrato[]>([]);
  const [parceiros, setParceiros]         = useState<Parceiro[]>([]);
  const [loading, setLoading]             = useState(false);
  const [loadingContratos, setLoadingContratos] = useState(false);
  const [abaAtiva, setAbaAtiva]           = useState<'gerar' | 'lista' | 'parceiros'>('gerar');

  // Novo parceiro
  const [novoParceiro, setNovoParceiro]   = useState({ nome: '', cpf: '', email: '', telefone: '' });
  const [salvandoParceiro, setSalvandoParceiro] = useState(false);

  // Carrega parceiros para a aba de gestão
  useEffect(() => {
    apiFetch('/api/parceiros')
      .then((par: any) => setParceiros(Array.isArray(par) ? par : par?.parceiros || []))
      .catch(() => { /* silencioso — parceiros são opcionais */ });
  }, []);

  const carregarContratos = async () => {
    setLoadingContratos(true);
    try {
      const data: Contrato[] = await apiFetch('/api/contratos');
      setContratos(data);
    } catch {
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoadingContratos(false);
    }
  };

  useEffect(() => {
    if (abaAtiva === 'lista') {
      void carregarContratos();
    }
  }, [abaAtiva]);

  // Gera contrato PDF diretamente (todos os tipos)
  const handleGerarContrato = async (formData: any) => {
    setLoading(true);
    try {
      const result: any = await apiFetch('/api/contratos/gerar', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      const tipoLabel: Record<string, string> = {
        assessoria:         'Assessoria Empresarial',
        limpa_nome:         'Limpa Nome',
        limpa_bacen:        'Limpa BACEN',
        rating:             'Rating',
        parceria_comercial: 'Parceria Comercial',
      };
      const tipo = tipoLabel[formData.tipo_contrato] || formData.tipo_contrato;
      toast.success(`Contrato ${tipo} gerado! Baixando PDF...`);

      // Download automático
      const token = getToken();
      const response = await fetch(`/api/contratos/${result.contrato_id}/download`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato-${formData.tipo_contrato}-${result.contrato_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar contrato');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (id: string, status: string) => {
    setContratos(prev => prev.map(c => c.id === id ? { ...c, status: status as any } : c));
  };

  const handleDelete = (id: string) => {
    setContratos(prev => prev.filter(c => c.id !== id));
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
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gerador de Contratos</h1>
            <p className="text-sm text-gray-500">Gere contratos PDF com papel timbrado da Destrava Crédito</p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: 'gerar',     label: 'Gerar Contrato',   icon: FileText },
            { key: 'lista',     label: 'Lista de Contratos', icon: FileText },
            { key: 'parceiros', label: 'Parceiros',          icon: Users },
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
            <h2 className="font-semibold text-gray-800 mb-1">Novo Contrato</h2>
            <p className="text-xs text-gray-400 mb-4">
              Preencha os dados e clique em "Gerar Contrato PDF" para gerar e baixar o documento.
            </p>
            <FormGerarContrato
              onSubmit={handleGerarContrato}
              loading={loading}
              userCargo={userCargo}
            />
          </div>
        )}

        {/* Aba: Lista de Contratos */}
        {abaAtiva === 'lista' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Contratos Gerados</h2>
              <button
                onClick={() => void carregarContratos()}
                disabled={loadingContratos}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {loadingContratos ? 'Carregando...' : 'Atualizar lista'}
              </button>
            </div>
            {loadingContratos ? (
              <div className="text-center py-6 text-gray-400 text-sm">Carregando contratos...</div>
            ) : (
              <ListaContratos
                contratos={contratos}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                userCargo={userCargo}
              />
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
                  <input type="text" value={novoParceiro.nome}
                    onChange={e => setNovoParceiro(p => ({ ...p, nome: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nome completo" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CPF *</label>
                  <input type="text" value={novoParceiro.cpf}
                    onChange={e => setNovoParceiro(p => ({ ...p, cpf: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                  <input type="email" value={novoParceiro.email}
                    onChange={e => setNovoParceiro(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@exemplo.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
                  <input type="text" value={novoParceiro.telefone}
                    onChange={e => setNovoParceiro(p => ({ ...p, telefone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(61) 99999-9999" />
                </div>
              </div>
              <button onClick={handleSalvarParceiro} disabled={salvandoParceiro}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
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
                          <td className="py-2 px-3 text-gray-600">{p.email || '—'}</td>
                          <td className="py-2 px-3 text-gray-600">{p.telefone || '—'}</td>
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
