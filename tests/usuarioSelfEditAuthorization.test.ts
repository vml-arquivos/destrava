import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/index.ts"), "utf8");
const inicioFoto = source.indexOf("app.post('/api/colaboradores/:id/foto'");
const fimFoto = source.indexOf("app.get('/api/colaboradores/:id/foto'");
const blocoFoto = source.slice(inicioFoto, fimFoto);
const inicioPatch = source.indexOf('app.patch("/api/colaboradores/:id"');
const fimPatch = source.indexOf('// ─── n8n WEBHOOK CONFIG API', inicioPatch);
const blocoPatch = source.slice(inicioPatch, fimPatch);


describe("autoedição segura de colaborador", () => {
  it("permite autoedição sem remover a hierarquia para terceiros", () => {
    expect(inicioPatch).toBeGreaterThan(-1);
    expect(fimPatch).toBeGreaterThan(inicioPatch);
    expect(blocoPatch).toContain("const mesmoColaborador = String(solicitante?.id) === String(req.params.id)");
    expect(blocoPatch).toContain("if (!mesmoColaborador && !podeGerenciarCargo(cargoSolicitante, cargoAlvo))");
    expect(blocoPatch).toContain("if (!mesmoColaborador) {");
  });

  it("mantém a própria foto permitida e exige hierarquia apenas para foto de terceiros", () => {
    expect(inicioFoto).toBeGreaterThan(-1);
    expect(fimFoto).toBeGreaterThan(inicioFoto);
    expect(blocoFoto).toContain("String(solicitante?.id) !== String(alvo.id) && !podeGerenciarCargo");
  });
});
