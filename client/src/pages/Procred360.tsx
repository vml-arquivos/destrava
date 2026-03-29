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
  Shield,
  Zap,
  TrendingDown,
  Star,
  Clock,
  Phone,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";

const WA_LINK = "https://wa.me/5561986055223?text=Olá!%20Quero%20saber%20mais%20sobre%20o%20ProCred%20360.";

const faqs = [
  {
    q: "O que é o ProCred 360?",
    a: "O ProCred 360 é uma linha de crédito do programa federal 'Acredita', voltada para MEIs e microempresas com faturamento anual de até R$ 360 mil. Oferece juros cerca de 50% menores que os praticados no mercado.",
  },
  {
    q: "Qual o limite de crédito disponível?",
    a: "Até 30% do faturamento bruto anual, podendo chegar a 50% para negócios liderados por mulheres, com teto de R$ 150.000 por CNPJ.",
  },
  {
    q: "Quais são as taxas de juros?",
    a: "As taxas são cerca de 50% menores que as praticadas no mercado para o mesmo perfil de empresa. O programa incentiva a adimplência com bonificação nas taxas.",
  },
  {
    q: "Quais garantias são exigidas?",
    a: "As operações são cobertas pelo Fundo Garantidor de Micro e Pequenas Empresas (FGO), o que facilita muito a aprovação mesmo sem bens para oferecer.",
  },
  {
    q: "Como a Destrava Crédito me ajuda?",
    a: "Nossa equipe analisa seu faturamento, organiza a documentação, identifica o banco parceiro com melhores condições e acompanha todo o processo até a liberação do crédito.",
  },
];

export default function Procred360() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="ProCred 360 - Crédito Rápido para MEI e Microempresa | Destrava Crédito"
        description="ProCred 360: juros 50% menores que o mercado para MEI e microempresas com faturamento até R$ 360 mil. Até R$ 150k, garantia FGO. Destrava Crédito cuida de tudo."
        keywords="procred 360, crédito MEI, crédito microempresa, programa acredita, empréstimo baixo juros MEI, crédito faturamento 360 mil"
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#1a237e] via-[#283593] to-[#3949ab] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-green-400 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-yellow-400/20 border border-yellow-400/40 rounded-full px-4 py-2 mb-6">
                <Zap className="h-4 w-4 text-yellow-400" />
                <span className="text-yellow-300 text-sm font-semibold">Programa Acredita · Governo Federal</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                ProCred 360<br />
                <span className="text-yellow-400">Crédito rápido</span><br />
                para crescer
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
                Juros <strong>50% menores</strong> que o mercado para MEI e microempresas. Até <strong>R$ 150.000</strong> com garantia do FGO. Sem burocracia.
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
                <img src="/logo-procred360.webp" alt="ProCred 360" className="h-16 object-contain mb-4 bg-white rounded-lg p-2" />
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Faturamento máximo", value: "R$ 360 mil/ano" },
                    { label: "Limite de crédito", value: "Até R$ 150k" },
                    { label: "Juros", value: "50% menores" },
                    { label: "Garantia", value: "FGO" },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/10 rounded-xl p-3 text-center">
                      <p className="text-white/70 text-xs mb-1">{item.label}</p>
                      <p className="text-white font-bold text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-yellow-400/20 border border-yellow-400/30 rounded-2xl p-4 flex items-center gap-3">
                <Star className="h-6 w-6 text-yellow-400 flex-shrink-0" />
                <p className="text-white/90 text-sm"><strong>Bônus de adimplência:</strong> pague em dia e ganhe desconto nas taxas</p>
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
              { icon: DollarSign, value: "R$ 150k", label: "Limite por CNPJ", color: "text-blue-600" },
              { icon: TrendingDown, value: "50% menor", label: "Taxa vs. mercado", color: "text-green-600" },
              { icon: Shield, value: "FGO", label: "Garantia federal", color: "text-purple-600" },
              { icon: Clock, value: "Rápido", label: "Aprovação ágil", color: "text-orange-600" },
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

      {/* BENEFÍCIOS */}
      <section className="py-16 md:py-20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Por que o ProCred 360 é diferente?</h2>
            <p className="text-lg text-gray-600">Um programa criado para dar fôlego a quem mais precisa.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { title: "Juros 50% menores", desc: "Taxa muito abaixo do mercado para o mesmo perfil de empresa, protegida pelo programa federal." },
              { title: "Garantia FGO inclusa", desc: "O Fundo Garantidor de Micro e Pequenas Empresas cobre a operação, facilitando a aprovação." },
              { title: "Bônus por adimplência", desc: "Pague em dia e ganhe bonificação nas taxas, reduzindo ainda mais o custo do crédito." },
              { title: "Limite ampliado para mulheres", desc: "Empreendedoras têm limite de 50% do faturamento, com teto de R$ 150.000." },
              { title: "Processo simplificado", desc: "A Destrava Crédito organiza toda a documentação e acompanha até a aprovação." },
              { title: "Programa Acredita", desc: "Parte do pacote de políticas públicas para fomentar o empreendedorismo no Brasil." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Como funciona com a Destrava?</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { step: "01", title: "Análise gratuita", desc: "Verificamos seu faturamento e elegibilidade sem custo." },
              { step: "02", title: "Documentação", desc: "Organizamos todos os documentos necessários." },
              { step: "03", title: "Banco parceiro", desc: "Identificamos a melhor instituição para seu perfil." },
              { step: "04", title: "Crédito liberado", desc: "Acompanhamos até o dinheiro na sua conta." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 bg-[#1a237e] text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">{item.step}</div>
                <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
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
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#1a237e] to-[#3949ab] text-white">
        <div className="container px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Acesse o ProCred 360 agora</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">Juros 50% menores que o mercado. Nossa equipe analisa seu caso gratuitamente e cuida de tudo.</p>
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
