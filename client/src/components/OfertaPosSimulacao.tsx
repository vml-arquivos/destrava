import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { BookOpen, Star, Briefcase, CheckCircle2, ChevronRight, Lock, Download, AlertCircle } from "lucide-react";

type OfertaStep = "ebook" | "checkout_ebook" | "rating" | "assessoria" | "concluido";

interface OfertaPosSimulacaoProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDownloadGratuito: () => void;
  clienteNome: string;
  clienteEmail?: string;
  clienteTelefone?: string;
}

export function OfertaPosSimulacao({ 
  isOpen, 
  onOpenChange, 
  onDownloadGratuito,
  clienteNome,
  clienteEmail = "",
  clienteTelefone = ""
}: OfertaPosSimulacaoProps) {
  const [step, setStep] = useState<OfertaStep>("ebook");
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadLiberado, setDownloadLiberado] = useState(false);

  // Simulação de processamento
  const processarCompra = (proximoPasso: OfertaStep) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep(proximoPasso);
      if (proximoPasso === "rating") {
        setDownloadLiberado(true);
      }
    }, 1500);
  };

  const fecharEBaixarGratuito = () => {
    onDownloadGratuito();
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
        {/* Step 1: Oferta do E-book */}
        {step === "ebook" && (
          <>
            <div className="bg-[#0033A0] p-6 text-white text-center relative overflow-hidden">
              <div className="absolute -right-10 -top-10 text-white/10">
                <BookOpen className="w-40 h-40" />
              </div>
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-yellow-400 relative z-10" />
              <DialogTitle className="text-2xl font-bold mb-2 relative z-10">
                O Segredo da Aprovação Bancária
              </DialogTitle>
              <DialogDescription className="text-blue-100 text-base relative z-10">
                Sua simulação está pronta, mas você sabe como garantir a aprovação?
              </DialogDescription>
            </div>
            
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                Olá, <strong>{clienteNome || "Empresário"}</strong>! A maioria dos pedidos de crédito é negada por falta de documentação adequada ou desconhecimento dos critérios bancários.
              </p>
              
              <div className="bg-gray-50 rounded-xl p-4 mb-5 border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  No E-book Definitivo da Destrava você aprenderá:
                </h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0033A0] mt-1.5 flex-shrink-0" />
                    Checklist exato da documentação exigida pelos bancos
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0033A0] mt-1.5 flex-shrink-0" />
                    Como os analistas avaliam seu faturamento e balanço
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0033A0] mt-1.5 flex-shrink-0" />
                    O passo a passo do trâmite até o dinheiro na conta
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-yellow-50 p-4 rounded-xl border border-yellow-200 mb-6">
                <div>
                  <p className="text-xs text-yellow-800 uppercase font-bold tracking-wider mb-1">Oferta Especial</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-gray-900">R$ 9,90</span>
                    <span className="text-sm text-gray-500 line-through mb-1">R$ 49,90</span>
                  </div>
                </div>
                <Button 
                  onClick={() => setStep("checkout_ebook")}
                  className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-6 px-6 rounded-xl text-lg shadow-lg shadow-green-500/30"
                >
                  Quero o E-book Agora
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              </div>

              <div className="text-center">
                <button 
                  onClick={fecharEBaixarGratuito}
                  className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-4"
                >
                  Não, obrigado. Quero apenas baixar o PDF da simulação gratuita.
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 2: Checkout E-book (Placeholder) */}
        {step === "checkout_ebook" && (
          <>
            <div className="bg-gray-50 p-4 border-b text-center">
              <Lock className="w-6 h-6 mx-auto text-green-500 mb-2" />
              <DialogTitle className="text-lg font-bold text-gray-900">
                Checkout Seguro
              </DialogTitle>
            </div>
            
            <div className="p-6">
              <div className="bg-white border rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex justify-between items-center mb-4 pb-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-[#0033A0]" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">E-book: Checklist Definitivo</p>
                      <p className="text-xs text-gray-500">Entrega imediata em PDF</p>
                    </div>
                  </div>
                  <p className="font-bold text-lg">R$ 9,90</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase">Nome</label>
                    <p className="text-sm font-medium">{clienteNome || "Não informado"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
                      <p className="text-sm font-medium">{clienteEmail || "Não informado"}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase">Telefone</label>
                      <p className="text-sm font-medium">{clienteTelefone || "Não informado"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 text-blue-800 text-sm p-4 rounded-xl border border-blue-200 mb-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>
                  <strong>Ambiente de Demonstração:</strong> O módulo de pagamento real será ativado em breve. Clique no botão abaixo para simular a compra e avançar no fluxo.
                </p>
              </div>

              <Button 
                onClick={() => processarCompra("rating")}
                disabled={isProcessing}
                className="w-full bg-[#0033A0] hover:bg-[#002280] text-white py-6 rounded-xl text-lg font-bold"
              >
                {isProcessing ? "Processando Pagamento..." : "Simular Pagamento de R$ 9,90"}
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Oferta de Rating */}
        {step === "rating" && (
          <>
            <div className="bg-green-500 p-6 text-white text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-white" />
              <DialogTitle className="text-2xl font-bold mb-2">
                Pagamento Confirmado!
              </DialogTitle>
              <DialogDescription className="text-green-100 text-base">
                Seu e-book já está disponível para download.
              </DialogDescription>
            </div>
            
            <div className="p-6">
              <a 
                href="/assets/ebook_destrava.pdf" 
                download="Checklist_Destrava_Credito.pdf"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-4 rounded-xl mb-8 transition-colors border border-gray-300"
              >
                <Download className="w-5 h-5" />
                Baixar E-book Agora
              </a>

              <div className="border-t pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                    <Star className="w-5 h-5 text-yellow-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Próximo Nível: Consulta de Rating</h3>
                </div>
                
                <p className="text-gray-600 text-sm mb-4">
                  Você sabia que os bancos já possuem uma "nota" secreta para sua empresa antes mesmo de você pedir crédito? Descubra o seu <strong>Rating Bancário</strong> com nossa consulta especializada.
                </p>
                
                <ul className="space-y-2 text-sm text-gray-600 mb-6">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Saiba como o mercado vê sua empresa</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Descubra pendências ocultas</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> Receba orientações para melhorar sua nota</li>
                </ul>

                <div className="flex gap-3">
                  <Button 
                    variant="outline"
                    onClick={() => setStep("assessoria")}
                    className="flex-1"
                  >
                    Pular
                  </Button>
                  <Button 
                    onClick={() => processarCompra("assessoria")}
                    disabled={isProcessing}
                    className="flex-[2] bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-bold"
                  >
                    {isProcessing ? "Processando..." : "Quero meu Rating (R$ 49,90)"}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Step 4: Oferta de Assessoria */}
        {step === "assessoria" && (
          <>
            <div className="bg-gray-900 p-6 text-white text-center">
              <Briefcase className="w-12 h-12 mx-auto mb-3 text-blue-400" />
              <DialogTitle className="text-2xl font-bold mb-2">
                Acelere Seus Resultados
              </DialogTitle>
              <DialogDescription className="text-gray-400 text-base">
                Deixe a burocracia com quem entende do assunto.
              </DialogDescription>
            </div>
            
            <div className="p-6">
              <p className="text-gray-700 mb-5 text-center">
                Para quem não tem tempo a perder: nossa <strong>Assessoria Premium</strong> cuida de todo o processo de captação de crédito para sua empresa, do início ao fim.
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 p-3 rounded-xl text-center border border-blue-100">
                  <p className="text-xl font-bold text-[#0033A0]">100%</p>
                  <p className="text-xs text-gray-600">Foco no seu negócio</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl text-center border border-blue-100">
                  <p className="text-xl font-bold text-[#0033A0]">+30</p>
                  <p className="text-xs text-gray-600">Bancos parceiros</p>
                </div>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={() => setStep("concluido")}
                  className="w-full bg-[#0033A0] hover:bg-[#002280] text-white py-6 rounded-xl text-lg font-bold"
                >
                  Falar com Assessor Agora
                </Button>
                <Button 
                  variant="ghost"
                  onClick={() => setStep("concluido")}
                  className="w-full text-gray-500"
                >
                  Agora não, finalizar
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Step 5: Concluído */}
        {step === "concluido" && (
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Tudo Certo!</h2>
            <p className="text-gray-600 mb-6">
              Obrigado pela confiança. Seus materiais estão liberados e um de nossos especialistas entrará em contato em breve.
            </p>
            <div className="space-y-3">
              {downloadLiberado && (
                <a 
                  href="/assets/ebook_destrava.pdf" 
                  download="Checklist_Destrava_Credito.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-blue-50 hover:bg-blue-100 text-[#0033A0] font-semibold py-3 rounded-xl transition-colors border border-blue-200"
                >
                  <Download className="w-4 h-4" />
                  Baixar E-book Novamente
                </a>
              )}
              <Button 
                onClick={fecharEBaixarGratuito}
                className="w-full bg-[#0033A0] hover:bg-[#002280] text-white py-6 rounded-xl text-lg font-bold"
              >
                Baixar Simulação em PDF e Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
