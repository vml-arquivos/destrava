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
      question: "A Destrava trabalha com quais bancos e linhas de crédito?",
      answer: "A Destrava Crédito é uma assessoria financeira independente que trabalha com múltiplos bancos e instituições: CAIXA Econômica Federal, Banco do Brasil, bancos privados e fintechs. Buscamos a melhor linha de crédito para o perfil da sua empresa, seja PRONAMPE, Giro CAIXA Fácil, capital de giro, financiamento de equipamentos ou crédito estruturado."
    },
    {
      question: "A Destrava atende empresas de qual porte?",
      answer: "Atendemos empresas de todos os portes: MEI, microempresas, pequenas, médias e grandes empresas. Cada perfil tem linhas de crédito específicas e nossa equipe identifica a solução mais adequada para cada caso."
    },
    {
      question: "Quais documentos são normalmente pedidos?",
      answer: "Geralmente são necessários: CNPJ, contrato social, comprovante de endereço da empresa, documentos pessoais dos sócios, extratos bancários e declaração de faturamento. A Destrava Crédito orienta sobre a documentação específica para cada linha de crédito e ajuda a organizar tudo de forma eficiente."
    },
    {
      question: "Em quanto tempo sai a resposta?",
      answer: "O prazo varia conforme a linha de crédito, o banco e a complexidade da análise. Em média, entre 3 e 15 dias úteis após o envio completo da documentação. Com a assessoria da Destrava, o processo tende a ser mais ágil, pois ajudamos a enviar tudo correto desde o início."
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
        title="Assessoria de Crédito Empresarial - Destrava Crédito"
        description="Destrava Crédito: Assessoria financeira independente para empresas de todos os portes. PRONAMPE, Giro CAIXA Fácil, capital de giro, crédito estruturado. Análise personalizada e acesso às melhores linhas de crédito do mercado."
        keywords="assessoria credito empresarial, pronampe, giro caixa facil, capital de giro, credito empresa, financiamento empresarial, credito pequena media grande empresa, destrava credito"
        image="https://destrava.permupay.com.br/3.png"
        structuredData={structuredData}
      />
      <Header />

      {/* HERO SECTION */}
      <section className="relative bg-gradient-to-br from-[var(--color-caixa-blue)] via-[#002d8a] to-[var(--color-caixa-blue-dark)] text-white py-20 md:py-32 overflow-hidden">
        {/* Padrão de fundo sutil */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        {/* Gradiente decorativo */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none"></div>

        <div className="container relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              {/* Badge de posicionamento */}
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
                <Shield className="h-4 w-4 text-[var(--color-caixa-yellow)]" />
                <span>Assessoria Financeira Independente · Multi-Banco</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                Crédito Empresarial para Empresas de Todos os Portes
              </h1>
              <p className="text-xl md:text-2xl mb-8 text-white/90 leading-relaxed">
                A Destrava Crédito analisa o perfil da sua empresa e busca a melhor solução de crédito no mercado. Capital de giro, PRONAMPE, financiamentos estruturados — do MEI à grande empresa.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-10">
                <a
                  href="https://wa.me/5561986055223"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    size="lg"
                    className="bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold shadow-lg"
                  >
                    <MessageCircle className="mr-2 h-5 w-5" />
                    Conversar com Especialista
                  </Button>
                </a>
                <Link href="/simular">
                  <Button
                    variant="outline"
                    size="lg"
                    className="font-semibold bg-white/10 border-white/30 text-white hover:bg-white/20 w-full sm:w-auto"
                  >
                    Simular Empréstimo Grátis
                  </Button>
                </Link>
              </div>

              {/* Credenciais — sem logos de bancos terceiros */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/20">
                <div className="text-center">
                  <p className="text-2xl font-bold text-[var(--color-caixa-yellow)]">+500</p>
                  <p className="text-xs text-white/70 mt-1">Empresas Assessoradas</p>
                </div>
                <div className="text-center border-x border-white/20">
                  <p className="text-2xl font-bold text-[var(--color-caixa-yellow)]">+15</p>
                  <p className="text-xs text-white/70 mt-1">Linhas de Crédito</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-[var(--color-caixa-yellow)]">98%</p>
                  <p className="text-xs text-white/70 mt-1">Taxa de Satisfação</p>
                </div>
              </div>
            </div>

            <div className="hidden md:block">
              <img
                src="/3.png"
                alt="Assessoria de crédito empresarial - Destrava Crédito"
                className="rounded-2xl shadow-2xl"
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
              A Destrava Crédito é uma assessoria financeira independente. Analisamos o perfil da sua empresa e buscamos a melhor solução de crédito no mercado — seja em bancos públicos, privados ou fintechs. Do capital de giro ao financiamento estruturado, trabalhamos para empresas de todos os portes.
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
                  <span>Acesso a +15 linhas de crédito em múltiplos bancos</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Orientação completa no processo de aprovação</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Recuperação de crédito e regularização de CNPJ</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Atendimento para MEI, pequenas, médias e grandes empresas</span>
                </li>
              </ul>
            </div>

            <div className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-bold mb-6">Por que Escolher a Destrava</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-bold mb-1">Assessoria Independente</p>
                  <p className="text-white/80 text-sm">Buscamos a melhor opção do mercado, sem vínculo exclusivo com nenhum banco</p>
                </div>
                <div className="border-t border-white/20 pt-4">
                  <p className="text-lg font-bold mb-1">Atendimento para Todos os Portes</p>
                  <p className="text-white/80 text-sm">MEI, micro, pequena, média e grande empresa — cada perfil tem a solução certa</p>
                </div>
                <div className="border-t border-white/20 pt-4">
                  <p className="text-lg font-bold mb-1">Processo Ágil e Sem Burocracia</p>
                  <p className="text-white/80 text-sm">Organizamos toda a documentação para acelerar a aprovação do crédito</p>
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
              description="Preencha o formulário com os dados da sua empresa e receba uma análise sem compromisso."
            />
            <BenefitCard
              icon={TrendingUp}
              title="2. Análise de Perfil"
              description="Nossa equipe analisa o perfil da empresa e identifica as melhores linhas de crédito disponíveis."
            />
            <BenefitCard
              icon={HeadphonesIcon}
              title="3. Assessoria Completa"
              description="Orientamos sobre documentação, preparamos o processo e acompanhamos a análise junto ao banco."
            />
            <BenefitCard
              icon={CheckCircle2}
              title="4. Crédito Liberado"
              description="Aprovado? O valor é depositado diretamente na conta da sua empresa."
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
              Assessoria financeira independente com acesso às melhores linhas de crédito do mercado para empresas de todos os portes
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
              <h3 className="text-xl font-bold mb-2">Multi-Banco</h3>
              <p className="text-muted-foreground text-sm">
                Acesso a múltiplos bancos e linhas de crédito — sem exclusividade
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
              Tire suas dúvidas sobre nossa assessoria e as linhas de crédito disponíveis
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
                  A Destrava Crédito é uma assessoria financeira independente que trabalha com múltiplos bancos e instituições: CAIXA Econômica Federal, Banco do Brasil, bancos privados e fintechs. Identificamos a melhor linha de crédito para o perfil da sua empresa e acompanhamos todo o processo de aprovação.
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
                  Não. As taxas variam conforme a linha de crédito, o banco e o perfil da empresa. Cada caso é analisado individualmente. Nossa assessoria ajuda a identificar a linha com as melhores condições para o seu perfil e a apresentar a documentação da forma mais favorável.
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
                  O prazo varia conforme a linha de crédito e o banco escolhido. Em média, entre 3 e 15 dias úteis após o envio completo da documentação. Com a assessoria da Destrava Crédito, o processo tende a ser mais ágil, pois organizamos tudo corretamente desde o início.
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
                Simule Seu Crédito Gratuitamente
              </h2>
              <p className="text-lg text-muted-foreground">
                Preencha o formulário e nossa equipe de especialistas entrará em contato para apresentar as melhores opções para a sua empresa
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
