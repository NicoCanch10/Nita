import { CurrencyCode, CurrencyConfig, ExpenseCategory, CategoryInfo } from '../types/budget';

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  ARS: { code: 'ARS', label: 'ARS ($ Argentino)', symbol: '$', locale: 'es-AR', decimals: 2 },
  USD: { code: 'USD', label: 'USD ($ Dólar)', symbol: '$', locale: 'en-US', decimals: 2 },
  EUR: { code: 'EUR', label: 'EUR (€ Euro)', symbol: '€', locale: 'es-ES', decimals: 2 },
  MXN: { code: 'MXN', label: 'MXN ($ Mexicano)', symbol: '$', locale: 'es-MX', decimals: 2 },
  COP: { code: 'COP', label: 'COP ($ Colombiano)', symbol: '$', locale: 'es-CO', decimals: 2 },
  CLP: { code: 'CLP', label: 'CLP ($ Chileno)', symbol: '$', locale: 'es-CL', decimals: 2 },
  PEN: { code: 'PEN', label: 'PEN (S/ Peruano)', symbol: 'S/', locale: 'es-PE', decimals: 2 },
};

export const DEFAULT_CATEGORIES: CategoryInfo[] = [
  { id: 'housing', label: 'Vivienda y Alquiler', color: '#4f46e5' },
  { id: 'services', label: 'Servicios (Luz, Gas, Agua)', color: '#0284c7' },
  { id: 'debt', label: 'Tarjetas y Deudas', color: '#e11d48' },
  { id: 'food', label: 'Alimentación y Supermercado', color: '#16a34a' },
  { id: 'transport', label: 'Transporte y Combustible', color: '#d97706' },
  { id: 'health', label: 'Salud y Farmacia', color: '#0d9488' },
  { id: 'subscriptions', label: 'Suscripciones y Conectividad', color: '#7c3aed' },
  { id: 'leisure', label: 'Ocio, Salidas y Gustos', color: '#db2777' },
  { id: 'education', label: 'Educación y Cursos', color: '#2563eb' },
  { id: 'savings', label: 'Ahorro e Inversión', color: '#059669' },
  { id: 'other', label: 'Otros Gastos', color: '#64748b' },
];

export const CATEGORIES: Record<string, CategoryInfo> = DEFAULT_CATEGORIES.reduce((acc, cat) => {
  acc[cat.id] = cat;
  return acc;
}, {} as Record<string, CategoryInfo>);

export function getCategoryInfo(id: string, customCategories?: CategoryInfo[]): CategoryInfo {
  if (customCategories) {
    const found = customCategories.find(c => c.id === id);
    if (found) return found;
  }
  if (CATEGORIES[id]) return CATEGORIES[id];
  return {
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    color: '#64748b',
    isCustom: true,
  };
}

export function formatCurrency(amount: number, currencyCode: CurrencyCode = 'ARS'): string {
  const config = CURRENCIES[currencyCode] || CURRENCIES.ARS;
  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(amount);
  } catch {
    return `${config.symbol} ${amount.toFixed(2)}`;
  }
}

export function formatCompactCurrency(amount: number, currencyCode: CurrencyCode = 'ARS'): string {
  const config = CURRENCIES[currencyCode] || CURRENCIES.ARS;
  try {
    return new Intl.NumberFormat(config.locale, {
      notation: 'compact',
      compactDisplay: 'short',
      style: 'currency',
      currency: config.code,
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${config.symbol} ${amount}`;
  }
}
