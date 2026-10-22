const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../config.env') });

const env = process.env;
const bool = (v, def = false) => (v === undefined || v === '' ? def : String(v).toLowerCase() === 'true');
const str = (v, def = '') => (v === undefined || v === '' ? def : v);

const DATA_DIR = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.resolve(__dirname, '..');
const HANDLERS = str(env.HANDLERS, '^[.!;]');

// Prefix characters for display: "^[.!;]" -> ".!;"
const prefixChars = (HANDLERS.match(/\[(.*)\]/)?.[1] || '.').replace(/\\/g, '');

module.exports = {
    VERSION: 'v3.0.0',
    SESSION: str(env.ASENA_SESSION),
    PAIR_NUMBER: '919530551184',
    WORK_TYPE: str(env.WORK_TYPE, 'private').toLowerCase(),
    HANDLERS,
    PREFIX: prefixChars[0] || '.',
    PREFIX_CHARS: prefixChars,
    SUDO: str(env.SUDO).split(',').map(s => s.replace(/[^0-9]/g, '')).filter(Boolean),

    DATA_DIR,
    SESSION_DIR: path.join(DATA_DIR, 'session'),
    PORT: Number(env.PORT) || 3000,
    KEEP_ALIVE_URL: str(env.KEEP_ALIVE_URL, str(env.RENDER_EXTERNAL_URL)),
    LOG_LEVEL: str(env.LOG_LEVEL, 'silent'),

    NO_ONLINE: bool(env.NO_ONLINE, true),
    SEND_READ: bool(env.SEND_READ, false),
    BOOT_MESSAGE: bool(env.BOOT_MESSAGE, true),

    ANTI_LINK: bool(env.ANTI_LINK, false),
    AUTO_BIO: bool(env.AUTO_BIO, false),
    AUTOBIO_MINUTES: Math.max(1, Number(env.AUTOBIO_MINUTES) || 10),

    ALIVE_MESSAGE: str(env.ALIVE_MESSAGE, 'default'),
    ANTILINK_MESSAGE: str(env.ANTILINK_MESSAGE, 'default'),
    AFK_MESSAGE: str(env.AFK_MESSAGE, 'default'),
    BAN_MESSAGE: str(env.BAN_MESSAGE, 'default'),
    ADD_MESSAGE: str(env.ADD_MESSAGE, 'default'),
    MUTE_MESSAGE: str(env.MUTE_MESSAGE, 'default'),
    UNMUTE_MESSAGE: str(env.UNMUTE_MESSAGE, 'default'),
    PROMOTE_MESSAGE: str(env.PROMOTE_MESSAGE, 'default'),
    DEMOTE_MESSAGE: str(env.DEMOTE_MESSAGE, 'default'),
    BLOCK_MESSAGE: str(env.BLOCK_MESSAGE, 'default'),
    UNBLOCK_MESSAGE: str(env.UNBLOCK_MESSAGE, 'default'),
    KICKME_MESSAGE: str(env.KICKME_MESSAGE, 'default'),

    WEATHER_API: str(env.WEATHER_API),
    OMDB_API_KEY: str(env.OMDB_API_KEY),
    REMOVE_BG_API_KEY: str(env.REMOVE_BG_API_KEY),
    OCR_API_KEY: str(env.OCR_API_KEY, 'helloworld'),
    TRANSLATE_LANG: str(env.TRANSLATE_LANG, 'en'),
    TTS_LANG: str(env.TTS_LANG, 'en'),
    YTDLP_PATH: str(env.YTDLP_PATH, 'yt-dlp'),
    YTDLP_COOKIES: str(env.YTDLP_COOKIES),
};
