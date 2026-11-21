/** Lectura y escritura de `user_settings/{uid}`; cada cuenta solo toca su documento. */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { sanitizeUserSettings, type UserSettings } from './userSettings';

function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid || auth.currentUser?.isAnonymous) throw new Error('Inicia sesión para guardar tu configuración.');
  return uid;
}

/** `null` = la cuenta aún no tiene documento. */
export async function loadUserSettings(): Promise<UserSettings | null> {
  const snap = await getDoc(doc(db, 'user_settings', currentUid()));
  return snap.exists() ? sanitizeUserSettings(snap.data()) : null;
}

/** Reemplaza el documento con exactamente los 5 campos que validan las reglas. */
export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const s = sanitizeUserSettings(settings);
  await setDoc(doc(db, 'user_settings', currentUid()), {
    startView: s.startView,
    followedClients: s.followedClients,
    print: s.print,
    appearance: s.appearance,
    updatedAt: serverTimestamp(),
  });
}
