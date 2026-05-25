import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "sonner";

type SimulacaoColaborador = {
  id: string;
  colaborador_id?: string;
  cliente_nome: string;
  valor_solicitado?: number;
  status?: string;
  [key: string]: any;
};
import ColaboradorLayout from "./Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  RefreshCw,
  Eye,
  Trash2,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Printer,
} from "lucide-react";
import { Link } from "wouter";

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${Number(v).toFixed(2).replace(".", ",")}%`;

type Status = "todos" | "pendente" | "em_analise" | "aprovado" | "reprovado" | "cancelado";

const statusBadge = (status?: string) => {
  switch (status) {
    case "aprovado": return <Badge className="bg-green-100 text-green-800 border-green-200">Aprovado</Badge>;
    case "reprovado": return <Badge variant="destructive">Reprovado</Badge>;
    case "em_analise": return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Em Análise</Badge>;
    case "cancelado": return <Badge variant="outline">Cancelado</Badge>;
    default: return <Badge variant="secondary">Pendente</Badge>;
  }
};

export default function Simulacoes() {
  const { user } = useAuth();
  const [simulacoes, setSimulacoes] = useState<SimulacaoColaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<Status>("todos");
  const [selecionada, setSelecionada] = useState<SimulacaoColaborador | null>(null);
  const [atualizando, setAtualizando] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchSimulacoes();
  }, [user]);

  async function fetchSimulacoes() {
    setLoading(true);
    try {
      const data = await apiFetch("/api/simulacoes");
      setSimulacoes((data as SimulacaoColaborador[]) || []);
    } catch (err) {
      console.error(err);
      setSimulacoes([]);
    }
    setLoading(false);
  }

  async function atualizarStatus(id: string, status: string) {
    setAtualizando(id);
    try {
      await apiFetch(`/api/simulacoes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setSimulacoes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: status as any } : s))
      );
      if (selecionada?.id === id) setSelecionada((prev) => prev ? { ...prev, status: status as any } : null);
    } catch (err) {
      console.error(err);
    }
    setAtualizando(null);
  }

  async function excluir(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta simulação?")) return;
    try {
      await apiFetch(`/api/simulacoes/${id}`, { method: "DELETE" });
      setSimulacoes((prev) => prev.filter((s) => s.id !== id));
      if (selecionada?.id === id) setSelecionada(null);
    } catch (err) {
      console.error(err);
    }
  }

  async function reimprimirPdf(id: string) {
    try {
      const token = getToken();
      const res = await fetch(`/api/simulacoes/${id}/pdf/latest`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const msg = res.status === 404
          ? "Esta simulação ainda não possui PDF armazenado. Salve novamente pela Calculadora para gerar o PDF permanente."
          : "Não foi possível recuperar o PDF desta simulação.";
        toast.error(msg);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao abrir PDF da simulação.");
    }
  }

  const filtradas = simulacoes.filter((s) => {
    const matchBusca =
      !busca ||
      s.cliente_nome.toLowerCase().includes(busca.toLowerCase()) ||
      (s.cliente_cpf_cnpj ?? "").includes(busca) ||
      (s.banco || "").toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "todos" || s.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  return (
    <ColaboradorLayout title="Simulações Salvas">
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Simulações Salvas
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {simulacoes.length} simulação(ões) no total
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchSimulacoes}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
            <Link href="/colaborador/calculadora">
              <Button size="sm">Nova Simulação</Button>
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome, CPF/CNPJ ou banco..."
                  className="pl-9"
                />
              </div>
              <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as Status)}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_analise">Em Análise</SelectItem>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                    <SelectItem value="reprovado">Reprovado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Carregando simulações...
              </div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {busca || filtroStatus !== "todos"
                    ? "Nenhuma simulação encontrada com esses filtros."
                    : "Nenhuma simulação salva ainda."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-center">Parcelas</TableHead>
                      <TableHead className="text-right">Parcela</TableHead>
                      <TableHead>Banco</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((sim) => (
                      <TableRow key={sim.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{sim.cliente_nome}</p>
                            <p className="text-xs text-muted-foreground">{sim.cliente_cpf_cnpj}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          {fmt.format(Number(sim.valor_solicitado))}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {sim.quantidade_parcelas}x
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt.format(Number(sim.valor_parcela))}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sim.banco || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {statusBadge(sim.status)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(sim.criado_em).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setSelecionada(sim)}
                              title="Ver detalhes"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                              onClick={() => reimprimirPdf(sim.id)}
                              title="Reimprimir PDF armazenado"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => excluir(sim.id)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de detalhes */}
      <Dialog open={!!selecionada} onOpenChange={() => setSelecionada(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Simulação</DialogTitle>
            <DialogDescription>
              {selecionada?.cliente_nome} — {selecionada?.cliente_cpf_cnpj}
            </DialogDescription>
          </DialogHeader>

          {selecionada && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <span className="text-sm font-medium">Status atual:</span>
                {statusBadge(selecionada.status)}
              </div>

              {/* Resultado principal */}
              <div className="bg-primary text-white rounded-xl p-4 text-center">
                <p className="text-xs text-white/70 mb-1">Parcela Mensal</p>
                <p className="text-3xl font-bold">{fmt.format(Number(selecionada.valor_parcela))}</p>
                <p className="text-xs text-white/70 mt-1">
                  {selecionada.quantidade_parcelas}x de {fmt.format(Number(selecionada.valor_parcela))}
                </p>
              </div>

              {/* Detalhamento */}
              <div className="space-y-2 text-sm">
                {[
                  ["Valor Solicitado", fmt.format(Number(selecionada.valor_solicitado))],
                  ["Taxa de Juros", `${fmtPct(Number(selecionada.taxa_juros_mensal))} a.m.`],
                  ["Imposto / IOF", `${fmtPct(Number(selecionada.imposto_percentual || 0))} → ${fmt.format(Number(selecionada.total_imposto || 0))}`],
                  ["Comissão Destrava", `${fmtPct(Number(selecionada.comissao_percentual || 0))} → ${fmt.format(Number(selecionada.total_comissao || 0))}`],
                  ["Total de Juros", fmt.format(Number(selecionada.total_juros))],
                  ["Custo Total", fmt.format(Number(selecionada.custo_efetivo_total))],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold">{value}</span>
                  </div>
                ))}
              </div>

              {/* Banco e linha */}
              {(selecionada.banco || selecionada.linha_credito) && (
                <div className="flex flex-wrap gap-2">
                  {selecionada.banco && <Badge variant="secondary">{selecionada.banco}</Badge>}
                  {selecionada.linha_credito && <Badge variant="outline">{selecionada.linha_credito}</Badge>}
                </div>
              )}

              {/* Observações */}
              {selecionada.observacoes && (
                <div className="p-3 bg-muted/30 rounded-lg text-sm">
                  <p className="font-medium mb-1">Observações:</p>
                  <p className="text-muted-foreground">{selecionada.observacoes}</p>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => reimprimirPdf(selecionada.id)}
              >
                <Printer className="h-4 w-4 mr-2" />
                Reimprimir PDF armazenado
              </Button>

              {/* Alterar status */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Alterar Status:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { status: "pendente", label: "Pendente", icon: Clock, color: "outline" as const },
                    { status: "em_analise", label: "Em Análise", icon: Send, color: "outline" as const },
                    { status: "aprovado", label: "Aprovado", icon: CheckCircle2, color: "outline" as const },
                    { status: "reprovado", label: "Reprovado", icon: XCircle, color: "outline" as const },
                    { status: "cancelado", label: "Cancelado", icon: XCircle, color: "outline" as const },
                  ].map(({ status, label, icon: Icon, color }) => (
                    <Button
                      key={status}
                      variant={selecionada.status === status ? "default" : color}
                      size="sm"
                      disabled={atualizando === selecionada.id}
                      onClick={() => atualizarStatus(selecionada.id, status)}
                      className={
                        status === "aprovado" && selecionada.status !== status
                          ? "border-green-300 text-green-700 hover:bg-green-50"
                          : status === "reprovado" && selecionada.status !== status
                          ? "border-red-300 text-red-700 hover:bg-red-50"
                          : ""
                      }
                    >
                      <Icon className="h-3.5 w-3.5 mr-1.5" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Data */}
              <p className="text-xs text-muted-foreground text-center">
                Criada em {new Date(selecionada.criado_em).toLocaleString("pt-BR")}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ColaboradorLayout>
  );
}
