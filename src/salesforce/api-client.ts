import axios, { AxiosInstance } from 'axios';
import { getAccessToken } from './auth';
import { SalesforceCredentials } from '../models';

export class SalesforceApiClient {
    private client: AxiosInstance;
    private creds: SalesforceCredentials;

    constructor(creds: SalesforceCredentials) {
        this.creds = creds;
        this.client = axios.create();

        // Interceptor per aggiungere automaticamente l'header di autenticazione ad ogni richiesta
        this.client.interceptors.request.use(async (config) => {
            const { accessToken, instanceUrl } = await getAccessToken(this.creds);
            
            config.baseURL = instanceUrl;
            config.headers.Authorization = `Bearer ${accessToken}`;
            
            return config;
        }, (error) => {
            return Promise.reject(error);
        });
    }

    /**
     * Esegue una chiamata a un endpoint della Tooling API (REST)
     * @param method Metodo HTTP (GET, POST, PATCH, DELETE)
     * @param endpoint L'endpoint specifico (es. '/tooling/sobjects/ApexClass')
     * @param data Il corpo della richiesta (per POST/PATCH)
     * @returns La risposta dall'API
     */
    public async toolingApi(method: 'get' | 'post' | 'patch' | 'delete', endpoint: string, data: any = {}): Promise<any> {
        const url = `/services/data/v59.0${endpoint}`;
        try {
            const response = await this.client[method](url, data);
            return response.data;
        } catch (error: any) {
            console.error(`Errore durante la chiamata alla Tooling API (${method.toUpperCase()} ${url}):`, error.response?.data || error.message);
            throw new Error(`Errore Tooling API: ${JSON.stringify(error.response?.data) || error.message}`);
        }
    }
}
