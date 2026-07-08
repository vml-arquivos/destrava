import { PDFDocument } from "pdf-lib";
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
