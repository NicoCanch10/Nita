import React, { useState, useEffect, useRef } from 'react';
import { CurrencyCode, MonthCalculationDetails, FiveJarsCalculation } from '../types/budget';
import {
  CURRENCIES,
  formatCurrency,
  parseAmountInput,
  formatAmountForInput,
  formatAmountInputValue,
  computeFormattedCaretIndex,
} from '../utils/currency';
import { getTranslations } from '../utils/languages';
import { 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Wallet,
  Check,
  X,
  PiggyBank,
  Pencil
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
  const currencySymbol = CURRENCIES[currency]?.symbol || '$';
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [tempIncome, setTempIncome] = useState(() => formatAmountForInput(income, true));
  const [isEditingSavingsAmount, setIsEditingSavingsAmount] = useState(false);
  const [tempSavingsAmount, setTempSavingsAmount] = useState('');

  // Local state for savingsRate to ensure 60fps responsiveness on tablets without blocking the JS thread
  const [localSavingsRate, setLocalSavingsRate] = useState<number>(savingsRate);
  const throttleTimerRef = useRef<number | null>(null);

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (typeof window.matchMedia === 'function') {
      return !window.matchMedia('(min-width: 640px)').matches;
    }
    return window.innerWidth < 640;
  });

  // Sync external changes
  useEffect(() => {
    setLocalSavingsRate(savingsRate);
  }, [savingsRate]);

  // Match Tailwind `sm:` (>= 640px) breakpoint exactly for mobile-exclusive slider range
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(min-width: 640px)');
    const handleChange = () => setIsMobile(!mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  const formatSavingsPercent = (rate: number): string => {
    const rounded = Math.round(rate * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toString();
  };

  const computeRateFromSavingsAmount = (amountStr: string): number => {
    const trimmed = amountStr.trim();
    const parsed = trimmed === '' ? 0 : parseAmountInput(trimmed);
    if (isNaN(parsed) || parsed <= 0 || income <= 0) return 0;
    const clampedAmount = Math.min(income, parsed);
    const rawRate = (clampedAmount / income) * 100;
    return Math.max(0, Math.min(100, Math.round(rawRate * 1000000) / 1000000));
  };

  const handleStartEditSavingsAmount = () => {
    const currentSaved = income > 0 ? (income * localSavingsRate) / 100 : 0;
    setTempSavingsAmount(formatAmountForInput(currentSaved, true));
    setIsEditingSavingsAmount(true);
  };

  const handleSavingsAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const raw = inputEl.value;
    const caret = inputEl.selectionStart;
    const nextFormatted = formatAmountInputValue(raw, tempSavingsAmount);
    const nextCaret = computeFormattedCaretIndex(raw, caret, nextFormatted);
    setTempSavingsAmount(nextFormatted);

    const previewRate = computeRateFromSavingsAmount(nextFormatted);
    setLocalSavingsRate(previewRate);

    if (nextCaret !== null && typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        if (document.activeElement === inputEl) {
          inputEl.setSelectionRange(nextCaret, nextCaret);
        }
      });
    }
  };

  const handleSavingsAmountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (throttleTimerRef.current !== null) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    const nextRate = computeRateFromSavingsAmount(tempSavingsAmount);
    setLocalSavingsRate(nextRate);
    onSavingsRateChange(nextRate);
    setIsEditingSavingsAmount(false);
  };

  const handleCancelSavingsAmountEdit = () => {
    setLocalSavingsRate(savingsRate);
    setIsEditingSavingsAmount(false);
  };

  const maxSliderRate = isMobile ? 100 : 50;

  const handleSliderChange = (rawVal: number) => {
    const newVal = Math.max(0, Math.min(maxSliderRate, Math.round(rawVal)));
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

  const handleIncomeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const raw = inputEl.value;
    const caret = inputEl.selectionStart;
    const nextFormatted = formatAmountInputValue(raw, tempIncome);
    const nextCaret = computeFormattedCaretIndex(raw, caret, nextFormatted);
    setTempIncome(nextFormatted);
    if (nextCaret !== null && typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        if (document.activeElement === inputEl) {
          inputEl.setSelectionRange(nextCaret, nextCaret);
        }
      });
    }
  };

  const handleIncomeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tempIncome.trim();
    const parsed = trimmed === '' ? 0 : parseAmountInput(trimmed);
    if (!isNaN(parsed) && parsed >= 0) {
      onIncomeChange(parsed);
      setIsEditingIncome(false);
    }
  };

  const fixedExpensesPercentage = income > 0 ? ((totalFixedExpenses / income) * 100).toFixed(1) : '0';
  const remainingPercentage = income > 0 ? ((monthlyRemaining / income) * 100).toFixed(1) : '0';

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
                <div className="flex items-center w-full bg-white border-2 border-white rounded-xl shadow-md">
                  <span className="pl-3.5 pr-1 text-xl font-black text-slate-400 select-none shrink-0">
                    {currencySymbol}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tempIncome}
                    onChange={handleIncomeInputChange}
                    onFocus={(e) => e.target.select()}
                    autoFocus
                    placeholder={t.incomePlaceholder}
                    className="w-full min-w-0 bg-transparent text-slate-900 pr-3.5 py-2 text-xl font-black focus:outline-hidden tabular-nums"
                  />
                </div>
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
                  setTempIncome(formatAmountForInput(income, true));
                  setIsEditingIncome(true);
                }}
                className="group flex items-center gap-2.5 text-left cursor-pointer transition-opacity hover:opacity-95 mt-1 focus:outline-hidden max-w-full"
                title={t.clickToEditIncome}
              >
                <h3 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight tabular-nums group-hover:underline underline-offset-4 decoration-white/40 min-w-0 break-all sm:break-normal">
                  {formatCurrency(income, currency)}
                </h3>
                <Pencil
                  aria-hidden="true"
                  className="w-4 h-4 sm:w-5 sm:h-5 text-blue-100/80 group-hover:text-white transition-colors shrink-0"
                />
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
            {savingsRate > 0 && <span>{t.savingsFixedLabel}: {formatSavingsPercent(savingsRate)}% ({formatCurrency(totalSavings, currency)})</span>}
            <span>{t.monthDaysSummary}: {calcDetails.daysInMonth} {t.daysUnitPlural} ({calcDetails.extraDays} {t.extraDaysLabel.toLowerCase()})</span>
          </div>

          <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        </div>
      </div>

      {/* Barra de AHORRO Reincorporada */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-5">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-2 sm:flex sm:items-center sm:gap-3 sm:flex-initial min-w-0">
            <div className="p-2 sm:p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl sm:rounded-2xl shadow-2xs shrink-0">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div className="contents sm:block sm:flex-1 sm:min-w-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  {t.savingsBarTitle}
                </h4>
                <span className="text-2xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {formatSavingsPercent(localSavingsRate)}% {t.savingsRateLabel}
                </span>
              </div>
              <p className="col-span-2 text-[17px] leading-snug sm:text-2xs sm:leading-normal text-slate-500 dark:text-slate-400 sm:mt-0.5">
                {language === 'es' ? t.savingsBarSubtitle.replace(/^Separa\b/, 'Separá') : t.savingsBarSubtitle}.
                <br />
                {language === 'en'
                  ? 'Enter your desired amount or use any of the shortcuts.'
                  : language === 'ca'
                  ? "Introdueix l'import desitjat o utilitza alguna de les dreceres."
                  : language === 'pt'
                  ? 'Digite o valor desejado ou utilize algum dos atalhos.'
                  : language === 'fr'
                  ? "Saisissez le montant souhaité ou utilisez l'un des raccourcis."
                  : language === 'it'
                  ? "Inserisci l'importo desiderato o utilizza una delle scorciatoie."
                  : language === 'de'
                  ? 'Gib den gewünschten Betrag ein oder nutze eine der Verknüpfungen.'
                  : 'Introducí el monto deseado ó utilizá alguno de los atajos.'}
              </p>
            </div>
          </div>

          <div className="w-full sm:flex-1 sm:min-w-[220px] text-center bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-2.5 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 min-w-[110px] flex flex-col items-center justify-center">
            {isEditingSavingsAmount ? (
              <form onSubmit={handleSavingsAmountSubmit} className="w-full flex flex-col items-center gap-1.5">
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold block text-center">
                  {t.savingsAmountLabel}
                </span>
                <div className="flex items-center justify-center gap-1.5 w-full max-w-[260px]">
                  <div className="flex items-center flex-1 min-w-0 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl shadow-2xs focus-within:border-emerald-500">
                    <span className="pl-2.5 pr-1 text-sm font-black text-slate-400 dark:text-slate-500 select-none shrink-0">
                      {currencySymbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={tempSavingsAmount}
                      onChange={handleSavingsAmountInputChange}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          handleCancelSavingsAmountEdit();
                        }
                      }}
                      autoFocus
                      placeholder="0"
                      className="w-full min-w-0 bg-transparent text-emerald-800 dark:text-emerald-200 pr-2.5 py-1.5 text-sm sm:text-base font-black focus:outline-hidden tabular-nums text-center"
                    />
                  </div>
                  <button
                    type="submit"
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs"
                    title={t.confirmAmount}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSavingsAmountEdit}
                    className="p-1.5 bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors cursor-pointer shrink-0"
                    title={t.cancel}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {income <= 0 ? (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    {t.netIncome}: {formatCurrency(0, currency)}
                  </span>
                ) : (
                  <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    = {formatSavingsPercent(localSavingsRate)}% {t.savingsRateLabel}
                  </span>
                )}
              </form>
            ) : (
              <button
                type="button"
                onClick={handleStartEditSavingsAmount}
                className="group w-full flex flex-col items-center justify-center cursor-pointer focus:outline-hidden"
                title={t.savingsAmountLabel}
              >
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 text-center">
                  <span>{t.savingsAmountLabel}</span>
                  <Pencil className="w-3 h-3 text-emerald-600/70 dark:text-emerald-400/70 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors shrink-0" />
                </span>
                <span className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums block text-center mt-0.5 group-hover:underline underline-offset-4 decoration-emerald-500/40">
                  {formatCurrency(income > 0 ? (income * localSavingsRate) / 100 : 0, currency)}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Interactive Slider and Shortcuts */}
        <div className="space-y-2.5 pt-1">
          <div className="hidden sm:flex items-center justify-between text-2xs font-bold text-slate-500 dark:text-slate-400">
            <span>{t.noSavings}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-black text-xs">
              {formatSavingsPercent(localSavingsRate)}% = {formatCurrency(income > 0 ? (income * localSavingsRate) / 100 : 0, currency)}
            </span>
            <span>50%</span>
          </div>

          {/* Slider with dynamic green progress fill */}
          <div className="flex items-center gap-2 sm:block">
            <span className="sm:hidden text-2xs font-bold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
              0%
            </span>
            <div className="relative flex-1 w-full flex items-center py-1">
              {/* Background track & real-time green fill */}
              <div className="absolute inset-x-0 h-6 sm:h-3 bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-hidden pointer-events-none shadow-xs">
                <div
                  className="h-full bg-emerald-500 dark:bg-emerald-500 rounded-full transition-[width] duration-75 ease-out shadow-xs flex items-center justify-center overflow-hidden"
                  style={{
                    width: `${
                      isMobile
                        ? Math.min(100, Math.max(0, localSavingsRate))
                        : Math.min(100, Math.max(0, (localSavingsRate / 50) * 100))
                    }%`,
                  }}
                >
                  {localSavingsRate > 0 && (
                    <span className="sm:hidden text-[10px] font-black text-white leading-none whitespace-nowrap px-0.5 tabular-nums select-none">
                      {formatSavingsPercent(localSavingsRate)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Range input overlaid on top with pointer/touch commit handlers */}
              <input
                type="range"
                min={0}
                max={maxSliderRate}
                step="any"
                value={Math.min(maxSliderRate, Math.max(0, localSavingsRate))}
                onChange={(e) => handleSliderChange(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    handlePresetClick(Math.min(maxSliderRate, Math.round(localSavingsRate) + 1));
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    handlePresetClick(Math.max(0, Math.round(localSavingsRate) - 1));
                  }
                }}
                onPointerUp={handleSliderCommit}
                onTouchEnd={handleSliderCommit}
                onMouseUp={handleSliderCommit}
                className="relative z-10 w-full h-6 sm:h-4 appearance-none opacity-0 bg-transparent cursor-pointer focus:outline-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:h-6 [&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:border-0 touch-pan-x"
                title={t.adjustSavingsSlider}
              />
            </div>
            <span className="sm:hidden text-2xs font-bold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
              100%
            </span>
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
                  Math.abs(localSavingsRate - rate) < 0.01
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
          <div className="flex items-center gap-2.5 sm:gap-3 text-xs justify-start sm:justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
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
          </div>
        )}

      </div>

    </div>
  );
};
