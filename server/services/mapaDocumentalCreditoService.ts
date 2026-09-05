import { canonicalizeDocumentType, getDocumentCatalogEntry } from '../../shared/documentTypes';

export type RegimeCredito = 'mei' | 'simples_nacional' | 'nao_optante_regime_a_confirmar' | 'nao_optante_simples' | 'lucro_presumido' | 'lucro_real' | 'lucro_arbitrado' | 'imune' | 'isenta' | 'imune_isenta' | 'nao_identificado';

// Nome do regime como ele deve aparecer em qualquer tela. Exportado porque a
// ficha da empresa (Etapa 1) precisa mostrar o MESMO regime que decide a
// documentação exigida -- eram dois textos independentes antes.
export const ROTULO_REGIME_CREDITO: Record<RegimeCredito, string> = {
  mei: 'Microempreendedor Individual / SIMEI',
  simples_nacional: 'Simples Nacional — optante',
  nao_optante_regime_a_confirmar: 'Não optante do Simples — regime a confirmar',
  nao_optante_simples: 'Não optante do Simples Nacional (legado)',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
  lucro_arbitrado: 'Lucro Arbitrado',
  imune: 'Imune',
  isenta: 'Isenta',
  imune_isenta: 'Imune ou isenta',
  nao_identificado: 'Regime ainda não identificado',
};
export type TipoOperacaoCredito = 'capital_giro' | 'investimento' | 'maquinas_equipamentos' | 'inovacao' | 'fundos_regionais' | 'pronampe' | 'antecipacao_recebiveis' | 'comercio_exterior' | 'credito_rural' | 'sustentabilidade';

export type DocumentoMapa = {
  codigo: string;
  nome: string;
  tipos_arquivo: string[];
  obrigatorio: boolean;
  fase: number;
  finalidade: string;
  validade_dias?: number | null;
  alternativas?: string[];
  observacao?: string;
  anexado?: boolean;
  aplicabilidade?: 'aplicavel' | 'condicional' | 'nao_aplicavel' | 'automatico';
  status?: 'nao_aplicavel' | 'pendente' | 'anexado' | 'em_analise' | 'validado' | 'validado_com_alerta' | 'reprovado' | 'vencido' | 'substituido' | 'dispensado';
  motivo?: string;
  tipo_exigencia?: string;
  regra_versao?: string;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
  // CORREÇÃO (Rodada 33, 05/09/2026): mesmo campo/mesmo motivo de
  // `RegraDocumentalCredito.fonte_normativa` em `regrasDocumentaisCredito.ts`
  // -- citação da lei/norma/serviço oficial, preenchida só onde as duas
  // pesquisas independentes (Manus AI e GPT) convergem para uma fonte
  // específica; ausente nas demais entradas por disciplina (não inferir).
  fonte_normativa?: string | null;
};

export type EtapaMapa = {
  numero: number;
  codigo: string;
  titulo: string;
  objetivo: string;
  bloqueada: boolean;
  documentos: DocumentoMapa[];
};

export type PerfilProgramaCredito = {
  codigo: string;
  nome: string;
  instituicao: string;
  operacao: TipoOperacaoCredito;
  publico_alvo: string;
  requisitos_chave: string[];
  documentos_adicionais: string[];
  observacao: string;
};

export type IndicadorCredito = {
  codigo: string;
  nome: string;
  formula: string;
  interpretacao: string;
  fase: number;
};

export type PendenciaMapaDocumental = {
  codigo: string;
  titulo: string;
  descricao: string;
  acao: string;
  status: 'pendente' | 'em_analise' | 'resolvida';
  prioridade: 'alta' | 'media' | 'baixa';
  tipos_documento_aceitos: string[];
  nao_bloqueia_etapa_1: boolean;
};

export type MapaDocumentalCredito = {
  versao: string;
  regime_identificado: RegimeCredito;
  regime_descricao: string;
  regime_a_confirmar: boolean;
  etapa_atual: number;
  proxima_acao: string;
  etapas: EtapaMapa[];
  documentos_nao_aplicaveis: DocumentoMapa[];
  motor_regras?: { modo: 'shadow' | 'active'; fonte: 'banco' | 'fallback'; total_regras: number; divergencias_shadow: number };
  operacoes_disponiveis: Array<{ codigo: TipoOperacaoCredito; nome: string; objetivo: string; documentos_adicionais: string[] }>;
  programas_referencia: PerfilProgramaCredito[];
  indicadores: IndicadorCredito[];
  avisos: string[];
  pendencias: PendenciaMapaDocumental[];
  // Linha do tempo de regime tributário (seção 11-19 da missão de evolução do
  // Acervo Documental), anexada pelo montador do dossiê (documentacao.ts) a
  // partir de `regimeTributarioTemporalService.obterLinhaDoTempoRegime` --
  // opcional porque a tabela pode estar vazia (empresa sem nenhuma evidência
  // de regime ainda registrada) e porque este campo não existia antes da
  // Rodada 10 desta sessão. Usado pela tela de documentos para decidir se o
  // grupo fiscal do Simples e o grupo do ECF/DCTF devem ficar visíveis ao
  // mesmo tempo (empresa que mudou de regime tributário).
  historico_regime_tributario?: HistoricoRegimeTributarioMapa;
};

export type HistoricoRegimeTributarioMapa = {
  linha_do_tempo: Array<{ regime: string; data_inicio: string | null; data_fim: string | null }>;
  // Data de início do período hoje vigente (o mais recente sem `data_fim`, ou
  // o último da lista na ausência de um período aberto -- mesma regra de
  // fallback de `regimeTributarioTemporalService.obterRegimeVigenteEm`).
  // `null` quando não há nenhum período registrado ainda. Usado só para medir
  // há quanto tempo a empresa está sob o regime atual (Rodada 10, refinamento
  // "só ser nesse necessário, senão não é nem pra aparecer" -- a opção de
  // anexar o regime anterior só continua aparecendo enquanto a transição for
  // recente).
  regime_vigente_desde: string | null;
};

// Função pura, extraída para ser testável sem precisar montar o dossiê
// inteiro (`montarDossieCreditoEmpresa` depende de CNPJ/QSA/regras
// documentais/etc.): só molda o que a linha do tempo persistida
// (`regimeTributarioTemporalService.obterLinhaDoTempoRegime`) precisa expor
// para a tela de documentos, sem vazar campos internos (id, fonte, confiança,
// documento_evidencia_id, observação) que não são usados na decisão de
// visibilidade dos slots fiscais.
export function montarHistoricoRegimeTributarioParaMapa(
  linhaDoTempo: Array<{ regime: string; data_inicio: string | null; data_fim: string | null }>,
): HistoricoRegimeTributarioMapa {
  const periodos = (linhaDoTempo || []).map((periodo) => ({
    regime: periodo.regime,
    data_inicio: periodo.data_inicio ?? null,
    data_fim: periodo.data_fim ?? null,
  }));
  // Mesma regra de fallback de `obterRegimeVigenteEm`: o período aberto
  // (sem data_fim) é o vigente; na ausência de um período aberto, cai para o
  // último da lista (já ordenada por data_inicio ascendente).
  const vigente = periodos.find((periodo) => periodo.data_fim === null) || periodos[periodos.length - 1] || null;
  return {
    linha_do_tempo: periodos,
    regime_vigente_desde: vigente?.data_inicio ?? null,
  };
}

function normalizar(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function identificarRegimeCredito(empresa: any, enquadramento?: any): RegimeCredito {
  const texto = normalizar([
    enquadramento?.regime_tributario,
    enquadramento?.situacao_simples,
    enquadramento?.observacao,
    empresa?.regime_tributario,
    empresa?.porte,
    empresa?.natureza_juridica,
  ].filter(Boolean).join(' '));
  const opcaoMeiExplicita = typeof enquadramento?.opcao_mei === 'boolean'
    ? enquadramento.opcao_mei
    : typeof empresa?.opcao_mei === 'boolean'
      ? empresa.opcao_mei
      : null;
  const negativaSimei = /nao optante(?: pelo)? simei|nao enquadrad[oa](?: no)? simei|nao e mei/.test(texto);
  const indicioMeiNoTexto = /\bmei\b|\bsimei\b|microempreendedor individual/.test(texto);
  if (opcaoMeiExplicita === true || (opcaoMeiExplicita !== false && indicioMeiNoTexto && !negativaSimei)) return 'mei';

  const opcaoSimplesExplicita = enquadramento?.opcao_simples === true
    || enquadramento?.opcao_pelo_simples === true
    || empresa?.opcao_simples === true
    || empresa?.opcao_pelo_simples === true;
  const textoRegimeTributario = normalizar([
    enquadramento?.regime_tributario,
    enquadramento?.situacao_simples,
    empresa?.regime_tributario,
    empresa?.situacao_simples,
  ].filter(Boolean).join(' '));
  const naoOptanteSimples = /nao optante(?: pelo)? simples(?: nacional)?|nao e optante(?: pelo)? simples(?: nacional)?|excluid[oa] do simples/.test(textoRegimeTributario)
    || (/\bnao optante\b/.test(textoRegimeTributario) && !/\bsimei\b|\bmei\b/.test(textoRegimeTributario));
  if (/lucro presumido|presumido/.test(texto)) return 'lucro_presumido';
  if (/lucro real/.test(texto)) return 'lucro_real';
  if (/lucro arbitrado|arbitrado/.test(texto)) return 'lucro_arbitrado';
  if (naoOptanteSimples) return 'nao_optante_regime_a_confirmar';
  if (opcaoSimplesExplicita || /simples nacional|optante(?: pelo)? simples/.test(texto)) return 'simples_nacional';
  if (/imune/.test(texto)) return 'imune';
  if (/isenta/.test(texto)) return 'isenta';
  if (/sem fins lucrativos/.test(texto)) return 'imune_isenta';
  return 'nao_identificado';
}

function doc(codigo: string, nome: string, tipos: string[], fase: number, finalidade: string, extras: Partial<DocumentoMapa> = {}): DocumentoMapa {
  const catalogEntry = tipos.map((tipo) => getDocumentCatalogEntry(tipo)).find(Boolean);
  const tipoExigencia = extras.tipo_exigencia || catalogEntry?.tipoExigencia || 'documento_complementar';
  const aplicabilidade = extras.aplicabilidade || (extras.status === 'nao_aplicavel' ? 'nao_aplicavel' : extras.obrigatorio === false ? 'condicional' : 'aplicavel');
  const status = extras.status || (aplicabilidade === 'nao_aplicavel' ? 'nao_aplicavel' : 'pendente');
  return {
    codigo,
    nome,
    tipos_arquivo: tipos,
    obrigatorio: true,
    fase,
    finalidade,
    tipo_exigencia: tipoExigencia,
    aplicabilidade,
    status,
    regra_versao: '2026.09.05',
    ...extras,
  };
}

const DOCUMENTOS_UNIVERSAIS_EMPRESA: DocumentoMapa[] = [
  doc('contrato_social_vigente', 'Contrato social, consolidação ou última alteração registrada', ['contrato_social', 'alteracao_contratual'], 2, 'Comprovar NIRE, data de registro, capital e administração vigentes.'),
  doc('atos_junta', 'Certidão ou lista de atos da Junta Comercial', ['atos_junta_comercial'], 2, 'Conferir o histórico registral e determinar a cadeia de alterações necessária.'),
  doc('cnd_federal', 'CND/CPEND Federal e Dívida Ativa da União', ['cnd_rfb_cnpj', 'pgfn_cnpj'], 3, 'Comprovar regularidade fiscal federal.', { validade_dias: 180 }),
  doc('regularidade_fgts', 'Certificado de Regularidade do FGTS', ['crf_fgts', 'fgts'], 3, 'Comprovar regularidade perante o FGTS.'),
  // CNDT (trabalhista) é certidão distinta da CND Federal e do FGTS -- verifica
  // pendências na Justiça do Trabalho, não regularidade fiscal ou do FGTS. É
  // comumente exigida junto das outras duas em operações de crédito bancário
  // (confirmado: bancos/financeiras pedem CNDT em conjunto com CND federal, sem que
  // uma substitua a outra).
  doc('cndt', 'Certidão Negativa de Débitos Trabalhistas (CNDT)', ['cndt', 'certidao_trabalhista'], 3, 'Comprovar regularidade perante a Justiça do Trabalho -- certidão distinta da CND Federal e do FGTS, comumente exigida em conjunto por bancos e financeiras.', { obrigatorio: false, tipo_exigencia: 'politica_bancaria', motivo: 'Aplicável quando houver empregados ou quando a linha bancária exigir.' }),
  doc('certidao_estadual', 'Certidão estadual', ['cnd_estadual', 'certidao_estadual'], 3, 'Comprovar regularidade fiscal estadual.', { obrigatorio: false, tipo_exigencia: 'politica_bancaria', motivo: 'Aplicável quando houver inscrição estadual, atividade sujeita ou exigência da linha.' }),
  doc('certidao_municipal', 'Certidão municipal', ['cnd_municipal', 'certidao_municipal'], 3, 'Comprovar regularidade fiscal municipal.', { obrigatorio: false, tipo_exigencia: 'politica_bancaria', motivo: 'Aplicável conforme atividade, inscrição municipal ou política da linha.' }),
  doc('extratos_bancarios', 'Extratos bancários empresariais', ['extrato_bancario'], 4, 'Comprovar movimentação, sazonalidade e capacidade de pagamento.', { observacao: 'Preferencialmente 6 a 12 meses, conforme produto e instituição.' }),
  doc('faturamento_12m', 'Faturamento mensal dos últimos 12 meses', ['faturamento_12_meses', 'comprovante_faturamento', 'declaracao_faturamento'], 4, 'Medir receita recorrente, sazonalidade e limite operacional.', { obrigatorio: false, tipo_exigencia: 'boa_pratica_analise', motivo: 'Não é hard gate universal; torna-se requisito apenas quando a linha ou a instituição exigir.' }),
  // Bancos (ex.: Banco do Nordeste, para Simples Nacional, Lucro Presumido e Lucro
  // Real) exigem um demonstrativo de receitas projetadas no lugar do faturamento
  // histórico quando a empresa tem menos de 12 meses de constituição ou menos de
  // 11 meses de faturamento documentado -- situação que o próprio sistema já
  // identifica na Etapa 2/3 (cadeia societária/12 meses). Não substitui o
  // faturamento_12m no catálogo -- fica como item adicional, obrigatório apenas
  // quando aplicável.
  doc('projecao_receitas', 'Demonstrativo ou projeção de receitas', ['projecao_receitas', 'demonstrativo_receitas_projetadas'], 4, 'Substitui o faturamento histórico de 12 meses quando a empresa ainda não tem esse período de constituição ou de faturamento documentado.', { obrigatorio: false, observacao: 'Torna-se obrigatório no lugar do Faturamento bruto dos últimos 12 meses para empresas com menos de 12 meses de constituição ou com histórico de faturamento incompleto.' }),
  doc('scr_pj', 'Relatório SCR/Registrato da empresa', ['scr_cnpj', 'rating_bacen_cnpj', 'relatorio_scr'], 4, 'Mapear endividamento, limites e histórico de crédito perante o Banco Central (SCR).'),
  // Bureau privado (ex.: Serasa) é complementar ao SCR/Bacen -- mede inadimplência
  // e histórico de crédito fora do sistema financeiro regulado. O checklist já
  // tinha o campo "Rating (CNPJ)" (consulta_serasa_cnpj) sem nenhum item
  // correspondente aqui; esta entrada fecha essa lacuna.
  doc('rating_bureau_privado', 'Consulta de rating em bureau privado (ex.: Serasa)', ['consulta_serasa_cnpj'], 4, 'Avaliar histórico de crédito e inadimplência em bureau privado, complementar ao SCR/Bacen.', { obrigatorio: false }),
  // CENPROT (protesto de títulos) já era um campo do checklist (cenprot_cnpj) sem
  // item correspondente aqui -- protesto é indicador direto de inadimplência,
  // avaliado por bancos e financeiras na análise de risco.
  doc('consulta_protestos', 'Consulta de protestos (CENPROT)', ['cenprot_cnpj'], 4, 'Verificar protestos de títulos em nome da empresa -- indicador direto de inadimplência avaliado na análise de crédito.', { obrigatorio: false }),
  doc('socios_identidade', 'Documentos de identificação dos sócios/administradores', ['documento_socio', 'rg', 'cnh', 'cpf'], 3, 'Validar representantes e garantidores somente após a etapa societária.'),
  doc('socios_endereco', 'Comprovante de residência dos sócios/administradores', ['comprovante_residencia'], 3, 'Completar cadastro bancário dos garantidores.'),
];

const DOCUMENTOS_REGIME: Record<RegimeCredito, DocumentoMapa[]> = {
  mei: [
    doc('ccmei', 'CCMEI atualizado', ['ccmei'], 3, 'Comprovar constituição e condição de MEI.'),
    doc('dasn_simei', 'DASN-SIMEI e recibo', ['dasn_simei', 'recibo_dasn_simei'], 4, 'Comprovar faturamento anual declarado.'),
    doc('relatorio_receitas_mei', 'Relatório mensal de receitas brutas', ['relatorio_receitas_mei', 'faturamento_12_meses'], 4, 'Comprovar meses ainda não abrangidos pela DASN-SIMEI.', { alternativas: ['Notas fiscais e extratos bancários conciliados'] }),
  ],
  simples_nacional: [
    doc('pgdas_12m', 'PGDAS-D dos últimos 12 meses e recibos', ['pgdas', 'recibo_pgdas'], 4, 'Comprovar faturamento declarado mês a mês no Simples Nacional.'),
    doc('defis', 'DEFIS do último exercício e recibo', ['defis', 'recibo_defis'], 4, 'Comprovar informações socioeconômicas e fiscais anuais.'),
    doc('bp_dre_simples', 'Balanço Patrimonial e DRE', ['balanco', 'dre'], 4, 'Demonstrar resultado e patrimônio quando exigido pela operação ou pelo porte.', { obrigatorio: false, observacao: 'Torna-se prioritário em operações estruturadas, investimentos e empresas de maior faturamento.' }),
  ],
  nao_optante_regime_a_confirmar: [
    doc('confirmacao_regime_nao_optante', 'Comprovação do regime tributário não optante', ['ecf', 'dctf', 'dctfweb', 'darf', 'livro_caixa'], 4, 'Confirmar se a empresa está no Lucro Presumido, Lucro Real, Arbitrado ou hipótese de Livro Caixa antes de concluir a trilha fiscal.', { obrigatorio: true, tipo_exigencia: 'obrigacao_legal', motivo: 'Anexar ECF, DCTF/DCTFWeb, DARF ou Livro Caixa para confirmar o regime tributário efetivo.' }),
  ],
  nao_optante_simples: [
    doc('ecf_nao_optante', 'ECF e recibo de entrega', ['ecf', 'recibo_ecf'], 4, 'Comprovar a apuração fiscal e o faturamento da empresa não optante pelo Simples Nacional.'),
  ],
  lucro_presumido: [
    doc('ecf_presumido', 'ECF e recibo de entrega', ['ecf', 'recibo_ecf'], 4, 'Comprovar regime e faturamento fiscal.'),
    doc('ecd_presumido', 'ECD e recibo, quando obrigada', ['ecd', 'recibo_ecd'], 4, 'Comprovar escrituração e demonstrações contábeis.', { obrigatorio: false }),
    doc('bp_dre_presumido', 'Balanço Patrimonial e DRE dos últimos exercícios', ['balanco', 'dre'], 4, 'Avaliar patrimônio, resultado e capacidade de pagamento.'),
    doc('balancete_atual', 'Balancete e DRE acumulada do exercício atual', ['balancete', 'dre'], 4, 'Atualizar a análise entre fechamentos anuais.'),
    doc('dctf_dctfweb', 'DCTF/DCTFWeb ou comprovantes fiscais equivalentes', ['dctf', 'dctfweb', 'darf'], 4, 'Confirmar obrigações tributárias e regime informado.'),
    // Fora do Simples não existe PGDAS -- o Guia de Análise de Crédito Corporativo
    // aponta a EFD-Contribuições (PIS/COFINS) como o documento que efetivamente
    // comprova a receita bruta mensal real da empresa nesses regimes, no papel
    // equivalente ao que o pgdas_12m cumpre para o Simples Nacional.
    doc('efd_contribuicoes_presumido', 'EFD-Contribuições (PIS/COFINS) dos últimos períodos', ['efd_contribuicoes'], 4, 'Comprovar a receita bruta mensal real da empresa -- não há PGDAS fora do Simples Nacional.'),
  ],
  lucro_arbitrado: [
    doc('ecf_arbitrado', 'ECF e recibo de entrega', ['ecf', 'recibo_ecf'], 4, 'Comprovar a apuração fiscal no Lucro Arbitrado.'),
    doc('bp_dre_arbitrado', 'Balanço Patrimonial e DRE', ['balanco', 'dre'], 4, 'Avaliar patrimônio e capacidade de pagamento.', { obrigatorio: false }),
    doc('dctf_arbitrado', 'DCTF/DCTFWeb e comprovantes fiscais', ['dctf', 'dctfweb', 'darf'], 4, 'Conferir as obrigações e recolhimentos do regime.', { obrigatorio: false }),
    doc('efd_contribuicoes_arbitrado', 'EFD-Contribuições (PIS/COFINS) dos últimos períodos', ['efd_contribuicoes'], 4, 'Comprovar a receita bruta mensal real da empresa -- não há PGDAS fora do Simples Nacional.', { obrigatorio: false }),
  ],
  lucro_real: [
    doc('ecf_real', 'ECF e recibo de entrega', ['ecf', 'recibo_ecf'], 4, 'Comprovar apuração fiscal e parâmetros do Lucro Real.'),
    doc('ecd_real', 'ECD e recibo de entrega', ['ecd', 'recibo_ecd'], 4, 'Comprovar escrituração contábil oficial.'),
    doc('demonstracoes_real', 'Balanço, DRE, DFC e notas explicativas', ['balanco', 'dre', 'dfc', 'notas_explicativas'], 4, 'Avaliar estrutura financeira e geração de caixa.'),
    doc('balancete_real', 'Balancete atual, razão e DRE acumulada', ['balancete', 'razao_contabil', 'dre'], 4, 'Atualizar a posição financeira do exercício corrente.'),
    doc('dctf_real', 'DCTF/DCTFWeb e comprovantes de recolhimento', ['dctf', 'dctfweb', 'darf'], 4, 'Conferir regularidade das obrigações fiscais.'),
    doc('efd_contribuicoes_real', 'EFD-Contribuições (PIS/COFINS) dos últimos períodos', ['efd_contribuicoes'], 4, 'Comprovar a receita bruta mensal real da empresa -- não há PGDAS fora do Simples Nacional.'),
  ],
  imune: [
    doc('estatuto_ata_imune', 'Estatuto e atas vigentes', ['estatuto', 'ata'], 3, 'Comprovar governança e poderes de representação.', { tipo_exigencia: 'obrigacao_legal' }),
    doc('ecf_imune', 'ECF ou declaração fiscal aplicável', ['ecf', 'recibo_ecf'], 4, 'Comprovar enquadramento e dados fiscais.', { obrigatorio: false }),
    doc('demonstracoes_imune', 'Balanço, DRE/resultado e notas explicativas', ['balanco', 'dre', 'notas_explicativas'], 4, 'Demonstrar sustentabilidade financeira.', { obrigatorio: false }),
  ],
  isenta: [
    doc('estatuto_ata_isenta', 'Estatuto e atas vigentes', ['estatuto', 'ata'], 3, 'Comprovar governança e poderes de representação.', { tipo_exigencia: 'obrigacao_legal' }),
    doc('ecf_isenta', 'ECF ou declaração fiscal aplicável', ['ecf', 'recibo_ecf'], 4, 'Comprovar enquadramento e dados fiscais.', { obrigatorio: false }),
    doc('demonstracoes_isenta', 'Balanço, DRE/resultado e notas explicativas', ['balanco', 'dre', 'notas_explicativas'], 4, 'Demonstrar sustentabilidade financeira.', { obrigatorio: false }),
  ],
  imune_isenta: [
    doc('estatuto_ata', 'Estatuto e atas vigentes', ['estatuto', 'ata'], 3, 'Comprovar governança e poderes de representação.'),
    doc('ecf_imune', 'ECF ou declaração fiscal aplicável', ['ecf', 'recibo_ecf'], 4, 'Comprovar enquadramento e dados fiscais.'),
    doc('demonstracoes_imune', 'Balanço, DRE/resultado e notas explicativas', ['balanco', 'dre', 'notas_explicativas'], 4, 'Demonstrar sustentabilidade financeira.'),
  ],
  nao_identificado: [
    doc('confirmacao_regime', 'Comprovação do regime tributário', ['enquadramento_tributario_cnpj', 'simples_nacional', 'ecf', 'dctf'], 3, 'Identificar o regime antes de montar a trilha fiscal.'),
  ],
};

const OPERACOES: Array<{ codigo: TipoOperacaoCredito; nome: string; objetivo: string; documentos_adicionais: string[] }> = [
  {
    codigo: 'capital_giro', nome: 'Capital de giro', objetivo: 'Reforçar caixa, estoque, fornecedores e despesas operacionais.',
    documentos_adicionais: ['Fluxo de caixa projetado', 'Memória da necessidade de capital de giro', 'Contas a receber e a pagar', 'Extratos e faturamento conciliados'],
  },
  {
    codigo: 'investimento', nome: 'Investimento e expansão', objetivo: 'Implantação, ampliação, reforma e modernização.',
    documentos_adicionais: ['Projeto de investimento', 'Orçamentos e propostas', 'Cronograma físico-financeiro', 'Quadro de usos e fontes', 'Licenças aplicáveis'],
  },
  {
    codigo: 'maquinas_equipamentos', nome: 'Máquinas e equipamentos', objetivo: 'Aquisição de bens produtivos, inclusive linhas BNDES/Finame.',
    documentos_adicionais: ['Orçamento ou proposta comercial', 'Especificações do equipamento', 'Dados do fornecedor', 'Código FINAME quando aplicável', 'Comprovação de contrapartida'],
  },
  {
    codigo: 'inovacao', nome: 'Inovação', objetivo: 'Desenvolvimento ou melhoria de produtos, processos e serviços.',
    documentos_adicionais: ['Plano de inovação', 'Orçamento detalhado', 'Cronograma técnico-financeiro', 'Equipe e capacidade técnica', 'Evidências do desafio tecnológico e mercado'],
  },
  {
    codigo: 'fundos_regionais', nome: 'Fundos regionais', objetivo: 'Projetos elegíveis a FNE, FNO, FCO e programas regionais.',
    documentos_adicionais: ['Projeto conforme roteiro do fundo', 'Comprovação de localização e atividade', 'Orçamentos', 'Licenças ambientais/setoriais', 'Garantias e contrapartida'],
  },
  {
    codigo: 'pronampe', nome: 'PRONAMPE e programas garantidos', objetivo: 'Capital de giro com compartilhamento de faturamento e fundo garantidor.',
    documentos_adicionais: ['Autorização de compartilhamento no e-CAC', 'Faturamento do exercício anterior', 'Cadastro da empresa e representantes atualizado', 'Declaração fiscal correspondente ao regime'],
  },
  {
    codigo: 'antecipacao_recebiveis', nome: 'Antecipação de recebíveis', objetivo: 'Antecipar vendas a prazo, cartões, duplicatas ou contratos performados.',
    documentos_adicionais: ['Agenda de recebíveis', 'Notas fiscais/duplicatas', 'Contratos que originaram os recebíveis', 'Histórico de vendas e cancelamentos', 'Concentração por sacado'],
  },
  {
    codigo: 'comercio_exterior', nome: 'Comércio exterior', objetivo: 'Financiar importação, exportação e ciclo cambial.',
    documentos_adicionais: ['Contrato comercial ou pedido', 'Proforma/commercial invoice', 'Documentos Siscomex quando aplicáveis', 'Fluxo cambial projetado', 'Licenças e registros do produto'],
  },
  {
    codigo: 'credito_rural', nome: 'Crédito rural empresarial', objetivo: 'Financiar custeio, comercialização e investimento de atividade rural elegível.',
    documentos_adicionais: ['Projeto/plano rural', 'CAR, CCIR e ITR quando aplicáveis', 'Comprovação de posse/uso da área', 'Licenças e cadastros ambientais', 'Orçamentos e cronograma da atividade'],
  },
  {
    codigo: 'sustentabilidade', nome: 'Energia e sustentabilidade', objetivo: 'Financiar eficiência energética, energia renovável e adequações ambientais.',
    documentos_adicionais: ['Projeto técnico', 'Histórico de consumo e economia projetada', 'Orçamentos dos equipamentos', 'Licenças/autorizações', 'Cronograma de implantação'],
  },
];

const PROGRAMAS: PerfilProgramaCredito[] = [
  {
    codigo: 'credito_bancario_padrao', nome: 'Crédito empresarial — bancos e cooperativas', instituicao: 'Instituição financeira escolhida', operacao: 'capital_giro',
    publico_alvo: 'Empresas com cadastro, regularidade e capacidade de pagamento compatíveis com a política da instituição.',
    requisitos_chave: ['Cadastro empresarial e societário atualizado', 'Faturamento comprovado', 'Endividamento e fluxo de caixa conciliados', 'Garantias quando exigidas'],
    documentos_adicionais: ['Núcleo documental do regime tributário', 'Documentos específicos da operação', 'Formulários e autorizações da instituição'],
    observacao: 'Perfil universal: cada banco ou cooperativa pode acrescentar exigências, sem alterar a sequência central do sistema.',
  },
  {
    codigo: 'procred_360_bb', nome: 'ProCred 360 — Banco do Brasil', instituicao: 'Banco do Brasil', operacao: 'pronampe',
    publico_alvo: 'MEI e empresas elegíveis ao programa, com faturamento anual dentro do limite vigente e mais de um ano de constituição.',
    requisitos_chave: ['Conta empresarial', 'Compartilhamento eletrônico de faturamento no e-CAC', 'Aval do empresário ou sócios', 'Análise de crédito e condições do programa'],
    documentos_adicionais: ['Autorização de compartilhamento do faturamento', 'Declaração fiscal do exercício anterior', 'Cadastro empresarial e dos avalistas atualizado'],
    observacao: 'Limites, recursos e condições devem ser confirmados no momento da proposta.',
  },
  {
    codigo: 'pronampe_bb', nome: 'PRONAMPE — Banco do Brasil', instituicao: 'Banco do Brasil', operacao: 'pronampe',
    publico_alvo: 'ME e EPP elegíveis ao programa, sujeito à análise e disponibilidade.',
    requisitos_chave: ['Compartilhamento do faturamento no e-CAC', 'Declaração fiscal entregue', 'Aval dos sócios/empresário', 'Regularidade exigida pelo programa'],
    documentos_adicionais: ['Autorização de compartilhamento de faturamento', 'Comprovante da declaração fiscal do exercício anterior'],
    observacao: 'Condições e limites devem ser confirmados no momento da proposta.',
  },
  {
    codigo: 'pronampe_caixa', nome: 'PRONAMPE — CAIXA', instituicao: 'CAIXA', operacao: 'pronampe',
    publico_alvo: 'MEI, ME e EPP elegíveis, sujeito à análise e disponibilidade de recursos.',
    requisitos_chave: ['Compartilhamento de faturamento no e-CAC', 'Cadastro empresarial atualizado', 'Capacidade de pagamento'],
    documentos_adicionais: ['Autorização de compartilhamento Receita/CAIXA', 'Documentos cadastrais solicitados pela agência'],
    observacao: 'A política final é da instituição e pode variar por perfil e disponibilidade.',
  },
  {
    codigo: 'bndes_indireto', nome: 'BNDES — operação indireta', instituicao: 'BNDES via agente financeiro', operacao: 'investimento',
    publico_alvo: 'Empresas elegíveis à linha e ao agente financeiro credenciado.',
    requisitos_chave: ['Projeto/orçamento compatível com a linha', 'Capacidade financeira', 'Regularidade e licenças', 'Análise do agente financeiro'],
    documentos_adicionais: ['Orçamentos/propostas dos bens', 'Projeto de investimento', 'Quadro de usos e fontes quando aplicável'],
    observacao: 'A documentação específica depende da linha BNDES e do agente repassador.',
  },
  {
    codigo: 'fne_bnb', nome: 'FNE — Banco do Nordeste', instituicao: 'Banco do Nordeste', operacao: 'fundos_regionais',
    publico_alvo: 'Empreendimentos na área de atuação do FNE, conforme programa e setor.',
    requisitos_chave: ['Proposta/projeto técnico', 'Regularidade cadastral e fiscal', 'Comprovação do faturamento conforme regime', 'Licenças e garantias quando aplicáveis'],
    documentos_adicionais: ['Roteiro/proposta do programa', 'Orçamentos e cronograma físico-financeiro', 'Documentos ambientais/setoriais'],
    observacao: 'O Banco do Nordeste mantém roteiros específicos por porte, setor e regime.',
  },
  {
    codigo: 'fno_basa', nome: 'FNO — Banco da Amazônia', instituicao: 'Banco da Amazônia', operacao: 'fundos_regionais',
    publico_alvo: 'Empresas e empreendedores elegíveis na Região Norte.',
    requisitos_chave: ['Projeto de implantação/expansão/modernização', 'Regularidade fiscal e trabalhista', 'Atividade permitida', 'Capacidade e garantias'],
    documentos_adicionais: ['Checklist SPDOC da linha', 'Projeto e orçamentos', 'Licenças ambientais e operacionais'],
    observacao: 'Os itens variam por setor, porte, finalidade e programa FNO.',
  },
  {
    codigo: 'finep_inovacred', nome: 'Finep Inovacred', instituicao: 'Finep via agente financeiro', operacao: 'inovacao',
    publico_alvo: 'Empresas e pessoas jurídicas privadas com projeto de inovação elegível.',
    requisitos_chave: ['Projeto de inovação', 'Orçamento detalhado', 'Capacidade técnica e financeira', 'Agente financeiro credenciado'],
    documentos_adicionais: ['Plano de inovação', 'Cronograma e orçamento', 'Evidências técnicas e comerciais'],
    observacao: 'O enquadramento e as condições dependem do agente e das condições operacionais vigentes.',
  },
];

const INDICADORES: IndicadorCredito[] = [
  { codigo: 'receita_media_mensal', nome: 'Receita média mensal', formula: 'Faturamento dos últimos 12 meses ÷ 12', interpretacao: 'Base para dimensionar parcela, limite e sazonalidade.', fase: 4 },
  { codigo: 'liquidez_corrente', nome: 'Liquidez corrente', formula: 'Ativo circulante ÷ Passivo circulante', interpretacao: 'Avalia capacidade de cumprir obrigações de curto prazo.', fase: 5 },
  { codigo: 'liquidez_seca', nome: 'Liquidez seca', formula: '(Ativo circulante − Estoque) ÷ Passivo circulante', interpretacao: 'Mede liquidez sem depender da venda de estoques.', fase: 5 },
  { codigo: 'capital_giro_liquido', nome: 'Capital de giro líquido', formula: 'Ativo circulante − Passivo circulante', interpretacao: 'Mostra a folga financeira de curto prazo.', fase: 5 },
  { codigo: 'necessidade_capital_giro', nome: 'Necessidade de capital de giro', formula: 'Estoques + Contas a receber − Fornecedores − Obrigações operacionais', interpretacao: 'Dimensiona a necessidade operacional de caixa.', fase: 5 },
  { codigo: 'divida_liquida', nome: 'Dívida líquida', formula: 'Dívida financeira − Caixa', interpretacao: 'Mede o endividamento após disponibilidades.', fase: 5 },
  { codigo: 'endividamento_patrimonial', nome: 'Dívida / patrimônio', formula: 'Dívida financeira ÷ Patrimônio líquido', interpretacao: 'Mede dependência de capital de terceiros.', fase: 5 },
  { codigo: 'margem_bruta', nome: 'Margem bruta', formula: 'Lucro bruto ÷ Receita', interpretacao: 'Mede resultado após custos diretamente associados às vendas.', fase: 5 },
  { codigo: 'margem_ebitda', nome: 'Margem EBITDA', formula: 'EBITDA ÷ Receita líquida', interpretacao: 'Mede geração operacional antes da estrutura financeira e tributária.', fase: 5 },
  { codigo: 'margem_operacional', nome: 'Margem operacional', formula: 'EBIT ÷ Receita', interpretacao: 'Mede eficiência operacional.', fase: 5 },
  { codigo: 'margem_liquida', nome: 'Margem líquida', formula: 'Lucro líquido ÷ Receita', interpretacao: 'Mede resultado líquido sobre vendas.', fase: 5 },
  { codigo: 'roa', nome: 'ROA', formula: 'Lucro líquido ÷ Ativos totais', interpretacao: 'Mede retorno sobre ativos.', fase: 5 },
  { codigo: 'roe', nome: 'ROE', formula: 'Lucro líquido ÷ Patrimônio líquido', interpretacao: 'Mede retorno sobre capital próprio.', fase: 5 },
  { codigo: 'giro_estoque', nome: 'Giro de estoque', formula: 'Custo das vendas ÷ Estoque médio', interpretacao: 'Mede renovação de estoque.', fase: 5 },
  { codigo: 'pmr', nome: 'Prazo médio de recebimento', formula: 'Contas a receber ÷ Vendas × 365', interpretacao: 'Mede conversão de vendas em caixa.', fase: 5 },
  { codigo: 'pmp', nome: 'Prazo médio de pagamento', formula: 'Fornecedores ÷ Compras × 365', interpretacao: 'Mede prazo concedido pelos fornecedores.', fase: 5 },
  { codigo: 'ciclo_financeiro', nome: 'Ciclo financeiro', formula: 'PME + PMR − PMP', interpretacao: 'Mede dias de caixa investido no ciclo operacional.', fase: 5 },
  { codigo: 'dscr', nome: 'Cobertura do serviço da dívida (DSCR)', formula: 'Geração de caixa disponível ÷ Serviço total da dívida', interpretacao: 'Mede cobertura matemática do serviço da dívida.', fase: 5 },
  { codigo: 'concentracao_clientes', nome: 'Concentração de clientes', formula: 'Maior cliente ÷ Receita, quando informado', interpretacao: 'Mede dependência de poucos clientes.', fase: 5 },
  { codigo: 'concentracao_fornecedores', nome: 'Concentração de fornecedores', formula: 'Maior fornecedor ÷ Compras, quando informado', interpretacao: 'Mede dependência de poucos fornecedores.', fase: 5 },
];

function documentosUniversaisFase4(empresa: any): DocumentoMapa[] {
  const linhaCredito = String(empresa?.linha_credito || empresa?.linhaCredito || '').trim();
  const dataAbertura = empresa?.data_abertura ? new Date(empresa.data_abertura) : null;
  const idadeMeses = dataAbertura && !Number.isNaN(dataAbertura.getTime())
    ? Math.max(0, (new Date().getFullYear() - dataAbertura.getFullYear()) * 12 + new Date().getMonth() - dataAbertura.getMonth())
    : null;
  return DOCUMENTOS_UNIVERSAIS_EMPRESA.filter((item) => item.fase === 4).map((item) => {
    if (item.codigo === 'faturamento_12m' && linhaCredito) {
      return { ...item, obrigatorio: true, aplicabilidade: 'aplicavel', status: 'pendente', tipo_exigencia: 'politica_bancaria', motivo: `A linha ${linhaCredito} solicitou comprovação de faturamento; esta exigência não é universal.` };
    }
    if (item.codigo === 'projecao_receitas' && idadeMeses !== null && idadeMeses < 12) {
      return { ...item, obrigatorio: true, aplicabilidade: 'aplicavel', status: 'pendente', tipo_exigencia: 'politica_bancaria', motivo: 'Empresa com menos de 12 meses; utilizar projeção/receitas até formar histórico suficiente.' };
    }
    return item;
  });
}

function marcarAnexados(documentos: DocumentoMapa[], tiposAnexados: Set<string>): DocumentoMapa[] {
  return documentos.map((item) => {
    const anexado = item.tipos_arquivo.some((tipo) => tiposAnexados.has(tipo) || tiposAnexados.has(canonicalizeDocumentType(tipo)));
    return {
      ...item,
      anexado,
      status: item.aplicabilidade === 'nao_aplicavel' ? 'nao_aplicavel' : anexado ? 'anexado' : item.status || 'pendente',
    };
  });
}

export function documentosSocietariosPorNatureza(empresa: any, regime: RegimeCredito): DocumentoMapa[] {
  // CORREÇÃO (Rodada 29, 02/09/2026, auditoria própria de consistência entre
  // tipos de empresa): a checagem original também dispensava a exigência de
  // Atos da Junta/Contrato Social sempre que a NATUREZA JURÍDICA continha o
  // texto "empresario individual" -- mesmo quando o REGIME tributário não era
  // MEI. "Empresário Individual" é um tipo societário (natureza jurídica);
  // "MEI" é um regime tributário -- nem todo Empresário Individual é MEI (ex.:
  // um Empresário Individual que ultrapassou o teto do MEI e hoje é optante
  // do Simples Nacional comum, ou até Lucro Presumido). Só o MEI de fato usa
  // CCMEI e fica dispensado do fluxo de Junta Comercial (documentado em
  // `DOCUMENTOS_NAO_APLICAVEIS_POR_REGIME.mei` logo abaixo); um Empresário
  // Individual não-MEI continua registrado por Requerimento de Empresário na
  // Junta Comercial e deveria continuar exigindo a mesma comprovação de
  // continuidade societária que qualquer outra natureza jurídica -- a
  // checagem por natureza sozinha estava dispensando esse caso indevidamente,
  // só por causa do texto da natureza jurídica, não do regime tributário real
  // da empresa. Mantido `\bmei\b|\bsimei\b` (limites de palavra, mesmo padrão
  // já usado por `bucketDoRegimeTributarioHistorico` em
  // `shared/documentalPresentation.ts`) como reforço para o caso em que o
  // regime não foi identificado corretamente por outra via, mas removido
  // "empresario individual" do texto reconhecido aqui.
  if (regime === 'mei' || /microempreendedor|\bmei\b|\bsimei\b/.test(normalizar(empresa?.natureza_juridica))) return [];
  const natureza = normalizar(empresa?.natureza_juridica);
  const base = DOCUMENTOS_UNIVERSAIS_EMPRESA.filter((item) => item.fase === 2);
  if (/sociedade anonima|companhia|s a\b/.test(natureza)) {
    return [
      doc('estatuto_ata_natureza', 'Estatuto e atas societárias vigentes', ['estatuto', 'ata'], 2, 'Comprovar governança, poderes de representação e atos da companhia.', { tipo_exigencia: 'obrigacao_legal' }),
      ...base.filter((item) => item.codigo === 'atos_junta'),
    ];
  }
  if (/cooperativa/.test(natureza)) {
    return [
      doc('estatuto_ata_natureza', 'Estatuto e atas vigentes', ['estatuto', 'ata'], 2, 'Comprovar governança, poderes de representação e registro da entidade.', { tipo_exigencia: 'obrigacao_legal' }),
      ...base.filter((item) => item.codigo === 'atos_junta'),
    ];
  }
  if (/associacao|fundacao/.test(natureza)) {
    return [
      doc('estatuto_ata_natureza', 'Estatuto e atas vigentes', ['estatuto', 'ata'], 2, 'Comprovar governança e poderes de representação da entidade.', { tipo_exigencia: 'obrigacao_legal' }),
      doc('registro_cartorio_pj', 'Registro no RCPJ / Cartório de Pessoas Jurídicas', ['registro_cartorio_pj'], 2, 'Comprovar o registro do ato constitutivo e das alterações no Registro Civil de Pessoas Jurídicas.', { tipo_exigencia: 'obrigacao_legal' }),
    ];
  }
  if (/advogad|oab/.test(natureza)) {
    return [
      // CORREÇÃO (Rodada 33): `fonte_normativa` preenchida aqui porque as duas
      // pesquisas independentes (Manus AI e GPT) citam, de forma idêntica, a
      // mesma lei: sociedade de advocacia se registra na OAB, não em
      // Junta/RCPJ -- Junta/RCPJ nunca deve ser aceito como substituto.
      doc('ato_constitutivo_oab', 'Ato constitutivo e alterações da sociedade de advocacia', ['contrato_social', 'alteracao_contratual'], 2, 'Comprovar a constituição, composição e administração vigentes da sociedade.', { tipo_exigencia: 'obrigacao_legal', fonte_normativa: 'Lei nº 8.906/1994 (Estatuto da OAB), arts. 15 e 16 -- o registro constitutivo da sociedade de advogados/sociedade unipessoal de advocacia é feito na OAB Seccional; Junta Comercial e RCPJ são vedados como registro dessa atividade.' }),
      doc('registro_oab', 'Registro/ato da OAB', ['registro_oab'], 2, 'Comprovar registro da sociedade e poderes de representação perante a OAB.', { tipo_exigencia: 'obrigacao_legal', fonte_normativa: 'Lei nº 8.906/1994 (Estatuto da OAB), arts. 15 e 16 -- registro constitutivo e de alterações no Conselho Seccional da OAB.' }),
    ];
  }
  if (/empresario individual|empresa individual|\bei\b/.test(natureza)) {
    return [
      doc('requerimento_empresario_vigente', 'Requerimento de Empresário ou Instrumento de Inscrição vigente', ['requerimento_empresario', 'alteracao_contratual'], 2, 'Comprovar registro, objeto, capital e titularidade vigentes do Empresário Individual.', { tipo_exigencia: 'obrigacao_legal' }),
      ...base.filter((item) => item.codigo === 'atos_junta'),
    ];
  }
  return base;
}

const DOCUMENTOS_NAO_APLICAVEIS_POR_REGIME: Record<RegimeCredito, DocumentoMapa[]> = {
  mei: [
    doc('nao_aplicavel_contrato_social_mei', 'Contrato social e atos da Junta', ['contrato_social', 'alteracao_contratual', 'atos_junta_comercial'], 2, 'O MEI não segue o fluxo societário de LTDA/S.A.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'MEI/SIMEI utiliza CCMEI; não deve receber exigência padrão de contrato social ou Junta Comercial.' }),
    doc('nao_aplicavel_pgdas_mei', 'PGDAS-D convencional', ['pgdas'], 4, 'Não aplicável ao SIMEI; utilizar PGMEI/DAS-MEI e DASN-SIMEI.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'O MEI/SIMEI não utiliza o PGDAS-D convencional.' }),
    doc('nao_aplicavel_defis_mei', 'DEFIS', ['defis'], 4, 'Não aplicável ao MEI; utilizar DASN-SIMEI.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'O MEI/SIMEI utiliza a DASN-SIMEI.' }),
    doc('nao_aplicavel_ecd_mei', 'ECD/ECF como padrão', ['ecd', 'ecf'], 4, 'Não é exigência padrão do MEI.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'Somente uma linha ou evidência específica pode solicitar demonstração adicional.' }),
  ],
  simples_nacional: [
    doc('nao_aplicavel_ecf_simples', 'ECF como regra geral', ['ecf'], 4, 'Não é solicitada como regra geral do Simples Nacional.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'O Simples Nacional segue PGDAS-D e DEFIS; exceções devem ser justificadas pela operação.' }),
    doc('nao_aplicavel_ecd_simples', 'ECD como regra geral', ['ecd'], 4, 'Não é solicitada como regra geral do Simples Nacional.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'A exigência depende de obrigação específica ou política da operação.' }),
  ],
  nao_optante_regime_a_confirmar: [],
  nao_optante_simples: [],
  lucro_presumido: [
    doc('nao_aplicavel_pgdas_presumido', 'PGDAS-D', ['pgdas'], 4, 'Não aplicável ao Lucro Presumido.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'A empresa não é optante do Simples Nacional.' }),
    doc('nao_aplicavel_defis_presumido', 'DEFIS', ['defis'], 4, 'Não aplicável ao Lucro Presumido.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'A DEFIS é específica do Simples Nacional.' }),
  ],
  lucro_real: [
    doc('nao_aplicavel_pgdas_real', 'PGDAS-D', ['pgdas'], 4, 'Não aplicável ao Lucro Real.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'A empresa não é optante do Simples Nacional.' }),
    doc('nao_aplicavel_defis_real', 'DEFIS', ['defis'], 4, 'Não aplicável ao Lucro Real.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'A DEFIS é específica do Simples Nacional.' }),
  ],
  lucro_arbitrado: [
    doc('nao_aplicavel_pgdas_arbitrado', 'PGDAS-D', ['pgdas'], 4, 'Não aplicável ao Lucro Arbitrado.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'A empresa não é optante do Simples Nacional.' }),
    doc('nao_aplicavel_defis_arbitrado', 'DEFIS', ['defis'], 4, 'Não aplicável ao Lucro Arbitrado.', { obrigatorio: false, aplicabilidade: 'nao_aplicavel', status: 'nao_aplicavel', motivo: 'A DEFIS é específica do Simples Nacional.' }),
  ],
  imune: [],
  isenta: [],
  imune_isenta: [],
  nao_identificado: [],
};

export function gerarMapaDocumentalCredito(params: {
  empresa: any;
  enquadramento?: any;
  tiposAnexados?: Iterable<string>;
  regimeComprovado?: boolean;
  etapa1Aprovada: boolean;
  etapa2Aprovada: boolean;
}): MapaDocumentalCredito {
  const regime = identificarRegimeCredito(params.empresa, params.enquadramento);
  const tipos = new Set(Array.from(params.tiposAnexados || []).map(String));
  const etapaAtual = !params.etapa1Aprovada ? 1 : !params.etapa2Aprovada ? 2 : 3;
  const etapas: EtapaMapa[] = [
    {
      numero: 1,
      codigo: 'identidade_cnpj',
      titulo: 'Identidade do CNPJ',
      objetivo: 'Cruzar Cartão CNPJ, QSA e enquadramento tributário com os dados sincronizados da Receita Federal.',
      bloqueada: false,
      documentos: marcarAnexados([
        doc('cartao_cnpj', 'Cartão CNPJ', ['cartao_cnpj', 'cnpj_cartao'], 1, 'Confirmar CNPJ, razão social, situação, CNAE, natureza e porte.'),
        doc('qsa', 'QSA', ['qsa'], 1, 'Confirmar CNPJ, razão social, capital social, nomes dos sócios e Sócio-Administrador. Dados pessoais não participam da Etapa 1.'),
        doc('enquadramento', 'Enquadramento tributário', ['enquadramento_tributario_cnpj', 'simples_nacional'], 1, 'Confirmar regime tributário e condição no Simples/MEI.'),
      ], tipos),
    },
    {
      numero: 2,
      codigo: 'documentacao_societaria',
      titulo: 'Continuidade societária mínima de 12 meses',
      objetivo: 'Validar NIRE e datas dos atos e solicitar alterações anteriores até comprovar pelo menos 12 meses de continuidade registral.',
      bloqueada: !params.etapa1Aprovada,
              documentos: marcarAnexados(documentosSocietariosPorNatureza(params.empresa, regime), tipos),

    },
    {
      numero: 3,
      codigo: 'cadastro_regularidade',
      titulo: 'Cadastro, sócios e regularidade',
      objetivo: 'Completar cadastro bancário e certidões após a identidade e a cadeia societária estarem aprovadas.',
      bloqueada: !params.etapa2Aprovada,
      documentos: marcarAnexados([
        ...DOCUMENTOS_UNIVERSAIS_EMPRESA.filter((item) => item.fase === 3),
        ...DOCUMENTOS_REGIME[regime].filter((item) => item.fase === 3),
      ], tipos),
    },
    {
      numero: 4,
      codigo: 'fiscal_faturamento',
      titulo: `Faturamento e documentação fiscal — ${regime.replace(/_/g, ' ')}`,
      objetivo: 'Comprovar faturamento e obrigações conforme o regime tributário da empresa.',
      bloqueada: !params.etapa2Aprovada,
              documentos: marcarAnexados([
        ...documentosUniversaisFase4(params.empresa),
        ...DOCUMENTOS_REGIME[regime].filter((item) => item.fase === 4),
      ], tipos),

    },
    {
      numero: 5,
      codigo: 'capacidade_pagamento',
      titulo: 'Capacidade de pagamento e estratégia bancária',
      objetivo: 'Calcular indicadores, conciliar faturamento, dívidas, fluxo de caixa e garantias antes da proposta.',
      bloqueada: !params.etapa2Aprovada,
      documentos: [],
    },
    {
      numero: 6,
      codigo: 'proposta_operacao',
      titulo: 'Proposta por banco e operação',
      objetivo: 'Aplicar o núcleo documental ao produto escolhido e acrescentar os documentos específicos da instituição e da finalidade.',
      bloqueada: !params.etapa2Aprovada,
      documentos: [],
    },
  ];

  const descricaoRegime = ROTULO_REGIME_CREDITO;
  const regimeAConfirmar = (regime === 'nao_optante_regime_a_confirmar' || regime === 'nao_identificado') && params.regimeComprovado !== true;
  // Rodada 12 (31/08/2026, pedido explícito do usuário): a descrição desta
  // pendência é o texto que aparece no popover clicável de "Pendência" no
  // Acervo Documental (ver blocoPendenciaRegime em DocumentosEntidade.tsx) --
  // agora instrui diretamente a anexar os documentos solicitados ou, na
  // ausência deles, qualquer outro documento que comprove o regime, em vez de
  // só explicar por que a pendência existe. "Outro" é um terceiro botão de
  // upload rápido (ao lado de ECF e DCTF) que aceita qualquer documento, mas
  // só resolve a pendência quando o regime tributário estiver explicitamente
  // declarado no texto (ver `tiposComprovacaoRegime` em
  // analiseDocumentalEspecializada.ts e em routes/documentacao.ts).
  const pendencias: PendenciaMapaDocumental[] = regimeAConfirmar ? [{
    codigo: 'nao_optante_regime_a_confirmar',
    titulo: 'Comprovação do regime tributário não optante',
    descricao: 'Anexar os documentos solicitados (ECF, DCTF/DCTFWeb, DARF ou Livro Caixa) ou, caso não tenha nenhum desses, anexe outro documento que comprove o regime tributário da empresa -- com o regime tributário indicado de forma explícita.',
    acao: 'Anexar ECF, DCTF/DCTFWeb, DARF ou Livro Caixa ou, na ausência desses, outro documento que comprove o regime tributário.',
    status: 'pendente',
    prioridade: 'alta',
    tipos_documento_aceitos: ['ecf', 'dctf', 'dctfweb', 'darf', 'livro_caixa', 'comprovante_regime_outro'],
    nao_bloqueia_etapa_1: false,
  }] : [];

  return {
    versao: '2.0.0',
    regime_identificado: regime,
    regime_descricao: descricaoRegime[regime],
    regime_a_confirmar: regimeAConfirmar,
    documentos_nao_aplicaveis: marcarAnexados(DOCUMENTOS_NAO_APLICAVEIS_POR_REGIME[regime], tipos),
    etapa_atual: etapaAtual,
    proxima_acao: regimeAConfirmar && etapaAtual >= 3
      ? 'Anexar ECF, DCTF/DCTFWeb, DARF ou Livro Caixa para confirmar o regime tributário não optante.'
      : etapaAtual === 1
        ? 'Concluir a análise de Cartão CNPJ, QSA e enquadramento tributário.'
        : etapaAtual === 2
          ? 'Anexar Atos da Junta e contrato/alterações necessários para comprovar 12 meses de continuidade.'
          : 'Selecionar a finalidade do crédito e montar a trilha fiscal, financeira e bancária do regime identificado.',
    etapas,
    operacoes_disponiveis: OPERACOES,
    programas_referencia: PROGRAMAS,
    indicadores: INDICADORES,
    avisos: [
      'Os bancos não divulgam integralmente suas fórmulas internas de aprovação; o sistema calcula indicadores de prontidão e capacidade, sem prometer concessão.',
      'Documentos e condições podem variar por produto, porte, setor, região, garantias e política vigente da instituição.',
      'O catálogo deve ser confirmado no momento da proposta e pode receber perfis adicionais sem alterar o fluxo principal.',
    ],
    pendencias,
  };
}
