import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp,
  getDocs,
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { CompanyConfig } from '../types';

const COLLECTION_NAME = 'company_configs';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    tenantId: string;
    providerInfo: {
      providerId: string;
      displayName: string;
      email: string;
      photoUrl: string;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || '',
      email: auth.currentUser?.email || '',
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
      tenantId: auth.currentUser?.tenantId || '',
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName || '',
        email: provider.email || '',
        photoUrl: provider.photoURL || ''
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const subscribeToCompanyConfigs = (callback: (configs: CompanyConfig[]) => void) => {
  const q = query(collection(db, COLLECTION_NAME), orderBy('company_name', 'asc'));
  
  return onSnapshot(q, (snapshot) => {
    const configs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      updatedAt: (doc.data().updatedAt as Timestamp).toDate(),
    })) as CompanyConfig[];
    callback(configs);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
  });
};

export const getCompanyConfigByName = async (companyName: string): Promise<CompanyConfig | null> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('company_name', '==', companyName));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      updatedAt: (doc.data().updatedAt as Timestamp).toDate(),
    } as CompanyConfig;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
    return null;
  }
};

export const createCompanyConfig = async (config: Omit<CompanyConfig, 'id' | 'updatedAt'>) => {
  try {
    return await addDoc(collection(db, COLLECTION_NAME), {
      ...config,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
  }
};

export const updateCompanyConfig = async (id: string, config: Partial<Omit<CompanyConfig, 'id' | 'updatedAt'>>) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await updateDoc(docRef, {
      ...config,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
  }
};

export const deleteCompanyConfig = async (id: string) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
  }
};
