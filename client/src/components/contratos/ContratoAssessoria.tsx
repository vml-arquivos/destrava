import { useState, useMemo, CSSProperties } from 'react';
import { X, Printer, FileDown, Loader2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from '../../lib/currency';
import type { DocumentoAnexo } from './UploadDocumentos';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS EXPORTADOS — usados pelo GeradorContratos para montar as props
// ─────────────────────────────────────────────────────────────────────────────

export interface SignatarioContratanteAssessoria {
  nome: string;
  cpf?: string;
  cargo?: string;
  qualificacao?: string;
}

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
  empresa_nacionalidade?: string;
  socios_assinantes?: SignatarioContratanteAssessoria[];
  modo_assinatura_contratante?: 'empresa' | 'responsavel' | 'socios';
  prazo_contrato_meses: number;
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
  cidade_assinatura: string; // Deve ser a cidade/UF da CONTRATADA
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

// Mapa de extensos para percentuais e valores frequentes
const pctExtensoMap: Record<number, string> = {
  1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco',
  6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
  12: 'doze', 15: 'quinze', 20: 'vinte', 25: 'vinte e cinco',
};

function pctExtenso(v: number): string {
  return pctExtensoMap[v] || String(v);
}

function mesesExtenso(v: number): string {
  return pctExtensoMap[v] || String(v);
}

function nomeSignatario(s: SignatarioContratanteAssessoria): string {
  return (s.nome || '').trim();
}

function docSignatario(s: SignatarioContratanteAssessoria): string {
  return (s.cpf || '').trim();
}

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
// ESTILOS INLINE
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
  p: {
    margin: '0 0 6px 0',
    textAlign: 'justify' as const,
  },
  pBold: {
    margin: '0 0 6px 0',
    textAlign: 'justify' as const,
    fontWeight: 'bold',
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
  sigGrid3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '24px',
    marginTop: '32px',
    maxWidth: '180mm',
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
  const valorDesistencia = useMemo(
    () => (isNaN(d.valor_contrato * d.taxa_desistencia / 100) ? 0 : d.valor_contrato * d.taxa_desistencia / 100),
    [d.valor_contrato, d.taxa_desistencia],
  );

  const valorComissao = useMemo(
    () => (isNaN(d.valor_contrato * d.taxa_comissao / 100) ? 0 : d.valor_contrato * d.taxa_comissao / 100),
    [d.valor_contrato, d.taxa_comissao],
  );

  const temParceiro = !!(d.parceiro_nome && d.parceiro_nome.trim());
  const prazoContratoMeses = Number.isFinite(Number(d.prazo_contrato_meses)) && Number(d.prazo_contrato_meses) > 0
    ? Number(d.prazo_contrato_meses)
    : 12;
  const sociosAssinantes = Array.isArray(d.socios_assinantes) ? d.socios_assinantes.filter(s => nomeSignatario(s)) : [];
  const primeiroSocioAssinante = sociosAssinantes[0];
  const representantePrincipalContratante = {
    nome: d.empresa_representante || primeiroSocioAssinante?.nome || '',
    cpf: d.empresa_cpf_representante || primeiroSocioAssinante?.cpf,
    cargo: 'Representante legal',
  };
  const representantesContratante = d.modo_assinatura_contratante === 'socios' && sociosAssinantes.length > 0
    ? sociosAssinantes
    : [representantePrincipalContratante].filter(s => s.nome);
  const assinantesContratante = d.modo_assinatura_contratante === 'socios' && sociosAssinantes.length > 0
    ? sociosAssinantes
    : representantePrincipalContratante.nome
      ? [representantePrincipalContratante]
      : [];
  const representanteContratada = 'FERNANDO ELI OLIVEIRA MARQUES';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 print:bg-white print:block">

      {/* ── BARRA SUPERIOR ────────────────────────────────────── print:hidden */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-[#1B3A8C] text-white shadow-lg flex-shrink-0 print:hidden">
        <div className="flex items-center gap-3">
          <FileDown className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="font-bold text-sm leading-tight">Contrato de Assessoria Empresarial</p>
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
            <span className="flex items-center gap-2"><Settings2 className="w-3.5 h-3.5" />Configurar contrato</span>
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
                <p className="text-[10px] text-gray-500 mt-0.5">Comissão estimada: {brl(valorComissao)}</p>
              </div>
              {/* Taxa desistência */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Multa por Desistência — Cl. 4.3 (%)</label>
                <input
                  type="number" min="1" max="100" step="0.1"
                  value={d.taxa_desistencia}
                  onChange={e => set('taxa_desistencia', toNum(e.target.value))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">Honorário mínimo: {brl(valorDesistencia)}</p>
              </div>
              {/* Custeio mensal */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Custeio Mensal — Cl. 5.7-V (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatBRLCurrency(d.custeio_mensal)}
                  onChange={e => set('custeio_mensal', unmaskCurrencyInput(maskCurrencyInput(e.target.value)))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right font-mono"
                />
              </div>
              {/* Prazo do contrato */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prazo do Contrato (meses)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={prazoContratoMeses}
                  onChange={e => set('prazo_contrato_meses', Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">O prazo informado será aplicado nas cláusulas de vigência e remuneração.</p>
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

              {/* Assinaturas da contratante */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-800 mb-1">Assinantes da CONTRATANTE</p>
                <p>{d.modo_assinatura_contratante === 'socios' && sociosAssinantes.length > 0 ? 'Sócio(s) selecionado(s) + razão social' : d.modo_assinatura_contratante === 'responsavel' ? 'Responsável principal + razão social' : 'Representante da empresa + razão social'}</p>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {representantesContratante.map((s, i) => (
                    <li key={`${s.nome}-${i}`}>{s.nome}{s.cpf ? ` — CPF: ${s.cpf}` : ''}</li>
                  ))}
                </ul>
              </div>

              {/* Resumo financeiro */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-1.5 text-xs">
                <p className="font-semibold text-blue-800 mb-1">Resumo financeiro</p>
                <div className="flex justify-between"><span className="text-gray-600">Valor de referência</span><span className="font-mono font-semibold">{brl(d.valor_contrato)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Comissão ({d.taxa_comissao}%)</span><span className="font-mono">{brl(valorComissao)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Honorário mín. ({d.taxa_desistencia}%)</span><span className="font-mono">{brl(valorDesistencia)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Custeio mensal</span><span className="font-mono">{brl(d.custeio_mensal)}</span></div>
              </div>

              {/* Nota sobre local de assinatura */}
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Local de assinatura</p>
                <p>{d.cidade_assinatura || 'BRASÍLIA – DF'}</p>
                <p className="text-[10px] text-amber-600 mt-1">Definido pela sede da CONTRATADA.</p>
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

            {/* Título */}
            <p style={S.title}>CONTRATO DE ASSESSORIA EMPRESARIAL PARA ACESSO A LINHAS DE CRÉDITO</p>

            {/* I – IDENTIFICAÇÃO DAS PARTES */}
            <p style={S.sectionTitle}>I – IDENTIFICAÇÃO DAS PARTES</p>

            <p style={S.p}>
              <strong>CONTRATADA:</strong> denominada DESTRAVA CREDITO LTDA, com sede na QD QND 25, LOTE 40, Taguatinga Norte – Brasília - DF, Cep: 72.120-250, inscrita no CNPJ n° 35.427.182/0001-66, devidamente representada por: FERNANDO ELI OLIVEIRA MARQUES, identificado como, sócio administrador nesta data através da consulta do Quadro de Sócios e Administradores – QSA, disponibilizado pela República Federativa do Brasil – RFB, CPF n° 718.517.041-91.
            </p>

            <p style={S.p}>
              <strong>CONTRATANTE:</strong>{' '}
              <span
                contentEditable
                suppressContentEditableWarning
                style={S.editableSpan}
                onBlur={e => set('empresa_razao_social', e.currentTarget.textContent || '')}
              >{d.empresa_razao_social}</span>,
              {' '}pessoa jurídica de direito privado, inscrita no CNPJ n°{' '}
              <span
                contentEditable
                suppressContentEditableWarning
                style={S.editableSpan}
                onBlur={e => set('empresa_cnpj', e.currentTarget.textContent || '')}
              >{d.empresa_cnpj}</span>,
              {' '}com sede em{' '}
              <span
                contentEditable
                suppressContentEditableWarning
                style={S.editableSpan}
                onBlur={e => set('empresa_endereco', e.currentTarget.textContent || '')}
              >{d.empresa_endereco}</span>,
              {' '}neste ato representada por{' '}
              <strong>
                {representantesContratante.map((s, i) => (
                  <span key={`${s.nome}-${i}`}>
                    {i > 0 ? '; ' : ''}{s.nome}{s.cpf ? `, CPF n° ${s.cpf}` : ''}{s.cargo || ('qualificacao' in s ? s.qualificacao : '') ? `, ${s.cargo || ('qualificacao' in s ? s.qualificacao : '')}` : ''}
                  </span>
                ))}
              </strong>,
              {' '}conforme poderes que lhes são conferidos pelo contrato social e/ou procuração.
            </p>

            {temParceiro && (
              <p style={S.p}>
                <strong>PARCEIRO COMERCIAL:</strong>{' '}
                <span
                  contentEditable
                  suppressContentEditableWarning
                  style={S.editableSpan}
                  onBlur={e => set('parceiro_nome', e.currentTarget.textContent || '')}
                >{d.parceiro_nome}</span>,
                {' '}pessoa física, inscrita no CPF n°{' '}
                <span
                  contentEditable
                  suppressContentEditableWarning
                  style={S.editableSpan}
                  onBlur={e => set('parceiro_cpf', e.currentTarget.textContent || '')}
                >{d.parceiro_cpf}</span>,
                {' '}indicada pela CONTRATANTE como parceira comercial para fins de acompanhamento e suporte nas atividades relacionadas ao presente contrato.
              </p>
            )}

            {/* II – OBJETO */}
            <p style={S.sectionTitle}>II - DO OBJETO DO CONTRATO E VALOR DE REFERÊNCIA</p>

            <p style={S.p}>
              <strong>Cláusula 1</strong> - O presente contrato tem como objeto a prestação de serviços de análise e organização documental pela CONTRATADA, com o objetivo de orientar a CONTRATANTE quanto à adequação de sua documentação jurídica, contábil e financeira para fins de acesso e aquisição de linhas de crédito no sistema bancário nacional, governamental e ou fintech.
            </p>
            <p style={S.p}>
              <strong>1.1</strong> - A CONTRATANTE estabelece que o montante de <strong>{brl(d.valor_contrato)}</strong> será utilizado como valor de referência para a projeção de crédito e planejamento financeiro, servindo como pilar para a análise documental a ser realizada pela CONTRATADA.
            </p>
            <p style={S.p}>
              <strong>1.2</strong> - O relatório de análise documental indicará as condições atuais e ideais para que a CONTRATANTE possa acessar o valor de referência projetado. Contudo, a CONTRATADA não garante a aprovação de crédito no valor de referência nem se responsabiliza por fatores externos, restrições financeiras ou fiscais, erros cadastrais, comprometimento financeiro, incapacidade de pagamento ou políticas de crédito das instituições financeiras.
            </p>
            <p style={S.p}>
              <strong>1.3</strong> - Fica expressamente acordado que, caso não seja possível alcançar dentro do prazo de validade do contrato, o valor de referência, devido a limitações documentais, cadastrais, fiscais ou financeiras da CONTRATANTE, a CONTRATADA estará isenta de qualquer responsabilidade ou obrigação de resultado, limitando-se a prestar os serviços de análise e orientação contratados.
            </p>
            <p style={S.p}>
              <strong>1.4</strong> - A CONTRATADA realizará análise técnica da documentação enviada, emitirá pareceres, apontará inconsistências e poderá sugerir correções, ficando a decisão sobre acatar tais sugestões sob responsabilidade exclusiva da CONTRATANTE.
            </p>

            {/* III – RESPONSABILIDADES */}
            <p style={S.sectionTitle}>III - DAS RESPONSABILIDADES DAS PARTES</p>

            <p style={S.p}>
              <strong>Cláusula 2</strong> - Toda e qualquer informação, documento, dado ou acesso fornecido à CONTRATADA será de inteira responsabilidade da CONTRATANTE, inclusive quanto à sua veracidade, legalidade e atualidade. A CONTRATADA não se responsabiliza por prejuízos diretos ou indiretos decorrentes de informações incorretas, incompletas ou fraudulentas fornecidas.
            </p>
            <p style={S.p}>
              <strong>2.1</strong> - A CONTRATADA poderá emitir pareceres e recomendações sobre a documentação enviada, sem que isso constitua obrigação de resultado ou responsabilidade técnica por atos praticados pela CONTRATANTE com base nessas orientações. Caso a CONTRATANTE opte por adotar qualquer sugestão, a responsabilidade por seus efeitos será exclusivamente sua.
            </p>
            <p style={S.p}>
              <strong>2.2</strong> - A CONTRATANTE compromete-se a apresentar, atualizados, sempre que solicitado, todos os documentos e informações para a execução dos serviços.
            </p>
            {temParceiro && (
              <p style={S.p}>
                <strong>2.3</strong> - O PARCEIRO COMERCIAL poderá acompanhar o desenvolvimento dos serviços e ter acesso às informações pertinentes, mediante autorização expressa da CONTRATANTE, ficando igualmente sujeito às cláusulas de confidencialidade deste contrato.
              </p>
            )}
            <p style={S.pBold}>CLÁUSULA 2.4 – DOS CANAIS DE COMUNICAÇÃO OFICIAIS</p>
            <p style={S.p}>
              As comunicações, notificações, envio de relatórios e solicitações entre as PARTES serão realizados exclusivamente através dos canais eletrônicos fornecidos pela CONTRATANTE no ato da assinatura deste instrumento, quais sejam: <strong>e-mail institucional</strong> e/ou <strong>aplicativo de mensagens instantâneas (WhatsApp)</strong>.
            </p>
            <p style={S.p}>
              <strong>Parágrafo Único:</strong> Presumir-se-ão recebidas e lidas todas as comunicações enviadas aos endereços e números indicados, cabendo à CONTRATANTE a responsabilidade por manter tais dados atualizados e garantir a segurança e o acesso a esses meios.
            </p>

            {/* IV – VIGÊNCIA */}
            <p style={S.sectionTitle}>IV – DA VIGÊNCIA E RENOVAÇÃO</p>

            <p style={S.p}>
              <strong>Cláusula 3</strong> - Este contrato terá vigência de <strong>{prazoContratoMeses} ({mesesExtenso(prazoContratoMeses)}) meses</strong> a contar da data de sua assinatura, sendo automaticamente renovado por igual período, caso não haja manifestação contrária de qualquer das partes, comunicada com no mínimo 30 (trinta) dias de antecedência do vencimento, por meio de e-mail enviado ao endereço: fernandoelipro@gmail.com.
            </p>

            {/* V – REMUNERAÇÃO */}
            <p style={S.sectionTitle}>V - DA REMUNERAÇÃO POR COMISSÃO E HONORÁRIO MÍNIMO</p>

            <p style={S.p}>
              <strong>Cláusula 4</strong> - A CONTRATADA fará jus a comissão de <strong>{d.taxa_comissao}% ({pctExtenso(d.taxa_comissao)} por cento)</strong> sobre qualquer valor efetivamente liberado em favor da CONTRATANTE, no prazo de até {prazoContratoMeses} ({mesesExtenso(prazoContratoMeses)}) meses da entrega do relatório inicial. A CONTRATANTE compromete-se a comunicar qualquer operação de crédito aprovada e contratada dentro do período de vigência deste contrato e a fornecer cópia do contrato, comprovante de liberação e/ou extrato bancário correspondente.
            </p>
            <p style={S.p}>
              <strong>4.1</strong> - A comissão deverá ser paga pela CONTRATANTE à CONTRATADA no prazo máximo de 1 (um) dia útil após a liberação do crédito, mediante transferência bancária para conta informada pela CONTRATADA.
            </p>
            <p style={S.p}>
              <strong>4.2</strong> - A CONTRATADA declara, que não realiza, direta ou indiretamente, qualquer tipo de pagamento, vantagem indevida, comissão oculta ou propina, seja a servidores públicos, agentes privados ou terceiros, sendo vedada qualquer prática que contrarie a legislação anticorrupção vigente (Lei nº 12.846/2013 e demais normas aplicáveis).
            </p>
            <p style={S.p}>
              <strong>4.3</strong> - Fica estabelecido que, caso a CONTRATANTE não contrate operações de crédito em valor igual ou superior a <strong>{brl(d.valor_contrato)}</strong> no período de vigência do contrato ({prazoContratoMeses} meses), por motivos a ela atribuíveis, será devido à CONTRATADA, a título de honorário mínimo garantido, o valor correspondente a <strong>{d.taxa_desistencia}% ({pctExtenso(d.taxa_desistencia)} por cento)</strong> sobre o valor de referência pretendido inicialmente (Cláusula 1.1), totalizando <strong>{brl(valorDesistencia)} ({valorPorExtenso(valorDesistencia)})</strong>.
            </p>
            <p style={S.pBold}>
              PARÁGRAFO ÚNICO - CAUSAS DE IMPEDIMENTO A CRÉDITO POR PARTE DA CONTRATANTE
            </p>
            <p style={S.p}>
              As causas de impedimento a crédito por parte da CONTRATANTE são: 1 – Apontamento, direto ou indireto (replicação) de restrição financeira, fiscal ou de simples protesto, inclusive em grupo econômico e cônjuge. 2 – Rating Bacen diferente de C, B ou A. 3 – Movimentação bancária inferior à declarada no faturamento bruto e quando exigido na declaração de imposto de renda. 4 – Anotação de apontamento de fraude documental ou ideológica no Banco Central. 5 – Mudança de endereço da sede empresarial sem comunicação prévia. 6 – Falta de comprovação de endereço da sede ou endereço divergente ao registrado nos órgãos competentes.
            </p>
            <p style={S.p}>
              <strong>4.4</strong> - O valor do honorário mínimo poderá ser cobrado integralmente ao final do contrato, ou em parcelas mensais, conforme acordo entre as partes.
            </p>
            <p style={S.p}>
              <strong>4.5</strong> - Caso a CONTRATANTE venha a contratar operações de crédito que, somadas, ultrapassem o valor de <strong>{brl(d.valor_contrato)}</strong> durante a vigência do contrato, {prazoContratoMeses} ({mesesExtenso(prazoContratoMeses)}) meses, a CONTRATADA renunciará ao recebimento do honorário mínimo, mantendo-se exclusivamente o direito à comissão de {d.taxa_comissao}% sobre o valor contratado.
            </p>

            {/* VI – FLUXO OPERACIONAL */}
            <p style={S.sectionTitle}>VI – DO FLUXO OPERACIONAL E PROCEDIMENTOS TÉCNICOS</p>

            <p style={S.p}>
              <strong>Cláusula 5</strong> - A execução dos serviços de assessoria para obtenção de crédito obedecerá ao rigoroso fluxo operacional descrito nos itens abaixo:
            </p>
            <p style={S.p}>
              <strong>5.1. Diagnóstico Inicial de Risco (Rating Bacen):</strong> No ato da assinatura deste contrato, a CONTRATADA realizará a consulta de classificação de risco da CONTRATANTE junto ao Sistema de Informações de Crédito (SCR) do Banco Central do Brasil.
            </p>
            <p style={S.p}>
              <strong>5.2. Formalização:</strong> O início efetivo dos trabalhos técnicos está condicionado à assinatura do presente Instrumento Particular de Prestação de Serviços por ambas as partes.
            </p>
            <p style={S.p}>
              <strong>5.3. Instrução Processual:</strong> Após a formalização, a CONTRATADA enviará à CONTRATANTE uma lista de verificação (<em>checklist</em>) contendo os documentos e acessos necessários para a análise técnica. O prazo para entrega integral dessa documentação é de inteira responsabilidade da CONTRATANTE.
            </p>
            <p style={S.p}>
              <strong>5.4. Análise Técnica e Relatórios:</strong> Recebida a documentação integral, a CONTRATADA terá o prazo de até <strong>72 (setenta e duas) horas</strong> para realizar a análise documental e emitir o relatório técnico de viabilidade, que será encaminhado pelos canais oficiais estabelecidos na Cláusula 2.4.
            </p>
            <p style={S.p}>
              <strong>5.5. Deferimento Interno e Abertura de Conta:</strong> Mediante parecer favorável da Diretoria Técnica da DESTRAVA CRÉDITO, os documentos serão processados e encaminhados para os trâmites de abertura de conta corrente de pessoa jurídica junto às instituições parceiras.
            </p>
            <p style={S.p}>
              <strong>5.6. Validação de Rating Bancário e Faturamento:</strong>
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;I. Concluída a abertura da conta, será procedida a avaliação do <em>Rating</em> Bancário interno, cujo nível de elegibilidade para prosseguimento deve ser, obrigatoriamente, <strong>"A"</strong> ou <strong>"B"</strong>.
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;II. Atendido o critério de <em>Rating</em>, iniciar-se-á o ciclo de validação de faturamento pelo período de 30 (trinta) dias, encerrando-se sempre no último dia útil de cada mês.
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;III. Somente após a validação do fluxo financeiro, a CONTRATADA formalizará a proposta de interesse em crédito perante a instituição financeira.
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;IV. Caso o <em>Rating</em> Bancário inicial seja inferior aos níveis exigidos, a CONTRATANTE deverá manter o relacionamento e a movimentação bancária sob orientação da CONTRATADA até que o nível de elegibilidade seja alcançado.
            </p>
            <p style={S.p}>
              <strong>5.7. Monitoramento de Compliance e Prevenção à Lavagem de Dinheiro (PLD):</strong>
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;I. É obrigação da CONTRATANTE o envio semanal do extrato bancário da conta corrente PJ aberta para este fim, impreterivelmente às quartas-feiras (ou no primeiro dia útil subsequente).
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;II. Tal monitoramento visa analisar o perfil de movimentação financeira e mitigar riscos de apontamentos junto ao COAF (Conselho de Controle de Atividades Financeiras), em estrita observância à Lei nº 9.613/1998 (Lei de Lavagem de Dinheiro).
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;III. A CONTRATADA emitirá relatório mensal de movimentação e atualização de <em>Rating</em> até o 5º (quinto) dia útil após o fechamento do ciclo de validação.
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;IV. Caso ocorra degradação do <em>Rating</em> Bancário por culpa ou omissão da CONTRATANTE, esta deverá arcar com as taxas de serviço adicionais para novas consultas, sendo: <strong>R$ 100,00</strong> para reconsulta de Rating Bacen (SCR) e <strong>R$ 70,00</strong> para reconsulta de restrições comerciais.
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;V. Adicionalmente, caso o <em>Rating</em> Bancário interno, no ato da abertura da conta ou após o término do primeiro ciclo de validação, seja inferior a <strong>"C"</strong>, será cobrado um valor mensal de <strong>{brl(d.custeio_mensal)}</strong> a título de custeio do acompanhamento intensivo de extratos bancários, certidões fiscais e restrições comerciais ou bancárias. Este valor será devido enquanto o <em>Rating</em> permanecer abaixo do nível "C".
            </p>
            <p style={S.p}>
              &nbsp;&nbsp;&nbsp;VI. O relatório técnico atualizado será emitido e enviado somente após a confirmação do pagamento das devidas taxas adicionais e/ou da taxa mensal de acompanhamento, conforme o caso.
            </p>

            {/* VII – CONFIDENCIALIDADE */}
            <p style={S.sectionTitle}>VII – CONFIDENCIALIDADE</p>

            <p style={S.p}>
              <strong>Cláusula 6</strong> - A CONTRATADA compromete-se a manter em absoluto sigilo todas as informações e documentos recebidos da CONTRATANTE, não os utilizando para qualquer outro fim que não a execução do presente contrato, exceto quando exigido por lei ou ordem judicial.
            </p>
            {temParceiro && (
              <p style={S.p}>
                <strong>6.1</strong> - O PARCEIRO COMERCIAL, quando autorizado pela CONTRATANTE a ter acesso às informações, compromete-se igualmente a manter sigilo absoluto sobre todos os dados e documentos relacionados ao presente contrato.
              </p>
            )}

            {/* VIII – RESCISÃO */}
            <p style={S.sectionTitle}>VIII – RESCISÃO</p>

            <p style={S.p}>
              <strong>Cláusula 7</strong> - A CONTRATANTE poderá rescindir este contrato até a entrega pela CONTRATADA do relatório de análise dos documentos apresentados, mediante pagamento de 1% (um por cento) do valor informado na Cláusula 1.1, pelos serviços de análise documental, já prestados.
            </p>
            <p style={S.p}>
              <strong>7.1</strong> - Na ausência do pagamento pelos serviços já prestados pela CONTRATADA à CONTRATANTE, deve a CONTRATADA entender automaticamente, que é o interesse da CONTRATANTE, seguir de forma IRREVOGÁVEL e IRRETRATÁVEL as cláusulas deste contrato, sob a isenção de cobrança do pagamento de 1% (um por cento), referente ao relatório de análise dos documentos apresentados.
            </p>

            {/* IX – CLÁUSULA PENAL */}
            <p style={S.sectionTitle}>IX – CLÁUSULA PENAL POR INADIMPLÊNCIA</p>

            <p style={S.p}>
              <strong>Cláusula 8</strong> - Fica estabelecida uma Cláusula Penal em favor da CONTRATADA, aplicável na hipótese de inadimplência da CONTRATANTE em relação aos contratos de crédito obtidos com o suporte dos serviços objeto deste instrumento.
            </p>
            <p style={S.p}>
              <strong>8.1</strong> - A Cláusula Penal será acionada caso a CONTRATANTE atrase o pagamento de 3 (três) parcelas consecutivas ou 5 (cinco) parcelas alternadas do contrato de crédito obtido junto à instituição financeira.
            </p>
            <p style={S.p}>
              <strong>8.2</strong> - O valor da multa será de {d.taxa_desistencia}% ({pctExtenso(d.taxa_desistencia)} por cento) sobre o valor total do crédito contratado pela CONTRATANTE junto à instituição financeira, a ser pago à CONTRATADA no prazo de 10 (dez) dias úteis após a notificação da inadimplência.
            </p>
            <p style={S.p}>
              <strong>8.3</strong> - A aplicação desta Cláusula Penal não impede a CONTRATADA de buscar outras medidas legais cabíveis para a recuperação de quaisquer valores devidos, incluindo, mas não se limitando, aos honorários e comissões previstos na Cláusula 4.
            </p>

            {/* X – FORO */}
            <p style={S.sectionTitle}>X – DO FORO E CONDIÇÕES GERAIS</p>

            <p style={S.p}>
              Para dirimir quaisquer controvérsias oriundas do CONTRATO, as partes elegem o foro da Circunscrição Judiciária de <strong>{d.foro_eleito}</strong>.
            </p>
            <p style={S.p}>
              Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias de igual teor.
            </p>

            {/* Local e Data */}
            <p style={S.cityDate}>
              <strong>{d.cidade_assinatura || 'BRASÍLIA – DF'}, {formatDate(d.data_assinatura)}.</strong>
            </p>

            {/* Assinaturas — 1ª linha: CONTRATANTE e CONTRATADA */}
            <div style={S.sigGrid}>
              <div style={S.sigBox}>
                <div style={S.sigLine} />
                {assinantesContratante.map((s, i) => (
                  <p key={`${s.nome}-${i}`} style={S.sigName}>{s.nome}</p>
                ))}
                <p style={S.sigName}>{d.empresa_razao_social || 'CONTRATANTE'}</p>
                {d.empresa_cnpj && <p style={S.sigSub}>CNPJ: {d.empresa_cnpj}</p>}
                <p style={S.sigSub}>CONTRATANTE</p>
              </div>
              <div style={S.sigBox}>
                <div style={S.sigLine} />
                <p style={S.sigName}>{representanteContratada}</p>
                <p style={S.sigName}>DESTRAVA CRÉDITO LTDA</p>
                <p style={S.sigSub}>CNPJ: 35.427.182/0001-66</p>
                <p style={S.sigSub}>CONTRATADA</p>
              </div>
            </div>

            {/* 2ª linha: UMA TESTEMUNHA à esquerda e PARCEIRO COMERCIAL à direita */}
            <div style={S.witnessGrid}>
              <div style={S.witnessBox}>
                <div style={S.sigLine} />
                <p style={{ ...S.sigName, fontSize: '8pt', textTransform: 'uppercase', color: '#1e3a5f' }}>Testemunha</p>
                <p style={S.sigSub}>Nome: ___________________________________</p>
                <p style={S.sigSub}>CPF: ____________________________________</p>
              </div>
              {temParceiro ? (
                <div style={S.witnessBox}>
                  <div style={S.sigLine} />
                  <p style={S.sigName}>{d.parceiro_nome}</p>
                  {d.parceiro_cpf && <p style={S.sigSub}>CPF: {d.parceiro_cpf}</p>}
                  <p style={S.sigSub}>PARCEIRO COMERCIAL</p>
                </div>
              ) : (
                <div style={S.witnessBox} />
              )}
            </div>

            <div style={S.footer}>
              <p><strong>BRASÍLIA - SEDE</strong><br />St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250</p>
              <p style={{ marginTop: '4px' }}><strong>GOIÂNIA - FILIAL</strong><br />Avenida Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-GO</p>
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
