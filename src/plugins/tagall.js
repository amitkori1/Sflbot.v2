const { addCommand } = require('../events');
const H = require('../helpers');

addCommand({ pattern: 'tagall', onlyGroup: true, desc: 'Tag all members (optional message)' }, async (sock, msg, match, ctx) => {
    const meta = await H.getGroupMeta(sock, ctx.jid, true);
    const ids = meta.participants.map(p => p.id);
    const list = ids.map(m => `▫️ @${H.num(m)}`).join('\n');
    await ctx.send({ text: match ? `${match}\n\n${list}` : list, mentions: ids });
});

addCommand({ pattern: 'tagadmin', onlyGroup: true, desc: 'Tag all admins' }, async (sock, msg, match, ctx) => {
    const meta = await H.getGroupMeta(sock, ctx.jid, true);
    const ids = meta.participants.filter(p => p.admin).map(p => p.id);
    if (!ids.length) return ctx.reply('❌ No admins found.');
    await ctx.send({ text: (match ? `${match}\n\n` : '👑 *Admins:*\n') + ids.map(m => `@${H.num(m)}`).join('\n'), mentions: ids });
});
