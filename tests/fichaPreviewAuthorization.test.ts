import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const serverSource = fs.readFileSync(path.resolve(process.cwd(), "server/index.ts"), "utf8");
const inicioFichaColaborador = serverSource.indexOf("app.get('/api/colaboradores/:id/ficha/preview'");
const fimFichasColaborador = serverSource.indexOf("app.get('/api/contadores/:id/ficha/preview'");
const blocoFichasColaborador = serverSource.slice(inicioFichaColaborador, fimFichasColaborador);

describe("fichas de colaborador — autorização e preview", () => {
  it("usa a permissão existente de gestão de usuários no preview e no PDF", () => {
    expect(inicioFichaColaborador).toBeGreaterThan(-1);
    expect(fimFichasColaborador).toBeGreaterThan(inicioFichaColaborador);
    expect(blocoFichasColaborador.match(/podecriarUsuarios\(solicitante\?\.cargo \|\| ''\)/g)).toHaveLength(2);
    expect(blocoFichasColaborador).not.toContain("podeGerenciarCargo(solicitante?.cargo || '', colaborador.cargo || '')");
  });

  it("mantém a separação entre visualizar a ficha e gerar o PDF", () => {
    expect(blocoFichasColaborador).toContain("/ficha/preview");
    expect(blocoFichasColaborador).toContain("/ficha/pdf");
    expect(blocoFichasColaborador).toContain("gerarHtmlFichaEquipe('colaborador'");
    expect(blocoFichasColaborador).toContain("gerarPdfFichaEquipe(html)");
  });
});
