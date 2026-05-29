import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Search,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Shield,
  Clock,
  FileText,
  TrendingUp,
  Building2,
  User,
  XCircle,
} from "lucide-react";

export default function ConsultaSPCSerasa() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Consulta SPC e Serasa - CPF e CNPJ | Destrava Crédito"
        description="Consulte CPF ou CNPJ no SPC e Serasa. Verifique restrições, negativações e pendências financeiras. Análise completa para pessoa física e jurídica."
        keywords="consulta SPC, consulta Serasa, consulta CPF, consulta CNPJ, negativação, restrição financeira, score de crédito, limpa nome"
        structuredData={serviceStructuredData("Consulta SPC e Serasa", "Consulta de CPF e CNPJ no SPC e Serasa para verificação de restrições e negativações.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#922B21] via-[#7B241C] to-[#641E16] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-400 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-orange-400/20 border border-orange-400/40 rounded-full px-4 py-2 mb-6">
              <Search className="h-4 w-4 text-orange-400" />
              <span className="text-orange-300 text-sm font-semibold">SPC & Serasa</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Consulta SPC e Serasa<br />
              <span className="text-orange-400">CPF e CNPJ</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              Saiba se há restrições, negativações ou pendências no seu CPF ou CNPJ. Análise completa com relatório detalhado e orientação especializada para regularização.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/captura?produto=consulta-spc-serasa">
                <Button size="lg" className="bg-orange-400 hover:bg-orange-500 text-black font-bold px-8">
                  Consultar Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Olá! Quero consultar meu CPF/CNPJ no SPC e Serasa." target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                  Falar com Especialista
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* O QUE VERIFICAMOS */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">O que a Consulta Revela</h2>
              <p className="text-gray-600">Análise completa da situação do seu CPF ou CNPJ</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl border-2 border-red-100 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <User className="h-8 w-8 text-red-500" />
                  <h3 className="text-xl font-bold text-gray-900">Consulta CPF (Pessoa Física)</h3>
                </div>
                <div className="space-y-3">
                  {[
                    "Negativações no SPC e Serasa",
                    "Dívidas em aberto com credores",
                    "Protestos em cartório",
                    "Ações judiciais",
                    "Score de crédito atual",
                    "Histórico de pagamentos",
                    "Consultas realizadas ao CPF",
                    "Pendências com concessionárias",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <Link href="/captura?produto=consulta-spc-serasa">
                  <Button className="w-full mt-6 bg-red-500 hover:bg-red-600 text-white font-bold">
                    Consultar CPF
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="bg-white rounded-2xl border-2 border-orange-100 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <Building2 className="h-8 w-8 text-orange-500" />
                  <h3 className="text-xl font-bold text-gray-900">Consulta CNPJ (Pessoa Jurídica)</h3>
                </div>
                <div className="space-y-3">
                  {[
                    "Negativações do CNPJ",
                    "Dívidas tributárias e fiscais",
                    "Protestos em cartório",
                    "Ações judiciais contra a empresa",
                    "Score empresarial",
                    "Situação na Receita Federal",
                    "Certidões negativas de débito",
                    "Histórico de crédito empresarial",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <Link href="/captura?produto=consulta-spc-serasa">
                  <Button className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white font-bold">
                    Consultar CNPJ
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* IMPACTO DAS RESTRIÇÕES */}
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Impacto das Restrições no Seu Crédito</h2>
              <p className="text-gray-600">Entenda como negativações afetam sua vida financeira</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-bold text-red-600 mb-4 flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  Com Restrições
                </h3>
                <div className="space-y-3">
                  {[
                    "Crédito negado ou com taxas muito altas",
                    "Limite de crédito reduzido",
                    "Dificuldade para abrir conta bancária",
                    "Impedimento para participar de licitações",
                    "Problemas para alugar imóvel",
                    "Dificuldade para contratar serviços",
                    "Score de crédito muito baixo",
                    "Impossibilidade de obter financiamentos",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg text-sm text-red-800">
                      <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-bold text-green-600 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Sem Restrições
                </h3>
                <div className="space-y-3">
                  {[
                    "Acesso a melhores taxas de juros",
                    "Limite de crédito ampliado",
                    "Aprovação facilitada em financiamentos",
                    "Participação em licitações públicas",
                    "Facilidade para alugar imóvel",
                    "Acesso a linhas especiais (PRONAMPE, etc)",
                    "Score de crédito elevado",
                    "Melhores condições de parcelamento",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg text-sm text-green-800">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESSO */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Como Funciona a Consulta</h2>
            </div>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { num: "1", icon: FileText, title: "Solicite", desc: "Preencha o formulário com seus dados e o CPF/CNPJ a ser consultado." },
                { num: "2", icon: Search, title: "Análise", desc: "Nossa equipe realiza a consulta completa nos principais birôs de crédito." },
                { num: "3", icon: Shield, title: "Relatório", desc: "Receba um relatório detalhado com todas as informações encontradas." },
                { num: "4", icon: TrendingUp, title: "Orientação", desc: "Nossos especialistas orientam sobre as melhores estratégias de regularização." },
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

      {/* AVISO */}
      <section className="py-8 bg-amber-50 border-y border-amber-200">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800 mb-1">Encontrou restrições?</p>
              <p className="text-sm text-amber-700">
                A Destrava Crédito oferece serviços completos de <strong>Limpeza de Nome</strong> para CPF e CNPJ. Nossa equipe negocia diretamente com os credores para regularizar sua situação e restaurar seu acesso ao crédito.
              </p>
              <Link href="/limpa-nome">
                <Button size="sm" className="mt-3 bg-amber-600 hover:bg-amber-700 text-white">
                  Saiba mais sobre Limpa Nome
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-gradient-to-br from-[#922B21] to-[#641E16] text-white">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Consulte Agora seu CPF ou CNPJ</h2>
            <p className="text-white/90 mb-8 text-lg">
              Saiba exatamente sua situação financeira e tome as melhores decisões com base em informações precisas.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/captura?produto=consulta-spc-serasa">
                <Button size="lg" className="bg-orange-400 hover:bg-orange-500 text-black font-bold px-8">
                  Solicitar Consulta
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Olá! Quero consultar meu CPF/CNPJ no SPC e Serasa." target="_blank" rel="noopener noreferrer">
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
