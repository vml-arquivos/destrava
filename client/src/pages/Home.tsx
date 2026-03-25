import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { organizationStructuredData, serviceStructuredData, faqStructuredData } from "@/components/SEO";
import CTAButton from "@/components/CTAButton";
import BenefitCard from "@/components/BenefitCard";
import TestimonialCard from "@/components/TestimonialCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ShoppingCart,
  Users,
  TrendingUp,
  FileCheck,
  Clock,
  Shield,
  HeadphonesIcon,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { useState, FormEvent } from "react";
import { useLocation, Link } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    nome: "",
    cnpj: "",
    whatsapp: "",
    email: "",
    cidade: "",
    estado: "",
    faturamento: "",
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Em produção, aqui seria enviado para uma API
    console.log("Formulário enviado:", formData);
    setLocation("/sucesso");
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const faqs = [
    {
      question: "Quem libera o crédito?",
      answer: "O crédito é analisado e liberado exclusivamente pela CAIXA Econômica Federal. A Destrava Crédito atua como Correspondente Bancário, auxiliando na documentação e no processo de solicitação."
    },
    {
      question: "As taxas são fixas?",
      answer: "As taxas variam conforme análise de crédito da CAIXA e perfil da empresa. A taxa mínima do Giro CAIXA Fácil é de 2,99% a.m., mas pode variar conforme aprovação."
    },
    {
      question: "Quais documentos são normalmente pedidos?",
      answer: "Geralmente são necessários: CNPJ, cartão CNPJ, contrato social, comprovante de endereço da empresa, documentos pessoais dos sócios, extrato bancário e declaração de faturamento."
    },
    {
      question: "Em quanto tempo sai a resposta?",
      answer: "O prazo varia conforme a complexidade da análise. Geralmente a CAIXA responde em 3 a 7 dias úteis após o envio completo da documentação."
    }
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      organizationStructuredData,
      serviceStructuredData(
        "Giro CAIXA Fácil",
        "Capital de giro para micro e pequenas empresas. Até R$ 70.000 com taxas a partir de 2,99% a.m."
      ),
      faqStructuredData(faqs)
    ]
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Captação de Recursos e Crédito Empresarial - Destrava Crédito"
        description="Destrava Crédito: Captação de recursos e assessoria financeira para empresas. Múltiplos produtos de crédito com análise personalizada de perfil e risco."
        keywords="captacao de recursos, credito empresarial, giro caixa facil, pronampe, credito empresa, financiamento, destrava credito"
        image="https://destrava-credito.manus.space/3.png"
        structuredData={structuredData}
      />
      <Header />

      {/* HERO SECTION */}
      <section className="relative bg-gradient-to-br from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-white py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        
        <div className="container relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                Assessoria de Crédito e Captação de Recursos para sua Empresa.
              </h1>
              <p className="text-xl md:text-2xl mb-8 text-white/90">
                A Destrava Crédito analisa o perfil da sua empresa e encontra a melhor solução de crédito. Desde capital de giro até financiamentos estruturados, ajudamos sua empresa a crescer.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <a
                  href="https://wa.me/5561986055223"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    size="lg"
                    className="bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold"
                  >
                    <MessageCircle className="mr-2 h-5 w-5" />
                    Conversar com Especialista
                  </Button>
                </a>
                <Link href="/produtos">
                  <Button
                    variant="outline"
                    size="lg"
                    className="font-semibold bg-white/10 border-white/30 text-white hover:bg-white/20 w-full sm:w-auto"
                  >
                    Ver Produtos de Crédito
                  </Button>
                </Link>
              </div>
              
              {/* Logos CAIXA + Destrava */}
              <div className="flex items-center gap-6 pt-6 border-t border-white/20">
                <div className="flex items-center gap-3">
                  <img
                    src="/caixa-logo.svg"
                    alt="CAIXA Econômica Federal"
                    className="h-14 w-auto brightness-0 invert"
                  />
                </div>
                <div className="h-12 w-px bg-white/30"></div>
                <div className="flex flex-col">
                  <img
                    src="/destrava-logo.svg"
                    alt="Destrava Crédito"
                    className="h-10 w-auto brightness-0 invert mb-1"
                  />
                  <span className="text-xs text-white/70">
                    Correspondente / Assessoria
                  </span>
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <img
                src="/3.png"
                alt="Empresário com tablet mostrando R$ 70.000"
                className="rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ASSESSORIA DE CRÉDITO */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Como Funciona Nossa Assessoria de Crédito
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              A Destrava Crédito realiza uma análise completa do perfil da sua empresa para encontrar a melhor solução de crédito. Desde capital de giro até financiamentos estruturados, ajudamos sua empresa a captar os recursos necessários para crescer.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-card p-8 rounded-lg border-2 border-border">
              <h3 className="text-2xl font-bold mb-4">O que Oferecemos</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Análise de perfil e risco da sua empresa</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Identificação da melhor linha de crédito</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Orientação completa no processo de aprovação</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Recuperação de crédito e limpeza de nome</span>
                </li>
              </ul>
            </div>

            <div className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-bold mb-6">Por que Escolher a Destrava</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-bold mb-1">Assessoria Personalizada</p>
                  <p className="text-white/80 text-sm">Cada empresa é única e merece atenção especial</p>
                </div>
                <div className="border-t border-white/20 pt-4">
                  <p className="text-lg font-bold mb-1">Correspondente Autorizado</p>
                  <p className="text-white/80 text-sm">Credenciados pela CAIXA e parceiros</p>
                </div>
                <div className="border-t border-white/20 pt-4">
                  <p className="text-lg font-bold mb-1">Sem Burocracia</p>
                  <p className="text-white/80 text-sm">Ajudamos a organizar documentação de forma eficiente</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="py-20 scroll-mt-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Como Funciona
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Processo simples e orientado em 4 etapas
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <BenefitCard
              icon={FileCheck}
              title="1. Simulação Gratuita"
              description="Preencha o formulário com seus dados e receba uma simulação sem compromisso."
            />
            <BenefitCard
              icon={HeadphonesIcon}
              title="2. Orientação Destrava"
              description="Nossa equipe orienta sobre documentos e melhores práticas para aprovação."
            />
            <BenefitCard
              icon={Shield}
              title="3. Análise da CAIXA"
              description="A CAIXA Econômica Federal analisa seu perfil e aprova o crédito."
            />
            <BenefitCard
              icon={CheckCircle2}
              title="4. Crédito Liberado"
              description="Aprovado? O valor é depositado diretamente na sua conta."
            />
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS DA DESTRAVA */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Por que escolher a Destrava Crédito?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Somos correspondentes autorizados com foco em facilitar seu acesso
              ao crédito
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <HeadphonesIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Atendimento Humano</h3>
              <p className="text-muted-foreground text-sm">
                Assessoria personalizada em cada etapa do processo
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Correspondente Autorizado</h3>
              <p className="text-muted-foreground text-sm">
                Credenciados pela CAIXA para intermediar operações
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Processo Ágil</h3>
              <p className="text-muted-foreground text-sm">
                Orientação para acelerar análise e aprovação
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <FileCheck className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Menos Burocracia</h3>
              <p className="text-muted-foreground text-sm">
                Ajudamos a organizar documentação de forma eficiente
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              O que nossos clientes dizem
            </h2>
            <p className="text-lg text-muted-foreground">
              Empresários que já contaram com nossa assessoria
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="A Destrava Crédito me ajudou a entender todo o processo e organizar os documentos. Consegui o crédito em menos de 15 dias!"
              author="Carlos Silva"
              role="Proprietário"
              company="Mercadinho Bom Preço"
            />
            <TestimonialCard
              quote="Atendimento excelente e muito profissional. Eles realmente entendem as necessidades de pequenos empresários como eu."
              author="Mariana Oliveira"
              role="MEI"
              company="Salão Beleza Pura"
            />
            <TestimonialCard
              quote="Estava com dificuldade para pagar fornecedores. Com o Giro CAIXA Fácil e a assessoria da Destrava, consegui regularizar tudo."
              author="Roberto Santos"
              role="Sócio"
              company="Distribuidora RS"
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Perguntas Frequentes
              </h2>
              <p className="text-lg text-muted-foreground">
                Tire suas dúvidas sobre o Giro CAIXA Fácil
              </p>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem
                value="item-1"
                className="bg-card border border-border rounded-lg px-6"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  Quem libera o crédito?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  O crédito é analisado e liberado exclusivamente pela CAIXA
                  Econômica Federal. A Destrava Crédito atua como correspondente
                  bancário, intermediando o processo e oferecendo assessoria para
                  facilitar a aprovação.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-2"
                className="bg-card border border-border rounded-lg px-6"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  As taxas são fixas?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Não. As taxas de juros variam conforme o perfil do cliente, o
                  histórico de crédito e a análise realizada pela CAIXA. A taxa
                  mínima divulgada é de 3% a.m., mas pode ser diferente para cada
                  caso. Nossa assessoria ajuda a apresentar seu perfil da melhor
                  forma possível.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-3"
                className="bg-card border border-border rounded-lg px-6"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  Quais documentos normalmente são pedidos?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Geralmente são solicitados: CNPJ, documentos pessoais dos
                  sócios, comprovante de faturamento, extratos bancários e
                  declarações fiscais. A Destrava Crédito orienta sobre a
                  documentação específica para o seu caso e ajuda a organizar tudo
                  de forma eficiente.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="item-4"
                className="bg-card border border-border rounded-lg px-6"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  Em quanto tempo sai a resposta?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  O prazo de análise varia conforme a complexidade do caso e a
                  documentação apresentada. Em média, a CAIXA responde entre 7 a
                  15 dias úteis. Com a assessoria da Destrava Crédito, o processo
                  tende a ser mais rápido, pois ajudamos a enviar tudo correto
                  desde o início.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* FORMULÁRIO DE SIMULAÇÃO */}
      <section id="simulacao" className="py-20 scroll-mt-20">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Faça sua Simulação Gratuita
              </h2>
              <p className="text-lg text-muted-foreground">
                Preencha o formulário e nossa equipe entrará em contato
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="bg-card p-8 rounded-lg border-2 border-border shadow-lg space-y-6"
            >
              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  type="text"
                  required
                  value={formData.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ / MEI *</Label>
                <Input
                  id="cnpj"
                  type="text"
                  required
                  value={formData.cnpj}
                  onChange={(e) => handleChange("cnpj", e.target.value)}
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp *</Label>
                  <Input
                    id="whatsapp"
                    type="tel"
                    required
                    value={formData.whatsapp}
                    onChange={(e) => handleChange("whatsapp", e.target.value)}
                    placeholder="(11) 9 9999-9999"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade *</Label>
                  <Input
                    id="cidade"
                    type="text"
                    required
                    value={formData.cidade}
                    onChange={(e) => handleChange("cidade", e.target.value)}
                    placeholder="Sua cidade"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estado">Estado *</Label>
                  <Input
                    id="estado"
                    type="text"
                    required
                    value={formData.estado}
                    onChange={(e) => handleChange("estado", e.target.value)}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="faturamento">Faturamento Mensal Aproximado *</Label>
                <Select
                  value={formData.faturamento}
                  onValueChange={(value) => handleChange("faturamento", value)}
                  required
                >
                  <SelectTrigger id="faturamento">
                    <SelectValue placeholder="Selecione uma faixa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ate-5k">Até R$ 5.000</SelectItem>
                    <SelectItem value="5k-10k">R$ 5.000 - R$ 10.000</SelectItem>
                    <SelectItem value="10k-20k">R$ 10.000 - R$ 20.000</SelectItem>
                    <SelectItem value="20k-50k">R$ 20.000 - R$ 50.000</SelectItem>
                    <SelectItem value="50k-100k">R$ 50.000 - R$ 100.000</SelectItem>
                    <SelectItem value="acima-100k">Acima de R$ 100.000</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" size="lg" className="w-full font-semibold">
                Enviar Simulação
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Ao enviar, você concorda com nossa{" "}
                <a href="/politica-privacidade" className="underline">
                  Política de Privacidade
                </a>
              </p>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
