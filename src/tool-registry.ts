import { Connection } from 'jsforce';
import { 
    createCustomObject, 
    createCustomField, 
    createApexClass, 
    createLWC, 
    updateFieldPermissions 
} from './salesforce-client';
import { 
    Tool,
    CreateCustomObjectRequest,
    CreateCustomFieldRequest,
    CreateApexClassRequest,
    CreateLWCRequest,
    UpdatePermissionsRequest
} from './models';

// Registro centralizzato di tutti gli strumenti disponibili.
// Questa è l'unica parte del codice da modificare per aggiungere/rimuovere strumenti.
export const toolRegistry: Tool[] = [
    {
        name: 'createCustomObject',
        description: 'Crea un nuovo oggetto personalizzato (Custom Object) in Salesforce. Usa questo per creare nuove tabelle di dati.',
        schema: {
            type: 'object',
            properties: {
                apiName: { type: 'string', description: "L'API Name del nuovo oggetto (es. MyObject, senza __c)." },
                label: { type: 'string', description: "L'etichetta singolare visibile per l'oggetto (es. My Object)." },
                pluralLabel: { type: 'string', description: "L'etichetta plurale visibile (es. My Objects)." }
            },
            required: ['apiName', 'label', 'pluralLabel']
        },
        execute: (conn: Connection, params: any) => createCustomObject(conn, params as CreateCustomObjectRequest)
    },
    {
        name: 'createCustomField',
        description: 'Crea un nuovo campo personalizzato su un oggetto esistente.',
        schema: {
            type: 'object',
            properties: {
                objectApiName: { type: 'string', description: "L'API Name dell'oggetto su cui creare il campo (es. Account, MyObject__c)." },
                fieldApiName: { type: 'string', description: "L'API Name del nuovo campo (senza __c)." },
                label: { type: 'string', description: "L'etichetta visibile del campo." },
                type: { type: 'string', description: "Il tipo di dato del campo (es. Text, Number, Date, Checkbox)." },
                length: { type: 'number', description: "La lunghezza del campo (obbligatoria solo per il tipo Text)." }
            },
            required: ['objectApiName', 'fieldApiName', 'label', 'type']
        },
        execute: (conn: Connection, params: any) => createCustomField(conn, params as CreateCustomFieldRequest)
    },
    {
        name: 'createApexClass',
        description: 'Crea una nuova classe Apex in Salesforce.',
        schema: {
            type: 'object',
            properties: {
                className: { type: 'string', description: "Il nome della classe Apex." },
                body: { type: 'string', description: "Il corpo completo del codice della classe Apex." },
                apiVersion: { type: 'number', description: "La versione API per la classe (es. 59.0). Default a 59.0." }
            },
            required: ['className', 'body']
        },
        execute: (conn: Connection, params: any) => createApexClass(conn, params as CreateApexClassRequest)
    },
    {
        name: 'createLWC',
        description: 'Crea un nuovo Lightning Web Component (LWC).',
        schema: {
            type: 'object',
            properties: {
                componentName: { type: 'string', description: "Il nome del componente (es. myComponent)." },
                masterLabel: { type: 'string', description: "L'etichetta principale visibile del componente." },
                isExposed: { type: 'boolean', description: "Se il componente è esposto nell'App Builder." },
                targets: { type: 'array', items: { type: 'string' }, description: "Un array di target dove il componente può essere usato (es. ['lightning__AppPage'])." },
                htmlContent: { type: 'string', description: "Il contenuto completo del file .html." },
                jsContent: { type: 'string', description: "Il contenuto completo del file .js." }
            },
            required: ['componentName', 'masterLabel', 'isExposed', 'targets', 'htmlContent', 'jsContent']
        },
        execute: (conn: Connection, params: any) => createLWC(conn, params as CreateLWCRequest)
    },
    {
        name: 'updateFieldPermissions',
        description: "Aggiorna i permessi di un campo (lettura/scrittura) per un profilo specifico.",
        schema: {
            type: 'object',
            properties: {
                profileName: { type: 'string', description: "Il nome del profilo da modificare (es. System Administrator)." },
                fieldApiName: { type: 'string', description: "L'API Name completo del campo da modificare (es. Account.MyField__c)." },
                readable: { type: 'boolean', description: "Imposta il permesso di lettura." },
                editable: { type: 'boolean', description: "Imposta il permesso di modifica." }
            },
            required: ['profileName', 'fieldApiName', 'readable', 'editable']
        },
        execute: (conn: Connection, params: any) => updateFieldPermissions(conn, params as UpdatePermissionsRequest)
    }
];

// Funzione helper per trovare uno strumento nel registro
export function findTool(toolName: string): Tool | undefined {
    return toolRegistry.find(tool => tool.name === toolName);
}