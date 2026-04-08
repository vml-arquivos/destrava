import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle2, Home, MessageCircle, FileText, ArrowLeft } from "lucide-react";

export default function Sucesso() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Barra de retorno */}
      <div className="bg-muted/40 border-b border-border">
        <div className="container py-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-2 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar para o Início
            </Button>
          </Link>
        </div>
      </div>

      <section className="flex-1 py-20">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center">
            {/* Ícone de Sucesso */}
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 mb-8">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>

            {/* Mensagem Principal */}
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Simulação Enviada com Sucesso!
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Recebemos sua solicitação de simulação do Giro CAIXA Fácil. Nossa
              equipe analisará suas informações e entrará em contato em até{" "}
              <strong className="text-foreground">24 horas úteis</strong>.
            </p>

            {/* Próximos Passos */}
            <div className="bg-card border-2 border-border rounded-lg p-8 mb-8 text-left">
              <h2 className="text-2xl font-bold mb-6 text-center">
                Próximos Passos
              </h2>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Análise Preliminar</h3>
                    <p className="text-sm text-muted-foreground">
                      Nossa equipe analisará suas informações e verificará a
                      viabilidade da solicitação.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Contato da Equipe</h3>
                    <p className="text-sm text-muted-foreground">
                      Entraremos em contato via WhatsApp ou e-mail para
                      esclarecer dúvidas e orientar sobre documentação.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                    3
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Documentação</h3>
                    <p className="text-sm text-muted-foreground">
                      Você enviará os documentos necessários com nossa
                      orientação para garantir que tudo esteja correto.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                    4
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Análise da CAIXA</h3>
                    <p className="text-sm text-muted-foreground">
                      Enviaremos sua solicitação para análise da CAIXA
                      Econômica Federal, que tomará a decisão final.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Informações Importantes */}
            <div className="bg-[var(--color-caixa-yellow)]/10 border-l-4 border-[var(--color-caixa-yellow)] p-6 rounded mb-8 text-left">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <FileText className="h-5 w-5 text-[var(--color-caixa-yellow)]" />
                Informações Importantes
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>
                  • Verifique sua caixa de entrada e spam para não perder nosso
                  contato
                </li>
                <li>
                  • Mantenha seus documentos organizados para agilizar o processo
                </li>
                <li>
                  • A aprovação final é sempre da CAIXA Econômica Federal
                </li>
                <li>
                  • Não cobramos nenhuma taxa antecipada para análise ou
                  assessoria
                </li>
              </ul>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  <Home className="mr-2 h-5 w-5" />
                  Voltar para o Início
                </Button>
              </Link>

              <a
                href="https://wa.me/556135268355"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="lg" className="w-full sm:w-auto font-semibold">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Falar no WhatsApp
                </Button>
              </a>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-muted-foreground mt-12 pt-8 border-t border-border">
              *Sujeito à análise e aprovação da CAIXA Econômica Federal.
              Condições variam conforme perfil. Destrava Crédito atua como
              Correspondente / Assessoria.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
