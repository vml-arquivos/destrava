import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useBlogPosts } from "@/hooks/useBlogPosts";
import { Link } from "wouter";
import { Calendar, Clock, ArrowRight, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import { BannerDisplay } from "@/components/BannerDisplay";

export default function Blog() {
  const { posts, loading } = useBlogPosts();

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title="Blog — Crédito Empresarial e Gestão Financeira"
        description="Artigos sobre crédito empresarial, PRONAMPE, FAMPE, FCO, gestão financeira e dicas para pequenos e médios negócios."
        keywords="crédito empresarial, PRONAMPE, FAMPE, FCO, gestão financeira, PME, blog"
        type="website"
      />
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-20">
        <div className="container">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Blog</h1>
            <p className="text-xl text-white/90">
              Conteúdos sobre crédito empresarial, gestão financeira e dicas
              para pequenos negócios.
            </p>
          </div>
        </div>
      </section>

      <BannerDisplay position="blog_top" ariaLabel="Destaque do blog" />

      {/* Lista de Artigos */}
      <section className="py-20">
        <div className="container">
          <div className="max-w-5xl mx-auto">
            <div className="grid gap-8">
              {posts.map((post) => (
                <Card
                  key={post.id}
                  className="hover:shadow-lg transition-shadow duration-300"
                >
                  <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Capa local: evita dependência externa e deslocamento de layout */}
                      <div className="md:w-1/3 flex-shrink-0">
                        <div className="flex h-48 w-full flex-col items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-slate-100 px-5 text-center text-[#0033A0]" aria-hidden="true">
                          <BookOpen className="mb-3 h-10 w-10" />
                          <span className="text-sm font-bold">{post.category}</span>
                        </div>
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
                            {post.category}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(post.published_at).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {post.read_time}
                          </span>
                        </div>

                        <h2 className="text-2xl font-bold mb-3 hover:text-primary transition-colors">
                          <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                        </h2>

                        <p className="text-muted-foreground mb-4 leading-relaxed">
                          {post.excerpt}
                        </p>

                        <Button asChild variant="outline" className="group">
                          <Link href={`/blog/${post.slug}`}>
                            Ler artigo completo
                            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {loading && (
              <div className="py-12 text-center" aria-live="polite">
                <p className="text-lg text-muted-foreground">Carregando artigos...</p>
              </div>
            )}

            {!loading && posts.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-lg text-muted-foreground">
                  Nenhum artigo publicado ainda. Volte em breve!
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <BannerDisplay position="blog_sidebar" ariaLabel="Conteúdo recomendado do blog" />

      {/* CTA */}
      <section className="py-20 bg-muted/30">
        <div className="container text-center">
          <h2 className="text-3xl font-bold mb-4">
            Precisa de crédito para sua empresa?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Faça uma simulação gratuita do Giro CAIXA Fácil e descubra como
            podemos ajudar seu negócio.
          </p>
          <Button asChild size="lg" className="font-semibold">
            <Link href="/simular" data-cta-position="blog-final">
              Simular Agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
