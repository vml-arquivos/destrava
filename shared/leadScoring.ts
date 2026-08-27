export interface LeadScoreInput {
  valor_solicitado?: number | null;
  prazo_meses?: number | null;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  empresa?: string | null;
  cpf_cnpj?: string | null;
  temperatura?: string | null;
}

/**
 * Pontuação operacional determinística, sem IA, de 0 a 100.
 * A mesma fórmula é usada na captura, na fila e no backfill da migração.
 */
export function calcularScoreBasico(lead: LeadScoreInput): number {
  let score = 0;

  const valor = Number(lead.valor_solicitado) || 0;
  if (valor > 0) {
    const logScore = Math.min(30, Math.round((Math.log10(valor) / Math.log10(5_000_000)) * 30));
    score += Math.max(0, logScore);
  }

  const prazo = Number(lead.prazo_meses) || 0;
  if (prazo >= 60) score += 20;
  else if (prazo >= 36) score += 15;
  else if (prazo >= 24) score += 10;
  else if (prazo >= 12) score += 5;
  else if (prazo > 0) score += 2;

  const campos = [lead.nome, lead.telefone, lead.email, lead.empresa, lead.cpf_cnpj];
  const preenchidos = campos.filter((campo) => campo && String(campo).trim().length > 0).length;
  score += preenchidos * 6;

  const temperatura: Record<string, number> = { frio: 0, morno: 8, quente: 15, urgente: 20 };
  score += temperatura[lead.temperatura ?? "frio"] ?? 0;

  return Math.min(100, Math.max(0, score));
}

export function calcularScoreEfetivo(lead: LeadScoreInput & {
  score_ia?: number | null;
  score_manual?: number | null;
  score_basico?: number | null;
}): number {
  if (lead.score_manual !== null && lead.score_manual !== undefined) return Number(lead.score_manual) || 0;
  if (lead.score_ia !== null && lead.score_ia !== undefined && Number(lead.score_ia) > 0) return Number(lead.score_ia);
  if (lead.score_basico !== null && lead.score_basico !== undefined) return Number(lead.score_basico) || 0;
  return calcularScoreBasico(lead);
}
