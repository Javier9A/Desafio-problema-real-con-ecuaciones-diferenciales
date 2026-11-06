/**
 * SportLift · Lógica de la interfaz
 * ---------------------------------------------------------------------------
 * Une los módulos: SportLiftODE (matemática), SportLiftDB (persistencia) y
 * SportLiftChart (gráficas). No usa frameworks. Todo texto que viene del usuario
 * se escapa antes de insertarse en el HTML.
 */
(function () {
  'use strict';

  const O = window.SportLiftODE;
  const DB = window.SportLiftDB;
  const Chart = window.SportLiftChart;

  /* ------------------------------ Utilidades ----------------------------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  /** Formato de errores: notación científica; 0 se muestra como "0". */
  const fe = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x === 0 ? '0' : x.toExponential(2));
  const leer = (id) => {
    const s = $(id).value.trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };

  const LIFTS = {
    sentadilla: { nombre: 'Sentadilla' },
    banca: { nombre: 'Press de banca' },
    muerto: { nombre: 'Peso muerto' },
  };
  const SIM_DEFECTO = { T: 48, h1: 8, h2: 4 };
  const DEMO = [
    {
      nombre: 'Ana (ejemplo ficticio)', peso: 62, sesiones: 4, adherencia: 85, delta: 0.005, ficticio: true,
      notas: 'Deportista inventada para probar la aplicación.',
      lifts: {
        sentadilla: { y0: 100, meta: 125, M: 150, k: 0.08 },
        banca: { y0: 55, meta: 65, M: 75, k: 0.07 },
        muerto: { y0: 120, meta: 150, M: 175, k: 0.08 },
      },
    },
    {
      nombre: 'Carlos (ejemplo ficticio)', peso: 83, sesiones: 5, adherencia: 90, delta: 0.01, ficticio: true,
      notas: 'Deportista inventado para probar la aplicación.',
      lifts: {
        sentadilla: { y0: 150, meta: 190, M: 230, k: 0.06 },
        banca: { y0: 105, meta: 130, M: 150, k: 0.05 },
        muerto: { y0: 180, meta: 220, M: 260, k: 0.06 },
      },
    },
  ];

  const estado = { deportistas: [], sim: null, hSel: 0, editando: null };

  /* ------------------------------ Navegación ----------------------------- */
  const VISTAS = ['inicio', 'deportistas', 'simulador', 'historial', 'modelo'];

  function navegar(id, { empujar = true } = {}) {
    if (!VISTAS.includes(id)) id = 'inicio';
    VISTAS.forEach((v) => $(v).classList.toggle('activa', v === id));
    document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('activo', b.dataset.ir === id));
    if (empujar && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    window.scrollTo(0, 0);
    if (id === 'simulador' && !estado.sim) ejecutarSimulacion();
    if (id === 'historial') renderHistorial();
    if (id === 'inicio') renderEstadoDB();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ir]');
    if (t) {
      e.preventDefault();
      navegar(t.dataset.ir);
    }
  });
  window.addEventListener('hashchange', () => navegar(location.hash.slice(1), { empujar: false }));

  /* ------------------------------ Deportistas ---------------------------- */
  async function cargarDeportistas() {
    estado.deportistas = (await DB.listarDeportistas()).sort((a, b) => a.id - b.id);
  }

  function renderDeportistas() {
    const host = $('lista-deportistas');
    if (!estado.deportistas.length) {
      host.innerHTML = '<p class="vacio">Aún no hay deportistas. Crea uno con “Nuevo deportista”.</p>';
    } else {
      host.innerHTML = estado.deportistas
        .map((d) => {
          const I = O.indiceEntrenamiento(d);
          const filas = Object.keys(LIFTS)
            .map((l) => `<tr><td>${LIFTS[l].nombre}</td><td>${d.lifts[l].y0}</td><td>${d.lifts[l].meta}</td><td>${d.lifts[l].M}</td></tr>`)
            .join('');
          return `<article class="tarjeta dep">
            <h2>${esc(d.nombre)} ${d.ficticio ? '<span class="etq-demo">ejemplo</span>' : ''}</h2>
            <p class="meta">${d.peso} kg · ${d.sesiones} ses/sem · adherencia ${d.adherencia}% · δ = ${d.delta} · I = ${fmt(I, 3)}</p>
            <table><thead><tr><th>Levantamiento</th><th>y₀ (kg)</th><th>Meta (kg)</th><th>M (kg)</th></tr></thead><tbody>${filas}</tbody></table>
            ${d.notas ? `<p class="nota">${esc(d.notas)}</p>` : ''}
            <div class="acciones">
              <button class="btn primario chico" data-acc="simular" data-id="${d.id}">Simular</button>
              <button class="btn chico" data-acc="editar" data-id="${d.id}">Editar</button>
              <button class="btn chico peligro" data-acc="borrar" data-id="${d.id}">Eliminar</button>
            </div>
          </article>`;
        })
        .join('');
    }
    // selector del simulador
    const sel = $('s-deportista');
    const previo = sel.value;
    sel.innerHTML = '<option value="">Manual (sin deportista)</option>' + estado.deportistas.map((d) => `<option value="${d.id}">${esc(d.nombre)}</option>`).join('');
    if (previo && estado.deportistas.some((d) => String(d.id) === previo)) sel.value = previo;
  }

  $('lista-deportistas').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-acc]');
    if (!b) return;
    const id = Number(b.dataset.id);
    const d = estado.deportistas.find((x) => x.id === id);
    if (!d) return;
    if (b.dataset.acc === 'editar') abrirDialogo(d);
    if (b.dataset.acc === 'simular') {
      $('s-deportista').value = String(id);
      cargarValoresDeportista();
      estado.sim = null;
      navegar('simulador');
    }
    if (b.dataset.acc === 'borrar' && confirm(`¿Eliminar a “${d.nombre}” y su historial de simulaciones?`)) {
      await DB.eliminarDeportista(id);
      await cargarDeportistas();
      renderDeportistas();
      renderEstadoDB();
    }
  });

  /* --- Diálogo de deportista --- */
  function construirCamposLifts() {
    $('d-lifts').innerHTML = Object.keys(LIFTS)
      .map(
        (l) => `<fieldset class="lift-bloque"><legend>${LIFTS[l].nombre} <span class="etq-hip">hipotético: M y k</span></legend>
        <div class="grupo-campos">
          <label class="campo"><span>Marca inicial y₀ <em>kg</em></span><input id="d-${l}-y0" type="number" inputmode="decimal" step="any"><small class="err" data-err="${l}.y0"></small></label>
          <label class="campo"><span>Meta <em>kg</em></span><input id="d-${l}-meta" type="number" inputmode="decimal" step="any"><small class="err" data-err="${l}.meta"></small></label>
          <label class="campo"><span>Techo M <em>kg</em></span><input id="d-${l}-M" type="number" inputmode="decimal" step="any"><small class="err" data-err="${l}.M"></small></label>
          <label class="campo"><span>Tasa k <em>1/semana</em></span><input id="d-${l}-k" type="number" inputmode="decimal" step="any"><small class="err" data-err="${l}.k"></small></label>
        </div></fieldset>`
      )
      .join('');
  }

  function abrirDialogo(d) {
    estado.editando = d ? d.id : null;
    $('dlg-titulo').textContent = d ? 'Editar deportista' : 'Nuevo deportista';
    const base = d || { nombre: '', peso: 70, sesiones: 4, adherencia: 85, delta: 0.005, notas: '', lifts: JSON.parse(JSON.stringify(DEMO[0].lifts)) };
    $('d-nombre').value = base.nombre;
    $('d-peso').value = base.peso;
    $('d-sesiones').value = base.sesiones;
    $('d-adherencia').value = base.adherencia;
    $('d-delta').value = base.delta;
    $('d-notas').value = base.notas || '';
    Object.keys(LIFTS).forEach((l) => ['y0', 'meta', 'M', 'k'].forEach((c) => ($(`d-${l}-${c}`).value = base.lifts[l][c])));
    limpiarErrores($('form-dep'));
    $('dlg-dep').showModal();
    $('d-nombre').focus();
  }

  function limpiarErrores(raiz) {
    raiz.querySelectorAll('.err').forEach((s) => (s.textContent = ''));
    raiz.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  }
  function marcarError(raiz, clave, mensaje, idInput) {
    const s = raiz.querySelector(`[data-err="${clave}"]`);
    if (s) s.textContent = mensaje;
    const i = $(idInput);
    if (i) i.setAttribute('aria-invalid', 'true');
  }

  $('btn-nuevo').addEventListener('click', () => abrirDialogo(null));
  $('dlg-cerrar').addEventListener('click', () => $('dlg-dep').close());
  $('dlg-cancelar').addEventListener('click', () => $('dlg-dep').close());

  $('form-dep').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = $('form-dep');
    limpiarErrores(f);
    const nombre = $('d-nombre').value.trim();
    const peso = leer('d-peso');
    const comunes = { sesiones: leer('d-sesiones'), adherencia: leer('d-adherencia'), delta: leer('d-delta') };
    let ok = true;
    if (!nombre) { marcarError(f, 'nombre', 'Escribe un nombre.', 'd-nombre'); ok = false; }
    if (!Number.isFinite(peso) || peso < 30 || peso > 300) { marcarError(f, 'peso', 'Peso entre 30 y 300 kg.', 'd-peso'); ok = false; }
    const lifts = {};
    const mapaComun = { sesiones: 'd-sesiones', adherencia: 'd-adherencia', delta: 'd-delta' };
    Object.keys(LIFTS).forEach((l) => {
      const v = { y0: leer(`d-${l}-y0`), meta: leer(`d-${l}-meta`), M: leer(`d-${l}-M`), k: leer(`d-${l}-k`), ...comunes };
      const r = O.validar(v);
      Object.entries(r.errores).forEach(([campo, msg]) => {
        if (mapaComun[campo]) marcarError(f, campo, msg, mapaComun[campo]);
        else marcarError(f, `${l}.${campo}`, msg, `d-${l}-${campo}`);
        ok = false;
      });
      lifts[l] = { y0: v.y0, meta: v.meta, M: v.M, k: v.k };
    });
    if (!ok) {
      const primero = f.querySelector('[aria-invalid="true"]');
      if (primero) primero.focus();
      return;
    }
    const previo = estado.editando ? estado.deportistas.find((x) => x.id === estado.editando) : null;
    const registro = {
      ...(previo || {}),
      nombre, peso, ...comunes, lifts,
      notas: $('d-notas').value.trim(),
      ficticio: previo ? previo.ficticio : false,
      actualizado: new Date().toISOString(),
    };
    if (!previo) registro.creado = registro.actualizado;
    await DB.guardarDeportista(registro);
    $('dlg-dep').close();
    await cargarDeportistas();
    renderDeportistas();
    renderEstadoDB();
  });

  /* ------------------------------ Simulador ------------------------------ */
  const CAMPOS_SIM = ['y0', 'meta', 'M', 'k', 'delta', 'sesiones', 'adherencia', 'T', 'h1', 'h2'];

  function valoresPorDefecto() {
    const d = DEMO[0];
    return { ...d.lifts.sentadilla, delta: d.delta, sesiones: d.sesiones, adherencia: d.adherencia, ...SIM_DEFECTO };
  }
  function ponerValores(v) {
    CAMPOS_SIM.forEach((c) => ($('s-' + c).value = v[c]));
  }
  function leerValores() {
    const v = {};
    CAMPOS_SIM.forEach((c) => (v[c] = leer('s-' + c)));
    return v;
  }
  /** Copia al formulario los datos del deportista y levantamiento elegidos (conserva T, h1, h2). */
  function cargarValoresDeportista() {
    const id = Number($('s-deportista').value);
    const d = estado.deportistas.find((x) => x.id === id);
    if (!d) return;
    const l = d.lifts[$('s-lift').value];
    ponerValores({ ...l, delta: d.delta, sesiones: d.sesiones, adherencia: d.adherencia, T: $('s-T').value, h1: $('s-h1').value, h2: $('s-h2').value });
  }

  function mostrarValidacion() {
    const v = leerValores();
    const r = O.validar(v);
    limpiarErrores($('form-sim'));
    Object.entries(r.errores).forEach(([c, msg]) => marcarError($('form-sim'), c, msg, 's-' + c));
    $('avisos').innerHTML = r.advertencias.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join('');
    return { v, r };
  }

  $('form-sim').addEventListener('input', mostrarValidacion);
  $('s-deportista').addEventListener('change', () => { cargarValoresDeportista(); ejecutarSimulacion(); });
  $('s-lift').addEventListener('change', () => { cargarValoresDeportista(); ejecutarSimulacion(); });
  $('btn-restablecer').addEventListener('click', () => {
    if ($('s-deportista').value) cargarValoresDeportista();
    else ponerValores(valoresPorDefecto());
    ejecutarSimulacion();
  });
  $('form-sim').addEventListener('submit', (e) => {
    e.preventDefault();
    ejecutarSimulacion();
  });

  function ejecutarSimulacion() {
    const { v, r } = mostrarValidacion();
    if (!r.ok) {
      const primero = $('form-sim').querySelector('[aria-invalid="true"]');
      if (primero) primero.focus();
      return;
    }
    const C = O.coeficientes(v);
    const corridas = [O.simular(C, v.y0, v.T, v.h1), O.simular(C, v.y0, v.T, v.h2)];
    const dep = estado.deportistas.find((x) => String(x.id) === $('s-deportista').value);
    estado.sim = {
      v, C, corridas,
      conv: O.convergencia(C, v.y0, v.T, v.h1, 4),
      verif: O.verificarSolucion(C, v.y0, v.T),
      meta: O.tiempoHastaMeta(C, v.y0, v.meta),
      advertencias: r.advertencias,
      deportista: dep ? { id: dep.id, nombre: dep.nombre } : { id: null, nombre: 'Manual (sin deportista)' },
      lift: $('s-lift').value,
    };
    estado.hSel = 0;
    $('msg-guardado').textContent = '';
    renderResultados();
  }

  function renderResultados() {
    const s = estado.sim;
    if (!s) return;
    $('resultados').hidden = false;
    const { v, C, corridas, meta, verif } = s;
    const exT = O.exacta(v.T, C, v.y0);

    // Indicadores
    const [r1, r2] = corridas.map((c) => c.resumen);
    const factor2 = r2.factor;
    $('kpis').innerHTML = [
      kpi(`${fmt(C.lambda, 4)} <small>1/sem</small>`, 'λ = k·I + δ (tasa total)'),
      kpi(`${fmt(C.yEq, 1)} <small>kg</small>`, 'Equilibrio y_eq (hacia donde tiende la fuerza)'),
      kpi(`${fmt(exT, 1)} <small>kg</small>`, `y(${v.T}) exacta`),
      meta.alcanzable
        ? kpi(`${fmt(meta.t, 1)} <small>semanas</small>`, `Semana en que se alcanza la meta de ${v.meta} kg${meta.t > v.T ? ' (fuera de [0, T])' : ''}`, meta.t > v.T ? '' : 'ok')
        : kpi('No alcanzable', `La meta de ${v.meta} kg supera y_eq`, 'mal'),
      kpi(`${r2.mejor} <small>${Number.isFinite(factor2) ? '×' + fmt(factor2 >= 1 ? factor2 : 1 / factor2, 1) + ' más preciso' : ''}</small>`, `Método con menor error máx. (h = ${v.h2})`, 'ok'),
      kpi(`${verif.maxResiduo.toExponential(1)}`, 'Residuo |y′ − f(y)| de la solución exacta (≈ 0)'),
    ].join('');

    renderSelectorH();
    renderGraficaSolucion();
    renderGraficaErrores();
    renderTablaResumen(r1, r2);
    renderTablaConvergencia();
    renderTablaIteraciones();
    renderInterpretacion();
  }

  const kpi = (valor, etiqueta, clase = '') => `<div class="kpi ${clase}"><div class="v">${valor}</div><div class="l">${etiqueta}</div></div>`;

  function renderSelectorH() {
    const s = estado.sim;
    const host = $('sel-h');
    host.innerHTML = s.corridas.map((c, i) => `<button type="button" data-i="${i}" aria-pressed="${i === estado.hSel}">h${i + 1} = ${c.h}</button>`).join('');
  }
  $('sel-h').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    estado.hSel = Number(b.dataset.i);
    renderSelectorH();
    renderGraficaSolucion();
    renderTablaIteraciones();
  });

  function renderGraficaSolucion() {
    const s = estado.sim;
    const { v, C } = s;
    const c = s.corridas[estado.hSel];
    const N = 160;
    const curva = Array.from({ length: N + 1 }, (_, i) => {
      const t = (v.T * i) / N;
      return [t, O.exacta(t, C, v.y0)];
    });
    Chart.montar($('graf-sol'), () => ({
      titulo: `Solución analítica, Heun y RK4 con h = ${c.h} semanas`,
      etiquetaX: 'Tiempo t (semanas)',
      etiquetaY: 'Fuerza y (kg)',
      formatoY: (y) => y.toFixed(4) + ' kg',
      series: [
        { nombre: `Meta (${v.meta} kg)`, color: 'var(--c-muted)', puntos: [[0, v.meta], [v.T, v.meta]], trazo: 'guion', grosor: 1, marcador: null },
        { nombre: 'Solución analítica', color: 'var(--s-exacta)', puntos: curva, grosor: 3, marcador: null },
        { nombre: `Heun (h = ${c.h})`, color: 'var(--s-heun)', puntos: c.filas.map((r) => [r.t, r.heun]), trazo: 'guion', grosor: 2, marcador: 'circulo' },
        { nombre: `RK4 (h = ${c.h})`, color: 'var(--s-rk4)', puntos: c.filas.map((r) => [r.t, r.rk4]), grosor: 2, marcador: 'cuadrado' },
      ],
    }));
  }

  function renderGraficaErrores() {
    const s = estado.sim;
    const [a, b] = s.corridas;
    const pts = (c, k) => c.filas.map((r) => [r.t, r[k]]);
    Chart.montar($('graf-err'), () => ({
      titulo: 'Error absoluto de Heun y RK4 para dos tamaños de paso',
      etiquetaX: 'Tiempo t (semanas)',
      etiquetaY: 'Error absoluto (kg, log)',
      logY: true,
      formatoY: (y) => y.toExponential(2) + ' kg',
      series: [
        { nombre: `Heun h = ${a.h}`, color: 'var(--s-heun)', puntos: pts(a, 'absHeun'), grosor: 2, marcador: 'circulo' },
        { nombre: `Heun h = ${b.h}`, color: 'var(--s-heun)', puntos: pts(b, 'absHeun'), trazo: 'guion', grosor: 2, marcador: 'aro' },
        { nombre: `RK4 h = ${a.h}`, color: 'var(--s-rk4)', puntos: pts(a, 'absRK4'), grosor: 2, marcador: 'cuadrado' },
        { nombre: `RK4 h = ${b.h}`, color: 'var(--s-rk4)', puntos: pts(b, 'absRK4'), trazo: 'guion', grosor: 2, marcador: 'rombo' },
      ],
    }));
  }

  function renderTablaResumen(r1, r2) {
    const [c1, c2] = estado.sim.corridas;
    const razon = (x, y) => (y > 0 && x > 0 ? '×' + fmt(x / y, 1) : '—');
    const filas = [
      ['Error absoluto máx. — Heun (kg)', r1.maxAbsHeun, r2.maxAbsHeun],
      ['Error absoluto máx. — RK4 (kg)', r1.maxAbsRK4, r2.maxAbsRK4],
      ['Error absoluto en t = T — Heun (kg)', r1.finalAbsHeun, r2.finalAbsHeun],
      ['Error absoluto en t = T — RK4 (kg)', r1.finalAbsRK4, r2.finalAbsRK4],
      ['Error relativo % en t = T — Heun', r1.finalRelHeun, r2.finalRelHeun],
      ['Error relativo % en t = T — RK4', r1.finalRelRK4, r2.finalRelRK4],
      ['Error relativo % máx. — Heun', r1.maxRelHeun, r2.maxRelHeun],
      ['Error relativo % máx. — RK4', r1.maxRelRK4, r2.maxRelRK4],
    ];
    $('tabla-resumen').innerHTML =
      `<thead><tr><th>Indicador</th><th>h₁ = ${c1.h} (${c1.n} pasos)</th><th>h₂ = ${c2.h} (${c2.n} pasos)</th><th>Reducción h₁→h₂</th></tr></thead><tbody>` +
      filas.map(([n, a, b]) => `<tr><td>${n}</td><td>${fe(a)}</td><td>${fe(b)}</td><td>${razon(a, b)}</td></tr>`).join('') +
      `<tr><td>Método con menor error</td><td class="mejor">${r1.mejor}</td><td class="mejor">${r2.mejor}</td><td></td></tr></tbody>`;
  }

  function renderTablaConvergencia() {
    const conv = estado.sim.conv;
    const ord = (x) => (x === null ? '—' : fmt(x, 2));
    $('tabla-conv').innerHTML =
      '<thead><tr><th>h (semanas)</th><th>Error máx. Heun (kg)</th><th>Orden Heun</th><th>Error máx. RK4 (kg)</th><th>Orden RK4</th></tr></thead><tbody>' +
      conv.map((r) => `<tr><td>${+r.h.toPrecision(5)}</td><td>${fe(r.maxAbsHeun)}</td><td>${ord(r.ordenHeun)}</td><td>${fe(r.maxAbsRK4)}</td><td>${ord(r.ordenRK4)}</td></tr>`).join('') +
      '</tbody>';
  }

  function renderTablaIteraciones() {
    const c = estado.sim.corridas[estado.hSel];
    $('tabla-h').textContent = `· h = ${c.h} semanas · ${c.n} pasos`;
    $('tabla-iter').innerHTML =
      '<thead><tr><th>i</th><th>t (sem)</th><th>y exacta (kg)</th><th>y Heun (kg)</th><th>y RK4 (kg)</th><th>|e| Heun (kg)</th><th>|e| RK4 (kg)</th><th>e% Heun</th><th>e% RK4</th></tr></thead><tbody>' +
      c.filas
        .map((r) => `<tr><td>${r.i}</td><td>${+r.t.toPrecision(6)}</td><td>${fmt(r.exacta, 5)}</td><td>${fmt(r.heun, 5)}</td><td>${fmt(r.rk4, 5)}</td><td>${fe(r.absHeun)}</td><td>${fe(r.absRK4)}</td><td>${fe(r.relHeun)}</td><td>${fe(r.relRK4)}</td></tr>`)
        .join('') +
      '</tbody>';
  }

  /* ----------------- Interpretación y conclusiones (texto) ---------------- */
  function renderInterpretacion() {
    const s = estado.sim;
    const { v, C, corridas, meta, conv, verif } = s;
    const nombreLift = LIFTS[s.lift].nombre.toLowerCase();
    const quien = s.deportista.id ? s.deportista.nombre : 'el deportista simulado';
    const yT = O.exacta(v.T, C, v.y0);
    const [c1, c2] = corridas;
    const [r1, r2] = [c1.resumen, c2.resumen];

    const p = [];
    p.push(
      `<p><b>Qué muestra el modelo.</b> Con los parámetros hipotéticos ingresados, la fuerza en ${esc(nombreLift)} de ${esc(quien)} pasaría de ${fmt(v.y0, 1)} kg a ${fmt(yT, 1)} kg en ${v.T} semanas, acercándose a un equilibrio de ${fmt(C.yEq, 1)} kg. Como λ = ${fmt(C.lambda, 4)} 1/semana, el avance recorre cerca del 95 % del camino hacia ese equilibrio en unas ${fmt(3 / C.lambda, 0)} semanas: al principio se gana rápido y luego cada kilo cuesta más.</p>`
    );
    if (meta.alcanzable && meta.t > 0) {
      p.push(
        `<p><b>Respuesta a la pregunta del desafío.</b> Según la solución analítica, la meta de ${v.meta} kg se alcanzaría hacia la <b>semana ${fmt(meta.t, 1)}</b>${meta.t > v.T ? ', es decir, después del intervalo simulado (aumenta T para verla en la gráfica)' : ''}. Es una referencia para comparar escenarios, no una promesa.</p>`
      );
    } else if (!meta.alcanzable) {
      p.push(
        `<p><b>Respuesta a la pregunta del desafío.</b> Con estos parámetros la meta de ${v.meta} kg queda por encima del equilibrio (${fmt(C.yEq, 1)} kg), así que el modelo <b>no la alcanza</b>. Para lograrla tendrían que cambiar los supuestos: más constancia o sesiones (mayor I), mayor tasa k, menor pérdida δ o un techo M más alto.</p>`
      );
    }
    const peor = Math.max(r1.maxAbsHeun, r2.maxAbsHeun);
    const comunidad =
      peor < 0.5
        ? 'En la práctica la diferencia es menor que medio kilo: nadie la notaría frente a la variabilidad natural de un 1RM, por lo que con estos pasos ambos métodos servirían para planificar.'
        : peor < 2.5
        ? `El error de Heun (hasta ${fmt(peor, 2)} kg) ya es del tamaño de un pequeño incremento de carga (1–2.5 kg); conviene reducir h o usar RK4.`
        : `El error de Heun (hasta ${fmt(peor, 1)} kg) ya supera un incremento típico de carga: con ese paso la aproximación podría llevar a planificar mal.`;
    p.push(
      `<p><b>Qué tan precisas son las aproximaciones.</b> Con h = ${c1.h} semanas, el error absoluto máximo fue ${fe(r1.maxAbsHeun)} kg en Heun y ${fe(r1.maxAbsRK4)} kg en RK4; con h = ${c2.h}, ${fe(r2.maxAbsHeun)} kg y ${fe(r2.maxAbsRK4)} kg. ${comunidad}</p>`
    );
    const hmax = Math.max(c1.h, c2.h);
    const hmin = Math.min(c1.h, c2.h);
    const [rg, rp] = c1.h >= c2.h ? [r1, r2] : [r2, r1];
    if (hmax > hmin && rp.maxAbsHeun > 0 && rp.maxAbsRK4 > 0) {
      p.push(
        `<p><b>Efecto del tamaño de paso.</b> Al pasar de h = ${hmax} a h = ${hmin}, el error de Heun se redujo ×${fmt(rg.maxAbsHeun / rp.maxAbsHeun, 1)} (la teoría de orden 2 anticipa ≈ ×${fmt(Math.pow(hmax / hmin, 2), 1)}) y el de RK4 ×${fmt(rg.maxAbsRK4 / rp.maxAbsRK4, 1)} (orden 4: ≈ ×${fmt(Math.pow(hmax / hmin, 4), 1)}).</p>`
      );
    }
    if (s.advertencias.length) p.push(`<p><b>Atención.</b> ${s.advertencias.map(esc).join(' ')}</p>`);
    $('interpretacion').innerHTML = p.join('');

    const ult = conv[conv.length - 1];
    const gana = [r1, r2].filter((r) => r.mejor === 'RK4').length;
    const lis = [];
    lis.push(
      `<b>Menor error:</b> ${gana === 2 ? 'RK4 produjo menor error máximo que Heun en los dos tamaños de paso ensayados' : gana === 0 ? 'Heun produjo menor error en ambos pasos (revisa la estabilidad y los valores ingresados)' : 'el método con menor error depende del paso; revisa la tabla comparativa'}${Number.isFinite(r2.factor) && r2.factor > 1 ? `; con h = ${c2.h} fue ≈ ×${fmt(r2.factor, 0)} más preciso` : ''}.`
    );
    lis.push(`<b>Orden de convergencia observado</b> (última fila del estudio): Heun ≈ ${ult.ordenHeun === null ? '—' : fmt(ult.ordenHeun, 2)} y RK4 ≈ ${ult.ordenRK4 === null ? '—' : fmt(ult.ordenRK4, 2)}, en línea con el orden teórico 2 y 4.`);
    lis.push(`<b>Solución analítica verificada:</b> cumple y(0) = y₀ (diferencia ${verif.errorCI.toExponential(1)}) y la EDO con un residuo máximo de ${verif.maxResiduo.toExponential(1)}, es decir, cero salvo redondeo.`);
    lis.push('<b>Reducir h mejora ambos métodos</b>, pero RK4 gana más por cada reducción; a cambio evalúa f cuatro veces por paso (Heun, dos).');
    lis.push('<b>Limitación:</b> los parámetros son hipotéticos y el modelo es una simplificación; los errores medidos son numéricos (frente a la solución exacta del mismo modelo), no fisiológicos. No sustituye la guía de un entrenador.');
    $('conclusiones').innerHTML = lis.map((x) => `<li>${x}</li>`).join('');
  }

  /* ------------------------------ Historial ------------------------------ */
  $('btn-guardar-sim').addEventListener('click', async () => {
    const s = estado.sim;
    if (!s) return;
    await DB.guardarSimulacion({
      athleteId: s.deportista.id,
      athleteName: s.deportista.nombre,
      lift: s.lift,
      entrada: s.v,
      coef: { lambda: s.C.lambda, yEq: s.C.yEq, I: s.C.I },
      tMeta: s.meta.alcanzable ? s.meta.t : null,
      corridas: s.corridas.map((c) => ({ h: c.h, n: c.n, resumen: c.resumen })),
      creado: new Date().toISOString(),
    });
    $('msg-guardado').textContent = '✔ Guardada en el historial.';
    renderEstadoDB();
  });

  async function renderHistorial() {
    const lista = (await DB.listarSimulaciones()).sort((a, b) => (a.creado < b.creado ? 1 : -1));
    const host = $('lista-historial');
    if (!lista.length) {
      host.innerHTML = '<p class="vacio">Aún no hay simulaciones guardadas. Usa “Guardar en el historial” en el simulador.</p>';
      return;
    }
    host.innerHTML = lista
      .map((h) => {
        const [a, b] = h.corridas;
        const fecha = new Date(h.creado).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' });
        return `<article class="tarjeta item-his">
          <h2>${esc(h.athleteName)} · ${esc(LIFTS[h.lift] ? LIFTS[h.lift].nombre : h.lift)}</h2>
          <div class="datos">
            <span>${esc(fecha)}</span>
            <span>y₀ <b>${h.entrada.y0} kg</b> → meta <b>${h.entrada.meta} kg</b></span>
            <span>T <b>${h.entrada.T} sem</b></span>
            <span>λ <b>${fmt(h.coef.lambda, 4)}</b></span>
            <span>y_eq <b>${fmt(h.coef.yEq, 1)} kg</b></span>
            <span>Semana de la meta <b>${h.tMeta === null ? 'no alcanzable' : fmt(h.tMeta, 1)}</b></span>
          </div>
          <div class="datos">
            <span>h = <b>${a.h}</b>: error máx. Heun <b>${fe(a.resumen.maxAbsHeun)}</b> · RK4 <b>${fe(a.resumen.maxAbsRK4)}</b> kg</span>
            <span>h = <b>${b.h}</b>: error máx. Heun <b>${fe(b.resumen.maxAbsHeun)}</b> · RK4 <b>${fe(b.resumen.maxAbsRK4)}</b> kg</span>
          </div>
          <div class="acciones">
            <button class="btn chico primario" data-acc="cargar" data-id="${h.id}">Volver a simular</button>
            <button class="btn chico peligro" data-acc="borrar" data-id="${h.id}">Eliminar</button>
          </div>
        </article>`;
      })
      .join('');
  }

  $('lista-historial').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-acc]');
    if (!b) return;
    const id = Number(b.dataset.id);
    if (b.dataset.acc === 'borrar') {
      await DB.eliminarSimulacion(id);
      renderHistorial();
      renderEstadoDB();
    } else if (b.dataset.acc === 'cargar') {
      const h = (await DB.listarSimulaciones()).find((x) => x.id === id);
      if (!h) return;
      const existe = h.athleteId && estado.deportistas.some((d) => d.id === h.athleteId);
      $('s-deportista').value = existe ? String(h.athleteId) : '';
      $('s-lift').value = h.lift;
      ponerValores(h.entrada);
      estado.sim = null;
      navegar('simulador');
    }
  });

  $('btn-vaciar').addEventListener('click', async () => {
    if (confirm('¿Vaciar todo el historial de simulaciones?')) {
      await DB.vaciarHistorial();
      renderHistorial();
      renderEstadoDB();
    }
  });

  $('btn-exportar').addEventListener('click', async () => {
    const datos = await DB.exportar();
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sportlift-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('archivo-importar').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      const obj = JSON.parse(await archivo.text());
      if (!confirm('Importar reemplazará los deportistas y el historial actuales. ¿Continuar?')) return;
      await DB.importar(obj);
      await cargarDeportistas();
      renderDeportistas();
      renderHistorial();
      renderEstadoDB();
      estado.sim = null;
    } catch (err) {
      alert('No se pudo importar: ' + err.message);
    }
  });

  /* ------------------------------ Estado y arranque ---------------------- */
  async function renderEstadoDB() {
    const sims = await DB.listarSimulaciones();
    const donde = { IndexedDB: 'IndexedDB del navegador', localStorage: 'localStorage del navegador', memoria: 'memoria temporal (se perderá al cerrar la pestaña)' }[DB.backend];
    $('estado-db').textContent = `Base de datos local: ${estado.deportistas.length} deportista(s) y ${sims.length} simulación(es) guardadas en ${donde}.`;
  }

  async function arrancar() {
    await DB.abrir();
    await cargarDeportistas();
    let sembrado = false;
    try { sembrado = localStorage.getItem('sportlift:sembrado') === '1'; } catch (_) { /* sin almacenamiento */ }
    if (!estado.deportistas.length && !sembrado) {
      for (const d of DEMO) await DB.guardarDeportista({ ...d, creado: new Date().toISOString() });
      try { localStorage.setItem('sportlift:sembrado', '1'); } catch (_) { /* ignorar */ }
      await cargarDeportistas();
    }
    construirCamposLifts();
    renderDeportistas();
    // valores iniciales del simulador
    if (estado.deportistas.length) {
      $('s-deportista').value = String(estado.deportistas[0].id);
      ponerValores({ ...valoresPorDefecto() });
      cargarValoresDeportista();
    } else {
      ponerValores(valoresPorDefecto());
    }
    renderEstadoDB();
    navegar(location.hash.slice(1) || 'inicio', { empujar: false });
  }

  arrancar().catch((err) => {
    console.error(err);
    $('estado-db').textContent = 'Error al iniciar la base de datos: ' + err.message;
  });
})();
