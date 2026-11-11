/** Validación de claves SAT contra el catálogo recortado; solo para el servidor (no entra al paquete del navegador). */
import { SAT_CATALOG } from './satCatalogData';

const CODES = new Set(SAT_CATALOG.map(([code]) => code));

export const isKnownSatCode = (code: string): boolean => CODES.has(code);
