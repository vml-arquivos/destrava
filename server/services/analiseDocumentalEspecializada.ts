import fs from 'fs/promises';
import path from 'path';
import pkg from 'pg';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  diffDays,
  normalizeText,
  normalizarBasico,
  normalizarNomeEmpresarial,
  onlyDigits,
  parseDate,
} from '../utils/helpers';
import { extrairDocumentoLocal, type TipoDocumentoLocal } from './extracaoDocumentalLocal';
import { resolveDocumentPath } from './documentStorage';

const { Pool } = pkg;

export type SeveridadeDocumental = 'baixa' | 'media' | 'alta' | 'critica';
export type TipoAnaliseDocumental = 'qsa' | 'simples_nacional' | 'atos_junta_comercial';

export interface AlertaDocumental {
  codigo: string;
  mensagem: string;
  severidade: SeveridadeDocumental;
  campo?: string;
  valor_documento?: unknown;
  valor_receita?: unknown;
  recomendacao?: string;
}

export interface AnaliseDocumentalResult {
  tipo_analise: TipoAnaliseDocumental;
  empresa_id: string;
  arquivo_id: string;
  status: 'concluido' | 'revisao_humana';
  dados_extraidos: Record<string, any>;
  alertas: AlertaDocumental[];
  divergencias: AlertaDocumental[];
  nivel_confianca: number | null;
  modelo_ia: string | null;
  analisado_em: string;
  revisao_humana_necessaria: boolean;
}

interface Queryable {
  query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

interface DocumentoArquivoRow {
  id: string;
  empresa_id?: string | null;
  entidade_id?: string | null;
  entidade_tipo?: string | null;
  nome_original?: string | null;
  nome_arquivo?: string | null;
  hash_arquivo?: string | null;
  caminho_arquivo?: string | null;
  url_arquivo?: string | null;
  mime_type?: string | null;
  tipo_documento?: string | null;
}

type ExtratorInjetado = (arquivoPath: string, prompt: string, mimeType: string) => Promise<any>;

const defaultPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if ((raw.match(/\./g) || []).length > 1) normalized = raw.replace(/\./g, '');
  normalized = normalized.replace(/[^0-9.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizarConfianca(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 1 && number <= 100) return Math.max(0, Math.min(1, number / 100));
  return Math.max(0, Math.min(1, number));
}

function normalizarBooleano(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  const text = normalizeText(value);
  if (!text) return null;
  if (['sim', 'true', 'optante', 'ativo', 'ativa'].includes(text)) return true;
  if (['nao', 'false', 'nao optante', 'inativo', 'inativa', 'excluido', 'excluida'].includes(text)) return false;
  return null;
}

function normalizarSituacaoSimples(value: unknown): 'optante' | 'nao_optante' | 'excluido' | 'desconhecido' {
  const text = normalizarBasico(value);
  if (!text) return 'desconhecido';
  if (text.includes('exclu')) return 'excluido';
  if (text.includes('nao optante') || text.includes('não optante')) return 'nao_optante';
  if (text.includes('optante')) return 'optante';
  return 'desconhecido';
}

function capitalDivergente(documento: unknown, receita: unknown) {
  const doc = asNumber(documento);
  const rec = asNumber(receita);
  if (doc === null || rec === null) return { divergente: false, significativo: false, documento: doc, receita: rec, diferenca_percentual: null as number | null };
  const diferenca = Math.abs(doc - rec);
  const base = Math.max(Math.abs(rec), 1);
  const percentual = diferenca / base;
  return {
    divergente: diferenca > 0.01,
    significativo: diferenca > 1 && percentual >= 0.1,
    documento: doc,
    receita: rec,
    diferenca_percentual: percentual,
  };
}

function uniqueAlerts(alertas: AlertaDocumental[]): AlertaDocumental[] {
  const seen = new Set<string>();
  return alertas.filter((alerta) => {
    const key = `${alerta.codigo}|${alerta.mensagem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function criarResultado(
  tipo: TipoAnaliseDocumental,
  empresaId: string,
  arquivoId: string,
  dados: Record<string, any>,
  alertas: AlertaDocumental[],
  modelo: string | null,
): AnaliseDocumentalResult {
  const alertasUnicos = uniqueAlerts(alertas);
  const revisao = alertasUnicos.some((alerta) => alerta.severidade === 'critica' || alerta.severidade === 'alta');
  return {
    tipo_analise: tipo,
    empresa_id: empresaId,
    arquivo_id: arquivoId,
    status: revisao ? 'revisao_humana' : 'concluido',
    dados_extraidos: dados,
    alertas: alertasUnicos,
    divergencias: alertasUnicos,
    nivel_confianca: normalizarConfianca(dados?.confianca),
    modelo_ia: modelo,
    analisado_em: new Date().toISOString(),
    revisao_humana_necessaria: revisao,
  };
}

function normalizarQualificacaoSocietaria(value: unknown): string {
  return normalizarBasico(value)
    .replace(/^\d{1,3}\s*-?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classificarAdministrador(qualificacao: unknown): boolean | null {
  const texto = normalizarQualificacaoSocietaria(qualificacao);
  if (!texto) return null;
  if (/administrador|socio administrador|titular|empresario individual/.test(texto)) return true;
  if (/^socio$|socio quotista|quotista|acionista/.test(texto)) return false;
  return null;
}

function socioNormalizado(socio: any): { nome: string; qualificacao: string; administrador: boolean | null; original: any } {
  const qualificacao = normalizarQualificacaoSocietaria(
    socio?.qualificacao ||
    socio?.qualificacao_socio ||
    socio?.descricao_qualificacao ||
    socio?.cargo ||
    socio?.papel,
  );
  const administradorExplicito = typeof socio?.administrador === 'boolean'
    ? socio.administrador
    : typeof socio?.socio_administrador === 'boolean'
      ? socio.socio_administrador
      : null;
  return {
    nome: normalizarBasico(socio?.nome || socio?.nome_socio || socio?.razao_social),
    qualificacao,
    administrador: administradorExplicito ?? classificarAdministrador(qualificacao),
    original: socio,
  };
}

function socioEhComparavel(socio: ReturnType<typeof socioNormalizado>): boolean {
  if (!socio.nome) return false;
  const genericos = new Set([
    'nao identificado',
    'nao informada',
    'nao informado',
    'sem identificacao',
    'socio nao identificado',
    'socio nao informado',
    'administrador nao identificado',
    'representante nao identificado',
  ]);
  if (genericos.has(socio.nome)) return false;
  if (/^(?:socio|administrador|representante|nome|qualificacao)$/.test(socio.nome)) return false;
  return socio.nome.replace(/[^a-z0-9]/g, '').length >= 4;
}

function listasSocietarias(value: any, profundidade = 0): any[] {
  if (!value || profundidade > 3) return [];
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
  if (typeof value !== 'object') return [];
  const chaves = [
    'qsa', 'socios', 'socios_receita', 'quadro_societario', 'quadroSocietario',
    'administradores', 'payload_normalizado', 'dados_consolidados', 'dados', 'resultado',
  ];
  const encontrados: any[] = [];
  for (const chave of chaves) encontrados.push(...listasSocietarias(value[chave], profundidade + 1));
  return encontrados;
}

function consolidarSociosReceita(empresa: any, sociosCadastro: any[]): any[] {
  const candidatos = [
    ...(Array.isArray(sociosCadastro) ? sociosCadastro : []),
    ...listasSocietarias(empresa?.socios_receita),
    ...listasSocietarias(empresa?.qsa),
    ...listasSocietarias(empresa?.dados_extra_receita),
    ...listasSocietarias(empresa?.dados_fontes_cnpj),
    ...listasSocietarias(empresa?.fontes_cnpj),
  ];
  const unicos = new Map<string, any>();
  for (const candidato of candidatos) {
    const normalizado = socioNormalizado(candidato);
    if (!socioEhComparavel(normalizado)) continue;
    const chave = normalizado.nome;
    if (!chave) continue;
    if (!unicos.has(chave)) unicos.set(chave, candidato);
  }
  return [...unicos.values()];
}

export function validarQsaExtraida(empresa: any, sociosReceita: any[], dados: any): AlertaDocumental[] {
  const alertas: AlertaDocumental[] = [];
  if (dados?.documento_compativel === false) {
    alertas.push({ codigo: 'qsa_documento_incompativel', mensagem: 'O arquivo não foi reconhecido como QSA, Contrato Social ou ato societário compatível.', severidade: 'alta', recomendacao: 'Reclassificar o arquivo ou anexar o documento societário correto.' });
  }
  const confiancaExtracao = normalizarConfianca(dados?.confianca);
  if (dados?.extracao_parcial === true || (confiancaExtracao !== null && confiancaExtracao < 0.6)) {
    alertas.push({ codigo: 'qsa_extracao_inconclusiva', mensagem: 'A leitura automática do QSA ficou abaixo do nível mínimo de confiança.', severidade: 'alta', recomendacao: 'Revisar o documento ou executar OCR externo antes de liberar o avanço.' });
  }
  const cnpjDocumento = onlyDigits(dados?.cnpj);
  const cnpjReceita = onlyDigits(empresa?.cnpj);
  if (cnpjDocumento && cnpjReceita && cnpjDocumento !== cnpjReceita) {
    alertas.push({
      codigo: 'qsa_cnpj_divergente',
      campo: 'cnpj',
      mensagem: 'O CNPJ extraído do QSA/Contrato Social não corresponde ao CNPJ da empresa.',
      severidade: 'critica',
      valor_documento: dados?.cnpj,
      valor_receita: empresa?.cnpj,
      recomendacao: 'Interromper o uso do documento e solicitar o QSA/Contrato Social correto.',
    });
  }

  const razaoDocumento = normalizarNomeEmpresarial(dados?.razao_social || dados?.nome_empresarial);
  const razaoReceita = normalizarNomeEmpresarial(empresa?.razao_social || empresa?.nome_empresarial);
  if (razaoDocumento && razaoReceita && razaoDocumento !== razaoReceita) {
    alertas.push({
      codigo: 'qsa_razao_social_divergente',
      campo: 'razao_social',
      mensagem: 'A razão social extraída do QSA não corresponde à razão social cadastrada na Receita Federal.',
      severidade: 'alta',
      valor_documento: dados?.razao_social || dados?.nome_empresarial,
      valor_receita: empresa?.razao_social || empresa?.nome_empresarial,
      recomendacao: 'Confirmar se o documento societário pertence à empresa e se representa a versão vigente.',
    });
  } else if (!razaoDocumento) {
    alertas.push({
      codigo: 'qsa_razao_social_nao_extraida',
      campo: 'razao_social',
      mensagem: 'Não foi possível confirmar a razão social no QSA.',
      severidade: 'alta',
      recomendacao: 'Reprocessar o QSA ou anexar uma versão legível antes de concluir a Etapa 1.',
    });
  }

  const capital = capitalDivergente(dados?.capital_social, empresa?.capital_social);
  if (capital.divergente) {
    alertas.push({
      codigo: 'qsa_capital_social_divergente',
      campo: 'capital_social',
      mensagem: 'O capital social do documento diverge do cadastro obtido na Receita Federal.',
      severidade: capital.significativo ? 'alta' : 'media',
      valor_documento: capital.documento,
      valor_receita: capital.receita,
      recomendacao: 'Confirmar a alteração societária mais recente e sincronizar os dados cadastrais.',
    });
  } else if (capital.documento === null) {
    alertas.push({
      codigo: 'qsa_capital_social_nao_extraido',
      campo: 'capital_social',
      mensagem: 'Não foi possível confirmar o capital social no QSA.',
      severidade: 'alta',
      recomendacao: 'Reprocessar o QSA ou anexar uma versão legível antes de concluir a Etapa 1.',
    });
  }

  const sociosDocumento: Array<ReturnType<typeof socioNormalizado>> = Array.isArray(dados?.socios)
    ? (dados.socios as any[]).map(socioNormalizado).filter(socioEhComparavel)
    : [];
  const sociosBase: Array<ReturnType<typeof socioNormalizado>> = Array.isArray(sociosReceita)
    ? sociosReceita.map(socioNormalizado).filter(socioEhComparavel)
    : [];

  // A Etapa 1 confere exclusivamente a identidade societária: nomes e
  // qualificações, identificando quem é Sócio-Administrador. CPF/RG,
  // nacionalidade, estado civil, cônjuge, profissão, contato e endereço
  // pertencem à etapa documental seguinte e não participam desta validação.
  // Quando a leitura não extrai nenhum sócio, não inventa divergências
  // individuais para cada cadastro da Receita: registra uma única falha de
  // leitura e permite reprocessar o documento.
  if (sociosDocumento.length === 0 && sociosBase.length > 0 && !alertas.some((alerta) => alerta.codigo === 'qsa_extracao_inconclusiva')) {
    alertas.push({
      codigo: 'qsa_socios_nao_extraidos',
      campo: 'socios',
      mensagem: 'Não foi possível extrair com segurança a relação de sócios do documento QSA.',
      severidade: 'alta',
      recomendacao: 'Reprocessar o QSA ou substituir o arquivo por uma versão legível antes de concluir a Etapa 1.',
    });
  } else if (sociosDocumento.length > 0 && sociosBase.length > 0) {
    if (sociosDocumento.some((socio) => !socio.qualificacao)) {
      alertas.push({
        codigo: 'qsa_qualificacao_nao_extraida',
        campo: 'socios.qualificacao',
        mensagem: 'A qualificação societária de um ou mais sócios não foi identificada no QSA.',
        severidade: 'alta',
        recomendacao: 'Reprocessar o QSA para identificar quem é sócio e quem é Sócio-Administrador.',
      });
    }

    const administradoresReceita = sociosBase.filter((socio) => socio.administrador === true);
    const administradoresDocumento = sociosDocumento.filter((socio) => socio.administrador === true);
    if (administradoresReceita.length > 0 && administradoresDocumento.length === 0) {
      alertas.push({
        codigo: 'qsa_administrador_nao_identificado',
        campo: 'socios.qualificacao',
        mensagem: 'O QSA não permitiu identificar quem exerce a administração da empresa.',
        severidade: 'alta',
        recomendacao: 'Reprocessar o documento e confirmar a qualificação Sócio-Administrador antes de concluir a Etapa 1.',
      });
    }

    for (const socioDoc of sociosDocumento) {
      const socioBase = sociosBase.find((item) => !!socioDoc.nome && socioDoc.nome === item.nome);
      const encontrado = !!socioBase;
      if (!encontrado) {
        alertas.push({
          codigo: 'qsa_socio_documento_nao_encontrado_receita',
          campo: 'socios',
          mensagem: `O sócio "${socioDoc.original?.nome || socioDoc.original?.cpf_cnpj}" consta no QSA, mas não foi localizado no quadro societário sincronizado da Receita.`,
          severidade: 'alta',
          valor_documento: socioDoc.original,
          recomendacao: 'Verificar se houve alteração societária recente ou se o QSA anexado não representa a versão vigente.',
        });
      } else if (socioBase && socioDoc.administrador !== null && socioBase.administrador !== null && socioDoc.administrador !== socioBase.administrador) {
        alertas.push({
          codigo: 'qsa_qualificacao_administrador_divergente',
          campo: 'socios.qualificacao',
          mensagem: `A qualificação de "${socioDoc.original?.nome || socioDoc.nome}" diverge quanto à condição de Sócio-Administrador.`,
          severidade: 'alta',
          valor_documento: socioDoc.original?.qualificacao || socioDoc.original?.qualificacao_socio || null,
          valor_receita: socioBase.original?.qualificacao || socioBase.original?.qualificacao_socio || null,
          recomendacao: 'Confirmar a composição administrativa vigente antes de concluir a Etapa 1.',
        });
      }
    }

    for (const socioBase of sociosBase) {
      const encontrado = sociosDocumento.some((socioDoc) => {
        return !!socioDoc.nome && socioDoc.nome === socioBase.nome;
      });
      if (!encontrado) {
        alertas.push({
          codigo: 'qsa_socio_receita_ausente_documento',
          campo: 'socios',
          mensagem: `O sócio "${socioBase.original?.nome || socioBase.original?.cpf_cnpj}" consta no quadro societário sincronizado da Receita, mas não aparece no QSA analisado.`,
          severidade: 'alta',
          valor_receita: socioBase.original,
          recomendacao: 'Solicitar QSA ou alteração contratual atualizada antes de concluir a Etapa 1.',
        });
      }
    }
  }

  if (!cnpjDocumento) {
    alertas.push({ codigo: 'qsa_cnpj_nao_extraido', campo: 'cnpj', mensagem: 'Não foi possível confirmar o CNPJ no documento societário.', severidade: 'media', recomendacao: 'Realizar conferência humana do documento.' });
  }
  return uniqueAlerts(alertas);
}

export function validarSimplesExtraido(empresa: any, dados: any): AlertaDocumental[] {
  const alertas: AlertaDocumental[] = [];
  if (dados?.documento_compativel === false) {
    alertas.push({ codigo: 'simples_documento_incompativel', mensagem: 'O arquivo não foi reconhecido como comprovante do Simples Nacional.', severidade: 'alta', recomendacao: 'Reclassificar o arquivo ou anexar o comprovante correto.' });
  }
  const confiancaExtracao = normalizarConfianca(dados?.confianca);
  if (dados?.extracao_parcial === true || (confiancaExtracao !== null && confiancaExtracao < 0.6)) {
    alertas.push({ codigo: 'simples_extracao_inconclusiva', mensagem: 'A leitura automática do enquadramento tributário ficou abaixo do nível mínimo de confiança.', severidade: 'alta', recomendacao: 'Revisar o documento ou executar OCR externo antes de liberar o avanço.' });
  }
  const cnpjDocumento = onlyDigits(dados?.cnpj);
  const cnpjReceita = onlyDigits(empresa?.cnpj);
  if (cnpjDocumento && cnpjReceita && cnpjDocumento !== cnpjReceita) {
    alertas.push({ codigo: 'simples_cnpj_divergente', campo: 'cnpj', mensagem: 'O comprovante do Simples Nacional pertence a outro CNPJ.', severidade: 'critica', valor_documento: dados?.cnpj, valor_receita: empresa?.cnpj, recomendacao: 'Solicitar o comprovante correto do CNPJ analisado.' });
  }

  if (normalizarBooleano(dados?.agendamento_exclusao) === true) {
    alertas.push({ codigo: 'simples_exclusao_agendada', campo: 'agendamento_exclusao', mensagem: 'O documento informa agendamento de exclusão do Simples Nacional.', severidade: 'critica', valor_documento: true, recomendacao: 'Verificar imediatamente a causa, a data efetiva e os impactos tributários e de crédito.' });
  }

  const situacaoDocumento = normalizarSituacaoSimples(dados?.situacao_simples);
  const optanteReceita = normalizarBooleano(
    empresa?.opcao_pelo_simples ??
    empresa?.opcao_simples ??
    empresa?.dados_extra_receita?.payload_normalizado?.opcao_pelo_simples ??
    empresa?.dados_extra_receita?.dados_consolidados?.opcao_pelo_simples ??
    empresa?.dados_receita?.opcao_pelo_simples,
  );

  if ((situacaoDocumento === 'excluido' || situacaoDocumento === 'nao_optante') && optanteReceita === true) {
    alertas.push({ codigo: 'simples_situacao_divergente_receita', campo: 'situacao_simples', mensagem: 'O comprovante indica empresa não optante/excluída, enquanto o cadastro da Receita registra opção pelo Simples.', severidade: 'alta', valor_documento: dados?.situacao_simples, valor_receita: true, recomendacao: 'Consultar a situação atual no Portal do Simples Nacional e atualizar o cadastro.' });
  } else if (situacaoDocumento === 'optante' && optanteReceita === false) {
    alertas.push({ codigo: 'simples_situacao_inversa_receita', campo: 'situacao_simples', mensagem: 'O comprovante indica opção pelo Simples, mas o cadastro disponível não confirma essa condição.', severidade: 'media', valor_documento: dados?.situacao_simples, valor_receita: false, recomendacao: 'Atualizar a consulta cadastral e confirmar a vigência da opção.' });
  }

  if (!cnpjDocumento) alertas.push({ codigo: 'simples_cnpj_nao_extraido', campo: 'cnpj', mensagem: 'Não foi possível confirmar o CNPJ no comprovante do Simples Nacional.', severidade: 'media', recomendacao: 'Realizar conferência humana do documento.' });
  return uniqueAlerts(alertas);
}

export function validarAtosJuntaExtraidos(empresa: any, dados: any): AlertaDocumental[] {
  const alertas: AlertaDocumental[] = [];
  if (dados?.documento_compativel === false) {
    alertas.push({ codigo: 'junta_documento_incompativel', mensagem: 'O arquivo não foi reconhecido como ato da Junta Comercial.', severidade: 'alta', recomendacao: 'Reclassificar o arquivo ou anexar o ato registrado correto.' });
  }
  const confiancaExtracao = normalizarConfianca(dados?.confianca);
  if (dados?.extracao_parcial === true || (confiancaExtracao !== null && confiancaExtracao < 0.6)) {
    alertas.push({ codigo: 'junta_extracao_inconclusiva', mensagem: 'A leitura automática dos Atos da Junta ficou abaixo do nível mínimo de confiança.', severidade: 'alta', recomendacao: 'Revisar o documento ou executar OCR externo antes de liberar o avanço.' });
  }
  const cnpjDocumento = onlyDigits(dados?.cnpj);
  const cnpjReceita = onlyDigits(empresa?.cnpj);
  if (cnpjDocumento && cnpjReceita && cnpjDocumento !== cnpjReceita) {
    alertas.push({ codigo: 'junta_cnpj_divergente', campo: 'cnpj', mensagem: 'O ato da Junta Comercial pertence a outro CNPJ.', severidade: 'critica', valor_documento: dados?.cnpj, valor_receita: empresa?.cnpj, recomendacao: 'Descartar o documento para esta análise e solicitar o ato correto.' });
  }

  const nomeDocumento = normalizarNomeEmpresarial(dados?.razao_social);
  const nomeReceita = normalizarNomeEmpresarial(empresa?.razao_social);
  if (nomeDocumento && nomeReceita && nomeDocumento !== nomeReceita) {
    alertas.push({ codigo: 'junta_razao_social_divergente', campo: 'razao_social', mensagem: 'A razão social do ato da Junta diverge da razão social cadastrada.', severidade: 'alta', valor_documento: dados?.razao_social, valor_receita: empresa?.razao_social, recomendacao: 'Confirmar eventual alteração de nome empresarial e atualizar a Receita/cadastro.' });
  }

  const capital = capitalDivergente(dados?.capital_social_atual, empresa?.capital_social);
  if (capital.significativo) {
    alertas.push({ codigo: 'junta_capital_social_significativamente_divergente', campo: 'capital_social_atual', mensagem: 'O capital social atual do ato diverge significativamente do valor cadastrado na Receita Federal.', severidade: 'media', valor_documento: capital.documento, valor_receita: capital.receita, recomendacao: 'Validar o arquivamento do ato e sincronizar o capital social atualizado.' });
  }

  const dataRegistro = parseDate(dados?.data_registro);
  const dias = diffDays(dataRegistro);
  const sociosAlterados = Array.isArray(dados?.socios_alterados) ? dados.socios_alterados.filter(Boolean) : [];
  const houveAlteracaoCapital = capital.divergente;
  if (dias !== null && dias >= 0 && dias <= 30 && (sociosAlterados.length > 0 || houveAlteracaoCapital)) {
    alertas.push({ codigo: 'junta_alteracao_recente_relevante', campo: 'data_registro', mensagem: 'Foi identificado ato societário recente, com alteração de sócios ou de capital social.', severidade: 'alta', valor_documento: dataRegistro, recomendacao: 'Solicitar documentos cadastrais atualizados e validar os efeitos da alteração antes da decisão de crédito.' });
  }

  if (!cnpjDocumento) alertas.push({ codigo: 'junta_cnpj_nao_extraido', campo: 'cnpj', mensagem: 'Não foi possível confirmar o CNPJ no ato da Junta Comercial.', severidade: 'media', recomendacao: 'Realizar conferência humana do documento.' });

  // Histórico completo de arquivamentos (ex: certidão "Lista de Arquivamentos"):
  // documenta quantas alterações já houve e quando foi a mais recente -- info
  // relevante para a jornada da empresa mesmo quando não é um ato isolado.
  const historico = Array.isArray(dados?.historico_arquivamentos) ? dados.historico_arquivamentos.filter(Boolean) : [];
  if (historico.length) {
    const alteracoes = historico.filter((i: any) => /alterac/i.test(normalizeText(i?.tipo_ato || '')));
    const maisRecente = historico[historico.length - 1];
    const diasUltimoAto = diffDays(parseDate(maisRecente?.data));
    alertas.push({
      codigo: 'junta_historico_arquivamentos',
      campo: 'historico_arquivamentos',
      mensagem: `Histórico da Junta Comercial: ${historico.length} arquivamento(s) registrado(s), sendo ${alteracoes.length} alteração(ões). Ato mais recente: ${maisRecente?.tipo_ato || 'não identificado'} em ${maisRecente?.data || 'data não informada'}.`,
      severidade: diasUltimoAto !== null && diasUltimoAto >= 0 && diasUltimoAto <= 30 ? 'media' : 'baixa',
      valor_documento: historico,
      recomendacao: diasUltimoAto !== null && diasUltimoAto <= 30 ? 'Alteração registrada há menos de 30 dias -- confirmar se já refletida no cadastro e nos documentos societários.' : undefined,
    });
  }

  return uniqueAlerts(alertas);
}

function normalizarDadosQsa(dados: any): Record<string, any> {
  const socios = Array.isArray(dados?.socios) ? dados.socios.map((socio: any) => ({
    nome: socio?.nome ? String(socio.nome).trim() : null,
    qualificacao: socio?.qualificacao ? String(socio.qualificacao).trim() : null,
    cpf_cnpj: socio?.cpf_cnpj ? String(socio.cpf_cnpj).trim() : null,
  })) : [];
  return {
    ...dados,
    cnpj: dados?.cnpj ? String(dados.cnpj).trim() : null,
    razao_social: dados?.razao_social ? String(dados.razao_social).trim() : null,
    capital_social: asNumber(dados?.capital_social),
    socios,
    data_registro: parseDate(dados?.data_registro),
    confianca: normalizarConfianca(dados?.confianca),
  };
}

function normalizarDadosSimples(dados: any): Record<string, any> {
  return {
    ...dados,
    cnpj: dados?.cnpj ? String(dados.cnpj).trim() : null,
    situacao_simples: dados?.situacao_simples ? String(dados.situacao_simples).trim() : null,
    regime_tributario: dados?.regime_tributario
      ? String(dados.regime_tributario).trim()
      : normalizarBooleano(dados?.opcao_mei) === true
        ? 'MEI / SIMEI'
        : normalizarSituacaoSimples(dados?.situacao_simples) === 'optante'
          ? 'Simples Nacional'
          : dados?.situacao_simples ? String(dados.situacao_simples).trim() : null,
    opcao_mei: normalizarBooleano(dados?.opcao_mei),
    data_opcao_simples: parseDate(dados?.data_opcao_simples),
    data_exclusao_simples: parseDate(dados?.data_exclusao_simples),
    agendamento_exclusao: normalizarBooleano(dados?.agendamento_exclusao),
    motivo_exclusao: dados?.motivo_exclusao ? String(dados.motivo_exclusao).trim() : null,
    confianca: normalizarConfianca(dados?.confianca),
  };
}

function normalizarDadosAtos(dados: any): Record<string, any> {
  const sociosAlterados = Array.isArray(dados?.socios_alterados) ? dados.socios_alterados.map((socio: any) => ({
    nome: socio?.nome ? String(socio.nome).trim() : null,
    tipo_alteracao: ['entrada', 'saida', 'percentual'].includes(String(socio?.tipo_alteracao || '').toLowerCase())
      ? String(socio.tipo_alteracao).toLowerCase()
      : null,
    data_alteracao: parseDate(socio?.data_alteracao),
  })) : [];
  const historicoArquivamentos = Array.isArray(dados?.historico_arquivamentos)
    ? dados.historico_arquivamentos
        .map((item: any) => ({
          numero: item?.numero ? String(item.numero).trim() : null,
          data: parseDate(item?.data),
          tipo_ato: item?.tipo_ato ? String(item.tipo_ato).trim() : null,
        }))
        .filter((item: any) => item.data)
        .sort((a: any, b: any) => String(a.data).localeCompare(String(b.data)))
    : [];
  return {
    ...dados,
    cnpj: dados?.cnpj ? String(dados.cnpj).trim() : null,
    razao_social: dados?.razao_social ? String(dados.razao_social).trim() : null,
    nire: dados?.nire ? String(dados.nire).trim() : null,
    tipo_ato: dados?.tipo_ato ? String(dados.tipo_ato).trim() : null,
    data_registro: parseDate(dados?.data_registro),
    capital_social_atual: asNumber(dados?.capital_social_atual),
    socios_alterados: sociosAlterados,
    historico_arquivamentos: historicoArquivamentos,
    total_alteracoes_historico: historicoArquivamentos.filter((i: any) => /alterac/i.test(normalizeText(i.tipo_ato || ''))).length,
    confianca: normalizarConfianca(dados?.confianca),
  };
}

function extrairJson(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(trimmed); } catch { /* tenta localizar objeto abaixo */ }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  try { return JSON.parse(objectMatch[0]); } catch { return null; }
}

function mimePorExtensao(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return null;
}

async function arquivoExiste(filePath: string): Promise<boolean> {
  try { return (await fs.stat(filePath)).isFile(); } catch { return false; }
}

function estaDentroDaRaiz(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolverCaminhoSeguro(caminhoArquivo: string): Promise<string> {
  const raw = String(caminhoArquivo || '').trim();
  if (!raw) throw new Error('Arquivo documental sem caminho de armazenamento.');

  const cwd = path.resolve(process.cwd());
  const dataDir = path.resolve(process.env.DATA_DIR || '/data');
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(dataDir, 'uploads'));
  const cwdUploads = path.resolve(cwd, 'uploads');
  // Não autoriza leitura arbitrária do código/aplicação: somente áreas de uploads e dados.
  const roots = [dataDir, uploadDir, cwdUploads];
  const candidates = new Set<string>();

  if (path.isAbsolute(raw)) candidates.add(path.resolve(raw));
  candidates.add(path.resolve(cwd, raw));
  candidates.add(path.resolve(dataDir, raw));
  candidates.add(path.resolve(uploadDir, raw));
  if (raw.startsWith('/app/')) candidates.add(path.resolve(cwd, raw.slice('/app/'.length)));
  if (raw.includes('/uploads/')) candidates.add(path.resolve(dataDir, raw.slice(raw.indexOf('/uploads/') + 1)));

  const rootsReais = await Promise.all(roots.map(async (root) => {
    try { return await fs.realpath(root); } catch { return root; }
  }));

  for (const candidate of candidates) {
    if (!roots.some((root) => estaDentroDaRaiz(candidate, root))) continue;
    if (!(await arquivoExiste(candidate))) continue;
    const caminhoReal = await fs.realpath(candidate);
    if (rootsReais.some((root) => estaDentroDaRaiz(caminhoReal, root))) return caminhoReal;
  }
  throw new Error('Arquivo documental não encontrado ou fora das áreas autorizadas.');
}

function promptQsa(): string {
  return `Você é um auditor documental societário brasileiro. Extraia dados do QSA, Contrato Social, Alteração Contratual ou Consolidação anexada.
Responda SOMENTE JSON válido, sem markdown e sem comentários:
{
  "documento_compativel": true,
  "cnpj": "00.000.000/0000-00 ou null",
  "razao_social": "texto ou null",
  "capital_social": 0.00,
  "socios": [{"nome":"texto","qualificacao":"texto ou null"}],
  "data_registro": "YYYY-MM-DD ou null",
  "confianca": 0.0
}
Nesta etapa, extraia SOMENTE CNPJ da empresa, razão social, capital social, nomes dos sócios e qualificação societária, identificando claramente quem é Sócio-Administrador. Não extraia nem avalie RG, CPF dos sócios, endereço, nacionalidade, estado civil, cônjuge, profissão, telefone, e-mail ou qualquer outro dado pessoal. Não compare com outras fontes, não invente dados e use null quando não estiver visível. Capital social deve ser numérico. Confianca deve estar entre 0 e 1.`;
}

function promptSimples(): string {
  return `Você é um auditor tributário brasileiro. Extraia os dados do comprovante/consulta do Simples Nacional anexado.
Responda SOMENTE JSON válido, sem markdown e sem comentários:
{
  "documento_compativel": true,
  "cnpj": "00.000.000/0000-00 ou null",
  "situacao_simples": "Optante|Não Optante|Excluído|null",
  "data_opcao_simples": "YYYY-MM-DD ou null",
  "data_exclusao_simples": "YYYY-MM-DD ou null",
  "agendamento_exclusao": false,
  "motivo_exclusao": "texto ou null",
  "confianca": 0.0
}
Não invente dados. Diferencie exclusão já efetivada de agendamento de exclusão. Use null quando a informação não estiver visível. Confianca deve estar entre 0 e 1.`;
}

function promptAtosJunta(): string {
  return `Você é um auditor de atos societários registrados em Junta Comercial brasileira. Extraia os dados do ato ou da certidão/lista de arquivamentos anexada.
Responda SOMENTE JSON válido, sem markdown e sem comentários:
{
  "documento_compativel": true,
  "cnpj": "00.000.000/0000-00 ou null",
  "razao_social": "texto ou null",
  "nire": "texto ou null",
  "tipo_ato": "Contrato Social|Alteração Contratual|Consolidação|Certidão de Arquivamentos|Outro|null",
  "data_registro": "YYYY-MM-DD ou null (data do ato mais recente)",
  "capital_social_atual": 0.00,
  "socios_alterados": [{"nome":"texto","tipo_alteracao":"entrada|saida|percentual","data_alteracao":"YYYY-MM-DD ou null"}],
  "historico_arquivamentos": [{"numero":"texto ou null","data":"YYYY-MM-DD","tipo_ato":"texto (ex: ALTERAÇÃO, CONTRATO, ENQUADRAMENTO DE MICROEMPRESA)"}],
  "confianca": 0.0
}
Se o documento for uma lista/certidão de arquivamentos (ex: "Lista de Arquivamentos" da Junta Comercial), preencha "historico_arquivamentos" com TODOS os itens listados, do mais antigo ao mais recente -- é esse histórico completo que interessa, não só o último. Se for um único ato/alteração, preencha também "data_registro" e "socios_alterados" para esse ato específico. Extraia apenas informações expressas no documento. Não deduza alterações que não estejam descritas. Capital social deve ser numérico. Use null quando não estiver visível. Confianca deve estar entre 0 e 1.`;
}

export class AnaliseDocumentalService {
  private ultimoModeloUsado: string | null = null;
  private ultimaFonteExtracao: 'local' | 'gemini' | 'injetada' | null = null;

  constructor(
    private readonly db: Queryable = defaultPool,
    private readonly extratorInjetado?: ExtratorInjetado,
  ) {}

  private async extrairComIA(arquivoPath: string, prompt: string, mimeType: string): Promise<any> {
    if (this.extratorInjetado) {
      this.ultimaFonteExtracao = 'injetada';
      return this.extratorInjetado(arquivoPath, prompt, mimeType);
    }

    if (String(process.env.GEMINI_DOCUMENT_OCR_ENABLED || 'true').toLowerCase() === 'false') {
      throw new Error('Análise documental Gemini desativada por GEMINI_DOCUMENT_OCR_ENABLED=false.');
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Gemini não configurado: informe GEMINI_API_KEY ou GOOGLE_API_KEY.');

    const resolvedPath = await resolverCaminhoSeguro(arquivoPath);
    const buffer = await fs.readFile(resolvedPath);
    const maxBytes = Number(process.env.GEMINI_MAX_INLINE_BYTES || 20 * 1024 * 1024);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('GEMINI_MAX_INLINE_BYTES inválido.');
    if (buffer.length > maxBytes) throw new Error(`Arquivo excede o limite de ${maxBytes} bytes para análise inline.`);

    const effectiveMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
    const inferredMime = (!effectiveMime || effectiveMime === 'application/octet-stream') ? mimePorExtensao(resolvedPath) : effectiveMime;
    if (!inferredMime || !(inferredMime === 'application/pdf' || inferredMime.startsWith('image/'))) {
      throw new Error(`Tipo de arquivo não suportado pela análise documental: ${inferredMime || 'desconhecido'}.`);
    }

    const principal = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const fallback = process.env.GEMINI_MODEL_FALLBACK || 'gemini-2.5-pro';
    const modelos = Array.from(new Set([principal, fallback].map((item) => String(item || '').trim()).filter(Boolean)));
    const configuredTimeout = Number(process.env.GEMINI_TIMEOUT_MS || 30000);
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 30000;
    const genAI = new GoogleGenerativeAI(apiKey);
    let ultimoErro: unknown = null;

    for (const modelName of modelos) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0, responseMimeType: 'application/json' } as any,
        });
        const request = model.generateContent([
          { text: prompt },
          { inlineData: { mimeType: inferredMime, data: buffer.toString('base64') } },
        ] as any);
        const result = await Promise.race([
          request,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout Gemini após ${timeoutMs}ms`)), timeoutMs)),
        ]);
        const responseText = result.response.text();
        const parsed = extrairJson(responseText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Gemini retornou JSON documental inválido.');
        this.ultimoModeloUsado = modelName;
        this.ultimaFonteExtracao = 'gemini';
        return { ...parsed, fonte_extracao: parsed?.fonte_extracao || 'gemini_document_ocr' };
      } catch (error) {
        ultimoErro = error;
        console.warn('[AnaliseDocumentalService] Falha na extração Gemini; tentando fallback quando disponível:', modelName, (error as any)?.message || error);
      }
    }

    throw ultimoErro instanceof Error ? ultimoErro : new Error('Não foi possível extrair o documento com IA.');
  }

  private async extrairHibrido(
    arquivoPath: string,
    prompt: string,
    mimeType: string,
    tipo: TipoDocumentoLocal,
  ): Promise<any> {
    if (this.extratorInjetado) return this.extrairComIA(arquivoPath, prompt, mimeType);

    const resolvedPath = await resolverCaminhoSeguro(arquivoPath);
    const thresholdConfigurado = Number(process.env.LOCAL_DOCUMENT_CONFIDENCE_MIN || 0.72);
    const threshold = Number.isFinite(thresholdConfigurado)
      ? Math.max(0.4, Math.min(0.95, thresholdConfigurado))
      : 0.72;

    let local: Awaited<ReturnType<typeof extrairDocumentoLocal>> | null = null;
    try {
      local = await extrairDocumentoLocal(resolvedPath, mimeType, tipo);
      if (local.legivel && local.confianca >= threshold && local.dados?.documento_compativel !== false) {
        this.ultimoModeloUsado = `local:${local.mecanismo}-v1`;
        this.ultimaFonteExtracao = 'local';
        return {
          ...local.dados,
          confianca: local.confianca,
          fonte_extracao: 'local_deterministica',
          mecanismo_extracao: local.mecanismo,
        };
      }
    } catch (error: any) {
      console.warn('[AnaliseDocumentalService] Extração local falhou de forma controlada:', tipo, error?.message || error);
    }

    try {
      return await this.extrairComIA(arquivoPath, prompt, mimeType);
    } catch (error: any) {
      // A ausência de Gemini não transforma uma leitura local executada em
      // "aguardando análise". Quando o OCR/pdftotext conseguiu extrair algum
      // conteúdo estruturado, persistimos o resultado como parcial e o motor
      // determinístico gera as pendências objetivas para revisão humana.
      // Assim a tela sempre mostra o que foi lido e por que não pode avançar.
      const temDadosLocais = !!local?.dados && Object.keys(local.dados).some((chave) => {
        const valor = local?.dados?.[chave];
        return valor !== null && valor !== undefined && valor !== ''
          && !(Array.isArray(valor) && valor.length === 0)
          && !(typeof valor === 'object' && !Array.isArray(valor) && Object.keys(valor).length === 0);
      });
      if (temDadosLocais) {
        console.warn('[AnaliseDocumentalService] Gemini indisponível; mantendo extração local parcial para revisão humana:', tipo, error?.message || error);
        this.ultimoModeloUsado = `local:${local?.mecanismo || 'ocr'}-v1-parcial`;
        this.ultimaFonteExtracao = 'local';
        return {
          ...local!.dados,
          confianca: local!.confianca,
          fonte_extracao: 'local_deterministica',
          mecanismo_extracao: local!.mecanismo,
          extracao_parcial: true,
          motivo_extracao_parcial: local!.motivo || error?.message || 'Extração local abaixo do limiar de confiança.',
        };
      }
      throw new Error(`${tipo}: ${local?.motivo || error?.message || 'não foi possível ler o documento pelo OCR interno nem pela IA externa.'}`);
    }
  }

  private async carregarContexto(empresaId: string, arquivoId: string): Promise<{ empresa: any; socios: any[]; documento: DocumentoArquivoRow }> {
    const [empresaResult, sociosResult, documentoResult] = await Promise.all([
      this.db.query('SELECT * FROM public.empresas WHERE id = $1 LIMIT 1', [empresaId]),
      this.db.query('SELECT * FROM public.socios_empresa WHERE empresa_id = $1 AND COALESCE(ativo, true) = true ORDER BY nome ASC', [empresaId]),
      this.db.query(
        `SELECT id, empresa_id, entidade_id, entidade_tipo, nome_original, nome_arquivo, hash_arquivo, caminho_arquivo, url_arquivo, mime_type, tipo_documento
           FROM public.documentos_arquivos
          WHERE id = $1
            AND excluido_em IS NULL
            AND COALESCE(status, 'ativo') <> 'excluido'
          LIMIT 1`,
        [arquivoId],
      ),
    ]);

    const empresa = empresaResult.rows[0];
    const documento = documentoResult.rows[0] as DocumentoArquivoRow | undefined;
    if (!empresa) throw new Error('Empresa não encontrada para análise documental.');
    if (!documento) throw new Error('Documento não encontrado para análise.');
    const pertenceEmpresa = documento.empresa_id === empresaId || (documento.entidade_tipo === 'empresa' && documento.entidade_id === empresaId);
    if (!pertenceEmpresa) throw new Error('Documento não pertence à empresa informada.');
    // Registros antigos podem ter caminho_arquivo vazio e ainda assim possuir
    // nome_arquivo/url_arquivo válidos. O mesmo resolvedor usado pelo Acervo
    // deve ter a oportunidade de localizar esses arquivos antes de declarar falha.

    // Usa o mesmo resolvedor do Acervo Documental. Assim, o arquivo que pode ser
    // visualizado/baixado também pode ser lido pela análise, independentemente de
    // DATA_DIR apontar para /var/data/destrava ou do volume real estar em /app/uploads.
    // Em testes unitários com extrator injetado não há leitura física do arquivo.
    if (!this.extratorInjetado) {
      const caminhoResolvido = resolveDocumentPath(documento);
      if (!caminhoResolvido.absolutePath) {
        throw new Error(`Arquivo documental não localizado no armazenamento persistente (${documento.nome_original || documento.id}).`);
      }
      documento.caminho_arquivo = caminhoResolvido.absolutePath;
    }
    return { empresa, socios: consolidarSociosReceita(empresa, sociosResult.rows || []), documento };
  }

  async analisarQSA(empresaId: string, arquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { empresa, socios, documento } = await this.carregarContexto(empresaId, arquivoId);
    const dados = normalizarDadosQsa(await this.extrairHibrido(documento.caminho_arquivo!, promptQsa(), documento.mime_type || 'application/pdf', 'qsa'));
    const alertas = validarQsaExtraida(empresa, socios, dados);
    return criarResultado('qsa', empresaId, arquivoId, dados, alertas, this.ultimoModeloUsado);
  }

  async analisarSimplesNacional(empresaId: string, arquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { empresa, documento } = await this.carregarContexto(empresaId, arquivoId);
    const dados = normalizarDadosSimples(await this.extrairHibrido(documento.caminho_arquivo!, promptSimples(), documento.mime_type || 'application/pdf', 'simples_nacional'));
    const alertas = validarSimplesExtraido(empresa, dados);
    return criarResultado('simples_nacional', empresaId, arquivoId, dados, alertas, this.ultimoModeloUsado);
  }

  async analisarAtosJuntaComercial(empresaId: string, arquivoId: string): Promise<AnaliseDocumentalResult> {
    this.ultimoModeloUsado = null;
    this.ultimaFonteExtracao = null;
    const { empresa, documento } = await this.carregarContexto(empresaId, arquivoId);
    const dados = normalizarDadosAtos(await this.extrairHibrido(documento.caminho_arquivo!, promptAtosJunta(), documento.mime_type || 'application/pdf', 'atos_junta_comercial'));
    const alertas = validarAtosJuntaExtraidos(empresa, dados);
    return criarResultado('atos_junta_comercial', empresaId, arquivoId, dados, alertas, this.ultimoModeloUsado);
  }
}

export const analiseDocumentalService = new AnaliseDocumentalService();
