# SFL Bot v3

WhatsApp userbot on modern Baileys, built to run 24/7. This is the working "Sfl-revival" base with the useful features of the old WhatsAsena-based bot ported over and rewritten.

> Requires **Node 20+**. Using a userbot is against WhatsApp's terms. Use a number you can afford to lose, and don't spam.

## Quick start (VPS / home server) - recommended for 24/7

```bash
cp config.env.example config.env     # edit if you like
npm install
npm run qr                           # scan QR once (or set PAIR_NUMBER to get a pairing code)
npm start
```

Keep it alive with **PM2**:

```bash
npm i -g pm2
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

Or **Docker** (includes ffmpeg + yt-dlp, session/data stored in a volume):

```bash
cp config.env.example config.env
docker compose run --rm sfl-bot node src/qr.js     # first-time login (QR in terminal)
docker compose up -d --build
```

## Hosting notes (read this for "long term")

| Host | Works for 24/7? |
|---|---|
| Your own VPS / Raspberry Pi / old PC | Yes. Best option. Session + data live on disk. |
| Docker with a volume | Yes. `DATA_DIR=/data` is already set. |
| Render / Railway / Heroku-style | Only with care. Disk is wiped on every restart, so notes, filters and the session reset. Use `ASENA_SESSION` (run `npm run session` locally after logging in) and a persistent disk. Render's free tier also sleeps; set `KEEP_ALIVE_URL` or use an uptime pinger on `/`. |

Built-in 24/7 protections: automatic reconnect with backoff, handling of every disconnect reason, protection against running two copies, crash-safe `data.json`, a watchdog that restarts the process if it stays offline 10+ minutes, a health endpoint at `/health`, and a retry cache so WhatsApp can re-request messages.

**Run only ONE copy of the bot per session.** Two copies fight each other and WhatsApp will log you out.

## Login options

1. **QR** - `npm run qr` (shows a QR in the terminal).
2. **Pairing code** - set `PAIR_NUMBER=919876543210` and run `npm run qr` or `npm start`; enter the code under *Linked Devices > Link with phone number*.
3. **Session string** - `npm run session` prints a base64 string to use as `ASENA_SESSION` on hosts without a disk.

Old WhatsAsena session strings (`ASENA;;;...`) do **not** work with this library. You need to link again once.

## Commands (prefix `.` `!` `;`)

**Group Admin**

| Command | Aliases | What it does |
|---|---|---|
| `.ban` | `.kick` | Remove a member (reply / mention / number) |
| `.add` |  | Add members by number |
| `.promote` |  | Make a member admin |
| `.demote` |  | Remove admin rights from a member |
| `.mute` |  | Only admins can send. Optional timer. |
| `.unmute` |  | Let everyone send messages |
| `.invite` |  | Get the group invite link |
| `.ginfo` | `.whois` | Show information about this group |
| `.antilink` |  | Remove members who post links |
| `.welcome` |  | Set the welcome message ({user} {group} placeholders, # = new line) |
| `.goodbye` |  | Set the goodbye message ({user} {group} placeholders, # = new line) |
| `.tagall` |  | Tag all members (optional message) |
| `.tagadmin` |  | Tag all admins |

**Chat**

| Command | Aliases | What it does |
|---|---|---|
| `.afk` |  | Set AFK status |
| `.afkoff` |  | Turn off AFK status |
| `.clear` |  | Delete my last N messages in this chat |
| `.del` |  | Delete the replied message |
| `.filter` |  | Auto-reply filter for this chat |
| `.stop` |  | Remove a filter |
| `.notes` |  | List all saved notes |
| `.save` |  | Save a note (text or reply) |
| `.delnotes` | `.deletenotes` | Delete all saved notes |

**Bot**

| Command | Aliases | What it does |
|---|---|---|
| `.alive` |  | Check if the bot is alive |
| `.ping` |  | Check bot response time |
| `.help` | `.menu` `.commands` | Show commands. Usage: .help [command] |
| `.restart` |  | Restart the bot (needs PM2 / Docker / systemd to come back up) |
| `.mode` |  | Switch between private and public mode |
| `.sudo` |  | Manage sudo users (they can use owner commands) |

**Profile**

| Command | Aliases | What it does |
|---|---|---|
| `.autobio` |  | Auto-update your bio with time & date |
| `.presence` | `.scam` | Fake "typing…" / "recording…" / "online" in this chat |
| `.kickme` |  | Leave the current group |
| `.block` |  | Block a user (reply / mention, or in their PM) |
| `.unblock` |  | Unblock a user |
| `.jid` |  | Get the JID of a user or this chat |
| `.pp` |  | Set your profile picture from a replied image |
| `.setbio` |  | Set your WhatsApp About/bio |

**Downloaders**

| Command | Aliases | What it does |
|---|---|---|
| `.song` | `.play` | Download a song from YouTube (name or link) |
| `.video` |  | Download a video from YouTube (name or link, 480p) |
| `.yt` | `.ytsearch` | Search YouTube |
| `.dl` | `.insta` `.tiktok` `.fb` `.ig` `.twitter` | Download a video/photo from Instagram, TikTok, Facebook, X… (link) |

**Utilities**

| Command | Aliases | What it does |
|---|---|---|
| `.sysd` |  | Show system information |
| `.info` |  | Bot info |
| `.calc` |  | Calculate a math expression |
| `.weather` |  | Weather for a city |
| `.scan` |  | Check if a number is on WhatsApp |
| `.unit` |  | Convert units (length, weight, temp, data, time) |

**Media**

| Command | Aliases | What it does |
|---|---|---|
| `.tomp3` |  | Video / voice note → MP3 audio |
| `.tovoice` |  | Audio / video → WhatsApp voice note |
| `.bass` |  | Bass-boost audio |
| `.nightcore` |  | Speed up + raise pitch (nightcore) |
| `.slowed` |  | Slow down + lower pitch |
| `.echo` |  | Add echo to audio |
| `.reverse` |  | Reverse audio or video (max 30s) |
| `.bw` |  | Black & white video / image |
| `.blur` |  | Blur video / image |
| `.speedup` |  | Make a video 2× faster |
| `.slowmo` |  | Make a video 2× slower |
| `.sticker` | `.s` `.imagesticker` `.vsticker` | Reply to an image / video / GIF to make a sticker |
| `.toimg` | `.toimage` | Reply to a sticker to get it back as an image |
| `.ttp` |  | Text to sticker (optional colour: red/your text) |

**Web & Fun**

| Command | Aliases | What it does |
|---|---|---|
| `.wiki` |  | Wikipedia summary |
| `.github` | `.gh` | GitHub user info |
| `.currency` | `.cur` | Convert currency |
| `.trt` | `.translate` | Translate text (reply or inline) |
| `.detectlang` |  | Detect the language of a replied message |
| `.tts` |  | Text to speech |
| `.short` |  | Shorten a URL |
| `.ss` | `.screenshot` | Screenshot of a website |
| `.movie` |  | Movie / series info (needs OMDB_API_KEY) |
| `.meme` |  | Random meme |
| `.animepic` | `.neko` | Random anime picture (waifu, neko, shinobu, megumin, cuddle…) |
| `.locate` |  | Send a place as a location pin |
| `.ocr` |  | Read text from an image (reply) |
| `.removebg` |  | Remove image background (needs REMOVE_BG_API_KEY) |

Send `.help <command>` for usage details.

## Config

Everything is in `config.env` (see `config.env.example`). Highlights: `WORK_TYPE`, `SUDO`, `DATA_DIR`, `PAIR_NUMBER`, `ANTI_LINK`, `AUTO_BIO`, `TZ`, and optional API keys (`OMDB_API_KEY`, `REMOVE_BG_API_KEY`, `WEATHER_API`). You can also change `mode`, `antilink`, `autobio` and `sudo` from chat; those choices are saved in `data.json`.

## What changed vs. the old repo

**Ported:** welcome/goodbye, per-group anti-link, autobio, presence faker (`.scam`), number scan, timed mute, group info, unit converter, translate/TTS/wiki/github/currency/movie/meme/anime/locate/OCR/remove.bg/screenshot/short-url, text-to-sticker, media effects (bass, nightcore, reverse, blur...), YouTube/Instagram/TikTok/Facebook downloaders.

**Left out on purpose:** the spam commands (spam, audio/foto/sticker/vid spam; they get numbers banned and are harassment tools), remote plugin install, `term` / eval shell access, Heroku var/dyno control, the Telegram/IP-address-based "textmaker" and DeepAI scrapers (dead or key-locked endpoints), the multi-language JSON files (English only now). The old repo also shipped hard-coded third-party API keys (OMDb, wit.ai); those are removed. Use your own keys in `config.env`.

## Troubleshooting

- **Nothing happens when I send a command:** in `private` mode only messages sent from *your own account* (or `SUDO` numbers) work. Send it from your phone in any chat.
- **Group commands say "I need to be admin":** the bot account (your account) must be a group admin.
- **Downloads fail:** YouTube changes often. Update yt-dlp (`yt-dlp -U`); the Docker image does this on each start. For Instagram or age-gated videos set `YTDLP_COOKIES`.
- **Set `LOG_LEVEL=info`** in `config.env` to see Baileys' own logs when debugging connection problems.
