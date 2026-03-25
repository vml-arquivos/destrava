import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { supabase, SimulacaoColaborador } from "@/lib/supabase";
import ColaboradorLayout from "./Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Calculator,
  FileText,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  ArrowRight,
} from "lucide-react";

const statusConfig = {
  rascunho: { label: "Rascunho", color: "secondary" as const },
  enviado: { label: "Enviado", color: "default" as const },
  aprovado: { label: "Aprovado", color: "default" as const },
  reprovado: { label: "destructive" as const, label2: "Reprovado" },
};

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function Dashboard() {
  const { user, colaborador } = useAuth();
  const [simulacoes, setSimulacoes] = useState<SimulacaoColaborador[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchSimulacoes();
  }, [user]);

  async function fetchSimulacoes() {
    setLoading(true);
    const { data } = await supabase
      .from("simulacoes_colaborador")
      .select("*")
      .eq("colaborador_id", user!.id)
      .order("criado_em", { ascending: false })
      .limit(50);
    setSimulacoes((data as SimulacaoColaborador[]) || []);
    setLoading(false);
  }

  // Estatísticas
  const total = simulacoes.length;
  const aprovadas = simulacoes.filter((s) => s.status === "aprovado").length;
  const reprovadas = simulacoes.filter((s) => s.status === "reprovado").length;
  const volumeTotal = simulacoes.reduce((acc, s) => acc + Number(s.valor_solicitado), 0);
  const comissaoTotal = simulacoes.reduce((acc, s) => acc + Number(s.total_comissao), 0);
  const recentes = simulacoes.slice(0, 5);

  return (
    <ColaboradorLayout title="Dashboard">
      <div className="space-y-6">
        {/* Boas-vindas */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Olá, {colaborador?.nome?.split(" ")[0] || "Colaborador"}! 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <Link href="/colaborador/calculadora">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Simulação
            </Button>
          </Link>
        </div>

        {/* Cards de estatísticas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Total Simulações</p>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-3xl font-bold">{total}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Aprovadas</p>
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-green-600">{aprovadas}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Volume Total</p>
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {fmt.format(volumeTotal)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Comissão Total</p>
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-yellow-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-yellow-600">
                {fmt.format(comissaoTotal)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Atalhos rápidos */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-2 border-primary/20 hover:border-primary/40 transition-colors cursor-pointer">
            <Link href="/colaborador/calculadora">
              <CardContent className="pt-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calculator className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Calculadora de Empréstimos</h3>
                    <p className="text-sm text-muted-foreground">
                      Simule com taxa, imposto, comissão e parcelas
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className="border-2 border-border hover:border-primary/20 transition-colors cursor-pointer">
            <Link href="/colaborador/simulacoes">
              <CardContent className="pt-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Simulações Salvas</h3>
                    <p className="text-sm text-muted-foreground">
                      Histórico completo de todas as simulações
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* Simulações recentes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Simulações Recentes</CardTitle>
                <CardDescription>Últimas 5 simulações realizadas</CardDescription>
              </div>
              <Link href="/colaborador/simulacoes">
                <Button variant="ghost" size="sm">
                  Ver todas
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Carregando...
              </div>
            ) : recentes.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  Nenhuma simulação ainda. Crie sua primeira!
                </p>
                <Link href="/colaborador/calculadora">
                  <Button size="sm" className="mt-3">
                    <Plus className="h-4 w-4 mr-1" />
                    Nova Simulação
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentes.map((sim) => (
                  <div
                    key={sim.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{sim.cliente_nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {sim.cliente_cpf_cnpj} · {sim.banco || "Banco não informado"} ·{" "}
                        {new Date(sim.criado_em).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold">{fmt.format(Number(sim.valor_solicitado))}</p>
                        <p className="text-xs text-muted-foreground">
                          {sim.quantidade_parcelas}x {fmt.format(Number(sim.valor_parcela))}
                        </p>
                      </div>
                      <Badge
                        variant={
                          sim.status === "aprovado"
                            ? "default"
                            : sim.status === "reprovado"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {sim.status === "rascunho" ? "Rascunho"
                          : sim.status === "enviado" ? "Enviado"
                          : sim.status === "aprovado" ? "Aprovado"
                          : "Reprovado"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ColaboradorLayout>
  );
}
