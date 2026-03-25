import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'nf_user',
  password: process.env.DB_PASSWORD ?? 'nf_password',
  database: process.env.DB_DATABASE ?? 'nf_processor',
  poolSize: parseInt(process.env.DB_POOL_SIZE ?? '20', 10),
}));
