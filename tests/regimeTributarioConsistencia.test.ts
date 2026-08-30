import { describe, expect, it } from 'vitest';
import { analisarTextoDocumentoLocal, detectarRegimeTributarioDeclarado } from '../server/services/extracaoDocumentalLocal';
import { normalizarDadosSimples } from '../server/services/analiseDocumentalEspecializada';

/**
 * O regime tributário define QUAL documentação será exigida da empresa
 * (Simples pede PGDAS/DEFIS; Presumido e Real pedem ECF/ECD/DCTF, com
 * exigências diferentes entre si). Por isso o regime precisa ser consistente
 * nas DUAS camadas que o produzem -- o leitor local e o normalizador que
 * consolida leitura local e IA. Um defeito só na segunda camada já é
 * suficiente para a tela afirmar um enquadramento que o documento nunca deu.
 */
describe('consistência do regime tributário entre as camadas de leitura', () => {
  const consultaNaoOptante = `
    CONSULTA OPTANTES
    CNPJ: 50.509.651/0001-80
    Situação no Simples Nacional: Não optante pelo Simples Nacional
    Situação no SIMEI: NÃO enquadrado no SIMEI
  `;

  it('"Não Optante" não vira regime em nenhuma das camadas', () => {
    const lido = analisarTextoDocumentoLocal('simples_nacional', consultaNaoOptante);
    expect(lido.dados.regime_tributario).toBeNull();
    expect(lido.dados.situacao_simples).toBe('Não Optante');

    // Antes desta correção o normalizador reescrevia o regime de volta para
    // "Não Optante", desfazendo a leitura correta do parser.
    const normalizado = normalizarDadosSimples(lido.dados);
    expect(normalizado.regime_tributario).toBeNull();
    expect(normalizado.situacao_simples).toBe('Não Optante');
  });

  it('"Excluído" do Simples também não vira regime', () => {
    const normalizado = normalizarDadosSimples({ situacao_simples: 'Excluído' });
    expect(normalizado.regime_tributario).toBeNull();
  });

  it('regime realmente declarado atravessa as duas camadas', () => {
    const lido = analisarTextoDocumentoLocal('simples_nacional', `
      COMPROVANTE DE ENQUADRAMENTO
      CNPJ: 50.509.651/0001-80
      Situação no Simples Nacional: Não optante pelo Simples Nacional
      Regime de apuração: LUCRO PRESUMIDO
    `);
    expect(lido.dados.regime_tributario).toBe('Lucro Presumido');
    expect(normalizarDadosSimples(lido.dados).regime_tributario).toBe('Lucro Presumido');
  });

  it('optante do Simples e MEI continuam sendo preenchidos', () => {
    expect(normalizarDadosSimples({ situacao_simples: 'Optante' }).regime_tributario).toBe('Simples Nacional');
    expect(normalizarDadosSimples({ opcao_mei: true }).regime_tributario).toBe('MEI / SIMEI');
  });

  it('regime vindo da IA é preservado tal como declarado', () => {
    expect(normalizarDadosSimples({ regime_tributario: 'Lucro Real', situacao_simples: 'Não Optante' }).regime_tributario).toBe('Lucro Real');
  });

  it('leitor de regime é o mesmo para qualquer documento fiscal', () => {
    expect(detectarRegimeTributarioDeclarado('FORMA DE TRIBUTAÇÃO: LUCRO REAL').regime).toBe('Lucro Real');
    expect(detectarRegimeTributarioDeclarado('Não optante pelo Simples Nacional').regime).toBeNull();
  });
});
