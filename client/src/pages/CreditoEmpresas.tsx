import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Building2,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Clock,
  Shield,
  BarChart3,
  Truck,
  Zap,
  FileText,
} from "lucide-react";

const linhasCredito = [
  {
    id: "pronampe",
    nome: "PRONAMPE",
    subtitulo: "Programa Nacional de Apoio às Micro e Pequenas Empresas",
    descricao: "Linha de crédito do governo federal com as menores taxas do mercado para MEI, ME e EPP.",
    taxa: "Selic + 6% a.a.",
    valor: "Até R$ 150.000",
    prazo: "Até 48 meses",
    carencia: "11 meses",
    publico: ["MEI", "ME", "EPP"],
    badge: "Governo Federal",
    badgeColor: "bg-green-100 text-green-800",
    destaque: true,
    requisitos: [
      "CNPJ ativo há pelo menos 1 ano",
      "Faturamento anual até R$ 4,8 milhões",
      "Compartilhamento de dados no e-CAC",
      "Sem restrições graves no CNPJ",
    ],
    icon: TrendingUp,
    cor: "from-green-600 to-green-800",
  },
  {
    id: "giro-caixa-facil",
    nome: "Giro CAIXA Fácil",
    subtitulo: "Capital de Giro para Micro e Pequenas Empresas",
    descricao: "Crédito rápido para capital de giro com aprovação ágil e processo 100% digital.",
    taxa: "A partir de 2,99% a.m.",
    valor: "R$ 5.000 a R$ 70.000",
    prazo: "Até 36 meses",
    carencia: "Sem carência",
    publico: ["MEI", "ME", "EPP"],
    badge: "CAIXA",
    badgeColor: "bg-blue-100 text-blue-800",
    destaque: true,
    requisitos: [
      "CNPJ ativo há pelo menos 12 meses",
      "Faturamento anual até R$ 4,8 milhões",
      "Sem restrições no CPF/CNPJ",
      "Conta corrente na CAIXA",
    ],
    icon: Zap,
    cor: "from-blue-600 to-blue-800",
  },
  {
    id: "pronamp",
    nome: "PRONAMP",
    subtitulo: "Programa Nacional de Apoio ao Médio Produtor Rural",
    descricao: "Financiamento para custeio e investimento de médios produtores rurais com taxas subsidiadas.",
    taxa: "A partir de 8% a.a.",
    valor: "Até R$ 430.000",
    prazo: "Até 5 anos",
    carencia: "Conforme projeto",
    publico: ["Médio Produtor Rural"],
    badge: "Agronegócio",
    badgeColor: "bg-yellow-100 text-yellow-800",
    destaque: false,
    requisitos: [
      "Renda bruta anual entre R$ 500 mil e R$ 2 milhões",
      "Atividade rural comprovada",
      "Cadastro no Pronaf/Sintegra",
      "Declaração de aptidão ao Pronaf (DAP)",
    ],
    icon: Truck,
    cor: "from-yellow-600 to-yellow-800",
  },
  {
    id: "capital-giro-medio",
    nome: "Capital de Giro - Médio Porte",
    subtitulo: "Linhas de Crédito para Empresas de Médio Porte",
    descricao: "Soluções de capital de giro personalizadas para empresas com faturamento entre R$ 4,8M e R$ 300M.",
    taxa: "A partir de 1,5% a.m.",
    valor: "R$ 150.000 a R$ 5.000.000",
    prazo: "Até 60 meses",
    carencia: "Conforme análise",
    publico: ["Médio Porte"],
    badge: "Empresarial",
    badgeColor: "bg-purple-100 text-purple-800",
    destaque: false,
    requisitos: [
      "Faturamento anual acima de R$ 4,8 milhões",
      "Balanço patrimonial dos últimos 2 anos",
      "Demonstrativo de resultados",
      "Certidões negativas de débito",
    ],
    icon: BarChart3,
    cor: "from-purple-600 to-purple-800",
  },
  {
    id: "credito-grande-porte",
    nome: "Crédito para Grande Porte",
    subtitulo: "Soluções Corporativas de Crédito",
    descricao: "Estruturação de operações de crédito de alto valor para grandes empresas, incluindo debêntures, CRI, CRA e financiamentos estruturados.",
    taxa: "Personalizado",
    valor: "Acima de R$ 5.000.000",
    prazo: "Conforme estruturação",
    carencia: "Conforme projeto",
    publico: ["Grande Porte"],
    badge: "Corporativo",
    badgeColor: "bg-gray-100 text-gray-800",
    destaque: false,
    requisitos: [
      "Faturamento anual acima de R$ 300 milhões",
      "Auditoria financeira independente",
      "Rating de crédito",
      "Estruturação jurídica adequada",
    ],
    icon: Building2,
    cor: "from-gray-700 to-gray-900",
  },
  {
    id: "financiamento-equipamentos",
    nome: "Financiamento de Equipamentos",
    subtitulo: "FINAME e Leasing para Empresas",
    descricao: "Financiamento de máquinas, equipamentos e veículos para empresas de todos os portes via BNDES/FINAME.",
    taxa: "A partir de 1,2% a.m.",
    valor: "R$ 10.000 a R$ 10.000.000",
    prazo: "Até 120 meses",
    carencia: "Até 12 meses",
    publico: ["MEI", "ME", "EPP", "Médio Porte", "Grande Porte"],
    badge: "BNDES/FINAME",
    badgeColor: "bg-teal-100 text-teal-800",
    destaque: false,
    requisitos: [
      "CNPJ ativo",
      "Comprovante de atividade empresarial",
      "Nota fiscal do equipamento",
      "Análise de crédito",
    ],
    icon: Truck,
    cor: "from-teal-600 to-teal-800",
  },
];

export default function CreditoEmpresas() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Crédito para Empresas - Linhas de Crédito PJ | Destrava Crédito"
        description="Linhas de crédito para empresas de todos os portes. PRONAMPE, Giro CAIXA Fácil, PRONAMP, capital de giro para médio e grande porte, financiamento de equipamentos."
        keywords="crédito empresarial, PRONAMPE, Giro CAIXA Fácil, PRONAMP, capital de giro, financiamento empresas, crédito PJ, linhas de crédito"
        structuredData={serviceStructuredData("Crédito para Empresas", "Linhas de crédito para empresas de todos os portes: MEI, ME, EPP, médio e grande porte.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[var(--color-caixa-blue)] via-[var(--color-caixa-blue-dark)] to-[#001a4d] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--color-caixa-yellow)] rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[var(--color-caixa-yellow)] rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-yellow-400/20 border border-yellow-400/40 rounded-full px-4 py-2 mb-6">
              <Building2 className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-300 text-sm font-semibold">Crédito Empresarial</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Linhas de Crédito<br />
              <span className="text-yellow-400">para Empresas</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              Soluções de crédito para empresas de todos os portes: MEI, ME, EPP, médio e grande porte. PRONAMPE, Giro CAIXA Fácil, PRONAMP, capital de giro e muito mais.
            </p>
            <div className="flex flex-wrap gap-4 mb-8 text-sm">
              {["MEI e ME", "EPP", "Médio Porte", "Grande Porte", "Agronegócio"].map((p) => (
                <span key={p} className="bg-white/20 backdrop-blur-sm border border-white/30 rounded-full px-4 py-1.5 font-medium">
                  {p}
                </span>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/simular">
                <Button size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8">
                  Simular Crédito Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Olá! Preciso de crédito para minha empresa." target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                  Falar com Especialista
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="py-10 bg-white border-b border-gray-100">
        <div className="container px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { num: "+500", label: "Empresas Atendidas" },
              { num: "R$ 50M+", label: "em Crédito Captado" },
              { num: "6+", label: "Linhas de Crédito" },
              { num: "24h", label: "Retorno Garantido" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-bold text-[var(--color-caixa-blue)]">{s.num}</p>
                <p className="text-sm text-gray-600 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LINHAS DE CRÉDITO */}
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Nossas Linhas de Crédito Empresarial</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Trabalhamos com as principais linhas de crédito do mercado para empresas de todos os portes. Nossa assessoria identifica a melhor opção para o seu perfil.
              </p>
            </div>

            {/* Destaques */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {linhasCredito.filter((l) => l.destaque).map((linha) => (
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
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    {[
                      { label: "Taxa", value: linha.taxa },
                      { label: "Valor", value: linha.valor },
                      { label: "Prazo", value: linha.prazo },
                      { label: "Carência", value: linha.carencia },
                    ].map((info) => (
                      <div key={info.label} className="bg-white/15 rounded-xl p-3">
                        <p className="text-xs text-white/70">{info.label}</p>
                        <p className="font-bold text-sm">{info.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-white/80 mb-2">Requisitos principais:</p>
                    <ul className="space-y-1">
                      {linha.requisitos.slice(0, 3).map((req) => (
                        <li key={req} className="flex items-center gap-2 text-xs text-white/80">
                          <CheckCircle2 className="h-3.5 w-3.5 text-white/60 flex-shrink-0" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link href="/simular">
                    <Button className="w-full bg-white/20 hover:bg-white/30 text-white font-bold border border-white/30">
                      Simular {linha.nome}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>

            {/* Demais linhas */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {linhasCredito.filter((l) => !l.destaque).map((linha) => (
                <div key={linha.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                  <Badge className={linha.badgeColor + " mb-3 text-xs"}>{linha.badge}</Badge>
                  <linha.icon className="h-8 w-8 text-gray-600 mb-3" />
                  <h3 className="font-bold text-gray-900 mb-2 text-sm">{linha.nome}</h3>
                  <p className="text-xs text-gray-600 mb-4 leading-relaxed">{linha.descricao}</p>
                  <div className="space-y-1 mb-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Taxa:</span>
                      <span className="font-semibold text-gray-800">{linha.taxa}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Valor:</span>
                      <span className="font-semibold text-gray-800">{linha.valor}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Prazo:</span>
                      <span className="font-semibold text-gray-800">{linha.prazo}</span>
                    </div>
                  </div>
                  <Link href="/simular">
                    <Button size="sm" className="w-full bg-[var(--color-caixa-blue)] hover:bg-blue-700 text-white font-bold text-xs">
                      Simular
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Como Funciona Nossa Assessoria</h2>
            </div>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { num: "1", icon: FileText, title: "Análise de Perfil", desc: "Avaliamos sua empresa, situação financeira e necessidade específica." },
                { num: "2", icon: BarChart3, title: "Identificação", desc: "Identificamos a linha de crédito mais adequada para o seu perfil." },
                { num: "3", icon: Shield, title: "Preparação", desc: "Auxiliamos na organização da documentação e preparação do processo." },
                { num: "4", icon: DollarSign, title: "Captação", desc: "Acompanhamos todo o processo até a liberação do crédito." },
              ].map((step) => (
                <div key={step.num} className="text-center">
                  <div className="w-14 h-14 rounded-full bg-[var(--color-caixa-blue)] text-white flex items-center justify-center font-bold text-xl mx-auto mb-4">
                    {step.num}
                  </div>
                  <step.icon className="h-6 w-6 text-[var(--color-caixa-blue)] mx-auto mb-3" />
                  <h3 className="font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-600">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* VANTAGENS */}
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Por que Escolher a Destrava Crédito?</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                "Análise gratuita e sem compromisso",
                "Acesso a múltiplas linhas de crédito",
                "Especialistas em crédito empresarial",
                "Processo simplificado e ágil",
                "Suporte completo na documentação",
                "Negociação direta com instituições financeiras",
                "Acompanhamento até a liberação do crédito",
                "Atendimento personalizado para cada porte",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700 text-sm font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-gradient-to-br from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Sua Empresa Precisa de Crédito?</h2>
            <p className="text-white/90 mb-8 text-lg">
              Faça uma simulação gratuita e descubra qual linha de crédito é ideal para o seu negócio. Nossa equipe analisa seu perfil e apresenta as melhores opções.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/simular">
                <Button size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8">
                  Simular Crédito Grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Olá! Preciso de crédito para minha empresa." target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                  Falar no WhatsApp
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
