import { Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ArrowRight,
  DollarSign,
  Calendar,
  Percent,
  Building2,
  Zap,
  Shield,
  Star,
  Phone,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";

const WA_LINK = "https://wa.me/5561986055223?text=Olá!%20Quero%20saber%20mais%20sobre%20o%20Giro%20CAIXA%20Fácil.";

const faqs = [
  {
    q: "O que é o Giro CAIXA Fácil?",
    a: "O Giro CAIXA Fácil é uma linha de capital de giro da Caixa Econômica Federal para empresas com faturamento anual de até R$ 50 milhões. Oferece crédito de até R$ 1 milhão com taxa pré-fixada e prazo de até 40 meses.",
  },
  {
    q: "Quem pode contratar?",
    a: "Empresas com faturamento anual de até R$ 50 milhões que possuam conta corrente empresarial e o produto Cheque Empresa ativo na Caixa Econômica Federal.",
  },
  {
    q: "Qual o valor máximo disponível?",
    a: "Crédito de até R$ 1 milhão por cliente, conforme análise de crédito e faturamento da empresa.",
  },
  {
    q: "Quais são os custos?",
    a: "Taxa pré-fixada definida no contrato, mais IOF e tarifa de abertura de 1% (mínimo R$ 20, máximo R$ 1.000). Nossa equipe detalha todos os custos antes da contratação.",
  },
  {
    q: "Para que posso usar o crédito?",
    a: "Compra de mercadorias, pagamento de fornecedores, antecipação de receitas, reforço de caixa e qualquer necessidade de capital de giro da empresa.",
  },
  {
    q: "Como a Destrava Crédito me ajuda?",
    a: "Nossa equipe verifica sua elegibilidade, organiza a documentação, acompanha o processo na Caixa e garante que você obtenha as melhores condições disponíveis.",
  },
];

export default function GiroCaixaFacilLP() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Giro CAIXA Fácil - Capital de Giro para Empresas | Destrava Crédito"
        description="Giro CAIXA Fácil: até R$ 1 milhão para capital de giro, prazo de 40 meses, taxa pré-fixada. Para empresas com faturamento até R$ 50 milhões. Destrava Crédito cuida de tudo."
        keywords="giro caixa fácil, capital de giro caixa, crédito empresarial caixa, empréstimo empresa caixa econômica, capital de giro fácil"
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#003087] via-[#0047b3] to-[#0066cc] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-orange-400/20 border border-orange-400/40 rounded-full px-4 py-2 mb-6">
                <Zap className="h-4 w-4 text-orange-400" />
                <span className="text-orange-300 text-sm font-semibold">Caixa Econômica Federal</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Giro CAIXA Fácil<br />
                <span className="text-orange-400">Capital de giro</span><br />
                sem complicação
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
                Até <strong>R$ 1 milhão</strong> para reforçar o caixa da sua empresa. Taxa pré-fixada, prazo de até <strong>40 meses</strong> e atendimento nas agências da Caixa.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/simular">
                  <Button size="lg" className="bg-orange-400 hover:bg-orange-500 text-black font-bold px-8 w-full sm:w-auto">
                    Simular Agora
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8 w-full sm:w-auto">
                    Falar com Especialista
                  </Button>
                </a>
              </div>
            </div>
            <div className="hidden md:flex flex-col gap-4">
              <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20">
                <img src="/logo-caixa.png" alt="Caixa Econômica Federal" className="h-14 object-contain mb-4 bg-white rounded-lg p-2" />
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Valor máximo", value: "R$ 1 milhão" },
                    { label: "Prazo", value: "Até 40 meses" },
                    { label: "Faturamento máx.", value: "R$ 50M/ano" },
                    { label: "Taxa", value: "Pré-fixada" },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/10 rounded-xl p-3 text-center">
                      <p className="text-white/70 text-xs mb-1">{item.label}</p>
                      <p className="text-white font-bold text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="py-12 bg-gray-50 border-b">
        <div className="container px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: DollarSign, value: "R$ 1M", label: "Limite máximo", color: "text-blue-600" },
              { icon: Calendar, value: "40 meses", label: "Prazo máximo", color: "text-orange-600" },
              { icon: Building2, value: "R$ 50M", label: "Faturamento máx.", color: "text-green-600" },
              { icon: Percent, value: "Pré-fixada", label: "Taxa contratual", color: "text-purple-600" },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <item.icon className={`h-8 w-8 ${item.color} mx-auto mb-3`} />
                <p className={`text-2xl font-bold ${item.color} mb-1`}>{item.value}</p>
                <p className="text-gray-500 text-sm">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARA QUE SERVE */}
      <section className="py-16 md:py-20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Para que usar o Giro CAIXA Fácil?</h2>
            <p className="text-lg text-gray-600">Capital de giro imediato para as necessidades do dia a dia da sua empresa.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Building2, title: "Compra de mercadorias", desc: "Estoque para aproveitar oportunidades de mercado" },
              { icon: Shield, title: "Pagar fornecedores", desc: "Honrar compromissos e manter bons relacionamentos" },
              { icon: Zap, title: "Antecipar receitas", desc: "Reforço de caixa antes de recebimentos futuros" },
              { icon: Star, title: "Capital de giro geral", desc: "Qualquer necessidade operacional da empresa" },
            ].map((item) => (
              <div key={item.title} className="bg-blue-50 rounded-2xl p-6 border border-blue-100 text-center">
                <item.icon className="h-10 w-10 text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Por que escolher o Giro CAIXA Fácil?</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { title: "Até R$ 1 milhão", desc: "Volume expressivo para empresas de médio porte que precisam de capital de giro robusto." },
              { title: "Taxa pré-fixada", desc: "Você sabe exatamente quanto vai pagar desde o início, sem surpresas com variações de taxa." },
              { title: "Prazo de até 40 meses", desc: "Parcelas que cabem no fluxo de caixa, com prazo superior às linhas convencionais." },
              { title: "Parcelamento flexível", desc: "Atendimento nas agências da Caixa com possibilidade de adequar as parcelas ao seu faturamento." },
              { title: "Reforço imediato", desc: "Crédito disponível rapidamente após aprovação, sem espera prolongada." },
              { title: "Assessoria Destrava", desc: "Cuidamos de toda a documentação e acompanhamos o processo até a liberação." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <CheckCircle2 className="h-6 w-6 text-blue-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-6 max-w-4xl mx-auto flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Requisito importante</h3>
              <p className="text-gray-600 text-sm">É necessário ter conta corrente empresarial e o produto Cheque Empresa ativo na Caixa Econômica Federal. Nossa equipe orienta sobre como regularizar esses requisitos.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20">
        <div className="container px-4 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10 text-center">Perguntas frequentes</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-6 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-gray-900">{faq.q}</span>
                  <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 text-gray-600 text-sm leading-relaxed">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#003087] to-[#0066cc] text-white">
        <div className="container px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Acesse o Giro CAIXA Fácil agora</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">Nossa equipe analisa sua elegibilidade gratuitamente e acompanha todo o processo até a liberação do crédito.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/simular">
              <Button size="lg" className="bg-orange-400 hover:bg-orange-500 text-black font-bold px-10">
                Simular Agora
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-10">
                <Phone className="mr-2 h-5 w-5" />
                Falar com Especialista
              </Button>
            </a>
          </div>
          <p className="text-white/60 text-sm mt-6">Análise gratuita · Sem compromisso · Atendimento em até 2h úteis</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
