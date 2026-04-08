import { useState } from "react";
import { gerarPdfSimulacao } from "@/lib/gerarPdfSimulacao";
import { Link } from "wouter";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Calculator,
  User,
  Phone,
  Building2,
  Mail,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  TrendingUp,
  Clock,
  Shield,
  MessageCircle,
  Star,
  Briefcase,
  Home,
  Car,
  Banknote,
  FileDown,
  ArrowLeft,
  Award,
  Zap,
} from "lucide-react";

// ─── Produtos de crédito ──────────────────────────────────────────────────────
const produtos = [
  {
    id: "giro-caixa",
    nome: "Giro CAIXA Fácil",
    desc: "Capital de giro para MEI, ME e EPP",
    tipo: "empresa",
    minValor: 5000,
    maxValor: 70000,
    minPrazo: 6,
    maxPrazo: 36,
    minTaxa: 2.25,
    maxTaxa: 3.6,
    tags: ["Até R$ 70k", "2,25% a.m."],
    cor: "blue",
  },
  {
    id: "pronampe",
    nome: "PRONAMPE",
    desc: "Programa Nacional de Apoio às Micro e Pequenas Empresas",
    tipo: "empresa",
    minValor: 10000,
    maxValor: 250000,
    minPrazo: 12,
    maxPrazo: 48,
    minTaxa: 1.5,
    maxTaxa: 2.0,
    tags: ["Até R$ 250k", "1,5% a 2,0% a.m."],
    cor: "green",
  },
  {
    id: "capital-giro",
    nome: "Capital de Giro",
    desc: "Linhas de crédito para médias e grandes empresas",
    tipo: "empresa",
    minValor: 50000,
    maxValor: 1000000,
    minPrazo: 12,
    maxPrazo: 36,
    minTaxa: 2.25,
    maxTaxa: 4.99,
    tags: ["Até R$ 1M", "2,25% a 4,99% a.m."],
    cor: "purple",
  },
  {
    id: "credito-pessoal",
    nome: "Crédito Pessoal",
    desc: "Empréstimo para pessoa física com análise rápida",
    tipo: "pf",
    minValor: 1000,
    maxValor: 50000,
    minPrazo: 6,
    maxPrazo: 60,
    minTaxa: 2.5,
    maxTaxa: 6.0,
    tags: ["Até R$ 50k", "Aprovação rápida"],
    cor: "orange",
  },
  {
    id: "consignado",
    nome: "Consignado",
    desc: "Desconto em folha para servidores e aposentados",
    tipo: "pf",
    minValor: 1000,
    maxValor: 100000,
    minPrazo: 12,
    maxPrazo: 96,
    minTaxa: 1.5,
    maxTaxa: 2.14,
    tags: ["Até R$ 100k", "Menor taxa"],
    cor: "teal",
  },
  {
    id: "financiamento-imovel",
    nome: "Financiamento Imobiliário",
    desc: "Finance seu imóvel com as melhores condições",
    tipo: "pf",
    minValor: 50000,
    maxValor: 1500000,
    minPrazo: 60,
    maxPrazo: 360,
    minTaxa: 0.7,
    maxTaxa: 1.1,
    tags: ["Até R$ 1,5M", "Até 30 anos"],
    cor: "indigo",
  },
  {
    id: "procred360",
    nome: "ProCred 360",
    desc: "Juros 50% menores para MEI e microempresas (fat. até R$ 360k/ano)",
    tipo: "empresa",
    minValor: 5000,
    maxValor: 150000,
    minPrazo: 12,
    maxPrazo: 48,
    minTaxa: 1.5,
    maxTaxa: 2.0,
    tags: ["Até R$ 150k", "1,5% a 2,0% a.m."],
    cor: "yellow",
  },
  {
    id: "peac-fgi",
    nome: "FGI / FAMPE",
    desc: "Capital de giro com garantia do FGI/BNDES e Aval Sebrae (FAMPE)",
    tipo: "empresa",
    minValor: 5000,
    maxValor: 1000000,
    minPrazo: 12,
    maxPrazo: 48,
    minTaxa: 1.8,
    maxTaxa: 1.8,
    tags: ["Até R$ 1M", "1,8% a.m."],
    cor: "emerald",
  },
  {
    id: "fco",
    nome: "FCO",
    desc: "Fundo Constitucional do Centro-Oeste (GO, MT, MS, DF)",
    tipo: "empresa",
    minValor: 10000,
    maxValor: 5000000,
    minPrazo: 12,
    maxPrazo: 144,
    minTaxa: 0.68,
    maxTaxa: 1.11,
    tags: ["Centro-Oeste", "0,68% a 1,11% a.m."],
    cor: "violet",
  },

];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcParcela(valor: number, taxa: number, prazo: number) {
  if (taxa === 0) return valor / prazo;
  const t = taxa / 100;
  return (valor * t * Math.pow(1 + t, prazo)) / (Math.pow(1 + t, prazo) - 1);
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SimuladorPublico() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tipoPessoa, setTipoPessoa] = useState<"empresa" | "pf">("empresa");
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    empresa: "",
    email: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [produtoSelecionado, setProdutoSelecionado] = useState(produtos[0]);
  const [valor, setValor] = useState(produtos[0].minValor);
  const [prazo, setPrazo] = useState(produtos[0].minPrazo);
  const [taxa, setTaxa] = useState(produtos[0].minTaxa);
  const [enviando, setEnviando] = useState(false);
  const [leadSalvo, setLeadSalvo] = useState(false);

  const produtosFiltrados = produtos.filter((p) => p.tipo === tipoPessoa);

  const parcela = calcParcela(valor, taxa, prazo);
  const totalJuros = parcela * prazo - valor;
  const totalPagar = parcela * prazo;

  // Validar Step 1
  function validarStep1() {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Nome é obrigatório";
    if (!form.telefone.trim()) e.telefone = "Telefone é obrigatório";
    else if (form.telefone.replace(/\D/g, "").length < 10)
      e.telefone = "Telefone inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleStep1() {
    if (validarStep1()) {
      // Sincronizar produto com tipo de pessoa
      const prods = produtos.filter((p) => p.tipo === tipoPessoa);
      const prod = prods[0];
      setProdutoSelecionado(prod);
      setValor(prod.minValor);
      setPrazo(prod.minPrazo);
      setTaxa(prod.minTaxa);
      setStep(2);
    }
  }

  function selecionarProduto(prod: (typeof produtos)[0]) {
    setProdutoSelecionado(prod);
    setValor(prod.minValor);
    setPrazo(prod.minPrazo);
    setTaxa(prod.minTaxa);
  }

  async function handleSimular() {
    setEnviando(true);
    try {
      // Captura UTM params da URL para rastreabilidade
      const urlParams = new URLSearchParams(window.location.search);
      const resp = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          telefone: form.telefone,
          empresa: form.empresa || undefined,
          email: form.email || undefined,
          // produto_interesse é o campo correto no schema; "produto" é alias aceito pelo backend
          produto: produtoSelecionado.nome,
          produto_interesse: produtoSelecionado.nome,
          // Campos com nomes exatos das colunas do banco (schema real)
          valor_solicitado: valor,
          prazo_meses: prazo,
          // Aliases camelCase para compatibilidade com normalização do backend
          valorSolicitado: valor,
          prazo,
          taxaEstimada: taxa,
          parcelaMensal: parcela,
          totalPagar,
          // Mapeia corretamente: "empresa" → "pj", "pf" → "pf"
          tipoPessoa: tipoPessoa === "empresa" ? "pj" : tipoPessoa,
          tipo_pessoa: tipoPessoa === "empresa" ? "pj" : tipoPessoa,
          // Origem explícita para rastreabilidade no funil
          origem: "simulador_publico",
          etapa_funil: "novo",
          temperatura: "frio",
          // Contexto de rastreamento
          pagina: "/simular",
          pagina_origem: "/simular",
          utm_source:   urlParams.get("utm_source") || undefined,
          utm_medium:   urlParams.get("utm_medium") || undefined,
          utm_campaign: urlParams.get("utm_campaign") || undefined,
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        console.error("[SimuladorPublico] Falha ao salvar lead:", resp.status, errBody);
      }
      setLeadSalvo(true);
    } catch (err) {
      console.error("[SimuladorPublico] Erro de rede ao salvar lead:", err);
      setLeadSalvo(true); // Mostrar resultado mesmo se falhar o salvamento
    }
    setEnviando(false);
    setStep(3);
  }

  function formatPhone(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 11)
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return v;
  }

  return (
    <>
      <SEO
        title="Simulador de Crédito Gratuito | Destrava Crédito"
        description="Simule seu empréstimo gratuitamente. Crédito empresarial e pessoal com as melhores condições do mercado."
      />

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#0033A0] to-[#001f6b] text-white py-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Badge className="bg-yellow-400 text-yellow-900 mb-4 text-sm font-semibold">
            Simulação 100% Gratuita
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            Simule seu Empréstimo e Descubra as Melhores Condições
          </h1>
          <p className="text-blue-100 text-lg mb-6">
            Preencha seus dados e simule em segundos. Um especialista entrará em
            contato com as melhores opções para você.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-blue-200">
            <span className="flex items-center gap-1">
              <Shield className="w-4 h-4" /> Dados protegidos
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> Resposta em até 2h
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-4 h-4" /> +500 empresas atendidas
            </span>
          </div>
        </div>
      </section>

      {/* Indicador de passos */}
      <div className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-2">
            {[
              { n: 1, label: "Seus Dados" },
              { n: 2, label: "Simulação" },
              { n: 3, label: "Resultado" },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 ${step >= s.n ? "text-[#0033A0]" : "text-gray-400"}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                      step > s.n
                        ? "bg-green-500 border-green-500 text-white"
                        : step === s.n
                          ? "bg-[#0033A0] border-[#0033A0] text-white"
                          : "border-gray-300 text-gray-400"
                    }`}
                  >
                    {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                  </div>
                  <span
                    className={`text-sm font-medium hidden sm:block ${step >= s.n ? "text-[#0033A0]" : "text-gray-400"}`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < 2 && (
                  <div
                    className={`w-8 sm:w-16 h-0.5 ${step > s.n ? "bg-green-500" : "bg-gray-200"}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 min-h-screen py-10 px-4">
        <div className="max-w-4xl mx-auto">
          {/* ── STEP 1: Dados do cliente ── */}
          {step === 1 && (
            <div className="bg-white rounded-2xl shadow-sm border p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-[#0033A0]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Preencha seus dados para simular
                  </h2>
                  <p className="text-sm text-gray-500">
                    Campos com * são obrigatórios
                  </p>
                </div>
              </div>

              {/* Tipo de pessoa */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => setTipoPessoa("empresa")}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 font-medium transition-all ${
                    tipoPessoa === "empresa"
                      ? "border-[#0033A0] bg-blue-50 text-[#0033A0]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Empresa (PJ)
                </button>
                <button
                  onClick={() => setTipoPessoa("pf")}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 font-medium transition-all ${
                    tipoPessoa === "pf"
                      ? "border-[#0033A0] bg-blue-50 text-[#0033A0]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <User className="w-4 h-4" />
                  Pessoa Física (PF)
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Dados de Contato
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nome" className="text-sm font-medium mb-1.5 block">
                      Nome Completo *
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="nome"
                        placeholder="Seu nome completo"
                        className={`pl-9 ${errors.nome ? "border-red-400" : ""}`}
                        value={form.nome}
                        onChange={(e) =>
                          setForm({ ...form, nome: e.target.value })
                        }
                      />
                    </div>
                    {errors.nome && (
                      <p className="text-red-500 text-xs mt-1">{errors.nome}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="telefone" className="text-sm font-medium mb-1.5 block">
                      Telefone / WhatsApp *
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="telefone"
                        placeholder="(61) 9 9999-9999"
                        className={`pl-9 ${errors.telefone ? "border-red-400" : ""}`}
                        value={form.telefone}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            telefone: formatPhone(e.target.value),
                          })
                        }
                      />
                    </div>
                    {errors.telefone && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.telefone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="empresa" className="text-sm font-medium mb-1.5 block">
                      {tipoPessoa === "empresa"
                        ? "Nome da Empresa"
                        : "Empresa (opcional)"}{" "}
                      <span className="text-gray-400 font-normal">
                        (opcional)
                      </span>
                    </Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="empresa"
                        placeholder={
                          tipoPessoa === "empresa"
                            ? "Razão social ou nome fantasia"
                            : "Nome da empresa (se aplicável)"
                        }
                        className="pl-9"
                        value={form.empresa}
                        onChange={(e) =>
                          setForm({ ...form, empresa: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-sm font-medium mb-1.5 block">
                      E-mail{" "}
                      <span className="text-gray-400 font-normal">
                        (opcional)
                      </span>
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="seu@email.com"
                        className="pl-9"
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-400 flex items-start gap-1.5 mt-2">
                  <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Seus dados são protegidos e utilizados apenas para fins de
                  atendimento. Não compartilhamos com terceiros.
                </p>

                <Button
                  onClick={handleStep1}
                  className="w-full bg-[#0033A0] hover:bg-[#002280] text-white py-3 text-base font-semibold rounded-xl mt-2"
                >
                  Continuar para Simulação
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Simulador com sliders ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                {/* Coluna esquerda: escolha do produto */}
                <div className="bg-white rounded-2xl shadow-sm border p-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> Escolha o Produto
                  </p>
                  <div className="space-y-2">
                    {produtosFiltrados.map((prod) => (
                      <button
                        key={prod.id}
                        onClick={() => selecionarProduto(prod)}
                        className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                          produtoSelecionado.id === prod.id
                            ? "border-[#0033A0] bg-blue-50"
                            : "border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <p className="font-semibold text-sm text-gray-900">
                          {prod.nome}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {prod.desc}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {prod.tags.map((t) => (
                            <span
                              key={t}
                              className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Coluna central: sliders */}
                <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Parâmetros da Simulação
                      </p>
                      <p className="text-sm text-gray-600 font-medium">
                        {produtoSelecionado.nome}
                      </p>
                    </div>
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      {tipoPessoa === "empresa" ? "Empresarial" : "Pessoal"}
                    </Badge>
                  </div>

                  <div className="space-y-6">
                    {/* Slider Valor */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-sm font-semibold text-gray-700">
                          Valor Desejado
                        </Label>
                        <span className="text-lg font-bold text-[#0033A0]">
                          {formatCurrency(valor)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={produtoSelecionado.minValor}
                        max={produtoSelecionado.maxValor}
                        step={produtoSelecionado.maxValor > 100000 ? 5000 : 1000}
                        value={valor}
                        onChange={(e) => setValor(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0033A0]"
                      />
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>{formatCurrency(produtoSelecionado.minValor)}</span>
                        <span>{formatCurrency(produtoSelecionado.maxValor)}</span>
                      </div>
                    </div>

                    {/* Slider Prazo */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-sm font-semibold text-gray-700">
                          Prazo de Pagamento
                        </Label>
                        <span className="text-lg font-bold text-[#0033A0]">
                          {prazo} meses
                        </span>
                      </div>
                      <input
                        type="range"
                        min={produtoSelecionado.minPrazo}
                        max={produtoSelecionado.maxPrazo}
                        step={6}
                        value={prazo}
                        onChange={(e) => setPrazo(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0033A0]"
                      />
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>{produtoSelecionado.minPrazo} meses</span>
                        <span>{produtoSelecionado.maxPrazo} meses</span>
                      </div>
                    </div>

                    {/* Slider Taxa */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label className="text-sm font-semibold text-gray-700">
                          Taxa de Juros (a.m.)
                        </Label>
                        <span className="text-lg font-bold text-[#0033A0]">
                          {taxa.toFixed(2)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={produtoSelecionado.minTaxa * 100}
                        max={produtoSelecionado.maxTaxa * 100}
                        step={1}
                        value={taxa * 100}
                        onChange={(e) =>
                          setTaxa(Number(e.target.value) / 100)
                        }
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0033A0]"
                      />
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>{produtoSelecionado.minTaxa}%</span>
                        <span>{produtoSelecionado.maxTaxa}%</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        * Taxa final depende da análise de crédito
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resultado em tempo real */}
              <div className="bg-white rounded-2xl shadow-sm border p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Resultado da Simulação
                </p>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-4 bg-blue-50 rounded-xl">
                    <Banknote className="w-6 h-6 text-[#0033A0] mx-auto mb-1" />
                    <p className="text-xs text-gray-500 mb-1">Valor da Parcela</p>
                    <p className="text-xl font-bold text-[#0033A0]">
                      {formatCurrency(parcela)}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-xl">
                    <TrendingUp className="w-6 h-6 text-orange-500 mx-auto mb-1" />
                    <p className="text-xs text-gray-500 mb-1">Total de Juros</p>
                    <p className="text-xl font-bold text-orange-600">
                      {formatCurrency(totalJuros)}
                    </p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-xl">
                    <Calculator className="w-6 h-6 text-gray-600 mx-auto mb-1" />
                    <p className="text-xs text-gray-500 mb-1">Valor Total</p>
                    <p className="text-xl font-bold text-gray-800">
                      {formatCurrency(totalPagar)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1 border-gray-300"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
                  </Button>
                  <Button
                    onClick={handleSimular}
                    disabled={enviando}
                    className="flex-[2] bg-[#0033A0] hover:bg-[#002280] text-white font-semibold rounded-xl"
                  >
                    {enviando ? (
                      "Enviando..."
                    ) : (
                      <>
                        <Calculator className="w-4 h-4 mr-2" />
                        Solicitar Proposta — É Grátis
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Resultado / Confirmação ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Confirmação */}
              <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Simulação Recebida!
                </h2>
                <p className="text-gray-600 mb-1">
                  Olá, <strong>{form.nome}</strong>! Recebemos sua simulação.
                </p>
                <p className="text-gray-500 text-sm">
                  Um especialista da Destrava Crédito entrará em contato pelo
                  WhatsApp <strong>{form.telefone}</strong> em até 2 horas.
                </p>
              </div>

              {/* Card de resultado enriquecido */}
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Resumo da Sua Simulação
                </p>

                {/* Linha recomendada com justificativa */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <Award className="w-5 h-5 text-[#0033A0] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-[#0033A0]">
                        Linha Recomendada: {produtoSelecionado.nome}
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        {produtoSelecionado.desc}. Indicada para o seu perfil ({tipoPessoa === "empresa" ? "Pessoa Jurídica" : "Pessoa Física"}) com o valor e prazo solicitados.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 bg-blue-50 rounded-xl">
                    <p className="text-xs text-gray-500">Produto</p>
                    <p className="font-bold text-[#0033A0] text-sm mt-1">{produtoSelecionado.nome}</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-xl">
                    <p className="text-xs text-gray-500">Valor</p>
                    <p className="font-bold text-[#0033A0] text-sm mt-1">{formatCurrency(valor)}</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-xl">
                    <p className="text-xs text-gray-500">Prazo</p>
                    <p className="font-bold text-[#0033A0] text-sm mt-1">{prazo} meses</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-xl">
                    <p className="text-xs text-gray-500">Parcela Est.</p>
                    <p className="font-bold text-green-600 text-sm mt-1">{formatCurrency(parcela)}</p>
                  </div>
                </div>

                {/* Prazo estimado de aprovação */}
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 mb-4">
                  <Zap className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  <p className="text-sm text-gray-700">
                    <strong>Prazo estimado de aprovação:</strong>{" "}
                    {produtoSelecionado.id === "pronampe" || produtoSelecionado.id === "procred360"
                      ? "5 a 15 dias úteis após análise documental"
                      : produtoSelecionado.id === "consignado"
                      ? "1 a 3 dias úteis"
                      : produtoSelecionado.id === "credito-pessoal"
                      ? "24 a 72 horas"
                      : "3 a 10 dias úteis após análise"}
                  </p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800 mb-4">
                  <strong>Aviso de Simulação:</strong> Os valores apresentados são estimativas para fins de simulação e podem variar conforme análise de crédito, documentação, perfil do cliente, garantia oferecida e condições vigentes da instituição financeira no momento da contratação. A Destrava Crédito atua como assessoria e não realiza aprovação de crédito. Sujeito à análise e aprovação da instituição financeira.
                </div>

                {/* CTAs principais */}
                <div className="grid md:grid-cols-2 gap-3 mb-3">
                  <a
                    href={`https://wa.me/556135268355?text=Ol%C3%A1!%20Fiz%20uma%20simula%C3%A7%C3%A3o%20no%20site%20para%20${encodeURIComponent(produtoSelecionado.nome)}%20no%20valor%20de%20${encodeURIComponent(formatCurrency(valor))}%20em%20${prazo}%20meses.%20Meu%20nome%20%C3%A9%20${encodeURIComponent(form.nome)}.%20Gostaria%20de%20avan%C3%A7ar%20com%20a%20proposta.`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Quero Avançar — Falar Agora
                  </a>
                  <Button
                    variant="outline"
                    onClick={() => {
                      gerarPdfSimulacao({
                        cliente: {
                          nome: form.nome,
                          empresa: form.empresa || undefined,
                          telefone: form.telefone,
                          linhaCredito: produtoSelecionado.nome,
                        },
                        cenarioA: {
                          taxa,
                          valorCredito: valor,
                          prazo,
                          parcela,
                          totalFinanciamento: totalPagar,
                          totalJuros,
                          custoTotalOperacao: totalPagar,
                          cenario: "sem_imposto",
                        },
                        modo: "simples",
                      });
                    }}
                    className="flex items-center justify-center gap-2 border-[#0033A0] text-[#0033A0] hover:bg-blue-50"
                  >
                    <FileDown className="w-4 h-4" />
                    Baixar Simulação em PDF
                  </Button>
                </div>

                {/* Ações secundárias */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep(1);
                      setForm({ nome: "", telefone: "", empresa: "", email: "" });
                      setLeadSalvo(false);
                    }}
                    className="border-gray-300 text-gray-600"
                  >
                    Nova Simulação
                  </Button>
                  <Link href="/">
                    <Button variant="ghost" className="w-full text-gray-500 hover:text-[#0033A0]">
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      Voltar à Página Inicial
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <section className="bg-white border-t py-10 px-4">
        <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { v: "+500", l: "Empresas atendidas" },
            { v: "+15", l: "Linhas de crédito" },
            { v: "R$ 50M+", l: "Em crédito captado" },
            { v: "98%", l: "Satisfação" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-2xl font-bold text-[#0033A0]">{s.v}</p>
              <p className="text-sm text-gray-500 mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
