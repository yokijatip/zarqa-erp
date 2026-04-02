# Firebase Hosting Deploy

Repo ini sudah disiapkan untuk deploy sebagai SPA static ke Firebase Hosting.

## 1. Pastikan branch production aktif

```powershell
git switch production
```

## 2. Isi environment production

Buat file `.env` atau environment variables di mesin deploy:

```env
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
```

Nilainya ambil dari Firebase Console:
`Project settings` -> `Your apps` -> Web app config.

## 3. Login Firebase CLI

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
```

Saat `firebase use --add`, pilih project Firebase yang benar lalu beri alias, misalnya `production`.

## 4. Build production

```powershell
npm install
npm run build:production
```

Output static akan dibuat di folder `build/`.

## 5. Deploy hosting

```powershell
firebase deploy --only hosting
```

Atau gunakan script:

```powershell
npm run deploy:hosting
```

## Catatan

- App ini sekarang dikonfigurasi sebagai SPA static dengan fallback `index.html`.
- Semua route dashboard seperti `/order-produksi/abc` akan tetap bisa dibuka langsung.
- Jangan gunakan `npm run dev` untuk production.
- Pastikan Firebase Auth authorized domains berisi domain hosting Anda.
