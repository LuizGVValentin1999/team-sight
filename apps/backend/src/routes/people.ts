import type { FastifyInstance } from 'fastify';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

const userRoleValues = ['DEV', 'QA', 'PO', 'UX', 'MANAGER'] as const;
const seniorityValues = ['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'STAFF'] as const;

const createPersonSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(userRoleValues),
  seniority: z.enum(seniorityValues),
  hiredAt: z.string().datetime().optional(),
  active: z.boolean().optional()
});

export async function peopleRoutes(app: FastifyInstance) {
  app.get('/metadata', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    return reply.send({
      roles: userRoleValues,
      seniorities: seniorityValues
    });
  });

  app.get('/', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const people = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        seniority: true,
        hiredAt: true,
        active: true,
        createdAt: true
      }
    });

    return reply.send({ people });
  });

  app.post('/', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedBody = createPersonSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para cadastro' });
    }

    const { name, email, role, seniority, hiredAt, active } = parsedBody.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return reply.status(409).send({ message: 'Já existe pessoa cadastrada com este e-mail' });
    }

    const defaultPasswordHash = await hash('123456', 10);

    const person = await prisma.user.create({
      data: {
        name,
        email,
        role,
        seniority,
        hiredAt: hiredAt ? new Date(hiredAt) : new Date(),
        active: active ?? true,
        passwordHash: defaultPasswordHash
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        seniority: true,
        hiredAt: true,
        active: true,
        createdAt: true
      }
    });

    return reply.status(201).send({ person });
  });
}
