import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { TrendingUp, ArrowRight } from "lucide-react";

export default function ScoreBanner() {
  return (
    <div className="my-12 p-8 rounded-2xl bg-gradient-to-r from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] text-white shadow-xl border-2 border-[var(--color-caixa-yellow)] relative overflow-hidden group">
      {/* Background Pattern */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-white/10 transition-colors duration-500" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-[var(--color-caixa-yellow)]/5 rounded-full -ml-24 -mb-24 blur-2xl" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-caixa-yellow)] text-[var(--color-caixa-blue)] text-xs font-bold uppercase tracking-wider mb-4">
            <TrendingUp className="h-3 w-3" />
            Ferramenta Gratuita
          </div>
          <h3 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">
            Descubra seu Score de Crédito em 2 minutos!
          </h3>
          <p className="text-white/80 text-lg mb-0">
            Nossa calculadora interativa estima seu score e dá dicas personalizadas para você conseguir o crédito que sua empresa precisa.
          </p>
        </div>
        
        <div className="flex-shrink-0">
          <Link href="/calculadora-score">
            <Button 
              size="lg" 
              className="bg-[var(--color-caixa-yellow)] text-[var(--color-caixa-blue)] hover:bg-[var(--color-caixa-yellow)]/90 font-bold text-lg px-8 py-6 h-auto shadow-lg hover:scale-105 transition-all"
            >
              Calcular Meu Score
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
