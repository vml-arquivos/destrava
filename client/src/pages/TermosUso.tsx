import Header from "@/components/Header";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";

export default function TermosUso() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <SEO
        title="Termos de Uso — Destrava Crédito"
        description="Leia os termos de uso da plataforma Destrava Crédito."
        keywords="termos de uso, condições, Destrava Crédito"
      />

      <section className="py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-8">Termos de Uso</h1>
            <p className="text-sm text-muted-foreground mb-12">
              Última atualização: Janeiro de 2024
            </p>

            <div className="prose prose-lg max-w-none space-y-8">
              <section>
                <h2 className="text-2xl font-bold mb-4">
                  1. Aceitação dos Termos
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Ao acessar e utilizar o site da Destrava Crédito, você concorda
                  em cumprir e estar vinculado aos presentes Termos de Uso. Se
                  você não concorda com estes termos, não deve utilizar nosso
                  site ou serviços. Reservamo-nos o direito de modificar estes
                  termos a qualquer momento, sendo sua responsabilidade
                  revisá-los periodicamente.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  2. Sobre a Destrava Crédito
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  A Destrava Crédito atua exclusivamente como{" "}
                  <strong>correspondente bancário / assessoria</strong>,
                  intermediando operações de crédito entre clientes e a CAIXA
                  Econômica Federal. Não somos uma instituição financeira e não
                  realizamos análise, aprovação ou concessão de crédito. Todas as
                  decisões de crédito são de responsabilidade exclusiva da CAIXA
                  Econômica Federal.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">3. Serviços Oferecidos</h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  A Destrava Crédito oferece os seguintes serviços:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    Orientação sobre produtos de crédito empresarial da CAIXA
                  </li>
                  <li>Assessoria na preparação de documentação</li>
                  <li>
                    Intermediação de solicitações de crédito junto à CAIXA
                  </li>
                  <li>
                    Acompanhamento do processo de análise e aprovação (quando
                    aplicável)
                  </li>
                  <li>
                    Esclarecimento de dúvidas sobre linhas de crédito
                    disponíveis
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  4. Limitações e Responsabilidades
                </h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    <strong>4.1. Não garantimos aprovação:</strong> A Destrava
                    Crédito não garante a aprovação de crédito. A decisão final é
                    sempre da CAIXA Econômica Federal, baseada em sua política de
                    crédito e análise individual de cada caso.
                  </p>
                  <p>
                    <strong>4.2. Condições de crédito:</strong> Taxas de juros,
                    prazos, valores e demais condições são determinados pela
                    CAIXA e podem variar conforme o perfil do cliente e a
                    política vigente.
                  </p>
                  <p>
                    <strong>4.3. Informações fornecidas:</strong> Você é
                    responsável pela veracidade e exatidão das informações e
                    documentos fornecidos. Informações falsas ou incorretas podem
                    resultar na negativa de crédito e em medidas legais
                    cabíveis.
                  </p>
                  <p>
                    <strong>4.4. Prazos:</strong> Os prazos mencionados são
                    estimativas e podem variar conforme a complexidade de cada
                    caso e a demanda da instituição financeira.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">5. Uso do Site</h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Ao utilizar nosso site, você concorda em:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    Fornecer informações verdadeiras, precisas e atualizadas
                  </li>
                  <li>
                    Não utilizar o site para fins ilegais ou não autorizados
                  </li>
                  <li>
                    Não tentar acessar áreas restritas ou comprometer a segurança
                    do site
                  </li>
                  <li>
                    Não transmitir vírus, malware ou qualquer código malicioso
                  </li>
                  <li>
                    Respeitar os direitos de propriedade intelectual do conteúdo
                    do site
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  6. Propriedade Intelectual
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Todo o conteúdo do site, incluindo textos, gráficos, logotipos,
                  ícones, imagens e software, é de propriedade da Destrava
                  Crédito ou de seus fornecedores de conteúdo e está protegido
                  pelas leis de direitos autorais e propriedade intelectual. É
                  proibida a reprodução, distribuição ou modificação do conteúdo
                  sem autorização prévia por escrito.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  7. Isenção de Garantias
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  O site e os serviços são fornecidos "como estão", sem garantias
                  de qualquer tipo, expressas ou implícitas. Não garantimos que o
                  site estará sempre disponível, livre de erros ou que atenderá a
                  requisitos específicos. Não nos responsabilizamos por
                  interrupções, erros ou falhas no funcionamento do site.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  8. Limitação de Responsabilidade
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  A Destrava Crédito não será responsável por quaisquer danos
                  diretos, indiretos, incidentais, consequenciais ou punitivos
                  decorrentes do uso ou impossibilidade de uso do site ou dos
                  serviços, incluindo, mas não se limitando a, perda de lucros,
                  dados ou outras perdas intangíveis.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">9. Links Externos</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Nosso site pode conter links para sites de terceiros. Não somos
                  responsáveis pelo conteúdo, políticas de privacidade ou
                  práticas de sites de terceiros. O acesso a esses sites é por
                  sua conta e risco.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  10. Privacidade e Proteção de Dados
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  O tratamento de seus dados pessoais é regido por nossa{" "}
                  <a
                    href="/politica-privacidade"
                    className="text-primary underline hover:text-primary/80"
                  >
                    Política de Privacidade
                  </a>
                  , que faz parte integrante destes Termos de Uso. Ao utilizar
                  nosso site, você também concorda com os termos da Política de
                  Privacidade.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">11. Rescisão</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Reservamo-nos o direito de suspender ou encerrar seu acesso ao
                  site a qualquer momento, sem aviso prévio, caso você viole
                  estes Termos de Uso ou por qualquer outro motivo que
                  consideremos apropriado.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  12. Modificações dos Termos
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Podemos modificar estes Termos de Uso a qualquer momento. As
                  modificações entrarão em vigor imediatamente após sua
                  publicação no site. Seu uso continuado do site após as
                  modificações constitui sua aceitação dos novos termos.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  13. Lei Aplicável e Jurisdição
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Estes Termos de Uso são regidos pelas leis da República
                  Federativa do Brasil. Quaisquer disputas decorrentes destes
                  termos serão submetidas à jurisdição exclusiva dos tribunais
                  brasileiros.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">14. Contato</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Se você tiver dúvidas sobre estes Termos de Uso, entre em
                  contato conosco:
                </p>
                <div className="mt-4 p-6 bg-muted/50 rounded-lg">
                  <p className="font-semibold mb-2">Destrava Crédito</p>
                  <p className="text-sm text-muted-foreground">
                    E-mail: destravacreditooficial@gmail.com
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Telefone: (11) 9 9999-9999
                  </p>
                </div>
              </section>

              <section className="border-t border-border pt-8 mt-8">
                <div className="bg-[var(--color-caixa-yellow)]/10 border-l-4 border-[var(--color-caixa-yellow)] p-6 rounded">
                  <p className="text-sm font-semibold mb-2">
                    Aviso Legal Importante:
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Todas as operações de crédito estão sujeitas à análise e
                    aprovação da CAIXA Econômica Federal. As condições de
                    crédito, taxas de juros e prazos variam conforme o perfil do
                    cliente e a política de crédito vigente. A Destrava Crédito
                    atua exclusivamente como Correspondente Bancário / Assessoria,
                    não sendo responsável pela aprovação ou concessão de crédito.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
