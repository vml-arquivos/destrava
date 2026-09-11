import { describe, expect, it } from "vitest";
import {
  isFeatureEnabledForUser,
  normalizarFeatureAccessConfig,
} from "../server/services/featureAccessService";

describe("featureAccessService", () => {
  it("mantém funções visíveis por padrão", () => {
    const cfg = normalizarFeatureAccessConfig({});
    expect(isFeatureEnabledForUser(cfg, "dashboard", "u1")).toBe(true);
  });

  it("oculta função globalmente", () => {
    const cfg = normalizarFeatureAccessConfig({ global: { dashboard: false } });
    expect(isFeatureEnabledForUser(cfg, "dashboard", "u1")).toBe(false);
  });

  it("permite exceção por usuário acima do padrão global", () => {
    const cfg = normalizarFeatureAccessConfig({
      global: { dashboard: false },
      userOverrides: { u1: { dashboard: true } },
    });
    expect(isFeatureEnabledForUser(cfg, "dashboard", "u1")).toBe(true);
    expect(isFeatureEnabledForUser(cfg, "dashboard", "u2")).toBe(false);
  });

  it("permite ocultar função só para um usuário", () => {
    const cfg = normalizarFeatureAccessConfig({
      userOverrides: { u1: { orcamentos: false } },
    });
    expect(isFeatureEnabledForUser(cfg, "orcamentos", "u1")).toBe(false);
    expect(isFeatureEnabledForUser(cfg, "orcamentos", "u2")).toBe(true);
  });
});
