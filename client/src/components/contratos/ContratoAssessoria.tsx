import { useState, useMemo, useEffect, useRef, type CSSProperties } from 'react';
import { X, Printer, FileDown, Loader2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from '../../lib/currency';
import type { DocumentoAnexo } from './UploadDocumentos';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS EXPORTADOS — usados pelo GeradorContratos para montar as props
// ─────────────────────────────────────────────────────────────────────────────

export interface DadosContratoAssessoria {
  // IDs para manter vínculo com PostgreSQL e contratos_gerados
  empresa_id?: string;
  parceiro_id?: string;
  // Contratante
  empresa_razao_social: string;
  empresa_cnpj: string;
  empresa_endereco: string;
  empresa_representante: string;
  empresa_cpf_representante: string;
  // Parceiro comercial (opcional)
  parceiro_nome?: string;
  parceiro_cpf?: string;
  // Financeiro (configuráveis no painel lateral)
  valor_contrato: number;    // valor de referência — base de todos os cálculos
  taxa_comissao: number;     // % comissão sobre crédito liberado (ex: 10)
  taxa_desistencia: number;  // % multa Cláusula 4.3 (padrão: 5)
  custeio_mensal: number;    // R$ custeio Cláusula 5.7-V (padrão: 250)
  // Meta
  data_assinatura: string;   // YYYY-MM-DD
  cidade_assinatura: string;
  foro_eleito: string;
}

export interface Props {
  dados: DadosContratoAssessoria;
  /** Documentos anexos vindos do FormGerarContrato — repassados ao gerar o PDF */
  documentosAnexos?: DocumentoAnexo[];
  onClose: () => void;
  onGerarPdf: (dadosEditados: DadosContratoAssessoria, documentos: DocumentoAnexo[]) => Promise<void>;
  loadingPdf: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

const brl = (v: number): string =>
  isNaN(v) || !isFinite(v)
    ? 'R$\u00a00,00'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatDate = (d: string): string => {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch {
    return d;
  }
};

const toNum = (v: string): number => {
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

// Mapa de extensos para valores frequentes; fallback genérico para outros
const extensoMap: Record<number, string> = {
  70: 'setenta reais',
  100: 'cem reais',
  250: 'duzentos e cinquenta reais',
  500: 'quinhentos reais',
  1000: 'um mil reais',
  2000: 'dois mil reais',
  2500: 'dois mil e quinhentos reais',
  3000: 'três mil reais',
  4000: 'quatro mil reais',
  5000: 'cinco mil reais',
  6000: 'seis mil reais',
  7000: 'sete mil reais',
  8000: 'oito mil reais',
  9000: 'nove mil reais',
  10000: 'dez mil reais',
  15000: 'quinze mil reais',
  20000: 'vinte mil reais',
  25000: 'vinte e cinco mil reais',
  30000: 'trinta mil reais',
  40000: 'quarenta mil reais',
  50000: 'cinquenta mil reais',
  100000: 'cem mil reais',
  200000: 'duzentos mil reais',
  500000: 'quinhentos mil reais',
  1000000: 'um milhão de reais',
};

function valorPorExtenso(v: number): string {
  if (extensoMap[v]) return extensoMap[v];
  if (v >= 1000) {
    const mil = Math.floor(v / 1000);
    const resto = v % 1000;
    const milStr = mil === 1 ? 'um mil' : `${mil} mil`;
    if (resto === 0) return `${milStr} reais`;
    const restoStr = extensoMap[resto];
    if (restoStr) return `${milStr} e ${restoStr.replace(' reais', '')} reais`;
  }
  return `${brl(v)} reais`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS INLINE (preservados do original)
// ─────────────────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  page: {
    width: '210mm',
    minHeight: '297mm',
    margin: '0 auto',
    padding: '20mm 22mm',
    backgroundColor: '#fff',
    fontFamily: 'Arial, sans-serif',
    fontSize: '10pt',
    lineHeight: '1.55',
    color: '#1a1a1a',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '3px solid #1B3A8C',
    paddingBottom: '10px',
    marginBottom: '18px',
  },
  logoBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  logoText: {
    fontSize: '18pt',
    fontWeight: 'bold',
    color: '#1B3A8C',
    letterSpacing: '-0.5px',
    lineHeight: '1.1',
  },
  logoSub: {
    fontSize: '7pt',
    color: '#555',
    letterSpacing: '0.5px',
    marginTop: '2px',
  },
  headerRight: {
    textAlign: 'right',
    fontSize: '8pt',
    color: '#555',
    lineHeight: '1.4',
  },
  title: {
    textAlign: 'center',
    fontSize: '12pt',
    fontWeight: 'bold',
    color: '#1B3A8C',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 6px 0',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: '8.5pt',
    color: '#555',
    margin: '0 0 16px 0',
  },
  sectionTitle: {
    fontSize: '9pt',
    fontWeight: 'bold',
    color: '#1B3A8C',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    borderBottom: '1px solid #1B3A8C',
    paddingBottom: '3px',
    marginBottom: '8px',
    marginTop: '16px',
  },
  clauseTitle: {
    fontWeight: 'bold',
    marginTop: '10px',
    marginBottom: '4px',
    color: '#1B3A8C',
    fontSize: '9.5pt',
  },
  p: {
    margin: '0 0 6px 0',
    textAlign: 'justify' as const,
  },
  editableSpan: {
    borderBottom: '1px solid #1B3A8C',
    color: '#1B3A8C',
    minWidth: '80px',
    display: 'inline-block',
    padding: '0 2px',
    outline: 'none',
    cursor: 'text',
  },
  sigGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '40px',
    marginTop: '32px',
    maxWidth: '160mm',
    margin: '32px auto 0',
  },
  sigBox: {
    textAlign: 'center',
    minHeight: '120px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  sigLine: {
    borderTop: '1.5px solid #1e293b',
    width: '100%',
    maxWidth: '76mm',
    margin: '0 auto 8px',
  },
  sigName: {
    fontSize: '9pt',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    margin: '0 0 3px',
    color: '#111827',
  },
  sigSub: {
    fontSize: '8pt',
    color: '#475569',
    margin: '0 0 2px',
  },
  cityDate: {
    textAlign: 'right',
    margin: '28px 0 36px 0',
    fontSize: '10pt',
    fontStyle: 'italic',
    color: '#374151',
    lineHeight: '1.4',
  },
  footer: {
    marginTop: '32px',
    paddingTop: '12px',
    borderTop: '1px solid #e2e8f0',
    textAlign: 'center',
    fontSize: '7.8pt',
    color: '#64748b',
    lineHeight: '1.4',
  },
  witnessGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '40px',
    maxWidth: '160mm',
    margin: '36px auto 0',
  },
  witnessBox: {
    minHeight: '100px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    textAlign: 'center',
  },
  pageBreak: {
    paddingTop: '4px',
    borderBottom: '1px solid #bbb',
    fontFamily: 'Arial, sans-serif',
    pageBreakBefore: 'always',
  } as CSSProperties,
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function ContratoAssessoria({ dados, documentosAnexos = [], onClose, onGerarPdf, loadingPdf }: Props) {
  const [d, setD] = useState<DadosContratoAssessoria>({ ...dados });
  const [painelAberto, setPainelAberto] = useState(true);

  const set = <K extends keyof DadosContratoAssessoria>(
    key: K,
    val: DadosContratoAssessoria[K],
  ) => setD(prev => ({ ...prev, [key]: val }));

  // ── Engine financeira ────────────────────────────────────────────────────
  const valorComissao = useMemo(
    () => (isNaN(d.valor_contrato * d.taxa_comissao / 100) ? 0 : d.valor_contrato * d.taxa_comissao / 100),
    [d.valor_contrato, d.taxa_comissao],
  );

  const valorDesistencia = useMemo(
    () => (isNaN(d.valor_contrato * d.taxa_desistencia / 100) ? 0 : d.valor_contrato * d.taxa_desistencia / 100),
    [d.valor_contrato, d.taxa_desistencia],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 print:bg-white print:block">

      {/* ── BARRA SUPERIOR ────────────────────────────────────── print:hidden */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-[#1B3A8C] text-white shadow-lg flex-shrink-0 print:hidden">
        <div className="flex items-center gap-3">
          <FileDown className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm leading-tight">Contrato de Análise Documental</p>
            <p className="text-xs text-blue-200">
              Textos sublinhados são editáveis · Configure valores no painel
              {documentosAnexos.length > 0 && (
                <span className="ml-2 bg-amber-400 text-gray-900 font-semibold px-2 py-0.5 rounded-full text-[10px]">
                  {documentosAnexos.length} doc{documentosAnexos.length !== 1 ? 's' : ''} anexo{documentosAnexos.length !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
          <button
            onClick={() => onGerarPdf(d, documentosAnexos)}
            disabled={loadingPdf}
            className="flex items-center gap-2 px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-gray-900 text-sm font-bold rounded-lg disabled:opacity-50 transition-colors"
          >
            {loadingPdf ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Gerando PDF...</>
            ) : (
              <><FileDown className="w-4 h-4" />Gerar PDF Timbrado</>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── CORPO ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">

        {/* ── PAINEL LATERAL ──────────────────────────────────── print:hidden */}
        <aside
          className="flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto print:hidden"
          style={{ width: '272px' }}
        >
          <button
            type="button"
            onClick={() => setPainelAberto(p => !p)}
            className="flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide hover:bg-gray-50 border-b border-gray-200"
          >
            <span className="flex items-center gap-2"><Settings2 className="w-3.5 h-3.5" />Configurar valores</span>
            {painelAberto ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {painelAberto && (
            <div className="p-4 space-y-4 flex-1">
              {/* Valor de referência */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Valor de Referência (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatBRLCurrency(d.valor_contrato)}
                  onChange={e => set('valor_contrato', unmaskCurrencyInput(maskCurrencyInput(e.target.value)))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right font-mono"
                />
              </div>
              {/* Taxa de comissão */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Taxa de Comissão (%)</label>
                <input
                  type="number" min="1" max="100" step="0.1"
                  value={d.taxa_comissao}
                  onChange={e => set('taxa_comissao', toNum(e.target.value))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">Comissão: {brl(valorComissao)}</p>
              </div>
              {/* Taxa desistência */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Multa por Desistência (%)</label>
                <input
                  type="number" min="1" max="100" step="0.1"
                  value={d.taxa_desistencia}
                  onChange={e => set('taxa_desistencia', toNum(e.target.value))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">Multa Cl. 4.3: {brl(valorDesistencia)}</p>
              </div>
              {/* Custeio mensal */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Custeio Mensal Cl. 5.7-V (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatBRLCurrency(d.custeio_mensal)}
                  onChange={e => set('custeio_mensal', unmaskCurrencyInput(maskCurrencyInput(e.target.value)))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right font-mono"
                />
              </div>
              {/* Data de assinatura */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Data de Assinatura</label>
                <input
                  type="date"
                  value={d.data_assinatura}
                  onChange={e => set('data_assinatura', e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
              {/* Foro */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Foro Eleito</label>
                <input
                  type="text"
                  value={d.foro_eleito}
                  onChange={e => set('foro_eleito', e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>

              {/* Resumo financeiro */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-1.5 text-xs">
                <p className="font-semibold text-blue-800 mb-1">Resumo financeiro</p>
                <div className="flex justify-between"><span className="text-gray-600">Valor de referência</span><span className="font-mono font-semibold">{brl(d.valor_contrato)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Comissão ({d.taxa_comissao}%)</span><span className="font-mono">{brl(valorComissao)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Multa desistência ({d.taxa_desistencia}%)</span><span className="font-mono">{brl(valorDesistencia)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Custeio mensal</span><span className="font-mono">{brl(d.custeio_mensal)}</span></div>
              </div>

              {/* Anexos */}
              {documentosAnexos.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-1.5">
                    {documentosAnexos.length} documento{documentosAnexos.length !== 1 ? 's' : ''} será{documentosAnexos.length !== 1 ? 'ão' : ''} anexado{documentosAnexos.length !== 1 ? 's' : ''} ao PDF
                  </p>
                  <ul className="space-y-0.5">
                    {documentosAnexos.map((doc, i) => (
                      <li key={doc.id} className="text-[10px] text-amber-700 flex items-center gap-1">
                        <span className="font-semibold">#{i + 1}</span>
                        <span>{doc.descricao || doc.categoria}</span>
                        <span className="text-amber-500 ml-auto">{doc.tipo === 'pdf' ? 'PDF' : 'IMG'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── PREVIEW ───────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto p-6 print:p-0 print:overflow-visible">
          <div style={S.page}>

            {/* Cabeçalho */}
            <div style={S.header}>
              <div style={S.logoBox}>
                <span style={S.logoText}>Destrava</span>
                <span style={S.logoSub}>CRÉDITO EMPRESARIAL</span>
              </div>
              <div style={S.headerRight}>
                <div>DESTRAVA CREDITO LTDA</div>
                <div>CNPJ: 35.427.182/0001-66</div>
                <div>St. D Norte QND 25 LOTE 40 — Taguatinga, Brasília/DF</div>
              </div>
            </div>

            <p style={S.title}>Contrato de Prestação de Serviços de Assessoria Empresarial</p>
            <p style={S.subtitle}>e Consultoria de Análise Documental para Captação de Crédito</p>

            {/* Qualificação das Partes */}
            <p style={S.sectionTitle}>Qualificação das Partes</p>
            <p style={S.p}>
              <strong>CONTRATADA:</strong> DESTRAVA CREDITO LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o n.º 35.427.182/0001-66, com sede no St. D Norte QND 25 LOTE 40, Taguatinga, Brasília/DF, CEP 72120-250, neste ato representada por FERNANDO ELI OLIVEIRA MARQUES, CPF n.º 718.517.041-91, Sócio Administrador.
            </p>
            <p style={S.p}>
              <strong>CONTRATANTE:</strong>{' '}
              <span
                contentEditable
                suppressContentEditableWarning
                style={S.editableSpan}
                onBlur={e => set('empresa_razao_social', e.currentTarget.textContent || '')}
              >{d.empresa_razao_social}</span>,
              pessoa jurídica de direito privado, inscrita no CNPJ/CPF sob o n.º{' '}
              <span
                contentEditable
                suppressContentEditableWarning
                style={S.editableSpan}
                onBlur={e => set('empresa_cnpj', e.currentTarget.textContent || '')}
              >{d.empresa_cnpj}</span>,
              com sede em{' '}
              <span
                contentEditable
                suppressContentEditableWarning
                style={S.editableSpan}
                onBlur={e => set('empresa_endereco', e.currentTarget.textContent || '')}
              >{d.empresa_endereco}</span>,
              neste ato representada por{' '}
              <span
                contentEditable
                suppressContentEditableWarning
                style={S.editableSpan}
                onBlur={e => set('empresa_representante', e.currentTarget.textContent || '')}
              >{d.empresa_representante}</span>,
              CPF n.º{' '}
              <span
                contentEditable
                suppressContentEditableWarning
                style={S.editableSpan}
                onBlur={e => set('empresa_cpf_representante', e.currentTarget.textContent || '')}
              >{d.empresa_cpf_representante}</span>.
            </p>

            {/* Objeto */}
            <p style={S.sectionTitle}>Cláusula 1 — Objeto</p>
            <p style={S.p}>
              1.1. O presente contrato tem por objeto a prestação de serviços de assessoria empresarial e consultoria especializada em análise documental para captação de crédito junto a instituições financeiras, fundos de investimento, cooperativas de crédito e demais agentes do mercado financeiro, conforme as condições estabelecidas neste instrumento.
            </p>
            <p style={S.p}>
              1.2. Os serviços compreendem: levantamento e organização da documentação societária e financeira da CONTRATANTE; análise de conformidade cadastral e regularidade fiscal; estruturação do dossiê de crédito; intermediação junto a correspondentes bancários e parceiros financeiros credenciados; acompanhamento das tratativas até a efetiva liberação do crédito ou conclusão da análise.
            </p>

            {/* Remuneração */}
            <p style={S.sectionTitle}>Cláusula 2 — Remuneração e Honorários</p>
            <p style={S.p}>
              2.1. Pela prestação dos serviços descritos na Cláusula 1, a CONTRATANTE pagará à CONTRATADA honorários correspondentes a <strong>{d.taxa_comissao}% (
              {d.taxa_comissao === 10 ? 'dez' : d.taxa_comissao === 8 ? 'oito' : d.taxa_comissao === 5 ? 'cinco' : String(d.taxa_comissao)} por cento)</strong> sobre o valor total do crédito efetivamente liberado em favor da CONTRATANTE, calculados sobre o montante bruto aprovado pela instituição financeira ou agente de crédito.
            </p>
            <p style={S.p}>
              2.2. O valor de referência estimado para a operação de crédito objeto deste contrato é de <strong>{brl(d.valor_contrato)} ({valorPorExtenso(d.valor_contrato)})</strong>, sendo que os honorários finais serão calculados sobre o crédito efetivamente liberado, podendo diferir do valor estimado.
            </p>
            <p style={S.p}>
              2.3. Os honorários são devidos exclusivamente na hipótese de liberação efetiva do crédito, sendo exigíveis no prazo de até 05 (cinco) dias úteis após a disponibilização dos recursos na conta indicada pela CONTRATANTE.
            </p>
            <p style={S.p}>
              2.4. Na hipótese de operação estruturada em parcelas ou tranches, os honorários incidirão sobre cada parcela no momento de sua efetiva liberação.
            </p>

            {/* Obrigações */}
            <p style={S.sectionTitle}>Cláusula 3 — Obrigações das Partes</p>
            <p style={{ ...S.p, fontWeight: 'bold' }}>3.1. São obrigações da CONTRATADA:</p>
            <p style={S.p}>I — Empregar todos os recursos técnicos e humanos disponíveis para viabilizar a captação do crédito;</p>
            <p style={S.p}>II — Manter sigilo absoluto sobre as informações financeiras e empresariais da CONTRATANTE;</p>
            <p style={S.p}>III — Prestar informações periódicas sobre o andamento das tratativas;</p>
            <p style={S.p}>IV — Indicar as documentações necessárias e orientar sobre eventuais pendências cadastrais.</p>
            <p style={{ ...S.p, fontWeight: 'bold' }}>3.2. São obrigações da CONTRATANTE:</p>
            <p style={S.p}>I — Fornecer toda a documentação solicitada de forma fidedigna e tempestiva;</p>
            <p style={S.p}>II — Manter regularidade fiscal e societária durante a vigência do contrato;</p>
            <p style={S.p}>III — Efetuar o pagamento dos honorários nas condições pactuadas;</p>
            <p style={S.p}>IV — Comunicar imediatamente qualquer alteração em seus dados cadastrais, societários ou financeiros.</p>

            {/* Rescisão */}
            <p style={S.sectionTitle}>Cláusula 4 — Rescisão e Penalidades</p>
            <p style={S.p}>
              4.1. Este contrato poderá ser rescindido por qualquer das partes mediante notificação escrita com antecedência mínima de 15 (quinze) dias.
            </p>
            <p style={S.p}>
              4.2. A rescisão imotivada pela CONTRATANTE após o início dos trabalhos de assessoria implicará o pagamento de indenização à CONTRATADA correspondente aos custos operacionais incorridos, devidamente comprovados.
            </p>
            <p style={S.p}>
              4.3. Na hipótese de a CONTRATANTE obter crédito junto a qualquer instituição financeira com a qual a CONTRATADA tenha intermediado negociações durante a vigência deste contrato, no prazo de 12 (doze) meses após a rescisão, serão devidos à CONTRATADA honorários de <strong>{d.taxa_desistencia}% ({
              d.taxa_desistencia === 5 ? 'cinco' : d.taxa_desistencia === 3 ? 'três' : d.taxa_desistencia === 10 ? 'dez' : String(d.taxa_desistencia)} por cento)</strong> sobre o valor liberado, a título de cláusula de não-concorrência e proteção do trabalho realizado. Valor estimado: <strong>{brl(valorDesistencia)}</strong>.
            </p>

            {/* Vigência */}
            <p style={S.sectionTitle}>Cláusula 5 — Vigência e Disposições Gerais</p>
            <p style={S.p}>
              5.1. O presente contrato vigorará por prazo indeterminado a partir da data de assinatura, podendo ser renovado ou rescindido conforme os termos da Cláusula 4.
            </p>
            <p style={S.p}>
              5.2. Este instrumento é firmado em caráter de exclusividade para a operação de crédito descrita, não impedindo a CONTRATANTE de manter relações comerciais com terceiros para finalidades distintas.
            </p>
            <p style={S.p}>
              5.3. O presente contrato não estabelece vínculo empregatício entre as partes, sendo a CONTRATADA empresa autônoma de prestação de serviços especializados.
            </p>
            <p style={S.p}>
              5.4. Qualquer alteração deste instrumento somente terá validade mediante aditivo escrito, assinado por ambas as partes.
            </p>
            <p style={S.p}>
              5.5. Os casos omissos serão resolvidos de acordo com as disposições do Código Civil Brasileiro e demais legislações aplicáveis.
            </p>
            <p style={S.p}>
              5.6. A CONTRATADA não garante aprovação de crédito por qualquer instituição financeira, sendo sua obrigação de meio — não de resultado —, consistente em realizar todos os esforços técnicos possíveis para viabilizar a operação.
            </p>
            <p style={S.p}>
              5.7. Constituem parte integrante deste contrato, a título de custeio operacional, os seguintes encargos, quando aplicáveis: I — taxas de cadastro e análise de crédito cobradas por correspondentes bancários; II — custos com certidões, registros e autenticações necessários à instrução do dossiê; III — despesas com deslocamento para vistorias ou reuniões presenciais previamente acordadas; IV — honorários de despachante ou contador para regularização de pendências identificadas; V — custeio mensal de manutenção e monitoramento da operação, no valor de <strong>{brl(d.custeio_mensal)}/mês</strong>, aplicável quando o Rating da empresa for inferior ao nível "C", cobrado enquanto perdurar a condição de análise ativa.
            </p>
            <p style={S.p}>
              5.8. Fica eleito o foro da comarca de <strong>{d.foro_eleito}</strong> para dirimir quaisquer controvérsias oriundas do presente contrato, renunciando as partes a qualquer outro, por mais privilegiado que seja.
            </p>

            {/* Data e assinaturas */}
            <p style={S.cityDate}>
              {d.cidade_assinatura || 'Taguatinga/DF'}, {formatDate(d.data_assinatura)}.
            </p>

            <div style={S.sigGrid}>
              <div style={S.sigBox}>
                <div style={S.sigLine} />
                <p style={S.sigName}>DESTRAVA CREDITO LTDA</p>
                <p style={S.sigSub}>CNPJ: 35.427.182/0001-66</p>
                <p style={S.sigSub}>FERNANDO ELI OLIVEIRA MARQUES</p>
                <p style={S.sigSub}>CPF: 718.517.041-91 — Sócio Administrador</p>
              </div>
              <div style={S.sigBox}>
                <div style={S.sigLine} />
                <p style={S.sigName}>{d.empresa_razao_social || 'CONTRATANTE'}</p>
                {d.empresa_cnpj && <p style={S.sigSub}>CNPJ/CPF: {d.empresa_cnpj}</p>}
                {d.empresa_representante && <p style={S.sigSub}>{d.empresa_representante}</p>}
                {d.empresa_cpf_representante && <p style={S.sigSub}>CPF: {d.empresa_cpf_representante}</p>}
              </div>
            </div>

            {/* Testemunhas */}
            <div style={S.witnessGrid}>
              <div style={S.witnessBox}>
                <div style={S.sigLine} />
                <p style={S.sigName}>Testemunha 1</p>
                <p style={S.sigSub}>Nome: ______________________________</p>
                <p style={S.sigSub}>CPF: ______________________________</p>
              </div>
              <div style={S.witnessBox}>
                <div style={S.sigLine} />
                <p style={S.sigName}>Testemunha 2</p>
                <p style={S.sigSub}>Nome: ______________________________</p>
                <p style={S.sigSub}>CPF: ______________________________</p>
              </div>
            </div>

            <div style={S.footer}>
              <p>DESTRAVA CREDITO LTDA — CNPJ 35.427.182/0001-66</p>
              <p>St. D Norte QND 25 LOTE 40 — Taguatinga, Brasília/DF, CEP 72120-250 | fernandoelipro@gmail.com</p>
              <p style={{ marginTop: '4px', fontSize: '7pt' }}>
                Documento gerado eletronicamente pelo sistema Destrava Crédito em {new Date().toLocaleDateString('pt-BR')}.
                {documentosAnexos.length > 0 && ` Este contrato possui ${documentosAnexos.length} documento(s) anexo(s).`}
              </p>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
