import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "wouter";
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  buildFullTitle,
  getPublicSeo,
  normalizePathname,
} from "@shared/publicSeo";

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  type?: "website" | "article";
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  structuredData?: object;
  canonicalPath?: string;
  noindex?: boolean;
}

interface ApplySeoOptions extends SEOProps {
  location: string;
}

function updateMetaTag(name: string, content: string, property = false) {
  const attribute = property ? "property" : "name";
  let element = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.content = content;
}

function removeMetaTag(name: string, property = false) {
  const attribute = property ? "property" : "name";
  document.querySelector(`meta[${attribute}="${name}"]`)?.remove();
}

function applySeo({
  title,
  description,
  keywords,
  image = DEFAULT_OG_IMAGE,
  type = "website",
  author,
  publishedTime,
  modifiedTime,
  structuredData,
  canonicalPath,
  noindex = false,
  location,
}: ApplySeoOptions) {
  const pathname = normalizePathname(location);
  const canonical = normalizePathname(canonicalPath || pathname);
  const currentUrl = `${SITE_URL}${canonical === "/" ? "/" : canonical}`;
  const fullTitle = buildFullTitle(title);

  document.title = fullTitle;
  updateMetaTag("description", description);
  updateMetaTag("author", author || SITE_NAME);
  updateMetaTag(
    "robots",
    noindex
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  );
  if (keywords) updateMetaTag("keywords", keywords);
  else removeMetaTag("keywords");

  updateMetaTag("og:title", fullTitle, true);
  updateMetaTag("og:description", description, true);
  updateMetaTag("og:image", image, true);
  updateMetaTag("og:image:width", "1200", true);
  updateMetaTag("og:image:height", "630", true);
  updateMetaTag("og:image:alt", SITE_NAME, true);
  updateMetaTag("og:url", currentUrl, true);
  updateMetaTag("og:type", type, true);
  updateMetaTag("og:site_name", SITE_NAME, true);
  updateMetaTag("og:locale", "pt_BR", true);

  updateMetaTag("twitter:card", "summary_large_image");
  updateMetaTag("twitter:url", currentUrl);
  updateMetaTag("twitter:title", fullTitle);
  updateMetaTag("twitter:description", description);
  updateMetaTag("twitter:image", image);

  if (type === "article") {
    if (author) updateMetaTag("article:author", author, true);
    if (publishedTime) updateMetaTag("article:published_time", publishedTime, true);
    if (modifiedTime) updateMetaTag("article:modified_time", modifiedTime, true);
  } else {
    removeMetaTag("article:author", true);
    removeMetaTag("article:published_time", true);
    removeMetaTag("article:modified_time", true);
  }

  let canonicalElement = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonicalElement) {
    canonicalElement = document.createElement("link");
    canonicalElement.rel = "canonical";
    document.head.appendChild(canonicalElement);
  }
  canonicalElement.href = currentUrl;

  const schema = structuredData || {
    "@context": "https://schema.org",
    "@graph": [
      organizationStructuredData,
      {
        "@type": type === "article" ? "Article" : "WebPage",
        name: fullTitle,
        description,
        url: currentUrl,
        inLanguage: "pt-BR",
      },
    ],
  };
  let script = document.querySelector("#seo-structured-data") as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = "seo-structured-data";
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schema).replaceAll("<", "\\u003c");
}

export default function SEO({
  title,
  description,
  keywords,
  image = DEFAULT_OG_IMAGE,
  type = "website",
  author,
  publishedTime,
  modifiedTime,
  structuredData,
  canonicalPath,
  noindex,
}: SEOProps) {
  const [location] = useLocation();

  useEffect(() => {
    applySeo({
      title,
      description,
      keywords,
      image,
      type,
      author,
      publishedTime,
      modifiedTime,
      structuredData,
      canonicalPath,
      noindex,
      location,
    });
  }, [title, description, keywords, image, location, type, author, publishedTime, modifiedTime, structuredData, canonicalPath, noindex]);

  return null;
}

export function RouteSeoDefaults() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    const routeSeo = getPublicSeo(location) || {
      title: "Página não encontrada",
      description: "A página solicitada não foi encontrada.",
      noindex: true,
    };
    applySeo({ ...routeSeo, location });
  }, [location]);

  return null;
}

// Structured Data helpers
export const organizationStructuredData = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  description:
    "Assessoria empresarial para captação de recursos e crédito para empresas, com condução completa do processo, atendimento consultivo e acompanhamento próximo.",
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/destrava-logo.png`,
  image: DEFAULT_OG_IMAGE,
  telephone: "+55-61-3526-8355",
  address: {
    "@type": "PostalAddress",
    addressCountry: "BR",
    addressLocality: "Brasília",
    addressRegion: "DF",
  },
  sameAs: ["https://www.instagram.com/destravacredito"],
};

export const serviceStructuredData = (serviceName: string, description: string) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Assessoria Empresarial",
  name: serviceName,
  description: description,
  provider: {
    "@type": "ProfessionalService",
    name: "Destrava",
    telephone: "+55-61-3526-8355",
  },
  areaServed: {
    "@type": "Country",
    name: "Brasil",
  },
});

export const breadcrumbStructuredData = (items: { name: string; url: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});

export const articleStructuredData = (
  title: string,
  description: string,
  image: string,
  datePublished: string,
  dateModified: string,
  author: string
) => ({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: title,
  description: description,
  image: image,
  datePublished: datePublished,
  dateModified: dateModified,
  author: {
    "@type": "Person",
    name: author,
  },
    publisher: {
      "@type": "Organization",
      name: "Destrava",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/destrava-logo.png`,
      },
    },
});

export const faqStructuredData = (faqs: { question: string; answer: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
});
