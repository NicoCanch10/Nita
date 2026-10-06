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
  extraDaysPosition: ExtraDaysPosition = 'end'
): FiveJarsCalculation {
  const daysInMonth = getDaysInMonth(year, month);
  const extraDays = Math.max(0, daysInMonth - 28);
  const dailyValue = daysInMonth > 0 ? baseAmount / daysInMonth : 0;
  const jar1Amount = dailyValue * extraDays;
  const restAmount = baseAmount - jar1Amount;
  const weeklyJarAmount = restAmount / 4;

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

  if (extraDaysPosition === 'start') {
    // Frasco 1 at beginning of month: days 1 to extraDays (e.g. 1 al 3)
    const jar1Start = extraDays > 0 ? 1 : 0;
    const jar1End = extraDays > 0 ? extraDays : 0;
    const jar1Spent = helperFilterSpent(jar1Start, jar1End);

    jars.push({
      number: 1,
      title: 'Frasco Nº 1: Extras',
      subtitle: extraDays > 0 
        ? `Días 1 al ${jar1End} (${extraDays} ${extraDays === 1 ? 'día' : 'días'})`
        : 'Sin días extras (mes exacto de 28 días)',
      startDay: jar1Start,
      endDay: jar1End,
      daysCount: extraDays,
      formulaDescription: extraDays > 0 
        ? `(Remanente / ${daysInMonth}) × ${extraDays}`
        : '0 (28 días)',
      amount: jar1Amount,
      spent: jar1Spent,
      remaining: jar1Amount - jar1Spent,
      isExtraDaysJar: true,
    });

    // Frascos 2, 3, 4, 5 (Weeks after extra days)
    const offset = extraDays;
    const weekRanges = [
      { num: 2, weekLabel: 'Semana 1', start: offset + 1, end: offset + 7 },
      { num: 3, weekLabel: 'Semana 2', start: offset + 8, end: offset + 14 },
      { num: 4, weekLabel: 'Semana 3', start: offset + 15, end: offset + 21 },
      { num: 5, weekLabel: 'Semana 4', start: offset + 22, end: daysInMonth },
    ];

    weekRanges.forEach(w => {
      const spent = helperFilterSpent(w.start, w.end);
      jars.push({
        number: w.num,
        title: `Frasco Nº ${w.num}: ${w.weekLabel}`,
        subtitle: `Días ${w.start} al ${w.end} (7 días)`,
        startDay: w.start,
        endDay: w.end,
        daysCount: 7,
        formulaDescription: '(Remanente - Frasco 1) / 4',
        amount: weeklyJarAmount,
        spent,
        remaining: weeklyJarAmount - spent,
        isExtraDaysJar: false,
      });
    });

  } else {
    // Default: Frasco 1 at end of month: days 29 al fin de mes
    const jar1Start = extraDays > 0 ? 29 : 0;
    const jar1End = extraDays > 0 ? daysInMonth : 0;
    const jar1Spent = helperFilterSpent(jar1Start, jar1End);

    jars.push({
      number: 1,
      title: 'Frasco Nº 1: Extras',
      subtitle: extraDays > 0 
        ? `Días ${jar1Start} al ${jar1End} (${extraDays} ${extraDays === 1 ? 'día' : 'días'})`
        : 'Sin días extras (mes exacto de 28 días)',
      startDay: jar1Start,
      endDay: jar1End,
      daysCount: extraDays,
      formulaDescription: extraDays > 0 
        ? `(Remanente / ${daysInMonth}) × ${extraDays}`
        : '0 (28 días)',
      amount: jar1Amount,
      spent: jar1Spent,
      remaining: jar1Amount - jar1Spent,
      isExtraDaysJar: true,
    });

    // Frascos 2, 3, 4, 5 (Weeks from day 1 to 28)
    const weekRanges = [
      { num: 2, weekLabel: 'Semana 1', start: 1, end: 7 },
      { num: 3, weekLabel: 'Semana 2', start: 8, end: 14 },
      { num: 4, weekLabel: 'Semana 3', start: 15, end: 21 },
      { num: 5, weekLabel: 'Semana 4', start: 22, end: 28 },
    ];

    weekRanges.forEach(w => {
      const spent = helperFilterSpent(w.start, w.end);
      jars.push({
        number: w.num,
        title: `Frasco Nº ${w.num}: ${w.weekLabel}`,
        subtitle: `Días ${w.start} al ${w.end} (7 días)`,
        startDay: w.start,
        endDay: w.end,
        daysCount: 7,
        formulaDescription: '(Remanente - Frasco 1) / 4',
        amount: weeklyJarAmount,
        spent,
        remaining: weeklyJarAmount - spent,
        isExtraDaysJar: false,
      });
    });
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
