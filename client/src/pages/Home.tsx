import Header from "@/components/Header";
import Footer from "@/components/Footer";
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
        title="Assessoria Empresarial para Captação de Recursos e Crédito para Empresas | Destrava"
        description="A Destrava oferece assessoria empresarial para captação de recursos e crédito para empresas, com condução completa do processo, atendimento consultivo e mais clareza para o empresário."
        keywords="assessoria empresarial, captação de recursos, crédito para empresas, crédito empresarial, assessoria para empresas, captação de recursos para empresas, assessoria de crédito empresarial, soluções para empresas, recursos para empresas"
        image="https://destrava.permupay.com.br/3.png"
        structuredData={structuredData}
      />
      <Header />

      {/* HERO SECTION */}
      <section className="relative bg-gradient-to-br from-[var(--color-caixa-blue)] via-[#002d8a] to-[var(--color-caixa-blue-dark)] text-white pt-8 pb-12 md:pt-12 md:pb-16 overflow-hidden">
        {/* Padrão de fundo sutil */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        {/* Gradiente decorativo */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none"></div>

        <div className="container relative z-10">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              {/* Badge de posicionamento */}
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
                <Shield className="h-4 w-4 text-[var(--color-caixa-yellow)]" />
                <span>Assessoria empresarial com foco em captação de recursos e crédito para empresas</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                Assessoria Empresarial para Captação de Recursos e Crédito para Empresas
              </h1>
              <p className="text-xl md:text-2xl mb-4 text-white/90 leading-relaxed">
                A Destrava conduz sua empresa em toda a jornada com estratégia, organização e acompanhamento próximo, para que você tenha mais clareza, menos desgaste operacional e um caminho mais seguro para viabilizar recursos.
              </p>
              <p className="text-base mb-8 text-white/75 leading-relaxed">
                Se a sua empresa precisa avançar, reorganizar o caixa, ganhar fôlego ou encontrar uma solução financeira com mais direção e menos burocracia, você chegou ao lugar certo.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-10">
                <Link href="/simular">
                  <Button
                    size="lg"
                    className="bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold shadow-lg w-full sm:w-auto"
                  >
                    Solicitar Análise
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
                  <p className="text-sm font-semibold text-[var(--color-caixa-yellow)]">Soluções para empresas de diferentes portes</p>
                </div>
              </div>
            </div>

            <div className="hidden md:flex md:items-start md:justify-center">
              <img
                src="/3.png"
                alt="Assessoria empresarial para captação de recursos - Destrava"
                className="rounded-2xl shadow-2xl w-full max-w-lg object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* BLOCO INSTITUCIONAL PRINCIPAL */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              A solução que sua empresa procura para captar recursos com mais clareza e menos desgaste
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

      {/* FORMULÁRIO — SOLICITAR ANÁLISE */}
      <section id="simulacao" className="py-20 scroll-mt-20">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Solicite uma análise para sua empresa
              </h2>
              <p className="text-lg text-muted-foreground">
                Dê o primeiro passo com mais clareza, apoio e direção. A Destrava avalia o cenário da sua empresa e conduz o processo com uma assessoria completa.
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
                Solicitar Análise
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Seus dados serão usados apenas para contato e continuidade do atendimento.{" "}
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
