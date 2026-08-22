import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  BookOpenText,
  CheckCircle2,
  FilePlus2,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface AdminBlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  is_published: boolean;
  read_time: string;
  featured_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  created_at: string;
  updated_at: string;
  published_at: string;
}

interface BlogForm {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  is_published: boolean;
  read_time: string;
  featured_image_url: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
}

const EMPTY_FORM: BlogForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "Crédito Empresarial",
  author: "Destrava Crédito",
  is_published: false,
  read_time: "5 min",
  featured_image_url: "",
  seo_title: "",
  seo_description: "",
  seo_keywords: "",
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toForm(post: AdminBlogPost): BlogForm {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    category: post.category,
    author: post.author,
    is_published: post.is_published,
    read_time: post.read_time,
    featured_image_url: post.featured_image_url || "",
    seo_title: post.seo_title || "",
    seo_description: post.seo_description || "",
    seo_keywords: post.seo_keywords || "",
  };
}

export default function GestaoBlog() {
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogForm>(EMPTY_FORM);
  const [editorOpen, setEditorOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/api/blog/admin/posts?page=1");
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar os artigos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const filteredPosts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter(post =>
      [post.title, post.slug, post.category, post.author]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [posts, search]);

  function updateForm<K extends keyof BlogForm>(key: K, value: BlogForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function handleTitleChange(value: string) {
    setForm(current => ({
      ...current,
      title: value,
      slug: slugTouched ? current.slug : slugify(value),
    }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setEditorOpen(true);
  }

  function openEdit(post: AdminBlogPost) {
    setEditingId(post.id);
    setForm(toForm(post));
    setSlugTouched(true);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function savePost(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      ...form,
      slug: slugify(form.slug),
      featured_image_url: form.featured_image_url.trim() || null,
      seo_title: form.seo_title.trim() || null,
      seo_description: form.seo_description.trim() || null,
      seo_keywords: form.seo_keywords.trim() || null,
    };

    if (payload.title.trim().length < 5 || payload.slug.length < 3) {
      toast.error("Informe um título e um slug válidos.");
      return;
    }
    if (payload.excerpt.trim().length < 10 || payload.content.trim().length < 50) {
      toast.error("O resumo e o conteúdo precisam estar completos antes de salvar.");
      return;
    }
    if (payload.seo_description && payload.seo_description.length > 160) {
      toast.error("A descrição SEO deve ter no máximo 160 caracteres.");
      return;
    }

    try {
      setSaving(true);
      const url = editingId
        ? `/api/blog/admin/posts/${editingId}`
        : "/api/blog/admin/posts";
      await apiFetch(url, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      toast.success(editingId ? "Artigo atualizado." : "Artigo criado.");
      closeEditor();
      await loadPosts();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar o artigo.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(post: AdminBlogPost) {
    try {
      await apiFetch(`/api/blog/admin/posts/${post.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_published: !post.is_published }),
      });
      setPosts(current =>
        current.map(item =>
          item.id === post.id
            ? { ...item, is_published: !item.is_published }
            : item
        )
      );
      toast.success(post.is_published ? "Artigo movido para rascunho." : "Artigo publicado.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível alterar a publicação.");
    }
  }

  async function deletePost(post: AdminBlogPost) {
    const confirmed = window.confirm(
      `Excluir definitivamente o artigo “${post.title}”? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    try {
      await apiFetch(`/api/blog/admin/posts/${post.id}`, { method: "DELETE" });
      setPosts(current => current.filter(item => item.id !== post.id));
      toast.success("Artigo excluído.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível excluir o artigo.");
    }
  }

  const publishedCount = posts.filter(post => post.is_published).length;

  return (
    <Layout title="Gestão de Conteúdo">
      <div className="min-h-full bg-muted p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="overflow-hidden rounded-3xl bg-brand-navy px-6 py-7 text-primary-foreground shadow-sm sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-card/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  <BookOpenText className="h-3.5 w-3.5" />
                  Conteúdo e SEO
                </div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Blog Destrava</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Crie, revise e publique artigos sem alterar rotas ou código. Os campos SEO acompanham cada conteúdo.
                </p>
              </div>
              <Button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary">
                <FilePlus2 className="mr-2 h-4 w-4" /> Novo artigo
              </Button>
            </div>
          </header>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="mt-1 text-3xl font-black text-foreground">{posts.length}</div>
            </div>
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Publicados</div>
              <div className="mt-1 text-3xl font-black text-success">{publishedCount}</div>
            </div>
            <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rascunhos</div>
              <div className="mt-1 text-3xl font-black text-warning">{posts.length - publishedCount}</div>
            </div>
          </section>

          <section className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-slate-100 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-black text-foreground">Artigos</h2>
                <p className="text-sm text-muted-foreground">Publicar torna o artigo disponível imediatamente no site.</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar por título, slug ou categoria"
                  className="pl-9"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-52 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando artigos
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                <BookOpenText className="mx-auto h-9 w-9 text-muted-foreground" />
                <p className="mt-3 font-bold text-foreground">Nenhum artigo encontrado</p>
                <p className="mt-1 text-sm text-muted-foreground">Crie o primeiro artigo ou ajuste a busca.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPosts.map(post => (
                  <article key={post.id} className="group rounded-2xl border border-border p-4 transition hover:border-primary/20 hover:bg-primary/10/30">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${post.is_published ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                            {post.is_published ? "Publicado" : "Rascunho"}
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground">{post.category}</span>
                        </div>
                        <h3 className="mt-2 truncate text-base font-black text-foreground">{post.title}</h3>
                        <p className="mt-1 truncate text-sm text-muted-foreground">/blog/{post.slug}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => togglePublished(post)}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {post.is_published ? "Despublicar" : "Publicar"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(post)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => deletePost(post)}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Excluir {post.title}</span>
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
        <div className="fixed inset-0 z-[100] flex items-start justify-end bg-brand-navy/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={editingId ? "Editar artigo" : "Novo artigo"}>
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-card shadow-2xl">
            <form onSubmit={savePost} className="min-h-full">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur sm:px-7">
                <div>
                  <h2 className="text-lg font-black text-foreground">{editingId ? "Editar artigo" : "Novo artigo"}</h2>
                  <p className="text-xs text-muted-foreground">Salve como rascunho até a revisão final.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={closeEditor} aria-label="Fechar editor">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-7 p-5 sm:p-7">
                <section className="space-y-4">
                  <div>
                    <Label htmlFor="post-title">Título</Label>
                    <Input id="post-title" value={form.title} onChange={event => handleTitleChange(event.target.value)} required minLength={5} maxLength={255} className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="post-slug">Slug da URL</Label>
                    <Input id="post-slug" value={form.slug} onChange={event => { setSlugTouched(true); updateForm("slug", slugify(event.target.value)); }} required minLength={3} maxLength={255} className="mt-1.5 font-mono text-sm" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="post-category">Categoria</Label>
                      <Input id="post-category" value={form.category} onChange={event => updateForm("category", event.target.value)} required minLength={3} maxLength={100} className="mt-1.5" />
                    </div>
                    <div>
                      <Label htmlFor="post-author">Autor</Label>
                      <Input id="post-author" value={form.author} onChange={event => updateForm("author", event.target.value)} maxLength={100} className="mt-1.5" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="post-excerpt">Resumo</Label>
                    <Textarea id="post-excerpt" value={form.excerpt} onChange={event => updateForm("excerpt", event.target.value)} required minLength={10} maxLength={500} rows={3} className="mt-1.5" />
                    <p className="mt-1 text-right text-xs text-muted-foreground">{form.excerpt.length}/500</p>
                  </div>
                  <div>
                    <Label htmlFor="post-content">Conteúdo em Markdown</Label>
                    <Textarea id="post-content" value={form.content} onChange={event => updateForm("content", event.target.value)} required minLength={50} rows={18} className="mt-1.5 font-mono text-sm leading-6" />
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl bg-muted p-5">
                  <div>
                    <h3 className="font-black text-foreground">Apresentação</h3>
                    <p className="text-xs text-muted-foreground">Imagem opcional e estimativa de leitura.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                    <div>
                      <Label htmlFor="post-image">URL da imagem destacada</Label>
                      <Input id="post-image" type="url" value={form.featured_image_url} onChange={event => updateForm("featured_image_url", event.target.value)} placeholder="https://..." className="mt-1.5" />
                    </div>
                    <div>
                      <Label htmlFor="post-read-time">Tempo de leitura</Label>
                      <Input id="post-read-time" value={form.read_time} onChange={event => updateForm("read_time", event.target.value)} maxLength={20} className="mt-1.5" />
                    </div>
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/10/40 p-5">
                  <div>
                    <h3 className="font-black text-foreground">SEO</h3>
                    <p className="text-xs text-muted-foreground">Se vazios, título e resumo do artigo serão usados como fallback.</p>
                  </div>
                  <div>
                    <Label htmlFor="post-seo-title">Título SEO</Label>
                    <Input id="post-seo-title" value={form.seo_title} onChange={event => updateForm("seo_title", event.target.value)} maxLength={255} className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="post-seo-description">Descrição SEO</Label>
                    <Textarea id="post-seo-description" value={form.seo_description} onChange={event => updateForm("seo_description", event.target.value)} maxLength={160} rows={3} className="mt-1.5" />
                    <p className={`mt-1 text-right text-xs ${form.seo_description.length > 160 ? "text-destructive" : "text-muted-foreground"}`}>{form.seo_description.length}/160</p>
                  </div>
                  <div>
                    <Label htmlFor="post-seo-keywords">Palavras-chave</Label>
                    <Input id="post-seo-keywords" value={form.seo_keywords} onChange={event => updateForm("seo_keywords", event.target.value)} maxLength={255} placeholder="crédito empresarial, capital de giro" className="mt-1.5" />
                  </div>
                </section>

                <section className="flex items-center justify-between rounded-2xl border border-border p-5">
                  <div>
                    <Label htmlFor="post-published" className="font-black text-foreground">Publicar agora</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Desative para manter o conteúdo como rascunho.</p>
                  </div>
                  <Switch id="post-published" checked={form.is_published} onCheckedChange={value => updateForm("is_published", value)} />
                </section>
              </div>

              <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:px-7">
                <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Salvar alterações" : "Criar artigo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
