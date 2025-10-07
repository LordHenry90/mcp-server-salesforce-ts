export interface Tool {
    name: string;
    description: string;
    // Aggiunta la proprietà mancante 'parameters' per definire lo schema di input dello strumento.
    parameters: any; 
    execute: (params: any) => Promise<any>;
}

// Interfacce per i parametri degli strumenti
export interface CreateCustomObjectRequest {
    apiName: string;
    label: string;
    pluralLabel: string;
}

export interface CreateCustomFieldRequest {
    objectApiName: string;
    fieldApiName: string;
    label: string;
    type: 'Text' | 'Number' | 'Date' | 'Checkbox';
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

// Interfaccia per le credenziali
export interface SalesforceCredentials {
    loginUrl: string;
    consumerKey: string;
    username: string;
    privateKey: string;
}

