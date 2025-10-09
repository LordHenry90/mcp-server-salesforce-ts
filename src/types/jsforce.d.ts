// Questo file estende le definizioni dei tipi per jsforce, aggiungendo
// metodi e proprietà mancanti per garantire la compatibilità con TypeScript.

import { Connection, UserInfo, MetadataApi, ToolingApi } from 'jsforce';

declare module 'jsforce' {

  // Definiamo un'interfaccia per le opzioni del metodo forJwt
  interface JwtOptions {
    clientId: string;
    privateKey: string;
    username: string;
    loginUrl?: string;
  }

  // Estendiamo la classe Connection per aggiungere il metodo statico 'forJwt'
  // e tutte le proprietà di istanza che utilizziamo.
  export class Connection {
    /**
     * Crea e autentica una connessione usando il flusso JWT Bearer Token.
     * Questo metodo statico è mancante nelle definizioni di tipo standard per jsforce v3.
     */
    static forJwt(options: JwtOptions): Promise<Connection>;

    // --- PROPRIETÀ DI ISTANZA MANCANTI ---
    
    /**
     * Fornisce informazioni sull'utente autenticato.
     */
    userInfo?: UserInfo;

    /**
     * Fornisce accesso all'API Metadata di Salesforce.
     */
    metadata: MetadataApi;

    /**
     * Fornisce accesso all'API Tooling di Salesforce.
     */
    tooling: ToolingApi;
  }

  // Aggiunge la proprietà 'username' mancante all'interfaccia UserInfo
  interface UserInfo {
    id: string;
    organizationId: string;
    url: string;
    username: string;
  }
}

