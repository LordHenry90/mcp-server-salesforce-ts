import { Connection } from 'jsforce';

// --- Interfacce per le Credenziali ---
export interface SalesforceCredentials {
    loginUrl: string;
    consumerKey: string;
    username: string;
    privateKey: string;
}

// --- Interfaccia per la Definizione di uno Strumento MCP ---
export interface Tool {
    name: string;
    description: string;
    schema: Record<string, any>; // Schema JSON per i parametri di input
    execute: (conn: Connection, params: any) => Promise<any>; // La funzione che esegue l'azione
}

// --- Interfacce per i Parametri degli Strumenti ---

export interface CreateCustomObjectRequest {
    apiName: string;
    label: string;
    pluralLabel: string;
}

export interface CreateCustomFieldRequest {
    objectApiName: string;
    fieldApiName: string;
    label: string;
    type: string;
    length?: number; // Opzionale, richiesto solo per alcuni tipi
}

export interface CreateApexClassRequest {
    className: string;
    body: string;
    apiVersion?: number;
}

export interface CreateLWCRequest {
    componentName: string;
    masterLabel: string;
    isExposed: boolean;
    targets: string[];
    htmlContent: string;
    jsContent: string;
    apiVersion?: number;
}

export interface UpdatePermissionsRequest {
    profileName: string;
    fieldApiName: string;
    readable: boolean;
    editable: boolean;
}