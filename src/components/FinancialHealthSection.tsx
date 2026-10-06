import React, { useState } from 'react';
import { CurrencyCode, FixedExpense, VariableExpense, CategoryInfo } from '../types/budget';
import { getCategoryInfo, formatCurrency } from '../utils/currency';
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
}

export const FinancialHealthSection: React.FC<FinancialHealthSectionProps> = ({
  income,
  savingsRate,
  fixedExpenses,
  variableExpenses,
  categories,
  currency,
  daysInMonth,
}) => {
  // Collapsed by default as requested
  const [isExpanded, setIsExpanded] = useState(false);

  // Simulator states
  const [simSavingReduction, setSimSavingReduction] = useState<number>(30000);
  const [simIncomeBoost, setSimIncomeBoost] = useState<number>(0);

  const totalFixed = fixedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalVariable = variableExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSavings = (income * savingsRate) / 100;

  // 50/30/20 actual rates
  const fixedPct = income > 0 ? Math.round((totalFixed / income) * 100) : 0;
  const savingsPct = savingsRate;

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
  const simNewSavings = (simNewIncome * savingsRate) / 100;
  const simNewRemaining = simNewIncome - simNewFixed - simNewSavings;
  const simNewDailyBase = daysInMonth > 0 ? simNewRemaining / daysInMonth : 0;
  const currentDailyBase = daysInMonth > 0 ? (income - totalFixed - totalSavings) / daysInMonth : 0;
  const dailyGain = simNewDailyBase - currentDailyBase;

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
                Diagnóstico de Salud Financiera (Regla 50 / 30 / 20)
              </h2>
              <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 hidden sm:inline-block">
                Opcional
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Análisis comparativo de fijos, remanente y ahorro + Simulador de impacto diario
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hidden sm:inline">
            {isExpanded ? 'Ocultar diagnóstico' : 'Desplegar diagnóstico'}
          </span>
          <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-850/30 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 50/30/20 Rule Analysis & Category Breakdown */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Distribución Estándar 50 / 30 / 20
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Comparativa de tu distribución actual respecto al estándar financiero
                  </p>
                </div>
              </div>

              {/* 3 Pillars: Necesidades, Deseos, Ahorro */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Fijos (Ideal: <= 50%) */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Gastos Fijos</span>
                    <span className="text-slate-400 dark:text-slate-500">Meta: ≤50%</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                      {fixedPct}%
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">del ingreso</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    {fixedPct <= 50 ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">Excelente nivel de costos estructurales.</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-bold">Alto. Revisa suscripciones o cuotas para liberar margen.</span>
                    )}
                  </p>
                </div>

                {/* Remanente / Flexibles (Ideal: ~30%) */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Remanente Libre</span>
                    <span className="text-slate-400 dark:text-slate-500">Meta: ~30%</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                      {Math.max(0, 100 - fixedPct)}%
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">disponible</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    Tu flujo para los 5 frascos semanales y consumos cotidianos.
                  </p>
                </div>

                {/* Capacidad proyectada */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Balance</span>
                    <span className="text-slate-400 dark:text-slate-500">Estado</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {100 - fixedPct}%
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">margen</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    Fondos no comprometidos para distribuir semana a semana.
                  </p>
                </div>
              </div>

              {/* Progress visual bar */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Composición de tu dinero:</span>
                <div className="h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden shadow-inner">
                  <div 
                    style={{ width: `${Math.min(100, fixedPct)}%` }} 
                    className="bg-blue-600 h-full"
                    title={`Gastos fijos: ${fixedPct}%`}
                  />
                  <div 
                    style={{ width: `${Math.max(0, 100 - fixedPct)}%` }} 
                    className="bg-emerald-500 h-full"
                    title={`Remanente para frascos: ${Math.max(0, 100 - fixedPct)}%`}
                  />
                </div>
                <div className="flex items-center justify-between text-2xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block"/> Fijos ({fixedPct}%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/> Remanente Libre ({Math.max(0, 100 - fixedPct)}%)</span>
                </div>
              </div>

              {/* Category distribution */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                  Distribución por Categorías
                </span>
                <div className="space-y-2">
                  {Object.entries(categoryTotals).map(([catKey, total]) => {
                    const info = getCategoryInfo(catKey, categories);
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
                      Simulador de Impacto
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Proyecta cómo recortar gastos fijos o ganar más dinero impacta tu presupuesto diario
                    </p>
                  </div>
                </div>

                {/* Scenario 1: Reducción de fijos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Reducir gastos fijos en:
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
                    <span>Recorte moderado</span>
                    <span>{formatCurrency(Math.min(totalFixed, 200000), currency)}</span>
                  </div>
                </div>

                {/* Scenario 2: Ingresos extra */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      Ingreso extra proyectado:
                    </label>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      +{formatCurrency(simIncomeBoost, currency)}/mes
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
                    <span>+$250.000</span>
                    <span>+$500.000</span>
                  </div>
                </div>

                {/* Simulation Result Card */}
                <div className="p-4 rounded-xl bg-linear-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-100 dark:border-indigo-900/60 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Resultado de la Simulación</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-2xs uppercase">Nuevo Remanente Total</span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(simNewRemaining, currency)}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-2xs uppercase">Impacto Diario</span>
                      <span className={`text-base font-extrabold tabular-nums ${dailyGain > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                        {dailyGain > 0 ? `+${formatCurrency(dailyGain, currency)}/día` : 'Sin cambio'}
                      </span>
                    </div>
                  </div>

                  <p className="text-2xs text-indigo-800/80 dark:text-indigo-300 leading-relaxed pt-1 border-t border-indigo-100/60 dark:border-indigo-900/60">
                    Con este ajuste ganarías <strong>{formatCurrency(dailyGain * 7, currency)} más por cada frasco semanal</strong> para disfrutar con tranquilidad.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>Simulación en tiempo real. No altera tus datos reales guardados.</span>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
