const { addCommand, onSocket } = require('../events');
const config = require('../config');
const { Greetings } = require('../db');
const H = require('../helpers');

function register(type, emoji) {
    addCommand({
        pattern: type, onlyGroup: true,
        desc: `Set the ${type} message ({user} {group} placeholders, # = new line)`,
        usage: `${type} Hello {user}, welcome to {group}!  |  ${type} delete`,
    }, async (sock, msg, match, ctx) => {
        if (!match) {
            const cur = Greetings.get(ctx.jid, type);
            return ctx.reply(cur ? `${emoji} *Current ${type} message:*\n\n${cur}` : `❌ No ${type} message set.\nUsage: \`${config.PREFIX}${type} Hello {user}, welcome to {group}!\``);
        }
        if (match.toLowerCase() === 'delete') { Greetings.delete(ctx.jid, type); return ctx.reply(`🗑️ ${type} message deleted.`); }
        Greetings.set(ctx.jid, type, match.replace(/#/g, '\n'));
        await ctx.reply(`✅ ${type} message saved.`);
    });
}
register('welcome', '👋');
register('goodbye', '😢');

onSocket((sock) => {
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        const type = action === 'add' ? 'welcome' : action === 'remove' ? 'goodbye' : null;
        if (!type) return;
        const template = Greetings.get(id, type);
        if (!template) return;
        try {
            const subject = (await H.getGroupMeta(sock, id, true)).subject;
            for (const p of participants) {
                const jid = typeof p === 'string' ? p : p.id;
                if (!jid) continue;
                const text = template.replace(/\{user\}/gi, `@${H.num(jid)}`).replace(/\{group\}/gi, subject);
                await sock.sendMessage(id, { text, mentions: [jid] });
            }
        } catch (e) { console.error('Greeting error:', e.message); }
    });
});
