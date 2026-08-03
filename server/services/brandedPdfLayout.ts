import fs from "fs";
import { PDFDocument, StandardFonts as StandardFontsRef, rgb as rgbRef } from "pdf-lib";
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
  /** Buffer já carregado em memória. Prefira `filePath` para anexos grandes ou
   *  quando o chamador tem muitos anexos de uma vez -- carregar tudo em memória
   *  antes de mesclar não escala bem. */
  buffer?: Buffer | null;
  /** Caminho no disco: o arquivo só é lido no momento exato em que este anexo
   *  específico está sendo processado (um de cada vez), não todos de uma vez
   *  no início. Se ambos `buffer` e `filePath` forem informados, `buffer` tem
   *  prioridade (evita releitura desnecessária). */
  filePath?: string | null;
  descricao?: string | null;
  erro?: string | null; // preenchido quando o arquivo não pôde ser lido do storage
};

function isPdfMime(mime: string | null, nome: string): boolean {
  if (mime && mime.toLowerCase().includes("pdf")) return true;
  return /\.pdf$/i.test(nome || "");
}

function isImageMime(mime: string | null, nome: string): boolean {
  if (mime && mime.toLowerCase().startsWith("image/")) return true;
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
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    // C1 controls (\u0080-\u009f) tecnicamente caem dentro da faixa Latin-1
    // (\u0020-\u00ff) mas não são glifos imprimíveis -- WinAnsi/Helvetica não
    // consegue codificá-los, e antes sobreviviam ao filtro abaixo por engano,
    // quebrando a geração inteira do PDF. Reproduzido com caractere 0x80/0x90
    // num nome de arquivo antes desta correção.
    .replace(/[\u0080-\u009f]/g, "")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\u0020-\u00ff]/g, "")
    .trim();
}

export async function appendAttachmentsToPdf(
  baseDocPdfBuffer: Buffer,
  anexos: AnexoParaMerge[],
): Promise<Buffer> {
  if (!anexos.length) return baseDocPdfBuffer;

  const merged = await PDFDocument.load(baseDocPdfBuffer);
  const naoMescladosNoCorpo: AnexoParaMerge[] = [];

  for (const anexo of anexos) {
    if (anexo.erro) {
      naoMescladosNoCorpo.push(anexo);
      continue;
    }
    // Leitura sob demanda: só lê o arquivo do disco no momento em que ESTE anexo
    // específico está sendo processado, um de cada vez -- não carrega a lista
    // inteira em memória de uma vez só no início, o que não escalaria bem com
    // muitos anexos grandes.
    let buffer: Buffer | null = anexo.buffer ?? null;
    if (!buffer && anexo.filePath) {
      try {
        buffer = await fs.promises.readFile(anexo.filePath);
      } catch (err: any) {
        naoMescladosNoCorpo.push({ ...anexo, erro: err?.message || "Falha ao ler arquivo do disco" });
        continue;
      }
    }
    if (!buffer) {
      naoMescladosNoCorpo.push(anexo);
      continue;
    }
    try {
      if (isPdfMime(anexo.mimeType, anexo.nomeOriginal)) {
        const anexoDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const paginas = await merged.copyPages(anexoDoc, anexoDoc.getPageIndices());
        paginas.forEach((p) => merged.addPage(p));
      } else if (isImageMime(anexo.mimeType, anexo.nomeOriginal)) {
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
      } else {
        naoMescladosNoCorpo.push(anexo);
      }
    } catch (err: any) {
      naoMescladosNoCorpo.push({ ...anexo, erro: err?.message || "Falha ao processar anexo" });
    }
  }

  // Página de manifesto: sempre lista TODOS os anexos (mesclados ou não), pra deixar
  // registrado no próprio PDF o que acompanha o documento -- inclusive os que não deu
  // pra embutir visualmente.
  // Página de manifesto: sempre lista TODOS os anexos (mesclados ou não), pra deixar
  // registrado no próprio PDF o que acompanha o documento -- inclusive os que não deu
  // pra embutir visualmente. Pagina de verdade quando a lista é longa: antes, ao
  // encher a primeira página o loop simplesmente parava de desenhar (`if (y < 60)
  // return`), descartando silenciosamente o resto da lista do manifesto -- os
  // itens continuavam anexados no sistema, mas sumiam do papel. Reproduzido com
  // 70 anexos antes desta correção (manifesto ficava incompleto numa página só).
  const font = await merged.embedFont(StandardFontsRef.Helvetica);
  const bold = await merged.embedFont(StandardFontsRef.HelveticaBold);
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const TOP_Y = 790;
  const BOTTOM_Y = 60;
  const LINE_H = 16;

  let manifestoPage = merged.addPage([PAGE_W, PAGE_H]);
  let y = TOP_Y;
  const desenharTituloManifesto = (continuacao: boolean) => {
    manifestoPage.drawText(
      continuacao ? "Documentos anexados a esta proposta (continuação)" : "Documentos anexados a esta proposta",
      { x: 48, y, size: 14, font: bold, color: rgbRef(0.06, 0.18, 0.38) },
    );
    y -= 28;
  };
  desenharTituloManifesto(false);

  anexos.forEach((a, idx) => {
    if (y < BOTTOM_Y) {
      manifestoPage = merged.addPage([PAGE_W, PAGE_H]);
      y = TOP_Y;
      desenharTituloManifesto(true);
    }
    const statusTxt = a.erro ? " (arquivo não pôde ser recuperado do armazenamento)" : (isPdfMime(a.mimeType, a.nomeOriginal) || isImageMime(a.mimeType, a.nomeOriginal)) ? " (incluído nas páginas acima)" : " (anexo em arquivo separado, disponível no sistema)";
    const nomeSeguro = pdfSafeText(a.nomeOriginal) || "documento anexado";
    const descricaoSegura = a.descricao ? pdfSafeText(a.descricao) : "";
    const linha = `${idx + 1}. ${nomeSeguro}${descricaoSegura ? ` — ${descricaoSegura}` : ""}${statusTxt}`;
    manifestoPage.drawText(linha.slice(0, 110), { x: 48, y, size: 9, font, color: rgbRef(0.2, 0.24, 0.3) });
    y -= LINE_H;
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
