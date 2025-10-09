import { SalesforceApiClient } from './api-client';
import { 
    CreateApexClassRequest, 
    CreateLWCRequest, 
    SalesforceCredentials 
} from '../models';

/**
 * @class MetadataService
 * @description Incapsula la logica di business di alto livello per interagire con le API
 * di Salesforce, in particolare l'API Tooling. Questa classe orchestra operazioni
 * complesse come la creazione e l'aggiornamento di metadati (Upsert).
 * È progettata per essere "idempotente", gestendo in modo sicuro le riesecuzioni
 * e garantendo la coerenza dei metadati nell'organizzazione Salesforce.
 * Ogni metodo pubblico rappresenta uno "strumento" che può essere esposto a un agente AI.
 */
export class MetadataService {
    private apiClient: SalesforceApiClient;

    constructor(creds: SalesforceCredentials) {
        this.apiClient = new SalesforceApiClient(creds);
    }

    /**
     * Crea o aggiorna una classe Apex in Salesforce utilizzando una logica di "Upsert".
     * Il processo è atomico e viene gestito tramite un MetadataContainer per garantire
     * un deploy affidabile.
     * 1. Viene creato un MetadataContainer temporaneo.
     * 2. Si esegue una query per verificare se la classe Apex esiste già.
     * 3. Se la classe esiste, viene aggiornata; altrimenti, viene creata.
     * 4. La classe viene aggiunta al container tramite un ApexClassMember.
     * 5. Viene avviato un deploy asincrono del container.
     * 6. Lo stato del deploy viene monitorato (polling) fino al completamento.
     * 7. Il container temporaneo viene sempre cancellato, sia in caso di successo che di fallimento.
     * @param {CreateApexClassRequest} params I parametri per la creazione/aggiornamento della classe Apex.
     * @throws {Error} Se i parametri richiesti (`className`, `body`) sono mancanti.
     * @throws {Error} Se il deploy fallisce.
     * @returns {Promise<any>} Un oggetto che indica il successo e un messaggio descrittivo.
     */
    public async createApexClass(params: CreateApexClassRequest): Promise<any> {
        // --- VALIDAZIONE DELL'INPUT ---
        if (!params.className || !params.body) {
            throw new Error("Validazione fallita: 'className' e 'body' sono parametri obbligatori per createApexClass.");
        }
        
        console.log(`Inizio processo di deploy per la classe Apex: ${params.className}`);
        const containerName = `ApexContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;

        try {
            // Passo 1: Verifica l'esistenza della classe Apex.
            const query = `SELECT Id FROM ApexClass WHERE Name = '${params.className}'`;
            const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);

            let classId: string;
            if (queryResult.records.length > 0) {
                classId = queryResult.records[0].Id;
                console.log(`Classe '${params.className}' trovata con ID: ${classId}. Verrà aggiornata.`);
                // L'aggiornamento effettivo del codice avviene tramite l'ApexClassMember.
            } else {
                console.log(`Classe '${params.className}' non trovata. Verrà creata.`);
                const newClass = await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClass', {
                    FullName: params.className,
                    Body: params.body,
                    ApiVersion: params.apiVersion || 59.0
                });
                classId = newClass.id;
            }

            // Passo 2: Aggiunge la classe (nuova o esistente) al container per il deploy.
            await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClassMember', {
                MetadataContainerId: containerId,
                ContentEntityId: classId,
                Body: params.body // Il corpo del codice è sempre necessario per l'operazione di deploy.
            });

            // Passo 3: Avvia il deploy asincrono.
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });

            // Passo 4: Attendi il completamento del deploy tramite polling.
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
            // Passo 5: Pulizia del container.
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
            console.log(`Pulizia: MetadataContainer ${containerName} cancellato.`);
        }
    }

    /**
     * Crea o aggiorna un Lightning Web Component (LWC).
     * Questo metodo orchestra il complesso processo di deploy di un LWC, che richiede
     * la gestione di un container di metadati e la creazione sequenziale di più risorse.
     * @param {CreateLWCRequest} params I parametri completi per la creazione del LWC.
     * @throws {Error} Se i parametri richiesti (`componentName`, `htmlContent`, `jsContent`, etc.) sono mancanti.
     * @throws {Error} Se il deploy del container fallisce.
     * @returns {Promise<any>} Un oggetto che indica il successo e un messaggio descrittivo.
     */
    public async createLWC(params: CreateLWCRequest): Promise<any> {
        // --- VALIDAZIONE DELL'INPUT ---
        if (!params.componentName || !params.htmlContent || !params.jsContent || !params.masterLabel || params.isExposed === undefined) {
            throw new Error("Validazione fallita: 'componentName', 'htmlContent', 'jsContent', 'masterLabel' e 'isExposed' sono obbligatori per createLWC.");
        }
        
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
            
            // Passo 2: Prepara i contenuti dei file.
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

            // Passo 3: Crea o aggiorna le risorse in modo sequenziale.
            for (const resource of resources) {
                console.log(`Creazione/Aggiornamento risorsa: ${resource.FilePath}`);
                await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentResource', {
                    LightningComponentBundleId: bundleId, ...resource
                });
            }
            
            // Passo 4: Associa il bundle completato al container.
            await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundleMember', {
                MetadataContainerId: containerId,
                ContentEntityId: bundleId
            });

            // Passo 5: Avvia il deploy asincrono.
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });

            // Passo 6: Attendi il completamento.
            const deployResult = await this.pollDeployStatus(deployRequest.id, 60);

            if (deployResult.State !== 'Completed') {
                const errorDetails = deployResult.DeployDetails?.componentFailures ? 
                                     JSON.stringify(deployResult.DeployDetails.componentFailures) : 
                                     deployResult.ErrorMsg || 'Nessun dettaglio disponibile.';
                throw new Error(`Deploy LWC fallito. Stato: ${deployResult.State}. Dettagli: ${errorDetails}`);
            }
            
            console.log(`Deploy del componente LWC '${params.componentName}' completato con successo.`);
            return { success: true, message: `Componente LWC '${params.componentName}' creato/aggiornato con successo.` };
        } finally {
            // Passo 7: Pulizia del container.
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
            console.log(`Pulizia: MetadataContainer ${containerName} cancellato.`);
        }
    }

    /**
     * Esegue il polling dello stato di un ContainerAsyncRequest.
     * Questa funzione ausiliaria interroga ciclicamente Salesforce per verificare lo stato
     * di un'operazione di deploy asincrona, attendendo uno stato finale o il timeout.
     * Questo è essenziale per gestire la natura asincrona delle API de deploy e per
     * evitare "race conditions" tra operazioni dipendenti.
     * @private
     * @param {string} deployId L'ID del ContainerAsyncRequest da monitorare.
     * @param {number} [timeoutSeconds=30] Il numero massimo di secondi da attendere.
     * @returns {Promise<any>} L'oggetto finale del risultato del deploy.
     * @throws {Error} Se il deploy scade o fallisce in modo imprevisto.
     */
    private async pollDeployStatus(deployId: string, timeoutSeconds: number = 30): Promise<any> {
        let deployResult;
        const finalStates = ['Completed', 'Failed', 'Error', 'Aborted'];
        console.log(`Inizio polling per il deploy ID: ${deployId}. Timeout: ${timeoutSeconds}s.`);

        for (let i = 0; i < timeoutSeconds; i++) {
            deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployId}`);
            
            console.log(`Polling... Stato del deploy [${i+1}/${timeoutSeconds}]: ${deployResult.State}`);

            if (finalStates.includes(deployResult.State)) {
                console.log(`Polling terminato. Stato finale: ${deployResult.State}.`);
                return deployResult;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.error(`Polling scaduto per il deploy ID: ${deployId}.`);
        throw new Error(`Timeout del deploy dopo ${timeoutSeconds} secondi. Stato attuale: ${deployResult?.State}.`);
    }
}
