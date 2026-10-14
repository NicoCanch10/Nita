export * from './translations';
import { 
  Translations, 
  AVAILABLE_LANGUAGES, 
  TRANSLATION_MAP, 
  getTranslations, 
  loadSelectedLanguage, 
  saveSelectedLanguage,
  ES_TRANSLATIONS,
  CA_TRANSLATIONS,
  EN_TRANSLATIONS,
  PT_TRANSLATIONS,
  FR_TRANSLATIONS,
  IT_TRANSLATIONS,
  DE_TRANSLATIONS,
} from './translations';

export interface ExpenseValidationMessages {
  both: string;
  description: string;
  amount: string;
}

export const VALIDATION_MESSAGES: Record<string, ExpenseValidationMessages> = {
  es: {
    both: 'Por favor, completa la descripción y el monto del gasto.',
    description: 'Por favor, completa la descripción del gasto.',
    amount: 'Por favor, ingresa un monto válido mayor a 0.',
  },
  ca: {
    both: 'Si us plau, omple la descripció i l\'import de la despesa.',
    description: 'Si us plau, omple la descripció de la despesa.',
    amount: 'Si us plau, introdueix un import vàlid superior a 0.',
  },
  en: {
    both: 'Please enter both the description and amount of the expense.',
    description: 'Please enter the description of the expense.',
    amount: 'Please enter a valid amount greater than 0.',
  },
  pt: {
    both: 'Por favor, preencha a descrição e o valor da despesa.',
    description: 'Por favor, preencha a descrição da despesa.',
    amount: 'Por favor, insira um valor válido maior que 0.',
  },
  fr: {
    both: 'Veuillez renseigner la description et le montant de la dépense.',
    description: 'Veuillez renseigner la description de la dépense.',
    amount: 'Veuillez saisir un montant valide supérieur à 0.',
  },
  it: {
    both: 'Per favore, inserisci la descrizione e l\'importo della spesa.',
    description: 'Per favore, inserisci la descrizione della spesa.',
    amount: 'Per favore, inserisci un importo valido maggiore di 0.',
  },
  de: {
    both: 'Bitte geben Sie Beschreibung und Betrag der Ausgabe ein.',
    description: 'Bitte geben Sie die Beschreibung der Ausgabe ein.',
    amount: 'Bitte geben Sie einen gültigen Betrag größer als 0 ein.',
  },
};

export function formatDateByLanguage(dateString: string, language: string = 'es'): string {
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return dateString;
    const date = new Date(year, month - 1, day);
    const localeMap: Record<string, string> = {
      es: 'es-ES',
      ca: 'ca-ES',
      en: 'en-US',
      pt: 'pt-BR',
      fr: 'fr-FR',
      it: 'it-IT',
      de: 'de-DE',
    };
    const locale = localeMap[language] || 'es-ES';
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

