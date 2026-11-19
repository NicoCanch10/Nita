import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FixedExpensesSection } from '../src/components/FixedExpensesSection';
import { DailyExpensesSection } from '../src/components/DailyExpensesSection';
import { CategoryInfo } from '../src/types/budget';
import {
  parseAmountInput,
  formatAmountForInput,
  formatAmountInputValue,
  computeFormattedCaretIndex,
} from '../src/utils/currency';

const TEST_CATEGORIES: CategoryInfo[] = [
  { id: 'housing', label: 'Vivienda', color: '#2563eb' },
  { id: 'food', label: 'Alimentación', color: '#10b981' },
  { id: 'custom_gym', label: 'Gimnasio', color: '#8b5cf6', isCustom: true },
];

const noop = () => {};

describe('NITA — Simplificación de botones CARGAR + y modal de carga en Gastos Fijos y Variables', () => {
  test('1. FixedExpensesSection reemplaza la barra de carga inline por un único botón "CARGAR +" y no renderiza el formulario por defecto', () => {
    const html = renderToStaticMarkup(
      React.createElement(FixedExpensesSection, {
        expenses: [],
        categories: TEST_CATEGORIES,
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
        daysInMonth: 30,
      })
    );

    assert.equal(html.includes('data-testid="fixed-expenses-add-trigger"'), true);
    assert.equal(html.includes('>CARGAR +<'), true);
    assert.equal(html.includes('>Agregar<'), false, 'No debe mostrar el botón antiguo "Agregar"');
    assert.equal(html.includes('aria-label="Cargar Gasto Fijo"'), false, 'El modal de carga debe permanecer cerrado inicialmente');
    assert.equal(html.includes('<form'), false, 'No debe renderizar formulario inline permanente');
  });

  test('2. FixedExpensesSection al abrir el modal "Cargar Gasto Fijo" conserva todos los campos originales', () => {
    const html = renderToStaticMarkup(
      React.createElement(FixedExpensesSection, {
        expenses: [],
        categories: TEST_CATEGORIES,
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
        daysInMonth: 30,
        initialAddModalOpen: true,
      })
    );

    assert.equal(html.includes('role="dialog"'), true);
    assert.equal(html.includes('aria-label="Cargar Gasto Fijo"'), true);
    assert.equal(html.includes('Concepto'), true);
    assert.equal(html.includes('Importe (ARS)'), true);
    assert.equal(html.includes('inputMode="decimal"'), true);
    assert.equal(html.includes('>$<'), true);
    assert.equal(html.includes('placeholder="0,00"'), true);
    assert.equal(html.includes('Categoría'), true);
    assert.equal(html.includes('<option value="housing"'), true);
    assert.equal(html.includes('<option value="custom_gym"'), true);
    assert.equal(html.includes('(Personalizada)'), true);
    assert.equal(html.includes('Vto (1-30)'), true);
    assert.equal(html.includes('max="30"'), true);
    assert.equal(html.includes('Cancelar'), true);
    assert.equal(html.includes('Cargar Gasto'), true);
  });

  test('3. DailyExpensesSection reemplaza la barra de carga inline por un único botón "CARGAR +" y no renderiza el formulario por defecto', () => {
    const html = renderToStaticMarkup(
      React.createElement(DailyExpensesSection, {
        expenses: [],
        categories: TEST_CATEGORIES,
        currency: 'ARS',
        month: 9,
        year: 2026,
        dailyBudget: 5000,
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

    assert.equal(html.includes('data-testid="daily-expenses-add-trigger"'), true);
    assert.equal(html.includes('>CARGAR +<'), true);
    assert.equal(html.includes('>Agregar<'), false, 'No debe mostrar el botón antiguo "Agregar"');
    assert.equal(html.includes('aria-label="Cargar Gasto Variable"'), false, 'El modal de carga debe permanecer cerrado inicialmente');
    assert.equal(html.includes('<form'), false, 'No debe renderizar formulario inline permanente');
  });

  test('4. DailyExpensesSection al abrir el modal "Cargar Gasto Variable" conserva todos los campos originales', () => {
    const html = renderToStaticMarkup(
      React.createElement(DailyExpensesSection, {
        expenses: [],
        categories: TEST_CATEGORIES,
        currency: 'ARS',
        month: 9,
        year: 2026,
        dailyBudget: 5000,
        daysInMonth: 31,
        language: 'es',
        onAddExpense: noop,
        onDeleteExpense: noop,
        onUpdateExpense: noop,
        onAddCategory: noop,
        onUpdateCategoryColor: noop,
        onDeleteCategory: noop,
        initialAddModalOpen: true,
      })
    );

    assert.equal(html.includes('role="dialog"'), true);
    assert.equal(html.includes('aria-label="Cargar Gasto Variable"'), true);
    assert.equal(html.includes('Descripción'), true);
    assert.equal(html.includes('Importe (ARS)'), true);
    assert.equal(html.includes('inputMode="decimal"'), true);
    assert.equal(html.includes('>$<'), true);
    assert.equal(html.includes('placeholder="0,00"'), true);
    assert.equal(html.includes('Categoría'), true);
    assert.equal(html.includes('<option value="food"'), true);
    assert.equal(html.includes('<option value="custom_gym"'), true);
    assert.equal(html.includes('(Personalizada)'), true);
    assert.equal(html.includes('Fecha'), true);
    assert.equal(html.includes('type="date"'), true);
    assert.equal(html.includes('min="2026-10-01"'), true);
    assert.equal(html.includes('max="2026-10-31"'), true);
    assert.equal(html.includes('Cancelar'), true);
    assert.equal(html.includes('Cargar Gasto'), true);
  });

  test('5. Formateo y parseo de separadores de miles y decimales en inputs de dinero (ej: 1.000 / 10.325,24)', () => {
    // Escritura paso a paso hasta 1.000
    let val = '';
    for (const ch of ['1', '0', '0', '0']) {
      val = formatAmountInputValue(val + ch, val);
    }
    assert.equal(val, '1.000');
    assert.equal(parseAmountInput(val), 1000);

    // Escritura paso a paso de 10.325,24
    val = '';
    for (const ch of ['1', '0', '3', '2', '5', ',', '2', '4']) {
      val = formatAmountInputValue(val + ch, val);
    }
    assert.equal(val, '10.325,24');
    assert.equal(parseAmountInput(val), 10325.24);

    // Millones y coma inicial
    assert.equal(formatAmountInputValue('1000000', '100.000'), '1.000.000');
    assert.equal(formatAmountInputValue(',', ''), '0,');
    assert.equal(formatAmountInputValue('10.325,249', '10.325,24'), '10.325,24');

    // Pegado desde formato US o con símbolo de moneda
    assert.equal(formatAmountInputValue('10325.24', ''), '10.325,24');
    assert.equal(formatAmountInputValue('$10.325,24', ''), '10.325,24');
    assert.equal(parseAmountInput('$10.325,24'), 10325.24);
    assert.equal(parseAmountInput('$1.000'), 1000);

    // Inicialización para edición
    assert.equal(formatAmountForInput(1000), '1.000');
    assert.equal(formatAmountForInput(10325.24), '10.325,24');
    assert.equal(formatAmountForInput(10325.2), '10.325,20');
    assert.equal(formatAmountForInput(0), '');
    assert.equal(formatAmountForInput(0, true), '0');

    // Preservación de cursor al insertar un dígito en el medio ("1.0|00" + "5" -> "1.0500" -> "10.5|00")
    const caret = computeFormattedCaretIndex('1.0500', 4, '10.500');
    assert.equal(caret, 4);
  });
});
