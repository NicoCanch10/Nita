import { 
  BudgetState, 
  MonthData, 
  FixedExpense, 
  VariableExpense, 
  CurrencyCode, 
  CategoryInfo, 
  getMonthKey 
} from '../types/budget';
import { DEFAULT_CATEGORIES } from './currency';

const STORAGE_KEY = 'nita_distribuidor_app_data_v4';

/**
 * Creates empty month data starting completely from 0 for new users
 */
export function createFreshMonthData(): MonthData {
  return {
    income: 0,
    savingsRate: 0,
    extraDaysPosition: 'end',
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    fixedExpenses: [],
    variableExpenses: [],
  };
}

export function getInitialBudgetState(): BudgetState {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const currentKey = getMonthKey(currentYear, currentMonth);

  return {
    month: currentMonth,
    year: currentYear,
    currency: 'ARS',
    monthsData: {
      [currentKey]: createFreshMonthData(),
    },
  };
}

export function loadBudgetState(): BudgetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.monthsData && typeof parsed.monthsData === 'object') {
        const currentKey = getMonthKey(parsed.year ?? new Date().getFullYear(), parsed.month ?? new Date().getMonth());
        if (!parsed.monthsData[currentKey]) {
          parsed.monthsData[currentKey] = createFreshMonthData();
        }
        return parsed as BudgetState;
      }
    }

    // Default first entrance: clean 0 state
    const freshState = getInitialBudgetState();
    saveBudgetState(freshState);
    return freshState;
  } catch (error) {
    console.error('Error loading budget state from localStorage', error);
    return getInitialBudgetState();
  }
}

export function saveBudgetState(state: BudgetState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving budget state to localStorage', error);
  }
}

/**
 * Export month data to CSV format
 */
export function exportToCSV(
  year: number,
  month: number,
  currency: CurrencyCode,
  monthData: MonthData
): void {
  const lines: string[] = [];

  // Header & Month summary
  lines.push(`"NITA - DISTRIBUÍ TU DINERO - Reporte de Presupuesto"`);
  lines.push(`"Mes / Año","${month + 1}/${year}"`);
  lines.push(`"Moneda","${currency}"`);
  lines.push(`"Ingreso Neto Mensual","${monthData.income}"`);
  lines.push(``);

  // Gastos Fijos
  lines.push(`"GASTOS FIJOS Y OBLIGACIONES"`);
  lines.push(`"Concepto","Monto","Categoría","Día Vencimiento","Estado"`);
  monthData.fixedExpenses.forEach(exp => {
    lines.push(`"${exp.name}","${exp.amount}","${exp.category}","${exp.dueDate ?? ''}","${exp.isPaid ? 'PAGADO' : 'PENDIENTE'}"`);
  });
  lines.push(``);

  // Gastos Variables
  lines.push(`"CONTROL DE GASTOS DIARIOS Y VARIABLES"`);
  lines.push(`"Fecha","Descripción","Monto","Categoría"`);
  monthData.variableExpenses.forEach(exp => {
    lines.push(`"${exp.date}","${exp.description}","${exp.amount}","${exp.category}"`);
  });

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `NITA_Presupuesto_${year}_${month + 1}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
