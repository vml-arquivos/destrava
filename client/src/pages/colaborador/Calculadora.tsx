import { useState, useCallback } from "react";
import Layout from "./Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Calculator,
  User,
  Building2,
  Phone,
  DollarSign,
  Percent,
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
  Save,
  Printer,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─── Formatadores ─────────────────────────────────────────────────────────────

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${v.toFixed(4).replace(".", ",")}%`;

function parseBRL(v: string): number {
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
}

function formatarMoeda(v: string): string {
  const nums = v.replace(/\D/g, "");
  if (!nums) return "";
  const n = parseInt(nums) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarTelefone(v: string): string {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

// ─── Cálculos ─────────────────────────────────────────────────────────────────

interface ResultadoCalculo {
  parcelaMensal: number;
  totalEmprestimo: number;
  totalJuros: number;
  impostoValor: number;
  comissaoValor: number;
  custoTotalOperacao: number;
  cetMensal: number;
  cetAnual: number;
  tabelaAmortizacao: Array<{
    parcela: number;
    saldoInicial: number;
    juros: number;
    amortizacao: number;
    prestacao: number;
    saldoFinal: number;
  }>;
}

function calcular(
  valorCredito: number,
  prazo: number,
  taxaMensal: number,
  valorFiscal: number,
  pctImposto: number,
  pctComissao: number
): ResultadoCalculo | null {
  if (!valorCredito || !prazo || !taxaMensal) return null;

  const taxa = taxaMensal / 100;

  // Parcela calculada sobre o valor do crédito (Price)
  const parcelaMensal =
    (valorCredito * taxa * Math.pow(1 + taxa, prazo)) /
    (Math.pow(1 + taxa, prazo) - 1);

  const totalEmprestimo = parcelaMensal * prazo;
  const totalJuros = totalEmprestimo - valorCredito;

  // Imposto calculado sobre o valor fiscal declarado pelo cliente
  const impostoValor = valorFiscal > 0 && pctImposto > 0
    ? (valorFiscal * pctImposto) / 100
    : 0;

  // Comissão calculada sobre o valor do crédito
  const comissaoValor = pctComissao > 0
    ? (valorCredito * pctComissao) / 100
    : 0;

  // Custo total da operação = total do empréstimo + imposto + comissão
  const custoTotalOperacao = totalEmprestimo + impostoValor + comissaoValor;

  // CET via Newton-Raphson (considera comissão e imposto como custo inicial)
  const custoInicial = impostoValor + comissaoValor;
  const fluxo = [-(valorCredito - custoInicial)];
  for (let i = 0; i < prazo; i++) fluxo.push(parcelaMensal);

  let cetMensal = taxa;
  for (let iter = 0; iter < 200; iter++) {
    let f = 0, df = 0;
    for (let t = 0; t < fluxo.length; t++) {
      const fator = Math.pow(1 + cetMensal, t);
      f += fluxo[t] / fator;
      if (t > 0) df -= (t * fluxo[t]) / (fator * (1 + cetMensal));
    }
    if (Math.abs(df) < 1e-15) break;
    const delta = -f / df;
    cetMensal += delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  const cetAnual = (Math.pow(1 + cetMensal, 12) - 1) * 100;

  // Tabela de amortização (Sistema Price)
  const tabelaAmortizacao = [];
  let saldo = valorCredito;
  for (let i = 1; i <= prazo; i++) {
    const juros = saldo * taxa;
    const amortizacao = parcelaMensal - juros;
    const saldoFinal = Math.max(0, saldo - amortizacao);
    tabelaAmortizacao.push({
      parcela: i,
      saldoInicial: saldo,
      juros,
      amortizacao,
      prestacao: parcelaMensal,
      saldoFinal,
    });
    saldo = saldoFinal;
  }

  return {
    parcelaMensal,
    totalEmprestimo,
    totalJuros,
    impostoValor,
    comissaoValor,
    custoTotalOperacao,
    cetMensal: cetMensal * 100,
    cetAnual,
    tabelaAmortizacao,
  };
}

// ─── Tipos de formulário ──────────────────────────────────────────────────────

interface FormBase {
  nome: string;
  empresa: string;
  telefone: string;
  cpfCnpj: string;
  valorCredito: string;
  prazo: string;
  taxaJuros: string;
  comissao: string;
  banco: string;
  linhaCredito: string;
  observacoes: string;
}

interface FormComImposto extends FormBase {
  valorFiscal: string;
  pctImposto: string;
}

const BANCOS = [
  "CAIXA Econômica Federal",
  "Banco do Brasil",
  "Bradesco",
  "Itaú",
  "Santander",
  "Sicredi",
  "Sicoob",
  "BNB",
  "BNDES",
  "Outro",
];

const LINHAS = [
  "PRONAMPE",
  "Giro CAIXA Fácil",
  "Capital de Giro",
  "PRONAMP",
  "Crédito Rural",
  "Financiamento de Equipamentos",
  "Crédito Imobiliário PJ",
  "Antecipação de Recebíveis",
  "Crédito Pessoal",
  "Consignado",
  "Outro",
];

const PRAZOS = [6, 12, 18, 24, 30, 36, 48, 60, 72, 84, 96, 120];

const formBaseInicial: FormBase = {
  nome: "",
  empresa: "",
  telefone: "",
  cpfCnpj: "",
  valorCredito: "",
  prazo: "24",
  taxaJuros: "",
  comissao: "",
  banco: "",
  linhaCredito: "",
  observacoes: "",
};

// ─── Painel de resultado ──────────────────────────────────────────────────────

function PainelResultado({
  resultado,
  comImposto,
  valorFiscalNum,
  pctImpostoNum,
  prazo,
}: {
  resultado: ResultadoCalculo;
  comImposto: boolean;
  valorFiscalNum: number;
  pctImpostoNum: number;
  prazo: number;
}) {
  const [mostrarTabela, setMostrarTabela] = useState(false);

  return (
    <div className="space-y-4">
      {/* Parcela destaque */}
      <div className="bg-gradient-to-br from-[#001f6b] to-[#003db5] rounded-2xl p-6 text-white text-center">
        <p className="text-white/70 text-sm mb-1">Parcela Mensal</p>
        <p className="text-4xl font-bold">{fmtBRL.format(resultado.parcelaMensal)}</p>
        <p className="text-white/60 text-xs mt-1">em {prazo}x mensais</p>
      </div>

      {/* Detalhamento */}
      <div className="space-y-0">
        {[
          { label: "Valor do Crédito", value: fmtBRL.format(resultado.parcelaMensal * prazo - resultado.totalJuros), color: "" },
          { label: "Total de Juros", value: fmtBRL.format(resultado.totalJuros), color: "text-amber-600" },
          { label: "Total do Empréstimo", value: fmtBRL.format(resultado.totalEmprestimo), color: "font-semibold" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between items-center py-2.5 border-b border-border text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-medium ${color}`}>{value}</span>
          </div>
        ))}

        {/* Bloco fiscal — só no cenário A */}
        {comImposto && valorFiscalNum > 0 && (
          <>
            <div className="flex justify-between items-center py-2.5 border-b border-border text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-blue-500" />
                Valor Fiscal Declarado
              </span>
              <span className="font-medium">{fmtBRL.format(valorFiscalNum)}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 border-b border-border text-sm">
              <span className="text-muted-foreground">
                Imposto ({pctImpostoNum}% sobre fiscal)
              </span>
              <span className="font-semibold text-red-600">{fmtBRL.format(resultado.impostoValor)}</span>
            </div>
          </>
        )}

        {resultado.comissaoValor > 0 && (
          <div className="flex justify-between items-center py-2.5 border-b border-border text-sm">
            <span className="text-muted-foreground">Comissão Destrava</span>
            <span className="font-semibold text-orange-600">{fmtBRL.format(resultado.comissaoValor)}</span>
          </div>
        )}
      </div>



      {/* Custo total — destaque */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-2xl p-5">
        <p className="text-sm text-muted-foreground text-center mb-1">
          💰 Custo Total da Operação
        </p>
        <p className="text-3xl font-bold text-center text-red-700">
          {fmtBRL.format(resultado.custoTotalOperacao)}
        </p>
        <p className="text-xs text-center text-muted-foreground mt-1.5">
          Empréstimo ({fmtBRL.format(resultado.totalEmprestimo)})
          {resultado.impostoValor > 0 ? ` + Imposto (${fmtBRL.format(resultado.impostoValor)})` : ""}
          {resultado.comissaoValor > 0 ? ` + Comissão (${fmtBRL.format(resultado.comissaoValor)})` : ""}
        </p>
      </div>


    </div>
  );
}

// ─── Campos reutilizáveis ─────────────────────────────────────────────────────

function CamposCliente({
  form,
  erros,
  set,
}: {
  form: FormBase;
  erros: Record<string, string>;
  set: (k: keyof FormBase, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b">
        <User className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Cliente</p>
        <span className="text-xs text-destructive ml-auto">* obrigatório</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome Completo <span className="text-destructive">*</span></Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="nome"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Nome do cliente"
              className={`pl-9 ${erros.nome ? "border-destructive" : ""}`}
            />
          </div>
          {erros.nome && <p className="text-xs text-destructive">{erros.nome}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="empresa">Empresa / Razão Social <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="empresa"
              value={form.empresa}
              onChange={(e) => set("empresa", e.target.value)}
              placeholder="Razão social ou nome fantasia"
              className={`pl-9 ${erros.empresa ? "border-destructive" : ""}`}
            />
          </div>
          {erros.empresa && <p className="text-xs text-destructive">{erros.empresa}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="telefone">Telefone / WhatsApp <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="telefone"
              value={form.telefone}
              onChange={(e) => set("telefone", formatarTelefone(e.target.value))}
              placeholder="(61) 9 9999-9999"
              className={`pl-9 ${erros.telefone ? "border-destructive" : ""}`}
              inputMode="tel"
            />
          </div>
          {erros.telefone && <p className="text-xs text-destructive">{erros.telefone}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cpfCnpj">
            CPF / CNPJ
            <span className="text-muted-foreground text-xs ml-1.5 font-normal">(opcional)</span>
          </Label>
          <Input
            id="cpfCnpj"
            value={form.cpfCnpj}
            onChange={(e) => set("cpfCnpj", e.target.value)}
            placeholder="000.000.000-00 ou 00.000.000/0001-00"
          />
        </div>
      </div>
    </div>
  );
}

function CamposEmprestimo({
  form,
  erros,
  set,
}: {
  form: FormBase;
  erros: Record<string, string>;
  set: (k: keyof FormBase, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b">
        <DollarSign className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Empréstimo</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="valorCredito">Valor do Crédito <span className="text-destructive">*</span></Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">R$</span>
            <Input
              id="valorCredito"
              value={form.valorCredito}
              onChange={(e) => set("valorCredito", formatarMoeda(e.target.value))}
              placeholder="0,00"
              className={`pl-9 ${erros.valorCredito ? "border-destructive" : ""}`}
              inputMode="numeric"
            />
          </div>
          {erros.valorCredito && <p className="text-xs text-destructive">{erros.valorCredito}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Prazo <span className="text-destructive">*</span></Label>
          <Select value={form.prazo} onValueChange={(v) => set("prazo", v)}>
            <SelectTrigger>
              <Calendar className="h-4 w-4 text-muted-foreground mr-1 flex-shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRAZOS.map((p) => (
                <SelectItem key={p} value={String(p)}>{p} meses</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="taxaJuros">Taxa de Juros (% a.m.) <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="taxaJuros"
              value={form.taxaJuros}
              onChange={(e) => set("taxaJuros", e.target.value.replace(",", "."))}
              placeholder="Ex: 1.89"
              className={`pl-9 ${erros.taxaJuros ? "border-destructive" : ""}`}
              inputMode="decimal"
            />
          </div>
          {erros.taxaJuros && <p className="text-xs text-destructive">{erros.taxaJuros}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Banco <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <Select value={form.banco} onValueChange={(v) => set("banco", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {BANCOS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Linha de Crédito <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <Select value={form.linhaCredito} onValueChange={(v) => set("linhaCredito", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {LINHAS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─── Cenário A: COM Imposto ───────────────────────────────────────────────────

function CenarioComImposto() {
  const [form, setForm] = useState<FormComImposto>({
    ...formBaseInicial,
    valorFiscal: "",
    pctImposto: "",
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const setBase = useCallback((k: keyof FormBase, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setErros((prev) => ({ ...prev, [k]: "" }));
  }, []);

  const setExtra = (k: "valorFiscal" | "pctImposto", v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Obrigatório";
    if (!form.empresa.trim()) e.empresa = "Obrigatório";
    if (!form.telefone.trim()) e.telefone = "Obrigatório";
    else if (form.telefone.replace(/\D/g, "").length < 10) e.telefone = "Telefone inválido";
    if (!form.valorCredito) e.valorCredito = "Obrigatório";
    if (!form.taxaJuros) e.taxaJuros = "Obrigatório";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function handleCalcular() {
    if (!validar()) return;
    const vc = parseBRL(form.valorCredito);
    const prazo = parseInt(form.prazo);
    const taxa = parseFloat(form.taxaJuros);
    const vf = parseBRL(form.valorFiscal);
    const pi = parseFloat(form.pctImposto) || 0;
    const pc = parseFloat(form.comissao) || 0;
    setResultado(calcular(vc, prazo, taxa, vf, pi, pc));
    setSalvo(false);
  }

  async function handleSalvar() {
    if (!resultado) return;
    setSalvando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("simulacoes_colaborador").insert({
        colaborador_id: user?.id,
        cliente_nome: form.nome,
        cliente_empresa: form.empresa,
        cliente_telefone: form.telefone,
        cliente_cpf_cnpj: form.cpfCnpj || null,
        valor_credito: parseBRL(form.valorCredito),
        prazo_meses: parseInt(form.prazo),
        taxa_juros_mensal: parseFloat(form.taxaJuros),
        valor_fiscal: parseBRL(form.valorFiscal) || null,
        pct_imposto: parseFloat(form.pctImposto) || null,
        imposto_valor: resultado.impostoValor || null,
        pct_comissao: parseFloat(form.comissao) || null,
        comissao_valor: resultado.comissaoValor,
        parcela_mensal: resultado.parcelaMensal,
        total_emprestimo: resultado.totalEmprestimo,
        total_juros: resultado.totalJuros,
        custo_total: resultado.custoTotalOperacao,
        cet_mensal: resultado.cetMensal,
        cet_anual: resultado.cetAnual,
        banco: form.banco || null,
        linha_credito: form.linhaCredito || null,
        observacoes: form.observacoes || null,
        cenario: "com_imposto",
      });
      setSalvo(true);
    } catch (err) {
      console.error(err);
    }
    setSalvando(false);
  }

  function handleLimpar() {
    setForm({ ...formBaseInicial, valorFiscal: "", pctImposto: "" });
    setResultado(null);
    setSalvo(false);
    setErros({});
  }

  const valorFiscalNum = parseBRL(form.valorFiscal);
  const pctImpostoNum = parseFloat(form.pctImposto) || 0;
  const impostoPreview = valorFiscalNum > 0 && pctImpostoNum > 0
    ? (valorFiscalNum * pctImpostoNum) / 100
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Formulário */}
      <div className="space-y-6">
        <CamposCliente form={form} erros={erros} set={setBase} />
        <CamposEmprestimo form={form} erros={erros} set={setBase} />

        {/* Bloco fiscal */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Declaração Fiscal e Imposto
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            <Info className="h-3.5 w-3.5 inline mr-1" />
            O imposto é calculado sobre o <strong>valor fiscal declarado</strong> pelo cliente
            (faturamento anual informado para obtenção do crédito).
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="valorFiscal">
                Valor Fiscal Declarado
                <span className="text-muted-foreground text-xs ml-1 font-normal">(faturamento)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">R$</span>
                <Input
                  id="valorFiscal"
                  value={form.valorFiscal}
                  onChange={(e) => setExtra("valorFiscal", formatarMoeda(e.target.value))}
                  placeholder="0,00"
                  className="pl-9"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pctImposto">Alíquota do Imposto (%)</Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pctImposto"
                  value={form.pctImposto}
                  onChange={(e) => setExtra("pctImposto", e.target.value.replace(",", "."))}
                  placeholder="Ex: 6.00"
                  className="pl-9"
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>

          {/* Preview do imposto em tempo real */}
          {impostoPreview !== null && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">
                Imposto ({pctImpostoNum}% de {fmtBRL.format(valorFiscalNum)})
              </span>
              <span className="font-bold text-red-700 text-lg">{fmtBRL.format(impostoPreview)}</span>
            </div>
          )}
        </div>

        {/* Comissão */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b">
            <Percent className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comissão Destrava</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comissao-a">
              Comissão (% sobre o valor do crédito)
              <span className="text-muted-foreground text-xs ml-1 font-normal">(opcional)</span>
            </Label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="comissao-a"
                value={form.comissao}
                onChange={(e) => setBase("comissao", e.target.value.replace(",", "."))}
                placeholder="Ex: 2.50"
                className="pl-9"
                inputMode="decimal"
              />
            </div>
            {form.comissao && parseBRL(form.valorCredito) > 0 && (
              <p className="text-xs text-orange-600 font-medium">
                = {fmtBRL.format((parseBRL(form.valorCredito) * parseFloat(form.comissao)) / 100)} sobre o crédito
              </p>
            )}
          </div>
        </div>

        {/* Observações */}
        <div className="space-y-1.5">
          <Label>Observações <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <textarea
            value={form.observacoes}
            onChange={(e) => setBase("observacoes", e.target.value)}
            placeholder="Carência, garantias, condições especiais..."
            className="w-full min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-3">
          <Button onClick={handleCalcular} className="flex-1 font-bold h-12 text-base">
            <Calculator className="mr-2 h-5 w-5" />
            Calcular
          </Button>
          <Button variant="outline" onClick={handleLimpar} className="h-12 px-4" title="Limpar">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resultado */}
      <div>
        {resultado ? (
          <Card className="border-0 shadow-lg sticky top-6">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Resultado — {form.nome}
                <Badge className="ml-auto bg-blue-600 text-white text-xs">Cenário A · Com Imposto</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <PainelResultado
                resultado={resultado}
                comImposto={true}
                valorFiscalNum={valorFiscalNum}
                pctImpostoNum={pctImpostoNum}
                prazo={parseInt(form.prazo)}
              />
              <div className="flex gap-2 mt-5">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleSalvar} disabled={salvando || salvo}>
                  {salvo
                    ? <><CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />Salvo!</>
                    : <><Save className="mr-1.5 h-4 w-4" />{salvando ? "Salvando..." : "Salvar"}</>
                  }
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => window.print()}>
                  <Printer className="mr-1.5 h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center text-muted-foreground border-2 border-dashed rounded-2xl p-8">
            <Calculator className="h-14 w-14 mb-3 opacity-20" />
            <p className="font-medium">Preencha os dados e clique em Calcular</p>
            <p className="text-sm mt-1 opacity-60">O resultado aparecerá aqui</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cenário B: SEM Imposto ───────────────────────────────────────────────────

function CenarioSemImposto() {
  const [form, setForm] = useState<FormBase>({ ...formBaseInicial });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const set = useCallback((k: keyof FormBase, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setErros((prev) => ({ ...prev, [k]: "" }));
  }, []);

  function validar(): boolean {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Obrigatório";
    if (!form.empresa.trim()) e.empresa = "Obrigatório";
    if (!form.telefone.trim()) e.telefone = "Obrigatório";
    else if (form.telefone.replace(/\D/g, "").length < 10) e.telefone = "Telefone inválido";
    if (!form.valorCredito) e.valorCredito = "Obrigatório";
    if (!form.taxaJuros) e.taxaJuros = "Obrigatório";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function handleCalcular() {
    if (!validar()) return;
    const vc = parseBRL(form.valorCredito);
    const prazo = parseInt(form.prazo);
    const taxa = parseFloat(form.taxaJuros);
    const pc = parseFloat(form.comissao) || 0;
    setResultado(calcular(vc, prazo, taxa, 0, 0, pc));
    setSalvo(false);
  }

  async function handleSalvar() {
    if (!resultado) return;
    setSalvando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("simulacoes_colaborador").insert({
        colaborador_id: user?.id,
        cliente_nome: form.nome,
        cliente_empresa: form.empresa,
        cliente_telefone: form.telefone,
        cliente_cpf_cnpj: form.cpfCnpj || null,
        valor_credito: parseBRL(form.valorCredito),
        prazo_meses: parseInt(form.prazo),
        taxa_juros_mensal: parseFloat(form.taxaJuros),
        pct_comissao: parseFloat(form.comissao) || null,
        comissao_valor: resultado.comissaoValor,
        parcela_mensal: resultado.parcelaMensal,
        total_emprestimo: resultado.totalEmprestimo,
        total_juros: resultado.totalJuros,
        custo_total: resultado.custoTotalOperacao,
        cet_mensal: resultado.cetMensal,
        cet_anual: resultado.cetAnual,
        banco: form.banco || null,
        linha_credito: form.linhaCredito || null,
        observacoes: form.observacoes || null,
        cenario: "sem_imposto",
      });
      setSalvo(true);
    } catch (err) {
      console.error(err);
    }
    setSalvando(false);
  }

  function handleLimpar() {
    setForm({ ...formBaseInicial });
    setResultado(null);
    setSalvo(false);
    setErros({});
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Formulário */}
      <div className="space-y-6">
        <CamposCliente form={form} erros={erros} set={set} />
        <CamposEmprestimo form={form} erros={erros} set={set} />

        {/* Comissão */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b">
            <Percent className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comissão Destrava</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comissao-b">
              Comissão (% sobre o valor do crédito)
              <span className="text-muted-foreground text-xs ml-1 font-normal">(opcional)</span>
            </Label>
            <div className="relative">
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="comissao-b"
                value={form.comissao}
                onChange={(e) => set("comissao", e.target.value.replace(",", "."))}
                placeholder="Ex: 2.50"
                className="pl-9"
                inputMode="decimal"
              />
            </div>
            {form.comissao && parseBRL(form.valorCredito) > 0 && (
              <p className="text-xs text-orange-600 font-medium">
                = {fmtBRL.format((parseBRL(form.valorCredito) * parseFloat(form.comissao)) / 100)} sobre o crédito
              </p>
            )}
          </div>
        </div>

        {/* Observações */}
        <div className="space-y-1.5">
          <Label>Observações <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
          <textarea
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Carência, garantias, condições especiais..."
            className="w-full min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-3">
          <Button onClick={handleCalcular} className="flex-1 font-bold h-12 text-base">
            <Calculator className="mr-2 h-5 w-5" />
            Calcular
          </Button>
          <Button variant="outline" onClick={handleLimpar} className="h-12 px-4" title="Limpar">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resultado */}
      <div>
        {resultado ? (
          <Card className="border-0 shadow-lg sticky top-6">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Resultado — {form.nome}
                <Badge variant="outline" className="ml-auto text-xs">Cenário B · Sem Imposto</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <PainelResultado
                resultado={resultado}
                comImposto={false}
                valorFiscalNum={0}
                pctImpostoNum={0}
                prazo={parseInt(form.prazo)}
              />
              <div className="flex gap-2 mt-5">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleSalvar} disabled={salvando || salvo}>
                  {salvo
                    ? <><CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />Salvo!</>
                    : <><Save className="mr-1.5 h-4 w-4" />{salvando ? "Salvando..." : "Salvar"}</>
                  }
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => window.print()}>
                  <Printer className="mr-1.5 h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[320px] text-center text-muted-foreground border-2 border-dashed rounded-2xl p-8">
            <Calculator className="h-14 w-14 mb-3 opacity-20" />
            <p className="font-medium">Preencha os dados e clique em Calcular</p>
            <p className="text-sm mt-1 opacity-60">O resultado aparecerá aqui</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CalculadoraPage() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Calculadora de Crédito</h1>
            <p className="text-muted-foreground text-sm">
              Área exclusiva para colaboradores — simule propostas de crédito para clientes
            </p>
          </div>
        </div>

        {/* Aviso */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Uso interno.</strong> Os valores são calculados com base nos dados inseridos manualmente.
            Confirme sempre taxas e condições com o banco antes de apresentar ao cliente.
          </span>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="com-imposto">
          <TabsList className="grid grid-cols-2 w-full max-w-lg h-12">
            <TabsTrigger value="com-imposto" className="text-sm font-medium gap-2">
              <FileText className="h-4 w-4" />
              Cenário A — Com Imposto
            </TabsTrigger>
            <TabsTrigger value="sem-imposto" className="text-sm font-medium gap-2">
              <Calculator className="h-4 w-4" />
              Cenário B — Sem Imposto
            </TabsTrigger>
          </TabsList>

          <div className="mt-2 mb-5">
            <TabsContent value="com-imposto">
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <strong>Cenário A:</strong> Inclui imposto calculado sobre o valor fiscal declarado pelo cliente
                (faturamento anual exigido para obtenção do crédito). Gera o custo total real da operação.
              </p>
            </TabsContent>
            <TabsContent value="sem-imposto">
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <strong>Cenário B:</strong> Simulação sem incidência de imposto. Ideal para apresentar ao cliente
                o custo base do empréstimo (parcela + comissão) sem os encargos fiscais.
              </p>
            </TabsContent>
          </div>

          <TabsContent value="com-imposto">
            <CenarioComImposto />
          </TabsContent>
          <TabsContent value="sem-imposto">
            <CenarioSemImposto />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
