import { describe, expect, it } from 'vitest';
import { deveRetentarAnaliseFalhaAutomaticamente, deveReprocessarCartaoCnpjAutomaticamente } from '../server/utils/retentativaAutomaticaAnaliseDocumental';

// Rodada 21 (02/09/2026) -- pedido explícito do usuário: "eu quero que os
// dados do cartão cnpj e qsa já apareça aqui validado [...] sem precisar
// clicar em botão de análise". Antes desta correção, uma falha de leitura
// persistida (`documentos_arquivos.resultado_validacao.analise_inicial_erro`)
// ficava sendo reexibida para sempre em toda visualização normal da tela --
// nunca era tentada de novo sem um clique manual. Estes testes cobrem a
// função pura que decide QUANDO vale a pena tentar de novo automaticamente.
describe('deveRetentarAnaliseFalhaAutomaticamente', () => {
  const agora = new Date('2026-09-02T12:00:00Z');

  it('não tenta de novo quando não existe nenhuma falha persistida', () => {
    expect(deveRetentarAnaliseFalhaAutomaticamente({ falhaPersistidaEm: null, agora })).toBe(false);
  });

  it('não tenta de novo quando a falha é muito recente (dentro do cooldown padrão de 15 minutos)', () => {
    const falhaPersistidaEm = new Date('2026-09-02T11:50:00Z').toISOString(); // 10 min atrás
    expect(deveRetentarAnaliseFalhaAutomaticamente({ falhaPersistidaEm, agora })).toBe(false);
  });

  it('tenta de novo quando a falha já passou do cooldown padrão de 15 minutos', () => {
    const falhaPersistidaEm = new Date('2026-09-02T11:40:00Z').toISOString(); // 20 min atrás
    expect(deveRetentarAnaliseFalhaAutomaticamente({ falhaPersistidaEm, agora })).toBe(true);
  });

  it('respeita um cooldown customizado', () => {
    const falhaPersistidaEm = new Date('2026-09-02T11:55:00Z').toISOString(); // 5 min atrás
    expect(deveRetentarAnaliseFalhaAutomaticamente({ falhaPersistidaEm, agora, cooldownMinutos: 2 })).toBe(true);
    expect(deveRetentarAnaliseFalhaAutomaticamente({ falhaPersistidaEm, agora, cooldownMinutos: 10 })).toBe(false);
  });

  it('não lança e retorna false para uma data inválida', () => {
    expect(deveRetentarAnaliseFalhaAutomaticamente({ falhaPersistidaEm: 'não-é-uma-data', agora })).toBe(false);
  });

  it('é uma regra geral -- não depende de nenhuma empresa/documento específico, só do tempo decorrido', () => {
    const cincoMinutosAtras = new Date(agora.getTime() - 5 * 60000).toISOString();
    const trintaMinutosAtras = new Date(agora.getTime() - 30 * 60000).toISOString();
    expect(deveRetentarAnaliseFalhaAutomaticamente({ falhaPersistidaEm: cincoMinutosAtras, agora })).toBe(false);
    expect(deveRetentarAnaliseFalhaAutomaticamente({ falhaPersistidaEm: trintaMinutosAtras, agora })).toBe(true);
  });
});

// `deveReprocessarCartaoCnpjAutomaticamente` combina os dois sinais que
// `montarDossieCreditoEmpresa` usa de verdade: existe uma falha persistida? E
// nenhuma leitura bem-sucedida aconteceu depois dela? Cobre exatamente o
// mesmo caso relatado pelo usuário: o Cartão CNPJ de uma empresa Empresário
// Individual ficou marcado com falha uma vez e nunca mais foi tentado de
// novo automaticamente numa visualização normal da tela.
describe('deveReprocessarCartaoCnpjAutomaticamente', () => {
  const agora = new Date('2026-09-02T12:00:00Z');
  const falhaAntigaHaUmaHora = { mensagem: 'Cartão CNPJ: a leitura interna ficou inconclusiva...', ocorrido_em: new Date('2026-09-02T11:00:00Z').toISOString() };

  it('não reprocessa quando não existe nenhuma falha persistida (fluxo comum, sem regressão)', () => {
    expect(deveReprocessarCartaoCnpjAutomaticamente({ falhaPersistida: null, analiseAtual: null, agora })).toBe(false);
  });

  it('reprocessa quando existe falha persistida antiga (fora do cooldown) e nenhuma análise aconteceu depois', () => {
    expect(deveReprocessarCartaoCnpjAutomaticamente({ falhaPersistida: falhaAntigaHaUmaHora, analiseAtual: null, agora })).toBe(true);
  });

  it('NÃO reprocessa quando já existe uma leitura bem-sucedida registrada depois da falha (defesa extra, mesmo que a falha não tenha sido limpa por algum motivo)', () => {
    const analiseComSucesso = { cartao_anexado: true, cartao_pendente_ocr: false };
    expect(deveReprocessarCartaoCnpjAutomaticamente({ falhaPersistida: falhaAntigaHaUmaHora, analiseAtual: analiseComSucesso, agora })).toBe(false);
  });

  it('reprocessa quando a última análise registrada ainda está pendente de OCR (não foi realmente lida)', () => {
    const analisePendenteOcr = { cartao_anexado: true, cartao_pendente_ocr: true };
    expect(deveReprocessarCartaoCnpjAutomaticamente({ falhaPersistida: falhaAntigaHaUmaHora, analiseAtual: analisePendenteOcr, agora })).toBe(true);
  });

  it('respeita o cooldown -- não reprocessa uma falha muito recente mesmo sem análise bem-sucedida', () => {
    const falhaRecente = { mensagem: 'erro', ocorrido_em: new Date('2026-09-02T11:58:00Z').toISOString() }; // 2 min atrás
    expect(deveReprocessarCartaoCnpjAutomaticamente({ falhaPersistida: falhaRecente, analiseAtual: null, agora, cooldownMinutos: 15 })).toBe(false);
  });
});
