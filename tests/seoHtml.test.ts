import { describe, expect, it } from "vitest";
import { injectSeoHead, renderSeoHead } from "../server/lib/seoHtml";

describe("SEO renderizado no HTML inicial", () => {
  it("injeta title, canonical e imagem social da rota", () => {
    const html = "<head><!-- SEO:START --><title>antigo</title><!-- SEO:END --></head>";
    const output = injectSeoHead(html, {
      pathname: "/certificado-digital-a1",
      title: "Certificado Digital A1 Online",
      description: "Descrição da landing A1.",
    });

    expect(output).toContain("Certificado Digital A1 Online | Destrava Crédito");
    expect(output).toContain('href="https://destravacredito.com/certificado-digital-a1"');
    expect(output).toContain('content="https://destravacredito.com/og-image.png"');
    expect(output).not.toContain("<title>antigo</title>");
  });

  it("marca páginas privadas e 404 como noindex", () => {
    const head = renderSeoHead({
      pathname: "/nao-existe",
      title: "Página não encontrada",
      description: "Não encontrada.",
      noindex: true,
    });
    expect(head).toContain('content="noindex, nofollow"');
  });

  it("escapa conteúdo dinâmico antes de inserir no head", () => {
    const head = renderSeoHead({
      pathname: "/blog/teste",
      title: '<script>alert("x")</script>',
      description: '"><img src=x onerror=alert(1)>',
    });
    expect(head).not.toContain("<script>alert");
    expect(head).toContain("&lt;script&gt;");
  });
});

