module.exports = {
  apps: [
    {
      name: 'destrava-credito',
      script: './dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        DATA_DIR: '/var/data/destrava',
        ADMIN_KEY: process.env.ADMIN_KEY || 'CHANGE_ME_IN_ENV',
        SITE_DOMAIN: 'destrava.permupay.com.br'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      ignore_watch: ['node_modules', 'logs', 'dist', 'data'],
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
        DATA_DIR: '/var/data/destrava',
        ADMIN_KEY: process.env.ADMIN_KEY || 'CHANGE_ME_IN_ENV',
        SITE_DOMAIN: 'destrava.permupay.com.br'
      }
    }
  ]
};
