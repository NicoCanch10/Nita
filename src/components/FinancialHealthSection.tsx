import React, { useState, useId, useEffect } from 'react';
import { CurrencyCode, FixedExpense, VariableExpense, CategoryInfo } from '../types/budget';
import { formatCurrency } from '../utils/currency';
import { getTranslations } from '../utils/languages';
import { 
  PieChart, 
  Calculator, 
  ArrowRight, 
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

function splitPieLabel(label: string, maxCharsPerLine: number, maxLines: number): string[] {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  if (maxLines <= 1) {
    return [
      clean.length > maxCharsPerLine
        ? `${clean.slice(0, Math.max(1, maxCharsPerLine - 1)).trimEnd()}…`
        : clean,
    ];
  }
  if (clean.length <= maxCharsPerLine) return [clean];

  const words = clean.split(' ');
  const lines: string[] = [];
  let i = 0;

  while (i < words.length && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      const remaining = words.slice(i).join(' ');
      lines.push(
        remaining.length > maxCharsPerLine
          ? `${remaining.slice(0, Math.max(1, maxCharsPerLine - 1)).trimEnd()}…`
          : remaining
      );
      break;
    }

    let line = words[i];
    i++;
    if (line.length > maxCharsPerLine) {
      lines.push(`${line.slice(0, Math.max(1, maxCharsPerLine - 1))}…`);
      continue;
    }
    while (i < words.length && `${line} ${words[i]}`.length <= maxCharsPerLine) {
      line = `${line} ${words[i]}`;
      i++;
    }
    lines.push(line);
  }

  return lines;
}

function getSliceLabelConfig(
  label: string,
  startAngle: number,
  angle: number,
  isFullCircle: boolean,
  cx: number,
  cy: number,
  r: number
) {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean) return null;

  const midAngle = startAngle + angle / 2;
  const midRad = (midAngle * Math.PI) / 180;

  if (isFullCircle) {
    return {
      x: cx,
      y: cy,
      rotate: 0,
      fontSize: 13,
      lines: splitPieLabel(clean, 18, 3),
    };
  }

  // Wide slices: place horizontal text inside only if the full name fits without truncation
  if (angle >= 48) {
    const labelR = angle >= 130 ? r * 0.48 : r * 0.57;
    const fontSize = angle >= 100 ? 11.5 : 10;
    const availableWidth = 2 * labelR * Math.sin((Math.min(angle, 140) * Math.PI) / 360) * 0.84;
    const maxChars = Math.max(6, Math.floor(availableWidth / (fontSize * 0.6)));
    const lines = splitPieLabel(clean, maxChars, angle >= 110 ? 3 : 2);
    const fitsWithoutTruncation =
      !lines.some((l) => l.endsWith('…')) &&
      lines.every((l) => l.length * fontSize * 0.6 <= availableWidth);

    if (fitsWithoutTruncation) {
      return {
        x: cx + labelR * Math.cos(midRad),
        y: cy + labelR * Math.sin(midRad),
        rotate: 0,
        fontSize,
        lines,
      };
    }
  }

  // Medium slices: place radial 1-line text inside only if the full name fits cleanly
  if (angle >= 16) {
    const fontSize = angle >= 30 ? 9.5 : 8.5;
    const radialSpace = r * 0.64;
    const innerThickness = 2 * (r * 0.42) * Math.sin((angle * Math.PI) / 360);
    const estTextWidth = clean.length * fontSize * 0.56;

    if (estTextWidth <= radialSpace && innerThickness >= fontSize * 1.45) {
      const labelR = r * 0.61;
      const rotate = Math.cos(midRad) < 0 ? midAngle - 180 : midAngle;
      return {
        x: cx + labelR * Math.cos(midRad),
        y: cy + labelR * Math.sin(midRad),
        rotate,
        fontSize,
        lines: [clean],
      };
    }
  }

  // Name does not fit cleanly inside slice -> render an arrow leading to its external label
  return null;
}

interface RawCalloutInput {
  key: string;
  label: string;
  color: string;
  midAngle: number;
}

interface PositionedCallout extends RawCalloutInput {
  ax: number;
  ay: number;
  ex: number;
  ey: number;
  lx: number;
  ly: number;
  arrowBaseX: number;
  isRight: boolean;
  lines: string[];
}

function layoutExternalCallouts(
  items: RawCalloutInput[],
  cx: number,
  cy: number,
  r: number
): PositionedCallout[] {
  if (items.length === 0) return [];

  const lineHeight = 11;
  const prepareSide = (sideItems: RawCalloutInput[], isRight: boolean): PositionedCallout[] => {
    const sorted = [...sideItems].sort((a, b) => {
      const ay = cy + r * Math.sin((a.midAngle * Math.PI) / 180);
      const by = cy + r * Math.sin((b.midAngle * Math.PI) / 180);
      return ay - by;
    });

    const draft = sorted.map((item) => {
      const midRad = (item.midAngle * Math.PI) / 180;
      const ax = cx + r * 0.85 * Math.cos(midRad);
      const ay = cy + r * 0.85 * Math.sin(midRad);
      const ex = cx + (r + 10) * Math.cos(midRad);
      const ey = cy + (r + 10) * Math.sin(midRad);
      const lines = splitPieLabel(item.label, 14, 2);
      const height = lines.length * lineHeight + 6;
      return { ...item, ax, ay, ex, ey, ly: ey, height, lines };
    });

    const minY = cy - r - 18;
    const maxY = cy + r + 18;

    // Resolve vertical overlaps top-to-bottom
    for (let i = 0; i < draft.length; i++) {
      const half = draft[i].height / 2;
      if (i === 0) {
        draft[i].ly = Math.max(minY + half, draft[i].ly);
      } else {
        const prevBottom = draft[i - 1].ly + draft[i - 1].height / 2;
        if (draft[i].ly - half < prevBottom) {
          draft[i].ly = prevBottom + half;
        }
      }
    }

    // Pull back up if last item exceeds bottom boundary
    for (let i = draft.length - 1; i >= 0; i--) {
      const half = draft[i].height / 2;
      if (i === draft.length - 1) {
        draft[i].ly = Math.min(maxY - half, draft[i].ly);
      } else {
        const nextTop = draft[i + 1].ly - draft[i + 1].height / 2;
        if (draft[i].ly + half > nextTop) {
          draft[i].ly = nextTop - half;
        }
      }
    }

    return draft.map((d) => {
      const dy = Math.abs(d.ly - cy);
      const circleExtentX = dy < r + 8 ? Math.sqrt(Math.max(0, (r + 8) ** 2 - dy ** 2)) : 0;
      const lx = isRight
        ? Math.max(cx + r + 18, cx + circleExtentX + 12)
        : Math.min(cx - r - 18, cx - circleExtentX - 12);
      const arrowBaseX = isRight ? lx - 5.5 : lx + 5.5;
      return {
        key: d.key,
        label: d.label,
        color: d.color,
        midAngle: d.midAngle,
        ax: d.ax,
        ay: d.ay,
        ex: d.ex,
        ey: d.ey,
        lx,
        ly: d.ly,
        arrowBaseX,
        isRight,
        lines: d.lines,
      };
    });
  };

  const rightItems = items.filter((item) => Math.cos((item.midAngle * Math.PI) / 180) >= 0);
  const leftItems = items.filter((item) => Math.cos((item.midAngle * Math.PI) / 180) < 0);

  return [...prepareSide(rightItems, true), ...prepareSide(leftItems, false)];
}

interface FinancialHealthSectionProps {
  income: number;
  savingsRate: number;
  fixedExpenses: FixedExpense[];
  variableExpenses: VariableExpense[];
  categories: CategoryInfo[];
  currency: CurrencyCode;
  daysInMonth: number;
  exactWeeks: number;
  language?: string;
  collapsible?: boolean;
}

export const FinancialHealthSection: React.FC<FinancialHealthSectionProps> = ({
  income,
  savingsRate,
  fixedExpenses,
  variableExpenses,
  categories,
  currency,
  daysInMonth,
  language = 'es',
  collapsible = true,
}) => {
  const t = getTranslations(language);
  const chartUid = useId().replace(/:/g, '');
  // Collapsed by default only when collapsible (general menu); always expanded in dedicated tab
  const [isExpanded, setIsExpanded] = useState(!collapsible);
  const showContent = !collapsible || isExpanded;

  // Simulator states
  const [simSavingReduction, setSimSavingReduction] = useState<number>(0);
  const [simIncomeBoost, setSimIncomeBoost] = useState<number>(0);
  const [hoveredComposition, setHoveredComposition] = useState<string | null>(null);

  const totalFixed = (fixedExpenses || []).reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);

  const getDefaultIncomeBoostMax = (curr: CurrencyCode): number => {
    switch (curr) {
      case 'ARS':
      case 'CLP':
      case 'COP':
      case 'PYG':
        return 500000;
      case 'CRC':
      case 'UYU':
      case 'MXN':
      case 'DOP':
        return 20000;
      case 'BRL':
      case 'PEN':
      case 'BOB':
      case 'GTQ':
      case 'HNL':
      case 'NIO':
      case 'HTG':
      case 'VES':
        return 5000;
      default:
        return 2000;
    }
  };

  const getNiceSliderStep = (maxVal: number): number => {
    if (maxVal <= 0) return 1;
    const raw = maxVal / 50;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const snapped = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return Math.max(1, snapped * magnitude);
  };

  const fixedSliderMax = Math.max(0, Math.round(totalFixed));
  const fixedSliderStep = getNiceSliderStep(fixedSliderMax);
  const currencyDefaultBoostMax = getDefaultIncomeBoostMax(currency);
  const incomeBoostMax = income > 0
    ? Math.max(currencyDefaultBoostMax, Math.ceil(income / getNiceSliderStep(income)) * getNiceSliderStep(income))
    : currencyDefaultBoostMax;
  const incomeBoostStep = getNiceSliderStep(incomeBoostMax);

  useEffect(() => {
    setSimSavingReduction(0);
    setSimIncomeBoost(0);
  }, [currency]);

  const effectiveSimSavingReduction = Math.min(simSavingReduction, fixedSliderMax);
  const effectiveSimIncomeBoost = Math.min(simIncomeBoost, incomeBoostMax);

  // Distribución del porcentaje:
  // 1º Tomar Ingreso Neto Mensual
  // 2º Descontar el % indicado en Ahorro
  const totalSavings = (income * savingsRate) / 100;
  const savingsPct = Math.round(savingsRate * 100) / 100;

  // 3º Distribuir entre Gastos Fijos y Gastos Variables
  const fixedPct = income > 0 ? Math.round((totalFixed / income) * 1000) / 10 : 0;
  const variableAmountRaw = Math.max(0, income - totalFixed - totalSavings);
  const variablePct = income > 0 ? Math.round((variableAmountRaw / income) * 1000) / 10 : 0;

  // Simulation calculations
  const simNewIncome = income + effectiveSimIncomeBoost;
  const simNewFixed = Math.max(0, totalFixed - effectiveSimSavingReduction);
  const simNewSavings = simNewIncome > 0 ? (simNewIncome * savingsRate) / 100 : 0;
  const simNewRemaining = Math.max(0, simNewIncome - simNewFixed - simNewSavings);

  // Percentages with priority impact: 1º Ahorro, 2º Gastos Fijos, 3º Gastos Variables
  const simSavingsPct = simNewIncome > 0 ? ((simNewSavings / simNewIncome) * 100).toFixed(1) : '0';
  const simFixedPct = simNewIncome > 0 ? ((simNewFixed / simNewIncome) * 100).toFixed(1) : '0';
  const simRemainingPct = simNewIncome > 0 ? ((simNewRemaining / simNewIncome) * 100).toFixed(1) : '0';

  const simNewDailyBase = daysInMonth > 0 ? simNewRemaining / daysInMonth : 0;
  const currentDailyBase = daysInMonth > 0 ? Math.max(0, income - totalFixed - totalSavings) / daysInMonth : 0;
  const dailyGain = simNewDailyBase - currentDailyBase;

  const headerTitleContent = (
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 rounded-xl shrink-0">
        <PieChart className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug sm:truncate">
            {t.healthTitle}
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
          {t.rule503020Summary}
        </p>
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden transition-colors">
      
      {/* Header: Toggle button in general view, static section header in standalone view */}
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors cursor-pointer"
          aria-expanded={isExpanded}
        >
          {headerTitleContent}

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hidden sm:inline">
              {isExpanded ? t.healthCollapse : t.healthExpand}
            </span>
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </button>
      ) : (
        <div className="w-full p-4 sm:p-6 flex items-center justify-between gap-4 text-left">
          {headerTitleContent}
        </div>
      )}

      {/* Expanded Content */}
      {showContent && (
        <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 50/30/20 Rule Analysis & Category Breakdown */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
              {/* 3 Pillars: Necesidades, Deseos, Ahorro */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-2">
                {/* Fijos (Ideal: <= 50%) */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col gap-2 sm:row-span-3 sm:grid sm:grid-rows-subgrid">
                  <div className="flex items-start justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.needsFixed}</span>
                  </div>
                  <div className="flex items-baseline lg:items-center gap-2">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                      {fixedPct}%
                    </span>
                    <span className="text-xs leading-tight text-slate-500 dark:text-slate-400">{t.savingsRateLabel}</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    {fixedPct <= 50 ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">{t.structuralCostExcellent}</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 font-bold">{t.structuralCostHigh}</span>
                    )}
                  </p>
                </div>

                {/* Gastos Variables / Flexibles (Ideal: ~30%) */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col gap-2 sm:row-span-3 sm:grid sm:grid-rows-subgrid">
                  <div className="flex items-start justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.wantsVariable}</span>
                  </div>
                  <div className="flex items-baseline lg:items-center gap-2">
                    <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                      {variablePct}%
                    </span>
                    <span className="text-xs leading-tight text-slate-500 dark:text-slate-400">{t.available}</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    {t.flowForJars}
                  </p>
                </div>

                {/* Capacidad proyectada */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col gap-2 sm:row-span-3 sm:grid sm:grid-rows-subgrid">
                  <div className="flex items-start justify-between text-2xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.savingsTarget}</span>
                  </div>
                  <div className="flex items-baseline lg:items-center gap-2">
                    <span className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {savingsPct}%
                    </span>
                    <span className="text-xs leading-tight text-slate-500 dark:text-slate-400">{t.savingsRateLabel}</span>
                  </div>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    {t.savingsBarSubtitle}
                  </p>
                </div>
              </div>

              {/* Pie Chart (left) & Concept Descriptions (right): Gastos Fijos -> Gastos Variables -> Ahorro */}
              <div className="space-y-3">
                <span className="text-[15px] font-semibold text-slate-700 dark:text-slate-300 block">
                  {t.moneyComposition}
                </span>

                {(() => {
                  const variableAmount = Math.max(0, income - totalFixed - totalSavings);
                  const pieItems = [
                    {
                      key: 'fixed',
                      label: t.tabFixed,
                      pct: Math.max(0, fixedPct),
                      amount: totalFixed,
                      color: '#2563eb',
                    },
                    {
                      key: 'variable',
                      label: t.variableExpenses,
                      pct: Math.max(0, variablePct),
                      amount: variableAmount,
                      color: '#6366f1',
                    },
                    {
                      key: 'savings',
                      label: t.savingsBarTitle,
                      pct: Math.max(0, savingsPct),
                      amount: totalSavings,
                      color: '#10b981',
                    },
                  ];

                  const totalPiePct = pieItems.reduce((sum, item) => sum + item.pct, 0);
                  const cx = 160;
                  const cy = 152;
                  const r = 128;
                  let cumulativeAngle = -90;

                  const slices = pieItems
                    .filter((item) => item.pct > 0 && totalPiePct > 0)
                    .map((item) => {
                      const fraction = item.pct / totalPiePct;
                      const angle = fraction * 360;
                      const startAngle = cumulativeAngle;
                      const endAngle = startAngle + angle;
                      cumulativeAngle = endAngle;

                      const startRad = (startAngle * Math.PI) / 180;
                      const endRad = (endAngle * Math.PI) / 180;
                      const x1 = cx + r * Math.cos(startRad);
                      const y1 = cy + r * Math.sin(startRad);
                      const x2 = cx + r * Math.cos(endRad);
                      const y2 = cy + r * Math.sin(endRad);
                      const largeArc = angle > 180 ? 1 : 0;
                      const isFullCircle = fraction >= 0.9999;

                      const pathD = `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
                      const labelCfg = getSliceLabelConfig(
                        item.label,
                        startAngle,
                        angle,
                        isFullCircle,
                        cx,
                        cy,
                        r
                      );

                      return {
                        ...item,
                        midAngle: startAngle + angle / 2,
                        isFullCircle,
                        pathD,
                        clipId: `${chartUid}-comp-${item.key}`,
                        labelCfg,
                      };
                    });

                  const callouts = layoutExternalCallouts(
                    slices
                      .filter((s) => !s.labelCfg)
                      .map((s) => ({
                        key: s.key,
                        label: s.label,
                        color: s.color,
                        midAngle: s.midAngle,
                      })),
                    cx,
                    cy,
                    r
                  );
                  const hasCallouts = callouts.length > 0;
                  const hasLeftCallouts = callouts.some((c) => !c.isRight);
                  const hasRightCallouts = callouts.some((c) => c.isRight);
                  const vbMinX = hasLeftCallouts ? cx - r - 98 : cx - r - 10;
                  const vbMaxX = hasRightCallouts ? cx + r + 98 : cx + r + 10;
                  const svgViewBox = hasCallouts
                    ? `${vbMinX} 0 ${vbMaxX - vbMinX} 304`
                    : `${cx - r - 10} ${cy - r - 10} ${r * 2 + 20} ${r * 2 + 20}`;

                  return (
                    <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6">
                      {/* Gráfico en formato torta a la izquierda */}
                      <div className="shrink-0 max-w-full flex items-center justify-center sm:justify-start">
                        <svg
                          viewBox={svgViewBox}
                          className={
                            hasCallouts
                              ? 'h-[246px] sm:h-[246px] md:h-[264px] lg:h-[228px] xl:h-[282px] w-auto max-w-full drop-shadow-xs'
                              : 'h-56 sm:h-56 md:h-60 lg:h-52 xl:h-64 w-auto max-w-full drop-shadow-xs'
                          }
                          role="img"
                          aria-label={t.moneyComposition}
                          onMouseLeave={() => setHoveredComposition(null)}
                        >
                          <defs>
                            {slices.map((slice) => (
                              <clipPath key={slice.clipId} id={slice.clipId}>
                                {slice.isFullCircle ? (
                                  <circle cx={cx} cy={cy} r={r} />
                                ) : (
                                  <path d={slice.pathD} />
                                )}
                              </clipPath>
                            ))}
                          </defs>
                          {slices.length === 0 ? (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={r}
                              className="fill-slate-200 dark:fill-slate-800"
                            />
                          ) : (
                            <>
                              {slices.map((slice) => {
                                const isDimmed =
                                  hoveredComposition !== null && hoveredComposition !== slice.key;
                                return (
                                  <g
                                    key={slice.key}
                                    className={`transition-opacity duration-150 cursor-pointer ${
                                      isDimmed ? 'opacity-40' : 'opacity-100'
                                    }`}
                                    onMouseEnter={() => setHoveredComposition(slice.key)}
                                  >
                                    {slice.isFullCircle ? (
                                      <circle
                                        cx={cx}
                                        cy={cy}
                                        r={r}
                                        fill={slice.color}
                                        className="stroke-white dark:stroke-slate-900"
                                        strokeWidth="2"
                                      >
                                        <title>{`${slice.label}: ${formatCurrency(slice.amount, currency)} (${slice.pct}%)`}</title>
                                      </circle>
                                    ) : (
                                      <path
                                        d={slice.pathD}
                                        fill={slice.color}
                                        className="stroke-white dark:stroke-slate-900"
                                        strokeWidth="2"
                                        strokeLinejoin="round"
                                      >
                                        <title>{`${slice.label}: ${formatCurrency(slice.amount, currency)} (${slice.pct}%)`}</title>
                                      </path>
                                    )}
                                    {slice.labelCfg && (
                                      <g clipPath={`url(#${slice.clipId})`} className="pointer-events-none select-none">
                                        <text
                                          x={slice.labelCfg.x}
                                          y={slice.labelCfg.y}
                                          transform={
                                            slice.labelCfg.rotate !== 0
                                              ? `rotate(${slice.labelCfg.rotate.toFixed(2)} ${slice.labelCfg.x.toFixed(2)} ${slice.labelCfg.y.toFixed(2)})`
                                              : undefined
                                          }
                                          textAnchor="middle"
                                          dominantBaseline="central"
                                          fill="#ffffff"
                                          fontSize={slice.labelCfg.fontSize}
                                          fontWeight="800"
                                          style={{
                                            paintOrder: 'stroke',
                                            stroke: 'rgba(15, 23, 42, 0.55)',
                                            strokeWidth: '2.5px',
                                            strokeLinejoin: 'round',
                                          }}
                                        >
                                          {(() => {
                                            const totalLines = slice.labelCfg.lines.length;
                                            const lineStep = slice.labelCfg.fontSize * 1.15;
                                            const startOffset = -((totalLines - 1) * lineStep) / 2;
                                            return slice.labelCfg.lines.map((line, idx) => (
                                              <tspan
                                                key={idx}
                                                x={slice.labelCfg!.x}
                                                y={slice.labelCfg!.y + startOffset + idx * lineStep}
                                              >
                                                {line}
                                              </tspan>
                                            ));
                                          })()}
                                        </text>
                                      </g>
                                    )}
                                  </g>
                                );
                              })}

                              {callouts.map((c) => {
                                const isDimmed =
                                  hoveredComposition !== null && hoveredComposition !== c.key;
                                const lineStep = 10.5;
                                const startOffset = -((c.lines.length - 1) * lineStep) / 2;
                                const textX = c.isRight ? c.lx + 4.5 : c.lx - 4.5;
                                const arrowPoints = c.isRight
                                  ? `${c.lx},${c.ly} ${c.arrowBaseX},${c.ly - 3} ${c.arrowBaseX},${c.ly + 3}`
                                  : `${c.lx},${c.ly} ${c.arrowBaseX},${c.ly - 3} ${c.arrowBaseX},${c.ly + 3}`;
                                return (
                                  <g
                                    key={`callout-${c.key}`}
                                    className={`transition-opacity duration-150 cursor-pointer ${
                                      isDimmed ? 'opacity-35' : 'opacity-100'
                                    }`}
                                    onMouseEnter={() => setHoveredComposition(c.key)}
                                  >
                                    <circle cx={c.ax} cy={c.ay} r="2.5" fill={c.color} />
                                    <polyline
                                      points={`${c.ax.toFixed(1)},${c.ay.toFixed(1)} ${c.ex.toFixed(1)},${c.ey.toFixed(1)} ${c.arrowBaseX.toFixed(1)},${c.ly.toFixed(1)}`}
                                      fill="none"
                                      stroke={c.color}
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                    <polygon points={arrowPoints} fill={c.color} />
                                    <text
                                      x={textX}
                                      y={c.ly}
                                      textAnchor={c.isRight ? 'start' : 'end'}
                                      dominantBaseline="central"
                                      fontSize="9.5"
                                      fontWeight="700"
                                      className="fill-slate-700 dark:fill-slate-200 select-none"
                                    >
                                      {c.lines.map((line, idx) => (
                                        <tspan
                                          key={idx}
                                          x={textX}
                                          y={c.ly + startOffset + idx * lineStep}
                                        >
                                          {line}
                                        </tspan>
                                      ))}
                                    </text>
                                  </g>
                                );
                              })}
                            </>
                          )}
                        </svg>
                      </div>

                      {/* Descripciones de los conceptos a la derecha */}
                      <div
                        className="flex-1 w-full space-y-2 min-w-0"
                        onMouseLeave={() => setHoveredComposition(null)}
                      >
                        {pieItems.map((item) => {
                          const isHighlighted = hoveredComposition === item.key;
                          return (
                            <div
                              key={item.key}
                              onMouseEnter={() => setHoveredComposition(item.key)}
                              className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors duration-150 cursor-pointer ${
                                isHighlighted
                                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/80'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className="w-3 h-3 rounded-full shrink-0"
                                  style={{ backgroundColor: item.color }}
                                />
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                                  {item.label}
                                </span>
                              </div>
                              <div className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                  {formatCurrency(item.amount, currency)}
                                </span>
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                  ({item.pct}%)
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
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
                      {t.simulatorTitle}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t.simulatorSubtitle}
                    </p>
                  </div>
                </div>

                {/* Scenario 1: Reducción de fijos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      {t.simulateFixedCut}
                    </label>
                    <span className="font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                      {formatCurrency(effectiveSimSavingReduction, currency)}/{t.perMonthUnit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={fixedSliderMax}
                    step={fixedSliderStep}
                    disabled={fixedSliderMax <= 0}
                    value={effectiveSimSavingReduction}
                    onChange={(e) => setSimSavingReduction(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-2 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  />
                  <div className="flex items-center justify-between text-2xs text-slate-400 dark:text-slate-500">
                    <span>{formatCurrency(0, currency)}</span>
                    <span>{t.moderateCut}</span>
                    <span>{formatCurrency(fixedSliderMax, currency)}</span>
                  </div>
                </div>

                {/* Scenario 2: Ingresos extra */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-700 dark:text-slate-300">
                      {t.simulateIncomeBoost}
                    </label>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      +{formatCurrency(effectiveSimIncomeBoost, currency)}/{t.perMonthUnit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={incomeBoostMax}
                    step={incomeBoostStep}
                    value={effectiveSimIncomeBoost}
                    onChange={(e) => setSimIncomeBoost(Number(e.target.value))}
                    className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  />
                  <div className="flex items-center justify-between text-2xs text-slate-400 dark:text-slate-500">
                    <span>{formatCurrency(0, currency)}</span>
                    <span>+{formatCurrency(Math.round(incomeBoostMax / 2), currency)}</span>
                    <span>+{formatCurrency(incomeBoostMax, currency)}</span>
                  </div>
                </div>

                {/* Simulation Result Card */}
                <div className="p-4 rounded-xl bg-linear-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-100 dark:border-indigo-900/60 space-y-3.5 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-2 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200 text-center">
                      <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="text-center">{t.simResultTitle}</span>
                    </div>
                    {effectiveSimIncomeBoost > 0 && (
                      <span className="inline-flex items-center text-3xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shadow-2xs">
                        {t.simProjectedIncome}
                      </span>
                    )}
                  </div>

                  {/* Prioridad de impacto: 1º Gastos Fijos, 2º Gastos Variables, 3º Ahorro */}
                  <div className="space-y-1.5 text-center">
                    <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider text-slate-500 dark:text-slate-400 block text-center">
                      {t.simProjectedDistribution}
                    </span>
                    
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                      {/* 1º Gastos Fijos */}
                      <div className="p-2 sm:p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 flex flex-col justify-between items-center min-w-0 text-center">
                        <span className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-400 font-bold uppercase tracking-tight block leading-tight w-full text-center whitespace-normal" title={t.simPillarFixed}>
                          {t.simPillarFixed}
                        </span>
                        <span className="text-sm sm:text-base md:text-lg font-black text-blue-800 dark:text-blue-200 tabular-nums block my-0.5 leading-tight text-center">
                          {simFixedPct}%
                        </span>
                        <span className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 block tabular-nums leading-tight w-full text-center whitespace-normal break-all sm:break-normal" title={formatCurrency(simNewFixed, currency)}>
                          {formatCurrency(simNewFixed, currency)}
                        </span>
                      </div>

                      {/* 2º Gastos Variables */}
                      <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 flex flex-col justify-between items-center min-w-0 text-center">
                        <span className="text-[10px] sm:text-xs text-indigo-700 dark:text-indigo-400 font-bold uppercase tracking-tight block leading-tight w-full text-center whitespace-normal" title={t.simPillarVariable}>
                          {t.simPillarVariable}
                        </span>
                        <span className="text-sm sm:text-base md:text-lg font-black text-indigo-800 dark:text-indigo-200 tabular-nums block my-0.5 leading-tight text-center">
                          {simRemainingPct}%
                        </span>
                        <span className="text-[10px] sm:text-xs text-indigo-600 dark:text-indigo-400 block tabular-nums leading-tight w-full text-center whitespace-normal break-all sm:break-normal" title={formatCurrency(simNewRemaining, currency)}>
                          {formatCurrency(simNewRemaining, currency)}
                        </span>
                      </div>

                      {/* 3º Ahorro */}
                      <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 flex flex-col justify-between items-center min-w-0 text-center">
                        <span className="text-[10px] sm:text-xs text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-tight block leading-tight w-full text-center whitespace-normal" title={t.simPillarSavings}>
                          {t.simPillarSavings}
                        </span>
                        <span className="text-sm sm:text-base md:text-lg font-black text-emerald-800 dark:text-emerald-200 tabular-nums block my-0.5 leading-tight text-center">
                          {simSavingsPct}%
                        </span>
                        <span className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 block tabular-nums leading-tight w-full text-center whitespace-normal break-all sm:break-normal" title={formatCurrency(simNewSavings, currency)}>
                          {formatCurrency(simNewSavings, currency)}
                        </span>
                      </div>
                    </div>

                    {/* Barra visual de composición proyectada: 1º Fijo, 2º Variable, 3º Ahorro */}
                    {(() => {
                      const rawTotalPct = Number(simFixedPct) + Number(simRemainingPct) + Number(simSavingsPct);
                      const scale = rawTotalPct > 100 ? 100 / rawTotalPct : 1;
                      const barFixedW = Math.max(0, Number(simFixedPct) * scale);
                      const barRemainingW = Math.max(0, Number(simRemainingPct) * scale);
                      const barSavingsW = Math.max(0, Number(simSavingsPct) * scale);
                      return (
                        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 flex overflow-hidden shadow-2xs mt-2">
                          <div 
                            style={{ width: `${barFixedW}%` }} 
                            className="bg-blue-600 h-full"
                            title={`${t.tabFixed}: ${simFixedPct}%`}
                          />
                          <div 
                            style={{ width: `${barRemainingW}%` }} 
                            className="bg-indigo-500 h-full"
                            title={`${t.variableExpenses}: ${simRemainingPct}%`}
                          />
                          <div 
                            style={{ width: `${barSavingsW}%` }} 
                            className="bg-emerald-500 h-full"
                            title={`${t.savingsBarTitle}: ${simSavingsPct}%`}
                          />
                        </div>
                      );
                    })()}
                  </div>

                  <div className="pt-2 border-t border-indigo-100/60 dark:border-indigo-900/60 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs text-center">
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-indigo-100/80 dark:border-indigo-900/50 flex flex-col items-center justify-center text-center min-w-0 overflow-hidden shadow-2xs">
                      <span className="text-slate-500 dark:text-slate-400 block text-2xs uppercase tracking-wide font-medium leading-tight mb-1 text-center max-w-full break-words">
                        {t.newDailyBudget}
                      </span>
                      <span className="text-xs sm:text-sm md:text-base font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight text-center max-w-full break-words leading-tight">
                        {formatCurrency(simNewDailyBase, currency)}/{t.perDay}
                      </span>
                      <span className="text-3xs sm:text-2xs text-slate-500 dark:text-slate-400 font-semibold tabular-nums mt-0.5">
                        ({formatCurrency(simNewRemaining, currency)}/{t.perMonthUnit})
                      </span>
                    </div>

                    <div className="p-2 sm:p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-emerald-100/80 dark:border-emerald-900/50 flex flex-col items-center justify-center text-center min-w-0 overflow-hidden shadow-2xs">
                      <span className="text-slate-500 dark:text-slate-400 block text-2xs uppercase tracking-wide font-medium leading-tight mb-1 text-center max-w-full break-words">
                        {t.dailyGain}
                      </span>
                      <div className={`flex flex-col items-center justify-center text-center max-w-full overflow-hidden ${dailyGain > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                        <span className="text-xs sm:text-sm md:text-base font-extrabold tabular-nums tracking-tight break-words max-w-full leading-tight">
                          {dailyGain > 0 ? `+${formatCurrency(dailyGain, currency)}` : '-'}
                        </span>
                        {dailyGain > 0 && (
                          <span className="text-3xs sm:text-2xs font-bold opacity-80 whitespace-nowrap block mt-0.5 leading-tight">
                            /{t.perDay}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-indigo-800/80 dark:text-indigo-300 leading-relaxed pt-1.5 border-t border-indigo-100/60 dark:border-indigo-900/60 text-center">
                    {dailyGain > 0 ? (
                      <>{t.simExtraGainNote.replace('{amount}', formatCurrency(dailyGain * 7, currency))}</>
                    ) : (
                      <>{t.simExtraIncomeImpactNote.replace('{savings}', simSavingsPct).replace('{fixed}', simFixedPct).replace('{remaining}', simRemainingPct)}</>
                    )}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>{t.simRealtimeNote}</span>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
