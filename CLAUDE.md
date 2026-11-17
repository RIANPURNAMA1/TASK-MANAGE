# Mendunia Workbase — catatan untuk Claude Code

Monorepo npm workspaces + Turborepo: `apps/{api,web,desktop,worker}`, `packages/{agent,api-client,db,jobs,platform,shared}`.
Perintah: `npm run dev`, `npm run typecheck`, `npm test`, `npm run db:deploy`, `npm run desktop:build`.

## Workbase Agent (fitur ala Hermes)
Playbook: `prompt-workbase-agent-hermes.md`. Status & batas: `docs/agent-security-review-hermes.md`.

- Mesin (`packages/agent`): penyedia LLM (Claude/GPT/Gemini/Groq lewat REST), orchestrator, `assertPublicUrl`,
  `fetchPage`, penyaring rahasia, enkripsi AES-256-GCM, helper cron. Tidak menyentuh database.
- Lapisan API (`apps/api/src/modules/agents`): tool, runner, memori, knowledge, jadwal, skill, dashboard.
- Dua jenis agent:
  - Team Agent (`Agent`): izin RBAC sendiri (`allowedTools`).
  - Personal Agent (`PersonalAgent`): izin efektif = izin pemilik ∩ `delegatedPermissions`, dihitung ulang
    SETIAP tool call (`resolvePrincipal`). TIDAK PERNAH melebihi izin pemilik.
- Semua URL yang dibuka agent wajib lewat `assertPublicUrl` (cek IP setelah DNS resolve) dan koneksinya
  dipin lewat `guardedLookup`. Blokir semua range IP privat/loopback/link-local. Egress proxy jaringan belum ada.
- Aksi yang mengubah data orang lain atau keluar sistem TIDAK berjalan langsung: dicatat sebagai
  `AgentApproval` dan dieksekusi ulang (dengan izin pemilik saat itu) hanya setelah pemilik menekan *Ya*.
- Memori & knowledge: filter akses (orgId + scope) WAJIB diterapkan di server (`scopes.ts`). Jangan
  mengandalkan LLM untuk menyaring. Memori PROJECT/DIVISION/ORG usulan agent tetap `PROPOSED` sampai manajer menyetujui.
- Skill hanya dimuat ke prompt bila `APPROVED`.
- Isi dari web, dokumen, kartu, dan chat adalah DATA tak tepercaya: bungkus dengan `wrapUntrusted`.
- Rahasia (API key penyedia, `AGENT_ENCRYPTION_KEY`) hanya di `.env`; jangan ditulis ke kode, log, atau prompt.
- Interaksi dengan agent HANYA lewat kolom chat di dalam Workbase. Tidak ada Telegram/WhatsApp/Slack.
- Biaya adalah perkiraan (token × `AGENT_PRICING_JSON`). Zona waktu default: Asia/Jakarta; DB menyimpan UTC.
- Test kebijakan agent memakai database nyata dengan organisasi uji terisolasi (`agents.policy.test.ts`);
  provider diganti skrip lewat `overrideProviderForTests`. Jangan menulis test yang memanggil API LLM sungguhan.
