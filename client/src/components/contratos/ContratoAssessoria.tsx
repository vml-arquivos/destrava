import { useState, useMemo, useEffect, useRef, type CSSProperties } from 'react';
import { X, Printer, FileDown, Loader2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from '../../lib/currency';

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
  onClose: () => void;
  onGerarPdf: (dadosEditados: DadosContratoAssessoria) => Promise<void>;
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
  50000: 'cinquenta mil reais',
  100000: 'cem mil reais',
  150000: 'cento e cinquenta mil reais',
  200000: 'duzentos mil reais',
  300000: 'trezentos mil reais',
  500000: 'quinhentos mil reais',
  1000000: 'um milhão de reais',
};

const valorExtenso = (v: number): string =>
  extensoMap[v] ?? `${brl(v).replace('R$\u00a0', '')} reais`;

// Extenso textual para percentuais usados no contrato
const pctExtenso = (pct: number): string => {
  const map: Record<number, string> = {
    1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco',
    6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
    12: 'doze', 15: 'quinze', 20: 'vinte', 25: 'vinte e cinco',
  };
  return map[pct] ?? String(pct);
};

// ─────────────────────────────────────────────────────────────────────────────
// CAMPO EDITÁVEL INLINE — ocultado na impressão
// ─────────────────────────────────────────────────────────────────────────────

function Campo({
  valor,
  onChange,
  multiline = false,
}: {
  valor: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const [editando, setEditando] = useState(false);

  if (!editando) {
    return (
      <span
        onClick={() => setEditando(true)}
        title="Clique para editar"
        className="cursor-pointer border-b border-dashed border-blue-400 hover:bg-blue-50 transition-colors rounded-sm px-0.5 print:border-none print:cursor-default print:hover:bg-transparent"
      >
        {valor || <span className="text-red-400 italic">[ não preenchido ]</span>}
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        autoFocus
        value={valor}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditando(false)}
        rows={2}
        className="border border-blue-400 rounded px-1 bg-blue-50 text-sm w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  return (
    <input
      autoFocus
      type="text"
      value={valor}
      onChange={e => onChange(e.target.value)}
      onBlur={() => setEditando(false)}
      className="border border-blue-400 rounded px-1 bg-blue-50 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[140px]"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT DO PAINEL LATERAL
// ─────────────────────────────────────────────────────────────────────────────

function PainelInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  step = 1,
  isCurrency = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
  isCurrency?: boolean;
}) {
  const [displayValue, setDisplayValue] = useState<string>(() =>
    isCurrency ? (value ? formatBRLCurrency(value) : '') : String(value)
  );
  const prevRef = useRef<number>(value);
  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setDisplayValue(isCurrency ? (value ? formatBRLCurrency(value) : '') : String(value));
    }
  }, [value, isCurrency]);

  if (isCurrency) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide leading-tight">
          {label}
        </label>
        <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-blue-400 transition-all">
          {prefix && (
            <span className="px-2 py-1.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 select-none">
              {prefix}
            </span>
          )}
          <input
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={e => {
              const formatted = maskCurrencyInput(e.target.value);
              setDisplayValue(formatted);
              const num = unmaskCurrencyInput(formatted);
              prevRef.current = num;
              onChange(num);
            }}
            placeholder="0,00"
            autoComplete="off"
            className="flex-1 px-2 py-1.5 text-sm font-semibold text-gray-800 text-right font-mono tabular-nums focus:outline-none bg-white"
          />
          {suffix && (
            <span className="px-2 py-1.5 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 select-none">
              {suffix}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide leading-tight">
        {label}
      </label>
      <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-blue-400 transition-all">
        {prefix && (
          <span className="px-2 py-1.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 select-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={e => onChange(toNum(e.target.value))}
          className="flex-1 px-2 py-1.5 text-sm font-semibold text-gray-800 focus:outline-none bg-white"
        />
        {suffix && (
          <span className="px-2 py-1.5 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS DO DOCUMENTO (inline — compatível com print)
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  doc: {
    fontFamily: '"Georgia", "Times New Roman", Times, serif',
    fontSize: '11pt',
    lineHeight: 1.65,
    color: '#1a1a1a',
  } as CSSProperties,

  para: {
    textAlign: 'justify',
    marginBottom: '10px',
  } as CSSProperties,

  paraIndent: {
    textAlign: 'justify',
    marginBottom: '10px',
    paddingLeft: '18px',
  } as CSSProperties,

  h2: {
    fontSize: '10pt',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: '20px 0 8px',
    paddingBottom: '4px',
    borderBottom: '1px solid #bbb',
    fontFamily: 'Arial, sans-serif',
  } as CSSProperties,

  // Usado para seções que devem iniciar numa nova página na impressão
  h2PageBreak: {
    fontSize: '10pt',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: '20px 0 8px',
    paddingBottom: '4px',
    borderBottom: '1px solid #bbb',
    fontFamily: 'Arial, sans-serif',
    pageBreakBefore: 'always',
  } as CSSProperties,
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function ContratoAssessoria({ dados, onClose, onGerarPdf, loadingPdf }: Props) {
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
            onClick={() => onGerarPdf(d)}
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
            onClick={() => setPainelAberto(v => !v)}
            className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-gray-200 text-xs font-bold text-gray-700 hover:bg-slate-100 transition-colors uppercase tracking-wide"
          >
            <span className="flex items-center gap-2">
              <Settings2 className="w-3.5 h-3.5 text-blue-500" />
              Configuração Financeira
            </span>
            {painelAberto
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {painelAberto && (
            <div className="flex flex-col gap-4 p-4">

              <PainelInput
                label="Valor de Referência"
                value={d.valor_contrato}
                onChange={v => set('valor_contrato', v)}
                prefix="R$"
                step={1000}
                min={0}
                isCurrency
              />

              <PainelInput
                label="Taxa de Comissão"
                value={d.taxa_comissao}
                onChange={v => set('taxa_comissao', v)}
                suffix="%"
                step={0.5}
                min={0}
              />

              {/* Resultado comissão */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-xs text-blue-600 font-semibold">Comissão calculada (Cláusula 4)</p>
                <p className="text-lg font-bold text-blue-900 mt-0.5">{brl(valorComissao)}</p>
                <p className="text-xs text-blue-400">
                  {d.taxa_comissao}% sobre {brl(d.valor_contrato)}
                </p>
              </div>

              <div className="border-t border-gray-100" />

              <PainelInput
                label="Multa Desistência – Cláusula 4.3"
                value={d.taxa_desistencia}
                onChange={v => set('taxa_desistencia', v)}
                suffix="%"
                step={0.5}
                min={0}
              />

              {/* Resultado desistência */}
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                <p className="text-xs text-amber-600 font-semibold">Valor da multa calculado</p>
                <p className="text-lg font-bold text-amber-900 mt-0.5">{brl(valorDesistencia)}</p>
                <p className="text-xs text-amber-400">
                  {d.taxa_desistencia}% sobre {brl(d.valor_contrato)}
                </p>
              </div>

              <div className="border-t border-gray-100" />

              <PainelInput
                label="Custeio Mensal – Cláusula 5.7-V"
                value={d.custeio_mensal}
                onChange={v => set('custeio_mensal', v)}
                prefix="R$"
                step={50}
                min={0}
                isCurrency
              />

              {/* Resumo financeiro */}
              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Resumo</p>
                {[
                  { label: 'Valor de referência',             val: brl(d.valor_contrato),   color: 'text-gray-700' },
                  { label: `Comissão (${d.taxa_comissao}%)`,  val: brl(valorComissao),       color: 'text-blue-700' },
                  { label: `Multa desc. (${d.taxa_desistencia}%)`, val: brl(valorDesistencia), color: 'text-amber-700' },
                  { label: 'Custeio mensal',                  val: brl(d.custeio_mensal),   color: 'text-gray-700' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">{label}</span>
                    <span className={`font-bold ${color}`}>{val}</span>
                  </div>
                ))}
              </div>

            </div>
          )}

          <div className="mt-auto px-4 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 leading-relaxed">
            <span className="font-bold">✏️ Edição inline:</span> clique em qualquer texto{' '}
            <span className="border-b border-dashed border-blue-400 px-0.5">sublinhado azul</span>{' '}
            no documento para editar diretamente.
          </div>
        </aside>

        {/* ── DOCUMENTO A4 ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-8 px-4 print:p-0 print:overflow-visible">
          <div
            className="mx-auto bg-white shadow-2xl print:shadow-none print:mx-0"
            style={{
              width: '210mm',
              minHeight: '297mm',
              padding: '27mm 22mm 24mm 22mm',
              position: 'relative',
              ...S.doc,
            }}
          >

            {/* ══ CABEÇALHO TIMBRADO ════════════════════════════════════ */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '25mm',
              borderBottom: '2.5px solid #f0a500',
              display: 'flex', alignItems: 'center',
              paddingLeft: '22mm', paddingRight: '22mm',
              justifyContent: 'space-between', backgroundColor: '#fff',
            }}>
              <div style={{
                fontSize: '19pt', fontWeight: 'bold', color: '#1B3A8C',
                fontFamily: 'Arial, sans-serif', letterSpacing: '-0.5px',
              }}>
                Destrava <span style={{ color: '#f0a500' }}>Crédito</span>
              </div>
              <div style={{
                fontSize: '7.5pt', color: '#777', textAlign: 'right',
                lineHeight: 1.6, fontFamily: 'Arial, sans-serif',
              }}>
                CNPJ n° 35.427.182/0001-66<br />
                fernandoelipro@gmail.com
              </div>
            </div>

            {/* ══ TÍTULO ════════════════════════════════════════════════ */}
            <h1 style={{
              fontSize: '11.5pt', fontWeight: 'bold', textAlign: 'center',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              marginBottom: '18px', marginTop: '4px',
              fontFamily: 'Arial, sans-serif',
            }}>
              Contrato de Análise Documental para Acesso a Linha de Crédito
            </h1>

            {/* ══ I – IDENTIFICAÇÃO DAS PARTES ══════════════════════════ */}
            <h2 style={S.h2}>I – Identificação das Partes</h2>

            <p style={S.para}>
              <strong>CONTRATADA:</strong> denominada DESTRAVA CREDITO LTDA, com sede na QD QND 25,
              LOTE 40, Taguatinga Norte – Brasília - DF, Cep: 72.120-250, inscrita no CNPJ n°
              35.427.182/0001-66, devidamente representada por: FERNANDO ELI OLIVEIRA MARQUES,
              identificado como sócio administrador nesta data através da consulta do Quadro de Sócios
              e Administradores – QSA, disponibilizado pela República Federativa do Brasil – RFB,
              CPF n° 718.517.041-91.
            </p>

            <p style={S.para}>
              <strong>CONTRATANTE:</strong>{' '}
              <Campo valor={d.empresa_razao_social} onChange={v => set('empresa_razao_social', v)} />,
              {' '}pessoa jurídica de direito privado, inscrita no CNPJ n°{' '}
              <Campo valor={d.empresa_cnpj} onChange={v => set('empresa_cnpj', v)} />,
              {' '}com sede em{' '}
              <Campo valor={d.empresa_endereco} onChange={v => set('empresa_endereco', v)} multiline />,
              {' '}neste ato representada por seu representante legal{' '}
              <Campo valor={d.empresa_representante} onChange={v => set('empresa_representante', v)} />,
              {' '}brasileiro(a), portador(a) do CPF n°{' '}
              <Campo valor={d.empresa_cpf_representante} onChange={v => set('empresa_cpf_representante', v)} />,
              {' '}conforme poderes que lhe são conferidos pelo contrato social e/ou procuração.
            </p>

            {d.parceiro_nome && (
              <p style={S.para}>
                <strong>PARCEIRO COMERCIAL:</strong>{' '}
                <Campo valor={d.parceiro_nome} onChange={v => set('parceiro_nome', v)} />,
                {' '}pessoa física, inscrita no CPF n°{' '}
                <Campo valor={d.parceiro_cpf ?? ''} onChange={v => set('parceiro_cpf', v)} />,
                {' '}indicada pela CONTRATANTE como parceira comercial para fins de acompanhamento e
                suporte nas atividades relacionadas ao presente contrato.
              </p>
            )}

            {/* ══ II – OBJETO ═══════════════════════════════════════════ */}
            <h2 style={S.h2}>II – Do Objeto do Contrato e Valor de Referência</h2>

            <p style={S.para}>
              <strong>Cláusula 1</strong> - O presente contrato tem como objeto a prestação de
              serviços de análise e organização documental pela CONTRATADA, com o objetivo de
              orientar a CONTRATANTE quanto à adequação de sua documentação jurídica, contábil e
              financeira para fins de acesso e aquisição de linhas de crédito no sistema bancário
              nacional, governamental e ou fintech.
            </p>

            <p style={S.para}>
              1.1 - A CONTRATANTE estabelece que o montante de{' '}
              <strong>{brl(d.valor_contrato)} ({valorExtenso(d.valor_contrato)})</strong>{' '}
              será utilizado como valor de referência para a projeção de crédito e planejamento
              financeiro, servindo como pilar para a análise documental a ser realizada pela
              CONTRATADA.
            </p>

            <p style={S.para}>
              1.2 - O relatório de análise documental indicará as condições atuais e ideais para
              que a CONTRATANTE possa acessar o valor de referência projetado. Contudo, a
              CONTRATADA não garante a aprovação de crédito no valor de referência nem se
              responsabiliza por fatores externos, restrições financeiras ou fiscais, erros
              cadastrais, comprometimento financeiro, incapacidade de pagamento ou políticas de
              crédito das instituições financeiras.
            </p>

            <p style={S.para}>
              1.3 - Fica expressamente acordado que, caso não seja possível alcançar dentro do
              prazo de validade do contrato, o valor de referência, devido a limitações documentais,
              cadastrais, fiscais ou financeiras da CONTRATANTE, a CONTRATADA estará isenta de
              qualquer responsabilidade ou obrigação de resultado, limitando-se a prestar os
              serviços de análise e orientação contratados.
            </p>

            <p style={S.para}>
              1.4 - A CONTRATADA realizará análise técnica da documentação enviada, emitirá
              pareceres, apontará inconsistências e poderá sugerir correções, ficando a decisão
              sobre acatar tais sugestões sob responsabilidade exclusiva da CONTRATANTE.
            </p>

            {/* ══ III – RESPONSABILIDADES ═══════════════════════════════ */}
            <h2 style={S.h2}>III – Das Responsabilidades das Partes</h2>

            <p style={S.para}>
              <strong>Cláusula 2</strong> - Toda e qualquer informação, documento, dado ou acesso
              fornecido à CONTRATADA será de inteira responsabilidade da CONTRATANTE, inclusive
              quanto à sua veracidade, legalidade e atualidade. A CONTRATADA não se responsabiliza
              por prejuízos diretos ou indiretos decorrentes de informações incorretas, incompletas
              ou fraudulentas fornecidas.
            </p>

            <p style={S.para}>
              2.1 - A CONTRATADA poderá emitir pareceres e recomendações sobre a documentação
              enviada, sem que isso constitua obrigação de resultado ou responsabilidade técnica
              por atos praticados pela CONTRATANTE com base nessas orientações. Caso a CONTRATANTE
              opte por adotar qualquer sugestão, a responsabilidade por seus efeitos será
              exclusivamente sua.
            </p>

            <p style={S.para}>
              2.2 - A CONTRATANTE compromete-se a apresentar, atualizados, sempre que solicitado,
              todos os documentos e informações para a execução dos serviços.
            </p>

            {d.parceiro_nome && (
              <p style={S.para}>
                2.3 - O PARCEIRO COMERCIAL poderá acompanhar o desenvolvimento dos serviços e ter
                acesso às informações pertinentes, mediante autorização expressa da CONTRATANTE,
                ficando igualmente sujeito às cláusulas de confidencialidade deste contrato.
              </p>
            )}

            <p style={S.para}>
              <strong>Cláusula 2.4 – Dos Canais de Comunicação Oficiais</strong> - As
              comunicações, notificações, envio de relatórios e solicitações entre as PARTES serão
              realizados exclusivamente através dos canais eletrônicos fornecidos pela CONTRATANTE
              no ato da assinatura deste instrumento, quais sejam:{' '}
              <strong>e-mail institucional</strong> e/ou{' '}
              <strong>aplicativo de mensagens instantâneas (WhatsApp)</strong>.
            </p>

            <p style={S.para}>
              <strong>Parágrafo Único:</strong> Presumir-se-ão recebidas e lidas todas as
              comunicações enviadas aos endereços e números indicados, cabendo à CONTRATANTE a
              responsabilidade por manter tais dados atualizados e garantir a segurança e o acesso
              a esses meios.
            </p>

            {/* ══ IV – VIGÊNCIA ═════════════════════════════════════════ */}
            <h2 style={S.h2}>IV – Da Vigência e Renovação</h2>

            <p style={S.para}>
              <strong>Cláusula 3</strong> - Este contrato terá vigência de 12 (doze) meses a
              contar da data de sua assinatura, sendo automaticamente renovado por igual período,
              caso não haja manifestação contrária de qualquer das partes, comunicada com no mínimo
              30 (trinta) dias de antecedência do vencimento, por meio de e-mail enviado ao
              endereço: fernandoelipro@gmail.com.
            </p>

            {/* ══ V – REMUNERAÇÃO ═══════════════════════════════════════ */}
            <h2 style={S.h2}>V – Da Remuneração por Comissão e Honorário Mínimo</h2>

            <p style={S.para}>
              <strong>Cláusula 4</strong> - A CONTRATADA fará jus a comissão de{' '}
              <strong>
                {d.taxa_comissao}%{' '}
                ({pctExtenso(d.taxa_comissao)} por cento)
              </strong>{' '}
              sobre qualquer valor efetivamente liberado em favor da CONTRATANTE, no prazo de até
              12 meses da entrega do relatório inicial. A CONTRATANTE compromete-se a comunicar
              qualquer operação de crédito aprovada e contratada dentro do período de vigência
              deste contrato e a fornecer cópia do contrato, comprovante de liberação e/ou extrato
              bancário correspondente.
            </p>

            <p style={S.para}>
              4.1 - A comissão deverá ser paga pela CONTRATANTE à CONTRATADA no prazo máximo de
              1 (um) dia útil após a liberação do crédito, mediante transferência bancária para
              conta informada pela CONTRATADA.
            </p>

            <p style={S.para}>
              4.2 - A CONTRATADA declara que não realiza, direta ou indiretamente, qualquer tipo
              de pagamento, vantagem indevida, comissão oculta ou propina, seja a servidores
              públicos, agentes privados ou terceiros, sendo vedada qualquer prática que contrarie
              a legislação anticorrupção vigente (Lei nº 12.846/2013 e demais normas aplicáveis).
            </p>

            {/* 4.3 — MULTA DESISTÊNCIA CALCULADA DINAMICAMENTE */}
            <p style={S.para}>
              4.3 - Fica estabelecido que, caso a CONTRATANTE não contrate operações de crédito
              em valor igual ou superior a{' '}
              <strong>{brl(d.valor_contrato)} ({valorExtenso(d.valor_contrato)})</strong>{' '}
              no período de vigência do contrato (12 meses), por motivos a ela atribuíveis, será
              devido à CONTRATADA, a título de honorário mínimo garantido, o valor correspondente
              a{' '}
              <strong>
                {d.taxa_desistencia}%{' '}
                ({pctExtenso(d.taxa_desistencia)} por cento)
              </strong>{' '}
              sobre o valor de referência pretendido inicialmente (Cláusula 1.1), totalizando{' '}
              <strong>{brl(valorDesistencia)} ({valorExtenso(valorDesistencia)})</strong>.
            </p>

            <p style={{ ...S.para, textAlign: 'center', fontWeight: 'bold', margin: '14px 0 8px' }}>
              PARÁGRAFO ÚNICO – CAUSAS DE IMPEDIMENTO A CRÉDITO POR PARTE DA CONTRATANTE
            </p>

            <p style={S.para}>
              As causas de impedimento a crédito por parte da CONTRATANTE são: 1 – Apontamento,
              direto ou indireto (replicação) de restrição financeira, fiscal ou de simples
              protesto, inclusive em grupo econômico e cônjuge. 2 – Rating Bacen diferente de C,
              B ou A. 3 – Movimentação bancária inferior à declarada no faturamento bruto e quando
              exigido na declaração de imposto de renda. 4 – Anotação de apontamento de fraude
              documental ou ideológica no Banco Central. 5 – Mudança de endereço da sede
              empresarial sem comunicação prévia. 6 – Falta de comprovação de endereço da sede ou
              endereço divergente ao registrado nos órgãos competentes.
            </p>

            <p style={S.para}>
              4.4 - O valor do honorário mínimo poderá ser cobrado integralmente ao final do
              contrato, ou em parcelas mensais, conforme acordo entre as partes.
            </p>

            <p style={S.para}>
              4.5 - Caso a CONTRATANTE venha a contratar operações de crédito que, somadas,
              ultrapassem o valor de{' '}
              <strong>{brl(d.valor_contrato)} ({valorExtenso(d.valor_contrato)})</strong>{' '}
              durante a vigência do contrato, 12 (doze) meses, a CONTRATADA renunciará ao
              recebimento do honorário mínimo, mantendo-se exclusivamente o direito à comissão
              de{' '}
              <strong>{d.taxa_comissao}%</strong> sobre o valor contratado.
            </p>

            {/* ══ VI – FLUXO OPERACIONAL ════════════════════════════════ */}
            <h2 style={S.h2PageBreak}>VI – Do Fluxo Operacional e Procedimentos Técnicos</h2>

            <p style={S.para}>
              <strong>Cláusula 5</strong> - A execução dos serviços de assessoria para obtenção
              de crédito obedecerá ao rigoroso fluxo operacional descrito nos itens abaixo:
            </p>

            <p style={S.para}>
              <strong>5.1. Diagnóstico Inicial de Risco (Rating Bacen):</strong> No ato da
              assinatura deste contrato, a CONTRATADA realizará a consulta de classificação de
              risco da CONTRATANTE junto ao Sistema de Informações de Crédito (SCR) do Banco
              Central do Brasil.
            </p>

            <p style={S.para}>
              <strong>5.2. Formalização:</strong> O início efetivo dos trabalhos técnicos está
              condicionado à assinatura do presente Instrumento Particular de Prestação de
              Serviços por ambas as partes.
            </p>

            <p style={S.para}>
              <strong>5.3. Instrução Processual:</strong> Após a formalização, a CONTRATADA
              enviará à CONTRATANTE uma lista de verificação (<em>checklist</em>) contendo os
              documentos e acessos necessários para a análise técnica. O prazo para entrega
              integral dessa documentação é de inteira responsabilidade da CONTRATANTE.
            </p>

            <p style={S.para}>
              <strong>5.4. Análise Técnica e Relatórios:</strong> Recebida a documentação
              integral, a CONTRATADA terá o prazo de até{' '}
              <strong>72 (setenta e duas) horas</strong> para realizar a análise documental e
              emitir o relatório técnico de viabilidade, que será encaminhado pelos canais
              oficiais estabelecidos na Cláusula 2.4.
            </p>

            <p style={S.para}>
              <strong>5.5. Deferimento Interno e Abertura de Conta:</strong> Mediante parecer
              favorável da Diretoria Técnica da DESTRAVA CRÉDITO, os documentos serão processados
              e encaminhados para os trâmites de abertura de conta corrente de pessoa jurídica
              junto às instituições parceiras.
            </p>

            <p style={S.para}><strong>5.6. Validação de Rating Bancário e Faturamento:</strong></p>

            <p style={S.paraIndent}>
              <strong>I.</strong> Concluída a abertura da conta, será procedida a avaliação do{' '}
              <em>Rating</em> Bancário interno, cujo nível de elegibilidade para prosseguimento
              deve ser, obrigatoriamente, <strong>"A"</strong> ou <strong>"B"</strong>.
            </p>
            <p style={S.paraIndent}>
              <strong>II.</strong> Atendido o critério de <em>Rating</em>, iniciar-se-á o ciclo
              de validação de faturamento pelo período de 30 (trinta) dias, encerrando-se sempre
              no último dia útil de cada mês.
            </p>
            <p style={S.paraIndent}>
              <strong>III.</strong> Somente após a validação do fluxo financeiro, a CONTRATADA
              formalizará a proposta de interesse em crédito perante a instituição financeira.
            </p>
            <p style={S.paraIndent}>
              <strong>IV.</strong> Caso o <em>Rating</em> Bancário inicial seja inferior aos
              níveis exigidos, a CONTRATANTE deverá manter o relacionamento e a movimentação
              bancária sob orientação da CONTRATADA até que o nível de elegibilidade seja
              alcançado.
            </p>

            <p style={S.para}>
              <strong>
                5.7. Monitoramento de Compliance e Prevenção à Lavagem de Dinheiro (PLD):
              </strong>
            </p>

            <p style={S.paraIndent}>
              <strong>I.</strong> É obrigação da CONTRATANTE o envio semanal do extrato bancário
              da conta corrente PJ aberta para este fim, impreterivelmente às quartas-feiras (ou
              no primeiro dia útil subsequente).
            </p>
            <p style={S.paraIndent}>
              <strong>II.</strong> Tal monitoramento visa analisar o perfil de movimentação
              financeira e mitigar riscos de apontamentos junto ao COAF (Conselho de Controle de
              Atividades Financeiras), em estrita observância à Lei nº 9.613/1998 (Lei de Lavagem
              de Dinheiro).
            </p>
            <p style={S.paraIndent}>
              <strong>III.</strong> A CONTRATADA emitirá relatório mensal de movimentação e
              atualização de <em>Rating</em> até o 5º (quinto) dia útil após o fechamento do
              ciclo de validação.
            </p>
            <p style={S.paraIndent}>
              <strong>IV.</strong> Caso ocorra degradação do <em>Rating</em> Bancário por culpa
              ou omissão da CONTRATANTE, esta deverá arcar com as taxas de serviço adicionais
              para novas consultas, sendo:{' '}
              <strong>R$ 100,00 (cem reais)</strong> para reconsulta de Rating Bacen (SCR) e{' '}
              <strong>R$ 70,00 (setenta reais)</strong> para reconsulta de restrições comerciais.
            </p>

            {/* 5.7-V — CUSTEIO MENSAL CALCULADO DINAMICAMENTE */}
            <p style={S.paraIndent}>
              <strong>V.</strong> Adicionalmente, caso o <em>Rating</em> Bancário interno, no
              ato da abertura da conta ou após o término do primeiro ciclo de validação, seja
              inferior a <strong>"C"</strong>, será cobrado um valor mensal de{' '}
              <strong>{brl(d.custeio_mensal)} ({valorExtenso(d.custeio_mensal)})</strong>{' '}
              a título de custeio do acompanhamento intensivo de extratos bancários, certidões
              fiscais e restrições comerciais ou bancárias. Este valor será devido enquanto o{' '}
              <em>Rating</em> permanecer abaixo do nível "C".
            </p>
            <p style={S.paraIndent}>
              <strong>VI.</strong> O relatório técnico atualizado será emitido e enviado somente
              após a confirmação do pagamento das devidas taxas adicionais e/ou da taxa mensal de
              acompanhamento, conforme o caso.
            </p>

            {/* ══ VII – CONFIDENCIALIDADE ═══════════════════════════════ */}
            <h2 style={S.h2}>VII – Confidencialidade</h2>

            <p style={S.para}>
              <strong>Cláusula 6</strong> - A CONTRATADA compromete-se a manter em absoluto
              sigilo todas as informações e documentos recebidos da CONTRATANTE, não os utilizando
              para qualquer outro fim que não a execução do presente contrato, exceto quando
              exigido por lei ou ordem judicial.
            </p>

            {d.parceiro_nome && (
              <p style={S.para}>
                6.1 - O PARCEIRO COMERCIAL, quando autorizado pela CONTRATANTE a ter acesso às
                informações, compromete-se igualmente a manter sigilo absoluto sobre todos os
                dados e documentos relacionados ao presente contrato.
              </p>
            )}

            {/* ══ VIII – RESCISÃO ═══════════════════════════════════════ */}
            <h2 style={S.h2}>VIII – Rescisão</h2>

            <p style={S.para}>
              <strong>Cláusula 7</strong> - A CONTRATANTE poderá rescindir este contrato até a
              entrega pela CONTRATADA do relatório de análise dos documentos apresentados,
              mediante pagamento de 1% (um por cento) do valor informado na Cláusula 1.1, pelos
              serviços de análise documental, já prestados.
            </p>

            <p style={S.para}>
              7.1 - Na ausência do pagamento pelos serviços já prestados pela CONTRATADA à
              CONTRATANTE, deve a CONTRATADA entender automaticamente, que é o interesse da
              CONTRATANTE, seguir de forma IRREVOGÁVEL e IRRETRATÁVEL as cláusulas deste contrato,
              sob a isenção de cobrança do pagamento de 1% (um por cento), referente ao relatório
              de análise dos documentos apresentados.
            </p>

            {/* ══ IX – CLÁUSULA PENAL ═══════════════════════════════════ */}
            <h2 style={S.h2}>IX – Cláusula Penal por Inadimplência</h2>

            <p style={S.para}>
              <strong>Cláusula 8</strong> - Fica estabelecida uma Cláusula Penal em favor da
              CONTRATADA, aplicável na hipótese de inadimplência da CONTRATANTE em relação aos
              contratos de crédito obtidos com o suporte dos serviços objeto deste instrumento.
            </p>

            <p style={S.para}>
              8.1 - A Cláusula Penal será acionada caso a CONTRATANTE atrase o pagamento de
              3 (três) parcelas consecutivas ou 5 (cinco) parcelas alternadas do contrato de
              crédito obtido junto à instituição financeira.
            </p>

            <p style={S.para}>
              8.2 - O valor da multa será de 5% (cinco por cento) sobre o valor total do crédito
              contratado pela CONTRATANTE junto à instituição financeira, a ser pago à CONTRATADA
              no prazo de 10 (dez) dias úteis após a notificação da inadimplência.
            </p>

            <p style={S.para}>
              8.3 - A aplicação desta Cláusula Penal não impede a CONTRATADA de buscar outras
              medidas legais cabíveis para a recuperação de quaisquer valores devidos, incluindo,
              mas não se limitando, aos honorários e comissões previstos na Cláusula 4.
            </p>

            {/* ══ X – FORO ══════════════════════════════════════════════ */}
            <h2 style={S.h2}>X – Do Foro e Condições Gerais</h2>

            <p style={S.para}>
              Para dirimir quaisquer controvérsias oriundas do CONTRATO, as partes elegem o foro
              da Circunscrição Judiciária de{' '}
              <Campo valor={d.foro_eleito} onChange={v => set('foro_eleito', v)} />.
            </p>

            <p style={S.para}>
              Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias
              de igual teor.
            </p>

            <p style={{ textAlign: 'right', marginTop: '10px', marginBottom: '32px' }}>
              <Campo valor={d.cidade_assinatura} onChange={v => set('cidade_assinatura', v)} />,{' '}
              {formatDate(d.data_assinatura)}.
            </p>

            {/* ══ ASSINATURAS ═══════════════════════════════════════════ */}
            <div style={{ pageBreakInside: 'avoid', marginTop: '36px' }}>

              <div style={{ marginBottom: '26px' }}>
                <div style={{ borderTop: '1px solid #222', width: '82%', marginBottom: '5px' }} />
                <p style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '2px' }}>
                  CONTRATANTE:
                </p>
                <p style={{ fontSize: '10pt' }}>{d.empresa_razao_social}</p>
                <p style={{ fontSize: '10pt' }}>CNPJ n° {d.empresa_cnpj}</p>
                <p style={{ fontSize: '10pt' }}>
                  Representante: {d.empresa_representante} – CPF n° {d.empresa_cpf_representante}
                </p>
              </div>

              {d.parceiro_nome && (
                <div style={{ marginBottom: '26px' }}>
                  <div style={{ borderTop: '1px solid #222', width: '82%', marginBottom: '5px' }} />
                  <p style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '2px' }}>
                    PARCEIRO COMERCIAL:
                  </p>
                  <p style={{ fontSize: '10pt' }}>
                    {d.parceiro_nome} – CPF n° {d.parceiro_cpf}
                  </p>
                </div>
              )}

              <div style={{ marginBottom: '26px' }}>
                <div style={{ borderTop: '1px solid #222', width: '82%', marginBottom: '5px' }} />
                <p style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '2px' }}>
                  CONTRATADA:
                </p>
                <p style={{ fontSize: '10pt' }}>
                  DESTRAVA CRÉDITO LTDA – CNPJ n° 35.427.182/0001-66
                </p>
              </div>

              <div style={{ display: 'flex', gap: '32px', marginTop: '12px' }}>
                {(['TESTEMUNHA 1', 'TESTEMUNHA 2'] as const).map(t => (
                  <div key={t} style={{ flex: 1 }}>
                    <div style={{ borderTop: '1px solid #222', marginBottom: '5px' }} />
                    <p style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '3px' }}>
                      {t}:
                    </p>
                    <p style={{ fontSize: '9pt', color: '#444' }}>
                      Nome: _________________________________
                    </p>
                    <p style={{ fontSize: '9pt', color: '#444' }}>
                      CPF: __________________________________
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* ══ RODAPÉ ════════════════════════════════════════════════ */}
            <div style={{
              marginTop: '32px', paddingTop: '10px',
              borderTop: '2px solid #f0a500',
              fontSize: '7.5pt', color: '#666',
              lineHeight: 1.6,
              display: 'flex', justifyContent: 'space-between', gap: '24px',
            }}>
              <div>
                <strong style={{ color: '#1B3A8C' }}>BRASÍLIA – SEDE</strong><br />
                St. D Norte QND 25 LOTE 40 – Taguatinga, Brasília – DF, 72120-250
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong style={{ color: '#1B3A8C' }}>GOIÂNIA – FILIAL</strong><br />
                Av. Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 – CEP: 74665-555 – Goiânia/GO
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── BARRA INFERIOR ──────────────────────────────────── print:hidden */}
      <div className="flex-shrink-0 px-5 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 flex items-center gap-2 print:hidden">
        <span className="font-bold">✏️ Modo edição:</span>
        Clique em qualquer texto sublinhado no documento para editar inline ·
        Configure os valores financeiros no painel lateral.
      </div>

    </div>
  );
}

