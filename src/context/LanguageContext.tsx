import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  AVAILABLE_LANGUAGES, 
  loadSelectedLanguage, 
  saveSelectedLanguage, 
  getTranslations, 
  Translations,
  LanguageOption 
} from '../utils/languages';

interface LanguageContextType {
  language: string;
  setLanguage: (code: string) => void;
  t: Translations;
  languages: LanguageOption[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<string>(() => loadSelectedLanguage());

  const setLanguage = (code: string) => {
    setLanguageState(code);
    saveSelectedLanguage(code);
  };

  const t = getTranslations(language);

  // Keep sorted alphabetically as required
  const sortedLanguages = [...AVAILABLE_LANGUAGES].sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: sortedLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    const lang = loadSelectedLanguage();
    return {
      language: lang,
      setLanguage: saveSelectedLanguage,
      t: getTranslations(lang),
      languages: [...AVAILABLE_LANGUAGES].sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      ),
    };
  }
  return context;
};
