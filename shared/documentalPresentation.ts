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

function validacoes(resultado: any, documento: any, qsa: boolean, socios: any[]): string[] {
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
    const cnpj = resultado?.campos_principais?.cnpj || resultado?.cnpj || documento?.campos_principais?.cnpj;
    const razaoSocial = resultado?.campos_principais?.razao_social || resultado?.razao_social || documento?.campos_principais?.razao_social;
    const capitalSocial = resultado?.campos_principais?.capital_social ?? resultado?.capital_social ?? documento?.campos_principais?.capital_social;
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
  const campos = (Array.isArray(resultado?.campos) ? resultado.campos : [])
    .map((campo: any) => ({ label: texto(campo?.label) || "Campo", valor: texto(campo?.valor) }))
    .filter((campo: DocumentoAnaliseCampo) => campo.valor)
    .filter((campo: DocumentoAnaliseCampo) => qsa || !/nire|clausula|numero de arquivamento|arquivamento/i.test(normalizar(campo.label)));
  if (campos.length) secoes.push({ id: "amostra_dados", titulo: "Amostra objetiva dos dados lidos", campos });
  if (qsa && socios.length) secoes.push({ id: "qsa_nomes", titulo: "Nomes identificados no QSA", itens: socios.map(formatarSocio).filter(Boolean) });
  const alteracoes = Array.isArray(resultado?.alteracoes_societarias) ? resultado.alteracoes_societarias : [];
  if (alteracoes.length) {
    secoes.push({ id: "transacoes", titulo: "Transação ou ação realizada", itens: alteracoes.map(formatarAlteracaoCompacta).filter(Boolean) });
  }
  if (!qsa && documentoAtual(resultado, documento)) {
    const titulares = titularAtual(resultado);
    if (titulares.length) secoes.push({ id: "titular_atual", titulo: "Titular atual do contrato social", itens: titulares });
  }
  const validacoesRealizadas = validacoes(resultado, documento, qsa, socios);
  if (validacoesRealizadas.length) secoes.push({ id: "validacoes", titulo: "Validações realizadas", itens: validacoesRealizadas });
  const evidencias = evidenciasCompactas(resultado, alteracoes, Array.isArray(resultado?.quadro_societario_final) ? resultado.quadro_societario_final : []);
  if (evidencias.length) secoes.push({ id: "evidencias", titulo: "Evidências documentais", itens: evidencias });
  return secoes;
}

export function construirSecoesAnaliseDocumento(resultado: any = {}, documento: any = {}): DocumentoAnaliseSecao[] {
  const conclusao = texto(resultado?.conclusao || documento?.observacao || "Leitura concluída.");
  const alteracoes = Array.isArray(resultado?.alteracoes_societarias) ? resultado.alteracoes_societarias : [];
  const quadroFinal = Array.isArray(resultado?.quadro_societario_final) ? resultado.quadro_societario_final : [];
  const socios = sociosLidos(resultado, documento);
  const qsa = ehQsa(resultado, documento, socios);
  const societario = qsa || alteracoes.length > 0 || quadroFinal.length > 0 || Boolean(resultado?.analise_societaria_auditavel) || Boolean(resultado?.status_societario);
  if (societario) return secoesSocietariasCompactas(resultado, documento, conclusao, socios, qsa);

  const secoes: DocumentoAnaliseSecao[] = [{ id: "resultado", titulo: "Resultado da análise", texto: conclusao }];
  const diagnosticoFactual = texto(resultado?.diagnostico_factual || resultado?.diagnostico);
  if (diagnosticoFactual && diagnosticoFactual !== conclusao) {
    secoes.push({ id: "diagnostico_factual", titulo: "Diagnóstico objetivo do documento", texto: diagnosticoFactual });
  }
  const campos = Array.isArray(resultado?.campos)
    ? resultado.campos.map((campo: any) => ({ label: texto(campo?.label) || "Campo", valor: texto(campo?.valor) })).filter((campo: DocumentoAnaliseCampo) => campo.valor)
    : [];
  if (campos.length) secoes.push({ id: "campos", titulo: "Amostra objetiva dos dados lidos", campos });
  const validacoesRealizadas = validacoes(resultado, documento, false, []);
  if (validacoesRealizadas.length) secoes.push({ id: "validacoes", titulo: "Validações realizadas", itens: validacoesRealizadas });
  return secoes;
}
