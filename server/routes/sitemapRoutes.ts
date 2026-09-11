import { Router, Request, Response } from "express";
import { Pool } from "pg";

export function createSitemapRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/sitemap/blog
   * Retorna um sitemap XML com todas as URLs dinâmicas do blog
   */
  router.get("/blog", async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT slug, published_at, updated_at FROM blog_posts 
         WHERE is_published = true 
         ORDER BY published_at DESC`
      );

      const posts = result.rows || [];

      // Construir XML do sitemap
      const baseUrl = "https://destravacredito.com";
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      posts.forEach((post: any) => {
        const lastmod = new Date(post.updated_at || post.published_at)
          .toISOString()
          .split("T")[0];

        xml += "  <url>\n";
        xml += `    <loc>${baseUrl}/blog/${post.slug}</loc>\n`;
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        xml += '    <changefreq>weekly</changefreq>\n';
        xml += '    <priority>0.7</priority>\n';
        xml += "  </url>\n";
      });

      xml += "</urlset>";

      res.set("Content-Type", "application/xml; charset=utf-8");
      res.send(xml);
    } catch (error) {
      console.error("Erro ao gerar sitemap do blog:", error);
      res.status(500).json({ error: "Erro ao gerar sitemap" });
    }
  });

  return router;
}
