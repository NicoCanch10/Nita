import React from 'react';
import { WeekBreakdown, CurrencyCode } from '../types/budget';
import { formatCurrency } from '../utils/currency';
import { Calendar, ShieldCheck, Sparkles, Layers } from 'lucide-react';

interface WeeklyDistributionSectionProps {
  weeks: WeekBreakdown[];
  currency: CurrencyCode;
  currentDay: number | null;
}

export const WeeklyDistributionSection: React.FC<WeeklyDistributionSectionProps> = ({
  weeks,
  currency,
  currentDay,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
      
      {/* Title & Concept */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Distribución en las 4 Semanas del Mes
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cada una de las 4 semanas recibe sus 7 días base más su cuota proporcional de los días excedentes del mes (con centavos exactos).
          </p>
        </div>
        <div className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg self-start sm:self-auto flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-600" />
          <span>4 Semanas Completas</span>
        </div>
      </div>

      {/* 4 Week Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {weeks.map((week) => {
          const isCurrent = currentDay !== null && currentDay >= week.startDay && currentDay <= week.endDay;
          const isPast = currentDay !== null && currentDay > week.endDay;
          const isFuture = currentDay !== null && currentDay < week.startDay;

          const pctUsed = week.budget > 0 ? Math.min(100, Math.round((week.spent / week.budget) * 100)) : 0;
          const isOverBudget = week.remaining < 0;

          return (
            <div
              key={week.weekNumber}
              className={`rounded-2xl border p-4.5 flex flex-col justify-between transition-all ${
                isCurrent
                  ? 'border-blue-500 bg-blue-50/20 ring-2 ring-blue-500/10 shadow-sm'
                  : isPast
                  ? 'border-slate-200 bg-slate-50/60'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                {/* Header: Label & Status */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold text-slate-900">
                    {week.label}
                  </span>
                  {isCurrent && (
                    <span className="text-2xs font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                      En Curso
                    </span>
                  )}
                  {isPast && (
                    <span className="text-2xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                      Cerrada
                    </span>
                  )}
                  {isFuture && (
                    <span className="text-2xs font-medium text-slate-400">
                      Próxima
                    </span>
                  )}
                </div>

                <div className="text-2xs text-slate-500 mb-3 flex items-center justify-between">
                  <span>Día {week.startDay} al {week.endDay}</span>
                  <span className="font-semibold text-slate-600">({week.daysCount} días)</span>
                </div>

                {/* Total Budget figure */}
                <div className="space-y-1">
                  <span className="text-2xs text-slate-400 uppercase tracking-wider block">
                    Presupuesto Asignado
                  </span>
                  <p className="text-xl font-extrabold text-slate-900 tabular-nums">
                    {formatCurrency(week.budget, currency)}
                  </p>
                </div>

                {/* Component details (Base + Extra days share) */}
                <div className="mt-2.5 p-2 bg-slate-50/80 rounded-lg text-2xs space-y-1 border border-slate-100">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Base 7 días:</span>
                    <span className="font-semibold tabular-nums text-slate-700">
                      {formatCurrency(week.baseBudget, currency)}
                    </span>
                  </div>
                  {week.extraDaysShare > 0 && (
                    <div className="flex items-center justify-between text-emerald-700 font-medium">
                      <span>+ Cuota días extras:</span>
                      <span className="font-bold tabular-nums">
                        +{formatCurrency(week.extraDaysShare, currency)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Spending Progress Bar */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="text-slate-500">Gastado:</span>
                    <span className={`font-semibold tabular-nums ${isOverBudget ? 'text-rose-600 font-bold' : 'text-slate-700'}`}>
                      {formatCurrency(week.spent, currency)} ({pctUsed}%)
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverBudget
                          ? 'bg-rose-500'
                          : pctUsed > 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, pctUsed)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer: Remaining Balance */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 text-2xs">
                  {isOverBudget ? 'Excedido por:' : 'Disponible:'}
                </span>
                <span className={`font-bold tabular-nums ${
                  isOverBudget ? 'text-rose-600' : 'text-emerald-700'
                }`}>
                  {formatCurrency(Math.abs(week.remaining), currency)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Strategic budgeting note */}
      <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-2.5 text-xs text-slate-600">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          <strong>Ventaja del método de 4 semanas:</strong> Al distribuir equitativamente el importe de los días que exceden las 4 semanas completas ({weeks[0]?.extraDaysShare > 0 ? `+${formatCurrency(weeks[0]?.extraDaysShare, currency)} a cada semana` : 'mes de 28 días exactos'}), mantienes un flujo de caja regular sin desajustes en el cierre de mes.
        </span>
      </div>

    </div>
  );
};
