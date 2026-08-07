import { normalizeText, onlyDigits, parseDate } from '../utils/helpers';

export type RegistroSocietario = {
  numero?: string | null;
  data?: string | null;
  tipo_ato?: string | null;
};

export type DocumentoSocietarioAnalisado = {
  arquivo_id?: string | null;
  nome?: string | null;
  nire?: string | null;
  data_registro?: string | null;
  tipo_ato?: string | null;
  consistente?: boolean;
};

export function calcularCadeiaComprovacaoSocietaria(
  historicoEntrada: RegistroSocietario[],
  documentosEntrada: DocumentoSocietarioAnalisado[],
  referencia: Date = new Date(),
) {
  const relevante = (tipo: unknown) => /alterac|contrato|consolidac|constituic|registro/i.test(normalizeText(tipo));
  const historico = (Array.isArray(historicoEntrada) ? historicoEntrada : [])
    .map((item) => ({
      numero: item?.numero ? String(item.numero).trim() : null,
      data: parseDate(item?.data),
      tipo_ato: item?.tipo_ato ? String(item.tipo_ato).trim() : null,
    }))
    .filter((item) => item.data && relevante(item.tipo_ato))
    .filter((item, index, array) => array.findIndex((outro) => `${outro.data}|${outro.numero}|${outro.tipo_ato}` === `${item.data}|${item.numero}|${item.tipo_ato}`) === index)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));

  const documentos = (Array.isArray(documentosEntrada) ? documentosEntrada : [])
    .map((item) => ({ ...item, data_registro: parseDate(item?.data_registro), nire: onlyDigits(item?.nire) || null }))
    .filter((item) => item.data_registro);

  const dataCorte = new Date(referencia);
  dataCorte.setMonth(dataCorte.getMonth() - 12);
  const corte = dataCorte.toISOString().slice(0, 10);
  const registrosRequeridos: Array<{ numero: string | null; data: string; tipo_ato: string | null }> = [];
  const ultimo = historico[0] || null;

  if (ultimo) {
    registrosRequeridos.push(ultimo as any);
    let atual = ultimo;
    while (String(atual.data) > corte) {
      const anterior = historico.find((item) => String(item.data) < String(atual.data));
      if (!anterior) break;
      registrosRequeridos.push(anterior as any);
      atual = anterior;
      if (String(atual.data) <= corte) break;
    }
  }

  const comprovados = registrosRequeridos.map((registro) => {
    const documento = documentos.find((item) => item.data_registro === registro.data && item.consistente !== false);
    return { ...registro, comprovado: !!documento, documento_arquivo_id: documento?.arquivo_id || null, documento_nome: documento?.nome || null };
  });
  const faltantes = comprovados.filter((item) => !item.comprovado);
  const registroBase = registrosRequeridos.at(-1) || null;
  const historicoCobreCorte = !!ultimo && (String(ultimo.data) <= corte || (!!registroBase && String(registroBase.data) <= corte));
  const continuidade = historicoCobreCorte && faltantes.length === 0;

  const mesesEntre = (maisNova?: string | null, maisAntiga?: string | null): number | null => {
    if (!maisNova || !maisAntiga) return null;
    const a = new Date(`${maisNova}T12:00:00Z`);
    const b = new Date(`${maisAntiga}T12:00:00Z`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.max(0, (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth()));
  };

  return {
    data_referencia: referencia.toISOString().slice(0, 10),
    data_corte_12_meses: corte,
    ultimo_registro: ultimo,
    registros_requeridos: comprovados,
    registros_faltantes: faltantes,
    total_documentos_analisados: documentos.length,
    historico_cobre_12_meses: historicoCobreCorte,
    continuidade_12_meses_comprovada: continuidade,
    meses_entre_registros_extremos: mesesEntre(ultimo?.data || null, registroBase?.data || null),
    diagnostico: !ultimo
      ? 'Não foi possível identificar registros societários na certidão da Junta.'
      : continuidade
        ? 'A cadeia de contratos/alterações exigida comprova pelo menos 12 meses de continuidade societária.'
        : faltantes.length
          ? `Faltam ${faltantes.length} contrato(s) ou alteração(ões) correspondente(s) aos registros indicados.`
          : 'O histórico da Junta ainda não alcança a data mínima de 12 meses para a comprovação solicitada.',
  };
}

