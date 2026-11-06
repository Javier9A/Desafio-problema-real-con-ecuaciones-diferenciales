/**
 * SportLift · Núcleo matemático
 * ---------------------------------------------------------------------------
 * Modelo (EDO lineal de primer orden con condición inicial):
 *
 *     dy/dt = k·I·(M − y) − δ·y ,        y(0) = y0
 *
 *   y(t) : fuerza máxima (1RM) en un levantamiento ............ [kg]
 *   t    : tiempo de entrenamiento ............................ [semanas]
 *   M    : techo de fuerza hipotético (potencial) ............. [kg]
 *   k    : tasa base de adaptación ............................ [1/semana]
 *   I    : índice de entrenamiento = adherencia · min(sesiones,6)/6  [adimensional, 0–1]
 *   δ    : tasa de pérdida (fatiga / destrenamiento) .......... [1/semana]
 *
 * Reordenando:  dy/dt = c − λ·y   con   λ = k·I + δ   y   c = k·I·M
 *
 * Solución analítica (se verifica por sustitución en docs/MODELO.md):
 *
 *     y(t) = y_eq + (y0 − y_eq)·e^(−λ t) ,      y_eq = c / λ
 *
 * Métodos numéricos (mismo f, y0, intervalo y paso h):
 *   - Heun (Runge-Kutta de orden 2, trapecio predictor-corrector)
 *   - Runge-Kutta clásico de orden 4 (RK4)
 *
 * IMPORTANTE: todos los parámetros son HIPOTÉTICOS (didácticos). El modelo no
 * es una predicción fisiológica comprobada.
 *
 * El archivo funciona en el navegador (window.SportLiftODE) y en Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SportLiftODE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Sesiones por semana a partir de las cuales el índice de entrenamiento se satura (hipótesis). */
  const SESIONES_MAX = 6;

  /** Índice de entrenamiento I ∈ [0,1] (adimensional). */
  function indiceEntrenamiento(p) {
    return (p.adherencia / 100) * Math.min(p.sesiones, SESIONES_MAX) / SESIONES_MAX;
  }

  /**
   * Deriva los coeficientes de la EDO a partir de los parámetros del usuario.
   * @param {{k:number, M:number, delta:number, sesiones:number, adherencia:number}} p
   * @returns {{I:number, lambda:number, c:number, yEq:number, M:number}}
   */
  function coeficientes(p) {
    const I = indiceEntrenamiento(p);
    const lambda = p.k * I + p.delta; // [1/semana]
    const c = p.k * I * p.M; // [kg/semana]
    return { I, lambda, c, yEq: lambda > 0 ? c / lambda : NaN, M: p.M };
  }

  /** Lado derecho de la EDO: f(t, y) = c − λ y   [kg/semana]. */
  function f(t, y, C) {
    return C.c - C.lambda * y;
  }

  /** Solución analítica y(t). */
  function exacta(t, C, y0) {
    return C.yEq + (y0 - C.yEq) * Math.exp(-C.lambda * t);
  }

  /** Derivada analítica y'(t) (para la verificación por sustitución). */
  function derivadaExacta(t, C, y0) {
    return -C.lambda * (y0 - C.yEq) * Math.exp(-C.lambda * t);
  }

  /**
   * Verificación numérica por sustitución: residuo = y'(t) − f(t, y(t)).
   * Debe ser ≈ 0 (error de redondeo) para toda t, y y(0) = y0.
   */
  function verificarSolucion(C, y0, T, muestras = 25) {
    let maxResiduo = 0;
    for (let i = 0; i <= muestras; i++) {
      const t = (T * i) / muestras;
      const r = Math.abs(derivadaExacta(t, C, y0) - f(t, exacta(t, C, y0), C));
      if (r > maxResiduo) maxResiduo = r;
    }
    return { maxResiduo, errorCI: Math.abs(exacta(0, C, y0) - y0) };
  }

  /** Malla temporal t_0=0 … t_n=T con paso h (el último paso puede ser menor). */
  function mallaTemporal(T, h) {
    const n = Math.ceil(T / h - 1e-9);
    const t = new Array(n + 1);
    for (let i = 0; i <= n; i++) t[i] = Math.min(i * h, T);
    return t;
  }

  /** Un paso de Heun (RK2): predictor de Euler + corrector trapezoidal. */
  function pasoHeun(t, y, h, C) {
    const k1 = f(t, y, C);
    const yPred = y + h * k1;
    const k2 = f(t + h, yPred, C);
    return y + (h / 2) * (k1 + k2);
  }

  /** Un paso de Runge-Kutta clásico de 4.º orden. */
  function pasoRK4(t, y, h, C) {
    const k1 = f(t, y, C);
    const k2 = f(t + h / 2, y + (h / 2) * k1, C);
    const k3 = f(t + h / 2, y + (h / 2) * k2, C);
    const k4 = f(t + h, y + h * k3, C);
    return y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }

  /** Error relativo porcentual; null cuando el valor exacto es 0. */
  function errorRelPct(exacto, aprox) {
    return exacto === 0 ? null : (Math.abs(exacto - aprox) / Math.abs(exacto)) * 100;
  }

  /**
   * Ejecuta Heun y RK4 con el mismo (C, y0, T, h) y compara con la solución exacta.
   * @returns {{h:number, n:number, filas:Array, resumen:Object}}
   */
  function simular(C, y0, T, h) {
    const t = mallaTemporal(T, h);
    const filas = [];
    let yH = y0;
    let yR = y0;
    for (let i = 0; i < t.length; i++) {
      if (i > 0) {
        const paso = t[i] - t[i - 1];
        yH = pasoHeun(t[i - 1], yH, paso, C);
        yR = pasoRK4(t[i - 1], yR, paso, C);
      }
      const ex = exacta(t[i], C, y0);
      filas.push({
        i,
        t: t[i],
        exacta: ex,
        heun: yH,
        rk4: yR,
        absHeun: Math.abs(ex - yH),
        absRK4: Math.abs(ex - yR),
        relHeun: errorRelPct(ex, yH),
        relRK4: errorRelPct(ex, yR),
      });
    }
    return { h, n: t.length - 1, filas, resumen: resumir(filas) };
  }

  /** Estadísticos de error de una corrida. */
  function resumir(filas) {
    const ult = filas[filas.length - 1];
    const max = (k) => filas.reduce((m, r) => (r[k] !== null && r[k] > m ? r[k] : m), 0);
    const mediaAbs = (k) => filas.reduce((s, r) => s + r[k], 0) / filas.length;
    const resumen = {
      maxAbsHeun: max('absHeun'),
      maxAbsRK4: max('absRK4'),
      meanAbsHeun: mediaAbs('absHeun'),
      meanAbsRK4: mediaAbs('absRK4'),
      finalAbsHeun: ult.absHeun,
      finalAbsRK4: ult.absRK4,
      finalRelHeun: ult.relHeun,
      finalRelRK4: ult.relRK4,
      maxRelHeun: max('relHeun'),
      maxRelRK4: max('relRK4'),
    };
    resumen.mejor = resumen.maxAbsRK4 <= resumen.maxAbsHeun ? 'RK4' : 'Heun';
    resumen.factor = resumen.maxAbsRK4 > 0 ? resumen.maxAbsHeun / resumen.maxAbsRK4 : Infinity;
    return resumen;
  }

  /**
   * Estudio de convergencia: h0, h0/2, h0/4, … y orden observado
   *   p ≈ log2( E(h) / E(h/2) )  con E = error absoluto máximo.
   * Se espera p ≈ 2 para Heun y p ≈ 4 para RK4.
   */
  function convergencia(C, y0, T, h0, niveles = 4) {
    const filas = [];
    for (let j = 0; j < niveles; j++) {
      const h = h0 / Math.pow(2, j);
      const s = simular(C, y0, T, h).resumen;
      filas.push({ h, maxAbsHeun: s.maxAbsHeun, maxAbsRK4: s.maxAbsRK4, ordenHeun: null, ordenRK4: null });
    }
    const orden = (a, b) => (a > 1e-12 && b > 1e-12 ? Math.log2(a / b) : null);
    for (let j = 1; j < filas.length; j++) {
      filas[j].ordenHeun = orden(filas[j - 1].maxAbsHeun, filas[j].maxAbsHeun);
      filas[j].ordenRK4 = orden(filas[j - 1].maxAbsRK4, filas[j].maxAbsRK4);
    }
    return filas;
  }

  /**
   * Tiempo (semanas) en que la solución exacta alcanza una meta.
   * @returns {{alcanzable:boolean, t:number|null, motivo:string}}
   */
  function tiempoHastaMeta(C, y0, meta) {
    if (meta <= y0) return { alcanzable: true, t: 0, motivo: 'La meta ya está cumplida.' };
    // y(t) crece de forma monótona hacia yEq: la meta se alcanza solo si meta < yEq.
    if (!(meta < C.yEq)) {
      return { alcanzable: false, t: null, motivo: 'La meta supera (o iguala) el equilibrio y_eq del modelo.' };
    }
    const t = -Math.log((meta - C.yEq) / (y0 - C.yEq)) / C.lambda;
    return { alcanzable: true, t, motivo: '' };
  }

  /**
   * Límites de estabilidad numérica para f = c − λy, con z = h·λ:
   *   Heun: |1 − z + z²/2| < 1  ⇔  0 < z < 2
   *   RK4 : |1 − z + z²/2 − z³/6 + z⁴/24| < 1  ⇔  0 < z < ≈2.785
   */
  const Z_MAX_HEUN = 2;
  const Z_MAX_RK4 = 2.785;

  /** Valida todas las entradas. Devuelve errores por campo y advertencias generales. */
  function validar(v) {
    const e = {};
    const w = [];
    const num = (x) => typeof x === 'number' && Number.isFinite(x);
    const rango = (campo, x, min, max, etiqueta, unidad) => {
      if (!num(x)) e[campo] = `${etiqueta}: ingresa un número válido.`;
      else if (x < min || x > max) e[campo] = `${etiqueta} debe estar entre ${min} y ${max} ${unidad}.`.replace('  ', ' ');
    };
    rango('y0', v.y0, 20, 600, 'Marca inicial y₀', 'kg');
    rango('M', v.M, 20, 700, 'Techo M', 'kg');
    rango('k', v.k, 0.001, 1, 'Tasa k', '1/semana');
    rango('delta', v.delta, 0, 0.5, 'Pérdida δ', '1/semana');
    rango('sesiones', v.sesiones, 1, 14, 'Sesiones por semana', '');
    rango('adherencia', v.adherencia, 1, 100, 'Adherencia', '%');
    if (v.meta !== undefined) rango('meta', v.meta, 20, 700, 'Meta', 'kg');
    if (v.T !== undefined) rango('T', v.T, 1, 520, 'Tiempo total T', 'semanas');
    ['h1', 'h2'].forEach((c, idx) => {
      if (v[c] === undefined) return;
      rango(c, v[c], 0.05, 52, `Paso h${idx + 1}`, 'semanas');
      if (!e[c] && num(v.T) && v[c] > v.T) e[c] = `Paso h${idx + 1} no puede superar T.`;
      if (!e[c] && num(v.T) && v.T / v[c] > 5000) e[c] = `Paso h${idx + 1} es demasiado pequeño (máx. 5000 iteraciones).`;
    });
    if (!e.h1 && !e.h2 && v.h1 !== undefined && v.h2 !== undefined && v.h1 === v.h2) {
      e.h2 = 'Elige dos tamaños de paso distintos para poder compararlos.';
    }
    if (!e.y0 && !e.M && v.M < v.y0) e.M = 'El techo M debe ser mayor o igual que la marca inicial y₀.';
    if (!e.y0 && !e.meta && v.meta !== undefined && v.meta <= v.y0) e.meta = 'La meta debe ser mayor que la marca inicial y₀.';

    if (Object.keys(e).length === 0) {
      const C = coeficientes(v);
      [['h1', v.h1], ['h2', v.h2]].forEach(([nombre, h]) => {
        if (h === undefined) return;
        const z = h * C.lambda;
        if (z >= Z_MAX_RK4) w.push(`Con ${nombre} = ${h} semanas, h·λ = ${z.toFixed(2)} supera el límite de estabilidad de RK4 (≈2.79) y de Heun (2): las aproximaciones pueden oscilar o divergir.`);
        else if (z >= Z_MAX_HEUN) w.push(`Con ${nombre} = ${h} semanas, h·λ = ${z.toFixed(2)} supera el límite de estabilidad de Heun (2): su resultado puede divergir. RK4 aún es estable.`);
      });
    }
    return { errores: e, advertencias: w, ok: Object.keys(e).length === 0 };
  }

  return {
    SESIONES_MAX,
    Z_MAX_HEUN,
    Z_MAX_RK4,
    indiceEntrenamiento,
    coeficientes,
    f,
    exacta,
    derivadaExacta,
    verificarSolucion,
    mallaTemporal,
    pasoHeun,
    pasoRK4,
    errorRelPct,
    simular,
    resumir,
    convergencia,
    tiempoHastaMeta,
    validar,
  };
});
