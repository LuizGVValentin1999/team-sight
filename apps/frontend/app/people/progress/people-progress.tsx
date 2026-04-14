'use client';

import '@ant-design/v5-patch-for-react-19';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Modal,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography,
  message
} from 'antd';
import dayjs from 'dayjs';
import { ArrowLeftOutlined, UserOutlined } from '@ant-design/icons';
import { AppLoading } from '../../components/app-loading';
import { AppShell } from '../../components/app-shell';

type PersonSummary = {
  id: string;
  name: string;
  email: string;
  role: 'DEV' | 'QA' | 'BA' | 'PO' | 'UX' | 'TECH_LEAD' | 'QA_LEAD' | 'MANAGER';
  seniority: 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF';
  avatarUrl: string | null;
  active: boolean;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: PersonSummary['role'];
};

type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

type DevelopmentGoal = {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  progress: number;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
};

type OneOnOneSession = {
  id: string;
  meetingDate: string;
  performanceScore: number;
  summary: string;
  highlights: string | null;
  blockers: string | null;
  nextSteps: string | null;
  createdAt: string;
};

type JiraActivity = {
  key: string;
  issueUrl: string;
  summary: string;
  status: string;
  issueType: string;
  createdAt: string;
  updatedAt: string;
  isDone: boolean;
};

type OpenPullRequest = {
  id: number;
  number: number;
  title: string;
  state: string;
  draft: boolean;
  htmlUrl: string;
  repoFullName: string;
  createdAt: string;
  updatedAt: string;
};

type JiraIssueDetailsPayload = {
  issue: {
    key: string;
    summary: string;
    issueUrl: string;
    createdAt: string;
    currentStatus: string;
    currentAssignee: string;
  };
  person: {
    id: string;
    name: string;
    jiraUserKey: string | null;
  };
  businessHoursConfig: {
    timezone: string;
    workdays: string[];
    windows: string[];
  };
  summary: {
    totalBusinessHours: number;
  };
  statusTimes: Array<{
    status: string;
    businessHours: number;
  }>;
  codeTimesByAssignee: Array<{
    assignee: string;
    businessHours: number;
    statusTimes: Array<{
      status: string;
      businessHours: number;
    }>;
  }>;
};

type ProgressPayload = {
  person: PersonSummary & {
    jiraUserKey: string | null;
    gitUsername: string | null;
  };
  metrics: {
    sessionsCount: number;
    avgPerformanceScore: number | null;
    lastPerformanceScore: number | null;
    performanceTrend: 'up' | 'down' | 'stable';
    goalsTotal: number;
    goalsDone: number;
    goalsOpen: number;
    goalsAvgProgress: number;
    jiraActivitiesTotal: number;
    jiraDoneCount: number;
    jiraInProgressCount: number;
    githubOpenPrCount: number;
  };
  goals: DevelopmentGoal[];
  oneOnOnes: OneOnOneSession[];
  jiraActivities: JiraActivity[];
  jiraWarning: string | null;
  openPullRequests: OpenPullRequest[];
  githubWarning: string | null;
  jiraFilters?: {
    days: number;
    sprintNames: string[];
    maxIssues: number;
    jql: string | null;
  };
  githubFilters?: {
    organization: string | null;
    maxItems: number;
  };
};

type GoalFormValues = {
  title: string;
  description?: string;
  targetDate?: dayjs.Dayjs;
  progress: number;
  status: GoalStatus;
};

type SessionFormValues = {
  meetingDate?: dayjs.Dayjs;
  performanceScore: number;
  summary: string;
  highlights?: string;
  blockers?: string;
  nextSteps?: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const githubOrgStorageKey = 'teamsight_github_org';
const defaultGithubOrg = process.env.NEXT_PUBLIC_GITHUB_DEFAULT_ORG ?? '';

const goalStatusOptions: Array<{ value: GoalStatus; label: string }> = [
  { value: 'NOT_STARTED', label: 'Não iniciada' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'BLOCKED', label: 'Bloqueada' },
  { value: 'DONE', label: 'Concluída' }
];

const goalStatusColor: Record<GoalStatus, string> = {
  NOT_STARTED: 'default',
  IN_PROGRESS: 'blue',
  BLOCKED: 'red',
  DONE: 'green'
};

function PerformanceTrendTag({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return <Tag color="green">Evolução positiva</Tag>;
  }

  if (trend === 'down') {
    return <Tag color="red">Atenção na evolução</Tag>;
  }

  return <Tag>Evolução estável</Tag>;
}

function PerformanceLineChart({ sessions }: { sessions: OneOnOneSession[] }) {
  const points = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(a.meetingDate).getTime() - new Date(b.meetingDate).getTime()
    );

    if (sorted.length === 0) {
      return [];
    }

    if (sorted.length === 1) {
      return [{ x: 160, y: 80, score: sorted[0].performanceScore, date: sorted[0].meetingDate }];
    }

    return sorted.map((session, index) => {
      const ratioX = index / (sorted.length - 1);
      const x = 24 + ratioX * 292;
      const ratioY = (session.performanceScore - 1) / 9;
      const y = 132 - ratioY * 96;
      return { x, y, score: session.performanceScore, date: session.meetingDate };
    });
  }, [sessions]);

  if (points.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sem histórico de 1:1" />;
  }

  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <svg viewBox="0 0 340 150" width="100%" height="220" role="img" aria-label="Evolução de desempenho">
      <rect x={0} y={0} width={340} height={150} fill="#f8fafc" rx={10} />
      <line x1={24} y1={132} x2={316} y2={132} stroke="#d1d5db" strokeWidth={1} />
      <line x1={24} y1={36} x2={24} y2={132} stroke="#d1d5db" strokeWidth={1} />
      <polyline fill="none" stroke="#1677ff" strokeWidth={3} strokeLinecap="round" points={polylinePoints} />
      {points.map((point) => (
        <g key={`${point.date}-${point.score}`}>
          <circle cx={point.x} cy={point.y} r={5} fill="#1677ff" />
        </g>
      ))}
      <text x={8} y={40} fill="#6b7280" fontSize={10}>
        10
      </text>
      <text x={10} y={136} fill="#6b7280" fontSize={10}>
        1
      </text>
    </svg>
  );
}

function formatBusinessHours(value: number) {
  return `${value.toFixed(2)} h`;
}

export function PeopleProgress() {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [goalForm] = Form.useForm<GoalFormValues>();
  const [sessionForm] = Form.useForm<SessionFormValues>();

  const [mounted, setMounted] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [activePanel, setActivePanel] = useState<'list' | 'details'>('list');
  const [jiraSprintDraft, setJiraSprintDraft] = useState('');
  const [jiraSprintApplied, setJiraSprintApplied] = useState('');
  const [githubOrgDraft, setGithubOrgDraft] = useState(defaultGithubOrg);
  const [githubOrgApplied, setGithubOrgApplied] = useState(defaultGithubOrg);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<DevelopmentGoal | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [jiraIssueModalOpen, setJiraIssueModalOpen] = useState(false);
  const [jiraIssueLoading, setJiraIssueLoading] = useState(false);
  const [jiraIssueDetail, setJiraIssueDetail] = useState<JiraIssueDetailsPayload | null>(null);
  const [jiraIssueDetailKey, setJiraIssueDetailKey] = useState<string | null>(null);
  const [goalsCurrentPage, setGoalsCurrentPage] = useState(1);
  const [goalsPageSize, setGoalsPageSize] = useState(6);
  const [jiraCurrentPage, setJiraCurrentPage] = useState(1);
  const [jiraPageSize, setJiraPageSize] = useState(8);
  const [pullRequestsCurrentPage, setPullRequestsCurrentPage] = useState(1);
  const [pullRequestsPageSize, setPullRequestsPageSize] = useState(8);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const storedOrg = localStorage.getItem(githubOrgStorageKey)?.trim();
    const nextOrg = storedOrg || defaultGithubOrg;

    if (!nextOrg) {
      return;
    }

    setGithubOrgDraft(nextOrg);
    setGithubOrgApplied(nextOrg);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    let cancelled = false;

    const bootstrapSession = async () => {
      const storedToken = localStorage.getItem('teamsight_token');

      if (!storedToken) {
        if (!cancelled) {
          setSessionChecking(false);
        }
        router.replace('/login');
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/auth/me`, {
          headers: {
            Authorization: `Bearer ${storedToken}`
          }
        });

        const data = (await response.json()) as {
          user?: AuthUser;
          message?: string;
        };

        if (!response.ok || !data.user) {
          throw new Error(data.message ?? 'Sessão inválida, faça login novamente.');
        }

        if (!cancelled) {
          setCurrentUser(data.user);
          setToken(storedToken);
        }
      } catch (error) {
        localStorage.removeItem('teamsight_token');
        localStorage.removeItem('teamsight_user_name');
        if (!cancelled) {
          const errorMessage =
            error instanceof Error ? error.message : 'Sessão inválida, faça login novamente.';
          messageApi.error(errorMessage);
        }
        router.replace('/login');
      } finally {
        if (!cancelled) {
          setSessionChecking(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [mounted, router, messageApi]);

  const loadPeople = useCallback(
    async (authToken: string) => {
      setLoadingPeople(true);

      try {
        const response = await fetch(`${apiUrl}/people`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        const data = (await response.json()) as {
          people?: PersonSummary[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(data.message ?? 'Não foi possível listar pessoas');
        }

        const loadedPeople = (data.people ?? []).filter((person) => person.active);
        setPeople(loadedPeople);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao carregar pessoas';
        messageApi.error(errorMessage);
      } finally {
        setLoadingPeople(false);
      }
    },
    [messageApi]
  );

  const loadProgress = useCallback(
    async (
      authToken: string,
      personId: string,
      sprintNamesFilter?: string,
      githubOrgFilter?: string
    ) => {
      setLoadingProgress(true);

      try {
        const params = new URLSearchParams();
        params.set('days', '60');
        params.set('maxIssues', '200');

        const normalizedSprintNames = (sprintNamesFilter ?? jiraSprintApplied).trim();
        const normalizedGithubOrg = (githubOrgFilter ?? githubOrgApplied).trim();

        if (normalizedSprintNames) {
          params.set('sprintNames', normalizedSprintNames);
        }

        if (normalizedGithubOrg) {
          params.set('githubOrg', normalizedGithubOrg);
        }

        const response = await fetch(`${apiUrl}/people/${personId}/progress?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        const data = (await response.json()) as ProgressPayload & { message?: string };

        if (!response.ok) {
          throw new Error(data.message ?? 'Não foi possível carregar o acompanhamento');
        }

        setProgress(data);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro ao carregar acompanhamento da pessoa';
        messageApi.error(errorMessage);
      } finally {
        setLoadingProgress(false);
      }
    },
    [messageApi, jiraSprintApplied, githubOrgApplied]
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadPeople(token);
  }, [token, loadPeople]);

  useEffect(() => {
    if (!token || !selectedPersonId) {
      return;
    }

    void loadProgress(token, selectedPersonId);
  }, [token, selectedPersonId, loadProgress]);

  useEffect(() => {
    if (!selectedPersonId) {
      return;
    }

    const stillExists = people.some((person) => person.id === selectedPersonId);

    if (!stillExists) {
      setSelectedPersonId(null);
      setProgress(null);
      setActivePanel('list');
    }
  }, [people, selectedPersonId]);

  useEffect(() => {
    setGoalsCurrentPage(1);
    setJiraCurrentPage(1);
    setPullRequestsCurrentPage(1);
    setJiraIssueModalOpen(false);
    setJiraIssueDetail(null);
    setJiraIssueDetailKey(null);
  }, [selectedPersonId, progress?.person.id]);

  const openCreateGoalModal = () => {
    setEditingGoal(null);
    goalForm.setFieldsValue({
      title: '',
      description: '',
      targetDate: undefined,
      progress: 0,
      status: 'NOT_STARTED'
    });
    setGoalModalOpen(true);
  };

  const openEditGoalModal = (goal: DevelopmentGoal) => {
    setEditingGoal(goal);
    goalForm.setFieldsValue({
      title: goal.title,
      description: goal.description ?? '',
      targetDate: goal.targetDate ? dayjs(goal.targetDate) : undefined,
      progress: goal.progress,
      status: goal.status
    });
    setGoalModalOpen(true);
  };

  const closeGoalModal = () => {
    setGoalModalOpen(false);
    setEditingGoal(null);
    goalForm.resetFields();
  };

  const openSessionModal = () => {
    sessionForm.setFieldsValue({
      meetingDate: dayjs(),
      performanceScore: 7,
      summary: '',
      highlights: '',
      blockers: '',
      nextSteps: ''
    });
    setSessionModalOpen(true);
  };

  const closeSessionModal = () => {
    setSessionModalOpen(false);
    sessionForm.resetFields();
  };

  const handleSaveGoal = async (values: GoalFormValues) => {
    if (!token || !selectedPersonId) {
      return;
    }

    setSavingGoal(true);

    try {
      const endpoint = editingGoal
        ? `${apiUrl}/people/${selectedPersonId}/progress/goals/${editingGoal.id}`
        : `${apiUrl}/people/${selectedPersonId}/progress/goals`;
      const method = editingGoal ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          targetDate: values.targetDate ? values.targetDate.toISOString() : null,
          progress: values.progress,
          status: values.status
        })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível salvar a meta');
      }

      messageApi.success(editingGoal ? 'Meta atualizada' : 'Meta criada');
      closeGoalModal();
      await loadProgress(token, selectedPersonId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar meta';
      messageApi.error(errorMessage);
    } finally {
      setSavingGoal(false);
    }
  };

  const handleSaveSession = async (values: SessionFormValues) => {
    if (!token || !selectedPersonId) {
      return;
    }

    setSavingSession(true);

    try {
      const response = await fetch(`${apiUrl}/people/${selectedPersonId}/progress/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          meetingDate: values.meetingDate ? values.meetingDate.toISOString() : undefined,
          performanceScore: values.performanceScore,
          summary: values.summary,
          highlights: values.highlights,
          blockers: values.blockers,
          nextSteps: values.nextSteps
        })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível registrar o 1:1');
      }

      messageApi.success('Sessão 1:1 registrada');
      closeSessionModal();
      await loadProgress(token, selectedPersonId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao registrar 1:1';
      messageApi.error(errorMessage);
    } finally {
      setSavingSession(false);
    }
  };

  const filteredPeople = useMemo(() => {
    const normalizedSearch = peopleSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return people;
    }

    return people.filter((person) =>
      `${person.name} ${person.email} ${person.role} ${person.seniority}`.toLowerCase().includes(normalizedSearch)
    );
  }, [people, peopleSearch]);

  const openPersonDetails = (personId: string) => {
    if (selectedPersonId !== personId) {
      setProgress(null);
    }
    setSelectedPersonId(personId);
    setActivePanel('details');
  };

  const goalTitleFilters = useMemo(() => {
    if (!progress) {
      return [];
    }

    return Array.from(new Set(progress.goals.map((goal) => goal.title.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .slice(0, 80)
      .map((title) => ({ text: title, value: title }));
  }, [progress]);

  const jiraKeyFilters = useMemo(() => {
    if (!progress) {
      return [];
    }

    return Array.from(new Set(progress.jiraActivities.map((activity) => activity.key)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((key) => ({ text: key, value: key }));
  }, [progress]);

  const jiraTypeFilters = useMemo(() => {
    if (!progress) {
      return [];
    }

    return Array.from(new Set(progress.jiraActivities.map((activity) => activity.issueType)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((type) => ({ text: type, value: type }));
  }, [progress]);

  const jiraStatusFilters = useMemo(() => {
    if (!progress) {
      return [];
    }

    return Array.from(new Set(progress.jiraActivities.map((activity) => activity.status)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((status) => ({ text: status, value: status }));
  }, [progress]);

  const pullRequestRepoFilters = useMemo(() => {
    if (!progress) {
      return [];
    }

    return Array.from(new Set(progress.openPullRequests.map((pullRequest) => pullRequest.repoFullName)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((repoFullName) => ({ text: repoFullName, value: repoFullName }));
  }, [progress]);

  const applySourceFilters = () => {
    const normalizedSprintNames = jiraSprintDraft.trim();
    const normalizedGithubOrg = githubOrgDraft.trim();
    setJiraSprintApplied(normalizedSprintNames);
    setGithubOrgApplied(normalizedGithubOrg);

    if (normalizedGithubOrg) {
      localStorage.setItem(githubOrgStorageKey, normalizedGithubOrg);
    }

    if (token && selectedPersonId) {
      void loadProgress(token, selectedPersonId, normalizedSprintNames, normalizedGithubOrg);
    }
  };

  const clearSourceFilters = () => {
    setJiraSprintDraft('');
    setJiraSprintApplied('');
    setGithubOrgDraft('');
    setGithubOrgApplied('');
    localStorage.removeItem(githubOrgStorageKey);

    if (token && selectedPersonId) {
      void loadProgress(token, selectedPersonId, '', '');
    }
  };

  const closeJiraIssueModal = () => {
    setJiraIssueModalOpen(false);
    setJiraIssueDetailKey(null);
    setJiraIssueDetail(null);
  };

  const openJiraIssueModal = async (issueKey: string) => {
    if (!token || !selectedPersonId) {
      return;
    }

    setJiraIssueModalOpen(true);
    setJiraIssueDetail(null);
    setJiraIssueDetailKey(issueKey);
    setJiraIssueLoading(true);

    try {
      const response = await fetch(
        `${apiUrl}/people/${selectedPersonId}/progress/jira-issue/${encodeURIComponent(issueKey)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = (await response.json()) as JiraIssueDetailsPayload & { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível carregar os detalhes da tarefa Jira.');
      }

      setJiraIssueDetail(data);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro ao carregar detalhes da tarefa Jira.';
      messageApi.error(errorMessage);
      setJiraIssueModalOpen(false);
    } finally {
      setJiraIssueLoading(false);
    }
  };

  if (!mounted || sessionChecking || !token) {
    return <AppLoading />;
  }

  return (
    <AppShell
      selectedPath="/people/progress"
      title="Acompanhamento de Pessoas"
      subtitle="Use em 1:1 para acompanhar metas, desempenho e atividades"
      currentUserName={currentUser?.name}
    >
      {contextHolder}

      <div style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            width: '200%',
            transform: activePanel === 'details' ? 'translateX(-50%)' : 'translateX(0)',
            transition: 'transform 320ms ease'
          }}
        >
          <div style={{ width: '50%', paddingRight: 8 }}>
            <Card
              title="Pessoas do time"
              extra={
                <Button
                  onClick={() => {
                    if (token) {
                      void loadPeople(token);
                    }
                  }}
                  loading={loadingPeople}
                >
                  Atualizar
                </Button>
              }
            >
              <Flex vertical gap={12}>
                <Input
                  allowClear
                  placeholder="Buscar por nome, e-mail, cargo ou nível"
                  value={peopleSearch}
                  onChange={(event) => setPeopleSearch(event.target.value)}
                />

                <Typography.Text type="secondary">
                  {filteredPeople.length} pessoa(s) encontrada(s)
                </Typography.Text>

                {filteredPeople.length === 0 ? (
                  <Empty description="Nenhuma pessoa encontrada para o filtro informado." />
                ) : (
                  <List<PersonSummary>
                    itemLayout="horizontal"
                    dataSource={filteredPeople}
                    renderItem={(person) => (
                      <List.Item
                        style={{
                          cursor: 'pointer',
                          borderRadius: 10,
                          paddingInline: 12,
                          background: person.id === selectedPersonId ? '#f0f7ff' : undefined,
                          border: '1px solid #f1f5f9'
                        }}
                        onClick={() => openPersonDetails(person.id)}
                      >
                        <List.Item.Meta
                          avatar={<Avatar src={person.avatarUrl ?? undefined} icon={<UserOutlined />} />}
                          title={
                            <Space size={8} wrap>
                              <Typography.Text strong>{person.name}</Typography.Text>
                              <Tag>{person.role}</Tag>
                              <Tag>{person.seniority}</Tag>
                            </Space>
                          }
                          description={person.email}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Flex>
            </Card>
          </div>

          <div style={{ width: '50%', paddingLeft: 8 }}>
            <Card>
              <Flex justify="space-between" gap={12} wrap>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => setActivePanel('list')}
                  disabled={activePanel === 'list'}
                >
                  Voltar para pessoas
                </Button>

                <Flex gap={8} wrap style={{ flex: '1 1 760px' }} justify={isMobile ? 'flex-start' : 'flex-end'}>
                  <Input
                    value={jiraSprintDraft}
                    onChange={(event) => setJiraSprintDraft(event.target.value)}
                    placeholder="Filtrar sprint(s): Sprint 25 ou Sprint 25,Sprint 26"
                    style={{ width: isMobile ? '100%' : 360 }}
                  />
                  <Input
                    value={githubOrgDraft}
                    onChange={(event) => setGithubOrgDraft(event.target.value)}
                    placeholder="Org GitHub (opcional): allstrategy-git"
                    style={{ width: isMobile ? '100%' : 280 }}
                  />
                  <Button onClick={applySourceFilters}>Aplicar filtros</Button>
                  <Button
                    onClick={clearSourceFilters}
                    disabled={!jiraSprintApplied && !jiraSprintDraft && !githubOrgApplied && !githubOrgDraft}
                  >
                    Limpar filtros
                  </Button>
                  <Button
                    onClick={() => {
                      if (token) {
                        void loadPeople(token);
                      }
                    }}
                    loading={loadingPeople}
                  >
                    Atualizar pessoas
                  </Button>
                  <Button
                    type="primary"
                    onClick={() => {
                      if (token && selectedPersonId) {
                        void loadProgress(token, selectedPersonId);
                      }
                    }}
                    disabled={!selectedPersonId}
                    loading={loadingProgress}
                  >
                    Atualizar acompanhamento
                  </Button>
                </Flex>
              </Flex>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                {jiraSprintApplied
                  ? `Filtro Jira ativo: ${jiraSprintApplied}`
                  : 'Sem sprint informada: exibindo atividades dos últimos 60 dias.'}{' '}
                {githubOrgApplied ? `• GitHub org: ${githubOrgApplied}` : '• GitHub: todas as orgs acessíveis'}
              </Typography.Text>
            </Card>

            {!selectedPersonId ? (
              <Card style={{ marginTop: 16 }}>
                <Empty description="Selecione uma pessoa na lista para abrir o acompanhamento." />
              </Card>
            ) : null}

            {selectedPersonId && loadingProgress && !progress ? (
              <Card loading style={{ marginTop: 16 }} />
            ) : null}

            {progress ? (
              <Flex vertical gap={16} style={{ marginTop: 16 }}>
                <Card>
                  <Flex align="center" gap={12} wrap>
                    <Avatar size={64} src={progress.person.avatarUrl ?? undefined} icon={<UserOutlined />} />
                    <div>
                      <Typography.Title level={4} style={{ margin: 0 }}>
                        {progress.person.name}
                      </Typography.Title>
                      <Typography.Text type="secondary">
                        {progress.person.email} • {progress.person.role} • {progress.person.seniority}
                      </Typography.Text>
                      <br />
                      <Space size={8} style={{ marginTop: 8 }} wrap>
                        <Tag>{progress.person.jiraUserKey ? 'Jira vinculado' : 'Sem Jira'}</Tag>
                        <Tag>{progress.person.gitUsername ? 'Git vinculado' : 'Sem Git'}</Tag>
                        <PerformanceTrendTag trend={progress.metrics.performanceTrend} />
                      </Space>
                    </div>
                  </Flex>
                </Card>

                <Flex gap={12} wrap>
                  <Card style={{ minWidth: 180 }}>
                    <Statistic title="Nota média 1:1" value={progress.metrics.avgPerformanceScore ?? '-'} />
                  </Card>
                  <Card style={{ minWidth: 180 }}>
                    <Statistic title="Última nota" value={progress.metrics.lastPerformanceScore ?? '-'} />
                  </Card>
                  <Card style={{ minWidth: 180 }}>
                    <Statistic title="Sessões 1:1" value={progress.metrics.sessionsCount} />
                  </Card>
                  <Card style={{ minWidth: 180 }}>
                    <Statistic title="Metas ativas" value={progress.metrics.goalsOpen} />
                  </Card>
                  <Card style={{ minWidth: 180 }}>
                    <Statistic title="PRs abertos" value={progress.metrics.githubOpenPrCount} />
                  </Card>
                  <Card style={{ minWidth: 220 }}>
                    <Typography.Text type="secondary">Progresso médio das metas</Typography.Text>
                    <Progress percent={Math.round(progress.metrics.goalsAvgProgress)} />
                  </Card>
                  <Card style={{ minWidth: 220 }}>
                    <Typography.Text type="secondary">Atividades Jira concluídas</Typography.Text>
                    <Progress
                      percent={
                        progress.metrics.jiraActivitiesTotal > 0
                          ? Math.round((progress.metrics.jiraDoneCount / progress.metrics.jiraActivitiesTotal) * 100)
                          : 0
                      }
                    />
                  </Card>
                </Flex>

                <Card title="Evolução de desempenho (1:1)">
                  <PerformanceLineChart sessions={progress.oneOnOnes} />
                </Card>

                <Flex gap={12} wrap align="stretch">
                  <Card
                    title={`Metas (${progress.metrics.goalsTotal})`}
                    style={{ flex: '1 1 520px', minWidth: 320 }}
                    extra={
                      <Button type="primary" onClick={openCreateGoalModal}>
                        Nova meta
                      </Button>
                    }
                  >
                    <Table<DevelopmentGoal>
                      rowKey="id"
                      dataSource={progress.goals}
                      size={isMobile ? 'small' : 'middle'}
                      scroll={{ x: 760 }}
                      pagination={{
                        current: goalsCurrentPage,
                        pageSize: goalsPageSize,
                        showSizeChanger: true,
                        showQuickJumper: true,
                        pageSizeOptions: ['5', '10', '20', '50'],
                        showTotal: (total, range) => `${range[0]}-${range[1]} de ${total} metas`,
                        onChange: (page, pageSize) => {
                          setGoalsCurrentPage(page);
                          setGoalsPageSize(pageSize);
                        }
                      }}
                      columns={[
                        {
                          title: 'Meta',
                          dataIndex: 'title',
                          filters: goalTitleFilters,
                          filterSearch: true,
                          onFilter: (value, goal) =>
                            goal.title.toLowerCase().includes(String(value).toLowerCase()),
                          render: (title: string, goal: DevelopmentGoal) => (
                            <Space direction="vertical" size={0}>
                              <Typography.Text strong>{title}</Typography.Text>
                              {goal.description ? (
                                <Typography.Text type="secondary">{goal.description}</Typography.Text>
                              ) : null}
                            </Space>
                          )
                        },
                        {
                          title: 'Status',
                          dataIndex: 'status',
                          filters: goalStatusOptions.map((item) => ({ text: item.label, value: item.value })),
                          onFilter: (value, goal) => goal.status === value,
                          render: (status: GoalStatus) => (
                            <Tag color={goalStatusColor[status]}>
                              {goalStatusOptions.find((item) => item.value === status)?.label ?? status}
                            </Tag>
                          )
                        },
                        {
                          title: 'Progresso',
                          dataIndex: 'progress',
                          filters: [
                            { text: '0% a 39%', value: 'LOW' },
                            { text: '40% a 79%', value: 'MID' },
                            { text: '80% a 100%', value: 'HIGH' }
                          ],
                          onFilter: (value, goal) => {
                            if (value === 'LOW') {
                              return goal.progress < 40;
                            }
                            if (value === 'MID') {
                              return goal.progress >= 40 && goal.progress < 80;
                            }
                            return goal.progress >= 80;
                          },
                          render: (progressValue: number) => (
                            <Progress percent={progressValue} size="small" style={{ minWidth: 120 }} />
                          )
                        },
                        {
                          title: 'Prazo',
                          dataIndex: 'targetDate',
                          filters: [
                            { text: 'Com prazo', value: 'HAS_DATE' },
                            { text: 'Sem prazo', value: 'NO_DATE' },
                            { text: 'Vencida', value: 'OVERDUE' },
                            { text: 'Próximos 30 dias', value: 'NEXT_30' }
                          ],
                          onFilter: (value, goal) => {
                            if (value === 'HAS_DATE') {
                              return Boolean(goal.targetDate);
                            }
                            if (value === 'NO_DATE') {
                              return !goal.targetDate;
                            }
                            if (!goal.targetDate) {
                              return false;
                            }

                            const target = dayjs(goal.targetDate);
                            const todayStart = dayjs().startOf('day');

                            if (value === 'OVERDUE') {
                              return target.isBefore(todayStart, 'day');
                            }

                            return target.isAfter(todayStart.subtract(1, 'day')) && target.diff(todayStart, 'day') <= 30;
                          },
                          render: (targetDate: string | null) =>
                            targetDate ? dayjs(targetDate).format('DD/MM/YYYY') : 'Sem prazo'
                        },
                        {
                          title: 'Ações',
                          key: 'actions',
                          render: (_: unknown, goal: DevelopmentGoal) => (
                            <Button size="small" onClick={() => openEditGoalModal(goal)}>
                              Editar
                            </Button>
                          )
                        }
                      ]}
                    />
                  </Card>

                  <Card
                    title={`Histórico 1:1 (${progress.oneOnOnes.length})`}
                    style={{ flex: '1 1 420px', minWidth: 320 }}
                    extra={
                      <Button type="primary" onClick={openSessionModal}>
                        Registrar 1:1
                      </Button>
                    }
                  >
                    {progress.oneOnOnes.length === 0 ? (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sem sessões registradas" />
                    ) : (
                      <Timeline
                        items={progress.oneOnOnes.map((session) => ({
                          color:
                            session.performanceScore >= 8
                              ? 'green'
                              : session.performanceScore >= 6
                                ? 'blue'
                                : 'red',
                          children: (
                            <Space direction="vertical" size={2}>
                              <Typography.Text strong>
                                {dayjs(session.meetingDate).format('DD/MM/YYYY')} • Nota {session.performanceScore}/10
                              </Typography.Text>
                              <Typography.Text>{session.summary}</Typography.Text>
                              {session.nextSteps ? (
                                <Typography.Text type="secondary">
                                  Próximos passos: {session.nextSteps}
                                </Typography.Text>
                              ) : null}
                            </Space>
                          )
                        }))}
                      />
                    )}
                  </Card>
                </Flex>

                <Card title={`Atividades Jira (${progress.metrics.jiraActivitiesTotal})`}>
                  {progress.jiraWarning ? <Alert type="warning" showIcon message={progress.jiraWarning} /> : null}
                  <Table<JiraActivity>
                    rowKey="key"
                    dataSource={progress.jiraActivities}
                    size={isMobile ? 'small' : 'middle'}
                    scroll={{ x: 760 }}
                    onRow={(record) => ({
                      onClick: () => {
                        void openJiraIssueModal(record.key);
                      },
                      style: { cursor: 'pointer' }
                    })}
                    pagination={{
                      current: jiraCurrentPage,
                      pageSize: jiraPageSize,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      pageSizeOptions: ['5', '10', '20', '50', '100'],
                      showTotal: (total, range) => `${range[0]}-${range[1]} de ${total} atividades`,
                      onChange: (page, pageSize) => {
                        setJiraCurrentPage(page);
                        setJiraPageSize(pageSize);
                      }
                    }}
                    columns={[
                      {
                        title: 'Atividade',
                        dataIndex: 'key',
                        filters: jiraKeyFilters,
                        filterSearch: true,
                        onFilter: (value, activity) => activity.key === value,
                        render: (key: string, activity: JiraActivity) => (
                          <Space direction="vertical" size={0}>
                            <Space size={8}>
                              <Typography.Text strong>{key}</Typography.Text>
                              <Typography.Link
                                href={activity.issueUrl}
                                target="_blank"
                                onClick={(event) => {
                                  event.stopPropagation();
                                }}
                              >
                                Abrir no Jira
                              </Typography.Link>
                            </Space>
                            <Typography.Text type="secondary">{activity.summary}</Typography.Text>
                          </Space>
                        )
                      },
                      {
                        title: 'Tipo',
                        dataIndex: 'issueType',
                        filters: jiraTypeFilters,
                        filterSearch: true,
                        onFilter: (value, activity) => activity.issueType === value
                      },
                      {
                        title: 'Status',
                        dataIndex: 'status',
                        filters: jiraStatusFilters,
                        filterSearch: true,
                        onFilter: (value, activity) => activity.status === value,
                        render: (status: string, activity: JiraActivity) => (
                          <Tag color={activity.isDone ? 'green' : 'blue'}>{status}</Tag>
                        )
                      },
                      {
                        title: 'Atualizada em',
                        dataIndex: 'updatedAt',
                        defaultSortOrder: 'descend',
                        sorter: (a, b) => dayjs(a.updatedAt).valueOf() - dayjs(b.updatedAt).valueOf(),
                        filters: [
                          { text: 'Últimos 7 dias', value: 'LAST_7' },
                          { text: 'Últimos 30 dias', value: 'LAST_30' },
                          { text: 'Mais de 30 dias', value: 'OLDER_30' }
                        ],
                        onFilter: (value, activity) => {
                          const updatedAt = dayjs(activity.updatedAt);
                          const daysDiff = dayjs().diff(updatedAt, 'day');

                          if (value === 'LAST_7') {
                            return daysDiff <= 7;
                          }
                          if (value === 'LAST_30') {
                            return daysDiff <= 30;
                          }
                          return daysDiff > 30;
                        },
                        render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                      }
                    ]}
                  />
                </Card>

                <Card title={`PRs Abertos no GitHub (${progress.metrics.githubOpenPrCount})`}>
                  {progress.githubWarning ? <Alert type="warning" showIcon message={progress.githubWarning} /> : null}
                  <Table<OpenPullRequest>
                    rowKey="id"
                    dataSource={progress.openPullRequests}
                    size={isMobile ? 'small' : 'middle'}
                    scroll={{ x: 900 }}
                    pagination={{
                      current: pullRequestsCurrentPage,
                      pageSize: pullRequestsPageSize,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      pageSizeOptions: ['5', '10', '20', '50', '100'],
                      showTotal: (total, range) => `${range[0]}-${range[1]} de ${total} PRs`,
                      onChange: (page, pageSize) => {
                        setPullRequestsCurrentPage(page);
                        setPullRequestsPageSize(pageSize);
                      }
                    }}
                    columns={[
                      {
                        title: 'PR',
                        dataIndex: 'number',
                        sorter: (a, b) => b.number - a.number,
                        render: (number: number, pullRequest: OpenPullRequest) => (
                          <Space direction="vertical" size={0}>
                            <Typography.Link href={pullRequest.htmlUrl} target="_blank">
                              #{number}
                            </Typography.Link>
                            <Typography.Text type="secondary">{pullRequest.title}</Typography.Text>
                          </Space>
                        )
                      },
                      {
                        title: 'Repositório',
                        dataIndex: 'repoFullName',
                        filters: pullRequestRepoFilters,
                        filterSearch: true,
                        onFilter: (value, pullRequest) => pullRequest.repoFullName === value
                      },
                      {
                        title: 'Estado',
                        dataIndex: 'state',
                        filters: [
                          { text: 'Aberto', value: 'OPEN' },
                          { text: 'Draft', value: 'DRAFT' }
                        ],
                        onFilter: (value, pullRequest) => {
                          if (value === 'DRAFT') {
                            return pullRequest.draft;
                          }
                          return pullRequest.state.toUpperCase() === 'OPEN';
                        },
                        render: (_: string, pullRequest: OpenPullRequest) =>
                          pullRequest.draft ? <Tag color="gold">Draft</Tag> : <Tag color="green">Aberto</Tag>
                      },
                      {
                        title: 'Atualizado em',
                        dataIndex: 'updatedAt',
                        defaultSortOrder: 'descend',
                        sorter: (a, b) => dayjs(a.updatedAt).valueOf() - dayjs(b.updatedAt).valueOf(),
                        render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                      }
                    ]}
                  />
                </Card>
              </Flex>
            ) : null}
          </div>
        </div>
      </div>

      <Modal
        title={jiraIssueDetail ? `Detalhes Jira: ${jiraIssueDetail.issue.key}` : 'Detalhes da tarefa Jira'}
        open={jiraIssueModalOpen}
        onCancel={closeJiraIssueModal}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 980}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        {jiraIssueLoading ? (
          <Card loading />
        ) : jiraIssueDetail ? (
          <Flex vertical gap={16}>
            <Card size="small">
              <Flex vertical gap={6}>
                <Typography.Text strong>{jiraIssueDetail.issue.summary}</Typography.Text>
                <Typography.Text type="secondary">
                  Criada em {dayjs(jiraIssueDetail.issue.createdAt).format('DD/MM/YYYY HH:mm')} • Status atual:{' '}
                  {jiraIssueDetail.issue.currentStatus} • Responsável atual: {jiraIssueDetail.issue.currentAssignee}
                </Typography.Text>
                <Typography.Text type="secondary">
                  Horário útil: {jiraIssueDetail.businessHoursConfig.windows.join(' e ')} • Segunda a sexta
                </Typography.Text>
                <Typography.Text>
                  Total em horas úteis: <Typography.Text strong>{formatBusinessHours(jiraIssueDetail.summary.totalBusinessHours)}</Typography.Text>
                </Typography.Text>
                <Typography.Link href={jiraIssueDetail.issue.issueUrl} target="_blank">
                  Abrir issue no Jira
                </Typography.Link>
              </Flex>
            </Card>

            <Card size="small" title="Tempo por etapa do Kanban">
              <Table<{ status: string; businessHours: number }>
                rowKey="status"
                dataSource={jiraIssueDetail.statusTimes}
                size="small"
                pagination={false}
                locale={{ emptyText: 'Sem tempo útil calculado para esta issue.' }}
                columns={[
                  {
                    title: 'Etapa',
                    dataIndex: 'status'
                  },
                  {
                    title: 'Horas úteis',
                    dataIndex: 'businessHours',
                    sorter: (a, b) => a.businessHours - b.businessHours,
                    defaultSortOrder: 'descend',
                    render: (value: number) => formatBusinessHours(value)
                  }
                ]}
              />
            </Card>

            <Card size="small" title="Tempo em code por dev">
              <Table<{
                assignee: string;
                businessHours: number;
                statusTimes: Array<{ status: string; businessHours: number }>;
              }>
                rowKey="assignee"
                dataSource={jiraIssueDetail.codeTimesByAssignee}
                size="small"
                pagination={false}
                locale={{ emptyText: 'Sem tempo em etapas de code para esta issue.' }}
                columns={[
                  {
                    title: 'Dev',
                    dataIndex: 'assignee'
                  },
                  {
                    title: 'Horas úteis em code',
                    dataIndex: 'businessHours',
                    sorter: (a, b) => a.businessHours - b.businessHours,
                    defaultSortOrder: 'descend',
                    render: (value: number) => formatBusinessHours(value)
                  },
                  {
                    title: 'Detalhe por etapa',
                    dataIndex: 'statusTimes',
                    render: (statusTimes: Array<{ status: string; businessHours: number }>) =>
                      statusTimes.map((item) => `${item.status}: ${formatBusinessHours(item.businessHours)}`).join(' • ')
                  }
                ]}
              />
            </Card>
          </Flex>
        ) : (
          <Empty description={jiraIssueDetailKey ? `Sem detalhes para ${jiraIssueDetailKey}` : 'Selecione uma tarefa'} />
        )}
      </Modal>

      <Modal
        title={editingGoal ? 'Editar meta' : 'Nova meta'}
        open={goalModalOpen}
        onCancel={closeGoalModal}
        onOk={() => goalForm.submit()}
        confirmLoading={savingGoal}
        okText={editingGoal ? 'Salvar' : 'Criar'}
        cancelText="Cancelar"
        width={isMobile ? 'calc(100vw - 24px)' : 620}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Form<GoalFormValues> form={goalForm} layout="vertical" onFinish={handleSaveGoal}>
          <Form.Item label="Título da meta" name="title" rules={[{ required: true, message: 'Informe um título' }]}>
            <Input placeholder="Ex.: Evoluir domínio em arquitetura de APIs" />
          </Form.Item>

          <Form.Item label="Descrição" name="description">
            <Input.TextArea rows={3} placeholder="Contexto da meta, critérios e observações" />
          </Form.Item>

          <Flex gap={12} wrap>
            <Form.Item label="Prazo" name="targetDate" style={{ minWidth: 200, flex: '1 1 200px' }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="Progresso (%)" name="progress" style={{ minWidth: 140, flex: '1 1 140px' }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="Status"
              name="status"
              style={{ minWidth: 180, flex: '1 1 180px' }}
              rules={[{ required: true, message: 'Selecione o status' }]}
            >
              <Select options={goalStatusOptions} />
            </Form.Item>
          </Flex>
        </Form>
      </Modal>

      <Modal
        title="Registrar 1:1"
        open={sessionModalOpen}
        onCancel={closeSessionModal}
        onOk={() => sessionForm.submit()}
        confirmLoading={savingSession}
        okText="Salvar"
        cancelText="Cancelar"
        width={isMobile ? 'calc(100vw - 24px)' : 680}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Form<SessionFormValues> form={sessionForm} layout="vertical" onFinish={handleSaveSession}>
          <Flex gap={12} wrap>
            <Form.Item label="Data do 1:1" name="meetingDate" style={{ minWidth: 220, flex: '1 1 220px' }}>
              <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="Nota de desempenho (1 a 10)"
              name="performanceScore"
              style={{ minWidth: 200, flex: '1 1 200px' }}
              rules={[{ required: true, message: 'Informe a nota' }]}
            >
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>

          <Form.Item
            label="Resumo da conversa"
            name="summary"
            rules={[{ required: true, message: 'Preencha o resumo da conversa' }]}
          >
            <Input.TextArea rows={3} placeholder="Principais pontos do 1:1" />
          </Form.Item>

          <Form.Item label="Destaques" name="highlights">
            <Input.TextArea rows={2} placeholder="Conquistas e pontos fortes" />
          </Form.Item>

          <Form.Item label="Bloqueios" name="blockers">
            <Input.TextArea rows={2} placeholder="Riscos, impedimentos e dificuldades" />
          </Form.Item>

          <Form.Item label="Próximos passos" name="nextSteps">
            <Input.TextArea rows={2} placeholder="Plano de ação até o próximo 1:1" />
          </Form.Item>
        </Form>
      </Modal>
    </AppShell>
  );
}
