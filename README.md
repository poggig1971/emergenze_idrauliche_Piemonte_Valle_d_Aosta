# ANCE Emergenze Idrauliche

Dashboard interattiva per la consultazione su mappa delle imprese edili qualificate per
interventi di **emergenza idraulica** in **Piemonte e Valle d'Aosta**, realizzata per
ANCE Piemonte e Valle d'Aosta.

L'applicazione mostra le imprese su una mappa OpenStreetMap (Leaflet.js), con filtri per
provincia, bacino idrografico, reperibilità H24 e qualificazione SOA, contatori dinamici e
pannello di dettaglio per ciascuna impresa.

## Demo live

Dashboard pubblicata su GitHub Pages:

**https://poggig1971.github.io/emergenze_idrauliche_Piemonte_Valle_d_Aosta/**

*(disponibile qualche minuto dopo aver attivato GitHub Pages)*

## Fonte dati

I dati sono alimentati da un **Google Sheet pubblico** letto in formato CSV:

- **Foglio dati:** https://docs.google.com/spreadsheets/d/11Z14AM03ONDi1pNgMW0mSV9tcvD2DjFgp4FYVXZt7qw/edit
- **Endpoint CSV usato dall'app:** `https://docs.google.com/spreadsheets/d/11Z14AM03ONDi1pNgMW0mSV9tcvD2DjFgp4FYVXZt7qw/export?format=csv&gid=0`

All'avvio l'app legge il foglio via `fetch`, mette i dati in cache in memoria e popola mappa,
lista e contatori. Se il foglio non è raggiungibile, l'app usa automaticamente la copia locale
`data/imprese_fallback.json` (modalità offline).

Il pulsante **"Aggiorna dati"** nell'header rilegge il foglio senza ricaricare la pagina.

### Colonne del foglio

```
ordine | provincia | ragione_sociale | indirizzo | citta |
persona_riferimento | telefono | email | qualificazione_soa |
addetti | qualificazione_personale | reperibilita_h24 |
mezzi | bacini | logo | lat | lng
```

`provincia` usa le sigle: TO, AL, AT, BI, CN, NO, VC, VB, AO.
`bacini` è una lista di nomi separati da spazio (es. `PO SESIA DORA`).

**Contatti multipli.** I campi `telefono` ed `email` possono contenere più valori
separati dal punto centrale ` · ` (es. `0143 635755 · 3339273965`). La dashboard li
mostra come link cliccabili separati.

**Logo impresa.** La colonna `logo` è opzionale: inserendo l'URL di un'immagine
(es. `https://.../logo.png`) il logo comparirà nell'intestazione del pannello di
dettaglio dell'impresa. Lasciandola vuota non viene mostrato nulla. Si possono usare
anche percorsi locali (es. `img/giustiniana.png`) caricando le immagini nella repo.

## Come aggiornare i dati

1. Apri il [Google Sheet](https://docs.google.com/spreadsheets/d/11Z14AM03ONDi1pNgMW0mSV9tcvD2DjFgp4FYVXZt7qw/edit).
2. Aggiungi o modifica le righe (mantieni l'ordine e i nomi delle colonne della prima riga).
3. Per ogni nuova impresa inserisci anche `lat` e `lng` (coordinate decimali, es. `45.07, 7.68`).
4. Salva: il foglio è già condiviso pubblicamente, quindi le modifiche sono immediate.
5. Nella dashboard premi **"Aggiorna dati"** per ricaricare.

> **IMPORTANTE — condivisione del foglio.** Perché l'app possa leggere il CSV senza login, il
> foglio deve essere condiviso come *"Chiunque abbia il link → Visualizzatore"*.
> In Google Sheets: **Condividi → Accesso generale → Chiunque abbia il link → Visualizzatore**.

### Caricare i dati aggiornati nel foglio (re-import)

Il file `imprese.csv` nella repo contiene i 51 record aggiornati (con telefoni ed email
multipli e la colonna `logo`). Per portarli nel Google Sheet **mantenendo lo stesso
ID/URL** già usato dall'app:

1. Apri il Google Sheet.
2. **File → Importa → Carica** → seleziona `imprese.csv`.
3. Opzione di importazione: **"Sostituisci foglio corrente"** → Importa.

In questo modo l'ID del foglio non cambia e l'app continua a funzionare senza modifiche.

### Allineare il fallback offline (opzionale)

Per tenere aggiornata la copia offline, esporta il foglio in CSV e rigenera
`data/imprese_fallback.json` (stessa struttura del CSV, valori `lat`/`lng` numerici).

## Struttura del progetto

```
/
├── index.html                  pagina principale
├── style.css                   stili (header, sidebar, mappa, pannello, responsive)
├── app.js                      logica: fetch CSV, parsing, filtri, mappa, dettaglio
├── data/
│   └── imprese_fallback.json   copia locale dei dati per uso offline
└── README.md
```

## Pubblicazione su GitHub Pages

Dalla cartella del progetto:

```bash
git init
git add .
git commit -m "ANCE Emergenze Idrauliche - dashboard iniziale"
git branch -M main
git remote add origin https://github.com/poggig1971/emergenze_idrauliche_Piemonte_Valle_d_Aosta.git
git push -u origin main
```

Quindi su GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch →
Branch: `main` / `/root` → Save**. Dopo qualche minuto la dashboard sarà online all'indirizzo
indicato nella sezione *Demo live*.

## Tecnologie

- [Leaflet.js](https://leafletjs.com/) 1.9.4 + tile OpenStreetMap
- HTML / CSS / JavaScript vanilla (nessun framework, nessuna build)
- Google Sheets come backend dati (CSV pubblico)

## Licenza

Uso interno ANCE Piemonte e Valle d'Aosta. Dati delle imprese forniti dalle imprese stesse
tramite modulo di adesione.
