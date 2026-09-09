import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { normalizeText, onlyDigits, parseDate } from '../utils/helpers';
import { obterPerfilAnaliseDocumental } from './documentAnalysisProfiles';

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
  | 'livro_caixa'
  | 'efd_contribuicoes'
  | 'efd_icms_ipi'
  | 'certidao_regularidade'
  | 'situacao_fiscal'
  | 'consulta_cadin'
  | 'consulta_pgfn'
  | 'consulta_scr'
  | 'consulta_ccs'
  | 'consulta_ccf'
  | 'consulta_cenprot'
  | 'consulta_bureau'
  | 'defis'
  | 'dasn_simei'
  | 'compartilhamento_ecac'
  | 'documento_generico';

export interface ExtracaoDocumentalLocalResult {
  tipo: TipoDocumentoLocal;
  disponivel: boolean;
  legivel: boolean;
  mecanismo: 'pdftotext' | 'tesseract' | 'texto_estruturado' | 'imagem_visual';
  texto: string;
  dados: Record<string, any>;
  confianca: number;
  paginas_processadas?: number | null;
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

function primeiroCnpjOuBase(texto: string): string | null {
  return primeiroCnpj(texto) || String(texto || '').match(/\b\d{2}\.?\d{3}\.?\d{3}\b/)?.[0] || null;
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

function parseDataPorExtenso(value: unknown): string | null {
  const texto = textoNormalizado(value);
  const meses: Record<string, string> = {
    janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
    julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
  };
  const match = texto.match(/\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(20\d{2})\b/);
  if (!match) return parseDate(value);
  const mes = meses[match[2]];
  return mes ? `${match[3]}-${mes}-${match[1].padStart(2, '0')}` : parseDate(value);
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
  // CORREÇÃO (Rodada 22, 02/09/2026 -- descoberta ao testar o Cartão CNPJ real
  // anexado pelo usuário): no mesmo layout oficial da Receita descrito acima
  // para e-mail/telefone, "SITUAÇÃO CADASTRAL" e "DATA DA SITUAÇÃO CADASTRAL"
  // também ficam impressos lado a lado na mesma linha de rótulo, com "ATIVA"
  // e a data igualmente lado a lado na linha de valor seguinte (ex.: "ATIVA
  // 30/08/2026"). Como o rótulo da data fica fundido dentro do rótulo da
  // situação, a busca isolada por "data da situação cadastral" não encontra
  // nada nesse layout -- e, sem este ajuste, o valor da situação ficava
  // contaminado com a data ("ATIVA 30/08/2026" em vez de "ATIVA"), o que
  // impediria a Rodada 20 gravar a situação cadastral confirmada de forma
  // limpa no cadastro da empresa. Aqui a data é destacada do valor da
  // situação e reaproveitada para preencher `data_situacao_cadastral` quando
  // a busca direta pelo rótulo não encontrar nada. Regra geral: vale para
  // qualquer Cartão CNPJ nesse layout oficial, não depende de nenhuma
  // empresa/regime específico; quando situação e data já vêm em linhas
  // separadas (layout mais espaçado), o comportamento não muda.
  const situacaoBruta = limparValor(valorAposRotulo(linhas, ['situação cadastral', 'situacao cadastral']));
  const dataEmbutidaNaSituacao = situacaoBruta?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;
  const situacao = situacaoBruta
    ? (situacaoBruta.replace(/\s*\d{2}\/\d{2}\/\d{4}\s*$/, '').trim() || situacaoBruta)
    : situacaoBruta;
  const dataSituacao = parseDate(valorAposRotulo(linhas, ['data da situação cadastral', 'data da situacao cadastral']))
    || parseDate(dataEmbutidaNaSituacao);
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
  const simplesNacional = /optante\s+pelo\s+simples\s+nacional|situacao\s+no\s+simples\s+nacional\W{0,8}optante/i.test(norm)
    && !/nao\s+optante\s+pelo\s+simples\s+nacional|exclu[ií]d[oa]\s+do\s+simples/i.test(norm);
  const simei = /optante\s+pelo\s+simei|situacao\s+no\s+simei\W{0,8}optante|certificado\s+da\s+condicao\s+de\s+microempreendedor\s+individual/i.test(norm);
  const { regime: regimeViaDarf, codigoNaoConfirmado } = regimeViaCodigoReceitaDarf(texto);
  // Imune/isenta só conta quando o texto fala do regime, não quando a palavra
  // aparece solta (ex: "isenta de multa").
  const imuneIsenta = /regime\s+(?:tribut[aá]rio\s+)?(?:de\s+)?(?:imunidade|isen[cç][aã]o)/i.test(texto)
    || /(?:imune|isenta)\s+(?:de\s+)?(?:irpj|tributa[cç][aã]o|impostos)/i.test(texto);

  const regimesEncontrados = new Set<string>([
    lucroReal ? 'Lucro Real' : null,
    lucroPresumido ? 'Lucro Presumido' : null,
    lucroArbitrado ? 'Lucro Arbitrado' : null,
    simplesNacional ? 'Simples Nacional' : null,
    simei ? 'MEI / SIMEI' : null,
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
  const ccmei = /certificado da condi[cç][aã]o de microempreendedor individual|\bccmei\b/i.test(texto);
  const compativel = norm.includes('simples nacional') || norm.includes('consulta optantes') || norm.includes('simei')
    || ccmei
    || norm.includes('lucro presumido') || norm.includes('lucro real') || norm.includes('lucro arbitrado')
    || norm.includes('regime tributario') || norm.includes('regime de apuracao')
    // DARF de IRPJ (guia de referência do usuário): não cita o regime por
    // extenso, só o código de receita -- ver detectarRegimeTributarioDeclarado.
    || (norm.includes('darf') && norm.includes('codigo de receita'));
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const naoOptante = /n[aã]o\s+optante\s+pelo\s+simples\s+nacional/i.test(texto) || /situacao\s+no\s+simples\s+nacional\W{0,8}nao\s+optante/i.test(norm);
  const excluido = /exclu[ií]d[oa]\s+do\s+simples/i.test(texto) || norm.includes('exclusao do simples nacional efetivada');
  const optante = !naoOptante && !excluido && (/optante\s+pelo\s+simples\s+nacional/i.test(texto) || /situacao\s+no\s+simples\s+nacional\W{0,8}optante/i.test(norm));
  // O CCMEI é, por definição do próprio documento, comprovação da condição
  // de MEI. Ele não precisa repetir a frase exata "Optante pelo SIMEI" para
  // ser aceito no campo de enquadramento tributário de uma empresa MEI.
  const simei = ccmei || /optante\s+pelo\s+simei/i.test(texto) || norm.includes('situacao no simei optante');
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
      documento_ccmei: ccmei,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}


function parseContratoSocialAlteracao(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto);
  // Sinal textual: vocabulário comum de instrumentos societários (não é uma
  // frase exclusiva de uma Junta ou UF). Assim como em parseAtosJunta, este
  // é apenas um dos sinais de evidência -- não decide sozinho a identidade.
  const indicadorTextual = /contrato social|alteracao contratual|alteração contratual|consolidacao contratual|consolidação contratual|instrumento particular de alteracao|instrumento particular de alteração/.test(norm);
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['nome empresarial', 'razão social', 'razao social']))
    || limparValor(linhas.find((linha) => /\b(?:ltda|limitada|s\/a|sa|eireli)\b/i.test(linha) && !/sociedade empresaria|sociedade empresária/i.test(linha)) || null);

  const nireExplicito = texto.match(/\bNIRE\s*[:\-]?\s*(\d{10,12})\b/i)?.[1] || null;
  const nireRegistro = texto.match(/(?:registrad[ao]|arquivad[ao]).{0,120}?(?:sob\s+(?:o\s+)?n[ºo°]?|nire)\s*[:\-]?\s*(\d{10,12})/is)?.[1] || null;
  const nire = nireExplicito || nireRegistro;

  // A certificação registral não segue uma única ordem de palavras entre
  // Juntas: algumas dizem "CERTIFICO O REGISTRO EM <data> SOB Nº <número>"
  // (ordem data-depois-número), outras "Certifico registro sob o nº <número>
  // em <data>" (ordem número-depois-data, ex.: JCDF). As duas variantes
  // certificam exatamente o mesmo fato -- reconhecer só uma delas fazia o
  // número de arquivamento de documentos genuínos ficar "não localizado".
  const numeroArquivamento = texto.match(/CERTIFICO\s+O\s+REGISTRO\s+EM\s+\d{2}\/\d{2}\/\d{4}(?:\s+\d{1,2}:\d{2})?\s+SOB\s+N[ºO°]?\s*(\d{5,15})/i)?.[1]
    || texto.match(/CERTIFICO\s+(?:O\s+)?REGISTRO\s+SOB\s+(?:O\s+)?N[ºO°]?\s*(\d{5,15})\s+EM\s+\d{2}\/\d{2}\/\d{4}/i)?.[1]
    || texto.match(/\bprotocolo\s*[:\-]?\s*(\d{5,15})\b/i)?.[1]
    || null;
  // Rodada 38: a data registral do ATO ATUAL só pode vir da certificação
  // registral / rótulo explícito. O texto do contrato costuma narrar registros
  // históricos da própria empresa ("arquivada ... em sessão de 30/08/2023");
  // usar essa narrativa como data do ato atual fazia uma alteração de 2025 ser
  // tratada como se tivesse sido registrada em 2023. Isso quebra exatamente o
  // confronto Junta -> última alteração -> contrato correspondente.
  const dataRegistro = parseDate(
    texto.match(/CERTIFICO\s+O\s+REGISTRO\s+EM\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]
      || texto.match(/(?:CERTIFICO|JUNTA\s+COMERCIAL|REGISTRO\s+DIGITAL)[\s\S]{0,240}?(?:REGISTRO|ARQUIVAMENTO)[\s\S]{0,80}?EM\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]
      || valorAposRotulo(linhas, ['data de registro', 'data do registro', 'data de arquivamento']),
  );
  const dataEfeitos = parseDate(texto.match(/COM\s+EFEITOS\s+DO\s+REGISTRO\s+EM\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null);
  const dataDocumento = parseDate(texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/)?.[1] || null);
  const dataDocumentoPorExtenso = parseDataPorExtenso(
    texto.match(/(?:Goi[aâ]nia|Bras[ií]lia|[A-ZÀ-Ú][\wÀ-ú\s]+)[\s\-\/]*[A-Z]{2}\s*,?\s*(\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4})/i)?.[1]
      || null,
  ) || dataDocumento;
  const blocoAssinatura = texto.match(/(?:assinam|assinado|assinatura eletr[oô]nica|identifica[cç][aã]o do\(s\) assinante\(s\))[\s\S]{0,900}/i)?.[0] || '';
  const assinaturaEletronica = /assinatura eletr[oô]nica|assinado digitalmente|consta assinado digitalmente/i.test(blocoAssinatura);
  const assinaturaDeclarada = /assinam o presente instrumento|assinado por todos de direito|assinatura/i.test(texto);
  const assinaturas = assinaturaDeclarada
    ? [{ presente: true, tipo: assinaturaEletronica ? 'eletronica' : 'declarada', evidencia: blocoAssinatura.replace(/\s+/g, ' ').trim().slice(0, 500) }]
    : [];

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
      // O rótulo ("sócio"/"administrador"/"titular") é reconhecido sem
      // diferenciar maiúsculas/minúsculas, mas o NOME capturado depois dele
      // precisa ser genuinamente maiúsculo -- é assim que o padrão distingue
      // um nome próprio de uma palavra comum. Aplicar a mesma flag "i" da
      // busca do rótulo também à captura do nome (como antes) fazia o
      // próprio texto do rótulo (ex.: "Sócio - administrador", sem nome
      // nenhum depois) ser capturado como se "administrador" fosse o nome.
      const rotuloMatch = linha.match(/(?:s[oó]ci[oa](?:\s*-?administrador[ae]?)?|administrador[ae]?|titular)\s*[:\-]\s*/i);
      const depoisRotulo = rotuloMatch
        ? linha.slice(rotuloMatch.index! + rotuloMatch[0].length).match(/^([A-ZÀ-Ú][A-ZÀ-Ú\s]{4,100})/)?.[1]
        : undefined;
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
  const confianca = clamp((indicadorTextual ? 0.15 : 0) + (nire ? 0.2 : 0) + (dataRegistro ? 0.2 : 0) + (preenchidos / campos.length) * 0.15 + (socios.length ? 0.15 : 0) + (alteracoesSocietarias.length ? 0.15 : 0));

  // Identidade por evidência: um NIRE ou número de arquivamento extraído por
  // rótulo/certificação explícita é, por si só, prova de registro mercantil
  // -- independente de a Junta emissora usar exatamente as frases acima.
  // Uma reconstrução societária real (quadro final ou movimentação de
  // quotas com data de registro) também confirma o documento mesmo sem o
  // indicador textual. Ausência de todas as evidências é que caracteriza
  // incompatibilidade real.
  const evidenciasIdentidade: string[] = [];
  if (indicadorTextual) evidenciasIdentidade.push('indicador_textual');
  if (nire) evidenciasIdentidade.push('nire');
  if (numeroArquivamento) evidenciasIdentidade.push('numero_arquivamento');
  if ((quadroSocietarioFinal.length || alteracoesSocietarias.length) && dataRegistro) evidenciasIdentidade.push('reconstrucao_societaria');
  const compativel = evidenciasIdentidade.length > 0;

  return {
    dados: {
      documento_compativel: compativel,
      documento_identidade_evidencias: evidenciasIdentidade,
      cnpj,
      razao_social: razaoSocial,
      nire,
      tipo_ato: tipoAto,
      data_registro: dataRegistro,
      data_efeitos_registro: dataEfeitos,
      data_documento: dataDocumentoPorExtenso,
      numero_arquivamento: numeroArquivamento,
      registro_atual_comprovado: Boolean(dataRegistro && numeroArquivamento),
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
      assinaturas,
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
  const mesesPorNome: Record<string, string> = {
    janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
    julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
  };
  const mesesNumericos = linhasTexto(texto)
    .filter((linha) => !/\bcnpj\b/i.test(linha))
    .filter((linha) => !/\b\d{2}\/\d{2}\/20\d{2}\b/.test(linha) || /r\$|faturamento|compet[eê]ncia|refer[eê]ncia/i.test(linha))
    .flatMap((linha) => Array.from(linha.matchAll(/\b(0?[1-9]|1[0-2])\s*[\/.\-]\s*(20\d{2}|\d{2})\b/g)))
    .map((match) => `${match[2].length === 2 ? `20${match[2]}` : match[2]}-${match[1].padStart(2, '0')}`);
  const linhasFaturamento = linhasTexto(texto).filter((linha) => /R\$|faturamento mensal|m[eê]s\/ano/i.test(linha));
  const mesesPorExtenso = Array.from(linhasFaturamento.join('\n').matchAll(/\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})\b/gi))
    .map((match) => `${match[2]}-${mesesPorNome[textoNormalizado(match[1])] || '01'}`);
  const mesesReferencia = Array.from(new Set([...mesesNumericos, ...mesesPorExtenso])).sort();
  const competenciasMensais = linhasFaturamento.flatMap((linha) => {
    const match = linha.match(/\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})\b/i);
    if (!match) return [];
    const competencia = `${match[2]}-${mesesPorNome[textoNormalizado(match[1])] || '01'}`;
    const valor = numeroMonetario(linha.match(/R\$\s*[-\d.]+(?:,\d{1,2})?/)?.[0] || '');
    return valor === null ? [] : [{ competencia, valor }];
  }).filter((item, indice, lista) => lista.findIndex((candidato) => candidato.competencia === item.competencia) === indice);
  const totalDoPeriodo = numeroMonetario(linhasFaturamento.find((linha) => /total\s+do\s+per[ií]odo/i.test(linha))?.match(/R\$\s*[-\d.]+(?:,\d{1,2})?/)?.[0] || '')
    || (competenciasMensais.length ? Math.round(competenciasMensais.reduce((total, item) => total + item.valor, 0) * 100) / 100 : null);
  const periodoAnalisado = texto.match(/per[ií]odo\s+apurado\s*:\s*(20\d{2}\/\d{2})\s+a\s+(20\d{2}\/\d{2})/i)?.slice(1) || null;
  const dataDocumento = parseDataPorExtenso(
    texto.match(/emitid[oa]\s+em\s*:\s*([^\n\r]+)/i)?.[1]
      || texto.match(/\bBras[ií]lia\s*[-–—]\s*[^,\n]+,\s*([^\n\r]+)/i)?.[1]
      || null,
  );
  // O modelo oficial da declaração pode imprimir os nomes e, na linha
  // seguinte, apenas os cargos "Contador Responsável" e "Representante
  // Legal", sem a palavra literal "assinatura". Esse bloco é evidência dos
  // dois signatários quando vem acompanhado do CRC/CNPJ do documento.
  const assinaturaPorCargo = /contador(?:a)?\s+respons[aá]vel[\s\S]{0,120}representante\s+legal|representante\s+legal[\s\S]{0,120}contador(?:a)?\s+respons[aá]vel/i.test(texto)
    && /\bcrc\b|contador(?:a)?\s+respons[aá]vel/i.test(texto);
  const assinaturaMatch = texto.match(/(?:data\s+(?:de|da)\s+assinatura|assinad[oa]|assinatura|firmad[oa]).{0,80}?((?:\d{2}\/\d{2}\/20\d{2})|(?:\d{1,2}\s+de\s+[a-zç]+\s+de\s+20\d{2}))/is);
  const dataAssinatura = parseDataPorExtenso(assinaturaMatch?.[1] || null) || (assinaturaPorCargo ? dataDocumento : null);
  const eletronica = /assinado\s+(?:de\s+forma\s+)?(?:digital|eletronic)|assinatura\s+(?:digital|eletronic)|icp[\s-]*brasil|gov\.br/i.test(texto);
  const manual = /assinatura\s+manual|assinado\s+manualmente|assinatura\s+manuscrita/i.test(texto);
  const tipoAssinatura = eletronica ? 'eletronica' : manual ? 'manual' : null;
  const nomeSocioAssinatura = texto.match(/assinado\s+digitalmente\s+([A-ZÀ-Ý][A-ZÀ-Ý ]{4,80})/)?.[1] || null;
  const nomeContadorAssinatura = texto.match(/\b([A-ZÀ-Ý][A-ZÀ-Ý ]{8,80})\s+gov\.?\s*br\b/)?.[1] || null;
  const nomeSocio = limparValor(nomeSocioAssinatura
    || texto.match(/(?:s[oó]cio(?:\s*-?administrador)?|representante\s+legal)\s*[:\-]\s*([^\n\r]{4,100})/i)?.[1]
    || null);
  const nomeContador = limparValor(nomeContadorAssinatura
    || texto.match(/(?:contador(?:a)?|respons[aá]vel\s+cont[aá]bil)\s*[:\-]\s*([^\n\r]{4,100})/i)?.[1]
    || null);
  const temSocio = /s[oó]cio(?:\s*-?administrador)?|administrador|representante\s+legal/i.test(texto)
    && (/assinatura|assinado|firmado/i.test(texto) || assinaturaPorCargo);
  const temContador = /contador|crc|respons[aá]vel\s+cont[aá]bil/i.test(texto)
    && (/assinatura|assinado|firmado/i.test(texto) || assinaturaPorCargo);
  const confianca = clamp((compativel ? 0.25 : 0) + (cnpj ? 0.2 : 0) + (mesesReferencia.length ? 0.25 : 0) + (dataDocumento ? 0.1 : 0) + (dataAssinatura ? 0.1 : 0) + (temSocio ? 0.05 : 0) + (temContador ? 0.05 : 0));
  return {
    dados: {
      documento_compativel: compativel,
      cnpj,
      meses_referencia: mesesReferencia,
      competencias_mensais: competenciasMensais,
      total_12_meses: totalDoPeriodo,
      periodo_analisado: periodoAnalisado,
      data_documento: dataDocumento,
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
  // Sinal textual institucional: vocabulário comum a Juntas Comerciais de
  // qualquer UF (nomes de sistema, rótulos de certidão/extrato), nunca o
  // nome de uma Junta específica. Isso é apenas UM dos sinais de evidência;
  // sozinho ele não decide mais a identidade do documento (ver abaixo).
  const indicadorTextual = norm.includes('junta comercial') || norm.includes('lista de arquivamentos') || norm.includes('certidao simplificada') || norm.includes('servicos web') || norm.includes('nire') || norm.includes('registro mercantil') || norm.includes('redesim') || norm.includes('extrato de atos');
  const cnpj = formatarCnpj(primeiroCnpj(texto));
  // A linha "solta" só é aceita como nome empresarial quando NÃO é, ela mesma,
  // um cabeçalho de tipo de ato/evento (ex.: "ATO CONSTITUTIVO - EIRELI",
  // "TRANSFORMAÇÃO AUTOMÁTICA DE EIRELI EM LTDA...") -- documentos que só
  // listam "Atos disponíveis" (sem nenhum campo de nome empresarial) não têm
  // como ter o nome inferido dali; extrair "não localizado" é mais correto
  // do que inventar um nome a partir do título de um ato.
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['nome empresarial', 'razão social', 'razao social']))
    || limparValor(linhas.find((linha) => /\b(?:ltda|limitada|eireli|s\/?a)\b/i.test(linha) && !/qualificacao|socio|administrador|alterac|consolidac|constitu|transformac|extinc|enquadramento|evento|adicionar|data de aprova/i.test(linha)) || null);
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
    if (!tipo || !/(alterac|contrato|consolidac|enquadramento|constitu|transformac|extinc|\bata\b|ordem judicial)/.test(textoNormalizado(tipo))) continue;
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
    if (!/(alterac|contrato|consolidac|enquadramento|arquivamento|constitu|transformac|extinc|\bata\b|ordem judicial)/.test(contextoNorm)) continue;
    const numeroMatch = linha.match(/(?:numero|número|arquivamento)?\s*[:\-]?\s*(\d{5,15})\b/i)
      || contexto.match(/(?:numero|número|arquivamento)?\s*[:\-]?\s*(\d{5,15})\b/i);
    let tipoAto: string | null = null;
    const aposData = linha.slice((dataMatch.index || 0) + dataMatch[0].length).replace(/^\s*[-–—|:]\s*/, '').trim();
    if (/(alterac|contrato|consolidac|enquadramento|constitu|ordem judicial|transformac|extinc|\bata\b)/.test(textoNormalizado(aposData))) {
      tipoAto = limparValor(aposData);
    }
    const candidatosTipo = [linhas[i - 1], linhas[i + 1], linhas[i - 2], linhas[i + 2]].filter(Boolean);
    for (const candidato of candidatosTipo) {
      if (tipoAto) break;
      const n = textoNormalizado(candidato);
      if (/(alterac|contrato|consolidac|enquadramento|constitu|ordem judicial|transformac|extinc|\bata\b)/.test(n)) {
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
    const constituicao = historicoUnico.find((item) => /registro|constitu|contrato/.test(textoNormalizado(item.tipo_ato || '')) && onlyDigits(item.numero).length >= 10);
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
  const confianca = clamp((indicadorTextual ? 0.25 : 0) + (nire ? 0.3 : 0) + (historicoUnico.length ? 0.35 : 0) + (razaoSocial || cnpj ? 0.1 : 0));

  // A identidade do documento é decidida por evidência, não por uma frase
  // literal fixa: Juntas diferentes usam rótulos e sistemas diferentes
  // ("REDESIM", "Serviços Web", "Extrato de Atos" etc.) e um documento real
  // de Atos da Junta não pode ser marcado como incompatível só porque o
  // texto não repete uma das frases específicas acima. O NIRE (número de
  // registro na Junta, extraído por rótulo) e um histórico de arquivamentos
  // genuinamente estruturado (data + ato) são, cada um, evidência
  // suficiente por si só de que este É um documento de registro mercantil
  // -- mesmo sem o indicador textual. Incompatibilidade real (nenhuma das
  // evidências abaixo presente) continua sendo reportada como tal.
  const evidenciasIdentidade: string[] = [];
  if (indicadorTextual) evidenciasIdentidade.push('indicador_textual');
  if (nire) evidenciasIdentidade.push('nire');
  if (historicoUnico.length) evidenciasIdentidade.push('historico_arquivamentos');
  const compativel = evidenciasIdentidade.length > 0;

  return {
    dados: {
      documento_compativel: compativel,
      documento_identidade_evidencias: evidenciasIdentidade,
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
  const fiscal = parseDocumentoGenerico(texto, tipoEsperado === 'pgdas_d' ? 'pgdas' : tipoEsperado);
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
      ...fiscal.dados,
      ...base.dados,
      receita_bruta: base.dados.receita_bruta ?? fiscal.dados.receita_bruta ?? null,
      receita_bruta_pa: base.dados.receita_bruta_pa ?? fiscal.dados.receita_bruta_pa ?? null,
      rbt12: base.dados.rbt12 ?? fiscal.dados.rbt12 ?? null,
      regime_de_apuracao: fiscal.dados.regime_de_apuracao ?? null,
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

function numeroSped(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalizado = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function periodoSped(texto: string): { inicio: string | null; fim: string | null } {
  const datas = Array.from(String(texto || '').matchAll(/\b(\d{2})(\d{2})(20\d{2})\b/g))
    .map((match) => parseDate(`${match[1]}/${match[2]}/${match[3]}`))
    .filter((value): value is string => Boolean(value));
  return { inicio: datas[0] || null, fim: datas[1] || datas[0] || null };
}

function parseEfdContribuicoes(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = String(texto || '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  const parseRegistro = (codigo: 'M400' | 'M800') => linhas
    .filter((linha) => linha.startsWith(`|${codigo}|`))
    .map((linha) => {
      const campos = linha.split('|');
      return {
        codigo_natureza_receita: campos[2] || null,
        valor_total_receita: numeroSped(campos[3]),
        codigo_conta: campos[4] || null,
        descricao_complementar: campos[5] || null,
      };
    })
    .filter((registro) => registro.valor_total_receita !== null);
  const m400 = parseRegistro('M400');
  const m800 = parseRegistro('M800');
  const totalM400 = m400.reduce((total, item) => total + Number(item.valor_total_receita || 0), 0);
  const totalM800 = m800.reduce((total, item) => total + Number(item.valor_total_receita || 0), 0);
  const possuiAmbos = m400.length > 0 && m800.length > 0;
  const tolerancia = Math.max(0.01, Math.max(totalM400, totalM800) * 0.005);
  const conciliado = possuiAmbos ? Math.abs(totalM400 - totalM800) <= tolerancia : null;
  const periodo = periodoSped(texto);
  const compativel = /\|m400\||\|m800\||efd[- ]?contribui[cç][oõ]es/i.test(texto);
  const confianca = clamp((compativel ? 0.4 : 0) + (m400.length ? 0.2 : 0) + (m800.length ? 0.2 : 0) + (periodo.inicio ? 0.1 : 0) + (conciliado === true ? 0.1 : 0));
  return {
    dados: {
      documento_compativel: compativel,
      tipo_detectado: compativel ? 'efd_contribuicoes' : null,
      competencia: periodo,
      registros_m400: m400,
      registros_m800: m800,
      total_receitas_nao_tributadas_pis_m400: totalM400,
      total_receitas_nao_tributadas_cofins_m800: totalM800,
      totais_m400_m800_conciliados: conciliado,
      // M400 e M800 representam blocos distintos (PIS e COFINS) da mesma
      // base econômica. Nunca são somados entre si como se fossem receitas
      // diferentes; quando conciliados, o valor é exposto uma única vez.
      receita_nao_tributada_confirmada: conciliado === true ? totalM400 : null,
      revisao_humana_necessaria: !m400.length || !m800.length || conciliado !== true,
      motivo_revisao_humana: !m400.length || !m800.length
        ? 'A EFD-Contribuições não contém ambos os registros M400 e M800 legíveis.'
        : conciliado !== true
          ? 'Os totais dos registros M400 e M800 divergem além da tolerância de 0,5%.'
          : null,
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

function parseEfdIcmsIpi(texto: string): { dados: Record<string, any>; confianca: number } {
  const linhas = String(texto || '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  const registros = linhas.filter((linha) => linha.startsWith('|E110|')).map((linha) => {
    const campos = linha.split('|');
    return {
      total_debitos: numeroSped(campos[2]),
      ajustes_debitos: numeroSped(campos[4]),
      estornos_creditos: numeroSped(campos[5]),
      total_creditos: numeroSped(campos[6]),
      ajustes_creditos: numeroSped(campos[8]),
      estornos_debitos: numeroSped(campos[9]),
      saldo_credor_anterior: numeroSped(campos[10]),
      saldo_devedor: numeroSped(campos[11]),
      deducoes: numeroSped(campos[12]),
      icms_recolher: numeroSped(campos[13]),
      saldo_credor_transportar: numeroSped(campos[14]),
      debitos_especiais: numeroSped(campos[15]),
    };
  });
  const periodo = periodoSped(texto);
  const compativel = registros.length > 0 || /efd.{0,30}icms.{0,10}ipi|escrituracao fiscal digital.{0,80}(?:icms|ipi)/i.test(texto);
  const confianca = clamp((compativel ? 0.5 : 0) + (registros.length ? 0.35 : 0) + (periodo.inicio ? 0.15 : 0));
  return {
    dados: {
      documento_compativel: compativel,
      tipo_detectado: compativel ? 'efd_icms_ipi' : null,
      competencia: periodo,
      registros_e110: registros,
      revisao_humana_necessaria: registros.length === 0,
      motivo_revisao_humana: registros.length ? null : 'Nenhum registro E110 legível foi localizado.',
      confianca,
      fonte_extracao: 'local_deterministica',
    },
    confianca,
  };
}

/**
 * Extração local neutra para tipos que não têm parser determinístico próprio.
 *
 * Só promove valores precedidos por rótulos explícitos e nunca afirma que o
 * documento é compatível com o slot. A identidade continua sendo decidida
 * pelo classificador central usando o texto integral; se ele não a comprovar,
 * o laudo permanece em revisão. Isso evita executar o parser de contrato
 * social em arquivos de outra natureza quando a IA externa está indisponível.
 */
function parseDocumentoGenerico(texto: string, tipoDocumentoEsperado?: string): { dados: Record<string, any>; confianca: number } {
  const linhas = linhasTexto(texto);
  // O tipo esperado seleciona somente a ficha de campos a procurar. Ele não
  // é usado para declarar identidade ou compatibilidade: essa decisão
  // continua no classificador determinístico, a partir do conteúdo real.
  const perfil = obterPerfilAnaliseDocumental(tipoDocumentoEsperado || 'outros');
  const esperadoCpf = /(?:^|[_ -])cpf(?:$|[_ -])/i.test(String(tipoDocumentoEsperado || ''));
  const cnpj = esperadoCpf ? null : formatarCnpj(primeiroCnpjOuBase(texto));
  const cpf = texto.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0] || null;
  const razaoSocial = limparValor(valorAposRotulo(linhas, ['razão social', 'razao social', 'nome empresarial']));
  const entidadeConsultada = limparValor(valorAposRotulo(linhas, ['entidade consultada', 'contribuinte consultado', 'titular consultado'])) || razaoSocial;
  const orgaoEmissor = limparValor(valorAposRotulo(linhas, ['órgão emissor', 'orgao emissor', 'órgão expedidor', 'orgao expedidor']));
  const numeroDocumento = limparValor(valorAposRotulo(linhas, ['número do documento', 'numero do documento', 'número da certidão', 'numero da certidao']));
  const protocolo = limparValor(valorAposRotulo(linhas, [
    'recibo ou protocolo', 'número do recibo', 'numero do recibo', 'número da declaração',
    'numero da declaracao', 'número da apuração', 'numero da apuracao', 'protocolo',
  ]));
  const orgaoRegistro = limparValor(valorAposRotulo(linhas, ['órgão de registro', 'orgao de registro', 'cartório', 'cartorio', 'serventia']));
  const numeroRegistro = limparValor(valorAposRotulo(linhas, ['número do registro', 'numero do registro', 'registro nº', 'registro n°', 'número de ordem', 'numero de ordem']));
  const secionalOab = limparValor(valorAposRotulo(linhas, ['seccional da oab', 'seccional oab', 'conselho seccional']));
  const situacaoRegistro = limparValor(valorAposRotulo(linhas, ['situação do registro', 'situacao do registro', 'status do registro']));
  const dataEmissao = dataProximaDe(
    texto,
    /(?:data\s+(?:de|da)\s+emiss[aã]o|emitid[oa]\s+em|data\s+da\s+consulta)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  )
    // Certidões RFB/PGFN usam “Emitida às HH:MM:SS do dia DD/MM/AAAA”.
    // Horário e “do dia” fazem parte da evidência da própria emissão.
    || parseDate(texto.match(/emitid[oa]\s+às?\s+\d{1,2}:\d{2}(?::\d{2})?\s+do\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null)
    || parseDate(texto.match(/emitid[oa]\s+por\s*:[^\n\r]{0,100}?\b(\d{2}\/\d{2}\/\d{4})\b/i)?.[1] || null);
  const dataValidade = dataProximaDe(
    texto,
    /(?:data\s+(?:de|da)\s+validade|v[aá]lid[oa]\s+at[eé]|vencimento)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  );
  const dataRegistro = dataProximaDe(
    texto,
    /(?:data\s+(?:do|de)\s+registro|registrad[oa]\s+em)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  );
  // Recibos PGDAS apresentam a competência em tabela, com várias colunas
  // entre o rótulo e MM/AAAA. O formato da data continua restrito.
  const competenciaMatch = texto.match(/(?:compet[eê]ncia|per[ií]odo\s+de\s+apura[cç][aã]o|m[eê]s\s+de\s+refer[eê]ncia)\D{0,500}(?:(\d{1,2})\s*[\/\-])?(0?[1-9]|1[0-2])\s*[\/\-]\s*(20\d{2})/i)
    // No recibo PGDAS o rótulo e a competência ficam em uma tabela cuja
    // coluna intermediária pode conter números e pontuação. Nesse formato,
    // capture somente a célula isolada MM/AAAA da linha tabular.
    || texto.match(/(?:^|\n)\s*(0?[1-9]|1[0-2])\/(20\d{2})(?=\s|$)/m);
  let competencia: { inicio: string; fim: string } | null = null;
  if (competenciaMatch) {
    const formatoComRotulo = Boolean(competenciaMatch[3]);
    const mes = Number(formatoComRotulo ? competenciaMatch[2] : competenciaMatch[1]);
    const ano = Number(formatoComRotulo ? competenciaMatch[3] : competenciaMatch[2]);
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    competencia = {
      inicio: `${ano}-${String(mes).padStart(2, '0')}-01`,
      fim: `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
    };
  }
  const situacaoCertidao = /positiva\s+com\s+efeito(?:s)?\s+de\s+negativa/i.test(texto)
    ? 'positiva_com_efeito_negativo'
    : /certid[aã]o\s+positiva|situa[cç][aã]o\D{0,20}positiv[ao]/i.test(texto)
      ? 'positiva'
      : /certid[aã]o\s+negativa|nada\s+consta|situa[cç][aã]o\D{0,20}negativ[ao]/i.test(texto)
        ? 'negativa'
        : null;
  const resultadoConsulta = limparValor(valorAposRotulo(linhas, ['resultado da consulta', 'resultado', 'situação', 'situacao']));
  const valorRotulado = limparValor(valorAposRotulo(linhas, ['valor total', 'total geral', 'valor da operação', 'valor da operacao']));
  const valorTotal = valorRotulado ? numeroMonetario(valorRotulado) : null;
  const dataConsulta = dataProximaDe(
    texto,
    /(?:data(?:\s+e\s+hora)?\s+(?:de|da)\s+consulta|consultad[oa]\s+em|data[- ]base)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  ) || dataEmissao;
  const dataDocumento = dataProximaDe(
    texto,
    /(?:data\s+(?:do|de)\s+documento|celebrad[oa]\s+em|firmad[oa]\s+em)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  );
  const dataAssinatura = dataProximaDe(
    texto,
    /(?:data\s+(?:de|da)\s+assinatura|assinad[oa]\s+em)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  ) || dataDocumento;
  const dataVencimento = dataProximaDe(
    texto,
    /(?:data\s+(?:de|do)\s+vencimento|vencimento)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  );
  const dataPagamento = dataProximaDe(
    texto,
    /(?:data\s+(?:de|do)\s+pagamento|pag[oa]\s+em)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  );
  const dataTransmissao = dataProximaDe(
    texto,
    /(?:data(?:\s+e\s+hor[aá]rio)?\s+(?:de|da)\s+transmiss[aã]o|transmitid[oa]\s+em)\D{0,45}(\d{2}\/\d{2}\/\d{4})/i,
  );
  const anoCalendarioRaw = texto.match(/(?:ano[- ]calend[aá]rio|exerc[ií]cio)\D{0,20}(20\d{2})/i)?.[1] || null;
  const dataBaseRaw = texto.match(/(?:data[- ]base|m[eê]s\s+de\s+refer[eê]ncia|posi[cç][aã]o\s+em)\D{0,30}((?:\d{2}\/\d{2}\/20\d{2})|(?:0?[1-9]|1[0-2])\/20\d{2})/i)?.[1] || null;
  const dataBase = dataBaseRaw && /^\d{2}\/\d{2}\/\d{4}$/.test(dataBaseRaw) ? parseDate(dataBaseRaw) : dataBaseRaw;
  const nire = limparValor(valorAposRotulo(linhas, ['nire', 'número de identificação do registro de empresas', 'numero de identificacao do registro de empresas']));
  const nome = limparValor(valorAposRotulo(linhas, ['nome completo', 'nome do titular', 'titular', 'nome']));
  const titular = limparValor(valorAposRotulo(linhas, ['nome do empresário', 'nome do empresario', 'empresário', 'empresario', 'titular']));
  const enderecoCompleto = limparValor(valorAposRotulo(linhas, ['endereço completo', 'endereco completo', 'endereço', 'endereco', 'sede']));
  const objeto = limparValor(valorAposRotulo(linhas, ['objeto do contrato', 'objeto social', 'objeto', 'finalidade']));
  const contratante = limparValor(valorAposRotulo(linhas, ['contratante', 'tomador']));
  const contratado = limparValor(valorAposRotulo(linhas, ['contratado', 'prestador']));
  const partes = [contratante, contratado].filter(Boolean);
  const outorgante = limparValor(valorAposRotulo(linhas, ['outorgante']));
  const outorgado = limparValor(valorAposRotulo(linhas, ['outorgado', 'procurador']));
  const poderes = limparValor(valorAposRotulo(linhas, ['poderes outorgados', 'poderes', 'finalidade da procuração', 'finalidade da procuracao']));
  const capitalSocialRaw = limparValor(valorAposRotulo(linhas, ['capital social', 'capital']));
  const linhaReceitaPa = linhas.find((linha) => /receita\s+bruta\s+do\s+pa/i.test(linha)) || null;
  const valoresReceitaPa = linhaReceitaPa?.match(/(?:R\$\s*)?[-\d.]+(?:,\d{1,2})?/g) || [];
  const receitaBrutaRaw = limparValor(valoresReceitaPa.find((valor) => /\d/.test(valor)) || '')
    || limparValor(valorAposRotulo(linhas, ['receita bruta total', 'total de receitas brutas', 'receita bruta', 'faturamento bruto']));
  const linhaRbt12 = linhas.find((linha) => /receita\s+bruta\s+acumulada\s+nos\s+doze\s+meses\s+anteriores/i.test(linha) && /\d/.test(linha)) || null;
  const valoresRbt12 = linhaRbt12?.match(/(?:R\$\s*)?[-\d.]+(?:,\d{1,2})?/g) || [];
  const rbt12Raw = limparValor(valoresRbt12.at(-1) || '');
  const scoreRaw = limparValor(valorAposRotulo(linhas, ['score', 'pontuação', 'pontuacao']));
  const saldoRaw = limparValor(valorAposRotulo(linhas, ['saldo total', 'saldo devedor', 'saldo final', 'saldo']));
  const limiteRaw = limparValor(valorAposRotulo(linhas, ['limite total', 'limite de crédito', 'limite de credito', 'limite']));
  const codigoReceita = limparValor(valorAposRotulo(linhas, ['código de receita', 'codigo de receita', 'código da receita', 'codigo da receita']));
  const codigoAutenticidade = limparValor(valorAposRotulo(linhas, ['código de autenticidade', 'codigo de autenticidade', 'código de controle', 'codigo de controle', 'autenticação', 'autenticacao']));
  const naturezaJuridica = limparValor(valorAposRotulo(linhas, ['natureza jurídica', 'natureza juridica']));
  const regimeTributario = limparValor(valorAposRotulo(linhas, ['regime tributário', 'regime tributario', 'forma de tributação', 'forma de tributacao']));
  const regimeDeApuracao = limparValor(valorAposRotulo(linhas, ['regime de apuração', 'regime de apuracao']));
  const condicaoMei = /certificado da condi[cç][aã]o de microempreendedor individual|\bccmei\b/i.test(texto)
    ? true
    : null;
  const assinaturas = /assinad[oa]|assinatura|icp[\s-]*brasil|gov\.br/i.test(texto)
    ? { presente: true }
    : null;

  const camposComprovados = Object.fromEntries(Object.entries({
    cnpj,
    cpf,
    nome,
    titular,
    nome_empresarial: razaoSocial,
    razao_social: razaoSocial,
    entidade_consultada: entidadeConsultada,
    endereco_completo: enderecoCompleto,
    orgao_emissor: orgaoEmissor,
    numero_documento: numeroDocumento,
    numero_certidao: numeroDocumento,
    recibo_ou_protocolo: protocolo,
    orgao_registro: orgaoRegistro,
    numero_registro: numeroRegistro,
    registro: numeroRegistro,
    nire,
    secional_oab: secionalOab,
    situacao_registro: situacaoRegistro,
    data_registro: dataRegistro,
    data_emissao: dataEmissao,
    data_validade: dataValidade,
    data_consulta: dataConsulta,
    data_documento: dataDocumento,
    data_assinatura: dataAssinatura,
    data_vencimento: dataVencimento,
    data_pagamento: dataPagamento,
    data_transmissao: dataTransmissao,
    data_base: dataBase,
    ano_calendario: anoCalendarioRaw ? Number(anoCalendarioRaw) : null,
    competencia,
    periodo: competencia,
    situacao_certidao: situacaoCertidao,
    resultado_consulta: resultadoConsulta,
    situacao: resultadoConsulta,
    valor_total: valorTotal,
    partes: partes.length ? partes : null,
    objeto,
    objeto_social: objeto,
    finalidade: objeto,
    outorgante,
    outorgado,
    poderes,
    capital_social: capitalSocialRaw ? numeroMonetario(capitalSocialRaw) : null,
    receita_bruta: receitaBrutaRaw ? numeroMonetario(receitaBrutaRaw) : null,
    score: scoreRaw ? numeroInteiroBrasileiro(scoreRaw) : null,
    saldo: saldoRaw ? numeroMonetario(saldoRaw) : null,
    limites: limiteRaw ? numeroMonetario(limiteRaw) : null,
    codigo_receita: codigoReceita,
    codigo_autenticidade: codigoAutenticidade,
    natureza_juridica: naturezaJuridica,
    regime_tributario: regimeTributario,
    regime_de_apuracao: regimeDeApuracao,
    receita_bruta_pa: receitaBrutaRaw ? numeroMonetario(receitaBrutaRaw) : null,
    rbt12: rbt12Raw ? numeroMonetario(rbt12Raw) : null,
    condicao_mei: condicaoMei,
    assinaturas,
  }).filter(([, valor]) => valor !== null && valor !== undefined && valor !== ''));

  const evidencias = Object.entries(camposComprovados).map(([campo, valor]) => {
    const valorTexto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    const linha = linhas.find((item) => item.toLocaleLowerCase('pt-BR').includes(valorTexto.toLocaleLowerCase('pt-BR')));
    return { campo, valor, pagina: null, trecho: (linha || valorTexto).slice(0, 1000), confianca: 0.72 };
  });
  const confianca = clamp(0.15 + Math.min(0.5, Object.keys(camposComprovados).length * 0.07));
  return {
    dados: {
      ...camposComprovados,
      campos_comprovados: camposComprovados,
      evidencias,
      validade: { inicio: dataEmissao, fim: dataValidade },
      perfil_leitura_interna: {
        tipo_documento: perfil.tipo,
        individual: perfil.perfilIndividual,
        campos_obrigatorios: perfil.camposObrigatorios,
        campos_quando_presentes: perfil.camposQuandoPresentes,
        politica_temporal: perfil.politicaTemporal,
      },
      confianca,
      fonte_extracao: 'local_deterministica_generica',
    },
    confianca,
  };
}

function parseDeclaracaoDefis(texto: string): { dados: Record<string, any>; confianca: number } {
  const base = parseDocumentoGenerico(texto, 'defis');
  const norm = textoNormalizado(texto);
  const periodoMatch = texto.match(/per[ií]odo\s+abrangido\s+pela\s+declara[cç][aã]o\s*:\s*(\d{2}\/\d{2}\/20\d{2})\s+a\s+(\d{2}\/\d{2}\/20\d{2})/i);
  const competencia = periodoMatch
    ? { inicio: parseDate(periodoMatch[1]), fim: parseDate(periodoMatch[2]) }
    : null;
  const anoCalendario = Number(texto.match(/ano[- ]calend[aá]rio\s+(20\d{2})/i)?.[1] || 0) || null;
  const numeroDeclaracao = limparValor(texto.match(/n[uú]mero\s+da\s+declara[cç][aã]o\s*:\s*([\d-]+)/i)?.[1] || null);
  const recibo = limparValor(texto.match(/n[uú]mero\s+do\s+recibo\s*:\s*([\d.\-]+)/i)?.[1] || null);
  const dataTransmissao = dataProximaDe(
    texto,
    /data\s+e\s+hor[aá]rio\s+da\s+transmiss[aã]o(?:\s+da\s+declara[cç][aã]o)?\D{0,45}(\d{2}\/\d{2}\/20\d{2})/i,
  );
  const optanteSimples = /optante\s+pelo\s+simples\s+nacional\s*:\s*sim/i.test(texto);
  const compativel = /declara[cç][aã]o\s+de\s+informa[cç][oõ]es\s+socioecon[oô]micas\s+e\s+fiscais|\bdefis\b/i.test(norm);
  const dados = {
    ...base.dados,
    documento_compativel: compativel,
    tipo_declaracao: 'DEFIS',
    ano_calendario: anoCalendario,
    competencia,
    periodo: competencia,
    numero_declaracao: numeroDeclaracao,
    recibo_ou_protocolo: recibo || numeroDeclaracao || base.dados.recibo_ou_protocolo || null,
    data_transmissao: dataTransmissao,
    regime_tributario: optanteSimples ? 'Simples Nacional' : null,
    opcao_simples: optanteSimples ? true : null,
    campos_comprovados: {
      ...(base.dados.campos_comprovados || {}),
      ...(numeroDeclaracao ? { numero_declaracao: numeroDeclaracao } : {}),
      ...(recibo ? { recibo_ou_protocolo: recibo } : {}),
      ...(anoCalendario ? { ano_calendario: anoCalendario } : {}),
      ...(competencia ? { competencia } : {}),
      ...(dataTransmissao ? { data_transmissao: dataTransmissao } : {}),
      ...(optanteSimples ? { regime_tributario: 'Simples Nacional' } : {}),
    },
    fonte_extracao: 'local_deterministica_especializada',
  };
  const confianca = clamp(base.confianca + (compativel ? 0.2 : 0) + (anoCalendario ? 0.08 : 0) + (recibo ? 0.08 : 0) + (dataTransmissao ? 0.05 : 0));
  return { dados, confianca };
}

function parseDeclaracaoDasnSimei(texto: string): { dados: Record<string, any>; confianca: number } {
  const base = parseDocumentoGenerico(texto, 'dasn_simei');
  const norm = textoNormalizado(texto);
  const anoCalendario = Number(texto.match(/ano[- ]calend[aá]rio\s+(20\d{2})/i)?.[1] || 0) || null;
  const recibo = limparValor(texto.match(/n[uú]mero\s+do\s+recibo\s*:\s*([\d.\-]+)/i)?.[1] || null);
  const dataTransmissao = dataProximaDe(texto, /data\s+e\s+hor[aá]rio\s+da\s+transmiss[aã]o\D{0,45}(\d{2}\/\d{2}\/20\d{2})/i);
  const compativel = /declara[cç][aã]o\s+anual\s+do\s+simei|\bdasn[- ]?simei\b/i.test(norm);
  const dados = {
    ...base.dados,
    documento_compativel: compativel,
    tipo_declaracao: 'DASN-SIMEI',
    ano_calendario: anoCalendario,
    recibo_ou_protocolo: recibo || base.dados.recibo_ou_protocolo || null,
    data_transmissao: dataTransmissao,
    campos_comprovados: {
      ...(base.dados.campos_comprovados || {}),
      ...(anoCalendario ? { ano_calendario: anoCalendario } : {}),
      ...(recibo ? { recibo_ou_protocolo: recibo } : {}),
      ...(dataTransmissao ? { data_transmissao: dataTransmissao } : {}),
    },
    fonte_extracao: 'local_deterministica_especializada',
  };
  const confianca = clamp(base.confianca + (compativel ? 0.2 : 0) + (anoCalendario ? 0.08 : 0) + (recibo ? 0.08 : 0));
  return { dados, confianca };
}

function parseCompartilhamentoEcac(texto: string): { dados: Record<string, any>; confianca: number } {
  const norm = textoNormalizado(texto);
  const compativel = /autorizar compartilhamento de dados|autorizacao de compartilhamento de dados|compartilhamento de dados.{0,100}(?:receita federal|rfb|blockchain)/i.test(norm);
  const token = limparValor(texto.match(/(?:c[oó]digo|token)\s*(?:\(token\))?\s*(?:ou\s+qrcode)?\s*[^\n\r]*\n\s*([A-Za-z0-9]{20,})/i)?.[1] || null);
  const concluida = /compartilhamento de dados foi conclu[ií]do|autoriza[cç][aã]o de compartilhamento de dados foi registrada/i.test(norm);
  const dataInicio = dataProximaDe(texto, /(?:in[ií]cio|iniciado|vig[eê]ncia)\D{0,30}(\d{2}\/\d{2}\/20\d{2})/i);
  const dados = {
    documento_compativel: compativel,
    autorizacao: concluida,
    status_autorizacao: concluida ? 'concluida' : null,
    token_autorizacao: token,
    registro_blockchain: /blockchain/i.test(norm),
    data_inicio: dataInicio,
    campos_comprovados: {
      ...(compativel ? { autorizacao: concluida } : {}),
      ...(token ? { token_autorizacao: token } : {}),
      ...(/blockchain/i.test(norm) ? { registro_blockchain: true } : {}),
      ...(dataInicio ? { data_inicio: dataInicio } : {}),
    },
    fonte_extracao: 'local_deterministica_especializada',
  };
  const confianca = clamp((compativel ? 0.65 : 0) + (concluida ? 0.2 : 0) + (token ? 0.08 : 0) + (/blockchain/i.test(norm) ? 0.07 : 0));
  return { dados, confianca };
}


type TipoConsultaDocumentalEspecializada =
  | 'certidao_regularidade'
  | 'situacao_fiscal'
  | 'consulta_cadin'
  | 'consulta_pgfn'
  | 'consulta_scr'
  | 'consulta_ccs'
  | 'consulta_ccf'
  | 'consulta_cenprot'
  | 'consulta_bureau';

function valoresRotuladosMultiplos(linhas: string[], aliases: string[]): string[] {
  const aliasesNorm = aliases.map(textoNormalizado);
  const valores: string[] = [];
  for (const linha of linhas) {
    const normalizada = textoNormalizado(linha);
    const alias = aliasesNorm.find((item) => normalizada.startsWith(`${item}:`) || normalizada.startsWith(`${item} -`));
    if (!alias) continue;
    const valor = linha.replace(/^[^:\-]{1,80}[:\-]\s*/, '').trim();
    if (valor && !valores.some((item) => textoNormalizado(item) === textoNormalizado(valor))) valores.push(valor);
  }
  return valores;
}

function quantidadeRotulada(linhas: string[], aliases: string[]): number | null {
  const valor = limparValor(valorAposRotulo(linhas, aliases));
  if (!valor) return null;
  const numero = numeroInteiroBrasileiro(valor);
  return numero !== null && numero >= 0 ? numero : null;
}

type MotorCreditoExtraido = {
  decisao?: string;
  valor_sugerido?: number | string;
  parcela_sugerida?: number | string;
  taxa_juros?: string;
  rating_bacen?: string;
  parcelas?: number | string;
  score?: number;
  negociar_com_cliente?: string;
};

function normalizarRotulosMotorCredito(value: string): string {
  return textoNormalizado(value)
    // Alguns PDFs do mesmo fornecedor quebram palavras no meio dos rótulos.
    // A normalização fica restrita aos rótulos do quadro operacional para não
    // alterar o texto documental usado pelos demais leitores.
    .replace(/de\s+cisao/g, 'decisao')
    .replace(/d\s*e\s*c\s*i\s*s\s*[aãa]\s*o/g, 'decisao')
    .replace(/va\s*lor\s+suge\s*rido/g, 'valor sugerido')
    .replace(/v\s*a\s*l\s*o\s*r\s*s\s*u\s*g\s*e\s*r\s*i\s*d\s*o/g, 'valor sugerido')
    .replace(/pa\s*rce\s*la\s+suge\s*rida/g, 'parcela sugerida')
    .replace(/p\s*a\s*r\s*c\s*e\s*l\s*a\s+s\s*u\s*g\s*e\s*r\s*i\s*d\s*a/g, 'parcela sugerida')
    .replace(/p\s*a\s*r\s*c\s*e\s*l\s*a\s*s\b/g, 'parcelas')
    .replace(/ta\s*xa\s+juros/g, 'taxa juros')
    .replace(/t\s*a\s*x\s*a\s+j\s*u\s*r\s*o\s*s/g, 'taxa juros')
    .replace(/ra\s*ting\s+ba\s*ce\s*n/g, 'rating bacen')
    .replace(/r\s*a\s*t\s*i\s*n\s*g\s+b\s*a\s*c\s*e\s*n/g, 'rating bacen')
    .replace(/ne\s*gocia\s*r\s+com\s+clie\s*nte/g, 'negociar com cliente');
}

function trechoEntreRotulos(texto: string, inicio: string, fim: string): string {
  const inicioIndex = texto.indexOf(inicio);
  if (inicioIndex < 0) return '';
  const conteudoInicio = inicioIndex + inicio.length;
  const fimIndex = texto.indexOf(fim, conteudoInicio);
  return texto.slice(conteudoInicio, fimIndex >= 0 ? fimIndex : texto.length).trim();
}

function primeiroValorMonetario(texto: string): number | null {
  const valor = texto.match(/r\$\s*-?[\d.]+(?:,\d{1,2})?/i)?.[0] || null;
  return numeroMonetario(valor);
}

function extrairMotorCredito(texto: string): MotorCreditoExtraido | null {
  const normalizado = normalizarRotulosMotorCredito(texto);
  const inicio = normalizado.indexOf('motor de credito');
  if (inicio < 0) return null;

  const ocorrencias: number[] = [];
  let cursor = 0;
  while (true) {
    const indice = normalizado.indexOf('motor de credito', cursor);
    if (indice < 0) break;
    ocorrencias.push(indice);
    cursor = indice + 1;
  }
  // Relatórios consolidados costumam repetir "Motor de crédito" no resumo
  // inicial e depois no quadro operacional. Escolha o quadro que realmente
  // contém os rótulos/valores do motor, nunca a menção resumida.
  const inicioOperacional = ocorrencias
    .map((indice) => ({
      indice,
      pontuacao: ['decisao', 'valor sugerido', 'taxa juros', 'rating bacen', 'negociar com cliente']
        .filter((rotulo) => normalizado.indexOf(rotulo, indice + 'motor de credito'.length) >= 0).length,
    }))
    .sort((a, b) => b.pontuacao - a.pontuacao || b.indice - a.indice)[0]?.indice ?? inicio;
  const restante = normalizado.slice(inicioOperacional);
  const proximasSecoes = ['indicador comportamental', 'quadro societario', 'score pj', 'telefones', 'emails'];
  const fim = proximasSecoes
    .map((secao) => restante.indexOf(secao, 'motor de credito'.length))
    .filter((indice) => indice >= 0)
    .sort((a, b) => a - b)[0];
  const bloco = restante.slice(0, fim ?? restante.length);
  const motor: MotorCreditoExtraido = {};

  const primeiraLinhaMotor = trechoEntreRotulos(bloco, 'valor sugerido', 'parcela sugerida');
  const decisao = trechoEntreRotulos(bloco, 'decisao', 'parcela sugerida').match(/\b(aprovado|recusado)\b/i)?.[1];
  if (decisao) motor.decisao = decisao[0].toUpperCase() + decisao.slice(1).toLowerCase();

  const valorSugerido = primeiroValorMonetario(primeiraLinhaMotor);
  if (valorSugerido !== null) motor.valor_sugerido = valorSugerido;

  // No layout em colunas, "PARCELA SUGERIDA | TAXA JUROS" é seguido por
  // "R$ parcela | percentual"; os dois rótulos ficam consecutivos e não há
  // texto entre eles.
  const parcelaSugerida = primeiroValorMonetario(trechoEntreRotulos(bloco, 'taxa juros', 'rating bacen'));
  if (parcelaSugerida !== null) motor.parcela_sugerida = parcelaSugerida;

  const taxa = trechoEntreRotulos(bloco, 'taxa juros', 'rating bacen').match(/\d+(?:[,.]\d+)?%\s*(?:a\s*\d+(?:[,.]\d+)?%\s*ao\s*mes)?/i)?.[0];
  if (taxa) motor.taxa_juros = taxa.replace(/\s+/g, ' ').trim();

  const rating = trechoEntreRotulos(bloco, 'rating bacen', 'score').match(/\b(?:aaa|aa|a|bbb|bb|b|c-?|d|e|g)\b/i)?.[0];
  if (rating) motor.rating_bacen = rating.toUpperCase();

  const parcelas = trechoEntreRotulos(bloco, 'parcelas', 'score').match(/\b\d+(?:\s+a\s+\d+)?\b/)?.[0];
  if (parcelas) motor.parcelas = parcelas.includes(' a ') ? parcelas : Number(parcelas);

  const score = bloco.slice(bloco.indexOf('score') + 'score'.length).match(/\b\d{1,4}\b/)?.[0];
  if (score) motor.score = Number(score);

  const negociar = bloco.slice(bloco.indexOf('negociar com cliente') + 'negociar com cliente'.length).match(/\b(sim|nao)\b/i)?.[1];
  if (negociar) motor.negociar_com_cliente = negociar.toLowerCase() === 'sim' ? 'Sim' : 'Não';

  return Object.keys(motor).length ? motor : null;
}

function parseConsultaDocumentalEspecializada(
  tipo: TipoConsultaDocumentalEspecializada,
  texto: string,
  tipoDocumentoEsperado?: string,
): { dados: Record<string, any>; confianca: number } {
  const base = parseDocumentoGenerico(texto, tipoDocumentoEsperado);
  const linhas = linhasTexto(texto);
  const norm = textoNormalizado(texto)
    .replace(/anali\s+s\s+e/g, 'analise')
    .replace(/em\s+pres\s+ari\s+al/g, 'empresarial')
    .replace(/pontua\s+ca\s+o/g, 'pontuacao')
    .replace(/instituicoe\s+s/g, 'instituicoes')
    .replace(/data\s+e\s+ho\s+ra/g, 'data e hora')
    .replace(/d\s+a\s+ta/g, 'data')
    .replace(/ho\s+ra/g, 'hora')
    .replace(/pe\s+r[ií]odo/g, 'periodo')
    .replace(/per\s+[ií]odo/g, 'periodo');

  const relatorioCreditoConsolidado = /analise empresarial.{0,100}(?:financeira|scr)|scr\s*\+\s*laudo financeiro|score empresarial|rating bacen|motor de credito/i.test(norm)
    && /(?:score|rating|analise empresarial|laudo financeiro)/i.test(norm);
  const motorCredito = extrairMotorCredito(texto);
  const marcadores: Record<TipoConsultaDocumentalEspecializada, RegExp> = {
    certidao_regularidade: /certidao.{0,100}(?:debitos|regularidade)|certificado de regularidade do fgts|\bcndt\b|banco nacional de devedores trabalhistas/i,
    situacao_fiscal: /relatorio de situacao fiscal|consulta pendencias.{0,50}situacao fiscal|diagnostico fiscal/i,
    consulta_cadin: /\bcadin\b|cadastro informativo de creditos nao quitados/i,
    // Exige sinal de consulta/Regularize/inscrição. Uma CND conjunta também
    // menciona PGFN e Dívida Ativa, mas isso NÃO a transforma em consulta PGFN.
    consulta_pgfn: /regularize|consulta.{0,80}(?:inscricoes|divida ativa)|inscricoes? em divida ativa/i,
    consulta_scr: /relatorio de emprestimos e financiamentos|sistema de informacoes de creditos|\bscr\b/i,
    consulta_ccs: /relatorio de contas e relacionamentos|cadastro de clientes do sistema financeiro|\bccs\b/i,
    consulta_ccf: /relatorio de cheques sem fundos|cadastro de emitentes de cheques sem fundos|\bccf\b/i,
    consulta_cenprot: /\bcenprot\b|\bcenprod\b|central.{0,60}protest|consulta.{0,60}protest|pesquisa.{0,60}protest|protestos?\s+nos\s+cart[oó]rios|informa[cç][aã]o\s+sem\s+valor\s+de\s+certid[aã]o/i,
    consulta_bureau: /\bserasa\b|experian|score.{0,60}(?:cnpj|cpf)|relatorio.{0,60}(?:score|restricoes)/i,
  };

  let compativel = marcadores[tipo].test(norm);
  if (tipo === 'consulta_bureau' && relatorioCreditoConsolidado) compativel = true;
  if ((tipo === 'consulta_bureau' || tipo === 'consulta_scr') && motorCredito) compativel = true;
  // Guarda adicional PGFN: "certidão ... dívida ativa" continua sendo CND/CPEND.
  if (tipo === 'consulta_pgfn' && /certidao.{0,160}(?:tributos federais|divida ativa da uniao)/i.test(norm) && !/regularize|consulta.{0,80}inscricoes/i.test(norm)) {
    compativel = false;
  }

  const adicionais: Record<string, any> = {};
  if (tipo === 'situacao_fiscal') {
    adicionais.pendencias = valoresRotuladosMultiplos(linhas, ['pendência', 'pendencia', 'débito', 'debito', 'omissão', 'omissao']);
    adicionais.resultado_consulta = base.dados.resultado_consulta
      || (/sem pendencias|nenhuma pendencia|situacao regular/i.test(norm) ? 'Sem pendências identificadas' : null);
  } else if (tipo === 'consulta_cadin') {
    const quantidade = quantidadeRotulada(linhas, ['quantidade de registros', 'registros cadin', 'quantidade de pendências', 'quantidade de pendencias']);
    adicionais.registros = quantidade;
    adicionais.resultado_consulta = base.dados.resultado_consulta
      || (/nada consta|nao (?:ha|possui) pendencias|nenhum registro/i.test(norm) ? 'Sem registros identificados' : null);
    adicionais.escopo_consulta = /incluidas? pela receita federal|receita federal/i.test(norm) ? 'RFB' : null;
  } else if (tipo === 'consulta_pgfn') {
    adicionais.inscricoes = quantidadeRotulada(linhas, ['quantidade de inscrições', 'quantidade de inscricoes', 'inscrições', 'inscricoes']);
    adicionais.resultado_consulta = base.dados.resultado_consulta
      || (/nada consta|nenhuma inscricao|nao possui inscricoes/i.test(norm) ? 'Sem inscrições identificadas' : null);
  } else if (tipo === 'consulta_scr') {
    const fimCorpoScr = linhas.findIndex((linha) => /^importante\b/i.test(linha));
    const corpoScr = linhas.slice(0, fimCorpoScr >= 0 ? fimCorpoScr : linhas.length);
    const instituicoesRotuladas = valoresRotuladosMultiplos(corpoScr, ['instituição', 'instituicao', 'banco', 'credor']);
    const instituicoesScr = instituicoesRotuladas.length ? instituicoesRotuladas : corpoScr
      .filter((linha) => /(?:\bs\.a\.?\b|sociedade de cr[eé]dito|\bip\b)/i.test(linha))
      .map((linha) => limparValor(linha.replace(/\s+R\$.*$/i, '').replace(/^\s*\d+\s*/, '')))
      .filter((linha): linha is string => Boolean(linha && !/^(institui[cç][aã]o|empr[eé]stimos|limite|d[ií]vidas|outros compromissos|os bancos|coobriga[cç][aã]o)/i.test(linha)));
    const linhaReferencia = corpoScr.find((linha) => /m[eê]s\s+de\s+refer[eê]ncia/i.test(linha));
    const valoresReferencia = linhaReferencia ? Array.from(linhaReferencia.matchAll(/R\$\s*[-\d.]+(?:,\d{1,2})?/g)).map((match) => numeroMonetario(match[0])).filter((valor): valor is number => valor !== null) : [];
    const vencidasNoCorpo = corpoScr.some((linha) => /vencida|vencidas/i.test(linha) && /R\$/.test(linha));
    adicionais.instituicoes = Array.from(new Set(instituicoesScr));
    const quantidadeInstituicoes = Number(norm.match(/qtd\.?\s+instituicoes[\s\S]{0,100}?(\d+)/i)?.[1] || '') || null;
    if (!adicionais.instituicoes.length && quantidadeInstituicoes) {
      // O relatório consolidado informa a quantidade, não os nomes dos
      // bancos. Mantemos a proveniência explícita em vez de inventar nomes.
      adicionais.instituicoes = [{ quantidade: quantidadeInstituicoes, nomes_informados: false }];
      adicionais.instituicoes_quantidade = quantidadeInstituicoes;
    }
    adicionais.data_base = norm.match(/\bperiodo[\s\S]{0,100}?(20\d{2}-\d{2})\b/i)?.[1] || null;
    adicionais.saldo_devedor = base.dados.saldo ?? valoresReferencia[0] ?? null;
    adicionais.limites = base.dados.limites ?? (valoresReferencia.length > 1 ? valoresReferencia.at(-1) : null);
    adicionais.atrasos = quantidadeRotulada(linhas, ['operações em atraso', 'operacoes em atraso', 'dívidas vencidas', 'dividas vencidas']) ?? (vencidasNoCorpo ? null : 0);
    adicionais.data_consulta = base.dados.data_consulta
      || parseDate(norm.match(/data\s+e\s+hora[\s\S]{0,120}?(\d{2}\/\d{2}\/20\d{2})/i)?.[1] || null);
    const situacaoScr = texto.match(/\bscr\b\s+(vencid[oa]|em\s+dia)\b/i)?.[1] || null;
    adicionais.resultado_consulta = situacaoScr ? `SCR ${situacaoScr}` : null;
  } else if (tipo === 'consulta_ccs') {
    const relacionamentos = linhas
      .map((linha) => {
        // O CCS oficial deixa a coluna "Data de fim" vazia para relações
        // ativas. O formato anterior exigia sempre uma quarta coluna e,
        // por isso, descartava todas as linhas reais deste PDF.
        const match = linha.match(/^\s*(\d{2}\.\d{3}\.\d{3})\s*-\s*(.+?)\s+(\d{2}\/\d{2}\/\d{4})(?:\s+(Ativo|\d{2}\/\d{2}\/\d{4}))?\s*$/i);
        return match ? { instituicao: match[2].trim(), inicio: parseDate(match[3]), fim: !match[4] || /^ativo$/i.test(match[4]) ? null : parseDate(match[4]) } : null;
      })
      .filter((item): item is { instituicao: string; inicio: string | null; fim: string | null } => Boolean(item));
    adicionais.relacionamentos = relacionamentos;
    adicionais.instituicoes = relacionamentos.length
      ? relacionamentos.map((item) => item.instituicao)
      : valoresRotuladosMultiplos(linhas, ['instituição', 'instituicao', 'banco']);
    adicionais.datas_relacionamento = relacionamentos.flatMap((item) => [item.inicio, item.fim]).filter(Boolean);
  } else if (tipo === 'consulta_ccf') {
    adicionais.ocorrencias = quantidadeRotulada(linhas, ['quantidade de ocorrências', 'quantidade de ocorrencias', 'cheques sem fundos']);
    adicionais.resultado_consulta = base.dados.resultado_consulta
      || (/nenhum cheque|sem ocorrencias|nada consta|não foi encontrado registro de cheque|nao foi encontrado registro de cheque/i.test(norm) ? 'Sem ocorrências identificadas' : null);
    if (adicionais.ocorrencias === undefined || adicionais.ocorrencias === null) {
      adicionais.ocorrencias = /nenhum cheque|sem ocorrencias|nada consta|não foi encontrado registro de cheque|nao foi encontrado registro de cheque/i.test(norm) ? 0 : null;
    }
  } else if (tipo === 'consulta_cenprot') {
    adicionais.protestos = quantidadeRotulada(linhas, ['quantidade de protestos', 'protestos']);
    adicionais.resultado_consulta = base.dados.resultado_consulta
      || (/nenhum protesto|sem protestos|nada consta|não constam protestos|nao constam protestos/i.test(norm) ? 'Sem protestos identificados' : null);
    if (adicionais.protestos === undefined || adicionais.protestos === null) {
      adicionais.protestos = /nenhum protesto|sem protestos|nada consta|não constam protestos|nao constam protestos/i.test(norm) ? 0 : null;
    }
  } else if (tipo === 'consulta_bureau') {
    adicionais.restricoes = quantidadeRotulada(linhas, ['quantidade de restrições', 'quantidade de restricoes', 'negativações', 'negativacoes']);
    const ratingPermitido = /^(?:AAA|AA|A|BBB|BB|B|C-?|D|E)$/i;
    const ratingPorPontuacao = texto.match(/pontua[cç][aã]o\s+(?:pj\s+)?rating\s+\d{1,4}\s+([A-Z]{1,3}-?)/i)?.[1] || null;
    const ratingPorRotuloExplicito = texto.match(/rating\s+(?:bacen|serasa|score)\s*:\s*([A-Z]{1,3}-?)/i)?.[1] || null;
    const ratingPorClassificacao = texto.match(/classifica[cç][aã]o\s+do\s+risco\s+de\s+cr[eé]dito[ \t]+([A-Z]{1,3}-?)/i)?.[1] || null;
    const ratingRotulado = limparValor(valorAposRotulo(linhas, ['rating', 'faixa de risco', 'faixa rating']));
    const ratingCandidate = [ratingPorPontuacao, ratingPorRotuloExplicito, ratingPorClassificacao, ratingRotulado]
      .map((valor) => limparValor(valor || ''))
      .filter((valor): valor is string => Boolean(valor))
      .find((valor) => ratingPermitido.test(valor)) || null;
    adicionais.rating = ratingCandidate;
    const textoConsultaNormalizado = texto
      .replace(/d\s*a\s*ta/gi, 'data')
      .replace(/h[oó]\s*ra/gi, 'hora');
    const pontuacaoRating = texto.match(/pontua[cç][aã]o\s+rating\s+(\d{1,4})\s+([A-Z]{1,3}-?)/i);
    const score = pontuacaoRating?.[1] ? Number(pontuacaoRating[1]) : Number(limparValor(valorAposRotulo(linhas, ['pontuação', 'pontuacao', 'score'])) || '') || null;
    const ratingComposto = pontuacaoRating?.[2] || ratingCandidate;
    const compacta = texto.match(/data\s+consulta\D{0,30}(20\d{6})/i)?.[1] || null;
    const dataCompacta = compacta ? `${compacta.slice(0, 4)}-${compacta.slice(4, 6)}-${compacta.slice(6, 8)}` : null;
    const dataConsultaRelatorio = parseDate(
      norm.match(/data\s+e\s+hora\D{0,180}(\d{2}\/\d{2}\/20\d{2})/i)?.[1]
        || norm.match(/data\s+consulta\D{0,60}(\d{2}\/\d{2}\/20\d{2})/i)?.[1]
        || norm.match(/\bdata\D{0,40}(\d{2}\/\d{2}\/20\d{2})/i)?.[1]
        || textoConsultaNormalizado.match(/data\s+e\s+hora\D{0,180}(\d{2}\/\d{2}\/20\d{2})/i)?.[1]
        || textoConsultaNormalizado.match(/data\s+consulta\D{0,60}(\d{2}\/\d{2}\/20\d{2})/i)?.[1]
        || dataCompacta,
    );
    const situacaoCredito = texto.match(/\b(APROVADO(?:_[A-Z]+)?|ALTO_RISCO|BAIXO_RISCO|MEDIO_RISCO|M[ÉE]DIO_RISCO|RECUSADO)\b/i)?.[1]
      || null;
    adicionais.score = motorCredito?.score ?? score;
    adicionais.rating = motorCredito?.rating_bacen ?? (motorCredito ? null : ratingComposto);
    adicionais.rating_bacen = motorCredito?.rating_bacen ?? (motorCredito ? null : ratingComposto);
    if (motorCredito) adicionais.motor_credito = motorCredito;
    adicionais.data_consulta = base.dados.data_consulta || dataConsultaRelatorio;
    adicionais.resultado_consulta = relatorioCreditoConsolidado
      ? `Relatório empresarial consolidado${motorCredito?.rating_bacen || ratingComposto ? ` — rating ${motorCredito?.rating_bacen || ratingComposto}` : ''}${motorCredito?.decisao || situacaoCredito ? ` — ${motorCredito?.decisao || situacaoCredito}` : ''}`
      : base.dados.resultado_consulta || (/sem restricoes|nada consta/i.test(norm) ? 'Sem restrições identificadas' : null);
  }

  if (motorCredito && tipo === 'consulta_scr') {
    adicionais.motor_credito = motorCredito;
    adicionais.score = motorCredito.score ?? null;
    adicionais.rating = motorCredito.rating_bacen ?? null;
    adicionais.rating_bacen = motorCredito.rating_bacen ?? null;
    adicionais.resultado_consulta = `Motor de Crédito${motorCredito.rating_bacen ? ` — rating ${motorCredito.rating_bacen}` : ''}${motorCredito.decisao ? ` — ${motorCredito.decisao}` : ''}`;
  }

  const adicionaisValidos = Object.fromEntries(
    Object.entries(adicionais).filter(([, valor]) => valor !== null && valor !== undefined && !(Array.isArray(valor) && valor.length === 0)),
  );
  const camposComprovados = { ...(base.dados.campos_comprovados || {}), ...adicionaisValidos };
  const dadosBase = { ...base.dados };
  if (tipo === 'consulta_bureau') {
    // O parser genérico pode interpretar rótulos do relatório de crédito como
    // campos de certidão e converter ausência de score/limite em zero. Esses
    // valores não são evidência do bureau e não devem contaminar a análise.
    delete dadosBase.situacao_certidao;
    delete camposComprovados.situacao_certidao;
    if (!Object.prototype.hasOwnProperty.call(adicionaisValidos, 'score')) {
      delete dadosBase.score;
      delete camposComprovados.score;
    }
    if (!Object.prototype.hasOwnProperty.call(adicionaisValidos, 'limites')) {
      delete dadosBase.limites;
      delete camposComprovados.limites;
    }
    if (motorCredito) {
      // O parser genérico encontra "Faturamento" no mesmo relatório e pode
      // promovê-lo indevidamente a situação. O Motor de Crédito é o quadro
      // autoritativo para o resultado operacional desta consulta.
      delete dadosBase.situacao;
      delete camposComprovados.situacao;
    }
  }
  // Relatórios consolidados podem conter outras decisões (falência, rating,
  // faturamento) junto da seção SCR. Esses rótulos não são o resultado do SCR
  // e não devem aparecer como situação de certidão/resultado da consulta.
  if (tipo === 'consulta_scr') {
    delete camposComprovados.situacao_certidao;
    if (adicionais.resultado_consulta === null || adicionais.resultado_consulta === undefined) delete camposComprovados.resultado_consulta;
  }
  const possuiIdentificador = Boolean(camposComprovados.cnpj || camposComprovados.cpf);
  const possuiData = Boolean(camposComprovados.data_consulta || camposComprovados.data_emissao || camposComprovados.data_base || camposComprovados.data_validade);
  const confianca = clamp(base.confianca + (compativel ? 0.2 : 0) + (possuiIdentificador ? 0.08 : 0) + (possuiData ? 0.05 : 0)
    + (['consulta_scr', 'consulta_ccs', 'consulta_ccf', 'consulta_cenprot'].includes(tipo) && compativel ? 0.08 : 0));

  return {
    dados: {
      ...dadosBase,
      ...adicionaisValidos,
      campos_comprovados: camposComprovados,
      documento_compativel: compativel,
      tipo_detectado_local: compativel ? tipo : null,
      confianca,
      fonte_extracao: 'local_deterministica_especializada',
    },
    confianca,
  };
}

export function analisarTextoDocumentoLocal(tipo: TipoDocumentoLocal, texto: string, tipoDocumentoEsperado?: string): { dados: Record<string, any>; confianca: number } {
  if (tipo === 'cartao_cnpj') return parseCartaoCnpj(texto);
  if (tipo === 'qsa') return parseQsa(texto);
  if (tipo === 'simples_nacional') return parseSimples(texto);
  if (tipo === 'atos_junta_comercial') return parseAtosJunta(texto);
  if (tipo === 'faturamento_12_meses') return parseFaturamento12Meses(texto);
  if (tipo === 'comprovante_residencia') return parseComprovanteResidencia(texto);
  if (tipo === 'extrato_bancario') return parseExtratoBancario(texto);
  if (tipo === 'efd_contribuicoes') return parseEfdContribuicoes(texto);
  if (tipo === 'efd_icms_ipi') return parseEfdIcmsIpi(texto);
  if (tipo === 'defis') return parseDeclaracaoDefis(texto);
  if (tipo === 'dasn_simei') return parseDeclaracaoDasnSimei(texto);
  if (tipo === 'compartilhamento_ecac') return parseCompartilhamentoEcac(texto);
  if (tipo === 'certidao_regularidade' || tipo === 'situacao_fiscal' || tipo === 'consulta_cadin'
    || tipo === 'consulta_pgfn' || tipo === 'consulta_scr' || tipo === 'consulta_ccs'
    || tipo === 'consulta_ccf' || tipo === 'consulta_cenprot' || tipo === 'consulta_bureau') {
    return parseConsultaDocumentalEspecializada(tipo, texto, tipoDocumentoEsperado);
  }
  if (tipo === 'documento_generico') {
    const esperado = String(tipoDocumentoEsperado || '').toLowerCase();
    if (esperado === 'defis' || esperado === 'recibo_defis') return parseDeclaracaoDefis(texto);
    if (esperado === 'dasn_simei' || esperado === 'recibo_dasn_simei') return parseDeclaracaoDasnSimei(texto);
    if (esperado === 'compartilhamento_ecac') return parseCompartilhamentoEcac(texto);
    return parseDocumentoGenerico(texto, tipoDocumentoEsperado);
  }
  // ECF, DCTF/DCTFWeb, DARF e Livro Caixa compartilham a detecção
  // conservadora de regime, mas preservam sua própria compatibilidade documental.
  if (tipo === 'ecf' || tipo === 'pgdas_d' || tipo === 'dctf_mit' || tipo === 'darf' || tipo === 'ecd' || tipo === 'livro_caixa') return parseComprovanteRegime(tipo, texto);
  return parseContratoSocialAlteracao(texto);
}

function decodificarXml(value: string): string {
  return value
    .replace(/<w:tab\s*\/?>/g, '\t')
    .replace(/<w:br\s*\/?>|<\/w:p>|<\/row>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

async function unzipEntry(arquivoPath: string, entry: string, timeout: number, maxBuffer: number): Promise<string> {
  const { stdout } = await execFileAsync('unzip', ['-p', arquivoPath, entry], { timeout, maxBuffer, encoding: 'utf8' });
  return String(stdout || '');
}

async function extrairTextoEstruturado(arquivoPath: string, extension: string, timeout: number, maxBuffer: number): Promise<string> {
  if (extension === '.csv') return String(await readFile(arquivoPath, 'utf8')).replace(/\u0000/g, '').trim();
  if (extension === '.docx') return decodificarXml(await unzipEntry(arquivoPath, 'word/document.xml', timeout, maxBuffer));
  if (extension !== '.xlsx') return '';

  const sharedXml = await unzipEntry(arquivoPath, 'xl/sharedStrings.xml', timeout, maxBuffer).catch(() => '');
  const compartilhadas = Array.from(sharedXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)).map((match) => decodificarXml(match[1]));
  const { stdout: listaRaw } = await execFileAsync('unzip', ['-Z1', arquivoPath], { timeout, maxBuffer, encoding: 'utf8' });
  const planilhas = String(listaRaw || '').split(/\r?\n/).filter((nome) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(nome));
  const linhas: string[] = [];
  for (const planilha of planilhas.slice(0, 50)) {
    const xml = await unzipEntry(arquivoPath, planilha, timeout, maxBuffer);
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const valores = Array.from(row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)).map((cell) => {
        const attrs = cell[1];
        const body = cell[2];
        const inline = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
        if (inline != null) return decodificarXml(inline);
        const value = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] || '';
        if (/\bt=["']s["']/.test(attrs)) return compartilhadas[Number(value)] ?? value;
        return decodificarXml(value);
      });
      if (valores.some(Boolean)) linhas.push(valores.join(' | '));
    }
  }
  return linhas.join('\n').trim();
}

const TIPOS_EVIDENCIA_VISUAL_EMPRESARIAL = new Set([
  'foto_fachada', 'foto_interna_1', 'foto_interna_2', 'foto_interna_3',
]);

function dimensoesImagem(buffer: Buffer, extension: string): { largura: number; altura: number } | null {
  // JPEG: percorre os marcadores SOF, sem depender de OCR ou de texto embutido.
  if (extension === '.jpg' || extension === '.jpeg') {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marcador = buffer[offset + 1];
      offset += 2;
      if (marcador === 0xd8 || marcador === 0xd9) continue;
      if (offset + 2 > buffer.length) return null;
      const tamanho = buffer.readUInt16BE(offset);
      if (tamanho < 2 || offset + tamanho > buffer.length) return null;
      const ehSof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
      if (ehSof && tamanho >= 7) {
        return { altura: buffer.readUInt16BE(offset + 3), largura: buffer.readUInt16BE(offset + 5) };
      }
      offset += tamanho;
    }
    return null;
  }

  // PNG: largura/altura estão no IHDR, sempre no mesmo offset.
  if (extension === '.png' && buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { largura: buffer.readUInt32BE(16), altura: buffer.readUInt32BE(20) };
  }

  // GIF: o cabeçalho também informa as dimensões do canvas.
  if ((extension === '.gif') && buffer.length >= 10 && buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    return { largura: buffer.readUInt16LE(6), altura: buffer.readUInt16LE(8) };
  }

  return null;
}

async function extrairEvidenciaVisualEmpresarial(
  arquivoPath: string,
  extension: string,
  mimeType: string,
  tipoDocumentoEsperado?: string,
): Promise<ExtracaoDocumentalLocalResult> {
  const slotVisual = String(tipoDocumentoEsperado || '').toLowerCase();
  const tipo = (TIPOS_EVIDENCIA_VISUAL_EMPRESARIAL.has(slotVisual)
    ? slotVisual
    : 'foto_fachada') as TipoDocumentoLocal;
  try {
    const buffer = await readFile(arquivoPath);
    const dimensoes = dimensoesImagem(buffer, extension);
    const tamanhoBytes = buffer.byteLength;
    const qualidadeAdequada = Boolean(
      dimensoes
      && dimensoes.largura >= 640
      && dimensoes.altura >= 360
      && tamanhoBytes >= 10_000,
    );
    const tipoEvidencia = slotVisual === 'foto_fachada' ? 'fachada' : 'instalacoes';
    const qualidadeImagem = qualidadeAdequada ? 'adequada' : 'insuficiente';
    const evidencia = {
      campo: 'qualidade_imagem',
      valor: qualidadeImagem,
      pagina: null,
      trecho: dimensoes
        ? `Imagem ${tipoEvidencia} decodificada: ${dimensoes.largura}x${dimensoes.altura}px; ${tamanhoBytes} bytes.`
        : `Imagem ${tipoEvidencia} recebida em ${mimeType}, mas não foi possível comprovar suas dimensões.`,
      confianca: qualidadeAdequada ? 0.92 : 0.35,
    };
    return {
      tipo,
      disponivel: true,
      legivel: qualidadeAdequada,
      mecanismo: 'imagem_visual',
      texto: '',
      dados: {
        documento_compativel: true,
        tipo_detectado: 'FOTO_EMPRESARIAL',
        tipo_evidencia: tipoEvidencia,
        qualidade_imagem: qualidadeImagem,
        dimensoes_imagem: dimensoes,
        tamanho_bytes: tamanhoBytes,
        campos_comprovados: {
          tipo_evidencia: tipoEvidencia,
          qualidade_imagem: qualidadeImagem,
          ...(slotVisual === 'foto_fachada' ? { fachada: true } : { instalacoes: true }),
        },
        evidencias: [evidencia],
        fonte_extracao: 'local_deterministica_visual',
      },
      confianca: qualidadeAdequada ? 0.92 : 0.35,
      paginas_processadas: 1,
      motivo: qualidadeAdequada
        ? undefined
        : 'Imagem recebida, mas a qualidade/dimensão mínima não foi comprovada; revisão humana necessária.',
    };
  } catch (error: any) {
    return {
      tipo,
      disponivel: error?.code !== 'ENOENT',
      legivel: false,
      mecanismo: 'imagem_visual',
      texto: '',
      dados: {
        documento_compativel: true,
        tipo_detectado: 'FOTO_EMPRESARIAL',
        tipo_evidencia: slotVisual === 'foto_fachada' ? 'fachada' : 'instalacoes',
        qualidade_imagem: 'nao_comprovada',
        campos_comprovados: {
          tipo_evidencia: slotVisual === 'foto_fachada' ? 'fachada' : 'instalacoes',
          qualidade_imagem: 'nao_comprovada',
        },
        evidencias: [],
        fonte_extracao: 'local_deterministica_visual',
      },
      confianca: 0,
      paginas_processadas: 1,
      motivo: String(error?.message || 'Não foi possível ler a imagem; revisão humana necessária.'),
    };
  }
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

async function contarPaginasPdfLocal(arquivoPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      process.env.PDFINFO_BINARY || 'pdfinfo',
      [arquivoPath],
      { timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' },
    );
    const match = String(stdout || '').match(/^Pages:\s*(\d+)/im);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
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
  tipoDocumentoEsperado?: string,
): Promise<ExtracaoDocumentalLocalResult> {
  const effectiveMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  const extension = path.extname(arquivoPath).toLowerCase();
  const isPdf = effectiveMime === 'application/pdf' || extension === '.pdf';
  const isImage = effectiveMime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp'].includes(extension);
  const isStructured = ['.csv', '.docx', '.xlsx'].includes(extension);
  const paginasProcessadas = isPdf
    ? await contarPaginasPdfLocal(arquivoPath)
    : isImage || isStructured ? 1 : null;

  const timeout = Number(process.env.LOCAL_PDF_TEXT_TIMEOUT_MS || 15000);
  const ocrTimeout = Number(process.env.LOCAL_OCR_TIMEOUT_MS || 120000);
  const maxBuffer = Number(process.env.LOCAL_PDF_TEXT_MAX_BYTES || 16 * 1024 * 1024);
  const timeoutTexto = Number.isFinite(timeout) && timeout > 0 ? timeout : 15000;
  const timeoutOcr = Number.isFinite(ocrTimeout) && ocrTimeout > 0 ? ocrTimeout : 120000;
  const bufferMaximo = Number.isFinite(maxBuffer) && maxBuffer > 0 ? maxBuffer : 16 * 1024 * 1024;

  if (isImage && TIPOS_EVIDENCIA_VISUAL_EMPRESARIAL.has(String(tipoDocumentoEsperado || '').toLowerCase())) {
    return extrairEvidenciaVisualEmpresarial(arquivoPath, extension, effectiveMime, tipoDocumentoEsperado);
  }

  if (isStructured) {
    try {
      const texto = await extrairTextoEstruturado(arquivoPath, extension, timeoutTexto, bufferMaximo);
      const { dados, confianca } = analisarTextoDocumentoLocal(tipo, texto, tipoDocumentoEsperado);
      return {
        tipo,
        disponivel: true,
        legivel: texto.length >= 20,
        mecanismo: 'texto_estruturado',
        texto,
        dados: { ...dados, fonte_extracao: 'texto_estruturado_local' },
        confianca,
        paginas_processadas: paginasProcessadas,
        motivo: texto.length >= 20 ? undefined : 'Arquivo estruturado sem conteúdo textual legível.',
      };
    } catch (error: any) {
      return { tipo, disponivel: error?.code !== 'ENOENT', legivel: false, mecanismo: 'texto_estruturado', texto: '', dados: {}, confianca: 0, paginas_processadas: paginasProcessadas, motivo: String(error?.message || 'Falha na leitura do arquivo estruturado.') };
    }
  }
  if (!isPdf && !isImage) {
    return { tipo, disponivel: true, legivel: false, mecanismo: 'pdftotext', texto: '', dados: {}, confianca: 0, paginas_processadas: paginasProcessadas, motivo: 'Formato não suportado pelo leitor interno.' };
  }

  let parcialTexto: { texto: string; dados: Record<string, any>; confianca: number } | null = null;
  if (isPdf) {
    try {
      const { stdout } = await execFileAsync(
        process.env.PDFTOTEXT_BINARY || 'pdftotext',
        ['-layout', '-nopgbrk', arquivoPath, '-'],
        { timeout: timeoutTexto, maxBuffer: bufferMaximo, encoding: 'utf8' },
      );
      const texto = String(stdout || '').replace(/\u0000/g, '').trim();
      if (texto.length >= 20) {
        let { dados, confianca } = analisarTextoDocumentoLocal(tipo, texto, tipoDocumentoEsperado);
        const minimoConfianca = Number(process.env.LOCAL_EXTRACTION_MIN_CONFIDENCE || 0.55);
        const precisaOcrSuplementar = tipo === 'faturamento_12_meses'
          && (!dados.assinatura_socio_administrador?.presente || !dados.assinatura_contador?.presente)
          && String(process.env.LOCAL_OCR_SUPPLEMENT_ENABLED || 'true').toLowerCase() !== 'false';
        if (precisaOcrSuplementar) {
          const ocrSuplementar = await extrairTextoComOcrLocal(arquivoPath, true, timeoutOcr, bufferMaximo);
          if (ocrSuplementar.texto.length >= 20) {
            const combinado = `${texto}\n${ocrSuplementar.texto}`;
            const resultadoCombinado = analisarTextoDocumentoLocal(tipo, combinado, tipoDocumentoEsperado);
            if (resultadoCombinado.confianca >= confianca) {
              dados = resultadoCombinado.dados;
              confianca = resultadoCombinado.confianca;
              if (dados.assinatura_socio_administrador?.presente && dados.assinatura_contador?.presente) {
                return { tipo, disponivel: true, legivel: confianca >= minimoConfianca, mecanismo: 'tesseract', texto: combinado, dados, confianca, paginas_processadas: paginasProcessadas };
              }
            }
          }
        }
        if (confianca >= minimoConfianca) {
          return { tipo, disponivel: true, legivel: true, mecanismo: 'pdftotext', texto, dados, confianca, paginas_processadas: paginasProcessadas };
        }
        // Camada textual incompleta: tenta OCR antes de recorrer à API externa,
        // mas preserva o que foi lido para que os campos explícitos e as
        // pendências cheguem ao laudo mesmo quando o ambiente não tem OCR.
        parcialTexto = { texto, dados, confianca };
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
    const { dados, confianca } = analisarTextoDocumentoLocal(tipo, ocr.texto, tipoDocumentoEsperado);
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
    ...(parcialTexto ? {
      tipo,
      disponivel: true,
      legivel: false,
      mecanismo: 'pdftotext' as const,
      texto: parcialTexto.texto,
      dados: {
        ...parcialTexto.dados,
        qualidade_extracao: 'BAIXA_QUALIDADE',
        extracao_parcial: true,
        motivo_extracao: ocr.motivo || 'OCR local não produziu texto adicional; dados textuais parciais preservados.',
      },
      confianca: parcialTexto.confianca,
      paginas_processadas: paginasProcessadas,
      motivo: ocr.motivo || 'OCR local não produziu texto adicional; dados textuais parciais preservados para revisão humana.',
    } : {
    tipo,
    disponivel: ocr.disponivel,
    legivel: false,
    mecanismo: 'tesseract',
    texto: ocr.texto,
    dados: {},
    confianca: 0,
    paginas_processadas: paginasProcessadas,
    motivo: ocr.motivo || 'Documento sem texto legível pelo motor interno; revisão humana necessária.',
    }),
  };

}
