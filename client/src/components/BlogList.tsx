import React, { useState } from 'react';
import { Link } from 'wouter';
import { useBlogPosts } from '../hooks/useBlogPosts';

interface BlogListProps {
  category?: string;
  className?: string;
}

export function BlogList({ category, className = '' }: BlogListProps) {
  const [page, setPage] = useState(1);
  const { posts, loading, error, pagination } = useBlogPosts(page, category);

  if (error) {
    return (
      <div className={`blog-list error ${className}`}>
        <p>Erro ao carregar posts: {error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`blog-list loading ${className}`}>
        <p>Carregando posts...</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={`blog-list empty ${className}`}>
        <p>Nenhum post encontrado.</p>
      </div>
    );
  }

  return (
    <div className={`blog-list ${className}`}>
      <div className="blog-posts">
        {posts.map((post) => (
          <article key={post.id} className="blog-post-card">
            {post.featured_image_url && (
              <img
                src={post.featured_image_url}
                alt={post.title}
                className="blog-post-image"
              />
            )}
            <div className="blog-post-content">
              <h3>
                <Link to={`/blog/${post.slug}`}>{post.title}</Link>
              </h3>
              <p className="blog-post-excerpt">{post.excerpt}</p>
              <div className="blog-post-meta">
                <span className="blog-post-category">{post.category}</span>
                <span className="blog-post-read-time">{post.read_time}</span>
                <span className="blog-post-date">
                  {new Date(post.published_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <Link to={`/blog/${post.slug}`} className="blog-post-link">
                Ler mais →
              </Link>
            </div>
          </article>
        ))}
      </div>

      {pagination.pages > 1 && (
        <div className="blog-pagination">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="pagination-button"
          >
            ← Anterior
          </button>

          <span className="pagination-info">
            Página {pagination.page} de {pagination.pages}
          </span>

          <button
            onClick={() => setPage(Math.min(pagination.pages, page + 1))}
            disabled={page === pagination.pages}
            className="pagination-button"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}
