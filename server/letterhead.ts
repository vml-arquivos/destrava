// ============================================================
// PAPEL TIMBRADO DESTRAVA CRÉDITO — Fiel ao template oficial
// Cabeçalho: logo real + linha amarela (#f0a500)
// Rodapé: BRASÍLIA - SEDE / GOIÂNIA - FILIAL (texto simples)
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

/**
 * Template de CABEÇALHO para Puppeteer (displayHeaderFooter: true).
 * Logo real via URL pública + linha amarela embaixo — idêntico ao template oficial.
 */
export function getPuppeteerHeaderTemplate(): string {
  return `<div style="-webkit-print-color-adjust:exact;width:100%;height:28mm;display:flex;align-items:center;justify-content:flex-start;background:#ffffff;border-bottom:2px solid #f0a500;padding:0 20mm;box-sizing:border-box;margin:0;"><img src="https://destravacredito.com/logo-destrava.png" alt="Destrava Crédito" style="height:50px;display:block;" onerror="this.style.display='none'"/></div>`;
}

/**
 * Template de RODAPÉ para Puppeteer (displayHeaderFooter: true).
 * Fiel ao template original: dois blocos de texto com borda superior cinza.
 */
export function getPuppeteerFooterTemplate(): string {
  return `<div style="-webkit-print-color-adjust:exact;width:100%;height:20mm;background:#ffffff;border-top:1px solid #cccccc;padding:6px 20mm 0 20mm;box-sizing:border-box;font-family:Arial,sans-serif;font-size:7.5pt;line-height:1.4;color:#555555;"><div style="margin-bottom:4px;"><span style="font-weight:bold;color:#000000;">BRASÍLIA - SEDE</span><br/>St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250</div><div><span style="font-weight:bold;color:#000000;">GOIÂNIA - FILIAL</span><br/>Avenida Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-Go</div></div>`;
}

/** CSS compartilhado para o corpo dos documentos */
export function getDocumentStyles(): string {
  return `
    @page {
      size: A4;
      margin: 22mm 18mm 26mm 18mm;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html,
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.45;
      color: #111827;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      width: 100%;
    }

    .contract-page,
    .contract-content,
    main {
      width: 100%;
    }

    h1.doc-title,
    .contract-title {
      font-size: 13pt;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      line-height: 1.25;
      margin: 0 0 14px 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    h2.section-title,
    .contract-section-title {
      font-size: 10.2pt;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.25;
      margin: 12px 0 5px 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    p.clause,
    p {
      text-align: justify;
      line-height: 1.45;
      margin: 0 0 6px 0;
      font-size: 10pt;
      orphans: 3;
      widows: 3;
    }

    .contract-clause {
      margin-bottom: 7px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 9.2pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    table.data-table th {
      background: #1B3A8C;
      color: #fff;
      padding: 5px 8px;
      text-align: left;
      font-weight: bold;
    }

    table.data-table td {
      border: 1px solid #ccc;
      padding: 4px 8px;
      vertical-align: top;
    }

    table.data-table tr:nth-child(even) td {
      background: #f4f7ff;
    }

    .highlight-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 12px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .highlight-box {
      border: 1.5px solid #1B3A8C;
      border-radius: 3px;
      padding: 8px 12px;
      background: #f0f4ff;
    }

    .highlight-box .label {
      font-size: 8pt;
      color: #1B3A8C;
      text-transform: uppercase;
      font-weight: bold;
      margin-bottom: 3px;
    }

    .highlight-box .value {
      font-size: 15pt;
      font-weight: bold;
      color: #1B3A8C;
    }

    .highlight-box .unit {
      font-size: 9pt;
      color: #555;
    }

    .city-date,
    .signature-date {
      text-align: center;
      margin: 18px 0 24px 0;
      font-size: 10pt;
      line-height: 1.35;
    }

    .signature-section,
    .sig-block,
    .sig-wrapper,
    .keep-together {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .signature-section {
      margin-top: 28px;
      padding-top: 4px;
      text-align: center;
    }

    .signature-grid {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin: 20px auto 0;
      align-items: end;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .signature-party,
    .signature-box {
      text-align: center;
      min-height: 88px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }

    .sig-line,
    .signature-line {
      border-top: 1px solid #111827;
      width: 100%;
      max-width: 72mm;
      margin: 0 auto 6px;
      height: 1px;
    }

    .sig-name,
    .signature-name {
      font-size: 9.2pt;
      line-height: 1.25;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      overflow-wrap: anywhere;
      margin: 0 0 2px;
    }

    .sig-sub,
    .signature-role {
      font-size: 8.5pt;
      line-height: 1.25;
      color: #374151;
      margin: 0 0 2px;
    }

    .witness-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-top: 28px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .witness-box {
      min-height: 76px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      text-align: center;
    }

    .contract-footer-final {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #d1d5db;
      text-align: center;
      font-size: 8pt;
      color: #374151;
      line-height: 1.35;
    }

    .nota {
      font-style: italic;
      font-size: 9pt;
      text-align: justify;
      margin: 12px 0;
    }

    .page-break {
      page-break-after: always;
    }

    @media print {
      .no-break,
      .keep-together,
      .signature-section,
      .signature-grid,
      .witness-grid,
      .data-table {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .page-break-before {
        page-break-before: always;
        break-before: page;
      }
    }
  `;
}

/**
 * Gera HTML completo para visualização inline / fallback sem Puppeteer.
 * Layout idêntico ao template oficial: logo + linha amarela no topo,
 * conteúdo no meio, rodapé com endereços no rodapé.
 */
export function gerarHtmlTimbrado(body: string, titulo?: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Destrava Crédito${titulo ? ' — ' + titulo : ''}</title>
  <style>
    ${getDocumentStyles()}
    body { display: flex; flex-direction: column; min-height: 100vh; padding: 0; }
    .page-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 16px 2cm;
      border-bottom: 2px solid #f0a500;
      background: #ffffff;
      margin-bottom: 0;
    }
    .page-header img { height: 50px; }
    .page-content { flex-grow: 1; padding: 1.2cm 2cm; }
    .page-footer {
      width: 100%;
      padding: 10px 2cm 14px 2cm;
      border-top: 1px solid #ccc;
      font-size: 9px;
      line-height: 1.4;
      color: #555;
      background: #ffffff;
      margin-top: auto;
    }
    .page-footer .footer-col { margin-bottom: 5px; }
    .page-footer .footer-title { font-weight: bold; color: #000; }
  </style>
</head>
<body>
  <div class="page-header">
    <img src="https://destravacredito.com/logo-destrava.png" alt="Destrava Crédito" onerror="this.style.display='none'"/>
  </div>
  <div class="page-content">
    ${body}
  </div>
  <div class="page-footer">
    <div class="footer-col">
      <span class="footer-title">BRASÍLIA - SEDE</span><br/>
      St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250
    </div>
    <div class="footer-col">
      <span class="footer-title">GOIÂNIA - FILIAL</span><br/>
      Avenida Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-Go
    </div>
  </div>
</body>
</html>`;
}

/**
 * Cabeçalho embutido no fluxo normal do HTML.
 * Usado para aparecer apenas na primeira página do PDF.
 */
export function getHtmlHeaderEmbutido(): string {
  return `<header class="contract-header" style="-webkit-print-color-adjust:exact;width:100%;display:flex;align-items:center;justify-content:center;background:#ffffff;border-bottom:2px solid #1B3A8C;padding:0 0 10px;box-sizing:border-box;margin:0 0 18px 0;"><img src="https://destravacredito.com/logo-destrava.png" alt="Destrava Crédito" style="max-height:48px;max-width:170px;display:block;object-fit:contain;" onerror="this.style.display='none'"/></header>`;
}

/**
 * Rodapé embutido no fluxo normal do HTML.
 * Usado para aparecer apenas na última página do PDF.
 */
export function getHtmlFooterEmbutido(): string {
  return `<footer class="contract-footer-final"><strong>BRASÍLIA - SEDE</strong><br/>St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250<br/><strong>GOIÂNIA - FILIAL</strong><br/>Avenida Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-GO</footer>`;
}
