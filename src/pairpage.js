// Phone-friendly page to link WhatsApp by pairing code:  https://YOUR-APP.onrender.com/pair
// Shows the CURRENT code with its age and a "new code" button, so you never type a stale code from the logs.
const config = require('./config');

const esc = (s) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function mount(app, S, actions) {
    const authorized = (req) => !config.PAIR_TOKEN || req.query.token === config.PAIR_TOKEN;

    function status() {
        const linked = S.connected;
        const hasNumber = !!config.PAIR_NUMBER;
        let state = 'waiting';
        if (linked) state = 'linked';
        else if (!hasNumber) state = 'no-number';
        else if (S.pairing?.code) state = 'code';
        return {
            state,
            code: state === 'code' ? S.pairing.code : null,
            ageSec: state === 'code' ? Math.round((Date.now() - S.pairing.at) / 1000) : null,
            number: hasNumber ? '•••• ' + config.PAIR_NUMBER.slice(-4) : null,
        };
    }

    app.get('/pair/status', (req, res) => {
        if (!authorized(req)) return res.status(403).json({ error: 'forbidden' });
        const st = status();
        // once linked, never reveal anything else
        res.json(st);
    });

    app.post('/pair/new', async (req, res) => {
        if (!authorized(req)) return res.status(403).json({ error: 'forbidden' });
        if (S.connected) return res.json({ ok: false, message: 'Already linked.' });
        const r = await actions.requestNewCode();
        res.json(r);
    });

    app.get('/pair', (req, res) => {
        if (!authorized(req)) return res.status(403).send('Forbidden. Add ?token=YOUR_PAIR_TOKEN to the address.');
        const token = config.PAIR_TOKEN ? `?token=${encodeURIComponent(config.PAIR_TOKEN)}` : '';
        res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>SFL Bot – link WhatsApp</title>
<style>
body{font-family:system-ui,sans-serif;background:#0b141a;color:#e9edef;margin:0;padding:24px;max-width:520px;margin:auto}
h1{font-size:20px} .card{background:#111b21;border-radius:14px;padding:20px;margin:16px 0}
.code{font-family:ui-monospace,monospace;font-size:40px;letter-spacing:4px;text-align:center;padding:14px 0;color:#25d366}
.muted{color:#8696a0;font-size:14px} button{width:100%;padding:14px;font-size:16px;border:0;border-radius:10px;background:#25d366;color:#04210f;font-weight:600}
button:disabled{opacity:.5} ol{padding-left:20px;line-height:1.6} .ok{color:#25d366;font-size:22px;text-align:center}
.warn{color:#ffb74d}
</style></head><body>
<h1>🤖 SFL Bot – link WhatsApp</h1>
<div class="card" id="box">Loading…</div>
<div class="card muted"><b>How to link</b><ol>
<li>Tap <b>Get a new code</b> below (a fresh code is made every time).</li>
<li>On the phone: WhatsApp → <b>Linked devices</b> → <b>Link a device</b> → <b>Link with phone number instead</b>.</li>
<li>Type the code <b>right away</b>. It stops working after about a minute.</li></ol></div>
<script>
const T=${JSON.stringify(token)};
const box=document.getElementById('box');
let busy=false;
async function load(){
  try{
    const r=await (await fetch('/pair/status'+T)).json();
    if(r.error){box.innerHTML='Forbidden';return;}
    if(r.state==='linked'){box.innerHTML='<div class="ok">✅ WhatsApp is linked</div><p class="muted" style="text-align:center">You can close this page.</p>';return;}
    if(r.state==='no-number'){box.innerHTML='<p class="warn">PAIR_NUMBER is not set. Add it in your environment variables (digits only, with country code).</p>';return;}
    let html='';
    if(r.state==='code'){
      const old=r.ageSec>75;
      html+='<div class="muted">Code for '+r.number+'</div><div class="code">'+r.code.replace(/(.{4})(.{4})/,'$1-$2')+'</div>';
      html+='<div class="muted" style="text-align:center">made '+r.ageSec+'s ago '+(old?'<span class="warn">– probably expired, get a new one</span>':'')+'</div>';
    }else{
      html+='<p class="muted">Waiting for the bot to connect… </p>';
    }
    html+='<br><button id="nb" '+(busy?'disabled':'')+' onclick="nw()">Get a new code</button>';
    box.innerHTML=html;
  }catch(e){box.innerHTML='Cannot reach the bot (it may be starting). Retrying…';}
}
async function nw(){busy=true;load();await fetch('/pair/new'+T,{method:'POST'});setTimeout(()=>{busy=false;load();},4000);}
load();setInterval(load,3000);
</script></body></html>`);
    });
}

module.exports = { mount };
