const REQUIRED_PRODUCTION_ENV = ["DATABASE_URL", "JWT_SECRET"] as const;

export function validateProductionConfig(env: Record<string, string | undefined> = process.env): void {
  if (String(env.NODE_ENV || "").trim() !== "production") return;

  const missing = REQUIRED_PRODUCTION_ENV.filter((name) => !String(env[name] || "").trim());
  if (missing.length > 0) {
    throw new Error(
      `[BOOT] Configuração de produção inválida. Variáveis obrigatórias ausentes: ${missing.join(", ")}. ` +
      "O servidor não será iniciado até que sejam configuradas."
    );
  }
}

export { REQUIRED_PRODUCTION_ENV };
