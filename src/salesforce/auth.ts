import jwt from 'jsonwebtoken';
import axios from 'axios';
import { SalesforceCredentials } from '../models';
import qs from 'querystring';

// Cache in-memory per l'access token
let tokenCache = {
    accessToken: '',
    instanceUrl: '',
    expiresAt: 0,
};

export async function getAccessToken(creds: SalesforceCredentials): Promise<{ accessToken: string, instanceUrl: string }> {
    const now = Math.floor(Date.now() / 1000);

    if (tokenCache.accessToken && now < tokenCache.expiresAt) {
        console.log("Access token recuperato dalla cache.");
        return {
            accessToken: tokenCache.accessToken,
            instanceUrl: tokenCache.instanceUrl,
        };
    }

    console.log("Nessun token valido in cache, richiesta di un nuovo token a Salesforce.");

    // --- INIZIO MODIFICA FONDAMENTALE ---
    // Decodifica la chiave privata da Base64 per ricostruire il formato PEM corretto.
    // Questo è il passaggio chiave per risolvere l'errore di firma.
    const decodedPrivateKey = Buffer.from(creds.privateKey, 'base64').toString('utf-8');
    // --- FINE MODIFICA FONDAMENTALE ---

    const payload = {
        iss: creds.consumerKey,
        sub: creds.username,
        aud: creds.loginUrl,
        exp: now + (3 * 60)
    };

    // Usa la chiave decodificata per firmare il JWT
    const signedJwt = jwt.sign(payload, decodedPrivateKey, { algorithm: 'RS256' });

    const tokenUrl = new URL('/services/oauth2/token', creds.loginUrl).toString();
    
    try {
        const response = await axios.post(tokenUrl, qs.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: signedJwt
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, instance_url } = response.data;
        
        tokenCache = {
            accessToken: access_token,
            instanceUrl: instance_url,
            expiresAt: now + (60 * 60 * 1)
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

