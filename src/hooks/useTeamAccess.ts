import { useQuery } from '@tanstack/react-query';
import { fetchTeamAccess } from '../services/teamAccess';

export function useTeamAccess(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['teamAccess'],
    queryFn: fetchTeamAccess,
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    retry: 1,
  });
}
