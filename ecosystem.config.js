// PM2:  npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save && pm2 startup
module.exports = {
    apps: [{
        name: 'sfl-bot',
        script: 'src/index.js',
        autorestart: true,
        exp_backoff_restart_delay: 1000,
        max_memory_restart: '500M',
        time: true,
    }],
};
