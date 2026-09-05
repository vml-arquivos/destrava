import { describe, expect, it } from "vitest";
import {
  calcularExigibilidadeDasnSimei,
  calcularExigibilidadeDefis,
  calcularExigibilidadeEcd,
  calcularExigibilidadeEcf,
  competenciaEhAtual,
  dataLimiteRegularDasnSimei,
  dataLimiteRegularDefis,
  dataLimiteRegularEcd,
  dataLimiteRegularEcf,
  obterLinhaDoTempoRegime,
  obterRegimeVigenteEm,
  registrarPeriodoRegime,
  regraTemporalDctf,
  type PeriodoRegimeTributario,
  type Queryable,
} from "../server/services/regimeTributarioTemporalService";

// Fake em memória do banco -- implementa só o suficiente do
// empresas_regime_tributario_historico para exercitar o serviço, no mesmo
// espírito dos mocks de `pg` já usados no restante da suíte (reconhecer o SQL
// pelo padrão da query em vez de rodar um motor SQL de verdade).
function criarBancoFalso() {
  let sequencia = 0;
  const linhas: PeriodoRegimeTributario[] = [];

  const db: Queryable = {
    async query(sql: string, valores: any[] = []) {
      const normalizado = sql.replace(/\s+/g, " ").trim();

      if (normalizado.startsWith("SELECT id, empresa_id, regime, data_inicio, data_fim, fonte, confianca, documento_evidencia_id, observacao FROM public.empresas_regime_tributario_historico WHERE empresa_id = $1")) {
        const [empresaId] = valores;
        const resultado = linhas
          .filter((linha) => linha.empresa_id === empresaId)
          .sort((a, b) => (a.data_inicio || "").localeCompare(b.data_inicio || ""));
        return { rows: resultado.map((linha) => ({ ...linha })) };
      }

      if (normalizado.startsWith("UPDATE public.empresas_regime_tributario_historico SET data_fim = $2 WHERE id = $1")) {
        const [id, dataFim] = valores;
        const linha = linhas.find((item) => item.id === id);
        if (linha) linha.data_fim = dataFim;
        return { rows: [] };
      }

      if (normalizado.startsWith("UPDATE public.empresas_regime_tributario_historico SET fonte = $2, confianca = $3, documento_evidencia_id = $4, observacao = $5 WHERE id = $1")) {
        const [id, fonte, confianca, documentoEvidenciaId, observacao] = valores;
        const linha = linhas.find((item) => item.id === id);
        if (linha) {
          linha.fonte = fonte;
          linha.confianca = confianca;
          linha.documento_evidencia_id = documentoEvidenciaId;
          linha.observacao = observacao;
        }
        return { rows: linha ? [{ ...linha }] : [] };
      }

      if (normalizado.startsWith("INSERT INTO public.empresas_regime_tributario_historico")) {
        const [empresaId, regime, dataInicio, dataFim, fonte, confianca, documentoEvidenciaId, observacao] = valores;
        sequencia += 1;
        const nova: PeriodoRegimeTributario = {
          id: `periodo-${sequencia}`,
          empresa_id: empresaId,
          regime,
          data_inicio: dataInicio,
          data_fim: dataFim ?? null,
          fonte,
          confianca: confianca ?? null,
          documento_evidencia_id: documentoEvidenciaId ?? null,
          observacao: observacao ?? null,
        };
        linhas.push(nova);
        return { rows: [{ ...nova }] };
      }

      throw new Error(`SQL não reconhecido pelo banco falso do teste: ${normalizado.slice(0, 120)}`);
    },
  };

  return { db, linhas };
}

const EMPRESA_ID = "74ab11d8-f53f-46b0-b4d7-48abef7c7ff6";

describe("regimeTributarioTemporalService — funções puras", () => {
  it("ECF do ano-calendário corrente ainda não é exigível antes de 31/07 do ano seguinte", () => {
    expect(calcularExigibilidadeEcf(2026, new Date("2026-08-30T12:00:00Z"))).toBe("AINDA_NAO_EXIGIVEL");
  });

  it("ECF de ano-calendário anterior já é exigível depois de 31/07 do ano seguinte", () => {
    expect(calcularExigibilidadeEcf(2025, new Date("2026-08-30T12:00:00Z"))).toBe("EXIGIVEL");
  });

  it("ECF exatamente no prazo ainda não é exigível; só vence após 23:59 em Brasília", () => {
    expect(calcularExigibilidadeEcf(2025, new Date("2026-07-31T20:00:00Z"))).toBe("AINDA_NAO_EXIGIVEL");
    expect(calcularExigibilidadeEcf(2025, new Date("2026-08-01T02:59:59.999Z"))).toBe("AINDA_NAO_EXIGIVEL");
    expect(calcularExigibilidadeEcf(2025, new Date("2026-08-01T03:00:00Z"))).toBe("EXIGIVEL");
  });

  it("recua o prazo regular da ECF quando 31 de julho cai no fim de semana", () => {
    // 31/07/2027 cai em sábado: prazo regular encerra sexta, 30/07, em Brasília.
    expect(dataLimiteRegularEcf(2026).toISOString()).toBe("2027-07-31T02:59:59.999Z");
  });

  // CORREÇÃO (Rodada 33, 05/09/2026, diagnóstico cruzado de duas pesquisas
  // independentes -- Manus AI e GPT): as duas confirmam, com fonte, que ECD
  // tem prazo por último dia útil de junho do ano seguinte (igual mecânica da
  // ECF), e que DEFIS/DASN-SIMEI têm prazo por dia fixo do calendário (31/03 e
  // 31/05, respectivamente), sem ajuste de dia útil mencionado em nenhuma das
  // duas pesquisas. Antes desta correção, só a ECF tinha essa precisão -- as
  // outras três caíam na regra genérica "o ano inteiro é AINDA_NAO_EXIGIVEL",
  // sem olhar o mês/dia exato do prazo.
  describe("Rodada 33 -- ECD, DEFIS e DASN-SIMEI com prazo de exigibilidade preciso (mesmo padrão da ECF)", () => {
    it("ECD: último dia útil de junho do ano seguinte -- 30/06/2027 é quarta-feira, não recua", () => {
      expect(dataLimiteRegularEcd(2026).toISOString()).toBe("2027-07-01T02:59:59.999Z");
      expect(calcularExigibilidadeEcd(2026, new Date("2027-06-30T12:00:00Z"))).toBe("AINDA_NAO_EXIGIVEL");
      expect(calcularExigibilidadeEcd(2026, new Date("2027-07-01T03:00:00Z"))).toBe("EXIGIVEL");
    });

    it("DEFIS: 31 de março do ano seguinte, sem ajuste de dia útil", () => {
      expect(dataLimiteRegularDefis(2026).toISOString()).toBe("2027-04-01T02:59:59.999Z");
      expect(calcularExigibilidadeDefis(2026, new Date("2027-03-31T20:00:00Z"))).toBe("AINDA_NAO_EXIGIVEL");
      expect(calcularExigibilidadeDefis(2026, new Date("2027-04-01T03:00:00Z"))).toBe("EXIGIVEL");
    });

    it("DASN-SIMEI: 31 de maio do ano seguinte, sem ajuste de dia útil", () => {
      expect(dataLimiteRegularDasnSimei(2026).toISOString()).toBe("2027-06-01T02:59:59.999Z");
      expect(calcularExigibilidadeDasnSimei(2026, new Date("2027-05-31T20:00:00Z"))).toBe("AINDA_NAO_EXIGIVEL");
      expect(calcularExigibilidadeDasnSimei(2026, new Date("2027-06-01T03:00:00Z"))).toBe("EXIGIVEL");
    });

    it("ano-calendário anterior já exigível, ano corrente ainda não -- mesmo comportamento da ECF, para as três obrigações novas", () => {
      const referencia = new Date("2027-08-30T12:00:00Z");
      expect(calcularExigibilidadeEcd(2026, referencia)).toBe("EXIGIVEL");
      expect(calcularExigibilidadeEcd(2027, referencia)).toBe("AINDA_NAO_EXIGIVEL");
      expect(calcularExigibilidadeDefis(2026, referencia)).toBe("EXIGIVEL");
      expect(calcularExigibilidadeDefis(2027, referencia)).toBe("AINDA_NAO_EXIGIVEL");
      expect(calcularExigibilidadeDasnSimei(2026, referencia)).toBe("EXIGIVEL");
      expect(calcularExigibilidadeDasnSimei(2027, referencia)).toBe("AINDA_NAO_EXIGIVEL");
    });
  });

  it("competência até 12/2024 usa DCTF (PGD); 01/2025 em diante usa DCTFWeb/MIT", () => {
    expect(regraTemporalDctf({ ano: 2024, mes: 12 }).tipo_documento).toBe("dctf");
    expect(regraTemporalDctf({ ano: 2025, mes: 1 }).tipo_documento).toBe("dctfweb_mit");
    expect(regraTemporalDctf({ ano: 2026, mes: 6 }).tipo_documento).toBe("dctfweb_mit");
  });

  it("competência com fim no passado não é mais considerada atual", () => {
    expect(competenciaEhAtual("2025-12-31", new Date("2026-08-30T12:00:00Z"))).toBe(false);
    expect(competenciaEhAtual("2026-08-31", new Date("2026-08-30T12:00:00Z"))).toBe(true);
    expect(competenciaEhAtual(null, new Date("2026-08-30T12:00:00Z"))).toBe(true);
  });
});

describe("regimeTributarioTemporalService — linha do tempo (banco falso)", () => {
  it("primeira evidência de regime abre um período vigente", async () => {
    const { db } = criarBancoFalso();
    const resultado = await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Simples Nacional",
      dataEvidenciaInicio: "2023-11-27",
      fonte: "consulta_optantes",
      confianca: 0.9,
    });
    expect(resultado.acao).toBe("criado_vigente");
    expect(resultado.periodo).toMatchObject({ regime: "Simples Nacional", data_fim: null });

    const vigente = await obterRegimeVigenteEm(db, EMPRESA_ID, new Date("2025-06-01T12:00:00Z"));
    expect(vigente?.regime).toBe("Simples Nacional");
  });

  it("primeira evidência com fim no passado é histórica e não cria regime vigente", async () => {
    const { db } = criarBancoFalso();
    const resultado = await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Simples Nacional",
      dataEvidenciaInicio: "2024-12-01",
      dataEvidenciaFim: "2024-12-31",
      fonte: "pgdas",
      confianca: 0.95,
    });
    expect(resultado.acao).toBe("inserido_historico");
    expect(resultado.periodo).toMatchObject({ data_fim: "2024-12-31" });
    expect(await obterRegimeVigenteEm(db, EMPRESA_ID, new Date("2026-08-30T12:00:00Z"))).toMatchObject({ data_fim: "2024-12-31" });
  });

  // Cenário exato descrito na missão (seção 51/10): empresa era Simples Nacional
  // até 31/12/2025 e passou a não optante em 01/01/2026. Um PGDAS-D com
  // competência 12/2025 chega DEPOIS de o regime atual já ter sido atualizado
  // para "Não optante -- regime a confirmar" -- ele é evidência histórica e NÃO
  // pode reabrir nem substituir o período vigente.
  it("documento histórico não contamina o regime vigente atual (seção 34 da missão)", async () => {
    const { db } = criarBancoFalso();
    await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Simples Nacional",
      dataEvidenciaInicio: "2023-11-27",
      fonte: "consulta_optantes",
      confianca: 0.9,
    });
    await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Não optante — regime a confirmar",
      dataEvidenciaInicio: "2026-01-01",
      fonte: "consulta_optantes",
      confianca: 0.9,
    });

    // Chega agora (fora de ordem) o PGDAS de 12/2025 -- evidência do período em
    // que a empresa AINDA era Simples Nacional.
    const resultadoHistorico = await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Simples Nacional",
      dataEvidenciaInicio: "2025-12-01",
      dataEvidenciaFim: "2025-12-31",
      fonte: "pgdas",
      confianca: 0.95,
    });
    expect(resultadoHistorico.acao).toBe("inserido_historico");

    // O regime vigente HOJE continua "Não optante -- regime a confirmar" --
    // não foi sobrescrito pelo PGDAS histórico.
    const vigenteHoje = await obterRegimeVigenteEm(db, EMPRESA_ID, new Date("2026-08-30T12:00:00Z"));
    expect(vigenteHoje?.regime).toBe("Não optante — regime a confirmar");

    // Mas o regime EM 12/2025 (consultado pela linha do tempo) é corretamente
    // Simples Nacional -- a evidência não se perdeu, só não vazou para "agora".
    const regimeEmDezembro2025 = await obterRegimeVigenteEm(db, EMPRESA_ID, new Date("2025-12-15T12:00:00Z"));
    expect(regimeEmDezembro2025?.regime).toBe("Simples Nacional");

    const linhaDoTempo = await obterLinhaDoTempoRegime(db, EMPRESA_ID);
    expect(linhaDoTempo).toHaveLength(3);
    expect(linhaDoTempo.map((periodo) => periodo.regime)).toEqual([
      "Simples Nacional", // 2023-11-27 .. 2025-11-30 (fechado quando o "não optante" abriu)
      "Simples Nacional", // 2025-12-01 .. 2025-12-31 (segmento histórico do PGDAS)
      "Não optante — regime a confirmar", // 2026-01-01 .. (vigente)
    ]);
  });

  it("regime mudando ao longo do tempo fecha o período anterior corretamente", async () => {
    const { db } = criarBancoFalso();
    await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Simples Nacional",
      dataEvidenciaInicio: "2023-11-27",
      fonte: "consulta_optantes",
      confianca: 0.9,
    });
    const mudanca = await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Lucro Presumido",
      dataEvidenciaInicio: "2026-01-01",
      fonte: "darf",
      confianca: 0.85,
    });
    expect(mudanca.acao).toBe("criado_vigente");

    const linhaDoTempo = await obterLinhaDoTempoRegime(db, EMPRESA_ID);
    expect(linhaDoTempo[0]).toMatchObject({ regime: "Simples Nacional", data_fim: "2025-12-31" });
    expect(linhaDoTempo[1]).toMatchObject({ regime: "Lucro Presumido", data_fim: null });
  });

  it("evidência mais fraca do mesmo regime já vigente não substitui a evidência melhor", async () => {
    const { db } = criarBancoFalso();
    await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Lucro Real",
      dataEvidenciaInicio: "2026-01-01",
      fonte: "ecf",
      confianca: 0.95,
      documentoEvidenciaId: "doc-ecf-1",
    });
    const resultado = await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Lucro Real",
      dataEvidenciaInicio: "2026-03-01",
      fonte: "darf",
      confianca: 0.5,
      documentoEvidenciaId: "doc-darf-1",
    });
    expect(resultado.acao).toBe("ignorado_evidencia_fraca");
    expect(resultado.periodo?.documento_evidencia_id).toBe("doc-ecf-1");
  });

  it("evidência mais forte do mesmo regime já vigente atualiza a evidência sem duplicar período", async () => {
    const { db } = criarBancoFalso();
    await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Lucro Real",
      dataEvidenciaInicio: "2026-01-01",
      fonte: "darf",
      confianca: 0.5,
      documentoEvidenciaId: "doc-darf-1",
    });
    const resultado = await registrarPeriodoRegime(db, {
      empresaId: EMPRESA_ID,
      regime: "Lucro Real",
      dataEvidenciaInicio: "2026-03-01",
      fonte: "ecf",
      confianca: 0.95,
      documentoEvidenciaId: "doc-ecf-1",
    });
    expect(resultado.acao).toBe("atualizado_vigente");
    const linhaDoTempo = await obterLinhaDoTempoRegime(db, EMPRESA_ID);
    expect(linhaDoTempo).toHaveLength(1);
    expect(linhaDoTempo[0]).toMatchObject({ regime: "Lucro Real", fonte: "ecf", documento_evidencia_id: "doc-ecf-1" });
  });

  it("empresa sem nenhum período registrado retorna null (não inventa regime)", async () => {
    const { db } = criarBancoFalso();
    expect(await obterRegimeVigenteEm(db, EMPRESA_ID)).toBeNull();
    expect(await obterLinhaDoTempoRegime(db, EMPRESA_ID)).toEqual([]);
  });
});
