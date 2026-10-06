import React, { useState } from 'react';
import { CurrencyCode } from '../types/budget';
import { formatCurrency } from '../utils/currency';
import { Wallet, Edit3, Check, X } from 'lucide-react';

interface StickyIncomeBarProps {
  income: number;
  currency: CurrencyCode;
  onIncomeChange: (amount: number) => void;
}

export const StickyIncomeBar: React.FC<StickyIncomeBarProps> = ({
  income,
  currency,
  onIncomeChange,
}) => {
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [tempIncome, setTempIncome] = useState(income.toString());

  const handleIncomeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(tempIncome);
    if (!isNaN(parsed) && parsed >= 0) {
      onIncomeChange(parsed);
      setIsEditingIncome(false);
    }
  };

  return (
    <div className="w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          
          {/* Income Label & Edit Action */}
          <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Wallet className="w-4 h-4" />
              </div>
              <span className="text-2xs sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Ingreso Neto Mensual:
              </span>
            </div>

            {!isEditingIncome && (
              <button
                type="button"
                onClick={() => {
                  setTempIncome(income.toString());
                  setIsEditingIncome(true);
                }}
                className="text-2xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer inline-flex items-center gap-1 sm:hidden px-2 py-1 bg-blue-50 dark:bg-blue-950/50 rounded-lg"
                title="Modificar ingreso neto"
              >
                <Edit3 className="w-3 h-3" />
                <span>Editar</span>
              </button>
            )}
          </div>

          {/* Amount Display or Edit Form */}
          <div className="flex items-center gap-3">
            {isEditingIncome ? (
              <form onSubmit={handleIncomeSubmit} className="flex items-center gap-1.5 w-full sm:w-auto">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={tempIncome}
                  onChange={(e) => setTempIncome(e.target.value)}
                  autoFocus
                  placeholder="Ingresa monto ($)"
                  className="w-full sm:w-48 bg-slate-50 dark:bg-slate-800 border border-blue-500 dark:border-blue-400 text-slate-900 dark:text-white rounded-xl px-3 py-1.5 text-sm font-black focus:outline-hidden tabular-nums"
                />
                <button
                  type="submit"
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer shrink-0 shadow-2xs"
                  title="Guardar monto"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingIncome(false)}
                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Cancelar"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                  {formatCurrency(income, currency)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTempIncome(income.toString());
                    setIsEditingIncome(true);
                  }}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer hidden sm:inline-flex items-center gap-1 hover:underline"
                  title="Modificar ingreso neto"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
