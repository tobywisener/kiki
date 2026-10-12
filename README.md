# Kiki

A private, installable Thai–English chat for two people. React + Vite frontend, Supabase Auth/Postgres/Realtime, Azure Translator with word alignment, browser dictation with react-speech-recognition, imgbb image attachments, and standards-based Web Push.

Messages are saved and delivered before translation finishes. The recipient sees the translation with an expandable original. Unsent messages and drafts are kept on the device for retry. Notifications contain a generic alert, never message text.

## Local development

Requires Node.js 24 or newer.

```sh
npm install
cp .env.example .env # Skip this if .env already contains your credentials.
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. Without them, the login screen offers a clearly labelled sample conversation. The preview never sends messages or calls translation. Only `VITE_` variables enter the browser build. Never give a database password, Azure Translator key, service-role key, or private VAPID key that prefix.

The project's local `.env` is ignored by Git. Keep it private. No credentials belong in commits, chat screenshots, or frontend hosting variables other than the three public `VITE_` values.

## Database and your two logins

1. In Supabase, turn off **Authentication → Sign In / Providers → Allow new users to sign up**. There is no registration screen in Kiki, and the database separately requires membership.
2. Set `SUPABASE_DB_PASSWORD` in `.env`. Use the host and user shown in **Connect → Direct → Session pooler** if direct IPv6 connections do not work. Set `SUPABASE_DB_HOST` and `SUPABASE_DB_USER` to those values. Passwords are passed separately, so punctuation needs no URL encoding.
3. Run `npm run db:migrate`. Alternatively, run every SQL file in `supabase/migrations` in filename order in the Supabase SQL Editor instead. Choose one migration method; the local script keeps its own migration ledger.
4. Create two confirmed users under **Authentication → Users → Add user → Create new user**. Each of you chooses your own app password. These are app logins, not separate Supabase projects or subscriptions.
5. Set `KIKI_EN_EMAIL`, `KIKI_TH_EMAIL`, `KIKI_EN_NAME`, and `KIKI_TH_NAME` in the local `.env`. Run `npm run db:members` to assign the existing accounts. No invitation emails are sent by this script.

Exactly one member per language is allowed. Only those members can read history and send as themselves. The browser cannot edit saved messages, set translation results, set server timestamps, or write device subscriptions directly. Subscriptions are validated through an authenticated server function. Text and optional image captions are limited to 2,000 characters and sending to 20 messages/person/minute.

Database scripts verify TLS using Supabase's official root certificate in `supabase/root-ca.crt`, downloaded from the database settings page. To use a replacement certificate, set `SUPABASE_DB_CA_PATH`. They never disable certificate verification.

## Translation and notifications

1. Create an **Azure Translator** resource in the Azure portal. Choose the **Free F0** tier for this two-person chat. Copy its key into `AZURE_TRANSLATOR_KEY` in `.env`; set `AZURE_TRANSLATOR_REGION` to the resource’s region if it uses a regional key. Leave the region blank for a global single-service resource. No Azure secret belongs in the frontend.
2. F0 currently includes 2 million characters/month. If that quota is exhausted, originals still send but translation will fail until service is available again. Paid tiers have different billing; the app does not upgrade your resource. [Azure pricing](https://azure.microsoft.com/en-us/pricing/details/translator/)
3. Run `npm run generate:vapid` once. It writes public/private keys into `.env` without printing them. Keep these keys; changing them requires devices to resubscribe. Set `VAPID_SUBJECT=mailto:your-email@example.com`.
4. Sign in to the Supabase CLI yourself: `npx supabase login`. Or provide an existing CLI access token as `SUPABASE_ACCESS_TOKEN` in your local environment.
5. Run `npm run deploy:backend`. This uploads only the required server secrets, deploys the functions, and installs the message-insert webhook. It does not upload the database password. Temporary secret files are removed afterward.
6. Rebuild the frontend with `VITE_VAPID_PUBLIC_KEY` set to the generated public key.

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to its functions automatically. No service-role key is needed in the frontend or local `.env`. Gateway JWT verification is disabled for these functions because the message endpoint accepts database webhooks; the handlers explicitly validate either the webhook secret or a real user JWT and chat membership. The subscription and image-upload endpoints always require a member JWT.

The webhook is asynchronous through `pg_net`; its secret is stored in Supabase Vault. It reads the canonical message by ID instead of trusting text in the webhook body. Translation leases prevent concurrent processing and limit each message to five attempts, spaced at least a minute apart. Both people can manually retry a failed or stale translation. Translation calls time out after 15 seconds. Originals are retained on failure.

Push runs independently of translation. Expired device subscriptions are removed. Delivery is best effort, with no durable notification retry queue; a failed push does not lose the chat message. Messages and translation updates arrive over Supabase Realtime WebSockets, with no periodic message polling. The app fetches history initially and catches up on reconnect, focus, or return to the foreground. The connection indicator describes your connection, not your partner's online status; one grey tick means the server saved the message, two grey ticks mean the recipient’s app received it, and two blue ticks mean it appeared on screen in their visible, focused chat. Receipts update over the same WebSocket connection. Background or suspended apps acknowledge delivery when they next receive history; push notification delivery does not count as message delivery. Only the recipient can set receipts, through a server-timed RPC; clients cannot forge receipt timestamps.

## Dictation: speak, review, send

Tap the microphone beside Send, allow microphone access, and speak in your account's language: English (`en-GB`) or Thai (`th-TH`). Recognised text is appended to your existing message draft. Listening stops after a pause; you can also tap Stop. It stops after one minute or when you leave the app. Review or edit the text, then tap Send for the usual Thai↔English translation. Dictation never sends a message automatically. If the combined draft exceeds 2,000 characters, all text is kept and you must shorten it before sending.

Dictation uses [react-speech-recognition](https://github.com/JamesBrill/react-speech-recognition) with the browser's native Web Speech API. **No Azure Speech resource, key, signup, backend function, or database migration is needed.** Azure Translator is still used for translating sent messages.

1. Run `npm install` and `npm run dev` for local development, or `npm run deploy:frontend` to publish the updated app.
2. Open the HTTPS app in Safari on iPhone or Chrome on Android, sign in, and allow microphone access when you tap the microphone. If denied, allow it in the browser/site settings and reload. Localhost also works for development.
3. Test a short English sentence on the English account and a Thai sentence on the Thai account. Check that the existing draft is preserved, Stop works, and the result can be edited before sending. Test the installed app too if you normally use it.

Browser and language support vary. Unsupported browsers show a dictation notice and leave typing available. Recognition errors keep your existing draft. An internet connection is normally required, and the browser may send audio to its speech service provider (for example Google or Apple); this is not guaranteed offline dictation. Kiki does not record or store voice clips, or send audio to Supabase/Azure Speech. Preview conversations do not activate the microphone. [Browser API documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

## Send images

Tap the image button inside the message box, choose a JPEG, PNG, WebP or GIF under 10 MB, and review the preview. Add an optional caption, then tap Send. The image is uploaded only when you send; Cancel removes the selected image and aborts an in-flight upload. Tap a received or sent image to open it at full size. Captions use the usual Thai↔English translation; images without captions do not call Translator. Notifications and delivery/read ticks work as usual.

Images use the same imgbb API as Musicdiary, through Kiki's authenticated `upload-image` function. Set `IMGBB_API_KEY` in the server-only `.env`, run `npm run db:migrate`, deploy the backend, then deploy the frontend. The existing Musicdiary key can be reused. Never give this key a `VITE_` prefix. No Supabase Storage bucket is used: the message stores only the imgbb URL and optional caption. [imgbb API documentation](https://api.imgbb.com/)

An upload failure keeps the photo and caption for retry. If the upload succeeds but sending the message fails, the imgbb URL is saved in the existing unsent-message queue, so retrying does not upload it again. Selected files stay in memory until sent or removed; reload/sign-out discards an unuploaded selection. An interrupted request may leave an image on imgbb even if no message was saved. Kiki does not provide image deletion or automatic expiry.

**Image links are accessible to anyone who has them.** imgbb does not enforce Kiki membership or provide end-to-end encryption. Uploaded photos remain hosted by imgbb; their availability depends on that service. The caption and conversation record remain restricted to the two chat members. HEIC files must be exported as JPEG/PNG if the phone picker does not convert them.

## Learn from both languages

Hover a linked word or phrase in either language to highlight its match and reveal the other language. On phones, sentences use larger 16px text with inline word selection; tap to select, then tap again or press Escape to clear. Punctuation is not a separate tap target. Linked words are keyboard-focusable. Reordered words and phrases with multiple matches are supported. Nothing is requested from the translation service on hover or tap.

Translation requests include `includeAlignment=true`. The server saves validated source/target ranges with the translated text, converting Azure’s inclusive end offsets into exclusive slice offsets. Thai does not need spaces between words: the returned ranges locate its phrases directly, and grapheme validation prevents splitting combining marks.

Missing or invalid alignment leaves the translation readable without guessed highlights. Older messages keep their existing translations and have no links; this change does not automatically retranslate or bill for old history. Azure describes alignment as experimental and may omit it for common expressions such as “I love you.” [Alignment limitations](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate#obtain-alignment-information)

When the interface is English, Thai text also shows a Latin-letter pronunciation guide. The Thai interface hides this guide. Thai words are segmented with `Intl.Segmenter` and romanized in batches (up to 10 words and 5,000 characters per request) to save exact Thai positions with each pronunciation. Selecting a linked Thai or English phrase highlights the corresponding pronunciation words. The guide is assembled from these word readings; pronunciation requests happen during message processing, never on hover or tap. At most three transliteration requests run concurrently, with a five-second total time budget. English→Thai requests also include `toScript=Latn` as a whole-sentence fallback. Missing or failed word pronunciation leaves the translation readable without guessed highlights. The spelling is an approximate reading aid, not a full guide to Thai tones, and readings of isolated words can differ from a sentence reading. Existing messages without saved word positions show their previous guide until backfilled. Preview pronunciation uses saved Azure results for sample text. [Azure transliteration](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/transliterate)

Until a live Azure emoji fixture verifies the offset convention, links after a non-BMP character (such as many emoji) are omitted rather than risking a wrong highlight. Message text, emoji, and translation are preserved. The preview uses authored sample links.

## Deploy to your webhost (kiki.wisener.me)

Create the subdomain `kiki.wisener.me`, enable its HTTPS certificate, and point its document root at a dedicated folder. This app uses static hosting; it does not need Node.js or PHP on the server.

For FTPS uploads, set these local `.env` values (they are not frontend build variables):

```dotenv
FRONTEND_FTP_HOST=ftp.your-host.example
FRONTEND_FTP_PORT=21
FRONTEND_FTP_USER=your-upload-user
FRONTEND_FTP_PASSWORD=your-upload-password
FRONTEND_FTP_DIR=/public_html/kiki
```

Use the actual document root supplied by your host. A leading `/` selects an absolute FTP path; without it, the folder is relative to the FTP login directory. If the FTP account is already restricted to this site's document root, use `/`. The command requires FTPS with a valid certificate: port 21 uses explicit TLS, and port 990 uses implicit TLS. SFTP is a different protocol and is not supported by this command.

```sh
npm run deploy:frontend
```

The command checks settings, builds the app, uploads only `dist/` through the Mac's built-in `curl`, then verifies the public HTTPS page matches the new build. It displays an overall file-count progress bar and a live transfer bar for each file. Credentials are supplied over stdin, not command-line arguments. Assets upload before `index.html`, and the service worker uploads last. It does not delete remote files; older hashed assets remain available to open tabs. Uploads are not atomic across the whole site; rerun after a failed deployment. Host caching should revalidate `index.html` and `sw.js`; hashed assets can be cached long-term.

Set **Supabase → Authentication → URL Configuration → Site URL** to `https://kiki.wisener.me`. Then sign in, install on both phones and enable notifications. If upload succeeds but HTTPS verification fails, check DNS, the certificate, the document root and hosting cache.

## Alternative: Cloudflare Pages

Connect this GitHub repository to a Cloudflare Pages project, or deploy the built `dist` directory through Wrangler after signing in to Cloudflare.

- Build command: `npm run build`
- Output directory: `dist`
- Node.js version: `24`
- Frontend variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`

```sh
npm run build
npx wrangler pages deploy dist --project-name kiki
```

Use the HTTPS deployment URL on both phones. Set it as the Supabase Auth Site URL. Do not share a localhost URL: it only works on the development computer. The public app shell requires login before accessing any real chat data. Hosting does not provide or bypass Supabase authentication.

## Install on your phones

- **iPhone:** iOS 16.4 or newer. Open the HTTPS site in Safari, use **Share → Add to Home Screen**, then launch the installed app. Sign in, open settings, and tap **Enable notifications**. [Apple requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- **Android:** open the HTTPS site in Chrome, choose **Install app** from the browser menu, sign in, and enable notifications in Kiki settings.

Notification permission must follow a button tap. If it was denied, allow it in the phone's settings. Focus modes, battery restrictions, connectivity, and OS behavior can delay or suppress alerts. Signing out removes this device's subscription and saved drafts. The service worker caches the app shell/assets only; private API responses and chat history are never cached. Offline history browsing is not included.

## Checks and limits

```sh
npm test
npm run test:backend
npm run build
npx --yes --package=deno deno check supabase/functions/process-message/index.ts supabase/functions/save-subscription/index.ts supabase/functions/upload-image/index.ts
```

For the browser dictation self-check, run `npm run dev` and open `http://127.0.0.1:5173/tests/dictation-browser.html`. It should report **ALL CHECKS PASSED**. Also open that URL with `?unsupported` to check the typing fallback. These checks use synthetic recognition events with the real component and library, without microphone access or service requests.

The image-message UI self-check is at `http://127.0.0.1:5173/tests/images-browser.html` while the dev server runs. It uses the real app with synthetic files and mocked Supabase to test preview/cancel, optional captions, failures, retries, and sign-out without sending a live chat message.

Tests exercise real PostgreSQL permissions with PGlite, translation leases, rate limits, duplicates, push endpoint validation, message merging, word/phrase alignment, dictation draft preservation and mocked browser recognition, image validation and imgbb failures, and PWA assets. They do not use or modify the live chat. Test dictation, translation, and closed-app notifications on both actual phones before relying on them.

Chat history stores text, including reviewed dictation and image captions, plus imgbb image URLs. Messages are processed by Supabase and Azure Translator and are not end-to-end encrypted. Dictation audio is handled by the browser’s speech service. Standard translation may miss tone or slang. The Supabase Free project may pause during low activity and does not include automatic backups; export important history periodically. No translation key, app accounts, or hosting account is provisioned automatically.
