import { MetadataService } from './salesforce/metadata-service';
import { 
    Tool,
    CreateApexClassRequest,
    CreateLWCRequest,
    SalesforceCredentials
} from './models';
import dotenv from 'dotenv';

dotenv.config();

// Funzione per ottenere le credenziali in modo sicuro
function getCredentials(): SalesforceCredentials {
    const {
        SF_LOGIN_URL,
        SF_CONSUMER_KEY,
        SF_USERNAME,
        SF_PRIVATE_KEY
    } = process.env;

    if (!SF_LOGIN_URL || !SF_CONSUMER_KEY || !SF_USERNAME || !SF_PRIVATE_KEY) {
        throw new Error("Mancano le variabili d'ambiente Salesforce necessarie.");
    }

    return {
        loginUrl: SF_LOGIN_URL,
        consumerKey: SF_CONSUMER_KEY,
        username: SF_USERNAME,
        privateKey: SF_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
}

// Inizializza il servizio una sola volta
const metadataService = new MetadataService(getCredentials());

type ToolRegistry = {
    [key: string]: Tool;
};

export const toolRegistry: ToolRegistry = {
    createApexClass: {
        name: 'createApexClass',
        description: 'Crea una nuova Classe Apex in Salesforce.',
        parameters: {
            type: 'object',
            properties: {
                className: { type: 'string', description: "Il nome della classe Apex." },
                body: { type: 'string', description: "Il corpo completo della classe Apex." },
                apiVersion: { type: 'number', description: "La versione dell'API (es. 59.0)." }
            },
            required: ['className', 'body']
        },
        execute: async (params: CreateApexClassRequest) => {
            return metadataService.createApexClass(params);
        }
    },
    createLWC: {
        name: 'createLWC',
        description: 'Crea un nuovo Lightning Web Component (LWC) in Salesforce.',
        parameters: {
            type: 'object',
            properties: {
                componentName: { type: 'string', description: "Il nome API del componente in camelCase (es. 'myContactList')." },
                masterLabel: { type: 'string', description: "L'etichetta visibile del componente." },
                isExposed: { type: 'boolean', description: "Impostare a 'true' per renderlo visibile nel App Builder." },
                targets: { type: 'array', items: { type: 'string' }, description: "Un array di target (es. ['lightning__AppPage'])." },
                htmlContent: { type: 'string', description: "Il contenuto del file .html." },
                jsContent: { type: 'string', description: "Il contenuto del file .js." }
            },
            required: ['componentName', 'masterLabel', 'isExposed', 'targets', 'htmlContent', 'jsContent']
        },
        execute: async (params: CreateLWCRequest) => {
            return metadataService.createLWC(params);
        }
    }
    // Aggiungi qui altri strumenti
};

