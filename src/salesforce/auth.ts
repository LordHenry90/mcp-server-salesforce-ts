import jwt from 'jsonwebtoken';
import axios from 'axios';
import { SalesforceCredentials } from '../models';
import qs from 'querystring';

// Cache in-memory per l'access token per evitare di richiederlo ad ogni chiamata
let tokenCache = {
    accessToken: '',
    instanceUrl: '',
    expiresAt: 0,
};

export async function getAccessToken(creds: SalesforceCredentials): Promise<{ accessToken: string, instanceUrl: string }> {
    const now = Math.floor(Date.now() / 1000);

    // Se abbiamo un token valido in cache, usiamo quello
    if (tokenCache.accessToken && now < tokenCache.expiresAt) {
        console.log("Access token recuperato dalla cache.");
        return {
            accessToken: tokenCache.accessToken,
            instanceUrl: tokenCache.instanceUrl,
        };
    }

    console.log("Nessun token valido in cache, richiesta di un nuovo token a Salesforce.");

    // 1. Creare il JWT
    const payload = {
        iss: creds.consumerKey,
        sub: creds.username,
        aud: creds.loginUrl,
        exp: now + (3 * 60) // Il token scade tra 3 minuti
    };

    const signedJwt = jwt.sign(payload, creds.privateKey, { algorithm: 'RS256' });

    // 2. Scambiare il JWT per un Access Token
    const tokenUrl = new URL('/services/oauth2/token', creds.loginUrl).toString();
    
    try {
        const response = await axios.post(tokenUrl, qs.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: signedJwt
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, instance_url } = response.data;
        
        // Aggiorniamo la cache
        tokenCache = {
            accessToken: access_token,
            instanceUrl: instance_url,
            expiresAt: now + (60 * 60 * 1) // Imposta la scadenza a 1 ora da adesso
        };

        console.log("Nuovo access token ottenuto e salvato in cache.");
        return {
            accessToken: access_token,
            instanceUrl: instance_url
        };
    } catch (error: any) {
        console.error("Errore durante lo scambio del JWT con Salesforce:", error.response?.data || error.message);
        throw new Error(`Autenticazione Salesforce fallita: ${error.response?.data?.error_description || error.message}`);
    }
}
