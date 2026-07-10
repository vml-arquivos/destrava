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

// ─── Verificação de configuração ──────────────────────────────────────────────

/**
 * Verifica se a integração está configurada no ambiente.
 * Retorna um objeto descritivo para exibição no frontend.
 */
export function verificarConfiguracaoNexus(): ConfiguracaoNexus {
  const nexusUrl = (process.env.NEXUS_WEBHOOK_URL || "").trim();
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

// ─── Geração de idempotencyKey ────────────────────────────────────────────────

/**
 * Gera uma chave de idempotência determinística baseada nos dados da pendência.
 * Garante que a mesma pendência da mesma empresa não seja enviada duas vezes.
 */
export function gerarIdempotencyKey(empresaId: string, pendenciaId: string): string {
  const data = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `destrava_${empresaId}_${pendenciaId}_${data}`;
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
  const nexusUrl   = (process.env.NEXUS_WEBHOOK_URL || "").trim();
  const nexusToken = (process.env.NEXUS_API_TOKEN   || "").trim();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Source": "destrava-credito",
    "X-Idempotency-Key": String(payloadEnriquecido.idempotency_key || ""),
  };

  if (nexusToken) {
    headers["Authorization"] = `Bearer ${nexusToken}`;
  }

  const res = await fetch(nexusUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payloadEnriquecido),
    signal: AbortSignal.timeout(10000),
  });

  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body };
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
