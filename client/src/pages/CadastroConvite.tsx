import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Lock, Mail, Shield, User } from "lucide-react";

function formatarCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatarTelefone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

export default function CadastroConvite() {
  const [location, setLocation] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", [location]);
  const [validando, setValidando] = useState(true);
  const [valido, setValido] = useState(false);
  const [tipo, setTipo] = useState<"parceiro" | "captador" | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  useEffect(() => {
    let ativo = true;
    async function validarLink() {
      if (!token) {
        setErro("Link de cadastro inválido ou incompleto.");
        setValidando(false);
        return;
      }
      try {
        const response = await fetch(`/api/convites-cadastro/${encodeURIComponent(token)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Link de cadastro inválido ou expirado.");
        if (!ativo) return;
        setTipo(data.tipo === "parceiro" ? "parceiro" : "captador");
        setValido(true);
      } catch (err) {
        if (ativo) setErro(err instanceof Error ? err.message : "Link de cadastro inválido ou expirado.");
      } finally {
        if (ativo) setValidando(false);
      }
    }
    validarLink();
    return () => { ativo = false; };
  }, [token]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (nome.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro("Informe nome completo e e-mail válido.");
      return;
    }
    if (tipo === "parceiro" && cpf.replace(/\D/g, "").length !== 11) {
      setErro("Informe um CPF válido para o cadastro de parceiro.");
      return;
    }
    if (senha.length < 8) {
      setErro("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("A confirmação de senha não confere.");
      return;
    }

    setEnviando(true);
    try {
      const response = await fetch(`/api/convites-cadastro/${encodeURIComponent(token)}/cadastrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, cpf, telefone, senha }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir o cadastro.");
      setConcluido(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível concluir o cadastro.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#001f6b] via-[#002d8a] to-[#003db5]">
      <header className="p-6">
        <a href="/" className="flex items-center gap-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors w-fit">
          <img src="/destrava-logo.svg" alt="Destrava Crédito" className="h-8 brightness-0 invert" />
        </a>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-lg">
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-card/10 border border-white/20 rounded-full px-4 py-1.5 text-primary-foreground text-sm">
              <Shield className="h-4 w-4 text-warning" /> Cadastro de acesso autorizado
            </div>
          </div>
          <div className="bg-card rounded-2xl shadow-2xl p-8">
            {validando ? (
              <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-7 w-7 animate-spin mx-auto mb-3" />Validando seu link...</div>
            ) : !valido ? (
              <div className="space-y-5 text-center">
                <h1 className="text-2xl font-bold">Link indisponível</h1>
                <Alert variant="destructive"><AlertDescription>{erro}</AlertDescription></Alert>
                <Link href="/colaborador/login" className="text-primary hover:underline text-sm">Ir para o login</Link>
              </div>
            ) : concluido ? (
              <div className="space-y-5 text-center">
                <CheckCircle2 className="h-14 w-14 text-success mx-auto" />
                <div><h1 className="text-2xl font-bold">Cadastro recebido</h1><p className="text-muted-foreground mt-2">Seu cadastro será analisado. O acesso ao sistema será liberado após aprovação do administrador.</p></div>
                <Button className="w-full" onClick={() => setLocation("/colaborador/login")}>Ir para o login</Button>
              </div>
            ) : (
              <>
                <div className="text-center mb-7"><div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4"><User className="h-8 w-8 text-primary" /></div><h1 className="text-2xl font-bold">Criar acesso</h1><p className="text-muted-foreground text-sm mt-1">Preencha seus dados para solicitar acesso à área do colaborador.</p></div>
                {erro && <Alert variant="destructive" className="mb-5"><AlertDescription>{erro}</AlertDescription></Alert>}
                <form onSubmit={enviar} className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="cadastro-nome">Nome completo</Label><Input id="cadastro-nome" value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" /></div>
                  <div className="space-y-2"><Label htmlFor="cadastro-email">E-mail</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id="cadastro-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="pl-10" /></div></div>
                  {tipo === "parceiro" && <div className="space-y-2"><Label htmlFor="cadastro-cpf">CPF</Label><Input id="cadastro-cpf" value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} required autoComplete="off" /></div>}
                  <div className="space-y-2"><Label htmlFor="cadastro-telefone">Telefone WhatsApp</Label><Input id="cadastro-telefone" value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} autoComplete="tel" /></div>
                  <div className="space-y-2"><Label htmlFor="cadastro-senha">Senha</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id="cadastro-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoComplete="new-password" className="pl-10" /></div><p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p></div>
                  <div className="space-y-2"><Label htmlFor="cadastro-confirmacao">Confirmar senha</Label><Input id="cadastro-confirmacao" type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required minLength={8} autoComplete="new-password" /></div>
                  <Button type="submit" className="w-full" disabled={enviando}>{enviando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando cadastro...</> : "Solicitar acesso"}</Button>
                </form>
                <p className="text-center text-xs text-muted-foreground mt-6">O acesso fica pendente de aprovação. Nunca compartilhe este link publicamente.</p>
              </>
            )}
          </div>
          <p className="text-center text-primary-foreground/50 text-xs mt-6">© {new Date().getFullYear()} Destrava Crédito</p>
        </div>
      </div>
    </div>
  );
}
