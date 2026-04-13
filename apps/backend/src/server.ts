import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { authRoutes } from './routes/auth.js';
import { peopleRoutes } from './routes/people.js';

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000'
});

app.get('/health', async () => {
  return { status: 'ok' };
});

await app.register(authRoutes, {
  prefix: '/auth'
});

await app.register(peopleRoutes, {
  prefix: '/people'
});

const port = Number(process.env.PORT ?? 3333);

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
