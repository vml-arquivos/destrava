import type { Pool } from "pg";

export const FOLLOWUP_ORIGEM_MATURIDADE_12_MESES =
  "maturidade_12_meses" as const;

export type EmpresaMaturidadeRow = {
  id: string;
  data_abertura?: string | Date | null;
  status?: string | null;
  arquivado_por_duplicidade?: boolean | null;
};

export type EmpresaMaturidadeFollowup = {
  id: string;
  empresa_id: string;
  titulo: string;
  tipo: string;
  data_agendada: string | Date;
  descricao: string | null;
  origem: string;
  concluido: boolean;
  concluido_em?: string | Date | null;
};

type ReconciliarOptions = {
  empresaApta12Meses?: boolean | null;
  agora?: Date;
};

type ReconciliarResult = {
  followup: EmpresaMaturidadeFollowup | null;
  alterado: boolean;
};

function parseDateOnly(
  value: unknown
): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const raw =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month: month - 1, day };
}

/** Adds twelve calendar months to a DATE without allowing JavaScript timezone drift. */
export function calcularDataMaturidade12Meses(value: unknown): Date | null {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  const targetMonth = parsed.month + 12;
  const ultimoDiaMesDestino = new Date(
    Date.UTC(parsed.year, targetMonth + 1, 0)
  ).getUTCDate();
  return new Date(
    Date.UTC(
      parsed.year,
      targetMonth,
      Math.min(parsed.day, ultimoDiaMesDestino)
    )
  );
}

export function formatarDataMaturidade12Meses(value: Date): string {
  return value.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function empresaInativaParaAcompanhamento(
  empresa: EmpresaMaturidadeRow
): boolean {
  if (empresa.arquivado_por_duplicidade === true) return true;
  const status = String(empresa.status || "")
    .trim()
    .toLowerCase();
  return new Set([
    "inativo",
    "inativa",
    "arquivado",
    "arquivada",
    "excluido",
    "excluida",
    "removido",
    "removida",
  ]).has(status);
}

function mesmoInstante(a: unknown, b: Date): boolean {
  if (!a) return false;
  const data = a instanceof Date ? a : new Date(String(a));
  return !Number.isNaN(data.getTime()) && data.getTime() === b.getTime();
}

function textoFollowup(dataMaturidade: Date) {
  const data = formatarDataMaturidade12Meses(dataMaturidade);
  return {
    titulo: `Reavaliar elegibilidade de crédito — empresa completa 12 meses de abertura em ${data}.`,
    descricao: `Lembrete automático de acompanhamento. Reavaliar a aptidão para crédito a partir de ${data}, após revisar os documentos e demais critérios vigentes.`,
  };
}

/**
 * Ensures one automatic company follow-up. Missing legacy schema is deliberately
 * treated as a no-op so old installations keep loading normally until migrated.
 */
export async function reconciliarFollowupMaturidade12Meses(
  pool: Pool,
  empresaId: string,
  options: ReconciliarOptions = {}
): Promise<ReconciliarResult> {
  const agora = options.agora || new Date();
  const { rows: empresas } = await pool.query<EmpresaMaturidadeRow>(
    `SELECT id, data_abertura, status, arquivado_por_duplicidade
       FROM empresas
      WHERE id = $1
      LIMIT 1`,
    [empresaId]
  );
  const empresa = empresas[0];
  if (!empresa) return { followup: null, alterado: false };

  const dataMaturidade = calcularDataMaturidade12Meses(empresa.data_abertura);
  let atual: EmpresaMaturidadeFollowup | null = null;
  try {
    const result = await pool.query<EmpresaMaturidadeFollowup>(
      `SELECT *
         FROM empresa_followups
        WHERE empresa_id = $1
          AND origem = $2
        ORDER BY created_at ASC
        LIMIT 1`,
      [empresaId, FOLLOWUP_ORIGEM_MATURIDADE_12_MESES]
    );
    atual = result.rows[0] || null;
  } catch (error: any) {
    if (["42P01", "42703"].includes(String(error?.code || "")))
      return { followup: null, alterado: false };
    throw error;
  }

  if (!dataMaturidade || empresaInativaParaAcompanhamento(empresa)) {
    if (!atual || atual.concluido) return { followup: atual, alterado: false };
    const { rows } = await pool.query<EmpresaMaturidadeFollowup>(
      `UPDATE empresa_followups
          SET concluido = true,
              concluido_em = COALESCE(concluido_em, NOW()),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [atual.id]
    );
    return { followup: rows[0] || atual, alterado: true };
  }

  const textos = textoFollowup(dataMaturidade);
  const empresaAindaRecente =
    options.empresaApta12Meses === false ||
    (options.empresaApta12Meses == null &&
      dataMaturidade.getTime() > agora.getTime());

  if (!atual) {
    if (!empresaAindaRecente) return { followup: null, alterado: false };
    try {
      const { rows } = await pool.query<EmpresaMaturidadeFollowup>(
        `INSERT INTO empresa_followups
          (empresa_id, titulo, tipo, data_agendada, descricao, origem)
         VALUES ($1, $2, 'ligacao', $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          empresaId,
          textos.titulo,
          dataMaturidade.toISOString(),
          textos.descricao,
          FOLLOWUP_ORIGEM_MATURIDADE_12_MESES,
        ]
      );
      if (rows[0]) return { followup: rows[0], alterado: true };
    } catch (error: any) {
      if (["42P01", "42703"].includes(String(error?.code || "")))
        return { followup: null, alterado: false };
      throw error;
    }
    const { rows } = await pool.query<EmpresaMaturidadeFollowup>(
      `SELECT *
         FROM empresa_followups
        WHERE empresa_id = $1
          AND origem = $2
        ORDER BY created_at ASC
        LIMIT 1`,
      [empresaId, FOLLOWUP_ORIGEM_MATURIDADE_12_MESES]
    );
    return { followup: rows[0] || null, alterado: Boolean(rows[0]) };
  }

  const dataAtualDivergente = !mesmoInstante(
    atual.data_agendada,
    dataMaturidade
  );
  const textoDivergente =
    atual.titulo !== textos.titulo || atual.descricao !== textos.descricao;
  const deveReabrir =
    dataAtualDivergente && atual.concluido && empresaAindaRecente;
  if (!dataAtualDivergente && !textoDivergente && !deveReabrir)
    return { followup: atual, alterado: false };

  const { rows } = await pool.query<EmpresaMaturidadeFollowup>(
    `UPDATE empresa_followups
        SET titulo = $1,
            data_agendada = $2,
            descricao = $3,
            concluido = CASE WHEN $4 THEN false ELSE concluido END,
            concluido_em = CASE WHEN $4 THEN NULL ELSE concluido_em END,
            updated_at = NOW()
      WHERE id = $5
      RETURNING *`,
    [
      textos.titulo,
      dataMaturidade.toISOString(),
      textos.descricao,
      deveReabrir,
      atual.id,
    ]
  );
  return { followup: rows[0] || atual, alterado: true };
}
