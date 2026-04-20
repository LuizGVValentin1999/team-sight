import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import {
  formatDateForJql,
  getJiraConfig,
  jiraRequest,
  normalizeJiraFieldLabel,
  normalizeText,
  quoteJqlValue,
  sanitizeIssueKey,
  splitCommaSeparated,
  toFiniteNumber,
  type JiraConfig
} from '../lib/jira-common.js';
import {
  calculateBusinessMinutesBetween,
  getBrazilAndCuritibaHolidayDateSetForRange,
  getBusinessHoursConfig,
  minutesToHours
} from '../lib/business-calendar.js';

const goalStatusValues = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;

const personParamsSchema = z.object({
  id: z.string().min(1)
});

const progressQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
  sprintNames: z.string().trim().optional(),
  maxIssues: z.coerce.number().int().min(1).max(300).default(200),
  githubOrg: z.string().trim().max(120).optional()
});

const goalParamsSchema = z.object({
  id: z.string().min(1),
  goalId: z.string().min(1)
});

const sessionParamsSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1)
});

const noteParamsSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1)
});

const issueDetailsParamsSchema = z.object({
  id: z.string().min(1),
  issueKey: z.string().trim().min(3)
});

const createGoalSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).optional(),
  targetDate: z.string().datetime().optional(),
  progress: z.number().int().min(0).max(100).default(0),
  status: z.enum(goalStatusValues).default('NOT_STARTED')
});

const updateGoalSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  targetDate: z.string().datetime().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  status: z.enum(goalStatusValues).optional()
});

const createSessionSchema = z.object({
  meetingDate: z.string().datetime().optional(),
  performanceScore: z.number().int().min(1).max(10),
  summary: z.string().trim().min(5).max(2000),
  highlights: z.string().trim().max(2000).optional(),
  blockers: z.string().trim().max(2000).optional(),
  nextSteps: z.string().trim().max(2000).optional()
});

const updateSessionSchema = z
  .object({
    meetingDate: z.string().datetime().optional(),
    performanceScore: z.number().int().min(1).max(10).optional(),
    summary: z.string().trim().min(5).max(2000).optional(),
    highlights: z.string().trim().max(2000).optional(),
    blockers: z.string().trim().max(2000).optional(),
    nextSteps: z.string().trim().max(2000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualização'
  });

const createNoteSchema = z.object({
  title: z.string().trim().min(3).max(180),
  content: z.string().trim().min(1).max(50000)
});

const updateNoteSchema = z
  .object({
    title: z.string().trim().min(3).max(180).optional(),
    content: z.string().trim().min(1).max(50000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualização'
  });

const PERSON_PROGRESS_NOTE_TYPE = 'PERSON_PROGRESS';

type GithubConfig = {
  apiBaseUrl: string;
  token: string;
};

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

type JiraIssue = {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory?: {
        key?: string;
      };
    };
    created: string;
    updated: string;
    issuetype?: {
      name?: string;
    };
    [fieldKey: string]: unknown;
  };
};

type JiraIssueDetailsResponse = {
  key: string;
  fields: {
    summary: string;
    created: string;
    status: {
      name: string;
    };
    assignee?: {
      accountId?: string;
      displayName?: string;
    } | null;
  };
};

type JiraSearchResponse = {
  issues: JiraIssue[];
  isLast?: boolean;
  nextPageToken?: string;
};

type JiraEnhancedSearchRequest = {
  jql: string;
  maxResults: number;
  fields: string[];
  nextPageToken?: string;
  fieldsByKeys?: boolean;
  failFast?: boolean;
};

type JiraLegacySearchResponse = {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
};

type JiraChangelogResponse = {
  values: Array<{
    created: string;
    author?: {
      accountId?: string;
      displayName?: string;
    } | null;
    items: Array<{
      field: string;
      from?: string;
      fromString?: string;
      to?: string;
      toString?: string;
    }>;
  }>;
  isLast: boolean;
};

type JiraFieldMetadata = {
  id: string;
  name?: string;
  clauseNames?: string[];
  schema?: {
    custom?: string;
    type?: string;
  };
};

type GithubSearchIssuesResponse = {
  total_count: number;
  items: Array<{
    id: number;
    number: number;
    title: string;
    state: string;
    draft?: boolean;
    html_url: string;
    updated_at: string;
    created_at: string;
    repository_url: string;
  }>;
};

const storyPointsFieldCache = new Map<string, string | null>();

function buildJiraActivitiesJql(input: {
  jiraAccountId: string;
  sprintNames: string[];
  periodStart: Date;
}) {
  const clauses: string[] = [];
  const accountId = quoteJqlValue(input.jiraAccountId);
  clauses.push(`(assignee = ${accountId} OR assignee WAS ${accountId})`);

  if (input.sprintNames.length > 0) {
    const sprintList = input.sprintNames.map(quoteJqlValue).join(', ');
    clauses.push(`sprint in (${sprintList})`);
  } else {
    clauses.push(`updated >= "${formatDateForJql(input.periodStart)}"`);
  }

  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
}

function extractGithubOrg(raw: string | undefined) {
  if (!raw) {
    return null;
  }

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

async function githubRequest<T>(config: GithubConfig, path: string) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

async function resolveStoryPointsFieldId(config: JiraConfig) {
  const configuredField = process.env.JIRA_STORY_POINTS_FIELD?.trim();

  if (configuredField) {
    return configuredField;
  }

  if (storyPointsFieldCache.has(config.baseUrl)) {
    return storyPointsFieldCache.get(config.baseUrl) ?? null;
  }

  try {
    const fields = await jiraRequest<JiraFieldMetadata[]>(config, '/field');
    const exactMatches = new Set([
      'story points',
      'story point estimate',
      'story point estimation',
      'pontos da historia',
      'pontos de historia'
    ]);

    const matchedField =
      fields.find((field) => {
        const labels = [field.name ?? '', ...(field.clauseNames ?? [])]
          .map(normalizeJiraFieldLabel)
          .filter(Boolean);

        return labels.some((label) => exactMatches.has(label));
      }) ??
      fields.find((field) => {
        const labels = [field.name ?? '', ...(field.clauseNames ?? [])]
          .map(normalizeJiraFieldLabel)
          .filter(Boolean);

        return labels.some(
          (label) =>
            (label.includes('story') && label.includes('point')) ||
            (label.includes('ponto') && label.includes('historia'))
        );
      }) ??
      fields.find((field) => {
        const custom = normalizeJiraFieldLabel(field.schema?.custom ?? '');
        return custom.includes('story') && custom.includes('point');
      }) ??
      null;

    const fieldId = matchedField?.id?.trim() || null;
    storyPointsFieldCache.set(config.baseUrl, fieldId);
    return fieldId;
  } catch {
    storyPointsFieldCache.set(config.baseUrl, null);
    return null;
  }
}

function extractStoryPointsFromIssue(issue: JiraIssue, storyPointsFieldId: string | null) {
  if (!storyPointsFieldId) {
    return null;
  }

  return toFiniteNumber(issue.fields[storyPointsFieldId]);
}

async function fetchJiraActivitiesForUser(
  config: JiraConfig,
  jql: string,
  maxIssues: number,
  storyPointsFieldId: string | null
) {
  const pageSize = 50;
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  let useLegacySearch = false;
  const requestedFields = ['summary', 'status', 'created', 'updated', 'issuetype'];

  if (storyPointsFieldId) {
    requestedFields.push(storyPointsFieldId);
  }

  while (issues.length < maxIssues) {
    if (useLegacySearch) {
      const legacyPayload = await jiraRequest<JiraLegacySearchResponse>(config, '/search', {
        method: 'POST',
        body: JSON.stringify({
          jql,
          startAt: issues.length,
          maxResults: Math.min(pageSize, maxIssues - issues.length),
          fields: requestedFields
        })
      });

      const batch = legacyPayload.issues ?? [];

      if (batch.length === 0) {
        break;
      }

      issues.push(...batch);

      if (issues.length >= legacyPayload.total || batch.length < legacyPayload.maxResults) {
        break;
      }

      continue;
    }

    const requestBody: JiraEnhancedSearchRequest = {
      jql,
      maxResults: Math.min(pageSize, maxIssues - issues.length),
      fields: requestedFields,
      fieldsByKeys: false,
      failFast: false
    };

    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }

    try {
      const payload = await jiraRequest<JiraSearchResponse>(config, '/search/jql', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const batch = payload.issues ?? [];

      if (batch.length === 0) {
        break;
      }

      issues.push(...batch);

      const receivedNextPageToken = payload.nextPageToken;

      if (
        payload.isLast === true ||
        !receivedNextPageToken ||
        receivedNextPageToken === nextPageToken
      ) {
        break;
      }

      nextPageToken = receivedNextPageToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldFallbackToLegacy = message.includes('404') || message.includes('400');

      if (!shouldFallbackToLegacy) {
        throw error;
      }

      useLegacySearch = true;
    }
  }

  return issues.slice(0, maxIssues).map((issue) => ({
    key: issue.key,
    issueUrl: `${config.baseUrl}/browse/${encodeURIComponent(issue.key)}`,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    issueType: issue.fields.issuetype?.name ?? 'Issue',
    storyPoints: extractStoryPointsFromIssue(issue, storyPointsFieldId),
    createdAt: issue.fields.created,
    updatedAt: issue.fields.updated,
    isDone: issue.fields.status.statusCategory?.key === 'done'
  }));
}

function extractRepoFullName(repositoryUrl: string) {
  const parts = repositoryUrl.split('/').filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }

  return repositoryUrl;
}

async function fetchOpenPullRequestsForUser(input: {
  config: GithubConfig;
  gitUsername: string;
  githubOrg: string | null;
  maxItems: number;
}) {
  const perPage = 50;
  const items: GithubSearchIssuesResponse['items'] = [];
  const queryParts = ['is:pr', 'is:open', `author:${input.gitUsername}`];

  if (input.githubOrg) {
    queryParts.push(`org:${input.githubOrg}`);
  }

  const query = queryParts.join(' ');
  let page = 1;

  while (items.length < input.maxItems) {
    const path =
      `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc` +
      `&per_page=${Math.min(perPage, input.maxItems - items.length)}&page=${page}`;
    const payload = await githubRequest<GithubSearchIssuesResponse>(input.config, path);
    const batch = payload.items ?? [];

    if (batch.length === 0) {
      break;
    }

    items.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return items.slice(0, input.maxItems).map((pullRequest) => ({
    id: pullRequest.id,
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    draft: Boolean(pullRequest.draft),
    htmlUrl: pullRequest.html_url,
    repoFullName: extractRepoFullName(pullRequest.repository_url),
    createdAt: pullRequest.created_at,
    updatedAt: pullRequest.updated_at
  }));
}

function normalizeStatusForMatching(status: string) {
  return normalizeText(status).replace(/[^a-z0-9]+/g, ' ').trim();
}

function isCodeStatus(status: string) {
  const normalized = normalizeStatusForMatching(status);
  const excludes = ['review', 'revisao', 'qa', 'teste', 'test'];

  if (excludes.some((token) => normalized.includes(token))) {
    return false;
  }

  return (
    normalized.includes('coding') ||
    normalized === 'code' ||
    normalized.includes(' in code') ||
    normalized.includes(' em code') ||
    normalized.includes('develop') ||
    normalized.includes('desenvolv') ||
    normalized === 'dev'
  );
}

function isDoubleCheckStatus(status: string) {
  const normalized = normalizeStatusForMatching(status);

  return (
    normalized.includes('double check') ||
    normalized.includes('duble check') ||
    normalized.includes('duplo check') ||
    normalized.includes('second check') ||
    normalized.includes('2nd check')
  );
}

function isTestStatus(status: string) {
  if (isDoubleCheckStatus(status)) {
    return false;
  }

  const normalized = normalizeStatusForMatching(status);

  return (
    normalized.includes('qa') ||
    normalized.includes('test') ||
    normalized.includes('teste') ||
    normalized.includes('homolog') ||
    normalized.includes('validacao') ||
    normalized.includes('validation')
  );
}

async function fetchAllIssueChangelog(config: JiraConfig, issueKey: string) {
  const histories: JiraChangelogResponse['values'] = [];
  const pageSize = 100;
  let startAt = 0;

  while (true) {
    const payload = await jiraRequest<JiraChangelogResponse>(
      config,
      `/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${pageSize}`
    );

    const batch = payload.values ?? [];

    if (batch.length === 0) {
      break;
    }

    histories.push(...batch);

    if (payload.isLast) {
      break;
    }

    startAt += pageSize;
  }

  histories.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

  return histories;
}

function computeTrend(scores: number[]) {
  if (scores.length < 2) {
    return 'stable';
  }

  const recent = scores.slice(0, 3);
  const older = scores.slice(3, 6);

  if (older.length === 0) {
    if (recent[0] > recent[recent.length - 1]) {
      return 'up';
    }
    if (recent[0] < recent[recent.length - 1]) {
      return 'down';
    }
    return 'stable';
  }

  const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const olderAvg = older.reduce((sum, value) => sum + value, 0) / older.length;

  if (recentAvg - olderAvg > 0.3) {
    return 'up';
  }

  if (olderAvg - recentAvg > 0.3) {
    return 'down';
  }

  return 'stable';
}

export async function peopleProgressRoutes(app: FastifyInstance) {
  app.get('/:id/progress', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = personParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Pessoa inválida' });
    }

    const parsedQuery = progressQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      return reply.status(400).send({ message: 'Filtros inválidos para acompanhamento' });
    }

    const { days, sprintNames: sprintNamesRaw, maxIssues, githubOrg: githubOrgRaw } = parsedQuery.data;
    const sprintNames = splitCommaSeparated(sprintNamesRaw);
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const githubOrg = extractGithubOrg(githubOrgRaw) ?? extractGithubOrg(process.env.GITHUB_DEFAULT_ORG);

    const { id } = parsedParams.data;

    const person = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        seniority: true,
        avatarUrl: true,
        jiraUserKey: true,
        gitUsername: true,
        active: true
      }
    });

    if (!person) {
      return reply.status(404).send({ message: 'Pessoa não encontrada' });
    }

    const [goals, sessions, notes, nextVacation] = await Promise.all([
      prisma.developmentGoal.findMany({
        where: { userId: id },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }]
      }),
      prisma.oneOnOneSession.findMany({
        where: { userId: id },
        orderBy: { meetingDate: 'desc' },
        take: 24
      }),
      prisma.note.findMany({
        where: {
          userId: id,
          type: PERSON_PROGRESS_NOTE_TYPE
        },
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),
      prisma.teamVacation.findFirst({
        where: {
          userId: id,
          endDate: {
            gte: new Date()
          }
        },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          startDate: true,
          endDate: true,
          description: true
        }
      })
    ]);

    let jiraActivities: Array<{
      key: string;
      issueUrl: string;
      summary: string;
      status: string;
      issueType: string;
      storyPoints: number | null;
      createdAt: string;
      updatedAt: string;
      isDone: boolean;
    }> = [];
    let jiraWarning: string | null = null;
    let jiraAppliedJql: string | null = null;
    let jiraStoryPointsField: string | null = null;
    let githubWarning: string | null = null;
    let openPullRequests: Array<{
      id: number;
      number: number;
      title: string;
      state: string;
      draft: boolean;
      htmlUrl: string;
      repoFullName: string;
      createdAt: string;
      updatedAt: string;
    }> = [];

    if (person.jiraUserKey) {
      const jiraConfig = getJiraConfig();

      if (jiraConfig) {
        try {
          jiraAppliedJql = buildJiraActivitiesJql({
            jiraAccountId: person.jiraUserKey,
            sprintNames,
            periodStart
          });
          jiraStoryPointsField = await resolveStoryPointsFieldId(jiraConfig);
          jiraActivities = await fetchJiraActivitiesForUser(
            jiraConfig,
            jiraAppliedJql,
            maxIssues,
            jiraStoryPointsField
          );
        } catch (error) {
          jiraWarning = error instanceof Error ? error.message : 'Erro ao buscar atividades no Jira';
        }
      } else {
        jiraWarning = 'Integração Jira não configurada no backend.';
      }
    }

    if (person.gitUsername) {
      const githubConfig = getGithubConfig();

      if (githubConfig) {
        try {
          openPullRequests = await fetchOpenPullRequestsForUser({
            config: githubConfig,
            gitUsername: person.gitUsername,
            githubOrg,
            maxItems: 100
          });
        } catch (error) {
          githubWarning = error instanceof Error ? error.message : 'Erro ao buscar PRs no GitHub';
        }
      } else {
        githubWarning = 'Integração GitHub não configurada no backend.';
      }
    }

    const sessionsCount = sessions.length;
    const performanceScores = sessions.map((session) => session.performanceScore);
    const avgPerformanceScore =
      sessionsCount > 0
        ? Number(
            (
              performanceScores.reduce((sum, score) => sum + score, 0) /
              Math.max(sessionsCount, 1)
            ).toFixed(2)
          )
        : null;
    const lastPerformanceScore = sessions[0]?.performanceScore ?? null;

    const goalsDone = goals.filter((goal) => goal.status === 'DONE').length;
    const goalsOpen = goals.length - goalsDone;
    const goalsAvgProgress =
      goals.length > 0
        ? Number(
            (goals.reduce((sum, goal) => sum + goal.progress, 0) / Math.max(goals.length, 1)).toFixed(2)
          )
        : 0;

    const jiraDoneCount = jiraActivities.filter((item) => item.isDone).length;
    const jiraInProgressCount = jiraActivities.length - jiraDoneCount;
    const jiraActivitiesWithPoints = jiraActivities.filter((item) => item.storyPoints !== null);
    const jiraStoryPointsTotal = Number(
      jiraActivitiesWithPoints.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0).toFixed(2)
    );
    const jiraStoryPointsDone = Number(
      jiraActivitiesWithPoints
        .filter((item) => item.isDone)
        .reduce((sum, item) => sum + (item.storyPoints ?? 0), 0)
        .toFixed(2)
    );
    const jiraStoryPointsInProgress = Number((jiraStoryPointsTotal - jiraStoryPointsDone).toFixed(2));
    const jiraUnestimatedCount = jiraActivities.length - jiraActivitiesWithPoints.length;

    return reply.send({
      person: {
        ...person,
        nextVacation
      },
      metrics: {
        sessionsCount,
        avgPerformanceScore,
        lastPerformanceScore,
        performanceTrend: computeTrend(performanceScores),
        goalsTotal: goals.length,
        goalsDone,
        goalsOpen,
        goalsAvgProgress,
        jiraActivitiesTotal: jiraActivities.length,
        jiraDoneCount,
        jiraInProgressCount,
        jiraStoryPointsTotal,
        jiraStoryPointsDone,
        jiraStoryPointsInProgress,
        jiraUnestimatedCount,
        githubOpenPrCount: openPullRequests.length
      },
      goals,
      oneOnOnes: sessions,
      notes: notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        author: note.author
      })),
      jiraActivities,
      jiraWarning,
      openPullRequests,
      githubWarning,
      jiraFilters: {
        days,
        sprintNames,
        maxIssues,
        jql: jiraAppliedJql,
        storyPointsField: jiraStoryPointsField
      },
      githubFilters: {
        organization: githubOrg,
        maxItems: 100
      }
    });
  });

  app.get('/:id/progress/jira-issue/:issueKey', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = issueDetailsParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Issue inválida' });
    }

    const issueKey = sanitizeIssueKey(parsedParams.data.issueKey);

    if (!issueKey) {
      return reply.status(400).send({ message: 'Issue key inválida. Use o formato PROJ-123.' });
    }

    const person = await prisma.user.findUnique({
      where: { id: parsedParams.data.id },
      select: {
        id: true,
        name: true,
        jiraUserKey: true
      }
    });

    if (!person) {
      return reply.status(404).send({ message: 'Pessoa não encontrada' });
    }

    const jiraConfig = getJiraConfig();

    if (!jiraConfig) {
      return reply.status(500).send({
        message:
          'Jira não está configurado. Defina JIRA_BASE_URL, JIRA_EMAIL e JIRA_API_TOKEN no .env do backend.'
      });
    }

    try {
      const issue = await jiraRequest<JiraIssueDetailsResponse>(
        jiraConfig,
        `/issue/${encodeURIComponent(issueKey)}?fields=summary,status,created,assignee`
      );
      const changelog = await fetchAllIssueChangelog(jiraConfig, issueKey);

      const statusChanges = changelog
        .flatMap((history) =>
          history.items
            .filter((item) => item.field === 'status')
            .map((item) => ({
              at: new Date(history.created),
              from: item.fromString?.trim() || null,
              to: item.toString?.trim() || null
            }))
        )
        .filter((item) => item.to)
        .sort((a, b) => a.at.getTime() - b.at.getTime());

      const assigneeChanges = changelog
        .flatMap((history) =>
          history.items
            .filter((item) => item.field === 'assignee')
            .map((item) => ({
              at: new Date(history.created),
              fromId: item.from?.trim() || null,
              fromName: item.fromString?.trim() || null,
              toId: item.to?.trim() || null,
              toName: item.toString?.trim() || null
            }))
        )
        .sort((a, b) => a.at.getTime() - b.at.getTime());

      const initialStatus = statusChanges[0]?.from || issue.fields.status.name;
      const initialAssignee = {
        id: assigneeChanges[0]?.fromId || issue.fields.assignee?.accountId?.trim() || null,
        name:
          assigneeChanges[0]?.fromName ||
          issue.fields.assignee?.displayName?.trim() ||
          'Não atribuído'
      };

      const historiesSorted = changelog
        .map((history) => ({
          at: new Date(history.created),
          author: history.author,
          items: history.items
        }))
        .sort((a, b) => a.at.getTime() - b.at.getTime());

      let currentStatus = initialStatus;
      let currentAssignee = initialAssignee;
      let segmentStart = new Date(issue.fields.created);
      const periodEnd = new Date();
      const holidayDateSet = await getBrazilAndCuritibaHolidayDateSetForRange(
        new Date(issue.fields.created),
        periodEnd
      );

      const segments: Array<{
        start: Date;
        end: Date;
        status: string;
        assignee: { id: string | null; name: string };
      }> = [];

      for (const history of historiesSorted) {
        if (history.at.getTime() > segmentStart.getTime()) {
          segments.push({
            start: new Date(segmentStart.getTime()),
            end: new Date(history.at.getTime()),
            status: currentStatus,
            assignee: { ...currentAssignee }
          });
          segmentStart = new Date(history.at.getTime());
        }

        for (const item of history.items) {
          if (item.field === 'status' && item.toString?.trim()) {
            currentStatus = item.toString.trim();
          }

          if (item.field === 'assignee') {
            currentAssignee = {
              id: item.to?.trim() || null,
              name: item.toString?.trim() || 'Não atribuído'
            };
          }
        }
      }

      if (periodEnd.getTime() > segmentStart.getTime()) {
        segments.push({
          start: new Date(segmentStart.getTime()),
          end: periodEnd,
          status: currentStatus,
          assignee: { ...currentAssignee }
        });
      }

      const statusDurationsMinutes = new Map<string, number>();
      const codeByAssigneeMinutes = new Map<
        string,
        {
          assignee: string;
          totalMinutes: number;
          statusMinutes: Map<string, number>;
        }
      >();
      const testByAssigneeMinutes = new Map<
        string,
        {
          assignee: string;
          totalMinutes: number;
          statusMinutes: Map<string, number>;
        }
      >();
      const doubleCheckByAssigneeMinutes = new Map<
        string,
        {
          assignee: string;
          totalMinutes: number;
          statusMinutes: Map<string, number>;
        }
      >();
      const actionLog: Array<{
        actionId: string;
        at: string;
        actionType: 'STATUS_CHANGE' | 'ASSIGNEE_CHANGE';
        actor: string;
        from: string | null;
        to: string | null;
        businessHoursSincePreviousAction: number | null;
      }> = [];
      let previousActionAt: Date | null = null;
      let actionCounter = 0;

      for (const history of historiesSorted) {
        const actor = history.author?.displayName?.trim() || 'Não identificado';

        for (const item of history.items) {
          if (item.field !== 'status' && item.field !== 'assignee') {
            continue;
          }

          const businessHoursSincePreviousAction = previousActionAt
            ? minutesToHours(
                calculateBusinessMinutesBetween(previousActionAt, history.at, { holidayDateSet })
              )
            : null;

          actionLog.push({
            actionId: `${history.at.toISOString()}-${item.field}-${actionCounter}`,
            at: history.at.toISOString(),
            actionType: item.field === 'status' ? 'STATUS_CHANGE' : 'ASSIGNEE_CHANGE',
            actor,
            from: item.fromString?.trim() || null,
            to: item.toString?.trim() || null,
            businessHoursSincePreviousAction
          });
          actionCounter += 1;
          previousActionAt = history.at;
        }
      }

      for (const segment of segments) {
        const segmentMinutes = calculateBusinessMinutesBetween(segment.start, segment.end, {
          holidayDateSet
        });

        if (segmentMinutes <= 0) {
          continue;
        }

        const assigneeName = segment.assignee.name || 'Não atribuído';

        statusDurationsMinutes.set(
          segment.status,
          (statusDurationsMinutes.get(segment.status) ?? 0) + segmentMinutes
        );

        if (isCodeStatus(segment.status)) {
          const existing = codeByAssigneeMinutes.get(assigneeName) ?? {
            assignee: assigneeName,
            totalMinutes: 0,
            statusMinutes: new Map<string, number>()
          };

          existing.totalMinutes += segmentMinutes;
          existing.statusMinutes.set(
            segment.status,
            (existing.statusMinutes.get(segment.status) ?? 0) + segmentMinutes
          );
          codeByAssigneeMinutes.set(assigneeName, existing);
        }

        if (isTestStatus(segment.status)) {
          const existingTest = testByAssigneeMinutes.get(assigneeName) ?? {
            assignee: assigneeName,
            totalMinutes: 0,
            statusMinutes: new Map<string, number>()
          };
          existingTest.totalMinutes += segmentMinutes;
          existingTest.statusMinutes.set(
            segment.status,
            (existingTest.statusMinutes.get(segment.status) ?? 0) + segmentMinutes
          );
          testByAssigneeMinutes.set(assigneeName, existingTest);
        }

        if (isDoubleCheckStatus(segment.status)) {
          const existingDoubleCheck = doubleCheckByAssigneeMinutes.get(assigneeName) ?? {
            assignee: assigneeName,
            totalMinutes: 0,
            statusMinutes: new Map<string, number>()
          };
          existingDoubleCheck.totalMinutes += segmentMinutes;
          existingDoubleCheck.statusMinutes.set(
            segment.status,
            (existingDoubleCheck.statusMinutes.get(segment.status) ?? 0) + segmentMinutes
          );
          doubleCheckByAssigneeMinutes.set(assigneeName, existingDoubleCheck);
        }
      }

      const statusTimes = Array.from(statusDurationsMinutes.entries())
        .map(([status, totalMinutes]) => ({
          status,
          businessHours: minutesToHours(totalMinutes)
        }))
        .sort((a, b) => b.businessHours - a.businessHours);

      const codeTimesByAssignee = Array.from(codeByAssigneeMinutes.values())
        .map((entry) => ({
          assignee: entry.assignee,
          businessHours: minutesToHours(entry.totalMinutes),
          statusTimes: Array.from(entry.statusMinutes.entries())
            .map(([status, totalMinutes]) => ({
              status,
              businessHours: minutesToHours(totalMinutes)
            }))
            .sort((a, b) => b.businessHours - a.businessHours)
        }))
        .sort((a, b) => b.businessHours - a.businessHours);

      const testTimesByAssignee = Array.from(testByAssigneeMinutes.values())
        .map((entry) => ({
          assignee: entry.assignee,
          businessHours: minutesToHours(entry.totalMinutes),
          statusTimes: Array.from(entry.statusMinutes.entries())
            .map(([status, totalMinutes]) => ({
              status,
              businessHours: minutesToHours(totalMinutes)
            }))
            .sort((a, b) => b.businessHours - a.businessHours)
        }))
        .sort((a, b) => b.businessHours - a.businessHours);

      const doubleCheckTimesByAssignee = Array.from(doubleCheckByAssigneeMinutes.values())
        .map((entry) => ({
          assignee: entry.assignee,
          businessHours: minutesToHours(entry.totalMinutes),
          statusTimes: Array.from(entry.statusMinutes.entries())
            .map(([status, totalMinutes]) => ({
              status,
              businessHours: minutesToHours(totalMinutes)
            }))
            .sort((a, b) => b.businessHours - a.businessHours)
        }))
        .sort((a, b) => b.businessHours - a.businessHours);

      const totalBusinessHours = Number(
        statusTimes.reduce((sum, item) => sum + item.businessHours, 0).toFixed(2)
      );
      const totalTestBusinessHours = Number(
        testTimesByAssignee.reduce((sum, item) => sum + item.businessHours, 0).toFixed(2)
      );
      const totalDoubleCheckBusinessHours = Number(
        doubleCheckTimesByAssignee.reduce((sum, item) => sum + item.businessHours, 0).toFixed(2)
      );

      return reply.send({
        issue: {
          key: issueKey,
          summary: issue.fields.summary,
          issueUrl: `${jiraConfig.baseUrl}/browse/${encodeURIComponent(issueKey)}`,
          createdAt: issue.fields.created,
          currentStatus: issue.fields.status.name,
          currentAssignee: issue.fields.assignee?.displayName?.trim() || 'Não atribuído'
        },
        person: {
          id: person.id,
          name: person.name,
          jiraUserKey: person.jiraUserKey
        },
        businessHoursConfig: getBusinessHoursConfig(),
        summary: {
          totalBusinessHours,
          totalTestBusinessHours,
          totalDoubleCheckBusinessHours
        },
        statusTimes,
        codeTimesByAssignee,
        testTimesByAssignee,
        doubleCheckTimesByAssignee,
        actionLog
      });
    } catch (error) {
      request.log.error(error);

      const message =
        error instanceof Error ? error.message : 'Erro inesperado ao carregar detalhes da issue Jira';

      return reply.status(502).send({
        message: `Falha ao buscar detalhes da issue no Jira: ${message}`
      });
    }
  });

  app.post('/:id/progress/goals', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = personParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Pessoa inválida' });
    }

    const parsedBody = createGoalSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para meta' });
    }

    const { id } = parsedParams.data;
    const personExists = await prisma.user.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!personExists) {
      return reply.status(404).send({ message: 'Pessoa não encontrada' });
    }

    const { title, description, targetDate, progress, status } = parsedBody.data;

    const goal = await prisma.developmentGoal.create({
      data: {
        userId: id,
        title,
        description: description?.trim() || null,
        targetDate: targetDate ? new Date(targetDate) : null,
        progress,
        status
      }
    });

    return reply.status(201).send({ goal });
  });

  app.patch('/:id/progress/goals/:goalId', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = goalParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Meta inválida' });
    }

    const parsedBody = updateGoalSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para atualizar meta' });
    }

    const { id, goalId } = parsedParams.data;
    const goalExists = await prisma.developmentGoal.findUnique({
      where: { id: goalId },
      select: { id: true, userId: true }
    });

    if (!goalExists || goalExists.userId !== id) {
      return reply.status(404).send({ message: 'Meta não encontrada para esta pessoa' });
    }

    const data = parsedBody.data;
    const goal = await prisma.developmentGoal.update({
      where: { id: goalId },
      data: {
        title: data.title?.trim(),
        description: data.description !== undefined ? data.description.trim() || null : undefined,
        targetDate:
          data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
        progress: data.progress,
        status: data.status
      }
    });

    return reply.send({ goal });
  });

  app.delete('/:id/progress/goals/:goalId', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = goalParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Meta inválida' });
    }

    const { id, goalId } = parsedParams.data;
    const goalExists = await prisma.developmentGoal.findUnique({
      where: { id: goalId },
      select: { id: true, userId: true }
    });

    if (!goalExists || goalExists.userId !== id) {
      return reply.status(404).send({ message: 'Meta não encontrada para esta pessoa' });
    }

    await prisma.developmentGoal.delete({
      where: { id: goalId }
    });

    return reply.status(204).send();
  });

  app.post('/:id/progress/sessions', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = personParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Pessoa inválida' });
    }

    const parsedBody = createSessionSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para sessão 1:1' });
    }

    const { id } = parsedParams.data;
    const personExists = await prisma.user.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!personExists) {
      return reply.status(404).send({ message: 'Pessoa não encontrada' });
    }

    const { meetingDate, performanceScore, summary, highlights, blockers, nextSteps } = parsedBody.data;

    const oneOnOne = await prisma.oneOnOneSession.create({
      data: {
        userId: id,
        meetingDate: meetingDate ? new Date(meetingDate) : new Date(),
        performanceScore,
        summary: summary.trim(),
        highlights: highlights?.trim() || null,
        blockers: blockers?.trim() || null,
        nextSteps: nextSteps?.trim() || null
      }
    });

    return reply.status(201).send({ oneOnOne });
  });

  app.patch('/:id/progress/sessions/:sessionId', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = sessionParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Sessão inválida' });
    }

    const parsedBody = updateSessionSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para atualizar sessão 1:1' });
    }

    const { id, sessionId } = parsedParams.data;
    const sessionExists = await prisma.oneOnOneSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true }
    });

    if (!sessionExists || sessionExists.userId !== id) {
      return reply.status(404).send({ message: 'Sessão 1:1 não encontrada para esta pessoa' });
    }

    const data = parsedBody.data;
    const oneOnOne = await prisma.oneOnOneSession.update({
      where: { id: sessionId },
      data: {
        meetingDate: data.meetingDate !== undefined ? new Date(data.meetingDate) : undefined,
        performanceScore: data.performanceScore,
        summary: data.summary?.trim(),
        highlights: data.highlights !== undefined ? data.highlights.trim() || null : undefined,
        blockers: data.blockers !== undefined ? data.blockers.trim() || null : undefined,
        nextSteps: data.nextSteps !== undefined ? data.nextSteps.trim() || null : undefined
      }
    });

    return reply.send({ oneOnOne });
  });

  app.delete('/:id/progress/sessions/:sessionId', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = sessionParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Sessão inválida' });
    }

    const { id, sessionId } = parsedParams.data;
    const sessionExists = await prisma.oneOnOneSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true }
    });

    if (!sessionExists || sessionExists.userId !== id) {
      return reply.status(404).send({ message: 'Sessão 1:1 não encontrada para esta pessoa' });
    }

    await prisma.oneOnOneSession.delete({
      where: { id: sessionId }
    });

    return reply.status(204).send();
  });

  app.post('/:id/progress/notes', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = personParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Pessoa inválida' });
    }

    const parsedBody = createNoteSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para anotação' });
    }

    const { id } = parsedParams.data;
    const [personExists, authorExists] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: { id: true }
      }),
      prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true }
      })
    ]);

    if (!personExists) {
      return reply.status(404).send({ message: 'Pessoa não encontrada' });
    }

    if (!authorExists) {
      return reply.status(401).send({ message: 'Usuário autenticado não encontrado' });
    }

    const { title, content } = parsedBody.data;
    const note = await prisma.note.create({
      data: {
        type: PERSON_PROGRESS_NOTE_TYPE,
        userId: id,
        authorId: payload.sub,
        title,
        content
      },
      include: {
        author: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return reply.status(201).send({
      note: {
        id: note.id,
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        author: note.author
      }
    });
  });

  app.patch('/:id/progress/notes/:noteId', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = noteParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Anotação inválida' });
    }

    const parsedBody = updateNoteSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({ message: 'Dados inválidos para edição da anotação' });
    }

    const { id, noteId } = parsedParams.data;
    const noteExists = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true, type: true }
    });

    if (!noteExists || noteExists.userId !== id || noteExists.type !== PERSON_PROGRESS_NOTE_TYPE) {
      return reply.status(404).send({ message: 'Anotação não encontrada para esta pessoa' });
    }

    const updated = await prisma.note.update({
      where: { id: noteId },
      data: {
        title: parsedBody.data.title?.trim(),
        content: parsedBody.data.content?.trim()
      },
      include: {
        author: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return reply.send({
      note: {
        id: updated.id,
        title: updated.title,
        content: updated.content,
        createdAt: updated.createdAt,
        author: updated.author
      }
    });
  });

  app.delete('/:id/progress/notes/:noteId', async (request, reply) => {
    const payload = requireAuth(request, reply);

    if (!payload) {
      return;
    }

    const parsedParams = noteParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.status(400).send({ message: 'Anotação inválida' });
    }

    const { id, noteId } = parsedParams.data;
    const noteExists = await prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, userId: true, type: true }
    });

    if (!noteExists || noteExists.userId !== id || noteExists.type !== PERSON_PROGRESS_NOTE_TYPE) {
      return reply.status(404).send({ message: 'Anotação não encontrada para esta pessoa' });
    }

    await prisma.note.delete({
      where: { id: noteId }
    });

    return reply.status(204).send();
  });
}
