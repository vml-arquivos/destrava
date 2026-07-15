import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, {
  faqStructuredData,
  serviceStructuredData,
  structuredDataGraph,
} from "@/components/SEO";
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
 * Perguntas frequentes alinhadas às condições oficiais consultadas em julho de 2026.
 * Valores e prazos variam conforme a instituição financeira e a análise de crédito.
 */
const faqs = [
  {
    q: "Quem pode solicitar o Novo Pronampe?",
    a: "O programa atende MEIs, microempresas e empresas de pequeno porte, observados o enquadramento legal, as regras vigentes e os critérios da instituição financeira participante.",
  },
  {
    q: "Qual o valor máximo que posso obter?",
    a: "O limite depende da regra vigente e da instituição. Na CAIXA, a condição divulgada é de até 50% do faturamento anual informado à Receita Federal, limitada a R$ 500 mil por CNPJ e sujeita à capacidade de pagamento e à disponibilidade de recursos.",
  },
  {
    q: "Qual a taxa de juros do Novo Pronampe?",
    a: "Para operações a partir de 2021, o portal do Governo Federal informa taxa anual máxima de Selic acrescida de 6%. A taxa efetiva, o custo total e as demais condições devem ser confirmados na proposta da instituição financeira.",
  },
  {
    q: "Qual o prazo de pagamento?",
    a: "O prazo varia por instituição e modalidade. A CAIXA divulga prazo total de até 60 meses, com carência de até 24 meses, sujeito às condições vigentes e à aprovação de crédito.",
  },
  {
    q: "Quais garantias são exigidas?",
    a: "As garantias e exigências variam conforme a operação e a instituição participante. O PRONAMPE pode contar com cobertura do Fundo Garantidor de Operações, mas isso não elimina a análise de crédito nem assegura a contratação.",
  },
  {
    q: "Como a Destrava Crédito me ajuda no Novo Pronampe?",
    a: "A Destrava faz o diagnóstico inicial, orienta a organização dos documentos, compara alternativas disponíveis e acompanha a solicitação. A decisão final e as condições são exclusivas da instituição financeira.",
  },
];

export default function Pronampe() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="PRONAMPE 2026: regras, condições e como solicitar | Destrava"
        description="Entenda quem pode solicitar o PRONAMPE, os documentos, as condições divulgadas por instituições participantes e como preparar sua empresa para a análise."
        keywords="PRONAMPE 2026, crédito para micro e pequenas empresas, empréstimo MEI, capital de giro, documentos PRONAMPE"
        structuredData={structuredDataGraph(
          serviceStructuredData(
            "Assessoria para PRONAMPE",
            "Orientação para pequenos negócios avaliarem elegibilidade, documentos e condições vigentes do PRONAMPE."
          ),
          faqStructuredData(
            faqs.map(({ q, a }) => ({ question: q, answer: a }))
          )
        )}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-20">
        <div className="container">
          <div className="max-w-3xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-white rounded-xl px-4 py-2 flex items-center justify-center h-16">
                <img
                  src="/logo-pronampe.webp"
                  alt="PRONAMPE"
                  className="h-12 w-auto object-contain"
                />
              </div>
              <span className="text-sm font-semibold bg-white/20 px-3 py-1 rounded-full border border-white/30">
                Programa Federal
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">PRONAMPE</h1>
            <p className="text-xl text-white/90 mb-2 font-medium">
              Programa Nacional de Apoio às Microempresas e Empresas de Pequeno
              Porte
            </p>
            <p className="text-lg text-white/80 leading-relaxed mb-8">
              Entenda as regras vigentes, organize a documentação e compare as
              condições disponíveis. Na CAIXA, o limite divulgado é de até{" "}
              <strong>R$ 500 mil</strong>, sempre sujeito à análise e à
              disponibilidade de recursos.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary" className="font-semibold">
                <Link href="/simular">
                  Simular Agora
                </Link>
              </Button>
              <Button asChild
                  size="lg"
                  variant="outline"
                  className="font-semibold border-white text-white hover:bg-white hover:text-primary"
                >
                <a
                href="https://wa.me/556135268355?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20PRONAMPE."
                target="_blank"
                rel="noopener noreferrer"
              >
                  <Phone className="h-4 w-4 mr-2" /> Falar com Especialista
                </a>
              </Button>
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
              <h3 className="font-bold text-lg mb-2">Referência CAIXA</h3>
              <p className="text-2xl font-bold text-primary mb-2">
                Até R$ 500 mil
              </p>
              <p className="text-sm text-muted-foreground">
                Até 50% do faturamento, sujeito à análise
              </p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Percent className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Taxa de Juros</h3>
              <p className="text-2xl font-bold text-primary mb-2">
                Até Selic + 6% a.a.*
              </p>
              <p className="text-sm text-muted-foreground">
                *Teto anual informado nas fontes oficiais consultadas
              </p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Calendar className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Prazo</h3>
              <p className="text-2xl font-bold text-primary mb-2">
                Até 60 meses*
              </p>
              <p className="text-sm text-muted-foreground">
                *Condição divulgada pela CAIXA; carência de até 24 meses
              </p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Público-Alvo</h3>
              <p className="text-2xl font-bold text-primary mb-2">
                MEI / ME / EPP
              </p>
              <p className="text-sm text-muted-foreground">
                Conforme o enquadramento legal vigente
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PARA QUE USAR */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center">
              Para que você pode usar o PRONAMPE?
            </h2>
            <p className="text-center text-muted-foreground mb-10">
              O crédito pode ser utilizado para qualquer finalidade relacionada
              à atividade empresarial.
            </p>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Capital de Giro</h3>
                  <p className="text-sm text-muted-foreground">
                    Manter o fluxo de caixa saudável e cobrir despesas
                    operacionais do dia a dia.
                  </p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Estoque</h3>
                  <p className="text-sm text-muted-foreground">
                    Comprar mercadorias, matérias-primas ou insumos para ampliar
                    a capacidade produtiva.
                  </p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Equipamentos</h3>
                  <p className="text-sm text-muted-foreground">
                    Adquirir máquinas, equipamentos e ferramentas para
                    modernizar a operação.
                  </p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">
                    Reforma e Infraestrutura
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Reformar o estabelecimento, ampliar o espaço físico ou
                    melhorar a estrutura.
                  </p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Marketing e Tecnologia</h3>
                  <p className="text-sm text-muted-foreground">
                    Investir em marketing digital, sistemas de gestão e
                    ferramentas tecnológicas.
                  </p>
                </div>
              </div>
              <div className="bg-card p-5 rounded-lg border border-border flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold mb-1">Refinanciamento</h3>
                  <p className="text-sm text-muted-foreground">
                    Quitar operações vigentes quando essa destinação estiver
                    admitida pelas regras e pela proposta da instituição.
                  </p>
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
            <h2 className="text-3xl font-bold mb-10 text-center">
              Requisitos e Documentação
            </h2>
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
                    <span>Faturamento anual de até R$ 4,8 milhões</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Empresas novas seguem critérios específicos de cálculo</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Cadastro e informações fiscais atualizados</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Sujeição à política de crédito da instituição</span>
                  </li>
                </ul>
              </div>
              <div className="bg-card p-6 rounded-lg border border-border">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" /> Documentos
                  necessários
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>CNPJ e contrato social / certificado MEI</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>RG e CPF de todos os sócios</span>
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
                    <span>Extratos e documentos adicionais solicitados pelo banco</span>
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
          <h2 className="text-3xl font-bold mb-10 text-center">
            Como Funciona com a Destrava
          </h2>
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                n: "01",
                icon: Users,
                title: "Análise Gratuita",
                desc: "Avaliamos seu perfil e verificamos a elegibilidade sem custo.",
              },
              {
                n: "02",
                icon: FileText,
                title: "Organização Documental",
                desc: "Preparamos e organizamos toda a documentação necessária.",
              },
              {
                n: "03",
                icon: Building2,
                title: "Negociação Bancária",
                desc: "Identificamos o banco com melhores condições e conduzimos a negociação.",
              },
              {
                n: "04",
                icon: TrendingUp,
                title: "Acompanhamento",
                desc: "Acompanhamos a solicitação e ajudamos a esclarecer exigências até a decisão do banco.",
              },
            ].map(step => (
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
          <h2 className="text-3xl font-bold mb-10 text-center">
            Perguntas Frequentes
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="border border-border rounded-lg overflow-hidden bg-card"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="font-semibold pr-4">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="h-5 w-5 text-primary flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
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

      {/* FONTES OFICIAIS */}
      <section className="py-8 bg-muted/30">
        <div className="container max-w-4xl">
          <h2 className="text-2xl font-bold mb-3">Fontes oficiais consultadas</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Conteúdo revisado em julho de 2026. As condições podem mudar e devem
            ser confirmadas diretamente com a instituição financeira.
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="https://www.gov.br/memp/pt-br/programa-acredita/novo-desenrola-brasil/novo-pronampe"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                Ministério do Empreendedorismo — Novo PRONAMPE
              </a>
            </li>
            <li>
              <a
                href="https://www.caixa.gov.br/empresa/credito-financiamento/capital-de-giro/pronampe/Paginas/default.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                CAIXA — condições do PRONAMPE
              </a>
            </li>
            <li>
              <a
                href="https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l13999.htm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
              >
                Lei nº 13.999/2020 — texto compilado
              </a>
            </li>
          </ul>
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
                  A Destrava atua como assessoria empresarial para captação de
                  crédito. A concessão final do crédito é de responsabilidade
                  exclusiva da instituição financeira. As condições estão
                  sujeitas à análise e aprovação. As simulações são estimativas
                  e não constituem oferta de crédito.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-16 bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Pronto para acessar o PRONAMPE?
          </h2>
          <p className="text-lg text-white/80 mb-8 max-w-xl mx-auto">
            Nossa equipe organiza a análise e orienta a solicitação para você
            decidir com mais clareza e segurança.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" variant="secondary" className="font-semibold">
              <Link href="/simular">
                Simular Agora
              </Link>
            </Button>
            <Button asChild
                size="lg"
                variant="outline"
                className="font-semibold border-white text-white hover:bg-white hover:text-primary"
              >
              <a
              href="https://wa.me/556135268355?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20PRONAMPE."
              target="_blank"
              rel="noopener noreferrer"
            >
                <Phone className="h-4 w-4 mr-2" /> Falar com Especialista
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
