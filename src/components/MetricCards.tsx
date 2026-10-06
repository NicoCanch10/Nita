import React from 'react';
import { CurrencyCode, MonthCalculationDetails, FiveJarsCalculation } from '../types/budget';
import { formatCurrency } from '../utils/currency';
import { 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertCircle
} from 'lucide-react';

interface MetricCardsProps {
  income: number;
  totalFixedExpenses: number;
  paidFixedExpenses: number;
  pendingFixedExpenses: number;
  totalVariableSpent: number;
  monthlyRemaining: number;
  calcDetails: MonthCalculationDetails;
  remainingJars: FiveJarsCalculation;
  currency: CurrencyCode;
  currentDay: number | null;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  income,
  totalFixedExpenses,
  paidFixedExpenses,
  pendingFixedExpenses,
  totalVariableSpent,
  monthlyRemaining,
  calcDetails,
  currency,
  currentDay,
}) => {
  const fixedExpensesPercentage = income > 0 ? ((totalFixedExpenses / income) * 100).toFixed(1) : '0';
  const remainingPercentage = income > 0 ? ((monthlyRemaining / income) * 100).toFixed(1) : '0';
  const variableSpentRemaining = monthlyRemaining - totalVariableSpent;

  // Pace calculation if currently in this month
  const targetSpentToDate = currentDay ? calcDetails.dailyBaseBudget * currentDay : null;
  const isAheadOfPace = targetSpentToDate !== null ? totalVariableSpent <= targetSpentToDate : null;

  return (
    <div className="space-y-6">
      
      {/* Primary KPI Card: Remanente Mensual Libre */}
      <div>
        <div className="bg-linear-to-br from-blue-700 via-blue-600 to-indigo-800 text-white p-6 sm:p-7 rounded-3xl shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-100 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-200" />
                Remanente Mensual Libre
              </span>
              <span className="bg-white/15 text-white text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-xs">
                {remainingPercentage}% del ingreso
              </span>
            </div>

            <h3 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight tabular-nums mt-1">
              {formatCurrency(monthlyRemaining, currency)}
            </h3>

            <p className="text-blue-100/90 text-xs sm:text-sm mt-3 leading-relaxed max-w-3xl">
              Dinero disponible para distribuir en tus 5 frascos, tras deducir gastos fijos obligatorios ({formatCurrency(totalFixedExpenses, currency)}).
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-100 relative z-10">
            <span>Gastos fijos: {fixedExpensesPercentage}%</span>
            <span>Mes: {calcDetails.daysInMonth} días ({calcDetails.extraDays} días extras)</span>
          </div>

          <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        </div>
      </div>

      {/* Real-time Tracking & Pace Indicator Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors shadow-xs">
        
        {/* Fixed Expenses Status */}
        <div className="flex items-center gap-6 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Fijos Pagados: <strong className="text-slate-900 dark:text-white font-bold tabular-nums">{formatCurrency(paidFixedExpenses, currency)}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Pendientes: <strong className="text-slate-900 dark:text-white font-bold tabular-nums">{formatCurrency(pendingFixedExpenses, currency)}</strong></span>
          </div>
        </div>

        {/* Real Month Pace Alert (if current month is active) */}
        {currentDay && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              {isAheadOfPace ? (
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Ritmo Excelente (Día {currentDay} de {calcDetails.daysInMonth})
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-700 dark:text-rose-300 font-bold bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  Ritmo Alto: Ajusta consumos
                </span>
              )}
            </div>

            <div className="text-right text-slate-500 dark:text-slate-400">
              <span className="text-2xs block uppercase">Saldo libre remanente</span>
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
