import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';

type JiraIssue = {
  key: string;
  fields: {
    summary: string;
    created: string;
    status: {
      name: string;
    };
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    creator?: JiraUser | null;
  };
};

type JiraUser = {
  accountId?: string;
  displayName?: string;
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
  reconcileIssues?: number[];
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
    author?: JiraUser;
    items: Array<{
      field: string;
      fromString?: string;
      toString?: string;
    }>;
  }>;
  isLast: boolean;
};

type StatusTransition = {
  at: Date;
  from: string;
  to: string;
  actor?: JiraUser;
};

type InvolvedPerson = {
  id: string;
  name: string;
  sources: string[];
};

const querySchema = z
  .object({
    projectKey: z.string().trim().min(1).optional(),
    jql: z.string().trim().min(1).optional(),
    sprintNames: z.string().trim().optional(),
    issueKey: z.string().trim().optional(),
    days: z.coerce.number().int().min(1).max(365).default(30),
    maxIssues: z.coerce.number().int().min(1).max(200).default(50)
  })
  .refine((value) => Boolean(value.projectKey || value.jql || value.issueKey), {
    message: 'projectKey, jql or issueKey is required'
  });

function getJiraConfig() {
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

function formatDateForJql(date: Date) {
  return date.toISOString().slice(0, 10);
}

function splitCommaSeparated(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function sanitizeIssueKey(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toUpperCase();

  // Formato comum de issue key: PROJ-123
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function quoteJqlValue(raw: string) {
  const escaped = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function buildIssueScopeJql(issueKey: string) {
  const quoted = quoteJqlValue(issueKey);
  return `(issuekey = ${quoted} OR parent = ${quoted} OR issue in linkedIssues(${quoted}))`;
}

function buildSprintFilterJql(sprintNames: string[]) {
  if (sprintNames.length === 0) {
    return null;
  }

  const sprintList = sprintNames.map(quoteJqlValue).join(', ');
  return `sprint in (${sprintList})`;
}

function stripOrderBy(jql: string) {
  return jql.replace(/\border\s+by\b[\s\S]*$/i, '').trim();
}

function buildEffectiveJql(input: {
  projectKey?: string;
  jql?: string;
  issueKey?: string | null;
  sprintNames: string[];
  periodStart: Date;
}) {
  const clauses: string[] = [];
  const { projectKey, jql, issueKey, sprintNames, periodStart } = input;

  if (jql) {
    clauses.push(`(${stripOrderBy(jql)})`);
  } else {
    if (projectKey) {
      clauses.push(`project = ${quoteJqlValue(projectKey)}`);
    }

    if (issueKey) {
      clauses.push(buildIssueScopeJql(issueKey));
    } else {
      clauses.push(`updated >= "${formatDateForJql(periodStart)}"`);
    }
  }

  if (issueKey && jql) {
    clauses.push(buildIssueScopeJql(issueKey));
  }

  const sprintClause = buildSprintFilterJql(sprintNames);

  if (sprintClause) {
    clauses.push(sprintClause);
  }

  return `${clauses.join(' AND ')} ORDER BY updated DESC`;
}

async function jiraRequest<T>(
  config: { baseUrl: string; authHeader: string },
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${config.baseUrl}/rest/api/3${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: config.authHeader,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira API ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

async function fetchIssues(
  config: { baseUrl: string; authHeader: string },
  jql: string,
  maxIssues: number
) {
  const pageSize = 50;
  let nextPageToken: string | undefined;
  const issues: JiraIssue[] = [];

  while (issues.length < maxIssues) {
    const requestBody: JiraEnhancedSearchRequest = {
      jql,
      maxResults: Math.min(pageSize, maxIssues - issues.length),
      fields: ['summary', 'status', 'created', 'assignee', 'reporter', 'creator'],
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
      continue;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Compatibilidade com tenants que ainda não migraram totalmente para /search/jql.
      const shouldFallbackToLegacy = message.includes('404') || message.includes('400');

      if (!shouldFallbackToLegacy) {
        throw error;
      }

      const legacyPayload = await jiraRequest<JiraLegacySearchResponse>(config, '/search', {
        method: 'POST',
        body: JSON.stringify({
          jql,
          startAt: issues.length,
          maxResults: Math.min(pageSize, maxIssues - issues.length),
          fields: ['summary', 'status', 'created', 'assignee', 'reporter', 'creator']
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
    }
  }

  return issues.slice(0, maxIssues);
}

async function fetchAllChangelogTransitions(
  config: { baseUrl: string; authHeader: string },
  issueKey: string
) {
  const pageSize = 100;
  let startAt = 0;
  const transitions: StatusTransition[] = [];

  while (true) {
    const payload = await jiraRequest<JiraChangelogResponse>(
      config,
      `/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${pageSize}`
    );

    for (const history of payload.values) {
      for (const item of history.items) {
        if (item.field !== 'status') {
          continue;
        }

        transitions.push({
          at: new Date(history.created),
          from: item.fromString ?? 'Unknown',
          to: item.toString ?? 'Unknown',
          actor: history.author
        });
      }
    }

    if (payload.isLast || payload.values.length === 0) {
      break;
    }

    startAt += pageSize;
  }

  transitions.sort((a, b) => a.at.getTime() - b.at.getTime());
  return transitions;
}

function overlapMs(rangeStart: Date, rangeEnd: Date, start: Date, end: Date) {
  const safeStart = Math.max(rangeStart.getTime(), start.getTime());
  const safeEnd = Math.min(rangeEnd.getTime(), end.getTime());
  return Math.max(0, safeEnd - safeStart);
}

function mapStatusDurationsForIssue(input: {
  issueCreatedAt: Date;
  issueCurrentStatus: string;
  transitions: StatusTransition[];
  periodStart: Date;
  periodEnd: Date;
}) {
  const durationsMs: Record<string, number> = {};
  const { issueCreatedAt, issueCurrentStatus, transitions, periodStart, periodEnd } = input;

  let currentStatus = transitions[0]?.from ?? issueCurrentStatus;
  let currentStatusStart = issueCreatedAt;

  for (const transition of transitions) {
    if (transition.at.getTime() <= currentStatusStart.getTime()) {
      currentStatus = transition.to;
      currentStatusStart = transition.at;
      continue;
    }

    const ms = overlapMs(periodStart, periodEnd, currentStatusStart, transition.at);

    if (ms > 0) {
      durationsMs[currentStatus] = (durationsMs[currentStatus] ?? 0) + ms;
    }

    currentStatus = transition.to;
    currentStatusStart = transition.at;
  }

  const tailMs = overlapMs(periodStart, periodEnd, currentStatusStart, periodEnd);

  if (tailMs > 0) {
    durationsMs[currentStatus] = (durationsMs[currentStatus] ?? 0) + tailMs;
  }

  return durationsMs;
}

function toHours(ms: number) {
  return Number((ms / (1000 * 60 * 60)).toFixed(2));
}

function mapInvolvedPeople(issue: JiraIssue, transitions: StatusTransition[]) {
  const peopleMap = new Map<string, { id: string; name: string; sources: Set<string> }>();

  const addPerson = (user: JiraUser | null | undefined, source: string) => {
    if (!user?.displayName?.trim()) {
      return;
    }

    const id = user.accountId?.trim() || user.displayName.trim();
    const name = user.displayName.trim();
    const existing = peopleMap.get(id);

    if (existing) {
      existing.sources.add(source);
      return;
    }

    peopleMap.set(id, {
      id,
      name,
      sources: new Set([source])
    });
  };

  addPerson(issue.fields.assignee, 'Responsável');
  addPerson(issue.fields.reporter, 'Reportou');
  addPerson(issue.fields.creator, 'Criou');

  for (const transition of transitions) {
    addPerson(transition.actor, 'Movimentou status');
  }

  const people = Array.from(peopleMap.values())
    .map(
      (person): InvolvedPerson => ({
        id: person.id,
        name: person.name,
        sources: Array.from(person.sources).sort((a, b) => a.localeCompare(b, 'pt-BR'))
      })
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return people;
}

export async function jiraReportsRoutes(app: FastifyInstance) {
  app.get('/kanban-time', async (request, reply) => {
    const user = requireAuth(request, reply);

    if (!user) {
      return;
    }

    const parsedQuery = querySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      return reply.status(400).send({
        message: 'Query inválida. Informe projectKey ou jql.'
      });
    }

    const jiraConfig = getJiraConfig();

    if (!jiraConfig) {
      return reply.status(500).send({
        message:
          'Jira não está configurado. Defina JIRA_BASE_URL, JIRA_EMAIL e JIRA_API_TOKEN no .env do backend.'
      });
    }

    const { days, maxIssues, projectKey, jql, sprintNames: sprintNamesRaw, issueKey: issueKeyRaw } =
      parsedQuery.data;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);
    const sprintNames = splitCommaSeparated(sprintNamesRaw);
    const issueKey = sanitizeIssueKey(issueKeyRaw);

    if (issueKeyRaw && !issueKey) {
      return reply.status(400).send({
        message: 'Issue key inválida. Use o formato PROJ-123.'
      });
    }

    const effectiveJql = buildEffectiveJql({
      projectKey,
      jql,
      issueKey,
      sprintNames,
      periodStart
    });

    try {
      const issues = await fetchIssues(jiraConfig, effectiveJql, maxIssues);
      const aggregateMsByStatus: Record<string, number> = {};
      const uniquePeople = new Set<string>();

      const issuesReport = [] as Array<{
        key: string;
        summary: string;
        currentStatus: string;
        totalHoursInPeriod: number;
        statusTimes: Array<{ status: string; hours: number }>;
        involvedPeople: InvolvedPerson[];
      }>;

      for (const issue of issues) {
        const transitions = await fetchAllChangelogTransitions(jiraConfig, issue.key);

        const durationMsByStatus = mapStatusDurationsForIssue({
          issueCreatedAt: new Date(issue.fields.created),
          issueCurrentStatus: issue.fields.status.name,
          transitions,
          periodStart,
          periodEnd
        });

        for (const [status, ms] of Object.entries(durationMsByStatus)) {
          aggregateMsByStatus[status] = (aggregateMsByStatus[status] ?? 0) + ms;
        }

        const statusTimes = Object.entries(durationMsByStatus)
          .map(([status, ms]) => ({ status, hours: toHours(ms) }))
          .sort((a, b) => b.hours - a.hours);

        const totalHoursInPeriod = statusTimes.reduce((sum, item) => sum + item.hours, 0);
        const involvedPeople = mapInvolvedPeople(issue, transitions);

        for (const person of involvedPeople) {
          uniquePeople.add(person.id);
        }

        issuesReport.push({
          key: issue.key,
          summary: issue.fields.summary,
          currentStatus: issue.fields.status.name,
          totalHoursInPeriod: Number(totalHoursInPeriod.toFixed(2)),
          statusTimes,
          involvedPeople
        });
      }

      const statusTotals = Object.entries(aggregateMsByStatus)
        .map(([status, ms]) => ({
          status,
          totalHours: toHours(ms),
          avgHoursPerIssue: toHours(ms / Math.max(issuesReport.length, 1))
        }))
        .sort((a, b) => b.totalHours - a.totalHours);

      return reply.send({
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
          days
        },
        filters: {
          projectKey: projectKey ?? null,
          issueKey,
          sprintNames,
          jql: effectiveJql,
          maxIssues
        },
        summary: {
          issuesAnalyzed: issuesReport.length,
          statusesFound: statusTotals.length,
          peopleInvolved: uniquePeople.size
        },
        statusTotals,
        issues: issuesReport
      });
    } catch (error) {
      request.log.error(error);

      const message =
        error instanceof Error
          ? error.message
          : 'Erro inesperado ao carregar relatório Jira';

      return reply.status(502).send({
        message: `Falha ao buscar dados do Jira: ${message}`
      });
    }
  });
}
