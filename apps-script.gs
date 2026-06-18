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
 * Le nuove adesioni vengono aggiunte come riga in fondo al foglio (gid=0),
 * con geocodifica automatica dell'indirizzo (lat/lng) e invio di una
 * email di notifica a NOTIFY_EMAIL.
 *
 * NB: dopo ogni modifica al codice, per aggiornare l'app web fai
 *     Distribuisci → Gestisci distribuzioni → (matita) → Versione: Nuova versione → Distribuisci.
 */

// Email a cui notificare ogni nuova adesione
var NOTIFY_EMAIL = "gianluca.poggi@ancepiemonte.it";

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheets()[0]; // primo foglio = gid 0
    var p = (e && e.parameter) ? e.parameter : {};

    // Prossimo numero d'ordine = numero di righe dati esistenti + 1
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
      lng
    ]);

    // Email di notifica
    try {
      var corpo =
        "Nuova adesione ricevuta dalla dashboard ANCE Emergenze Idrauliche.\n\n" +
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
      MailApp.sendEmail(NOTIFY_EMAIL, "Nuova adesione: " + (p.ragione_sociale || "impresa"), corpo);
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
