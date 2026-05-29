import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Shield,
  CheckCircle2,
  ArrowRight,
  FileText,
  Lock,
  Clock,
  Star,
  Laptop,
  CreditCard,
  Building2,
  User,
} from "lucide-react";

export default function CertificadoDigital() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Certificado Digital para Empresa e Pessoa Física"
        description="Emita seu Certificado Digital A1 ou A3 para empresa (CNPJ) ou pessoa física (CPF). Necessário para emissão de NF-e, e-Social, eSocial, SPED e acesso a sistemas governamentais."
        keywords="certificado digital, certificado digital empresa, certificado digital CNPJ, certificado digital CPF, e-CNPJ, e-CPF, NF-e, nota fiscal eletrônica"
        structuredData={serviceStructuredData("Certificado Digital", "Emissão de certificado digital A1 e A3 para empresas e pessoas físicas.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#1a5276] via-[#154360] to-[#0d2b45] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-400 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-cyan-400/20 border border-cyan-400/40 rounded-full px-4 py-2 mb-6">
              <Shield className="h-4 w-4 text-cyan-400" />
              <span className="text-cyan-300 text-sm font-semibold">Certificado Digital</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Certificado Digital<br />
              <span className="text-cyan-400">para Empresa e PF</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              Emita seu certificado digital com agilidade e segurança. Indispensável para emissão de nota fiscal eletrônica, acesso a sistemas governamentais e assinatura de documentos digitais.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/captura?produto=certificado-digital">
                <Button size="lg" className="bg-cyan-400 hover:bg-cyan-500 text-black font-bold px-8">
                  Solicitar Certificado
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Olá! Preciso de um certificado digital." target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                  Falar com Especialista
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* TIPOS DE CERTIFICADO */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Tipos de Certificado Digital</h2>
              <p className="text-gray-600">Escolha o modelo ideal para sua necessidade</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {/* A1 */}
              <div className="bg-white rounded-2xl border-2 border-blue-200 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Laptop className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Tipo A1</h3>
                    <p className="text-sm text-gray-500">Arquivo digital no computador</p>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  {[
                    "Armazenado no computador ou nuvem",
                    "Validade de 1 ano",
                    "Sem necessidade de token ou cartão",
                    "Ideal para uso diário e múltiplos acessos",
                    "Instalação simples e rápida",
                    "Backup facilitado",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="bg-blue-50 rounded-xl p-4 mb-6">
                  <p className="text-sm font-semibold text-blue-800">Ideal para:</p>
                  <p className="text-sm text-blue-700">Empresas que emitem NF-e, acessam e-CAC, e-Social, SPED e sistemas governamentais com frequência.</p>
                </div>
                <Link href="/captura?produto=certificado-digital">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold">
                    Solicitar A1
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {/* A3 */}
              <div className="bg-white rounded-2xl border-2 border-purple-200 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Tipo A3</h3>
                    <p className="text-sm text-gray-500">Token USB ou cartão inteligente</p>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  {[
                    "Armazenado em token USB ou smart card",
                    "Validade de 1 a 3 anos",
                    "Maior segurança (chave não exportável)",
                    "Portátil - use em qualquer computador",
                    "Exigido em alguns sistemas governamentais",
                    "Ideal para assinatura de contratos",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="bg-purple-50 rounded-xl p-4 mb-6">
                  <p className="text-sm font-semibold text-purple-800">Ideal para:</p>
                  <p className="text-sm text-purple-700">Contadores, advogados, médicos, empresas que assinam contratos digitais e precisam de maior segurança.</p>
                </div>
                <Link href="/captura?produto=certificado-digital">
                  <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold">
                    Solicitar A3
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PARA QUEM É */}
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Para Quem é o Certificado Digital?</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <Building2 className="h-8 w-8 text-[var(--color-caixa-blue)]" />
                  <h3 className="text-xl font-bold text-gray-900">Para Empresas (e-CNPJ)</h3>
                </div>
                <div className="space-y-3">
                  {[
                    "Emissão de Nota Fiscal Eletrônica (NF-e)",
                    "Acesso ao e-CAC (Receita Federal)",
                    "Envio de declarações ao SPED",
                    "Acesso ao eSocial",
                    "Assinatura de contratos digitais",
                    "Acesso a sistemas bancários corporativos",
                    "Participação em licitações eletrônicas",
                    "Acesso ao Portal do Simples Nacional",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <User className="h-8 w-8 text-[var(--color-caixa-blue)]" />
                  <h3 className="text-xl font-bold text-gray-900">Para Pessoa Física (e-CPF)</h3>
                </div>
                <div className="space-y-3">
                  {[
                    "Acesso ao e-CAC como pessoa física",
                    "Assinatura de documentos digitais",
                    "Acesso ao Gov.br com nível ouro",
                    "Declaração de IR online",
                    "Acesso a sistemas de saúde (CFM, CRM)",
                    "Procurações eletrônicas",
                    "Acesso a cartórios digitais",
                    "Representação legal em sistemas governamentais",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-gray-700">
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
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Como Funciona o Processo</h2>
              <p className="text-gray-600">Simples, rápido e seguro</p>
            </div>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { num: "1", icon: FileText, title: "Solicite", desc: "Preencha o formulário com seus dados e escolha o tipo de certificado." },
                { num: "2", icon: Shield, title: "Validação", desc: "Nossa equipe orienta a validação presencial ou videoconferência (conforme o tipo)." },
                { num: "3", icon: Lock, title: "Emissão", desc: "O certificado é emitido pela Autoridade Certificadora credenciada." },
                { num: "4", icon: Star, title: "Entrega", desc: "Receba o certificado A1 por e-mail ou retire o token A3 presencialmente." },
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
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Por que Emitir com a Destrava Crédito?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Clock, title: "Agilidade", desc: "Processo simplificado com orientação completa da nossa equipe do início ao fim.", color: "text-blue-600", bg: "bg-blue-50" },
                { icon: Shield, title: "Segurança", desc: "Trabalhamos com Autoridades Certificadoras credenciadas pelo ITI (ICP-Brasil).", color: "text-green-600", bg: "bg-green-50" },
                { icon: Star, title: "Suporte", desc: "Acompanhamento completo após a emissão, incluindo renovação e suporte técnico.", color: "text-yellow-600", bg: "bg-yellow-50" },
              ].map((v) => (
                <div key={v.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
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
      <section className="py-14 bg-gradient-to-br from-[#1a5276] to-[#0d2b45] text-white">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Emita seu Certificado Digital Agora</h2>
            <p className="text-white/90 mb-8 text-lg">
              Não deixe sua empresa sem o certificado digital. Regularize hoje mesmo com a ajuda da nossa equipe especializada.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/captura?produto=certificado-digital">
                <Button size="lg" className="bg-cyan-400 hover:bg-cyan-500 text-black font-bold px-8">
                  Solicitar Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Olá! Preciso de um certificado digital." target="_blank" rel="noopener noreferrer">
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
