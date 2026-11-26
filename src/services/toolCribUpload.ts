/**
 * Alta de un plano nuevo: PDF a Storage `tool-crib/<CLIENTE>/` y documentos en
 * `toolcribParts` / `toolcribDrawings` con los campos que exigen las reglas de Vision.
 */
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import type { ToolCribCustomer } from './toolCrib';
import { savePartAlias } from './toolCribLibrary';
import { validateUpload } from './toolCribUploadRules';

export interface UploadInput {
  customer: ToolCribCustomer;
  file: File;
  partNumber: string;
  revision: string;
  description: string;
  /** Texto de la partida: se guarda como alias para que la próxima vez ligue sola. */
  aliasPattern: string;
}

/**
 * Sube el PDF y deja la parte con su plano activo. Si falla el alta tras subir el PDF,
 * el error dice la ruta del archivo huérfano (no se borra nada sin pedirlo).
 */
export async function uploadDrawing(input: UploadInput): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Inicia sesión para subir el plano.');
  const check = validateUpload({ file: input.file, partNumber: input.partNumber, revision: input.revision });
  if (!check.ok) throw new Error(check.error);

  const partNumber = input.partNumber.trim();
  const revision = input.revision.trim();
  const safe = partNumber.replace(/[^A-Za-z0-9._-]/g, '_');
  const path = `tool-crib/${input.customer}/${safe}_rev${revision.replace(/[^A-Za-z0-9._-]/g, '_')}_${Date.now()}.pdf`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, input.file, { contentType: 'application/pdf' });
  const pdfUrl = await getDownloadURL(fileRef);

  try {
    const existing = await getDocs(query(
      collection(db, 'toolcribParts'),
      where('partNumber', '==', partNumber),
      where('customer', '==', input.customer),
    ));
    const batch = writeBatch(db);
    let partId: string;
    if (existing.empty) {
      const partRef = doc(collection(db, 'toolcribParts'));
      partId = partRef.id;
      batch.set(partRef, {
        partNumber,
        customer: input.customer,
        description: input.description.trim().slice(0, 500),
        status: 'active',
        createdAtUTC: serverTimestamp(),
        updatedAtUTC: serverTimestamp(),
      });
    } else {
      partId = existing.docs[0].id;
      const active = await getDocs(query(collection(db, 'toolcribDrawings'), where('partId', '==', partId), where('isActive', '==', true)));
      active.forEach(d => batch.update(d.ref, { isActive: false }));
    }
    const drawingRef = doc(collection(db, 'toolcribDrawings'));
    batch.set(drawingRef, {
      partId,
      revision,
      isActive: true,
      sourceType: 'storage',
      sourcePath: path,
      pdfUrl,
      stlUrl: null,
      checksumSha256: null,
      createdAtUTC: serverTimestamp(),
      createdByUid: uid,
    });
    await batch.commit();
    await savePartAlias({ pattern: input.aliasPattern || partNumber, partNumber, drawingId: drawingRef.id });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `El PDF se subió (${path}) pero no se pudo registrar el plano: ${reason}`,
      { cause: err },
    );
  }
}
