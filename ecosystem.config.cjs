// Konfigurasi PM2 production. Isi sama dengan deployment.md langkah 8; path mengikuti
// /var/www/workbase. Jalankan dari root project: pm2 start ecosystem.config.cjs
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
