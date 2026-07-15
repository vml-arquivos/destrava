import { Router, Request, Response } from 'express';
import {
  getBannersByPosition,
  getAllBannersAdmin,
  createBanner,
  updateBanner,
  deleteBanner,
  BannerSchema,
  setBannerPool,
} from '../models/bannerModel';
import { requireAdmin, auth } from '../middleware/auth';
const router = Router();

// Middleware para injetar o pool
router.use((req: Request, res: Response, next) => {
  const pool = (req.app.locals as any).pool;
  if (pool) setBannerPool(pool);
  next();
});

// Rotas públicas
router.get('/position/:position', async (req: Request, res: Response) => {
  try {
    const { position } = req.params;
    const banners = await getBannersByPosition(position);

    res.json(banners);
  } catch (error) {
    console.error('Erro ao obter banners:', error);
    res.status(500).json({ error: 'Erro ao obter banners' });
  }
});

// Rotas admin
router.get('/admin/all', auth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const { banners, total } = await getAllBannersAdmin(page, 20);

    res.json({
      banners,
      pagination: {
        page,
        limit: 20,
        total,
        pages: Math.ceil(total / 20),
      },
    });
  } catch (error) {
    console.error('Erro ao listar banners admin:', error);
    res.status(500).json({ error: 'Erro ao listar banners' });
  }
});

router.post('/admin', auth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const validated = BannerSchema.parse(req.body);
    const banner = await createBanner(validated);

    res.status(201).json(banner);
  } catch (error: any) {
    console.error('Erro ao criar banner:', error);
    res.status(400).json({ error: error.message || 'Erro ao criar banner' });
  }
});

router.put('/admin/:id', auth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = BannerSchema.partial().parse(req.body);
    const banner = await updateBanner(id, validated);

    res.json(banner);
  } catch (error: any) {
    console.error('Erro ao atualizar banner:', error);
    res.status(400).json({ error: error.message || 'Erro ao atualizar banner' });
  }
});

router.delete('/admin/:id', auth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteBanner(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Banner não encontrado' });
    }

    res.json({ message: 'Banner deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar banner:', error);
    res.status(500).json({ error: 'Erro ao deletar banner' });
  }
});

export default router;
