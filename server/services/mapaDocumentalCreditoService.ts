export type RegimeCredito = 'mei' | 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'imune_isenta' | 'nao_identificado';
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

export type MapaDocumentalCredito = {
  versao: string;
  regime_identificado: RegimeCredito;
  regime_descricao: string;
  etapa_atual: number;
  proxima_acao: string;
  etapas: EtapaMapa[];
  operacoes_disponiveis: Array<{ codigo: TipoOperacaoCredito; nome: string; objetivo: string; documentos_adicionais: string[] }>;
  programas_referencia: PerfilProgramaCredito[];
  indicadores: IndicadorCredito[];
  avisos: string[];
};

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
  if (/simples nacional|optante/.test(texto) || empresa?.opcao_simples === true || empresa?.opcao_pelo_simples === true) return 'simples_nacional';
  if (/lucro presumido|presumido/.test(texto)) return 'lucro_presumido';
  if (/lucro real/.test(texto)) return 'lucro_real';
  if (/imune|isenta|sem fins lucrativos/.test(texto)) return 'imune_isenta';
  return 'nao_identificado';
}

function doc(codigo: string, nome: string, tipos: string[], fase: number, finalidade: string, extras: Partial<DocumentoMapa> = {}): DocumentoMapa {
  return { codigo, nome, tipos_arquivo: tipos, obrigatorio: true, fase, finalidade, ...extras };
}

const DOCUMENTOS_UNIVERSAIS_EMPRESA: DocumentoMapa[] = [
  doc('contrato_social_vigente', 'Contrato social, consolidação ou última alteração registrada', ['contrato_social', 'alteracao_contratual'], 2, 'Comprovar NIRE, data de registro, capital e administração vigentes.'),
  doc('atos_junta', 'Certidão ou lista de atos da Junta Comercial', ['atos_junta_comercial'], 2, 'Conferir o histórico registral e determinar a cadeia de alterações necessária.'),
  doc('cnd_federal', 'CND/CPEND Federal e Dívida Ativa da União', ['cnd_rfb_cnpj', 'pgfn_cnpj'], 3, 'Comprovar regularidade fiscal federal.', { validade_dias: 180 }),
  doc('regularidade_fgts', 'Certificado de Regularidade do FGTS', ['crf_fgts', 'fgts'], 3, 'Comprovar regularidade perante o FGTS.'),
  doc('certidao_estadual', 'Certidão estadual', ['cnd_estadual', 'certidao_estadual'], 3, 'Comprovar regularidade fiscal estadual.'),
  doc('certidao_municipal', 'Certidão municipal', ['cnd_municipal', 'certidao_municipal'], 3, 'Comprovar regularidade fiscal municipal.'),
  doc('extratos_bancarios', 'Extratos bancários empresariais', ['extrato_bancario'], 4, 'Comprovar movimentação, sazonalidade e capacidade de pagamento.', { observacao: 'Preferencialmente 6 a 12 meses, conforme produto e instituição.' }),
  doc('faturamento_12m', 'Faturamento mensal dos últimos 12 meses', ['faturamento_12_meses', 'comprovante_faturamento', 'declaracao_faturamento'], 4, 'Medir receita recorrente, sazonalidade e limite operacional.'),
  doc('scr_pj', 'Relatório SCR/Registrato da empresa', ['scr_cnpj', 'rating_bacen_cnpj', 'relatorio_scr'], 4, 'Mapear endividamento, limites e histórico de crédito.'),
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
    doc('comprovante_simples', 'Comprovante de opção pelo Simples Nacional', ['simples_nacional', 'enquadramento_tributario_cnpj'], 3, 'Comprovar o regime tributário vigente.'),
    doc('pgdas_12m', 'PGDAS-D dos últimos 12 meses e recibos', ['pgdas', 'recibo_pgdas'], 4, 'Comprovar faturamento declarado mês a mês.'),
    doc('defis', 'DEFIS do último exercício e recibo', ['defis', 'recibo_defis'], 4, 'Comprovar informações socioeconômicas e fiscais anuais.'),
    doc('bp_dre_simples', 'Balanço Patrimonial e DRE', ['balanco', 'dre'], 4, 'Demonstrar resultado e patrimônio quando exigido pela operação ou pelo porte.', { obrigatorio: false, observacao: 'Torna-se prioritário em operações estruturadas, investimentos e empresas de maior faturamento.' }),
  ],
  lucro_presumido: [
    doc('ecf_presumido', 'ECF e recibo de entrega', ['ecf', 'recibo_ecf'], 4, 'Comprovar regime e faturamento fiscal.'),
    doc('ecd_presumido', 'ECD e recibo, quando obrigada', ['ecd', 'recibo_ecd'], 4, 'Comprovar escrituração e demonstrações contábeis.', { obrigatorio: false }),
    doc('bp_dre_presumido', 'Balanço Patrimonial e DRE dos últimos exercícios', ['balanco', 'dre'], 4, 'Avaliar patrimônio, resultado e capacidade de pagamento.'),
    doc('balancete_atual', 'Balancete e DRE acumulada do exercício atual', ['balancete', 'dre'], 4, 'Atualizar a análise entre fechamentos anuais.'),
    doc('dctf_dctfweb', 'DCTF/DCTFWeb ou comprovantes fiscais equivalentes', ['dctf', 'dctfweb', 'darf'], 4, 'Confirmar obrigações tributárias e regime informado.'),
  ],
  lucro_real: [
    doc('ecf_real', 'ECF e recibo de entrega', ['ecf', 'recibo_ecf'], 4, 'Comprovar apuração fiscal e parâmetros do Lucro Real.'),
    doc('ecd_real', 'ECD e recibo de entrega', ['ecd', 'recibo_ecd'], 4, 'Comprovar escrituração contábil oficial.'),
    doc('demonstracoes_real', 'Balanço, DRE, DFC e notas explicativas', ['balanco', 'dre', 'dfc', 'notas_explicativas'], 4, 'Avaliar estrutura financeira e geração de caixa.'),
    doc('balancete_real', 'Balancete atual, razão e DRE acumulada', ['balancete', 'razao_contabil', 'dre'], 4, 'Atualizar a posição financeira do exercício corrente.'),
    doc('dctf_real', 'DCTF/DCTFWeb e comprovantes de recolhimento', ['dctf', 'dctfweb', 'darf'], 4, 'Conferir regularidade das obrigações fiscais.'),
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
  { codigo: 'margem_ebitda', nome: 'Margem EBITDA', formula: 'EBITDA ÷ Receita líquida', interpretacao: 'Mede geração operacional antes da estrutura financeira e tributária.', fase: 5 },
  { codigo: 'dscr', nome: 'Cobertura do serviço da dívida (DSCR)', formula: 'Geração de caixa disponível ÷ Serviço total da dívida', interpretacao: 'Acima de 1 indica cobertura matemática; a margem exigida varia por instituição.', fase: 5 },
  { codigo: 'divida_ebitda', nome: 'Dívida líquida / EBITDA', formula: '(Dívida financeira − Caixa) ÷ EBITDA', interpretacao: 'Mede alavancagem e tempo teórico de amortização.', fase: 5 },
  { codigo: 'liquidez_corrente', nome: 'Liquidez corrente', formula: 'Ativo circulante ÷ Passivo circulante', interpretacao: 'Avalia capacidade de cumprir obrigações de curto prazo.', fase: 5 },
  { codigo: 'cobertura_juros', nome: 'Cobertura de juros', formula: 'EBIT ÷ Despesa financeira', interpretacao: 'Mede folga operacional para pagamento de juros.', fase: 5 },
  { codigo: 'capital_giro_liquido', nome: 'Capital de giro líquido', formula: 'Ativo circulante − Passivo circulante', interpretacao: 'Mostra a folga financeira de curto prazo.', fase: 5 },
  { codigo: 'necessidade_capital_giro', nome: 'Necessidade de capital de giro', formula: 'Estoques + Contas a receber − Fornecedores − Obrigações operacionais', interpretacao: 'Dimensiona a necessidade operacional de caixa.', fase: 5 },
];

function marcarAnexados(documentos: DocumentoMapa[], tiposAnexados: Set<string>): DocumentoMapa[] {
  return documentos.map((item) => ({ ...item, anexado: item.tipos_arquivo.some((tipo) => tiposAnexados.has(tipo)) }));
}

export function gerarMapaDocumentalCredito(params: {
  empresa: any;
  enquadramento?: any;
  tiposAnexados?: Iterable<string>;
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
        doc('qsa', 'QSA', ['qsa'], 1, 'Confirmar capital social, nomes, qualificações e administrador.'),
        doc('enquadramento', 'Enquadramento tributário', ['enquadramento_tributario_cnpj', 'simples_nacional'], 1, 'Confirmar regime tributário e condição no Simples/MEI.'),
      ], tipos),
    },
    {
      numero: 2,
      codigo: 'documentacao_societaria',
      titulo: 'Continuidade societária mínima de 12 meses',
      objetivo: 'Validar NIRE e datas dos atos e solicitar alterações anteriores até comprovar pelo menos 12 meses de continuidade registral.',
      bloqueada: !params.etapa1Aprovada,
      documentos: marcarAnexados(DOCUMENTOS_UNIVERSAIS_EMPRESA.filter((item) => item.fase === 2), tipos),
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
        ...DOCUMENTOS_UNIVERSAIS_EMPRESA.filter((item) => item.fase === 4),
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

  const descricaoRegime: Record<RegimeCredito, string> = {
    mei: 'Microempreendedor Individual / SIMEI',
    simples_nacional: 'Simples Nacional',
    lucro_presumido: 'Lucro Presumido',
    lucro_real: 'Lucro Real',
    imune_isenta: 'Imune ou isenta',
    nao_identificado: 'Regime ainda não identificado',
  };

  return {
    versao: '1.1.0',
    regime_identificado: regime,
    regime_descricao: descricaoRegime[regime],
    etapa_atual: etapaAtual,
    proxima_acao: etapaAtual === 1
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
  };
}
