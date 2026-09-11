import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Search,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Shield,
  Clock,
  FileText,
  TrendingUp,
  Building2,
  User,
  XCircle,
} from "lucide-react";

export default function ConsultaSPCSerasa() {
  return (
    <div className="min-h-screen flex flex-col bg-card">
      <SEO
        title="Consulta SPC e Serasa - CPF e CNPJ | Destrava Crédito"
        description="Consulte CPF ou CNPJ no SPC e Serasa. Verifique restrições, negativações e pendências financeiras. Análise completa para pessoa física e jurídica."
        keywords="consulta SPC, consulta Serasa, consulta CPF, consulta CNPJ, negativação, restrição financeira, score de crédito, limpa nome"
        structuredData={serviceStructuredData(
          "Consulta SPC e Serasa",
          "Consulta de CPF e CNPJ no SPC e Serasa para verificação de restrições e negativações."
        )}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#922B21] via-[#7B241C] to-[#641E16] text-primary-foreground py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-warning rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-warning rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-warning/20 border border-warning/30/40 rounded-full px-4 py-2 mb-6">
              <Search className="h-4 w-4 text-warning" />
              <span className="text-warning text-sm font-semibold">
                SPC & Serasa
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Consulta SPC e Serasa
              <br />
              <span className="text-warning">CPF e CNPJ</span>
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90 mb-8 leading-relaxed">
              Saiba se há restrições, negativações ou pendências no seu CPF ou
              CNPJ. Análise completa com relatório detalhado e orientação
              especializada para regularização.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild
                  size="lg"
                  className="bg-warning hover:bg-warning text-foreground font-bold px-8"
                >
                <Link href="/captura?produto=consulta-spc-serasa">
                  Consultar Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild
                  size="lg"
                  variant="outline"
                  className="border-white/40 text-primary-foreground hover:bg-card/10 font-bold px-8"
                >
                <a
                href="https://wa.me/556135268355?text=Olá! Quero consultar meu CPF/CNPJ no SPC e Serasa."
                target="_blank"
                rel="noopener noreferrer"
              >
                  Falar com Especialista
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* O QUE VERIFICAMOS */}
      <section className="py-14 bg-card">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">
                O que a Consulta Revela
              </h2>
              <p className="text-muted-foreground">
                Análise completa da situação do seu CPF ou CNPJ
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-card rounded-2xl border-2 border-destructive/30 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <User className="h-8 w-8 text-destructive" />
                  <h3 className="text-xl font-bold text-foreground">
                    Consulta CPF (Pessoa Física)
                  </h3>
                </div>
                <div className="space-y-3">
                  {[
                    "Negativações no SPC e Serasa",
                    "Dívidas em aberto com credores",
                    "Protestos em cartório",
                    "Ações judiciais",
                    "Score de crédito atual",
                    "Histórico de pagamentos",
                    "Consultas realizadas ao CPF",
                    "Pendências com concessionárias",
                  ].map(item => (
                    <div
                      key={item}
                      className="flex items-center gap-3 text-sm text-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <Button asChild className="w-full mt-6 bg-destructive hover:bg-destructive text-primary-foreground font-bold">
                  <Link href="/captura?produto=consulta-spc-serasa">
                    Consultar CPF
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="bg-card rounded-2xl border-2 border-warning/30 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <Building2 className="h-8 w-8 text-warning" />
                  <h3 className="text-xl font-bold text-foreground">
                    Consulta CNPJ (Pessoa Jurídica)
                  </h3>
                </div>
                <div className="space-y-3">
                  {[
                    "Negativações do CNPJ",
                    "Dívidas tributárias e fiscais",
                    "Protestos em cartório",
                    "Ações judiciais contra a empresa",
                    "Score empresarial",
                    "Situação na Receita Federal",
                    "Certidões negativas de débito",
                    "Histórico de crédito empresarial",
                  ].map(item => (
                    <div
                      key={item}
                      className="flex items-center gap-3 text-sm text-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <Button asChild className="w-full mt-6 bg-warning hover:bg-warning text-primary-foreground font-bold">
                  <Link href="/captura?produto=consulta-spc-serasa">
                    Consultar CNPJ
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* IMPACTO DAS RESTRIÇÕES */}
      <section className="py-14 bg-muted">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">
                Impacto das Restrições no Seu Crédito
              </h2>
              <p className="text-muted-foreground">
                Entenda como negativações afetam sua vida financeira
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-bold text-destructive mb-4 flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  Com Restrições
                </h3>
                <div className="space-y-3">
                  {[
                    "Crédito negado ou com taxas muito altas",
                    "Limite de crédito reduzido",
                    "Dificuldade para abrir conta bancária",
                    "Impedimento para participar de licitações",
                    "Problemas para alugar imóvel",
                    "Dificuldade para contratar serviços",
                    "Score de crédito muito baixo",
                    "Impossibilidade de obter financiamentos",
                  ].map(item => (
                    <div
                      key={item}
                      className="flex items-center gap-3 p-3 bg-destructive/10 rounded-lg text-sm text-destructive"
                    >
                      <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-bold text-success mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Sem Restrições
                </h3>
                <div className="space-y-3">
                  {[
                    "Mais informação para comparar propostas de crédito",
                    "Limite de crédito ampliado",
                    "Aprovação facilitada em financiamentos",
                    "Participação em licitações públicas",
                    "Facilidade para alugar imóvel",
                    "Acesso a linhas especiais (PRONAMPE, etc)",
                    "Score de crédito elevado",
                    "Melhores condições de parcelamento",
                  ].map(item => (
                    <div
                      key={item}
                      className="flex items-center gap-3 p-3 bg-success/10 rounded-lg text-sm text-success"
                    >
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESSO */}
      <section className="py-14 bg-card">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">
                Como Funciona a Consulta
              </h2>
            </div>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                {
                  num: "1",
                  icon: FileText,
                  title: "Solicite",
                  desc: "Preencha o formulário com seus dados e o CPF/CNPJ a ser consultado.",
                },
                {
                  num: "2",
                  icon: Search,
                  title: "Análise",
                  desc: "Nossa equipe realiza a consulta completa nos principais birôs de crédito.",
                },
                {
                  num: "3",
                  icon: Shield,
                  title: "Relatório",
                  desc: "Receba um relatório detalhado com todas as informações encontradas.",
                },
                {
                  num: "4",
                  icon: TrendingUp,
                  title: "Orientação",
                  desc: "Nossos especialistas orientam sobre as melhores estratégias de regularização.",
                },
              ].map(step => (
                <div key={step.num} className="text-center">
                  <div className="w-14 h-14 rounded-full bg-[var(--color-caixa-blue)] text-primary-foreground flex items-center justify-center font-bold text-xl mx-auto mb-4">
                    {step.num}
                  </div>
                  <step.icon className="h-6 w-6 text-[var(--color-caixa-blue)] mx-auto mb-3" />
                  <h3 className="font-bold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AVISO */}
      <section className="py-8 bg-warning/10 border-y border-warning/20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-warning mb-1">
                Encontrou restrições?
              </p>
              <p className="text-sm text-warning">
                Nossa equipe pode ajudar você a entender o relatório e organizar
                os próximos passos. A regularização depende de cada credor e não
                há promessa de retirada automática de restrições.
              </p>
              <Button
                asChild
                size="sm"
                className="mt-3 bg-warning hover:bg-warning text-primary-foreground"
              >
                <Link href="/contato">
                  Solicitar orientação
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-gradient-to-br from-[#922B21] to-[#641E16] text-primary-foreground">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">
              Consulte Agora seu CPF ou CNPJ
            </h2>
            <p className="text-primary-foreground/90 mb-8 text-lg">
              Saiba exatamente sua situação financeira e tome as melhores
              decisões com base em informações precisas.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild
                  size="lg"
                  className="bg-warning hover:bg-warning text-foreground font-bold px-8"
                >
                <Link href="/captura?produto=consulta-spc-serasa">
                  Solicitar Consulta
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild
                  size="lg"
                  variant="outline"
                  className="border-white/40 text-primary-foreground hover:bg-card/10 font-bold px-8"
                >
                <a
                href="https://wa.me/556135268355?text=Olá! Quero consultar meu CPF/CNPJ no SPC e Serasa."
                target="_blank"
                rel="noopener noreferrer"
              >
                  Falar no WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
