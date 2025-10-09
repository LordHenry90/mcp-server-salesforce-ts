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
        // La creazione di LWC via API è un processo a più passaggi
        // 1. Creare il Bundle con la struttura corretta
        const bundleBody = {
            FullName: params.componentName,
            // Le proprietà specifiche devono essere annidate in un oggetto 'Metadata'
            Metadata: {
                apiVersion: params.apiVersion || 59.0,
                isExposed: params.isExposed,
                masterLabel: params.masterLabel
            }
        };
        const bundleResult = await this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentBundle', bundleBody);
        
        if (!bundleResult.success) {
            throw new Error(`Creazione del bundle LWC fallita: ${JSON.stringify(bundleResult)}`);
        }

        // 2. Creare le Risorse (file). I 'targets' vengono usati qui, nel contenuto dell'XML.
        
        // --- INIZIO CORREZIONE ---
        // Aggiungiamo un controllo per verificare che 'params.targets' esista e sia un array
        // prima di tentare di chiamare il metodo .map() su di esso.
        const targetsXml = params.targets && Array.isArray(params.targets) && params.targets.length > 0
            ? `<targets>${params.targets.map((t: string) => `<target>${t}</target>`).join('\n        ')}</targets>`
            : '';
        // --- FINE CORREZIONE ---

        const metaXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${params.apiVersion || 59.0}</apiVersion>
    <isExposed>${params.isExposed}</isExposed>
    <masterLabel>${params.masterLabel}</masterLabel>
    ${targetsXml}
</LightningComponentBundle>`;

        const resources = [
            { FilePath: `lwc/${params.componentName}/${params.componentName}.html`, Format: 'HTML', Source: params.htmlContent },
            { FilePath: `lwc/${params.componentName}/${params.componentName}.js`, Format: 'JavaScript', Source: params.jsContent },
            { FilePath: `lwc/${params.componentName}/${params.componentName}.js-meta.xml`, Format: 'XML', Source: metaXmlContent }
        ];

        const resourceCreationPromises = resources.map(resource => 
            this.apiClient.toolingApi('post', '/tooling/sobjects/LightningComponentResource', {
                LightningComponentBundleId: bundleResult.id,
                ...resource
            })
        );
        
        await Promise.all(resourceCreationPromises);
        
        return { success: true, message: `Componente LWC '${params.componentName}' creato con successo.` };
    }

    // Aggiungi qui altre funzioni per creare campi, oggetti, etc.
}

