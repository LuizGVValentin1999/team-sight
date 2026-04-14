'use client';

import '@ant-design/v5-patch-for-react-19';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  message
} from 'antd';
import { AppLoading } from '../components/app-loading';
import { AppShell } from '../components/app-shell';

type Person = {
  id: string;
  name: string;
  email: string;
  role: 'DEV' | 'QA' | 'PO' | 'UX' | 'MANAGER';
  seniority: 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF';
  active: boolean;
  hiredAt: string;
  createdAt: string;
};

type PersonFormValues = {
  name: string;
  email: string;
  role: Person['role'];
  seniority: Person['seniority'];
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

const roleOptions: Array<{ label: string; value: Person['role'] }> = [
  { label: 'Dev', value: 'DEV' },
  { label: 'QA', value: 'QA' },
  { label: 'PO', value: 'PO' },
  { label: 'UX', value: 'UX' },
  { label: 'Gestor', value: 'MANAGER' }
];

const seniorityOptions: Array<{ label: string; value: Person['seniority'] }> = [
  { label: 'Estagiário', value: 'INTERN' },
  { label: 'Júnior', value: 'JUNIOR' },
  { label: 'Pleno', value: 'MID' },
  { label: 'Sênior', value: 'SENIOR' },
  { label: 'Especialista', value: 'STAFF' }
];

const roleLabelMap: Record<Person['role'], string> = {
  DEV: 'Dev',
  QA: 'QA',
  PO: 'PO',
  UX: 'UX',
  MANAGER: 'Gestor'
};

const seniorityLabelMap: Record<Person['seniority'], string> = {
  INTERN: 'Estagiário',
  JUNIOR: 'Júnior',
  MID: 'Pleno',
  SENIOR: 'Sênior',
  STAFF: 'Especialista'
};

export function PeopleManager() {
  const router = useRouter();
  const [form] = Form.useForm<PersonFormValues>();
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

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

  const loadPeople = useCallback(
    async (authToken: string) => {
      setListLoading(true);

      try {
        const response = await fetch(`${apiUrl}/people`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        const data = (await response.json()) as {
          people?: Person[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(data.message ?? 'Não foi possível listar pessoas');
        }

        setPeople(data.people ?? []);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao buscar pessoas';
        messageApi.error(errorMessage);
      } finally {
        setListLoading(false);
      }
    },
    [messageApi]
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadPeople(token);
  }, [token, loadPeople]);

  const handleCreatePerson = async (values: PersonFormValues) => {
    if (!token) {
      messageApi.error('Sessão inválida, faça login novamente.');
      router.replace('/login');
      return;
    }

    setCreateLoading(true);

    try {
      const response = await fetch(`${apiUrl}/people`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(values)
      });

      const data = (await response.json()) as {
        person?: Person;
        message?: string;
      };

      if (!response.ok || !data.person) {
        throw new Error(data.message ?? 'Falha ao cadastrar pessoa');
      }

      const createdPerson = data.person;
      setPeople((previous) => [createdPerson, ...previous]);
      form.resetFields();
      messageApi.success('Pessoa cadastrada com sucesso');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro inesperado';
      messageApi.error(errorMessage);
    } finally {
      setCreateLoading(false);
    }
  };

  if (!mounted || !token) {
    return <AppLoading />;
  }

  return (
    <AppShell
      selectedPath="/people"
      title="Pessoas"
      subtitle="Gerencie membros do time com cargo e nível"
    >
      {contextHolder}
      <Flex gap={16} wrap="wrap" align="stretch">
        <Card title="Nova pessoa" style={{ flex: '1 1 360px', minWidth: 320 }}>
          <Form<PersonFormValues>
            form={form}
            layout="vertical"
            onFinish={handleCreatePerson}
            initialValues={{ role: 'DEV', seniority: 'MID' }}
          >
            <Form.Item
              label="Nome"
              name="name"
              rules={[{ required: true, message: 'Informe um nome' }]}
            >
              <Input placeholder="Nome completo" size="large" />
            </Form.Item>

            <Form.Item
              label="E-mail"
              name="email"
              rules={[
                { required: true, message: 'Informe um e-mail' },
                { type: 'email', message: 'E-mail inválido' }
              ]}
            >
              <Input placeholder="pessoa@empresa.com" size="large" />
            </Form.Item>

            <Form.Item
              label="Cargo"
              name="role"
              rules={[{ required: true, message: 'Selecione um cargo' }]}
            >
              <Select options={roleOptions} size="large" />
            </Form.Item>

            <Form.Item
              label="Nível"
              name="seniority"
              rules={[{ required: true, message: 'Selecione um nível' }]}
            >
              <Select options={seniorityOptions} size="large" />
            </Form.Item>

            <Space>
              <Button type="primary" htmlType="submit" loading={createLoading}>
                Cadastrar pessoa
              </Button>
              <Button htmlType="button" onClick={() => form.resetFields()}>
                Limpar
              </Button>
            </Space>
          </Form>
        </Card>

        <Card
          title={`Pessoas cadastradas (${people.length})`}
          style={{ flex: '2 1 560px', minWidth: 420 }}
        >
          <Table<Person>
            rowKey="id"
            loading={listLoading}
            dataSource={people}
            pagination={{ pageSize: 8 }}
            columns={[
              {
                title: 'Nome',
                dataIndex: 'name'
              },
              {
                title: 'E-mail',
                dataIndex: 'email'
              },
              {
                title: 'Cargo',
                dataIndex: 'role',
                render: (role: Person['role']) => <Tag>{roleLabelMap[role]}</Tag>
              },
              {
                title: 'Nível',
                dataIndex: 'seniority',
                render: (seniority: Person['seniority']) => (
                  <Tag color="blue">{seniorityLabelMap[seniority]}</Tag>
                )
              },
              {
                title: 'Status',
                dataIndex: 'active',
                render: (active: boolean) => (
                  <Tag color={active ? 'green' : 'red'}>{active ? 'Ativo' : 'Inativo'}</Tag>
                )
              }
            ]}
          />
        </Card>
      </Flex>
    </AppShell>
  );
}
