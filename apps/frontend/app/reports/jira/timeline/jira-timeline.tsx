'use client';

import '@ant-design/v5-patch-for-react-19';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  Progress,
  Space,
  Tag,
  Tooltip,
  theme,
  Typography,
  message
} from 'antd';
import { BarChartOutlined, ClockCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { AppLoading } from '../../../components/app-loading';
import { AppShell } from '../../../components/app-shell';
import { JiraIssueDetailsModal } from '../../../components/jira-issue-details-modal';
import { useProtectedSession } from '../../../hooks/use-protected-session';
import { type JiraIssueDetailsPayload } from '../../../shared/jira';
import { summaryCardBaseStyle } from '../../../shared/ui-styles';
import { useThemeMode } from '../../../providers';

type JiraTimelineFormValues = {
  projectKey: string;
  issueKey?: string;
  person?: string;
  sprintNames?: string;
  days: number;
  maxIssues: number;
  jql?: string;
};

type JiraActivity = {
  key: string;
  issueUrl: string;
  summary: string;
  status: string;
  issueType: string;
  storyPoints: number | null;
  createdAt: string;
  updatedAt: string;
  isDone: boolean;
};

type JiraActivitiesResponse = {
  period: {
    start: string;
    end: string;
    days: number;
  };
  filters: {
    projectKey: string | null;
    person: string | null;
    issueKey: string | null;
    sprintNames: string[];
    jql: string;
    maxIssues: number;
    storyPointsField: string | null;
  };
  summary: {
    activitiesTotal: number;
    doneCount: number;
    inProgressCount: number;
    storyPointsTotal: number;
    storyPointsDone: number;
    storyPointsInProgress: number;
    unestimatedCount: number;
  };
  activities: JiraActivity[];
};

type TimelineActivity = JiraActivity & {
  weight: number;
  actualStart: Dayjs;
  actualEnd: Dayjs;
  forecastStart: Dayjs | null;
  forecastEnd: Dayjs | null;
  queuePosition: number | null;
};

type ForecastMode = 'story-points' | 'issues';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3399';
const timelineCardStyle: CSSProperties = summaryCardBaseStyle;

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isRecusaActivity(activity: JiraActivity) {
  const issueType = normalizeText(activity.issueType);
  return issueType.includes('recusa') || issueType.includes('rejeicao') || issueType.includes('rejeição');
}

function isRedChannelActivity(activity: JiraActivity) {
  const issueType = normalizeText(activity.issueType);
  return (
    issueType.includes('red channel') ||
    issueType.includes('canal red') ||
    (issueType.includes('canal') && issueType.includes('vermelho'))
  );
}

function isExcludedFromTimeline(activity: JiraActivity) {
  return isRecusaActivity(activity) || isRedChannelActivity(activity);
}

function formatDateTime(value: string | Dayjs) {
  return dayjs(value).format('DD/MM/YYYY HH:mm');
}

function formatDate(value: string | Dayjs) {
  return dayjs(value).format('DD/MM/YYYY');
}

function formatNumber(value: number, fractionDigits = 1) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits
  }).format(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function addDaysPrecise(base: Dayjs, days: number) {
  return dayjs(base.valueOf() + days * 24 * 60 * 60 * 1000);
}

function percentBetween(start: Dayjs, end: Dayjs, value: Dayjs) {
  const total = end.valueOf() - start.valueOf();

  if (total <= 0) {
    return 0;
  }

  return ((value.valueOf() - start.valueOf()) / total) * 100;
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function buildTicks(start: Dayjs, end: Dayjs) {
  const spanDays = Math.max(1, end.diff(start, 'day', true));
  const stepDays = Math.max(3, Math.ceil(spanDays / 8));
  const ticks: Dayjs[] = [];

  let cursor = start.startOf('day');

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    ticks.push(cursor);
    cursor = cursor.add(stepDays, 'day');
  }

  if (ticks.length === 0 || !ticks[ticks.length - 1].isSame(end, 'day')) {
    ticks.push(end.startOf('day'));
  }

  return Array.from(new Map(ticks.map((tick) => [tick.format('YYYY-MM-DD'), tick])).values());
}

function buildTimelineData(report: JiraActivitiesResponse) {
  const activities = report.activities.filter((activity) => !isExcludedFromTimeline(activity));
  const estimatedValues = activities
    .map((activity) => activity.storyPoints)
    .filter((value): value is number => value !== null);
  const estimationCoverage = activities.length > 0 ? estimatedValues.length / activities.length : 0;
  const useStoryPoints = estimatedValues.length > 0 && estimationCoverage >= 0.6;
  const fallbackWeight = useStoryPoints ? median(estimatedValues) ?? 1 : 1;
  const periodDays = Math.max(1, dayjs(report.period.end).diff(dayjs(report.period.start), 'day', true));

  const weightedActivities = activities.map((activity) => ({
    ...activity,
    weight: useStoryPoints ? activity.storyPoints ?? fallbackWeight : 1
  }));

  const doneUnits = weightedActivities
    .filter((activity) => activity.isDone)
    .reduce((sum, activity) => sum + activity.weight, 0);
  const totalUnits = weightedActivities.reduce((sum, activity) => sum + activity.weight, 0);
  const remainingUnits = Math.max(totalUnits - doneUnits, 0);
  const throughputPerDay = doneUnits > 0 ? doneUnits / periodDays : null;

  const openActivities = weightedActivities
    .filter((activity) => !activity.isDone)
    .sort((a, b) => {
      const createdDiff = dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf();

      if (createdDiff !== 0) {
        return createdDiff;
      }

      return dayjs(a.updatedAt).valueOf() - dayjs(b.updatedAt).valueOf();
    });

  let queueCursor = 0;

  const openForecastByKey = new Map<
    string,
    {
      forecastStart: Dayjs | null;
      forecastEnd: Dayjs | null;
      queuePosition: number;
    }
  >();

  for (const activity of openActivities) {
    if (!throughputPerDay) {
      openForecastByKey.set(activity.key, {
        forecastStart: null,
        forecastEnd: null,
        queuePosition: queueCursor
      });
      queueCursor += activity.weight;
      continue;
    }

    const forecastStart = addDaysPrecise(dayjs(), queueCursor / throughputPerDay);
    const forecastEnd = addDaysPrecise(dayjs(), (queueCursor + activity.weight) / throughputPerDay);

    openForecastByKey.set(activity.key, {
      forecastStart,
      forecastEnd,
      queuePosition: queueCursor
    });

    queueCursor += activity.weight;
  }

  const timelineActivities: TimelineActivity[] = weightedActivities
    .map((activity) => {
      const actualStart = dayjs(activity.createdAt);
      const actualEnd = activity.isDone ? dayjs(activity.updatedAt) : actualStart;
      const forecast = openForecastByKey.get(activity.key);
      const forecastStart = activity.isDone ? null : forecast?.forecastStart ?? null;
      const forecastEnd = activity.isDone ? null : forecast?.forecastEnd ?? null;

      return {
        ...activity,
        actualStart,
        actualEnd,
        forecastStart,
        forecastEnd,
        queuePosition: activity.isDone ? null : forecast?.queuePosition ?? null
      };
    })
    .sort((a, b) => {
      if (a.isDone !== b.isDone) {
        return a.isDone ? 1 : -1;
      }

      const aEnd = a.isDone ? a.actualEnd.valueOf() : a.forecastEnd?.valueOf() ?? Number.MAX_SAFE_INTEGER;
      const bEnd = b.isDone ? b.actualEnd.valueOf() : b.forecastEnd?.valueOf() ?? Number.MAX_SAFE_INTEGER;

      if (aEnd !== bEnd) {
        return aEnd - bEnd;
      }

      return a.key.localeCompare(b.key, 'pt-BR');
    });

  const today = dayjs();
  const dataStart = timelineActivities.reduce(
    (current, activity) => (activity.actualStart.valueOf() < current.valueOf() ? activity.actualStart : current),
    dayjs(report.period.start)
  );
  const dataEnd = timelineActivities.reduce((current, activity) => {
    const candidate = activity.isDone ? activity.actualEnd : activity.forecastEnd ?? activity.actualEnd;
    return candidate.valueOf() > current.valueOf() ? candidate : current;
  }, dayjs(report.period.end));
  const axisStart = dataStart.subtract(2, 'day');
  const axisEnd = dataEnd.add(7, 'day');
  const ticks = buildTicks(axisStart, axisEnd);
  const todayPosition = clamp(percentBetween(axisStart, axisEnd, today), 0, 100);

  return {
    activities,
    timelineActivities,
    useStoryPoints,
    estimationCoverage,
    fallbackWeight,
    periodDays,
    doneUnits,
    totalUnits,
    remainingUnits,
    throughputPerDay,
    projectedDays: throughputPerDay ? remainingUnits / throughputPerDay : null,
    projectedEnd: throughputPerDay ? addDaysPrecise(today, remainingUnits / throughputPerDay) : null,
    axisStart,
    axisEnd,
    ticks,
    todayPosition
  };
}

function TimelineRow({
  activity,
  axisStart,
  axisEnd,
  todayPosition,
  onOpenIssue,
  useStoryPoints,
  fallbackWeight,
  surfaceBackground,
  surfaceBorder,
  mutedTrackBackground
}: {
  activity: TimelineActivity;
  axisStart: Dayjs;
  axisEnd: Dayjs;
  todayPosition: number;
  onOpenIssue: (issueKey: string) => void;
  useStoryPoints: boolean;
  fallbackWeight: number;
  surfaceBackground: string;
  surfaceBorder: string;
  mutedTrackBackground: string;
}) {
  const barStartSource = activity.actualStart;
  const barEndSource = activity.isDone ? activity.actualEnd : activity.forecastEnd ?? activity.actualStart;
  const barStart = clamp(percentBetween(axisStart, axisEnd, barStartSource), 0, 100);
  const barEnd = clamp(percentBetween(axisStart, axisEnd, barEndSource), 0, 100);
  const barWidth = Math.max(barEnd - barStart, 0.75);
  const weightLabel = useStoryPoints
    ? activity.storyPoints !== null
      ? `${formatNumber(activity.storyPoints, 1)} pts`
      : `estimado em ${formatNumber(fallbackWeight, 1)} pts`
    : '1 issue';
  const statusColor = activity.isDone ? 'green' : 'gold';
  const barBackground = activity.isDone
    ? 'linear-gradient(90deg, rgba(82,196,26,0.15) 0%, rgba(82,196,26,0.9) 100%)'
    : 'linear-gradient(90deg, rgba(250,173,20,0.18) 0%, rgba(250,173,20,0.9) 100%)';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '340px minmax(720px, 1fr)',
        gap: 16,
        alignItems: 'center',
        padding: '14px 16px',
        borderRadius: 18,
        border: `1px solid ${surfaceBorder}`,
        background: surfaceBackground,
        boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)'
      }}
    >
      <Flex vertical gap={6}>
        <Space wrap size={8}>
          <Button
            type="link"
            onClick={() => onOpenIssue(activity.key)}
            style={{ padding: 0, fontWeight: 700, height: 'auto' }}
          >
            {activity.key}
          </Button>
          <Tag color={statusColor}>{activity.isDone ? 'Concluída' : activity.status}</Tag>
          <Tag>{activity.issueType}</Tag>
        </Space>

        <Typography.Text style={{ fontWeight: 600, lineHeight: 1.35 }}>{activity.summary}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Criada em {formatDateTime(activity.createdAt)} • {weightLabel} •{' '}
          {activity.isDone
            ? `concluída em ${formatDateTime(activity.updatedAt)}`
            : activity.forecastEnd
              ? `prevista para ${formatDate(activity.forecastEnd)}`
              : 'sem previsão suficiente'}
        </Typography.Text>
      </Flex>

      <div style={{ position: 'relative', height: 34, borderRadius: 999 }}>
        <div
          style={{
            position: 'absolute',
            inset: '9px 0',
            borderRadius: 999,
            background: mutedTrackBackground,
            border: `1px solid ${surfaceBorder}`
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${todayPosition}%`,
            top: 4,
            bottom: 4,
            width: 2,
            borderRadius: 999,
            background: '#1677ff',
            boxShadow: '0 0 0 4px rgba(22, 119, 255, 0.12)'
          }}
        />
        <Tooltip
          title={
            activity.isDone
              ? `Concluída em ${formatDateTime(activity.updatedAt)}`
              : activity.forecastEnd
                ? `Previsão de término: ${formatDateTime(activity.forecastEnd)}`
                : 'Sem base suficiente para previsão'
          }
        >
          <div
            style={{
              position: 'absolute',
              left: `${barStart}%`,
              width: `${barWidth}%`,
              top: 7,
              height: 20,
              borderRadius: 999,
              background: barBackground,
              border: activity.isDone ? 'none' : '1px dashed rgba(245, 158, 11, 0.7)',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
              cursor: 'pointer'
            }}
            onClick={() => onOpenIssue(activity.key)}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 999,
                background: activity.isDone
                  ? 'linear-gradient(90deg, rgba(82,196,26,0.85) 0%, rgba(82,196,26,1) 100%)'
                  : 'linear-gradient(90deg, rgba(250,173,20,0.62) 0%, rgba(250,173,20,0.95) 100%)'
              }}
            />
          </div>
        </Tooltip>
      </div>
    </div>
  );
}

export function JiraTimeline() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { token: antdToken } = theme.useToken();
  const { mode } = useThemeMode();
  const [form] = Form.useForm<JiraTimelineFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<JiraActivitiesResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jiraIssueModalOpen, setJiraIssueModalOpen] = useState(false);
  const [jiraIssueLoading, setJiraIssueLoading] = useState(false);
  const [jiraIssueDetail, setJiraIssueDetail] = useState<JiraIssueDetailsPayload | null>(null);
  const [jiraIssueDetailKey, setJiraIssueDetailKey] = useState<string | null>(null);
  const { mounted, sessionChecking, token: sessionToken, currentUser, invalidateSession } = useProtectedSession({
    apiUrl,
    onInvalidSessionMessage: (text) => {
      messageApi.error(text);
    }
  });

  const timeline = useMemo(() => (report ? buildTimelineData(report) : null), [report]);
  const excludedActivities = useMemo(
    () => report?.activities.filter((activity) => isExcludedFromTimeline(activity)) ?? [],
    [report]
  );

  const openJiraIssueModal = async (issueKey: string) => {
    if (!sessionToken) {
      return;
    }

    setJiraIssueModalOpen(true);
    setJiraIssueDetail(null);
    setJiraIssueDetailKey(issueKey);
    setJiraIssueLoading(true);

    try {
      const response = await fetch(`${apiUrl}/reports/jira/issue/${encodeURIComponent(issueKey)}/details`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });

      const data = (await response.json()) as JiraIssueDetailsPayload & { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível carregar os detalhes da tarefa Jira.');
      }

      setJiraIssueDetail(data);
    } catch (error) {
      const detailError =
        error instanceof Error ? error.message : 'Erro ao carregar detalhes da tarefa Jira.';
      messageApi.error(detailError);
      setJiraIssueModalOpen(false);
    } finally {
      setJiraIssueLoading(false);
    }
  };

  const closeJiraIssueModal = () => {
    setJiraIssueModalOpen(false);
    setJiraIssueDetailKey(null);
    setJiraIssueDetail(null);
  };

  const loadTimeline = async (values: JiraTimelineFormValues) => {
    if (!sessionToken) {
      invalidateSession('Sessão inválida, faça login novamente.');
      return;
    }

    const hasQuery = Boolean(values.projectKey?.trim() || values.issueKey?.trim() || values.jql?.trim());

    if (!hasQuery) {
      setErrorMessage('Informe `projectKey`, `issueKey` ou `jql` para carregar a timeline.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        days: String(values.days),
        maxIssues: String(values.maxIssues)
      });

      if (values.jql?.trim()) {
        params.set('jql', values.jql.trim());
      } else if (values.projectKey?.trim()) {
        params.set('projectKey', values.projectKey.trim());
      }

      if (values.issueKey?.trim()) {
        params.set('issueKey', values.issueKey.trim());
      }

      if (values.person?.trim()) {
        params.set('person', values.person.trim());
      }

      if (values.sprintNames?.trim()) {
        params.set('sprintNames', values.sprintNames.trim());
      }

      const response = await fetch(`${apiUrl}/reports/jira/activities?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });

      const data = (await response.json()) as JiraActivitiesResponse & { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Falha ao carregar timeline do Jira');
      }

      setReport(data);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro inesperado';
      setErrorMessage(text);
      messageApi.error(text);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || sessionChecking) {
    return <AppLoading />;
  }

  if (!sessionToken) {
    return <AppLoading />;
  }

  const forecastMode: ForecastMode = timeline?.useStoryPoints ? 'story-points' : 'issues';
  const doneCount = report?.summary.doneCount ?? 0;
  const totalCount = report?.summary.activitiesTotal ?? 0;
  const completionPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const projectedEndLabel = timeline?.projectedEnd ? formatDate(timeline.projectedEnd) : 'sem base suficiente';
  const activeCount = report ? report.summary.inProgressCount : 0;
  const coveragePercent = timeline ? Math.round(timeline.estimationCoverage * 100) : 0;
  const surfaceBackground =
    mode === 'dark' ? 'rgba(20,27,38,0.92)' : antdToken.colorBgElevated ?? 'rgba(255,255,255,0.72)';
  const rowBackground = mode === 'dark' ? 'rgba(20,27,38,0.92)' : 'rgba(255,255,255,0.72)';
  const rowBorder = mode === 'dark' ? 'rgba(71, 85, 105, 0.55)' : 'rgba(148, 163, 184, 0.18)';
  const mutedTrackBackground =
    mode === 'dark'
      ? 'linear-gradient(90deg, rgba(71,85,105,0.24) 0%, rgba(71,85,105,0.14) 100%)'
      : 'linear-gradient(90deg, rgba(148,163,184,0.14) 0%, rgba(148,163,184,0.08) 100%)';
  const heroCardBackground =
    mode === 'dark'
      ? 'linear-gradient(135deg, rgba(2,6,23,0.98) 0%, rgba(13,20,33,0.98) 52%, rgba(24,32,48,0.98) 100%)'
      : 'linear-gradient(135deg, rgba(22,119,255,0.14) 0%, rgba(82,196,26,0.12) 48%, rgba(255,255,255,0.92) 100%)';

  return (
    <AppShell
      title="Timeline Jira"
      subtitle="Previsão de término baseada no throughput do Jira"
      selectedPath="/reports/jira/timeline"
      currentUserName={currentUser?.name}
    >
      {contextHolder}

      <Flex vertical gap={20}>
        <Card
          style={{
            ...timelineCardStyle,
            borderRadius: 20,
            background: heroCardBackground
          }}
        >
          <Flex vertical gap={16}>
            <Flex align="start" justify="space-between" gap={16} wrap>
              <div style={{ maxWidth: 860 }}>
                <Tag color="blue">Forecast Jira</Tag>
                <Typography.Title level={3} style={{ marginTop: 8, marginBottom: 4 }}>
                  Quando os projetos devem terminar
                </Typography.Title>
                <Typography.Paragraph style={{ marginBottom: 0, maxWidth: 860 }}>
                  A timeline usa as issues retornadas do Jira e projeta a data de término com base na
                  velocidade observada no período consultado. O cálculo é uma estimativa operacional, não
                  uma data oficial do Jira.
                </Typography.Paragraph>
              </div>

              <Space wrap>
                <Tag icon={<BarChartOutlined />} color="blue">
                  {forecastMode === 'story-points' ? 'Base em story points' : 'Base em quantidade'}
                </Tag>
                <Tag icon={<ClockCircleOutlined />} color="gold">
                  Previsão: {projectedEndLabel}
                </Tag>
              </Space>
            </Flex>

            <Form
              form={form}
              layout="vertical"
              initialValues={{
                projectKey: '',
                issueKey: '',
                person: '',
                sprintNames: '',
                days: 45,
                maxIssues: 150,
                jql: ''
              }}
              onFinish={loadTimeline}
            >
              <Flex gap={12} wrap>
                <Form.Item
                  label="Project key"
                  name="projectKey"
                  style={{ minWidth: 180, flex: '1 1 180px', marginBottom: 0 }}
                >
                  <Input placeholder="FLX" />
                </Form.Item>

                <Form.Item
                  label="Issue key"
                  name="issueKey"
                  style={{ minWidth: 180, flex: '1 1 180px', marginBottom: 0 }}
                >
                  <Input placeholder="FLX-123" />
                </Form.Item>

                <Form.Item
                  label="Pessoa"
                  name="person"
                  style={{ minWidth: 180, flex: '1 1 180px', marginBottom: 0 }}
                >
                  <Input placeholder="Nome, e-mail ou chave Jira" />
                </Form.Item>

                <Form.Item
                  label="Sprints"
                  name="sprintNames"
                  style={{ minWidth: 220, flex: '1 1 220px', marginBottom: 0 }}
                >
                  <Input placeholder="Sprint 12, Sprint 13" />
                </Form.Item>

                <Form.Item
                  label="Dias"
                  name="days"
                  style={{ width: 120, marginBottom: 0 }}
                >
                  <InputNumber min={1} max={365} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label="Máx. issues"
                  name="maxIssues"
                  style={{ width: 140, marginBottom: 0 }}
                >
                  <InputNumber min={1} max={300} style={{ width: '100%' }} />
                </Form.Item>
              </Flex>

              <Form.Item label="JQL" name="jql" style={{ marginTop: 12, marginBottom: 0 }}>
                <Input.TextArea
                  rows={3}
                  placeholder="project = FLX AND statusCategory != Done"
                />
              </Form.Item>

              <Flex justify="space-between" align="center" gap={12} wrap style={{ marginTop: 16 }}>
                <Typography.Text type="secondary">
                  Dica: informe ao menos `projectKey`, `issueKey` ou um `jql` para carregar a timeline.
                </Typography.Text>

                <Button type="primary" htmlType="submit" loading={loading} icon={<PlayCircleOutlined />}>
                  Carregar timeline
                </Button>
              </Flex>
            </Form>
          </Flex>
        </Card>

        {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

        {report && timeline ? (
          <Flex vertical gap={20}>
            <Flex gap={16} wrap>
              <Card style={{ ...summaryCardBaseStyle, minWidth: 220, flex: '1 1 220px' }}>
                <Flex vertical gap={8}>
                  <Typography.Text type="secondary">Previsão final</Typography.Text>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    {projectedEndLabel}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {timeline.projectedDays !== null
                      ? `${formatNumber(timeline.projectedDays, 1)} dias a partir de agora`
                      : 'Sem velocidade suficiente para projeção'}
                  </Typography.Text>
                </Flex>
              </Card>

              <Card style={{ ...summaryCardBaseStyle, minWidth: 220, flex: '1 1 220px' }}>
                <Flex vertical gap={8}>
                  <Typography.Text type="secondary">Velocidade média</Typography.Text>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    {timeline.throughputPerDay !== null
                      ? `${formatNumber(timeline.throughputPerDay, 1)} ${
                          timeline.useStoryPoints ? 'pts/dia' : 'issues/dia'
                        }`
                      : 'Sem base'}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    Com base em {report.period.days} dias consultados
                  </Typography.Text>
                </Flex>
              </Card>

              <Card style={{ ...summaryCardBaseStyle, minWidth: 220, flex: '1 1 220px' }}>
                <Flex vertical gap={8}>
                  <Typography.Text type="secondary">Trabalho restante</Typography.Text>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    {formatNumber(timeline.remainingUnits, timeline.useStoryPoints ? 1 : 0)}{' '}
                    {timeline.useStoryPoints ? 'pts' : 'issues'}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {activeCount} em andamento, {doneCount} concluídas
                  </Typography.Text>
                </Flex>
              </Card>

              <Card style={{ ...summaryCardBaseStyle, minWidth: 220, flex: '1 1 220px' }}>
                <Flex vertical gap={8}>
                  <Typography.Text type="secondary">Cobertura de estimativa</Typography.Text>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    {coveragePercent}%
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {timeline.useStoryPoints
                      ? `${timeline.fallbackWeight > 1 ? 'Fallback médio aplicado para itens sem ponto' : 'Todos os itens contam com ponto ou estimativa equivalente'}`
                      : 'Forecast em quantidade de issues'}
                  </Typography.Text>
                </Flex>
              </Card>
            </Flex>

            <Card style={summaryCardBaseStyle}>
              <Flex vertical gap={12}>
                <Flex justify="space-between" align="center" gap={12} wrap>
                  <div>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      Visão geral da timeline
                    </Typography.Title>
                    <Typography.Text type="secondary">
                      {completionPercent}% concluído no conjunto filtrado • {report.summary.activitiesTotal}{' '}
                      issues relevantes
                    </Typography.Text>
                  </div>

                  <Progress
                    percent={completionPercent}
                    strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }}
                    style={{ width: isMobile ? '100%' : 260 }}
                  />
                </Flex>

                <Alert
                  type={timeline.estimationCoverage >= 0.6 ? 'info' : 'warning'}
                  showIcon
                  message={
                    timeline.estimationCoverage >= 0.6
                      ? 'A projeção usa story points como base principal.'
                      : 'A projeção está mais conservadora porque a cobertura de story points é baixa.'
                  }
                  description={
                    timeline.useStoryPoints
                      ? `Itens sem ponto foram ponderados com um peso médio de ${formatNumber(timeline.fallbackWeight, 1)}.`
                      : 'O forecast está baseado em quantidade de issues porque a cobertura de story points não é suficiente.'
                  }
                />

                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 1100 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '340px minmax(720px, 1fr)',
                        gap: 16,
                        padding: '0 16px 10px'
                      }}
                    >
                      <Typography.Text type="secondary">Issue</Typography.Text>
                      <div style={{ position: 'relative', height: 30 }}>
                        {timeline.ticks.map((tick) => {
                          const left = clamp(percentBetween(timeline.axisStart, timeline.axisEnd, tick), 0, 100);
                          return (
                            <div
                              key={tick.format('YYYY-MM-DD')}
                              style={{
                                position: 'absolute',
                                left: `${left}%`,
                                transform: 'translateX(-50%)',
                                top: 0,
                                textAlign: 'center',
                                fontSize: 12,
                                color: 'rgba(71, 85, 105, 0.9)'
                              }}
                            >
                              <div
                                style={{
                                  height: 10,
                                  width: 1,
                                  margin: '0 auto 4px',
                                  background: 'rgba(148,163,184,0.8)'
                                }}
                              />
                              {tick.format('DD/MM')}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <Flex vertical gap={10}>
                      {timeline.timelineActivities.map((activity) => (
                        <TimelineRow
                          key={activity.key}
                          activity={activity}
                          axisStart={timeline.axisStart}
                          axisEnd={timeline.axisEnd}
                          todayPosition={timeline.todayPosition}
                          onOpenIssue={openJiraIssueModal}
                          useStoryPoints={timeline.useStoryPoints}
                          fallbackWeight={timeline.fallbackWeight}
                          surfaceBackground={rowBackground}
                          surfaceBorder={rowBorder}
                          mutedTrackBackground={mutedTrackBackground}
                        />
                      ))}
                    </Flex>
                  </div>
                </div>
              </Flex>
            </Card>

            {excludedActivities.length > 0 ? (
              <Card style={summaryCardBaseStyle} title="Itens fora da previsão">
                <Flex vertical gap={8}>
                  <Typography.Text type="secondary">
                    Estes itens aparecem no Jira, mas não entram na projeção de término porque representam
                    recusa ou canal vermelho.
                  </Typography.Text>

                  <Flex gap={8} wrap>
                    {excludedActivities.map((activity) => (
                      <Tag key={activity.key}>
                        {activity.key} • {activity.issueType}
                      </Tag>
                    ))}
                  </Flex>
                </Flex>
              </Card>
            ) : null}

            <Card style={summaryCardBaseStyle} title="Resumo dos filtros">
              <Flex gap={12} wrap>
                <Tag>Project: {report.filters.projectKey ?? 'n/a'}</Tag>
                <Tag>Issue: {report.filters.issueKey ?? 'n/a'}</Tag>
                <Tag>Persona: {report.filters.person ?? 'n/a'}</Tag>
                <Tag>Sprints: {report.filters.sprintNames.length > 0 ? report.filters.sprintNames.join(', ') : 'n/a'}</Tag>
                <Tag>Max issues: {report.filters.maxIssues}</Tag>
              </Flex>
            </Card>
          </Flex>
        ) : (
          <Card style={summaryCardBaseStyle}>
            <Empty
              description="Informe um projeto, issue ou JQL para montar a timeline."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </Card>
        )}
      </Flex>

      <JiraIssueDetailsModal
        open={jiraIssueModalOpen}
        loading={jiraIssueLoading}
        detail={jiraIssueDetail}
        detailKey={jiraIssueDetailKey}
        isMobile={isMobile}
        onClose={closeJiraIssueModal}
      />
    </AppShell>
  );
}
