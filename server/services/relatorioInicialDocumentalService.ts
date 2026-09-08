import { CLASSIFIER_VERSION, EXTRACTOR_VERSION, RULE_VERSION, SCHEMA_VERSION } from './documentalLaudoVersioning';
import type { DocumentProcessingEvidence } from './documentProcessingEvidence';

export const RELATORIO_INICIAL_VERSION = '1.0.0';

type DocumentoRelatorio = Record<string, any>;

type RelatorioInicialParams = {
  dossie: Record<string, any>;
  documentos: DocumentoRelatorio[];
  evidencias: Map<string, DocumentProcessingEvidence>;
};

function texto(value: unknown): string {
  return String(value ?? '').trim();
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
  const validadoLegado = /^(validado|ok|conclu[ií]do)$/i.test(texto(documento.pendencia))
    && documento.analisado === true
    && documento.consistente !== false;
  const revisao = (documento.exige_revisao_humana === true || resultado.revisao_humana_necessaria === true || resultado.analysis_status === 'REANALISE_NECESSARIA')
    && !conclusivoPorEvidencia
    && !validadoLegado;
  if (revisao && documento.analisado === true) return 'revisao_humana';
  if (documento.analisado !== true) return 'nao_lido';
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
  const encontrarRecebido = (esperado: Record<string, any>) => recebidos.find((documento) => {
    const tipos = lista(esperado.tipos_arquivo).map(String);
    const match = tipos.includes(String(documento.tipo_documento)) || String(esperado.codigo || '') === String(documento.tipo_documento || '');
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
    return {
      codigo: esperado.codigo || documento.tipo_documento || null,
      documento: esperado.nome || documento.nome || documento.tipo_documento || 'Documento',
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
      evidencia: gerarEvidencia(documento, params.evidencias.get(String(documento.arquivo_id || ''))),
    };
  });
  const extras = recebidos.filter((documento) => !usado.has(String(documento.arquivo_id || documento.nome))).map((documento) => {
    const estado = estadoDocumento(documento);
    const tipo = tipoConfirmado(documento);
    return {
      codigo: documento.tipo_documento || null,
      documento: documento.nome || documento.tipo_documento || 'Documento anexado',
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
      status: rotuloEstado(estado),
      pendencia: estado === 'aprovado' || estado === 'ressalva' ? null : documento.observacao || 'Documento anexado fora da lista de exigências ou sem conclusão suficiente.',
      evidencia: gerarEvidencia(documento, params.evidencias.get(String(documento.arquivo_id || ''))),
    };
  });
  return [...inventarioEsperado, ...extras];
}

function candidatosDeDocumentos(documentos: DocumentoRelatorio[], aliases: string[]): Array<{ valor: string; fonte: string }> {
  const encontrados: Array<{ valor: string; fonte: string }> = [];
  for (const documento of documentos) {
    const dados = dadosDocumento(documento);
    for (const alias of aliases) {
      const valor = valorLegivel(dados[alias]);
      if (valor) encontrados.push({ valor, fonte: texto(documento.nome || documento.tipo_documento || 'Documento') });
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
    { campo: 'CNAE principal', aliases: ['cnae_principal', 'atividade_economica_principal'], valor: primeiro(empresa.cnae_principal), fonte: 'Cadastro da empresa' },
    { campo: 'Capital social', aliases: ['capital_social'], valor: primeiro(empresa.capital_social), fonte: 'Cadastro da empresa' },
  ];
  return campos.map((campo) => {
    const valor = valorLegivel(campo.valor);
    const candidatos = valor ? [{ valor, fonte: campo.fonte }] : [];
    candidatos.push(...candidatosDeDocumentos(documentos, campo.aliases));
    const distintos = Array.from(new Map(candidatos.map((item) => [normalizar(item.valor), item])).values());
    const valores = Array.from(new Set(candidatos.map((item) => normalizar(item.valor))));
    if (!distintos.length) return { campo: campo.campo, valor: null, status: 'não localizado', fontes: [], confianca: 'não confirmado', confirmado_por_multiplas_fontes: false };
    return {
      campo: campo.campo,
      valor: distintos[0].valor,
      valores_encontrados: distintos.map((item) => item.valor),
      status: valores.length > 1 ? 'divergente' : valores.length === 1 && candidatos.length > 1 ? 'corroborado' : 'confirmado',
      fontes: distintos.map((item) => item.fonte),
      confianca: valores.length > 1 ? 'baixa' : candidatos.length > 1 ? 'alta' : 'média',
      confirmado_por_multiplas_fontes: candidatos.length > 1 && valores.length === 1,
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
  const cnps = Array.from(new Set([
    somenteDigitos(empresa.cnpj),
    ...docsIdentidade.map((doc) => somenteDigitos(primeiro(resultado(doc).cnpj, resultado(doc).cnpj_empresa, resultado(doc).cnpj_documento))),
  ].filter(Boolean)));
  const identidadeStatus = cnps.length <= 1 && cnps.length > 0 ? 'consistente' : cnps.length > 1 ? 'divergente' : 'não confirmado';
  const resultados: Array<Record<string, any>> = [
    { codigo: 'identidade_empresarial', dimensao: 'Identidade empresarial', ...statusCruzamento(identidadeStatus, cnps.length > 1 ? `Foram encontrados CNPJs conflitantes: ${cnps.join(', ')}.` : cnps.length === 1 ? 'CNPJ único identificado nas fontes disponíveis.' : 'CNPJ não localizado nas fontes analisadas.'), documentos: docsIdentidade.map((doc) => doc.nome), valores: { cnpj: cnps } },
    { codigo: 'constituicao', dimensao: 'Constituição', ...statusCruzamento(identidade.apto_para_avancar === true ? 'consistente' : 'não confirmado', identidade.apto_para_avancar === true ? 'A identidade cadastral inicial foi concluída; datas de constituição devem ser lidas nos documentos em que estiverem presentes.' : 'A constituição ainda não foi confirmada pela Etapa 1.'), documentos: docsIdentidade.map((doc) => doc.nome) },
    { codigo: 'alteracoes', dimensao: 'Alterações', ...statusCruzamento(societaria.analisado ? societaria.apto_para_avancar === true ? 'consistente' : societaria.bloqueios?.length ? 'divergente' : 'parcialmente consistente' : 'não confirmado', societaria.diagnostico || 'Histórico de alterações ainda não concluído.'), documentos: lista(societaria.documentos_analisados).map((doc) => doc.nome || doc.arquivo_id).filter(Boolean) },
    { codigo: 'sociedade', dimensao: 'Sócios, administradores e representação', ...statusCruzamento(societaria.confronto_qsa?.status === 'confirmado' || identidade.validation?.qsaMatches === true ? 'consistente' : societaria.confronto_qsa?.status === 'divergente' ? 'divergente' : 'não confirmado', societaria.confronto_qsa?.descricao || 'O quadro societário não foi corroborado por múltiplas fontes.'), documentos: ['QSA', ...lista(societaria.documentos_analisados).map((doc) => doc.nome || doc.arquivo_id).filter(Boolean)] },
    { codigo: 'registro', dimensao: 'Registro, Junta e NIRE', ...statusCruzamento(societaria.nire_confere === true && societaria.data_confere === true ? 'consistente' : societaria.bloqueios?.some((item: any) => /NIRE|data|registro/i.test(texto(item))) ? 'divergente' : 'não confirmado', societaria.nire_confere === true ? 'NIRE conferido entre Junta e contrato.' : 'NIRE ou data do registro não foram confirmados integralmente.'), documentos: ['Atos da Junta Comercial', ...lista(societaria.documentos_analisados).map((doc) => doc.nome || doc.arquivo_id).filter(Boolean)] },
    { codigo: 'tributacao', dimensao: 'Tributação e enquadramento', ...statusCruzamento(valorRegime(dossie, documentos) ? 'consistente' : 'não confirmado', valorRegime(dossie, documentos) ? `Regime identificado: ${valorRegime(dossie, documentos)}.` : 'Regime tributário não confirmado por fonte suficiente.'), documentos: porTipo(/pgdas|defis|simples|enquadramento|ecf|dctf|darf|livro/i).map((doc) => doc.nome) },
    { codigo: 'atividade', dimensao: 'Atividade econômica e objeto social', ...statusCruzamento('não confirmado', 'O relatório só conclui atividade quando o CNAE ou objeto social estiverem presentes e corroborados.'), documentos: porTipo(/cnpj|contrato|estatuto|junta/i).map((doc) => doc.nome) },
    { codigo: 'endereco', dimensao: 'Endereço', ...statusCruzamento('não confirmado', 'O endereço será marcado como consistente somente quando o mesmo valor for localizado em mais de uma fonte.'), documentos: porTipo(/cnpj|contrato|resid|endereco/i).map((doc) => doc.nome) },
    { codigo: 'situacao_cadastral', dimensao: 'Situação cadastral', ...statusCruzamento(empresa.situacao_cadastral ? 'consistente' : 'não confirmado', empresa.situacao_cadastral ? `Situação cadastrada: ${empresa.situacao_cadastral}.` : 'Situação cadastral não localizada.'), documentos: docsIdentidade.map((doc) => doc.nome) },
    { codigo: 'obrigacoes_certidoes', dimensao: 'Obrigações e certidões', ...statusCruzamento(inventario.some((item) => item.status === 'Divergente' || item.status === 'Incompatível comprovado') ? 'divergente' : inventario.some((item) => item.status === 'Não enviado') ? 'parcialmente consistente' : 'consistente', 'A situação foi calculada a partir do inventário de documentos esperados, recebidos e lidos.'), documentos: inventario.filter((item) => /cert|cnd|cadin|pgfn|fgts|cndt|pgdas|defis/i.test(item.documento)).map((item) => item.documento) },
    { codigo: 'credito', dimensao: 'Crédito, rating e restrições', ...statusCruzamento(porTipo(/scr|ccs|ccf|cenprot|serasa|rating|bureau/i).length ? 'consistente' : 'não disponível', porTipo(/scr|ccs|ccf|cenprot|serasa|rating|bureau/i).length ? 'Há fontes de crédito anexadas; as conclusões detalhadas dependem dos campos efetivamente lidos.' : 'Nenhuma fonte de crédito foi localizada no acervo.'), documentos: porTipo(/scr|ccs|ccf|cenprot|serasa|rating|bureau/i).map((doc) => doc.nome) },
    { codigo: 'financeiro', dimensao: 'Financeiro e faturamento', ...statusCruzamento(porTipo(/faturamento|receita|movimentacao|extrato/i).length ? 'consistente' : 'não disponível', porTipo(/faturamento|receita|movimentacao|extrato/i).length ? 'Há documento financeiro anexado; os valores são exibidos somente quando extraídos com período e fonte.' : 'Faturamento documentado não localizado.'), documentos: porTipo(/faturamento|receita|movimentacao|extrato/i).map((doc) => doc.nome) },
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
    meses_comprovados: societaria.meses_comprovados ?? null,
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
    if (estado === 'incompativel') pendencias.push({ codigo: `documento_incompativel_${documento.arquivo_id || documento.tipo_documento}`, categoria: 'documento incompatível comprovado', prioridade: 'alta', impacto: 'O arquivo não satisfaz o campo documental esperado.', responsavel_sugerido: 'Empresa / operador documental', acao: `Substituir pelo documento esperado para ${documento.tipo_documento || documento.nome}.`, condicao_resolucao: 'Novo arquivo do tipo correto, compatível e lido sem incompatibilidade.', documentos: [documento.nome] });
    if (estado === 'divergente') pendencias.push({ codigo: `divergencia_${documento.arquivo_id || documento.tipo_documento}`, categoria: 'divergência entre documentos', prioridade: 'alta', impacto: 'Os valores conflitantes impedem uma conclusão automática segura.', responsavel_sugerido: 'Analista documental', acao: 'Conferir o documento original e registrar qual fonte prevalece.', condicao_resolucao: 'Divergência resolvida por fonte oficial ou revisão humana.', documentos: [documento.nome], evidencias: lista(resultado.divergencias).map((item) => item?.mensagem || item) });
    if (estado === 'revisao_humana' || estado === 'ressalva') pendencias.push({ codigo: `revisao_${documento.arquivo_id || documento.tipo_documento}`, categoria: estado === 'ressalva' ? 'dados insuficientes ou ressalva' : 'revisão humana necessária', prioridade: estado === 'revisao_humana' ? 'alta' : 'média', impacto: resultado.diagnostico || 'A conclusão depende de conferência adicional.', responsavel_sugerido: 'Analista documental', acao: 'Revisar o laudo, as evidências e as páginas indicadas.', condicao_resolucao: 'Analista confirma a evidência ou solicita novo arquivo.', documentos: [documento.nome] });
  }
  for (const cruzamento of cruzamentos.filter((item) => ['divergente', 'parcialmente consistente', 'não confirmado'].includes(item.status))) {
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
  const inventario = construirInventario(params);
  const dadosCadastrais = consolidarDadosCadastrais(params.dossie, params.documentos);
  const cruzamentos = construirCruzamentos(params.dossie, params.documentos, inventario);
  const historicoSocietario = construirHistoricoSocietario(params.dossie);
  const financeiroCredito = construirFinanceiroECredito(params.documentos);
  const pendenciasDetalhadas = construirPendencias(params.dossie, params.documentos, inventario, cruzamentos);
  const estados = params.documentos.map(estadoDocumento);
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
    documentos_nao_identificados: params.documentos.filter((doc) => tipoConfirmado(doc).confirmado === null).length,
    documentos_faltantes: inventario.filter((item) => item.esperado && item.recebido === false).length,
    arquivos_anexados: params.documentos.length,
  };
  const evidenciasInventario = inventario.map((item: any) => item.evidencia || {});
  const evidenciaResumo = {
    arquivos_anexados: params.documentos.length,
    arquivos_localizados: evidenciasInventario.filter((item) => item.arquivo_localizado).length,
    arquivos_abertos: evidenciasInventario.filter((item) => item.arquivo_aberto).length,
    paginas_processadas: evidenciasInventario.reduce((total, item) => total + (Number(item.paginas_processadas) > 0 ? Number(item.paginas_processadas) : 0), 0),
    arquivos_sem_contagem_de_paginas: evidenciasInventario.filter((item) => !item.paginas_processadas).length,
  };
  const limitacoes = Array.from(new Set([
    ...inventario.filter((item: any) => item.recebido && !item.evidencia?.paginas_processadas).map((item: any) => `${item.nome || item.documento}: número de páginas processadas não localizado no laudo.`),
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
