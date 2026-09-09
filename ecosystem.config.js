// ecosystem.config.js — PM2 (desenvolvimento local apenas)
// Em produção, o deploy é feito via Coolify + Docker.
// Todas as variáveis de ambiente são injetadas pelo Coolify em runtime.
module.exports = {
  apps: [
    {
      name: 'destrava-credito',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        PORT: process.env.PORT || 4000,
        DATA_DIR: process.env.DATA_DIR || './data',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      ignore_watch: ['node_modules', 'logs', 'dist', 'data'],
    }
  ]
};
