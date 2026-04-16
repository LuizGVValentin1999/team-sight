'use client';

import { Card, Empty, Flex, Modal, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { type JiraIssueDetailsPayload } from '../shared/jira';
import { formatBusinessHours } from '../shared/formatters';

type JiraIssueDetailsModalProps = {
  open: boolean;
  loading: boolean;
  detail: JiraIssueDetailsPayload | null;
  detailKey: string | null;
  isMobile: boolean;
  onClose: () => void;
};

export function JiraIssueDetailsModal({
  open,
  loading,
  detail,
  detailKey,
  isMobile,
  onClose
}: JiraIssueDetailsModalProps) {
  return (
    <Modal
      title={detail ? `Detalhes Jira: ${detail.issue.key}` : 'Detalhes da tarefa Jira'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={isMobile ? 'calc(100vw - 24px)' : 980}
      centered={!isMobile}
      style={isMobile ? { top: 12 } : undefined}
    >
      {loading ? (
        <Card loading />
      ) : detail ? (
        <Flex vertical gap={16}>
          <Card size="small">
            <Flex vertical gap={6}>
              <Typography.Text strong>{detail.issue.summary}</Typography.Text>
              <Typography.Text type="secondary">
                Criada em {dayjs(detail.issue.createdAt).format('DD/MM/YYYY HH:mm')} • Status atual:{' '}
                {detail.issue.currentStatus} • Responsável atual: {detail.issue.currentAssignee}
              </Typography.Text>
              <Typography.Text type="secondary">
                Horário útil: {detail.businessHoursConfig.windows.join(' e ')} • Segunda a sexta
              </Typography.Text>
              <Typography.Text>
                Total em horas úteis:{' '}
                <Typography.Text strong>{formatBusinessHours(detail.summary.totalBusinessHours)}</Typography.Text>
              </Typography.Text>
              <Typography.Text>
                Teste em horas úteis:{' '}
                <Typography.Text strong>{formatBusinessHours(detail.summary.totalTestBusinessHours)}</Typography.Text>
              </Typography.Text>
              <Typography.Text>
                Double check em horas úteis:{' '}
                <Typography.Text strong>
                  {formatBusinessHours(detail.summary.totalDoubleCheckBusinessHours)}
                </Typography.Text>
              </Typography.Text>
              <Typography.Link href={detail.issue.issueUrl} target="_blank">
                Abrir issue no Jira
              </Typography.Link>
            </Flex>
          </Card>

          <Card size="small" title="Tempo por etapa do Kanban">
            <Table<{ status: string; businessHours: number }>
              rowKey="status"
              dataSource={detail.statusTimes}
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
              dataSource={detail.codeTimesByAssignee}
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
              dataSource={detail.testTimesByAssignee}
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
              dataSource={detail.doubleCheckTimesByAssignee}
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
              dataSource={detail.actionLog}
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
        <Empty description={detailKey ? `Sem detalhes para ${detailKey}` : 'Selecione uma tarefa'} />
      )}
    </Modal>
  );
}
