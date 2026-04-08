import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO, { serviceStructuredData } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Shield,
  TrendingUp,
  FileText,
  Clock,
  Star,
  AlertCircle,
  Building2,
} from "lucide-react";

export default function RatingBancoBrasil() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Rating Banco do Brasil - Consulta e Análise de Crédito Empresarial"
        description="Consulte e melhore o rating da sua empresa no Banco do Brasil. Entenda como o rating impacta no acesso a crédito e linhas de financiamento. Assessoria especializada."
        keywords="rating banco do brasil, rating empresarial, análise de crédito, score empresarial, classificação de risco, crédito empresarial"
        structuredData={serviceStructuredData("Rating Banco do Brasil", "Consulta e análise do rating empresarial no Banco do Brasil para acesso a melhores condições de crédito.")}
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[#003F7F] via-[#002D5C] to-[#001a4d] text-white py-14 md:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-400 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-400 rounded-full blur-3xl" />
        </div>
        <div className="container px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-yellow-400/20 border border-yellow-400/40 rounded-full px-4 py-2 mb-6">
              <BarChart3 className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-300 text-sm font-semibold">Banco do Brasil</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Rating Empresarial<br />
              <span className="text-yellow-400">Banco do Brasil</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              Entenda como o rating da sua empresa é calculado, o que ele significa para o acesso ao crédito e como melhorá-lo para obter melhores condições de financiamento.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/simular">
                <Button size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8">
                  Consultar Meu Rating
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Olá! Quero consultar o rating da minha empresa no Banco do Brasil." target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 font-bold px-8">
                  Falar com Especialista
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* O QUE É RATING */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">O que é o Rating Empresarial?</h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  O <strong>rating</strong> é uma classificação de risco de crédito que o Banco do Brasil atribui à sua empresa com base em diversos fatores financeiros, comportamentais e cadastrais. Ele determina diretamente:
                </p>
                <ul className="space-y-3">
                  {[
                    "Limite de crédito disponível para sua empresa",
                    "Taxas de juros aplicadas nos empréstimos",
                    "Prazo máximo para pagamento",
                    "Acesso a linhas especiais de financiamento",
                    "Velocidade de aprovação de crédito",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gray-50 rounded-2xl p-8">
                <h3 className="font-bold text-gray-900 mb-6 text-center">Escala de Rating BB</h3>
                <div className="space-y-3">
                  {[
                    { nivel: "AA", cor: "bg-green-500", desc: "Excelente - Melhores condições", stars: 5 },
                    { nivel: "A", cor: "bg-green-400", desc: "Muito Bom - Condições favoráveis", stars: 4 },
                    { nivel: "B", cor: "bg-yellow-400", desc: "Bom - Condições padrão", stars: 3 },
                    { nivel: "C", cor: "bg-orange-400", desc: "Regular - Condições limitadas", stars: 2 },
                    { nivel: "D", cor: "bg-red-400", desc: "Atenção - Crédito restrito", stars: 1 },
                    { nivel: "E/F", cor: "bg-red-600", desc: "Crítico - Sem acesso a crédito", stars: 0 },
                  ].map((r) => (
                    <div key={r.nivel} className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${r.cor} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                        {r.nivel}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{r.desc}</p>
                      </div>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < r.stars ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FATORES QUE INFLUENCIAM */}
      <section className="py-14 bg-gray-50">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Fatores que Influenciam seu Rating</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                O Banco do Brasil avalia múltiplos critérios para definir o rating da sua empresa. Entender cada um é o primeiro passo para melhorá-lo.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: BarChart3,
                  title: "Situação Financeira",
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                  items: ["Faturamento anual", "Lucratividade", "Endividamento", "Fluxo de caixa", "Patrimônio líquido"],
                },
                {
                  icon: FileText,
                  title: "Histórico de Crédito",
                  color: "text-green-600",
                  bg: "bg-green-50",
                  items: ["Pontualidade nos pagamentos", "Histórico de inadimplência", "Relacionamento com bancos", "Tempo de conta ativa", "Uso de limite"],
                },
                {
                  icon: Building2,
                  title: "Dados Cadastrais",
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                  items: ["Tempo de existência da empresa", "Setor de atuação", "Porte da empresa", "Regularidade fiscal", "Situação na Receita Federal"],
                },
              ].map((f) => (
                <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                    <f.icon className={`h-6 w-6 ${f.color}`} />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-4">{f.title}</h3>
                  <ul className="space-y-2">
                    {f.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COMO MELHORAR */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Como Melhorar seu Rating</h2>
              <p className="text-gray-600">Estratégias práticas para elevar a classificação da sua empresa</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                { num: "01", title: "Mantenha cadastro atualizado", desc: "Atualize regularmente os dados da empresa no banco: endereço, contatos, sócios, faturamento e documentos." },
                { num: "02", title: "Pague em dia", desc: "Honre todos os compromissos financeiros no prazo. O histórico de pagamentos é um dos fatores mais importantes." },
                { num: "03", title: "Limpe restrições", desc: "Regularize qualquer pendência no CPF/CNPJ, SPC, Serasa e Receita Federal antes de solicitar crédito." },
                { num: "04", title: "Movimente a conta", desc: "Mantenha movimentação regular na conta empresarial. Bancos valorizam o relacionamento ativo." },
                { num: "05", title: "Organize o financeiro", desc: "Mantenha balanços atualizados, separe finanças pessoais das empresariais e demonstre saúde financeira." },
                { num: "06", title: "Consulte um especialista", desc: "A Destrava Crédito analisa seu perfil e orienta as melhores estratégias para melhorar seu rating." },
              ].map((item) => (
                <div key={item.num} className="flex gap-4 p-5 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-caixa-blue)] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {item.num}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-gray-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ALERTA */}
      <section className="py-8 bg-amber-50 border-y border-amber-200">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800 mb-1">Importante</p>
              <p className="text-sm text-amber-700">
                O rating é calculado automaticamente pelo Banco do Brasil com base nos dados disponíveis. A Destrava Crédito atua como assessoria, orientando sua empresa sobre como melhorar o perfil de crédito e facilitando o acesso às linhas de financiamento disponíveis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* NOSSOS SERVIÇOS */}
      <section className="py-14 bg-white">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Como a Destrava Crédito Pode Ajudar</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Shield,
                  title: "Análise de Perfil",
                  desc: "Avaliamos a situação atual da sua empresa e identificamos os pontos que impactam negativamente o rating.",
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },
                {
                  icon: TrendingUp,
                  title: "Plano de Melhoria",
                  desc: "Desenvolvemos um plano personalizado com ações concretas para elevar o rating e ampliar o acesso a crédito.",
                  color: "text-green-600",
                  bg: "bg-green-50",
                },
                {
                  icon: Clock,
                  title: "Acompanhamento",
                  desc: "Monitoramos a evolução do rating e ajustamos a estratégia conforme necessário até atingir o objetivo.",
                  color: "text-purple-600",
                  bg: "bg-purple-50",
                },
              ].map((s) => (
                <div key={s.title} className="text-center p-6 bg-gray-50 rounded-2xl">
                  <div className={`w-14 h-14 rounded-2xl ${s.bg} flex items-center justify-center mx-auto mb-4`}>
                    <s.icon className={`h-7 w-7 ${s.color}`} />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-3">{s.title}</h3>
                  <p className="text-sm text-gray-600">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-14 bg-gradient-to-br from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Consulte o Rating da Sua Empresa</h2>
            <p className="text-white/90 mb-8 text-lg">
              Nossa equipe analisa seu perfil, identifica oportunidades de melhoria e orienta o caminho para melhores condições de crédito.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/simular">
                <Button size="lg" className="bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8">
                  Solicitar Análise Gratuita
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/556135268355?text=Olá! Quero saber mais sobre rating empresarial no Banco do Brasil." target="_blank" rel="noopener noreferrer">
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
