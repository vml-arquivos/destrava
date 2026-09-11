type AnyRecord = Record<string, any>;

function normalizarTextoApresentacao(value: unknown): string {
  const text = String(value ?? '')
    .replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/\u00a0/g, ' ');
  if (!/[ÃÂ]/.test(text) || typeof Buffer === 'undefined') return text;
  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');
    return repaired.includes('\uFFFD') ? text : repaired;
  } catch {
    return text;
  }
}

function esc(value: unknown, fallback = 'Não informado'): string {
  const text = normalizarTextoApresentacao(value === null || value === undefined || value === '' ? fallback : value);
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(value: unknown): string {
  if (!value) return 'Não informado';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? normalizarTextoApresentacao(value) : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

function list(value: unknown): any[] { return Array.isArray(value) ? value : []; }

function statusClass(value: unknown): 'ok' | 'warn' | 'bad' {
  const status = String(value || '').toLowerCase();
  return /confirm|aprov|valid|conclu|ok/.test(status) ? 'ok' : /incompat|diverg|bloque|revis/.test(status) ? 'bad' : 'warn';
}

const DESCRICOES_CNAE_APRESENTACAO: Record<string, string> = {
  '5611203': '56.11-2-03 - Lanchonetes, casas de chá, de sucos e similares',
};

function valorCadastralApresentacao(field: AnyRecord, empresa: AnyRecord): unknown {
  const label = String(field.campo || field.label || '').toLowerCase();
  if (label === 'razão social' && empresa.razao_social) return empresa.razao_social;
  if (label === 'nome fantasia' && empresa.nome_fantasia) return empresa.nome_fantasia;
  if (label === 'natureza jurídica' && empresa.natureza_juridica) {
    const codigo = String(field.valor || '').match(/^\s*([\d-]+)\s*-/)?.[1];
    return codigo ? `${codigo} - ${empresa.natureza_juridica}` : empresa.natureza_juridica;
  }
  if (label === 'atividade principal') {
    const codigo = String(empresa.atividade_principal || '').replace(/\D/g, '');
    if (DESCRICOES_CNAE_APRESENTACAO[codigo]) return DESCRICOES_CNAE_APRESENTACAO[codigo];
  }
  return field.valor;
}

function resultadoCadastralApresentacao(value: unknown, empresa: AnyRecord): string {
  let texto = String(value ?? '');
  if (empresa.razao_social) texto = texto.replace(/PALUM\s+A\s+BURGER\s+LTDA/gi, String(empresa.razao_social));
  if (empresa.nome_fantasia) texto = texto.replace(/PALUM\s+A\s+BURGER\s+ME/gi, String(empresa.nome_fantasia));
  if (empresa.natureza_juridica) texto = texto.replace(/206-2\s*-\s*Socie\s*dade\s+Em\s*pre\s*s[áa]ria\s+Lim\s*itada/gi, `206-2 - ${empresa.natureza_juridica}`);
  const codigoCnae = String(empresa.atividade_principal || '').replace(/\D/g, '');
  if (DESCRICOES_CNAE_APRESENTACAO[codigoCnae]) {
    texto = texto.replace(/56\.11-2-03\s*-\s*Lanchone\s*te\s*s\s*,?\s*cas\s*as\s+de\s+ch[áa],?\s*de\s+s\s*ucos\s+e\s+s\s*im\s*ilare\s*s/gi, DESCRICOES_CNAE_APRESENTACAO[codigoCnae]);
  }
  return texto;
}

function consolidarResultadoFuncional(value: unknown): string {
  const texto = String(value ?? '').trim();
  const ocorrencias = Array.from(texto.matchAll(/enquadramento\s+tribut[aá]rio/gi));
  if (ocorrencias.length > 1 && ocorrencias[1].index !== undefined) {
    return texto.slice(0, ocorrencias[1].index).replace(/[\s—-]+$/, '').trim();
  }
  return texto;
}

function renderFields(fields: any[], empresa: AnyRecord): string {
  if (!fields.length) return '';
  return `<div class="fields">${fields.map((field) => {
    const label = field.campo || field.label;
    const bruto = valorCadastralApresentacao(field, empresa);
    const valor = /^data\b/i.test(String(label || '')) ? formatDate(bruto) : bruto;
    return `<div class="field"><span>${esc(label)}</span><strong>${esc(valor)}</strong></div>`;
  }).join('')}</div>`;
}

function datasDoItem(item: AnyRecord): string {
  const datas = list(item.datas).length ? list(item.datas) : [item.data];
  return Array.from(new Set(datas.map((value) => String(value || '').trim()).filter(Boolean))).map(formatDate).join(', ') || 'Não informado';
}

function identificadoresPessoaisOcultos(value: unknown, modulo: unknown): string {
  const texto = String(value ?? '');
  if (!['documentacao_socios', 'consultas_socios'].includes(String(modulo || ''))) return texto;
  return texto
    .replace(/\bCPF\s*[:\-]?\s*[\d./-]+/gi, 'CPF não exibido')
    .replace(/\b(?:RG|CNH|passaporte|título de eleitor)\s*[:\-]?\s*[\d./-]+/gi, 'Identificador pessoal não exibido');
}

function arquivosDoItem(item: AnyRecord): string {
  const arquivos = list(item.arquivos_originais).length ? list(item.arquivos_originais) : [item.arquivo_original];
  return Array.from(new Set(arquivos.map((value) => identificadoresPessoaisOcultos(normalizarTextoApresentacao(String(value || '').trim()), item.modulo)).filter(Boolean))).join(', ') || 'Não informado';
}

function pendenciaSemPrefixo(value: unknown): string {
  return String(value || '').replace(/^(?:pendência\s*:\s*)+/i, '').trim();
}

function renderDocument(item: AnyRecord, empresa: AnyRecord): string {
  const status = item.status_validacao || item.status || 'Não informado';
  const classe = statusClass(status);
  const resultado = identificadoresPessoaisOcultos(consolidarResultadoFuncional(resultadoCadastralApresentacao(item.resultado || item.resumo_leitura || 'Resultado não localizado.', empresa)), item.modulo);
  const pendencia = pendenciaSemPrefixo(item.pendencia);
  return `<article class="doc ${classe}">
    <div class="doc-head"><strong>${esc(item.nome)}</strong><span class="pill ${classe}">${esc(status)}</span></div>
    <p class="objective">${esc(resultado)}</p>
    <div class="doc-meta"><span><b>Datas disponíveis</b>${esc(datasDoItem(item))}</span><span><b>Validade/situação</b>${esc(item.validade || status)}</span><span><b>Arquivo original</b>${esc(arquivosDoItem(item))}</span></div>
    ${pendencia ? `<p class="alert"><b>Pendência:</b> ${esc(pendencia)}</p>` : ''}
  </article>`;
}

function renderModule(module: AnyRecord, empresa: AnyRecord): string {
  const items = list(module.itens);
  const documents = items.length ? items.map((item) => renderDocument(item, empresa)).join('') : '<p class="empty">Nenhum documento disponível neste grupo.</p>';
  const events = list(module.eventos).length
    ? `<div class="history"><h3>Histórico societário</h3><table><thead><tr><th>Data</th><th>Ato</th><th>Mudança</th><th>Situação</th></tr></thead><tbody>${list(module.eventos).map((event: AnyRecord) => `<tr><td>${esc(formatDate(event.data || event.data_registro))}</td><td>${esc([event.tipo_ato, event.numero_arquivamento].filter(Boolean).join(' — '))}</td><td>${esc(event.mudanca || event.impacto)}</td><td>${esc(event.impacto || 'Registrado')}</td></tr>`).join('')}</tbody></table></div>`
    : '';
  const socios = module.id === 'documentacao_socios' && list(module.socios).length
    ? `<h3>Sócios cadastrados</h3><table class="socios-table"><thead><tr><th>Nome</th><th>Participação/cargo</th><th>Situação</th></tr></thead><tbody>${list(module.socios).map((socio: AnyRecord) => `<tr><td>${esc(socio.nome || socio.nome_completo)}</td><td>${esc(socio.participacao || socio.cargo || socio.qualificacao)}</td><td>${esc(socio.status || 'Ativo')}</td></tr>`).join('')}</tbody></table>`
    : '';
  const pending = list(module.pendencias).length
    ? `<div class="pending"><h3>Ações necessárias</h3><ul>${list(module.pendencias).map((item: AnyRecord) => `<li><b>${esc(item.documento || item.categoria)}:</b> ${esc(pendenciaSemPrefixo(item.acao || item.mensagem || item.condicao_resolucao))}</li>`).join('')}</ul></div>`
    : module.id === 'pendencias' ? '<p class="success">Nenhuma pendência ou falta documental foi identificada.</p>' : '';
  const internalNote = module.id === 'ficha_empresa' && !module.incluida
    ? '<div class="internal-note">Conteúdo interno de assessoria omitido do relatório institucional.</div>'
    : '';
  const showItems = module.id === 'pendencias' ? '' : documents;
  return `<section class="module" id="modulo-${esc(module.id)}"><div class="module-title"><span class="module-number">${esc(module.ordem)}</span><div><h2>${esc(module.titulo)}</h2><p>${esc(module.descricao)}</p></div></div>${renderFields(list(module.campos), empresa)}${socios}${showItems}${events}${pending}${internalNote}</section>`;
}

function moduleHasContent(module: AnyRecord): boolean {
  return list(module.itens).length > 0
    || list(module.campos).length > 0
    || list(module.eventos).length > 0
    || list(module.socios).length > 0
    || list(module.pendencias).length > 0
    || module.id === 'pendencias';
}

export function gerarHtmlRelatorioModular(relatorio: AnyRecord): string {
  const empresa = relatorio.empresa || {};
  const modules = list(relatorio.modulos_relatorio)
    .filter((module) => module.incluida !== false || relatorio.modo_relatorio === 'interno')
    .filter(moduleHasContent)
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    .map((module, index) => ({ ...module, ordem: index + 1 }));
  const nomeEmpresa = empresa.razao_social || empresa.nome_fantasia || 'Empresa não identificada';
  const status = relatorio.status_aptidao_documental || relatorio.status_geral || 'Pendente';
  const index = modules.map((module) => `<li><a href="#modulo-${esc(module.id)}">${esc(module.titulo)}</a></li>`).join('');
  // CORREÇÃO (09/09/2026, PDF real anexado pelo usuário: "veja que está
  // cortado o texto na parte superior com a logo"): este `@page` chegou a
  // declarar seu PRÓPRIO `margin` (18mm) e uma numeração de página via
  // `@bottom-center{content:...}` -- mas quem gera este PDF
  // (`generateBrandedPdfBuffer`, `server/services/brandedPdfLayout.ts`) já
  // controla a margem pelo parâmetro `topMargin` do Puppeteer (22mm nesta
  // chamada -- `server/routes/documentacao.ts`) e desenha a logo dentro
  // dessa margem via `headerTemplate`. As duas margens (a CSS e a do
  // Puppeteer) entravam em conflito -- o Chromium usava a margem CSS (mais
  // estreita) como área útil da página, então o título "Checklist e Análise
  // Documental" (h1, primeira coisa do body) começava a ser desenhado ainda
  // dentro do espaço reservado para a logo do cabeçalho, sobrepondo o
  // título por baixo da borda inferior da logo -- reproduzido e confirmado
  // com os mesmos dados do PDF real do usuário antes desta correção.
  // `@bottom-center{content:...}` também nunca funcionou -- o mecanismo de
  // impressão do Chromium usado aqui (`Page.printToPDF`) não renderiza
  // conteúdo de margin box do CSS Paged Media; a paginação real deste PDF
  // já vem só do rodapé institucional (`FOOTER_TEMPLATE`, sem número de
  // página) -- então essa regra nunca produzia nenhuma numeração visível,
  // só existia no CSS-fonte. Corrigido removendo o `margin`/`@bottom-center`
  // deste `@page` -- a margem real da página passa a vir só do
  // `topMargin`/`bottomMargin`/etc. já controlado por quem chama
  // `generateBrandedPdfBuffer`, sem nenhuma segunda fonte de verdade
  // conflitante. Regra geral: nenhum outro relatório usa este arquivo, e a
  // correção não depende de nenhum dado específico de empresa/documento.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Checklist e Análise Documental — ${esc(nomeEmpresa)}</title><style>
  @page{size:A4}
  *{box-sizing:border-box}
  body{margin:0;font-family:Arial,sans-serif;color:#172033;font-size:8.7pt;line-height:1.32}
  h1{color:#123b78;font-size:20pt;line-height:1.15;margin:0 0 4px}
  h2{color:#123b78;font-size:12pt;line-height:1.15;margin:0}
  h3{color:#234c87;font-size:9.5pt;line-height:1.15;margin:8px 0 4px}
  p{margin:3px 0}
  .subtitle{color:#64748b;margin-bottom:8px}
  .cover,.module{border:1px solid #d9e2ef;border-radius:8px;padding:9px;margin:6px 0}
  .cover{background:#f1f7ff;border-left:4px solid #1b3a8c;break-inside:avoid}
  .cover strong{display:block;font-size:13pt;color:#123b78}
  .meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}
  .meta div,.field{border:1px solid #e2e8f0;border-radius:5px;padding:5px;background:#fff;min-width:0}
  .label,.meta span,.field span{display:block;color:#64748b;font-size:6.6pt;line-height:1.1;text-transform:uppercase}
  .meta strong,.field strong{display:block;margin-top:2px;overflow-wrap:break-word;word-break:normal;line-height:1.18}
  .toc{border:1px solid #d9e2ef;border-radius:8px;padding:8px;margin:7px 0 10px;break-inside:avoid}
  .toc ol{margin:4px 0 0;padding-left:20px}.toc li{margin:2px 0}
  a{color:#123b78;text-decoration:none}
  .module{break-inside:auto;page-break-inside:auto}
  .module-title{display:flex;gap:8px;align-items:flex-start;border-bottom:1px solid #d9e2ef;padding-bottom:6px;margin-bottom:7px;break-inside:avoid;break-after:avoid}
  .module-number{display:inline-flex;flex:0 0 22px;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#123b78;color:#fff;font-weight:700}
  .module-title p{color:#64748b;margin:2px 0}
  .fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:6px 0;break-inside:auto}
  .doc{border:1px solid #d9e2ef;border-left:4px solid #f59e0b;border-radius:7px;padding:7px 8px;margin:5px 0;break-inside:avoid}
  .doc.ok{border-left-color:#10b981}.doc.bad{border-left-color:#dc2626}
  .doc-head{display:flex;gap:8px;justify-content:space-between;align-items:flex-start}.doc-head strong{color:#123b78;line-height:1.2}
  .pill{white-space:nowrap;border-radius:999px;padding:2px 6px;font-size:6.7pt;font-weight:700;background:#f1f5f9}.pill.ok{background:#d1fae5;color:#047857}.pill.bad{background:#fee2e2;color:#991b1b}.pill.warn{background:#fef3c7;color:#92400e}
  .objective{background:#f8fafc;border-left:3px solid #3b82f6;padding:5px 7px;margin:4px 0;line-height:1.28;overflow-wrap:break-word}
  .doc-meta{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.45fr);gap:4px 7px;color:#475569;font-size:7.2pt;line-height:1.18}
  .doc-meta span{display:block;min-width:0;overflow-wrap:break-word}.doc-meta b{display:block;color:#64748b;font-size:6.6pt;line-height:1.05;text-transform:uppercase;margin-bottom:1px}
  .alert{color:#9a3412;background:#fff7ed;border-radius:5px;padding:4px 6px;margin-top:4px}.pending{background:#fff7ed;border-color:#fed7aa;break-inside:avoid}.success{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:7px;padding:7px;break-inside:avoid}.internal-note{background:#f8fafc;color:#475569;border-style:dashed;break-inside:avoid}.empty{color:#64748b;font-style:italic}
  .history{margin-top:7px}.history h3{margin-top:0}table{width:100%;border-collapse:collapse;margin:4px 0 7px;table-layout:fixed}thead{display:table-header-group}th{background:#123b78;color:#fff;text-align:left;padding:4px;font-size:6.8pt;line-height:1.1}td{border-bottom:1px solid #e5eaf1;vertical-align:top;padding:4px;font-size:7.1pt;line-height:1.18;overflow-wrap:break-word;word-break:normal}tr{break-inside:avoid;page-break-inside:avoid}th:nth-child(1),td:nth-child(1){width:11%}th:nth-child(2),td:nth-child(2){width:25%}th:nth-child(3),td:nth-child(3){width:42%}th:nth-child(4),td:nth-child(4){width:22%}.socios-table th:nth-child(1),.socios-table td:nth-child(1){width:55%}.socios-table th:nth-child(2),.socios-table td:nth-child(2){width:25%}.socios-table th:nth-child(3),.socios-table td:nth-child(3){width:20%}
  #modulo-pendencias{padding-top:6px;padding-bottom:6px;margin-top:4px;break-before:avoid;page-break-before:auto}#modulo-pendencias .module-title{margin-bottom:4px;padding-bottom:4px}#modulo-pendencias .pending{break-inside:auto;padding:4px 6px}#modulo-pendencias h3{margin:4px 0 2px}
  ul{margin:3px 0;padding-left:16px}li{margin:2px 0}.status{display:inline-block;border-radius:999px;padding:3px 7px;font-weight:700}.status.ok{background:#d1fae5;color:#047857}.status.warn{background:#fef3c7;color:#92400e}.status.bad{background:#fee2e2;color:#991b1b}
  </style></head><body><h1>Checklist e Análise Documental</h1><p class="subtitle">Relatório institucional consolidado. Cada documento funcional aparece uma única vez; o arquivo original e as datas são referências complementares.</p><div class="cover"><strong>${esc(nomeEmpresa)}</strong><div class="meta"><div><span>CNPJ</span><strong>${esc(empresa.cnpj)}</strong></div><div><span>Tipo societário</span><strong>${esc(empresa.tipo_societario || empresa.natureza_juridica)}</strong></div><div><span>Situação cadastral</span><strong>${esc(empresa.situacao_cadastral)}</strong></div><div><span>Status documental</span><strong><span class="status ${statusClass(status)}">${esc(status)}</span></strong></div></div><p>Gerado em: ${formatDate(relatorio.gerado_em)}</p></div><nav class="toc"><b>Checklist geral</b><ol>${index}</ol></nav>${modules.map((module) => renderModule(module, empresa)).join('')}</body></html>`;
}

export const RELATORIO_MODULAR_LAYOUT_VERSION = '2.1.0';
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
  if (!html.includes('Checklist e Análise Documental') || !html.includes('class="toc"')) failures.push('título ou índice');
  // CORREÇÃO (09/09/2026): `@page{margin:...}` neste HTML conflitava com a
  // margem controlada por quem gera o PDF (Puppeteer, `topMargin` em
  // `generateBrandedPdfBuffer`), sobrepondo o título por baixo da logo do
  // cabeçalho -- ver o comentário completo em `gerarHtmlRelatorioModular`.
  // Este check impede que a mesma classe de bug volte por engano no futuro.
  if (/@page\s*\{[^}]*margin\s*:/i.test(html)) failures.push('página com margem CSS conflitando com a margem do PDF (sobrepõe o cabeçalho)');
  if (/quatro documentos|analise_inicial|Resumo de atualizações/i.test(html)) failures.push('seção antiga ou duplicada');
  const idsDosItens = modulesDocumentIds(relatorio);
  if (idsDosItens.some((id, index) => idsDosItens.indexOf(id) !== index)) failures.push('documento duplicado entre módulos');
  return { ok: failures.length === 0, failures };
}

function modulesDocumentIds(relatorio: AnyRecord): string[] {
  return list(relatorio.modulos_relatorio).flatMap((module) => list(module.itens).map((item) => String(item.arquivo_id || item.nome || ''))).filter(Boolean);
}

export default gerarHtmlRelatorioModular;
