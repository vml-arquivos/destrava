import { Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ArrowRight,
  DollarSign,
  Shield,
  Percent,
  Building2,
  TrendingUp,
  Star,
  Phone,
  ChevronDown,
  HelpCircle,
} from "lucide-react";
import { useState } from "react";

const WA_LINK = "https://wa.me/5561986055223?text=Olá!%20Quero%20saber%20mais%20sobre%20o%20FAMPE.";

const faqs = [
  {
    q: "O que é o FAMPE?",
    a: "O FAMPE (Fundo de Aval para Micro e Pequenas Empresas) é um fundo gerido pelo Sebrae que não empresta dinheiro diretamente, mas complementa as garantias exigidas pelos bancos, facilitando a aprovação de crédito para micro e pequenas empresas.",
  },
  {
    q: "Quanto o FAMPE garante?",
    a: "O FAMPE garante até 80% do valor financiado, com valores de R$ 10 mil a R$ 700 mil. Para o programa Inovacred, o limite sobe para R$ 1,5 milhão.",
  },
  {
    q: "Qual o custo do FAMPE?",
    a: "É cobrada uma Comissão de Concessão de Aval (CCA), calculada como 0,1% × prazo (em meses) × valor da garantia. Essa comissão pode ser financiada junto com o empréstimo.",
  },
  {
    q: "Como funciona na prática?",
    a: "A empresa contrata o crédito no banco parceiro. O banco avalia se precisa do aval do FAMPE. Em caso positivo, o Sebrae complementa a garantia, viabilizando a operação.",
  },
  {
    q: "Quem pode usar o FAMPE?",
    a: "Micro e pequenas empresas (incluindo MEI) que precisam de crédito mas não têm bens suficientes para oferecer como garantia aos bancos.",
  },
  {
    q: "Como a Destrava Crédito me ajuda?",
    a: "Nossa equipe identifica se o FAMPE é a solução ideal para seu caso, organiza a documentação e articula junto ao banco parceiro para maximizar suas chances de aprovação.",
  },
];

export default function Fampe() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="FAMPE - Fundo de Aval Sebrae para Micro e Pequenas Empresas | Destrava Crédito"
        description="FAMPE: o Sebrae complementa até 80% das garantias para você acessar crédito. De R$ 10 mil a R$ 700 mil. Sem hipoteca, sem burocracia. Destrava Crédito cuida de tudo."
        keywords="FAMPE, fundo aval Sebrae, garantia crédito micro empresa, FAMPE Sebrae, aval pequena empresa, crédito sem garantia real"
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#e65100] via-[#f57c00] to-[#ff9800] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-200 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/20 border border-white/30 rounded-full px-4 py-2 mb-6">
                <Shield className="h-4 w-4 text-white" />
                <span className="text-white/90 text-sm font-semibold">Sebrae · Fundo de Aval</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                FAMPE<br />
                <span className="text-yellow-200">Garantia Sebrae</span><br />
                que destrava crédito
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
                O Sebrae complementa até <strong>80% das garantias</strong> exigidas pelo banco. Você acessa crédito de <strong>R$ 10 mil a R$ 700 mil</strong> sem precisar hipotecar bens.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/simular">
                  <Button size="lg" className="bg-white hover:bg-gray-100 text-orange-600 font-bold px-8 w-full sm:w-auto">
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
                <img src="/logo-fampe.webp" alt="FAMPE Sebrae" className="h-16 object-contain mb-4 bg-white rounded-lg p-2" />
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Cobertura máxima", value: "80% do valor" },
                    { label: "Valor mínimo", value: "R$ 10.000" },
                    { label: "Valor máximo", value: "R$ 700.000" },
                    { label: "Inovacred", value: "Até R$ 1,5M" },
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
              { icon: Shield, value: "80%", label: "Cobertura máxima", color: "text-orange-600" },
              { icon: DollarSign, value: "R$ 700k", label: "Limite padrão", color: "text-green-600" },
              { icon: Star, value: "R$ 1,5M", label: "Inovacred", color: "text-blue-600" },
              { icon: Percent, value: "0,1%", label: "CCA por mês × valor", color: "text-purple-600" },
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

      {/* COMO FUNCIONA */}
      <section className="py-16 md:py-20">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Como o FAMPE funciona?</h2>
            <p className="text-lg text-gray-600">O FAMPE não empresta dinheiro — ele viabiliza o crédito que você já não conseguiria sozinho.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { step: "01", title: "Você precisa de crédito", desc: "Mas não tem bens suficientes para oferecer como garantia ao banco." },
              { step: "02", title: "Banco avalia o FAMPE", desc: "O banco parceiro verifica se o aval do Sebrae é necessário para a operação." },
              { step: "03", title: "Sebrae complementa", desc: "O FAMPE cobre até 80% do valor, viabilizando a aprovação do crédito." },
              { step: "04", title: "Crédito aprovado", desc: "Você recebe o crédito com condições melhores — juros menores e prazos maiores." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 bg-orange-500 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">{item.step}</div>
                <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Por que usar o FAMPE?</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { title: "Sem hipotecar bens", desc: "Você não precisa oferecer imóveis ou veículos como garantia. O FAMPE complementa o que falta." },
              { title: "Juros menores", desc: "Com a garantia do Sebrae, os bancos oferecem taxas mais competitivas e prazos maiores." },
              { title: "Aprovação facilitada", desc: "Empresas que seriam recusadas sem garantia real conseguem crédito com o aval do FAMPE." },
              { title: "CCA financiável", desc: "A comissão de concessão de aval pode ser incluída no próprio financiamento, sem impacto no caixa." },
              { title: "Até R$ 1,5M no Inovacred", desc: "Para projetos de inovação, o limite sobe para R$ 1,5 milhão com condições especiais." },
              { title: "Assessoria da Destrava", desc: "Nossa equipe identifica se o FAMPE é ideal para você e articula junto ao banco parceiro." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <CheckCircle2 className="h-6 w-6 text-orange-500 flex-shrink-0 mt-1" />
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
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#e65100] to-[#ff9800] text-white">
        <div className="container px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Destrave seu crédito com o FAMPE</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">Nossa equipe analisa se o FAMPE é a solução ideal para você e cuida de todo o processo gratuitamente.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/simular">
              <Button size="lg" className="bg-white hover:bg-gray-100 text-orange-600 font-bold px-10">
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
