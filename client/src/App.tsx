import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Sobre from "./pages/Sobre";
import GiroCaixaFacil from "./pages/GiroCaixaFacil";
import Simulacao from "./pages/Simulacao";
import SimuladorCompleto from "./pages/SimuladorCompleto";
import FAQ from "./pages/FAQ";
import Produtos from "./pages/Produtos";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import PoliticaPrivacidade from "./pages/PoliticaPrivacidade";
import TermosUso from "./pages/TermosUso";
import Sucesso from "./pages/Sucesso";
import CapturaLead from "./pages/CapturaLead";
import SimuladorPublico from "./pages/SimuladorPublico";
import RatingBancoBrasil from "./pages/RatingBancoBrasil";
import RatingBancoCentral from "./pages/RatingBancoCentral";
import Pronampe from "./pages/Pronampe";
import Procred360 from "./pages/Procred360";
import PeacFgi from "./pages/PeacFgi";
import Fco from "./pages/Fco";
import Fampe from "./pages/Fampe";
import GiroCaixaFacilLP from "./pages/GiroCaixaFacilLP";
import CertificadoDigital from "./pages/CertificadoDigital";
import ConsultaSPCSerasa from "./pages/ConsultaSPCSerasa";
import CreditoEmpresas from "./pages/CreditoEmpresas";
import CreditoPessoaFisica from "./pages/CreditoPessoaFisica";
import Contato from "./pages/Contato";
// Área do Colaborador
import ColaboradorLogin from "./pages/colaborador/Login";
import ColaboradorDashboard from "./pages/colaborador/Dashboard";
import ColaboradorCalculadora from "./pages/colaborador/CalculadoraPage";
import ColaboradorSimulacoes from "./pages/colaborador/Simulacoes";
import ColaboradorUsuarios from "./pages/colaborador/Usuarios";
import ColaboradorClientes from "./pages/colaborador/Clientes";
import ColaboradorIntegracoes from "./pages/colaborador/Integracoes";
import ColaboradorCRM from "./pages/colaborador/CRM";
import ColaboradorEmpresas from "./pages/colaborador/Empresas";
import ProtectedRoute from "./components/ProtectedRoute";

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

      {/* Serviços */}
      <Route path="/rating-banco-brasil" component={RatingBancoBrasil} />
      <Route path="/rating-banco-central" component={RatingBancoCentral} />
      <Route path="/certificado-digital" component={CertificadoDigital} />
      <Route path="/consulta-spc-serasa" component={ConsultaSPCSerasa} />

      {/* Captura de Lead */}
      <Route path="/captura" component={CapturaLead} />

      {/* Legais */}
      <Route path="/politica-privacidade" component={PoliticaPrivacidade} />
      <Route path="/termos-uso" component={TermosUso} />
      <Route path="/sucesso" component={Sucesso} />

      {/* Área do Colaborador */}
      <Route path="/colaborador/login" component={ColaboradorLogin} />
      <Route path="/colaborador/dashboard">
        {() => (
          <ProtectedRoute>
            <ColaboradorDashboard />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/calculadora">
        {() => (
          <ProtectedRoute>
            <ColaboradorCalculadora />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/simulacoes">
        {() => (
          <ProtectedRoute>
            <ColaboradorSimulacoes />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/usuarios">
        {() => (
          <ProtectedRoute>
            <ColaboradorUsuarios />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/clientes">
        {() => (
          <ProtectedRoute>
            <ColaboradorClientes />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/crm">
        {() => (
          <ProtectedRoute>
            <ColaboradorCRM />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/empresas">
        {() => (
          <ProtectedRoute>
            <ColaboradorEmpresas />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/integracoes">
        {() => (
          <ProtectedRoute>
            <ColaboradorIntegracoes />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador">
        {() => (
          <ProtectedRoute>
            <ColaboradorDashboard />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
