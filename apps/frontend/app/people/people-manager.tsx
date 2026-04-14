'use client';

import '@ant-design/v5-patch-for-react-19';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadOutlined, UserOutlined } from '@ant-design/icons';
import {
  Avatar,
  Button,
  Card,
  Flex,
  Form,
  Grid,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message
} from 'antd';
import { AppLoading } from '../components/app-loading';
import { AppShell } from '../components/app-shell';

type Person = {
  id: string;
  name: string;
  email: string;
  role: 'DEV' | 'QA' | 'BA' | 'PO' | 'UX' | 'TECH_LEAD' | 'QA_LEAD' | 'MANAGER';
  seniority: 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF';
  jiraUserKey: string | null;
  gitUsername: string | null;
  avatarUrl: string | null;
  active: boolean;
  hiredAt: string;
  createdAt: string;
};

type PersonFormValues = {
  name: string;
  email: string;
  role: Person['role'];
  seniority: Person['seniority'];
  jiraUserKey?: string;
  gitUsername?: string;
  avatarUrl?: string;
  active: boolean;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Person['role'];
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const maxAvatarSizeMb = 0.5;
const defaultGithubOrg = 'allstrategy-git';
const githubOrgStorageKey = 'teamsight_github_org';

const roleOptions: Array<{ label: string; value: Person['role'] }> = [
  { label: 'Dev', value: 'DEV' },
  { label: 'QA', value: 'QA' },
  { label: 'BA', value: 'BA' },
  { label: 'PO', value: 'PO' },
  { label: 'UX', value: 'UX' },
  { label: 'Tech Lead', value: 'TECH_LEAD' },
  { label: 'QA Lead', value: 'QA_LEAD' },
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
  BA: 'BA',
  PO: 'PO',
  UX: 'UX',
  TECH_LEAD: 'Tech Lead',
  QA_LEAD: 'QA Lead',
  MANAGER: 'Gestor'
};

const seniorityLabelMap: Record<Person['seniority'], string> = {
  INTERN: 'Estagiário',
  JUNIOR: 'Júnior',
  MID: 'Pleno',
  SENIOR: 'Sênior',
  STAFF: 'Especialista'
};

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Falha ao processar imagem'));
    reader.readAsDataURL(file);
  });
}

export function PeopleManager() {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [form] = Form.useForm<PersonFormValues>();
  const [autoLinkForm] = Form.useForm<{ githubOrgUrl: string }>();
  const [mounted, setMounted] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [autoLinkLoading, setAutoLinkLoading] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [autoLinkModalOpen, setAutoLinkModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    setMounted(true);
  }, []);

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

        localStorage.setItem('teamsight_user_name', data.user.name);

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
          if (response.status === 401) {
            localStorage.removeItem('teamsight_token');
            localStorage.removeItem('teamsight_user_name');
            setToken(null);
            router.replace('/login');
          }
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
    [messageApi, router]
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadPeople(token);
  }, [token, loadPeople]);

  const currentAvatarUrl = Form.useWatch('avatarUrl', form) ?? '';

  const handleAvatarSelect = async (file: File) => {
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
      form.setFieldValue('avatarUrl', dataUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Falha ao processar imagem';
      messageApi.error(errorMessage);
    }

    return Upload.LIST_IGNORE;
  };

  const clearAvatar = () => {
    form.setFieldValue('avatarUrl', '');
  };

  const openCreateModal = () => {
    setEditingPerson(null);
    form.setFieldsValue({
      name: '',
      email: '',
      role: 'DEV',
      seniority: 'MID',
      jiraUserKey: '',
      gitUsername: '',
      avatarUrl: '',
      active: true
    });
    setModalOpen(true);
  };

  const openEditModal = (person: Person) => {
    setEditingPerson(person);
    form.setFieldsValue({
      name: person.name,
      email: person.email,
      role: person.role,
      seniority: person.seniority,
      jiraUserKey: person.jiraUserKey ?? '',
      gitUsername: person.gitUsername ?? '',
      avatarUrl: person.avatarUrl ?? '',
      active: person.active
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPerson(null);
    form.resetFields();
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

  const handleSubmitPerson = async (values: PersonFormValues) => {
    if (!token) {
      messageApi.error('Sessão inválida, faça login novamente.');
      router.replace('/login');
      return;
    }

    const editingTarget = editingPerson;
    const isEditMode = Boolean(editingTarget);

    if (isEditMode && !editingTarget) {
      messageApi.error('Pessoa inválida para edição.');
      return;
    }

    setSubmitLoading(true);

    try {
      let endpoint = `${apiUrl}/people`;
      let method: 'POST' | 'PATCH' = 'POST';

      if (editingTarget) {
        endpoint = `${apiUrl}/people/${editingTarget.id}`;
        method = 'PATCH';
      }

      const response = await fetch(
        endpoint,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(values)
        }
      );

      const data = (await response.json()) as {
        person?: Person;
        message?: string;
      };

      if (!response.ok || !data.person) {
        if (response.status === 401) {
          localStorage.removeItem('teamsight_token');
          localStorage.removeItem('teamsight_user_name');
          setToken(null);
          router.replace('/login');
        }
        throw new Error(
          data.message ??
            (isEditMode ? 'Falha ao atualizar pessoa' : 'Falha ao cadastrar pessoa')
        );
      }

      const savedPerson = data.person;

      if (isEditMode) {
        setPeople((previous) =>
          previous.map((person) => (person.id === savedPerson.id ? savedPerson : person))
        );
      } else {
        setPeople((previous) => [savedPerson, ...previous]);
      }

      messageApi.success(isEditMode ? 'Pessoa atualizada com sucesso' : 'Pessoa cadastrada com sucesso');
      closeModal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro inesperado';
      messageApi.error(errorMessage);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAutoLinkIntegrations = async (values: { githubOrgUrl: string }) => {
    if (!token) {
      messageApi.error('Sessão inválida, faça login novamente.');
      router.replace('/login');
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
          localStorage.removeItem('teamsight_token');
          localStorage.removeItem('teamsight_user_name');
          setToken(null);
          router.replace('/login');
        }
        throw new Error(data.message ?? 'Falha na vinculação automática de integrações');
      }

      const { total, jira, github } = data.summary;
      localStorage.setItem(githubOrgStorageKey, values.githubOrgUrl.trim());

      messageApi.success(
        `Concluído. Total: ${total}. Jira -> vinculados: ${jira.linked}, fotos: ${jira.photosUpdated}, não encontrados: ${jira.notFound}, sem mudança: ${jira.unchanged}, erros: ${jira.errors}. GitHub -> vinculados: ${github.linked}, não encontrados: ${github.notFound}, sem mudança: ${github.unchanged}, erros: ${github.errors}.`
      );

      await loadPeople(token);
      closeAutoLinkModal();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao vincular integrações';
      messageApi.error(errorMessage);
    } finally {
      setAutoLinkLoading(false);
    }
  };

  if (!mounted || sessionChecking || !token) {
    return <AppLoading />;
  }

  return (
    <AppShell
      selectedPath="/people"
      title="Pessoas"
      subtitle="Gerencie membros do time com cargo e nível"
      currentUserName={currentUser?.name}
    >
      {contextHolder}

      <Card
        title={`Pessoas cadastradas (${people.length})`}
        extra={
          <Flex gap={8} wrap="wrap" justify="end">
            <Button onClick={openAutoLinkModal} loading={autoLinkLoading}>
              Vinculação automática
            </Button>
            <Button type="primary" onClick={openCreateModal}>
              Adicionar
            </Button>
          </Flex>
        }
      >
        <Flex vertical gap={12}>
          <Typography.Text type="secondary">
            Toque em uma linha para abrir a edição da pessoa.
          </Typography.Text>

          <Table<Person>
            rowKey="id"
            loading={listLoading}
            dataSource={people}
            size={isMobile ? 'small' : 'middle'}
            scroll={{ x: 860 }}
            pagination={{
              pageSize: isMobile ? 6 : 10,
              showSizeChanger: !isMobile
            }}
            onRow={(record) => ({
              onClick: () => openEditModal(record),
              style: { cursor: 'pointer' }
            })}
            columns={[
              {
                title: 'Pessoa',
                key: 'person',
                width: 320,
                render: (_: unknown, person: Person) => (
                  <Flex align="center" gap={10}>
                    <Avatar src={person.avatarUrl ?? undefined} icon={<UserOutlined />} />
                    <Flex vertical gap={0}>
                      <Typography.Text strong>{person.name}</Typography.Text>
                      <Typography.Text type="secondary">{person.email}</Typography.Text>
                    </Flex>
                  </Flex>
                )
              },
              {
                title: 'Cargo',
                dataIndex: 'role',
                width: 130,
                render: (role: Person['role']) => <Tag>{roleLabelMap[role]}</Tag>
              },
              {
                title: 'Integrações',
                key: 'integrations',
                width: 260,
                render: (_: unknown, person: Person) => (
                  <Flex vertical gap={2}>
                    <Typography.Text type="secondary">
                      Jira: {person.jiraUserKey?.trim() ? person.jiraUserKey : 'Não informado'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Git: {person.gitUsername?.trim() ? person.gitUsername : 'Não informado'}
                    </Typography.Text>
                  </Flex>
                )
              },
              {
                title: 'Nível',
                dataIndex: 'seniority',
                width: 130,
                render: (seniority: Person['seniority']) => (
                  <Tag color="blue">{seniorityLabelMap[seniority]}</Tag>
                )
              },
              {
                title: 'Status',
                dataIndex: 'active',
                width: 120,
                render: (active: boolean) => (
                  <Tag color={active ? 'green' : 'red'}>{active ? 'Ativo' : 'Inativo'}</Tag>
                )
              }
            ]}
          />
        </Flex>
      </Card>

      <Modal
        title={editingPerson ? 'Editar pessoa' : 'Adicionar pessoa'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText={editingPerson ? 'Salvar' : 'Cadastrar'}
        cancelText="Cancelar"
        confirmLoading={submitLoading}
        destroyOnHidden
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Form<PersonFormValues> form={form} layout="vertical" onFinish={handleSubmitPerson}>
          <Form.Item name="avatarUrl" hidden>
            <Input />
          </Form.Item>

          <Form.Item label="Foto">
            <Flex align="center" gap={12} wrap>
              <Avatar
                size={72}
                src={currentAvatarUrl || undefined}
                icon={<UserOutlined />}
                style={{ flexShrink: 0 }}
              />

              <Flex gap={8} wrap>
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => handleAvatarSelect(file as File)}
                >
                  <Button icon={<UploadOutlined />}>Enviar foto</Button>
                </Upload>

                <Button htmlType="button" onClick={clearAvatar} disabled={!currentAvatarUrl}>
                  Remover foto
                </Button>
              </Flex>
            </Flex>

            <Typography.Text type="secondary">PNG/JPG até {maxAvatarSizeMb}MB.</Typography.Text>
          </Form.Item>

          <Form.Item label="Nome" name="name" rules={[{ required: true, message: 'Informe um nome' }]}>
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
            label="Vínculo Jira"
            name="jiraUserKey"
            extra="Aceita accountId ou URL de perfil do Jira. O sistema valida e normaliza ao salvar."
          >
            <Input placeholder="ed44d5f9-22cb-411b-871d-92f63354eac9" size="large" />
          </Form.Item>

          <Form.Item label="Usuário Git" name="gitUsername" extra="Ex.: login no GitHub/GitLab">
            <Input placeholder="gitusername" size="large" />
          </Form.Item>

          <Form.Item label="Cargo" name="role" rules={[{ required: true, message: 'Selecione um cargo' }]}>
            <Select options={roleOptions} size="large" />
          </Form.Item>

          <Form.Item
            label="Nível"
            name="seniority"
            rules={[{ required: true, message: 'Selecione um nível' }]}
          >
            <Select options={seniorityOptions} size="large" />
          </Form.Item>

          <Form.Item label="Status" name="active" valuePropName="checked">
            <Switch checkedChildren="Ativo" unCheckedChildren="Inativo" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Vinculação automática"
        open={autoLinkModalOpen}
        onCancel={closeAutoLinkModal}
        onOk={() => autoLinkForm.submit()}
        okText="Executar vínculo"
        cancelText="Cancelar"
        confirmLoading={autoLinkLoading}
        destroyOnHidden
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Form<{ githubOrgUrl: string }>
          form={autoLinkForm}
          layout="vertical"
          onFinish={handleAutoLinkIntegrations}
        >
          <Form.Item
            label="Link da organização GitHub"
            name="githubOrgUrl"
            extra="Ex.: https://github.com/sua-org ou apenas sua-org"
            rules={[{ required: true, message: 'Informe o link da organização GitHub' }]}
          >
            <Input placeholder={`https://github.com/${defaultGithubOrg}`} size="large" />
          </Form.Item>

          <Typography.Text type="secondary">
            O sistema vai tentar vincular Jira e GitHub por e-mail, e puxar foto do Jira quando faltar.
          </Typography.Text>
        </Form>
      </Modal>
    </AppShell>
  );
}
