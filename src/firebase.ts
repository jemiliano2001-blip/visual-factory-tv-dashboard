import { initializeApp } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Mirrors firestore.rules' isRealUser(): the public TV dashboard signs every
// visitor in anonymously to satisfy Firestore's auth != null rule. A session
// only counts as "logged in" if it's a real account, not that anonymous one.
export function isRealUser(user: User | null): boolean {
  return user != null && !user.isAnonymous;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

