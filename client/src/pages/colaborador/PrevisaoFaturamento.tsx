/**
 * PrevisaoFaturamento.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * REFATORAÇÃO — Seletor de período regressivo + separação histórico × previsão.
 *
 * ALTERAÇÕES nesta versão:
 *   ✅ Seletor de período: 3 | 6 | 12 | 24 meses ou personalizado (N meses)
 *   ✅ Faturamento Bruto = regressivo (passado → hoje), período configurável
 *   ✅ Previsão = futura (hoje → próximos N meses), baseada no histórico salvo
 *   ✅ Ao trocar período, regenera meses vazios ou recorta histórico do banco
 *   ✅ Validação mínima de 3 meses para salvar; mínimo de 12 para gerar previsão
 *   ✅ Textos do PDF/preview refletem o período real selecionado
 *   ✅ Todos os hooks/handlers originais preservados (histórico, IA, CSV)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Save,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileText,
  Eye,
  Building2,
  UserCheck,
  Hash,
  Calendar,
  ChevronDown,
  BarChart2,
  Divide,
  Sparkles,
} from 'lucide-react';
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from '../../lib/currency';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';
import Layout from './Layout';
import { GraficoPrevisao } from '../../components/faturamento/GraficoPrevisao';
import { CardCapacidade } from '../../components/faturamento/CardCapacidade';
import { TabelaHistorico } from '../../components/faturamento/TabelaHistorico';
import { FormHistorico } from '../../components/faturamento/FormHistorico';
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

// ─── Opções de período regressivo ─────────────────────────────────────────────
const OPCOES_PERIODO = [
  { label: 'Últimos 3 meses',  value: 3  },
  { label: 'Últimos 6 meses',  value: 6  },
  { label: 'Últimos 12 meses', value: 12 },
  { label: 'Últimos 24 meses', value: 24 },
  { label: 'Personalizado',    value: 0  }, // 0 = modo personalizado
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formata uma data local (ano, mês 0-based) como 'YYYY-MM-01' sem conversão UTC.
 * Evita o bug de fuso onde toISOString() pode retroceder um dia em GMT-3.
 */
function competenciaLocal(ano: number, mes: number): string {
  const mm = String(mes + 1).padStart(2, '0');
  return `${ano}-${mm}-01`;
}

/**
 * Gera N meses regressivos, sendo o último SEMPRE o mês anterior ao atual.
 *
 * Regra de negócio: o mês corrente ainda não fechou faturamento,
 * portanto a série termina no mês anterior.
 *
 * Exemplo com N=12 e hoje=maio/2026: gera maio/2025 … abril/2026.
 * Exemplo com N=12 e hoje=janeiro/2026: gera janeiro/2025 … dezembro/2025.
 */
function gerarMesesVazios(qtd: number): RegistroHistorico[] {
  const meses: RegistroHistorico[] = [];
  const hoje = new Date();
  // Mês de referência = mês anterior ao atual (0-based)
  let mesRef = hoje.getMonth() - 1;
  let anoRef = hoje.getFullYear();
  if (mesRef < 0) { mesRef = 11; anoRef -= 1; } // janeiro → dezembro do ano anterior
  // i vai de (qtd-1) até 0 — quando i=0 gera o mês de referência (anterior ao atual)
  for (let i = qtd - 1; i >= 0; i--) {
    let mes = mesRef - i;
    let ano = anoRef;
    while (mes < 0) { mes += 12; ano -= 1; }
    meses.push({ competencia: competenciaLocal(ano, mes), valor: '', origem: 'manual' });
  }
  return meses;
}

/**
 * Recorta ou complementa o histórico carregado do banco para exibir
 * exatamente `qtd` meses regressivos a partir de hoje (inclusive).
 */
function recortarHistorico(
  historicoBanco: RegistroHistorico[],
  qtd: number,
): RegistroHistorico[] {
  // Gera a grade de meses esperados
  const grade = gerarMesesVazios(qtd);
  // Para cada mês da grade, tenta encontrar o valor no banco
  return grade.map(slot => {
    const encontrado = historicoBanco.find(
      r => r.competencia.slice(0, 7) === slot.competencia.slice(0, 7),
    );
    return encontrado ?? slot;
  });
}

/**
 * Distribui um valor total em N parcelas mensais com variação realista.
 *
 * Regra de negócio:
 *   - Os meses mais antigos (início da série, passado) têm valores MENORES
 *   - Os meses mais recentes (fim da série, presente) têm valores MAIORES
 *   - Progressivo: o faturamento cresce do passado para o presente
 *   - Oscilação senoidal garante que nenhum mês seja igual ao outro
 *   - A soma exata bate com o total informado (ajuste no último mês em centavos)
 */
function ratearFaturamento(
  totalAnual: number,
  qtdMeses: number,
  grade: RegistroHistorico[],
): RegistroHistorico[] {
  if (totalAnual <= 0 || qtdMeses <= 0) return grade;

  const media = totalAnual / qtdMeses;

  // Gera fatores de variação por índice:
  // - i=0 (mais antigo / passado): fator mais baixo (~0.92)
  // - i=N-1 (mais recente / presente): fator mais alto (~1.08)
  // - Progressivo crescente + oscilação senoidal para naturalidade
  const fatores: number[] = [];
  for (let i = 0; i < qtdMeses; i++) {
    const posicaoNorm = i / Math.max(qtdMeses - 1, 1); // 0 = passado, 1 = presente
    // Crescimento linear: passado = menor, presente = maior
    const crescimento = 0.92 + 0.16 * posicaoNorm;
    // Oscilação senoidal para dar naturalidade (não todos iguais)
    const oscilacao = 0.05 * Math.sin(i * 2.3 + 1.1);
    fatores.push(crescimento + oscilacao);
  }

  // Normaliza os fatores para que a soma seja exatamente qtdMeses
  const somaFatores = fatores.reduce((a, b) => a + b, 0);
  const fatorNorm = qtdMeses / somaFatores;
  const valores = fatores.map(f => Math.round(media * f * fatorNorm * 100) / 100);

  // Ajusta o último mês para garantir soma exata em centavos
  // Usa inteiros (centavos) para eliminar erros de ponto flutuante
  const totalCentavos = Math.round(totalAnual * 100);
  const somaAnteriorCentavos = valores.slice(0, -1).reduce((acc, v) => acc + Math.round(v * 100), 0);
  valores[qtdMeses - 1] = (totalCentavos - somaAnteriorCentavos) / 100;

  // Aplica os valores na grade de meses
  return grade.map((slot, idx) => ({
    ...slot,
    valor: valores[idx] ?? slot.valor,
    origem: 'manual',
  }));
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PrevisaoFaturamento() {
  // ── Período regressivo ────────────────────────────────────────────────────
  const [periodoSelecionado, setPeriodoSelecionado] = useState<number>(12); // meses
  const [periodoPersonalizado, setPeriodoPersonalizado] = useState<string>('12');
  const [modoPersonalizado, setModoPersonalizado] = useState(false);

  // Período efetivo (número de meses)
  const periodoEfetivo = modoPersonalizado
    ? Math.max(1, parseInt(periodoPersonalizado, 10) || 12)
    : periodoSelecionado;

  // ── Estado original (preservado) ──────────────────────────────────────────
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [contadores, setContadores] = useState<Contador[]>([]);
  const [contadorId, setContadorId] = useState('');
  // historicoBanco: todos os registros carregados do banco (sem filtro de período)
  const [historicoBanco, setHistoricoBanco] = useState<RegistroHistorico[]>([]);
  // registros: o que é exibido na tabela (recortado pelo período selecionado)
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

  // ── Campos do escritório / contador livre ─────────────────────────────────
  const [escritorio, setEscritorio] = useState('');
  const [nomeContadorLivre, setNomeContadorLivre] = useState('');
  const [crcLivre, setCrcLivre] = useState('');

  // ── Controle do preview ───────────────────────────────────────────────────
  const [previewDados, setPreviewDados] = useState<DadosPdfFaturamento | null>(null);

  // ── Seção ativa: 'faturamento' | 'previsao' ───────────────────────────────
  const [secaoAtiva, setSecaoAtiva] = useState<'faturamento' | 'previsao'>('faturamento');

  // ── Faturamento bruto anual (rateio inteligente) ──────────────────────────
  const [faturamentoBrutoDisplay, setFaturamentoBrutoDisplay] = useState<string>('');
  const [faturamentoBrutoNum, setFaturamentoBrutoNum] = useState<number>(0);

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

  // ── Ao mudar o período, recorta o histórico já carregado ──────────────────
  useEffect(() => {
    if (historicoBanco.length > 0) {
      setRegistros(recortarHistorico(historicoBanco, periodoEfetivo));
    } else {
      setRegistros(gerarMesesVazios(periodoEfetivo));
    }
  }, [periodoEfetivo, historicoBanco]);

  // ── Ao selecionar contador cadastrado, preenche campos livres ─────────────
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
        const todos: RegistroHistorico[] = data.map(r => ({
          competencia: r.competencia.slice(0, 10),
          valor: parseFloat(r.valor),
          origem: r.origem,
        }));
        setHistoricoBanco(todos);
        // O useEffect acima cuida de recortar pelo período efetivo
      } else {
        setHistoricoBanco([]);
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
      setHistoricoBanco([]);
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  const handleEmpresaChange = (id: string) => {
    setEmpresaId(id);
    setPrevisao(null);
    setHistoricoBanco([]);
    if (id) carregarHistorico(id);
    else setRegistros(gerarMesesVazios(periodoEfetivo));
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
    // Ao importar, atualiza também o historicoBanco para que a troca de período funcione
    const novoBanco = importados.map(r => ({
      competencia: r.competencia,
      valor: r.valor,
      origem: r.origem,
    }));
    setHistoricoBanco(novoBanco);
    toast.success(`${importados.length} registros importados`);
  };

  const handleSalvarHistorico = async () => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    const registrosValidos = registros.filter(
      r => r.valor !== '' && r.valor !== null && !isNaN(Number(r.valor)),
    );
    if (registrosValidos.length < 3) {
      toast.error(`Preencha pelo menos 3 meses. Atualmente: ${registrosValidos.length}`);
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
      // Recarrega o banco para manter sincronizado
      await carregarHistorico(empresaId);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar histórico');
    } finally {
      setLoadingSalvar(false);
    }
  };

  const handleGerarPrevisao = async () => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    // Para gerar previsão, precisa de pelo menos 12 meses no banco (não apenas no recorte)
    const registrosValidos = historicoBanco.filter(
      r => r.valor !== '' && r.valor !== null && !isNaN(Number(r.valor)),
    );
    if (registrosValidos.length < 12) {
      toast.error(
        `Para gerar previsão são necessários pelo menos 12 meses no histórico salvo. ` +
        `Encontrados: ${registrosValidos.length}. Salve o histórico completo primeiro.`,
      );
      return;
    }
    setLoadingPrevisao(true);
    try {
      toast.loading('Consultando IA preditiva...', { id: 'previsao-progress' });
      const result: ResultadoPrevisao = await apiFetch('/api/faturamento/prever', {
        method: 'POST',
        body: JSON.stringify({ empresa_id: empresaId, horizonte_meses: horizonte }),
      });
      toast.dismiss('previsao-progress');
      setPrevisao(result);
      setSecaoAtiva('previsao');
      toast.success(`Previsão gerada com modelo ${result.modelo_usado.toUpperCase()}!`);
    } catch (err: any) {
      toast.dismiss('previsao-progress');
      toast.error(err.message || 'Erro ao gerar previsão');
    } finally {
      setLoadingPrevisao(false);
    }
  };

  // ── Valida campos obrigatórios do escritório antes do preview ─────────────
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

  // ── Abre preview de DECLARAÇÃO (histórico do período selecionado) ──────────
  const handleVerDeclaracao = () => {
    if (!empresaId) { toast.error('Selecione uma empresa'); return; }
    if (!validarContabilidade()) return;

    const refDate = dataReferenciaDeclaracao
      ? new Date(dataReferenciaDeclaracao + '-01')
      : new Date();

    const validos = registros
      .filter(r => r.valor !== '' && !isNaN(Number(r.valor)))
      .filter(r => new Date(r.competencia + 'T00:00:00') <= refDate)
      .sort((a, b) => a.competencia.localeCompare(b.competencia));

    if (validos.length < 3) {
      toast.error(`São necessários pelo menos 3 meses de histórico válido. Encontrados: ${validos.length}`);
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
      },
      registros: validos.map(r => ({
        competencia: r.competencia,
        valor: parseFloat(String(r.valor)),
      })),
      // Passa o número de meses para o PDF refletir o período correto
      periodoMeses: validos.length,
      cidade: 'Brasília - DF',
    } as any);
  };

  // ── Abre preview de PREVISÃO (futura) ─────────────────────────────────────
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

  // ── Estatísticas do período exibido ───────────────────────────────────────
  const registrosComValor = registros.filter(
    r => r.valor !== '' && r.valor !== null && !isNaN(Number(r.valor)) && Number(r.valor) > 0,
  );
  const totalPeriodo = registrosComValor.reduce((acc, r) => acc + Number(r.valor), 0);
  const mediaMensal = registrosComValor.length > 0 ? totalPeriodo / registrosComValor.length : 0;
  const mesesPreenchidos = registrosComValor.length;

  // ── Handler de rateio inteligente ────────────────────────────────────────
  const handleRatear = () => {
    if (faturamentoBrutoNum <= 0) {
      toast.error("Informe o faturamento bruto antes de ratear");
      return;
    }
    const grade = registros.length > 0 ? registros : gerarMesesVazios(periodoEfetivo);
    const novoRegistros = ratearFaturamento(faturamentoBrutoNum, grade.length, grade);
    setRegistros(novoRegistros);
    toast.success(
      `Faturamento de ${faturamentoBrutoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ` +
      `rateado em ${grade.length} meses com variação progressiva regressiva.`
    );
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
            <p className="text-sm text-gray-500">Histórico regressivo e previsão futura por IA</p>
          </div>
        </div>

        {/* ── Abas: Faturamento Bruto | Previsão ─────────────────────────── */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setSecaoAtiva('faturamento')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              secaoAtiva === 'faturamento'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Faturamento Bruto
            <span className="text-xs font-normal opacity-70">(histórico)</span>
          </button>
          <button
            onClick={() => setSecaoAtiva('previsao')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              secaoAtiva === 'previsao'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Previsão de Faturamento
            <span className="text-xs font-normal opacity-70">(futuro)</span>
          </button>
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

            {/* Contador cadastrado */}
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

          {/* Campos do documento (escritório + contador) */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Dados para o Documento PDF
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* ════════════════════════════════════════════════════════════════════
            ABA: FATURAMENTO BRUTO (histórico regressivo)
        ════════════════════════════════════════════════════════════════════ */}
        {secaoAtiva === 'faturamento' && empresaId && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">

            {/* Cabeçalho da seção */}
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-blue-600" />
                  Faturamento Bruto — Histórico Regressivo
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Valores do passado até hoje. Selecione o período desejado abaixo.
                </p>
              </div>
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


            {/* ── Painel: Faturamento Bruto Anual + Rateio Inteligente ─────── */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Faturamento Bruto Anual — Rateio Automático
              </p>
              <p className="text-xs text-emerald-600">
                Informe o faturamento bruto total do período e clique em <strong>Ratear</strong> para distribuir
                automaticamente em {periodoEfetivo} meses com variação progressiva regressiva (meses mais antigos
                ligeiramente maiores, meses recentes menores), garantindo que a soma seja exata.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-emerald-700 mb-1">
                    Faturamento Bruto Total (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={faturamentoBrutoDisplay}
                    onChange={e => {
                      const masked = maskCurrencyInput(e.target.value);
                      setFaturamentoBrutoDisplay(masked);
                      setFaturamentoBrutoNum(unmaskCurrencyInput(masked));
                    }}
                    placeholder="Ex.: 1.200.000,00"
                    className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-sm text-right font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-emerald-700">Divisor</label>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm text-emerald-700 font-semibold">
                    <Divide className="w-3.5 h-3.5" />
                    {periodoEfetivo} meses
                  </div>
                </div>
                {faturamentoBrutoNum > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-emerald-700">Média mensal</label>
                    <div className="px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm text-emerald-800 font-mono tabular-nums">
                      {(faturamentoBrutoNum / periodoEfetivo).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </div>
                  </div>
                )}
                <button
                  onClick={handleRatear}
                  disabled={faturamentoBrutoNum <= 0}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold"
                >
                  <Divide className="w-4 h-4" />
                  Ratear em {periodoEfetivo} meses
                </button>
              </div>
            </div>
            {/* ── Seletor de período regressivo ─────────────────────────── */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Período do Faturamento
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                {OPCOES_PERIODO.map(op => (
                  <button
                    key={op.value}
                    onClick={() => {
                      if (op.value === 0) {
                        setModoPersonalizado(true);
                      } else {
                        setModoPersonalizado(false);
                        setPeriodoSelecionado(op.value);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      (op.value === 0 && modoPersonalizado) ||
                      (op.value !== 0 && !modoPersonalizado && periodoSelecionado === op.value)
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}

                {/* Input personalizado */}
                {modoPersonalizado && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={periodoPersonalizado}
                      onChange={e => setPeriodoPersonalizado(e.target.value)}
                      className="w-20 border border-blue-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="N"
                    />
                    <span className="text-xs text-gray-500">meses</span>
                  </div>
                )}
              </div>

              {/* Resumo do período */}
              <div className="flex flex-wrap gap-4 pt-1">
                <div className="text-xs text-blue-600">
                  <span className="font-semibold">Período exibido:</span>{' '}
                  {periodoEfetivo} {periodoEfetivo === 1 ? 'mês' : 'meses'} regressivos a partir de hoje
                </div>
                {mesesPreenchidos > 0 && (
                  <>
                    <div className="text-xs text-gray-600">
                      <span className="font-semibold">Meses preenchidos:</span> {mesesPreenchidos}/{periodoEfetivo}
                    </div>
                    <div className="text-xs text-gray-600">
                      <span className="font-semibold">Total do período:</span>{' '}
                      {totalPeriodo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                    <div className="text-xs text-gray-600">
                      <span className="font-semibold">Média mensal:</span>{' '}
                      {mediaMensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Tabela de histórico */}
            {loadingHistorico ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <TabelaHistorico registros={registros} onChange={handleRegistroChange} />
            )}

            {/* Ações da linha de fundo */}
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100 flex-wrap">
              {/* Mês de referência */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap">Mês ref. declaração:</label>
                <input
                  type="month"
                  value={dataReferenciaDeclaracao}
                  onChange={e => setDataReferenciaDeclaracao(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  title="Mês de referência para a declaração"
                />
              </div>

              {/* Ver Declaração */}
              <button
                onClick={handleVerDeclaracao}
                className="flex items-center gap-2 px-4 py-2 bg-[#1B3A6B] text-white text-sm rounded-lg hover:bg-[#142d55] transition-colors"
              >
                <Eye className="w-4 h-4" />
                Ver Declaração PDF
              </button>
            </div>
          </div>
        )}

        {/* Placeholder quando empresa não selecionada */}
        {secaoAtiva === 'faturamento' && !empresaId && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
            <TrendingDown className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Selecione uma empresa para visualizar o histórico de faturamento.</p>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            ABA: PREVISÃO DE FATURAMENTO (futuro)
        ════════════════════════════════════════════════════════════════════ */}
        {secaoAtiva === 'previsao' && (
          <div className="space-y-5">

            {/* Painel de geração */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-emerald-600" />
                  Previsão de Faturamento — Projeção Futura
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Baseada no histórico salvo. A IA projeta os próximos meses a partir dos dados reais registrados.
                </p>
              </div>

              {!empresaId && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                  Selecione uma empresa na seção de Configuração acima para gerar a previsão.
                </div>
              )}

              {empresaId && (
                <>
                  {/* Aviso sobre histórico necessário */}
                  {historicoBanco.filter(r => r.valor !== '' && !isNaN(Number(r.valor))).length < 12 && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold">Histórico insuficiente para previsão</p>
                        <p className="text-xs mt-0.5">
                          São necessários pelo menos 12 meses salvos no banco.
                          Vá para a aba <strong>Faturamento Bruto</strong>, preencha os dados e clique em <strong>Salvar Histórico</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Controles de geração */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600 font-medium">Horizonte da previsão:</label>
                      <select
                        value={horizonte}
                        onChange={e => setHorizonte(Number(e.target.value) as 12 | 24 | 36)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value={12}>Próximos 12 meses</option>
                        <option value={24}>Próximos 24 meses</option>
                        <option value={36}>Próximos 36 meses</option>
                      </select>
                    </div>

                    <button
                      onClick={handleGerarPrevisao}
                      disabled={loadingPrevisao}
                      className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-semibold"
                    >
                      {loadingPrevisao ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Gerando previsão...</>
                      ) : (
                        <><RefreshCw className="w-4 h-4" /> Gerar Previsão IA</>
                      )}
                    </button>

                    {loadingPrevisao && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Pode levar até 45s (Prophet treinando o modelo)
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

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
                    <div>
                      <h2 className="font-semibold text-gray-800">
                        Gráfico de Previsão — Próximos {previsao.horizonte_meses} meses
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Linha azul = histórico real · Linha laranja tracejada = projeção futura
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-gray-400">
                        Gerado em {new Date(previsao.gerada_em).toLocaleString('pt-BR')}
                      </span>
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

            {/* Placeholder sem previsão */}
            {!previsao && empresaId && !loadingPrevisao && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <BarChart2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  Nenhuma previsão gerada ainda. Clique em <strong>Gerar Previsão IA</strong> acima.
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Preview do documento (overlay fullscreen) */}
      {previewDados && (
        <DocumentoPreview
          dados={previewDados}
          onFechar={() => setPreviewDados(null)}
        />
      )}
    </Layout>
  );
}
