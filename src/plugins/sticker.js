const { addCommand } = require('../events');
const H = require('../helpers');
const fs = require('fs');

/** Image buffer -> 512x512 webp. Uses sharp, falls back to ffmpeg. */
async function imageToWebp(buffer) {
    try {
        const sharp = require('sharp');
        return await sharp(buffer)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 80 })
            .toBuffer();
    } catch (e) {
        if (!await H.hasBinary('ffmpeg')) throw new Error('sharp is not available and ffmpeg is not installed');
        const inp = H.tmpPath(), out = H.tmpPath('.webp');
        fs.writeFileSync(inp, buffer);
        try {
            await H.runCmd('ffmpeg', ['-y', '-i', inp, '-vframes', '1', '-vf',
                'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                out]);
            return fs.readFileSync(out);
        } finally { H.rm(inp, out); }
    }
}

/** Video/GIF buffer -> animated webp (max 8s, tuned to stay under WhatsApp's size limit). */
async function videoToWebp(buffer) {
    if (!await H.hasBinary('ffmpeg')) throw new Error('ffmpeg is not installed');
    const inp = H.tmpPath(), out = H.tmpPath('.webp');
    fs.writeFileSync(inp, buffer);
    try {
        await H.runCmd('ffmpeg', ['-y', '-i', inp, '-t', '8',
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
            '-vcodec', 'libwebp', '-loop', '0', '-an', '-quality', '45', '-preset', 'default', out]);
        return fs.readFileSync(out);
    } finally { H.rm(inp, out); }
}

addCommand({
    pattern: 'sticker', aliases: ['s', 'imagesticker', 'vsticker'],
    desc: 'Reply to an image / video / GIF to make a sticker',
}, async (sock, msg, match, ctx) => {
    const media = await H.getMedia(sock, msg, ['image', 'video']);
    if (!media) return ctx.reply('❌ Reply to an image or video (or send one with the command as caption).');
    const wait = await ctx.reply('⏳ Creating sticker...');
    try {
        const webp = media.type === 'image' ? await imageToWebp(media.buffer) : await videoToWebp(media.buffer);
        await ctx.send({ sticker: webp });
    } finally {
        sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {});
    }
});

addCommand({ pattern: 'toimg', aliases: ['toimage'], desc: 'Reply to a sticker to get it back as an image' }, async (sock, msg, match, ctx) => {
    const media = await H.getMedia(sock, msg, ['sticker']);
    if (!media) return ctx.reply('❌ Reply to a sticker.');
    let png;
    try {
        png = await require('sharp')(media.buffer).png().toBuffer();
    } catch {
        const inp = H.tmpPath('.webp'), out = H.tmpPath('.png');
        fs.writeFileSync(inp, media.buffer);
        try { await H.runCmd('ffmpeg', ['-y', '-i', inp, '-vframes', '1', out]); png = fs.readFileSync(out); } finally { H.rm(inp, out); }
    }
    await ctx.send({ image: png });
});

module.exports = { imageToWebp };
