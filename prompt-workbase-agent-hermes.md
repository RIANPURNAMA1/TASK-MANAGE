# Playbook Prompt Claude Code — Workbase Agent (ala Hermes)

Playbook ini menambahkan kemampuan ala Hermes Agent ke Mendunia Workbase: agent yang
bisa browsing, menjalankan kode di sandbox, terhubung ke tools eksternal (MCP), punya
memori, belajar skill, bekerja terjadwal, memecah tugas ke sub-agent, dan bisa diajak
bicara langsung lewat kolom chat di dalam Workbase (tanpa Telegram, WhatsApp, atau Slack).

Ada dua jenis agent:

- **Team Agent**: "karyawan AI" per divisi, di-assign ke card, izin diatur Admin.
- **Personal Agent**: asisten pribadi tiap karyawan, izinnya tidak pernah melebihi
  izin pemiliknya, memorinya privat.

---

## Prasyarat

Playbook ini **melanjutkan** `prompt-ai-agent-artifact.md`. Sebelum mulai, prompt
berikut dari playbook itu harus sudah selesai:

- **A1** Skema data agent & artifact
- **A2** LLM provider abstraction & tool registry
- **A3** Orchestrator (run loop, step log, budget, kill switch)
- **A4** Approval gate & tingkat otonomi

A5–A11 (artifact dan render) boleh dikerjakan paralel atau sesudahnya.

## Cara Pakai

1. Tambahkan bagian **CLAUDE.md** di bawah ke `CLAUDE.md` root repo.
2. Jalankan prompt **H1 → H14 berurutan**, satu prompt per sesi Claude Code.
3. Setiap prompt: rencana → review → setujui → eksekusi → verifikasi sendiri → commit.
4. Jangan lanjut sebelum kriteria "Selesai jika" terpenuhi.

### Urutan & fase

| Prompt | Isi | Fase |
| --- | --- | --- |
| H1 | Skema data tambahan | AG-1 |
| H2 | Rencana → checklist, web search, fetch halaman, validasi sumber | AG-1 |
| H3 | Browser worker (Playwright) + egress proxy | AG-2 |
| H4 | Sandbox pool untuk eksekusi kode | AG-2 |
| H5 | Konektor MCP per organisasi | AG-2 |
| H6 | Memori bertingkat | AG-2 |
| H7 | Knowledge base (RAG + Qdrant) | AG-2 |
| H8 | Personal Agent (chat in-app) | AG-2 |
| H9 | Tugas terjadwal | AG-3 |
| H10 | Skill yang dipelajari agent | AG-3 |
| H11 | PM Agent & sub-agent | AG-3 |
| H12 | Agent di kolom chat sistem (@mention di chat project) | AG-3 |
| H13 | Dashboard AI & observability | AG-3 |
| H14 | Hardening keamanan & evaluasi | Semua |

---

## Tambahan untuk CLAUDE.md

```markdown
## Workbase Agent (fitur ala Hermes)
- Service tambahan:
  - apps/browser-worker: Playwright + Chromium, hanya keluar lewat egress proxy
  - apps/sandbox-manager: membuat/menghapus container sandbox per run
  - Qdrant: vector store untuk memori & knowledge base
- Dua jenis agent:
  - Team Agent: izin RBAC sendiri.
  - Personal Agent: izin = irisan (izin pemilik ∩ izin yang didelegasikan).
    TIDAK PERNAH melebihi izin pemilik.
- Semua URL yang dibuka agent wajib lewat assertPublicUrl (cek IP setelah DNS resolve)
  DAN egress proxy di level jaringan. Blokir semua range IP privat/loopback/link-local.
- Sandbox: tanpa akses jaringan secara default, batas CPU/RAM/disk/waktu, dihapus
  setelah run selesai. Jangan pernah mount Docker socket ke dalam sandbox.
- Memori & knowledge base: filter akses (orgId + scope) WAJIB diterapkan di server
  saat query Qdrant. Jangan mengandalkan LLM untuk menyaring.
- Memori dan skill buatan agent tidak aktif otomatis tanpa aturan yang jelas
  (lihat H6 dan H10). Semua bisa dilihat dan dihapus manusia.
- Interaksi dengan agent HANYA lewat kolom chat di dalam Workbase (web & desktop).
  Tidak ada integrasi Telegram, WhatsApp, atau Slack.
- Token OAuth konektor MCP dienkripsi at-rest (AES-256-GCM, kunci dari env/KMS).
- Setiap klaim fakta di laporan agent harus punya sumber yang benar-benar dibuka
  dalam run tersebut (tercatat di AgentStep).
- Zona waktu default: Asia/Jakarta. Simpan waktu di DB dalam UTC.
```

---

## H1 — Skema Data Tambahan

```
Baca CLAUDE.md (bagian Workbase Agent) dan schema Prisma yang sudah ada dari A1.

Tugas: tambahkan model Prisma (MySQL 8):

- PersonalAgent: id, userId (unik), model, delegatedPermissions (Json: daftar
  permission yang diizinkan pemilik), monthlyBudgetUsd, isActive, timestamps
- AgentMemory: id, orgId, scope (USER, PROJECT, DIVISION, ORG), scopeId,
  content (Text), source (MANUAL, AGENT_PROPOSED), status (PROPOSED, ACTIVE,
  ARCHIVED), sourceRunId?, vectorId?, lastUsedAt?, createdById?, timestamps
- KnowledgeDoc: id, orgId, scope, scopeId, title, fileKey, mimeType,
  status (UPLOADED, INDEXING, READY, FAILED), chunkCount, error?, uploadedById
- KnowledgeChunk: id, docId, seq, text (Text), vectorId, tokenCount
- AgentSchedule: id, orgId, agentId? atau personalAgentId?, createdById,
  naturalText, cronExpr, timezone (default Asia/Jakarta), instruction (Text),
  targetCardId?, targetProjectId?, isActive, lastRunAt?, nextRunAt?
- AgentConversation: id, type (PERSONAL, PROJECT_CHAT), personalAgentId?,
  projectId?, title?, timestamps
- AgentMessage: id, conversationId, role (USER, AGENT, SYSTEM), content (Text),
  runId?, createdAt
- SkillUsage: id, skillId, runId, outcome (SUCCESS, FAILED, REVISED), createdAt
- McpConnection: id, orgId, provider (GITHUB, GOOGLE_DRIVE, GMAIL, ...),
  encryptedCredentials (Text), scopes (Json), status, connectedById, timestamps
- Ubah AgentRun: tambah personalAgentId?, parentRunId? (untuk sub-agent),
  conversationId?, scheduleId?
- Ubah ChecklistItem: tambah agentKey? dan createdByAgentId?, unik (cardId, agentKey)

Index yang dibutuhkan: AgentMemory(orgId, scope, scopeId, status),
AgentSchedule(isActive, nextRunAt), AgentRun(parentRunId), SkillUsage(skillId).

Tampilkan schema + alasan relasi dulu. Jangan jalankan migrasi sebelum saya setujui.
Selesai jika: migrasi berjalan di lokal, typecheck lolos.
```

---

## H2 — Rencana, Web Search, Fetch Halaman

```
Tugas: tools riset dasar untuk agent.

1. Tool `update_plan` (risk internal_write):
   - input: steps[{ key, title, status: todo|doing|done|skipped, note? }], 1–15 langkah
   - upsert ChecklistItem berdasarkan (cardId, agentKey); item buatan manusia tidak disentuh
   - activity log + event real-time setelah commit
   - orchestrator: wajibkan agent memanggil update_plan di awal run yang punya cardId
2. packages/agent-tools/src/web/url-guard.ts:
   - assertPublicUrl(url): hanya http/https, resolve DNS (all addresses), tolak jika
     ada IP di range privat/loopback/link-local/unique-local/CGNAT/reserved
     (pakai ipaddr.js, normalisasi IPv4-mapped IPv6)
3. Tool `web_search` (risk read):
   - provider abstraction (provider dipilih via env; cek dokumentasi resmi API-nya)
   - output: [{ title, url, snippet }], maksimal 10 hasil
4. Tool `fetch_page` (risk read):
   - assertPublicUrl sebelum request DAN untuk setiap redirect (ikuti redirect manual,
     maksimal 5)
   - timeout 15 detik, ukuran maksimal 3 MB, hanya content-type text/html atau text/plain
   - ekstrak konten utama (@mozilla/readability + jsdom), potong ke maksimal ~8.000 token
   - output dibungkus <tool_output source="url">…</tool_output>
5. Validasi sumber:
   - fungsi validateCitations(runId, text): setiap URL yang dikutip di hasil akhir
     harus ada di AgentStep fetch_page/browser_open run itu
   - jika ada URL yang tidak pernah dibuka → run ditandai NEEDS_REVIEW dengan peringatan
6. Batas per run (konfigurasi): maksimal 15 search, 20 fetch.

Test wajib:
- assertPublicUrl menolak: localhost, 127.0.0.1, 10.x, 172.16.x, 192.168.x,
  169.254.169.254, [::1], domain yang di-resolve ke IP privat (mock DNS)
- redirect dari URL publik ke IP privat ditolak
- validateCitations mendeteksi URL karangan
```

---

## H3 — Browser Worker

```
Tugas: apps/browser-worker untuk interaksi halaman penuh.

1. Arsitektur:
   - worker konsumsi antrean `browser-sessions`; satu BrowserContext Playwright per run
     (tanpa cookie/sesi bersama antar run)
   - seluruh trafik browser lewat egress proxy (container terpisah, misalnya Squid
     atau proxy Node sederhana) yang menolak IP privat setelah DNS resolve
   - docker-compose: browser-worker hanya punya network ke proxy, bukan ke DB/Redis
     internal (komunikasi hasil lewat antrean/API internal yang dibatasi)
2. Tools (risk read), dieksekusi lewat RPC ke worker:
   browser_open(url), browser_click(selector | text), browser_type(selector, text),
   browser_scroll(direction, amount), browser_screenshot(fullPage?, selector?),
   browser_extract(selector?) → teks
   - setelah setiap aksi kembalikan ringkasan halaman: judul, URL, daftar elemen
     interaktif terlihat (dari accessibility tree, dibatasi), bukan HTML mentah
3. Screenshot disimpan sebagai Asset (license: 'reference-internal', source: URL)
   dan bisa dilampirkan ke card.
4. Batas: maksimal 20 halaman per run, 60 detik per aksi, sesi ditutup otomatis
   setelah 15 menit idle atau run selesai.
5. Tidak boleh: mengisi form login, mengunduh file executable, membuka skema
   selain http/https.
6. Event real-time: screenshot terbaru dikirim ke timeline card (live view sederhana).

Selesai jika: agent bisa membuka 3 situs publik, screenshot, dan ringkasan
terlampir di card; uji bahwa halaman yang redirect ke http://169.254.169.254
diblokir oleh proxy (bukan hanya oleh kode).
```

---

## H4 — Sandbox Pool untuk Eksekusi Kode

```
Tugas: apps/sandbox-manager + tools eksekusi.

1. Sandbox:
   - container Docker per run dari image dasar (Node 20 + Python 3 + git), user non-root
   - default TANPA jaringan (--network none); mode "network: allowlist" hanya untuk
     tool yang butuh (mis. git clone dari GitHub) lewat egress proxy
   - batas: 1 vCPU, 1 GB RAM, 2 GB disk, maksimal 30 menit per run
   - filesystem: hanya /workspace yang bisa ditulis; read-only root fs jika memungkinkan
   - JANGAN mount Docker socket; sandbox-manager berkomunikasi ke Docker daemon,
     sandbox tidak
   - container dihapus saat run selesai/gagal/dibatalkan; job pembersih untuk
     container yatim
2. Tools:
   - sandbox_exec(command, timeoutSec) → stdout/stderr (dipotong), exitCode
     (risk internal_write; tetap di dalam container)
   - sandbox_write_file(path, content), sandbox_read_file(path) — path wajib di
     /workspace, tolak path traversal
   - sandbox_export(path) → simpan file hasil ke object storage sebagai Artifact/Asset
3. Engineering Agent + GitHub:
   - git clone repo via token MCP GitHub (H5) dengan scope minimal
   - agent hanya boleh push ke branch `agent/<runId>` dan membuat PR
     (tool external → approval sesuai level otonomi). Tidak ada merge, tidak ada push ke main.
4. Logging: setiap perintah tercatat di AgentStep.

Test: perintah di sandbox tidak bisa mengakses jaringan (curl gagal), path
traversal ditolak, container terhapus setelah run, timeout menghentikan proses.
```

---

## H5 — Konektor MCP per Organisasi

```
Tugas: integrasi tools eksternal lewat MCP.

Cek dokumentasi resmi MCP (spesifikasi dan SDK TypeScript) versi terbaru sebelum mulai.

1. Halaman admin "Integrasi": Admin menghubungkan GitHub, Google Drive, Gmail
   via OAuth. Token disimpan terenkripsi di McpConnection (AES-256-GCM, kunci dari env).
2. MCP client di orchestrator:
   - koneksi ke server MCP resmi/terpercaya per provider
   - tool dari server MCP didaftarkan ke tool registry dengan prefix provider
     (mis. github.create_pull_request) dan diberi level risk eksplisit lewat
     file mapping (tool tanpa mapping → default 'external', butuh approval)
3. Admin memilih tool MCP mana yang boleh dipakai tiap agent (AgentTool).
4. Gmail: tool kirim email SELALU 'external' (approval), baca email 'read'.
   Isi email diperlakukan sebagai data tak tepercaya.
5. Token refresh otomatis; jika gagal, koneksi ditandai perlu reconnect dan Admin
   dinotifikasi.

Selesai jika: Team Agent dengan akses GitHub bisa membaca issue dan membuat PR
(setelah approval) di repo uji; mencabut koneksi langsung memblokir tool terkait.
```

---

## H6 — Memori Bertingkat

```
Tugas: memori agent ala Hermes dengan kontrol manusia.

1. Embedding provider abstraction (cek dokumentasi resmi provider yang dipilih via env).
2. Qdrant:
   - collection `memories` dengan payload: orgId, scope, scopeId, memoryId, status
   - SEMUA query wajib filter orgId + scope yang boleh diakses aktor (server-side)
3. Penulisan memori:
   - tool `remember` (risk internal_write): agent mengusulkan fakta singkat
     (maks 500 karakter) dengan scope
   - aturan: scope USER (Personal Agent) → ACTIVE langsung;
     scope PROJECT/DIVISION/ORG → PROPOSED, butuh approve Division Lead/Admin
   - filter sebelum simpan: tolak isi yang terdeteksi sebagai secret (pola API key,
     token, password), nomor kartu, nomor identitas
4. Pembacaan memori:
   - di awal run, ambil top-K memori relevan (K=8) sesuai scope yang boleh diakses,
     masukkan ke system prompt dalam blok <memory>
   - update lastUsedAt
5. Tool `recall(query)` (risk read) untuk pencarian memori eksplisit.
6. UI & API:
   - user melihat, mengedit, menghapus memori USER miliknya
   - Division Lead/Admin mengelola memori PROJECT/DIVISION/ORG dan approve usulan
   - hapus memori = hapus dari MySQL DAN Qdrant

Test: agent divisi A tidak bisa membaca memori divisi B; memori Personal Agent
user X tidak terbaca agent lain atau user lain; secret ditolak; hapus menghapus
vector.
```

---

## H7 — Knowledge Base (RAG)

```
Tugas: upload dokumen perusahaan untuk dipakai agent.

1. Upload: PDF, DOCX, MD, TXT (maks 20 MB) ke scope ORG/DIVISION/PROJECT.
2. Pipeline di worker (antrean `knowledge-index`):
   - ekstraksi teks (PDF: pdf-parse atau setara; DOCX: mammoth)
   - chunking ~800 token dengan overlap ~100, simpan KnowledgeChunk
   - embedding → Qdrant collection `knowledge` dengan payload orgId, scope, scopeId, docId
   - status UPLOADED → INDEXING → READY / FAILED
3. Tool `search_knowledge(query, topK?)` (risk read):
   - filter akses server-side sesuai izin agent/pemilik Personal Agent
   - output: potongan teks + judul dokumen + docId (untuk sitasi)
4. Hapus/ganti dokumen menghapus seluruh chunk & vector lama.
5. UI: daftar dokumen per scope, status indexing, tombol reindex.

Selesai jika: agent menjawab pertanyaan dari SOP yang diunggah dengan menyebut
dokumen sumber, dan tidak bisa mengakses dokumen dari scope yang tidak diizinkan.
```

---

## H8 — Personal Agent

```
Tugas: asisten pribadi untuk setiap user, lewat chat in-app.

1. Aktivasi: user mengaktifkan Personal Agent di Pengaturan, memilih permission
   yang didelegasikan (default: baca task sendiri, buat draft card, komentar).
2. Izin efektif = izin user saat ini ∩ delegatedPermissions. Hitung ulang SETIAP
   tool call (jika izin user dicabut, agent ikut kehilangan akses seketika).
3. Chat in-app:
   - panel chat Personal Agent (sidebar kanan aplikasi), riwayat di
     AgentConversation/AgentMessage
   - setiap pesan user memicu AgentRun dengan conversationId
   - streaming jawaban ke UI lewat Socket.IO
4. Tools khusus personal:
   - list_my_tasks(filter: overdue | today | this_week | by_project)
   - summarize_project(projectId)
   - create_card_draft(projectId, title, description) → card berstatus draft yang
     harus dikonfirmasi user
   - plus web_search, fetch_page, search_knowledge, recall, remember (scope USER)
5. Aksi atas nama user yang mengubah data orang lain (assign ke orang lain,
   komentar di card tim) → minta konfirmasi user di chat sebelum dieksekusi.
6. Budget Personal Agent per user per bulan.

Selesai jika: "apa saja task saya yang overdue?" dijawab akurat; agent tidak bisa
membuka project yang user sendiri tidak punya akses; mencabut akses user ke project
langsung berlaku untuk agent.
```

---

## H9 — Tugas Terjadwal

```
Tugas: penjadwalan berbahasa natural.

1. Input natural ("setiap Senin jam 8 pagi ringkas progres divisi Marketing"):
   - LLM mengubah ke { cronExpr, timezone, instruction, target } (schema zod)
   - validasi cron (library cron-parser), tampilkan ke user dalam bahasa manusia +
     3 jadwal berikutnya, user WAJIB konfirmasi sebelum disimpan
2. Eksekusi: BullMQ repeatable job per AgentSchedule; setiap trigger membuat AgentRun
   dengan scheduleId; hasil dikirim ke target (card, chat project, atau chat
   Personal Agent).
3. Batas: frekuensi minimum 1 jam; maksimal 20 jadwal aktif per user, 100 per org.
4. Run terjadwal ikut budget guard; jika budget habis, jadwal dijeda + notifikasi.
5. UI: daftar jadwal (milik saya / divisi), pause, edit, hapus, riwayat run.
6. Sinkronisasi: saat schedule diubah/dihapus, repeatable job lama dihapus
   (hindari job yatim). Tambahkan job rekonsiliasi harian.

Test: parsing berbagai kalimat (mock LLM), zona waktu Asia/Jakarta benar,
jadwal dihapus tidak berjalan lagi, batas frekuensi ditegakkan.
```

---

## H10 — Skill yang Dipelajari Agent

```
Tugas: agent mengusulkan skill dari pengalaman (pola Hermes) dengan approval manusia.

1. Refleksi: setelah run berstatus COMPLETED dan di-approve manusia, orchestrator
   menjalankan langkah refleksi (panggilan LLM terpisah):
   - apakah run ini menghasilkan prosedur yang bisa dipakai ulang?
   - jika ya → AgentSkill PROPOSED: name, description (kapan dipakai),
     instructions (langkah, kriteria kualitas, kesalahan yang perlu dihindari)
   - maksimal 1 usulan per run; tidak mengusulkan jika mirip skill yang sudah ada
     (cek kemiripan via embedding)
2. Approval: Division Lead melihat usulan + run asalnya, bisa edit lalu approve.
3. Pemakaian:
   - di awal run, ambil skill APPROVED paling relevan (embedding description vs
     instruksi), maksimal 3, masukkan ke prompt dalam blok <skill>
   - catat SkillUsage dengan outcome (SUCCESS / FAILED / REVISED berdasarkan hasil review)
4. Perbaikan skill: jika skill sering REVISED, agent boleh mengusulkan versi baru
   (PROPOSED), versi lama tetap aktif sampai versi baru di-approve.
5. UI: library skill per divisi, statistik keberhasilan, nonaktifkan skill.

Test: refleksi tidak berjalan untuk run gagal/ditolak; skill PROPOSED tidak
pernah dimuat ke prompt; statistik SkillUsage benar.
```

---

## H11 — PM Agent & Sub-Agent

```
Tugas: PM Agent yang memecah goal menjadi beberapa card dan mengoordinasikan agent lain.

1. Tool untuk PM Agent:
   - create_card(projectId, listId, title, description, assignee: userId | agentId,
     dueDate?) — risk internal_write; di L1 hasilnya draft yang harus dikonfirmasi
   - start_sub_run(cardId, agentId, instruction) → AgentRun anak dengan parentRunId
   - wait_for_runs(runIds, timeoutMin) → status & ringkasan hasil
2. Orchestrator:
   - run induk berstatus WAITING saat menunggu anak; dibangunkan oleh event
     selesai (jangan polling ketat)
   - batas: kedalaman 2 (induk → anak, anak tidak boleh membuat cucu), maksimal
     6 anak per run induk
   - budget anak dihitung juga ke budget induk
3. Hasil akhir PM Agent: komentar ringkasan di card induk berisi status setiap
   card anak + link artifact.
4. UI: card induk menampilkan pohon sub-task dan status setiap run anak.

Selesai jika: goal "siapkan kampanye akhir tahun" menghasilkan card riset, konten,
dan poster yang dikerjakan agent berbeda, dan card induk merangkum hasilnya.
```

---

## H12 — Agent di Kolom Chat Sistem

```
Tugas: semua interaksi dengan agent dilakukan lewat kolom chat di dalam Workbase
(web & desktop). TIDAK ada integrasi Telegram, WhatsApp, atau Slack.

1. Chat Personal Agent (lanjutan H8): panel chat di sidebar kanan yang bisa dibuka
   dari halaman mana saja (shortcut Ctrl/Cmd+J); riwayat percakapan bisa dicari.
2. Team Agent di chat project:
   - mengetik @NamaAgent di group chat project membuat AgentRun dengan konteks
     pesan terakhir (maksimal 30 pesan) dan project tersebut
   - agent membalas di thread pesan itu; pekerjaan panjang tampil sebagai status
     "sedang bekerja…" yang bisa diklik untuk membuka timeline run
   - hanya anggota project yang bisa memicu agent; agent memakai izinnya sendiri
3. Dari chat ke card: tombol "Jadikan task" pada balasan agent membuat card draft
   dengan agent sebagai assignee.
4. Konfirmasi & approval:
   - konfirmasi ringan (Personal Agent) tampil sebagai tombol Ya/Tidak di chat
   - approval aksi eksternal tetap lewat Approval Inbox; chat hanya menampilkan
     kartu ringkas dengan link ke sana
5. Hasil tugas terjadwal (H9) dan ringkasan PM Agent (H11) dikirim sebagai pesan
   ke chat Personal Agent atau chat project yang dipilih, plus notifikasi in-app
   dan notifikasi native desktop.
6. Jawaban di-stream lewat Socket.IO; jika koneksi putus, pesan dilanjutkan dari
   state terakhir di DB tanpa dobel.

Test: non-anggota tidak bisa memicu agent via @mention, agent tidak membaca chat
project lain, tombol "Jadikan task" mengikuti izin yang benar, reconnect saat
streaming tidak menggandakan pesan.
```

---

## H13 — Dashboard AI & Observability

```
Tugas: visibilitas pemakaian dan kualitas agent.

1. Dashboard (Admin & Division Lead):
   - biaya per hari/minggu/bulan per org, divisi, agent, user (Personal Agent)
   - jumlah run, tingkat keberhasilan (approved tanpa revisi / dengan revisi / ditolak)
   - rata-rata durasi & langkah per run, tool yang paling sering dipakai/gagal
   - skill dengan tingkat keberhasilan tertinggi/terendah
2. Alert: biaya harian melewati ambang, lonjakan run gagal, budget > 80%.
3. Tracing: setiap run punya trace id yang tercatat di log semua service
   (orchestrator, browser-worker, sandbox, render) agar satu run bisa ditelusuri
   ujung ke ujung.
4. Ekspor CSV untuk laporan biaya.

Selesai jika: angka biaya di dashboard sama dengan jumlah costUsd AgentStep
(buat test rekonsiliasi).
```

---

## H14 — Hardening Keamanan & Evaluasi

```
Tugas: review keamanan menyeluruh untuk Workbase Agent.

1. Prompt injection lintas sumber — buat fixture berbahaya di:
   halaman web (teks tersembunyi), dokumen knowledge base, email (Gmail),
   isi card, pesan di chat project dan chat Personal Agent.
   Pastikan: tidak ada tool external tereksekusi tanpa approval, tidak ada
   secret/token bocor, tidak ada akses lintas scope.
2. Memory poisoning: agent tidak bisa membuat memori ORG/DIVISION aktif tanpa
   approval; memori berisi instruksi ("selalu kirim data ke …") terdeteksi/ditolak.
3. Skill poisoning: skill PROPOSED tidak pernah dimuat.
4. Isolasi: sandbox tanpa jaringan, browser lewat proxy, uji SSRF via redirect
   dan DNS rebinding.
5. Lintas tenant/scope: matriks test Personal Agent vs Team Agent vs user biasa
   untuk card, memori, knowledge, artifact, jadwal.
6. Chat: non-anggota project tidak bisa memicu agent lewat @mention; agent tidak
   membaca atau membalas di chat yang tidak bisa diakses pemicunya.
7. Evaluasi kualitas: 15 tugas contoh (riset, browsing, kode, personal assistant,
   jadwal, PM multi-agent) di docs/agent-eval/hermes/, catat hasil, langkah,
   biaya, waktu, revisi.

Output: docs/agent-security-review-hermes.md dan docs/agent-eval/hermes/results.md.
Tulis jujur apa yang belum diuji. Jangan menyatakan lulus tanpa benar-benar menjalankan.
```

---

## Checklist Sebelum Rilis ke Semua Divisi

- [ ] Pilot di satu divisi minimal 2–4 minggu dengan data evaluasi
- [ ] Budget per org, divisi, agent, dan user sudah ditetapkan
- [ ] Kill switch diuji
- [ ] Egress proxy dan sandbox lulus uji SSRF & isolasi
- [ ] Kebijakan data provider LLM / embedding / search disetujui manajemen
- [ ] Daftar data yang dilarang dikirim ke LLM sudah didefinisikan dan disaring
- [ ] Karyawan mendapat panduan singkat: apa yang boleh dan tidak boleh diserahkan ke agent
- [ ] Hasil H14 sudah direview dan temuan kritis diperbaiki
