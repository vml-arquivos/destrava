import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BannerDisplay } from "@/components/BannerDisplay";
import SEO, { faqStructuredData, serviceStructuredData } from "@/components/SEO";
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
  FileText,
  Scale,
  SearchCheck,
  Wallet,
  AlertCircle,
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

const creditoPessoalFaqs = [
  {
    question: "Qual é a diferença entre taxa de juros e CET?",
    answer: "A taxa de juros remunera o crédito. O Custo Efetivo Total, ou CET, reúne juros, tarifas, tributos, seguros e outros custos previstos na proposta. Para comparar alternativas, o CET e o valor total a pagar são referências mais completas do que a taxa isolada.",
  },
  {
    question: "Ter renda comprovada garante a aprovação?",
    answer: "Não. A renda é um dos elementos analisados, mas a decisão também pode considerar histórico de crédito, comprometimento de renda, documentos, modalidade escolhida e política da instituição financeira. Toda contratação permanece sujeita à análise.",
  },
  {
    question: "Crédito consignado está disponível para qualquer pessoa?",
    answer: "Não. O consignado depende de elegibilidade, convênio ativo e margem consignável. Servidores, aposentados e pensionistas podem ter acesso conforme as regras aplicáveis ao vínculo e à instituição responsável pela proposta.",
  },
  {
    question: "Posso usar o FGTS no financiamento imobiliário?",
    answer: "O uso do FGTS pode ser permitido em operações elegíveis, desde que o comprador, o imóvel e a finalidade atendam às regras vigentes. A possibilidade precisa ser confirmada durante a análise da operação.",
  },
  {
    question: "Como comparar duas propostas de crédito pessoal?",
    answer: "Compare CET, valor líquido recebido, número e valor das parcelas, total a pagar, datas de vencimento, garantias, seguros e condições para quitação antecipada. Uma parcela menor não significa necessariamente um custo total menor.",
  },
  {
    question: "A simulação obriga a contratar?",
    answer: "Não. A simulação serve para organizar a necessidade e iniciar a avaliação das alternativas. A contratação somente ocorre após apresentação das condições, análise, aceite do cliente e formalização pela instituição financeira.",
  },
];

const creditoPessoalStructuredData = [
  serviceStructuredData(
    "Crédito para Pessoa Física",
    "Orientação e comparação de modalidades de crédito para pessoa física, incluindo consignado, crédito pessoal e financiamentos.",
  ),
  faqStructuredData(creditoPessoalFaqs),
];

export default function CreditoPessoaFisica() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Crédito para Pessoa Física - Consignado, Pessoal, Imóvel e Veículo"
        description="Compare modalidades de crédito para pessoa física, como consignado, crédito pessoal e financiamentos. Condições sujeitas à análise e ao CET da proposta."
        keywords="crédito pessoal, consignado, financiamento imobiliário, financiamento veículo, crédito pessoa física, empréstimo pessoal"
        structuredData={creditoPessoalStructuredData}
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
              Encontre a melhor linha de crédito para você: consignado, crédito pessoal, financiamento de imóvel ou veículo. Análise de perfil e orientação especializada.
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

      <BannerDisplay position="credito_pessoal_banner" ariaLabel="Solução pessoal em destaque" />

      {/* INTRODUÇÃO E DECISÃO */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto grid lg:grid-cols-[1.35fr_0.65fr] gap-10 items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-blue-700 mb-3">Crédito com decisão consciente</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5">A modalidade certa começa pela finalidade, não pela parcela</h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  Crédito para pessoa física reúne soluções diferentes para necessidades também diferentes. Uma despesa pontual, a compra de um veículo e a aquisição de um imóvel não devem ser avaliadas com os mesmos critérios. Prazo, garantia, forma de pagamento e custo total mudam conforme a modalidade e o perfil analisado.
                </p>
                <p>
                  Antes de solicitar, defina o valor realmente necessário, a finalidade do recurso e a parcela que cabe no orçamento sem comprometer despesas essenciais. Em seguida, compare propostas pelo <strong>Custo Efetivo Total (CET)</strong>, pelo valor total a pagar e pelas condições contratuais. A taxa anunciada, isoladamente, não mostra todos os custos da operação.
                </p>
                <p>
                  A Destrava ajuda a organizar essas informações e a entender o caminho de análise. A concessão, os limites e as condições finais são definidos exclusivamente pela instituição financeira, conforme documentos, elegibilidade e política de crédito vigente.
                </p>
              </div>
            </div>
            <aside className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
              <Scale className="h-8 w-8 text-blue-700 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-4">Quatro perguntas antes de avançar</h3>
              <ol className="space-y-4 text-sm text-gray-700">
                {[
                  "Qual problema o crédito precisa resolver?",
                  "Qual valor é suficiente, sem contratar além do necessário?",
                  "Qual parcela cabe no orçamento com margem de segurança?",
                  "Qual é o CET e o total a pagar até o fim do contrato?",
                ].map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold flex-shrink-0">{index + 1}</span>
                    <span className="pt-1">{item}</span>
                  </li>
                ))}
              </ol>
            </aside>
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

      {/* COMPARATIVO */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="max-w-3xl mb-8">
              <p className="text-sm font-bold uppercase tracking-wider text-blue-700 mb-3">Comparação orientativa</p>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Entenda quando cada solução pode fazer sentido</h2>
              <p className="text-gray-600 leading-relaxed">
                O quadro abaixo organiza as diferenças gerais entre as modalidades. Ele não substitui uma proposta formal nem representa promessa de aprovação, taxa ou limite.
              </p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-[#123a5a] text-white">
                  <tr>
                    <th className="p-4 font-semibold">Modalidade</th>
                    <th className="p-4 font-semibold">Uso principal</th>
                    <th className="p-4 font-semibold">Ponto de atenção</th>
                    <th className="p-4 font-semibold">O que comparar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  <tr className="bg-white"><td className="p-4 font-semibold text-gray-900">Consignado</td><td className="p-4">Necessidades de uso livre por público elegível</td><td className="p-4">Convênio e margem consignável</td><td className="p-4">CET, prazo e impacto do desconto em folha</td></tr>
                  <tr className="bg-gray-50"><td className="p-4 font-semibold text-gray-900">Crédito pessoal</td><td className="p-4">Despesas planejadas ou necessidade pontual</td><td className="p-4">Custo total e comprometimento de renda</td><td className="p-4">CET, parcela, total a pagar e condições</td></tr>
                  <tr className="bg-white"><td className="p-4 font-semibold text-gray-900">Financiamento imobiliário</td><td className="p-4">Aquisição de imóvel elegível</td><td className="p-4">Entrada, avaliação, documentação e longo prazo</td><td className="p-4">Sistema de amortização, CET, seguros e total</td></tr>
                  <tr className="bg-gray-50"><td className="p-4 font-semibold text-gray-900">Financiamento de veículo</td><td className="p-4">Compra de veículo novo ou usado</td><td className="p-4">Entrada, valor do bem e custo do contrato</td><td className="p-4">CET, prazo, parcela e valor total financiado</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESSO E DOCUMENTOS */}
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <p className="text-sm font-bold uppercase tracking-wider text-blue-700 mb-3">Do planejamento à proposta</p>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Como funciona a análise de crédito</h2>
              <p className="text-gray-600">O fluxo pode variar entre instituições, mas normalmente passa pelas etapas abaixo.</p>
            </div>
            <div className="grid md:grid-cols-4 gap-5 mb-12">
              {[
                { icon: Wallet, title: "1. Necessidade", desc: "Definição de finalidade, valor necessário e capacidade de pagamento." },
                { icon: FileText, title: "2. Documentos", desc: "Organização de identificação, renda e documentos específicos da modalidade." },
                { icon: SearchCheck, title: "3. Análise", desc: "Avaliação de elegibilidade, perfil, comprometimento de renda e política de crédito." },
                { icon: Scale, title: "4. Comparação", desc: "Leitura de CET, parcelas, prazo, garantias e valor total antes do aceite." },
              ].map((step) => (
                <article key={step.title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <step.icon className="h-7 w-7 text-blue-700 mb-4" />
                  <h3 className="font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{step.desc}</p>
                </article>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-7">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Documentos que podem ser solicitados</h3>
                <ul className="space-y-3 text-sm text-gray-700">
                  {["Documento oficial de identificação e CPF", "Comprovante de residência atualizado", "Comprovantes de renda ou movimentação compatíveis", "Informações bancárias e autorizações necessárias", "Documentos do imóvel ou veículo, quando aplicável"].map((item) => (
                    <li key={item} className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />{item}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-7">
                <AlertCircle className="h-7 w-7 text-amber-700 mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-4">Cuidados antes de assinar</h3>
                <ul className="space-y-3 text-sm text-gray-700">
                  {["Confirme o CET e o valor total a pagar", "Leia regras de atraso, seguros e tarifas", "Verifique datas de vencimento e forma de débito", "Não faça pagamentos antecipados a desconhecidos", "Guarde a proposta e o contrato formalizados"].map((item) => (
                    <li key={item} className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-amber-700 flex-shrink-0" />{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-sm font-bold uppercase tracking-wider text-blue-700 mb-3">Dúvidas frequentes</p>
              <h2 className="text-3xl font-bold text-gray-900">Crédito para pessoa física</h2>
            </div>
            <div className="space-y-3">
              {creditoPessoalFaqs.map((faq) => (
                <details key={faq.question} className="group rounded-xl border border-gray-200 bg-white p-5 open:shadow-sm">
                  <summary className="cursor-pointer list-none font-semibold text-gray-900 flex items-center justify-between gap-4">
                    {faq.question}
                    <span aria-hidden="true" className="text-blue-700 text-xl group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="mt-4 text-gray-600 leading-relaxed">{faq.answer}</p>
                </details>
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
                { icon: Shield, title: "Análise de Perfil", desc: "Avaliamos seu perfil com atenção para encontrar a melhor opção disponível.", color: "text-blue-600", bg: "bg-blue-50" },
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
