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
  Shield,
  Building2,
  TrendingUp,
  Star,
  Phone,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";

const WA_LINK = "https://wa.me/5561986055223?text=Olá!%20Quero%20saber%20mais%20sobre%20o%20PEAC%20FGI.";

const faqs = [
  {
    q: "O que é o PEAC FGI?",
    a: "O PEAC (Programa Emergencial de Acesso ao Crédito) com garantia do FGI (Fundo Garantidor de Investimentos) é uma linha de crédito voltada para micro, pequenas e médias empresas que precisam de capital de giro ou investimento, com valores de R$ 5 mil a R$ 10 milhões.",
  },
  {
    q: "Quem pode acessar o PEAC FGI?",
    a: "Micro, pequenas e médias empresas (inclusive MEI) com faturamento anual de até R$ 300 milhões. Os limites variam conforme o banco operador.",
  },
  {
    q: "Quais os valores e prazos disponíveis?",
    a: "Financiamento de R$ 5 mil a R$ 10 milhões, com prazo de 36 a 60 meses e carência obrigatória de 6 a 12 meses.",
  },
  {
    q: "Quais garantias são exigidas?",
    a: "A cobertura do FGI reduz a necessidade de garantias reais. Exige aval dos sócios e pode exigir garantias acessórias dependendo do valor e perfil da empresa.",
  },
  {
    q: "Há custos adicionais?",
    a: "Sim, há cobrança de IOF e Encargo por Concessão de Garantia (ECG), vigente desde 01/01/2024. Nossa equipe detalha todos os custos antes da contratação.",
  },
  {
    q: "Como a Destrava Crédito me ajuda?",
    a: "Analisamos seu perfil, identificamos o banco com melhores condições, organizamos a documentação e acompanhamos todo o processo até a aprovação e liberação.",
  },
];

export default function PeacFgi() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="PEAC FGI - Crédito com Garantia do FGI para Empresas | Destrava Crédito"
        description="PEAC FGI: de R$ 5 mil a R$ 10 milhões para micro, pequenas e médias empresas. Carência de 6 a 12 meses, prazo até 60 meses. Destrava Crédito cuida de tudo."
        keywords="PEAC FGI, fundo garantidor investimentos, crédito empresarial garantia, BNDES FGI, capital de giro garantia, crédito média empresa"
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#1b5e20] via-[#2e7d32] to-[#388e3c] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-400 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 rounded-full px-4 py-2 mb-6">
                <Shield className="h-4 w-4 text-white" />
                <span className="text-white/90 text-sm font-semibold">BNDES · Fundo Garantidor de Investimentos</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                PEAC FGI<br />
                <span className="text-yellow-300">Crédito com garantia</span><br />
                para crescer
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
                De <strong>R$ 5 mil a R$ 10 milhões</strong> para micro, pequenas e médias empresas. Garantia do FGI reduz exigência de bens. Carência de até 12 meses.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/simular">
                  <Button size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8 w-full sm:w-auto">
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
                <img src="/logo-bndes-fgi.jpg" alt="BNDES FGI" className="h-14 object-contain mb-4 bg-white rounded-lg p-2" />
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Valor mínimo", value: "R$ 5.000" },
                    { label: "Valor máximo", value: "R$ 10 milhões" },
                    { label: "Prazo", value: "36 a 60 meses" },
                    { label: "Carência", value: "6 a 12 meses" },
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
              { icon: DollarSign, value: "R$ 10M", label: "Limite máximo", color: "text-green-600" },
              { icon: Calendar, value: "60 meses", label: "Prazo máximo", color: "text-blue-600" },
              { icon: Shield, value: "FGI", label: "Garantia BNDES", color: "text-purple-600" },
              { icon: TrendingUp, value: "12 meses", label: "Carência máxima", color: "text-orange-600" },
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

      {/* PÚBLICO-ALVO */}
      <section className="py-16 md:py-20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Para quem é o PEAC FGI?</h2>
            <p className="text-lg text-gray-600">Uma linha robusta para empresas que precisam de volumes maiores de crédito.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Building2, title: "MEI e Microempresas", desc: "Faturamento anual até R$ 360 mil — acesso a crédito com garantia facilitada", color: "bg-blue-50 border-blue-200" },
              { icon: TrendingUp, title: "Pequenas Empresas", desc: "Faturamento até R$ 4,8 milhões — capital de giro e investimento em expansão", color: "bg-green-50 border-green-200" },
              { icon: Star, title: "Médias Empresas", desc: "Faturamento até R$ 300 milhões — grandes volumes com garantia do FGI", color: "bg-purple-50 border-purple-200" },
            ].map((item) => (
              <div key={item.title} className={`rounded-2xl p-6 border-2 ${item.color} text-center`}>
                <item.icon className="h-10 w-10 text-gray-700 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Vantagens do PEAC FGI</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { title: "Acesso a grandes volumes", desc: "Financiamento de até R$ 10 milhões, muito acima das linhas convencionais para PMEs." },
              { title: "Garantia do FGI reduz exigências", desc: "O Fundo Garantidor de Investimentos do BNDES cobre parte do risco, facilitando a aprovação." },
              { title: "Carência estendida", desc: "Até 12 meses de carência para começar a pagar, dando tempo para o investimento gerar retorno." },
              { title: "Prazo longo", desc: "Até 60 meses para pagamento, com parcelas que cabem no fluxo de caixa da empresa." },
              { title: "Capital de giro e investimento", desc: "Pode ser usado tanto para reforço de caixa quanto para expansão, equipamentos e infraestrutura." },
              { title: "Assessoria completa", desc: "A Destrava Crédito analisa, organiza e acompanha todo o processo até a liberação." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
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
              <h3 className="font-bold text-gray-900 mb-1">Atenção: custos adicionais</h3>
              <p className="text-gray-600 text-sm">Há cobrança de IOF e Encargo por Concessão de Garantia (ECG) vigente desde 01/01/2024. Nossa equipe detalha todos os custos antes de qualquer contratação.</p>
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
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#1b5e20] to-[#388e3c] text-white">
        <div className="container px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Acesse o PEAC FGI com a Destrava</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">Nossa equipe analisa seu perfil gratuitamente e encontra as melhores condições para sua empresa.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/simular">
              <Button size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-10">
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
