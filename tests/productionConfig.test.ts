import { describe, expect, it } from "vitest";
import { validateProductionConfig } from "../server/productionConfig";

describe("validateProductionConfig", () => {
  it("falha com mensagem clara quando faltam variáveis obrigatórias em produção", () => {
    expect(() => validateProductionConfig({ NODE_ENV: "production" })).toThrow(
      "Variáveis obrigatórias ausentes: DATABASE_URL, JWT_SECRET"
    );
  });

  it("aceita produção quando DATABASE_URL e JWT_SECRET estão configuradas", () => {
    expect(() => validateProductionConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://configured",
      JWT_SECRET: "configured-secret",
    })).not.toThrow();
  });

  it("não bloqueia ambientes não produtivos", () => {
    expect(() => validateProductionConfig({ NODE_ENV: "test" })).not.toThrow();
    expect(() => validateProductionConfig({})).not.toThrow();
  });
});
