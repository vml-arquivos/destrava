import { describe, expect, it } from "vitest";
import { bucketDoRegimeTributarioHistorico, slotCompativelComRegimeTributario, transicaoDeRegimeRecente } from "@shared/documentalPresentation";

// CORREÇÃO (2026-08-31, "se ela era optante do simples ... vai precisar
// anexar os documentos do simples também. Mas, com a ressalva de que agora
// ela é de outro regime"): a tela de documentos (DocumentosEntidade.tsx) já
// escondia os slots fiscais do Simples (PGDAS, PGMEI etc.) sempre que o
// regime confirmado da empresa era do grupo ECF/DCTF (Lucro Presumido, Lucro
// Real etc.), e vice-versa -- mas essa decisão olhava só para o regime ATUAL,
// sem nenhuma memória de que a empresa pode ter mudado de regime. Isso tinha
// dois problemas reais: (1) um documento do Simples já anexado podia
// desaparecer da tela assim que o regime fosse confirmado para o outro
// grupo -- ele deixava de ser "editável"/visível mesmo continuando a ser
// evidência real de um período em que a empresa esteve sob aquele regime; e
// (2) uma empresa que comprovadamente mudou de regime (evidência nos dois
// grupos na linha do tempo) não tinha como anexar prova do período de
// transição, porque o slot do regime antigo ficava oculto.
//
// Estes testes provam, com uma função pura (extraída de dentro do useMemo
// `slotsDaTela`), os quatro cenários pedidos: empresa sempre-Simples,
// empresa sempre-ECF, empresa com regime a confirmar (mostra tudo) e empresa
// que mudou de regime (união dos dois grupos) -- além do caso de regressão
// específico (documento já anexado nunca some).
const TIPOS_FISCAIS_SIMPLIFICADOS = ["pgdas", "pgdas_d", "pgmei"];
const TIPOS_FISCAIS_ECF = ["ecf", "dctf", "darf", "livro_caixa"];

function slotPgdas(overrides: Partial<Parameters<typeof slotCompativelComRegimeTributario>[0]> = {}) {
  return slotCompativelComRegimeTributario({
    regime: "lucro_presumido",
    matchTipos: ["pgdas_d"],
    tiposFiscaisSimplificados: TIPOS_FISCAIS_SIMPLIFICADOS,
    tiposFiscaisEcf: TIPOS_FISCAIS_ECF,
    jaAnexado: false,
    bucketsHistoricos: [],
    ...overrides,
  });
}

describe("slotCompativelComRegimeTributario", () => {
  it("empresa sempre-Simples: esconde os slots do grupo ECF/DCTF (ainda não anexados)", () => {
    expect(slotCompativelComRegimeTributario({
      regime: "simples_nacional",
      matchTipos: ["dctf"],
      tiposFiscaisSimplificados: TIPOS_FISCAIS_SIMPLIFICADOS,
      tiposFiscaisEcf: TIPOS_FISCAIS_ECF,
      jaAnexado: false,
      bucketsHistoricos: [],
    })).toBe(false);
    expect(slotCompativelComRegimeTributario({
      regime: "simples_nacional",
      matchTipos: ["pgdas_d"],
      tiposFiscaisSimplificados: TIPOS_FISCAIS_SIMPLIFICADOS,
      tiposFiscaisEcf: TIPOS_FISCAIS_ECF,
      jaAnexado: false,
      bucketsHistoricos: [],
    })).toBe(true);
  });

  it("empresa sempre-ECF (Lucro Presumido/Real): esconde os slots do grupo Simples (ainda não anexados)", () => {
    expect(slotPgdas()).toBe(false);
    expect(slotCompativelComRegimeTributario({
      regime: "lucro_real",
      matchTipos: ["ecf"],
      tiposFiscaisSimplificados: TIPOS_FISCAIS_SIMPLIFICADOS,
      tiposFiscaisEcf: TIPOS_FISCAIS_ECF,
      jaAnexado: false,
      bucketsHistoricos: [],
    })).toBe(true);
  });

  it("regime ainda não identificado: mostra os dois grupos (comportamento inalterado)", () => {
    expect(slotPgdas({ regime: "nao_identificado" })).toBe(true);
    expect(slotPgdas({ regime: "" })).toBe(true);
  });

  it("regime \"não optante -- a confirmar\": grupo ECF/DCTF visível, grupo Simples ainda oculto (comportamento inalterado -- o próprio slot de confirmação de regime, ECF/DCTF/DARF/Livro Caixa, já é liberado à parte pela tela)", () => {
    expect(slotPgdas({ regime: "nao_optante_regime_a_confirmar" })).toBe(false);
    expect(slotCompativelComRegimeTributario({
      regime: "nao_optante_regime_a_confirmar",
      matchTipos: ["ecf"],
      tiposFiscaisSimplificados: TIPOS_FISCAIS_SIMPLIFICADOS,
      tiposFiscaisEcf: TIPOS_FISCAIS_ECF,
      jaAnexado: false,
      bucketsHistoricos: [],
    })).toBe(true);
  });

  it("REGRESSÃO: um documento já anexado nunca desaparece, mesmo que o regime confirmado seja do outro grupo fiscal", () => {
    // Este é exatamente o cenário de risco identificado nesta rodada: a
    // empresa tinha um PGDAS-D anexado (Simples) e o regime foi confirmado
    // depois para Lucro Presumido -- sem esta guarda, o slot do PGDAS-D
    // sumiria da tela, junto com o documento já anexado nele.
    expect(slotPgdas({ jaAnexado: true })).toBe(true);
  });

  it("empresa que mudou de regime tributário há pouco tempo (linha do tempo com evidência nos dois grupos, sem regimeVigenteDesde informado): mostra os dois grupos, mesmo para slots ainda não anexados", () => {
    // Era optante do Simples/MEI e passou a ser, por exemplo, Lucro
    // Presumido -- o pedido explícito do usuário é que, enquanto não houver
    // comprovação completa do tempo já decorrido sob o regime novo, os
    // documentos do regime anterior (Simples/MEI) continuem sendo
    // solicitados como evidência. Sem `regimeVigenteDesde` (não sabemos há
    // quanto tempo foi a transição), a incerteza nunca esconde o slot.
    expect(slotPgdas({ bucketsHistoricos: ["simples", "ecf"] })).toBe(true);
    expect(slotCompativelComRegimeTributario({
      regime: "lucro_presumido",
      matchTipos: ["dctf"],
      tiposFiscaisSimplificados: TIPOS_FISCAIS_SIMPLIFICADOS,
      tiposFiscaisEcf: TIPOS_FISCAIS_ECF,
      jaAnexado: false,
      bucketsHistoricos: ["simples", "ecf"],
    })).toBe(true);
  });

  // CORREÇÃO (2026-08-31, "só ser nesse necessário, senão não é nem pra
  // aparecer a conta de anexar esses documentos" -- empresa que era optante
  // do MEI e mudou de regime há pouco tempo): a união dos dois grupos fiscais
  // só vale enquanto a transição for recente (menos de 12 meses desde o
  // início do regime hoje vigente); depois disso, a opção de anexar o
  // documento do regime anterior deixa de aparecer para slots ainda não
  // anexados.
  it("transição recente (menos de 12 meses desde o início do regime atual): mostra os dois grupos para slot ainda não anexado", () => {
    const agora = new Date("2026-08-31T12:00:00.000Z");
    expect(slotPgdas({ bucketsHistoricos: ["simples", "ecf"], regimeVigenteDesde: "2026-01-15", agora })).toBe(true);
  });

  it("transição antiga (12 meses ou mais desde o início do regime atual): NÃO mostra mais o grupo anterior para slot ainda não anexado", () => {
    const agora = new Date("2026-08-31T12:00:00.000Z");
    // Regime vigente desde 2024-01-01: mais de 2 anos e meio -- tempo de sobra
    // para ter reunido a documentação do regime novo.
    expect(slotPgdas({ bucketsHistoricos: ["simples", "ecf"], regimeVigenteDesde: "2024-01-01", agora })).toBe(false);
  });

  it("transição antiga NÃO afeta um documento já anexado (a guarda de regressão continua valendo independente do tempo)", () => {
    const agora = new Date("2026-08-31T12:00:00.000Z");
    expect(slotPgdas({ bucketsHistoricos: ["simples", "ecf"], regimeVigenteDesde: "2024-01-01", agora, jaAnexado: true })).toBe(true);
  });

  it("regimeVigenteDesde ausente ou inválido: tratado como \"não sabemos há quanto tempo\", nunca esconde por incerteza", () => {
    const agora = new Date("2026-08-31T12:00:00.000Z");
    expect(slotPgdas({ bucketsHistoricos: ["simples", "ecf"], regimeVigenteDesde: null, agora })).toBe(true);
    expect(slotPgdas({ bucketsHistoricos: ["simples", "ecf"], regimeVigenteDesde: "data-invalida", agora })).toBe(true);
  });

  it("linha do tempo com um único grupo histórico (sem transição real) não muda o comportamento normal", () => {
    expect(slotPgdas({ bucketsHistoricos: ["ecf"] })).toBe(false);
  });

  // CORREÇÃO (Rodada 29, 02/09/2026, auditoria própria de consistência entre
  // tipos de empresa -- pedido explícito do usuário: "vão garantir que o
  // visual... vai ser totalmente iguais, só a única diferença vai ser
  // carregamento dos dados, do tipo da empresa"): `lucro_arbitrado`, `imune`
  // e `isenta` são valores próprios de `RegimeCredito` (mapaDocumentalCreditoService.ts),
  // não só a forma combinada `imune_isenta` -- e faltavam aqui, então uma
  // empresa diagnosticada com um desses três regimes tinha os slots fiscais
  // do grupo ECF/DCTF/DARF/Livro Caixa ainda não anexados escondidos da
  // tela, enquanto o mesmo documento ainda não anexado aparecia normalmente
  // para Lucro Presumido/Lucro Real -- uma inconsistência visual entre tipos
  // de empresa, não uma diferença de dado.
  it("CORREÇÃO: empresas em Lucro Arbitrado, Imune ou Isenta também veem os slots do grupo ECF/DCTF (ainda não anexados), igual a Lucro Presumido/Real", () => {
    for (const regime of ["lucro_arbitrado", "imune", "isenta", "imune_isenta"]) {
      expect(slotCompativelComRegimeTributario({
        regime,
        matchTipos: ["ecf"],
        tiposFiscaisSimplificados: TIPOS_FISCAIS_SIMPLIFICADOS,
        tiposFiscaisEcf: TIPOS_FISCAIS_ECF,
        jaAnexado: false,
        bucketsHistoricos: [],
      })).toBe(true);
      // E, simetricamente, continuam sem ver os slots do grupo Simples (ainda
      // não anexados) -- mesmo comportamento já valido para Presumido/Real.
      expect(slotPgdas({ regime })).toBe(false);
    }
  });
});

describe("transicaoDeRegimeRecente", () => {
  const agora = new Date("2026-08-31T12:00:00.000Z");

  it("false quando a linha do tempo só tem um grupo fiscal (nunca houve transição de verdade)", () => {
    expect(transicaoDeRegimeRecente(["simples"], "2026-01-01", agora)).toBe(false);
    expect(transicaoDeRegimeRecente([], null, agora)).toBe(false);
  });

  it("true quando há os dois grupos e o regime atual começou há menos de 12 meses", () => {
    expect(transicaoDeRegimeRecente(["simples", "ecf"], "2026-01-15", agora)).toBe(true);
  });

  it("false quando há os dois grupos mas o regime atual já dura 12 meses ou mais", () => {
    expect(transicaoDeRegimeRecente(["simples", "ecf"], "2024-01-01", agora)).toBe(false);
  });

  it("true quando há os dois grupos e não se sabe a data de início do regime atual (incerteza nunca esconde)", () => {
    expect(transicaoDeRegimeRecente(["simples", "ecf"], null, agora)).toBe(true);
  });

  // CORREÇÃO (Rodada 33, 05/09/2026, diagnóstico cruzado de duas pesquisas
  // independentes -- "Manus AI" e GPT -- que concluíram, cada uma por conta
  // própria, que o prazo fixo de 366 dias não tem base normativa e deveria
  // ser substituído por um critério de competência: o documento do regime
  // anterior continua sendo necessário enquanto a janela de faturamento
  // corrente (rolling 12 meses) ainda alcançar competências de antes da
  // mudança de regime -- mesmo que já tenham se passado mais de 366 dias.
  // Estes testes usam a mesma data de referência do exemplo numérico que as
  // duas pesquisas trazem (05/09/2026 -> último mês fechado 08/2026 -> janela
  // 09/2025 a 08/2026), então a janela começa em 01/09/2025.
  describe("Rodada 33 -- critério de competência substitui/complementa o prazo fixo de 366 dias", () => {
    const referencia33 = new Date("2026-09-05T12:00:00.000Z");

    it("true mesmo com mais de 366 dias de transição, quando o início do regime vigente ainda está dentro da janela rolling de 12 meses", () => {
      // Regime mudou em 02/09/2025 -- 368 dias antes da referência (mais que o
      // piso fixo de 366), mas 02/09/2025 é posterior a 01/09/2025 (início da
      // janela), então a janela de faturamento corrente ainda precisa de uma
      // competência do regime anterior (01/09/2025, antes da mudança).
      expect(transicaoDeRegimeRecente(["simples", "ecf"], "2025-09-02", referencia33)).toBe(true);
    });

    it("false quando a transição é antiga E o início do regime vigente já é anterior à janela rolling de 12 meses inteira", () => {
      // Regime mudou em 01/08/2025 -- mais de 366 dias antes da referência E
      // anterior ao início da janela (01/09/2025): a janela de 12 meses
      // corrente é inteiramente do regime novo, não sobra nenhuma competência
      // do regime anterior para justificar manter o slot visível.
      expect(transicaoDeRegimeRecente(["simples", "ecf"], "2025-08-01", referencia33)).toBe(false);
    });

    it("continua true dentro do piso fixo de 366 dias, mesmo quando a janela sozinha já não alcançaria mais o regime anterior (comportamento preexistente preservado)", () => {
      // Regime mudou há 100 dias -- dentro do piso fixo -- mesmo que,
      // hipoteticamente, a janela de faturamento não precisasse mais da
      // competência antiga, o piso de segurança pré-existente não pode
      // encolher: esta correção só amplia quando o slot fica visível, nunca
      // reduz o que já era visível antes dela.
      const inicioRegime = new Date(referencia33);
      inicioRegime.setUTCDate(inicioRegime.getUTCDate() - 100);
      const isoInicio = inicioRegime.toISOString().slice(0, 10);
      expect(transicaoDeRegimeRecente(["simples", "ecf"], isoInicio, referencia33)).toBe(true);
    });
  });
});

describe("bucketDoRegimeTributarioHistorico", () => {
  it("classifica os regimes do grupo Simples", () => {
    expect(bucketDoRegimeTributarioHistorico("Simples Nacional")).toBe("simples");
    expect(bucketDoRegimeTributarioHistorico("MEI / SIMEI")).toBe("simples");
  });

  it("classifica os regimes do grupo ECF/DCTF", () => {
    expect(bucketDoRegimeTributarioHistorico("Lucro Presumido")).toBe("ecf");
    expect(bucketDoRegimeTributarioHistorico("Lucro Real")).toBe("ecf");
    expect(bucketDoRegimeTributarioHistorico("Não optante — regime a confirmar")).toBe("ecf");
  });

  it("devolve null para regime vazio ou não identificado", () => {
    expect(bucketDoRegimeTributarioHistorico(null)).toBeNull();
    expect(bucketDoRegimeTributarioHistorico("Não identificado")).toBeNull();
  });
});
