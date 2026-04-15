import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

const squadIdParamsSchema = z.object({
  id: z.string().min(1)
});

const createSquadSchema = z.object({
  name: z.string().trim().min(2).max(80)
});

const updateSquadSchema = z.object({
  name: z.string().trim().min(2).max(80)
});

const assignPersonSchema = z.object({
  personId: z.string().min(1),
  squadId: z.string().min(1).nullable().optional()
});

const personSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  seniority: true,
  avatarUrl: true,
  active: true,
  teamId: true
} as const;

async function fetchBoardData() {
  const [squads, unassigned] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: { active: true },
          orderBy: [{ name: 'asc' }],
          select: personSelect
        }
      }
    }),
    prisma.user.findMany({
      where: {
        active: true,
        teamId: null
      },
      orderBy: [{ name: 'asc' }],
      select: personSelect
    })
  ]);

  return {
    squads: squads.map((squad) => ({
      id: squad.id,
      name: squad.name,
      createdAt: squad.createdAt,
      updatedAt: squad.updatedAt,
      members: squad.users
    })),
    unassigned
  };
}

export async function squadsRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const board = await fetchBoardData();
    return reply.send(board);
  });

  app.post('/', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedBody = createSquadSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para criar squad.' });
    }

    const squad = await prisma.team.create({
      data: {
        name: parsedBody.data.name.trim()
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return reply.status(201).send({ squad });
  });

  app.patch('/:id', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = squadIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Squad inválida.' });
    }

    const parsedBody = updateSquadSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para editar squad.' });
    }

    const squadExists = await prisma.team.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true }
    });

    if (!squadExists) {
      return reply.status(404).send({ message: 'Squad não encontrada.' });
    }

    const squad = await prisma.team.update({
      where: { id: parsedParams.data.id },
      data: {
        name: parsedBody.data.name.trim()
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return reply.send({ squad });
  });

  app.delete('/:id', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = squadIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Squad inválida.' });
    }

    const squadExists = await prisma.team.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true }
    });

    if (!squadExists) {
      return reply.status(404).send({ message: 'Squad não encontrada.' });
    }

    await prisma.$transaction([
      prisma.user.updateMany({
        where: { teamId: parsedParams.data.id },
        data: { teamId: null }
      }),
      prisma.team.delete({
        where: { id: parsedParams.data.id }
      })
    ]);

    return reply.send({ success: true });
  });

  app.post('/assign', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedBody = assignPersonSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para mover pessoa.' });
    }

    const { personId, squadId } = parsedBody.data;

    const person = await prisma.user.findUnique({
      where: { id: personId },
      select: { id: true, active: true }
    });

    if (!person || !person.active) {
      return reply.status(404).send({ message: 'Pessoa não encontrada.' });
    }

    if (squadId) {
      const squadExists = await prisma.team.findUnique({
        where: { id: squadId },
        select: { id: true }
      });

      if (!squadExists) {
        return reply.status(404).send({ message: 'Squad de destino não encontrada.' });
      }
    }

    await prisma.user.update({
      where: { id: personId },
      data: {
        teamId: squadId ?? null
      }
    });

    return reply.send({
      personId,
      squadId: squadId ?? null
    });
  });
}
