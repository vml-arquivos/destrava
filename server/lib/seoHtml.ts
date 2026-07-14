import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  buildFullTitle,
  normalizePathname,
  type PublicSeoDefinition,
} from "../../shared/publicSeo";

const SEO_START = "<!-- SEO:START -->";
const SEO_END = "<!-- SEO:END -->";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export interface SeoRenderData extends PublicSeoDefinition {
  pathname: string;
  image?: string;
  publishedTime?: string;
  modifiedTime?: string;
}

export function renderSeoHead(data: SeoRenderData) {
  const pathname = normalizePathname(data.pathname);
  const canonicalPath = data.canonicalPath || pathname;
  const canonicalUrl = `${SITE_URL}${canonicalPath === "/" ? "/" : canonicalPath}`;
  const title = buildFullTitle(data.title);
  const image = data.image || DEFAULT_OG_IMAGE;
  const robots = data.noindex
    ? "noindex, nofollow"
    : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
  const pageType = data.type || "website";

  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/destrava-logo.png`,
      telephone: "+55-61-3526-8355",
      sameAs: ["https://www.instagram.com/destravacredito"],
      address: [
        {
          "@type": "PostalAddress",
          streetAddress: "QND 25 Lote 40 - Taguatinga Norte",
          addressLocality: "Brasília",
          addressRegion: "DF",
          addressCountry: "BR",
        },
        {
          "@type": "PostalAddress",
          streetAddress: "Praça Cel Vicente Sanches de Almeida, LT 07 Sala 03 - Crimeia Leste",
          addressLocality: "Goiânia",
          addressRegion: "GO",
          addressCountry: "BR",
        },
      ],
    },
    {
      "@type": pageType === "article" ? "Article" : "WebPage",
      "@id": `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: title,
      description: data.description,
      inLanguage: "pt-BR",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      ...(pageType === "article"
        ? {
            headline: data.title,
            image,
            datePublished: data.publishedTime,
            dateModified: data.modifiedTime || data.publishedTime,
            publisher: { "@id": `${SITE_URL}/#organization` },
          }
        : {}),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ];

  return `${SEO_START}
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(data.description)}" />
    <meta name="author" content="${SITE_NAME}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:type" content="${pageType}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(data.description)}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${SITE_NAME}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${canonicalUrl}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(data.description)}" />
    <meta name="twitter:image" content="${image}" />
    <script id="seo-structured-data" type="application/ld+json">${safeJson({
      "@context": "https://schema.org",
      "@graph": graph,
    })}</script>
    ${SEO_END}`;
}

export function injectSeoHead(html: string, data: SeoRenderData) {
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start === -1 || end === -1 || end < start) return html;
  return `${html.slice(0, start)}${renderSeoHead(data)}${html.slice(end + SEO_END.length)}`;
}

