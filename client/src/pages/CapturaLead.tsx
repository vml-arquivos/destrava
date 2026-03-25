import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  CheckCircle2,
  Clock,
  Shield,
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Calculator,
  ArrowRight,
  Star,
  TrendingUp,
  FileText,
} from "lucide-react";
import { useState, FormEvent } from "react";
import { useLocation } from "wouter";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
};

const calculateInstallment = (principal: number, monthlyRate: number, months: number) => {
  if (monthlyRate === 0) return principal / months;
  const rate = monthlyRate / 100;
  return (principal * rate * Math.pow(1 + rate, months)) / (Math.pow(1 + rate, months) - 1);
};

export default function CapturaLead() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tipoCliente, setTipoCliente] = useState<"empresa" | "pessoa-fisica">("empresa");

  // Dados pessoais
  const [formData, setFormData] = useState({
    nome: "",
    documento: "",
    whatsapp: "",
    email: "",
    cep: "",
    endereco: "",
    cidade: "",
    estado: "",
    porte: "",
    faturamento: "",
    produto: "",
    finalidade: "",
    observacoes: "",
  });

  // Simulador
  const [valorEmprestimo, setValorEmprestimo] = useState(50000);
  const [prazoMeses, setPrazoMeses] = useState(24);
  const [taxaMensal, setTaxaMensal] = useState(2.5);

  const parcela = calculateInstallment(valorEmprestimo, taxaMensal, prazoMeses);
  const totalPago = parcela * prazoMeses;
  const totalJuros = totalPago - valorEmprestimo;

  const produtosEmpresa = [
    { value: "giro-caixa-facil", label: "Giro CAIXA Fácil (até R$ 70k)" },
    { value: "pronampe", label: "PRONAMPE (até R$ 150k)" },
    { value: "pronamp", label: "PRONAMP - Programa Nacional de Apoio ao Médio Produtor Rural" },
    { value: "credito-pj-pequeno", label: "Crédito PJ - Pequeno Porte" },
    { value: "credito-pj-medio", label: "Crédito PJ - Médio Porte" },
    { value: "credito-pj-grande", label: "Crédito PJ - Grande Porte" },
    { value: "capital-giro", label: "Capital de Giro Empresarial" },
    { value: "financiamento-equipamentos", label: "Financiamento de Equipamentos" },
    { value: "certificado-digital", label: "Certificado Digital" },
    { value: "rating-bb", label: "Consulta de Rating - Banco do Brasil" },
    { value: "spc-serasa-pj", label: "Consulta SPC/Serasa CNPJ" },
    { value: "limpa-nome-cnpj", label: "Limpeza de Nome CNPJ" },
    { value: "outro", label: "Outro" },
  ];

  const produtosPF = [
    { value: "credito-pessoal", label: "Crédito Pessoal" },
    { value: "consignado", label: "Crédito Consignado" },
    { value: "financiamento-imovel", label: "Financiamento Imobiliário" },
    { value: "financiamento-veiculo", label: "Financiamento de Veículo" },
    { value: "spc-serasa-cpf", label: "Consulta SPC/Serasa CPF" },
    { value: "limpa-nome-cpf", label: "Limpeza de Nome CPF" },
    { value: "outro", label: "Outro" },
  ];

  const handleChange = (field: string, value: string) => {
    let formatted = value;
    if (field === "documento") {
      formatted = tipoCliente === "empresa" ? formatCNPJ(value) : formatCPF(value);
    } else if (field === "whatsapp") {
      formatted = formatPhone(value);
    }
    setFormData((prev) => ({ ...prev, [field]: formatted }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      ...formData,
      tipoCliente,
      simulacao: {
        valorEmprestimo,
        prazoMeses,
        taxaMensal,
        parcelaEstimada: parcela,
        totalPago,
        totalJuros,
      },
      criadoEm: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setLocation("/sucesso");
      } else {
        // Fallback: redirecionar mesmo sem API
        setLocation("/sucesso");
      }
    } catch {
      // Fallback: redirecionar mesmo sem API
      setLocation("/sucesso");
    } finally {
      setLoading(false);
    }
  };

  const isStep1Valid =
    formData.nome.length >= 3 &&
    formData.whatsapp.length >= 14 &&
    formData.email.includes("@");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <SEO
        title="Simule seu Empréstimo Grátis"
        description="Simule seu empréstimo gratuitamente. Crédito para empresas e pessoa física. PRONAMPE, Giro CAIXA Fácil, Rating, Certificado Digital, SPC/Serasa e muito mais."
        keywords="simulador empréstimo, crédito empresarial, PRONAMPE, Giro CAIXA Fácil, limpa nome, SPC Serasa, certificado digital, rating banco do brasil"
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[var(--color-caixa-blue)] via-[var(--color-caixa-blue-dark)] to-[#001a4d] text-white py-12 md:py-16">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="bg-[var(--color-caixa-yellow)] text-black font-bold mb-4 text-sm px-4 py-1">
              100% Gratuito e Sem Compromisso
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
              Simule seu Empréstimo Agora
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-6 max-w-2xl mx-auto">
              Preencha seus dados, simule o valor e prazo ideal, e nossa equipe de especialistas entrará em contato com as melhores condições para você.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[var(--color-caixa-yellow)]" />
                <span>Análise Gratuita</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[var(--color-caixa-yellow)]" />
                <span>Retorno em 24h</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-[var(--color-caixa-yellow)]" />
                <span>Dados Protegidos</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-[var(--color-caixa-yellow)]" />
                <span>+500 Clientes Atendidos</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FORMULÁRIO PRINCIPAL */}
      <section className="py-10 md:py-16">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            {/* Indicador de passos */}
            <div className="flex items-center justify-center mb-8 gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                      step >= s
                        ? "bg-[var(--color-caixa-blue)] text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${step >= s ? "text-[var(--color-caixa-blue)]" : "text-gray-400"}`}>
                    {s === 1 ? "Seus Dados" : s === 2 ? "Simulação" : "Finalizar"}
                  </span>
                  {s < 3 && <div className={`w-8 md:w-16 h-1 rounded ${step > s ? "bg-[var(--color-caixa-blue)]" : "bg-gray-200"}`} />}
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-3 gap-6">
                {/* COLUNA ESQUERDA - FORMULÁRIO */}
                <div className="md:col-span-2 space-y-6">

                  {/* PASSO 1: DADOS PESSOAIS */}
                  {step === 1 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="h-5 w-5 text-[var(--color-caixa-blue)]" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">Seus Dados</h2>
                          <p className="text-sm text-gray-500">Informações de contato</p>
                        </div>
                      </div>

                      {/* Tipo de Cliente */}
                      <div className="mb-6">
                        <Label className="text-sm font-semibold text-gray-700 mb-3 block">Você é:</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setTipoCliente("empresa")}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                              tipoCliente === "empresa"
                                ? "border-[var(--color-caixa-blue)] bg-blue-50"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <Building2 className={`h-6 w-6 mb-2 ${tipoCliente === "empresa" ? "text-[var(--color-caixa-blue)]" : "text-gray-400"}`} />
                            <p className="font-semibold text-sm">Empresa / CNPJ</p>
                            <p className="text-xs text-gray-500">MEI, ME, EPP, Médio ou Grande Porte</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTipoCliente("pessoa-fisica")}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                              tipoCliente === "pessoa-fisica"
                                ? "border-[var(--color-caixa-blue)] bg-blue-50"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <User className={`h-6 w-6 mb-2 ${tipoCliente === "pessoa-fisica" ? "text-[var(--color-caixa-blue)]" : "text-gray-400"}`} />
                            <p className="font-semibold text-sm">Pessoa Física / CPF</p>
                            <p className="text-xs text-gray-500">Crédito pessoal, consignado, imóvel</p>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <Label htmlFor="nome" className="text-sm font-semibold">
                            {tipoCliente === "empresa" ? "Nome / Razão Social *" : "Nome Completo *"}
                          </Label>
                          <Input
                            id="nome"
                            value={formData.nome}
                            onChange={(e) => handleChange("nome", e.target.value)}
                            placeholder={tipoCliente === "empresa" ? "Ex: Empresa LTDA" : "Ex: João da Silva"}
                            className="mt-1"
                            required
                          />
                        </div>

                        <div>
                          <Label htmlFor="documento" className="text-sm font-semibold">
                            {tipoCliente === "empresa" ? "CNPJ *" : "CPF *"}
                          </Label>
                          <Input
                            id="documento"
                            value={formData.documento}
                            onChange={(e) => handleChange("documento", e.target.value)}
                            placeholder={tipoCliente === "empresa" ? "00.000.000/0000-00" : "000.000.000-00"}
                            className="mt-1"
                            required
                          />
                        </div>

                        <div>
                          <Label htmlFor="whatsapp" className="text-sm font-semibold">
                            WhatsApp *
                          </Label>
                          <div className="relative mt-1">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              id="whatsapp"
                              value={formData.whatsapp}
                              onChange={(e) => handleChange("whatsapp", e.target.value)}
                              placeholder="(61) 9 0000-0000"
                              className="pl-9"
                              required
                            />
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <Label htmlFor="email" className="text-sm font-semibold">
                            E-mail *
                          </Label>
                          <div className="relative mt-1">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              id="email"
                              type="email"
                              value={formData.email}
                              onChange={(e) => handleChange("email", e.target.value)}
                              placeholder="seu@email.com.br"
                              className="pl-9"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="cidade" className="text-sm font-semibold">
                            Cidade
                          </Label>
                          <div className="relative mt-1">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              id="cidade"
                              value={formData.cidade}
                              onChange={(e) => handleChange("cidade", e.target.value)}
                              placeholder="Ex: Brasília"
                              className="pl-9"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="estado" className="text-sm font-semibold">
                            Estado
                          </Label>
                          <Select onValueChange={(v) => handleChange("estado", v)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => (
                                <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {tipoCliente === "empresa" && (
                          <div className="md:col-span-2">
                            <Label htmlFor="porte" className="text-sm font-semibold">
                              Porte da Empresa
                            </Label>
                            <Select onValueChange={(v) => handleChange("porte", v)}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Selecione o porte..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mei">MEI - Microempreendedor Individual</SelectItem>
                                <SelectItem value="me">ME - Microempresa</SelectItem>
                                <SelectItem value="epp">EPP - Empresa de Pequeno Porte</SelectItem>
                                <SelectItem value="medio">Médio Porte</SelectItem>
                                <SelectItem value="grande">Grande Porte</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div className="md:col-span-2">
                          <Label htmlFor="produto" className="text-sm font-semibold">
                            O que você precisa? *
                          </Label>
                          <Select onValueChange={(v) => handleChange("produto", v)} required>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Selecione o produto/serviço..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(tipoCliente === "empresa" ? produtosEmpresa : produtosPF).map((p) => (
                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={!isStep1Valid}
                        className="w-full mt-6 bg-[var(--color-caixa-blue)] hover:bg-blue-700 text-white font-bold py-3 text-base"
                      >
                        Continuar para Simulação
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </div>
                  )}

                  {/* PASSO 2: SIMULADOR */}
                  {step === 2 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <Calculator className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">Simulação de Crédito</h2>
                          <p className="text-sm text-gray-500">Ajuste os valores para sua necessidade</p>
                        </div>
                      </div>

                      <div className="space-y-8">
                        {/* Valor do Empréstimo */}
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <Label className="text-sm font-semibold">Valor do Empréstimo</Label>
                            <span className="text-xl font-bold text-[var(--color-caixa-blue)]">
                              {formatCurrency(valorEmprestimo)}
                            </span>
                          </div>
                          <Slider
                            min={5000}
                            max={tipoCliente === "empresa" ? 5000000 : 500000}
                            step={5000}
                            value={[valorEmprestimo]}
                            onValueChange={([v]) => setValorEmprestimo(v)}
                            className="mb-2"
                          />
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>R$ 5.000</span>
                            <span>{tipoCliente === "empresa" ? "R$ 5.000.000" : "R$ 500.000"}</span>
                          </div>
                        </div>

                        {/* Prazo */}
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <Label className="text-sm font-semibold">Prazo de Pagamento</Label>
                            <span className="text-xl font-bold text-[var(--color-caixa-blue)]">
                              {prazoMeses} meses
                            </span>
                          </div>
                          <Slider
                            min={6}
                            max={120}
                            step={6}
                            value={[prazoMeses]}
                            onValueChange={([v]) => setPrazoMeses(v)}
                            className="mb-2"
                          />
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>6 meses</span>
                            <span>120 meses</span>
                          </div>
                        </div>

                        {/* Taxa */}
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <Label className="text-sm font-semibold">Taxa de Juros (estimativa)</Label>
                            <span className="text-xl font-bold text-[var(--color-caixa-blue)]">
                              {taxaMensal.toFixed(2)}% a.m.
                            </span>
                          </div>
                          <Slider
                            min={0.5}
                            max={8}
                            step={0.1}
                            value={[taxaMensal]}
                            onValueChange={([v]) => setTaxaMensal(v)}
                            className="mb-2"
                          />
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>0,5% a.m.</span>
                            <span>8% a.m.</span>
                          </div>
                        </div>

                        {/* Finalidade */}
                        <div>
                          <Label htmlFor="finalidade" className="text-sm font-semibold">
                            Finalidade do Crédito
                          </Label>
                          <Select onValueChange={(v) => handleChange("finalidade", v)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Para que você vai usar o crédito?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="capital-giro">Capital de Giro</SelectItem>
                              <SelectItem value="investimento">Investimento / Expansão</SelectItem>
                              <SelectItem value="equipamentos">Compra de Equipamentos</SelectItem>
                              <SelectItem value="reforma">Reforma / Obra</SelectItem>
                              <SelectItem value="pagamento-dividas">Pagamento de Dívidas</SelectItem>
                              <SelectItem value="imovel">Aquisição de Imóvel</SelectItem>
                              <SelectItem value="veiculo">Aquisição de Veículo</SelectItem>
                              <SelectItem value="outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="observacoes" className="text-sm font-semibold">
                            Observações (opcional)
                          </Label>
                          <Textarea
                            id="observacoes"
                            value={formData.observacoes}
                            onChange={(e) => handleChange("observacoes", e.target.value)}
                            placeholder="Conte mais sobre sua necessidade, situação atual, restrições, etc."
                            className="mt-1 resize-none"
                            rows={3}
                          />
                        </div>
                      </div>

                      <div className="flex gap-3 mt-6">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setStep(1)}
                          className="flex-1"
                        >
                          Voltar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setStep(3)}
                          className="flex-2 bg-[var(--color-caixa-blue)] hover:bg-blue-700 text-white font-bold"
                        >
                          Revisar e Enviar
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* PASSO 3: REVISÃO E ENVIO */}
                  {step === 3 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-yellow-600" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">Revisão dos Dados</h2>
                          <p className="text-sm text-gray-500">Confirme suas informações antes de enviar</p>
                        </div>
                      </div>

                      <div className="space-y-4 mb-6">
                        <div className="bg-gray-50 rounded-xl p-4">
                          <h3 className="font-semibold text-sm text-gray-500 mb-3">DADOS PESSOAIS</h3>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-gray-500">Nome:</span> <span className="font-medium">{formData.nome}</span></div>
                            <div><span className="text-gray-500">{tipoCliente === "empresa" ? "CNPJ:" : "CPF:"}</span> <span className="font-medium">{formData.documento}</span></div>
                            <div><span className="text-gray-500">WhatsApp:</span> <span className="font-medium">{formData.whatsapp}</span></div>
                            <div><span className="text-gray-500">E-mail:</span> <span className="font-medium">{formData.email}</span></div>
                            {formData.cidade && <div><span className="text-gray-500">Cidade:</span> <span className="font-medium">{formData.cidade}/{formData.estado}</span></div>}
                            {formData.produto && <div className="col-span-2"><span className="text-gray-500">Produto:</span> <span className="font-medium">{formData.produto}</span></div>}
                          </div>
                        </div>

                        <div className="bg-blue-50 rounded-xl p-4">
                          <h3 className="font-semibold text-sm text-gray-500 mb-3">SIMULAÇÃO</h3>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-gray-500">Valor:</span> <span className="font-bold text-[var(--color-caixa-blue)]">{formatCurrency(valorEmprestimo)}</span></div>
                            <div><span className="text-gray-500">Prazo:</span> <span className="font-medium">{prazoMeses} meses</span></div>
                            <div><span className="text-gray-500">Taxa Est.:</span> <span className="font-medium">{taxaMensal.toFixed(2)}% a.m.</span></div>
                            <div><span className="text-gray-500">Parcela Est.:</span> <span className="font-bold text-green-600">{formatCurrency(parcela)}</span></div>
                          </div>
                        </div>

                        <p className="text-xs text-gray-500 italic">
                          * Os valores da simulação são estimativas. As condições reais serão definidas após análise de crédito pela instituição financeira.
                        </p>
                      </div>

                      <div className="flex items-start gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
                        <input type="checkbox" id="lgpd" className="mt-1" required />
                        <label htmlFor="lgpd" className="text-xs text-gray-600">
                          Concordo com a <a href="/politica-privacidade" className="text-[var(--color-caixa-blue)] underline">Política de Privacidade</a> e autorizo o uso dos meus dados para contato e análise de crédito, conforme a LGPD (Lei 13.709/2018).
                        </label>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setStep(2)}
                          className="flex-1"
                        >
                          Voltar
                        </Button>
                        <Button
                          type="submit"
                          disabled={loading}
                          className="flex-2 bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold text-base py-3"
                        >
                          {loading ? "Enviando..." : "Enviar Simulação"}
                          {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* COLUNA DIREITA - RESULTADO DA SIMULAÇÃO */}
                <div className="space-y-4">
                  {/* Card de Resultado */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Calculator className="h-5 w-5 text-[var(--color-caixa-blue)]" />
                      Resultado da Simulação
                    </h3>

                    <div className="space-y-4">
                      <div className="bg-[var(--color-caixa-blue)] rounded-xl p-4 text-white text-center">
                        <p className="text-sm text-white/80 mb-1">Parcela Estimada</p>
                        <p className="text-3xl font-bold">{formatCurrency(parcela)}</p>
                        <p className="text-xs text-white/70 mt-1">por mês</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-500">Valor Solicitado</p>
                          <p className="font-bold text-sm text-gray-900">{formatCurrency(valorEmprestimo)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-500">Total a Pagar</p>
                          <p className="font-bold text-sm text-gray-900">{formatCurrency(totalPago)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-500">Juros Totais</p>
                          <p className="font-bold text-sm text-red-500">{formatCurrency(totalJuros)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xs text-gray-500">Prazo</p>
                          <p className="font-bold text-sm text-gray-900">{prazoMeses} meses</p>
                        </div>
                      </div>

                      <p className="text-xs text-gray-400 text-center">
                        * Simulação estimada. Sujeito à análise e aprovação.
                      </p>
                    </div>
                  </div>

                  {/* Produtos em Destaque */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h3 className="font-bold text-gray-900 mb-4">Produtos em Destaque</h3>
                    <div className="space-y-3">
                      {[
                        { name: "PRONAMPE", desc: "Selic + 6% a.a.", badge: "Governo" },
                        { name: "Giro CAIXA Fácil", desc: "A partir de 2,99% a.m.", badge: "CAIXA" },
                        { name: "Rating BB", desc: "Consulta e análise", badge: "Banco do Brasil" },
                      ].map((p) => (
                        <div key={p.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div>
                            <p className="font-semibold text-sm">{p.name}</p>
                            <p className="text-xs text-gray-500">{p.desc}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs">{p.badge}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contato Direto */}
                  <div className="bg-green-50 rounded-2xl border border-green-200 p-6 text-center">
                    <TrendingUp className="h-8 w-8 text-green-600 mx-auto mb-3" />
                    <p className="font-bold text-gray-900 mb-2">Prefere falar agora?</p>
                    <p className="text-sm text-gray-600 mb-4">Nossa equipe está disponível para atendimento imediato.</p>
                    <a
                      href="https://wa.me/5561986055223?text=Olá! Tenho interesse em simular um empréstimo."
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold">
                        Falar no WhatsApp
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="py-12 bg-white">
        <div className="container px-4">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">O que nossos clientes dizem</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { nome: "Carlos M.", empresa: "Distribuidora Silva", texto: "Consegui o PRONAMPE em 15 dias com a ajuda da Destrava. Processo simples e rápido!", rating: 5 },
              { nome: "Ana Paula R.", empresa: "Restaurante Sabor", texto: "Precisava de capital de giro urgente. A equipe foi incrível, me orientou em tudo.", rating: 5 },
              { nome: "Roberto L.", empresa: "Construtora RL", texto: "Excelente assessoria! Me ajudaram a conseguir crédito mesmo com restrições no CNPJ.", rating: 5 },
            ].map((t) => (
              <div key={t.nome} className="bg-gray-50 rounded-xl p-6">
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-700 mb-4 italic">"{t.texto}"</p>
                <div>
                  <p className="font-bold text-sm">{t.nome}</p>
                  <p className="text-xs text-gray-500">{t.empresa}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
