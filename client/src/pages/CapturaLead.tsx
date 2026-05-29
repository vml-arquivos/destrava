import { useState, FormEvent, useEffect } from "react";
import { Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Calculator,
  CheckCircle2,
  ArrowRight,
  Phone,
  User,
  Building2,
  Mail,
  DollarSign,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Shield,
  Clock,
  Star,
  Loader2,
  FileText,
} from "lucide-react";

// Mapa produto (query param) → label amigável e mensagem WhatsApp
const PRODUTO_META: Record<string, { label: string; whatsappMsg: string; titulo: string; subtitulo: string }> = {
  "rating-banco-central": {
    label: "Rating Banco Central",
    whatsappMsg: "Olá! Quero consultar o rating da minha empresa no Banco Central.",
    titulo: "Solicite sua Consulta de Rating",
    subtitulo: "Preencha seus dados e um especialista entrará em contato para iniciar a análise do seu rating no Banco Central.",
  },
  "certificado-digital": {
    label: "Certificado Digital",
    whatsappMsg: "Olá! Tenho interesse em adquirir um Certificado Digital.",
    titulo: "Solicite seu Certificado Digital",
    subtitulo: "Preencha seus dados e nossa equipe entrará em contato para orientar sobre o melhor tipo de certificado para você.",
  },
  "consulta-spc-serasa": {
    label: "Consulta SPC/Serasa",
    whatsappMsg: "Olá! Quero realizar uma consulta de CPF/CNPJ no SPC/Serasa.",
    titulo: "Solicite sua Consulta SPC/Serasa",
    subtitulo: "Preencha seus dados e um especialista entrará em contato para realizar a consulta e apresentar o relatório completo.",
  },
  "pronampe": {
    label: "PRONAMPE",
    whatsappMsg: "Olá! Tenho interesse no PRONAMPE para minha empresa.",
    titulo: "Simule seu Crédito via PRONAMPE",
    subtitulo: "Preencha seus dados e descubra se sua empresa se qualifica para o PRONAMPE.",
  },
  "giro-caixa-facil": {
    label: "Giro CAIXA Fácil",
    whatsappMsg: "Olá! Tenho interesse no Giro CAIXA Fácil.",
    titulo: "Simule o Giro CAIXA Fácil",
    subtitulo: "Capital de giro pela CAIXA Econômica Federal. Preencha seus dados para uma análise gratuita.",
  },
};

const PRODUTO_META_DEFAULT = {
  label: "",
  whatsappMsg: "Olá! Fiz uma simulação no site da Destrava Crédito e gostaria de conversar com um especialista.",
  titulo: "Simule seu Empréstimo e Descubra as Melhores Condições",
  subtitulo: "Preencha seus dados e receba uma estimativa personalizada. Um especialista da Destrava Crédito entrará em contato com as melhores opções para você.",
};

interface LeadForm {
  nome: string;
  telefone: string;
  empresa: string;
  email: string;
  valorDesejado: string;
  finalidade: string;
  tipoCliente: string;
}

interface ResultadoSimulacao {
  parcelaMin: number;
  parcelaMax: number;
  totalMin: number;
  totalMax: number;
  parcelas: number;
}

const FINALIDADES = [
  "Capital de Giro",
  "Expansão do Negócio",
  "Compra de Equipamentos",
  "Reforma / Construção",
  "Quitação de Dívidas",
  "Investimento em Estoque",
  "Folha de Pagamento",
  "Outro",
];

const FAIXAS_VALOR = [
  { label: "Até R$ 20.000", valor: "20000" },
  { label: "R$ 20.001 a R$ 50.000", valor: "50000" },
  { label: "R$ 50.001 a R$ 100.000", valor: "100000" },
  { label: "R$ 100.001 a R$ 300.000", valor: "300000" },
  { label: "R$ 300.001 a R$ 500.000", valor: "500000" },
  { label: "Acima de R$ 500.000", valor: "1000000" },
];

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function calcularEstimativa(valorStr: string, parcelas: number): ResultadoSimulacao | null {
  const valor = parseFloat(valorStr);
  if (!valor || valor <= 0 || !parcelas) return null;
  const taxaMin = 0.015;
  const taxaMax = 0.045;
  const parcelaMin =
    (valor * taxaMin * Math.pow(1 + taxaMin, parcelas)) /
    (Math.pow(1 + taxaMin, parcelas) - 1);
  const parcelaMax =
    (valor * taxaMax * Math.pow(1 + taxaMax, parcelas)) /
    (Math.pow(1 + taxaMax, parcelas) - 1);
  return {
    parcelaMin,
    parcelaMax,
    totalMin: parcelaMin * parcelas,
    totalMax: parcelaMax * parcelas,
    parcelas,
  };
}

function formatarTelefone(v: string): string {
  const nums = v.replace(/\D/g, "").slice(0, 11);
  if (nums.length <= 2) return nums;
  if (nums.length <= 6) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
  if (nums.length <= 10)
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`;
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

// Produtos que são serviços (não crédito) — não mostram simulador de parcelas
const PRODUTOS_SERVICO = ["rating-banco-central", "certificado-digital", "consulta-spc-serasa"];

export default function CapturaLead() {
  // Ler query param ?produto= da URL
  const [produtoParam, setProdutoParam] = useState<string>("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProdutoParam(params.get("produto") || "");
  }, []);

  const meta = PRODUTO_META[produtoParam] ?? PRODUTO_META_DEFAULT;
  const isServico = PRODUTOS_SERVICO.includes(produtoParam);

  const [etapa, setEtapa] = useState<"formulario" | "resultado">("formulario");
  const [form, setForm] = useState<LeadForm>({
    nome: "",
    telefone: "",
    empresa: "",
    email: "",
    valorDesejado: "",
    finalidade: "",
    tipoCliente: "empresa",
  });
  const [parcelas, setParcelas] = useState("24");
  const [resultado, setResultado] = useState<ResultadoSimulacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Partial<Record<keyof LeadForm, string>>>({});
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);

  const set = (field: keyof LeadForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (erros[field]) setErros((prev) => ({ ...prev, [field]: "" }));
  };

  function validar(): boolean {
    const novosErros: Partial<Record<keyof LeadForm, string>> = {};
    if (!form.nome.trim()) novosErros.nome = "Nome é obrigatório";
    if (!form.telefone.trim()) novosErros.telefone = "Telefone é obrigatório";
    else if (form.telefone.replace(/\D/g, "").length < 10)
      novosErros.telefone = "Telefone inválido";
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSimular(e: FormEvent) {
    e.preventDefault();
    if (!validar()) return;
    setEnviando(true);
    const res = isServico ? null : calcularEstimativa(form.valorDesejado, parseInt(parcelas));
    setResultado(res);
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          telefone: form.telefone,
          empresa: form.empresa || null,
          email: form.email || null,
          valorDesejado: form.valorDesejado ? parseFloat(form.valorDesejado) : null,
          finalidade: form.finalidade || null,
          tipoCliente: form.tipoCliente,
          parcelas: parseInt(parcelas),
          // Rastreamento de origem por produto
          origem: produtoParam ? `landing_${produtoParam}` : "simulador-publico",
          produto_interesse: meta.label || null,
          pagina: produtoParam ? `/${produtoParam}` : "/captura",
        }),
      });
    } catch (err) {
      console.error("[CapturaLead] Falha ao registrar lead na API:", err);
    }
    setEnviando(false);
    setEtapa("resultado");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const whatsappMsg = encodeURIComponent(
    `Olá! Me chamo ${form.nome}. ${meta.whatsappMsg}\n\n` +
      (form.empresa ? `Empresa: ${form.empresa}\n` : "") +
      (form.valorDesejado && !isServico ? `Valor desejado: ${fmt.format(parseFloat(form.valorDesejado))}\n` : "") +
      (form.finalidade ? `Finalidade: ${form.finalidade}\n` : "") +
      (!isServico ? `Prazo: ${parcelas} meses\n` : "") +
      `\nGostaria de conversar com um especialista.`
  );
  const whatsappUrl = `https://wa.me/556135268355?text=${whatsappMsg}`;

  const seoTitle = isServico
    ? `${meta.label} | Destrava Crédito`
    : "Simule seu Empréstimo Grátis | Destrava Crédito";
  const seoDesc = isServico
    ? `Solicite ${meta.label} com a Destrava Crédito. Atendimento especializado em Brasília e Goiânia.`
    : "Simule agora seu empréstimo empresarial ou pessoal. Preencha seus dados e receba uma estimativa personalizada.";

  return (
    <>
      <SEO
        title={seoTitle}
        description={seoDesc}
        keywords={`${meta.label || "simular empréstimo"}, crédito empresarial, Destrava Crédito`}
      />
      <Header />

      <main className="min-h-screen bg-gradient-to-b from-[#001f6b]/5 to-white">
        <section className="bg-gradient-to-br from-[#001f6b] via-[#002d8a] to-[#003db5] text-white py-14 px-4">
          <div className="max-w-3xl mx-auto text-center">
            {meta.label && (
              <Badge className="bg-white/20 text-white border-white/30 mb-4">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                {meta.label}
              </Badge>
            )}
            {!meta.label && (
              <Badge className="bg-white/20 text-white border-white/30 mb-4">
                <Calculator className="h-3.5 w-3.5 mr-1.5" />
                Simulação 100% Gratuita
              </Badge>
            )}
            <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              {meta.titulo}
            </h1>
            <p className="text-white/80 text-lg mb-6">
              {meta.subtitulo}
            </p>
            <div className="flex flex-wrap justify-center gap-5 text-sm text-white/70">
              <span className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-green-400" />
                Dados protegidos
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-yellow-400" />
                Resposta em até 2h
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="h-4 w-4 text-yellow-400" />
                +500 empresas atendidas
              </span>
            </div>
          </div>
        </section>

        <section className="py-12 px-4">
          <div className="max-w-2xl mx-auto">

            {etapa === "formulario" && (
              <Card className="shadow-xl border-0">
                <CardHeader className="pb-4 border-b">
                  <CardTitle className="text-xl flex items-center gap-2">
                    {isServico
                      ? <><FileText className="h-5 w-5 text-primary" />Preencha seus dados para solicitar</>
                      : <><Calculator className="h-5 w-5 text-primary" />Preencha seus dados para simular</>
                    }
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Campos com <span className="text-destructive font-semibold">*</span> são obrigatórios
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleSimular} className="space-y-6">

                    {/* Tipo de cliente */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: "empresa", label: "Empresa (PJ)", icon: Building2 },
                        { value: "pessoa_fisica", label: "Pessoa Física (PF)", icon: User },
                      ].map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => set("tipoCliente", value)}
                          className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                            form.tipoCliente === value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Dados de Contato
                      </p>

                      <div className="space-y-1.5">
                        <Label htmlFor="nome">
                          Nome Completo <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="nome"
                            value={form.nome}
                            onChange={(e) => set("nome", e.target.value)}
                            placeholder="Seu nome completo"
                            className={`pl-9 ${erros.nome ? "border-destructive" : ""}`}
                          />
                        </div>
                        {erros.nome && <p className="text-xs text-destructive">{erros.nome}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="telefone">
                          Telefone / WhatsApp <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="telefone"
                            value={form.telefone}
                            onChange={(e) => set("telefone", formatarTelefone(e.target.value))}
                            placeholder="(61) 9 9999-9999"
                            className={`pl-9 ${erros.telefone ? "border-destructive" : ""}`}
                            inputMode="tel"
                          />
                        </div>
                        {erros.telefone && <p className="text-xs text-destructive">{erros.telefone}</p>}
                      </div>

                      {form.tipoCliente === "empresa" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="empresa">
                            Nome da Empresa
                            <span className="text-muted-foreground text-xs ml-1.5 font-normal">(opcional)</span>
                          </Label>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="empresa"
                              value={form.empresa}
                              onChange={(e) => set("empresa", e.target.value)}
                              placeholder="Nome da sua empresa"
                              className="pl-9"
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label htmlFor="email">
                          E-mail
                          <span className="text-muted-foreground text-xs ml-1.5 font-normal">(opcional)</span>
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="email"
                            type="email"
                            value={form.email}
                            onChange={(e) => set("email", e.target.value)}
                            placeholder="seu@email.com"
                            className="pl-9"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Seção de crédito — oculta para produtos de serviço */}
                    {!isServico && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Sobre o Empréstimo
                          <span className="text-muted-foreground text-xs ml-1.5 font-normal normal-case">(todos opcionais)</span>
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label>Valor Desejado</Label>
                            <Select value={form.valorDesejado} onValueChange={(v) => set("valorDesejado", v)}>
                              <SelectTrigger>
                                <DollarSign className="h-4 w-4 text-muted-foreground mr-1 flex-shrink-0" />
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                {FAIXAS_VALOR.map((f) => (
                                  <SelectItem key={f.valor} value={f.valor}>{f.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Prazo Desejado</Label>
                            <Select value={parcelas} onValueChange={setParcelas}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[6, 12, 18, 24, 36, 48, 60, 72, 84].map((p) => (
                                  <SelectItem key={p} value={String(p)}>{p} meses</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Finalidade do Crédito</Label>
                          <Select value={form.finalidade} onValueChange={(v) => set("finalidade", v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Para que você precisa do crédito?" />
                            </SelectTrigger>
                            <SelectContent>
                              {FINALIDADES.map((f) => (
                                <SelectItem key={f} value={f}>{f}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      <Shield className="h-3.5 w-3.5 inline mr-1 text-green-600" />
                      Seus dados são protegidos e utilizados apenas para fins de atendimento.
                      Não compartilhamos com terceiros.
                    </p>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full font-bold text-base h-14"
                      disabled={enviando}
                    >
                      {enviando ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Enviando...
                        </>
                      ) : isServico ? (
                        <>
                          <ArrowRight className="mr-2 h-5 w-5" />
                          Solicitar {meta.label} — É Grátis
                        </>
                      ) : (
                        <>
                          <Calculator className="mr-2 h-5 w-5" />
                          Simular Agora — É Grátis
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {etapa === "resultado" && (
              <div className="space-y-6">
                <Card className="shadow-xl border-0 overflow-hidden">
                  <div className="bg-gradient-to-r from-[#001f6b] to-[#003db5] p-6 text-white text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-400" />
                    </div>
                    <h2 className="text-2xl font-bold mb-1">
                      {isServico ? `Solicitação Recebida, ${form.nome.split(" ")[0]}!` : `Simulação Concluída, ${form.nome.split(" ")[0]}!`}
                    </h2>
                    <p className="text-white/80 text-sm">
                      {isServico
                        ? "Nossa equipe entrará em contato em breve para dar continuidade ao seu pedido."
                        : "Veja abaixo uma estimativa baseada nas condições de mercado"}
                    </p>
                  </div>

                  <CardContent className="p-6 space-y-5">
                    {!isServico && resultado && form.valorDesejado ? (
                      <>
                        <div className="bg-gradient-to-br from-primary/5 to-transparent rounded-xl p-5 border border-primary/20">
                          <p className="text-sm text-muted-foreground text-center mb-2">
                            Estimativa de Parcela Mensal
                          </p>
                          <div className="text-center">
                            <p className="text-3xl font-bold text-primary">
                              {fmt.format(resultado.parcelaMin)}
                              <span className="text-muted-foreground text-lg font-normal mx-2">a</span>
                              {fmt.format(resultado.parcelaMax)}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              em {resultado.parcelas}x · taxa de 1,5% a 4,5% a.m.
                            </p>
                          </div>
                        </div>

                        <button
                          className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
                        >
                          <span>Ver detalhes da estimativa</span>
                          {mostrarDetalhes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        {mostrarDetalhes && (
                          <div className="space-y-2 text-sm border-t pt-4">
                            {[
                              ["Valor solicitado", fmt.format(parseFloat(form.valorDesejado))],
                              ["Prazo", `${resultado.parcelas} meses`],
                              ["Total mínimo estimado", fmt.format(resultado.totalMin)],
                              ["Total máximo estimado", fmt.format(resultado.totalMax)],
                            ].map(([label, value]) => (
                              <div key={label} className="flex justify-between py-1.5 border-b last:border-0">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="font-semibold">{value}</span>
                              </div>
                            ))}
                            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
                              <strong>Aviso de Simulação:</strong> Os valores apresentados são estimativas para fins de simulação e podem variar conforme análise de crédito, documentação, perfil do cliente, garantia oferecida e condições vigentes da instituição financeira no momento da contratação. Sujeito à análise e aprovação.
                            </p>
                          </div>
                        )}
                      </>
                    ) : isServico ? (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-sm text-green-800">
                        <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                        <p className="font-semibold">Pedido registrado com sucesso!</p>
                        <p className="mt-1 text-green-700">Um especialista em <strong>{meta.label}</strong> entrará em contato em até 2 horas úteis.</p>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        Para ver a estimativa de parcelas, informe o valor desejado na próxima simulação.
                      </div>
                    )}

                    <div className="bg-muted/30 rounded-xl p-4 text-sm space-y-2">
                      <p className="font-semibold">Seus dados registrados:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-muted-foreground block text-xs">Nome</span><p className="font-medium">{form.nome}</p></div>
                        <div><span className="text-muted-foreground block text-xs">Telefone</span><p className="font-medium">{form.telefone}</p></div>
                        {form.empresa && <div><span className="text-muted-foreground block text-xs">Empresa</span><p className="font-medium">{form.empresa}</p></div>}
                        {form.finalidade && <div><span className="text-muted-foreground block text-xs">Finalidade</span><p className="font-medium">{form.finalidade}</p></div>}
                        {meta.label && <div className="col-span-2"><span className="text-muted-foreground block text-xs">Produto de interesse</span><p className="font-medium">{meta.label}</p></div>}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="lg" className="w-full font-bold bg-green-600 hover:bg-green-700 h-14">
                          <MessageCircle className="mr-2 h-5 w-5" />
                          Falar com Especialista no WhatsApp
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                      </a>
                      <p className="text-xs text-center text-muted-foreground">
                        Um especialista entrará em contato em até 2 horas úteis
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => { setEtapa("formulario"); setResultado(null); }}
                    >
                      {isServico ? "Fazer nova solicitação" : "Fazer nova simulação"}
                    </Button>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { href: "/credito-empresas", titulo: "Crédito Empresarial", icon: Building2 },
                    { href: "/credito-pessoal", titulo: "Crédito Pessoal", icon: User },
                    { href: "/simular", titulo: "Simulador Completo", icon: Calculator },
                  ].map((item) => (
                    <Link key={item.href} href={item.href}>
                      <a className="block p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-center">
                        <item.icon className="h-5 w-5 text-primary mx-auto mb-1.5" />
                        <p className="font-semibold text-xs">{item.titulo}</p>
                      </a>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="py-10 px-4 bg-muted/30 border-t border-border">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap justify-center gap-8 text-center">
              {[
                { valor: "+500", label: "Empresas atendidas" },
                { valor: "+15", label: "Linhas de crédito" },
                { valor: "R$ 50M+", label: "Em crédito captado" },
                { valor: "98%", label: "Satisfação" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-2xl font-bold text-primary">{item.valor}</p>
                  <p className="text-muted-foreground text-xs">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
