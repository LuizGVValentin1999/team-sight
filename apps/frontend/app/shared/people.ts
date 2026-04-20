import dayjs from 'dayjs';

export type PersonRole =
  | 'DEV'
  | 'QA'
  | 'BA'
  | 'PO'
  | 'UX'
  | 'TECH_LEAD'
  | 'QA_LEAD'
  | 'MANAGER';

export type Seniority = 'INTERN' | 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF';

export type PersonNextVacation = {
  id: string;
  startDate: string;
  endDate: string;
  description: string | null;
};

export const roleOptions: Array<{ label: string; value: PersonRole }> = [
  { label: 'Dev', value: 'DEV' },
  { label: 'QA', value: 'QA' },
  { label: 'BA', value: 'BA' },
  { label: 'PO', value: 'PO' },
  { label: 'UX', value: 'UX' },
  { label: 'Tech Lead', value: 'TECH_LEAD' },
  { label: 'QA Lead', value: 'QA_LEAD' },
  { label: 'Gestor', value: 'MANAGER' }
];

export const seniorityOptions: Array<{ label: string; value: Seniority }> = [
  { label: 'Estagiário', value: 'INTERN' },
  { label: 'Júnior', value: 'JUNIOR' },
  { label: 'Pleno', value: 'MID' },
  { label: 'Sênior', value: 'SENIOR' },
  { label: 'Especialista', value: 'STAFF' }
];

export const roleLabelMap: Record<PersonRole, string> = {
  DEV: 'Dev',
  QA: 'QA',
  BA: 'BA',
  PO: 'PO',
  UX: 'UX',
  TECH_LEAD: 'Tech Lead',
  QA_LEAD: 'QA Lead',
  MANAGER: 'Gestor'
};

export const seniorityLabelMap: Record<Seniority, string> = {
  INTERN: 'Estagiário',
  JUNIOR: 'Júnior',
  MID: 'Pleno',
  SENIOR: 'Sênior',
  STAFF: 'Especialista'
};

const rolesWithoutSeniority = new Set<PersonRole>(['PO', 'BA', 'TECH_LEAD', 'QA_LEAD']);

export function roleSupportsSeniority(role: PersonRole) {
  return !rolesWithoutSeniority.has(role);
}

export function formatVacationPeriod(nextVacation: PersonNextVacation | null | undefined) {
  if (!nextVacation) {
    return 'não cadastradas';
  }

  return `${dayjs(nextVacation.startDate).format('DD/MM/YYYY')} até ${dayjs(nextVacation.endDate).format('DD/MM/YYYY')}`;
}
