import { RequestInit } from 'node-fetch';

/**
 * callGemini – Faz uma chamada para um serviço externo de IA (Gemini)
 *
 * O objetivo desta função é encapsular a chamada HTTP para um serviço
 * externo de LLM (Large Language Model) como o Gemini ou qualquer outro
 * endpoint configurado via variável de ambiente. Ao centralizar a lógica
 * de request em um único módulo, é possível trocar o provedor de IA sem
 * alterar as rotas. Caso o serviço esteja indisponível, a função lança
 * erro para que a rota possa aplicar fallback.
 *
 * A URL do serviço deve ser definida na variável de ambiente GEMINI_API_URL.
 * Se não existir, utiliza http://localhost:9001 como padrão. O body
 * enviado para o serviço é um JSON com o campo `prompt` e quaisquer
 * parâmetros adicionais fornecidos em `options`.
 */
export async function callGemini(prompt: string, options: Record<string, unknown> = {}): Promise<any> {
  const url = process.env.GEMINI_API_URL || 'http://localhost:9001';
  try {
    const payload = { prompt, ...options };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    } as RequestInit);
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Serviço Gemini retornou ${response.status}: ${errorText}`);
    }
    return await response.json();
  } catch (err) {
    // Propaga o erro para a camada chamadora. Não faz fallback aqui para
    // permitir que a rota decida o que fazer (registrar pendente, usar IA
    // interna, etc.)
    console.error('[services/gemini] Falha ao chamar serviço externo de IA:', err);
    throw err;
  }
}