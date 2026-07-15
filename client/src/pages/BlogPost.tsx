import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CTAButton from "@/components/CTAButton";
import ScoreBanner from "@/components/ScoreBanner";
import ExitIntentPopup from "@/components/ExitIntentPopup";
import { useBlogPostBySlug, useBlogPosts } from "@/hooks/useBlogPosts";
import { useRoute, Link } from "wouter";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SEO from "@/components/SEO";
import { DEFAULT_OG_IMAGE, SITE_URL } from "@shared/publicSeo";

// Substituímos o streamdown por react-markdown + remark-gfm.
// O streamdown embutia mermaid + shiki como dependências diretas, criando
// dependências circulares no bundle que causavam tela branca em produção:
// "Cannot read properties of undefined (reading 'createContext')".
// O react-markdown é leve (~30KB) e não tem essas dependências pesadas.
function MarkdownContent({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug || "";
  const { post, loading } = useBlogPostBySlug(slug);
  const { posts: availablePosts } = useBlogPosts();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center py-20" aria-live="polite">
          <p className="text-lg text-muted-foreground">Carregando artigo...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Artigo não encontrado</h1>
            <p className="text-muted-foreground mb-8">
              O artigo que você procura não existe ou foi removido.
            </p>
            <Button asChild variant="outline">
              <Link href="/blog">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o Blog
              </Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={post.seo_title || post.title}
        description={post.seo_description || post.excerpt}
        keywords={post.seo_keywords}
        type="article"
        author={post.author || "Destrava Crédito"}
        publishedTime={post.published_at}
        modifiedTime={post.updated_at}
        image={post.featured_image_url || DEFAULT_OG_IMAGE}
        canonicalPath={`/blog/${post.slug}`}
        structuredData={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: post.title,
              description: post.excerpt,
              image: post.featured_image_url || DEFAULT_OG_IMAGE,
              datePublished: post.published_at,
              dateModified: post.updated_at,
              mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
              author: { "@type": "Organization", name: "Destrava Crédito" },
              publisher: {
                "@type": "Organization",
                name: "Destrava Crédito",
                logo: {
                  "@type": "ImageObject",
                  url: `${SITE_URL}/destrava-logo.png`,
                },
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Início",
                  item: `${SITE_URL}/`,
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Blog",
                  item: `${SITE_URL}/blog`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: post.title,
                  item: `${SITE_URL}/blog/${post.slug}`,
                },
              ],
            },
          ],
        }}
      />
      <ExitIntentPopup />
      <Header />

      {/* Breadcrumb e Voltar */}
      <section className="py-6 bg-muted/30 border-b border-border">
        <div className="container">
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link href="/blog">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para o Blog
            </Link>
          </Button>
        </div>
      </section>

      {/* Cabeçalho do Artigo */}
      <section className="py-12 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary font-medium text-sm mb-4">
              {post.category}
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              {post.title}
            </h1>
            <div className="flex items-center gap-6 text-muted-foreground">
              <span className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {new Date(post.published_at).toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {post.read_time} de leitura
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Conteúdo do Artigo */}
      <article className="py-12">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <aside className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950" aria-label="Aviso sobre o conteúdo">
              Conteúdo educativo. Regras, taxas, limites e prazos podem mudar. Confirme as condições vigentes, o Custo Efetivo Total (CET) e a proposta da instituição antes de contratar. A concessão de crédito depende de análise e aprovação da instituição financeira.
            </aside>
            <div className="prose prose-lg max-w-none">
              {/* Dividir o conteúdo para inserir o banner no meio */}
              {post.content.includes("##") ? (
                <>
                  <MarkdownContent>
                    {post.content.split("##")[0]}
                  </MarkdownContent>
                  <ScoreBanner />
                  <MarkdownContent>
                    {"##" + post.content.split("##").slice(1).join("##")}
                  </MarkdownContent>
                </>
              ) : (
                <>
                  <MarkdownContent>{post.content}</MarkdownContent>
                  <ScoreBanner />
                </>
              )}
            </div>
          </div>
        </div>
      </article>

      {/* CTA no final do artigo */}
      <section className="py-16 bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              {post.category.toLowerCase().includes("pronampe") 
                ? "Pronto para acessar o PRONAMPE?" 
                : post.category.toLowerCase().includes("score") || post.category.toLowerCase().includes("gestão") 
                  ? "Quer saber como está o seu score de crédito?" 
                  : "Precisa de capital de giro para sua empresa?"}
            </h2>
            <p className="text-xl text-white/90 mb-8">
              {post.category.toLowerCase().includes("pronampe") 
                ? "Nossa equipe organiza a análise e orienta a solicitação para você decidir com mais clareza e segurança." 
                : post.category.toLowerCase().includes("score") || post.category.toLowerCase().includes("gestão") 
                  ? "Faça uma consulta agora e descubra como a Destrava Crédito pode ajudar seu negócio a crescer." 
                  : "Faça uma simulação gratuita e descubra como a Destrava Crédito pode ajudar seu negócio a crescer."}
            </p>
            <CTAButton 
              variant="secondary" 
              size="lg" 
              href={post.category.toLowerCase().includes("score") || post.category.toLowerCase().includes("gestão") ? "/calculadora-score" : "/simular"}
            >
              {post.category.toLowerCase().includes("score") || post.category.toLowerCase().includes("gestão") ? "Consultar Score Grátis" : "Simular Agora"}
            </CTAButton>
          </div>
        </div>
      </section>

      {/* Outros Artigos */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8">Outros artigos</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {availablePosts
                .filter(p => p.id !== post.id)
                .sort((a, b) => {
                  if (a.category === post.category && b.category !== post.category) return -1;
                  if (a.category !== post.category && b.category === post.category) return 1;
                  return 0;
                })
                .slice(0, 2)
                .map(relatedPost => (
                  <Link
                    key={relatedPost.id}
                    href={`/blog/${relatedPost.slug}`}
                    className="group"
                  >
                    <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow">
                      <span className="text-xs font-medium text-primary mb-2 block">
                        {relatedPost.category}
                      </span>
                      <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                        {relatedPost.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {relatedPost.excerpt}
                      </p>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
