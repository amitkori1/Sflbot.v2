const { addCommand, addPassive } = require('../events');
const { AFK } = require('../db');
const config = require('../config');
const H = require('../helpers');

addCommand({ pattern: 'afk', desc: 'Set AFK status', usage: 'afk [reason]' }, async (sock, msg, match, ctx) => {
    AFK.set(match?.trim() || null);
    cooldown.clear();
    await ctx.reply(match ? `💤 *AFK Mode ON*\nReason: _${match.trim()}_` : '💤 *AFK Mode ON*');
});

addCommand({ pattern: 'afkoff', desc: 'Turn off AFK status' }, async (sock, msg, match, ctx) => {
    const afk = AFK.get();
    if (!afk.active) return ctx.reply('❌ AFK mode is not active.');
    const away = H.secondsToHms(Math.floor(Date.now() / 1000) - afk.since);
    AFK.clear();
    await ctx.reply(`✅ *AFK Mode OFF*\nYou were away for: _${away}_`);
});

// don't answer the same chat more than once every 15 minutes
const cooldown = new Map();
const COOLDOWN_MS = 15 * 60 * 1000;

addPassive(async (ctx) => {
    const afk = AFK.get();
    if (!afk.active || ctx.fromMe) return;

    if (ctx.isGroup) {
        const ids = H.getBotIds(ctx.sock);
        const nums = new Set([...ids].map(H.num));
        const mentioned = (H.getContext(ctx.msg)?.mentionedJid || []).some(j => nums.has(H.num(j)));
        const replied = nums.has(H.num(H.getQuoted(ctx.msg)?.participant || ''));
        if (!mentioned && !replied) return;
    }

    const last = cooldown.get(ctx.jid) || 0;
    if (Date.now() - last < COOLDOWN_MS) return;
    cooldown.set(ctx.jid, Date.now());

    const since = H.secondsToHms(Math.floor(Date.now() / 1000) - afk.since);
    const text = config.AFK_MESSAGE !== 'default'
        ? config.AFK_MESSAGE
        : `💤 *I am currently AFK*${afk.reason ? `\nReason: _${afk.reason}_` : ''}\n⏱ Away for: _${since}_`;
    await ctx.reply(text);
});
