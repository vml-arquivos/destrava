import { useState, useEffect } from "react";
import Layout from "./Layout";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  Users,
  Mail,
  Lock,
  User,
  Building2,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  email?: string;
  ativo: boolean;
  created_at: string;
}

const CARGOS = [
  "Analista de Crédito",
  "Consultor de Crédito",
  "Gerente Comercial",
  "Diretor",
  "Administrador",
  "Estagiário",
];

// ─── Gerador de senha segura ──────────────────────────────────────────────────

function gerarSenha(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function UsuariosPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [criando, setCriando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [senhaCopiada, setSenhaCopiada] = useState(false);

  // ─── Carregar colaboradores ───────────────────────────────────────────────

  async function carregarColaboradores() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("colaboradores")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setColaboradores(data);
    setCarregando(false);
  }

  useEffect(() => {
    carregarColaboradores();
  }, []);

  // ─── Criar usuário ────────────────────────────────────────────────────────

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || !cargo || !senha) {
      setMensagem({ tipo: "erro", texto: "Preencha todos os campos obrigatórios." });
      return;
    }

    setCriando(true);
    setMensagem(null);

    try {
      // 1. Criar usuário no Supabase Auth via signUp (funciona sem service_role no client)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: senha,
        options: {
          data: { nome, cargo },
        },
      });

      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error("Usuário não foi criado.");

      // 2. Inserir perfil na tabela colaboradores
      const { error: profileError } = await supabase.from("colaboradores").insert({
        id: authData.user.id,
        nome: nome.trim(),
        cargo,
        email: email.trim().toLowerCase(),
        ativo: true,
      });

      if (profileError) throw new Error(profileError.message);

      setMensagem({
        tipo: "sucesso",
        texto: `Usuário "${nome}" criado com sucesso! E-mail: ${email} | Senha: ${senha}`,
      });

      // Limpar formulário
      setNome("");
      setEmail("");
      setCargo("");
      setSenha("");
      carregarColaboradores();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar usuário.";
      setMensagem({ tipo: "erro", texto: msg });
    }

    setCriando(false);
  }

  // ─── Alternar status ativo/inativo ────────────────────────────────────────

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from("colaboradores").update({ ativo: !ativo }).eq("id", id);
    carregarColaboradores();
  }

  // ─── Copiar senha ─────────────────────────────────────────────────────────

  function copiarSenha() {
    navigator.clipboard.writeText(senha);
    setSenhaCopiada(true);
    setTimeout(() => setSenhaCopiada(false), 2000);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Gestão de Usuários</h1>
            <p className="text-muted-foreground text-sm">
              Crie e gerencie colaboradores com acesso ao painel
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Formulário de criação ── */}
          <Card className="shadow-md">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Novo Colaborador
              </CardTitle>
              <CardDescription>
                Preencha os dados para criar acesso ao painel
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleCriar} className="space-y-4">

                {/* Nome */}
                <div className="space-y-1.5">
                  <Label htmlFor="nome-user">Nome Completo <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="nome-user"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome do colaborador"
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* E-mail */}
                <div className="space-y-1.5">
                  <Label htmlFor="email-user">E-mail <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email-user"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="colaborador@destrava.com.br"
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Cargo */}
                <div className="space-y-1.5">
                  <Label>Cargo <span className="text-destructive">*</span></Label>
                  <Select value={cargo} onValueChange={setCargo}>
                    <SelectTrigger>
                      <Building2 className="h-4 w-4 text-muted-foreground mr-1" />
                      <SelectValue placeholder="Selecione o cargo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CARGOS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Senha */}
                <div className="space-y-1.5">
                  <Label htmlFor="senha-user">Senha <span className="text-destructive">*</span></Label>
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="senha-user"
                        type={mostrarSenha ? "text" : "password"}
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className="pl-9 pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setMostrarSenha(!mostrarSenha)}
                      >
                        {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Gerar senha segura"
                      onClick={() => { setSenha(gerarSenha()); setMostrarSenha(true); }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    {senha && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Copiar senha"
                        onClick={copiarSenha}
                      >
                        {senhaCopiada
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <Copy className="h-4 w-4" />
                        }
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique em <RefreshCw className="h-3 w-3 inline" /> para gerar uma senha segura automaticamente
                  </p>
                </div>

                {/* Mensagem de feedback */}
                {mensagem && (
                  <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
                    mensagem.tipo === "sucesso"
                      ? "bg-green-50 border border-green-200 text-green-800"
                      : "bg-red-50 border border-red-200 text-red-800"
                  }`}>
                    {mensagem.tipo === "sucesso"
                      ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    }
                    <span className="break-all">{mensagem.texto}</span>
                  </div>
                )}

                <Button type="submit" className="w-full h-11 font-bold" disabled={criando}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {criando ? "Criando usuário..." : "Criar Colaborador"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* ── Lista de colaboradores ── */}
          <Card className="shadow-md">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Colaboradores Cadastrados
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={carregarColaboradores} disabled={carregando}>
                  <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {carregando ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                  Carregando...
                </div>
              ) : colaboradores.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Nenhum colaborador cadastrado</p>
                  <p className="text-sm mt-1 opacity-60">Crie o primeiro usando o formulário ao lado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {colaboradores.map((col) => (
                    <div
                      key={col.id}
                      className="flex items-center justify-between p-3 rounded-xl border bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary font-bold text-sm">
                            {col.nome.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{col.nome}</p>
                          <p className="text-xs text-muted-foreground truncate">{col.email || "—"}</p>
                          <p className="text-xs text-muted-foreground">{col.cargo}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <Badge
                          variant={col.ativo ? "default" : "secondary"}
                          className={`text-xs cursor-pointer select-none ${col.ativo ? "bg-green-600 hover:bg-green-700" : ""}`}
                          onClick={() => toggleAtivo(col.id, col.ativo)}
                          title="Clique para alternar status"
                        >
                          {col.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Instruções de primeiro acesso ── */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-amber-800">
                <p className="font-semibold">Importante — Primeiro Acesso</p>
                <ul className="space-y-1 list-disc list-inside text-xs">
                  <li>Após criar o usuário, o Supabase envia um e-mail de confirmação para o endereço cadastrado.</li>
                  <li>O colaborador precisa confirmar o e-mail antes de fazer login.</li>
                  <li>Para desativar a confirmação de e-mail: <strong>Supabase → Authentication → Settings → desmarque "Enable email confirmations"</strong></li>
                  <li>A senha gerada deve ser comunicada ao colaborador por canal seguro (WhatsApp, ligação).</li>
                  <li>O colaborador pode alterar a senha após o primeiro login em <strong>/colaborador/perfil</strong>.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </Layout>
  );
}
