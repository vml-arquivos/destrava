import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileUp, Loader2, Lock, Shield, User, Building2 } from "lucide-react";

type DocumentType = { codigo: string; nome: string };

type LinkState = {
  tipos_documento?: DocumentType[];
  limite_arquivo_mb?: number;
  finalidade?: string;
  expira_em?: string;
};

function formatDocument(value: string, type: "pf" | "pj"): string {
  const digits = value.replace(/\D/g, "").slice(0, type === "pf" ? 11 : 14);
  if (type === "pf") return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return digits.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function ColetaDocumentosLivre() {
  const token = useMemo(() => window.location.pathname.split("/").filter(Boolean).pop() || "", []);
  const [state, setState] = useState<LinkState | null>(null);
  const [dossierToken, setDossierToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<"pf" | "pj">("pj");
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [organizacao, setOrganizacao] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState("outros");
  const [descricao, setDescricao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [consentimento, setConsentimento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    try { setDossierToken(sessionStorage.getItem(`cofre-dossie:${token}`) || ""); } catch { /* storage indisponível: o envio ainda funciona em sessão única */ }
    let active = true;
    async function load() {
      if (!token) { setError("Link inválido ou incompleto."); setLoading(false); return; }
      try {
        const response = await fetch(`/api/coleta-documentos-livre/${encodeURIComponent(token)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Este link está indisponível.");
        if (active) setState(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Este link está indisponível.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [token]);

  function changePessoa(value: "pf" | "pj") {
    setTipoPessoa(value);
    setDocumento("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    // Este link é usado por remetentes de fora da base (sem empresa/lead vinculado),
    // então a identificação é obrigatória aqui -- diferente do link de coleta vinculado
    // a uma empresa já cadastrada, onde esses dados já existem.
    const documentoDigits = documento.replace(/\D/g, "");
    const documentoEsperado = tipoPessoa === "pf" ? 11 : 14;
    if (!nome.trim()) { setError("Informe o nome do responsável."); return; }
    if (documentoDigits.length !== documentoEsperado) { setError(tipoPessoa === "pf" ? "Informe um CPF válido." : "Informe um CNPJ válido."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Informe um e-mail válido."); return; }
    if (telefone.replace(/\D/g, "").length < 10) { setError("Informe um telefone válido, com DDD."); return; }
    if (!arquivo) { setError("Escolha um arquivo para enviar."); return; }
    if (!consentimento) { setError("Aceite o uso dos dados para enviar o documento."); return; }
    setEnviando(true);
    try {
      const body = new FormData();
      body.append("file", arquivo);
      body.append("tipo_pessoa", tipoPessoa);
      body.append("nome_remetente", nome);
      body.append("documento_tipo", documento ? (tipoPessoa === "pf" ? "cpf" : "cnpj") : "");
      body.append("documento_valor", documento.replace(/\D/g, ""));
      body.append("nome_organizacao", organizacao);
      body.append("email_remetente", email);
      body.append("telefone_remetente", telefone);
      body.append("tipo_documento", tipoDocumento);
      body.append("descricao_documento", descricao);
      body.append("consentimento", "true");
      if (dossierToken) body.append("dossie_token", dossierToken);
      const response = await fetch(`/api/coleta-documentos-livre/${encodeURIComponent(token)}/upload`, { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar o documento.");
      if (data?.dossie_token) {
        setDossierToken(data.dossie_token);
        try { sessionStorage.setItem(`cofre-dossie:${token}`, data.dossie_token); } catch { /* segue sem persistência local */ }
      }
      setEnviado(true);
      setArquivo(null);
      setDescricao("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o documento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#001f6b]/8 to-white px-4 py-5 sm:py-8">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <a href="/" aria-label="Destrava Crédito"><img src="/destrava-logo.svg" alt="Destrava Crédito" className="h-8" /></a>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-card px-3 py-1.5 text-[11px] font-semibold text-primary"><Lock className="h-3.5 w-3.5" /> Link seguro</span>
        </header>

        <Card className="overflow-hidden border-0 shadow-xl">
          <div className="bg-gradient-to-br from-[#001f6b] via-[#002d8a] to-[#003db5] px-5 py-6 text-primary-foreground sm:px-7">
            <div className="mb-3 inline-flex rounded-full bg-card/15 p-2"><FileUp className="h-6 w-6" /></div>
            <h1 className="text-2xl font-black leading-tight sm:text-3xl">Enviar documentos para conferência</h1>
            <p className="mt-2 text-sm leading-6 text-primary-foreground/80">Este link é uma caixa de entrada segura para documentos de pessoas e empresas.</p>
          </div>

          {loading ? (
            <CardContent className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Validando o link...</CardContent>
          ) : error && !state ? (
            <CardContent className="space-y-4 p-5 sm:p-7"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert><p className="text-center text-xs text-muted-foreground">Solicite um novo link à equipe responsável.</p></CardContent>
          ) : enviado ? (
            <CardContent className="space-y-5 p-5 text-center sm:p-7"><CheckCircle2 className="mx-auto h-14 w-14 text-success" /><div><h2 className="text-xl font-bold">Documento recebido</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">O arquivo foi guardado no seu dossiê individual. Ele será conferido antes de qualquer vinculação a cadastro oficial.</p></div><Button className="w-full" onClick={() => setEnviado(false)}>Enviar outro documento para este dossiê</Button><Button variant="outline" className="w-full" onClick={() => { setDossierToken(""); try { sessionStorage.removeItem(`cofre-dossie:${token}`); } catch {} setEnviado(false); }}>Começar novo dossiê</Button></CardContent>
          ) : (
            <CardContent className="p-5 sm:p-7">
              <p className="mb-5 rounded-xl bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">{state?.finalidade || "O documento ficará em triagem separada e não será vinculado automaticamente a nenhuma ficha."}</p>
              {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
              {dossierToken && <Alert className="mb-4 border-primary/20 bg-primary/5"><AlertDescription>Este navegador está usando um dossiê individual já iniciado. Os próximos arquivos serão agrupados com os anteriores deste mesmo remetente.</AlertDescription></Alert>}
              <form onSubmit={submit} className="space-y-5">
                <div><Label className="mb-2 block">A documentação é de</Label><div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={tipoPessoa === "pj"} disabled={Boolean(dossierToken)} onClick={() => changePessoa("pj")} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold ${tipoPessoa === "pj" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}><Building2 className="h-4 w-4" />Pessoa jurídica</button><button type="button" aria-pressed={tipoPessoa === "pf"} disabled={Boolean(dossierToken)} onClick={() => changePessoa("pf")} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold ${tipoPessoa === "pf" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}><User className="h-4 w-4" />Pessoa física</button></div></div>
                <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="nome-remetente">Nome do responsável</Label><Input id="nome-remetente" className="mt-1.5" value={nome} onChange={(e) => setNome(e.target.value)} disabled={Boolean(dossierToken)} required autoComplete="name" placeholder="Nome completo" /></div><div><Label htmlFor="documento">{tipoPessoa === "pj" ? "CNPJ" : "CPF"}</Label><Input id="documento" className="mt-1.5" value={documento} onChange={(e) => setDocumento(formatDocument(e.target.value, tipoPessoa))} disabled={Boolean(dossierToken)} required inputMode="numeric" placeholder={tipoPessoa === "pj" ? "00.000.000/0000-00" : "000.000.000-00"} /></div></div>
                {tipoPessoa === "pj" && <div><Label htmlFor="organizacao">Razão social ou nome da empresa (opcional)</Label><Input id="organizacao" className="mt-1.5" value={organizacao} onChange={(e) => setOrganizacao(e.target.value)} disabled={Boolean(dossierToken)} autoComplete="organization" /></div>}
                <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="email-remetente">E-mail</Label><Input id="email-remetente" type="email" className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(dossierToken)} required autoComplete="email" /></div><div><Label htmlFor="telefone-remetente">Telefone</Label><Input id="telefone-remetente" className="mt-1.5" value={telefone} onChange={(e) => setTelefone(formatPhone(e.target.value))} disabled={Boolean(dossierToken)} required inputMode="tel" autoComplete="tel" /></div></div>
                <div><Label htmlFor="tipo-documento">Tipo do documento</Label><select id="tipo-documento" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{(state?.tipos_documento || [{ codigo: "outros", nome: "Outro documento" }]).map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}</select></div>
                <div><Label htmlFor="arquivo">Arquivo</Label><Input id="arquivo" className="mt-1.5 cursor-pointer py-2" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" capture="environment" onChange={(e) => setArquivo(e.target.files?.[0] || null)} required /><p className="mt-1.5 text-xs text-muted-foreground">Até {state?.limite_arquivo_mb || 25} MB. Você pode tirar uma foto pelo celular.</p></div>
                <div><Label htmlFor="descricao">Observação (opcional)</Label><textarea id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Se necessário, explique o que está enviando." /></div>
                <label className="flex items-start gap-3 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} required className="mt-1 h-4 w-4 shrink-0" /><span>Autorizo o uso destes dados para receber e conferir este documento, conforme a <a href="/politica-privacidade" className="font-semibold text-primary underline">Política de Privacidade</a>.</span></label>
                <Button type="submit" disabled={enviando} className="h-12 w-full font-bold">{enviando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : <><Shield className="mr-2 h-4 w-4" />Enviar para conferência</>}</Button>
              </form>
            </CardContent>
          )}
        </Card>
        <p className="mt-4 text-center text-[11px] leading-5 text-muted-foreground">Este link não cria conta, não exige login e não coloca o documento automaticamente em uma ficha de empresa ou pessoa.</p>
      </div>
    </main>
  );
}
