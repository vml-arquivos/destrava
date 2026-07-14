import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import CargoRoute from "./components/CargoRoute";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { AnalyticsObserver } from "@/lib/analytics";
import { RouteSeoDefaults } from "@/components/SEO";
import ConsentBanner from "@/components/ConsentBanner";

const Home = lazy(() => import("./pages/Home"));
const Sobre = lazy(() => import("./pages/Sobre"));
const Simulacao = lazy(() => import("./pages/Simulacao"));
const SimuladorCompleto = lazy(() => import("./pages/SimuladorCompleto"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const PoliticaPrivacidade = lazy(() => import("./pages/PoliticaPrivacidade"));
const TermosUso = lazy(() => import("./pages/TermosUso"));
const Sucesso = lazy(() => import("./pages/Sucesso"));
const CapturaLead = lazy(() => import("./pages/CapturaLead"));
const SimuladorPublico = lazy(() => import("./pages/SimuladorPublico"));
const RatingBancoBrasil = lazy(() => import("./pages/RatingBancoBrasil"));
const RatingBancoCentral = lazy(() => import("./pages/RatingBancoCentral"));
const Pronampe = lazy(() => import("./pages/Pronampe"));
const Procred360 = lazy(() => import("./pages/Procred360"));
const PeacFgi = lazy(() => import("./pages/PeacFgi"));
const Fco = lazy(() => import("./pages/Fco"));
const Fampe = lazy(() => import("./pages/Fampe"));
const GiroCaixaFacilLP = lazy(() => import("./pages/GiroCaixaFacilLP"));
const CertificadoDigital = lazy(() => import("./pages/CertificadoDigital"));
const CertificadoDigitalA1 = lazy(() => import("./pages/CertificadoDigitalA1"));
const ConsultaSPCSerasa = lazy(() => import("./pages/ConsultaSPCSerasa"));
const CreditoEmpresas = lazy(() => import("./pages/CreditoEmpresas"));
const CreditoPessoaFisica = lazy(() => import("./pages/CreditoPessoaFisica"));
const Contato = lazy(() => import("./pages/Contato"));
const Cgi = lazy(() => import("./pages/Cgi"));
const CalculadoraScore = lazy(() => import("./pages/CalculadoraScore"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Área do colaborador: carregada somente após navegação para o CRM.
const ColaboradorLogin = lazy(() => import("./pages/colaborador/Login"));
const RecuperarSenha = lazy(() => import("./pages/colaborador/RecuperarSenha"));
const RedefinirSenha = lazy(() => import("./pages/colaborador/RedefinirSenha"));
const MeuPerfil = lazy(() => import("./pages/colaborador/MeuPerfil"));
const ColaboradorDashboard = lazy(() => import("./pages/colaborador/Dashboard"));
const ColaboradorCalculadora = lazy(() => import("./pages/colaborador/CalculadoraPage"));
const ColaboradorSimulacoes = lazy(() => import("./pages/colaborador/Simulacoes"));
const ColaboradorUsuarios = lazy(() => import("./pages/colaborador/Usuarios"));
const ColaboradorClientes = lazy(() => import("./pages/colaborador/Clientes"));
const ColaboradorIntegracoes = lazy(() => import("./pages/colaborador/Integracoes"));
const AssessoriaIA = lazy(() => import("./pages/colaborador/AssessoriaIA"));
const DiagnosticoCredito = lazy(() => import("./pages/colaborador/DiagnosticoCredito"));
const PrevisaoFaturamento = lazy(() => import("./pages/colaborador/PrevisaoFaturamento"));
const GeradorContratos = lazy(() => import("./pages/colaborador/GeradorContratos"));
const ColaboradorOrcamentos = lazy(() => import("./pages/colaborador/Orcamentos"));
const ColaboradorCRM = lazy(() => import("./pages/colaborador/CRM"));
const ColaboradorEmpresas = lazy(() => import("./pages/colaborador/Empresas"));
const AcervoDocumentalEmpresa = lazy(() => import("./pages/colaborador/AcervoDocumentalEmpresa"));
const RelatorioEmpresas = lazy(() => import("./pages/colaborador/RelatorioEmpresas"));
const ColaboradorTriagem = lazy(() => import("./pages/colaborador/Triagem"));
const ColaboradorFila = lazy(() => import("./pages/colaborador/Fila"));
const ColaboradorMeuCRM = lazy(() => import("./pages/colaborador/MeuCRM"));
const Contadores = lazy(() => import("./pages/colaborador/Contadores"));
const AcompanhamentoBancario = lazy(() => import("./pages/colaborador/AcompanhamentoBancario"));
const AcompanhamentoFinanceiro = lazy(() => import("./pages/colaborador/AcompanhamentoFinanceiro"));
const WeeklyMonitorPage = lazy(() => import("./pages/colaborador/WeeklyMonitorPage"));
const CadastroEmpresa = lazy(() => import("./pages/colaborador/CadastroEmpresa"));
const DadosIncompletos = lazy(() => import("./pages/colaborador/DadosIncompletos"));
const ConfiguracaoFuncoes = lazy(() => import("./pages/colaborador/ConfiguracaoFuncoes"));
const Layout = lazy(() => import("./pages/colaborador/Layout"));

function FeatureGate({
  featureKey,
  children,
}: {
  featureKey: string;
  children: React.ReactNode;
}) {
  const { loading, isFeatureEnabled } = useFeatureAccess();
  if (loading) return <>{children}</>;
  if (isFeatureEnabled(featureKey)) return <>{children}</>;
  return (
    <Layout title="Função indisponível">
      <div className="min-h-full bg-slate-50 p-6">
        <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-amber-600">
            Acesso controlado
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Função oculta para este usuário
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Esta função foi ocultada na configuração administrativa de menu e
            funções. Peça ao administrador para liberar o acesso caso precise
            utilizar este módulo.
          </p>
        </div>
      </div>
    </Layout>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status" aria-live="polite">
      <span className="sr-only">Carregando página...</span>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#0033A0]" aria-hidden="true" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Páginas principais */}
      <Route path="/" component={Home} />
      <Route path="/sobre" component={Sobre} />
      <Route path="/produtos" component={Produtos} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/faq" component={FAQ} />
      <Route path="/contato" component={Contato} />

      {/* Simuladores */}
      <Route path="/simulacao" component={Simulacao} />
      <Route path="/simulador" component={SimuladorCompleto} />
      <Route path="/simular" component={SimuladorPublico} />

      {/* Crédito Empresarial */}
      <Route path="/credito-empresas" component={CreditoEmpresas} />
      <Route path="/giro-caixa-facil" component={GiroCaixaFacilLP} />
      <Route path="/pronampe" component={Pronampe} />
      <Route path="/procred360" component={Procred360} />
      <Route path="/peac-fgi" component={PeacFgi} />
      <Route path="/fco" component={Fco} />
      <Route path="/fampe" component={Fampe} />

      {/* Crédito Pessoa Física */}
      <Route path="/credito-pessoal" component={CreditoPessoaFisica} />

      {/* CGI — Crédito com Garantia de Imóvel */}
      <Route path="/credito-com-garantia-de-imovel" component={Cgi} />
      <Route path="/cgi" component={Cgi} />

      {/* Serviços */}
      <Route path="/rating-banco-brasil" component={RatingBancoBrasil} />
      <Route path="/rating-banco-central" component={RatingBancoCentral} />
      <Route path="/certificado-digital" component={CertificadoDigital} />
      <Route path="/certificado-digital-a1" component={CertificadoDigitalA1} />
      <Route path="/consulta-spc-serasa" component={ConsultaSPCSerasa} />
      <Route path="/calculadora-score" component={CalculadoraScore} />

      {/* Captura de Lead */}
      <Route path="/captura" component={CapturaLead} />

      {/* Legais */}
      <Route path="/politica-privacidade" component={PoliticaPrivacidade} />
      <Route path="/termos-uso" component={TermosUso} />
      <Route path="/sucesso" component={Sucesso} />

      {/* Área do Colaborador */}
      <Route path="/colaborador/login" component={ColaboradorLogin} />
      <Route path="/colaborador/recuperar-senha" component={RecuperarSenha} />
      <Route path="/colaborador/redefinir-senha" component={RedefinirSenha} />
      <Route path="/colaborador/meu-perfil">
        {() => (
          <ProtectedRoute>
            <MeuPerfil />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/dashboard">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="dashboard">
              <ColaboradorDashboard />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/calculadora">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="calculadora">
              <ColaboradorCalculadora />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/simulacoes">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="simulacoes">
              <ColaboradorSimulacoes />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/configuracao-funcoes">
        {() => (
          <ProtectedRoute>
            <CargoRoute allowedCargos={["administrador"]}>
              <ConfiguracaoFuncoes />
            </CargoRoute>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/usuarios">
        {() => (
          <ProtectedRoute>
            <CargoRoute
              allowedCargos={["administrador", "diretor", "gerente comercial"]}
            >
              <FeatureGate featureKey="usuarios">
                <ColaboradorUsuarios />
              </FeatureGate>
            </CargoRoute>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/clientes">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="clientes-pf">
              <ColaboradorClientes />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/crm">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="funil-vendas">
              <ColaboradorCRM />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/empresas/:id/acervo">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="clientes-pj">
              <AcervoDocumentalEmpresa />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/empresas">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="clientes-pj">
              <ColaboradorEmpresas />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/relatorio-empresas">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="relatorios-pj">
              <RelatorioEmpresas />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/cadastros-incompletos">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="cadastros-incompletos">
              <DadosIncompletos />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/dados-incompletos">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="cadastros-incompletos">
              <DadosIncompletos />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/triagem">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="triagem-leads">
              <ColaboradorTriagem />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/fila">
        {() => (
          <ProtectedRoute>
            <ColaboradorFila />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/meu-crm">
        {() => (
          <ProtectedRoute>
            <ColaboradorMeuCRM />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/integracoes">
        {() => (
          <ProtectedRoute>
            <CargoRoute allowedCargos={["administrador"]}>
              <FeatureGate featureKey="integracoes">
                <ColaboradorIntegracoes />
              </FeatureGate>
            </CargoRoute>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/assessoria">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="assessoria-ia">
              <AssessoriaIA />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/diagnostico-credito">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="diagnostico-credito">
              <DiagnosticoCredito />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/previsao-faturamento">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="faturamento">
              <PrevisaoFaturamento />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/acompanhamento-bancario">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="acompanhamento-bancario">
              <AcompanhamentoBancario />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/acompanhamento-financeiro">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="acompanhamento-financeiro">
              <AcompanhamentoFinanceiro />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/monitor-semanal">
        {() => (
          <ProtectedRoute>
            <WeeklyMonitorPage />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/contratos">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="contratos">
              <GeradorContratos />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/orcamentos">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="orcamentos">
              <ColaboradorOrcamentos />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/contadores">
        {() => (
          <ProtectedRoute>
            <CargoRoute allowedCargos={["administrador", "diretor"]}>
              <FeatureGate featureKey="contadores">
                <Contadores />
              </FeatureGate>
            </CargoRoute>
          </ProtectedRoute>
        )}
      </Route>
      {/* Cadastro de Empresas */}

      {/* Cadastro de Empresas */}
      <Route path="/colaborador/empresas/novo">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="clientes-pj">
              <CadastroEmpresa />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/clientes-pf">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="clientes-pf">
              <ColaboradorClientes />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador">
        {() => (
          <ProtectedRoute>
            <FeatureGate featureKey="dashboard">
              <ColaboradorDashboard />
            </FeatureGate>
          </ProtectedRoute>
        )}
      </Route>

      {/* Fallback */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <RouteSeoDefaults />
          <AnalyticsObserver />
          <ConsentBanner />
          <Suspense fallback={<PageLoader />}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
