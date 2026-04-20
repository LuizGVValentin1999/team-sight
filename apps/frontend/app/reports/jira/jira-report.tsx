'use client';

import '@ant-design/v5-patch-for-react-19';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
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
  message
} from 'antd';
import type { MenuProps } from 'antd';
import dayjs from 'dayjs';
import { DownloadOutlined } from '@ant-design/icons';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { AppLoading } from '../../components/app-loading';
import { AppShell } from '../../components/app-shell';
import { JiraIssueDetailsModal } from '../../components/jira-issue-details-modal';
import { useProtectedSession } from '../../hooks/use-protected-session';
import { exportElementAsHtml, exportElementAsPdf, exportSheetsAsExcel } from '../../shared/export-utils';
import { type JiraIssueDetailsPayload } from '../../shared/jira';
import { summaryCardBaseStyle } from '../../shared/ui-styles';

type JiraReportFormValues = {
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

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3399';
const donutColors = ['#1677ff', '#faad14', '#52c41a', '#ff4d4f'];
const filterCardStyle: CSSProperties = {
  borderRadius: 16,
  border: '1px solid #dbe6f3',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
  background: 'linear-gradient(165deg, #f8fbff 0%, #ffffff 50%)'
};

type ChartDrilldownState = {
  open: boolean;
  title: string;
  subtitle: string;
  tasks: JiraActivity[];
};

type PersonFilterOption = {
  value: string;
  label: string;
  hasJiraLink: boolean;
};

type JiraSnapshotListItem = {
  id: string;
  name: string;
  createdAt: string;
  projectKey: string | null;
  person: string | null;
  sprintNames: string[];
  days: number;
  maxIssues: number;
  activitiesTotal: number | null;
  doneCount: number | null;
  inProgressCount: number | null;
};

type JiraSnapshotPayload = {
  report: JiraActivitiesResponse;
  formFilters: JiraReportFormValues;
};

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

function isExcludedFromThroughput(activity: JiraActivity) {
  return isRecusaActivity(activity) || isRedChannelActivity(activity);
}

export function JiraReport() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [form] = Form.useForm<JiraReportFormValues>();
  const [renameSnapshotForm] = Form.useForm<{ name: string }>();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<JiraActivitiesResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const { mounted, sessionChecking, token, currentUser, invalidateSession } = useProtectedSession({
    apiUrl,
    onInvalidSessionMessage: (text) => {
      messageApi.error(text);
    }
  });
  const [jiraCurrentPage, setJiraCurrentPage] = useState(1);
  const [jiraPageSize, setJiraPageSize] = useState(10);
  const [jiraIssueModalOpen, setJiraIssueModalOpen] = useState(false);
  const [jiraIssueLoading, setJiraIssueLoading] = useState(false);
  const [jiraIssueDetail, setJiraIssueDetail] = useState<JiraIssueDetailsPayload | null>(null);
  const [jiraIssueDetailKey, setJiraIssueDetailKey] = useState<string | null>(null);
  const [recusasModalOpen, setRecusasModalOpen] = useState(false);
  const [peopleFilterOptions, setPeopleFilterOptions] = useState<PersonFilterOption[]>([]);
  const [loadingPeopleFilter, setLoadingPeopleFilter] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [snapshots, setSnapshots] = useState<JiraSnapshotListItem[]>([]);
  const [openingSnapshotId, setOpeningSnapshotId] = useState<string | null>(null);
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null);
  const [renameSnapshotModalOpen, setRenameSnapshotModalOpen] = useState(false);
  const [renamingSnapshot, setRenamingSnapshot] = useState<JiraSnapshotListItem | null>(null);
  const [renameSnapshotSaving, setRenameSnapshotSaving] = useState(false);
  const exportContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartDrilldown, setChartDrilldown] = useState<ChartDrilldownState>({
    open: false,
    title: '',
    subtitle: '',
    tasks: []
  });

  const jiraKeyFilters = useMemo(() => {
    if (!report) {
      return [];
    }

    return Array.from(new Set(report.activities.map((activity) => activity.key)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((key) => ({ text: key, value: key }));
  }, [report]);

  const jiraTypeFilters = useMemo(() => {
    if (!report) {
      return [];
    }

    return Array.from(new Set(report.activities.map((activity) => activity.issueType)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((issueType) => ({ text: issueType, value: issueType }));
  }, [report]);

  const jiraStatusFilters = useMemo(() => {
    if (!report) {
      return [];
    }

    return Array.from(new Set(report.activities.map((activity) => activity.status)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((status) => ({ text: status, value: status }));
  }, [report]);

  const dashboardData = useMemo(() => {
    if (!report) {
      return null;
    }

    const recusas = report.activities.filter(isRecusaActivity);
    const nonRecusas = report.activities.filter((activity) => !isExcludedFromThroughput(activity));
    const doneNonRecusas = nonRecusas.filter((activity) => activity.isDone).length;
    const inProgressNonRecusas = nonRecusas.length - doneNonRecusas;
    const throughputPercent =
      nonRecusas.length > 0 ? Number(((doneNonRecusas / nonRecusas.length) * 100).toFixed(2)) : 0;

    const nonRecusasWithPoints = nonRecusas.filter((activity) => activity.storyPoints !== null);
    const storyPointsTotal = Number(
      nonRecusasWithPoints.reduce((sum, activity) => sum + (activity.storyPoints ?? 0), 0).toFixed(2)
    );
    const storyPointsDone = Number(
      nonRecusasWithPoints
        .filter((activity) => activity.isDone)
        .reduce((sum, activity) => sum + (activity.storyPoints ?? 0), 0)
        .toFixed(2)
    );
    const storyPointsProgressPercent =
      storyPointsTotal > 0 ? Number(((storyPointsDone / storyPointsTotal) * 100).toFixed(2)) : 0;

    const heavyTasks = nonRecusas
      .filter((activity) => activity.storyPoints !== null)
      .sort((a, b) => {
        const pointsDiff = (b.storyPoints ?? -1) - (a.storyPoints ?? -1);

        if (pointsDiff !== 0) {
          return pointsDiff;
        }

        return dayjs(b.updatedAt).valueOf() - dayjs(a.updatedAt).valueOf();
      });

    return {
      recusas,
      nonRecusas,
      doneNonRecusas,
      inProgressNonRecusas,
      throughputPercent,
      storyPointsTotal,
      storyPointsDone,
      storyPointsProgressPercent,
      heavyTasks
    };
  }, [report]);

  const throughputChartData = useMemo(() => {
    if (!dashboardData) {
      return [];
    }

    const doneTasks = dashboardData.nonRecusas.filter((activity) => activity.isDone);
    const inProgressTasks = dashboardData.nonRecusas.filter((activity) => !activity.isDone);

    return [
      { name: 'Concluídas', value: dashboardData.doneNonRecusas, color: '#1d39c4', tasks: doneTasks },
      { name: 'Em andamento', value: dashboardData.inProgressNonRecusas, color: '#fa8c16', tasks: inProgressTasks }
    ];
  }, [dashboardData]);

  const storyPointsChartData = useMemo(() => {
    if (!dashboardData) {
      return [];
    }

    const deliveredTasks = dashboardData.nonRecusas.filter(
      (activity) => activity.storyPoints !== null && activity.isDone
    );
    const remainingTasks = dashboardData.nonRecusas.filter(
      (activity) => activity.storyPoints !== null && !activity.isDone
    );

    return [
      { name: 'Entregues', value: dashboardData.storyPointsDone, color: '#1d39c4', tasks: deliveredTasks },
      {
        name: 'Restantes',
        value: Number((dashboardData.storyPointsTotal - dashboardData.storyPointsDone).toFixed(2)),
        color: '#fa8c16',
        tasks: remainingTasks
      }
    ];
  }, [dashboardData]);

  const heavyTasksChartData = useMemo(() => {
    if (!dashboardData) {
      return [];
    }

    return dashboardData.heavyTasks
      .slice(0, 8)
      .map((activity) => ({
        key: activity.key,
        storyPoints: activity.storyPoints ?? 0,
        tasks: [activity]
      }))
      .reverse();
  }, [dashboardData]);

  const recusaByStatusChartData = useMemo(() => {
    if (!dashboardData) {
      return [];
    }

    const grouped = new Map<string, number>();

    for (const activity of dashboardData.recusas) {
      grouped.set(activity.status, (grouped.get(activity.status) ?? 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([status, total]) => ({
        status,
        total,
        tasks: dashboardData.recusas.filter((activity) => activity.status === status)
      }))
      .sort((a, b) => b.total - a.total);
  }, [dashboardData]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const loadPeopleFilterOptions = async () => {
      setLoadingPeopleFilter(true);

      try {
        const response = await fetch(`${apiUrl}/people`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = (await response.json()) as
          | {
              people?: Array<{
                id: string;
                name: string;
                email: string;
                jiraUserKey: string | null;
                active: boolean;
              }>;
              message?: string;
            }
          | undefined;

        if (!response.ok) {
          throw new Error(data?.message ?? 'Não foi possível carregar pessoas para o filtro.');
        }

        const options = (data?.people ?? [])
          .filter((person) => person.active)
          .map((person) => {
            const jiraKey = person.jiraUserKey?.trim() || '';
            const value = jiraKey || person.email.trim() || person.name.trim();
            const hasJiraLink = Boolean(jiraKey);

            return {
              value,
              hasJiraLink,
              label: hasJiraLink
                ? `${person.name} (${person.email})`
                : `${person.name} (${person.email}) • sem vínculo Jira`
            } satisfies PersonFilterOption;
          })
          .sort((a, b) => {
            if (a.hasJiraLink !== b.hasJiraLink) {
              return a.hasJiraLink ? -1 : 1;
            }
            return a.label.localeCompare(b.label, 'pt-BR');
          });

        setPeopleFilterOptions(options);
      } catch (error) {
        const text =
          error instanceof Error ? error.message : 'Erro ao carregar pessoas para o filtro.';
        messageApi.warning(text);
      } finally {
        setLoadingPeopleFilter(false);
      }
    };

    void loadPeopleFilterOptions();
  }, [token, messageApi]);

  const loadReport = async (values: JiraReportFormValues) => {
    if (!token) {
      invalidateSession('Sessão inválida, faça login novamente.');
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
          Authorization: `Bearer ${token}`
        }
      });

      const data = (await response.json()) as JiraActivitiesResponse & { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Falha ao carregar atividades do Jira');
      }

      setReport(data);
      setJiraCurrentPage(1);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro inesperado';
      setErrorMessage(text);
      messageApi.error(text);
    } finally {
      setLoading(false);
    }
  };

  const closeJiraIssueModal = () => {
    setJiraIssueModalOpen(false);
    setJiraIssueDetailKey(null);
    setJiraIssueDetail(null);
  };

  const openJiraIssueModal = async (issueKey: string) => {
    if (!token) {
      return;
    }

    setJiraIssueModalOpen(true);
    setJiraIssueDetail(null);
    setJiraIssueDetailKey(issueKey);
    setJiraIssueLoading(true);

    try {
      const response = await fetch(`${apiUrl}/reports/jira/issue/${encodeURIComponent(issueKey)}/details`, {
        headers: {
          Authorization: `Bearer ${token}`
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

  const openChartDrilldown = (title: string, subtitle: string, tasks: JiraActivity[]) => {
    setChartDrilldown({
      open: true,
      title,
      subtitle,
      tasks: [...tasks].sort((a, b) => dayjs(b.updatedAt).valueOf() - dayjs(a.updatedAt).valueOf())
    });
  };

  const closeChartDrilldown = () => {
    setChartDrilldown((prev) => ({
      ...prev,
      open: false
    }));
  };

  const loadSnapshots = async () => {
    if (!token) {
      return;
    }

    setLoadingSnapshots(true);

    try {
      const response = await fetch(`${apiUrl}/reports/jira/snapshots`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = (await response.json()) as {
        snapshots?: JiraSnapshotListItem[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível carregar snapshots');
      }

      setSnapshots(data.snapshots ?? []);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro ao carregar snapshots';
      messageApi.error(text);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const handleSaveSnapshot = async () => {
    if (!token || !report) {
      return;
    }

    setSavingSnapshot(true);

    try {
      const values = form.getFieldsValue();
      const name = `Snapshot ${dayjs().format('DD/MM/YYYY HH:mm')}`;
      const response = await fetch(`${apiUrl}/reports/jira/snapshots`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          formFilters: {
            projectKey: values.projectKey ?? '',
            issueKey: values.issueKey ?? '',
            person: values.person ?? '',
            sprintNames: values.sprintNames ?? '',
            jql: values.jql ?? '',
            days: values.days ?? 60,
            maxIssues: values.maxIssues ?? 200
          },
          report
        })
      });

      const data = (await response.json()) as { message?: string; snapshot?: { id: string } };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível salvar snapshot');
      }

      messageApi.success('Snapshot salvo no histórico');

      if (snapshotModalOpen) {
        await loadSnapshots();
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro ao salvar snapshot';
      messageApi.error(text);
    } finally {
      setSavingSnapshot(false);
    }
  };

  const openSnapshotsModal = async () => {
    setSnapshotModalOpen(true);
    await loadSnapshots();
  };

  const handleOpenSnapshot = async (snapshotId: string) => {
    if (!token) {
      return;
    }

    setOpeningSnapshotId(snapshotId);

    try {
      const response = await fetch(`${apiUrl}/reports/jira/snapshots/${encodeURIComponent(snapshotId)}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = (await response.json()) as {
        snapshot?: {
          id: string;
          name: string;
          createdAt: string;
          data: JiraSnapshotPayload;
        };
        message?: string;
      };

      if (!response.ok || !data.snapshot) {
        throw new Error(data.message ?? 'Não foi possível abrir snapshot');
      }

      const payload = data.snapshot.data;

      if (!payload?.report) {
        throw new Error('Snapshot inválido');
      }

      setReport(payload.report);
      setJiraCurrentPage(1);

      if (payload.formFilters) {
        form.setFieldsValue({
          projectKey: payload.formFilters.projectKey ?? '',
          issueKey: payload.formFilters.issueKey ?? '',
          person: payload.formFilters.person ?? '',
          sprintNames: payload.formFilters.sprintNames ?? '',
          jql: payload.formFilters.jql ?? '',
          days: payload.formFilters.days ?? 60,
          maxIssues: payload.formFilters.maxIssues ?? 200
        });
      }

      setSnapshotModalOpen(false);
      messageApi.success(`Snapshot carregado: ${data.snapshot.name}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro ao abrir snapshot';
      messageApi.error(text);
    } finally {
      setOpeningSnapshotId(null);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!token) {
      return;
    }

    setDeletingSnapshotId(snapshotId);

    try {
      const response = await fetch(`${apiUrl}/reports/jira/snapshots/${encodeURIComponent(snapshotId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok && response.status !== 204) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? 'Não foi possível excluir snapshot');
      }

      setSnapshots((prev) => prev.filter((snapshot) => snapshot.id !== snapshotId));
      messageApi.success('Snapshot removido');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro ao excluir snapshot';
      messageApi.error(text);
    } finally {
      setDeletingSnapshotId(null);
    }
  };

  const openRenameSnapshotModal = (snapshot: JiraSnapshotListItem) => {
    setRenamingSnapshot(snapshot);
    setRenameSnapshotModalOpen(true);
    renameSnapshotForm.setFieldsValue({
      name: snapshot.name
    });
  };

  const closeRenameSnapshotModal = () => {
    setRenameSnapshotModalOpen(false);
    setRenamingSnapshot(null);
    renameSnapshotForm.resetFields();
  };

  const handleRenameSnapshot = async () => {
    if (!token || !renamingSnapshot) {
      return;
    }

    try {
      const values = await renameSnapshotForm.validateFields();
      setRenameSnapshotSaving(true);

      const response = await fetch(
        `${apiUrl}/reports/jira/snapshots/${encodeURIComponent(renamingSnapshot.id)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: values.name.trim()
          })
        }
      );

      const data = (await response.json()) as {
        snapshot?: {
          id: string;
          name: string;
          createdAt: string;
        };
        message?: string;
      };

      if (!response.ok || !data.snapshot) {
        throw new Error(data.message ?? 'Não foi possível renomear snapshot');
      }

      setSnapshots((prev) =>
        prev.map((snapshot) =>
          snapshot.id === data.snapshot?.id
            ? {
                ...snapshot,
                name: data.snapshot.name
              }
            : snapshot
        )
      );

      messageApi.success('Nome do snapshot atualizado');
      closeRenameSnapshotModal();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }

      const text = error instanceof Error ? error.message : 'Erro ao renomear snapshot';
      messageApi.error(text);
    } finally {
      setRenameSnapshotSaving(false);
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

  const buildJiraReportSheets = () => {
    if (!report) {
      return [
        {
          name: 'Relatorio',
          rows: [{ mensagem: 'Carregue um relatório antes de exportar.' }]
        }
      ];
    }

    const nonRecusas = report.activities.filter((activity) => !isExcludedFromThroughput(activity));
    const heavyTasks = [...nonRecusas]
      .filter((activity) => activity.storyPoints !== null)
      .sort((a, b) => (b.storyPoints ?? 0) - (a.storyPoints ?? 0))
      .slice(0, 20);

    return [
      {
        name: 'Resumo',
        rows: [
          { metrica: 'Projeto', valor: report.filters.projectKey ?? '-' },
          { metrica: 'Pessoa', valor: report.filters.person ?? '-' },
          { metrica: 'Sprint(s)', valor: report.filters.sprintNames.join(', ') || '-' },
          { metrica: 'Período início', valor: dayjs(report.period.start).format('DD/MM/YYYY HH:mm') },
          { metrica: 'Período fim', valor: dayjs(report.period.end).format('DD/MM/YYYY HH:mm') },
          { metrica: 'Atividades totais', valor: report.summary.activitiesTotal },
          { metrica: 'Concluídas', valor: report.summary.doneCount },
          { metrica: 'Em andamento', valor: report.summary.inProgressCount },
          { metrica: 'SP total', valor: report.summary.storyPointsTotal },
          { metrica: 'SP concluído', valor: report.summary.storyPointsDone },
          { metrica: 'SP em andamento', valor: report.summary.storyPointsInProgress },
          { metrica: 'Sem estimativa', valor: report.summary.unestimatedCount }
        ]
      },
      {
        name: 'Todas_Atividades',
        rows: report.activities.map((activity) => ({
          key: activity.key,
          resumo: activity.summary,
          tipo: activity.issueType,
          status: activity.status,
          story_points: activity.storyPoints ?? '',
          concluida: activity.isDone ? 'Sim' : 'Não',
          atualizada_em: dayjs(activity.updatedAt).format('DD/MM/YYYY HH:mm'),
          link: activity.issueUrl
        }))
      },
      {
        name: 'Top_Pesadas',
        rows: heavyTasks.map((activity) => ({
          key: activity.key,
          resumo: activity.summary,
          tipo: activity.issueType,
          story_points: activity.storyPoints ?? '',
          status: activity.status,
          concluida: activity.isDone ? 'Sim' : 'Não',
          link: activity.issueUrl
        }))
      },
      {
        name: 'Recusas',
        rows: report.activities
          .filter(isRecusaActivity)
          .map((activity) => ({
            key: activity.key,
            resumo: activity.summary,
            status: activity.status,
            story_points: activity.storyPoints ?? '',
            atualizada_em: dayjs(activity.updatedAt).format('DD/MM/YYYY HH:mm'),
            link: activity.issueUrl
          }))
      }
    ];
  };

  const handleExportScreen = async (format: 'pdf' | 'excel' | 'html') => {
    const baseName = report?.filters.projectKey
      ? `relatorio-jira-${report.filters.projectKey}`
      : 'relatorio-jira';

    try {
      if (format === 'excel') {
        exportSheetsAsExcel({
          sheets: buildJiraReportSheets(),
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
        title: 'TeamSight - Relatório Jira',
        fileBaseName: baseName
      });
      messageApi.success('HTML gerado com sucesso.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Falha ao exportar relatório.';
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
      selectedPath="/reports/jira"
      title="Dashboard de Sprint (Jira)"
      subtitle="Throughput atual sem recusas e canal vermelho, tarefas mais pesadas e controle de recusas"
      currentUserName={currentUser?.name}
      headerActions={
        <Dropdown menu={{ items: exportMenuItems, onClick: handleExportMenuClick }} trigger={['click']}>
          <Button icon={<DownloadOutlined />}>Baixar tela</Button>
        </Dropdown>
      }
    >
      {contextHolder}

      <div ref={exportContainerRef}>
        <Flex vertical gap={16}>
        <Card title="Filtros" style={filterCardStyle}>
          <Form<JiraReportFormValues>
            form={form}
            layout="vertical"
            onFinish={loadReport}
            initialValues={{
              projectKey: '',
              issueKey: '',
              person: '',
              sprintNames: '',
              days: 60,
              maxIssues: 200,
              jql: ''
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12
              }}
            >
              <Form.Item
                style={{ marginBottom: 8 }}
                label="Chave do projeto"
                name="projectKey"
                rules={[
                  {
                    validator: (_, value) => {
                      const jqlValue = form.getFieldValue('jql');
                      const issueKeyValue = form.getFieldValue('issueKey');

                      if (
                        (value && String(value).trim()) ||
                        (jqlValue && String(jqlValue).trim()) ||
                        (issueKeyValue && String(issueKeyValue).trim())
                      ) {
                        return Promise.resolve();
                      }

                      return Promise.reject(new Error('Informe chave do projeto, tarefa ou JQL'));
                    }
                  }
                ]}
              >
                <Input placeholder="FLX" />
              </Form.Item>

              <Form.Item style={{ marginBottom: 8 }} label="Chave da tarefa" name="issueKey">
                <Input placeholder="FLX-123" />
              </Form.Item>

              <Form.Item style={{ marginBottom: 8 }} label="Pessoa" name="person">
                <Select
                  allowClear
                  showSearch
                  loading={loadingPeopleFilter}
                  placeholder={
                    loadingPeopleFilter ? 'Carregando pessoas...' : 'Selecione uma pessoa do sistema'
                  }
                  options={peopleFilterOptions}
                  optionFilterProp="label"
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 8 }} label="Sprints (nomes separados por vírgula)" name="sprintNames">
                <Input placeholder="Sprint 21, Sprint 22" />
              </Form.Item>
            </div>

            <div
              style={{
                marginTop: 8,
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? '1fr'
                  : 'minmax(260px, 2fr) repeat(2, minmax(120px, 0.8fr)) auto',
                gap: 12,
                alignItems: 'end'
              }}
            >
              <Form.Item
                style={{ marginBottom: 8 }}
                label="JQL customizada"
                name="jql"
              >
                <Input placeholder="project = FLX AND assignee = currentUser()" />
              </Form.Item>

              <Form.Item style={{ marginBottom: 8 }} label="Dias" name="days">
                <InputNumber min={1} max={365} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item style={{ marginBottom: 8 }} label="Máx. issues" name="maxIssues">
                <InputNumber min={1} max={300} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item style={{ marginBottom: 8 }}>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    Carregar atividades
                  </Button>
                  <Button
                    htmlType="button"
                    onClick={() => void handleSaveSnapshot()}
                    loading={savingSnapshot}
                    disabled={!report}
                  >
                    Salvar snapshot
                  </Button>
                  <Button htmlType="button" onClick={() => void openSnapshotsModal()}>
                    Histórico
                  </Button>
                  <Button
                    htmlType="button"
                    onClick={() => {
                      form.resetFields();
                      setReport(null);
                      setErrorMessage(null);
                    }}
                  >
                    Limpar
                  </Button>
                </Space>
              </Form.Item>
            </div>

          </Form>
        </Card>

        {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

          {report && dashboardData ? (
          <>
            <Flex gap={12} wrap="wrap">
              <Card
                style={{
                  ...summaryCardBaseStyle,
                  minWidth: 230,
                  flex: '1 1 230px',
                  background: 'linear-gradient(150deg, #eff6ff 0%, #ffffff 60%)'
                }}
              >
                <Typography.Text type="secondary">Throughput atual (sem recusas e canal vermelho)</Typography.Text>
                <Typography.Title level={2} style={{ margin: '2px 0 0 0', color: '#1d39c4' }}>
                  {dashboardData.throughputPercent.toFixed(1)}%
                </Typography.Title>
                <Typography.Text type="secondary">
                  {dashboardData.doneNonRecusas} de {dashboardData.nonRecusas.length} concluídas
                </Typography.Text>
                <Progress
                  percent={dashboardData.throughputPercent}
                  size="small"
                  strokeColor="#1d39c4"
                  style={{ marginTop: 10, marginBottom: 0 }}
                />
              </Card>

              <Card
                style={{
                  ...summaryCardBaseStyle,
                  minWidth: 230,
                  flex: '1 1 230px',
                  background: 'linear-gradient(150deg, #f6ffed 0%, #ffffff 60%)'
                }}
              >
                <Typography.Text type="secondary">Atividades</Typography.Text>
                <Typography.Title level={2} style={{ margin: '2px 0 0 0', color: '#237804' }}>
                  {dashboardData.nonRecusas.length}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {dashboardData.inProgressNonRecusas} em andamento
                </Typography.Text>
              </Card>

              <Card
                style={{
                  ...summaryCardBaseStyle,
                  minWidth: 230,
                  flex: '1 1 230px',
                  background: 'linear-gradient(150deg, #fff7e6 0%, #ffffff 60%)'
                }}
              >
                <Typography.Text type="secondary">Story Points</Typography.Text>
                <Typography.Title level={2} style={{ margin: '2px 0 0 0', color: '#d46b08' }}>
                  {dashboardData.storyPointsDone}/{dashboardData.storyPointsTotal}
                </Typography.Title>
                <Typography.Text type="secondary">Progresso dos pontos planejados</Typography.Text>
                <Progress
                  percent={dashboardData.storyPointsProgressPercent}
                  size="small"
                  strokeColor="#d46b08"
                  style={{ marginTop: 10, marginBottom: 0 }}
                />
              </Card>

              <Card
                style={{
                  ...summaryCardBaseStyle,
                  minWidth: 260,
                  flex: '1 1 260px',
                  background: 'linear-gradient(150deg, #fff1f0 0%, #ffffff 60%)'
                }}
                extra={
                  <Button type="link" onClick={() => setRecusasModalOpen(true)}>
                    Detalhar recusas
                  </Button>
                }
              >
                <Typography.Text type="secondary">Recusas</Typography.Text>
                <Typography.Title level={2} style={{ margin: '2px 0 0 0', color: '#cf1322' }}>
                  {dashboardData.recusas.length}
                </Typography.Title>
                <Typography.Text type="secondary">Clique em detalhar para ver as tarefas</Typography.Text>
              </Card>
            </Flex>

            <Flex gap={12} wrap="wrap">
              <Card
                title="Throughput visual (sem recusas e canal vermelho)"
                style={{ ...summaryCardBaseStyle, minWidth: 320, flex: '1 1 320px' }}
                extra={<Typography.Text type="secondary">Clique no gráfico para detalhar</Typography.Text>}
              >
                {dashboardData.nonRecusas.length > 0 ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={throughputChartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={68}
                          outerRadius={94}
                          paddingAngle={3}
                          label={({ name, value }) => `${name}: ${value}`}
                          labelLine={false}
                          onClick={(_, index) => {
                            const point = throughputChartData[index];

                            if (!point) {
                              return;
                            }

                            openChartDrilldown(`Throughput: ${point.name}`, `${point.value} tarefas`, point.tasks);
                          }}
                        >
                          {throughputChartData.map((entry, index) => (
                            <Cell
                              key={`${entry.name}-${index}`}
                              fill={entry.color ?? donutColors[index % donutColors.length]}
                              style={{ cursor: 'pointer' }}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty description="Sem atividades para calcular throughput." />
                )}
              </Card>

              <Card
                title="Story Points visuais"
                style={{ ...summaryCardBaseStyle, minWidth: 320, flex: '1 1 320px' }}
                extra={<Typography.Text type="secondary">Clique no gráfico para detalhar</Typography.Text>}
              >
                {dashboardData.storyPointsTotal > 0 ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={storyPointsChartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={68}
                          outerRadius={94}
                          paddingAngle={3}
                          label={({ name, value }) => `${name}: ${value}`}
                          labelLine={false}
                          onClick={(_, index) => {
                            const point = storyPointsChartData[index];

                            if (!point) {
                              return;
                            }

                            openChartDrilldown(`Story Points: ${point.name}`, `${point.value} pontos`, point.tasks);
                          }}
                        >
                          {storyPointsChartData.map((entry, index) => (
                            <Cell
                              key={`${entry.name}-${index}`}
                              fill={entry.color ?? donutColors[index % donutColors.length]}
                              style={{ cursor: 'pointer' }}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty description="Sem Story Points cadastrados nas atividades filtradas." />
                )}
              </Card>
            </Flex>

            <Flex gap={12} wrap="wrap">
              <Card
                title="Top tarefas por peso (Story Points)"
                style={{ ...summaryCardBaseStyle, minWidth: 480, flex: '2 1 480px' }}
                extra={<Typography.Text type="secondary">Clique em qualquer barra</Typography.Text>}
              >
                {heavyTasksChartData.length > 0 ? (
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={heavyTasksChartData} layout="vertical" margin={{ top: 8, right: 30, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d6e4ff" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="key" width={84} />
                        <Tooltip />
                        <Bar
                          dataKey="storyPoints"
                          fill="#1d39c4"
                          radius={[0, 8, 8, 0]}
                          onClick={(_, index) => {
                            const point = heavyTasksChartData[index];

                            if (!point) {
                              return;
                            }

                            openChartDrilldown(
                              `Tarefa mais pesada: ${point.key}`,
                              `${point.storyPoints} pontos`,
                              point.tasks
                            );
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <LabelList dataKey="storyPoints" position="right" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty description="Sem tarefas com Story Points para rankear." />
                )}
              </Card>

              <Card
                title="Recusas por status"
                style={{ ...summaryCardBaseStyle, minWidth: 320, flex: '1 1 320px' }}
                extra={<Typography.Text type="secondary">Clique em qualquer barra</Typography.Text>}
              >
                {recusaByStatusChartData.length > 0 ? (
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={recusaByStatusChartData} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffd6d9" />
                        <XAxis dataKey="status" interval={0} angle={-15} textAnchor="end" height={74} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar
                          dataKey="total"
                          fill="#cf1322"
                          radius={[8, 8, 0, 0]}
                          onClick={(_, index) => {
                            const point = recusaByStatusChartData[index];

                            if (!point) {
                              return;
                            }

                            openChartDrilldown(
                              `Recusas em ${point.status}`,
                              `${point.total} tarefas`,
                              point.tasks
                            );
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <LabelList dataKey="total" position="top" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty description="Nenhuma recusa nas atividades filtradas." />
                )}
              </Card>
            </Flex>

            <Card
              title={`Tarefas mais pesadas (${dashboardData.heavyTasks.length})`}
              extra={
                <Typography.Text type="secondary">
                  Exclui tipo Recusas e ordena por Story Points
                </Typography.Text>
              }
            >
              <Table<JiraActivity>
                rowKey="key"
                dataSource={dashboardData.heavyTasks.slice(0, 15)}
                size={isMobile ? 'small' : 'middle'}
                scroll={{ x: 760 }}
                pagination={false}
                onRow={(record) => ({
                  onClick: () => {
                    void openJiraIssueModal(record.key);
                  },
                  style: { cursor: 'pointer' }
                })}
                locale={{ emptyText: 'Nenhuma tarefa com story points encontrada.' }}
                columns={[
                  {
                    title: 'Atividade',
                    dataIndex: 'key',
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
                    dataIndex: 'issueType'
                  },
                  {
                    title: 'Story Points',
                    dataIndex: 'storyPoints',
                    width: 130,
                    sorter: (a, b) => (a.storyPoints ?? -1) - (b.storyPoints ?? -1),
                    defaultSortOrder: 'descend',
                    render: (value: number | null) => (value === null ? '-' : value)
                  },
                  {
                    title: 'Status',
                    dataIndex: 'status',
                    render: (status: string, activity: JiraActivity) => (
                      <Tag color={activity.isDone ? 'green' : 'blue'}>{status}</Tag>
                    )
                  }
                ]}
              />
            </Card>

            <Card title={`Todas as atividades Jira (${report.activities.length})`}>
              <Table<JiraActivity>
                rowKey="key"
                dataSource={report.activities}
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
          </>
          ) : null}
        </Flex>
      </div>

      <Modal
        title="Histórico de snapshots"
        open={snapshotModalOpen}
        onCancel={() => setSnapshotModalOpen(false)}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 980}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Table<JiraSnapshotListItem>
          rowKey="id"
          loading={loadingSnapshots}
          dataSource={snapshots}
          size="small"
          scroll={{ x: 860 }}
          locale={{ emptyText: 'Nenhum snapshot salvo ainda.' }}
          pagination={{
            pageSize: 8,
            showSizeChanger: true,
            pageSizeOptions: ['8', '16', '32']
          }}
          columns={[
            {
              title: 'Snapshot',
              dataIndex: 'name',
              render: (name: string, snapshot: JiraSnapshotListItem) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{name}</Typography.Text>
                  <Typography.Text type="secondary">
                    {dayjs(snapshot.createdAt).format('DD/MM/YYYY HH:mm')}
                  </Typography.Text>
                </Space>
              )
            },
            {
              title: 'Contexto',
              key: 'context',
              render: (_: unknown, snapshot: JiraSnapshotListItem) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text type="secondary">
                    Projeto: {snapshot.projectKey || '-'} • Pessoa: {snapshot.person || '-'}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    Sprint: {snapshot.sprintNames.length > 0 ? snapshot.sprintNames.join(', ') : '-'}
                  </Typography.Text>
                </Space>
              )
            },
            {
              title: 'Resumo',
              key: 'summary',
              render: (_: unknown, snapshot: JiraSnapshotListItem) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text>
                    {snapshot.doneCount ?? 0}/{snapshot.activitiesTotal ?? 0} concluídas
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {snapshot.inProgressCount ?? 0} em andamento
                  </Typography.Text>
                </Space>
              )
            },
            {
              title: 'Ações',
              key: 'actions',
              width: 290,
              render: (_: unknown, snapshot: JiraSnapshotListItem) => (
                <Space>
                  <Button
                    type="primary"
                    size="small"
                    loading={openingSnapshotId === snapshot.id}
                    onClick={() => void handleOpenSnapshot(snapshot.id)}
                  >
                    Abrir
                  </Button>
                  <Button
                    size="small"
                    onClick={() => openRenameSnapshotModal(snapshot)}
                    disabled={openingSnapshotId === snapshot.id || deletingSnapshotId === snapshot.id}
                  >
                    Renomear
                  </Button>
                  <Button
                    danger
                    size="small"
                    loading={deletingSnapshotId === snapshot.id}
                    onClick={() => void handleDeleteSnapshot(snapshot.id)}
                  >
                    Excluir
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </Modal>

      <Modal
        title="Editar nome do snapshot"
        open={renameSnapshotModalOpen}
        onCancel={closeRenameSnapshotModal}
        onOk={() => void handleRenameSnapshot()}
        okText="Salvar"
        cancelText="Cancelar"
        confirmLoading={renameSnapshotSaving}
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Form form={renameSnapshotForm} layout="vertical">
          <Form.Item
            label="Nome"
            name="name"
            rules={[
              { required: true, message: 'Informe o nome do snapshot' },
              { min: 2, message: 'Use pelo menos 2 caracteres' },
              { max: 140, message: 'Use no máximo 140 caracteres' }
            ]}
          >
            <Input placeholder="Ex.: Sprint 24 - Fechamento" maxLength={140} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={chartDrilldown.title || 'Detalhe do gráfico'}
        open={chartDrilldown.open}
        onCancel={closeChartDrilldown}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 960}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Flex vertical gap={12}>
          <Typography.Text type="secondary">
            {chartDrilldown.subtitle} • {chartDrilldown.tasks.length} tarefa(s)
          </Typography.Text>

          <Table<JiraActivity>
            rowKey="key"
            dataSource={chartDrilldown.tasks}
            size="small"
            scroll={{ x: 760 }}
            locale={{ emptyText: 'Sem tarefas para este recorte.' }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50']
            }}
            onRow={(record) => ({
              onClick: () => {
                closeChartDrilldown();
                void openJiraIssueModal(record.key);
              },
              style: { cursor: 'pointer' }
            })}
            columns={[
              {
                title: 'Atividade',
                dataIndex: 'key',
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
                dataIndex: 'issueType'
              },
              {
                title: 'Story Points',
                dataIndex: 'storyPoints',
                width: 130,
                render: (value: number | null) => (value === null ? '-' : value)
              },
              {
                title: 'Status',
                dataIndex: 'status',
                render: (value: string, activity: JiraActivity) => (
                  <Tag color={activity.isDone ? 'green' : 'blue'}>{value}</Tag>
                )
              },
              {
                title: 'Atualizada em',
                dataIndex: 'updatedAt',
                defaultSortOrder: 'descend',
                sorter: (a, b) => dayjs(a.updatedAt).valueOf() - dayjs(b.updatedAt).valueOf(),
                render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
              }
            ]}
          />
        </Flex>
      </Modal>

      <Modal
        title={
          dashboardData
            ? `Recusas (${dashboardData.recusas.length})`
            : 'Recusas'
        }
        open={recusasModalOpen}
        onCancel={() => setRecusasModalOpen(false)}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 960}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        {dashboardData ? (
          <Table<JiraActivity>
            rowKey="key"
            dataSource={dashboardData.recusas}
            size="small"
            scroll={{ x: 760 }}
            locale={{ emptyText: 'Nenhuma recusa encontrada com os filtros atuais.' }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50']
            }}
            onRow={(record) => ({
              onClick: () => {
                setRecusasModalOpen(false);
                void openJiraIssueModal(record.key);
              },
              style: { cursor: 'pointer' }
            })}
            columns={[
              {
                title: 'Atividade',
                dataIndex: 'key',
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
                title: 'Story Points',
                dataIndex: 'storyPoints',
                width: 130,
                render: (value: number | null) => (value === null ? '-' : value)
              },
              {
                title: 'Status',
                dataIndex: 'status',
                render: (value: string, activity: JiraActivity) => (
                  <Tag color={activity.isDone ? 'green' : 'blue'}>{value}</Tag>
                )
              },
              {
                title: 'Atualizada em',
                dataIndex: 'updatedAt',
                defaultSortOrder: 'descend',
                sorter: (a, b) => dayjs(a.updatedAt).valueOf() - dayjs(b.updatedAt).valueOf(),
                render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
              }
            ]}
          />
        ) : (
          <Empty description="Carregue uma sprint para detalhar recusas." />
        )}
      </Modal>

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
