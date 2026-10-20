const { addCommand } = require('../events');
const config = require('../config');
const H = require('../helpers');

const mentionOf = (jid) => `@${H.num(jid)}`;

/** Group commands are run by the owner; the *bot account* must be admin for WhatsApp to allow them. */
async function requireBotAdmin(ctx) {
    if (await H.botIsAdmin(ctx.sock, ctx.jid)) return true;
    await ctx.reply('❌ I need to be a group admin to do that.');
    return false;
}

/** Reply target > @mention > number in the command text. */
function getTarget(ctx, match) {
    const q = H.getQuoted(ctx.msg)?.participant;
    if (q) return q;
    const m = H.getContext(ctx.msg)?.mentionedJid?.[0];
    if (m) return m;
    const n = (match || '').replace(/[^0-9]/g, '');
    return n ? `${n}@s.whatsapp.net` : null;
}

const custom = (value, fallback) => (value !== 'default' ? value : fallback);

addCommand({ pattern: 'ban', aliases: ['kick'], onlyGroup: true, desc: 'Remove a member (reply / mention / number)' }, async (sock, msg, match, ctx) => {
    if (!await requireBotAdmin(ctx)) return;
    const target = getTarget(ctx, match);
    if (!target) return ctx.reply('❌ Reply to a user, mention them, or give a number.');
    if (H.getBotIds(sock).has(H.bare(target))) return ctx.reply('❌ I won\'t remove myself. Use `.kickme` to leave.');
    await sock.groupParticipantsUpdate(ctx.jid, [target], 'remove');
    await sock.sendMessage(ctx.jid, { text: custom(config.BAN_MESSAGE, `${mentionOf(target)} has been *banned*! 🚫`), mentions: [target] });
});

addCommand({ pattern: 'add', onlyGroup: true, desc: 'Add members by number', usage: 'add 919876543210' }, async (sock, msg, match, ctx) => {
    if (!await requireBotAdmin(ctx)) return;
    // "+91 98765 43210" is ONE number; several numbers are separated by commas / new lines
    // (or by spaces when every part is already a full-length number).
    const digits = (x) => x.replace(/[^0-9]/g, '');
    let parts = (match || '').split(/[,\n]+/).map(digits).filter(Boolean);
    if (parts.length === 1) {
        const tokens = (match || '').trim().split(/\s+/).map(digits).filter(Boolean);
        if (tokens.length > 1 && tokens.every(t => t.length >= 8)) parts = tokens;
    }
    const numbers = parts;
    if (!numbers.length) return ctx.reply('❌ Provide a phone number with country code.\nExample: `.add 919876543210`');
    for (const n of numbers) {
        const res = await sock.groupParticipantsUpdate(ctx.jid, [`${n}@s.whatsapp.net`], 'add');
        const status = String(res?.[0]?.status || '');
        if (status === '200') await ctx.reply(custom(config.ADD_MESSAGE, `✅ \`${n}\` has been added!`));
        else if (status === '403') {
            const code = await sock.groupInviteCode(ctx.jid);
            await sock.sendMessage(`${n}@s.whatsapp.net`, { text: `You're invited to join: https://chat.whatsapp.com/${code}` }).catch(() => {});
            await ctx.reply(`⚠️ \`${n}\` can't be added directly (privacy settings). Invite link sent to them.`);
        } else if (status === '409') await ctx.reply(`ℹ️ \`${n}\` is already in the group.`);
        else await ctx.reply(`❌ Could not add \`${n}\` (status ${status || 'unknown'}).`);
    }
});

addCommand({ pattern: 'promote', onlyGroup: true, desc: 'Make a member admin' }, async (sock, msg, match, ctx) => {
    if (!await requireBotAdmin(ctx)) return;
    const target = getTarget(ctx, match);
    if (!target) return ctx.reply('❌ Reply to or mention the user to promote.');
    await sock.groupParticipantsUpdate(ctx.jid, [target], 'promote');
    await sock.sendMessage(ctx.jid, { text: custom(config.PROMOTE_MESSAGE, `⬆️ ${mentionOf(target)} has been *promoted* to admin!`), mentions: [target] });
});

addCommand({ pattern: 'demote', onlyGroup: true, desc: 'Remove admin rights from a member' }, async (sock, msg, match, ctx) => {
    if (!await requireBotAdmin(ctx)) return;
    const target = getTarget(ctx, match);
    if (!target) return ctx.reply('❌ Reply to or mention the user to demote.');
    await sock.groupParticipantsUpdate(ctx.jid, [target], 'demote');
    await sock.sendMessage(ctx.jid, { text: custom(config.DEMOTE_MESSAGE, `⬇️ ${mentionOf(target)} has been *demoted*!`), mentions: [target] });
});

const muteTimers = new Map();
addCommand({ pattern: 'mute', onlyGroup: true, desc: 'Only admins can send. Optional timer.', usage: 'mute [10m | 2h]' }, async (sock, msg, match, ctx) => {
    if (!await requireBotAdmin(ctx)) return;
    await sock.groupSettingUpdate(ctx.jid, 'announcement');
    clearTimeout(muteTimers.get(ctx.jid));

    const t = /^(\d+)\s*(m|h)?$/i.exec(match || '');
    if (t) {
        const minutes = Number(t[1]) * (t[2]?.toLowerCase() === 'h' ? 60 : 1);
        muteTimers.set(ctx.jid, setTimeout(async () => {
            muteTimers.delete(ctx.jid);
            try {
                await sock.groupSettingUpdate(ctx.jid, 'not_announcement');
                await sock.sendMessage(ctx.jid, { text: custom(config.UNMUTE_MESSAGE, '🔊 Group has been *unmuted*. All members can send messages.') });
            } catch {}
        }, minutes * 60000));
        return ctx.reply(`🔇 Group muted for *${minutes} min*. (The timer is lost if the bot restarts.)`);
    }
    await ctx.reply(custom(config.MUTE_MESSAGE, '🔇 Group has been *muted*. Only admins can send messages.'));
});

addCommand({ pattern: 'unmute', onlyGroup: true, desc: 'Let everyone send messages' }, async (sock, msg, match, ctx) => {
    if (!await requireBotAdmin(ctx)) return;
    clearTimeout(muteTimers.get(ctx.jid)); muteTimers.delete(ctx.jid);
    await sock.groupSettingUpdate(ctx.jid, 'not_announcement');
    await ctx.reply(custom(config.UNMUTE_MESSAGE, '🔊 Group has been *unmuted*. All members can send messages.'));
});

addCommand({ pattern: 'invite', onlyGroup: true, desc: 'Get the group invite link' }, async (sock, msg, match, ctx) => {
    if (!await requireBotAdmin(ctx)) return;
    const code = await sock.groupInviteCode(ctx.jid);
    await ctx.reply(`🔗 *Invite Link:*\nhttps://chat.whatsapp.com/${code}`);
});

addCommand({ pattern: 'ginfo', aliases: ['whois'], onlyGroup: true, desc: 'Show information about this group' }, async (sock, msg, match, ctx) => {
    const meta = await H.getGroupMeta(sock, ctx.jid, true);
    const admins = meta.participants.filter(p => p.admin);
    const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('en-GB') : 'unknown';
    let text = `👥 *${meta.subject}*\n\n*Members:* \`${meta.participants.length}\`\n*Admins:* \`${admins.length}\`\n*Created:* \`${created}\`\n*ID:* \`${meta.id}\`\n*Messages:* \`${meta.announce ? 'admins only' : 'everyone'}\``;
    if (meta.desc) text += `\n\n*Description:*\n${meta.desc}`;
    await ctx.reply(text);
});
