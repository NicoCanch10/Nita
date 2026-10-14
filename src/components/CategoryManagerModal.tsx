import React, { useState } from 'react';
import { CategoryInfo } from '../types/budget';
import { getTranslations } from '../utils/languages';
import { getCategoryInfo } from '../utils/currency';
import { Palette, X, Trash2, Plus, Pencil, Check } from 'lucide-react';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryInfo[];
  onAddCategory: (category: CategoryInfo) => void;
  onUpdateCategoryColor: (id: string, color: string) => void;
  onUpdateCategoryLabel?: (id: string, label: string) => void;
  onDeleteCategory: (id: string) => void;
  titleContext?: string;
  language?: string;
}

const PRESET_PALETTE = [
  '#4f46e5', '#0284c7', '#0d9488', '#16a34a', '#d97706', 
  '#e11d48', '#db2777', '#7c3aed', '#2563eb', '#ea580c', 
  '#059669', '#475569', '#8b5cf6', '#06b6d4', '#84cc16'
];

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onAddCategory,
  onUpdateCategoryColor,
  onUpdateCategoryLabel,
  onDeleteCategory,
  titleContext,
  language = 'es',
}) => {
  const t = getTranslations(language);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  if (!isOpen) return null;

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatLabel.trim()) return;

    const id = `cat_${Date.now()}`;
    const newCategory: CategoryInfo = {
      id,
      label: newCatLabel.trim(),
      color: newCatColor,
      isCustom: true,
    };

    onAddCategory(newCategory);
    setNewCatLabel('');
  };

  const startEditCategory = (cat: CategoryInfo) => {
    setEditingId(cat.id);
    const catInfo = getCategoryInfo(cat.id, categories, language);
    setEditingLabel(catInfo.label);
  };

  const handleSaveEditCategory = (id: string) => {
    if (editingLabel.trim() && onUpdateCategoryLabel) {
      onUpdateCategoryLabel(id, editingLabel.trim());
    }
    setEditingId(null);
    setEditingLabel('');
  };

  const handleCancelEditCategory = () => {
    setEditingId(null);
    setEditingLabel('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] transition-colors">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-850">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 rounded-xl shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                {t.catManagerTitle} {titleContext ? `(${titleContext})` : ''}
              </h3>
              <p className="text-2xs text-slate-500 dark:text-slate-400 truncate">
                {t.catManagerSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
            aria-label={t.closeModal}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          
          {/* Create New Category Form */}
          <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-2xl space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
              {t.createNewCat}
            </span>

            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  placeholder={t.catNamePlaceholder}
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                  className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500"
                  required
                />

                <div className="flex items-center gap-2">
                  {/* Color Input */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shrink-0" title={t.chooseColor}>
                    <input
                      type="color"
                      value={newCatColor}
                      onChange={(e) => setNewCatColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    />
                  </div>

                  <button
                    type="submit"
                    className="flex-1 sm:flex-initial px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.addButton}</span>
                  </button>
                </div>
              </div>

              {/* Preset quick color dots */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-2xs text-slate-400 mr-1">{t.chooseColor}</span>
                {PRESET_PALETTE.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNewCatColor(p)}
                    style={{ backgroundColor: p }}
                    className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                      newCatColor.toLowerCase() === p.toLowerCase() ? 'ring-2 ring-offset-1 ring-slate-800 dark:ring-white scale-110' : 'hover:scale-110'
                    }`}
                    aria-label={`Color ${p}`}
                  />
                ))}
              </div>
            </form>
          </div>

          {/* Existing Categories List with Color Pickers and Name Editing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                {t.existingCats} ({categories.length})
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-64 sm:max-h-72 overflow-y-auto">
              {categories.map((cat) => {
                const isEditing = editingId === cat.id;
                const catInfo = getCategoryInfo(cat.id, categories, language);

                return (
                  <div key={cat.id} className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Direct Color Picker for this category */}
                      <div className="relative group flex items-center shrink-0">
                        <input
                          type="color"
                          value={cat.color}
                          onChange={(e) => onUpdateCategoryColor(cat.id, e.target.value)}
                          className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent"
                          title={catInfo.label}
                        />
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <input
                            type="text"
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditCategory(cat.id);
                              if (e.key === 'Escape') handleCancelEditCategory();
                            }}
                            className="bg-white dark:bg-slate-800 border border-indigo-500 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white font-bold w-full focus:outline-hidden"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditCategory(cat.id)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer shrink-0"
                            title={t.saveChanges}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditCategory}
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer shrink-0"
                            title={t.cancel}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0 flex items-center gap-2 flex-1">
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                              {catInfo.label}
                            </span>
                            <span className="text-2xs font-mono text-slate-400 block truncate">
                              {cat.color} {cat.isCustom ? `· ${t.customCategoryTag}` : `· ${t.cannotDeleteDefaultCat}`}
                            </span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => startEditCategory(cat)}
                            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title={catInfo.label}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-2 shrink-0">
                        {cat.isCustom && (
                          <button
                            type="button"
                            onClick={() => onDeleteCategory(cat.id)}
                            title={t.deleteExpense}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            {t.understood}
          </button>
        </div>

      </div>
    </div>
  );
};
