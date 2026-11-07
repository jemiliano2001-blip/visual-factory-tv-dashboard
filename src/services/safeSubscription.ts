/**
 * Protege una suscripcion de Firestore contra un cliente "muerto"
 * (firebase-js-sdk #10310, aserciones ca9/b815): en ese estado tanto
 * onSnapshot como la funcion unsubscribe lanzan de forma sincrona y, dentro
 * del cleanup de un useEffect, tumban toda la app React.
 * Nunca lanza: reporta el error y devuelve un unsubscribe seguro.
 */
export function guardSubscription(
  start: () => () => void,
  onError?: (error: Error) => void,
): () => void {
  const report = (error: unknown, where: string) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`Firestore ${where} fallo (cliente posiblemente muerto):`, err);
    try {
      onError?.(err);
    } catch (callbackError) {
      console.error('onError lanzo al reportar un fallo de Firestore:', callbackError);
    }
  };

  let unsubscribe: () => void;
  try {
    unsubscribe = start();
  } catch (error) {
    report(error, 'onSnapshot');
    return () => {};
  }

  return () => {
    try {
      unsubscribe();
    } catch (error) {
      report(error, 'unsubscribe');
    }
  };
}
