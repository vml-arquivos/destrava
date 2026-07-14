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

export default function RatingBancoBrasil() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Preparação para Análise de Crédito no Banco do Brasil"
        description="Organize dados cadastrais, financeiros e documentos antes de solicitar crédito empresarial. A decisão e a classificação interna pertencem ao Banco do Brasil."
        keywords="análise de crédito banco do brasil, rating interno, preparação crédito empresarial, documentos crédito empresa"
        structuredData={serviceStructuredData("Preparação para Análise de Crédito no Banco do Brasil", "Diagnóstico consultivo para organizar o perfil empresarial antes de uma solicitação de crédito.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#003F7F] via-[#002D5C] to-[#001a4d] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-400 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-yellow-400/20 border border-yellow-400/40 rounded-full px-4 py-2 mb-6">
              <BarChart3 className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-300 text-sm font-semibold">Banco do Brasil</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Preparação para Análise<br />
              <span className="text-yellow-400">no Banco do Brasil</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              Organize cadastro, documentos e informações financeiras antes da proposta. A metodologia, a classificação interna e a decisão são exclusivas do banco.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8">
                <Link href="/simular">
                  Solicitar Diagnóstico
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                <a href="https://wa.me/556135268355?text=Olá! Quero preparar minha empresa para uma análise de crédito no Banco do Brasil." target="_blank" rel="noopener noreferrer">
                  Falar com Especialista
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* O QUE É RATING */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Como funciona a análise?</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Instituições financeiras podem utilizar classificações internas e outros critérios de risco. A metodologia exata não é controlada pela Destrava e pode mudar. Em geral, a proposta considera fatores como:
                </p>
                <ul className="space-y-3">
                  {[
                    "Cadastro e regularidade da empresa",
                    "Capacidade de pagamento e fluxo de caixa",
                    "Histórico de crédito e endividamento",
                    "Documentos e garantias da operação",
                    "Relacionamento e política vigente do banco",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gray-50 rounded-2xl p-8">
                <h3 className="font-bold text-gray-900 mb-6 text-center">Etapas do diagnóstico consultivo</h3>
                <div className="space-y-3">
                  {[
                    { nivel: "1", cor: "bg-blue-600", desc: "Conferência cadastral" },
                    { nivel: "2", cor: "bg-sky-600", desc: "Análise documental" },
                    { nivel: "3", cor: "bg-amber-500", desc: "Leitura financeira" },
                    { nivel: "4", cor: "bg-emerald-600", desc: "Preparação da solicitação" },
                  ].map((r) => (
                    <div key={r.nivel} className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${r.cor} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                        {r.nivel}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{r.desc}</p>
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
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Fatores comuns na análise</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                A instituição pode avaliar múltiplos critérios conforme sua política vigente. Entender cada um ajuda a preparar uma solicitação mais consistente.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: BarChart3,
                  title: "Situação Financeira",
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                  items: ["Faturamento anual", "Lucratividade", "Endividamento", "Fluxo de caixa", "Patrimônio líquido"],
                },
                {
                  icon: FileText,
                  title: "Histórico de Crédito",
                  color: "text-green-600",
                  bg: "bg-green-50",
                  items: ["Pontualidade nos pagamentos", "Histórico de inadimplência", "Relacionamento com bancos", "Tempo de conta ativa", "Uso de limite"],
                },
                {
                  icon: Building2,
                  title: "Dados Cadastrais",
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                  items: ["Tempo de existência da empresa", "Setor de atuação", "Porte da empresa", "Regularidade fiscal", "Situação na Receita Federal"],
                },
              ].map((f) => (
                <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                    <f.icon className={`h-6 w-6 ${f.color}`} />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-4">{f.title}</h3>
                  <ul className="space-y-2">
                    {f.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
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
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Como preparar melhor sua empresa</h2>
              <p className="text-gray-600">Ações práticas antes de apresentar uma solicitação</p>
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
                <div key={item.num} className="flex gap-4 p-5 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-caixa-blue)] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {item.num}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-gray-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ALERTA */}
      <section className="py-8 bg-amber-50 border-y border-amber-200">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800 mb-1">Importante</p>
              <p className="text-sm text-amber-700">
                O Banco do Brasil aplica critérios e classificações internos que não são definidos nem garantidos pela Destrava. Nosso diagnóstico é consultivo e não representa nota oficial, pré-aprovação ou promessa de crédito.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* NOSSOS SERVIÇOS */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Como a Destrava Crédito Pode Ajudar</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Shield,
                  title: "Análise de Perfil",
                  desc: "Avaliamos a situação atual e identificamos pontos cadastrais, financeiros e documentais que merecem atenção.",
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },
                {
                  icon: TrendingUp,
                  title: "Plano de Melhoria",
                  desc: "Desenvolvemos um plano de preparação para apresentar informações mais consistentes à instituição financeira.",
                  color: "text-green-600",
                  bg: "bg-green-50",
                },
                {
                  icon: Clock,
                  title: "Acompanhamento",
                  desc: "Acompanhamos as pendências e ajustamos a estratégia conforme a evolução da empresa e da solicitação.",
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                },
              ].map((s) => (
                <div key={s.title} className="text-center p-6 bg-gray-50 rounded-2xl">
                  <div className={`w-14 h-14 rounded-2xl ${s.bg} flex items-center justify-center mx-auto mb-4`}>
                    <s.icon className={`h-7 w-7 ${s.color}`} />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-3">{s.title}</h3>
                  <p className="text-sm text-gray-600">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-14 bg-gradient-to-br from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Prepare sua Empresa para a Análise</h2>
            <p className="text-white/90 mb-8 text-lg">
              Nossa equipe analisa seu perfil, identifica oportunidades de melhoria e orienta o caminho para melhores condições de crédito.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8">
                <Link href="/simular">
                  Solicitar Análise Gratuita
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                <a href="https://wa.me/556135268355?text=Olá! Quero preparar minha empresa para uma análise de crédito no Banco do Brasil." target="_blank" rel="noopener noreferrer">
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
