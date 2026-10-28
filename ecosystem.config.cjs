// PM2: pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'robot-backend',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1, // una sola instancia: las conexiones de los robots viven en memoria
      autorestart: true,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
