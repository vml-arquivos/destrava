import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { normalizeText, onlyDigits, parseDate } from '../utils/helpers';

const execFileAsync = promisify(execFile);

export type TipoDocumentoLocal =
  | 'cartao_cnpj'
  | 'qsa'
  | 'simples_nacional'
  | 'atos_junta_comercial'
  | 'contrato_social_alteracao'
  | 'faturamento_12_meses'
  | 'comprovante_residencia'
  | 'extrato_bancario'
  | 'ecf'
  | 'pgdas_d'
  | 'dctf_mit'
  | 'darf'
  | 'ecd'
  | 'livro_caixa';

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
    'capital social', 'nome nome empresarial', 'qualificacao', 'qualificacao do socio', 'cnpj', 'nire',
    'data do registro', 'data de registro', 'situacao no simples nacional',
  ];
  return rotulos.some((rotulo) => n === rotulo || n.startsWith(`${rotulo}:`) || n.startsWith(`${rotulo} (`));
}

function valorAposRotulo(linhas: string[], aliases: string[], limite = 3): string | null {
  // O rótulo mais específico deve vencer (ex.: "capital social atual" antes
  // de "capital social"), evitando interpretar a palavra "atual" como valor.
  const aliasesNorm = aliases.map(textoNormalizado).sort((a, b) => b.length - a.length);
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

function numeroInteiroBrasileiro(value: unknown): number | null {
  const raw = String(value ?? '').replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (!raw) return null;
  const token = raw.match(/-?[\d.]+(?:,\d+)?/)?.[0] || raw;
  const normalized = token.includes(',') ? token.replace(/\./g, '').split(',')[0] : (/^-?\d{1,3}(?:\.\d{3})+$/.test(token) ? token.replace(/\./g, '') : token);
  const result = Number(normalized.replace(/[^\d-]/g, ''));
  return Number.isFinite(result) ? result : null;
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

// CORREÇÃO (Rodada 21, 02/09/2026 -- pedido explícito do usuário: "quando ler
// o cartão do cnpj [...] se tiver telefone atualizado, pegar o email"): o
// Cartão CNPJ oficial imprime "ENDEREÇO ELETRÔNICO" e "TELEFONE" lado a lado
// na mesma linha de rótulos, com os dois valores também lado a lado na linha
// seguinte (ex.: "VILSONMARCIO@GMAIL.COM                     (61) 9145-9287").
// `valorAposRotulo` devolve a linha inteira como um valor só, misturando os
// dois campos -- por isso o e-mail e o telefone são extraídos aqui por conta
// própria, com regex direto numa janela pequena de linhas ao redor do rótulo
// (não no documento inteiro, para não capturar por engano outro e-mail/telefone
// de rodapé/cabeçalho). Regra geral: vale para qualquer Cartão CNPJ nesse
// layout oficial, não depende de nenhuma empresa específica.
function extrairContatoCartaoCnpj(linhas: string[]): { email: string | null; telefone: string | null } {
  const idx = linhas.findIndex((linha) => {
    const n = textoNormalizado(linha);
    return n.includes('endereco eletronico') || n === 'telefone' || n.startsWith('telefone ') || n.startsWith('telefone:');
  });
  if (idx < 0) return { email: null, telefone: null };
  const janela = linhas.slice(idx, idx + 3).join(' ');
  const emailMatch = janela.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const telefoneMatch = janela.match(/\(\d{2}\)\s?\d{4,5}-?\d{4}/);
  return {
    email: emailMatch ? emailMatch[0].toLowerCase() : null,
    telefone: telefoneMatch ? telefoneMatch[0].replace(/\s+/g, ' ').trim() : null,
  };
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
  const { email, telefone } = extrairContatoCartaoCnpj(linhas);
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
      email,
      telefone,
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
  // Para o QSA preservamos também o espaçamento original. O pdftotext -layout
  // usa colunas por espaços; linhasTexto() compacta esses espaços e não pode ser
  // a única fonte para reconhecer a tabela NOME/NOME EMPRESARIAL | QUALIFICAÇÃO.
  const linhasLayout = String(texto || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((linha) => linha.trimEnd())
    .filter((linha) => linha.trim().length > 0);
  const norm = textoNormalizado(texto);
  const compativel = norm.includes('quadro de socios e administradores')
    || norm.includes('quadro societario')
    || norm.includes('capital social')
    || norm.includes('qualificacao do socio');
  // CORREÇÃO (31/08/2026, pedido explícito do usuário -- empresa Empresário
  // Individual cujo QSA foi marcado "Revisão necessária: Não foi possível
  // identificar os nomes dos sócios"): esta é a resposta OFICIAL da própria
  // consulta QSA da Receita Federal para naturezas jurídicas que não têm
  // sócios no sentido societário (Empresário Individual -- código 213-5 -- é
  // o caso mais comum; o titular não é "sócio", é o próprio CNPJ). Quando o
  // documento traz literalmente esta frase, a ausência de sócios no array não
  // é uma falha de leitura: é a resposta completa e correta da Receita. O
  // conteúdo do documento manda, nunca uma suposição sobre o tipo de empresa
  // feita fora dele.
  const qsaNaoAplicavel = norm.includes('natureza juridica nao permite o preenchimento do qsa');
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['nome empresarial', 'razão social', 'razao social']))
    || limparValor(linhas.find((linha) => /\b(?:ltda|limitada|eireli|s\/?a)\b/i.test(linha) && !/qualificacao|socio|administrador/i.test(linha)) || null);
  const capitalLinha = valorAposRotulo(linhas, ['capital social']);
  const capitalSocial = numeroMonetario(capitalLinha);
  const dataRegistro = parseDate(valorAposRotulo(linhas, ['data de registro', 'data do registro', 'data de arquivamento']));

  const socios: Array<{ nome: string; qualificacao: string | null; administrador: boolean | null }> = [];

  const limparRotuloNome = (value: string | null | undefined): string | null => limparValor(
    String(value || '')
      .replace(/^\s*nome\s*\/\s*nome\s+empresarial\s*[:\-]?\s*/i, '')
      .replace(/^\s*nome\s+(?:do\s+)?s[oó]cio\s*[:\-]?\s*/i, ''),
  );
  const limparRotuloQualificacao = (value: string | null | undefined): string | null => limparValor(
    String(value || '')
      .replace(/^\s*qualifica[cç][aã]o(?:\s+do\s+s[oó]cio)?\s*[:\-]?\s*/i, ''),
  );
  const ehQualificacaoSocietaria = (value: string | null | undefined): boolean => {
    const q = limparRotuloQualificacao(value);
    if (!q) return false;
    return /^(?:\d{1,3}\s*[-–—]\s*)?(?:s[oó]ci[oa](?:\s*[-–—]\s*administrador[ae]?)?|administrador[ae]?|titular|empres[aá]rio\s+individual)\b/i.test(q)
      || /\b(?:s[oó]ci[oa]\s*[-–—]\s*administrador[ae]?|s[oó]ci[oa]\s+administrador[ae]?|administrador[ae]?|titular)\b/i.test(q);
  };
  const pareceNomeSocio = (value: string | null | undefined): boolean => {
    const nome = limparRotuloNome(value);
    if (!nome || pareceRotulo(nome) || ehQualificacaoSocietaria(nome)) return false;
    const n = textoNormalizado(nome);
    if (!n || n.length < 4 || n.length > 160) return false;
    if (/^(?:nome|qualificacao|socio|administrador|quadro societario|capital social)$/.test(n)) return false;
    if (/\b(?:cpf|cnpj|capital social|receita federal|comprovante|consulta qsa|quadro de socios)\b/.test(n)) return false;
    if (/^\s*r\$\s*/i.test(nome) || /\b(?:reais?|capital)\b/i.test(nome)) return false;
    if (/^\d{2}[/.]\d{2}[/.]\d{4}$/.test(nome.trim())) return false;
    if (/^\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}$/.test(nome.replace(/\s/g, ''))) return false;
    if (/^\d{1,3}\s*[-–—]/.test(nome.trim())) return false;
    const letras = (nome.match(/[A-Za-zÀ-Úà-ú]/g) || []).length;
    const digitos = (nome.match(/\d/g) || []).length;
    if (letras < 4 || digitos > letras) return false;
    const palavras = n.split(' ').filter(Boolean);
    return palavras.length >= 2 && /[a-zà-ú]/i.test(nome);
  };

  const adicionarSocio = (nomeRaw: string | null | undefined, qualificacaoRaw: string | null | undefined) => {
    const nome = limparRotuloNome(nomeRaw);
    const qualificacao = limparRotuloQualificacao(qualificacaoRaw);
    if (!nome || !pareceNomeSocio(nome)) return;
    const nomeNorm = textoNormalizado(nome);
    const administrador = qualificacao
      ? /administrador|administradora|titular|empres[aá]rio individual/i.test(qualificacao)
      : null;
    const existente = socios.find((socio) => textoNormalizado(socio.nome) === nomeNorm);
    if (existente) {
      if (!existente.qualificacao && qualificacao) existente.qualificacao = qualificacao;
      if (existente.administrador === null && administrador !== null) existente.administrador = administrador;
      return;
    }
    socios.push({ nome, qualificacao, administrador });
  };

  // Layout vertical oficial: NOME/NOME EMPRESARIAL, valor, QUALIFICAÇÃO, valor.
  const nomesRotulo = new Set(['nome nome empresarial', 'nome do socio', 'nome socio', 'socio']);
  for (let i = 0; i < linhas.length; i += 1) {
    const linhaNorm = textoNormalizado(linhas[i]).replace(/[\/]/g, ' ');
    if (!Array.from(nomesRotulo).some((rotulo) => linhaNorm === rotulo || linhaNorm.startsWith(`${rotulo}:`))) continue;
    const nome = limparRotuloNome(linhas[i].includes(':') ? linhas[i].split(':').slice(1).join(':') : linhas[i + 1] || null);
    if (!nome || !pareceNomeSocio(nome)) continue;
    let qualificacao: string | null = null;
    for (let j = i + 1; j <= Math.min(i + 8, linhas.length - 1); j += 1) {
      const atualNorm = textoNormalizado(linhas[j]);
      if (atualNorm.startsWith('qualificacao')) {
        const inline = linhas[j].includes(':') ? linhas[j].split(':').slice(1).join(':') : linhas[j + 1] || null;
        qualificacao = limparRotuloQualificacao(inline);
        break;
      }
    }
    adicionarSocio(nome, qualificacao);
  }

  // Layout horizontal oficial preservado pelo pdftotext -layout:
  // NOME/NOME EMPRESARIAL                     QUALIFICAÇÃO
  // JONNATHAS RODRIGUES PIRES                  49-Sócio-Administrador
  // Também cobre a variação em que o PDF devolve nome e qualificação em linhas
  // separadas (nome em uma linha e "49-Sócio-Administrador" na seguinte).
  for (let i = 0; i < linhasLayout.length; i += 1) {
    const cabecalhoNorm = textoNormalizado(linhasLayout[i]).replace(/[\/]/g, ' ');
    if (!(cabecalhoNorm.includes('nome nome empresarial') && cabecalhoNorm.includes('qualificacao'))) continue;

    for (let j = i + 1; j <= Math.min(i + 10, linhasLayout.length - 1); j += 1) {
      const linhaRaw = linhasLayout[j];
      const linha = linhaRaw.trim();
      const linhaNorm = textoNormalizado(linha);
      if (!linha) continue;
      if (/^(?:cpf|cnpj|capital social|quadro societario|quadro de socios|nome empresarial)\b/.test(linhaNorm)) break;
      if (/^qualificacao(?: do socio)?$/.test(linhaNorm)) continue;

      // Com layout preservado, duas ou mais lacunas separam as colunas.
      const colunas = linhaRaw.trim().split(/\t+|\s{2,}/).map((item) => item.trim()).filter(Boolean);
      if (colunas.length >= 2) {
        const nomeColuna = colunas[0];
        const qualificacaoColuna = colunas.slice(1).join(' ');
        if (pareceNomeSocio(nomeColuna) && ehQualificacaoSocietaria(qualificacaoColuna)) {
          adicionarSocio(nomeColuna, qualificacaoColuna);
          continue;
        }
      }

      // Quando o extrator colapsa a tabela em uma única linha.
      const matchMesmaLinha = linha.match(/^(.+?)\s+((?:\d{1,3}\s*[-–—]\s*)?(?:s[oó]ci[oa](?:\s*[-–—]\s*administrador[ae]?)?|administrador[ae]?|titular|empres[aá]rio\s+individual).*)$/i);
      if (matchMesmaLinha && pareceNomeSocio(matchMesmaLinha[1])) {
        adicionarSocio(matchMesmaLinha[1], matchMesmaLinha[2]);
        continue;
      }

      // Variação efetivamente vista em PDFs oficiais: o nome e a qualificação
      // chegam em linhas diferentes depois do cabeçalho da tabela.
      if (pareceNomeSocio(linha)) {
        for (let k = j + 1; k <= Math.min(j + 3, linhasLayout.length - 1); k += 1) {
          const qualificacaoSeguinte = limparRotuloQualificacao(linhasLayout[k]);
          if (ehQualificacaoSocietaria(qualificacaoSeguinte)) {
            adicionarSocio(linha, qualificacaoSeguinte);
            j = k;
            break;
          }
          const proximaNorm = textoNormalizado(linhasLayout[k]);
          if (/^(?:cpf|cnpj|capital social|nome empresarial|quadro)\b/.test(proximaNorm)) break;
        }
      }
    }
  }

  // Formato compacto: "Nome/Nome Empresarial: X  Qualificação: Y".
  for (const linha of linhasLayout) {
    const match = linha.match(/nome\s*\/\s*nome\s+empresarial\s*[:\-]\s*(.+?)\s+qualifica[cç][aã]o(?:\s+do\s+s[oó]cio)?\s*[:\-]\s*(.+)$/i);
    if (match) adicionarSocio(match[1], match[2]);
  }

  // Fallback estrutural: sempre que uma qualificação societária aparece isolada,
  // procura nas três linhas anteriores o nome correspondente. Isso cobre OCR que
  // preserva o conteúdo, mas perde completamente a estrutura de colunas.
  for (let i = 0; i < linhas.length; i += 1) {
    const qualificacao = limparRotuloQualificacao(linhas[i]);
    if (!qualificacao || !/^(?:\d{1,3}\s*[-–—]\s*)?(?:s[oó]ci[oa](?:\s*[-–—]\s*administrador[ae]?)?|administrador[ae]?|titular|empres[aá]rio\s+individual)\b/i.test(qualificacao)) continue;
    for (let offset = 1; offset <= 3 && i - offset >= 0; offset += 1) {
      const candidato = limparRotuloNome(linhas[i - offset]);
      if (!pareceNomeSocio(candidato)) continue;
      adicionarSocio(candidato, qualificacao);
      break;
    }
  }

  // Quando a natureza jurídica não permite QSA, a lista de sócios vazia É o
  // resultado correto e completo -- pontua como se os sócios tivessem sido
  // lidos (em vez de derrubar a confiança como se a leitura tivesse falhado)
  // e não é tratada como extração parcial.
  const pontuacao = (compativel ? 0.15 : 0)
    + (cnpj ? 0.25 : 0)
    + (razaoSocial ? 0.1 : 0)
    + (capitalSocial !== null ? 0.2 : 0)
    + (socios.length || qsaNaoAplicavel ? 0.3 : 0);
  const confianca = clamp(pontuacao);
  return {
    dados: {
      documento_compativel: compativel,
      cnpj,
      razao_social: razaoSocial,
      capital_social: capitalSocial,
      socios,
      qsa_nao_aplicavel: qsaNaoAplicavel,
      data_registro: dataRegistro,
      extracao_parcial: !qsaNaoAplicavel && socios.length === 0,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

// DARF de IRPJ não escreve "lucro presumido"/"lucro real" por extenso -- o
// regime é indicado pelo código de receita do tributo pago. Só aceito quando o
// código aparece junto do rótulo "código de receita" do próprio DARF, nunca um
// número de 3-4 dígitos solto em outro lugar do documento (data, CEP, valor)
// -- mesma cautela de "nunca inventar" aplicada ao resto da função.
//
// CORREÇÃO (2026-08-30, bug P0 do diagnóstico Master System Prompt): o código
// 5993 estava classificado como Lucro Presumido. O código de receita 5993 é,
// na verdade, "IRPJ - Lucro Real - Estimativa Mensal", e 5625 ("IRPJ - Lucro
// Arbitrado") não existia no catálogo -- um DARF de empresa arbitrada nunca
// conseguia ter o regime identificado. Classificar 5993 como Presumido é
// exatamente o tipo de erro que muda a conclusão da análise: a trilha
// documental (ECF/ECD/EFD x Livro Caixa) exigida para Real e para Presumido é
// diferente, e a empresa poderia avançar pedindo o conjunto de documentos
// errado. Tabela corrigida, com o código de receita como chave única (nunca
// dois códigos apontando para regimes diferentes por engano):
//   2089 -> Lucro Presumido (confirmado)
//   5993 -> Lucro Real, estimativa mensal (confirmado)
//   3373 -> Lucro Real, apuração trimestral (confirmado)
//   8998 -> NÃO CONFIRMADO (ver correção abaixo)
//   5625 -> Lucro Arbitrado (confirmado)
//
// CORREÇÃO (2026-08-30, reversão de decisão anterior -- auditoria
// independente, seção sobre o código 8998): uma rodada anterior desta mesma
// correção manteve 8998 mapeado para "Lucro Real" "por compatibilidade",
// mesmo documentando que não é um código oficialmente confirmado na tabela
// de códigos de receita da RFB para IRPJ. Isso foi um erro: em análise de
// crédito, INFERIR um regime a partir de um código não confirmado é pior do
// que não inferir nada, porque o regime errado puxa a lista errada de
// documentação exigida adiante (ver a mesma regra já aplicada em
// `detectarRegimeTributarioDeclarado`). A partir de agora 8998 tem
// `regime: null` e `confirmado: false`: nunca gera um regime tributário
// sozinho, e sinaliza explicitamente `codigoReceitaNaoConfirmado` para quem
// chama, que por sua vez gera um alerta de auditoria com os marcadores
// CODIGO_NAO_MAPEADO / REVISAO_HUMANA (ver `analiseDocumentalEspecializada.ts`,
// `normalizarDocumentoCatalogado`) em vez de assumir Lucro Real
// silenciosamente.
export const CATALOGO_CODIGO_RECEITA_DARF_IRPJ: Record<string, { regime: string | null; forma_apuracao: string; confirmado: boolean }> = {
  '2089': { regime: 'Lucro Presumido', forma_apuracao: 'trimestral', confirmado: true },
  '5993': { regime: 'Lucro Real', forma_apuracao: 'estimativa_mensal', confirmado: true },
  '3373': { regime: 'Lucro Real', forma_apuracao: 'trimestral', confirmado: true },
  '8998': { regime: null, forma_apuracao: 'nao_confirmado', confirmado: false },
  '5625': { regime: 'Lucro Arbitrado', forma_apuracao: 'trimestral', confirmado: true },
};
function regimeViaCodigoReceitaDarf(texto: string): { regime: string | null; codigoNaoConfirmado: string | null } {
  const match = texto.match(/c[oó]digo\s+(?:d[ea]\s+)?receita\D{0,12}(\d{3,4})/i);
  if (!match) return { regime: null, codigoNaoConfirmado: null };
  const codigo = match[1];
  const entrada = CATALOGO_CODIGO_RECEITA_DARF_IRPJ[codigo];
  if (!entrada) return { regime: null, codigoNaoConfirmado: null };
  if (!entrada.confirmado) return { regime: null, codigoNaoConfirmado: codigo };
  return { regime: entrada.regime, codigoNaoConfirmado: null };
}

/**
 * Lê o regime tributário declarado em QUALQUER documento fiscal (Consulta de
 * Optantes, ECF, DCTF, Relatório de Situação Fiscal, DARF de IRPJ...). O
 * regime é o que define a documentação exigida adiante -- Simples pede
 * PGDAS/DEFIS, enquanto Presumido e Real pedem ECF/ECD/DCTF, com exigências
 * diferentes entre si.
 *
 * Em análise de crédito, afirmar o regime errado é pior do que assumi-lo
 * pendente: o regime errado puxa a lista errada de documentos. Por isso só é
 * aceito o regime AFIRMADO no texto -- nunca o negado ("não optou pelo lucro
 * presumido"), nunca um entre vários citados numa lista de opções (incluindo
 * quando o texto por extenso e o código de receita de um DARF discordam entre
 * si -- nesse caso também vira ambíguo, em vez de escolher um dos dois).
 */
export function detectarRegimeTributarioDeclarado(texto: string): { regime: string | null; ambiguo: boolean; codigoReceitaNaoConfirmado?: string } {
  const norm = textoNormalizado(texto);
  const afirmado = (termo: string) => {
    const negado = new RegExp(`(n[ãa]o|nao)\\s+(?:[a-zç]+\\s+){0,3}${termo}`, 'i');
    if (negado.test(norm)) return false;
    return norm.includes(termo);
  };
  const lucroPresumido = afirmado('lucro presumido');
  const lucroReal = afirmado('lucro real');
  const lucroArbitrado = afirmado('lucro arbitrado');
  const { regime: regimeViaDarf, codigoNaoConfirmado } = regimeViaCodigoReceitaDarf(texto);
  // Imune/isenta só conta quando o texto fala do regime, não quando a palavra
  // aparece solta (ex: "isenta de multa").
  const imuneIsenta = /regime\s+(?:tribut[aá]rio\s+)?(?:de\s+)?(?:imunidade|isen[cç][aã]o)/i.test(texto)
    || /(?:imune|isenta)\s+(?:de\s+)?(?:irpj|tributa[cç][aã]o|impostos)/i.test(texto);

  const regimesEncontrados = new Set<string>([
    lucroReal ? 'Lucro Real' : null,
    lucroPresumido ? 'Lucro Presumido' : null,
    lucroArbitrado ? 'Lucro Arbitrado' : null,
    regimeViaDarf,
  ].filter((item): item is string => Boolean(item)));
  if (regimesEncontrados.size > 1) return { regime: null, ambiguo: true };

  const regime = regimesEncontrados.size === 1
    ? regimesEncontrados.values().next().value as string
    : imuneIsenta
      ? 'Imune ou isenta'
      : null;
  // codigoNaoConfirmado (ex: DARF com código de receita 8998) só é
  // sinalizado quando NENHUM outro regime foi confirmado por outra via --
  // se o próprio texto já afirma o regime por extenso, essa confirmação
  // prevalece e não há nada para revisar.
  if (!regime && codigoNaoConfirmado) {
    return { regime: null, ambiguo: false, codigoReceitaNaoConfirmado: codigoNaoConfirmado };
  }
  return { regime, ambiguo: false };
}


function parseSimples(texto: string): { dados: Record<string, any>; confianca: number } {
  const norm = textoNormalizado(texto);
  const compativel = norm.includes('simples nacional') || norm.includes('consulta optantes') || norm.includes('simei')
    || norm.includes('lucro presumido') || norm.includes('lucro real') || norm.includes('lucro arbitrado')
    || norm.includes('regime tributario') || norm.includes('regime de apuracao')
    // DARF de IRPJ (guia de referência do usuário): não cita o regime por
    // extenso, só o código de receita -- ver detectarRegimeTributarioDeclarado.
    || (norm.includes('darf') && norm.includes('codigo de receita'));
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const naoOptante = /n[aã]o\s+optante\s+pelo\s+simples\s+nacional/i.test(texto) || /situacao\s+no\s+simples\s+nacional\W{0,8}nao\s+optante/i.test(norm);
  const excluido = /exclu[ií]d[oa]\s+do\s+simples/i.test(texto) || norm.includes('exclusao do simples nacional efetivada');
  const optante = !naoOptante && !excluido && (/optante\s+pelo\s+simples\s+nacional/i.test(texto) || /situacao\s+no\s+simples\s+nacional\W{0,8}optante/i.test(norm));
  const simei = /optante\s+pelo\s+simei/i.test(texto) || norm.includes('situacao no simei optante');
  const agendamento = norm.includes('agendamento') && norm.includes('exclus');
  const dataOpcao = dataProximaDe(texto, /(?:optante\s+pelo\s+simples\s+nacional\s+desde|data\s+de\s+op[cç][aã]o)\D{0,40}(\d{2}\/\d{2}\/\d{4})/i);
  const dataExclusao = dataProximaDe(texto, /(?:data\s+(?:de|da)\s+exclus[aã]o|exclu[ií]d[oa]\s+em)\D{0,40}(\d{2}\/\d{2}\/\d{4})/i);
  const situacao = excluido ? 'Excluído' : naoOptante ? 'Não Optante' : optante ? 'Optante' : null;
  // O enquadramento serve para dizer QUAL regime a empresa usa -- é ele que
  // define a documentação fiscal exigida adiante. Quando o próprio documento
  // declara o regime (comprovantes de enquadramento, situação fiscal e
  // declarações costumam trazer "LUCRO PRESUMIDO"/"LUCRO REAL" escrito), essa
  // informação é lida e usada. Só quando o documento realmente não informa é
  // que o regime fica pendente de outro comprovante (ECF/DCTF/Livro Caixa) --
  // ver 'nao_optante_regime_a_confirmar' em mapaDocumentalCreditoService.ts.
  // "Não Optante" nunca é tratado como regime: Presumido, Real e Arbitrado são
  // todos não optantes e exigem documentos diferentes entre si.
  const { regime: regimeDeclaradoBruto, ambiguo: regimeAmbiguo, codigoReceitaNaoConfirmado } = detectarRegimeTributarioDeclarado(texto);
  const regimeDeclarado = regimeDeclaradoBruto;
  const regime = simei
    ? 'MEI / SIMEI'
    : optante
      ? 'Simples Nacional'
      : regimeDeclarado;
  const regimeConfirmado = Boolean(simei || optante || regimeDeclarado);
  // CORREÇÃO (2026-08-30): código de receita do DARF não confirmado na
  // tabela oficial da RFB (ex: 8998) nunca mais infere regime sozinho (ver
  // detectarRegimeTributarioDeclarado). Em vez de ficar silenciosamente
  // pendente como qualquer outro documento sem regime, fica marcado com um
  // motivo explícito para revisão humana (REVISAO_HUMANA / CODIGO_NAO_MAPEADO).
  const revisaoHumanaNecessaria = Boolean(codigoReceitaNaoConfirmado) && !regimeConfirmado;
  const confianca = clamp((compativel || regimeDeclarado ? 0.25 : 0) + (cnpj ? 0.35 : 0) + (situacao || regimeDeclarado ? 0.3 : 0) + ((dataOpcao || dataExclusao || agendamento) ? 0.1 : 0));
  return {
    dados: {
      documento_compativel: compativel,
      cnpj,
      situacao_simples: situacao,
      regime_tributario: regime,
      regime_confirmado: regimeConfirmado,
      regime_a_confirmar: Boolean(situacao) && !regimeConfirmado,
      codigo_receita_darf_nao_confirmado: codigoReceitaNaoConfirmado || null,
      revisao_humana_necessaria: revisaoHumanaNecessaria,
      motivo_revisao_humana: revisaoHumanaNecessaria
        ? `Código de receita ${codigoReceitaNaoConfirmado} não está confirmado na tabela oficial de códigos de receita da RFB para IRPJ -- o regime tributário não pode ser inferido automaticamente (CODIGO_NAO_MAPEADO). Requer revisão humana.`
        : null,
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

  const padraoNome = '[A-ZÀ-Ú][A-Za-zÀ-ú]+(?:\\s+[A-ZÀ-Ú][A-Za-zÀ-ú]+){1,8}';
  const limparNomeSocietario = (value: string | null | undefined): string | null => limparValor(value || null)?.replace(/\s+/g, ' ') || null;
  const indiceTransferencia = texto.search(/retira-se\s+da\s+sociedade|vende\s+e\s+transfere|cedendo\s+e\s+transferindo/i);
  const contextoTransferencia = indiceTransferencia >= 0
    ? texto.slice(Math.max(0, indiceTransferencia - 900), Math.min(texto.length, indiceTransferencia + 1800))
    : '';
  const cedente = limparNomeSocietario(contextoTransferencia.match(new RegExp(`(?:s[óo]cio|s[óo]cia)\\s+(${padraoNome})(?=\\s*,\\s*(?:possuidor|acima|brasileir[oa]))`, 'i'))?.[1]);
  const cessionario = limparNomeSocietario(contextoTransferencia.match(new RegExp(`(?:para|ao)\\s+(?:o\\s+)?s[óo]cio(?:\\s+(?:ora\\s+admitido|remanescente|admitido)(?:\\s+neste\\s+ato)?)?\\s+(${padraoNome})(?=\\s*,\\s*(?:brasileir[oa]|advogado|data|portador|acima))`, 'i'))?.[1]);
  const quotasMatch = contextoTransferencia.match(/(?:possuidor\s+de|suas)\s+([\d.]+(?:,\d+)?)\s*(?:\([^)]*\)\s*)?quotas/i);
  const quotasTransferidas = numeroInteiroBrasileiro(quotasMatch?.[1] || null);
  const textoParaCapital = texto.replace(/quotas\s+de\s+capital\s+social/gi, 'quotas societárias');
  const capitalAnteriorMatch = textoParaCapital.match(/\b(?:o\s+)?capital\s+social\b[^.\n]{0,140}?\b(?:é|de|valor\s+de)\s+(?:R\$\s*)?([\d.]+(?:,\d+)?)/i);
  const capitalSocialAnterior = numeroInteiroBrasileiro(capitalAnteriorMatch?.[1] || null);

  const socios = linhas
    .filter((linha) => /s[oó]ci[oa]|administrador|titular/i.test(linha))
    .map((linha) => {
      const depoisRotulo = linha.match(/(?:s[oó]ci[oa](?:\s*-?administrador[ae]?)?|administrador[ae]?|titular)\s*[:\-]\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{4,100})/i)?.[1];
      const antesVirgula = linha.match(/^\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{4,100})\s*,/)?.[1];
      const nome = limparValor(depoisRotulo || antesVirgula || null);
      return nome ? { nome, qualificacao: /administrador|titular/i.test(linha) ? 'Administrador' : 'Sócio', administrador: /administrador|titular/i.test(linha) } : null;
    })
    .filter(Boolean)
    .filter((item: any, index, array: any[]) => array.findIndex((outro: any) => textoNormalizado(outro.nome) === textoNormalizado(item.nome)) === index);

  const nomesConhecidos = Array.from(new Set([cedente, cessionario, ...socios.map((socio: any) => socio.nome)].filter(Boolean))) as string[];
  const inicioQuadro = texto.search(/passa\s+a\s+ser\s+assim\s+distribu[ií]do|fica\s+da\s+seguinte\s+forma|capital\s+encontra-se\s+subscrito/i);
  const secaoQuadro = inicioQuadro >= 0 ? texto.slice(inicioQuadro, Math.min(texto.length, inicioQuadro + 2400)) : '';
  const quadroSocietarioFinal = nomesConhecidos.map((nome) => {
    const linha = linhas.find((item) => {
      const normalizada = textoNormalizado(item);
      return normalizada.includes(textoNormalizado(nome)) && /\d/.test(item)
        && (!secaoQuadro || textoNormalizado(secaoQuadro).includes(normalizada));
    });
    if (!linha) return null;
    const indiceNome = linha.toLocaleLowerCase('pt-BR').indexOf(nome.toLocaleLowerCase('pt-BR'));
    const depoisNome = indiceNome >= 0 ? linha.slice(indiceNome + nome.length) : linha;
    const numeros = depoisNome.match(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+(?:,\d+)?\b/g) || [];
    const percentualExplicito = /%/.test(linha) || /%/.test(secaoQuadro);
    return {
      nome,
      quotas: numeroInteiroBrasileiro(numeros[0] || null),
      percentual: percentualExplicito ? numeros.map((numero) => numeroMonetario(numero)).reverse().find((numero) => numero !== null && numero >= 0 && numero <= 100) ?? null : null,
      administrador: cessionario ? textoNormalizado(nome) === textoNormalizado(cessionario) : null,
    };
  }).filter(Boolean) as Array<Record<string, any>>;
  if (!quadroSocietarioFinal.length && cessionario && quotasTransferidas !== null) {
    quadroSocietarioFinal.push({ nome: cessionario, quotas: quotasTransferidas, percentual: 100, administrador: true });
  }
  const alteracoesSocietarias = cedente && cessionario
    ? [{
        tipo_alteracao: 'saida_transferencia',
        cedente: { nome: cedente, quotas: quotasTransferidas },
        cessionario: { nome: cessionario, quotas: quotasTransferidas },
        quotas_transferidas: quotasTransferidas,
        percentual_transferido: capitalSocialAnterior && quotasTransferidas !== null ? (quotasTransferidas / capitalSocialAnterior) * 100 : null,
        clausula: /cl[aá]usula\s+primeira/i.test(contextoTransferencia) ? 'Cláusula Primeira' : null,
        evidencia: texto.slice(indiceTransferencia, Math.min(texto.length, indiceTransferencia + 900)).replace(/\s+/g, ' ').trim().slice(0, 700),
      }]
    : [];
  const capitalSocialAtual = quadroSocietarioFinal.reduce((total, socio: any) => total + (Number(socio.quotas) || 0), 0) || null;
  if (quadroSocietarioFinal.length === 1 && quadroSocietarioFinal[0].percentual == null && capitalSocialAtual) {
    quadroSocietarioFinal[0].percentual = 100;
  }

  const campos = [nire, dataRegistro, razaoSocial, cnpj, tipoAto];
  const preenchidos = campos.filter(Boolean).length;
  const confianca = clamp((compativel ? 0.15 : 0) + (nire ? 0.2 : 0) + (dataRegistro ? 0.2 : 0) + (preenchidos / campos.length) * 0.15 + (socios.length ? 0.15 : 0) + (alteracoesSocietarias.length ? 0.15 : 0));
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
      socios: quadroSocietarioFinal.length
        ? quadroSocietarioFinal.map((socio: any) => ({
            nome: socio.nome,
            quotas: socio.quotas ?? null,
            percentual: socio.percentual ?? null,
            qualificacao: socio.administrador ? 'Administrador' : 'Sócio',
            administrador: socio.administrador ?? false,
          }))
        : socios,
      alteracoes_societarias: alteracoesSocietarias,
      quadro_societario_final: quadroSocietarioFinal,
      capital_social_anterior: capitalSocialAnterior,
      capital_social_atual: capitalSocialAtual,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

function parseFaturamento12Meses(texto: string): { dados: Record<string, any>; confianca: number } {
  const norm = textoNormalizado(texto);
  const compativel = /faturamento|receita bruta|relacao de receitas|relação de receitas/.test(norm);
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const meses = linhasTexto(texto)
    .filter((linha) => !/\bcnpj\b/i.test(linha))
    .filter((linha) => !/\b\d{2}\/\d{2}\/20\d{2}\b/.test(linha) || /r\$|faturamento|compet[eê]ncia|refer[eê]ncia/i.test(linha))
    .flatMap((linha) => Array.from(linha.matchAll(/\b(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2}|\d{2})\b/g)))
    .map((match) => `${match[2].length === 2 ? `20${match[2]}` : match[2]}-${match[1].padStart(2, '0')}`);
  const mesesReferencia = Array.from(new Set(meses)).sort();
  const datas = Array.from(String(texto || '').matchAll(/\b(\d{2}\/\d{2}\/20\d{2})\b/g))
    .map((match) => parseDate(match[1]))
    .filter(Boolean) as string[];
  const dataAssinatura = parseDate(
    texto.match(/(?:assinado|assinatura|firmado|declaramos).{0,80}?(\d{2}\/\d{2}\/20\d{2})/is)?.[1]
      || datas.at(-1)
      || null,
  );
  const eletronica = /assinado\s+(?:de\s+forma\s+)?(?:digital|eletronic)|assinatura\s+(?:digital|eletronic)|icp[\s-]*brasil|gov\.br/i.test(texto);
  const manual = /assinatura\s+manual|assinado\s+manualmente|assinatura\s+manuscrita/i.test(texto);
  const tipoAssinatura = eletronica ? 'eletronica' : manual ? 'manual' : null;
  const nomeSocio = limparValor(texto.match(/(?:s[oó]cio(?:\s*-?administrador)?|administrador)\s*[:\-]\s*([^\n\r]{4,100})/i)?.[1] || null);
  const nomeContador = limparValor(texto.match(/(?:contador(?:a)?|respons[aá]vel\s+cont[aá]bil)\s*[:\-]\s*([^\n\r]{4,100})/i)?.[1] || null);
  const temSocio = /s[oó]cio(?:\s*-?administrador)?|administrador/i.test(texto) && /assinatura|assinado|firmado/i.test(texto);
  const temContador = /contador|crc|respons[aá]vel\s+cont[aá]bil/i.test(texto) && /assinatura|assinado|firmado/i.test(texto);
  const confianca = clamp((compativel ? 0.25 : 0) + (cnpj ? 0.2 : 0) + (mesesReferencia.length ? 0.25 : 0) + (dataAssinatura ? 0.1 : 0) + (temSocio ? 0.1 : 0) + (temContador ? 0.1 : 0));
  return {
    dados: {
      documento_compativel: compativel,
      cnpj,
      meses_referencia: mesesReferencia,
      data_assinatura: dataAssinatura,
      assinatura_socio_administrador: { presente: temSocio, nome: nomeSocio, tipo: tipoAssinatura },
      assinatura_contador: { presente: temContador, nome: nomeContador, tipo: tipoAssinatura },
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

function parseComprovanteResidencia(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto);
  const compativel = /comprovante|conta de (?:agua|energia|telefone|internet)|fatura|endereco|endereço|cep/.test(norm);
  const dataEmissao = parseDate(
    texto.match(/(?:data\s+de\s+emiss[aã]o|emiss[aã]o)\s*[:\-]?\s*(\d{2}\/\d{2}\/20\d{2})/i)?.[1]
      || texto.match(/(?:vencimento|data\s+de\s+vencimento)\s*[:\-]?\s*(\d{2}\/\d{2}\/20\d{2})/i)?.[1]
      || texto.match(/\b(\d{2}\/\d{2}\/20\d{2})\b/)?.[1]
      || null,
  );
  const mesReferencia = texto.match(/(?:m[eê]s|compet[eê]ncia|refer[eê]ncia)\s*[:\-]?\s*((?:0?[1-9]|1[0-2])\s*[\/.\-]\s*(?:20\d{2}|\d{2}))/i)?.[1]
    || (dataEmissao ? dataEmissao.slice(0, 7) : null);
  const nomeTitular = limparValor(
    valorAposRotulo(linhas, ['nome do titular', 'titular', 'cliente', 'nome do cliente', 'consumidor'])
      || texto.match(/(?:titular|cliente|consumidor)\s*[:\-]\s*([^\n\r]{4,100})/i)?.[1]
      || null,
  );
  const confianca = clamp((compativel ? 0.35 : 0) + (mesReferencia ? 0.3 : 0) + (nomeTitular ? 0.25 : 0) + (/\b\d{5}-?\d{3}\b/.test(texto) ? 0.1 : 0));
  return {
    dados: {
      documento_compativel: compativel,
      nome_titular: nomeTitular,
      mes_referencia: mesReferencia,
      data_emissao: dataEmissao,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

function parseExtratoBancario(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto);
  const compativel = /extrato|movimenta[cç][aã]o financeira|hist[oó]rico de movimenta[cç][aã]o|lan[cç]amentos|conta corrente|conta poupan[cç]a|saldo anterior|saldo atual|ag[eê]ncia|sicoob/.test(norm);

  const periodoMatch = texto.match(/per[ií]odo\s*:\s*(\d{2}\/\d{2}\/20\d{2})\s*[-–—]\s*(\d{2}\/\d{2}\/20\d{2})/i);
  const anoDoPeriodo = periodoMatch?.[1]?.match(/\/(\d{4})$/)?.[1]
    || texto.match(/\b(20\d{2})\b/)?.[1]
    || String(new Date().getFullYear());

  const dataDoMovimento = (valor: string): string | null => {
    const parcial = valor.match(/^(\d{2})\/(\d{2})$/);
    if (parcial) {
      const candidato = `${anoDoPeriodo}-${parcial[2]}-${parcial[1]}`;
      const data = new Date(`${candidato}T00:00:00Z`);
      if (Number.isNaN(data.getTime()) || data.getUTCFullYear() !== Number(anoDoPeriodo) || data.getUTCMonth() + 1 !== Number(parcial[2]) || data.getUTCDate() !== Number(parcial[1])) return null;
      return candidato;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(valor) && !/^20\d{2}-\d{2}-\d{2}$/.test(valor)) return null;
    return parseDate(valor);
  };

  const banco = limparValor(valorAposRotulo(linhas, ['banco', 'instituição financeira', 'instituicao financeira', 'nome do banco']))
    || limparValor(linhas.find((linha) => /\b(?:banco|bank)\b/i.test(linha) && linha.length <= 100) || null)
    || limparValor(linhas.find((linha) => /\bsicoob\b/i.test(linha))?.match(/(?:\/|:)\s*(sicoob[^|]+)$/i)?.[1] || null)
    || limparValor(linhas.find((linha) => /\bsicoob\b/i.test(linha)) || null);

  const periodoDatas = Array.from(texto.matchAll(/\b(\d{2}\/\d{2}\/20\d{2}|20\d{2}-\d{2}-\d{2})\b/g))
    .map((match) => parseDate(match[1]))
    .filter((value): value is string => Boolean(value));
  if (periodoMatch) {
    periodoDatas.push(parseDate(periodoMatch[1]) || '', parseDate(periodoMatch[2]) || '');
  }

  const lancamentos: Array<{ data: string; tipo: 'entrada' | 'saida'; descricao: string; valor: number; evidencia: string }> = [];
  const valorRegex = /[-+]?\s*(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2}|\.\d{2})/g;
  const dataLinhaRegex = /^\s*(\d{2}\/\d{2}(?:\/20\d{2}|\/\d{2})?|20\d{2}-\d{2}-\d{2})\b/;
  let indiceLancamentoAtual = -1;

  for (const linha of linhas) {
    const dataMatch = linha.match(dataLinhaRegex);
    if (dataMatch) {
      indiceLancamentoAtual = -1;
      const data = dataDoMovimento(dataMatch[1]);
      if (!data) continue;
      const restante = linha.slice((dataMatch.index || 0) + dataMatch[0].length).trim();
      const valores = Array.from(restante.matchAll(valorRegex)).map((match) => ({
        token: match[0],
        index: match.index || 0,
      }));
      if (!valores.length) continue;

      const valorToken = valores[0].token;
      const valor = numeroMonetario(valorToken);
      if (!valor || valor <= 0) continue;
      const antesDoValor = restante.slice(0, valores[0].index).trim();
      const depoisDoValor = restante.slice(valores[0].index + valorToken.length).trim();
      const marcador = depoisDoValor.match(/^([CD*])(?:\s|$)/i)?.[1]?.toUpperCase() || null;
      const contexto = textoNormalizado(`${antesDoValor} ${depoisDoValor}`);
      if (marcador === '*' || /^(saldo|total|limite|per[ií]odo|data|descri[cç][aã]o|hist[oó]rico)/.test(contexto)) continue;

      const saida = marcador === 'D'
        || /(^|\s)(?:d|deb|d[eé]bito|d[eé]bitos|sa[ií]da|pagamento|compra|tarifa|taxa|boleto|pix enviado|ted enviado|transfer[eê]ncia enviada|transferencia enviada|resgate)(?:\s|$)/i.test(contexto)
        || /^-/.test(valorToken);
      const entrada = marcador === 'C'
        || /(^|\s)(?:c|cred|cr[eé]dito|cr[eé]ditos|entrada|recebimento|dep[oó]sito|pix recebido|ted recebido|transfer[eê]ncia recebida|estorno)(?:\s|$)/i.test(contexto)
        || /^\+/.test(valorToken);
      if (!entrada && !saida) continue;

      const descricao = limparValor(antesDoValor.replace(/\b(?:[CD]|deb|cred)\b/gi, '').replace(/[|;:]+/g, ' ')) || 'Lançamento identificado no extrato';
      if (descricao.length < 3 || /saldo (anterior|final|atual|bloq)/i.test(descricao)) continue;
      lancamentos.push({
        data,
        tipo: saida ? 'saida' : 'entrada',
        descricao: descricao.slice(0, 500),
        valor: Math.round(Math.abs(valor) * 100) / 100,
        evidencia: linha.slice(0, 1000),
      });
      indiceLancamentoAtual = lancamentos.length - 1;
      continue;
    }

    if (indiceLancamentoAtual < 0) continue;
    const complemento = limparValor(linha) || '';
    if (/^(?:resumo|encargos|outras informa[cç][oõ]es|saldo(?:\s|:)|total(?:\s|:)|previs[aã]o|juros(?:\s|:)|tarifas vencidas|cheque especial)/i.test(complemento)) {
      indiceLancamentoAtual = -1;
      continue;
    }
    if (!complemento || /^(?:doc\.?|cpf|cnpj)\s*:/i.test(complemento) || /^(?:\*{2,}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(complemento)) {
      if (complemento && /^(?:doc\.?\s*:)/i.test(complemento)) {
        lancamentos[indiceLancamentoAtual].evidencia = `${lancamentos[indiceLancamentoAtual].evidencia} ${complemento}`.slice(0, 1000);
      }
      continue;
    }
    const atual = lancamentos[indiceLancamentoAtual];
    atual.descricao = `${atual.descricao} ${complemento}`.replace(/\s+/g, ' ').trim().slice(0, 500);
    atual.evidencia = `${atual.evidencia} ${complemento}`.replace(/\s+/g, ' ').trim().slice(0, 1000);
  }

  const datasUnicas = Array.from(new Set(periodoDatas.filter(Boolean).concat(lancamentos.map((item) => item.data)))).sort();
  const dataInicio = datasUnicas[0] || null;
  const dataFim = datasUnicas.at(-1) || null;
  const unicos = lancamentos.filter((item, index, array) => array.findIndex((outro) => `${outro.data}|${outro.tipo}|${outro.valor}|${textoNormalizado(outro.descricao)}` === `${item.data}|${item.tipo}|${item.valor}|${textoNormalizado(item.descricao)}`) === index);
  const totalEntradas = Math.round(unicos.filter((item) => item.tipo === 'entrada').reduce((total, item) => total + item.valor, 0) * 100) / 100;
  const totalSaidas = Math.round(unicos.filter((item) => item.tipo === 'saida').reduce((total, item) => total + item.valor, 0) * 100) / 100;
  const confianca = clamp((compativel ? 0.3 : 0) + (banco ? 0.1 : 0) + (dataInicio && dataFim ? 0.15 : 0) + Math.min(0.4, unicos.length * 0.06));
  return {
    dados: {
      documento_compativel: compativel,
      banco: banco || null,
      periodo_inicio: dataInicio,
      periodo_fim: dataFim,
      lancamentos: unicos,
      total_entradas: totalEntradas,
      total_saidas: totalSaidas,
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

export type TipoComprovanteRegime = 'ecf' | 'pgdas_d' | 'dctf_mit' | 'darf' | 'ecd' | 'livro_caixa';

// Marcadores textuais de cada tipo, checados em ordem de especificidade. O
// classificador nunca consulta o slot esperado: identifica somente o que o
// texto efetivamente afirma ser, incluindo documentos fiscais que podem ser
// evidência histórica sem satisfazer um slot diferente.
const MARCADORES_COMPROVANTE_REGIME: Record<TipoComprovanteRegime, RegExp> = {
  pgdas_d: /(?:recibo.{0,80})?pgdas[- ]?d|programa gerador do documento de arrecadacao do simples|programa gerador do documento de arrecadação do simples/i,
  ecd: /(?:recibo.{0,80})?\becd\b|escrituracao contabil digital|escrituração contábil digital|sped\s+contabil/i,
  ecf: /(?:recibo.{0,80})?\becf\b|escrituracao contabil fiscal|escrituração contábil fiscal|sped\s+ecf/i,
  dctf_mit: /\bdctf(?:web)?\b|mit\b|modulo de inclusao de tributos|módulo de inclusão de tributos/i,
  darf: /\bdarf\b|documento de arrecadacao de receitas federais|documento de arrecadação de receitas federais/i,
  livro_caixa: /livro[- ]caixa/i,
};
const ORDEM_DETECCAO_COMPROVANTE_REGIME: TipoComprovanteRegime[] = ['pgdas_d', 'ecd', 'ecf', 'dctf_mit', 'darf', 'livro_caixa'];

/**
 * Classificador independente do slot: identifica qual dos quatro tipos de
 * comprovante de regime (ECF, DCTF/DCTFWeb/MIT, DARF, Livro Caixa) o TEXTO em
 * si afirma ser, sem nunca consultar para qual slot o arquivo foi enviado.
 * Devolve `null` quando nenhum marcador é encontrado -- "não sei que documento
 * é este", nunca "deve ser o que o usuário esperava anexar".
 */
export function detectarTipoComprovanteRegime(texto: string): TipoComprovanteRegime | null {
  const normalizado = textoNormalizado(texto);
  for (const tipo of ORDEM_DETECCAO_COMPROVANTE_REGIME) {
    if (MARCADORES_COMPROVANTE_REGIME[tipo].test(normalizado)) return tipo;
  }
  return null;
}

export function parseComprovanteRegime(tipoEsperado: TipoDocumentoLocal, texto: string): { dados: Record<string, any>; confianca: number } {
  const base = parseSimples(texto);
  const tipoDetectado = detectarTipoComprovanteRegime(texto);
  // A identidade do documento vem exclusivamente do texto, sem consultar o
  // slot de upload. O requisito só é compatível quando o tipo detectado é
  // exatamente o tipo esperado; o regime explicitamente lido continua sendo
  // evidência histórica independente e nunca é inferido de código não confirmado.
  const regimeDetectado = base.dados.regime_confirmado === true;
  const documentoCompativel = tipoDetectado === tipoEsperado && regimeDetectado;
  const REGIMES_QUE_JUSTIFICAM_COMPROVANTE = new Set(['Lucro Presumido', 'Lucro Real', 'Lucro Arbitrado']);
  const podeEvidenciarRegime = REGIMES_QUE_JUSTIFICAM_COMPROVANTE.has(String(base.dados.regime_tributario || ''));
  return {
    dados: {
      ...base.dados,
      tipo_detectado: tipoDetectado,
      tipo_esperado: tipoEsperado,
      documento_compativel: documentoCompativel,
      pode_evidenciar_regime: podeEvidenciarRegime,
      comprovante_regime: true,
      tipo_comprovante_regime: tipoEsperado,
    },
    confianca: clamp(base.confianca + (documentoCompativel ? 0.15 : 0)),
  };
}

export function analisarTextoDocumentoLocal(tipo: TipoDocumentoLocal, texto: string): { dados: Record<string, any>; confianca: number } {
  if (tipo === 'cartao_cnpj') return parseCartaoCnpj(texto);
  if (tipo === 'qsa') return parseQsa(texto);
  if (tipo === 'simples_nacional') return parseSimples(texto);
  if (tipo === 'atos_junta_comercial') return parseAtosJunta(texto);
  if (tipo === 'faturamento_12_meses') return parseFaturamento12Meses(texto);
  if (tipo === 'comprovante_residencia') return parseComprovanteResidencia(texto);
  if (tipo === 'extrato_bancario') return parseExtratoBancario(texto);
  // ECF, DCTF/DCTFWeb, DARF e Livro Caixa compartilham a detecção
  // conservadora de regime, mas preservam sua própria compatibilidade documental.
  if (tipo === 'ecf' || tipo === 'pgdas_d' || tipo === 'dctf_mit' || tipo === 'darf' || tipo === 'ecd' || tipo === 'livro_caixa') return parseComprovanteRegime(tipo, texto);
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
