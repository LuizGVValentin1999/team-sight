export type CalendarHoliday = {
  date: string;
  name: string;
};

const fixedNationalHolidays = [
  { month: 1, day: 1, name: 'Confraternização Universal' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 9, day: 7, name: 'Independência do Brasil' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  { month: 12, day: 25, name: 'Natal' }
] as const;

const workdayWindows = [
  { startHour: 8, startMinute: 30, endHour: 12, endMinute: 0 },
  { startHour: 13, startMinute: 30, endHour: 18, endMinute: 0 }
] as const;
const curitibaIbgeCode = '4106902';
const holidaysApiCache = new Map<number, CalendarHoliday[]>();

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function createLocalDate(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function parseBrazilDate(value: string) {
  const trimmed = value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function calculateEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return createLocalDate(year, month, day);
}

export function getBrazilNationalHolidays(year: number): CalendarHoliday[] {
  const holidays: CalendarHoliday[] = fixedNationalHolidays.map((holiday) => {
    const date = createLocalDate(year, holiday.month, holiday.day);
    return {
      date: toDateKey(date),
      name: holiday.name
    };
  });

  // Lei nº 14.759/2023 (vigência a partir de 2024)
  if (year >= 2024) {
    holidays.push({
      date: toDateKey(createLocalDate(year, 11, 20)),
      name: 'Dia Nacional de Zumbi e da Consciência Negra'
    });
  }

  // Paixão de Cristo (Sexta-feira Santa): 2 dias antes da Páscoa.
  const easterSunday = calculateEasterSunday(year);
  const goodFriday = addDays(easterSunday, -2);
  holidays.push({
    date: toDateKey(goodFriday),
    name: 'Paixão de Cristo'
  });

  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return holidays;
}

function getCuritibaMunicipalHolidaysFallback(year: number): CalendarHoliday[] {
  const easterSunday = calculateEasterSunday(year);
  const corpusChristi = addDays(easterSunday, 60);

  return [
    {
      date: toDateKey(corpusChristi),
      name: 'Corpus Christi (Curitiba)'
    },
    {
      date: toDateKey(createLocalDate(year, 9, 8)),
      name: 'Nossa Senhora da Luz dos Pinhais (Curitiba)'
    }
  ];
}

function deduplicateHolidays(holidays: CalendarHoliday[]) {
  const unique = new Map<string, CalendarHoliday>();

  for (const holiday of holidays) {
    const key = `${holiday.date}|${holiday.name}`;

    if (!unique.has(key)) {
      unique.set(key, holiday);
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBrazilAndCuritibaHolidaysFromApi(year: number) {
  const apiToken = process.env.FERIADOS_API_TOKEN?.trim();

  if (!apiToken) {
    return null;
  }

  const apiBaseUrl = (process.env.FERIADOS_API_BASE_URL?.trim() || 'https://feriadosapi.com').replace(
    /\/+$/,
    ''
  );
  const response = await fetch(
    `${apiBaseUrl}/api/v1/feriados/cidade/${curitibaIbgeCode}?ano=${encodeURIComponent(String(year))}`,
    {
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Feriados API ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    feriados?: Array<{
      data?: string;
      nome?: string;
      tipo?: string;
    }>;
  };
  const result: CalendarHoliday[] = [];

  for (const holiday of payload.feriados ?? []) {
    const name = holiday.nome?.trim();
    const date = holiday.data ? parseBrazilDate(holiday.data) : null;
    const type = holiday.tipo?.trim().toUpperCase();

    if (!name || !date) {
      continue;
    }

    if (type !== 'NACIONAL' && type !== 'MUNICIPAL') {
      continue;
    }

    result.push({
      date,
      name: type === 'MUNICIPAL' ? `${name} (Curitiba)` : name
    });
  }

  return deduplicateHolidays(result);
}

function getFallbackBrazilAndCuritibaHolidays(year: number) {
  return deduplicateHolidays([
    ...getBrazilNationalHolidays(year),
    ...getCuritibaMunicipalHolidaysFallback(year)
  ]);
}

export async function getBrazilAndCuritibaHolidays(year: number): Promise<CalendarHoliday[]> {
  const cached = holidaysApiCache.get(year);

  if (cached) {
    return cached;
  }

  try {
    const fromApi = await fetchBrazilAndCuritibaHolidaysFromApi(year);

    if (fromApi && fromApi.length > 0) {
      holidaysApiCache.set(year, fromApi);
      return fromApi;
    }
  } catch {
    // fallback local quando API indisponível ou sem token
  }

  const fallback = getFallbackBrazilAndCuritibaHolidays(year);
  holidaysApiCache.set(year, fallback);
  return fallback;
}

export function getBrazilHolidayDateSetForRange(start: Date, end: Date) {
  const safeStartYear = Math.min(start.getFullYear(), end.getFullYear());
  const safeEndYear = Math.max(start.getFullYear(), end.getFullYear());
  const dates = new Set<string>();

  for (let year = safeStartYear; year <= safeEndYear; year += 1) {
    for (const holiday of getBrazilNationalHolidays(year)) {
      dates.add(holiday.date);
    }
  }

  return dates;
}

export async function getBrazilAndCuritibaHolidayDateSetForRange(start: Date, end: Date) {
  const safeStartYear = Math.min(start.getFullYear(), end.getFullYear());
  const safeEndYear = Math.max(start.getFullYear(), end.getFullYear());
  const dates = new Set<string>();

  for (let year = safeStartYear; year <= safeEndYear; year += 1) {
    const holidays = await getBrazilAndCuritibaHolidays(year);

    for (const holiday of holidays) {
      dates.add(holiday.date);
    }
  }

  return dates;
}

function isBusinessWeekday(date: Date) {
  const dayOfWeek = date.getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

export function minutesToHours(minutes: number) {
  return Number((minutes / 60).toFixed(2));
}

export function calculateBusinessMinutesBetween(
  start: Date,
  end: Date,
  options?: {
    holidayDateSet?: Set<string>;
  }
) {
  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  const holidayDateSet = options?.holidayDateSet ?? getBrazilHolidayDateSetForRange(start, end);
  let totalMinutes = 0;

  const cursor = new Date(start.getTime());
  cursor.setHours(0, 0, 0, 0);

  const endDay = new Date(end.getTime());
  endDay.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= endDay.getTime()) {
    const isHoliday = holidayDateSet.has(toDateKey(cursor));

    if (isBusinessWeekday(cursor) && !isHoliday) {
      for (const window of workdayWindows) {
        const windowStart = new Date(cursor.getTime());
        windowStart.setHours(window.startHour, window.startMinute, 0, 0);

        const windowEnd = new Date(cursor.getTime());
        windowEnd.setHours(window.endHour, window.endMinute, 0, 0);

        const overlapStart = Math.max(start.getTime(), windowStart.getTime());
        const overlapEnd = Math.min(end.getTime(), windowEnd.getTime());

        if (overlapEnd > overlapStart) {
          totalMinutes += (overlapEnd - overlapStart) / (1000 * 60);
        }
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMinutes;
}

export function getBusinessHoursConfig() {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'server-local',
    workdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    windows: ['08:30-12:00', '13:30-18:00'],
    holidayPolicy:
      'Feriados nacionais e municipais de Curitiba em dias úteis são desconsiderados (via API, com fallback local).'
  };
}
