import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { ApiModule } from '@/api/api.module';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';

export async function bootstrapApi(): Promise<void> {
  const app = await NestFactory.create(ApiModule);

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  app.enableCors();
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NF-e Processor API')
    .setDescription('API for processing Brazilian electronic invoices (NF-e)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Application running on port ${port}`, 'Bootstrap');
  Logger.log(`Swagger docs available at http://localhost:${port}/api/docs`, 'Bootstrap');
}

if (require.main === module) {
  bootstrapApi().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
