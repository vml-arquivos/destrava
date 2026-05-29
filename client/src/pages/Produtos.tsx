import Header from "@/components/Header";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, BarChart3, DollarSign, FileText, Zap, Truck, TrendingUp, Building2, User, Home } from "lucide-react";

export default function Produtos() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <SEO
        title="Produtos — Soluções de Crédito Empresarial e Pessoal"
        description="Conheça todas as soluções de crédito da Destrava: PRONAMPE, FAMPE, FCO, Giro CAIXA Fácil, crédito pessoal e muito mais."
        keywords="produtos crédito, PRONAMPE, FAMPE, FCO, crédito empresarial, crédito pessoal"
      />

      {/* HERO SECTION */}
      <section className="bg-gradient-to-br from-[var(--color-caixa-blue)] via-[var(--color-caixa-blue-dark)] to-[#001a4d] text-white py-12 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-48 md:w-96 h-48 md:h-96 bg-[var(--color-caixa-yellow)] rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 md:w-96 h-48 md:h-96 bg-[var(--color-caixa-yellow)] rounded-full blur-3xl"></div>
        </div>

        <div className="container relative z-10 px-4 md:px-6">
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-3 md:mb-4 leading-tight">
            Produtos e Serviços de Crédito
          </h1>
          <p className="text-base md:text-lg lg:text-2xl text-white/90 mb-6 md:mb-8 leading-relaxed max-w-2xl">
            Oferecemos uma série de soluções de crédito que podem ser customizadas para sua necessidade específica.
          </p>
        </div>
      </section>

      {/* SEÇÃO INTRODUTÓRIA */}
      <section className="py-8 md:py-16 bg-white">
        <div className="container max-w-4xl px-4 md:px-6">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--color-caixa-blue-dark)] mb-3 md:mb-4">
              Assessoria de Crédito Customizada
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-gray-600 leading-relaxed">
              A Destrava Crédito é uma empresa especializada em assessoria de crédito e captação de recursos para empresas e empresários. Realizamos análise completa de perfil e risco para identificar qual solução de crédito melhor se adequa à sua situação, ajudando sua empresa a captar os recursos necessários para crescer e prosperar.
            </p>
          </div>
        </div>
      </section>

      {/* SEÇÃO PRINCIPAL - DOIS PILARES */}
      <section className="py-8 md:py-20 bg-gray-50">
        <div className="container px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-6 md:gap-12">
            {/* PILAR 1: ASSESSORIA DE CRÉDITO (FOCO PRINCIPAL) */}
            <div className="bg-gradient-to-br from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-white p-6 md:p-12 rounded-xl md:rounded-2xl shadow-lg md:shadow-2xl">
              <div className="flex items-start justify-between mb-4 md:mb-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">Assessoria de Crédito</h2>
                  <p className="text-base md:text-lg text-white/90">Captação de Recursos Customizada</p>
                </div>
              </div>

              <p className="text-white/90 mb-4 md:mb-6 leading-relaxed text-sm md:text-base">
                É a captação de recursos ou assessoria de crédito customizada para empresas e empresários.
              </p>

              <p className="text-white/80 mb-4 md:mb-6 italic border-l-4 border-[var(--color-caixa-yellow)] pl-3 md:pl-4 text-sm md:text-base">
                "A Destrava Crédito assessora sua empresa enquanto você se dedica ao que realmente importa para seu negócio."
              </p>

              <div className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                <div className="flex items-start gap-2 md:gap-3">
                  <BarChart3 className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-yellow)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base">Análise de Perfil e Risco</p>
                    <p className="text-white/70 text-xs md:text-sm">Avaliamos sua situação financeira para identificar a melhor solução</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 md:gap-3">
                  <DollarSign className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-yellow)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base">Captação de Recursos</p>
                    <p className="text-white/70 text-xs md:text-sm">Buscamos as melhores linhas de crédito disponíveis no mercado</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 md:gap-3">
                  <FileText className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-yellow)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base">Estruturação de Financiamentos</p>
                    <p className="text-white/70 text-xs md:text-sm">Ajudamos na preparação de documentação e negociação</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 md:gap-3">
                  <Zap className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-yellow)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base">Recuperação de Crédito</p>
                    <p className="text-white/70 text-xs md:text-sm">Limpeza de nome e restauração de histórico creditício</p>
                  </div>
                </div>
              </div>

              <a href="https://wa.me/556135268355" target="_blank" rel="noopener noreferrer">
                <Button className="w-full bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold text-sm md:text-base py-2 md:py-3 px-4 md:px-8">
                  Conversar com Especialista
                  <ArrowRight className="w-4 md:w-5 h-4 md:h-5 ml-2" />
                </Button>
              </a>
            </div>

            {/* PILAR 2: PRODUTOS DE CRÉDITO DISPONÍVEIS */}
            <div className="bg-white border-2 border-gray-200 p-6 md:p-12 rounded-xl md:rounded-2xl">
              <h2 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2 text-[var(--color-caixa-blue-dark)]">Produtos de Crédito</h2>
              <p className="text-base md:text-lg text-gray-600 mb-4 md:mb-6">Linhas de Crédito Disponíveis</p>

              <p className="text-sm md:text-base text-gray-600 mb-4 md:mb-6 leading-relaxed">
                Através de nossa assessoria, você tem acesso a múltiplas linhas de crédito. Analisamos qual é a melhor para sua situação específica.
              </p>

              <div className="space-y-3 md:space-y-4">
                <div className="flex items-start gap-2 md:gap-3 pb-3 md:pb-4 border-b border-gray-200">
                  <Truck className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-blue)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base text-[var(--color-caixa-blue-dark)]">Giro CAIXA Fácil</p>
                    <p className="text-gray-600 text-xs md:text-sm">Capital de giro com aprovação rápida. Até R$ 70.000</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 md:gap-3 pb-3 md:pb-4 border-b border-gray-200">
                  <TrendingUp className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-blue)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base text-[var(--color-caixa-blue-dark)]">PRONAMPE</p>
                    <p className="text-gray-600 text-xs md:text-sm">Programa de apoio a micro e pequenas empresas</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 md:gap-3 pb-3 md:pb-4 border-b border-gray-200">
                  <Building2 className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-blue)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base text-[var(--color-caixa-blue-dark)]">Financiamento Imobiliário</p>
                    <p className="text-gray-600 text-xs md:text-sm">Para aquisição de imóvel comercial ou residencial</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 md:gap-3 pb-3 md:pb-4 border-b border-gray-200">
                  <DollarSign className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-blue)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base text-[var(--color-caixa-blue-dark)]">Crédito Pessoal</p>
                    <p className="text-gray-600 text-xs md:text-sm">Para necessidades imediatas com aprovação rápida</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 md:gap-3">
                  <User className="w-5 md:w-6 h-5 md:h-6 text-[var(--color-caixa-blue)] flex-shrink-0 mt-0.5 md:mt-1" />
                  <div>
                    <p className="font-bold text-sm md:text-base text-[var(--color-caixa-blue-dark)]">Crédito Consignado</p>
                    <p className="text-gray-600 text-xs md:text-sm">Com desconto em folha. Ideal para servidores públicos</p>
                  </div>
                </div>
              </div>

              <a href="https://wa.me/556135268355" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full mt-6 md:mt-8 border-[var(--color-caixa-blue)] text-[var(--color-caixa-blue)] hover:bg-blue-50 font-bold text-sm md:text-base py-2 md:py-3 px-4 md:px-8">
                  Saber Mais Sobre Produtos
                  <ArrowRight className="w-4 md:w-5 h-4 md:h-5 ml-2" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO DE CTA FINAL */}
      <section className="py-8 md:py-16 bg-gradient-to-r from-blue-50 to-blue-100">
        <div className="container max-w-3xl px-4 md:px-6">
          <div className="bg-white rounded-lg md:rounded-xl p-6 md:p-12 shadow-lg text-center">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--color-caixa-blue-dark)] mb-3 md:mb-4">
              Pronto para Captar Recursos para sua Empresa?
            </h2>
            <p className="text-sm md:text-base lg:text-lg text-gray-600 mb-6 md:mb-8">
              Nossos especialistas em assessoria de crédito analisam seu perfil, situação financeira e necessidade para recomendar a melhor solução. Conversa inicial sem compromisso.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
              <a href="https://wa.me/556135268355" target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-[var(--color-caixa-blue)] hover:bg-blue-700 text-white font-bold text-sm md:text-base py-2 md:py-3 px-4 md:px-8">
                  Conversar com Especialista
                </Button>
              </a>
              <Link href="/simulacao">
                <Button size="lg" variant="outline" className="border-[var(--color-caixa-blue)] text-[var(--color-caixa-blue)] font-bold text-sm md:text-base py-2 md:py-3 px-4 md:px-8">
                  Fazer Simulação
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="bg-gray-100 py-6 md:py-8 text-center text-xs md:text-sm text-gray-600">
        <div className="container px-4 md:px-6">
          <p className="leading-relaxed">
            Serviço prestado pela Destrava Crédito como correspondente/assessoria. A análise de perfil e risco é realizada pela Destrava Crédito.
            Cada produto possui suas próprias condições, prazos e taxas, sujeitos à análise e aprovação da instituição financeira responsável.
            Cada situação é única e será analisada individualmente. Resultados podem variar conforme a complexidade de cada caso.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
