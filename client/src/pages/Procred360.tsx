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

/**
 * FAQ atualizado para o ProCred 360 (Desenrola Empresas) com as novas regras de 2026.
 * Inclui carência maior, prazo estendido e limite de crédito ampliado.
 */
const faqs = [
  {
    q: 'O que é o ProCred 360?',
    a: 'O ProCred 360 é uma linha de crédito do Programa Acredita (Desenrola Empresas) do Governo Federal para MEI e microempresas com faturamento anual de até R$ 360 mil. O programa oferece juros subsidiados e agora possui condições mais flexíveis.'
  },
  {
    q: 'Qual o valor máximo disponível?',
    a: 'Até 50% do faturamento anual da empresa, limitado a R$ 180.000 por CNPJ. Para empresas lideradas por mulheres, o limite sobe para 60% do faturamento, mantido o teto de R$ 180.000.'
  },
  {
    q: 'Quais são as taxas de juros?',
    a: 'As taxas são subsidiadas pelo governo e podem ser até 50% menores que as taxas de mercado convencional, variando conforme a instituição financeira.'
  },
  {
    q: 'Qual o prazo para pagamento?',
    a: 'Até 96 meses para pagamento, com carência de até 24 meses para começar a amortizar.'
  },
  {
    q: 'Preciso ter conta no banco para contratar?',
    a: 'Não necessariamente. O ProCred 360 está disponível em diversas instituições financeiras parceiras do programa, e nossa equipe indica a melhor opção para o seu perfil.'
  },
  {
    q: 'Como a Destrava me ajuda no ProCred 360?',
    a: 'Fazemos a análise completa do seu perfil, verificamos a elegibilidade, organizamos a documentação e conduzimos o processo junto à instituição financeira parceira até a aprovação.'
  },
];

export default function Procred360() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="ProCred 360 - Crédito para MEI e Microempresas com Carência de 24 Meses | Destrava"
        description="ProCred 360 (Desenrola Empresas): até 50% do faturamento da empresa, limite de R$ 180 mil, carência de 24 meses e prazo de pagamento de 96 meses. Assessoria completa da Destrava."
        keywords="procred 360, desenrola empresas, crédito MEI, crédito microempresa, carência 24 meses, prazo 96 meses"
        structuredData={serviceStructuredData(
          "ProCred 360",
          "ProCred 360 (Desenrola Empresas): crédito de até 50% do faturamento anual (máximo R$ 180 mil), carência de 24 meses e prazo total de 96 meses para MEI e microempresas com faturamento até R$ 360 mil. Assessoria completa da Destrava."
        )}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-20">
        <div className="container">
          <div className="max-w-3xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-white rounded-xl px-4 py-2 flex items-center justify-center h-16">
                <img src="/logo-procred360.webp" alt="ProCred 360" className="h-12 w-auto object-contain" />
              </div>
              <span className="text-sm font-semibold bg-white/20 px-3 py-1 rounded-full border border-white/30">
                Programa Acredita
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">ProCred 360</h1>
            <p className="text-xl text-white/90 mb-2 font-medium">
              Crédito com condições ampliadas para MEI e Microempresas
            </p>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
              Linha de crédito do Programa Acredita (Desenrola Empresas) para MEI e microempresas com faturamento anual de até R$ 360 mil. Até 50% do faturamento (limite R$ 180 mil), carência de 24 meses e prazo de 96 meses para pagar.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/simular">
                <Button size="lg" variant="secondary" className="font-semibold">
                  Simular Agora
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20ProCred+360." target="_blank" rel="noopener noreferrer">
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
              <h3 className="font-bold text-lg mb-2">Valor Máximo</h3>
              <p className="text-2xl font-bold text-primary mb-2">Até R$ 180k</p>
              <p className="text-sm text-muted-foreground">50% do faturamento anual (60% para empresas lideradas por mulheres)</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Percent className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Taxa de Juros</h3>
              <p className="text-2xl font-bold text-primary mb-2">Juros subsidiados*</p>
              <p className="text-sm text-muted-foreground">*Até 50% menores que o mercado convencional</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Calendar className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Prazo</h3>
              <p className="text-2xl font-bold text-primary mb-2">Até 96 meses</p>
              <p className="text-sm text-muted-foreground">Com carência de até 24 meses</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Público-Alvo</h3>
              <p className="text-2xl font-bold text-primary mb-2">MEI / ME</p>
              <p className="text-sm text-muted-foreground">Faturamento até R$ 360k/ano</p>
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
                  <p className="text-sm text-muted-foreground">Manter o fluxo de caixa saudável e cobrir despesas operacionais do dia a dia.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Estoque e Insumos</h3>
                  <p className="text-sm text-muted-foreground">Comprar mercadorias, matérias-primas ou insumos para ampliar a capacidade produtiva.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Equipamentos</h3>
                  <p className="text-sm text-muted-foreground">Adquirir máquinas, equipamentos e ferramentas para modernizar a operação.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Expansão do Negócio</h3>
                  <p className="text-sm text-muted-foreground">Abrir novo ponto, ampliar o espaço físico ou diversificar produtos e serviços.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Marketing Digital</h3>
                  <p className="text-sm text-muted-foreground">Investir em presença online, redes sociais e ferramentas de gestão.</p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Refinanciamento</h3>
                  <p className="text-sm text-muted-foreground">Trocar dívidas com juros mais altos por uma taxa mais competitiva e prazo maior.</p>
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
                    <span>MEI com faturamento anual até R$ 81 mil</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Microempresa com faturamento até R$ 360 mil</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>CNPJ ativo há pelo menos 6 meses</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Situação regular na Receita Federal</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Sem restrições graves no sistema financeiro</span>
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Acesse o ProCred 360 com a Destrava</h2>
          <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
            Juros menores, prazo maior e assessoria completa. Você foca no negócio, nós cuidamos do crédito.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/simular">
              <Button size="lg" variant="secondary" className="font-semibold">
                Simular Agora
              </Button>
            </Link>
            <a href="https://wa.me/556135268355?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20ProCred+360." target="_blank" rel="noopener noreferrer">
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
