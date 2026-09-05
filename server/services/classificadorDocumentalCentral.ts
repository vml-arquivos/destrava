import { normalizeText, onlyDigits } from '../utils/helpers';
import { canonicalizeDocumentType } from '../../shared/documentTypes';
import { obterPerfilAnaliseDocumental } from './documentAnalysisProfiles';
import {
  calcularExigibilidadeDasnSimei,
  calcularExigibilidadeDefis,
  calcularExigibilidadeEcd,
  calcularExigibilidadeEcf,
} from './regimeTributarioTemporalService';
import {
  IdentityStatus,
  TemporalStatus,
  CoverageStatus,
} from './documentalLaudoVersioning';

export type TipoDetectadoDocumental = string;

export interface ClassificacaoDocumentalInput {
  tipoEsperado: string;
  texto?: string | null;
  competenciaInicio?: string | null;
  competenciaFim?: string | null;
  validadeInicio?: string | null;
  validadeFim?: string | null;
  dataEmissao?: string | null;
  hoje?: Date;
}

export interface ClassificacaoDocumentalResult {
  tipo_esperado: string;
  tipo_detectado: TipoDetectadoDocumental;
  satisfaz_requisito: boolean;
  identidade_status: IdentityStatus;
  temporalidade_status: TemporalStatus;
  cobertura_status: CoverageStatus;
  confianca: number;
  evidencias: string[];
  motivo: string;
}

function normalizar(value: unknown): string {
  return normalizeText(String(value ?? '')).replace(/\s+/g, ' ').trim();
}

function detectarTipo(texto: string): { tipo: TipoDetectadoDocumental; evidencias: string[]; confianca: number } {
  const n = normalizar(texto);
  const evidencias: string[] = [];
  const push = (evidencia: string) => { if (!evidencias.includes(evidencia)) evidencias.push(evidencia); };

  const temReciboEcf = /recibo.{0,80}(?:entrega|transmiss[aã]o).{0,80}\becf\b|\becf\b.{0,80}recibo/i.test(n);
  const temReciboPgdas = /recibo.{0,80}(?:pgdas|dasn)|\bpgdas[- ]?d\b.{0,80}recibo/i.test(n);
  if (temReciboEcf) { push('recibo ECF'); return { tipo: 'RECIBO_ECF', evidencias, confianca: 0.97 }; }
  if (temReciboPgdas) { push('recibo PGDAS-D'); return { tipo: 'RECIBO_PGDAS', evidencias, confianca: 0.97 }; }

  if (/escrituracao contabil fiscal|escrituracao contabil fiscal|\bsped\s+ecf\b|\becf\b/i.test(n)) {
    push('ECF');
    return { tipo: 'ECF', evidencias, confianca: 0.96 };
  }
  if (/declaracao de informacoes economico-fiscais|\bpgdas[- ]?d\b|programa gerador do documento de arrecadacao do simples/i.test(n)) {
    push('PGDAS-D');
    return { tipo: 'PGDAS_D', evidencias, confianca: 0.96 };
  }
  if (/dctfweb|dctf web|modulo de inclusao de tributos|\bmit\b|declaracao de debitos e creditos tributarios federais/i.test(n)) {
    push('DCTFWeb/MIT');
    return { tipo: 'DCTFWEB_MIT', evidencias, confianca: 0.94 };
  }
  if (/documento de arrecadacao de receitas federais|\bdarf\b/i.test(n)) {
    push('DARF');
    return { tipo: 'DARF', evidencias, confianca: 0.93 };
  }
  if (/escrituracao contabil digital|\becd\b|sped cont[aá]bil/i.test(n)) {
    push('ECD');
    return { tipo: 'ECD', evidencias, confianca: 0.92 };
  }
  if (/livro[- ]caixa|livro caixa/i.test(n)) {
    push('Livro Caixa');
    return { tipo: 'LIVRO_CAIXA', evidencias, confianca: 0.92 };
  }
  if (/certidao positiva com efeitos? de negativa|\bcpend\b/i.test(n)) {
    push('CPEND');
    return { tipo: 'CPEND', evidencias, confianca: 0.96 };
  }
  if (/certidao negativa de debitos|\bcnd\b/i.test(n)) {
    push('CND');
    return { tipo: 'CND', evidencias, confianca: 0.93 };
  }
  if (/cadastro informativo de creditos nao quitados|\bcadin\b/i.test(n)) {
    push('CADIN');
    return { tipo: 'CADIN', evidencias, confianca: 0.95 };
  }
  if (/procuradoria[- ]geral da fazenda nacional|\bpgfn\b/i.test(n)) {
    push('PGFN');
    return { tipo: 'PGFN', evidencias, confianca: 0.94 };
  }
  if (/central nacional de protestos|\bcenprot\b/i.test(n)) {
    push('CENPROT');
    return { tipo: 'CENPROT', evidencias, confianca: 0.95 };
  }
  if (/relatorio de situacao fiscal|informacoes de apoio para emissao de certidao|situacao fiscal/i.test(n)) {
    push('Situação Fiscal');
    return { tipo: 'SITUACAO_FISCAL', evidencias, confianca: 0.89 };
  }
  if (/sistema de informacoes de credito|\bscr\b|registrato/i.test(n)) {
    push('SCR');
    return { tipo: 'SCR', evidencias, confianca: 0.92 };
  }
  if (/cadastro de clientes do sistema financeiro|\bccs\b/i.test(n)) {
    push('CCS');
    return { tipo: 'CCS', evidencias, confianca: 0.92 };
  }
  if (/cadastro de emitentes de cheques sem fundos|\bccf\b/i.test(n)) {
    push('CCF');
    return { tipo: 'CCF', evidencias, confianca: 0.92 };
  }
  if (/\bserasa\b/i.test(n)) {
    push('Serasa');
    return { tipo: 'SERASA', evidencias, confianca: 0.90 };
  }

  const regras: Array<[string, RegExp, string, number]> = [
    ['CONTRATO_ASSESSORIA', /contrato (?:de )?assessoria|servicos de assessoria/, 'Contrato de assessoria', 0.94],
    ['CONTRATO_PRESTACAO_SERVICOS', /contrato (?:de )?prestacao de servicos|instrumento particular de prestacao de servicos/, 'Contrato de prestação de serviços', 0.94],
    ['CONTRATO_GERAL', /instrumento particular de contrato|contrato firmado entre|contratante.{0,160}contratad[oa]/, 'Contrato', 0.82],
    ['CARTAO_CNPJ', /comprovante de inscricao e de situacao cadastral|cadastro nacional da pessoa juridica/, 'Cartão CNPJ', 0.98],
    ['QSA', /quadro de socios e administradores|quadro societario|capital social.{0,80}(?:socio|titular)/, 'QSA', 0.92],
    ['ATOS_JUNTA_COMERCIAL', /junta comercial|historico de arquivamentos|certidao simplificada.{0,80}nire/, 'Atos da Junta Comercial', 0.94],
    ['REGISTRO_CARTORIO_PJ', /registro civil (?:das |de )?pessoas juridicas|\brcpj\b|cartorio.{0,80}pessoas juridicas/, 'Registro no RCPJ', 0.94],
    ['REGISTRO_OAB', /registro de sociedade de advogados|certidao.{0,100}ordem dos advogados do brasil|conselho seccional.{0,100}registro/, 'Registro OAB', 0.93],
    ['ALTERACAO_CONTRATUAL', /alteracao contratual|consolidacao contratual/, 'Alteração Contratual', 0.95],
    ['CONTRATO_SOCIAL', /contrato social|instrumento de constituicao de sociedade/, 'Contrato Social', 0.94],
    ['REQUERIMENTO_EMPRESARIO', /requerimento de empresario|instrumento de inscricao de empresario individual/, 'Requerimento de Empresário', 0.95],
    ['ESTATUTO', /estatuto social/, 'Estatuto Social', 0.94],
    ['ATA', /ata (?:de assembleia|da assembleia|de reuniao)/, 'Ata societária', 0.92],
    ['PROCURACAO', /instrumento (?:publico|particular) de procuracao|outorgante.{0,120}outorgado/, 'Procuração', 0.92],
    ['CNH', /carteira nacional de habilitacao|permissao para dirigir/, 'CNH', 0.97],
    ['RG', /registro geral|carteira de identidade|secretaria de seguranca publica/, 'RG', 0.91],
    ['CPF', /cadastro de pessoas fisicas|comprovante de situacao cadastral no cpf/, 'CPF', 0.94],
    ['CERTIDAO_CASAMENTO', /certidao de casamento|registro civil.{0,100}casamento/, 'Certidão de casamento', 0.96],
    ['CERTIDAO_NASCIMENTO', /certidao de nascimento|registro civil.{0,100}nascimento/, 'Certidão de nascimento', 0.96],
    ['AVERBACAO_DIVORCIO', /averbacao.{0,100}divorcio|divorcio averbado/, 'Averbação de divórcio', 0.94],
    ['CERTIDAO_OBITO', /certidao de obito|registro civil.{0,100}obito/, 'Certidão de óbito', 0.96],
    ['COMPROVANTE_RESIDENCIA', /conta de (?:agua|energia|telefone|internet)|comprovante de residencia|endereco de instalacao/, 'Comprovante de residência', 0.86],
    ['IRPF', /declaracao de ajuste anual|imposto sobre a renda da pessoa fisica|recibo de entrega da declaracao de ajuste anual/, 'IRPF', 0.95],
    ['CRF_FGTS', /certificado de regularidade do fgts|regularidade do empregador.{0,40}fgts/, 'CRF/FGTS', 0.96],
    ['CNDT', /certidao negativa de debitos trabalhistas|justica do trabalho.{0,80}certidao/, 'CNDT', 0.96],
    ['CND_ESTADUAL', /certidao.{0,40}(?:fazenda estadual|tributos estaduais|divida ativa estadual)/, 'CND estadual', 0.90],
    ['CND_MUNICIPAL', /certidao.{0,40}(?:fazenda municipal|tributos municipais|divida ativa municipal)/, 'CND municipal', 0.90],
    ['SIMPLES_NACIONAL', /consulta optantes|situacao no simples nacional|optante pelo simples nacional/, 'Simples Nacional', 0.96],
    ['PGMEI', /programa gerador do das para o mei|\bpgmei\b/, 'PGMEI', 0.96],
    ['DAS_MEI', /documento de arrecadacao do simples nacional.{0,80}simei|\bdas[- ]mei\b/, 'DAS-MEI', 0.94],
    ['DEFIS', /declaracao de informacoes socioeconomicas e fiscais|\bdefis\b/, 'DEFIS', 0.96],
    ['DASN_SIMEI', /declaracao anual do simei|\bdasn[- ]simei\b/, 'DASN-SIMEI', 0.96],
    ['CCMEI', /certificado da condicao de microempreendedor individual|\bccmei\b/, 'CCMEI', 0.97],
    ['EFD_CONTRIBUICOES', /efd[- ]contribuicoes|escrituracao fiscal digital.{0,80}(?:pis|cofins)|\|m400\||\|m800\|/, 'EFD-Contribuições', 0.97],
    ['EFD_ICMS_IPI', /efd.{0,30}icms.{0,10}ipi|escrituracao fiscal digital.{0,80}(?:icms|ipi)|\|e110\|/, 'EFD ICMS/IPI', 0.97],
    ['ESOCIAL', /sistema de escrituracao digital das obrigacoes fiscais previdenciarias e trabalhistas|\besocial\b/, 'eSocial', 0.94],
    ['EFD_REINF', /efd[- ]reinf|escrituracao fiscal digital de retencoes/, 'EFD-Reinf', 0.96],
    ['BALANCO', /balanco patrimonial|ativo circulante.{0,120}passivo circulante/, 'Balanço Patrimonial', 0.93],
    ['DRE', /demonstracao do resultado do exercicio|receita liquida.{0,160}lucro liquido/, 'DRE', 0.93],
    ['DFC', /demonstracao dos fluxos de caixa|fluxo de caixa das atividades operacionais/, 'DFC', 0.94],
    ['DMPL', /demonstracao das mutacoes do patrimonio liquido|\bdmpl\b/, 'DMPL', 0.95],
    ['NOTAS_EXPLICATIVAS', /notas explicativas.{0,80}demonstracoes contabeis/, 'Notas explicativas', 0.92],
    ['BALANCETE', /balancete de verificacao|saldo anterior.{0,80}debito.{0,40}credito/, 'Balancete', 0.92],
    ['RAZAO_CONTABIL', /razao contabil|livro razao/, 'Razão contábil', 0.92],
    ['FATURAMENTO_12_MESES', /faturamento.{0,80}(?:12 meses|ultimos doze meses)|declaracao de faturamento|receita bruta mensal/, 'Faturamento', 0.89],
    ['PROJECAO_RECEITAS', /projecao de receitas|receitas projetadas|faturamento projetado/, 'Projeção de receitas', 0.91],
    ['RELATORIO_RECEITAS_MEI', /relatorio mensal das receitas brutas|receitas brutas mensais.{0,60}mei/, 'Relatório de receitas MEI', 0.93],
    ['EXTRATO_BANCARIO', /extrato (?:bancario|de conta)|saldo anterior.{0,100}(?:debito|credito)/, 'Extrato bancário', 0.90],
    ['NFS_E', /nota fiscal de servicos eletronica|\bnfs[- ]?e\b/, 'NFS-e', 0.96],
    ['NF_E', /nota fiscal eletronica|danfe|chave de acesso.{0,80}nfe/, 'NF-e', 0.96],
    ['RECEBIVEIS', /agenda de recebiveis|cessao de recebiveis|duplicatas a receber/, 'Recebíveis', 0.88],
    ['CONTAS_RECEBER', /contas a receber|relatorio de titulos a receber/, 'Contas a receber', 0.90],
    ['CONTAS_PAGAR', /contas a pagar|relatorio de titulos a pagar/, 'Contas a pagar', 0.90],
    ['ESTOQUE', /posicao de estoque|inventario de estoque|relatorio de estoque/, 'Estoque', 0.88],
    ['CAPITAL_GIRO', /necessidade de capital de giro|memoria de capital de giro/, 'Capital de giro', 0.90],
    ['CONTRATO_GARANTIA', /contrato de garantia|instrumento particular de garantia/, 'Contrato de garantia', 0.93],
    ['ALIENACAO_FIDUCIARIA', /alienacao fiduciaria/, 'Alienação fiduciária', 0.95],
    ['NOTA_PROMISSORIA', /nota promissoria/, 'Nota promissória', 0.96],
    ['AVAL', /avalista|garantidor solidario/, 'Aval', 0.88],
    ['GARANTIA', /instrumento de garantia|bem em garantia|laudo de avaliacao/, 'Documento de garantia', 0.82],
    ['COMPARTILHAMENTO_ECAC', /compartilhamento.{0,60}e[- ]?cac|autoriza.{0,80}dados fiscais/, 'Compartilhamento eCAC', 0.90],
  ];
  for (const [tipo, expressao, evidencia, confianca] of regras) {
    if (expressao.test(n)) {
      push(evidencia);
      return { tipo, evidencias, confianca };
    }
  }
  return { tipo: 'DOCUMENTO_NAO_IDENTIFICADO', evidencias, confianca: 0 };
}

function tipoEsperadoCanonico(tipoEsperado: string): string {
  const n = normalizar(tipoEsperado).toLowerCase();
  if (['ecf', 'ecf_extract', 'demonstracao_ecf'].includes(n)) return 'ECF';
  if (['recibo_ecf', 'recibo_ecf_extract'].includes(n)) return 'RECIBO_ECF';
  if (['pgdas', 'pgdas_d', 'pgdas_d_extract', 'dasn'].includes(n)) return 'PGDAS_D';
  if (['recibo_pgdas', 'recibo_pgdas_extract'].includes(n)) return 'RECIBO_PGDAS';
  if (['dctf', 'dctfweb', 'mit', 'dctf_mit', 'dctf_extract'].includes(n)) return 'DCTFWEB_MIT';
  if (n === 'darf' || n === 'darf_extract') return 'DARF';
  if (n === 'ecd' || n === 'ecd_extract') return 'ECD';
  if (n === 'recibo_ecd' || n === 'recibo_ecd_extract') return 'ECD';
  if (n === 'livro_caixa') return 'LIVRO_CAIXA';
  if (n.includes('situacao_fiscal')) return 'SITUACAO_FISCAL';
  if (n.includes('cpend')) return 'CPEND';
  if (n === 'cnd' || n.includes('cnd_')) return 'CND';
  if (n.includes('cadin')) return 'CADIN';
  if (n.includes('pgfn')) return 'PGFN';
  if (n.includes('cenprot')) return 'CENPROT';
  if (n.includes('scr')) return 'SCR';
  if (n.includes('ccs')) return 'CCS';
  if (n.includes('ccf')) return 'CCF';
  if (n.includes('serasa')) return 'SERASA';
  if (n === 'contrato_prestacao_servicos') return 'CONTRATO_PRESTACAO_SERVICOS';
  if (n === 'contrato_assessoria') return 'CONTRATO_ASSESSORIA';
  if (['contrato_gerado', 'contrato_assinado'].includes(n)) return 'CONTRATO_GERAL';
  if (n === 'comprovante_regime_outro') return 'COMPROVAR_REGIME_ATUAL';
  if (n === 'comprovar_regime_atual' || n === 'regime_tributario') return 'COMPROVAR_REGIME_ATUAL';
  const canonico = canonicalizeDocumentType(String(tipoEsperado || '').trim().toLowerCase());
  const familias: Record<string, string> = {
    cartao_cnpj: 'CARTAO_CNPJ', qsa: 'QSA', atos_junta_comercial: 'ATOS_JUNTA_COMERCIAL',
    contrato_social: 'CONTRATO_SOCIAL', alteracao_contratual: 'ALTERACAO_CONTRATUAL', requerimento_empresario: 'REQUERIMENTO_EMPRESARIO', estatuto: 'ESTATUTO', ata: 'ATA', nire: 'ATOS_JUNTA_COMERCIAL',
    registro_cartorio_pj: 'REGISTRO_CARTORIO_PJ', procuracao: 'PROCURACAO', registro_oab: 'REGISTRO_OAB', documento_socio: 'DOCUMENTO_IDENTIDADE', rg: 'RG', cpf: 'CPF', cnh: 'CNH',
    comprovante_residencia: 'COMPROVANTE_RESIDENCIA', imposto_renda: 'IRPF', certidao_casamento: 'CERTIDAO_CASAMENTO', certidao_nascimento: 'CERTIDAO_NASCIMENTO', averbacao_divorcio: 'AVERBACAO_DIVORCIO', certidao_obito: 'CERTIDAO_OBITO', cnd_rfb_cnpj: 'CND', cnd_rfb_cpf: 'CND',
    crf_fgts: 'CRF_FGTS', cndt: 'CNDT', cnd_estadual: 'CND_ESTADUAL', cnd_municipal: 'CND_MUNICIPAL',
    simples_nacional: 'SIMPLES_NACIONAL', pgmei: 'PGMEI', das_mei: 'DAS_MEI', defis: 'DEFIS', dasn_simei: 'DASN_SIMEI', ccmei: 'CCMEI',
    efd_contribuicoes: 'EFD_CONTRIBUICOES', efd_icms_ipi: 'EFD_ICMS_IPI', esocial: 'ESOCIAL', efd_reinf: 'EFD_REINF',
    balanco: 'BALANCO', dre: 'DRE', dfc: 'DFC', dmpl: 'DMPL', notas_explicativas: 'NOTAS_EXPLICATIVAS', balancete: 'BALANCETE', razao_contabil: 'RAZAO_CONTABIL',
    faturamento_12_meses: 'FATURAMENTO_12_MESES', projecao_receitas: 'PROJECAO_RECEITAS', relatorio_receitas_mei: 'RELATORIO_RECEITAS_MEI',
    extrato_bancario: 'EXTRATO_BANCARIO', nf_e: 'NF_E', nfs_e: 'NFS_E', recebiveis: 'RECEBIVEIS', contas_receber: 'CONTAS_RECEBER',
    contas_pagar: 'CONTAS_PAGAR', estoque: 'ESTOQUE', capital_giro: 'CAPITAL_GIRO', garantia: 'GARANTIA',
    contrato_garantia: 'CONTRATO_GARANTIA', alienacao_fiduciaria: 'ALIENACAO_FIDUCIARIA', aval: 'AVAL', nota_promissoria: 'NOTA_PROMISSORIA', patrimonio_garantia: 'GARANTIA',
    compartilhamento_ecac: 'COMPARTILHAMENTO_ECAC',
  };
  return familias[canonico] || canonico.toUpperCase();
}

function autorizado(tipoEsperado: string, tipoDetectado: TipoDetectadoDocumental): boolean {
  if (tipoEsperado === tipoDetectado) return true;
  if (tipoEsperado === 'COMPROVAR_REGIME_ATUAL') {
    return ['ECF', 'DCTFWEB_MIT', 'DARF', 'ECD', 'LIVRO_CAIXA'].includes(tipoDetectado);
  }
  // CPEND é uma certidão federal válida (positiva com efeito de negativa),
  // não um tipo incompatível com o campo CND/CPEND. Documentos PGFN podem
  // trazer no título tanto PGFN quanto CND/CPEND.
  if (tipoEsperado === 'CND') return ['CND', 'CPEND', 'PGFN'].includes(tipoDetectado);
  if (tipoEsperado === 'PGFN') return ['PGFN', 'CND', 'CPEND'].includes(tipoDetectado);
  if (tipoEsperado === 'DOCUMENTO_IDENTIDADE') return ['RG', 'CPF', 'CNH'].includes(tipoDetectado);
  if (tipoEsperado === 'CERTIDAO') return ['CND', 'CPEND', 'CNDT', 'CND_ESTADUAL', 'CND_MUNICIPAL'].includes(tipoDetectado);
  if (tipoEsperado === 'CONTRATO_GERAL') return ['CONTRATO_GERAL', 'CONTRATO_PRESTACAO_SERVICOS', 'CONTRATO_ASSESSORIA'].includes(tipoDetectado);
  return false;
}

function tipoTemporalDetectado(tipo: TipoDetectadoDocumental, fallback: string): string {
  const mapa: Record<string, string> = {
    ECF: 'ecf', RECIBO_ECF: 'ecf', PGDAS_D: 'pgdas', RECIBO_PGDAS: 'pgdas',
    DCTFWEB_MIT: 'dctfweb', DARF: 'darf', ECD: 'ecd', LIVRO_CAIXA: 'livro_caixa',
    CRF_FGTS: 'crf_fgts', CNDT: 'cndt', CND_ESTADUAL: 'cnd_estadual', CND_MUNICIPAL: 'cnd_municipal',
    CND: 'cnd_rfb_cnpj', CPEND: 'cnd_rfb_cnpj', SCR: 'rating_bacen_cnpj', CCS: 'ccs_cnpj',
    CCF: 'ccf_cnpj', CENPROT: 'cenprot_cnpj', CADIN: 'cadin_cnpj', SERASA: 'consulta_serasa_cnpj',
    COMPROVANTE_RESIDENCIA: 'comprovante_residencia', CARTAO_CNPJ: 'cartao_cnpj',
  };
  return mapa[tipo] || fallback;
}

function parseIso(value: unknown): Date | null {
  const raw = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const data = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(data.getTime()) ? null : data;
}

function temporalidade(input: ClassificacaoDocumentalInput): TemporalStatus {
  const hoje = input.hoje || new Date();
  const hojeDia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 12));
  const validadeInicio = parseIso(input.validadeInicio);
  const validadeFim = parseIso(input.validadeFim);
  const perfil = obterPerfilAnaliseDocumental(input.tipoEsperado);
  if (validadeInicio && validadeInicio.getTime() > hojeDia.getTime()) return 'FUTURO';
  if (validadeFim && validadeFim.getTime() < hojeDia.getTime()) return 'FORA_JANELA';
  if (validadeFim) return 'ATUAL';

  const emissao = parseIso(input.dataEmissao) || (perfil.validadePadraoDias != null ? validadeInicio : null);
  if (perfil.validadePadraoDias != null) {
    if (!emissao) return 'NAO_VERIFICADO';
    if (emissao.getTime() > hojeDia.getTime() + 24 * 60 * 60 * 1000) return 'FUTURO';
    const limite = new Date(emissao);
    limite.setUTCDate(limite.getUTCDate() + perfil.validadePadraoDias);
    return limite.getTime() >= hojeDia.getTime() ? 'ATUAL' : 'FORA_JANELA';
  }

  if (perfil.politicaTemporal === 'validade_expressa') return 'NAO_VERIFICADO';
  if (perfil.politicaTemporal === 'sem_validade_formal') return 'NAO_APLICAVEL';

  const inicio = parseIso(input.competenciaInicio);
  const fim = parseIso(input.competenciaFim) || inicio;
  if (!fim) return 'NAO_VERIFICADO';
  // O fim de uma competência corrente pode estar naturalmente no futuro
  // (por exemplo, 01–30/09 consultado em 05/09). Só é documento futuro quando
  // o início da competência ainda não chegou.
  if ((inicio || fim).getTime() > hojeDia.getTime() + 24 * 60 * 60 * 1000) return 'FUTURO';
  const anoAtual = hoje.getUTCFullYear();
  const ano = fim.getUTCFullYear();
  // CORREÇÃO (Rodada 33, 05/09/2026, diagnóstico cruzado de duas pesquisas
  // independentes -- Manus AI e GPT): as duas confirmam prazo preciso por
  // dia (ECD: último dia útil de junho; DEFIS: 31/03; DASN-SIMEI: 31/05),
  // igual em espírito ao que já existia só para a ECF -- antes desta
  // correção, essas três obrigações caíam direto na regra genérica de
  // `competencia_anual` logo abaixo (só considera o ano, não o mês/dia).
  const EXIGIBILIDADE_ANUAL_POR_TIPO: Record<string, (ano: number, hoje: Date) => 'AINDA_NAO_EXIGIVEL' | 'EXIGIVEL'> = {
    ECF: calcularExigibilidadeEcf,
    ECD: calcularExigibilidadeEcd,
    DEFIS: calcularExigibilidadeDefis,
    DASN_SIMEI: calcularExigibilidadeDasnSimei,
  };
  const calculoExigibilidadeAnual = EXIGIBILIDADE_ANUAL_POR_TIPO[tipoEsperadoCanonico(input.tipoEsperado)];
  if (calculoExigibilidadeAnual && calculoExigibilidadeAnual(ano, hoje) === 'AINDA_NAO_EXIGIVEL') {
    return 'AINDA_NAO_EXIGIVEL';
  }
  if (perfil.politicaTemporal === 'competencia_anual') {
    if (ano === anoAtual) return 'AINDA_NAO_EXIGIVEL';
    return ano === anoAtual - 1 ? 'ATUAL' : 'HISTORICO';
  }
  if (perfil.politicaTemporal === 'ultimos_12_meses') {
    const diferencaMeses = (hoje.getUTCFullYear() - fim.getUTCFullYear()) * 12 + hoje.getUTCMonth() - fim.getUTCMonth();
    return diferencaMeses >= 0 && diferencaMeses <= 12 ? 'ATUAL' : 'FORA_JANELA';
  }
  const diferencaMeses = (hoje.getUTCFullYear() - fim.getUTCFullYear()) * 12 + hoje.getUTCMonth() - fim.getUTCMonth();
  // Mês corrente (quando o documento já existe) e último mês fechado são
  // evidência atual. Dois ou mais meses atrás permanecem no histórico --
  // EXCETO (CORREÇÃO Rodada 33, ver `TemporalStatus` em
  // `documentalLaudoVersioning.ts`) quando a competência ainda está dentro da
  // janela rolling de 12 meses: nesse caso é `WINDOW_SUPPORT`, não `HISTORICO`
  // puro -- ainda pode ser necessário para completar a janela de faturamento
  // corrente (esta função só olha a política deste tipo de documento, que
  // aqui é sempre `competencia_mensal` -- PGDAS-D, DCTF/DCTFWeb, MIT, DARF,
  // EFD-Contribuições, EFD ICMS/IPI etc.).
  if (diferencaMeses >= 0 && diferencaMeses <= 1) return 'ATUAL';
  if (diferencaMeses > 1 && diferencaMeses <= 12) return 'WINDOW_SUPPORT';
  return 'HISTORICO';
}

export function classificarDocumentoDeterministico(input: ClassificacaoDocumentalInput): ClassificacaoDocumentalResult {
  const tipoEsperado = tipoEsperadoCanonico(input.tipoEsperado);
  const detectado = detectarTipo(input.texto || '');
  const identidade: IdentityStatus = detectado.tipo === 'DOCUMENTO_NAO_IDENTIFICADO'
    ? 'NAO_IDENTIFICADO'
    : autorizado(tipoEsperado, detectado.tipo)
      ? 'IDENTIFICADO'
      : 'INCOMPATIVEL';
  const temporalidade_status = temporalidade({
    ...input,
    tipoEsperado: detectado.tipo === 'DOCUMENTO_NAO_IDENTIFICADO'
      ? input.tipoEsperado
      : tipoTemporalDetectado(detectado.tipo, input.tipoEsperado),
  });
  const satisfaz = identidade === 'IDENTIFICADO'
    && (temporalidade_status === 'ATUAL' || temporalidade_status === 'NAO_APLICAVEL');
  const cobertura_status: CoverageStatus = satisfaz ? 'SATISFAZ' : 'NAO_SATISFAZ';
  const motivo = identidade === 'INCOMPATIVEL'
    ? `Esperado ${tipoEsperado}; detectado ${detectado.tipo}.`
    : identidade === 'NAO_IDENTIFICADO'
      ? 'Não foi possível comprovar a identidade documental pelo texto disponível.'
      : temporalidade_status === 'FUTURO'
        ? 'A data informada está no futuro e não pode ser aceita automaticamente.'
        : temporalidade_status === 'NAO_VERIFICADO'
          ? 'A competência, emissão ou validade exigida não foi comprovada.'
          : temporalidade_status === 'FORA_JANELA'
            ? 'O documento está vencido ou fora da janela temporal exigida.'
            : temporalidade_status === 'HISTORICO'
              ? 'O documento foi preservado como evidência histórica, mas não comprova a situação atual.'
              : temporalidade_status === 'WINDOW_SUPPORT'
                ? 'O documento é histórico, mas a competência ainda está dentro da janela de faturamento dos últimos 12 meses -- pode continuar sendo necessário para completá-la.'
      : temporalidade_status === 'AINDA_NAO_EXIGIVEL'
        ? 'O documento pertence ao ano-calendário ainda corrente e não é exigível como atraso.'
        : satisfaz
          ? 'Tipo documental e temporalidade compatíveis com o requisito.'
          : 'A evidência não comprovou o requisito.';

  return {
    tipo_esperado: tipoEsperado,
    tipo_detectado: detectado.tipo,
    satisfaz_requisito: satisfaz,
    identidade_status: identidade,
    temporalidade_status,
    cobertura_status,
    confianca: detectado.confianca,
    evidencias: detectado.evidencias,
    motivo,
  };
}

export function classificarResultadoPersistido(input: {
  tipoEsperado: string;
  resultado?: Record<string, any> | null;
  texto?: string | null;
  competencia?: { inicio?: string | null; fim?: string | null } | null;
  validade?: { inicio?: string | null; fim?: string | null } | null;
}): ClassificacaoDocumentalResult {
  const resultado = input.resultado || {};
  const texto = [
    input.texto,
    resultado.texto,
    resultado.ocr_texto,
    resultado.dados_extraidos?.texto,
    resultado.dados_extraidos?.regime_tributario,
    resultado.campos_comprovados?.texto,
  ].filter((value) => typeof value === 'string' && value.trim()).join('\n');
  return classificarDocumentoDeterministico({
    tipoEsperado: input.tipoEsperado,
    texto,
    competenciaInicio: input.competencia?.inicio || resultado.competencia?.inicio,
    competenciaFim: input.competencia?.fim || resultado.competencia?.fim,
    validadeInicio: input.validade?.inicio || resultado.validade?.inicio || resultado.validade_inicio,
    validadeFim: input.validade?.fim || resultado.validade?.fim || resultado.validade_fim,
    dataEmissao: resultado.data_emissao || resultado.data_consulta || resultado.data_documento || resultado.campos_comprovados?.data_emissao,
  });
}

export function extrairCnpjOuCpf(texto: string): string | null {
  const numeros = onlyDigits(texto);
  const cnpj = numeros.match(/\d{14}/)?.[0];
  if (cnpj) return cnpj;
  return numeros.match(/\d{11}/)?.[0] || null;
}
