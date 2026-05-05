import { FormEvent, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, Shield } from "lucide-react";

export default function RedefinirSenha() {
  const [location, setLocation] = useLocation();
  const tokenInicial = useMemo(() => new URLSearchParams(location.split("?")[1] || "").get("token") || "", [location]);
  const [token, setToken] = useState(tokenInicial);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const redefinir = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setMensagem("");
    if (novaSenha.length < 8) {
      setErro("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setErro("A confirmação da senha não confere.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/auth/redefinir-senha", {
        method: "POST",
        body: JSON.stringify({ token, nova_senha: novaSenha }),
      });
      setMensagem("Senha redefinida com sucesso. Você já pode entrar com a nova senha.");
      setTimeout(() => setLocation("/colaborador/login"), 1800);
    } catch (err: any) {
      setErro(err.message || "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#001f6b] via-[#002d8a] to-[#003db5]">
      <header className="p-6">
        <a href="/" className="flex items-center gap-2 text-white/80 hover:text-white transition-colors w-fit">
          <img src="/destrava-logo.svg" alt="Destrava Crédito" className="h-8 brightness-0 invert" />
        </a>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-white text-sm">
              <Shield className="h-4 w-4 text-yellow-400" />
              <span>Nova senha</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Redefinir senha</h1>
              <p className="text-muted-foreground text-sm mt-1">Crie uma nova senha segura para sua conta.</p>
            </div>
            {(erro || mensagem) && (
              <Alert variant={erro ? "destructive" : "default"} className="mb-6">
                <AlertDescription>{erro || mensagem}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={redefinir} className="space-y-5">
              <div className="space-y-2"><Label>Token de redefinição</Label><Input required value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole o token recebido" /></div>
              <div className="space-y-2"><Label>Nova senha</Label><Input type="password" required value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} /></div>
              <div className="space-y-2"><Label>Confirmar nova senha</Label><Input type="password" required value={confirmar} onChange={(e) => setConfirmar(e.target.value)} /></div>
              <Button type="submit" size="lg" className="w-full font-semibold" disabled={loading}>{loading ? "Redefinindo..." : "Redefinir senha"}</Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-6"><Link href="/colaborador/login"><a className="text-primary hover:underline">Voltar ao login</a></Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
