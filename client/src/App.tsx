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
import Cgi from "./pages/Cgi";
// Área do Colaborador
import ColaboradorLogin from "./pages/colaborador/Login";
import RecuperarSenha from "./pages/colaborador/RecuperarSenha";
import RedefinirSenha from "./pages/colaborador/RedefinirSenha";
import MeuPerfil from "./pages/colaborador/MeuPerfil";
import ColaboradorDashboard from "./pages/colaborador/Dashboard";
import ColaboradorCalculadora from "./pages/colaborador/CalculadoraPage";
import ColaboradorSimulacoes from "./pages/colaborador/Simulacoes";
import ColaboradorUsuarios from "./pages/colaborador/Usuarios";
import ColaboradorClientes from "./pages/colaborador/Clientes";
import ColaboradorIntegracoes from "./pages/colaborador/Integracoes";
import PrevisaoFaturamento from "./pages/colaborador/PrevisaoFaturamento";
import GeradorContratos from "./pages/colaborador/GeradorContratos";
import ColaboradorCRM from "./pages/colaborador/CRM";
import ColaboradorEmpresas from "./pages/colaborador/Empresas";
import ColaboradorTriagem from "./pages/colaborador/Triagem";
import ColaboradorFila from "./pages/colaborador/Fila";
import ColaboradorMeuCRM from "./pages/colaborador/MeuCRM";
import Contadores from "./pages/colaborador/Contadores";
import ClientesPF from "./pages/colaborador/ClientesPF";
import AcompanhamentoBancario from "./pages/colaborador/AcompanhamentoBancario";
import AcompanhamentoFinanceiro from "./pages/colaborador/AcompanhamentoFinanceiro";
import WeeklyMonitorPage from "./pages/colaborador/WeeklyMonitorPage";
import ProtectedRoute from "./components/ProtectedRoute";
import CargoRoute from "./components/CargoRoute";

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
      <Route path="/consulta-spc-serasa" component={ConsultaSPCSerasa} />

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
            <CargoRoute allowedCargos={['administrador', 'diretor', 'gerente comercial']}>
              <ColaboradorUsuarios />
            </CargoRoute>
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
      <Route path="/colaborador/triagem">
        {() => (
          <ProtectedRoute>
            <ColaboradorTriagem />
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
            <CargoRoute allowedCargos={['administrador']}>
              <ColaboradorIntegracoes />
            </CargoRoute>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/previsao-faturamento">
        {() => (
          <ProtectedRoute>
            <PrevisaoFaturamento />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/acompanhamento-bancario">
        {() => (
          <ProtectedRoute>
            <AcompanhamentoBancario />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/acompanhamento-financeiro">
        {() => (
          <ProtectedRoute>
            <AcompanhamentoFinanceiro />
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
            <GeradorContratos />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/contadores">
        {() => (
          <ProtectedRoute>
            <CargoRoute allowedCargos={['administrador', 'diretor']}>
              <Contadores />
            </CargoRoute>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/colaborador/clientes-pf">
        {() => (
          <ProtectedRoute>
            <ClientesPF />
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
