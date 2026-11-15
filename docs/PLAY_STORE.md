# Publishing Recall Studio on Google Play

The Android app is a **Trusted Web Activity (TWA)**: a thin Android wrapper that opens your live Render site full-screen, with no browser bar. It is the same code as the website, so a website update reaches installed users without a new Play release. The app needs the internet to generate study sets (the Gemini key lives on your server); the shell, your saved library and flashcards open offline.

What is already done in this repo:

- `public/manifest.webmanifest`, icons (`public/icons/`), `public/sw.js` (offline app shell, never caches `/api`)
- `public/.well-known/assetlinks.json` (placeholder `[]` you fill in below)
- Store graphics in `store-assets/`: `play-icon-512.png`, `feature-graphic-1024x500.png` (regenerate with `node scripts/make-icons.mjs`)

What only you can do (accounts, payment, signing keys, legal declarations): everything below.

## 0. Before you start

1. **Use a stable HTTPS URL.** The live Render URL works, but a Render free-plan service sleeps when idle and the first open can take about a minute. For a store app, use a paid always-on instance and ideally your own domain.
2. **Google Play developer account**: one-time US$25 fee at <https://play.google.com/console/signup>, plus identity verification. A *personal* account created after Nov 2023 must run a **closed test with at least 12 testers for 14 continuous days** before it can publish to production. An *organization* account is exempt.
3. **A privacy policy at a public URL** (required, because the app handles user content). It must say, truthfully: notes, uploaded files and photos you submit are sent to the server and to Google's Gemini API to generate study material; they are not stored on the server; your saved sets stay in the device's local storage; there are no accounts. Host it as a page on your site or a GitHub Pages page.
4. Pick an **application ID** (package name), e.g. `com.yourname.recallstudio`. It is permanent once uploaded and must be globally unique.

## 1. Build the Android bundle (no Android Studio needed)

1. Open <https://www.pwabuilder.com>, enter your live HTTPS URL, and click **Start**. It should report a valid manifest and service worker.
2. Click **Package for stores → Android → Generate package**.
3. Set: **Package ID** = your application ID, **App name** = Recall Studio, **Display** = Standalone, **Signing key** = *Create new* (or *Use mine*). Enable **Play App Signing** if offered.
4. Download the zip. It contains the `.aab` (upload to Play), a **signing key + passwords** (back these up somewhere safe; losing them means you cannot update an app you sign yourself), and an `assetlinks.json` snippet.

## 2. Link the app to your site (removes the browser bar)

A TWA only goes full-screen if your site proves it trusts the app, via Digital Asset Links.

1. Get the **SHA-256 fingerprint**. If you use Play App Signing (the default), copy it from Play Console → your app → **Test and release → App integrity → App signing key certificate**. (If you sign it yourself, use the fingerprint PWABuilder gives you.)
2. Replace the contents of `public/.well-known/assetlinks.json` with:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.yourname.recallstudio",
      "sha256_cert_fingerprints": ["AA:BB:...:ZZ"]
    }
  }
]
```

3. Commit, push, let Render redeploy, then open `https://YOUR-DOMAIN/.well-known/assetlinks.json` and confirm it shows that JSON (not a web page). If the bar still shows, the fingerprint or package name does not match exactly.

## 3. Create the listing in Play Console

1. **Create app**: name *Recall Studio*, default language, *App*, *Free*.
2. **Store listing**: short description (80 chars), full description, **App icon** `store-assets/play-icon-512.png`, **Feature graphic** `store-assets/feature-graphic-1024x500.png`, and **at least 2 phone screenshots** (take them from the installed app or reuse `docs/screenshots/`, re-captured at a phone aspect ratio such as 1080×1920).
3. **App content**: privacy policy URL, ads = No, app access = all functionality available without login, target audience (pick an age band; if it includes children, extra rules apply, so avoid that), content rating questionnaire, **Data safety** form (declare that user-provided content is sent off-device to generate results and is not stored; no account data), and the news/government/health declarations as *No*.
4. **Testing → Closed testing**: create a track, upload the `.aab`, add testers (12+ for personal accounts), roll out, and keep it running 14 days.
5. After the closed test (or immediately for organization accounts): **Production → Create release**, upload the `.aab`, submit for review. Review usually takes from a few hours to a few days.

## 4. Updating later

- Website changes (almost everything): push to GitHub. Render redeploys, and installed apps pick it up on next open. Bump `VERSION` in `public/sw.js` only if you change the caching rules.
- Android wrapper changes (name, icon, package settings): regenerate in PWABuilder with the **same signing key**, increment the version code, upload a new release.

## Things to know

- **Cost exposure:** anyone who installs the app uses your Gemini quota. The server limits each IP to 10 generations per minute, which is a cost guard, not real protection. Before wide release, consider a spend cap on your Google AI Studio project.
- **Data lives on the device:** uninstalling the app, or clearing its storage, deletes the library. The Settings → Export backup button is the safety net.
- **`.doc` and large scans** are less certain with Gemini (see README limitations).
- iOS is not covered. An installable web app works on iPhone via Safari → Share → Add to Home Screen, with no App Store needed.
