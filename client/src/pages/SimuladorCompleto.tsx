import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  creditProducts,
  calculateInstallment,
  calculateTotalInterest,
  generateAmortizationTable,
  checkEligibility,
  calculateRealMonthlyRate,
  type CreditProduct,
} from "@/data/creditProductsSimplified";
import { useState, useEffect } from "react";
import { maskCurrencyInput, unmaskCurrencyInput } from "@/lib/currency";
import {
  Calculator,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Info,
  DollarSign,
  Calendar,
  Percent,
  ArrowRight,
} from "lucide-react";

export default function SimuladorCompleto() {
  const [selectedProduct, setSelectedProduct] = useState<CreditProduct>(
    creditProducts[0]
  );
  const [loanAmount, setLoanAmount] = useState(35000);
  const [months, setMonths] = useState(24);
  const [interestRate, setInterestRate] = useState(3.5);
  const [annualRevenue, setAnnualRevenue] = useState(0);
  const [annualRevenueDisplay, setAnnualRevenueDisplay] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyIncomeDisplay, setMonthlyIncomeDisplay] = useState('');
  const [productCategory, setProductCategory] = useState<"empresa" | "pessoa-fisica">("empresa");
  const [companyAge, setCompanyAge] = useState(12);
  const [hasRestrictions, setHasRestrictions] = useState(false);
  const [showAmortization, setShowAmortization] = useState(false);

  // Atualizar limites quando produto mudar
  useEffect(() => {
    setLoanAmount(
      Math.min(
        Math.max(loanAmount, selectedProduct.minValue),
        selectedProduct.maxValue
      )
    );
    setMonths(
      Math.min(
        Math.max(months, selectedProduct.minMonths),
        selectedProduct.maxMonths
      )
    );
    const realRate = calculateRealMonthlyRate(selectedProduct);
    setInterestRate(realRate);
  }, [selectedProduct]);

  const installment = calculateInstallment(
    loanAmount,
    interestRate,
    months,
    selectedProduct.carenciaMonths
  );
  const totalInterest = calculateTotalInterest(
    loanAmount,
    interestRate,
    months,
    selectedProduct.carenciaMonths
  );
  const totalAmount = loanAmount + totalInterest;
  const amortizationTable = generateAmortizationTable(
    loanAmount,
    interestRate,
    months,
    selectedProduct.carenciaMonths
  );
  const eligibility = checkEligibility(
    selectedProduct,
    loanAmount,
    companyAge,
    hasRestrictions,
    annualRevenue
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-16">
        <div className="container">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <Calculator className="h-10 w-10" />
              <h1 className="text-4xl md:text-5xl font-bold">
                Simulador de Crédito
              </h1>
            </div>
            <p className="text-xl text-white/90">
              Compare e simule todos os produtos de crédito empresarial da CAIXA
              com a assessoria da Destrava Crédito
            </p>
          </div>
        </div>
      </section>

      {/* Simulador */}
      <section className="py-12">
        <div className="container">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Coluna 1: Seleção de Produto */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Escolha o Produto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => {
                      setProductCategory("empresa");
                      const firstEmpresa = creditProducts.find(p => p.category === "empresa");
                      if (firstEmpresa) setSelectedProduct(firstEmpresa);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      productCategory === "empresa"
                        ? "bg-[var(--color-caixa-blue)] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    Empresas
                  </button>
                  <button
                    onClick={() => {
                      setProductCategory("pessoa-fisica");
                      const firstPF = creditProducts.find(p => p.category === "pessoa-fisica");
                      if (firstPF) setSelectedProduct(firstPF);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      productCategory === "pessoa-fisica"
                        ? "bg-[var(--color-caixa-blue)] text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    Pessoa Física
                  </button>
                </div>
                <div className="space-y-3">
                  {creditProducts
                    .filter((p) => p.category === productCategory)
                    .map((product) => (
                    <button
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        selectedProduct.id === product.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <h3 className="font-bold mb-1">{product.name}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {product.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Até R$ {(product.maxValue / 1000).toFixed(0)}k
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {product.rateType === "pos-fixada" ? product.rateFormula : `${product.minRate}% - ${product.maxRate}% a.m.`}
                        </Badge>
                        {product.carenciaMonths > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {product.carenciaMonths} meses carência
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Coluna 2: Parâmetros da Simulação */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Parâmetros da Simulação</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedProduct.name} - {selectedProduct.targetAudience}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Valor do Empréstimo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">
                      Valor Desejado
                    </Label>
                    <span className="text-2xl font-bold text-primary">
                      R$ {loanAmount.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <Slider
                    value={[loanAmount]}
                    onValueChange={([value]) => setLoanAmount(value)}
                    min={selectedProduct.minValue}
                    max={selectedProduct.maxValue}
                    step={1000}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      R$ {selectedProduct.minValue.toLocaleString("pt-BR")}
                    </span>
                    <span>
                      R$ {selectedProduct.maxValue.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>

                {/* Prazo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">
                      Prazo de Pagamento
                    </Label>
                    <span className="text-2xl font-bold text-primary">
                      {months} meses
                    </span>
                  </div>
                  <Slider
                    value={[months]}
                    onValueChange={([value]) => setMonths(value)}
                    min={selectedProduct.minMonths}
                    max={selectedProduct.maxMonths}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{selectedProduct.minMonths} meses</span>
                    <span>{selectedProduct.maxMonths} meses</span>
                  </div>
                </div>

                {/* Taxa de Juros */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">
                      Taxa de Juros (a.m.)
                    </Label>
                    <span className="text-2xl font-bold text-primary">
                      {interestRate.toFixed(2)}%
                    </span>
                  </div>
                  <Slider
                    value={[interestRate]}
                    onValueChange={([value]) => setInterestRate(value)}
                    min={selectedProduct.minRate}
                    max={selectedProduct.maxRate}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{selectedProduct.minRate}%</span>
                    <span>{selectedProduct.maxRate}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    * Taxa final depende da análise de crédito da CAIXA
                  </p>
                </div>

                {/* Dados Adicionais */}
                <div className="grid md:grid-cols-3 gap-4 pt-4 border-t">
                  {productCategory === "empresa" && (
                    <div className="space-y-2">
                      <Label htmlFor="annualRevenue">
                        Faturamento Anual (R$)
                      </Label>
                      <Input
                        id="annualRevenue"
                        type="text"
                        inputMode="numeric"
                        value={annualRevenueDisplay}
                        onChange={(e) => {
                          const formatted = maskCurrencyInput(e.target.value);
                          setAnnualRevenueDisplay(formatted);
                          setAnnualRevenue(unmaskCurrencyInput(formatted));
                        }}
                        placeholder="0,00"
                        autoComplete="off"
                        className="text-right font-mono tabular-nums"
                      />
                    </div>
                  )}
                  {productCategory === "pessoa-fisica" && (
                    <div className="space-y-2">
                      <Label htmlFor="monthlyIncome">
                        Renda Mensal (R$)
                      </Label>
                      <Input
                        id="monthlyIncome"
                        type="text"
                        inputMode="numeric"
                        value={monthlyIncomeDisplay}
                        onChange={(e) => {
                          const formatted = maskCurrencyInput(e.target.value);
                          setMonthlyIncomeDisplay(formatted);
                          setMonthlyIncome(unmaskCurrencyInput(formatted));
                        }}
                        placeholder="0,00"
                        autoComplete="off"
                        className="text-right font-mono tabular-nums"
                      />
                    </div>
                  )}
                  {productCategory === "empresa" && (
                    <div className="space-y-2">
                      <Label htmlFor="companyAge">
                        Tempo de Empresa (meses)
                      </Label>
                      <Input
                        id="companyAge"
                        type="number"
                        value={companyAge}
                        onChange={(e) =>
                          setCompanyAge(Number(e.target.value))
                        }
                        min={0}
                        max={240}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="restrictions">Situação Cadastral</Label>
                    <Select
                      value={hasRestrictions ? "com-restricoes" : "sem-restricoes"}
                      onValueChange={(value) =>
                        setHasRestrictions(value === "com-restricoes")
                      }
                    >
                      <SelectTrigger id="restrictions">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sem-restricoes">
                          Sem restrições
                        </SelectItem>
                        <SelectItem value="com-restricoes">
                          Com restrições
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resultado da Simulação */}
          <div className="grid lg:grid-cols-3 gap-8 mt-8">
            {/* Resumo Financeiro */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Resultado da Simulação</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6 mb-6">
                  <div className="text-center p-6 bg-primary/5 rounded-lg">
                    <DollarSign className="h-8 w-8 text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-1">
                      Valor da Parcela
                    </p>
                    <p className="text-3xl font-bold text-primary">
                      R$ {installment.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="text-center p-6 bg-muted/50 rounded-lg">
                    <Percent className="h-8 w-8 text-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-1">
                      Total de Juros
                    </p>
                    <p className="text-2xl font-bold">
                      R$ {totalInterest.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="text-center p-6 bg-muted/50 rounded-lg">
                    <Calendar className="h-8 w-8 text-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-1">
                      Valor Total
                    </p>
                    <p className="text-2xl font-bold">
                      R$ {totalAmount.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                {/* Tabela de Amortização */}
                <div className="space-y-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowAmortization(!showAmortization)}
                    className="w-full"
                  >
                    {showAmortization ? "Ocultar" : "Ver"} Tabela de Amortização
                  </Button>

                  {showAmortization && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="p-3 text-left">Mês</th>
                              <th className="p-3 text-right">Parcela</th>
                              <th className="p-3 text-right">Juros</th>
                              <th className="p-3 text-right">Amortização</th>
                              <th className="p-3 text-right">Saldo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {amortizationTable.map((row) => (
                              <tr
                                key={row.month}
                                className="border-t hover:bg-muted/50"
                              >
                                <td className="p-3">{row.month}</td>
                                <td className="p-3 text-right font-medium">
                                  R${" "}
                                  {row.installment.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="p-3 text-right text-red-600">
                                  R${" "}
                                  {row.interest.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="p-3 text-right text-green-600">
                                  R${" "}
                                  {row.amortization.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="p-3 text-right">
                                  R${" "}
                                  {row.balance.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Elegibilidade e Requisitos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {eligibility.eligible ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  Elegibilidade
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {eligibility.eligible ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800">
                      ✓ Você atende aos requisitos básicos!
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Análise final será feita pela CAIXA
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-medium text-red-800 mb-2">
                      ✗ Requisitos não atendidos:
                    </p>
                    <ul className="text-xs text-red-700 space-y-1">
                      {eligibility.reasons.map((reason, idx) => (
                        <li key={idx}>• {reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-3 pt-4 border-t">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Info className="h-4 w-4 text-primary" />
                    Requisitos
                  </h4>
                  <ul className="space-y-2 text-sm">
                    {selectedProduct.requirements.map((req, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <h4 className="font-semibold text-sm">Benefícios</h4>
                  <ul className="space-y-2 text-sm">
                    {selectedProduct.benefits.map((benefit, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <TrendingUp className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 space-y-3">
                  <a href="/simulacao">
                    <Button className="w-full font-semibold" size="lg">
                      Solicitar Proposta
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                  <a
                    href="https://wa.me/556135268355"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      variant="outline"
                      className="w-full font-semibold"
                      size="lg"
                    >
                      Falar com Assessor
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 p-6 bg-muted/30 border border-border rounded-lg">
            <p className="text-sm text-muted-foreground text-center">
              <strong>Importante:</strong> Esta é uma simulação estimada. Os
              valores, taxas e condições finais dependem da análise de crédito
              realizada pela CAIXA Econômica Federal. A Destrava Crédito atua
              como Correspondente / Assessoria e não realiza aprovação de
              crédito.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
