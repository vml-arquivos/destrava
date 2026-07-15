import pkg from 'pg';
const { Pool } = pkg;

let pool: InstanceType<typeof Pool>;

export function setBannerPool(p: InstanceType<typeof Pool>) {
  pool = p;
}
import { z } from 'zod';

// Schemas de validação
export const BannerSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(3).max(255),
  description: z.string().max(500).optional().nullable(),
  image_url: z.string().url(),
  link_url: z.string().url().optional().nullable(),
  position: z.enum([
    'home_top',
    'home_middle',
    'home_bottom',
    'blog_sidebar',
    'blog_top',
    'credito_empresas_banner',
    'credito_pessoal_banner',
  ]),
  is_active: z.boolean().default(true),
  start_date: z.string().datetime().optional().nullable(),
  end_date: z.string().datetime().optional().nullable(),
  display_order: z.number().int().default(0),
});

export type Banner = z.infer<typeof BannerSchema>;

export const BannerResponseSchema = BannerSchema.extend({
  id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type BannerResponse = z.infer<typeof BannerResponseSchema>;

// Operações de banco de dados
export async function getBannersByPosition(position: string): Promise<BannerResponse[]> {
  const now = new Date().toISOString();

  const result = await pool.query(
    `SELECT * FROM banners 
     WHERE position = $1 
     AND is_active = true
     AND (start_date IS NULL OR start_date <= $2)
     AND (end_date IS NULL OR end_date >= $2)
     ORDER BY display_order ASC`,
    [position, now]
  );

  return result.rows;
}

export async function getAllBannersAdmin(
  page: number = 1,
  limit: number = 20
): Promise<{ banners: BannerResponse[]; total: number }> {
  const offset = (page - 1) * limit;

  const countResult = await pool.query('SELECT COUNT(*) as total FROM banners');
  const total = parseInt(countResult.rows[0].total, 10);

  const result = await pool.query(
    'SELECT * FROM banners ORDER BY display_order ASC, created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );

  return {
    banners: result.rows,
    total,
  };
}

export async function getBannerById(id: string): Promise<BannerResponse | null> {
  const result = await pool.query('SELECT * FROM banners WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createBanner(banner: Banner): Promise<BannerResponse> {
  const {
    title,
    description,
    image_url,
    link_url,
    position,
    is_active,
    start_date,
    end_date,
    display_order,
  } = banner;

  const result = await pool.query(
    `INSERT INTO banners 
     (title, description, image_url, link_url, position, is_active, start_date, end_date, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      title,
      description,
      image_url,
      link_url,
      position,
      is_active,
      start_date,
      end_date,
      display_order,
    ]
  );

  return result.rows[0];
}

export async function updateBanner(id: string, banner: Partial<Banner>): Promise<BannerResponse> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (banner.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    values.push(banner.title);
  }
  if (banner.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(banner.description);
  }
  if (banner.image_url !== undefined) {
    updates.push(`image_url = $${paramIndex++}`);
    values.push(banner.image_url);
  }
  if (banner.link_url !== undefined) {
    updates.push(`link_url = $${paramIndex++}`);
    values.push(banner.link_url);
  }
  if (banner.position !== undefined) {
    updates.push(`position = $${paramIndex++}`);
    values.push(banner.position);
  }
  if (banner.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(banner.is_active);
  }
  if (banner.start_date !== undefined) {
    updates.push(`start_date = $${paramIndex++}`);
    values.push(banner.start_date);
  }
  if (banner.end_date !== undefined) {
    updates.push(`end_date = $${paramIndex++}`);
    values.push(banner.end_date);
  }
  if (banner.display_order !== undefined) {
    updates.push(`display_order = $${paramIndex++}`);
    values.push(banner.display_order);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(
    `UPDATE banners SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0];
}

export async function deleteBanner(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM banners WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
