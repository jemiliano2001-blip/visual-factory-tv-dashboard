/**
 * ¿La cuenta actual puede editar horarios? Lee el claim `admin` del ID token (el mismo
 * que exigen las reglas de Firestore). Un claim recién otorgado no aparece hasta volver a iniciar sesión.
 */
import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { isAdminClaim } from '../../shared/teamAccess';

export function useCanEditSchedules(): { loading: boolean; canEdit: boolean } {
  const [state, setState] = useState({ loading: true, canEdit: false });
  useEffect(() => {
    let active = true;
    const user = auth.currentUser;
    if (!user) {
      setState({ loading: false, canEdit: false });
      return;
    }
    user.getIdTokenResult()
      .then(result => { if (active) setState({ loading: false, canEdit: isAdminClaim(result.claims) }); })
      .catch(() => { if (active) setState({ loading: false, canEdit: false }); });
    return () => { active = false; };
  }, []);
  return state;
}
