import { CLASSIFIER_VERSION, EXTRACTOR_VERSION, RULE_VERSION, SCHEMA_VERSION } from './documentalLaudoVersioning';
import type { DocumentProcessingEvidence } from './documentProcessingEvidence';
import { linhaObjetivaDocumento, nomeFuncionalDocumento, resumoObjetivoDocumento } from '../../shared/documentalPresentation';

export const RELATORIO_INICIAL_VERSION = '1.4.3';

type DocumentoRelatorio = Record<string, any>;
export type ModoRelatorioDocumental = 'institucional' | 'interno';

type RelatorioInicialParams = {
  dossie: Record<string, any>;
  documentos: DocumentoRelatorio[];
  evidencias: Map<string, DocumentProcessingEvidence>;
  modo?: ModoRelatorioDocumental;
};

function texto(value: unknown): string {
  return String(value ?? '').trim();
}

export function documentoAtivoParaRelatorio(documento: Record<string, any> = {}): boolean {
  const status = texto(documento.status).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return !['excluido', 'excluida', 'deleted', 'removido', 'removida'].includes(status) && !documento.excluido_em;
}

function normalizar(value: unknown): string {
  return texto(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function somenteDigitos(value: unknown): string {
  return texto(value).replace(/\D/g, '');
}

function primeiro(...values: unknown[]): unknown {
  return values.find((value) => value !== null && value !== undefined && texto(value) !== '') ?? null;
}

function lista(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function objeto(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function valorLegivel(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.map((item) => valorLegivel(item)).filter(Boolean).join(', ') || null;
  if (typeof value === 'object') return null;
  return texto(value) || null;
}

function resultadoDocumento(documento: DocumentoRelatorio): Record<string, any> {
  return objeto(documento.resultado_analise || documento.resultado_validacao?.analise_regra_documental);
}

function tipoDocumentoNormalizado(documento: DocumentoRelatorio): string {
  return normalizar(documento.tipo_documento || documento.codigo || documento.documento || documento.nome);
}

function textoCampos(documento: DocumentoRelatorio): string {
  return normalizar([
    documento.tipo_documento,
    documento.codigo,
    documento.documento,
    documento.nome,
    documento.bloco,
    documento.bloco_nome,
    documento.etapa,
  ].filter(Boolean).join(' '));
}

export function documentoEhInternoAssessoria(documento: DocumentoRelatorio): boolean {
  return /contrato[ _](assessoria|geral|prestacao)|contratos[ _]gerados|acompanhamento[ _]bancario|simulacao|relatorio[ _]interno|documento[ _]interno|assessoria/.test(textoCampos(documento));
}

function documentoEhSocio(documento: DocumentoRelatorio): boolean {
  return Boolean(documento.socio_id)
    || /socio|administrador|cpf|rg|identificacao[ _](pessoal|socio)|comprovante[ _]residencia/.test(textoCampos(documento));
}

function documentoEhInicial(documento: DocumentoRelatorio): boolean {
  const tipo = tipoDocumentoNormalizado(documento);
  return /cartao[ _]cnpj|cnpj[ _]cartao|(^|\s)qsa(\s|$)|quadro societario|enquadramento[ _]tributario|simples nacional|ccmei|situacao[ _]cadastral/.test(tipo);
}

function documentoEhSocietario(documento: DocumentoRelatorio): boolean {
  return /atos?[ _](da[ _])?junta|junta[ _]comercial|contrato[ _](social|consolid)|alteracao[ _]contratual|requerimento[ _]empresario|estatuto|ata|procuracao|representacao/.test(textoCampos(documento));
}

function documentoEhConsultaCredito(documento: DocumentoRelatorio): boolean {
  return /scr|registrato|ccs|ccf|cenprot|serasa|rating|bureau|protesto|inadimpl|restric|score|credito/.test(textoCampos(documento));
}

function documentoEhConsultaFiscal(documento: DocumentoRelatorio): boolean {
  return /cnd|cpend|divida ativa|divida_ativa|fgts|cndt|certidao|pgdas|defis|darf|dctf|ecf|simples|enquadramento|cadin|ecac|situacao cadastral|cnpj/.test(textoCampos(documento));
}

function periodoFaturamento(dados: Record<string, any>): { inicio: string | null; fim: string | null; competencias: number | null; texto: string | null } {
  const periodo = dados.periodo_analisado;
  const valores = Array.isArray(periodo)
    ? periodo.map((item) => texto(item)).filter(Boolean)
    : texto(periodo).split(/\s+a\s+|,|;/i).map((item) => item.trim()).filter(Boolean);
  const inicio = valores[0] || null;
  const fim = valores[valores.length - 1] || inicio;
  const parseMes = (value: string | null) => {
    const match = String(value || '').match(/(20\d{2})\s*[/\-.]\s*(0?[1-9]|1[0-2])/);
    return match ? Number(match[1]) * 12 + Number(match[2]) : null;
  };
  const inicioNumero = parseMes(inicio);
  const fimNumero = parseMes(fim);
  const diferenca = inicioNumero !== null && fimNumero !== null && fimNumero >= inicioNumero
    ? fimNumero - inicioNumero + 1
    : null;
  const competenciasObservadas = Array.isArray(dados.competencias_mensais) && dados.competencias_mensais.length
    ? dados.competencias_mensais.length
    : Array.isArray(dados.meses_referencia) && dados.meses_referencia.length
      ? dados.meses_referencia.length
      : null;
  const competencias = competenciasObservadas || diferenca;
  return {
    inicio,
    fim,
    competencias,
    texto: inicio && fim && inicio !== fim ? `${inicio} a ${fim}${competencias ? ` (${competencias} competências)` : ''}` : inicio,
  };
}

function documentoForaDoChecklistExecutivo(item: any): boolean {
  const tipo = tipoDocumentoNormalizado(item);
  return documentoEhInternoAssessoria(item)
    || /foto[ _]fachada|foto[ _]empresa|foto[ _]interna|\boutros?\b/.test(tipo);
}

function nomeChecklistExecutivo(item: any): string {
  const tipo = tipoDocumentoNormalizado(item);
  if (/cartao[ _]cnpj|cnpj[ _]cartao/.test(tipo)) return 'Cartão do CNPJ';
  if (/(^|\s)qsa(\s|$)|quadro societario/.test(tipo)) return 'QSA';
  if (/atos[ _]junta|junta[ _]comercial/.test(tipo)) return 'Ato da Junta Comercial';
  if (/contrato[ _]social|alteracao[ _]contratual|contrato[ _]consolid/.test(tipo)) return 'Contrato Social e Alterações';
  if (/rating|serasa|bureau|relatorio[ _]credito/.test(tipo)) return 'Consulta de Rating';
  if (/faturamento/.test(tipo)) return 'Faturamento';
  if (/defis|dasn[ _-]?simei/.test(tipo)) return 'DEFIS / DASN-SIMEI';
  if (/scr|registrato/.test(tipo)) return 'SCR/Registrato';
  if (/cnd|cpend|certidao/.test(tipo)) return item.documento || 'Certidão de Regularidade';
  return item.documento || item.nome || 'Documento';
}

function statusChecklistExecutivo(item: any): 'Confirmado' | 'Aprovado com ressalva' | 'Pendente' | 'Incompatível' | 'Não anexado' | 'Informativo' {
  const status = normalizar(item.status);
  if (!item.recebido && item.esperado === false) return 'Informativo';
  if (!item.recebido) return 'Não anexado';
  if (status.includes('informativo')) return 'Informativo';
  if (status.includes('incompat')) return 'Incompatível';
  if (item.esperado === false && (status.includes('ressalva') || status.includes('revis') || status.includes('pend'))) return 'Informativo';
  if (/socios_(identidade|endereco)|documento_socio|comprovante_residencia/.test(tipoDocumentoNormalizado(item))
    && status.includes('ressalva')
    && item.lido === true
    && item.dados_completos === true
    && !item.pendencia
    && !item.observacao
    && item.consistente !== false) return 'Informativo';
  if (status.includes('revis') || status.includes('pend') || status.includes('nao lido') || status.includes('não lido')) return 'Pendente';
  if (status.includes('ressalva')) return 'Aprovado com ressalva';
  if (status.includes('aprov') || status.includes('valid') || status.includes('requisito satisfeito') || status.includes('confirm')) return 'Confirmado';
  return 'Pendente';
}

function limparStatusDaLinha(value: unknown): string {
  return texto(value).replace(/\s*[—-]\s*status\s*:\s*[^.]+\.?\s*$/i, '').trim();
}

function pendenciaExecutiva(item: any, status: string, dados: Record<string, any>): string | null {
  const tipo = tipoDocumentoNormalizado(item);
  if (status === 'Informativo') return null;
  if (status === 'Não anexado') return `Pendência: anexar ${nomeChecklistExecutivo(item)}.`;
  if (status === 'Incompatível') return `Pendência: substituir pelo documento correto para ${nomeChecklistExecutivo(item)}.`;
  if (/faturamento/.test(tipo) && periodoFaturamento(dados).competencias !== 12) return 'Pendência: apresentar faturamento atualizado dos últimos 12 meses.';
  if (status === 'Pendente' || status === 'Aprovado com ressalva') {
    const motivo = texto(item.pendencia || item.resultado_analise?.diagnostico || item.observacao);
    return `Pendência: ${motivo || `confirmar ${nomeChecklistExecutivo(item)} com a fonte original.`}`;
  }
  return null;
}

function consolidarResultados(valores: unknown[]): string {
  const candidatos = valores.map((valor) => texto(valor)).filter(Boolean);
  let resultado = '';
  for (const candidato of candidatos) {
    if (!resultado) {
      resultado = candidato;
      continue;
    }
    const atualNormalizado = normalizar(resultado);
    const candidatoNormalizado = normalizar(candidato);
    if (atualNormalizado.includes(candidatoNormalizado)) continue;
    if (candidatoNormalizado.includes(atualNormalizado)) {
      resultado = candidato;
      continue;
    }
    const frases = Array.from(new Map(
      `${resultado} ${candidato}`
        .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/)
        .map((frase) => frase.trim())
        .filter(Boolean)
        .map((frase) => [normalizar(frase), frase]),
    ).values());
    resultado = frases.join(' ');
  }
  return resultado;
}

function resultadoExecutivo(item: any, status: string): string {
  const dados = dadosDocumento(item);
  const tipo = tipoDocumentoNormalizado(item);
  const resultado = resultadoDocumento(item);
  if (status === 'Informativo' && !item.recebido) return 'Não anexado — informativo para a etapa atual.';
  if (status === 'Confirmado' && /(^|\s)qsa(\s|$)|quadro societario/.test(tipo)) {
    const socios = lista(resultado.socios_lidos || dados.socios_lidos || dados.socios || resultado.socios)
      .map((socio: any) => texto(socio?.nome || socio?.nome_socio || socio?.razao_social || socio))
      .filter(Boolean);
    return `Quadro societário confirmado com o CNPJ${socios.length ? `. Sócios/administradores: ${socios.slice(0, 3).join(', ')}` : ''}.`;
  }
  if (status === 'Confirmado' && /contrato[ _]social|alteracao[ _]contratual|contrato[ _]consolid/.test(tipo)) {
    const data = primeiro(dados.data_registro, dados.contrato?.data_registro, resultado.data_registro);
    const arquivamento = primeiro(dados.numero_arquivamento, dados.contrato?.numero_arquivamento, resultado.numero_arquivamento);
    return `Contrato e alterações confirmados${data ? `; ato de ${data}` : ''}${arquivamento ? `, arquivamento ${arquivamento}` : ''}.`;
  }
  if (/faturamento/.test(tipo)) {
    const periodo = periodoFaturamento(dados);
    if (!periodo.texto) return 'Período dos últimos 12 meses não localizado.';
    return periodo.competencias === 12
      ? `Período: ${periodo.texto}. Documento cobre os últimos 12 meses.`
      : `Período: ${periodo.texto}. Documento não cobre os últimos 12 meses.`;
  }
  const linha = limparStatusDaLinha(item.linha_objetiva || item.resultado_objetivo);
  if (linha) {
    if (/enquadramento|simples/.test(tipo)) {
      const ocorrencias = Array.from(linha.matchAll(/enquadramento\s+tribut[aá]rio/gi));
      if (ocorrencias.length > 1 && ocorrencias[1].index !== undefined) {
        return linha.slice(0, ocorrencias[1].index).replace(/[\s—-]+$/, '').trim();
      }
    }
    return linha;
  }
  if (!item.recebido) return 'Documento ainda não anexado.';
  if (status === 'Confirmado') return 'Resultado confirmado.';
  return item.observacao || 'Resultado não confirmado.';
}

function construirChecklistExecutivo(inventario: any[], cruzamentos: any[], historico: any, documentos: DocumentoRelatorio[] = []) {
  const agrupados = new Map<string, any>();
  const adicionarUnico = (valores: unknown[]) => Array.from(new Set(valores.map((valor) => texto(valor)).filter(Boolean)));
  const prioridadeStatus: Record<string, number> = {
    'Informativo': 0,
    'Confirmado': 1,
    'Aprovado com ressalva': 2,
    'Pendente': 3,
    'Não anexado': 4,
    'Incompatível': 5,
  };
  for (const item of inventario) {
    if (documentoForaDoChecklistExecutivo(item)) continue;
    const fonte = documentos.find((documento) => String(documento.arquivo_id || documento.nome) === String(item.arquivo_id || item.arquivo));
    const itemComFonte = fonte ? { ...fonte, ...item } : item;
    const nome = nomeChecklistExecutivo(item);
    const chave = /contrato social e alteracoes/i.test(nome) ? 'contrato_social_alteracoes' : normalizar(nome);
    let status = statusChecklistExecutivo(item);
    const dados = dadosDocumento(itemComFonte);
    if (/faturamento/.test(tipoDocumentoNormalizado(item)) && periodoFaturamento(dados).competencias !== 12 && status === 'Confirmado') status = 'Pendente';
    const atual = {
      nome,
      status,
      resultado: resultadoExecutivo(itemComFonte, status),
      pendencia: pendenciaExecutiva(item, status, dados),
      arquivo_id: item.arquivo_id || null,
      arquivo_original: item.arquivo || item.nome_original || item.nome || null,
      arquivos_originais: adicionarUnico([item.arquivo, item.nome_original, item.nome]),
      datas: adicionarUnico([dados.data_consulta, dados.data_emissao, dados.data_registro, dados.data_ato, dados.data_validade]),
      data: primeiro(dados.data_consulta, dados.data_emissao, dados.data_registro, dados.data_ato, dados.data_validade) || null,
      tipos_documentais: adicionarUnico([item.codigo, item.tipo_documento, item.documento]),
      classificacao: documentoEhInicial(item) || documentoEhSocietario(item) || /faturamento|extrato|receita|movimentacao|contrato|alteracao|junta|enquadramento|simples|pgdas|defis|ecf|dctf|darf/i.test(tipoDocumentoNormalizado(item))
        ? 'documento_principal'
        : /fgts|extrato|cnd|cpend|cndt|certidao|cadin|pgfn|pgdas|defis|ecf|dctf|darf|ecac|situacao fiscal|rating|scr|registrato|ccs|ccf|cenprot|serasa|bureau|protesto|inadimpl|restric|score|credito/i.test(textoCampos(item))
          ? 'consulta_empresa'
          : documentoEhSocio(item)
            ? documentoEhConsultaCredito(item) || documentoEhConsultaFiscal(item) ? 'consulta_socio' : 'documentacao_socio'
            : documentoEhConsultaCredito(item) || documentoEhConsultaFiscal(item)
              ? 'consulta_empresa'
              : 'documento_principal',
    };
    const existente = agrupados.get(chave);
    if (!existente) {
      agrupados.set(chave, atual);
      continue;
    }
    existente.resultado = consolidarResultados([existente.resultado, atual.resultado]);
    existente.pendencia = existente.pendencia || atual.pendencia;
    existente.arquivo_id = existente.arquivo_id || atual.arquivo_id;
    existente.arquivo_original = existente.arquivo_original || atual.arquivo_original;
    existente.arquivos_originais = adicionarUnico([...(existente.arquivos_originais || []), ...(atual.arquivos_originais || [])]);
    existente.datas = adicionarUnico([...(existente.datas || []), ...(atual.datas || [])]);
    existente.data = existente.data || atual.data;
    existente.tipos_documentais = adicionarUnico([...(existente.tipos_documentais || []), ...(atual.tipos_documentais || [])]);
    if ((prioridadeStatus[atual.status] || 0) > (prioridadeStatus[existente.status] || 0)) existente.status = atual.status;
    if (existente.classificacao === 'documento_principal' && atual.classificacao !== 'documento_principal') existente.classificacao = atual.classificacao;
  }
  const itens = Array.from(agrupados.values());
  const faturamentoPendente = itens.some((item) => item.nome === 'Faturamento' && item.status === 'Pendente');
  const codigosAcionaveis = new Set(['identidade_empresarial', 'alteracoes', 'sociedade', 'registro', 'tributacao']);
  const confirmacoes = cruzamentos
    .filter((item) => ['identidade_empresarial', 'alteracoes', 'sociedade', 'registro', 'tributacao', 'credito', 'financeiro'].includes(item.codigo))
    .filter((item) => !(item.codigo === 'financeiro' && faturamentoPendente))
    .map((item) => ({ dimensao: item.dimensao, status: item.status, texto: item.descricao }))
    .filter((item) => item.status === 'consistente' || item.status === 'confirmado');
  const eventos = lista(historico?.eventos_cronologicos).filter((evento) => evento?.data || evento?.numero_arquivamento);
  const junta = itens.find((item) => item.nome === 'Ato da Junta Comercial');
  if (junta && historico?.nire) {
    const ato = historico.ato_mais_recente || {};
    junta.resultado = `NIRE: ${historico.nire}. Última alteração registrada em ${ato.data || 'data não localizada'}${ato.tipo ? ` (${ato.tipo})` : ''}. Ato conferido.`;
    if (ato.data) {
      junta.datas = adicionarUnico([...(junta.datas || []), ato.data]);
      junta.data = junta.data || ato.data;
    }
    if (historico.status === 'confirmado' && historico.continuidade_12_meses) junta.pendencia = null;
  }
  const contratos = itens.find((item) => item.nome === 'Contrato Social e Alterações');
  if (contratos && historico?.status === 'confirmado' && historico?.continuidade_12_meses) {
    contratos.status = 'Confirmado';
    const dataAto = historico.ato_mais_recente?.data || null;
    contratos.resultado = `Contrato e alterações confirmados${dataAto ? `; ato de ${dataAto}` : ''}${historico.nire ? `; NIRE ${historico.nire}` : ''}; datas e continuidade societária conferidos; ${historico.meses_comprovados || 12} meses comprovados.`;
    if (dataAto) {
      contratos.datas = adicionarUnico([...(contratos.datas || []), dataAto]);
      contratos.data = contratos.data || dataAto;
    }
    contratos.pendencia = null;
  }
  const pendencias = [
    ...itens.filter((item) => item.pendencia).map((item) => ({ documento: item.nome, acao: item.pendencia })),
    ...cruzamentos
      .filter((item) => codigosAcionaveis.has(item.codigo) && ['divergente', 'parcialmente consistente', 'não confirmado'].includes(item.status))
      .map((item) => ({ documento: item.dimensao, acao: `Pendência: ${item.descricao}` })),
  ];
  return { itens, confirmacoes, pendencias, eventos };
}

function valorCampoDocumento(dados: Record<string, any>, resultado: Record<string, any>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const valor = primeiro(dados[alias], resultado[alias]);
    const legivel = valorLegivel(valor);
    if (legivel) return legivel;
  }
  return null;
}

function itemModuloRelatorio(item: any, modulo: string): Record<string, any> {
  const resultado = resultadoDocumento(item);
  const dados = dadosDocumento(item);
  const datas = Array.from(new Set([
    ...(Array.isArray(item.datas) ? item.datas : []),
    primeiro(item.data, dados.data_documento, dados.data_ato, dados.data_registro, dados.competencia),
  ].map((valor) => texto(valor)).filter(Boolean)));
  const arquivos = Array.from(new Set([
    ...(Array.isArray(item.arquivos_originais) ? item.arquivos_originais : []),
    item.arquivo_original,
    item.arquivo,
    item.nome_original,
    item.nome,
  ].map((valor) => texto(valor)).filter(Boolean)));
  return {
    arquivo_id: item.arquivo_id || null,
    nome: item.nome || item.documento || 'Documento não identificado',
    modulo,
    status_validacao: item.status || item.status_validacao || 'Não informado',
    resultado: item.resultado || item.linha_objetiva || item.resultado_objetivo || null,
    datas,
    data: item.data || datas[0] || null,
    validade: primeiro(dados.data_validade, dados.validade, resultado.data_validade) || null,
    arquivo_original: arquivos[0] || null,
    arquivos_originais: arquivos,
    pendencia: item.pendencia || null,
    vigente: item.coberto_por_outro !== true,
  };
}

function statusInicialParaModulo(item: any): string {
  const status = normalizar(item.status);
  if (status.includes('nao_anex') || status.includes('não anex')) return 'Não anexado';
  if (status.includes('falha') || status.includes('diverg')) return 'Revisão necessária';
  if (status.includes('reanalise')) return 'Reanálise necessária';
  if (item.consistente === true || status === 'ok' || status === 'validado' || status === 'confirmado') return 'Confirmado';
  if (item.analisado === true) return 'Analisado com ressalva';
  return 'Não analisado';
}

function construirModulosRelatorio(
  dossie: Record<string, any>,
  inventario: any[],
  dadosCadastrais: any[],
  historicoSocietario: any,
  checklistExecutivo: any,
  modo: ModoRelatorioDocumental = 'institucional',
) {
  const empresa = objeto(dossie.empresa);
  const identidade = objeto(dossie.identidade_cnpj);
  const itensChecklist = lista(checklistExecutivo.itens).filter((item) => item.vigente !== false);
  const identidadeCampos = dadosCadastrais.map((item) => ({
    campo: item.campo,
    valor: item.valor,
    status: item.status,
    fontes: item.fontes || [],
  }));
  const completude = identidadeCampos.length
    ? Math.round((identidadeCampos.filter((item) => item.valor && item.status !== 'não localizado').length / identidadeCampos.length) * 100)
    : 0;
  const itemModulo = (item: any, modulo: string) => itemModuloRelatorio(item, modulo);
  const documentosPrincipais = itensChecklist
    .filter((item) => item.classificacao === 'documento_principal')
    .map((item) => itemModulo(item, 'documentos_principais'));
  const consultasEmpresa = itensChecklist
    .filter((item) => item.classificacao === 'consulta_empresa')
    .map((item) => itemModulo(item, 'consultas_empresa'));
  const documentacaoSocios = itensChecklist
    .filter((item) => item.classificacao === 'documentacao_socio')
    .map((item) => itemModulo(item, 'documentacao_socios'));
  const consultasSocios = itensChecklist
    .filter((item) => item.classificacao === 'consulta_socio')
    .map((item) => itemModulo(item, 'consultas_socios'));
  const pendencias = itensChecklist
    .filter((item) => item.pendencia && ['Pendente', 'Não anexado', 'Incompatível', 'Aprovado com ressalva'].includes(item.status))
    .map((item) => ({ documento: item.nome, acao: item.pendencia }))
    .filter((item, index, todos) => todos.findIndex((candidate) => `${candidate.documento}|${candidate.acao}` === `${item.documento}|${item.acao}`) === index);
  const internos = inventario.filter(documentoEhInternoAssessoria).map((item) => itemModuloRelatorio(item, 'ficha_empresa'));
  const fichaInterna = {
    id: 'ficha_empresa', titulo: 'Ficha da empresa e relacionamento', ordem: 7, visibilidade: 'interna', incluida: modo === 'interno',
    descricao: 'Informações comerciais, operacionais e documentos produzidos pela assessoria.',
    itens: modo === 'interno' ? internos : [],
    quantidade_oculta: modo === 'institucional' ? internos.length : 0,
    campos: [],
  };
  const modulos = [
    {
      id: 'identidade_empresa', titulo: 'Identidade da empresa', ordem: 1, visibilidade: 'institucional', incluida: true,
      descricao: 'Dados cadastrais consolidados a partir do cadastro e das fontes documentais disponíveis.',
      campos: [
        ...identidadeCampos,
        { campo: 'Data de criação do cadastro', valor: primeiro(empresa.created_at, empresa.criado_em), status: empresa.created_at || empresa.criado_em ? 'confirmado' : 'não localizado', fontes: ['Cadastro da empresa'] },
        { campo: 'Data da última atualização do cadastro', valor: primeiro(empresa.updated_at, empresa.atualizado_em), status: empresa.updated_at || empresa.atualizado_em ? 'confirmado' : 'não localizado', fontes: ['Cadastro da empresa'] },
        { campo: 'Completude cadastral', valor: `${completude}%`, status: completude === 100 ? 'confirmado' : 'parcial', fontes: ['Campos cadastrais disponíveis'] },
      ], itens: [],
    },
    {
      id: 'documentos_principais', titulo: 'Documentos principais da empresa', ordem: 2, visibilidade: 'institucional', incluida: true,
      descricao: 'Documentos de identidade cadastral, enquadramento, constituição, societário, faturamento e demais comprovações empresariais.',
      itens: documentosPrincipais,
      campos: [
        { campo: 'NIRE', valor: historicoSocietario.nire, status: historicoSocietario.nire ? 'confirmado' : 'não localizado', fontes: historicoSocietario.fontes || [] },
        { campo: 'Continuidade societária', valor: historicoSocietario.continuidade_12_meses ? `${historicoSocietario.meses_comprovados || 12} meses comprovados` : 'Não comprovada integralmente', status: historicoSocietario.continuidade_12_meses ? 'confirmado' : 'pendente', fontes: historicoSocietario.fontes || [] },
      ],
      eventos: historicoSocietario.eventos_cronologicos || [],
    },
    {
      id: 'consultas_empresa', titulo: 'Consultas da empresa', ordem: 3, visibilidade: 'institucional', incluida: true,
      descricao: 'Consultas fiscais, cadastrais, de crédito e demais verificações da empresa.',
      itens: consultasEmpresa, campos: [],
    },
    {
      id: 'documentacao_socios', titulo: 'Documentação dos sócios', ordem: 4, visibilidade: 'institucional', incluida: true,
      descricao: 'Documentos de identificação, endereço e representação das pessoas vinculadas à sociedade.',
      itens: documentacaoSocios,
      socios: lista(dossie.socios).length
        ? dossie.socios
        : Array.isArray(identidade.validation?.socios)
          ? identidade.validation.socios
          : Array.isArray(identidade.documentos_iniciais?.qsa?.socios_lidos)
            ? identidade.documentos_iniciais.qsa.socios_lidos
            : [],
      campos: [],
    },
    {
      id: 'consultas_socios', titulo: 'Consultas dos sócios', ordem: 5, visibilidade: 'institucional', incluida: true,
      descricao: 'Consultas e verificações vinculadas aos sócios e administradores.',
      itens: consultasSocios, campos: [],
    },
    {
      id: 'pendencias', titulo: 'Pendências e faltantes', ordem: 6, visibilidade: 'institucional', incluida: true,
      descricao: 'Ações documentais objetivas ainda necessárias para completar o acervo.',
      itens: [], campos: [], pendencias,
    },
  ];
  return modo === 'interno' ? [...modulos, fichaInterna] : modulos;
}

function dadosDocumento(documento: DocumentoRelatorio): Record<string, any> {
  const resultado = resultadoDocumento(documento);
  return objeto(resultado.dados_extraidos || documento.dados_extraidos);
}

function fontesDocumento(documento: DocumentoRelatorio): string[] {
  return Array.from(new Set([
    texto(documento.nome || documento.nome_original || documento.tipo_documento || 'Documento'),
    documento.arquivo_id ? `arquivo:${documento.arquivo_id}` : null,
  ].filter(Boolean) as string[]));
}

function compatibilidadeDocumento(documento: DocumentoRelatorio): boolean | null {
  const dados = dadosDocumento(documento);
  const resultado = resultadoDocumento(documento);
  if (dados.documento_compativel === false || dados.identidade_status === 'INCOMPATIVEL' || resultado.documento_compativel === false) return false;
  if (dados.documento_compativel === true || dados.identidade_status === 'IDENTIFICADO' || resultado.documento_compativel === true) return true;
  return null;
}

function camposExtraidos(documento: DocumentoRelatorio): string[] {
  const dados = dadosDocumento(documento);
  const resultado = resultadoDocumento(documento);
  const campos = [
    ...lista(resultado.campos).map((item) => texto(item?.label || item?.campo || item)).filter(Boolean),
    ...Object.keys(dados).filter((key) => !key.startsWith('__') && !['evidencias', 'alertas', 'divergencias'].includes(key)),
  ];
  return Array.from(new Set(campos));
}

function camposNaoLocalizados(documento: DocumentoRelatorio): string[] {
  const dados = dadosDocumento(documento);
  const resultado = resultadoDocumento(documento);
  return Array.from(new Set([
    ...lista(dados.campos_obrigatorios_ausentes),
    ...lista(dados.campos_nao_localizados),
    ...lista(resultado.campos_obrigatorios_ausentes),
  ].map((item) => texto(item?.campo || item?.label || item)).filter(Boolean)));
}

function regioesIlegiveis(documento: DocumentoRelatorio): string[] {
  const dados = dadosDocumento(documento);
  const resultado = resultadoDocumento(documento);
  return Array.from(new Set([
    ...lista(dados.regioes_ilegiveis),
    ...lista(dados.areas_ilegiveis),
    ...lista(resultado.regioes_ilegiveis),
  ].map((item) => texto(item?.regiao || item?.descricao || item)).filter(Boolean)));
}

function estadoDocumento(documento: DocumentoRelatorio): 'aprovado' | 'ressalva' | 'pendente' | 'divergente' | 'incompativel' | 'revisao_humana' | 'nao_lido' {
  const dados = dadosDocumento(documento);
  const resultado = resultadoDocumento(documento);
  const incompatível = compatibilidadeDocumento(documento) === false;
  if (incompatível) return 'incompativel';
  const divergente = lista(resultado.divergencias).length > 0 || lista(resultado.alertas).some((item) => /diverg|conflit|não confere|nao confere/i.test(texto(item?.codigo || item?.mensagem || item)));
  if (divergente) return 'divergente';
  const motivosRevisao = lista(resultado.motivos_revisao).length > 0;
  const laudoSocietarioConcluido = ['atual', 'historico'].includes(normalizar(resultado.status_societario)) && !motivosRevisao;
  const statusConcluido = /^(validado|concluido|conclu[ií]do|ok|ativo)$/i.test(texto(documento.status || resultado.status));
  const conclusivoPorEvidencia = documento.consistente === true
    || resultado.satisfaz_requisito === true
    || dados.satisfaz_requisito === true
    || (dados.documento_compativel === true && statusConcluido)
    || laudoSocietarioConcluido;
  const validadoLegado = /^(validado|ok|conclu[ií]do)$/i.test(texto(documento.pendencia || documento.observacao))
    && (documento.analisado === true || documento.lido === true)
    && resultado.revisao_humana_necessaria !== true
    && resultado.analysis_status !== 'REANALISE_NECESSARIA'
    && !motivosRevisao;
  const revisao = (documento.exige_revisao_humana === true || resultado.revisao_humana_necessaria === true || resultado.analysis_status === 'REANALISE_NECESSARIA')
    && !conclusivoPorEvidencia
    && !validadoLegado;
  if (revisao && documento.analisado === true) return 'revisao_humana';
  if (documento.analisado !== true && !validadoLegado) return 'nao_lido';
  const alertaRelevante = lista(resultado.alertas).some((item) => /erro|diverg|incomp|revis|pend|ausen|falt|ileg[ií]vel|não confere|nao confere/i.test(texto(item?.codigo || item?.mensagem || item)));
  const diagnosticoRelevante = /erro|diverg|incomp|revis|pend|ausen|falt|ileg[ií]vel|não confere|nao confere/i.test(texto(resultado.diagnostico));
  if (conclusivoPorEvidencia && (alertaRelevante || diagnosticoRelevante)) return 'ressalva';
  if (conclusivoPorEvidencia || validadoLegado) return 'aprovado';
  return 'pendente';
}

function rotuloEstado(estado: ReturnType<typeof estadoDocumento>): string {
  const labels: Record<ReturnType<typeof estadoDocumento>, string> = {
    aprovado: 'Aprovado',
    ressalva: 'Aprovado com ressalva',
    pendente: 'Pendente',
    divergente: 'Divergente',
    incompativel: 'Incompatível comprovado',
    revisao_humana: 'Revisão humana necessária',
    nao_lido: 'Enviado, mas não lido',
  };
  return labels[estado];
}

function tipoConfirmado(documento: DocumentoRelatorio): { confirmado: boolean | null; identificado: string | null } {
  const dados = dadosDocumento(documento);
  const identificado = primeiro(dados.tipo_detectado, dados.tipo_documental_identificado, dados.tipo_documento_identificado);
  const compatibilidade = compatibilidadeDocumento(documento);
  return { confirmado: compatibilidade ?? (identificado ? true : null), identificado: valorLegivel(identificado || documento.tipo_documento) };
}

function gerarEvidencia(documento: DocumentoRelatorio, evidencia: DocumentProcessingEvidence | undefined) {
  const resultado = resultadoDocumento(documento);
  const dados = dadosDocumento(documento);
  const paginasProcessadas = Number.isInteger(Number(resultado.paginas_processadas)) && Number(resultado.paginas_processadas) > 0
    ? Number(resultado.paginas_processadas)
    : Number.isInteger(Number(dados.paginas_processadas)) && Number(dados.paginas_processadas) > 0
      ? Number(dados.paginas_processadas)
      : evidencia?.paginas_processadas ?? null;
  return {
    arquivo_id: documento.arquivo_id || null,
    nome_arquivo: documento.nome || documento.nome_original || null,
    arquivo_aberto: evidencia?.arquivo_aberto ?? false,
    arquivo_localizado: evidencia?.arquivo_localizado ?? false,
    paginas_processadas: paginasProcessadas,
    paginas_documento: evidencia?.paginas_documento ?? null,
    unidade_processada: evidencia?.unidade_processada || 'desconhecida',
    tipo_arquivo: evidencia?.tipo_arquivo || 'desconhecido',
    mecanismo_verificacao: evidencia?.mecanismo_verificacao || 'indisponivel',
    campos_extraidos: camposExtraidos(documento),
    campos_nao_localizados: camposNaoLocalizados(documento),
    regioes_ilegiveis: regioesIlegiveis(documento),
    resultado_obtido: rotuloEstado(estadoDocumento(documento)),
    status_laudo: resultado.analysis_status || resultado.status || (documento.analisado ? 'concluido' : 'nao_processado'),
    fonte_leitura: primeiro(resultado.fonte_extracao, resultado.modelo_ia, dados.fonte_extracao, documento.origem) || null,
    confianca: primeiro(resultado.nivel_confianca, resultado.confianca, dados.confianca) || null,
    evidencias: lista(resultado.evidencias).map((item) => ({
      campo: texto(item?.campo) || null,
      pagina: item?.pagina ?? null,
      trecho_disponivel: Boolean(texto(item?.trecho || item?.texto)),
    })),
    motivo: evidencia?.motivo || resultado.diagnostico || documento.observacao || null,
  };
}

function construirInventario(params: RelatorioInicialParams) {
  const mapa = objeto(params.dossie.mapa_documental_credito);
  const esperados: Array<Record<string, any>> = lista(mapa.etapas).flatMap((etapa) => lista(etapa?.documentos).map((documento) => ({ ...objeto(documento), etapa: etapa?.titulo || `Etapa ${etapa?.numero || ''}`.trim() })));
  const recebidos = params.documentos;
  const usado = new Set<string>();
  const correspondeAoEsperado = (documento: DocumentoRelatorio, esperado: Record<string, any>) => {
    const tipos = lista(esperado.tipos_arquivo).map(String);
    return tipos.includes(String(documento.tipo_documento)) || String(esperado.codigo || '') === String(documento.tipo_documento || '');
  };
  const encontrarRecebido = (esperado: Record<string, any>) => recebidos.find((documento) => {
    const match = correspondeAoEsperado(documento, esperado);
    if (match) usado.add(String(documento.arquivo_id || documento.nome));
    return match;
  });
  const inventarioEsperado = esperados.map((esperado) => {
    const documento = encontrarRecebido(esperado);
    if (!documento) {
      return {
        codigo: esperado.codigo || null,
        documento: esperado.nome || esperado.codigo || 'Documento esperado',
        etapa: esperado.etapa || null,
        esperado: esperado.obrigatorio !== false,
        recebido: false,
        lido: false,
        tipo_confirmado: null,
        dados_completos: false,
        consistente: null,
        status: esperado.obrigatorio === false ? 'Não aplicável ou não enviado' : 'Não enviado',
        pendencia: esperado.obrigatorio === false ? null : 'Documento esperado ainda não anexado.',
        evidencia: null,
      };
    }
    const estado = estadoDocumento(documento);
    const tipo = tipoConfirmado(documento);
    const dados = dadosDocumento(documento);
    const nomeFuncional = nomeFuncionalDocumento(documento, esperado.nome || esperado.codigo);
    return {
      codigo: esperado.codigo || documento.tipo_documento || null,
      documento: nomeFuncional,
      arquivo_id: documento.arquivo_id || null,
      arquivo: documento.nome || documento.nome_original || null,
      etapa: esperado.etapa || documento.bloco || null,
      esperado: esperado.obrigatorio !== false,
      recebido: true,
      lido: documento.analisado === true,
      tipo_confirmado: tipo.confirmado,
      tipo_identificado: tipo.identificado,
      dados_completos: camposExtraidos(documento).length > 0 || Object.keys(dados).length > 0,
      consistente: documento.consistente === true ? true : estado === 'incompativel' || estado === 'divergente' ? false : null,
      status: rotuloEstado(estado),
      pendencia: estado === 'aprovado' || estado === 'ressalva' ? null : documento.observacao || resultadoDocumento(documento).diagnostico || 'A análise precisa ser concluída ou revisada.',
      resultado_objetivo: resumoObjetivoDocumento(resultadoDocumento(documento), documento, rotuloEstado(estado)),
      linha_objetiva: linhaObjetivaDocumento(resultadoDocumento(documento), documento, nomeFuncional, rotuloEstado(estado)),
      evidencia: gerarEvidencia(documento, params.evidencias.get(String(documento.arquivo_id || ''))),
    };
  });
  const extras = recebidos.filter((documento) => !usado.has(String(documento.arquivo_id || documento.nome))).map((documento) => {
    const estado = estadoDocumento(documento);
    const tipo = tipoConfirmado(documento);
    const nomeFuncional = nomeFuncionalDocumento(documento);
    const requisitoCobertoPorOutro = estado === 'nao_lido' && esperados.some((esperado) => correspondeAoEsperado(documento, esperado)
      && recebidos.some((outro) => String(outro.arquivo_id || outro.nome) !== String(documento.arquivo_id || documento.nome)
        && correspondeAoEsperado(outro, esperado)
        && ['aprovado', 'ressalva'].includes(estadoDocumento(outro))));
    return {
      codigo: documento.tipo_documento || null,
      documento: nomeFuncional,
      arquivo_id: documento.arquivo_id || null,
      arquivo: documento.nome || documento.nome_original || null,
      etapa: documento.bloco || 'Acervo documental',
      esperado: false,
      recebido: true,
      lido: documento.analisado === true,
      tipo_confirmado: tipo.confirmado,
      tipo_identificado: tipo.identificado,
      dados_completos: camposExtraidos(documento).length > 0,
      consistente: documento.consistente === true ? true : estado === 'incompativel' || estado === 'divergente' ? false : null,
      coberto_por_outro: requisitoCobertoPorOutro,
      status: requisitoCobertoPorOutro ? 'Informativo — requisito já coberto' : rotuloEstado(estado),
      pendencia: requisitoCobertoPorOutro || estado === 'aprovado' || estado === 'ressalva' ? null : documento.observacao || 'Documento anexado fora da lista de exigências ou sem conclusão suficiente.',
      resultado_objetivo: resumoObjetivoDocumento(resultadoDocumento(documento), documento, requisitoCobertoPorOutro ? 'Informativo' : rotuloEstado(estado)),
      linha_objetiva: linhaObjetivaDocumento(resultadoDocumento(documento), documento, nomeFuncional, requisitoCobertoPorOutro ? 'Informativo' : rotuloEstado(estado)),
      evidencia: gerarEvidencia(documento, params.evidencias.get(String(documento.arquivo_id || ''))),
    };
  });
  return [...inventarioEsperado, ...extras];
}

function tipoDocumentoCadastral(documento: DocumentoRelatorio): string {
  return normalizar(documento.tipo_documento || documento.codigo || documento.nome);
}

function removerSufixoSocietario(value: string): string {
  return value
    .replace(/\b(sociedade empresaria limitada|sociedade empresaria|sociedade limitada|empresa individual|eireli|ltda|me|epp|sa|s\.a\.)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chaveCadastral(campo: string, valor: string): string {
  const normalizado = normalizar(valor);
  if (campo === 'CNPJ') return somenteDigitos(valor);
  if (campo === 'Razão social' || campo === 'Nome fantasia') return removerSufixoSocietario(normalizado).replace(/\s+/g, '');
  if (campo === 'Situação cadastral') return /\bativa\b|\bactive\b/i.test(normalizado) ? 'ativa' : normalizado;
  if (campo === 'Natureza jurídica') {
    if (/206\s*[-/]?\s*2|sociedade empresaria limitada|sociedade limitada/.test(normalizado)) return '206-2';
    return normalizado.replace(/[^a-z0-9]/g, '');
  }
  if (campo === 'Endereço') {
    if (/numero complemento|n[uú]mero complemento|logradouro/.test(normalizado)) return '';
    return normalizado.replace(/[^a-z0-9]/g, '');
  }
  if (campo === 'Atividade principal') {
    const digitos = somenteDigitos(valor);
    return digitos.length >= 5 ? digitos : normalizado.replace(/[^a-z0-9]/g, '');
  }
  if (campo === 'Capital social') {
    const numero = normalizado.replace(/r\$|\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
    const valorNumerico = Number(numero);
    return Number.isFinite(valorNumerico) ? String(valorNumerico) : numero;
  }
  return normalizado;
}

function candidatoCadastralAceitavel(campo: string, valor: string, documento?: DocumentoRelatorio): boolean {
  const chave = chaveCadastral(campo, valor);
  if (!chave) return false;
  if (campo === 'CNPJ' && chave.length !== 14) return false;
  if ((campo === 'Razão social' || campo === 'Nome fantasia') && /^(cnpj da matriz|cnae|numero complemento)$/.test(normalizar(valor))) return false;
  if (campo === 'Situação cadastral' && !/ativa|inativa|baixada|suspensa|nula|ativa/.test(normalizar(valor))) return false;
  if (campo === 'Natureza jurídica' && /^(cnae|natureza juridica)$/.test(normalizar(valor))) return false;
  if (campo === 'Endereço' && /numero complemento|logradouro/.test(normalizar(valor))) return false;
  if (campo === 'Capital social' && documento && !/qsa|cartao[ _]cnpj|cnpj[ _]cartao/.test(tipoDocumentoCadastral(documento))) return false;
  return true;
}

function candidatosDeDocumentos(documentos: DocumentoRelatorio[], aliases: string[], campo = ''): Array<{ valor: string; fonte: string; documento?: DocumentoRelatorio }> {
  const encontrados: Array<{ valor: string; fonte: string; documento?: DocumentoRelatorio }> = [];
  for (const documento of documentos) {
    const dados = dadosDocumento(documento);
    for (const alias of aliases) {
      const valor = valorLegivel(dados[alias]);
      if (valor && (!campo || candidatoCadastralAceitavel(campo, valor, documento))) encontrados.push({ valor, fonte: texto(documento.nome || documento.tipo_documento || 'Documento'), documento });
    }
  }
  return encontrados;
}

function consolidarDadosCadastrais(dossie: Record<string, any>, documentos: DocumentoRelatorio[]) {
  const empresa = objeto(dossie.empresa);
  const campos: Array<{ campo: string; aliases: string[]; valor: unknown; fonte: string }> = [
    { campo: 'CNPJ', aliases: ['cnpj'], valor: primeiro(empresa.cnpj), fonte: 'Cadastro da empresa' },
    { campo: 'Razão social', aliases: ['razao_social', 'nome_empresarial'], valor: primeiro(empresa.razao_social), fonte: 'Cadastro da empresa' },
    { campo: 'Nome fantasia', aliases: ['nome_fantasia'], valor: primeiro(empresa.nome_fantasia), fonte: 'Cadastro da empresa' },
    { campo: 'Situação cadastral', aliases: ['situacao_cadastral', 'situacao'], valor: primeiro(empresa.situacao_cadastral), fonte: 'Cadastro da empresa' },
    { campo: 'Data de abertura/constituição', aliases: ['data_abertura', 'data_constituicao'], valor: primeiro(empresa.data_abertura, empresa.data_constituicao), fonte: 'Cadastro da empresa' },
    { campo: 'Natureza jurídica', aliases: ['natureza_juridica'], valor: primeiro(empresa.natureza_juridica), fonte: 'Cadastro da empresa' },
    { campo: 'Porte', aliases: ['porte', 'porte_receita'], valor: primeiro(empresa.porte, empresa.porte_receita), fonte: 'Cadastro da empresa' },
    { campo: 'Estado', aliases: ['estado', 'uf'], valor: primeiro(empresa.estado, empresa.uf), fonte: 'Cadastro da empresa' },
    { campo: 'Município', aliases: ['cidade', 'municipio'], valor: primeiro(empresa.cidade, empresa.municipio), fonte: 'Cadastro da empresa' },
    { campo: 'Endereço', aliases: ['endereco', 'logradouro'], valor: primeiro(empresa.endereco, empresa.logradouro), fonte: 'Cadastro da empresa' },
    { campo: 'Atividade principal', aliases: ['cnae_principal', 'atividade_economica_principal', 'atividade_principal'], valor: primeiro(empresa.cnae_principal, empresa.atividade_economica_principal, empresa.atividade_principal), fonte: 'Cadastro da empresa' },
    { campo: 'Atividades secundárias', aliases: ['atividades_secundarias', 'cnaes_secundarios'], valor: primeiro(empresa.atividades_secundarias, empresa.cnaes_secundarios), fonte: 'Cadastro da empresa' },
    { campo: 'Telefone', aliases: ['telefone', 'telefone_principal'], valor: primeiro(empresa.telefone, empresa.telefone_principal), fonte: 'Cadastro da empresa' },
    { campo: 'E-mail', aliases: ['email', 'e_mail'], valor: primeiro(empresa.email, empresa.e_mail), fonte: 'Cadastro da empresa' },
    { campo: 'Responsável pelo cadastro', aliases: ['responsavel_cadastro', 'responsavel_nome', 'responsavel_id'], valor: primeiro(empresa.responsavel_cadastro, empresa.responsavel_nome, empresa.responsavel_id), fonte: 'Cadastro da empresa' },
    { campo: 'Capital social', aliases: ['capital_social'], valor: primeiro(empresa.capital_social), fonte: 'Cadastro da empresa' },
  ];
  return campos.map((campo) => {
    const valor = valorLegivel(campo.valor);
    const candidatos: Array<{ valor: string; fonte: string; documento?: DocumentoRelatorio }> = valor ? [{ valor, fonte: campo.fonte }] : [];
    candidatos.push(...candidatosDeDocumentos(documentos, campo.aliases, campo.campo));
    const candidatosAceitos = candidatos.filter((item) => candidatoCadastralAceitavel(campo.campo, item.valor, item.documento));
    const distintos = Array.from(new Map(candidatosAceitos.map((item) => [chaveCadastral(campo.campo, item.valor), item])).values());
    const valores = Array.from(new Set(candidatosAceitos.map((item) => chaveCadastral(campo.campo, item.valor))));
    const cnpjCompleto = campo.campo === 'CNPJ' && valores.some((valor) => valor.length === 14);
    const valoresFinais = campo.campo === 'CNPJ' && cnpjCompleto ? valores.filter((valor) => valor.length === 14) : valores;
    const distintosFinais = campo.campo === 'CNPJ' && cnpjCompleto
      ? distintos.filter((item) => chaveCadastral(campo.campo, item.valor).length === 14)
      : distintos;
    if (!distintosFinais.length) return { campo: campo.campo, valor: null, status: 'não localizado', fontes: [], confianca: 'não confirmado', confirmado_por_multiplas_fontes: false };
    return {
      campo: campo.campo,
      valor: distintosFinais[0].valor,
      valores_encontrados: distintosFinais.map((item) => item.valor),
      status: valoresFinais.length > 1 ? 'divergente' : valoresFinais.length === 1 && candidatosAceitos.length > 1 ? 'corroborado' : 'confirmado',
      fontes: distintosFinais.map((item) => item.fonte),
      confianca: valoresFinais.length > 1 ? 'baixa' : candidatosAceitos.length > 1 ? 'alta' : 'média',
      confirmado_por_multiplas_fontes: candidatosAceitos.length > 1 && valoresFinais.length === 1,
    };
  });
}

function valorRegime(dossie: Record<string, any>, documentos: DocumentoRelatorio[]): string | null {
  const mapa = objeto(dossie.mapa_documental_credito);
  const enquadramento = objeto(dossie.identidade_cnpj?.validation?.taxRegime);
  const candidato = primeiro(mapa.regime_descricao, enquadramento.regime, dossie.empresa?.regime_tributario);
  return valorLegivel(candidato);
}

function statusCruzamento(status: string, descricao: string) {
  return { status, descricao };
}

function construirCruzamentos(dossie: Record<string, any>, documentos: DocumentoRelatorio[], inventario: any[]) {
  const empresa = objeto(dossie.empresa);
  const societaria = objeto(dossie.documentacao_societaria);
  const identidade = objeto(dossie.identidade_cnpj);
  const mapa = objeto(dossie.mapa_documental_credito);
  const porTipo = (padrao: RegExp) => documentos.filter((doc) => padrao.test(`${doc.tipo_documento} ${doc.nome}`));
  const resultado = (doc: DocumentoRelatorio) => dadosDocumento(doc);
  const docsIdentidade = porTipo(/cnpj|qsa|enquadramento|simples/i);
  const cnpsBrutos = Array.from(new Set([
    somenteDigitos(empresa.cnpj),
    ...docsIdentidade.map((doc) => somenteDigitos(primeiro(resultado(doc).cnpj, resultado(doc).cnpj_empresa, resultado(doc).cnpj_documento))),
  ].filter(Boolean)));
  // Identificadores truncados, como "52.008.360" em alguns relatórios de
  // bureau, não são um segundo CNPJ. Eles não podem derrubar a identidade
  // confirmada pelo CNPJ completo de 14 dígitos.
  const cnps = cnpsBrutos.filter((cnpj) => cnpj.length === 14);
  const identidadeStatus = cnps.length <= 1 && cnps.length > 0 ? 'consistente' : cnps.length > 1 ? 'divergente' : 'não confirmado';
  const resultados: Array<Record<string, any>> = [
    { codigo: 'identidade_empresarial', dimensao: 'Identidade empresarial', ...statusCruzamento(identidadeStatus, cnps.length > 1 ? `Foram encontrados CNPJs conflitantes: ${cnps.join(', ')}.` : cnps.length === 1 ? 'CNPJ único identificado nas fontes disponíveis; identificadores parciais não foram tratados como conflito.' : 'CNPJ completo não localizado nas fontes analisadas.'), documentos: docsIdentidade.map((doc) => doc.nome), valores: { cnpj: cnps, identificadores_parciais: cnpsBrutos.filter((cnpj) => cnpj.length !== 14) } },
    { codigo: 'constituicao', dimensao: 'Constituição', ...statusCruzamento(identidade.apto_para_avancar === true ? 'consistente' : 'não confirmado', identidade.apto_para_avancar === true ? 'A identidade cadastral inicial foi concluída; datas de constituição devem ser lidas nos documentos em que estiverem presentes.' : 'A constituição ainda não foi confirmada pela Etapa 1.'), documentos: docsIdentidade.map((doc) => doc.nome) },
    { codigo: 'alteracoes', dimensao: 'Alterações', ...statusCruzamento(societaria.analisado ? societaria.apto_para_avancar === true ? 'consistente' : societaria.bloqueios?.length ? 'divergente' : 'parcialmente consistente' : 'não confirmado', societaria.diagnostico || 'Histórico de alterações ainda não concluído.'), documentos: lista(societaria.documentos_analisados).map((doc) => doc.nome || doc.arquivo_id).filter(Boolean) },
    { codigo: 'sociedade', dimensao: 'Sócios, administradores e representação', ...statusCruzamento(societaria.confronto_qsa?.status === 'confirmado' || identidade.validation?.qsaMatches === true ? 'consistente' : societaria.confronto_qsa?.status === 'divergente' ? 'divergente' : 'não confirmado', societaria.confronto_qsa?.descricao || (societaria.confronto_qsa?.status === 'confirmado' || identidade.validation?.qsaMatches === true ? 'Quadro societário conferido com o CNPJ.' : 'O quadro societário não foi corroborado por múltiplas fontes.')), documentos: ['QSA', ...lista(societaria.documentos_analisados).map((doc) => doc.nome || doc.arquivo_id).filter(Boolean)] },
    { codigo: 'registro', dimensao: 'Registro, Junta e NIRE', ...statusCruzamento(societaria.nire_confere === true && societaria.data_confere === true ? 'consistente' : societaria.bloqueios?.some((item: any) => /NIRE|data|registro/i.test(texto(item))) ? 'divergente' : 'não confirmado', societaria.nire_confere === true ? 'NIRE conferido entre Junta e contrato.' : 'NIRE ou data do registro não foram confirmados integralmente.'), documentos: ['Atos da Junta Comercial', ...lista(societaria.documentos_analisados).map((doc) => doc.nome || doc.arquivo_id).filter(Boolean)] },
    { codigo: 'tributacao', dimensao: 'Tributação e enquadramento', ...statusCruzamento(valorRegime(dossie, documentos) ? 'consistente' : 'não confirmado', valorRegime(dossie, documentos) ? `Regime identificado: ${valorRegime(dossie, documentos)}.` : 'Regime tributário não confirmado por fonte suficiente.'), documentos: porTipo(/pgdas|defis|simples|enquadramento|ecf|dctf|darf|livro/i).map((doc) => doc.nome) },
    { codigo: 'atividade', dimensao: 'Atividade econômica e objeto social', ...statusCruzamento('não confirmado', 'O relatório só conclui atividade quando o CNAE ou objeto social estiverem presentes e corroborados.'), documentos: porTipo(/cnpj|contrato|estatuto|junta/i).map((doc) => doc.nome) },
    { codigo: 'endereco', dimensao: 'Endereço', ...statusCruzamento('não confirmado', 'O endereço será marcado como consistente somente quando o mesmo valor for localizado em mais de uma fonte.'), documentos: porTipo(/cnpj|contrato|resid|endereco/i).map((doc) => doc.nome) },
    { codigo: 'situacao_cadastral', dimensao: 'Situação cadastral', ...statusCruzamento(empresa.situacao_cadastral ? 'consistente' : 'não confirmado', empresa.situacao_cadastral ? `Situação cadastrada: ${empresa.situacao_cadastral}.` : 'Situação cadastral não localizada.'), documentos: docsIdentidade.map((doc) => doc.nome) },
    { codigo: 'obrigacoes_certidoes', dimensao: 'Obrigações e certidões', ...statusCruzamento(inventario.filter((item) => !documentoForaDoChecklistExecutivo(item)).some((item) => item.status === 'Divergente' || item.status === 'Incompatível comprovado') ? 'divergente' : inventario.filter((item) => !documentoForaDoChecklistExecutivo(item)).some((item) => item.status === 'Não enviado') ? 'parcialmente consistente' : 'consistente', 'A situação foi calculada a partir do inventário de documentos esperados, recebidos e lidos.'), documentos: inventario.filter((item) => !documentoForaDoChecklistExecutivo(item) && /cert|cnd|cadin|pgfn|fgts|cndt|pgdas|defis/i.test(item.documento)).map((item) => item.documento) },
    { codigo: 'credito', dimensao: 'Crédito, rating e restrições', ...statusCruzamento(porTipo(/scr|ccs|ccf|cenprot|serasa|rating|bureau/i).length ? 'consistente' : 'não disponível', porTipo(/scr|ccs|ccf|cenprot|serasa|rating|bureau/i).length ? `Fontes anexadas: ${porTipo(/scr|ccs|ccf|cenprot|serasa|rating|bureau/i).map((doc) => { const dados = resultado(doc); return primeiro(dados.rating, dados.score, dados.resultado_consulta, dados.resultado) || doc.tipo_documento; }).filter(Boolean).join('; ')}.` : 'Nenhuma fonte de crédito foi localizada no acervo.'), documentos: porTipo(/scr|ccs|ccf|cenprot|serasa|rating|bureau/i).map((doc) => doc.nome) },
    { codigo: 'financeiro', dimensao: 'Financeiro e faturamento', ...statusCruzamento(porTipo(/faturamento|receita|movimentacao|extrato/i).length ? 'consistente' : 'não disponível', porTipo(/faturamento|receita|movimentacao|extrato/i).length ? `Documento financeiro anexado; o período e a cobertura são exibidos quando extraídos do laudo.` : 'Faturamento documentado não localizado.'), documentos: porTipo(/faturamento|receita|movimentacao|extrato/i).map((doc) => doc.nome) },
    { codigo: 'documentos_obrigatorios', dimensao: 'Documentos obrigatórios', ...statusCruzamento(inventario.some((item) => item.status === 'Não enviado' && item.esperado) ? 'parcialmente consistente' : 'consistente', inventario.some((item) => item.status === 'Não enviado' && item.esperado) ? 'Há documentos obrigatórios não anexados.' : 'Não há ausência obrigatória identificada pelo mapa atual.'), documentos: inventario.filter((item) => item.esperado).map((item) => item.documento) },
  ];
  return resultados;
}

function construirHistoricoSocietario(dossie: Record<string, any>) {
  const societaria = objeto(dossie.documentacao_societaria);
  const documentos = lista(societaria.documentos_analisados);
  const eventos: any[] = [];
  for (const documento of documentos) {
    const analise = objeto(documento.analise_societaria_auditavel || documento.resultado_analise?.analise_societaria_auditavel);
    const linha = lista(analise.linha_tempo_societaria || documento.linha_tempo_societaria);
    if (linha.length) {
      for (const evento of linha) {
        eventos.push({
          data: evento.data || null,
          numero_arquivamento: evento.numero_arquivamento || null,
          tipo_ato: evento.tipo_ato || null,
          fonte: evento.fonte || documento.nome || 'Documento societário',
          mudanca: primeiro(evento.mudanca, evento.descricao, analise.ato_praticado, documento.resultado_analise?.ato_praticado) || 'Alteração não descrita expressamente na fonte.',
          corresponde_ao_contrato: evento.corresponde_ao_contrato ?? null,
          impacto: evento.e_ato_mais_recente ? 'Ato mais recente considerado no estado atual.' : 'Ato histórico usado para cobertura temporal.',
        });
      }
    } else if (documento.data_registro || analise.ato_mais_recente) {
      eventos.push({
        data: documento.data_registro || analise.ato_mais_recente?.data || null,
        numero_arquivamento: documento.numero_arquivamento || analise.ato_mais_recente?.numero_arquivamento || null,
        tipo_ato: documento.tipo_ato || analise.ato_mais_recente?.tipo_ato || null,
        fonte: documento.nome || 'Documento societário',
        mudanca: analise.ato_praticado || 'Alteração não descrita expressamente na fonte.',
        corresponde_ao_contrato: null,
        impacto: 'Evento societário identificado, mas a mudança detalhada depende da evidência estruturada disponível.',
      });
    }
  }
  const eventosUnicos = Array.from(new Map(eventos.map((evento) => [`${evento.data}|${evento.numero_arquivamento}|${evento.fonte}`, evento])).values())
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
  return {
    status: societaria.apto_para_avancar === true ? 'confirmado' : societaria.analisado ? 'parcialmente confirmado' : 'não confirmado',
    continuidade_12_meses: societaria.continuidade_12_meses_comprovada === true,
    meses_comprovados: societaria.meses_comprovados > 0 ? societaria.meses_comprovados : societaria.continuidade_12_meses_comprovada === true ? 12 : null,
    registros_faltantes: lista(societaria.registros_faltantes),
    nire: societaria.nire_junta || null,
    ato_mais_recente: { data: societaria.data_ato_junta || null, tipo: societaria.tipo_ato_junta || null, numero: societaria.numero_ato_junta || null },
    eventos,
    eventos_cronologicos: eventosUnicos,
    avisos: lista(societaria.avisos),
    bloqueios: lista(societaria.bloqueios),
    fontes: ['Atos da Junta Comercial', ...documentos.map((documento) => documento.nome || documento.arquivo_id).filter(Boolean)],
  };
}

function construirFinanceiroECredito(documentos: DocumentoRelatorio[]) {
  const financeiros = documentos.filter((doc) => /faturamento|receita|movimentacao|extrato/i.test(`${doc.tipo_documento} ${doc.nome}`));
  const credito = documentos.filter((doc) => /scr|ccs|ccf|cenprot|serasa|rating|bureau/i.test(`${doc.tipo_documento} ${doc.nome}`));
  const indicadoresFinanceiros = financeiros.flatMap((documento) => {
    const dados = dadosDocumento(documento);
    const candidatos = ['total_12_meses', 'faturamento_total', 'faturamento_anual', 'receita_bruta', 'valor_total', 'movimentacao_total'];
    return candidatos.map((campo) => {
      const valor = valorLegivel(dados[campo]);
      return valor ? { indicador: campo, valor, moeda: dados.moeda || 'BRL', periodo: dados.periodo_analisado || dados.competencia || dados.competencia_inicio || 'não localizado', natureza: 'declarado no documento', fonte: documento.nome || documento.tipo_documento, confianca: primeiro(dados.confianca, resultadoDocumento(documento).nivel_confianca) || null } : null;
    }).filter(Boolean);
  });
  const indicadoresCredito = credito.flatMap((documento) => {
    const dados = dadosDocumento(documento);
    const resultado = resultadoDocumento(documento);
    const valores: any[] = [];
    for (const campo of ['rating', 'score', 'score_serasa', 'score_bacen', 'status_bureau', 'resultado', 'data_consulta', 'restricoes', 'protestos', 'inadimplencias', 'valor_restricoes']) {
      const valor = valorLegivel(primeiro(dados[campo], resultado[campo]));
      if (valor) valores.push({ indicador: campo, valor, fonte: documento.nome || documento.tipo_documento, data_consulta: primeiro(dados.data_consulta, dados.data_consulta_iso, resultado.data_consulta) || null });
    }
    return valores;
  });
  const limitacoes = Array.from(new Set(credito.flatMap((documento) => lista(dadosDocumento(documento).limitacoes).map((item) => texto(item)).filter(Boolean))));
  if (!credito.length) limitacoes.push('Nenhuma consulta de crédito foi localizada no acervo; não é possível concluir ausência de restrições.');
  return {
    faturamento: { disponivel: indicadoresFinanceiros.length > 0, indicadores: indicadoresFinanceiros, limitacoes: indicadoresFinanceiros.length ? [] : ['Faturamento documentado não localizado.'] },
    credito: { disponivel: credito.length > 0, fontes_consultadas: credito.map((doc) => doc.nome || doc.tipo_documento), indicadores: indicadoresCredito, limitacoes },
  };
}

function construirPendencias(dossie: Record<string, any>, documentos: DocumentoRelatorio[], inventario: any[], cruzamentos: any[]) {
  const pendencias: any[] = [];
  for (const item of inventario.filter((item) => item.esperado && (item.status === 'Não enviado' || item.status === 'Enviado, mas não lido'))) {
    pendencias.push({ codigo: `documento_${item.status === 'Não enviado' ? 'nao_enviado' : 'nao_lido'}_${item.codigo || item.documento}`, categoria: item.status === 'Não enviado' ? 'documento não enviado' : 'documento enviado, mas não lido', prioridade: item.status === 'Não enviado' ? 'alta' : 'média', impacto: 'A análise inicial não pode considerar este requisito comprovado.', responsavel_sugerido: 'Empresa / operador documental', acao: item.status === 'Não enviado' ? `Anexar ${item.documento}.` : `Executar ou concluir a leitura de ${item.documento}.`, condicao_resolucao: 'Arquivo localizado, leitura concluída e resultado rastreável.', documentos: [item.arquivo || item.documento] });
  }
  for (const documento of documentos) {
    const estado = estadoDocumento(documento);
    const resultado = resultadoDocumento(documento);
    const itemInventario = inventario.find((item) => String(item.arquivo_id || item.arquivo) === String(documento.arquivo_id || documento.nome));
    const itemOpcional = itemInventario?.esperado === false;
    if (/faturamento/.test(tipoDocumentoNormalizado(documento)) && periodoFaturamento(dadosDocumento(documento)).competencias !== 12) {
      pendencias.push({
        codigo: `faturamento_12_meses_${documento.arquivo_id || documento.tipo_documento}`,
        categoria: 'faturamento desatualizado',
        prioridade: 'alta',
        impacto: 'O documento não comprova a janela completa dos últimos 12 meses.',
        responsavel_sugerido: 'Empresa / operador documental',
        acao: 'Apresentar faturamento atualizado dos últimos 12 meses.',
        condicao_resolucao: 'Período mensal completo de 12 meses localizado e validado.',
        documentos: [documento.nome],
      });
    }
    if (estado === 'incompativel') pendencias.push({ codigo: `documento_incompativel_${documento.arquivo_id || documento.tipo_documento}`, categoria: 'documento incompatível comprovado', prioridade: 'alta', impacto: 'O arquivo não satisfaz o campo documental esperado.', responsavel_sugerido: 'Empresa / operador documental', acao: `Substituir pelo documento esperado para ${documento.tipo_documento || documento.nome}.`, condicao_resolucao: 'Novo arquivo do tipo correto, compatível e lido sem incompatibilidade.', documentos: [documento.nome] });
    if (estado === 'divergente') pendencias.push({ codigo: `divergencia_${documento.arquivo_id || documento.tipo_documento}`, categoria: 'divergência entre documentos', prioridade: 'alta', impacto: 'Os valores conflitantes impedem uma conclusão automática segura.', responsavel_sugerido: 'Analista documental', acao: 'Conferir o documento original e registrar qual fonte prevalece.', condicao_resolucao: 'Divergência resolvida por fonte oficial ou revisão humana.', documentos: [documento.nome], evidencias: lista(resultado.divergencias).map((item) => item?.mensagem || item) });
    if ((estado === 'revisao_humana' || estado === 'ressalva') && !itemOpcional) pendencias.push({ codigo: `revisao_${documento.arquivo_id || documento.tipo_documento}`, categoria: estado === 'ressalva' ? 'dados insuficientes ou ressalva' : 'revisão humana necessária', prioridade: estado === 'revisao_humana' ? 'alta' : 'média', impacto: resultado.diagnostico || 'A conclusão depende de conferência adicional.', responsavel_sugerido: 'Analista documental', acao: 'Revisar o laudo, as evidências e as páginas indicadas.', condicao_resolucao: 'Analista confirma a evidência ou solicita novo arquivo.', documentos: [documento.nome] });
  }
  const cruzamentosAcionaveis = new Set(['identidade_empresarial', 'alteracoes', 'sociedade', 'registro', 'tributacao']);
  for (const cruzamento of cruzamentos.filter((item) => cruzamentosAcionaveis.has(item.codigo) && ['divergente', 'parcialmente consistente', 'não confirmado'].includes(item.status))) {
    pendencias.push({ codigo: `cruzamento_${cruzamento.codigo}`, categoria: cruzamento.status === 'divergente' ? 'divergência entre documentos' : 'informação não confirmada', prioridade: cruzamento.status === 'divergente' ? 'alta' : 'média', impacto: cruzamento.descricao, responsavel_sugerido: 'Analista documental', acao: `Confirmar a dimensão ${cruzamento.dimensao} com fonte oficial.`, condicao_resolucao: 'Cruzamento com resultado consistente e fonte identificada.', documentos: cruzamento.documentos || [] });
  }
  const unicos = new Map<string, any>();
  for (const pendencia of pendencias) if (!unicos.has(pendencia.codigo)) unicos.set(pendencia.codigo, pendencia);
  return Array.from(unicos.values());
}

function statusAptidao(resumo: Record<string, any>, pendencias: any[]): string {
  if (resumo.documentos_incompativeis > 0 || resumo.documentos_divergentes > 0) return 'com divergências relevantes';
  if (resumo.documentos_revisao_humana > 0 && resumo.documentos_faltantes > 0) return 'bloqueada por insuficiência de dados';
  if (resumo.documentos_faltantes > 0 || resumo.documentos_pendentes > 0 || pendencias.some((item) => item.prioridade === 'alta')) return 'pendente de complementação';
  if ((resumo.documentos_ressalva || resumo.documentos_aprovados_com_ressalva || 0) > 0) return 'apta com ressalvas';
  return 'documentalmente apta';
}

export function aplicarRelatorioInicial(base: Record<string, any>, params: RelatorioInicialParams): Record<string, any> {
  const modo = params.modo || 'institucional';
  const inventario = construirInventario(params);
  const documentosExecutivos = params.documentos.filter((documento) => !documentoForaDoChecklistExecutivo(documento));
  const dadosCadastrais = consolidarDadosCadastrais(params.dossie, params.documentos);
  const cruzamentos = construirCruzamentos(params.dossie, params.documentos, inventario);
  const historicoSocietario = construirHistoricoSocietario(params.dossie);
  const financeiroCredito = construirFinanceiroECredito(documentosExecutivos);
  const pendenciasDetalhadas = construirPendencias(params.dossie, documentosExecutivos, inventario, cruzamentos);
  const checklistExecutivo = construirChecklistExecutivo(inventario, cruzamentos, historicoSocietario, params.documentos);
  const modulosRelatorio = construirModulosRelatorio(params.dossie, inventario, dadosCadastrais, historicoSocietario, checklistExecutivo, modo);
  const idsInformativos = new Set(inventario.filter((item: any) => item.coberto_por_outro).map((item: any) => String(item.arquivo_id || item.arquivo)));
  const estados = documentosExecutivos.filter((documento) => !idsInformativos.has(String(documento.arquivo_id || documento.nome))).map(estadoDocumento);
  const resumoAtual = objeto(base.resumo);
  const resumo = {
    ...resumoAtual,
    documentos_lidos: estados.filter((estado) => estado !== 'nao_lido').length,
    documentos_aprovados: estados.filter((estado) => estado === 'aprovado').length,
    documentos_aprovados_com_ressalva: estados.filter((estado) => estado === 'ressalva').length,
    documentos_pendentes: estados.filter((estado) => ['pendente', 'nao_lido'].includes(estado)).length,
    documentos_divergentes: estados.filter((estado) => estado === 'divergente').length,
    documentos_incompativeis: estados.filter((estado) => estado === 'incompativel').length,
    documentos_revisao_humana: estados.filter((estado) => estado === 'revisao_humana').length,
    documentos_nao_identificados: documentosExecutivos.filter((doc) => tipoConfirmado(doc).confirmado === null).length,
    documentos_faltantes: inventario.filter((item) => item.esperado && item.recebido === false).length,
    arquivos_anexados: documentosExecutivos.length,
  };
  const evidenciasInventario = inventario.map((item: any) => item.evidencia || {});
  const evidenciaResumo = {
    arquivos_anexados: documentosExecutivos.length,
    arquivos_localizados: evidenciasInventario.filter((item) => item.arquivo_localizado).length,
    arquivos_abertos: evidenciasInventario.filter((item) => item.arquivo_aberto).length,
    paginas_processadas: evidenciasInventario.reduce((total, item) => total + (Number(item.paginas_processadas) > 0 ? Number(item.paginas_processadas) : 0), 0),
    arquivos_sem_contagem_de_paginas: evidenciasInventario.filter((item) => !item.paginas_processadas).length,
  };
  const limitacoes = Array.from(new Set([
    ...inventario.filter((item: any) => !documentoForaDoChecklistExecutivo(item) && item.recebido && !item.evidencia?.paginas_processadas).map((item: any) => `${item.nome || item.documento}: número de páginas processadas não localizado no laudo.`),
    ...financeiroCredito.credito.limitacoes,
    ...financeiroCredito.faturamento.limitacoes,
  ]));
  const statusAptidaoDocumental = statusAptidao(resumo, pendenciasDetalhadas);
  return {
    ...base,
    empresa: base.empresa || params.dossie.empresa || {},
    versao_relatorio: RELATORIO_INICIAL_VERSION,
    tipo_relatorio: 'relatorio_inicial_consolidado',
    status_aptidao_documental: statusAptidaoDocumental,
    resumo_executivo: {
      empresa: base.empresa || params.dossie.empresa || {},
      conclusao_preliminar: statusAptidaoDocumental,
      principais_riscos: pendenciasDetalhadas.filter((item) => item.prioridade === 'alta').slice(0, 10),
      quantidade_documentos_lidos: resumo.documentos_lidos,
      quantidade_documentos_aprovados: resumo.documentos_aprovados,
      quantidade_documentos_aprovados_com_ressalva: resumo.documentos_aprovados_com_ressalva,
      quantidade_documentos_pendentes: resumo.documentos_pendentes,
      quantidade_documentos_divergentes: resumo.documentos_divergentes,
      quantidade_documentos_incompativeis: resumo.documentos_incompativeis,
      quantidade_revisao_humana: resumo.documentos_revisao_humana,
    },
    resumo,
    inventario_documental: inventario,
    checklist_executivo: checklistExecutivo,
    modo_relatorio: modo,
    modulos_relatorio: modulosRelatorio,
    documentacao_societaria: {
      ...objeto(base.documentacao_societaria),
      continuidade_12_meses_comprovada: historicoSocietario.continuidade_12_meses,
      meses_comprovados: historicoSocietario.meses_comprovados,
    },
    dados_cadastrais_confirmados: dadosCadastrais,
    cruzamentos_documentais: cruzamentos,
    historico_societario: historicoSocietario,
    financeiro_credito: financeiroCredito,
    pendencias_detalhadas: pendenciasDetalhadas,
    evidencia_processamento: evidenciaResumo,
    confiabilidade: {
      regras: ['ausência não vira confirmação', 'incompatibilidade somente com evidência explícita', 'divergência exige fonte conflitante', 'dados inferidos não são promovidos a confirmados'],
      classifier_version: CLASSIFIER_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      rule_version: RULE_VERSION,
      schema_version: SCHEMA_VERSION,
      relatorio_version: RELATORIO_INICIAL_VERSION,
      gerado_em: base.gerado_em || new Date().toISOString(),
    },
    limitacoes,
  };
}
