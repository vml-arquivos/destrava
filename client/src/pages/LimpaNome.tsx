import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, CreditCard, TrendingUp, AlertCircle, Phone, Zap } from "lucide-react";
import { toast } from "sonner";

export default function LimpaNome() {
  const [formData, setFormData] = useState({
    nome: "",
    cpfCnpj: "",
    email: "",
    telefone: "",
    tipo: "cpf",
    duvidasRestricoes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.cpfCnpj || !formData.email || !formData.telefone) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }
    toast.success("Perfeito! Entraremos em contato em breve para conversar sobre sua situação.");
    setFormData({ nome: "", cpfCnpj: "", email: "", telefone: "", tipo: "cpf", duvidasRestricoes: "" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />

      {/* HERO SECTION - Impacto Imediato */}
      <section className="bg-gradient-to-br from-[var(--color-caixa-blue)] via-[var(--color-caixa-blue-dark)] to-[#001a4d] text-white py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--color-caixa-yellow)] rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[var(--color-caixa-yellow)] rounded-full blur-3xl"></div>
        </div>

        <div className="container relative z-10">
          <div className="max-w-2xl">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Recupere seu Acesso<br />
              <span className="text-[var(--color-caixa-yellow)]">ao Crédito Agora</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 leading-relaxed">
              Está cansado de ter seu nome negativado? Deseja ter acesso a crédito novamente? Nós temos a solução que você procura.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Button size="lg" className="bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold text-lg px-8">
                Conversar com Especialista
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 font-bold text-lg px-8">
                <Phone className="w-5 h-5 mr-2" />
                Falar no WhatsApp
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO DE DOR - Conectar com Problema */}
      <section className="py-16 bg-red-50">
        <div className="container">
          <h2 className="text-4xl font-bold text-center mb-4 text-[var(--color-caixa-blue-dark)]">
            Você se identifica com alguma dessas situações?
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto text-lg">
            Você não está sozinho. Milhares de pessoas enfrentam os mesmos desafios.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: AlertCircle,
                titulo: "Nome Negativado",
                desc: "Seu nome está nos órgãos de proteção e você não consegue nem um cartão de crédito?",
              },
              {
                icon: CreditCard,
                titulo: "Sem Acesso a Crédito",
                desc: "Bancos negam empréstimos, financiamentos e cartões de crédito por causa de restrições?",
              },
              {
                icon: TrendingUp,
                titulo: "Score Destruído",
                desc: "Seu score de crédito caiu tanto que parece impossível recuperar?",
              },
              {
                icon: Zap,
                titulo: "Dívidas Acumuladas",
                desc: "As dívidas viraram uma bola de neve e você não sabe por onde começar?",
              },
            ].map((item, idx) => (
              <div key={idx} className="bg-white p-6 rounded-lg border-l-4 border-red-500 shadow-sm hover:shadow-md transition">
                <item.icon className="w-10 h-10 text-red-500 mb-4" />
                <h3 className="text-xl font-bold mb-2 text-[var(--color-caixa-blue-dark)]">{item.titulo}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEÇÃO DE SOLUÇÃO - Esperança */}
      <section className="py-16 bg-white">
        <div className="container">
          <h2 className="text-4xl font-bold text-center mb-4 text-[var(--color-caixa-blue-dark)]">
            Existe Solução para Sua Situação
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto text-lg">
            Especialistas prontos para ajudar você a recuperar seu crédito e sua vida financeira
          </p>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              {[
                { titulo: "Remoção de Apontamentos", desc: "Eliminamos os apontamentos que estão impedindo seu acesso a crédito" },
                { titulo: "Restauração de Score", desc: "Seu score é restaurado, abrindo portas para empréstimos e financiamentos" },
                { titulo: "Recuperação de Acesso", desc: "Você volta a ter acesso a cartões de crédito, empréstimos e financiamentos" },
                { titulo: "Solução Completa", desc: "Atendimento personalizado para sua situação específica" },
              ].map((item, idx) => (
                <div key={idx} className="flex gap-4">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-lg text-[var(--color-caixa-blue-dark)]">{item.titulo}</h3>
                    <p className="text-gray-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-8 rounded-xl border-2 border-green-200">
              <div className="text-center mb-8">
                <CreditCard className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-[var(--color-caixa-blue-dark)] mb-2">Recupere Seu Crédito</h3>
                <p className="text-gray-600">Processo simples e direto para sua situação</p>
              </div>

              <div className="space-y-4 text-sm">
                <div className="bg-white p-4 rounded-lg">
                  <p className="font-bold text-[var(--color-caixa-blue-dark)] mb-1">✓ Remoção de Apontamentos</p>
                  <p className="text-gray-600">Eliminamos as restrições que impedem seu crédito</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <p className="font-bold text-[var(--color-caixa-blue-dark)] mb-1">✓ Restauração de Score</p>
                  <p className="text-gray-600">Seu histórico é restaurado para melhor oportunidade</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <p className="font-bold text-[var(--color-caixa-blue-dark)] mb-1">✓ Atendimento Especializado</p>
                  <p className="text-gray-600">Equipe pronta para orientar cada passo</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO DE PROCESSO - Simplicidade */}
      <section className="py-16 bg-gray-50">
        <div className="container">
          <h2 className="text-4xl font-bold text-center mb-4 text-[var(--color-caixa-blue-dark)]">
            Como Começar? Muito Simples!
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto text-lg">
            Três passos para recuperar seu acesso ao crédito
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                numero: "1",
                titulo: "Conversa Inicial",
                desc: "Você conta sua situação e nós analisamos o melhor caminho para resolver",
              },
              {
                numero: "2",
                titulo: "Análise Personalizada",
                desc: "Avaliamos sua situação específica e apresentamos as melhores soluções",
              },
              {
                numero: "3",
                titulo: "Recuperação",
                desc: "Você recupera seu acesso ao crédito e volta a ter oportunidades financeiras",
              },
            ].map((item, idx) => (
              <div key={idx} className="relative">
                <div className="bg-white p-8 rounded-xl shadow-md h-full">
                  <div className="w-12 h-12 bg-[var(--color-caixa-yellow)] rounded-full flex items-center justify-center text-[var(--color-caixa-blue-dark)] font-bold text-xl mb-4">
                    {item.numero}
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-[var(--color-caixa-blue-dark)]">{item.titulo}</h3>
                  <p className="text-gray-600">{item.desc}</p>
                </div>
                {idx < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-1 bg-[var(--color-caixa-yellow)]"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FORMULÁRIO DE CAPTURA - CTA Principal */}
      <section className="py-16 bg-[var(--color-caixa-blue)] text-white">
        <div className="container max-w-2xl">
          <h2 className="text-4xl font-bold text-center mb-2">Pronto para Recuperar Seu Crédito?</h2>
          <p className="text-center text-white/80 mb-8">
            Deixe seus dados e nossos especialistas entrarão em contato para conversar sobre sua situação
          </p>

          <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-sm p-8 rounded-xl border border-white/20 space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2">Nome Completo *</label>
              <Input
                type="text"
                placeholder="Seu nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="bg-white text-black"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2">Tipo *</label>
                <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger className="bg-white text-black">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF (Pessoa Física)</SelectItem>
                    <SelectItem value="cnpj">CNPJ (Empresa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">{formData.tipo === "cpf" ? "CPF" : "CNPJ"} *</label>
                <Input
                  type="text"
                  placeholder={formData.tipo === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                  value={formData.cpfCnpj}
                  onChange={(e) => setFormData({ ...formData, cpfCnpj: e.target.value })}
                  className="bg-white text-black"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">E-mail *</label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-white text-black"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">WhatsApp *</label>
              <Input
                type="tel"
                placeholder="(61) 3526-8355"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                className="bg-white text-black"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Conte-nos um pouco sobre sua situação (opcional)</label>
              <textarea
                placeholder="Descreva brevemente o que está enfrentando"
                value={formData.duvidasRestricoes}
                onChange={(e) => setFormData({ ...formData, duvidasRestricoes: e.target.value })}
                className="w-full p-3 rounded-lg text-black text-sm"
                rows={3}
              />
            </div>

            <Button type="submit" size="lg" className="w-full bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold text-lg">
              Conversar com Especialista
            </Button>

            <p className="text-xs text-white/70 text-center">
              Seus dados são 100% confidenciais. Você receberá contato em breve.
            </p>
          </form>
        </div>
      </section>

      {/* SEÇÃO DE DIFERENCIAL */}
      <section className="py-16 bg-white">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12 text-[var(--color-caixa-blue-dark)]">
            Por Que Escolher a Destrava Crédito?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { titulo: "Especialistas", desc: "Equipe com experiência em recuperação de crédito" },
              { titulo: "Atendimento Personalizado", desc: "Cada caso é único e merece atenção especial" },
              { titulo: "Soluções Efetivas", desc: "Resultados reais para quem quer recuperar seu crédito" },
            ].map((item, idx) => (
              <div key={idx} className="text-center">
                <div className="text-4xl font-bold text-[var(--color-caixa-yellow)] mb-2">✓</div>
                <h3 className="text-xl font-bold mb-2 text-[var(--color-caixa-blue-dark)]">{item.titulo}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="bg-gray-100 py-8 text-center text-xs text-gray-600">
        <div className="container">
          <p>
            Serviço prestado pela Destrava Crédito como correspondente/assessoria. Cada situação é única e será analisada individualmente.
            Resultados podem variar conforme a complexidade de cada caso.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
