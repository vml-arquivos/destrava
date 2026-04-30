import { useState, useEffect } from 'react';
import { FileText, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import Layout from './Layout';
import { FormGerarContrato } from '../../components/contratos/FormGerarContrato';
import { ListaContratos } from '../../components/contratos/ListaContratos';
import { VisualizadorContrato } from '../../components/contratos/VisualizadorContrato';

interface Empresa {
  id: string;
  razao_social: string;
  cnpj?: string;
  endereco?: string;
  representante?: string;
  cpf_representante?: string;
}

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  email?: string;
  telefone?: string;
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

interface DadosPreVisualizacao {
  formData: any;
  empresa: Empresa;
  parceiro?: Parceiro;
}

export default function GeradorContratos() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingContratos, setLoadingContratos] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'gerar' | 'lista' | 'parceiros'>('gerar');

  // Visualizador
  const [preVisualizacao, setPreVisualizacao] = useState<DadosPreVisualizacao | null>(null);

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

  // PASSO 1: Formulário preenchido → abre visualizador (não gera PDF ainda)
  const handlePreVisualizar = async (formData: any) => {
    // Limpa Nome: gera PDF diretamente sem visualizador
    if (formData.tipo_contrato === 'limpa_nome') {
      setLoadingPdf(true);
      try {
        const result: any = await apiFetch('/api/contratos/gerar', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        toast.success('Contrato Limpa Nome gerado! Baixando PDF...');
        const token = localStorage.getItem('destrava_token');
        const response = await fetch(`/api/contratos/${result.contrato_id}/download`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contrato-limpa-nome-${result.contrato_id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: any) {
        toast.error(err.message || 'Erro ao gerar contrato Limpa Nome');
      } finally {
        setLoadingPdf(false);
      }
      return;
    }
    // Assessoria: abre visualizador
    const empresa = empresas.find(e => e.id === formData.empresa_id);
    if (!empresa) { toast.error('Empresa não encontrada'); return; }
    const parceiro = formData.parceiro_id
      ? parceiros.find(p => p.id === formData.parceiro_id)
      : undefined;
    setPreVisualizacao({ formData, empresa, parceiro });
  };

  // PASSO 2: Usuário revisou/editou no visualizador → gera PDF
  const handleGerarPdf = async (dadosEditados: any) => {
    setLoadingPdf(true);
    try {
      // Mescla dados editados no visualizador com o formData original
      const payload = {
        ...preVisualizacao!.formData,
        // Dados que podem ter sido editados no visualizador
        empresa_razao_social_override: dadosEditados.empresa_razao_social,
        empresa_cnpj_override: dadosEditados.empresa_cnpj,
        empresa_endereco_override: dadosEditados.empresa_endereco,
        empresa_representante_override: dadosEditados.empresa_representante,
        empresa_cpf_representante_override: dadosEditados.empresa_cpf_representante,
        parceiro_nome_override: dadosEditados.parceiro_nome,
        parceiro_cpf_override: dadosEditados.parceiro_cpf,
        foro_eleito: dadosEditados.foro_eleito,
        cidade_assinatura: dadosEditados.cidade_assinatura,
        data_assinatura: dadosEditados.data_assinatura,
      };

      const result: any = await apiFetch('/api/contratos/gerar', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success('Contrato gerado! Baixando PDF...');

      // Download automático
      const token = localStorage.getItem('destrava_token');
      const response = await fetch(`/api/contratos/${result.contrato_id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato-${preVisualizacao?.empresa.razao_social?.replace(/[^a-zA-Z0-9]/g, '-') || result.contrato_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setPreVisualizacao(null);

      if (empresaFiltro === preVisualizacao?.formData.empresa_id) {
        carregarContratos(empresaFiltro);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar contrato');
    } finally {
      setLoadingPdf(false);
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

  // Montar dados para o visualizador
  const dadosVisualizador = preVisualizacao ? {
    empresa_razao_social: preVisualizacao.empresa.razao_social || '',
    empresa_cnpj: preVisualizacao.empresa.cnpj || '',
    empresa_endereco: preVisualizacao.empresa.endereco || 'Endereço não informado',
    empresa_representante: preVisualizacao.empresa.representante || 'Representante não informado',
    empresa_cpf_representante: preVisualizacao.empresa.cpf_representante || '000.000.000-00',
    parceiro_nome: preVisualizacao.parceiro?.nome,
    parceiro_cpf: preVisualizacao.parceiro?.cpf,
    valor_referencia: preVisualizacao.formData.valor_referencia,
    taxa_comissao: preVisualizacao.formData.taxa_comissao,
    honorario_minimo_mes: 1,
    honorario_minimo_total: 12,
    data_assinatura: preVisualizacao.formData.data_assinatura,
    foro_eleito: preVisualizacao.formData.foro_eleito,
    cidade_assinatura: preVisualizacao.formData.foro_eleito?.split('/')[0] || 'Brasília',
  } : null;

  return (
    <>
      {/* Visualizador fullscreen — renderizado fora do Layout */}
      {preVisualizacao && dadosVisualizador && (
        <VisualizadorContrato
          dados={dadosVisualizador}
          onClose={() => setPreVisualizacao(null)}
          onGerarPdf={handleGerarPdf}
          loadingPdf={loadingPdf}
        />
      )}

      <Layout>
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          {/* Cabeçalho */}
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Gerador de Contratos</h1>
              <p className="text-sm text-gray-500">Visualize, edite e gere contratos PDF de assessoria de crédito</p>
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
              <h2 className="font-semibold text-gray-800 mb-1">Novo Contrato</h2>
              <p className="text-xs text-gray-400 mb-4">
                Preencha os dados e clique em "Visualizar Contrato" para revisar e editar antes de gerar o PDF.
              </p>
              <FormGerarContrato
                onSubmit={handlePreVisualizar}
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
    </>
  );
}
