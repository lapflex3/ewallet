# Ewallet Crypto + AI Trading (HTML5 + Node.js + Auto Deploy)

Aplikasi ini sudah sesuai untuk:
- Web app HTML5 responsive (desktop + mobile)
- Deploy ke server Node.js
- Auto deploy dari GitHub ke hosting percuma (Render)
- Domain percuma (subdomain `*.onrender.com`)

## Ciri utama

- Ewallet crypto + exchange MYR
- Trading + AI trading access control
- Admin penuh (kawal users, wallet, subscription, settings)
- PWA-ready (`manifest.webmanifest`, `service worker`)

## Admin bootstrap

Semasa server start, sistem auto cipta admin jika belum ada.

Default:
- `admin@ewallet.local`
- `Admin@123456`

Ubah melalui env:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

## Run local

```bash
npm install
npm start
```

URL local:
- `http://127.0.0.1:3000`

## Build HTML5 portable

```bash
npm run build:webapp
```

Output:
- `dist/html5-portable`

## Deploy Node.js ke hosting percuma (Render)

Fail `render.yaml` sudah disediakan untuk auto deploy dari GitHub.

### Aliran auto deploy

1. Push repo ke GitHub.
2. Di Render: `New +` -> `Blueprint` -> pilih repo ini.
3. Render baca `render.yaml` dan auto create service.
4. Domain percuma automatik akan diberi, contoh:
   - `https://ewallet-crypto-ai.onrender.com`
5. Set env penting di Render dashboard:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`

Setiap `git push` ke branch utama akan auto redeploy.

## EXE / Linux / APK

- Windows EXE:
  - `npm run build:exe`
- Linux portable:
  - `npm run build:linux`
- Android APK:
  - `npm run android:init`
  - `npm run build:apk`

Nota:
- APK perlukan Java + Android SDK (`JAVA_HOME` sah).
- Build EXE/Linux perlukan internet untuk download Electron binaries.

## File penting deploy

- `render.yaml`
- `src/server.js`
- `public/index.html`
- `public/manifest.webmanifest`
- `public/sw.js`
