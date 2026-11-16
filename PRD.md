Analisis Kebutuhan Sistem Final — Task Management Multi-Divisi (Web & Desktop)
Nov 14, 2026 · @KBR
1. Ringkasan, Ruang Lingkup & Asumsi
Sistem ini adalah platform kolaborasi kerja untuk semua divisi startup. Isinya task management (board kanban), komunikasi tim, dokumen, jadwal, dan check-in rutin dalam satu tempat. Sistem berjalan sebagai web app dan desktop app (Windows, macOS, Linux) dari satu backend dan satu codebase frontend. Konsepnya mengacu pada Cicle; gambaran fitur Cicle diambil dari pengetahuan umum dan belum diverifikasi ke versi terbarunya.
Tujuan bisnis
• Menyatukan tugas, diskusi, dan file yang saat ini tersebar di WhatsApp, Trello, dan Google Drive.
• Memberi visibilitas progres dan beban kerja lintas divisi kepada manajemen.
• Mempercepat koordinasi antar-divisi lewat task request dan notifikasi real-time.
Dalam ruang lingkup: task management, chat, pengumuman, dokumen & file, jadwal, check-in, notifikasi, laporan, web app, desktop app.
Di luar ruang lingkup (versi 1): aplikasi mobile native, mode offline penuh dengan sinkronisasi, billing/multi-tenant SaaS, video call, time tracking & payroll.
Asumsi yang dipakai (perlu dikonfirmasi):
1.  Dipakai internal oleh satu perusahaan (single-tenant), bukan dijual sebagai SaaS.
2.  Jumlah user 50–500 dalam 2 tahun pertama.
3.  Bahasa antarmuka Indonesia, zona waktu utama WIB.
4.  Data di-host di server sendiri (VPS Ubuntu 24.04) dengan object storage terpisah.
2. Stakeholder & Role Pengguna
Akses diatur dengan lima role di level organisasi, ditambah role per project. Permission selalu dicek di backend, bukan hanya disembunyikan di UI.
Role
Siapa
Hak utama
Owner
Founder / CEO
Semua hak, termasuk transfer kepemilikan dan hapus organisasi
Admin
Ops / IT
Kelola user, divisi, pengaturan, audit log; tidak bisa menghapus organisasi
Division Lead
Kepala divisi
Kelola anggota dan project di divisinya, lihat laporan divisi
Member
Karyawan
Buat dan kerjakan task, chat, upload file di project yang diikuti
Guest
Freelancer / klien
Hanya project yang diundang, tidak bisa melihat daftar divisi lain
Role per project: Project Admin (atur kolom, anggota, arsip) dan Project Member. Project bisa bersifat publik (semua anggota divisi bisa melihat) atau privat (hanya anggota yang diundang).
Stakeholder lain: manajemen (konsumen laporan), tim IT/DevOps (operasional server), dan seluruh divisi pengguna (Engineering, Product, Marketing, Sales, HR, Finance, Operations).
3. Kebutuhan Fungsional
Ada 16 modul dengan total 50 kebutuhan. Sebanyak 24 di antaranya masuk MVP: auth, struktur organisasi, board, notifikasi, file, activity log, dan admin. Kode prioritas: MVP = wajib di rilis pertama, F2 = fase 2, F3 = fase 3.
ID
Modul
Kebutuhan
Prioritas
FR-01
Auth
Login email + password, verifikasi email, reset password
MVP
FR-02
Auth
Login Google (SSO) di web dan desktop
MVP
FR-03
Auth
Undang user via email atau link undangan berbatas waktu
MVP
FR-04
Auth
Daftar sesi aktif per device, logout dari device lain
MVP
FR-05
Organisasi
CRUD divisi; satu user bisa menjadi anggota banyak divisi
MVP
FR-06
Organisasi
CRUD project per divisi, publik atau privat
MVP
FR-07
Organisasi
Atur role organisasi dan role project
MVP
FR-08
Board
Kolom (list) bisa ditambah, diubah nama, diurutkan, diarsipkan
MVP
FR-09
Board
Card: judul, deskripsi rich-text, assignee (multi), due date, prioritas, label
MVP
FR-10
Board
Drag & drop card antar kolom dan antar urutan, tersinkron real-time
MVP
FR-11
Board
Checklist / subtask di dalam card
MVP
FR-12
Board
Komentar di card dengan mention @user dan lampiran
MVP
FR-13
Board
Arsip dan pulihkan card
MVP
FR-14
Board
View list/tabel dengan filter (assignee, label, due date, status)
MVP
FR-15
Board
Halaman My Tasks: semua task milik user lintas divisi
MVP
FR-16
Board
Template board per divisi (Engineering, HR Recruitment, Sales Pipeline)
F2
FR-17
Board
Task request antar divisi dengan status diterima / ditolak
F2
FR-18
Board
View kalender dan timeline untuk due date
F3
FR-19
Board
Custom field per project (teks, angka, tanggal, pilihan)
F3
FR-20
Board
Recurring task (harian, mingguan, bulanan)
F3
FR-21
Notifikasi
Notifikasi in-app real-time untuk assign, mention, komentar, due date
MVP
FR-22
Notifikasi
Email digest (langsung / harian / off) per user
MVP
FR-23
Notifikasi
Pengaturan notifikasi per user dan per project (mute)
MVP
FR-24
Notifikasi
Reminder otomatis H-1 dan saat task overdue
MVP
FR-25
Notifikasi
Notifikasi native desktop dan Web Push browser
F2
FR-26
Notifikasi
Notifikasi WhatsApp via WhatsApp Cloud API resmi (opsional)
F3
FR-27
File
Upload file ke card dan project, maksimal 100 MB per file
MVP
FR-28
File
Preview gambar dan PDF, download file lain
MVP
FR-29
Activity
Log semua perubahan per card dan project (siapa, apa, kapan)
MVP
FR-30
Activity
Audit log organisasi untuk Admin (login, perubahan role, hapus data)
F2
FR-31
Chat
Group chat per project dengan mention, reaksi, lampiran, reply
F2
FR-32
Chat
Private chat 1-on-1
F2
FR-33
Chat
Indikator online, sedang mengetik, dan status sudah dibaca
F2
FR-34
Chat
Edit dan hapus pesan sendiri
F2
FR-35
Blast
Pengumuman level perusahaan, divisi, atau project dengan komentar
F2
FR-36
Blast
Pin pengumuman penting
F2
FR-37
Docs & Files
Folder per project dan dokumen rich-text sederhana
F2
FR-38
Schedule
Event dengan peserta, lokasi atau link meeting, pengingat
F2
FR-39
Schedule
Sinkronisasi satu arah ke Google Calendar
F3
FR-40
Search
Pencarian global card, komentar, pesan, file berdasarkan nama
F2
FR-41
Check-in
Pertanyaan berulang terjadwal (misal daily standup 09.00)
F3
FR-42
Check-in
Rekap jawaban per hari dan per anggota
F3
FR-43
Report
Dashboard divisi: task selesai, overdue, beban kerja per orang
F3
FR-44
Report
Dashboard manajemen lintas divisi
F3
FR-45
Report
Ekspor laporan ke CSV
F3
FR-46
Integrasi
Webhook keluar untuk event task (dibuat, selesai)
F3
FR-47
Admin
Halaman admin: kelola user, nonaktifkan akun, reset sesi
MVP
FR-48
Admin
Saat user dinonaktifkan, task tetap ada dan bisa dipindahkan ke user lain
MVP
FR-49
Desktop
Aplikasi desktop dengan semua fitur web
F2
FR-50
Desktop
Auto-update aplikasi desktop
F2
4. Kebutuhan Platform: Web vs Desktop
Fitur bisnis di kedua platform identik karena memakai frontend yang sama. Yang berbeda hanya integrasi dengan sistem operasi. Perbedaan ini dibungkus dalam satu lapisan packages/platform, sehingga komponen UI tidak pernah memanggil API Tauri secara langsung.
Kebutuhan
Web app
Desktop app
Platform
Chrome, Edge, Firefox, Safari (2 versi terakhir)
Windows 10/11, macOS 12+, Ubuntu 22.04+
Instalasi
Tidak perlu
Installer .msi/.exe, .dmg, .AppImage/.deb
Penyimpanan sesi
Refresh token di httpOnly cookie
Refresh token di OS keychain
Login Google
Redirect biasa
Browser sistem + deep link taskapp://auth/callback dengan PKCE
Notifikasi saat app ditutup
Web Push (Service Worker)
App tetap jalan di system tray, notifikasi native
Badge jumlah notifikasi
Di judul tab
Di ikon dock / taskbar
Deep link ke card
URL biasa
taskapp://card/<id>, membuka jendela yang sudah ada (single instance)
Update
Otomatis setiap deploy
Auto-update dengan paket yang ditandatangani
Auto-start
Tidak ada
Opsional, diatur user
Kebutuhan tambahan akibat adanya desktop app
• API harus backward compatible, karena sebagian user desktop bisa tertinggal beberapa versi.
• Backend menyediakan minDesktopVersion; versi di bawahnya wajib update sebelum bisa dipakai.
• Event real-time (Socket.IO) diperlakukan sebagai API contract dan diberi tipe di packages/shared.
• Tampilan wajib diuji di tiga engine webview: WebView2 (Windows), WKWebView (macOS), WebKitGTK (Linux).
5. Kebutuhan Non-Fungsional
Target berikut dihitung untuk 500 user dengan sekitar 150 user online bersamaan. Semuanya bisa dicapai dengan satu server API dan satu server database, tanpa cluster.
ID
Aspek
Target
Cara ukur
NFR-01
Latensi API
p95 < 300 ms untuk endpoint baca, < 500 ms untuk tulis
Metrik HTTP (Prometheus / APM)
NFR-02
Load board
Board dengan 500 card tampil < 1,5 detik
Lighthouse / uji manual di koneksi 10 Mbps
NFR-03
Real-time
Perubahan sampai ke user lain < 1 detik
Uji 2 client bersamaan
NFR-04
Koneksi bersamaan
1.000 koneksi WebSocket per instance API
Load test (k6 / Artillery)
NFR-05
Ketersediaan
99,5% per bulan (± 3,6 jam downtime)
Uptime monitor
NFR-06
Backup
RPO ≤ 15 menit, RTO ≤ 4 jam
Uji restore setiap bulan
NFR-07
Retensi
Activity log 1 tahun, audit log 2 tahun, file yang dihapus 30 hari
Job pembersihan terjadwal
NFR-08
Ukuran desktop
Installer < 20 MB, RAM idle < 200 MB
Ukur di build rilis
NFR-09
Skalabilitas
API stateless, bisa ditambah instance tanpa ubah kode
Uji 2 instance di balik Nginx
NFR-10
Aksesibilitas
Navigasi keyboard untuk aksi utama, kontras WCAG AA
Audit axe
NFR-11
Observability
Log terstruktur (JSON), error tracking, health check
Sentry + /health
NFR-12
Maintainability
Coverage test ≥ 70% untuk modul auth, RBAC, dan board
CI
Angka RAM desktop berlaku untuk Tauri; Electron biasanya dua sampai tiga kali lebih besar.
6. Arsitektur & Tech Stack
Arsitekturnya modular monolith: satu API yang dibagi per modul di level kode, bukan microservices. Untuk tim kecil, microservices hanya menambah beban deployment dan konsistensi data tanpa manfaat sebanding. Modul tetap bisa dipisah nanti bila terbukti perlu.
Semua request dari web dan desktop melewati Cloudflare dan Nginx menuju API. Pekerjaan berat (email, reminder, check-in) diproses worker lewat antrean Redis. File diunggah langsung dari klien ke object storage memakai presigned URL yang diterbitkan API.
Lapisan
Pilihan
Alasan
Frontend
Vite + React + TypeScript + Tailwind
SPA bisa dipakai web dan desktop sekaligus; aplikasi di balik login tidak butuh SSR
State & data
TanStack Query + Zustand
Cache server state, optimistic update untuk drag & drop
Desktop
Tauri v2
Installer kecil, RAM rendah, plugin resmi untuk tray, notifikasi, updater, deep link
Backend
Node.js + Express + TypeScript
Satu bahasa dengan frontend, tipe dan skema zod dipakai bersama
Real-time
Socket.IO + Redis adapter
Room per project/channel/user, tetap jalan saat API lebih dari satu instance
Database
MySQL 8 + Prisma
Didukung penuh Prisma, kolom JSON untuk custom field, FULLTEXT index untuk pencarian, migrasi terkelola
Queue
BullMQ di Redis
Job terjadwal dan retry untuk email, reminder, check-in
Storage
Cloudflare R2 (S3-compatible)
Tanpa biaya egress, presigned URL
Monorepo
pnpm + Turborepo
apps/web, apps/desktop, apps/api, apps/worker, packages/ui, packages/shared, packages/platform, packages/api-client
Prinsip real-time: event dikirim setelah transaksi database commit; server memeriksa izin saat client join room; pesan chat membawa clientMessageId agar tidak dobel saat reconnect.
7. Desain Data
Data disimpan di PostgreSQL dengan 29 tabel inti. Hierarkinya: Organization → Division → Project → List → Card. Semua tabel memakai ID cuid, kolom createdAt/updatedAt, dan soft delete (archivedAt atau deletedAt) untuk data yang bisa dipulihkan.
Kelompok
Tabel
Relasi & catatan penting
Identitas
User, Session, Invitation
Session per device (deviceType, deviceName, lastUsedAt, revokedAt); refresh token disimpan sebagai hash
Organisasi
Organization, OrgMember, Division, DivisionMember
OrgMember menyimpan role organisasi; satu user bisa masuk banyak divisi
Project
Project, ProjectMember
isPrivate; ProjectMember menyimpan role project
Board
BoardList, Card, CardAssignee, Label, CardLabel, ChecklistItem
position memakai fractional index; index (listId, position), (userId) di CardAssignee, (dueDate)
Kolaborasi
Comment, Mention, Attachment
Attachment hanya menyimpan metadata + key object storage, bukan file-nya
Komunikasi
Channel, ChannelMember, Message
Channel bertipe PROJECT atau DIRECT; Message punya clientMessageId unik untuk mencegah duplikat
Lainnya
Blast, Event, EventAttendee, CheckIn, CheckInAnswer
Fase 2 dan 3
Sistem
Notification, ActivityLog, AuditLog
ActivityLog append-only: actorId, entityType, entityId, action, diff (JSONB)
Keputusan desain
• Fractional indexing untuk urutan card dan kolom. Pemindahan satu card hanya mengubah satu baris, bukan seluruh kolom.
• Activity log ditulis di transaksi yang sama dengan perubahan datanya, sehingga log tidak pernah berbeda dari data.
• Custom field (F3) disimpan di kolom JSONB customData pada Card, dengan definisi field di tabel terpisah per project.
• Index wajib sejak awal: semua foreign key, Card.dueDate, Notification(userId, readAt), Message(channelId, createdAt).
• Pencarian F2 memakai full-text search PostgreSQL (tsvector + GIN index). Pindah ke Meilisearch hanya jika performanya terbukti kurang.
8. Keamanan & Autentikasi
Risiko keamanan terbesar di aplikasi kolaborasi adalah kebocoran akses, misalnya user divisi lain bisa membaca project privat. Karena itu otorisasi dibuat terpusat dan diuji otomatis di setiap endpoint.
Autentikasi
• Password di-hash dengan argon2id. Login dibatasi 5 percobaan per 15 menit per akun dan per IP.
• Access token JWT berumur 15 menit dan hanya disimpan di memori client.
• Refresh token dirotasi setiap dipakai. Jika token lama dipakai ulang, seluruh sesi device tersebut dicabut (reuse detection).
• Google SSO memakai Authorization Code + PKCE di kedua platform.
• 2FA (TOTP) opsional untuk Owner dan Admin pada F2.
Otorisasi
• Satu middleware RBAC terpusat, dipanggil di setiap route dan setiap event Socket.IO.
• Saat join room real-time, server memeriksa ulang keanggotaan user. Room ID dari client tidak dipercaya begitu saja.
• Query selalu difilter berdasarkan keanggotaan, bukan hanya berdasarkan ID yang dikirim client (mencegah IDOR).
Data & file
• Semua trafik HTTPS/WSS (TLS 1.2+), HSTS aktif.
• File diunggah langsung ke object storage lewat presigned URL berumur 5 menit. Bucket tidak publik; download juga memakai signed URL.
• Validasi tipe dan ukuran file di server; nama file disanitasi.
• Input divalidasi dengan zod; rich-text disanitasi sebelum disimpan dan ditampilkan (cegah XSS).
• Secret hanya di environment variable atau secret manager, tidak pernah di repository.
Desktop
• Capability Tauri dibatasi seminimal mungkin (hanya plugin yang dipakai).
• Content Security Policy ketat; aplikasi tidak memuat URL remote ke dalam webview.
• Paket update ditandatangani; aplikasi menolak update dengan tanda tangan tidak valid.
Operasional: rate limiting global di Nginx dan per endpoint di API, header keamanan (Helmet), dependency scanning di CI (npm audit / Dependabot), serta audit log untuk aksi Admin.
9. Infrastruktur, Deployment & Distribusi
Untuk MVP cukup satu VPS aplikasi dan satu VPS database, keduanya Ubuntu 24.04 dan dijalankan dengan Docker Compose. Spesifikasi di bawah adalah titik awal yang wajar dan perlu disesuaikan setelah load test.
Komponen
Spesifikasi awal
Catatan
VPS aplikasi
4 vCPU, 8 GB RAM, 80 GB SSD
Nginx, API, worker, Redis
VPS database
2–4 vCPU, 8 GB RAM, 100 GB SSD
PostgreSQL 16, tidak diekspos ke internet
Object storage
Cloudflare R2 (atau S3 / MinIO)
Versioning aktif untuk file
DNS, CDN, WAF
Cloudflare
Proxy aktif untuk domain web dan API
Email
SMTP transactional (Resend / SES / Postmark)
Untuk undangan, reset password, digest
Monitoring
Uptime monitor + Sentry + log terpusat
Alert ke email atau Slack
Lingkungan: development (lokal, Docker Compose), staging (server terpisah, data dummy), dan production.
Pipeline CI/CD (GitHub Actions)
1.  Setiap pull request: lint, typecheck, unit test, integration test API dengan database test.
2.  Merge ke main: build image Docker, deploy otomatis ke staging, jalankan migrasi Prisma.
3.  Rilis tag v*: deploy ke production setelah persetujuan manual, dengan migrasi yang backward compatible.
4.  Rollback: image versi sebelumnya disimpan; migrasi destruktif dipecah menjadi dua rilis (expand lalu contract).
Backup
• PostgreSQL: WAL archiving untuk point-in-time recovery, ditambah dump harian ke object storage di lokasi berbeda. Retensi 30 hari.
• Uji restore ke staging setiap bulan; backup yang tidak pernah diuji dianggap tidak ada.
Distribusi desktop
• Build Windows, macOS, dan Linux lewat GitHub Actions matrix memakai tauri-apps/tauri-action.
• Code signing: sertifikat code signing Windows dan Apple Developer ID + notarization untuk macOS. Keduanya berbayar tahunan dan prosesnya perlu waktu, jadi diurus sebelum F2 dimulai.
• Paket dan manifest update di-host di object storage atau GitHub Releases. Private key penandatangan disimpan di GitHub Secrets.
• Kanal rilis beta untuk tim pilot dan stable untuk semua user.
10. Roadmap & Kriteria Penerimaan
Pengembangan dibagi menjadi empat fase. Setiap fase baru dimulai setelah gate sebelumnya terpenuhi. Durasi tiap fase belum ditetapkan karena bergantung pada jumlah developer (lihat pertanyaan terbuka).
Desktop app sengaja ditempatkan di Fase 2. Kodenya hampir sama dengan web, tetapi code signing dan auto-update baru layak dikerjakan setelah fitur web stabil.
Fase
Kriteria selesai (definition of done)
Fase 0
Monorepo berjalan; CI menjalankan lint, typecheck, test; staging bisa di-deploy otomatis; skema database MVP disetujui
MVP
Semua FR berprioritas MVP lolos uji; NFR-01 sampai NFR-03 terpenuhi; test otorisasi mencakup semua endpoint; satu divisi pilot memakai sistem selama 2 minggu tanpa bug kritis
Fase 2
Chat dan Blast dipakai menggantikan grup WA kerja di divisi pilot; desktop app lolos uji di Windows dan macOS, ditandatangani, dan auto-update teruji; uji restore backup berhasil
Fase 3
Dashboard dipakai manajemen dalam rapat rutin; semua divisi aktif; NFR-04 dan NFR-05 terpenuhi selama satu bulan
11. Risiko & Pertanyaan Terbuka
Risiko terbesar bukan teknis, melainkan adopsi: sistem gagal jika tim tetap berkoordinasi di WhatsApp. Risiko teknis terbesar adalah scope creep dan bug permission.
Risiko
Dampak
Mitigasi
Tim tidak pindah dari WA / Trello
Tinggi
Pilot di 1–2 divisi, import dari Trello, dukungan manajemen agar tugas resmi hanya di sistem
Scope creep (chat dikerjakan sebelum board stabil)
Tinggi
Kunci scope MVP; chat baru dimulai setelah kriteria MVP terpenuhi
Bug permission membocorkan project privat
Tinggi
Middleware RBAC terpusat + test otorisasi otomatis untuk setiap endpoint
Notifikasi berlebihan sehingga diabaikan
Sedang
Pengaturan notifikasi per user dan email digest sejak MVP
Rendering berbeda di webview tiap OS
Sedang
Uji drag & drop dan rich-text di 3 OS pada setiap rilis desktop
Code signing desktop terlambat
Sedang
Urus sertifikat Windows dan Apple Developer ID sebelum F2
User desktop memakai versi lama
Sedang
API backward compatible + minDesktopVersion
Kehilangan data
Tinggi
PITR +