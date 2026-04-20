import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { normalizeText } from '../lib/jira-common.js';
import { getBrazilAndCuritibaHolidays } from '../lib/business-calendar.js';

const currentYear = new Date().getFullYear();

const overviewQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).default(currentYear),
  personId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(120).optional()
});

const vacationParamsSchema = z.object({
  vacationId: z.string().trim().min(1)
});

const vacationBodySchema = z
  .object({
    userId: z.string().trim().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    description: z.string().trim().max(500).optional()
  })
  .refine((value) => value.endDate.getTime() >= value.startDate.getTime(), {
    message: 'Data final deve ser maior ou igual à data inicial.'
  });

function normalizeDescription(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function startOfDay(date: Date) {
  const normalized = new Date(date.getTime());
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function endOfDay(date: Date) {
  const normalized = new Date(date.getTime());
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

export async function calendarRoutes(app: FastifyInstance) {
  app.get('/overview', async (request, reply) => {
    const authUser = requireAuth(request, reply);

    if (!authUser) {
      return;
    }

    const parsedQuery = overviewQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      return reply.status(400).send({ message: 'Parâmetros inválidos para calendário.' });
    }

    const { year, personId, search } = parsedQuery.data;
    const periodStart = new Date(year, 0, 1, 0, 0, 0, 0);
    const periodEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const periodStartMs = periodStart.getTime();
    const periodEndMs = periodEnd.getTime();

    const [people, vacations] = await Promise.all([
      prisma.user.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          seniority: true,
          avatarUrl: true,
          active: true
        }
      }),
      prisma.teamVacation.findMany({
        where: {
          ...(personId ? { userId: personId } : {}),
          user: {
            active: true
          }
        },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          userId: true,
          startDate: true,
          endDate: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              seniority: true,
              avatarUrl: true
            }
          }
        }
      })
    ]);

    const searchNormalized = normalizeText(search ?? '');
    const vacationsInYear = vacations.filter((vacation) => {
      const startMs = new Date(vacation.startDate).getTime();
      const endMs = new Date(vacation.endDate).getTime();

      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return false;
      }

      return startMs <= periodEndMs && endMs >= periodStartMs;
    });

    const filteredVacations =
      searchNormalized.length === 0
        ? vacationsInYear
        : vacationsInYear.filter((vacation) => {
            const userNameNormalized = normalizeText(vacation.user.name);
            return userNameNormalized.includes(searchNormalized);
          });

    const holidays = await getBrazilAndCuritibaHolidays(year);

    return reply.send({
      year,
      holidays,
      people,
      vacations: filteredVacations
    });
  });

  app.post('/vacations', async (request, reply) => {
    const authUser = requireAuth(request, reply);

    if (!authUser) {
      return;
    }

    const parsedBody = vacationBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para cadastrar férias.' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: parsedBody.data.userId },
      select: { id: true, active: true }
    });

    if (!existingUser || !existingUser.active) {
      return reply.status(404).send({ message: 'Pessoa não encontrada para vincular férias.' });
    }

    const vacation = await prisma.teamVacation.create({
      data: {
        userId: parsedBody.data.userId,
        startDate: startOfDay(parsedBody.data.startDate),
        endDate: endOfDay(parsedBody.data.endDate),
        description: normalizeDescription(parsedBody.data.description)
      },
      select: {
        id: true,
        userId: true,
        startDate: true,
        endDate: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            seniority: true,
            avatarUrl: true
          }
        }
      }
    });

    return reply.status(201).send({ vacation });
  });

  app.patch('/vacations/:vacationId', async (request, reply) => {
    const authUser = requireAuth(request, reply);

    if (!authUser) {
      return;
    }

    const parsedParams = vacationParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Férias inválidas.' });
    }

    const parsedBody = vacationBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para editar férias.' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: parsedBody.data.userId },
      select: { id: true, active: true }
    });

    if (!existingUser || !existingUser.active) {
      return reply.status(404).send({ message: 'Pessoa não encontrada para vincular férias.' });
    }

    const updated = await prisma.teamVacation.updateMany({
      where: { id: parsedParams.data.vacationId },
      data: {
        userId: parsedBody.data.userId,
        startDate: startOfDay(parsedBody.data.startDate),
        endDate: endOfDay(parsedBody.data.endDate),
        description: normalizeDescription(parsedBody.data.description)
      }
    });

    if (updated.count === 0) {
      return reply.status(404).send({ message: 'Registro de férias não encontrado.' });
    }

    const vacation = await prisma.teamVacation.findUnique({
      where: { id: parsedParams.data.vacationId },
      select: {
        id: true,
        userId: true,
        startDate: true,
        endDate: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            seniority: true,
            avatarUrl: true
          }
        }
      }
    });

    return reply.send({ vacation });
  });

  app.delete('/vacations/:vacationId', async (request, reply) => {
    const authUser = requireAuth(request, reply);

    if (!authUser) {
      return;
    }

    const parsedParams = vacationParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Férias inválidas.' });
    }

    const deleted = await prisma.teamVacation.deleteMany({
      where: { id: parsedParams.data.vacationId }
    });

    if (deleted.count === 0) {
      return reply.status(404).send({ message: 'Registro de férias não encontrado.' });
    }

    return reply.status(204).send();
  });
}
