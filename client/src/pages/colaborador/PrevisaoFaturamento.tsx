/**
 * PrevisaoFaturamento.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * REFATORAÇÃO COMPLETA — 3º arquivo do conjunto cirúrgico.
 *
 * ALTERAÇÕES vs. versão original:
 *   ✅ PDF 100% client-side via gerarPdfFaturamento() — sem round-trip ao servidor
 *   ✅ Preview na tela (DocumentoPreview) antes de imprimir/baixar PDF
 *   ✅ Novos campos de entrada: escritório, contador livre (nome + CRC manual)
 *        → mantém o select de contadores cadastrados E permite entrada livre
 *   ✅ Número de documento gerado automaticamente (estabilizado no preview)
 *   ✅ Botões "Ver Declaração" e "Ver Previsão" abrem o preview antes do PDF
 *   ✅ Fluxo de declaração e previsão completamente desacoplado do backend
 *   ✅ Todos os hooks/handlers originais preservados (histórico, IA, CSV)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp,
  Save,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileText,
  Eye,
  Building2,
  UserCheck,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import Layout from './Layout';
import { GraficoPrevisao } from '../../components/faturamento/GraficoPrevisao';
import { CardCapacidade } from '../../components/faturamento/CardCapacidade';
import { TabelaHistorico } from '../../components/faturamento/TabelaHistorico';
import { FormHistorico } from '../../components/faturamento/FormHistorico';

// ── NOVOS IMPORTS (geração client-side) ──────────────────────────────────────
import { DocumentoPreview } from '../../components/DocumentoPreview';
import { type DadosPdfFaturamento } from '../../lib/gerarPdfFaturamento';

// ─── Interfaces ───────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function gerarMesesVazios(qtd = 12): RegistroHistorico[] {
  const meses: RegistroHistorico[] = [];
  const hoje = new Date();
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ competencia: d.toISOString().slice(0, 10), valor: '', origem: 'manual' });
  }
  return meses;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PrevisaoFaturamento() {
  // ── Estado original (preservado) ──────────────────────────────────────────
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [contadores, setContadores] = useState<Contador[]>([]);
  const [contadorId, setContadorId] = useState(''); // select de cadastrados
  const [registros, setRegistros] = useState<RegistroHistorico[]>(gerarMesesVazios(12));
  const [horizonte, setHorizonte] = useState<12 | 24 | 36>(12);
  const [previsao, setPrevisao] = useState<ResultadoPrevisao | null>(null);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loadingContadores, setLoadingContadores] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [loadingSalvar, setLoadingSalvar] = useState(false);
  const [loadingPrevisao, setLoadingPrevisao] = useState(false);
  const [dataReferenciaDeclaracao, setDataReferenciaDeclaracao] = useState<string>(() =>
    new Date().toISOString().slice(0, 7),
  );
  const graficoRef = useRef<HTMLDivElement>(null);

  // ── NOVO: campos do escritório / contador livre ────────────────────────────
  // Quando o usuário seleciona um contador cadastrado, esses campos são
  // preenchidos automaticamente. Mas o usuário pode também digitar livremente.
  const [escritorio, setEscritorio] = useState('');
  const [nomeContadorLivre, setNomeContadorLivre] = useState('');
  const [crcLivre, setCrcLivre] = useState('');

  // ── NOVO: controle do preview ──────────────────────────────────────────────
  const [previewDados, setPreviewDados] = useState<DadosPdfFaturamento | null>(null);

  // ─── Carregamento inicial ──────────────────────────────────────────────────
  useEffect(() => {
    apiFetch('/api/empresas?limit=500')
      .then((data: any) => setEmpresas(Array.isArray(data) ? data : data.empresas || []))
      .catch(() => toast.error('Erro ao carregar empresas'))
      .finally(() => setLoadingEmpresas(false));

    apiFetch('/api/contadores')
      .then((data: any) =>
        setContadores(Array.isArray(data) ? data.filter((c: Contador) => c.ativo) : []),
      )
      .catch(() => {/* contadores são opcionais */})
      .finally(() => setLoadingContadores(false));
  }, []);

  // ── NOVO: ao selecionar contador cadastrado, preenche campos livres ────────
  const handleContadorChange = (id: string) => {
    setContadorId(id);
    if (id) {
      const c = contadores.find(c => c.id === id);
      if (c) {
        setNomeContadorLivre(c.nome);
        setCrcLivre(c.crc);
      }
    }
  };

  // ─── Handlers originais (preservados) ─────────────────────────────────────
  const carregarHistorico = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingHistorico(true);
    try {
      const data: any[] = await apiFetch(`/api/faturamento/historico/${id}`);
      if (data.length > 0) {
        setRegistros(
          data.map(r => ({
            competencia: r.competencia.slice(0, 10),
            valor: parseFloat(r.valor),
            origem: r.origem,
          })),
        );
      } else {
        setRegistros(gerarMesesVazios(12));
      }
      try {
        const prev: ResultadoPrevisao = await apiFetch(
          `/api/faturamento/previsao/${id}/ultima`,
        );
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

  const handleRegistroChange = (
    index: number,
    campo: keyof RegistroHistorico,
    valor: string,
  ) => {
    setRegistros(prev => prev.map((r, i) => (i === index ? { ...r, [campo]: valor } : r)));
  };

  const handleImportCsv = (
    importados: { competencia: string; valor: number; origem: string }[],
  ) => {
    setRegistros(importados);
    toast.success(`${importados.length} registros importados`);
  };

  const handleSalvarHistorico = async () => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    const registrosValidos = registros.filter(
      r => r.valor !== '' && r.valor !== null && !isNaN(Number(r.valor)),
    );
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
      r => r.valor !== '' && r.valor !== null && !isNaN(Number(r.valor)),
    );
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

  // ── NOVO: valida campos obrigatórios do escritório antes do preview ────────
  const validarContabilidade = (): boolean => {
    if (!escritorio.trim()) {
      toast.error('Informe o nome do escritório de contabilidade');
      return false;
    }
    if (!nomeContadorLivre.trim()) {
      toast.error('Informe o nome do contador responsável');
      return false;
    }
    if (!crcLivre.trim()) {
      toast.error('Informe o CRC do contador');
      return false;
    }
    return true;
  };

  // ── NOVO: abre preview de DECLARAÇÃO (client-side) ────────────────────────
  const handleVerDeclaracao = () => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    if (!validarContabilidade()) return;

    // Filtra os 12 meses válidos relativos ao mês de referência
    const refDate = dataReferenciaDeclaracao
      ? new Date(dataReferenciaDeclaracao + '-01')
      : new Date();
    // Pega os registros válidos, ordena e pega os 12 mais recentes até a ref
    const validos = registros
      .filter(r => r.valor !== '' && !isNaN(Number(r.valor)))
      .filter(r => new Date(r.competencia + 'T00:00:00') <= refDate)
      .sort((a, b) => a.competencia.localeCompare(b.competencia))
      .slice(-12);

    if (validos.length < 12) {
      toast.error(`São necessários 12 meses de histórico válido. Encontrados: ${validos.length}`);
      return;
    }

    const empresa = empresas.find(e => e.id === empresaId);
    setPreviewDados({
      tipo: 'declaracao',
      empresa: {
        razaoSocial: empresa?.razao_social ?? '',
        cnpj: empresa?.cnpj,
      },
      contabilidade: {
        escritorio: escritorio.trim(),
        nomeContador: nomeContadorLivre.trim(),
        crc: crcLivre.trim(),
        // numeroDocumento omitido → será gerado automaticamente no DocumentoPreview
      },
      registros: validos.map(r => ({
        competencia: r.competencia,
        valor: parseFloat(String(r.valor)),
      })),
      cidade: 'Brasília - DF',
    });
  };

  // ── NOVO: abre preview de PREVISÃO (client-side) ──────────────────────────
  const handleVerPrevisao = () => {
    if (!previsao) { toast.error('Gere a previsão IA primeiro'); return; }
    if (!validarContabilidade()) return;

    const empresa = empresas.find(e => e.id === empresaId);
    setPreviewDados({
      tipo: 'previsao',
      empresa: {
        razaoSocial: empresa?.razao_social ?? '',
        cnpj: empresa?.cnpj,
      },
      contabilidade: {
        escritorio: escritorio.trim(),
        nomeContador: nomeContadorLivre.trim(),
        crc: crcLivre.trim(),
      },
      pontos: previsao.pontos,
      horizonte: previsao.horizonte_meses as 12 | 24 | 36,
      cidade: 'Brasília - DF',
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Layout title="Faturamento">
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Faturamento</h1>
            <p className="text-sm text-gray-500">Histórico, previsão IA e declaração anual</p>
          </div>
        </div>

        {/* ── Configuração: empresa + contador ───────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Configuração</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Empresa */}
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

            {/* Contador cadastrado (opcional — preenche campos abaixo) */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Contador cadastrado{' '}
                <span className="text-gray-400 font-normal">(opcional — preenche os campos abaixo)</span>
              </label>
              <select
                value={contadorId}
                onChange={e => handleContadorChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loadingContadores}
              >
                <option value="">
                  {loadingContadores ? 'Carregando...' : 'Digitar manualmente abaixo →'}
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

          {/* ── NOVO: campos do documento (escritório + contador) ─────────── */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Dados para o Documento PDF
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Escritório */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  Escritório de Contabilidade *
                </label>
                <input
                  type="text"
                  value={escritorio}
                  onChange={e => setEscritorio(e.target.value)}
                  placeholder="Ex.: Contabilidade Silva & Assoc."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Nome do Contador */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <UserCheck className="w-3 h-3" />
                  Contador Responsável *
                </label>
                <input
                  type="text"
                  value={nomeContadorLivre}
                  onChange={e => setNomeContadorLivre(e.target.value)}
                  placeholder="Nome completo do contador"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* CRC */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  CRC *
                </label>
                <input
                  type="text"
                  value={crcLivre}
                  onChange={e => setCrcLivre(e.target.value)}
                  placeholder="Ex.: DF-187654-0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              * Campos obrigatórios para gerar o PDF. O número do documento é gerado automaticamente.
            </p>
          </div>
        </div>

        {/* ── Histórico de faturamento ────────────────────────────────────── */}
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
                  {loadingSalvar ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
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

            {/* ── Ações da linha de fundo ────────────────────────────────── */}
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 flex-wrap">
              {/* Horizonte */}
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

              {/* Gerar previsão IA */}
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

              {/* Mês de referência */}
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

              {/* ── NOVO: Ver Declaração (abre preview) ───────────────────── */}
              <button
                onClick={handleVerDeclaracao}
                className="flex items-center gap-2 px-4 py-2 bg-[#1B3A6B] text-white text-sm rounded-lg hover:bg-[#142d55] transition-colors"
              >
                <Eye className="w-4 h-4" />
                Ver Declaração
              </button>

              {/* Aviso de carregamento IA */}
              {loadingPrevisao && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Pode levar até 45s (Prophet treinando o modelo)
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Resultado da previsão ───────────────────────────────────────── */}
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

                  {/* ── NOVO: Ver Previsão (abre preview) ─────────────────── */}
                  <button
                    onClick={handleVerPrevisao}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1B3A6B] text-white text-sm rounded-lg hover:bg-[#142d55] transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Ver Demonstrativo PDF
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

      {/* ── NOVO: Preview do documento (overlay fullscreen) ─────────────────
           Renderizado fora do container principal para z-index correto.
           DocumentoPreview gerencia internamente o gerarPdfFaturamento().   */}
      {previewDados && (
        <DocumentoPreview
          dados={previewDados}
          onFechar={() => setPreviewDados(null)}
        />
      )}
    </Layout>
  );
}
