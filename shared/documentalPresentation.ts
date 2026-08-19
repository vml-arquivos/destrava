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

function formatarAlteracao(alteracao: any): string {
  const cedente = texto(alteracao?.cedente?.nome || alteracao?.socio_retirante?.nome) || "não identificado";
  const cessionario = texto(alteracao?.cessionario?.nome || alteracao?.socio_admitido?.nome) || "não identificado";
  const quotas = alteracao?.quotas_transferidas ?? alteracao?.cedente?.quotas ?? alteracao?.cessionario?.quotas;
  const percentual = alteracao?.percentual_transferido ?? alteracao?.cessionario?.percentual;
  const tipo = texto(alteracao?.tipo_alteracao || alteracao?.operacao || alteracao?.tipo);
  const operacao = /saida_transferencia|transfer/i.test(tipo) || (cedente !== "não identificado" && cessionario !== "não identificado")
    ? "Transferência de quotas"
    : tipo || "Alteração societária";
  const partes = [
    `Operação identificada: ${operacao}`,
    `Sócio cedente/retirante: ${cedente}`,
    `Novo sócio/cessionário: ${cessionario}`,
    `Quotas transferidas: ${texto(quotas) || "não identificadas"}${percentual != null ? ` (${texto(percentual)}%)` : ""}`,
  ];
  if (alteracao?.clausula) partes.push(`Cláusula: ${texto(alteracao.clausula)}`);
  if (alteracao?.pagina) partes.push(`Página: ${texto(alteracao.pagina)}`);
  if (alteracao?.evidencia) partes.push(`Evidência documental: “${texto(alteracao.evidencia)}”`);
  return partes.join("\n");
}

function formatarQuadroFinal(socio: any): string {
  const nome = texto(socio?.nome) || "Sócio não identificado";
  const quotas = socio?.quotas != null ? ` — ${texto(socio.quotas)} quotas` : "";
  const percentual = socio?.percentual != null ? ` (${texto(socio.percentual)}%)` : "";
  const qualificacao = socio?.qualificacao ? ` — ${texto(socio.qualificacao)}` : "";
  const administrador = socio?.administrador === true ? " — administrador" : "";
  return `${nome}${quotas}${percentual}${qualificacao}${administrador}`;
}

function formatarEvento(evento: any): string {
  const data = texto(evento?.data) || "Data não identificada";
  const tipo = texto(evento?.tipo_ato) || "Ato societário";
  const registro = evento?.numero_arquivamento ? ` — registro ${texto(evento.numero_arquivamento)}` : "";
  return `${data} — ${tipo}${registro}`;
}

export function construirSecoesAnaliseDocumento(resultado: any = {}, documento: any = {}): DocumentoAnaliseSecao[] {
  const secoes: DocumentoAnaliseSecao[] = [];
  const conclusao = texto(resultado?.conclusao || documento?.observacao || "Leitura concluída.");
  const diagnostico = texto(resultado?.diagnostico);
  secoes.push({
    id: "resultado",
    titulo: "Resultado da análise",
    texto: [conclusao, diagnostico && diagnostico !== conclusao ? diagnostico : ""].filter(Boolean).join("\n"),
  });

  const diagnosticoFactual = texto(resultado?.diagnostico_factual);
  if (diagnosticoFactual) {
    secoes.push({ id: "diagnostico_factual", titulo: "Diagnóstico objetivo do documento", texto: diagnosticoFactual });
  }

  const alteracoes = Array.isArray(resultado?.alteracoes_societarias) ? resultado.alteracoes_societarias : [];
  if (alteracoes.length) {
    secoes.push({
      id: "alteracoes_societarias",
      titulo: "Alterações societárias identificadas",
      itens: alteracoes.map(formatarAlteracao).filter(Boolean),
    });
  }

  const quadroFinal = Array.isArray(resultado?.quadro_societario_final) ? resultado.quadro_societario_final : [];
  if (quadroFinal.length) {
    secoes.push({
      id: "quadro_societario_final",
      titulo: "Quadro societário final declarado no documento",
      itens: quadroFinal.map(formatarQuadroFinal).filter(Boolean),
    });
  }

  const agente = resultado?.analise_societaria_auditavel;
  if (agente && typeof agente === "object") {
    const agenteItens: string[] = [];
    if (agente.status_documento) agenteItens.push(`Status do documento: ${texto(agente.status_documento)}`);
    if (agente.ato_praticado) agenteItens.push(`Ato praticado: ${texto(agente.ato_praticado)}`);
    if (agente.estado_atual?.descricao) agenteItens.push(`Estado atual: ${texto(agente.estado_atual.descricao)}`);
    if (agente.confronto_qsa?.status) {
      agenteItens.push(`Confronto documentado com QSA: ${texto(agente.confronto_qsa.status)}${agente.confronto_qsa.mensagem ? ` — ${texto(agente.confronto_qsa.mensagem)}` : ""}`);
    }
    if (Array.isArray(agente.linha_tempo_societaria)) agenteItens.push(...agente.linha_tempo_societaria.map(formatarEvento));
    if (agenteItens.length) secoes.push({ id: "leitura_societaria", titulo: "Leitura societária estruturada", itens: agenteItens });
  }

  const evidencias = Array.isArray(resultado?.evidencias) ? resultado.evidencias.map(texto).filter(Boolean) : [];
  if (evidencias.length) secoes.push({ id: "evidencias", titulo: "Trechos de evidência utilizados", itens: evidencias.map((item: string) => `“${item}”`) });

  const campos = Array.isArray(resultado?.campos)
    ? resultado.campos.map((campo: any) => ({ label: texto(campo?.label) || "Campo", valor: texto(campo?.valor) })).filter((campo: DocumentoAnaliseCampo) => campo.valor)
    : [];
  if (campos.length) secoes.push({ id: "campos", titulo: "Campos extraídos da leitura", campos });

  const observacoes = itens(resultado?.observacoes);
  if (observacoes.length) secoes.push({ id: "observacoes", titulo: "Observações e anotações", itens: observacoes });

  return secoes;
}
