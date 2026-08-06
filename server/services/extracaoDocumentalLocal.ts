import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { normalizeText, onlyDigits, parseDate } from '../utils/helpers';

const execFileAsync = promisify(execFile);

export type TipoDocumentoLocal = 'cartao_cnpj' | 'qsa' | 'simples_nacional' | 'atos_junta_comercial' | 'contrato_social_alteracao';

export interface ExtracaoDocumentalLocalResult {
  tipo: TipoDocumentoLocal;
  disponivel: boolean;
  legivel: boolean;
  mecanismo: 'pdftotext' | 'tesseract';
  texto: string;
  dados: Record<string, any>;
  confianca: number;
  motivo?: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function textoNormalizado(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

function linhasTexto(texto: string): string[] {
  return String(texto || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((linha) => linha.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean);
}

function pareceRotulo(linha: string): boolean {
  const n = textoNormalizado(linha);
  if (!n) return false;
  const rotulos = [
    'numero de inscricao', 'data de abertura', 'nome empresarial', 'nome fantasia',
    'titulo do estabelecimento', 'codigo e descricao', 'atividade economica principal',
    'natureza juridica', 'logradouro', 'numero', 'complemento', 'cep', 'bairro',
    'municipio', 'uf', 'situacao cadastral', 'data da situacao cadastral', 'porte',
    'capital social', 'nome nome empresarial', 'qualificacao', 'cnpj', 'nire',
    'data do registro', 'data de registro', 'situacao no simples nacional',
  ];
  return rotulos.some((rotulo) => n === rotulo || n.startsWith(`${rotulo}:`) || n.startsWith(`${rotulo} (`));
}

function valorAposRotulo(linhas: string[], aliases: string[], limite = 3): string | null {
  const aliasesNorm = aliases.map(textoNormalizado);
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const normalizada = textoNormalizado(linha);
    const alias = aliasesNorm.find((item) => normalizada === item || normalizada.startsWith(`${item}:`) || normalizada.startsWith(`${item} `));
    if (!alias) continue;

    const posDoisPontos = linha.indexOf(':');
    if (posDoisPontos >= 0) {
      const inline = linha.slice(posDoisPontos + 1).trim();
      if (inline) return inline;
    }

    const restoNormalizado = normalizada.slice(alias.length).replace(/^\s*[-–—:]\s*/, '').trim();
    if (restoNormalizado && restoNormalizado !== normalizada) {
      const indiceOriginal = linha.toLocaleLowerCase('pt-BR').indexOf(alias.split(' ')[0]);
      if (indiceOriginal >= 0) {
        const candidato = linha.slice(indiceOriginal + alias.length).replace(/^\s*[-–—:]\s*/, '').trim();
        if (candidato) return candidato;
      }
    }

    for (let offset = 1; offset <= limite && i + offset < linhas.length; offset += 1) {
      const candidato = linhas[i + offset];
      if (!candidato || pareceRotulo(candidato)) continue;
      return candidato;
    }
  }
  return null;
}

function primeiroCnpj(texto: string): string | null {
  const match = String(texto || '').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  return match?.[0] || null;
}

function formatarCnpj(value: string | null): string | null {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return value;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function numeroMonetario(value: unknown): number | null {
  const raw = String(value ?? '').replace(/R\$/gi, '').trim();
  if (!raw) return null;
  const matches = raw.match(/-?[\d.]+(?:,\d{1,2})?|-?\d+(?:\.\d{1,2})?/g);
  if (!matches?.length) return null;
  const token = matches[matches.length - 1];
  let normalized = token;
  if (token.includes(',')) normalized = token.replace(/\./g, '').replace(',', '.');
  else if ((token.match(/\./g) || []).length > 1) normalized = token.replace(/\./g, '');
  const n = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function dataProximaDe(texto: string, expressao: RegExp): string | null {
  const match = texto.match(expressao);
  if (!match) return null;
  const data = match.slice(1).find((item) => item && /^\d{2}\/\d{2}\/\d{4}$/.test(item));
  return parseDate(data || null);
}

function limparValor(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, ' ').replace(/^[-–—:]+\s*/, '').trim();
  return clean && clean !== '-' ? clean : null;
}

function parseCartaoCnpj(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto);
  const compativel = norm.includes('comprovante de inscricao e de situacao cadastral')
    || norm.includes('cadastro nacional da pessoa juridica');

  const numeroInscricao = valorAposRotulo(linhas, ['número de inscrição', 'numero de inscricao']);
  const cnpj = formatarCnpj(primeiroCnpj(numeroInscricao || texto));
  const dataAbertura = parseDate(valorAposRotulo(linhas, ['data de abertura']));
  const nomeEmpresarial = limparValor(valorAposRotulo(linhas, ['nome empresarial']));
  const nomeFantasia = limparValor(valorAposRotulo(linhas, ['título do estabelecimento (nome de fantasia)', 'titulo do estabelecimento', 'nome de fantasia']));
  const cnae = limparValor(valorAposRotulo(linhas, ['código e descrição da atividade econômica principal', 'codigo e descricao da atividade economica principal']));
  const natureza = limparValor(valorAposRotulo(linhas, ['código e descrição da natureza jurídica', 'codigo e descricao da natureza juridica']));
  const porte = limparValor(valorAposRotulo(linhas, ['porte']));
  const situacao = limparValor(valorAposRotulo(linhas, ['situação cadastral', 'situacao cadastral']));
  const dataSituacao = parseDate(valorAposRotulo(linhas, ['data da situação cadastral', 'data da situacao cadastral']));
  const cep = limparValor(valorAposRotulo(linhas, ['cep']));
  const logradouro = limparValor(valorAposRotulo(linhas, ['logradouro']));
  const numero = limparValor(valorAposRotulo(linhas, ['número', 'numero']));
  const complemento = limparValor(valorAposRotulo(linhas, ['complemento']));
  const bairro = limparValor(valorAposRotulo(linhas, ['bairro/distrito', 'bairro distrito']));
  const municipio = limparValor(valorAposRotulo(linhas, ['município', 'municipio']));
  const uf = limparValor(valorAposRotulo(linhas, ['uf']));
  const emissaoMatch = texto.match(/emitido\s+no\s+dia\s+(\d{2}\/\d{2}\/\d{4})(?:\s+às?\s+([\d:]+))?/i);
  const matrizFilial = /\bfilial\b/i.test(numeroInscricao || '') ? 'filial' : /\bmatriz\b/i.test(numeroInscricao || '') ? 'matriz' : null;

  const campos = [cnpj, dataAbertura, nomeEmpresarial, cnae, natureza, porte, situacao, dataSituacao];
  const preenchidos = campos.filter(Boolean).length;
  const confianca = clamp((compativel ? 0.2 : 0) + (preenchidos / campos.length) * 0.75 + (emissaoMatch ? 0.05 : 0));
  return {
    dados: {
      documento_e_cartao_cnpj: compativel,
      documento_compativel: compativel,
      cnpj,
      matriz_filial: matrizFilial,
      data_abertura: dataAbertura,
      nome_empresarial: nomeEmpresarial,
      nome_fantasia: nomeFantasia,
      cnae_principal: cnae,
      natureza_juridica: natureza,
      porte,
      endereco_completo: [logradouro, numero, complemento, bairro, municipio, uf, cep].filter(Boolean).join(', ') || null,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      municipio,
      uf,
      situacao_cadastral: situacao,
      data_situacao_cadastral: dataSituacao,
      data_emissao: parseDate(emissaoMatch?.[1] || null),
      data_emissao_texto: emissaoMatch?.[0] || null,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

function parseQsa(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto);
  const compativel = norm.includes('quadro de socios e administradores')
    || norm.includes('quadro societario')
    || norm.includes('capital social')
    || norm.includes('qualificacao do socio');
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['nome empresarial', 'razão social', 'razao social']))
    || limparValor(linhas.find((linha) => /\b(?:ltda|limitada|eireli|s\/?a)\b/i.test(linha) && !/qualificacao|socio|administrador/i.test(linha)) || null);
  const capitalLinha = valorAposRotulo(linhas, ['capital social']);
  const capitalSocial = numeroMonetario(capitalLinha);
  const dataRegistro = parseDate(valorAposRotulo(linhas, ['data de registro', 'data do registro', 'data de arquivamento']));

  const socios: Array<{ nome: string; qualificacao: string | null; administrador: boolean | null }> = [];
  const nomesRotulo = new Set(['nome nome empresarial', 'nome do socio', 'nome socio', 'socio']);
  for (let i = 0; i < linhas.length; i += 1) {
    const linhaNorm = textoNormalizado(linhas[i]).replace(/[\/]/g, ' ');
    if (!Array.from(nomesRotulo).some((rotulo) => linhaNorm === rotulo || linhaNorm.startsWith(`${rotulo}:`))) continue;
    const nome = limparValor(linhas[i].includes(':') ? linhas[i].split(':').slice(1).join(':') : linhas[i + 1] || null);
    if (!nome || pareceRotulo(nome)) continue;
    let qualificacao: string | null = null;
    for (let j = i + 1; j <= Math.min(i + 8, linhas.length - 1); j += 1) {
      const atualNorm = textoNormalizado(linhas[j]);
      if (atualNorm.startsWith('qualificacao')) {
        qualificacao = limparValor(linhas[j].includes(':') ? linhas[j].split(':').slice(1).join(':') : linhas[j + 1] || null);
      }
    }
    if (!socios.some((socio) => textoNormalizado(socio.nome) === textoNormalizado(nome))) {
      socios.push({ nome, qualificacao, administrador: qualificacao ? /administrador|administradora|titular/i.test(qualificacao) : null });
    }
  }

  const pontuacao = (compativel ? 0.15 : 0)
    + (cnpj ? 0.25 : 0)
    + (razaoSocial ? 0.1 : 0)
    + (capitalSocial !== null ? 0.2 : 0)
    + (socios.length ? 0.3 : 0);
  const confianca = clamp(pontuacao);
  return {
    dados: {
      documento_compativel: compativel,
      cnpj,
      razao_social: razaoSocial,
      capital_social: capitalSocial,
      socios,
      data_registro: dataRegistro,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

function parseSimples(texto: string): { dados: Record<string, any>; confianca: number } {
  const norm = textoNormalizado(texto);
  const compativel = norm.includes('simples nacional') || norm.includes('consulta optantes') || norm.includes('simei');
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const naoOptante = /n[aã]o\s+optante\s+pelo\s+simples\s+nacional/i.test(texto) || /situacao\s+no\s+simples\s+nacional\W{0,8}nao\s+optante/i.test(norm);
  const excluido = /exclu[ií]d[oa]\s+do\s+simples/i.test(texto) || norm.includes('exclusao do simples nacional efetivada');
  const optante = !naoOptante && !excluido && (/optante\s+pelo\s+simples\s+nacional/i.test(texto) || /situacao\s+no\s+simples\s+nacional\W{0,8}optante/i.test(norm));
  const simei = /optante\s+pelo\s+simei/i.test(texto) || norm.includes('situacao no simei optante');
  const agendamento = norm.includes('agendamento') && norm.includes('exclus');
  const dataOpcao = dataProximaDe(texto, /(?:optante\s+pelo\s+simples\s+nacional\s+desde|data\s+de\s+op[cç][aã]o)\D{0,40}(\d{2}\/\d{2}\/\d{4})/i);
  const dataExclusao = dataProximaDe(texto, /(?:data\s+(?:de|da)\s+exclus[aã]o|exclu[ií]d[oa]\s+em)\D{0,40}(\d{2}\/\d{2}\/\d{4})/i);
  const situacao = excluido ? 'Excluído' : naoOptante ? 'Não Optante' : optante ? 'Optante' : null;
  const regime = simei ? 'MEI / SIMEI' : optante ? 'Simples Nacional' : situacao;
  const confianca = clamp((compativel ? 0.25 : 0) + (cnpj ? 0.35 : 0) + (situacao ? 0.3 : 0) + ((dataOpcao || dataExclusao || agendamento) ? 0.1 : 0));
  return {
    dados: {
      documento_compativel: compativel,
      cnpj,
      situacao_simples: situacao,
      regime_tributario: regime,
      data_opcao_simples: dataOpcao,
      data_exclusao_simples: dataExclusao,
      agendamento_exclusao: agendamento,
      motivo_exclusao: null,
      opcao_mei: simei,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}


function parseContratoSocialAlteracao(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto);
  const compativel = /contrato social|alteracao contratual|alteração contratual|consolidacao contratual|consolidação contratual/.test(norm);
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['nome empresarial', 'razão social', 'razao social']))
    || limparValor(linhas.find((linha) => /\b(?:ltda|limitada|s\/a|sa|eireli)\b/i.test(linha) && !/sociedade empresaria|sociedade empresária/i.test(linha)) || null);

  const nireExplicito = texto.match(/\bNIRE\s*[:\-]?\s*(\d{10,12})\b/i)?.[1] || null;
  const nireRegistro = texto.match(/(?:registrad[ao]|arquivad[ao]).{0,120}?(?:sob\s+(?:o\s+)?n[ºo°]?|nire)\s*[:\-]?\s*(\d{10,12})/is)?.[1] || null;
  const nire = nireExplicito || nireRegistro;

  const numeroArquivamento = texto.match(/CERTIFICO\s+O\s+REGISTRO\s+EM\s+\d{2}\/\d{2}\/\d{4}(?:\s+\d{1,2}:\d{2})?\s+SOB\s+N[ºO°]?\s*(\d{5,15})/i)?.[1]
    || texto.match(/\bprotocolo\s*[:\-]?\s*(\d{5,15})\b/i)?.[1]
    || null;
  const dataRegistro = parseDate(
    texto.match(/CERTIFICO\s+O\s+REGISTRO\s+EM\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]
      || texto.match(/(?:arquivad[ao]|registrad[ao]).{0,100}?(?:sess[aã]o\s+de|em)\s+(\d{2}\/\d{2}\/\d{4})/is)?.[1]
      || valorAposRotulo(linhas, ['data de registro', 'data do registro', 'data de arquivamento']),
  );
  const dataEfeitos = parseDate(texto.match(/COM\s+EFEITOS\s+DO\s+REGISTRO\s+EM\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null);
  const dataDocumento = parseDate(
    texto.match(/(?:Goi[aâ]nia|Bras[ií]lia|[A-ZÀ-Ú][\wÀ-ú\s]+)[\s\-\/]*[A-Z]{2}\s*,?\s*(\d{2}\s+de\s+[a-zç]+\s+de\s+\d{4})/i)?.[1]
      || texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1]
      || null,
  );

  const tipoAto = /consolidacao contratual|consolidação contratual/.test(norm)
    ? 'Consolidação'
    : /alteracao contratual|alteração contratual/.test(norm)
      ? 'Alteração Contratual'
      : /contrato social/.test(norm)
        ? 'Contrato Social'
        : null;

  const campos = [nire, dataRegistro, razaoSocial, cnpj, tipoAto];
  const preenchidos = campos.filter(Boolean).length;
  const confianca = clamp((compativel ? 0.25 : 0) + (nire ? 0.25 : 0) + (dataRegistro ? 0.25 : 0) + (preenchidos / campos.length) * 0.25);
  return {
    dados: {
      documento_compativel: compativel,
      cnpj,
      razao_social: razaoSocial,
      nire,
      tipo_ato: tipoAto,
      data_registro: dataRegistro,
      data_efeitos_registro: dataEfeitos,
      data_documento: dataDocumento,
      numero_arquivamento: numeroArquivamento,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

function parseAtosJunta(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto);
  const compativel = norm.includes('junta comercial') || norm.includes('lista de arquivamentos') || norm.includes('certidao simplificada') || norm.includes('servicos web') || norm.includes('nire');
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['nome empresarial', 'razão social', 'razao social']))
    || limparValor(linhas.find((linha) => /\b(?:ltda|limitada|eireli|s\/?a)\b/i.test(linha) && !/qualificacao|socio|administrador/i.test(linha)) || null);
  let nire = limparValor(valorAposRotulo(linhas, ['nire', 'número de identificação do registro de empresas', 'numero de identificacao do registro de empresas']));
  if (nire) nire = onlyDigits(nire) || nire;
  const capitalSocial = numeroMonetario(valorAposRotulo(linhas, ['capital social', 'capital social atual']));

  const historico: Array<{ numero: string | null; data: string; tipo_ato: string | null }> = [];

  // Formato tabular comum nas certidões/listas de arquivamentos (ex.: JUCEG):
  // número do arquivamento | data | tipo do ato. Esta leitura tem prioridade
  // porque evita associar o cabeçalho ou a linha vizinha ao registro errado.
  for (const linha of linhas) {
    const row = linha.match(/^\s*(\d{5,15})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s*$/);
    if (!row) continue;
    const tipo = limparValor(row[3]);
    if (!tipo || !/(alterac|contrato|consolidac|enquadramento|constituic|transformac|extinc|ata|ordem judicial)/.test(textoNormalizado(tipo))) continue;
    historico.push({ numero: row[1], data: parseDate(row[2]) || row[2], tipo_ato: tipo });
  }

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (/^\s*\d{5,15}\s+\d{2}\/\d{2}\/\d{4}\s+/.test(linha)) continue;
    const dataMatch = linha.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (!dataMatch) continue;
    const contexto = [linhas[i - 2], linhas[i - 1], linha, linhas[i + 1], linhas[i + 2]]
      .filter(Boolean)
      .join(' ');
    const contextoNorm = textoNormalizado(contexto);
    if (!/(alterac|contrato|consolidac|enquadramento|arquivamento|constituic|transformac|extinc|ata|ordem judicial)/.test(contextoNorm)) continue;
    const numeroMatch = linha.match(/(?:numero|número|arquivamento)?\s*[:\-]?\s*(\d{5,15})\b/i)
      || contexto.match(/(?:numero|número|arquivamento)?\s*[:\-]?\s*(\d{5,15})\b/i);
    let tipoAto: string | null = null;
    const aposData = linha.slice((dataMatch.index || 0) + dataMatch[0].length).replace(/^\s*[-–—|:]\s*/, '').trim();
    if (/(alterac|contrato|consolidac|enquadramento|constituic|ordem judicial|transformac|extinc|ata)/.test(textoNormalizado(aposData))) {
      tipoAto = limparValor(aposData);
    }
    const candidatosTipo = [linhas[i - 1], linhas[i + 1], linhas[i - 2], linhas[i + 2]].filter(Boolean);
    for (const candidato of candidatosTipo) {
      if (tipoAto) break;
      const n = textoNormalizado(candidato);
      if (/(alterac|contrato|consolidac|enquadramento|constituic|ordem judicial|transformac|extinc|ata)/.test(n)) {
        tipoAto = limparValor(candidato.replace(/evento\(s\)\s*:/i, '').replace(/data de aprova[cç][aã]o\s*:/i, '').replace(/\s*[+]\s*adicionar\s*$/i, ''));
      }
    }
    historico.push({
      numero: numeroMatch?.[1] || numeroMatch?.[0] || null,
      data: parseDate(dataMatch[1]) || dataMatch[1],
      tipo_ato: tipoAto,
    });
  }
  const historicoUnico = historico.filter((item, index, arr) => arr.findIndex((outro) => `${outro.data}|${outro.numero}|${outro.tipo_ato}` === `${item.data}|${item.numero}|${item.tipo_ato}`) === index)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));

  if (!nire) {
    const constituicao = historicoUnico.find((item) => /registro|constituic|contrato/.test(textoNormalizado(item.tipo_ato || '')) && onlyDigits(item.numero).length >= 10);
    nire = constituicao ? onlyDigits(constituicao.numero) : null;
  }
  const alteracoes = historicoUnico.filter((item) => /alterac/.test(textoNormalizado(item.tipo_ato || '')));
  const ultimoAto = alteracoes.at(-1) || historicoUnico.at(-1);
  const dataRegistro = ultimoAto?.data || parseDate(valorAposRotulo(linhas, ['data de registro', 'data do registro', 'último arquivamento', 'ultimo arquivamento']));
  const tipoAto = ultimoAto?.tipo_ato || limparValor(valorAposRotulo(linhas, ['tipo do ato', 'ato/evento', 'ato evento']));

  const sociosAlterados: Array<{ nome: string; tipo_alteracao: 'entrada' | 'saida' | 'percentual'; data_alteracao: string | null }> = [];
  for (const linha of linhas) {
    const n = textoNormalizado(linha);
    let tipo: 'entrada' | 'saida' | 'percentual' | null = null;
    if (/(admissao|entrada|ingresso) de socio/.test(n)) tipo = 'entrada';
    else if (/(retirada|saida|exclusao) de socio/.test(n)) tipo = 'saida';
    else if (/(alteracao|cessao) de (quotas|participacao)/.test(n)) tipo = 'percentual';
    if (!tipo) continue;
    const data = parseDate(linha.match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0] || null);
    sociosAlterados.push({ nome: linha, tipo_alteracao: tipo, data_alteracao: data });
  }

  // O CNPJ é informativo: algumas Juntas (como a do DF) não o exibem na
  // listagem de atos. A confiança principal vem do NIRE e das datas.
  const confianca = clamp((compativel ? 0.25 : 0) + (nire ? 0.3 : 0) + (historicoUnico.length ? 0.35 : 0) + (razaoSocial || cnpj ? 0.1 : 0));
  return {
    dados: {
      documento_compativel: compativel,
      cnpj,
      razao_social: razaoSocial,
      nire,
      tipo_ato: tipoAto,
      data_registro: dataRegistro,
      capital_social_atual: capitalSocial,
      socios_alterados: sociosAlterados,
      historico_arquivamentos: historicoUnico,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

export function analisarTextoDocumentoLocal(tipo: TipoDocumentoLocal, texto: string): { dados: Record<string, any>; confianca: number } {
  if (tipo === 'cartao_cnpj') return parseCartaoCnpj(texto);
  if (tipo === 'qsa') return parseQsa(texto);
  if (tipo === 'simples_nacional') return parseSimples(texto);
  if (tipo === 'atos_junta_comercial') return parseAtosJunta(texto);
  return parseContratoSocialAlteracao(texto);
}

async function executarTesseract(arquivo: string, timeout: number, maxBuffer: number): Promise<string> {
  const idiomas = process.env.LOCAL_OCR_LANGUAGES || 'por+eng';
  const { stdout } = await execFileAsync(
    process.env.TESSERACT_BINARY || 'tesseract',
    [arquivo, 'stdout', '-l', idiomas, '--psm', process.env.LOCAL_OCR_PSM || '6'],
    { timeout, maxBuffer, encoding: 'utf8' },
  );
  return String(stdout || '').replace(/\u0000/g, '').trim();
}

async function extrairTextoComOcrLocal(
  arquivoPath: string,
  isPdf: boolean,
  timeout: number,
  maxBuffer: number,
): Promise<{ texto: string; disponivel: boolean; motivo?: string }> {
  if (String(process.env.LOCAL_OCR_ENABLED || 'true').toLowerCase() === 'false') {
    return { texto: '', disponivel: false, motivo: 'OCR local desabilitado por LOCAL_OCR_ENABLED=false.' };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'destrava-ocr-'));
  try {
    if (!isPdf) {
      const texto = await executarTesseract(arquivoPath, timeout, maxBuffer);
      return { texto, disponivel: true };
    }

    const maxPaginas = Math.max(1, Math.min(30, Number(process.env.LOCAL_OCR_MAX_PAGES || 12)));
    const prefixo = path.join(tempDir, 'pagina');
    await execFileAsync(
      process.env.PDFTOPPM_BINARY || 'pdftoppm',
      ['-png', '-r', process.env.LOCAL_OCR_DPI || '180', '-f', '1', '-l', String(maxPaginas), arquivoPath, prefixo],
      { timeout, maxBuffer, encoding: 'utf8' },
    );
    const paginas = (await readdir(tempDir))
      .filter((nome) => nome.startsWith('pagina-') && nome.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    if (!paginas.length) return { texto: '', disponivel: true, motivo: 'Não foi possível renderizar páginas para OCR local.' };

    const textos: string[] = [];
    for (const pagina of paginas) {
      const trecho = await executarTesseract(path.join(tempDir, pagina), timeout, maxBuffer);
      if (trecho) textos.push(trecho);
    }
    return { texto: textos.join('\n\n').trim(), disponivel: true };
  } catch (error: any) {
    const indisponivel = error?.code === 'ENOENT';
    return {
      texto: '',
      disponivel: !indisponivel,
      motivo: indisponivel
        ? 'Tesseract ou pdftoppm não está instalado neste ambiente.'
        : String(error?.message || 'Falha no OCR local.'),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function extrairDocumentoLocal(
  arquivoPath: string,
  mimeType: string | null | undefined,
  tipo: TipoDocumentoLocal,
): Promise<ExtracaoDocumentalLocalResult> {
  const effectiveMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  const extension = path.extname(arquivoPath).toLowerCase();
  const isPdf = effectiveMime === 'application/pdf' || extension === '.pdf';
  const isImage = effectiveMime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp'].includes(extension);
  if (!isPdf && !isImage) {
    return { tipo, disponivel: true, legivel: false, mecanismo: 'pdftotext', texto: '', dados: {}, confianca: 0, motivo: 'Formato não suportado pelo leitor interno.' };
  }

  const timeout = Number(process.env.LOCAL_PDF_TEXT_TIMEOUT_MS || 15000);
  const ocrTimeout = Number(process.env.LOCAL_OCR_TIMEOUT_MS || 120000);
  const maxBuffer = Number(process.env.LOCAL_PDF_TEXT_MAX_BYTES || 16 * 1024 * 1024);
  const timeoutTexto = Number.isFinite(timeout) && timeout > 0 ? timeout : 15000;
  const timeoutOcr = Number.isFinite(ocrTimeout) && ocrTimeout > 0 ? ocrTimeout : 120000;
  const bufferMaximo = Number.isFinite(maxBuffer) && maxBuffer > 0 ? maxBuffer : 16 * 1024 * 1024;

  if (isPdf) {
    try {
      const { stdout } = await execFileAsync(
        process.env.PDFTOTEXT_BINARY || 'pdftotext',
        ['-layout', '-nopgbrk', arquivoPath, '-'],
        { timeout: timeoutTexto, maxBuffer: bufferMaximo, encoding: 'utf8' },
      );
      const texto = String(stdout || '').replace(/\u0000/g, '').trim();
      if (texto.length >= 20) {
        const { dados, confianca } = analisarTextoDocumentoLocal(tipo, texto);
        if (confianca >= Number(process.env.LOCAL_EXTRACTION_MIN_CONFIDENCE || 0.55)) {
          return { tipo, disponivel: true, legivel: true, mecanismo: 'pdftotext', texto, dados, confianca };
        }
        // Camada textual incompleta: tenta OCR antes de recorrer à API externa.
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        console.warn('[extracaoDocumentalLocal] pdftotext indisponível; tentando OCR local.');
      } else {
        console.warn('[extracaoDocumentalLocal] camada textual indisponível; tentando OCR local:', error?.message || error);
      }
    }
  }

  const ocr = await extrairTextoComOcrLocal(arquivoPath, isPdf, timeoutOcr, bufferMaximo);
  if (ocr.texto.length >= 20) {
    const { dados, confianca } = analisarTextoDocumentoLocal(tipo, ocr.texto);
    return {
      tipo,
      disponivel: true,
      legivel: confianca >= Number(process.env.LOCAL_EXTRACTION_MIN_CONFIDENCE || 0.55),
      mecanismo: 'tesseract',
      texto: ocr.texto,
      dados: { ...dados, fonte_extracao: 'ocr_local_tesseract' },
      confianca,
      motivo: confianca < Number(process.env.LOCAL_EXTRACTION_MIN_CONFIDENCE || 0.55)
        ? 'OCR local executado, mas a confiança ficou abaixo do mínimo seguro.'
        : undefined,
    };
  }

  return {
    tipo,
    disponivel: ocr.disponivel,
    legivel: false,
    mecanismo: 'tesseract',
    texto: ocr.texto,
    dados: {},
    confianca: 0,
    motivo: ocr.motivo || 'Documento sem texto legível pelo motor interno; revisão humana ou IA externa é necessária.',
  };

}
