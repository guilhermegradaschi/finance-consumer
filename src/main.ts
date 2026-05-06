import { bootstrapApi } from '@/main-api';
import { bootstrapIngestion } from '@/main-ingestion';

type AppRuntime = 'api' | 'ingestion';

function getRuntime(): AppRuntime {
  const raw = (process.env.APP_RUNTIME ?? 'api').trim().toLowerCase();
  if (raw === 'ingestion') return 'ingestion';
  return 'api';
}

async function bootstrap(): Promise<void> {
  const runtime = getRuntime();
  if (runtime === 'ingestion') {
    await bootstrapIngestion();
    return;
  }
  await bootstrapApi();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
