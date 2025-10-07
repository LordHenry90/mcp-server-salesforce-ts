// src/types/jsforce.d.ts

// Importa le definizioni originali per estenderle
import 'jsforce';

// Usa "declaration merging" per aggiungere la proprietà mancante all'interfaccia Connection
declare module 'jsforce' {
  interface Connection {
    jwt: {
      authorize(
        username: string,
        privateKey: string,
        callback?: (err: Error, result: any) => void
      ): Promise<any>;
    };
  }
}