// Datos de ejemplo INVENTADOS para los prototipos. Ningún nombre, documento ni link es real.
// Genera de forma determinista: edición 2026, franjas, salas, mentores, monitores,
// disponibilidad, proyectos importados (con franja elegida) y una asignación automática
// que respeta: sin cruces, máx. turnos por mentor, clausura por ciudad y relevo de monitores.
(function () {
  // PRNG con semilla para que los datos sean siempre iguales
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(2026);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const CIUDADES = [
    { id: 'CLO', nombre: 'Cali', pais: 'CO', clausura: '2026-11-14', proyectos: 62 },
    { id: 'CTG', nombre: 'Cartagena', pais: 'CO', clausura: '2026-11-19', proyectos: 40 },
    { id: 'BAQ', nombre: 'Barranquilla', pais: 'CO', clausura: '2026-11-21', proyectos: 44 },
    { id: 'MED', nombre: 'Medellín', pais: 'CO', clausura: '2026-11-24', proyectos: 70 },
    { id: 'GYE', nombre: 'Guayaquil', pais: 'EC', clausura: '2026-11-27', proyectos: 42 },
    { id: 'QTO', nombre: 'Quito', pais: 'EC', clausura: '2026-11-28', proyectos: 48 },
    { id: 'BOG', nombre: 'Bogotá', pais: 'CO', clausura: '2026-12-01', proyectos: 80 },
    { id: 'COL', nombre: 'Colonia', pais: 'UY', clausura: '2026-12-03', proyectos: 30 },
    { id: 'PAY', nombre: 'Uruguay (Paysandú)', pais: 'UY', clausura: '2026-12-05', proyectos: 32 },
    { id: 'PTY', nombre: 'Panamá', pais: 'PA', clausura: '2026-12-05', proyectos: 30 },
  ];
  const ciudadPorId = Object.fromEntries(CIUDADES.map((c) => [c.id, c]));

  // Días con defensas (sáb 14, dom 15 y lun 16 no hay)
  const DIAS = ['2026-11-12', '2026-11-13', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];
  // Franjas de 1 h en hora Colombia; descanso de 12:00 a 2:00 p. m.
  const HORAS = [8, 9, 10, 11, 14, 15, 16, 17];
  const DURACION_TURNO = 20;
  const TURNOS_POR_HORA = 3;
  const NUM_SALAS = 8;

  const utc = (dia, horaCO, min = 0) => {
    const [y, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, horaCO + 5, min));
  };
  const puedeDefender = (ciudad, dia) => dia < ciudadPorId[ciudad].clausura; // antes del día de clausura

  const franjas = DIAS.flatMap((dia) => HORAS.map((h) => ({ id: `${dia}-${h}`, dia, hora: h, inicio: utc(dia, h) })));
  const franjaPorId = Object.fromEntries(franjas.map((f) => [f.id, f]));

  const salas = Array.from({ length: NUM_SALAS }, (_, i) => ({
    id: `s${i + 1}`, numero: i + 1, nombre: `Sala ${i + 1}`,
    link: `https://meet.google.com/jcx-demo-sa${i + 1}`,
  }));

  const NOMBRES = ['Andrea', 'Camilo', 'Valentina', 'Santiago', 'Luisa', 'Mateo', 'Daniela', 'Julián', 'Mariana', 'Sebastián',
    'Paula', 'Nicolás', 'Sara', 'Tomás', 'Laura', 'Felipe', 'Isabela', 'Martín', 'Gabriela', 'Samuel', 'Lucía', 'Emilio',
    'Juliana', 'David', 'Antonia', 'Joaquín', 'Renata', 'Simón', 'Carolina', 'Esteban', 'Manuela', 'Bruno', 'Florencia', 'Agustín'];
  const APELLIDOS = ['Arango', 'Bermúdez', 'Cárdenas', 'Duarte', 'Escobar', 'Fajardo', 'Gaitán', 'Henao', 'Ibarra', 'Jaramillo',
    'Londoño', 'Montoya', 'Naranjo', 'Ocampo', 'Pineda', 'Quintero', 'Restrepo', 'Salazar', 'Toro', 'Uribe', 'Vélez', 'Zapata',
    'Acosta', 'Benítez', 'Castro', 'Ferreira', 'Olivera', 'Sosa', 'Rivas', 'Mejía'];
  const nombre = () => `${pick(NOMBRES)} ${pick(APELLIDOS)}`;
  const ORGS = ['Nodo Sur Software', 'Andina Datos', 'Estudio Faro', 'Red Pacífico Tech', 'Ingenia Lab', 'Colectivo Código'];

  const mentores = Array.from({ length: 20 }, (_, i) => ({
    id: `m${i + 1}`, nombre: nombre(), organizacion: pick(ORGS),
    probabilidad: 0.16 + rng() * 0.3,
  }));
  const monitores = Array.from({ length: 9 }, (_, i) => ({ id: `mo${i + 1}`, nombre: nombre(), apodo: `M-JC ${i + 1}` }));

  // Disponibilidad: franja -> mentor -> cupoMax (1–3). Más mentores entre semana por la mañana.
  const disp = {};
  for (const f of franjas) {
    disp[f.id] = {};
    for (const m of mentores) {
      let p = m.probabilidad;
      if (f.dia <= '2026-11-13') p += 0.12;
      if (f.hora >= 14) p *= 0.75;
      if (f.dia === '2026-11-21') p *= 0.7;
      if (rng() < p) {
        const r = rng();
        disp[f.id][m.id] = r < 0.06 ? 1 : r < 0.2 ? 2 : 3;
      }
    }
  }

  // Proyectos importados desde el Excel de inscripción (franja de 1 h elegida por el estudiante)
  const proyectos = [];
  let n = 0;
  for (const c of CIUDADES) {
    const posibles = franjas.filter((f) => puedeDefender(c.id, f.dia));
    for (let i = 0; i < c.proyectos; i++) {
      n++;
      const pareja = rng() < 0.25;
      const integrantes = [{ nombre: nombre() }];
      if (pareja) integrantes.push({ nombre: nombre() });
      // Preferencias sesgadas a la mañana, como en 2025
      let f = pick(posibles);
      if (f.hora >= 14 && rng() < 0.35) f = pick(posibles);
      proyectos.push({
        id: `P-${String(n).padStart(3, '0')}`, ciudad: c.id,
        modalidad: pareja ? 'pareja' : 'individual', integrantes, franjaElegida: f.id,
      });
    }
  }

  // Asignación automática simulada (en S13 vivirá en libs/scheduling)
  const NOW = utc('2026-11-12', 9, 25); // "ahora" de la demo: jue 12 nov, 9:25 a. m. CO
  const carga = Object.fromEntries(mentores.map((m) => [m.id, 0]));
  const defensas = [];
  const sinAsignar = [];
  const ocupacion = {}; // franjaId -> { salas: [{sala, mentor, cupo}] }

  franjas.forEach((f, fi) => {
    const pedidos = proyectos
      .filter((p) => p.franjaElegida === f.id)
      .sort((a, b) => ciudadPorId[a.ciudad].clausura.localeCompare(ciudadPorId[b.ciudad].clausura));
    const disponibles = Object.entries(disp[f.id])
      .map(([mentor, cupo]) => ({ mentor, cupo }))
      .sort((a, b) => carga[a.mentor] - carga[b.mentor] || a.mentor.localeCompare(b.mentor))
      .slice(0, NUM_SALAS);
    // Se llenan los turnos de cada mentor antes de abrir otra sala; el orden por carga
    // acumulada equilibra entre mentores a lo largo de la edición (RN-11).
    const necesarias = [];
    let cupos = 0;
    for (const d of disponibles) { if (cupos >= pedidos.length) break; necesarias.push(d); cupos += d.cupo; }
    const slots = [];
    necesarias.forEach((d, i) => { for (let t = 0; t < d.cupo; t++) slots.push({ salaIdx: i, mentor: d.mentor, turno: t }); });
    ocupacion[f.id] = { salas: necesarias.map((d, i) => ({ sala: salas[i].id, mentor: d.mentor, cupo: d.cupo })) };

    // Monitores: rotan por franja; en algunas franjas hay relevo a las :40 en la sala 1
    const monitorDe = (salaIdx, turno) => {
      if (salaIdx === 0 && turno === 2 && fi % 3 === 0) return monitores[8].id;
      return monitores[(salaIdx + fi) % 8].id;
    };

    pedidos.forEach((p, k) => {
      const s = slots[k];
      if (!s) { sinAsignar.push(p); return; }
      carga[s.mentor]++;
      const inicio = utc(f.dia, f.hora, s.turno * DURACION_TURNO);
      const fin = new Date(inicio.getTime() + DURACION_TURNO * 60000);
      let estado = 'programada';
      let asistencia = { estudiante: null, pareja: null, mentor: null };
      if (fin <= NOW) {
        const falto = rng() < 0.08;
        estado = falto ? 'no-se-presento' : 'realizada';
        const hora = new Date(inicio.getTime() + 60000);
        asistencia = {
          estudiante: falto ? null : hora,
          pareja: p.modalidad === 'pareja' && !falto ? hora : null,
          mentor: hora,
        };
      } else if (inicio <= NOW) {
        estado = 'en-curso';
        asistencia.mentor = new Date(inicio.getTime() + 30000);
      }
      defensas.push({
        id: `D-${String(defensas.length + 1).padStart(3, '0')}`,
        proyecto: p.id, franja: f.id, turno: s.turno, inicio, fin,
        sala: salas[s.salaIdx].id, mentor: s.mentor, monitor: monitorDe(s.salaIdx, s.turno),
        estado, asistencia, novedades: [], historial: [], version: 1,
      });
    });
  });

  // Un par de defensas reprogramadas para mostrar el estado
  defensas.filter((d) => d.estado === 'programada').slice(5, 7).forEach((d) => {
    d.novedades.push({ tipo: 'reprogramacion', motivo: 'Estudiante sin conexión estable', por: monitores[0].id });
  });

  const proyectoPorId = Object.fromEntries(proyectos.map((p) => [p.id, p]));
  const mentorPorId = Object.fromEntries(mentores.map((m) => [m.id, m]));
  const monitorPorId = Object.fromEntries(monitores.map((m) => [m.id, m]));
  const salaPorId = Object.fromEntries(salas.map((s) => [s.id, s]));

  window.JC = {
    edicion: { nombre: 'JC 2026', duracionTurno: DURACION_TURNO, turnosPorHora: TURNOS_POR_HORA, numSalas: NUM_SALAS },
    CIUDADES, DIAS, HORAS, NOW, franjas, salas, mentores, monitores, disp, proyectos, defensas, sinAsignar, ocupacion,
    ciudadPorId, franjaPorId, proyectoPorId, mentorPorId, monitorPorId, salaPorId,
    utc, puedeDefender,
  };
})();
