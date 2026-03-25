import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calculator,
  Save,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Percent,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Printer,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Parametros {
  // Cliente
  clienteNome: string;
  clienteCpfCnpj: string;
  clienteTelefone: string;
  clienteEmail: string;
  // Empréstimo
  valorSolicitado: string;
  quantidadeParcelas: string;
  taxaJurosMensal: string;   // % ao mês
  impostoPercentual: string; // IOF ou outro imposto
  comissaoPercentual: string; // comissão Destrava
  // Metadados
  banco: string;
  linhaCredito: string;
  observacoes: string;
}

interface Resultado {
  valorParcela: number;
  totalJuros: number;
  totalImposto: number;
  totalComissao: number;
  custoEfetivoTotal: number; // CET % ao mês
  custoEfetivoAnual: number; // CET % ao ano
  valorTotalPagar: number;
  tabelaAmortizacao: ParcelaAmortizacao[];
}

interface ParcelaAmortizacao {
  numero: number;
  saldoDevedor: number;
  amortizacao: number;
  juros: number;
  parcela: number;
}

const BANCOS = [
  "CAIXA Econômica Federal",
  "Banco do Brasil",
  "Bradesco",
  "Itaú",
  "Santander",
  "Sicoob",
  "Sicredi",
  "BNB",
  "BNDES",
  "Nubank",
  "Outro",
];

const LINHAS_CREDITO = [
  "PRONAMPE",
  "Giro CAIXA Fácil",
  "Capital de Giro",
  "PRONAMP",
  "Crédito Pessoal",
  "Consignado",
  "Financiamento Imobiliário",
  "Financiamento de Veículo",
  "Financiamento de Equipamentos",
  "Crédito Estruturado",
  "Outra",
];

// ─── Funções de cálculo ───────────────────────────────────────────────────────

function calcularSimulacao(p: Parametros): Resultado | null {
  const valor = parseFloat(p.valorSolicitado.replace(/\./g, "").replace(",", "."));
  const parcelas = parseInt(p.quantidadeParcelas);
  const taxa = parseFloat(p.taxaJurosMensal.replace(",", ".")) / 100;
  const imposto = parseFloat(p.impostoPercentual.replace(",", ".") || "0") / 100;
  const comissao = parseFloat(p.comissaoPercentual.replace(",", ".") || "0") / 100;

  if (!valor || !parcelas || isNaN(taxa) || valor <= 0 || parcelas <= 0) return null;

  // Valor com imposto incluído na base
  const valorComImposto = valor * (1 + imposto);

  // Cálculo da parcela pelo sistema Price (juros compostos)
  let valorParcela: number;
  if (taxa === 0) {
    valorParcela = valorComImposto / parcelas;
  } else {
    valorParcela = (valorComImposto * taxa * Math.pow(1 + taxa, parcelas)) /
      (Math.pow(1 + taxa, parcelas) - 1);
  }

  // Totais
  const totalPagar = valorParcela * parcelas;
  const totalJuros = totalPagar - valorComImposto;
  const totalImposto = valor * imposto;
  const totalComissao = valor * comissao;
  const valorTotalPagar = totalPagar + totalComissao;

  // CET (Custo Efetivo Total) — inclui comissão
  // Calculado como a taxa que iguala o valor líquido recebido ao fluxo de pagamentos
  const valorLiquido = valor - totalComissao;
  let cetMensal = taxa;
  if (totalComissao > 0 && valorLiquido > 0) {
    // Newton-Raphson para calcular CET
    let r = taxa;
    for (let i = 0; i < 100; i++) {
      const f = (r === 0)
        ? valorParcela * parcelas - valorLiquido
        : valorParcela * (1 - Math.pow(1 + r, -parcelas)) / r - valorLiquido;
      const df = (r === 0)
        ? -parcelas * valorParcela
        : valorParcela * (
          (1 - Math.pow(1 + r, -parcelas)) / (r * r) -
          parcelas * Math.pow(1 + r, -parcelas - 1) / r
        );
      const rNew = r - f / df;
      if (Math.abs(rNew - r) < 1e-10) { r = rNew; break; }
      r = rNew;
    }
    cetMensal = r;
  }
  const cetAnual = (Math.pow(1 + cetMensal, 12) - 1) * 100;

  // Tabela de amortização (Price)
  const tabela: ParcelaAmortizacao[] = [];
  let saldo = valorComImposto;
  for (let i = 1; i <= Math.min(parcelas, 360); i++) {
    const juros = saldo * taxa;
    const amortizacao = valorParcela - juros;
    saldo = Math.max(0, saldo - amortizacao);
    tabela.push({
      numero: i,
      saldoDevedor: saldo,
      amortizacao,
      juros,
      parcela: valorParcela,
    });
  }

  return {
    valorParcela,
    totalJuros,
    totalImposto,
    totalComissao,
    custoEfetivoTotal: cetMensal * 100,
    custoEfetivoAnual: cetAnual,
    valorTotalPagar,
    tabelaAmortizacao: tabela,
  };
}

// ─── Formatadores ─────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${v.toFixed(4).replace(".", ",")}%`;
const fmtMoeda = (v: number) => fmt.format(v);

function formatarMoedaInput(valor: string): string {
  const nums = valor.replace(/\D/g, "");
  if (!nums) return "";
  const num = parseInt(nums) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Calculadora() {
  const { user, colaborador } = useAuth();

  const [params, setParams] = useState<Parametros>({
    clienteNome: "",
    clienteCpfCnpj: "",
    clienteTelefone: "",
    clienteEmail: "",
    valorSolicitado: "",
    quantidadeParcelas: "12",
    taxaJurosMensal: "",
    impostoPercentual: "0",
    comissaoPercentual: "0",
    banco: "",
    linhaCredito: "",
    observacoes: "",
  });

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [mostrarTabela, setMostrarTabela] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvoId, setSalvoId] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState("");

  const set = (field: keyof Parametros, value: string) =>
    setParams((prev) => ({ ...prev, [field]: value }));

  const calcular = useCallback(() => {
    const r = calcularSimulacao(params);
    setResultado(r);
    setSalvoId(null);
    setErroSalvar("");
  }, [params]);

  const limpar = () => {
    setParams({
      clienteNome: "", clienteCpfCnpj: "", clienteTelefone: "", clienteEmail: "",
      valorSolicitado: "", quantidadeParcelas: "12", taxaJurosMensal: "",
      impostoPercentual: "0", comissaoPercentual: "0",
      banco: "", linhaCredito: "", observacoes: "",
    });
    setResultado(null);
    setSalvoId(null);
    setErroSalvar("");
  };

  const salvar = async () => {
    if (!resultado || !user) return;
    setSalvando(true);
    setErroSalvar("");

    const valor = parseFloat(params.valorSolicitado.replace(/\./g, "").replace(",", "."));

    const { data, error } = await supabase
      .from("simulacoes_colaborador")
      .insert({
        colaborador_id: user.id,
        cliente_nome: params.clienteNome,
        cliente_cpf_cnpj: params.clienteCpfCnpj,
        cliente_telefone: params.clienteTelefone || null,
        cliente_email: params.clienteEmail || null,
        valor_solicitado: valor,
        quantidade_parcelas: parseInt(params.quantidadeParcelas),
        taxa_juros_mensal: parseFloat(params.taxaJurosMensal.replace(",", ".")),
        imposto_percentual: parseFloat(params.impostoPercentual.replace(",", ".") || "0"),
        comissao_percentual: parseFloat(params.comissaoPercentual.replace(",", ".") || "0"),
        valor_parcela: resultado.valorParcela,
        total_juros: resultado.totalJuros,
        total_imposto: resultado.totalImposto,
        total_comissao: resultado.totalComissao,
        custo_efetivo_total: resultado.custoEfetivoTotal,
        valor_total_pagar: resultado.valorTotalPagar,
        banco: params.banco || null,
        linha_credito: params.linhaCredito || null,
        observacoes: params.observacoes || null,
        status: "rascunho",
      })
      .select("id")
      .single();

    setSalvando(false);
    if (error) {
      setErroSalvar("Erro ao salvar: " + error.message);
    } else {
      setSalvoId(data?.id ?? null);
    }
  };

  const imprimirResultado = () => window.print();

  const valorNumerico = parseFloat(
    params.valorSolicitado.replace(/\./g, "").replace(",", ".") || "0"
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Calculadora de Empréstimos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Simule e calcule propostas de crédito com todos os custos incluídos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={limpar}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Limpar
          </Button>
          {resultado && (
            <Button variant="outline" size="sm" onClick={imprimirResultado}>
              <Printer className="h-4 w-4 mr-1" />
              Imprimir
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── FORMULÁRIO DE ENTRADA ── */}
        <div className="space-y-4">

          {/* Dados do Cliente */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="clienteNome">Nome / Razão Social *</Label>
                  <Input
                    id="clienteNome"
                    value={params.clienteNome}
                    onChange={(e) => set("clienteNome", e.target.value)}
                    placeholder="Nome completo ou razão social"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clienteCpfCnpj">CPF / CNPJ *</Label>
                  <Input
                    id="clienteCpfCnpj"
                    value={params.clienteCpfCnpj}
                    onChange={(e) => set("clienteCpfCnpj", e.target.value)}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clienteTelefone">Telefone</Label>
                  <Input
                    id="clienteTelefone"
                    value={params.clienteTelefone}
                    onChange={(e) => set("clienteTelefone", e.target.value)}
                    placeholder="(61) 9 9999-9999"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="clienteEmail">E-mail</Label>
                  <Input
                    id="clienteEmail"
                    type="email"
                    value={params.clienteEmail}
                    onChange={(e) => set("clienteEmail", e.target.value)}
                    placeholder="cliente@email.com"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parâmetros do Empréstimo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Parâmetros do Empréstimo
              </CardTitle>
              <CardDescription>
                Insira os valores manualmente conforme a proposta do banco
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Valor solicitado */}
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="valorSolicitado">Valor Solicitado (R$) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">R$</span>
                    <Input
                      id="valorSolicitado"
                      value={params.valorSolicitado}
                      onChange={(e) => {
                        const formatted = formatarMoedaInput(e.target.value);
                        set("valorSolicitado", formatted);
                      }}
                      placeholder="0,00"
                      className="pl-10 text-right font-mono"
                    />
                  </div>
                </div>

                {/* Parcelas */}
                <div className="space-y-1.5">
                  <Label htmlFor="quantidadeParcelas">Nº de Parcelas *</Label>
                  <Input
                    id="quantidadeParcelas"
                    type="number"
                    min={1}
                    max={360}
                    value={params.quantidadeParcelas}
                    onChange={(e) => set("quantidadeParcelas", e.target.value)}
                    placeholder="12"
                    className="font-mono"
                  />
                </div>

                {/* Taxa de juros */}
                <div className="space-y-1.5">
                  <Label htmlFor="taxaJurosMensal">
                    Taxa de Juros (% a.m.) *
                  </Label>
                  <div className="relative">
                    <Input
                      id="taxaJurosMensal"
                      value={params.taxaJurosMensal}
                      onChange={(e) => set("taxaJurosMensal", e.target.value)}
                      placeholder="2,99"
                      className="pr-8 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                </div>

                {/* Imposto */}
                <div className="space-y-1.5">
                  <Label htmlFor="impostoPercentual">
                    Imposto / IOF (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="impostoPercentual"
                      value={params.impostoPercentual}
                      onChange={(e) => set("impostoPercentual", e.target.value)}
                      placeholder="0,38"
                      className="pr-8 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">IOF, TAC ou outros impostos sobre o valor</p>
                </div>

                {/* Comissão */}
                <div className="space-y-1.5">
                  <Label htmlFor="comissaoPercentual">
                    Comissão Destrava (%)
                  </Label>
                  <div className="relative">
                    <Input
                      id="comissaoPercentual"
                      value={params.comissaoPercentual}
                      onChange={(e) => set("comissaoPercentual", e.target.value)}
                      placeholder="2,00"
                      className="pr-8 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Honorários da assessoria (não incluído nas parcelas)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metadados */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Banco e Linha de Crédito
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Banco</Label>
                  <Select value={params.banco} onValueChange={(v) => set("banco", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {BANCOS.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Linha de Crédito</Label>
                  <Select value={params.linhaCredito} onValueChange={(v) => set("linhaCredito", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {LINHAS_CREDITO.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={params.observacoes}
                    onChange={(e) => set("observacoes", e.target.value)}
                    placeholder="Condições especiais, garantias, prazo de carência..."
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            size="lg"
            className="w-full font-bold text-base"
            onClick={calcular}
            disabled={!params.valorSolicitado || !params.taxaJurosMensal || !params.quantidadeParcelas}
          >
            <Calculator className="mr-2 h-5 w-5" />
            Calcular Simulação
          </Button>
        </div>

        {/* ── RESULTADO ── */}
        <div className="space-y-4">
          {!resultado ? (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <CardContent className="text-center py-12">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-4">
                  <Calculator className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Aguardando Cálculo</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Preencha os parâmetros ao lado e clique em "Calcular Simulação" para ver os resultados.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Card principal de resultado */}
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Resultado da Simulação
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      Sistema Price
                    </Badge>
                  </div>
                  {params.clienteNome && (
                    <CardDescription className="font-medium text-foreground">
                      {params.clienteNome} — {params.clienteCpfCnpj}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Parcela em destaque */}
                  <div className="bg-primary text-white rounded-xl p-5 text-center">
                    <p className="text-sm font-medium text-white/80 mb-1">Valor da Parcela Mensal</p>
                    <p className="text-4xl font-bold tracking-tight">
                      {fmtMoeda(resultado.valorParcela)}
                    </p>
                    <p className="text-sm text-white/70 mt-1">
                      {params.quantidadeParcelas}x de {fmtMoeda(resultado.valorParcela)}
                    </p>
                  </div>

                  {/* Detalhamento */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground">Valor Solicitado</span>
                      <span className="font-semibold">{fmtMoeda(valorNumerico)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground">Total de Juros</span>
                      <span className="font-semibold text-orange-600">{fmtMoeda(resultado.totalJuros)}</span>
                    </div>
                    {resultado.totalImposto > 0 && (
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-muted-foreground">
                          Imposto / IOF ({params.impostoPercentual}%)
                        </span>
                        <span className="font-semibold text-orange-600">{fmtMoeda(resultado.totalImposto)}</span>
                      </div>
                    )}
                    {resultado.totalComissao > 0 && (
                      <div className="flex justify-between items-center py-2 border-b">
                        <span className="text-sm text-muted-foreground">
                          Comissão Destrava ({params.comissaoPercentual}%)
                        </span>
                        <span className="font-semibold text-blue-600">{fmtMoeda(resultado.totalComissao)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm font-semibold">Total a Pagar</span>
                      <span className="font-bold text-lg">{fmtMoeda(resultado.valorTotalPagar)}</span>
                    </div>
                  </div>

                  {/* CET */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">CET Mensal</p>
                      <p className="text-lg font-bold text-primary">
                        {fmtPct(resultado.custoEfetivoTotal)}
                      </p>
                    </div>
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">CET Anual</p>
                      <p className="text-lg font-bold text-primary">
                        {resultado.custoEfetivoAnual.toFixed(2).replace(".", ",")}%
                      </p>
                    </div>
                  </div>

                  {/* Banco e linha */}
                  {(params.banco || params.linhaCredito) && (
                    <div className="flex flex-wrap gap-2">
                      {params.banco && <Badge variant="secondary">{params.banco}</Badge>}
                      {params.linhaCredito && <Badge variant="outline">{params.linhaCredito}</Badge>}
                    </div>
                  )}

                  <Separator />

                  {/* Botão salvar */}
                  {salvoId ? (
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium justify-center py-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Simulação salva com sucesso!
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={salvar}
                      disabled={salvando || !params.clienteNome || !params.clienteCpfCnpj}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {salvando ? "Salvando..." : "Salvar Simulação"}
                    </Button>
                  )}
                  {erroSalvar && (
                    <p className="text-xs text-destructive text-center">{erroSalvar}</p>
                  )}
                  {!params.clienteNome && (
                    <p className="text-xs text-muted-foreground text-center">
                      Preencha nome e CPF/CNPJ do cliente para salvar
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Tabela de amortização */}
              <Card>
                <CardHeader className="pb-3">
                  <button
                    className="flex items-center justify-between w-full text-left"
                    onClick={() => setMostrarTabela(!mostrarTabela)}
                  >
                    <CardTitle className="text-base">
                      Tabela de Amortização (Price)
                    </CardTitle>
                    {mostrarTabela ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </CardHeader>
                {mostrarTabela && (
                  <CardContent className="p-0">
                    <div className="max-h-80 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-center w-12">#</TableHead>
                            <TableHead className="text-right">Parcela</TableHead>
                            <TableHead className="text-right">Amortização</TableHead>
                            <TableHead className="text-right">Juros</TableHead>
                            <TableHead className="text-right">Saldo Dev.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resultado.tabelaAmortizacao.map((row) => (
                            <TableRow key={row.numero} className="text-xs">
                              <TableCell className="text-center font-mono text-muted-foreground">
                                {row.numero}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                {fmtMoeda(row.parcela)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {fmtMoeda(row.amortizacao)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-orange-600">
                                {fmtMoeda(row.juros)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                {fmtMoeda(row.saldoDevedor)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
