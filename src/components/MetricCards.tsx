import React, { useState, useEffect, useRef } from 'react';
import { CurrencyCode, MonthCalculationDetails, FiveJarsCalculation } from '../types/budget';
import { formatCurrency } from '../utils/currency';
import { getTranslations } from '../utils/languages';
import { 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Wallet,
  Check,
  X,
  PiggyBank
} from 'lucide-react';

interface MetricCardsProps {
  income: number;
  savingsRate: number;
  totalSavings: number;
  onIncomeChange: (amount: number) => void;
  onSavingsRateChange: (rate: number) => void;
  totalFixedExpenses: number;
  paidFixedExpenses: number;
  pendingFixedExpenses: number;
  totalVariableSpent: number;
  monthlyRemaining: number;
  calcDetails: MonthCalculationDetails;
  remainingJars: FiveJarsCalculation;
  currency: CurrencyCode;
  currentDay: number | null;
  language?: string;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  income,
  savingsRate,
  totalSavings,
  onIncomeChange,
  onSavingsRateChange,
  totalFixedExpenses,
  paidFixedExpenses,
  pendingFixedExpenses,
  totalVariableSpent,
  monthlyRemaining,
  calcDetails,
  currency,
  currentDay,
  language = 'es',
}) => {
  const t = getTranslations(language);
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [tempIncome, setTempIncome] = useState(income.toString());

  // Local state for savingsRate to ensure 60fps responsiveness on tablets without blocking the JS thread
  const [localSavingsRate, setLocalSavingsRate] = useState<number>(savingsRate);
  const throttleTimerRef = useRef<number | null>(null);

  // Sync external changes
  useEffect(() => {
    setLocalSavingsRate(savingsRate);
  }, [savingsRate]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  const handleSliderChange = (newVal: number) => {
    setLocalSavingsRate(newVal);

    if (throttleTimerRef.current !== null) {
      clearTimeout(throttleTimerRef.current);
    }

    // Throttle propagate to parent to prevent freezing on tablets/touch events
    throttleTimerRef.current = window.setTimeout(() => {
      onSavingsRateChange(newVal);
    }, 50);
  };

  const handleSliderCommit = () => {
    if (throttleTimerRef.current !== null) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    onSavingsRateChange(localSavingsRate);
  };

  const handlePresetClick = (rate: number) => {
    if (throttleTimerRef.current !== null) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    setLocalSavingsRate(rate);
    onSavingsRateChange(rate);
  };

  const handleIncomeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(tempIncome);
    if (!isNaN(parsed) && parsed >= 0) {
      onIncomeChange(parsed);
      setIsEditingIncome(false);
    }
  };

  const fixedExpensesPercentage = income > 0 ? ((totalFixedExpenses / income) * 100).toFixed(1) : '0';
  const remainingPercentage = income > 0 ? ((monthlyRemaining / income) * 100).toFixed(1) : '0';
  const variableSpentRemaining = monthlyRemaining - totalVariableSpent;

  // Pace calculation if currently in this month
  const targetSpentToDate = currentDay ? calcDetails.dailyBaseBudget * currentDay : null;
  const isAheadOfPace = targetSpentToDate !== null ? totalVariableSpent <= targetSpentToDate : null;

  return (
    <div className="space-y-6">
      
      {/* Primary KPI Card: INGRESO NETO MENSUAL (con edición) + GASTOS VARIABLES (debajo en tamaño menor) */}
      <div>
        <div className="bg-linear-to-br from-blue-700 via-blue-600 to-indigo-800 text-white p-6 sm:p-7 rounded-3xl shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="relative z-10">
            
            {/* Header: Ingreso Neto Mensual Title */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-blue-100 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-blue-200" />
                {t.netIncome}
              </span>
            </div>

            {/* Income Amount Display or Inline Edit Form */}
            {isEditingIncome ? (
              <form onSubmit={handleIncomeSubmit} className="flex items-center gap-2 mt-2 max-w-sm">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={tempIncome}
                  onChange={(e) => setTempIncome(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  autoFocus
                  placeholder={t.incomePlaceholder}
                  className="w-full bg-white text-slate-900 border-2 border-white rounded-xl px-3.5 py-2 text-xl font-black focus:outline-hidden tabular-nums shadow-md"
                />
                <button
                  type="submit"
                  className="p-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors cursor-pointer shrink-0 shadow-md"
                  title={t.confirmAmount}
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingIncome(false)}
                  className="p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors cursor-pointer shrink-0"
                  title={t.cancel}
                >
                  <X className="w-5 h-5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTempIncome(income.toString());
                  setIsEditingIncome(true);
                }}
                className="group flex items-baseline gap-2 text-left cursor-pointer transition-opacity hover:opacity-90 mt-1 focus:outline-hidden"
                title={t.clickToEditIncome}
              >
                <h3 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight tabular-nums group-hover:underline underline-offset-4 decoration-white/40">
                  {formatCurrency(income, currency)}
                </h3>
              </button>
            )}

            {/* Dentro del mismo cartel, pero debajo: GASTOS VARIABLES en tamaño más chico */}
            <div className="mt-5 pt-4 border-t border-white/20 bg-white/10 dark:bg-black/20 rounded-2xl p-4 sm:p-5 backdrop-blur-xs">
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                <span className="text-blue-100 text-2xs sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                  {t.variableExpenses}
                </span>
                <span className="bg-white/20 text-white text-2xs font-extrabold px-2.5 py-0.5 rounded-full backdrop-blur-xs">
                  {remainingPercentage}{t.percentOfIncome}
                </span>
              </div>

              <p className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight tabular-nums text-white mt-1">
                {formatCurrency(monthlyRemaining, currency)}
              </p>
            </div>

          </div>

          <div className="mt-5 pt-3.5 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-2xs sm:text-xs text-blue-100 relative z-10">
            <span>{t.fixedExpensesLabel}: {fixedExpensesPercentage}%</span>
            {savingsRate > 0 && <span>{t.savingsFixedLabel}: {savingsRate}% ({formatCurrency(totalSavings, currency)})</span>}
            <span>{t.monthDaysSummary}: {calcDetails.daysInMonth} {t.daysUnitPlural} ({calcDetails.extraDays} {t.extraDaysLabel.toLowerCase()})</span>
          </div>

          <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        </div>
      </div>

      {/* Barra de AHORRO Reincorporada */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl shadow-2xs shrink-0">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                  {t.savingsBarTitle}
                </h4>
                <span className="text-2xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {localSavingsRate}% {t.savingsRateLabel}
                </span>
              </div>
              <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.savingsBarSubtitle}
              </p>
            </div>
          </div>

          <div className="text-center self-start sm:self-auto bg-emerald-50/70 dark:bg-emerald-950/30 px-3.5 py-2 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 min-w-[110px]">
            <span className="text-3xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold block text-center">
              {t.savingsAmountLabel}
            </span>
            <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-300 tabular-nums block text-center">
              {formatCurrency(income > 0 ? (income * localSavingsRate) / 100 : 0, currency)}
            </span>
          </div>
        </div>

        {/* Interactive Slider and Shortcuts */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-2xs font-bold text-slate-500 dark:text-slate-400">
            <span>{t.noSavings}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-black text-xs">
              {localSavingsRate}% = {formatCurrency(income > 0 ? (income * localSavingsRate) / 100 : 0, currency)}
            </span>
            <span>50%</span>
          </div>

          {/* Slider with dynamic green progress fill */}
          <div className="relative w-full flex items-center py-1">
            {/* Background track & real-time green fill */}
            <div className="absolute inset-x-0 h-3 bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-hidden pointer-events-none shadow-xs">
              <div
                className="h-full bg-emerald-500 dark:bg-emerald-500 rounded-full transition-[width] duration-75 ease-out shadow-xs"
                style={{ width: `${Math.min(100, Math.max(0, (localSavingsRate / 50) * 100))}%` }}
              />
            </div>

            {/* Range input overlaid on top with pointer/touch commit handlers */}
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={localSavingsRate}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              onPointerUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              onMouseUp={handleSliderCommit}
              className="relative z-10 w-full h-4 appearance-none bg-transparent cursor-pointer accent-emerald-600 dark:accent-emerald-400 focus:outline-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent touch-pan-x"
              title={t.adjustSavingsSlider}
            />
          </div>

          {/* Quick preset buttons */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-2xs text-slate-400 dark:text-slate-500 mr-1 font-semibold">{t.shortcuts}</span>
            {[0, 5, 10, 15, 20, 25, 30, 40, 50].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handlePresetClick(rate)}
                className={`px-2.5 py-1 rounded-xl text-2xs font-bold transition-all cursor-pointer ${
                  localSavingsRate === rate
                    ? 'bg-emerald-600 text-white font-black shadow-xs ring-2 ring-emerald-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {rate}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Real-time Tracking & Pace Indicator Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 transition-colors shadow-xs">
        
        {/* Fixed Expenses Status */}
        <div className="flex items-center gap-4 lg:gap-6 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{t.paidFixedLabel} <strong className="text-slate-900 dark:text-white font-bold tabular-nums">{formatCurrency(paidFixedExpenses, currency)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{t.pendingFixedLabel} <strong className="text-slate-900 dark:text-white font-bold tabular-nums">{formatCurrency(pendingFixedExpenses, currency)}</strong></span>
          </div>
        </div>

        {/* Real Month Pace Alert (if current month is active) */}
        {currentDay && (
          <div className="flex items-center gap-2.5 sm:gap-3 text-xs flex-wrap sm:flex-nowrap justify-between sm:justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              {isAheadOfPace ? (
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  {t.paceExcellentLabel.replace('{day}', String(currentDay)).replace('{total}', String(calcDetails.daysInMonth))}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-700 dark:text-rose-300 font-bold bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  {t.paceHighLabel}
                </span>
              )}
            </div>

            <div className="text-right text-slate-500 dark:text-slate-400">
              <span className="text-2xs block uppercase">{t.variableBalanceLabel}</span>
              <span className={`font-black tabular-nums ${variableSpentRemaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                {formatCurrency(variableSpentRemaining, currency)}
              </span>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
