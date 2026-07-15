import { useBanners } from "../hooks/useBanners";

interface BannerDisplayProps {
  position: string;
  className?: string;
  ariaLabel?: string;
}

function isExternalUrl(url: string) {
  try {
    return new URL(url, window.location.origin).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function BannerDisplay({
  position,
  className = "",
  ariaLabel = "Conteúdo em destaque",
}: BannerDisplayProps) {
  const { banners, loading, error } = useBanners(position);

  if (loading || error || banners.length === 0) {
    if (error && import.meta.env.DEV) {
      console.warn(`Erro ao carregar banners para posição ${position}:`, error);
    }
    return null;
  }

  return (
    <aside aria-label={ariaLabel} className={`container py-5 ${className}`.trim()}>
      <div className="grid gap-4">
        {banners.map(banner => {
          const image = (
            <img
              src={banner.image_url}
              alt={banner.title}
              title={banner.description || undefined}
              loading="lazy"
              decoding="async"
              className="max-h-72 w-full rounded-2xl object-cover shadow-sm ring-1 ring-slate-200/70 transition duration-300 group-hover:shadow-md"
            />
          );

          return (
            <div key={banner.id} style={{ order: banner.display_order }}>
              {banner.link_url ? (
                <a
                  href={banner.link_url}
                  {...(isExternalUrl(banner.link_url)
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  aria-label={banner.description || banner.title}
                >
                  {image}
                </a>
              ) : image}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
