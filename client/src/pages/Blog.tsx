import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { blogPosts } from "@/data/blogPosts";
import { Link } from "wouter";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";

export default function Blog() {
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

      {/* Lista de Artigos */}
      <section className="py-20">
        <div className="container">
          <div className="max-w-5xl mx-auto">
            <div className="grid gap-8">
              {blogPosts.map((post) => (
                <Card
                  key={post.id}
                  className="hover:shadow-lg transition-shadow duration-300"
                >
                  <CardContent className="p-8">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Imagem placeholder */}
                      <div className="md:w-1/3 flex-shrink-0">
                        <img
                          src={`https://placehold.co/400x300/F7F8FA/0033A0?text=${encodeURIComponent(
                            post.category
                          )}`}
                          alt={post.title}
                          className="w-full h-48 object-cover rounded-lg"
                        />
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
                            {post.category}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(post.date).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {post.readTime}
                          </span>
                        </div>

                        <h2 className="text-2xl font-bold mb-3 hover:text-primary transition-colors">
                          <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                        </h2>

                        <p className="text-muted-foreground mb-4 leading-relaxed">
                          {post.excerpt}
                        </p>

                        <Link href={`/blog/${post.slug}`}>
                          <Button variant="outline" className="group">
                            Ler artigo completo
                            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Mensagem se não houver posts */}
            {blogPosts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg">
                  Nenhum artigo publicado ainda. Volte em breve!
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

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
          <Link href="/simulacao">
            <Button size="lg" className="font-semibold">
              Simular Agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
