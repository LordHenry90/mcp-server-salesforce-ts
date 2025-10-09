import { Connection } from 'jsforce';
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
        privateKey: SF_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
}

export async function getSalesforceConnection(): Promise<Connection> {
    const creds = getCredentials();

    try {
        // Utilizza il metodo factory statico Connection.forJwt(), come da documentazione v3.
        // Questo metodo gestisce la creazione e l'autenticazione in un unico passaggio.
        const conn = await Connection.forJwt({
            clientId: creds.consumerKey,
            privateKey: creds.privateKey,
            username: creds.username,
            loginUrl: creds.loginUrl
        });

        const username = conn.userInfo ? conn.userInfo.username : 'utente sconosciuto';
        console.log(`Connessione a Salesforce stabilita con successo per l'utente: ${username}`);
        
        return conn;
    } catch (err: any) {
        console.error("Errore durante l'autorizzazione JWT a Salesforce:", err.message);
        throw new Error(`Autenticazione Salesforce fallita: ${err.message}`);
    }
}

// Strumento per creare un Custom Object
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

// Strumento per creare un Custom Field
export async function createCustomField(conn: Connection, params: CreateCustomFieldRequest): Promise<any> {
    const metadata = [{
        fullName: `${params.objectApiName}.${params.fieldApiName.replace('__c','')}__c`,
        label: params.label,
        length: params.length,
        type: params.type
    }];
    return conn.metadata.create('CustomField', metadata);
}

// Strumento per creare una Classe Apex
export async function createApexClass(conn: Connection, params: CreateApexClassRequest): Promise<any> {
     const metadata = {
        apiVersion: params.apiVersion || 59.0,
        status: 'Active',
        body: params.body
    };
    const fullName = params.className;
    return conn.tooling.sobject('ApexClass').create({ FullName: fullName, ...metadata });
}


// Strumento per creare un Lightning Web Component (Implementazione Reale)
export async function createLWC(conn: Connection, params: CreateLWCRequest): Promise<any> {
    console.log("Inizio creazione LWC reale per:", params.componentName);

    const bundleMetadata = {
        FullName: params.componentName,
        ApiVersion: params.apiVersion || 59.0,
        IsExposed: params.isExposed,
        MasterLabel: params.masterLabel,
        Targets: {
            target: params.targets
        }
    };

    let bundleResult;
    try {
        bundleResult = await conn.tooling.sobject('LightningComponentBundle').create(bundleMetadata);
        if (!bundleResult.success || !bundleResult.id) {
            throw new Error(`Creazione del bundle fallita: ${JSON.stringify(bundleResult)}`);
        }
    } catch (error: any) {
        console.error("Errore durante la creazione del LightningComponentBundle:", error.message);
        throw error;
    }

    const bundleId = bundleResult.id;
    const metaXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${params.apiVersion || 59.0}</apiVersion>
    <isExposed>${params.isExposed}</isExposed>
    <masterLabel>${params.masterLabel}</masterLabel>
    <targets>
        ${params.targets.map(t => `<target>${t}</target>`).join('\n        ')}
    </targets>
</LightningComponentBundle>`;

    const resources = [
        { FilePath: `lwc/${params.componentName}/${params.componentName}.html`, Format: 'HTML', Source: params.htmlContent },
        { FilePath: `lwc/${params.componentName}/${params.componentName}.js`, Format: 'JavaScript', Source: params.jsContent },
        { FilePath: `lwc/${params.componentName}/${params.componentName}.js-meta.xml`, Format: 'XML', Source: metaXmlContent }
    ];

    try {
        const resourceCreationPromises = resources.map(resource => 
            conn.tooling.sobject('LightningComponentResource').create({
                LightningComponentBundleId: bundleId,
                ...resource
            })
        );
        
        await Promise.all(resourceCreationPromises);
        return { success: true, message: `Componente LWC '${params.componentName}' creato con successo.` };

    } catch (error: any) {
        console.error("Errore durante la creazione delle risorse LWC:", error.message);
        try {
            await conn.tooling.sobject('LightningComponentBundle').delete(bundleId);
        } catch (rollbackError: any) {
            console.error("Errore critico durante il rollback del bundle:", rollbackError.message);
        }
        throw error;
    }
}


// Strumento per aggiornare i permessi di un campo
export async function updateFieldPermissions(conn: Connection, params: UpdatePermissionsRequest): Promise<any> {
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

