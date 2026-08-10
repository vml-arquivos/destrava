/**
 * integracaoNexusService.ts
 *
 * Serviço de integração segura entre Destrava Crédito e Nexus/n8n.
 * Transforma pendências da Inteligência 360 em tarefas inteligentes.
 *
 * REGRAS FUNDAMENTAIS:
 * - Exige confirmação explícita do usuário antes de enviar.
 * - Não cria tarefas duplicadas (idempotência por idempotencyKey).
 * - Não envia se as variáveis de ambiente não estiverem configuradas.
 * - Não altera dados existentes da empresa.
 * - Não cria eventos falsos no histórico.
 * - Mensagens de erro são amigáveis e orientadas à ação.
 *
 * Variáveis de ambiente necessárias (pelo menos uma):
 *   NEXUS_WEBHOOK_URL  — URL do webhook do Nexus para receber tarefas
 *   NEXUS_API_TOKEN    — Token de autenticação para o Nexus (opcional)
 *   N8N_WEBHOOK_URL    — URL do webhook do n8n como fallback
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PayloadNexus {
  empresaId: string;
  cnpj: string | null;
  razaoSocial: string;
  pendenciaId: string;
  prioridade: "alta" | "media" | "baixa";
  categoria: string;
  titulo: string;
  descricao: string;
  moduloOrigem: string;
  acaoRecomendada: string;
  idempotencyKey: string;
}

export interface ResultadoEnvioNexus {
  sucesso: boolean;
  destino: "nexus" | "n8n" | null;
  idempotencyKey: string;
  jaEnviado: boolean;
  mensagem: string;
  detalhe?: string;
  timestamp: string;
}

export interface ConfiguracaoNexus {
  nexusConfigurado: boolean;
  n8nConfigurado: boolean;
  algumConfigurado: boolean;
  destino: "nexus" | "n8n" | "nenhum";
  mensagemStatus: string;
}

export interface TarefaManualNexus {
  entidadeTipo: "empresa" | "pessoa_fisica";
  entidadeId: string;
  entidadeNome: string;
  documento?: string | null;
  titulo: string;
  descricao?: string | null;
  prazo?: string | null;
  prioridade: "alta" | "media" | "baixa";
  clientRequestId: string;
  criadoPorId: string;
  criadoPorNome?: string | null;
  criadoPorEmail?: string | null;
  checklist: Array<{
    id: string;
    texto: string;
    descricao?: string | null;
    data?: string | null;
    responsavelEmail?: string | null;
    responsavelId?: string | null;
    dificuldade?: "nivel_1" | "nivel_2" | "nivel_3" | "nivel_4" | "nivel_5";
    pontuacao?: 0 | 1 | 3 | 5 | 20;
    recorrencia?: "unica" | "diaria" | "semanal" | "mensal";
    recorrenciaDiaSemana?: number | null;
    recorrenciaDiaMes?: number | null;
  }>;
}

export interface CatalogoDestinatariosNexus {
  membros: Array<{
    id: string;
    nome: string;
    email: string;
    role: string;
    cargo?: string | null;
    equipe_ids: string[];
  }>;
  equipes: Array<{
    id: string;
    nome: string;
    descricao?: string | null;
    membro_ids: string[];
  }>;
  total_membros: number;
  total_equipes: number;
  responsavel_sugerido_id?: string | null;
}

// ─── Verificação de configuração ──────────────────────────────────────────────

/**
 * Verifica se a integração está configurada no ambiente.
 * Retorna um objeto descritivo para exibição no frontend.
 */
export function verificarConfiguracaoNexus(): ConfiguracaoNexus {
  const nexusUrl = (
    process.env.NEXUS_WEBHOOK_URL
    || process.env.NEXUS_API_BASE_URL
    || process.env.NEXUS_PUBLIC_URL
    || process.env.NEXUS_BASE_URL
    || ""
  ).trim();
  const n8nUrl   = (process.env.N8N_WEBHOOK_URL   || "").trim();

  const nexusConfigurado = nexusUrl.length > 0;
  const n8nConfigurado   = n8nUrl.length > 0;
  const algumConfigurado = nexusConfigurado || n8nConfigurado;

  let destino: "nexus" | "n8n" | "nenhum" = "nenhum";
  if (nexusConfigurado) destino = "nexus";
  else if (n8nConfigurado) destino = "n8n";

  let mensagemStatus = "";
  if (!algumConfigurado) {
    mensagemStatus =
      "Integração Nexus/n8n não configurada. " +
      "Defina NEXUS_WEBHOOK_URL ou N8N_WEBHOOK_URL nas variáveis de ambiente do servidor.";
  } else if (nexusConfigurado) {
    mensagemStatus = "Integração Nexus configurada e pronta para uso.";
  } else {
    mensagemStatus = "Integração n8n configurada como destino de tarefas.";
  }

  return { nexusConfigurado, n8nConfigurado, algumConfigurado, destino, mensagemStatus };
}

/**
 * Monta uma URL de backend do Nexus sem expor o token no navegador.
 * NEXUS_API_BASE_URL/NEXUS_PUBLIC_URL são preferidas. Para instalações já
 * existentes, também reaproveita NEXUS_WEBHOOK_URL quando ela aponta para
 * /api/integracoes/... no próprio Nexus.
 */
export function resolverUrlIntegracaoNexus(recurso: string): string | null {
  const cleanResource = recurso.replace(/^\/+/, "");
  const explicit = String(
    process.env.NEXUS_API_BASE_URL || process.env.NEXUS_PUBLIC_URL || process.env.NEXUS_BASE_URL || "",
  ).trim();
  const webhook = String(process.env.NEXUS_WEBHOOK_URL || "").trim();

  const buildFrom = (raw: string, requireExistingIntegrationPath: boolean): string | null => {
    if (!raw) return null;
    try {
      const parsed = new URL(raw);
      const marker = "/api/integracoes";
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        parsed.pathname = `${parsed.pathname.slice(0, markerIndex)}${marker}/${cleanResource}`;
      } else {
        if (requireExistingIntegrationPath) return null;
        const basePath = parsed.pathname.replace(/\/+$/, "");
        parsed.pathname = basePath.endsWith("/api")
          ? `${basePath}/integracoes/${cleanResource}`
          : `${basePath}${marker}/${cleanResource}`;
      }
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  };

  return buildFrom(explicit, false) || buildFrom(webhook, true);
}

function nexusIntegrationHeaders(): Record<string, string> {
  const token = String(process.env.NEXUS_API_TOKEN || process.env.NEXUS_INTEGRATION_SECRET || "").trim();
  return {
    "Content-Type": "application/json",
    "X-Source": "destrava-credito",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function integrationError(message: string, status = 502): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function isHtmlResponse(body: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(body);
}

export function detalheSeguroRespostaNexus(status: number, body: string): string {
  if (isHtmlResponse(body)) {
    return `O proxy do Nexus retornou uma página HTML (HTTP ${status}). Verifique se o Nexus está online e se NEXUS_WEBHOOK_URL aponta para /api/integracoes/destrava/tarefas.`;
  }
  return body.trim().slice(0, 300) || `Resposta vazia do Nexus (HTTP ${status}).`;
}

export async function buscarDestinatariosNexus(input: {
  criadoPorEmail?: string | null;
  externalId?: string | null;
  externalType?: "empresa" | "pessoa_fisica";
}): Promise<CatalogoDestinatariosNexus> {
  const url = resolverUrlIntegracaoNexus("destrava/destinatarios");
  if (!url) {
    throw integrationError(
      "Catálogo de equipes e membros não configurado. Defina NEXUS_API_BASE_URL (recomendado) ou use NEXUS_WEBHOOK_URL com a rota oficial do Nexus.",
      503,
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: nexusIntegrationHeaders(),
      body: JSON.stringify({
        criado_por_email: input.criadoPorEmail || null,
        external_id: input.externalId || null,
        external_type: input.externalType || "empresa",
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw integrationError("Não foi possível conectar ao Nexus para carregar equipes e membros.", 502);
  }

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    let message = detalheSeguroRespostaNexus(response.status, body);
    if (!isHtmlResponse(body)) {
      try { message = JSON.parse(body)?.error || message; } catch { /* resposta textual */ }
    }
    throw integrationError(message, response.status >= 400 && response.status < 600 ? response.status : 502);
  }

  if (isHtmlResponse(body)) {
    throw integrationError(detalheSeguroRespostaNexus(response.status, body), 502);
  }
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { throw integrationError("O Nexus retornou um catálogo em formato inválido.", 502); }
  if (!Array.isArray(parsed?.membros) || !Array.isArray(parsed?.equipes)) {
    throw integrationError("O Nexus retornou um catálogo incompleto de equipes e membros.", 502);
  }
  return parsed as CatalogoDestinatariosNexus;
}

// ─── Geração de idempotencyKey ────────────────────────────────────────────────

/**
 * Gera uma chave de idempotência determinística baseada nos dados da pendência.
 * Garante que a mesma pendência da mesma empresa não seja enviada duas vezes.
 */
export function gerarIdempotencyKey(empresaId: string, pendenciaId: string): string {
  const data = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `destrava_${empresaId}_${pendenciaId}_${data}`;
}

export function gerarIdempotencyKeyTarefaManual(
  entidadeTipo: "empresa" | "pessoa_fisica",
  entidadeId: string,
  clientRequestId: string,
): string {
  return `destrava_manual:${entidadeTipo}:${entidadeId}:${clientRequestId}`;
}

// ─── Controle de duplicatas em memória ───────────────────────────────────────

/**
 * Cache em memória de chaves já enviadas nesta sessão do servidor.
 * Em produção com múltiplas instâncias, usar Redis ou tabela no banco.
 * Aqui é suficiente pois o endpoint também verifica no banco antes de enviar.
 */
const _chaveEnviadasMemoria = new Set<string>();

export function marcarChaveEnviada(key: string): void {
  _chaveEnviadasMemoria.add(key);
}

export function chaveJaFoiEnviada(key: string): boolean {
  return _chaveEnviadasMemoria.has(key);
}

export function limparCacheIdempotencia(): void {
  _chaveEnviadasMemoria.clear();
}

// ─── Validação do payload ─────────────────────────────────────────────────────

export interface ErroValidacao {
  campo: string;
  mensagem: string;
}

export function validarPayloadNexus(payload: unknown): ErroValidacao[] {
  const erros: ErroValidacao[] = [];

  if (!payload || typeof payload !== "object") {
    erros.push({ campo: "payload", mensagem: "Payload inválido ou ausente." });
    return erros;
  }

  const p = payload as Record<string, unknown>;

  if (!p.empresaId || typeof p.empresaId !== "string" || !p.empresaId.trim()) {
    erros.push({ campo: "empresaId", mensagem: "ID da empresa é obrigatório." });
  }

  if (!p.razaoSocial || typeof p.razaoSocial !== "string" || !p.razaoSocial.trim()) {
    erros.push({ campo: "razaoSocial", mensagem: "Razão social da empresa é obrigatória." });
  }

  if (!p.pendenciaId || typeof p.pendenciaId !== "string" || !p.pendenciaId.trim()) {
    erros.push({ campo: "pendenciaId", mensagem: "ID da pendência é obrigatório." });
  }

  if (!p.titulo || typeof p.titulo !== "string" || !p.titulo.trim()) {
    erros.push({ campo: "titulo", mensagem: "Título da tarefa é obrigatório." });
  }

  if (!p.descricao || typeof p.descricao !== "string" || !p.descricao.trim()) {
    erros.push({ campo: "descricao", mensagem: "Descrição da tarefa é obrigatória." });
  }

  if (!p.categoria || typeof p.categoria !== "string" || !p.categoria.trim()) {
    erros.push({ campo: "categoria", mensagem: "Categoria da pendência é obrigatória." });
  }

  if (!p.prioridade || !["alta", "media", "baixa"].includes(String(p.prioridade))) {
    erros.push({ campo: "prioridade", mensagem: "Prioridade deve ser 'alta', 'media' ou 'baixa'." });
  }

  if (!p.acaoRecomendada || typeof p.acaoRecomendada !== "string" || !p.acaoRecomendada.trim()) {
    erros.push({ campo: "acaoRecomendada", mensagem: "Ação recomendada é obrigatória." });
  }

  if (!p.idempotencyKey || typeof p.idempotencyKey !== "string" || !p.idempotencyKey.trim()) {
    erros.push({ campo: "idempotencyKey", mensagem: "Chave de idempotência é obrigatória." });
  }

  return erros;
}

// ─── Construção do payload enriquecido ───────────────────────────────────────

function construirPayloadEnriquecido(payload: PayloadNexus): Record<string, unknown> {
  return {
    // Metadados do sistema
    sistema: "destrava_credito",
    versao: "1.0",
    evento: "pendencia.tarefa_criada",
    timestamp: new Date().toISOString(),

    // Dados de idempotência
    idempotency_key: payload.idempotencyKey,

    // Dados da empresa
    empresa: {
      id: payload.empresaId,
      cnpj: payload.cnpj ?? null,
      razao_social: payload.razaoSocial,
    },

    // Dados da tarefa/pendência
    tarefa: {
      id: payload.pendenciaId,
      titulo: payload.titulo,
      descricao: payload.descricao,
      categoria: payload.categoria,
      prioridade: payload.prioridade,
      acao_recomendada: payload.acaoRecomendada,
      modulo_origem: payload.moduloOrigem || "inteligencia_360",
    },

    // Contexto para o Nexus/n8n
    contexto: {
      origem: "destrava_inteligencia_360",
      tipo: "pendencia_critica",
      link_empresa: `/colaborador/empresas?empresa=${payload.empresaId}&aba=inteligencia_360`,
      link_modulo: `/colaborador/empresas?empresa=${payload.empresaId}&aba=${payload.moduloOrigem || "inteligencia_360"}`,
    },
  };
}

// ─── Envio para Nexus ─────────────────────────────────────────────────────────

async function enviarParaNexus(
  payloadEnriquecido: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: string }> {
  const nexusUrl = resolverUrlIntegracaoNexus("destrava/tarefas")
    || (process.env.NEXUS_WEBHOOK_URL || "").trim();

  const headers: Record<string, string> = {
    ...nexusIntegrationHeaders(),
    "X-Idempotency-Key": String(payloadEnriquecido.idempotency_key || ""),
  };

  const res = await fetch(nexusUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payloadEnriquecido),
    signal: AbortSignal.timeout(10000),
  });

  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body };
}

/**
 * Envia uma lista manual criada dentro do cadastro selecionado. O formato é o
 * mesmo contrato plano aceito pelo Nexus e a idempotência identifica somente
 * a tentativa atual — duas listas legítimas da mesma entidade nunca colidem.
 */
export async function enviarTarefaManualNexus(input: TarefaManualNexus): Promise<ResultadoEnvioNexus> {
  const timestamp = new Date().toISOString();
  const idempotencyKey = gerarIdempotencyKeyTarefaManual(input.entidadeTipo, input.entidadeId, input.clientRequestId);
  const config = verificarConfiguracaoNexus();
  if (!config.nexusConfigurado) {
    return {
      sucesso: false,
      destino: null,
      idempotencyKey,
      jaEnviado: false,
      mensagem: "A criação manual exige NEXUS_WEBHOOK_URL configurada.",
      timestamp,
    };
  }

  const payload = {
    sistema: "destrava_credito",
    versao: "2.0",
    evento: "tarefa.manual_criada",
    timestamp,
    idempotency_key: idempotencyKey,
    external_type: input.entidadeTipo,
    external_id: input.entidadeId,
    external_name: input.entidadeNome,
    titulo: input.titulo,
    descricao: input.descricao || null,
    prazo: input.prazo || null,
    prioridade: input.prioridade,
    contexto_tipo: input.entidadeTipo,
    criado_por_email: input.criadoPorEmail || null,
    criado_por_nome: input.criadoPorNome || null,
    destrava_colaborador_id: input.criadoPorId,
    responsavel_email: input.criadoPorEmail || null,
    source_url: input.entidadeTipo === "empresa"
      ? `/colaborador/empresas?empresa=${input.entidadeId}`
      : `/colaborador/clientes-pf?cliente=${input.entidadeId}`,
    checklist: input.checklist.map(item => ({
      id: item.id,
      texto: item.texto,
      descricao: item.descricao || null,
      data: item.data || null,
      // O ID selecionado vem do catálogo oficial e ainda é revalidado pelo
      // Nexus na mesma organização. E-mail permanece como fallback legado.
      responsavel_id: item.responsavelId || null,
      responsavel_email: item.responsavelEmail || null,
      dificuldade: item.dificuldade || "nivel_3",
      pontuacao: item.pontuacao ?? 3,
      recorrencia: item.recorrencia || "unica",
      recorrencia_dia_semana: item.recorrencia === "semanal" ? item.recorrenciaDiaSemana ?? null : null,
      recorrencia_dia_mes: item.recorrencia === "mensal" ? item.recorrenciaDiaMes ?? null : null,
      feito: false,
    })),
    metadata: {
      contrato: "destrava.nexus.tarefa.manual.v1",
      entidade_tipo: input.entidadeTipo,
      documento: input.documento || null,
      client_request_id: input.clientRequestId,
    },
    // Cada ação pontua individualmente, exatamente como na criação nativa do
    // Nexus. O lançamento no ranking só ocorre após a aprovação no Nexus.
    pontuacao_escopo: "subtarefas",
    conta_ranking: true,
  };

  try {
    const response = await enviarParaNexus(payload);
    if (!response.ok) {
      return {
        sucesso: false,
        destino: "nexus",
        idempotencyKey,
        jaEnviado: false,
        mensagem: `O Nexus recusou a lista (HTTP ${response.status}).`,
        detalhe: detalheSeguroRespostaNexus(response.status, response.body),
        timestamp,
      };
    }
    let parsed: any = null;
    try { parsed = JSON.parse(response.body); } catch { /* resposta sem JSON */ }
    return {
      sucesso: true,
      destino: "nexus",
      idempotencyKey,
      jaEnviado: Boolean(parsed?.duplicado),
      mensagem: parsed?.duplicado
        ? "Esta mesma tentativa já havia sido recebida pelo Nexus; nenhuma duplicata foi criada."
        : "Lista criada no Nexus com checklist, responsáveis e datas preservados.",
      detalhe: parsed?.tarefa?.id ? `Nexus ID: ${parsed.tarefa.id}` : undefined,
      timestamp,
    };
  } catch (error) {
    return {
      sucesso: false,
      destino: "nexus",
      idempotencyKey,
      jaEnviado: false,
      mensagem: "Não foi possível conectar ao Nexus. A mesma tentativa pode ser reenviada com segurança.",
      detalhe: error instanceof Error ? error.message : String(error),
      timestamp,
    };
  }
}

// ─── Envio para n8n ───────────────────────────────────────────────────────────

async function enviarParaN8n(
  payloadEnriquecido: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: string }> {
  const n8nUrl = (process.env.N8N_WEBHOOK_URL || "").trim();

  const res = await fetch(n8nUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Source": "destrava-credito",
      "X-Idempotency-Key": String(payloadEnriquecido.idempotency_key || ""),
    },
    body: JSON.stringify(payloadEnriquecido),
    signal: AbortSignal.timeout(10000),
  });

  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body };
}

// ─── Função principal de envio ────────────────────────────────────────────────

/**
 * Envia uma pendência como tarefa para o Nexus ou n8n.
 *
 * Fluxo:
 * 1. Valida o payload.
 * 2. Verifica se a integração está configurada.
 * 3. Verifica idempotência (cache em memória + verificação externa).
 * 4. Constrói o payload enriquecido.
 * 5. Tenta enviar para Nexus; se não configurado, tenta n8n.
 * 6. Registra a chave de idempotência em memória.
 * 7. Retorna o resultado estruturado.
 *
 * @param payload - Dados da pendência a ser enviada
 * @param verificarDuplicataExterna - Função opcional para verificar duplicata no banco
 */
export async function enviarPendenciaNexus(
  payload: PayloadNexus,
  verificarDuplicataExterna?: (key: string) => Promise<boolean>
): Promise<ResultadoEnvioNexus> {
  const timestamp = new Date().toISOString();

  // 1. Validar payload
  const erros = validarPayloadNexus(payload);
  if (erros.length > 0) {
    return {
      sucesso: false,
      destino: null,
      idempotencyKey: payload?.idempotencyKey || "",
      jaEnviado: false,
      mensagem: `Dados inválidos: ${erros.map(e => e.mensagem).join("; ")}`,
      timestamp,
    };
  }

  // 2. Verificar configuração
  const config = verificarConfiguracaoNexus();
  if (!config.algumConfigurado) {
    return {
      sucesso: false,
      destino: null,
      idempotencyKey: payload.idempotencyKey,
      jaEnviado: false,
      mensagem: config.mensagemStatus,
      detalhe:
        "Configure NEXUS_WEBHOOK_URL ou N8N_WEBHOOK_URL nas variáveis de ambiente do servidor para habilitar esta funcionalidade.",
      timestamp,
    };
  }

  // 3. Verificar idempotência em memória
  if (chaveJaFoiEnviada(payload.idempotencyKey)) {
    return {
      sucesso: true,
      destino: config.destino === "nenhum" ? null : config.destino,
      idempotencyKey: payload.idempotencyKey,
      jaEnviado: true,
      mensagem: "Tarefa já foi enviada anteriormente nesta sessão. Nenhuma duplicata criada.",
      timestamp,
    };
  }

  // 4. Verificar idempotência externa (banco de dados)
  if (verificarDuplicataExterna) {
    try {
      const jaExiste = await verificarDuplicataExterna(payload.idempotencyKey);
      if (jaExiste) {
        marcarChaveEnviada(payload.idempotencyKey); // sincronizar cache
        return {
          sucesso: true,
          destino: config.destino === "nenhum" ? null : config.destino,
          idempotencyKey: payload.idempotencyKey,
          jaEnviado: true,
          mensagem: "Tarefa já registrada anteriormente. Nenhuma duplicata criada.",
          timestamp,
        };
      }
    } catch (err: unknown) {
      // Falha na verificação externa não bloqueia o envio — apenas loga
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[integracaoNexus] Aviso: falha ao verificar duplicata externa: ${msg}`);
    }
  }

  // 5. Construir payload enriquecido
  const payloadEnriquecido = construirPayloadEnriquecido(payload);

  // 6. Tentar envio
  let resultado: { ok: boolean; status: number; body: string } | null = null;
  let destinoUsado: "nexus" | "n8n" | null = null;

  if (config.nexusConfigurado) {
    try {
      resultado = await enviarParaNexus(payloadEnriquecido);
      destinoUsado = "nexus";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[integracaoNexus] Erro ao enviar para Nexus: ${msg}`);
      // Tentar fallback para n8n se disponível
      if (config.n8nConfigurado) {
        try {
          resultado = await enviarParaN8n(payloadEnriquecido);
          destinoUsado = "n8n";
        } catch (err2: unknown) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          console.error(`[integracaoNexus] Erro ao enviar para n8n (fallback): ${msg2}`);
        }
      }
    }
  } else if (config.n8nConfigurado) {
    try {
      resultado = await enviarParaN8n(payloadEnriquecido);
      destinoUsado = "n8n";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[integracaoNexus] Erro ao enviar para n8n: ${msg}`);
    }
  }

  // 7. Tratar resultado
  if (!resultado) {
    return {
      sucesso: false,
      destino: null,
      idempotencyKey: payload.idempotencyKey,
      jaEnviado: false,
      mensagem:
        "Falha ao conectar com o serviço de integração. Verifique se o webhook está acessível e tente novamente.",
      timestamp,
    };
  }

  if (!resultado.ok) {
    return {
      sucesso: false,
      destino: destinoUsado,
      idempotencyKey: payload.idempotencyKey,
      jaEnviado: false,
      mensagem: `O serviço de integração retornou um erro (HTTP ${resultado.status}). Verifique a configuração do webhook.`,
      detalhe: resultado.body ? resultado.body.slice(0, 200) : undefined,
      timestamp,
    };
  }

  // 8. Sucesso — registrar idempotência
  marcarChaveEnviada(payload.idempotencyKey);

  const destinoLabel = destinoUsado === "nexus" ? "Nexus" : "n8n";
  return {
    sucesso: true,
    destino: destinoUsado,
    idempotencyKey: payload.idempotencyKey,
    jaEnviado: false,
    mensagem: `Tarefa criada com sucesso no ${destinoLabel}. A equipe será notificada para resolver a pendência.`,
    timestamp,
  };
}
