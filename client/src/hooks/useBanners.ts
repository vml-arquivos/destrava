import { useState, useEffect } from 'react';

export interface Banner {
  id: string;
  title: string;
  description?: string;
  image_url: string;
  link_url?: string;
  position: string;
  is_active: boolean;
  start_date?: string;
  end_date?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function useBanners(position: string) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!position) {
      setBanners([]);
      setLoading(false);
      return;
    }

    const fetchBanners = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/banners/position/${encodeURIComponent(position)}`);
        if (!response.ok) {
          throw new Error(`Erro ao buscar banners: ${response.statusText}`);
        }

        const data: Banner[] = await response.json();
        setBanners(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
        setBanners([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
  }, [position]);

  return { banners, loading, error };
}
