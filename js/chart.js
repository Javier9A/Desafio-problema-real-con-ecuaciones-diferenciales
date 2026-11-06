/**
 * SportLift · Gráficas SVG sin dependencias
 * ---------------------------------------------------------------------------
 * dibujarGrafica(contenedor, config)
 *   config = {
 *     series: [{ nombre, color, puntos:[[x,y],…], trazo:'solido'|'guion', grosor, marcador:'circulo'|'cuadrado'|'rombo'|'aro'|null, linea:true }],
 *     etiquetaX, etiquetaY, logY:boolean, formatoY(v), formatoTooltip(serie, x, y), titulo (para lectores de pantalla)
 *   }
 * Es responsiva: se vuelve a dibujar con el ancho del contenedor.
 * Incluye leyenda HTML y tooltip (ratón o toque).
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /** Marcas "bonitas" para un eje lineal. */
  function marcasLineales(min, max, objetivo = 6) {
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const bruto = (max - min) / objetivo;
    const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    const f = bruto / pot;
    const paso = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pot;
    const ini = Math.floor(min / paso) * paso;
    const fin = Math.ceil(max / paso) * paso;
    const marcas = [];
    for (let v = ini; v <= fin + paso * 1e-9; v += paso) marcas.push(+v.toPrecision(12));
    return marcas;
  }

  function formatoMarca(v) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return v.toExponential(0);
    return String(+v.toPrecision(6));
  }

  function simbolo(tipo, x, y, color) {
    const r = 4;
    switch (tipo) {
      case 'cuadrado':
        return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${color}"/>`;
      case 'rombo':
        return `<path d="M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z" fill="${color}"/>`;
      case 'aro':
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="var(--c-surface)" stroke="${color}" stroke-width="2"/>`;
      case 'circulo':
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
      default:
        return '';
    }
  }

  function dibujarGrafica(host, cfg) {
    const ancho = Math.max(280, Math.floor(host.clientWidth || host.parentElement.clientWidth || 600));
    const alto = ancho < 520 ? 300 : 380;
    const m = { l: cfg.logY ? 58 : 54, r: 14, t: 14, b: 46 };
    const w = ancho - m.l - m.r;
    const h = alto - m.t - m.b;

    const series = cfg.series.map((s) => ({
      ...s,
      puntos: cfg.logY ? s.puntos.filter((p) => p[1] > 0) : s.puntos,
    }));
    const todos = series.flatMap((s) => s.puntos);
    if (!todos.length) {
      host.innerHTML = '<p class="vacio">Sin datos para graficar.</p>';
      return;
    }
    let xmin = Math.min(...todos.map((p) => p[0]));
    let xmax = Math.max(...todos.map((p) => p[0]));
    let ymin = Math.min(...todos.map((p) => p[1]));
    let ymax = Math.max(...todos.map((p) => p[1]));

    let marcasY;
    let ty;
    if (cfg.logY) {
      const e0 = Math.floor(Math.log10(ymin));
      let e1 = Math.ceil(Math.log10(ymax));
      if (e1 === e0) e1 = e0 + 1;
      marcasY = [];
      for (let e = e0; e <= e1; e++) marcasY.push(Math.pow(10, e));
      ty = (v) => m.t + h - ((Math.log10(v) - e0) / (e1 - e0)) * h;
    } else {
      const pad = (ymax - ymin || 1) * 0.06;
      marcasY = marcasLineales(ymin - pad, ymax + pad);
      const a = marcasY[0];
      const b = marcasY[marcasY.length - 1];
      ty = (v) => m.t + h - ((v - a) / (b - a)) * h;
    }
    const marcasX = marcasLineales(xmin, xmax, ancho < 520 ? 5 : 8);
    const xa = Math.min(xmin, marcasX[0]);
    const xb = Math.max(xmax, marcasX[marcasX.length - 1]);
    const tx = (v) => m.l + ((v - xa) / (xb - xa || 1)) * w;

    let svg = `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img" aria-label="${esc(cfg.titulo || 'Gráfica')}">`;
    // rejilla y ejes
    marcasY.forEach((v) => {
      const y = ty(v);
      svg += `<line x1="${m.l}" x2="${m.l + w}" y1="${y}" y2="${y}" class="rejilla"/>`;
      svg += `<text x="${m.l - 8}" y="${y + 4}" text-anchor="end" class="marca">${esc(cfg.logY ? formatoMarca(v) : formatoMarca(v))}</text>`;
    });
    marcasX.forEach((v) => {
      if (v < xa || v > xb) return;
      const x = tx(v);
      svg += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${m.t + h}" class="rejilla rejilla-x"/>`;
      svg += `<text x="${x}" y="${m.t + h + 18}" text-anchor="middle" class="marca">${esc(formatoMarca(v))}</text>`;
    });
    svg += `<line x1="${m.l}" x2="${m.l + w}" y1="${m.t + h}" y2="${m.t + h}" class="eje"/>`;
    svg += `<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + h}" class="eje"/>`;
    svg += `<text x="${m.l + w / 2}" y="${alto - 6}" text-anchor="middle" class="etiqueta">${esc(cfg.etiquetaX || '')}</text>`;
    svg += `<text transform="translate(14 ${m.t + h / 2}) rotate(-90)" text-anchor="middle" class="etiqueta">${esc(cfg.etiquetaY || '')}</text>`;

    // series: primero líneas, luego marcadores (los de la última serie quedan encima)
    series.forEach((s) => {
      if (s.linea === false || s.puntos.length < 2) return;
      const d = s.puntos.map((p, i) => `${i ? 'L' : 'M'}${tx(p[0]).toFixed(1)} ${ty(p[1]).toFixed(1)}`).join('');
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.grosor || 2}" stroke-linejoin="round" ${s.trazo === 'guion' ? 'stroke-dasharray="7 5"' : ''}/>`;
    });
    series.forEach((s) => {
      if (!s.marcador) return;
      s.puntos.forEach((p) => {
        svg += simbolo(s.marcador, +tx(p[0]).toFixed(1), +ty(p[1]).toFixed(1), s.color);
      });
    });
    svg += `<line class="guia" x1="0" x2="0" y1="${m.t}" y2="${m.t + h}" style="display:none"/>`;
    svg += `<rect class="captura" x="${m.l}" y="${m.t}" width="${w}" height="${h}" fill="transparent"/>`;
    svg += '</svg>';

    // leyenda HTML (forma + color, no solo color)
    const leyenda = series
      .map((s) => {
        const trazo = s.trazo === 'guion' ? 'stroke-dasharray="6 4"' : '';
        const lin = s.linea === false ? '' : `<line x1="2" x2="30" y1="9" y2="9" stroke="${s.color}" stroke-width="${s.grosor || 2}" ${trazo}/>`;
        return `<li><svg width="32" height="18" aria-hidden="true">${lin}${simbolo(s.marcador, 16, 9, s.color)}</svg><span>${esc(s.nombre)}</span></li>`;
      })
      .join('');

    host.innerHTML = `<div class="grafica-lienzo">${svg}<div class="tooltip" role="status" hidden></div></div><ul class="leyenda">${leyenda}</ul>`;

    // interacción
    const lienzo = host.querySelector('.grafica-lienzo');
    const captura = host.querySelector('.captura');
    const guia = host.querySelector('.guia');
    const tip = host.querySelector('.tooltip');
    const fmtY = cfg.formatoY || ((v) => String(+v.toPrecision(6)));

    function mover(ev) {
      const rect = lienzo.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const xval = xa + ((px - m.l) / w) * (xb - xa);
      // x más cercana en cualquier serie
      let mejor = null;
      series.forEach((s) =>
        s.puntos.forEach((p) => {
          if (mejor === null || Math.abs(p[0] - xval) < Math.abs(mejor - xval)) mejor = p[0];
        })
      );
      if (mejor === null) return;
      const gx = tx(mejor);
      guia.setAttribute('x1', gx);
      guia.setAttribute('x2', gx);
      guia.style.display = '';
      const filas = series
        .map((s) => {
          let q = null;
          s.puntos.forEach((p) => {
            if (q === null || Math.abs(p[0] - mejor) < Math.abs(q[0] - mejor)) q = p;
          });
          if (!q || Math.abs(q[0] - mejor) > (xb - xa) * 0.02) return '';
          return `<div><i style="background:${s.color}"></i>${esc(s.nombre)}: <b>${esc(fmtY(q[1]))}</b></div>`;
        })
        .join('');
      tip.innerHTML = `<div class="tip-t">${esc(cfg.etiquetaX ? cfg.etiquetaX.split('(')[0].trim() : 'x')} = ${esc(String(+mejor.toPrecision(5)))}</div>${filas}`;
      tip.hidden = false;
      const izq = gx > ancho * 0.55;
      tip.style.left = izq ? '' : gx + 12 + 'px';
      tip.style.right = izq ? ancho - gx + 12 + 'px' : '';
      tip.style.top = m.t + 6 + 'px';
    }
    function salir() {
      guia.style.display = 'none';
      tip.hidden = true;
    }
    captura.addEventListener('pointermove', mover);
    captura.addEventListener('pointerdown', mover);
    captura.addEventListener('pointerleave', salir);
  }

  /** Dibuja y vuelve a dibujar cuando cambia el ancho del contenedor. */
  function montar(host, getConfig) {
    const pintar = () => dibujarGrafica(host, getConfig());
    pintar();
    if (host._ro) host._ro.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      let ultimo = host.clientWidth;
      host._ro = new ResizeObserver(() => {
        if (Math.abs(host.clientWidth - ultimo) > 4) {
          ultimo = host.clientWidth;
          pintar();
        }
      });
      host._ro.observe(host);
    }
  }

  root.SportLiftChart = { dibujarGrafica, montar };
})(typeof self !== 'undefined' ? self : this);
