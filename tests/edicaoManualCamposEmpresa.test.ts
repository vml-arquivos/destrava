import { describe, expect, it } from "vitest";
import {
  campoFoiEditadoManualmente,
  extrairCamposEditadosManualmente,
  montarPatchCamposEditadosManualmente,
} from "../server/utils/edicaoManualCamposEmpresa";

// Rodada 22 (02/09/2026) -- pedido explícito do usuário: "depois de atualizar
// manualmente dados de contato e informações, não alterar automaticamente de
// forma alguma". Este módulo grava/lê o selo de "edição manual" em
// `empresas.dados_extra_receita`, no mesmo padrão já usado para o selo de
// confirmação cadastral documental (`confirmacaoCadastralDocumento.ts`).
describe("extrairCamposEditadosManualmente — leitura tolerante do selo em dados_extra_receita", () => {
  it("retorna objeto vazio quando dados_extra_receita é nulo/ausente/não é objeto", () => {
    expect(extrairCamposEditadosManualmente(null)).toEqual({});
    expect(extrairCamposEditadosManualmente(undefined)).toEqual({});
    expect(extrairCamposEditadosManualmente("string qualquer")).toEqual({});
    expect(extrairCamposEditadosManualmente(42)).toEqual({});
  });

  it("retorna objeto vazio quando não há nenhum selo gravado", () => {
    expect(extrairCamposEditadosManualmente({})).toEqual({});
    expect(extrairCamposEditadosManualmente({ outra_chave: "valor" })).toEqual({});
  });

  it("lê os campos rastreados gravados anteriormente", () => {
    const dadosExtra = {
      campos_editados_manualmente_pelo_usuario: {
        telefone: "2026-09-02T10:00:00.000Z",
        email: "2026-09-01T08:30:00.000Z",
      },
    };
    expect(extrairCamposEditadosManualmente(dadosExtra)).toEqual({
      telefone: "2026-09-02T10:00:00.000Z",
      email: "2026-09-01T08:30:00.000Z",
    });
  });

  it("ignora chaves que não são um dos campos rastreáveis (tolerante a formato inesperado, nunca lança)", () => {
    const dadosExtra = {
      campos_editados_manualmente_pelo_usuario: {
        telefone: "2026-09-02T10:00:00.000Z",
        campo_desconhecido: "2026-09-02T10:00:00.000Z",
        email: 12345, // formato inesperado -- deve ser ignorado, não lançar
      },
    };
    expect(extrairCamposEditadosManualmente(dadosExtra)).toEqual({ telefone: "2026-09-02T10:00:00.000Z" });
  });
});

describe("campoFoiEditadoManualmente", () => {
  const dadosExtra = { campos_editados_manualmente_pelo_usuario: { telefone: "2026-09-02T10:00:00.000Z" } };

  it("retorna true para um campo com selo registrado", () => {
    expect(campoFoiEditadoManualmente(dadosExtra, "telefone")).toBe(true);
  });

  it("retorna false para um campo sem selo registrado", () => {
    expect(campoFoiEditadoManualmente(dadosExtra, "email")).toBe(false);
    expect(campoFoiEditadoManualmente(null, "situacao_cadastral")).toBe(false);
  });
});

describe("montarPatchCamposEditadosManualmente", () => {
  it("retorna null quando a lista de campos está vazia (nada para gravar)", () => {
    expect(montarPatchCamposEditadosManualmente(null, [])).toBeNull();
  });

  it("monta o patch com o(s) campo(s) informado(s), carimbando com a data informada", () => {
    const agora = new Date("2026-09-02T12:00:00.000Z");
    const patch = montarPatchCamposEditadosManualmente(null, ["telefone"], agora);
    expect(patch).toEqual({
      campos_editados_manualmente_pelo_usuario: { telefone: "2026-09-02T12:00:00.000Z" },
    });
  });

  it("preserva os campos já registrados anteriormente que não estão sendo atualizados agora (merge, não substituição)", () => {
    const dadosExtraAtual = {
      campos_editados_manualmente_pelo_usuario: { email: "2026-08-01T00:00:00.000Z" },
    };
    const agora = new Date("2026-09-02T12:00:00.000Z");
    const patch = montarPatchCamposEditadosManualmente(dadosExtraAtual, ["telefone"], agora);
    expect(patch).toEqual({
      campos_editados_manualmente_pelo_usuario: {
        email: "2026-08-01T00:00:00.000Z",
        telefone: "2026-09-02T12:00:00.000Z",
      },
    });
  });

  it("atualiza o carimbo de um campo que já tinha selo (nova edição manual, mesma trava)", () => {
    const dadosExtraAtual = {
      campos_editados_manualmente_pelo_usuario: { telefone: "2026-08-01T00:00:00.000Z" },
    };
    const agora = new Date("2026-09-02T12:00:00.000Z");
    const patch = montarPatchCamposEditadosManualmente(dadosExtraAtual, ["telefone"], agora);
    expect(patch).toEqual({
      campos_editados_manualmente_pelo_usuario: { telefone: "2026-09-02T12:00:00.000Z" },
    });
  });

  it("PROVA DE REVERSÃO: se o merge com os campos existentes fosse removido, uma edição manual de telefone apagaria o selo já gravado para email -- reversão manual confirma que o merge está de fato em vigor", () => {
    // Comportamento equivalente ao teste de merge acima, mas isolando o
    // resultado esperado: o selo de email sobrevive mesmo gravando um selo
    // novo só para telefone.
    const dadosExtraAtual = { campos_editados_manualmente_pelo_usuario: { email: "2026-08-01T00:00:00.000Z" } };
    const patch = montarPatchCamposEditadosManualmente(dadosExtraAtual, ["telefone"], new Date("2026-09-02T12:00:00.000Z"));
    expect(patch?.campos_editados_manualmente_pelo_usuario.email).toBe("2026-08-01T00:00:00.000Z");
  });
});
