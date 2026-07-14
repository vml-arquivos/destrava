import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  User,
  CheckCircle2,
  ArrowRight,
  Home,
  Car,
  CreditCard,
  DollarSign,
  Shield,
  Clock,
  Star,
} from "lucide-react";

const linhasPF = [
  {
    id: "consignado",
    nome: "Crédito Consignado",
    subtitulo: "Desconto direto na folha de pagamento",
    descricao: "Modalidade com desconto em folha para públicos elegíveis, sujeita às regras, margem consignável e análise da instituição.",
    taxa: "Conforme convênio e CET da proposta",
    valor: "Conforme margem e análise",
    prazo: "Conforme convênio",
    publico: ["Servidor Público", "Aposentado", "Pensionista INSS"],
    badge: "Consignado",
    badgeColor: "bg-green-100 text-green-800",
    destaque: true,
    icon: CreditCard,
    cor: "from-green-600 to-green-800",
    beneficios: [
      "Condições ligadas ao convênio e à margem",
      "Desconto automático em folha",
      "Sem necessidade de comprovação de renda adicional",
      "Processo sujeito à análise",
      "CET informado antes da contratação",
    ],
  },
  {
    id: "pessoal",
    nome: "Crédito Pessoal",
    subtitulo: "Para necessidades imediatas",
    descricao: "Crédito de uso livre, com limite, taxa, CET e prazo definidos conforme análise do perfil.",
    taxa: "Conforme instituição e perfil",
    valor: "Conforme análise",
    prazo: "Conforme instituição",
    publico: ["Pessoa Física com renda"],
    badge: "Rápido",
    badgeColor: "bg-blue-100 text-blue-800",
    destaque: true,
    icon: DollarSign,
    cor: "from-blue-600 to-blue-800",
    beneficios: [
      "Solicitação sujeita à análise",
      "Garantias conforme a modalidade",
      "Uso livre do crédito",
      "Parcelas fixas",
      "Processo conforme a instituição",
    ],
  },
  {
    id: "imobiliario",
    nome: "Financiamento Imobiliário",
    subtitulo: "Realize o sonho da casa própria",
    descricao: "Financiamento de imóveis residenciais e comerciais, sujeito à avaliação do imóvel, renda e política da instituição.",
    taxa: "Conforme instituição e CET da proposta",
    valor: "Conforme renda e avaliação",
    prazo: "Conforme operação",
    publico: ["Pessoa Física"],
    badge: "CAIXA",
    badgeColor: "bg-yellow-100 text-yellow-800",
    destaque: false,
    icon: Home,
    cor: "from-yellow-600 to-yellow-800",
    beneficios: [
      "Uso do FGTS como entrada",
      "Prazo definido na proposta",
      "Taxa e CET informados antes da contratação",
      "Percentual financiado conforme análise",
      "Processo orientado por especialistas",
    ],
  },
  {
    id: "veiculo",
    nome: "Financiamento de Veículo",
    subtitulo: "Carro novo ou usado com facilidade",
    descricao: "Financiamento de veículos novos e usados, com condições definidas conforme bem, entrada, perfil e instituição.",
    taxa: "Conforme instituição e CET da proposta",
    valor: "Conforme bem e análise",
    prazo: "Conforme operação",
    publico: ["Pessoa Física"],
    badge: "Veículos",
    badgeColor: "bg-purple-100 text-purple-800",
    destaque: false,
    icon: Car,
    cor: "from-purple-600 to-purple-800",
    beneficios: [
      "Veículo novo ou usado",
      "Entrada conforme a proposta",
      "Parcelas fixas",
      "Processo ágil",
      "Múltiplas instituições financeiras",
    ],
  },
];

export default function CreditoPessoaFisica() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Crédito para Pessoa Física - Consignado, Pessoal, Imóvel e Veículo"
        description="Compare modalidades de crédito para pessoa física, como consignado, crédito pessoal e financiamentos. Condições sujeitas à análise e ao CET da proposta."
        keywords="crédito pessoal, consignado, financiamento imobiliário, financiamento veículo, crédito pessoa física, empréstimo pessoal"
        structuredData={serviceStructuredData("Crédito para Pessoa Física", "Linhas de crédito para pessoa física: consignado, pessoal, imobiliário e veículo.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#1B4F72] via-[#154360] to-[#0d2b45] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-blue-400/20 border border-blue-400/40 rounded-full px-4 py-2 mb-6">
              <User className="h-4 w-4 text-blue-300" />
              <span className="text-blue-200 text-sm font-semibold">Pessoa Física</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Crédito para<br />
              <span className="text-blue-300">Pessoa Física</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              Encontre a melhor linha de crédito para você: consignado, crédito pessoal, financiamento de imóvel ou veículo. Análise gratuita e orientação especializada.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="bg-blue-400 hover:bg-blue-500 text-black font-bold px-8">
                <Link href="/simular">
                  Simular Crédito Grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                <a href="https://wa.me/556135268355?text=Olá! Preciso de crédito pessoal." target="_blank" rel="noopener noreferrer">
                  Falar com Especialista
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* LINHAS DE CRÉDITO */}
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Nossas Linhas de Crédito</h2>
              <p className="text-gray-600">Soluções para cada necessidade</p>
            </div>

            {/* Destaques */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {linhasPF.filter((l) => l.destaque).map((linha) => (
                <div key={linha.id} className={`bg-gradient-to-br ${linha.cor} text-white rounded-2xl p-8 shadow-lg`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <Badge className={linha.badgeColor + " mb-3"}>{linha.badge}</Badge>
                      <h3 className="text-2xl font-bold">{linha.nome}</h3>
                      <p className="text-white/80 text-sm mt-1">{linha.subtitulo}</p>
                    </div>
                    <linha.icon className="h-10 w-10 text-white/60" />
                  </div>
                  <p className="text-white/90 mb-6 text-sm leading-relaxed">{linha.descricao}</p>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[
                      { label: "Taxa", value: linha.taxa },
                      { label: "Valor", value: linha.valor },
                      { label: "Prazo", value: linha.prazo },
                    ].map((info) => (
                      <div key={info.label} className="bg-white/15 rounded-xl p-3">
                        <p className="text-xs text-white/70">{info.label}</p>
                        <p className="font-bold text-xs">{info.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-white/80 mb-2">Benefícios:</p>
                    <ul className="space-y-1">
                      {linha.beneficios.slice(0, 3).map((b) => (
                        <li key={b} className="flex items-center gap-2 text-xs text-white/80">
                          <CheckCircle2 className="h-3.5 w-3.5 text-white/60 flex-shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button asChild className="w-full bg-white/20 hover:bg-white/30 text-white font-bold border border-white/30">
                    <Link href="/simular">
                      Simular {linha.nome}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>

            {/* Demais */}
            <div className="grid md:grid-cols-2 gap-6">
              {linhasPF.filter((l) => !l.destaque).map((linha) => (
                <div key={linha.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <linha.icon className="h-6 w-6 text-gray-600" />
                    </div>
                    <div>
                      <Badge className={linha.badgeColor + " mb-1 text-xs"}>{linha.badge}</Badge>
                      <h3 className="font-bold text-gray-900">{linha.nome}</h3>
                      <p className="text-xs text-gray-500">{linha.subtitulo}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">{linha.descricao}</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                      { label: "Taxa", value: linha.taxa },
                      { label: "Valor", value: linha.valor },
                      { label: "Prazo", value: linha.prazo },
                    ].map((info) => (
                      <div key={info.label} className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-400">{info.label}</p>
                        <p className="font-bold text-xs text-gray-800">{info.value}</p>
                      </div>
                    ))}
                  </div>
                  <ul className="space-y-1 mb-4">
                    {linha.beneficios.slice(0, 3).map((b) => (
                      <li key={b} className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="w-full bg-[var(--color-caixa-blue)] hover:bg-blue-700 text-white font-bold text-sm">
                    <Link href="/simular">
                      Simular
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* VANTAGENS */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Por que Escolher a Destrava Crédito?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Shield, title: "Análise Gratuita", desc: "Avaliamos seu perfil sem custo e sem compromisso para encontrar a melhor opção.", color: "text-blue-600", bg: "bg-blue-50" },
                { icon: Clock, title: "Processo Ágil", desc: "Simplificamos a burocracia e acompanhamos todo o processo até a aprovação.", color: "text-green-600", bg: "bg-green-50" },
                { icon: Star, title: "Comparação Transparente", desc: "Compare taxa, CET, prazo e valor total das propostas disponíveis para o seu perfil.", color: "text-yellow-600", bg: "bg-yellow-50" },
              ].map((v) => (
                <div key={v.title} className="text-center p-6 bg-gray-50 rounded-2xl">
                  <div className={`w-14 h-14 rounded-2xl ${v.bg} flex items-center justify-center mx-auto mb-4`}>
                    <v.icon className={`h-7 w-7 ${v.color}`} />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-3">{v.title}</h3>
                  <p className="text-sm text-gray-600">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-gradient-to-br from-[#1B4F72] to-[#0d2b45] text-white">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Encontre o Crédito Ideal para Você</h2>
            <p className="text-white/90 mb-8 text-lg">
              Faça uma simulação gratuita e descubra qual linha de crédito melhor atende às suas necessidades.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-blue-400 hover:bg-blue-500 text-black font-bold px-8">
                <Link href="/simular">
                  Simular Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                <a href="https://wa.me/556135268355?text=Olá! Preciso de crédito pessoal." target="_blank" rel="noopener noreferrer">
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
