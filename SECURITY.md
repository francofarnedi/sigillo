# Sicurezza

Sigillo tratta copie di documenti d'identità: una vulnerabilità qui può avere conseguenze reali.
Grazie se ci aiuti a trovarle.

## Come segnalare una vulnerabilità

**Non aprire una issue pubblica.** Usa la segnalazione privata di GitHub:

1. vai su [Security → Report a vulnerability](https://github.com/francofarnedi/sigillo/security/advisories/new);
2. descrivi il problema, i passi per riprodurlo e l'impatto che immagini.

Non allegare documenti reali: usa il documento fittizio di esempio dell'app.

Rispondo di solito entro 7 giorni. Concordiamo insieme i tempi di correzione e, se vuoi,
ti cito nella nota di rilascio.

## Cosa ci interessa di più

- Qualsiasi modo in cui la pagina possa **inviare dati all'esterno** (aggirare la CSP, richieste nascoste,
  librerie in `vendor/` compromesse).
- Contenuti delle copie che **restano leggibili** quando non dovrebbero (coperture a nero reversibili,
  metadati EXIF non rimossi, dati residui nei PDF esportati).
- Iniezione di codice tramite file caricati, campi del form o registro JSON importato.
- Una **marca invisibile falsificabile** che attribuisca una copia al destinatario sbagliato.

## Limiti noti (non sono vulnerabilità)

- La filigrana visibile si può coprire o ritoccare con un editor di immagini: scoraggia, non impedisce.
- La marca invisibile non resiste a ridimensionamenti non interi, foto dello schermo o stampa e scansione.
- Il registro vive nel `localStorage` del browser: chi ha accesso al computer può leggerlo.
- La pixelatura di un testo corto a volte si può ricostruire: per i dati sensibili usa il nero pieno.

## Versioni supportate

Correggo solo l'ultima versione su `main`, che è anche quella pubblicata su GitHub Pages.
