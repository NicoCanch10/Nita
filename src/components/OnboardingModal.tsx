import React, { useState } from 'react';
import { 
  X, 
  Wallet, 
  Receipt, 
  Package, 
  ShoppingBag, 
  Settings, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Bell, 
  Calendar,
  Sparkles
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StepInfo {
  id: number;
  tabLabel: string;
  icon: React.ElementType;
  title: string;
  description: string;
  highlights: { title: string; desc: string; icon?: React.ElementType }[];
  tip?: string;
}

const STEPS: StepInfo[] = [
  {
    id: 1,
    tabLabel: '1. Ingreso',
    icon: Wallet,
    title: 'Paso 1: Cargar tu Ingreso Neto Mensual',
    description: 'NITA parte de tu dinero neto real disponible para organizar todo tu mes con centavos exactos.',
    highlights: [
      {
        title: 'Barra fija superior',
        desc: 'En la parte superior de la aplicación verás el apartado "Ingreso Neto Mensual". Permanece fijo en pantalla mientras navegas.',
        icon: Wallet,
      },
      {
        title: 'Editar valor',
        desc: 'Toca el botón "Editar", escribe el importe total de tus ingresos y presiona el botón azul de confirmación (✓) o Enter.',
        icon: Sparkles,
      },
    ],
    tip: 'Inicia en $0 para que ingreses tu monto personalizado. Puedes modificarlo las veces que lo necesites.',
  },
  {
    id: 2,
    tabLabel: '2. Vencimientos',
    icon: Receipt,
    title: 'Paso 2: Gastos Fijos y Vencimientos',
    description: 'Registra tus obligaciones recurrentes (alquiler, servicios, tarjetas, préstamos) y programa alertas automáticas.',
    highlights: [
      {
        title: 'Agregar gasto y día',
        desc: 'Ingresa el concepto, monto y en la casilla "Vence día" coloca el número del día (del 1 al 31) en que debe pagarse.',
        icon: Calendar,
      },
      {
        title: 'Alertas automáticas preventivas',
        desc: 'La campana de alertas te notificará 3 días antes y el mismo día del vencimiento en tu pantalla o celular para evitar recargos.',
        icon: Bell,
      },
      {
        title: 'Control de pago',
        desc: 'Toca el círculo para marcar como "Pagado" cada gasto una vez abonado.',
        icon: Check,
      },
    ],
    tip: 'Los gastos fijos se restan automáticamente de tu ingreso para proteger el dinero de tus compromisos obligatorios.',
  },
  {
    id: 3,
    tabLabel: '3. Los 5 Frascos',
    icon: Package,
    title: 'Paso 3: El Método de los 5 Frascos Semanales',
    description: 'Tu dinero libre restante se divide automáticamente en 5 frascos calculados con el calendario real del mes.',
    highlights: [
      {
        title: 'Frasco Nº 1 (Días Extras)',
        desc: 'Cubre los días excedentes del mes (ej. 3 días en un mes de 31). Puedes elegir si ubicarlos al inicio (días 1 al 3) o al final.',
        icon: Package,
      },
      {
        title: 'Frascos Nº 2, 3, 4 y 5 (Semanas)',
        desc: 'Las 4 semanas exactas de 7 días tienen un presupuesto equitativo asignado para tus consumos.',
        icon: Calendar,
      },
      {
        title: 'Saldo en tiempo real',
        desc: 'Cada frasco destaca su saldo "Disponible", el monto gastado y la barra de progreso.',
        icon: Sparkles,
      },
    ],
    tip: 'El frasco de la semana en curso se resalta automáticamente en color para que sepas exactamente cuánto puedes gastar hoy.',
  },
  {
    id: 4,
    tabLabel: '4. Gastos Diarios',
    icon: ShoppingBag,
    title: 'Paso 4: Control de Gastos Diarios y Variables',
    description: 'Anota tus compras cotidianas para mantener el equilibrio financiero semanal.',
    highlights: [
      {
        title: 'Carga rápida diaria',
        desc: 'Registra compras de supermercado, delivery, combustible o salidas seleccionando la fecha, monto y categoría.',
        icon: ShoppingBag,
      },
      {
        title: 'Impacto automático',
        desc: 'El gasto se imputa al frasco de la semana correspondiente, actualizando tu saldo disponible al instante.',
        icon: Check,
      },
    ],
    tip: 'Si un frasco se excede, el sistema te alertará en color rojo para que ajustes los consumos en los siguientes días.',
  },
  {
    id: 5,
    tabLabel: '5. Ajustes y App',
    icon: Settings,
    title: 'Paso 5: Rueda de Configuraciones y App',
    description: 'Personaliza tu experiencia con Modo Oscuro, monedas y descarga en tu dispositivo.',
    highlights: [
      {
        title: 'Modo Oscuro (Luna) y Blanco (Sol)',
        desc: 'En la rueda de configuraciones ⚙️ puedes cambiar entre vista oscura o clara con un solo toque.',
        icon: Settings,
      },
      {
        title: 'Instalar como App en celular o PC',
        desc: 'Agrégala a tu pantalla de inicio para usarla a pantalla completa como una app nativa, incluso sin conexión.',
        icon: Sparkles,
      },
      {
        title: 'Actualizaciones automáticas',
        desc: 'Si se añaden mejoras o funciones, recibirás la actualización inmediatamente en tu aplicación.',
        icon: Check,
      },
    ],
    tip: '¡Listo! Puedes volver a abrir este instructivo en cualquier momento desde la rueda de configuraciones.',
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  if (!isOpen) return null;

  const currentStep = STEPS[activeStepIndex];
  const isFirst = activeStepIndex === 0;
  const isLast = activeStepIndex === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onClose();
    } else {
      setActiveStepIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      setActiveStepIndex(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] transition-colors">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-850">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white shrink-0 shadow-xs flex items-center justify-center p-0.5">
              <img src="/nita-logo.jpg" alt="NITA" className="w-full h-full object-cover rounded-lg" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Guía de Inicio: Instructivo NITA
              </h3>
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                Pestaña {activeStepIndex + 1} de {STEPS.length}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            aria-label="Cerrar instructivo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Strip */}
        <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepIndex(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{step.tabLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-2xs font-extrabold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Instructivo Paso a Paso</span>
            </div>
            <h4 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight">
              {currentStep.title}
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
              {currentStep.description}
            </p>
          </div>

          {/* Highlights Cards */}
          <div className="space-y-3">
            {currentStep.highlights.map((h, i) => {
              const HIcon = h.icon || Check;
              return (
                <div
                  key={i}
                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-3"
                >
                  <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0 mt-0.5">
                    <HIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                      {h.title}
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 block leading-relaxed">
                      {h.desc}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tip Box */}
          {currentStep.tip && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{currentStep.tip}</span>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirst}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              isFirst
                ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Anterior</span>
          </button>

          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveStepIndex(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === activeStepIndex
                    ? 'w-6 bg-blue-600 dark:bg-blue-500'
                    : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                }`}
                aria-label={`Ir al paso ${idx + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <span>{isLast ? '¡Comenzar a usar NITA!' : 'Siguiente'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
