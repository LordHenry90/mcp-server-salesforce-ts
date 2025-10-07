import * as sfdc from './salesforce-client';
import { 
    Tool,
    CreateCustomObjectRequest,
    CreateCustomFieldRequest,
    CreateApexClassRequest,
    CreateLWCRequest,
    UpdatePermissionsRequest
} from './models';

// Definiamo un tipo per il nostro registro per risolvere l'errore di indicizzazione implicita.
// Questo dice a TypeScript che toolRegistry è un oggetto con chiavi di tipo stringa e valori di tipo Tool.
type ToolRegistry = {
    [key: string]: Tool;
};

// Il nostro catalogo di strumenti, ora correttamente tipizzato.
export const toolRegistry: ToolRegistry = {
    createCustomObject: {
        name: 'createCustomObject',
        description: 'Crea un nuovo Oggetto Personalizzato (Custom Object) in Salesforce.',
        parameters: {
            type: 'object',
            properties: {
                apiName: { type: 'string', description: "Il nome API dell'oggetto (es. 'Prodotto'). Non includere '__c'." },
                label: { type: 'string', description: "L'etichetta singolare (es. 'Prodotto')." },
                pluralLabel: { type: 'string', description: "L'etichetta plurale (es. 'Prodotti')." }
            },
            required: ['apiName', 'label', 'pluralLabel']
        },
        execute: async (params: CreateCustomObjectRequest) => {
            const conn = await sfdc.getSalesforceConnection();
            return sfdc.createCustomObject(conn, params);
        }
    },
    createCustomField: {
        name: 'createCustomField',
        description: 'Crea un nuovo Campo Personalizzato (Custom Field) su un oggetto esistente.',
        parameters: {
            type: 'object',
            properties: {
                objectApiName: { type: 'string', description: "Il nome API dell'oggetto a cui aggiungere il campo (es. 'Account' o 'Prodotto__c')." },
                fieldApiName: { type: 'string', description: "Il nome API del campo (es. 'Codice_Prodotto'). Non includere '__c'." },
                label: { type: 'string', description: "L'etichetta del campo." },
                type: { type: 'string', enum: ['Text', 'Number', 'Date', 'Checkbox'], description: "Il tipo di dato del campo." },
                length: { type: 'number', description: "La lunghezza del campo (obbligatorio per il tipo 'Text')." }
            },
            required: ['objectApiName', 'fieldApiName', 'label', 'type']
        },
        execute: async (params: CreateCustomFieldRequest) => {
            const conn = await sfdc.getSalesforceConnection();
            return sfdc.createCustomField(conn, params);
        }
    },
    createApexClass: {
        name: 'createApexClass',
        description: 'Crea una nuova Classe Apex in Salesforce.',
        parameters: {
            type: 'object',
            properties: {
                className: { type: 'string', description: "Il nome della classe Apex." },
                body: { type: 'string', description: "Il corpo completo della classe Apex." },
                apiVersion: { type: 'number', description: "La versione dell'API (es. 59.0). Default a 59.0." }
            },
            required: ['className', 'body']
        },
        execute: async (params: CreateApexClassRequest) => {
            const conn = await sfdc.getSalesforceConnection();
            return sfdc.createApexClass(conn, params);
        }
    },
    // Aggiungi qui gli altri strumenti (createLWC, updateFieldPermissions) con la stessa struttura...
};

