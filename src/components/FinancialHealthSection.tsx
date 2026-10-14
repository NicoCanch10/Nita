import React, { useState } from 'react';
import { CurrencyCode, FixedExpense, VariableExpense, CategoryInfo } from '../types/budget';
import { getCategoryInfo, formatCurrency } from '../utils/currency';
import { getTranslations } from '../utils/languages';
import { 
  PieChart, 
  Calculator, 
  ArrowRight, 
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface FinancialHealthSectionProps {
  income: number;
  savingsRate: number;
  fixedExpenses: FixedExpense[];
  variableExpenses: VariableExpense[];
  categories: CategoryInfo[];
  currency: CurrencyCode;
  daysInMonth: number;
  exactWeeks: number;
  language?: string;
}

export const FinancialHealthSection: React.FC<FinancialHealthSectionProps> = ({
  income,
  savingsRate,
  fixedExpenses,
  variableExpenses,
  categories,
  currency,
  daysInMonth,
  language = 'es',
}) => {
  const t = getTranslations(language);
  // Collapsed by default as requested
  const [isExpanded, setIsExpanded] = useState(false);

  // Simulator states
  const [simSavingReduction, setSimSavingReduction] = useState<number>(30000);
  const [simIncomeBoost, setSimIncomeBoost] = useState<number>(0);

  const totalFixed = fixedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalVariable = variableExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Distribución del porcentaje:
  // 1º Tomar Ingreso Neto Mensual
  // 2º Descontar el % indicado en Ahorro
  const totalSavings = (income * savingsRate) / 100;
  const savingsPct = savingsRate;

  // 3º Distribuir entre Gastos Fijos y Gastos Variables
  const fixedPct = income > 0 ? Math.round((totalFixed / income) * 100) : 0;
  const variablePct = income > 0 ? Math.max(0, 100 - savingsPct - fixedPct) : 0;

  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  fixedExpenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });
  variableExpenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });
  if (totalSavings > 0) {
    categoryTotals['savings'] = (categoryTotals['savings'] || 0) + totalSavings;
  }

  const grandTotal = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  // Simulation calculations
  const simNewIncome = income + simIncomeBoost;
  const simNewFixed = Math.max(0, totalFixed - simSavingReduction);
  const simNewSavings = simNewIncome > 0 ? (simNewIncome * savingsRate) / 100 : 0;
  const simNewRemaining = Math.max(0, simNewIncome - simNewFixed - simNewSavings);
  
  // Percentages with priority impact: 1º Ahorro, 2º Gastos Fijos, 3º Gastos Variables
  const simSavingsPct = simNewIncome > 0 ? ((simNewSavings / simNewIncome) * 100).toFixed(1) : '0';
  const simFixedPct = simNewIncome > 0 ? ((simNewFixed / simNewIncome) * 100).toFixed(1) : '0';
  const simRemainingPct = simNewIncome > 0 ? ((simNewRemaining / simNewIncome) * 100).toFixed(1) : '0';

  const simNewDailyBase = daysInMonth > 0 ? simNewRemaining / daysInMonth : 0;
  const currentDailyBase = daysInMonth > 0 ? (income - totalFixed - totalSavings) / daysInMonth : 0;
  const dailyGain = simNewDailyBase - currentDailyBase;

  // Sorted categories by highest percentage to lowest percentage
  const sortedCategoryEntries = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden transition-colors">
      
      {/* Toggle Header Button: Collapsed by default */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors cursor-pointer"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 rounded-xl shrink-0">
            <PieChart className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {t.healthTitle}
              </h2>
              <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 hidden sm:inline-block">
                {t.optionalTag}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {t.rule503020Summary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hidden sm:inline">
            {isExpanded ? t.toggleJarsMobileCollapse : t.toggleJarsMobileExpand}
          </span>
          <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 50/30/20 Rule Analysis & Category Breakdown */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    {t.healthTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t.rule503020Summary}
                  </p>
                </div>
              </div>

              {/* 3 Pillars: Necesidades, Deseos, Ahorro */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Fijos (Ideal: <= 50%) */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.needsFixed}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                      {fixedPct}%
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t.savingsRateLabel}</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    {fixedPct <= 50 ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">{t.structuralCostExcellent}</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-bold">{t.structuralCostHigh}</span>
                    )}
                  </p>
                </div>

                {/* Gastos Variables / Flexibles (Ideal: ~30%) */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.wantsVariable}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                      {variablePct}%
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t.available}</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    {t.flowForJars}
                  </p>
                </div>

                {/* Capacidad proyectada */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.savingsTarget}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {savingsPct}%
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t.savingsRateLabel}</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    {t.savingsBarSubtitle}
                  </p>
                </div>
              </div>

              {/* Progress visual bar: Gastos Fijos -> Gastos Variables -> Ahorro */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">{t.moneyComposition}</span>
                <div className="h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden shadow-inner">
                  {/* 1º Gastos Fijos */}
                  <div 
                    style={{ width: `${Math.min(100, fixedPct)}%` }} 
                    className="bg-blue-600 h-full transition-all"
                    title={`${t.needsFixed}: ${fixedPct}%`}
                  />
                  {/* 2º Gastos Variables */}
                  <div 
                    style={{ width: `${Math.min(Math.max(0, 100 - fixedPct), variablePct)}%` }} 
                    className="bg-indigo-500 h-full transition-all"
                    title={`${t.wantsVariable}: ${variablePct}%`}
                  />
                  {/* 3º Ahorro */}
                  <div 
                    style={{ width: `${Math.max(0, 100 - fixedPct - variablePct)}%` }} 
                    className="bg-emerald-500 h-full transition-all"
                    title={`${t.savingsBarTitle}: ${savingsPct}%`}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block"/> {t.tabFixed} ({fixedPct}%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"/> {t.variableExpenses} ({variablePct}%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/> {t.savingsBarTitle} ({savingsPct}%)</span>
                </div>
              </div>

              {/* Category distribution - Sorted from highest % to lowest % */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                  {t.categoryBreakdownTitle}
                </span>
                <div className="space-y-2">
                  {sortedCategoryEntries.map(([catKey, total]) => {
                    const info = getCategoryInfo(catKey, categories, language);
                    const pct = grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) : '0';

                    return (
                      <div key={catKey} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <span 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: info.color }}
                            />
                            {info.label}
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                            {formatCurrency(total, currency)} <span className="text-slate-400 dark:text-slate-500 font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ 
                              width: `${pct}%`,
                              backgroundColor: info.color 
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* What-If Simulator: "Qué pasa si..." */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="p-2 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 rounded-xl">
                    <Calculator className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {t.simulatorTitle}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t.simulatorSubtitle}
                    </p>
                  </div>
                </div>

                {/* Scenario 1: Reducción de fijos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      {t.simulateFixedCut}
                    </label>
                    <span className="font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                      {formatCurrency(simSavingReduction, currency)}/mes
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.min(totalFixed, 200000)}
                    step="5000"
                    value={simSavingReduction}
                    onChange={(e) => setSimSavingReduction(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  />
                  <div className="flex items-center justify-between text-2xs text-slate-400 dark:text-slate-500">
                    <span>$0</span>
                    <span>{t.moderateCut}</span>
                    <span>{formatCurrency(Math.min(totalFixed, 200000), currency)}</span>
                  </div>
                </div>

                {/* Scenario 2: Ingresos extra */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      {t.simulateIncomeBoost}
                    </label>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      +{formatCurrency(simIncomeBoost, currency)}/{t.perDay}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500000"
                    step="10000"
                    value={simIncomeBoost}
                    onChange={(e) => setSimIncomeBoost(Number(e.target.value))}
                    className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  />
                  <div className="flex items-center justify-between text-2xs text-slate-400 dark:text-slate-500">
                    <span>$0</span>
                    <span>+250.000</span>
                    <span>+500.000</span>
                  </div>
                </div>

                {/* Simulation Result Card */}
                <div className="p-4 rounded-xl bg-linear-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-100 dark:border-indigo-900/60 space-y-3.5 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-2 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200 text-center">
                      <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="text-center">{t.simResultTitle}</span>
                    </div>
                    {simIncomeBoost > 0 && (
                      <span className="inline-flex items-center text-3xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shadow-2xs">
                        {t.simProjectedIncome}
                      </span>
                    )}
                  </div>

                  {/* Prioridad de impacto: 1º Gastos Fijos, 2º Gastos Variables, 3º Ahorro */}
                  <div className="space-y-1.5 text-center">
                    <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-slate-500 dark:text-slate-400 block text-center">
                      {t.simProjectedDistribution}
                    </span>
                    
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                      {/* 1º Gastos Fijos */}
                      <div className="p-2 sm:p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 flex flex-col justify-between items-center min-w-0 text-center">
                        <span className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-400 font-bold uppercase tracking-tight block leading-tight w-full text-center whitespace-normal" title={t.simPillarFixed}>
                          {t.simPillarFixed}
                        </span>
                        <span className="text-sm sm:text-base md:text-lg font-black text-blue-800 dark:text-blue-200 tabular-nums block my-0.5 leading-tight text-center">
                          {simFixedPct}%
                        </span>
                        <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 block tabular-nums leading-tight w-full text-center whitespace-normal break-all sm:break-normal" title={formatCurrency(simNewFixed, currency)}>
                          {formatCurrency(simNewFixed, currency)}
                        </span>
                      </div>

                      {/* 2º Gastos Variables */}
                      <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 flex flex-col justify-between items-center min-w-0 text-center">
                        <span className="text-[10px] sm:text-xs text-indigo-700 dark:text-indigo-400 font-bold uppercase tracking-tight block leading-tight w-full text-center whitespace-normal" title={t.simPillarVariable}>
                          {t.simPillarVariable}
                        </span>
                        <span className="text-sm sm:text-base md:text-lg font-black text-indigo-800 dark:text-indigo-200 tabular-nums block my-0.5 leading-tight text-center">
                          {simRemainingPct}%
                        </span>
                        <span className="text-[10px] sm:text-xs text-indigo-600 dark:text-indigo-400 block tabular-nums leading-tight w-full text-center whitespace-normal break-all sm:break-normal" title={formatCurrency(simNewRemaining, currency)}>
                          {formatCurrency(simNewRemaining, currency)}
                        </span>
                      </div>

                      {/* 3º Ahorro */}
                      <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 flex flex-col justify-between items-center min-w-0 text-center">
                        <span className="text-[10px] sm:text-xs text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-tight block leading-tight w-full text-center whitespace-normal" title={t.simPillarSavings}>
                          {t.simPillarSavings}
                        </span>
                        <span className="text-sm sm:text-base md:text-lg font-black text-emerald-800 dark:text-emerald-200 tabular-nums block my-0.5 leading-tight text-center">
                          {simSavingsPct}%
                        </span>
                        <span className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 block tabular-nums leading-tight w-full text-center whitespace-normal break-all sm:break-normal" title={formatCurrency(simNewSavings, currency)}>
                          {formatCurrency(simNewSavings, currency)}
                        </span>
                      </div>
                    </div>

                    {/* Barra visual de composición proyectada: 1º Fijo, 2º Variable, 3º Ahorro */}
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 flex overflow-hidden shadow-2xs mt-2">
                      <div 
                        style={{ width: `${Math.min(100, Number(simFixedPct))}%` }} 
                        className="bg-blue-600 h-full"
                        title={`${t.tabFixed}: ${simFixedPct}%`}
                      />
                      <div 
                        style={{ width: `${Math.max(0, 100 - Number(simSavingsPct) - Number(simFixedPct))}%` }} 
                        className="bg-indigo-500 h-full"
                        title={`${t.variableExpenses}: ${simRemainingPct}%`}
                      />
                      <div 
                        style={{ width: `${Math.min(100, Number(simSavingsPct))}%` }} 
                        className="bg-emerald-500 h-full"
                        title={`${t.savingsBarTitle}: ${simSavingsPct}%`}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-indigo-100/60 dark:border-indigo-900/60 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs text-center">
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-indigo-100/80 dark:border-indigo-900/50 flex flex-col items-center justify-center text-center min-w-0 overflow-hidden shadow-2xs">
                      <span className="text-slate-500 dark:text-slate-400 block text-2xs uppercase tracking-wide font-medium leading-tight mb-1 text-center max-w-full break-words">
                        {t.newDailyBudget}
                      </span>
                      <span className="text-xs sm:text-sm md:text-base font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight text-center max-w-full break-words leading-tight">
                        {formatCurrency(simNewRemaining, currency)}
                      </span>
                    </div>

                    <div className="p-2 sm:p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-emerald-100/80 dark:border-emerald-900/50 flex flex-col items-center justify-center text-center min-w-0 overflow-hidden shadow-2xs">
                      <span className="text-slate-500 dark:text-slate-400 block text-2xs uppercase tracking-wide font-medium leading-tight mb-1 text-center max-w-full break-words">
                        {t.dailyGain}
                      </span>
                      <div className={`flex flex-col items-center justify-center text-center max-w-full overflow-hidden ${dailyGain > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                        <span className="text-xs sm:text-sm md:text-base font-extrabold tabular-nums tracking-tight break-words max-w-full leading-tight">
                          {dailyGain > 0 ? `+${formatCurrency(dailyGain, currency)}` : '-'}
                        </span>
                        {dailyGain > 0 && (
                          <span className="text-3xs sm:text-2xs font-bold opacity-80 whitespace-nowrap block mt-0.5 leading-tight">
                            /{t.perDay}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-indigo-800/80 dark:text-indigo-300 leading-relaxed pt-1.5 border-t border-indigo-100/60 dark:border-indigo-900/60 text-center">
                    {dailyGain > 0 ? (
                      <>{t.simExtraGainNote.replace('{amount}', formatCurrency(dailyGain * 7, currency))}</>
                    ) : (
                      <>{t.simExtraIncomeImpactNote.replace('{savings}', simSavingsPct).replace('{fixed}', simFixedPct).replace('{remaining}', simRemainingPct)}</>
                    )}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>{t.simRealtimeNote}</span>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
