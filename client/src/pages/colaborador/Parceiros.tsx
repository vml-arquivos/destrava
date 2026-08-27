import { useEffect, useMemo, useState } from "react";
import Layout from "./Layout";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BadgeDollarSign,
  CheckCircle2,
  Download,
  Handshake,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  email?: string | null;
  telefone?: string | null;
  rg?: string | null;
  data_nascimento?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  percentual_comissao?: number | string | null;
  observacoes?: string | null;
  ativo?: boolean;
  logo_url?: string | null;
  cabecalho_html?: string | null;
  rodape_html?: string | null;
  cor_primaria?: string | null;
  cor_secundaria?: string | null;
  created_at?: string | null;
}

type ParceiroForm = Omit<Parceiro, "id" | "created_at">;

const EMPTY_FORM: ParceiroForm = {
  nome: "",
  cpf: "",
  email: "",
  telefone: "",
  rg: "",
  data_nascimento: "",
  estado_civil: "",
  profissao: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
  percentual_comissao: "",
  observacoes: "",
  ativo: true,
  logo_url: "",
  cabecalho_html: "",
  rodape_html: "",
  cor_primaria: "",
  cor_secundaria: "",
};

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

function formatarCep(value: string) {
  return value.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
}

function vazioParaNulo(value: unknown) {
  const texto = String(value ?? "").trim();
  return texto || null;
}

export default function ParceirosPage() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [form, setForm] = useState<ParceiroForm>({ ...EMPTY_FORM });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ParceiroForm>({ ...EMPTY_FORM });
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [gerandoFichaId, setGerandoFichaId] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const data = await apiFetch("/api/parceiros");
      setParceiros(Array.isArray(data) ? data : data?.parceiros ?? data?.rows ?? []);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar parceiros.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  function atualizarForm(setter: React.Dispatch<React.SetStateAction<ParceiroForm>>, campo: keyof ParceiroForm, valor: unknown) {
    setter((atual) => ({ ...atual, [campo]: valor }));
  }

  function payload(formulario: ParceiroForm) {
    return {
      ...formulario,
      nome: formulario.nome.trim(),
      cpf: formulario.cpf.replace(/\D/g, ""),
      email: vazioParaNulo(formulario.email),
      telefone: vazioParaNulo(formulario.telefone),
      rg: vazioParaNulo(formulario.rg),
      data_nascimento: vazioParaNulo(formulario.data_nascimento),
      estado_civil: vazioParaNulo(formulario.estado_civil),
      profissao: vazioParaNulo(formulario.profissao),
      endereco: vazioParaNulo(formulario.endereco),
      numero: vazioParaNulo(formulario.numero),
      complemento: vazioParaNulo(formulario.complemento),
      bairro: vazioParaNulo(formulario.bairro),
      cidade: vazioParaNulo(formulario.cidade),
      uf: vazioParaNulo(formulario.uf)?.toString().toUpperCase().slice(0, 2) || null,
      cep: vazioParaNulo(formulario.cep),
      percentual_comissao: formulario.percentual_comissao === "" || formulario.percentual_comissao === null ? null : Number(formulario.percentual_comissao),
      observacoes: vazioParaNulo(formulario.observacoes),
      logo_url: vazioParaNulo(formulario.logo_url),
      cabecalho_html: vazioParaNulo(formulario.cabecalho_html),
      rodape_html: vazioParaNulo(formulario.rodape_html),
      cor_primaria: vazioParaNulo(formulario.cor_primaria),
      cor_secundaria: vazioParaNulo(formulario.cor_secundaria),
      ativo: formulario.ativo !== false,
    };
  }

  async function salvarNovo(event: React.FormEvent) {
    event.preventDefault();
    if (!form.nome.trim() || !form.cpf.trim()) {
      toast.error("Nome e CPF são obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      await apiFetch("/api/parceiros", { method: "POST", body: JSON.stringify(payload(form)) });
      toast.success("Parceiro cadastrado com sucesso.");
      setForm({ ...EMPTY_FORM });
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao cadastrar parceiro.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(parceiro: Parceiro) {
    setEditandoId(parceiro.id);
    setEditForm({
      nome: parceiro.nome || "",
      cpf: parceiro.cpf || "",
      email: parceiro.email || "",
      telefone: parceiro.telefone || "",
      rg: parceiro.rg || "",
      data_nascimento: parceiro.data_nascimento?.slice(0, 10) || "",
      estado_civil: parceiro.estado_civil || "",
      profissao: parceiro.profissao || "",
      endereco: parceiro.endereco || "",
      numero: parceiro.numero || "",
      complemento: parceiro.complemento || "",
      bairro: parceiro.bairro || "",
      cidade: parceiro.cidade || "",
      uf: parceiro.uf || "",
      cep: parceiro.cep || "",
      percentual_comissao: parceiro.percentual_comissao ?? "",
      observacoes: parceiro.observacoes || "",
      ativo: parceiro.ativo !== false,
      logo_url: parceiro.logo_url || "",
      cabecalho_html: parceiro.cabecalho_html || "",
      rodape_html: parceiro.rodape_html || "",
      cor_primaria: parceiro.cor_primaria || "",
      cor_secundaria: parceiro.cor_secundaria || "",
    });
  }

  async function salvarEdicao() {
    if (!editandoId) return;
    if (!editForm.nome.trim() || !editForm.cpf.trim()) {
      toast.error("Nome e CPF são obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      await apiFetch(`/api/parceiros/${editandoId}`, { method: "PATCH", body: JSON.stringify(payload(editForm)) });
      toast.success("Parceiro atualizado com sucesso.");
      setEditandoId(null);
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar parceiro.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    if (!confirm("Confirma a exclusão deste parceiro?")) return;
    setExcluindoId(id);
    try {
      await apiFetch(`/api/parceiros/${id}`, { method: "DELETE" });
      toast.success("Parceiro excluído.");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir parceiro.");
    } finally {
      setExcluindoId(null);
    }
  }

  async function baixarFicha(parceiro: Parceiro) {
    setGerandoFichaId(parceiro.id);
    try {
      const { blob, filename } = await apiFetchBlob(`/api/parceiros/${parceiro.id}/ficha/pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || `ficha-parceiro-${parceiro.nome.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Ficha cadastral gerada com sucesso.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar ficha cadastral.");
    } finally {
      setGerandoFichaId(null);
    }
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return parceiros;
    return parceiros.filter((parceiro) => [parceiro.nome, parceiro.cpf, parceiro.email, parceiro.telefone, parceiro.cidade]
      .some((campo) => String(campo || "").toLowerCase().includes(termo)));
  }, [parceiros, busca]);

  function renderCampos(formulario: ParceiroForm, setter: React.Dispatch<React.SetStateAction<ParceiroForm>>, prefixo: string) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground mb-3">Dados pessoais</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2 space-y-1.5"><Label>Nome completo <span className="text-destructive">*</span></Label><Input value={formulario.nome} onChange={(e) => atualizarForm(setter, "nome", e.target.value)} placeholder="Nome completo" /></div>
            <div className="space-y-1.5"><Label>CPF <span className="text-destructive">*</span></Label><Input value={formulario.cpf} onChange={(e) => atualizarForm(setter, "cpf", formatarCpf(e.target.value))} placeholder="000.000.000-00" /></div>
            <div className="space-y-1.5"><Label>RG</Label><Input value={formulario.rg || ""} onChange={(e) => atualizarForm(setter, "rg", e.target.value)} placeholder="Documento de identidade" /></div>
            <div className="space-y-1.5"><Label>Data de nascimento</Label><Input type="date" value={String(formulario.data_nascimento || "")} onChange={(e) => atualizarForm(setter, "data_nascimento", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Estado civil</Label><Input value={formulario.estado_civil || ""} onChange={(e) => atualizarForm(setter, "estado_civil", e.target.value)} placeholder="Solteiro(a), casado(a)..." /></div>
            <div className="space-y-1.5"><Label>Profissão</Label><Input value={formulario.profissao || ""} onChange={(e) => atualizarForm(setter, "profissao", e.target.value)} placeholder="Profissão" /></div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground mb-3">Contato e endereço</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={formulario.email || ""} onChange={(e) => atualizarForm(setter, "email", e.target.value)} placeholder="email@exemplo.com" /></div>
            <div className="space-y-1.5"><Label>Telefone</Label><Input value={formulario.telefone || ""} onChange={(e) => atualizarForm(setter, "telefone", formatarTelefone(e.target.value))} placeholder="(61) 99999-9999" /></div>
            <div className="md:col-span-2 space-y-1.5"><Label>Endereço</Label><Input value={formulario.endereco || ""} onChange={(e) => atualizarForm(setter, "endereco", e.target.value)} placeholder="Logradouro" /></div>
            <div className="space-y-1.5"><Label>Número</Label><Input value={formulario.numero || ""} onChange={(e) => atualizarForm(setter, "numero", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Complemento</Label><Input value={formulario.complemento || ""} onChange={(e) => atualizarForm(setter, "complemento", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Bairro</Label><Input value={formulario.bairro || ""} onChange={(e) => atualizarForm(setter, "bairro", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>CEP</Label><Input value={formulario.cep || ""} onChange={(e) => atualizarForm(setter, "cep", formatarCep(e.target.value))} placeholder="00000-000" /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input value={formulario.cidade || ""} onChange={(e) => atualizarForm(setter, "cidade", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>UF</Label><Input maxLength={2} value={formulario.uf || ""} onChange={(e) => atualizarForm(setter, "uf", e.target.value.toUpperCase())} placeholder="DF" /></div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground mb-3">Parceria e contrato</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Percentual de comissão</Label><Input type="number" min="0" max="100" step="0.01" value={String(formulario.percentual_comissao ?? "")} onChange={(e) => atualizarForm(setter, "percentual_comissao", e.target.value)} placeholder="Ex.: 10" /></div>
            <div className="space-y-1.5"><Label>URL do logo</Label><Input type="url" value={formulario.logo_url || ""} onChange={(e) => atualizarForm(setter, "logo_url", e.target.value)} placeholder="https://..." /></div>
            <div className="md:col-span-2 space-y-1.5"><Label>Observações</Label><Textarea value={formulario.observacoes || ""} onChange={(e) => atualizarForm(setter, "observacoes", e.target.value)} placeholder="Observações internas da parceria" rows={3} /></div>
            <div className="space-y-1.5"><Label>Cor primária</Label><Input value={formulario.cor_primaria || ""} onChange={(e) => atualizarForm(setter, "cor_primaria", e.target.value)} placeholder="#1B3A8C" /></div>
            <div className="space-y-1.5"><Label>Cor secundária</Label><Input value={formulario.cor_secundaria || ""} onChange={(e) => atualizarForm(setter, "cor_secundaria", e.target.value)} placeholder="#F0A500" /></div>
            <div className="md:col-span-2 space-y-1.5"><Label>HTML do cabeçalho do contrato</Label><Textarea value={formulario.cabecalho_html || ""} onChange={(e) => atualizarForm(setter, "cabecalho_html", e.target.value)} placeholder="<div>...</div>" rows={2} className="font-mono text-xs" /></div>
            <div className="md:col-span-2 space-y-1.5"><Label>HTML do rodapé do contrato</Label><Textarea value={formulario.rodape_html || ""} onChange={(e) => atualizarForm(setter, "rodape_html", e.target.value)} placeholder="<div>...</div>" rows={2} className="font-mono text-xs" /></div>
            <label className="md:col-span-2 flex items-center gap-3 rounded-lg border bg-muted/20 p-3 text-sm"><input type="checkbox" checked={formulario.ativo !== false} onChange={(e) => atualizarForm(setter, "ativo", e.target.checked)} /> Parceiro ativo</label>
          </div>
        </div>
        <span className="sr-only">{prefixo}</span>
      </div>
    );
  }

  return (
    <Layout title="Parceiros">
      <div className="max-w-7xl mx-auto space-y-6 p-3 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl"><Handshake className="h-6 w-6 text-primary" /></div>
            <div><h1 className="text-2xl font-bold">Parceiros</h1><p className="text-muted-foreground text-sm">Cadastro completo, acompanhamento e fichas cadastrais dos parceiros comerciais.</p></div>
          </div>
          <Button onClick={() => document.getElementById("novo-parceiro")?.scrollIntoView({ behavior: "smooth" })}><Plus className="h-4 w-4 mr-2" /> Novo parceiro</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{parceiros.length}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Ativos</p><p className="text-2xl font-bold text-success">{parceiros.filter((p) => p.ativo !== false).length}</p></div>
          <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Com identidade contratual</p><p className="text-2xl font-bold text-primary">{parceiros.filter((p) => p.logo_url || p.cabecalho_html || p.rodape_html).length}</p></div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-5 items-start">
          <section id="novo-parceiro" className="rounded-2xl border bg-card shadow-sm">
            <div className="p-5 border-b"><h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Cadastrar parceiro</h2><p className="text-sm text-muted-foreground mt-1">Preencha os dados cadastrais e comerciais. Nome e CPF são obrigatórios.</p></div>
            <form onSubmit={salvarNovo} className="p-5">
              {renderCampos(form, setForm, "novo")}
              <Button type="submit" className="w-full mt-5" disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}{salvando ? "Salvando..." : "Cadastrar parceiro"}</Button>
            </form>
          </section>

          <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between gap-3"><div><h2 className="font-semibold flex items-center gap-2"><Handshake className="h-4 w-4 text-primary" /> Parceiros cadastrados</h2><p className="text-sm text-muted-foreground mt-1">Edite dados, acompanhe o status ou imprima a ficha completa.</p></div><Button variant="ghost" size="icon" onClick={carregar} disabled={carregando}><RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /></Button></div>
            <div className="p-4 border-b"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, CPF, e-mail, telefone ou cidade..." /></div>
            <div className="p-4">
              {carregando ? <div className="py-12 flex justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div> : filtrados.length === 0 ? <div className="py-12 text-center text-muted-foreground"><Handshake className="h-10 w-10 mx-auto mb-3 opacity-20" /><p>{busca ? "Nenhum parceiro encontrado." : "Nenhum parceiro cadastrado."}</p></div> : <div className="space-y-3 max-h-[1050px] overflow-y-auto pr-1">{filtrados.map((parceiro) => <div key={parceiro.id} className="rounded-xl border bg-muted/20">{editandoId === parceiro.id ? <div className="p-4">{renderCampos(editForm, setEditForm, `edit-${parceiro.id}`)}<div className="flex gap-2 mt-5"><Button className="flex-1" onClick={salvarEdicao} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Salvar alterações</Button><Button variant="outline" onClick={() => setEditandoId(null)}><X className="h-4 w-4" /></Button></div></div> : <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-sm">{parceiro.nome}</p><Badge variant={parceiro.ativo === false ? "secondary" : "default"} className={parceiro.ativo === false ? "" : "bg-success hover:bg-success"}>{parceiro.ativo === false ? "Inativo" : "Ativo"}</Badge>{parceiro.percentual_comissao !== null && parceiro.percentual_comissao !== undefined && <Badge variant="outline"><BadgeDollarSign className="h-3 w-3 mr-1" /> {parceiro.percentual_comissao}%</Badge>}</div><p className="text-xs text-muted-foreground mt-1">CPF: {parceiro.cpf || "—"}{parceiro.email ? ` · ${parceiro.email}` : ""}</p><p className="text-xs text-muted-foreground mt-1">{parceiro.telefone || "Sem telefone"}{parceiro.cidade ? ` · ${parceiro.cidade}${parceiro.uf ? `/${parceiro.uf}` : ""}` : ""}</p><div className="flex items-center gap-2 mt-2">{parceiro.logo_url || parceiro.cabecalho_html || parceiro.rodape_html ? <span className="text-xs text-primary">Identidade contratual configurada</span> : <span className="text-xs text-muted-foreground">Identidade contratual não configurada</span>}</div></div><div className="flex items-center gap-1 shrink-0"><Button size="sm" variant="outline" onClick={() => baixarFicha(parceiro)} disabled={gerandoFichaId === parceiro.id}>{gerandoFichaId === parceiro.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}<span className="hidden sm:inline ml-1">Ficha PDF</span></Button><Button size="sm" variant="ghost" onClick={() => iniciarEdicao(parceiro)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => excluir(parceiro.id)} disabled={excluindoId === parceiro.id} title="Excluir">{excluindoId === parceiro.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</Button></div></div></div>}</div>)}</div>}
            </div>
          </section>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary flex items-start gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" /><p>A ficha PDF apresenta somente dados cadastrais e comerciais do parceiro. Credenciais de acesso e dados de autenticação nunca entram na ficha.</p></div>
      </div>
    </Layout>
  );
}
