import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Shield,
  TrendingUp,
  FileText,
  Clock,
  AlertCircle,
  Building2,
} from "lucide-react";

export default function RatingBancoCentral() {
  return (
    <div className="min-h-screen flex flex-col bg-card">
      <SEO
        title="Diagnóstico de Crédito com Dados do Banco Central"
        description="Entenda o relatório SCR do Registrato e organize informações que podem ser consideradas por instituições financeiras na análise de crédito empresarial."
        keywords="scr banco central, registrato, diagnóstico de crédito empresarial, relatório de empréstimos e financiamentos"
        structuredData={serviceStructuredData("Diagnóstico de Crédito com Dados do Banco Central", "Orientação sobre o relatório SCR do Registrato e organização do perfil de crédito empresarial.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#003F7F] via-[#002D5C] to-[#001a4d] text-primary-foreground py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-warning rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-warning rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-warning/20 border border-warning/30/40 rounded-full px-4 py-2 mb-6">
              <BarChart3 className="h-4 w-4 text-warning" />
              <span className="text-warning text-sm font-semibold">SCR e Registrato</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Diagnóstico de Crédito<br />
              <span className="text-warning">com Dados do Banco Central</span>
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90 mb-8 leading-relaxed">
              Entenda o que aparece no relatório SCR do Registrato, organize seus dados e prepare a empresa para uma análise feita pela instituição financeira.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="bg-warning hover:bg-warning text-foreground font-bold px-8">
                <Link href="/captura?produto=rating-banco-central">
                  Solicitar Diagnóstico
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-primary-foreground hover:bg-card/10 font-bold px-8">
                <a href="https://wa.me/556135268355?text=Olá! Quero entender os dados de crédito da minha empresa no SCR/Registrato." target="_blank" rel="noopener noreferrer">
                  Falar com Especialista
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* O QUE É RATING */}
      <section className="py-14 bg-card">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-foreground mb-4">O que é o relatório SCR?</h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  O <strong>Relatório de Empréstimos e Financiamentos (SCR)</strong>, acessível pelo Registrato, reúne dívidas e compromissos informados ao Banco Central por instituições financeiras. O Banco Central não atribui uma nota comercial pública à empresa. As instituições usam critérios próprios de análise.
                </p>
                <ul className="space-y-3">
                  {[
                    "Operações de crédito informadas ao sistema",
                    "Saldos, limites e situação dos contratos",
                    "Informações que devem ser conferidas pela empresa",
                    "Base útil para organizar o diagnóstico financeiro",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-foreground text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-muted rounded-2xl p-8">
                <h3 className="font-bold text-foreground mb-6 text-center">Leitura consultiva do perfil</h3>
                <div className="space-y-3">
                  {[
                    { nivel: "1", cor: "bg-primary", desc: "Conferência dos dados do SCR" },
                    { nivel: "2", cor: "bg-primary", desc: "Organização cadastral e documental" },
                    { nivel: "3", cor: "bg-warning/100", desc: "Avaliação de capacidade de pagamento" },
                    { nivel: "4", cor: "bg-success", desc: "Plano de preparação para a proposta" },
                  ].map((r) => (
                    <div key={r.nivel} className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${r.cor} flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0`}>
                        {r.nivel}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{r.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FATORES QUE INFLUENCIAM */}
      <section className="py-14 bg-muted">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">Fatores comuns em análises de crédito</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Cada instituição financeira aplica sua própria política. Organizar estes fatores ajuda a preparar uma proposta mais consistente.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: BarChart3,
                  title: "Situação Financeira",
                  color: "text-primary",
                  bg: "bg-primary/10",
                  items: ["Faturamento anual", "Lucratividade", "Endividamento", "Fluxo de caixa", "Patrimônio líquido"],
                },
                {
                  icon: FileText,
                  title: "Histórico de Crédito",
                  color: "text-success",
                  bg: "bg-success/10",
                  items: ["Pontualidade nos pagamentos", "Histórico de inadimplência", "Relacionamento com bancos", "Tempo de conta ativa", "Uso de limite"],
                },
                {
                  icon: Building2,
                  title: "Dados Cadastrais",
                  color: "text-primary",
                  bg: "bg-primary/10",
                  items: ["Tempo de existência da empresa", "Setor de atuação", "Porte da empresa", "Regularidade fiscal", "Situação na Receita Federal"],
                },
              ].map((f) => (
                <div key={f.title} className="bg-card rounded-2xl p-6 shadow-sm border border-border">
                  <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                    <f.icon className={`h-6 w-6 ${f.color}`} />
                  </div>
                  <h3 className="font-bold text-foreground mb-4">{f.title}</h3>
                  <ul className="space-y-2">
                    {f.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COMO MELHORAR */}
      <section className="py-14 bg-card">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">Como preparar melhor sua empresa</h2>
              <p className="text-muted-foreground">Ações práticas para organizar o perfil antes de uma solicitação</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                { num: "01", title: "Mantenha cadastro atualizado", desc: "Atualize regularmente os dados da empresa no banco: endereço, contatos, sócios, faturamento e documentos." },
                { num: "02", title: "Pague em dia", desc: "Honre todos os compromissos financeiros no prazo. O histórico de pagamentos é um dos fatores mais importantes." },
                { num: "03", title: "Limpe restrições", desc: "Regularize qualquer pendência no CPF/CNPJ, SPC, Serasa e Receita Federal antes de solicitar crédito." },
                { num: "04", title: "Movimente a conta", desc: "Mantenha movimentação regular na conta empresarial. Bancos valorizam o relacionamento ativo." },
                { num: "05", title: "Organize o financeiro", desc: "Mantenha balanços atualizados, separe finanças pessoais das empresariais e demonstre saúde financeira." },
                { num: "06", title: "Consulte um especialista", desc: "A Destrava Crédito analisa o perfil e orienta ações de organização antes da proposta." },
              ].map((item) => (
                <div key={item.num} className="flex gap-4 p-5 bg-muted rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-caixa-blue)] text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {item.num}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ALERTA */}
      <section className="py-8 bg-warning/10 border-y border-warning/20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-warning mb-1">Importante</p>
              <p className="text-sm text-warning">
                O SCR é um relatório de operações informadas ao Banco Central, não uma nota de aprovação. A decisão, o limite e as condições pertencem à instituição financeira. A Destrava atua como assessoria na organização e leitura do perfil.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* NOSSOS SERVIÇOS */}
      <section className="py-14 bg-card">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-foreground text-center mb-12">Como a Destrava Crédito Pode Ajudar</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Shield,
                  title: "Análise de Perfil",
                  desc: "Avaliamos a situação atual e identificamos pontos cadastrais, financeiros e documentais que merecem atenção.",
                  color: "text-primary",
                  bg: "bg-primary/10",
                },
                {
                  icon: TrendingUp,
                  title: "Plano de Melhoria",
                  desc: "Desenvolvemos um plano de preparação para apresentar informações mais consistentes à instituição financeira.",
                  color: "text-success",
                  bg: "bg-success/10",
                },
                {
                  icon: Clock,
                  title: "Acompanhamento",
                  desc: "Acompanhamos as pendências e ajustamos a estratégia conforme a evolução da empresa e da solicitação.",
                  color: "text-primary",
                  bg: "bg-primary/10",
                },
              ].map((s) => (
                <div key={s.title} className="text-center p-6 bg-muted rounded-2xl">
                  <div className={`w-14 h-14 rounded-2xl ${s.bg} flex items-center justify-center mx-auto mb-4`}>
                    <s.icon className={`h-7 w-7 ${s.color}`} />
                  </div>
                  <h3 className="font-bold text-foreground mb-3">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-14 bg-gradient-to-br from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-primary-foreground">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Solicite um Diagnóstico de Crédito</h2>
            <p className="text-primary-foreground/90 mb-8 text-lg">
              Nossa equipe analisa seu perfil, identifica oportunidades de melhoria e orienta o caminho para melhores condições de crédito.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-warning hover:bg-warning text-foreground font-bold px-8">
                <Link href="/captura?produto=rating-banco-central">
                  Solicitar Análise de Perfil
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-primary-foreground hover:bg-card/10 font-bold px-8">
                <a href="https://wa.me/556135268355?text=Olá! Quero entender os dados da minha empresa no SCR/Registrato." target="_blank" rel="noopener noreferrer">
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
