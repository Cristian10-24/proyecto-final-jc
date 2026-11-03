// Formato de horas: siempre ambas zonas, "8:20 a. m. CO · 10:20 a. m. UY" (ADR 0005).
// Las fechas viven en UTC; CO = America/Bogota (también EC y PA), UY = America/Montevideo.
(function () {
  const opcHora = { hour: 'numeric', minute: '2-digit', hour12: true };
  const fmtCO = new Intl.DateTimeFormat('es-CO', { ...opcHora, timeZone: 'America/Bogota' });
  const fmtUY = new Intl.DateTimeFormat('es-CO', { ...opcHora, timeZone: 'America/Montevideo' });
  const fmtDia = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
  const fmtDiaLargo = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });

  const limpiar = (s) => s.replace(/\s+/g, ' ');

  function horaCO(d) { return limpiar(fmtCO.format(d)); }
  function horaUY(d) { return limpiar(fmtUY.format(d)); }

  function horaDualTexto(d) { return `${horaCO(d)} CO · ${horaUY(d)} UY`; }

  function horaDual(d) {
    return `<span class="hora" aria-label="${horaDualTexto(d)}">` +
      `<span class="hora-co">${horaCO(d)} CO</span>` +
      `<span class="hora-sep" aria-hidden="true">·</span>` +
      `<span class="hora-uy">${horaUY(d)} UY</span></span>`;
  }

  // dia = 'YYYY-MM-DD' (día calendario en Colombia)
  const mediodia = (dia) => new Date(dia + 'T17:00:00Z');
  // "jue 12 nov"
  function etiquetaDia(dia) {
    return limpiar(fmtDia.format(mediodia(dia))).replace(/[.,]/g, '').replace(/ de /g, ' ');
  }
  function etiquetaDiaLarga(dia) { return fmtDiaLargo.format(mediodia(dia)); }

  window.Hora = { horaCO, horaUY, horaDual, horaDualTexto, etiquetaDia, etiquetaDiaLarga };
})();
