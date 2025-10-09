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
        const body = {
            FullName: params.className,
            Body: params.body,
            ApiVersion: params.apiVersion || 59.0,
            Status: 'Active'
        };
        return this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClass', body);
    }

    public async createLWC(params: CreateLWCRequest): Promise<any> {
        // --- INIZIO IMPLEMENTAZIONE CORRETTA CON METADATA CONTAINER ---
        
        console.log(`Inizio creazione LWC con Metadata Container per: ${params.componentName}`);

        // 1. Creare un MetadataContainer per raggruppare le modifiche
        const containerName = `LWCContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', {
            Name: containerName
        });
        const containerId = container.id;

        try {
            // 2. Creare il LightningComponentBundle e associarlo al container
            const bundleBody = {
                FullName: params.componentName,
                Metadata: {
                    apiVersion: params.apiVersion || 59.0,
                    isExposed: params.isExposed,
                    masterLabel: params.masterLabel
                }
            };
            const bundleMember = await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundle', {
                ...bundleBody,
                MetadataContainerId: containerId
            });

            // 3. Creare le Risorse (file) e associarle al container
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
                    LightningComponentBundleId: bundleMember.id,
                    ...resource,
                    MetadataContainerId: containerId
                })
            );
            await Promise.all(resourceCreationPromises);

            // 4. Avviare il deploy del container in modo asincrono
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });
            const deployId = deployRequest.id;

            // 5. Controllare lo stato del deploy (polling)
            let deployResult;
            for (let i = 0; i < 30; i++) { // Timeout dopo 30 secondi
                await new Promise(resolve => setTimeout(resolve, 1000));
                deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployId}`);
                if (deployResult.State === 'Completed' || deployResult.State === 'Failed') {
                    break;
                }
            }

            if (deployResult.State !== 'Completed') {
                throw new Error(`Deploy del container fallito. Stato: ${deployResult.State}. Dettagli: ${JSON.stringify(deployResult.ErrorMsg)}`);
            }
            
            console.log("Deploy LWC completato con successo.");
            return { success: true, message: `Componente LWC '${params.componentName}' creato e deployato con successo.` };

        } finally {
            // 6. Pulizia: cancellare sempre il container dopo il deploy
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
            console.log(`MetadataContainer ${containerName} cancellato.`);
        }
        // --- FINE IMPLEMENTAZIONE CORRETTA ---
    }

    // Aggiungi qui altre funzioni per creare campi, oggetti, etc.
}

