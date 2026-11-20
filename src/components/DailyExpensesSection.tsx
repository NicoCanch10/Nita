import React, { useState, useEffect } from 'react';
import { VariableExpense, CurrencyCode, CategoryInfo } from '../types/budget';
import {
  CURRENCIES,
  getCategoryInfo,
  formatCurrency,
  parseAmountInput,
  formatAmountForInput,
  formatAmountInputValue,
  computeFormattedCaretIndex,
} from '../utils/currency';
import { 
  formatDateByLanguage, 
  getTranslations 
} from '../utils/languages';
import { CategoryManagerModal } from './CategoryManagerModal';
import { 
  Plus, 
  Trash2, 
  ShoppingBag, 
  Search, 
  Clock, 
  Palette,
  Pencil,
  Check,
  X
} from 'lucide-react';

interface DailyExpensesSectionProps {
  expenses: VariableExpense[];
  categories: CategoryInfo[];
  currency: CurrencyCode;
  month: number;
  year: number;
  dailyBudget: number;
  daysInMonth: number;
  language?: string;
  onAddExpense: (expense: Omit<VariableExpense, 'id'>) => void;
  onDeleteExpense: (id: string) => void;
  onUpdateExpense?: (id: string, updated: Partial<VariableExpense>) => void;
  onAddCategory: (category: CategoryInfo) => void;
  onUpdateCategoryColor: (id: string, color: string) => void;
  onUpdateCategoryLabel?: (id: string, label: string) => void;
  onDeleteCategory: (id: string) => void;
  initialAddModalOpen?: boolean;
}

export const DailyExpensesSection: React.FC<DailyExpensesSectionProps> = ({
  expenses,
  categories,
  currency,
  month,
  year,
  dailyBudget,
  daysInMonth,
  language = 'es',
  onAddExpense,
  onDeleteExpense,
  onUpdateExpense,
  onAddCategory,
  onUpdateCategoryColor,
  onUpdateCategoryLabel,
  onDeleteCategory,
  initialAddModalOpen = false,
}) => {
  const t = getTranslations(language);
  // Helper to get default date:
  // - If viewing the current real month: defaults to today's current date
  // - If viewing a different month (e.g. November when currently in October): defaults to the 1st of that month (01)
  const getDefaultExpenseDate = (targetYear: number, targetMonth: number, maxDays: number): string => {
    const now = new Date();
    const currentY = now.getFullYear();
    const currentM = now.getMonth();
    const currentD = now.getDate();

    if (currentY === targetYear && currentM === targetMonth) {
      const validDay = Math.min(maxDays || 31, Math.max(1, currentD));
      return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;
    }

    // Default to first day of the month for other months
    return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`;
  };

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(categories[3]?.id || categories[0]?.id || 'food');
  const [date, setDate] = useState(() => getDefaultExpenseDate(year, month, daysInMonth));
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialAddModalOpen);

  // Sync category state when categories change or if current category is invalid
  useEffect(() => {
    if (categories.length > 0 && (!category || !categories.some(c => c.id === category))) {
      setCategory(categories[3]?.id || categories[0].id);
    }
  }, [categories, category]);

  // Editing state for existing variable expenses
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');

  // Sync date when the active month/year changes
  useEffect(() => {
    setDate(getDefaultExpenseDate(year, month, daysInMonth));
  }, [year, month, daysInMonth]);

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
    setDescription('');
    setAmount('');
    setDate(getDefaultExpenseDate(year, month, daysInMonth));
    if (categories.length > 0 && (!category || !categories.some(c => c.id === category))) {
      setCategory(categories[3]?.id || categories[0].id);
    }
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setDescription('');
    setAmount('');
    setDate(getDefaultExpenseDate(year, month, daysInMonth));
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

  const startEditExpense = (expense: VariableExpense) => {
    setEditingExpenseId(expense.id);
    setEditDescription(expense.description || '');
    setEditAmount(expense.amount ? formatAmountForInput(expense.amount) : '');
    setEditCategory(expense.category || categories[0]?.id || 'food');
    setEditDate(expense.date || getDefaultExpenseDate(year, month, daysInMonth));
  };

  const handleSaveEditExpense = (id: string) => {
    if (!onUpdateExpense) return;
    const finalDesc = editDescription.trim();
    if (!finalDesc) return;
    const numAmount = parseAmountInput(editAmount);
    if (!numAmount || numAmount <= 0) return;
    const effectiveDate = editDate && /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(editDate)
      ? editDate
      : getDefaultExpenseDate(year, month, daysInMonth);

    onUpdateExpense(id, {
      description: finalDesc,
      amount: numAmount,
      category: editCategory || categories[0]?.id || 'food',
      date: effectiveDate,
    });
    setEditingExpenseId(null);
  };

  const handleCancelEditExpense = () => {
    setEditingExpenseId(null);
    setEditDescription('');
    setEditAmount('');
    setEditCategory('');
    setEditDate('');
  };

  const currentCategoryInfo = getCategoryInfo(category, categories, language);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalDesc = description.trim();
    const numAmount = parseAmountInput(amount);
    if (!finalDesc || !numAmount || numAmount <= 0) {
      return;
    }

    const effectiveDate = date && /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(date)
      ? date
      : getDefaultExpenseDate(year, month, daysInMonth);

    const finalCategory = category || categories[0]?.id || 'food';

    onAddExpense({
      description: finalDesc,
      amount: numAmount,
      category: finalCategory,
      date: effectiveDate,
    });

    setDescription('');
    setAmount('');
    setDate(getDefaultExpenseDate(year, month, daysInMonth));
    setIsAddModalOpen(false);
  };

  // Sort categories alphabetically for dropdown selector
  const sortedCategories = [...categories].sort((a, b) => {
    const labelA = getCategoryInfo(a.id, categories, language).label;
    const labelB = getCategoryInfo(b.id, categories, language).label;
    return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
  });

  const filteredExpenses = expenses
    .filter(item => {
      const matchesSearch = item.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesCat;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const averageSpentPerDay = daysInMonth > 0 ? (totalSpent / daysInMonth) : 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden transition-colors">
      
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center md:justify-between text-center md:text-left gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-2.5 sm:gap-3 min-w-0 w-full md:w-auto md:flex-1">
          <div className="flex items-center justify-center md:justify-start gap-2 sm:gap-2.5 min-w-0 md:flex-1">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-xl shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h2 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white leading-snug min-w-0 text-center md:text-left md:flex-1">
              {t.dailyExpensesTitle}
            </h2>
          </div>

          {/* Botón de Categorías y Colores debajo en móvil y al lado en escritorio */}
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer shadow-2xs text-xs shrink-0 self-center"
            title={t.categoriesAndColorsBtn}
          >
            <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="leading-tight">{t.categoriesAndColorsBtn}</span>
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center md:justify-end gap-4 text-xs font-medium w-full md:w-auto pt-2 sm:pt-2.5 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800 shrink-0">
          <div className="text-center md:text-right">
            <span className="text-slate-400 dark:text-slate-500 block text-2xs uppercase tracking-wider font-semibold">{t.totalSpent}</span>
            <span className="text-slate-900 dark:text-white font-black text-sm sm:text-base tabular-nums">
              {formatCurrency(totalSpent, currency)}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

          <div className="text-center md:text-left">
            <span className="text-slate-400 dark:text-slate-500 block text-2xs uppercase tracking-wider font-semibold">{t.dailyAverage}</span>
            <span className={`font-black tabular-nums text-xs sm:text-sm ${averageSpentPerDay > dailyBudget ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {formatCurrency(averageSpentPerDay, currency)}/{t.perDay}
            </span>
          </div>
        </div>
      </div>

      {/* Unified Load Action Bar (Mobile & small screens only; moved into Filter bar on web md+) */}
      <div className="px-4 sm:px-6 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex md:hidden items-center justify-between sm:justify-center gap-3">
        <button
          type="button"
          onClick={handleOpenAddModal}
          data-testid="daily-expenses-add-trigger"
          className="w-full sm:w-auto sm:min-w-[200px] min-h-[42px] inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs sm:text-sm font-black tracking-wide py-2.5 px-5 sm:px-8 rounded-xl transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/40"
        >
          <span>CARGAR +</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row lg:grid lg:grid-cols-[1fr_auto_1fr] items-stretch sm:items-center justify-between gap-3 lg:gap-4 text-xs">
        
        {/* Category Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 lg:justify-self-start">
          <span className="text-slate-400 dark:text-slate-500 font-bold shrink-0">{t.filterAll}:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-auto bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-2.5 py-1.5 text-xs cursor-pointer outline-hidden"
          >
            <option value="all" className="dark:bg-slate-800 dark:text-white">{t.allCategoriesFilter}</option>
            {sortedCategories.map(c => {
              const catInfo = getCategoryInfo(c.id, categories, language);
              return (
                <option key={c.id} value={c.id} className="dark:bg-slate-800 dark:text-white">{catInfo.label}</option>
              );
            })}
          </select>
        </div>

        {/* Search: right on sm (<md), centered on web (md+) */}
        <div className="w-full sm:w-64 md:w-auto md:flex-1 md:flex md:justify-center lg:flex-none lg:justify-self-center">
          <div className="relative w-full md:max-w-[225px] lg:w-64 lg:max-w-none xl:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t.searchDailyPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 md:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:bg-white dark:focus:bg-slate-750"
            />
          </div>
        </div>

        {/* Web-only CARGAR + Button replacing the right search slot */}
        <button
          type="button"
          onClick={handleOpenAddModal}
          className="hidden md:inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs sm:text-sm font-black tracking-wide py-2 px-6 md:min-w-[175px] lg:w-full lg:max-w-[270px] xl:max-w-[320px] rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0 lg:justify-self-end focus:outline-hidden focus:ring-2 focus:ring-emerald-500/40"
        >
          <span>CARGAR +</span>
        </button>

      </div>

      {/* Expense List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto no-scrollbar">
        {filteredExpenses.length === 0 ? (
          <div className="py-12 text-center px-4">
            <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{t.noDailyExpenses}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {t.noMatchingDaily}
            </p>
          </div>
        ) : (
          filteredExpenses.map((expense) => {
            const cat = getCategoryInfo(expense.category, categories, language);

            return (
              <div
                key={expense.id}
                className="px-4 py-4 sm:px-5 sm:py-4.5 flex items-center justify-between gap-3 sm:gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-[15px] sm:text-base font-bold text-slate-900 dark:text-white leading-snug truncate">
                      {expense.description}
                    </p>
                    <div className="flex items-center gap-2.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      <span 
                        className="font-semibold px-2 py-0.5 rounded-md text-[11px] sm:text-xs leading-tight border inline-flex items-center gap-1.5"
                        style={{
                          backgroundColor: `${cat.color}15`,
                          color: cat.color,
                          borderColor: `${cat.color}35`
                        }}
                      >
                        <span 
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.label}
                      </span>
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDateByLanguage(expense.date, language)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
                  <span className="text-[15px] sm:text-base font-black text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(expense.amount, currency)}
                  </span>

                  {onUpdateExpense && (
                    <button
                      type="button"
                      onClick={() => startEditExpense(expense)}
                      title="Editar gasto (descripción, monto, categoría o fecha)"
                      className="p-1.5 sm:p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-xl transition-colors cursor-pointer"
                    >
                      <Pencil className="w-4 h-4 sm:w-[17px] sm:h-[17px]" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteExpense(expense.id)}
                    title={t.deleteExpense}
                    className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 sm:w-[17px] sm:h-[17px]" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Centered Add Variable Expense Modal */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={handleCloseAddModal}
          role="dialog"
          aria-modal="true"
          aria-label="Cargar Gasto Variable"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddSubmit}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-emerald-200 dark:border-emerald-800 shadow-2xl space-y-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-sm sm:text-base font-black text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                <span className="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                  <Plus className="w-4 h-4" />
                </span>
                Cargar Gasto Variable
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
              {/* Descripción */}
              <div className="sm:col-span-12">
                <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.descPlaceholder}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-500"
                  autoFocus
                  required
                />
              </div>

              {/* Monto */}
              <div className="sm:col-span-4">
                <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Importe ({currency})
                </label>
                <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:border-emerald-500 transition-colors">
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-emerald-500 cursor-pointer truncate"
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

              {/* Fecha */}
              <div className="sm:col-span-4">
                <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={date}
                  min={`${year}-${String(month + 1).padStart(2, '0')}-01`}
                  max={`${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                  required
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Cargar Gasto</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Centered Edit Variable Expense Modal */}
      {(() => {
        const editingExpense = editingExpenseId
          ? expenses.find((e) => e && e.id === editingExpenseId) || null
          : null;
        if (!editingExpense) return null;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={handleCancelEditExpense}
            role="dialog"
            aria-modal="true"
            aria-label="Modificar Gasto Variable"
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEditExpense(editingExpense.id);
              }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-emerald-200 dark:border-emerald-800 shadow-2xl space-y-4 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="text-sm sm:text-base font-black text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                    <Pencil className="w-4 h-4" />
                  </span>
                  Modificar Gasto Variable
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteExpense(editingExpense.id);
                      setEditingExpenseId(null);
                    }}
                    title={t.deleteExpense}
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
                {/* Descripción */}
                <div className="sm:col-span-12">
                  <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Descripción
                  </label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t.descPlaceholder}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                    autoFocus
                    required
                  />
                </div>

                {/* Monto */}
                <div className="sm:col-span-4">
                  <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Importe ({currency})
                  </label>
                  <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus-within:border-emerald-500 transition-colors">
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-emerald-500 cursor-pointer truncate"
                  >
                    {sortedCategories.map((c) => (
                      <option key={c.id} value={c.id} className="dark:bg-slate-800 dark:text-white">
                        {getCategoryInfo(c.id, categories, language).label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fecha */}
                <div className="sm:col-span-4">
                  <label className="block text-3xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    min={`${year}-${String(month + 1).padStart(2, '0')}-01`}
                    max={`${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                    required
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
        titleContext={t.tabDaily}
        language={language}
      />

    </div>
  );
};
