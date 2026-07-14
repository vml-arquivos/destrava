import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CheckCircle2, AlertCircle, TrendingUp, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import SEO from "@/components/SEO";
import FormSubmitError from "@/components/FormSubmitError";
import { submitLead } from "@/lib/leads";

interface ScoreFactors {
  paymentHistory: string;
  debts: string;
  creditAge: string;
  creditInquiries: string;
  creditTypes: string;
}

export default function CalculadoraScore() {
  const [step, setStep] = useState(1);
  const [factors, setFactors] = useState<ScoreFactors>({
    paymentHistory: "",
    debts: "",
    creditAge: "",
    creditInquiries: "",
    creditTypes: "",
  });
  const [showResult, setShowResult] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [submittingLead, setSubmittingLead] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const calculateScore = (): number => {
    let score = 300; // Base score

    // Pesos internos e exclusivamente educativos desta ferramenta.
    switch (factors.paymentHistory) {
      case "excellent":
        score += 350;
        break;
      case "good":
        score += 280;
        break;
      case "fair":
        score += 180;
        break;
      case "poor":
        score += 80;
        break;
    }

    // Não reproduzem fórmulas proprietárias de birôs ou instituições.
    switch (factors.debts) {
      case "none":
        score += 300;
        break;
      case "low":
        score += 240;
        break;
      case "medium":
        score += 150;
        break;
      case "high":
        score += 50;
        break;
    }

    // Histórico de relacionamento informado pelo usuário.
    switch (factors.creditAge) {
      case "long":
        score += 150;
        break;
      case "medium":
        score += 100;
        break;
      case "short":
        score += 50;
        break;
      case "none":
        score += 0;
        break;
    }

    // Consultas recentes informadas pelo usuário.
    switch (factors.creditInquiries) {
      case "none":
        score += 100;
        break;
      case "few":
        score += 70;
        break;
      case "many":
        score += 30;
        break;
    }

    // Diversidade de produtos informada pelo usuário.
    switch (factors.creditTypes) {
      case "diverse":
        score += 100;
        break;
      case "some":
        score += 60;
        break;
      case "one":
        score += 30;
        break;
      case "none":
        score += 0;
        break;
    }

    return Math.min(score, 1000);
  };

  const score = showResult ? calculateScore() : 0;

  const getScoreCategory = (score: number) => {
    if (score >= 800) return { label: "Excelente", color: "text-green-600", bgColor: "bg-green-100" };
    if (score >= 600) return { label: "Bom", color: "text-blue-600", bgColor: "bg-blue-100" };
    if (score >= 400) return { label: "Regular", color: "text-yellow-600", bgColor: "bg-yellow-100" };
    return { label: "Ruim", color: "text-red-600", bgColor: "bg-red-100" };
  };

  const getScoreTips = (score: number) => {
    if (score >= 800) {
      return [
        "Suas respostas indicam hábitos financeiros bem organizados.",
        "Um bom diagnóstico pode ajudar na comparação de propostas, mas não garante taxa ou aprovação.",
        "Mantenha os pagamentos em dia e acompanhe os relatórios oficiais.",
        "Considere diversificar seus tipos de crédito.",
      ];
    }
    if (score >= 600) {
      return [
        "Suas respostas indicam um perfil organizado, com pontos de melhoria.",
        "Continue pagando suas contas em dia.",
        "Evite fazer muitas consultas de crédito em pouco tempo.",
        "Tente reduzir o saldo de suas dívidas atuais.",
      ];
    }
    if (score >= 400) {
      return [
        "Alguns hábitos informados merecem atenção.",
        "Priorize quitar dívidas atrasadas.",
        "Negocie débitos antigos para limpar seu nome.",
        "Evite novos empréstimos até regularizar sua situação.",
      ];
    }
    return [
      "As respostas indicam prioridades importantes de organização financeira.",
      "Regularize todas as dívidas em atraso o quanto antes.",
      "Considere um programa de renegociação de dívidas.",
      "Após regularizar, aguarde 3-6 meses antes de solicitar crédito.",
    ];
  };

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      setShowResult(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleLeadCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLead(true);
    setSubmitError(null);
    try {
      await submitLead({
        nome: name,
        telefone: phone,
        email,
        origem: "calculadora_score",
        produto_interesse: "Diagnóstico de score",
        finalidade: `Índice educativo informado pela ferramenta: ${score}`,
        score_estimado: score,
        respostas_score: factors,
        pagina: "/calculadora-score",
      });
      setLeadCaptured(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar seus dados. Tente novamente.",
      );
    } finally {
      setSubmittingLead(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return factors.paymentHistory !== "";
      case 2:
        return factors.debts !== "";
      case 3:
        return factors.creditAge !== "";
      case 4:
        return factors.creditInquiries !== "";
      case 5:
        return factors.creditTypes !== "";
      default:
        return false;
    }
  };

  const category = getScoreCategory(score);
  const tips = getScoreTips(score);

  return (
    <>
      <SEO
        title="Diagnóstico Educativo de Perfil de Crédito | Destrava Crédito"
        description="Responda perguntas sobre hábitos financeiros e receba um índice educativo com orientações. Não consulta nem substitui o score oficial de birôs de crédito."
        keywords="calculadora score, score de crédito, como calcular score, melhorar score, score empresarial"
        type="website"
      />
      <div className="min-h-screen flex flex-col bg-[var(--color-caixa-bg)]">
        <Header />
        
        <main className="flex-1 pt-24 pb-16">
          <div className="container max-w-4xl">
            {!showResult ? (
              <>
                {/* Header da Calculadora */}
                <div className="text-center mb-12">
                  <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-caixa-blue)] mb-4">
                    Diagnóstico Educativo de Crédito
                  </h1>
                  <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                    Responda 5 perguntas e receba um índice educativo. Esta ferramenta não consulta o score oficial nem representa análise bancária.
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-600">Progresso</span>
                    <span className="text-sm font-medium text-[var(--color-caixa-blue)]">
                      {step} de 5
                    </span>
                  </div>
                  <Progress value={(step / 5) * 100} className="h-2" />
                </div>

                {/* Questions Card */}
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-2xl text-[var(--color-caixa-blue)]">
                      {step === 1 && "1. Histórico de Pagamentos"}
                      {step === 2 && "2. Dívidas Atuais"}
                      {step === 3 && "3. Tempo de Crédito"}
                      {step === 4 && "4. Consultas Recentes"}
                      {step === 5 && "5. Tipos de Crédito"}
                    </CardTitle>
                    <CardDescription>
                      {step === 1 && "Como está seu histórico de pagamento de contas e empréstimos?"}
                      {step === 2 && "Qual o nível de suas dívidas atuais?"}
                      {step === 3 && "Há quanto tempo você tem crédito (cartões, empréstimos)?"}
                      {step === 4 && "Quantas consultas de crédito você fez nos últimos 6 meses?"}
                      {step === 5 && "Quantos tipos diferentes de crédito você possui?"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {step === 1 && (
                      <RadioGroup
                        value={factors.paymentHistory}
                        onValueChange={(value) => setFactors({ ...factors, paymentHistory: value })}
                      >
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="excellent" id="ph-excellent" />
                          <Label htmlFor="ph-excellent" className="flex-1 cursor-pointer">
                            <div className="font-medium">Excelente</div>
                            <div className="text-sm text-gray-500">Sempre pago tudo em dia, nunca atrasei</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="good" id="ph-good" />
                          <Label htmlFor="ph-good" className="flex-1 cursor-pointer">
                            <div className="font-medium">Bom</div>
                            <div className="text-sm text-gray-500">Raramente atraso, menos de 3 vezes no ano</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="fair" id="ph-fair" />
                          <Label htmlFor="ph-fair" className="flex-1 cursor-pointer">
                            <div className="font-medium">Regular</div>
                            <div className="text-sm text-gray-500">Atraso algumas vezes, mas sempre pago</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="poor" id="ph-poor" />
                          <Label htmlFor="ph-poor" className="flex-1 cursor-pointer">
                            <div className="font-medium">Ruim</div>
                            <div className="text-sm text-gray-500">Tenho atrasos frequentes ou dívidas não pagas</div>
                          </Label>
                        </div>
                      </RadioGroup>
                    )}

                    {step === 2 && (
                      <RadioGroup
                        value={factors.debts}
                        onValueChange={(value) => setFactors({ ...factors, debts: value })}
                      >
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="none" id="debt-none" />
                          <Label htmlFor="debt-none" className="flex-1 cursor-pointer">
                            <div className="font-medium">Sem dívidas</div>
                            <div className="text-sm text-gray-500">Não tenho dívidas ou uso menos de 10% do limite</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="low" id="debt-low" />
                          <Label htmlFor="debt-low" className="flex-1 cursor-pointer">
                            <div className="font-medium">Baixas</div>
                            <div className="text-sm text-gray-500">Uso entre 10% e 30% do crédito disponível</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="medium" id="debt-medium" />
                          <Label htmlFor="debt-medium" className="flex-1 cursor-pointer">
                            <div className="font-medium">Médias</div>
                            <div className="text-sm text-gray-500">Uso entre 30% e 70% do crédito disponível</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="high" id="debt-high" />
                          <Label htmlFor="debt-high" className="flex-1 cursor-pointer">
                            <div className="font-medium">Altas</div>
                            <div className="text-sm text-gray-500">Uso mais de 70% do crédito ou estou no limite</div>
                          </Label>
                        </div>
                      </RadioGroup>
                    )}

                    {step === 3 && (
                      <RadioGroup
                        value={factors.creditAge}
                        onValueChange={(value) => setFactors({ ...factors, creditAge: value })}
                      >
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="long" id="age-long" />
                          <Label htmlFor="age-long" className="flex-1 cursor-pointer">
                            <div className="font-medium">Mais de 5 anos</div>
                            <div className="text-sm text-gray-500">Tenho crédito há bastante tempo</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="medium" id="age-medium" />
                          <Label htmlFor="age-medium" className="flex-1 cursor-pointer">
                            <div className="font-medium">2 a 5 anos</div>
                            <div className="text-sm text-gray-500">Tenho algum histórico de crédito</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="short" id="age-short" />
                          <Label htmlFor="age-short" className="flex-1 cursor-pointer">
                            <div className="font-medium">Menos de 2 anos</div>
                            <div className="text-sm text-gray-500">Comecei a usar crédito recentemente</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="none" id="age-none" />
                          <Label htmlFor="age-none" className="flex-1 cursor-pointer">
                            <div className="font-medium">Nunca tive crédito</div>
                            <div className="text-sm text-gray-500">Não tenho histórico de crédito</div>
                          </Label>
                        </div>
                      </RadioGroup>
                    )}

                    {step === 4 && (
                      <RadioGroup
                        value={factors.creditInquiries}
                        onValueChange={(value) => setFactors({ ...factors, creditInquiries: value })}
                      >
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="none" id="inq-none" />
                          <Label htmlFor="inq-none" className="flex-1 cursor-pointer">
                            <div className="font-medium">Nenhuma</div>
                            <div className="text-sm text-gray-500">Não solicitei crédito recentemente</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="few" id="inq-few" />
                          <Label htmlFor="inq-few" className="flex-1 cursor-pointer">
                            <div className="font-medium">1 a 3 consultas</div>
                            <div className="text-sm text-gray-500">Fiz poucas consultas de crédito</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="many" id="inq-many" />
                          <Label htmlFor="inq-many" className="flex-1 cursor-pointer">
                            <div className="font-medium">Mais de 3 consultas</div>
                            <div className="text-sm text-gray-500">Solicitei crédito em vários lugares</div>
                          </Label>
                        </div>
                      </RadioGroup>
                    )}

                    {step === 5 && (
                      <RadioGroup
                        value={factors.creditTypes}
                        onValueChange={(value) => setFactors({ ...factors, creditTypes: value })}
                      >
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="diverse" id="type-diverse" />
                          <Label htmlFor="type-diverse" className="flex-1 cursor-pointer">
                            <div className="font-medium">Diversos tipos</div>
                            <div className="text-sm text-gray-500">Cartão, empréstimo, financiamento, etc.</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="some" id="type-some" />
                          <Label htmlFor="type-some" className="flex-1 cursor-pointer">
                            <div className="font-medium">Alguns tipos</div>
                            <div className="text-sm text-gray-500">2 ou 3 tipos diferentes de crédito</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="one" id="type-one" />
                          <Label htmlFor="type-one" className="flex-1 cursor-pointer">
                            <div className="font-medium">Apenas um tipo</div>
                            <div className="text-sm text-gray-500">Só tenho cartão de crédito, por exemplo</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                          <RadioGroupItem value="none" id="type-none" />
                          <Label htmlFor="type-none" className="flex-1 cursor-pointer">
                            <div className="font-medium">Nenhum</div>
                            <div className="text-sm text-gray-500">Não tenho nenhum tipo de crédito</div>
                          </Label>
                        </div>
                      </RadioGroup>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex gap-4 pt-6">
                      {step > 1 && (
                        <Button
                          variant="outline"
                          onClick={handleBack}
                          className="flex-1"
                        >
                          Voltar
                        </Button>
                      )}
                      <Button
                        onClick={handleNext}
                        disabled={!canProceed()}
                        className="flex-1 bg-[var(--color-caixa-blue)] hover:bg-[var(--color-caixa-blue-dark)]"
                      >
                        {step === 5 ? "Ver Resultado" : "Próxima"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <>
                {/* Result Screen */}
                <div className="text-center mb-8">
                  <h1 className="text-4xl md:text-5xl font-bold text-[var(--color-caixa-blue)] mb-4">
                    Seu Índice Educativo
                  </h1>
                  <p className="text-lg text-gray-600">
                    Resultado interno da ferramenta, calculado apenas a partir das suas respostas
                  </p>
                </div>

                {/* Score Display */}
                <Card className="shadow-lg mb-8">
                  <CardContent className="pt-12 pb-12">
                    <div className="text-center">
                      <div className={`inline-block px-6 py-2 rounded-full ${category.bgColor} ${category.color} font-semibold text-lg mb-6`}>
                        {category.label}
                      </div>
                      <div className="text-8xl font-bold text-[var(--color-caixa-blue)] mb-4">
                        {score}
                      </div>
                      <div className="text-gray-500 mb-8">de 1000 pontos</div>
                      
                      {/* Score Bar */}
                      <div className="max-w-md mx-auto">
                        <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-1000"
                            style={{ width: `${(score / 1000) * 100}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                          <span>0</span>
                          <span>250</span>
                          <span>500</span>
                          <span>750</span>
                          <span>1000</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tips */}
                <Card className="shadow-lg mb-8">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[var(--color-caixa-blue)]">
                      <TrendingUp className="h-6 w-6" />
                      Próximos passos recomendados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {tips.map((tip, index) => (
                        <li key={index} className="flex items-start gap-3">
                          {score >= 600 ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          )}
                          <span className="text-gray-700">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Lead Capture */}
                {!leadCaptured ? (
                  <Card className="shadow-lg mb-8 border-[var(--color-caixa-yellow)] border-2">
                    <CardHeader>
                      <CardTitle className="text-[var(--color-caixa-blue)]">
                        Receba Dicas Personalizadas por Email
                      </CardTitle>
                      <CardDescription>
                        Enviaremos um relatório completo com dicas específicas para o seu perfil e as melhores opções de crédito disponíveis.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleLeadCapture} className="space-y-4">
                        <div>
                          <Label htmlFor="name">Nome Completo *</Label>
                          <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            placeholder="Seu nome"
                          />
                        </div>
                        <div>
                          <Label htmlFor="email">Email *</Label>
                          <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="seu@email.com"
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone">WhatsApp *</Label>
                          <Input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                            placeholder="(61) 3526-8355"
                          />
                        </div>
                        <FormSubmitError message={submitError} />
                        <Button
                          type="submit"
                          disabled={submittingLead}
                          aria-busy={submittingLead}
                          className="w-full bg-[var(--color-caixa-yellow)] text-[var(--color-caixa-blue)] hover:bg-[var(--color-caixa-yellow)]/90 font-bold"
                        >
                          {submittingLead ? "Enviando..." : "Receber orientação gratuita"}
                        </Button>
                        <p className="text-xs text-gray-500 text-center">
                          Seus dados estão seguros. Não compartilhamos com terceiros.
                        </p>
                      </form>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shadow-lg mb-8 bg-green-50 border-green-200">
                    <CardContent className="pt-8 pb-8 text-center">
                      <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
                      <h3 className="text-2xl font-bold text-green-800 mb-2">
                        Dados recebidos!
                      </h3>
                      <p className="text-green-700 mb-6">
                        Registramos seu diagnóstico para <strong>{email}</strong>. Nossa equipe poderá entrar em contato com orientações para o seu perfil.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* CTA */}
                <Card className="shadow-lg bg-gradient-to-r from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-white">
                  <CardContent className="pt-8 pb-8 text-center">
                    <h3 className="text-2xl font-bold mb-4">
                      Pronto para Solicitar Crédito?
                    </h3>
                    <p className="mb-6 text-white/90">
                      A Destrava Crédito pode orientar a organização do seu perfil e a comparação de propostas.
                      A aprovação e as condições pertencem à instituição financeira.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Button
                          asChild
                          size="lg"
                          className="bg-[var(--color-caixa-yellow)] text-[var(--color-caixa-blue)] hover:bg-[var(--color-caixa-yellow)]/90 font-bold"
                        >
                          <Link href="/simular" data-cta-position="calculadora-resultado-primary">
                            Simular Crédito Agora
                          </Link>
                        </Button>
                      <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="bg-white text-[var(--color-caixa-blue)] hover:bg-white/90 border-white"
                      >
                        <a
                          href="https://wa.me/556135268355?text=Olá! Preenchi o diagnóstico educativo no site e gostaria de orientação sobre crédito."
                          target="_blank"
                          rel="noopener noreferrer"
                          data-cta-position="calculadora-resultado-whatsapp"
                        >
                          Falar no WhatsApp
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Restart */}
                <div className="text-center mt-8">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowResult(false);
                      setStep(1);
                      setFactors({
                        paymentHistory: "",
                        debts: "",
                        creditAge: "",
                        creditInquiries: "",
                        creditTypes: "",
                      });
                      setLeadCaptured(false);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="text-[var(--color-caixa-blue)]"
                  >
                    Calcular Novamente
                  </Button>
                </div>
              </>
            )}

            {/* Disclaimer */}
            <div className="mt-12 p-6 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600 text-center">
                <strong>Importante:</strong> Este índice é educativo e usa somente as respostas fornecidas.
                Ele não consulta, estima ou reproduz o score de Serasa, SPC Brasil, Quod ou qualquer banco.
                Consulte diretamente a fonte oficial para conhecer uma pontuação real.
              </p>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
