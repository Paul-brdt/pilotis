export type TimesheetSnapshot = {
  version: 1;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  agency: {
    name: string;
    code: string;
    address: string | null;
    postalCode: string | null;
    city: string | null;
  };
  project: { name: string; code: string; location: string | null };
  days: Array<{ date: string; label: string }>;
  workers: Array<{
    id: string;
    name: string;
    qualification: string | null;
    coefficient: number | null;
    hours: number[];
    total: number;
    meals: number;
  }>;
  totalHours: number;
  totalMeals: number;
};

export function isoWeekNumber(date: Date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}