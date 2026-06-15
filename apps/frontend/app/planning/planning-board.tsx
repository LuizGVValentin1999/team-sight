'use client';

import '@ant-design/v5-patch-for-react-19';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Alert,
  Button,
  Card,
  Flex,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
  message,
  theme
} from 'antd';
import { CopyOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  AllCommunityModule,
  type CellValueChangedEvent,
  type ColDef,
  type ICellRendererParams,
  type GetRowIdParams,
  ModuleRegistry,
  type RowStyle,
  type RowClassParams
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import dayjs from 'dayjs';
import { AppLoading } from '../components/app-loading';
import { AppShell } from '../components/app-shell';
import { useProtectedSession } from '../hooks/use-protected-session';
import { exportSheetsAsExcel } from '../shared/export-utils';
import { summaryCardBaseStyle } from '../shared/ui-styles';
import { useThemeMode } from '../providers';

ModuleRegistry.registerModules([AllCommunityModule]);

type PlanningMode = 'weekly' | 'monthly';

type PlanningSectionRow = {
  id: string;
  kind: 'section';
  title: string;
};

type PlanningTaskRow = {
  id: string;
  kind: 'task';
  sectionId: string | null;
  title: string;
  devHours: number;
  qaHours: number;
};

type PlanningRow = PlanningSectionRow | PlanningTaskRow;

type PlanningBoardState = {
  projectName: string;
  owner: string;
  mode: PlanningMode;
  devCapacity: number;
  qaCapacity: number;
  rows: PlanningRow[];
};

type PlanningProject = {
  id: string;
  name: string;
  board: PlanningBoardState;
};

type PlanningWorkspaceState = {
  selectedProjectId: string;
  projects: PlanningProject[];
};

type SectionSummary = {
  devHours: number;
  qaHours: number;
  totalHours: number;
  taskCount: number;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3399';
const workspaceStorageKey = 'teamsight_planning_workspace_v1';
const legacyBoardStorageKey = 'teamsight_planning_board_v1';

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function normalizeHours(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Number(value.toFixed(1));
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));

    if (Number.isFinite(parsed) && parsed >= 0) {
      return Number(parsed.toFixed(1));
    }
  }

  return 0;
}

function formatHours(value: number) {
  return numberFormatter.format(value);
}

function buildDemoBoard(): PlanningBoardState {
  return {
    projectName: 'Planejamento de tarefas',
    owner: '',
    mode: 'weekly',
    devCapacity: 40,
    qaCapacity: 40,
    rows: [
      {
        id: 'section-new-screen',
        kind: 'section',
        title: 'Criação da nova tela'
      },
      {
        id: 'task-forecast-view',
        kind: 'task',
        sectionId: 'section-new-screen',
        title: 'Criar nova projeção para escolher nível mensal ou semanal',
        devHours: 6,
        qaHours: 6
      },
      {
        id: 'task-weekly-table',
        kind: 'task',
        sectionId: 'section-new-screen',
        title: 'Criar nova tabela semanal',
        devHours: 18,
        qaHours: 18
      },
      {
        id: 'task-flux-vars',
        kind: 'task',
        sectionId: 'section-new-screen',
        title: 'Criar variáveis e constantes para usar o valor original do fluxo de caixa',
        devHours: 32,
        qaHours: 32
      },
      {
        id: 'task-modal-launch',
        kind: 'task',
        sectionId: 'section-new-screen',
        title: 'Criar nova modal para lançamento de valores',
        devHours: 12,
        qaHours: 12
      },
      {
        id: 'task-formulas',
        kind: 'task',
        sectionId: 'section-new-screen',
        title: 'Ajustar fórmula de soma, média e afins para funcionar semanalmente',
        devHours: 38,
        qaHours: 38
      },
      {
        id: 'task-replication',
        kind: 'task',
        sectionId: 'section-new-screen',
        title: 'Ajustar replicação de valores para ter opção de replicar fórmula',
        devHours: 18,
        qaHours: 18
      },
      {
        id: 'task-visualization',
        kind: 'task',
        sectionId: 'section-new-screen',
        title: 'Ajustar visualização para ver semanal e mensal',
        devHours: 24,
        qaHours: 24
      },
      {
        id: 'section-client-migration',
        kind: 'section',
        title: 'Migração dos clientes'
      },
      {
        id: 'task-client-sprint',
        kind: 'task',
        sectionId: 'section-client-migration',
        title: 'Criar sprint para migrar clientes',
        devHours: 24,
        qaHours: 24
      }
    ]
  };
}

function buildDemoWorkspace(): PlanningWorkspaceState {
  const project: PlanningProject = {
    id: 'project-default',
    name: 'Projeto 1',
    board: {
      ...buildDemoBoard(),
      projectName: 'Projeto 1'
    }
  };

  return {
    selectedProjectId: project.id,
    projects: [project]
  };
}

function buildEmptyBoard(projectName: string): PlanningBoardState {
  return {
    projectName,
    owner: '',
    mode: 'weekly',
    devCapacity: 40,
    qaCapacity: 40,
    rows: []
  };
}

function isPlanningBoardState(value: unknown): value is PlanningBoardState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const board = value as Partial<PlanningBoardState>;

  return (
    typeof board.projectName === 'string' &&
    typeof board.owner === 'string' &&
    (board.mode === 'weekly' || board.mode === 'monthly') &&
    typeof board.devCapacity === 'number' &&
    typeof board.qaCapacity === 'number' &&
    Array.isArray(board.rows)
  );
}

function isPlanningWorkspaceState(value: unknown): value is PlanningWorkspaceState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const workspace = value as Partial<PlanningWorkspaceState>;

  return typeof workspace.selectedProjectId === 'string' && Array.isArray(workspace.projects);
}

function cloneBoard(board: PlanningBoardState, projectName = board.projectName): PlanningBoardState {
  const sectionIdMap = new Map<string, string>();

  const rows = board.rows.map((row) => {
    if (row.kind === 'section') {
      const nextId = createId('section');
      sectionIdMap.set(row.id, nextId);
      return {
        ...row,
        id: nextId
      };
    }

    return {
      ...row,
      id: createId('task'),
      sectionId: row.sectionId ? sectionIdMap.get(row.sectionId) ?? null : null
    };
  });

  return {
    ...board,
    projectName,
    rows
  };
}

function normalizeWorkspace(value: unknown): PlanningWorkspaceState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (isPlanningWorkspaceState(value)) {
    const workspace = value as PlanningWorkspaceState;
    const projects = workspace.projects
      .map((project, index) => {
        if (!project || typeof project !== 'object') {
          return null;
        }

        const candidate = project as Partial<PlanningProject>;
        const board = isPlanningBoardState(candidate.board)
          ? {
              ...candidate.board,
              rows: getRowsWithoutOrphans(candidate.board.rows)
            }
          : null;

        if (!board) {
          return null;
        }

        const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createId('project');
        const name = typeof candidate.name === 'string' && candidate.name.trim()
          ? candidate.name.trim()
          : board.projectName || `Projeto ${index + 1}`;

        return {
          id,
          name,
          board: {
            ...board,
            projectName: name
          }
        } satisfies PlanningProject;
      })
      .filter((project): project is PlanningProject => Boolean(project));

    if (projects.length === 0) {
      return null;
    }

    const selectedProjectId = projects.some((project) => project.id === workspace.selectedProjectId)
      ? workspace.selectedProjectId
      : projects[0].id;

    return {
      selectedProjectId,
      projects
    };
  }

  if (isPlanningBoardState(value)) {
    const board = {
      ...value,
      rows: getRowsWithoutOrphans(value.rows)
    };
    const id = 'project-default';
    const name = board.projectName || 'Projeto 1';

    return {
      selectedProjectId: id,
      projects: [
        {
          id,
          name,
          board: {
            ...board,
            projectName: name
          }
        }
      ]
    };
  }

  return null;
}

function getSectionSummaries(rows: PlanningRow[]) {
  const summaries = new Map<string, SectionSummary>();

  for (const row of rows) {
    if (row.kind !== 'section') {
      continue;
    }

    summaries.set(row.id, {
      devHours: 0,
      qaHours: 0,
      totalHours: 0,
      taskCount: 0
    });
  }

  for (const row of rows) {
    if (row.kind !== 'task' || !row.sectionId) {
      continue;
    }

    const summary = summaries.get(row.sectionId);

    if (!summary) {
      continue;
    }

    summary.devHours += row.devHours;
    summary.qaHours += row.qaHours;
    summary.totalHours += row.devHours + row.qaHours;
    summary.taskCount += 1;
  }

  return summaries;
}

function findSectionInsertIndex(rows: PlanningRow[], sectionId: string) {
  const sectionIndex = rows.findIndex((row) => row.kind === 'section' && row.id === sectionId);

  if (sectionIndex < 0) {
    return rows.length;
  }

  let cursor = sectionIndex + 1;

  while (cursor < rows.length) {
    const row = rows[cursor];

    if (row.kind === 'section') {
      break;
    }

    if (row.kind === 'task' && row.sectionId !== sectionId) {
      break;
    }

    cursor += 1;
  }

  return cursor;
}

function cloneTaskRow(row: PlanningTaskRow): PlanningTaskRow {
  return {
    ...row,
    id: createId('task')
  };
}

function getTaskCount(rows: PlanningRow[]) {
  return rows.filter((row) => row.kind === 'task').length;
}

function getSectionCount(rows: PlanningRow[]) {
  return rows.filter((row) => row.kind === 'section').length;
}

function getRowsWithoutOrphans(rows: PlanningRow[]) {
  const validSectionIds = new Set(rows.filter((row) => row.kind === 'section').map((row) => row.id));
  return rows.filter((row) => row.kind === 'section' || !row.sectionId || validSectionIds.has(row.sectionId));
}

function calculateEstimate(state: PlanningBoardState, totalDev: number, totalQa: number) {
  const devLoad = state.devCapacity > 0 ? totalDev / state.devCapacity : null;
  const qaLoad = state.qaCapacity > 0 ? totalQa / state.qaCapacity : null;
  const horizon = state.mode === 'weekly' ? 'week' : 'month';
  const horizonDays = state.mode === 'weekly' ? 7 : 30;

  let estimateUnits: number | null = null;
  let bottleneck: 'dev' | 'qa' | 'balanced' | null = null;

  if (devLoad !== null && qaLoad !== null) {
    estimateUnits = Math.max(devLoad, qaLoad);
    bottleneck = devLoad > qaLoad ? 'dev' : qaLoad > devLoad ? 'qa' : 'balanced';
  } else if (devLoad !== null) {
    estimateUnits = devLoad;
    bottleneck = 'dev';
  } else if (qaLoad !== null) {
    estimateUnits = qaLoad;
    bottleneck = 'qa';
  }

  const projectedFinish = estimateUnits !== null ? dayjs().add(Math.ceil(estimateUnits * horizonDays), 'day') : null;

  return {
    devLoad,
    qaLoad,
    estimateUnits,
    bottleneck,
    projectedFinish,
    horizon
  };
}

function ActivityCellRenderer({
  value,
  data,
  context
}: {
  value?: string;
  data?: PlanningRow;
  context?: {
    sectionSummaries: Map<string, SectionSummary>;
    sectionTitles: Map<string, string>;
    mode: PlanningMode;
  };
}) {
  if (!data || !context) {
    return null;
  }

  if (data.kind === 'section') {
    const summary = context.sectionSummaries.get(data.id);

    return (
      <Flex vertical gap={2}>
        <Space size={8} wrap>
          <Tag color="blue">Seção</Tag>
          <Typography.Text strong>{value}</Typography.Text>
          {summary ? (
            <Typography.Text type="secondary">
              {summary.taskCount} tarefa(s) • {formatHours(summary.totalHours)} h
            </Typography.Text>
          ) : null}
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Use esta linha como cabeçalho do bloco de trabalho
        </Typography.Text>
      </Flex>
    );
  }

  const sectionTitle = data.sectionId ? context.sectionTitles.get(data.sectionId) : null;

  return (
    <Flex vertical gap={2} style={{ paddingLeft: 18 }}>
      <Typography.Text strong>{value}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {sectionTitle ? `Dentro de ${sectionTitle}` : 'Sem seção vinculada'}
      </Typography.Text>
    </Flex>
  );
}

function HoursCellRenderer({
  value,
  data
}: {
  value?: number;
  data?: PlanningRow;
}) {
  if (!data) {
    return null;
  }

  if (data.kind === 'section') {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }

  return <Typography.Text>{formatHours(Number(value ?? 0))} h</Typography.Text>;
}

function ActionsCellRenderer({
  data,
  onAddTask,
  onDuplicate,
  onDelete
}: {
  data?: PlanningRow;
  onAddTask: (sectionId?: string) => void;
  onDuplicate: (rowId: string) => void;
  onDelete: (rowId: string) => void;
}) {
  if (!data) {
    return null;
  }

  return (
    <Space size={4} wrap>
      {data.kind === 'section' ? (
        <Button size="small" onClick={() => onAddTask(data.id)} icon={<PlusOutlined />}>
          Tarefa
        </Button>
      ) : null}
      <Button size="small" onClick={() => onDuplicate(data.id)} icon={<CopyOutlined />}>
        Duplicar
      </Button>
      <Button danger size="small" onClick={() => onDelete(data.id)} icon={<DeleteOutlined />}>
        Excluir
      </Button>
    </Space>
  );
}

export function PlanningBoardPage() {
  const { token: antdToken } = theme.useToken();
  const { mode } = useThemeMode();
  const [messageApi, contextHolder] = message.useMessage();
  const { mounted, sessionChecking, token, currentUser, invalidateSession } = useProtectedSession({
    apiUrl,
    onInvalidSessionMessage: (text) => {
      messageApi.error(text);
    }
  });

  const [hydrated, setHydrated] = useState(false);
  const [workspace, setWorkspace] = useState<PlanningWorkspaceState>(buildDemoWorkspace);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const rawWorkspace = window.localStorage.getItem(workspaceStorageKey);
      const rawLegacyBoard = window.localStorage.getItem(legacyBoardStorageKey);

      if (rawWorkspace) {
        const parsedWorkspace = normalizeWorkspace(JSON.parse(rawWorkspace) as unknown);

        if (parsedWorkspace) {
          setWorkspace(parsedWorkspace);
          setHydrated(true);
          return;
        }
      }

      if (rawLegacyBoard) {
        const parsedBoard = normalizeWorkspace(JSON.parse(rawLegacyBoard) as unknown);

        if (parsedBoard) {
          setWorkspace(parsedBoard);
          setHydrated(true);
          return;
        }
      }

      if (!rawWorkspace && !rawLegacyBoard) {
        setWorkspace(buildDemoWorkspace());
        setHydrated(true);
        return;
      }
    } catch {
      setWorkspace(buildDemoWorkspace());
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(workspaceStorageKey, JSON.stringify(workspace));
  }, [workspace, hydrated]);

  const activeProject = useMemo(() => {
    const selected = workspace.projects.find((project) => project.id === workspace.selectedProjectId);
    return selected ?? workspace.projects[0] ?? null;
  }, [workspace]);

  const board = activeProject?.board ?? buildDemoBoard();

  useEffect(() => {
    if (!workspace.selectedProjectId || workspace.projects.some((project) => project.id === workspace.selectedProjectId)) {
      return;
    }

    setWorkspace((current) => ({
      ...current,
      selectedProjectId: current.projects[0]?.id ?? ''
    }));
  }, [workspace.projects, workspace.selectedProjectId]);

  const sectionSummaries = useMemo(() => getSectionSummaries(board.rows), [board.rows]);
  const sectionTitles = useMemo(() => {
    const map = new Map<string, string>();

    for (const row of board.rows) {
      if (row.kind === 'section') {
        map.set(row.id, row.title);
      }
    }

    return map;
  }, [board.rows]);

  const taskRows = board.rows.filter((row): row is PlanningTaskRow => row.kind === 'task');
  const totalDevHours = taskRows.reduce((sum, row) => sum + row.devHours, 0);
  const totalQaHours = taskRows.reduce((sum, row) => sum + row.qaHours, 0);
  const totalHours = totalDevHours + totalQaHours;
  const estimate = calculateEstimate(board, totalDevHours, totalQaHours);
  const sectionCount = getSectionCount(board.rows);
  const taskCount = getTaskCount(board.rows);

  const updateWorkspaceBoard = (updater: (current: PlanningBoardState) => PlanningBoardState) => {
    setWorkspace((current) => {
      const projectIndex = current.projects.findIndex((project) => project.id === current.selectedProjectId);

      if (projectIndex < 0) {
        return current;
      }

      const projects = current.projects.map((project, index) => {
        if (index !== projectIndex) {
          return project;
        }

        const nextBoard = updater(project.board);
        return {
          ...project,
          name: nextBoard.projectName,
          board: nextBoard
        };
      });

      return {
        ...current,
        projects
      };
    });
  };

  const updateSelectedProjectName = (projectName: string) => {
    updateWorkspaceBoard((current) => ({
      ...current,
      projectName
    }));
  };

  const selectProject = (projectId: string) => {
    setWorkspace((current) => ({
      ...current,
      selectedProjectId: projectId
    }));
  };

  const addSection = () => {
    updateWorkspaceBoard((current) => ({
      ...current,
      rows: [
        ...current.rows,
        {
          id: createId('section'),
          kind: 'section',
          title: 'Nova seção'
        }
      ]
    }));
  };

  const addTask = (sectionId?: string) => {
    updateWorkspaceBoard((current) => {
      const sectionTarget = sectionId ?? current.rows.filter((row) => row.kind === 'section').at(-1)?.id ?? null;
      const targetIndex =
        sectionTarget !== null ? findSectionInsertIndex(current.rows, sectionTarget) : current.rows.length;
      const nextTask: PlanningTaskRow = {
        id: createId('task'),
        kind: 'task',
        sectionId: sectionTarget,
        title: 'Nova tarefa',
        devHours: 0,
        qaHours: 0
      };

      const rows = [...current.rows];
      rows.splice(targetIndex, 0, nextTask);

      return {
        ...current,
        rows
      };
    });
  };

  const duplicateRow = (rowId: string) => {
    updateWorkspaceBoard((current) => {
      const index = current.rows.findIndex((row) => row.id === rowId);

      if (index < 0) {
        return current;
      }

      const row = current.rows[index];
      const rows = [...current.rows];

      if (row.kind === 'task') {
        rows.splice(index + 1, 0, cloneTaskRow(row));
      } else {
        rows.splice(index + 1, 0, {
          id: createId('section'),
          kind: 'section',
          title: `${row.title} - cópia`
        });
      }

      return {
        ...current,
        rows
      };
    });
  };

  const deleteRow = (rowId: string) => {
    updateWorkspaceBoard((current) => {
      const row = current.rows.find((item) => item.id === rowId);

      if (!row) {
        return current;
      }

      if (row.kind === 'section') {
        return {
          ...current,
          rows: current.rows.filter(
            (item) => item.id !== row.id && (item.kind !== 'task' || item.sectionId !== row.id)
          )
        };
      }

      return {
        ...current,
        rows: current.rows.filter((item) => item.id !== row.id)
      };
    });
  };

  const resetBoard = () => {
    const currentProjectName = activeProject?.name ?? board.projectName;
    updateWorkspaceBoard(() => ({
      ...buildDemoBoard(),
      projectName: currentProjectName
    }));
    messageApi.success('Modelo de planejamento restaurado.');
  };

  const createProject = () => {
    const projectId = createId('project');
    const projectName = `Projeto ${workspace.projects.length + 1}`;

    setWorkspace((current) => ({
      ...current,
      selectedProjectId: projectId,
      projects: [
        ...current.projects,
        {
          id: projectId,
          name: projectName,
          board: buildEmptyBoard(projectName)
        }
      ]
    }));

    messageApi.success(`Projeto criado: ${projectName}`);
  };

  const duplicateProject = () => {
    if (!activeProject) {
      return;
    }

    const projectId = createId('project');
    const projectName = `${activeProject.name} - cópia`;

    setWorkspace((current) => ({
      ...current,
      selectedProjectId: projectId,
      projects: [
        ...current.projects,
        {
          id: projectId,
          name: projectName,
          board: cloneBoard(activeProject.board, projectName)
        }
      ]
    }));

    messageApi.success(`Projeto duplicado: ${projectName}`);
  };

  const deleteProject = () => {
    if (workspace.projects.length <= 1 || !activeProject) {
      messageApi.warning('Mantenha pelo menos um projeto no planejamento.');
      return;
    }

    if (!window.confirm(`Excluir o projeto "${activeProject.name}"?`)) {
      return;
    }

    setWorkspace((current) => {
      const remaining = current.projects.filter((project) => project.id !== current.selectedProjectId);
      const nextSelected = remaining[0]?.id ?? '';

      return {
        selectedProjectId: nextSelected,
        projects: remaining
      };
    });

    messageApi.success('Projeto removido.');
  };

  const exportBoard = () => {
    const itemRows = board.rows.map((row) => {
      if (row.kind === 'section') {
        const summary = sectionSummaries.get(row.id);
        return {
          tipo: 'Seção',
          seção: row.title,
          atividade: row.title,
          'dev_h': '',
          'homologacao_h': '',
          'total_h': summary?.totalHours ?? 0
        };
      }

      return {
        tipo: 'Tarefa',
        seção: row.sectionId ? sectionTitles.get(row.sectionId) ?? '' : '',
        atividade: row.title,
        'dev_h': row.devHours,
        'homologacao_h': row.qaHours,
        'total_h': Number((row.devHours + row.qaHours).toFixed(1))
      };
    });

    exportSheetsAsExcel({
      fileBaseName: `planejamento-${board.projectName}`,
      sheets: [
        {
          name: 'Planejamento',
          rows: itemRows
        },
        {
          name: 'Resumo',
          rows: [
            {
              projeto: board.projectName,
              responsavel: board.owner || '-',
              modo: board.mode === 'weekly' ? 'Semanal' : 'Mensal',
              capacidade_dev: board.devCapacity,
              capacidade_homologacao: board.qaCapacity,
              total_dev_h: totalDevHours,
              total_homologacao_h: totalQaHours,
              total_geral_h: totalHours,
              seções: sectionCount,
              tarefas: taskCount,
              estimativa: estimate.estimateUnits !== null ? Number(estimate.estimateUnits.toFixed(2)) : '-',
              previsão: estimate.projectedFinish ? estimate.projectedFinish.format('DD/MM/YYYY') : '-'
            }
          ]
        }
      ]
    });
  };

  const handleCellValueChanged = (event: CellValueChangedEvent<PlanningRow>) => {
    const row = event.data;

    if (!row) {
      return;
    }

    updateWorkspaceBoard((current) => ({
      ...current,
      rows: current.rows.map((item) => {
        if (item.id !== row.id) {
          return item;
        }

        if (item.kind === 'section') {
          return {
            ...item,
            title: String(event.data?.title ?? item.title).trim() || item.title
          };
        }

        return {
          ...item,
        title: String(event.data?.title ?? item.title).trim() || item.title,
        devHours: normalizeHours((event.data as PlanningTaskRow).devHours),
        qaHours: normalizeHours((event.data as PlanningTaskRow).qaHours),
        sectionId: (event.data as PlanningTaskRow).sectionId ?? item.sectionId
      };
      })
    }));
  };

  if (!mounted || sessionChecking) {
    return <AppLoading />;
  }

  if (!token) {
    return <AppLoading />;
  }

  const gridThemeClass = mode === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';
  const boardBackground =
    mode === 'dark'
      ? 'linear-gradient(180deg, rgba(14, 20, 30, 0.92) 0%, rgba(9, 13, 20, 0.98) 100%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(248,250,252,0.95) 100%)';

  const sectionSummaryMap = sectionSummaries;
  const projectOptions = workspace.projects.map((project) => ({
    label: project.name,
    value: project.id
  }));

  const columns: ColDef<PlanningRow>[] = [
    {
      headerName: 'Atividade',
      field: 'title',
      flex: 2.4,
      editable: true,
      singleClickEdit: true,
      cellRenderer: ActivityCellRenderer,
      cellRendererParams: {
        sectionSummaries: sectionSummaryMap,
        sectionTitles,
        mode
      },
      valueParser: (params) => String(params.newValue ?? '').trim(),
      cellStyle: (params) => ({
        fontWeight: params.data?.kind === 'section' ? 700 : 500
      })
    },
    {
      headerName: 'Dev H',
      field: 'devHours',
      width: 120,
      editable: (params) => params.data?.kind === 'task',
      singleClickEdit: true,
      valueGetter: (params) => (params.data?.kind === 'task' ? params.data.devHours : null),
      valueParser: (params) => normalizeHours(params.newValue),
      cellRenderer: HoursCellRenderer,
      cellStyle: {
        justifyContent: 'center'
      }
    },
    {
      headerName: 'Homologação H',
      field: 'qaHours',
      width: 150,
      editable: (params) => params.data?.kind === 'task',
      singleClickEdit: true,
      valueGetter: (params) => (params.data?.kind === 'task' ? params.data.qaHours : null),
      valueParser: (params) => normalizeHours(params.newValue),
      cellRenderer: HoursCellRenderer,
      cellStyle: {
        justifyContent: 'center'
      }
    },
    {
      headerName: 'Total H',
      width: 120,
      valueGetter: (params) => {
        if (!params.data) {
          return 0;
        }

        if (params.data.kind === 'section') {
          return sectionSummaryMap.get(params.data.id)?.totalHours ?? 0;
        }

        return Number((params.data.devHours + params.data.qaHours).toFixed(1));
      },
      cellRenderer: (params: ICellRendererParams<PlanningRow, number>) => {
        const { value, data } = params;

        if (!data) {
          return null;
        }

        if (data.kind === 'section') {
          const summary = sectionSummaryMap.get(data.id);

          return (
            <Tag color="blue">
              {formatHours(summary?.totalHours ?? 0)} h
            </Tag>
          );
        }

        return <Tag color="green">{formatHours(Number(value ?? 0))} h</Tag>;
      },
      cellStyle: {
        justifyContent: 'center'
      }
    },
    {
      headerName: 'Ações',
      width: 260,
      sortable: false,
      filter: false,
      editable: false,
      cellRenderer: ActionsCellRenderer,
      cellRendererParams: {
        onAddTask: addTask,
        onDuplicate: duplicateRow,
        onDelete: deleteRow
      }
    }
  ];

  const getRowStyle = (params: RowClassParams<PlanningRow>) => {
    if (!params.data) {
      return undefined;
    }

    if (params.data.kind === 'section') {
      const style: RowStyle = {
        background: mode === 'dark' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)',
        fontWeight: 700
      };

      return style;
    }

    const style: RowStyle = {
      background: mode === 'dark' ? 'rgba(20, 27, 38, 0.75)' : 'rgba(255,255,255,0.72)'
    };

    return style;
  };

  return (
    <AppShell
      title="Planejamento"
      subtitle="Planilha de tarefas com estimativa de horas, capacidade e previsão"
      selectedPath="/planning"
      currentUserName={currentUser?.name}
      headerActions={
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={exportBoard}>
            Baixar Excel
          </Button>
          <Button icon={<ReloadOutlined />} onClick={resetBoard}>
            Restaurar modelo
          </Button>
        </Space>
      }
    >
      {contextHolder}

      <Flex vertical gap={20}>
        <Card
          style={{
            ...summaryCardBaseStyle,
            background: boardBackground,
            borderRadius: 20
          }}
        >
          <Flex vertical gap={16}>
            <Flex justify="space-between" align="start" gap={16} wrap>
              <div style={{ maxWidth: 920 }}>
                <Tag color="blue">Excel melhorado</Tag>
                <Typography.Title level={3} style={{ marginTop: 8, marginBottom: 4 }}>
                  Planejamento de tarefas e orçamento de horas
                </Typography.Title>
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                  Essa tela substitui a planilha manual por um quadro editável com cálculo automático de horas,
                  capacidade semanal ou mensal e exportação para Excel.
                </Typography.Paragraph>
              </div>

              <Space wrap>
                <Tag color="purple">Projetos: {workspace.projects.length}</Tag>
                <Tag color="geekblue">Seções: {sectionCount}</Tag>
                <Tag color="green">Tarefas: {taskCount}</Tag>
                <Tag color="gold">Total: {formatHours(totalHours)} h</Tag>
              </Space>
            </Flex>

            <Flex gap={12} wrap>
              <div style={{ minWidth: 260, flex: '1 1 260px' }}>
                <Typography.Text type="secondary">Selecionar projeto</Typography.Text>
                <Select
                  value={activeProject?.id}
                  options={projectOptions}
                  onChange={selectProject}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ minWidth: 260, flex: '1 1 260px' }}>
                <Typography.Text type="secondary">Nome do projeto</Typography.Text>
                <Input
                  value={board.projectName}
                  onChange={(event) =>
                    updateSelectedProjectName(event.target.value)
                  }
                  placeholder="Nome do projeto"
                />
              </div>

              <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                <Typography.Text type="secondary">Responsável</Typography.Text>
                <Input
                  value={board.owner}
                  onChange={(event) =>
                    updateWorkspaceBoard((current) => ({
                      ...current,
                      owner: event.target.value
                    }))
                  }
                  placeholder="Nome da pessoa ou squad"
                />
              </div>

              <div style={{ width: 180 }}>
                <Typography.Text type="secondary">Horizonte</Typography.Text>
                <Select
                  value={board.mode}
                  onChange={(value) =>
                    updateWorkspaceBoard((current) => ({
                      ...current,
                      mode: value
                    }))
                  }
                  options={[
                    { value: 'weekly', label: 'Semanal' },
                    { value: 'monthly', label: 'Mensal' }
                  ]}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ width: 180 }}>
                <Typography.Text type="secondary">
                  Capacidade dev / {board.mode === 'weekly' ? 'semana' : 'mês'}
                </Typography.Text>
                <InputNumber
                  min={0}
                  step={1}
                  precision={1}
                  value={board.devCapacity}
                  onChange={(value) =>
                    updateWorkspaceBoard((current) => ({
                      ...current,
                      devCapacity: normalizeHours(value)
                    }))
                  }
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ width: 180 }}>
                <Typography.Text type="secondary">
                  Capacidade homologação / {board.mode === 'weekly' ? 'semana' : 'mês'}
                </Typography.Text>
                <InputNumber
                  min={0}
                  step={1}
                  precision={1}
                  value={board.qaCapacity}
                  onChange={(value) =>
                    updateWorkspaceBoard((current) => ({
                      ...current,
                      qaCapacity: normalizeHours(value)
                    }))
                  }
                  style={{ width: '100%' }}
                />
              </div>
            </Flex>

            <Flex gap={8} wrap>
              <Button icon={<PlusOutlined />} onClick={createProject}>
                Novo projeto
              </Button>
              <Button icon={<CopyOutlined />} onClick={duplicateProject} disabled={!activeProject}>
                Duplicar projeto
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={deleteProject} disabled={workspace.projects.length <= 1}>
                Excluir projeto
              </Button>
            </Flex>
          </Flex>
        </Card>

        <Flex gap={16} wrap>
          <Card style={{ ...summaryCardBaseStyle, minWidth: 220, flex: '1 1 220px' }}>
            <Flex vertical gap={6}>
              <Typography.Text type="secondary">Horas de dev</Typography.Text>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {formatHours(totalDevHours)} h
              </Typography.Title>
              <Typography.Text type="secondary">
                {estimate.devLoad !== null
                  ? `${Math.round(estimate.devLoad * 100)}% da capacidade`
                  : 'Sem capacidade definida'}
              </Typography.Text>
            </Flex>
          </Card>

          <Card style={{ ...summaryCardBaseStyle, minWidth: 220, flex: '1 1 220px' }}>
            <Flex vertical gap={6}>
              <Typography.Text type="secondary">Horas de homologação</Typography.Text>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {formatHours(totalQaHours)} h
              </Typography.Title>
              <Typography.Text type="secondary">
                {estimate.qaLoad !== null
                  ? `${Math.round(estimate.qaLoad * 100)}% da capacidade`
                  : 'Sem capacidade definida'}
              </Typography.Text>
            </Flex>
          </Card>

          <Card style={{ ...summaryCardBaseStyle, minWidth: 220, flex: '1 1 220px' }}>
            <Flex vertical gap={6}>
              <Typography.Text type="secondary">Previsão de término</Typography.Text>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {estimate.projectedFinish ? estimate.projectedFinish.format('DD/MM/YYYY') : 'n/d'}
              </Typography.Title>
              <Typography.Text type="secondary">
                {estimate.estimateUnits !== null
                  ? `${estimate.estimateUnits.toFixed(1)} ${estimate.horizon === 'week' ? 'semanas' : 'meses'}`
                  : 'Defina capacidades para calcular'}
              </Typography.Text>
            </Flex>
          </Card>

          <Card style={{ ...summaryCardBaseStyle, minWidth: 220, flex: '1 1 220px' }}>
            <Flex vertical gap={6}>
              <Typography.Text type="secondary">Gargalo</Typography.Text>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {estimate.bottleneck === 'dev'
                  ? 'Dev'
                  : estimate.bottleneck === 'qa'
                    ? 'Homologação'
                    : estimate.bottleneck === 'balanced'
                      ? 'Equilibrado'
                      : 'n/d'}
              </Typography.Title>
              <Typography.Text type="secondary">
                {board.mode === 'weekly' ? 'Base semanal' : 'Base mensal'}
              </Typography.Text>
            </Flex>
          </Card>
        </Flex>


        <Card
          style={{
            ...summaryCardBaseStyle,
            background: mode === 'dark' ? 'rgba(20, 27, 38, 0.96)' : 'rgba(255,255,255,0.9)',
            padding: 12
          }}
          bodyStyle={{ padding: 0 }}
        >
          <Flex justify="space-between" align="center" gap={12} wrap style={{ padding: '16px 16px 12px' }}>
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Planilha de orçamento
              </Typography.Title>
              <Typography.Text type="secondary">
                Duplo clique ou clique único para editar. Use os botões da linha para criar novos blocos.
              </Typography.Text>
            </div>

            <Space wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={addSection}>
                Nova seção
              </Button>
              <Button icon={<PlusOutlined />} onClick={() => addTask()}>
                Nova tarefa
              </Button>
            </Space>
          </Flex>

          <div style={{ padding: '0 16px 16px' }}>
            <div
              className={gridThemeClass}
              style={{
                width: '100%',
                height: 720,
                borderRadius: 16,
                overflow: 'hidden',
                border: `1px solid ${antdToken.colorBorder}`
              }}
            >
              <AgGridReact<PlanningRow>
                rowData={board.rows}
                columnDefs={columns}
                defaultColDef={{
                  resizable: true,
                  sortable: false,
                  filter: false,
                  suppressHeaderMenuButton: true
                }}
                context={{
                  sectionSummaries: sectionSummaryMap,
                  sectionTitles,
                  mode
                }}
                getRowId={(params: GetRowIdParams<PlanningRow>) => params.data.id}
                stopEditingWhenCellsLoseFocus
                singleClickEdit
                animateRows
                rowSelection="single"
                rowHeight={64}
                headerHeight={44}
                getRowStyle={getRowStyle}
                onCellValueChanged={handleCellValueChanged}
                overlayNoRowsTemplate="<span>Nenhuma tarefa cadastrada</span>"
              />
            </div>
          </div>
        </Card>

        <Card style={summaryCardBaseStyle} title="Resumo por seção">
          <Flex vertical gap={12}>
            {board.rows.filter((row): row is PlanningSectionRow => row.kind === 'section').map((section) => {
              const summary = sectionSummaries.get(section.id);

              return (
                <Flex
                  key={section.id}
                  justify="space-between"
                  align="center"
                  gap={12}
                  wrap
                  style={{
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: mode === 'dark' ? 'rgba(15,23,42,0.45)' : 'rgba(241,245,249,0.72)',
                    border: `1px solid ${antdToken.colorBorder}`
                  }}
                >
                  <div>
                    <Typography.Text strong>{section.title}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary">
                      {summary?.taskCount ?? 0} tarefa(s)
                    </Typography.Text>
                  </div>
                  <Space wrap>
                    <Tag color="blue">{formatHours(summary?.devHours ?? 0)} h dev</Tag>
                    <Tag color="gold">{formatHours(summary?.qaHours ?? 0)} h homologação</Tag>
                    <Tag color="green">{formatHours(summary?.totalHours ?? 0)} h total</Tag>
                  </Space>
                </Flex>
              );
            })}
          </Flex>
        </Card>
      </Flex>
    </AppShell>
  );
}
