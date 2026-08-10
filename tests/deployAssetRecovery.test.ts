import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

describe("recuperação segura de assets entre deploys", () => {
  it("serve o HTML sem cache e identifica a release publicada", () => {
    const server = read("server/index.ts");
    const dockerfile = read("Dockerfile");
    expect(server).toContain('res.setHeader("X-Destrava-Release", DESTRAVA_RELEASE)');
    expect(server).toContain('res.setHeader("CDN-Cache-Control", "no-store")');
    expect(server).toContain('app.get("/version"');
    expect(server).toContain('"https://static.cloudflareinsights.com"');
    expect(server).toContain('"https://cloudflareinsights.com"');
    expect(dockerfile).toContain("DESTRAVA_RELEASE=fix66-destinatarios-ranking-nexus-20260810");
  });

  it("só recupera um chunk ausente depois de tentar o arquivo real", () => {
    const server = read("server/index.ts");
    const staticPosition = server.indexOf("app.use(express.static(staticPath");
    const recoveryPosition = server.indexOf('app.get(/^\\/assets\\/.*\\.js$/');
    const spaPosition = server.indexOf('app.get("*"');
    expect(staticPosition).toBeGreaterThan(-1);
    expect(recoveryPosition).toBeGreaterThan(staticPosition);
    expect(spaPosition).toBeGreaterThan(recoveryPosition);
    expect(server).toContain("FRONTEND_ASSET_RECOVERY_MODULE");
    expect(server).toContain('type("application/javascript")');
  });

  it("o próprio HTML detecta falha de JS/CSS sem apagar dados locais", () => {
    const html = read("client/index.html");
    const server = read("server/index.ts");
    expect(html).toContain("destrava_html_asset_recovery_at");
    expect(html).toContain("__destrava_reload");
    expect(server).not.toContain("localStorage.clear")
    expect(server).not.toContain("sessionStorage.clear")
  });

  it("nginx manual preserva a política de cache decidida pelo Node", () => {
    const nginx = read("nginx.conf");
    const setup = read("nginx-setup.sh");
    expect(nginx).not.toContain('add_header         Cache-Control "public, immutable"');
    expect(setup).not.toContain('add_header       Cache-Control "public, immutable"');
  });

  it("mantém package.json, workspace e lockfile compatíveis com o pnpm do Docker", () => {
    const lockfile = read("pnpm-lock.yaml");
    const workspace = read("pnpm-workspace.yaml");
    const dockerfile = read("Dockerfile");
    expect(lockfile).toContain("overrides:\n  tailwindcss>nanoid: 3.3.7");
    expect(lockfile).toContain("patchedDependencies:\n  wouter@3.7.1:");
    expect(workspace).toContain("packages:\n  - '.'");
    expect(workspace).not.toContain("set this to true or false");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
    expect(dockerfile).not.toMatch(/ARG (?:GEMINI_API_KEY|NEXUS_INTEGRATION_SECRET|DATABASE_URL)/);
  });

  it("usa o catálogo do Nexus e a pontuação oficial por item no modal", () => {
    const modal = read("client/src/pages/colaborador/CriarTarefaNexusModal.tsx");
    const server = read("server/index.ts");
    expect(modal).toContain("/api/nexus/destinatarios");
    expect(modal).toContain("Todas as equipes e pessoas");
    expect(modal).toContain("inclusive gestores e administradores");
    expect(modal).toContain("Pontuação oficial do Nexus");
    expect(modal).toContain("pontuacao:");
    expect(modal).not.toContain("E-mail do membro no Nexus");
    expect(server).toContain('app.post("/api/nexus/destinatarios", auth');
    expect(server).toContain("responsavelId:");
  });
});
