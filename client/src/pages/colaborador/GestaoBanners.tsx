import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

const BANNER_POSITIONS = [
  { value: "home_top", label: "Início — topo" },
  { value: "home_middle", label: "Início — meio" },
  { value: "home_bottom", label: "Início — final" },
  { value: "blog_top", label: "Blog — topo" },
  { value: "blog_sidebar", label: "Blog — lateral" },
  { value: "credito_empresas_banner", label: "Crédito empresarial" },
  { value: "credito_pessoal_banner", label: "Crédito pessoal" },
] as const;

type BannerPosition = (typeof BANNER_POSITIONS)[number]["value"];

interface AdminBanner {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  link_url: string | null;
  position: BannerPosition;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface BannerForm {
  title: string;
  description: string;
  image_url: string;
  link_url: string;
  position: BannerPosition;
  is_active: boolean;
  start_date: string;
  end_date: string;
  display_order: number;
}

const EMPTY_FORM: BannerForm = {
  title: "",
  description: "",
  image_url: "",
  link_url: "",
  position: "home_middle",
  is_active: false,
  start_date: "",
  end_date: "",
  display_order: 0,
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toForm(banner: AdminBanner): BannerForm {
  return {
    title: banner.title,
    description: banner.description || "",
    image_url: banner.image_url,
    link_url: banner.link_url || "",
    position: banner.position,
    is_active: banner.is_active,
    start_date: toLocalDateTime(banner.start_date),
    end_date: toLocalDateTime(banner.end_date),
    display_order: banner.display_order,
  };
}

function positionLabel(position: BannerPosition) {
  return BANNER_POSITIONS.find(item => item.value === position)?.label || position;
}

function isCurrentlyVisible(banner: AdminBanner) {
  if (!banner.is_active) return false;
  const now = Date.now();
  const starts = banner.start_date ? new Date(banner.start_date).getTime() : null;
  const ends = banner.end_date ? new Date(banner.end_date).getTime() : null;
  return (starts === null || starts <= now) && (ends === null || ends >= now);
}

export default function GestaoBanners() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);
  const [editorOpen, setEditorOpen] = useState(false);

  const loadBanners = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/api/banners/admin/all?page=1");
      setBanners(Array.isArray(data.banners) ? data.banners : []);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar os banners.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  const filteredBanners = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return banners;
    return banners.filter(banner =>
      [banner.title, banner.description, positionLabel(banner.position)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [banners, search]);

  function updateForm<K extends keyof BannerForm>(key: K, value: BannerForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openEdit(banner: AdminBanner) {
    setEditingId(banner.id);
    setForm(toForm(banner));
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(false);
  }

  async function saveBanner(event: React.FormEvent) {
    event.preventDefault();

    if (form.start_date && form.end_date && new Date(form.start_date) >= new Date(form.end_date)) {
      toast.error("A data final precisa ser posterior à data inicial.");
      return;
    }

    const payload = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim() || null,
      image_url: form.image_url.trim(),
      link_url: form.link_url.trim() || null,
      start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      display_order: Number(form.display_order) || 0,
    };

    try {
      setSaving(true);
      const url = editingId
        ? `/api/banners/admin/${editingId}`
        : "/api/banners/admin";
      await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      toast.success(editingId ? "Banner atualizado." : "Banner criado como configurado.");
      closeEditor();
      await loadBanners();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar o banner.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(banner: AdminBanner) {
    try {
      await apiFetch(`/api/banners/admin/${banner.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !banner.is_active }),
      });
      setBanners(current =>
        current.map(item =>
          item.id === banner.id ? { ...item, is_active: !item.is_active } : item
        )
      );
      toast.success(banner.is_active ? "Banner desativado." : "Banner ativado.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível alterar o banner.");
    }
  }

  async function deleteBanner(banner: AdminBanner) {
    if (!window.confirm(`Excluir definitivamente o banner “${banner.title}”?`)) return;
    try {
      await apiFetch(`/api/banners/admin/${banner.id}`, { method: "DELETE" });
      setBanners(current => current.filter(item => item.id !== banner.id));
      toast.success("Banner excluído.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível excluir o banner.");
    }
  }

  const activeCount = banners.filter(isCurrentlyVisible).length;

  return (
    <Layout title="Gestão de Banners">
      <div className="min-h-full bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-sm sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
                  <ImagePlus className="h-3.5 w-3.5" /> Mídia e conversão
                </div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Banners do site</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Posicione campanhas por página e período. Novos banners começam inativos por segurança.
                </p>
              </div>
              <Button onClick={openCreate} className="bg-blue-600 text-white hover:bg-blue-500">
                <ImagePlus className="mr-2 h-4 w-4" /> Novo banner
              </Button>
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total</div>
              <div className="mt-1 text-3xl font-black text-slate-950">{banners.length}</div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Visíveis agora</div>
              <div className="mt-1 text-3xl font-black text-emerald-600">{activeCount}</div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Inativos ou agendados</div>
              <div className="mt-1 text-3xl font-black text-amber-600">{banners.length - activeCount}</div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-black text-slate-950">Campanhas</h2>
                <p className="text-sm text-slate-500">A exibição respeita posição, ativação e janela de datas.</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar banner ou posição" className="pl-9" />
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-52 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando banners
              </div>
            ) : filteredBanners.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center">
                <ImagePlus className="mx-auto h-9 w-9 text-slate-300" />
                <p className="mt-3 font-bold text-slate-700">Nenhum banner encontrado</p>
                <p className="mt-1 text-sm text-slate-500">Crie uma campanha ou ajuste a busca.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBanners.map(banner => (
                  <article key={banner.id} className="rounded-2xl border border-slate-100 p-4 transition hover:border-blue-100 hover:bg-blue-50/30">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <img src={banner.image_url} alt="" className="h-20 w-full rounded-xl bg-slate-100 object-cover lg:w-36" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${isCurrentlyVisible(banner) ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {isCurrentlyVisible(banner) ? "Visível" : banner.is_active ? "Agendado" : "Inativo"}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">{positionLabel(banner.position)}</span>
                        </div>
                        <h3 className="mt-2 truncate text-base font-black text-slate-900">{banner.title}</h3>
                        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{banner.description || "Sem descrição"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => toggleActive(banner)}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> {banner.is_active ? "Desativar" : "Ativar"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(banner)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => deleteBanner(banner)}>
                          <Trash2 className="h-4 w-4" /><span className="sr-only">Excluir {banner.title}</span>
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-end bg-slate-950/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={editingId ? "Editar banner" : "Novo banner"}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
            <form onSubmit={saveBanner} className="min-h-full">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
                <div>
                  <h2 className="text-lg font-black text-slate-950">{editingId ? "Editar banner" : "Novo banner"}</h2>
                  <p className="text-xs text-slate-500">Revise a prévia antes de ativar.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={closeEditor} aria-label="Fechar editor"><X className="h-5 w-5" /></Button>
              </div>

              <div className="space-y-6 p-5 sm:p-7">
                <div>
                  <Label htmlFor="banner-title">Título acessível</Label>
                  <Input id="banner-title" value={form.title} onChange={event => updateForm("title", event.target.value)} minLength={3} maxLength={255} required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="banner-description">Descrição</Label>
                  <Textarea id="banner-description" value={form.description} onChange={event => updateForm("description", event.target.value)} maxLength={500} className="mt-1.5 min-h-24" />
                </div>
                <div>
                  <Label htmlFor="banner-image">URL HTTPS da imagem</Label>
                  <Input id="banner-image" type="url" value={form.image_url} onChange={event => updateForm("image_url", event.target.value)} placeholder="https://..." required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="banner-link">URL de destino (opcional)</Label>
                  <Input id="banner-link" type="url" value={form.link_url} onChange={event => updateForm("link_url", event.target.value)} placeholder="https://..." className="mt-1.5" />
                </div>

                {form.image_url && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <img src={form.image_url} alt="Pré-visualização do banner" className="max-h-52 w-full rounded-xl object-contain" />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="banner-position">Posição</Label>
                    <select id="banner-position" value={form.position} onChange={event => updateForm("position", event.target.value as BannerPosition)} className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {BANNER_POSITIONS.map(position => <option key={position.value} value={position.value}>{position.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="banner-order">Ordem</Label>
                    <Input id="banner-order" type="number" value={form.display_order} onChange={event => updateForm("display_order", Number(event.target.value))} className="mt-1.5" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="banner-start">Início (opcional)</Label>
                    <Input id="banner-start" type="datetime-local" value={form.start_date} onChange={event => updateForm("start_date", event.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="banner-end">Fim (opcional)</Label>
                    <Input id="banner-end" type="datetime-local" value={form.end_date} onChange={event => updateForm("end_date", event.target.value)} className="mt-1.5" />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                  <div>
                    <div className="font-bold text-slate-900">Banner ativo</div>
                    <p className="text-xs text-slate-500">Se ativo, ainda respeitará as datas configuradas.</p>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={checked => updateForm("is_active", checked)} />
                </div>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
                <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Salvar alterações" : "Criar banner"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
