import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CTAButton from "@/components/CTAButton";
import SEO, { breadcrumbStructuredData } from "@/components/SEO";
import { Target, Eye, Award, Shield, Users, TrendingUp, MapPin } from "lucide-react";
import { COMPANY } from "@/config/company";

export default function Sobre() {
  const breadcrumb = breadcrumbStructuredData([
    { name: "Início", url: "https://destravacredito.com/" },
    { name: "Sobre", url: "https://destravacredito.com/sobre" }
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Sobre a Destrava Crédito — Assessoria Empresarial"
        description="Conheça a Destrava Crédito e nossa assessoria para organização documental, diagnóstico financeiro e acesso responsável a soluções empresariais."
        keywords="sobre destrava credito, assessoria de credito empresarial, organizacao financeira, missao visao valores"
        structuredData={breadcrumb}
      />
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-20">
        <div className="container">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Sobre a Destrava Crédito
            </h1>
            <p className="text-xl text-white/90 leading-relaxed">
              Somos especialistas em assessoria de crédito empresarial, com foco
              em diagnóstico, organização documental e acompanhamento claro para
              micro e pequenas empresas.
            </p>
          </div>
        </div>
      </section>

      {/* Nossa História */}
      <section className="py-20">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Nossa História</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  A Destrava Crédito nasceu da percepção de que muitos pequenos
                  empresários enfrentam dificuldades para acessar linhas de
                  crédito, não por falta de capacidade de pagamento, mas por
                  desconhecimento do processo e pela complexidade burocrática.
                </p>
                <p>
                  Atuamos como ponte entre o empresário e instituições
                  financeiras, oferecendo assessoria personalizada na preparação
                  e no acompanhamento de cada solicitação de crédito.
                </p>
                <p>
                  Nossa missão é democratizar o acesso ao crédito empresarial,
                  tornando o processo mais transparente, ágil e menos
                  burocrático, sempre com foco no sucesso do nosso cliente.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-[#0033A0] to-[#001f66] p-8 text-white shadow-xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300">Como atuamos</p>
              <h2 className="mt-3 text-3xl font-black">Estratégia antes da proposta</h2>
              <ul className="mt-7 space-y-4 text-white/85">
                <li className="rounded-xl border border-white/15 bg-white/10 p-4">Diagnóstico do perfil e da finalidade do crédito</li>
                <li className="rounded-xl border border-white/15 bg-white/10 p-4">Organização documental e financeira</li>
                <li className="rounded-xl border border-white/15 bg-white/10 p-4">Acompanhamento consultivo da operação</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Missão, Visão, Valores */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card p-8 rounded-lg border border-border">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4">Missão</h3>
              <p className="text-muted-foreground leading-relaxed">
                Facilitar o acesso ao crédito empresarial para micro e pequenas
                empresas, oferecendo assessoria especializada e humanizada,
                contribuindo para o crescimento e sustentabilidade dos negócios.
              </p>
            </div>

            <div className="bg-card p-8 rounded-lg border border-border">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <Eye className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4">Visão</h3>
              <p className="text-muted-foreground leading-relaxed">
                Ser referência nacional em assessoria de crédito empresarial,
                reconhecidos pela excelência no atendimento e pela capacidade de
                transformar o acesso ao crédito em oportunidade de crescimento.
              </p>
            </div>

            <div className="bg-card p-8 rounded-lg border border-border">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <Award className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4">Valores</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Transparência em todas as etapas</li>
                <li>• Comprometimento com o cliente</li>
                <li>• Ética e profissionalismo</li>
                <li>• Agilidade e eficiência</li>
                <li>• Atendimento humanizado</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* O que faz uma assessoria de crédito */}
      <section className="py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                O que faz uma assessoria de crédito?
              </h2>
              <p className="text-lg text-muted-foreground">
                Entenda nosso papel e como podemos ajudar sua empresa
              </p>
            </div>

            <div className="bg-card p-8 rounded-lg border-2 border-border mb-8">
              <p className="text-lg leading-relaxed mb-6">
                Uma assessoria de crédito ajuda a entender necessidades,
                organizar informações e documentos e acompanhar a apresentação
                da demanda às instituições adequadas ao perfil do negócio.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Importante:</strong> A Destrava Crédito não toma decisões
                de crédito. Análise, aprovação, limites, taxas e contratação são
                definidos exclusivamente pela instituição financeira. Nossa
                função é orientar, organizar documentos e acompanhar o processo.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-bold mb-2">Processo transparente</h3>
                <p className="text-sm text-muted-foreground">
                  Escopo, custos e responsabilidades explicados antes do avanço
                </p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-bold mb-2">Assessoria Especializada</h3>
                <p className="text-sm text-muted-foreground">
                  Orientação em todas as etapas do processo de crédito
                </p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-bold mb-2">Sem Custos Adicionais</h3>
                <p className="text-sm text-muted-foreground">
                  Nossa remuneração vem da instituição financeira
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Nossas Unidades */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center mb-10">
            <h2 className="text-3xl font-bold mb-3">Nossas Unidades</h2>
            <p className="text-muted-foreground">Presença em Brasília e Goiânia, com atendimento em todo o Brasil.</p>
          </div>
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
            <div className="bg-card p-6 rounded-xl border border-border flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-lg mb-1">{COMPANY.sede.label}</p>
                <p className="text-muted-foreground text-sm">{COMPANY.sede.enderecoCompleto}</p>
                <a href={COMPANY.sede.mapUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm font-semibold hover:underline mt-2 inline-block">Ver no mapa →</a>
              </div>
            </div>
            <div className="bg-card p-6 rounded-xl border border-border flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-lg mb-1">{COMPANY.filialGoiania.label}</p>
                <p className="text-muted-foreground text-sm">{COMPANY.filialGoiania.enderecoCompleto}</p>
                <a href={COMPANY.filialGoiania.mapUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm font-semibold hover:underline mt-2 inline-block">Ver no mapa →</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Pronto para destravar o crédito da sua empresa?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Faça uma simulação gratuita e descubra como podemos ajudar seu
            negócio a crescer.
          </p>
          <CTAButton variant="secondary" size="lg">
            Fazer Simulação Gratuita
          </CTAButton>
        </div>
      </section>

      <Footer />
    </div>
  );
}
