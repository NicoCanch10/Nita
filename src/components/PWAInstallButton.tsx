import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Monitor, X, Share2, PlusSquare, Sparkles } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // If already running as an installed PWA on home screen, hide the install button
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {/* If native install prompt is available (Android Chrome, Edge, PC/Mac Chrome) */}
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs hover:shadow-sm cursor-pointer whitespace-nowrap animate-pulse hover:animate-none"
          title="Instalar aplicación en tu dispositivo"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Instalar App</span>
        </button>
      ) : isIOS ? (
        /* iOS Safari prompt */
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs whitespace-nowrap"
          title="Instalar en iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-400" />
          <span>Instalar en iPhone</span>
        </button>
      ) : (
        /* General guide button for any browser or PC */
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer border border-blue-200 shadow-2xs whitespace-nowrap"
          title="Ver cómo descargar e instalar como App"
        >
          <Download className="w-3.5 h-3.5 text-blue-600" />
          <span>Descargar como App</span>
        </button>
      )}

      {/* Guide Modal: Step-by-step instructions for Smartphone and PC */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Descargar e Instalar como App
                  </h3>
                  <p className="text-2xs text-slate-500">
                    Úsala como una aplicación nativa sin barras de navegador
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Instructions by device */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700">
              
              {/* Option 1: Android */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>En Android (Google Chrome):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                  <li>Toca los <strong>tres puntos (⋮)</strong> en la esquina superior derecha de Chrome.</li>
                  <li>Selecciona <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</li>
                  <li>¡Listo! Aparecerá con su ícono en tu pantalla de inicio como cualquier app.</li>
                </ol>
              </div>

              {/* Option 2: iPhone / iPad */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Share2 className="w-4 h-4 text-blue-600" />
                  <span>En iPhone / iPad (Safari):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                  <li>Abre esta web en <strong>Safari</strong>.</li>
                  <li>Toca el botón <strong>Compartir</strong> (el ícono de cuadrado con flecha hacia arriba <span className="inline-block px-1 bg-slate-200 rounded font-mono text-2xs">⬆</span> en la barra inferior).</li>
                  <li>Desplázate hacia abajo y presiona <strong>"Agregar a pantalla de inicio"</strong>.</li>
                  <li>Toca <strong>Agregar</strong> en la esquina superior derecha.</li>
                </ol>
              </div>

              {/* Option 3: PC / Mac / Notebook */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Monitor className="w-4 h-4 text-indigo-600" />
                  <span>En PC o Notebook (Chrome / Edge):</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                  <li>En la barra de direcciones superior, haz clic en el ícono de <strong>Instalar</strong> (ícono de monitor con flecha o "+").</li>
                  <li>O haz clic en el menú (tres puntos) y elige <strong>"Instalar NITA - DISTRIBUÍ TU DINERO"</strong>.</li>
                  <li>Se abrirá en su propia ventana independiente con acceso directo en tu escritorio.</li>
                </ol>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2 text-2xs text-blue-800">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>La app funciona 100% offline y almacena tus datos de forma privada en tu dispositivo.</span>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
