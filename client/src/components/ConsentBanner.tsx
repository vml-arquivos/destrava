import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

type ConsentChoice = "accepted" | "essential";

const STORAGE_KEY = "destrava_cookie_consent_v1";

function updateGoogleConsent(choice: ConsentChoice) {
  window.gtag?.("consent", "update", {
    analytics_storage: choice === "accepted" ? "granted" : "denied",
    ad_storage: choice === "accepted" ? "granted" : "denied",
    ad_user_data: choice === "accepted" ? "granted" : "denied",
    ad_personalization: choice === "accepted" ? "granted" : "denied",
  });
}

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ConsentChoice | null;
    if (stored === "accepted" || stored === "essential") {
      updateGoogleConsent(stored);
    } else {
      setVisible(true);
    }
  }, []);

  const choose = (choice: ConsentChoice) => {
    localStorage.setItem(STORAGE_KEY, choice);
    updateGoogleConsent(choice);
    setVisible(false);
    trackEvent("consent_update", { consent_choice: choice });
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Preferências de privacidade"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl md:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm leading-relaxed text-slate-700">
          Usamos cookies essenciais para o site funcionar. Com sua permissão, usamos dados de medição para entender o desempenho das páginas e melhorar a experiência. Saiba mais na{" "}
          <Link href="/politica-privacidade" className="font-semibold text-[#0033A0] underline">
            Política de Privacidade
          </Link>
          .
        </p>
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => choose("essential")}>
            Somente essenciais
          </Button>
          <Button type="button" onClick={() => choose("accepted")}>
            Aceitar analytics
          </Button>
        </div>
      </div>
    </aside>
  );
}

