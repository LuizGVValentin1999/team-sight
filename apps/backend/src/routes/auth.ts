import type { FastifyInstance } from 'fastify';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signAccessToken } from '../lib/jwt.js';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const parsedBody = loginBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados de login inválidos' });
    }

    const { email, password } = parsedBody.data;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.active) {
      return reply.status(401).send({ message: 'Credenciais inválidas' });
    }

    const isPasswordValid = await compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return reply.status(401).send({ message: 'Credenciais inválidas' });
    }

    const token = signAccessToken({
      sub: user.id,
      role: user.role
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  });
}
