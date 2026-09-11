/**
 * Serviço centralizado de IA com fallback operacional.
 *
 * Objetivo: nenhuma ação crítica do CRM/Triagem pode quebrar o fluxo quando
 * a chave/modelo da IA estiver ausente, instável ou retornando JSON inválido.
 * As rotas seguem respondendo com estrutura previsível e o usuário ainda pode
 * salvar/editar manualmente.
 */

type JsonObject = Record<string, any>;

type AiResult<T extends JsonObject> = T & {
  _ia_status?: 'generated' | 'fallback';
  _ia_reason?: string;
};

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function safeText(value: unknown, fallback = 'Não informado'): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function safeMoney(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 'não informado';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function extractJson(text: string): JsonObject {
  const raw = String(text || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

async function generateJsonWithGemini<T extends JsonObject>(
  prompt: string,
  fallback: T,
  opts: { temperature?: number; timeoutMs?: number } = {},
): Promise<AiResult<T>> {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    return { ...fallback, _ia_status: 'fallback', _ia_reason: 'GEMINI_API_KEY ausente' };
  }

  const timeoutMs = Number(process.env.IA_TIMEOUT_MS || opts.timeoutMs || 18000);
  const modelName = String(process.env.GEMINI_MODEL || 'gemini-2.0-flash');

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: opts.temperature ?? 0.3,
      } as any,
    });

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IA_TIMEOUT')), timeoutMs)),
    ]);

    const parsed = extractJson(result.response.text() || '');
    if (!Object.keys(parsed).length) {
      return { ...fallback, _ia_status: 'fallback', _ia_reason: 'Resposta de IA sem JSON válido' };
    }
    return { ...fallback, ...parsed, _ia_status: 'generated' };
  } catch (err: any) {
    const reason = err?.message || String(err);
    console.warn('[aiService] fallback operacional:', reason);
    return { ...fallback, _ia_status: 'fallback', _ia_reason: reason };
  }
}

export async function generateLeadRecommendations(lead: JsonObject, historico: JsonObject[] = []) {
  const fallback = {
    recomendacoes: [
      {
        titulo: 'Validar necessidade e valor do crédito',
        descricao: `Confirme com ${safeText(lead.nome_completo || lead.nome, 'o lead')} o valor solicitado, finalidade do crédito e prazo desejado antes de avançar a proposta.`,
        prioridade: 'alta',
        tipo: 'contato',
      },
      {
        titulo: 'Conferir documentação essencial',
        descricao: 'Solicite ou valide cartão CNPJ, contrato social, documentos dos sócios e comprovantes financeiros antes da análise bancária.',
        prioridade: 'media',
        tipo: 'documento',
      },
      {
        titulo: 'Agendar próximo follow-up',
        descricao: 'Registre uma próxima ação no CRM para evitar perda de contato e manter o funil atualizado.',
        prioridade: 'media',
        tipo: 'followup',
      },
    ],
  };

  const prompt = `Você é um consultor de crédito empresarial da Destrava Crédito.
Analise os dados do lead e gere 3 a 5 recomendações práticas para avançar no CRM.
Responda APENAS em JSON com o campo "recomendacoes" como array de objetos com: "titulo", "descricao", "prioridade" (alta|media|baixa), "tipo" (contato|documento|proposta|followup|alerta).

Lead: ${safeText(lead.nome_completo || lead.nome)}
Empresa: ${safeText(lead.razao_social || lead.empresa, 'Pessoa Física')}
CNPJ/CPF: ${safeText(lead.cnpj || lead.cpf_cnpj || lead.cliente_documento, 'N/A')}
Etapa do funil: ${safeText(lead.etapa_funil)}
Valor solicitado: ${safeMoney(lead.valor_solicitado)}
Temperatura: ${safeText(lead.temperatura, 'morno')}
Score: ${safeText(lead.score_efetivo || lead.score_ia, 'N/A')}
Risco: ${safeText(lead.risco_classificacao || lead.risco, 'N/A')}
Histórico recente: ${historico.map((h) => `${h.tipo || 'interação'}: ${h.descricao || ''}`).join('; ') || 'sem histórico'}`;

  return generateJsonWithGemini(prompt, fallback, { temperature: 0.4 });
}

export async function generateLeadSummary(lead: JsonObject, historico: JsonObject[] = [], contratos: JsonObject[] = []) {
  const nome = safeText(lead.nome_completo || lead.nome, 'Lead');
  const etapa = safeText(lead.etapa_funil, 'entrada');
  const fallback = {
    resumo: `${nome} está na etapa ${etapa}. Valor solicitado: ${safeMoney(lead.valor_solicitado)}. Priorize validação de necessidade, documentação cadastral e próximo contato registrado no CRM.`,
    pontos_atencao: [
      'Confirmar finalidade e prazo do crédito.',
      'Validar documentos obrigatórios antes de proposta final.',
      'Registrar próxima ação para manter o funil atualizado.',
    ],
  };

  const prompt = `Você é um consultor de crédito empresarial da Destrava Crédito.
Gere um resumo executivo conciso, no máximo 200 palavras, destacando situação no funil, pontos de atenção e próximos passos.
Responda APENAS em JSON com "resumo" e "pontos_atencao".

Lead: ${nome}
Empresa: ${safeText(lead.razao_social || lead.empresa, 'PF')}
Etapa: ${etapa}
Valor: ${safeMoney(lead.valor_solicitado)}
Score: ${safeText(lead.score_efetivo || lead.score_ia, 'N/A')}
Risco: ${safeText(lead.risco_classificacao || lead.risco, 'N/A')}
Contratos: ${contratos.map((c) => c.tipo_contrato || c.status).filter(Boolean).join(', ') || 'nenhum'}
Histórico: ${historico.slice(0, 10).map((h) => `${h.tipo || 'interação'}: ${h.descricao || ''}`).join('; ') || 'sem histórico'}`;

  return generateJsonWithGemini(prompt, fallback, { temperature: 0.3 });
}

export async function qualifyTriagemLead(lead: JsonObject) {
  const hasCompany = Boolean(String(lead.empresa || lead.razao_social || '').trim());
  const doc = onlyDigits(lead.cnpj || lead.cpf_cnpj || '');
  const valor = Number(lead.valor || lead.valor_solicitado || 0);
  const scoreBase = Math.max(35, Math.min(82, (hasCompany ? 18 : 0) + (doc.length >= 11 ? 16 : 0) + (valor > 0 ? 16 : 0) + 35));

  const fallback = {
    classificacao: hasCompany || doc.length >= 11 ? 'possivel_cliente' : 'pendente',
    score: scoreBase,
    temperatura: scoreBase >= 70 ? 'quente' : scoreBase >= 50 ? 'morno' : 'frio',
    resumo: `Lead recebido para triagem. Empresa: ${safeText(lead.empresa || lead.razao_social)}. Produto: ${safeText(lead.produto || lead.produto_interesse, 'crédito empresarial')}.`,
    pontos_positivos: [
      ...(hasCompany ? ['Empresa informada no cadastro.'] : []),
      ...(valor > 0 ? ['Valor de interesse informado.'] : []),
    ],
    pontos_atencao: [
      ...(doc.length < 11 ? ['Documento CPF/CNPJ não informado ou incompleto.'] : []),
      'Validar contato e documentos antes de converter para CRM.',
    ],
    proxima_acao: 'Confirmar dados cadastrais e necessidade de crédito por WhatsApp ou telefone.',
  };

  const prompt = `Você é um analista de crédito empresarial especializado em PMEs.
Analise o lead abaixo e classifique o potencial para crédito empresarial.
Responda APENAS em JSON com: classificacao (possivel_cliente|curioso|sem_perfil|pendente), score (0-100), temperatura (frio|morno|quente), resumo, pontos_positivos, pontos_atencao e proxima_acao.

Nome: ${safeText(lead.nome)}
Empresa: ${safeText(lead.empresa || lead.razao_social)}
Telefone: ${safeText(lead.telefone)}
Documento: ${safeText(lead.cnpj || lead.cpf_cnpj)}
Produto: ${safeText(lead.produto || lead.produto_interesse)}
Valor: ${safeMoney(lead.valor || lead.valor_solicitado)}
Prazo: ${safeText(lead.prazo || lead.prazo_meses)}
Origem: ${safeText(lead.canal_origem || lead.origem, 'simulador_publico')}`;

  return generateJsonWithGemini(prompt, fallback, { temperature: 0.3 });
}

export async function generateFollowupMessage(lead: JsonObject, params: { tipo?: string; canal?: string; nomeConsultor?: string }) {
  const tipo = params.tipo || 'primeiro_contato';
  const canal = params.canal || 'whatsapp';
  const nomeConsultor = params.nomeConsultor || 'Consultor';
  const tel = onlyDigits(lead.telefone || '');
  const telBr = tel ? (tel.startsWith('55') ? tel : `55${tel}`) : '';
  const mensagemBase = `Olá, ${safeText(lead.nome_completo || lead.nome, 'tudo bem')}? Aqui é ${nomeConsultor}, da Destrava Crédito. Estou entrando em contato para avançarmos com sua solicitação de ${safeText(lead.produto_interesse || lead.produto, 'crédito')}. Posso confirmar alguns dados e te orientar nos próximos passos?`;
  const fallback: JsonObject = canal === 'email'
    ? { assunto: 'Próximos passos da sua solicitação de crédito', mensagem: mensagemBase }
    : { mensagem: mensagemBase, link_whatsapp: telBr ? `https://wa.me/${telBr}?text=${encodeURIComponent(mensagemBase)}` : undefined };

  const prompt = `Você é ${nomeConsultor}, consultor da Destrava Crédito.
Gere uma mensagem de follow-up personalizada para o lead abaixo.
Tipo do follow-up: ${tipo}
Canal: ${canal}
Formato: ${canal === 'whatsapp' ? 'Mensagem curta para WhatsApp, até 3 parágrafos, sem markdown' : 'E-mail profissional com assunto e corpo'}

Lead: ${safeText(lead.nome_completo || lead.nome)}
Empresa: ${safeText(lead.razao_social || lead.empresa, 'Pessoa Física')}
Valor solicitado: ${safeMoney(lead.valor_solicitado || lead.valor)}
Produto: ${safeText(lead.produto_interesse || lead.produto, 'crédito empresarial')}
Etapa: ${safeText(lead.etapa_funil)}

Responda APENAS em JSON com ${canal === 'whatsapp' ? '"mensagem"' : '"assunto" e "mensagem"'}.`;

  const generated = await generateJsonWithGemini(prompt, fallback, { temperature: 0.6 });
  if (canal === 'whatsapp' && telBr && generated.mensagem) {
    generated.link_whatsapp = `https://wa.me/${telBr}?text=${encodeURIComponent(generated.mensagem)}`;
  }
  return generated;
}
