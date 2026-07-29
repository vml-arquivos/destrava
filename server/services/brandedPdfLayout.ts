import { PDFDocument, StandardFonts as StandardFontsRef, rgb as rgbRef } from "pdf-lib";
import fs from "fs";
import { DESTRAVA_LOGO_B64, PERMUPAY_LOGO_B64 } from "../logo_constants";
import { closeChromium, launchChromium } from "./chromiumLauncher";

export type PdfBrand = "destrava" | "permupay" | "aragao";

export type BrandedPdfOptions = {
  brand?: PdfBrand | string | null;
};

const EMPTY_HEADER = '<style>* { margin: 0; padding: 0; }</style><div></div>';
const EMPTY_FOOTER = '<style>* { margin: 0; padding: 0; }</style><div></div>';

const FOOTER_TEMPLATE = `<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  #fw {
    width: 100%;
    padding: 8px 22mm 6px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-family: Arial, sans-serif;
    font-size: 7.5pt;
    color: #64748b;
    line-height: 1.5;
  }
</style>
<div id="fw">
  <strong>BRASÍLIA - SEDE</strong><br/>
  St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250<br/>
  <strong>GOIÂNIA - FILIAL</strong><br/>
  Avenida Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-GO
</div>`;

function normalizeBrand(value: unknown): PdfBrand {
  const brand = String(value || "destrava").trim().toLowerCase();
  if (brand === "permupay" || brand === "aragao") return brand;
  return "destrava";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function brandPresentation(value: unknown): {
  name: string;
  borderColor: string;
  logoDataUri: string;
} {
  const brand = normalizeBrand(value);
  if (brand === "permupay") {
    return {
      name: "PermuPay",
      borderColor: "#0066CC",
      logoDataUri: PERMUPAY_LOGO_B64,
    };
  }
  if (brand === "aragao") {
    // O sistema ainda não possui um arquivo oficial de logo da Aragão.
    // Mantém o nome institucional como fallback sem quebrar orçamentos existentes.
    return {
      name: "Aragão Serviços",
      borderColor: "#8B4513",
      logoDataUri: "",
    };
  }
  return {
    name: "Destrava Crédito",
    borderColor: "#1B3A8C",
    logoDataUri: DESTRAVA_LOGO_B64,
  };
}

function headerTemplate(value: unknown): string {
  const brand = brandPresentation(value);
  const content = brand.logoDataUri
    ? `<img src="${brand.logoDataUri}" alt="${escapeHtml(brand.name)}"/>`
    : `<span>${escapeHtml(brand.name)}</span>`;

  return `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    #hw {
      width: 100%;
      padding: 6px 22mm 8px;
      border-bottom: 2px solid ${brand.borderColor};
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      font-family: Arial, sans-serif;
      font-size: 11pt;
      font-weight: 700;
      color: ${brand.borderColor};
    }
    img {
      height: 40px;
      max-width: 160px;
      object-fit: contain;
      display: block;
    }
  </style><div id="hw">${content}</div>`;
}

export type AnexoParaMerge = {
  nomeOriginal: string;
  mimeType: string | null;
  /**
   * Compatibilidade com os chamadores antigos e com testes unitários. No fluxo
   * de produção, prefira filePath para que apenas um anexo seja mantido na
   * memória por vez durante a mesclagem.
   */
  buffer?: Buffer | null;
  filePath?: string | null;
  descricao?: string | null;
  erro?: string | null; // preenchido quando o arquivo não pôde ser lido do storage
};

function isPdfMime(mime: string | null, nome: string): boolean {
  if (mime && mime.toLowerCase().includes("pdf")) return true;
  return /\.pdf$/i.test(nome || "");
}

function isImageMime(mime: string | null, nome: string): boolean {
  const normalizedMime = String(mime || "").toLowerCase();
  if (normalizedMime === "image/png" || normalizedMime === "image/jpeg" || normalizedMime === "image/jpg") return true;
  return /\.(png|jpe?g)$/i.test(nome || "");
}

/**
 * Anexa os documentos enviados junto ao orçamento/contrato como páginas de verdade
 * no PDF final -- não é só um link separado que pode sumir de vista, o anexo passa a
 * ser parte física do arquivo impresso/baixado. PDF: páginas copiadas direto. Imagem
 * (jpg/png): vira uma página cheia. Outros tipos (docx, xlsx...): não dá pra "imprimir
 * junto" visualmente, então entram só na página de manifesto no final, deixando claro
 * pro leitor que existe um anexo daquele tipo e ele precisa ser aberto separadamente.
 */
/**
 * pdf-lib usa a fonte padrão Helvetica com codificação WinAnsi, que NÃO suporta
 * emoji nem boa parte do Unicode fora do Latin-1 -- só que aceita acentuação
 * comum do PT-BR (ã, ç, é...). Nomes de arquivo e descrições de anexo vêm de
 * texto digitado/gerado pelo usuário (ex: nome de foto salva pelo celular, que
 * às vezes inclui emoji) e nunca passavam por essa sanitização antes de ir pro
 * drawText() -- um caractere fora do WinAnsi quebrava a geração inteira do PDF
 * com "WinAnsi cannot encode", sem exceção tratada em nenhum lugar da cadeia.
 * Reproduzido e confirmado antes desta correção.
 */
function pdfSafeText(value: unknown): string {
  return String(value ?? "")
    // U+0080..U+009F também são controles. A faixa passava pelo filtro antigo
    // e fazia Helvetica/WinAnsi lançar "cannot encode", abortando o PDF todo.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type ResultadoAnexo = {
  anexo: AnexoParaMerge;
  status: "incluido" | "separado" | "erro";
  detalhe?: string;
};

function wrapManifestText(value: unknown, maxChars = 58): string[] {
  const words = pdfSafeText(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (let word of words) {
    while (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!word) continue;
    if (current && `${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function appendAttachmentsToPdf(
  baseDocPdfBuffer: Buffer,
  anexos: AnexoParaMerge[],
): Promise<Buffer> {
  if (!anexos.length) return baseDocPdfBuffer;

  const merged = await PDFDocument.load(baseDocPdfBuffer);
  const resultados: ResultadoAnexo[] = [];

  for (const anexo of anexos) {
    if (anexo.erro) {
      resultados.push({ anexo, status: "erro", detalhe: anexo.erro });
      continue;
    }

    const ehPdf = isPdfMime(anexo.mimeType, anexo.nomeOriginal);
    const ehImagem = isImageMime(anexo.mimeType, anexo.nomeOriginal);
    if (!ehPdf && !ehImagem) {
      resultados.push({ anexo, status: "separado" });
      continue;
    }

    let buffer: Buffer | null = anexo.buffer || null;
    try {
      // Leitura sob demanda: evita manter todos os documentos simultaneamente
      // na memória antes mesmo de o pdf-lib começar a processá-los.
      if (!buffer && anexo.filePath) {
        buffer = await fs.promises.readFile(anexo.filePath);
      }
      if (!buffer?.length) {
        resultados.push({ anexo, status: "erro", detalhe: "arquivo vazio ou indisponível" });
        continue;
      }

      if (ehPdf) {
        const anexoDoc = await PDFDocument.load(buffer, {
          ignoreEncryption: true,
          updateMetadata: false,
        });
        const indices = anexoDoc.getPageIndices();
        if (!indices.length) {
          resultados.push({ anexo, status: "erro", detalhe: "PDF sem páginas" });
          continue;
        }
        const paginas = await merged.copyPages(anexoDoc, indices);
        paginas.forEach((p) => merged.addPage(p));
        resultados.push({ anexo, status: "incluido" });
      } else if (ehImagem) {
        const isPng = /\.png$/i.test(anexo.nomeOriginal) || (anexo.mimeType || "").includes("png");
        const image = isPng ? await merged.embedPng(buffer) : await merged.embedJpg(buffer);
        const pageWidth = 595.28;
        const pageHeight = 841.89;
        const margin = 40;
        const maxW = pageWidth - margin * 2;
        const maxH = pageHeight - margin * 2;
        const scale = Math.min(maxW / image.width, maxH / image.height, 1);
        const w = image.width * scale;
        const h = image.height * scale;
        const page = merged.addPage([pageWidth, pageHeight]);
        page.drawImage(image, { x: (pageWidth - w) / 2, y: (pageHeight - h) / 2, width: w, height: h });
        resultados.push({ anexo, status: "incluido" });
      }
    } catch (err: any) {
      resultados.push({
        anexo,
        status: "erro",
        detalhe: err?.message || "falha ao processar anexo",
      });
    } finally {
      // O buffer carregado via filePath não permanece referenciado no array de
      // anexos; fica elegível para coleta antes da leitura do próximo arquivo.
      if (!anexo.buffer) buffer = null;
    }
  }

  // Manifesto paginado: lista TODOS os anexos e o resultado real de cada
  // processamento. Assim um documento inválido não derruba a proposta inteira
  // nem aparece incorretamente como se tivesse sido incorporado.
  const font = await merged.embedFont(StandardFontsRef.Helvetica);
  const bold = await merged.embedFont(StandardFontsRef.HelveticaBold);
  let manifestoPage = merged.addPage([595.28, 841.89]);
  let y = 790;
  let manifestoPagina = 1;

  const drawManifestHeader = () => {
    const titulo = manifestoPagina === 1
      ? "Documentos anexados a esta proposta"
      : "Documentos anexados - continuação";
    manifestoPage.drawText(titulo, {
      x: 48,
      y,
      size: 14,
      font: bold,
      color: rgbRef(0.06, 0.18, 0.38),
    });
    y -= 28;
  };

  const ensureManifestSpace = (lineCount: number) => {
    if (y - lineCount * 13 >= 55) return;
    manifestoPage = merged.addPage([595.28, 841.89]);
    manifestoPagina += 1;
    y = 790;
    drawManifestHeader();
  };

  drawManifestHeader();
  resultados.forEach((resultado, idx) => {
    const { anexo } = resultado;
    const nomeSeguro = pdfSafeText(anexo.nomeOriginal) || "documento anexado";
    const descricaoSegura = anexo.descricao ? pdfSafeText(anexo.descricao) : "";
    const statusTxt = resultado.status === "incluido"
      ? "incluído integralmente nas páginas anteriores"
      : resultado.status === "separado"
        ? "arquivo preservado no sistema; formato não incorporável ao PDF"
        : `não incorporado: ${pdfSafeText(resultado.detalhe || "falha ao processar")}`;
    const texto = `${idx + 1}. ${nomeSeguro}${descricaoSegura ? ` - ${descricaoSegura}` : ""} (${statusTxt})`;
    const linhas = wrapManifestText(texto);
    ensureManifestSpace(linhas.length + 1);
    linhas.forEach((linha) => {
      manifestoPage.drawText(linha, {
        x: 48,
        y,
        size: 9,
        font,
        color: resultado.status === "erro"
          ? rgbRef(0.65, 0.16, 0.16)
          : rgbRef(0.2, 0.24, 0.3),
      });
      y -= 13;
    });
    y -= 5;
  });

  return Buffer.from(await merged.save());
}


/**
 * Gera um PDF com o mesmo papel timbrado usado nos contratos:
 * - logomarca apenas na primeira página;
 * - rodapé institucional completo apenas na última página;
 * - mesmas margens A4 e mesma técnica de merge com pdf-lib.
 */
export async function generateBrandedPdfBuffer(
  html: string,
  options: BrandedPdfOptions = {},
): Promise<Buffer> {
  let browser: any;
  try {
    browser = await launchChromium();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfOptions = {
      format: "A4" as const,
      printBackground: true,
      displayHeaderFooter: true,
      margin: {
        top: "28mm",
        bottom: "28mm",
        left: "22mm",
        right: "22mm",
      },
    };

    const allPagesBuffer = await page.pdf({
      ...pdfOptions,
      headerTemplate: EMPTY_HEADER,
      footerTemplate: EMPTY_FOOTER,
    });
    const allPagesDocument = await PDFDocument.load(allPagesBuffer);
    const pageCount = allPagesDocument.getPageCount();

    if (pageCount <= 1) {
      const onePageBuffer = await page.pdf({
        ...pdfOptions,
        headerTemplate: headerTemplate(options.brand),
        footerTemplate: FOOTER_TEMPLATE,
      });
      return Buffer.from(onePageBuffer);
    }

    const firstPageBuffer = await page.pdf({
      ...pdfOptions,
      headerTemplate: headerTemplate(options.brand),
      footerTemplate: EMPTY_FOOTER,
      pageRanges: "1",
    });

    const lastPageBuffer = await page.pdf({
      ...pdfOptions,
      headerTemplate: EMPTY_HEADER,
      footerTemplate: FOOTER_TEMPLATE,
      pageRanges: String(pageCount),
    });

    let middlePagesBuffer: Uint8Array | null = null;
    if (pageCount > 2) {
      middlePagesBuffer = await page.pdf({
        ...pdfOptions,
        headerTemplate: EMPTY_HEADER,
        footerTemplate: EMPTY_FOOTER,
        pageRanges: `2-${pageCount - 1}`,
      });
    }

    const merged = await PDFDocument.create();

    const firstDocument = await PDFDocument.load(firstPageBuffer);
    const [firstPage] = await merged.copyPages(firstDocument, [0]);
    merged.addPage(firstPage);

    if (middlePagesBuffer) {
      const middleDocument = await PDFDocument.load(middlePagesBuffer);
      const middlePages = await merged.copyPages(
        middleDocument,
        middleDocument.getPageIndices(),
      );
      middlePages.forEach((middlePage) => merged.addPage(middlePage));
    }

    const lastDocument = await PDFDocument.load(lastPageBuffer);
    const [lastPage] = await merged.copyPages(lastDocument, [0]);
    merged.addPage(lastPage);

    return Buffer.from(await merged.save());
  } finally {
    await closeChromium(browser);
  }
}
