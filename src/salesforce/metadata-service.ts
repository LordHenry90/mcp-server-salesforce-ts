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
            // 1. Controlla se la classe esiste per decidere se creare o aggiornare
            const query = `SELECT Id, Body FROM ApexClass WHERE Name = '${params.className}'`;
            const queryResult = await this.apiClient.toolingApi('get', `/tooling/query?q=${encodeURIComponent(query)}`);

            let classId: string;
            if (queryResult.records.length > 0) {
                // Se la classe esiste, aggiorniamo solo il Body
                classId = queryResult.records[0].Id;
                console.log(`Classe '${params.className}' trovata. Verrà aggiornata.`);
                await this.apiClient.toolingApi('patch', `/tooling/sobjects/ApexClass/${classId}`, { Body: params.body });
            } else {
                // Se non esiste, la creiamo
                console.log(`Classe '${params.className}' non trovata. Verrà creata.`);
                const newClass = await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClass', {
                    FullName: params.className,
                    Body: params.body,
                    ApiVersion: params.apiVersion || 59.0
                });
                classId = newClass.id;
            }

            // 2. Creare il membro per associare la classe al container
            await this.apiClient.toolingApi('post', '/tooling/sobjects/ApexClassMember', {
                MetadataContainerId: containerId,
                ContentEntityId: classId,
                Body: params.body // Il corpo è richiesto anche qui per l'aggiornamento
            });

            // 3. Avviare il deploy del container
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });

            // 4. Polling dello stato (logica semplificata)
            // In un'implementazione reale, questo sarebbe più robusto
            await new Promise(resolve => setTimeout(resolve, 3000)); // Attesa statica
            const deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployRequest.id}`);

            if (deployResult.State !== 'Completed') {
                throw new Error(`Deploy della classe Apex fallito. Stato: ${deployResult.State}. Dettagli: ${JSON.stringify(deployResult.ErrorMsg)}`);
            }

            return { success: true, message: `Classe Apex '${params.className}' creata/aggiornata con successo.` };
        } finally {
            // 5. Pulizia
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
        }
    }

    public async createLWC(params: CreateLWCRequest): Promise<any> {
        console.log(`Inizio processo di deploy per LWC: ${params.componentName}`);
        
        const containerName = `LWCContainer_${Date.now()}`;
        const container = await this.apiClient.toolingApi('post', '/tooling/sobjects/MetadataContainer', { Name: containerName });
        const containerId = container.id;

        try {
            // 1. Creare o trovare il LightningComponentBundle
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
            
            // 2. Preparare e creare le risorse (file) associandole al bundle
            const metaXmlContent = `<?xml version="1.0" encoding="UTF-8"?>...`; // Omissis per brevità
            const resources = [
                { FilePath: `lwc/${params.componentName}/${params.componentName}.html`, Format: 'HTML', Source: params.htmlContent },
                { FilePath: `lwc/${params.componentName}/${params.componentName}.js`, Format: 'JavaScript', Source: params.jsContent },
                { FilePath: `lwc/${params.componentName}/${params.componentName}.js-meta.xml`, Format: 'XML', Source: metaXmlContent }
            ];

            const resourcePromises = resources.map(res => this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentResource', {
                LightningComponentBundleId: bundleId, ...res
            }));
            await Promise.all(resourcePromises);
            
            // 3. Creare il LightningComponentBundleMember per associare il bundle al container
            await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundleMember', {
                MetadataContainerId: containerId,
                ContentEntityId: bundleId
            });

            // 4. Avviare il deploy del container
            const deployRequest = await this.apiClient.toolingApi('post', '/tooling/sobjects/ContainerAsyncRequest', {
                MetadataContainerId: containerId,
                IsCheckOnly: false
            });

            // 5. Polling dello stato
            await new Promise(resolve => setTimeout(resolve, 5000)); // Attesa più lunga per LWC
            const deployResult = await this.apiClient.toolingApi('get', `/tooling/sobjects/ContainerAsyncRequest/${deployRequest.id}`);

            if (deployResult.State !== 'Completed') {
                throw new Error(`Deploy LWC fallito. Stato: ${deployResult.State}. Dettagli: ${JSON.stringify(deployResult.ErrorMsg)}`);
            }
            
            return { success: true, message: `Componente LWC '${params.componentName}' creato/aggiornato con successo.` };
        } finally {
            // 6. Pulizia
            await this.apiClient.toolingApi('delete', `/tooling/sobjects/MetadataContainer/${containerId}`);
        }
    }
}

