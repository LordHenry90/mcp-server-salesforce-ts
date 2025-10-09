import { SalesforceApiClient } from './api-client';
import { 
    CreateApexClassRequest, 
    CreateLWCRequest, 
    CreateCustomFieldRequest, 
    SalesforceCredentials 
} from '../models';

export class MetadataService {
    private apiClient: SalesforceApiClient;

    constructor(creds: SalesforceCredentials) {
        this.apiClient = new SalesforceApiClient(creds);
    }

    public async createApexClass(params: CreateApexClassRequest): Promise<any> {
        console.log(`Inizio processo di Upsert per la classe Apex: ${params.className}`);
        const endpoint = '/tooling/sobjects/ApexClass';

        const query = `SELECT Id FROM ApexClass WHERE Name = '${params.className}'`;
        const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);

        if (queryResult.records.length > 0) {
            const existingClassId = queryResult.records[0].Id;
            console.log(`Classe '${params.className}' trovata con ID: ${existingClassId}. Procedo con l'aggiornamento.`);
            const body = {
                Body: params.body,
                ApiVersion: params.apiVersion || 59.0
            };
            return this.apiClient.toolingApi('patch', `${endpoint}/${existingClassId}`, body);
        } else {
            console.log(`Classe '${params.className}' non trovata. Procedo con la creazione.`);
            const body = {
                FullName: params.className,
                Body: params.body,
                ApiVersion: params.apiVersion || 59.0,
                Status: 'Active'
            };
            return this.apiClient.toolingApi('post', endpoint, body);
        }
    }

    public async createLWC(params: CreateLWCRequest): Promise<any> {
        console.log(`Inizio processo di Upsert per LWC: ${params.componentName}`);
        
        const containerName = `LWCContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;

        try {
            // L'associazione al container avviene qui, passando MetadataContainerId
            const bundleBody = {
                FullName: params.componentName,
                MetadataContainerId: containerId, // Associazione al container
                Metadata: {
                    apiVersion: params.apiVersion || 59.0,
                    isExposed: params.isExposed,
                    masterLabel: params.masterLabel
                }
            };
            const newBundle = await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundle', bundleBody);
            const bundleId = newBundle.id;
            console.log(`Nuovo bundle LWC '${params.componentName}' creato e associato al container.`);
            
            const metaXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${params.apiVersion || 59.0}</apiVersion>
    <isExposed>${params.isExposed}</isExposed>
    <masterLabel>${params.masterLabel}</masterLabel>
    <targets>${params.targets ? params.targets.map((t: string) => `<target>${t}</target>`).join('\n        ') : ''}</targets>
</LightningComponentBundle>`;

            const resources = [
                { FilePath: `lwc/${params.componentName}/${params.componentName}.html`, Format: 'HTML', Source: params.htmlContent },
                { FilePath: `lwc/${params.componentName}/${params.componentName}.js`, Format: 'JavaScript', Source: params.jsContent },
                { FilePath: `lwc/${params.componentName}/${params.componentName}.js-meta.xml`, Format: 'XML', Source: metaXmlContent }
            ];

            const resourceCreationPromises = resources.map(resource => 
                this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentResource', {
                    LightningComponentBundleId: bundleId,
                    MetadataContainerId: containerId, // Associazione al container
                    ...resource
                })
            );
            await Promise.all(resourceCreationPromises);

            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });
            const deployId = deployRequest.id;

            let deployResult;
            for (let i = 0; i < 30; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployId}`);
                if (['Completed', 'Failed', 'Queued', 'Error'].includes(deployResult.State)) {
                    break;
                }
            }

            if (deployResult.State !== 'Completed') {
                throw new Error(`Deploy del container fallito. Stato: ${deployResult.State}. Dettagli: ${JSON.stringify(deployResult.DeployDetails)}`);
            }
            
            console.log("Deploy LWC completato con successo.");
            return { success: true, message: `Componente LWC '${params.componentName}' creato/aggiornato con successo.` };

        } finally {
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
            console.log(`MetadataContainer ${containerName} cancellato.`);
        }
    }

    // Aggiungi qui altre funzioni per creare campi, oggetti, etc.
}

