import { initializeApp } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Mirrors firestore.rules' isRealUser(): the public TV dashboard signs every
// visitor in anonymously to satisfy Firestore's auth != null rule. A session
// only counts as "logged in" if it's a real account, not that anonymous one.
export function isRealUser(user: User | null): user is User {
  return user != null && !user.isAnonymous;
}

export function isVerifiedRealUser(user: User | null): boolean {
  return isRealUser(user) && user.emailVerified;
}

/** ID token de Firebase para llamadas al proxy /api. Lanza si no hay sesión. */
export async function getIdTokenOrThrow(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      'No hay sesión de Firebase. Habilita la autenticación anónima en Firebase Console → Authentication → Sign-in method.',
    );
  }
  const token = await user.getIdToken().catch(() => null);
  if (!token) {
    throw new Error('No se pudo obtener el token de sesión. Recarga la página.');
  }
  return token;
}
