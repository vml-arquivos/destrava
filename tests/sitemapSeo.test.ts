import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "../shared/publicSeo";

const projectRoot = resolve(import.meta.dirname, "..");

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("consistência de domínio em sitemap e robots", () => {
  it("usa o domínio canônico em todas as URLs do sitemap estático", () => {
    const sitemap = readProjectFile("public/sitemap.xml");
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      ([, location]) => location,
    );

    expect(locations.length).toBeGreaterThan(0);
    expect(locations.every((location) => location.startsWith(`${SITE_URL}/`))).toBe(true);
    expect(sitemap).not.toContain("https://destrava.com");
  });

  it("publica no robots.txt apenas sitemaps do domínio canônico", () => {
    const robots = readProjectFile("public/robots.txt");
    const sitemapUrls = robots
      .split("\n")
      .filter((line) => line.startsWith("Sitemap:"))
      .map((line) => line.replace("Sitemap:", "").trim());

    expect(sitemapUrls).toEqual([
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/api/sitemap/blog`,
    ]);
  });

  it("usa o mesmo domínio no gerador de sitemap dinâmico", () => {
    const routeSource = readProjectFile("server/routes/sitemapRoutes.ts");

    expect(routeSource).toContain(`const baseUrl = "${SITE_URL}"`);
    expect(routeSource).not.toContain("https://destrava.com");
  });
});
