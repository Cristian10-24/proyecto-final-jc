import type { ItemA, TemaB } from "./criterios";

// Ayudas «?» de la pantalla de evaluar: qué se evalúa en cada criterio de la Parte A y en cada tema de la Parte B, y
// qué tener en cuenta según la ruta del proyecto. ÚNICO lugar de estos textos: se editan aquí.
// Reglas (tests/ayudas.test.ts): una entrada por cada criterio y tema, ningún texto vacío, máximo 220 caracteres cada uno.
// Solo orientan al mentor: no cambian los criterios, las escalas ni el cálculo del resultado.

export type Ayuda = {
  /** Qué se evalúa principalmente. */
  principal: string;
  /** Qué tener en cuenta en la ruta básica (proyecto más simple, sin React ni servidor propio). */
  basica: string;
  /** Qué tener en cuenta en la ruta avanzada (React, servidor y base de datos). */
  avanzada: string;
};

export const MAX_AYUDA = 220;

export const AYUDAS: Record<ItemA | TemaB, Ayuda> = {
  a1: {
    principal: "Que abra desde una dirección de internet y no desde el computador del estudiante. Abre el enlace tú mismo durante la presentación.",
    basica: "Basta con una página publicada y accesible; es normal que sea estática.",
    avanzada: "Debe estar publicado el frontend y, si hay servidor, que responda desde internet.",
  },
  a2: {
    principal: "Identidad visual (nombre, colores, logo), navegación clara y productos o servicios completos con su descripción.",
    basica: "Un catálogo sencillo con pocos productos es suficiente; valora que se vea ordenado y coherente.",
    avanzada: "Se espera un catálogo más completo y una navegación clara entre secciones.",
  },
  a3: {
    principal: "Que envíe una solicitud en vivo y quede guardada o enviada; no basta con que el formulario se vea. Pídele que envíe una ahora.",
    basica: "Puede resolverse con un servicio de formularios o un correo; valora que funcione de verdad.",
    avanzada: "Se espera que lo reciba su propio servidor y lo guarde en la base de datos; verifica que quedó el registro.",
  },
  a4: {
    principal: "Que pueda iniciar sesión y entrar a un panel privado.",
    basica: "Puede ser una versión sencilla del acceso y del panel; valora lo que funcione y usa Parcial si existe pero es muy básico.",
    avanzada: "Se espera un inicio de sesión real y un panel que solo se vea después de ingresar.",
  },
  a5: {
    principal: "Preguntas frecuentes interactivas con respuestas útiles para el cliente, no solo texto fijo.",
    basica: "Puede ser sencillo: preguntas y respuestas fijas con botones o un desplegable.",
    avanzada: "Se espera más interacción, por ejemplo respuestas que cambian según lo que el cliente elija o escriba.",
  },
  a6: {
    principal: "Que se siga viendo bien al achicar la ventana o en el celular. Pruébalo reduciendo el ancho en vivo.",
    basica: "Revisa lo esencial: textos legibles, imágenes que no se salen y menú usable.",
    avanzada: "Revisa también formularios, tablas o paneles en pantallas pequeñas.",
  },
  a7: {
    principal: "Que muestre el repositorio con mínimo 10 commits y un historial que tenga sentido.",
    basica: "Lo normal es un solo repositorio; revisa que tenga al menos 10 commits.",
    avanzada: "Si hay frontend y backend, revisa el historial de ambos repositorios.",
  },
  b1: {
    principal: "Que explique una parte reutilizable de su interfaz y cómo recibe los datos.",
    basica: "Si no usa React, pregunta por algo que repita (una tarjeta de producto, una función) y cómo le pasa la información. Puedes dejar el tema sin marcar.",
    avanzada: "Que muestre un componente de React, sus props y dónde lo reutiliza.",
  },
  b2: {
    principal: "Que explique cómo cambia lo que se ve cuando cambian los datos.",
    basica: "Sin React, pregunta cómo actualiza la página con JavaScript (eventos, cambiar contenido, traer datos). Puedes dejar el tema sin marcar.",
    avanzada: "Que muestre dónde usa useState o useEffect y cómo llegan los datos del catálogo a la pantalla.",
  },
  b3: {
    principal: "Que explique qué ruta recibe el formulario y qué hace con los datos.",
    basica: "Es normal que no tenga servidor propio; si usa un servicio externo para el formulario, pídele que explique cómo funciona. Puedes dejar el tema sin marcar.",
    avanzada: "Que muestre la ruta del servidor que recibe el formulario y qué responde.",
  },
  b4: {
    principal: "Dónde quedó guardada la solicitud y cómo se definió.",
    basica: "Es normal que no use base de datos; si guarda en otro lugar, que explique dónde. Puedes dejar el tema sin marcar.",
    avanzada: "Que muestre el esquema de Mongoose y el registro guardado.",
  },
  b5: {
    principal: "Que explique el recorrido de un dato: del formulario al lugar donde se guarda y de vuelta a la pantalla.",
    basica: "Que lo explique con sus palabras dentro de lo que construyó, aunque sea sencillo.",
    avanzada: "Que explique el recorrido completo entre frontend, servidor y base de datos.",
  },
};

/** Aviso corto bajo el chip de ruta, en el encabezado del formulario. */
export const AVISO_RUTA = {
  Básica: "En la ruta básica es normal que el proyecto sea más simple y que no use React ni servidor. Evalúa lo que sí hizo.",
  Avanzada: "En la ruta avanzada es más esperable que use React, un servidor y una base de datos.",
} as const;

/** Línea extra en el encabezado de la Parte B, solo para la ruta básica. */
export const NOTA_B_BASICA = "Califica mínimo 2 temas; deja sin marcar los que no apliquen.";
