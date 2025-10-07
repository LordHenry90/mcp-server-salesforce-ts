import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { toolRegistry } from './tool-registry';
import { Tool } from './models';

// Carica le variabili d'ambiente dal file .env
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const secretToken = process.env.SECRET_TOKEN;

// Middleware per il parsing del body JSON
app.use(express.json());

// Middleware per l'autenticazione
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!secretToken) {
        // Se il token non è configurato, si prosegue senza autenticazione (utile per test locali veloci)
        console.warn("Nessun SECRET_TOKEN configurato. L'autenticazione è disabilitata.");
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autorizzazione mancante o malformata.' });
    }

    const token = authHeader.split(' ')[1];
    if (token !== secretToken) {
        return res.status(403).json({ error: 'Token non valido.' });
    }

    next();
};

// Endpoint di stato (non protetto)
app.get('/status', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint di scoperta degli strumenti (protetto)
app.get('/tools', authMiddleware, (req: Request, res: Response) => {
    // Restituisce solo la definizione degli strumenti (nome, descrizione, schema)
    const toolDefinitions = Object.values(toolRegistry).map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
    }));
    res.json(toolDefinitions);
});

// Endpoint per l'esecuzione di uno strumento (protetto)
app.post('/tools/:toolName', authMiddleware, async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const tool = toolRegistry[toolName];

    if (!tool) {
        return res.status(404).json({ error: `Strumento '${toolName}' non trovato.` });
    }

    try {
        console.log(`Esecuzione dello strumento '${toolName}' con i parametri:`, req.body);
        const result = await tool.execute(req.body);
        console.log(`Risultato dello strumento '${toolName}':`, result);
        return res.json({ result });
    } catch (error: any) {
        console.error(`Errore durante l'esecuzione dello strumento '${toolName}':`, error);
        // Restituisce un errore più dettagliato
        return res.status(500).json({ 
            error: `Errore nell'esecuzione dello strumento '${toolName}'.`,
            details: error.message || 'Errore sconosciuto'
        });
    }
});

// Avvia il server
app.listen(port, () => {
    console.log(`Server MCP in ascolto sulla porta ${port}`);
});

