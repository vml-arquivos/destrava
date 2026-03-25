import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, FileText, Clock, Shield } from "lucide-react";
import { useState, FormEvent } from "react";
import { useLocation } from "wouter";

export default function Simulacao() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    nome: "",
    cnpj: "",
    whatsapp: "",
    email: "",
    cidade: "",
    estado: "",
    faturamento: "",
    valorDesejado: "",
    finalidade: "",
    observacoes: "",
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Em produção, aqui seria enviado para uma API
    console.log("Formulário de simulação enviado:", formData);
    setLocation("/sucesso");
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-16">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Simulação de Crédito
            </h1>
            <p className="text-xl text-white/90">
              Preencha o formulário abaixo e nossa equipe entrará em contato
              para orientar todo o processo de solicitação do Giro CAIXA Fácil.
            </p>
          </div>
        </div>
      </section>

      {/* Benefícios da Simulação */}
      <section className="py-12 bg-muted/30">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
                <CheckCircle2 className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold mb-1">100% Gratuito</h3>
              <p className="text-sm text-muted-foreground">
                Sem custos para simular
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
                <Clock className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold mb-1">Resposta Rápida</h3>
              <p className="text-sm text-muted-foreground">
                Retorno em até 24h
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
                <Shield className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold mb-1">Dados Protegidos</h3>
              <p className="text-sm text-muted-foreground">
                Segurança e privacidade
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-bold mb-1">Sem Compromisso</h3>
              <p className="text-sm text-muted-foreground">
                Você decide se segue
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Formulário */}
      <section className="py-20">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={handleSubmit}
              className="bg-card p-8 md:p-12 rounded-lg border-2 border-border shadow-lg space-y-6"
            >
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-2">Dados Pessoais</h2>
                <p className="text-muted-foreground">
                  Informações do responsável pela empresa
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  type="text"
                  required
                  value={formData.nome}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp *</Label>
                  <Input
                    id="whatsapp"
                    type="tel"
                    required
                    value={formData.whatsapp}
                    onChange={(e) => handleChange("whatsapp", e.target.value)}
                    placeholder="(11) 9 9999-9999"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div className="border-t border-border pt-8 mt-8">
                <h2 className="text-2xl font-bold mb-2">Dados da Empresa</h2>
                <p className="text-muted-foreground mb-6">
                  Informações sobre o seu negócio
                </p>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ / MEI *</Label>
                    <Input
                      id="cnpj"
                      type="text"
                      required
                      value={formData.cnpj}
                      onChange={(e) => handleChange("cnpj", e.target.value)}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cidade">Cidade *</Label>
                      <Input
                        id="cidade"
                        type="text"
                        required
                        value={formData.cidade}
                        onChange={(e) => handleChange("cidade", e.target.value)}
                        placeholder="Sua cidade"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="estado">Estado *</Label>
                      <Input
                        id="estado"
                        type="text"
                        required
                        value={formData.estado}
                        onChange={(e) => handleChange("estado", e.target.value)}
                        placeholder="SP"
                        maxLength={2}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="faturamento">
                      Faturamento Mensal Aproximado *
                    </Label>
                    <Select
                      value={formData.faturamento}
                      onValueChange={(value) =>
                        handleChange("faturamento", value)
                      }
                      required
                    >
                      <SelectTrigger id="faturamento">
                        <SelectValue placeholder="Selecione uma faixa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ate-5k">Até R$ 5.000</SelectItem>
                        <SelectItem value="5k-10k">
                          R$ 5.000 - R$ 10.000
                        </SelectItem>
                        <SelectItem value="10k-20k">
                          R$ 10.000 - R$ 20.000
                        </SelectItem>
                        <SelectItem value="20k-50k">
                          R$ 20.000 - R$ 50.000
                        </SelectItem>
                        <SelectItem value="50k-100k">
                          R$ 50.000 - R$ 100.000
                        </SelectItem>
                        <SelectItem value="acima-100k">
                          Acima de R$ 100.000
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-8 mt-8">
                <h2 className="text-2xl font-bold mb-2">Sobre o Crédito</h2>
                <p className="text-muted-foreground mb-6">
                  Detalhes sobre o crédito que você precisa
                </p>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="valorDesejado">
                      Valor Desejado (aproximado) *
                    </Label>
                    <Select
                      value={formData.valorDesejado}
                      onValueChange={(value) =>
                        handleChange("valorDesejado", value)
                      }
                      required
                    >
                      <SelectTrigger id="valorDesejado">
                        <SelectValue placeholder="Selecione o valor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ate-10k">Até R$ 10.000</SelectItem>
                        <SelectItem value="10k-20k">
                          R$ 10.000 - R$ 20.000
                        </SelectItem>
                        <SelectItem value="20k-30k">
                          R$ 20.000 - R$ 30.000
                        </SelectItem>
                        <SelectItem value="30k-50k">
                          R$ 30.000 - R$ 50.000
                        </SelectItem>
                        <SelectItem value="50k-70k">
                          R$ 50.000 - R$ 70.000
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="finalidade">Finalidade do Crédito *</Label>
                    <Select
                      value={formData.finalidade}
                      onValueChange={(value) =>
                        handleChange("finalidade", value)
                      }
                      required
                    >
                      <SelectTrigger id="finalidade">
                        <SelectValue placeholder="Para que você precisa do crédito?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="capital-giro">
                          Capital de giro
                        </SelectItem>
                        <SelectItem value="estoque">Compra de estoque</SelectItem>
                        <SelectItem value="fornecedores">
                          Pagamento de fornecedores
                        </SelectItem>
                        <SelectItem value="folha">
                          Folha de pagamento
                        </SelectItem>
                        <SelectItem value="investimento">
                          Pequenos investimentos
                        </SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="observacoes">
                      Observações (opcional)
                    </Label>
                    <Textarea
                      id="observacoes"
                      value={formData.observacoes}
                      onChange={(e) =>
                        handleChange("observacoes", e.target.value)
                      }
                      placeholder="Conte-nos mais sobre sua necessidade ou dúvidas..."
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full font-semibold text-lg"
                >
                  Enviar Simulação
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Ao enviar, você concorda com nossa{" "}
                <a
                  href="/politica-privacidade"
                  className="underline hover:text-primary"
                >
                  Política de Privacidade
                </a>{" "}
                e{" "}
                <a
                  href="/termos-uso"
                  className="underline hover:text-primary"
                >
                  Termos de Uso
                </a>
                . Seus dados serão utilizados apenas para análise de crédito e
                contato da nossa equipe.
              </p>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
