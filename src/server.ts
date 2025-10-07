import express, { Request, Response } from 'express';
import cors from 'cors';
import {
    getSalesforceConnection,
    createCustomObject,
    createCustomField,
    createApexClass,
    createLWC,
    updateFieldPermissions
} from './salesforce-client';
import { 
    CreateCustomObjectRequest,
    CreateCustomFieldRequest,
    CreateApexClassRequest,
    CreateLWCRequest,
    UpdatePermissionsRequest
} from './models';

const app = express();
const PORT = process.env.PORT || 8000;
const API_SECRET = process.env.API_SECRET;

app.use(cors());
app.use(express.json());

// Middleware di autenticazione
const authMiddleware = (req: Request, res: Response, next: Function) => {
    if (!API_SECRET) {
        return next(); // Nessuna sicurezza se la chiave non è impostata
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader === `Bearer ${API_SECRET}`) {
        return next();
    }
    res.status(403).json({ error: 'Accesso non autorizzato' });
};

// Endpoint di stato
app.get('/status', (req: Request, res: Response) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// Helper per gestire le chiamate agli strumenti
async function handleToolCall(req: Request, res: Response, toolFunction: Function, params: any) {
    try {
        const conn = await getSalesforceConnection();
        const result = await toolFunction(conn, params);
        res.json({ success: true, result });
    } catch (error: any) {
        console.error(`Errore nell'esecuzione dello strumento: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
}

// Endpoint per gli strumenti
app.post('/tools/createCustomObject', authMiddleware, (req: Request, res: Response) => {
    handleToolCall(req, res, createCustomObject, req.body as CreateCustomObjectRequest);
});

app.post('/tools/createCustomField', authMiddleware, (req: Request, res: Response) => {
    handleToolCall(req, res, createCustomField, req.body as CreateCustomFieldRequest);
});

app.post('/tools/createApexClass', authMiddleware, (req: Request, res: Response) => {
    handleToolCall(req, res, createApexClass, req.body as CreateApexClassRequest);
});

app.post('/tools/createLWC', authMiddleware, (req: Request, res: Response) => {
    handleToolCall(req, res, createLWC, req.body as CreateLWCRequest);
});

app.post('/tools/updateFieldPermissions', authMiddleware, (req: Request, res: Response) => {
    handleToolCall(req, res, updateFieldPermissions, req.body as UpdatePermissionsRequest);
});

app.listen(PORT, () => {
    console.log(`Server MCP in ascolto sulla porta ${PORT}`);
});

