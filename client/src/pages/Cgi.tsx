import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  CheckCircle2,
  DollarSign,
  Calendar,
  Building2,
  AlertCircle,
  FileText,
  Users,
  TrendingUp,
  Phone,
  ChevronDown,
  ChevronUp,
  Home,
  Shield,
  ClipboardList,
  Search,
  Handshake,
} from "lucide-react";
import { useState } from "react";
import { COMPANY } from "@/config/company";

const faqs = [
  {
    q: "O que é CGI — Crédito com Garantia de Imóvel?",
    a: "CGI (também chamado de Home Equity) é uma modalidade de crédito em que o cliente oferece um imóvel de sua propriedade como garantia da operação. Por conta da garantia real, essa linha pode permitir valores maiores, prazos mais longos e condições diferenciadas em relação a linhas de crédito sem garantia. O imóvel continua em uso do proprietário durante o período do contrato.",
  },
  {
    q: "O imóvel fica bloqueado enquanto estou pagando?",
    a: "O imóvel permanece em uso do proprietário normalmente. O que ocorre é a constituição de alienação fiduciária em favor da instituição financeira como garantia da operação. Você pode continuar morando, alugando ou usando o imóvel, desde que mantenha as obrigações do contrato em dia.",
  },
  {
    q: "Qualquer imóvel pode ser usado como garantia?",
    a: "A elegibilidade do imóvel como garantia depende de análise da instituição financeira, que considera fatores como: tipo do imóvel (residencial, comercial, rural), localização, situação jurídica e documental, e avaliação de mercado. Imóveis com pendências jurídicas, documentação irregular ou em determinadas situações podem não ser aceitos. Nossa equipe orienta você durante todo esse processo.",
  },
  {
    q: "Qual o valor que posso obter?",
    a: "O valor disponível é calculado com base em uma fração do valor de avaliação do imóvel (LTV — Loan to Value), além de outros critérios como análise cadastral, capacidade de pagamento e política da instituição financeira. Os valores e percentuais são definidos pela instituição no momento da análise e podem variar. Não trabalhamos com valores fixos garantidos.",
  },
  {
    q: "Qual o prazo para pagamento?",
    a: "O prazo pode ser mais longo do que em linhas de crédito sem garantia, podendo chegar a vários anos dependendo da instituição e do perfil da operação. O prazo exato é definido na análise e contratação, conforme as políticas vigentes da instituição financeira.",
  },
  {
    q: "Pessoa física e pessoa jurídica podem contratar?",
    a: "Em geral, sim. Tanto pessoas físicas quanto jurídicas podem buscar essa modalidade, desde que atendam aos requisitos de análise de crédito, documentação e elegibilidade do imóvel. Cada caso é avaliado individualmente pela instituição financeira.",
  },
  {
    q: "Como a Destrava me ajuda nesse processo?",
    a: "Nossa equipe orienta você desde a avaliação inicial da viabilidade, passando pela organização da documentação necessária, até o acompanhamento junto à instituição financeira. Atuamos como assessoria consultiva para facilitar e dar clareza em cada etapa do processo.",
  },
  {
    q: "A aprovação é garantida?",
    a: "Não. A concessão do crédito é de responsabilidade exclusiva da instituição financeira, que realiza análise cadastral, de crédito, jurídica e avaliação do imóvel. Nossa atuação é de assessoria e facilitação — não garantimos aprovação.",
  },
];

const etapas = [
  {
    numero: "01",
    titulo: "Análise de Viabilidade",
    descricao: "Nossa equipe avalia o perfil do cliente, o imóvel disponível e a necessidade de crédito para verificar a viabilidade inicial da operação.",
    icon: Search,
  },
  {
    numero: "02",
    titulo: "Organização da Documentação",
    descricao: "Orientamos na coleta e organização de todos os documentos necessários: pessoais, da empresa (se PJ), e do imóvel.",
    icon: ClipboardList,
  },
  {
    numero: "03",
    titulo: "Avaliação do Imóvel",
    descricao: "A instituição financeira realiza a avaliação técnica e jurídica do imóvel para definir o valor de garantia aceito.",
    icon: Home,
  },
  {
    numero: "04",
    titulo: "Análise de Crédito",
    descricao: "A instituição financeira conduz a análise cadastral e de crédito do solicitante, conforme suas políticas internas.",
    icon: Shield,
  },
  {
    numero: "05",
    titulo: "Formalização e Registro",
    descricao: "Após aprovação, o contrato é formalizado com a constituição da alienação fiduciária e registro em cartório.",
    icon: FileText,
  },
  {
    numero: "06",
    titulo: "Liberação do Crédito",
    descricao: "Com tudo regularizado, o crédito é liberado conforme as condições definidas em contrato pela instituição financeira.",
    icon: Handshake,
  },
];

export default function Cgi() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const seoStructuredData = serviceStructuredData(
    "CGI — Crédito com Garantia de Imóvel",
    "Assessoria especializada em CGI (Home Equity): crédito com garantia de imóvel para pessoas físicas e jurídicas. Valores e condições sujeitos à análise de crédito e perfil do cliente."
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="CGI — Crédito com Garantia de Imóvel | Home Equity | Destrava Crédito"
        description="Assessoria em CGI (Home Equity): crédito com garantia de imóvel para PF e PJ. Valores e condições sujeitos à análise de crédito, documentação e avaliação do imóvel. Atendimento em Brasília e Goiânia."
        keywords="CGI crédito com garantia de imóvel, home equity, empréstimo com garantia de imóvel, crédito para empresa com garantia de imóvel, home equity Brasília, home equity Goiânia"
        structuredData={seoStructuredData}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-20">
        <div className="container">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-white/20 rounded-xl px-4 py-2 flex items-center gap-2 border border-white/30">
                <Home className="h-5 w-5 text-white" />
                <span className="text-sm font-semibold text-white">Home Equity</span>
              </div>
              <span className="text-sm font-semibold bg-white/20 px-3 py-1 rounded-full border border-white/30">
                Crédito com Garantia de Imóvel
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
              CGI — Crédito com<br />Garantia de Imóvel
            </h1>
            <p className="text-xl text-white/90 mb-2 font-medium">
              Use o patrimônio imobiliário como garantia para acessar crédito com condições diferenciadas
            </p>
            <p className="text-lg text-white/80 leading-relaxed mb-3">
              O CGI (também conhecido como Home Equity) é uma linha de crédito em que o imóvel do cliente serve como garantia real da operação. Sujeito a análise de crédito, documentação, avaliação do imóvel e políticas da instituição financeira.
            </p>
            <p className="text-sm text-white/60 mb-8 italic">
              Os valores, taxas e condições são estimativas e podem variar conforme análise de cada caso.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/simular">
                <Button size="lg" variant="secondary" className="font-semibold">
                  Simular Agora
                </Button>
              </Link>
              <a
                href={COMPANY.whatsappLinkMsg("Olá! Quero saber mais sobre o CGI — Crédito com Garantia de Imóvel.")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="lg" variant="outline" className="font-semibold border-white text-white hover:bg-white hover:text-primary">
                  <Phone className="h-4 w-4 mr-2" /> Falar com Especialista
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* DESTAQUES */}
      <section className="py-16">
        <div className="container">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <DollarSign className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Valores Maiores</h3>
              <p className="text-sm text-muted-foreground">Potencial de crédito superior ao de linhas sem garantia, conforme avaliação do imóvel e análise de crédito</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Calendar className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Prazos Mais Longos</h3>
              <p className="text-sm text-muted-foreground">Possibilidade de prazos estendidos para pagamento, conforme política da instituição financeira</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Home className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Imóvel em Uso</h3>
              <p className="text-sm text-muted-foreground">O proprietário continua usando o imóvel normalmente durante todo o período do contrato</p>
            </div>
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">PF e PJ</h3>
              <p className="text-sm text-muted-foreground">Disponível para pessoas físicas e jurídicas, sujeito à análise e elegibilidade</p>
            </div>
          </div>
        </div>
      </section>

      {/* O QUE É CGI */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-center">O que é o CGI?</h2>
            <div className="grid md:grid-cols-2 gap-8 items-start">
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  O <strong>CGI (Crédito com Garantia de Imóvel)</strong>, também chamado de <strong>Home Equity</strong>, é uma modalidade de crédito em que o cliente utiliza um imóvel de sua propriedade como garantia real da operação junto à instituição financeira.
                </p>
                <p>
                  Por conta da garantia real oferecida, essa linha pode permitir condições diferenciadas em relação a linhas de crédito sem garantia — como valores maiores e prazos mais longos. No entanto, todas as condições são definidas pela instituição financeira com base na análise do perfil do cliente, da documentação e da avaliação do imóvel.
                </p>
                <p>
                  O imóvel permanece em uso do proprietário durante o contrato. O que ocorre é a constituição de <strong>alienação fiduciária</strong> como mecanismo de garantia, que é registrada em cartório.
                </p>
              </div>
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" /> Para que pode ser usado
                  </h3>
                  <ul className="space-y-2 text-sm text-blue-800">
                    {[
                      "Capital de giro para empresas",
                      "Expansão ou modernização do negócio",
                      "Quitação de dívidas com juros mais altos",
                      "Investimentos pessoais ou empresariais",
                      "Reformas e melhorias",
                      "Outras finalidades, conforme análise",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PARA QUEM É */}
      <section className="py-16">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-4 text-center">Para quem é indicado?</h2>
            <p className="text-center text-muted-foreground mb-10">
              O CGI pode ser uma alternativa para diferentes perfis, sempre sujeito à análise de elegibilidade.
            </p>
            <div className="grid md:grid-cols-2 gap-5">
              {[
                {
                  icon: Users,
                  titulo: "Empresários e empreendedores",
                  desc: "Que possuem imóvel e buscam crédito para capital de giro, expansão ou investimento no negócio.",
                },
                {
                  icon: Building2,
                  titulo: "Empresas (PJ)",
                  desc: "Que precisam de crédito para operações empresariais e possuem imóvel elegível como garantia.",
                },
                {
                  icon: Home,
                  titulo: "Proprietários de imóveis (PF)",
                  desc: "Que desejam acessar crédito utilizando o patrimônio imobiliário como garantia.",
                },
                {
                  icon: TrendingUp,
                  titulo: "Quem busca reorganização financeira",
                  desc: "Que deseja consolidar dívidas ou reorganizar o passivo financeiro com condições potencialmente mais favoráveis.",
                },
              ].map((item) => (
                <div key={item.titulo} className="bg-card p-5 rounded-lg border border-border flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{item.titulo}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA A GARANTIA */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-4 text-center">Como funciona a garantia do imóvel?</h2>
            <p className="text-center text-muted-foreground mb-10">
              Entenda o mecanismo jurídico que viabiliza essa modalidade de crédito.
            </p>
            <div className="bg-card rounded-xl border border-border p-8 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold flex-shrink-0">1</div>
                <div>
                  <h3 className="font-bold mb-1">Alienação Fiduciária</h3>
                  <p className="text-sm text-muted-foreground">O imóvel é dado em garantia por meio de alienação fiduciária, instrumento jurídico em que a propriedade é transferida temporariamente à instituição financeira até a quitação do contrato.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold flex-shrink-0">2</div>
                <div>
                  <h3 className="font-bold mb-1">Uso Normal do Imóvel</h3>
                  <p className="text-sm text-muted-foreground">O proprietário mantém a posse direta e pode continuar usando, morando ou alugando o imóvel normalmente, desde que cumpra as obrigações do contrato.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold flex-shrink-0">3</div>
                <div>
                  <h3 className="font-bold mb-1">Avaliação e LTV</h3>
                  <p className="text-sm text-muted-foreground">A instituição financeira realiza avaliação técnica do imóvel. O valor do crédito é calculado com base em um percentual do valor de avaliação (LTV), definido pelas políticas da instituição.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold flex-shrink-0">4</div>
                <div>
                  <h3 className="font-bold mb-1">Quitação e Liberação da Garantia</h3>
                  <p className="text-sm text-muted-foreground">Ao quitar o contrato, a alienação fiduciária é extinta e a propriedade plena retorna ao titular, com o devido registro em cartório.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ETAPAS DO PROCESSO */}
      <section className="py-16">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-4 text-center">Etapas do Processo</h2>
            <p className="text-center text-muted-foreground mb-10">
              Como funciona a assessoria da Destrava na operação de CGI.
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {etapas.map((etapa) => (
                <div key={etapa.numero} className="bg-card p-6 rounded-xl border border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl font-black text-primary/20">{etapa.numero}</span>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <etapa.icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <h3 className="font-bold mb-2">{etapa.titulo}</h3>
                  <p className="text-sm text-muted-foreground">{etapa.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* DOCUMENTOS INICIAIS */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-4 text-center">Documentos Iniciais</h2>
            <p className="text-center text-muted-foreground mb-10">
              Documentação básica geralmente necessária para início da análise. A lista completa é definida pela instituição financeira.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card p-6 rounded-lg border border-border">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Documentos Pessoais (PF / Sócios)
                </h3>
                <ul className="space-y-3">
                  {[
                    "RG e CPF",
                    "Comprovante de residência atualizado",
                    "Comprovante de renda (holerite, IR, extrato)",
                    "Certidão de estado civil",
                    "Documentos do cônjuge (se casado)",
                  ].map((doc) => (
                    <li key={doc} className="flex items-start gap-2 text-sm">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{doc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-card p-6 rounded-lg border border-border">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Home className="h-5 w-5 text-primary" /> Documentos do Imóvel
                </h3>
                <ul className="space-y-3">
                  {[
                    "Matrícula atualizada do imóvel (máx. 30 dias)",
                    "IPTU do exercício atual",
                    "Certidões negativas de ônus e ações",
                    "Planta baixa ou croqui (quando solicitado)",
                    "Documentos do condomínio (se aplicável)",
                  ].map((doc) => (
                    <li key={doc} className="flex items-start gap-2 text-sm">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{doc}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-card p-6 rounded-lg border border-border md:col-span-2">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" /> Documentos Empresariais (PJ — quando aplicável)
                </h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {[
                    "CNPJ e contrato social / estatuto atualizado",
                    "Balanço patrimonial e DRE (últimos 2 exercícios)",
                    "Extratos bancários (últimos 3 a 6 meses)",
                    "Faturamento comprovado",
                    "Certidões negativas de débitos federais e estaduais",
                    "Documentos dos sócios administradores",
                  ].map((doc) => (
                    <div key={doc} className="flex items-start gap-2 text-sm">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{doc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                <strong>Atenção:</strong> A lista acima é indicativa. A documentação completa e definitiva é definida pela instituição financeira no momento da análise, podendo incluir documentos adicionais conforme o perfil da operação.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-4 text-center">Perguntas Frequentes</h2>
            <p className="text-center text-muted-foreground mb-10">
              Tire suas dúvidas sobre o CGI — Crédito com Garantia de Imóvel.
            </p>
            <div className="space-y-3">
              {faqs.map((faq, idx) => (
                <div key={idx} className="border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left font-semibold hover:bg-muted/50 transition-colors"
                  >
                    <span>{faq.q}</span>
                    {openFaq === idx ? (
                      <ChevronUp className="h-5 w-5 text-primary flex-shrink-0 ml-3" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-3" />
                    )}
                  </button>
                  {openFaq === idx && (
                    <div className="px-6 pb-5 text-muted-foreground text-sm leading-relaxed border-t border-border pt-4">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA WHATSAPP */}
      <section className="py-16 bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Quer saber se o CGI é viável para você?
          </h2>
          <p className="text-xl text-white/90 mb-3 max-w-2xl mx-auto">
            Fale com nossa equipe. Avaliamos o seu perfil e orientamos sobre as possibilidades, sem compromisso.
          </p>
          <p className="text-sm text-white/60 mb-8 italic">
            A análise de viabilidade é gratuita. A aprovação final depende da instituição financeira.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href={COMPANY.whatsappLinkMsg("Olá! Quero saber mais sobre o CGI — Crédito com Garantia de Imóvel.")}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" variant="secondary" className="font-semibold text-lg px-8">
                <Phone className="h-5 w-5 mr-2" /> Falar no WhatsApp
              </Button>
            </a>
            <Link href="/contato">
              <Button size="lg" variant="outline" className="font-semibold border-white text-white hover:bg-white hover:text-primary text-lg px-8">
                Enviar Mensagem
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* DISCLAIMER JURÍDICO */}
      <section className="py-10 bg-gray-50">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Aviso Importante</p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    As informações apresentadas nesta página têm caráter exclusivamente informativo e educacional, e não constituem proposta, oferta ou garantia de crédito. O CGI — Crédito com Garantia de Imóvel é uma modalidade sujeita a análise cadastral, de crédito, jurídica e avaliação do imóvel pela instituição financeira. Os valores, taxas, prazos e condições apresentados são estimativas de referência e podem variar conforme o perfil do cliente, documentação, avaliação do imóvel e políticas vigentes da instituição financeira no momento da contratação. A Destrava atua como assessoria empresarial e não realiza a concessão de crédito, que é de responsabilidade exclusiva da instituição financeira parceira. Não garantimos aprovação. Sujeito à análise e aprovação.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
