---
title: Novità
sourceHash: 29b86f4d2465d65b
description: "Note di rilascio dell'estensione Snug per Chrome: cosa è cambiato in ogni
  versione, dalle nuove opzioni di esportazione automatica alle correzioni."
seoTitle: "Novità di Snug: note di rilascio e modifiche"
---

## 2.3.1

2026-11-03

### Corretto

- Ora compaiono messaggi più chiari quando Snug ha bisogno dell’accesso a
  Download, invece di un codice di errore grezzo.
- L’interruttore delle notifiche di errore ora appare disattivato quando manca
  l’accesso alle Notifiche, con un pulsante Consenti.
- La pagina di addio ora riconosce più grafie dei codici lingua.

## 2.3.0

2026-11-03

### Aggiunto

- Aggiunta una pagina di addio che si apre quando Snug viene rimosso: chiede il
  motivo con un clic e ti aiuta in base alla risposta.
- La pagina Novità ora si apre con una riga che spiega cos’è Snug.

### Modificato

- L’accesso a Download e Notifiche ora è facoltativo, quindi gli aggiornamenti
  non mostrano più nuovi avvisi sui permessi. Snug lo chiede solo quando attivi
  l’esportazione automatica in Download o le notifiche di errore.

## 2.2.0

2026-10-10

### Aggiunto

- L'esportazione automatica ora può salvare in una Cartella personalizzata a tua
  scelta, ovunque sul computer.
- Snug ora ti avvisa in anticipo quando serve l'accesso alla cartella, e la
  pagina Esportazione automatica ha un pulsante Consenti accesso per concederlo
  di nuovo.

### Modificato

- La Conservazione tiene solo le esecuzioni più recenti, contate tra Download e
  la Cartella personalizzata.

## 2.1.0

2026-10-08

### Modificato

- L'importazione è stata molto migliorata: scegli o rilascia più file
  contemporaneamente, vedine l'anteprima come albero e scegli esattamente cosa
  portare dentro. Anche il popup della barra degli strumenti accetta file
  rilasciati.

## 2.0.3

2026-10-06

### Aggiunto

- Il popup ora mostra, dopo la tua prima esportazione riuscita, un invito a
  lasciare una recensione, una sola volta e chiudibile.
- L'informativa sulla privacy ora descrive lo stato solo locale dell'invito.

### Modificato

- Rifinito l'aspetto del popup: bordi delle schede più chiari, un anello di
  focus da tastiera più visibile in modalità chiara e transizioni più fluide di
  pulsanti e menu.

## 2.0.2

2026-10-06

### Aggiunto

- La barra laterale dell'App ora rimanda al sito web di Snug e all'informativa
  sulla privacy.
- Aggiunta una voce in Novità che annuncia il sito web.

### Modificato

- La home page dell'estensione nel manifest ora punta al sito web.

## 2.0.1

2026-10-04

### Modificato

- Riscritte le descrizioni dello store in tutte e 10 le lingue, in modo che si
  leggano come frasi semplici. Nessuna modifica funzionale rispetto alla 2.0.0,
  che non è mai stata pubblicata.

## 2.0.0

2026-10-02

### Aggiunto

- Aggiunta una nuova App con una barra laterale per esportazione, importazione,
  esportazione automatica, impostazioni e novità.
- Aggiunta una pagina Duplicati per trovare i segnalibri ripetuti ed eliminare
  solo quelli che scegli, più un'opzione Salta i duplicati all'importazione.
- L'esportazione automatica aggiunge pianificazioni orarie e settimanali, la
  Conservazione per tenere solo gli ultimi backup e una notifica se un backup
  fallisce.
- Aggiunta l'esportazione in Markdown, OPML e XBEL, e l'importazione dal file
  Bookmarks di un profilo di Chrome, da XBEL e dai segnalibri di Safari, con
  avanzamento e Annulla.
- Reso veloce l'albero dei segnalibri anche con librerie enormi e pienamente
  utilizzabile con la tastiera e con gli screen reader.

### Modificato

- L'estensione ora si chiama **Snug**, con un nuovo nome e una nuova icona.
  Stessa promessa di restare solo in locale: nulla cambia per i tuoi dati o le
  tue impostazioni.
- Ridisegnato il popup per renderlo più compatto.
- Applicata la nuova palette di colori di Snug a tutta l'estensione.
- Aggiunte 8 nuove lingue, per un totale di 10 impostazioni locali: inglese,
  spagnolo, tedesco, francese, italiano, portoghese brasiliano, russo,
  giapponese, coreano e cinese semplificato.
- Il ripristino ora salva prima un'istantanea di sicurezza dei tuoi segnalibri,
  e puoi annullare una sostituzione dalla pagina Importa.

## 1.7.0

2026-10-01

### Aggiunto

- Aggiunti una scheda di stato e un pulsante Esporta ora alle impostazioni
  dell'esportazione automatica, più una riga di stato nel popup che indica se
  l'esportazione automatica è attiva, disattivata o non riuscita.

### Corretto

- Resa più sicura l'importazione dei segnalibri, rifiutando gli schemi URL non
  consentiti (per esempio `javascript:`) nei file CSV, HTML e JSON.

## 1.6.0

2026-04-29

### Aggiunto

- Aggiunta l'esportazione automatica — salva automaticamente i tuoi segnalibri a
  intervalli personalizzati (ogni 12 ore, ogni giorno, ogni 3 o 7 giorni) nella
  cartella di download che preferisci.

## 1.5.0

2025-04-29

### Aggiunto

- Aggiunta l'importazione avanzata — ripristina i segnalibri nelle loro
  posizioni originali (Barra dei segnalibri e Altri segnalibri), con opzioni di
  unione o sostituzione.

## 1.4.0

2025-04-29

### Aggiunto

- Aggiunti modelli di nome file personalizzabili per le esportazioni — usa
  segnaposto di data e ora come %yyyy, %mm, %dd per creare automaticamente nomi
  di file univoci con data e ora.

## 1.3.0

2025-02-16

### Aggiunto

- Aggiunto il supporto per la modalità scura, che segue automaticamente le
  preferenze di tema del tuo sistema.

## 1.2.0

2025-02-14

### Modificato

- Ora si adatta automaticamente alla lingua del tuo browser! Disponibile in
  inglese e spagnolo.

## 1.1.0

2025-02-13

### Modificato

- I segnalibri importati ora finiscono in una cartella dedicata, per non
  mescolarsi con quelli già presenti.
- Controllo più preciso su quali date includere nelle esportazioni.

## 1.0.0

2024-08-05

### Aggiunto

- Aggiunta la nuova funzione di esportazione avanzata per un maggiore controllo
  sui tuoi segnalibri.
- Introdotte le pagine di benvenuto e di aggiornamento, per tenerti informato
  sulle novità.

### Modificato

- Migliorate le prestazioni complessive per un'esperienza più fluida.

## 0.1.1

2024-08-04

### Corretto

- Risolto un bug critico che riguardava gli utenti con lingue del browser
  diverse dall'inglese.
- Migliorata l'affidabilità delle funzioni di importazione ed esportazione.
- Risolto un problema per cui l'icona dell'estensione non compariva nella barra
  degli strumenti del browser.
- Risolto un problema per cui l'estensione non funzionava in alcuni browser.

## 0.1.0

2024-08-03

### Aggiunto

- Prima versione dell'estensione per importare ed esportare i segnalibri.
- Semplice funzione di importazione per file HTML e JSON.
- Funzionalità di base per esportare i segnalibri nei formati HTML e JSON.
