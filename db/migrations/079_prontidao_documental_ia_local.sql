-- 079_prontidao_documental_ia_local.sql
-- Correção aditiva para o Dossiê de Crédito e prontidão documental.
-- 1) Compatibiliza a origem das análises de IA.
-- 2) Garante os três documentos iniciais e a etapa societária seguinte.
-- 3) Não altera nem remove documentos, empresas, sócios, contratos ou análises existentes.

DO $$
BEGIN
  IF to_regclass('public.documentacao_entidade_blocos') IS NOT NULL THEN
    ALTER TABLE public.documentacao_entidade_blocos
      DROP CONSTRAINT IF EXISTS documentacao_entidade_blocos_origem_chk;

    ALTER TABLE public.documentacao_entidade_blocos
      ADD CONSTRAINT documentacao_entidade_blocos_origem_chk CHECK (
        origem IN ('sistema','manual','receita','ia','documento_ia','migracao','sincronizacao')
      ) NOT VALID;

    ALTER TABLE public.documentacao_entidade_blocos
      VALIDATE CONSTRAINT documentacao_entidade_blocos_origem_chk;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.documentacao_blocos') IS NOT NULL THEN
    INSERT INTO public.documentacao_blocos
      (codigo, nome_amigavel, descricao, entidade_principal, obrigatorio, ordem, configuracao)
    VALUES
      ('enquadramento_tributario', 'Enquadramento Tributário / Simples Nacional',
       'Comprovante e validação do enquadramento tributário, opção pelo Simples Nacional e condição MEI.',
       'empresa', true, 3,
       '{"etapa":"identidade_cnpj","documento_inicial":true,"analise":"simples_nacional"}'::jsonb),
      ('contrato_social_alteracoes', 'Contrato Social e Alterações',
       'Contrato social vigente e alterações contratuais para conferência do NIRE e da data de registro.',
       'empresa', true, 4,
       '{"etapa":"documentacao_societaria","documento_inicial":false,"analise":"contrato_junta"}'::jsonb),
      ('atos_junta_comercial', 'Atos da Junta Comercial',
       'Certidão ou lista de arquivamentos para conferir NIRE e data de registro com o contrato/alteração social. O CNPJ é informativo.',
       'empresa', true, 5,
       '{"etapa":"documentacao_societaria","documento_inicial":false,"analise":"atos_junta_comercial"}'::jsonb)
    ON CONFLICT (codigo) DO UPDATE SET
      nome_amigavel = EXCLUDED.nome_amigavel,
      descricao = EXCLUDED.descricao,
      entidade_principal = EXCLUDED.entidade_principal,
      obrigatorio = EXCLUDED.obrigatorio,
      ordem = EXCLUDED.ordem,
      ativo = true,
      configuracao = COALESCE(public.documentacao_blocos.configuracao, '{}'::jsonb) || EXCLUDED.configuracao;
  END IF;
END $$;
