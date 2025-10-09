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
 * La classe include una validazione rigorosa degli input e un logging dettagliato
 * per facilitare il debug e garantire l'affidabilità delle operazioni.
 */
export class MetadataService {
    private apiClient: SalesforceApiClient;

    constructor(creds: SalesforceCredentials) {
        this.apiClient = new SalesforceApiClient(creds);
    }

    /**
     * Crea o aggiorna una classe Apex in Salesforce utilizzando una logica di "Upsert".
     * Il processo è atomico e viene gestito tramite un MetadataContainer per garantire
     * un deploy affidabile e per risolvere le "race conditions".
     * 1. Viene creato un MetadataContainer temporaneo.
     * 2. Si esegue una query per verificare se la classe Apex esiste già.
     * 3. Se la classe esiste, viene preparata per l'aggiornamento; altrimenti, viene creata.
     * 4. La classe viene aggiunta al container tramite un ApexClassMember. Questo è il passaggio
     * che notifica a Salesforce l'intenzione di deployare il codice.
     * 5. Viene avviato un deploy asincrono del container.
     * 6. Lo stato del deploy viene monitorato attivamente (polling) fino al raggiungimento di uno
     * stato finale (Completed o Failed). La funzione attende il completamento prima di restituire,
     * garantendo che le operazioni successive possano fare affidamento su questo deploy.
     * 7. Il container temporaneo viene sempre cancellato, sia in caso di successo che di fallimento,
     * per non lasciare residui nell'organizzazione Salesforce.
     * * @param {CreateApexClassRequest} params I parametri per la creazione/aggiornamento della classe Apex.
     * @throws {Error} Se i parametri richiesti (`className`, `body`) sono mancanti o non validi.
     * @throws {Error} Se il deploy asincrono fallisce o va in timeout.
     * @returns {Promise<any>} Un oggetto che indica il successo dell'operazione e un messaggio descrittivo.
     */
    public async createApexClass(params: CreateApexClassRequest): Promise<any> {
        // --- VALIDAZIONE RIGOROSA DELL'INPUT ---
        if (!params || !params.className || !params.body) {
            const missingParams = [
                !params.className ? 'className' : null,
                !params.body ? 'body' : null
            ].filter(Boolean).join(', ');
            throw new Error(`Validazione fallita: i seguenti parametri sono obbligatori per createApexClass: ${missingParams}.`);
        }
        
        console.log(`[ApexDeployer] Inizio processo di deploy per la classe Apex: ${params.className}`);
        console.log(`[ApexDeployer] Parametri ricevuti: ${JSON.stringify(params)}`);
        
        const containerName = `ApexContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;
        console.log(`[ApexDeployer] Creato MetadataContainer temporaneo: ${containerName} (ID: ${containerId})`);

        try {
            // Passo 1: Verifica l'esistenza della classe Apex.
            const query = `SELECT Id FROM ApexClass WHERE Name = '${params.className}'`;
            const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);

            let classId: string;
            if (queryResult.records.length > 0) {
                classId = queryResult.records[0].Id;
                console.log(`[ApexDeployer] Classe '${params.className}' trovata con ID: ${classId}. Verrà aggiornata.`);
            } else {
                console.log(`[ApexDeployer] Classe '${params.className}' non trovata. Verrà creata.`);
                const newClass = await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClass', {
                    FullName: params.className,
                    Body: params.body,
                    ApiVersion: params.apiVersion || 59.0
                });
                classId = newClass.id;
                console.log(`[ApexDeployer] Nuova classe creata con ID: ${classId}.`);
            }

            // Passo 2: Aggiunge la classe al container per il deploy.
            await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClassMember', {
                MetadataContainerId: containerId,
                ContentEntityId: classId,
                Body: params.body // Il corpo del codice è sempre necessario per l'operazione di deploy.
            });
            console.log(`[ApexDeployer] ApexClassMember creato e associato al container.`);

            // Passo 3: Avvia il deploy asincrono.
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });
            console.log(`[ApexDeployer] Richiesta di deploy asincrono inviata. ID Deploy: ${deployRequest.id}`);

            // Passo 4: Attendi il completamento del deploy tramite polling.
            const deployResult = await this.pollDeployStatus(deployRequest.id);

            if (deployResult.State !== 'Completed') {
                const errorDetails = deployResult.DeployDetails?.componentFailures ? 
                                     JSON.stringify(deployResult.DeployDetails.componentFailures) : 
                                     deployResult.ErrorMsg || 'Nessun dettaglio disponibile.';
                throw new Error(`Deploy della classe Apex fallito. Stato: ${deployResult.State}. Dettagli: ${errorDetails}`);
            }

            console.log(`[ApexDeployer] Deploy della classe Apex '${params.className}' completato con successo.`);
            return { success: true, message: `Classe Apex '${params.className}' creata/aggiornata con successo.` };
        } finally {
            // Passo 5: Pulizia del container.
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
            console.log(`[ApexDeployer] Pulizia: MetadataContainer ${containerName} cancellato.`);
        }
    }

    /**
     * Crea o aggiorna un Lightning Web Component (LWC).
     * Questo metodo orchestra il complesso processo di deploy di un LWC, gestendo
     * la creazione sequenziale di più risorse all'interno di un container di metadati.
     * * @param {CreateLWCRequest} params I parametri completi per la creazione del LWC.
     * @throws {Error} Se i parametri richiesti (`componentName`, `htmlContent`, `jsContent`, etc.) sono mancanti.
     * @throws {Error} Se il deploy del container fallisce.
     * @returns {Promise<any>} Un oggetto che indica il successo e un messaggio descrittivo.
     */
    public async createLWC(params: CreateLWCRequest): Promise<any> {
        // --- VALIDAZIONE RIGOROSA DELL'INPUT ---
        if (!params || !params.componentName || !params.htmlContent || !params.jsContent || !params.masterLabel || params.isExposed === undefined) {
            const missingParams = [
                !params.componentName ? 'componentName' : null,
                !params.htmlContent ? 'htmlContent' : null,
                !params.jsContent ? 'jsContent' : null,
                !params.masterLabel ? 'masterLabel' : null,
                params.isExposed === undefined ? 'isExposed' : null
            ].filter(Boolean).join(', ');
            throw new Error(`Validazione fallita: i seguenti parametri sono obbligatori per createLWC: ${missingParams}.`);
        }
        
        console.log(`[LWCDeployer] Inizio processo di deploy per LWC: ${params.componentName}`);
        console.log(`[LWCDeployer] Parametri ricevuti: ${JSON.stringify({ ...params, htmlContent: '...', jsContent: '...' })}`);
        
        const containerName = `LWCContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;
        console.log(`[LWCDeployer] Creato MetadataContainer temporaneo: ${containerName} (ID: ${containerId})`);

        try {
            // Passo 1: Controlla se il bundle LWC esiste già.
            const query = `SELECT Id FROM LightningComponentBundle WHERE DeveloperName = '${params.componentName}'`;
            const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);
            
            let bundleId: string;
            if (queryResult.records.length > 0) {
                bundleId = queryResult.records[0].Id;
                console.log(`[LWCDeployer] Bundle LWC '${params.componentName}' esistente trovato con ID: ${bundleId}.`);
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
                console.log(`[LWCDeployer] Nuovo bundle LWC '${params.componentName}' creato con ID: ${bundleId}.`);
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

            // Passo 3: Crea o aggiorna le risorse in modo sequenziale per garantire l'ordine corretto.
            for (const resource of resources) {
                console.log(`[LWCDeployer] Creazione/Aggiornamento risorsa: ${resource.FilePath}`);
                await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentResource', {
                    LightningComponentBundleId: bundleId, ...resource
                });
            }
            
            // Passo 4: Associa il bundle completato al container.
            await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundleMember', {
                MetadataContainerId: containerId,
                ContentEntityId: bundleId
            });
            console.log(`[LWCDeployer] LightningComponentBundleMember creato e associato al container.`);

            // Passo 5: Avvia il deploy asincrono.
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });
            console.log(`[LWCDeployer] Richiesta di deploy asincrono inviata. ID Deploy: ${deployRequest.id}`);

            // Passo 6: Attendi il completamento.
            const deployResult = await this.pollDeployStatus(deployRequest.id, 60);

            if (deployResult.State !== 'Completed') {
                const errorDetails = deployResult.DeployDetails?.componentFailures ? 
                                     JSON.stringify(deployResult.DeployDetails.componentFailures) : 
                                     deployResult.ErrorMsg || 'Nessun dettaglio disponibile.';
                throw new Error(`Deploy LWC fallito. Stato: ${deployResult.State}. Dettagli: ${errorDetails}`);
            }
            
            console.log(`[LWCDeployer] Deploy del componente LWC '${params.componentName}' completato con successo.`);
            return { success: true, message: `Componente LWC '${params.componentName}' creato/aggiornato con successo.` };
        } finally {
            // Passo 7: Pulizia del container.
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
            console.log(`[LWCDeployer] Pulizia: MetadataContainer ${containerName} cancellato.`);
        }
    }

    /**
     * Esegue il polling dello stato di un ContainerAsyncRequest.
     * Questa funzione ausiliaria è essenziale per gestire la natura asincrona delle API di deploy.
     * Interroga ciclicamente Salesforce per verificare lo stato di un'operazione,
     * attendendo uno stato finale (Completed, Failed, etc.) o il timeout.
     * Questo approccio previene le "race conditions", garantendo che un'operazione
     * sia effettivamente conclusa prima di procedere con la successiva.
     * * @private
     * @param {string} deployId L'ID del ContainerAsyncRequest da monitorare.
     * @param {number} [timeoutSeconds=30] Il numero massimo di secondi da attendere.
     * @returns {Promise<any>} L'oggetto finale del risultato del deploy.
     * @throws {Error} Se il deploy scade o fallisce in modo imprevisto.
     */
    private async pollDeployStatus(deployId: string, timeoutSeconds: number = 30): Promise<any> {
        let deployResult;
        const finalStates = ['Completed', 'Failed', 'Error', 'Aborted'];
        console.log(`[Polling] Inizio monitoraggio per il deploy ID: ${deployId}. Timeout: ${timeoutSeconds}s.`);

        for (let i = 0; i < timeoutSeconds; i++) {
            deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployId}`);
            
            console.log(`[Polling] Stato del deploy [${i+1}/${timeoutSeconds}]: ${deployResult.State}`);

            if (finalStates.includes(deployResult.State)) {
                console.log(`[Polling] Monitoraggio terminato. Stato finale: ${deployResult.State}.`);
                return deployResult;
            }
            // Attendi un secondo prima del prossimo controllo per non sovraccaricare l'API.
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.error(`[Polling] Timeout raggiunto per il deploy ID: ${deployId}.`);
        throw new Error(`Timeout del deploy dopo ${timeoutSeconds} secondi. Stato attuale: ${deployResult?.State}.`);
    }
}

