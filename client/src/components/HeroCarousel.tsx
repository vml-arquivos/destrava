import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CarouselSlide {
  src: string;
  alt: string;
  label: string;
}

const slides: CarouselSlide[] = [
  {
    src: "/carousel-pronampe.webp",
    alt: "PRONAMPE — Programa Nacional de Apoio às Microempresas e Empresas de Pequeno Porte",
    label: "PRONAMPE",
  },
  {
    src: "/carousel-caixa.jpg",
    alt: "Capital de Giro Caixa — Até R$ 70.000 para sua empresa",
    label: "Capital de Giro Caixa",
  },
  {
    src: "/carousel-fco.jpg",
    alt: "FCO — Fundo Constitucional de Financiamento do Centro-Oeste",
    label: "FCO",
  },
  {
    src: "/carousel-fgi.jpg",
    alt: "FGI PEAC — Fundo Garantidor para Investimentos",
    label: "FGI PEAC",
  },
  {
    src: "/carousel-fampe.jpg",
    alt: "FAMPE — Fundo de Aval às Micro e Pequenas Empresas",
    label: "FAMPE",
  },
  {
    src: "/carousel-procred.jpg",
    alt: "ProCred 360 — Crédito para micro e pequenas empresas",
    label: "ProCred 360",
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
    if (paused) return;
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
      {/* Imagem principal */}
      <div className="relative overflow-hidden rounded-2xl shadow-2xl aspect-square w-full max-w-xl mx-auto">
        <img
          key={current}
          src={slides[current].src}
          alt={slides[current].alt}
          className={`w-full h-full object-cover transition-all ease-in-out ${transitionClass}`}
          style={{ transitionDuration: `${TRANSITION_DURATION}ms` }}
          draggable={false}
        />

        {/* Gradiente inferior para legibilidade dos indicadores */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/40 to-transparent rounded-b-2xl pointer-events-none" />

        {/* Botão anterior */}
        <button
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/30 hover:bg-black/55 text-white rounded-full p-1.5 transition-all duration-200 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Imagem anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Botão próximo */}
        <button
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

      {/* Label da linha de crédito atual */}
      <p className="text-center mt-3 text-sm font-semibold text-[var(--color-caixa-yellow)] tracking-wide uppercase opacity-90 transition-opacity duration-300">
        {slides[current].label}
      </p>
    </div>
  );
}
