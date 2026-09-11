import { describe, expect, it } from "vitest";
import {
  detectarRequisitosCobertosPeloTexto,
  detectarStatusCertidaoDebitos,
  obterCoberturaPorEmpresa,
  registrarCoberturaEvidencia,
  statusResolveRequisito,
  type Queryable,
  type RegistroCoberturaEvidencia,
} from "../server/services/coberturaEvidenciaBureauService";

function criarBancoFalso() {
  let sequencia = 0;
  const linhas: RegistroCoberturaEvidencia[] = [];
  const documentos: Array<{ id: string; empresa_id: string; status: string }> = [];

  const db: Queryable = {
    async query(sql: string, valores: any[] = []) {
      const normalizado = sql.replace(/\s+/g, " ").trim();

      if (normalizado.includes("FROM public.document_evidence_coverage WHERE documento_id = $1 AND requirement_code = $2")) {
        const [documentoId, requirementCode] = valores;
        const linha = linhas.find((item) => item.documento_id === documentoId && item.requirement_code === requirementCode);
        return { rows: linha ? [{ ...linha }] : [] };
      }

      if (normalizado.startsWith("UPDATE public.document_evidence_coverage")) {
        const [id, coverageStatus, confidence, sourceSection, extractedValue] = valores;
        const linha = linhas.find((item) => item.id === id);
        if (linha) {
          linha.coverage_status = coverageStatus;
          linha.confidence = confidence;
          linha.source_section = sourceSection;
          linha.extracted_value = extractedValue;
        }
        return { rows: linha ? [{ ...linha }] : [] };
      }

      if (normalizado.startsWith("INSERT INTO public.document_evidence_coverage")) {
        const [documentoId, requirementCode, coverageStatus, confidence, sourceSection, extractedValue] = valores;
        sequencia += 1;
        const nova: RegistroCoberturaEvidencia = {
          id: `cobertura-${sequencia}`,
          documento_id: documentoId,
          requirement_code: requirementCode,
          coverage_status: coverageStatus,
          confidence: confidence ?? null,
          source_section: sourceSection ?? null,
          extracted_value: extractedValue ?? null,
        };
        linhas.push(nova);
        return { rows: [{ ...nova }] };
      }

      if (normalizado.includes("FROM public.document_evidence_coverage c JOIN public.documentos_arquivos d")) {
        const [empresaId] = valores;
        const documentosDaEmpresa = new Set(
          documentos.filter((doc) => doc.empresa_id === empresaId && !["excluido", "recusado"].includes(doc.status)).map((doc) => doc.id),
        );
        const resultado = linhas
          .filter((linha) => documentosDaEmpresa.has(linha.documento_id))
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          .map((linha) => ({ requirement_code: linha.requirement_code, coverage_status: linha.coverage_status, confidence: linha.confidence, documento_id: linha.documento_id }));
        return { rows: resultado };
      }

      throw new Error(`SQL não reconhecido pelo banco falso do teste: ${normalizado.slice(0, 160)}`);
    },
  };

  return { db, linhas, documentos };
}

describe("coberturaEvidenciaBureauService — classificador de texto (independente do slot)", () => {
  // Cenário central da missão: um relatório de bureau consolidado traz SCR e
  // CCF (e outros requisitos) na mesma página -- um único documento deve
  // poder cobrir vários requisitos ao mesmo tempo, sem exigir upload
  // duplicado para cada um.
  it("um relatório consolidado cobre vários requisitos ao mesmo tempo", () => {
    const texto = `
      RELATÓRIO CONSOLIDADO DE CONSULTA CADASTRAL
      SCR -- Sistema de Informações de Crédito do Banco Central
      CCF -- Cadastro de Emitentes de Cheques sem Fundos: nada consta
      CENPROT -- Central Nacional de Protestos: nada consta
    `;
    const requisitos = detectarRequisitosCobertosPeloTexto(texto);
    expect(requisitos).toEqual(expect.arrayContaining(['SCR', 'CCF', 'CENPROT']));
    expect(requisitos).not.toContain('CCS');
    expect(requisitos).not.toContain('PGFN');
  });

  it("documento isolado de CADIN cobre só o requisito CADIN", () => {
    expect(detectarRequisitosCobertosPeloTexto('Consulta CADIN -- nada consta')).toEqual(['CADIN']);
  });

  it("Relatório de Situação Fiscal é reconhecido como sua própria fonte", () => {
    expect(detectarRequisitosCobertosPeloTexto('RELATÓRIO DE SITUAÇÃO FISCAL -- CNPJ 12.345.678/0001-90')).toContain('SITUACAO_FISCAL');
  });

  it("texto sem nenhum marcador não inventa requisito", () => {
    expect(detectarRequisitosCobertosPeloTexto('Contrato social da empresa')).toEqual([]);
  });
});

describe("coberturaEvidenciaBureauService — status granular de certidão de débitos", () => {
  // Seção da missão: CND, CPEND e Certidão Positiva pura NÃO podem ser
  // tratadas como equivalentes -- o risco de cada uma é diferente.
  it("distingue CND, CPEND e Certidão Positiva pura, sem conflar as três", () => {
    expect(detectarStatusCertidaoDebitos('CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS A TRIBUTOS FEDERAIS')).toBe('SATISFEITO');
    expect(detectarStatusCertidaoDebitos('CERTIDÃO POSITIVA COM EFEITO DE NEGATIVA')).toBe('CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO');
    expect(detectarStatusCertidaoDebitos('CERTIDÃO POSITIVA DE DÉBITOS')).toBe('CERTIDAO_POSITIVA');
  });

  it("não adivinha status quando o texto não afirma claramente nenhum dos três", () => {
    expect(detectarStatusCertidaoDebitos('Documento ilegível')).toBeNull();
  });

  it("apenas SATISFEITO e CPEND resolvem o requisito; Certidão Positiva pura não resolve", () => {
    expect(statusResolveRequisito('SATISFEITO')).toBe(true);
    expect(statusResolveRequisito('CERTIDAO_POSITIVA_COM_EFEITO_NEGATIVO')).toBe(true);
    expect(statusResolveRequisito('CERTIDAO_POSITIVA')).toBe(false);
    expect(statusResolveRequisito('PENDENTE')).toBe(false);
  });
});

describe("coberturaEvidenciaBureauService — registro e consolidação por empresa (banco falso)", () => {
  const EMPRESA_ID = "74ab11d8-f53f-46b0-b4d7-48abef7c7ff6";

  it("registra a cobertura de um requisito", async () => {
    const { db } = criarBancoFalso();
    const resultado = await registrarCoberturaEvidencia(db, {
      documentoId: "doc-1", requirementCode: 'SCR', coverageStatus: 'SATISFEITO', confidence: 0.9,
    });
    expect(resultado.acao).toBe('inserido');
  });

  it("evidência mais fraca para o mesmo (documento, requisito) não substitui a evidência melhor", async () => {
    const { db } = criarBancoFalso();
    await registrarCoberturaEvidencia(db, { documentoId: "doc-1", requirementCode: 'SCR', coverageStatus: 'SATISFEITO', confidence: 0.9 });
    const resultado = await registrarCoberturaEvidencia(db, { documentoId: "doc-1", requirementCode: 'SCR', coverageStatus: 'PENDENTE', confidence: 0.2 });
    expect(resultado.acao).toBe('ignorado_evidencia_fraca');
  });

  // O ponto central do modelo: UM documento cobrindo VÁRIOS requisitos ao
  // mesmo tempo, sem exigir um upload dedicado por requisito.
  it("um único documento cobrindo vários requisitos aparece em todos eles na consolidação da empresa", async () => {
    const { db, documentos } = criarBancoFalso();
    documentos.push({ id: "doc-consolidado", empresa_id: EMPRESA_ID, status: "aprovado" });

    await registrarCoberturaEvidencia(db, { documentoId: "doc-consolidado", requirementCode: 'SCR', coverageStatus: 'SATISFEITO', confidence: 0.9 });
    await registrarCoberturaEvidencia(db, { documentoId: "doc-consolidado", requirementCode: 'CCF', coverageStatus: 'SATISFEITO', confidence: 0.9 });
    await registrarCoberturaEvidencia(db, { documentoId: "doc-consolidado", requirementCode: 'CENPROT', coverageStatus: 'SATISFEITO', confidence: 0.85 });

    const cobertura = await obterCoberturaPorEmpresa(db, EMPRESA_ID);
    expect(cobertura).toHaveLength(3);
    expect(cobertura.every((item) => item.documento_id === 'doc-consolidado')).toBe(true);
    expect(cobertura.every((item) => item.resolvido)).toBe(true);
  });

  it("documentos excluídos/recusados não contam para a cobertura da empresa", async () => {
    const { db, documentos } = criarBancoFalso();
    documentos.push({ id: "doc-excluido", empresa_id: EMPRESA_ID, status: "excluido" });
    await registrarCoberturaEvidencia(db, { documentoId: "doc-excluido", requirementCode: 'SCR', coverageStatus: 'SATISFEITO', confidence: 0.9 });

    const cobertura = await obterCoberturaPorEmpresa(db, EMPRESA_ID);
    expect(cobertura).toEqual([]);
  });

  it("quando dois documentos cobrem o mesmo requisito, a consolidação fica com a evidência de maior confiança", async () => {
    const { db, documentos } = criarBancoFalso();
    documentos.push({ id: "doc-fraco", empresa_id: EMPRESA_ID, status: "aprovado" });
    documentos.push({ id: "doc-forte", empresa_id: EMPRESA_ID, status: "aprovado" });
    await registrarCoberturaEvidencia(db, { documentoId: "doc-fraco", requirementCode: 'CADIN', coverageStatus: 'PENDENTE', confidence: 0.3 });
    await registrarCoberturaEvidencia(db, { documentoId: "doc-forte", requirementCode: 'CADIN', coverageStatus: 'SATISFEITO', confidence: 0.95 });

    const cobertura = await obterCoberturaPorEmpresa(db, EMPRESA_ID);
    expect(cobertura).toHaveLength(1);
    expect(cobertura[0]).toMatchObject({ documento_id: 'doc-forte', coverage_status: 'SATISFEITO' });
  });

  it("empresa sem nenhuma cobertura registrada devolve lista vazia (não inventa)", async () => {
    const { db } = criarBancoFalso();
    expect(await obterCoberturaPorEmpresa(db, EMPRESA_ID)).toEqual([]);
  });
});
