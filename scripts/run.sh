source .env
cd bot
pm2 start ecosystem.config.js --only worker
