const { addCommand } = require('../events');
const config = require('../config');
const { Settings } = require('../db');
const { secondsToHms } = require('../helpers');

addCommand({ pattern: 'alive', desc: 'Check if the bot is alive' }, async (sock, msg, match, ctx) => {
    if (config.ALIVE_MESSAGE !== 'default') {
        return ctx.reply(config.ALIVE_MESSAGE.replace('{version}', config.VERSION));
    }
    await ctx.reply(`🤖 *SFL Bot is Alive!*\n\n*Version:* \`${config.VERSION}\`\n*Uptime:* \`${secondsToHms(process.uptime())}\`\n*Mode:* \`${Settings.get('workType', config.WORK_TYPE)}\``);
});

addCommand({ pattern: 'ping', desc: 'Check bot response time' }, async (sock, msg, match, ctx) => {
    const start = Date.now();
    const sent = await ctx.reply('🏓 Pinging...');
    await sock.sendMessage(ctx.jid, { text: `🏓 *Pong!* \`${Date.now() - start}ms\``, edit: sent.key });
});
