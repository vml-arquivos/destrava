import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { X, TrendingUp } from "lucide-react";

interface ExitIntentPopupProps {
  onClose?: () => void;
}

export default function ExitIntentPopup({ onClose }: ExitIntentPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenShown, setHasBeenShown] = useState(false);

  useEffect(() => {
    // Não mostrar o pop-up se já foi mostrado nesta sessão
    if (hasBeenShown) return;

    const handleMouseLeave = (e: MouseEvent) => {
      // Detectar se o mouse está saindo pela parte superior da página
      if (e.clientY <= 0 && !isVisible) {
        setIsVisible(true);
        setHasBeenShown(true);
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isVisible, hasBeenShown]);

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) onClose();
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Overlay escuro */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Pop-up Modal */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-300 scale-100 opacity-100 transition-all">
        <style>{`
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }
          .exit-popup {
            animation: slideDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
        `}</style>
        <div className="exit-popup">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-2 border-[var(--color-caixa-yellow)] hover:shadow-3xl transition-shadow duration-300">
          {/* Header com gradiente */}
          <div className="bg-gradient-to-r from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="bg-[var(--color-caixa-yellow)] p-2 rounded-lg">
                <TrendingUp className="h-6 w-6 text-[var(--color-caixa-blue)]" />
              </div>
              <h2 className="text-xl font-bold text-white">
                Espera aí! 👋
              </h2>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="p-6">
            <p className="text-gray-700 mb-4 font-medium">
              Antes de ir, descubra em <span className="font-bold text-[var(--color-caixa-blue)]">2 minutos</span> qual é o seu score de crédito!
            </p>

            <div className="bg-blue-50 border-l-4 border-[var(--color-caixa-yellow)] p-4 rounded mb-6">
              <p className="text-sm text-gray-600">
                ✓ Análise gratuita e sem compromisso<br />
                ✓ Dicas personalizadas para melhorar seu score<br />
                ✓ Descubra qual crédito é ideal para você
              </p>
            </div>

            {/* Botões */}
            <div className="flex gap-3">
              <Link href="/calculadora-score" className="flex-1">
                <Button
                  size="lg"
                  className="w-full bg-[var(--color-caixa-yellow)] text-[var(--color-caixa-blue)] hover:bg-[var(--color-caixa-yellow)]/90 font-bold"
                >
                  Calcular Meu Score
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                onClick={handleClose}
                className="border-gray-300"
              >
                Agora não
              </Button>
            </div>

            {/* Link para fechar */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-all duration-200 hover:scale-110"
              aria-label="Fechar"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Footer com garantia */}
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-center text-xs text-gray-600">
            Sem spam. Sem compromisso. Apenas uma análise rápida e útil.
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
