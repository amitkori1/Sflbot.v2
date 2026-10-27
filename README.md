# SFL Bot v3.1

WhatsApp userbot on modern Baileys, built to run 24/7 in Docker (Render, VPS, Railway…).
v3.1 brings over almost everything useful from the old WhatsAsena / sflbot2.1 repos, rewritten so it works today, and adds a **SimSimi chatbot**.

> Requires Node 20+ (the Dockerfile uses Node 22). Userbots are against WhatsApp's terms: use a number you can afford to lose and don't spam.

## 1. Deploy on Render (Docker) - step by step

1. Push this folder to your GitHub repo. **Do not commit `config.env`** (it is git-ignored). If an old `config.env` is already in your repo, delete it from GitHub.
2. Render → your service → **Environment** → add variables (see `config.env.example`). The minimum:
   | Variable | Value |
   |---|---|
   | `PAIR_NUMBER` | your number, digits only, with country code |
   | `WORK_TYPE` | `public` or `private` |
   | `KEEP_ALIVE_URL` | `https://YOUR-APP.onrender.com` |
   | `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | *(recommended)* free Redis from upstash.com, so login + data survive restarts |
3. Open **`https://YOUR-APP.onrender.com/pair`** on your phone. Tap **Get a new code**, then on the same phone: WhatsApp → Linked devices → Link a device → *Link with phone number instead* → type the code **immediately** (it lasts about a minute). No need to read logs.
4. When it says *linked*, you get an "Online" message in your own chat. Done.
5. **Keeping the login:**
   - With Upstash set, the bot saves its own session and restores it after every deploy.
   - Without Upstash (Render free wipes the disk): send `.session` to the bot **once**. It sends the string to your own chat. Save it as the `ASENA_SESSION` variable.
6. Add a free uptime pinger (UptimeRobot etc.) on your URL so the free instance never sleeps.

**Run only one copy of the bot per session**, otherwise WhatsApp logs you out.

### VPS / local
```bash
cp config.env.example config.env && npm install
npm run qr        # QR (or pairing code if PAIR_NUMBER is set), then:
npm start         # or: pm2 start ecosystem.config.js
```

## 2. SimSimi chatbot

| Command | What it does |
|---|---|
| `.simi hello` | ask once (anyone, in public mode) |
| `.simi on` / `.simi off` | auto-reply in **this** chat (owner) |
| `.simi all on` | answer every private chat; in groups only when mentioned / replied to / "Simi …" (owner) |
| `.simi lang hi` / `auto` | language for this chat |
| `.simi status` | which backend is answering |
| `Simi how are you` | typing the trigger word works in any chat (owner) |
| `.vtalk` | reply to a voice note: it listens, answers in text **and** voice |
| `.voicy` | reply to a voice note: speech → text |

Backends, tried in order (a failing one is skipped for 5 minutes): **official SimSimi API** (set `SIMSIMI_API_KEY`) → api.simsimi.vn → api.simsimi.net → Brainshop (optional).
The free unofficial servers come and go, so for reliable answers get a key at workshop.simsimi.com. Built-in safety: max 1 reply / 2.5 s and 25 / 10 min per chat, a short human-like typing pause, and the bot never reacts to its own messages.

## 3. All commands (prefix `.` `!` `;`, 🌐 = usable by everyone in `public` mode)

**SimSimi Chatbot**

| Command | Also works as | What it does |
|---|---|---|
| `.simi` | `.simsimi` | Chat with SimSimi. Owner: simi on/off/all on/all off/lang xx/status 🌐 |
| `.voicy` | `.stt` | Voice note → text (reply to a voice message, max 20s) 🌐 |
| `.vtalk` |  | Voice chat with SimSimi (reply to a voice note) 🌐 |

**Chat**

| Command | Also works as | What it does |
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

**Group Admin**

| Command | Also works as | What it does |
|---|---|---|
| `.ban` | `.kick` | Remove a member (reply / mention / number) |
| `.add` |  | Add members by number |
| `.promote` |  | Make a member admin |
| `.demote` |  | Remove admin rights from a member |
| `.mute` |  | Only admins can send. Optional timer. |
| `.unmute` |  | Let everyone send messages |
| `.invite` |  | Get the group invite link |
| `.ginfo` | `.whois` | Group info, with a members-by-country breakdown |
| `.antilink` |  | Remove members who post links |
| `.welcome` |  | Set the welcome message ({user} {group} placeholders, # = new line) |
| `.goodbye` |  | Set the goodbye message ({user} {group} placeholders, # = new line) |
| `.tagall` |  | Tag all members (optional message) |
| `.tagadmin` |  | Tag all admins |

**Media**

| Command | Also works as | What it does |
|---|---|---|
| `.sticker` | `.s` `.imagesticker` `.vsticker` | Reply to an image / video / GIF to make a sticker |
| `.toimg` | `.toimage` | Reply to a sticker to get it back as an image |

**Text Stickers**

| Command | Also works as | What it does |
|---|---|---|
| `.ttp` | `.wttp` | Text → sticker (optional colour: red/your text) 🌐 |
| `.bttp` |  | Text → blue sticker 🌐 |
| `.gttp` |  | Text → green sticker 🌐 |
| `.pttp` |  | Text → pink sticker 🌐 |
| `.rttp` |  | Text → red sticker 🌐 |
| `.yttp` | `.ettp` | Text → yellow sticker 🌐 |
| `.sttp` | `.http` | Text → silver sticker 🌐 |
| `.attp` |  | Text → animated rainbow sticker 🌐 |
| `.allttp` | `.ahttp` | Text → one sticker in every colour 🌐 |

**Logo Maker**

| Command | Also works as | What it does |
|---|---|---|
| `.textneon` | `.text2neon` `.text3neon` `.text4neon` `.text5neon` … | Logo: Glowing neon sign 🌐 |
| `.textpink` | `.text2pink` | Logo: Pink neon 🌐 |
| `.textgold` | `.text2gold` | Logo: Shiny gold 🌐 |
| `.textfire` | `.text2fire` `.text3fire` `.textmagma` | Logo: Burning fire 🌐 |
| `.textice` | `.textsnow` | Logo: Frozen ice 🌐 |
| `.textblood` | `.text2blood` | Logo: Horror blood 🌐 |
| `.textglitch` | `.text2glitch` | Logo: Digital glitch 🌐 |
| `.text3d` |  | Logo: 3D extruded text 🌐 |
| `.textrainbow` | `.text2gradient` `.textgradient` | Logo: Rainbow gradient 🌐 |
| `.textmetal` | `.textwcolor` | Logo: Chrome metal 🌐 |
| `.textmatrix` | `.textrobo` | Logo: Matrix code rain 🌐 |
| `.textlight` | `.text2light` `.textglow` | Logo: Warm glowing light 🌐 |
| `.textretro` |  | Logo: Retro 80s sunset 🌐 |
| `.textcomic` | `.textjoker` `.textavengers` `.text2marvel` `.textmarvel` | Logo: Comic book 🌐 |
| `.textspace` | `.text2space` `.text3space` `.textsci` | Logo: Deep space 🌐 |
| `.textsand` | `.text2sand` `.text3sand` `.text4sand` | Logo: Writing in sand 🌐 |
| `.textsmoke` |  | Logo: Smoky text 🌐 |
| `.graffiti` | `.text2graf` `.text3graf` `.text4graf` `.textgraf` … | Logo: Street graffiti 🌐 |
| `.textmaker` | `.logo` `.logos` | List logo styles, or make one 🌐 |
| `.carbon` |  | Make a pretty image of code (reply to a message or add code) 🌐 |

**Media Effects**

| Command | Also works as | What it does |
|---|---|---|
| `.tomp3` | `.mp4audio` | Video / voice note → MP3 |
| `.tovoice` | `.unvoice` | Audio / video → WhatsApp voice note |
| `.bass` | `.mp3bass` | Bass-boost audio |
| `.nightcore` |  | Speed up + raise pitch |
| `.slowed` |  | Slow down + lower pitch |
| `.pitch` | `.mp3pitch` | Higher pitch (chipmunk) |
| `.lowpitch` | `.mp3low` | Lower pitch (deep voice) |
| `.echo` |  | Add echo |
| `.loud` | `.mp3volume` | Make audio louder |
| `.eq` | `.mp3eq` | Equalizer + loudness normalise |
| `.crusher` | `.mp3crusher` | Bit-crusher (robot / lo-fi) audio |
| `.x2mp3` |  | Audio at 2× speed |
| `.spectrum` |  | Audio → spectrum video |
| `.waves` |  | Audio → waveform video |
| `.frequency` |  | Audio → frequency-bars video |
| `.avec` |  | Audio → vectorscope video |
| `.cqtaudio` |  | Audio → CQT piano-roll video |
| `.volumeaudio` |  | Audio → volume-meter video |
| `.reverse` | `.mp4reverse` `.mp3reverse` | Reverse audio or video (max 30s) |
| `.bw` | `.mp4bw` `.bwimage` | Black & white |
| `.blur` |  | Blur |
| `.blurbg` | `.mp4blur` `.blurimage` | Fit to 16:9 with a blurred background |
| `.vintage` | `.mp4vintage` `.vintageimage` | Vintage colours |
| `.negative` | `.mp4negative` `.negativeimage` | Colour negative |
| `.edge` | `.mp4edge` `.edgeimage` | Edge detection |
| `.enhance` | `.mp4enhance` `.enhanceimage` | Sharpen / enhance |
| `.color` | `.mp4color` `.colorimage` | Boost contrast & saturation |
| `.art` | `.mp4art` `.artimage` | Emboss / art filter |
| `.rainbow` | `.mp4rainbow` `.rainbowimage` | Rainbow tint |
| `.grain` | `.grenimage` | Film grain / noise |
| `.stab` | `.mp4stab` | Stabilise a shaky video |
| `.speedup` |  | Video 2× faster |
| `.slowmo` |  | Video 2× slower |
| `.slowmotion` | `.mp4slowmo` | Smooth slow-motion (interpolated, short clips) |
| `.half` | `.x2mp4` | Shrink video to 50% size |
| `.quarter` | `.x4mp4` | Shrink video to 25% size |
| `.gif` |  | Video → silent GIF-style loop |
| `.agif` |  | Video → GIF-style loop (with sound) |
| `.img2vid` | `.mp4image` | Image → 6s video |
| `.tblend` |  | Time-blend video effect |
| `.interp` |  | Raise video FPS by interpolation (11–120) |
| `.ffmpeg` |  | Apply your own ffmpeg video filter |
| `.xmedia` | `.effects` | List all audio / video / image effects |

**AI Images**

| Command | Also works as | What it does |
|---|---|---|
| `.colorai` |  | Colourise a black & white photo |
| `.waifuai` |  | Upscale / denoise (anime style) |
| `.superai` |  | Super-resolution: sharper, higher quality photo |
| `.dreamai` |  | DeepDream effect |
| `.toonai` |  | Turn a face photo into a cartoon |
| `.neuraltalkai` |  | Describe what is in a photo |
| `.nudityai` |  | NSFW score of a photo (content moderation) |
| `.ganstyle` |  | Style transfer: reply to a photo + link to a style image |
| `.moodai` |  | Find the mood / sentiment of a text |
| `.textai` |  | Continue a text with AI |
| `.ttiai` |  | Text → image |
| `.faceai` |  | AI-generated face of a person that does not exist |
| `.animai` |  | AI-generated anime face |
| `.deepai` |  | List the AI tools |

**Downloaders**

| Command | Also works as | What it does |
|---|---|---|
| `.ytupdate` |  | Update yt-dlp (fixes broken YouTube downloads) |
| `.song` | `.play` | Download a song from YouTube (name or link) |
| `.video` |  | Download a video from YouTube (name or link, 480p) |
| `.yt` | `.ytsearch` | Search YouTube |
| `.dl` | `.insta` `.tiktok` `.fb` `.ig` … | Download a video/photo from Instagram, TikTok, Facebook, X… (link) |

**Web & Fun**

| Command | Also works as | What it does |
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

**Tools**

| Command | Also works as | What it does |
|---|---|---|
| `.covid` |  | COVID-19 statistics (world or a country) 🌐 |
| `.lyric` | `.lyrics` | Song lyrics 🌐 |
| `.img` | `.image` | Search images (SafeSearch on) 🌐 |
| `.wallpaper` | `.wp` | Random HD wallpaper (SFW) 🌐 |
| `.paste` | `.nekobin` | Upload replied text to paste.rs and get a link 🌐 |
| `.trumpsay` |  | Tweet as Trump (text) 🌐 |
| `.changesay` |  | "Change my mind" sign (text) 🌐 |
| `.animesay` |  | Anime character says it (text) 🌐 |
| `.animegif` |  | Random anime GIF (hug, kiss, pat, cuddle, cry, bonk…) 🌐 |
| `.speedtest` |  | Test the bot server's internet speed |
| `.mediainfo` |  | Technical info about a replied audio / video / image |
| `.report` |  | Report the replied message to the group admins 🌐 |
| `.log` |  | Save the replied group message to your own chat |
| `.download` | `.fetch` | Download a direct file link and send it (max 60MB) |

**Utilities**

| Command | Also works as | What it does |
|---|---|---|
| `.sysd` |  | Show system information |
| `.info` |  | Bot info |
| `.calc` |  | Calculate a math expression |
| `.weather` |  | Weather for a city |
| `.scan` |  | Check if a number is on WhatsApp |
| `.unit` |  | Convert units (length, weight, temp, data, time) |

**Profile**

| Command | Also works as | What it does |
|---|---|---|
| `.autobio` |  | Auto-update your bio with time & date |
| `.presence` | `.scam` | Fake "typing…" / "recording…" / "online" in this chat |
| `.kickme` |  | Leave the current group |
| `.block` |  | Block a user (reply / mention, or in their PM) |
| `.unblock` |  | Unblock a user |
| `.jid` |  | Get the JID of a user or this chat |
| `.pp` |  | Set your profile picture from a replied image |
| `.setbio` |  | Set your WhatsApp About/bio |

**Owner Tools**

| Command | Also works as | What it does |
|---|---|---|
| `.session` |  | Send your login session string to your own chat (keep it secret!) |
| `.blockchat` |  | Ignore everyone but you in this chat (or a given JID) |
| `.unblockchat` |  | Re-enable the bot in this chat (or a given JID) |
| `.pmsend` |  | Reply to a message: send that person a private message |
| `.pmttssend` |  | Reply to a message: send that person a voice message |
| `.term` | `.sh` | Run a shell command on the server (needs ALLOW_TERM=true) |

**Bot**

| Command | Also works as | What it does |
|---|---|---|
| `.alive` |  | Check if the bot is alive |
| `.ping` |  | Check bot response time |
| `.help` | `.menu` `.commands` | Show commands. Usage: .help [command] |
| `.restart` |  | Restart the bot (needs PM2 / Docker / systemd to come back up) |
| `.mode` |  | Switch between private and public mode |
| `.sudo` |  | Manage sudo users (they can use owner commands) |

`.help <command>` shows usage. `.xmedia` lists every audio / video / image effect. Old command names from the previous bot (`.mp4bw`, `.mp3bass`, `.text2fire`, `.unvoice`…) still work as aliases.

## 4. API keys

`src/config.js` contains defaults so features work out of the box. Three of them are the **shared keys that shipped in the old repos** (OpenWeather, OMDb, wit.ai). They are not yours and may be rate-limited or revoked at any time. Put your own in the environment variables to override them. DeepAI and OCR.space use their public demo keys. remove.bg has no default.

## 5. What was left out (on purpose)

- **Spam commands** (spam / audio / photo / sticker / video spam, `.stam` mass-DM): they get numbers banned and are harassment tools.
- **Remote plugin install, `.print`, `.bashmedia`, `.addserver`**: they run remote code or read arbitrary server files. `.term` exists but is **off** unless `ALLOW_TERM=true`, and works for your own account only.
- **`wallpaper.js`** from the old repo was obfuscated code, so I wrote a clean replacement. NSFW anime pictures were not ported.
- Auto-joining the original author's support groups and fetching remote text snippets from a gist (old `bot.js`).
- Heroku controls, Eva (it used a closed npm package: replaced by SimSimi), the dead textmaker/xteam web APIs (replaced by local logo rendering), the translation JSON files.

## 6. Notes

- **Fonts:** the Docker image has only DejaVu fonts, so text stickers / logos / carbon render Latin, Greek and Cyrillic. Hindi, Arabic or CJK text would show boxes unless you add a font package (e.g. `fonts-noto-core`) to the Dockerfile.
- **yt-dlp** is updated 25 s after start and with `.ytupdate`. Instagram / age-gated videos may need `YTDLP_COOKIES`.
- Links given to public commands are checked so they can never reach the server's own network (SSRF protection).
- Troubleshooting: `LOG_LEVEL=info` shows Baileys' own logs; `/health` shows connection state.
