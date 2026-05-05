import { FormEvent, useState } from "react";
import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Lock, Save } from "lucide-react";

type PerfilForm = {
  nome: string;
  telefone: string;
  cpf: string;
  rg: string;
  data_nascimento: string;
  estado_civil: string;
  profissao: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  assinatura_url: string;
};

export default function MeuPerfil() {
  const { colaborador, refreshColaborador } = useAuth();
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [form, setForm] = useState<PerfilForm>({
    nome: colaborador?.nome || "",
    telefone: colaborador?.telefone || "",
    cpf: (colaborador as any)?.cpf || "",
    rg: (colaborador as any)?.rg || "",
    data_nascimento: ((colaborador as any)?.data_nascimento || "").slice(0, 10),
    estado_civil: (colaborador as any)?.estado_civil || "",
    profissao: (colaborador as any)?.profissao || "",
    endereco: (colaborador as any)?.endereco || "",
    numero: (colaborador as any)?.numero || "",
    complemento: (colaborador as any)?.complemento || "",
    bairro: (colaborador as any)?.bairro || "",
    cidade: (colaborador as any)?.cidade || "",
    uf: (colaborador as any)?.uf || "",
    cep: (colaborador as any)?.cep || "",
    assinatura_url: (colaborador as any)?.assinatura_url || "",
  });
  const [senha, setSenha] = useState({ senha_atual: "", nova_senha: "", confirmar: "" });

  const update = (campo: keyof PerfilForm, valor: string) => setForm((prev) => ({ ...prev, [campo]: valor }));

  const salvarPerfil = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setMensagem("");
    setSalvando(true);
    try {
      await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify(form) });
      await refreshColaborador();
      setMensagem("Perfil atualizado com sucesso.");
    } catch (err: any) {
      setErro(err.message || "Erro ao atualizar perfil.");
    } finally {
      setSalvando(false);
    }
  };

  const alterarSenha = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setMensagem("");
    if (senha.nova_senha.length < 8) {
      setErro("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (senha.nova_senha !== senha.confirmar) {
      setErro("A confirmação da senha não confere.");
      return;
    }
    setTrocandoSenha(true);
    try {
      await apiFetch("/api/me/alterar-senha", { method: "POST", body: JSON.stringify(senha) });
      setSenha({ senha_atual: "", nova_senha: "", confirmar: "" });
      setMensagem("Senha alterada com sucesso.");
      await refreshColaborador();
    } catch (err: any) {
      setErro(err.message || "Erro ao alterar senha.");
    } finally {
      setTrocandoSenha(false);
    }
  };

  return (
    <ColaboradorLayout title="Meu Perfil">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
          <p className="text-sm text-muted-foreground mt-1">Mantenha seus dados pessoais, endereço, assinatura e senha atualizados.</p>
        </div>

        {(mensagem || erro) && (
          <Alert variant={erro ? "destructive" : "default"}>
            <AlertDescription>{erro || mensagem}</AlertDescription>
          </Alert>
        )}

        {(colaborador as any)?.precisa_redefinir_senha && (
          <Alert>
            <AlertDescription>Por segurança, altere sua senha temporária antes de continuar usando o sistema.</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Dados cadastrais</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={salvarPerfil} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => update("nome", e.target.value)} required /></div>
              <div className="space-y-2"><Label>E-mail</Label><Input value={colaborador?.email || ""} disabled /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => update("telefone", e.target.value)} /></div>
              <div className="space-y-2"><Label>CPF</Label><Input value={form.cpf} onChange={(e) => update("cpf", e.target.value)} /></div>
              <div className="space-y-2"><Label>RG</Label><Input value={form.rg} onChange={(e) => update("rg", e.target.value)} /></div>
              <div className="space-y-2"><Label>Data de nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e) => update("data_nascimento", e.target.value)} /></div>
              <div className="space-y-2"><Label>Estado civil</Label><Input value={form.estado_civil} onChange={(e) => update("estado_civil", e.target.value)} /></div>
              <div className="space-y-2"><Label>Profissão</Label><Input value={form.profissao} onChange={(e) => update("profissao", e.target.value)} /></div>
              <div className="space-y-2 lg:col-span-2"><Label>Endereço</Label><Input value={form.endereco} onChange={(e) => update("endereco", e.target.value)} /></div>
              <div className="space-y-2"><Label>Número</Label><Input value={form.numero} onChange={(e) => update("numero", e.target.value)} /></div>
              <div className="space-y-2"><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => update("complemento", e.target.value)} /></div>
              <div className="space-y-2"><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => update("bairro", e.target.value)} /></div>
              <div className="space-y-2"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => update("cidade", e.target.value)} /></div>
              <div className="space-y-2"><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => update("uf", e.target.value.toUpperCase())} /></div>
              <div className="space-y-2"><Label>CEP</Label><Input value={form.cep} onChange={(e) => update("cep", e.target.value)} /></div>
              <div className="space-y-2 md:col-span-2 lg:col-span-3"><Label>URL da assinatura</Label><Input value={form.assinatura_url} onChange={(e) => update("assinatura_url", e.target.value)} placeholder="https://..." /></div>
              <div className="md:col-span-2 lg:col-span-3 flex justify-end">
                <Button type="submit" disabled={salvando}><Save className="h-4 w-4 mr-2" />{salvando ? "Salvando..." : "Salvar perfil"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Alterar senha</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={alterarSenha} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Senha atual</Label><Input type="password" value={senha.senha_atual} onChange={(e) => setSenha((p) => ({ ...p, senha_atual: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Nova senha</Label><Input type="password" value={senha.nova_senha} onChange={(e) => setSenha((p) => ({ ...p, nova_senha: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Confirmar nova senha</Label><Input type="password" value={senha.confirmar} onChange={(e) => setSenha((p) => ({ ...p, confirmar: e.target.value }))} /></div>
              <div className="md:col-span-3 flex justify-end"><Button type="submit" disabled={trocandoSenha}><Lock className="h-4 w-4 mr-2" />{trocandoSenha ? "Alterando..." : "Alterar senha"}</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ColaboradorLayout>
  );
}
