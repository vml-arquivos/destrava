import { useState, useEffect } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
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
  Phone,
  Pencil,
  X,
  Save,
  ShieldOff,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  email?: string;
  telefone?: string;
  ativo: boolean;
  created_at: string;
}

// ─── 7 cargos definitivos do sistema ─────────────────────────────────────────
const TODOS_CARGOS = [
  "Administrador",
  "Diretor",
  "Gerente Comercial",
  "Analista de Crédito",
  "Consultor de Crédito",
  "Captador Externo",
  "Estagiário",
] as const;

// Hierarquia estrita: cada cargo só pode criar/editar cargos de nível INFERIOR ao seu
// Administrador (0) → todos os outros
// Diretor (1) → Gerente Comercial e abaixo (NÃO pode criar outro Diretor)
// Gerente Comercial (2) → Analista, Consultor, Captador Externo, Estagiário
const CARGOS_CRIADOS_POR: Record<string, string[]> = {
  administrador: ["Diretor", "Gerente Comercial", "Analista de Crédito", "Consultor de Crédito", "Captador Externo", "Estagiário"],
  diretor: ["Gerente Comercial", "Analista de Crédito", "Consultor de Crédito", "Captador Externo", "Estagiário"],
  "gerente comercial": ["Analista de Crédito", "Consultor de Crédito", "Captador Externo", "Estagiário"],
};

// Cargos que NÃO precisam de telefone obrigatório (mas é recomendado)
const CARGOS_TELEFONE_OBRIGATORIO = ["captador externo"];

// ─── Gerador de senha segura ──────────────────────────────────────────────────
function gerarSenha(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Helpers visuais ──────────────────────────────────────────────────────────
function badgeCargo(c: string) {
  const lower = c.toLowerCase();
  if (lower === "administrador") return "bg-purple-100 text-purple-800 border-purple-300";
  if (lower === "diretor") return "bg-indigo-100 text-indigo-800 border-indigo-300";
  if (lower === "gerente comercial") return "bg-blue-100 text-blue-800 border-blue-300";
  if (lower === "analista de crédito") return "bg-sky-100 text-sky-800 border-sky-300";
  if (lower === "consultor de crédito") return "bg-teal-100 text-teal-800 border-teal-300";
  if (lower === "captador externo") return "bg-amber-100 text-amber-800 border-amber-300";
  if (lower === "estagiário") return "bg-gray-100 text-gray-600 border-gray-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function UsuariosPage() {
  const { colaborador: eu } = useAuth();

  // Cargos que o usuário logado pode criar
  const cargoEu = (eu?.cargo || "").toLowerCase();
  const cargosPermitidos: string[] = CARGOS_CRIADOS_POR[cargoEu] ?? [];
  const podeGerenciar = cargosPermitidos.length > 0;

  // ── Estado do formulário de criação ──────────────────────────────────────
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [criando, setCriando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [senhaCopiada, setSenhaCopiada] = useState(false);

  // ── Estado da lista ───────────────────────────────────────────────────────
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);

  // ── Estado de edição inline ───────────────────────────────────────────────
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCargo, setEditCargo] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [mensagemEdit, setMensagemEdit] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  // ─── Carregar colaboradores ───────────────────────────────────────────────
  async function carregarColaboradores() {
    setCarregando(true);
    setErroLista(null);
    try {
      const data = await apiFetch("/api/colaboradores");
      // A API retorna um array diretamente
      const lista = Array.isArray(data) ? data : (data?.colaboradores ?? data?.rows ?? []);
      setColaboradores(lista);
    } catch (err: unknown) {
      console.error("[carregarColaboradores]", err);
      const msg = err instanceof Error ? err.message : "Erro ao carregar colaboradores.";
      setErroLista(msg);
      setColaboradores([]);
    }
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
    if (CARGOS_TELEFONE_OBRIGATORIO.includes(cargo.toLowerCase()) && !telefone.trim()) {
      setMensagem({ tipo: "erro", texto: "Captadores Externos precisam de telefone para identificação no Chatwoot." });
      return;
    }

    setCriando(true);
    setMensagem(null);

    try {
      await apiFetch("/api/colaboradores", {
        method: "POST",
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          cargo,
          senha,
          telefone: telefone.trim() || undefined,
        }),
      });

      setMensagem({
        tipo: "sucesso",
        texto: `Colaborador "${nome}" criado! E-mail: ${email} | Senha: ${senha}`,
      });

      setNome("");
      setEmail("");
      setCargo("");
      setTelefone("");
      setSenha("");
      carregarColaboradores();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar colaborador.";
      setMensagem({ tipo: "erro", texto: msg });
    }

    setCriando(false);
  }

  // ─── Editar colaborador ───────────────────────────────────────────────────
  function abrirEdicao(col: Colaborador) {
    setEditandoId(col.id);
    setEditNome(col.nome);
    setEditCargo(col.cargo);
    setEditTelefone(col.telefone || "");
    setMensagemEdit(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setMensagemEdit(null);
  }

  async function salvarEdicao(id: string) {
    if (!editNome.trim() || !editCargo) {
      setMensagemEdit({ tipo: "erro", texto: "Nome e cargo são obrigatórios." });
      return;
    }
    if (CARGOS_TELEFONE_OBRIGATORIO.includes(editCargo.toLowerCase()) && !editTelefone.trim()) {
      setMensagemEdit({ tipo: "erro", texto: "Captadores Externos precisam de telefone." });
      return;
    }
    setSalvandoEdit(true);
    try {
      await apiFetch(`/api/colaboradores/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: editNome.trim(),
          cargo: editCargo,
          telefone: editTelefone.trim() || null,
        }),
      });
      setMensagemEdit({ tipo: "sucesso", texto: "Salvo!" });
      setTimeout(() => {
        setEditandoId(null);
        setMensagemEdit(null);
      }, 1000);
      carregarColaboradores();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar.";
      setMensagemEdit({ tipo: "erro", texto: msg });
    }
    setSalvandoEdit(false);
  }

  // ─── Alternar status ativo/inativo ────────────────────────────────────────
  async function toggleAtivo(id: string, _ativo: boolean) {
    await apiFetch(`/api/colaboradores/${id}/toggle`, { method: "PATCH" });
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
            <h1 className="text-2xl font-bold">Gestão de Colaboradores</h1>
            <p className="text-muted-foreground text-sm">
              Cadastre e gerencie colaboradores, cargos e acessos ao painel
            </p>
          </div>
        </div>

        {/* Aviso se não tem permissão para criar */}
        {!podeGerenciar && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3 text-red-800">
                <ShieldOff className="h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Acesso restrito</p>
                  <p className="text-xs mt-0.5">
                    Seu cargo ({eu?.cargo}) não tem permissão para criar novos colaboradores.
                    Apenas <strong>Administrador</strong>, <strong>Diretor</strong> e <strong>Gerente Comercial</strong> podem gerenciar usuários.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Formulário de criação ── */}
          <Card className={`shadow-md ${!podeGerenciar ? "opacity-60 pointer-events-none" : ""}`}>
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
                      {cargosPermitidos.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Descrição do cargo selecionado */}
                  {cargo && (
                    <div className={`text-xs rounded-lg px-3 py-2 border ${
                      cargo.toLowerCase() === "captador externo"
                        ? "bg-amber-50 border-amber-200 text-amber-800"
                        : cargo.toLowerCase() === "administrador"
                        ? "bg-purple-50 border-purple-200 text-purple-800"
                        : cargo.toLowerCase() === "estagiário"
                        ? "bg-gray-50 border-gray-200 text-gray-700"
                        : "bg-sky-50 border-sky-200 text-sky-800"
                    }`}>
                      {cargo.toLowerCase() === "administrador" && "Acesso total ao sistema: dashboards, usuários, integrações n8n, todos os leads e empresas."}
                      {cargo.toLowerCase() === "diretor" && "Acesso total a leads, empresas e pode criar usuários abaixo de Administrador."}
                      {cargo.toLowerCase() === "gerente comercial" && "Acesso total a leads e empresas. Pode criar Analistas, Consultores, Captadores e Estagiários."}
                      {cargo.toLowerCase() === "analista de crédito" && "Vê apenas empresas e leads onde é responsável ou analista vinculado."}
                      {cargo.toLowerCase() === "consultor de crédito" && "Vê apenas empresas e leads onde é responsável. Pode ser captador de origem de empresas."}
                      {cargo.toLowerCase() === "captador externo" && "Não gera leads nem análise de IA. Mensagens no Chatwoot são gravadas como conversa. Telefone obrigatório para identificação."}
                      {cargo.toLowerCase() === "estagiário" && "Acesso restrito — vê apenas registros onde é responsável. Não pode ser responsável por atendimento de empresa."}
                    </div>
                  )}
                </div>

                {/* Telefone WhatsApp */}
                <div className="space-y-1.5">
                  <Label htmlFor="telefone-user">
                    Telefone WhatsApp
                    {CARGOS_TELEFONE_OBRIGATORIO.includes(cargo.toLowerCase())
                      ? <span className="text-destructive"> *</span>
                      : <span className="text-muted-foreground text-xs ml-1">(recomendado)</span>
                    }
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="telefone-user"
                      type="tel"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      placeholder="(61) 99999-9999"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mesmo número cadastrado no Chatwoot. Impede que mensagens deste colaborador gerem leads automaticamente.
                  </p>
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

                <Button type="submit" className="w-full h-11 font-bold" disabled={criando || !podeGerenciar}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {criando ? "Criando colaborador..." : "Criar Colaborador"}
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
              ) : erroLista ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                  <AlertCircle className="h-10 w-10 text-red-400" />
                  <p className="font-medium text-red-700 text-sm">Erro ao carregar colaboradores</p>
                  <p className="text-xs text-red-500">{erroLista}</p>
                  <button
                    onClick={carregarColaboradores}
                    className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Tentar novamente
                  </button>
                </div>
              ) : colaboradores.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Nenhum colaborador cadastrado</p>
                  <p className="text-sm mt-1 opacity-60">Crie o primeiro usando o formulário ao lado</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                  {colaboradores.map((col) => (
                    <div
                      key={col.id}
                      className="rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      {editandoId === col.id ? (
                        /* ── Modo edição inline ── */
                        <div className="p-3 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Nome</Label>
                              <Input
                                value={editNome}
                                onChange={e => setEditNome(e.target.value)}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Cargo</Label>
                              <Select value={editCargo} onValueChange={setEditCargo}>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {/* Apenas cargos que o usuário logado pode atribuir (nível inferior ao seu) */}
                                  {cargosPermitidos.map(c => (
                                    <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              Telefone WhatsApp
                              {CARGOS_TELEFONE_OBRIGATORIO.includes(editCargo.toLowerCase())
                                ? <span className="text-destructive"> *</span>
                                : <span className="text-muted-foreground"> (recomendado)</span>
                              }
                            </Label>
                            <Input
                              value={editTelefone}
                              onChange={e => setEditTelefone(e.target.value)}
                              placeholder="(61) 99999-9999"
                              className="h-8 text-sm"
                            />
                          </div>
                          {mensagemEdit && (
                            <p className={`text-xs px-2 py-1 rounded ${mensagemEdit.tipo === "sucesso" ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
                              {mensagemEdit.texto}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs flex-1"
                              onClick={() => salvarEdicao(col.id)}
                              disabled={salvandoEdit}
                            >
                              <Save className="h-3 w-3 mr-1" />
                              {salvandoEdit ? "Salvando..." : "Salvar"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={cancelarEdicao}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* ── Modo visualização ── */
                        <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-primary font-bold text-sm">
                                {col.nome.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{col.nome}</p>
                              <p className="text-xs text-muted-foreground truncate">{col.email || "—"}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${badgeCargo(col.cargo)}`}>
                                  {col.cargo}
                                </span>
                                {col.telefone ? (
                                  <span className="text-xs text-green-600 flex items-center gap-0.5">
                                    <Phone className="h-3 w-3" />
                                    {col.telefone}
                                  </span>
                                ) : (
                                  <span className="text-xs text-amber-500 flex items-center gap-0.5">
                                    <Phone className="h-3 w-3" />
                                    Sem telefone
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            {podeGerenciar && (
                              <button
                                onClick={() => abrirEdicao(col)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                title="Editar colaborador"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <Badge
                              variant={col.ativo ? "default" : "secondary"}
                              className={`text-xs cursor-pointer select-none ${col.ativo ? "bg-green-600 hover:bg-green-700" : ""} ${!podeGerenciar ? "pointer-events-none" : ""}`}
                              onClick={() => podeGerenciar && toggleAtivo(col.id, col.ativo)}
                              title={podeGerenciar ? "Clique para alternar status" : ""}
                            >
                              {col.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Tabela de permissões por cargo ── */}
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-3 text-sm text-blue-900 w-full">
                <p className="font-semibold">Hierarquia de Cargos e Permissões</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-blue-100/80">
                        <th className="text-left px-3 py-2 rounded-tl-lg font-semibold">Cargo</th>
                        <th className="text-center px-2 py-2 font-semibold">Ver tudo</th>
                        <th className="text-center px-2 py-2 font-semibold">Criar usuários</th>
                        <th className="text-center px-2 py-2 font-semibold">Captação</th>
                        <th className="text-center px-2 py-2 font-semibold rounded-tr-lg">Atendimento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100">
                      {[
                        { cargo: "Administrador", verTudo: true, criar: "Todos (exceto outro Admin)", captacao: true, atendimento: true },
                        { cargo: "Diretor", verTudo: true, criar: "Exceto Admin e Diretor", captacao: true, atendimento: true },
                        { cargo: "Gerente Comercial", verTudo: true, criar: "Analista/Consultor/Captador/Estag.", captacao: true, atendimento: true },
                        { cargo: "Analista de Crédito", verTudo: false, criar: "—", captacao: false, atendimento: true },
                        { cargo: "Consultor de Crédito", verTudo: false, criar: "—", captacao: true, atendimento: true },
                        { cargo: "Captador Externo", verTudo: false, criar: "—", captacao: true, atendimento: false },
                        { cargo: "Estagiário", verTudo: false, criar: "—", captacao: false, atendimento: false },
                      ].map(row => (
                        <tr key={row.cargo} className="bg-white/50 hover:bg-white/80">
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded border font-medium ${badgeCargo(row.cargo)}`}>
                              {row.cargo}
                            </span>
                          </td>
                          <td className="text-center px-2 py-2">{row.verTudo ? "✅" : "🔒"}</td>
                          <td className="text-center px-2 py-2 text-gray-600">{typeof row.criar === "string" ? row.criar : (row.criar ? "✅" : "—")}</td>
                          <td className="text-center px-2 py-2">{row.captacao ? "✅" : "—"}</td>
                          <td className="text-center px-2 py-2">{row.atendimento ? "✅" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-blue-700 bg-blue-100/60 rounded-lg px-3 py-2 border border-blue-200">
                  <strong>Dica:</strong> Cadastre o telefone WhatsApp de todos os colaboradores que interagem pelo Chatwoot para evitar que suas mensagens gerem leads automaticamente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Instruções de primeiro acesso ── */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-amber-800">
                <p className="font-semibold">Importante — Primeiro Acesso e Configuração</p>
                <ul className="space-y-1 list-disc list-inside text-xs">
                  <li>Após criar o colaborador, comunique a senha por canal seguro (WhatsApp, ligação).</li>
                  <li>O colaborador pode alterar a senha após o primeiro login em <strong>/colaborador/perfil</strong>.</li>
                  <li>Para <strong>Captadores Externos</strong>: o telefone deve ser o mesmo número cadastrado no Chatwoot.</li>
                  <li>Para <strong>Analistas/Consultores</strong>: vincule-os às empresas no formulário de Empresa (campo "Responsável pelo Atendimento").</li>
                  <li>O isolamento de painel é automático — cada colaborador vê apenas seus registros vinculados.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
