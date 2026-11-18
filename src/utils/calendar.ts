import { 
  WeekBreakdown, 
  VariableExpense, 
  MonthCalculationDetails, 
  Frasco, 
  FiveJarsCalculation,
  ExtraDaysPosition 
} from '../types/budget';

export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const DAY_NAMES_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Returns exact days count in a given month (0-indexed month) and year
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Calculates exact weeks as a float
 */
export function getExactWeeksInMonth(year: number, month: number): number {
  const days = getDaysInMonth(year, month);
  return days / 7;
}

export const FIXED_EXPENSE_JAR_OFFSET_KEY_BASE = 100;

export interface MonthJarRange {
  number: number;
  title: string;
  startDay: number;
  endDay: number;
  daysCount: number;
  isExtraDaysJar: boolean;
}

export function getMonthJarRanges(
  year: number,
  month: number,
  extraDaysPosition: ExtraDaysPosition = 'end',
  labels?: {
    extraDaysTitle?: string;
    weekPrefix?: string;
  }
): MonthJarRange[] {
  const daysInMonth = getDaysInMonth(year, month);
  const extraDays = Math.max(0, daysInMonth - 28);
  const extraDaysTitle = labels?.extraDaysTitle || 'Días Extras';
  const weekPrefix = labels?.weekPrefix || 'Semana';

  const jar1Start = extraDaysPosition === 'start' ? (extraDays > 0 ? 1 : 0) : (extraDays > 0 ? 29 : 0);
  const jar1End = extraDaysPosition === 'start' ? (extraDays > 0 ? extraDays : 0) : (extraDays > 0 ? daysInMonth : 0);

  const extraDaysRange: MonthJarRange = {
    number: 1,
    title: extraDaysTitle,
    startDay: jar1Start,
    endDay: jar1End,
    daysCount: extraDays,
    isExtraDaysJar: true,
  };

  if (extraDaysPosition === 'start') {
    const offset = extraDays;
    return [
      extraDaysRange,
      { number: 2, title: `${weekPrefix} 1`, startDay: offset + 1, endDay: offset + 7, daysCount: 7, isExtraDaysJar: false },
      { number: 3, title: `${weekPrefix} 2`, startDay: offset + 8, endDay: offset + 14, daysCount: 7, isExtraDaysJar: false },
      { number: 4, title: `${weekPrefix} 3`, startDay: offset + 15, endDay: offset + 21, daysCount: 7, isExtraDaysJar: false },
      { number: 5, title: `${weekPrefix} 4`, startDay: offset + 22, endDay: daysInMonth, daysCount: 7, isExtraDaysJar: false },
    ];
  }

  return [
    { number: 2, title: `${weekPrefix} 1`, startDay: 1, endDay: 7, daysCount: 7, isExtraDaysJar: false },
    { number: 3, title: `${weekPrefix} 2`, startDay: 8, endDay: 14, daysCount: 7, isExtraDaysJar: false },
    { number: 4, title: `${weekPrefix} 3`, startDay: 15, endDay: 21, daysCount: 7, isExtraDaysJar: false },
    { number: 5, title: `${weekPrefix} 4`, startDay: 22, endDay: 28, daysCount: 7, isExtraDaysJar: false },
    extraDaysRange,
  ];
}

export function hasOverbudgetJarAdjustments(jarAdjustments?: Record<number, number>): boolean {
  if (!jarAdjustments) return false;
  return [1, 2, 3, 4, 5].some(num => Math.abs(Number(jarAdjustments[num]) || 0) > 0.005);
}

export function clearOverbudgetJarAdjustments(
  jarAdjustments?: Record<number, number>
): Record<number, number> | undefined {
  if (!jarAdjustments) return undefined;
  const next: Record<number, number> = {};
  for (const [rawKey, val] of Object.entries(jarAdjustments)) {
    const numKey = Number(rawKey);
    if (numKey >= 1 && numKey <= 5) continue;
    if (typeof val === 'number' && !isNaN(val) && Math.abs(val) >= 1e-6) {
      next[numKey] = val;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Cuando un gasto fijo se modifica dentro del mes en curso (ej. día 12),
 * congela la asignación de los frascos ya finalizados (endDay < referenceDay)
 * y traslada la totalidad de la variación neta hacia los frascos presentes y futuros
 * en proporción a sus días.
 */
export function calculateMidMonthFixedExpenseJarAdjustments(
  year: number,
  month: number,
  previousRemaining: number,
  nextRemaining: number,
  extraDaysPosition: ExtraDaysPosition = 'end',
  currentJarAdjustments?: Record<number, number>,
  referenceDay?: number | null
): Record<number, number> | undefined {
  const netRemainingDelta = nextRemaining - previousRemaining;
  if (Math.abs(netRemainingDelta) < 1e-9) {
    return currentJarAdjustments;
  }

  const effectiveDay = referenceDay !== undefined ? referenceDay : getCurrentDayIfActive(year, month);
  if (effectiveDay === null || effectiveDay <= 0) {
    return currentJarAdjustments;
  }

  const daysInMonth = getDaysInMonth(year, month);
  if (daysInMonth <= 0) {
    return currentJarAdjustments;
  }

  const activeJars = getMonthJarRanges(year, month, extraDaysPosition).filter(j => j.daysCount > 0);
  const pastJars = activeJars.filter(j => j.endDay < effectiveDay);
  const presentAndFutureJars = activeJars.filter(j => j.endDay >= effectiveDay);

  if (pastJars.length === 0 || presentAndFutureJars.length === 0) {
    return currentJarAdjustments;
  }

  const totalPastDays = pastJars.reduce((sum, j) => sum + j.daysCount, 0);
  const totalFutureDays = presentAndFutureJars.reduce((sum, j) => sum + j.daysCount, 0);
  if (totalPastDays <= 0 || totalFutureDays <= 0) {
    return currentJarAdjustments;
  }

  const compensationFromPast = netRemainingDelta * (totalPastDays / daysInMonth);
  const nextAdjustments: Record<number, number> = { ...(currentJarAdjustments || {}) };

  for (const p of pastJars) {
    const autoShiftPast = netRemainingDelta * (p.daysCount / daysInMonth);
    const key = FIXED_EXPENSE_JAR_OFFSET_KEY_BASE + p.number;
    const updatedVal = (nextAdjustments[key] || 0) - autoShiftPast;
    if (Math.abs(updatedVal) < 1e-6) {
      delete nextAdjustments[key];
    } else {
      nextAdjustments[key] = updatedVal;
    }
  }

  for (const f of presentAndFutureJars) {
    const shareOfCompensation = compensationFromPast * (f.daysCount / totalFutureDays);
    const key = FIXED_EXPENSE_JAR_OFFSET_KEY_BASE + f.number;
    const updatedVal = (nextAdjustments[key] || 0) + shareOfCompensation;
    if (Math.abs(updatedVal) < 1e-6) {
      delete nextAdjustments[key];
    } else {
      nextAdjustments[key] = updatedVal;
    }
  }

  return Object.keys(nextAdjustments).length > 0 ? nextAdjustments : undefined;
}

/**
 * Calculates the exact 5-jar distribution requested by the user:
 * - El mes se divide en 5 frascos:
 *   - Frasco Nº 1: Días extras (díasDelMes - 28), aplicables al INICIO o al FINAL del mes.
 *   - Frascos Nº 2, 3, 4 y 5: Las 4 semanas de 7 días completas.
 */
export function calculateFiveJars(
  year: number,
  month: number,
  baseAmount: number,
  calculationBaseType: 'income' | 'remaining',
  variableExpenses: VariableExpense[],
  extraDaysPosition: ExtraDaysPosition = 'end',
  labels?: {
    extraDaysTitle?: string;
    weekPrefix?: string;
    noExtraDaysSubtitle?: string;
    daysCountSingular?: string;
    daysCountPlural?: string;
  },
  jarAdjustments?: Record<number, number>
): FiveJarsCalculation {
  const daysInMonth = getDaysInMonth(year, month);
  const extraDays = Math.max(0, daysInMonth - 28);
  const dailyValue = daysInMonth > 0 ? baseAmount / daysInMonth : 0;
  const jar1Amount = dailyValue * extraDays;
  const restAmount = baseAmount - jar1Amount;
  const weeklyJarAmount = restAmount / 4;

  const noExtraDaysSubtitle = labels?.noExtraDaysSubtitle || 'Sin días extras (mes exacto de 28 días)';

  const helperFilterSpent = (startDay: number, endDay: number) => {
    if (startDay <= 0 || endDay <= 0) return 0;
    return variableExpenses
      .filter(exp => {
        if (!exp.date) return false;
        const [expYear, expMonth, expDay] = exp.date.split('-').map(Number);
        return expYear === year && (expMonth - 1) === month && expDay >= startDay && expDay <= endDay;
      })
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  };

  const ranges = getMonthJarRanges(year, month, extraDaysPosition, labels);
  const jars: Frasco[] = ranges.map(range => {
    const spent = helperFilterSpent(range.startDay, range.endDay);
    const overbudgetAdj = (jarAdjustments && jarAdjustments[range.number]) || 0;
    const fixedExpenseAdj =
      (jarAdjustments && jarAdjustments[FIXED_EXPENSE_JAR_OFFSET_KEY_BASE + range.number]) || 0;
    const jarBaseAmount = range.isExtraDaysJar ? jar1Amount : weeklyJarAmount;
    const effectiveAmount = Math.max(0, jarBaseAmount + fixedExpenseAdj + overbudgetAdj);

    return {
      number: range.number,
      title: range.title,
      subtitle: range.isExtraDaysJar
        ? (extraDays > 0 ? `Días ${range.startDay} al ${range.endDay}` : noExtraDaysSubtitle)
        : `Días ${range.startDay} al ${range.endDay}`,
      startDay: range.startDay,
      endDay: range.endDay,
      daysCount: range.daysCount,
      formulaDescription: range.isExtraDaysJar
        ? (extraDays > 0 ? `(Gastos Variables / ${daysInMonth}) × ${extraDays}` : '0 (28 días)')
        : '(Gastos Variables - Días Extras) / 4',
      amount: effectiveAmount,
      spent,
      remaining: effectiveAmount - spent,
      isExtraDaysJar: range.isExtraDaysJar,
      adjustment: overbudgetAdj,
      baseAmount: jarBaseAmount,
    };
  });

  return {
    calculationBaseType,
    baseAmount,
    daysInMonth,
    extraDays,
    extraDaysPosition,
    dailyValue,
    jar1Amount,
    restAmount,
    weeklyJarAmount,
    jars,
  };
}

/**
 * Calculates the exact 4-week distribution breakdown
 */
export function calculateMonthDistribution(
  daysInMonth: number,
  monthlyRemaining: number
): MonthCalculationDetails {
  const coreDays = 28; // 4 semanas completas x 7 días
  const extraDays = Math.max(0, daysInMonth - coreDays);

  const dailyBaseBudget = daysInMonth > 0 ? monthlyRemaining / daysInMonth : 0;
  const extraDaysAmount = dailyBaseBudget * extraDays;
  const extraPerWeek = extraDaysAmount / 4;
  const baseWeekBudget = dailyBaseBudget * 7;
  const totalWeeklyBudget = baseWeekBudget + extraPerWeek;

  return {
    daysInMonth,
    coreDays,
    extraDays,
    dailyBaseBudget,
    extraDaysAmount,
    extraPerWeek,
    baseWeekBudget,
    totalWeeklyBudget,
  };
}

/**
 * Checks if selected month and year match current real-world date
 */
export function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month;
}

/**
 * Returns current day of the month if selected month is current
 */
export function getCurrentDayIfActive(year: number, month: number): number | null {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() === month) {
    return now.getDate();
  }
  return null;
}
