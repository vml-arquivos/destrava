import { useState, useEffect } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
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

const CARGOS = [
  "Analista de Crédito",
  "Consultor de Crédito",
  "Gerente Comercial",
  "Diretor",
  "Administrador",
  "Estagiário",
  "Captador",
];

// ─── Gerador de senha segura ──────────────────────────────────────────────────
function gerarSenha(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function UsuariosPage() {
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
    try {
      const data = await apiFetch("/api/colaboradores");
      setColaboradores(data ?? []);
    } catch (err) {
      console.error(err);
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
    // Captador precisa de telefone para identificação no webhook
    if (cargo.toLowerCase() === "captador" && !telefone.trim()) {
      setMensagem({ tipo: "erro", texto: "Captadores precisam de telefone para identificação no Chatwoot." });
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
        texto: `Usuário "${nome}" criado com sucesso! E-mail: ${email} | Senha: ${senha}`,
      });

      setNome("");
      setEmail("");
      setCargo("");
      setTelefone("");
      setSenha("");
      carregarColaboradores();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar usuário.";
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
    if (editCargo.toLowerCase() === "captador" && !editTelefone.trim()) {
      setMensagemEdit({ tipo: "erro", texto: "Captadores precisam de telefone para identificação." });
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
      setMensagemEdit({ tipo: "sucesso", texto: "Salvo com sucesso!" });
      setTimeout(() => {
        setEditandoId(null);
        setMensagemEdit(null);
      }, 1200);
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function badgeCargo(c: string) {
    const lower = c.toLowerCase();
    if (lower === "captador") return "bg-amber-100 text-amber-800 border-amber-300";
    if (["admin","administrador","diretor"].includes(lower)) return "bg-purple-100 text-purple-800 border-purple-300";
    if (["gerente","gestor"].includes(lower)) return "bg-blue-100 text-blue-800 border-blue-300";
    if (["analista de crédito","analista"].includes(lower)) return "bg-sky-100 text-sky-800 border-sky-300";
    if (["consultor de crédito","consultor"].includes(lower)) return "bg-teal-100 text-teal-800 border-teal-300";
    return "bg-gray-100 text-gray-700 border-gray-300";
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
                  {cargo.toLowerCase() === "captador" && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Captadores não geram leads nem análise de IA no Chatwoot. O telefone abaixo é <strong>obrigatório</strong> para identificação automática.
                    </p>
                  )}
                  {["analista de crédito","consultor de crédito","estagiário"].includes(cargo.toLowerCase()) && (
                    <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                      Analistas/Consultores veem apenas empresas onde são responsáveis ou analistas vinculados. Cadastre o telefone para que mensagens deles no WhatsApp não gerem leads.
                    </p>
                  )}
                </div>

                {/* Telefone WhatsApp */}
                <div className="space-y-1.5">
                  <Label htmlFor="telefone-user">
                    Telefone WhatsApp
                    {cargo.toLowerCase() === "captador"
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
                      placeholder="(11) 99999-9999"
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

                <Button type="submit" className="w-full h-11 font-bold" disabled={criando}>
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
              ) : colaboradores.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Nenhum colaborador cadastrado</p>
                  <p className="text-sm mt-1 opacity-60">Crie o primeiro usando o formulário ao lado</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
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
                                  {CARGOS.map(c => (
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
                              {editCargo.toLowerCase() === "captador"
                                ? <span className="text-destructive"> *</span>
                                : <span className="text-muted-foreground"> (recomendado)</span>
                              }
                            </Label>
                            <Input
                              value={editTelefone}
                              onChange={e => setEditTelefone(e.target.value)}
                              placeholder="(11) 99999-9999"
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
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Phone className="h-3 w-3 text-green-500" />
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
                            <button
                              onClick={() => abrirEdicao(col)}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                              title="Editar colaborador"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
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
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Legenda de cargos e permissões ── */}
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-3 text-sm text-blue-900 w-full">
                <p className="font-semibold">Permissões por Cargo</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/60 rounded-lg p-2.5 border border-blue-100">
                    <p className="font-semibold text-purple-800 mb-1">Admin / Diretor / Gerente</p>
                    <p className="text-gray-600">Acesso total — vê todos os leads, empresas e colaboradores.</p>
                  </div>
                  <div className="bg-white/60 rounded-lg p-2.5 border border-blue-100">
                    <p className="font-semibold text-sky-800 mb-1">Analista / Consultor / Estagiário</p>
                    <p className="text-gray-600">Acesso restrito — vê apenas empresas onde é responsável ou analista vinculado. Com telefone cadastrado, mensagens no WhatsApp não geram leads.</p>
                  </div>
                  <div className="bg-white/60 rounded-lg p-2.5 border border-amber-100 sm:col-span-2">
                    <p className="font-semibold text-amber-800 mb-1">Captador</p>
                    <p className="text-gray-600">Não gera leads nem análise de IA via Chatwoot. Mensagens recebidas são gravadas como conversa, mas sem criar lead. <strong>Telefone obrigatório</strong> para identificação automática. Pode ser vinculado a empresas como captador de origem.</p>
                  </div>
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
                  <li>Para <strong>Captadores</strong>: o telefone deve ser o mesmo número cadastrado no Chatwoot.</li>
                  <li>Para <strong>Analistas/Consultores</strong>: cadastre o telefone e vincule-os às empresas no formulário de Empresa (campo "Analista Responsável").</li>
                  <li>O isolamento de painel é automático — cada analista vê apenas suas empresas vinculadas.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
