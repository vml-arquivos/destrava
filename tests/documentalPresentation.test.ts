import { describe, expect, it } from "vitest";
import { construirSecoesAnaliseDocumento } from "@shared/documentalPresentation";

describe("construirSecoesAnaliseDocumento", () => {
  it("mantém a ordem única de resultado, diagnóstico e detalhes da leitura", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída; documento considerado consistente.",
      diagnostico: "A leitura foi concluída.",
      diagnostico_factual: "A última alteração transferiu a empresa para Jonnathas Rodrigues Pires.",
      alteracoes_societarias: [{
        cedente: { nome: "Sócio histórico", quotas: 100 },
        cessionario: { nome: "Jonnathas Rodrigues Pires", quotas: 100 },
        quotas_transferidas: 100,
        percentual_transferido: 100,
        clausula: "Cláusula segunda",
        pagina: 3,
        evidencia: "trecho contratual",
      }],
      quadro_societario_final: [{ nome: "Jonnathas Rodrigues Pires", quotas: 100, percentual: 100 }],
      analise_societaria_auditavel: {
        status_documento: "atual",
        ato_praticado: "Transferência integral de quotas",
        estado_atual: { descricao: "Quadro final com sócio único" },
        confronto_qsa: { status: "confirmado", mensagem: "QSA compatível" },
        linha_tempo_societaria: [{ data: "2025-06-06", tipo_ato: "Alteração consolidada" }],
      },
      evidencias: ["trecho contratual"],
      campos: [{ label: "NIRE", valor: "123" }],
      observacoes: ["Laudo persistido"],
      alertas: [{ severidade: "baixa", mensagem: "alerta histórico" }],
    }, { nome: "Alteração consolidada vigente" });

    expect(secoes.map((secao) => secao.id)).toEqual([
      "resultado",
      "diagnostico_factual",
      "alteracoes_societarias",
      "quadro_societario_final",
      "leitura_societaria",
      "evidencias",
      "campos",
      "observacoes",
    ]);
    expect(secoes.find((secao) => secao.id === "diagnostico_factual")?.texto).toContain("Jonnathas Rodrigues Pires");
    expect(secoes.find((secao) => secao.id === "leitura_societaria")?.itens).toEqual(expect.arrayContaining([
      "Status do documento: atual",
      "Confronto documentado com QSA: confirmado — QSA compatível",
    ]));
    expect(JSON.stringify(secoes)).not.toContain("alerta histórico");
  });

  it("usa o diagnóstico factual também quando o documento não tem laudo especializado", () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: "Leitura concluída.",
      diagnostico_factual: "A Junta Comercial registra o ato mais recente em 2025-06-06.",
    }, { nome: "Atos da Junta Comercial" });

    expect(secoes[0]).toMatchObject({ id: "resultado", texto: "Leitura concluída." });
    expect(secoes[1]).toMatchObject({ id: "diagnostico_factual", texto: "A Junta Comercial registra o ato mais recente em 2025-06-06." });
  });
});
