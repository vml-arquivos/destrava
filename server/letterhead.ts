// ============================================================
// PAPEL TIMBRADO DESTRAVA CRÉDITO — HTML/CSS puro (v2)
// Substitui imagens base64 problemáticas por CSS/SVG limpo
// ============================================================

/** Dados fixos da CONTRATADA */
export const CONTRATADA_DADOS = {
  razao_social: 'DESTRAVA CREDITO LTDA',
  cnpj: '35.427.182/0001-66',
  endereco_sede: 'QD QND 25, LOTE 40, Taguatinga Norte – Brasília - DF, Cep: 72.120-250',
  representante: 'FERNANDO ELI OLIVEIRA MARQUES',
  cargo_representante: 'sócio administrador',
  cpf_representante: '718.517.041-91',
};

/** SVG do logotipo Destrava Crédito */
function getLogoSvg(): string {
  return `<svg width="210" height="68" viewBox="0 0 210 68" xmlns="http://www.w3.org/2000/svg">
  <circle cx="34" cy="34" r="32" fill="#1B3A8C"/>
  <circle cx="34" cy="34" r="22" fill="none" stroke="#F5C518" stroke-width="2.5"/>
  <circle cx="34" cy="34" r="10" fill="#F5C518"/>
  <line x1="34" y1="2" x2="34" y2="66" stroke="#F5C518" stroke-width="1" opacity="0.45"/>
  <line x1="2" y1="34" x2="66" y2="34" stroke="#F5C518" stroke-width="1" opacity="0.45"/>
  <text x="27" y="43" font-family="Arial,sans-serif" font-size="20" font-weight="900" fill="rgba(255,255,255,0.92)">D</text>
  <text x="78" y="43" font-family="Arial,sans-serif" font-size="30" font-weight="900"><tspan fill="#1B3A8C">D</tspan><tspan fill="#1B3A8C">e</tspan><tspan fill="#1B3A8C">s</tspan><tspan fill="#1B3A8C">t</tspan><tspan fill="#1B3A8C">r</tspan><tspan fill="#F5C518">a</tspan><tspan fill="#1B3A8C">v</tspan><tspan fill="#F5C518">a</tspan></text>
  <text x="78" y="59" font-family="Arial,sans-serif" font-size="11.5" fill="#4A7CBF" letter-spacing="4">CRÉDITO</text>
</svg>`;
}

/**
 * Template de CABEÇALHO para Puppeteer (displayHeaderFooter: true).
 */
export function getPuppeteerHeaderTemplate(): string {
  return `<div style="-webkit-print-color-adjust:exact;width:100%;height:30mm;display:flex;align-items:center;justify-content:center;background:#ffffff;border-bottom:3px solid #1B3A8C;margin:0;padding:0;box-sizing:border-box;">${getLogoSvg()}</div>`;
}

/**
 * Template de RODAPÉ para Puppeteer (displayHeaderFooter: true).
 */
export function getPuppeteerFooterTemplate(): string {
  return `<div style="-webkit-print-color-adjust:exact;width:100%;height:22mm;display:flex;align-items:center;background:#ffffff;border-top:1px solid #d0d0d0;margin:0;padding:0;box-sizing:border-box;overflow:hidden;">
  <div style="flex:1;padding:0 18mm;font-family:Arial,sans-serif;font-size:6.5pt;color:#444;line-height:1.55;">
    exclusivamente sua.<br>
    <strong style="font-size:6.5pt;">BRASÍLIA - SEDE</strong><br>
    <span style="font-size:6.5pt;">St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250</span><br>
    <strong style="font-size:6.5pt;">GOIÂNIA - FILIAL</strong><br>
    <span style="font-size:6.5pt;">Avenida Afonso Pena, qd- 25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-Go</span>
  </div>
  <div style="flex-shrink:0;width:76px;height:22mm;position:relative;overflow:hidden;">
    <div style="position:absolute;right:0;top:0;width:56px;height:22mm;background:#1B3A8C;transform:skewX(-8deg);transform-origin:right center;"></div>
    <div style="position:absolute;right:0;top:0;width:30px;height:22mm;background:#F5C518;transform:skewX(-8deg);transform-origin:right center;"></div>
  </div>
</div>`;
}

/** CSS compartilhado para o corpo dos documentos */
export function getDocumentStyles(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #000; background: #fff; }
    h1.doc-title { font-size: 12pt; font-weight: bold; text-align: center; text-transform: uppercase; margin-bottom: 14px; }
    h2.section-title { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 14px 0 6px 0; }
    p.clause, p { text-align: justify; line-height: 1.5; margin-bottom: 7px; font-size: 11pt; }
    table.data-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
    table.data-table th { background: #1B3A8C; color: #fff; padding: 5px 8px; text-align: left; font-weight: bold; }
    table.data-table td { border: 1px solid #ccc; padding: 4px 8px; vertical-align: top; }
    table.data-table tr:nth-child(even) td { background: #f4f7ff; }
    .highlight-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
    .highlight-box { border: 1.5px solid #1B3A8C; border-radius: 3px; padding: 8px 12px; background: #f0f4ff; }
    .highlight-box .label { font-size: 8pt; color: #1B3A8C; text-transform: uppercase; font-weight: bold; margin-bottom: 3px; font-family: Arial, sans-serif; }
    .highlight-box .value { font-size: 16pt; font-weight: bold; color: #1B3A8C; }
    .highlight-box .unit { font-size: 9pt; color: #555; }
    .sig-block { margin-top: 22px; }
    .sig-line { border-top: 1px solid #000; width: 78%; margin: 32px 0 5px 0; }
    .sig-name { font-size: 10pt; font-weight: bold; }
    .sig-sub { font-size: 9.5pt; }
    .nota { font-style: italic; font-size: 9pt; text-align: justify; margin: 12px 0; }
    .city-date { text-align: right; margin: 18px 0 8px 0; }
    .page-break { page-break-after: always; }
  `;
}

/**
 * Gera HTML completo (fallback / documentos simples sem multi-página).
 * Para PDFs multi-página use getPuppeteerHeaderTemplate() + getPuppeteerFooterTemplate()
 * diretamente no page.pdf() com displayHeaderFooter: true.
 */
export function gerarHtmlTimbrado(body: string, titulo?: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Destrava Crédito${titulo ? ' — ' + titulo : ''}</title>
  <style>${getDocumentStyles()}</style>
</head>
<body>${body}</body>
</html>`;
}
