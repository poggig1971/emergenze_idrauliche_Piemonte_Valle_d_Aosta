/**
 * ANCE Emergenze Idrauliche – ricezione adesioni dal form della dashboard.
 *
 * SETUP (una volta sola):
 * 1. Apri il Google Sheet dei dati.
 * 2. Menu: Estensioni → Apps Script.
 * 3. Cancella il contenuto e incolla questo file. Salva (icona dischetto).
 * 4. Distribuisci → Nuova distribuzione → Tipo: "App web".
 *      - Descrizione: adesioni ANCE
 *      - Esegui come: Me (il tuo account)
 *      - Chi ha accesso: Chiunque
 *    Autorizza quando richiesto.
 * 5. Copia l'URL che termina con /exec.
 * 6. Incollalo in app.js nella costante APPS_SCRIPT_URL e fai push.
 *
 * Le adesioni inviate dal form vengono aggiunte al foglio (tab) "Richieste di
 * Inserimento" — una coda da validare. NON finiscono direttamente in "Imprese
 * Aderenti" (gid=0), che è ciò che la dashboard mostra. Così l'amministratore
 * decide se promuoverle (copiando la riga nel foglio principale).
 * Ogni richiesta viene geocodificata (lat/lng) e notificata via email a NOTIFY_EMAIL.
 *
 * NB: dopo ogni modifica al codice, per aggiornare l'app web fai
 *     Distribuisci → Gestisci distribuzioni → (matita) → Versione: Nuova versione → Distribuisci.
 */

// Foglio (tab) in cui salvare le richieste in attesa di validazione
var SHEET_RICHIESTE = "Richieste di Inserimento";

// Email a cui notificare ogni nuova richiesta (più indirizzi separati da virgola)
var NOTIFY_EMAIL = "info@ancepiemonte.it,operepubbliche@ancepiemonte.it";

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_RICHIESTE);
    if (!sh) {
      // crea il foglio coda con l'intestazione se non esiste
      sh = ss.insertSheet(SHEET_RICHIESTE);
      sh.appendRow(["ordine","provincia","ragione_sociale","indirizzo","citta",
        "persona_riferimento","telefono","email","qualificazione_soa","addetti",
        "qualificazione_personale","reperibilita_h24","mezzi","bacini","logo","lat","lng",
        "data_richiesta","stato"]);
    }
    // assicura le intestazioni delle colonne di tracciamento (18 = data, 19 = stato)
    if (!sh.getRange(1, 18).getValue()) sh.getRange(1, 18).setValue("data_richiesta");
    if (!sh.getRange(1, 19).getValue()) sh.getRange(1, 19).setValue("stato");

    var p = (e && e.parameter) ? e.parameter : {};

    // Numero progressivo nella coda delle richieste
    var ordine = sh.getLastRow(); // riga 1 = intestazione

    // Geocodifica indirizzo -> lat/lng
    var lat = "", lng = "";
    try {
      var q = [p.indirizzo, p.citta, p.provincia, "Italia"].filter(function (x) { return x; }).join(", ");
      var geo = Maps.newGeocoder().setRegion("it").geocode(q);
      if (geo && geo.results && geo.results.length) {
        lat = geo.results[0].geometry.location.lat;
        lng = geo.results[0].geometry.location.lng;
      }
    } catch (gErr) { /* geocodifica non disponibile: lascia vuoto */ }

    sh.appendRow([
      ordine,
      p.provincia || "",
      p.ragione_sociale || "",
      p.indirizzo || "",
      p.citta || "",
      p.persona_riferimento || "",
      p.telefono || "",
      p.email || "",
      p.qualificazione_soa || "",
      p.addetti || "",
      p.qualificazione_personale || "",
      p.reperibilita_h24 || "",
      p.mezzi || "",
      p.bacini || "",
      p.logo || "",
      lat,
      lng,
      new Date(),     // data_richiesta
      "DA VALUTARE"   // stato
    ]);

    // Email di notifica
    try {
      var corpo =
        "Nuova RICHIESTA DI INSERIMENTO ricevuta dalla dashboard ANCE Emergenze Idrauliche.\n" +
        "(salvata nel foglio \"" + SHEET_RICHIESTE + "\", in attesa di validazione)\n\n" +
        "Ragione sociale: " + (p.ragione_sociale || "") + "\n" +
        "Provincia: " + (p.provincia || "") + "\n" +
        "Città: " + (p.citta || "") + "\n" +
        "Indirizzo: " + (p.indirizzo || "") + "\n" +
        "Persona di riferimento: " + (p.persona_riferimento || "") + "\n" +
        "Telefono: " + (p.telefono || "") + "\n" +
        "E-mail: " + (p.email || "") + "\n" +
        "Qualificazione SOA: " + (p.qualificazione_soa || "") + "\n" +
        "Addetti: " + (p.addetti || "") + "\n" +
        "Personale qualificato: " + (p.qualificazione_personale || "") + "\n" +
        "Reperibilità H24: " + (p.reperibilita_h24 || "") + "\n" +
        "Mezzi: " + (p.mezzi || "") + "\n" +
        "Bacini: " + (p.bacini || "") + "\n" +
        "Coordinate: " + lat + ", " + lng + "\n";
      MailApp.sendEmail(NOTIFY_EMAIL, "Richiesta inserimento: " + (p.ragione_sociale || "impresa"), corpo);
    } catch (mErr) { /* invio email non riuscito: l'adesione resta comunque salvata */ }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, ordine: ordine }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput("ANCE Emergenze Idrauliche - endpoint adesioni attivo.");
}
