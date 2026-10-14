import React, { useState } from 'react';
import { FiveJarsCalculation, CurrencyCode, ExtraDaysPosition, Frasco } from '../types/budget';
import { formatCurrency } from '../utils/currency';
import { getTranslations } from '../utils/languages';
import { getDaysInMonth } from '../utils/calendar';
import { JarIcon } from './JarIcon';
import { 
  Layers,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Scale,
  RotateCcw,
  CheckCircle2,
  X
} from 'lucide-react';

interface FiveJarsSectionProps {
  remainingJars: FiveJarsCalculation;
  currency: CurrencyCode;
  currentDay: number | null;
  monthlyRemaining: number;
  extraDaysPosition: ExtraDaysPosition;
  onExtraDaysPositionChange: (pos: ExtraDaysPosition) => void;
  language?: string;
  year?: number;
  month?: number;
  onAdjustExceededJar?: (
    exceededJarNumber: number,
    diff: number,
    subsequentJarNumbers: number[],
    isLastJarOfMonth: boolean
  ) => void;
  onResetJarAdjustments?: () => void;
  hasActiveAdjustments?: boolean;
  lastAdjustmentLog?: {
    date: string;
    exceededJarTitle: string;
    diff: number;
    transferredToNextMonth?: boolean;
    nextMonthKey?: string;
  };
}

export const FiveJarsSection: React.FC<FiveJarsSectionProps> = ({
  remainingJars,
  currency,
  currentDay,
  monthlyRemaining,
  extraDaysPosition,
  onExtraDaysPositionChange,
  language = 'es',
  year,
  month,
  onAdjustExceededJar,
  onResetJarAdjustments,
  hasActiveAdjustments,
  lastAdjustmentLog,
}) => {
  const t = getTranslations(language);
  const { daysInMonth, extraDays, jar1Amount, weeklyJarAmount, jars } = remainingJars;

  const now = new Date();
  const currentRealYear = now.getFullYear();
  const currentRealMonth = now.getMonth();

  const isPastMonth =
    year !== undefined && month !== undefined
      ? year < currentRealYear || (year === currentRealYear && month < currentRealMonth)
      : false;

  const isCurrentActiveMonth =
    year !== undefined && month !== undefined
      ? year === currentRealYear && month === currentRealMonth
      : currentDay !== null;

  // Frascos que actualmente superaron el dinero disponible asignado (remaining < -0.005)
  const exceededJars = jars.filter(j => j.remaining < -0.005);
  const [dismissedJars, setDismissedJars] = useState<Record<number, boolean>>({});
  const [adjustmentSuccess, setAdjustmentSuccess] = useState<string | null>(null);

  // Frasco activo para el cartel principal de aviso
  const activeExceededJar = exceededJars.find(j => !dismissedJars[j.number]) || null;
  const activeExceededIndex = activeExceededJar ? jars.findIndex(j => j.number === activeExceededJar.number) : -1;
  const subsequentJars = activeExceededIndex >= 0 
    ? jars.slice(activeExceededIndex + 1).filter(j => j.daysCount > 0)
    : [];
  const isLastJar = activeExceededIndex >= 0 && subsequentJars.length === 0;
  const excessDiff = activeExceededJar ? Math.max(0, activeExceededJar.spent - activeExceededJar.amount) : 0;

  // Datos del siguiente mes por si es el último frasco
  const nextMonthIdx = month !== undefined ? (month === 11 ? 0 : month + 1) : 0;
  const nextYearVal = year !== undefined ? (month === 11 ? year + 1 : year) : currentRealYear;
  const monthNames = t.months || [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const nextMonthName = monthNames[nextMonthIdx];
  const nextDaysCount = getDaysInMonth(nextYearVal, nextMonthIdx);
  const nextExtraDays = Math.max(0, nextDaysCount - 28);
  const nextActiveJarsCount = nextExtraDays > 0 ? 5 : 4;

  const deductionPerJar = activeExceededJar
    ? (!isLastJar && subsequentJars.length > 0
        ? excessDiff / subsequentJars.length
        : excessDiff / nextActiveJarsCount)
    : 0;

  const handleConfirmAdjust = (targetJar: Frasco) => {
    if (!onAdjustExceededJar) return;
    const idx = jars.findIndex(j => j.number === targetJar.number);
    const subJars = jars.slice(idx + 1).filter(j => j.daysCount > 0);
    const last = subJars.length === 0;
    const diff = Math.max(0, targetJar.spent - targetJar.amount);

    onAdjustExceededJar(
      targetJar.number,
      diff,
      subJars.map(j => j.number),
      last
    );

    if (last) {
      setAdjustmentSuccess(
        `Se ajustó ${targetJar.title} a ${formatCurrency(0, currency)} disponible. El exceso de ${formatCurrency(diff, currency)} fue transferido equitativamente a los frascos de ${nextMonthName} ${nextYearVal} (-${formatCurrency(diff / nextActiveJarsCount, currency)} c/u).`
      );
    } else {
      setAdjustmentSuccess(
        `Se ajustó ${targetJar.title} a ${formatCurrency(0, currency)} disponible. El exceso de ${formatCurrency(diff, currency)} fue redistribuido entre los ${subJars.length} frascos restantes de este mes (-${formatCurrency(diff / subJars.length, currency)} c/u).`
      );
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xs space-y-5 transition-colors">
      
      {/* Header with Title and Extra Days Position Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
            <JarIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              {t.fiveJarsTitle}
            </h2>
          </div>
        </div>

        {/* Controls: Extra Days Position Switcher & Remaining Badge */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto justify-between lg:justify-end">
          {extraDays > 0 && (
            <div className="flex flex-nowrap items-center gap-1 sm:gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs w-full sm:w-auto overflow-hidden shadow-2xs">
              <span className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 flex items-center gap-1 shrink-0 whitespace-nowrap">
                <CalendarRange className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>{t.extraDaysLabel}</span>
              </span>
              <button
                type="button"
                onClick={() => onExtraDaysPositionChange('start')}
                className={`flex-1 sm:flex-initial min-w-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-3xs sm:text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  extraDaysPosition === 'start'
                    ? 'bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-200 shadow-2xs font-extrabold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={`Primeros días del mes (días 1 al ${extraDays})`}
              >
                <span className="hidden min-[400px]:inline">{t.extraDaysFirst}</span>
                <span className="min-[400px]:hidden">{t.extraDaysFirst.replace(/ (días|days|jours|tage|dies|dias|giorni)/i, '')}</span>
              </button>
              <button
                type="button"
                onClick={() => onExtraDaysPositionChange('end')}
                className={`flex-1 sm:flex-initial min-w-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-3xs sm:text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                  extraDaysPosition === 'end'
                    ? 'bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-200 shadow-2xs font-extrabold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={`Últimos días del mes (días 29 al ${daysInMonth})`}
              >
                <span className="hidden min-[400px]:inline">{t.extraDaysLast}</span>
                <span className="min-[400px]:hidden">{t.extraDaysLast.replace(/ (días|days|jours|tage|dies|dias|giorni)/i, '')}</span>
              </button>
            </div>
          )}

          <div className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 px-3.5 py-1.5 rounded-xl text-xs font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
            <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{t.variableExpenses}: {formatCurrency(monthlyRemaining, currency)}</span>
          </div>
        </div>
      </div>

      {/* Cartel de Exceso de Dinero en Frasco (Ajuste Automático Propuesto) */}
      {activeExceededJar && (
        <div className="bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/40 border-2 border-amber-400 dark:border-amber-500 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500 text-white rounded-2xl shadow-xs shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-black text-amber-950 dark:text-amber-100 leading-snug">
                  "{t.jarOverbudgetPromptTitle}"
                </h3>
                <p className="text-xs text-amber-900/80 dark:text-amber-300/90 font-medium">
                  Frasco: <strong className="font-extrabold text-amber-950 dark:text-amber-100">{activeExceededJar.title}</strong> · Asignado:{' '}
                  <strong className="font-bold">{formatCurrency(activeExceededJar.amount, currency)}</strong> · Gastado:{' '}
                  <strong className="font-bold text-rose-700 dark:text-rose-400">{formatCurrency(activeExceededJar.spent, currency)}</strong> · Exceso:{' '}
                  <strong className="font-black text-rose-700 dark:text-rose-400">{formatCurrency(excessDiff, currency)}</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissedJars(prev => ({ ...prev, [activeExceededJar.number]: true }))}
              className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 p-1.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer shrink-0"
              title={t.jarOverbudgetDismissBtn}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Explicación detallada del ajuste solicitado */}
          <div className="p-3.5 bg-white/85 dark:bg-slate-900/85 border border-amber-200 dark:border-amber-800/80 rounded-2xl text-xs text-slate-700 dark:text-slate-200 space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
              <Scale className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Cómo se calculará el ajuste:</span>
            </div>
            {!isLastJar ? (
              <p className="leading-relaxed">
                El monto asignado a <strong>{activeExceededJar.title}</strong> se actualizará para que su saldo disponible quede en{' '}
                <strong className="text-emerald-700 dark:text-emerald-400 font-black">{formatCurrency(0, currency)}</strong>. La diferencia de{' '}
                <strong className="text-rose-700 dark:text-rose-400 font-extrabold">{formatCurrency(excessDiff, currency)}</strong> se dividirá entre los{' '}
                <strong>{subsequentJars.length} frascos restantes</strong> del mes ({subsequentJars.map(j => j.title).join(', ')}), restando{' '}
                <strong className="text-amber-800 dark:text-amber-300 font-extrabold">{formatCurrency(deductionPerJar, currency)}</strong> del total disponible de cada uno para no desbalancear tu presupuesto mensual.
              </p>
            ) : (
              <p className="leading-relaxed">
                Al tratarse del <strong>último frasco del mes</strong>, se actualizará <strong>{activeExceededJar.title}</strong> para que su disponible quede en{' '}
                <strong className="text-emerald-700 dark:text-emerald-400 font-black">{formatCurrency(0, currency)}</strong>. La diferencia de{' '}
                <strong className="text-rose-700 dark:text-rose-400 font-extrabold">{formatCurrency(excessDiff, currency)}</strong> se dividirá equitativamente entre los{' '}
                <strong>{nextActiveJarsCount} frascos del siguiente mes ({nextMonthName} {nextYearVal})</strong>, restando{' '}
                <strong className="text-amber-800 dark:text-amber-300 font-extrabold">{formatCurrency(deductionPerJar, currency)}</strong> a cada frasco de dicho mes.
              </p>
            )}
          </div>

          {/* Acciones principales */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleConfirmAdjust(activeExceededJar)}
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t.jarOverbudgetConfirmBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => setDismissedJars(prev => ({ ...prev, [activeExceededJar.number]: true }))}
                className="px-3.5 py-2.5 bg-amber-100/80 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {t.jarOverbudgetDismissBtn}
              </button>
            </div>

            {exceededJars.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-3xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Otros con exceso:
                </span>
                {exceededJars.map(j => (
                  <button
                    key={j.number}
                    type="button"
                    onClick={() => setDismissedJars(prev => ({ ...prev, [j.number]: false }))}
                    className={`px-2 py-0.5 rounded-lg text-3xs font-extrabold transition-all cursor-pointer ${
                      activeExceededJar.number === j.number
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 hover:bg-amber-200'
                    }`}
                  >
                    {j.title} (-{formatCurrency(j.spent - j.amount, currency)})
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cartel de confirmación exitosa de ajuste */}
      {adjustmentSuccess && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-200 animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">{adjustmentSuccess}</span>
          </div>
          {onResetJarAdjustments && (
            <button
              type="button"
              onClick={() => {
                onResetJarAdjustments();
                setAdjustmentSuccess(null);
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg font-bold transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Deshacer</span>
            </button>
          )}
        </div>
      )}

      {/* The 5 Frascos Grid: Adaptable for Notebook and Desktop in 5 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 lg:gap-2.5 xl:gap-4 animate-in fade-in duration-200">
        {jars.map((jar) => {
          const isCurrent =
            currentDay !== null &&
            jar.startDay > 0 &&
            currentDay >= jar.startDay &&
            currentDay <= jar.endDay;

          const pctUsed = jar.amount > 0 ? Math.round((jar.spent / jar.amount) * 100) : (jar.spent > 0 ? 100 : 0);
          const roundedRemaining = Math.round(jar.remaining * 100) / 100;
          const isZeroBalance = Math.abs(roundedRemaining) === 0 && (jar.spent > 0 || jar.amount === 0);
          const isOverBudget = roundedRemaining < -0.005 && !isZeroBalance;

          // Si finalizó la duración del Frasco y sobra dinero, la leyenda dice SOBRANTE
          const isFinished =
            isPastMonth ||
            (isCurrentActiveMonth && currentDay !== null && jar.daysCount > 0 && currentDay > jar.endDay);
          const hasSurplus = isFinished && roundedRemaining > 0.005 && !isOverBudget && !isZeroBalance;

          return (
            <div
              key={jar.number}
              className={`rounded-2xl border p-3.5 sm:p-4.5 lg:p-3 xl:p-5 flex flex-col justify-between transition-all min-h-[275px] sm:min-h-[295px] lg:min-h-[285px] xl:min-h-[300px] min-w-0 ${
                isCurrent
                  ? 'bg-sky-50/25 dark:bg-sky-950/30 border-sky-500 dark:border-sky-400 ring-2 ring-sky-500/20 dark:ring-sky-400/40 shadow-xs'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div>
                {/* Header: Title and Badge */}
                <div className="flex items-center justify-between mb-1.5 gap-1.5 min-h-7 flex-wrap">
                  <span className={`text-sm font-black min-w-0 flex-1 leading-tight truncate ${
                    isCurrent 
                      ? 'text-sky-500 dark:text-sky-400' 
                      : 'text-slate-900 dark:text-white'
                  }`}>
                    {jar.title}
                  </span>
                  {isCurrent ? (
                    <span className="text-3xs sm:text-xs font-extrabold text-sky-800 dark:text-sky-200 bg-sky-100 dark:bg-sky-900/80 px-2 py-0.5 rounded-md shrink-0 border border-sky-300 dark:border-sky-600 whitespace-nowrap">
                      {t.inProgress}
                    </span>
                  ) : jar.isExtraDaysJar ? (
                    <span className="text-3xs sm:text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      {jar.daysCount > 0 ? `${jar.daysCount} ${t.daysUnitPlural}` : `0 ${t.daysUnitPlural}`}
                    </span>
                  ) : (
                    <span className="text-3xs sm:text-xs font-semibold text-slate-400 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      7 {t.daysUnitPlural}
                    </span>
                  )}
                </div>

                {/* Subtitle / Full Description */}
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 min-h-5 flex items-center leading-tight">
                  <span className="font-medium whitespace-normal line-clamp-1">{jar.subtitle}</span>
                </div>

                {/* 1. DISPONIBLE / SOBRANTE / DINERO EN EL FRASCO */}
                <div className="space-y-1">
                  <span className={`text-xs uppercase tracking-wider block font-semibold min-h-4 leading-4 truncate ${
                    isOverBudget 
                      ? 'text-rose-500 dark:text-rose-400' 
                      : isZeroBalance 
                      ? 'text-amber-600 dark:text-amber-400' 
                      : hasSurplus
                      ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {isOverBudget 
                      ? t.overBudget 
                      : isZeroBalance 
                      ? t.zeroBalance 
                      : hasSurplus
                      ? t.leftover
                      : t.available}
                  </span>
                  <p className="text-lg sm:text-xl lg:text-lg xl:text-2xl font-black tracking-tight tabular-nums h-8 flex items-center leading-none min-w-0">
                    <span className={`truncate ${
                      isOverBudget 
                        ? 'text-rose-600 dark:text-rose-400' 
                        : isZeroBalance 
                        ? 'text-amber-600 dark:text-amber-400' 
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}>
                      {formatCurrency(Math.abs(jar.remaining), currency)}
                    </span>
                  </p>
                </div>

                {/* Spending Progress Bar */}
                <div className="mt-3.5 sm:mt-4 space-y-2">
                  <div className="flex items-baseline justify-between text-2xs sm:text-xs min-h-7 leading-tight gap-1">
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">{t.spent}</span>
                    <span className={`font-bold tabular-nums text-right truncate ${isOverBudget ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      <span>{formatCurrency(jar.spent, currency)}</span>{' '}
                      <span className="text-xs font-semibold opacity-90 inline-block whitespace-nowrap">({pctUsed}%)</span>
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverBudget
                          ? 'bg-rose-500'
                          : isZeroBalance
                          ? 'bg-amber-500'
                          : pctUsed > 80
                          ? 'bg-amber-500'
                          : isCurrent
                          ? 'bg-sky-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, pctUsed)}%` }}
                    />
                  </div>
                </div>

                {/* Botón rápido si este frasco específico está excedido */}
                {isOverBudget && (
                  <div className="mt-3 p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl space-y-1.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-2xs font-extrabold text-rose-700 dark:text-rose-300">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span>Exceso: {formatCurrency(jar.spent - jar.amount, currency)}</span>
                      </span>
                    </div>
                    {onAdjustExceededJar && (
                      <button
                        type="button"
                        onClick={() => {
                          setDismissedJars(prev => ({ ...prev, [jar.number]: false }));
                          handleConfirmAdjust(jar);
                        }}
                        className="w-full flex items-center justify-center gap-1 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-2xs rounded-lg transition-colors cursor-pointer shadow-2xs"
                      >
                        <Scale className="w-3 h-3" />
                        <span>Ajustar siguientes frascos</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Badge si este frasco tiene un ajuste redistribuido aplicado */}
                {jar.adjustment !== undefined && Math.abs(jar.adjustment) > 0.005 && (
                  <div className="mt-2.5">
                    {jar.adjustment > 0 ? (
                      <span className="text-3xs font-black text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                        <span>+{formatCurrency(jar.adjustment, currency)} ({t.jarAdjustedPositive})</span>
                      </span>
                    ) : (
                      <span className="text-3xs font-black text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                        <span>-{formatCurrency(Math.abs(jar.adjustment), currency)} ({t.jarAdjustedNegative})</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 2. MONTO ASIGNADO */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm h-8">
                <span className="text-slate-500 dark:text-slate-400 text-xs font-medium">
                  {t.assignedAmount}
                </span>
                <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {formatCurrency(jar.amount, currency)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Banner para revertir ajustes si existen ajustes activos */}
      {hasActiveAdjustments && onResetJarAdjustments && (
        <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Hay redistribuciones de presupuesto activas entre frascos
              {lastAdjustmentLog?.transferredToNextMonth ? ' (incluye transferencia al próximo mes)' : ''}.
            </span>
          </div>
          <button
            type="button"
            onClick={onResetJarAdjustments}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-700 rounded-xl transition-colors cursor-pointer self-start sm:self-auto shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.jarOverbudgetRevertBtn}</span>
          </button>
        </div>
      )}

    </div>
  );
};

