import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Monitor, X, Share2, Sparkles } from 'lucide-react';

interface PWAInstallButtonProps {
  language?: string;
}

interface PWAGuideText {
  installApp: string;
  installIphone: string;
  downloadAsApp: string;
  title: string;
  subtitle: string;
  androidTitle: string;
  androidStep1: string;
  androidStep2: string;
  androidStep3: string;
  iosTitle: string;
  iosStep1: string;
  iosStep2: string;
  iosStep3: string;
  iosStep4: string;
  pcTitle: string;
  pcStep1: string;
  pcStep2: string;
  pcStep3: string;
  offlineNote: string;
  closeBtn: string;
}

const PWA_TEXTS: Record<string, PWAGuideText> = {
  es: {
    installApp: 'Instalar App',
    installIphone: 'Instalar en iPhone',
    downloadAsApp: 'Descargar como App',
    title: 'Descargar e Instalar como App',
    subtitle: 'Úsala como una aplicación nativa sin barras de navegador',
    androidTitle: 'En Android (Google Chrome):',
    androidStep1: 'Toca los tres puntos (⋮) en la esquina superior derecha de Chrome.',
    androidStep2: 'Selecciona "Instalar aplicación" o "Agregar a la pantalla principal".',
    androidStep3: '¡Listo! Aparecerá con su ícono en tu pantalla de inicio como cualquier app.',
    iosTitle: 'En iPhone / iPad (Safari):',
    iosStep1: 'Abre esta web en Safari.',
    iosStep2: 'Toca el botón Compartir (ícono de cuadrado con flecha hacia arriba ⬆ en la barra inferior).',
    iosStep3: 'Desplázate hacia abajo y presiona "Agregar a pantalla de inicio".',
    iosStep4: 'Toca Agregar en la esquina superior derecha.',
    pcTitle: 'En PC o Notebook (Chrome / Edge):',
    pcStep1: 'En la barra de direcciones superior, haz clic en el ícono de Instalar (ícono de monitor o "+").',
    pcStep2: 'O haz clic en el menú (tres puntos) y elige "Instalar NITA".',
    pcStep3: 'Se abrirá en su propia ventana independiente con acceso directo en tu escritorio.',
    offlineNote: 'La app funciona 100% offline y almacena tus datos de forma privada en tu dispositivo.',
    closeBtn: 'Entendido',
  },
  en: {
    installApp: 'Install App',
    installIphone: 'Install on iPhone',
    downloadAsApp: 'Download as App',
    title: 'Download & Install as App',
    subtitle: 'Use it like a native app without browser bars',
    androidTitle: 'On Android (Google Chrome):',
    androidStep1: 'Tap the three dots (⋮) in the top right corner of Chrome.',
    androidStep2: 'Select "Install app" or "Add to Home screen".',
    androidStep3: 'Done! It will appear on your home screen like any native app.',
    iosTitle: 'On iPhone / iPad (Safari):',
    iosStep1: 'Open this website in Safari.',
    iosStep2: 'Tap the Share button (square icon with an upward arrow ⬆ in the bottom bar).',
    iosStep3: 'Scroll down and tap "Add to Home Screen".',
    iosStep4: 'Tap "Add" in the top right corner.',
    pcTitle: 'On PC or Laptop (Chrome / Edge):',
    pcStep1: 'In the address bar at the top, click the Install icon (computer screen icon or "+").',
    pcStep2: 'Or click the three dots menu and choose "Install NITA".',
    pcStep3: 'It will open in its own standalone window with a desktop shortcut.',
    offlineNote: 'The app works 100% offline and keeps your data private on your device.',
    closeBtn: 'Understood',
  },
  ca: {
    installApp: 'Instal·lar App',
    installIphone: 'Instal·lar a iPhone',
    downloadAsApp: 'Descarregar com a App',
    title: 'Descarregar i Instal·lar com a App',
    subtitle: 'Utilitza-la com una aplicació nativa sense barres de navegador',
    androidTitle: 'A Android (Google Chrome):',
    androidStep1: 'Toca els tres punts (⋮) a la cantonada superior dreta de Chrome.',
    androidStep2: 'Selecciona "Instal·lar aplicació" o "Afegeix a la pantalla d\'inici".',
    androidStep3: 'Fet! Apareixerà amb la seva icona a la pantalla d\'inici com qualsevol app.',
    iosTitle: 'A iPhone / iPad (Safari):',
    iosStep1: 'Obre aquest web a Safari.',
    iosStep2: 'Toca el botó Compartir (la icona de quadrat amb fletxa cap amunt ⬆ a la barra inferior).',
    iosStep3: 'Desplaça\'t cap avall i prem "Afegeix a la pantalla d\'inici".',
    iosStep4: 'Toca "Afegeix" a la cantonada superior dreta.',
    pcTitle: 'A PC o Portàtil (Chrome / Edge):',
    pcStep1: 'A la barra d\'adreces superior, fes clic a la icona d\'Instal·lar (icona de monitor o "+").',
    pcStep2: 'O fes clic al menú (tres punts) i tria "Instal·lar NITA".',
    pcStep3: 'S\'obrirà a la seva pròpia finestra independent amb accés directe a l\'escriptori.',
    offlineNote: 'L\'app funciona 100% fora de línia i desa les teves dades de forma privada al dispositiu.',
    closeBtn: 'Entès',
  },
  pt: {
    installApp: 'Instalar App',
    installIphone: 'Instalar no iPhone',
    downloadAsApp: 'Baixar como App',
    title: 'Baixar e Instalar como App',
    subtitle: 'Use como um app nativo sem barras de navegador',
    androidTitle: 'No Android (Google Chrome):',
    androidStep1: 'Toque nos três pontos (⋮) no canto superior direito do Chrome.',
    androidStep2: 'Selecione "Instalar aplicativo" ou "Adicionar à tela inicial".',
    androidStep3: 'Pronto! O app aparecerá na sua tela inicial como qualquer aplicativo.',
    iosTitle: 'No iPhone / iPad (Safari):',
    iosStep1: 'Abra este site no Safari.',
    iosStep2: 'Toque no botão Compartilhar (quadrado com seta para cima ⬆ na barra inferior).',
    iosStep3: 'Role para baixo e selecione "Adicionar à Tela de Início".',
    iosStep4: 'Toque em "Adicionar" no canto superior direito.',
    pcTitle: 'No PC ou Notebook (Chrome / Edge):',
    pcStep1: 'Na barra de endereços superior, clique no ícone de Instalar (tela com seta ou "+").',
    pcStep2: 'Ou clique no menu (três pontos) e escolha "Instalar NITA".',
    pcStep3: 'O aplicativo será aberto em uma janela dedicada com atalho na área de trabalho.',
    offlineNote: 'O app funciona 100% offline e armazena seus dados de forma privada no seu dispositivo.',
    closeBtn: 'Entendido',
  },
  fr: {
    installApp: 'Installer l\'App',
    installIphone: 'Installer sur iPhone',
    downloadAsApp: 'Télécharger comme App',
    title: 'Télécharger et Installer comme App',
    subtitle: 'Utilisez-la comme une application native sans barres de navigation',
    androidTitle: 'Sur Android (Google Chrome) :',
    androidStep1: 'Appuyez sur les trois points (⋮) en haut à droite dans Chrome.',
    androidStep2: 'Sélectionnez "Installer l\'application" ou "Ajouter à l\'écran d\'accueil".',
    androidStep3: 'Terminé ! Elle apparaîtra sur votre écran d\'accueil comme une vraie application.',
    iosTitle: 'Sur iPhone / iPad (Safari) :',
    iosStep1: 'Ouvrez ce site dans Safari.',
    iosStep2: 'Appuyez sur le bouton Partager (icône de carré avec flèche vers le haut ⬆ en bas).',
    iosStep3: 'Faites défiler vers le bas et touchez "Sur l\'écran d\'accueil".',
    iosStep4: 'Appuyez sur "Ajouter" en haut à droite.',
    pcTitle: 'Sur PC ou Ordinateur portable (Chrome / Edge) :',
    pcStep1: 'Dans la barre d\'adresse en haut, cliquez sur l\'icône Installer (icône d\'écran ou "+").',
    pcStep2: 'Ou cliquez sur le menu (trois points) et choisissez "Installer NITA".',
    pcStep3: 'L\'application s\'ouvrira dans sa propre fenêtre avec un raccourci bureau.',
    offlineNote: 'L\'application fonctionne à 100% hors ligne et stocke vos données sur votre appareil.',
    closeBtn: 'Compris',
  },
  it: {
    installApp: 'Installa App',
    installIphone: 'Installa su iPhone',
    downloadAsApp: 'Scarica come App',
    title: 'Scarica e Installa come App',
    subtitle: 'Usala come un\'app nativa senza barre del browser',
    androidTitle: 'Su Android (Google Chrome):',
    androidStep1: 'Tocca i tre puntini (⋮) in alto a destra su Chrome.',
    androidStep2: 'Seleziona "Installa app" o "Aggiungi a schermata Home".',
    androidStep3: 'Fatto! Comparirà con la sua icona sulla schermata Home come ogni app.',
    iosTitle: 'Su iPhone / iPad (Safari):',
    iosStep1: 'Apri questo sito in Safari.',
    iosStep2: 'Tocca il pulsante Condividi (icona quadrata con freccia verso l\'alto ⬆ nella barra in basso).',
    iosStep3: 'Scorri in basso e tocca "Aggiungi a schermata Home".',
    iosStep4: 'Tocca "Aggiungi" nell\'angolo in alto a destra.',
    pcTitle: 'Su PC o Notebook (Chrome / Edge):',
    pcStep1: 'Nella barra degli indirizzi in alto, fai clic sull\'icona Installa (schermo o "+").',
    pcStep2: 'Oppure fai clic sul menu (tre puntini) e scegli "Installa NITA".',
    pcStep3: 'Si aprirà nella propria finestra indipendente con collegamento sul desktop.',
    offlineNote: 'L\'app funziona al 100% offline e conserva i tuoi dati privatamente sul tuo dispositivo.',
    closeBtn: 'Ho capito',
  },
  de: {
    installApp: 'App installieren',
    installIphone: 'Auf iPhone installieren',
    downloadAsApp: 'Als App herunterladen',
    title: 'Als App herunterladen und installieren',
    subtitle: 'Nutzen Sie NITA wie eine native App ohne Browserleisten',
    androidTitle: 'Auf Android (Google Chrome):',
    androidStep1: 'Tippen Sie auf die drei Punkte (⋮) oben rechts in Chrome.',
    androidStep2: 'Wählen Sie "App installieren" oder "Zum Startbildschirm hinzufügen".',
    androidStep3: 'Fertig! Das Symbol erscheint wie eine normale App auf Ihrem Startbildschirm.',
    iosTitle: 'Auf iPhone / iPad (Safari):',
    iosStep1: 'Öffnen Sie diese Website in Safari.',
    iosStep2: 'Tippen Sie auf die Teilen-Schaltfläche (Quadrat mit Pfeil nach oben ⬆ in der unteren Leiste).',
    iosStep3: 'Scrollen Sie nach unten und wählen Sie "Zum Home-Bildschirm".',
    iosStep4: 'Tippen Sie oben rechts auf "Hinzufügen".',
    pcTitle: 'Auf PC oder Laptop (Chrome / Edge):',
    pcStep1: 'Klicken Sie in der Adressleiste oben auf das Installationssymbol (Bildschirm oder "+").',
    pcStep2: 'Oder klicken Sie auf das Drei-Punkte-Menü und wählen Sie "NITA installieren".',
    pcStep3: 'NITA öffnet sich im eigenständigen Fenster mit Desktop-Verknüpfung.',
    offlineNote: 'Die App funktioniert 100 % offline und speichert Ihre Daten privat auf Ihrem Gerät.',
    closeBtn: 'Verstanden',
  },
};

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ language = 'es' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // If already running as an installed PWA on home screen, hide the install button
  if (isInstalled) {
    return null;
  }

  const txt = PWA_TEXTS[language] || PWA_TEXTS.es;

  return (
    <>
      {/* If native install prompt is available (Android Chrome, Edge, PC/Mac Chrome) */}
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs hover:shadow-sm cursor-pointer whitespace-nowrap animate-pulse hover:animate-none"
          title={txt.installApp}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{txt.installApp}</span>
        </button>
      ) : isIOS ? (
        /* iOS Safari prompt */
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs whitespace-nowrap"
          title={txt.installIphone}
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-400" />
          <span>{txt.installIphone}</span>
        </button>
      ) : (
        /* General guide button for any browser or PC */
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer border border-blue-200 shadow-2xs whitespace-nowrap"
          title={txt.downloadAsApp}
        >
          <Download className="w-3.5 h-3.5 text-blue-600" />
          <span>{txt.downloadAsApp}</span>
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
                    {txt.title}
                  </h3>
                  <p className="text-2xs text-slate-500">
                    {txt.subtitle}
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
                  <span>{txt.androidTitle}</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                  <li>{txt.androidStep1}</li>
                  <li>{txt.androidStep2}</li>
                  <li>{txt.androidStep3}</li>
                </ol>
              </div>

              {/* Option 2: iPhone / iPad */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Share2 className="w-4 h-4 text-blue-600" />
                  <span>{txt.iosTitle}</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                  <li>{txt.iosStep1}</li>
                  <li>{txt.iosStep2}</li>
                  <li>{txt.iosStep3}</li>
                  <li>{txt.iosStep4}</li>
                </ol>
              </div>

              {/* Option 3: PC / Mac / Notebook */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Monitor className="w-4 h-4 text-indigo-600" />
                  <span>{txt.pcTitle}</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                  <li>{txt.pcStep1}</li>
                  <li>{txt.pcStep2}</li>
                  <li>{txt.pcStep3}</li>
                </ol>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2 text-2xs text-blue-800">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{txt.offlineNote}</span>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                {txt.closeBtn}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
