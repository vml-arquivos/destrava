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
  return `<div class="fields">${fields.map((field) => `<div class="field"><span>${esc(field.campo || field.label)}</span><strong>${esc(field.valor)}</strong><small>${esc(field.status || 'não informado')} · fonte: ${esc(list(field.fontes).join(', ') || 'não localizada')}</small></div>`).join('')}</div>`;
}

function renderDocument(item: AnyRecord): string {
  const status = item.status_validacao || item.status || 'Não informado';
  const classe = statusClass(status);
  const dados = item.dados_extraidos && typeof item.dados_extraidos === 'object'
    ? Object.entries(item.dados_extraidos).filter(([key, value]) => !key.startsWith('__') && value !== null && value !== undefined && String(value) !== '').slice(0, 5).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join(' · ')
    : '';
  return `<article class="doc ${classe}"><div class="doc-head"><div><strong>${esc(item.nome)}</strong><small>Tipo: ${esc(item.tipo_documental)} · Categoria: ${esc(item.categoria)} · Subtipo: ${esc(item.subtipo)} · Etapa: ${esc(item.etapa)} · Arquivo original: ${esc(item.arquivo_original)}</small></div><span class="pill ${classe}">${esc(status)}</span></div><div class="doc-meta"><span>Leitura: <b>${esc(item.status_leitura)}</b></span><span>Data do documento: <b>${esc(formatDate(item.data_documento))}</b></span><span>Criação: <b>${esc(formatDate(item.data_criacao))}</b></span><span>Assinatura: <b>${esc(formatDate(item.data_assinatura))}</b></span><span>Registro: <b>${esc(formatDate(item.data_registro))}</b></span><span>Emissão/expedição: <b>${esc(formatDate(item.data_emissao || item.data_expedicao))}</b></span><span>Anexado: <b>${esc(formatDate(item.data_anexacao))}</b></span><span>Última leitura: <b>${esc(formatDate(item.data_leitura))}</b></span><span>Validade: <b>${esc(formatDate(item.validade))}</b></span></div><small>Protocolo/número: ${esc(item.numero_protocolo)} · Órgão emissor: ${esc(item.orgao_emissor)} · Vigência: ${esc(formatDate(item.vigencia_inicio))} a ${esc(formatDate(item.vigencia_fim))}</small>${item.resumo_leitura ? `<p class="objective">${esc(item.resumo_leitura)}</p>` : ''}${dados ? `<p><b>Dados extraídos:</b> ${esc(dados)}</p>` : ''}${list(item.inconsistencias).length ? `<p class="alert"><b>Inconsistências:</b> ${esc(list(item.inconsistencias).join('; '))}</p>` : ''}${item.pendencias ? `<p class="alert"><b>Pendência:</b> ${esc(item.pendencias)}</p>` : ''}<small>Origem: ${esc(item.origem)} · Páginas/unidades: ${esc(item.paginas)} · Confiança: ${esc(item.confianca)} · Revisão humana: ${item.revisao_humana ? 'Sim' : 'Não'} · Versão: ${esc(item.versao)}</small></article>`;
}

function renderModule(module: AnyRecord): string {
  const submodules = list(module.submodulos).map((submodule) => `<div class="submodule"><h3>${esc(submodule.titulo)}</h3>${list(submodule.itens).length ? list(submodule.itens).map(renderDocument).join('') : '<p class="empty">Nenhum documento disponível neste submódulo.</p>'}</div>`).join('');
  const items = submodules ? '' : list(module.itens).length ? list(module.itens).map(renderDocument).join('') : '<p class="empty">Nenhum documento disponível neste módulo.</p>';
  const events = list(module.eventos).length ? `<h3>Linha do tempo</h3><ul>${module.eventos.map((event: AnyRecord) => `<li><b>${esc(event.data || event.data_registro)}</b> — ${esc(event.tipo_ato || event.titulo)} — ${esc(event.mudanca || event.impacto)}</li>`).join('')}</ul>` : '';
  const confirmations = list(module.confirmacoes).length ? `<h3>Confirmações</h3><ul>${module.confirmacoes.map((item: AnyRecord) => `<li><b>${esc(item.dimensao)}:</b> ${esc(item.texto)}</li>`).join('')}</ul>` : '';
  const pending = list(module.pendencias).length ? `<div class="pending"><h3>Pendências acionáveis</h3><ul>${module.pendencias.map((item: AnyRecord) => `<li><b>${esc(item.documento || item.categoria)}:</b> ${esc(item.acao || item.mensagem || item.condicao_resolucao)}</li>`).join('')}</ul></div>` : '';
  const socios = module.id === 'socios' && list(module.socios).length ? `<h3>Sócios cadastrados</h3><table><thead><tr><th>Nome</th><th>Identificador</th><th>Participação/cargo</th><th>Status</th></tr></thead><tbody>${module.socios.map((socio: AnyRecord) => `<tr><td>${esc(socio.nome || socio.nome_completo)}</td><td>${esc(socio.cpf || socio.documento)}</td><td>${esc(socio.participacao || socio.cargo || socio.qualificacao)}</td><td>${esc(socio.status || 'ativo')}</td></tr>`).join('')}</tbody></table>` : '';
  const internalNote = module.id === 'ficha_empresa' && !module.incluida ? '<div class="internal-note">A ficha da empresa e os documentos de assessoria são internos e foram omitidos do relatório institucional. Gere o relatório interno autorizado para incluí-los.</div>' : '';
  return `<section class="module" id="modulo-${esc(module.id)}"><div class="module-title"><span class="module-number">${esc(module.ordem)}</span><div><h2>${esc(module.titulo)}</h2><p>${esc(module.descricao)}</p></div></div>${renderFields(list(module.campos))}${socios}${submodules || items}${events}${confirmations}${pending}${internalNote}</section>`;
}

export function gerarHtmlRelatorioModular(relatorio: AnyRecord): string {
  const empresa = relatorio.empresa || {};
  const modules = list(relatorio.modulos_relatorio).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  const nomeEmpresa = empresa.razao_social || empresa.nome_fantasia || 'Empresa não identificada';
  const status = relatorio.status_aptidao_documental || relatorio.status_geral || 'Pendente';
  const index = modules.map((module) => `<li><a href="#modulo-${esc(module.id)}">${esc(module.ordem)}. ${esc(module.titulo)}</a></li>`).join('');
  const pendencias = list(relatorio.pendencias_detalhadas);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório documental modular — ${esc(nomeEmpresa)}</title><style>
  @page{size:A4;margin:27mm 18mm 22mm;@bottom-center{content:"Página " counter(page) " de " counter(pages);color:#64748b;font-size:7pt}}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#172033;font-size:8.7pt;line-height:1.4}h1{color:#123b78;font-size:20pt;margin:0 0 4px}h2{color:#123b78;font-size:12pt;margin:0}h3{color:#234c87;font-size:9.5pt;margin:11px 0 5px}p{margin:4px 0}.subtitle{color:#64748b;margin-bottom:12px}.cover,.module,.summary,.internal-note,.pending{border:1px solid #d9e2ef;border-radius:8px;padding:10px;margin:9px 0;page-break-inside:avoid}.cover{background:#f1f7ff;border-left:4px solid #1b3a8c}.cover strong{display:block;font-size:13pt;color:#123b78}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:9px}.meta div,.field{border:1px solid #e2e8f0;border-radius:5px;padding:6px;background:#fff}.label,.meta span,.field span{display:block;color:#64748b;font-size:7pt;text-transform:uppercase}.meta strong,.field strong{display:block;margin-top:2px;overflow-wrap:anywhere}.toc{border:1px solid #d9e2ef;border-radius:8px;padding:10px;margin:10px 0 14px}.toc li{margin:4px 0}a{color:#123b78;text-decoration:none}.module-title{display:flex;gap:9px;align-items:flex-start;border-bottom:1px solid #d9e2ef;padding-bottom:7px;margin-bottom:8px}.module-number{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#123b78;color:#fff;font-weight:700}.module-title p{color:#64748b;margin:2px 0}.fields{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:7px 0}.field small,.doc small{display:block;color:#64748b;font-size:7pt;margin-top:3px}.doc{border:1px solid #d9e2ef;border-left:4px solid #f59e0b;border-radius:7px;padding:8px 9px;margin:6px 0;page-break-inside:avoid}.doc.ok{border-left-color:#10b981}.doc.bad{border-left-color:#dc2626}.doc-head{display:flex;gap:9px;justify-content:space-between;align-items:flex-start}.doc-head strong{color:#123b78}.pill{white-space:nowrap;border-radius:999px;padding:3px 7px;font-size:7pt;font-weight:700;background:#f1f5f9}.pill.ok{background:#d1fae5;color:#047857}.pill.bad{background:#fee2e2;color:#991b1b}.pill.warn{background:#fef3c7;color:#92400e}.doc-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 8px;margin-top:6px;color:#475569;font-size:7.5pt}.objective{background:#f8fafc;border-left:3px solid #3b82f6;padding:6px 8px}.alert{color:#9a3412;background:#fff7ed;border-radius:5px;padding:5px 7px}.submodule{margin:8px 0}.submodule h3{border-bottom:1px solid #e2e8f0;padding-bottom:3px}.internal-note{background:#f8fafc;color:#475569;border-style:dashed}.pending{background:#fff7ed;border-color:#fed7aa}.empty{color:#64748b;font-style:italic}table{width:100%;border-collapse:collapse;margin:6px 0 9px}th{background:#123b78;color:#fff;text-align:left;padding:5px;font-size:7pt}td{border-bottom:1px solid #e5eaf1;vertical-align:top;padding:5px;font-size:7.5pt}tr:nth-child(even) td{background:#f8fafc}ul{margin:4px 0;padding-left:17px}li{margin:3px 0}.status{display:inline-block;border-radius:999px;padding:3px 8px;font-weight:700}.status.ok{background:#d1fae5;color:#047857}.status.warn{background:#fef3c7;color:#92400e}.status.bad{background:#fee2e2;color:#991b1b}.footer{margin-top:14px;color:#64748b;font-size:7pt;border-top:1px solid #e5eaf1;padding-top:6px}
  </style></head><body><h1>Relatório documental modular</h1><p class="subtitle">Relatório institucional da empresa. Documentos internos de assessoria só aparecem no modo interno autorizado.</p><div class="cover"><strong>${esc(nomeEmpresa)}</strong><div class="meta"><div><span>CNPJ</span><strong>${esc(empresa.cnpj)}</strong></div><div><span>Tipo societário</span><strong>${esc(empresa.tipo_societario || empresa.natureza_juridica)}</strong></div><div><span>Situação cadastral</span><strong>${esc(empresa.situacao_cadastral)}</strong></div><div><span>Status documental</span><strong><span class="status ${statusClass(status)}">${esc(status)}</span></strong></div></div><p>Gerado em: ${formatDate(relatorio.gerado_em)} · Modo: ${esc(relatorio.modo_relatorio || 'institucional')}</p></div><nav class="toc"><b>Índice</b><ol>${index}</ol></nav>${modules.map(renderModule).join('')}<section class="summary"><h2>Resumo de atualizações, pendências e validade documental</h2><p><b>Pendências acionáveis:</b> ${esc(pendencias.length, 'Nenhuma')}</p>${pendencias.length ? `<ul>${pendencias.map((item) => `<li>${esc(item.acao || item.mensagem || item.categoria)}</li>`).join('')}</ul>` : '<p>Nenhuma pendência executiva registrada.</p>'}</section><p class="footer">A análise é separada do arquivo original. Datas ausentes aparecem como “Não informado”; nenhuma data foi estimada. O relatório é uma fotografia do estado documental no momento da geração.</p></body></html>`;
}

export const RELATORIO_MODULAR_LAYOUT_VERSION = '1.0.0';
export const MODULOS_RELATORIO_EMPRESA = ['identificacao', 'analise_inicial', 'societarios', 'consultas', 'socios', 'ficha_empresa', 'resumo'] as const;

export function moduleIds(relatorio: AnyRecord): string[] {
  return list(relatorio.modulos_relatorio).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)).map((module) => String(module.id || ''));
}

export function validateModularReport(relatorio: AnyRecord): { ok: boolean; failures: string[] } {
  const ids = moduleIds(relatorio);
  const failures: string[] = [];
  if (JSON.stringify(ids) !== JSON.stringify(MODULOS_RELATORIO_EMPRESA)) failures.push('ordem ou módulos obrigatórios');
  const ficha = list(relatorio.modulos_relatorio).find((module) => module.id === 'ficha_empresa');
  if (relatorio.modo_relatorio !== 'interno' && (ficha?.incluida !== false || list(ficha?.itens).length > 0)) failures.push('assessoria no institucional');
  const html = gerarHtmlRelatorioModular(relatorio);
  if (!html.includes('class="toc"') || !html.includes('counter(page)')) failures.push('índice ou paginação');
  return { ok: failures.length === 0, failures };
}

export default gerarHtmlRelatorioModular;
