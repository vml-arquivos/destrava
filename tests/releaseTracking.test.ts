import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("rastreabilidade do commit publicado", () => {
  it("grava o SHA do checkout no builder e o copia para o runtime", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain('commit="$(cat .git/HEAD)"');
    expect(dockerfile).toContain("printf '%s\\\\n' \"$commit\" > /app/BUILD_COMMIT");
    expect(dockerfile).toContain("COPY --from=builder --chown=node:node /app/BUILD_COMMIT ./BUILD_COMMIT");
    expect(dockerfile).not.toContain("DESTRAVA_RELEASE=fix66-destinatarios-ranking-nexus-20260810");
  });

  it("resolve o artefato BUILD_COMMIT antes do fallback local", () => {
    const server = read("server/index.ts");

    expect(server).toContain('fs.readFileSync(path.join(__dirname, "..", "BUILD_COMMIT"), "utf8")');
    expect(server).toContain('return "unknown";');
    expect(server).not.toContain('process.env.DESTRAVA_RELEASE || "fix66-destinatarios-ranking-nexus-20260810"');
  });
});
