import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { getSalesforceConnection } from './salesforce-client';
import { toolRegistry, findTool } from './tool-registry';

// Carica le variabili d'ambiente dal file .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET;

// Middleware per il parsing del corpo delle richieste in JSON
app.use(express.json());

// Middleware per l'autenticazione basata su API Key
const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!API_SECRET) {
        // Se non è richiesta alcuna chiave API, procedi
        return next();
    }
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === API_SECRET) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
};

// Endpoint di Health Check per verificare che il server sia attivo
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy' });
});

// --- ENDPOINTS MCP ---

// 1. Endpoint di Scoperta (`GET /tools`)
// Restituisce la lista di tutti gli strumenti disponibili nel registro.
app.get('/tools', apiKeyAuth, (req: Request, res: Response) => {
    // Mappiamo il registro per restituire solo le informazioni pubbliche
    const availableTools = toolRegistry.map(({ name, description, schema }) => ({
        name,
        description,
        schema
    }));
    res.status(200).json(availableTools);
});

// 2. Endpoint di Esecuzione (`POST /tools/:toolName`)
// Esegue uno strumento specifico.
app.post('/tools/:toolName', apiKeyAuth, async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const params = req.body;

    // Cerca lo strumento nel registro
    const tool = findTool(toolName);

    if (!tool) {
        return res.status(404).json({ error: `Tool '${toolName}' not found.` });
    }

    try {
        console.log(`Esecuzione dello strumento '${toolName}' con i parametri:`, params);
        
        // Stabilisce la connessione a Salesforce
        const conn = await getSalesforceConnection();
        
        // Esegue la funzione associata allo strumento
        const result = await tool.execute(conn, params);
        
        console.log(`Strumento '${toolName}' eseguito con successo.`);
        res.status(200).json({ success: true, result });

    } catch (error: any) {
        console.error(`Errore durante l'esecuzione dello strumento '${toolName}':`, error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'An unexpected error occurred.',
            details: error.stack // Includi stack trace per debug
        });
    }
});


// Avvio del server
app.listen(PORT, () => {
    console.log(`🚀 Server MCP per Salesforce in esecuzione su http://localhost:${PORT}`);
});