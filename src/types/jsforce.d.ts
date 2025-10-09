// Questo file estende le definizioni dei tipi ufficiali di @types/jsforce.

// Importiamo il modulo originale per poterlo estendere
import 'jsforce';

// Estendiamo il modulo 'jsforce'
declare module 'jsforce' {
  // Aggiungiamo le nostre definizioni all'interfaccia Connection
  interface Connection {
    // Dichiariamo che esiste una proprietà 'jwt'
    jwt: {
      // Dichiariamo che 'jwt' ha un metodo 'authorize'
      authorize(
        username: string, 
        privateKey: string, 
        callback?: (err: Error, result: any) => void
      ): Promise<any>;
    };
  }

  // Aggiungiamo la proprietà 'username' mancante all'interfaccia UserInfo
  interface UserInfo {
    username: string;
  }
}