# Deployment Mendunia Workbase di VPS (Nginx + Node.js + MySQL + PM2)

Panduan men-deploy **Mendunia Workbase** ke satu VPS Ubuntu tanpa Docker. Contoh domain:
**`https://workbase.mendunia.id`**.

```
Internet ──HTTPS──> Nginx (workbase.mendunia.id)
                     ├── /            → file statis  /var/www/workbase/apps/web/dist
                     ├── /api/...     → proxy        http://127.0.0.1:4000  (Express API, PM2)
                     ├── /socket.io/  → proxy WS     http://127.0.0.1:4000  (Socket.IO)
                     └── /health      → proxy        http://127.0.0.1:4000
                                          │
                                          ├── MySQL 8 (127.0.0.1:3306)
                                          └── Upload: /var/www/workbase-data/uploads (disk lokal)
```

Tanpa Redis, job (email, reminder, digest), real-time, **run Workbase Agent**, dan penjadwal agent
semuanya berjalan **di dalam satu proses API**. Karena itu API dijalankan **satu instance saja**.

Tidak perlu dipasang (belum ada di sistem ini): Docker, browser worker, sandbox kode, egress proxy,
Qdrant, konektor MCP.

---

## 1. Login ke VPS

```bash
ssh root@IP_SERVER
```

Arahkan domain ke VPS lebih dulu di pengelola DNS:

```
Type  Name       Value            Proxy
A     workbase   <IP_PUBLIK_VPS>  DNS only dulu (awan abu-abu)
```

Cek dari VPS:

```bash
apt install -y dnsutils
dig +short workbase.mendunia.id      # harus keluar IP VPS
```

> **Kalau memakai Cloudflare (Proxied):** terbitkan sertifikat dulu dengan mode **DNS only**, lalu
> nyalakan proxy dengan SSL **Full (strict)**. Dengan proxy aktif, API melihat semua pengguna dari
> IP Cloudflare sehingga rate limit per IP (300 req/menit) menjadi per-Cloudflare; untuk rate limit
> per pengguna pasang `ngx_http_realip_module` + daftar IP Cloudflare, atau biarkan DNS only.

## 2. Perbarui server dan pasang paket

```bash
apt update && apt upgrade -y
apt install -y curl git nginx mysql-server ufw openssl dnsutils
lsb_release -a
```

Kalau RAM ≤ 2 GB, tambahkan swap (build Vite butuh ~1,5 GB):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

Opsional, samakan zona waktu:

```bash
timedatectl set-timezone Asia/Jakarta
```

## 3. Instalasi Node.js dan PM2

Gunakan **Node.js 22 LTS** (minimal 20.6, karena PM2 memuat `.env` lewat `node --env-file`).

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

node -v
npm -v
```

Instal PM2:

```bash
npm install -g pm2
pm2 -v
```

## 4. Clone project dan instalasi dependency

```bash
mkdir -p /var/www/workbase /var/www/workbase-data/uploads /var/www/workbase-data/backups
cd /var/www/workbase
git clone <REPO_URL> .
```

Jika repository private, autentikasi dulu dengan deploy key (`ssh-keygen -t ed25519`, lalu
tambahkan public key ke GitHub/GitLab) atau personal access token.

Instal dependency. `--include=dev` **wajib** karena build butuh `tsup`, `vite`, `prisma`, dan `turbo`:

```bash
npm ci --include=dev
```

`npm ci` otomatis menjalankan `prisma generate`. Jangan `export NODE_ENV=production` di shell
sebelum `npm ci`, karena npm akan melewati devDependencies.

## 5. Konfigurasi environment

Generate secret (simpan di password manager):

```bash
openssl rand -base64 48    # → JWT_ACCESS_SECRET
openssl rand -base64 48    # → COOKIE_SECRET
openssl rand -hex 32       # → AGENT_ENCRYPTION_KEY
```

Buat file `.env` di root project:

```bash
cp .env.example .env
nano .env
```

Isi konfigurasi production:

```dotenv
NODE_ENV=production

# ── Database ────────────────────────────────────────────────────────────────
DATABASE_URL="mysql://workbase:PASSWORD_DATABASE@127.0.0.1:3306/workbase"

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
STORAGE_LOCAL_DIR=/var/www/workbase-data/uploads

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
# Key penyedia boleh diisi di sini ATAU lewat Pengaturan → Asisten AI (menimpa .env).
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
# Pencarian web (opsional): brave | tavily. Kosong = tool web_search mati.
AGENT_SEARCH_PROVIDER=
BRAVE_API_KEY=
TAVILY_API_KEY=
# 32 byte (64 hex). Mengenkripsi key penyedia dari UI. JANGAN diganti setelah dipakai.
AGENT_ENCRYPTION_KEY=<hasil-openssl-3>
# Harga resmi per model (USD / 1 juta token). Isi sebelum mengandalkan angka biaya & budget.
# Contoh: {"gpt-4o-mini":{"input":0.15,"output":0.6}}
AGENT_PRICING_JSON=
AGENT_MAX_RUN_COST_USD=0.5
AGENT_MAX_STEPS=12
```

Lindungi file environment:

```bash
chmod 600 .env
```

> **Penting:** ganti `PASSWORD_DATABASE` dan semua secret. Gunakan password database **huruf +
> angka** agar aman di URL. Jangan commit `.env` ke GitHub.

Poin penting:

| Variabel | Kenapa penting |
| --- | --- |
| `NODE_ENV=production` | Cookie refresh jadi `Secure` (hanya lewat HTTPS). **Wajib** di server. |
| `WEB_URL` | Dipakai di link email dan redirect OAuth. Persis `https://workbase.mendunia.id`, tanpa `/` di akhir. |
| `CORS_ORIGINS` | Samakan dengan `WEB_URL`. Origin desktop (`tauri://localhost`) sudah otomatis diizinkan. |
| `JWT_ACCESS_SECRET`, `COOKIE_SECRET` | Minimal 32 karakter. Kalau diganti, semua pengguna logout. |
| `STORAGE_LOCAL_DIR` | **Isi eksplisit.** Default-nya dihitung dari lokasi file build dan salah di hasil bundle. |
| `SMTP_HOST` | Kalau kosong, email tidak dikirim — hanya dicetak ke log API. |
| `AGENT_ENCRYPTION_KEY` | Kalau diganti/dihapus, key penyedia yang tersimpan dari UI tidak bisa didekripsi (API menulis peringatan di log dan memakai key `.env` bila ada). Kalau kosong, key diturunkan dari `JWT_ACCESS_SECRET`. **Tetapkan sekali.** |
| `AGENT_ENABLED` | Kill switch global. `false` + restart mematikan fitur agent. |

## 6. Setup database MySQL

```bash
mysql
```

Buat database dan user:

```sql
CREATE DATABASE workbase
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE USER 'workbase'@'localhost'
IDENTIFIED BY 'PASSWORD_DATABASE';

GRANT ALL PRIVILEGES ON workbase.*
TO 'workbase'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

Pastikan `DATABASE_URL` memakai username, password, dan nama database yang sama. Tes koneksi, dan
pastikan MySQL hanya listen di localhost:

```bash
mysql -u workbase -p -e "SELECT VERSION();" workbase
ss -lntp | grep 3306        # harus 127.0.0.1:3306, bukan 0.0.0.0:3306
```

### Migrasi

Di direktori project:

```bash
cd /var/www/workbase
npm run db:deploy
```

> **Jangan** menjalankan `npm run db:seed` di produksi: seed membuat organisasi demo + 7 akun
> dengan password `password123`. Akun pertama dibuat lewat wizard **setup awal** (langkah 14).
> Jangan juga menjalankan `npm test` di server: tes menulis ke database dari `DATABASE_URL`.

## 7. Build aplikasi

```bash
npm run build
```

Hasilnya:

```
apps/api/dist/server.js     → API
apps/worker/dist/main.js    → worker (hanya dipakai kalau pakai Redis)
apps/web/dist/              → file statis untuk Nginx
```

Uji API di foreground (memuat `.env` seperti yang akan dilakukan PM2):

```bash
cd /var/www/workbase/apps/api
node --env-file=/var/www/workbase/.env dist/server.js
```

Buka terminal kedua dan uji:

```bash
curl -s http://127.0.0.1:4000/health
# {"status":"ok","database":"up","redis":"disabled"}
```

Kalau responsnya seperti itu, hentikan proses foreground dengan `Ctrl+C` sebelum menjalankan PM2.
Kalau gagal, lihat pesan error-nya sekarang (biasanya `Invalid environment configuration` atau
koneksi database) dan perbaiki dulu — jauh lebih mudah dibaca di sini daripada di log PM2.

## 8. Menjalankan aplikasi dengan PM2

Buat file konfigurasi di root project:

```bash
cd /var/www/workbase
nano ecosystem.config.cjs
```

Isi:

```js
module.exports = {
  apps: [
    {
      name: 'workbase-api',
      cwd: '/var/www/workbase/apps/api',
      script: 'dist/server.js',
      // .env dimuat oleh Node. (dotenv di dalam bundle mencari .env di path yang salah.)
      node_args: '--env-file=/var/www/workbase/.env',

      // WAJIB satu proses, mode fork. JANGAN 'cluster' / instances > 1:
      // Socket.IO, job, run agent, dan kill switch agent hidup di memori proses ini.
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      restart_delay: 3000,
      max_restarts: 20,
      min_uptime: '10s',
      kill_timeout: 20000,
      max_memory_restart: '1G',
      time: true,
    },
  ],
};
```

Jalankan aplikasi:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Jalankan perintah tambahan yang dicetak oleh `pm2 startup` agar PM2 otomatis aktif setelah reboot,
lalu `pm2 save` lagi.

Periksa status:

```bash
pm2 status
pm2 logs workbase-api
curl -s http://127.0.0.1:4000/health
```

Rotasi log (disarankan):

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
```

Perubahan `.env` baru berlaku setelah `pm2 restart workbase-api`. Pastikan hanya satu proses yang
jalan: `pgrep -af "dist/server.js"` harus menampilkan tepat satu baris.

## 9. Konfigurasi Nginx

Hapus site default, lalu buat virtual host:

```bash
rm -f /etc/nginx/sites-enabled/default
nano /etc/nginx/sites-available/workbase.mendunia.id
```

Konfigurasi HTTP:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name workbase.mendunia.id;

    root /var/www/workbase/apps/web/dist;
    index index.html;
    charset utf-8;
    server_tokens off;

    # File maksimal 100 MB + overhead
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

    # Upload/download file besar: jangan buffer ke disk Nginx
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

    # ── Health check ───────────────────────────────────────────────────────
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

    # Jangan sajikan sourcemap produksi
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

Aktifkan konfigurasi:

```bash
ln -s /etc/nginx/sites-available/workbase.mendunia.id \
/etc/nginx/sites-enabled/workbase.mendunia.id
```

Uji dan reload:

```bash
nginx -t
systemctl reload nginx
```

Kalau ada `403 Forbidden` pada aset: `chmod -R a+rX /var/www/workbase/apps/web/dist` dan cek
`namei -l /var/www/workbase/apps/web/dist/index.html`.

Tes sebelum HTTPS:

```bash
curl -I http://workbase.mendunia.id/
curl -s http://workbase.mendunia.id/health
curl -s http://workbase.mendunia.id/api/v1/meta | head -c 200
```

> Login **belum** bekerja lewat HTTP (`WEB_URL` sudah `https://` dan cookie `Secure`). Lanjut ke langkah 10.

## 10. Aktivasi HTTPS

Instal Certbot:

```bash
apt install -y certbot python3-certbot-nginx
```

Terbitkan sertifikat SSL:

```bash
certbot --nginx -d workbase.mendunia.id --redirect \
  -m admin@mendunia.id --agree-tos --no-eff-email
```

Periksa sertifikat dan uji pembaruan otomatis:

```bash
certbot certificates
certbot renew --dry-run
```

Setelah selesai, website dapat diakses melalui `https://workbase.mendunia.id`. Aplikasi **hanya**
bisa dipakai lewat HTTPS: membuka lewat IP atau HTTP membuat login gagal (cookie ditolak browser).

## 11. Konfigurasi firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
```

**Jangan** membuka port 4000 (API) atau 3306 (MySQL) ke publik. API hanya diakses lewat Nginx, dan
MySQL cukup menerima koneksi lokal.

### Firewall keluar (untuk Workbase Agent)

Tool `fetch_page` hanya dilindungi di level aplikasi (`assertPublicUrl` memeriksa IP setelah DNS
resolve, redirect diperiksa ulang, koneksi dipin). **Egress proxy belum ada**, jadi pasang lapisan
jaringan agar proses di server tidak bisa **memulai koneksi** ke metadata cloud
(`169.254.169.254`) atau jaringan privat provider, sekalipun ada bug SSRF:

```bash
nano /etc/nftables.conf
```

```nft
table inet workbase_egress {
  chain output {
    type filter hook output priority 0; policy accept;
    # Hanya koneksi BARU keluar; balasan SSH/HTTP yang sudah berjalan tidak tersentuh.
    # Berlaku untuk user root (PM2 berjalan sebagai root). Loopback (MySQL lokal) tetap boleh.
    meta skuid 0 oifname != "lo" ct state new ip  daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 100.64.0.0/10 } reject
    meta skuid 0 oifname != "lo" ct state new ip6 daddr { fc00::/7, fe80::/10 } reject
  }
}
```

```bash
nft -c -f /etc/nftables.conf          # cek sintaks dulu
systemctl enable --now nftables
nft -f /etc/nftables.conf

# Verifikasi
curl -m 5 -sS http://169.254.169.254/ || echo "diblokir (benar)"
curl -m 10 -sSI https://example.com | head -1      # harus berhasil
apt update                                           # harus tetap berhasil
```

Kalau `apt update` atau koneksi lain ikut gagal, resolver/mirror/MySQL/SMTP Anda berada di jaringan
privat provider: tambahkan pengecualian untuk IP itu **di atas** aturan `reject`. Aturan ini hanya
memblokir jangkauan ke jaringan internal; ia tidak mencegah data dikirim ke situs publik — itu
ditahan oleh konfirmasi Ya/Tidak di aplikasi.

## 12. Update dan redeployment

Setiap kali ada perubahan kode di repository:

```bash
cd /var/www/workbase

# 0) Backup dulu (langkah 13) bila rilis membawa migrasi
git pull --ff-only
npm ci --include=dev

npm run db:deploy
npm run build
pm2 restart workbase-api
```

Periksa status:

```bash
pm2 status
pm2 logs workbase-api --lines 100
curl -fsS http://127.0.0.1:4000/health
```

Catatan:

- **Jika build gagal, jangan restart** aplikasi production sebelum build berhasil. Kalau build web
  `Killed`, RAM habis — aktifkan swap (langkah 2).
- **Restart memutus run agent yang sedang berjalan** (ditandai `FAILED` saat boot) dan memutus
  Socket.IO sekejap (klien reconnect otomatis). Lakukan di luar jam sibuk. Persetujuan Ya/Tidak yang
  tertunda tetap aman di database.
- Nama file aset Vite ber-hash, jadi browser lama tidak memakai JS/CSS usang; halaman yang sudah
  terbuka mungkin perlu refresh.

### Rollback cepat

```bash
cd /var/www/workbase
git log --oneline -5                 # cari commit stabil
git checkout <commit-stabil>
npm ci --include=dev && npm run build
pm2 restart workbase-api
```

`prisma migrate deploy` **tidak bisa** membatalkan migrasi yang sudah jalan. Kalau versi baru sudah
menjalankan migrasi yang tidak kompatibel, rollback kode saja tidak cukup — pulihkan dump database
(langkah 13). Karena itu: **backup sebelum setiap deploy yang membawa migrasi**.

## 13. Backup database dan file

Backup manual:

```bash
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --no-tablespaces \
  workbase \
  > /var/www/workbase-data/backups/workbase_backup.sql
```

Backup terkompresi + file upload:

```bash
mysqldump --single-transaction --no-tablespaces workbase \
  | gzip > /var/www/workbase-data/backups/db_$(date +%F).sql.gz

tar -C /var/www/workbase-data -czf /var/www/workbase-data/backups/uploads_$(date +%F).tar.gz uploads
```

Backup harian otomatis (`crontab -e`):

```cron
30 2 * * * mysqldump --single-transaction --no-tablespaces workbase | gzip > /var/www/workbase-data/backups/db_$(date +\%F).sql.gz && find /var/www/workbase-data/backups -name 'db_*.sql.gz' -mtime +14 -delete
```

Yang perlu dicadangkan juga:

- **`/var/www/workbase-data/uploads`** (kalau `STORAGE_DRIVER=local`).
- **`.env`** — terutama `AGENT_ENCRYPTION_KEY` (dan `JWT_ACCESS_SECRET` bila key agent diturunkan
  darinya): tanpa itu, key penyedia LLM di dalam dump tidak bisa didekripsi saat restore. **Simpan
  terpisah dari dump database**, jangan di folder yang sama.

Simpan salinan backup **di luar VPS** secara berkala dan uji proses restore sebelum mengandalkannya.

Restore:

```bash
pm2 stop workbase-api
gunzip -c /var/www/workbase-data/backups/db_2026-11-17.sql.gz | mysql workbase
tar -C /var/www/workbase-data -xzf /var/www/workbase-data/backups/uploads_2026-11-17.tar.gz
pm2 start workbase-api
curl -fsS http://127.0.0.1:4000/health
```

## 14. Aktivasi pertama dan Workbase Agent

### 14.1 Setup awal

1. Buka `https://workbase.mendunia.id` → halaman **setup awal**.
2. Isi nama organisasi, nama, email, dan password **Owner** pertama.
3. **Admin organisasi** → buat divisi dan undang anggota; **Divisi & Proyek** → buat project pertama.
4. Kalau database berisi data dari server lain (restore), lewati setup dan langsung login.

### 14.2 Menyalakan Workbase Agent

Agent aktif secara bawaan, tetapi **tidak bisa dipakai sampai ada key penyedia LLM**:

1. **Key penyedia:** Pengaturan → Asisten AI (admin) → isi key Claude/GPT/Gemini/Groq, atau isi
   `*_API_KEY` di `.env` lalu `pm2 restart workbase-api`. Key dari UI tersimpan terenkripsi dan
   menimpa `.env`; yang ditampilkan kembali hanya petunjuk (`sk-a…f4a2`).
2. **Harga & budget:** isi `AGENT_PRICING_JSON` dengan harga resmi tiap model, lalu atur budget
   bulanan per pengguna. Tanpa harga resmi, angka biaya hanya perkiraan.
3. **Pencarian web (opsional):** set `AGENT_SEARCH_PROVIDER=brave|tavily` + key-nya. Tanpa ini agent
   tetap bisa membuka URL lewat `fetch_page`, tapi tidak bisa mencari. Format API Brave/Tavily belum
   diverifikasi ke akun nyata — uji satu pencarian sebelum dibuka ke tim.
4. **Uji asap:** panel agent (Ctrl+J) → "Apa task saya yang overdue?" → jawaban sesuai halaman
   *Task saya*. Minta membuat kartu draft: tombol **Ya/Tidak** harus muncul, kartu baru hanya dibuat
   setelah *Ya*. Di chat project, `@NamaAgent` (agent yang akun bot-nya anggota project) harus
   membalas; tombol **Jadikan task** membuat kartu.
5. **Kebijakan data:** pesan pengguna dan isi task/kartu yang dibaca tool **dikirim ke penyedia LLM
   pihak ketiga**. Putuskan data apa yang boleh dan umumkan sebelum dibuka ke semua divisi.
6. **Kill switch:** `AGENT_ENABLED=false` + restart mematikan fitur; untuk menghentikan run yang
   sedang berjalan tanpa restart, pakai tombol "hentikan semua run" di dashboard AI (admin).

Batas yang perlu diketahui:

- Satu instance API. Run berjalan di dalam proses API; restart saat ada run aktif membuatnya `FAILED`.
- Batas per pengguna: chat agent 20 pesan/menit; pratinjau jadwal dan refleksi 10/menit (di luar batas
  umum API 300 req/menit/IP). Jadwal agent minimal 1 jam, zona Asia/Jakarta, disimpan UTC.
- Tidak ada browser worker, sandbox kode, atau konektor MCP; agent tidak menyentuh komputer
  pengguna maupun file server. Pencarian memori/knowledge memakai kata kunci (tanpa Qdrant);
  upload knowledge mendukung teks/Markdown.

### 14.3 Checklist verifikasi

| # | Yang dicek | Cara |
| --- | --- | --- |
| 1 | Health API | `curl -s https://workbase.mendunia.id/health` → `status: ok` |
| 2 | SPA & deep link | Buka `/settings`, `/projects`, lalu **refresh** — tidak boleh 404 |
| 3 | Login & sesi | Login, refresh → tetap masuk; tutup browser, buka lagi → tetap masuk |
| 4 | Realtime | Dua browser, geser kartu di satu tab → tab lain berubah < 1 detik |
| 5 | Upload | Lampirkan file ~10 MB ke kartu, buka, lalu unduh; coba ~90 MB (tidak 413/timeout) |
| 6 | Email | Undang anggota → email masuk (atau `pm2 logs workbase-api --nostream \| grep EMAIL` bila SMTP kosong) |
| 7 | Agent | Uji asap di 14.2 langkah 4 |
| 8 | Firewall keluar | `curl -m 5 http://169.254.169.254/` gagal; `curl -I https://example.com` berhasil |
| 9 | Restart aman | `pm2 restart workbase-api` → pulih < 5 detik |
| 10 | Reboot | `reboot`, tunggu, `pm2 status` harus `online` tanpa dijalankan manual |

## 15. Aplikasi desktop (Tauri)

Aplikasi desktop tidak ikut `npm run build` server. Yang perlu disiapkan:

- **URL API:** build desktop membaca `VITE_API_URL`; di CI (`.github/workflows/desktop-release.yml`)
  nilainya dari *repository variable* `DESKTOP_API_URL` = `https://workbase.mendunia.id/api/v1`
  (URL absolut lengkap; origin Socket.IO diturunkan dari sini). Kosong = `http://localhost:4000/api/v1`.
- **CORS:** origin Tauri sudah otomatis diizinkan, tidak perlu ditambah di `CORS_ORIGINS`.
- **Versi minimum:** `MIN_DESKTOP_VERSION` memaksa klien lama memperbarui diri; naikkan hanya setelah
  rilis baru terbit.
- **Rilis & auto-update:** tag versi memicu workflow rilis (draft release + `latest.json`). Butuh
  secret `TAURI_SIGNING_PRIVATE_KEY` (+ password); sertifikat Apple opsional. Jaga kunci
  penandatangan: kehilangannya memutus auto-update.
- Agent berjalan di server, bukan di komputer pengguna; tidak ada konfigurasi tambahan di desktop.

## 16. Opsional

### 16.1 Redis + worker BullMQ

Diperlukan hanya jika email/reminder harus tetap diproses walau API restart, atau menjalankan lebih
dari satu instance API. **Run agent dan penjadwal agent tidak pindah ke worker** — keduanya tetap di
proses API (jadwal aman dari eksekusi ganda berkat *claim* atomik di database, tetapi kill switch run
hanya menjangkau instance tempat run berjalan), jadi agent tetap diasumsikan satu instance.

```bash
apt install -y redis-server
nano /etc/redis/redis.conf       # bind 127.0.0.1 ::1  dan  requirepass PASSWORD_REDIS_KUAT
systemctl restart redis-server
redis-cli -a PASSWORD_REDIS_KUAT ping      # PONG
```

Tambahkan ke `.env`: `REDIS_URL=redis://:PASSWORD_REDIS_KUAT@127.0.0.1:6379`, lalu tambahkan
aplikasi kedua di `ecosystem.config.cjs` (di array `apps`):

```js
    {
      name: 'workbase-worker',
      cwd: '/var/www/workbase/apps/worker',
      script: 'dist/main.js',
      node_args: '--env-file=/var/www/workbase/.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 20000,
      time: true,
    },
```

```bash
pm2 start ecosystem.config.cjs --only workbase-worker
pm2 restart workbase-api
pm2 save
curl -s http://127.0.0.1:4000/health     # "redis":"up"
```

### 16.2 Object storage S3 / Cloudflare R2

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=workbase
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

Lalu `pm2 restart workbase-api`. Bucket tidak perlu publik (presigned URL 5 menit). Pasang CORS di
bucket untuk `https://workbase.mendunia.id` (`AllowedMethods: PUT, GET, HEAD`; `AllowedHeaders:
content-type`; `ExposeHeaders: ETag`). `STORAGE_DRIVER=s3` mewajibkan keempat variabel S3 terisi,
kalau tidak API menolak boot dengan `Invalid environment configuration`.

## 17. Troubleshooting

| Masalah | Pemeriksaan / solusi |
| --- | --- |
| Website **502 Bad Gateway** | `pm2 status`, `pm2 logs workbase-api --lines 100 --nostream`, `curl -s http://127.0.0.1:4000/health`, `tail -n 30 /var/log/nginx/error.log`. Penyebab umum di bawah |
| 502 + `pm2 status` kosong | Belum pernah dijalankan / hilang setelah reboot: `cd /var/www/workbase && pm2 start ecosystem.config.cjs && pm2 save`, lalu `pm2 startup` |
| 502 + status `errored` | API crash berulang (PM2 berhenti setelah 20x). Baca penyebab di log, perbaiki, `pm2 restart workbase-api` |
| Log `Invalid environment configuration` | Variabel di `.env` kosong/salah format: `DATABASE_URL` bukan URL valid, secret < 32 karakter, atau `STORAGE_DRIVER=s3` tanpa variabel S3 |
| Log `.env: not found` / `bad option: --env-file` | Path `--env-file` di `ecosystem.config.cjs` salah, atau Node < 20.6 (`node -v`) |
| Log `Dynamic require of "fs" is not supported` | Build lama yang membundel Prisma ke dalam `dist`. Ambil kode terbaru (`apps/api/tsup.config.ts` sudah memakai `external`), lalu `git pull && npm ci --include=dev && npm run build && pm2 restart workbase-api` |
| Log `Cannot find module` / `dist/server.js` tidak ada | Build belum dijalankan: `npm run build` |
| Log `P1001: Can't reach database server` | MySQL mati / `DATABASE_URL` salah: `systemctl status mysql`, `mysql -u workbase -p -e "SELECT 1"` |
| Log `P1000: Authentication failed` | Password salah, atau ada karakter khusus belum di-encode di URL (`@` → `%40`, `#` → `%23`); pakai password alfanumerik |
| Port 4000 sudah digunakan | `ss -lntp \| grep 4000` — biasanya ada proses ganda; `pgrep -af "dist/server.js"` |
| Login berhasil tapi logout setelah refresh | Cookie `Secure` lewat HTTP, atau `WEB_URL`/`CORS_ORIGINS` tidak persis sama. Akses lewat `https://workbase.mendunia.id` (bukan IP/`www`) |
| Halaman putih / aset 403/404 | Cek `root` Nginx dan `chmod -R a+rX /var/www/workbase/apps/web/dist` |
| Refresh di `/settings` → 404 | Pastikan `location / { try_files $uri /index.html; }` |
| Upload 413 | Naikkan `client_max_body_size` ke `110m` (server & lokasi upload), `nginx -t && systemctl reload nginx` |
| Upload gagal simpan | `STORAGE_LOCAL_DIR` salah / disk penuh: `ls -ld /var/www/workbase-data/uploads`, `df -h` |
| Realtime tidak update | Blok `/socket.io/` harus meneruskan `Upgrade` + `Connection "upgrade"`; cek `/var/log/nginx/error.log` |
| Email tidak terkirim | `SMTP_HOST` kosong (hanya log) atau port salah (465 = TLS implisit, 587 = STARTTLS) |
| Domain tidak bisa diakses | Periksa DNS, firewall (`ufw status`), dan konfigurasi Nginx |
| SSL gagal | Pastikan DNS mengarah ke VPS (Cloudflare: DNS only dulu) dan port 80 terbuka |
| PM2 tidak aktif setelah reboot | Jalankan ulang `pm2 startup` + perintah yang dicetaknya, lalu `pm2 save` |
| Build web `Killed` | RAM habis: aktifkan swap (langkah 2) atau build di mesin lain lalu salin `apps/web/dist` |
| Agent: "Penyedia … belum dikonfigurasi di server" | Belum ada key penyedia: isi di Pengaturan → Asisten AI, atau `*_API_KEY` di `.env` lalu restart |
| Agent: "Fitur agent dinonaktifkan oleh administrator" | `AGENT_ENABLED=false` → ubah ke `true`, restart |
| Agent: "Budget bulanan … sudah habis" | Naikkan budget di Pengaturan; cek `AGENT_PRICING_JSON` bila angkanya janggal |
| Agent: "Server dimulai ulang saat run berjalan" | Normal setelah restart; minta agent mengulang |
| Agent: key tersimpan tapi penyedia tampak belum dikonfigurasi (log `cannot be decrypted`) | `AGENT_ENCRYPTION_KEY`/`JWT_ACCESS_SECRET` berubah: kembalikan nilai lama atau isi ulang key |
| `web_search` "belum dikonfigurasi" | Isi `AGENT_SEARCH_PROVIDER` + `BRAVE_API_KEY`/`TAVILY_API_KEY`, restart |
| `fetch_page` gagal untuk situs publik | Firewall keluar terlalu ketat atau URL ke IP privat (sengaja diblokir): `curl -I https://situs-itu`, cek aturan nftables |
| `@NamaAgent` tidak membalas | Bot agent bukan anggota project, agent nonaktif, pengirim guest/bukan anggota, atau key belum ada; `pm2 logs workbase-api --lines 1000 --nostream \| grep <runId>` |
| Jadwal agent tidak jalan / jalan dobel | Ticker ada di proses API: cek `pm2 status`. Dobel = ada dua proses API; `pgrep -af "dist/server.js"` |
| `libssl.so` / Prisma engine error | `apt install -y openssl libssl3` |

Diagnosa cepat:

```bash
pm2 status
systemctl status mysql nginx --no-pager
pm2 logs workbase-api --lines 300 --nostream
nginx -t
ss -lntp | grep -E ':(80|443|4000|3306)\b'
curl -s http://127.0.0.1:4000/health
df -h; free -h
```

## 18. Checklist keamanan

- [ ] `.env` permission `600`, tidak masuk git. Secret acak dan tersimpan di password manager.
- [ ] MySQL hanya listen `127.0.0.1`; user database hanya punya akses ke `workbase`.
- [ ] UFW aktif; hanya 22/80/443 terbuka. Port 4000 & 3306 tidak terekspos.
- [ ] HTTPS aktif dengan redirect; `certbot renew --dry-run` lulus.
- [ ] Login SSH memakai key (`PasswordAuthentication no`); pertimbangkan `fail2ban` dan `unattended-upgrades`.
- [ ] Backup harian berjalan, disalin ke luar VPS, dan pernah dites restore.
- [ ] Sourcemap produksi tidak disajikan (diblokir di Nginx).
- [ ] Aplikasi berjalan sebagai **root** mengikuti panduan ini; untuk risiko lebih rendah, jalankan
      PM2 sebagai user non-root khusus (mis. `adduser workbase`, `pm2 startup -u workbase --hp
      /home/workbase`) dan ganti `meta skuid 0` di aturan nftables dengan `meta skuid "workbase"`.
- [ ] **Agent:** firewall keluar aktif dan diverifikasi; `AGENT_ENCRYPTION_KEY` dicadangkan terpisah;
      `AGENT_PRICING_JSON` terisi dan budget diatur; kebijakan data ke penyedia LLM diumumkan; kill
      switch pernah diuji; hanya admin yang membuat Team Agent, dan akun bot agent hanya ditambahkan ke
      project yang memang boleh dikerjakannya.

## Ringkasan perintah

```bash
# ── Pertama kali ────────────────────────────────────────────────────────────
ssh root@IP_SERVER
apt update && apt upgrade -y && apt install -y curl git nginx mysql-server ufw openssl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs && npm i -g pm2
mkdir -p /var/www/workbase /var/www/workbase-data/{uploads,backups} && cd /var/www/workbase
git clone <REPO_URL> . && npm ci --include=dev
cp .env.example .env && chmod 600 .env && nano .env           # isi variabel produksi
# buat DB + user MySQL (langkah 6), lalu:
npm run db:deploy && npm run build
nano ecosystem.config.cjs && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
# nginx site (langkah 9) + certbot --nginx -d workbase.mendunia.id --redirect

# ── Deploy berikutnya ───────────────────────────────────────────────────────
cd /var/www/workbase
git pull --ff-only && npm ci --include=dev && npm run db:deploy && npm run build
pm2 restart workbase-api && curl -fsS http://127.0.0.1:4000/health

# ── Diagnosa ────────────────────────────────────────────────────────────────
pm2 status && pm2 logs workbase-api
tail -f /var/log/nginx/error.log
curl -s https://workbase.mendunia.id/health
```
