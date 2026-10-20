const { addCommand } = require('../events');
const H = require('../helpers');
const fs = require('fs');

const MAX_INPUT = 50 * 1024 * 1024;
const V_ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

const audio = (af, ext = 'mp3') => ({ ext, args: ['-vn', ...(af ? ['-af', af] : []), '-b:a', '128k'], send: (b) => ({ audio: b, mimetype: 'audio/mpeg' }) });
const video = (vf, af, pre = []) => ({
    ext: 'mp4',
    args: [...pre, '-vf', `${EVEN}${vf ? ',' + vf : ''}`, ...(af ? ['-af', af] : []), ...V_ENC],
    send: (b) => ({ video: b, mimetype: 'video/mp4' }),
});
const image = (vf) => ({ ext: 'jpg', args: ['-vf', vf, '-frames:v', '1'], send: (b) => ({ image: b }) });

// kind of replied media -> how to process it
const PRESETS = {
    tomp3: { desc: 'Video / voice note → MP3 audio', audio: audio(null), video: audio(null) },
    tovoice: {
        desc: 'Audio / video → WhatsApp voice note',
        audio: { ext: 'ogg', args: ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1'], send: (b) => ({ audio: b, mimetype: 'audio/ogg; codecs=opus', ptt: true }) },
    },
    bass: { desc: 'Bass-boost audio', audio: audio('bass=g=15,volume=1.5') },
    nightcore: { desc: 'Speed up + raise pitch (nightcore)', audio: audio('aresample=44100,asetrate=55125,aresample=44100') },
    slowed: { desc: 'Slow down + lower pitch', audio: audio('aresample=44100,asetrate=35280,aresample=44100') },
    echo: { desc: 'Add echo to audio', audio: audio('aecho=0.8:0.9:1000:0.3') },
    reverse: { desc: 'Reverse audio or video (max 30s)', audio: audio('areverse'), video: video('reverse', 'areverse', ['-t', '30']) },
    bw: { desc: 'Black & white video / image', video: video('hue=s=0'), image: image('hue=s=0') },
    blur: { desc: 'Blur video / image', video: video('boxblur=8:1'), image: image('boxblur=10:2') },
    speedup: { desc: 'Make a video 2× faster', video: video('setpts=0.5*PTS', 'atempo=2') },
    slowmo: { desc: 'Make a video 2× slower', video: video('setpts=2*PTS', 'atempo=0.5') },
};

for (const [name, preset] of Object.entries(PRESETS)) {
    const kinds = ['audio', 'video', 'image'].filter(k => preset[k]);
    addCommand({ pattern: name, desc: preset.desc }, async (sock, msg, match, ctx) => {
        if (!await H.hasBinary('ffmpeg')) return ctx.reply('❌ ffmpeg is not installed on this server.');
        const media = await H.getMedia(sock, msg, ['audio', 'video', 'image']);
        if (!media) return ctx.reply(`❌ Reply to a ${kinds.join(' / ')} message.`);
        const spec = preset[media.type];
        if (!spec) return ctx.reply(`❌ \`${ctx.prefix}${name}\` works on: ${kinds.join(', ')}.`);
        if (media.buffer.length > MAX_INPUT) return ctx.reply('❌ File too large (max 50MB).');

        const wait = await ctx.reply('⏳ Processing...');
        const inp = H.tmpPath(), out = H.tmpPath('.' + spec.ext);
        try {
            fs.writeFileSync(inp, media.buffer);
            await H.runCmd('ffmpeg', ['-y', '-i', inp, ...spec.args, out], { timeout: 240000 });
            await ctx.send(spec.send(fs.readFileSync(out)));
        } finally {
            H.rm(inp, out);
            sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {});
        }
    });
}
