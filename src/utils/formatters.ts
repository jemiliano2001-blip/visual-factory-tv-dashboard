/**
 * Formats a PO number to the standard format: YYYY/SXXXXX
 * If the PO is numeric or has fewer than 5 digits, it pads it and prefixes the
 * current year. Example (in 2026): "546" -> "2026/S00546", "5460" -> "2026/S05460".
 * A PO already in full form ("2026/S00546") is returned unchanged.
 */
export const formatPONumber = (po: string): string => {
  if (!po) return po;

  // If it already follows the full format, return as is
  if (po.includes('/') && po.includes('S')) return po;

  // Extract only digits
  const digits = po.replace(/\D/g, '');

  if (digits.length > 0) {
    // Pad to 5 digits and prefix the current year. A hardcoded year would
    // silently break voice PO-matching every January when the sequence rolls over.
    const padded = digits.padStart(5, '0');
    return `${new Date().getFullYear()}/S${padded}`;
  }

  return po;
};
