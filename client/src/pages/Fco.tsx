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
  MapPin,
  Leaf,
  Building2,
  TrendingUp,
  Star,
  Phone,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";

const WA_LINK = "https://wa.me/5561986055223?text=Olá!%20Quero%20saber%20mais%20sobre%20o%20FCO.";

const setores = [
  { icon: Building2, title: "Indústria", desc: "Implantação, ampliação e modernização de unidades industriais" },
  { icon: TrendingUp, title: "Comércio e Serviços", desc: "Capital de giro e investimento para empresas comerciais e de serviços" },
  { icon: Leaf, title: "Agronegócio", desc: "Projetos rurais, irrigação, mecanização e infraestrutura agrícola" },
  { icon: Star, title: "Inovação e Tecnologia", desc: "Projetos de inovação com taxas especiais a partir de 8,60% a.a." },
];

const faqs = [
  {
    q: "O que é o FCO?",
    a: "O FCO (Fundo Constitucional de Financiamento do Centro-Oeste) é um programa federal que apoia projetos empresariais e rurais em Goiás, Mato Grosso, Mato Grosso do Sul e Distrito Federal, com juros abaixo do mercado e prazos longos.",
  },
  {
    q: "Quem pode acessar o FCO?",
    a: "Empresas e produtores rurais localizados nos estados de GO, MT, MS e DF. Atende desde MEIs até grandes empresas, com condições diferenciadas por porte.",
  },
  {
    q: "Quais são as taxas de juros?",
    a: "Em 2025, as taxas prefixadas variam de 10,40% a 13,37% ao ano, com bônus de 15% para pagadores pontuais. Projetos de sustentabilidade têm taxa especial de 8,60% a.a.",
  },
  {
    q: "Quais os prazos disponíveis?",
    a: "Para investimento e capital de giro associado, empresas podem pagar em até 12 anos com carência de até 3 anos. MEIs têm prazos menores (até 36 meses). Projetos de inovação rural podem chegar a 15 anos.",
  },
  {
    q: "Qual o limite de crédito?",
    a: "Capital de giro dissociado pode chegar a R$ 1 milhão. No investimento, o giro associado pode ser até 30% do valor do projeto, sem limite máximo definido para projetos de grande porte.",
  },
  {
    q: "Como a Destrava Crédito me ajuda?",
    a: "Nossa equipe conhece profundamente o FCO e suas modalidades. Analisamos seu projeto, identificamos a linha mais adequada, organizamos a documentação e acompanhamos até a aprovação.",
  },
];

export default function Fco() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="FCO - Financiamento para Empresas do Centro-Oeste | Destrava Crédito"
        description="FCO: financiamento para projetos empresariais e rurais em GO, MT, MS e DF. Juros a partir de 8,60% a.a., prazo até 15 anos, bônus por pontualidade. Destrava Crédito."
        keywords="FCO, fundo constitucional centro-oeste, financiamento Goiás, financiamento Mato Grosso, crédito rural centro-oeste, FCO empresarial"
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#4a148c] via-[#6a1b9a] to-[#7b1fa2] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-green-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 rounded-full px-4 py-2 mb-6">
                <MapPin className="h-4 w-4 text-white" />
                <span className="text-white/90 text-sm font-semibold">GO · MT · MS · DF — Fundo Constitucional</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                FCO<br />
                <span className="text-green-300">Financiamento</span><br />
                para o Centro-Oeste
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
                Juros a partir de <strong>8,60% ao ano</strong>, prazo de até <strong>15 anos</strong> e bônus de 15% para quem paga em dia. Para empresas e produtores rurais do Centro-Oeste.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/simular">
                  <Button size="lg" className="bg-green-400 hover:bg-green-500 text-black font-bold px-8 w-full sm:w-auto">
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
                <img src="/logo-fco.png" alt="FCO - Fundo Constitucional do Centro-Oeste" className="h-20 w-full object-contain mb-4 rounded-lg" />
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Taxa mínima", value: "8,60% a.a." },
                    { label: "Prazo máximo", value: "15 anos" },
                    { label: "Carência", value: "Até 3 anos" },
                    { label: "Bônus pontualidade", value: "15%" },
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
              { icon: Percent, value: "8,60%", label: "Taxa mínima a.a.", color: "text-purple-600" },
              { icon: Calendar, value: "15 anos", label: "Prazo máximo", color: "text-green-600" },
              { icon: DollarSign, value: "R$ 1M", label: "Capital de giro", color: "text-blue-600" },
              { icon: Star, value: "15%", label: "Bônus pontualidade", color: "text-orange-600" },
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

      {/* SETORES ATENDIDOS */}
      <section className="py-16 md:py-20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Setores atendidos pelo FCO</h2>
            <p className="text-lg text-gray-600">O FCO financia projetos em diversos setores da economia do Centro-Oeste.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {setores.map((item) => (
              <div key={item.title} className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-100 text-center">
                <item.icon className="h-10 w-10 text-purple-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ESTADOS */}
      <section className="py-12 bg-purple-50">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Onde o FCO está disponível?</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { estado: "Goiás", sigla: "GO", cor: "bg-green-100 border-green-300 text-green-800" },
                { estado: "Mato Grosso", sigla: "MT", cor: "bg-blue-100 border-blue-300 text-blue-800" },
                { estado: "Mato Grosso do Sul", sigla: "MS", cor: "bg-orange-100 border-orange-300 text-orange-800" },
                { estado: "Distrito Federal", sigla: "DF", cor: "bg-purple-100 border-purple-300 text-purple-800" },
              ].map((item) => (
                <div key={item.sigla} className={`rounded-2xl p-4 border-2 ${item.cor} text-center`}>
                  <p className="text-3xl font-bold mb-1">{item.sigla}</p>
                  <p className="text-sm font-medium">{item.estado}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="py-16 md:py-20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Por que escolher o FCO?</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { title: "Juros muito abaixo do mercado", desc: "Taxas de 10,40% a 13,37% a.a. para empresas, e 8,60% a.a. para projetos de sustentabilidade." },
              { title: "Bônus por pontualidade", desc: "Pague em dia e ganhe 15% de desconto nas parcelas, reduzindo significativamente o custo total." },
              { title: "Prazo de até 15 anos", desc: "Para projetos de inovação rural, com carência de até 5 anos. Empresas têm até 12 anos." },
              { title: "Carência generosa", desc: "Até 3 anos de carência para empresas, dando tempo para o investimento gerar retorno." },
              { title: "Múltiplos setores", desc: "Indústria, comércio, serviços, turismo, agronegócio, inovação e tecnologia." },
              { title: "Assessoria especializada", desc: "A Destrava Crédito conhece o FCO a fundo e cuida de todo o processo para você." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <CheckCircle2 className="h-6 w-6 text-purple-500 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20 bg-gray-50">
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
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#4a148c] to-[#7b1fa2] text-white">
        <div className="container px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Acesse o FCO com a Destrava</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">Nossa equipe analisa seu projeto gratuitamente e encontra as melhores condições disponíveis no Centro-Oeste.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/simular">
              <Button size="lg" className="bg-green-400 hover:bg-green-500 text-black font-bold px-10">
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
