import React from 'react';

interface JarIconProps {
  className?: string;
}

export const JarIcon: React.FC<JarIconProps> = ({ className = 'w-5 h-5' }) => {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      {/* Tapa del frasco */}
      <rect x="7" y="2.5" width="10" height="3" rx="1" />
      {/* Cuello y cuerpo del frasco de vidrio */}
      <path d="M8 5.5v1.2a2 2 0 0 1-.5 1.3L6.3 9.4A3 3 0 0 0 5 11.6V18a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6.4a3 3 0 0 0-1.3-2.2l-1.2-1.4A2 2 0 0 1 16 6.7V5.5" />
      {/* Líneas de etiqueta / volumen del frasco */}
      <line x1="9" y1="13" x2="15" y2="13" strokeDasharray="1 1" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
};
