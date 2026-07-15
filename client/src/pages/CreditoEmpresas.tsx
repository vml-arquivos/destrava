import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BannerDisplay } from "@/components/BannerDisplay";
import SEO, { faqStructuredData, serviceStructuredData } from "@/components/SEO";
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
  Scale,
  SearchCheck,
  AlertCircle,
} from "lucide-react";

const linhasCredito = [
  {
    id: "pronampe",
    nome: "PRONAMPE",
    subtitulo: "Programa Nacional de Apoio às Micro e Pequenas Empresas",
    descricao: "Programa federal para MEI, micro e pequenas empresas, sujeito às regras vigentes e à análise da instituição financeira.",
    taxa: "Até Selic + 6% a.a.*",
    valor: "Conforme faturamento e regras vigentes",
    prazo: "Conforme instituição",
    carencia: "Conforme instituição",
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
    descricao: "Alternativa de capital de giro sujeita à disponibilidade, às condições vigentes e à análise da CAIXA.",
    taxa: "Conforme análise e CET da proposta",
    valor: "Conforme análise",
    prazo: "Conforme instituição",
    carencia: "Conforme instituição",
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
    taxa: "Conforme Plano Safra vigente",
    valor: "Conforme projeto e regras vigentes",
    prazo: "Conforme projeto",
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
    taxa: "Conforme instituição e perfil",
    valor: "Conforme análise",
    prazo: "Conforme instituição",
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
    taxa: "Conforme instituição e bem financiado",
    valor: "Conforme projeto",
    prazo: "Conforme operação",
    carencia: "Conforme operação",
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

const creditoEmpresarialFaqs = [
  {
    question: "Qual linha de crédito empresarial é mais adequada para a minha empresa?",
    answer: "A escolha depende da finalidade do recurso, porte, faturamento, tempo de atividade, capacidade de pagamento, garantias disponíveis e regras vigentes de cada programa. A análise deve começar pela necessidade da empresa e só depois comparar as linhas elegíveis.",
  },
  {
    question: "Ter CNPJ ativo garante a aprovação do crédito?",
    answer: "Não. O CNPJ ativo é apenas um requisito inicial em muitas operações. A instituição financeira pode avaliar cadastro, movimentação, faturamento, endividamento, documentos, garantias e histórico de pagamento antes de decidir.",
  },
  {
    question: "É possível solicitar crédito empresarial com restrição?",
    answer: "A existência de restrições pode afetar a análise, mas os critérios variam conforme instituição e modalidade. O caminho responsável é identificar a origem da pendência, regularizar o que for possível e apresentar informações consistentes sobre a situação atual da empresa.",
  },
  {
    question: "Qual é a diferença entre capital de giro e financiamento?",
    answer: "Capital de giro costuma atender despesas operacionais e necessidades de caixa. Financiamentos normalmente estão vinculados à aquisição de um bem ou investimento específico. Finalidade, prazo, garantias e documentos tendem a ser diferentes.",
  },
  {
    question: "Quais documentos costumam ser analisados?",
    answer: "Podem ser solicitados documentos societários, comprovantes de faturamento, extratos, declarações fiscais, demonstrativos financeiros, certidões e informações dos sócios. A lista final varia conforme porte, linha e instituição.",
  },
  {
    question: "A Destrava aprova ou libera o crédito?",
    answer: "Não. A Destrava atua na orientação, organização e acompanhamento do processo. A decisão de crédito, as condições e a liberação são de responsabilidade exclusiva da instituição financeira.",
  },
];

const creditoEmpresarialStructuredData = [
  serviceStructuredData(
    "Crédito para Empresas",
    "Assessoria para organização e comparação de linhas de crédito empresarial para diferentes portes e finalidades.",
  ),
  faqStructuredData(creditoEmpresarialFaqs),
];

const comparativoEmpresarial = [
  { nome: "PRONAMPE", href: "/pronampe", perfil: "MEI, micro e pequenas empresas elegíveis", finalidade: "Capital de giro e necessidades empresariais", atencao: "Regras do programa, faturamento, dados fiscais e análise bancária" },
  { nome: "ProCred 360", href: "/procred360", perfil: "Negócios elegíveis conforme regras vigentes", finalidade: "Apoio ao desenvolvimento e à operação", atencao: "Critérios do programa, instituição operadora e disponibilidade" },
  { nome: "Giro CAIXA Fácil", href: "/giro-caixa-facil", perfil: "Empresas elegíveis na CAIXA", finalidade: "Capital de giro", atencao: "Relacionamento, cadastro, CET e análise da instituição" },
  { nome: "FCO", href: "/fco", perfil: "Empresas e projetos elegíveis no Centro-Oeste", finalidade: "Investimento, expansão e atividades enquadráveis", atencao: "Localização, projeto, finalidade e regras do fundo" },
  { nome: "PEAC FGI", href: "/peac-fgi", perfil: "Empresas enquadradas nas operações participantes", finalidade: "Crédito com apoio de fundo garantidor", atencao: "Cobertura da garantia não elimina a análise de crédito" },
  { nome: "FAMPE", href: "/fampe", perfil: "Pequenos negócios elegíveis", finalidade: "Complemento de garantia em operações participantes", atencao: "Regras do fundo, instituição e capacidade de pagamento" },
  { nome: "CGI", href: "/credito-com-garantia-de-imovel", perfil: "Empresas ou responsáveis com imóvel elegível", finalidade: "Crédito com garantia de imóvel", atencao: "Avaliação do bem, custos, risco patrimonial e prazo" },
];

export default function CreditoEmpresas() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Crédito para Empresas - Linhas de Crédito PJ | Destrava Crédito"
        description="Linhas de crédito para empresas de todos os portes. PRONAMPE, Giro CAIXA Fácil, PRONAMP, capital de giro para médio e grande porte, financiamento de equipamentos."
        keywords="crédito empresarial, PRONAMPE, Giro CAIXA Fácil, PRONAMP, capital de giro, financiamento empresas, crédito PJ, linhas de crédito"
        structuredData={creditoEmpresarialStructuredData}
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
              <Button asChild size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8">
                <Link href="/simular">
                  Simular Crédito Agora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                <a href="https://wa.me/556135268355?text=Olá! Preciso de crédito para minha empresa." target="_blank" rel="noopener noreferrer">
                  Falar com Especialista
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <BannerDisplay position="credito_empresas_banner" ariaLabel="Solução empresarial em destaque" />

      {/* VISÃO ESTRATÉGICA */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.3fr_0.7fr] gap-10 items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-[var(--color-caixa-blue)] mb-3">Crédito com finalidade definida</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-5">A linha adequada precisa combinar com o caixa, o projeto e a capacidade de pagamento</h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  Crédito empresarial pode financiar capital de giro, compra de equipamentos, expansão, reorganização financeira ou um projeto específico. Cada objetivo exige uma estrutura diferente. Contratar um recurso de curto prazo para um investimento de retorno longo, por exemplo, pode pressionar o caixa mesmo quando a parcela parece acessível.
                </p>
                <p>
                  Uma decisão consistente começa pela leitura do fluxo de caixa, do ciclo financeiro, do valor necessário e do prazo em que o recurso deve gerar resultado. Depois, é preciso verificar elegibilidade, garantias, documentos e custo efetivo total. O faturamento isolado não determina aprovação nem indica, sozinho, quanto a empresa pode assumir.
                </p>
                <p>
                  A Destrava organiza o processo e ajuda a comparar caminhos possíveis. A aprovação, os limites, as taxas e a liberação permanecem sob responsabilidade da instituição financeira e podem variar conforme o perfil e as condições vigentes.
                </p>
              </div>
            </div>
            <aside className="bg-blue-50 border border-blue-100 rounded-2xl p-7">
              <SearchCheck className="h-8 w-8 text-[var(--color-caixa-blue)] mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-4">Diagnóstico antes da proposta</h3>
              <ul className="space-y-3 text-sm text-gray-700">
                {["Finalidade e valor realmente necessários", "Capacidade de pagamento e sazonalidade do caixa", "Porte, faturamento e tempo de atividade", "Documentos fiscais, bancários e societários", "Garantias disponíveis e riscos da operação", "CET, prazo e valor total a pagar"].map((item) => (
                  <li key={item} className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />{item}</li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="py-10 bg-white border-b border-gray-100">
        <div className="container px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { num: "MEI a LTDA", label: "Perfis Empresariais" },
              { num: "Consultiva", label: "Análise de Crédito" },
              { num: "Múltiplas", label: "Modalidades Avaliadas" },
              { num: "LGPD", label: "Dados Protegidos" },
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
                  <Button asChild className="w-full bg-white/20 hover:bg-white/30 text-white font-bold border border-white/30">
                    <Link href="/simular">
                      Simular {linha.nome}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
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
                  <Button asChild size="sm" className="w-full bg-[var(--color-caixa-blue)] hover:bg-blue-700 text-white font-bold text-xs">
                    <Link href="/simular">
                      Simular
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TABELA COMPARATIVA */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-6xl mx-auto">
            <div className="max-w-3xl mb-8">
              <p className="text-sm font-bold uppercase tracking-wider text-[var(--color-caixa-blue)] mb-3">Mapa de alternativas</p>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Compare as principais linhas e mecanismos de apoio</h2>
              <p className="text-gray-600 leading-relaxed">
                Esta comparação é orientativa. Elegibilidade, disponibilidade, custos e condições devem ser confirmados na análise e na proposta formal da instituição financeira.
              </p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
              <table className="w-full min-w-[980px] text-left">
                <thead className="bg-[var(--color-caixa-blue-dark)] text-white">
                  <tr>
                    <th className="p-4 font-semibold">Linha</th>
                    <th className="p-4 font-semibold">Perfil geral</th>
                    <th className="p-4 font-semibold">Finalidade</th>
                    <th className="p-4 font-semibold">Ponto de atenção</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  {comparativoEmpresarial.map((linha, index) => (
                    <tr key={linha.nome} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="p-4 font-semibold"><Link href={linha.href} className="text-[var(--color-caixa-blue)] hover:underline">{linha.nome}</Link></td>
                      <td className="p-4">{linha.perfil}</td>
                      <td className="p-4">{linha.finalidade}</td>
                      <td className="p-4">{linha.atencao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-4">Fundos garantidores podem complementar garantias da operação, mas não substituem a análise nem representam aprovação automática.</p>
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

      {/* DOCUMENTOS E PREPARAÇÃO */}
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-7 shadow-sm">
              <FileText className="h-8 w-8 text-[var(--color-caixa-blue)] mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Documentação que pode ser solicitada</h2>
              <p className="text-gray-600 mb-5 leading-relaxed">A lista depende da linha e do porte, mas a preparação costuma envolver:</p>
              <ul className="space-y-3 text-sm text-gray-700">
                {["Contrato social e alterações ou documento equivalente", "Documentos dos sócios e representantes", "Comprovantes de faturamento e declarações fiscais", "Extratos bancários e informações de endividamento", "Balanço, balancete ou demonstrativos compatíveis com o porte", "Orçamentos, projetos e documentos de garantias, quando aplicável"].map((item) => (
                  <li key={item} className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />{item}</li>
                ))}
              </ul>
            </div>
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-7">
              <AlertCircle className="h-8 w-8 text-amber-700 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-4">O que enfraquece uma solicitação</h2>
              <p className="text-gray-600 mb-5 leading-relaxed">Inconsistências não significam recusa automática, mas precisam ser entendidas antes do protocolo.</p>
              <ul className="space-y-3 text-sm text-gray-700">
                {["Valor solicitado sem relação clara com a finalidade", "Documentos divergentes ou desatualizados", "Fluxo de caixa incapaz de absorver a nova parcela", "Mistura recorrente entre finanças pessoais e empresariais", "Pendências cadastrais ou fiscais não explicadas", "Ausência de informações sobre garantias e contrapartidas"].map((item) => (
                  <li key={item} className="flex gap-2"><Scale className="h-5 w-5 text-amber-700 flex-shrink-0" />{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-sm font-bold uppercase tracking-wider text-[var(--color-caixa-blue)] mb-3">Dúvidas frequentes</p>
              <h2 className="text-3xl font-bold text-gray-900">Crédito empresarial</h2>
            </div>
            <div className="space-y-3">
              {creditoEmpresarialFaqs.map((faq) => (
                <details key={faq.question} className="group rounded-xl border border-gray-200 bg-white p-5 open:shadow-sm">
                  <summary className="cursor-pointer list-none font-semibold text-gray-900 flex items-center justify-between gap-4">
                    {faq.question}
                    <span aria-hidden="true" className="text-[var(--color-caixa-blue)] text-xl group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="mt-4 text-gray-600 leading-relaxed">{faq.answer}</p>
                </details>
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
                "Análise de perfil sem compromisso",
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
              <Button asChild size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8">
                <Link href="/simular">
                  Simular Crédito Grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                <a href="https://wa.me/556135268355?text=Olá! Preciso de crédito para minha empresa." target="_blank" rel="noopener noreferrer">
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
