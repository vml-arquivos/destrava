import { useEffect } from "react";
import { useLocation } from "wouter";

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
}

export default function SEO({
  title,
  description,
  keywords,
  image = "https://via.placeholder.com/1200x630/0033A0/FFFFFF?text=Destrava+Cr%C3%A9dito",
  type = "website",
  author,
  publishedTime,
  modifiedTime,
  structuredData,
}: SEOProps) {
  const [location] = useLocation();
  const siteUrl = window.location.origin;
  const currentUrl = `${siteUrl}${location}`;
  const siteName = "Destrava Crédito";
  const fullTitle = `${title} | ${siteName}`;

  useEffect(() => {
    // Atualizar title
    document.title = fullTitle;

    // Função helper para atualizar ou criar meta tag
    const updateMetaTag = (name: string, content: string, property = false) => {
      const attribute = property ? "property" : "name";
      let element = document.querySelector(
        `meta[${attribute}="${name}"]`
      ) as HTMLMetaElement;

      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }

      element.content = content;
    };

    // Meta tags básicas
    updateMetaTag("description", description);
    if (keywords) {
      updateMetaTag("keywords", keywords);
    }
    updateMetaTag("author", author || siteName);

    // Open Graph tags
    updateMetaTag("og:title", fullTitle, true);
    updateMetaTag("og:description", description, true);
    updateMetaTag("og:image", image, true);
    updateMetaTag("og:url", currentUrl, true);
    updateMetaTag("og:type", type, true);
    updateMetaTag("og:site_name", siteName, true);
    updateMetaTag("og:locale", "pt_BR", true);

    // Twitter Card tags
    updateMetaTag("twitter:card", "summary_large_image");
    updateMetaTag("twitter:title", fullTitle);
    updateMetaTag("twitter:description", description);
    updateMetaTag("twitter:image", image);

    // Article tags (se for artigo)
    if (type === "article") {
      if (author) {
        updateMetaTag("article:author", author, true);
      }
      if (publishedTime) {
        updateMetaTag("article:published_time", publishedTime, true);
      }
      if (modifiedTime) {
        updateMetaTag("article:modified_time", modifiedTime, true);
      }
    }

    // Canonical URL
    let canonical = document.querySelector(
      'link[rel="canonical"]'
    ) as HTMLLinkElement;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = currentUrl;

    // Structured Data (JSON-LD)
    if (structuredData) {
      let script = document.querySelector(
        'script[type="application/ld+json"]'
      ) as HTMLScriptElement;
      if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }
  }, [
    fullTitle,
    description,
    keywords,
    image,
    currentUrl,
    type,
    author,
    publishedTime,
    modifiedTime,
    structuredData,
    siteName,
  ]);

  return null;
}

// Structured Data helpers
export const organizationStructuredData = {
  "@context": "https://schema.org",
  "@type": "FinancialService",
  name: "Destrava Crédito",
  description:
    "Correspondente bancário autorizado da CAIXA Econômica Federal. Assessoria especializada em crédito empresarial e Giro CAIXA Fácil.",
  url: "https://destrava-credito.manus.space",
  logo: "https://destrava-credito.manus.space/destrava-logo.svg",
  image: "https://destrava-credito.manus.space/3.png",
  telephone: "+55-61-98605-5223",
  address: {
    "@type": "PostalAddress",
    addressCountry: "BR",
    addressLocality: "Brasil",
  },
  sameAs: [
    "https://www.facebook.com/destravacredito",
    "https://www.instagram.com/destravacredito",
    "https://www.linkedin.com/company/destravacredito",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "127",
  },
};

export const serviceStructuredData = (serviceName: string, description: string) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Crédito Empresarial",
  name: serviceName,
  description: description,
  provider: {
    "@type": "FinancialService",
    name: "Destrava Crédito",
    telephone: "+55-61-98605-5223",
  },
  areaServed: {
    "@type": "Country",
    name: "Brasil",
  },
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/InStock",
    priceCurrency: "BRL",
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
    name: "Destrava Crédito",
    logo: {
      "@type": "ImageObject",
      url: "https://destrava-credito.manus.space/destrava-logo.svg",
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
