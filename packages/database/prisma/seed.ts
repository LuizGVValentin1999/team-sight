import { hash } from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const currentTeamMembers = [
  {
    name: 'Luiz Gustavo Valter Valentin',
    email: 'luiz.valentin@allstrategy.com.br',
    role: 'TECH_LEAD',
    seniority: 'STAFF'
  },
  {
    name: 'Brayon Oliveira',
    email: 'brayon.oliveira@allstrategy.com.br',
    role: 'DEV',
    seniority: 'MID'
  },
  {
    name: 'Erick Farias',
    email: 'erick.farias@allstrategy.com.br',
    role: 'DEV',
    seniority: 'JUNIOR'
  },
  {
    name: 'Francisco Arruda',
    email: 'francisco.arruda@allstrategy.com.br',
    role: 'DEV',
    seniority: 'MID'
  },
  {
    name: 'Heber Paim',
    email: 'heber.paim@allstrategy.com.br',
    role: 'DEV',
    seniority: 'MID'
  },
  {
    name: 'Lucas Alves',
    email: 'lucas.alves@allstrategy.com.br',
    role: 'DEV',
    seniority: 'JUNIOR'
  },
  {
    name: 'Leonardo Dalmolin',
    email: 'leonardo.dalmolin@allstrategy.com.br',
    role: 'DEV',
    seniority: 'JUNIOR'
  },
  {
    name: 'Mauricio Guimaraes',
    email: 'mauricio.guimaraes@allstrategy.com.br',
    role: 'DEV',
    seniority: 'MID'
  },
  {
    name: 'Tiago Alcantara',
    email: 'tiago.alcantara@allstrategy.com.br',
    role: 'DEV',
    seniority: 'JUNIOR'
  },
  {
    name: 'Cristiano Mothe',
    email: 'cristiano.mothe@allstrategy.com.br',
    role: 'QA',
    seniority: 'JUNIOR'
  },
  {
    name: 'Thaliane Silva',
    email: 'thaliane.silva@allstrategy.com.br',
    role: 'QA',
    seniority: 'JUNIOR'
  },
  {
    name: 'Igo Bezerra',
    email: 'igo.bezerra@allstrategy.com.br',
    role: 'QA',
    seniority: 'MID'
  },
  {
    name: 'Jenifer Kosloski',
    email: 'jenifer.kosloski@allstrategy.com.br',
    role: 'BA',
    seniority: 'JUNIOR'
  },
  {
    name: 'Douglas Gomes',
    email: 'douglas.gomes@allstrategy.com.br',
    role: 'QA',
    seniority: 'MID'
  },
  {
    name: 'Alexandre Valesko',
    email: 'alexandre.valesko@allstrategy.com.br',
    role: 'QA_LEAD',
    seniority: 'STAFF'
  },
  {
    name: 'Gabrielle Melo',
    email: 'gabrielle.melo@allstrategy.com.br',
    role: 'UX',
    seniority: 'JUNIOR'
  },
  {
    name: 'Leticia Alonso',
    email: 'leticia.alonso@allstrategy.com.br',
    role: 'PO',
    seniority: 'JUNIOR'
  }
] as const;

async function main() {
  const defaultTeam = await prisma.team.upsert({
    where: { id: 'team-allstrategy' },
    update: {
      name: 'Time AllStrategy'
    },
    create: {
      id: 'team-allstrategy',
      name: 'Time AllStrategy'
    }
  });

  const defaultPasswordHash = await hash('123456', 10);
  const ownerPasswordHash = await hash('123456789', 10);

  for (const member of currentTeamMembers) {
    const memberPasswordHash =
      member.email === 'luiz.valentin@allstrategy.com.br' ? ownerPasswordHash : defaultPasswordHash;

    await prisma.user.upsert({
      where: { email: member.email },
      update: {
        name: member.name,
        role: member.role,
        seniority: member.seniority,
        passwordHash: memberPasswordHash,
        active: true,
        teamId: defaultTeam.id
      },
      create: {
        name: member.name,
        email: member.email,
        passwordHash: memberPasswordHash,
        role: member.role,
        seniority: member.seniority,
        hiredAt: new Date('2024-01-01T00:00:00.000Z'),
        teamId: defaultTeam.id,
        active: true
      }
    });
  }

  console.log('Seed finalizado com equipe padrão.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
