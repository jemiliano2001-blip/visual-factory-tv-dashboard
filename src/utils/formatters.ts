/**
 * Formats a PO number to the standard format: 2026/SXXXXX
 * If the PO is numeric or has fewer than 5 digits, it pads it.
 * Example: "546" -> "2026/S00546"
 * Example: "5460" -> "2026/S05460"
 * Example: "2026/S00546" -> "2026/S00546"
 */
export const formatPONumber = (po: string): string => {
  if (!po) return po;
  
  // If it already follows the full format, return as is
  if (po.includes('/') && po.includes('S')) return po;
  
  // Extract only digits
  const digits = po.replace(/\D/g, '');
  
  if (digits.length > 0) {
    // Pad to 5 digits
    const padded = digits.padStart(5, '0');
    return `2026/S${padded}`;
  }
  
  return po;
};
