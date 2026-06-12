import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  serverTimestamp,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import { WorkOrder, WorkOrderHistory, ActionType } from '../types';

const WORK_ORDERS_COLLECTION = 'work_orders';
const HISTORY_COLLECTION = 'work_orders_history';

// Helper to handle Firestore errors
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
  authInfo: any;
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

// Convert Firestore Timestamp to JS Date
const convertTimestamps = (data: any) => {
  return {
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    delivery_date: data.delivery_date?.toDate() || null,
    prediction: data.prediction ? {
      ...data.prediction,
      analyzedAt: data.prediction.analyzedAt?.toDate() || new Date()
    } : undefined,
    changed_at: data.changed_at?.toDate() || new Date(),
  };
};

export const subscribeToWorkOrders = (callback: (orders: WorkOrder[]) => void) => {
  const q = query(collection(db, WORK_ORDERS_COLLECTION), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestamps(doc.data())
    })) as WorkOrder[];
    callback(orders);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, WORK_ORDERS_COLLECTION);
  });
};

export const subscribeToHistory = (callback: (history: WorkOrderHistory[]) => void) => {
  const q = query(collection(db, HISTORY_COLLECTION), orderBy('changed_at', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const history = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestamps(doc.data())
    })) as WorkOrderHistory[];
    callback(history);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, HISTORY_COLLECTION);
  });
};

export const getWorkOrderHistory = async (workOrderId: string): Promise<WorkOrderHistory[]> => {
  try {
    const q = query(
      collection(db, HISTORY_COLLECTION),
      where('work_order_id', '==', workOrderId)
    );
    const snapshot = await getDocs(q);
    const history = snapshot.docs.map(doc => ({
      id: doc.id,
      ...convertTimestamps(doc.data())
    })) as WorkOrderHistory[];
    
    return history.sort((a, b) => b.changed_at.getTime() - a.changed_at.getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, HISTORY_COLLECTION);
    return [];
  }
};

const logHistory = async (workOrderId: string, action: ActionType, previousState: any, newState: any) => {
  if (!auth.currentUser) return;
  
  try {
    await addDoc(collection(db, HISTORY_COLLECTION), {
      work_order_id: workOrderId,
      action,
      previous_state: previousState || null,
      new_state: newState || null,
      changed_by: auth.currentUser.uid,
      changed_at: serverTimestamp()
    });
  } catch (error) {
    console.error("Error al registrar el historial:", error);
  }
};

export const createWorkOrder = async (orderData: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: Date, delivery_date?: Date }) => {
  try {
    const data = {
      ...orderData,
      createdAt: orderData.createdAt ? Timestamp.fromDate(orderData.createdAt) : serverTimestamp(),
      delivery_date: orderData.delivery_date ? Timestamp.fromDate(orderData.delivery_date) : null,
      updatedAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, WORK_ORDERS_COLLECTION), data);
    await logHistory(docRef.id, 'created', null, data);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, WORK_ORDERS_COLLECTION);
  }
};

export const updateWorkOrder = async (id: string, updates: Partial<WorkOrder>) => {
  try {
    const docRef = doc(db, WORK_ORDERS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) throw new Error("Documento no encontrado");
    const previousState = docSnap.data();
    
    const data: any = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    if (updates.delivery_date instanceof Date) {
      data.delivery_date = Timestamp.fromDate(updates.delivery_date);
    } else if (updates.delivery_date === null) {
      data.delivery_date = null;
    }

    if (updates.createdAt instanceof Date) {
      data.createdAt = Timestamp.fromDate(updates.createdAt);
    }
    
    await updateDoc(docRef, data);
    await logHistory(id, 'updated', previousState, { ...previousState, ...data });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${WORK_ORDERS_COLLECTION}/${id}`);
  }
};

export const deleteWorkOrder = async (id: string) => {
  try {
    const docRef = doc(db, WORK_ORDERS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const previousState = docSnap.data();
      await deleteDoc(docRef);
      await logHistory(id, 'deleted', previousState, null);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${WORK_ORDERS_COLLECTION}/${id}`);
  }
};
