import { CurrencyCode, CurrencyConfig, ExpenseCategory, CategoryInfo } from '../types/budget';

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  ARS: { code: 'ARS', label: 'ARS ($ Argentino)', symbol: '$', locale: 'es-AR', decimals: 2 },
  BOB: { code: 'BOB', label: 'BOB (Bs Boliviano)', symbol: 'Bs', locale: 'es-BO', decimals: 2 },
  BRL: { code: 'BRL', label: 'BRL (R$ Real Brasileño)', symbol: 'R$', locale: 'pt-BR', decimals: 2 },
  CLP: { code: 'CLP', label: 'CLP ($ Chileno)', symbol: '$', locale: 'es-CL', decimals: 2 },
  COP: { code: 'COP', label: 'COP ($ Colombiano)', symbol: '$', locale: 'es-CO', decimals: 2 },
  CRC: { code: 'CRC', label: 'CRC (₡ Colón Costarricense)', symbol: '₡', locale: 'es-CR', decimals: 2 },
  CUP: { code: 'CUP', label: 'CUP ($ Peso Cubano)', symbol: '$', locale: 'es-CU', decimals: 2 },
  DOP: { code: 'DOP', label: 'DOP (RD$ Peso Dominicano)', symbol: 'RD$', locale: 'es-DO', decimals: 2 },
  EUR: { code: 'EUR', label: 'EUR (€ Euro)', symbol: '€', locale: 'es-ES', decimals: 2 },
  GTQ: { code: 'GTQ', label: 'GTQ (Q Quetzal Guatemalteco)', symbol: 'Q', locale: 'es-GT', decimals: 2 },
  HNL: { code: 'HNL', label: 'HNL (L Lempira Hondureña)', symbol: 'L', locale: 'es-HN', decimals: 2 },
  HTG: { code: 'HTG', label: 'HTG (G Gourde Haitiano)', symbol: 'G', locale: 'fr-HT', decimals: 2 },
  MXN: { code: 'MXN', label: 'MXN ($ Mexicano)', symbol: '$', locale: 'es-MX', decimals: 2 },
  NIO: { code: 'NIO', label: 'NIO (C$ Córdoba Nicaragüense)', symbol: 'C$', locale: 'es-NI', decimals: 2 },
  PAB: { code: 'PAB', label: 'PAB (B/. Balboa Panameño)', symbol: 'B/.', locale: 'es-PA', decimals: 2 },
  PEN: { code: 'PEN', label: 'PEN (S/ Peruano)', symbol: 'S/', locale: 'es-PE', decimals: 2 },
  PYG: { code: 'PYG', label: 'PYG (₲ Guaraní Paraguayo)', symbol: '₲', locale: 'es-PY', decimals: 0 },
  USD: { code: 'USD', label: 'USD ($ Dólar)', symbol: '$', locale: 'en-US', decimals: 2 },
  UYU: { code: 'UYU', label: 'UYU ($ Peso Uruguayo)', symbol: '$', locale: 'es-UY', decimals: 2 },
  VES: { code: 'VES', label: 'VES (Bs. Bolívar Venezolano)', symbol: 'Bs.', locale: 'es-VE', decimals: 2 },
  BZD: { code: 'BZD', label: 'BZD (BZ$ Dólar Beliceño)', symbol: 'BZ$', locale: 'en-BZ', decimals: 2 },
  GYD: { code: 'GYD', label: 'GYD (G$ Dólar Guyanés)', symbol: 'G$', locale: 'en-GY', decimals: 2 },
  SRD: { code: 'SRD', label: 'SRD ($ Dólar Surinamés)', symbol: '$', locale: 'nl-SR', decimals: 2 },
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

export const DEFAULT_CATEGORY_TRANSLATIONS: Record<string, Record<string, string>> = {
  ca: {
    housing: 'Habitatge i Lloguer',
    services: 'Serveis (Llum, Gas, Aigua)',
    debt: 'Targetes i Deutes',
    food: 'Alimentació i Supermercat',
    transport: 'Transport i Combustible',
    health: 'Salut i Farmàcia',
    subscriptions: 'Subscripcions i Connexió',
    leisure: 'Oci, Sortides i Desitjos',
    education: 'Educació i Cursos',
    savings: 'Estalvi i Inversió',
    other: 'Altres Despeses',
  },
  en: {
    housing: 'Housing & Rent',
    services: 'Utilities (Electricity, Gas, Water)',
    debt: 'Cards & Debts',
    food: 'Food & Supermarket',
    transport: 'Transport & Fuel',
    health: 'Health & Pharmacy',
    subscriptions: 'Subscriptions & Connectivity',
    leisure: 'Leisure, Outings & Wants',
    education: 'Education & Courses',
    savings: 'Savings & Investment',
    other: 'Other Expenses',
  },
  pt: {
    housing: 'Moradia e Aluguel',
    services: 'Serviços (Luz, Gás, Água)',
    debt: 'Cartões e Dívidas',
    food: 'Alimentação e Mercado',
    transport: 'Transporte e Combustível',
    health: 'Saúde e Farmácia',
    subscriptions: 'Assinaturas e Internet',
    leisure: 'Lazer e Passeios',
    education: 'Educação e Cursos',
    savings: 'Poupança e Investimento',
    other: 'Outras Despesas',
  },
  fr: {
    housing: 'Logement & Loyer',
    services: 'Services (Électricité, Gaz, Eau)',
    debt: 'Cartes & Dettes',
    food: 'Alimentation & Supermarché',
    transport: 'Transports & Carburant',
    health: 'Santé & Pharmacie',
    subscriptions: 'Abonnements & Internet',
    leisure: 'Loisirs & Sorties',
    education: 'Éducation & Cours',
    savings: 'Épargne & Investissement',
    other: 'Autres Dépenses',
  },
  it: {
    housing: 'Casa e Affitto',
    services: 'Utenze (Luce, Gas, Acqua)',
    debt: 'Carte e Debiti',
    food: 'Alimentari e Spesa',
    transport: 'Trasporti e Carburante',
    health: 'Salute e Farmacia',
    subscriptions: 'Abbonamenti e Connessione',
    leisure: 'Svago e Uscite',
    education: 'Istruzione e Corsi',
    savings: 'Risparmio e Investimento',
    other: 'Altre Spese',
  },
  de: {
    housing: 'Wohnen & Miete',
    services: 'Nebenkosten (Strom, Gas, Wasser)',
    debt: 'Karten & Schulden',
    food: 'Lebensmittel & Supermarkt',
    transport: 'Transport & Kraftstoff',
    health: 'Gesundheit & Apotheke',
    subscriptions: 'Abonnements & Internet',
    leisure: 'Freizeit & Ausgehen',
    education: 'Bildung & Kurse',
    savings: 'Sparen & Investieren',
    other: 'Sonstige Ausgaben',
  },
};

export function getCategoryInfo(
  id: string, 
  customCategories?: CategoryInfo[], 
  language?: string
): CategoryInfo {
  let base: CategoryInfo;
  if (customCategories) {
    const found = customCategories.find(c => c.id === id);
    if (found) {
      base = found;
    } else if (CATEGORIES[id]) {
      base = CATEGORIES[id];
    } else {
      base = {
        id,
        label: id.charAt(0).toUpperCase() + id.slice(1),
        color: '#64748b',
        isCustom: true,
      };
    }
  } else if (CATEGORIES[id]) {
    base = CATEGORIES[id];
  } else {
    base = {
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      color: '#64748b',
      isCustom: true,
    };
  }

  // If not custom and a translation is available for the given language, translate label
  if (!base.isCustom && language && language !== 'es') {
    const langDict = DEFAULT_CATEGORY_TRANSLATIONS[language] || DEFAULT_CATEGORY_TRANSLATIONS.en;
    if (langDict && langDict[id]) {
      return { ...base, label: langDict[id] };
    }
  }

  return base;
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
