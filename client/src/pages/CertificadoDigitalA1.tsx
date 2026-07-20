import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/config/company";
import { getMarketingAttribution } from "@/lib/analytics";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  CloudDownload,
  FileCheck2,
  FileKey2,
  FileText,
  Headphones,
  Laptop,
  LockKeyhole,
  MessageCircle,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UserCheck,
  Video,
  X,
  Zap,
} from "lucide-react";

const CAPTURE_URL = "/captura?produto=certificado-digital-a1";

const faqs = [
  {
    question: "O Certificado Digital A1 pode ficar pronto em até 1 hora?",
    answer:
      "Em condições elegíveis, a emissão pode ser concluída em até 1 hora após a validação. O prazo depende da documentação correta, da confirmação de identidade, do agendamento e da disponibilidade da Autoridade Certificadora.",
  },
  {
    question: "A emissão é totalmente online?",
    answer:
      "Quando o titular atende aos critérios de validação remota, o processo pode ser realizado por videoconferência. Em algumas situações, a Autoridade Certificadora pode solicitar validação presencial ou documentos adicionais.",
  },
  {
    question: "Qual é a validade do Certificado A1?",
    answer:
      "O Certificado Digital A1 tem validade de 1 ano. Antes do vencimento, é necessário realizar a renovação para continuar utilizando os serviços que exigem certificação digital.",
  },
  {
    question: "O A1 precisa de token ou cartão?",
    answer:
      "Não. O A1 é um arquivo digital instalado no computador ou dispositivo compatível. Por isso, não exige token USB ou cartão físico e permite cópia de segurança sob responsabilidade do titular.",
  },
  {
    question: "Posso usar o A1 para emitir nota fiscal e acessar o e-CAC?",
    answer:
      "O A1 é amplamente utilizado para emissão de NF-e, acesso ao e-CAC, eSocial, SPED e assinatura de documentos. A aceitação final depende das regras do sistema ou órgão em que o certificado será utilizado.",
  },
  {
    question: "Quais documentos são necessários?",
    answer:
      "Os documentos variam conforme o titular seja pessoa física ou jurídica e conforme a Autoridade Certificadora. Após a solicitação, um especialista orienta a lista aplicável ao seu caso antes da validação.",
  },
  {
    question: "A Destrava acompanha a instalação?",
    answer:
      "Sim. A equipe orienta as etapas de solicitação, validação, emissão e instalação, além de esclarecer dúvidas de uso e renovação dentro do escopo do atendimento contratado.",
  },
] as const;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      name: "Emissão de Certificado Digital A1",
      serviceType: "Orientação para emissão de certificado digital ICP-Brasil",
      description:
        "Orientação especializada para emissão online de Certificado Digital A1 para empresas e pessoas físicas, sujeita à validação documental e às regras da Autoridade Certificadora.",
      provider: {
        "@type": "ProfessionalService",
        name: COMPANY.nome,
        telephone: "+55-61-3526-8355",
      },
      areaServed: {
        "@type": "Country",
        name: "Brasil",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ],
};

const painPoints = [
  "A NF-e ficou bloqueada e a empresa não consegue faturar.",
  "O acesso ao e-CAC ou a sistemas governamentais foi negado.",
  "O certificado venceu e uma obrigação precisa ser transmitida hoje.",
  "Multas e perda de prazos ameaçam o caixa e a regularidade do negócio.",
  "A burocracia está consumindo o tempo que deveria ir para a operação.",
  "Um documento precisa de assinatura digital com urgência.",
];

const a1Benefits = [
  {
    icon: CloudDownload,
    title: "Arquivo digital",
    description: "Instalado no computador ou dispositivo compatível, sem mídia física.",
  },
  {
    icon: TimerReset,
    title: "Agilidade",
    description: "Fluxo simplificado para quem precisa resolver uma pendência rapidamente.",
  },
  {
    icon: RefreshCcw,
    title: "Validade de 1 ano",
    description: "Período oficial do certificado A1, com renovação ao final da vigência.",
  },
  {
    icon: FileKey2,
    title: "Sem token",
    description: "Dispensa cartão ou token USB e permite backup seguro do arquivo.",
  },
  {
    icon: ReceiptText,
    title: "Uso empresarial",
    description: "Ideal para NF-e, e-CAC, eSocial, SPED e rotinas contábeis recorrentes.",
  },
  {
    icon: ShieldCheck,
    title: "Padrão ICP-Brasil",
    description: "Emissão realizada por Autoridade Certificadora integrante da ICP-Brasil.",
  },
];

const steps = [
  {
    number: "01",
    icon: FileText,
    title: "Solicitação",
    description: "Informe seus dados para iniciarmos a orientação do seu Certificado A1.",
  },
  {
    number: "02",
    icon: FileCheck2,
    title: "Documentos",
    description: "Receba a lista correta e envie a documentação necessária para validação.",
  },
  {
    number: "03",
    icon: Video,
    title: "Videoconferência",
    description: "Faça a validação remota quando elegível, em horário confirmado no processo.",
  },
  {
    number: "04",
    icon: CloudDownload,
    title: "Emissão e instalação",
    description: "Baixe o arquivo A1 e conte com orientação para a instalação inicial.",
  },
];

function montarMensagemComContexto(mensagemBase: string): string {
  if (typeof window === "undefined") return mensagemBase;
  const a = getMarketingAttribution();
  const origemTexto = [
    a.utm_source ? `origem: ${a.utm_source}` : null,
    a.utm_campaign ? `campanha: ${a.utm_campaign}` : null,
  ].filter(Boolean).join(" · ");
  return origemTexto ? `${mensagemBase}\n\n[Contexto interno — ${origemTexto}]` : mensagemBase;
}

export default function CertificadoDigitalA1() {
  const whatsappUrl = COMPANY.whatsappLinkMsg(
    montarMensagemComContexto("Olá! Preciso emitir um Certificado Digital A1 e gostaria de falar com um especialista.")
  );

  return (
    <div className="min-h-screen bg-white pb-20 text-slate-950 md:pb-0">
      <SEO
        title="Certificado Digital A1 em até 1 Hora"
        description="Emita seu Certificado Digital A1 online, com orientação especializada e suporte na instalação. Prazo sujeito à validação e disponibilidade."
        keywords="certificado digital A1, certificado A1 urgente, emitir certificado digital online, e-CNPJ A1, e-CPF A1, certificado ICP-Brasil"
        image="https://destravacredito.com/og-image.png"
        structuredData={structuredData}
      />
      <Header ctaLabel="Solicitar Certificado A1" ctaHref={CAPTURE_URL} />

      <main>
        <section className="relative overflow-hidden bg-[#07152f] text-white" aria-labelledby="a1-hero-title">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute -left-20 top-0 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />
            <div className="absolute -right-16 bottom-0 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:48px_48px]" />
          </div>

          <div className="container relative px-4 py-16 sm:py-20 lg:py-24">
            <div className="grid items-center gap-12 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
              <div className="max-w-3xl">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-200">
                  <Zap className="h-4 w-4" aria-hidden="true" />
                  Atendimento rápido para prazos curtos
                </div>

                <h1 id="a1-hero-title" className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                  Certificado Digital A1 online com emissão que <span className="text-amber-300">pode ocorrer em até 1 hora</span>
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200 sm:text-xl">
                  Agilidade, segurança e a credibilidade da Destrava Crédito. Solicite seu e-CNPJ ou e-CPF A1 com orientação especializada do pedido à instalação.
                </p>

                <ul className="mt-7 grid gap-3 text-sm text-slate-100 sm:grid-cols-3" aria-label="Principais condições do serviço">
                  {["Processo remoto quando elegível", "Validação segura de identidade", "Suporte na instalação"].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button asChild size="lg" className="h-13 rounded-xl bg-amber-300 px-7 text-base font-black text-slate-950 shadow-lg shadow-amber-400/15 hover:bg-amber-200">
                    <Link href={CAPTURE_URL} data-cta-position="a1-hero">
                      Solicitar Certificado A1
                      <ArrowRight className="h-5 w-5" aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-13 rounded-xl border-white/30 bg-transparent px-7 text-base font-bold text-white hover:bg-white/10 hover:text-white">
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" data-cta-position="a1-hero">
                      <MessageCircle className="h-5 w-5" aria-hidden="true" />
                      Falar com Especialista no WhatsApp
                    </a>
                  </Button>
                </div>

                <p className="mt-5 max-w-2xl text-xs leading-5 text-slate-400">
                  *Prazo estimado após a validação. A emissão em até 1 hora depende da documentação correta, elegibilidade para atendimento remoto, agendamento e disponibilidade da Autoridade Certificadora.
                </p>
              </div>

              <div className="mx-auto w-full max-w-lg lg:mx-0 lg:justify-self-end">
                <div className="relative rounded-[2rem] border border-white/10 bg-[#0c1d3b] p-6 shadow-2xl shadow-black/30 sm:p-8">
                  <div className="absolute right-6 top-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                    <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </span>
                    Atendimento
                  </div>

                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300 text-slate-950">
                    <Clock3 className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <p className="mt-7 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Meta de emissão após validação</p>
                  <div className="mt-2 flex items-baseline gap-2" aria-label="Até uma hora">
                    <span className="font-mono text-5xl font-black tracking-tight text-amber-300 sm:text-6xl">Até 1h</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">Meta de prazo, não é uma contagem regressiva.</p>

                  <div className="my-7 h-px bg-white/10" />

                  <ul className="space-y-4">
                    {[
                      "Certificado A1 com validade de 1 ano",
                      "Sem token ou cartão físico",
                      "Orientação até a instalação inicial",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-3 text-sm font-medium text-slate-100">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Valor</p>
                    <p className="text-sm font-semibold text-slate-100">Sob consulta — você recebe o valor exato em minutos, sem compromisso.</p>
                  </div>

                  <Button asChild size="lg" className="mt-4 h-12 w-full rounded-xl bg-amber-300 font-black text-slate-950 hover:bg-amber-200">
                    <Link href={CAPTURE_URL}>
                      Solicitar Certificado A1
                      <ArrowRight className="h-5 w-5" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-100 bg-white py-10" aria-labelledby="a1-seguranca-title">
          <div className="container px-4">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 sm:flex-row sm:items-center">
              <svg
                className="h-24 w-24 shrink-0 sm:h-28 sm:w-28"
                viewBox="0 0 120 120"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                aria-label="Ilustração de escudo representando segurança do processo de emissão"
              >
                <path d="M60 8 L104 24 V56 C104 84 86 102 60 112 C34 102 16 84 16 56 V24 Z" fill="#0c1d3b" />
                <path d="M60 16 L96 29.5 V56 C96 79.5 81 94.5 60 103.5 C39 94.5 24 79.5 24 56 V29.5 Z" fill="#12275a" />
                <path d="M42 59 L54 71 L80 45" stroke="#fbbf24" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <div className="text-center sm:text-left">
                <h2 id="a1-seguranca-title" className="text-xl font-black text-slate-900 sm:text-2xl">
                  Seu certificado, do jeito certo — com segurança de ponta a ponta
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                  Cada pedido passa por validação de identidade dentro das regras da ICP-Brasil, com dados tratados conforme a LGPD. Você acompanha cada etapa com um especialista de verdade, não um robô.
                </p>
                <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-bold uppercase tracking-wide text-slate-400 sm:justify-start">
                  <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> ICP-Brasil</li>
                  <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Conforme LGPD</li>
                  <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Suporte humano</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-red-100 bg-red-50 py-12 sm:py-14" aria-labelledby="a1-pain-title">
          <div className="container px-4">
            <div className="mx-auto max-w-6xl rounded-3xl border border-red-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
              <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-center">
                <div>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h2 id="a1-pain-title" className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                    Sua Operação Não Pode Parar. Seu Certificado Digital Venceu ou Está Bloqueado?
                  </h2>
                  <p className="mt-4 leading-7 text-slate-600">
                    Quando o prazo aperta, cada etapa precisa ser clara. A orientação correta reduz retrabalho e ajuda você a chegar à validação com a documentação adequada.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {painPoints.map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/70 p-4">
                      <X className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                      <p className="text-sm font-semibold leading-6 text-slate-800">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-50 py-16 sm:py-20" aria-labelledby="a1-solution-title">
          <div className="container px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <Laptop className="h-7 w-7" aria-hidden="true" />
              </div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">A solução prática</p>
              <h2 id="a1-solution-title" className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Certificado Digital A1: A Solução Rápida e 100% Digital da Destrava Crédito.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                O A1 é um arquivo digital com validade de 1 ano. Ele simplifica rotinas fiscais e contábeis porque pode ser instalado em equipamento compatível e não depende de mídia física para cada uso.
              </p>
            </div>

            <div className="mx-auto mt-10 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {a1Benefits.map((benefit) => (
                <article key={benefit.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-transform duration-200 hover:-translate-y-1">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                    <benefit.icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-lg font-black text-slate-950">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.description}</p>
                </article>
              ))}
            </div>

            <div className="mt-9 text-center">
              <Button asChild size="lg" className="h-12 rounded-xl bg-blue-700 px-7 font-black text-white hover:bg-blue-800">
                <Link href={CAPTURE_URL}>
                  Quero meu A1 em 1H
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20" aria-labelledby="a1-comparison-title">
          <div className="container px-4">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">Escolha com clareza</p>
              <h2 id="a1-comparison-title" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">A1 ou A3? Nós Destravamos a Escolha para Você.</h2>
              <p className="mt-4 leading-7 text-slate-600">Para emissão rápida e uso recorrente no computador, o A1 costuma ser a alternativa mais prática.</p>
            </div>

            <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-3xl border border-slate-200 shadow-lg shadow-slate-200/50">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left">
                  <caption className="sr-only">Comparação entre os certificados digitais A1 e A3</caption>
                  <thead>
                    <tr className="bg-slate-950 text-white">
                      <th scope="col" className="px-6 py-5 text-sm font-bold">Critério</th>
                      <th scope="col" className="bg-blue-700 px-6 py-5 text-sm font-black">Certificado A1</th>
                      <th scope="col" className="px-6 py-5 text-sm font-bold">Certificado A3</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[
                      ["Armazenamento", "Arquivo digital", "Token, cartão ou nuvem, conforme modalidade"],
                      ["Validade", "1 ano", "De 1 a 5 anos, conforme o produto"],
                      ["Mídia física", "Não exige", "Pode exigir token ou cartão"],
                      ["Mobilidade", "Cópia e backup sob controle do titular", "Depende da mídia ou acesso em nuvem"],
                      ["Uso recorrente", "Prático para automações e rotinas fiscais", "Exige acesso à mídia ou autorização"],
                      ["Perfil indicado", "Empresas e profissionais com uso frequente", "Quem prioriza chave em mídia ou nuvem"],
                    ].map(([criterion, a1, a3]) => (
                      <tr key={criterion} className="bg-white">
                        <th scope="row" className="px-6 py-5 text-sm font-bold text-slate-950">{criterion}</th>
                        <td className="bg-blue-50 px-6 py-5 text-sm font-semibold text-blue-950">
                          <span className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{a1}</span>
                        </td>
                        <td className="px-6 py-5 text-sm text-slate-600">{a3}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Button asChild variant="outline" size="lg" className="h-12 rounded-xl border-blue-200 px-7 font-bold text-blue-800 hover:bg-blue-50 hover:text-blue-900">
                <Link href={CAPTURE_URL}>
                  Entenda a Diferença e Escolha o Seu
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-[#07152f] py-16 text-white sm:py-20" aria-labelledby="a1-process-title">
          <div className="container px-4">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-300">Passo a passo</p>
              <h2 id="a1-process-title" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Nosso Processo: Simples, Rápido e Seguro.</h2>
              <p className="mt-4 leading-7 text-slate-300">Quando elegível para validação remota, você conclui as etapas sem deslocamento e com orientação em cada fase.</p>
            </div>

            <ol className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <li key={step.number} className="relative rounded-3xl border border-white/10 bg-white/[0.06] p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300 text-slate-950">
                      <step.icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-2xl font-black text-white/50">{step.number}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-black">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-slate-50 py-16 sm:py-20" aria-labelledby="a1-authority-title">
          <div className="container px-4">
            <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_.9fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2 text-sm font-black text-blue-800">
                  <BadgeCheck className="h-5 w-5" aria-hidden="true" />
                  Orientação especializada
                </div>
                <h2 id="a1-authority-title" className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Segurança técnica sem deixar você sozinho no processo.</h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">
                  A Destrava orienta sua solicitação e acompanha as etapas de validação e instalação. O certificado é emitido por Autoridade Certificadora integrante da ICP-Brasil, após a confirmação da identidade do titular.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {[
                    { icon: UserCheck, title: "Atendimento humano", text: "Especialista para orientar documentos e próximos passos." },
                    { icon: LockKeyhole, title: "Validação segura", text: "Identidade confirmada conforme as normas da certificação digital." },
                    { icon: Headphones, title: "Suporte na instalação", text: "Acompanhamento para iniciar o uso do arquivo A1." },
                    { icon: Building2, title: "Pessoa física ou empresa", text: "Orientação para e-CPF e e-CNPJ conforme a necessidade." },
                  ].map((item) => (
                    <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <item.icon className="h-6 w-6 text-blue-700" aria-hidden="true" />
                      <h3 className="mt-3 font-black text-slate-950">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="rounded-[2rem] bg-white p-7 shadow-xl shadow-slate-200/70 ring-1 ring-slate-200 sm:p-9" aria-label="Compromissos de atendimento">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Compromisso Destrava</p>
                    <h3 className="text-xl font-black text-slate-950">Clareza antes da emissão</h3>
                  </div>
                </div>
                <ul className="mt-7 space-y-4">
                  {[
                    "Conferência orientada da documentação aplicável",
                    "Explicação transparente sobre prazo e elegibilidade",
                    "Sem promessas de aprovação antes da validação",
                    "Canal de atendimento para dúvidas do processo",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm font-semibold leading-6 text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" size="lg" className="mt-8 h-12 w-full rounded-xl border-blue-200 text-blue-800 hover:bg-blue-50 hover:text-blue-900">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                    Tirar uma dúvida no WhatsApp
                  </a>
                </Button>
              </aside>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20" aria-labelledby="a1-faq-title">
          <div className="container px-4">
            <div className="mx-auto max-w-3xl">
              <div className="text-center">
                <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">Perguntas frequentes</p>
                <h2 id="a1-faq-title" className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Perguntas Frequentes sobre Certificado Digital A1.</h2>
              </div>

              <div className="mt-10 space-y-3">
                {faqs.map((faq) => (
                  <details key={faq.question} className="group rounded-2xl border border-slate-200 bg-white open:border-blue-200 open:shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:px-6">
                      <span>{faq.question}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                    </summary>
                    <p className="px-5 pb-5 text-sm leading-7 text-slate-600 sm:px-6 sm:pb-6">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-[#07152f] py-16 text-white sm:py-20" aria-labelledby="a1-final-cta-title">
          <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-amber-300/15 blur-3xl" aria-hidden="true" />
          <div className="container relative px-4">
            <div className="mx-auto max-w-4xl text-center">
              <Sparkles className="mx-auto h-9 w-9 text-amber-300" aria-hidden="true" />
              <h2 id="a1-final-cta-title" className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Resolva sua emissão A1 com orientação do pedido à instalação</h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-blue-100">
                Solicite agora a orientação para seu Certificado Digital A1 e avance para a validação com os documentos certos.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-13 rounded-xl bg-amber-300 px-8 text-base font-black text-slate-950 hover:bg-amber-200">
                  <Link href={CAPTURE_URL} data-cta-position="a1-final">
                    Solicitar Certificado A1
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-13 rounded-xl border-white/30 bg-transparent px-8 text-base font-bold text-white hover:bg-white/10 hover:text-white">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" data-cta-position="a1-final">
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                    Falar com Especialista no WhatsApp
                  </a>
                </Button>
              </div>
              <p className="mt-5 text-xs leading-5 text-blue-200">
                Emissão sujeita à validação documental, às regras da Autoridade Certificadora e à disponibilidade de atendimento.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,23,42,.12)] backdrop-blur md:hidden" aria-label="Ações rápidas">
        <div className="mx-auto grid max-w-lg grid-cols-[1fr_auto] gap-2">
          <Button asChild className="h-12 bg-amber-300 font-black text-slate-950 hover:bg-amber-200">
            <Link href={CAPTURE_URL} data-cta-position="a1-sticky-mobile">Solicitar A1</Link>
          </Button>
          <Button asChild variant="outline" size="icon-lg" className="h-12 w-12 border-emerald-300 text-emerald-700">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" data-cta-position="a1-sticky-mobile" aria-label="Falar no WhatsApp">
              <MessageCircle className="h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>

      {/* Botão flutuante de WhatsApp — só desktop, a barra fixa acima já cobre o mobile */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-cta-position="a1-floating-whatsapp"
        aria-label={`Falar no WhatsApp com a ${COMPANY.nome} — ${COMPANY.whatsapp}`}
        className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-900/30 transition hover:scale-105 hover:bg-emerald-600 md:flex"
      >
        <MessageCircle className="h-7 w-7" aria-hidden="true" />
        <span className="absolute right-full mr-3 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 pointer-events-none">
          Falar no WhatsApp
        </span>
      </a>
    </div>
  );
}
