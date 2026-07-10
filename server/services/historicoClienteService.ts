/**
 * historicoClienteService.ts
 *
 * Serviço de Histórico 360 do Cliente.
 * Consolida eventos de múltiplas fontes em uma linha do tempo unificada.
 *
 * Fontes de eventos:
 *  - empresa_historico (notas, atualizações, simulações registradas)
 *  - followup_empresa (follow-ups da empresa)
 *  - empresa_followups (follow-ups estruturados com título e status)
 *  - documentos_arquivos (uploads e validações de documentos)
 *  - simulacoes_colaborador (simulações de crédito)
 *  - contratos_gerados (contratos e assinaturas)
 *  - orcamentos (orçamentos criados)
 *  - acompanhamentos_bancarios (acompanhamentos bancários)
 *  - dados cadastrais da empresa (criação e última atualização)
 *
 * REGRAS:
 *  - ZERO REGRESSÃO: apenas leitura, sem alterar dados
 *  - Não criar eventos falsos
 *  - Não inventar usuário — usar null se não houver
 *  - Eventos sem data ficam no final com "Data não informada"
 */

// ─── Utilitários ──────────────────────────────────────────────────────────────

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function safeStr(v: unknown, fallback = ""): string {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v).trim() || fallback;
}

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isDataValida(d: unknown): boolean {
  if (!d) return false;
  try {
    const dt = new Date(String(d));
    return !isNaN(dt.getTime()) && dt.getFullYear() > 1970;
  } catch { return false; }
}

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type TipoEvento =
  | "cadastro"
  | "atualizacao_cadastral"
  | "documento"
  | "simulacao"
  | "contrato"
  | "orcamento"
  | "followup"
  | "nota"
  | "acompanhamento_bancario"
  | "analise"
  | "sistema";

export type ModuloEvento =
  | "cadastro_empresa"
  | "acervo_documental"
  | "simulacoes"
  | "contratos"
  | "orcamentos"
  | "followup"
  | "inteligencia_360"
  | "acompanhamento_bancario"
  | "sistema";

export interface EventoHistorico {
  id: string;
  data: string | null;
  data_valida: boolean;
  tipo: TipoEvento;
  titulo: string;
  descricao: string;
  origem: string;
  usuario: string | null;
  modulo: ModuloEvento;
  link_acao: string | null;
  metadados?: Record<string, string | number | boolean | null>;
}

export interface HistoricoInput {
  empresa: any;
  historicoEmpresa: any[];
  followupsEmpresa: any[];
  followupsEstruturados: any[];
  documentos: any[];
  simulacoes: any[];
  contratos: any[];
  orcamentos: any[];
  acompanhamentos: any[];
}

export interface HistoricoResult {
  empresa_id: string;
  calculado_em: string;
  total_eventos: number;
  total_sem_data: number;
  eventos_com_data: EventoHistorico[];
  eventos_sem_data: EventoHistorico[];
  resumo_por_tipo: Record<string, number>;
  primeiro_evento: string | null;
  ultimo_evento: string | null;
  fonte: "consolidado_360";
}

// ─── Mapeadores de eventos por fonte ─────────────────────────────────────────

function mapearHistoricoEmpresa(rows: any[]): EventoHistorico[] {
  return safeArr<any>(rows).map((h, i) => {
    const tipo = safeStr(h?.tipo, "nota").toLowerCase();
    const tipoMapeado: TipoEvento =
      tipo.includes("simulac") ? "simulacao" :
      tipo.includes("contrat") ? "contrato" :
      tipo.includes("document") ? "documento" :
      tipo.includes("analise") || tipo.includes("análise") ? "analise" :
      tipo.includes("nota") || tipo.includes("observ") ? "nota" :
      tipo.includes("atualiz") ? "atualizacao_cadastral" :
      tipo.includes("sistema") ? "sistema" : "nota";

    return {
      id: `hist_${safeStr(h?.id, String(i))}`,
      data: isDataValida(h?.created_at) ? String(h.created_at) : null,
      data_valida: isDataValida(h?.created_at),
      tipo: tipoMapeado,
      titulo: tipoMapeado === "simulacao" ? "Simulação registrada" :
              tipoMapeado === "contrato" ? "Contrato registrado" :
              tipoMapeado === "analise" ? "Análise registrada" :
              tipoMapeado === "atualizacao_cadastral" ? "Atualização cadastral" :
              tipoMapeado === "sistema" ? "Evento do sistema" : "Nota registrada",
      descricao: safeStr(h?.descricao, "Registro sem descrição"),
      origem: "empresa_historico",
      usuario: safeStr(h?.autor) || null,
      modulo: "cadastro_empresa",
      link_acao: null,
      metadados: { tipo_original: safeStr(h?.tipo, "nota") },
    };
  });
}

function mapearFollowupsEmpresa(rows: any[]): EventoHistorico[] {
  return safeArr<any>(rows).map((f, i) => ({
    id: `fup_${safeStr(f?.id, String(i))}`,
    data: isDataValida(f?.created_at) ? String(f.created_at) : null,
    data_valida: isDataValida(f?.created_at),
    tipo: "followup" as TipoEvento,
    titulo: `Follow-up: ${safeStr(f?.tipo, "Contato")}`,
    descricao: safeStr(f?.descricao, "Follow-up registrado"),
    origem: "followup_empresa",
    usuario: safeStr(f?.autor) || safeStr(f?.usuario) || null,
    modulo: "followup" as ModuloEvento,
    link_acao: null,
    metadados: { tipo: safeStr(f?.tipo, "contato") },
  }));
}

function mapearFollowupsEstruturados(rows: any[]): EventoHistorico[] {
  return safeArr<any>(rows).map((f, i) => ({
    id: `fupe_${safeStr(f?.id, String(i))}`,
    data: isDataValida(f?.created_at) ? String(f.created_at) : null,
    data_valida: isDataValida(f?.created_at),
    tipo: "followup" as TipoEvento,
    titulo: safeStr(f?.titulo, "Follow-up registrado"),
    descricao: safeStr(f?.descricao, safeStr(f?.titulo, "Follow-up sem descrição")),
    origem: "empresa_followups",
    usuario: safeStr(f?.autor) || safeStr(f?.responsavel) || null,
    modulo: "followup" as ModuloEvento,
    link_acao: null,
    metadados: {
      tipo: safeStr(f?.tipo, ""),
      concluido: f?.concluido === true || f?.concluido === 1,
    },
  }));
}

function mapearDocumentos(rows: any[]): EventoHistorico[] {
  return safeArr<any>(rows).map((d, i) => {
    const status = safeStr(d?.status, "enviado");
    const temArquivo = !!(d?.arquivo_path || d?.url || d?.file_path);
    const titulo = temArquivo
      ? status === "validado" || status === "aprovado"
        ? `Documento validado: ${safeStr(d?.tipo, safeStr(d?.nome_arquivo, "Documento"))}`
        : `Documento enviado: ${safeStr(d?.tipo, safeStr(d?.nome_arquivo, "Documento"))}`
      : `Documento cadastrado: ${safeStr(d?.tipo, "Documento")}`;

    return {
      id: `doc_${safeStr(d?.id, String(i))}`,
      data: isDataValida(d?.created_at) ? String(d.created_at) : null,
      data_valida: isDataValida(d?.created_at),
      tipo: "documento" as TipoEvento,
      titulo,
      descricao: safeStr(d?.nome_arquivo, safeStr(d?.tipo, "Arquivo sem nome")),
      origem: "documentos_arquivos",
      usuario: safeStr(d?.enviado_por) || safeStr(d?.usuario) || null,
      modulo: "acervo_documental" as ModuloEvento,
      link_acao: null,
      metadados: {
        tipo: safeStr(d?.tipo, ""),
        status,
        tem_arquivo: temArquivo,
      },
    };
  });
}

function mapearSimulacoes(rows: any[]): EventoHistorico[] {
  return safeArr<any>(rows).map((s, i) => {
    const valor = safeNum(s?.valor_solicitado);
    const produto = safeStr(s?.produto, "Produto não informado");
    const prazo = safeNum(s?.prazo_meses);
    const descricao = [
      produto,
      valor ? `Valor: ${formatarMoeda(valor)}` : null,
      prazo ? `Prazo: ${prazo} meses` : null,
      safeStr(s?.status) ? `Status: ${s.status}` : null,
    ].filter(Boolean).join(" · ");

    return {
      id: `sim_${safeStr(s?.id, String(i))}`,
      data: isDataValida(s?.criado_em) ? String(s.criado_em) :
            isDataValida(s?.created_at) ? String(s.created_at) : null,
      data_valida: isDataValida(s?.criado_em) || isDataValida(s?.created_at),
      tipo: "simulacao" as TipoEvento,
      titulo: `Simulação criada: ${produto}`,
      descricao,
      origem: "simulacoes_colaborador",
      usuario: safeStr(s?.colaborador_nome) || safeStr(s?.criado_por) || null,
      modulo: "simulacoes" as ModuloEvento,
      link_acao: null,
      metadados: {
        produto,
        valor: valor ?? "",
        prazo: prazo ?? "",
        status: safeStr(s?.status, ""),
      },
    };
  });
}

function mapearContratos(rows: any[]): EventoHistorico[] {
  const eventos: EventoHistorico[] = [];

  safeArr<any>(rows).forEach((c, i) => {
    const valor = safeNum(c?.valor_contrato);
    const tipo = safeStr(c?.tipo_contrato, "Contrato");
    const numero = safeStr(c?.numero_contrato, "s/n");

    // Evento de criação do contrato
    eventos.push({
      id: `ct_criacao_${safeStr(c?.id, String(i))}`,
      data: isDataValida(c?.created_at) ? String(c.created_at) : null,
      data_valida: isDataValida(c?.created_at),
      tipo: "contrato" as TipoEvento,
      titulo: `Contrato gerado: ${tipo} (${numero})`,
      descricao: [
        `Tipo: ${tipo}`,
        `Número: ${numero}`,
        valor ? `Valor: ${formatarMoeda(valor)}` : null,
        `Status: ${safeStr(c?.status, "pendente")}`,
      ].filter(Boolean).join(" · "),
      origem: "contratos_gerados",
      usuario: safeStr(c?.criado_por) || null,
      modulo: "contratos" as ModuloEvento,
      link_acao: null,
      metadados: { tipo, numero, valor: valor ?? "", status: safeStr(c?.status, "") },
    });

    // Evento de assinatura (se houver data_assinatura)
    if (isDataValida(c?.data_assinatura)) {
      eventos.push({
        id: `ct_assinatura_${safeStr(c?.id, String(i))}`,
        data: String(c.data_assinatura),
        data_valida: true,
        tipo: "contrato" as TipoEvento,
        titulo: `Contrato assinado: ${tipo} (${numero})`,
        descricao: [
          `Tipo: ${tipo}`,
          `Número: ${numero}`,
          valor ? `Valor: ${formatarMoeda(valor)}` : null,
        ].filter(Boolean).join(" · "),
        origem: "contratos_gerados",
        usuario: null,
        modulo: "contratos" as ModuloEvento,
        link_acao: null,
        metadados: { tipo, numero, valor: valor ?? "" },
      });
    }
  });

  return eventos;
}

function mapearOrcamentos(rows: any[]): EventoHistorico[] {
  return safeArr<any>(rows).map((o, i) => {
    const valor = safeNum(o?.valor_total);
    const status = safeStr(o?.status, "criado");
    return {
      id: `orc_${safeStr(o?.id, String(i))}`,
      data: isDataValida(o?.created_at) ? String(o.created_at) : null,
      data_valida: isDataValida(o?.created_at),
      tipo: "orcamento" as TipoEvento,
      titulo: `Orçamento ${status}: ${safeStr(o?.descricao, "Orçamento")}`,
      descricao: [
        safeStr(o?.descricao, "Orçamento sem descrição"),
        valor ? `Valor: ${formatarMoeda(valor)}` : null,
        `Status: ${status}`,
      ].filter(Boolean).join(" · "),
      origem: "orcamentos",
      usuario: safeStr(o?.criado_por) || null,
      modulo: "orcamentos" as ModuloEvento,
      link_acao: null,
      metadados: { status, valor: valor ?? "" },
    };
  });
}

function mapearAcompanhamentos(rows: any[]): EventoHistorico[] {
  return safeArr<any>(rows).map((a, i) => {
    const valor = safeNum(a?.valor);
    const banco = safeStr(a?.banco, "Banco não informado");
    const produto = safeStr(a?.produto, "Produto não informado");
    const status = safeStr(a?.status, "em análise");
    return {
      id: `acomp_${safeStr(a?.id, String(i))}`,
      data: isDataValida(a?.created_at) ? String(a.created_at) : null,
      data_valida: isDataValida(a?.created_at),
      tipo: "acompanhamento_bancario" as TipoEvento,
      titulo: `Acompanhamento bancário: ${banco} — ${produto}`,
      descricao: [
        `Banco: ${banco}`,
        `Produto: ${produto}`,
        valor ? `Valor: ${formatarMoeda(valor)}` : null,
        `Status: ${status}`,
      ].filter(Boolean).join(" · "),
      origem: "acompanhamentos_bancarios",
      usuario: safeStr(a?.responsavel) || null,
      modulo: "acompanhamento_bancario" as ModuloEvento,
      link_acao: null,
      metadados: { banco, produto, valor: valor ?? "", status },
    };
  });
}

function mapearEventosCadastrais(empresa: any): EventoHistorico[] {
  const eventos: EventoHistorico[] = [];

  // Evento de criação da empresa
  if (isDataValida(empresa?.created_at)) {
    eventos.push({
      id: "emp_criacao",
      data: String(empresa.created_at),
      data_valida: true,
      tipo: "cadastro",
      titulo: "Empresa cadastrada no sistema",
      descricao: `Empresa "${safeStr(empresa?.razao_social, "sem nome")}" cadastrada.`,
      origem: "empresas",
      usuario: safeStr(empresa?.captador_nome) || safeStr(empresa?.analista_nome) || null,
      modulo: "cadastro_empresa",
      link_acao: null,
      metadados: {
        cnpj: safeStr(empresa?.cnpj, ""),
        status: safeStr(empresa?.status, ""),
      },
    });
  }

  // Evento de última atualização (se diferente da criação)
  if (
    isDataValida(empresa?.updated_at) &&
    String(empresa?.updated_at) !== String(empresa?.created_at)
  ) {
    eventos.push({
      id: "emp_atualizacao",
      data: String(empresa.updated_at),
      data_valida: true,
      tipo: "atualizacao_cadastral",
      titulo: "Dados cadastrais atualizados",
      descricao: `Última atualização dos dados da empresa "${safeStr(empresa?.razao_social, "sem nome")}".`,
      origem: "empresas",
      usuario: null,
      modulo: "cadastro_empresa",
      link_acao: null,
      metadados: {},
    });
  }

  // Evento de sincronização com a Receita Federal
  if (isDataValida(empresa?.ultima_sincronizacao_receita)) {
    eventos.push({
      id: "emp_receita",
      data: String(empresa.ultima_sincronizacao_receita),
      data_valida: true,
      tipo: "atualizacao_cadastral",
      titulo: "Dados sincronizados com a Receita Federal",
      descricao: `CNPJ ${safeStr(empresa?.cnpj, "não informado")} consultado e dados atualizados.`,
      origem: "empresas",
      usuario: null,
      modulo: "cadastro_empresa",
      link_acao: null,
      metadados: { cnpj: safeStr(empresa?.cnpj, "") },
    });
  }

  return eventos;
}

// ─── Ordenação e separação por data ──────────────────────────────────────────

function ordenarEventos(eventos: EventoHistorico[]): {
  comData: EventoHistorico[];
  semData: EventoHistorico[];
} {
  const comData = eventos
    .filter(e => e.data_valida && e.data)
    .sort((a, b) => new Date(b.data!).getTime() - new Date(a.data!).getTime());

  const semData = eventos
    .filter(e => !e.data_valida || !e.data);

  return { comData, semData };
}

// ─── Resumo por tipo ──────────────────────────────────────────────────────────

function gerarResumoPorTipo(eventos: EventoHistorico[]): Record<string, number> {
  const resumo: Record<string, number> = {};
  for (const e of eventos) {
    resumo[e.tipo] = (resumo[e.tipo] ?? 0) + 1;
  }
  return resumo;
}

// ─── Função principal exportada ───────────────────────────────────────────────

export function consolidarHistorico360(input: HistoricoInput): HistoricoResult {
  const empresa = input?.empresa ?? {};

  // Consolidar todos os eventos de todas as fontes
  const todosEventos: EventoHistorico[] = [
    ...mapearEventosCadastrais(empresa),
    ...mapearHistoricoEmpresa(input?.historicoEmpresa),
    ...mapearFollowupsEmpresa(input?.followupsEmpresa),
    ...mapearFollowupsEstruturados(input?.followupsEstruturados),
    ...mapearDocumentos(input?.documentos),
    ...mapearSimulacoes(input?.simulacoes),
    ...mapearContratos(input?.contratos),
    ...mapearOrcamentos(input?.orcamentos),
    ...mapearAcompanhamentos(input?.acompanhamentos),
  ];

  // Separar por data
  const { comData, semData } = ordenarEventos(todosEventos);

  // Resumo por tipo
  const resumoPorTipo = gerarResumoPorTipo(todosEventos);

  // Primeiro e último evento
  const primeiroEvento = comData.length > 0
    ? comData[comData.length - 1].data
    : null;
  const ultimoEvento = comData.length > 0
    ? comData[0].data
    : null;

  return {
    empresa_id: safeStr(empresa?.id, ""),
    calculado_em: new Date().toISOString(),
    total_eventos: todosEventos.length,
    total_sem_data: semData.length,
    eventos_com_data: comData,
    eventos_sem_data: semData,
    resumo_por_tipo: resumoPorTipo,
    primeiro_evento: primeiroEvento,
    ultimo_evento: ultimoEvento,
    fonte: "consolidado_360",
  };
}
