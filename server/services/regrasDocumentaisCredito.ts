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


export type AplicabilidadeRegra = 'aplicavel' | 'condicional' | 'nao_aplicavel' | 'automatico';
export type StatusRegraDocumental = 'nao_aplicavel' | 'pendente' | 'anexado' | 'em_analise' | 'validado' | 'validado_com_alerta' | 'reprovado' | 'vencido' | 'substituido' | 'dispensado';

export type RegraDocumentalCredito = {
  codigo: string;
  tipo_documento: string;
  nome_amigavel: string;
  categoria?: string | null;
  entidade_tipo: 'empresa' | 'socio' | 'garantia' | string;
  escopo: string;
  obrigatorio: boolean;
  permite_multiplos: boolean;
  validade_dias?: number | null;
  condicao: Record<string, any>;
  descricao?: string | null;
  tipo_exigencia?: string | null;
  regra_validacao?: Record<string, any>;
  regra_cruzamento?: Record<string, any>;
  bloqueia_etapa?: number | null;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
  versao?: string | null;
  ativo?: boolean;
  fonte?: string | null;
};

export type ContextoRegraDocumental = {
  regime?: string | null;
  natureza_juridica?: string | null;
  porte?: string | null;
  cnae?: string | null;
  atividade?: string | null;
  possui_inscricao_estadual?: boolean | null;
  possui_inscricao_municipal?: boolean | null;
  possui_empregados?: boolean | null;
  atividade_regulada?: boolean | null;
  linha_credito?: string | null;
  finalidade?: string | null;
  possui_garantia?: boolean | null;
  etapa_atual?: number | null;
  competencia?: string | null;
  referencia?: Date;
};

export type RegraResolvida = RegraDocumentalCredito & {
  aplicabilidade: AplicabilidadeRegra;
  status: StatusRegraDocumental;
  motivo_aplicabilidade: string;
  fonte_resolucao: 'banco' | 'fallback';
};

const FALLBACK_REGRAS_DOCUMENTAIS: RegraDocumentalCredito[] = [
  {
    codigo: 'empresa_faturamento_12m', tipo_documento: 'faturamento_12_meses', nome_amigavel: 'Faturamento dos últimos 12 meses',
    entidade_tipo: 'empresa', escopo: 'empresa', obrigatorio: false, permite_multiplos: true, validade_dias: null,
    condicao: { quando_anexado: true }, descricao: 'Documento opcional universalmente; quando anexado, deve ser analisado.', tipo_exigencia: 'boa_pratica_analise', bloqueia_etapa: null, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
  {
    codigo: 'empresa_pgdas', tipo_documento: 'pgdas', nome_amigavel: 'PGDAS-D', entidade_tipo: 'empresa', escopo: 'empresa', obrigatorio: false, permite_multiplos: true, condicao: { regime: 'simples_nacional' }, tipo_exigencia: 'obrigacao_legal', bloqueia_etapa: 4, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
  {
    codigo: 'empresa_defis', tipo_documento: 'defis', nome_amigavel: 'DEFIS', entidade_tipo: 'empresa', escopo: 'empresa', obrigatorio: false, permite_multiplos: true, condicao: { regime: 'simples_nacional', exceto: 'mei' }, tipo_exigencia: 'obrigacao_legal', bloqueia_etapa: 4, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
  {
    codigo: 'empresa_dasn_simei', tipo_documento: 'dasn_simei', nome_amigavel: 'DASN-SIMEI', entidade_tipo: 'empresa', escopo: 'empresa', obrigatorio: false, permite_multiplos: true, condicao: { regime: 'mei' }, tipo_exigencia: 'obrigacao_legal', bloqueia_etapa: 4, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
  {
    codigo: 'empresa_ecf', tipo_documento: 'ecf', nome_amigavel: 'ECF', entidade_tipo: 'empresa', escopo: 'empresa', obrigatorio: false, permite_multiplos: true, condicao: { regime: ['lucro_presumido', 'lucro_real', 'lucro_arbitrado'] }, tipo_exigencia: 'obrigacao_legal', bloqueia_etapa: 4, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
  {
    codigo: 'empresa_cndt', tipo_documento: 'cndt', nome_amigavel: 'CNDT', entidade_tipo: 'empresa', escopo: 'empresa', obrigatorio: false, permite_multiplos: false, condicao: { somente_se: 'possui_empregados_ou_linha_exigir' }, tipo_exigencia: 'politica_bancaria', bloqueia_etapa: null, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
  {
    codigo: 'empresa_cnd_estadual', tipo_documento: 'cnd_estadual', nome_amigavel: 'CND estadual', entidade_tipo: 'empresa', escopo: 'empresa', obrigatorio: false, permite_multiplos: false, condicao: { somente_se: 'possui_inscricao_estadual_ou_atividade_exigir' }, tipo_exigencia: 'politica_bancaria', bloqueia_etapa: null, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
  {
    codigo: 'socio_documento_id', tipo_documento: 'documento_socio', nome_amigavel: 'Documento de identificação do sócio', entidade_tipo: 'socio', escopo: 'socio', obrigatorio: true, permite_multiplos: true, condicao: { depois_etapa: 2 }, tipo_exigencia: 'obrigacao_legal', bloqueia_etapa: 3, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
  {
    codigo: 'socio_comprovante_residencia', tipo_documento: 'comprovante_residencia', nome_amigavel: 'Comprovante de residência do sócio', entidade_tipo: 'socio', escopo: 'socio', obrigatorio: true, permite_multiplos: false, validade_dias: 60, condicao: { depois_etapa: 2 }, tipo_exigencia: 'obrigacao_legal', bloqueia_etapa: 3, versao: 'fallback-2026.08.29', ativo: true, fonte: 'matriz_estrategica_2026',
  },
];

function normalizarRegraContexto(value: unknown): string {
  return normalizarBasico(value).replace(/\s+/g, '_');
}

function arrayOuValor(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizarRegraContexto) : [normalizarRegraContexto(value)];
}

function regraVigente(regra: RegraDocumentalCredito, referencia: Date): boolean {
  if (regra.ativo === false) return false;
  const inicio = regra.vigencia_inicio ? new Date(`${regra.vigencia_inicio}T00:00:00Z`) : null;
  const fim = regra.vigencia_fim ? new Date(`${regra.vigencia_fim}T23:59:59Z`) : null;
  if (inicio && !Number.isNaN(inicio.getTime()) && inicio > referencia) return false;
  if (fim && !Number.isNaN(fim.getTime()) && fim < referencia) return false;
  return true;
}

export function avaliarAplicabilidadeRegra(regra: RegraDocumentalCredito, contexto: ContextoRegraDocumental): Pick<RegraResolvida, 'aplicabilidade' | 'status' | 'motivo_aplicabilidade'> {
  const etapa = Number(contexto.etapa_atual || 1);
  const regime = normalizarRegraContexto(contexto.regime);
  const condicao = regra.condicao || {};
  const regimes = condicao.regime ? arrayOuValor(condicao.regime) : [];
  if (regimes.length && !regimes.includes(regime)) {
    return { aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo_aplicabilidade: `A regra é específica para ${regimes.join(', ')} e o regime atual é ${regime || 'não identificado'}.` };
  }
  if (condicao.exceto && regime === normalizarRegraContexto(condicao.exceto)) {
    return { aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo_aplicabilidade: `A regra não se aplica ao regime ${regime}.` };
  }
  if (condicao.depois_etapa && etapa < Number(condicao.depois_etapa)) {
    return { aplicabilidade: 'condicional', status: 'nao_aplicavel', motivo_aplicabilidade: 'Dados pessoais e documentos de sócios só entram após a conclusão da etapa societária.' };
  }
  if (condicao.somente_se === 'possui_empregados_ou_linha_exigir' && contexto.possui_empregados !== true && !contexto.linha_credito) {
    return { aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo_aplicabilidade: 'A empresa não possui empregados identificados e não há linha bancária que exija a certidão.' };
  }
  if (condicao.somente_se === 'possui_inscricao_estadual_ou_atividade_exigir' && contexto.possui_inscricao_estadual !== true && contexto.atividade_regulada !== true && !contexto.linha_credito) {
    return { aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo_aplicabilidade: 'Não há inscrição estadual ou atividade regulada que justifique a exigência automática.' };
  }
  if (regra.fonte && /receita|automatic/i.test(regra.fonte)) {
    return { aplicabilidade: 'automatico', status: 'validado', motivo_aplicabilidade: 'Dado obtido de fonte automática; upload físico não é necessário.' };
  }
  if (regra.obrigatorio) return { aplicabilidade: 'aplicavel', status: 'pendente', motivo_aplicabilidade: regra.descricao || 'Documento aplicável ao contexto informado.' };
  return { aplicabilidade: 'condicional', status: 'pendente', motivo_aplicabilidade: regra.descricao || 'Documento complementar ou exigido conforme operação.' };
}

function chaveCacheRegras(contexto: ContextoRegraDocumental): string {
  return JSON.stringify({
    regime: normalizarRegraContexto(contexto.regime),
    natureza: normalizarRegraContexto(contexto.natureza_juridica),
    porte: normalizarRegraContexto(contexto.porte),
    cnae: normalizarRegraContexto(contexto.cnae),
    atividade: normalizarRegraContexto(contexto.atividade),
    ie: contexto.possui_inscricao_estadual,
    im: contexto.possui_inscricao_municipal,
    empregados: contexto.possui_empregados,
    regulada: contexto.atividade_regulada,
    linha: normalizarRegraContexto(contexto.linha_credito),
    garantia: contexto.possui_garantia,
    etapa: contexto.etapa_atual,
    competencia: contexto.competencia,
  });
}

export type QueryableRules = { query: (text: string, values?: any[]) => Promise<{ rows: any[] }> };
const cacheRegrasDocumentais = new Map<string, { expiresAt: number; regras: RegraDocumentalCredito[] }>();

function normalizarRegraBanco(row: any): RegraDocumentalCredito {
  return {
    codigo: String(row.codigo || ''),
    tipo_documento: String(row.tipo_documento || ''),
    nome_amigavel: String(row.nome_amigavel || row.tipo_documento || 'Documento'),
    categoria: row.categoria || null,
    entidade_tipo: String(row.entidade_tipo || 'empresa'),
    escopo: String(row.escopo || 'empresa'),
    obrigatorio: row.obrigatorio === true,
    permite_multiplos: row.permite_multiplos === true,
    validade_dias: row.validade_dias == null ? null : Number(row.validade_dias),
    condicao: row.condicao && typeof row.condicao === 'object' ? row.condicao : {},
    descricao: row.descricao || null,
    tipo_exigencia: row.tipo_exigencia || null,
    regra_validacao: row.regra_validacao || {},
    regra_cruzamento: row.regra_cruzamento || {},
    bloqueia_etapa: row.bloqueia_etapa == null ? null : Number(row.bloqueia_etapa),
    vigencia_inicio: row.vigencia_inicio || null,
    vigencia_fim: row.vigencia_fim || null,
    versao: row.versao || null,
    ativo: row.ativo !== false,
    fonte: row.fonte || null,
  };
}

export async function resolverRegrasDocumentais(params: { db?: QueryableRules; contexto: ContextoRegraDocumental; ttlMs?: number }): Promise<RegraResolvida[]> {
  const referencia = params.contexto.referencia || new Date();
  const chave = chaveCacheRegras(params.contexto);
  const agora = Date.now();
  const cache = cacheRegrasDocumentais.get(chave);
  let regras = cache && cache.expiresAt > agora ? cache.regras : null;
  let fonteResolucao: 'banco' | 'fallback' = 'banco';
  if (!regras && params.db) {
    try {
      const resultado = await params.db.query('SELECT * FROM public.documentos_regras_credito WHERE COALESCE(ativo, true) = true ORDER BY ordem ASC, codigo ASC');
      regras = (resultado.rows || []).map(normalizarRegraBanco).filter((regra) => regra.codigo && regra.tipo_documento);
    } catch (error: any) {
      fonteResolucao = 'fallback';
      console.warn('[regrasDocumentaisCredito] Banco indisponível; usando fallback seguro:', error?.message || error);
    }
  }
  if (!regras || regras.length === 0) {
    regras = FALLBACK_REGRAS_DOCUMENTAIS;
    fonteResolucao = 'fallback';
  }
  cacheRegrasDocumentais.set(chave, { expiresAt: agora + Math.max(1000, params.ttlMs ?? 60_000), regras });
  return regras
    .filter((regra) => regraVigente(regra, referencia))
    .map((regra) => ({ ...regra, ...avaliarAplicabilidadeRegra(regra, params.contexto), fonte_resolucao: fonteResolucao }));
}

export function limparCacheRegrasDocumentais(): void {
  cacheRegrasDocumentais.clear();
}

export function regrasDocumentaisFallback(): RegraDocumentalCredito[] {
  return FALLBACK_REGRAS_DOCUMENTAIS.map((regra) => ({ ...regra, condicao: { ...regra.condicao } }));
}
