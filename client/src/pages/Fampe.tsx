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
  { q: 'O que é o FAMPE?', a: 'O FAMPE é um instrumento do Sebrae que complementa as garantias exigidas pelos bancos, facilitando o acesso ao crédito para micro e pequenas empresas.' },
  { q: 'Como funciona o aval do Sebrae?', a: 'O Sebrae complementa até 80% das garantias exigidas pelo banco, reduzindo a necessidade de o empresário oferecer bens próprios como garantia.' },
  { q: 'Qual o valor máximo disponível?', a: 'De R$ 10.000 a R$ 700.000, dependendo do banco operador e da análise de crédito da empresa.' },
  { q: 'Preciso ser associado ao Sebrae?', a: 'Sim, é necessário ser ou se tornar cliente do Sebrae para acessar o FAMPE. A Destrava orienta sobre o processo de associação.' },
  { q: 'Quais bancos operam o FAMPE?', a: 'O FAMPE é operado por diversas instituições financeiras parceiras do Sebrae em todo o Brasil.' },
  { q: 'Como a Destrava me ajuda com o FAMPE?', a: 'Nossa equipe verifica sua elegibilidade, orienta sobre a associação ao Sebrae, organiza a documentação e acompanha o processo junto ao banco parceiro.' },
];

export default function Fampe() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="FAMPE - Fundo de Aval Sebrae para Micro e Pequenas Empresas | Destrava"
        description="FAMPE: o Sebrae complementa até 80% das garantias para você acessar crédito de R$ 10 mil a R$ 700 mil. Assessoria completa da Destrava Crédito."
        keywords="fampe, fundo de aval sebrae para micro e pequenas empresas"
        structuredData={serviceStructuredData("FAMPE", "FAMPE: o Sebrae complementa até 80% das garantias para você acessar crédito de R$ 10 mil a R$ 700 mil. Assessoria completa da Destrava Crédito.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-20">
        <div className="container">
          <div className="max-w-3xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-white rounded-xl px-4 py-2 flex items-center justify-center h-16">
                <img src="/logo-fampe.webp" alt="FAMPE" className="h-12 w-auto object-contain" />
              </div>
              <span className="text-sm font-semibold bg-white/20 px-3 py-1 rounded-full border border-white/30">
                Sebrae
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">FAMPE</h1>
            <p className="text-xl text-white/90 mb-2 font-medium">
              Fundo de Aval do Sebrae para Micro e Pequenas Empresas
            </p>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
              O Sebrae complementa até 80% das garantias exigidas pelo banco, facilitando o acesso ao crédito de R$ 10 mil a R$ 700 mil para micro e pequenas empresas.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/simular">
                <Button size="lg" variant="secondary" className="font-semibold">
                  Simular Agora
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20FAMPE." target="_blank" rel="noopener noreferrer">
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
              <p className="text-2xl font-bold text-primary mb-2">R$ 10k a R$ 700k</p>
              <p className="text-sm text-muted-foreground">Conforme análise do banco</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Percent className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Cobertura do Sebrae</h3>
              <p className="text-2xl font-bold text-primary mb-2">Aval de até 80%</p>
              <p className="text-sm text-muted-foreground">Das garantias exigidas</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Calendar className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Prazo</h3>
              <p className="text-2xl font-bold text-primary mb-2">Até 60 meses</p>
              <p className="text-sm text-muted-foreground">Conforme modalidade contratada</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Público-Alvo</h3>
              <p className="text-2xl font-bold text-primary mb-2">MEI / ME / EPP</p>
              <p className="text-sm text-muted-foreground">Associados ao Sebrae</p>
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
                  <p className="text-sm text-muted-foreground">Manter o fluxo de caixa saudável e cobrir despesas operacionais.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Investimento Fixo</h3>
                  <p className="text-sm text-muted-foreground">Adquirir equipamentos, máquinas e realizar reformas no estabelecimento.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Estoque</h3>
                  <p className="text-sm text-muted-foreground">Comprar mercadorias e insumos para ampliar a capacidade de atendimento.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Expansão</h3>
                  <p className="text-sm text-muted-foreground">Abrir novo ponto, ampliar o espaço físico ou diversificar o negócio.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Tecnologia</h3>
                  <p className="text-sm text-muted-foreground">Investir em sistemas de gestão, e-commerce e automação.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Capacitação</h3>
                  <p className="text-sm text-muted-foreground">Financiar treinamentos e capacitação para a equipe.</p>
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
                    <span>MEI, Microempresa ou Empresa de Pequeno Porte</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Associado ao Sebrae ou disposto a se associar</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>CNPJ ativo e em situação regular</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Sem restrições graves no sistema financeiro</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Certidões negativas de débitos tributários</span>
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
                    <span>RG e CPF dos sócios</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Comprovante de endereço da empresa</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Declarações de faturamento (DEFIS / DASN)</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Extratos bancários dos últimos 3 meses</span>
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Acesse o FAMPE com a Destrava</h2>
          <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
            O Sebrae complementa suas garantias. Você acessa o crédito que precisa para crescer.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/simular">
              <Button size="lg" variant="secondary" className="font-semibold">
                Simular Agora
              </Button>
            </Link>
            <a href="https://wa.me/556135268355?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20FAMPE." target="_blank" rel="noopener noreferrer">
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
