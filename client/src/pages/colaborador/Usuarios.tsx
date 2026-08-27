import { useEffect, useMemo, useState } from "react";
import Layout from "./Layout";
import FichaPreviewModal from "@/components/FichaPreviewModal";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
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
  Camera,
  Download,

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
  foto_url?: string | null;
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
  if (lower === "administrador") return "bg-primary/20 text-primary border-primary/30";
  if (lower === "diretor") return "bg-primary/20 text-primary border-primary/30";
  if (lower === "gerente comercial") return "bg-primary/20 text-primary border-primary/30";
  if (lower === "analista de crédito") return "bg-primary/20 text-primary border-primary/30";
  if (lower === "consultor de crédito") return "bg-success/20 text-success border-success/30";
  if (lower === "captador externo") return "bg-warning/20 text-warning border-warning/30";
  if (lower === "estagiário") return "bg-muted text-muted-foreground border-input";
  return "bg-muted text-foreground border-input";
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
  const [fotoNova, setFotoNova] = useState<File | null>(null);
  const [fotoNovaPreview, setFotoNovaPreview] = useState<string | null>(null);

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
  const [editFoto, setEditFoto] = useState<File | null>(null);
  const [editFotoPreview, setEditFotoPreview] = useState<string | null>(null);
  const [gerandoFichaId, setGerandoFichaId] = useState<string | null>(null);
  const [fichaPreviewId, setFichaPreviewId] = useState<string | null>(null);
  const [fichaPreviewTitle, setFichaPreviewTitle] = useState("");
  const [fichaPreviewHtml, setFichaPreviewHtml] = useState<string | null>(null);
  const [fichaPreviewOpen, setFichaPreviewOpen] = useState(false);
  const [baixandoFicha, setBaixandoFicha] = useState(false);

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
      const criado = await apiFetch("/api/colaboradores", {
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

      let avisoFoto = "";
      if (fotoNova && criado?.id) {
        try {
          await enviarFotoColaborador(String(criado.id), fotoNova);
        } catch (err: any) {
          avisoFoto = ` A foto não foi salva: ${err?.message || "erro no upload"}`;
        }
      }
      setMensagem({
        tipo: avisoFoto ? "erro" : "sucesso",
        texto: `Colaborador "${nome}" criado com sucesso.${avisoFoto}`,
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
      setFotoNova(null);
      setFotoNovaPreview(null);
      carregarColaboradores();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao criar colaborador.";
      setMensagem({ tipo: "erro", texto: msg });
    }

    setCriando(false);
  }

  function prepararFoto(file: File | undefined, setter: (file: File | null) => void, previewSetter: (url: string | null) => void, mensagemSetter: (value: { tipo: "sucesso" | "erro"; texto: string } | null) => void) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      mensagemSetter({ tipo: "erro", texto: "A foto deve estar em JPG, PNG ou WebP." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      mensagemSetter({ tipo: "erro", texto: "A foto deve ter no máximo 2 MB." });
      return;
    }
    setter(file);
    previewSetter(URL.createObjectURL(file));
    mensagemSetter(null);
  }

  async function enviarFotoColaborador(id: string, file: File) {
    const body = new FormData();
    body.append("foto", file);
    await apiFetch(`/api/colaboradores/${id}/foto`, { method: "POST", body });
  }

  async function visualizarFichaColaborador(col: Colaborador) {
    setGerandoFichaId(col.id);
    setFichaPreviewId(col.id);
    setFichaPreviewTitle(`Ficha Cadastral — ${col.nome}`);
    setFichaPreviewHtml(null);
    setFichaPreviewOpen(true);
    try {
      const preview = await apiFetch(`/api/colaboradores/${col.id}/ficha/preview`);
      if (!preview?.html) throw new Error("A visualização da ficha não foi disponibilizada.");
      setFichaPreviewTitle(preview.title || `Ficha Cadastral — ${col.nome}`);
      setFichaPreviewHtml(preview.html);
    } catch (err: unknown) {
      setFichaPreviewOpen(false);
      setFichaPreviewId(null);
      setFichaPreviewHtml(null);
      const msg = err instanceof Error ? err.message : "Erro ao preparar visualização da ficha cadastral.";
      toast.error(msg);
    } finally {
      setGerandoFichaId(null);
    }
  }

  async function baixarFichaColaborador() {
    if (!fichaPreviewId) return;
    setBaixandoFicha(true);
    try {
      const { blob, filename, contentType } = await apiFetchBlob(`/api/colaboradores/${fichaPreviewId}/ficha/pdf`);
      if (!contentType?.toLowerCase().includes("application/pdf")) throw new Error("O servidor não retornou um PDF válido.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `ficha-colaborador-${fichaPreviewTitle.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Ficha cadastral baixada com sucesso.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar ficha cadastral.";
      toast.error(msg);
    } finally {
      setBaixandoFicha(false);
    }
  }

  function fecharFichaPreview() {
    setFichaPreviewOpen(false);
    setFichaPreviewId(null);
    setFichaPreviewTitle("");
    setFichaPreviewHtml(null);
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
    setEditFoto(null);
    setEditFotoPreview(col.foto_url || null);
    setMensagemEdit(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditFoto(null);
    setEditFotoPreview(null);
    setMensagemEdit(null);
  }

  async function salvarEdicao(id: string) {
    const autoedicao = String(eu?.id) === String(id);
    if (!editNome.trim() || (!autoedicao && !editCargo)) {
      setMensagemEdit({ tipo: "erro", texto: autoedicao ? "Informe seu nome." : "Nome e cargo são obrigatórios." });
      return;
    }
    if (!autoedicao && CARGOS_TELEFONE_OBRIGATORIO.includes(editCargo.toLowerCase()) && !editTelefone.trim()) {
      setMensagemEdit({ tipo: "erro", texto: "Captadores Externos precisam de telefone." });
      return;
    }

    setSalvandoEdit(true);
    try {
      const dadosEdicao: Record<string, unknown> = {
        nome: editNome.trim(),
        email: editEmail.trim() || undefined,
        telefone: editTelefone.trim() || null,
        ...(editSenha.trim() ? { senha: editSenha.trim() } : {}),
      };
      if (!autoedicao) {
        Object.assign(dadosEdicao, {
          cargo: editCargo,
          perfil: editPerfil,
          pode_atender_leads: editPodeAtenderLeads,
          pode_ver_todos_leads: editPodeVerTodosLeads,
          chatwoot_agente_id: editChatwootAgenteId.trim() ? Number(editChatwootAgenteId) : null,
        });
      }
      await apiFetch(`/api/colaboradores/${id}`, {
        method: "PATCH",
        body: JSON.stringify(dadosEdicao),
      });
      let avisoFoto = "";
      if (editFoto) {
        try {
          await enviarFotoColaborador(id, editFoto);
        } catch (err: any) {
          avisoFoto = ` A foto não foi salva: ${err?.message || "erro no upload"}`;
        }
      }
      setMensagemEdit({ tipo: avisoFoto ? "erro" : "sucesso", texto: `Colaborador atualizado com sucesso.${avisoFoto}` });
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
              <p className="text-2xl font-bold text-success">{resumoPerfis.ativos}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Podem atender leads</p>
              <p className="text-2xl font-bold text-primary">{resumoPerfis.atendem}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">Visão ampla</p>
              <p className="text-2xl font-bold text-primary">{resumoPerfis.veemTudo}</p>
            </CardContent>
          </Card>
        </div>

        {!podeGerenciar && (
          <Card className="border-destructive/20 bg-destructive/10">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3 text-destructive">
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

                <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
                  {fotoNovaPreview ? (
                    <img src={fotoNovaPreview} alt="Pré-visualização da foto" className="h-16 w-16 rounded-xl object-cover border" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl border border-dashed flex items-center justify-center text-muted-foreground"><Camera className="h-5 w-5" /></div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="foto-user">Foto do colaborador <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                    <Input id="foto-user" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => prepararFoto(e.target.files?.[0], setFotoNova, setFotoNovaPreview, setMensagem)} className="text-xs" />
                    <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, até 2 MB. Aparecerá na ficha e no PDF.</p>
                  </div>
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
                        {senhaCopiada ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>

                {mensagem && (
                  <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${mensagem.tipo === "sucesso" ? "bg-success/10 border border-success/20 text-success" : "bg-destructive/10 border border-destructive/20 text-destructive"}`}>
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
                  <AlertCircle className="h-10 w-10 text-destructive" />
                  <p className="font-medium text-destructive text-sm">Erro ao carregar colaboradores</p>
                  <p className="text-xs text-destructive">{erroLista}</p>
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
                              <Select value={editCargo} disabled={String(eu?.id) === String(col.id)} onValueChange={(value) => {
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
                                  {String(eu?.id) === String(col.id) && !cargosPermitidos.includes(editCargo) && <SelectItem value={editCargo} disabled>{editCargo} (atual)</SelectItem>}
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
                              <Select value={editPerfil} disabled={String(eu?.id) === String(col.id)} onValueChange={(value) => setEditPerfil(value as PerfilOperacional)}>
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
                              <Input value={editChatwootAgenteId} disabled={String(eu?.id) === String(col.id)} onChange={(e) => setEditChatwootAgenteId(e.target.value.replace(/\D/g, ""))} className="h-9 text-sm" />
                            </div>
                          </div>

                          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
                            {editFotoPreview ? (
                              <img src={editFotoPreview} alt="Foto atual do colaborador" className="h-16 w-16 rounded-xl object-cover border" />
                            ) : (
                              <div className="h-16 w-16 rounded-xl border border-dashed flex items-center justify-center text-muted-foreground"><Camera className="h-5 w-5" /></div>
                            )}
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <Label htmlFor={`foto-edit-${col.id}`}>Foto do colaborador <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                              <Input id={`foto-edit-${col.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => prepararFoto(e.target.files?.[0], setEditFoto, setEditFotoPreview, setMensagemEdit)} className="text-xs" />
                              <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, até 2 MB.</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border bg-card p-3">
                            <label className="flex items-center gap-3 text-sm">
                              <input type="checkbox" disabled={String(eu?.id) === String(col.id)} checked={editPodeAtenderLeads} onChange={(e) => setEditPodeAtenderLeads(e.target.checked)} />
                              <span>Pode atender leads</span>
                            </label>
                            <label className="flex items-center gap-3 text-sm">
                              <input type="checkbox" disabled={String(eu?.id) === String(col.id)} checked={editPodeVerTodosLeads} onChange={(e) => setEditPodeVerTodosLeads(e.target.checked)} />
                              <span>Pode ver todos os leads</span>
                            </label>
                          </div>

                          {mensagemEdit && (
                            <p className={`text-xs px-3 py-2 rounded ${mensagemEdit.tipo === "sucesso" ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
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
                            <div className="flex items-start gap-3 min-w-0">
                              {col.foto_url ? (
                                <img src={col.foto_url} alt={`Foto de ${col.nome}`} className="h-12 w-12 rounded-xl object-cover border flex-shrink-0" />
                              ) : (
                                <div className="h-12 w-12 rounded-xl border border-dashed flex items-center justify-center text-muted-foreground flex-shrink-0"><User className="h-5 w-5" /></div>
                              )}
                              <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-sm truncate">{col.nome}</p>
                                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${badgeCargo(col.cargo)}`}>{col.cargo}</span>
                                <Badge variant="outline">{labelPerfil(col.perfil)}</Badge>
                                <Badge variant={col.ativo ? "default" : "secondary"} className={col.ativo ? "bg-success hover:bg-success" : ""}>
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
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
                              <Button size="sm" variant="outline" onClick={() => visualizarFichaColaborador(col)} disabled={gerandoFichaId === col.id}>
                                {gerandoFichaId === col.id ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-1" />} Visualizar ficha
                              </Button>
                              {(podeGerenciar || String(eu?.id) === String(col.id)) && (
                                <Button size="sm" variant="outline" onClick={() => abrirEdicao(col)}>
                                  <Pencil className="h-3.5 w-3.5 mr-1" /> {String(eu?.id) === String(col.id) ? "Editar meu cadastro" : "Editar"}
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

        <Card className="border-primary/20 bg-primary/10/50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-3 text-sm text-primary w-full">
                <p className="font-semibold">Referência operacional</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-primary/20/80">
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
                          <tr key={item} className="bg-card/60 hover:bg-card/90">
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
      <FichaPreviewModal
        open={fichaPreviewOpen}
        title={fichaPreviewTitle}
        html={fichaPreviewHtml}
        downloading={baixandoFicha}
        onClose={fecharFichaPreview}
        onDownload={baixarFichaColaborador}
      />
    </Layout>
  );
}
