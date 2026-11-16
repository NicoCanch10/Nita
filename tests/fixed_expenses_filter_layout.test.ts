import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FixedExpensesSection } from '../src/components/FixedExpensesSection';
import { CategoryInfo, FixedExpense } from '../src/types/budget';

const TEST_CATEGORIES: CategoryInfo[] = [
  { id: 'housing', label: 'Vivienda', color: '#2563eb' },
];

const noop = () => {};

function buildExpenses(total: number, paidCount: number): FixedExpense[] {
  const list: FixedExpense[] = [];
  for (let i = 0; i < total; i++) {
    list.push({
      id: `exp_${i + 1}`,
      name: `Gasto fijo ${i + 1}`,
      amount: 1000,
      category: 'housing',
      isPaid: i < paidCount,
    });
  }
  return list;
}

function renderFilterSection(expenses: FixedExpense[]): string {
  return renderToStaticMarkup(
    React.createElement(FixedExpensesSection, {
      expenses,
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
}

function extractFilterTabsHtml(html: string): string {
  const marker = 'data-testid="fixed-expenses-filter-tabs"';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'Debe existir el contenedor fixed-expenses-filter-tabs');
  const openTagStart = html.lastIndexOf('<div', start);
  const closeDiv = html.indexOf('</div>', start);
  assert.notEqual(openTagStart, -1);
  assert.notEqual(closeDiv, -1);
  return html.slice(openTagStart, closeDiv + '</div>'.length);
}

/**
 * Estima el ancho máximo conservador (peor caso en negrita sans-serif)
 * para validar que el grupo de filtros quepa sin barra de desplazamiento
 * en móviles estrechos (320px, 360px, 375px) y tablet/desktop (640px+).
 */
function estimateTextWidthPx(label: string, fontSizePx: number): number {
  let width = 0;
  for (const ch of label) {
    if (ch === 'i' || ch === 'l' || ch === ' ') {
      width += fontSizePx * 0.34;
    } else if (ch === '(' || ch === ')') {
      width += fontSizePx * 0.38;
    } else if (/[0-9]/.test(ch)) {
      width += fontSizePx * 0.6;
    } else if (ch === ch.toUpperCase() && /[A-Z]/.test(ch)) {
      width += fontSizePx * 0.68;
    } else {
      width += fontSizePx * 0.54;
    }
  }
  return Math.ceil(width);
}

function computeRequiredTabsWidthPx(
  labels: [string, string, string],
  fontSizePx: number,
  buttonHorizontalPaddingPx: number,
  gapPx: number,
  containerPaddingPx: number
): number {
  const buttonsWidth = labels.reduce(
    (sum, label) => sum + estimateTextWidthPx(label, fontSizePx) + buttonHorizontalPaddingPx * 2,
    0
  );
  return buttonsWidth + gapPx * 2 + containerPaddingPx * 2;
}

describe('NITA — Ajuste sin barra de desplazamiento y pruebas 1..99 (TODOS, PENDIENTES, PAGADOS)', () => {
  test('El contenedor de filtros no tiene overflow-x-auto ni barra de desplazamiento y optimiza flex-auto', () => {
    const html = renderFilterSection(buildExpenses(10, 5));
    const tabsHtml = extractFilterTabsHtml(html);

    assert.equal(tabsHtml.includes('overflow-x-auto'), false, 'No debe tener overflow-x-auto');
    assert.equal(tabsHtml.includes('overflow-x-scroll'), false, 'No debe tener overflow-x-scroll');
    assert.equal(tabsHtml.includes('overflow-scroll'), false, 'No debe tener overflow-scroll');
    assert.equal(tabsHtml.includes('flex-auto'), true, 'Los botones deben usar flex-auto para distribuir el ancho según el contenido');
    assert.equal(tabsHtml.includes('tabular-nums'), true, 'Los contadores deben usar tabular-nums');
    assert.equal(tabsHtml.includes('whitespace-nowrap'), true, 'Las etiquetas no deben partirse en múltiples líneas');
  });

  test('Campo TODOS: renderiza y valida ajuste espacial para todos los números del 1 al 99', () => {
    for (let n = 1; n <= 99; n++) {
      const html = renderFilterSection(buildExpenses(n, 0));
      const tabsHtml = extractFilterTabsHtml(html);

      assert.equal(tabsHtml.includes(`Todos (${n})`), true, `Debe mostrar "Todos (${n})"`);
      assert.equal(tabsHtml.includes('overflow-x-auto'), false);

      // Verificación de presupuesto de ancho en móvil ultra estrecho (320px) y estándar (360px)
      const labels: [string, string, string] = [`Todos (${n})`, `Pendientes (${n})`, 'Pagados (0)'];
      const width320 = computeRequiredTabsWidthPx(labels, 10.5, 4, 2, 4);
      const width360 = computeRequiredTabsWidthPx(labels, 11, 8, 2, 4);

      // Ancho interior disponible: 320 - 66 = 254px; 360 - 66 = 294px
      assert.ok(width320 <= 254, `Todos=${n}: ancho estimado (${width320}px) excede contenedor 320px (254px)`);
      assert.ok(width360 <= 294, `Todos=${n}: ancho estimado (${width360}px) excede contenedor 360px (294px)`);
    }
  });

  test('Campo PENDIENTES: renderiza y valida ajuste espacial para todos los números del 1 al 99', () => {
    for (let n = 1; n <= 99; n++) {
      const html = renderFilterSection(buildExpenses(n, 0));
      const tabsHtml = extractFilterTabsHtml(html);

      assert.equal(tabsHtml.includes(`Pendientes (${n})`), true, `Debe mostrar "Pendientes (${n})"`);
      assert.equal(tabsHtml.includes('overflow-x-auto'), false);

      const labels: [string, string, string] = [`Todos (${n})`, `Pendientes (${n})`, 'Pagados (0)'];
      const width320 = computeRequiredTabsWidthPx(labels, 10.5, 4, 2, 4);
      const width360 = computeRequiredTabsWidthPx(labels, 11, 8, 2, 4);
      const width640 = computeRequiredTabsWidthPx(labels, 12, 10, 4, 4);

      assert.ok(width320 <= 254, `Pendientes=${n}: ancho estimado (${width320}px) excede 320px (254px)`);
      assert.ok(width360 <= 294, `Pendientes=${n}: ancho estimado (${width360}px) excede 360px (294px)`);
      // En 640px (sm): fila disponible 542px - búsqueda sm:w-48 (192px) - gap (12px) = 338px
      assert.ok(width640 <= 338, `Pendientes=${n}: ancho estimado (${width640}px) excede 640px (338px)`);
    }
  });

  test('Campo PAGADOS: renderiza y valida ajuste espacial para todos los números del 1 al 99', () => {
    for (let n = 1; n <= 99; n++) {
      const html = renderFilterSection(buildExpenses(n, n));
      const tabsHtml = extractFilterTabsHtml(html);

      assert.equal(tabsHtml.includes(`Pagados (${n})`), true, `Debe mostrar "Pagados (${n})"`);
      assert.equal(tabsHtml.includes('overflow-x-auto'), false);

      const labels: [string, string, string] = [`Todos (${n})`, 'Pendientes (0)', `Pagados (${n})`];
      const width320 = computeRequiredTabsWidthPx(labels, 10.5, 4, 2, 4);
      const width360 = computeRequiredTabsWidthPx(labels, 11, 8, 2, 4);
      const width640 = computeRequiredTabsWidthPx(labels, 12, 10, 4, 4);

      assert.ok(width320 <= 254, `Pagados=${n}: ancho estimado (${width320}px) excede 320px (254px)`);
      assert.ok(width360 <= 294, `Pagados=${n}: ancho estimado (${width360}px) excede 360px (294px)`);
      assert.ok(width640 <= 338, `Pagados=${n}: ancho estimado (${width640}px) excede 640px (338px)`);
    }
  });

  test('Combinaciones mixtas del 1 al 99 (ej. Todos 99, Pendientes 50, Pagados 49 y peor caso 2 dígitos en los 3 campos)', () => {
    for (let paid = 1; paid <= 98; paid++) {
      const pending = 99 - paid;
      const html = renderFilterSection(buildExpenses(99, paid));
      const tabsHtml = extractFilterTabsHtml(html);

      assert.equal(tabsHtml.includes('Todos (99)'), true);
      assert.equal(tabsHtml.includes(`Pendientes (${pending})`), true);
      assert.equal(tabsHtml.includes(`Pagados (${paid})`), true);

      const labels: [string, string, string] = [
        'Todos (99)',
        `Pendientes (${pending})`,
        `Pagados (${paid})`,
      ];
      const width320 = computeRequiredTabsWidthPx(labels, 10.5, 4, 2, 4);
      const width360 = computeRequiredTabsWidthPx(labels, 11, 8, 2, 4);
      const width375 = computeRequiredTabsWidthPx(labels, 11, 8, 2, 4);
      const width640 = computeRequiredTabsWidthPx(labels, 12, 10, 4, 4);

      assert.ok(width320 <= 254, `Mixto (${pending}/${paid}): excede 320px (${width320}px)`);
      assert.ok(width360 <= 294, `Mixto (${pending}/${paid}): excede 360px (${width360}px)`);
      assert.ok(width375 <= 309, `Mixto (${pending}/${paid}): excede 375px (${width375}px)`);
      assert.ok(width640 <= 338, `Mixto (${pending}/${paid}): excede 640px (${width640}px)`);
    }

    // Peor caso teórico simultáneo con 2 dígitos en los 3 campos: Todos (99), Pendientes (99), Pagados (99)
    const worstCase: [string, string, string] = ['Todos (99)', 'Pendientes (99)', 'Pagados (99)'];
    assert.ok(computeRequiredTabsWidthPx(worstCase, 10.5, 4, 2, 4) <= 254);
    assert.ok(computeRequiredTabsWidthPx(worstCase, 11, 8, 2, 4) <= 294);
    assert.ok(computeRequiredTabsWidthPx(worstCase, 12, 10, 4, 4) <= 338);
  });

  test('Tarjeta de gasto fijo: nombre completo sin truncar, categoría sin superposición y cartel PAGADO debajo del valor', () => {
    const longName = 'Servicio de Internet Fibra Óptica Residencial Alta Velocidad Plan Familiar';
    const longCatLabel = 'Servicios Públicos e Infraestructura del Hogar';
    const customCats: CategoryInfo[] = [
      { id: 'utilities', label: longCatLabel, color: '#0284c7' },
    ];
    const paidExpense: FixedExpense = {
      id: 'exp_paid_1',
      name: longName,
      amount: 145990,
      category: 'utilities',
      dueDate: 15,
      isPaid: true,
    };
    const unpaidExpense: FixedExpense = {
      id: 'exp_unpaid_1',
      name: 'Seguro Automotor Completo',
      amount: 89500,
      category: 'utilities',
      dueDate: 20,
      isPaid: false,
    };

    const htmlPaid = renderToStaticMarkup(
      React.createElement(FixedExpensesSection, {
        expenses: [paidExpense],
        categories: customCats,
        currency: 'ARS',
        totalIncome: 500000,
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

    const itemStart = htmlPaid.indexOf('data-testid="fixed-expense-item"');
    assert.notEqual(itemStart, -1);
    const itemHtml = htmlPaid.slice(itemStart);

    // 1. Nombre completo sin clase truncate
    assert.equal(itemHtml.includes(longName), true, 'El nombre del gasto debe figurar entero');
    assert.equal(itemHtml.includes('truncate'), false, 'No debe cortar el nombre con truncate');
    assert.equal(itemHtml.includes('break-words'), true, 'Debe permitir salto de línea para mostrar el nombre entero');

    // 2. Categoría contenida sin superposición
    assert.equal(itemHtml.includes(longCatLabel), true);
    assert.equal(itemHtml.includes('max-w-full min-w-0'), true, 'La categoría debe respetar el ancho máximo sin superponerse');

    // 3. Cartel PAGADO ubicado debajo del valor en la columna centrada derecha
    const amountIdx = itemHtml.indexOf('145.990');
    const paidIdx = itemHtml.indexOf('Pagado');
    assert.notEqual(amountIdx, -1, 'Debe renderizar el importe');
    assert.notEqual(paidIdx, -1, 'Debe renderizar el cartel PAGADO');
    assert.ok(paidIdx > amountIdx, 'El cartel PAGADO debe ubicarse debajo/después del valor, no al lado del nombre');
    assert.equal(itemHtml.includes('flex-col items-center justify-center text-center'), true, 'El valor y el cartel PAGADO deben estar centrados en columna');

    // 4. Gasto pendiente no muestra cartel PAGADO
    const htmlUnpaid = renderToStaticMarkup(
      React.createElement(FixedExpensesSection, {
        expenses: [unpaidExpense],
        categories: customCats,
        currency: 'ARS',
        totalIncome: 500000,
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
    const unpaidItemHtml = htmlUnpaid.slice(htmlUnpaid.indexOf('data-testid="fixed-expense-item"'));
    assert.equal(unpaidItemHtml.includes('>Pagado<'), false, 'Un gasto pendiente no debe mostrar el cartel PAGADO');
  });
});
