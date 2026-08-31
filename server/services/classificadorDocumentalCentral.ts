import { normalizeText, onlyDigits } from '../utils/helpers';
import {
  IdentityStatus,
  TemporalStatus,
  CoverageStatus,
} from './documentalLaudoVersioning';

export type TipoDetectadoDocumental =
  | 'ECF'
  | 'RECIBO_ECF'
  | 'PGDAS_D'
  | 'RECIBO_PGDAS'
  | 'DCTFWEB_MIT'
  | 'DARF'
  | 'ECD'
  | 'LIVRO_CAIXA'
  | 'CND'
  | 'CPEND'
  | 'CADIN'
  | 'PGFN'
  | 'CENPROT'
  | 'SITUACAO_FISCAL'
  | 'SCR'
  | 'CCS'
  | 'CCF'
  | 'SERASA'
  | 'DOCUMENTO_NAO_IDENTIFICADO';

export interface ClassificacaoDocumentalInput {
  tipoEsperado: string;
  texto?: string | null;
  competenciaInicio?: string | null;
  competenciaFim?: string | null;
  validadeInicio?: string | null;
  validadeFim?: string | null;
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
  if (/certidao positiva com efeito de negativa|\bcpend\b/i.test(n)) {
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
  if (n === 'comprovar_regime_atual' || n === 'regime_tributario') return 'COMPROVAR_REGIME_ATUAL';
  return tipoEsperado;
}

function autorizado(tipoEsperado: string, tipoDetectado: TipoDetectadoDocumental): boolean {
  if (tipoEsperado === tipoDetectado) return true;
  if (tipoEsperado === 'COMPROVAR_REGIME_ATUAL') {
    return ['ECF', 'DCTFWEB_MIT', 'DARF', 'ECD', 'LIVRO_CAIXA'].includes(tipoDetectado);
  }
  return false;
}

function temporalidade(input: ClassificacaoDocumentalInput): TemporalStatus {
  const hoje = input.hoje || new Date();
  const anoAtual = hoje.getUTCFullYear();
  const fim = String(input.competenciaFim || input.competenciaInicio || '').slice(0, 10);
  if (!/^\d{4}/.test(fim)) return 'ATUAL';
  const ano = Number(fim.slice(0, 4));
  if (!Number.isFinite(ano)) return 'ATUAL';
  if (ano > anoAtual) return 'ATUAL';
  if (ano === anoAtual && tipoEsperadoCanonico(input.tipoEsperado) === 'ECF') return 'AINDA_NAO_EXIGIVEL';
  if (ano < anoAtual) return 'HISTORICO';
  return 'ATUAL';
}

export function classificarDocumentoDeterministico(input: ClassificacaoDocumentalInput): ClassificacaoDocumentalResult {
  const tipoEsperado = tipoEsperadoCanonico(input.tipoEsperado);
  const detectado = detectarTipo(input.texto || '');
  const identidade: IdentityStatus = detectado.tipo === 'DOCUMENTO_NAO_IDENTIFICADO'
    ? 'NAO_IDENTIFICADO'
    : autorizado(tipoEsperado, detectado.tipo)
      ? 'IDENTIFICADO'
      : 'INCOMPATIVEL';
  const temporalidade_status = temporalidade(input);
  const satisfaz = identidade === 'IDENTIFICADO'
    && temporalidade_status !== 'FORA_JANELA'
    && temporalidade_status !== 'AINDA_NAO_EXIGIVEL';
  const cobertura_status: CoverageStatus = satisfaz ? 'SATISFAZ' : 'NAO_SATISFAZ';
  const motivo = identidade === 'INCOMPATIVEL'
    ? `Esperado ${tipoEsperado}; detectado ${detectado.tipo}.`
    : identidade === 'NAO_IDENTIFICADO'
      ? 'Não foi possível comprovar a identidade documental pelo texto disponível.'
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
  });
}

export function extrairCnpjOuCpf(texto: string): string | null {
  const numeros = onlyDigits(texto);
  const cnpj = numeros.match(/\d{14}/)?.[0];
  if (cnpj) return cnpj;
  return numeros.match(/\d{11}/)?.[0] || null;
}
