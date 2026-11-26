import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockStorage = new Map<string, string>();
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (key: string) => (mockStorage.has(key) ? mockStorage.get(key)! : null),
  setItem: (key: string, value: string) => {
    mockStorage.set(key, String(value));
  },
  removeItem: (key: string) => {
    mockStorage.delete(key);
  },
  clear: () => {
    mockStorage.clear();
  },
};

import {
  calculateFiveJars,
  recalculateMonthFixedExpensesWithJarProtection,
} from '../src/utils/calendar';
import {
  buildCSVContent,
  escapeCsvCell,
  createFreshMonthData,
} from '../src/utils/storage';
import { DEFAULT_CATEGORIES, formatCurrency } from '../src/utils/currency';
import { getTranslations } from '../src/utils/languages';
import { AuthProvider } from '../src/context/AuthContext';
import { SettingsMenu } from '../src/components/SettingsMenu';
import { FiveJarsSection } from '../src/components/FiveJarsSection';
import { FinancialHealthSection } from '../src/components/FinancialHealthSection';
import { DailyExpensesSection } from '../src/components/DailyExpensesSection';
import { FixedExpensesSection } from '../src/components/FixedExpensesSection';
import { CategoryInfo, FixedExpense, VariableExpense } from '../src/types/budget';

const noop = () => {};

function approxEqual(actual: number, expected: number, msg?: string) {
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${msg ? `${msg}: ` : ''}expected ${expected}, got ${actual}`
  );
}

describe('NITA — Auditoría Severidad Media: Regresiones y Soluciones', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  test('1. Agregar o eliminar un gasto fijo a mitad de mes congela frascos pasados igual que editar', () => {
    const year = 2026;
    const month = 10; // Noviembre (30 días, 2 extras)
    const income = 400000;
    const savingsRate = 0;
    const initialFixed: FixedExpense[] = [
      { id: 'f1', name: 'Alquiler', amount: 100000, category: 'housing', isPaid: true },
    ];
    // Remaining inicial = 300.000 => Semana 1 = 70.000

    // Agregar un gasto fijo de 23.000 el día 12
    const afterAddFixed: FixedExpense[] = [
      ...initialFixed,
      { id: 'f2', name: 'Internet', amount: 23000, category: 'services', isPaid: false },
    ];
    const adjAfterAdd = recalculateMonthFixedExpensesWithJarProtection({
      year,
      month,
      income,
      savingsRate,
      previousFixedExpenses: initialFixed,
      nextFixedExpenses: afterAddFixed,
      extraDaysPosition: 'end',
      currentJarAdjustments: undefined,
      referenceDay: 12,
    });

    const jarsAfterAdd = calculateFiveJars(year, month, 277000, 'remaining', [], 'end', undefined, adjAfterAdd);
    approxEqual(jarsAfterAdd.jars.find(j => j.number === 2)!.amount, 70000, 'Semana 1 pasada congelada al agregar gasto fijo');
    approxEqual(jarsAfterAdd.jars.find(j => j.number === 3)!.amount, 63000, 'Semana 2 presente absorbe descuento');

    // Eliminar ese gasto fijo el mismo día revierte los frascos exactamente a 70.000 sin offsets residuales
    const adjAfterDelete = recalculateMonthFixedExpensesWithJarProtection({
      year,
      month,
      income,
      savingsRate,
      previousFixedExpenses: afterAddFixed,
      nextFixedExpenses: initialFixed,
      extraDaysPosition: 'end',
      currentJarAdjustments: adjAfterAdd,
      referenceDay: 12,
    });
    assert.equal(adjAfterDelete, undefined, 'Eliminar el gasto fijo agregado debe limpiar los offsets');
    const jarsRestored = calculateFiveJars(year, month, 300000, 'remaining', [], 'end', undefined, adjAfterDelete);
    approxEqual(jarsRestored.jars.find(j => j.number === 2)!.amount, 70000);
    approxEqual(jarsRestored.jars.find(j => j.number === 1)!.amount, 20000);
  });

  test('2. CSV export incluye BOM UTF-8, escapado RFC-4180, protección anti-fórmulas, % ahorro y etiquetas legibles de categoría', () => {
    assert.equal(escapeCsvCell('=CMD("calc")'), `"'=CMD(""calc"")"`);
    assert.equal(escapeCsvCell('+1000'), `"'+1000"`);
    assert.equal(escapeCsvCell(-250.5), '-250.5');
    assert.equal(escapeCsvCell('Alquiler, "centro"'), `"Alquiler, ""centro"""`);

    const monthData = createFreshMonthData([
      ...DEFAULT_CATEGORIES,
      { id: 'cat_custom_1', label: 'Mascotas, Veterinaria', color: '#10b981' },
    ]);
    monthData.income = 500000;
    monthData.savingsRate = 15;
    monthData.fixedExpenses = [
      { id: 'f1', name: '=Peligro, "Cuota"', amount: 100000, category: 'services', isPaid: true },
    ];
    monthData.variableExpenses = [
      { id: 'v1', description: 'Alimento perro', amount: 15000, category: 'cat_custom_1', date: '2026-10-08' },
    ];

    const csvEs = buildCSVContent(2026, 9, 'ARS', monthData, 'es');
    assert.ok(csvEs.startsWith('\uFEFF'), 'Debe comenzar con BOM UTF-8');
    assert.ok(csvEs.includes('"15%"'), 'Debe incluir porcentaje de ahorro en el resumen');
    assert.ok(csvEs.includes(`"'=Peligro, ""Cuota"""`), 'Debe neutralizar fórmulas y escapar comillas/comas');
    assert.ok(csvEs.includes(',"Servicios",'), 'Debe exportar el label legible "Servicios" en español');
    assert.ok(csvEs.includes(',100000,'), 'Debe exportar montos numéricos sin comillas para cálculo directo en hojas de cálculo');
    assert.ok(csvEs.includes(`"Mascotas, Veterinaria"`), 'Debe exportar el label de categoría personalizada');

    const csvEn = buildCSVContent(2026, 9, 'USD', monthData, 'en');
    assert.ok(csvEn.includes(',"Utilities (Electricity, Gas, Water)",'), 'Debe localizar etiquetas de categorías predeterminadas en inglés');
  });

  test('3. FiveJarsSection reemplaza todos los placeholders en carteles de redistribución de exceso (sin tokens crudos)', () => {
    const year = 2026;
    const month = 9; // Octubre (31 días, 3 extras)
    const variableExpenses: VariableExpense[] = [
      { id: 'v_over', description: 'Compra grande', amount: 80000, category: 'food', date: '2026-10-05' },
    ];
    const calc = calculateFiveJars(year, month, 310000, 'remaining', variableExpenses, 'end');
    // Semana 1 tiene 70.000 asignados y 80.000 gastados => exceso de 10.000

    for (const lang of ['es', 'en', 'pt', 'fr', 'it', 'de', 'ca']) {
      const html = renderToStaticMarkup(
        React.createElement(FiveJarsSection, {
          remainingJars: calc,
          currency: 'ARS',
          currentDay: 10,
          monthlyRemaining: 310000,
          extraDaysPosition: 'end',
          onExtraDaysPositionChange: noop,
          language: lang,
          year,
          month,
          onAdjustExceededJar: noop,
          onResetJarAdjustments: noop,
          hasActiveAdjustments: false,
        })
      );

      for (const rawToken of ['{jarTitle}', '{zero}', '{excess}', '{count}', '{list}', '{perJar}', '{monthYear}', '{jar}', '{diff}', '{jars}', '{deduction}', '{nextMonth}']) {
        assert.equal(html.includes(rawToken), false, `Placeholder sin reemplazar ${rawToken} encontrado en idioma ${lang}`);
      }
    }
  });

  test('4. SettingsMenu renderiza los botones de Exportar CSV y Restablecer mes a 0 cuando recibe onExport/onReset', () => {
    const tEs = getTranslations('es');
    const html = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(SettingsMenu, {
          currency: 'ARS',
          onCurrencyChange: noop,
          onExport: noop,
          onReset: noop,
          theme: 'light',
          onToggleTheme: noop,
          onOpenOnboarding: noop,
          language: 'es',
          initialOpen: true,
        })
      )
    );

    assert.ok(html.includes('data-testid="settings-export-csv-btn"'), 'Debe existir botón Exportar CSV en ajustes');
    assert.ok(html.includes('data-testid="settings-reset-month-btn"'), 'Debe existir botón Restablecer mes en ajustes');
    assert.ok(html.includes(tEs.exportCsvBtn), 'Debe mostrar texto traducido de Exportar CSV');
    assert.ok(html.includes(tEs.resetMonthBtn), 'Debe mostrar texto traducido de Restablecer mes');
  });

  test('5. FinancialHealthSection muestra unidad mensual en ingreso extra, presupuesto diario principal en newDailyBudget y escala USD coherente', () => {
    const tEs = getTranslations('es');
    const zeroUsd = formatCurrency(0, 'USD');
    const expectedDailyUsd = formatCurrency(2000 / 30, 'USD');
    const expectedMonthlyUsd = formatCurrency(2000, 'USD');

    const rawHtmlUsd = renderToStaticMarkup(
      React.createElement(FinancialHealthSection, {
        income: 4000,
        savingsRate: 20,
        fixedExpenses: [{ id: 'f1', name: 'Rent', amount: 1200, category: 'housing', isPaid: true }],
        variableExpenses: [{ id: 'v1', description: 'Market', amount: 250, category: 'food', date: '2026-10-04' }],
        categories: DEFAULT_CATEGORIES,
        currency: 'USD',
        daysInMonth: 30,
        exactWeeks: 4.2857,
        language: 'es',
        collapsible: false,
      })
    );
    const normalizedTextUsd = rawHtmlUsd.replace(/<!-- -->/g, '');

    // El boost mensual debe indicar /mes y NO /día
    assert.ok(normalizedTextUsd.includes(`+${zeroUsd}/${tEs.perMonthUnit}`), 'Ingreso extra simulado debe mostrarse por mes');
    assert.equal(normalizedTextUsd.includes(`+${zeroUsd}/${tEs.perDay}`), false, 'No debe mostrar /día en ingreso extra simulado');

    // newDailyBudget debe mostrar primero el presupuesto diario (2000 / 30 = $66.67/día) y debajo ($2,000.00/mes)
    assert.ok(normalizedTextUsd.includes(`${expectedDailyUsd}/${tEs.perDay}`), 'newDailyBudget debe mostrar presupuesto diario exacto');
    assert.ok(normalizedTextUsd.includes(`(${expectedMonthlyUsd}/${tEs.perMonthUnit})`), 'newDailyBudget debe mostrar equivalente mensual aclaratorio');

    // Para USD con ingreso 4000, el máximo del slider de ingreso extra no debe ser 500000 (ARS) ni iniciar recorte en 30000
    assert.equal(rawHtmlUsd.includes('max="500000"'), false, 'Slider USD no debe usar rango ARS 500000');
  });

  test('6. DailyExpensesSection y FixedExpensesSection manejan categorías eliminadas y fechas/montos corruptos sin romperse', () => {
    const customCatOnlyInList: CategoryInfo[] = [
      { id: 'housing', label: 'Vivienda y Alquiler', color: '#4f46e5' },
    ];
    const malformedVariables = [
      { id: 'v_bad', description: 'Sin fecha', amount: NaN as unknown as number, category: 'deleted_cat_id', date: '' },
      { id: 'v_ok', description: 'Café', amount: 2500, category: 'deleted_cat_id', date: '2026-10-12' },
    ] as VariableExpense[];

    const dailyHtml = renderToStaticMarkup(
      React.createElement(DailyExpensesSection, {
        expenses: malformedVariables,
        categories: customCatOnlyInList,
        currency: 'ARS',
        month: 9,
        year: 2026,
        dailyBudget: 10000,
        daysInMonth: 31,
        language: 'es',
        onAddExpense: noop,
        onDeleteExpense: noop,
        onUpdateExpense: noop,
        onAddCategory: noop,
        onUpdateCategoryColor: noop,
        onDeleteCategory: noop,
      })
    );
    assert.ok(dailyHtml.includes('Café'), 'Debe renderizar gastos diarios válidos aunque haya entradas sin fecha');

    const fixedHtml = renderToStaticMarkup(
      React.createElement(FixedExpensesSection, {
        expenses: [{ id: 'f_del', name: 'Seguro Viejo', amount: 15000, category: 'deleted_cat_id', isPaid: false }],
        categories: customCatOnlyInList,
        currency: 'ARS',
        totalIncome: 100000,
        onAddExpense: noop,
        onDeleteExpense: noop,
        onTogglePaid: noop,
        onUpdateExpense: noop,
        onAddCategory: noop,
        onUpdateCategoryColor: noop,
        onDeleteCategory: noop,
        language: 'es',
        daysInMonth: 31,
      })
    );
    assert.ok(fixedHtml.includes('Seguro Viejo'), 'Debe renderizar gasto fijo con categoría eliminada usando respaldo');
  });

  test('7. App.tsx no usa diálogos bloqueantes nativos window.confirm ni alert()', () => {
    const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    assert.equal(/\bwindow\.confirm\s*\(/.test(appSource), false, 'App.tsx no debe usar window.confirm()');
    assert.equal(/(?<![\w.])alert\s*\(/.test(appSource), false, 'App.tsx no debe usar alert() nativo');
    assert.ok(appSource.includes('recalculateMonthFixedExpensesWithJarProtection'), 'App.tsx debe usar helper unificado de protección de frascos');
  });
});
