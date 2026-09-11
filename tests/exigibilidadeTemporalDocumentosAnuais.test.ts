import { describe, expect, it } from 'vitest';
import { gerarMapaDocumentalCredito, aplicarExigibilidadeTemporalDocumentosAnuais } from '../server/services/mapaDocumentalCreditoService';

// CORREÇÃO (10/09/2026, pedido explícito do usuário: "quando colocaram o
// enquadramento tributário se for optante do simples, tem uma sequência de
// documentação [...] se não for optante do simples, aí tem as outras formas
// de definir o que é a empresa [...] temos que ter isso tudo de acordo com
// as datas, pois tem as datas específicas de depois de um tempo que a
// empresa está pra poder ter as certidões. Inclusive [a DEFIS] ela só sai
// todo ano no meio do ano, então [a DEFIS] de uma empresa que desenquadrou
// agora, só vai sair no meio do ano que vem [...] garanta que tudo isso
// esteja funcionando, garanta que não tenha regressões, que não tenha
// quebra.").
//
// ECF, ECD, DEFIS e DASN-SIMEI têm prazo legal anual preciso, já calculado
// por `regimeTributarioTemporalService.ts` (Rodada 33, 05/09/2026) -- mas
// antes desta correção, esse cálculo só era usado para julgar um documento
// JÁ ANEXADO, nunca para decidir se um documento ainda faltando devia
// aparecer como pendência obrigatória. `aplicarExigibilidadeTemporalDocumentosAnuais`
// fecha essa lacuna: enquanto o prazo legal do primeiro ano em que o
// documento passaria a ser exigido (a partir de `regime_vigente_desde`)
// ainda não chegou, o item deixa de contar como obrigatório -- reaproveita
// o mesmo campo `obrigatorio` que toda a lógica de "documentos
// faltantes"/"apto para avançar" já respeita em todo o sistema, sem
// precisar alterar mais nenhum arquivo para a contagem ficar certa.
describe('aplicarExigibilidadeTemporalDocumentosAnuais -- ECF/ECD/DEFIS/DASN-SIMEI não viram pendência antes do prazo legal', () => {
  it('empresa que virou Lucro Presumido há poucos meses: ECF ainda não anexado NÃO conta como pendência obrigatória antes do prazo (último dia útil de julho do ano seguinte)', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { razao_social: 'Teste' },
      enquadramento: { situacao_simples: 'Não Optante', regime_tributario: 'Lucro Presumido' },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: ['cartao_cnpj', 'qsa'],
    });
    const ecfAntes = mapa.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.tipos_arquivo[0] === 'ecf' && d.tipos_arquivo.length === 2);
    expect(ecfAntes?.obrigatorio).toBe(true);
    expect(ecfAntes?.status).toBe('pendente');

    // Regime vigente desde março de 2026; "hoje" ainda é 2026 -- o prazo do
    // ECF do ano-calendário 2026 só vence no último dia útil de julho de
    // 2027, então ainda não pode ser cobrado.
    const mapaCorrigido = aplicarExigibilidadeTemporalDocumentosAnuais(mapa, '2026-03-15', new Date('2026-10-01T12:00:00Z'));
    const ecfDepois = mapaCorrigido.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.tipos_arquivo[0] === 'ecf' && d.tipos_arquivo.length === 2);
    expect(ecfDepois?.obrigatorio).toBe(false);
    expect(ecfDepois?.status).toBe('ainda_nao_exigivel');
    expect(ecfDepois?.motivo).toMatch(/31\/07\/2027|30\/07\/2027|29\/07\/2027/);
  });

  it('mesmo cenário, mas depois do prazo legal (agosto de 2027): ECF volta a contar como pendência obrigatória normalmente', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { razao_social: 'Teste' },
      enquadramento: { situacao_simples: 'Não Optante', regime_tributario: 'Lucro Presumido' },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: ['cartao_cnpj', 'qsa'],
    });
    const mapaCorrigido = aplicarExigibilidadeTemporalDocumentosAnuais(mapa, '2026-03-15', new Date('2027-08-15T12:00:00Z'));
    const ecfDepois = mapaCorrigido.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.tipos_arquivo[0] === 'ecf' && d.tipos_arquivo.length === 2);
    expect(ecfDepois?.obrigatorio).toBe(true);
    expect(ecfDepois?.status).toBe('pendente');
  });

  it('empresa Simples Nacional (MEI, DASN-SIMEI) que desenquadrou há pouco: DASN-SIMEI só vira pendência depois de 31 de maio do ano seguinte', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { regime_tributario: 'MEI', opcao_mei: true },
      etapa1Aprovada: true,
      etapa2Aprovada: false,
      tiposAnexados: ['cartao_cnpj', 'qsa'],
    });
    const dasnAntes = mapa.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.codigo === 'dasn_simei');
    expect(dasnAntes?.obrigatorio).toBe(true);

    const mapaCorrigido = aplicarExigibilidadeTemporalDocumentosAnuais(mapa, '2026-09-01', new Date('2026-12-01T12:00:00Z'));
    const dasnDepois = mapaCorrigido.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.codigo === 'dasn_simei');
    expect(dasnDepois?.obrigatorio).toBe(false);
    expect(dasnDepois?.status).toBe('ainda_nao_exigivel');
  });

  it('documento já anexado nunca é tocado, mesmo antes do prazo', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { razao_social: 'Teste' },
      enquadramento: { situacao_simples: 'Não Optante', regime_tributario: 'Lucro Presumido' },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: ['cartao_cnpj', 'qsa', 'ecf'],
    });
    const mapaCorrigido = aplicarExigibilidadeTemporalDocumentosAnuais(mapa, '2026-03-15', new Date('2026-10-01T12:00:00Z'));
    const ecf = mapaCorrigido.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.tipos_arquivo[0] === 'ecf' && d.tipos_arquivo.length === 2);
    expect(ecf?.anexado).toBe(true);
    expect(ecf?.status).toBe('anexado');
  });

  it('itens "não aplicável" (ex.: DEFIS para MEI, em `documentos_nao_aplicaveis`) nunca são tocados', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { regime_tributario: 'MEI', opcao_mei: true },
      etapa1Aprovada: true,
      etapa2Aprovada: false,
      tiposAnexados: ['cartao_cnpj', 'qsa'],
    });
    // `documentos_nao_aplicaveis` é uma lista à parte (não fica dentro de
    // `etapas[].documentos`) -- `aplicarExigibilidadeTemporalDocumentosAnuais`
    // só percorre `mapa.etapas`, então este array nem chega a ser visitado;
    // o teste confirma que ele sai idêntico ao que entrou.
    const defisNaoAplicavelAntes = mapa.documentos_nao_aplicaveis.find((d) => d.codigo === 'nao_aplicavel_defis_mei');
    expect(defisNaoAplicavelAntes?.status).toBe('nao_aplicavel');
    expect(defisNaoAplicavelAntes?.obrigatorio).toBe(false);
    const mapaCorrigido = aplicarExigibilidadeTemporalDocumentosAnuais(mapa, '2026-09-01', new Date('2026-12-01T12:00:00Z'));
    const defisNaoAplicavelDepois = mapaCorrigido.documentos_nao_aplicaveis.find((d) => d.codigo === 'nao_aplicavel_defis_mei');
    expect(defisNaoAplicavelDepois?.status).toBe('nao_aplicavel');
    expect(defisNaoAplicavelDepois?.obrigatorio).toBe(false);
    expect(mapaCorrigido.documentos_nao_aplicaveis).toBe(mapa.documentos_nao_aplicaveis);
  });

  it('o item combinado "confirmação de regime não optante" (aceita ECF OU DCTF OU DARF OU Livro Caixa) nunca é tocado -- só o ECF tem prazo anual fixo entre esses tipos', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { razao_social: 'Teste' },
      enquadramento: { situacao_simples: 'Não Optante', regime_tributario: null },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: ['cartao_cnpj', 'qsa'],
    });
    const itemAntes = mapa.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.codigo === 'confirmacao_regime_nao_optante');
    expect(itemAntes?.obrigatorio).toBe(true);
    const mapaCorrigido = aplicarExigibilidadeTemporalDocumentosAnuais(mapa, '2026-03-15', new Date('2026-10-01T12:00:00Z'));
    const itemDepois = mapaCorrigido.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.codigo === 'confirmacao_regime_nao_optante');
    expect(itemDepois?.obrigatorio).toBe(true);
    expect(itemDepois?.status).toBe('pendente');
  });

  it('sem `regimeVigenteDesde` (histórico indisponível): devolve o mapa exatamente como recebido, sem tocar em nada -- zero regressão quando o histórico de regime não está disponível', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { razao_social: 'Teste' },
      enquadramento: { situacao_simples: 'Não Optante', regime_tributario: 'Lucro Presumido' },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: ['cartao_cnpj', 'qsa'],
    });
    const mapaCorrigido = aplicarExigibilidadeTemporalDocumentosAnuais(mapa, null);
    expect(mapaCorrigido).toBe(mapa);
    const mapaCorrigido2 = aplicarExigibilidadeTemporalDocumentosAnuais(mapa, undefined);
    expect(mapaCorrigido2).toBe(mapa);
  });
});
