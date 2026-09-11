import { Router, Request, Response } from 'express';
import {
  getAllBlogPosts,
  getBlogPostBySlug,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  getAllBlogPostsAdmin,
  BlogPostSchema,
  setBlogPool,
} from '../models/blogModel';
import { requireAdmin, auth } from '../middleware/auth';
const router = Router();

// Middleware para injetar o pool
router.use((req: Request, res: Response, next) => {
  const pool = (req.app.locals as any).pool;
  if (pool) setBlogPool(pool);
  next();
});

// Rotas públicas
router.get('/posts', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const category = req.query.category as string | undefined;

    const { posts, total } = await getAllBlogPosts(page, 20, category);

    res.json({
      posts,
      pagination: {
        page,
        limit: 20,
        total,
        pages: Math.ceil(total / 20),
      },
    });
  } catch (error) {
    console.error('Erro ao listar posts:', error);
    res.status(500).json({ error: 'Erro ao listar posts' });
  }
});

router.get('/posts/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const post = await getBlogPostBySlug(slug);

    if (!post) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }

    res.json(post);
  } catch (error) {
    console.error('Erro ao obter post:', error);
    res.status(500).json({ error: 'Erro ao obter post' });
  }
});

// Rotas admin
router.get('/admin/posts', auth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const { posts, total } = await getAllBlogPostsAdmin(page, 20);

    res.json({
      posts,
      pagination: {
        page,
        limit: 20,
        total,
        pages: Math.ceil(total / 20),
      },
    });
  } catch (error) {
    console.error('Erro ao listar posts admin:', error);
    res.status(500).json({ error: 'Erro ao listar posts' });
  }
});

router.post('/admin/posts', auth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const validated = BlogPostSchema.parse(req.body);
    const post = await createBlogPost(validated);

    res.status(201).json(post);
  } catch (error: any) {
    console.error('Erro ao criar post:', error);
    if (error.code === '23505') {
      // Violação de constraint unique (slug duplicado)
      return res.status(400).json({ error: 'Slug já existe' });
    }
    res.status(400).json({ error: error.message || 'Erro ao criar post' });
  }
});

router.put('/admin/posts/:id', auth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = BlogPostSchema.partial().parse(req.body);
    const post = await updateBlogPost(id, validated);

    res.json(post);
  } catch (error: any) {
    console.error('Erro ao atualizar post:', error);
    res.status(400).json({ error: error.message || 'Erro ao atualizar post' });
  }
});

router.delete('/admin/posts/:id', auth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteBlogPost(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }

    res.json({ message: 'Post deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar post:', error);
    res.status(500).json({ error: 'Erro ao deletar post' });
  }
});

export default router;
