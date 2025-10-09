import { SalesforceApiClient } from './api-client';
import { 
    CreateApexClassRequest, 
    CreateLWCRequest, 
    SalesforceCredentials 
} from '../models';

/**
 * MetadataService incapsula la logica di business per interagire con le API
 * di Salesforce, in particolare l'API Tooling, per la creazione e l'aggiornamento
 * di metadati come Classi Apex e Lightning Web Components.
 * Questa classe è progettata per essere "idempotente", gestendo sia la creazione
 * che l'aggiornamento dei metadati per evitare errori di duplicazione.
 */
export class MetadataService {
    private apiClient: SalesforceApiClient;

    constructor(creds: SalesforceCredentials) {
        this.apiClient = new SalesforceApiClient(creds);
    }

    /**
     * Crea o aggiorna una classe Apex in Salesforce.
     * Questa funzione implementa una logica di "Upsert":
     * 1. Controlla se una classe con il nome specificato esiste già.
     * 2. Se esiste, aggiorna il corpo della classe (PATCH).
     * 3. Se non esiste, crea una nuova classe (POST).
     * L'intera operazione viene eseguita all'interno di un MetadataContainer per 
     * garantire un deploy atomico e affidabile.
     * @param params I parametri per la creazione della classe Apex.
     * @returns Un oggetto che indica il successo e un messaggio descrittivo.
     */
    public async createApexClass(params: CreateApexClassRequest): Promise<any> {
        console.log(`Inizio processo di deploy per la classe Apex: ${params.className}`);
        const containerName = `ApexContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;

        try {
            // Passo 1: Verifica l'esistenza della classe Apex tramite una query SOQL sulla Tooling API.
            const query = `SELECT Id, Body FROM ApexClass WHERE Name = '${params.className}'`;
            const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);

            let classId: string;
            if (queryResult.records.length > 0) {
                // La classe esiste, quindi procediamo con un aggiornamento.
                classId = queryResult.records[0].Id;
                console.log(`Classe '${params.className}' trovata con ID: ${classId}. Verrà aggiornata.`);
                // L'aggiornamento del corpo della classe viene gestito tramite l'ApexClassMember.
            } else {
                // La classe non esiste, quindi procediamo con la creazione.
                console.log(`Classe '${params.className}' non trovata. Verrà creata.`);
                const newClass = await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClass', {
                    FullName: params.className,
                    Body: params.body, // Il corpo è necessario solo per la creazione iniziale
                    ApiVersion: params.apiVersion || 59.0
                });
                classId = newClass.id;
            }

            // Passo 2: Creare l'ApexClassMember. Questo è il passaggio chiave per aggiungere o aggiornare
            // il contenuto della classe all'interno del nostro container di deploy.
            await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClassMember', {
                MetadataContainerId: containerId,
                ContentEntityId: classId,
                Body: params.body // Il corpo del codice viene specificato qui per il deploy.
            });

            // Passo 3: Avviare il deploy asincrono del container.
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });

            // Passo 4: Attendere il completamento del deploy tramite polling.
            // Questo è il passaggio cruciale per risolvere la "race condition".
            // La funzione non restituirà il controllo finché il deploy non sarà finalizzato.
            const deployResult = await this.pollDeployStatus(deployRequest.id);

            if (deployResult.State !== 'Completed') {
                // Se il deploy fallisce, costruiamo un messaggio di errore dettagliato.
                const errorDetails = deployResult.DeployDetails?.componentFailures ? 
                                     JSON.stringify(deployResult.DeployDetails.componentFailures) : 
                                     deployResult.ErrorMsg || 'Nessun dettaglio disponibile.';
                throw new Error(`Deploy della classe Apex fallito. Stato: ${deployResult.State}. Dettagli: ${errorDetails}`);
            }

            console.log(`Deploy della classe Apex '${params.className}' completato con successo.`);
            return { success: true, message: `Classe Apex '${params.className}' creata/aggiornata con successo.` };
        } finally {
            // Passo 5: Pulizia. Il MetadataContainer è temporaneo e deve sempre essere cancellato.
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
            console.log(`Pulizia: MetadataContainer ${containerName} cancellato.`);
        }
    }

    /**
     * Crea o aggiorna un Lightning Web Component (LWC).
     * Questa funzione gestisce il complesso processo di deploy di un LWC tramite Tooling API.
     * 1. Crea un MetadataContainer temporaneo.
     * 2. Cerca se il Component Bundle esiste già. Se non esiste, lo crea.
     * 3. Crea le singole risorse (file .js, .html, .xml) in modo sequenziale.
     * 4. Associa il bundle al container tramite un LightningComponentBundleMember.
     * 5. Avvia il deploy asincrono e attende il suo completamento.
     * 6. Pulisce le risorse temporanee.
     * @param params I parametri per la creazione del LWC.
     * @returns Un oggetto che indica il successo e un messaggio descrittivo.
     */
    public async createLWC(params: CreateLWCRequest): Promise<any> {
        console.log(`Inizio processo di deploy per LWC: ${params.componentName}`);
        
        const containerName = `LWCContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;

        try {
            // Passo 1: Controlla se il bundle LWC esiste già.
            const query = `SELECT Id FROM LightningComponentBundle WHERE DeveloperName = '${params.componentName}'`;
            const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);
            
            let bundleId: string;
            if (queryResult.records.length > 0) {
                bundleId = queryResult.records[0].Id;
                console.log(`Bundle LWC '${params.componentName}' esistente trovato con ID: ${bundleId}.`);
            } else {
                // Se non esiste, crea un nuovo bundle.
                const newBundle = await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundle', {
                    FullName: params.componentName,
                    Metadata: {
                        apiVersion: params.apiVersion || 59.0,
                        isExposed: params.isExposed,
                        masterLabel: params.masterLabel
                    }
                });
                bundleId = newBundle.id;
                console.log(`Nuovo bundle LWC '${params.componentName}' creato con ID: ${bundleId}.`);
            }
            
            // Passo 2: Prepara i contenuti dei file del componente.
            const metaXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${params.apiVersion || 59.0}</apiVersion>
    <isExposed>${params.isExposed}</isExposed>
    <masterLabel>${params.masterLabel}</masterLabel>
    <targets>${params.targets ? params.targets.map((t: string) => `<target>${t}</target>`).join('\n        ') : ''}</targets>
</LightningComponentBundle>`;

            const resources = [
                { FilePath: `lwc/${params.componentName}/${params.componentName}.js`, Format: 'JS', Source: params.jsContent },
                { FilePath: `lwc/${params.componentName}/${params.componentName}.html`, Format: 'HTML', Source: params.htmlContent },
                { FilePath: `lwc/${params.componentName}/${params.componentName}.js-meta.xml`, Format: 'XML', Source: metaXmlContent }
            ];

            // Passo 3: Crea o aggiorna le risorse in modo sequenziale per evitare race conditions.
            // Il file .js deve essere creato per primo perché gli altri dipendono da esso.
            for (const resource of resources) {
                console.log(`Creazione/Aggiornamento risorsa: ${resource.FilePath}`);
                // La logica di "upsert" per le risorse è gestita dal deploy del container.
                // Qui le aggiungiamo semplicemente al bundle.
                await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentResource', {
                    LightningComponentBundleId: bundleId, ...resource
                });
            }
            
            // Passo 4: Associa il bundle completato al container di deploy.
            await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundleMember', {
                MetadataContainerId: containerId,
                ContentEntityId: bundleId
            });

            // Passo 5: Avvia il deploy asincrono del container.
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });

            // Passo 6: Attendi il completamento del deploy tramite polling.
            const deployResult = await this.pollDeployStatus(deployRequest.id, 60); // Timeout più lungo per LWC

            if (deployResult.State !== 'Completed') {
                const errorDetails = deployResult.DeployDetails?.componentFailures ? 
                                     JSON.stringify(deployResult.DeployDetails.componentFailures) : 
                                     deployResult.ErrorMsg || 'Nessun dettaglio disponibile.';
                throw new Error(`Deploy LWC fallito. Stato: ${deployResult.State}. Dettagli: ${errorDetails}`);
            }
            
            console.log(`Deploy del componente LWC '${params.componentName}' completato con successo.`);
            return { success: true, message: `Componente LWC '${params.componentName}' creato/aggiornato con successo.` };
        } finally {
            // Passo 7: Pulizia finale del container.
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
            console.log(`Pulizia: MetadataContainer ${containerName} cancellato.`);
        }
    }

    /**
     * Esegue il polling dello stato di un ContainerAsyncRequest fino a quando non raggiunge
     * uno stato finale (Completed, Failed, Error) o scade il timeout.
     * @param deployId L'ID del ContainerAsyncRequest da monitorare.
     * @param timeoutSeconds Il numero massimo di secondi da attendere. Default 30.
     * @returns L'oggetto finale del risultato del deploy.
     */
    private async pollDeployStatus(deployId: string, timeoutSeconds: number = 30): Promise<any> {
        let deployResult;
        const finalStates = ['Completed', 'Failed', 'Error', 'Aborted'];
        console.log(`Inizio polling per il deploy ID: ${deployId}. Timeout: ${timeoutSeconds}s.`);

        for (let i = 0; i < timeoutSeconds; i++) {
            deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployId}`);
            
            console.log(`Polling... Stato del deploy: ${deployResult.State}`);

            if (finalStates.includes(deployResult.State)) {
                console.log(`Polling terminato. Stato finale: ${deployResult.State}.`);
                return deployResult;
            }
            // Attendi un secondo prima del prossimo controllo
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Se il loop finisce senza uno stato finale, consideralo un timeout.
        console.error(`Polling scaduto per il deploy ID: ${deployId}.`);
        throw new Error(`Timeout del deploy dopo ${timeoutSeconds} secondi. Stato attuale: ${deployResult?.State}.`);
    }
}

