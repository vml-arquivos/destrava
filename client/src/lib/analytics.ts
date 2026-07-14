import { useEffect } from "react";
import { useLocation } from "wouter";

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
] as const;

type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type MarketingAttribution = Partial<Record<AttributionKey, string>> & {
  pagina?: string;
  pagina_entrada?: string;
  referrer?: string;
};

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const STORAGE_KEY = "destrava_marketing_attribution";
const CONSENT_STORAGE_KEY = "destrava_cookie_consent_v1";

function readStoredAttribution(): MarketingAttribution {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as MarketingAttribution;
  } catch {
    return {};
  }
}

export function getMarketingAttribution(): MarketingAttribution {
  if (typeof window === "undefined") return {};

  const hasAnalyticsConsent = localStorage.getItem(CONSENT_STORAGE_KEY) === "accepted";
  if (!hasAnalyticsConsent) {
    return {
      pagina: `${window.location.pathname}${window.location.search}`,
      pagina_entrada: `${window.location.pathname}${window.location.search}`,
    };
  }

  const stored = readStoredAttribution();
  const params = new URLSearchParams(window.location.search);
  const current: MarketingAttribution = {};

  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key)?.trim();
    if (value) current[key] = value.slice(0, 255);
  }

  const attribution: MarketingAttribution = {
    ...stored,
    ...current,
    pagina: `${window.location.pathname}${window.location.search}`,
    pagina_entrada:
      stored.pagina_entrada || `${window.location.pathname}${window.location.search}`,
    referrer: stored.referrer || document.referrer || undefined,
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Navegação privada ou armazenamento indisponível não devem bloquear o funil.
  }

  return attribution;
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (typeof window === "undefined") return;

  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );

  if (typeof window.gtag === "function") {
    window.gtag("event", name, cleanParams);
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...cleanParams });
}

function classifyConversionClick(element: HTMLAnchorElement | HTMLButtonElement) {
  const href = element instanceof HTMLAnchorElement ? element.href : "";
  const explicitEvent = element.dataset.analyticsEvent;

  if (explicitEvent) return explicitEvent;
  if (href.includes("wa.me") || href.includes("api.whatsapp.com")) return "click_whatsapp";
  if (/\/(simular|simulacao|captura)(\?|$)/.test(href)) return "click_primary_cta";
  if (href.startsWith("tel:")) return "click_phone";
  if (href.startsWith("mailto:")) return "click_email";
  return null;
}

export function AnalyticsObserver() {
  const [location] = useLocation();

  useEffect(() => {
    getMarketingAttribution();
    trackEvent("page_view", {
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
      page_title: document.title,
    });
  }, [location]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLAnchorElement | HTMLButtonElement>(
        "a, button[data-analytics-event]",
      );
      if (!element) return;

      const eventName = classifyConversionClick(element);
      if (!eventName) return;

      trackEvent(eventName, {
        link_url: element instanceof HTMLAnchorElement ? element.href : undefined,
        link_text: element.textContent?.trim().slice(0, 120),
        cta_position: element.dataset.ctaPosition || "nao_informado",
        page_path: window.location.pathname,
      });
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
