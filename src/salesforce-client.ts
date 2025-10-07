import jsforce from 'jsforce';
import {
    CreateCustomFieldRequest,
    CreateCustomObjectRequest,
    CreateApexClassRequest,
    CreateLWCRequest,
    UpdatePermissionsRequest,
    SalesforceCredentials
} from './models';
import dotenv from 'dotenv';

// Carica le variabili d'ambiente dal file .env
dotenv.config();

// Tipo per la connessione JSforce
type Connection = jsforce.Connection;

// Funzione per ottenere le credenziali in modo sicuro
function getCredentials(): SalesforceCredentials {
    const {
        SF_LOGIN_URL,
        SF_CONSUMER_KEY,
        SF_USERNAME,
        SF_PRIVATE_KEY
    } = process.env;

    if (!SF_LOGIN_URL || !SF_CONSUMER_KEY || !SF_USERNAME || !SF_PRIVATE_KEY) {
        throw new Error("Mancano le variabili d'ambiente Salesforce necessarie. Assicurati che il file .env sia configurato correttamente.");
    }

    // Sostituisce i caratteri di escape per la chiave privata letta da .env
    const privateKey = SF_PRIVATE_KEY.replace(/\\n/g, '\n');

    return {
        loginUrl: SF_LOGIN_URL,
        consumerKey: SF_CONSUMER_KEY,
        username: SF_USERNAME,
        privateKey: privateKey
    };
}

// Funzione per stabilire la connessione a Salesforce usando il JWT Bearer Flow
export async function getSalesforceConnection(): Promise<Connection> {
    const creds = getCredentials();
    
    const conn = new jsforce.Connection({
        loginUrl: creds.loginUrl
    });

    try {
        await conn.loginByJwt(
            creds.consumerKey, 
            creds.privateKey, 
            creds.username
        );
        console.log("Connessione a Salesforce stabilita con successo per l'utente:", conn.userInfo.username);
        return conn;
    } catch (error: any) {
        console.error("Errore durante l'autenticazione JWT a Salesforce:", error.message);
        throw new Error(`Autenticazione Salesforce fallita: ${error.message}`);
    }
}

// --- Implementazione delle Funzioni degli Strumenti ---

export async function createCustomObject(conn: Connection, params: CreateCustomObjectRequest): Promise<any> {
    const metadata = [{
        fullName: `${params.apiName}__c`,
        label: params.label,
        pluralLabel: params.pluralLabel,
        nameField: {
            type: 'Text',
            label: `${params.label} Name`
        },
        deploymentStatus: 'Deployed',
        sharingModel: 'ReadWrite'
    }];
    return conn.metadata.create('CustomObject', metadata);
}

export async function createCustomField(conn: Connection, params: CreateCustomFieldRequest): Promise<any> {
    const metadata = [{
        fullName: `${params.objectApiName}.${params.fieldApiName}__c`,
        label: params.label,
        length: params.length,
        type: params.type
    }];
    return conn.metadata.create('CustomField', metadata);
}

export async function createApexClass(conn: Connection, params: CreateApexClassRequest): Promise<any> {
    const classMetadata = {
        apiVersion: params.apiVersion || 59.0,
        status: 'Active',
        body: params.body,
        FullName: params.className
    };
    // Le classi Apex vengono create tramite l'API Tooling
    const result = await conn.tooling.sobject('ApexClass').create(classMetadata as any);
    return result;
}

export async function createLWC(conn: Connection, params: CreateLWCRequest): Promise<any> {
    // Un LWC è un "LightningComponentBundle" che contiene più file sorgente.
    // L'API Tooling è la via corretta per creare questi bundle.
    
    // 1. Crea il bundle (la cartella)
    const bundleMetadata = {
        FullName: params.componentName,
        ApiVersion: params.apiVersion || 59.0,
        IsExposed: params.isExposed,
        MasterLabel: params.masterLabel,
        Targets: { target: params.targets } // L'API si aspetta 'target', non 'targets'
    };
    
    const bundleResult = await conn.tooling.sobject('LightningComponentBundle').create(bundleMetadata as any);
    if (!bundleResult.success) {
        throw new Error(`Creazione del bundle LWC fallita: ${JSON.stringify(bundleResult.errors)}`);
    }

    // 2. Crea i singoli file (membri) all'interno del bundle
    const bundleId = bundleResult.id;
    const filesToCreate = [
        { fileName: `${params.componentName}.html`, body: params.htmlContent },
        { fileName: `${params.componentName}.js`, body: params.jsContent }
    ];

    for (const file of filesToCreate) {
        await conn.tooling.sobject('LightningComponentResource').create({
            LightningComponentBundleId: bundleId,
            FilePath: `lwc/${params.componentName}/${file.fileName}`,
            Format: 'js', // 'js' per .js, 'html' per .html etc. ma l'API accetta js per entrambi
            Source: file.body
        } as any);
    }
    
    return { success: true, id: bundleId, componentName: params.componentName };
}

export async function updateFieldPermissions(conn: Connection, params: UpdatePermissionsRequest): Promise<any> {
    const profileMetadata = {
        fullName: params.profileName,
        fieldPermissions: [{
            field: params.fieldApiName,
            editable: params.editable,
            readable: params.readable
        }]
    };
    return conn.metadata.update('Profile', profileMetadata);
}