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

  // DARF de IRPJ não escreve o regime por extenso -- só o código de receita do
  // tributo pago denuncia o regime (Guia de Análise de Crédito Corporativo do
  // usuário: 2089/5993 = Lucro Presumido; 8998/3373 = Lucro Real). O DARF
  // reaproveita o mesmo pipeline do Enquadramento/Simples Nacional (ver
  // ANALISE_ESPECIALIZADA_POR_TIPO em documentacao.ts), então o leitor local
  // recebe tipo 'simples_nacional' também para DARF.
  describe('DARF de IRPJ: regime pelo código de receita', () => {
    it('código 2089 (Lucro Presumido)', () => {
      const texto = `
        DARF - DOCUMENTO DE ARRECADAÇÃO DE RECEITAS FEDERAIS
        CNPJ: 50.509.651/0001-80
        Período de Apuração: 31/12/2025
        Código de Receita: 2089 - IRPJ PJ Presumido
        Valor do Principal: 4.500,00
      `;
      expect(detectarRegimeTributarioDeclarado(texto).regime).toBe('Lucro Presumido');
      const lido = analisarTextoDocumentoLocal('simples_nacional', texto);
      expect(lido.dados.regime_tributario).toBe('Lucro Presumido');
      expect(lido.dados.documento_compativel).toBe(true);
    });

    it('código 5993 (Lucro Presumido)', () => {
      expect(detectarRegimeTributarioDeclarado('DARF -- Código de receita 5993').regime).toBe('Lucro Presumido');
    });

    it('código 8998 (Lucro Real)', () => {
      const texto = 'DARF -- Código de Receita: 8998 -- IRPJ Lucro Real Estimativa Mensal';
      expect(detectarRegimeTributarioDeclarado(texto).regime).toBe('Lucro Real');
      expect(analisarTextoDocumentoLocal('simples_nacional', texto).dados.regime_tributario).toBe('Lucro Real');
    });

    it('código 3373 (Lucro Real)', () => {
      expect(detectarRegimeTributarioDeclarado('Código de receita 3373').regime).toBe('Lucro Real');
    });

    it('código de receita desconhecido não vira regime nenhum (nunca inventa)', () => {
      expect(detectarRegimeTributarioDeclarado('DARF -- Código de Receita: 0220 -- IRRF').regime).toBeNull();
    });

    it('número parecido em outro lugar do documento (CEP, valor) não conta como código de receita', () => {
      // "2089" aparece aqui como parte de um CEP/valor, longe do rótulo
      // "código de receita" -- não pode ser lido como regime.
      const texto = 'Endereço: Rua Exemplo, CEP 70.2089-000 -- Valor total: R$ 2089,00';
      expect(detectarRegimeTributarioDeclarado(texto).regime).toBeNull();
    });

    it('texto por extenso e código de receita divergentes: ambíguo, não escolhe um dos dois', () => {
      const texto = 'FORMA DE TRIBUTAÇÃO: LUCRO REAL. DARF -- Código de Receita: 2089';
      const resultado = detectarRegimeTributarioDeclarado(texto);
      expect(resultado.ambiguo).toBe(true);
      expect(resultado.regime).toBeNull();
    });
  });
});
