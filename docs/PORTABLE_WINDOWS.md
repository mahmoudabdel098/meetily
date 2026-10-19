# Meetily portable per Windows

Versione di Meetily che non si installa: si estrae uno ZIP e si avvia `meetily.exe`.
Non servono permessi di amministratore, né altri programmi, né la connessione a Internet:
i modelli di trascrizione e di riassunto sono già inclusi.

## Sicurezza dei dati

Questa build è compilata in modalità **local-only**. La modalità è fissata in fase di
compilazione: non si può disattivare dall'app né modificando file.

| Cosa | Comportamento |
| --- | --- |
| Trascrizione | Avviene sul PC (Parakeet o Whisper). L'audio non viene mai inviato fuori. |
| Riassunti | Solo Built-in AI (sul PC) o un server LLM su `localhost`. OpenAI, Claude, Groq, OpenRouter e gli endpoint remoti sono nascosti e bloccati anche dal backend. |
| Analytics (PostHog) | Disattivati in modo permanente. |
| Aggiornamenti | Rimossi del tutto: niente pulsante "Check for Updates" e nessun contatto con server esterni. |
| Link e pagine web | Nessuno: l'app non contiene link né può aprire il browser. |
| Dati salvati | Solo nella cartella `data\` accanto all'exe, nient'altro nel profilo utente. |

L'unico traffico di rete possibile è il download di un modello aggiuntivo, se lo
richiedi tu dalle impostazioni. Scarica modelli pubblici e non invia nessun dato.

Cosa resta sotto la tua responsabilità:

- **Dove tieni la cartella.** `data\` contiene trascrizioni e registrazioni in chiaro.
  Tienila sul disco del PC aziendale (di solito cifrato con BitLocker) e non su una
  chiavetta personale o in una cartella sincronizzata con un cloud privato.
- **Consenso.** Prima di registrare una call, avvisa i partecipanti (GDPR) e verifica
  che le regole aziendali lo consentano. Se hai dubbi, chiedi all'IT o al DPO.
- **Integrità.** `SHA256SUMS.txt` elenca l'impronta di ogni file prodotto dalla build.
  Puoi verificarla con `Get-FileHash` (vedi sotto).

## Cosa fare, passo per passo

### 1. Crea lo ZIP con GitHub Actions (una volta sola, dal tuo computer personale)

Dal Mac non si può compilare la versione Windows, quindi la compila GitHub.

1. Crea un account su <https://github.com>, se non ce l'hai.
2. Apri <https://github.com/Zackriya-Solutions/meetily> e clicca **Fork**, poi **Create fork**.
3. Carica nel fork le modifiche di questa cartella: `portable.rs`, `local_only.rs`,
   il workflow e questa guida.
4. Nel fork apri la scheda **Actions**. Se GitHub lo chiede, clicca su
   "I understand my workflows, go ahead and enable them".
5. A sinistra scegli **Build Portable - Windows**, poi **Run workflow** e imposta:
   - `gpu`: **cpu** (funziona su qualsiasi PC);
   - `include-models`: **spuntato**.
6. Aspetta che diventi verde: circa 40–60 minuti la prima volta, meno le successive.
7. Apri la run e, in fondo alla pagina in **Artifacts**, scarica
   `meetily-<versione>-windows-x64-portable-cpu`. È lo ZIP (circa 2 GB).

### 2. Porta lo ZIP sul PC di lavoro

Usa un canale consentito dalla tua azienda (OneDrive aziendale, rete interna, ecc.).

### 3. Estrai e avvia

1. Clic destro sullo ZIP, poi **Estrai tutto…**, in una cartella tua, ad esempio
   `C:\Users\<tu>\Meetily` o `Documenti\Meetily`. Non usare `C:\Program Files`.
2. (Facoltativo) Verifica i file con PowerShell, aperto nella cartella estratta:

   ```powershell
   Get-Content SHA256SUMS.txt | ForEach-Object {
     $hash, $file = $_ -split '  ', 2
     if ((Get-FileHash $file -Algorithm SHA256).Hash.ToLower() -ne $hash) { "MODIFICATO: $file" }
   }
   ```

   Se non stampa nulla, tutti i file sono integri.
3. Doppio clic su `meetily.exe`.
   - Se compare **"Windows ha protetto il PC"**, clicca su **Ulteriori informazioni**
     e poi **Esegui comunque**. Succede perché l'exe non è firmato.
   - Se invece compare un messaggio che dice che l'app è **bloccata dall'amministratore**,
     l'azienda non permette programmi non approvati: fermati e chiedi all'IT. Non provare
     ad aggirare il blocco.
4. Completa l'onboarding. I modelli risultano già presenti, quindi non c'è nulla da scaricare.

### 4. Registrare una call di Teams

Una volta sola, nelle impostazioni di registrazione di Meetily:

- **Microfono**: il microfono che usi in Teams;
- **Audio di sistema**: le cuffie o gli altoparlanti su cui senti Teams.
  L'audio viene catturato con WASAPI loopback, incluso in Windows.

Poi lascia Meetily aperto (anche solo come icona nella barra delle applicazioni). Per le call
pensa a tutto il rilevamento automatico:

1. Entri in una call di Teams. Dopo qualche secondo Meetily va in primo piano e mostra
   **"Call Microsoft Teams rilevata: la registrazione parte tra 10 secondi"**.
2. In quei 10 secondi avvisa i partecipanti, oppure premi **Annulla** per non registrare
   quella call.
3. Allo scadere la registrazione parte e la trascrizione compare in tempo reale.
4. Quando esci dalla call e Teams rilascia il microfono per 30 secondi, Meetily ferma la
   registrazione e salva la riunione. Se hai attivato il riassunto automatico, lo genera
   con il modello locale.

Note:

- Funziona con il nuovo Teams, il Teams classico, Zoom e Webex installati come app. Le call
  aperte nel browser (Teams web, Google Meet) non vengono rilevate: lì avvia la
  registrazione a mano.
- Teams tiene il microfono aperto anche quando sei in muto, quindi la registrazione non si
  ferma se ti silenzi.
- Vengono fermate in automatico solo le registrazioni avviate dal rilevamento. Quelle
  avviate a mano restano sotto il tuo controllo.
- Il rilevamento usa i dati con cui Windows indica quali app stanno usando il microfono
  (l'icona del microfono nella barra delle applicazioni). Non servono permessi di
  amministratore e non viene letto nulla dentro Teams.
- Per disattivarlo vai in **Settings**, poi **General**, e spegni
  **Rilevamento automatico delle call**.

## Funzioni principali

### Chi ha detto cosa

Ogni frase della trascrizione ha un'etichetta:

- **Tu**: la tua voce, presa dal microfono;
- **Partecipante 1, 2, 3…**: le voci della call. Un piccolo modello vocale locale
  (`data\models\speaker\`) le riconosce e le separa.

Il riconoscimento è affidabile con le cuffie. Con gli altoparlanti la tua voce e quella
degli altri si mescolano di più: è possibile qualche errore. Se due etichette sono la
stessa persona, o vuoi mettere i nomi veri, apri la riunione e clicca su
**Partecipanti**: rinomina "Partecipante 1" in "Marco". Dando lo stesso nome a due
partecipanti, vengono uniti.

### Export in PDF, Word e Markdown

Nella riunione, il pulsante **Esporta** crea un documento con titolo, data,
partecipanti, riassunto e trascrizione completa (con chi ha parlato e l'orario). Il
documento viene generato sul PC.

### Cartella delle trascrizioni

In **Settings**, poi **General**, poi **Cartella delle trascrizioni**, scegli dove
salvare ogni riunione e in quali formati (predefinito: Word, nella cartella
`data\trascrizioni\` accanto all'app). Puoi scegliere qualsiasi cartella, ad esempio
una cartella di OneDrive aziendale. Il file viene creato a fine registrazione e
aggiornato quando il riassunto è pronto o quando rinomini i partecipanti.

## Cosa c'è nella cartella

| File | A cosa serve |
| --- | --- |
| `meetily.exe` | L'applicazione |
| `llama-helper.exe` | Motore dei riassunti locali |
| `ffmpeg.exe` | Conversione e unione dell'audio |
| `onnxruntime.dll` | Motore di trascrizione Parakeet |
| `templates\` | Modelli di riassunto inclusi |
| `data\models\` | Modelli inclusi: Parakeet v3 (trascrizione), Qwen 3.5 2B (riassunti), CAM++ (voci) |
| `LICENSES.txt` e testi delle licenze | Note di licenza dei componenti open source (obbligatorie) |
| `portable.txt` | Attiva la modalità portable |
| `SHA256SUMS.txt` | Impronte dei file per la verifica |

## Dove vengono salvati i dati

Con `portable.txt` accanto all'exe, tutto finisce in `data\`:

| Percorso | Contenuto |
| --- | --- |
| `data\meeting_minutes.sqlite` | Riunioni, trascrizioni e riassunti |
| `data\recordings\` | Registrazioni audio |
| `trascrizioni\` (dentro `data\`) | File Word/PDF/Markdown delle riunioni (cartella predefinita) |
| `data\models\` | Modelli |
| `data\*.json`, `data\config\` | Impostazioni |
| `data\EBWebView\` | Dati dell'interfaccia |
| `data\templates\` | Modelli di riassunto personalizzati |

Per **eliminare tutto**, chiudi Meetily dall'icona nella barra delle applicazioni
(chiudere la finestra la nasconde soltanto) e cancella la cartella. Non rimane nulla nel profilo utente,
a parte i file temporanei degli import audio in `%TEMP%`.

Per **aggiornare**, estrai la nuova versione e copia dentro la cartella `data\` della vecchia.

## Requisiti

- Windows 10 o 11 a 64 bit.
- Microsoft Edge WebView2 Runtime: è già presente su Windows 11 e sui Windows 10 aggiornati.
- Circa 3 GB di spazio libero e almeno 8 GB di RAM consigliati.
