import { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, Save, RefreshCw, AlertCircle, Loader2, FileDown, FileText } from 'lucide-react';
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

interface Contador {
  id: string;
  nome: string;
  crc: string;
  ativo: boolean;
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
  aviso?: string;
}

function gerarMesesVazios(qtd = 12): RegistroHistorico[] {
  const meses: RegistroHistorico[] = [];
  const hoje = new Date();
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ competencia: d.toISOString().slice(0, 10), valor: '', origem: 'manual' });
  }
  return meses;
}

export default function PrevisaoFaturamento() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [contadores, setContadores] = useState<Contador[]>([]);
  const [contadorId, setContadorId] = useState('');
  const [registros, setRegistros] = useState<RegistroHistorico[]>(gerarMesesVazios(12));
  const [horizonte, setHorizonte] = useState<12 | 24 | 36>(12);
  const [previsao, setPrevisao] = useState<ResultadoPrevisao | null>(null);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loadingContadores, setLoadingContadores] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [loadingSalvar, setLoadingSalvar] = useState(false);
  const [loadingPrevisao, setLoadingPrevisao] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingDeclaracao, setLoadingDeclaracao] = useState(false);
  const [dataReferenciaDeclaracao, setDataReferenciaDeclaracao] = useState<string>(() => {
    const hoje = new Date();
    return hoje.toISOString().slice(0, 7); // YYYY-MM
  });
  const graficoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch('/api/empresas?limit=500')
      .then((data: any) => setEmpresas(Array.isArray(data) ? data : data.empresas || []))
      .catch(() => toast.error('Erro ao carregar empresas'))
      .finally(() => setLoadingEmpresas(false));

    apiFetch('/api/contadores')
      .then((data: any) => setContadores(Array.isArray(data) ? data.filter((c: Contador) => c.ativo) : []))
      .catch(() => { /* contadores são opcionais */ })
      .finally(() => setLoadingContadores(false));
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
    const registrosValidos = registros.filter(r => r.valor !== '' && r.valor !== null && !isNaN(Number(r.valor)));
    if (registrosValidos.length < 12) {
      toast.error(`Preencha pelo menos 12 meses. Atualmente: ${registrosValidos.length}`);
      return;
    }
    setLoadingPrevisao(true);
    try {
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

  const handleExportarPdf = async () => {
    if (!previsao?.previsao_id) return;
    setLoadingPdf(true);
    try {
      let chartImageBase64: string | undefined;
      if (graficoRef.current) {
        try {
          const canvas = graficoRef.current.querySelector('canvas');
          if (canvas) chartImageBase64 = canvas.toDataURL('image/png');
        } catch { /* sem gráfico */ }
      }
      const token = localStorage.getItem('destrava_token') || '';
      const resp = await fetch(`/api/faturamento/previsao/${previsao.previsao_id}/exportar-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ chartImageBase64, contador_id: contadorId || undefined }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erro ao gerar PDF' }));
        throw new Error(err.error || 'Erro ao gerar PDF');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const empresa = empresas.find(e => e.id === empresaId);
      a.download = `previsao-faturamento-${empresa?.razao_social?.replace(/[^a-zA-Z0-9]/g, '-') || 'empresa'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF gerado com papel timbrado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao exportar PDF');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDeclaracaoAnual = async () => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    setLoadingDeclaracao(true);
    try {
      const token = localStorage.getItem('destrava_token') || '';
      const resp = await fetch(`/api/faturamento/declaracao-anual/${empresaId}/exportar-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ contador_id: contadorId || undefined, data_referencia: dataReferenciaDeclaracao ? dataReferenciaDeclaracao + '-01' : undefined }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erro ao gerar declaração' }));
        throw new Error(err.error || 'Erro ao gerar declaração');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const empresa = empresas.find(e => e.id === empresaId);
      a.download = `declaracao-faturamento-anual-${empresa?.razao_social?.replace(/[^a-zA-Z0-9]/g, '-') || 'empresa'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Declaração Anual gerada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar declaração anual');
    } finally {
      setLoadingDeclaracao(false);
    }
  };

  return (
    <Layout title="Faturamento">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Faturamento</h1>
            <p className="text-sm text-gray-500">Histórico, previsão IA e declaração anual</p>
          </div>
        </div>

        {/* Seleção de empresa e contador */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Configuração</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Empresa *</label>
              <select
                value={empresaId}
                onChange={e => handleEmpresaChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Contador responsável{' '}
                <span className="text-gray-400 font-normal">(opcional — para PDFs)</span>
              </label>
              <select
                value={contadorId}
                onChange={e => setContadorId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loadingContadores}
              >
                <option value="">
                  {loadingContadores ? 'Carregando...' : 'Sem contador (opcional)'}
                </option>
                {contadores.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nome} — CRC {c.crc}
                  </option>
                ))}
              </select>
              {contadores.length === 0 && !loadingContadores && (
                <p className="text-xs text-gray-400 mt-1">
                  Nenhum contador cadastrado.{' '}
                  <a href="/colaborador/contadores" className="text-blue-500 hover:underline">
                    Cadastrar agora
                  </a>
                </p>
              )}
            </div>
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
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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

            {/* Ações */}
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 font-medium">Horizonte:</label>
                <select
                  value={horizonte}
                  onChange={e => setHorizonte(Number(e.target.value) as 12 | 24 | 36)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value={12}>12 meses</option>
                  <option value={24}>24 meses</option>
                  <option value={36}>36 meses</option>
                </select>
              </div>
              <button
                onClick={handleGerarPrevisao}
                disabled={loadingPrevisao}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {loadingPrevisao ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Gerando previsão...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Gerar Previsão IA</>
                )}
              </button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap">Mês ref.:</label>
                <input
                  type="month"
                  value={dataReferenciaDeclaracao}
                  onChange={e => setDataReferenciaDeclaracao(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  title="Mês de referência para os últimos 12 meses"
                />
              </div>
              <button
                onClick={handleDeclaracaoAnual}
                disabled={loadingDeclaracao}
                className="flex items-center gap-2 px-4 py-2 bg-[#1B3A6B] text-white text-sm rounded-lg hover:bg-[#142d55] disabled:opacity-50 transition-colors"
              >
                {loadingDeclaracao ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Gerando declaração...</>
                ) : (
                  <><FileText className="w-4 h-4" /> Declaração 12 Meses</>
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
              aviso={previsao.aviso}
            />
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="font-semibold text-gray-800">
                  Gráfico de Previsão — {previsao.horizonte_meses} meses
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-400">
                    Gerado em {new Date(previsao.gerada_em).toLocaleString('pt-BR')}
                  </span>
                  <button
                    onClick={handleExportarPdf}
                    disabled={loadingPdf}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1B3A6B] text-white text-sm rounded-lg hover:bg-[#142d55] disabled:opacity-50 transition-colors"
                  >
                    {loadingPdf ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PDF...</>
                    ) : (
                      <><FileDown className="w-4 h-4" /> Exportar PDF Timbrado</>
                    )}
                  </button>
                </div>
              </div>
              <div ref={graficoRef}>
                <GraficoPrevisao
                  pontos={previsao.pontos}
                  capacidadeMin={previsao.capacidade_pgto_min}
                  capacidadeMax={previsao.capacidade_pgto_max}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
