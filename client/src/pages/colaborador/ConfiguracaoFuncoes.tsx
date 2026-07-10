import { useEffect, useMemo, useState } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { invalidateFeatureAccessCache } from "@/hooks/useFeatureAccess";
import {
  FEATURE_CATALOG,
  FEATURE_GROUP_LABELS,
  type FeatureGroup,
} from "@/config/featureCatalog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

interface ColaboradorResumo {
  id: string;
  nome: string;
  email?: string;
  cargo?: string;
  ativo?: boolean;
}

type FeatureValueMap = Record<string, boolean>;

interface FeatureAccessConfig {
  version: 1;
  global: FeatureValueMap;
  userOverrides: Record<string, FeatureValueMap>;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

function emptyConfig(): FeatureAccessConfig {
  return {
    version: 1,
    global: {},
    userOverrides: {},
    updatedAt: null,
    updatedBy: null,
  };
}

function groupFeatures() {
  return FEATURE_CATALOG.reduce<Record<FeatureGroup, typeof FEATURE_CATALOG>>(
    (acc, item) => {
      if (!acc[item.group]) acc[item.group] = [] as any;
      acc[item.group].push(item);
      return acc;
    },
    {} as Record<FeatureGroup, typeof FEATURE_CATALOG>
  );
}

function statusLabel(value: boolean | undefined, fallback: boolean) {
  if (value === undefined)
    return fallback ? "Herdando: visível" : "Herdando: oculto";
  return value ? "Forçar mostrar" : "Forçar ocultar";
}

export default function ConfiguracaoFuncoes() {
  const [config, setConfig] = useState<FeatureAccessConfig>(emptyConfig());
  const [usuarios, setUsuarios] = useState<ColaboradorResumo[]>([]);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<string>("");
  const [filtro, setFiltro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{
    tipo: "sucesso" | "erro";
    texto: string;
  } | null>(null);

  const grupos = useMemo(() => groupFeatures(), []);
  const usuario = usuarios.find(u => u.id === usuarioSelecionado) || null;
  const userOverrides = usuarioSelecionado
    ? config.userOverrides[usuarioSelecionado] || {}
    : {};
  const termo = filtro.trim().toLowerCase();

  async function carregar() {
    setCarregando(true);
    setMensagem(null);
    try {
      const [cfg, cols] = await Promise.all([
        apiFetch("/api/configuracao-funcoes"),
        apiFetch("/api/colaboradores"),
      ]);
      setConfig({ ...emptyConfig(), ...(cfg || {}) });
      const lista = Array.isArray(cols) ? cols : cols?.colaboradores || [];
      setUsuarios(lista);
      if (!usuarioSelecionado && lista[0]?.id)
        setUsuarioSelecionado(lista[0].id);
    } catch (err: any) {
      setMensagem({
        tipo: "erro",
        texto: err?.message || "Erro ao carregar configuração.",
      });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function setGlobal(key: string, enabled: boolean) {
    setConfig(prev => ({
      ...prev,
      global: { ...prev.global, [key]: enabled },
    }));
  }

  function setUserOverride(key: string, value: boolean | undefined) {
    if (!usuarioSelecionado) return;
    setConfig(prev => {
      const current = { ...(prev.userOverrides[usuarioSelecionado] || {}) };
      if (value === undefined) delete current[key];
      else current[key] = value;
      const userOverridesNext = { ...prev.userOverrides };
      if (Object.keys(current).length === 0)
        delete userOverridesNext[usuarioSelecionado];
      else userOverridesNext[usuarioSelecionado] = current;
      return { ...prev, userOverrides: userOverridesNext };
    });
  }

  function effective(key: string) {
    if (typeof userOverrides[key] === "boolean") return userOverrides[key];
    if (typeof config.global[key] === "boolean") return config.global[key];
    return true;
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);
    try {
      const resp = await apiFetch("/api/configuracao-funcoes", {
        method: "PUT",
        body: JSON.stringify({
          global: config.global,
          userOverrides: config.userOverrides,
        }),
      });
      setConfig({ ...emptyConfig(), ...(resp?.config || config) });
      invalidateFeatureAccessCache();
      setMensagem({
        tipo: "sucesso",
        texto: "Configuração de menu e funções salva com sucesso.",
      });
    } catch (err: any) {
      setMensagem({
        tipo: "erro",
        texto: err?.message || "Erro ao salvar configuração.",
      });
    } finally {
      setSalvando(false);
    }
  }

  const totalGlobalOcultas = FEATURE_CATALOG.filter(
    f => config.global[f.key] === false
  ).length;
  const totalUserOverrides = Object.values(config.userOverrides || {}).reduce(
    (sum, row) => sum + Object.keys(row || {}).length,
    0
  );

  return (
    <Layout title="Menu e Funções">
      <div className="min-h-full bg-slate-50 p-4 lg:p-6 space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <SlidersHorizontal className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">
                  Configuração Premium
                </div>
                <h1 className="text-2xl font-black text-slate-950">
                  Menu e funções do sistema
                </h1>
                <p className="text-sm text-slate-500 max-w-3xl">
                  Escolha o que aparece no menu para todos e ajuste exceções por
                  usuário. A configuração é aditiva, segura e não remove rotas,
                  dados ou permissões estruturais do sistema.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={carregar}
                disabled={carregando || salvando}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Recarregar
              </Button>
              <Button onClick={salvar} disabled={salvando || carregando}>
                <Save className="mr-2 h-4 w-4" />{" "}
                {salvando ? "Salvando..." : "Salvar configuração"}
              </Button>
            </div>
          </div>
          {mensagem && (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${mensagem.tipo === "sucesso" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}
            >
              {mensagem.texto}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Funções catalogadas</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-black text-slate-900">
              {FEATURE_CATALOG.length}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ocultas para todos</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-black text-red-600">
              {totalGlobalOcultas}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Exceções por usuário</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-black text-blue-600">
              {totalUserOverrides}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" /> Padrão global
              </CardTitle>
              <CardDescription>
                O padrão global define o que aparece para todos, salvo exceções
                individuais.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                <Input
                  value={filtro}
                  onChange={e => setFiltro(e.target.value)}
                  placeholder="Filtrar função, módulo ou descrição..."
                  className="md:max-w-sm"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig(prev => ({
                        ...prev,
                        global: Object.fromEntries(
                          FEATURE_CATALOG.map(f => [f.key, true])
                        ),
                      }))
                    }
                  >
                    Mostrar tudo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfig(prev => ({
                        ...prev,
                        global: Object.fromEntries(
                          FEATURE_CATALOG.filter(
                            f => f.key !== "configuracao-funcoes"
                          ).map(f => [f.key, false])
                        ),
                      }))
                    }
                  >
                    Ocultar tudo
                  </Button>
                </div>
              </div>

              {Object.entries(grupos).map(([group, items]) => {
                const filtered = items.filter(
                  item =>
                    !termo ||
                    `${FEATURE_GROUP_LABELS[item.group]} ${item.label} ${item.description}`
                      .toLowerCase()
                      .includes(termo)
                );
                if (filtered.length === 0) return null;
                return (
                  <div
                    key={group}
                    className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                      {FEATURE_GROUP_LABELS[group as FeatureGroup]}
                    </div>
                    <div className="space-y-2">
                      {filtered.map(item => {
                        const checked = config.global[item.key] !== false;
                        const bloqueado = item.key === "configuracao-funcoes";
                        return (
                          <div
                            key={item.key}
                            className="flex items-start gap-3 rounded-xl bg-white p-3 border border-slate-100"
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-blue-600"
                              checked={checked || bloqueado}
                              disabled={bloqueado}
                              onChange={e =>
                                setGlobal(item.key, e.target.checked)
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  {item.label}
                                </span>
                                <Badge
                                  variant={checked ? "default" : "destructive"}
                                  className="text-[10px]"
                                >
                                  {checked ? "Visível" : "Oculto"}
                                </Badge>
                                {bloqueado && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    segurança admin
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">
                                {item.description}
                              </p>
                              <p className="text-[11px] font-mono text-slate-400">
                                {item.href}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" /> Exceções por usuário
              </CardTitle>
              <CardDescription>
                Defina funções específicas para um usuário sem mexer no padrão
                geral.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Usuário</Label>
                <select
                  value={usuarioSelecionado}
                  onChange={e => setUsuarioSelecionado(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.nome} — {u.cargo || "sem cargo"}
                    </option>
                  ))}
                </select>
              </div>

              {usuario && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm">
                  <div className="font-black text-slate-900">
                    {usuario.nome}
                  </div>
                  <div className="text-xs text-slate-500">
                    {usuario.email || "sem e-mail"} ·{" "}
                    {usuario.cargo || "sem cargo"}
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {FEATURE_CATALOG.map(item => {
                  const globalEnabled = config.global[item.key] !== false;
                  const override = userOverrides[item.key];
                  const eff = effective(item.key);
                  const bloqueado = item.key === "configuracao-funcoes";
                  return (
                    <div
                      key={item.key}
                      className="rounded-2xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">
                            {item.label}
                          </div>
                          <div className="text-xs text-slate-500">
                            {FEATURE_GROUP_LABELS[item.group]} ·{" "}
                            {statusLabel(override, globalEnabled)}
                          </div>
                        </div>
                        <Badge
                          variant={eff ? "default" : "destructive"}
                          className="shrink-0"
                        >
                          {eff ? (
                            <Eye className="mr-1 h-3 w-3" />
                          ) : (
                            <EyeOff className="mr-1 h-3 w-3" />
                          )}
                          {eff ? "Visível" : "Oculto"}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Button
                          size="sm"
                          variant={
                            override === undefined ? "default" : "outline"
                          }
                          onClick={() => setUserOverride(item.key, undefined)}
                        >
                          Herdar
                        </Button>
                        <Button
                          size="sm"
                          variant={override === true ? "default" : "outline"}
                          disabled={bloqueado}
                          onClick={() => setUserOverride(item.key, true)}
                        >
                          Mostrar
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            override === false ? "destructive" : "outline"
                          }
                          disabled={bloqueado}
                          onClick={() => setUserOverride(item.key, false)}
                        >
                          Ocultar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex gap-2 font-black">
            <CheckCircle2 className="h-5 w-5" /> Segurança de implantação
          </div>
          <p className="mt-1">
            Esta configuração apenas controla visibilidade e acesso operacional
            no front-end. Ela não remove rotas antigas, não altera banco, não
            apaga documentos e não muda dados históricos.
          </p>
        </div>
      </div>
    </Layout>
  );
}
