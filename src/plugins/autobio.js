const { addCommand, onSocket } = require('../events');
const config = require('../config');
const { Settings } = require('../db');

let current = null;
let timer = null;
const enabled = () => Settings.get('autobio', config.AUTO_BIO);

async function tick() {
    if (!enabled() || !current?.user) return;
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    try { await current.updateProfileStatus(`⌚ ${time} | 📅 ${date} | SFL Bot`); } catch {}
}

onSocket((sock) => {
    current = sock;
    clearInterval(timer);
    timer = setInterval(tick, config.AUTOBIO_MINUTES * 60 * 1000);
});

addCommand({ pattern: 'autobio', desc: 'Auto-update your bio with time & date', usage: 'autobio on|off' }, async (sock, msg, match, ctx) => {
    const m = (match || '').toLowerCase();
    if (m !== 'on' && m !== 'off') return ctx.reply(`Autobio is *${enabled() ? 'ON' : 'OFF'}* (updates every ${config.AUTOBIO_MINUTES} min).\nUsage: \`${config.PREFIX}autobio on|off\``);
    Settings.set('autobio', m === 'on');
    if (m === 'on') tick();
    await ctx.reply(`✅ Autobio turned *${m.toUpperCase()}*.${m === 'on' ? '\n_Tip: set TZ in config.env for your timezone._' : ''}`);
});
