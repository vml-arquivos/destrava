export type FonteFinanceira = {
  campo: string;
  valor: number;
  documento_id?: string | null;
  tipo_documento?: string | null;
  competencia_inicio?: string | null;
  competencia_fim?: string | null;
};

export type IndicadorFinanceiro = {
  codigo: string;
  nome: string;
  valor: number | null;
  unidade: 'BRL' | 'percentual' | 'vezes' | 'meses' | 'dias' | 'inteiro';
  formula: string;
  interpretacao: string;
  fonte: string | null;
  competencia_inicio: string | null;
  competencia_fim: string | null;
  documentos_utilizados: string[];
  qualidade: 'suficiente' | 'parcial' | 'insuficiente';
  motivo: string | null;
};

export type ResultadoIndicadoresFinanceiros = {
  indicadores: Record<string, IndicadorFinanceiro>;
  qualidade: 'suficiente' | 'parcial' | 'insuficiente';
  competencia: { inicio: string | null; fim: string | null };
  documentos_utilizados: string[];
  fontes: FonteFinanceira[];
  limitacoes: string[];
};

export type PilarRatingInterno = {
  codigo: string;
  nome: string;
  pontos: number;
  maximo: number;
  evidencias: string[];
  limitacoes: string[];
};

export type ResultadoRatingInterno = {
  nota: number | null;
  classificacao: 'A' | 'B' | 'C' | 'D' | 'E' | 'indisponivel';
  pilares: PilarRatingInterno[];
  evidencias: string[];
  limitacoes: string[];
};

const ALIASES: Record<string, string[]> = {
  receita: ['receita_liquida', 'receita_bruta', 'faturamento_anual', 'faturamento'],
  ativo_circulante: ['ativo_circulante', 'ativo_circulante_total'],
  passivo_circulante: ['passivo_circulante', 'passivo_circulante_total'],
  estoque: ['estoques', 'estoque'],
  contas_receber: ['contas_receber', 'duplicatas_receber', 'recebiveis'],
  fornecedores: ['fornecedores', 'contas_pagar', 'passivo_fornecedores'],
  obrigacoes_operacionais: ['obrigacoes_operacionais', 'obrigacoes', 'tributos_a_pagar'],
  divida_financeira: ['divida_financeira', 'divida_bruta', 'emprestimos_financiamentos'],
  caixa: ['caixa', 'disponibilidades', 'caixa_equivalentes'],
  patrimonio_liquido: ['patrimonio_liquido', 'patrimonio'],
  ebitda: ['ebitda', 'resultado_operacional_ajustado'],
  ebit: ['ebit', 'resultado_operacional'],
  despesa_financeira: ['despesa_financeira', 'juros_despesas_financeiras'],
  servico_divida: ['servico_divida', 'parcelas_divida', 'servico_total_divida'],
  geracao_caixa: ['geracao_caixa_disponivel', 'fluxo_caixa_operacional', 'caixa_operacional'],
  custo_vendas: ['custo_vendas', 'cmv', 'custo_mercadoria_vendida'],
  lucro_bruto: ['lucro_bruto', 'resultado_bruto'],
  lucro_liquido: ['lucro_liquido', 'resultado_liquido'],
  ativos_totais: ['ativos_totais', 'ativo_total'],
  saldo_medio_estoque: ['saldo_medio_estoque', 'estoque_medio'],
  vendas_prazo: ['vendas_prazo', 'receita_a_prazo'],
  compras: ['compras', 'compras_a_prazo'],
  concentracao_clientes: ['concentracao_clientes', 'maior_cliente_percentual'],
  concentracao_fornecedores: ['concentracao_fornecedores', 'maior_fornecedor_percentual'],
  // Adicionados para alinhar com o "Guia de Análise de Crédito Corporativo e
  // Regimes Tributários" (documento de referência do usuário, 2026-08): ICSD,
  // Endividamento Geral e Perfil da Dívida exigem o passivo não circulante e o
  // EBITDA precisa poder ser calculado como Lucro Operacional + Depreciação +
  // Amortização quando o documento não traz o EBITDA já pronto.
  passivo_nao_circulante: ['passivo_nao_circulante', 'passivo_longo_prazo', 'exigivel_longo_prazo'],
  depreciacao_amortizacao: ['depreciacao_amortizacao', 'depreciacao_e_amortizacao'],
  depreciacao: ['depreciacao'],
  amortizacao: ['amortizacao'],
};

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function pickNumber(sources: any[], key: string): { value: number | null; source: FonteFinanceira | null } {
  for (const source of sources) {
    const data = source?.dados_extraidos || source?.resultado_validacao?.analise_regra_documental?.dados || source?.resultado || source || {};
    const aliases = ALIASES[key] || [key];
    for (const alias of aliases) {
      const value = numberValue(data?.[alias]);
      if (value !== null) {
        return {
          value,
          source: {
            campo: alias,
            valor: value,
            documento_id: source?.documento_id || source?.arquivo_id || source?.id || null,
            tipo_documento: source?.tipo_documento || source?.tipo_analise || null,
            competencia_inicio: data?.competencia?.inicio || data?.competencia_inicio || null,
            competencia_fim: data?.competencia?.fim || data?.competencia_fim || null,
          },
        };
      }
    }
  }
  return { value: null, source: null };
}

function percentual(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

function round(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 10000) / 10000;
}

function indicador(
  codigo: string,
  nome: string,
  valor: number | null,
  unidade: IndicadorFinanceiro['unidade'],
  formula: string,
  interpretacao: string,
  fontes: Array<FonteFinanceira | null>,
  documentos: string[],
  motivo?: string | null,
): IndicadorFinanceiro {
  const fontesValidas = fontes.filter(Boolean) as FonteFinanceira[];
  const qualidade: IndicadorFinanceiro['qualidade'] = valor === null ? 'insuficiente' : fontesValidas.length >= 2 ? 'suficiente' : 'parcial';
  return {
    codigo,
    nome,
    valor: round(valor),
    unidade,
    formula,
    interpretacao,
    fonte: fontesValidas.map((item) => item.campo).join(' + ') || null,
    competencia_inicio: fontesValidas.map((item) => item.competencia_inicio).filter(Boolean).sort()[0] || null,
    competencia_fim: fontesValidas.map((item) => item.competencia_fim).filter(Boolean).sort().at(-1) || null,
    documentos_utilizados: Array.from(new Set(fontesValidas.map((item) => String(item.documento_id || '')).filter(Boolean).concat(documentos))),
    qualidade,
    motivo: motivo || (valor === null ? 'Dados insuficientes para calcular o indicador sem inventar premissas.' : null),
  };
}

export function calcularIndicadoresFinanceiros(params: {
  empresa?: any;
  documentos?: any[];
  extracoes?: any[];
  referencia?: Date;
}): ResultadoIndicadoresFinanceiros {
  const fontes = [...(Array.isArray(params.documentos) ? params.documentos : []), ...(Array.isArray(params.extracoes) ? params.extracoes : [])];
  const docsIds = fontes.map((doc) => String(doc?.id || doc?.documento_id || doc?.arquivo_id || '')).filter(Boolean);
  const receita = pickNumber([params.empresa, ...fontes], 'receita');
  const ativo = pickNumber([params.empresa, ...fontes], 'ativo_circulante');
  const passivo = pickNumber([params.empresa, ...fontes], 'passivo_circulante');
  const estoque = pickNumber([params.empresa, ...fontes], 'estoque');
  const receber = pickNumber([params.empresa, ...fontes], 'contas_receber');
  const fornecedores = pickNumber([params.empresa, ...fontes], 'fornecedores');
  const obrigacoes = pickNumber([params.empresa, ...fontes], 'obrigacoes_operacionais');
  const divida = pickNumber([params.empresa, ...fontes], 'divida_financeira');
  const caixa = pickNumber([params.empresa, ...fontes], 'caixa');
  const pl = pickNumber([params.empresa, ...fontes], 'patrimonio_liquido');
  const ebitda = pickNumber([params.empresa, ...fontes], 'ebitda');
  const ebit = pickNumber([params.empresa, ...fontes], 'ebit');
  const juros = pickNumber([params.empresa, ...fontes], 'despesa_financeira');
  const servico = pickNumber([params.empresa, ...fontes], 'servico_divida');
  const geracaoCaixa = pickNumber([params.empresa, ...fontes], 'geracao_caixa');
  const custo = pickNumber([params.empresa, ...fontes], 'custo_vendas');
  const lucroBruto = pickNumber([params.empresa, ...fontes], 'lucro_bruto');
  const lucroLiquido = pickNumber([params.empresa, ...fontes], 'lucro_liquido');
  const ativosTotais = pickNumber([params.empresa, ...fontes], 'ativos_totais');
  const estoqueMedio = pickNumber([params.empresa, ...fontes], 'saldo_medio_estoque');
  const vendasPrazo = pickNumber([params.empresa, ...fontes], 'vendas_prazo');
  const compras = pickNumber([params.empresa, ...fontes], 'compras');
  const concentracaoClientes = pickNumber([params.empresa, ...fontes], 'concentracao_clientes');
  const concentracaoFornecedores = pickNumber([params.empresa, ...fontes], 'concentracao_fornecedores');
  const passivoNaoCirculante = pickNumber([params.empresa, ...fontes], 'passivo_nao_circulante');
  const depreciacaoAmortizacaoDireta = pickNumber([params.empresa, ...fontes], 'depreciacao_amortizacao');
  const depreciacao = pickNumber([params.empresa, ...fontes], 'depreciacao');
  const amortizacao = pickNumber([params.empresa, ...fontes], 'amortizacao');
  // LAJIDA/EBITDA conforme o guia de referência: Lucro Operacional + Depreciação +
  // Amortização. Nem toda DRE traz "EBITDA" pronto -- quando só vier o EBIT e a(s)
  // linha(s) de depreciação/amortização, calculamos aqui em vez de deixar o
  // indicador vazio. Se nada disso vier informado, o indicador some (não inventa 0).
  const depreciacaoAmortizacaoCombinada = depreciacaoAmortizacaoDireta.value !== null
    ? depreciacaoAmortizacaoDireta
    : depreciacao.value !== null || amortizacao.value !== null
      ? { value: (depreciacao.value || 0) + (amortizacao.value || 0), source: depreciacao.source || amortizacao.source }
      : { value: null, source: null };
  const ebitdaResolvido = ebitda.value !== null
    ? ebitda
    : ebit.value !== null && depreciacaoAmortizacaoCombinada.value !== null
      ? { value: ebit.value + depreciacaoAmortizacaoCombinada.value, source: ebit.source }
      : { value: null, source: null };
  const passivoTotalExigivel = passivo.value !== null && passivoNaoCirculante.value !== null
    ? { value: passivo.value + passivoNaoCirculante.value, source: passivo.source }
    : { value: null, source: null };
  const indicadores: Record<string, IndicadorFinanceiro> = {};
  const add = (item: IndicadorFinanceiro) => { indicadores[item.codigo] = item; };
  add(indicador('receita_media_mensal', 'Receita média mensal', receita.value === null ? null : receita.value / 12, 'BRL', 'Receita anual ou 12 meses ÷ 12', 'Dimensiona a base de receita recorrente.', [receita.source], docsIds));
  add(indicador('margem_ebitda', 'Margem EBITDA', percentual(ebitdaResolvido.value, receita.value), 'percentual', 'EBITDA (informado, ou Lucro Operacional + Depreciação + Amortização) ÷ Receita', 'Mede geração operacional antes da estrutura financeira.', [ebitdaResolvido.source, receita.source], docsIds));
  add(indicador('dscr', 'DSCR', percentual(geracaoCaixa.value, servico.value), 'vezes', 'Geração de caixa disponível ÷ Serviço da dívida', 'Mede a cobertura do serviço da dívida; valor ausente não deve ser interpretado como aprovação.', [geracaoCaixa.source, servico.source], docsIds));
  // ICSD (Índice de Cobertura do Serviço da Dívida) é o nome bancário para a
  // mesma conta do DSCR, mas com o EBITDA no numerador em vez da geração de
  // caixa -- mantido como indicador próprio porque é o termo e o parâmetro
  // (>1,3x) usados no guia de referência do usuário.
  add(indicador('icsd', 'ICSD (Cobertura do Serviço da Dívida)', percentual(ebitdaResolvido.value, servico.value), 'vezes', 'EBITDA ÷ Parcela anual das dívidas', 'Referência de mercado: ideal acima de 1,3x. Abaixo disso, a geração operacional pode não cobrir o serviço da dívida do próximo ano.', [ebitdaResolvido.source, servico.source], docsIds));
  add(indicador('despesa_financeira_sobre_receita', 'Despesas financeiras sobre a receita', percentual(juros.value, receita.value), 'percentual', 'Despesas financeiras (juros e tarifas) ÷ Receita líquida', 'Acima de 5% a 8% da receita líquida costuma indicar alto risco financeiro.', [juros.source, receita.source], docsIds));
  add(indicador('endividamento_geral', 'Endividamento geral', percentual(passivoTotalExigivel.value, ativosTotais.value), 'percentual', '(Passivo Circulante + Passivo Não Circulante) ÷ Ativo Total', 'Limite comumente aceito entre 60% e 70%; acima disso, a dependência de capital de terceiros é considerada elevada.', [passivo.source, passivoNaoCirculante.source, ativosTotais.source], docsIds));
  add(indicador('perfil_divida', 'Perfil da dívida', percentual(passivo.value, passivoTotalExigivel.value), 'percentual', 'Passivo Circulante ÷ Passivo Total Exigível', 'Concentração maior no longo prazo (PNC) é saudável; passivo circulante muito alto em relação ao total gera alerta de risco de curto prazo.', [passivo.source, passivoNaoCirculante.source], docsIds));
  add(indicador('divida_ebitda', 'Dívida líquida / EBITDA', percentual(divida.value === null || caixa.value === null ? null : divida.value - caixa.value, ebitdaResolvido.value), 'vezes', '(Dívida financeira − Caixa) ÷ EBITDA', 'Mede alavancagem; EBITDA ausente impede o cálculo.', [divida.source, caixa.source, ebitdaResolvido.source], docsIds));
  add(indicador('liquidez_corrente', 'Liquidez corrente', percentual(ativo.value, passivo.value), 'vezes', 'Ativo circulante ÷ Passivo circulante', 'Mede cobertura das obrigações de curto prazo.', [ativo.source, passivo.source], docsIds));
  add(indicador('liquidez_seca', 'Liquidez seca', percentual(ativo.value === null || estoque.value === null ? null : ativo.value - estoque.value, passivo.value), 'vezes', '(Ativo circulante − Estoque) ÷ Passivo circulante', 'Exclui estoques para medir liquidez de maior conversibilidade.', [ativo.source, estoque.source, passivo.source], docsIds));
  add(indicador('cobertura_juros', 'Cobertura de juros', percentual(ebit.value, juros.value), 'vezes', 'EBIT ÷ Despesa financeira', 'Mede folga operacional para juros.', [ebit.source, juros.source], docsIds));
  add(indicador('capital_giro_liquido', 'Capital de giro líquido', ativo.value === null || passivo.value === null ? null : ativo.value - passivo.value, 'BRL', 'Ativo circulante − Passivo circulante', 'Mede a folga financeira de curto prazo.', [ativo.source, passivo.source], docsIds));
  add(indicador('necessidade_capital_giro', 'Necessidade de capital de giro', estoque.value === null || receber.value === null || fornecedores.value === null || obrigacoes.value === null ? null : estoque.value + receber.value - fornecedores.value - obrigacoes.value, 'BRL', 'Estoque + Contas a receber − Fornecedores − Obrigações operacionais', 'Dimensiona o caixa necessário para o ciclo operacional.', [estoque.source, receber.source, fornecedores.source, obrigacoes.source], docsIds));
  const dividaLiquida = divida.value === null || caixa.value === null ? null : divida.value - caixa.value;
  add(indicador('divida_liquida', 'Dívida líquida', dividaLiquida, 'BRL', 'Dívida financeira − Caixa', 'Mede a dívida após as disponibilidades.', [divida.source, caixa.source], docsIds));
  add(indicador('endividamento_patrimonial', 'Endividamento patrimonial', percentual(divida.value, pl.value), 'percentual', 'Dívida financeira ÷ Patrimônio líquido', 'Mede dependência de capital de terceiros.', [divida.source, pl.source], docsIds));
  add(indicador('margem_bruta', 'Margem bruta', percentual(lucroBruto.value, receita.value), 'percentual', 'Lucro bruto ÷ Receita', 'Mede resultado após custos diretamente associados à venda.', [lucroBruto.source, receita.source], docsIds));
  add(indicador('margem_operacional', 'Margem operacional', percentual(ebit.value, receita.value), 'percentual', 'EBIT ÷ Receita', 'Mede eficiência operacional antes do resultado financeiro e tributos.', [ebit.source, receita.source], docsIds));
  add(indicador('margem_liquida', 'Margem líquida', percentual(lucroLiquido.value, receita.value), 'percentual', 'Lucro líquido ÷ Receita', 'Mede o resultado líquido sobre as vendas.', [lucroLiquido.source, receita.source], docsIds));
  add(indicador('roa', 'ROA', percentual(lucroLiquido.value, ativosTotais.value), 'percentual', 'Lucro líquido ÷ Ativos totais', 'Mede retorno gerado pela base de ativos.', [lucroLiquido.source, ativosTotais.source], docsIds));
  add(indicador('roe', 'ROE', percentual(lucroLiquido.value, pl.value), 'percentual', 'Lucro líquido ÷ Patrimônio líquido', 'Mede retorno sobre o capital próprio.', [lucroLiquido.source, pl.source], docsIds));
  add(indicador('giro_estoque', 'Giro de estoque', percentual(custo.value, estoqueMedio.value), 'vezes', 'Custo das vendas ÷ Estoque médio', 'Mede quantas vezes o estoque é renovado no período.', [custo.source, estoqueMedio.source], docsIds));
  const pmr = receita.value === null || receita.value === 0 || receber.value === null ? null : (receber.value / (vendasPrazo.value || receita.value)) * 365;
  const pmp = custo.value === null || custo.value === 0 || fornecedores.value === null ? null : (fornecedores.value / (compras.value || custo.value)) * 365;
  const pme = custo.value === null || custo.value === 0 || estoqueMedio.value === null ? null : (estoqueMedio.value / custo.value) * 365;
  add(indicador('pmr', 'Prazo médio de recebimento', pmr, 'dias', 'Contas a receber ÷ Vendas × 365', 'Mede o prazo médio de conversão das vendas em caixa.', [receber.source, vendasPrazo.source || receita.source], docsIds));
  add(indicador('pmp', 'Prazo médio de pagamento', pmp, 'dias', 'Fornecedores ÷ Compras × 365', 'Mede o prazo médio concedido pelos fornecedores.', [fornecedores.source, compras.source || custo.source], docsIds));
  add(indicador('pme', 'Prazo médio de estoque', pme, 'dias', 'Estoque médio ÷ Custo das vendas × 365', 'Mede o tempo médio de permanência do estoque.', [estoqueMedio.source, custo.source], docsIds));
  add(indicador('ciclo_financeiro', 'Ciclo financeiro', pme === null || pmr === null || pmp === null ? null : pme + pmr - pmp, 'dias', 'PME + PMR − PMP', 'Mede o tempo de caixa investido no ciclo operacional.', [estoqueMedio.source, custo.source, receber.source, fornecedores.source], docsIds, pme === null || pmr === null || pmp === null ? 'Prazos médios de estoque, recebimento e pagamento ainda não foram fornecidos.' : null));
  add(indicador('concentracao_clientes', 'Concentração de clientes', concentracaoClientes.value, 'percentual', 'Maior cliente ÷ Receita, quando informado', 'Mede dependência de poucos clientes.', [concentracaoClientes.source], docsIds));
  add(indicador('concentracao_fornecedores', 'Concentração de fornecedores', concentracaoFornecedores.value, 'percentual', 'Maior fornecedor ÷ Compras, quando informado', 'Mede dependência de poucos fornecedores.', [concentracaoFornecedores.source], docsIds));

  const valores = Object.values(indicadores);
  const calculados = valores.filter((item) => item.valor !== null);
  const qualidade: ResultadoIndicadoresFinanceiros['qualidade'] = calculados.length >= 7 ? 'suficiente' : calculados.length >= 3 ? 'parcial' : 'insuficiente';
  const limitacoes = valores.filter((item) => item.motivo).map((item) => `${item.nome}: ${item.motivo}`);
  const competencias = valores.flatMap((item) => [item.competencia_inicio, item.competencia_fim]).filter(Boolean).sort() as string[];
  return {
    indicadores,
    qualidade,
    competencia: { inicio: competencias[0] || null, fim: competencias.at(-1) || null },
    documentos_utilizados: docsIds,
    fontes: [receita, ativo, passivo, estoque, receber, fornecedores, obrigacoes, divida, caixa, pl, ebitda, ebit, juros, servico, geracaoCaixa, custo, lucroBruto, lucroLiquido, ativosTotais, estoqueMedio, vendasPrazo, compras, concentracaoClientes, concentracaoFornecedores, passivoNaoCirculante, depreciacaoAmortizacaoDireta, depreciacao, amortizacao].map((item) => item.source).filter(Boolean) as FonteFinanceira[],
    limitacoes,
  };
}

export function calcularRatingInterno(params: {
  empresa?: any;
  indicadores: ResultadoIndicadoresFinanceiros;
  documentos?: any[];
  pendencias?: Array<{ severidade?: string; descricao?: string }>;
}): ResultadoRatingInterno {
  const indicadores = params.indicadores.indicadores;
  const pilares: PilarRatingInterno[] = [];
  const valor = (codigo: string) => indicadores[codigo]?.valor ?? null;
  const qualidade = params.indicadores.qualidade;
  const pendenciasCriticas = (params.pendencias || []).filter((item) => item.severidade === 'critica' || item.severidade === 'alta').length;
  const regularidade = String(params.empresa?.situacao_cadastral || '').toLowerCase();
  const cadastroPontos = /ativa|regular|ok/.test(regularidade) ? 15 : 5;
  pilares.push({ codigo: 'cadastro', nome: 'Cadastro e regularidade', pontos: cadastroPontos, maximo: 20, evidencias: regularidade ? [`situacao_cadastral=${regularidade}`] : [], limitacoes: regularidade ? [] : ['Situação cadastral não informada.'] });
  const docs = Array.isArray(params.documentos) ? params.documentos : [];
  const docsValidos = docs.filter((doc) => doc?.status === 'validado' || doc?.validado === true).length;
  const docsPontos = Math.min(20, docs.length ? Math.round((docsValidos / docs.length) * 20) : 0);
  pilares.push({ codigo: 'documentacao', nome: 'Documentação', pontos: docsPontos, maximo: 20, evidencias: [`${docsValidos}/${docs.length} documentos validados`], limitacoes: docs.length ? [] : ['Não há documentos suficientes para medir validação.'] });
  const liquidez = valor('liquidez_corrente');
  const alavancagem = valor('divida_ebitda');
  const financeiroPontos = Math.round(Math.max(0, Math.min(30, (liquidez === null ? 0 : Math.min(liquidez / 2, 1) * 15) + (alavancagem === null ? 0 : Math.max(0, 1 - Math.min(alavancagem / 5, 1)) * 15))));
  pilares.push({ codigo: 'financeiro', nome: 'Capacidade financeira', pontos: financeiroPontos, maximo: 30, evidencias: [liquidez === null ? '' : `liquidez_corrente=${liquidez}`, alavancagem === null ? '' : `divida_ebitda=${alavancagem}`].filter(Boolean), limitacoes: [liquidez === null ? 'Liquidez corrente indisponível.' : '', alavancagem === null ? 'Dívida líquida/EBITDA indisponível.' : ''].filter(Boolean) });
  const riscoPontos = Math.max(0, 30 - Math.min(30, pendenciasCriticas * 10));
  pilares.push({ codigo: 'risco', nome: 'Risco e pendências', pontos: riscoPontos, maximo: 30, evidencias: [`${pendenciasCriticas} pendências altas/críticas`], limitacoes: pendenciasCriticas ? ['Pendências altas/críticas reduzem a nota; não são substituídas por inferência.'] : [] });
  const maximo = pilares.reduce((sum, item) => sum + item.maximo, 0);
  const soma = pilares.reduce((sum, item) => sum + item.pontos, 0);
  const nota = qualidade === 'insuficiente' ? null : Math.round((soma / maximo) * 100);
  const classificacao: ResultadoRatingInterno['classificacao'] = nota === null ? 'indisponivel' : nota >= 80 ? 'A' : nota >= 65 ? 'B' : nota >= 50 ? 'C' : nota >= 35 ? 'D' : 'E';
  return {
    nota,
    classificacao,
    pilares,
    evidencias: pilares.flatMap((item) => item.evidencias),
    limitacoes: [...params.indicadores.limitacoes, ...pilares.flatMap((item) => item.limitacoes)],
  };
}

export function construirElegibilidadeCredito(params: {
  empresa?: any;
  indicadores: ResultadoIndicadoresFinanceiros;
  documentos?: any[];
  programas?: Array<{ codigo: string; nome: string; requisitos_chave: string[] }>;
}): Array<{ programa_codigo: string; programa_nome: string; elegivel: boolean; status: 'elegivel' | 'nao_elegivel' | 'pendente'; status_executivo: 'APTA AGORA' | 'POTENCIALMENTE APTA' | 'NÃO RECOMENDADA AGORA'; motivo: string; requisitos: Array<{ requisito: string; atendido: boolean | null; evidencia: string | null }>; requisitos_faltantes: string[]; impedimentos: string[]; documentacao: string[]; garantia: string[]; acoes_necessarias: string[]; limitacoes: string[] }> {
  const docs = new Set((params.documentos || []).map((doc) => String(doc?.tipo_documento || '')));
  const receita = params.indicadores.indicadores.receita_media_mensal?.valor;
  const programas = params.programas || [];
  return programas.map((programa) => {
    const requisitos = (programa.requisitos_chave || []).map((requisito) => {
      const texto = requisito.toLowerCase();
      const atendido = texto.includes('faturamento') ? receita !== null : texto.includes('e-cac') ? docs.has('compartilhamento_ecac') : texto.includes('projeto') ? null : texto.includes('cadastro') ? Boolean(params.empresa?.cnpj || /ativa|regular/i.test(String(params.empresa?.situacao_cadastral || ''))) : null;
      return { requisito, atendido, evidencia: atendido === true ? 'Dados cadastrais/documentais disponíveis.' : null };
    });
    const requisitosFaltantes = requisitos.filter((item) => item.atendido !== true).map((item) => item.requisito);
    const limitacoes = requisitos.filter((item) => item.atendido === null).map((item) => `Requisito sem evidência objetiva: ${item.requisito}`);
    const impedimentos = requisitos.filter((item) => item.atendido === false && /cadastro|situação|regularidade/i.test(item.requisito)).map((item) => item.requisito);
    const elegivel = requisitos.length > 0 && requisitos.every((item) => item.atendido === true);
    const status_executivo = elegivel ? 'APTA AGORA' : impedimentos.length ? 'NÃO RECOMENDADA AGORA' : 'POTENCIALMENTE APTA';
    const status = elegivel ? 'elegivel' : limitacoes.length || !impedimentos.length ? 'pendente' : 'nao_elegivel';
    const documentacao = requisitos.filter((item) => /document|faturamento|declaração|e-cac/i.test(item.requisito)).map((item) => item.requisito);
    const garantia = requisitos.filter((item) => /aval|garantia|fundo/i.test(item.requisito)).map((item) => item.requisito);
    const acoes_necessarias = requisitosFaltantes.map((item) => `Obter evidência e anexar: ${item}`);
    return { programa_codigo: programa.codigo, programa_nome: programa.nome, elegivel, status, status_executivo, motivo: elegivel ? 'Todos os requisitos objetivos informados possuem evidência.' : status_executivo === 'NÃO RECOMENDADA AGORA' ? 'Há impedimento cadastral/regularidade que precisa ser resolvido antes da operação.' : 'Há potencial, mas faltam evidências ou requisitos específicos da linha.', requisitos, requisitos_faltantes: requisitosFaltantes, impedimentos, documentacao, garantia, acoes_necessarias, limitacoes };
  });
}

export function construirPlanoAdequacao(params: { indicadores: ResultadoIndicadoresFinanceiros; rating: ResultadoRatingInterno; elegibilidade?: Array<{ programa_nome: string; limitacoes: string[] }>; }): Array<{ prioridade: 'alta' | 'media' | 'baixa'; prioridade_codigo: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'; titulo: string; descricao: string; impacto: string; acao: string; evidencia: Record<string, unknown>; prazo_sugerido: string | null; documento_saida: string | null; linha_desbloqueada: string | null }> {
  const plano: Array<{ prioridade: 'alta' | 'media' | 'baixa'; prioridade_codigo: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'; titulo: string; descricao: string; impacto: string; acao: string; evidencia: Record<string, unknown>; prazo_sugerido: string | null; documento_saida: string | null; linha_desbloqueada: string | null }> = [];
  for (const limitacao of params.indicadores.limitacoes.slice(0, 8)) plano.push({ prioridade: 'media', prioridade_codigo: 'P2', titulo: 'Completar base financeira', descricao: limitacao, impacto: 'Aumenta a confiabilidade dos indicadores e da análise bancária.', acao: 'Anexar demonstração ou relatório com competência, fonte e valores verificáveis.', evidencia: { origem: 'indicadores_financeiros' }, prazo_sugerido: null, documento_saida: 'Demonstração financeira com competência e fonte', linha_desbloqueada: 'credito_bancario_padrao' });
  for (const limitacao of params.rating.limitacoes.slice(0, 8)) plano.push({ prioridade: 'alta', prioridade_codigo: 'P1', titulo: 'Resolver limitação do rating interno', descricao: limitacao, impacto: 'Remove incerteza antes da montagem da proposta.', acao: 'Registrar evidência documental e submeter a revisão humana quando necessário.', evidencia: { origem: 'rating_interno' }, prazo_sugerido: null, documento_saida: 'Evidência documental validada', linha_desbloqueada: 'credito_bancario_padrao' });
  for (const item of params.elegibilidade || []) for (const limitacao of item.limitacoes.slice(0, 3)) plano.push({ prioridade: 'media', prioridade_codigo: 'P3', titulo: `Preparar ${item.programa_nome}`, descricao: limitacao, impacto: 'Pode desbloquear a elegibilidade para o programa.', acao: 'Obter o requisito e anexá-lo ao dossiê da operação.', evidencia: { origem: 'elegibilidade', programa: item.programa_nome }, prazo_sugerido: null, documento_saida: 'Documento ou autorização faltante', linha_desbloqueada: item.programa_nome });
  return plano;
}
