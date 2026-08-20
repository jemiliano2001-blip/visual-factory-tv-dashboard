/**
 * Otorga (o revoca) el custom claim `admin: true` de Firebase Auth.
 *
 * AdminRoute y firestore.rules exigen ese claim; no hay UI en la app para darlo,
 * así que este script es la única forma de habilitar una cuenta administradora.
 *
 * Uso (desde functions/):
 *   node scripts/set-admin-claim.mjs correo@ejemplo.com
 *   node scripts/set-admin-claim.mjs correo@ejemplo.com --revoke
 *
 * Credenciales: necesita una llave de cuenta de servicio del proyecto smv-brain
 * (Firebase Console → Configuración → Cuentas de servicio → Generar nueva clave
 * privada) apuntada por GOOGLE_APPLICATION_CREDENTIALS, o bien
 * `gcloud auth application-default login`.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const email = process.argv[2];
const revoke = process.argv.includes('--revoke');

if (!email) {
  console.error('Falta el correo.\n  node scripts/set-admin-claim.mjs correo@ejemplo.com [--revoke]');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: 'smv-brain' });

const auth = getAuth();
const user = await auth.getUserByEmail(email);

// Se conservan los demás claims: sólo se toca `admin`.
const claims = { ...(user.customClaims ?? {}) };
if (revoke) delete claims.admin;
else claims.admin = true;

await auth.setCustomUserClaims(user.uid, claims);

// Invalida los ID tokens vigentes para que el claim nuevo surta efecto pronto.
await auth.revokeRefreshTokens(user.uid);

console.log(`${revoke ? 'Revocado' : 'Otorgado'} admin para ${email} (uid ${user.uid}).`);
console.log('Email verificado:', user.emailVerified ? 'sí' : 'NO — AdminRoute también exige correo verificado');
console.log('Cierra sesión y vuelve a entrar en la app para que el token traiga el claim.');
