import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '../firebase';
import { DEFAULT_USER_SETTINGS, seedUserSettings, type UserSettings } from '../services/userSettings';
import { loadUserSettings, saveUserSettings } from '../services/userSettingsStore';

const KEY = ['user-settings'];

function localAppearance() {
  try {
    return {
      theme: localStorage.getItem('adminTheme'),
      density: JSON.parse(localStorage.getItem('vftv:admin:density') ?? 'null'),
    };
  } catch {
    return {};
  }
}

/**
 * Configuración de la cuenta. Sin documento se siembra con la apariencia de este navegador
 * (y se guarda una vez); si falla la lectura, `settings` queda en defaults y el Admin sigue.
 */
export function useUserSettings() {
  const qc = useQueryClient();
  const uid = auth.currentUser?.uid ?? null;
  const query = useQuery({
    queryKey: [...KEY, uid],
    enabled: uid !== null && !auth.currentUser?.isAnonymous,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const stored = await loadUserSettings();
      if (stored) return stored;
      const seeded = seedUserSettings(localAppearance());
      await saveUserSettings(seeded).catch(() => undefined);
      return seeded;
    },
  });
  const mutation = useMutation({
    mutationFn: saveUserSettings,
    onSuccess: (_d, vars) => qc.setQueryData([...KEY, uid], vars),
  });
  const update = useCallback(
    (patch: Partial<UserSettings>) => mutation.mutateAsync({ ...(query.data ?? DEFAULT_USER_SETTINGS), ...patch }),
    [mutation, query.data],
  );
  return {
    settings: query.data ?? DEFAULT_USER_SETTINGS,
    loaded: query.isSuccess,
    error: (query.error ?? mutation.error) as Error | null,
    saving: mutation.isPending,
    update,
  };
}
