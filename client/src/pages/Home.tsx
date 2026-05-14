import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroCarousel from "@/components/HeroCarousel";
import SEO, { organizationStructuredData, faqStructuredData } from "@/components/SEO";
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
  Users,
  TrendingUp,
  FileCheck,
  Clock,
  Shield,
  HeadphonesIcon,
  CheckCircle2,
  MessageCircle,
  Target,
  Lightbulb,
  ArrowRight,
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
    console.log("Formulário enviado:", formData);
    setLocation("/sucesso");
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const faqs = [
    {
      question: "Como funciona a assessoria empresarial da Destrava?",
      answer: "Nossa atuação começa com o entendimento do cenário da sua empresa. A partir disso, conduzimos a jornada com análise, organização e acompanhamento próximo, para tornar o processo mais claro, seguro e menos desgastante para o empresário."
    },
    {
      question: "Preciso saber exatamente qual solução minha empresa precisa?",
      answer: "Não. Muitas empresas chegam até nós justamente buscando direção. A Destrava ajuda a dar clareza ao cenário e a organizar o caminho com base na necessidade real do negócio."
    },
    {
      question: "A Destrava acompanha o processo do início ao fim?",
      answer: "Sim. Nosso diferencial está justamente na condução completa da operação, com apoio consultivo e acompanhamento ao longo de toda a jornada."
    },
    {
      question: "O processo é muito burocrático para o empresário?",
      answer: "Nosso objetivo é exatamente reduzir essa carga. A Destrava organiza as etapas, orienta o que é necessário e conduz o processo para que o empresário tenha mais foco na empresa e menos desgaste operacional."
    },
    {
      question: "Como posso iniciar a análise da minha empresa?",
      answer: "Você pode começar pelo botão principal da página e solicitar uma análise. A partir daí, nossa equipe entra em contato para entender o cenário e orientar os próximos passos."
    }
  ];

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      organizationStructuredData,
      faqStructuredData(faqs)
    ]
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Destrave o crédito da sua empresa | Destrava Crédito"
        description="Destrave o crédito da sua empresa com assessoria empresarial completa. Analisamos seu cenário, identificamos as melhores linhas de financiamento e conduzimos todo o processo, incluindo Pronampe 2026, ProCred 360 e outras opções com prazos de até 96 meses e carência de 24 meses. Simulação gratuita e atendimento consultivo."
        keywords="assessoria de crédito empresarial, consultoria de crédito, captação de recursos para empresas, destravar crédito, financiamento empresarial, Pronampe 2026, ProCred 360, crédito para MEI, crédito para microempresa, crédito para pequena empresa"
        image="https://destravacredito.com/3.png"
        structuredData={structuredData}
      />
      <Header />

      {/* HERO SECTION */}
      <section className="relative bg-gradient-to-br from-[var(--color-caixa-blue)] via-[#002d8a] to-[var(--color-caixa-blue-dark)] text-white pt-6 pb-10 md:pt-8 md:pb-14 overflow-hidden">
        {/* Padrão de fundo sutil */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        {/* Gradiente decorativo */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none"></div>

        <div className="container relative z-10">
          <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-start">
            <div>
               <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
                 Destrave o crédito da sua empresa com assessoria especializada em crédito bancário e governamental.
               </h1>
              <p className="text-xl md:text-2xl mb-4 text-white/90 leading-relaxed">
                A Destrava atua ao lado da sua empresa para identificar as melhores linhas de crédito, organizar a operação e conduzir todo o processo com mais segurança, estratégia e clareza.
              </p>
              <p className="text-base mb-8 text-white/75 leading-relaxed">
                Cuidamos da estruturação da demanda, do direcionamento correto e do acompanhamento da operação para que sua empresa avance com menos desgaste, mais previsibilidade e melhores condições de crédito.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-10">
                 <Link href="/simular">
                   <Button
                     size="lg"
                     className="bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold shadow-lg w-full sm:w-auto"
                   >
                     → Destrave seu crédito
                   </Button>
                 </Link>
                <a
                  href="https://wa.me/556135268355"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    variant="outline"
                    size="lg"
                    className="font-semibold bg-white/10 border-white/30 text-white hover:bg-white/20 w-full sm:w-auto"
                  >
                    <MessageCircle className="mr-2 h-5 w-5" />
                    Falar no WhatsApp
                  </Button>
                </a>
              </div>

              {/* Prova rápida */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/20">
                <div className="text-center">
                  <p className="text-sm font-semibold text-[var(--color-caixa-yellow)]">Atendimento consultivo</p>
                </div>
                <div className="text-center border-x border-white/20">
                  <p className="text-sm font-semibold text-[var(--color-caixa-yellow)]">Condução completa do processo</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[var(--color-caixa-yellow)]">Sem custo antecipado</p>
                </div>
              </div>
            </div>

            <div className="flex items-start justify-center mt-6 md:mt-0">
              <HeroCarousel />
            </div>
          </div>
        </div>
      </section>

      {/* BLOCO INSTITUCIONAL PRINCIPAL */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              A solução que sua empresa precisa para obter crédito com clareza, honestidade e menos desgaste
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              A Destrava atua com assessoria empresarial para empresas que precisam de direção, organização e apoio real na busca por recursos. Mais do que apresentar caminhos, nossa atuação envolve entendimento do cenário, análise estratégica e condução completa do processo, reduzindo a carga operacional do empresário e dando mais segurança em cada etapa.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-card p-8 rounded-lg border-2 border-border">
              <h3 className="text-2xl font-bold mb-4">O que sua empresa encontra na Destrava</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Análise estratégica do cenário da empresa</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Direcionamento mais claro para a necessidade do negócio</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Condução completa do processo com apoio consultivo</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Organização da jornada com menos peso para o empresário</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Acompanhamento próximo do início ao avanço da operação</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                  <span>Soluções pensadas para a realidade e o momento da empresa</span>
                </li>
              </ul>
              <p className="mt-6 text-sm text-muted-foreground italic">
                Nosso papel é transformar um processo que costuma ser complexo em uma jornada mais clara, organizada e conduzida com método.
              </p>
            </div>

            <div className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white p-8 rounded-lg shadow-lg">
              <h3 className="text-2xl font-bold mb-6">Por que empresas escolhem a Destrava</h3>
              <p className="text-white/80 mb-6">
                Porque encontrar recursos para a empresa exige mais do que tentativa: exige análise, condução, organização e acompanhamento.
              </p>
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-bold mb-1">Atendimento consultivo de verdade</p>
                  <p className="text-white/80 text-sm">Sua empresa é atendida com escuta, análise e direcionamento, sem respostas genéricas.</p>
                </div>
                <div className="border-t border-white/20 pt-4">
                  <p className="text-lg font-bold mb-1">Condução completa do processo</p>
                  <p className="text-white/80 text-sm">A Destrava assume a parte pesada da jornada e organiza cada etapa para reduzir a carga operacional.</p>
                </div>
                <div className="border-t border-white/20 pt-4">
                  <p className="text-lg font-bold mb-1">Mais clareza para decidir</p>
                  <p className="text-white/80 text-sm">Você entende melhor o caminho da sua empresa, com mais segurança, mais contexto e menos ruído.</p>
                </div>
                <div className="border-t border-white/20 pt-4">
                  <p className="text-lg font-bold mb-1">Agilidade com organização</p>
                  <p className="text-white/80 text-sm">Um processo bem conduzido reduz retrabalho, evita perda de tempo e melhora a experiência do início ao fim.</p>
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
              Como funciona nossa assessoria
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Um processo pensado para simplificar a jornada da sua empresa e conduzir cada etapa com mais clareza.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <BenefitCard
              icon={Lightbulb}
              title="1. Entendimento do cenário da empresa"
              description="Começamos entendendo o momento do negócio, a necessidade da empresa e o objetivo da operação."
            />
            <BenefitCard
              icon={TrendingUp}
              title="2. Análise estratégica do perfil"
              description="Avaliamos o contexto com olhar técnico e consultivo para direcionar o caminho mais adequado."
            />
            <BenefitCard
              icon={HeadphonesIcon}
              title="3. Condução da operação"
              description="A Destrava organiza e acompanha o processo, reduzindo a carga operacional sobre o empresário."
            />
            <BenefitCard
              icon={CheckCircle2}
              title="4. Acompanhamento até o avanço da solução"
              description="Seguimos com proximidade, clareza e apoio em cada fase, para que a empresa tenha segurança ao longo da jornada."
            />
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS / BENEFÍCIOS */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Mais do que apoio financeiro: uma assessoria que organiza, conduz e facilita
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Menos peso para o empresário</h3>
              <p className="text-muted-foreground text-sm">
                A empresa não precisa carregar sozinha a complexidade do processo.
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Mais clareza em cada etapa</h3>
              <p className="text-muted-foreground text-sm">
                Você entende o caminho com mais segurança e menos incerteza.
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <HeadphonesIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Acompanhamento próximo</h3>
              <p className="text-muted-foreground text-sm">
                Atuação consultiva com presença real ao longo da jornada.
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <FileCheck className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Processo mais organizado</h3>
              <p className="text-muted-foreground text-sm">
                Mais método, menos improviso e mais fluidez para a empresa avançar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* LINHAS DE CRÉDITO */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Linhas de Crédito Disponíveis</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Trabalhamos com as principais linhas de crédito do mercado. Conheça cada programa e descubra qual é o ideal para sua empresa.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                logo: "/logo-pronampe.jpg",
                title: "PRONAMPE",
                desc: "Linha de crédito federal para MEI, microempresas e pequenas empresas. Condições diferenciadas com carência e taxas abaixo do mercado.",
                href: "/pronampe",
                badge: "Mais popular",
                badgeColor: "bg-green-100 text-green-700",
              },
              {
                logo: "/logo-procred360.webp",
                title: "ProCred 360",
                desc: "Programa do Governo Federal com juros subsidiados para MEI e microempresas. Parte do Programa Acredita no Primeiro Passo.",
                href: "/procred360",
                badge: "Programa Acredita",
                badgeColor: "bg-blue-100 text-blue-700",
              },
              {
                logo: "/logo-caixa.png",
                title: "Giro CAIXA Fácil",
                desc: "Capital de giro com taxa pré-fixada e prazos estendidos pela CAIXA Econômica Federal. Ideal para manter o fluxo de caixa.",
                href: "/giro-caixa-facil",
                badge: "Capital de giro",
                badgeColor: "bg-orange-100 text-orange-700",
              },
              {
                logo: "/logo-bndes-fgi.jpg",
                title: "PEAC FGI",
                desc: "Crédito com garantia do FGI/BNDES para empresas de todos os portes. Prazos estendidos e carência para adequar ao fluxo do negócio.",
                href: "/peac-fgi",
                badge: "Grandes volumes",
                badgeColor: "bg-purple-100 text-purple-700",
              },
              {
                logo: "/logo-fco.png",
                title: "FCO",
                desc: "Financiamento do Fundo Constitucional do Centro-Oeste para empresas e produtores rurais de GO, MT, MS e DF.",
                href: "/fco",
                badge: "Centro-Oeste",
                badgeColor: "bg-violet-100 text-violet-700",
              },
              {
                logo: "/logo-fampe.webp",
                title: "FAMPE",
                desc: "Fundo do Sebrae que complementa as garantias exigidas pelos bancos, facilitando o acesso ao crédito para pequenos negócios.",
                href: "/fampe",
                badge: "Sebrae",
                badgeColor: "bg-amber-100 text-amber-700",
              },
            ].map((linha) => (
              <div key={linha.title} className="bg-card rounded-xl border border-border p-6 flex flex-col hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-12 w-24 flex items-center">
                    <img src={linha.logo} alt={linha.title} className="max-h-12 max-w-full object-contain" />
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${linha.badgeColor}`}>{linha.badge}</span>
                </div>
                <h3 className="text-lg font-bold mb-2">{linha.title}</h3>
                <p className="text-muted-foreground text-sm flex-1 mb-4">{linha.desc}</p>
                <Link href={linha.href} className="inline-flex items-center gap-1 text-primary font-semibold text-sm hover:underline">
                  Saiba mais <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
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
              Empresas que encontraram na Destrava uma assessoria mais clara, próxima e comprometida com a solução.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="A Destrava me ajudou a entender todo o processo e organizar os documentos. Consegui o crédito em menos de 15 dias!"
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
              quote="Estava com dificuldade para pagar fornecedores. Com a assessoria da Destrava, consegui organizar tudo e avançar com mais segurança."
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
                Perguntas frequentes
              </h2>
              <p className="text-lg text-muted-foreground">
                Esclareça as principais dúvidas sobre nossa assessoria empresarial e o início da sua jornada com a Destrava.
              </p>
            </div>

            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index + 1}`}
                  className="bg-card border border-border rounded-lg px-6"
                >
                  <AccordionTrigger className="text-left font-semibold hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* FORMULÁRIO — SOLICITAR CONTATO */}
      <section id="simulacao" className="py-20 scroll-mt-20">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">Solicite uma consultoria</p>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Fale com nossa equipe e entenda o melhor caminho para sua empresa
              </h2>
              <p className="text-lg text-muted-foreground">
                Preencha o formulário e solicite o contato da nossa equipe. Vamos entender o seu momento e orientar os próximos passos com mais clareza e segurança.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="bg-card p-8 rounded-lg border-2 border-border shadow-lg space-y-6"
            >
              <div className="mb-2">
                <h3 className="text-xl font-bold mb-1">Solicite o contato da nossa equipe</h3>
                <p className="text-sm text-muted-foreground">Informe seus dados e nossa equipe entrará em contato para entender sua necessidade e apresentar a melhor orientação.</p>
              </div>
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
                → Solicitar contato
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Ao enviar seus dados, você concorda com nossa{" "}
                <a href="/politica-privacidade" className="underline">
                  Política de Privacidade
                </a>
                . Suas informações são tratadas com confidencialidade e utilizadas apenas para contato da nossa equipe.
              </p>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
