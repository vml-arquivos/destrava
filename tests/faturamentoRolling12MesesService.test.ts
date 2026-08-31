import { describe, expect, it } from "vitest";
import {
  janela12Meses,
  obterFaturamentoCompetencias,
  obterFaturamentoRolling12Meses,
  registrarFaturamentoCompetencia,
  ultimoMesFechado,
  type Queryable,
  type RegistroFaturamentoCompetencia,
} from "../server/services/faturamentoRolling12MesesService";

// Fake em memória do banco -- mesmo espírito do banco falso usado em
// tests/regimeTributarioTemporalService.test.ts: reconhece o SQL pelo padrão
// da query em vez de rodar um motor SQL de verdade.
function criarBancoFalso() {
  let sequencia = 0;
  const linhas: RegistroFaturamentoCompetencia[] = [];

  const db: Queryable = {
    async query(sql: string, valores: any[] = []) {
      const normalizado = sql.replace(/\s+/g, " ").trim();

      if (normalizado.includes("FROM public.empresas_faturamento_mensal WHERE empresa_id = $1 AND ano = $2 AND mes = $3")) {
        const [empresaId, ano, mes] = valores;
        const linha = linhas.find((item) => item.empresa_id === empresaId && item.ano === ano && item.mes === mes);
        return { rows: linha ? [{ ...linha }] : [] };
      }

      if (normalizado.startsWith("SELECT id, empresa_id, ano, mes, valor, fonte, documento_id, regime_no_periodo, confianca, observacao FROM public.empresas_faturamento_mensal WHERE empresa_id = $1")) {
        const [empresaId] = valores;
        const resultado = linhas
          .filter((linha) => linha.empresa_id === empresaId)
          .sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
        return { rows: resultado.map((linha) => ({ ...linha })) };
      }

      if (normalizado.startsWith("UPDATE public.empresas_faturamento_mensal")) {
        const [id, valor, fonte, documentoId, regimeNoPeriodo, confianca, observacao] = valores;
        const linha = linhas.find((item) => item.id === id);
        if (linha) {
          linha.valor = valor;
          linha.fonte = fonte;
          linha.documento_id = documentoId;
          linha.regime_no_periodo = regimeNoPeriodo;
          linha.confianca = confianca;
          linha.observacao = observacao;
        }
        return { rows: linha ? [{ ...linha }] : [] };
      }

      if (normalizado.startsWith("INSERT INTO public.empresas_faturamento_mensal")) {
        const [empresaId, ano, mes, valor, fonte, documentoId, regimeNoPeriodo, confianca, observacao] = valores;
        sequencia += 1;
        const nova: RegistroFaturamentoCompetencia = {
          id: `faturamento-${sequencia}`,
          empresa_id: empresaId,
          ano,
          mes,
          valor,
          fonte,
          documento_id: documentoId ?? null,
          regime_no_periodo: regimeNoPeriodo ?? null,
          confianca: confianca ?? null,
          observacao: observacao ?? null,
        };
        linhas.push(nova);
        return { rows: [{ ...nova }] };
      }

      throw new Error(`SQL não reconhecido pelo banco falso do teste: ${normalizado.slice(0, 160)}`);
    },
  };

  return { db, linhas };
}

const EMPRESA_ID = "74ab11d8-f53f-46b0-b4d7-48abef7c7ff6";

describe("faturamentoRolling12MesesService — funções puras", () => {
  it("último mês fechado é sempre o mês anterior ao mês corrente (mês corrente ainda em curso)", () => {
    expect(ultimoMesFechado(new Date("2026-08-30T12:00:00Z"))).toEqual({ ano: 2026, mes: 7 });
    expect(ultimoMesFechado(new Date("2026-01-15T12:00:00Z"))).toEqual({ ano: 2025, mes: 12 });
  });

  it("janela de 12 meses termina na competência de referência (inclusive) e começa 11 meses antes", () => {
    const janela = janela12Meses({ ano: 2026, mes: 7 });
    expect(janela).toHaveLength(12);
    expect(janela[0]).toEqual({ ano: 2025, mes: 8 });
    expect(janela[11]).toEqual({ ano: 2026, mes: 7 });
  });

  it("janela atravessando a virada do ano continua sequencial", () => {
    const janela = janela12Meses({ ano: 2026, mes: 1 });
    expect(janela[0]).toEqual({ ano: 2025, mes: 2 });
    expect(janela[10]).toEqual({ ano: 2025, mes: 12 });
    expect(janela[11]).toEqual({ ano: 2026, mes: 1 });
  });
});

describe("faturamentoRolling12MesesService — registro e soma (banco falso)", () => {
  it("registra a primeira competência", async () => {
    const { db } = criarBancoFalso();
    const resultado = await registrarFaturamentoCompetencia(db, {
      empresaId: EMPRESA_ID, ano: 2026, mes: 1, valor: 85000, fonte: "pgdas", confianca: 0.9,
    });
    expect(resultado.acao).toBe("inserido");
    expect(resultado.registro).toMatchObject({ ano: 2026, mes: 1, valor: 85000 });
  });

  it("evidência mais fraca para a mesma competência não substitui a evidência melhor", async () => {
    const { db } = criarBancoFalso();
    await registrarFaturamentoCompetencia(db, {
      empresaId: EMPRESA_ID, ano: 2026, mes: 1, valor: 85000, fonte: "ecf", confianca: 0.95,
    });
    const resultado = await registrarFaturamentoCompetencia(db, {
      empresaId: EMPRESA_ID, ano: 2026, mes: 1, valor: 10, fonte: "ocr_ruido", confianca: 0.2,
    });
    expect(resultado.acao).toBe("ignorado_evidencia_fraca");
    const competencias = await obterFaturamentoCompetencias(db, EMPRESA_ID);
    expect(competencias).toHaveLength(1);
    expect(competencias[0].valor).toBe(85000);
  });

  it("evidência mais forte para a mesma competência atualiza o valor sem duplicar linha", async () => {
    const { db } = criarBancoFalso();
    await registrarFaturamentoCompetencia(db, {
      empresaId: EMPRESA_ID, ano: 2026, mes: 1, valor: 80000, fonte: "extrato_bancario", confianca: 0.5,
    });
    const resultado = await registrarFaturamentoCompetencia(db, {
      empresaId: EMPRESA_ID, ano: 2026, mes: 1, valor: 85000, fonte: "pgdas", confianca: 0.9,
    });
    expect(resultado.acao).toBe("atualizado");
    const competencias = await obterFaturamentoCompetencias(db, EMPRESA_ID);
    expect(competencias).toHaveLength(1);
    expect(competencias[0]).toMatchObject({ valor: 85000, fonte: "pgdas" });
  });

  // Seção central da missão: uma janela de 12 meses pode consolidar
  // competências de regimes tributários diferentes (mudança de regime no
  // meio do caminho) sem exigir um único tipo de documento cobrindo os 12
  // meses inteiros -- cada competência carrega o próprio regime, e a soma
  // não depende de uniformidade.
  it("consolida a janela de 12 meses somando competências de regimes diferentes, sem exigir documento uniforme", async () => {
    const { db } = criarBancoFalso();
    // 3 meses em Lucro Presumido (via PGDAS-like fonte), depois 9 em Lucro Real.
    const mesesPresumido: Array<[number, number]> = [[2025, 8], [2025, 9], [2025, 10]];
    const mesesReal: Array<[number, number]> = [
      [2025, 11], [2025, 12], [2026, 1], [2026, 2], [2026, 3],
      [2026, 4], [2026, 5], [2026, 6], [2026, 7],
    ];
    for (const [ano, mes] of mesesPresumido) {
      await registrarFaturamentoCompetencia(db, {
        empresaId: EMPRESA_ID, ano, mes, valor: 50000, fonte: "declaracao_faturamento",
        regimeNoPeriodo: "Lucro Presumido", confianca: 0.8,
      });
    }
    for (const [ano, mes] of mesesReal) {
      await registrarFaturamentoCompetencia(db, {
        empresaId: EMPRESA_ID, ano, mes, valor: 70000, fonte: "extrato_bancario",
        regimeNoPeriodo: "Lucro Real", confianca: 0.8,
      });
    }

    const rolling = await obterFaturamentoRolling12Meses(db, EMPRESA_ID, { ano: 2026, mes: 7 });
    expect(rolling.completo).toBe(true);
    expect(rolling.meses_com_dado).toBe(12);
    expect(rolling.meses_faltantes).toEqual([]);
    expect(rolling.total).toBe(3 * 50000 + 9 * 70000);
    expect(rolling.regimes_no_periodo.sort()).toEqual(["Lucro Presumido", "Lucro Real"]);
  });

  it("aponta os meses faltantes quando a janela está incompleta, sem travar o cálculo", async () => {
    const { db } = criarBancoFalso();
    await registrarFaturamentoCompetencia(db, { empresaId: EMPRESA_ID, ano: 2026, mes: 6, valor: 60000, fonte: "pgdas" });
    await registrarFaturamentoCompetencia(db, { empresaId: EMPRESA_ID, ano: 2026, mes: 7, valor: 62000, fonte: "pgdas" });

    const rolling = await obterFaturamentoRolling12Meses(db, EMPRESA_ID, { ano: 2026, mes: 7 });
    expect(rolling.completo).toBe(false);
    expect(rolling.meses_com_dado).toBe(2);
    expect(rolling.meses_faltantes).toHaveLength(10);
    expect(rolling.total).toBe(60000 + 62000);
  });

  // A janela avança para o mês seguinte sem invalidar nada do que já foi
  // registrado -- é só uma consulta diferente sobre o mesmo histórico.
  it("a janela avança para a competência seguinte sem invalidar o histórico acumulado", async () => {
    const { db } = criarBancoFalso();
    for (let mes = 1; mes <= 8; mes += 1) {
      await registrarFaturamentoCompetencia(db, { empresaId: EMPRESA_ID, ano: 2026, mes, valor: 1000 * mes, fonte: "pgdas" });
    }
    const janelaJulho = await obterFaturamentoRolling12Meses(db, EMPRESA_ID, { ano: 2026, mes: 7 });
    const janelaAgosto = await obterFaturamentoRolling12Meses(db, EMPRESA_ID, { ano: 2026, mes: 8 });
    expect(janelaJulho.meses_com_dado).toBe(7); // jan..jul, os 5 meses de 2025 ainda faltam
    expect(janelaAgosto.meses_com_dado).toBe(8); // jan..ago
    // Nada do que estava em julho foi apagado -- agosto simplesmente soma mais um mês.
    expect(janelaAgosto.total).toBe(janelaJulho.total + 8000);
    const todasAsCompetencias = await obterFaturamentoCompetencias(db, EMPRESA_ID);
    expect(todasAsCompetencias).toHaveLength(8);
  });

  it("empresa sem nenhuma competência registrada não trava -- devolve janela inteira como faltante", async () => {
    const { db } = criarBancoFalso();
    const rolling = await obterFaturamentoRolling12Meses(db, EMPRESA_ID, { ano: 2026, mes: 7 });
    expect(rolling.total).toBe(0);
    expect(rolling.completo).toBe(false);
    expect(rolling.meses_faltantes).toHaveLength(12);
  });
});
