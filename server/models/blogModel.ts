import pkg from 'pg';
const { Pool } = pkg;

let pool: InstanceType<typeof Pool>;

export function setBlogPool(p: InstanceType<typeof Pool>) {
  pool = p;
}
import { z } from 'zod';

// Schemas de validação
export const BlogPostSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(5).max(255),
  slug: z.string().min(3).max(255).regex(/^[a-z0-9-]+$/),
  excerpt: z.string().min(10).max(500),
  content: z.string().min(50),
  category: z.string().min(3).max(100),
  author: z.string().max(100).default('Destrava Crédito'),
  is_published: z.boolean().default(false),
  read_time: z.string().max(20).default('5 min'),
  featured_image_url: z.string().url().optional().nullable(),
  seo_title: z.string().max(255).optional().nullable(),
  seo_description: z.string().max(160).optional().nullable(),
  seo_keywords: z.string().max(255).optional().nullable(),
});

export type BlogPost = z.infer<typeof BlogPostSchema>;

export const BlogPostResponseSchema = BlogPostSchema.extend({
  id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
  published_at: z.string(),
});

export type BlogPostResponse = z.infer<typeof BlogPostResponseSchema>;

// Operações de banco de dados
export async function getAllBlogPosts(
  page: number = 1,
  limit: number = 20,
  category?: string
): Promise<{ posts: BlogPostResponse[]; total: number }> {
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE is_published = true';
  const params: any[] = [];

  if (category) {
    whereClause += ' AND category = $1';
    params.push(category);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM blog_posts ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].total, 10);

  const result = await pool.query(
    `SELECT * FROM blog_posts ${whereClause} ORDER BY published_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    posts: result.rows,
    total,
  };
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPostResponse | null> {
  const result = await pool.query(
    'SELECT * FROM blog_posts WHERE slug = $1 AND is_published = true',
    [slug]
  );

  return result.rows[0] || null;
}

export async function getBlogPostById(id: string): Promise<BlogPostResponse | null> {
  const result = await pool.query('SELECT * FROM blog_posts WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createBlogPost(post: BlogPost): Promise<BlogPostResponse> {
  const {
    title,
    slug,
    excerpt,
    content,
    category,
    author,
    is_published,
    read_time,
    featured_image_url,
    seo_title,
    seo_description,
    seo_keywords,
  } = post;

  const result = await pool.query(
    `INSERT INTO blog_posts 
     (title, slug, excerpt, content, category, author, is_published, read_time, featured_image_url, seo_title, seo_description, seo_keywords)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      title,
      slug,
      excerpt,
      content,
      category,
      author,
      is_published,
      read_time,
      featured_image_url,
      seo_title,
      seo_description,
      seo_keywords,
    ]
  );

  return result.rows[0];
}

export async function updateBlogPost(id: string, post: Partial<BlogPost>): Promise<BlogPostResponse> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (post.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(post.title);
  }
  if (post.slug !== undefined) {
    updates.push(`slug = $${paramIndex++}`);
    values.push(post.slug);
  }
  if (post.excerpt !== undefined) {
    updates.push(`excerpt = $${paramIndex++}`);
    values.push(post.excerpt);
  }
  if (post.content !== undefined) {
    updates.push(`content = $${paramIndex++}`);
    values.push(post.content);
  }
  if (post.category !== undefined) {
    updates.push(`category = $${paramIndex++}`);
    values.push(post.category);
  }
  if (post.is_published !== undefined) {
    updates.push(`is_published = $${paramIndex++}`);
    values.push(post.is_published);
  }
  if (post.seo_title !== undefined) {
    updates.push(`seo_title = $${paramIndex++}`);
    values.push(post.seo_title);
  }
  if (post.seo_description !== undefined) {
    updates.push(`seo_description = $${paramIndex++}`);
    values.push(post.seo_description);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(
    `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0];
}

export async function deleteBlogPost(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM blog_posts WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getAllBlogPostsAdmin(
  page: number = 1,
  limit: number = 20
): Promise<{ posts: BlogPostResponse[]; total: number }> {
  const offset = (page - 1) * limit;

  const countResult = await pool.query('SELECT COUNT(*) as total FROM blog_posts');
  const total = parseInt(countResult.rows[0].total, 10);

  const result = await pool.query(
    'SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );

  return {
    posts: result.rows,
    total,
  };
}
