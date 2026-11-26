/**
 * Selección múltiple por rango inclusivo (`Shift + Click`) sobre filas visibles.
 */

export interface RangeSelectionInput {
  orderedIds: readonly string[];
  current: Record<string, boolean>;
  anchorId: string | null;
  targetId: string;
  checked: boolean;
  shiftKey: boolean;
}

export interface RangeSelectionResult {
  selection: Record<string, boolean>;
  nextAnchorId: string;
}

export function applyRangeSelection({
  orderedIds,
  current,
  anchorId,
  targetId,
  checked,
  shiftKey,
}: RangeSelectionInput): RangeSelectionResult {
  const next: Record<string, boolean> = { ...current };
  const targetIdx = orderedIds.indexOf(targetId);
  const anchorIdx = anchorId !== null ? orderedIds.indexOf(anchorId) : -1;

  if (shiftKey && anchorIdx !== -1 && targetIdx !== -1) {
    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    for (let i = start; i <= end; i++) {
      const id = orderedIds[i];
      if (checked) {
        next[id] = true;
      } else {
        delete next[id];
      }
    }
  } else if (checked) {
    next[targetId] = true;
  } else {
    delete next[targetId];
  }

  return { selection: next, nextAnchorId: targetId };
}
