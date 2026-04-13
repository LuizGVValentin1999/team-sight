import { hash } from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const defaultTeam = await prisma.team.upsert({
    where: { id: 'team-core' },
    update: {},
    create: {
      id: 'team-core',
      name: 'Team Core'
    }
  });

  const passwordHash = await hash('123456', 10);

  await prisma.user.upsert({
    where: { email: 'admin@teamsight.local' },
    update: {
      passwordHash,
      active: true
    },
    create: {
      name: 'Admin TeamSight',
      email: 'admin@teamsight.local',
      passwordHash,
      role: 'MANAGER',
      seniority: 'SENIOR',
      hiredAt: new Date('2024-01-01T00:00:00.000Z'),
      teamId: defaultTeam.id,
      jiraUserKey: 'admin.jira',
      gitUsername: 'admin-git',
      active: true
    }
  });

  console.log('Seed finalizado: admin@teamsight.local / 123456');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
