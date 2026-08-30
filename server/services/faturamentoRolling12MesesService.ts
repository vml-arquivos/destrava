// Faturamento em janela móvel de 12 meses, por competência (Missão de
// evolução do Acervo Documental — faturamento rolling 12 meses). Este módulo
// ADICIONA um registro estruturado de faturamento (um valor por ano/mês) ao
// lado do que já existe (os metadados extraídos do documento
// `faturamento_12_meses` em extracaoDocumentalLocal.ts continuam existindo e
// funcionando exatamente como antes); nada aqui substitui ou altera esse
// comportamento -- este serviço é a peça nova que permite somar os últimos
// 12 meses fechados e responder quais competências ainda faltam.
//
// Regras centrais:
// - A janela é sempre calculada a partir do "último mês fechado" (o mês
//   corrente ainda não fechou, então nunca entra na janela por padrão).
// - A janela avança automaticamente a cada novo mês fechado, sem precisar
//   invalidar ou apagar nada: cada competência é uma linha independente: uma
//   consulta feita em fevereiro e outra feita em março simplesmente somam
//   janelas de 12 meses diferentes sobre o mesmo histórico acumulado.
// - Uma janela de 12 meses pode consolidar competências de regimes
//   tributários diferentes (ex.: 3 meses em Lucro Presumido seguidos de 9
//   meses em Lucro Real, após uma mudança de regime no meio do caminho) sem
//   exigir um único tipo de documento cobrindo os 12 meses inteiros -- cada
//   competência carrega o próprio `regime_no_periodo`, e a soma não depende
//   de uniformidade de regime nem de tipo de documento.
// - Uma evidência mais fraca (confiança menor) nunca sobrescreve uma
//   evidência já registrada mais forte para a mesma competência -- mesma
//   regra já usada em regimeTributarioTemporalService.ts.

export interface Queryable {
  query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface CompetenciaMensal {
  ano: number;
  mes: number; // 1-12
}

export interface RegistroFaturamentoCompetencia {
  id: string;
  empresa_id: string;
  ano: number;
  mes: number;
  valor: number;
  fonte: string;
  documento_id: string | null;
  regime_no_periodo: string | null;
  confianca: number | null;
  observacao: string | null;
}

function chaveCompetencia(competencia: CompetenciaMensal): number {
  return competencia.ano * 12 + (competencia.mes - 1);
}

function competenciaAPartirDaChave(chave: number): CompetenciaMensal {
  return { ano: Math.floor(chave / 12), mes: (chave % 12) + 1 };
}

/**
 * O mês corrente ainda está em curso (faturamento incompleto), então o
 * "último mês fechado" é sempre o mês anterior ao mês corrente da data de
 * referência -- nunca o mês corrente em si.
 */
export function ultimoMesFechado(hoje: Date = new Date()): CompetenciaMensal {
  const anoAtual = hoje.getUTCFullYear();
  const mesAtual = hoje.getUTCMonth() + 1; // 1-12
  return competenciaAPartirDaChave(chaveCompetencia({ ano: anoAtual, mes: mesAtual }) - 1);
}

/**
 * As 12 competências que terminam (inclusive) na competência de referência,
 * da mais antiga para a mais recente. Não depende de nenhum dado já
 * registrado -- é só o calendário da janela, usado tanto para somar o que já
 * existe quanto para apontar o que ainda falta.
 */
export function janela12Meses(referencia: CompetenciaMensal): CompetenciaMensal[] {
  const chaveFim = chaveCompetencia(referencia);
  const meses: CompetenciaMensal[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    meses.push(competenciaAPartirDaChave(chaveFim - i));
  }
  return meses;
}

export async function obterFaturamentoCompetencias(db: Queryable, empresaId: string): Promise<RegistroFaturamentoCompetencia[]> {
  const { rows } = await db.query(
    `SELECT id, empresa_id, ano, mes, valor, fonte, documento_id, regime_no_periodo, confianca, observacao
       FROM public.empresas_faturamento_mensal
      WHERE empresa_id = $1
      ORDER BY ano ASC, mes ASC`,
    [empresaId],
  );
  return rows.map((linha) => ({ ...linha, valor: Number(linha.valor) }));
}

export interface RegistrarFaturamentoCompetenciaParams {
  empresaId: string;
  ano: number;
  mes: number;
  valor: number;
  fonte: string;
  documentoId?: string | null;
  regimeNoPeriodo?: string | null;
  confianca?: number | null;
  observacao?: string | null;
}

export interface ResultadoRegistroFaturamento {
  registro: RegistroFaturamentoCompetencia;
  acao: 'inserido' | 'atualizado' | 'ignorado_evidencia_fraca';
}

/**
 * Registra (ou atualiza) o faturamento de UMA competência. Nunca cria
 * duplicata para o mesmo (empresa, ano, mês) -- e nunca deixa uma evidência
 * mais fraca substituir uma já registrada mais forte, para não regredir um
 * valor bem confirmado por causa de uma leitura posterior de pior qualidade.
 */
export async function registrarFaturamentoCompetencia(
  db: Queryable,
  params: RegistrarFaturamentoCompetenciaParams,
): Promise<ResultadoRegistroFaturamento> {
  const { empresaId, ano, mes, valor, fonte } = params;
  const documentoId = params.documentoId ?? null;
  const regimeNoPeriodo = params.regimeNoPeriodo ?? null;
  const confianca = params.confianca ?? null;
  const observacao = params.observacao ?? null;

  const { rows: existentes } = await db.query(
    `SELECT id, empresa_id, ano, mes, valor, fonte, documento_id, regime_no_periodo, confianca, observacao
       FROM public.empresas_faturamento_mensal
      WHERE empresa_id = $1 AND ano = $2 AND mes = $3`,
    [empresaId, ano, mes],
  );
  const existente = existentes[0] || null;

  if (existente && (confianca ?? 0) <= (existente.confianca ?? 0)) {
    return { registro: { ...existente, valor: Number(existente.valor) }, acao: 'ignorado_evidencia_fraca' };
  }

  if (existente) {
    const { rows } = await db.query(
      `UPDATE public.empresas_faturamento_mensal
          SET valor = $2, fonte = $3, documento_id = $4, regime_no_periodo = $5, confianca = $6, observacao = $7
        WHERE id = $1
        RETURNING id, empresa_id, ano, mes, valor, fonte, documento_id, regime_no_periodo, confianca, observacao`,
      [existente.id, valor, fonte, documentoId, regimeNoPeriodo, confianca, observacao],
    );
    return { registro: { ...rows[0], valor: Number(rows[0].valor) }, acao: 'atualizado' };
  }

  const { rows } = await db.query(
    `INSERT INTO public.empresas_faturamento_mensal
       (empresa_id, ano, mes, valor, fonte, documento_id, regime_no_periodo, confianca, observacao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, empresa_id, ano, mes, valor, fonte, documento_id, regime_no_periodo, confianca, observacao`,
    [empresaId, ano, mes, valor, fonte, documentoId, regimeNoPeriodo, confianca, observacao],
  );
  return { registro: { ...rows[0], valor: Number(rows[0].valor) }, acao: 'inserido' };
}

export interface FaturamentoRolling12Meses {
  referencia: CompetenciaMensal;
  janela: CompetenciaMensal[];
  competencias: RegistroFaturamentoCompetencia[];
  total: number;
  meses_com_dado: number;
  meses_faltantes: CompetenciaMensal[];
  completo: boolean;
  regimes_no_periodo: string[];
}

/**
 * Soma os últimos 12 meses fechados (ou a janela terminando na competência
 * de referência informada). A janela sempre avança para a competência mais
 * recente sem invalidar nada do histórico acumulado -- é só uma consulta
 * diferente sobre os mesmos dados.
 */
export async function obterFaturamentoRolling12Meses(
  db: Queryable,
  empresaId: string,
  referencia?: CompetenciaMensal,
): Promise<FaturamentoRolling12Meses> {
  const referenciaEfetiva = referencia || ultimoMesFechado();
  const janela = janela12Meses(referenciaEfetiva);
  const chavesJanela = new Set(janela.map(chaveCompetencia));

  const todas = await obterFaturamentoCompetencias(db, empresaId);
  const competencias = todas.filter((registro) => chavesJanela.has(chaveCompetencia({ ano: registro.ano, mes: registro.mes })));

  const chavesComDado = new Set(competencias.map((registro) => chaveCompetencia({ ano: registro.ano, mes: registro.mes })));
  const mesesFaltantes = janela.filter((competencia) => !chavesComDado.has(chaveCompetencia(competencia)));

  const total = competencias.reduce((soma, registro) => soma + registro.valor, 0);
  const regimesNoPeriodo = Array.from(new Set(
    competencias.map((registro) => registro.regime_no_periodo).filter((regime): regime is string => Boolean(regime)),
  ));

  return {
    referencia: referenciaEfetiva,
    janela,
    competencias,
    total,
    meses_com_dado: competencias.length,
    meses_faltantes: mesesFaltantes,
    completo: mesesFaltantes.length === 0,
    regimes_no_periodo: regimesNoPeriodo,
  };
}
