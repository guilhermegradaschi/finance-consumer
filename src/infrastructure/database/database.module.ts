import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'nf_user'),
        password: config.get<string>('DB_PASSWORD', 'nf_password'),
        database: config.get<string>('DB_DATABASE', 'nf_processor'),
        entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
        synchronize: false,
        migrationsRun: config.get<string>('NODE_ENV') !== 'test',
        logging: config.get<boolean>('DB_LOGGING', false),
        extra: {
          max: config.get<number>('DB_POOL_SIZE', 20),
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
