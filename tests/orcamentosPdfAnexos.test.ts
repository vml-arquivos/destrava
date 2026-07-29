import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { appendAttachmentsToPdf, type AnexoParaMerge } from "../server/services/brandedPdfLayout";

const tempDirs: string[] = [];

async function pdfSimples(texto: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(texto, { x: 48, y: 700, font });
  return Buffer.from(await doc.save());
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("PDF de orçamento com múltiplos anexos", () => {
  it("não quebra com caracteres invisíveis fora do WinAnsi em nomes de arquivo", async () => {
    const base = await pdfSimples("Orçamento");
    const anexos: AnexoParaMerge[] = [
      {
        nomeOriginal: `documento${String.fromCharCode(0x80)}${String.fromCharCode(0x90)}.docx`,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from("arquivo externo"),
      },
    ];

    const resultado = await appendAttachmentsToPdf(base, anexos);
    const carregado = await PDFDocument.load(resultado);

    expect(carregado.getPageCount()).toBe(2);
  });

  it("incorpora PDFs válidos e preserva o orçamento quando outro PDF está corrompido", async () => {
    const base = await pdfSimples("Orçamento base");
    const valido = await pdfSimples("Anexo válido");
    const resultado = await appendAttachmentsToPdf(base, [
      {
        nomeOriginal: "válido.pdf",
        mimeType: "application/pdf",
        buffer: valido,
      },
      {
        nomeOriginal: "corrompido.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("não é um PDF"),
      },
    ]);

    const carregado = await PDFDocument.load(resultado);
    expect(carregado.getPageCount()).toBe(3);
  });

  it("lê anexos do disco sob demanda e gera manifesto paginado sem cortar a relação", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orcamento-anexos-"));
    tempDirs.push(dir);
    const anexoPdf = await pdfSimples("Documento armazenado");
    const filePath = path.join(dir, "documento.pdf");
    fs.writeFileSync(filePath, anexoPdf);

    const anexos: AnexoParaMerge[] = [
      {
        nomeOriginal: "documento-principal.pdf",
        mimeType: "application/pdf",
        filePath,
      },
      ...Array.from({ length: 70 }, (_, index) => ({
        nomeOriginal: `planilha-de-comprovação-${index + 1}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from("planilha"),
        descricao: "Documento complementar do orçamento",
      })),
    ];

    const resultado = await appendAttachmentsToPdf(await pdfSimples("Orçamento"), anexos);
    const carregado = await PDFDocument.load(resultado);

    // orçamento + PDF incorporado + pelo menos duas páginas de manifesto
    expect(carregado.getPageCount()).toBeGreaterThanOrEqual(4);
  });
});
