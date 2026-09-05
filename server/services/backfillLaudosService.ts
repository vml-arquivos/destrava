import crypto from 'node:crypto';
import pkg from 'pg';
import { canonicalizeDocumentType, documentAnalysisConfig, DOCUMENT_TYPE_CATALOG } from '../../shared/documentTypes';
import { analisarCnpjReceitaCartaoEmpresa } from './analiseCnpjReceitaCartao';
import { analiseDocumentalService } from './analiseDocumentalEspecializada';
import {
  CLASSIFIER_VERSION,
  EXTRACTOR_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  calcularAssinaturaAnalise,
  versaoPromptDocumental,
} from './documentalLaudoVersioning';

const { Pool } = pkg;
const defaultPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export type BackfillJobStatus = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHOU';

export interface BackfillOptions {
  batchSize?: number;
  limit?: number;
  workerId?: string;
  dryRun?: boolean;
  retryFailed?: boolean;
  includeCompleted?: boolean;
}

export interface BackfillSummary {
  enqueued: number;
  skipped: number;
  processed: number;
  succeeded: number;
  failed: number;
  dryRun: boolean;
}

function intOption(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function workerId(value?: string): string {
  return String(value || process.env.BACKFILL_WORKER_ID || `backfill-${process.pid}-${crypto.randomBytes(4).toString('hex')}`).slice(0, 120);
}

function catalogPromptTypes(): string[] {
  return DOCUMENT_TYPE_CATALOG
    .filter((item) => Boolean(documentAnalysisConfig(item.tipo)))
    .map((item) => item.tipo);
}

function catalogPrompt(tipoDocumento: string): string {
  return documentAnalysisConfig(tipoDocumento)?.promptCodigo || `catalogo_${tipoDocumento}`;
}

function retryDelay(attempt: number): number {
  const bounded = Math.max(0, Math.min(8, attempt));
  return Math.min(60 * 60, 30 * 2 ** bounded);
}

export class BackfillLaudosService {
  constructor(private readonly db: any = defaultPool) {}

  async assertReady(): Promise<void> {
    const required = await this.db.query(
      `SELECT to_regclass('public.documentos_extracoes_ia') AS extracoes,
              to_regclass('public.documentos_backfill_jobs') AS jobs,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos_extracoes_ia' AND column_name='analysis_signature') AS versionado,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos_backfill_jobs' AND column_name='target_signature') AS fila_versionada,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos_backfill_jobs' AND column_name='target_engine_version') AS fila_motor_versionada`,
    );
    const row = required.rows[0] || {};
    if (!row.extracoes || !row.jobs || row.versionado !== true || row.fila_versionada !== true || row.fila_motor_versionada !== true) {
      throw new Error('Backfill P0 indisponível: aplique as migrations 103 e 104 antes de executar este comando.');
    }
  }

  async enqueue(options: BackfillOptions = {}): Promise<{ enqueued: number; skipped: number; dryRun: boolean }> {
    await this.assertReady();
    const batchSize = intOption(options.batchSize, 100, 1, 1000);
    const limit = intOption(options.limit, batchSize, 1, 100000);
    const tipos = catalogPromptTypes();
    const engineVersion = [CLASSIFIER_VERSION, EXTRACTOR_VERSION, RULE_VERSION, SCHEMA_VERSION].join(':');
    const result = await this.db.query(
      `SELECT d.id, d.empresa_id, d.tipo_documento, d.hash_arquivo
         FROM public.documentos_arquivos d
         LEFT JOIN public.documentos_catalogo c ON c.tipo_documento = d.tipo_documento
         LEFT JOIN public.documentos_backfill_jobs j
           ON j.documento_id = d.id
          AND j.prompt_codigo = COALESCE(c.prompt_codigo, 'catalogo_' || COALESCE(c.tipo_canonico, d.tipo_documento) || '_extract')
        WHERE d.excluido_em IS NULL
          AND COALESCE(d.status, 'ativo') <> 'excluido'
          AND d.tipo_documento = ANY($1::text[])
          AND (j.id IS NULL
            OR j.target_engine_version IS DISTINCT FROM $3
            OR ($4::boolean AND j.status = 'FALHOU')
            OR ($5::boolean AND j.status = 'CONCLUIDO'))
        ORDER BY d.criado_em NULLS FIRST, d.id
        LIMIT $2`,
      [tipos, limit, engineVersion, options.retryFailed === true, options.includeCompleted === true],
    );

    let enqueued = 0;
    if (options.dryRun) return { enqueued: result.rows.length, skipped: 0, dryRun: true };
    for (const row of result.rows) {
      const promptCodigo = catalogPrompt(String(row.tipo_documento));
      const promptVersion = versaoPromptDocumental(promptCodigo);
      const targetSignature = calcularAssinaturaAnalise({
        arquivoId: String(row.id),
        arquivoHash: row.hash_arquivo || null,
        promptCodigo,
        promptVersao: promptVersion,
        classifierVersion: CLASSIFIER_VERSION,
        extractorVersion: EXTRACTOR_VERSION,
        ruleVersion: RULE_VERSION,
        schemaVersion: SCHEMA_VERSION,
      });
      const inserted = await this.db.query(
        `INSERT INTO public.documentos_backfill_jobs
          (documento_id, empresa_id, prompt_codigo, prioridade, status, disponivel_em, target_signature, target_prompt_version, target_engine_version)
         VALUES ($1, $2, $3, 100, 'PENDENTE', NOW(), $4, $5, $6)
         ON CONFLICT (documento_id, prompt_codigo) DO UPDATE SET
           empresa_id = EXCLUDED.empresa_id,
           status = 'PENDENTE',
           disponivel_em = NOW(),
           bloqueado_em = NULL,
           bloqueado_por = NULL,
           concluido_em = NULL,
           ultimo_erro = NULL,
           tentativas = 0,
           target_signature = EXCLUDED.target_signature,
           target_prompt_version = EXCLUDED.target_prompt_version,
           target_engine_version = EXCLUDED.target_engine_version
         WHERE public.documentos_backfill_jobs.target_signature IS DISTINCT FROM EXCLUDED.target_signature
            OR public.documentos_backfill_jobs.target_engine_version IS DISTINCT FROM EXCLUDED.target_engine_version
            OR ($7::boolean AND public.documentos_backfill_jobs.status = 'FALHOU')
            OR ($8::boolean AND public.documentos_backfill_jobs.status = 'CONCLUIDO')
         RETURNING id`,
        [row.id, row.empresa_id || null, promptCodigo, targetSignature, promptVersion, engineVersion, options.retryFailed === true, options.includeCompleted === true],
      );
      if (inserted.rowCount) enqueued += 1;
    }
    return { enqueued, skipped: Math.max(0, result.rows.length - enqueued), dryRun: false };
  }

  async enqueueDocument(documento: { id: string; empresa_id?: string | null; tipo_documento: string; hash_arquivo?: string | null }): Promise<boolean> {
    await this.assertReady();
    const promptCodigo = catalogPrompt(String(documento.tipo_documento));
    const promptVersion = versaoPromptDocumental(promptCodigo);
    const engineVersion = [CLASSIFIER_VERSION, EXTRACTOR_VERSION, RULE_VERSION, SCHEMA_VERSION].join(':');
    const targetSignature = calcularAssinaturaAnalise({
      arquivoId: String(documento.id), arquivoHash: documento.hash_arquivo || null,
      promptCodigo, promptVersao: promptVersion, classifierVersion: CLASSIFIER_VERSION,
      extractorVersion: EXTRACTOR_VERSION, ruleVersion: RULE_VERSION, schemaVersion: SCHEMA_VERSION,
    });
    const result = await this.db.query(
      `INSERT INTO public.documentos_backfill_jobs
        (documento_id, empresa_id, prompt_codigo, prioridade, status, disponivel_em, target_signature, target_prompt_version, target_engine_version)
       VALUES ($1,$2,$3,50,'PENDENTE',NOW(),$4,$5,$6)
       ON CONFLICT (documento_id, prompt_codigo) DO UPDATE SET
         empresa_id=EXCLUDED.empresa_id, prioridade=LEAST(public.documentos_backfill_jobs.prioridade, EXCLUDED.prioridade),
         status='PENDENTE', disponivel_em=NOW(), bloqueado_em=NULL, bloqueado_por=NULL,
         concluido_em=NULL, ultimo_erro=NULL, target_signature=EXCLUDED.target_signature,
         target_prompt_version=EXCLUDED.target_prompt_version, target_engine_version=EXCLUDED.target_engine_version
       RETURNING id`,
      [documento.id, documento.empresa_id || null, promptCodigo, targetSignature, promptVersion, engineVersion],
    );
    return Boolean(result.rowCount);
  }

  async enqueueDueRetries(limitInput = 25): Promise<number> {
    await this.assertReady();
    const limit = intOption(limitInput, 25, 1, 200);
    const tipos = catalogPromptTypes();
    const { rows } = await this.db.query(
      `SELECT DISTINCT ON (d.id) d.id, d.empresa_id, d.tipo_documento, d.hash_arquivo
         FROM public.documentos_arquivos d
         LEFT JOIN public.documentos_extracoes_ia e ON e.arquivo_id=d.id
        WHERE d.excluido_em IS NULL
          AND COALESCE(d.status,'ativo') <> 'excluido'
          AND d.tipo_documento = ANY($1::text[])
          AND ((e.status='falhou' AND COALESCE(e.next_retry_at,NOW()) <= NOW() AND COALESCE(e.retry_count,0) < $2)
            OR d.resultado_validacao->>'analise_automatica_status'='falhou')
        ORDER BY d.id, e.atualizado_em DESC NULLS LAST
        LIMIT $3`,
      [tipos, intOption(process.env.DOCUMENT_ANALYSIS_MAX_RETRIES, 5, 1, 20), limit],
    );
    let enqueued = 0;
    for (const row of rows) if (await this.enqueueDocument(row)) enqueued += 1;
    return enqueued;
  }

  async claim(worker?: string): Promise<any | null> {
    const id = workerId(worker);
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE public.documentos_backfill_jobs
            SET status='PENDENTE', disponivel_em=NOW(), bloqueado_em=NULL, bloqueado_por=NULL
          WHERE status='PROCESSANDO' AND bloqueado_em < NOW() - INTERVAL '30 minutes'`,
      );
      const claimed = await client.query(
        `SELECT j.*, d.tipo_documento, d.hash_arquivo
           FROM public.documentos_backfill_jobs j
           JOIN public.documentos_arquivos d ON d.id = j.documento_id
          WHERE j.status = 'PENDENTE'
            AND j.disponivel_em <= NOW()
            AND d.excluido_em IS NULL
            AND COALESCE(d.status, 'ativo') <> 'excluido'
          ORDER BY j.prioridade ASC, j.disponivel_em ASC, j.criado_em ASC
          FOR UPDATE OF j SKIP LOCKED
          LIMIT 1`,
      );
      const job = claimed.rows[0];
      if (!job) {
        await client.query('COMMIT');
        return null;
      }
      const updated = await client.query(
        `UPDATE public.documentos_backfill_jobs
            SET status = 'PROCESSANDO', bloqueado_em = NOW(), bloqueado_por = $2,
                tentativas = COALESCE(tentativas, 0) + 1, ultimo_erro = NULL
          WHERE id = $1
          RETURNING *`,
        [job.id, id],
      );
      await client.query('COMMIT');
      return { ...job, ...updated.rows[0], worker_id: id };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureExtraction(job: any): Promise<{ extractionId: string; signature: string; promptVersion: string }> {
    const promptVersion = String(job.target_prompt_version || versaoPromptDocumental(job.prompt_codigo));
    const signature = calcularAssinaturaAnalise({
      arquivoId: String(job.documento_id),
      arquivoHash: job.hash_arquivo || null,
      promptCodigo: job.prompt_codigo,
      promptVersao: promptVersion,
      classifierVersion: CLASSIFIER_VERSION,
      extractorVersion: EXTRACTOR_VERSION,
      ruleVersion: RULE_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });
    if (job.target_signature && String(job.target_signature) !== signature) {
      throw new Error('Job de backfill obsoleto: a assinatura-alvo não corresponde à versão atual do documento. Reexecute enqueue.');
    }
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`backfill:${job.documento_id}:${job.prompt_codigo}`]);
      const existing = await client.query(
        `SELECT * FROM public.documentos_extracoes_ia
          WHERE arquivo_id = $1 AND prompt_codigo = $2
          ORDER BY criado_em DESC LIMIT 1`,
        [job.documento_id, job.prompt_codigo],
      );
      const current = existing.rows[0];
      if (current?.analysis_status === 'ATIVO' && current?.analysis_signature === signature && ['concluido', 'revisao_humana'].includes(String(current.status))) {
        await client.query(`UPDATE public.documentos_backfill_jobs SET status='CONCLUIDO', concluido_em=NOW(), ultimo_erro=NULL WHERE id=$1`, [job.id]);
        await client.query('COMMIT');
        return { extractionId: String(current.id), signature, promptVersion };
      }
      if (current?.id) {
        await client.query(
          `UPDATE public.documentos_extracoes_ia
              SET analysis_status = CASE WHEN status IN ('concluido','revisao_humana') THEN 'SUPERSEDED' ELSE 'REANALISE_NECESSARIA' END,
                  superseded_at = CASE WHEN status IN ('concluido','revisao_humana') THEN NOW() ELSE superseded_at END,
                  satisfaz_requisito = FALSE
            WHERE id = $1`,
          [current.id],
        );
      }
      const inserted = await client.query(
        `INSERT INTO public.documentos_extracoes_ia
          (arquivo_id, status, prompt_codigo, prompt_versao, resultado, campos_extraidos, pendencias, erros,
           analysis_signature, classifier_version, extractor_version, rule_version, schema_version,
           analysis_status, satisfaz_requisito)
         VALUES ($1, 'pendente', $2, $3, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
                 $4, $5, $6, $7, $8, 'REANALISE_NECESSARIA', FALSE)
         RETURNING id`,
        [job.documento_id, job.prompt_codigo, promptVersion, signature, CLASSIFIER_VERSION, EXTRACTOR_VERSION, RULE_VERSION, SCHEMA_VERSION],
      );
      await client.query('COMMIT');
      return { extractionId: String(inserted.rows[0].id), signature, promptVersion };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async processOne(job: any): Promise<{ ok: boolean; skipped?: boolean; extractionId?: string; error?: string }> {
    let extraction: { extractionId: string; signature: string; promptVersion: string } | null = null;
    try {
      // O Cartão CNPJ possui persistência e cruzamentos cadastrais próprios.
      // Reprocessá-lo pelo motor genérico criaria um segundo laudo divergente
      // e deixaria de atualizar situação, nome e contatos confirmados.
      if (canonicalizeDocumentType(job.tipo_documento) === 'cartao_cnpj') {
        const resultadoCnpj: any = await analisarCnpjReceitaCartaoEmpresa(
          String(job.empresa_id),
          null,
          String(job.documento_id),
        );
        if (!resultadoCnpj || ['pendente_ocr', 'falhou'].includes(String(resultadoCnpj.status || ''))) {
          throw new Error('Cartão CNPJ ainda sem leitura conclusiva; nova tentativa será agendada.');
        }
        await this.db.query(`UPDATE public.documentos_backfill_jobs SET status='CONCLUIDO', concluido_em=NOW(), ultimo_erro=NULL WHERE id=$1`, [job.id]);
        await this.db.query(
          `UPDATE public.documentos_arquivos
              SET resultado_validacao=COALESCE(resultado_validacao,'{}'::jsonb)||$2::jsonb, atualizado_em=NOW()
            WHERE id=$1`,
          [job.documento_id, JSON.stringify({ analise_automatica_status: resultadoCnpj.status, analise_automatica_processada_em: new Date().toISOString() })],
        ).catch(() => undefined);
        return { ok: true };
      }
      extraction = await this.ensureExtraction(job);
      const row = await this.db.query('SELECT status, analysis_status FROM public.documentos_extracoes_ia WHERE id = $1', [extraction.extractionId]);
      if (row.rows[0]?.analysis_status === 'ATIVO' && ['concluido', 'revisao_humana'].includes(String(row.rows[0]?.status || ''))) {
        return { ok: true, skipped: true, extractionId: extraction.extractionId };
      }
      const resultado: any = await analiseDocumentalService.analisarDocumentoAutomatico(
        String(job.empresa_id),
        String(job.documento_id),
        String(job.tipo_documento),
      );
      const satisfaz = resultado?.dados_extraidos?.satisfaz_requisito === true;
      await this.db.query(
        `UPDATE public.documentos_extracoes_ia
            SET status = $2,
                modelo = $3,
                campos_extraidos = $4::jsonb,
                resultado = $5::jsonb,
                nivel_confianca = $6,
                pendencias = $7::jsonb,
                erros = '[]'::jsonb,
                processado_em = NOW(),
                analysis_signature = $8,
                classifier_version = $9,
                extractor_version = $10,
                rule_version = $11,
                schema_version = $12,
                analysis_status = 'ATIVO',
                tipo_esperado = $13,
                tipo_detectado = $14,
                identidade_status = $15,
                temporalidade_status = $16,
                cobertura_status = $17,
                satisfaz_requisito = $18,
                stale_at = NULL,
                superseded_at = NULL,
                last_error_at = NULL,
                next_retry_at = NULL
          WHERE id = $1`,
        [
          extraction.extractionId,
          resultado.status,
          resultado.modelo_ia,
          JSON.stringify(resultado.dados_extraidos || {}),
          JSON.stringify(resultado),
          resultado.nivel_confianca,
          JSON.stringify(resultado.alertas || []),
          extraction.signature,
          CLASSIFIER_VERSION,
          EXTRACTOR_VERSION,
          RULE_VERSION,
          SCHEMA_VERSION,
          resultado.dados_extraidos?.tipo_esperado || job.tipo_documento,
          resultado.dados_extraidos?.tipo_detectado || null,
          resultado.dados_extraidos?.identidade_status || null,
          resultado.dados_extraidos?.temporalidade_status || null,
          resultado.dados_extraidos?.cobertura_status || null,
          satisfaz,
        ],
      );
      await this.db.query(`UPDATE public.documentos_backfill_jobs SET status='CONCLUIDO', concluido_em=NOW(), ultimo_erro=NULL WHERE id=$1`, [job.id]);
      await this.db.query(
        `UPDATE public.documentos_arquivos
            SET resultado_validacao=COALESCE(resultado_validacao,'{}'::jsonb)||$2::jsonb, atualizado_em=NOW()
          WHERE id=$1`,
        [job.documento_id, JSON.stringify({ analise_automatica_status: 'concluida', analise_automatica_processada_em: new Date().toISOString() })],
      ).catch(() => undefined);
      return { ok: true, extractionId: extraction.extractionId };
    } catch (error: any) {
      const message = String(error?.message || error).slice(0, 1200);
      const maxAttempts = intOption(process.env.BACKFILL_MAX_ATTEMPTS, 5, 1, 20);
      const attempts = Number(job.tentativas || 1);
      const terminal = attempts >= maxAttempts;
      await this.db.query(
        `UPDATE public.documentos_backfill_jobs
            SET status = $2,
                ultimo_erro = $3,
                disponivel_em = CASE WHEN $2 = 'PENDENTE' THEN NOW() + (($4)::text || ' seconds')::interval ELSE disponivel_em END
          WHERE id = $1`,
        [job.id, terminal ? 'FALHOU' : 'PENDENTE', message, retryDelay(attempts)],
      ).catch((updateError: any) => console.warn('[BackfillLaudos] falha ao atualizar job:', updateError?.message || updateError));
      if (extraction?.extractionId) {
        await this.db.query(
          `UPDATE public.documentos_extracoes_ia
              SET status='falhou', analysis_status='REANALISE_NECESSARIA', satisfaz_requisito=FALSE,
                  erros=$2::jsonb, last_error_at=NOW(), retry_count=COALESCE(retry_count,0)+1,
                  next_retry_at=CASE WHEN $3::boolean THEN NULL ELSE NOW() + (($4)::text || ' seconds')::interval END,
                  processado_em=NOW()
            WHERE id=$1`,
          [extraction.extractionId, JSON.stringify([{ codigo: 'backfill_falhou', mensagem: message }]), terminal, retryDelay(attempts)],
        ).catch(() => undefined);
      }
      return { ok: false, error: message };
    }
  }

  async run(options: BackfillOptions = {}): Promise<BackfillSummary> {
    await this.assertReady();
    const limit = intOption(options.limit, 100, 1, 100000);
    const summary: BackfillSummary = { enqueued: 0, skipped: 0, processed: 0, succeeded: 0, failed: 0, dryRun: options.dryRun === true };
    if (options.dryRun) return summary;
    for (let index = 0; index < limit; index += 1) {
      const job = await this.claim(options.workerId);
      if (!job) break;
      summary.processed += 1;
      const result = await this.processOne(job);
      if (result.ok) summary.succeeded += 1;
      else summary.failed += 1;
    }
    return summary;
  }

  async status(): Promise<any> {
    await this.assertReady();
    const { rows } = await this.db.query(
      `SELECT status, COUNT(*)::int AS quantidade,
              MIN(disponivel_em) AS proximo_disponivel,
              MAX(atualizado_em) AS ultimo_update
         FROM public.documentos_backfill_jobs
        GROUP BY status ORDER BY status`,
    );
    return rows;
  }
}

export const backfillLaudosService = new BackfillLaudosService();
