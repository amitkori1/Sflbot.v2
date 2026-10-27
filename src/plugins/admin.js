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


// phone country codes -> flag + name (longest prefix wins)
const CC = { '1': '🇺🇸 USA/Canada', '7': '🇷🇺 Russia/Kazakhstan', '20': '🇪🇬 Egypt', '27': '🇿🇦 South Africa', '31': '🇳🇱 Netherlands', '33': '🇫🇷 France', '34': '🇪🇸 Spain', '39': '🇮🇹 Italy',
    '44': '🇬🇧 UK', '49': '🇩🇪 Germany', '52': '🇲🇽 Mexico', '55': '🇧🇷 Brazil', '60': '🇲🇾 Malaysia', '61': '🇦🇺 Australia', '62': '🇮🇩 Indonesia', '63': '🇵🇭 Philippines', '65': '🇸🇬 Singapore',
    '66': '🇹🇭 Thailand', '81': '🇯🇵 Japan', '82': '🇰🇷 South Korea', '84': '🇻🇳 Vietnam', '86': '🇨🇳 China', '90': '🇹🇷 Turkey', '91': '🇮🇳 India', '92': '🇵🇰 Pakistan', '93': '🇦🇫 Afghanistan',
    '94': '🇱🇰 Sri Lanka', '98': '🇮🇷 Iran', '212': '🇲🇦 Morocco', '213': '🇩🇿 Algeria', '234': '🇳🇬 Nigeria', '254': '🇰🇪 Kenya', '351': '🇵🇹 Portugal', '380': '🇺🇦 Ukraine', '880': '🇧🇩 Bangladesh',
    '966': '🇸🇦 Saudi Arabia', '971': '🇦🇪 UAE', '972': '🇮🇱 Israel', '977': '🇳🇵 Nepal', '994': '🇦🇿 Azerbaijan' };

function countryStats(participants) {
    const counts = {};
    for (const p of participants) {
        const jid = [p.phoneNumber, p.jid, p.id].filter(Boolean).find(j => j.endsWith('@s.whatsapp.net'));
        if (!jid) { counts['🌐 Hidden numbers'] = (counts['🌐 Hidden numbers'] || 0) + 1; continue; }
        const n = H.num(jid);
        const key = [3, 2, 1].map(l => n.slice(0, l)).find(c => CC[c]);
        const name = key ? CC[key] : '🌍 Other';
        counts[name] = (counts[name] || 0) + 1;
    }
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return rows.length ? rows.map(([k, v]) => `${k}: ${v}`).join('\n') : '';
}

addCommand({ pattern: 'ginfo', aliases: ['whois'], onlyGroup: true, desc: 'Group info, with a members-by-country breakdown' }, async (sock, msg, match, ctx) => {
    const meta = await H.getGroupMeta(sock, ctx.jid, true);
    const admins = meta.participants.filter(p => p.admin);
    const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('en-GB') : 'unknown';
    let text = `👥 *${meta.subject}*\n\n*Members:* \`${meta.participants.length}\`\n*Admins:* \`${admins.length}\`\n*Created:* \`${created}\`\n*ID:* \`${meta.id}\`\n*Messages:* \`${meta.announce ? 'admins only' : 'everyone'}\``;
    const countries = countryStats(meta.participants);
    if (countries) text += `\n\n*Members by country:*\n${countries}`;
    if (meta.desc) text += `\n\n*Description:*\n${meta.desc}`;
    await ctx.reply(text);
});
