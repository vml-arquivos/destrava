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
  MessageCircle,
  Shield,
  Clock,
  Star,
  Loader2,
  FileText,
} from "lucide-react";
import FormSubmitError from "@/components/FormSubmitError";
import { submitLead } from "@/lib/leads";
import { getMarketingAttribution } from "@/lib/analytics";
import { COMPANY } from "@/config/company";

// Mapa produto (query param) → label amigável e mensagem WhatsApp
const PRODUTO_META: Record<string, { label: string; whatsappMsg: string; titulo: string; subtitulo: string }> = {
  "rating-banco-central": {
    label: "Diagnóstico de Crédito com Dados do Banco Central",
    whatsappMsg: "Olá! Quero entender os dados de crédito da minha empresa no SCR/Registrato.",
    titulo: "Solicite seu Diagnóstico de Crédito",
    subtitulo: "Preencha seus dados e um especialista entrará em contato para orientar a leitura do SCR/Registrato e a organização do perfil de crédito.",
  },
  "certificado-digital": {
    label: "Certificado Digital",
    whatsappMsg: "Olá! Tenho interesse em adquirir um Certificado Digital.",
    titulo: "Solicite seu Certificado Digital",
    subtitulo: "Preencha seus dados e nossa equipe entrará em contato para orientar sobre o melhor tipo de certificado para você.",
  },
  "certificado-digital-a1": {
    label: "Certificado Digital A1",
    whatsappMsg: "Olá! Preciso emitir um Certificado Digital A1 com urgência.",
    titulo: "Solicite seu Certificado Digital A1",
    subtitulo: "Preencha seus dados para receber orientação sobre documentos, validação e emissão do seu certificado A1.",
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
    subtitulo: "Capital de giro pela CAIXA Econômica Federal. Preencha seus dados para uma análise do seu perfil.",
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
  documentoTipo: string;
  certificadoTipo: string;
  certificadoSituacao: string;
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

function formatarTelefone(v: string): string {
  const nums = v.replace(/\D/g, "").slice(0, 11);
  if (nums.length <= 2) return nums;
  if (nums.length <= 6) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
  if (nums.length <= 10)
    return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`;
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

// Produtos que são serviços (não crédito) — não mostram simulador de parcelas
const PRODUTOS_SERVICO = [
  "rating-banco-central",
  "certificado-digital",
  "certificado-digital-a1",
  "consulta-spc-serasa",
];

export default function CapturaLead() {
  // Ler query param ?produto= da URL
  const [produtoParam, setProdutoParam] = useState<string>("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProdutoParam(params.get("produto") || "");
  }, []);

  const meta = PRODUTO_META[produtoParam] ?? PRODUTO_META_DEFAULT;
  const isServico = PRODUTOS_SERVICO.includes(produtoParam);
  const isCertificado = produtoParam === "certificado-digital" || produtoParam === "certificado-digital-a1";

  const [etapa, setEtapa] = useState<"formulario" | "resultado">("formulario");
  const [form, setForm] = useState<LeadForm>({
    nome: "",
    telefone: "",
    empresa: "",
    email: "",
    valorDesejado: "",
    finalidade: "",
    tipoCliente: "empresa",
    documentoTipo: "cnpj",
    certificadoTipo: "",
    certificadoSituacao: "",
  });
  const [parcelas, setParcelas] = useState("24");
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Partial<Record<keyof LeadForm, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  // Tag de urgência a partir da situação do certificado — ajuda o comercial a priorizar
  // sem precisar perguntar de novo (quem já venceu tem prioridade sobre quem só quer orientação).
  function tagUrgenciaCertificado(): string | null {
    if (!isCertificado) return null;
    if (form.certificadoSituacao === "vencido") return "vencido";
    if (form.certificadoSituacao === "vence-em-breve") return "vence_em_breve";
    if (form.certificadoSituacao) return "novo";
    return null;
  }

  async function handleSimular(e: FormEvent) {
    e.preventDefault();
    if (!validar()) return;
    setEnviando(true);
    setSubmitError(null);
    try {
      const tipoPessoa = form.tipoCliente === "empresa" ? "pj" : "pf";
      const atribuicao = getMarketingAttribution();
      const observacoesCertificado = isCertificado
        ? [
            form.documentoTipo ? `Documento: ${form.documentoTipo.toUpperCase()}.` : null,
            form.certificadoTipo ? `Tipo de certificado: ${form.certificadoTipo.toUpperCase()}.` : null,
            form.certificadoSituacao ? `Situação: ${form.certificadoSituacao.replace(/-/g, " ")}.` : null,
          ].filter(Boolean).join(" ")
        : "";
      await submitLead({
        nome: form.nome,
        telefone: form.telefone,
        empresa: form.empresa || null,
        email: form.email || null,
        valorDesejado: form.valorDesejado ? parseFloat(form.valorDesejado) : null,
        finalidade: form.finalidade || null,
        tipo_pessoa: tipoPessoa,
        tipoPessoa,
        tipoCliente: form.tipoCliente,
        parcelas: parseInt(parcelas),
        origem: produtoParam ? `landing_${produtoParam}` : "landing_captura",
        produto_interesse: meta.label || null,
        pagina: produtoParam ? `/${produtoParam}` : "/captura",
        ...(isCertificado
          ? {
              documento_tipo: form.documentoTipo || null,
              certificado_tipo: form.certificadoTipo || null,
              certificado_situacao: form.certificadoSituacao || null,
              temperatura: tagUrgenciaCertificado(),
              observacoes_ia: observacoesCertificado || undefined,
            }
          : {}),
        ...atribuicao,
      });
      setEtapa("resultado");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar seus dados. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  const whatsappMsg = encodeURIComponent(
    `Olá! Me chamo ${form.nome}. ${meta.whatsappMsg}\n\n` +
      (form.empresa ? `Empresa: ${form.empresa}\n` : "") +
      (form.valorDesejado && !isServico ? `Valor desejado: ${fmt.format(parseFloat(form.valorDesejado))}\n` : "") +
      (form.finalidade ? `Finalidade: ${form.finalidade}\n` : "") +
      (!isServico ? `Prazo: ${parcelas} meses\n` : "") +
      (isCertificado && form.certificadoTipo ? `Tipo de certificado: ${form.certificadoTipo.toUpperCase()}\n` : "") +
      (isCertificado && form.certificadoSituacao ? `Situação: ${form.certificadoSituacao.replace(/-/g, " ")}\n` : "") +
      `\nGostaria de conversar com um especialista.` +
      (() => {
        const a = getMarketingAttribution();
        const origemTexto = [
          a.utm_source ? `origem: ${a.utm_source}` : null,
          a.utm_campaign ? `campanha: ${a.utm_campaign}` : null,
          a.pagina_entrada ? `página de entrada: ${a.pagina_entrada}` : null,
        ].filter(Boolean).join(" · ");
        return origemTexto ? `\n\n[Contexto interno — ${origemTexto}]` : "";
      })()
  );
  const whatsappUrl = COMPANY.whatsappLink
    ? `${COMPANY.whatsappLink}?text=${whatsappMsg}`
    : `https://wa.me/556135268355?text=${whatsappMsg}`;

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
                Retorno em horário comercial
              </span>
              <span className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-yellow-400" />
                Dados tratados conforme a LGPD
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
                          aria-pressed={form.tipoCliente === value}
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
                            autoComplete="name"
                            aria-invalid={Boolean(erros.nome)}
                            aria-describedby={erros.nome ? "nome-error" : undefined}
                          />
                        </div>
                        {erros.nome && <p id="nome-error" className="text-xs text-destructive">{erros.nome}</p>}
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
                            autoComplete="tel"
                            aria-invalid={Boolean(erros.telefone)}
                            aria-describedby={erros.telefone ? "telefone-error" : undefined}
                          />
                        </div>
                        {erros.telefone && <p id="telefone-error" className="text-xs text-destructive">{erros.telefone}</p>}
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
                              autoComplete="organization"
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
                            autoComplete="email"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Qualificação específica de Certificado Digital — só aparece pra esses 2 produtos */}
                    {isCertificado && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Sobre o Certificado
                          <span className="text-muted-foreground text-xs ml-1.5 font-normal normal-case">(ajuda a gente a te atender mais rápido)</span>
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label>Documento</Label>
                            <Select value={form.documentoTipo} onValueChange={(v) => set("documentoTipo", v)}>
                              <SelectTrigger>
                                <SelectValue placeholder="CPF ou CNPJ" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cnpj">CNPJ (e-CNPJ)</SelectItem>
                                <SelectItem value="cpf">CPF (e-CPF)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Tipo de certificado</Label>
                            <Select value={form.certificadoTipo} onValueChange={(v) => set("certificadoTipo", v)}>
                              <SelectTrigger>
                                <SelectValue placeholder="A1, A3 ou não sei" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="a1">A1 (arquivo digital, 1 ano)</SelectItem>
                                <SelectItem value="a3">A3 (cartão/token, 1 a 5 anos)</SelectItem>
                                <SelectItem value="nao-sei">Não sei, quero orientação</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Situação atual</Label>
                          <Select value={form.certificadoSituacao} onValueChange={(v) => set("certificadoSituacao", v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a situação" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="vencido">Já venceu — preciso urgente</SelectItem>
                              <SelectItem value="vence-em-breve">Vence nos próximos 30 dias</SelectItem>
                              <SelectItem value="primeira-via">Nunca tive, é 1ª via</SelectItem>
                              <SelectItem value="renovacao">Tenho válido, quero renovar com antecedência</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

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
                      Seus dados serão usados para atender esta solicitação, conforme nossa Política de Privacidade.
                    </p>

                    <label className="flex items-start gap-3 text-xs leading-5 text-muted-foreground">
                      <input type="checkbox" required className="mt-1 h-4 w-4" />
                      <span>
                        Li a <Link href="/politica-privacidade" className="font-semibold text-primary underline">Política de Privacidade</Link> e autorizo o contato sobre esta solicitação.
                      </span>
                    </label>

                    <FormSubmitError message={submitError} />

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full font-bold text-base h-14"
                      disabled={enviando}
                      aria-busy={enviando}
                    >
                      {enviando ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Enviando...
                        </>
                      ) : isServico ? (
                        <>
                          <ArrowRight className="mr-2 h-5 w-5" />
                          Solicitar orientação sobre {meta.label}
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
                      {isServico ? `Solicitação Recebida, ${form.nome.split(" ")[0]}!` : `Interesse Registrado, ${form.nome.split(" ")[0]}!`}
                    </h2>
                    <p className="text-white/80 text-sm">
                      {isServico
                        ? "Nossa equipe entrará em contato em breve para dar continuidade ao seu pedido."
                        : "Nossa equipe analisará as informações antes de apresentar qualquer cenário de crédito"}
                    </p>
                  </div>

                  <CardContent className="p-6 space-y-5">
                    {!isServico && form.valorDesejado ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
                        <p className="font-semibold">Dados enviados para orientação</p>
                        <p className="mt-1">
                          Valor de referência: <strong>{fmt.format(parseFloat(form.valorDesejado))}</strong> em até <strong>{parcelas} meses</strong>.
                        </p>
                        <p className="mt-2 text-blue-800">
                          Taxa, CET, prazo e parcela só podem ser informados após análise da instituição financeira. Este registro não é proposta, pré-aprovação ou garantia de crédito.
                        </p>
                      </div>
                    ) : isServico ? (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-sm text-green-800">
                        <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                        <p className="font-semibold">Pedido registrado com sucesso!</p>
                        <p className="mt-1 text-green-700">Um especialista em <strong>{meta.label}</strong> entrará em contato durante o horário comercial.</p>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        Informe o valor desejado para que a equipe possa orientar os próximos passos.
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
                      <Button asChild size="lg" className="w-full font-bold bg-green-600 hover:bg-green-700 h-14">
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-cta-position="captura-sucesso-whatsapp"
                        >
                          <MessageCircle className="mr-2 h-5 w-5" />
                          Falar com Especialista no WhatsApp
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </a>
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        Um especialista entrará em contato durante o horário comercial
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => setEtapa("formulario")}
                    >
                      {isServico ? "Fazer nova solicitação" : "Registrar outro interesse"}
                    </Button>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { href: "/credito-empresas", titulo: "Crédito Empresarial", icon: Building2 },
                    { href: "/credito-pessoal", titulo: "Crédito Pessoal", icon: User },
                    { href: "/simular", titulo: "Simulador Completo", icon: Calculator },
                  ].map((item) => (
                    <Link key={item.href} href={item.href} className="block p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-center">
                      <item.icon className="h-5 w-5 text-primary mx-auto mb-1.5" />
                      <p className="font-semibold text-xs">{item.titulo}</p>
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
                { valor: "PF e PJ", label: "Perfis analisados" },
                { valor: "Digital", label: "Solicitação online" },
                { valor: "LGPD", label: "Dados protegidos" },
                { valor: "Consultiva", label: "Orientação especializada" },
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
