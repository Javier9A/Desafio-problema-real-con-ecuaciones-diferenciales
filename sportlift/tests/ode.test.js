/**
 * Pruebas del núcleo matemático (sin dependencias).
 * Ejecutar:  node tests/ode.test.js
 */
'use strict';
const assert = require('assert');
const O = require('../js/ode.js');

let pruebas = 0;
function prueba(nombre, fn) {
  fn();
  pruebas++;
  console.log('  ✓', nombre);
}
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);

const p = { k: 0.08, M: 150, delta: 0.005, sesiones: 4, adherencia: 85 };
const C = O.coeficientes(p);
const y0 = 100;
const T = 48;

console.log('SportLift · pruebas del núcleo matemático');

prueba('Coeficientes: I, λ, c y y_eq coherentes', () => {
  cerca(C.I, 0.85 * (4 / 6), 1e-12);
  cerca(C.lambda, 0.08 * C.I + 0.005, 1e-12);
  cerca(C.yEq, (0.08 * C.I * 150) / C.lambda, 1e-12);
});

prueba('La solución analítica cumple y(0) = y0', () => {
  cerca(O.exacta(0, C, y0), y0, 1e-12);
});

prueba('La solución analítica satisface la EDO (residuo ≈ 0)', () => {
  const v = O.verificarSolucion(C, y0, T);
  assert.ok(v.maxResiduo < 1e-12, `residuo ${v.maxResiduo}`);
  assert.ok(v.errorCI < 1e-12);
});

prueba('La solución analítica coincide con una derivada por diferencias finitas', () => {
  const t = 13.7;
  const e = 1e-6;
  const dnum = (O.exacta(t + e, C, y0) - O.exacta(t - e, C, y0)) / (2 * e);
  cerca(dnum, O.f(t, O.exacta(t, C, y0), C), 1e-6);
});

prueba('Malla temporal: incluye 0 y T, y maneja T/h no entero', () => {
  assert.deepStrictEqual(O.mallaTemporal(48, 8), [0, 8, 16, 24, 32, 40, 48]);
  const m = O.mallaTemporal(10, 4);
  assert.deepStrictEqual(m, [0, 4, 8, 10]);
});

prueba('Heun y RK4 parten de la misma condición inicial', () => {
  const s = O.simular(C, y0, T, 8);
  assert.strictEqual(s.filas[0].heun, y0);
  assert.strictEqual(s.filas[0].rk4, y0);
  assert.strictEqual(s.filas[0].absHeun, 0);
  assert.strictEqual(s.n, 6);
});

prueba('RK4 es más preciso que Heun (h = 8 y h = 4)', () => {
  [8, 4].forEach((h) => {
    const r = O.simular(C, y0, T, h).resumen;
    assert.ok(r.maxAbsRK4 < r.maxAbsHeun, `h=${h}`);
    assert.strictEqual(r.mejor, 'RK4');
  });
});

prueba('Reducir h reduce el error de ambos métodos', () => {
  const a = O.simular(C, y0, T, 8).resumen;
  const b = O.simular(C, y0, T, 4).resumen;
  assert.ok(b.maxAbsHeun < a.maxAbsHeun);
  assert.ok(b.maxAbsRK4 < a.maxAbsRK4);
});

prueba('Orden observado: Heun ≈ 2 y RK4 ≈ 4', () => {
  const conv = O.convergencia(C, y0, T, 8, 4);
  conv.slice(1).forEach((r) => {
    cerca(r.ordenHeun, 2, 0.25, 'orden Heun');
    cerca(r.ordenRK4, 4, 0.35, 'orden RK4');
  });
});

prueba('Paso de Heun para f = c − λy coincide con la fórmula cerrada 1 − z + z²/2', () => {
  const h = 2;
  const z = h * C.lambda;
  const esperado = C.yEq + (y0 - C.yEq) * (1 - z + (z * z) / 2);
  cerca(O.pasoHeun(0, y0, h, C), esperado, 1e-10);
});

prueba('Paso de RK4 coincide con el polinomio de Taylor de grado 4 de e^(−z)', () => {
  const h = 2;
  const z = h * C.lambda;
  const esperado = C.yEq + (y0 - C.yEq) * (1 - z + (z * z) / 2 - (z * z * z) / 6 + (z * z * z * z) / 24);
  cerca(O.pasoRK4(0, y0, h, C), esperado, 1e-10);
});

prueba('Error relativo: null si el valor exacto es 0', () => {
  assert.strictEqual(O.errorRelPct(0, 1), null);
  cerca(O.errorRelPct(200, 198), 1, 1e-12);
});

prueba('Tiempo hasta la meta: se verifica contra y(t*) = meta', () => {
  const r = O.tiempoHastaMeta(C, y0, 120);
  assert.ok(r.alcanzable);
  cerca(O.exacta(r.t, C, y0), 120, 1e-9);
});

prueba('Meta por encima del equilibrio: no alcanzable', () => {
  const r = O.tiempoHastaMeta(C, y0, C.yEq + 1);
  assert.strictEqual(r.alcanzable, false);
});

prueba('Validación: acepta datos correctos y rechaza incorrectos', () => {
  const ok = O.validar({ ...p, y0, meta: 125, T, h1: 8, h2: 4 });
  assert.ok(ok.ok, JSON.stringify(ok.errores));
  const mal = O.validar({ ...p, y0: -5, meta: 90, T, h1: 8, h2: 8 });
  assert.ok(!mal.ok);
  assert.ok(mal.errores.y0 && mal.errores.h2);
  const nan = O.validar({ ...p, y0: NaN, meta: 125, T, h1: 8, h2: 4 });
  assert.ok(nan.errores.y0);
  const grande = O.validar({ ...p, y0, meta: 125, T: 48, h1: 100, h2: 4 });
  assert.ok(grande.errores.h1);
});

prueba('Advertencia de estabilidad cuando h·λ ≥ 2', () => {
  const rapido = { ...p, k: 1, adherencia: 100, sesiones: 6 }; // λ ≈ 1.005
  const r = O.validar({ ...rapido, y0, meta: 125, T: 48, h1: 4, h2: 1 });
  assert.ok(r.ok);
  assert.ok(r.advertencias.length >= 1);
});

console.log(`\n${pruebas} pruebas superadas.`);
