'use client';

import { Avatar, Button, Card, Empty, Flex, Input, Space, Table, Tag, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import {
  formatVacationPeriod,
  type PersonNextVacation,
  type PersonRole,
  roleLabelMap,
  roleSupportsSeniority,
  type Seniority,
  seniorityLabelMap
} from '../shared/people';

export type PeopleSelectorItem = {
  id: string;
  name: string;
  email: string;
  role: PersonRole;
  seniority: Seniority;
  avatarUrl: string | null;
  nextVacation?: PersonNextVacation | null;
};

type PeopleSelectorTableProps = {
  people: PeopleSelectorItem[];
  search: string;
  onSearchChange: (nextValue: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onSelectPerson: (personId: string) => void;
  selectedPersonId: string | null;
  isMobile: boolean;
  themeMode: 'light' | 'dark';
  headerActions?: React.ReactNode;
};

export function PeopleSelectorTable({
  people,
  search,
  onSearchChange,
  onRefresh,
  refreshing,
  onSelectPerson,
  selectedPersonId,
  isMobile,
  themeMode,
  headerActions
}: PeopleSelectorTableProps) {
  return (
    <Card
      title="Pessoas do time"
      extra={
        <Flex gap={8} wrap justify="end">
          {headerActions}
          <Button onClick={onRefresh} loading={refreshing}>
            Atualizar
          </Button>
        </Flex>
      }
    >
      <Flex vertical gap={12}>
        <Input
          allowClear
          placeholder="Buscar por nome, e-mail, cargo ou nível"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />

        <Typography.Text type="secondary">{people.length} pessoa(s) encontrada(s)</Typography.Text>

        {people.length === 0 ? (
          <Empty description="Nenhuma pessoa encontrada para o filtro informado." />
        ) : (
          <Table<PeopleSelectorItem>
            rowKey="id"
            dataSource={people}
            size={isMobile ? 'small' : 'middle'}
            scroll={{ x: 560 }}
            onRow={(person) => ({
              onClick: () => onSelectPerson(person.id),
              style: {
                cursor: 'pointer',
                background: person.id === selectedPersonId ? (themeMode === 'dark' ? '#1f314a' : '#eaf4ff') : undefined
              }
            })}
            pagination={{
              pageSize: 8,
              showSizeChanger: true,
              pageSizeOptions: ['8', '12', '20', '50'],
              showTotal: (total, range) => `${range[0]}-${range[1]} de ${total} pessoas`
            }}
            columns={[
              {
                title: 'Pessoa',
                dataIndex: 'name',
                render: (_: string, person: PeopleSelectorItem) => (
                  <Space align="start" size={10}>
                    <Avatar src={person.avatarUrl ?? undefined} icon={<UserOutlined />} />
                    <Space direction="vertical" size={2}>
                      <Space size={6} wrap>
                        <Typography.Text strong>{person.name}</Typography.Text>
                        <Tag>{roleLabelMap[person.role]}</Tag>
                        {roleSupportsSeniority(person.role) ? (
                          <Tag>{seniorityLabelMap[person.seniority]}</Tag>
                        ) : null}
                      </Space>
                      <Typography.Text type="secondary">{person.email}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Próximas férias: {formatVacationPeriod(person.nextVacation)}
                      </Typography.Text>
                    </Space>
                  </Space>
                )
              }
            ]}
          />
        )}
      </Flex>
    </Card>
  );
}
