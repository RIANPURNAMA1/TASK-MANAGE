# Workbase Agent — status implementasi & tinjauan keamanan

Dokumen ini mencatat **apa yang benar-benar dibangun dan diuji**, dan **apa yang belum**. Tidak ada
yang dinyatakan lulus tanpa benar-benar dijalankan (aturan playbook H14).

Tanggal: 2026-11-16. Playbook sumber: `prompt-workbase-agent-hermes.md`.

## 1. Status per prompt

| Prompt | Status | Catatan |
| --- | --- | --- |
| A1–A4 (prasyarat, tidak ada di repo) | **Dibuat versi minimal** | Skema, abstraksi LLM + tool registry, orchestrator, approval gate. Lihat bawah. |
| H1 Skema data | **Selesai** | Migrasi `20261116100000_workbase_agent`. Tanpa FK ke tabel inti kecuali `PersonalAgent → User` dan anak-anak langsung. |
| H2 Rencana, search, fetch | **Selesai** | `update_plan`, `web_search` (Brave/Tavily), `fetch_page`, `assertPublicUrl`, `validateCitations`. Format API Brave/Tavily ditulis dari pengetahuan, **belum diverifikasi ke dokumentasi/akun nyata**. |
| H3 Browser worker | **Belum** | Butuh Playwright + Chromium + egress proxy (Docker). Tidak ada Docker di mesin ini. |
| H4 Sandbox eksekusi kode | **Belum** | Butuh Docker. Sengaja tidak dibuat tanpa bisa menguji isolasinya. |
| H5 Konektor MCP | **Sebagian** | Hanya enkripsi AES-256-GCM (`@nexus/agent/crypto`) dan tabel `McpConnection`. Alur OAuth GitHub/Drive/Gmail dan klien MCP **belum** (butuh client id/secret). |
| H6 Memori | **Selesai (tanpa vektor)** | Scope, filter akses server-side, penyaring rahasia/instruksi, aturan PROPOSED/ACTIVE. Pencarian memakai **kecocokan kata kunci**, bukan embedding/Qdrant. |
| H7 Knowledge base | **Sebagian** | Teks/Markdown → potongan → pencarian kata kunci dengan filter scope. **PDF/DOCX, embedding, Qdrant belum.** |
| H8 Personal Agent | **Selesai** | Panel chat (Ctrl+J), izin = pemilik ∩ didelegasikan (dihitung ulang tiap tool call), konfirmasi Ya/Tidak, budget bulanan. |
| H9 Tugas terjadwal | **Selesai** | Bahasa natural → cron → pratinjau + konfirmasi; ticker 1 menit dalam proses API; klaim atomik. **Bukan BullMQ repeatable** (Redis tidak dipakai di sini). |
| H10 Skill | **Selesai** | Library, usulan, persetujuan, versi baru, statistik, refleksi manual (`/runs/:id/reflect`). Refleksi **tidak otomatis** setelah tiap run. Kemiripan memakai kata kunci, bukan embedding. |
| H11 PM Agent & sub-agent | **Sebagian (backend)** | Selesai: `list_team_agents`, `start_sub_run`, `wait_for_runs` (menunggu berbasis event), batas kedalaman 2 dan 6 anak per run, CRUD Team Agent + akun bot tanpa login, pemicu run oleh manusia, endpoint pohon run per kartu. **Belum:** UI (admin Team Agent, pohon sub-task di kartu). Roll-up biaya anak ke induk ada di kode tetapi belum dites. |
| H12 Agent di chat project (@mention) | **Sebagian** | Team Agent punya akun bot. `@Agent` di chat project memulai run (`chat-mention.service.ts`): hanya anggota non-guest yang bisa menulis, bot tidak memicu bot, konteks maks 30 pesan dari kanal itu saja (dibungkus data tak tepercaya), balasan diposting bot sebagai reply. Tombol "Jadikan task" di balasan agent (`messageToTask`): kartu dibuat dengan izin orang yang menekan, guest/non-anggota ditolak, teks agent di-escape. **Belum**: status "sedang bekerja…" yang bisa diklik dan streaming Socket.IO (balasan muncul utuh setelah run selesai). Daftar @mention memakai anggota project, jadi agent muncul bila bot-nya anggota project; belum diuji manual di browser. |
| H13 Dashboard AI | **Sebagian** | Biaya/hari/pengguna, keberhasilan, tool terpopuler, skill, ekspor CSV, tombol "hentikan semua run", **alert** (biaya harian > `AGENT_DAILY_COST_ALERT_USD` default 10, lonjakan run gagal, budget > 80%). Logger per run membawa `runId`. **Trace id lintas-service belum** (service lain belum ada) dan alert belum tampil di UI. |
| H14 Hardening | **Sebagian** | Lihat bagian 3 dan 4. |

Penyedia LLM: Claude, GPT, Gemini, Groq lewat REST `fetch` (tanpa SDK). Bentuk request/response
**diuji dengan mock**, **bukan** dengan panggilan ke penyedia sungguhan (tidak ada API key).

## 2. Yang diuji dan hasilnya

`npm test`: shared 14, agent 54, web 10, api 102 (19 tes kebijakan agent + 14 tes delegasi/Team Agent/alert) — semua lulus (2026-11-17, MySQL lokal).

- **SSRF**: `localhost`, `127.0.0.1`, `10.x`, `172.16.x`, `192.168.x`, `169.254.169.254`, `[::1]`,
  `[::ffff:10.0.0.1]`, `fe80::`, `fd00::`, CGNAT, `0.0.0.0`, bentuk desimal/heks IP, `*.internal`,
  domain yang resolve ke IP privat (termasuk campuran publik+privat); redirect publik→privat ditolak
  **sebelum** permintaan kedua dikirim; `guardedLookup` menolak koneksi ke IP privat (DNS rebinding).
- **Kebijakan agent (DB nyata, organisasi uji terisolasi)**: agent hanya membaca task pemiliknya;
  tidak bisa membaca proyek yang tidak diakses pemilik dan tidak membocorkan isinya; aksi tulis
  menunggu persetujuan; hanya pemilik yang bisa menyetujui; satu persetujuan hanya dieksekusi sekali;
  akses yang dicabut setelah usulan tetap memblokir eksekusi; tool yang tidak didelegasikan tidak
  ditawarkan dan ditolak; guest tidak pernah bisa menulis; pemilik yang dinonaktifkan memutus akses
  agent seketika; input tidak valid / tool tak dikenal ditolak; budget habis menghentikan run; kill
  switch menghentikan run berjalan; sitasi URL yang tak pernah dibuka → `NEEDS_REVIEW`.
- **Memori/knowledge**: memori pribadi tidak terbaca user lain; usulan agent untuk PROJECT/DIVISION/ORG
  tetap `PROPOSED` dan tidak ikut di-recall; user biasa tidak bisa menyetujui; orang luar tidak bisa
  menempelkan memori ke proyek yang tak terlihat; rahasia (API key, password, nomor kartu Luhn, NIK)
  dan instruksi tersembunyi ditolak; pencarian knowledge hanya dari scope yang boleh dibaca.
- **Skill**: hanya `APPROVED` yang dimuat ke prompt (usulan & nonaktif tidak pernah).
- **Jadwal**: minimal 1 jam; cron tidak valid ditolak; jadwal jatuh tempo berjalan tepat sekali;
  jadwal dijeda tidak berjalan.
- **Kripto**: AES-256-GCM round-trip, IV unik, deteksi pemalsuan, kunci salah/pendek ditolak.

- **Delegasi (H11)**: sub-run tidak bisa membuat sub-run; maksimal 6 anak; agent tak dikenal/nonaktif/dirinya sendiri ditolak; tanpa izin `agents:delegate` ditolak; di autonomy 1 delegasi menunggu konfirmasi dan anak tidak dimulai; `wait_for_runs` hanya mengembalikan anak milik run itu dan membungkus hasil sebagai data tak tepercaya; run anak berstatus depth 1 dengan pemilik manusia yang sama; hanya anggota proyek non-tamu yang bisa memicu Team Agent (tamu, meski anggota proyek, ditolak); hanya admin yang membuat/mengubah Team Agent; run Personal Agent orang lain tidak muncul di pohon run kartu. Alert: fungsi `computeAlerts`.

## 3. Yang BELUM diuji (jangan dianggap aman)

1. **Perilaku model sungguhan di bawah serangan prompt injection.** Tes kita memakai model skrip:
   membuktikan *penegakan di sisi server* (konfirmasi, izin, scope), bukan bahwa model tidak akan
   *mencoba* mengikuti instruksi berbahaya. Penahan utamanya: output tool dibungkus `<tool_output>`,
   aturan di system prompt, dan fakta bahwa tulis/eksternal selalu butuh konfirmasi manusia.
   Fixture berbahaya (halaman web tersembunyi, dokumen KB, email, isi kartu, chat) **belum dibuat
   dan dijalankan terhadap model nyata**.
2. **Panggilan ke keempat penyedia LLM dan penyedia pencarian** — belum ada API key.
3. **Egress proxy / browser worker / sandbox** — belum ada (H3, H4). `fetch_page` hanya dilindungi
   di level aplikasi (validasi + `guardedLookup`); **tanpa proxy jaringan** — jangan menaruh API di
   jaringan dengan akses ke layanan internal sensitif tanpa aturan firewall egress.
4. **Beban & konkurensi**: run berjalan dalam proses API (satu instance); `AbortController` kill
   switch hanya menjangkau run di instance yang sama (tombol "hentikan semua" menandai sisanya).
5. **Evaluasi kualitas 15 tugas contoh** (`docs/agent-eval/hermes/`) — **tidak dijalankan**; lihat
   `results.md`.
6. **Team Agent**: API admin dan tes kebijakan ada, tetapi **belum ada UI**. Alur PM penuh (induk menunggu anak yang benar-benar berjalan lalu merangkum) hanya dites sebagian: `wait_for_runs` diuji dengan anak yang sudah selesai, bukan menunggu anak yang sedang berjalan. Delegasi dari Personal Agent memberi anak hak Team Agent (bukan hak pemilik); proteksinya adalah konfirmasi Ya/Tidak dan tamu tidak boleh. Perlu keputusan kebijakan apakah itu cukup.
7. **GitHub (H5)**: izin `github:read/write` dan skema token ada di `shared`, tetapi tool dan koneksinya **belum dibuat**; izin itu belum berfungsi apa pun.

## 4. Keputusan desain yang perlu Anda ketahui

- **Biaya adalah perkiraan.** Dihitung dari token × harga. Harga bawaan hanyalah tebakan per
  penyedia; isi `AGENT_PRICING_JSON` dengan harga resmi tiap model sebelum mengandalkan budget.
- **Confirm-then-execute.** Aksi tulis tidak menjeda loop: model diberi tahu "menunggu konfirmasi",
  run selesai, dan saat pemilik menekan *Ya* tool dijalankan ulang dengan izin pemilik **saat itu**.
- **Izin dihitung per panggilan.** Mencabut akses atau menonaktifkan pengguna berlaku seketika.
- **Run yang terputus restart server** ditandai `FAILED` saat boot.
- Pesan chat dibatasi 20/menit per pengguna; pratinjau jadwal & refleksi 10/menit.

## 5. Sebelum dipakai di produksi

- Isi `AGENT_PRICING_JSON`, set budget per pengguna, uji kill switch di staging.
- Verifikasi format API Brave/Tavily dan nama model terhadap dokumentasi penyedia terkini.
- Tetapkan kebijakan data: apa yang boleh dikirim ke penyedia LLM (pesan pengguna dan isi
  task/kartu yang dibaca tool **dikirim ke penyedia pihak ketiga**).
- Jalankan evaluasi injeksi dengan model nyata sebelum membuka ke semua divisi.
