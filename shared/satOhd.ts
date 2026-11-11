/**
 * Claves SAT (catálogo de productos y servicios) que usa OHD en sus facturas y remisiones.
 * Fuente: "PRODUCTOS Y SERV. DE OHD (SAT).xlsx" (2026-11). Las palabras clave son las del
 * Excel; la sugerencia es solo una propuesta: el ingeniero la confirma o la cambia.
 */

export interface SatOhdKey { code: string; name: string; keywords: string[] }

export const SAT_OHD_CATALOG: SatOhdKey[] = [
  { code: '23151607', name: 'Prensas', keywords: [] },
  { code: '23152200', name: 'Mesa y estantes para fabricación', keywords: ['MESA'] },
  { code: '23153000', name: 'Dispositivos y sistemas de guía, posicionamiento y sujeción', keywords: ['FIXTURE'] },
  { code: '23153035', name: 'Placa', keywords: ['PLACA'] },
  { code: '23153100', name: 'Componentes y accesorios de maquinaria industrial', keywords: ['VISAGRA', 'BISAGRA', 'BRACKET', 'POLYTECH'] },
  { code: '23153418', name: 'Accesorios o herramientas para ensamble a la medida', keywords: ['NIDO', 'COPLE', 'BASE CON AJUSTE', 'POLYTECH'] },
  { code: '23241600', name: 'Herramientas cortadoras de metales', keywords: [] },
  { code: '23242120', name: 'Base de tabla de máquina', keywords: ['POLYTECH', 'BASE GIRATORIA'] },
  { code: '23251800', name: 'Troqueles y herramientas para el formado de metales', keywords: ['DADO', 'TROQUEL', 'PUNZON', 'MATRIZ', 'MATRICES', 'MOLDE'] },
  { code: '24101504', name: 'Carretones de mano o accesorios', keywords: ['CARRITO'] },
  { code: '24101700', name: 'Transportadores y accesorios', keywords: ['CINTA TRANSPORTADORA', 'CINTAS TRANSPORTADORAS', 'RODILLO', 'CONVEYOR'] },
  { code: '24141500', name: 'Suministros para seguridad y protección', keywords: ['GUARDA DE LEXAN'] },
  { code: '27111500', name: 'Herramientas de corte y engarzado y punzones', keywords: ['PUNZON', 'NAVAJA'] },
  { code: '27112810', name: 'Equipos para reparar roscas', keywords: [] },
  { code: '27131500', name: 'Herramientas neumáticas', keywords: ['POLYTECH'] },
  { code: '27131703', name: 'Pistones de cilindro neumático', keywords: [] },
  { code: '30103800', name: 'Fibras y filamentos mecánicos', keywords: ['FILAMENTO'] },
  { code: '31133706', name: 'Recubrimiento conformal de acrílico', keywords: ['GUARDA DE ACRILICO', 'GUARDAS DE ACRILICO'] },
  { code: '31161500', name: 'Tornillos', keywords: ['TORNILLO'] },
  { code: '31161700', name: 'Tuercas', keywords: [] },
  { code: '31391500', name: 'Maquinados de precisión estándar', keywords: ['TOPE', 'MECANISMO', 'GAGE', 'REPUESTO', 'FAB DE INTERFACES'] },
  { code: '31391501', name: 'Maquinado de precisión estándar de plástico', keywords: [] },
  { code: '31391502', name: 'Maquinado de precisión estándar de cerámica', keywords: [] },
  { code: '31391503', name: 'Maquinado de precisión estándar de acero', keywords: [] },
  { code: '31391504', name: 'Maquinado de precisión estándar de acero inoxidable', keywords: [] },
  { code: '31391505', name: 'Maquinado de precisión estándar de aluminio', keywords: [] },
  { code: '31391506', name: 'Maquinado de precisión estándar de latón', keywords: [] },
  { code: '31391600', name: 'Maquinados de precisión media', keywords: [] },
  { code: '31391601', name: 'Maquinado de precisión media de plástico', keywords: [] },
  { code: '31391602', name: 'Maquinado de precisión media de cerámica', keywords: [] },
  { code: '31391603', name: 'Maquinado de precisión media de acero', keywords: [] },
  { code: '31391604', name: 'Maquinado de precisión media de acero inoxidable', keywords: [] },
  { code: '31391605', name: 'Maquinado de precisión media de aluminio', keywords: [] },
  { code: '31391606', name: 'Maquinado de precisión media de latón', keywords: [] },
  { code: '31391700', name: 'Maquinados de precisión alta', keywords: [] },
  { code: '31391701', name: 'Maquinado de alta precisión de plástico', keywords: [] },
  { code: '31391702', name: 'Maquinado de alta precisión de cerámica', keywords: [] },
  { code: '31391703', name: 'Maquinado de alta precisión de acero', keywords: [] },
  { code: '31391704', name: 'Maquinado de alta precisión de acero inoxidable', keywords: [] },
  { code: '31391705', name: 'Maquinado de alta precisión de aluminio', keywords: ['PLACA DE ALUMINIO', 'BASE DE ALUMINIO', 'SOPORTE DE ALUMINIO', 'SPACER', 'PIEZAS DE ALUMINIO'] },
  { code: '31391706', name: 'Maquinado de alta precisión de latón', keywords: [] },
  { code: '32151700', name: 'Controladores lógicos programables', keywords: ['PROGRAMACION ESTACION', 'PROGRAMACION DE ESTACION'] },
  { code: '32151900', name: 'Dispositivos de automatización de control de la conectividad', keywords: ['AUTOMATIZACION'] },
  { code: '39101600', name: 'Lámparas y bombillas', keywords: ['LAMPARA'] },
  { code: '39121600', name: 'Dispositivos y accesorios para la protección de circuitos', keywords: ['PORTAFUSIBLE', 'FUSIBLE'] },
  { code: '39121607', name: 'Fusible', keywords: [] },
  { code: '43211900', name: 'Monitores y pantallas de computador', keywords: [] },
  { code: '56111707', name: 'Repisas no modulares', keywords: ['REPISA'] },
  { code: '72151802', name: 'Servicio de refacción y reparación de componentes de maquinaria', keywords: ['POLYTECH', 'REPARACION'] },
  { code: '73152100', name: 'Servicios de mantenimiento y reparación de equipo de manufactura', keywords: ['CAMBIO DE ESTRIADO', 'CAMBIO DE CABLEADO', 'RETRABAJO DE SPROKET', 'MANTENIMIENTO'] },
  { code: '73152101', name: 'Servicio de mantenimiento de equipo industrial', keywords: ['REP DE ESTACION', 'KOHLER'] },
  { code: '73152102', name: 'Servicio de reparación de equipo industrial', keywords: [] },
  { code: '73152103', name: 'Servicios de mantenimiento de equipos de ingeniería', keywords: [] },
  { code: '73152104', name: 'Servicio de mantenimiento y reparación de equipos para empacar', keywords: [] },
  { code: '73152105', name: 'Refacción de equipos de pruebas', keywords: [] },
  { code: '73152106', name: 'Servicio de mantenimiento y reparación de equipos para calentar y hornear', keywords: [] },
  { code: '73152107', name: 'Servicio de reconstrucción y refacción de equipos maquinados', keywords: [] },
  { code: '73181000', name: 'Servicios de maquinado', keywords: [] },
  { code: '73181900', name: 'Servicios de soldadura', keywords: ['SOLDADURA'] },
  { code: '81101600', name: 'Ingeniería mecánica (diseño)', keywords: ['MEJORA DE CANDADO', 'SISTEMA DE CANDADEO', 'SITEMA DE CANDADEO', 'MODIFICACION DE ESTACION', 'CALIBRACION DE PISTON'] },
  { code: '81101700', name: 'Ingeniería eléctrica y electrónica', keywords: [] },
];

const BY_CODE = new Map(SAT_OHD_CATALOG.map(k => [k.code, k]));

export const isOhdPartner = (partnerName: string) => /\bohd\b|overhead door/i.test(partnerName);
export const isSatOhdCode = (code: unknown): code is string => typeof code === 'string' && BY_CODE.has(code);
export const satOhdName = (code: string) => BY_CODE.get(code)?.name ?? null;

/** Mayúsculas, sin acentos y sin signos: "Fab. de interfaces" → " FAB DE INTERFACES ". */
const normalize = (s: string) =>
  ` ${s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()} `;

/**
 * Clave sugerida para una descripción: la de la palabra clave más larga que aparezca al inicio
 * de una palabra ("PUNZON" encuentra "PUNZONES"). Si la más larga apunta a varias claves
 * (p. ej. "POLYTECH") o nada coincide, no sugiere: el ingeniero escoge.
 */
export function suggestSatOhdCode(description: string): string | null {
  const text = normalize(description);
  let best = 0;
  let codes = new Set<string>();
  for (const key of SAT_OHD_CATALOG) {
    for (const kw of key.keywords) {
      const word = normalize(kw).trim();
      if (!text.includes(` ${word}`)) continue;
      if (word.length > best) { best = word.length; codes = new Set([key.code]); }
      else if (word.length === best) codes.add(key.code);
    }
  }
  return codes.size === 1 ? [...codes][0] : null;
}
