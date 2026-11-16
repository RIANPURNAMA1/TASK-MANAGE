# NexusTask

Platform task management & kolaborasi multi-divisi (lihat [PRD.md](PRD.md) dan [DESIGN.md](DESIGN.md)).
Repo ini berisi implementasi **fase MVP**: auth, struktur organisasi, board kanban real-time,
notifikasi, file, activity log, dan halaman admin.

## Arsitektur

Modular monolith dalam monorepo pnpm + Turborepo:

```
apps/
  api/        Express 5 + Prisma + Socket.IO — REST /api/v1 dan real-time
  worker/     BullMQ — email, reminder H-1/overdue, digest harian, retensi data
  web/        Vite + React + TanStack Query + Zustand + Tailwind (SPA, dipakai web dan desktop)
  desktop/    Tauri v2 — membungkus SPA yang sama + integrasi OS (lihat "Desktop app")
packages/
  shared/     Kontrak bersama: skema zod, tipe DTO, event Socket.IO, enum, fractional index
  db/         Skema Prisma (MySQL), client, mapper DTO & penulis notifikasi untuk backend
  jobs/       Logika job (email, reminder, digest, retensi) — dipakai worker maupun API mode standalone
  api-client/ SDK REST bertipe — UI tidak pernah menulis URL mentah
  platform/   Lapisan integrasi OS (notifikasi, badge, keychain, deep link, updater) — web & Tauri
```

Prinsip penting:

- **Otorisasi terpusat** — `apps/api/src/modules/access`. Aturan berupa fungsi murni
  (`policy.ts`, diuji exhaustif); `requireProject/requireCard/...` dipanggil setiap endpoint dan
  setiap join room Socket.IO. Resource yang tidak boleh dilihat menghasilkan 404 (tidak membocorkan keberadaan).
- **Activity log di transaksi yang sama** dengan perubahan data; **event real-time dikirim setelah commit**
  (`lib/transaction.ts` → `afterCommit`). Tab asal dikecualikan lewat header `x-socket-id`.
- **Fractional indexing** untuk urutan kolom/kartu/checklist: memindah satu kartu hanya menulis satu baris.
  Server menghitung posisi dari tetangga (`prevId`/`nextId`), bukan percaya posisi dari client.
- **Token**: access JWT 15 menit di memori; refresh token berotasi di cookie httpOnly dengan
  reuse detection (+ grace window 20 detik untuk dua tab yang refresh bersamaan).
- **File** diunggah langsung ke storage via presigned URL 5 menit; storage tidak publik.

## Menjalankan secara lokal (tanpa Docker)

Prasyarat: **Node ≥ 20**, **pnpm 9** (`npm i -g pnpm@9`), dan **MySQL 8 / MariaDB 10.4+** yang
sedang berjalan — misalnya MySQL bawaan XAMPP atau Laragon. Tidak perlu Docker, Redis, atau SMTP.

`.env.example` memakai `mysql://root:@localhost:3306/nexustask` (default XAMPP: user `root` tanpa
password). Database `nexustask` dibuat otomatis oleh migrasi; ubah `DATABASE_URL` jika kredensial berbeda.

```bash
pnpm install
cp .env.example .env    # default-nya sudah siap pakai untuk lokal
pnpm dev                # terapkan migrasi, lalu API :4000 + web :5173
pnpm db:seed            # (opsional, di terminal lain) data demo — password semua akun: password123
```

Buka http://localhost:5173. Tanpa seed, aplikasi menampilkan halaman **setup awal** untuk membuat
organisasi dan akun Owner. Akun seed: `owner@`, `admin@`, `lead@`, `ayu@`, `bima@`, `citra@`,
`guest@nexus.local`.

Yang terjadi di mode lokal:

| Komponen | Lokal (default) | Produksi |
| --- | --- | --- |
| Database | MySQL/MariaDB lokal (XAMPP/Laragon) | MySQL 8 server |
| Job (email, reminder, digest) | Berjalan di dalam proses API | `REDIS_URL` diisi → BullMQ + `apps/worker` |
| Real-time | Socket.IO in-memory (1 instance) | Socket.IO + Redis adapter (multi-instance) |
| File | `STORAGE_DRIVER=local`, disk `.data/uploads`, URL bertanda tangan HMAC 5 menit | `STORAGE_DRIVER=s3` (Cloudflare R2) |
| Email | Dicetak di terminal API (link verifikasi/undangan/reset bisa diklik) | SMTP (`SMTP_HOST`) |

Login Google aktif bila `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `GOOGLE_REDIRECT_URI` diisi.
Google hanya bisa dipakai oleh user yang sudah punya akun (lewat undangan).

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | Jalankan semua app dalam mode watch |
| `pnpm typecheck` | Typecheck seluruh workspace |
| `pnpm test` | Unit & HTTP test (shared, api) |
| `pnpm build` | Build produksi (tsup untuk api/worker, Vite untuk web) |
| `pnpm db:migrate` / `db:deploy` | Buat migrasi baru (dev) / terapkan migrasi (produksi) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm desktop:dev` | Desktop app (Tauri) dengan hot reload — jalankan `pnpm dev` dulu |
| `pnpm desktop:build` | Installer desktop untuk OS saat ini (`apps/desktop/src-tauri/target/release/bundle`) |

## Desktop app (Tauri v2)

`apps/desktop` membungkus SPA `apps/web` yang sama; fitur bisnis identik dengan web. Semua
integrasi OS lewat `@nexus/platform` (`desktop.ts`), komponen UI tidak memanggil API Tauri langsung.

| Kebutuhan PRD §4 | Implementasi |
| --- | --- |
| Refresh token di OS keychain | Command Rust `secret_*` (crate `keyring`: Credential Manager / Keychain / Secret Service). API mengirim token di body hanya untuk klien desktop (header `x-desktop-device`), tidak memakai cookie |
| Login Google | Browser sistem → API → `taskapp://auth/callback?code=…` → app menukar kode sekali-pakai (2 menit, terikat PKCE) di `POST /auth/google/desktop-exchange` |
| Notifikasi saat app ditutup | Tombol tutup menyembunyikan jendela ke system tray; notifikasi native lewat plugin notification |
| Badge | Badge dock/launcher (macOS/Linux), judul jendela di taskbar (Windows), tooltip tray |
| Deep link | `taskapp://card/<id>`, `taskapp://announcements/<id>`; single instance memfokuskan jendela yang sudah terbuka |
| Update | Plugin updater, paket ditandatangani (minisign) dan ditolak bila tanda tangan salah; `minDesktopVersion` dari API memblokir versi lama |
| Auto-start | Opsional di Pengaturan → Aplikasi (berjalan di tray saat login OS) |
| Keamanan | CSP ketat (`script-src 'self'`, font di-bundle, tanpa URL remote di webview), capability minimal |

**Pengembangan:** `pnpm dev` lalu `pnpm desktop:dev`. Mode dev memuat `http://localhost:5173`.
Prasyarat: Rust stable; di Windows Visual Studio Build Tools (C++) dan WebView2;
di Linux `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev`.

**Build lokal:** `pnpm desktop:build`. SPA di-build dengan `--mode desktop` sehingga memakai URL
API absolut (`VITE_API_URL`, default `http://localhost:4000/api/v1`). Karena `createUpdaterArtifacts`
aktif, set dulu kunci updater:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/nexustask-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
VITE_API_URL=https://api.contoh.com/api/v1 pnpm desktop:build
```

**Rilis:** push tag `desktop-vX.Y.Z` → workflow `desktop-release.yml` membangun Windows, macOS
(universal) dan Linux lalu membuat draft GitHub Release berisi installer + `latest.json` untuk updater.
Sebelum rilis pertama:

1. Ganti `OWNER/REPO` di `apps/desktop/src-tauri/tauri.conf.json` (`plugins.updater.endpoints`).
2. Secrets repo: `TAURI_SIGNING_PRIVATE_KEY` (isi file kunci privat), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
   variable repo `DESKTOP_API_URL`. Kunci publik pasangannya sudah ada di `tauri.conf.json` —
   jika kunci privat hilang, user lama tidak bisa menerima update lagi, jadi simpan cadangannya.
3. Persempit CSP `connect-src`/`img-src` ke domain API & storage produksi.
4. Code signing Windows dan Apple Developer ID + notarization (PRD §9) — secrets `APPLE_*` sudah
   disiapkan di workflow.
5. Naikkan `version` di `tauri.conf.json`; set `MIN_DESKTOP_VERSION` di API bila versi lama harus dipaksa update.

Origin webview Tauri (`tauri://localhost`, `http(s)://tauri.localhost`) selalu diizinkan CORS oleh API.

## Cakupan

**Sudah (MVP):** FR-01, FR-02 (web), FR-03 – FR-15, FR-21 – FR-24, FR-27 – FR-29, FR-47, FR-48.

**Sudah (Fase 2 — Chat Tim):** FR-31 – FR-34. Chat per project (mention, reaksi, lampiran, reply)
mengikuti hak akses project: yang bisa melihat project bisa membaca, yang bisa mengedit bisa
mengirim. Chat pribadi 1-on-1 (guest hanya dengan rekan satu project; lampiran hanya di chat
project). Indikator online, sedang mengetik, dan status dibaca. Edit/hapus pesan sendiri; Project
Admin bisa menghapus pesan orang lain di chat project-nya. Pengiriman idempoten lewat
`clientMessageId` sehingga pesan tidak dobel saat koneksi putus dan dikirim ulang.
Pengaturan mute per project: notifikasi komentar & tenggat dibisukan, sedangkan assign dan mention
tetap dikirim karena ditujukan langsung ke orangnya.

**Sudah (Fase 2):** pengumuman (FR-35, FR-36), dashboard per role (FR-43 – FR-45), desktop app
Tauri untuk Windows/macOS/Linux dengan auto-update.

**Belum (sesuai roadmap):** dokumen, jadwal, check-in, pencarian global, Web Push (F2/F3). Menu terkait sudah ada di UI dalam keadaan nonaktif ("Segera hadir").

Catatan keputusan:

- Database **MySQL 8** (sesuai tabel tech stack PRD; diuji juga di MariaDB 10.4). Bagian PRD yang
  menyebut fitur khas PostgreSQL perlu padanan MySQL saat dikerjakan: pencarian F2 memakai
  `FULLTEXT` index (bukan `tsvector`), custom field F3 memakai kolom `JSON` (bukan `JSONB`), dan
  backup memakai binlog + dump harian (bukan WAL archiving).
- Kolom `position` (fractional index) memakai collation `utf8mb4_bin` agar urutan byte-wise;
  collation default MySQL tidak membedakan huruf besar/kecil dan akan mengacaukan urutan.
- Penghapusan fisik file yang di-soft-delete dari object storage (retensi 30 hari) belum dibuat;
  job `cleanup` di worker baru menangani token, sesi, upload yang tidak selesai, dan retensi log.
- Test otorisasi saat ini berupa unit test kebijakan + HTTP test tanpa database. Integration test
  RBAC per endpoint terhadap database sungguhan adalah langkah berikutnya untuk memenuhi gate MVP.
