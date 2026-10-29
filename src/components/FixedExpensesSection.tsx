import React, { useState, useEffect } from 'react';
import { FixedExpense, CurrencyCode, CategoryInfo } from '../types/budget';
import { formatCurrency, getCategoryInfo } from '../utils/currency';
import { getTranslations } from '../utils/languages';
import { CategoryManagerModal } from './CategoryManagerModal';
import { 
  Plus, 
  Trash2, 
  CheckCircle, 
  Circle, 
  Calendar, 
  Receipt, 
  Search, 
  Palette,
  Pencil,
  Check,
  X
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
  onUpdateCategoryLabel?: (id: string, label: string) => void;
  onDeleteCategory: (id: string) => void;
  language?: string;
  daysInMonth?: number;
}

export function parseAmountInput(val: string | number): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let clean = String(val).replace(/[$€\s]/g, '').trim();
  if (!clean) return 0;

  if (clean.includes('.') && clean.includes(',')) {
    if (clean.lastIndexOf('.') < clean.lastIndexOf(',')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    const parts = clean.split(',');
    if (parts.length > 2) {
      clean = clean.replace(/,/g, '');
    } else {
      clean = clean.replace(',', '.');
    }
  } else if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length > 2) {
      clean = clean.replace(/\./g, '');
    } else if (parts[1].length === 3 && parts[0].length >= 1) {
      clean = clean.replace('.', '');
    }
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

export const FixedExpensesSection: React.FC<FixedExpensesSectionProps> = ({
  expenses,
  categories,
  currency,
  totalIncome,
  onAddExpense,
  onDeleteExpense,
  onTogglePaid,
  onUpdateExpense,
  onAddCategory,
  onUpdateCategoryColor,
  onUpdateCategoryLabel,
  onDeleteCategory,
  language = 'es',
  daysInMonth = 31,
}) => {
  const t = getTranslations(language);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(() => categories[0]?.id || 'housing');
  const [dueDate, setDueDate] = useState<string>('');
  const [filterState, setFilterState] = useState<'all' | 'pending' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Sync category state when categories change or if current category is invalid
  useEffect(() => {
    if (categories.length > 0 && (!category || !categories.some(c => c.id === category))) {
      setCategory(categories[0].id);
    }
  }, [categories, category]);

  // Editing state for existing fixed expenses
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editDueDate, setEditDueDate] = useState<string>('');

  const startEditExpense = (expense: FixedExpense) => {
    setEditingExpenseId(expense.id);
    setEditName(expense.name || '');
    setEditAmount(expense.amount ? String(expense.amount) : '');
    setEditCategory(expense.category || categories[0]?.id || 'housing');
    setEditDueDate(expense.dueDate ? String(expense.dueDate) : '');
  };

  const handleSaveEditExpense = (id: string) => {
    const finalName = editName.trim();
    if (!finalName) return;
    const numAmount = parseAmountInput(editAmount);
    if (!numAmount || numAmount <= 0) return;
    const numDueDate = editDueDate.trim() ? Math.min(daysInMonth, Math.max(1, parseInt(editDueDate, 10))) : undefined;
    onUpdateExpense(id, {
      name: finalName,
      amount: numAmount,
      category: editCategory || categories[0]?.id || 'housing',
      dueDate: numDueDate,
    });
    setEditingExpenseId(null);
  };

  const handleCancelEditExpense = () => {
    setEditingExpenseId(null);
    setEditName('');
    setEditAmount('');
    setEditCategory('');
    setEditDueDate('');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim();
    const numAmount = parseAmountInput(amount);
    if (!finalName || !numAmount || numAmount <= 0) return;

    const finalCategory = category || categories[0]?.id || 'housing';
    const numDueDate = dueDate.trim() ? Math.min(daysInMonth, Math.max(1, parseInt(dueDate, 10))) : undefined;

    onAddExpense({
      name: finalName,
      amount: numAmount,
      category: finalCategory,
      dueDate: numDueDate,
      isPaid: false,
    });

    setName('');
    setAmount('');
    setDueDate('');
  };

  // Safe defensively-coalesced expenses
  const safeExpenses = Array.isArray(expenses) ? expenses : [];

  // Sort fixed expenses alphabetically by name
  const filteredExpenses = safeExpenses
    .filter(expense => {
      if (!expense) return false;
      const isPaid = Boolean(expense.isPaid);
      const matchesFilter =
        filterState === 'all' ||
        (filterState === 'paid' && isPaid) ||
        (filterState === 'pending' && !isPaid);

      const expName = String(expense.name || '');
      const matchesSearch = expName.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));

  // Sort categories alphabetically for dropdown selector
  const sortedCategories = [...(categories || [])].sort((a, b) => {
    const labelA = getCategoryInfo(a.id, categories, language).label;
    const labelB = getCategoryInfo(b.id, categories, language).label;
    return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
  });

  const totalFixed = safeExpenses.reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);
  const paidCount = safeExpenses.filter(e => Boolean(e?.isPaid)).length;

  const currentCategoryInfo = getCategoryInfo(category, categories, language);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden relative transition-colors">
      
      {/* Section Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between md:justify-start items-start gap-2.5 sm:gap-3 flex-1 min-w-0 w-full md:w-auto">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 w-full">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 rounded-xl shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <h2 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white leading-tight sm:leading-snug flex-1 min-w-0">
              <span className="block sm:inline">{t.fixedExpensesTitleLine1}</span>
              <span className="hidden sm:inline"> </span>
              <span className="block sm:inline">{t.fixedExpensesTitleLine2}</span>
            </h2>
          </div>

          {/* Botón de Categorías y Colores debajo en móvil y al lado en escritorio */}
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer shadow-2xs text-xs shrink-0 self-start sm:self-center"
            title={t.categoriesAndColorsBtn}
          >
            <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="leading-tight">{t.categoriesAndColorsBtn}</span>
          </button>
        </div>

        {/* Summary stats */}
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 text-xs font-medium w-full md:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
          <div className="text-left sm:text-right">
            <span className="text-slate-400 dark:text-slate-500 block text-2xs uppercase tracking-wider font-semibold">{t.fixedTotalMonthly}</span>
            <span className="text-slate-900 dark:text-white font-black text-sm sm:text-base tabular-nums">
              {formatCurrency(totalFixed, currency)}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-2xs uppercase tracking-wider font-semibold">{t.paidStatus}</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-black text-xs sm:text-sm">
              {paidCount} / {expenses.length}
            </span>
          </div>
        </div>
      </div>

      {/* New Expense Form Bar */}
      <form onSubmit={handleAddSubmit} className="p-3.5 sm:p-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3.5 items-center">
          
          {/* Concept input */}
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
            <input
              type="text"
              placeholder={t.expenseConceptPlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
              required
            />
          </div>

          {/* Amount input & Category Selector in the same row on mobile and compact screens */}
          <div className="sm:col-span-2 lg:col-span-5 xl:col-span-5 grid grid-cols-12 gap-2 sm:gap-3.5 items-center">
            {/* Amount input (reduced on mobile: 5 cols out of 12) */}
            <div className="col-span-5 sm:col-span-6 relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder={t.amountPlaceholder}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 tabular-nums"
                required
              />
            </div>

            {/* Category Selector with Color indicator (7 cols out of 12 on mobile) */}
            <div className="col-span-7 sm:col-span-6 flex items-center gap-1.5 sm:gap-2 min-w-0">
              <div 
                className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full shrink-0 shadow-2xs border border-white dark:border-slate-700"
                style={{ backgroundColor: currentCategoryInfo.color }}
                title={`Color: ${currentCategoryInfo.label}`}
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500 cursor-pointer truncate"
              >
                {sortedCategories.map((cat) => {
                  const catInfo = getCategoryInfo(cat.id, categories, language);
                  return (
                    <option key={cat.id} value={cat.id} className="dark:bg-slate-800 dark:text-white">
                      {catInfo.label} {cat.isCustom ? `(${t.customCategoryTag})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Due date (optional) and Add Button */}
          <div className="sm:col-span-2 lg:col-span-4 xl:col-span-3 flex items-center gap-2">
            <div className="flex-1 min-w-[70px] relative" title={`${t.dueDatePlaceholder.replace('1-31', `1-${daysInMonth}`)} (opcional)`}>
              <input
                type="number"
                min="1"
                max={daysInMonth}
                aria-label={`${t.dueDayShort} (opcional)`}
                placeholder={`${t.dueDayShort} (1-${daysInMonth})`}
                value={dueDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setDueDate('');
                    return;
                  }
                  const num = parseInt(val, 10);
                  if (!isNaN(num)) {
                    if (num > daysInMonth) {
                      setDueDate(String(daysInMonth));
                    } else if (num < 1) {
                      setDueDate('1');
                    } else {
                      setDueDate(val);
                    }
                  }
                }}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden text-center tabular-nums"
              />
            </div>
            <button
              type="submit"
              className="flex-1 min-w-[95px] flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold py-2.5 px-2.5 sm:px-3 rounded-xl transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{t.addButton}</span>
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
            {t.filterAll} ({expenses.length})
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
            {t.filterPending} ({expenses.filter(e => !e.isPaid).length})
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
            {t.filterPaid} ({paidCount})
          </button>
        </div>

        {/* Live Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t.searchFixedPlaceholder}
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
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{t.noFixedExpenses}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {t.noMatchingFixed}
            </p>
          </div>
        ) : (
          filteredExpenses.map((expense) => {
            const cat = getCategoryInfo(expense.category, categories, language);
            const pctOfIncome = totalIncome > 0 ? ((expense.amount / totalIncome) * 100).toFixed(1) : '0';

            return (
              <div
                key={expense.id}
                className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors ${
                  expense.isPaid ? 'bg-emerald-50/25 dark:bg-emerald-950/20' : ''
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
                      <p className="text-sm font-bold truncate text-slate-900 dark:text-white">
                        {expense.name}
                      </p>
                      {expense.isPaid && (
                        <span className="text-2xs text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200/50 dark:border-emerald-800/50 px-1.5 py-0.5 rounded">
                          {t.paidStatus}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-2xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                      {/* Dynamic Category Badge with custom color */}
                      <span 
                        className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md border text-[10px] leading-tight shrink-0"
                        style={{ 
                          backgroundColor: `${cat.color}15`, 
                          color: cat.color,
                          borderColor: `${cat.color}35`
                        }}
                      >
                        <span 
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.label}
                      </span>

                      {expense.dueDate ? (
                        <>
                          <span aria-hidden="true" className="hidden sm:inline">·</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {t.dueDayShort} {expense.dueDate}
                          </span>
                        </>
                      ) : null}
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline">{pctOfIncome}{t.percentOfIncome}</span>
                    </div>
                  </div>
                </div>

                {/* Amount, inline edit, and actions */}
                {editingExpenseId === expense.id ? (
                  <div className="w-full bg-blue-50/80 dark:bg-slate-800/90 p-3 sm:p-4 rounded-2xl border border-blue-300 dark:border-blue-700 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-blue-200/60 dark:border-slate-700/60 pb-2">
                      <span className="text-xs font-black text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Modificar Gasto Fijo
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteExpense(expense.id);
                          setEditingExpenseId(null);
                        }}
                        title="Eliminar este gasto"
                        className="text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/60 px-2 py-1 rounded-lg text-2xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center">
                      {/* Concepto / Nombre */}
                      <div className="sm:col-span-5">
                        <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          Concepto
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Concepto"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-500"
                          autoFocus
                        />
                      </div>

                      {/* Monto */}
                      <div className="sm:col-span-3">
                        <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          Importe ({currency})
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-500"
                        />
                      </div>

                      {/* Categoría */}
                      <div className="sm:col-span-2">
                        <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          Categoría
                        </label>
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500 cursor-pointer truncate"
                        >
                          {sortedCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {getCategoryInfo(c.id, categories, language).label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Vencimiento */}
                      <div className="sm:col-span-2">
                        <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          Vto (1-{daysInMonth})
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={daysInMonth}
                          value={editDueDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              setEditDueDate('');
                              return;
                            }
                            const num = parseInt(val, 10);
                            if (!isNaN(num)) {
                              if (num > daysInMonth) setEditDueDate(String(daysInMonth));
                              else if (num < 1) setEditDueDate('1');
                              else setEditDueDate(val);
                            }
                          }}
                          placeholder="Opcional"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs font-bold text-center tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCancelEditExpense}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEditExpense(expense.id)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Guardar Cambios</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-sm font-black tabular-nums block text-slate-900 dark:text-white">
                        {formatCurrency(expense.amount, currency)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => startEditExpense(expense)}
                      title="Editar gasto (concepto, monto, categoría o vencimiento)"
                      className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl transition-colors cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteExpense(expense.id)}
                      title="Eliminar gasto"
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
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
        onUpdateCategoryLabel={onUpdateCategoryLabel}
        onDeleteCategory={onDeleteCategory}
        titleContext={t.tabFixed}
        language={language}
      />

    </div>
  );
};
