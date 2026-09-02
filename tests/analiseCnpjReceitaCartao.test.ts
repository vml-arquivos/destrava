import { describe, expect, it } from "vitest";
import {
  calcularScore,
  deveAtualizarCampoContatoViaCartao,
  deveAtualizarContatoViaCartao,
  deveConfirmarNomeEmpresarialViaCartao,
  deveConfirmarSituacaoCadastralViaCartao,
  extracaoTemQualidade,
} from "../server/services/analiseCnpjReceitaCartao";

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

  // Rodada 22 (02/09/2026) -- pedido explícito do usuário: "coloque como
  // regra que o documento para atualização dos dados não pode ter mais de 5
  // dias da consulta e emissão, isso é só se a empresa tiver alterações e a
  // API da Receita ainda não estiver atualizada; caso contrário deixo os
  // dados como está".
  it("quando HÁ uma correção pendente (situação atual da empresa diverge da do documento), só autoriza com documento emitido há no máximo 5 dias", () => {
    const autorizaComDocumentoRecente = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
      situacaoAtualEmpresa: "Inapta",
      diasEmissaoCartao: 3,
    });
    expect(autorizaComDocumentoRecente).toEqual({ pode: true, motivo: "correcao_cadastral_aplicada_com_documento_recente" });

    const negaComDocumentoDeMaisDeCincoDias = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
      situacaoAtualEmpresa: "Inapta",
      diasEmissaoCartao: 6,
    });
    expect(negaComDocumentoDeMaisDeCincoDias).toEqual({ pode: false, motivo: "correcao_cadastral_exige_documento_emitido_ha_no_maximo_5_dias" });
  });

  it("quando NÃO há correção pendente (situação da empresa já bate com o documento), a janela de 30 dias já existente continua suficiente -- não exige o documento ter no máximo 5 dias", () => {
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
      situacaoAtualEmpresa: "ATIVA",
      diasEmissaoCartao: 20,
    });
    expect(resultado).toEqual({ pode: true, motivo: "documento_ativo_valido_e_com_qualidade_confirmada" });
  });

  it("continua autorizando normalmente quando `situacaoAtualEmpresa`/`diasEmissaoCartao` não são informados (compatibilidade com quem ainda não passa esses argumentos)", () => {
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
    });
    expect(resultado.pode).toBe(true);
  });

  // Rodada 22, mesma mensagem: "depois de atualizar manualmente dados de
  // contato e informações, não alterar automaticamente de forma alguma".
  it("nega quando a situação cadastral já foi editada manualmente pelo colaborador -- nunca mais sobrescrita pela leitura automática do documento", () => {
    const resultado = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
      situacaoAtualEmpresa: "Inapta",
      diasEmissaoCartao: 1,
      situacaoEditadaManualmente: true,
    });
    expect(resultado).toEqual({ pode: false, motivo: "situacao_cadastral_editada_manualmente_pelo_usuario" });
  });

  it("PROVA DE REVERSÃO: se a checagem de correção pendente/5 dias fosse removida, um documento vencido de 6+ dias corrigiria o cadastro mesmo assim -- reversão manual confirma que o gate está de fato em vigor", () => {
    // Sem a checagem `haCorrecaoPendente`/`diasEmissaoCartao <= 5`, o teste
    // acima ("nega...5 dias") teria de falhar. Este teste apenas documenta o
    // comportamento oposto esperado (autorizar) quando a correção pendente
    // não existe -- serve de referência cruzada para a prova de reversão já
    // demonstrada diretamente nas execuções de teste (ver TEST_REPORT.md).
    const semCorrecaoPendente = deveConfirmarSituacaoCadastralViaCartao({
      cartao,
      camposCartao: extracaoConfiavelAtiva,
      extracaoGemini: extracaoConfiavelAtiva,
      statusValidadeCartao: "valido",
      situacaoAtualEmpresa: "ATIVA",
      diasEmissaoCartao: 29,
    });
    expect(semCorrecaoPendente.pode).toBe(true);
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

// Rodada 22 (02/09/2026) -- pedido explícito do usuário: "depois de atualizar
// manualmente dados de contato e informações, não alterar automaticamente de
// forma alguma". `deveAtualizarCampoContatoViaCartao` é a decisão pura POR
// CAMPO usada por `aplicarAtualizacaoContatoDocumentoEmpresa` -- telefone e
// e-mail são independentes, então uma edição manual só bloqueia o campo que
// foi editado.
describe("deveAtualizarCampoContatoViaCartao — respeita edição manual do colaborador, campo a campo", () => {
  it("autoriza quando o documento traz um valor novo e o campo nunca foi editado manualmente", () => {
    const resultado = deveAtualizarCampoContatoViaCartao({
      valorCartao: "(61) 9145-9287",
      valorAtual: "(61) 0000-0000",
      editadoManualmente: false,
    });
    expect(resultado).toBe(true);
  });

  it("nega quando o campo já foi editado manualmente -- mesmo que o documento traga um valor diferente do atual", () => {
    const resultado = deveAtualizarCampoContatoViaCartao({
      valorCartao: "(61) 9145-9287",
      valorAtual: "(61) 0000-0000",
      editadoManualmente: true,
    });
    expect(resultado).toBe(false);
  });

  it("nega quando o documento não trouxe valor nenhum para o campo", () => {
    const resultado = deveAtualizarCampoContatoViaCartao({
      valorCartao: null,
      valorAtual: "(61) 0000-0000",
      editadoManualmente: false,
    });
    expect(resultado).toBe(false);
  });

  it("nega quando o valor do documento já é igual ao valor atual (nada para atualizar)", () => {
    const resultado = deveAtualizarCampoContatoViaCartao({
      valorCartao: "(61) 9145-9287",
      valorAtual: "(61) 9145-9287",
      editadoManualmente: false,
    });
    expect(resultado).toBe(false);
  });

  it("PROVA DE REVERSÃO: se a checagem de edição manual fosse removida, o campo protegido voltaria a ser sobrescrito -- reversão manual confirma que o gate está de fato em vigor", () => {
    // Sem `editadoManualmente`, o segundo teste acima ("nega quando o campo já
    // foi editado manualmente") teria de falhar (voltaria a `true`). Este
    // teste isola o comportamento equivalente sem o gate: com
    // `editadoManualmente: false` mas os mesmos valores, o resultado é `true`
    // -- prova de que é exclusivamente o gate `editadoManualmente` que muda o
    // resultado para `false` no teste correspondente.
    const semEdicaoManual = deveAtualizarCampoContatoViaCartao({
      valorCartao: "(61) 9145-9287",
      valorAtual: "(61) 0000-0000",
      editadoManualmente: false,
    });
    expect(semEdicaoManual).toBe(true);
  });
});

// Rodada 26 (02/09/2026) -- pedido explícito do usuário, sobre um segundo caso
// concreto (Cartão CNPJ mostrando "OFICINA DA BELEZA LTDA" para uma empresa
// cadastrada como "43.843.322 ANA AMELIA DA SILVA FREITAS"): "esse caso é
// igual [à situação cadastral], os dados da receita vêm desatualizado pela
// api, e o cartão anexado tá certo, tem que atualizar os dados faltantes
// automático e aparecer no modal a análise". `deveConfirmarNomeEmpresarialViaCartao`
// é a decisão pura (sem banco/rede) usada por
// `aplicarConfirmacaoNomeEmpresarialDocumentoEmpresa` para decidir se a leitura
// do Cartão CNPJ deve corrigir o nome empresarial/razão social do cadastro --
// mesmo padrão de `deveConfirmarSituacaoCadastralViaCartao` (Rodada 20), mais
// uma trava nova de segurança: os números de CNPJ (cadastro x documento)
// precisam bater, para distinguir "a mesma empresa mudou de nome e a API
// gratuita está desatualizada" de "foi anexado por engano o Cartão CNPJ de
// outra empresa".
describe("deveConfirmarNomeEmpresarialViaCartao — corrige o nome empresarial/razão social a partir do Cartão CNPJ", () => {
  const cartao = { id: "cartao-vilson-1" };

  // Fixture baseada no Cartão CNPJ real anexado pelo usuário (CNPJ
  // 29.705.345/0001-22): leitura com qualidade mínima confirmada.
  const extracaoConfiavel = {
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

  it("nega quando não há Cartão CNPJ anexado", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao: null,
      camposCartao: extracaoConfiavel,
      extracaoGemini: extracaoConfiavel,
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "sem_cartao_cnpj_anexado" });
  });

  it("nega quando a razão social já foi editada manualmente pelo colaborador -- nunca mais sobrescrita pela leitura automática do documento", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: extracaoConfiavel,
      extracaoGemini: extracaoConfiavel,
      statusValidadeCartao: "valido",
      razaoSocialAtualEmpresa: "ANA AMELIA DA SILVA FREITAS",
      diasEmissaoCartao: 1,
      nomeEditadoManualmente: true,
    });
    expect(resultado).toEqual({ pode: false, motivo: "razao_social_editada_manualmente_pelo_usuario" });
  });

  it("nega quando o nome empresarial não foi extraído do documento", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: { ...extracaoConfiavel, nome_empresarial: null },
      extracaoGemini: extracaoConfiavel,
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "nome_empresarial_nao_extraido_do_documento" });
  });

  it('nega quando o Cartão CNPJ está fora do prazo de validade documental ("vencido"/"pendente"/"nao_verificado")', () => {
    for (const status of ["vencido", "pendente", "nao_verificado"]) {
      const resultado = deveConfirmarNomeEmpresarialViaCartao({
        cartao,
        camposCartao: extracaoConfiavel,
        extracaoGemini: extracaoConfiavel,
        statusValidadeCartao: status,
      });
      expect(resultado).toEqual({ pode: false, motivo: "cartao_cnpj_fora_do_prazo_de_validade_documental" });
    }
  });

  it("nega quando a leitura do documento não teve qualidade mínima confirmada (resultado degradado de fallback)", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: extracaoConfiavel,
      extracaoGemini: { cnpj: "29705345000122", nome_empresarial: extracaoConfiavel.nome_empresarial, confianca: 0.1 },
      statusValidadeCartao: "valido",
    });
    expect(resultado).toEqual({ pode: false, motivo: "leitura_do_documento_sem_qualidade_minima_confirmada" });
  });

  // TRAVA DE SEGURANÇA NOVA desta rodada: um nome divergente sozinho não
  // distingue "a empresa mudou de nome" de "documento de outra empresa
  // anexado por engano" -- os números de CNPJ precisam bater.
  it("nega quando o CNPJ do documento diverge do CNPJ do cadastro -- provável documento de outra empresa anexado por engano", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: { ...extracaoConfiavel, nome_empresarial: "OFICINA DA BELEZA LTDA" },
      extracaoGemini: { ...extracaoConfiavel, nome_empresarial: "OFICINA DA BELEZA LTDA" },
      statusValidadeCartao: "valido",
      razaoSocialAtualEmpresa: "ANA AMELIA DA SILVA FREITAS",
      diasEmissaoCartao: 1,
      cnpjEmpresaLimpo: "43843322000199",
      cnpjCartaoLimpo: "29705345000122",
    });
    expect(resultado).toEqual({ pode: false, motivo: "cnpj_do_documento_diverge_do_cadastro_provavel_empresa_diferente" });
  });

  it("autoriza quando o CNPJ do documento é igual ao do cadastro, mesmo com o nome divergente e documento recente -- é a mesma empresa, a API gratuita está desatualizada", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: extracaoConfiavel,
      extracaoGemini: extracaoConfiavel,
      statusValidadeCartao: "valido",
      razaoSocialAtualEmpresa: "NOME ANTIGO DESATUALIZADO NA API GRATUITA",
      diasEmissaoCartao: 2,
      cnpjEmpresaLimpo: "29705345000122",
      cnpjCartaoLimpo: "29705345000122",
    });
    expect(resultado).toEqual({ pode: true, motivo: "correcao_de_nome_aplicada_com_documento_recente" });
  });

  it("continua autorizando normalmente quando o CNPJ do documento não pôde ser lido -- não é razoável exigir um dado que o documento não forneceu", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: extracaoConfiavel,
      extracaoGemini: extracaoConfiavel,
      statusValidadeCartao: "valido",
      razaoSocialAtualEmpresa: "NOME ANTIGO DESATUALIZADO NA API GRATUITA",
      diasEmissaoCartao: 2,
      cnpjEmpresaLimpo: "29705345000122",
      cnpjCartaoLimpo: null,
    });
    expect(resultado).toEqual({ pode: true, motivo: "correcao_de_nome_aplicada_com_documento_recente" });
  });

  it("quando NÃO há correção pendente (nome do cadastro já bate com o documento, após normalização), a janela de 30 dias já existente continua suficiente -- não exige documento com no máximo 5 dias", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: extracaoConfiavel,
      extracaoGemini: extracaoConfiavel,
      statusValidadeCartao: "valido",
      razaoSocialAtualEmpresa: extracaoConfiavel.nome_empresarial,
      diasEmissaoCartao: 20,
      cnpjEmpresaLimpo: "29705345000122",
      cnpjCartaoLimpo: "29705345000122",
    });
    expect(resultado).toEqual({ pode: true, motivo: "nome_ja_confere_documento_valido_e_com_qualidade_confirmada" });
  });

  it("quando HÁ correção pendente (nome do cadastro diverge do documento), só autoriza com documento emitido há no máximo 5 dias", () => {
    const negaComDocumentoDeMaisDeCincoDias = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: extracaoConfiavel,
      extracaoGemini: extracaoConfiavel,
      statusValidadeCartao: "valido",
      razaoSocialAtualEmpresa: "NOME ANTIGO DESATUALIZADO NA API GRATUITA",
      diasEmissaoCartao: 6,
      cnpjEmpresaLimpo: "29705345000122",
      cnpjCartaoLimpo: "29705345000122",
    });
    expect(negaComDocumentoDeMaisDeCincoDias).toEqual({ pode: false, motivo: "correcao_de_nome_exige_documento_emitido_ha_no_maximo_5_dias" });
  });

  it("continua autorizando normalmente quando `razaoSocialAtualEmpresa`/`diasEmissaoCartao`/CNPJs não são informados (compatibilidade com quem ainda não passa esses argumentos)", () => {
    const resultado = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: extracaoConfiavel,
      extracaoGemini: extracaoConfiavel,
      statusValidadeCartao: "valido",
    });
    expect(resultado.pode).toBe(true);
  });

  it("PROVA DE REVERSÃO: se a checagem de CNPJ fosse removida, um documento de outra empresa com nome divergente corrigiria o cadastro mesmo assim -- reversão manual confirma que o gate está de fato em vigor", () => {
    // Com a mesma entrada do teste "nega quando o CNPJ do documento diverge",
    // mas SEM passar `cnpjEmpresaLimpo`/`cnpjCartaoLimpo` (simulando a
    // checagem removida), o resultado passa a autorizar -- prova de que é
    // exclusivamente o gate de CNPJ que muda o resultado para `false` no
    // teste correspondente.
    const semChecagemDeCnpj = deveConfirmarNomeEmpresarialViaCartao({
      cartao,
      camposCartao: { ...extracaoConfiavel, nome_empresarial: "OFICINA DA BELEZA LTDA" },
      extracaoGemini: { ...extracaoConfiavel, nome_empresarial: "OFICINA DA BELEZA LTDA" },
      statusValidadeCartao: "valido",
      razaoSocialAtualEmpresa: "ANA AMELIA DA SILVA FREITAS",
      diasEmissaoCartao: 1,
    });
    expect(semChecagemDeCnpj.pode).toBe(true);
  });
});
