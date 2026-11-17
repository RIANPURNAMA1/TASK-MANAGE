# Deployment Mendunia Workbase di VPS (tanpa Docker)

Panduan lengkap men-deploy **Mendunia Workbase** ke satu VPS Linux dengan **Nginx + Node.js + MySQL**,
tanpa Docker. Contoh domain yang dipakai: **`https://workbase.mendunia.id`**.

Hasil akhir:

```
Internet ──HTTPS──> Nginx (workbase.mendunia.id)
                     ├── /            → file statis  /srv/workbase/app/apps/web/dist
                     ├── /api/...     → proxy        http://127.0.0.1:4000  (Express API)
                     ├── /socket.io/  → proxy WS     http://127.0.0.1:4000  (Socket.IO)
                     └── /health      → proxy        http://127.0.0.1:4000
                                          │
                                          ├── MySQL 8 (localhost:3306)
                                          └── File upload: /srv/workbase/shared/uploads (disk lokal)
```

Tanpa Redis, job (email, reminder, digest) berjalan **di dalam proses API** dan real-time memakai
memori. Itu cukup untuk **satu instance API** — dan panduan ini memang untuk satu VPS.
Redis + worker hanya diperlukan jika nanti mau scale ke beberapa instance (lihat [Lampiran A](#lampiran-a-opsional-redis--worker-bullmq)).

---

## Daftar isi

1. [Prasyarat](#1-prasyarat)
2. [Pemasangan paket sistem](#2-pemasangan-paket-sistem)
3. [Siapkan MySQL](#3-siapkan-mysql)
4. [Buat user & direktori aplikasi](#4-buat-user--direktori-aplikasi)
5. [Clone repo & buat `.env` produksi](#5-clone-repo--buat-env-produksi)
6. [Install dependency & build](#6-install-dependency--build)
7. [Jalankan API sebagai service systemd](#7-jalankan-api-sebagai-service-systemd)
8. [Konfigurasi Nginx](#8-konfigurasi-nginx)
9. [Pasang HTTPS (Let's Encrypt)](#9-pasang-https-lets-encrypt)
10. [Aktivasi pertama](#10-aktivasi-pertama)
11. [Checklist verifikasi](#11-checklist-verifikasi)
12. [Deploy ulang (update aplikasi)](#12-deploy-ulang-update-aplikasi)
13. [Backup & restore](#13-backup--restore)
14. [Troubleshooting](#14-troubleshooting)
15. [Checklist keamanan](#15-checklist-keamanan)
16. [Lampiran A: opsional Redis + worker BullMQ](#lampiran-a-opsional-redis--worker-bullmq)
17. [Lampiran B: opsional object storage S3 / Cloudflare R2](#lampiran-b-opsional-object-storage-s3--cloudflare-r2)
18. [Ringkasan perintah](#ringkasan-perintah)

---

## 1. Prasyarat

| Kebutuhan | Rekomendasi minimum |
| --- | --- |
| OS | Ubuntu 22.04 / 24.04 LTS (Debian 12 juga bisa) |
| CPU / RAM | 2 vCPU / **2 GB RAM** (build Vite butuh ~1,5 GB; kalau RAM 1 GB, tambahkan swap) |
| Disk | 20 GB (aplikasi + upload + backup) |
| Node.js | **Node 22 LTS** (minimal 20.11, lihat `engines` di `package.json`) |
| Database | MySQL 8 (MariaDB 10.4+ juga didukung) |
| Domain | `workbase.mendunia.id` |
| Akses | root / sudo, port 80 & 443 terbuka |

### 1.1 Arahkan domain ke VPS

Di pengelola DNS (Cloudflare, Namecheap, dll) buat:

```
Type  Name       Value            TTL
A     workbase   <IP_PUBLIK_VPS>  Auto
```

Cek dari VPS:

```bash
sudo apt install -y dnsutils
dig +short workbase.mendunia.id
# harus keluar IP VPS
```

> **Kalau pakai Cloudflare:** awalnya set **DNS only** (awan abu-abu) supaya penerbitan sertifikat
> Let's Encrypt lancar. Setelah HTTPS aktif, proxy boleh dinyalakan dengan mode SSL **Full (strict)**.
> Catatan penting jika proxy aktif: API memakai `trust proxy = 1` dan rate limit per IP, sehingga
> semua user akan terlihat berasal dari IP Cloudflare. Kalau butuh rate limit per user, pasang
> `ngx_http_realip_module` + daftar IP Cloudflare, atau biarkan DNS only.

### 1.2 Swap (wajib kalau RAM ≤ 1 GB)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 1.3 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

**Jangan** buka port 4000 (API) dan 3306 (MySQL) ke publik — keduanya hanya diakses dari localhost.

---

## 2. Pemasangan paket sistem

```bash
sudo apt update && sudo apt upgrade -y

sudo apt install -y curl ca-certificates gnupg git nginx mysql-server ufw openssl

# Node.js 22 LTS dari NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v   # v22.x
npm -v
```

Tidak perlu `build-essential`: dependency native (`@node-rs/argon2`, Prisma engine) sudah tersedia
sebagai binary untuk glibc/Ubuntu.

Opsional, samakan zona waktu server:

```bash
sudo timedatectl set-timezone Asia/Jakarta
timedatectl
```

---

## 3. Siapkan MySQL

```bash
sudo mysql
```

Di prompt MySQL (ganti password! gunakan **huruf + angka** agar aman dipakai di URL):

```sql
CREATE DATABASE workbase
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;   -- MariaDB: utf8mb4_unicode_ci

CREATE USER 'workbase'@'localhost' IDENTIFIED BY 'PASSWORD_DB_KUAT_2026';
GRANT ALL PRIVILEGES ON workbase.* TO 'workbase'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Tes koneksi:

```bash
mysql -u workbase -p -e "SELECT VERSION();" workbase
```

Catatan:

- Database **tidak perlu** dibuat manual sebenarnya — migrasi membuat tabel, bukan database. Jadi
  langkah di atas tetap perlu.
- Pastikan MySQL hanya listen di localhost:
  ```bash
  sudo ss -lntp | grep 3306     # harus 127.0.0.1:3306, bukan 0.0.0.0:3306
  ```
- Kolom urutan (`position`) memakai collation `utf8mb4_bin` yang di-set oleh migrasi, jadi collation
  default database tidak memengaruhi urutan kartu/kolom.

---

## 4. Buat user & direktori aplikasi

Aplikasi dijalankan sebagai user non-root `workbase`.

```bash
sudo adduser --system --group --home /srv/workbase --shell /bin/bash workbase
sudo install -d -o workbase -g workbase -m 755 /srv/workbase
sudo install -d -o workbase -g workbase -m 750 /srv/workbase/shared
sudo install -d -o workbase -g workbase -m 750 /srv/workbase/shared/uploads
sudo install -d -o workbase -g workbase -m 750 /srv/workbase/shared/backups
```

Struktur akhir:

```
/srv/workbase/
├── app/                      # hasil git clone (kode + node_modules + dist)
├── shared/
│   ├── uploads/              # file & avatar (JANGAN dihapus)
│   └── backups/              # dump MySQL + arsip upload
```

---

## 5. Clone repo & buat `.env` produksi

```bash
sudo -iu workbase
cd /srv/workbase
git clone <URL_REPO_ANDA> app
cd app
cp .env.example .env
chmod 600 .env
```

> Butuh akses repo: pakai **deploy key** (`ssh-keygen -t ed25519` lalu tambahkan public key ke
> GitHub/GitLab) atau personal access token. Alternatif tanpa git: upload dari lokal dengan
> `rsync -av --exclude node_modules --exclude .env ./ user@vps:/srv/workbase/app/`.

### 5.1 Generate secret

```bash
openssl rand -base64 48   # → JWT_ACCESS_SECRET
openssl rand -base64 48   # → COOKIE_SECRET
openssl rand -hex 32      # → AGENT_ENCRYPTION_KEY (untuk enkripsi API key LLM dari UI)
```

Simpan hasilnya di password manager. **Jangan pernah commit `.env`.**

### 5.2 Isi `.env`

Edit `nano /srv/workbase/app/.env`:

```dotenv
NODE_ENV=production

# ── Database ────────────────────────────────────────────────────────────────
DATABASE_URL="mysql://workbase:PASSWORD_DB_KUAT_2026@localhost:3306/workbase"

# ── Web / API ───────────────────────────────────────────────────────────────
WEB_URL=https://workbase.mendunia.id
API_PORT=4000
JWT_ACCESS_SECRET=<hasil-openssl-1>
COOKIE_SECRET=<hasil-openssl-2>
CORS_ORIGINS=https://workbase.mendunia.id
MIN_DESKTOP_VERSION=0.0.0

# ── Redis (kosong = job in-process, satu instance) ──────────────────────────
REDIS_URL=

# ── File upload ─────────────────────────────────────────────────────────────
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/srv/workbase/shared/uploads

# ── Email (sangat disarankan di produksi) ───────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=no-reply@mendunia.id
SMTP_PASSWORD=<app-password-smtp>
MAIL_FROM="Mendunia Workbase <no-reply@mendunia.id>"

# ── Google SSO (opsional, kosongkan kalau tidak dipakai) ────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://workbase.mendunia.id/api/v1/auth/google/callback

# ── Job terjadwal ───────────────────────────────────────────────────────────
TZ_DEFAULT=Asia/Jakarta
DAILY_DIGEST_HOUR=8

# ── Workbase Agent (asisten AI) ─────────────────────────────────────────────
AGENT_ENABLED=true
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
AGENT_SEARCH_PROVIDER=
BRAVE_API_KEY=
TAVILY_API_KEY=
AGENT_ENCRYPTION_KEY=<hasil-openssl-3>
AGENT_PRICING_JSON=
AGENT_MAX_RUN_COST_USD=0.5
AGENT_MAX_STEPS=12
```

Poin penting:

| Variabel | Kenapa penting |
| --- | --- |
| `NODE_ENV=production` | Cookie refresh jadi `Secure` (hanya dikirim lewat HTTPS) dan rate limit/logger produksi aktif. **Wajib** di server. |
| `WEB_URL` | Dipakai di link email (verifikasi, undangan, reset password) dan redirect OAuth. Harus persis `https://workbase.mendunia.id` tanpa trailing slash. |
| `CORS_ORIGINS` | Origin yang diizinkan. Samakan dengan `WEB_URL`. Origin desktop (`tauri://localhost`) sudah otomatis diizinkan. |
| `JWT_ACCESS_SECRET`, `COOKIE_SECRET` | Minimal 32 karakter. Kalau diganti, semua sesi user logout. |
| `AGENT_ENCRYPTION_KEY` | Mengenkripsi API key LLM yang disimpan dari UI. **Kalau diganti/dihapus, key yang sudah tersimpan tidak bisa didekripsi** dan harus diisi ulang di Setting → Asisten AI. Kalau kosong, aplikasi menurunkan key dari `JWT_ACCESS_SECRET` — jadi mengganti JWT secret juga membuat key agent harus diisi ulang. |
| `STORAGE_LOCAL_DIR` | **Set eksplisit.** Default-nya dihitung dari lokasi file build dan bisa salah di hasil bundle. |
| `SMTP_HOST` | Kalau kosong, email tidak dikirim — hanya dicetak ke log API (`journalctl`). Link verifikasi/undangan tetap bisa diambil manual dari log. |

`API_PORT=4000` boleh dibiarkan; jangan lupa `NODE_ENV` hanya disimpan di `.env` (jangan
`export NODE_ENV=production` di shell sebelum `npm ci`, karena npm akan melewati devDependencies
yang dibutuhkan untuk build).

---

## 6. Install dependency & build

Masih sebagai `workbase`:

```bash
cd /srv/workbase/app

# --include=dev WAJIB: build butuh tsup, vite, prisma CLI, turbo
npm ci --include=dev

# Build api (tsup), worker (tsup), dan web (vite). Desktop tidak ikut (tidak punya script build).
npm run build

# Terapkan semua migrasi database
npm run db:deploy
```

Yang dihasilkan:

```
apps/api/dist/server.js       → API
apps/worker/dist/main.js      → worker (hanya dipakai kalau pakai Redis)
apps/web/dist/                → file statis untuk Nginx
```

`npm ci` menjalankan `prisma generate` otomatis (postinstall di `packages/db`).

> **Jangan** jalankan `npm run db:seed` di produksi. Seed membuat organisasi demo + 7 akun dengan
> password `password123`. Untuk produksi, gunakan wizard **setup awal** (langkah 10). Seed aman
> untuk staging (otomatis berhenti kalau database sudah punya organisasi).

Kembali ke root:

```bash
exit        # keluar dari shell user workbase
```

---

## 7. Jalankan API sebagai service systemd

Buat file `/etc/systemd/system/workbase-api.service`:

```bash
sudo nano /etc/systemd/system/workbase-api.service
```

```ini
[Unit]
Description=Mendunia Workbase API
Documentation=https://workbase.mendunia.id
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=workbase
Group=workbase
WorkingDirectory=/srv/workbase/app/apps/api
# Semua konfigurasi dibaca dari sini (bukan dari dotenv di dalam bundle)
EnvironmentFile=/srv/workbase/app/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM
SyslogIdentifier=workbase-api

# Hardening
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
ReadWritePaths=/srv/workbase/shared/uploads /srv/workbase/shared/backups
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

> `ReadWritePaths` hanya boleh berisi direktori yang **sudah ada**; kalau tidak ada, service gagal
> start. Kalau nanti pindah ke S3 (`STORAGE_DRIVER=s3`), baris uploads boleh dihapus.

Aktifkan:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now workbase-api
sudo systemctl status workbase-api --no-pager
curl -s http://127.0.0.1:4000/health
# {"status":"ok","database":"up","redis":"disabled"}
```

Lihat log real-time:

```bash
sudo journalctl -u workbase-api -f
```

**Jangan** jalankan lebih dari satu instance API tanpa Redis: Socket.IO memakai memori proses,
job berjalan in-process, dan penjadwal agent (`startScheduleTicker`) tidak punya lock antar-proses.

---

## 8. Konfigurasi Nginx

Hapus site default supaya tidak bentrok:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nano /etc/nginx/sites-available/workbase.mendunia.id
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name workbase.mendunia.id;

    root /srv/workbase/app/apps/web/dist;
    index index.html;
    charset utf-8;
    server_tokens off;

    # File maksimal 100 MB (MAX_UPLOAD_BYTES) + overhead
    client_max_body_size 110m;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml;

    # ── API ────────────────────────────────────────────────────────────────
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # Upload/download file besar: jangan buffer 100 MB ke disk Nginx
    location /api/v1/storage/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 110m;
    }

    # ── Socket.IO (WebSocket) ──────────────────────────────────────────────
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # ── Health check (untuk uptime monitor) ────────────────────────────────
    location = /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
        access_log off;
    }

    # ── Aset Vite ber-hash: cache 1 tahun ──────────────────────────────────
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Jangan sajikan sourcemap produksi (build web menghasilkan .map)
    location ~* \.map$ {
        return 404;
    }

    # ── SPA fallback ───────────────────────────────────────────────────────
    location = /index.html {
        add_header Cache-Control "no-store";
    }

    location / {
        try_files $uri /index.html;
    }
}
```

Aktifkan dan tes:

```bash
sudo ln -s /etc/nginx/sites-available/workbase.mendunia.id /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Kalau muncul `403 Forbidden` pada aset, pastikan Nginx bisa membaca file build:

```bash
sudo chmod -R a+rX /srv/workbase/app/apps/web/dist
namei -l /srv/workbase/app/apps/web/dist/index.html
```

Tes HTTP sebelum HTTPS:

```bash
curl -I http://workbase.mendunia.id/
curl -s http://workbase.mendunia.id/health
curl -s http://workbase.mendunia.id/api/v1/meta | head -c 200
```

Nilai `CORS_ORIGINS`/`WEB_URL` sudah `https://...`, jadi login **belum** akan bekerja lewat HTTP —
lanjut ke langkah 9.

---

## 9. Pasang HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d workbase.mendunia.id --redirect \
  -m admin@mendunia.id --agree-tos --no-eff-email
```

Certbot menambahkan blok `listen 443 ssl`, sertifikat, dan redirect HTTP → HTTPS. Perpanjangan
otomatis sudah dijadwalkan oleh `certbot.timer`; tes:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

Cek:

```bash
curl -I https://workbase.mendunia.id/
curl -s https://workbase.mendunia.id/health
```

`NODE_ENV=production` membuat cookie refresh `Secure` + `SameSite=Strict` pada path
`/api/v1/auth`, jadi **aplikasi hanya bisa dipakai lewat HTTPS**. Membuka lewat IP atau HTTP akan
membuat login gagal (cookie ditolak browser).

---

## 10. Aktivasi pertama

1. Buka `https://workbase.mendunia.id` → aplikasi menampilkan halaman **setup awal**.
2. Isi nama organisasi, nama, email, dan password **Owner** pertama.
3. Setelah masuk:
   - **Pengaturan → Asisten AI** → tambahkan API key penyedia LLM (Anthropic/OpenAI/Gemini/Groq)
     beserta model default. Key disimpan terenkripsi di database dan langsung aktif.
   - **Admin organisasi** → buat divisi, undang anggota.
   - **Divisi & Proyek** → buat project pertama.
4. Kalau database sudah berisi data lama (restore dari server lain), lewati langkah setup dan
   langsung login dengan akun yang ada.

---

## 11. Checklist verifikasi

| # | Yang dicek | Cara |
| --- | --- | --- |
| 1 | Health API | `curl -s https://workbase.mendunia.id/health` → `status: ok` |
| 2 | SPA & deep link | Buka `/settings`, `/projects` lalu **refresh** (F5) — tidak boleh 404 |
| 3 | Login & sesi | Login, refresh halaman → tetap masuk; tutup browser, buka lagi → tetap masuk |
| 4 | Realtime | Buka 2 browser/incognito, geser kartu di satu tab → tab lain ikut berubah < 1 detik |
| 5 | Upload | Lampirkan file ~10 MB ke kartu, buka/preview, lalu unduh |
| 6 | Upload besar | File ~90 MB (batas 100 MB) — tidak 413/timeout |
| 7 | Email | Undang anggota → email masuk (atau cek `journalctl -u workbase-api | grep EMAIL` jika SMTP kosong) |
| 8 | Asisten AI | Simpan API key di Pengaturan → Asisten AI, kirim pesan di panel agent |
| 9 | Restart aman | `sudo systemctl restart workbase-api` → aplikasi pulih < 5 detik, tidak ada 502 berkelanjutan |
| 10 | Reboot | `sudo reboot`, tunggu, ulangi cek 1–3 |

Log yang perlu dipantau:

```bash
sudo journalctl -u workbase-api -n 200 --no-pager
sudo tail -f /var/log/nginx/error.log
```

---

## 12. Deploy ulang (update aplikasi)

Urutannya: **tarik kode → install → build → migrasi → restart**. Migrasi dijalankan sebelum
restart agar skema sudah siap saat kode baru hidup.

```bash
sudo -iu workbase
cd /srv/workbase/app

# 0) Selalu backup dulu (lihat langkah 13)
# 1) Tarik versi baru
git pull --ff-only

# 2) Dependency (kalau lockfile berubah)
npm ci --include=dev

# 3) Build ulang
npm run build

# 4) Migrasi database
npm run db:deploy

exit
```

Lalu restart & verifikasi:

```bash
sudo systemctl restart workbase-api
sleep 2
curl -fsS http://127.0.0.1:4000/health
sudo systemctl status workbase-api --no-pager | head -12
```

Catatan:

- `npm ci` menghapus `node_modules` dan memasang ulang; kalau lockfile tidak berubah dan ingin lebih
  cepat, `npm install --include=dev` boleh dipakai.
- Restart memutus koneksi Socket.IO sekejap; klien otomatis reconnect. Lakukan di luar jam sibuk.
- Nama file aset Vite mengandung hash, jadi browser lama tidak akan memakai JS/CSS usang. Halaman
  yang sudah terbuka mungkin perlu refresh setelah deploy.
- Kalau build web gagal karena RAM habis (`Killed`), pastikan swap aktif (langkah 1.2).

### Rollback cepat

Kalau versi baru bermasalah:

```bash
sudo -iu workbase
cd /srv/workbase/app
git log --oneline -5                 # cari commit stabil
git checkout <commit-stabil>
npm ci --include=dev && npm run build
exit
sudo systemctl restart workbase-api
```

`prisma migrate deploy` **tidak bisa** membatalkan migrasi yang sudah jalan. Kalau versi baru sudah
menjalankan migrasi yang tidak kompatibel, rollback kode saja tidak cukup — pulihkan dump database
dari langkah 13. Karena itu: **backup sebelum setiap deploy yang membawa migrasi**.

---

## 13. Backup & restore

Yang wajib dibackup:

1. **Database MySQL** (semua data).
2. **`/srv/workbase/shared/uploads`** (file & avatar — hanya kalau `STORAGE_DRIVER=local`).
3. **`/srv/workbase/app/.env`** (berisi secret; simpan terenkripsi, jangan di folder yang bisa diakses web).

### 13.1 Kredensial mysqldump

```bash
sudo -iu workbase
cat > /srv/workbase/.my.cnf <<'EOF'
[client]
user=workbase
password=PASSWORD_DB_KUAT_2026
EOF
chmod 600 /srv/workbase/.my.cnf
exit
```

### 13.2 Script backup

Buat `/usr/local/bin/workbase-backup.sh`:

```bash
sudo nano /usr/local/bin/workbase-backup.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date +%F-%H%M)"
BACKUP_DIR=/srv/workbase/shared/backups
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

# Database (--no-tablespaces: user aplikasi tidak punya privilege PROCESS)
mysqldump --defaults-extra-file=/srv/workbase/.my.cnf \
  --single-transaction --quick --no-tablespaces \
  --default-character-set=utf8mb4 workbase \
  | gzip -9 > "$BACKUP_DIR/db-$STAMP.sql.gz"

# Upload (lewati kalau pakai S3/R2)
tar -C /srv/workbase/shared -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" uploads

# .env (secret) — pisahkan, beri permission ketat
install -m 600 /srv/workbase/app/.env "$BACKUP_DIR/env-$STAMP.bak"

# Retensi lokal
find "$BACKUP_DIR" -type f -mtime +$KEEP_DAYS -delete

echo "[$(date -Is)] backup selesai: $STAMP"
```

```bash
sudo chmod +x /usr/local/bin/workbase-backup.sh
sudo -u workbase /usr/local/bin/workbase-backup.sh
ls -lh /srv/workbase/shared/backups
```

### 13.3 Jadwalkan harian

```bash
sudo crontab -e
```

```cron
# Backup harian 02:30 waktu server
30 2 * * * /usr/bin/sudo -u workbase /usr/local/bin/workbase-backup.sh >> /var/log/workbase-backup.log 2>&1
```

**Salin hasil backup ke luar VPS** (rclone ke S3/R2, `scp`, atau storage lain). Backup di VPS yang
sama tidak menolong kalau disk/VPS hilang. Tes restore minimal sekali sebulan.

### 13.4 Restore

```bash
# 1) Hentikan API
sudo systemctl stop workbase-api

# 2) Restore database
gunzip -c /srv/workbase/shared/backups/db-2026-11-17-0230.sql.gz \
  | mysql --defaults-extra-file=/srv/workbase/.my.cnf workbase

# 3) Restore upload (opsional)
sudo -u workbase tar -C /srv/workbase/shared -xzf /srv/workbase/shared/backups/uploads-2026-11-17-0230.tar.gz

# 4) Pastikan ownership benar, lalu nyalakan
sudo chown -R workbase:workbase /srv/workbase/shared/uploads
sudo systemctl start workbase-api
curl -fsS http://127.0.0.1:4000/health
```

---

## 14. Troubleshooting

| Gejala | Penyebab umum | Solusi |
| --- | --- | --- |
| `502 Bad Gateway` | Service API mati / crash saat boot | `sudo systemctl status workbase-api`, `sudo journalctl -u workbase-api -n 100 --no-pager` |
| API mati dengan `Invalid environment configuration` | Ada variabel wajib kosong/salah format (mis. `DATABASE_URL` bukan URL valid, secret < 32 karakter) | Pesan detail ada di awal log; perbaiki `.env`, `sudo systemctl restart workbase-api` |
| `P1001: Can't reach database server` | MySQL mati / `DATABASE_URL` salah | `sudo systemctl status mysql`, `mysql -u workbase -p -e "SELECT 1"` |
| `P1000: Authentication failed` | Password di `DATABASE_URL` salah atau mengandung karakter khusus yang belum di-encode | Pakai password alfanumerik, atau URL-encode (`@` → `%40`, `#` → `%23`) |
| Login berhasil tapi langsung logout setelah refresh | Cookie `Secure` dikirim lewat HTTP; atau `WEB_URL`/`CORS_ORIGINS` tidak persis sama | Pastikan akses lewat `https://workbase.mendunia.id` (bukan IP/`www`), perbaiki `.env`, restart |
| Halaman putih / aset 403/404 | Path `root` Nginx salah atau permission | Cek `namei -l /srv/workbase/app/apps/web/dist/index.html`, `sudo chmod -R a+rX .../dist` |
| Refresh di `/settings` → 404 | `try_files` SPA belum ada | Pastikan `location / { try_files $uri /index.html; }` |
| Upload 413 | `client_max_body_size` kurang | Naikkan ke `110m` (server & lokasi upload), `sudo nginx -t && sudo systemctl reload nginx` |
| Upload macet / gagal simpan | Direktori upload tidak writable atau disk penuh | `sudo chown -R workbase:workbase /srv/workbase/shared/uploads`, `df -h` |
| Realtime tidak update | Header `Upgrade` tidak diteruskan / WebSocket diblokir | Pastikan blok `location /socket.io/` memakai `Upgrade` + `Connection "upgrade"`; lihat `/var/log/nginx/error.log` |
| Email tidak terkirim | `SMTP_HOST` kosong (mode dev: hanya log) atau port salah | Isi SMTP; port 465 memakai TLS implisit, 587 STARTTLS; cek log |
| Agent: "Belum ada penyedia LLM" | Belum ada API key (env maupun UI) | Isi di Pengaturan → Asisten AI (admin), atau `ANTHROPIC_API_KEY` dkk di `.env` lalu restart |
| Agent: key tersimpan tapi error "dekripsi" | `AGENT_ENCRYPTION_KEY`/`JWT_ACCESS_SECRET` berubah | Isi ulang API key di Pengaturan → Asisten AI |
| Jadwal agent jalan dobel | Lebih dari satu instance API | Jalankan tepat satu `workbase-api` |
| `libssl.so` / Prisma engine error | OpenSSL tidak lengkap | `sudo apt install -y openssl libssl3` |
| Build web `Killed` | RAM habis | Aktifkan swap (langkah 1.2) atau build di mesin lain lalu rsync `apps/web/dist` |

Perintah diagnosa cepat:

```bash
sudo systemctl status workbase-api mysql nginx --no-pager
sudo journalctl -u workbase-api --since "15 min ago" --no-pager
sudo nginx -t
sudo ss -lntp | grep -E ':(80|443|4000|3306)\b'
curl -s http://127.0.0.1:4000/health
df -h; free -h
```

---

## 15. Checklist keamanan

- [ ] `.env` permission `600`, owner `workbase`, **tidak** masuk git (sudah ada di `.gitignore`).
- [ ] `JWT_ACCESS_SECRET`, `COOKIE_SECRET`, `AGENT_ENCRYPTION_KEY` acak & disimpan di password manager.
- [ ] MySQL hanya listen `127.0.0.1`; user database hanya punya akses ke `workbase`.
- [ ] UFW aktif; hanya 22/80/443 terbuka. Port 4000 & 3306 tidak terekspos.
- [ ] HTTPS aktif dengan redirect dari HTTP; `certbot renew --dry-run` lulus.
- [ ] Login SSH memakai key; pertimbangkan `PasswordAuthentication no`.
- [ ] `unattended-upgrades` aktif untuk patch keamanan otomatis.
- [ ] Backup harian berjalan + disalin ke luar VPS + pernah dites restore.
- [ ] Sourcemap produksi tidak disajikan (sudah diblokir di Nginx; bisa juga dihapus dengan
      `find apps/web/dist -name '*.map' -delete` setelah build).
- [ ] Rate limit API aktif (bawaan: 300 req/menit/IP) — jangan pasang reverse proxy tambahan yang
      menyembunyikan IP asli tanpa `real_ip`.
- [ ] Review akses admin organisasi secara berkala (`/admin`).

Opsional:

```bash
sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
sudo systemctl enable --now fail2ban
```

---

## Lampiran A: opsional Redis + worker BullMQ

Diperlukan hanya kalau:

- ingin email/reminder tetap diproses walau API restart (BullMQ durabel), atau
- menjalankan **lebih dari satu** instance API (Socket.IO butuh Redis adapter).

Dengan Redis, job **tidak lagi** berjalan di proses API; email ditangani `apps/worker`.

```bash
sudo apt install -y redis-server
sudo nano /etc/redis/redis.conf
```

```conf
bind 127.0.0.1 ::1
requirepass PASSWORD_REDIS_KUAT
```

```bash
sudo systemctl restart redis-server
redis-cli -a PASSWORD_REDIS_KUAT ping   # PONG
```

Tambahkan ke `.env`:

```dotenv
REDIS_URL=redis://:PASSWORD_REDIS_KUAT@127.0.0.1:6379
```

Buat `/etc/systemd/system/workbase-worker.service`:

```ini
[Unit]
Description=Mendunia Workbase Worker (BullMQ)
After=network.target mysql.service redis-server.service
Wants=mysql.service redis-server.service

[Service]
Type=simple
User=workbase
Group=workbase
WorkingDirectory=/srv/workbase/app/apps/worker
EnvironmentFile=/srv/workbase/app/.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/workbase/shared/uploads /srv/workbase/shared/backups
SyslogIdentifier=workbase-worker

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now workbase-worker
sudo systemctl restart workbase-api
sudo journalctl -u workbase-worker -n 50 --no-pager
```

Catatan:

- `npm run build` sudah membangun `apps/worker/dist/main.js`.
- Setelah Redis aktif, cek `/health` → `"redis":"up"`.
- Penjadwal agent tetap berjalan di proses API dan tidak punya lock antar-instance — kalau suatu saat
  memakai beberapa instance API, pantau agar jadwal tidak jalan ganda.

---

## Lampiran B: opsional object storage S3 / Cloudflare R2

Cocok kalau upload akan besar atau ingin backup file otomatis di storage terpisah.

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=workbase
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

Lalu:

```bash
sudo systemctl restart workbase-api
curl -s http://127.0.0.1:4000/health
```

Yang perlu diperhatikan:

- Bucket **tidak** perlu publik: API membuat presigned URL 5 menit untuk upload/download.
- Pasang **CORS** di bucket agar browser boleh `PUT` dan `GET` dari `https://workbase.mendunia.id`
  (`AllowedMethods: PUT, GET, HEAD`; `AllowedHeaders: content-type`; `ExposeHeaders: ETag`).
- Dengan S3, direktori `shared/uploads` tidak dipakai lagi; backup file ditangani oleh bucket
  (aktifkan versioning/lifecycle di penyedia).
- `STORAGE_DRIVER=s3` mewajibkan keempat variabel S3 terisi, kalau tidak API menolak boot dengan
  pesan `Invalid environment configuration`.

---

## Ringkasan perintah

```bash
# ── Pertama kali ────────────────────────────────────────────────────────────
# (root) paket sistem: nginx, mysql-server, nodejs 22, certbot
# (root) buat DB + user MySQL
# (root) adduser workbase + direktori /srv/workbase/{app,shared/uploads,shared/backups}

sudo -iu workbase
cd /srv/workbase && git clone <URL_REPO> app && cd app
cp .env.example .env && chmod 600 .env      # isi variabel produksi
npm ci --include=dev && npm run build && npm run db:deploy
exit

# (root) systemd unit workbase-api + nginx site + certbot
sudo systemctl enable --now workbase-api
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d workbase.mendunia.id --redirect -m admin@mendunia.id --agree-tos

# Buka https://workbase.mendunia.id → wizard setup Owner

# ── Deploy berikutnya ───────────────────────────────────────────────────────
sudo -u workbase /usr/local/bin/workbase-backup.sh
sudo -iu workbase
cd /srv/workbase/app
git pull --ff-only && npm ci --include=dev && npm run build && npm run db:deploy
exit
sudo systemctl restart workbase-api && curl -fsS http://127.0.0.1:4000/health

# ── Diagnosa ────────────────────────────────────────────────────────────────
sudo journalctl -u workbase-api -f
sudo tail -f /var/log/nginx/error.log
sudo systemctl status workbase-api nginx mysql --no-pager
curl -s https://workbase.mendunia.id/health
```
