import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { normalizeText, onlyDigits, parseDate } from '../utils/helpers';

const execFileAsync = promisify(execFile);

export type TipoDocumentoLocal = 'cartao_cnpj' | 'qsa' | 'simples_nacional' | 'atos_junta_comercial';

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

function valorAposRotuloExato(linhas: string[], aliases: string[], limite = 3): string | null {
  const aliasesNorm = aliases.map(textoNormalizado);
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const normalizada = textoNormalizado(linha);
    const alias = aliasesNorm.find((item) => normalizada === item || normalizada.startsWith(`${item}:`));
    if (!alias) continue;

    const posDoisPontos = linha.indexOf(':');
    if (posDoisPontos >= 0) {
      const inline = limparValor(linha.slice(posDoisPontos + 1));
      if (inline) return inline;
    }

    for (let offset = 1; offset <= limite && i + offset < linhas.length; offset += 1) {
      const candidato = linhas[i + offset];
      if (!candidato || pareceRotulo(candidato)) continue;
      return candidato;
    }
  }
  return null;
}

type CampoLayout = { chave: string; aliases: string[] };

function normalizarLinhaLayout(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * O PDF oficial do Cartão CNPJ usa uma grade horizontal. O pdftotext -layout
 * preserva as colunas, por exemplo:
 *   LOGRADOURO          NÚMERO       COMPLEMENTO
 *   RUA EXEMPLO         123          SALA 01
 * O extrator antigo achatava os espaços e acabava usando "NÚMERO
 * COMPLEMENTO" como endereço e o próprio CNPJ como número. Esta função lê a
 * linha mantendo as posições das colunas e só aceita o bloco quando todos os
 * rótulos esperados estão presentes na ordem correta.
 */
function extrairColunasDaLinhaSeguinte(texto: string, campos: CampoLayout[]): Record<string, string | null> {
  const linhas = String(texto || '').replace(/\u0000/g, '').replace(/\r/g, '').split('\n');
  for (let i = 0; i < linhas.length; i += 1) {
    const linhaRotulos = linhas[i];
    const normalizada = normalizarLinhaLayout(linhaRotulos);
    const posicoes: number[] = [];
    let cursor = 0;
    let encontrouTodos = true;

    for (const campo of campos) {
      let melhor = -1;
      for (const alias of campo.aliases) {
        const idx = normalizada.indexOf(normalizarLinhaLayout(alias), cursor);
        if (idx >= 0 && (melhor < 0 || idx < melhor)) melhor = idx;
      }
      if (melhor < 0) {
        encontrouTodos = false;
        break;
      }
      posicoes.push(melhor);
      cursor = melhor + 1;
    }
    if (!encontrouTodos) continue;

    let indiceValor = i + 1;
    while (indiceValor < linhas.length && !linhas[indiceValor].trim()) indiceValor += 1;
    if (indiceValor >= linhas.length) break;
    const linhaValor = linhas[indiceValor];
    const resultado: Record<string, string | null> = {};
    campos.forEach((campo, indice) => {
      const inicio = posicoes[indice];
      const fim = indice + 1 < posicoes.length ? posicoes[indice + 1] : linhaValor.length;
      resultado[campo.chave] = limparValor(linhaValor.slice(inicio, fim));
    });
    return resultado;
  }
  return Object.fromEntries(campos.map((campo) => [campo.chave, null]));
}

function limparCampoEndereco(campo: 'logradouro' | 'numero' | 'complemento' | 'cep' | 'bairro' | 'municipio' | 'uf', value: string | null): string | null {
  const clean = limparValor(value);
  if (!clean) return null;
  const norm = textoNormalizado(clean);
  const contemRotuloOuCabecalho = /(comprovante de inscricao|cadastro nacional|numero de inscricao|data de abertura|bairro distrito municipio|logradouro numero complemento|situacao cadastral)/.test(norm);
  if (contemRotuloOuCabecalho) return null;
  if (campo !== 'cep' && campo !== 'numero' && primeiroCnpj(clean)) return null;
  if (campo === 'cep') return onlyDigits(clean).length === 8 ? clean : null;
  if (campo === 'uf') return /^[A-Za-z]{2}$/.test(clean) ? clean.toUpperCase() : null;
  if (campo === 'numero') {
    if (clean.length > 24 || /comprovante|inscricao|cadastro|complemento|lemento|numero|número|\//i.test(clean)) return null;
    return clean;
  }
  if ((campo === 'bairro' || campo === 'municipio') && (!/[A-Za-zÀ-ÿ]/.test(clean) || clean.length > 100)) return null;
  if (campo === 'logradouro' && (!/[A-Za-zÀ-ÿ]/.test(clean) || clean.length > 180)) return null;
  if (campo === 'complemento' && clean.length > 160) return null;
  return clean;
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
  const primeiraLinhaEndereco = extrairColunasDaLinhaSeguinte(texto, [
    { chave: 'logradouro', aliases: ['logradouro'] },
    { chave: 'numero', aliases: ['número', 'numero'] },
    { chave: 'complemento', aliases: ['complemento'] },
  ]);
  const segundaLinhaEndereco = extrairColunasDaLinhaSeguinte(texto, [
    { chave: 'cep', aliases: ['cep'] },
    { chave: 'bairro', aliases: ['bairro/distrito', 'bairro distrito'] },
    { chave: 'municipio', aliases: ['município', 'municipio'] },
    { chave: 'uf', aliases: ['uf'] },
  ]);
  const cep = limparCampoEndereco('cep', segundaLinhaEndereco.cep || valorAposRotuloExato(linhas, ['cep']));
  const logradouro = limparCampoEndereco('logradouro', primeiraLinhaEndereco.logradouro || valorAposRotuloExato(linhas, ['logradouro']));
  const numero = limparCampoEndereco('numero', primeiraLinhaEndereco.numero || valorAposRotuloExato(linhas, ['número', 'numero']));
  const complemento = limparCampoEndereco('complemento', primeiraLinhaEndereco.complemento || valorAposRotuloExato(linhas, ['complemento']));
  const bairro = limparCampoEndereco('bairro', segundaLinhaEndereco.bairro || valorAposRotuloExato(linhas, ['bairro/distrito', 'bairro distrito']));
  const municipio = limparCampoEndereco('municipio', segundaLinhaEndereco.municipio || valorAposRotuloExato(linhas, ['município', 'municipio']));
  const uf = limparCampoEndereco('uf', segundaLinhaEndereco.uf || valorAposRotuloExato(linhas, ['uf']));
  const enderecoConfiavel = Boolean(logradouro && (cep || (municipio && uf)));
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
      endereco_completo: enderecoConfiavel ? [logradouro, numero, complemento, bairro, municipio, uf, cep].filter(Boolean).join(', ') : null,
      endereco_confiavel: enderecoConfiavel,
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
  const linhasLayout = String(texto || '').replace(/\u0000/g, '').replace(/\r/g, '').split('\n');
  const norm = textoNormalizado(texto);
  const compativel = norm.includes('quadro de socios e administradores')
    || norm.includes('quadro societario')
    || norm.includes('capital social')
    || norm.includes('qualificacao do socio')
    || norm.includes('nome nome empresarial');
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['nome empresarial', 'razão social', 'razao social']));
  const capitalLinha = valorAposRotulo(linhas, ['capital social']);
  const capitalSocial = numeroMonetario(capitalLinha);
  const dataRegistro = parseDate(valorAposRotulo(linhas, ['data de registro', 'data do registro', 'data de arquivamento']));

  const socios: Array<{ nome: string; qualificacao: string | null; cpf_cnpj: string | null }> = [];
  const nomeSocioValido = (value: string | null): value is string => {
    const clean = limparValor(value);
    if (!clean) return false;
    const n = textoNormalizado(clean).replace(/[\/]/g, ' ');
    if (pareceRotulo(clean)) return false;
    if (/^(?:nome|nome nome empresarial|nome do socio|socio|qualificacao|cpf|cnpj)$/.test(n)) return false;
    if (/(quadro de socios|capital social|nome empresarial|comprovante|cadastro nacional|data de abertura)/.test(n)) return false;
    if (/^(?:nao identificado|nao informado|sem identificacao)$/.test(n)) return false;
    if (primeiroCnpj(clean) || /^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return false;
    return /[A-Za-zÀ-ÿ]/.test(clean) && clean.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 4;
  };
  const adicionarSocio = (nomeBruto: string | null, qualificacaoBruta: string | null, documentoBruto: string | null) => {
    let nome = limparValor(nomeBruto);
    let qualificacao = limparValor(qualificacaoBruta);
    if (!nome) return;

    const nomeComQualificacao = nome.match(/^(.+?)\s+((?:\d{1,3}\s*-\s*)?(?:s[oó]cio(?:-administrador)?|administrador|titular|empres[aá]rio|representante).*)$/i);
    if (nomeComQualificacao) {
      nome = nomeComQualificacao[1].trim();
      if (!qualificacao || textoNormalizado(qualificacao) === textoNormalizado(nomeBruto)) qualificacao = nomeComQualificacao[2].trim();
    }

    // PDFs oficiais às vezes unem nome e qualificação na mesma linha. A
    // separação por duas ou mais colunas preserva o nome sem exigir CPF, RG ou
    // qualquer outro dado pessoal nesta etapa.
    const colunas = nome.split(/\s{2,}/).map((item) => item.trim()).filter(Boolean);
    if (colunas.length > 1 && !qualificacao) {
      const possivelQualificacao = colunas.find((item, index) => index > 0 && /s[oó]cio|administrador|titular|empres[aá]rio|representante/i.test(item));
      if (possivelQualificacao) {
        qualificacao = possivelQualificacao;
        nome = colunas[0];
      }
    }
    nome = nome
      .replace(/^nome(?:\/nome empresarial| nome empresarial| do s[oó]cio| s[oó]cio)?\s*[:\-]?\s*/i, '')
      .trim();
    if (!nomeSocioValido(nome)) return;
    const documento = String(documentoBruto || '').match(/\b(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/)?.[0] || null;
    const chave = textoNormalizado(nome).replace(/[^a-z0-9]/g, '');
    const existente = socios.find((socio) => textoNormalizado(socio.nome).replace(/[^a-z0-9]/g, '') === chave);
    if (existente) {
      if (!existente.qualificacao && qualificacao) existente.qualificacao = qualificacao;
      if (!existente.cpf_cnpj && documento) existente.cpf_cnpj = documento;
      return;
    }
    socios.push({ nome, qualificacao, cpf_cnpj: documento });
  };

  // 1) Grade horizontal preservada pelo pdftotext -layout.
  for (let i = 0; i < linhasLayout.length; i += 1) {
    const cabecalho = linhasLayout[i];
    const cabecalhoNorm = normalizarLinhaLayout(cabecalho).replace(/\//g, ' ');
    if (!cabecalhoNorm.includes('nome nome empresarial') || !cabecalhoNorm.includes('qualificacao')) continue;
    const posNome = cabecalhoNorm.indexOf('nome nome empresarial');
    const posQualificacao = cabecalhoNorm.indexOf('qualificacao', posNome + 1);
    if (posNome < 0 || posQualificacao <= posNome) continue;
    for (let j = i + 1; j <= Math.min(i + 12, linhasLayout.length - 1); j += 1) {
      const linha = linhasLayout[j];
      const linhaNorm = textoNormalizado(linha);
      if (!linhaNorm) continue;
      if (/(capital social|data de registro|informacoes da empresa|codigo e descricao|comprovante de inscricao)/.test(linhaNorm)) break;
      const nomeColuna = limparValor(linha.slice(posNome, posQualificacao));
      const qualificacaoColuna = limparValor(linha.slice(posQualificacao));
      const documento = linha.match(/\b(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/)?.[0] || null;
      adicionarSocio(nomeColuna, qualificacaoColuna, documento);
    }
  }

  // 2) Blocos verticais e linhas com rótulo/valor.
  const nomesRotulo = ['nome nome empresarial', 'nome do socio', 'nome socio'];
  for (let i = 0; i < linhas.length; i += 1) {
    const linhaNorm = textoNormalizado(linhas[i]).replace(/[\/]/g, ' ');
    if (!nomesRotulo.some((rotulo) => linhaNorm === rotulo || linhaNorm.startsWith(`${rotulo}:`) || linhaNorm.startsWith(`${rotulo} `))) continue;
    let nome = linhas[i].includes(':') ? linhas[i].split(':').slice(1).join(':') : null;
    if (!nome || !nomeSocioValido(nome)) {
      for (let offset = 1; offset <= 3 && i + offset < linhas.length; offset += 1) {
        if (nomeSocioValido(linhas[i + offset])) {
          nome = linhas[i + offset];
          break;
        }
      }
    }
    let qualificacao: string | null = null;
    let cpfCnpj: string | null = null;
    for (let j = i + 1; j <= Math.min(i + 10, linhas.length - 1); j += 1) {
      const atualNorm = textoNormalizado(linhas[j]);
      if (j > i + 1 && nomesRotulo.some((rotulo) => atualNorm.replace(/[\/]/g, ' ').startsWith(rotulo))) break;
      if (atualNorm.startsWith('qualificacao')) {
        qualificacao = limparValor(linhas[j].includes(':') ? linhas[j].split(':').slice(1).join(':') : linhas[j + 1] || null);
      } else if (!qualificacao && /s[oó]cio|administrador|titular|empres[aá]rio|representante/i.test(linhas[j])) {
        qualificacao = linhas[j];
      }
      const doc = linhas[j].match(/\b(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
      if (doc) cpfCnpj = doc[0];
    }
    adicionarSocio(nome, qualificacao, cpfCnpj);
  }

  // 3) Último fallback para tabelas achatadas: NOME  QUALIFICAÇÃO.
  for (const linha of linhasLayout) {
    const match = linha.match(/^\s*([A-ZÀ-Ü][A-ZÀ-Ü '.&-]{4,}?)\s{2,}((?:\d{1,3}\s*-\s*)?(?:S[ÓO]CIO|ADMINISTRADOR|TITULAR|EMPRES[ÁA]RIO|REPRESENTANTE).*)$/i);
    if (match) adicionarSocio(match[1], match[2], linha);
  }

  const pontuacao = (compativel ? 0.2 : 0)
    + (cnpj ? 0.25 : 0)
    + (razaoSocial ? 0.1 : 0)
    + (capitalSocial !== null ? 0.15 : 0)
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
      extracao_parcial: socios.length === 0,
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
  const naoSimei = /n[aã]o\s+optante\s+pelo\s+simei/i.test(texto)
    || /situa[cç][aã]o\s+no\s+simei\W{0,12}n[aã]o\s+optante/i.test(texto);
  const simei = !naoSimei && (/optante\s+pelo\s+simei/i.test(texto) || norm.includes('situacao no simei optante'));
  const semAgendamento = /n[aã]o\s+(?:h[aá]|existe|possui)\s+agendamento/i.test(texto)
    || /sem\s+agendamento/i.test(texto);
  const agendamento = !semAgendamento && norm.includes('agendamento') && norm.includes('exclus');
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

function parseAtosJunta(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto);
  const compativel = norm.includes('junta comercial') || norm.includes('lista de arquivamentos') || norm.includes('certidao simplificada') || norm.includes('nire');
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['nome empresarial', 'razão social', 'razao social']));
  const nire = limparValor(valorAposRotulo(linhas, ['nire', 'número de identificação do registro de empresas', 'numero de identificacao do registro de empresas']));
  const capitalSocial = numeroMonetario(valorAposRotulo(linhas, ['capital social atual', 'capital social']));

  const historico: Array<{ numero: string | null; data: string; tipo_ato: string | null }> = [];
  for (const linha of linhas) {
    const dataMatch = linha.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (!dataMatch) continue;
    const linhaNorm = textoNormalizado(linha);
    if (!/(alterac|contrato|consolidac|enquadramento|arquivamento|constituic|transformac|extinc|ata)/.test(linhaNorm)) continue;
    const numeroMatch = linha.match(/\b\d{6,15}\b/);
    historico.push({
      numero: numeroMatch?.[0] || null,
      data: parseDate(dataMatch[1]) || dataMatch[1],
      tipo_ato: limparValor(linha.replace(dataMatch[0], '').replace(numeroMatch?.[0] || '', '')),
    });
  }
  const historicoUnico = historico.filter((item, index, arr) => arr.findIndex((outro) => `${outro.data}|${outro.numero}|${outro.tipo_ato}` === `${item.data}|${item.numero}|${item.tipo_ato}`) === index)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const dataRegistro = historicoUnico.at(-1)?.data || parseDate(valorAposRotulo(linhas, ['data de registro', 'data do registro', 'último arquivamento', 'ultimo arquivamento']));
  const tipoAto = historicoUnico.at(-1)?.tipo_ato || limparValor(valorAposRotulo(linhas, ['tipo do ato', 'ato/evento', 'ato evento']));

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

  const confianca = clamp((compativel ? 0.2 : 0) + (cnpj ? 0.25 : 0) + (razaoSocial ? 0.15 : 0) + (nire ? 0.1 : 0) + (historicoUnico.length ? 0.3 : 0));
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
  return parseAtosJunta(texto);
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
