import type { FastifyInstance } from 'fastify';
import { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

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

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role
      },
      process.env.JWT_SECRET ?? 'teamsight-dev-secret',
      { expiresIn: '8h' }
    );

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
