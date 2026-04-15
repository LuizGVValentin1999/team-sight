import type { FastifyInstance } from 'fastify';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

const userRoleValues = ['DEV', 'QA', 'BA', 'PO', 'UX', 'TECH_LEAD', 'QA_LEAD', 'MANAGER'] as const;
const seniorityValues = ['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'STAFF'] as const;
const rolesWithoutSeniority = new Set<(typeof userRoleValues)[number]>([
  'PO',
  'BA',
  'TECH_LEAD',
  'QA_LEAD'
]);
const integrationLinkSchema = z.string().trim().max(512);
const maxAvatarDataUrlLength = 900_000;
const avatarUrlSchema = z
  .string()
  .trim()
  .max(maxAvatarDataUrlLength)
  .refine(
    (value) => value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image/'),
    'Avatar inválido'
  );

const createPersonSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(userRoleValues),
  seniority: z.enum(seniorityValues),
  jiraUserKey: z.union([integrationLinkSchema, z.literal('')]).optional(),
  gitUsername: z.union([integrationLinkSchema, z.literal('')]).optional(),
  avatarUrl: z.union([avatarUrlSchema, z.literal('')]).optional(),
  hiredAt: z.string().datetime().optional(),
  active: z.boolean().optional()
});

const updatePersonParamsSchema = z.object({
  id: z.string().min(1)
});

const updatePersonSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(userRoleValues),
  seniority: z.enum(seniorityValues),
  jiraUserKey: z.union([integrationLinkSchema, z.literal('')]).optional(),
  gitUsername: z.union([integrationLinkSchema, z.literal('')]).optional(),
  avatarUrl: z.union([avatarUrlSchema, z.literal('')]).optional(),
  active: z.boolean()
});

const autoLinkIntegrationsSchema = z.object({
  githubOrgUrl: z.string().trim().min(1)
});

type JiraConfig = {
  baseUrl: string;
  authHeader: string;
};

type GithubConfig = {
  apiBaseUrl: string;
  token: string;
};

function getJiraConfig(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL?.trim();
  const email = process.env.JIRA_EMAIL?.trim();
  const apiToken = process.env.JIRA_API_TOKEN?.trim();

  if (!baseUrl || !email || !apiToken) {
    return null;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

  return {
    baseUrl: normalizedBaseUrl,
    authHeader
  };
}

function getGithubConfig(): GithubConfig | null {
  const token = process.env.GITHUB_TOKEN?.trim();

  if (!token) {
    return null;
  }

  const apiBaseUrl = (process.env.GITHUB_API_BASE_URL?.trim() || 'https://api.github.com').replace(
    /\/+$/,
    ''
  );

  return {
    apiBaseUrl,
    token
  };
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSeniorityForRole(
  role: (typeof userRoleValues)[number],
  seniority: (typeof seniorityValues)[number]
) {
  if (rolesWithoutSeniority.has(role)) {
    return 'STAFF' as const;
  }

  return seniority;
}

function extractGithubOrg(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const isOrgName = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(trimmed);

  if (isOrgName) {
    return trimmed;
  }

  try {
    const withProtocol =
      trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);

    if (!/github\.com$/i.test(parsed.hostname)) {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);

    if (parts.length === 0) {
      return null;
    }

    if (parts[0]?.toLowerCase() === 'orgs' && parts[1]) {
      return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(parts[1]) ? parts[1] : null;
    }

    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(parts[0]) ? parts[0] : null;
  } catch {
    return null;
  }
}

function extractJiraAccountId(raw: string | null) {
  if (!raw) {
    return null;
  }

  const direct = raw.replace(/[?#].*$/, '').trim();

  if (/^[a-zA-Z0-9:_-]{6,}$/.test(direct)) {
    return direct;
  }

  try {
    const withProtocol = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    const fromQuery = parsed.searchParams.get('accountId')?.trim();

    if (fromQuery && /^[a-zA-Z0-9:_-]{6,}$/.test(fromQuery)) {
      return fromQuery;
    }
  } catch {
    // ignora parse inválido e tenta fallback textual abaixo
  }

  const peopleIndex = raw.indexOf('/people/');

  if (peopleIndex > 0) {
    const afterPeople = raw.slice(peopleIndex + '/people/'.length);
    const afterCandidate = afterPeople.split(/[/?#]/).filter(Boolean)[0]?.trim() ?? null;

    if (afterCandidate && /^[a-zA-Z0-9:_-]{6,}$/.test(afterCandidate)) {
      return afterCandidate;
    }

    const beforePeople = raw.slice(0, peopleIndex);
    const candidate = beforePeople.split('/').filter(Boolean).at(-1)?.trim() ?? null;

    if (candidate && /^[a-zA-Z0-9:_-]{6,}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function fetchJiraUserByAccountId(config: JiraConfig, accountId: string) {
  const response = await fetch(
    `${config.baseUrl}/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: config.authHeader
      }
    }
  );

  if (response.status === 404 || response.status === 400) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    accountId?: string;
    avatarUrls?: Record<string, string>;
  };

  return {
    accountId: data.accountId ?? accountId,
    avatarUrl:
      data.avatarUrls?.['48x48'] ??
      data.avatarUrls?.['32x32'] ??
      data.avatarUrls?.['24x24'] ??
      data.avatarUrls?.['16x16'] ??
      null
  };
}

type JiraSearchUser = {
  accountId?: string;
  emailAddress?: string;
  avatarUrls?: Record<string, string>;
};

async function searchJiraUsers(config: JiraConfig, query: string) {
  const response = await fetch(
    `${config.baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=20`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: config.authHeader
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as JiraSearchUser[];
  return Array.isArray(data) ? data : [];
}

function pickBestUserByEmail(users: JiraSearchUser[], email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const exact = users.find(
    (user) => user.accountId && user.emailAddress?.trim().toLowerCase() === normalizedEmail
  );

  if (exact) {
    return {
      accountId: exact.accountId as string,
      avatarUrl:
        exact.avatarUrls?.['48x48'] ??
        exact.avatarUrls?.['32x32'] ??
        exact.avatarUrls?.['24x24'] ??
        exact.avatarUrls?.['16x16'] ??
        null
    };
  }

  if (users.length === 1 && users[0]?.accountId) {
    const single = users[0];
    return {
      accountId: single.accountId,
      avatarUrl:
        single.avatarUrls?.['48x48'] ??
        single.avatarUrls?.['32x32'] ??
        single.avatarUrls?.['24x24'] ??
        single.avatarUrls?.['16x16'] ??
        null
    };
  }

  return null;
}

async function githubRequest<T>(
  config: GithubConfig,
  path: string,
  options?: {
    accept?: string;
  }
) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: options?.accept ?? 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

type GithubUserSearchResult = {
  total_count: number;
  items: Array<{
    login: string;
  }>;
};

type GithubCommitSearchResult = {
  total_count: number;
  items: Array<{
    author?: {
      login?: string;
    } | null;
  }>;
};

async function findGithubUsernameByEmail(
  config: GithubConfig,
  org: string,
  email: string
) {
  const searchQuery = encodeURIComponent(`${email} in:email org:${org}`);

  try {
    const searchResult = await githubRequest<GithubUserSearchResult>(
      config,
      `/search/users?q=${searchQuery}&per_page=1`
    );

    if (searchResult.total_count > 0 && searchResult.items[0]?.login) {
      return searchResult.items[0].login;
    }
  } catch {
    // Fallback para busca por commits quando busca por e-mail não retorna resultado
  }

  try {
    const commitQuery = encodeURIComponent(`author-email:${email} org:${org}`);
    const commitSearch = await githubRequest<GithubCommitSearchResult>(
      config,
      `/search/commits?q=${commitQuery}&per_page=1`,
      {
        // Compatibilidade com endpoint de commit search.
        accept: 'application/vnd.github.cloak-preview+json'
      }
    );

    const login = commitSearch.items[0]?.author?.login?.trim();

    if (login) {
      return login;
    }
  } catch {
    // sem login por commits, segue para null
  }

  return null;
}

async function fetchJiraAvatarAsDataUrl(config: JiraConfig, avatarUrl: string | null) {
  if (!avatarUrl) {
    return null;
  }

  const response = await fetch(avatarUrl, {
    headers: {
      Authorization: config.authHeader
    }
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type')?.trim() || 'image/png';

  if (!contentType.startsWith('image/')) {
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const dataUrl = `data:${contentType};base64,${bytes.toString('base64')}`;

  if (dataUrl.length > maxAvatarDataUrlLength) {
    return null;
  }

  return dataUrl;
}

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
        jiraUserKey: true,
        gitUsername: true,
        avatarUrl: true,
        hiredAt: true,
        active: true,
        createdAt: true
      }
    });

    return reply.send({ people });
  });

  app.post('/link-jira-by-email', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const jiraConfig = getJiraConfig();

    if (!jiraConfig) {
      return reply.status(500).send({
        message: 'Integração Jira não configurada no backend.'
      });
    }

    const people = await prisma.user.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        jiraUserKey: true,
        avatarUrl: true
      }
    });

    let linked = 0;
    let photosUpdated = 0;
    let notFound = 0;
    let unchanged = 0;
    let errors = 0;

    const details: Array<{ email: string; status: string; message: string }> = [];

    for (const person of people) {
      try {
        const jiraUsers = await searchJiraUsers(jiraConfig, person.email);
        const matched = pickBestUserByEmail(jiraUsers, person.email);

        if (!matched) {
          notFound += 1;
          details.push({
            email: person.email,
            status: 'not_found',
            message: 'Usuário Jira não encontrado por e-mail.'
          });
          continue;
        }

        let avatarToSave = person.avatarUrl;

        if (!avatarToSave) {
          const jiraAvatar = await fetchJiraAvatarAsDataUrl(jiraConfig, matched.avatarUrl);

          if (jiraAvatar) {
            avatarToSave = jiraAvatar;
          }
        }

        const shouldUpdateLink = person.jiraUserKey !== matched.accountId;
        const shouldUpdateAvatar = person.avatarUrl !== avatarToSave;

        if (!shouldUpdateLink && !shouldUpdateAvatar) {
          unchanged += 1;
          details.push({
            email: person.email,
            status: 'unchanged',
            message: 'Já estava vinculado.'
          });
          continue;
        }

        await prisma.user.update({
          where: { id: person.id },
          data: {
            jiraUserKey: matched.accountId,
            avatarUrl: avatarToSave
          }
        });

        if (shouldUpdateLink) {
          linked += 1;
        }

        if (shouldUpdateAvatar && avatarToSave) {
          photosUpdated += 1;
        }

        details.push({
          email: person.email,
          status: 'updated',
          message: `Vínculo Jira ${shouldUpdateLink ? 'atualizado' : 'mantido'}${shouldUpdateAvatar ? ' e foto sincronizada' : ''}.`
        });
      } catch (error) {
        errors += 1;
        const text = error instanceof Error ? error.message : 'Erro ao consultar Jira';
        details.push({
          email: person.email,
          status: 'error',
          message: text
        });
      }
    }

    return reply.send({
      summary: {
        total: people.length,
        linked,
        photosUpdated,
        notFound,
        unchanged,
        errors
      },
      details
    });
  });

  app.post('/link-integrations-auto', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedBody = autoLinkIntegrationsSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        message: 'Informe o link da organização GitHub para vinculação automática.'
      });
    }

    const githubOrg = extractGithubOrg(parsedBody.data.githubOrgUrl);

    if (!githubOrg) {
      return reply.status(400).send({
        message: 'Link de organização GitHub inválido.'
      });
    }

    const jiraConfig = getJiraConfig();

    if (!jiraConfig) {
      return reply.status(500).send({
        message: 'Integração Jira não configurada no backend.'
      });
    }

    const githubConfig = getGithubConfig();

    if (!githubConfig) {
      return reply.status(500).send({
        message: 'Integração GitHub não configurada no backend. Defina GITHUB_TOKEN.'
      });
    }

    const people = await prisma.user.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        jiraUserKey: true,
        gitUsername: true,
        avatarUrl: true
      }
    });

    try {
      await githubRequest<GithubUserSearchResult>(
        githubConfig,
        `/search/users?q=${encodeURIComponent(`org:${githubOrg}`)}&per_page=1`
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro ao consultar organização GitHub';
      return reply.status(502).send({
        message: `Falha ao acessar organização GitHub: ${text}`
      });
    }

    const summary = {
      total: people.length,
      jira: {
        linked: 0,
        photosUpdated: 0,
        notFound: 0,
        unchanged: 0,
        errors: 0
      },
      github: {
        linked: 0,
        notFound: 0,
        unchanged: 0,
        errors: 0
      }
    };

    const details: Array<{
      email: string;
      jiraStatus: string;
      jiraMessage: string;
      githubStatus: string;
      githubMessage: string;
    }> = [];

    for (const person of people) {
      const updateData: { jiraUserKey?: string | null; avatarUrl?: string | null; gitUsername?: string | null } =
        {};

      let jiraStatus = 'unchanged';
      let jiraMessage = 'Sem alteração';
      let githubStatus = 'unchanged';
      let githubMessage = 'Sem alteração';

      try {
        const jiraUsers = await searchJiraUsers(jiraConfig, person.email);
        const matched = pickBestUserByEmail(jiraUsers, person.email);

        if (!matched) {
          summary.jira.notFound += 1;
          jiraStatus = 'not_found';
          jiraMessage = 'Usuário Jira não encontrado por e-mail.';
        } else {
          let avatarToSave = person.avatarUrl;

          if (!avatarToSave) {
            const jiraAvatar = await fetchJiraAvatarAsDataUrl(jiraConfig, matched.avatarUrl);

            if (jiraAvatar) {
              avatarToSave = jiraAvatar;
            }
          }

          const shouldUpdateLink = person.jiraUserKey !== matched.accountId;
          const shouldUpdateAvatar = person.avatarUrl !== avatarToSave;

          if (shouldUpdateLink) {
            updateData.jiraUserKey = matched.accountId;
            summary.jira.linked += 1;
          }

          if (shouldUpdateAvatar) {
            updateData.avatarUrl = avatarToSave;

            if (avatarToSave) {
              summary.jira.photosUpdated += 1;
            }
          }

          if (!shouldUpdateLink && !shouldUpdateAvatar) {
            summary.jira.unchanged += 1;
            jiraStatus = 'unchanged';
            jiraMessage = 'Já estava vinculado no Jira.';
          } else {
            jiraStatus = 'updated';
            jiraMessage = `Vínculo Jira ${shouldUpdateLink ? 'atualizado' : 'mantido'}${shouldUpdateAvatar ? ' e foto sincronizada' : ''}.`;
          }
        }
      } catch (error) {
        summary.jira.errors += 1;
        jiraStatus = 'error';
        jiraMessage = error instanceof Error ? error.message : 'Erro ao consultar Jira';
      }

      try {
        const githubUsername = await findGithubUsernameByEmail(
          githubConfig,
          githubOrg,
          person.email
        );

        if (!githubUsername) {
          summary.github.notFound += 1;
          githubStatus = 'not_found';
          githubMessage = 'Usuário GitHub não encontrado por e-mail/commits.';
        } else {
          const nextGithubUsername = githubUsername.trim();
          const currentGithubUsername = person.gitUsername?.trim() || '';

          if (currentGithubUsername === nextGithubUsername) {
            summary.github.unchanged += 1;
            githubStatus = 'unchanged';
            githubMessage = 'Já estava vinculado no GitHub.';
          } else {
            updateData.gitUsername = nextGithubUsername;
            summary.github.linked += 1;
            githubStatus = 'updated';
            githubMessage = `GitHub vinculado com ${nextGithubUsername}.`;
          }
        }
      } catch (error) {
        summary.github.errors += 1;
        githubStatus = 'error';
        githubMessage = error instanceof Error ? error.message : 'Erro ao consultar GitHub';
      }

      if (Object.keys(updateData).length > 0) {
        try {
          await prisma.user.update({
            where: { id: person.id },
            data: updateData
          });
        } catch (error) {
          const text = error instanceof Error ? error.message : 'Erro ao salvar vínculo';
          const jiraAlreadyError = jiraStatus === 'error';
          const githubAlreadyError = githubStatus === 'error';
          if (jiraStatus !== 'error') {
            summary.jira.errors += 1;
          }
          if (githubStatus !== 'error') {
            summary.github.errors += 1;
          }
          jiraStatus = 'error';
          githubStatus = 'error';
          jiraMessage = jiraAlreadyError ? jiraMessage : text;
          githubMessage = githubAlreadyError ? githubMessage : text;
        }
      }

      details.push({
        email: person.email,
        jiraStatus,
        jiraMessage,
        githubStatus,
        githubMessage
      });
    }

    return reply.send({
      organization: githubOrg,
      summary,
      details
    });
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

    const { name, email, role, seniority, jiraUserKey, gitUsername, avatarUrl, hiredAt, active } =
      parsedBody.data;
    const normalizedSeniority = normalizeSeniorityForRole(role, seniority);

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return reply.status(409).send({ message: 'Já existe pessoa cadastrada com este e-mail' });
    }

    const rawJiraUserKey = normalizeOptionalText(jiraUserKey);
    const normalizedJiraAccountId = extractJiraAccountId(rawJiraUserKey);
    const normalizedGitUsername = normalizeOptionalText(gitUsername);
    let resolvedAvatarUrl = normalizeOptionalText(avatarUrl);

    if (rawJiraUserKey && !normalizedJiraAccountId) {
      return reply.status(400).send({
        message: 'Vínculo Jira inválido. Informe accountId ou URL de perfil válida.'
      });
    }

    if (normalizedJiraAccountId) {
      const jiraConfig = getJiraConfig();

      if (!jiraConfig) {
        return reply.status(500).send({
          message: 'Integração Jira não configurada no backend.'
        });
      }

      try {
        const jiraUser = await fetchJiraUserByAccountId(jiraConfig, normalizedJiraAccountId);

        if (!jiraUser) {
          return reply.status(400).send({
            message: 'Vínculo Jira inválido. Usuário não encontrado no Jira.'
          });
        }

        if (!resolvedAvatarUrl) {
          const avatarFromJira = await fetchJiraAvatarAsDataUrl(jiraConfig, jiraUser.avatarUrl);

          if (avatarFromJira) {
            resolvedAvatarUrl = avatarFromJira;
          }
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Erro ao consultar Jira';
        return reply.status(502).send({ message: `Falha ao validar vínculo Jira: ${text}` });
      }
    }

    const defaultPasswordHash = await hash('123456', 10);

    const person = await prisma.user.create({
      data: {
        name,
        email,
        role,
        seniority: normalizedSeniority,
        jiraUserKey: normalizedJiraAccountId,
        gitUsername: normalizedGitUsername,
        avatarUrl: resolvedAvatarUrl,
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
        jiraUserKey: true,
        gitUsername: true,
        avatarUrl: true,
        hiredAt: true,
        active: true,
        createdAt: true
      }
    });

    return reply.status(201).send({ person });
  });

  app.patch('/:id', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = updatePersonParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Pessoa inválida' });
    }

    const parsedBody = updatePersonSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para edição' });
    }

    const { id } = parsedParams.data;
    const { name, email, role, seniority, jiraUserKey, gitUsername, avatarUrl, active } =
      parsedBody.data;
    const normalizedSeniority = normalizeSeniorityForRole(role, seniority);

    const existingPerson = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true }
    });

    if (!existingPerson) {
      return reply.status(404).send({ message: 'Pessoa não encontrada' });
    }

    if (existingPerson.email !== email) {
      const userWithEmail = await prisma.user.findUnique({ where: { email } });

      if (userWithEmail) {
        return reply.status(409).send({ message: 'Já existe pessoa cadastrada com este e-mail' });
      }
    }

    const rawJiraUserKey = normalizeOptionalText(jiraUserKey);
    const normalizedJiraAccountId = extractJiraAccountId(rawJiraUserKey);
    const normalizedGitUsername = normalizeOptionalText(gitUsername);
    let resolvedAvatarUrl = normalizeOptionalText(avatarUrl);

    if (rawJiraUserKey && !normalizedJiraAccountId) {
      return reply.status(400).send({
        message: 'Vínculo Jira inválido. Informe accountId ou URL de perfil válida.'
      });
    }

    if (normalizedJiraAccountId) {
      const jiraConfig = getJiraConfig();

      if (!jiraConfig) {
        return reply.status(500).send({
          message: 'Integração Jira não configurada no backend.'
        });
      }

      try {
        const jiraUser = await fetchJiraUserByAccountId(jiraConfig, normalizedJiraAccountId);

        if (!jiraUser) {
          return reply.status(400).send({
            message: 'Vínculo Jira inválido. Usuário não encontrado no Jira.'
          });
        }

        if (!resolvedAvatarUrl) {
          const avatarFromJira = await fetchJiraAvatarAsDataUrl(jiraConfig, jiraUser.avatarUrl);

          if (avatarFromJira) {
            resolvedAvatarUrl = avatarFromJira;
          }
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Erro ao consultar Jira';
        return reply.status(502).send({ message: `Falha ao validar vínculo Jira: ${text}` });
      }
    }

    const person = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        role,
        seniority: normalizedSeniority,
        jiraUserKey: normalizedJiraAccountId,
        gitUsername: normalizedGitUsername,
        avatarUrl: resolvedAvatarUrl,
        active
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        seniority: true,
        jiraUserKey: true,
        gitUsername: true,
        avatarUrl: true,
        hiredAt: true,
        active: true,
        createdAt: true
      }
    });

    return reply.send({ person });
  });
}
