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

  const extraDaysTitle = labels?.extraDaysTitle || 'Días Extras';
  const weekPrefix = labels?.weekPrefix || 'Semana';
  const noExtraDaysSubtitle = labels?.noExtraDaysSubtitle || 'Sin días extras (mes exacto de 28 días)';
  const daysUnitSingular = labels?.daysCountSingular || 'día';
  const daysUnitPlural = labels?.daysCountPlural || 'días';

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

  const jars: Frasco[] = [];

  const jar1Start = extraDaysPosition === 'start' ? (extraDays > 0 ? 1 : 0) : (extraDays > 0 ? 29 : 0);
  const jar1End = extraDaysPosition === 'start' ? (extraDays > 0 ? extraDays : 0) : (extraDays > 0 ? daysInMonth : 0);
  const jar1Spent = helperFilterSpent(jar1Start, jar1End);
  const jar1Adj = (jarAdjustments && jarAdjustments[1]) || 0;
  const effectiveJar1Amount = Math.max(0, jar1Amount + jar1Adj);

  const extraDaysJar: Frasco = {
    number: 1,
    title: extraDaysTitle,
    subtitle: extraDays > 0 
      ? `Días ${jar1Start} al ${jar1End}`
      : noExtraDaysSubtitle,
    startDay: jar1Start,
    endDay: jar1End,
    daysCount: extraDays,
    formulaDescription: extraDays > 0 
      ? `(Gastos Variables / ${daysInMonth}) × ${extraDays}`
      : '0 (28 días)',
    amount: effectiveJar1Amount,
    spent: jar1Spent,
    remaining: effectiveJar1Amount - jar1Spent,
    isExtraDaysJar: true,
    adjustment: jar1Adj,
    baseAmount: jar1Amount,
  };

  if (extraDaysPosition === 'start') {
    // Si es para los primeros días del mes: Días Extras va adelante de todo
    jars.push(extraDaysJar);

    // Semanas 1 a 4 después de los días extras
    const offset = extraDays;
    const weekRanges = [
      { num: 2, weekLabel: `${weekPrefix} 1`, start: offset + 1, end: offset + 7 },
      { num: 3, weekLabel: `${weekPrefix} 2`, start: offset + 8, end: offset + 14 },
      { num: 4, weekLabel: `${weekPrefix} 3`, start: offset + 15, end: offset + 21 },
      { num: 5, weekLabel: `${weekPrefix} 4`, start: offset + 22, end: daysInMonth },
    ];

    weekRanges.forEach(w => {
      const spent = helperFilterSpent(w.start, w.end);
      const adj = (jarAdjustments && jarAdjustments[w.num]) || 0;
      const effectiveWeeklyAmount = Math.max(0, weeklyJarAmount + adj);
      jars.push({
        number: w.num,
        title: w.weekLabel,
        subtitle: `Días ${w.start} al ${w.end}`,
        startDay: w.start,
        endDay: w.end,
        daysCount: 7,
        formulaDescription: '(Gastos Variables - Días Extras) / 4',
        amount: effectiveWeeklyAmount,
        spent,
        remaining: effectiveWeeklyAmount - spent,
        isExtraDaysJar: false,
        adjustment: adj,
        baseAmount: weeklyJarAmount,
      });
    });

  } else {
    // Si es para los últimos días del mes: Semanas 1 a 4 primero (días 1 al 28)
    const weekRanges = [
      { num: 2, weekLabel: `${weekPrefix} 1`, start: 1, end: 7 },
      { num: 3, weekLabel: `${weekPrefix} 2`, start: 8, end: 14 },
      { num: 4, weekLabel: `${weekPrefix} 3`, start: 15, end: 21 },
      { num: 5, weekLabel: `${weekPrefix} 4`, start: 22, end: 28 },
    ];

    weekRanges.forEach(w => {
      const spent = helperFilterSpent(w.start, w.end);
      const adj = (jarAdjustments && jarAdjustments[w.num]) || 0;
      const effectiveWeeklyAmount = Math.max(0, weeklyJarAmount + adj);
      jars.push({
        number: w.num,
        title: w.weekLabel,
        subtitle: `Días ${w.start} al ${w.end}`,
        startDay: w.start,
        endDay: w.end,
        daysCount: 7,
        formulaDescription: '(Gastos Variables - Días Extras) / 4',
        amount: effectiveWeeklyAmount,
        spent,
        remaining: effectiveWeeklyAmount - spent,
        isExtraDaysJar: false,
        adjustment: adj,
        baseAmount: weeklyJarAmount,
      });
    });

    // Detrás de todo: Días Extras va al final
    jars.push(extraDaysJar);
  }

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
