#!/usr/bin/env python3
"""Patch incremental na página Empresas.tsx:
- Adiciona abas de Simulações e Contratos no painel de detalhe
- Adiciona estados e carregamento para simulações e contratos
- Adiciona filtros de origem e porte na listagem
"""
import sys

path = "client/src/pages/colaborador/Empresas.tsx"
with open(path, "r") as f:
    content = f.read()

errors = []

# ── 1. Expandir o tipo de abaAtiva ────────────────────────────────────────
old1 = '  const [abaAtiva, setAbaAtiva] = useState<"visao_geral" | "socios" | "followup" | "historico" | "documentos">("visao_geral");'
new1 = '  const [abaAtiva, setAbaAtiva] = useState<"visao_geral" | "socios" | "followup" | "historico" | "documentos" | "simulacoes" | "contratos">("visao_geral");'
if old1 in content:
    content = content.replace(old1, new1, 1)
    print("OK 1: tipo de abaAtiva expandido")
else:
    errors.append("ERRO 1: tipo de abaAtiva não encontrado")

# ── 2. Adicionar estados para simulações e contratos ──────────────────────
old2 = '  const [documentos, setDocumentos] = useState<EmpresaDocumento[]>([]);\n  const [sociosEmpresa, setSociosEmpresa] = useState<any[]>([]);'
new2 = '  const [documentos, setDocumentos] = useState<EmpresaDocumento[]>([]);\n  const [sociosEmpresa, setSociosEmpresa] = useState<any[]>([]);\n  const [simulacoesEmpresa, setSimulacoesEmpresa] = useState<any[]>([]);\n  const [contratosEmpresa, setContratosEmpresa] = useState<any[]>([]);'
if old2 in content:
    content = content.replace(old2, new2, 1)
    print("OK 2: estados de simulações e contratos adicionados")
else:
    errors.append("ERRO 2: estados de documentos/socios não encontrados")

# ── 3. Carregar simulações e contratos no useEffect de detalhe ────────────
old3 = '    setFollowups([]); setHistorico([]); setDocumentos([]); setSociosEmpresa([]);\n    setLoadingDetalhe(true);\n    Promise.all([\n      apiFetch(`/api/empresas/${selecionada.id}/followups`).catch(() => []),\n      apiFetch(`/api/empresas/${selecionada.id}/historico`).catch(() => []),\n      apiFetch(`/api/empresas/${selecionada.id}/documentos`).catch(() => []),\n      apiFetch(`/api/empresas/${selecionada.id}/socios`).catch(() => []),\n    ]).then(([f, h, d, s]) => {\n      setFollowups(Array.isArray(f) ? f : []);\n      setHistorico(Array.isArray(h) ? h : []);\n      setDocumentos(Array.isArray(d) ? d : []);\n      setSociosEmpresa(Array.isArray(s) ? s : []);\n    }).finally(() => setLoadingDetalhe(false));'
new3 = '    setFollowups([]); setHistorico([]); setDocumentos([]); setSociosEmpresa([]);\n    setSimulacoesEmpresa([]); setContratosEmpresa([]);\n    setLoadingDetalhe(true);\n    Promise.all([\n      apiFetch(`/api/empresas/${selecionada.id}/followups`).catch(() => []),\n      apiFetch(`/api/empresas/${selecionada.id}/historico`).catch(() => []),\n      apiFetch(`/api/empresas/${selecionada.id}/documentos`).catch(() => []),\n      apiFetch(`/api/empresas/${selecionada.id}/socios`).catch(() => []),\n      apiFetch(`/api/empresas/${selecionada.id}/simulacoes`).catch(() => []),\n      apiFetch(`/api/empresas/${selecionada.id}/contratos`).catch(() => []),\n    ]).then(([f, h, d, s, sim, cont]) => {\n      setFollowups(Array.isArray(f) ? f : []);\n      setHistorico(Array.isArray(h) ? h : []);\n      setDocumentos(Array.isArray(d) ? d : []);\n      setSociosEmpresa(Array.isArray(s) ? s : []);\n      setSimulacoesEmpresa(Array.isArray(sim) ? sim : []);\n      setContratosEmpresa(Array.isArray(cont) ? cont : []);\n    }).finally(() => setLoadingDetalhe(false));'
if old3 in content:
    content = content.replace(old3, new3, 1)
    print("OK 3: carregamento de simulações e contratos adicionado")
else:
    errors.append("ERRO 3: bloco de carregamento de detalhe não encontrado")

# ── 4. Adicionar abas de Simulações e Contratos na UI ────────────────────
old4 = '                        { id: "visao_geral", label: "Visão Geral" },\n                        { id: "socios",      label: "Sócios",     badge: sociosEmpresa.length },\n                        { id: "followup",    label: "Follow-up",  badge: followups.filter(f=>!f.concluido).length },\n                        { id: "historico",   label: "Histórico",  badge: historico.length },\n                        { id: "documentos",  label: "Documentos", badge: documentos.length },\n                      ] as const).map(aba => ('
new4 = '                        { id: "visao_geral",  label: "Visão Geral" },\n                        { id: "socios",       label: "Sócios",      badge: sociosEmpresa.length },\n                        { id: "followup",     label: "Follow-up",   badge: followups.filter(f=>!f.concluido).length },\n                        { id: "simulacoes",   label: "Simulações",  badge: simulacoesEmpresa.length },\n                        { id: "contratos",    label: "Contratos",   badge: contratosEmpresa.length },\n                        { id: "historico",    label: "Histórico",   badge: historico.length },\n                        { id: "documentos",   label: "Documentos",  badge: documentos.length },\n                      ] as const).map(aba => ('
if old4 in content:
    content = content.replace(old4, new4, 1)
    print("OK 4: abas de simulações e contratos adicionadas")
else:
    errors.append("ERRO 4: lista de abas não encontrada")

# ── 5. Adicionar conteúdo das abas Simulações e Contratos ─────────────────
# Inserir antes do bloco final que fecha as abas
old5 = '                    ) : null\n                    )}\n                  </div>\n                </div>\n              )}\n            </div>\n          </div>\n        </div>\n      </div>\n\n      {/* ═══════════════════════════════════════════════════════════════════\n          MODAL DE CADASTRO / EDIÇÃO\n      ═══════════════════════════════════════════════════════════════════'
new5 = '''                    ) : abaAtiva === "simulacoes" ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-slate-700">Simulações vinculadas</h3>
                          <span className="text-xs text-slate-400">{simulacoesEmpresa.length} registro(s)</span>
                        </div>
                        {simulacoesEmpresa.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-slate-200">
                            <span className="text-4xl">🧮</span>
                            <p className="text-sm text-slate-500">Nenhuma simulação vinculada a esta empresa</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {simulacoesEmpresa.map((sim: any) => (
                              <div key={sim.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                                <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center shrink-0">
                                  <span className="text-base">🧮</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-slate-800">{sim.produto || "Simulação"}</p>
                                    {sim.status && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                        sim.status === "aprovado" ? "bg-green-100 text-green-700" :
                                        sim.status === "reprovado" ? "bg-red-100 text-red-700" :
                                        "bg-slate-100 text-slate-600"
                                      }`}>{sim.status}</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                    {sim.valor_solicitado && (
                                      <span className="text-xs text-slate-500">
                                        💰 {Number(sim.valor_solicitado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </span>
                                    )}
                                    {sim.prazo_meses && (
                                      <span className="text-xs text-slate-500">📅 {sim.prazo_meses}x</span>
                                    )}
                                    {sim.taxa_juros && (
                                      <span className="text-xs text-slate-500">📈 {sim.taxa_juros}% a.m.</span>
                                    )}
                                    {sim.valor_parcela && (
                                      <span className="text-xs text-slate-500">
                                        💳 {Number(sim.valor_parcela).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {sim.colaborador_nome && (
                                      <span className="text-xs text-slate-400">👤 {sim.colaborador_nome}</span>
                                    )}
                                    <span className="text-xs text-slate-400">
                                      {sim.criado_em ? new Date(sim.criado_em).toLocaleDateString("pt-BR") : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : abaAtiva === "contratos" ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-slate-700">Contratos vinculados</h3>
                          <span className="text-xs text-slate-400">{contratosEmpresa.length} registro(s)</span>
                        </div>
                        {contratosEmpresa.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border-2 border-dashed border-slate-200">
                            <span className="text-4xl">📄</span>
                            <p className="text-sm text-slate-500">Nenhum contrato vinculado a esta empresa</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {contratosEmpresa.map((cont: any) => (
                              <div key={cont.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                                  <span className="text-base">📄</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-slate-800">
                                      {cont.numero_contrato || cont.protocolo_contrato || `Contrato #${cont.id?.slice(0,8)}`}
                                    </p>
                                    {cont.status && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                        cont.status === "ativo" || cont.status === "assinado" ? "bg-green-100 text-green-700" :
                                        cont.status === "cancelado" ? "bg-red-100 text-red-700" :
                                        cont.status === "pendente" ? "bg-yellow-100 text-yellow-700" :
                                        "bg-slate-100 text-slate-600"
                                      }`}>{cont.status}</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                    {cont.tipo_contrato && (
                                      <span className="text-xs text-slate-500">📋 {cont.tipo_contrato}</span>
                                    )}
                                    {cont.valor_contrato && (
                                      <span className="text-xs text-slate-500">
                                        💰 {Number(cont.valor_contrato).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </span>
                                    )}
                                    {cont.data_assinatura && (
                                      <span className="text-xs text-slate-500">
                                        ✍️ {new Date(cont.data_assinatura).toLocaleDateString("pt-BR")}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {cont.responsavel_nome && (
                                      <span className="text-xs text-slate-400">👤 {cont.responsavel_nome}</span>
                                    )}
                                    <span className="text-xs text-slate-400">
                                      {cont.created_at ? new Date(cont.created_at).toLocaleDateString("pt-BR") : "—"}
                                    </span>
                                  </div>
                                </div>
                                {cont.pdf_path && (
                                  <a
                                    href={cont.pdf_path}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="shrink-0 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Ver PDF"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL DE CADASTRO / EDIÇÃO
      ═══════════════════════════════════════════════════════════════════'''

if old5 in content:
    content = content.replace(old5, new5, 1)
    print("OK 5: conteúdo das abas simulações e contratos adicionado")
else:
    errors.append("ERRO 5: bloco final das abas não encontrado")

# ── 6. Adicionar filtros de origem e porte na listagem de empresas ─────────
old6 = '  const carregarEmpresas = useCallback(async () => {\n    setLoading(true);\n    try {\n      const p = new URLSearchParams();\n      if (busca.trim()) p.set("busca", busca.trim());\n      if (filtroStatus !== "todos") p.set("status", filtroStatus);\n      const data = await apiFetch(`/api/empresas?${p.toString()}`);\n      setEmpresas(Array.isArray(data) ? data : []);\n    } catch { toast.error("Erro ao carregar empresas."); }\n    setLoading(false);\n  }, [busca, filtroStatus]);'
new6 = '  const [filtroOrigem, setFiltroOrigem] = useState("todos");\n  const [filtroPorte, setFiltroPorte] = useState("todos");\n\n  const carregarEmpresas = useCallback(async () => {\n    setLoading(true);\n    try {\n      const p = new URLSearchParams();\n      if (busca.trim()) p.set("busca", busca.trim());\n      if (filtroStatus !== "todos") p.set("status", filtroStatus);\n      if (filtroOrigem !== "todos") p.set("origem", filtroOrigem);\n      if (filtroPorte !== "todos") p.set("porte", filtroPorte);\n      const data = await apiFetch(`/api/empresas?${p.toString()}`);\n      setEmpresas(Array.isArray(data) ? data : []);\n    } catch { toast.error("Erro ao carregar empresas."); }\n    setLoading(false);\n  }, [busca, filtroStatus, filtroOrigem, filtroPorte]);'
if old6 in content:
    content = content.replace(old6, new6, 1)
    print("OK 6: filtros de origem e porte adicionados ao carregarEmpresas")
else:
    errors.append("ERRO 6: carregarEmpresas não encontrado")

# Relatório
if errors:
    for e in errors:
        print(e)
    sys.exit(1)

with open(path, "w") as f:
    f.write(content)

print("\nOK: Empresas.tsx atualizado com sucesso")
