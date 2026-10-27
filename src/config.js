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
    VERSION: 'v3.1.0',
    SESSION: str(env.ASENA_SESSION),
    PAIR_NUMBER: str(env.PAIR_NUMBER, '').replace(/[^0-9]/g, ''),
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

    // ───────── API keys ─────────
    // Defaults marked (old repo) are the shared keys that shipped inside the old WhatsAsena/sflbot2.1
    // code. They belong to the original developers, can be rate-limited or revoked at any time, and
    // were NOT created by you. Put your own key in config.env / Render env vars to override them.
    WEATHER_API: str(env.WEATHER_API, ''),        // OpenWeatherMap (old repo)
    OMDB_API_KEY: str(env.OMDB_API_KEY, ''),                              // OMDb (old repo)
    WITAI_API: str(env.WITAI_API, ''),            // wit.ai speech-to-text (old repo)
    DEEPAI_API_KEY: str(env.DEEPAI_API_KEY, ''), // DeepAI public demo key
    REMOVE_BG_API_KEY: str(env.REMOVE_BG_API_KEY),                                // none shipped: get one at remove.bg
    OCR_API_KEY: str(env.OCR_API_KEY, ''),                              // ocr.space public test key

    // ───────── SimSimi chatbot ─────────
    SIMSIMI_API_KEY: str(env.SIMSIMI_API_KEY),        // official key from workshop.simsimi.com (best quality)
    SIMI_LANG: str(env.SIMI_LANG, 'auto'),            // auto = detect language of each message
    SIMI_BAD_WORDS: bool(env.SIMI_FILTER, true),      // ask SimSimi to filter rude answers (official API)
    BRAINSHOP_BID: str(env.BRAINSHOP_BID),            // optional extra fallback (brainshop.ai)
    BRAINSHOP_KEY: str(env.BRAINSHOP_KEY),

    // ───────── pairing / session helpers ─────────
    PAIR_TOKEN: str(env.PAIR_TOKEN),                  // optional password for the /pair web page
    PRINT_SESSION: bool(env.PRINT_SESSION, false),    // print ASENA_SESSION in the logs after linking

    // ───────── power features (off by default) ─────────
    ALLOW_TERM: bool(env.ALLOW_TERM, false),          // enables .term (shell) for the account owner ONLY
    BLOCK_CHAT: str(env.BLOCK_CHAT).split(',').map(s => s.trim()).filter(Boolean),
    TRANSLATE_LANG: str(env.TRANSLATE_LANG, 'en'),
    TTS_LANG: str(env.TTS_LANG, 'en'),
    YTDLP_PATH: str(env.YTDLP_PATH, 'yt-dlp'),
    YTDLP_COOKIES: str(env.YTDLP_COOKIES),
};
