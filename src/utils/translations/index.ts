import { LanguageOption, Translations } from './types';
import { ES_TRANSLATIONS } from './es';
import { CA_TRANSLATIONS } from './ca';
import { EN_TRANSLATIONS } from './en';
import { PT_TRANSLATIONS } from './pt';
import { FR_TRANSLATIONS } from './fr';
import { IT_TRANSLATIONS } from './it';
import { DE_TRANSLATIONS } from './de';

export * from './types';
export { ES_TRANSLATIONS } from './es';
export { CA_TRANSLATIONS } from './ca';
export { EN_TRANSLATIONS } from './en';
export { PT_TRANSLATIONS } from './pt';
export { FR_TRANSLATIONS } from './fr';
export { IT_TRANSLATIONS } from './it';
export { DE_TRANSLATIONS } from './de';

// Supported languages available in the settings wheel
// Each of these languages has 100% full translations for the entire application
export const AVAILABLE_LANGUAGES: LanguageOption[] = [
  { code: 'de', name: 'Alemán', nativeName: 'Deutsch', flag: '🇩🇪', country: 'Alemania' },
  { code: 'ca', name: 'Catalán', nativeName: 'Català', flag: '🇪🇸', country: 'España (Cataluña)' },
  { code: 'es', name: 'Español', nativeName: 'Español', flag: '🇪🇸', country: 'España' },
  { code: 'fr', name: 'Francés', nativeName: 'Français', flag: '🇫🇷', country: 'Francia' },
  { code: 'en', name: 'Inglés', nativeName: 'English', flag: '🇬🇧', country: 'Reino Unido' },
  { code: 'it', name: 'Italiano', nativeName: 'Italiano', flag: '🇮🇹', country: 'Italia' },
  { code: 'pt', name: 'Portugués', nativeName: 'Português', flag: '🇵🇹', country: 'Portugal' },
];

export const TRANSLATION_MAP: Record<string, Translations> = {
  es: ES_TRANSLATIONS,
  ca: CA_TRANSLATIONS,
  en: EN_TRANSLATIONS,
  pt: PT_TRANSLATIONS,
  fr: FR_TRANSLATIONS,
  it: IT_TRANSLATIONS,
  de: DE_TRANSLATIONS,
};

const LANGUAGE_STORAGE_KEY = 'nita_selected_language';

export function loadSelectedLanguage(): string {
  if (typeof window === 'undefined') return 'es';
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'es';
  return TRANSLATION_MAP[saved] ? saved : 'es';
}

export function saveSelectedLanguage(code: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
}

export function getTranslations(code: string): Translations {
  if (TRANSLATION_MAP[code]) {
    return TRANSLATION_MAP[code];
  }
  return ES_TRANSLATIONS;
}
