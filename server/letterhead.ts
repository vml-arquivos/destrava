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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; background: #fff; }
    h1.doc-title { font-size: 12pt; font-weight: bold; text-align: center; text-transform: uppercase; margin-bottom: 14px; }
    h2.section-title { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 14px 0 6px 0; }
    p.clause, p { text-align: justify; line-height: 1.6; margin-bottom: 7px; font-size: 11pt; }
    table.data-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
    table.data-table th { background: #1B3A8C; color: #fff; padding: 5px 8px; text-align: left; font-weight: bold; }
    table.data-table td { border: 1px solid #ccc; padding: 4px 8px; vertical-align: top; }
    table.data-table tr:nth-child(even) td { background: #f4f7ff; }
    .highlight-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
    .highlight-box { border: 1.5px solid #1B3A8C; border-radius: 3px; padding: 8px 12px; background: #f0f4ff; }
    .highlight-box .label { font-size: 8pt; color: #1B3A8C; text-transform: uppercase; font-weight: bold; margin-bottom: 3px; }
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
