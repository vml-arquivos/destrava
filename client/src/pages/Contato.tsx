import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageCircle,
  Send,
  CheckCircle2,
} from "lucide-react";
import { useState, FormEvent } from "react";
import { useLocation } from "wouter";

export default function Contato() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    assunto: "",
    mensagem: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/contato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, criadoEm: new Date().toISOString() }),
      });
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setLocation("/sucesso");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <SEO
        title="Contato - Fale com Nossa Equipe"
        description="Entre em contato com a Destrava Crédito. Atendimento por WhatsApp, e-mail ou formulário. Especialistas em crédito empresarial e pessoa física."
        keywords="contato destrava crédito, falar com especialista, atendimento crédito, WhatsApp crédito"
      />
      <Header />

      {/* HERO */}
      <section className="bg-gradient-to-br from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-white py-14">
        <div className="container px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Fale Conosco</h1>
            <p className="text-lg text-white/90">
              Nossa equipe de especialistas está pronta para ajudar você a encontrar a melhor solução de crédito.
            </p>
          </div>
        </div>
      </section>

      {/* CONTEÚDO */}
      <section className="py-14">
        <div className="container px-4">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
            {/* Informações de Contato */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-8">Informações de Contato</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 mb-1">WhatsApp</p>
                    <p className="text-gray-600 text-sm mb-2">Atendimento rápido e personalizado</p>
                    <a
                      href="https://wa.me/5561986055223"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 font-semibold hover:underline"
                    >
                      (61) 9 8605-5223
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 mb-1">Telefone</p>
                    <p className="text-gray-600 text-sm mb-2">Ligue para falar com um especialista</p>
                    <a href="tel:+5561986055223" className="text-blue-600 font-semibold hover:underline">
                      (61) 9 8605-5223
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 mb-1">E-mail</p>
                    <p className="text-gray-600 text-sm mb-2">Envie sua dúvida por e-mail</p>
                    <a href="mailto:contato@destravacredito.com.br" className="text-purple-600 font-semibold hover:underline">
                      contato@destravacredito.com.br
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 mb-1">Horário de Atendimento</p>
                    <p className="text-gray-600 text-sm">Segunda a Sexta: 8h às 18h</p>
                    <p className="text-gray-600 text-sm">Sábado: 8h às 12h</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 bg-gray-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 mb-1">Localização</p>
                    <p className="text-gray-600 text-sm">Brasília - DF</p>
                    <p className="text-gray-600 text-sm">Atendimento em todo o Brasil</p>
                  </div>
                </div>
              </div>

              {/* WhatsApp CTA */}
              <div className="mt-8 p-6 bg-green-50 rounded-2xl border border-green-200 text-center">
                <MessageCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
                <p className="font-bold text-gray-900 mb-2">Prefere o WhatsApp?</p>
                <p className="text-sm text-gray-600 mb-4">Resposta em minutos durante o horário comercial</p>
                <a
                  href="https://wa.me/5561986055223?text=Olá! Gostaria de falar com um especialista em crédito."
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold">
                    Iniciar Conversa no WhatsApp
                  </Button>
                </a>
              </div>
            </div>

            {/* Formulário */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-8">Envie uma Mensagem</h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <Label htmlFor="nome" className="font-semibold">Nome Completo *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => handleChange("nome", e.target.value)}
                    placeholder="Seu nome"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="font-semibold">E-mail *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="seu@email.com"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="telefone" className="font-semibold">Telefone / WhatsApp</Label>
                  <Input
                    id="telefone"
                    value={formData.telefone}
                    onChange={(e) => handleChange("telefone", e.target.value)}
                    placeholder="(61) 9 0000-0000"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="assunto" className="font-semibold">Assunto *</Label>
                  <Input
                    id="assunto"
                    value={formData.assunto}
                    onChange={(e) => handleChange("assunto", e.target.value)}
                    placeholder="Ex: Simulação de empréstimo, Certificado Digital..."
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="mensagem" className="font-semibold">Mensagem *</Label>
                  <Textarea
                    id="mensagem"
                    value={formData.mensagem}
                    onChange={(e) => handleChange("mensagem", e.target.value)}
                    placeholder="Descreva sua necessidade..."
                    className="mt-1 resize-none"
                    rows={5}
                    required
                  />
                </div>
                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                  <input type="checkbox" id="lgpd-contato" className="mt-1" required />
                  <label htmlFor="lgpd-contato" className="text-xs text-gray-600">
                    Concordo com a <a href="/politica-privacidade" className="text-[var(--color-caixa-blue)] underline">Política de Privacidade</a> e autorizo o uso dos meus dados para contato, conforme a LGPD.
                  </label>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--color-caixa-blue)] hover:bg-blue-700 text-white font-bold py-3 text-base"
                >
                  {loading ? "Enviando..." : "Enviar Mensagem"}
                  {!loading && <Send className="ml-2 h-5 w-5" />}
                </Button>
              </form>

              <div className="mt-6 p-4 bg-blue-50 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Sua mensagem será respondida em até <strong>24 horas úteis</strong>. Para atendimento imediato, use o WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
