import { useState, useRef } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Play,
  Database,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";

// ─── Schema inicial completo ──────────────────────────────────────────────────

const SCHEMA_INICIAL = `-- ============================================================
-- DESTRAVA CRÉDITO — Schema Inicial do Banco de Dados
-- Execute este SQL para criar todas as tabelas necessárias
-- ============================================================

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tabela de Colaboradores ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  cargo       TEXT NOT NULL DEFAULT 'Analista de Crédito',
  email       TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tabela de Simulações dos Colaboradores ───────────────────
CREATE TABLE IF NOT EXISTS public.simulacoes_colaborador (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  colaborador_id    UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  cliente_nome      TEXT NOT NULL,
  cliente_empresa   TEXT,
  cliente_telefone  TEXT,
  cliente_cpf_cnpj  TEXT,
  valor_credito     NUMERIC(15,2) NOT NULL,
  prazo_meses       INTEGER NOT NULL,
  taxa_juros_mensal NUMERIC(8,4) NOT NULL,
  valor_fiscal      NUMERIC(15,2),
  pct_imposto       NUMERIC(8,4),
  imposto_valor     NUMERIC(15,2),
  pct_comissao      NUMERIC(8,4),
  comissao_valor    NUMERIC(15,2),
  parcela_mensal    NUMERIC(15,2),
  total_emprestimo  NUMERIC(15,2),
  total_juros       NUMERIC(15,2),
  custo_total       NUMERIC(15,2),
  cet_mensal        NUMERIC(8,4),
  cet_anual         NUMERIC(8,4),
  banco             TEXT,
  linha_credito     TEXT,
  observacoes       TEXT,
  cenario           TEXT DEFAULT 'sem_imposto' CHECK (cenario IN ('com_imposto', 'sem_imposto')),
  status            TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_analise', 'aprovado', 'reprovado', 'cancelado')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tabela de Leads (captura pública) ────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome            TEXT NOT NULL,
  telefone        TEXT NOT NULL,
  empresa         TEXT,
  email           TEXT,
  valor_desejado  TEXT,
  prazo           TEXT,
  finalidade      TEXT,
  status          TEXT DEFAULT 'novo' CHECK (status IN ('novo', 'contatado', 'em_negociacao', 'convertido', 'perdido')),
  origem          TEXT DEFAULT 'site',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Trigger updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_colaboradores_updated
  BEFORE UPDATE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_simulacoes_updated
  BEFORE UPDATE ON public.simulacoes_colaborador
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_leads_updated
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS (Row Level Security) ─────────────────────────────────
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulacoes_colaborador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Colaboradores: cada um vê apenas o próprio perfil
CREATE POLICY "colaborador_ver_proprio" ON public.colaboradores
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "colaborador_atualizar_proprio" ON public.colaboradores
  FOR UPDATE USING (auth.uid() = id);

-- Simulações: colaborador vê apenas as próprias
CREATE POLICY "simulacoes_ver_proprias" ON public.simulacoes_colaborador
  FOR SELECT USING (auth.uid() = colaborador_id);

CREATE POLICY "simulacoes_inserir" ON public.simulacoes_colaborador
  FOR INSERT WITH CHECK (auth.uid() = colaborador_id);

CREATE POLICY "simulacoes_atualizar_proprias" ON public.simulacoes_colaborador
  FOR UPDATE USING (auth.uid() = colaborador_id);

-- Leads: qualquer autenticado pode ver e inserir
CREATE POLICY "leads_autenticados_ver" ON public.leads
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "leads_inserir_publico" ON public.leads
  FOR INSERT WITH CHECK (true);

-- ── Função exec_sql para o SQL Editor ───────────────────────
CREATE OR REPLACE FUNCTION public.exec_sql(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::JSONB);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- ── View de resumo ───────────────────────────────────────────
CREATE OR REPLACE VIEW public.simulacoes_resumo AS
SELECT
  s.id,
  s.cliente_nome,
  s.cliente_empresa,
  s.cliente_telefone,
  s.valor_credito,
  s.prazo_meses,
  s.taxa_juros_mensal,
  s.parcela_mensal,
  s.custo_total,
  s.cenario,
  s.status,
  s.banco,
  s.linha_credito,
  c.nome AS colaborador_nome,
  c.cargo AS colaborador_cargo,
  s.created_at
FROM public.simulacoes_colaborador s
LEFT JOIN public.colaboradores c ON c.id = s.colaborador_id;

SELECT 'Schema criado com sucesso!' AS resultado;
`;

// ─── Queries de atalho ────────────────────────────────────────────────────────

const ATALHOS = [
  {
    label: "Listar Colaboradores",
    icon: "👥",
    sql: "SELECT id, nome, cargo, email, ativo, created_at FROM colaboradores ORDER BY created_at DESC;",
  },
  {
    label: "Listar Simulações",
    icon: "🧮",
    sql: "SELECT cliente_nome, cliente_empresa, valor_credito, prazo_meses, taxa_juros_mensal, parcela_mensal, custo_total, cenario, status, created_at FROM simulacoes_colaborador ORDER BY created_at DESC LIMIT 50;",
  },
  {
    label: "Listar Leads",
    icon: "📋",
    sql: "SELECT nome, empresa, telefone, email, valor_desejado, status, created_at FROM leads ORDER BY created_at DESC LIMIT 50;",
  },
  {
    label: "Estatísticas Gerais",
    icon: "📊",
    sql: `SELECT
  (SELECT COUNT(*) FROM colaboradores WHERE ativo = true) AS colaboradores_ativos,
  (SELECT COUNT(*) FROM simulacoes_colaborador) AS total_simulacoes,
  (SELECT COUNT(*) FROM simulacoes_colaborador WHERE cenario = 'com_imposto') AS simulacoes_com_imposto,
  (SELECT COUNT(*) FROM simulacoes_colaborador WHERE cenario = 'sem_imposto') AS simulacoes_sem_imposto,
  (SELECT COUNT(*) FROM leads) AS total_leads,
  (SELECT COUNT(*) FROM leads WHERE status = 'novo') AS leads_novos;`,
  },
  {
    label: "Criar Colaborador Manual",
    icon: "➕",
    sql: `-- Substitua os valores abaixo e execute
-- Primeiro crie o usuário em Authentication > Users no painel do Supabase
-- Depois execute este INSERT com o UUID gerado:

INSERT INTO colaboradores (id, nome, cargo, email, ativo)
VALUES (
  'COLE-O-UUID-AQUI',
  'Nome do Colaborador',
  'Analista de Crédito',
  'email@destrava.com.br',
  true
);`,
  },
  {
    label: "Alterar Status Lead",
    icon: "✏️",
    sql: `UPDATE leads
SET status = 'contatado'  -- novo | contatado | em_negociacao | convertido | perdido
WHERE id = 'COLE-O-UUID-DO-LEAD';`,
  },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface HistoricoItem {
  sql: string;
  resultado: unknown;
  erro: string | null;
  duracao: number;
  timestamp: Date;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SqlEditorPage() {
  const [sql, setSql] = useState(SCHEMA_INICIAL);
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<unknown>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Executar SQL ─────────────────────────────────────────────────────────

  async function executarSQL() {
    if (!sql.trim()) return;
    setExecutando(true);
    setErro(null);
    setResultado(null);
    const inicio = Date.now();

    try {
      const data = await apiFetch("/api/admin/sql", {
        method: "POST",
        body: JSON.stringify({ query: sql.trim() }),
      });

      const duracao = Date.now() - inicio;

      if (data?.error) {
        setErro(data.error);
        setHistorico((prev) => [{ sql, resultado: null, erro: data.error, duracao, timestamp: new Date() }, ...prev.slice(0, 19)]);
      } else {
        setResultado(data);
        setHistorico((prev) => [{ sql, resultado: data, erro: null, duracao, timestamp: new Date() }, ...prev.slice(0, 19)]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setErro(msg);
    }

    setExecutando(false);
  }

  // ─── Copiar resultado ─────────────────────────────────────────────────────

  function copiarResultado() {
    navigator.clipboard.writeText(JSON.stringify(resultado, null, 2));
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const linhasResultado = Array.isArray(resultado) ? resultado.length : 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">SQL Editor</h1>
            <p className="text-muted-foreground text-sm">
              Execute queries diretamente no banco de dados Supabase
            </p>
          </div>
          <Badge variant="outline" className="ml-auto text-xs">
            PostgreSQL · Supabase
          </Badge>
        </div>

        {/* Aviso */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Atenção:</strong> Comandos <code className="bg-amber-100 px-1 rounded">DROP</code>,{" "}
            <code className="bg-amber-100 px-1 rounded">DELETE</code> e{" "}
            <code className="bg-amber-100 px-1 rounded">TRUNCATE</code> são permanentes.
            Use com cuidado. O SQL Editor usa a função <code className="bg-amber-100 px-1 rounded">exec_sql</code> do Supabase.
          </span>
        </div>

        {/* Atalhos */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Atalhos Rápidos
          </p>
          <div className="flex flex-wrap gap-2">
            {ATALHOS.map((a) => (
              <button
                key={a.label}
                onClick={() => setSql(a.sql)}
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted/60 transition-colors font-medium"
              >
                {a.icon} {a.label}
              </button>
            ))}
            <button
              onClick={() => setSql(SCHEMA_INICIAL)}
              className="text-xs px-3 py-1.5 rounded-full border border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary transition-colors font-semibold"
            >
              🗄️ Schema Inicial Completo
            </button>
          </div>
        </div>

        {/* Editor */}
        <Card className="shadow-md">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Editor SQL
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSql("")}
                  className="text-xs text-muted-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Limpar
                </Button>
                <Button
                  onClick={executarSQL}
                  disabled={executando || !sql.trim()}
                  size="sm"
                  className="font-bold"
                >
                  <Play className="h-4 w-4 mr-1.5" />
                  {executando ? "Executando..." : "Executar"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              className="w-full min-h-[280px] font-mono text-sm bg-[#1e1e2e] text-[#cdd6f4] p-4 resize-y focus:outline-none rounded-b-xl"
              spellCheck={false}
              placeholder="-- Digite seu SQL aqui ou selecione um atalho acima..."
              onKeyDown={(e) => {
                // Tab para indentação
                if (e.key === "Tab") {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  const newSql = sql.substring(0, start) + "  " + sql.substring(end);
                  setSql(newSql);
                  setTimeout(() => {
                    if (textareaRef.current) {
                      textareaRef.current.selectionStart = start + 2;
                      textareaRef.current.selectionEnd = start + 2;
                    }
                  }, 0);
                }
                // Ctrl+Enter para executar
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  executarSQL();
                }
              }}
            />
          </CardContent>
        </Card>

        {/* Resultado */}
        {(resultado !== null || erro) && (
          <Card className={`shadow-md ${erro ? "border-red-200" : "border-green-200"}`}>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  {erro
                    ? <AlertCircle className="h-4 w-4 text-red-600" />
                    : <CheckCircle2 className="h-4 w-4 text-green-600" />
                  }
                  {erro ? "Erro na Execução" : `Resultado — ${linhasResultado} linha${linhasResultado !== 1 ? "s" : ""}`}
                </CardTitle>
                {!erro && resultado !== null && (
                  <Button variant="ghost" size="sm" onClick={copiarResultado} className="text-xs">
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copiar JSON
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {erro ? (
                <pre className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 overflow-x-auto whitespace-pre-wrap">
                  {erro}
                </pre>
              ) : Array.isArray(resultado) && resultado.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        {Object.keys(resultado[0] as object).map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(resultado as Record<string, unknown>[]).map((row, i) => (
                        <tr key={i} className="border-t hover:bg-muted/20">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" title={String(val ?? "")}>
                              {val === null
                                ? <span className="text-muted-foreground italic">null</span>
                                : typeof val === "boolean"
                                ? <Badge variant={val ? "default" : "secondary"} className="text-xs">{String(val)}</Badge>
                                : String(val)
                              }
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                  Query executada com sucesso. Nenhum dado retornado (INSERT, UPDATE, CREATE, etc.).
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Histórico */}
        {historico.length > 0 && (
          <Card>
            <CardHeader className="pb-3 cursor-pointer" onClick={() => setMostrarHistorico(!mostrarHistorico)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Histórico de Execuções ({historico.length})
                </CardTitle>
                {mostrarHistorico ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
            {mostrarHistorico && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {historico.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-xl border hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => setSql(item.sql)}
                    >
                      {item.erro
                        ? <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                        : <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      }
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono truncate text-muted-foreground">
                          {item.sql.replace(/\s+/g, " ").slice(0, 80)}...
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.timestamp.toLocaleTimeString("pt-BR")} · {item.duracao}ms
                          {item.erro && <span className="text-red-500 ml-2">Erro</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

      </div>
    </Layout>
  );
}
