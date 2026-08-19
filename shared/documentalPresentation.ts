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
        return texto(registro.mensagem || registro.recomendacao || registro.nome || registro.label || registro.valor);
      }
      return "";
    })
    .filter(Boolean);
}

function nomeSocio(socio: any): string {
  return texto(socio?.nome) || "Nome não identificado no documento";
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
  return quadroFinal.map((socio: any) => {
    const nome = nomeSocio(socio);
    const quotas = numero(socio?.quotas);
    const percentual = numero(socio?.percentual);
    const qualificacao = texto(socio?.qualificacao);
    const administrador = socio?.administrador === true ? " — administrador" : "";
    return `${nome}${quotas ? ` — ${quotas} quotas` : ""}${percentual ? ` (${percentual}%)` : ""}${qualificacao ? ` — ${qualificacao}` : ""}${administrador}`;
  }).filter(Boolean);
}

function evidenciasCompactas(resultado: any, alteracoes: any[], quadroFinal: any[]): string[] {
  const fontes = [
    ...alteracoes.map((alteracao: any) => alteracao?.evidencia),
    resultado?.evidencia_quadro_societario,
    ...(Array.isArray(resultado?.evidencias) ? resultado.evidencias : []),
  ];
  return Array.from(new Set(fontes.map(limitarEvidencia).filter(Boolean))).slice(0, 3).map((item) => `“${item}”`);
}

function secoesSocietariasCompactas(resultado: any, documento: any, conclusao: string): DocumentoAnaliseSecao[] {
  const secoes: DocumentoAnaliseSecao[] = [{ id: "resultado", titulo: "Resultado da leitura", texto: conclusao || "Leitura concluída." }];
  const alteracoes = Array.isArray(resultado?.alteracoes_societarias) ? resultado.alteracoes_societarias : [];
  if (alteracoes.length) {
    secoes.push({ id: "transacoes", titulo: "Transação ou ação realizada", itens: alteracoes.map(formatarAlteracaoCompacta).filter(Boolean) });
  }
  if (documentoAtual(resultado, documento)) {
    const titulares = titularAtual(resultado);
    if (titulares.length) {
      secoes.push({ id: "titular_atual", titulo: "Titular atual do contrato social", itens: titulares });
    }
  }
  const evidencias = evidenciasCompactas(resultado, alteracoes, Array.isArray(resultado?.quadro_societario_final) ? resultado.quadro_societario_final : []);
  if (evidencias.length) secoes.push({ id: "evidencias", titulo: "Evidências documentais", itens: evidencias });
  return secoes;
}

export function construirSecoesAnaliseDocumento(resultado: any = {}, documento: any = {}): DocumentoAnaliseSecao[] {
  const conclusao = texto(resultado?.conclusao || documento?.observacao || "Leitura concluída.");
  const alteracoes = Array.isArray(resultado?.alteracoes_societarias) ? resultado.alteracoes_societarias : [];
  const quadroFinal = Array.isArray(resultado?.quadro_societario_final) ? resultado.quadro_societario_final : [];
  const societario = alteracoes.length > 0 || quadroFinal.length > 0 || Boolean(resultado?.analise_societaria_auditavel) || Boolean(resultado?.status_societario);
  if (societario) return secoesSocietariasCompactas(resultado, documento, conclusao);

  const secoes: DocumentoAnaliseSecao[] = [{ id: "resultado", titulo: "Resultado da análise", texto: conclusao }];
  const diagnosticoFactual = texto(resultado?.diagnostico_factual || resultado?.diagnostico);
  if (diagnosticoFactual && diagnosticoFactual !== conclusao) {
    secoes.push({ id: "diagnostico_factual", titulo: "Diagnóstico objetivo do documento", texto: diagnosticoFactual });
  }
  const campos = Array.isArray(resultado?.campos)
    ? resultado.campos.map((campo: any) => ({ label: texto(campo?.label) || "Campo", valor: texto(campo?.valor) })).filter((campo: DocumentoAnaliseCampo) => campo.valor)
    : [];
  if (campos.length) secoes.push({ id: "campos", titulo: "Campos extraídos da leitura", campos });
  return secoes;
}
