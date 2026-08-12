import { normalizarBasico, onlyDigits, parseDate } from '../utils/helpers';

export type AlertaRegraDocumental = {
  codigo: string;
  mensagem: string;
  severidade: 'baixa' | 'media' | 'alta' | 'critica';
  campo?: string;
  valor_documento?: unknown;
  valor_receita?: unknown;
  recomendacao?: string;
};

type AssinaturaExtraida = {
  presente?: boolean | null;
  nome?: string | null;
  tipo?: 'manual' | 'eletronica' | string | null;
};

function nomeEquivalente(a: unknown, b: unknown): boolean {
  const na = normalizarBasico(a);
  const nb = normalizarBasico(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function normalizarMesReferencia(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const br = raw.match(/\b(0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})\b/);
  if (br) return `${br[2].length === 2 ? `20${br[2]}` : br[2]}-${br[1].padStart(2, '0')}`;
  const data = parseDate(raw);
  return data ? data.slice(0, 7) : null;
}

export function ultimoMesFechado(referencia: Date = new Date()): string {
  const data = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() - 1, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

function diferencaMeses(referencia: Date, mes: string): number | null {
  const match = mes.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (!match) return null;
  return (referencia.getUTCFullYear() - Number(match[1])) * 12 + (referencia.getUTCMonth() + 1 - Number(match[2]));
}

function tipoAssinatura(value: unknown): string | null {
  const texto = normalizarBasico(value);
  if (!texto) return null;
  if (/eletron|digital|icp|govbr/.test(texto)) return 'eletronica';
  if (/manual|manuscrit|fisic/.test(texto)) return 'manual';
  return texto;
}

export function validarFaturamentoExtraido(
  empresa: any,
  socios: any[],
  dados: any,
  referencia: Date = new Date(),
): { dados: Record<string, any>; alertas: AlertaRegraDocumental[] } {
  const alertas: AlertaRegraDocumental[] = [];
  if (dados?.documento_compativel === false) {
    alertas.push({ codigo: 'faturamento_documento_incompativel', mensagem: 'O arquivo não foi reconhecido como relação de faturamento.', severidade: 'alta', recomendacao: 'Reclassificar ou anexar a relação de faturamento correta.' });
  }
  const meses = Array.from(new Set((Array.isArray(dados?.meses_referencia) ? dados.meses_referencia : [])
    .map(normalizarMesReferencia)
    .filter(Boolean))) as string[];
  meses.sort();
  const ultimoFechado = ultimoMesFechado(referencia);
  const ultimoMes = meses.at(-1) || null;
  const primeiroMes = meses[0] || null;

  if (!meses.length) {
    alertas.push({ codigo: 'faturamento_meses_nao_identificados', campo: 'meses_referencia', mensagem: 'Não foi possível identificar os meses relacionados no faturamento.', severidade: 'alta', recomendacao: 'Anexar relação legível com a competência de cada mês.' });
  } else {
    if (ultimoMes! > ultimoFechado) {
      alertas.push({ codigo: 'faturamento_mes_ainda_nao_fechado', campo: 'meses_referencia', mensagem: `O faturamento inclui ${ultimoMes}, mas o último mês fechado na data da análise é ${ultimoFechado}.`, severidade: 'alta', valor_documento: ultimoMes, valor_receita: ultimoFechado, recomendacao: 'Corrigir a relação para terminar no último mês efetivamente encerrado.' });
    }
    if (meses.length !== 12) {
      alertas.push({ codigo: 'faturamento_periodo_diferente_12_meses', campo: 'meses_referencia', mensagem: `Foram identificados ${meses.length} mês(es), e não os 12 meses esperados.`, severidade: 'media', valor_documento: meses.length, recomendacao: 'Revisar se todas as competências foram incluídas.' });
    }
  }

  const dataAssinatura = parseDate(dados?.data_assinatura);
  const primeiroDiaAposUltimoMes = ultimoMes ? `${ultimoMes}-01` : null;
  let limiteAssinatura: string | null = null;
  if (primeiroDiaAposUltimoMes) {
    const limite = new Date(`${primeiroDiaAposUltimoMes}T12:00:00Z`);
    limite.setUTCMonth(limite.getUTCMonth() + 1);
    limiteAssinatura = limite.toISOString().slice(0, 10);
  }
  if (!dataAssinatura) {
    alertas.push({ codigo: 'faturamento_data_assinatura_nao_identificada', campo: 'data_assinatura', mensagem: 'A data de assinatura da relação de faturamento não foi identificada.', severidade: 'alta' });
  } else if (limiteAssinatura && dataAssinatura < limiteAssinatura) {
    alertas.push({ codigo: 'faturamento_assinado_antes_fechamento', campo: 'data_assinatura', mensagem: 'A assinatura foi feita antes do encerramento do último mês informado.', severidade: 'alta', valor_documento: dataAssinatura, valor_receita: limiteAssinatura, recomendacao: 'Gerar e assinar novamente a relação após o fechamento da última competência.' });
  }

  const assinaturaSocio: AssinaturaExtraida = dados?.assinatura_socio_administrador || {};
  const assinaturaContador: AssinaturaExtraida = dados?.assinatura_contador || {};
  if (assinaturaSocio.presente !== true) alertas.push({ codigo: 'faturamento_assinatura_socio_ausente', campo: 'assinatura_socio_administrador', mensagem: 'Não foi confirmada a assinatura do sócio-administrador.', severidade: 'alta' });
  if (assinaturaContador.presente !== true) alertas.push({ codigo: 'faturamento_assinatura_contador_ausente', campo: 'assinatura_contador', mensagem: 'Não foi confirmada a assinatura do contador responsável.', severidade: 'alta' });
  const tipoSocio = tipoAssinatura(assinaturaSocio.tipo);
  const tipoContador = tipoAssinatura(assinaturaContador.tipo);
  if (tipoSocio && tipoContador && tipoSocio !== tipoContador) {
    alertas.push({ codigo: 'faturamento_assinaturas_modalidades_divergentes', campo: 'assinaturas', mensagem: 'As assinaturas do sócio-administrador e do contador usam modalidades diferentes.', severidade: 'alta', valor_documento: { socio: tipoSocio, contador: tipoContador }, recomendacao: 'Usar duas assinaturas manuais ou duas assinaturas eletrônicas.' });
  }

  const cnpjDocumento = onlyDigits(dados?.cnpj);
  const cnpjEmpresa = onlyDigits(empresa?.cnpj);
  if (!cnpjDocumento) alertas.push({ codigo: 'faturamento_cnpj_nao_identificado', campo: 'cnpj', mensagem: 'O CNPJ não foi identificado no faturamento.', severidade: 'alta' });
  else if (cnpjEmpresa && cnpjDocumento !== cnpjEmpresa) alertas.push({ codigo: 'faturamento_cnpj_divergente', campo: 'cnpj', mensagem: 'O CNPJ da relação de faturamento não pertence à empresa analisada.', severidade: 'critica', valor_documento: dados?.cnpj, valor_receita: empresa?.cnpj });

  const administradores = (Array.isArray(socios) ? socios : []).filter((socio) => socio?.administrador === true || /administrador|titular/i.test(String(socio?.qualificacao || socio?.cargo || '')));
  if (assinaturaSocio.nome && administradores.length && !administradores.some((socio) => nomeEquivalente(assinaturaSocio.nome, socio?.nome))) {
    alertas.push({ codigo: 'faturamento_signatario_nao_administrador', campo: 'assinatura_socio_administrador', mensagem: 'O signatário identificado não corresponde a um sócio-administrador do QSA.', severidade: 'critica', valor_documento: assinaturaSocio.nome, valor_receita: administradores.map((socio) => socio?.nome) });
  }

  return {
    dados: {
      ...dados,
      meses_referencia: meses,
      primeiro_mes_identificado: primeiroMes,
      ultimo_mes_identificado: ultimoMes,
      ultimo_mes_fechado_na_analise: ultimoFechado,
      data_assinatura: dataAssinatura,
      assinatura_valida_apos_fechamento: !!dataAssinatura && !!limiteAssinatura && dataAssinatura >= limiteAssinatura,
      assinaturas_mesma_modalidade: !!tipoSocio && !!tipoContador && tipoSocio === tipoContador,
      documento_obrigatorio: false,
    },
    alertas,
  };
}

export function validarComprovanteEnderecoExtraido(
  socios: any[],
  dados: any,
  socioAlvoId: string | null = null,
  referencia: Date = new Date(),
): { dados: Record<string, any>; alertas: AlertaRegraDocumental[] } {
  const alertas: AlertaRegraDocumental[] = [];
  if (dados?.documento_compativel === false) {
    alertas.push({ codigo: 'endereco_documento_incompativel', mensagem: 'O arquivo não foi reconhecido como comprovante de endereço.', severidade: 'alta', recomendacao: 'Reclassificar ou anexar um comprovante legível.' });
  }
  const mesReferencia = normalizarMesReferencia(dados?.mes_referencia || dados?.data_emissao || dados?.data_vencimento);
  const diferenca = mesReferencia ? diferencaMeses(referencia, mesReferencia) : null;
  if (!mesReferencia) {
    alertas.push({ codigo: 'endereco_mes_referencia_nao_identificado', campo: 'mes_referencia', mensagem: 'O mês de referência do comprovante de endereço não foi identificado.', severidade: 'alta' });
  } else if (diferenca === null || diferenca < 0 || diferenca > 2) {
    alertas.push({ codigo: 'endereco_fora_validade_dois_meses', campo: 'mes_referencia', mensagem: 'O comprovante de endereço está fora da validade máxima de dois meses em relação ao mês atual.', severidade: 'alta', valor_documento: mesReferencia, recomendacao: 'Solicitar comprovante do mês atual ou de até dois meses anteriores.' });
  }

  const sociosAtivos = (Array.isArray(socios) ? socios : []).filter((socio) => socio?.ativo !== false);
  const socioAlvo = sociosAtivos.find((socio) => String(socio?.id) === String(socioAlvoId || '')) || null;
  const titular = String(dados?.nome_titular || '').trim();
  const titularConfere = !!titular && (socioAlvo
    ? nomeEquivalente(titular, socioAlvo?.nome)
    : sociosAtivos.some((socio) => nomeEquivalente(titular, socio?.nome)));
  if (!titular) {
    alertas.push({ codigo: 'endereco_titular_nao_identificado', campo: 'nome_titular', mensagem: 'O nome do titular não foi identificado no comprovante.', severidade: 'alta' });
  } else if (!titularConfere) {
    alertas.push({ codigo: 'endereco_titular_diferente_socio', campo: 'nome_titular', mensagem: 'O comprovante foi aceito, mas o titular não corresponde ao sócio vinculado. É obrigatória uma justificativa.', severidade: 'media', valor_documento: titular, valor_receita: socioAlvo?.nome || sociosAtivos.map((socio) => socio?.nome), recomendacao: 'Registrar a justificativa do vínculo do titular com o sócio.' });
  }

  return {
    dados: {
      ...dados,
      mes_referencia: mesReferencia,
      diferenca_meses: diferenca,
      socio_alvo_id: socioAlvoId,
      socio_alvo_nome: socioAlvo?.nome || null,
      titular_confere_com_socio: titularConfere,
      exige_justificativa_titular: !!titular && !titularConfere,
      comprovante_dentro_validade: diferenca !== null && diferenca >= 0 && diferenca <= 2,
    },
    alertas,
  };
}

export function calcularCoberturaDocumentalSocios(
  socios: any[],
  documentos: any[],
  tiposExigidos: string[],
) {
  const sociosAtivos = (Array.isArray(socios) ? socios : []).filter((socio) => socio?.ativo !== false && socio?.id);
  const tipos = Array.from(new Set(tiposExigidos.filter(Boolean)));
  const porSocio = sociosAtivos.map((socio) => {
    const docsSocio = (Array.isArray(documentos) ? documentos : []).filter((doc) => String(doc?.socio_id || '') === String(socio.id));
    const faltantes = tipos.filter((tipo) => !docsSocio.some((doc) => String(doc?.tipo_documento) === tipo));
    return { socio_id: socio.id, socio_nome: socio.nome || null, total_exigido: tipos.length, total_presente: tipos.length - faltantes.length, tipos_faltantes: faltantes, completo: faltantes.length === 0 };
  });
  return { total_socios: sociosAtivos.length, socios_completos: porSocio.filter((item) => item.completo).length, completo: porSocio.every((item) => item.completo), por_socio: porSocio };
}
