import { describe, expect, it } from "vitest";
import { calcularScore, deveAtualizarContatoViaCartao, deveConfirmarSituacaoCadastralViaCartao, extracaoTemQualidade } from "../server/services/analiseCnpjReceitaCartao";

describe("calcularScore — leitura do Cartão CNPJ", () => {
  const camposReceitaCompletos = {
    cnpj_limpo: "12345678000190",
    nome_empresarial: "Empresa Exemplo Ltda.",
    data_abertura: "2020-01-01",
    cnae_principal: "6201501",
    natureza_juridica: "2062",
    situacao_cadastral: "ATIVA",
    idade_meses: 60,
  };

  it("alerta quando o cartão existe, a extração falha e não há data manual", () => {
    const alertas: any[] = [];
    const resultado = calcularScore({
      camposReceita: camposReceitaCompletos,
      cartao: { id: "cartao-1" },
      extracao: null,
      divergencias: [],
      alertas,
      socios: [{ nome: "Sócio Exemplo" }],
    });

    expect(resultado.score).toBe(95);
    expect(alertas).toContainEqual(expect.objectContaining({
      codigo: "cartao_cnpj_extracao_falhou",
      severidade: "media",
    }));
  });

  it("não cria o alerta quando existe data de emissão manual", () => {
    const alertas: any[] = [];
    calcularScore({
      camposReceita: camposReceitaCompletos,
      cartao: { id: "cartao-1", data_emissao_documento: "2026-08-01" },
      extracao: null,
      divergencias: [],
      alertas,
      socios: [{ nome: "Sócio Exemplo" }],
    });

    expect(alertas).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ codigo: "cartao_cnpj_extracao_falhou" }),
    ]));
  });
});

// Regra de negócio (2026-09-02, Rodada 20 -- pedido explícito do usuário, regressão
// causada pela própria Rodada 19: mesmo depois de a empresa ser corrigida para ATIVA
// -- porque a Receita e o próprio Cartão CNPJ já confirmam isso --, a sincronização
// automática com as APIs gratuitas revertia o valor de volta para "inapta", porque
// essas fontes podem levar até 45 dias para refletir a mudança. Pedido literal do
// usuário: "quando colocar o cartão do CNPJ, ele vai ler o cartão do CNPJ e o se o
// status da situação estiver apta... vai alterar no cadastro da empresa... Isso vai
// ser alterado e não vai sincronizar automaticamente alterando novamente pra inapta."
//
// `deveConfirmarSituacaoCadastralViaCartao` é a decisão pura (sem banco/rede) usada
// por `aplicarConfirmacaoCadastralDocumentoEmpresa` para decidir se a leitura do
// Cartão CNPJ deve gravar e travar a situação cadastral contra a sincronização
// automática -- ela só autoriza quando o documento confirma ATIVA, com qualidade de
// leitura mínima e dentro do prazo de validade documental (30 dias desde a data de
// emissão/consulta impressa no rodapé do próprio Cartão CNPJ, "Emitido no dia... às...",
// NUNCA a data de abertura da empresa, que é permanente e não indica atualidade).
describe("deveConfirmarSituacaoCadastralViaCartao — trava a situação cadastral contra a sincronização automática", () => {
  const cartao = { id: "cartao-vilson-1" };

  // Fixture baseada no Cartão CNPJ real anexado pelo usuário nesta rodada
  // (CNPJ 29.705.345/0001-22): leitura com qualidade mínima confirmada
  // (`extracaoTemQualidade`), situação ATIVA.
  const extracaoConfiavelAtiva = {
    cnpj: "29705345000122",
    nome_empresarial: "29.705.345 VILSON MARCIO DE LIMA",
    cnae_principal: "7319002",
    natureza_juridica: "2135",
    situacao_cadastral: "ATIVA",
    data_abertura: "2018-02-17",
    data_situacao_cadastral: "2026-08-30",
    data_emissao: "2026-08-30",
    data_emissao_texto: "Emitido no dia 30/08/2026 às 19:46:52",
    confianca: 0.92,
  };

  it("sanity check da fixture: a leitura confiável passa em extracaoTemQualidade, uma leitura fraca não passa", () => {
    expect(extracaoTemQualidade(extracaoConfiavelAtiva)).toBe(true);
    expect(extracaoTemQualidade({ cnpj: "29705345000122", confianca: 0.2 })).toBe(false);
    expect(extracaoTemQualidade(null)).toBe(false);
  });

  it("autoriza quando o Cartão CNPJ está anexado, lido com qualidade, mostra ATIVA e está dentro da validade de 30 dias", () => {
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
    });
    expect(resultado.pode).toBe(true);
  });

  it("nega quando não há Cartão CNPJ anexado", () => {
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao: null,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "sem_cartao_cnpj_anexado" });
  });

  it("nega quando a situação cadastral não foi extraída do documento", () => {
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: { ...extracaoConfiavelAtiva, situacao_cadastral: null },
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "situacao_nao_extraida_do_documento" });
  });

  it('nega quando o documento NÃO confirma situação ativa (ex.: "INAPTA", "SUSPENSA") -- só ATIVA autoriza a trava, por pedido explícito do usuário', () => {
    for (const situacaoNaoAtiva of ["INAPTA", "SUSPENSA", "BAIXADA"]) {
      const resultado = deveConfirmarSituacaoCadastralViaCartao({
        cartao,
        camposCartao: { ...extracaoConfiavelAtiva, situacao_cadastral: situacaoNaoAtiva },
        extracaoGemini: { ...extracaoConfiavelAtiva, situacao_cadastral: situacaoNaoAtiva },
        statusValidadeCartao: "valido",
      });
      expect(resultado).toEqual({ pode: false, motivo: "documento_nao_confirma_situacao_ativa" });
    }
  });

  it('nega quando o Cartão CNPJ está "vencido" (mais de 30 dias desde a emissão/consulta) -- valida a atualidade do PRÓPRIO documento, não a data de abertura da empresa', () => {
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "vencido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "cartao_cnpj_fora_do_prazo_de_validade_documental" });
  });

  it('nega quando a validade do cartão ainda não foi confirmada ("pendente"/"nao_verificado")', () => {
    for (const status of ["pendente", "nao_verificado"]) {
      const resultado = deveConfirmarSituacaoCadastralViaCartao({
        cartao,
        camposCartao: extracaoConfiavelAtiva,
        extracaoGemini: extracaoConfiavelAtiva,
        statusValidadeCartao: status,
      });
      expect(resultado).toEqual({ pode: false, motivo: "cartao_cnpj_fora_do_prazo_de_validade_documental" });
    }
  });

  it("nega quando a leitura do documento não teve qualidade mínima confirmada (resultado degradado de fallback)", () => {
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: { cnpj: "29705345000122", situacao_cadastral: "ATIVA", confianca: 0.1 },
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "leitura_do_documento_sem_qualidade_minima_confirmada" });
  });

  it("PROVA DE REVERSÃO: se a checagem de status ativo fosse removida, um documento com situação divergente (ex.: OCR errado) passaria a travar indevidamente -- reversão manual confirma que o gate está de fato em vigor", () => {
    // Sem a checagem `isSituacaoAtiva`, qualquer situação extraída (mesmo uma leitura
    // errada de OCR) travaria o cadastro contra a sincronização automática -- o que é
    // exatamente o comportamento indevido que este teste prova que NÃO acontece hoje.
    const situacaoInesperada = "SITUACAO_NAO_RECONHECIDA_PELO_OCR";
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: { ...extracaoConfiavelAtiva, situacao_cadastral: situacaoInesperada },
      extracaoGemini: { ...extracaoConfiavelAtiva, situacao_cadastral: situacaoInesperada },
      statusValidadeCartao: "valido",
    });
    expect(resultado.pode).toBe(false);
  });
});

// Rodada 21 (02/09/2026) -- pedido explícito do usuário: "quando ler o cartão
// do cnpj [...] se tiver telefone atualizado, pegar o email e já atualizar
// automaticamente na [...] parte da receita. Substituir e não sincronizar e
// mudar automático". `deveAtualizarContatoViaCartao` é a decisão pura (sem
// banco/rede) usada por `aplicarAtualizacaoContatoDocumentoEmpresa`. Ao
// contrário de `deveConfirmarSituacaoCadastralViaCartao`, NÃO exige situação
// ATIVA -- o contato impresso no documento é válido independentemente da
// situação cadastral da empresa.
describe("deveAtualizarContatoViaCartao — atualiza telefone/e-mail da empresa a partir do Cartão CNPJ", () => {
  const cartao = { id: "cartao-vilson-1" };
  const extracaoComContato = {
    cnpj: "29705345000122",
    nome_empresarial: "29.705.345 VILSON MARCIO DE LIMA",
    cnae_principal: "7319002",
    natureza_juridica: "2135",
    situacao_cadastral: "ATIVA",
    data_abertura: "2018-02-17",
    email: "vilsonmarcio@gmail.com",
    telefone: "(61) 9145-9287",
    confianca: 0.92,
  };

  it("autoriza quando o Cartão CNPJ está anexado, lido com qualidade, dentro da validade e com telefone/email extraídos", () => {
    const resultado = deveAtualizarContatoViaCartao({
      cartao,
      camposCartao: extracaoComContato,
      extracaoGemini: extracaoComContato,
      statusValidadeCartao: "valido",
    });
    expect(resultado.pode).toBe(true);
  });

  it("autoriza mesmo quando a situação cadastral NÃO é ativa -- o contato do documento vale independentemente da situação", () => {
    const resultado = deveAtualizarContatoViaCartao({
      cartao,
      camposCartao: { ...extracaoComContato, situacao_cadastral: "INAPTA" },
      extracaoGemini: { ...extracaoComContato, situacao_cadastral: "INAPTA" },
      statusValidadeCartao: "valido",
    });
    expect(resultado.pode).toBe(true);
  });

  it("nega quando não há Cartão CNPJ anexado", () => {
    const resultado = deveAtualizarContatoViaCartao({
      cartao: null,
      camposCartao: extracaoComContato,
      extracaoGemini: extracaoComContato,
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "sem_cartao_cnpj_anexado" });
  });

  it('nega quando o Cartão CNPJ está fora do prazo de validade documental (mesmo com telefone/email extraídos)', () => {
    const resultado = deveAtualizarContatoViaCartao({
      cartao,
      camposCartao: extracaoComContato,
      extracaoGemini: extracaoComContato,
      statusValidadeCartao: "vencido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "cartao_cnpj_fora_do_prazo_de_validade_documental" });
  });

  it("nega quando a leitura não teve qualidade mínima confirmada", () => {
    const resultado = deveAtualizarContatoViaCartao({
      cartao,
      camposCartao: extracaoComContato,
      extracaoGemini: { cnpj: "29705345000122", confianca: 0.1 },
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "leitura_do_documento_sem_qualidade_minima_confirmada" });
  });

  it("nega quando nem telefone nem email foram extraídos do documento", () => {
    const resultado = deveAtualizarContatoViaCartao({
      cartao,
      camposCartao: { ...extracaoComContato, email: null, telefone: null },
      extracaoGemini: { ...extracaoComContato, email: null, telefone: null },
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "telefone_e_email_nao_extraidos_do_documento" });
  });

  it("autoriza quando só um dos dois (telefone OU email) foi extraído", () => {
    const soTelefone = deveAtualizarContatoViaCartao({
      cartao,
      camposCartao: { ...extracaoComContato, email: null },
      extracaoGemini: { ...extracaoComContato, email: null },
      statusValidadeCartao: "valido",
    });
    expect(soTelefone.pode).toBe(true);

    const soEmail = deveAtualizarContatoViaCartao({
      cartao,
      camposCartao: { ...extracaoComContato, telefone: null },
      extracaoGemini: { ...extracaoComContato, telefone: null },
      statusValidadeCartao: "valido",
    });
    expect(soEmail.pode).toBe(true);
  });
});
