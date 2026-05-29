import Header from "@/components/Header";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";

export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <SEO
        title="Política de Privacidade — Destrava Crédito"
        description="Leia a política de privacidade da Destrava Crédito e saiba como seus dados são tratados."
        keywords="política de privacidade, LGPD, dados pessoais"
      />

      <section className="py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-8">Política de Privacidade</h1>
            <p className="text-sm text-muted-foreground mb-12">
              Última atualização: Janeiro de 2024
            </p>

            <div className="prose prose-lg max-w-none space-y-8">
              <section>
                <h2 className="text-2xl font-bold mb-4">1. Introdução</h2>
                <p className="text-muted-foreground leading-relaxed">
                  A Destrava Crédito, atuando como correspondente bancário
                  autorizado, está comprometida com a proteção da privacidade e
                  dos dados pessoais de seus clientes e usuários. Esta Política
                  de Privacidade descreve como coletamos, usamos, armazenamos e
                  protegemos suas informações pessoais, em conformidade com a
                  Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018) e
                  demais legislações aplicáveis.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  2. Informações que Coletamos
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Coletamos as seguintes categorias de informações:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>Dados Cadastrais:</strong> nome completo, CPF, RG,
                    data de nascimento, endereço, telefone, e-mail
                  </li>
                  <li>
                    <strong>Dados Empresariais:</strong> CNPJ, razão social,
                    endereço da empresa, faturamento, documentos societários
                  </li>
                  <li>
                    <strong>Dados Financeiros:</strong> informações sobre
                    faturamento, extratos bancários, declarações fiscais
                  </li>
                  <li>
                    <strong>Dados de Navegação:</strong> endereço IP, tipo de
                    navegador, páginas visitadas, tempo de permanência
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  3. Como Utilizamos suas Informações
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Utilizamos suas informações para as seguintes finalidades:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    Intermediar solicitações de crédito junto à CAIXA Econômica
                    Federal
                  </li>
                  <li>
                    Prestar assessoria e orientação sobre produtos de crédito
                  </li>
                  <li>Realizar análises preliminares de perfil de crédito</li>
                  <li>
                    Entrar em contato para esclarecimentos e acompanhamento de
                    solicitações
                  </li>
                  <li>
                    Cumprir obrigações legais e regulatórias do setor financeiro
                  </li>
                  <li>
                    Melhorar nossos serviços e a experiência do usuário em nosso
                    site
                  </li>
                  <li>
                    Enviar comunicações sobre nossos serviços (com seu
                    consentimento)
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  4. Compartilhamento de Informações
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Suas informações podem ser compartilhadas nas seguintes
                  situações:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>Com a CAIXA Econômica Federal:</strong> para análise
                    e processamento de solicitações de crédito
                  </li>
                  <li>
                    <strong>Com prestadores de serviços:</strong> que nos
                    auxiliam em atividades operacionais, sempre mediante
                    contratos de confidencialidade
                  </li>
                  <li>
                    <strong>Por determinação legal:</strong> quando exigido por
                    autoridades competentes ou para cumprimento de obrigações
                    legais
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  <strong>Importante:</strong> Não vendemos, alugamos ou
                  comercializamos suas informações pessoais para terceiros.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  5. Segurança das Informações
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Implementamos medidas técnicas e organizacionais adequadas para
                  proteger suas informações contra acesso não autorizado, perda,
                  destruição ou alteração. Isso inclui criptografia de dados,
                  controles de acesso, firewalls e monitoramento constante de
                  nossos sistemas. No entanto, nenhum método de transmissão pela
                  internet ou armazenamento eletrônico é 100% seguro, e não
                  podemos garantir segurança absoluta.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  6. Retenção de Dados
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Mantemos suas informações pessoais pelo tempo necessário para
                  cumprir as finalidades descritas nesta política, salvo quando
                  um período de retenção mais longo for exigido ou permitido por
                  lei. Após o término do período de retenção, seus dados serão
                  excluídos ou anonimizados de forma segura.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">7. Seus Direitos</h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  De acordo com a LGPD, você tem os seguintes direitos em relação
                  aos seus dados pessoais:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>Confirmar a existência de tratamento de dados</li>
                  <li>Acessar seus dados pessoais</li>
                  <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
                  <li>
                    Solicitar a anonimização, bloqueio ou eliminação de dados
                    desnecessários
                  </li>
                  <li>Solicitar a portabilidade de dados</li>
                  <li>Revogar o consentimento</li>
                  <li>Obter informações sobre compartilhamento de dados</li>
                </ul>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  Para exercer seus direitos, entre em contato conosco através
                  do e-mail: destravacreditooficial@gmail.com
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">8. Cookies</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Utilizamos cookies e tecnologias similares para melhorar sua
                  experiência em nosso site, analisar o tráfego e personalizar
                  conteúdo. Você pode configurar seu navegador para recusar
                  cookies, mas isso pode afetar algumas funcionalidades do site.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  9. Menores de Idade
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Nossos serviços são destinados exclusivamente a pessoas maiores
                  de 18 anos. Não coletamos intencionalmente informações de
                  menores de idade. Se tomarmos conhecimento de que coletamos
                  dados de menores, tomaremos medidas para excluí-los
                  imediatamente.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">
                  10. Alterações nesta Política
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Podemos atualizar esta Política de Privacidade periodicamente.
                  Recomendamos que você revise esta página regularmente para se
                  manter informado sobre como protegemos suas informações.
                  Alterações significativas serão comunicadas através de nosso
                  site ou por e-mail.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold mb-4">11. Contato</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Se você tiver dúvidas, preocupações ou solicitações
                  relacionadas a esta Política de Privacidade ou ao tratamento de
                  seus dados pessoais, entre em contato conosco:
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
                <p className="text-sm text-muted-foreground italic">
                  Esta Política de Privacidade foi elaborada em conformidade com
                  a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018) e
                  demais normas aplicáveis ao setor financeiro e de
                  correspondentes bancários.
                </p>
              </section>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
