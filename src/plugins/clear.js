const { addCommand, onSocket } = require('../events');
const H = require('../helpers');

// Remember the bot's own recent messages per chat so `.clear` can delete them.
const recent = new Map(); // jid -> [{ key }]
function remember(key) {
    if (!key?.id || !key.remoteJid) return;
    const list = recent.get(key.remoteJid) || [];
    if (list.some(k => k.id === key.id)) return;
    list.push(key);
    if (list.length > 100) list.shift();
    recent.set(key.remoteJid, list);
}

onSocket((sock) => {
    const orig = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, ...rest) => {
        const res = await orig(jid, content, ...rest);
        if (res?.key && !content?.delete && !content?.react && !content?.edit) remember(res.key);
        return res;
    };
    sock.ev.on('messages.upsert', ({ messages }) => messages.forEach(m => m.key?.fromMe && !m.message?.protocolMessage && remember(m.key)));
});

addCommand({ pattern: 'clear', desc: 'Delete my last N messages in this chat', usage: 'clear 5' }, async (sock, msg, match, ctx) => {
    const count = Math.min(parseInt(match) || 5, 50);
    const list = (recent.get(ctx.jid) || []).slice(-count);
    if (!list.length) return ctx.reply('❌ I have no recent messages of mine in this chat to delete.');
    for (const key of list.reverse()) {
        await sock.sendMessage(ctx.jid, { delete: key }).catch(() => {});
        await new Promise(r => setTimeout(r, 400));
    }
    recent.set(ctx.jid, (recent.get(ctx.jid) || []).filter(k => !list.includes(k)));
});

addCommand({ pattern: 'del', desc: 'Delete the replied message' }, async (sock, msg, match, ctx) => {
    const q = H.getQuoted(msg);
    if (!q?.stanzaId) return ctx.reply('❌ Reply to a message to delete it.');
    const mine = !q.participant || H.getBotIds(sock).has(H.bare(q.participant));
    const key = { remoteJid: ctx.jid, id: q.stanzaId, fromMe: mine, participant: ctx.isGroup ? q.participant : undefined };
    try {
        await sock.sendMessage(ctx.jid, { delete: key });
    } catch {
        await ctx.reply('❌ Cannot delete that message (I need to be admin to delete other people\'s messages in groups).');
    }
});
