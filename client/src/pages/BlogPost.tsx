import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CTAButton from "@/components/CTAButton";
import ScoreBanner from "@/components/ScoreBanner";
import ExitIntentPopup from "@/components/ExitIntentPopup";
import { blogPosts } from "@/data/blogPosts";
import { useRoute, Link } from "wouter";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Substituímos o streamdown por react-markdown + remark-gfm.
// O streamdown embutia mermaid + shiki como dependências diretas, criando
// dependências circulares no bundle que causavam tela branca em produção:
// "Cannot read properties of undefined (reading 'createContext')".
// O react-markdown é leve (~30KB) e não tem essas dependências pesadas.
function MarkdownContent({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {children}
    </ReactMarkdown>
  );
}

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const post = blogPosts.find((p) => p.slug === params?.slug);

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
            <Link href="/blog">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para o Blog
              </Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ExitIntentPopup />
      <Header />

      {/* Breadcrumb e Voltar */}
      <section className="py-6 bg-muted/30 border-b border-border">
        <div className="container">
          <Link href="/blog">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para o Blog
            </Button>
          </Link>
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
                {new Date(post.date).toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {post.readTime} de leitura
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Conteúdo do Artigo */}
      <article className="py-12">
        <div className="container">
          <div className="max-w-4xl mx-auto">
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
              Precisa de capital de giro para sua empresa?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Faça uma simulação gratuita do Giro CAIXA Fácil e descubra como a
              Destrava Crédito pode ajudar seu negócio a crescer.
            </p>
            <CTAButton variant="secondary" size="lg">
              Simular Agora
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
              {blogPosts
                .filter((p) => p.id !== post.id)
                .slice(0, 2)
                .map((relatedPost) => (
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
