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
  Users,
  TrendingUp,
  FileText,
  Star,
  Clock,
  Phone,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";

const WA_LINK = "https://wa.me/5561986055223?text=Olá!%20Quero%20saber%20mais%20sobre%20o%20PRONAMPE.";

const faqs = [
  {
    q: "Quem pode solicitar o PRONAMPE?",
    a: "MEIs, microempresas e empresas de pequeno porte com faturamento anual de até R$ 4,8 milhões. Para empresas lideradas por mulheres, o limite de crédito sobe para 50% do faturamento.",
  },
  {
    q: "Qual o valor máximo que posso obter?",
    a: "Até 30% do faturamento anual bruto, limitado a R$ 150.000 por CNPJ. Para empresas lideradas por mulheres, o limite sobe para 50% do faturamento, também limitado a R$ 150.000.",
  },
  {
    q: "Qual a taxa de juros do PRONAMPE?",
    a: "A taxa máxima é Selic + 6% ao ano, sem tarifas de crédito adicionais. É uma das menores taxas disponíveis para micro e pequenas empresas no Brasil.",
  },
  {
    q: "Qual o prazo de pagamento?",
    a: "Até 48 meses para pagamento, com 6 meses de carência. Contratos podem ser renegociados para até 72 meses em situações específicas.",
  },
  {
    q: "Quais garantias são exigidas?",
    a: "Aval dos sócios e apoio do Fundo Garantidor de Operações (FGO), que facilita a aprovação mesmo para empresas sem bens para oferecer como garantia.",
  },
  {
    q: "Como a Destrava Crédito me ajuda no PRONAMPE?",
    a: "Nossa equipe analisa seu faturamento, organiza toda a documentação, identifica o banco com melhores condições e acompanha o processo até a aprovação e liberação do crédito.",
  },
];

export default function Pronampe() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="PRONAMPE - Crédito para Micro e Pequenas Empresas | Destrava Crédito"
        description="PRONAMPE: até R$ 150 mil com Selic + 6% ao ano para MEI, ME e EPP. 48 meses para pagar, 6 de carência. A Destrava Crédito cuida de tudo para você."
        keywords="pronampe, crédito micro empresa, crédito pequena empresa, pronampe 2025, empréstimo MEI, crédito empresarial baixo juros"
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#003F7F] via-[#0052a5] to-[#006fd6] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-green-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-green-400/20 border border-green-400/40 rounded-full px-4 py-2 mb-6">
                <Star className="h-4 w-4 text-green-400" />
                <span className="text-green-300 text-sm font-semibold">Programa Federal de Crédito</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                PRONAMPE<br />
                <span className="text-green-400">Crédito que impulsiona</span><br />
                sua empresa
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
                Até <strong>R$ 150.000</strong> com a menor taxa do mercado — <strong>Selic + 6% ao ano</strong>. Para MEI, microempresas e empresas de pequeno porte. A Destrava cuida de tudo.
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
                <img src="/logo-pronampe.jpg" alt="PRONAMPE" className="h-16 object-contain mb-4 rounded-lg" />
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Valor máximo", value: "R$ 150.000" },
                    { label: "Taxa", value: "Selic + 6% a.a." },
                    { label: "Prazo", value: "Até 48 meses" },
                    { label: "Carência", value: "6 meses" },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/10 rounded-xl p-3 text-center">
                      <p className="text-white/70 text-xs mb-1">{item.label}</p>
                      <p className="text-white font-bold text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-green-400/20 border border-green-400/30 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-400 flex-shrink-0" />
                <p className="text-white/90 text-sm"><strong>Garantia FGO:</strong> aprovação facilitada mesmo sem bens para oferecer</p>
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
              { icon: Percent, value: "Selic+6%", label: "Taxa máxima a.a.", color: "text-green-600" },
              { icon: Calendar, value: "48 meses", label: "Prazo de pagamento", color: "text-purple-600" },
              { icon: Clock, value: "6 meses", label: "Carência inicial", color: "text-orange-600" },
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

      {/* QUEM PODE */}
      <section className="py-16 md:py-20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Quem pode solicitar o PRONAMPE?</h2>
            <p className="text-lg text-gray-600">O programa atende micro e pequenos empreendedores em todo o Brasil.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Users, title: "MEI", desc: "Microempreendedor Individual com faturamento anual até R$ 81 mil", color: "bg-blue-50 border-blue-200" },
              { icon: TrendingUp, title: "Microempresa", desc: "Empresas com faturamento anual até R$ 360 mil", color: "bg-green-50 border-green-200" },
              { icon: Shield, title: "Pequeno Porte", desc: "Empresas com faturamento anual até R$ 4,8 milhões", color: "bg-purple-50 border-purple-200" },
            ].map((item) => (
              <div key={item.title} className={`rounded-2xl p-6 border-2 ${item.color} text-center`}>
                <item.icon className="h-10 w-10 text-gray-700 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-200 rounded-2xl p-6 max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <Star className="h-8 w-8 text-pink-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Bônus para Mulheres Empreendedoras</h3>
                <p className="text-gray-600">Empresas lideradas por mulheres têm limite ampliado para <strong>50% do faturamento</strong>, com teto de R$ 150.000 por CNPJ.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Por que escolher o PRONAMPE?</h2>
            <p className="text-lg text-gray-600">Vantagens que fazem a diferença para o seu negócio.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { title: "Taxa limitada por lei", desc: "Máximo de Selic + 6% ao ano, sem tarifas adicionais. Proteção legal contra juros abusivos." },
              { title: "Contratação digital", desc: "Alguns bancos permitem contratação 100% online, sem precisar ir à agência." },
              { title: "Garantia FGO", desc: "O Fundo Garantidor de Operações facilita a aprovação mesmo sem bens para oferecer como garantia." },
              { title: "Carência de 6 meses", desc: "Você tem 6 meses antes de começar a pagar, dando tempo para o crédito gerar retorno." },
              { title: "Prazo estendido", desc: "Até 48 meses para pagar, com possibilidade de renegociação para 72 meses." },
              { title: "Sem burocracia excessiva", desc: "Com a Destrava Crédito, cuidamos de toda a documentação e análise para você." },
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
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="py-16 md:py-20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Como funciona com a Destrava?</h2>
            <p className="text-lg text-gray-600">Do primeiro contato à aprovação, cuidamos de tudo.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { step: "01", title: "Análise gratuita", desc: "Avaliamos seu faturamento e elegibilidade sem custo." },
              { step: "02", title: "Documentação", desc: "Organizamos todos os documentos necessários para aprovação." },
              { step: "03", title: "Negociação", desc: "Identificamos o banco com melhores condições para seu perfil." },
              { step: "04", title: "Aprovação", desc: "Acompanhamos até a liberação do crédito na sua conta." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">{item.step}</div>
                <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
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
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#003F7F] to-[#006fd6] text-white">
        <div className="container px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Pronto para acessar o PRONAMPE?</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">Nossa equipe analisa seu caso gratuitamente e cuida de toda a documentação. Você foca no seu negócio.</p>
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
