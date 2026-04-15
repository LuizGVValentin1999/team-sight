'use client';

import '@ant-design/v5-patch-for-react-19';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
  Avatar,
  message
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AppLoading } from '../components/app-loading';
import { AppShell } from '../components/app-shell';

type Person = {
  id: string;
  name: string;
  email: string;
  role: 'DEV' | 'QA' | 'BA' | 'PO' | 'UX' | 'TECH_LEAD' | 'QA_LEAD' | 'MANAGER';
  seniority: 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF';
  avatarUrl: string | null;
  active: boolean;
  teamId: string | null;
};

type Squad = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: Person[];
};

type SquadsBoardPayload = {
  squads: Squad[];
  unassigned: Person[];
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Person['role'];
};

type SquadFormValues = {
  name: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const unassignedContainerId = 'container-unassigned';

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

const rolesWithoutSeniority = new Set<Person['role']>(['PO', 'BA', 'TECH_LEAD', 'QA_LEAD']);

function roleSupportsSeniority(role: Person['role']) {
  return !rolesWithoutSeniority.has(role);
}

const squadColors = ['#22c55e', '#f97316', '#7c3aed', '#0891b2', '#0ea5e9', '#e11d48', '#2563eb'];

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getSquadColor(squadId: string, fallbackIndex: number) {
  const hash = hashString(squadId);
  return squadColors[(hash + fallbackIndex) % squadColors.length];
}

function personMatchesSearch(person: Person, search: string) {
  if (!search) {
    return true;
  }

  const normalized = search.toLowerCase();
  const haystack = `${person.name} ${person.email} ${roleLabelMap[person.role]} ${
    roleSupportsSeniority(person.role) ? seniorityLabelMap[person.seniority] : ''
  }`.toLowerCase();

  return haystack.includes(normalized);
}

function PersonCard({
  person,
  draggable,
  dragging,
  onClick
}: {
  person: Person;
  draggable?: boolean;
  dragging?: boolean;
  onClick?: () => void;
}) {
  const draggableId = `person-${person.id}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: draggableId,
    data: {
      personId: person.id
    },
    disabled: !draggable
  });

  const cardStyle: CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition: 'transform 120ms ease',
    opacity: isDragging || dragging ? 0.45 : 1,
    cursor: draggable ? 'grab' : 'default',
    touchAction: 'none',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 10,
    background: '#ffffff'
  };

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      onClick={onClick}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      <Flex align="center" gap={10}>
        <Avatar src={person.avatarUrl ?? undefined} icon={<UserOutlined />} />
        <div style={{ minWidth: 0 }}>
          <Typography.Text strong style={{ display: 'block' }} ellipsis>
            {person.name}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {person.email}
          </Typography.Text>
          <Space size={6} wrap>
            <Tag style={{ marginInlineEnd: 0 }}>{roleLabelMap[person.role]}</Tag>
            {roleSupportsSeniority(person.role) ? (
              <Tag style={{ marginInlineEnd: 0 }}>{seniorityLabelMap[person.seniority]}</Tag>
            ) : null}
          </Space>
        </div>
      </Flex>
    </div>
  );
}

function SquadColumn({
  containerId,
  title,
  color,
  subtitle,
  actions,
  children
}: {
  containerId: string;
  title: string;
  color: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: containerId
  });

  return (
    <Card
      ref={setNodeRef}
      style={{
        minWidth: 320,
        width: 320,
        borderRadius: 16,
        border: `2px dashed ${color}`,
        background: isOver ? '#f8fafc' : '#ffffff'
      }}
      bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      title={
        <Flex align="center" justify="space-between" gap={8}>
          <div>
            <Typography.Text strong>{title}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {subtitle}
            </Typography.Text>
          </div>
          {actions}
        </Flex>
      }
    >
      <Flex vertical gap={8}>
        {children}
      </Flex>
    </Card>
  );
}

function findContainerId(payload: SquadsBoardPayload, personId: string) {
  if (payload.unassigned.some((person) => person.id === personId)) {
    return unassignedContainerId;
  }

  const squad = payload.squads.find((item) => item.members.some((person) => person.id === personId));

  return squad ? `container-squad-${squad.id}` : null;
}

function movePersonBetweenContainers(
  payload: SquadsBoardPayload,
  personId: string,
  sourceContainerId: string,
  targetContainerId: string
) {
  if (sourceContainerId === targetContainerId) {
    return payload;
  }

  const nextPayload: SquadsBoardPayload = {
    squads: payload.squads.map((squad) => ({ ...squad, members: [...squad.members] })),
    unassigned: [...payload.unassigned]
  };

  let personToMove: Person | null = null;

  if (sourceContainerId === unassignedContainerId) {
    const personIndex = nextPayload.unassigned.findIndex((person) => person.id === personId);

    if (personIndex >= 0) {
      const [removed] = nextPayload.unassigned.splice(personIndex, 1);
      personToMove = removed;
    }
  } else {
    const sourceSquadId = sourceContainerId.replace('container-squad-', '');
    const sourceSquad = nextPayload.squads.find((squad) => squad.id === sourceSquadId);

    if (sourceSquad) {
      const personIndex = sourceSquad.members.findIndex((person) => person.id === personId);

      if (personIndex >= 0) {
        const [removed] = sourceSquad.members.splice(personIndex, 1);
        personToMove = removed;
      }
    }
  }

  if (!personToMove) {
    return payload;
  }

  if (targetContainerId === unassignedContainerId) {
    nextPayload.unassigned.push({ ...personToMove, teamId: null });
    return nextPayload;
  }

  const targetSquadId = targetContainerId.replace('container-squad-', '');
  const targetSquad = nextPayload.squads.find((squad) => squad.id === targetSquadId);

  if (!targetSquad) {
    return payload;
  }

  targetSquad.members.push({ ...personToMove, teamId: targetSquad.id });

  return nextPayload;
}

export function SquadsBoard() {
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [form] = Form.useForm<SquadFormValues>();

  const [mounted, setMounted] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [board, setBoard] = useState<SquadsBoardPayload | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeDragPersonId, setActiveDragPersonId] = useState<string | null>(null);
  const [movingPersonId, setMovingPersonId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingSquad, setEditingSquad] = useState<Squad | null>(null);

  const [messageApi, contextHolder] = message.useMessage();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8
      }
    })
  );

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

  const loadBoard = useCallback(
    async (authToken: string) => {
      setBoardLoading(true);

      try {
        const response = await fetch(`${apiUrl}/squads`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        const data = (await response.json()) as SquadsBoardPayload & { message?: string };

        if (!response.ok) {
          throw new Error(data.message ?? 'Não foi possível carregar squads');
        }

        setBoard(data);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao carregar squads';
        messageApi.error(errorMessage);
      } finally {
        setBoardLoading(false);
      }
    },
    [messageApi]
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadBoard(token);
  }, [token, loadBoard]);

  const filteredBoard = useMemo(() => {
    if (!board) {
      return null;
    }

    const normalizedSearch = search.trim().toLowerCase();

    return {
      squads: board.squads.map((squad) => ({
        ...squad,
        filteredMembers: squad.members.filter((member) => personMatchesSearch(member, normalizedSearch))
      })),
      unassigned: board.unassigned.filter((person) => personMatchesSearch(person, normalizedSearch))
    };
  }, [board, search]);

  const draggedPerson = useMemo(() => {
    if (!board || !activeDragPersonId) {
      return null;
    }

    const allPeople = [...board.unassigned, ...board.squads.flatMap((squad) => squad.members)];
    return allPeople.find((person) => person.id === activeDragPersonId) ?? null;
  }, [board, activeDragPersonId]);

  const handleDragStart = (event: DragStartEvent) => {
    const personId = event.active.data.current?.personId;

    if (typeof personId === 'string') {
      setActiveDragPersonId(personId);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragPersonId(null);

    if (!token || !board) {
      return;
    }

    const personId = event.active.data.current?.personId;

    if (typeof personId !== 'string') {
      return;
    }

    const overId = event.over?.id;

    if (!overId || typeof overId !== 'string' || !overId.startsWith('container-')) {
      return;
    }

    const sourceContainerId = findContainerId(board, personId);

    if (!sourceContainerId || sourceContainerId === overId) {
      return;
    }

    const targetSquadId = overId === unassignedContainerId ? null : overId.replace('container-squad-', '');

    setBoard((previous) => {
      if (!previous) {
        return previous;
      }

      return movePersonBetweenContainers(previous, personId, sourceContainerId, overId);
    });

    setMovingPersonId(personId);

    try {
      const response = await fetch(`${apiUrl}/squads/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          personId,
          squadId: targetSquadId
        })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível mover pessoa de squad.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao mover pessoa de squad';
      messageApi.error(errorMessage);
      await loadBoard(token);
    } finally {
      setMovingPersonId(null);
    }
  };

  const openCreateModal = () => {
    setEditingSquad(null);
    form.setFieldsValue({
      name: ''
    });
    setModalOpen(true);
  };

  const openEditModal = (squad: Squad) => {
    setEditingSquad(squad);
    form.setFieldsValue({
      name: squad.name
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingSquad(null);
    form.resetFields();
  };

  const handleSaveSquad = async (values: SquadFormValues) => {
    if (!token) {
      return;
    }

    setModalLoading(true);

    try {
      const isEdit = Boolean(editingSquad);
      const endpoint = isEdit ? `${apiUrl}/squads/${editingSquad?.id}` : `${apiUrl}/squads`;
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: values.name
        })
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível salvar squad.');
      }

      messageApi.success(isEdit ? 'Squad atualizada' : 'Squad criada');
      closeModal();
      await loadBoard(token);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar squad';
      messageApi.error(errorMessage);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteSquad = async (squad: Squad) => {
    if (!token) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/squads/${squad.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível excluir squad.');
      }

      messageApi.success('Squad excluída');
      await loadBoard(token);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao excluir squad';
      messageApi.error(errorMessage);
    }
  };

  if (!mounted || sessionChecking || !token) {
    return <AppLoading />;
  }

  return (
    <AppShell
      selectedPath="/squads"
      title="Squads"
      subtitle="Organize visualmente o time e arraste pessoas entre squads"
      currentUserName={currentUser?.name}
    >
      {contextHolder}

      <Flex vertical gap={16}>
        <Card>
          <Flex gap={10} wrap align="end" justify="space-between">
            <Input
              placeholder="Buscar pessoa por nome, e-mail, cargo ou nível"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              allowClear
              style={{ maxWidth: 460 }}
            />

            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => void loadBoard(token)} loading={boardLoading}>
                Atualizar
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                Nova squad
              </Button>
            </Space>
          </Flex>
        </Card>

        <Card
          bodyStyle={{
            padding: 12,
            backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)',
            backgroundSize: '14px 14px',
            borderRadius: 14
          }}
        >
          {boardLoading && !board ? (
            <Flex justify="center" style={{ padding: '48px 0' }}>
              <Spin />
            </Flex>
          ) : !filteredBoard ? (
            <Empty description="Sem dados de squads" />
          ) : (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={(event) => void handleDragEnd(event)}>
              <Flex gap={12} wrap={false} style={{ overflowX: 'auto', paddingBottom: 8 }}>
                <SquadColumn
                  containerId={unassignedContainerId}
                  title="Sem squad"
                  subtitle={`${filteredBoard.unassigned.length} pessoa(s) visível(is)`}
                  color="#64748b"
                >
                  {filteredBoard.unassigned.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Arraste pessoas para cá" />
                  ) : (
                    filteredBoard.unassigned.map((person) => (
                      <PersonCard
                        key={person.id}
                        person={person}
                        draggable
                        dragging={movingPersonId === person.id}
                      />
                    ))
                  )}
                </SquadColumn>

                {filteredBoard.squads.map((squad, index) => {
                  const color = getSquadColor(squad.id, index);

                  return (
                    <SquadColumn
                      key={squad.id}
                      containerId={`container-squad-${squad.id}`}
                      title={squad.name}
                      subtitle={`${squad.filteredMembers.length} pessoa(s) visível(is)`}
                      color={color}
                      actions={
                        <Space size={2}>
                          <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(squad)} />
                          <Popconfirm
                            title="Excluir squad"
                            description="As pessoas voltarão para 'Sem squad'."
                            okText="Excluir"
                            cancelText="Cancelar"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => void handleDeleteSquad(squad)}
                          >
                            <Button type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      }
                    >
                      {squad.filteredMembers.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Arraste pessoas para esta squad" />
                      ) : (
                        squad.filteredMembers.map((person) => (
                          <PersonCard
                            key={person.id}
                            person={person}
                            draggable
                            dragging={movingPersonId === person.id}
                          />
                        ))
                      )}
                    </SquadColumn>
                  );
                })}
              </Flex>

              <DragOverlay>
                {draggedPerson ? <PersonCard person={draggedPerson} /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </Card>

        {board && board.squads.length === 0 ? (
          <Card>
            <Empty description="Você ainda não criou squads. Clique em 'Nova squad' para começar." />
          </Card>
        ) : null}
      </Flex>

      <Modal
        title={editingSquad ? 'Editar squad' : 'Nova squad'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={modalLoading}
        okText={editingSquad ? 'Salvar' : 'Criar'}
        cancelText="Cancelar"
        width={isMobile ? 'calc(100vw - 24px)' : 520}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Form<SquadFormValues> form={form} layout="vertical" onFinish={(values) => void handleSaveSquad(values)}>
          <Form.Item
            label="Nome da squad"
            name="name"
            rules={[
              { required: true, message: 'Informe o nome da squad' },
              { min: 2, message: 'Nome muito curto' }
            ]}
          >
            <Input placeholder="Ex.: Sustentação" maxLength={80} />
          </Form.Item>
        </Form>
      </Modal>
    </AppShell>
  );
}
