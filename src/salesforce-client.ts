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
    
    // Crea una nuova istanza di connessione
    const conn = new jsforce.Connection({
        oauth2: {
            loginUrl: creds.loginUrl,
            clientId: creds.consumerKey,
        },
        instanceUrl: creds.loginUrl // Importante per il flusso JWT
    });

    try {
        // Usa il metodo di autorizzazione JWT corretto. 
        // TypeScript lo riconoscerà grazie al file jsforce.d.ts
        await conn.jwt.authorize(creds.username, creds.privateKey);
        
        console.log(`Connessione a Salesforce stabilita con successo per l'utente: ${conn.userInfo?.username}`);
        return conn;
    } catch (err: any) {
        console.error("Errore durante l'autorizzazione JWT a Salesforce:", err.message);
        throw new Error(`Autenticazione Salesforce fallita: ${err.message}`);
    }
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
        fullName: `${params.objectApiName}.${params.fieldApiName.replace('__c','')}__c`,
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


// Strumento per creare un Lightning Web Component (Implementazione Reale e Completa)
export async function createLWC(conn: jsforce.Connection, params: CreateLWCRequest): Promise<any> {
    console.log("Inizio creazione LWC reale per:", params.componentName);

    // 1. Creare il LightningComponentBundle (il "contenitore")
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
            // Se la creazione del bundle fallisce, lancia un errore chiaro
            throw new Error(`Creazione del bundle fallita: ${JSON.stringify(bundleResult)}`);
        }
        console.log("LightningComponentBundle creato con successo. ID:", bundleResult.id);
    } catch (error: any) {
        console.error("Errore durante la creazione del LightningComponentBundle:", error.message);
        throw error;
    }

    const bundleId = bundleResult.id;

    // 2. Generare dinamicamente il contenuto del file .js-meta.xml
    const metaXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${params.apiVersion || 59.0}</apiVersion>
    <isExposed>${params.isExposed}</isExposed>
    <masterLabel>${params.masterLabel}</masterLabel>
    <targets>
        ${params.targets.map(t => `<target>${t}</target>`).join('\n        ')}
    </targets>
</LightningComponentBundle>`;

    // 3. Definire le risorse (i file) da associare al bundle
    const resources = [
        {
            FilePath: `lwc/${params.componentName}/${params.componentName}.html`,
            Format: 'HTML',
            Source: params.htmlContent
        },
        {
            FilePath: `lwc/${params.componentName}/${params.componentName}.js`,
            Format: 'JavaScript',
            Source: params.jsContent
        },
        {
            FilePath: `lwc/${params.componentName}/${params.componentName}.js-meta.xml`,
            Format: 'XML',
            Source: metaXmlContent
        }
    ];

    try {
        // 4. Creare le singole risorse in parallelo per efficienza
        const resourceCreationPromises = resources.map(resource => 
            conn.tooling.sobject('LightningComponentResource').create({
                LightningComponentBundleId: bundleId,
                ...resource
            })
        );
        
        const creationResults = await Promise.all(resourceCreationPromises);

        // Controllare se tutte le chiamate hanno avuto successo
        const failures = creationResults.filter(r => !r.success);
        if (failures.length > 0) {
            throw new Error(`Creazione di una o più risorse LWC fallita: ${JSON.stringify(failures)}`);
        }

        console.log("Tutte le risorse del LWC sono state create con successo.");
        return { success: true, message: `Componente LWC '${params.componentName}' creato con successo.` };

    } catch (error: any) {
        console.error("Errore durante la creazione delle risorse LWC:", error.message);
        
        // 5. Tentativo di Rollback: se la creazione delle risorse fallisce, cancelliamo il bundle
        try {
            await conn.tooling.sobject('LightningComponentBundle').delete(bundleId);
            console.log("Rollback eseguito: LightningComponentBundle cancellato per pulizia.");
        } catch (rollbackError: any) {
            console.error("Errore critico durante il rollback del bundle:", rollbackError.message);
        }
        throw error; // Rilancia l'errore originale dopo il tentativo di pulizia
    }
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

