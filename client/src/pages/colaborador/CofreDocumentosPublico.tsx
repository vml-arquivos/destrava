import { useCallback, useEffect, useState } from "react";
import Layout from "./Layout";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Loader2, ShieldCheck, XCircle } from "lucide-react";

type Item = {
  id: string;
  dossie_id?: string | null;
  tipo_pessoa: "pf" | "pj";
  nome_remetente: string;
  documento_tipo?: string | null;
  nome_organizacao?: string | null;
  email_remetente?: string | null;
  telefone_remetente?: string | null;
  tipo_documento: string;
  descricao_documento?: string | null;
  nome_original: string;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  status: string;
  criado_em: string;
  analise_status?: string | null;
  motivo_revisao?: string | null;
};

function labelType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CofreDocumentosPublico() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/coleta-documentos-livre/interno/pendencias");
      setItems(data?.items || []);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Não foi possível carregar o cofre.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function download(id: string) {
    setWorking(id);
    try {
      const result = await apiFetchBlob(`/api/coleta-documentos-livre/interno/${id}/arquivo`);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename || "documento-cofre";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Não foi possível baixar o documento.");
    } finally {
      setWorking("");
    }
  }

  async function review(id: string, status: "aceito" | "recusado") {
    setWorking(id);
    try {
      await apiFetch(`/api/coleta-documentos-livre/interno/${id}/revisao`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Não foi possível atualizar a revisão.");
    } finally {
      setWorking("");
    }
  }

  return (
    <Layout title="Cofre documental público">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" /><div><h1 className="text-xl font-black text-violet-950">Cofre documental público</h1><p className="mt-1 text-sm leading-6 text-violet-900">Arquivos enviados pelo link livre ficam aqui para conferência. Eles não entram automaticamente em empresas, clientes PF, leads ou no Acervo Documental.</p></div></div>
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando pendências...</div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Nenhum documento aguardando conferência.</div> : <div className="grid gap-4">{items.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-muted px-2 py-1 text-[11px] font-bold uppercase">{item.tipo_pessoa}</span><span className="rounded-full bg-warning/10 px-2 py-1 text-[11px] font-bold text-warning">{item.status}</span><span className="text-xs text-muted-foreground">{new Date(item.criado_em).toLocaleString("pt-BR")}</span>{item.dossie_id && <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">Dossiê {item.dossie_id.slice(0, 8)}</span>}</div><h2 className="truncate text-base font-bold">{item.nome_remetente}{item.nome_organizacao ? ` — ${item.nome_organizacao}` : ""}</h2><p className="flex items-center gap-2 text-sm text-foreground"><FileText className="h-4 w-4 text-primary" />{labelType(item.tipo_documento)} · {item.nome_original}</p><p className="text-xs leading-5 text-muted-foreground">{item.email_remetente || "Sem e-mail"}{item.telefone_remetente ? ` · ${item.telefone_remetente}` : ""}{item.documento_tipo ? ` · ${item.documento_tipo.toUpperCase()} informado` : ""}</p>{item.descricao_documento && <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">{item.descricao_documento}</p>}</div><div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void download(item.id)} disabled={working === item.id}><FileText className="mr-1.5 h-4 w-4" />Baixar</Button><Button size="sm" onClick={() => void review(item.id, "aceito")} disabled={working === item.id}><ShieldCheck className="mr-1.5 h-4 w-4" />Aceitar no cofre</Button><Button size="sm" variant="outline" onClick={() => void review(item.id, "recusado")} disabled={working === item.id}><XCircle className="mr-1.5 h-4 w-4" />Recusar</Button></div></div></article>)}</div>}
        </div>
      </div>
    </Layout>
  );
}
