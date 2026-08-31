import { backfillLaudosService } from '../server/services/backfillLaudosService';

function option(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const action = process.argv[2] || 'status';
  const limit = Number(option('limit', '100'));
  const batchSize = Number(option('batch-size', '100'));
  const common = {
    limit: Number.isFinite(limit) ? limit : 100,
    batchSize: Number.isFinite(batchSize) ? batchSize : 100,
    workerId: option('worker-id'),
    dryRun: hasFlag('dry-run'),
    includeCompleted: hasFlag('include-completed'),
  };

  if (action === 'status') {
    console.log(JSON.stringify(await backfillLaudosService.status(), null, 2));
    return;
  }
  if (action === 'enqueue') {
    console.log(JSON.stringify(await backfillLaudosService.enqueue(common), null, 2));
    return;
  }
  if (action === 'run') {
    console.log(JSON.stringify(await backfillLaudosService.run(common), null, 2));
    return;
  }
  if (action === 'enqueue-and-run') {
    const enqueued = await backfillLaudosService.enqueue(common);
    const processed = await backfillLaudosService.run(common);
    console.log(JSON.stringify({ enqueued, processed }, null, 2));
    return;
  }
  throw new Error(`Ação inválida: ${action}. Use status, enqueue, run ou enqueue-and-run.`);
}

main().catch((error) => {
  console.error('[backfill-laudos] erro:', error?.message || error);
  process.exitCode = 1;
});
