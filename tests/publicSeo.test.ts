import { describe, expect, it } from "vitest";
import {
  PUBLIC_SEO_ROUTES,
  buildFullTitle,
  getPublicSeo,
  normalizePathname,
} from "../shared/publicSeo";

describe("registro global de SEO", () => {
  it("possui metadados indexáveis para a landing A1", () => {
    const seo = getPublicSeo("/certificado-digital-a1?utm_source=google");
    expect(seo?.title).toContain("Certificado Digital A1");
    expect(seo?.noindex).not.toBe(true);
    expect(seo?.sitemap).toBeDefined();
  });

  it("não duplica a marca no title", () => {
    expect(buildFullTitle("Contato | Destrava Crédito")).toBe("Contato | Destrava Crédito");
  });

  it("mantém área do colaborador fora do índice", () => {
    expect(getPublicSeo("/colaborador/dashboard")?.noindex).toBe(true);
  });

  it("normaliza barras, query string e hash", () => {
    expect(normalizePathname("/pronampe///?x=1#topo")).toBe("/pronampe");
  });

  it("não inclui rotas noindex no sitemap", () => {
    const invalid = Object.values(PUBLIC_SEO_ROUTES).filter((seo) => seo.noindex && seo.sitemap);
    expect(invalid).toHaveLength(0);
  });
});

