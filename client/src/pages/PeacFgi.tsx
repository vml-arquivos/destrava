import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  CheckCircle2,
  DollarSign,
  Calendar,
  Percent,
  Building2,
  AlertCircle,
  FileText,
  Users,
  TrendingUp,
  Phone,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";

const faqs = [
  { q: 'O que é o PEAC FGI?', a: 'O PEAC com garantia do FGI do BNDES é uma linha de crédito que facilita o acesso de empresas ao sistema financeiro usando a garantia do BNDES como suporte.' },
  { q: 'Qual o valor mínimo e máximo?', a: 'De R$ 5.000 a R$ 10 milhões por empresa, dependendo do porte, faturamento e análise de crédito do banco operador.' },
  { q: 'Quais bancos operam o PEAC FGI?', a: 'O programa é operado por diversas instituições financeiras credenciadas pelo BNDES. A Destrava identifica o banco com melhores condições para o seu perfil.' },
  { q: 'Qual o prazo de carência?', a: 'Até 12 meses de carência, ou seja, você começa a pagar somente após 12 meses da contratação.' },
  { q: 'A garantia do FGI substitui outras garantias?', a: 'O FGI complementa ou substitui garantias reais exigidas pelo banco, facilitando a aprovação para empresas sem bens suficientes.' },
  { q: 'Como a Destrava me ajuda?', a: 'Nossa equipe analisa o perfil da empresa, identifica o banco operador mais adequado, organiza a documentação e acompanha todo o processo de aprovação.' },
];

export default function PeacFgi() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="PEAC FGI - Crédito com Garantia BNDES para Empresas | Destrava Crédito"
        description="PEAC FGI: de R$ 5 mil a R$ 10 milhões com garantia do FGI/BNDES. Prazo até 60 meses, carência até 12 meses. Assessoria completa da Destrava Crédito."
        keywords="peac fgi, crédito com garantia bndes para empresas"
        structuredData={serviceStructuredData("PEAC FGI", "PEAC FGI: de R$ 5 mil a R$ 10 milhões com garantia do FGI/BNDES. Prazo até 60 meses, carência até 12 meses. Assessoria completa da Destrava Crédito.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-20">
        <div className="container">
          <div className="max-w-3xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-white rounded-xl px-4 py-2 flex items-center justify-center h-16">
                <img src="/logo-bndes-fgi.jpg" alt="PEAC FGI" className="h-12 w-auto object-contain" />
              </div>
              <span className="text-sm font-semibold bg-white/20 px-3 py-1 rounded-full border border-white/30">
                FGI / BNDES
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">PEAC FGI</h1>
            <p className="text-xl text-white/90 mb-2 font-medium">
              Crédito de R$ 5 mil a R$ 10 milhões com garantia do BNDES
            </p>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
              Programa de crédito com garantia do FGI/BNDES para capital de giro e investimento. Prazo de até 60 meses e carência de até 12 meses para empresas de todos os portes.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/simular">
                <Button size="lg" variant="secondary" className="font-semibold">
                  Simular Agora
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20PEAC+FGI." target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="font-semibold border-white text-white hover:bg-white hover:text-primary">
                  <Phone className="h-4 w-4 mr-2" /> Falar com Especialista
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* MÉTRICAS */}
      <section className="py-16">
        <div className="container">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <DollarSign className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Faixa de Crédito</h3>
              <p className="text-2xl font-bold text-primary mb-2">R$ 5k a R$ 10M</p>
              <p className="text-sm text-muted-foreground">Para empresas de todos os portes</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Percent className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Taxa de Juros</h3>
              <p className="text-2xl font-bold text-primary mb-2">A partir de 1% a.m.</p>
              <p className="text-sm text-muted-foreground">Conforme perfil e banco operador</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Calendar className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Prazo</h3>
              <p className="text-2xl font-bold text-primary mb-2">Até 60 meses</p>
              <p className="text-sm text-muted-foreground">Com carência de até 12 meses</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Público-Alvo</h3>
              <p className="text-2xl font-bold text-primary mb-2">Todos os portes</p>
              <p className="text-sm text-muted-foreground">MEI, ME, EPP, médio e grande porte</p>
            </div>
          </div>
        </div>
      </section>

      {/* PARA QUE USAR */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">
              Para que você pode usar?
            </h2>
            <p className="text-center text-muted-foreground mb-10">
              O crédito pode ser utilizado para diversas finalidades relacionadas à atividade empresarial.
            </p>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Capital de Giro</h3>
                  <p className="text-sm text-muted-foreground">Reforçar o caixa operacional e manter a empresa em pleno funcionamento.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Investimento Fixo</h3>
                  <p className="text-sm text-muted-foreground">Adquirir máquinas, equipamentos, veículos e infraestrutura produtiva.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Expansão de Capacidade</h3>
                  <p className="text-sm text-muted-foreground">Ampliar a capacidade produtiva ou de atendimento da empresa.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Modernização Tecnológica</h3>
                  <p className="text-sm text-muted-foreground">Investir em sistemas, automação e tecnologia para ganhar eficiência.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Projetos de Inovação</h3>
                  <p className="text-sm text-muted-foreground">Financiar projetos de pesquisa, desenvolvimento e inovação.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Refinanciamento de Dívidas</h3>
                  <p className="text-sm text-muted-foreground">Consolidar dívidas com taxas mais altas em condições mais favoráveis.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* REQUISITOS */}
      <section className="py-16">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-10 text-center">Requisitos e Documentação</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card p-6 rounded-lg border border-border">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Quem pode solicitar
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Empresas de qualquer porte (MEI, ME, EPP, médio e grande)</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>CNPJ ativo e em situação regular</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Sem restrições graves no CADIN e Serasa</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Certidões negativas de débitos tributários</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Demonstrações financeiras atualizadas</span>
                  </li>
                </ul>
              </div>
              <div className="bg-card p-6 rounded-lg border border-border">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" /> Documentos necessários
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>CNPJ e contrato social / certificado MEI</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>RG e CPF dos sócios e administradores</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Comprovante de endereço da empresa</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Balanço patrimonial ou declaração de faturamento</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Extratos bancários dos últimos 6 meses</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl font-bold mb-10 text-center">Como Funciona com a Destrava</h2>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { n: "01", icon: Users, title: "Análise Gratuita", desc: "Avaliamos seu perfil e verificamos a elegibilidade sem custo." },
              { n: "02", icon: FileText, title: "Organização Documental", desc: "Preparamos e organizamos toda a documentação necessária." },
              { n: "03", icon: Building2, title: "Negociação Bancária", desc: "Identificamos o banco com melhores condições e conduzimos a negociação." },
              { n: "04", icon: TrendingUp, title: "Liberação do Crédito", desc: "Acompanhamos até a aprovação e liberação do recurso na sua conta." },
            ].map((step) => (
              <div key={step.n} className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {step.n}
                </div>
                <step.icon className="h-6 w-6 text-primary mx-auto mb-2" />
                <h3 className="font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="container max-w-3xl">
          <h2 className="text-3xl font-bold mb-10 text-center">Perguntas Frequentes</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-border rounded-lg overflow-hidden bg-card">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="font-semibold pr-4">{faq.q}</span>
                  {openFaq === i
                    ? <ChevronUp className="h-5 w-5 text-primary flex-shrink-0" />
                    : <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AVISO LEGAL */}
      <section className="py-8">
        <div className="container max-w-4xl">
          <div className="bg-[var(--color-caixa-yellow)]/10 border-l-4 border-[var(--color-caixa-yellow)] p-6 rounded">
            <div className="flex gap-3">
              <AlertCircle className="h-6 w-6 text-[var(--color-caixa-yellow)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-2">Importante:</p>
                <p className="text-sm text-muted-foreground">
                  A Destrava atua como assessoria empresarial para captação de crédito. A concessão final do crédito é de responsabilidade exclusiva da instituição financeira. As condições estão sujeitas à análise e aprovação. As simulações são estimativas e não constituem oferta de crédito.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-16 bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Acesse o PEAC FGI com a Destrava</h2>
          <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
            Garantia do BNDES, prazo de até 60 meses e assessoria especializada. Do R$ 5 mil ao R$ 10 milhões.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/simular">
              <Button size="lg" variant="secondary" className="font-semibold">
                Simular Agora
              </Button>
            </Link>
            <a href="https://wa.me/556135268355?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20PEAC+FGI." target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="font-semibold border-white text-white hover:bg-white hover:text-primary">
                <Phone className="h-4 w-4 mr-2" /> Falar com Especialista
              </Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
