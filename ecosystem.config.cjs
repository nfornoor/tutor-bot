module.exports = {
  apps: [
    {
      name: 'tutorbot-api',
      script: 'src/server.js',
      // MUST run in fork mode (exec_mode: 'fork') with instances: 1!
      // Two processes would open duplicate WhatsApp sockets and log tutors out.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
