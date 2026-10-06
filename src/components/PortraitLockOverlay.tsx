import React, { useEffect, useState } from 'react';
import { Smartphone, RotateCw } from 'lucide-react';

export const PortraitLockOverlay: React.FC = () => {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);

  useEffect(() => {
    // Try native Screen Orientation API lock if supported
    const lockOrientation = async () => {
      try {
        if (
          typeof window !== 'undefined' &&
          'screen' in window &&
          'orientation' in window.screen &&
          // @ts-ignore
          typeof window.screen.orientation.lock === 'function'
        ) {
          // @ts-ignore
          await window.screen.orientation.lock('portrait');
        }
      } catch {
        // Ignored as orientation lock may require fullscreen or standalone mode
      }
    };

    lockOrientation();

    // Listener for viewport / orientation changes on mobile devices
    const checkOrientation = () => {
      if (typeof window === 'undefined') return;
      
      // Detect mobile screens in landscape orientation (small height < 550px and width > height)
      const isLandscape = window.innerWidth > window.innerHeight && window.innerHeight <= 550;
      setIsLandscapeMobile(isLandscape);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isLandscapeMobile) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 text-white flex flex-col items-center justify-center p-6 text-center backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center">
          <Smartphone className="w-8 h-8 text-blue-400" />
        </div>
        <div className="absolute -bottom-2 -right-2 p-1.5 bg-blue-500 text-white rounded-full animate-spin">
          <RotateCw className="w-3.5 h-3.5" />
        </div>
      </div>

      <h3 className="text-lg font-black tracking-tight mb-2">
        Gira tu dispositivo a posición vertical
      </h3>

      <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
        NITA funciona exclusivamente con la pantalla en posición vertical para ofrecerte el mejor control de tus frascos y presupuesto.
      </p>

      <div className="mt-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 text-slate-300 text-2xs font-semibold">
        <span>Orientación vertical bloqueada</span>
      </div>
    </div>
  );
};
