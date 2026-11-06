/**
 * SportLift · Base de datos pequeña y persistente (en el navegador)
 * ---------------------------------------------------------------------------
 * Usa IndexedDB con dos almacenes ("tablas"):
 *   - athletes     : deportistas, marcas iniciales, metas y parámetros de entrenamiento
 *   - simulations  : historial de simulaciones guardadas
 *
 * Si IndexedDB no está disponible (navegación privada, políticas del navegador),
 * se usa localStorage y, como último recurso, memoria (no persistente).
 * La API es la misma en los tres casos (todas las funciones devuelven Promesas).
 *
 * Los datos NUNCA salen del dispositivo: no hay servidor.
 */
(function (root) {
  'use strict';

  const DB_NAME = 'sportlift';
  const DB_VERSION = 1;
  const STORES = ['athletes', 'simulations'];

  let backend = 'memoria';
  let idb = null;
  const memoria = { athletes: [], simulations: [], seq: { athletes: 0, simulations: 0 } };

  /* ------------------------------ IndexedDB ------------------------------ */
  function abrirIDB() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB no disponible'));
      const rq = root.indexedDB.open(DB_NAME, DB_VERSION);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        db.createObjectStore('athletes', { keyPath: 'id', autoIncrement: true });
        const sims = db.createObjectStore('simulations', { keyPath: 'id', autoIncrement: true });
        sims.createIndex('athleteId', 'athleteId');
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
      rq.onblocked = () => reject(new Error('IndexedDB bloqueada'));
    });
  }

  function idbTx(store, modo, fn) {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(store, modo);
      const rq = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(rq ? rq.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /* ----------------------- localStorage / memoria ------------------------ */
  function lsLeer(store) {
    try {
      return JSON.parse(root.localStorage.getItem('sportlift:' + store) || '[]');
    } catch (_) {
      return memoria[store];
    }
  }
  function lsEscribir(store, lista) {
    try {
      root.localStorage.setItem('sportlift:' + store, JSON.stringify(lista));
    } catch (_) {
      memoria[store] = lista;
    }
  }
  function lsSiguienteId(store) {
    const lista = lsLeer(store);
    return lista.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
  }

  /* ------------------------------- API común ----------------------------- */
  async function abrir() {
    try {
      idb = await abrirIDB();
      backend = 'IndexedDB';
    } catch (_) {
      try {
        root.localStorage.setItem('sportlift:test', '1');
        root.localStorage.removeItem('sportlift:test');
        backend = 'localStorage';
      } catch (__) {
        backend = 'memoria';
      }
    }
    return backend;
  }

  async function listar(store) {
    let datos;
    if (backend === 'IndexedDB') datos = await idbTx(store, 'readonly', (s) => s.getAll());
    else if (backend === 'localStorage') datos = lsLeer(store);
    else datos = memoria[store].slice();
    return datos;
  }

  async function guardar(store, registro) {
    const r = JSON.parse(JSON.stringify(registro));
    if (backend === 'IndexedDB') {
      const id = await idbTx(store, 'readwrite', (s) => s.put(r));
      r.id = id;
    } else if (backend === 'localStorage') {
      const lista = lsLeer(store);
      if (!r.id) r.id = lsSiguienteId(store);
      const i = lista.findIndex((x) => x.id === r.id);
      if (i >= 0) lista[i] = r;
      else lista.push(r);
      lsEscribir(store, lista);
    } else {
      if (!r.id) r.id = ++memoria.seq[store];
      const i = memoria[store].findIndex((x) => x.id === r.id);
      if (i >= 0) memoria[store][i] = r;
      else memoria[store].push(r);
    }
    return r;
  }

  async function eliminar(store, id) {
    if (backend === 'IndexedDB') return idbTx(store, 'readwrite', (s) => s.delete(id));
    if (backend === 'localStorage') return lsEscribir(store, lsLeer(store).filter((x) => x.id !== id));
    memoria[store] = memoria[store].filter((x) => x.id !== id);
    return undefined;
  }

  async function vaciar(store) {
    if (backend === 'IndexedDB') return idbTx(store, 'readwrite', (s) => s.clear());
    if (backend === 'localStorage') return lsEscribir(store, []);
    memoria[store] = [];
    return undefined;
  }

  /* --------------------------- Operaciones de alto nivel ------------------ */
  const api = {
    abrir,
    get backend() {
      return backend;
    },
    listarDeportistas: () => listar('athletes'),
    guardarDeportista: (a) => guardar('athletes', a),
    /** Elimina al deportista y su historial de simulaciones. */
    async eliminarDeportista(id) {
      const sims = (await listar('simulations')).filter((s) => s.athleteId === id);
      for (const s of sims) await eliminar('simulations', s.id);
      return eliminar('athletes', id);
    },
    listarSimulaciones: () => listar('simulations'),
    guardarSimulacion: (s) => guardar('simulations', s),
    eliminarSimulacion: (id) => eliminar('simulations', id),
    vaciarHistorial: () => vaciar('simulations'),

    /** Exporta toda la base como objeto JSON (respaldo). */
    async exportar() {
      return {
        app: 'SportLift',
        version: 1,
        exportado: new Date().toISOString(),
        athletes: await listar('athletes'),
        simulations: await listar('simulations'),
      };
    },
    /** Reemplaza el contenido por un respaldo exportado antes. */
    async importar(obj) {
      if (!obj || obj.app !== 'SportLift' || !Array.isArray(obj.athletes) || !Array.isArray(obj.simulations)) {
        throw new Error('El archivo no es un respaldo válido de SportLift.');
      }
      for (const s of STORES) await vaciar(s);
      for (const a of obj.athletes) await guardar('athletes', a);
      for (const s of obj.simulations) await guardar('simulations', s);
    },
    async borrarTodo() {
      for (const s of STORES) await vaciar(s);
    },
  };

  root.SportLiftDB = api;
})(typeof self !== 'undefined' ? self : this);
