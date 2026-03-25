import { useState, FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, Mail, Shield } from "lucide-react";

export default function ColaboradorLogin() {
  const { signIn, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Se já autenticado, redireciona
  if (isAuthenticated) {
    setLocation("/colaborador/dashboard");
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos. Verifique suas credenciais."
          : error.message === "Email not confirmed"
          ? "Confirme seu e-mail antes de fazer login."
          : "Erro ao fazer login. Tente novamente."
      );
      setLoading(false);
      return;
    }

    setLocation("/colaborador/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#001f6b] via-[#002d8a] to-[#003db5]">
      {/* Header mínimo */}
      <header className="p-6">
        <a href="/" className="flex items-center gap-2 text-white/80 hover:text-white transition-colors w-fit">
          <img src="/destrava-logo.svg" alt="Destrava Crédito" className="h-8 brightness-0 invert" />
        </a>
      </header>

      {/* Card de login */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          {/* Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-white text-sm">
              <Shield className="h-4 w-4 text-yellow-400" />
              <span>Área Restrita — Colaboradores</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Acesso do Colaborador</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Entre com suas credenciais para acessar o painel
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-10"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full font-semibold"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar no Painel"
                )}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-6">
              Acesso exclusivo para colaboradores autorizados da Destrava Crédito.
              <br />
              Problemas? Entre em contato com o administrador.
            </p>
          </div>

          <p className="text-center text-white/50 text-xs mt-6">
            © {new Date().getFullYear()} Destrava Crédito — Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
