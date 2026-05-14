import { useEffect, useMemo, useState } from "react";
import ColaboradorLayout from "./Layout";
import { useAuth } from "@/hooks/useAuth";

type Acompanhamento = any;

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
  const [rows, setRows] = useState<Acompanhamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [banco, setBanco] = useState("");
  const [pendentes, setPendentes] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [updOpen, setUpdOpen] = useState<any>(null);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [novo, setNovo] = useState<any>({ nome_empresa: "", banco_observado: "", data_inicio: new Date().toISOString().slice(0,10) });
  const [upd, setUpd] = useState<any>({ entrada_maquininha:0,entrada_pix:0,entrada_boleto:0,entrada_ted:0,entrada_dinheiro:0,outras_entradas:0,total_saidas:0 });

  const fetchData = async () => {
    setLoading(true);
    const q = new URLSearchParams({ busca: search, status, pendentes: String(pendentes) });
    const r = await fetch(`/api/acompanhamentos-bancarios?${q}`);
    setRows(r.ok ? await r.json() : []);
    setLoading(false);
  };
  useEffect(() => { if (can) fetchData(); }, [can]);

  const filtered = useMemo(() => rows.filter(r => !banco || String(r.banco_observado||"").toLowerCase().includes(banco.toLowerCase())), [rows,banco]);
  const resumo = useMemo(() => ({
    acompanhamento: filtered.filter(r => r.status === "em_acompanhamento").length,
    pendentes: filtered.filter(r => r.status_pendente).length,
    positivas: filtered.filter(r => r.status_semana === "positiva").length,
    negativas: filtered.filter(r => r.status_semana === "negativa").length,
    prorrogados: filtered.filter(r => r.status === "prorrogado").length,
    prontos: filtered.filter(r => String(r.recomendacao||"").includes("pronto") || r.status_semana === "positiva").length,
  }), [filtered]);

  const totalEntradas = ["entrada_maquininha","entrada_pix","entrada_boleto","entrada_ted","entrada_dinheiro","outras_entradas"].reduce((a,k)=>a+Number(upd[k]||0),0);
  const saldoSemanal = totalEntradas - Number(upd.total_saidas||0);

  if (!can) return <ColaboradorLayout title="Acompanhamento Bancário"><div className="p-6 text-red-600"><h2 className="font-bold">Acesso restrito</h2><p>Este módulo é exclusivo para Gestor de Crédito ou superior.</p></div></ColaboradorLayout>;

  return <ColaboradorLayout title="Acompanhamento Bancário"><div className="p-6 space-y-4">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Acompanhamento Bancário</h1><p className="text-sm text-gray-600">Monitoramento semanal de empresas em relacionamento bancário para evolução de rating, movimentação e preparação para crédito.</p></div><button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={()=>setNovoOpen(true)}>Novo Acompanhamento</button></div>
    {isWednesday && <div className="p-3 rounded bg-amber-50 border border-amber-200 text-amber-800">Hoje é quarta-feira: dia de atualizar os acompanhamentos bancários.</div>}
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">{Object.entries({"Em acompanhamento":resumo.acompanhamento,"Atualizações pendentes":resumo.pendentes,"Semanas positivas":resumo.positivas,"Semanas negativas":resumo.negativas,"Prontos para análise de crédito":resumo.prontos,"Prorrogados":resumo.prorrogados}).map(([k,v])=><div key={k} className="border rounded p-2 bg-white"><div className="text-gray-500">{k}</div><div className="font-bold text-xl">{v as number}</div></div>)}</div>
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2"><input className="border p-2 rounded" placeholder="Buscar empresa/CNPJ" value={search} onChange={e=>setSearch(e.target.value)} /><input className="border p-2 rounded" placeholder="Banco observado" value={banco} onChange={e=>setBanco(e.target.value)} /><select className="border p-2 rounded" value={status} onChange={e=>setStatus(e.target.value)}><option value="todos">Status</option><option value="em_acompanhamento">Em acompanhamento</option><option value="prorrogado">Prorrogado</option><option value="encerrado">Encerrado</option></select><input className="border p-2 rounded" placeholder="Responsável" disabled /><label className="flex items-center gap-2"><input type="checkbox" checked={pendentes} onChange={e=>setPendentes(e.target.checked)} /> Apenas pendentes</label></div>
    <button className="px-3 py-2 border rounded" onClick={fetchData}>Aplicar filtros</button>

    <div className="overflow-auto border rounded bg-white"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left"><th className="p-2">Empresa</th><th>CNPJ</th><th>Banco</th><th>Rating atual</th><th>Última atualização</th><th>Próxima atualização</th><th>Saldo última semana</th><th>Status semana</th><th>Responsável</th><th>Ações</th></tr></thead><tbody>{!loading && filtered.length===0 ? <tr><td className="p-4" colSpan={10}>Nenhum acompanhamento cadastrado.</td></tr> : filtered.map(r=><tr key={r.id} className="border-t"><td className="p-2">{r.nome_empresa}</td><td>{r.cnpj||"-"}</td><td>{r.banco_observado||"-"}</td><td>{r.rating_interno_atual||r.rating_bacen_atual||"-"}</td><td>{r.ultima_atualizacao_em?.slice(0,10)||"-"}</td><td>{r.proxima_atualizacao?.slice(0,10)||"-"}</td><td>{Number(r.saldo_semanal||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td>{r.status_semana||"-"}</td><td>{r.responsavel_nome||"-"}</td><td className="space-x-1"><button onClick={async()=>setDetalhe(await (await fetch(`/api/acompanhamentos-bancarios/${r.id}`)).json())} className="border px-2 rounded">Detalhes</button><button onClick={()=>{setUpdOpen(r);setUpd({});}} className="border px-2 rounded">Atualizar semana</button>{r.whatsapp_lembrete_url && <a className="border px-2 rounded inline-block" href={r.whatsapp_lembrete_url} target="_blank">WhatsApp</a>}<button onClick={async()=>{await fetch(`/api/acompanhamentos-bancarios/${r.id}/prorrogar`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});fetchData();}} className="border px-2 rounded">Prorrogar</button><button onClick={async()=>{await fetch(`/api/acompanhamentos-bancarios/${r.id}/encerrar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'encerrado'})});fetchData();}} className="border px-2 rounded">Encerrar</button></td></tr>)}</tbody></table></div>

    {novoOpen && <div className="fixed inset-0 bg-black/40 p-6 overflow-auto"><div className="max-w-4xl mx-auto bg-white p-4 rounded space-y-2"><h3 className="font-bold">Novo Acompanhamento</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-2">{["nome_empresa","cnpj","telefone_cliente","whatsapp_cliente","email_cliente","banco_observado","agencia","conta","gerente_banco","contato_banco","data_abertura_conta","objetivo_credito","valor_credito_pretendido","linha_credito_pretendida","rating_bacen_inicial","rating_interno_inicial","faturamento_anual","media_mensal","margem_seguranca_30","observacoes_iniciais","responsavel_id"].map(k=><input key={k} className="border p-2 rounded" placeholder={k} value={novo[k]||""} onChange={e=>setNovo({...novo,[k]:e.target.value})} />)}</div><div className="flex gap-2"><button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={async()=>{await fetch('/api/acompanhamentos-bancarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(novo)});setNovoOpen(false);fetchData();}}>Salvar</button><button className="px-3 py-2 border rounded" onClick={()=>setNovoOpen(false)}>Fechar</button></div></div></div>}

    {updOpen && <div className="fixed inset-0 bg-black/40 p-6 overflow-auto"><div className="max-w-4xl mx-auto bg-white p-4 rounded space-y-2"><h3 className="font-bold">Atualização Semanal - {updOpen.nome_empresa}</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-2">{["numero_semana","data_referencia_inicio","data_referencia_fim","entrada_maquininha","entrada_pix","entrada_boleto","entrada_ted","entrada_dinheiro","outras_entradas","total_saidas","saldo_medio","saldo_final","quantidade_transacoes","rating_bacen","rating_interno","scr_status","cenprot_status","serasa_status","cnd_status","pld_aml_status","coaf_status","analise_semana","orientacao_cliente","proxima_acao"].map(k=><input key={k} className="border p-2 rounded" placeholder={k} value={upd[k]||""} onChange={e=>setUpd({...upd,[k]:e.target.value})} />)}<label><input type="checkbox" checked={!!upd.possui_restricao} onChange={e=>setUpd({...upd,possui_restricao:e.target.checked})}/> possui_restricao</label><label><input type="checkbox" checked={!!upd.restricao_nova} onChange={e=>setUpd({...upd,restricao_nova:e.target.checked})}/> restricao_nova</label><label><input type="checkbox" checked={!!upd.devolucao_ou_estorno} onChange={e=>setUpd({...upd,devolucao_ou_estorno:e.target.checked})}/> devolucao_ou_estorno</label><label><input type="checkbox" checked={!!upd.ocorrencia_negativa} onChange={e=>setUpd({...upd,ocorrencia_negativa:e.target.checked})}/> ocorrencia_negativa</label></div><div className="text-sm">Total entradas: <b>{totalEntradas.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</b> | Saldo semanal: <b>{saldoSemanal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</b></div><div className="flex gap-2"><button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={async()=>{await fetch(`/api/acompanhamentos-bancarios/${updOpen.id}/atualizacoes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(upd)});setUpdOpen(null);fetchData();}}>Salvar atualização</button><button className="px-3 py-2 border rounded" onClick={()=>setUpdOpen(null)}>Fechar</button></div></div></div>}

    {detalhe && <div className="fixed inset-0 bg-black/40 p-6 overflow-auto"><div className="max-w-5xl mx-auto bg-white p-4 rounded"><h3 className="font-bold">Detalhes - {detalhe.nome_empresa}</h3><p>Banco observado: {detalhe.banco_observado || '-'}</p><p>Objetivo do crédito: {detalhe.objetivo_credito || '-'}</p><p>Rating inicial/atual: {detalhe.rating_interno_inicial || detalhe.rating_bacen_inicial || '-'} / {detalhe.rating_interno_atual || detalhe.rating_bacen_atual || '-'}</p><p>Faturamento anual/média mensal: {detalhe.faturamento_anual || 0} / {detalhe.media_mensal || 0}</p><h4 className="mt-3 font-semibold">Histórico semanal</h4><div className="max-h-72 overflow-auto border rounded"><table className="w-full text-sm"><thead><tr><th>Semana</th><th>Entradas</th><th>Saídas</th><th>Saldo</th><th>Status</th></tr></thead><tbody>{(detalhe.atualizacoes||[]).map((u:any)=><tr key={u.id}><td>{u.numero_semana}</td><td>{u.total_entradas}</td><td>{u.total_saidas}</td><td>{u.saldo_semanal}</td><td>{u.status}</td></tr>)}</tbody></table></div><button className="mt-3 px-3 py-2 border rounded" onClick={()=>setDetalhe(null)}>Fechar</button></div></div>}
  </div></ColaboradorLayout>
}
