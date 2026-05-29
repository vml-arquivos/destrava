import Header from "@/components/Header";
import SEO, { serviceStructuredData } from "@/components/SEO";
import Footer from "@/components/Footer";
import CTAButton from "@/components/CTAButton";
import {
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  DollarSign,
  Calendar,
  Percent,
  Building2,
} from "lucide-react";

export default function GiroCaixaFacil() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <SEO
        title="Giro CAIXA Fácil — Crédito para Capital de Giro"
        description="Linha de crédito Giro CAIXA Fácil para capital de giro empresarial. Taxas competitivas, processo simplificado. Simule agora."
        keywords="Giro CAIXA Fácil, capital de giro, crédito empresarial, CAIXA"
        structuredData={serviceStructuredData("Giro CAIXA Fácil", "Linha de crédito para capital de giro empresarial com taxas competitivas e processo simplificado.")}
      />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white py-20">
        <div className="container">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Giro CAIXA Fácil
            </h1>
            <p className="text-xl text-white/90 leading-relaxed mb-8">
              Linha de crédito empresarial da CAIXA Econômica Federal para
              capital de giro, com assessoria completa da Destrava Crédito.
            </p>
            <CTAButton variant="secondary" size="lg">
              Simular Agora
            </CTAButton>
          </div>
        </div>
      </section>

      {/* Características Principais */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Características do Produto
            </h2>
            <p className="text-lg text-muted-foreground">
              Conheça os detalhes da linha de crédito
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <DollarSign className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Valor</h3>
              <p className="text-2xl font-bold text-primary mb-2">
                Até R$ 70.000
              </p>
              <p className="text-sm text-muted-foreground">
                Conforme análise de crédito
              </p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Percent className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Taxa de Juros</h3>
              <p className="text-2xl font-bold text-primary mb-2">
                A partir de 3% a.m.*
              </p>
              <p className="text-sm text-muted-foreground">Varia por perfil</p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Calendar className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Prazo</h3>
              <p className="text-2xl font-bold text-primary mb-2">
                Até 36 meses
              </p>
              <p className="text-sm text-muted-foreground">Para pagamento</p>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border text-center">
              <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">Público</h3>
              <p className="text-2xl font-bold text-primary mb-2">MEI e ME</p>
              <p className="text-sm text-muted-foreground">
                Micro e pequenas empresas
              </p>
            </div>
          </div>

          <div className="bg-[var(--color-caixa-yellow)]/10 border-l-4 border-[var(--color-caixa-yellow)] p-6 rounded">
            <div className="flex gap-3">
              <AlertCircle className="h-6 w-6 text-[var(--color-caixa-yellow)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-2">Importante:</p>
                <p className="text-sm text-muted-foreground">
                  Todas as condições estão sujeitas à análise e aprovação da
                  CAIXA Econômica Federal. Os valores, taxas e prazos podem
                  variar conforme o perfil do cliente e a política de crédito
                  vigente.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Para que usar */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center">
              Para que você pode usar o crédito?
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-card p-6 rounded-lg border border-border">
                <CheckCircle2 className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">Capital de Giro</h3>
                <p className="text-muted-foreground text-sm">
                  Manter o fluxo de caixa saudável e cobrir despesas operacionais
                  do dia a dia.
                </p>
              </div>

              <div className="bg-card p-6 rounded-lg border border-border">
                <CheckCircle2 className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">Compra de Estoque</h3>
                <p className="text-muted-foreground text-sm">
                  Repor mercadorias, aproveitar oportunidades de compra e
                  negociar melhores condições com fornecedores.
                </p>
              </div>

              <div className="bg-card p-6 rounded-lg border border-border">
                <CheckCircle2 className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">Pagamento de Fornecedores</h3>
                <p className="text-muted-foreground text-sm">
                  Regularizar pendências e manter bom relacionamento com
                  parceiros comerciais.
                </p>
              </div>

              <div className="bg-card p-6 rounded-lg border border-border">
                <CheckCircle2 className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">Folha de Pagamento</h3>
                <p className="text-muted-foreground text-sm">
                  Garantir o pagamento de colaboradores em períodos de baixa
                  receita ou sazonalidade.
                </p>
              </div>

              <div className="bg-card p-6 rounded-lg border border-border">
                <CheckCircle2 className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">Investimentos Pontuais</h3>
                <p className="text-muted-foreground text-sm">
                  Realizar pequenas melhorias, manutenções ou aquisições
                  necessárias para o negócio.
                </p>
              </div>

              <div className="bg-card p-6 rounded-lg border border-border">
                <CheckCircle2 className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">Aproveitar Oportunidades</h3>
                <p className="text-muted-foreground text-sm">
                  Ter recursos disponíveis para aproveitar oportunidades de
                  negócio que surgem inesperadamente.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Requisitos */}
      <section className="py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
              Requisitos e Documentação
            </h2>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* Quem pode solicitar */}
              <div>
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                  Quem pode solicitar
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      MEI (Microempreendedor Individual)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Microempresas (ME)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Empresa com CNPJ ativo há pelo menos 12 meses
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Faturamento compatível com o porte
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Sem restrições graves no CPF/CNPJ
                    </span>
                  </li>
                </ul>
              </div>

              {/* Quem NÃO pode solicitar */}
              <div>
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <XCircle className="h-6 w-6 text-destructive" />
                  Restrições comuns
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Empresas com CNPJ inativo ou irregular
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Sócios com restrições graves no CPF
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Inadimplência com a CAIXA ou outros bancos públicos
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Empresas com menos de 12 meses de atividade
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Atividades econômicas não elegíveis pela CAIXA
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Documentação */}
            <div className="bg-card p-8 rounded-lg border-2 border-border">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                Documentação Geralmente Solicitada
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-bold mb-3">Documentos da Empresa:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• Cartão CNPJ atualizado</li>
                    <li>• Contrato Social ou Requerimento de MEI</li>
                    <li>• Últimas declarações de faturamento (DASN-SIMEI ou DEFIS)</li>
                    <li>• Extratos bancários dos últimos 3 meses</li>
                    <li>• Comprovante de endereço da empresa</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold mb-3">Documentos dos Sócios:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• RG e CPF</li>
                    <li>• Comprovante de residência</li>
                    <li>• Declaração de Imposto de Renda (se houver)</li>
                    <li>• Certidões negativas (podem ser solicitadas)</li>
                  </ul>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-6 pt-6 border-t border-border">
                <strong>Nota:</strong> A documentação pode variar conforme o
                perfil do cliente e a análise da CAIXA. A Destrava Crédito
                orienta sobre os documentos específicos para o seu caso.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 bg-gradient-to-br from-primary to-[var(--color-caixa-blue-dark)] text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Pronto para solicitar seu Giro CAIXA Fácil?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Faça uma simulação gratuita e nossa equipe entrará em contato para
            orientar todo o processo.
          </p>
          <CTAButton variant="secondary" size="lg">
            Fazer Simulação Gratuita
          </CTAButton>
        </div>
      </section>

      <Footer />
    </div>
  );
}
