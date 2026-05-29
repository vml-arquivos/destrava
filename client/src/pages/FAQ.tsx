import { useState, useMemo } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FAQSchema from "@/components/FAQSchema";
import SEO from "@/components/SEO";

import { faqData, FAQItem } from "@/data/faqData";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Search, HelpCircle, TrendingUp } from "lucide-react";

const categoryLabels = {
  "credito": "Crédito Geral",
  "limpeza-nome": "Limpeza de Nome",
  "restauracao": "Restauração de Crédito",
  "empresarial": "Crédito Empresarial",
};

const categoryColors = {
  "credito": "bg-blue-50 border-blue-200",
  "limpeza-nome": "bg-green-50 border-green-200",
  "restauracao": "bg-purple-50 border-purple-200",
  "empresarial": "bg-orange-50 border-orange-200",
};

const categoryIcons = {
  "credito": "💳",
  "limpeza-nome": "✨",
  "restauracao": "📈",
  "empresarial": "🏢",
};

export default function FAQ() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filtrar FAQs baseado em busca e categoria
  const filteredFAQs = useMemo(() => {
    return faqData.filter((faq) => {
      const matchesSearch =
        searchTerm === "" ||
        faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.keywords.some((k) =>
          k.toLowerCase().includes(searchTerm.toLowerCase())
        );

      const matchesCategory =
        selectedCategory === null || faq.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  // Agrupar FAQs por categoria
  const groupedFAQs = useMemo(() => {
    const groups: Record<string, FAQItem[]> = {
      "credito": [],
      "limpeza-nome": [],
      "restauracao": [],
      "empresarial": [],
    };

    filteredFAQs.forEach((faq) => {
      groups[faq.category].push(faq);
    });

    return groups;
  }, [filteredFAQs]);

  return (
    <div className="min-h-screen flex flex-col">
      <FAQSchema />
      <Header />
      <SEO
        title="FAQ — Perguntas Frequentes sobre Crédito Empresarial"
        description="Tire suas dúvidas sobre crédito empresarial, PRONAMPE, FAMPE, FCO, Giro CAIXA Fácil e outros produtos da Destrava Crédito."
        keywords="FAQ, crédito empresarial, dúvidas, PRONAMPE, FAMPE, FCO"
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] py-8 md:py-16 text-white">
        <div className="container px-4 md:px-6">
          <div className="flex items-center gap-2 md:gap-4 mb-4 md:mb-6">
            <div className="bg-[var(--color-caixa-yellow)] p-2 md:p-3 rounded-lg">
              <HelpCircle className="h-6 md:h-8 w-6 md:w-8 text-[var(--color-caixa-blue)]" />
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">Perguntas Frequentes</h1>
          </div>
          <p className="text-sm md:text-base lg:text-lg text-white/90 max-w-2xl">
            Encontre respostas para as dúvidas mais comuns sobre crédito, empréstimos, limpeza de nome e restauração de crédito.
          </p>
        </div>
      </section>

      {/* Busca */}
      <section className="bg-gray-50 py-6 md:py-8 border-b border-gray-200">
        <div className="container px-4 md:px-6">
          <div className="max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3 md:left-4 top-2.5 md:top-3.5 h-4 md:h-5 w-4 md:w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Busque por palavra-chave (ex: 'crédito', 'taxa')..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 md:pl-12 py-2 md:py-3 text-sm md:text-base"
              />
            </div>
            <p className="text-xs md:text-sm text-gray-600 mt-2 md:mt-3">
              Encontrados {filteredFAQs.length} resultados
            </p>
          </div>
        </div>
      </section>

      {/* Filtro por Categoria */}
      <section className="py-6 md:py-8 border-b border-gray-200">
        <div className="container px-4 md:px-6">
          <p className="text-xs md:text-sm font-semibold text-gray-700 mb-3 md:mb-4">
            Filtrar por categoria:
          </p>
          <div className="flex flex-wrap gap-2 md:gap-3">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              onClick={() => setSelectedCategory(null)}
              className={
                selectedCategory === null
                  ? "bg-[var(--color-caixa-blue)]"
                  : ""
              }
            >
              Todas as categorias
            </Button>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <Button
                key={key}
                variant={selectedCategory === key ? "default" : "outline"}
                onClick={() =>
                  setSelectedCategory(selectedCategory === key ? null : key)
                }
                className={
                  selectedCategory === key
                    ? "bg-[var(--color-caixa-blue)]"
                    : ""
                }
              >
                {categoryIcons[key as keyof typeof categoryIcons]} {label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs por Categoria */}
      <section className="py-8 md:py-12 flex-grow">
        <div className="container px-4 md:px-6">
          {filteredFAQs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg mb-4">
                Nenhuma pergunta encontrada para sua busca.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory(null);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          ) : (
            <div className="space-y-12">
              {Object.entries(groupedFAQs).map(([category, faqs]) => {
                if (faqs.length === 0) return null;

                return (
                  <div key={category}>
                    <div
                      className={`p-4 rounded-lg border-2 mb-6 ${
                        categoryColors[category as keyof typeof categoryColors]
                      }`}
                    >
                      <h2 className="text-2xl font-bold text-gray-800">
                        {categoryIcons[category as keyof typeof categoryIcons]}{" "}
                        {
                          categoryLabels[
                            category as keyof typeof categoryLabels
                          ]
                        }
                      </h2>
                      <p className="text-gray-600 mt-1">
                        {faqs.length} pergunta{faqs.length !== 1 ? "s" : ""}
                      </p>
                    </div>

                    <Accordion type="single" collapsible className="space-y-3">
                      {faqs.map((faq) => (
                        <AccordionItem
                          key={faq.id}
                          value={faq.id}
                          className="border border-gray-200 rounded-lg px-4 hover:border-[var(--color-caixa-yellow)] transition-colors"
                        >
                          <AccordionTrigger className="hover:text-[var(--color-caixa-blue)] font-semibold text-left">
                            {faq.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-gray-700 whitespace-pre-wrap">
                            {faq.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA Final */}
      <section className="bg-gradient-to-r from-[var(--color-caixa-blue)] to-[var(--color-caixa-blue-dark)] py-8 md:py-12 text-white">
        <div className="container px-4 md:px-6 text-center">
          <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-4">
            <TrendingUp className="h-5 md:h-6 w-5 md:w-6" />
            <h2 className="text-2xl md:text-3xl font-bold">Ainda tem dúvidas?</h2>
          </div>
          <p className="text-sm md:text-base lg:text-lg text-white/90 mb-6 md:mb-8 max-w-2xl mx-auto">
            Fale com um especialista da Destrava Crédito. Estamos prontos para orientar você na melhor solução de crédito para seu negócio.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 justify-center">
            <a href="/simulacao">
              <Button
                className="bg-[var(--color-caixa-yellow)] text-[var(--color-caixa-blue)] hover:bg-[var(--color-caixa-yellow)]/90 font-bold text-sm md:text-base py-2 md:py-3 px-4 md:px-6"
              >
                Simular Agora
              </Button>
            </a>
            <a
              href="https://wa.me/556135268355?text=Ol%C3%A1! Gostaria de tirar algumas d%C3%BAvidas sobre cr%C3%A9dito."
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                className="bg-white text-[var(--color-caixa-blue)] hover:bg-gray-100 font-bold text-sm md:text-base py-2 md:py-3 px-4 md:px-6"
              >
                Falar no WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
