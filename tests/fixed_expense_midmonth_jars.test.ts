import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFiveJars,
  calculateMidMonthFixedExpenseJarAdjustments,
  clearOverbudgetJarAdjustments,
  hasOverbudgetJarAdjustments,
} from '../src/utils/calendar.ts';

function approxEqual(actual: number, expected: number, msg?: string) {
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${msg ? `${msg}: ` : ''}expected ${expected}, got ${actual}`
  );
}

describe('Ajuste de frascos al modificar un Gasto Fijo a mitad de mes', () => {
  test('1. Día 12 (extraDaysPosition=end, 30 días): aumentar gasto fijo congela Semana 1 y ajusta Semana 2 (presente), 3, 4 y Días Extras', () => {
    const year = 2026;
    const month = 10; // Noviembre (30 días, 2 días extras)
    const initialRemaining = 300000;
    const nextRemaining = 277000; // Gasto fijo aumentó +23.000

    const before = calculateFiveJars(year, month, initialRemaining, 'remaining', [], 'end');
    const week1Before = before.jars.find(j => j.number === 2)!;
    const week2Before = before.jars.find(j => j.number === 3)!;
    const week3Before = before.jars.find(j => j.number === 4)!;
    const week4Before = before.jars.find(j => j.number === 5)!;
    const extraBefore = before.jars.find(j => j.number === 1)!;

    approxEqual(week1Before.amount, 70000);
    approxEqual(week2Before.amount, 70000);
    approxEqual(extraBefore.amount, 20000);

    const adj = calculateMidMonthFixedExpenseJarAdjustments(
      year,
      month,
      initialRemaining,
      nextRemaining,
      'end',
      undefined,
      12
    );

    const after = calculateFiveJars(year, month, nextRemaining, 'remaining', [], 'end', undefined, adj);
    const week1After = after.jars.find(j => j.number === 2)!;
    const week2After = after.jars.find(j => j.number === 3)!;
    const week3After = after.jars.find(j => j.number === 4)!;
    const week4After = after.jars.find(j => j.number === 5)!;
    const extraAfter = after.jars.find(j => j.number === 1)!;

    // Frasco pasado (días 1-7) intacto
    approxEqual(week1After.amount, 70000, 'Semana 1 (pasada) no debe modificarse');
    assert.equal(week1After.adjustment, 0, 'Frasco pasado no debe mostrar badge de exceso');

    // Presente (días 8-14) y futuros (15-21, 22-28, 29-30) absorben los -23.000 en proporción a sus 23 días
    approxEqual(week2After.amount, 63000, 'Semana 2 (presente) debe absorber -7.000');
    approxEqual(week3After.amount, 63000, 'Semana 3 (futura) debe absorber -7.000');
    approxEqual(week4After.amount, 63000, 'Semana 4 (futura) debe absorber -7.000');
    approxEqual(extraAfter.amount, 18000, 'Días Extras (futuro) debe absorber -2.000');

    // Conservación exacta del presupuesto mensual
    const totalAfter = after.jars.reduce((s, j) => s + j.amount, 0);
    approxEqual(totalAfter, nextRemaining, 'La suma de los 5 frascos debe igualar exactamente nextRemaining');

    // No activa banner de redistribución por exceso de gastos variables
    assert.equal(hasOverbudgetJarAdjustments(adj), false);
  });

  test('2. Día 12 (extraDaysPosition=end): reducir gasto fijo libera dinero solo en frascos presentes y futuros, sin tocar los pasados', () => {
    const year = 2026;
    const month = 10; // Noviembre (30 días)
    const initialRemaining = 277000;
    const nextRemaining = 300000; // Gasto fijo bajó -23.000

    const adj = calculateMidMonthFixedExpenseJarAdjustments(
      year,
      month,
      initialRemaining,
      nextRemaining,
      'end',
      undefined,
      12
    );

    const after = calculateFiveJars(year, month, nextRemaining, 'remaining', [], 'end', undefined, adj);
    const week1After = after.jars.find(j => j.number === 2)!;
    const week2After = after.jars.find(j => j.number === 3)!;
    const extraAfter = after.jars.find(j => j.number === 1)!;

    // 277000 * 7 / 30 = 64633.3333 -> congelado en ese valor
    approxEqual(week1After.amount, (277000 * 7) / 30, 'Semana 1 pasada no recibe dinero retroactivo');
    // Presente y futuros reciben +23000 * (days / 23)
    approxEqual(week2After.amount, (277000 * 7) / 30 + 7000);
    approxEqual(extraAfter.amount, (277000 * 2) / 30 + 2000);
    approxEqual(after.jars.reduce((s, j) => s + j.amount, 0), nextRemaining);
  });

  test('3. Revertir la modificación en el mismo día devuelve los frascos y limpia offsets residuales', () => {
    const year = 2026;
    const month = 10;

    const adj1 = calculateMidMonthFixedExpenseJarAdjustments(year, month, 300000, 277000, 'end', undefined, 12);
    const adj2 = calculateMidMonthFixedExpenseJarAdjustments(year, month, 277000, 300000, 'end', adj1, 12);

    assert.equal(adj2, undefined, 'Al revertir el monto debe limpiar por completo los offsets residuales');
    const restored = calculateFiveJars(year, month, 300000, 'remaining', [], 'end', undefined, adj2);
    approxEqual(restored.jars.find(j => j.number === 2)!.amount, 70000);
    approxEqual(restored.jars.find(j => j.number === 1)!.amount, 20000);
  });

  test('4. Día 12 con extraDaysPosition=start: Días Extras (1-2) y Semana 1 (3-9) son pasados y quedan congelados', () => {
    const year = 2026;
    const month = 10; // Noviembre (30 días, Días Extras: 1-2, Sem1: 3-9, Sem2: 10-16, Sem3: 17-23, Sem4: 24-30)
    const adj = calculateMidMonthFixedExpenseJarAdjustments(year, month, 300000, 279000, 'start', undefined, 12);
    const after = calculateFiveJars(year, month, 279000, 'remaining', [], 'start', undefined, adj);

    // Pasados intactos
    approxEqual(after.jars.find(j => j.number === 1)!.amount, 20000, 'Días Extras (1-2) congelado');
    approxEqual(after.jars.find(j => j.number === 2)!.amount, 70000, 'Semana 1 (3-9) congelada');

    // Presente (Semana 2: 10-16) y futuras (Semana 3 y 4) absorben -21.000 => -7.000 c/u
    approxEqual(after.jars.find(j => j.number === 3)!.amount, 63000, 'Semana 2 (presente)');
    approxEqual(after.jars.find(j => j.number === 4)!.amount, 63000, 'Semana 3 (futura)');
    approxEqual(after.jars.find(j => j.number === 5)!.amount, 63000, 'Semana 4 (futura)');
  });

  test('5. Días límite (día 7 vs día 8, día 1, mes de 28 días, y mes no activo)', () => {
    // Día 7: Semana 1 (1-7) aún está EN CURSO (presente), por lo tanto todos se ajustan normalmente
    const adjDay7 = calculateMidMonthFixedExpenseJarAdjustments(2026, 10, 300000, 270000, 'end', undefined, 7);
    assert.equal(adjDay7, undefined);

    // Día 8: Semana 1 (1-7) acaba de terminar -> congelada en 70.000
    const adjDay8 = calculateMidMonthFixedExpenseJarAdjustments(2026, 10, 300000, 277000, 'end', undefined, 8);
    const jarsDay8 = calculateFiveJars(2026, 10, 277000, 'remaining', [], 'end', undefined, adjDay8);
    approxEqual(jarsDay8.jars.find(j => j.number === 2)!.amount, 70000);
    approxEqual(jarsDay8.jars.find(j => j.number === 3)!.amount, 63000);

    // Febrero 2026 (28 días, sin días extras) en día 12: Semana 1 (1-7) congelada; Semanas 2, 3, 4 absorben -21.000 (-7.000 c/u)
    const adjFeb = calculateMidMonthFixedExpenseJarAdjustments(2026, 1, 280000, 259000, 'end', undefined, 12);
    const jarsFeb = calculateFiveJars(2026, 1, 259000, 'remaining', [], 'end', undefined, adjFeb);
    approxEqual(jarsFeb.jars.find(j => j.number === 2)!.amount, 70000);
    approxEqual(jarsFeb.jars.find(j => j.number === 3)!.amount, 63000);
    approxEqual(jarsFeb.jars.find(j => j.number === 4)!.amount, 63000);
    approxEqual(jarsFeb.jars.find(j => j.number === 5)!.amount, 63000);

    // Mes no activo (referenceDay = null) no congela frascos
    const adjInactive = calculateMidMonthFixedExpenseJarAdjustments(2026, 10, 300000, 270000, 'end', undefined, null);
    assert.equal(adjInactive, undefined);
  });

  test('6. Compatibilidad e independencia frente a redistribuciones por exceso de gastos variables (claves 1..5 vs 101..105)', () => {
    // Usuario redistribuyó exceso de Semana 1 (+1000 en 2, -250 en 3,4,5,1)
    const existingOverbudget: Record<number, number> = {
      2: 1000,
      3: -250,
      4: -250,
      5: -250,
      1: -250,
    };

    const combined = calculateMidMonthFixedExpenseJarAdjustments(
      2026,
      10,
      300000,
      277000,
      'end',
      existingOverbudget,
      12
    );

    assert.equal(hasOverbudgetJarAdjustments(combined), true);

    const jarsAfterEdit = calculateFiveJars(2026, 10, 277000, 'remaining', [], 'end', undefined, combined);
    // Semana 1 conserva su 70.000 + 1.000 = 71.000
    approxEqual(jarsAfterEdit.jars.find(j => j.number === 2)!.amount, 71000);
    // Semana 2 tenía 70.000 - 250 = 69.750, absorbe -7.000 -> 62.750
    approxEqual(jarsAfterEdit.jars.find(j => j.number === 3)!.amount, 62750);

    // Si luego el usuario presiona "Restablecer distribución original de frascos", solo borra 1..5 y preserva 101..105
    const afterReset = clearOverbudgetJarAdjustments(combined);
    assert.equal(hasOverbudgetJarAdjustments(afterReset), false);
    const jarsAfterReset = calculateFiveJars(2026, 10, 277000, 'remaining', [], 'end', undefined, afterReset);
    approxEqual(jarsAfterReset.jars.find(j => j.number === 2)!.amount, 70000, 'Semana 1 sigue protegida ante gasto fijo');
    approxEqual(jarsAfterReset.jars.find(j => j.number === 3)!.amount, 63000);
  });

  test('7. Tope en cero: si el aumento del gasto fijo supera el remanente, usa variación neta real (R_new - R_old)', () => {
    const adj = calculateMidMonthFixedExpenseJarAdjustments(2026, 10, 30000, 0, 'end', undefined, 12);
    const jars = calculateFiveJars(2026, 10, 0, 'remaining', [], 'end', undefined, adj);
    approxEqual(jars.jars.find(j => j.number === 2)!.amount, 7000, 'Semana 1 mantiene su 7.000 original');
    approxEqual(jars.jars.find(j => j.number === 3)!.amount, 0, 'Frascos presentes/futuros quedan en 0 sin valores negativos');
    approxEqual(jars.jars.find(j => j.number === 1)!.amount, 0);
  });
});
