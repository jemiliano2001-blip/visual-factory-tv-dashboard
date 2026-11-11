/** Mayúsculas, sin acentos y sin signos: "Fab. de interfaces" → " FAB DE INTERFACES ". */
export const normalizeSatText = (s: string) =>
  ` ${s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()} `;
