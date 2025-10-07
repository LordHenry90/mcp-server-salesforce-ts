🚀 Istruzioni di Avvio
Questo progetto è un server TypeScript che espone un'API per interagire con Salesforce.

1. Prerequisiti
Node.js (v18 o superiore)

npm (incluso con Node.js)

Un account Salesforce con accesso API

Git Bash (per utenti Windows) per generare le chiavi

2. Setup Iniziale
Clona il Repository:

git clone <URL_DEL_TUO_REPO>
cd mcp-server-ts

Crea il File delle Variabili d'Ambiente:
Copia il file .env.example in un nuovo file chiamato .env e compila tutti i valori richiesti.

cp .env.example .env

SF_LOGIN_URL: Es. https://login.salesforce.com (per produzione) o https://test.salesforce.com (per sandbox).

SF_USERNAME: L'username dell'utente di integrazione.

SF_CONSUMER_KEY: La Consumer Key della tua Connected App.

SF_PRIVATE_KEY: Importante: Copia l'intero contenuto del file server.key, incluse le righe -----BEGIN RSA PRIVATE KEY----- e -----END RSA PRIVATE KEY-----. Assicurati di racchiudere il tutto tra doppi apici ("...") e di sostituire ogni "a capo" con \n.

API_SECRET: Una chiave segreta a tua scelta per proteggere gli endpoint del server MCP.

3. Setup Salesforce (Operazione da Fare una Sola Volta)
Segui questi passaggi per creare la Connected App su Salesforce che permetterà al server di autenticarsi.

Genera Chiave e Certificato: Apri Git Bash (anche su Windows) e naviga nella cartella del progetto mcp-server-ts. Esegui questi comandi:

Chiave Privata:

openssl genrsa -out server.key 2048

Certificato Pubblico:

openssl req -new -x509 -key server.key -out server.crt -days 365 -subj "//CN=mcp.server.local"

Troverai i file server.key e server.crt nella tua cartella.

Crea la Connected App:

In Salesforce, vai su Setup > App Manager > New Connected App.

Compila i campi base (Nome, Email).

Spunta Enable OAuth Settings.

Spunta Use digital signatures e carica il file server.crt.

Aggiungi i seguenti OAuth Scopes:

Access and manage your data (api)

Perform requests on your behalf at any time (refresh_token, offline_access)

Manage user data via APIs (full)

Salva.

Ottieni la Consumer Key:

Dalla pagina della Connected App, clicca su Manage Consumer Details.

Verifica la tua identità e copia la Consumer Key.

Pre-Autorizza Utenti:

Nella pagina della Connected App, clicca Manage > Edit Policies.

In Permitted Users, seleziona Admin approved users are pre-authorized.

Salva.

Torna alla pagina della Connected App e, sotto Profiles, clicca Manage Profiles per aggiungere il profilo del tuo utente di integrazione (es. System Administrator).

4. Installazione e Avvio
Crea la Cartella dei Tipi:
All'interno della cartella src, crea una nuova cartella chiamata types.

mkdir -p src/types

Sposta il file jsforce.d.ts (che ti ho fornito) all'interno di questa nuova cartella.

Installa le Dipendenze:

npm install

Compila il Codice TypeScript:

npm run build

Questo comando compilerà i file .ts in file .js all'interno di una cartella dist. Se questo comando ha successo, hai risolto il problema.

Avvia il Server:

npm start

Il server sarà in ascolto sulla porta specificata (default: 8000).