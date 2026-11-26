import { useSyncExternalStore } from 'react';

export interface OnlineEventTargetLike {
  addEventListener(type: 'online' | 'offline', listener: () => void): void;
  removeEventListener(type: 'online' | 'offline', listener: () => void): void;
}

export function subscribeOnlineStatus(
  onStoreChange: () => void,
  target: OnlineEventTargetLike | undefined = typeof window !== 'undefined' ? window : undefined,
): () => void {
  if (!target) return () => undefined;
  target.addEventListener('online', onStoreChange);
  target.addEventListener('offline', onStoreChange);
  return () => {
    target.removeEventListener('online', onStoreChange);
    target.removeEventListener('offline', onStoreChange);
  };
}

export function readOnlineSnapshot(
  nav: { onLine?: boolean } | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): boolean {
  return nav?.onLine ?? true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    onStoreChange => subscribeOnlineStatus(onStoreChange),
    () => readOnlineSnapshot(),
    () => true,
  );
}
