type AnyRecord = Record<string, any>;

function esc(value: unknown, fallback = 'Não informado'): string {
  const text = value === null || value === undefined || value === '' ? fallback : String(value);
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(value: unknown): string {
  if (!value) return 'Não informado';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

function list(value: unknown): any[] { return Array.isArray(value) ? value : []; }

function statusClass(value: unknown): 'ok' | 'warn' | 'bad' {
  const status = String(value || '').toLowerCase();
  return /confirm|aprov|valid|conclu|ok/.test(status) ? 'ok' : /incompat|diverg|bloque|revis/.test(status) ? 'bad' : 'warn';
}

function renderFields(fields: any[]): string {
  if (!fields.length) return '';
  return `<div class="fields">${fields.map((field) => `<div class="field"><span>${esc(field.campo || field.label)}</span><strong>${esc(field.valor)}</strong></div>`).join('')}</div>`;
}

function datasDoItem(item: AnyRecord): string {
  const datas = list(item.datas).length ? list(item.datas) : [item.data];
  return Array.from(new Set(datas.map((value) => String(value || '').trim()).filter(Boolean))).map(formatDate).join(', ') || 'Não informado';
}

function arquivosDoItem(item: AnyRecord): string {
  const arquivos = list(item.arquivos_originais).length ? list(item.arquivos_originais) : [item.arquivo_original];
  return Array.from(new Set(arquivos.map((value) => String(value || '').trim()).filter(Boolean))).join(', ') || 'Não informado';
}

function renderDocument(item: AnyRecord): string {
  const status = item.status_validacao || item.status || 'Não informado';
  const classe = statusClass(status);
  const resultado = item.resultado || item.resumo_leitura || 'Resultado não localizado.';
  return `<article class="doc ${classe}">
    <div class="doc-head"><strong>${esc(item.nome)}</strong><span class="pill ${classe}">${esc(status)}</span></div>
    <p class="objective">${esc(resultado)}</p>
    <div class="doc-meta"><span><b>Datas disponíveis</b>${esc(datasDoItem(item))}</span><span><b>Validade/situação</b>${esc(item.validade || status)}</span><span><b>Arquivo original</b>${esc(arquivosDoItem(item))}</span></div>
    ${item.pendencia ? `<p class="alert"><b>Pendência:</b> ${esc(item.pendencia)}</p>` : ''}
  </article>`;
}

function renderModule(module: AnyRecord): string {
  const items = list(module.itens);
  const documents = items.length ? items.map(renderDocument).join('') : '<p class="empty">Nenhum documento disponível neste grupo.</p>';
  const events = list(module.eventos).length
    ? `<div class="history"><h3>Histórico societário</h3><table><thead><tr><th>Data</th><th>Ato</th><th>Mudança</th><th>Situação</th></tr></thead><tbody>${list(module.eventos).map((event: AnyRecord) => `<tr><td>${esc(event.data || event.data_registro)}</td><td>${esc([event.tipo_ato, event.numero_arquivamento].filter(Boolean).join(' — '))}</td><td>${esc(event.mudanca || event.impacto)}</td><td>${esc(event.impacto || 'Registrado')}</td></tr>`).join('')}</tbody></table></div>`
    : '';
  const socios = module.id === 'documentacao_socios' && list(module.socios).length
    ? `<h3>Sócios cadastrados</h3><table><thead><tr><th>Nome</th><th>Participação/cargo</th><th>Situação</th></tr></thead><tbody>${list(module.socios).map((socio: AnyRecord) => `<tr><td>${esc(socio.nome || socio.nome_completo)}</td><td>${esc(socio.participacao || socio.cargo || socio.qualificacao)}</td><td>${esc(socio.status || 'Ativo')}</td></tr>`).join('')}</tbody></table>`
    : '';
  const pending = list(module.pendencias).length
    ? `<div class="pending"><h3>Ações necessárias</h3><ul>${list(module.pendencias).map((item: AnyRecord) => `<li><b>${esc(item.documento || item.categoria)}:</b> ${esc(item.acao || item.mensagem || item.condicao_resolucao)}</li>`).join('')}</ul></div>`
    : module.id === 'pendencias' ? '<p class="success">Nenhuma pendência ou falta documental foi identificada.</p>' : '';
  const internalNote = module.id === 'ficha_empresa' && !module.incluida
    ? '<div class="internal-note">Conteúdo interno de assessoria omitido do relatório institucional.</div>'
    : '';
  const showItems = module.id === 'pendencias' ? '' : documents;
  return `<section class="module" id="modulo-${esc(module.id)}"><div class="module-title"><span class="module-number">${esc(module.ordem)}</span><div><h2>${esc(module.titulo)}</h2><p>${esc(module.descricao)}</p></div></div>${renderFields(list(module.campos))}${socios}${showItems}${events}${pending}${internalNote}</section>`;
}

export function gerarHtmlRelatorioModular(relatorio: AnyRecord): string {
  const empresa = relatorio.empresa || {};
  const modules = list(relatorio.modulos_relatorio).filter((module) => module.incluida !== false || relatorio.modo_relatorio === 'interno').sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  const nomeEmpresa = empresa.razao_social || empresa.nome_fantasia || 'Empresa não identificada';
  const status = relatorio.status_aptidao_documental || relatorio.status_geral || 'Pendente';
  const index = modules.map((module) => `<li><a href="#modulo-${esc(module.id)}">${esc(module.ordem)}. ${esc(module.titulo)}</a></li>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Checklist e Análise Documental — ${esc(nomeEmpresa)}</title><style>
  @page{size:A4;margin:25mm 17mm 20mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);color:#64748b;font-size:7pt}}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#172033;font-size:9pt;line-height:1.4}h1{color:#123b78;font-size:20pt;margin:0 0 4px}h2{color:#123b78;font-size:12pt;margin:0}h3{color:#234c87;font-size:9.5pt;margin:10px 0 5px}p{margin:4px 0}.subtitle{color:#64748b;margin-bottom:10px}.cover,.module,.pending,.internal-note{border:1px solid #d9e2ef;border-radius:8px;padding:10px;margin:8px 0;page-break-inside:avoid}.cover{background:#f1f7ff;border-left:4px solid #1b3a8c}.cover strong{display:block;font-size:13pt;color:#123b78}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}.meta div,.field{border:1px solid #e2e8f0;border-radius:5px;padding:6px;background:#fff}.label,.meta span,.field span{display:block;color:#64748b;font-size:7pt;text-transform:uppercase}.meta strong,.field strong{display:block;margin-top:2px;overflow-wrap:anywhere}.toc{border:1px solid #d9e2ef;border-radius:8px;padding:9px;margin:9px 0 12px}.toc li{margin:3px 0}a{color:#123b78;text-decoration:none}.module-title{display:flex;gap:9px;align-items:flex-start;border-bottom:1px solid #d9e2ef;padding-bottom:7px;margin-bottom:8px}.module-number{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#123b78;color:#fff;font-weight:700}.module-title p{color:#64748b;margin:2px 0}.fields{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:7px 0}.doc{border:1px solid #d9e2ef;border-left:4px solid #f59e0b;border-radius:7px;padding:8px 9px;margin:6px 0;page-break-inside:avoid}.doc.ok{border-left-color:#10b981}.doc.bad{border-left-color:#dc2626}.doc-head{display:flex;gap:9px;justify-content:space-between;align-items:flex-start}.doc-head strong{color:#123b78}.pill{white-space:nowrap;border-radius:999px;padding:3px 7px;font-size:7pt;font-weight:700;background:#f1f5f9}.pill.ok{background:#d1fae5;color:#047857}.pill.bad{background:#fee2e2;color:#991b1b}.pill.warn{background:#fef3c7;color:#92400e}.objective{background:#f8fafc;border-left:3px solid #3b82f6;padding:6px 8px}.doc-meta{display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:5px 9px;color:#475569;font-size:7.6pt}.doc-meta span{display:block}.doc-meta b{display:block;color:#64748b;font-size:7pt;text-transform:uppercase}.alert{color:#9a3412;background:#fff7ed;border-radius:5px;padding:5px 7px}.pending{background:#fff7ed;border-color:#fed7aa}.success{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:7px;padding:8px}.internal-note{background:#f8fafc;color:#475569;border-style:dashed}.empty{color:#64748b;font-style:italic}table{width:100%;border-collapse:collapse;margin:6px 0 9px;page-break-inside:auto}th{background:#123b78;color:#fff;text-align:left;padding:5px;font-size:7pt}td{border-bottom:1px solid #e5eaf1;vertical-align:top;padding:5px;font-size:7.6pt}tr:nth-child(even) td{background:#f8fafc}ul{margin:4px 0;padding-left:17px}li{margin:3px 0}.status{display:inline-block;border-radius:999px;padding:3px 8px;font-weight:700}.status.ok{background:#d1fae5;color:#047857}.status.warn{background:#fef3c7;color:#92400e}.status.bad{background:#fee2e2;color:#991b1b}.footer{margin-top:12px;color:#64748b;font-size:7pt;border-top:1px solid #e5eaf1;padding-top:6px}
  </style></head><body><h1>Checklist e Análise Documental</h1><p class="subtitle">Relatório institucional consolidado. Cada documento funcional aparece uma única vez; o arquivo original e as datas são referências complementares.</p><div class="cover"><strong>${esc(nomeEmpresa)}</strong><div class="meta"><div><span>CNPJ</span><strong>${esc(empresa.cnpj)}</strong></div><div><span>Tipo societário</span><strong>${esc(empresa.tipo_societario || empresa.natureza_juridica)}</strong></div><div><span>Situação cadastral</span><strong>${esc(empresa.situacao_cadastral)}</strong></div><div><span>Status documental</span><strong><span class="status ${statusClass(status)}">${esc(status)}</span></strong></div></div><p>Gerado em: ${formatDate(relatorio.gerado_em)}</p></div><nav class="toc"><b>Checklist geral</b><ol>${index}</ol></nav>${modules.map(renderModule).join('')}<p class="footer">Datas ausentes aparecem como “Não informado”; nenhuma data foi estimada. O relatório representa o estado documental no momento da geração.</p></body></html>`;
}

export const RELATORIO_MODULAR_LAYOUT_VERSION = '2.0.0';
export const MODULOS_RELATORIO_EMPRESA = ['identidade_empresa', 'documentos_principais', 'consultas_empresa', 'documentacao_socios', 'consultas_socios', 'pendencias'] as const;
export const MODULOS_RELATORIO_INTERNO = [...MODULOS_RELATORIO_EMPRESA, 'ficha_empresa'] as const;

export function moduleIds(relatorio: AnyRecord): string[] {
  return list(relatorio.modulos_relatorio).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)).map((module) => String(module.id || ''));
}

export function validateModularReport(relatorio: AnyRecord): { ok: boolean; failures: string[] } {
  const ids = moduleIds(relatorio);
  const expected = relatorio.modo_relatorio === 'interno' ? MODULOS_RELATORIO_INTERNO : MODULOS_RELATORIO_EMPRESA;
  const failures: string[] = [];
  if (JSON.stringify(ids) !== JSON.stringify(expected)) failures.push('ordem ou módulos obrigatórios');
  const ficha = list(relatorio.modulos_relatorio).find((module) => module.id === 'ficha_empresa');
  if (relatorio.modo_relatorio !== 'interno' && ficha) failures.push('assessoria no institucional');
  const html = gerarHtmlRelatorioModular(relatorio);
  if (!html.includes('Checklist e Análise Documental') || !html.includes('class="toc"') || !html.includes('counter(page)')) failures.push('título, índice ou paginação');
  if (/quatro documentos|analise_inicial|Resumo de atualizações/i.test(html)) failures.push('seção antiga ou duplicada');
  const idsDosItens = modulesDocumentIds(relatorio);
  if (idsDosItens.some((id, index) => idsDosItens.indexOf(id) !== index)) failures.push('documento duplicado entre módulos');
  return { ok: failures.length === 0, failures };
}

function modulesDocumentIds(relatorio: AnyRecord): string[] {
  return list(relatorio.modulos_relatorio).flatMap((module) => list(module.itens).map((item) => String(item.arquivo_id || item.nome || ''))).filter(Boolean);
}

export default gerarHtmlRelatorioModular;
