// Audio / video / image effects powered by ffmpeg (ported from the old XMedia, tblend, ffmpeg & unvoice plugins).
// Reply to a voice note / audio / video / image with the command. Old command names still work as aliases.
const { addCommand } = require('../events');
const H = require('../helpers');
const fs = require('fs');

const MAX_INPUT = 50 * 1024 * 1024;
const MAX_SECONDS = '180';
const V_ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';     // libx264 needs even sizes

// ───────── spec builders: how to produce the output for one kind of input ─────────
const audio = (af, { ext = 'mp3', pre = [] } = {}) => ({
    ext, args: [...pre, '-vn', ...(af ? ['-af', af] : []), '-b:a', '128k'],
    send: (b) => ({ audio: b, mimetype: 'audio/mpeg' }),
});
const video = (vf, af, pre = []) => ({
    ext: 'mp4',
    args: [...pre, '-vf', `${EVEN}${vf ? ',' + vf : ''}`, ...(af ? ['-af', af] : []), ...V_ENC],
    send: (b) => ({ video: b, mimetype: 'video/mp4' }),
});
const silentVideo = (vf, pre = []) => ({
    ext: 'mp4', args: [...pre, '-vf', `${EVEN}${vf ? ',' + vf : ''}`, '-an', ...V_ENC],
    send: (b) => ({ video: b, mimetype: 'video/mp4' }),
});
const image = (vf, ext = 'jpg') => ({ ext, args: ['-vf', vf, '-frames:v', '1'], send: (b) => ({ image: b }) });
// audio -> animated visualisation video (keeps the sound)
const viz = (filter, size = '720x1280') => ({
    ext: 'mp4',
    args: ['-t', '90', '-filter_complex', `[0:a]${filter.replace('{S}', size)},format=yuv420p[v]`, '-map', '[v]', '-map', '0:a',
        '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart'],
    send: (b) => ({ video: b, mimetype: 'video/mp4' }),
});
const gifVideo = (withAudio) => ({
    ext: 'mp4',
    args: ['-t', '20', '-vf', `${EVEN},fps=13`, ...(withAudio ? [] : ['-an']), ...V_ENC, '-b:v', '500k'],
    send: (b) => ({ video: b, mimetype: 'video/mp4', gifPlayback: true }),
});

const GEQ_RAINBOW = "geq=r='X/W*r(X,Y)':g='(1-X/W)*g(X,Y)':b='(H-Y)/H*b(X,Y)',eq=brightness=0.5";
const CONV_ART = 'convolution=-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2';
const BLUR_BG = 'split[original][copy];[copy]scale=ih*16/9:-1,crop=h=iw*9/16,gblur=sigma=20[blurred];[blurred][original]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2';
const LIMIT20 = ['-t', '20'];

// canonical name -> { desc, aliases, audio?, video?, image? }
const PRESETS = {
    // ── audio ──
    tomp3: { desc: 'Video / voice note → MP3', aliases: ['mp4audio'], audio: audio(null), video: audio(null) },
    tovoice: {
        desc: 'Audio / video → WhatsApp voice note', aliases: ['unvoice'],
        audio: { ext: 'ogg', args: ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1'], send: (b) => ({ audio: b, mimetype: 'audio/ogg; codecs=opus', ptt: true }) },
        video: { ext: 'ogg', args: ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1'], send: (b) => ({ audio: b, mimetype: 'audio/ogg; codecs=opus', ptt: true }) },
    },
    bass: { desc: 'Bass-boost audio', aliases: ['mp3bass'], audio: audio('bass=g=9:f=110:w=0.6,volume=1.4') },
    nightcore: { desc: 'Speed up + raise pitch', audio: audio('aresample=44100,asetrate=55125,aresample=44100') },
    slowed: { desc: 'Slow down + lower pitch', audio: audio('aresample=44100,asetrate=35280,aresample=44100') },
    pitch: { desc: 'Higher pitch (chipmunk)', aliases: ['mp3pitch'], audio: audio('aresample=44100,asetrate=57330,aresample=44100') },
    lowpitch: { desc: 'Lower pitch (deep voice)', aliases: ['mp3low'], audio: audio('aresample=44100,asetrate=39690,aresample=44100') },
    echo: { desc: 'Add echo', audio: audio('aecho=0.8:0.9:1000:0.3') },
    loud: { desc: 'Make audio louder', aliases: ['mp3volume'], audio: audio('volume=5.3,alimiter=limit=0.95') },
    eq: { desc: 'Equalizer + loudness normalise', aliases: ['mp3eq'], audio: audio('superequalizer=1b=10:2b=10:3b=1:4b=5:5b=7:6b=5:7b=2:8b=3:9b=4:10b=5:11b=6:12b=7:13b=8:14b=8:15b=9:16b=9:17b=10:18b=10,loudnorm=I=-16:TP=-1.5:LRA=14,aresample=48000') },
    crusher: { desc: 'Bit-crusher (robot / lo-fi) audio', aliases: ['mp3crusher'], audio: audio('acrusher=level_in=8:level_out=18:bits=8:mode=log:aa=1') },
    x2mp3: { desc: 'Audio at 2× speed', audio: audio('atempo=2.0') },

    // ── audio → visualisation video ──
    spectrum: { desc: 'Audio → spectrum video', audio: viz('showspectrum=s={S}') },
    waves: { desc: 'Audio → waveform video', audio: viz('showwaves=s={S}:mode=cline:rate=25') },
    frequency: { desc: 'Audio → frequency-bars video', audio: viz('showfreqs=s={S}:mode=line:fscale=log') },
    avec: { desc: 'Audio → vectorscope video', audio: viz('avectorscope=s={S}:rf=5:gf=25:bf=5:draw=line') },
    cqtaudio: { desc: 'Audio → CQT piano-roll video', audio: viz('showcqt=s=1280x720') },
    volumeaudio: { desc: 'Audio → volume-meter video', audio: viz('showvolume=f=1:b=4:w=720:h=68') },

    // ── video / image ──
    reverse: {
        desc: 'Reverse audio or video (max 30s)', aliases: ['mp4reverse', 'mp3reverse'],
        audio: audio('areverse'), video: video('reverse', 'areverse', ['-t', '30']),
    },
    bw: { desc: 'Black & white', aliases: ['mp4bw', 'bwimage'], video: video('hue=s=0'), image: image('hue=s=0') },
    blur: { desc: 'Blur', video: video('boxblur=8:1'), image: image('boxblur=10:2') },
    blurbg: { desc: 'Fit to 16:9 with a blurred background', aliases: ['mp4blur', 'blurimage'], video: video(BLUR_BG), image: image(BLUR_BG) },
    vintage: { desc: 'Vintage colours', aliases: ['mp4vintage', 'vintageimage'], video: video('curves=vintage'), image: image('curves=vintage') },
    negative: { desc: 'Colour negative', aliases: ['mp4negative', 'negativeimage'], video: video('curves=color_negative'), image: image('curves=color_negative') },
    edge: { desc: 'Edge detection', aliases: ['mp4edge', 'edgeimage'], video: video('edgedetect=low=0.9:high=0.3'), image: image('edgedetect=low=0.9:high=0.2') },
    enhance: { desc: 'Sharpen / enhance', aliases: ['mp4enhance', 'enhanceimage'], video: video('unsharp=3:3:1.5'), image: image('unsharp=3:3:1.5') },
    color: { desc: 'Boost contrast & saturation', aliases: ['mp4color', 'colorimage'], video: video('eq=contrast=1.3:saturation=1.5:brightness=-0.1'), image: image('eq=contrast=1.3:saturation=1.5:brightness=-0.1') },
    art: { desc: 'Emboss / art filter', aliases: ['mp4art', 'artimage'], video: video(CONV_ART), image: image(CONV_ART) },
    rainbow: { desc: 'Rainbow tint', aliases: ['mp4rainbow', 'rainbowimage'], video: video(GEQ_RAINBOW, null, LIMIT20), image: image(GEQ_RAINBOW) },
    grain: { desc: 'Film grain / noise', aliases: ['grenimage'], video: video('noise=alls=60:allf=t+u'), image: image('noise=alls=100:allf=t+u') },
    stab: { desc: 'Stabilise a shaky video', aliases: ['mp4stab'], video: video('deshake') },
    speedup: { desc: 'Video 2× faster', video: video('setpts=0.5*PTS', 'atempo=2') },
    slowmo: { desc: 'Video 2× slower', video: video('setpts=2*PTS', 'atempo=0.5') },
    slowmotion: { desc: 'Smooth slow-motion (interpolated, short clips)', aliases: ['mp4slowmo'], video: silentVideo('minterpolate=fps=60,setpts=4*PTS', ['-t', '6']) },
    half: { desc: 'Shrink video to 50% size', aliases: ['x2mp4'], video: { ext: 'mp4', args: ['-vf', 'scale=trunc(iw/4)*2:trunc(ih/4)*2', ...V_ENC], send: (b) => ({ video: b, mimetype: 'video/mp4' }) } },
    quarter: { desc: 'Shrink video to 25% size', aliases: ['x4mp4'], video: { ext: 'mp4', args: ['-vf', 'scale=trunc(iw/8)*2:trunc(ih/8)*2', ...V_ENC], send: (b) => ({ video: b, mimetype: 'video/mp4' }) } },
    gif: { desc: 'Video → silent GIF-style loop', video: gifVideo(false) },
    agif: { desc: 'Video → GIF-style loop (with sound)', video: gifVideo(true) },
    img2vid: {
        desc: 'Image → 6s video', aliases: ['mp4image'],
        image: { ext: 'mp4', args: ['-loop', '1', '-t', '6', '-vf', `${EVEN},fps=19`, ...V_ENC], send: (b) => ({ video: b, mimetype: 'video/mp4' }), pre: ['-loop', '1'] },
    },
};

// ───────── runner ─────────
async function runFfmpeg(ctx, media, spec) {
    const { sock } = ctx;
    const inp = H.tmpPath(), out = H.tmpPath('.' + spec.ext);
    const wait = await ctx.reply('⏳ Processing...');
    try {
        fs.writeFileSync(inp, media.buffer);
        // image → video needs the loop flag BEFORE -i
        const inputArgs = spec.pre ? [...spec.pre, '-i', inp] : ['-i', inp];
        const args = spec.pre ? spec.args.filter((a, i, arr) => !(a === '-loop' || arr[i - 1] === '-loop')) : spec.args;
        await H.runCmd('ffmpeg', ['-y', ...inputArgs, '-t', MAX_SECONDS, ...args, out], { timeout: 240000 });
        const buf = fs.readFileSync(out);
        if (!buf.length) throw new Error('ffmpeg produced an empty file');
        await ctx.send(spec.send(buf));
    } catch (e) {
        const hint = String(e.stderr || '').trim().split('\n').filter(Boolean).pop();
        throw new Error(hint ? hint.slice(0, 160) : e.message);
    } finally {
        H.rm(inp, out);
        sock.sendMessage(ctx.jid, { delete: wait.key }).catch(() => {});
    }
}

async function fetchMedia(ctx, kinds) {
    if (!await H.hasBinary('ffmpeg')) { await ctx.reply('❌ ffmpeg is not installed on this server.'); return null; }
    const media = await H.getMedia(ctx.sock, ctx.msg, kinds);
    if (!media) { await ctx.reply(`❌ Reply to a ${kinds.join(' / ')} message.`); return null; }
    if (media.buffer.length > MAX_INPUT) { await ctx.reply('❌ File too large (max 50MB).'); return null; }
    return media;
}

for (const [name, preset] of Object.entries(PRESETS)) {
    const kinds = ['audio', 'video', 'image'].filter(k => preset[k]);
    addCommand({ pattern: name, aliases: preset.aliases, desc: preset.desc }, async (sock, msg, match, ctx) => {
        const media = await fetchMedia(ctx, ['audio', 'video', 'image']);
        if (!media) return;
        const spec = preset[media.type];
        if (!spec) return ctx.reply(`❌ \`${ctx.prefix}${name}\` works on: ${kinds.join(', ')}.`);
        await runFfmpeg(ctx, media, spec);
    });
}

// ───────── tblend (video blend modes) ─────────
const TBLEND_MODES = ['addition', 'addition128', 'grainmerge', 'and', 'average', 'burn', 'darken', 'difference', 'difference128', 'grainextract',
    'divide', 'dodge', 'exclusion', 'extremity', 'freeze', 'glow', 'hardlight', 'hardmix', 'heat', 'lighten', 'linearlight', 'multiply',
    'multiply128', 'negation', 'normal', 'or', 'overlay', 'phoenix', 'pinlight', 'reflect', 'screen', 'softlight', 'subtract', 'vividlight', 'xor'];

addCommand({ pattern: 'tblend', desc: 'Time-blend video effect', usage: 'tblend dodge' }, async (sock, msg, match, ctx) => {
    const mode = (match || '').toLowerCase();
    if (!TBLEND_MODES.includes(mode)) return ctx.reply(`❌ Usage: \`${ctx.prefix}tblend <mode>\`\n\nModes: ${TBLEND_MODES.join(', ')}`);
    const media = await fetchMedia(ctx, ['video']);
    if (!media) return;
    await runFfmpeg(ctx, media, video(`tblend=all_mode=${mode}`));
});

// ───────── interp (raise FPS by motion interpolation) ─────────
addCommand({ pattern: 'interp', desc: 'Raise video FPS by interpolation (11–120)', usage: 'interp 60' }, async (sock, msg, match, ctx) => {
    const fps = parseInt(match, 10);
    if (!(fps > 10 && fps <= 120)) return ctx.reply(`❌ Usage: \`${ctx.prefix}interp 60\` (FPS between 11 and 120, reply to a video)`);
    const media = await fetchMedia(ctx, ['video']);
    if (!media) return;
    await runFfmpeg(ctx, media, video(`minterpolate=fps=${fps}:mi_mode=mci`, 'anull', ['-t', '15']));
});

// ───────── custom ffmpeg filter (owner only, no shell, no file access) ─────────
addCommand({ pattern: 'ffmpeg', desc: 'Apply your own ffmpeg video filter', usage: 'ffmpeg curves=vintage,fps=25' }, async (sock, msg, match, ctx) => {
    if (!match) return ctx.reply(`❌ Usage: \`${ctx.prefix}ffmpeg <filter>\` (reply to a video/image)\nExamples:\n\`${ctx.prefix}ffmpeg fade=in:0:30\`\n\`${ctx.prefix}ffmpeg curves=vintage,fps=25\``);
    // block anything that could read/write files or run other inputs: filters only
    if (/(^|[\s,;=:'"\\])(movie|amovie|subtitles|ass|sendcmd|zmq|lavfi|file:|concat:|pipe:|http|\/|\.\.)/i.test(match) || /[\n\r`$|&<>]/.test(match)) {
        return ctx.reply('❌ That filter is not allowed (no file access or special characters).');
    }
    const media = await fetchMedia(ctx, ['video', 'image']);
    if (!media) return;
    const spec = media.type === 'video'
        ? { ext: 'mp4', args: ['-t', '30', '-vf', `${match},${EVEN}`, ...V_ENC], send: (b) => ({ video: b, mimetype: 'video/mp4' }) }
        : { ext: 'png', args: ['-vf', match, '-frames:v', '1'], send: (b) => ({ document: b, mimetype: 'image/png', fileName: 'ffmpeg.png' }) };
    await runFfmpeg(ctx, media, spec);
});

// ───────── list of everything ─────────
addCommand({ pattern: 'xmedia', aliases: ['effects'], desc: 'List all audio / video / image effects' }, async (sock, msg, match, ctx) => {
    const p = ctx.prefix;
    const by = { Audio: [], 'Audio → video': [], 'Video / image': [] };
    for (const [n, pr] of Object.entries(PRESETS)) {
        const k = pr.audio?.ext === 'mp4' ? 'Audio → video' : (pr.image || (pr.video && !pr.audio)) ? 'Video / image' : 'Audio';
        by[k].push(`${p}${n}`);
    }
    await ctx.reply(`🎛 *Media effects* (reply to a voice note / audio / video / image)\n\n*Audio:* ${by.Audio.join(' ')}\n\n*Audio → video:* ${by['Audio → video'].join(' ')}\n\n*Video / image:* ${by['Video / image'].join(' ')}\n\n*Others:* ${p}tblend <mode> · ${p}interp <fps> · ${p}ffmpeg <filter>\n\n_Old names such as ${p}mp4bw, ${p}mp3bass, ${p}bwimage still work._`);
});

module.exports = { PRESETS, TBLEND_MODES };
