DESIGN SYSTEM: Mendunia Workbase Enterprise Orchestration (malesin.AI Aesthetic)

1. Overview & Brand Personality





Nama Sistem: Mendunia Workbase (Platform Task Management & Kolaborasi Multi-Divisi)



Karakter Visual: Clean, Modern SaaS, Productivity-First, Terstruktur, Terbuka (Airy & Lightweight)



Inspirasi Gaya: Clean minimalis ala modern chat/inbox platform (malesin.AI), linear clarity, dan enterprise workspace.



2. Color Palette & Semantic Tokens

2.1 Brand & Primary Colors





Primary / Brand Blue: #2652A0 (rgb(38, 82, 160))





Hover / Darker: #1E4282 / #1B3C78



Subtle / Light Container: #EFF6FF / #F0F7FF



Border Active: #BFDBFE



Secondary / Slate Gray: #475569 (Slate-600)



Deep Navy Text: #0F172A (Slate-900)

2.2 Surface & Neutral Hierarchy





Canvas / Background: #F8FAFC (Slate-50) & #F1F5F9 (Slate-100)



Card & Component Surface: #FFFFFF (White)



Sub-surface / Input Fill: #F8FAFC



Borders & Dividers:





Regular Border: #E2E8F0 (Slate-200)



Subtle Border: #F1F5F9 (Slate-100)



Focused / Highlight Border: #93C5FD (Blue-300)

2.3 Semantic & Status Colors





Success / Completed:





Base: #10B981 (Emerald-500)



Light Container: #ECFDF5



Text: #065F46



Warning / Pending / Medium Priority:





Base: #F59E0B (Amber-500)



Light Container: #FEF3C7



Text: #92400E



Urgent / Danger / Overdue:





Base: #EF4444 (Red-500)



Light Container: #FEF2F2



Text: #991B1B



Info / In Progress:





Base: #3B82F6 (Blue-500)



Light Container: #EFF6FF



Text: #1E40AF



3. Typography Specification





Primary Font Family: Segoe UI, sans-serif



Fallback Stack: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif

Type Scale & Hierarchy:





Level

Size

Weight

Line Height

Tracking

Usage



Display / H1

24px (1.5rem)

Bold (700)

1.25

-0.02em

Judul Halaman Utama / Page Header



Heading 2

18px (1.125rem)

SemiBold (600)

1.3

-0.01em

Judul Modul / Section Header



Heading 3

15px (0.9375rem)

SemiBold (600)

1.4

normal

Judul Card / Header Kolom Kanban



Body (Regular)

13px (0.8125rem)

Normal (400)

1.5

normal

Teks Isi, Pesan Chat, Deskripsi Card



Body (Medium)

13px (0.8125rem)

Medium (500)

1.5

normal

Label Input, Navigasi Tab, Nama Anggota



Caption / Meta

11px (0.6875rem)

Normal / Medium

1.4

+0.01em

Timestamp, Subtask Counter, Status Badges



4. Spacing, Elevation & Corner Radius

4.1 Corner Radii (border-radius)





Badge / Pill: 9999px (rounded-full)



Card / Panel: 12px (rounded-xl)



Button / Input Field: 8px (rounded-lg)



Sub-card / Kanban Item: 10px (rounded-lg - rounded-xl)



Modal / Flyout Menu: 16px (rounded-2xl)

4.2 Elevation / Shadows





Card Static: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05) (subtle outline shadow)



Card Hover / Dragging: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)



Header & Left Bar: Subtle border divider (1px solid #E2E8F0), no heavy shadow.



5. Layout Architecture & Component Patterns

5.1 Global App Shell





Top Navigation Bar (Height: 60px):





Left: Brand Logo ("Mendunia Workbase"), Workspace Switcher dropdown.



Center: Modul Nav Tabs (Board & Tasks, Divisi & Proyek, Chat Tim, Pengumuman, Dokumen & File, Laporan). Active state: Blue text + blue subtle badge or underline indicator.



Right: Global Search Bar (Ctrl+K), Quick Action + Task button, Notification Bell with badge counter, Profile Avatar.



Slim Left Rail (Width: 56px):





Akses cepat iconik: Overview/Apps, Kanban Board, My Tasks, Chat/Communication, Kalender, Analytics, Settings.



Workspace Main Area:





Split view fleksibel: Left sub-navigation / filters list (240px - 280px) + Main content canvas + Optional right drawer / preview panel (340px).

5.2 Specific UI Components





Kanban Card:





Clean white container, 1px border #E2E8F0.



Tags/Labels di bagian atas (#Feature, #UI-UX, #Security).



Judul bold, preview checklist bar/progress (2/4 subtask).



Footer: Due date pill, comment count, and assignee avatar stacking.



My Tasks View:





Section accordion (Terlambat / Overdue, Jatuh Tempo Hari Ini, Mendatang / Pekan Ini).



Quick action buttons (Terima, Diskusikan, Tolak untuk permintaan task lintas divisi).



Chat & Discussion Box:





Message bubble flat modern (User chat dengan light blue tint #2652A0, rekan chat dengan white card + soft border).



Integrasi System Bot notification badge dengan styling monospaced ticket ID (FR-10).



Management Report & Metric Widget:





Summary KPI cards dengan ikon status, angka metrik besar, dan trend delta pill (+12% vs minggu lalu).



Baris distribusi divisi dengan visual multi-progress bar (Selesai, Berjalan, Blocked).

