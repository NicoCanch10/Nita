import React, { useState, useEffect } from 'react';
import { FixedExpense, CurrencyCode, CategoryInfo } from '../types/budget';
import {
  CURRENCIES,
  formatCurrency,
  getCategoryInfo,
  parseAmountInput,
  formatAmountForInput,
  formatAmountInputValue,
  computeFormattedCaretIndex,
} from '../utils/currency';
export { parseAmountInput } from '../utils/currency';
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
  initialAddModalOpen?: boolean;
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
  initialAddModalOpen = false,
}) => {
  const t = getTranslations(language);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(() => categories[0]?.id || 'housing');
  const [dueDate, setDueDate] = useState<string>('');
  const [filterState, setFilterState] = useState<'all' | 'pending' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialAddModalOpen);

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

  useEffect(() => {
    if (!editingExpenseId && !isAddModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingExpenseId) {
          setEditingExpenseId(null);
        } else if (isAddModalOpen) {
          setIsAddModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingExpenseId, isAddModalOpen]);

  const handleOpenAddModal = () => {
    setName('');
    setAmount('');
    setDueDate('');
    if (categories.length > 0 && (!category || !categories.some(c => c.id === category))) {
      setCategory(categories[0].id);
    }
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setName('');
    setAmount('');
    setDueDate('');
  };

  const currencySymbol = CURRENCIES[currency]?.symbol || '$';

  const handleFormattedAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    previousValue: string,
    setter: (next: string) => void
  ) => {
    const inputEl = e.target;
    const raw = inputEl.value;
    const caret = inputEl.selectionStart;
    const nextFormatted = formatAmountInputValue(raw, previousValue);
    const nextCaret = computeFormattedCaretIndex(raw, caret, nextFormatted);
    setter(nextFormatted);
    if (nextCaret !== null && typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        if (document.activeElement === inputEl) {
          inputEl.setSelectionRange(nextCaret, nextCaret);
        }
      });
    }
  };

  const startEditExpense = (expense: FixedExpense) => {
    setEditingExpenseId(expense.id);
    setEditName(expense.name || '');
    setEditAmount(expense.amount ? formatAmountForInput(expense.amount) : '');
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
    setIsAddModalOpen(false);
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

      {/* Unified Load Action Bar */}
      <div className="px-4 sm:px-6 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sm:justify-center gap-3">
        <button
          type="button"
          onClick={handleOpenAddModal}
          data-testid="fixed-expenses-add-trigger"
          className="w-full sm:w-auto sm:min-w-[200px] md:min-w-[220px] min-h-[42px] inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs sm:text-sm font-black tracking-wide py-2.5 px-5 sm:px-8 rounded-xl transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40"
        >
          <span>CARGAR +</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 text-xs">
        
        {/* Segmented Filter */}
        <div
          data-testid="fixed-expenses-filter-tabs"
          className="flex items-center gap-0.5 sm:gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-auto"
        >
          <button
            type="button"
            onClick={() => setFilterState('all')}
            className={`flex-auto sm:flex-initial min-w-0 px-1 min-[360px]:px-2 sm:px-2.5 md:px-3 py-1.5 rounded-lg text-[10.5px] min-[360px]:text-[11px] sm:text-xs font-bold tabular-nums transition-colors cursor-pointer whitespace-nowrap text-center ${
              filterState === 'all' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-extrabold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.filterAll} ({safeExpenses.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterState('pending')}
            className={`flex-auto sm:flex-initial min-w-0 px-1 min-[360px]:px-2 sm:px-2.5 md:px-3 py-1.5 rounded-lg text-[10.5px] min-[360px]:text-[11px] sm:text-xs font-bold tabular-nums transition-colors cursor-pointer whitespace-nowrap text-center ${
              filterState === 'pending' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-extrabold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.filterPending} ({safeExpenses.filter(e => !e?.isPaid).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterState('paid')}
            className={`flex-auto sm:flex-initial min-w-0 px-1 min-[360px]:px-2 sm:px-2.5 md:px-3 py-1.5 rounded-lg text-[10.5px] min-[360px]:text-[11px] sm:text-xs font-bold tabular-nums transition-colors cursor-pointer whitespace-nowrap text-center ${
              filterState === 'paid' 
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-extrabold' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.filterPaid} ({paidCount})
          </button>
        </div>

        {/* Live Search */}
        <div className="relative w-full sm:w-48 md:w-64 shrink-0">
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
                data-testid="fixed-expense-item"
                className={`p-3.5 sm:p-4 flex items-center justify-between gap-2.5 sm:gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors ${
                  expense.isPaid ? 'bg-emerald-50/25 dark:bg-emerald-950/20' : ''
                }`}
              >
                {/* Checkbox & Concept */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onTogglePaid(expense.id)}
                    title={expense.isPaid ? 'Marcar como pendiente' : 'Marcar como pagado'}
                    className="text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                  >
                    {expense.isPaid ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug break-words">
                      {expense.name}
                    </p>

                    <div className="flex items-center gap-x-2 gap-y-1 text-2xs text-slate-500 dark:text-slate-400 flex-wrap min-w-0">
                      {/* Dynamic Category Badge with custom color (never overlaps value) */}
                      <span 
                        className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-md border text-[10px] leading-tight max-w-full min-w-0"
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
                        <span className="break-words text-left">{cat.label}</span>
                      </span>

                      {expense.dueDate ? (
                        <>
                          <span aria-hidden="true" className="hidden sm:inline">·</span>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{t.dueDayShort} {expense.dueDate}</span>
                          </span>
                        </>
                      ) : null}
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline whitespace-nowrap">{pctOfIncome}{t.percentOfIncome}</span>
                    </div>
                  </div>
                </div>

                {/* Amount (with PAGADO badge centered below) and actions */}
                <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                  <div className="flex flex-col items-center justify-center text-center shrink-0">
                    <span className="text-sm font-black tabular-nums leading-tight text-slate-900 dark:text-white whitespace-nowrap">
                      {formatCurrency(expense.amount, currency)}
                    </span>
                    {expense.isPaid && (
                      <span className="mt-1 inline-flex items-center justify-center text-[10px] leading-none text-emerald-700 dark:text-emerald-300 font-extrabold uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200/70 dark:border-emerald-800/60 px-1.5 py-0.5 rounded">
                        {t.paidStatus}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditExpense(expense)}
                      title="Editar gasto (concepto, monto, categoría o vencimiento)"
                      className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteExpense(expense.id)}
                      title="Eliminar gasto"
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Centered Add Fixed Expense Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={handleCloseAddModal}
          role="dialog"
          aria-modal="true"
          aria-label="Cargar Gasto Fijo"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddSubmit}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-blue-200 dark:border-blue-800 shadow-2xl space-y-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-sm sm:text-base font-black text-blue-900 dark:text-blue-300 flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                  <Plus className="w-4 h-4" />
                </span>
                Cargar Gasto Fijo
              </span>
              <button
                type="button"
                onClick={handleCloseAddModal}
                title="Cerrar"
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              {/* Concepto / Nombre */}
              <div className="sm:col-span-12">
                <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Concepto
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.expenseConceptPlaceholder}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
                  autoFocus
                  required
                />
              </div>

              {/* Monto */}
              <div className="sm:col-span-5">
                <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Importe ({currency})
                </label>
                <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:border-blue-500 transition-colors">
                  <span className="pl-3.5 pr-1 text-sm font-bold text-slate-400 dark:text-slate-500 select-none shrink-0">
                    {currencySymbol}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => handleFormattedAmountChange(e, amount, setAmount)}
                    placeholder="0,00"
                    className="w-full min-w-0 bg-transparent pr-3.5 py-2.5 text-sm font-bold tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              {/* Categoría */}
              <div className="sm:col-span-4">
                <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Categoría
                </label>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs border border-white dark:border-slate-700"
                    style={{ backgroundColor: currentCategoryInfo.color }}
                    title={`Color: ${currentCategoryInfo.label}`}
                  />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500 cursor-pointer truncate"
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

              {/* Vencimiento */}
              <div className="sm:col-span-3">
                <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Vto (1-{daysInMonth})
                </label>
                <input
                  type="number"
                  min="1"
                  max={daysInMonth}
                  aria-label={`${t.dueDayShort} (opcional)`}
                  title={`${t.dueDatePlaceholder.replace('1-31', `1-${daysInMonth}`)} (opcional)`}
                  value={dueDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setDueDate('');
                      return;
                    }
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) {
                      if (num > daysInMonth) setDueDate(String(daysInMonth));
                      else if (num < 1) setDueDate('1');
                      else setDueDate(val);
                    }
                  }}
                  placeholder="Opcional"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2.5 text-sm font-bold text-center tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleCloseAddModal}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Cargar Gasto</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Centered Edit Fixed Expense Modal */}
      {(() => {
        const editingExpense = editingExpenseId
          ? safeExpenses.find((e) => e && e.id === editingExpenseId) || null
          : null;
        if (!editingExpense) return null;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={handleCancelEditExpense}
            role="dialog"
            aria-modal="true"
            aria-label="Modificar Gasto Fijo"
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEditExpense(editingExpense.id);
              }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-blue-200 dark:border-blue-800 shadow-2xl space-y-4 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="text-sm sm:text-base font-black text-blue-900 dark:text-blue-300 flex items-center gap-2">
                  <span className="p-1.5 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                    <Pencil className="w-4 h-4" />
                  </span>
                  Modificar Gasto Fijo
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteExpense(editingExpense.id);
                      setEditingExpenseId(null);
                    }}
                    title="Eliminar este gasto"
                    className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditExpense}
                    title="Cerrar"
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                {/* Concepto / Nombre */}
                <div className="sm:col-span-12">
                  <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Concepto
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Concepto"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-500"
                    autoFocus
                    required
                  />
                </div>

                {/* Monto */}
                <div className="sm:col-span-5">
                  <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Importe ({currency})
                  </label>
                  <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:border-blue-500 transition-colors">
                    <span className="pl-3.5 pr-1 text-sm font-bold text-slate-400 dark:text-slate-500 select-none shrink-0">
                      {currencySymbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editAmount}
                      onChange={(e) => handleFormattedAmountChange(e, editAmount, setEditAmount)}
                      placeholder="0,00"
                      className="w-full min-w-0 bg-transparent pr-3.5 py-2.5 text-sm font-bold tabular-nums text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
                      required
                    />
                  </div>
                </div>

                {/* Categoría */}
                <div className="sm:col-span-4">
                  <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Categoría
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500 cursor-pointer truncate"
                  >
                    {sortedCategories.map((c) => (
                      <option key={c.id} value={c.id} className="dark:bg-slate-800 dark:text-white">
                        {getCategoryInfo(c.id, categories, language).label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vencimiento */}
                <div className="sm:col-span-3">
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2.5 text-sm font-bold text-center tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelEditExpense}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          </div>
        );
      })()}

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
