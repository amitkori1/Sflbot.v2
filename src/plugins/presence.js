const { addCommand, onSocket } = require('../events');

let current = null;
const active = new Map(); // jid -> interval

onSocket((sock) => {
    current = sock;
    for (const t of active.values()) clearInterval(t);
    active.clear();
});

const STATES = { typing: 'composing', recording: 'recording', online: 'available' };

addCommand({
    pattern: 'presence', aliases: ['scam'],
    desc: 'Fake "typing…" / "recording…" / "online" in this chat', usage: 'presence typing|recording|online|stop',
}, async (sock, msg, match, ctx) => {
    const m = (match || '').toLowerCase();
    const { jid } = ctx;

    if (m === 'stop') {
        clearInterval(active.get(jid)); active.delete(jid);
        await sock.sendPresenceUpdate('paused', jid);
        return ctx.reply('✅ Presence stopped.');
    }
    const state = STATES[m];
    if (!state) return ctx.reply('❌ Usage: `.presence typing|recording|online|stop`');

    clearInterval(active.get(jid));
    const send = () => current?.sendPresenceUpdate(state, jid).catch(() => {});
    send();
    active.set(jid, setInterval(send, 8000));
    await ctx.reply(`✅ Showing *${m}* in this chat. Use \`.presence stop\` to end.`);
});
