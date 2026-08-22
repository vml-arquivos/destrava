import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn(() => ({ generateContent })),
  })),
}));

import {
  generateFollowupMessage,
  generateLeadRecommendations,
  generateLeadSummary,
  qualifyTriagemLead,
} from "../server/services/aiService";

const lead = {
  id: "lead-123",
  nome_completo: "João Silva",
  telefone: "(61) 99999-9999",
  razao_social: "Empresa Teste Ltda",
  cnpj: "12.345.678/0001-95",
  valor_solicitado: 50000,
  prazo_meses: 24,
  produto_interesse: "Capital de Giro",
  etapa_funil: "proposta",
  score_ia: 72,
  risco_classificacao: "baixo",
};

function mockGeminiJson(value: unknown) {
  generateContent.mockResolvedValueOnce({
    response: { text: () => JSON.stringify(value) },
  });
}

describe("aiService — funções reais e fallback operacional", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("retorna recomendações determinísticas quando a chave Gemini está ausente", async () => {
    const result = await generateLeadRecommendations(lead);

    expect(result._ia_status).toBe("fallback");
    expect(result._ia_reason).toContain("GEMINI_API_KEY ausente");
    expect(result.recomendacoes.length).toBeGreaterThanOrEqual(3);
    expect(result.recomendacoes[0]).toMatchObject({
      prioridade: "alta",
      tipo: "contato",
    });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("usa a resposta Gemini quando ela contém JSON válido", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiJson({
      recomendacoes: [{
        titulo: "Revisar documentação",
        descricao: "Validar documentos antes da proposta.",
        prioridade: "alta",
        tipo: "documento",
      }],
    });

    const result = await generateLeadRecommendations(lead);

    expect(result._ia_status).toBe("generated");
    expect(result.recomendacoes).toHaveLength(1);
    expect(result.recomendacoes[0].titulo).toBe("Revisar documentação");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("volta para o resultado determinístico quando Gemini retorna JSON inválido", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContent.mockResolvedValueOnce({
      response: { text: () => "Resposta sem JSON" },
    });

    const result = await generateLeadSummary(lead);

    expect(result._ia_status).toBe("fallback");
    expect(result._ia_reason).toBe("Resposta de IA sem JSON válido");
    expect(result.resumo).toContain("João Silva");
    expect(result.pontos_atencao).toBeInstanceOf(Array);
  });

  it("volta para o resultado determinístico quando Gemini falha", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContent.mockRejectedValueOnce(new Error("service unavailable"));

    const result = await qualifyTriagemLead({
      nome: "Maria",
      empresa: "Empresa de Teste",
      cpf_cnpj: "123.456.789-09",
      valor_solicitado: 100000,
    });

    expect(result._ia_status).toBe("fallback");
    expect(result._ia_reason).toBe("service unavailable");
    expect(result.classificacao).toBe("possivel_cliente");
    expect(result.score).toBeGreaterThanOrEqual(35);
  });

  it("gera link WhatsApp determinístico no fallback do follow-up", async () => {
    const result = await generateFollowupMessage(lead, {
      tipo: "primeiro_contato",
      canal: "whatsapp",
      nomeConsultor: "Ana",
    });

    expect(result._ia_status).toBe("fallback");
    expect(result.mensagem).toContain("João Silva");
    expect(result.link_whatsapp).toContain("https://wa.me/5561999999999");
    expect(result.link_whatsapp).toContain("text=");
  });

  it("recalcula o link WhatsApp com a mensagem realmente gerada", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGeminiJson({ mensagem: "Olá, João! Podemos avançar?" });

    const result = await generateFollowupMessage(lead, {
      canal: "whatsapp",
      nomeConsultor: "Ana",
    });

    expect(result._ia_status).toBe("generated");
    expect(result.mensagem).toBe("Olá, João! Podemos avançar?");
    expect(result.link_whatsapp).toContain(encodeURIComponent("Olá, João! Podemos avançar?"));
  });
});
