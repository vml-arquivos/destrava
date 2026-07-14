import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

interface CarouselSlide {
  label: string;
  title: string;
  description: string;
  href: string;
  accent: string;
}

const slides: CarouselSlide[] = [
  {
    label: "PRONAMPE",
    title: "Crédito para micro e pequenas empresas",
    description: "Confira elegibilidade, documentos e condições vigentes do programa antes de solicitar.",
    href: "/pronampe",
    accent: "from-emerald-400/30 to-emerald-900/10",
  },
  {
    label: "Capital de Giro Caixa",
    title: "Recurso para o ciclo operacional",
    description: "Avalie limite, prazo, taxa e CET conforme a proposta e a análise da instituição.",
    href: "/giro-caixa-facil",
    accent: "from-sky-400/30 to-blue-900/10",
  },
  {
    label: "FCO",
    title: "Financiamento para o Centro-Oeste",
    description: "Entenda o enquadramento do projeto na programação vigente para GO, MT, MS e DF.",
    href: "/fco",
    accent: "from-amber-400/30 to-orange-900/10",
  },
  {
    label: "FGI PEAC",
    title: "Garantia para operações empresariais",
    description: "Saiba como o programa de garantia pode apoiar uma operação sujeita à análise bancária.",
    href: "/peac-fgi",
    accent: "from-violet-400/30 to-indigo-900/10",
  },
  {
    label: "FAMPE",
    title: "Garantia complementar para pequenos negócios",
    description: "Veja como funciona o fundo do Sebrae e confirme as regras com a instituição operadora.",
    href: "/fampe",
    accent: "from-yellow-300/30 to-amber-900/10",
  },
  {
    label: "ProCred 360",
    title: "Linha voltada a pequenos negócios",
    description: "Confira público elegível, limite vinculado ao faturamento e condições vigentes.",
    href: "/procred360",
    accent: "from-cyan-300/30 to-teal-900/10",
  },
];

const AUTOPLAY_INTERVAL = 4500;
const TRANSITION_DURATION = 700;

export default function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback(
    (index: number, dir: "next" | "prev" = "next") => {
      if (animating) return;
      setDirection(dir);
      setAnimating(true);
      setTimeout(() => {
        setCurrent(index);
        setAnimating(false);
      }, TRANSITION_DURATION);
    },
    [animating]
  );

  const next = useCallback(() => {
    goTo((current + 1) % slides.length, "next");
  }, [current, goTo]);

  const prev = useCallback(() => {
    goTo((current - 1 + slides.length) % slides.length, "prev");
  }, [current, goTo]);

  // Autoplay
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timerRef.current = setTimeout(next, AUTOPLAY_INTERVAL);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, paused, next]);

  const transitionClass = animating
    ? direction === "next"
      ? "opacity-0 translate-x-4 scale-[0.98]"
      : "opacity-0 -translate-x-4 scale-[0.98]"
    : "opacity-100 translate-x-0 scale-100";

  return (
    <div
      className="relative w-full select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      aria-label="Carrossel de linhas de crédito"
      role="region"
    >
      <div className={`relative aspect-square w-full max-w-xl mx-auto overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br ${slides[current].accent} shadow-2xl`}>
        <div
          key={current}
          className={`flex h-full flex-col justify-between p-8 sm:p-12 transition-all ease-in-out ${transitionClass}`}
          style={{ transitionDuration: `${TRANSITION_DURATION}ms` }}
          aria-live="polite"
        >
          <div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm">
              <ShieldCheck className="h-4 w-4 text-amber-300" aria-hidden="true" />
              Condições sujeitas à análise
            </div>
            <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-300">{slides[current].label}</p>
            <h2 className="max-w-md text-3xl font-black leading-tight text-white sm:text-4xl">{slides[current].title}</h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">{slides[current].description}</p>
          </div>
          <Link
            href={slides[current].href}
            data-cta-position="home-carousel"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-[#0033A0] transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Conhecer esta opção
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Botão anterior */}
        <button
          type="button"
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/30 hover:bg-black/55 text-white rounded-full p-1.5 transition-all duration-200 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Imagem anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Botão próximo */}
        <button
          type="button"
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/30 hover:bg-black/55 text-white rounded-full p-1.5 transition-all duration-200 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Próxima imagem"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Indicadores de ponto */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
          {slides.map((slide, i) => (
            <button
              type="button"
              key={i}
              onClick={() => goTo(i, i > current ? "next" : "prev")}
              aria-label={`Ver ${slide.label}`}
              className={`rounded-full transition-all duration-300 focus:outline-none ${
                i === current
                  ? "bg-white w-5 h-2"
                  : "bg-white/50 hover:bg-white/80 w-2 h-2"
              }`}
            />
          ))}
        </div>
      </div>

      <p className="text-center mt-3 text-sm font-semibold text-[var(--color-caixa-yellow)] tracking-wide uppercase opacity-90 transition-opacity duration-300">
        {current + 1} de {slides.length} — {slides[current].label}
      </p>
    </div>
  );
}
