// Linha do tempo do regime tributário (Missão de evolução do Acervo Documental,
// seções 11-19). Este módulo ADICIONA um histórico versionado de regime
// tributário ao lado do campo hoje existente (`empresas.regime_tributario`),
// sem substituí-lo -- o restante do sistema continua lendo o campo atual
// normalmente; este serviço é a peça nova que permite, quando necessário,
// responder "qual era o regime em uma data X" e impedir que um documento
// histórico (ex.: um PGDAS-D de um período em que a empresa ainda era Simples
// Nacional) seja confundido com o regime vigente hoje.
//
// Regra central (seção 34 da missão): um documento com competência no passado
// NUNCA reabre nem substitui o período vigente atual -- ele só preenche uma
// lacuna do histórico. Só uma evidência cuja competência é igual ou posterior
// ao início do período hoje vigente pode fechar esse período e abrir um novo.

export interface Queryable {
  query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface PeriodoRegimeTributario {
  id: string;
  empresa_id: string;
  regime: string;
  data_inicio: string | null;
  data_fim: string | null;
  fonte: string;
  confianca: number | null;
  documento_evidencia_id: string | null;
  observacao: string | null;
}

// Catálogo fechado de regimes reconhecidos (seção 19). Os mesmos rótulos já
// usados no restante do sistema (ver `detectarRegimeTributarioDeclarado` e
// `parseSimples` em extracaoDocumentalLocal.ts), para não exigir tradução em
// nenhum outro ponto do código nem duplicar vocabulário.
export const REGIMES_TRIBUTARIOS_RECONHECIDOS = [
  'MEI / SIMEI',
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
  'Lucro Arbitrado',
  'Imune ou isenta',
  'Não optante — regime a confirmar',
  'Não identificado',
] as const;
export type RegimeTributarioReconhecido = typeof REGIMES_TRIBUTARIOS_RECONHECIDOS[number];

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function diaAnterior(dataIso: string): string {
  const data = new Date(`${dataIso}T12:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() - 1);
  return isoDate(data);
}

// ---------------------------------------------------------------------------
// Seção 13: ECF é anual, entregue no ano seguinte ao ano-calendário. O prazo
// legal de entrega é o último dia útil de julho do ano seguinte; usamos 31/07
// como referência (constante nomeada, fácil de ajustar caso a RFB publique
// prazo diferente em algum ano, algo que este módulo não tenta prever).
// Antes de existir esta função, o motor não tinha como distinguir "ECF ainda
// não é exigível" de "ECF pendente/vencida" para o ano-calendário corrente.
// ---------------------------------------------------------------------------
const ECF_MES_PRAZO = 7; // julho
const ECF_DIA_PRAZO = 31;

export type ExigibilidadeEcf = 'AINDA_NAO_EXIGIVEL' | 'EXIGIVEL';

export function calcularExigibilidadeEcf(anoCalendario: number, hoje: Date = new Date()): ExigibilidadeEcf {
  const prazo = new Date(Date.UTC(anoCalendario + 1, ECF_MES_PRAZO - 1, ECF_DIA_PRAZO, 23, 59, 59));
  return hoje.getTime() > prazo.getTime() ? 'EXIGIVEL' : 'AINDA_NAO_EXIGIVEL';
}

// ---------------------------------------------------------------------------
// Seção 15: para competências até 12/2024, a obrigação corrente é a DCTF (PGD);
// para fatos geradores a partir de 01/2025, é a DCTFWeb/MIT. Sem esta função, o
// código só tinha uma lista fixa de tipos ("dctf", "dctfweb", "mit") tratados
// como sinônimos incondicionais, sem levar a competência em conta.
// ---------------------------------------------------------------------------
export interface CompetenciaMensal {
  ano: number;
  mes: number; // 1-12
}

const DCTFWEB_MIT_VIGENCIA_INICIO: CompetenciaMensal = { ano: 2025, mes: 1 };

export interface RegraTemporalDctf {
  tipo_documento: 'dctf' | 'dctfweb_mit';
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
}

function chaveCompetencia(competencia: CompetenciaMensal): number {
  return competencia.ano * 12 + (competencia.mes - 1);
}

export function regraTemporalDctf(competencia: CompetenciaMensal): RegraTemporalDctf {
  if (chaveCompetencia(competencia) >= chaveCompetencia(DCTFWEB_MIT_VIGENCIA_INICIO)) {
    return { tipo_documento: 'dctfweb_mit', vigencia_inicio: '2025-01-01', vigencia_fim: null };
  }
  return { tipo_documento: 'dctf', vigencia_inicio: null, vigencia_fim: '2024-12-31' };
}

// ---------------------------------------------------------------------------
// Seção 34: um documento com competência no passado nunca pode ser confundido
// com a situação atual só porque foi anexado "hoje". Esta função pura decide
// se uma competência (ex.: 12/2025 de um PGDAS) ainda representa "agora" ou já
// é histórica, dada uma data de referência -- usada tanto para decidir se uma
// nova evidência pode substituir o período vigente quanto para exibir o rótulo
// correto na tela (ver `registrarPeriodoRegime` abaixo, que é quem decide se
// fecha/abre período; esta função só classifica uma data isolada).
// ---------------------------------------------------------------------------
export function competenciaEhAtual(competenciaFimIso: string | null, hoje: Date = new Date()): boolean {
  if (!competenciaFimIso) return true; // sem competência conhecida: não presume histórico
  const fim = new Date(`${competenciaFimIso}T23:59:59.999Z`);
  if (Number.isNaN(fim.getTime())) return true;
  return fim.getTime() >= hoje.getTime();
}

// ---------------------------------------------------------------------------
// Leitura da linha do tempo (histórico completo, mais antigo primeiro).
// ---------------------------------------------------------------------------
export async function obterLinhaDoTempoRegime(db: Queryable, empresaId: string): Promise<PeriodoRegimeTributario[]> {
  const { rows } = await db.query(
    `SELECT id, empresa_id, regime, data_inicio, data_fim, fonte, confianca, documento_evidencia_id, observacao
       FROM public.empresas_regime_tributario_historico
      WHERE empresa_id = $1
      ORDER BY data_inicio ASC NULLS FIRST, criado_em ASC`,
    [empresaId],
  );
  return rows;
}

// Regime vigente numa data de referência (default: hoje). Não é necessariamente
// o último período inserido -- é o período cujo intervalo [data_inicio, data_fim]
// contém a data pedida; na ausência de um período que contenha exatamente a
// data, cai para o período aberto (data_fim IS NULL) mais recente, se houver.
export async function obterRegimeVigenteEm(
  db: Queryable,
  empresaId: string,
  dataReferencia: Date = new Date(),
): Promise<PeriodoRegimeTributario | null> {
  const referenciaIso = isoDate(dataReferencia);
  const periodos = await obterLinhaDoTempoRegime(db, empresaId);
  const contendo = periodos.find((periodo) => (
    (!periodo.data_inicio || periodo.data_inicio <= referenciaIso)
    && (!periodo.data_fim || periodo.data_fim >= referenciaIso)
  ));
  if (contendo) return contendo;
  const aberto = periodos.find((periodo) => periodo.data_fim === null);
  return aberto || periodos[periodos.length - 1] || null;
}

export interface RegistrarPeriodoRegimeParams {
  empresaId: string;
  regime: RegimeTributarioReconhecido | string;
  /** Início da competência que a evidência comprova (ex.: primeiro dia do mês do PGDAS). */
  dataEvidenciaInicio: string;
  /** Fim da competência, quando conhecido (ex.: último dia do mês do PGDAS). */
  dataEvidenciaFim?: string | null;
  fonte: string;
  confianca?: number | null;
  documentoEvidenciaId?: string | null;
  observacao?: string | null;
}

export interface ResultadoRegistroPeriodo {
  periodo: PeriodoRegimeTributario | null;
  acao: 'criado_vigente' | 'atualizado_vigente' | 'inserido_historico' | 'ignorado_evidencia_fraca';
}

/**
 * Registra uma nova evidência de regime tributário na linha do tempo.
 *
 * Não usa transação explícita (mesmo padrão de leitura-depois-escrita já usado
 * no restante deste serviço de análise documental, ex.: analisarQSA) -- o
 * índice único parcial `uq_regime_historico_periodo_vigente` (migration 100)
 * é quem garante, no banco, que nunca existem dois períodos "vigentes" (sem
 * data_fim) para a mesma empresa ao mesmo tempo, mesmo sob concorrência: uma
 * segunda escrita concorrente falharia por violação de unicidade em vez de
 * criar um estado inconsistente.
 */
export async function registrarPeriodoRegime(
  db: Queryable,
  params: RegistrarPeriodoRegimeParams,
): Promise<ResultadoRegistroPeriodo> {
  const { empresaId, regime, dataEvidenciaInicio, fonte } = params;
  const dataEvidenciaFim = params.dataEvidenciaFim ?? null;
  const confianca = params.confianca ?? null;
  const documentoEvidenciaId = params.documentoEvidenciaId ?? null;
  const observacao = params.observacao ?? null;

  const periodos = await obterLinhaDoTempoRegime(db, empresaId);
  const vigente = periodos.find((periodo) => periodo.data_fim === null) || null;

  const evidenciaEhAtualOuFutura = !vigente || !vigente.data_inicio || dataEvidenciaInicio >= vigente.data_inicio;

  if (evidenciaEhAtualOuFutura) {
    if (vigente && vigente.regime === regime) {
      // Mesmo regime já vigente -- não duplica período. Só atualiza a evidência
      // quando a nova é mais confiável que a que já estava registrada (nunca
      // troca uma evidência boa por uma pior).
      if ((confianca ?? 0) <= (vigente.confianca ?? 0)) {
        return { periodo: vigente, acao: 'ignorado_evidencia_fraca' };
      }
      const { rows } = await db.query(
        `UPDATE public.empresas_regime_tributario_historico
            SET fonte = $2, confianca = $3, documento_evidencia_id = $4, observacao = $5
          WHERE id = $1
          RETURNING id, empresa_id, regime, data_inicio, data_fim, fonte, confianca, documento_evidencia_id, observacao`,
        [vigente.id, fonte, confianca, documentoEvidenciaId, observacao],
      );
      return { periodo: rows[0] || vigente, acao: 'atualizado_vigente' };
    }

    // Regime mudou (ou não havia período vigente ainda): fecha o vigente
    // anterior na véspera do início do novo período e abre um novo período em
    // aberto -- nunca sobrescreve o histórico, só encerra o intervalo.
    if (vigente) {
      await db.query(
        `UPDATE public.empresas_regime_tributario_historico SET data_fim = $2 WHERE id = $1`,
        [vigente.id, diaAnterior(dataEvidenciaInicio)],
      );
    }
    const { rows } = await db.query(
      `INSERT INTO public.empresas_regime_tributario_historico
         (empresa_id, regime, data_inicio, data_fim, fonte, confianca, documento_evidencia_id, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, empresa_id, regime, data_inicio, data_fim, fonte, confianca, documento_evidencia_id, observacao`,
      [empresaId, regime, dataEvidenciaInicio, null, fonte, confianca, documentoEvidenciaId, observacao],
    );
    return { periodo: rows[0], acao: 'criado_vigente' };
  }

  // Evidência descreve um período ANTERIOR ao início do período hoje vigente --
  // é histórico puro. Nunca fecha nem substitui o período vigente (seção 34):
  // só preenche uma lacuna do histórico, limitado ao dia anterior ao início do
  // período vigente quando a evidência não trouxer seu próprio fim de competência.
  const dataFimSegmento = dataEvidenciaFim || (vigente?.data_inicio ? diaAnterior(vigente.data_inicio) : dataEvidenciaInicio);
  const { rows } = await db.query(
    `INSERT INTO public.empresas_regime_tributario_historico
       (empresa_id, regime, data_inicio, data_fim, fonte, confianca, documento_evidencia_id, observacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, empresa_id, regime, data_inicio, data_fim, fonte, confianca, documento_evidencia_id, observacao`,
    [empresaId, regime, dataEvidenciaInicio, dataFimSegmento, fonte, confianca, documentoEvidenciaId, observacao],
  );
  return { periodo: rows[0], acao: 'inserido_historico' };
}
