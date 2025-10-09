import { SalesforceApiClient } from './api-client';
import { 
    CreateApexClassRequest, 
    CreateLWCRequest, 
    SalesforceCredentials 
} from '../models';

export class MetadataService {
    private apiClient: SalesforceApiClient;

    constructor(creds: SalesforceCredentials) {
        this.apiClient = new SalesforceApiClient(creds);
    }

    public async createApexClass(params: CreateApexClassRequest): Promise<any> {
        console.log(`Inizio processo di deploy per la classe Apex: ${params.className}`);
        const containerName = `ApexContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;

        try {
            const query = `SELECT Id, Body FROM ApexClass WHERE Name = '${params.className}'`;
            const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);

            let classId: string;
            if (queryResult.records.length > 0) {
                classId = queryResult.records[0].Id;
                console.log(`Classe '${params.className}' trovata. Verrà aggiornata.`);
                await this.apiClient.toolingApi('patch', `/tooling/sobjects/ApexClass/${classId}`, { Body: params.body });
            } else {
                console.log(`Classe '${params.className}' non trovata. Verrà creata.`);
                const newClass = await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClass', {
                    FullName: params.className,
                    Body: params.body,
                    ApiVersion: params.apiVersion || 59.0
                });
                classId = newClass.id;
            }

            await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClassMember', {
                MetadataContainerId: containerId,
                ContentEntityId: classId,
                Body: params.body
            });

            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });

            await new Promise(resolve => setTimeout(resolve, 3000));
            const deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployRequest.id}`);

            if (deployResult.State !== 'Completed') {
                throw new Error(`Deploy della classe Apex fallito. Stato: ${deployResult.State}. Dettagli: ${JSON.stringify(deployResult.ErrorMsg)}`);
            }

            return { success: true, message: `Classe Apex '${params.className}' creata/aggiornata con successo.` };
        } finally {
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
        }
    }

    public async createLWC(params: CreateLWCRequest): Promise<any> {
        console.log(`Inizio processo di deploy per LWC: ${params.componentName}`);
        
        const containerName = `LWCContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;

        try {
            const query = `SELECT Id FROM LightningComponentBundle WHERE DeveloperName = '${params.componentName}'`;
            const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);
            
            let bundleId: string;
            if (queryResult.records.length > 0) {
                bundleId = queryResult.records[0].Id;
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
            }
            
            const metaXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${params.apiVersion || 59.0}</apiVersion>
    <isExposed>${params.isExposed}</isExposed>
    <masterLabel>${params.masterLabel}</masterLabel>
    <targets>${params.targets ? params.targets.map((t: string) => `<target>${t}</target>`).join('\n        ') : ''}</targets>
</LightningComponentBundle>`;

            const resources = [
                // --- INIZIO CORREZIONE FONDAMENTALE ---
                // Il valore corretto per il formato del file JavaScript è "JS"
                { FilePath: `lwc/${params.componentName}/${params.componentName}.js`, Format: 'JS', Source: params.jsContent },
                // --- FINE CORREZIONE FONDAMENTALE ---
                { FilePath: `lwc/${params.componentName}/${params.componentName}.html`, Format: 'HTML', Source: params.htmlContent },
                { FilePath: `lwc/${params.componentName}/${params.componentName}.js-meta.xml`, Format: 'XML', Source: metaXmlContent }
            ];

            // Sostituiamo Promise.all con un loop sequenziale per garantire l'ordine di creazione
            for (const resource of resources) {
                console.log(`Creazione risorsa: ${resource.FilePath}`);
                await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentResource', {
                    LightningComponentBundleId: bundleId, ...resource
                });
            }
            
            await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundleMember', {
                MetadataContainerId: containerId,
                ContentEntityId: bundleId
            });

            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });

            await new Promise(resolve => setTimeout(resolve, 5000));
            const deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployRequest.id}`);

            if (deployResult.State !== 'Completed') {
                throw new Error(`Deploy LWC fallito. Stato: ${deployResult.State}. Dettagli: ${JSON.stringify(deployResult.ErrorMsg)}`);
            }
            
            return { success: true, message: `Componente LWC '${params.componentName}' creato/aggiornato con successo.` };
        } finally {
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
        }
    }
}

