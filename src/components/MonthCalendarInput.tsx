import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { getTranslations, formatNumericDateByLanguage } from '../utils/languages';

interface CalendarLabels {
  optionalPlaceholder: string;
  clear: string;
  today: string;
  selectDateAria: string;
}

const CALENDAR_LABELS: Record<string, CalendarLabels> = {
  es: {
    optionalPlaceholder: 'Opcional',
    clear: 'Limpiar',
    today: 'Hoy',
    selectDateAria: 'Seleccionar fecha del mes',
  },
  ca: {
    optionalPlaceholder: 'Opcional',
    clear: 'Netejar',
    today: 'Avui',
    selectDateAria: 'Seleccionar data del mes',
  },
  en: {
    optionalPlaceholder: 'Optional',
    clear: 'Clear',
    today: 'Today',
    selectDateAria: 'Select date in month',
  },
  pt: {
    optionalPlaceholder: 'Opcional',
    clear: 'Limpar',
    today: 'Hoje',
    selectDateAria: 'Selecionar data do mês',
  },
  fr: {
    optionalPlaceholder: 'Optionnel',
    clear: 'Effacer',
    today: "Aujourd'hui",
    selectDateAria: 'Sélectionner une date du mois',
  },
  it: {
    optionalPlaceholder: 'Opzionale',
    clear: 'Cancella',
    today: 'Oggi',
    selectDateAria: 'Seleziona data del mese',
  },
  de: {
    optionalPlaceholder: 'Optional',
    clear: 'Löschen',
    today: 'Heute',
    selectDateAria: 'Datum im Monat auswählen',
  },
};

interface MonthCalendarInputProps {
  value: string; // YYYY-MM-DD or ''
  onChange: (nextValue: string) => void;
  month: number; // 0-11
  year: number;
  daysInMonth: number;
  language?: string;
  ariaLabel?: string;
  title?: string;
  accentColor?: 'blue' | 'emerald';
  required?: boolean;
}

export const MonthCalendarInput: React.FC<MonthCalendarInputProps> = ({
  value,
  onChange,
  month,
  year,
  daysInMonth,
  language = 'es',
  ariaLabel,
  title,
  accentColor = 'blue',
  required = false,
}) => {
  const t = getTranslations(language);
  const labels = CALENDAR_LABELS[language] || CALENDAR_LABELS.es;
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 280,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pointerDownRef = useRef(false);
  const wasOpenOnPointerDownRef = useRef(false);
  const suppressOpenOnFocusRef = useRef(false);
  const lastTabAtRef = useRef(0);

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthMinDate = `${monthPrefix}-01`;
  const monthMaxDate = `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}`;
  const monthName = t.months[month] || '';
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sunday .. 6=Saturday

  const now = new Date();
  const isTodayInActiveMonth = now.getFullYear() === year && now.getMonth() === month;
  const todayDay = now.getDate();

  const selectedDay = (() => {
    const match = /^\d{4}-\d{2}-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const parsed = parseInt(match[1], 10);
    return !isNaN(parsed) && parsed >= 1 && parsed <= daysInMonth ? parsed : null;
  })();

  const [focusedDay, setFocusedDay] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFocusedDay(selectedDay ?? (isTodayInActiveMonth ? todayDay : 1));
    } else {
      setFocusedDay(null);
    }
  }, [isOpen, selectedDay, isTodayInActiveMonth, todayDay]);

  const focusDayButton = useCallback((day: number) => {
    const clamped = Math.min(daysInMonth, Math.max(1, day));
    setFocusedDay(clamped);
    const dayBtn = popoverRef.current?.querySelector<HTMLButtonElement>(
      `button[data-calendar-day="${clamped}"]`
    );
    dayBtn?.focus();
  }, [daysInMonth]);

  const formattedDisplayValue = value.trim() ? formatNumericDateByLanguage(value.trim(), language) : '';

  const closeCalendar = useCallback((restoreInputFocus = false) => {
    setIsOpen(false);
    if (restoreInputFocus) {
      suppressOpenOnFocusRef.current = true;
      inputRef.current?.focus();
    }
  }, []);

  // Track recent Tab key presses so keyboard Tab navigation reliably triggers auto-open on focus
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleGlobalTabKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        lastTabAtRef.current = Date.now();
      }
    };
    window.addEventListener('keydown', handleGlobalTabKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalTabKeyDown, true);
    };
  }, []);

  const updatePopoverPosition = useCallback(() => {
    const inputEl = inputRef.current;
    if (!inputEl || typeof window === 'undefined') return;

    const rect = inputEl.getBoundingClientRect();
    const popoverWidth = Math.min(288, Math.max(248, window.innerWidth - 24));
    const estimatedHeight = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= estimatedHeight + 12 || spaceBelow >= rect.top
        ? Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + 6)
        : Math.max(8, rect.top - estimatedHeight - 6);

    const idealLeft = rect.right - popoverWidth;
    const left = Math.max(12, Math.min(idealLeft, window.innerWidth - popoverWidth - 12));

    setCoords({ top, left, width: popoverWidth });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePopoverPosition();

    const handleReposition = () => updatePopoverPosition();
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        !inputRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        !inputRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const focusedInsidePopover = Boolean(
          document.activeElement && popoverRef.current?.contains(document.activeElement)
        );
        closeCalendar(focusedInsidePopover);
      }
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    document.addEventListener('focusin', handleFocusIn, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('focusin', handleFocusIn, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, updatePopoverPosition, closeCalendar]);

  const handleSelectDay = (day: number) => {
    const focusedInsidePopover = Boolean(
      document.activeElement && popoverRef.current?.contains(document.activeElement)
    );
    const iso = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    onChange(iso);
    closeCalendar(focusedInsidePopover);
  };

  const focusBorderClass =
    accentColor === 'emerald'
      ? 'focus:border-emerald-500'
      : 'focus:border-blue-500';
  const selectedDayClass =
    accentColor === 'emerald'
      ? 'bg-emerald-600 text-white font-black shadow-xs'
      : 'bg-blue-600 text-white font-black shadow-xs';
  const todayRingClass =
    accentColor === 'emerald'
      ? 'ring-1 ring-emerald-500 text-emerald-700 dark:text-emerald-300 font-black'
      : 'ring-1 ring-blue-500 text-blue-700 dark:text-blue-300 font-black';

  const headerIconClass =
    accentColor === 'emerald'
      ? 'w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0'
      : 'w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0';
  const todayBtnClass =
    accentColor === 'emerald'
      ? 'px-2 py-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer'
      : 'px-2 py-1 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer';

  const calendarContent = isOpen ? (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`${monthName} ${year}`}
      lang={language}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        width: `${coords.width}px`,
        zIndex: 60,
      }}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3.5 text-slate-800 dark:text-slate-100 animate-in fade-in duration-100"
    >
      {/* Active month header (current month only, no month switching) */}
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm text-slate-900 dark:text-white capitalize">
          <CalendarIcon className={headerIconClass} />
          <span>
            {monthName} {year}
          </span>
        </div>
        <button
          type="button"
          onClick={() => closeCalendar(Boolean(document.activeElement && popoverRef.current?.contains(document.activeElement)))}
          title={t.closeModal}
          aria-label={t.closeModal}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Localized weekday labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {t.daysShort.map((dayLabel, idx) => (
          <div
            key={`${dayLabel}-${idx}`}
            className="text-center text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase py-1"
          >
            {dayLabel}
          </div>
        ))}
      </div>

      {/* Days of the active month only */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }).map((_, idx) => (
          <div key={`empty-${idx}`} aria-hidden="true" />
        ))}

        {Array.from({ length: daysInMonth }, (_, idx) => idx + 1).map((day) => {
          const isSelected = selectedDay === day;
          const isToday = isTodayInActiveMonth && todayDay === day;
          return (
            <button
              key={day}
              type="button"
              data-calendar-day={day}
              onFocus={() => setFocusedDay(day)}
              onClick={() => handleSelectDay(day)}
              onKeyDown={(e) => {
                let targetDay: number | null = null;
                if (e.key === 'ArrowLeft') targetDay = day - 1;
                else if (e.key === 'ArrowRight') targetDay = day + 1;
                else if (e.key === 'ArrowUp') targetDay = day - 7;
                else if (e.key === 'ArrowDown') targetDay = day + 7;
                else if (e.key === 'Home') targetDay = 1;
                else if (e.key === 'End') targetDay = daysInMonth;

                if (targetDay !== null) {
                  e.preventDefault();
                  e.stopPropagation();
                  focusDayButton(targetDay);
                }
              }}
              className={`h-8 rounded-lg text-xs tabular-nums flex items-center justify-center transition-colors cursor-pointer ${
                isSelected
                  ? selectedDayClass
                  : isToday
                  ? `${todayRingClass} hover:bg-slate-100 dark:hover:bg-slate-800`
                  : 'font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Localized footer actions */}
      <div className="flex items-center justify-between gap-2 pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold">
        <div className="flex items-center gap-2">
          {!required && value && (
            <button
              type="button"
              onClick={() => {
                const focusedInsidePopover = Boolean(
                  document.activeElement && popoverRef.current?.contains(document.activeElement)
                );
                onChange('');
                closeCalendar(focusedInsidePopover);
              }}
              className="px-2 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
            >
              {labels.clear}
            </button>
          )}
          {isTodayInActiveMonth && (
            <button
              type="button"
              onClick={() => handleSelectDay(todayDay)}
              className={todayBtnClass}
            >
              {labels.today}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => closeCalendar(Boolean(document.activeElement && popoverRef.current?.contains(document.activeElement)))}
          className="px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer ml-auto"
        >
          {t.closeModal}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        inputMode="none"
        required={required}
        value={formattedDisplayValue}
        onChange={() => {}}
        onBeforeInput={(e) => e.preventDefault()}
        onPaste={(e) => e.preventDefault()}
        placeholder={labels.optionalPlaceholder}
        lang={language}
        data-min={monthMinDate}
        data-max={monthMaxDate}
        aria-label={ariaLabel || labels.selectDateAria}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={title}
        onPointerDown={() => {
          pointerDownRef.current = true;
          wasOpenOnPointerDownRef.current = isOpen;
          window.setTimeout(() => {
            pointerDownRef.current = false;
          }, 300);
        }}
        onFocus={(e) => {
          if (suppressOpenOnFocusRef.current) {
            suppressOpenOnFocusRef.current = false;
            return;
          }
          if (pointerDownRef.current) return;
          const isTabNavigation = Date.now() - lastTabAtRef.current < 200;
          if (isTabNavigation || e.relatedTarget !== null) {
            setIsOpen(true);
          }
        }}
        onBlur={(e) => {
          const nextTarget = e.relatedTarget as Node | null;
          if (
            nextTarget &&
            !inputRef.current?.contains(nextTarget) &&
            !popoverRef.current?.contains(nextTarget)
          ) {
            setIsOpen(false);
          }
        }}
        onClick={() => {
          const wasOpen = pointerDownRef.current ? wasOpenOnPointerDownRef.current : isOpen;
          pointerDownRef.current = false;
          setIsOpen(!wasOpen);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
            } else {
              const targetDay = focusedDay ?? selectedDay ?? (isTodayInActiveMonth ? todayDay : 1);
              handleSelectDay(targetDay);
            }
          } else if (e.key === ' ') {
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
            }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const targetDay = focusedDay ?? selectedDay ?? (isTodayInActiveMonth ? todayDay : 1);
            if (!isOpen) {
              setIsOpen(true);
              if (typeof requestAnimationFrame !== 'undefined') {
                requestAnimationFrame(() => focusDayButton(targetDay));
              }
            } else {
              focusDayButton(targetDay);
            }
          }
        }}
        className={`w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-3 pr-9 py-2.5 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden ${focusBorderClass} cursor-pointer truncate`}
      />
      <CalendarIcon
        aria-hidden="true"
        className="w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none absolute right-3 bottom-[13px]"
      />
      {calendarContent && typeof document !== 'undefined'
        ? createPortal(calendarContent, document.body)
        : calendarContent}
    </>
  );
};
