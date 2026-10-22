import React, { useState, useEffect } from 'react';
import { VariableExpense, CurrencyCode, CategoryInfo } from '../types/budget';
import { getCategoryInfo, formatCurrency } from '../utils/currency';
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
  Palette 
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
  onAddCategory: (category: CategoryInfo) => void;
  onUpdateCategoryColor: (id: string, color: string) => void;
  onUpdateCategoryLabel?: (id: string, label: string) => void;
  onDeleteCategory: (id: string) => void;
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
  onAddCategory,
  onUpdateCategoryColor,
  onUpdateCategoryLabel,
  onDeleteCategory,
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

  // Sync date when the active month/year changes
  useEffect(() => {
    setDate(getDefaultExpenseDate(year, month, daysInMonth));
  }, [year, month, daysInMonth]);

  const currentCategoryInfo = getCategoryInfo(category, categories, language);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount || Number(amount) <= 0) {
      return;
    }

    const effectiveDate = date && /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(date)
      ? date
      : getDefaultExpenseDate(year, month, daysInMonth);

    onAddExpense({
      description: description.trim(),
      amount: Number(amount),
      category,
      date: effectiveDate,
    });

    setDescription('');
    setAmount('');
    setDate(getDefaultExpenseDate(year, month, daysInMonth));
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
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between md:justify-start items-start gap-2.5 sm:gap-3 flex-1 min-w-0 w-full md:w-auto">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 w-full">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-xl shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h2 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white leading-snug flex-1 min-w-0">
              {t.dailyExpensesTitle}
            </h2>
          </div>

          {/* Botón de Categorías y Colores debajo en móvil y al lado en escritorio */}
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer shadow-2xs text-xs shrink-0 self-start sm:self-center"
            title={t.categoriesAndColorsBtn}
          >
            <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="leading-tight">{t.categoriesAndColorsBtn}</span>
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 text-xs font-medium w-full md:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
          <div className="text-left sm:text-right">
            <span className="text-slate-400 dark:text-slate-500 block text-2xs uppercase tracking-wider font-semibold">{t.totalSpent}</span>
            <span className="text-slate-900 dark:text-white font-black text-sm sm:text-base tabular-nums">
              {formatCurrency(totalSpent, currency)}
            </span>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-2xs uppercase tracking-wider font-semibold">{t.dailyAverage}</span>
            <span className={`font-black tabular-nums text-xs sm:text-sm ${averageSpentPerDay > dailyBudget ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {formatCurrency(averageSpentPerDay, currency)}/{t.perDay}
            </span>
          </div>
        </div>
      </div>

      {/* Add Expense Form */}
      <form onSubmit={handleAddSubmit} className="p-3.5 sm:p-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3.5 items-center">
          
          {/* Date */}
          <div className="sm:col-span-1 lg:col-span-2 xl:col-span-2">
            <input
              type="date"
              value={date}
              min={`${year}-${String(month + 1).padStart(2, '0')}-01`}
              max={`${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              required
            />
          </div>

          {/* Description */}
          <div className="sm:col-span-1 lg:col-span-3 xl:col-span-4">
            <input
              type="text"
              placeholder={t.descPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-500"
              required
            />
          </div>

          {/* Amount input & Category Selector in the same row on mobile */}
          <div className="sm:col-span-2 lg:col-span-5 xl:col-span-4 grid grid-cols-12 gap-2 sm:gap-3.5 items-center">
            {/* Amount input (reduced on mobile: 5 cols out of 12) */}
            <div className="col-span-5 sm:col-span-6 relative">
              <input
                type="number"
                min="0.01"
                step="any"
                placeholder={t.amountPlaceholder}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-500 tabular-nums"
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
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-2 sm:px-3 py-2.5 text-xs sm:text-sm focus:outline-hidden focus:border-emerald-500 cursor-pointer truncate"
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

          {/* Add Button */}
          <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold py-2.5 px-3 rounded-xl transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{t.addButton}</span>
            </button>
          </div>

        </div>
      </form>

      {/* Filter and Search Bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        
        {/* Category Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
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

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t.searchDailyPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:bg-white dark:focus:bg-slate-750"
          />
        </div>

      </div>

      {/* Expense List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
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
                className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {expense.description}
                    </p>
                    <div className="flex items-center gap-2 text-2xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                      <span 
                        className="font-semibold px-1.5 py-0.5 rounded-md text-[10px] leading-tight border inline-flex items-center gap-1"
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
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                        <Clock className="w-3 h-3" />
                        {formatDateByLanguage(expense.date, language)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                  <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(expense.amount, currency)}
                  </span>

                  <button
                    type="button"
                    onClick={() => onDeleteExpense(expense.id)}
                    title={t.deleteExpense}
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
        onUpdateCategoryLabel={onUpdateCategoryLabel}
        onDeleteCategory={onDeleteCategory}
        titleContext={t.tabDaily}
        language={language}
      />

    </div>
  );
};
