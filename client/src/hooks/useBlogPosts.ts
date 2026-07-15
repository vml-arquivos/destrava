import { useState, useEffect } from 'react';
import { blogPosts as staticBlogPosts } from '@/data/blogPosts';

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  published_at: string;
  updated_at: string;
  is_published: boolean;
  read_time: string;
  featured_image_url?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  created_at: string;
}

function staticPostToApi(post: (typeof staticBlogPosts)[number]): BlogPost {
  const parsedDate = new Date(post.date);
  const safeDate = Number.isNaN(parsedDate.getTime())
    ? new Date(0).toISOString()
    : parsedDate.toISOString();

  return {
    id: String(post.id),
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    category: post.category,
    author: 'Destrava Crédito',
    published_at: safeDate,
    updated_at: safeDate,
    created_at: safeDate,
    is_published: true,
    read_time: post.readTime,
  };
}

const staticFallbackPosts = staticBlogPosts.map(staticPostToApi);

export interface BlogPostsResponse {
  posts: BlogPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export function useBlogPosts(page: number = 1, category?: string) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.append('page', String(page));
        if (category) {
          params.append('category', category);
        }

        const response = await fetch(`/api/blog/posts?${params}`);
        if (!response.ok) {
          throw new Error(`Erro ao buscar posts: ${response.statusText}`);
        }

        const data: BlogPostsResponse = await response.json();
        setPosts(data.posts);
        setPagination(data.pagination);
      } catch (err) {
        const fallback = category
          ? staticFallbackPosts.filter(post => post.category === category)
          : staticFallbackPosts;
        const start = (page - 1) * 20;
        setPosts(fallback.slice(start, start + 20));
        setPagination({
          page,
          limit: 20,
          total: fallback.length,
          pages: Math.max(1, Math.ceil(fallback.length / 20)),
        });
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [page, category]);

  return { posts, loading, error, pagination };
}

export function useBlogPostBySlug(slug: string) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const fetchPost = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/blog/posts/${slug}`);
        if (!response.ok) {
          if (response.status === 404) {
            const fallback = staticFallbackPosts.find(item => item.slug === slug) || null;
            setPost(fallback);
            return;
          }
          throw new Error(`Erro ao buscar post: ${response.statusText}`);
        }

        const data: BlogPost = await response.json();
        setPost(data);
      } catch (err) {
        const fallback = staticFallbackPosts.find(item => item.slug === slug) || null;
        setPost(fallback);
        setError(fallback ? null : err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [slug]);

  return { post, loading, error };
}
