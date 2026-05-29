import { useEffect, useMemo, useState } from "react";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  ShieldOff,
  User,
  UserPlus,
  Users,
  Workflow,
  X,
} from "lucide-react";

interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  email?: string;
  telefone?: string;
  ativo: boolean;
  perfil?: "admin" | "gestor" | "agente" | "analista";
  pode_atender_leads?: boolean;
  pode_ver_todos_leads?: boolean;
  chatwoot_agente_id?: number | null;
  created_at?: string | null;
}

const TODOS_CARGOS = [
  "Administrador",
  "Diretor",
  "Gerente Comercial",
  "Analista de Crédito",
  "Consultor de Crédito",
  "Captador Externo",
  "Estagiário",
] as const;

const PERFIS_OPERACIONAIS = ["admin", "gestor", "agente", "analista"] as const;
type PerfilOperacional = typeof PERFIS_OPERACIONAIS[number];

const CARGOS_CRIADOS_POR: Record<string, string[]> = {
  administrador: ["Diretor", "Gerente Comercial", "Analista de Crédito", "Consultor de Crédito", "Captador Externo", "Estagiário"],
  diretor: ["Gerente Comercial", "Analista de Crédito", "Consultor de Crédito", "Captador Externo", "Estagiário"],
  "gerente comercial": ["Analista de Crédito", "Consultor de Crédito", "Captador Externo", "Estagiário"],
};

const CARGOS_TELEFONE_OBRIGATORIO = ["captador externo"];

function gerarSenha(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function badgeCargo(cargo: string) {
  const lower = cargo.toLowerCase();
  if (lower === "administrador") return "bg-purple-100 text-purple-800 border-purple-300";
  if (lower === "diretor") return "bg-indigo-100 text-indigo-800 border-indigo-300";
  if (lower === "gerente comercial") return "bg-blue-100 text-blue-800 border-blue-300";
  if (lower === "analista de crédito") return "bg-sky-100 text-sky-800 border-sky-300";
  if (lower === "consultor de crédito") return "bg-teal-100 text-teal-800 border-teal-300";
  if (lower === "captador externo") return "bg-amber-100 text-amber-800 border-amber-300";
  if (lower === "estagiário") return "bg-gray-100 text-gray-600 border-gray-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

function perfilOperacionalPadrao(cargo: string): PerfilOperacional {
  const lower = cargo.toLowerCase();
  if (["administrador", "admin", "diretor"].includes(lower)) return "admin";
  if (["gerente comercial", "gerente", "gestor"].includes(lower)) return "gestor";
  if (["analista de crédito", "analista de credito", "analista"].includes(lower)) return "analista";
  return "agente";
}

function podeAtenderPadrao(cargo: string) {
  return !["captador externo", "estagiário", "estagiario"].includes(cargo.toLowerCase());
}

function podeVerTudoPadrao(perfil: string, cargo: string) {
  if (["admin", "gestor"].includes((perfil || "").toLowerCase())) return true;
  return ["administrador", "admin", "diretor", "gerente comercial", "gerente", "gestor"].includes((cargo || "").toLowerCase());
}

function labelPerfil(perfil?: string) {
  const map: Record<string, string> = {
    admin: "Admin",
    gestor: "Gestor",
    agente: "Agente",
    analista: "Analista",
  };
  return map[(perfil || "").toLowerCase()] || perfil || "—";
}

export default function UsuariosPage() {
  const { colaborador: eu } = useAuth();
  const cargoEu = (eu?.cargo || "").toLowerCase();
  const cargosPermitidos: string[] = CARGOS_CRIADOS_POR[cargoEu] ?? [];
  const podeGerenciar = cargosPermitidos.length > 0;

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [perfil, setPerfil] = useState<PerfilOperacional>("agente");
  const [podeAtenderLeads, setPodeAtenderLeads] = useState(true);
  const [podeVerTodosLeads, setPodeVerTodosLeads] = useState(false);
  const [chatwootAgenteId, setChatwootAgenteId] = useState("");
  const [criando, setCriando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [senhaCopiada, setSenhaCopiada] = useState(false);

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSenha, setEditSenha] = useState("");
  const [editCargo, setEditCargo] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editPerfil, setEditPerfil] = useState<PerfilOperacional>("agente");
  const [editPodeAtenderLeads, setEditPodeAtenderLeads] = useState(true);
  const [editPodeVerTodosLeads, setEditPodeVerTodosLeads] = useState(false);
  const [editChatwootAgenteId, setEditChatwootAgenteId] = useState("");
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [mensagemEdit, setMensagemEdit] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    if (!cargo) return;
    const perfilBase = perfilOperacionalPadrao(cargo);
    setPerfil(perfilBase);
    setPodeAtenderLeads(podeAtenderPadrao(cargo));
    setPodeVerTodosLeads(podeVerTudoPadrao(perfilBase, cargo));
  }, [cargo]);

  const resumoPerfis = useMemo(() => {
    return {
      total: colaboradores.length,
      ativos: colaboradores.filter((col) => col.ativo).length,
      atendem: colaboradores.filter((col) => col.pode_atender_leads).length,
      veemTudo: colaboradores.filter((col) => col.pode_ver_todos_leads).length,
    };
  }, [colaboradores]);

  async function carregarColaboradores() {
    setCarregando(true);
    setErroLista(null);
    try {
      const data = await apiFetch("/api/colaboradores");
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
          perfil,
          pode_atender_leads: podeAtenderLeads,
          pode_ver_todos_leads: podeVerTodosLeads,
          chatwoot_agente_id: chatwootAgenteId.trim() ? Number(chatwootAgenteId) : null,
        }),
      });

      setMensagem({
        tipo: "sucesso",
        texto: `Colaborador "${nome}" criado com sucesso.`,
      });

      setNome("");
      setEmail("");
      setCargo("");
      setTelefone("");
      setSenha("");
      setPerfil("agente");
      setPodeAtenderLeads(true);
      setPodeVerTodosLeads(false);
      setChatwootAgenteId("");
      carregarColaboradores();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar colaborador.";
      setMensagem({ tipo: "erro", texto: msg });
    }

    setCriando(false);
  }

  function abrirEdicao(col: Colaborador) {
    setEditandoId(col.id);
    setEditNome(col.nome);
    setEditEmail(col.email || "");
    setEditSenha("");
    setEditCargo(col.cargo);
    setEditTelefone(col.telefone || "");
    setEditPerfil((col.perfil || perfilOperacionalPadrao(col.cargo)) as PerfilOperacional);
    setEditPodeAtenderLeads(col.pode_atender_leads ?? podeAtenderPadrao(col.cargo));
    setEditPodeVerTodosLeads(col.pode_ver_todos_leads ?? podeVerTudoPadrao(col.perfil || perfilOperacionalPadrao(col.cargo), col.cargo));
    setEditChatwootAgenteId(col.chatwoot_agente_id ? String(col.chatwoot_agente_id) : "");
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
          email: editEmail.trim() || undefined,
          cargo: editCargo,
          telefone: editTelefone.trim() || null,
          perfil: editPerfil,
          pode_atender_leads: editPodeAtenderLeads,
          pode_ver_todos_leads: editPodeVerTodosLeads,
          chatwoot_agente_id: editChatwootAgenteId.trim() ? Number(editChatwootAgenteId) : null,
          ...(editSenha.trim() ? { senha: editSenha.trim() } : {}),
        }),
      });
      setMensagemEdit({ tipo: "sucesso", texto: "Colaborador atualizado com sucesso." });
      setTimeout(() => {
        setEditandoId(null);
        setMensagemEdit(null);
      }, 900);
      carregarColaboradores();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar.";
      setMensagemEdit({ tipo: "erro", texto: msg });
    }
    setSalvandoEdit(false);
  }

  async function toggleAtivo(id: string) {
    await apiFetch(`/api/colaboradores/${id}/toggle`, { method: "PATCH" });
    carregarColaboradores();
  }

  async function resetarSenha(col: Colaborador) {
    if (!confirm(`Gerar uma senha temporária para ${col.nome}?`)) return;
    try {
      const resp = await apiFetch(`/api/colaboradores/${col.id}/resetar-senha`, { method: "POST" });
      const temporaria = resp?.senha_temporaria || "";
      if (temporaria) {
        await navigator.clipboard.writeText(temporaria);
        setMensagemEdit({ tipo: "sucesso", texto: `Senha temporária gerada e copiada: ${temporaria}` });
      } else {
        setMensagemEdit({ tipo: "sucesso", texto: "Senha temporária gerada com sucesso." });
      }
      carregarColaboradores();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao resetar senha.";
      setMensagemEdit({ tipo: "erro", texto: msg });
    }
  }

  function copiarSenha() {
    navigator.clipboard.writeText(senha);
    setSenhaCopiada(true);
    setTimeout(() => setSenhaCopiada(false), 2000);
  }

  return (
    <Layout title="Usuários e Perfis">
      <div className="max-w-6xl mx-auto space-y-6 p-3 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Gestão de Colaboradores</h1>
            <p className="text-muted-foreground text-sm">
              Administração de usuários, perfil operacional, permissões de atendimento e base futura de Chatwoot.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{resumoPerfis.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Ativos</p>
              <p className="text-2xl font-bold text-green-700">{resumoPerfis.ativos}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Podem atender leads</p>
              <p className="text-2xl font-bold text-blue-700">{resumoPerfis.atendem}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Visão ampla</p>
              <p className="text-2xl font-bold text-purple-700">{resumoPerfis.veemTudo}</p>
            </CardContent>
          </Card>
        </div>

        {!podeGerenciar && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3 text-red-800">
                <ShieldOff className="h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Acesso restrito</p>
                  <p className="text-xs mt-0.5">
                    Seu cargo ({eu?.cargo}) não tem permissão para criar ou alterar usuários. Apenas perfis de gestão podem administrar colaboradores.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className={!podeGerenciar ? "opacity-60 pointer-events-none" : ""}>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" /> Novo colaborador
              </CardTitle>
              <CardDescription>
                Crie acessos com perfil operacional e permissões já alinhadas ao CRM atual.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleCriar} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nome-user">Nome completo <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="nome-user" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do colaborador" className="pl-9" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email-user">E-mail <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email-user" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colaborador@destrava.com.br" className="pl-9" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  </div>
                  <div className="space-y-1.5">
                    <Label>Perfil operacional</Label>
                    <Select value={perfil} onValueChange={(v) => setPerfil(v as PerfilOperacional)}>
                      <SelectTrigger>
                        <Workflow className="h-4 w-4 text-muted-foreground mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERFIS_OPERACIONAIS.map((item) => (
                          <SelectItem key={item} value={item}>{labelPerfil(item)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="telefone-user">Telefone WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="telefone-user" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(61) 99999-9999" className="pl-9" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="chatwoot-agent-id">Chatwoot agente ID</Label>
                    <Input id="chatwoot-agent-id" value={chatwootAgenteId} onChange={(e) => setChatwootAgenteId(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 42" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={podeAtenderLeads} onChange={(e) => setPodeAtenderLeads(e.target.checked)} />
                    <span>Pode atender leads</span>
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={podeVerTodosLeads} onChange={(e) => setPodeVerTodosLeads(e.target.checked)} />
                    <span>Pode ver todos os leads</span>
                  </label>
                </div>

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
                    <Button type="button" variant="outline" size="icon" onClick={() => { setSenha(gerarSenha()); setMostrarSenha(true); }}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    {senha && (
                      <Button type="button" variant="outline" size="icon" onClick={copiarSenha}>
                        {senhaCopiada ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>

                {mensagem && (
                  <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${mensagem.tipo === "sucesso" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                    {mensagem.tipo === "sucesso" ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                    <span>{mensagem.texto}</span>
                  </div>
                )}

                <Button type="submit" className="w-full h-11 font-bold" disabled={criando || !podeGerenciar}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {criando ? "Criando colaborador..." : "Criar colaborador"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-primary" /> Usuários cadastrados
                  </CardTitle>
                  <CardDescription>
                    Edição inline de perfil, atendimento, visibilidade, ativo e mapeamento futuro do Chatwoot.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={carregarColaboradores} disabled={carregando}>
                  <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {carregando ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : erroLista ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                  <AlertCircle className="h-10 w-10 text-red-400" />
                  <p className="font-medium text-red-700 text-sm">Erro ao carregar colaboradores</p>
                  <p className="text-xs text-red-500">{erroLista}</p>
                </div>
              ) : colaboradores.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Nenhum colaborador cadastrado</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[760px] overflow-y-auto pr-1">
                  {colaboradores.map((col) => (
                    <div key={col.id} className="rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors">
                      {editandoId === col.id ? (
                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Nome</Label>
                              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Cargo</Label>
                              <Select value={editCargo} onValueChange={(value) => {
                                setEditCargo(value);
                                const perfilBase = perfilOperacionalPadrao(value);
                                setEditPerfil(perfilBase);
                                setEditPodeAtenderLeads(podeAtenderPadrao(value));
                                setEditPodeVerTodosLeads(podeVerTudoPadrao(perfilBase, value));
                              }}>
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {cargosPermitidos.map((item) => (
                                    <SelectItem key={item} value={item}>{item}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">E-mail</Label>
                              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="h-9 text-sm" placeholder="colaborador@destrava.com.br" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Nova senha <span className="text-muted-foreground font-normal">(deixe em branco para não alterar)</span></Label>
                              <Input type="password" value={editSenha} onChange={(e) => setEditSenha(e.target.value)} className="h-9 text-sm" placeholder="••••••••" autoComplete="new-password" />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Telefone</Label>
                              <Input value={editTelefone} onChange={(e) => setEditTelefone(e.target.value)} className="h-9 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Perfil</Label>
                              <Select value={editPerfil} onValueChange={(value) => setEditPerfil(value as PerfilOperacional)}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {PERFIS_OPERACIONAIS.map((item) => (
                                    <SelectItem key={item} value={item}>{labelPerfil(item)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Chatwoot agente ID</Label>
                              <Input value={editChatwootAgenteId} onChange={(e) => setEditChatwootAgenteId(e.target.value.replace(/\D/g, ""))} className="h-9 text-sm" />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border bg-white p-3">
                            <label className="flex items-center gap-3 text-sm">
                              <input type="checkbox" checked={editPodeAtenderLeads} onChange={(e) => setEditPodeAtenderLeads(e.target.checked)} />
                              <span>Pode atender leads</span>
                            </label>
                            <label className="flex items-center gap-3 text-sm">
                              <input type="checkbox" checked={editPodeVerTodosLeads} onChange={(e) => setEditPodeVerTodosLeads(e.target.checked)} />
                              <span>Pode ver todos os leads</span>
                            </label>
                          </div>

                          {mensagemEdit && (
                            <p className={`text-xs px-3 py-2 rounded ${mensagemEdit.tipo === "sucesso" ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"}`}>
                              {mensagemEdit.texto}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1" onClick={() => salvarEdicao(col.id)} disabled={salvandoEdit}>
                              <Save className="h-3.5 w-3.5 mr-1" />
                              {salvandoEdit ? "Salvando..." : "Salvar"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelarEdicao}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-sm truncate">{col.nome}</p>
                                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${badgeCargo(col.cargo)}`}>{col.cargo}</span>
                                <Badge variant="outline">{labelPerfil(col.perfil)}</Badge>
                                <Badge variant={col.ativo ? "default" : "secondary"} className={col.ativo ? "bg-green-600 hover:bg-green-700" : ""}>
                                  {col.ativo ? "Ativo" : "Inativo"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{col.email || "Sem e-mail"}</p>
                              <p className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
                                <span>Telefone: {col.telefone || "—"}</span>
                                <span>Atende leads: {col.pode_atender_leads ? "Sim" : "Não"}</span>
                                <span>Visão ampla: {col.pode_ver_todos_leads ? "Sim" : "Não"}</span>
                                <span>Chatwoot agente: {col.chatwoot_agente_id ?? "—"}</span>
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
                              {podeGerenciar && (
                                <Button size="sm" variant="outline" onClick={() => abrirEdicao(col)}>
                                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                </Button>
                              )}
                              {podeGerenciar && (
                                <Button size="sm" variant="ghost" onClick={() => resetarSenha(col)} className="hidden sm:inline-flex">
                                  <Lock className="h-3.5 w-3.5 mr-1" /> Resetar senha
                                </Button>
                              )}
                              {podeGerenciar && (
                                <Button size="sm" variant="ghost" onClick={() => toggleAtivo(col.id)}>
                                  {col.ativo ? "Desativar" : "Ativar"}
                                </Button>
                              )}
                            </div>
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

        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-3 text-sm text-blue-900 w-full">
                <p className="font-semibold">Referência operacional</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-blue-100/80">
                        <th className="text-left px-3 py-2 rounded-tl-lg font-semibold">Cargo</th>
                        <th className="text-left px-3 py-2 font-semibold">Perfil sugerido</th>
                        <th className="text-center px-3 py-2 font-semibold">Pode atender</th>
                        <th className="text-center px-3 py-2 rounded-tr-lg font-semibold">Pode ver todos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100">
                      {TODOS_CARGOS.map((item) => {
                        const perfilBase = perfilOperacionalPadrao(item);
                        return (
                          <tr key={item} className="bg-white/60 hover:bg-white/90">
                            <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded border font-medium ${badgeCargo(item)}`}>{item}</span></td>
                            <td className="px-3 py-2">{labelPerfil(perfilBase)}</td>
                            <td className="text-center px-3 py-2">{podeAtenderPadrao(item) ? "Sim" : "Não"}</td>
                            <td className="text-center px-3 py-2">{podeVerTudoPadrao(perfilBase, item) ? "Sim" : "Não"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
