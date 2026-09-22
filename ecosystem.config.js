'use strict';
/**
 * ecosystem.config.js — configurazione PM2 (VPS, alternativa a systemd).
 * Fork mode (una sola istanza: il bot usa DB file/JSON, niente cluster),
 * restart automatico, log separati in logs/.
 *
 * Uso:
 *   npm i -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup   # riavvio automatico al boot
 *   pm2 logs discord-bot
 */
module.exports = {
  apps: [
    {
      name: 'discord-bot',
      script: 'src/index.js', // coerente con package.json "start"
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '400M',
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'discord-dashboard',
      script: 'src/dashboard/index.js', // coerente con package.json "dashboard"
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      max_memory_restart: '256M',
      error_file: 'logs/pm2-dashboard-error.log',
      out_file: 'logs/pm2-dashboard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
