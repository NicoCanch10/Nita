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
  monthlyRemaining,
  calcDetails,
  currency,
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

  const maxSavingsAmount = Math.max(0, income);
  const clampedSavingsRate = Math.min(100, Math.max(0, localSavingsRate));
  const cappedSavingsInputAmount = Math.floor(Math.round(maxSavingsAmount * 1e6) / 1e4) / 100;

  // Sync external changes
  useEffect(() => {
    setLocalSavingsRate(Math.min(100, Math.max(0, savingsRate)));
  }, [savingsRate]);

  // Keep active edit input within the current month's net income ceiling if income changes
  useEffect(() => {
    if (!isEditingSavingsAmount) return;
    const trimmed = tempSavingsAmount.trim();
    if (trimmed === '') return;
    const parsed = parseAmountInput(trimmed);
    if (!isNaN(parsed) && parsed > maxSavingsAmount) {
      setTempSavingsAmount(formatAmountForInput(cappedSavingsInputAmount, true));
      setLocalSavingsRate(maxSavingsAmount > 0 ? 100 : 0);
    }
  }, [maxSavingsAmount, cappedSavingsInputAmount, isEditingSavingsAmount, tempSavingsAmount]);

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
    if (isNaN(parsed) || parsed <= 0 || maxSavingsAmount <= 0) return 0;
    const clampedAmount = Math.min(maxSavingsAmount, parsed);
    const rawRate = (clampedAmount / maxSavingsAmount) * 100;
    return Math.max(0, Math.min(100, Math.round(rawRate * 1000000) / 1000000));
  };

  const handleStartEditSavingsAmount = () => {
    const currentSaved = maxSavingsAmount > 0
      ? Math.min(maxSavingsAmount, (maxSavingsAmount * clampedSavingsRate) / 100)
      : 0;
    setTempSavingsAmount(formatAmountForInput(currentSaved, true));
    setIsEditingSavingsAmount(true);
  };

  const handleSavingsAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const raw = inputEl.value;
    const caret = inputEl.selectionStart;
    const nextFormatted = formatAmountInputValue(raw, tempSavingsAmount);
    const trimmed = nextFormatted.trim();
    const parsed = trimmed === '' ? 0 : parseAmountInput(trimmed);

    let finalFormatted = nextFormatted;
    let nextCaret = computeFormattedCaretIndex(raw, caret, nextFormatted);

    if (trimmed !== '' && !isNaN(parsed) && parsed > maxSavingsAmount) {
      finalFormatted = formatAmountForInput(cappedSavingsInputAmount, true);
      nextCaret = finalFormatted.length;
    }

    setTempSavingsAmount(finalFormatted);

    const previewRate = computeRateFromSavingsAmount(finalFormatted);
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
    setLocalSavingsRate(Math.min(100, Math.max(0, savingsRate)));
    setIsEditingSavingsAmount(false);
  };

  const maxSliderRate = 100;

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

  return (
    <div className="space-y-6">
      
      {/* Primary KPI Card: INGRESO NETO MENSUAL (con edición) */}
      <div>
        <div className="bg-linear-to-br from-blue-700 via-blue-600 to-indigo-800 text-white px-5 py-7 sm:px-8 sm:py-10 min-h-[144px] sm:min-h-[180px] rounded-3xl shadow-sm relative overflow-hidden flex flex-col justify-center">
          <div className="relative z-10">
            
            {/* Header: Ingreso Neto Mensual Title */}
            <div className="flex items-center justify-between mb-2 sm:mb-1.5">
              <span className="text-blue-50 sm:text-blue-100 text-sm sm:text-xs font-black uppercase tracking-wider flex items-center gap-2 sm:gap-1.5">
                <Wallet className="w-4 h-4 text-blue-100 sm:text-blue-200 shrink-0" />
                {t.netIncome}
              </span>
            </div>

            {/* Income Amount Display or Inline Edit Form */}
            {isEditingIncome ? (
              <form onSubmit={handleIncomeSubmit} className="flex items-center gap-2 mt-2.5 sm:mt-2 w-full sm:max-w-sm">
                <div className="flex items-center w-full bg-white border-2 border-white rounded-2xl sm:rounded-xl shadow-md">
                  <span className="pl-3.5 pr-1 text-2xl sm:text-xl font-black text-slate-400 select-none shrink-0">
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
                    className="w-full min-w-0 bg-transparent text-slate-900 pr-3.5 py-2.5 sm:py-2 text-2xl sm:text-xl font-black focus:outline-hidden tabular-nums"
                  />
                </div>
                <button
                  type="submit"
                  className="p-3 sm:p-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl sm:rounded-xl transition-colors cursor-pointer shrink-0 shadow-md"
                  title={t.confirmAmount}
                >
                  <Check className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingIncome(false)}
                  className="p-3 sm:p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-2xl sm:rounded-xl transition-colors cursor-pointer shrink-0"
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
                className="group w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 sm:gap-2.5 text-left cursor-pointer transition-all hover:opacity-95 mt-1 focus:outline-hidden max-w-full bg-white/15 sm:bg-transparent border border-white/25 sm:border-transparent rounded-2xl sm:rounded-none px-3 py-2.5 sm:p-0 shadow-xs sm:shadow-none"
                title={t.clickToEditIncome}
              >
                <h3 className="text-[clamp(1.125rem,5.5vw,1.65rem)] leading-tight sm:text-4xl lg:text-5xl font-black tracking-tight tabular-nums group-hover:underline underline-offset-4 decoration-white/40 min-w-0 break-words sm:break-normal">
                  {formatCurrency(income, currency)}
                </h3>
                <span className="p-1.5 sm:p-0 rounded-xl sm:rounded-none bg-white/20 sm:bg-transparent shrink-0">
                  <Pencil
                    aria-hidden="true"
                    className="w-4 h-4 sm:w-5 sm:h-5 text-white sm:text-blue-100/80 sm:group-hover:text-white transition-colors"
                  />
                </span>
              </button>
            )}

          </div>

          <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        </div>
      </div>

      {/* Barra de AHORRO Reincorporada */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-5">
          <div className="flex items-center gap-2.5 sm:gap-3 sm:flex-initial min-w-0">
            <div className="p-2 sm:p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl sm:rounded-2xl shadow-2xs shrink-0">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  {t.savingsBarTitle}
                </h4>
              </div>
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
                {maxSavingsAmount <= 0 ? (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    {t.netIncome}: {formatCurrency(0, currency)}
                  </span>
                ) : (
                  <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    = {formatSavingsPercent(clampedSavingsRate)}% {t.savingsRateLabel}
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
                  {formatCurrency(
                    maxSavingsAmount > 0
                      ? Math.min(maxSavingsAmount, (maxSavingsAmount * clampedSavingsRate) / 100)
                      : 0,
                    currency
                  )}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Interactive Slider and Shortcuts */}
        <div className="space-y-2.5 pt-1">
          {/* Slider with dynamic green progress fill (0% to 100%, 50% centered across all screen sizes) */}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums leading-none">
              0%
            </span>
            <div className="relative flex-1 w-full flex items-center py-1">
              {/* Background track & real-time green fill */}
              {(() => {
                const clampedRate = Math.min(100, Math.max(0, localSavingsRate));
                const percentLabel = `${formatSavingsPercent(localSavingsRate)}%`;
                return (
                  <div className="absolute inset-x-0 h-6 bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-hidden pointer-events-none shadow-xs">
                    {/* Base centered percentage over track */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-base font-black text-slate-700 dark:text-slate-100 leading-none whitespace-nowrap tabular-nums select-none">
                        {percentLabel}
                      </span>
                    </div>

                    {/* Green fill bar */}
                    <div
                      className="h-full bg-emerald-500 dark:bg-emerald-500 rounded-full transition-[width] duration-75 ease-out shadow-xs"
                      style={{
                        width: `${clampedRate}%`,
                      }}
                    />

                    {/* White centered percentage clipped to the green fill */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center transition-[clip-path] duration-75 ease-out"
                      style={{
                        clipPath: `inset(0 ${100 - clampedRate}% 0 0)`,
                      }}
                    >
                      <span className="text-base font-black text-white leading-none whitespace-nowrap tabular-nums select-none">
                        {percentLabel}
                      </span>
                    </div>
                  </div>
                );
              })()}

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
                className="relative z-10 w-full h-6 appearance-none opacity-0 bg-transparent cursor-pointer focus:outline-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:h-6 [&::-moz-range-thumb]:w-1 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:border-0 touch-pan-x"
                title={t.adjustSavingsSlider}
              />
            </div>
            <span className="text-base font-bold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums leading-none">
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

    </div>
  );
};
