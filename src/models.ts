/**
 * Definisce la struttura completa di uno strumento, inclusa la sua logica di esecuzione.
 * Questa interfaccia è usata internamente nel tool-registry.
 */
export interface Tool {
    name: string;
    description: string;
    parameters: any; // Schema JSON per i parametri
    execute: (params: any) => Promise<any>;
}

/**
 * Definisce la struttura pubblica di uno strumento, come viene esposta sull'endpoint /mcp.
 * Questa versione omette la funzione `execute` per motivi di sicurezza e semplicità.
 */
export interface PublicTool {
    name: string;
    description: string;
    parameters: any;
}

/**
 * Definisce la struttura delle credenziali Salesforce lette dalle variabili d'ambiente.
 */
export interface SalesforceCredentials {
    loginUrl: string;
    consumerKey: string;
    username: string;
    privateKey: string;
}

// --- Interfacce per i parametri degli strumenti ---

export interface CreateCustomObjectRequest {
    apiName: string;
    label: string;
    pluralLabel: string;
}

export interface CreateCustomFieldRequest {
    objectApiName: string;
    fieldApiName: string;
    label: string;
    type: 'Text' | 'Number' | 'Date' | 'Checkbox' | 'LongTextArea';
    length?: number;
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
    editable: boolean;
    readable: boolean;
}

