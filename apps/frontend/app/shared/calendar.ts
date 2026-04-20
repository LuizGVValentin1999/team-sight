export type CalendarPerson = {
  id: string;
  name: string;
  email: string;
  role: string;
  seniority: string;
  avatarUrl: string | null;
  active: boolean;
};

export type CalendarHoliday = {
  date: string;
  name: string;
};

export type TeamVacation = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    seniority: string;
    avatarUrl: string | null;
  };
};

export type CalendarOverviewResponse = {
  year: number;
  holidays: CalendarHoliday[];
  people: CalendarPerson[];
  vacations: TeamVacation[];
};
