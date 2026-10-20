const { addCommand, addPassive } = require('../events');
const config = require('../config');
const { AntiLink } = require('../db');
const H = require('../helpers');

const LINK_RE = /(https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+/i;

addCommand({ pattern: 'antilink', onlyGroup: true, desc: 'Remove members who post links', usage: 'antilink on|off' }, async (sock, msg, match, ctx) => {
    const m = (match || '').toLowerCase();
    if (m !== 'on' && m !== 'off') return ctx.reply(`Anti-link is *${AntiLink.isOn(ctx.jid) ? 'ON' : 'OFF'}* in this group.\nUsage: \`${config.PREFIX}antilink on|off\``);
    AntiLink.set(ctx.jid, m === 'on');
    await ctx.reply(`✅ Anti-link turned *${m.toUpperCase()}* for this group.${m === 'on' ? '\n_I need to be admin for this to work._' : ''}`);
});

addPassive(async (ctx) => {
    if (!ctx.isGroup || ctx.fromMe || ctx.isOwner) return;
    if (!ctx.text || !LINK_RE.test(ctx.text)) return;
    if (!AntiLink.isOn(ctx.jid)) return;

    const { sock, jid, msg } = ctx;
    const meta = await H.getGroupMeta(sock, jid);
    if (!H.isAdminIn(meta, [...H.getBotIds(sock)])) return;   // can't act without admin rights
    if (H.isAdminIn(meta, ctx.senderIds)) return;             // admins may post links

    const sender = msg.key.participant;
    if (!sender) return;
    await sock.sendMessage(jid, { delete: msg.key }).catch(() => {});
    await sock.groupParticipantsUpdate(jid, [sender], 'remove').catch(() => {});
    const text = config.ANTILINK_MESSAGE !== 'default'
        ? config.ANTILINK_MESSAGE
        : `🚫 @${H.num(sender)} was removed for sending a link.`;
    await sock.sendMessage(jid, { text, mentions: [sender] });
});
