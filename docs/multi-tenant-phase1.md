# Multi-azienda — fase 1 (2026-10-21)

Database dedicato: Neon PostgreSQL project `red-heart-80820263` (Frankfurt).

## Tabelle create
- `organizations`: azienda, slug, branding, approvazione obbligatoria.
- `app_users`: identità applicative, senza password memorizzate nel database.
- `memberships`: ruoli `org_admin` e `member` limitati all'azienda.
- `platform_admins`: super amministratori.
- `card_templates`: modelli associati a una sola azienda.
- `cards`: slug per azienda, contenuto JSON, stato, versione e pubblicazione.
- `card_reviews`: storico approvazioni e rifiuti.

## Organizzazioni iniziali
- Meridionale Impianti S.p.A. — riferimento al template MI originale non modificato.
- Saudade Viaggi — branding di base, logo definitivo ancora da configurare.

## Workflow richiesto
`draft → pending → published` (approvazione org_admin) oppure `pending → rejected`; `published → suspended`.

## Vincoli di sicurezza per la fase 2
1. Attivare autenticazione reale (es. Neon Auth) e validare sessioni lato server.
2. Tutte le query private devono essere filtrate per membership server-side; non fidarsi dell'organization_id passato dal browser.
3. Solo admin aziendale può approvare o pubblicare card della propria azienda; il super admin ha accesso cross-tenant.
4. Gli endpoint pubblici devono restituire soltanto card `published` e solo campi pubblicabili.
5. Non esporre mai `DATABASE_URL` o chiavi di accesso nel frontend.
6. Approvazione e pubblicazione devono essere atomiche e registrate in `card_reviews`.
7. Per modifiche a card pubblicate prevedere revisioni in attesa, senza alterare la versione pubblica fino a nuova approvazione.

## Stato reale
Schema creato e inizializzato. Autenticazione, API, controlli di accesso e pubblicazione NON ancora attivi; l'editor pubblico attuale resta indipendente e invariato.
