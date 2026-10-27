const { addCommand } = require('../events');
const config = require('../config');
const db = require('../db');
const H = require('../helpers');
const session = require('../session');

addCommand({ pattern: 'restart', desc: 'Restart the bot (needs PM2 / Docker / systemd to come back up)' }, async (sock, msg, match, ctx) => {
    await ctx.reply('♻️ Restarting...');
    await db.flushAsync();
    try { await session.backupToStore(true); } catch {}
    setTimeout(() => process.exit(0), 500);
});

addCommand({
    pattern: 'mode', desc: 'Switch between private and public mode', usage: 'mode private|public',
}, async (sock, msg, match, ctx) => {
    const m = (match || '').toLowerCase();
    if (m !== 'private' && m !== 'public') {
        return ctx.reply(`Current mode: \`${db.Settings.get('workType', config.WORK_TYPE)}\`\nUsage: \`${config.PREFIX}mode private|public\``);
    }
    db.Settings.set('workType', m);
    await ctx.reply(`✅ Mode set to *${m}*.`);
});

addCommand({
    pattern: 'sudo', desc: 'Manage sudo users (they can use owner commands)', usage: 'sudo add|del|list [number or reply]',
}, async (sock, msg, match, ctx) => {
    if (!ctx.fromMe) return ctx.reply('❌ Only the account owner can manage sudo users.');
    const [action, ...rest] = (match || 'list').split(/\s+/);
    const quoted = H.getQuoted(msg)?.participant;
    const mention = H.getContext(msg)?.mentionedJid?.[0];
    const target = H.num(quoted || mention || '') || rest.join('').replace(/[^0-9]/g, '');

    if (action === 'list') {
        const list = db.Sudo.all();
        return ctx.reply(list.length ? '*👑 Sudo users:*\n' + list.map(n => `• ${n}`).join('\n') : '📭 No sudo users.');
    }
    if (!target) return ctx.reply(`❌ Give a number or reply to a user.\nExample: \`${config.PREFIX}sudo add 919876543210\``);
    if (action === 'add') { db.Sudo.add(target); return ctx.reply(`✅ \`${target}\` is now sudo.`); }
    if (action === 'del' || action === 'remove') { db.Sudo.remove(target); return ctx.reply(`✅ \`${target}\` removed from sudo.`); }
    await ctx.reply('❌ Use: add, del or list.');
});
