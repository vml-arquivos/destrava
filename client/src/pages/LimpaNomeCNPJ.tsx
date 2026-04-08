import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Building2, TrendingDown, AlertTriangle, Phone, Zap } from "lucide-react";
import { toast } from "sonner";

export default function LimpaNomeCNPJ() {
  const [formData, setFormData] = useState({
    razaoSocial: "",
    cnpj: "",
    email: "",
    telefone: "",
    tipoDivida: "fornecedor",
    descricao: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.razaoSocial || !formData.cnpj || !formData.email || !formData.telefone) {
      toast.error("Por favor, preencha todos os campos obrigatórios");
      return;
    }
    toast.success("Perfeito! Nosso especialista em crédito empresarial entrará em contato em breve.");
    setFormData({ razaoSocial: "", cnpj: "", email: "", telefone: "", tipoDivida: "fornecedor", descricao: "" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />

      {/* HERO SECTION - Impacto Imediato para CNPJ */}
      <section className="bg-gradient-to-br from-[var(--color-caixa-blue)] via-[var(--color-caixa-blue-dark)] to-[#001a4d] text-white py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--color-caixa-yellow)] rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-[var(--color-caixa-yellow)] rounded-full blur-3xl"></div>
        </div>

        <div className="container relative z-10">
          <div className="max-w-2xl">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Sua Empresa Está<br />
              <span className="text-[var(--color-caixa-yellow)]">Negativada?</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 leading-relaxed">
              Recupere o crédito da sua empresa, negocie dívidas e volte a crescer. Especialistas prontos para ajudar seu negócio.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Button size="lg" className="bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold text-lg px-8">
                Falar com Especialista
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 font-bold text-lg px-8">
                <Phone className="w-5 h-5 mr-2" />
                WhatsApp (61) 3526-8355
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO DE DOR - Conectar com Problema Empresarial */}
      <section className="py-16 bg-red-50">
        <div className="container">
          <h2 className="text-4xl font-bold text-center mb-4 text-[var(--color-caixa-blue-dark)]">
            Sua Empresa Enfrenta Algum Desses Problemas?
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto text-lg">
            Muitos empresários enfrentam restrições de crédito. Você não está sozinho, mas precisa agir agora.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: AlertTriangle,
                titulo: "CNPJ Negativado",
                desc: "Seu CNPJ está nos órgãos de proteção e você não consegue acessar crédito para a empresa?",
              },
              {
                icon: TrendingDown,
                titulo: "Sem Capital de Giro",
                desc: "Precisa de capital de giro urgente mas os bancos bloquearam sua empresa por restrições?",
              },
              {
                icon: Building2,
                titulo: "Dívidas de Fornecedores",
                desc: "Dívidas com fornecedores acumulando e eles ameaçam parar de fornecer para sua empresa?",
              },
              {
                icon: Zap,
                titulo: "Perda de Oportunidades",
                desc: "Está perdendo contratos e negócios porque sua empresa não consegue acessar crédito ou linhas?",
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

      {/* SEÇÃO DE SOLUÇÃO - Esperança Empresarial */}
      <section className="py-16 bg-white">
        <div className="container">
          <h2 className="text-4xl font-bold text-center mb-4 text-[var(--color-caixa-blue-dark)]">
            Recupere o Crédito da Sua Empresa
          </h2>
            <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto text-lg">
              Análise, consulta, diagnóstico e plano de ação para limpeza de negativações e restauração do nome limpo
            </p>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              {[
                { titulo: "Análise Completa", desc: "Avaliamos sua situação financeira, dívidas, apontamentos e restrições de crédito" },
                { titulo: "Consulta e Diagnóstico", desc: "Realizamos consulta nos órgãos de proteção e identificamos todas as negativações" },
                { titulo: "Plano de Ação", desc: "Desenvolvemos estratégia específica para limpeza de negativações e restauração" },
                { titulo: "Independente do Valor", desc: "Trabalhamos com dívidas de qualquer valor, inclusive dívidas estelares" },
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
                <Building2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-[var(--color-caixa-blue-dark)] mb-2">Sua Empresa Merece Crescer</h3>
                <p className="text-gray-600">Recupere o crédito e volte a expandir seu negócio</p>
              </div>

              <div className="space-y-4 text-sm">
                <div className="bg-white p-4 rounded-lg">
                  <p className="font-bold text-[var(--color-caixa-blue-dark)] mb-1">✓ Análise Profunda</p>
                  <p className="text-gray-600">Avaliamos toda a situação creditícia da sua empresa</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <p className="font-bold text-[var(--color-caixa-blue-dark)] mb-1">✓ Nome Limpo</p>
                  <p className="text-gray-600">Sua empresa recupera o nome limpo e acesso a crédito</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <p className="font-bold text-[var(--color-caixa-blue-dark)] mb-1">✓ Acompanhamento Total</p>
                  <p className="text-gray-600">Suporte contínuo até a limpeza completa de negativações</p>
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
            Como Recuperamos o Crédito da Sua Empresa
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto text-lg">
            Processo consultivo e direto para resolver a situação da sua empresa
          </p>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                numero: "1",
                titulo: "Análise",
                desc: "Avaliamos a situação financeira e creditícia da sua empresa",
              },
              {
                numero: "2",
                titulo: "Consulta",
                desc: "Consultamos os órgãos de proteção para identificar todas as negativações",
              },
              {
                numero: "3",
                titulo: "Diagnóstico",
                desc: "Desenvolvemos diagnóstico completo e identificamos a solução real",
              },
              {
                numero: "4",
                titulo: "Plano de Ação",
                desc: "Executamos plano específico para limpeza de negativações e restauração",
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
          <h2 className="text-4xl font-bold text-center mb-2">Pronto para Recuperar o Crédito da Sua Empresa?</h2>
          <p className="text-center text-white/80 mb-8">
            Deixe seus dados e nosso especialista em crédito empresarial analisará sua situação e apresentará as melhores soluções
          </p>

          <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-sm p-8 rounded-xl border border-white/20 space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2">Razão Social da Empresa *</label>
              <Input
                type="text"
                placeholder="Nome da sua empresa"
                value={formData.razaoSocial}
                onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                className="bg-white text-black"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">CNPJ *</label>
              <Input
                type="text"
                placeholder="00.000.000/0000-00"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                className="bg-white text-black"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">E-mail da Empresa *</label>
              <Input
                type="email"
                placeholder="seu@empresa.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-white text-black"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">WhatsApp para Contato *</label>
              <Input
                type="tel"
                placeholder="(61) 3526-8355"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                className="bg-white text-black"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Tipo de Dívida Principal</label>
              <Select value={formData.tipoDivida} onValueChange={(value) => setFormData({ ...formData, tipoDivida: value })}>
                <SelectTrigger className="bg-white text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fornecedor">Dívida com Fornecedor</SelectItem>
                  <SelectItem value="banco">Dívida com Banco</SelectItem>
                  <SelectItem value="governo">Dívida com Governo (Impostos/Taxas)</SelectItem>
                  <SelectItem value="multiplas">Múltiplas Dívidas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Descreva brevemente a situação da sua empresa (opcional)</label>
              <textarea
                placeholder="Conte sobre suas dívidas, restrições e o que sua empresa precisa"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                className="w-full p-3 rounded-lg text-black text-sm"
                rows={3}
              />
            </div>

            <Button type="submit" size="lg" className="w-full bg-[var(--color-caixa-yellow)] hover:bg-yellow-500 text-black font-bold text-lg">
              Falar com Especialista em Crédito Empresarial
            </Button>

            <p className="text-xs text-white/70 text-center">
              Seus dados são 100% confidenciais. Você receberá contato em breve para análise personalizada.
            </p>
          </form>
        </div>
      </section>

      {/* SEÇÃO DE DIFERENCIAL */}
      <section className="py-16 bg-white">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12 text-[var(--color-caixa-blue-dark)]">
            Por Que Escolher a Destrava Crédito para Sua Empresa?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { titulo: "Especialistas em Crédito Empresarial", desc: "Equipe com experiência em negociação de dívidas e recuperação de crédito para empresas" },
              { titulo: "Parceria com CAIXA", desc: "Acesso direto a produtos de crédito empresarial da CAIXA para sua empresa" },
              { titulo: "Soluções Efetivas", desc: "Resultados reais: negociação bem-sucedida, remoção de apontamentos e acesso a crédito" },
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
            Serviço prestado pela Destrava Crédito como correspondente/assessoria da CAIXA Econômica Federal. Cada situação é única e será analisada individualmente.
            Resultados podem variar conforme a complexidade de cada caso e as condições de negociação com credores.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
