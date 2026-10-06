import React, { useState } from 'react';
import { FiveJarsCalculation, CurrencyCode, ExtraDaysPosition } from '../types/budget';
import { formatCurrency } from '../utils/currency';
import { 
  Package, 
  ShieldCheck, 
  Layers,
  CalendarRange,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface FiveJarsSectionProps {
  remainingJars: FiveJarsCalculation;
  currency: CurrencyCode;
  currentDay: number | null;
  monthlyRemaining: number;
  extraDaysPosition: ExtraDaysPosition;
  onExtraDaysPositionChange: (pos: ExtraDaysPosition) => void;
}

export const FiveJarsSection: React.FC<FiveJarsSectionProps> = ({
  remainingJars,
  currency,
  currentDay,
  monthlyRemaining,
  extraDaysPosition,
  onExtraDaysPositionChange,
}) => {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const { daysInMonth, extraDays, jar1Amount, weeklyJarAmount, jars } = remainingJars;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xs space-y-5 transition-colors">
      
      {/* Header with Title and Extra Days Position Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              Distribución en 5 Frascos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Frasco Nº 1 ({extraDays} días extras) + Frascos Nº 2, 3, 4 y 5 (las 4 semanas de 7 días)
            </p>
          </div>
        </div>

        {/* Controls: Extra Days Position Switcher & Remaining Badge */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          {extraDays > 0 && (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs w-full sm:w-auto">
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-2 pr-1 flex items-center gap-1 shrink-0">
                <CalendarRange className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Frasco 1:
              </span>
              <button
                type="button"
                onClick={() => onExtraDaysPositionChange('start')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  extraDaysPosition === 'start'
                    ? 'bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-200 shadow-2xs font-extrabold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={`Aplicar Frasco 1 a los primeros días (días 1 al ${extraDays})`}
              >
                Primeros días (1 al {extraDays})
              </button>
              <button
                type="button"
                onClick={() => onExtraDaysPositionChange('end')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  extraDaysPosition === 'end'
                    ? 'bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-200 shadow-2xs font-extrabold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={`Aplicar Frasco 1 a los últimos días (días 29 al ${daysInMonth})`}
              >
                Últimos días (29 al {daysInMonth})
              </button>
            </div>
          )}

          <div className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 px-3.5 py-1.5 rounded-xl text-xs font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
            <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Remanente: {formatCurrency(monthlyRemaining, currency)}</span>
          </div>
        </div>
      </div>

      {/* Mobile Toggle Button for collapsible jars */}
      <button
        type="button"
        onClick={() => setIsMobileExpanded(!isMobileExpanded)}
        className="sm:hidden w-full flex items-center justify-between gap-2 p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 rounded-2xl text-xs font-black transition-colors cursor-pointer"
        aria-expanded={isMobileExpanded}
      >
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>{isMobileExpanded ? 'Contraer vista de frascos' : 'Desplegar los 5 frascos'}</span>
        </div>
        <div className="p-1 rounded-lg bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 shadow-2xs">
          {isMobileExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* The 5 Frascos Grid: Always shown on desktop (sm:grid), collapsible on mobile */}
      <div className={`${isMobileExpanded ? 'grid' : 'hidden sm:grid'} grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 animate-in fade-in duration-200`}>
        {jars.map((jar) => {
          const isCurrent =
            currentDay !== null &&
            jar.startDay > 0 &&
            currentDay >= jar.startDay &&
            currentDay <= jar.endDay;

          const pctUsed = jar.amount > 0 ? Math.min(100, Math.round((jar.spent / jar.amount) * 100)) : 0;
          const isOverBudget = jar.remaining < 0;

          return (
            <div
              key={jar.number}
              className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all min-h-[295px] sm:min-h-[310px] ${
                jar.isExtraDaysJar
                  ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 ring-1 ring-amber-400/30'
                  : isCurrent
                  ? 'bg-blue-50/20 dark:bg-amber-950/20 border-blue-500 dark:border-amber-900/50 ring-2 ring-blue-500/20 dark:ring-amber-500/20 shadow-xs'
                  : 'bg-white dark:bg-amber-950/20 border-slate-200 dark:border-amber-900/50'
              }`}
            >
              <div>
                {/* Header: Title and Badge with exact fixed height */}
                <div className="flex items-center justify-between mb-1.5 gap-2 h-7">
                  <span className={`text-xs font-black truncate min-w-0 flex-1 ${
                    jar.isExtraDaysJar ? 'text-amber-900 dark:text-amber-200' : 'text-slate-900 dark:text-white'
                  }`}>
                    {jar.title}
                  </span>
                  {jar.isExtraDaysJar ? (
                    <span className="text-2xs font-extrabold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-md shrink-0">
                      Días Extras
                    </span>
                  ) : isCurrent ? (
                    <span className="text-2xs font-extrabold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/80 px-2 py-0.5 rounded-md shrink-0">
                      En Curso
                    </span>
                  ) : (
                    <span className="text-2xs font-semibold text-slate-400 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md shrink-0">
                      7 días
                    </span>
                  )}
                </div>

                {/* Subtitle / Day Range with exact fixed height */}
                <div className="text-2xs text-slate-500 dark:text-slate-400 mb-3.5 h-4 flex items-center">
                  <span className="font-medium truncate">{jar.subtitle}</span>
                </div>

                {/* 1. DISPONIBLE / DINERO EN EL FRASCO with exact fixed height */}
                <div className="space-y-1">
                  <span className="text-2xs text-slate-400 dark:text-slate-500 uppercase tracking-wider block font-semibold h-4 leading-4">
                    {isOverBudget ? 'Saldo Excedido' : 'Disponible'}
                  </span>
                  <p className="text-xl sm:text-2xl font-black tracking-tight tabular-nums h-8 flex items-center leading-none">
                    <span className={isOverBudget ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>
                      {formatCurrency(Math.abs(jar.remaining), currency)}
                    </span>
                  </p>
                </div>

                {/* Spending Progress Bar with exact fixed height and room for 6-digit values */}
                <div className="mt-4 sm:mt-5 space-y-2">
                  <div className="flex items-baseline justify-between text-2xs min-h-8 sm:min-h-9 leading-tight gap-1">
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">Gastado:</span>
                    <span className={`font-bold tabular-nums text-right break-words ${isOverBudget ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      <span>{formatCurrency(jar.spent, currency)}</span>{' '}
                      <span className="text-2xs font-semibold opacity-90 inline-block whitespace-nowrap">({pctUsed}%)</span>
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverBudget
                          ? 'bg-rose-500'
                          : pctUsed > 80
                          ? 'bg-amber-500'
                          : jar.isExtraDaysJar
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, pctUsed)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 2. MONTO ASIGNADO with exact fixed height */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-amber-900/30 flex items-center justify-between text-xs h-8">
                <span className="text-slate-500 dark:text-slate-400 text-2xs font-medium">
                  Monto Asignado:
                </span>
                <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {formatCurrency(jar.amount, currency)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Verification Note */}
      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            <strong>Comprobación exacta:</strong> Frasco 1 ({formatCurrency(jar1Amount, currency)}) + 4 Frascos de {formatCurrency(weeklyJarAmount, currency)} = <strong>{formatCurrency(monthlyRemaining, currency)}</strong> (100% del Remanente Libre con centavos).
          </span>
        </div>
        <div className="text-2xs text-slate-400 dark:text-slate-500">
          Ubicación de días extras: <strong className="text-slate-700 dark:text-slate-300">{extraDaysPosition === 'start' ? `Días 1 al ${extraDays} (inicio)` : `Días 29 al ${daysInMonth} (final)`}</strong>
        </div>
      </div>

    </div>
  );
};
