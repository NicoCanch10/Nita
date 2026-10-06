export type CurrencyCode = 'ARS' | 'USD' | 'EUR' | 'MXN' | 'COP' | 'CLP' | 'PEN';

export interface CurrencyConfig {
  code: CurrencyCode;
  label: string;
  symbol: string;
  locale: string;
  decimals: number;
}

export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  category: ExpenseCategory;
  dueDate?: number; // Day of the month (1-31)
  isPaid: boolean;
  notes?: string;
}

export interface VariableExpense {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  category: ExpenseCategory;
}

export type ExpenseCategory = string;

export interface CategoryInfo {
  id: string;
  label: string;
  color: string;
  badgeBg?: string;
  badgeText?: string;
  isCustom?: boolean;
}

export type ExtraDaysPosition = 'start' | 'end';

export interface WeekBreakdown {
  weekNumber: number;
  label: string;
  startDay: number;
  endDay: number;
  daysCount: number;
  baseBudget: number;
  extraDaysShare: number;
  budget: number;
  spent: number;
  remaining: number;
}

export interface MonthCalculationDetails {
  daysInMonth: number;
  coreDays: number; // 28 (4 semanas completas x 7 días)
  extraDays: number; // Días que no están dentro de las 4 semanas (ej: 3 en octubre)
  dailyBaseBudget: number; // Remanente / daysInMonth (con centavos)
  extraDaysAmount: number; // (Remanente / daysInMonth) * extraDays
  extraPerWeek: number; // extraDaysAmount / 4
  baseWeekBudget: number; // dailyBaseBudget * 7
  totalWeeklyBudget: number; // baseWeekBudget + extraPerWeek (o Remanente / 4)
}

export interface Frasco {
  number: number; // 1 to 5
  title: string; // "Frasco Nº 1: Días Extras", "Frasco Nº 2: Semana 1", etc.
  subtitle: string; // "Días 29 al 31 (3 días)", "Días 1 al 7 (7 días)"
  startDay: number;
  endDay: number;
  daysCount: number;
  formulaDescription: string; // "(Ingreso / 31) × 3" o "(Ingreso - Frasco 1) / 4"
  amount: number; // monto asignado exacto con centavos
  spent: number; // consumos registrados en este período
  remaining: number; // amount - spent
  isExtraDaysJar: boolean;
}

export interface FiveJarsCalculation {
  calculationBaseType: 'income' | 'remaining';
  baseAmount: number;
  daysInMonth: number;
  extraDays: number;
  extraDaysPosition: ExtraDaysPosition;
  dailyValue: number; // baseAmount / daysInMonth
  jar1Amount: number; // (baseAmount / daysInMonth) * extraDays
  restAmount: number; // baseAmount - jar1Amount
  weeklyJarAmount: number; // restAmount / 4
  jars: Frasco[];
}

export interface MonthData {
  income: number;
  savingsRate: number; // Percentage (e.g. 15 for 15%)
  extraDaysPosition: ExtraDaysPosition;
  categories: CategoryInfo[];
  fixedExpenses: FixedExpense[];
  variableExpenses: VariableExpense[];
}

export interface BudgetState {
  month: number; // 0-11
  year: number;
  currency: CurrencyCode;
  monthsData: Record<string, MonthData>; // Keyed by "YYYY-MM"
}

export function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}
