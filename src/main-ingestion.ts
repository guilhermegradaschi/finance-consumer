import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IngestionRuntimeModule } from '@/ingestion/ingestion.module';

export async function bootstrapIngestion(): Promise<void> {
  const app = await NestFactory.createApplicationContext(IngestionRuntimeModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.enableShutdownHooks();

  await app.init();

  Logger.log('Ingestion runtime started', 'Bootstrap');
}

if (require.main === module) {
  bootstrapIngestion().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
