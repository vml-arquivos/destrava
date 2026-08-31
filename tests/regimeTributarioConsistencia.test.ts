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
  // tributo pago denuncia o regime. O DARF reaproveita o mesmo pipeline do
  // Enquadramento/Simples Nacional (ver ANALISE_ESPECIALIZADA_POR_TIPO em
  // documentacao.ts), então o leitor local recebe tipo 'simples_nacional'
  // também para DARF.
  //
  // CORREÇÃO (2026-08-30, bug P0): até esta correção, o código 5993 era
  // tratado como Lucro Presumido. É, na verdade, "IRPJ - Lucro Real -
  // Estimativa Mensal", e o código 5625 ("IRPJ - Lucro Arbitrado") não existia
  // no catálogo. Classificar 5993 como Presumido fazia o motor pedir a
  // trilha documental errada (ECF/DCTF de Presumido em vez de Real) para uma
  // empresa em Lucro Real -- exatamente o tipo de erro que muda a conclusão
  // da análise de crédito. Catálogo corrigido em extracaoDocumentalLocal.ts
  // (CATALOGO_CODIGO_RECEITA_DARF_IRPJ). O teste abaixo antes afirmava
  // 5993 -> Lucro Presumido; passou a afirmar o valor correto, Lucro Real.
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

    it('código 5993 (Lucro Real -- estimativa mensal, corrigido do bug P0 que classificava como Presumido)', () => {
      const texto = 'DARF -- Código de receita 5993';
      expect(detectarRegimeTributarioDeclarado(texto).regime).toBe('Lucro Real');
      expect(analisarTextoDocumentoLocal('simples_nacional', texto).dados.regime_tributario).toBe('Lucro Real');
    });

    it('código 5625 (Lucro Arbitrado -- ausente do catálogo antes da correção P0)', () => {
      const texto = 'DARF -- Código de Receita: 5625 -- IRPJ Lucro Arbitrado';
      expect(detectarRegimeTributarioDeclarado(texto).regime).toBe('Lucro Arbitrado');
      expect(analisarTextoDocumentoLocal('simples_nacional', texto).dados.regime_tributario).toBe('Lucro Arbitrado');
    });

    // CORREÇÃO (2026-08-30, reversão de decisão anterior -- auditoria
    // independente): este teste antes afirmava que o código 8998 confirmava
    // "Lucro Real". O código 8998 NÃO está confirmado na tabela oficial de
    // códigos de receita da RFB para IRPJ -- manter esse mapeamento "por
    // compatibilidade" foi um erro, porque inferir um regime a partir de um
    // código não confirmado é pior do que deixar o regime pendente (o regime
    // errado puxa a lista errada de documentação exigida adiante). Agora o
    // sistema nunca infere regime a partir de 8998 sozinho e sinaliza
    // explicitamente para revisão humana.
    it('código 8998 NÃO infere Lucro Real automaticamente -- fica sinalizado para revisão humana (reversão do bug P0)', () => {
      const texto = 'DARF -- Código de Receita: 8998 -- Período de apuração 03/2026';
      const detectado = detectarRegimeTributarioDeclarado(texto);
      expect(detectado.regime).toBeNull();
      expect(detectado.codigoReceitaNaoConfirmado).toBe('8998');
      const lido = analisarTextoDocumentoLocal('simples_nacional', texto);
      expect(lido.dados.regime_tributario).toBeNull();
      expect(lido.dados.codigo_receita_darf_nao_confirmado).toBe('8998');
      expect(lido.dados.revisao_humana_necessaria).toBe(true);
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
