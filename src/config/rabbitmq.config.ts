import { registerAs } from '@nestjs/config';

export default registerAs('rabbitmq', () => ({
  host: process.env.RABBITMQ_HOST ?? 'localhost',
  port: parseInt(process.env.RABBITMQ_PORT ?? '5672', 10),
  username: process.env.RABBITMQ_USERNAME ?? 'nf_user',
  password: process.env.RABBITMQ_PASSWORD ?? 'nf_password',
  vhost: process.env.RABBITMQ_VHOST ?? 'nf_processor',
  prefetch: parseInt(process.env.RABBITMQ_PREFETCH ?? '10', 10),
}));
