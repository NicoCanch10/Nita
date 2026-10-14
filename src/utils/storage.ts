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
const CATEGORIES_STORAGE_KEY = 'nita_global_categories_v2';

export function loadGlobalCategories(): CategoryInfo[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Error loading global categories from localStorage', error);
  }
  return DEFAULT_CATEGORIES.map(c => ({ ...c }));
}

export function saveGlobalCategories(categories: CategoryInfo[]): void {
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  } catch (error) {
    console.error('Error saving global categories to localStorage', error);
  }
}

/**
 * Creates empty month data starting completely from 0 for new users
 */
export function createFreshMonthData(baseCategories?: CategoryInfo[]): MonthData {
  const cats = baseCategories && baseCategories.length > 0
    ? baseCategories.map(c => ({ ...c }))
    : loadGlobalCategories().map(c => ({ ...c }));

  return {
    income: 0,
    savingsRate: 0,
    extraDaysPosition: 'end',
    categories: cats,
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
    const globalCats = loadGlobalCategories();
    const raw = localStorage.getItem(STORAGE_KEY);
    const now = new Date();
    const currentOngoingMonth = now.getMonth();
    const currentOngoingYear = now.getFullYear();
    const currentOngoingKey = getMonthKey(currentOngoingYear, currentOngoingMonth);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.monthsData && typeof parsed.monthsData === 'object') {
        // Ensure all loaded months have categories updated to match global labels & colors
        Object.keys(parsed.monthsData).forEach(mKey => {
          const mData = parsed.monthsData[mKey];
          if (mData && Array.isArray(mData.categories)) {
            const updatedCategories: CategoryInfo[] = [...mData.categories];

            globalCats.forEach(gCat => {
              const existingIdx = updatedCategories.findIndex(c => c.id === gCat.id);
              if (existingIdx >= 0) {
                updatedCategories[existingIdx] = {
                  ...updatedCategories[existingIdx],
                  label: gCat.label,
                  color: gCat.color,
                };
              } else {
                updatedCategories.push({ ...gCat });
              }
            });

            mData.categories = updatedCategories;
          }
        });

        if (!parsed.monthsData[currentOngoingKey]) {
          parsed.monthsData[currentOngoingKey] = createFreshMonthData(globalCats);
        }

        // Always start on the ongoing current month and year upon entrance/refresh
        return {
          month: currentOngoingMonth,
          year: currentOngoingYear,
          currency: parsed.currency ?? 'ARS',
          monthsData: parsed.monthsData,
        };
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
  lines.push(`"NITA - TUS FINANZAS, MAS SIMPLES - Reporte de Presupuesto"`);
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
