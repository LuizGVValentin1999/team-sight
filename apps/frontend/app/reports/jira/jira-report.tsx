'use client';

import '@ant-design/v5-patch-for-react-19';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import dayjs from 'dayjs';
import { AppLoading } from '../../components/app-loading';
import { AppShell } from '../../components/app-shell';

type JiraReportFormValues = {
  projectKey: string;
  issueKey?: string;
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

type JiraIssueDetailsPayload = {
  issue: {
    key: string;
    summary: string;
    issueUrl: string;
    createdAt: string;
    currentStatus: string;
    currentAssignee: string;
  };
  businessHoursConfig: {
    timezone: string;
    workdays: string[];
    windows: string[];
  };
  summary: {
    totalBusinessHours: number;
    totalTestBusinessHours: number;
    totalDoubleCheckBusinessHours: number;
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
  testTimesByAssignee: Array<{
    assignee: string;
    businessHours: number;
    statusTimes: Array<{
      status: string;
      businessHours: number;
    }>;
  }>;
  doubleCheckTimesByAssignee: Array<{
    assignee: string;
    businessHours: number;
    statusTimes: Array<{
      status: string;
      businessHours: number;
    }>;
  }>;
  actionLog: Array<{
    actionId: string;
    at: string;
    actionType: 'STATUS_CHANGE' | 'ASSIGNEE_CHANGE';
    actor: string;
    from: string | null;
    to: string | null;
    businessHoursSincePreviousAction: number | null;
  }>;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

function formatBusinessHours(value: number) {
  return `${value.toFixed(2)} h`;
}

export function JiraReport() {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [form] = Form.useForm<JiraReportFormValues>();
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<JiraActivitiesResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [jiraCurrentPage, setJiraCurrentPage] = useState(1);
  const [jiraPageSize, setJiraPageSize] = useState(10);
  const [jiraIssueModalOpen, setJiraIssueModalOpen] = useState(false);
  const [jiraIssueLoading, setJiraIssueLoading] = useState(false);
  const [jiraIssueDetail, setJiraIssueDetail] = useState<JiraIssueDetailsPayload | null>(null);
  const [jiraIssueDetailKey, setJiraIssueDetailKey] = useState<string | null>(null);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const storedToken = localStorage.getItem('teamsight_token');

    if (!storedToken) {
      router.replace('/login');
      return;
    }

    setToken(storedToken);
  }, [mounted, router]);

  const loadReport = async (values: JiraReportFormValues) => {
    if (!token) {
      router.replace('/login');
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

  if (!mounted || !token) {
    return <AppLoading />;
  }

  return (
    <AppShell selectedPath="/reports/jira" title="Relatório Jira" subtitle="Tabela única de atividades do Jira">
      {contextHolder}

      <Flex vertical gap={16}>
        <Card title="Filtros">
          <Form<JiraReportFormValues>
            form={form}
            layout="vertical"
            onFinish={loadReport}
            initialValues={{
              projectKey: '',
              issueKey: '',
              sprintNames: '',
              days: 60,
              maxIssues: 200,
              jql: ''
            }}
          >
            <Flex gap={12} wrap="wrap" align="end">
              <Form.Item
                style={{ minWidth: 220, flex: '1 1 220px' }}
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

              <Form.Item style={{ minWidth: 220, flex: '1 1 220px' }} label="Chave da tarefa" name="issueKey">
                <Input placeholder="FLX-123" />
              </Form.Item>

              <Form.Item
                style={{ minWidth: 260, flex: '2 1 260px' }}
                label="Sprints (nomes separados por vírgula)"
                name="sprintNames"
              >
                <Input placeholder="Sprint 21, Sprint 22" />
              </Form.Item>

              <Form.Item
                style={{ minWidth: 260, flex: '2 1 260px' }}
                label="JQL customizada (opcional)"
                name="jql"
              >
                <Input placeholder="project = FLX AND assignee = currentUser()" />
              </Form.Item>

              <Form.Item style={{ width: 140 }} label="Dias" name="days">
                <InputNumber min={1} max={365} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item style={{ width: 140 }} label="Máx. issues" name="maxIssues">
                <InputNumber min={1} max={300} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    Carregar atividades
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
            </Flex>

            <Typography.Text type="secondary">
              Filtro por tarefa considera a tarefa principal, tarefas filhas (`parent`) e tarefas
              relacionadas (`linkedIssues`).
            </Typography.Text>
          </Form>
        </Card>

        {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

        {report ? (
          <Card title={`Atividades Jira (${report.summary.activitiesTotal})`}>
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
        ) : null}
      </Flex>

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
                  Total em horas úteis:{' '}
                  <Typography.Text strong>{formatBusinessHours(jiraIssueDetail.summary.totalBusinessHours)}</Typography.Text>
                </Typography.Text>
                <Typography.Text>
                  Teste em horas úteis:{' '}
                  <Typography.Text strong>
                    {formatBusinessHours(jiraIssueDetail.summary.totalTestBusinessHours)}
                  </Typography.Text>
                </Typography.Text>
                <Typography.Text>
                  Double check em horas úteis:{' '}
                  <Typography.Text strong>
                    {formatBusinessHours(jiraIssueDetail.summary.totalDoubleCheckBusinessHours)}
                  </Typography.Text>
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

            <Card size="small" title="Tempo em teste por responsável">
              <Table<{
                assignee: string;
                businessHours: number;
                statusTimes: Array<{ status: string; businessHours: number }>;
              }>
                rowKey="assignee"
                dataSource={jiraIssueDetail.testTimesByAssignee}
                size="small"
                pagination={false}
                locale={{ emptyText: 'Sem tempo em etapas de teste para esta issue.' }}
                columns={[
                  {
                    title: 'Responsável',
                    dataIndex: 'assignee'
                  },
                  {
                    title: 'Horas úteis em teste',
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

            <Card size="small" title="Tempo em double check por responsável">
              <Table<{
                assignee: string;
                businessHours: number;
                statusTimes: Array<{ status: string; businessHours: number }>;
              }>
                rowKey="assignee"
                dataSource={jiraIssueDetail.doubleCheckTimesByAssignee}
                size="small"
                pagination={false}
                locale={{ emptyText: 'Sem tempo em etapas de double check para esta issue.' }}
                columns={[
                  {
                    title: 'Responsável',
                    dataIndex: 'assignee'
                  },
                  {
                    title: 'Horas úteis em double check',
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

            <Card size="small" title="Histórico de ações (quem fez)">
              <Table<{
                actionId: string;
                at: string;
                actionType: 'STATUS_CHANGE' | 'ASSIGNEE_CHANGE';
                actor: string;
                from: string | null;
                to: string | null;
                businessHoursSincePreviousAction: number | null;
              }>
                rowKey="actionId"
                dataSource={jiraIssueDetail.actionLog}
                size="small"
                pagination={false}
                locale={{ emptyText: 'Sem ações registradas no histórico desta issue.' }}
                columns={[
                  {
                    title: 'Data',
                    dataIndex: 'at',
                    defaultSortOrder: 'ascend',
                    sorter: (a, b) => dayjs(a.at).valueOf() - dayjs(b.at).valueOf(),
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                  },
                  {
                    title: 'Ação',
                    dataIndex: 'actionType',
                    render: (value: 'STATUS_CHANGE' | 'ASSIGNEE_CHANGE') =>
                      value === 'STATUS_CHANGE' ? 'Mudança de status' : 'Mudança de responsável'
                  },
                  {
                    title: 'De',
                    dataIndex: 'from',
                    render: (value: string | null) => value || '-'
                  },
                  {
                    title: 'Para',
                    dataIndex: 'to',
                    render: (value: string | null) => value || '-'
                  },
                  {
                    title: 'Feito por',
                    dataIndex: 'actor'
                  },
                  {
                    title: 'Horas úteis desde a ação anterior',
                    dataIndex: 'businessHoursSincePreviousAction',
                    render: (value: number | null) => (value === null ? '-' : formatBusinessHours(value))
                  }
                ]}
              />
            </Card>
          </Flex>
        ) : (
          <Empty
            description={jiraIssueDetailKey ? `Sem detalhes para ${jiraIssueDetailKey}` : 'Selecione uma tarefa'}
          />
        )}
      </Modal>
    </AppShell>
  );
}
