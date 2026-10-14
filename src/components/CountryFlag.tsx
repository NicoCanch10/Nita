import React, { useState } from 'react';

// Maps 2-letter ISO country codes to Twemoji SVG icons
// Ensures flags display identically and perfectly across Windows, Mac, Linux, Android, iOS
export const FLAG_CODE_MAP: Record<string, string> = {
  de: '1f1e9-1f1ea', // 🇩🇪 Germany
  ar: '1f1f8-1f1e6', // 🇸🇦 Saudi Arabia
  ca: '1f1ea-1f1f8', // 🇪🇸 Spain / Catalonia
  cs: '1f1e8-1f1ff', // 🇨🇿 Czech Republic
  zh: '1f1e8-1f1f3', // 🇨🇳 China
  ko: '1f1f0-1f1f7', // 🇰🇷 South Korea
  da: '1f1e9-1f1f0', // 🇩🇰 Denmark
  es: '1f1ea-1f1f8', // 🇪🇸 Spain
  fi: '1f1eb-1f1ee', // 🇫🇮 Finland
  fr: '1f1eb-1f1f7', // 🇫🇷 France
  el: '1f1ec-1f1f7', // 🇬🇷 Greece
  he: '1f1ee-1f1f1', // 🇮🇱 Israel
  hi: '1f1ee-1f1f3', // 🇮🇳 India
  hu: '1f1ed-1f1fa', // 🇭🇺 Hungary
  id: '1f1ee-1f1e9', // 🇮🇩 Indonesia
  en: '1f1ec-1f1e7', // 🇬🇧 United Kingdom
  it: '1f1ee-1f1f9', // 🇮🇹 Italy
  ja: '1f1ef-1f1f5', // 🇯🇵 Japan
  nl: '1f1f3-1f1f1', // 🇳🇱 Netherlands
  no: '1f1f3-1f1f4', // 🇳🇴 Norway
  pl: '1f1f5-1f1f1', // 🇵🇱 Poland
  pt: '1f1f5-1f1f9', // 🇵🇹 Portugal
  ro: '1f1f7-1f1f4', // 🇷🇴 Romania
  ru: '1f1f7-1f1fa', // 🇷🇺 Russia
  sv: '1f1f8-1f1ea', // 🇸🇪 Sweden
  th: '1f1f9-1f1ed', // 🇹🇭 Thailand
  tr: '1f1f9-1f1f7', // 🇹🇷 Turkey
  uk: '1f1fa-1f1e6', // 🇺🇦 Ukraine
  vi: '1f1fb-1f1f3', // 🇻🇳 Vietnam
};

interface CountryFlagProps {
  code: string;
  fallbackEmoji?: string;
  className?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ 
  code, 
  fallbackEmoji, 
  className = 'w-4 h-3 rounded-[2px] object-cover inline-block shrink-0 shadow-2xs' 
}) => {
  const [hasError, setHasError] = useState(false);
  const hex = FLAG_CODE_MAP[code];

  if (!hex || hasError) {
    return (
      <span className="inline-block text-sm leading-none shrink-0" role="img" aria-label={code}>
        {fallbackEmoji || '🌐'}
      </span>
    );
  }

  // Reliable Twemoji SVG CDN from jsDelivr / cdnjs
  const flagUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${hex}.svg`;

  return (
    <img
      src={flagUrl}
      alt={`${code} flag`}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
};
