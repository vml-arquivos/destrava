#!/usr/bin/env python3
"""Patch incremental na página Clientes.tsx:
- Adiciona filtros de origem e etapa do funil
- Adiciona indicador de cadastro incompleto
- Melhora a busca para incluir email e cpf_cnpj
- Adiciona badge de origem na listagem
"""
import sys

path = "client/src/pages/colaborador/Clientes.tsx"
with open(path, "r") as f:
    content = f.read()

# ── 1. Adicionar novos estados de filtro ──────────────────────────────────
old_states = '''  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todos");'''

new_states = '''  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todos");
  const [filtroOrigem, setFiltroOrigem] = useState("todos");
  const [filtroEtapa, setFiltroEtapa] = useState("todos");'''

if old_states not in content:
    print("ERRO: estados não encontrados")
    sys.exit(1)
content = content.replace(old_states, new_states, 1)

# ── 2. Melhorar a função clientesFiltrados para incluir origem e etapa ────
old_filter = '''  const clientesFiltrados = clientes.filter(c => {
    const matchBusca = !busca || 
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.empresa?.toLowerCase().includes(busca.toLowerCase()) ||
      c.telefone.includes(busca) ||
      c.email?.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "todos" || c.status === filtroStatus;
    const matchPrioridade = filtroPrioridade === "todos" || c.prioridade === filtroPrioridade;
    return matchBusca && matchStatus && matchPrioridade;
  });'''

new_filter = '''  // Detecta cadastro incompleto: sem email OU sem cpf_cnpj
  function cadastroIncompleto(c: Cliente): boolean {
    return !c.email || !c.cpf_cnpj;
  }

  // Normaliza origem para agrupamento
  function normalizarOrigem(origem: string): string {
    const o = (origem || "").toLowerCase();
    if (o.includes("campanha") || o.includes("utm") || o.includes("ads")) return "campanha";
    if (o.includes("site") || o.includes("formulario") || o.includes("landing") || o.includes("form")) return "site";
    if (o.includes("whatsapp") || o.includes("zap")) return "whatsapp";
    if (o.includes("indicacao") || o.includes("indicação") || o.includes("referral")) return "indicacao";
    if (o.includes("painel") || o.includes("manual") || o === "") return "manual";
    return o || "manual";
  }

  const clientesFiltrados = clientes.filter(c => {
    const matchBusca = !busca ||
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.empresa?.toLowerCase().includes(busca.toLowerCase()) ||
      c.telefone.includes(busca) ||
      c.email?.toLowerCase().includes(busca.toLowerCase()) ||
      c.cpf_cnpj?.replace(/\\D/g, "").includes(busca.replace(/\\D/g, ""));
    const matchStatus = filtroStatus === "todos" || c.status === filtroStatus;
    const matchPrioridade = filtroPrioridade === "todos" || c.prioridade === filtroPrioridade;
    const matchOrigem = filtroOrigem === "todos" || normalizarOrigem(c.origem) === filtroOrigem;
    const matchEtapa = filtroEtapa === "todos" || (c as any).etapa_funil === filtroEtapa;
    return matchBusca && matchStatus && matchPrioridade && matchOrigem && matchEtapa;
  });'''

if old_filter not in content:
    print("ERRO: clientesFiltrados não encontrado")
    sys.exit(1)
content = content.replace(old_filter, new_filter, 1)

# ── 3. Adicionar filtros de origem e etapa na UI ──────────────────────────
old_filtros_ui = '''            <select
              value={filtroPrioridade}
              onChange={e => setFiltroPrioridade(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todas as prioridades</option>
              <option value="alta">🔴 Alta</option>
              <option value="media">🟡 Média</option>
              <option value="baixa">🟢 Baixa</option>
            </select>
          </div>'''

new_filtros_ui = '''            <select
              value={filtroPrioridade}
              onChange={e => setFiltroPrioridade(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todas as prioridades</option>
              <option value="alta">🔴 Alta</option>
              <option value="media">🟡 Média</option>
              <option value="baixa">🟢 Baixa</option>
            </select>
            <select
              value={filtroOrigem}
              onChange={e => setFiltroOrigem(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todas as origens</option>
              <option value="campanha">📢 Campanha</option>
              <option value="site">🌐 Site / Formulário</option>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="indicacao">🤝 Indicação</option>
              <option value="manual">✏️ Manual / Painel</option>
            </select>
          </div>'''

if old_filtros_ui not in content:
    print("ERRO: bloco de filtros UI não encontrado")
    sys.exit(1)
content = content.replace(old_filtros_ui, new_filtros_ui, 1)

# ── 4. Adicionar badge de origem e indicador de incompleto na listagem ────
old_card = '''                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{cliente.nome}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORIDADE_CONFIG[cliente.prioridade]?.color} ${PRIORIDADE_CONFIG[cliente.prioridade]?.bg}`}>
                          {cliente.prioridade === "alta" ? "🔴" : cliente.prioridade === "media" ? "🟡" : "🟢"}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {cliente.empresa && <span>{cliente.empresa} · </span>}
                        {cliente.telefone}
                      </div>
                    </div>'''

new_card = '''                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">{cliente.nome}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORIDADE_CONFIG[cliente.prioridade]?.color} ${PRIORIDADE_CONFIG[cliente.prioridade]?.bg}`}>
                          {cliente.prioridade === "alta" ? "🔴" : cliente.prioridade === "media" ? "🟡" : "🟢"}
                        </span>
                        {cadastroIncompleto(cliente) && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium" title="Cadastro incompleto: falta email ou CPF/CNPJ">
                            ⚠️ Incompleto
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 truncate flex items-center gap-1">
                        {cliente.empresa && <span>{cliente.empresa} · </span>}
                        {cliente.telefone}
                        {cliente.origem && cliente.origem !== "painel_interno" && (
                          <span className="ml-1 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded capitalize">
                            {normalizarOrigem(cliente.origem) === "campanha" ? "📢" :
                             normalizarOrigem(cliente.origem) === "site" ? "🌐" :
                             normalizarOrigem(cliente.origem) === "whatsapp" ? "💬" :
                             normalizarOrigem(cliente.origem) === "indicacao" ? "🤝" : "✏️"}{" "}
                            {normalizarOrigem(cliente.origem)}
                          </span>
                        )}
                      </div>
                    </div>'''

if old_card not in content:
    print("ERRO: card de cliente não encontrado")
    sys.exit(1)
content = content.replace(old_card, new_card, 1)

# ── 5. Adicionar stat de cadastros incompletos ────────────────────────────
old_stats = '''  // Estatísticas
  const stats = {
    total: clientes.length,
    leads: clientes.filter(c => c.status === "lead").length,
    analise: clientes.filter(c => c.status === "analise").length,
    aprovados: clientes.filter(c => c.status === "aprovado" || c.status === "convertido").length,
    alta: clientes.filter(c => c.prioridade === "alta").length,
  };'''

new_stats = '''  // Estatísticas
  const stats = {
    total: clientes.length,
    leads: clientes.filter(c => c.status === "lead").length,
    analise: clientes.filter(c => c.status === "analise").length,
    aprovados: clientes.filter(c => c.status === "aprovado" || c.status === "convertido").length,
    alta: clientes.filter(c => c.prioridade === "alta").length,
    incompletos: clientes.filter(c => !c.email || !c.cpf_cnpj).length,
  };'''

if old_stats not in content:
    print("ERRO: bloco de stats não encontrado")
    sys.exit(1)
content = content.replace(old_stats, new_stats, 1)

# ── 6. Adicionar o stat de incompletos na UI ──────────────────────────────
old_stats_ui = '''              { label: "Alta Prioridade", value: stats.alta, color: "text-red-600" },
            ].map(s => ('''

new_stats_ui = '''              { label: "Alta Prioridade", value: stats.alta, color: "text-red-600" },
              { label: "Incompletos", value: stats.incompletos, color: "text-orange-600" },
            ].map(s => ('''

if old_stats_ui not in content:
    print("AVISO: stat UI não encontrado, pulando")
else:
    content = content.replace(old_stats_ui, new_stats_ui, 1)

# ── 7. Atualizar o grid de stats para 6 colunas ──────────────────────────
content = content.replace(
    'className="grid grid-cols-5 gap-3 p-4 bg-gray-50 border-b"',
    'className="grid grid-cols-6 gap-3 p-4 bg-gray-50 border-b"',
    1
)

with open(path, "w") as f:
    f.write(content)

print("OK: Clientes.tsx atualizado com sucesso")
