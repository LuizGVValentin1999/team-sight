import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../lib/auth.js';

type JiraIssue = {
  key: string;
  fields: {
    summary: string;
    created: string;
    updated?: string;
    status: {
      name: string;
      statusCategory?: {
        key?: string;
      };
    };
    issuetype?: {
      name?: string;
    };
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    creator?: JiraUser | null;
    [fieldKey: string]: unknown;
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

type JiraFieldMetadata = {
  id: string;
  name?: string;
  clauseNames?: string[];
  schema?: {
    custom?: string;
    type?: string;
  };
};

type JiraStatusMetadata = {
  name?: string;
  statusCategory?: {
    key?: string;
  };
};

type JiraChangelogResponse = {
  values: Array<{
    created: string;
    author?: JiraUser;
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

type JiraIssueDetailsResponse = {
  key: string;
  fields: {
    summary: string;
    created: string;
    status: {
      name: string;
    };
    assignee?: JiraUser | null;
  };
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

const sprintFieldCache = new Map<string, string | null>();
const doneStatusesCache = new Map<string, Set<string>>();
const storyPointsFieldCache = new Map<string, string | null>();

const querySchema = z
  .object({
    projectKey: z.string().trim().min(1).optional(),
    jql: z.string().trim().min(1).optional(),
    sprintNames: z.string().trim().optional(),
    issueKey: z.string().trim().optional(),
    days: z.coerce.number().int().min(1).max(365).default(30),
    maxIssues: z.coerce.number().int().min(1).max(300).default(50)
  })
  .refine((value) => Boolean(value.projectKey || value.jql || value.issueKey), {
    message: 'projectKey, jql or issueKey is required'
  });

const issueDetailsParamsSchema = z.object({
  issueKey: z.string().trim().min(3)
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

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeJiraFieldLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizePersonName(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || 'Não atribuído';
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

function minutesToHours(minutes: number) {
  return Number((minutes / 60).toFixed(2));
}

function calculateBusinessMinutesBetween(start: Date, end: Date) {
  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  let totalMinutes = 0;
  const cursor = new Date(start.getTime());
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end.getTime());
  endDay.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= endDay.getTime()) {
    const dayOfWeek = cursor.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isWeekday) {
      const windows = [
        { startHour: 8, startMinute: 30, endHour: 12, endMinute: 0 },
        { startHour: 13, startMinute: 30, endHour: 18, endMinute: 0 }
      ];

      for (const window of windows) {
        const windowStart = new Date(cursor.getTime());
        windowStart.setHours(window.startHour, window.startMinute, 0, 0);

        const windowEnd = new Date(cursor.getTime());
        windowEnd.setHours(window.endHour, window.endMinute, 0, 0);

        const overlapStart = Math.max(start.getTime(), windowStart.getTime());
        const overlapEnd = Math.min(end.getTime(), windowEnd.getTime());

        if (overlapEnd > overlapStart) {
          totalMinutes += (overlapEnd - overlapStart) / (1000 * 60);
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMinutes;
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

async function resolveSprintFieldId(config: { baseUrl: string; authHeader: string }) {
  if (sprintFieldCache.has(config.baseUrl)) {
    return sprintFieldCache.get(config.baseUrl) ?? null;
  }

  try {
    const fields = await jiraRequest<JiraFieldMetadata[]>(config, '/field');
    const matched =
      fields.find((field) => normalizeText(field.name ?? '') === 'sprint') ??
      fields.find((field) =>
        [field.name ?? '', ...(field.clauseNames ?? [])]
          .map(normalizeText)
          .some((label) => label === 'sprint' || label.includes('sprint'))
      ) ??
      fields.find((field) => normalizeText(field.schema?.custom ?? '').includes('sprint')) ??
      null;

    const fieldId = matched?.id?.trim() || null;
    sprintFieldCache.set(config.baseUrl, fieldId);
    return fieldId;
  } catch {
    sprintFieldCache.set(config.baseUrl, null);
    return null;
  }
}

async function resolveDoneStatuses(config: { baseUrl: string; authHeader: string }) {
  if (doneStatusesCache.has(config.baseUrl)) {
    return doneStatusesCache.get(config.baseUrl) as Set<string>;
  }

  try {
    const statuses = await jiraRequest<JiraStatusMetadata[]>(config, '/status');
    const done = new Set(
      statuses
        .filter((status) => status.statusCategory?.key === 'done')
        .map((status) => normalizeText(status.name ?? ''))
        .filter(Boolean)
    );

    if (done.size === 0) {
      done.add('done');
    }

    doneStatusesCache.set(config.baseUrl, done);
    return done;
  } catch {
    const fallback = new Set(['done', 'closed', 'concluido', 'concluida', 'resolvido', 'homologado']);
    doneStatusesCache.set(config.baseUrl, fallback);
    return fallback;
  }
}

async function resolveStoryPointsFieldId(config: { baseUrl: string; authHeader: string }) {
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

function parseSprintsFromField(raw: unknown) {
  const parsed: Array<{ name: string; startDate: Date | null }> = [];

  const pushObject = (value: Record<string, unknown>) => {
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const startDateRaw = typeof value.startDate === 'string' ? value.startDate.trim() : '';
    const startDate = startDateRaw ? new Date(startDateRaw) : null;

    if (name) {
      parsed.push({
        name,
        startDate: startDate && Number.isFinite(startDate.getTime()) ? startDate : null
      });
    }
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === 'object') {
        pushObject(item as Record<string, unknown>);
      } else if (typeof item === 'string') {
        const name = item.match(/name=([^,\]]+)/i)?.[1]?.trim() || '';
        const startDateRaw = item.match(/startDate=([^,\]]+)/i)?.[1]?.trim() || '';
        const startDate = startDateRaw ? new Date(startDateRaw) : null;

        if (name) {
          parsed.push({
            name,
            startDate: startDate && Number.isFinite(startDate.getTime()) ? startDate : null
          });
        }
      }
    }
  } else if (raw && typeof raw === 'object') {
    pushObject(raw as Record<string, unknown>);
  } else if (typeof raw === 'string') {
    const name = raw.match(/name=([^,\]]+)/i)?.[1]?.trim() || '';
    const startDateRaw = raw.match(/startDate=([^,\]]+)/i)?.[1]?.trim() || '';
    const startDate = startDateRaw ? new Date(startDateRaw) : null;

    if (name) {
      parsed.push({
        name,
        startDate: startDate && Number.isFinite(startDate.getTime()) ? startDate : null
      });
    }
  }

  return parsed;
}

function resolveThroughputPeriodStart(input: {
  issues: JiraIssue[];
  sprintNames: string[];
  sprintFieldId: string | null;
  fallback: Date;
}) {
  const { issues, sprintNames, sprintFieldId, fallback } = input;

  if (!sprintFieldId || sprintNames.length === 0) {
    return {
      start: fallback,
      source: 'period' as const
    };
  }

  const sprintNamesSet = new Set(sprintNames.map((name) => normalizeText(name)));
  const starts: Date[] = [];

  for (const issue of issues) {
    const raw = issue.fields[sprintFieldId];
    const issueSprints = parseSprintsFromField(raw);

    for (const sprint of issueSprints) {
      if (!sprint.startDate) {
        continue;
      }

      if (sprintNamesSet.has(normalizeText(sprint.name))) {
        starts.push(sprint.startDate);
      }
    }
  }

  if (starts.length === 0) {
    return {
      start: fallback,
      source: 'period' as const
    };
  }

  starts.sort((a, b) => a.getTime() - b.getTime());
  return {
    start: starts[0] ?? fallback,
    source: 'sprint' as const
  };
}

async function fetchIssues(
  config: { baseUrl: string; authHeader: string },
  jql: string,
  maxIssues: number,
  extraFields: string[] = []
) {
  const pageSize = 50;
  let nextPageToken: string | undefined;
  const issues: JiraIssue[] = [];
  const fields = Array.from(
    new Set(['summary', 'status', 'created', 'assignee', 'reporter', 'creator', ...extraFields])
  );

  while (issues.length < maxIssues) {
    const requestBody: JiraEnhancedSearchRequest = {
      jql,
      maxResults: Math.min(pageSize, maxIssues - issues.length),
      fields,
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
          fields
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

async function fetchAllIssueChangelog(
  config: { baseUrl: string; authHeader: string },
  issueKey: string
) {
  const pageSize = 100;
  let startAt = 0;
  const histories: JiraChangelogResponse['values'] = [];

  while (true) {
    const payload = await jiraRequest<JiraChangelogResponse>(
      config,
      `/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${pageSize}`
    );

    histories.push(...(payload.values ?? []));

    if (payload.isLast || payload.values.length === 0) {
      break;
    }

    startAt += pageSize;
  }

  histories.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  return histories;
}

function extractStatusTransitions(changelog: JiraChangelogResponse['values']) {
  const transitions: StatusTransition[] = [];

  for (const history of changelog) {
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

  transitions.sort((a, b) => a.at.getTime() - b.at.getTime());
  return transitions;
}

function extractAssigneeTransitions(changelog: JiraChangelogResponse['values']) {
  const transitions: Array<{
    at: Date;
    from: string | null;
    to: string | null;
  }> = [];

  for (const history of changelog) {
    for (const item of history.items) {
      if (item.field !== 'assignee') {
        continue;
      }

      transitions.push({
        at: new Date(history.created),
        from: item.fromString?.trim() || null,
        to: item.toString?.trim() || null
      });
    }
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
      const sprintFieldId = sprintNames.length > 0 ? await resolveSprintFieldId(jiraConfig) : null;
      const issues = await fetchIssues(
        jiraConfig,
        effectiveJql,
        maxIssues,
        sprintFieldId ? [sprintFieldId] : []
      );
      const throughputPeriod = resolveThroughputPeriodStart({
        issues,
        sprintNames,
        sprintFieldId,
        fallback: periodStart
      });
      const doneStatuses = await resolveDoneStatuses(jiraConfig);
      const aggregateMsByStatus: Record<string, number> = {};
      const uniquePeople = new Set<string>();
      const initialAssignedByPerson = new Map<string, Set<string>>();
      const integratedByPerson = new Map<string, Set<string>>();
      const gainedByPerson = new Map<string, Set<string>>();
      const passedByPerson = new Map<string, Set<string>>();
      const currentAssignedByPerson = new Map<string, Set<string>>();

      const addIssueToPersonMap = (map: Map<string, Set<string>>, personName: string, issueKey: string) => {
        const normalizedPerson = normalizePersonName(personName);
        const existing = map.get(normalizedPerson) ?? new Set<string>();
        existing.add(issueKey);
        map.set(normalizedPerson, existing);
      };

      const issuesReport = [] as Array<{
        key: string;
        summary: string;
        currentStatus: string;
        totalHoursInPeriod: number;
        statusTimes: Array<{ status: string; hours: number }>;
        involvedPeople: InvolvedPerson[];
      }>;

      for (const issue of issues) {
        const changelog = await fetchAllIssueChangelog(jiraConfig, issue.key);
        const transitions = extractStatusTransitions(changelog);
        const assigneeTransitions = extractAssigneeTransitions(changelog);

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

        const initialAssignee = normalizePersonName(
          assigneeTransitions[0]?.from || issue.fields.assignee?.displayName
        );
        const assigneeAt = (at: Date) => {
          let assignee = initialAssignee;

          for (const change of assigneeTransitions) {
            if (change.at.getTime() > at.getTime()) {
              break;
            }

            assignee = normalizePersonName(change.to || assignee);
          }

          return assignee;
        };

        addIssueToPersonMap(initialAssignedByPerson, assigneeAt(throughputPeriod.start), issue.key);
        addIssueToPersonMap(
          currentAssignedByPerson,
          normalizePersonName(issue.fields.assignee?.displayName),
          issue.key
        );

        const firstDoneTransition = transitions.find(
          (transition) =>
            transition.at.getTime() >= throughputPeriod.start.getTime() &&
            transition.at.getTime() <= periodEnd.getTime() &&
            doneStatuses.has(normalizeText(transition.to))
        );

        if (firstDoneTransition) {
          addIssueToPersonMap(integratedByPerson, assigneeAt(firstDoneTransition.at), issue.key);
        }

        for (const change of assigneeTransitions) {
          if (
            change.at.getTime() < throughputPeriod.start.getTime() ||
            change.at.getTime() > periodEnd.getTime()
          ) {
            continue;
          }

          const from = normalizePersonName(change.from);
          const to = normalizePersonName(change.to);

          if (from === to) {
            continue;
          }

          addIssueToPersonMap(gainedByPerson, to, issue.key);
          addIssueToPersonMap(passedByPerson, from, issue.key);
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

      const throughputPeople = new Set<string>([
        ...initialAssignedByPerson.keys(),
        ...integratedByPerson.keys(),
        ...gainedByPerson.keys(),
        ...passedByPerson.keys(),
        ...currentAssignedByPerson.keys()
      ]);

      const throughputByAssignee = Array.from(throughputPeople)
        .map((assignee) => {
          const initialAssignedCount = initialAssignedByPerson.get(assignee)?.size ?? 0;
          const integratedCount = integratedByPerson.get(assignee)?.size ?? 0;
          const gainedCount = gainedByPerson.get(assignee)?.size ?? 0;
          const passedCount = passedByPerson.get(assignee)?.size ?? 0;
          const currentAssignedCount = currentAssignedByPerson.get(assignee)?.size ?? 0;

          return {
            assignee,
            initialAssignedCount,
            integratedCount,
            gainedCount,
            passedCount,
            netTransferCount: gainedCount - passedCount,
            currentAssignedCount,
            deliveryRate:
              initialAssignedCount > 0
                ? Number(((integratedCount / initialAssignedCount) * 100).toFixed(2))
                : null
          };
        })
        .sort((a, b) => {
          if (b.integratedCount !== a.integratedCount) {
            return b.integratedCount - a.integratedCount;
          }
          if (b.initialAssignedCount !== a.initialAssignedCount) {
            return b.initialAssignedCount - a.initialAssignedCount;
          }
          return a.assignee.localeCompare(b.assignee, 'pt-BR');
        });

      const throughputSummary = {
        initialAssignedTotal: throughputByAssignee.reduce((sum, item) => sum + item.initialAssignedCount, 0),
        integratedTotal: throughputByAssignee.reduce((sum, item) => sum + item.integratedCount, 0),
        gainedTotal: throughputByAssignee.reduce((sum, item) => sum + item.gainedCount, 0),
        passedTotal: throughputByAssignee.reduce((sum, item) => sum + item.passedCount, 0),
        currentAssignedTotal: throughputByAssignee.reduce((sum, item) => sum + item.currentAssignedCount, 0)
      };

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
          peopleInvolved: uniquePeople.size,
          throughputPeople: throughputByAssignee.length
        },
        throughput: {
          start: throughputPeriod.start.toISOString(),
          end: periodEnd.toISOString(),
          source: throughputPeriod.source,
          sprintField: sprintFieldId
        },
        throughputSummary,
        throughputByAssignee,
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

  app.get('/activities', async (request, reply) => {
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
      const [storyPointsFieldId, doneStatuses] = await Promise.all([
        resolveStoryPointsFieldId(jiraConfig),
        resolveDoneStatuses(jiraConfig)
      ]);

      const requestedFields = ['updated', 'issuetype'];

      if (storyPointsFieldId) {
        requestedFields.push(storyPointsFieldId);
      }

      const issues = await fetchIssues(jiraConfig, effectiveJql, maxIssues, requestedFields);
      const activities = issues.map((issue) => {
        const status = issue.fields.status.name;
        const storyPoints = extractStoryPointsFromIssue(issue, storyPointsFieldId);
        const isDone =
          issue.fields.status.statusCategory?.key === 'done' ||
          doneStatuses.has(normalizeText(status));

        return {
          key: issue.key,
          issueUrl: `${jiraConfig.baseUrl}/browse/${encodeURIComponent(issue.key)}`,
          summary: issue.fields.summary,
          status,
          issueType: issue.fields.issuetype?.name ?? 'Issue',
          storyPoints,
          createdAt: issue.fields.created,
          updatedAt: issue.fields.updated ?? issue.fields.created,
          isDone
        };
      });

      const activitiesWithPoints = activities.filter((activity) => activity.storyPoints !== null);
      const doneCount = activities.filter((activity) => activity.isDone).length;
      const inProgressCount = activities.length - doneCount;
      const storyPointsTotal = Number(
        activitiesWithPoints.reduce((sum, activity) => sum + (activity.storyPoints ?? 0), 0).toFixed(2)
      );
      const storyPointsDone = Number(
        activitiesWithPoints
          .filter((activity) => activity.isDone)
          .reduce((sum, activity) => sum + (activity.storyPoints ?? 0), 0)
          .toFixed(2)
      );

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
          maxIssues,
          storyPointsField: storyPointsFieldId
        },
        summary: {
          activitiesTotal: activities.length,
          doneCount,
          inProgressCount,
          storyPointsTotal,
          storyPointsDone,
          storyPointsInProgress: Number((storyPointsTotal - storyPointsDone).toFixed(2)),
          unestimatedCount: activities.length - activitiesWithPoints.length
        },
        activities
      });
    } catch (error) {
      request.log.error(error);

      const message =
        error instanceof Error ? error.message : 'Erro inesperado ao carregar atividades do Jira';

      return reply.status(502).send({
        message: `Falha ao buscar dados do Jira: ${message}`
      });
    }
  });

  app.get('/issue/:issueKey/details', async (request, reply) => {
    const user = requireAuth(request, reply);

    if (!user) {
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
            ? minutesToHours(calculateBusinessMinutesBetween(previousActionAt, history.at))
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
        const segmentMinutes = calculateBusinessMinutesBetween(segment.start, segment.end);

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
        businessHoursConfig: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'server-local',
          workdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          windows: ['08:30-12:00', '13:30-18:00']
        },
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
}
