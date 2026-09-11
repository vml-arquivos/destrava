import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blogPosts } from "../client/src/data/blogPosts";
import { PUBLIC_SEO_ROUTES, SITE_URL } from "../shared/publicSeo";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "client", "public");
const lastModified = "2026-07-14";

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const staticUrls = Object.entries(PUBLIC_SEO_ROUTES)
  .filter(([, seo]) => seo.sitemap && !seo.noindex)
  .map(([route, seo]) => ({
    loc: `${SITE_URL}${route === "/" ? "/" : route}`,
    lastmod: lastModified,
    changefreq: seo.sitemap!.changefreq,
    priority: seo.sitemap!.priority.toFixed(2),
  }));

const blogUrls = blogPosts.map((post) => ({
  loc: `${SITE_URL}/blog/${post.slug}`,
  lastmod: post.date,
  changefreq: "monthly",
  priority: "0.60",
}));

const entries = [...staticUrls, ...blogUrls]
  .sort((a, b) => a.loc.localeCompare(b.loc))
  .map(
    (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
  )
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;

const robots = `# Destrava Crédito — diretivas para mecanismos de busca
User-agent: *
Allow: /
Disallow: /api/
Disallow: /colaborador/
Disallow: /sucesso
Disallow: /captura

Sitemap: ${SITE_URL}/sitemap.xml
`;

fs.writeFileSync(path.join(publicDir, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(publicDir, "robots.txt"), robots);

