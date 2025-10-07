import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { toolRegistry } from './tool-registry';
import { PublicTool } from './models'; // Importa la nuova interfaccia PublicTool

// Carica le variabili d'ambiente dal file .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Middleware di autenticazione
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token && token === process.env.SECRET_TOKEN) {
        next();
    } else {
        res.status(401).json({ error: "Token non valido o mancante" });
    }
};

// Endpoint di scoperta degli strumenti conforme alle aspettative del nodo MCP Client
app.get('/mcp', authMiddleware, (req, res) => {
    console.log("Richiesta di scoperta strumenti ricevuta su /mcp");
    // Ora usiamo l'interfaccia PublicTool per garantire la correttezza dei tipi
    const toolList: PublicTool[] = Object.values(toolRegistry).map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
        // La funzione 'execute' viene volutamente omessa
    }));
    res.json(toolList);
});

// Endpoint di esecuzione degli strumenti conforme
app.post('/mcp/:toolName', authMiddleware, async (req, res) => {
    const { toolName } = req.params;
    const tool = toolRegistry[toolName];

    console.log(`Esecuzione richiesta per lo strumento: ${toolName}`);

    if (!tool) {
        return res.status(404).json({ error: `Strumento '${toolName}' non trovato.` });
    }

    try {
        const result = await tool.execute(req.body);
        res.json({ result });
    } catch (error: any) {
        console.error(`Errore durante l'esecuzione dello strumento ${toolName}:`, error);
        res.status(500).json({ 
            error: `Errore nell'esecuzione dello strumento '${toolName}'.`,
            details: error.message || String(error)
        });
    }
});

// Endpoint di health check per Railway
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Server MCP conforme in ascolto sulla porta ${PORT}`);
    console.log(`Endpoint di scoperta strumenti: http://localhost:${PORT}/mcp`);
});

