import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  MapPin,
  Search,
  ShieldCheck,
  UserRoundPlus,
  LogIn,
  Sparkles,
  SlidersHorizontal,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import Seo from "@/components/Seo";

const cities = [
  "Todas as cidades",
  "São Paulo",
  "Rio de Janeiro",
  "Belo Horizonte",
  "Brasília",
  "Curitiba",
  "Salvador",
  "Recife",
];
const categories = [
  "Todas as categorias",
  "Acompanhante",
  "Modelo",
  "Trans",
  "Casal",
];
const attributes = [
  "Todos os atributos",
  "Com local",
  "Atendimento virtual",
  "Viagem",
  "Premium",
];

export default function Home() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("Todas as cidades");
  const [category, setCategory] = useState("Todas as categorias");
  const [attribute, setAttribute] = useState("Todos os atributos");
  const input = useMemo(
    () => ({
      search: search || undefined,
      city: city.startsWith("Todas") ? undefined : city,
      category: category.startsWith("Todas") ? undefined : category,
      attribute: attribute.startsWith("Todos") ? undefined : attribute,
    }),
    [search, city, category, attribute]
  );
  const config = trpc.system.config.useQuery();
  const age = trpc.age.status.useQuery();
  const { data: profiles = [], isLoading } = trpc.profiles.list.useQuery(
    input,
    {
      enabled: Boolean(
        config.data?.publicAccessEnabled && age.data?.status === "approved"
      ),
    }
  );
  const testMode = Boolean(config.data?.testMode);
  const publicOpen = Boolean(
    config.data?.publicAccessEnabled && age.data?.status === "approved"
  );
  const ownerPath = testMode ? "/cadastro-teste" : "/titular";
  const clearFilters = () => {
    setSearch("");
    setCity("Todas as cidades");
    setCategory("Todas as categorias");
    setAttribute("Todos os atributos");
  };

  return (
    <div className="min-h-screen bg-[#222222] text-white">
      <Seo
        title="Só Models — Acompanhantes na sua cidade"
        description="Encontre acompanhantes por cidade, categoria, estilo e disponibilidade."
        path="/"
      />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#222222]/90 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <Link href="/">
            <span className="brand-mark">
              Só <i>Models</i>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
            <a href="#explorar">Explorar</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#seguranca">Segurança</a>
            <Link href={ownerPath}>Anuncie seu perfil</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button
                variant="outline"
                className="border-white/20 bg-transparent text-white"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Entrar
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <main>
        <section className="hero-section">
          <div className="container grid items-center gap-12 lg:grid-cols-2">
            <div className="hero-copy">
              <p className="eyebrow">ACOMPANHANTES NA SUA CIDADE</p>
              <h1 className="font-display text-5xl leading-[.94] tracking-tight md:text-7xl">
                Encontre acompanhantes para o momento que você deseja.
              </h1>
              <p className="hero-description mt-6 max-w-xl text-lg leading-8 text-white/65">
                Prazer, companhia, conversa ou uma experiência diferente:
                explore perfis na sua cidade e escolha com clareza, no seu
                ritmo.
              </p>
              <div className="hero-actions mt-8 flex flex-wrap items-center gap-4">
                <a href="#explorar">
                  <Button className="bg-[#ff4764] px-6 text-[#222222] hover:bg-[#ff765f]">
                    Ver acompanhantes agora <Search className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              </div>
              <p className="hero-meta mt-4 text-xs uppercase tracking-[.16em] text-white/40">
                Para maiores de 18 anos • Busca por cidade • Informações
                públicas
              </p>
            </div>
            <figure className="hero-visual">
              <picture>
                <source
                  type="image/webp"
                  srcSet="/images/hero/so-models-hero-640.webp 640w, /images/hero/so-models-hero-1254.webp 1254w"
                  sizes="(max-width: 1023px) calc(100vw - 28px), min(46vw, 620px)"
                />
                <img
                  className="hero-visual-image"
                  src="/images/hero/so-models-hero.png"
                  alt="Cinco mulheres adultas em um lounge sofisticado"
                  width="1254"
                  height="1254"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              </picture>
            </figure>
          </div>
        </section>
        <section id="explorar" className="container pb-20">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Explorar</p>
              <h2 className="font-display text-3xl md:text-4xl">
                Escolha quem combina com o seu momento
              </h2>
            </div>
            <span className="text-sm text-white/45">
              {publicOpen
                ? isLoading
                  ? "Consultando…"
                  : `${profiles.length} perfil(is) encontrado(s)`
                : "Vitrine protegida"}
            </span>
          </div>
          {!publicOpen ? (
            <Card className="mt-6 border-[#ff4764]/25 bg-[#ff4764]/10">
              <CardContent className="flex gap-4 p-6">
                <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-[#ff4764]" />
                <div>
                  <h3 className="font-semibold">
                    A vitrine está temporariamente protegida
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
                    O acesso público só é liberado quando a verificação de idade
                    e as configurações de lançamento estão prontas. Nenhuma
                    autodeclaração substitui uma verificação real.
                  </p>
                  <p className="mt-3 text-xs text-white/45">
                    O painel administrativo permanece disponível para
                    configuração e moderação.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="filter-card mt-6">
                <CardContent className="p-4 md:p-6">
                  <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-white/40" />
                      <Input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar por nome ou palavra-chave"
                        className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/35"
                      />
                    </div>
                    <Select value={city} onValueChange={setCity}>
                      <SelectTrigger className="border-white/10 bg-white/5 text-white">
                        <MapPin className="mr-2 h-4 w-4 text-[#ff4764]" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map(value => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="border-white/10 bg-white/5 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(value => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={attribute} onValueChange={setAttribute}>
                      <SelectTrigger className="border-white/10 bg-white/5 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {attributes.map(value => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearFilters}
                      aria-label="Limpar filtros"
                      className="border-white/10 bg-white/5 text-white"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {profiles.length === 0 && !isLoading ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <Search className="h-7 w-7" />
                  </div>
                  <h3>Nenhum perfil encontrado com esses filtros</h3>
                  <p>Ajuste sua busca ou explore outra cidade.</p>
                  <Button
                    type="button"
                    onClick={clearFilters}
                    className="mt-5 bg-[#ff4764] text-[#222222]"
                  >
                    Limpar filtros
                  </Button>
                </div>
              ) : (
                <div className="profile-grid">
                  {profiles.map(profile => (
                    <Link key={profile.id} href={`/perfil/${profile.slug}`}>
                      <Card className="profile-card">
                        <div
                          className="profile-image"
                          style={
                            profile.avatarUrl
                              ? { backgroundImage: `url(${profile.avatarUrl})` }
                              : undefined
                          }
                        >
                          <span className="profile-fallback">
                            {profile.stageName.slice(0, 1)}
                          </span>
                          <div className="absolute left-3 top-3 flex gap-2">
                            {profile.isFeatured && (
                              <Badge className="bg-[#ff4764] text-[#222222]">
                                Destaque
                              </Badge>
                            )}
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold">
                                {profile.stageName}
                                {profile.age ? (
                                  <span className="ml-2 text-sm font-normal text-white/45">
                                    {profile.age}
                                  </span>
                                ) : null}
                              </h3>
                              <p className="mt-1 text-sm text-white/50">
                                <MapPin className="mr-1 inline h-3.5 w-3.5" />
                                {profile.city}
                                {profile.region ? `, ${profile.region}` : ""}
                              </p>
                            </div>
                            <ShieldCheck className="h-5 w-5 text-[#ff4764]" />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {profile.categories
                              .slice(0, 3)
                              .map((tag: string) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="border-white/15 text-white/60"
                                >
                                  {tag}
                                </Badge>
                              ))}
                          </div>
                          <p
                            className={`mt-4 text-xs uppercase tracking-[.12em] ${profile.isAvailableNow ? "text-[#ff9a8e]" : "text-white/40"}`}
                          >
                            <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                            {profile.isAvailableNow
                              ? "Disponível agora"
                              : profile.availabilityLabel ||
                                "Consulte disponibilidade"}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
        <section
          id="como-funciona"
          className="border-t border-white/10 bg-[#292929]"
        >
          <div className="container py-16">
            <div className="max-w-2xl">
              <p className="eyebrow">Como funciona</p>
              <h2 className="font-display text-4xl">
                Uma vitrine direta, feita para escolher no seu ritmo.
              </h2>
            </div>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              <div>
                <span className="step-number">01</span>
                <h3 className="mt-4 text-lg font-semibold">
                  Explore por cidade
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Use a busca para encontrar perfis, estilos e disponibilidades
                  que fazem sentido para você.
                </p>
              </div>
              <div>
                <span className="step-number">02</span>
                <h3 className="mt-4 text-lg font-semibold">Veja os detalhes</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Abra o perfil individual para conhecer preferências, idiomas,
                  galeria e informações públicas.
                </p>
              </div>
              <div>
                <span className="step-number">03</span>
                <h3 className="mt-4 text-lg font-semibold">
                  Revise antes de decidir
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Leia as informações públicas de cada perfil e entre em contato
                  somente quando se sentir seguro para decidir.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section id="seguranca" className="border-t border-white/10">
          <div className="container grid gap-8 py-16 md:grid-cols-3">
            <div>
              <Sparkles className="h-7 w-7 text-[#ff4764]" />
              <h3 className="mt-4 text-lg font-semibold">
                Escolha do seu jeito
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Explore fotos, estilos, preferências e informações para
                encontrar o perfil que mais combina com o seu momento.
              </p>
            </div>
            <div>
              <MapPin className="h-7 w-7 text-[#ff4764]" />
              <h3 className="mt-4 text-lg font-semibold">
                Acompanhantes na sua cidade
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Use os filtros para encontrar opções por cidade, categoria e
                disponibilidade.
              </p>
            </div>
            <div>
              <ShieldCheck className="h-7 w-7 text-[#ff4764]" />
              <h3 className="mt-4 text-lg font-semibold">
                Contatos sob controle
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Consulte os canais disponibilizados em cada perfil e preserve
                sempre a sua privacidade.
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="container flex flex-col gap-3 border-t border-white/10 py-8 text-sm text-white/40 md:flex-row md:justify-between">
        <span>© 2026 Só Models</span>
        <span>Conteúdo para maiores de 18 anos. Use com responsabilidade.</span>
      </footer>
    </div>
  );
}
