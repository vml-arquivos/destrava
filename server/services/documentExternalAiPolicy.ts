/**
 * Política única para fallback externo da camada documental.
 *
 * O Destrava é internal-first: por padrão a leitura, extração e validação
 * documental não dependem de IA externa. Um fallback Gemini só pode ser usado
 * quando os DOIS opt-ins abaixo estiverem explicitamente habilitados no
 * backend. Isso evita que apenas possuir uma chave de API torne o serviço
 * externo uma dependência silenciosa da validação documental.
 */
export function externalAiFallbackDocumentalEnabled(): boolean {
  const fallback = String(process.env.DOCUMENT_EXTERNAL_AI_FALLBACK_ENABLED || 'false').toLowerCase() === 'true';
  const gemini = String(process.env.GEMINI_DOCUMENT_OCR_ENABLED || 'false').toLowerCase() === 'true';
  return fallback && gemini;
}
