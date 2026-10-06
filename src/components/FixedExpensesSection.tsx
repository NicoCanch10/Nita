import React, { useState } from 'react';
import { FixedExpense, CurrencyCode, CategoryInfo } from '../types/budget';
import { formatCurrency, getCategoryInfo } from '../utils/currency';
import { CategoryManagerModal } from './CategoryManagerModal';
import { 
  Plus, 
  Trash2, 
  CheckCircle, 
  Circle, 
  Calendar, 
  Receipt, 
  Search, 
  Palette
} from 'lucide-react';

interface FixedExpensesSectionProps {
  expenses: FixedExpense[];
  categories: CategoryInfo[];
  currency: CurrencyCode;
  totalIncome: number;
  onAddExpense: (expense: Omit<FixedExpense, 'id'>) => void;
  onDeleteExpense: (id: string) => void;
  onTogglePaid: (id: string) => void;
  onUpdateExpense: (id: string, updated: Partial<FixedExpense>) => void;
  onAddCategory: (category: CategoryInfo) => void;
  onUpdateCategoryColor: (id: string, color: string) => void;
  onDeleteCategory: (id: string) => void;
}

export const FixedExpensesSection: React.FC<FixedExpensesSectionProps> = ({
  expenses,
  categories,
  currency,
  totalIncome,
  onAddExpense,
  onDeleteExpense,
  onTogglePaid,
  onAddCategory,
  onUpdateCategoryColor,
  onDeleteCategory,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(categories[0]?.id || 'housing');
  const [dueDate, setDueDate] = useState<string>('');
  const [filterState, setFilterState] = useState<'all' | 'pending' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount || Number(amount) <= 0) return;

    onAddExpense({
      name: name.trim(),
      amount: Number(amount),
      category,
      dueDate: dueDate.trim() ? Number(dueDate) : undefined,
      isPaid: false,
    });

    setName('');
    setAmount('');
    setDueDate('');
  };

  const filteredExpenses = expenses.filter(expense => {
    const matchesFilter =
      filterState === 'all' ||
      (filterState === 'paid' && expense.isPaid) ||
      (filterState === 'pending' && !expense.isPaid);

    const matchesSearch = expense.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalFixed = expenses.reduce((sum, e) => sum + e.amount, 0);
  const paidCount = expenses.filter(e => e.isPaid).length;

  const currentCategoryInfo = getCategoryInfo(category, categories);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden relative transition-colors">
      
      {/* Section Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 rounded-xl shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              Gastos Fijos y Obligaciones
            </h2>
          </div>
        </div>

        {/* Actions & Summary stats */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-4 text-xs font-medium w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer shadow-2xs text-xs"
            title="Seleccionar y configurar categorías y colores"
          >
            <Palette className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Selección de Categorías y Colores</span>
          </button>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          <div className="text-right">
            <span className="text-slate-400 dark:text-slate-500 block text-2xs uppercase tracking-wider font-semibold">Total Comprometido</span>
            <span className="text-slate-900 dark:text-white font-black text-sm sm:text-base tabular-nums">
              {formatCurrency(totalFixed, currency)}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-2xs uppercase tracking-wider font-semibold">Progreso</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-black text-xs sm:text-sm">
              {paidCount} de {expenses.length} pagados
            </span>
          </div>
        </div>
      </div>

      {/* New Expense Form Bar */}
      <form onSubmit={handleAddSubmit} className="p-3.5 sm:p-5 bg-slate-50/70 dark:bg-slate-850/60 border-b border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-3.5 items-center">
          
          {/* Concept input */}
          <div className="sm:col-span-2 lg:col-span-4">
            <input
              type="text"
              placeholder="Ej. Alquiler, Fibertel, Seguro..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
              required
            />
          </div>

          {/* Amount input */}
          <div className="sm:col-span-1 lg:col-span-3 relative">
            <input
              type="number"
              min="0.01"
              step="any"
              placeholder="Monto ($)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 tabular-nums"
              required
            />
          </div>

          {/* Category Selector with Color indicator */}
          <div className="sm:col-span-1 lg:col-span-3 flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded-full shrink-0 shadow-2xs border border-white dark:border-slate-700"
              style={{ backgroundColor: currentCategoryInfo.color }}
              title={`Color de categoría: ${currentCategoryInfo.label}`}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500 cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id} className="dark:bg-slate-800 dark:text-white">
                  {cat.label} {cat.isCustom ? '(Personalizada)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Due date (optional) and Add Button */}
          <div className="sm:col-span-2 lg:col-span-2 flex items-center gap-2">
            <div className="w-1/2 relative" title="Día de vencimiento (opcional, 1 al 31)">
              <input
                type="number"
                min="1"
                max="31"
                placeholder="Vence día"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden text-center tabular-nums"
              />
            </div>
            <button
              type="submit"
              className="w-1/2 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 px-3 rounded-xl transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar</span>
            </button>
          </div>

        </div>
      </form>

      {/* Filter and Search Bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        
        {/* Segmented Filter */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setFilterState('all')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap text-center ${
              filterState === 'all' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-extrabold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Todos ({expenses.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterState('pending')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap text-center ${
              filterState === 'pending' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-extrabold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Pendientes ({expenses.filter(e => !e.isPaid).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterState('paid')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap text-center ${
              filterState === 'paid' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-extrabold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Pagados ({paidCount})
          </button>
        </div>

        {/* Live Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por concepto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:bg-white dark:focus:bg-slate-750"
          />
        </div>

      </div>

      {/* Expense List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
        {filteredExpenses.length === 0 ? (
          <div className="py-12 text-center px-4">
            <Receipt className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No se encontraron gastos fijos</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Agrega tus facturas, servicios o alquiler en el formulario superior.
            </p>
          </div>
        ) : (
          filteredExpenses.map((expense) => {
            const cat = getCategoryInfo(expense.category, categories);
            const pctOfIncome = totalIncome > 0 ? ((expense.amount / totalIncome) * 100).toFixed(1) : '0';

            return (
              <div
                key={expense.id}
                className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors ${
                  expense.isPaid ? 'bg-slate-50/40 dark:bg-slate-850/40' : ''
                }`}
              >
                {/* Checkbox & Concept */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onTogglePaid(expense.id)}
                    title={expense.isPaid ? 'Marcar como pendiente' : 'Marcar como pagado'}
                    className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer shrink-0"
                  >
                    {expense.isPaid ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-bold truncate ${
                        expense.isPaid ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
                      }`}>
                        {expense.name}
                      </p>
                      {expense.isPaid && (
                        <span className="text-2xs text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/70 px-1.5 py-0.5 rounded">
                          Pagado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-2xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                      {/* Dynamic Category Badge with custom color */}
                      <span 
                        className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md border"
                        style={{ 
                          backgroundColor: `${cat.color}15`, 
                          color: cat.color,
                          borderColor: `${cat.color}35`
                        }}
                      >
                        <span 
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.label}
                      </span>

                      {expense.dueDate ? (
                        <>
                          <span aria-hidden="true" className="hidden sm:inline">·</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            Vence día {expense.dueDate}
                          </span>
                        </>
                      ) : null}
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline">{pctOfIncome}% del ingreso</span>
                    </div>
                  </div>
                </div>

                {/* Amount and delete */}
                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                  <div className="text-right">
                    <span className={`text-sm font-black tabular-nums block ${
                      expense.isPaid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
                    }`}>
                      {formatCurrency(expense.amount, currency)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteExpense(expense.id)}
                    title="Eliminar gasto"
                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Category Manager Modal */}
      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onAddCategory={onAddCategory}
        onUpdateCategoryColor={onUpdateCategoryColor}
        onDeleteCategory={onDeleteCategory}
        titleContext="Gastos Fijos"
      />

    </div>
  );
};
