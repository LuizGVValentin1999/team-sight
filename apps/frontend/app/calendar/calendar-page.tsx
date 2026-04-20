'use client';

import '@ant-design/v5-patch-for-react-19';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  Avatar,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  Modal,
  Popover,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  DatePicker
} from 'antd';
import { CalendarOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { AppLoading } from '../components/app-loading';
import { AppShell } from '../components/app-shell';
import { useProtectedSession } from '../hooks/use-protected-session';
import { type CalendarOverviewResponse, type TeamVacation } from '../shared/calendar';

const { RangePicker } = DatePicker;

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3399';
const weekdayLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const monthLabels = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];
const avatarPalette = ['#1d39c4', '#08979c', '#7c3aed', '#d46b08', '#cf1322', '#4338ca', '#0f766e'];

type VacationFormValues = {
  userId: string;
  range: [Dayjs, Dayjs];
  description?: string;
};

function hashString(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function colorForUser(userId: string) {
  return avatarPalette[hashString(userId) % avatarPalette.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '??';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function buildMonthCells(year: number, monthIndex: number) {
  const monthStart = dayjs(new Date(year, monthIndex, 1));
  const calendarStart = monthStart.subtract(monthStart.day(), 'day');

  return Array.from({ length: 42 }, (_, index) => calendarStart.add(index, 'day'));
}

export function CalendarPage() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [messageApi, contextHolder] = message.useMessage();
  const { mounted, sessionChecking, token, currentUser, invalidateSession } = useProtectedSession({
    apiUrl,
    onInvalidSessionMessage: (text) => {
      messageApi.error(text);
    }
  });

  const [overview, setOverview] = useState<CalendarOverviewResponse | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedPersonId, setSelectedPersonId] = useState<string | undefined>(undefined);
  const [searchName, setSearchName] = useState('');
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(dayjs().format('YYYY-MM-DD'));
  const [dayDetailsOpen, setDayDetailsOpen] = useState(false);
  const [vacationModalOpen, setVacationModalOpen] = useState(false);
  const [savingVacation, setSavingVacation] = useState(false);
  const [editingVacation, setEditingVacation] = useState<TeamVacation | null>(null);
  const [deletingVacationId, setDeletingVacationId] = useState<string | null>(null);
  const [vacationForm] = Form.useForm<VacationFormValues>();

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => {
      const year = current - 2 + index;
      return { label: String(year), value: year };
    });
  }, []);

  const loadOverview = useCallback(
    async (nextYear?: number, nextPersonId?: string, nextSearch?: string) => {
      if (!token) {
        invalidateSession('Sessão inválida, faça login novamente.');
        return;
      }

      const year = nextYear ?? selectedYear;
      const personId = nextPersonId ?? selectedPersonId;
      const search = (nextSearch ?? searchName).trim();

      setLoadingOverview(true);

      try {
        const params = new URLSearchParams({ year: String(year) });

        if (personId) {
          params.set('personId', personId);
        }

        if (search) {
          params.set('search', search);
        }

        const response = await fetch(`${apiUrl}/calendar/overview?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = (await response.json()) as CalendarOverviewResponse & { message?: string };

        if (!response.ok) {
          throw new Error(data.message ?? 'Não foi possível carregar o calendário.');
        }

        setOverview(data);
        setSelectedYear(year);

        if (dayjs(selectedDateKey).year() !== year) {
          setSelectedDateKey(`${year}-01-01`);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Erro ao carregar calendário.';
        messageApi.error(text);
      } finally {
        setLoadingOverview(false);
      }
    },
    [invalidateSession, messageApi, searchName, selectedDateKey, selectedPersonId, selectedYear, token]
  );

  useEffect(() => {
    if (!token || overview) {
      return;
    }

    void loadOverview();
  }, [loadOverview, overview, token]);

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const holiday of overview?.holidays ?? []) {
      map.set(holiday.date, holiday.name);
    }

    return map;
  }, [overview]);

  const vacationsByDate = useMemo(() => {
    const map = new Map<string, TeamVacation[]>();

    for (const vacation of overview?.vacations ?? []) {
      let cursor = dayjs(vacation.startDate).startOf('day');
      const end = dayjs(vacation.endDate).startOf('day');

      while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
        const key = cursor.format('YYYY-MM-DD');
        const existing = map.get(key) ?? [];
        existing.push(vacation);
        map.set(key, existing);
        cursor = cursor.add(1, 'day');
      }
    }

    return map;
  }, [overview]);

  const selectedDateVacations = useMemo(
    () => vacationsByDate.get(selectedDateKey) ?? [],
    [selectedDateKey, vacationsByDate]
  );

  const selectedDateHoliday = holidayMap.get(selectedDateKey) ?? null;

  const peopleOptions = useMemo(
    () =>
      (overview?.people ?? []).map((person) => ({
        label: `${person.name} (${person.email})`,
        value: person.id
      })),
    [overview]
  );

  const openCreateVacationModal = () => {
    setEditingVacation(null);

    const selectedDate = dayjs(selectedDateKey);
    vacationForm.setFieldsValue({
      userId: selectedPersonId,
      range: [selectedDate, selectedDate],
      description: ''
    });

    setVacationModalOpen(true);
  };

  const openEditVacationModal = (vacation: TeamVacation) => {
    setEditingVacation(vacation);
    vacationForm.setFieldsValue({
      userId: vacation.userId,
      range: [dayjs(vacation.startDate), dayjs(vacation.endDate)],
      description: vacation.description ?? ''
    });
    setVacationModalOpen(true);
  };

  const closeVacationModal = () => {
    setVacationModalOpen(false);
    setEditingVacation(null);
    vacationForm.resetFields();
  };

  const saveVacation = async () => {
    if (!token) {
      return;
    }

    try {
      const values = await vacationForm.validateFields();
      setSavingVacation(true);

      const payload = {
        userId: values.userId,
        startDate: values.range[0].startOf('day').toISOString(),
        endDate: values.range[1].endOf('day').toISOString(),
        description: values.description?.trim() || ''
      };

      const url = editingVacation
        ? `${apiUrl}/calendar/vacations/${encodeURIComponent(editingVacation.id)}`
        : `${apiUrl}/calendar/vacations`;

      const response = await fetch(url, {
        method: editingVacation ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? 'Não foi possível salvar férias.');
      }

      messageApi.success(editingVacation ? 'Férias atualizadas.' : 'Férias cadastradas.');
      closeVacationModal();
      await loadOverview();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }

      const text = error instanceof Error ? error.message : 'Erro ao salvar férias.';
      messageApi.error(text);
    } finally {
      setSavingVacation(false);
    }
  };

  const deleteVacation = async (vacationId: string) => {
    if (!token) {
      return;
    }

    setDeletingVacationId(vacationId);

    try {
      const response = await fetch(`${apiUrl}/calendar/vacations/${encodeURIComponent(vacationId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'Não foi possível remover as férias.');
      }

      messageApi.success('Férias removidas.');
      setDayDetailsOpen(false);
      closeVacationModal();
      await loadOverview();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Erro ao remover férias.';
      messageApi.error(text);
    } finally {
      setDeletingVacationId(null);
    }
  };

  const monthCards = useMemo(() => {
    const referenceYear = overview?.year ?? selectedYear;

    return monthLabels.map((label, monthIndex) => {
      const cells = buildMonthCells(referenceYear, monthIndex);

      return {
        monthIndex,
        label,
        cells
      };
    });
  }, [overview, selectedYear, vacationsByDate, holidayMap]);

  if (!mounted || sessionChecking || !token) {
    return <AppLoading />;
  }

  const dayCellMinHeight = isMobile ? 56 : 44;
  const dayCellPadding = isMobile ? 4 : 3;
  const dayNumberFontSize = isMobile ? 12 : 11;
  const dayBadgeFontSize = isMobile ? 10 : 9;

  return (
    <AppShell
      selectedPath="/calendar"
      title="Calendário do Time"
      subtitle="12 meses visíveis com feriados nacionais e férias do time"
      currentUserName={currentUser?.name}
      headerActions={
        <Button type="primary" icon={<CalendarOutlined />} onClick={openCreateVacationModal}>
          Cadastrar férias
        </Button>
      }
    >
      {contextHolder}

      <Flex vertical gap={12}>
        <Card>
          <Flex gap={12} wrap align="end">
            <div style={{ minWidth: 120 }}>
              <Typography.Text type="secondary">Ano</Typography.Text>
              <Select
                value={selectedYear}
                options={yearOptions}
                style={{ width: '100%', marginTop: 4 }}
                onChange={(value) => setSelectedYear(value)}
              />
            </div>

            <div style={{ minWidth: 300, flex: '1 1 300px' }}>
              <Typography.Text type="secondary">Pessoa</Typography.Text>
              <Select
                allowClear
                value={selectedPersonId}
                onChange={(value) => setSelectedPersonId(value)}
                options={peopleOptions}
                placeholder="Todos"
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>

            <div style={{ minWidth: 220, flex: '1 1 220px' }}>
              <Typography.Text type="secondary">Filtrar por nome</Typography.Text>
              <Input
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
                placeholder="Digite parte do nome"
                style={{ marginTop: 4 }}
              />
            </div>

            <Space wrap>
              <Button type="primary" loading={loadingOverview} onClick={() => void loadOverview()}>
                Aplicar
              </Button>
              <Button
                onClick={() => {
                  setSelectedPersonId(undefined);
                  setSearchName('');
                  void loadOverview(selectedYear, undefined, '');
                }}
              >
                Limpar
              </Button>
              <Popover
                trigger="click"
                content={
                  <Flex vertical gap={8} style={{ maxWidth: 300 }}>
                    <Typography.Text>
                      <Tag color="red">Feriado</Tag> Dia não contado em horas úteis quando cair em dia de semana.
                    </Typography.Text>
                    <Typography.Text>
                      <Tag color="blue">Férias</Tag> Pessoas em férias no dia.
                    </Typography.Text>
                    <Typography.Text type="secondary">Clique em um dia para ver os detalhes.</Typography.Text>
                  </Flex>
                }
              >
                <Button icon={<InfoCircleOutlined />}>Legenda</Button>
              </Popover>
              <Button onClick={() => setDayDetailsOpen(true)} disabled={!selectedDateKey}>
                Detalhes do dia
              </Button>
            </Space>
          </Flex>
        </Card>

        {!overview && !loadingOverview ? (
          <Card>
            <Empty
              description="Clique em aplicar para carregar o calendário anual."
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </Card>
        ) : null}

        {overview ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))',
              gap: 12
            }}
          >
            {monthCards.map((monthCard) => (
              <Card
                key={monthCard.monthIndex}
                bodyStyle={{ padding: 10 }}
                title={
                  <Space size={4}>
                    <Typography.Text strong>{monthCard.label}</Typography.Text>
                    <Typography.Text type="secondary">{overview.year}</Typography.Text>
                  </Space>
                }
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
                  {weekdayLabels.map((label, index) => (
                    <Typography.Text
                      key={`${monthCard.monthIndex}-${label}-${index}`}
                      type="secondary"
                      style={{ textAlign: 'center', fontSize: isMobile ? 12 : 11 }}
                    >
                      {label}
                    </Typography.Text>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {monthCard.cells.map((day) => {
                    const dayKey = day.format('YYYY-MM-DD');
                    const inMonth = day.month() === monthCard.monthIndex;
                    const isWeekend = day.day() === 0 || day.day() === 6;
                    const isSelected = dayKey === selectedDateKey;
                    const holidayName = holidayMap.get(dayKey);
                    const dayVacations = vacationsByDate.get(dayKey) ?? [];

                    return (
                      <Tooltip
                        key={dayKey}
                        title={
                          <Flex vertical gap={4}>
                            <Typography.Text style={{ color: '#fff' }}>{day.format('DD/MM/YYYY')}</Typography.Text>
                            {holidayName ? <Typography.Text style={{ color: '#fff' }}>Feriado: {holidayName}</Typography.Text> : null}
                            {dayVacations.length > 0 ? (
                              <Typography.Text style={{ color: '#fff' }}>
                                Férias: {dayVacations.map((item) => item.user.name).join(', ')}
                              </Typography.Text>
                            ) : null}
                          </Flex>
                        }
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedDateKey(dayKey)}
                          style={{
                            border: holidayName ? '1px solid #ff4d4f' : isSelected ? '1px solid #1677ff' : '1px solid #d9d9d9',
                            borderRadius: 8,
                            minHeight: dayCellMinHeight,
                            padding: dayCellPadding,
                            background: isSelected ? 'rgba(22, 119, 255, 0.08)' : inMonth ? 'transparent' : 'rgba(0,0,0,0.03)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            opacity: inMonth ? 1 : 0.55
                          }}
                        >
                          <Flex vertical gap={3}>
                            <Typography.Text
                              style={{
                                fontSize: dayNumberFontSize,
                                color: isWeekend ? '#8c8c8c' : undefined,
                                fontWeight: holidayName ? 700 : 500
                              }}
                            >
                              {day.format('DD')}
                            </Typography.Text>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {dayVacations.slice(0, 2).map((vacation) => (
                                <div
                                  key={`${dayKey}-${vacation.id}`}
                                  style={{
                                    background: colorForUser(vacation.userId),
                                    color: '#fff',
                                    borderRadius: 10,
                                    fontSize: dayBadgeFontSize,
                                    lineHeight: 1,
                                    padding: isMobile ? '3px 5px' : '2px 4px',
                                    fontWeight: 600
                                  }}
                                >
                                  {getInitials(vacation.user.name)}
                                </div>
                              ))}
                              {dayVacations.length > 2 ? (
                                <div
                                  style={{
                                    background: '#595959',
                                    color: '#fff',
                                    borderRadius: 10,
                                    fontSize: dayBadgeFontSize,
                                    lineHeight: 1,
                                    padding: isMobile ? '3px 5px' : '2px 4px',
                                    fontWeight: 600
                                  }}
                                >
                                  +{dayVacations.length - 2}
                                </div>
                              ) : null}
                            </div>
                          </Flex>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </Flex>

      <Modal
        title={`Detalhes do dia ${dayjs(selectedDateKey).format('DD/MM/YYYY')}`}
        open={dayDetailsOpen}
        onCancel={() => setDayDetailsOpen(false)}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 680}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Flex vertical gap={12}>
          {selectedDateHoliday ? (
            <AlertHoliday holidayName={selectedDateHoliday} />
          ) : (
            <Typography.Text type="secondary">Sem feriado nacional neste dia.</Typography.Text>
          )}

          <Card
            size="small"
            title={`Pessoas em férias (${selectedDateVacations.length})`}
            extra={<Button type="link" onClick={openCreateVacationModal}>Nova férias</Button>}
          >
            {selectedDateVacations.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhuma pessoa em férias neste dia." />
            ) : (
              <Flex vertical gap={8}>
                {selectedDateVacations.map((vacation) => (
                  <Card key={vacation.id} size="small">
                    <Flex align="center" justify="space-between" gap={12} wrap>
                      <Space align="center">
                        <Avatar style={{ background: colorForUser(vacation.userId) }} src={vacation.user.avatarUrl ?? undefined}>
                          {getInitials(vacation.user.name)}
                        </Avatar>
                        <div>
                          <Typography.Text strong>{vacation.user.name}</Typography.Text>
                          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                            {dayjs(vacation.startDate).format('DD/MM/YYYY')} até {dayjs(vacation.endDate).format('DD/MM/YYYY')}
                          </Typography.Paragraph>
                          {vacation.description ? (
                            <Typography.Paragraph style={{ margin: 0 }}>{vacation.description}</Typography.Paragraph>
                          ) : null}
                        </div>
                      </Space>

                      <Space>
                        <Button size="small" onClick={() => openEditVacationModal(vacation)}>
                          Editar
                        </Button>
                        <Button
                          danger
                          size="small"
                          loading={deletingVacationId === vacation.id}
                          onClick={() => void deleteVacation(vacation.id)}
                        >
                          Remover
                        </Button>
                      </Space>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            )}
          </Card>
        </Flex>
      </Modal>

      <Modal
        title={editingVacation ? 'Editar férias' : 'Cadastrar férias'}
        open={vacationModalOpen}
        onCancel={closeVacationModal}
        onOk={() => void saveVacation()}
        okText="Salvar"
        cancelText="Cancelar"
        confirmLoading={savingVacation}
        width={isMobile ? 'calc(100vw - 24px)' : 560}
        centered={!isMobile}
        style={isMobile ? { top: 12 } : undefined}
      >
        <Form form={vacationForm} layout="vertical">
          <Form.Item
            label="Pessoa"
            name="userId"
            rules={[{ required: true, message: 'Selecione uma pessoa.' }]}
          >
            <Select
              showSearch
              placeholder="Selecione a pessoa"
              options={peopleOptions}
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item
            label="Período"
            name="range"
            rules={[{ required: true, message: 'Selecione o período de férias.' }]}
          >
            <RangePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Descrição" name="description">
            <Input.TextArea rows={3} maxLength={500} placeholder="Observações opcionais" />
          </Form.Item>

          {editingVacation ? (
            <Button
              danger
              loading={deletingVacationId === editingVacation.id}
              onClick={() => void deleteVacation(editingVacation.id)}
            >
              Remover férias
            </Button>
          ) : null}
        </Form>
      </Modal>
    </AppShell>
  );
}

function AlertHoliday({ holidayName }: { holidayName: string }) {
  return (
    <Card size="small" style={{ borderColor: '#ffccc7', background: '#fff1f0' }}>
      <Typography.Text strong style={{ color: '#cf1322' }}>
        Feriado nacional
      </Typography.Text>
      <Typography.Paragraph style={{ margin: '4px 0 0 0' }}>{holidayName}</Typography.Paragraph>
    </Card>
  );
}
