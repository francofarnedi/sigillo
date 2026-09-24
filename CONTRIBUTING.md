# Contribuire a Sigillo

Grazie per l'interesse! Sigillo è piccolo e vuole restare semplice: poche regole, ma quelle contano.

## Avvio in locale

Non c'è nessuna build e nessuna dipendenza da installare.

1. Clona il repo (o scarica lo zip dell'ultima [release](https://github.com/francofarnedi/sigillo/releases)).
2. Apri `index.html` con doppio clic.

Controlla sempre che l'app funzioni **aperta da file://**: è il modo in cui la usa chi vuole stare offline.
Se preferisci un server locale, va bene qualsiasi server statico (per esempio `python3 -m http.server`).

## Le regole che non si discutono

- **Nessuna richiesta di rete.** Il documento non deve mai lasciare il computer di chi lo usa. Niente fetch,
  analytics, font, CDN o immagini esterne. La CSP in `index.html` (`connect-src 'none'`) resta com'è.
- **Nessuna build obbligatoria.** HTML, CSS e JavaScript "semplici", eseguibili così come sono.
- **Librerie esterne solo in `vendor/`**, in versione minificata e con la loro licenza nell'intestazione.
  Aggiungine una solo se è davvero indispensabile, e segnalalo nella PR.
- **Niente documenti reali** in issue, PR, screenshot o file di test. Usa il documento fittizio
  di esempio già incluso nell'app.

## Stile del codice

- JavaScript moderno senza framework, `'use strict'`, un unico `app.js` diviso in sezioni commentate.
- Commenti e testi dell'interfaccia in italiano.
- Indentazione a 2 spazi, apici singoli, punto e virgola.
- Colori e misure come variabili CSS su `:root` in `style.css`, con la variante per il tema scuro.
- Se tocchi la marca invisibile (`embedMark` / `detectMark`), verifica che le copie già emesse
  si leggano ancora: cambiare il formato renderebbe illeggibili i registri esistenti.

## Proporre una modifica

1. Apri prima una [issue](https://github.com/francofarnedi/sigillo/issues) se la modifica non è banale,
   così ne parliamo prima che tu ci lavori.
2. Fai il fork del repo e crea un branch dal nome parlante (`fix/ritaglio-pdf`, `feat/fronte-retro`).
3. Fai commit piccoli, con messaggi chiari.
4. Apri una pull request verso `main` e compila la checklist.

Le modifiche entrano in `main` solo tramite pull request. Dopo il merge la demo su GitHub Pages
si aggiorna da sola.

## Domande

Per dubbi e idee ancora da definire usa le [Discussions](https://github.com/francofarnedi/sigillo/discussions).
Per le vulnerabilità leggi [SECURITY.md](SECURITY.md): **non** aprire una issue pubblica.

Contribuendo accetti che il tuo codice sia rilasciato con la [licenza MIT](LICENSE) del progetto.
