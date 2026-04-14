'use client';

import '@ant-design/v5-patch-for-react-19';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Flex,
  Form,
  Input,
  InputNumber,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
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

type JiraReportResponse = {
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
  };
  summary: {
    issuesAnalyzed: number;
    statusesFound: number;
    peopleInvolved: number;
  };
  statusTotals: Array<{
    status: string;
    totalHours: number;
    avgHoursPerIssue: number;
  }>;
  issues: Array<{
    key: string;
    summary: string;
    currentStatus: string;
    totalHoursInPeriod: number;
    statusTimes: Array<{
      status: string;
      hours: number;
    }>;
    involvedPeople: Array<{
      id: string;
      name: string;
      sources: string[];
    }>;
  }>;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export function JiraReport() {
  const router = useRouter();
  const [form] = Form.useForm<JiraReportFormValues>();
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<JiraReportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const peopleFilterOptions = useMemo(() => {
    if (!report) {
      return [];
    }

    const names = new Set<string>();

    for (const issue of report.issues) {
      for (const person of issue.involvedPeople) {
        names.add(person.name);
      }
    }

    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({
        text: name,
        value: name
      }));
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

      const response = await fetch(`${apiUrl}/reports/jira/kanban-time?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = (await response.json()) as JiraReportResponse & { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Falha ao carregar relatório do Jira');
      }

      setReport(data);
      messageApi.success('Relatório do Jira carregado');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro inesperado';
      setErrorMessage(text);
      messageApi.error(text);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || !token) {
    return <AppLoading />;
  }

  return (
    <AppShell
      selectedPath="/reports/jira"
      title="Relatório Jira Kanban"
      subtitle="Acompanhe atividade e tempo em cada etapa"
    >
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
              days: 30,
              maxIssues: 50,
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
                <Input placeholder="TS" />
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
                <Input placeholder="project = TS AND assignee = currentUser()" />
              </Form.Item>

              <Form.Item style={{ width: 140 }} label="Dias" name="days">
                <InputNumber min={1} max={365} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item style={{ width: 140 }} label="Máx. issues" name="maxIssues">
                <InputNumber min={1} max={200} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    Carregar relatório
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
          <>
            <Flex gap={12} wrap="wrap">
              <Card style={{ minWidth: 200 }}>
                <Typography.Text type="secondary">Atividades analisadas</Typography.Text>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {report.summary.issuesAnalyzed}
                </Typography.Title>
              </Card>

              <Card style={{ minWidth: 200 }}>
                <Typography.Text type="secondary">Etapas encontradas</Typography.Text>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {report.summary.statusesFound}
                </Typography.Title>
              </Card>

              <Card style={{ minWidth: 200 }}>
                <Typography.Text type="secondary">Pessoas envolvidas</Typography.Text>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {report.summary.peopleInvolved}
                </Typography.Title>
              </Card>

              <Card style={{ minWidth: 260 }}>
                <Typography.Text type="secondary">Período</Typography.Text>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {new Date(report.period.start).toLocaleDateString()} -{' '}
                  {new Date(report.period.end).toLocaleDateString()}
                </Typography.Title>
              </Card>
            </Flex>

            <Card title="Totais por etapa (horas)">
              <Table
                rowKey="status"
                dataSource={report.statusTotals}
                pagination={false}
                columns={[
                  {
                    title: 'Etapa',
                    dataIndex: 'status',
                    render: (status: string) => <Tag>{status}</Tag>
                  },
                  {
                    title: 'Horas totais no período',
                    dataIndex: 'totalHours'
                  },
                  {
                    title: 'Média de horas por atividade',
                    dataIndex: 'avgHoursPerIssue'
                  }
                ]}
              />
            </Card>

            <Card title="Detalhamento por atividade">
              <Table
                rowKey="key"
                dataSource={report.issues}
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: 'Atividade',
                    dataIndex: 'key',
                    render: (key: string, record: JiraReportResponse['issues'][number]) => (
                      <Space direction="vertical" size={0}>
                        <Typography.Text strong>{key}</Typography.Text>
                        <Typography.Text type="secondary">{record.summary}</Typography.Text>
                      </Space>
                    )
                  },
                  {
                    title: 'Etapa atual',
                    dataIndex: 'currentStatus',
                    render: (value: string) => <Tag color="blue">{value}</Tag>
                  },
                  {
                    title: 'Horas no período',
                    dataIndex: 'totalHoursInPeriod'
                  },
                  {
                    title: 'Pessoas envolvidas',
                    dataIndex: 'involvedPeople',
                    filters: peopleFilterOptions,
                    filterSearch: true,
                    onFilter: (value, record: JiraReportResponse['issues'][number]) =>
                      record.involvedPeople.some((person) => person.name === value),
                    render: (
                      involvedPeople: JiraReportResponse['issues'][number]['involvedPeople']
                    ) =>
                      involvedPeople.length > 0 ? (
                        <Space wrap>
                          {involvedPeople.map((person) => (
                            <Tag key={person.id}>{person.name}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <Typography.Text type="secondary">Sem identificação</Typography.Text>
                      )
                  },
                  {
                    title: 'Tempo por etapa',
                    dataIndex: 'statusTimes',
                    render: (statusTimes: JiraReportResponse['issues'][number]['statusTimes']) => (
                      <Space wrap>
                        {statusTimes.map((item) => (
                          <Tag key={`${item.status}-${item.hours}`}>{`${item.status}: ${item.hours}h`}</Tag>
                        ))}
                      </Space>
                    )
                  }
                ]}
              />
            </Card>
          </>
        ) : null}
      </Flex>
    </AppShell>
  );
}
