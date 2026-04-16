export type JiraConfig = {
  baseUrl: string;
  authHeader: string;
};

export function getJiraConfig(): JiraConfig | null {
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

export async function jiraRequest<T>(config: JiraConfig, path: string, init?: RequestInit): Promise<T> {
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

export function splitCommaSeparated(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function quoteJqlValue(raw: string) {
  const escaped = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function formatDateForJql(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeJiraFieldLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function toFiniteNumber(value: unknown) {
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

export function sanitizeIssueKey(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(normalized)) {
    return null;
  }

  return normalized;
}
