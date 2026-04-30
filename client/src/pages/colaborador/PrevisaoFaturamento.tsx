import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Save, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import Layout from './Layout';
import { GraficoPrevisao } from '../../components/faturamento/GraficoPrevisao';
import { CardCapacidade } from '../../components/faturamento/CardCapacidade';
import { TabelaHistorico } from '../../components/faturamento/TabelaHistorico';
import { FormHistorico } from '../../components/faturamento/FormHistorico';

interface Empresa {
  id: string;
  razao_social: string;
  cnpj?: string;
}

interface RegistroHistorico {
  competencia: string;
  valor: number | string;
  origem?: string;
}

interface PontoPrevisao {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
  is_historico: boolean;
}

interface ResultadoPrevisao {
  modelo_usado: string;
  horizonte_meses: number;
  capacidade_pgto_min: number;
  capacidade_pgto_max: number;
  pontos: PontoPrevisao[];
  previsao_id: string;
  gerada_em: string;
}

// Gerar 12 meses anteriores como template vazio
function gerarMesesVazios(qtd = 12): RegistroHistorico[] {
  const meses: RegistroHistorico[] = [];
  const hoje = new Date();
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({
      competencia: d.toISOString().slice(0, 10),
      valor: '',
      origem: 'manual',
    });
  }
  return meses;
}

export default function PrevisaoFaturamento() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [registros, setRegistros] = useState<RegistroHistorico[]>(gerarMesesVazios(12));
  const [horizonte, setHorizonte] = useState<12 | 24>(12);
  const [previsao, setPrevisao] = useState<ResultadoPrevisao | null>(null);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [loadingSalvar, setLoadingSalvar] = useState(false);
  const [loadingPrevisao, setLoadingPrevisao] = useState(false);

  useEffect(() => {
    apiFetch('/api/empresas?limit=500')
      .then((data: any) => setEmpresas(Array.isArray(data) ? data : data.empresas || []))
      .catch(() => toast.error('Erro ao carregar empresas'))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  const carregarHistorico = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingHistorico(true);
    try {
      const data: any[] = await apiFetch(`/api/faturamento/historico/${id}`);
      if (data.length > 0) {
        setRegistros(data.map(r => ({
          competencia: r.competencia.slice(0, 10),
          valor: parseFloat(r.valor),
          origem: r.origem,
        })));
      } else {
        setRegistros(gerarMesesVazios(12));
      }

      // Tentar carregar última previsão
      try {
        const prev: ResultadoPrevisao = await apiFetch(`/api/faturamento/previsao/${id}/ultima`);
        setPrevisao(prev);
      } catch {
        setPrevisao(null);
      }
    } catch {
      toast.error('Erro ao carregar histórico');
      setRegistros(gerarMesesVazios(12));
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  const handleEmpresaChange = (id: string) => {
    setEmpresaId(id);
    setPrevisao(null);
    if (id) carregarHistorico(id);
    else setRegistros(gerarMesesVazios(12));
  };

  const handleRegistroChange = (index: number, campo: keyof RegistroHistorico, valor: string) => {
    setRegistros(prev => prev.map((r, i) => i === index ? { ...r, [campo]: valor } : r));
  };

  const handleImportCsv = (importados: { competencia: string; valor: number; origem: string }[]) => {
    setRegistros(importados);
    toast.success(`${importados.length} registros importados`);
  };

  const handleSalvarHistorico = async () => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    const registrosValidos = registros.filter(r => r.valor !== '' && r.valor !== null && !isNaN(Number(r.valor)));
    if (registrosValidos.length < 12) {
      toast.error(`Preencha pelo menos 12 meses. Atualmente: ${registrosValidos.length}`);
      return;
    }
    setLoadingSalvar(true);
    try {
      await apiFetch('/api/faturamento/historico', {
        method: 'POST',
        body: JSON.stringify({
          empresa_id: empresaId,
          registros: registrosValidos.map(r => ({
            competencia: r.competencia,
            valor: parseFloat(String(r.valor)),
            origem: r.origem || 'manual',
          })),
        }),
      });
      toast.success('Histórico salvo com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar histórico');
    } finally {
      setLoadingSalvar(false);
    }
  };

  const handleGerarPrevisao = async () => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }

    const registrosValidos = registros.filter(
      r => r.valor !== '' && r.valor !== null && !isNaN(Number(r.valor))
    );
    if (registrosValidos.length < 12) {
      toast.error(`Preencha pelo menos 12 meses. Atualmente: ${registrosValidos.length}`);
      return;
    }

    setLoadingPrevisao(true);
    try {
      // ── PASSO 1: Auto-save do histórico antes de chamar a IA ──
      toast.loading('Salvando histórico...', { id: 'previsao-progress' });
      await apiFetch('/api/faturamento/historico', {
        method: 'POST',
        body: JSON.stringify({
          empresa_id: empresaId,
          registros: registrosValidos.map(r => ({
            competencia: r.competencia,
            valor: parseFloat(String(r.valor)),
            origem: r.origem || 'manual',
          })),
        }),
      });

      // ── PASSO 2: Chamar a IA preditiva ──
      toast.loading('Consultando IA preditiva...', { id: 'previsao-progress' });
      const result: ResultadoPrevisao = await apiFetch('/api/faturamento/prever', {
        method: 'POST',
        body: JSON.stringify({ empresa_id: empresaId, horizonte_meses: horizonte }),
      });

      toast.dismiss('previsao-progress');
      setPrevisao(result);
      toast.success(`Previsão gerada com modelo ${result.modelo_usado.toUpperCase()}!`);
    } catch (err: any) {
      toast.dismiss('previsao-progress');
      toast.error(err.message || 'Erro ao gerar previsão');
    } finally {
      setLoadingPrevisao(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Previsão de Faturamento</h1>
            <p className="text-sm text-gray-500">Análise preditiva com IA (Prophet / ARIMA)</p>
          </div>
        </div>

        {/* Seleção de empresa */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Empresa</h2>
          <div className="flex gap-3 flex-wrap">
            <select
              value={empresaId}
              onChange={e => handleEmpresaChange(e.target.value)}
              className="flex-1 min-w-[250px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loadingEmpresas}
            >
              <option value="">
                {loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa...'}
              </option>
              {empresas.map(e => (
                <option key={e.id} value={e.id}>
                  {e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Histórico de faturamento */}
        {empresaId && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-semibold text-gray-800">Histórico de Faturamento</h2>
              <div className="flex gap-2 flex-wrap">
                <FormHistorico onImport={handleImportCsv} />
                <button
                  onClick={handleSalvarHistorico}
                  disabled={loadingSalvar}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loadingSalvar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Histórico
                </button>
              </div>
            </div>

            {loadingHistorico ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <TabelaHistorico registros={registros} onChange={handleRegistroChange} />
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-medium">Horizonte:</label>
                <select
                  value={horizonte}
                  onChange={e => setHorizonte(Number(e.target.value) as 12 | 24)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value={12}>12 meses</option>
                  <option value={24}>24 meses</option>
                </select>
              </div>
              <button
                onClick={handleGerarPrevisao}
                disabled={loadingPrevisao}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {loadingPrevisao ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando previsão...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Gerar Previsão IA
                  </>
                )}
              </button>
              {loadingPrevisao && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Pode levar até 45s (Prophet está treinando o modelo)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Resultado da previsão */}
        {previsao && (
          <div className="space-y-4">
            <CardCapacidade
              min={previsao.capacidade_pgto_min}
              max={previsao.capacidade_pgto_max}
              modelo={previsao.modelo_usado}
            />
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">
                  Gráfico de Previsão — {previsao.horizonte_meses} meses
                </h2>
                <span className="text-xs text-gray-400">
                  Gerado em {new Date(previsao.gerada_em).toLocaleString('pt-BR')}
                </span>
              </div>
              <GraficoPrevisao
                pontos={previsao.pontos}
                capacidadeMin={previsao.capacidade_pgto_min}
                capacidadeMax={previsao.capacidade_pgto_max}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
