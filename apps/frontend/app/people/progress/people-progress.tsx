'use client';

import '@ant-design/v5-patch-for-react-19';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  DatePicker,
  Dropdown,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message
} from 'antd';
import type { MenuProps, UploadProps } from 'antd';
import dayjs from 'dayjs';
import { ArrowLeftOutlined, DownloadOutlined, UserOutlined } from '@ant-design/icons';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AutoLinkModal, type AutoLinkFormValues } from '../../components/auto-link-modal';
import { AppLoading } from '../../components/app-loading';
import { AppShell } from '../../components/app-shell';
import { JiraIssueDetailsModal } from '../../components/jira-issue-details-modal';
import { PersonFormModal, type PersonFormModalValues } from '../../components/person-form-modal';
import { PeopleSelectorTable } from '../../components/people-selector-table';
import { TeamSightMarkdownEditor } from '../../components/teamsight-markdown-editor';
import { useProtectedSession } from '../../hooks/use-protected-session';
import { type JiraIssueDetailsPayload } from '../../shared/jira';
import {
  type PersonRole,
  roleLabelMap,
  roleSupportsSeniority,
  type Seniority,
  seniorityLabelMap
} from '../../shared/people';
import { summaryCardBaseStyle } from '../../shared/ui-styles';
import { exportElementAsHtml, exportElementAsPdf, exportSheetsAsExcel } from '../../shared/export-utils';
import { useThemeMode } from '../../providers';

type PersonSummary = {
  id: string;
  name: string;
  email: string;
  role: PersonRole;
  seniority: Seniority;
  avatarUrl: string | null;
  jiraUserKey: string | null;
  gitUsername: string | null;
  active: boolean;
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

type ProgressNote = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
  };
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

type ProgressPayload = {
  person: PersonSummary;
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
    jiraStoryPointsTotal: number;
    jiraStoryPointsDone: number;
    jiraStoryPointsInProgress: number;
    jiraUnestimatedCount: number;
    githubOpenPrCount: number;
  };
  goals: DevelopmentGoal[];
  oneOnOnes: OneOnOneSession[];
  notes: ProgressNote[];
  jiraActivities: JiraActivity[];
  jiraWarning: string | null;
  openPullRequests: OpenPullRequest[];
  githubWarning: string | null;
  jiraFilters?: {
    days: number;
    sprintNames: string[];
    maxIssues: number;
    jql: string | null;
    storyPointsField?: string | null;
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

type NoteFormValues = {
  title: string;
  content: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const githubOrgStorageKey = 'teamsight_github_org';
const defaultGithubOrg = process.env.NEXT_PUBLIC_GITHUB_DEFAULT_ORG ?? '';
const maxAvatarSizeMb = 0.5;

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

const summaryProgressCardStyle: CSSProperties = {
  ...summaryCardBaseStyle,
  minWidth: 240
};

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Falha ao processar imagem'));
    reader.readAsDataURL(file);
  });
}

function PerformanceTrendTag({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return <Tag color="green">Evolução positiva</Tag>;
  }

  if (trend === 'down') {
    return <Tag color="red">Atenção na evolução</Tag>;
  }

  return <Tag>Evolução estável</Tag>;
}

function PerformanceLineChart({ sessions, isMobile }: { sessions: OneOnOneSession[]; isMobile: boolean }) {
  const chartData = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(a.meetingDate).getTime() - new Date(b.meetingDate).getTime()
    );

    return sorted.map((session) => ({
      id: session.id,
      score: session.performanceScore,
      dateLabel: dayjs(session.meetingDate).format('DD/MM'),
      dateFull: dayjs(session.meetingDate).format('DD/MM/YYYY')
    }));
  }, [sessions]);

  if (chartData.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sem histórico de 1:1" />;
  }

  return (
    <div style={{ width: '100%', height: isMobile ? 260 : 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 20, right: 16, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="teamsight-score-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3f87ff" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#3f87ff" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e5edf7" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="dateLabel" tick={{ fill: '#5f6b7a', fontSize: 12 }} minTickGap={24} />
          <YAxis domain={[1, 10]} ticks={[1, 3, 5, 7, 10]} tick={{ fill: '#5f6b7a', fontSize: 12 }} width={36} />
          <Tooltip
            contentStyle={{ borderRadius: 12, borderColor: '#d6e4f4' }}
            formatter={(value) => [`Nota ${value}`, 'Desempenho']}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.dateFull ? `Sessão em ${payload[0].payload.dateFull}` : 'Sessão'
            }
          />
          <Area type="monotone" dataKey="score" stroke="none" fill="url(#teamsight-score-fill)" />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#1d39c4"
            strokeWidth={3}
            dot={{ r: 5, strokeWidth: 2, fill: '#ffffff', stroke: '#1d39c4' }}
            activeDot={{ r: 7, fill: '#1d39c4' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function markdownPreview(content: string, maxLength = 160) {
  const plainText = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength - 1)}…`;
}

function releaseDocumentScrollLock() {
  if (typeof document === 'undefined') {
    return;
  }

  const unlock = (element: HTMLElement) => {
    element.classList.remove('ant-scrolling-effect');

    if (element.style.overflow === 'hidden') {
      element.style.overflow = '';
    }

    if (element.style.width) {
      element.style.width = '';
    }
  };

  unlock(document.body);
  unlock(document.documentElement);
}

export function PeopleProgress() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { mode } = useThemeMode();

  const [personForm] = Form.useForm<PersonFormModalValues>();
  const [autoLinkForm] = Form.useForm<AutoLinkFormValues>();
  const [goalForm] = Form.useForm<GoalFormValues>();
  const [sessionForm] = Form.useForm<SessionFormValues>();
  const [noteForm] = Form.useForm<NoteFormValues>();

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
  const [savingPerson, setSavingPerson] = useState(false);
  const [autoLinkLoading, setAutoLinkLoading] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [deletingGoal, setDeletingGoal] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [autoLinkModalOpen, setAutoLinkModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonSummary | null>(null);
  const [editingGoal, setEditingGoal] = useState<DevelopmentGoal | null>(null);
  const [editingSession, setEditingSession] = useState<OneOnOneSession | null>(null);
  const [editingNote, setEditingNote] = useState<ProgressNote | null>(null);
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
  const [sessionsCurrentPage, setSessionsCurrentPage] = useState(1);
  const [sessionsPageSize, setSessionsPageSize] = useState(6);
  const [notesCurrentPage, setNotesCurrentPage] = useState(1);
  const [notesPageSize, setNotesPageSize] = useState(6);
  const [messageApi, contextHolder] = message.useMessage();
  const { mounted, sessionChecking, token, currentUser, invalidateSession } = useProtectedSession({
    apiUrl,
    onInvalidSessionMessage: (text) => {
      messageApi.error(text);
    }
  });
  const currentAvatarUrl = Form.useWatch('avatarUrl', personForm) ?? '';
  const noteContentValue = Form.useWatch('content', noteForm) ?? '';
  const noteModalScrollTopRef = useRef<number>(0);
  const noteModalWasOpenedRef = useRef(false);
  const exportContainerRef = useRef<HTMLDivElement | null>(null);

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
    if (noteModalOpen || !noteModalWasOpenedRef.current) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 8;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const unlockAndRestore = () => {
      releaseDocumentScrollLock();

      window.scrollTo({
        top: noteModalScrollTopRef.current,
        left: 0,
        behavior: 'auto'
      });

      attempts += 1;

      if (attempts < maxAttempts) {
        timerId = setTimeout(unlockAndRestore, 40);
      }
    };

    unlockAndRestore();

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [noteModalOpen]);


  const handleAvatarSelect: NonNullable<UploadProps['beforeUpload']> = async (file) => {
    const isImage = file.type.startsWith('image/');

    if (!isImage) {
      messageApi.error('Selecione um arquivo de imagem.');
      return Upload.LIST_IGNORE;
    }

    const maxBytes = maxAvatarSizeMb * 1024 * 1024;

    if (file.size > maxBytes) {
      messageApi.error(`A imagem deve ter no máximo ${maxAvatarSizeMb}MB.`);
      return Upload.LIST_IGNORE;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      personForm.setFieldValue('avatarUrl', dataUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Falha ao processar imagem';
      messageApi.error(errorMessage);
    }

    return Upload.LIST_IGNORE;
  };

  const clearAvatar = () => {
    personForm.setFieldValue('avatarUrl', '');
  };

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
    setSessionsCurrentPage(1);
    setNotesCurrentPage(1);
    setJiraIssueModalOpen(false);
    setJiraIssueDetail(null);
    setJiraIssueDetailKey(null);
  }, [selectedPersonId, progress?.person.id]);

  const openCreatePersonModal = () => {
    setEditingPerson(null);
    personForm.setFieldsValue({
      name: '',
      email: '',
      role: 'DEV',
      seniority: 'MID',
      jiraUserKey: '',
      gitUsername: '',
      avatarUrl: '',
      active: true
    });
    setPersonModalOpen(true);
  };

  const openEditPersonModal = (person: PersonSummary) => {
    setEditingPerson(person);
    personForm.setFieldsValue({
      name: person.name,
      email: person.email,
      role: person.role,
      seniority: person.seniority,
      jiraUserKey: person.jiraUserKey ?? '',
      gitUsername: person.gitUsername ?? '',
      avatarUrl: person.avatarUrl ?? '',
      active: person.active
    });
    setPersonModalOpen(true);
  };

  const closePersonModal = () => {
    setPersonModalOpen(false);
    setEditingPerson(null);
    personForm.resetFields();
  };

  const openAutoLinkModal = () => {
    const lastUsedOrg = localStorage.getItem(githubOrgStorageKey)?.trim();
    autoLinkForm.setFieldsValue({
      githubOrgUrl: lastUsedOrg || defaultGithubOrg
    });
    setAutoLinkModalOpen(true);
  };

  const closeAutoLinkModal = () => {
    setAutoLinkModalOpen(false);
    autoLinkForm.resetFields();
  };

  const handleSubmitPerson = async (values: PersonFormModalValues) => {
    if (!token) {
      invalidateSession('Sessão inválida, faça login novamente.');
      return;
    }

    const editingTarget = editingPerson;
    const isEditMode = Boolean(editingTarget);
    setSavingPerson(true);

    try {
      const endpoint = editingTarget ? `${apiUrl}/people/${editingTarget.id}` : `${apiUrl}/people`;
      const method: 'POST' | 'PATCH' = editingTarget ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...values,
          seniority: roleSupportsSeniority(values.role) ? values.seniority : ('STAFF' as const)
        })
      });

      const data = (await response.json()) as {
        person?: PersonSummary;
        message?: string;
      };

      if (!response.ok || !data.person) {
        if (response.status === 401) {
          invalidateSession('Sessão inválida, faça login novamente.');
        }
        throw new Error(
          data.message ?? (isEditMode ? 'Falha ao atualizar pessoa' : 'Falha ao cadastrar pessoa')
        );
      }

      messageApi.success(isEditMode ? 'Pessoa atualizada com sucesso' : 'Pessoa cadastrada com sucesso');
      closePersonModal();
      await loadPeople(token);

      if (selectedPersonId === data.person.id && data.person.active) {
        await loadProgress(token, data.person.id);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro inesperado';
      messageApi.error(errorMessage);
    } finally {
      setSavingPerson(false);
    }
  };

  const handleAutoLinkIntegrations = async (values: AutoLinkFormValues) => {
    if (!token) {
      invalidateSession('Sessão inválida, faça login novamente.');
      return;
    }

    setAutoLinkLoading(true);

    try {
      const response = await fetch(`${apiUrl}/people/link-integrations-auto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      });

      const data = (await response.json()) as {
        message?: string;
        summary?: {
          total: number;
          jira: {
            linked: number;
            photosUpdated: number;
            notFound: number;
            unchanged: number;
            errors: number;
          };
          github: {
            linked: number;
            notFound: number;
            unchanged: number;
            errors: number;
          };
        };
      };

      if (!response.ok || !data.summary) {
        if (response.status === 401) {
          invalidateSession('Sessão inválida, faça login novamente.');
        }
        throw new Error(data.message ?? 'Falha na vinculação automática de integrações');
      }

      const { total, jira, github } = data.summary;
      localStorage.setItem(githubOrgStorageKey, values.githubOrgUrl.trim());

      messageApi.success(
        `Concluído. Total: ${total}. Jira -> vinculados: ${jira.linked}, fotos: ${jira.photosUpdated}, não encontrados: ${jira.notFound}, sem mudança: ${jira.unchanged}, erros: ${jira.errors}. GitHub -> vinculados: ${github.linked}, não encontrados: ${github.notFound}, sem mudança: ${github.unchanged}, erros: ${github.errors}.`
      );

      await loadPeople(token);

      if (selectedPersonId) {
        await loadProgress(token, selectedPersonId);
      }

      closeAutoLinkModal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao vincular integrações';
      messageApi.error(errorMessage);
    } finally {
      setAutoLinkLoading(false);
    }
  };

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
    setEditingSession(null);
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

  const openEditSessionModal = (session: OneOnOneSession) => {
    setEditingSession(session);
    sessionForm.setFieldsValue({
      meetingDate: dayjs(session.meetingDate),
      performanceScore: session.performanceScore,
      summary: session.summary,
      highlights: session.highlights ?? '',
      blockers: session.blockers ?? '',
      nextSteps: session.nextSteps ?? ''
    });
    setSessionModalOpen(true);
  };

  const closeSessionModal = () => {
    setSessionModalOpen(false);
    setEditingSession(null);
    sessionForm.resetFields();
  };

  const openCreateNoteModal = () => {
    noteModalScrollTopRef.current = window.scrollY;
    noteModalWasOpenedRef.current = true;
    setEditingNote(null);
    noteForm.setFieldsValue({
      title: '',
      content: '## Contexto\n\n- \n\n## Plano de ação\n\n- \n'
    });
    setNoteModalOpen(true);
  };

  const openEditNoteModal = (note: ProgressNote) => {
    noteModalScrollTopRef.current = window.scrollY;
    noteModalWasOpenedRef.current = true;
    setEditingNote(note);
    noteForm.setFieldsValue({
      title: note.title,
      content: note.content
    });
    setNoteModalOpen(true);
  };

  const closeNoteModal = () => {
    setNoteModalOpen(false);
    setEditingNote(null);
    noteForm.resetFields();
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

  const handleDeleteGoal = async () => {
    if (!token || !selectedPersonId || !editingGoal) {
      return;
    }

    setDeletingGoal(true);

    try {
      const response = await fetch(`${apiUrl}/people/${selectedPersonId}/progress/goals/${editingGoal.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? 'Não foi possível remover a meta');
      }

      messageApi.success('Meta removida');
      closeGoalModal();
      await loadProgress(token, selectedPersonId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao remover meta';
      messageApi.error(errorMessage);
    } finally {
      setDeletingGoal(false);
    }
  };

  const handleSaveSession = async (values: SessionFormValues) => {
    if (!token || !selectedPersonId) {
      return;
    }

    setSavingSession(true);

    try {
      const endpoint = editingSession
        ? `${apiUrl}/people/${selectedPersonId}/progress/sessions/${editingSession.id}`
        : `${apiUrl}/people/${selectedPersonId}/progress/sessions`;
      const method = editingSession ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
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
        throw new Error(data.message ?? 'Não foi possível salvar a sessão 1:1');
      }

      messageApi.success(editingSession ? 'Sessão 1:1 atualizada' : 'Sessão 1:1 registrada');
      closeSessionModal();
      await loadProgress(token, selectedPersonId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar sessão 1:1';
      messageApi.error(errorMessage);
    } finally {
      setSavingSession(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!token || !selectedPersonId || !editingSession) {
      return;
    }

    setDeletingSession(true);

    try {
      const response = await fetch(
        `${apiUrl}/people/${selectedPersonId}/progress/sessions/${editingSession.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? 'Não foi possível remover a sessão 1:1');
      }

      messageApi.success('Sessão 1:1 removida');
      closeSessionModal();
      await loadProgress(token, selectedPersonId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao remover sessão 1:1';
      messageApi.error(errorMessage);
    } finally {
      setDeletingSession(false);
    }
  };

  const handleSaveNote = async (values: NoteFormValues) => {
    if (!token || !selectedPersonId) {
      return;
    }

    setSavingNote(true);

    try {
      const endpoint = editingNote
        ? `${apiUrl}/people/${selectedPersonId}/progress/notes/${editingNote.id}`
        : `${apiUrl}/people/${selectedPersonId}/progress/notes`;
      const method = editingNote ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: values.title,
          content: values.content
        })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível salvar a anotação');
      }

      messageApi.success(editingNote ? 'Anotação atualizada' : 'Anotação criada');
      closeNoteModal();
      await loadProgress(token, selectedPersonId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar anotação';
      messageApi.error(errorMessage);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!token || !selectedPersonId || !editingNote) {
      return;
    }

    setDeletingNote(true);

    try {
      const response = await fetch(`${apiUrl}/people/${selectedPersonId}/progress/notes/${editingNote.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? 'Não foi possível remover a anotação');
      }

      messageApi.success('Anotação removida');
      closeNoteModal();
      await loadProgress(token, selectedPersonId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao remover anotação';
      messageApi.error(errorMessage);
    } finally {
      setDeletingNote(false);
    }
  };

  const filteredPeople = useMemo(() => {
    const normalizedSearch = peopleSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return people;
    }

    return people.filter((person) =>
      `${person.name} ${person.email} ${person.role} ${
        roleSupportsSeniority(person.role) ? person.seniority : ''
      } ${roleLabelMap[person.role]} ${
        roleSupportsSeniority(person.role) ? seniorityLabelMap[person.seniority] : ''
      }`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [people, peopleSearch]);

  const selectedPerson = useMemo(() => {
    if (!selectedPersonId) {
      return null;
    }

    return people.find((person) => person.id === selectedPersonId) ?? progress?.person ?? null;
  }, [people, progress?.person, selectedPersonId]);

  const openPersonDetails = (personId: string) => {
    if (selectedPersonId !== personId) {
      setProgress(null);
    }
    setSelectedPersonId(personId);
    setActivePanel('details');
  };

  const openEditSelectedPersonModal = () => {
    if (selectedPerson) {
      openEditPersonModal(selectedPerson);
      return;
    }

    messageApi.warning('Pessoa não encontrada na lista para edição.');
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

  const summaryMetrics = useMemo(() => {
    if (!progress) {
      return null;
    }

    const jiraDonePercent =
      progress.metrics.jiraActivitiesTotal > 0
        ? Math.round((progress.metrics.jiraDoneCount / progress.metrics.jiraActivitiesTotal) * 100)
        : 0;
    const storyPointsDonePercent =
      progress.metrics.jiraStoryPointsTotal > 0
        ? Math.round((progress.metrics.jiraStoryPointsDone / progress.metrics.jiraStoryPointsTotal) * 100)
        : 0;

    return {
      jiraDonePercent,
      storyPointsDonePercent,
      cards: [
        {
          title: 'Nota média 1:1',
          value:
            progress.metrics.avgPerformanceScore !== null ? progress.metrics.avgPerformanceScore.toFixed(1) : '-',
          subtitle: 'Média das sessões registradas',
          background: 'linear-gradient(145deg, #eef4ff 0%, #ffffff 62%)',
          color: '#1d39c4'
        },
        {
          title: 'Última nota',
          value:
            progress.metrics.lastPerformanceScore !== null ? progress.metrics.lastPerformanceScore.toFixed(1) : '-',
          subtitle: 'Última sessão de acompanhamento',
          background: 'linear-gradient(145deg, #f0f9ff 0%, #ffffff 62%)',
          color: '#0958d9'
        },
        {
          title: 'Sessões 1:1',
          value: progress.metrics.sessionsCount,
          subtitle: 'Total registrado no sistema',
          background: 'linear-gradient(145deg, #f6ffed 0%, #ffffff 62%)',
          color: '#237804'
        },
        {
          title: 'Metas ativas',
          value: progress.metrics.goalsOpen,
          subtitle: `${progress.metrics.goalsDone} concluída(s)`,
          background: 'linear-gradient(145deg, #fff7e6 0%, #ffffff 62%)',
          color: '#d46b08'
        },
        {
          title: 'PRs abertos',
          value: progress.metrics.githubOpenPrCount,
          subtitle: 'Pendentes de merge',
          background: 'linear-gradient(145deg, #f9f0ff 0%, #ffffff 62%)',
          color: '#531dab'
        },
        {
          title: 'Story Points (total)',
          value: progress.metrics.jiraStoryPointsTotal,
          subtitle: `${progress.metrics.jiraStoryPointsDone} concluídos`,
          background: 'linear-gradient(145deg, #fffbe6 0%, #ffffff 62%)',
          color: '#ad6800'
        },
        {
          title: 'Atividades concluídas',
          value: progress.metrics.jiraDoneCount,
          subtitle: `${progress.metrics.jiraActivitiesTotal} no período`,
          background: 'linear-gradient(145deg, #f6ffed 0%, #ffffff 62%)',
          color: '#237804'
        },
        {
          title: 'Sem estimativa',
          value: progress.metrics.jiraUnestimatedCount,
          subtitle: 'Cards sem Story Points',
          background: 'linear-gradient(145deg, #fff1f0 0%, #ffffff 62%)',
          color: '#cf1322'
        }
      ]
    };
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

  const exportMenuItems = useMemo<MenuProps['items']>(
    () => [
      { key: 'pdf', label: 'Baixar PDF' },
      { key: 'excel', label: 'Baixar Excel' },
      { key: 'html', label: 'Baixar HTML' }
    ],
    []
  );

  const buildPeopleProgressSheets = () => {
    if (!progress) {
      return [
        {
          name: 'Pessoas',
          rows: filteredPeople.map((person) => ({
            nome: person.name,
            email: person.email,
            cargo: roleLabelMap[person.role],
            nivel: roleSupportsSeniority(person.role) ? seniorityLabelMap[person.seniority] : '-',
            jira: person.jiraUserKey ?? '-',
            git: person.gitUsername ?? '-',
            ativo: person.active ? 'Sim' : 'Não'
          }))
        }
      ];
    }

    return [
      {
        name: 'Resumo',
        rows: [
          { metrica: 'Pessoa', valor: progress.person.name },
          { metrica: 'E-mail', valor: progress.person.email },
          { metrica: 'Cargo', valor: roleLabelMap[progress.person.role] },
          {
            metrica: 'Nível',
            valor: roleSupportsSeniority(progress.person.role)
              ? seniorityLabelMap[progress.person.seniority]
              : '-'
          },
          { metrica: 'Nota média 1:1', valor: progress.metrics.avgPerformanceScore ?? '-' },
          { metrica: 'Última nota 1:1', valor: progress.metrics.lastPerformanceScore ?? '-' },
          { metrica: 'Sessões 1:1', valor: progress.metrics.sessionsCount },
          { metrica: 'Metas abertas', valor: progress.metrics.goalsOpen },
          { metrica: 'Metas concluídas', valor: progress.metrics.goalsDone },
          { metrica: 'PRs abertos', valor: progress.metrics.githubOpenPrCount },
          { metrica: 'Atividades Jira', valor: progress.metrics.jiraActivitiesTotal },
          { metrica: 'Atividades concluídas', valor: progress.metrics.jiraDoneCount },
          { metrica: 'Story Points totais', valor: progress.metrics.jiraStoryPointsTotal }
        ]
      },
      {
        name: 'Atividades Jira',
        rows: progress.jiraActivities.map((activity) => ({
          key: activity.key,
          resumo: activity.summary,
          tipo: activity.issueType,
          status: activity.status,
          story_points: activity.storyPoints ?? '',
          concluida: activity.isDone ? 'Sim' : 'Não',
          criada_em: dayjs(activity.createdAt).format('DD/MM/YYYY HH:mm'),
          atualizada_em: dayjs(activity.updatedAt).format('DD/MM/YYYY HH:mm'),
          link: activity.issueUrl
        }))
      },
      {
        name: 'Metas',
        rows: progress.goals.map((goal) => ({
          titulo: goal.title,
          status: goal.status,
          progresso_percentual: goal.progress,
          data_alvo: goal.targetDate ? dayjs(goal.targetDate).format('DD/MM/YYYY') : '',
          descricao: goal.description ?? ''
        }))
      },
      {
        name: 'Historico_1_1',
        rows: progress.oneOnOnes.map((session) => ({
          data: dayjs(session.meetingDate).format('DD/MM/YYYY'),
          nota: session.performanceScore,
          resumo: session.summary,
          destaques: session.highlights ?? '',
          bloqueios: session.blockers ?? '',
          proximos_passos: session.nextSteps ?? ''
        }))
      },
      {
        name: 'Notas',
        rows: progress.notes.map((note) => ({
          titulo: note.title,
          autor: note.author.name,
          criado_em: dayjs(note.createdAt).format('DD/MM/YYYY HH:mm'),
          conteudo: note.content
        }))
      },
      {
        name: 'PRs_Abertos',
        rows: progress.openPullRequests.map((pullRequest) => ({
          repositorio: pullRequest.repoFullName,
          numero: pullRequest.number,
          titulo: pullRequest.title,
          status: pullRequest.state,
          draft: pullRequest.draft ? 'Sim' : 'Não',
          criado_em: dayjs(pullRequest.createdAt).format('DD/MM/YYYY HH:mm'),
          atualizado_em: dayjs(pullRequest.updatedAt).format('DD/MM/YYYY HH:mm'),
          link: pullRequest.htmlUrl
        }))
      }
    ];
  };

  const handleExportScreen = async (format: 'pdf' | 'excel' | 'html') => {
    const baseName = progress
      ? `acompanhamento-${progress.person.name}`
      : 'acompanhamento-pessoas';

    try {
      if (format === 'excel') {
        exportSheetsAsExcel({
          sheets: buildPeopleProgressSheets(),
          fileBaseName: baseName
        });
        messageApi.success('Excel gerado com sucesso.');
        return;
      }

      const element = exportContainerRef.current;

      if (!element) {
        messageApi.warning('Não foi possível localizar a área da tela para exportar.');
        return;
      }

      if (format === 'pdf') {
        await exportElementAsPdf({
          element,
          fileBaseName: baseName
        });
        messageApi.success('PDF gerado com sucesso.');
        return;
      }

      exportElementAsHtml({
        element,
        title: 'TeamSight - Acompanhamento',
        fileBaseName: baseName
      });
      messageApi.success('HTML gerado com sucesso.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Falha ao exportar tela.';
      messageApi.error(text);
    }
  };

  const handleExportMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'pdf' || key === 'excel' || key === 'html') {
      void handleExportScreen(key);
    }
  };

  if (!mounted || sessionChecking || !token) {
    return <AppLoading />;
  }

  return (
    <AppShell
      selectedPath="/people/progress"
      title="Acompanhamento de Pessoas"
      subtitle="Acompanhar metas, desempenho e atividades"
      currentUserName={currentUser?.name}
      headerActions={
        <Dropdown menu={{ items: exportMenuItems, onClick: handleExportMenuClick }} trigger={['click']}>
          <Button icon={<DownloadOutlined />}>Baixar tela</Button>
        </Dropdown>
      }
    >
      {contextHolder}

      <div ref={exportContainerRef} style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            width: '200%',
            transform: activePanel === 'details' ? 'translateX(-50%)' : 'translateX(0)',
            transition: 'transform 320ms ease'
          }}
        >
          <div style={{ width: '50%', paddingRight: 8 }}>
            <PeopleSelectorTable
              people={filteredPeople}
              search={peopleSearch}
              onSearchChange={setPeopleSearch}
              onRefresh={() => {
                if (token) {
                  void loadPeople(token);
                }
              }}
              refreshing={loadingPeople}
              onSelectPerson={openPersonDetails}
              selectedPersonId={selectedPersonId}
              isMobile={isMobile}
              themeMode={mode}
              headerActions={
                <>
                  <Button onClick={openAutoLinkModal} loading={autoLinkLoading}>
                    Vinculação automática
                  </Button>
                  <Button type="primary" onClick={openCreatePersonModal}>
                    Adicionar pessoa
                  </Button>
                </>
              }
            />
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
                  <Flex align="center" justify="space-between" gap={12} wrap>
                    <Flex align="center" gap={12} wrap>
                      <Avatar size={64} src={progress.person.avatarUrl ?? undefined} icon={<UserOutlined />} />
                      <div>
                        <Typography.Title level={4} style={{ margin: 0 }}>
                          {progress.person.name}
                        </Typography.Title>
                        <Typography.Text type="secondary">
                          {progress.person.email} • {roleLabelMap[progress.person.role]}
                          {roleSupportsSeniority(progress.person.role)
                            ? ` • ${seniorityLabelMap[progress.person.seniority]}`
                            : ''}
                        </Typography.Text>
                        <br />
                        <Space size={8} style={{ marginTop: 8 }} wrap>
                          <Tag>{progress.person.jiraUserKey ? 'Jira vinculado' : 'Sem Jira'}</Tag>
                          <Tag>{progress.person.gitUsername ? 'Git vinculado' : 'Sem Git'}</Tag>
                          <PerformanceTrendTag trend={progress.metrics.performanceTrend} />
                        </Space>
                      </div>
                    </Flex>

                    <Button onClick={openEditSelectedPersonModal} disabled={!selectedPerson}>
                      Editar pessoa
                    </Button>
                  </Flex>
                </Card>

                {summaryMetrics ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 12
                    }}
                  >
                    {summaryMetrics.cards.map((card) => (
                      <Card
                        key={card.title}
                        style={{
                          ...summaryCardBaseStyle,
                          background: card.background
                        }}
                        styles={{ body: { padding: 18 } }}
                      >
                        <Typography.Text type="secondary">{card.title}</Typography.Text>
                        <Typography.Title
                          level={2}
                          style={{ margin: '4px 0 0 0', color: card.color, lineHeight: 1.15 }}
                        >
                          {card.value}
                        </Typography.Title>
                        <Typography.Text type="secondary">{card.subtitle}</Typography.Text>
                      </Card>
                    ))}

                    <Card
                      style={{
                        ...summaryProgressCardStyle,
                        background: 'linear-gradient(145deg, #f7faff 0%, #ffffff 62%)'
                      }}
                      styles={{ body: { padding: 18 } }}
                    >
                      <Typography.Text type="secondary">Progresso médio das metas</Typography.Text>
                      <Progress
                        percent={Math.round(progress.metrics.goalsAvgProgress)}
                        size="small"
                        strokeColor="#722ed1"
                        style={{ marginTop: 12, marginBottom: 0 }}
                      />
                    </Card>

                    <Card
                      style={{
                        ...summaryProgressCardStyle,
                        background: 'linear-gradient(145deg, #f6ffed 0%, #ffffff 62%)'
                      }}
                      styles={{ body: { padding: 18 } }}
                    >
                      <Typography.Text type="secondary">Atividades Jira concluídas</Typography.Text>
                      <Progress
                        percent={summaryMetrics.jiraDonePercent}
                        size="small"
                        strokeColor="#237804"
                        style={{ marginTop: 12, marginBottom: 0 }}
                      />
                    </Card>

                    <Card
                      style={{
                        ...summaryProgressCardStyle,
                        background: 'linear-gradient(145deg, #fff7e6 0%, #ffffff 62%)'
                      }}
                      styles={{ body: { padding: 18 } }}
                    >
                      <Typography.Text type="secondary">Conclusão Jira por Story Points</Typography.Text>
                      <Progress
                        percent={summaryMetrics.storyPointsDonePercent}
                        size="small"
                        strokeColor="#d46b08"
                        style={{ marginTop: 12, marginBottom: 0 }}
                      />
                    </Card>
                  </div>
                ) : null}

                <Card
                  title="Evolução de desempenho (1:1)"
                  style={{
                    ...summaryCardBaseStyle,
                    background: 'linear-gradient(145deg, #f8fbff 0%, #ffffff 60%)'
                  }}
                  extra={<Typography.Text type="secondary">Escala de 1 a 10 por sessão</Typography.Text>}
                >
                  <PerformanceLineChart sessions={progress.oneOnOnes} isMobile={isMobile} />
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
                      onRow={(goal) => ({
                        onClick: () => openEditGoalModal(goal),
                        style: { cursor: 'pointer' }
                      })}
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
                      <Table<OneOnOneSession>
                        rowKey="id"
                        dataSource={progress.oneOnOnes}
                        size={isMobile ? 'small' : 'middle'}
                        scroll={{ x: 760 }}
                        onRow={(session) => ({
                          onClick: () => openEditSessionModal(session),
                          style: { cursor: 'pointer' }
                        })}
                        pagination={{
                          current: sessionsCurrentPage,
                          pageSize: sessionsPageSize,
                          showSizeChanger: true,
                          showQuickJumper: true,
                          pageSizeOptions: ['5', '10', '20', '50'],
                          showTotal: (total, range) => `${range[0]}-${range[1]} de ${total} sessões`,
                          onChange: (page, pageSize) => {
                            setSessionsCurrentPage(page);
                            setSessionsPageSize(pageSize);
                          }
                        }}
                        columns={[
                          {
                            title: 'Data',
                            dataIndex: 'meetingDate',
                            defaultSortOrder: 'descend',
                            sorter: (a, b) => dayjs(a.meetingDate).valueOf() - dayjs(b.meetingDate).valueOf(),
                            render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                          },
                          {
                            title: 'Nota',
                            dataIndex: 'performanceScore',
                            filters: [
                              { text: 'Alta (8-10)', value: 'HIGH' },
                              { text: 'Média (6-7)', value: 'MID' },
                              { text: 'Baixa (1-5)', value: 'LOW' }
                            ],
                            onFilter: (value, session) => {
                              if (value === 'HIGH') {
                                return session.performanceScore >= 8;
                              }
                              if (value === 'MID') {
                                return session.performanceScore >= 6 && session.performanceScore < 8;
                              }
                              return session.performanceScore <= 5;
                            },
                            render: (value: number) => {
                              const color = value >= 8 ? 'green' : value >= 6 ? 'blue' : 'red';
                              return <Tag color={color}>{value}/10</Tag>;
                            }
                          },
                          {
                            title: 'Resumo',
                            dataIndex: 'summary',
                            render: (summary: string, session: OneOnOneSession) => (
                              <Space direction="vertical" size={0}>
                                <Typography.Text strong>{summary}</Typography.Text>
                                {session.nextSteps ? (
                                  <Typography.Text type="secondary">
                                    Próximos passos: {session.nextSteps}
                                  </Typography.Text>
                                ) : null}
                              </Space>
                            )
                          }
                        ]}
                      />
                    )}
                  </Card>
                </Flex>

                <Card
                  title={`Anotações de acompanhamento (${progress.notes.length})`}
                  extra={
                    <Button type="primary" onClick={openCreateNoteModal}>
                      Nova anotação
                    </Button>
                  }
                >
                  {progress.notes.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sem anotações registradas" />
                  ) : (
                    <Table<ProgressNote>
                      rowKey="id"
                      dataSource={progress.notes}
                      size={isMobile ? 'small' : 'middle'}
                      scroll={{ x: 760 }}
                      onRow={(note) => ({
                        onClick: () => openEditNoteModal(note),
                        style: { cursor: 'pointer' }
                      })}
                      pagination={{
                        current: notesCurrentPage,
                        pageSize: notesPageSize,
                        showSizeChanger: true,
                        showQuickJumper: true,
                        pageSizeOptions: ['5', '10', '20', '50'],
                        showTotal: (total, range) => `${range[0]}-${range[1]} de ${total} anotações`,
                        onChange: (page, pageSize) => {
                          setNotesCurrentPage(page);
                          setNotesPageSize(pageSize);
                        }
                      }}
                      columns={[
                        {
                          title: 'Anotação',
                          dataIndex: 'title',
                          render: (title: string, note: ProgressNote) => (
                            <Space direction="vertical" size={0}>
                              <Typography.Text strong>{title}</Typography.Text>
                              <Typography.Text type="secondary">
                                {markdownPreview(note.content)}
                              </Typography.Text>
                            </Space>
                          )
                        },
                        {
                          title: 'Autor',
                          dataIndex: ['author', 'name'],
                          filters: Array.from(new Set(progress.notes.map((note) => note.author.name)))
                            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                            .map((name) => ({ text: name, value: name })),
                          onFilter: (value, note) => note.author.name === value
                        },
                        {
                          title: 'Criada em',
                          dataIndex: 'createdAt',
                          defaultSortOrder: 'descend',
                          sorter: (a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf(),
                          render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                        }
                      ]}
                    />
                  )}
                </Card>

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
                        title: 'Story Points',
                        dataIndex: 'storyPoints',
                        width: 130,
                        sorter: (a, b) => (a.storyPoints ?? -1) - (b.storyPoints ?? -1),
                        filters: [
                          { text: 'Com points', value: 'HAS_POINTS' },
                          { text: 'Sem points', value: 'NO_POINTS' }
                        ],
                        onFilter: (value, activity) => {
                          if (value === 'HAS_POINTS') {
                            return activity.storyPoints !== null;
                          }

                          return activity.storyPoints === null;
                        },
                        render: (value: number | null) => (value === null ? '-' : value)
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

      <PersonFormModal
        open={personModalOpen}
        editing={Boolean(editingPerson)}
        form={personForm}
        currentAvatarUrl={currentAvatarUrl}
        maxAvatarSizeMb={maxAvatarSizeMb}
        confirmLoading={savingPerson}
        isMobile={isMobile}
        onCancel={closePersonModal}
        onSubmit={() => personForm.submit()}
        onFinish={handleSubmitPerson}
        onAvatarSelect={handleAvatarSelect}
        onClearAvatar={clearAvatar}
      />

      <AutoLinkModal
        open={autoLinkModalOpen}
        loading={autoLinkLoading}
        isMobile={isMobile}
        defaultGithubOrg={defaultGithubOrg}
        form={autoLinkForm}
        onCancel={closeAutoLinkModal}
        onSubmit={() => autoLinkForm.submit()}
        onFinish={handleAutoLinkIntegrations}
      />

      <JiraIssueDetailsModal
        open={jiraIssueModalOpen}
        loading={jiraIssueLoading}
        detail={jiraIssueDetail}
        detailKey={jiraIssueDetailKey}
        isMobile={isMobile}
        onClose={closeJiraIssueModal}
      />

      <Modal
        title={editingGoal ? 'Editar meta' : 'Nova meta'}
        open={goalModalOpen}
        onCancel={closeGoalModal}
        footer={[
          editingGoal ? (
            <Button
              key="delete-goal"
              danger
              loading={deletingGoal}
              disabled={savingGoal || deletingGoal}
              onClick={() => void handleDeleteGoal()}
            >
              Remover
            </Button>
          ) : null,
          <Button key="cancel-goal" onClick={closeGoalModal} disabled={savingGoal || deletingGoal}>
            Cancelar
          </Button>,
          <Button
            key="save-goal"
            type="primary"
            loading={savingGoal}
            disabled={deletingGoal}
            onClick={() => goalForm.submit()}
          >
            {editingGoal ? 'Salvar' : 'Criar'}
          </Button>
        ]}
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
        title={editingSession ? 'Editar 1:1' : 'Registrar 1:1'}
        open={sessionModalOpen}
        onCancel={closeSessionModal}
        footer={[
          editingSession ? (
            <Button
              key="delete-session"
              danger
              loading={deletingSession}
              disabled={savingSession || deletingSession}
              onClick={() => void handleDeleteSession()}
            >
              Remover
            </Button>
          ) : null,
          <Button
            key="cancel-session"
            onClick={closeSessionModal}
            disabled={savingSession || deletingSession}
          >
            Cancelar
          </Button>,
          <Button
            key="save-session"
            type="primary"
            loading={savingSession}
            disabled={deletingSession}
            onClick={() => sessionForm.submit()}
          >
            Salvar
          </Button>
        ]}
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

      <Modal
        title={editingNote ? 'Editar anotação' : 'Nova anotação'}
        open={noteModalOpen}
        onCancel={closeNoteModal}
        focusTriggerAfterClose={false}
        destroyOnHidden
        afterOpenChange={(open) => {
          if (!open) {
            releaseDocumentScrollLock();
          }
        }}
        footer={[
          editingNote ? (
            <Button
              key="delete-note"
              danger
              loading={deletingNote}
              disabled={savingNote || deletingNote}
              onClick={() => void handleDeleteNote()}
            >
              Remover
            </Button>
          ) : null,
          <Button key="cancel-note" onClick={closeNoteModal} disabled={savingNote || deletingNote}>
            Cancelar
          </Button>,
          <Button
            key="save-note"
            type="primary"
            loading={savingNote}
            disabled={deletingNote}
            onClick={() => noteForm.submit()}
          >
            Salvar
          </Button>
        ]}
        width={isMobile ? 'calc(100vw - 24px)' : 920}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Form<NoteFormValues> form={noteForm} layout="vertical" onFinish={handleSaveNote}>
          <Form.Item
            label="Título"
            name="title"
            rules={[{ required: true, message: 'Informe um título para a anotação' }]}
          >
            <Input placeholder="Ex.: Sprint 28 - acompanhamento de evolução técnica" />
          </Form.Item>

          <Form.Item
            label="Anotação (Markdown)"
            name="content"
            rules={[{ required: true, message: 'Escreva a anotação em Markdown' }]}
          >
            {noteModalOpen ? (
              <TeamSightMarkdownEditor
                value={noteContentValue}
                onChange={(value) => noteForm.setFieldValue('content', value)}
                colorMode={mode === 'dark' ? 'dark' : 'light'}
                height={isMobile ? 300 : 380}
                placeholder="Use # para títulos, - para listas, **negrito** e organização da sua evolução."
              />
            ) : null}
          </Form.Item>

          <Typography.Text type="secondary">
            Dica: use `#` para título, `##` para tópicos, listas com `-` e checklists com `- [ ]`.
          </Typography.Text>
        </Form>
      </Modal>
    </AppShell>
  );
}
