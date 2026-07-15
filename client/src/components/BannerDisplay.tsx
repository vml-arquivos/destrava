import React from 'react';
import { useBanners } from '../hooks/useBanners';

interface BannerDisplayProps {
  position: string;
  className?: string;
}

export function BannerDisplay({ position, className = '' }: BannerDisplayProps) {
  const { banners, loading, error } = useBanners(position);

  if (loading) {
    return null;
  }

  if (error) {
    console.warn(`Erro ao carregar banners para posição ${position}:`, error);
    return null;
  }

  if (banners.length === 0) {
    return null;
  }

  return (
    <div className={`banner-display ${className}`}>
      {banners.map((banner) => (
        <div key={banner.id} className="banner-item" style={{ order: banner.display_order }}>
          {banner.link_url ? (
            <a href={banner.link_url} target="_blank" rel="noopener noreferrer" className="banner-link">
              <img
                src={banner.image_url}
                alt={banner.title}
                title={banner.description}
                className="banner-image"
              />
            </a>
          ) : (
            <img
              src={banner.image_url}
              alt={banner.title}
              title={banner.description}
              className="banner-image"
            />
          )}
        </div>
      ))}
    </div>
  );
}
