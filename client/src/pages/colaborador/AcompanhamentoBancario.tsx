import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";

type AnyObj = Record<string, any>;
const fmt = (n: any) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = new Date();
const isWednesday = today.getDay() === 3;

function normalizePermValue(value?: string | null) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").replace(/-/g, "_");
}
function permitido(user: any) {
  if (!user) return false;
  if (user?.acesso_acompanhamento_bancario === true) return true;
  const ok = new Set(["admin", "administrador", "super_admin", "superadmin", "gestor_credito"]);
  return ok.has(normalizePermValue(user?.cargo)) || ok.has(normalizePermValue(user?.perfil));
}

export default function AcompanhamentoBancario() {
  const { colaborador } = useAuth();
  const can = permitido(colaborador);
  const printRef = useRef<HTMLIFrameElement | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [detalhe, setDetalhe] = useState<AnyObj | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [banco, setBanco] = useState("");
  const [pendentes, setPendentes] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [updOpen, setUpdOpen] = useState<any>(null);
  const [editSemana, setEditSemana] = useState<any>(null);
  const [novo, setNovo] = useState<any>({ nome_empresa: "", banco_observado: "", data_inicio: new Date().toISOString().slice(0, 10) });
  const [upd, setUpd] = useState<any>({ entrada_maquininha: 0, entrada_pix: 0, entrada_boleto: 0, entrada_ted: 0, entrada_dinheiro: 0, outras_entradas: 0, total_saidas: 0 });

  const fetchData = async () => {
    setLoading(true);
    const q = new URLSearchParams({ busca: search, status, pendentes: String(pendentes) });
    const r = await fetch(`/api/acompanhamentos-bancarios?${q}`);
    setRows(r.ok ? await r.json() : []);
    setLoading(false);
  };
  const carregarDetalhe = async (id: string) => {
    const r = await fetch(`/api/acompanhamentos-bancarios/${id}`);
    setDetalhe(r.ok ? await r.json() : null);
  };
  useEffect(() => { if (can) fetchData(); }, [can]);

  const filtered = useMemo(() => rows.filter(r => (!banco || String(r.banco_observado || "").toLowerCase().includes(banco.toLowerCase()))), [rows, banco]);
  const resumo = useMemo(() => ({
    acompanhamento: filtered.filter(r => r.status === "em_acompanhamento").length,
    pendentes: filtered.filter(r => r.status_pendente).length,
    positivas: filtered.filter(r => r.status_semana === "positiva").length,
    negativas: filtered.filter(r => r.status_semana === "negativa").length,
    prorrogados: filtered.filter(r => r.status === "prorrogado").length,
  }), [filtered]);

  const totalEntradas = ["entrada_maquininha", "entrada_pix", "entrada_boleto", "entrada_ted", "entrada_dinheiro", "outras_entradas"].reduce((a, k) => a + Number(upd[k] || 0), 0);
  const saldoSemanal = totalEntradas - Number(upd.total_saidas || 0);
  const semanaConsolidada = (detalhe?.atualizacoes || []).reduce((a: any, u: any) => ({
    entradas: a.entradas + Number(u.total_entradas || 0), saidas: a.saidas + Number(u.total_saidas || 0), saldo: a.saldo + Number(u.saldo_semanal || 0)
  }), { entradas: 0, saidas: 0, saldo: 0 });

  const imprimirRelatorio = () => {
    if (!detalhe || !printRef.current) return;
    const html = `<!doctype html><html><body><h2>Relatório Técnico - ${detalhe.nome_empresa}</h2>
      <p>Banco: ${detalhe.banco_observado || "-"}</p>
      <p>Faturamento anual: ${fmt(detalhe.faturamento_anual)}</p>
      <p>Média mensal: ${fmt(detalhe.media_mensal)}</p>
      <p>Consolidado: Entradas ${fmt(semanaConsolidada.entradas)} | Saídas ${fmt(semanaConsolidada.saidas)} | Saldo ${fmt(semanaConsolidada.saldo)}</p>
      ${(detalhe.atualizacoes || []).map((u: any) => `<div>Semana ${u.numero_semana}: ${fmt(u.total_entradas)} / ${fmt(u.total_saidas)} / ${fmt(u.saldo_semanal)} - ${u.status}</div>`).join("")}
    </body></html>`;
    const doc = printRef.current.contentDocument;
    if (!doc) return;
    doc.open(); doc.write(html); doc.close();
    printRef.current.contentWindow?.focus();
    printRef.current.contentWindow?.print();
  };

  if (!can) return <ColaboradorLayout title="Acompanhamento Bancário"><div className="p-6 text-red-600"><h2 className="font-bold">Acesso restrito</h2><p>Este módulo é exclusivo para Gestor de Crédito ou superior.</p></div></ColaboradorLayout>;

  return <ColaboradorLayout title="Acompanhamento Bancário"><div className="p-6 space-y-4">
    <iframe ref={printRef} title="print-acompanhamento" className="hidden" />
    <div className="flex items-start justify-between"><div><h1 className="text-2xl font-bold">Acompanhamento Bancário</h1><p className="text-sm text-gray-600">Monitoramento semanal de empresas em relacionamento bancário para evolução de rating, movimentação e preparação para crédito.</p></div><button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={() => setNovoOpen(true)}>Novo Acompanhamento</button></div>
    {isWednesday && <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-800">Hoje é quarta-feira: dia de atualizar os acompanhamentos bancários.</div>}
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm"><div className="border p-2 rounded">Em acompanhamento: <b>{resumo.acompanhamento}</b></div><div className="border p-2 rounded">Pendentes: <b>{resumo.pendentes}</b></div><div className="border p-2 rounded">Positivas: <b>{resumo.positivas}</b></div><div className="border p-2 rounded">Negativas: <b>{resumo.negativas}</b></div><div className="border p-2 rounded">Prorrogados: <b>{resumo.prorrogados}</b></div></div>
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2"><input className="border p-2 rounded" placeholder="Buscar empresa/CNPJ" value={search} onChange={e => setSearch(e.target.value)} /><input className="border p-2 rounded" placeholder="Banco observado" value={banco} onChange={e => setBanco(e.target.value)} /><select className="border p-2 rounded" value={status} onChange={e => setStatus(e.target.value)}><option value="todos">Status</option><option value="em_acompanhamento">Em acompanhamento</option><option value="prorrogado">Prorrogado</option><option value="encerrado">Encerrado</option></select><label className="flex items-center gap-2"><input type="checkbox" checked={pendentes} onChange={e => setPendentes(e.target.checked)} /> Apenas pendentes</label><button className="border rounded" onClick={fetchData}>Aplicar</button></div>

    <div className="overflow-auto border rounded bg-white"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left"><th className="p-2">Empresa</th><th>CNPJ</th><th>Banco</th><th>Rating</th><th>Próxima atualização</th><th>Status</th><th>Ações</th></tr></thead><tbody>{!loading && filtered.length === 0 ? <tr><td className="p-4" colSpan={7}>Nenhum acompanhamento cadastrado.</td></tr> : filtered.map(r => <tr key={r.id} className="border-t"><td className="p-2">{r.nome_empresa}</td><td>{r.cnpj || "-"}</td><td>{r.banco_observado || "-"}</td><td>{r.rating_interno_atual || r.rating_bacen_atual || "-"}</td><td>{r.proxima_atualizacao?.slice(0, 10) || "-"}</td><td>{r.status_semana || "-"}</td><td className="space-x-1"><button className="border px-2 rounded" onClick={() => carregarDetalhe(r.id)}>Detalhes</button><button className="border px-2 rounded" onClick={() => { setUpdOpen(r); setEditSemana(null); setUpd({}); }}>Atualizar semana</button></td></tr>)}</tbody></table></div>

    {updOpen && <div className="fixed inset-0 bg-black/40 p-6 overflow-auto"><div className="max-w-4xl mx-auto bg-white p-4 rounded space-y-2"><h3 className="font-bold">{editSemana ? "Editar semana" : "Atualização Semanal"} - {updOpen.nome_empresa}</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-2">{["numero_semana", "data_referencia_inicio", "data_referencia_fim", "entrada_maquininha", "entrada_pix", "entrada_boleto", "entrada_ted", "entrada_dinheiro", "outras_entradas", "total_saidas", "saldo_medio", "saldo_final", "quantidade_transacoes", "rating_bacen", "rating_interno", "analise_semana", "orientacao_cliente", "proxima_acao"].map(k => <input key={k} className="border p-2 rounded" placeholder={k} value={upd[k] || ""} onChange={e => setUpd({ ...upd, [k]: e.target.value })} />)}</div><div className="text-sm">Consolidado semana: entradas <b>{fmt(totalEntradas)}</b> | saldo <b>{fmt(saldoSemanal)}</b></div><div className="flex gap-2"><button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={async () => { const url = editSemana ? `/api/acompanhamentos-bancarios/${updOpen.id}/atualizacoes/${editSemana.id}` : `/api/acompanhamentos-bancarios/${updOpen.id}/atualizacoes`; await fetch(url, { method: editSemana ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(upd) }); setUpdOpen(null); setEditSemana(null); fetchData(); if (detalhe) carregarDetalhe(detalhe.id); }}>{editSemana ? "Salvar edição" : "Salvar atualização"}</button><button className="px-3 py-2 border rounded" onClick={() => { setUpdOpen(null); setEditSemana(null); }}>Fechar</button></div></div></div>}

    {detalhe && <div className="fixed inset-0 bg-black/40 p-6 overflow-auto"><div className="max-w-5xl mx-auto bg-white p-4 rounded"><h3 className="font-bold">Detalhes - {detalhe.nome_empresa}</h3><p>Relatório técnico: {detalhe.atualizacoes?.[0]?.diagnostico_compensacao || "Sem diagnóstico"}</p><p>Consolidado: Entradas {fmt(semanaConsolidada.entradas)} | Saídas {fmt(semanaConsolidada.saidas)} | Saldo {fmt(semanaConsolidada.saldo)}</p><button className="border px-2 py-1 rounded" onClick={imprimirRelatorio}>Imprimir relatório</button><div className="max-h-72 overflow-auto border rounded mt-2"><table className="w-full text-sm"><thead><tr><th>Semana</th><th>Entradas</th><th>Saídas</th><th>Saldo</th><th>Status</th><th>Ações</th></tr></thead><tbody>{(detalhe.atualizacoes || []).map((u: any) => <Fragment key={u.id}><tr><td>{u.numero_semana}</td><td>{fmt(u.total_entradas)}</td><td>{fmt(u.total_saidas)}</td><td>{fmt(u.saldo_semanal)}</td><td>{u.status}</td><td className="space-x-1"><button className="border px-2 rounded" onClick={() => { setUpdOpen(detalhe); setEditSemana(u); setUpd({ ...u, entrada_maquininha: u.entrada_maquina }); }}>Editar valores</button><button className="border px-2 rounded text-red-600" onClick={async () => { await fetch(`/api/acompanhamentos-bancarios/${detalhe.id}/atualizacoes/${u.id}`, { method: "DELETE" }); await carregarDetalhe(detalhe.id); fetchData(); }}>Apagar semana</button></td></tr></Fragment>)}</tbody></table></div><button className="mt-3 px-3 py-2 border rounded" onClick={() => setDetalhe(null)}>Fechar</button></div></div>}

    {novoOpen && <div className="fixed inset-0 bg-black/40 p-6 overflow-auto"><div className="max-w-4xl mx-auto bg-white p-4 rounded space-y-2"><h3 className="font-bold">Novo Acompanhamento</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-2">{["nome_empresa", "cnpj", "telefone_cliente", "whatsapp_cliente", "email_cliente", "banco_observado", "agencia", "conta", "gerente_banco", "contato_banco", "data_abertura_conta", "objetivo_credito", "valor_credito_pretendido", "linha_credito_pretendida", "rating_bacen_inicial", "rating_interno_inicial", "faturamento_anual", "observacoes_iniciais", "responsavel_id"].map(k => <input key={k} className="border p-2 rounded" placeholder={k} value={novo[k] || ""} onChange={e => setNovo({ ...novo, [k]: e.target.value })} />)}</div><div className="flex gap-2"><button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={async () => { await fetch("/api/acompanhamentos-bancarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novo) }); setNovoOpen(false); fetchData(); }}>Salvar</button><button className="px-3 py-2 border rounded" onClick={() => setNovoOpen(false)}>Fechar</button></div></div></div>}
  </div></ColaboradorLayout>;
}
