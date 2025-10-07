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

dotenv.config();

// Funzione per ottenere le credenziali in modo sicuro
function getCredentials(): SalesforceCredentials {
    const {
        SF_LOGIN_URL,
        SF_CONSUMER_KEY,
        SF_USERNAME,
        SF_PRIVATE_KEY
    } = process.env;

    if (!SF_LOGIN_URL || !SF_CONSUMER_KEY || !SF_USERNAME || !SF_PRIVATE_KEY) {
        throw new Error("Mancano le variabili d'ambiente Salesforce necessarie.");
    }

    return {
        loginUrl: SF_LOGIN_URL,
        consumerKey: SF_CONSUMER_KEY,
        username: SF_USERNAME,
        privateKey: SF_PRIVATE_KEY.replace(/\\n/g, '\n') // Sostituisce i caratteri di escape
    };
}

// Funzione per stabilire la connessione
export async function getSalesforceConnection(): Promise<jsforce.Connection> {
    const creds = getCredentials();
    
    const conn = new jsforce.Connection({
        oauth2: {
            loginUrl: creds.loginUrl,
            clientId: creds.consumerKey,
        }
    });

    await conn.jwt.authorize(creds.username, creds.privateKey);
    
    console.log("Connessione a Salesforce stabilita con successo.");
    return conn;
}

// Strumento per creare un Custom Object
export async function createCustomObject(conn: jsforce.Connection, params: CreateCustomObjectRequest): Promise<any> {
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

// Strumento per creare un Custom Field
export async function createCustomField(conn: jsforce.Connection, params: CreateCustomFieldRequest): Promise<any> {
    const metadata = [{
        fullName: `${params.objectApiName}.${params.fieldApiName}__c`,
        label: params.label,
        length: params.length,
        type: params.type
    }];
    return conn.metadata.create('CustomField', metadata);
}

// Strumento per creare una Classe Apex
export async function createApexClass(conn: jsforce.Connection, params: CreateApexClassRequest): Promise<any> {
     const metadata = {
        apiVersion: params.apiVersion || 59.0,
        status: 'Active',
        body: params.body
    };
    const fullName = params.className;
    // L'API Tooling richiede un approccio leggermente diverso
    return conn.tooling.sobject('ApexClass').create({ FullName: fullName, ...metadata });
}


// Strumento per creare un Lightning Web Component
export async function createLWC(conn: jsforce.Connection, params: CreateLWCRequest): Promise<any> {
    const bundle = {
        FullName: params.componentName,
        ApiVersion: params.apiVersion || 59.0,
        IsExposed: params.isExposed,
        MasterLabel: params.masterLabel,
        Targets: {
            target: params.targets
        },
        SourceFiles: {
            [params.componentName + '.html']: params.htmlContent,
            [params.componentName + '.js']: params.jsContent,
        }
    };
    return conn.tooling.sobject('LightningComponentBundle').create(bundle);
}


// Strumento per aggiornare i permessi di un campo
export async function updateFieldPermissions(conn: jsforce.Connection, params: UpdatePermissionsRequest): Promise<any> {
    const metadata = [{
        fullName: params.profileName,
        fieldPermissions: [{
            field: params.fieldApiName,
            editable: params.editable,
            readable: params.readable
        }]
    }];
    return conn.metadata.update('Profile', metadata);
}