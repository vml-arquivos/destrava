export type DocumentoAnaliseCampo = {
  label: string;
  valor: string;
};

export type DocumentoAnaliseSecao = {
  id: string;
  titulo: string;
  texto?: string;
  itens?: string[];
  campos?: DocumentoAnaliseCampo[];
  // Seção de apoio/técnica: continua disponível para quem quiser conferir o
  // detalhe, mas não fica exposta por padrão. No relatório em tela, some por
  // trás de um botão "i" (informações) — clique/hover para abrir. No PDF,
  // essas seções nem são desenhadas: o relatório impresso mostra só o que é
  // essencial pra decisão (resultado, dados-chave, próxima ação), sem inflar
  // o documento com o texto de apoio que gerou aquela conclusão.
  colapsavel?: boolean;
};

function texto(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizar(value: unknown): string {
  return texto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function numero(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/\./g, "").replace(",", "."));
  if (Number.isFinite(numeric)) return numeric.toLocaleString("pt-BR");
  return texto(value);
}

function limitarEvidencia(value: unknown): string {
  const evidencia = texto(value).replace(/\s+/g, " ");
  if (!evidencia) return "";
  return evidencia.length > 420 ? `${evidencia.slice(0, 417).trim()}...` : evidencia;
}

function itens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const registro = item as Record<string, unknown>;
        return texto(registro.mensagem || registro.descricao || registro.resultado || registro.recomendacao || registro.nome || registro.label || registro.valor);
      }
      return "";
    })
    .filter(Boolean);
}

function nomeSocio(socio: any): string {
  return texto(socio?.nome || socio?.nome_socio || socio?.razao_social) || "Nome não identificado no documento";
}

function normalizarSocios(value: unknown): any[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((socio: any) => ({
      ...socio,
      nome: nomeSocio(socio),
    }))
    .filter((socio: any) => socio.nome && socio.nome !== "Nome não identificado no documento");
}

function formatarSocio(socio: any): string {
  const nome = nomeSocio(socio);
  const quotas = numero(socio?.quotas);
  const percentual = numero(socio?.percentual);
  const qualificacao = texto(socio?.qualificacao);
  const administrador = socio?.administrador === true
    ? " — Sócio-Administrador"
    : socio?.administrador === false
      ? " — Sócio"
      : "";
  return `${nome}${quotas ? ` — ${quotas} quotas` : ""}${percentual ? ` (${percentual}%)` : ""}${qualificacao ? ` — ${qualificacao}` : ""}${administrador}`;
}

// "Amostra objetiva dos dados lidos" já mostra CNPJ/razão social/capital do QSA
// quando eles vêm no array `resultado.campos` (label + valor já prontos pela
// extração). O checklist de "Validações realizadas" (abaixo) conferia esses
// mesmos dados só em `dados_extraidos`/`dados_qsa`/`campos_principais` -- se a
// extração só preencheu o array `campos`, o checklist dizia "não identificado"
// para um dado que a própria "Amostra" já estava mostrando preenchido logo
// acima, no mesmo card. Essa função dá ao checklist a mesma fonte de dados que
// a Amostra já usa, pra nunca mais contradizer o que está na tela.
function valorDeCampos(campos: unknown, ...labels: string[]): string {
  if (!Array.isArray(campos)) return "";
  const alvos = labels.map(normalizar);
  const achado = campos.find((campo: any) => alvos.includes(normalizar(campo?.label)));
  return texto(achado?.valor);
}

function parseDataIso(value: unknown): Date | null {
  const raw = texto(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const data = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDataBr(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarConfiancaLeitura(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  const percentual = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(percentual)}%`;
}

function adicionarConfiancaLeitura(
  secoes: DocumentoAnaliseSecao[],
  resultado: any,
  documento: any,
): DocumentoAnaliseSecao[] {
  const valorBruto = resultado?.nivel_confianca
    ?? resultado?.confianca
    ?? documento?.nivel_confianca
    ?? documento?.confianca;
  if (valorBruto === null || valorBruto === undefined || valorBruto === "") return secoes;

  const valor = formatarConfiancaLeitura(valorBruto);
  if (!valor) return secoes;
  const jaExiste = secoes.some((secao) => secao.campos?.some((campo) => normalizar(campo.label) === "confianca da leitura"));
  if (jaExiste) return secoes;

  const indiceAlvo = secoes.findIndex((secao) => !secao.colapsavel);
  if (indiceAlvo < 0) return secoes;
  return secoes.map((secao, indice) => indice === indiceAlvo
    ? { ...secao, campos: [...(secao.campos || []), { label: "Confiança da leitura", valor }] }
    : secao);
}

function formatarAlteracaoResumo(alteracao: any): string {
  const cedente = texto(alteracao?.cedente?.nome || alteracao?.socio_retirante?.nome);
  const cessionario = texto(alteracao?.cessionario?.nome || alteracao?.socio_admitido?.nome);
  const quotas = numero(alteracao?.quotas_transferidas ?? alteracao?.cedente?.quotas ?? alteracao?.cessionario?.quotas);
  const percentual = numero(alteracao?.percentual_transferido ?? alteracao?.cessionario?.percentual);
  const tipo = normalizar(alteracao?.tipo_alteracao || alteracao?.operacao || alteracao?.tipo);
  const transferencia = /cess|transfer/.test(tipo) || (cedente && cessionario);
  if (transferencia && cedente && cessionario) {
    const complemento = [quotas ? `${quotas} quotas` : "", percentual ? `${percentual}%` : ""].filter(Boolean).join(", ");
    return `Transferência de titularidade: ${cedente} → ${cessionario}${complemento ? ` (${complemento})` : ""}`;
  }
  const acao = texto(alteracao?.tipo_alteracao || alteracao?.operacao || alteracao?.tipo) || "Alteração societária";
  return cessionario ? `${acao}: ${cessionario}` : acao;
}

function formatarAlteracaoCompacta(alteracao: any): string {
  const cedente = texto(alteracao?.cedente?.nome || alteracao?.socio_retirante?.nome);
  const cessionario = texto(alteracao?.cessionario?.nome || alteracao?.socio_admitido?.nome);
  const quotas = numero(alteracao?.quotas_transferidas ?? alteracao?.cedente?.quotas ?? alteracao?.cessionario?.quotas);
  const percentual = numero(alteracao?.percentual_transferido ?? alteracao?.cessionario?.percentual);
  const tipo = normalizar(alteracao?.tipo_alteracao || alteracao?.operacao || alteracao?.tipo);
  const transferencia = /cess|transfer/.test(tipo) || (cedente && cessionario);
  const acao = transferencia ? "Transferência de quotas" : texto(alteracao?.tipo_alteracao || alteracao?.operacao || alteracao?.tipo) || "Alteração societária";
  const linhas = [`Ação realizada: ${acao}`];
  if (cedente) linhas.push(`Cedente/retirante: ${cedente}`);
  if (cessionario) linhas.push(`Cessionário/admitido: ${cessionario}`);
  if (quotas) linhas.push(`Quotas transferidas: ${quotas}${percentual ? ` (${percentual}%)` : ""}`);
  const evidencia = limitarEvidencia(alteracao?.evidencia);
  if (evidencia) linhas.push(`Evidência: “${evidencia}”`);
  return linhas.join("\n");
}

function statusDocumento(resultado: any): string {
  return normalizar(resultado?.analise_societaria_auditavel?.status_documento || resultado?.status_societario || resultado?.statusDocumento);
}

function documentoAtual(resultado: any, documento: any): boolean {
  const status = statusDocumento(resultado);
  return status === "atual" || status === "vigente" || resultado?.documento_vigente === true || documento?.documento_vigente === true;
}

function titularAtual(resultado: any): string[] {
  const quadroFinal = Array.isArray(resultado?.quadro_societario_final) ? resultado.quadro_societario_final : [];
  return quadroFinal.map(formatarSocio).filter(Boolean);
}

function sociosLidos(resultado: any, documento: any): any[] {
  const confronto = resultado?.analise_societaria_auditavel?.confronto_qsa;
  const fontes = [
    resultado?.socios_lidos,
    resultado?.socios,
    resultado?.dados_qsa?.socios,
    resultado?.qsa?.socios,
    resultado?.dados_extraidos?.socios,
    resultado?.dados_extraidos?.qsa?.socios,
    resultado?.analise_documental?.socios_lidos,
    resultado?.analise_documental?.socios,
    documento?.socios_lidos,
    documento?.socios,
    documento?.analise_documental?.socios,
    Array.isArray(confronto?.nomes_qsa) ? confronto.nomes_qsa.map((nome: string) => ({ nome })) : [],
  ];
  const unicos = new Map<string, any>();
  fontes.flatMap(normalizarSocios).forEach((socio: any) => {
    const chave = normalizar(nomeSocio(socio));
    if (chave && !unicos.has(chave)) unicos.set(chave, socio);
  });
  return Array.from(unicos.values());
}

function ehQsa(resultado: any, documento: any, socios: any[]): boolean {
  const identificacao = normalizar([
    resultado?.tipo_leitura,
    resultado?.tipo_documento,
    documento?.codigo,
    documento?.tipo_documento,
    documento?.nome,
    documento?.bloco,
  ].filter(Boolean).join(" "));
  return resultado?.tipo_leitura === "qsa" || /\bqsa\b|quadro societ/.test(identificacao) || socios.length > 0 && Boolean(resultado?.qsa_leitura);
}

function formatarValidacao(item: any): string {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object") return "";
  const label = texto(item.label || item.nome);
  const resultado = texto(item.resultado || item.status || item.valor || item.mensagem || item.descricao);
  if (label && resultado && normalizar(label) !== normalizar(resultado)) return `${label}: ${resultado}`;
  return resultado || label;
}

function validacoes(resultado: any, documento: any, qsa: boolean, socios: any[], campos: DocumentoAnaliseCampo[] = []): string[] {
  const dadosQsa = resultado?.dados_extraidos || resultado?.dados_qsa || resultado?.analise_documental || {};
  const declaradas = [
    ...itens(resultado?.validacoes),
    ...itens(resultado?.validacoes_realizadas),
    ...itens(resultado?.analise_societaria_auditavel?.validacoes),
    ...itens(documento?.validacoes),
  ];
  if (!qsa) {
    const confronto = resultado?.analise_societaria_auditavel?.confronto_qsa;
    if (resultado?.analise_societaria_auditavel?.status_documento) declaradas.push(`Status documental: ${resultado.analise_societaria_auditavel.status_documento}`);
    if (confronto?.status) declaradas.push(`Confronto com QSA: ${confronto.status}`);
    if (Array.isArray(confronto?.nomes_documento) && confronto.nomes_documento.length) declaradas.push(`Nomes no documento: ${confronto.nomes_documento.join(", ")}`);
    if (Array.isArray(confronto?.nomes_qsa) && confronto.nomes_qsa.length) declaradas.push(`Nomes no QSA: ${confronto.nomes_qsa.join(", ")}`);
  } else {
    // A "Amostra objetiva dos dados lidos" já mostra esses mesmos três campos
    // quando a extração só preencheu o array `campos` (e não os objetos
    // dados_extraidos/dados_qsa/campos_principais) -- por isso `valorDeCampos`
    // entra como último fallback, pra este checklist nunca dizer "não
    // identificado" para um dado que o próprio card já está exibindo.
    const cnpj = resultado?.campos_principais?.cnpj || resultado?.cnpj || dadosQsa?.cnpj || documento?.campos_principais?.cnpj || valorDeCampos(campos, "cnpj do qsa", "cnpj");
    const razaoSocial = resultado?.campos_principais?.razao_social || resultado?.razao_social || dadosQsa?.razao_social || documento?.campos_principais?.razao_social || valorDeCampos(campos, "razao social do qsa", "razao social");
    const capitalSocial = resultado?.campos_principais?.capital_social ?? resultado?.capital_social ?? dadosQsa?.capital_social ?? documento?.campos_principais?.capital_social ?? (valorDeCampos(campos, "capital social do qsa", "capital social") || null);
    declaradas.push(`CNPJ: ${cnpj ? "identificado" : "não identificado"}`);
    declaradas.push(`Razão social: ${razaoSocial ? "identificada" : "não identificada"}`);
    declaradas.push(`Capital social: ${capitalSocial !== null && capitalSocial !== undefined && capitalSocial !== "" ? "identificado" : "não identificado"}`);
    declaradas.push(`Nomes de sócios no QSA: ${socios.length ? `${socios.length} identificado(s)` : "nenhum identificado"}`);
    const administradores = socios.filter((socio: any) => socio?.administrador === true).map(nomeSocio);
    declaradas.push(`Sócio-Administrador: ${administradores.length ? administradores.join(", ") : "não identificado"}`);
  }
  return Array.from(new Set(declaradas.map(formatarValidacao).filter(Boolean)));
}

function evidenciasCompactas(resultado: any, alteracoes: any[], quadroFinal: any[]): string[] {
  const fontes = [
    ...alteracoes.map((alteracao: any) => alteracao?.evidencia),
    resultado?.evidencia_quadro_societario,
    ...(Array.isArray(resultado?.evidencias) ? resultado.evidencias : []),
  ];
  return Array.from(new Set(fontes.map((item: any) => limitarEvidencia(item?.texto || item).trim()).filter(Boolean))).slice(0, 3).map((item) => `“${item}”`);
}

function secoesSocietariasCompactas(resultado: any, documento: any, conclusao: string, socios: any[], qsa: boolean): DocumentoAnaliseSecao[] {
  const secoes: DocumentoAnaliseSecao[] = [{ id: "resultado", titulo: qsa ? "Resultado da leitura do QSA" : "Resultado da leitura", texto: conclusao || "Leitura concluída." }];
  const dadosQsa = resultado?.dados_extraidos || resultado?.dados_qsa || resultado?.analise_documental || {};
  const camposBase = Array.isArray(resultado?.campos) ? resultado.campos : [];
  const camposQsa = qsa ? [
    { label: "CNPJ do QSA", valor: dadosQsa?.cnpj },
    { label: "Razão social do QSA", valor: dadosQsa?.razao_social },
    { label: "Capital social do QSA", valor: dadosQsa?.capital_social },
    { label: "Sócios lidos no QSA", valor: socios.length ? String(socios.length) : "0" },
  ] : [];
  const campos = [...camposBase, ...camposQsa]
    .map((campo: any) => ({ label: texto(campo?.label) || "Campo", valor: texto(campo?.valor) }))
    .filter((campo: DocumentoAnaliseCampo) => campo.valor)
    .filter((campo: DocumentoAnaliseCampo, index: number, lista: DocumentoAnaliseCampo[]) => lista.findIndex((item) => normalizar(item.label) === normalizar(campo.label) && item.valor === campo.valor) === index)
    .filter((campo: DocumentoAnaliseCampo) => qsa || !/nire|clausula|numero de arquivamento|arquivamento/i.test(normalizar(campo.label)));
  if (campos.length) secoes.push({ id: "amostra_dados", titulo: qsa ? "Dados do QSA" : "Amostra objetiva dos dados lidos", campos });
  if (qsa && socios.length) secoes.push({ id: "qsa_nomes", titulo: "Nomes identificados no QSA", itens: socios.map(formatarSocio).filter(Boolean) });

  // Alterações societárias (Atos da Junta / Contrato Social): o usuário não
  // precisa do histórico jurídico inteiro na tela principal -- precisa saber
  // 3 coisas, de forma direta: quando foi a última alteração, se isso já
  // completa os 12 meses de histórico exigidos, e qual foi o resultado (ex.:
  // "transferência de titularidade de Fulano para Fulano"). O texto jurídico
  // completo (evidência literal, lista de cada alteração) continua existindo,
  // só que dentro de uma seção "colapsavel" (id: transacoes/evidencias) —
  // não é apagado, só deixa de brigar por atenção com o que importa.
  const alteracoes = Array.isArray(resultado?.alteracoes_societarias) ? resultado.alteracoes_societarias : [];
  if (!qsa && alteracoes.length) {
    const maisRecente = alteracoes[0];
    const dataAlteracao = parseDataIso(
      resultado?.data_registro
        || resultado?.datas_chave?.data_ato_junta_mais_recente
        || resultado?.contrato?.data_registro
        || dadosQsa?.data_registro
        || maisRecente?.data_registro
        || maisRecente?.data,
    );
    const camposResumo: DocumentoAnaliseCampo[] = [];
    if (dataAlteracao) {
      const dentroDe12Meses = (Date.now() - dataAlteracao.getTime()) <= 366 * 24 * 60 * 60 * 1000;
      camposResumo.push({ label: "Última alteração em", valor: formatarDataBr(dataAlteracao) });
      camposResumo.push({ label: "Completa 12 meses de histórico", valor: dentroDe12Meses ? "Sim — não precisa de alteração anterior" : "Não — anexar também a alteração/contrato anterior" });
    }
    secoes.push({ id: "resumo_alteracao", titulo: "Resultado da alteração societária", texto: formatarAlteracaoResumo(maisRecente), campos: camposResumo.length ? camposResumo : undefined });
  }
  if (alteracoes.length) {
    secoes.push({ id: "transacoes", titulo: "Transação ou ação realizada (detalhe jurídico)", itens: alteracoes.map(formatarAlteracaoCompacta).filter(Boolean), colapsavel: true });
  }
  if (!qsa && documentoAtual(resultado, documento)) {
    const titulares = titularAtual(resultado);
    if (titulares.length) secoes.push({ id: "titular_atual", titulo: "Titular atual do contrato social", itens: titulares });
  }
  const diagnostico = texto(resultado?.diagnostico_factual || resultado?.diagnostico || resultado?.descricao_leitura);
  if (diagnostico && diagnostico !== conclusao) secoes.push({ id: "diagnostico_factual", titulo: "Descrição objetiva da leitura (texto completo)", texto: diagnostico, colapsavel: true });
  const validacoesRealizadas = validacoes(resultado, documento, qsa, socios, campos);
  if (validacoesRealizadas.length) secoes.push({ id: "validacoes", titulo: "Checklist técnico de validação", itens: validacoesRealizadas, colapsavel: true });
  const evidencias = evidenciasCompactas(resultado, alteracoes, Array.isArray(resultado?.quadro_societario_final) ? resultado.quadro_societario_final : []);
  if (evidencias.length) secoes.push({ id: "evidencias", titulo: "Evidências documentais (trecho literal)", itens: evidencias, colapsavel: true });
  return secoes;
}

export function construirSecoesAnaliseDocumento(resultado: any = {}, documento: any = {}): DocumentoAnaliseSecao[] {
  const conclusao = texto(resultado?.conclusao || documento?.observacao || "Leitura concluída.");
  const alteracoes = Array.isArray(resultado?.alteracoes_societarias) ? resultado.alteracoes_societarias : [];
  const quadroFinal = Array.isArray(resultado?.quadro_societario_final) ? resultado.quadro_societario_final : [];
  const socios = sociosLidos(resultado, documento);
  const qsa = ehQsa(resultado, documento, socios);
  const societario = qsa || alteracoes.length > 0 || quadroFinal.length > 0 || Boolean(resultado?.analise_societaria_auditavel) || Boolean(resultado?.status_societario);
  if (societario) return adicionarConfiancaLeitura(
    secoesSocietariasCompactas(resultado, documento, conclusao, socios, qsa),
    resultado,
    documento,
  );

  const secoes: DocumentoAnaliseSecao[] = [{ id: "resultado", titulo: "Resultado da análise", texto: conclusao }];
  const diagnosticoFactual = texto(resultado?.diagnostico_factual || resultado?.diagnostico);
  if (diagnosticoFactual && diagnosticoFactual !== conclusao) {
    secoes.push({ id: "diagnostico_factual", titulo: "Diagnóstico objetivo do documento", texto: diagnosticoFactual });
  }
  // CORREÇÃO (2026-08-31, "tem que deixar claro"): o backend já calcula
  // alertas específicos e legíveis (ex.: "isto é um PGDAS-D do Simples
  // Nacional, não um ECF -- anexe o documento correto") em
  // `normalizarDocumentoCatalogado`, mas para documentos catalogados
  // genéricos (fora do fluxo societário/QSA) essas mensagens nunca viravam
  // uma seção visível -- só apareciam nos metadados brutos do laudo. Isso
  // reproduzia, num componente novo, o mesmo problema já corrigido antes no
  // Acervo Documental: o dado certo existia, mas não chegava à tela. Seção
  // sempre visível (nunca `colapsavel`) para os alertas de maior severidade;
  // alertas de severidade baixa/média continuam disponíveis só nos metadados,
  // sem competir por atenção com o que realmente precisa de ação.
  const alertasCriticos = (Array.isArray(resultado?.alertas) ? resultado.alertas : [])
    .filter((alerta: any) => alerta && texto(alerta.mensagem) && (alerta.severidade === "alta" || alerta.severidade === "critica"));
  if (alertasCriticos.length) {
    secoes.push({
      id: "alertas",
      titulo: "Alertas da leitura automática",
      itens: alertasCriticos.map((alerta: any) => alerta.recomendacao ? `${texto(alerta.mensagem)} — ${texto(alerta.recomendacao)}` : texto(alerta.mensagem)),
    });
  }
  const campos = Array.isArray(resultado?.campos)
    ? resultado.campos.map((campo: any) => ({ label: texto(campo?.label) || "Campo", valor: texto(campo?.valor) })).filter((campo: DocumentoAnaliseCampo) => campo.valor)
    : [];
  if (campos.length) secoes.push({ id: "campos", titulo: "Amostra objetiva dos dados lidos", campos });
  const validacoesRealizadas = validacoes(resultado, documento, false, [], campos);
  if (validacoesRealizadas.length) secoes.push({ id: "validacoes", titulo: "Checklist técnico de validação", itens: validacoesRealizadas, colapsavel: true });
  return adicionarConfiancaLeitura(secoes, resultado, documento);
}


export type DocumentoEstadoVisual = "aprovado" | "revisao" | "incompativel" | "reanalisar" | "aguardando";

function statusVisualNormalizado(value: unknown): string {
  return normalizar(value).replace(/[ -]+/g, "_");
}

/**
 * A camada visual nunca transforma um laudo explicitamente incompatível,
 * stale, superseded, em reanálise ou com requisito não satisfeito em sucesso.
 * A ausência de um marcador negativo só é aprovada quando o próprio laudo
 * está concluído; ausência de laudo permanece aguardando.
 */
export function estadoVisualDocumento(resultado: any = {}, documento: any = {}): DocumentoEstadoVisual {
  const lifecycle = statusVisualNormalizado(resultado?.analysis_status || documento?.analysis_status);
  if (["stale", "superseded", "reanalise_necessaria", "reanalise", "reanalisar_necessario", "reanalisar_necessaria"].includes(lifecycle)) {
    return "reanalisar";
  }

  const dadosExtraidos = resultado?.dados_extraidos && typeof resultado.dados_extraidos === "object" ? resultado.dados_extraidos : {};
  const classificacao = resultado?.classificacao || resultado?.classificacao_documental || resultado?.classificacao_central || dadosExtraidos?.classificacao || {};
  const identidade = statusVisualNormalizado(
    classificacao?.identidade_status || resultado?.identidade_status || dadosExtraidos?.identidade_status || resultado?.tipo_status,
  );
  const tipoEsperado = statusVisualNormalizado(classificacao?.tipo_esperado || resultado?.tipo_esperado || dadosExtraidos?.tipo_esperado);
  const tipoDetectado = statusVisualNormalizado(classificacao?.tipo_detectado || resultado?.tipo_detectado || dadosExtraidos?.tipo_detectado);
  if (resultado?.documento_compativel === false || dadosExtraidos?.documento_compativel === false || classificacao?.documento_compativel === false || identidade === "incompativel" || (tipoEsperado && tipoDetectado && tipoEsperado !== tipoDetectado)) {
    return "incompativel";
  }
  if (resultado?.satisfaz_requisito === false || dadosExtraidos?.satisfaz_requisito === false || classificacao?.satisfaz_requisito === false || resultado?.cobertura_status === "NAO_SATISFAZ" || dadosExtraidos?.cobertura_status === "NAO_SATISFAZ" || classificacao?.cobertura_status === "NAO_SATISFAZ") {
    return "revisao";
  }

  const status = statusVisualNormalizado(resultado?.status || dadosExtraidos?.status || documento?.status);
  const conclusao = statusVisualNormalizado(resultado?.conclusao || documento?.observacao);
  if (resultado?.revisao_humana_necessaria === true || dadosExtraidos?.revisao_humana_necessaria === true || documento?.exige_revisao_humana === true || ["revisao_humana", "falhou", "recusado", "pendente_validacao", "aguardando_analise"].includes(status)) {
    return "revisao";
  }
  if (documento?.analisado === false || ["aguardando", "aguardando_analise", "anexo_recebido"].includes(status) || /aguardando|pendente/.test(conclusao)) {
    return "aguardando";
  }

  if (documento?.consistente === false) return "revisao";
  if (documento?.consistente === true || status === "concluido" || status === "validado" || /consistente|satisfeito|aprovado/.test(conclusao)) {
    return "aprovado";
  }
  return "revisao";
}

export function rotuloEstadoDocumento(estado: DocumentoEstadoVisual): string {
  switch (estado) {
    case "aprovado": return "Requisito satisfeito";
    case "incompativel": return "Documento incompatível";
    case "reanalisar": return "Reanálise necessária";
    case "aguardando": return "Aguardando análise";
    case "revisao": return "Revisão necessária";
  }
}
