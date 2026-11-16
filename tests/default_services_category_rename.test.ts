import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
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
  DEFAULT_CATEGORIES,
  getCategoryInfo,
  normalizeDefaultCategoryLabel,
} from '../src/utils/currency';
import {
  loadBudgetState,
  loadGlobalCategories,
  resolveStorageKeys,
} from '../src/utils/storage';
import {
  cleanCategory,
  parseCategories,
  handleGlobalCategoriesSnapshot,
} from '../src/services/budgetSyncService';
import { FixedExpensesSection } from '../src/components/FixedExpensesSection';
import { CategoryInfo, FixedExpense } from '../src/types/budget';

const noop = () => {};

describe('NITA — Renombrado de categoría Servicios y replicación en gastos cargados', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  test('1. La categoría predeterminada "services" se llama "Servicios"', () => {
    const services = DEFAULT_CATEGORIES.find((c) => c.id === 'services');
    assert.ok(services);
    assert.equal(services.label, 'Servicios');
  });

  test('2. getCategoryInfo normaliza el nombre antiguo "Servicios (Luz, Gas, Agua)" a "Servicios"', () => {
    const legacyCats: CategoryInfo[] = [
      { id: 'services', label: 'Servicios (Luz, Gas, Agua)', color: '#0284c7' },
    ];
    const resolved = getCategoryInfo('services', legacyCats, 'es');
    assert.equal(resolved.label, 'Servicios');

    // Preserva nombres personalizados manualmente por el usuario
    const customRenamed: CategoryInfo[] = [
      { id: 'services', label: 'Mis Servicios Casa', color: '#0284c7' },
    ];
    assert.equal(getCategoryInfo('services', customRenamed, 'es').label, 'Mis Servicios Casa');
  });

  test('3. loadGlobalCategories y loadBudgetState replican "Servicios" en meses y gastos ya cargados en localStorage', () => {
    const uid = 'uid_servicios_test';
    const { dataKey, categoriesKey } = resolveStorageKeys(uid, false);
    assert.ok(dataKey && categoriesKey);

    const legacyCategories: CategoryInfo[] = [
      { id: 'housing', label: 'Vivienda y Alquiler', color: '#4f46e5' },
      { id: 'services', label: 'Servicios (Luz, Gas, Agua)', color: '#0284c7' },
    ];
    localStorage.setItem(categoriesKey!, JSON.stringify(legacyCategories));
    localStorage.setItem(
      dataKey!,
      JSON.stringify({
        month: 10,
        year: 2026,
        currency: 'ARS',
        monthsData: {
          '2026-10': {
            income: 500000,
            savingsRate: 10,
            extraDaysPosition: 'end',
            categories: legacyCategories,
            fixedExpenses: [
              { id: 'fx_1', name: 'Luz Edesur', amount: 25000, category: 'services', isPaid: true },
            ],
            variableExpenses: [
              { id: 'vx_1', description: 'Garrafa', amount: 12000, category: 'services', date: '2026-10-05' },
            ],
          },
        },
      })
    );

    const loadedGlobal = loadGlobalCategories(uid, false);
    assert.equal(loadedGlobal.find((c) => c.id === 'services')?.label, 'Servicios');

    const loadedBudget = loadBudgetState(uid, false);
    const monthServices = loadedBudget.monthsData['2026-10'].categories.find((c) => c.id === 'services');
    assert.equal(monthServices?.label, 'Servicios');
    assert.equal(loadedBudget.monthsData['2026-10'].fixedExpenses[0].category, 'services');
  });

  test('4. parseCategories, cleanCategory y handleGlobalCategoriesSnapshot normalizan snapshots de Firestore', () => {
    const legacy = { id: 'services', label: 'Servicios (Luz, Gas, Agua)', color: '#0284c7' };
    assert.equal(normalizeDefaultCategoryLabel(legacy).label, 'Servicios');
    assert.equal(cleanCategory(legacy).label, 'Servicios');
    assert.equal(parseCategories([legacy])[0].label, 'Servicios');

    let received: CategoryInfo[] = [];
    handleGlobalCategoriesSnapshot(
      {
        exists: () => true,
        data: () => ({ categories: [legacy] }),
        metadata: { fromCache: false },
      },
      (cats) => {
        received = cats;
      }
    );
    assert.equal(received[0].label, 'Servicios');
  });

  test('5. El selector de categorías y las tarjetas con gastos ya cargados muestran "Servicios"', () => {
    const legacyCats: CategoryInfo[] = [
      { id: 'services', label: 'Servicios (Luz, Gas, Agua)', color: '#0284c7' },
    ];
    const expenses: FixedExpense[] = [
      { id: 'fx_luz', name: 'Factura de Luz', amount: 30000, category: 'services', isPaid: false },
    ];

    const html = renderToStaticMarkup(
      React.createElement(FixedExpensesSection, {
        expenses,
        categories: legacyCats,
        currency: 'ARS',
        totalIncome: 200000,
        onAddExpense: noop,
        onDeleteExpense: noop,
        onTogglePaid: noop,
        onUpdateExpense: noop,
        onAddCategory: noop,
        onUpdateCategoryColor: noop,
        onDeleteCategory: noop,
        language: 'es',
        daysInMonth: 30,
      })
    );

    assert.equal(html.includes('Servicios (Luz, Gas, Agua)'), false, 'No debe seguir mostrando el nombre antiguo');
    assert.equal(html.includes('>Servicios <') || html.includes('>Servicios</option>') || html.includes('Servicios'), true);
    assert.equal(html.includes('<option value="services"'), true);
  });
});
