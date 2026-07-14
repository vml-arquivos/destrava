import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, Mail, Shield } from "lucide-react";

export default function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const solicitar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setMensagem("");
    setLoading(true);
    try {
      const resp = await apiFetch("/api/auth/solicitar-reset-senha", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMensagem(resp?.message || "Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.");
    } catch (err: any) {
      setErro(err.message || "Erro ao solicitar redefinição de senha.");
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
              <span>Recuperação de acesso</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Esqueci minha senha</h1>
              <p className="text-muted-foreground text-sm mt-1">Informe seu e-mail corporativo para solicitar a redefinição.</p>
            </div>
            {(erro || mensagem) && (
              <Alert variant={erro ? "destructive" : "default"} className="mb-6">
                <AlertDescription>{erro || mensagem}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={solicitar} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="pl-10" />
                </div>
              </div>
              <Button type="submit" size="lg" className="w-full font-semibold" disabled={loading}>{loading ? "Solicitando..." : "Solicitar redefinição"}</Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-6"><Link href="/colaborador/login" className="text-primary hover:underline">Voltar ao login</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
