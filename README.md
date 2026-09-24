# Sigillo

Filigrana per le copie dei documenti d'identità, ispirata all'articolo
[Copia della carta d'identità? Anche no](https://francamente.tech/2026/09/24/copia-carta-identita-anche-no/)
e a FiligraneFacile.

Tutto gira nel browser: niente server, niente upload, niente dipendenze di rete.
La CSP in `index.html` (`connect-src 'none'`) impedisce alla pagina qualsiasi richiesta in uscita.

## Avvio

Doppio clic su `index.html` (Chrome, Edge, Firefox, Safari). Funziona anche offline.

Oppure provala online, senza scaricare nulla: **[francofarnedi.github.io/sigillo](https://francofarnedi.github.io/sigillo/)**. Anche la versione online gira tutta nel tuo browser: nessun file viene caricato.

## Cosa fa

1. **Documento**: carica JPG/PNG/WebP/HEIC (HEIC solo su Safari) o PDF, con scelta della pagina.
2. **Ritaglio**: selezioni solo il dettaglio che serve (proporzioni libere, tessera ID-1, A4) e puoi ruotare.
3. **Filigrana**: testo a mosaico diagonale con destinatario, finalità, data e codice unico `SG-XXXXXX`,
   più linee di sicurezza ondulate e un sigillo rotondo con il codice. Puoi regolare colore, opacità,
   dimensione, densità e angolo.
4. **Protezioni**: bianco e nero; coperture a nero pieno o pixelate sui dati non richiesti;
   **marca invisibile** con il codice nascosto nei pixel.
5. **Esporta**: PNG, JPG o PDF, sempre senza EXIF. Ogni copia entra nel registro e riceve subito un nuovo codice.
6. **Registro**: elenco delle copie rilasciate (destinatario, finalità, data, codice, SHA-256, miniatura),
   salvato in `localStorage`, con esportazione e importazione in JSON.
7. **Verifica**: carichi una copia ritrovata e Sigillo ti dice a chi l'avevi data. Confronta prima
   l'impronta SHA-256 (file identico), poi cerca la marca invisibile; in alternativa puoi cercare il codice a mano.
8. **Messaggio GDPR** (artt. 13, 15, 17) già compilato, da copiare nella mail.

## Marca invisibile

108 bit: 16 di sincronismo e 2 copie di (30 bit di codice + CRC-16). Sono disposti in una griglia 12×9
di celle 4×4 px ripetuta su tutta l'immagine, con una variazione di luminosità di ±4.
In lettura il segnale di tutte le ripetizioni si somma, quindi:

- regge a screenshot, ritagli parziali, nuovi salvataggi in PNG, JPG fino a qualità 70 circa
  e screenshot su schermo retina (2×);
- **non** regge a ridimensionamenti non interi, foto dello schermo o stampa e scansione.

Prima si confronta per correlazione con i codici del registro, che è il metodo più tollerante;
poi si prova la lettura diretta con correzione dei bit più deboli.

## Struttura

```
index.html   interfaccia
style.css    stile (solo font di sistema, nessuna risorsa esterna)
app.js       logica: caricamento, ritaglio, render, marca invisibile, registro, verifica
vendor/      pdf.js 3.11.174 (legacy) e jsPDF 2.5.2, in locale
```

pdf.js gira con il "fake worker" (`pdf.worker.min.js` caricato via `<script>`), così funziona anche da `file://`.

## Licenza

Sigillo è rilasciato con licenza [MIT](LICENSE): puoi usarlo, modificarlo e redistribuirlo liberamente,
a patto di mantenere l'avviso di copyright.

Le librerie in `vendor/` restano con le loro licenze, riportate nell'intestazione di ciascun file:
[pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0, © Mozilla Foundation) e
[jsPDF](https://github.com/parallax/jsPDF) (MIT, © James Hall, yWorks GmbH e contributori).
