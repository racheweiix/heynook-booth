/* Booth 01 mini games: shared helpers. The stage scales to fit; everything animates on twos; WebAudio for the sounds. */
(function () {
  const G = window.G = {};
  G.base = document.currentScript.src.replace(/common\.js.*$/, '');      // games/ folder (assets/ is linked inside it)
  G.stage = document.getElementById('stage');
  G.fit = () => {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    G.s = s; G.ox = (innerWidth - 1920 * s) / 2; G.oy = (innerHeight - 1080 * s) / 2;
    G.stage.style.transform = `translate(${G.ox}px,${G.oy}px) scale(${s})`;
  };
  addEventListener('resize', G.fit); G.fit();
  G.pt = e => ({ x: (e.clientX - G.ox) / G.s, y: (e.clientY - G.oy) / G.s });
  G.$ = (html, parent = G.stage) => { const t = document.createElement('template'); t.innerHTML = html.trim(); const el = t.content.firstChild; parent.appendChild(el); return el; };
  G.wait = ms => new Promise(r => setTimeout(r, ms));
  let seed = 11; G.rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ---- motion on twos ----
  const TWO = 2 / 30;
  G.EASE = {
    linear: p => p, out: p => 1 - (1 - p) * (1 - p), in: p => p * p, inout: p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2,
    back: p => { const c = 1.7; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }, sine: p => -(Math.cos(Math.PI * p) - 1) / 2,
  };
  G.tween = (dur, fn, ease = 'out', twos = true) => new Promise(res => {
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / 1000 / dur);
      const q = p >= 1 ? 1 : twos ? Math.floor(p * dur / TWO) * TWO / dur : p;
      fn(G.EASE[ease](q), q);
      if (p < 1) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  G.place = (el, x, y, r = 0, s = 1) => { el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`; el._x = x; el._y = y; };
  G.slideTo = (el, x, y, dur = .3, ease = 'out', r = 0) => { const x0 = el._x || 0, y0 = el._y || 0; return G.tween(dur, e => G.place(el, x0 + (x - x0) * e, y0 + (y - y0) * e, r)); };

  // ---- paper pieces ----
  G.strip = async (text, x, y, opts = {}) => {
    const rot = opts.rot ?? (G.rnd() - .5) * 3;
    const el = G.$(`<div class="strip"><span></span><i class="car"></i><i class="tape" style="left:-34px;top:-6px;transform:rotate(-24deg)"></i><i class="tape" style="right:-34px;bottom:-8px;transform:rotate(-20deg)"></i></div>`);
    const sp = el.querySelector('span'); sp.textContent = text; await document.fonts.ready; el.style.width = (el.offsetWidth + 8) + 'px'; sp.textContent = '';
    G.place(el, -2400, y, rot); G.sfx('paper', -14);
    await G.slideTo(el, x, y, .28, 'out', rot);
    for (let j = 1; j <= text.length; j++) { sp.textContent = text.slice(0, j); if (text[j - 1] !== ' ') G.key(); await G.wait(1000 / (opts.cps || 38)); }
    G.ding(); return el;
  };
  G.unstrip = async el => { if (!el) return; G.sfx('whoosh-short', -20); await G.slideTo(el, 2100, el._y, .26, 'in'); el.remove(); };
  G.stamp = async (text, x, y, color = 'var(--mustard)', rot = -8, z = 40) => {
    const el = G.$(`<div class="stamp" style="color:${color};z-index:${z}">${text}</div>`);
    G.sfx('stamp', -6); await G.tween(.12, e => G.place(el, x, y, rot, 1.9 - .9 * e)); return el;
  };
  G.wipe = async (mid) => {           // a torn charcoal sheet sweeps across, the scene changes under it
    const el = G.$('<svg class="wipe" viewBox="0 0 2100 1080"><path fill="#2A2826"/></svg>');
    let d = 'M90 0'; for (let y = 0; y <= 1080; y += 30) d += ` L${(90 + (G.rnd() - .5) * 40).toFixed(0)} ${y}`;
    d += ' L2010 1080'; for (let y = 1080; y >= 0; y -= 30) d += ` L${(2010 + (G.rnd() - .5) * 40).toFixed(0)} ${y}`;
    el.querySelector('path').setAttribute('d', d + ' Z');
    G.sfx('whoosh-short', -12); G.sfx('paper', -14);
    await G.tween(.36, e => G.place(el, -2100 + 2010 * e, 0), 'inout');
    if (mid) await mid();
    await G.tween(.36, e => G.place(el, -90 + 2000 * e, 0), 'inout'); el.remove();
  };
  G.button = (label, x, y, onTap, main = false) => {
    const b = G.$(`<button class="btn${main ? ' main' : ''}">${label}</button>`); G.place(b, x, y);
    b.addEventListener('pointerup', () => { G.sfx('click', -10); onTap(); }); return b;
  };

  // ---- sound ----
  const NAMES = ['paper', 'pop', 'click-soft', 'click', 'stamp', 'sparkle', 'whoosh-short', 'tick', 'scribble', 'impact-bass-1', 'flip', 'rip'];
  G.buf = {};
  G.audio = async () => {
    if (G.ac) { if (G.ac.state === 'suspended') G.ac.resume(); return; }
    G.ac = new (window.AudioContext || window.webkitAudioContext)();
    G.out = G.ac.createGain(); G.out.gain.value = .9; G.out.connect(G.ac.destination);
    await Promise.all(NAMES.map(async n => { try { G.buf[n] = await G.ac.decodeAudioData(await (await fetch(G.base + 'assets/sfx/' + n + '.mp3')).arrayBuffer()); } catch (e) {} }));
  };
  const gain = db => { const g = G.ac.createGain(); g.gain.value = Math.pow(10, db / 20); g.connect(G.out); return g; };
  G.sfx = (n, db = -8, rate = 1) => { if (!G.ac || !G.buf[n]) return; const s = G.ac.createBufferSource(); s.buffer = G.buf[n]; s.playbackRate.value = rate; s.connect(gain(db)); s.start(); };
  G.music = async (file, db = -17) => {
    if (!G.ac || G.musicSrc) return;
    try {
      const b = await G.ac.decodeAudioData(await (await fetch(G.base + 'assets/music/' + file)).arrayBuffer());
      const s = G.ac.createBufferSource(); s.buffer = b; s.loop = true; G.musicGain = gain(db); s.connect(G.musicGain); s.start(); G.musicSrc = s;
    } catch (e) {}
  };
  const noise = (d, lo, hi) => { const n = Math.floor(d * G.ac.sampleRate), b = G.ac.createBuffer(1, n, G.ac.sampleRate), c = b.getChannelData(0); for (let i = 0; i < n; i++) c[i] = Math.random() * 2 - 1; const s = G.ac.createBufferSource(); s.buffer = b; const f = G.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = Math.sqrt(lo * hi); f.Q.value = .8; s.connect(f); return { s, f }; };
  const env = (node, db, a, d) => { const g = G.ac.createGain(), t = G.ac.currentTime, v = Math.pow(10, db / 20); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); node.connect(g); g.connect(G.out); return g; };
  G.key = () => { if (!G.ac) return; const { s, f } = noise(.05, 2000, 7000); env(f, -24 + Math.random() * 3, .001, .03); s.start(); };
  G.ding = () => { if (!G.ac) return; const o = G.ac.createOscillator(); o.frequency.value = 2350; env(o, -24, .002, .5); o.start(); o.stop(G.ac.currentTime + .6); };
  G.tone = (f0, f1, d, db = -16, type = 'sine') => { if (!G.ac) return; const o = G.ac.createOscillator(), t = G.ac.currentTime; o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d); env(o, db, .01, d); o.start(); o.stop(t + d + .05); };
  G.boing = () => G.tone(260, 150, .3, -14, 'triangle');
  G.ping = () => { G.tone(1320, 1320, .12, -18); setTimeout(() => G.tone(1980, 1980, .16, -20), 90); };
  G.snip = () => { if (!G.ac) return; const { s, f } = noise(.1, 3000, 9000); env(f, -10, .001, .05); s.start(); G.tone(3100, 2900, .06, -22); };
  G.whirr = (d = .6, db = -18) => {                 // a printer feeding: band-passed noise with a motor flutter
    if (!G.ac) return; const sr = G.ac.sampleRate, n = Math.floor(d * sr), b = G.ac.createBuffer(1, n, sr), c = b.getChannelData(0);
    for (let i = 0; i < n; i++) { const t = i / sr; c[i] = (Math.random() * 2 - 1) * (.55 + .45 * Math.sin(t * 2 * Math.PI * 34)) * Math.min(1, t * 25, (d - t) * 25); }
    const s = G.ac.createBufferSource(); s.buffer = b; const f = G.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 1.1;
    s.connect(f); f.connect(gain(db)); s.start();
  };
  G.beep = () => { G.tone(1900, 1900, .07, -16, 'square'); setTimeout(() => G.tone(2500, 2500, .09, -16, 'square'), 110); };

  // ---- paper people (from Booth 02's puppets, in muted newsprint clothes so the badges and cards carry the colour) ----
  const HAIR = {
    bob: ['', '<path d="M50 122 Q46 56 100 54 Q154 56 150 122 Q146 96 132 88 Q100 80 68 88 Q54 96 50 122Z" fill="H"/>'],
    short: ['', '<path d="M54 108 Q58 60 100 58 Q142 60 146 108 Q134 84 100 80 Q66 84 54 108Z" fill="H"/>'],
    bun: ['', '<circle cx="100" cy="52" r="22" fill="H"/><path d="M54 108 Q58 62 100 60 Q142 62 146 108 Q132 86 100 82 Q68 86 54 108Z" fill="H"/>'],
    curly: ['', '<path d="M50 112 Q40 70 70 60 Q86 44 104 54 Q124 44 138 62 Q162 74 150 112 Q140 88 100 84 Q60 88 50 112Z" fill="H"/>'],
    long: ['<path d="M48 120 Q42 54 100 52 Q158 54 152 120 L156 196 Q100 206 44 196Z" fill="H"/>', '<path d="M52 112 Q56 58 100 56 Q144 58 148 112 Q130 80 100 78 Q70 80 52 112Z" fill="H"/>'],
    hijab: ['<path d="M40 200 Q32 120 50 80 Q100 28 150 80 Q168 120 160 200 Z" fill="H"/>', '<path d="M54 104 Q100 56 146 104 Q142 70 100 64 Q58 70 54 104Z" fill="H"/>'],
    bald: ['', ''],
  };
  G.SKIN = ['#F2C7A5', '#E9B892', '#C68E6A', '#8D5A3B', '#F5D3B3', '#B57A55'];
  G.SHIRT = ['#3A3836', '#5D6670', '#7A6250', '#6F7255', '#4A5568', '#B9A88A', '#9A5B3C', '#8C8478', '#55606B'];
  G.HAIRC = ['#2B2230', '#3A2A22', '#1E1A1A', '#5A3A2A', '#6B4E3A'];
  G.HAIRS = Object.keys(HAIR);
  G.look = i => {                           // a stable look for person i
    const r = k => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
    const hair = ['bob', 'short', 'bun', 'curly', 'long', 'short', 'hijab', 'bald', 'curly', 'bob'][Math.floor(r(1) * 10)];
    return { skin: G.SKIN[Math.floor(r(2) * G.SKIN.length)], shirt: G.SHIRT[Math.floor(r(3) * G.SHIRT.length)], hair,
      hairC: hair === 'hijab' ? ['#6F5B7E', '#4F6B6A', '#8A5A5A', '#3E4A5E'][Math.floor(r(4) * 4)] : G.HAIRC[Math.floor(r(4) * G.HAIRC.length)], glasses: r(5) < .3 };
  };
  const faceSVG = o => '<circle cx="100" cy="112" r="48" fill="' + o.skin + '"/>' + HAIR[o.hair][1].replace(/H"/g, o.hairC + '"')
    + '<circle class="nb" cx="84" cy="116" r="5.5" fill="#1d1d2b"/><circle class="nb" cx="116" cy="116" r="5.5" fill="#1d1d2b"/>'
    + (o.glasses ? '<circle class="ln" cx="84" cy="116" r="12" style="stroke-width:4"/><circle class="ln" cx="116" cy="116" r="12" style="stroke-width:4"/><path class="ln" d="M96 116 H104" style="stroke-width:4"/>' : '')
    + '<path class="ln br" d="M74 104 L92 98 M126 104 L108 98"/>'
    + '<path class="ln ms" d="M88 136 Q100 146 112 136"/><path class="ln mf" d="M88 143 Q100 133 112 143"/><circle class="nb mo" cx="100" cy="140" r="7" fill="#7A2230"/>';
  G.personSVG = o => '<svg viewBox="0 0 200 420">'
    + '<rect x="70" y="300" width="27" height="112" rx="12" fill="' + (o.pants || '#2B2F45') + '"/><rect x="103" y="300" width="27" height="112" rx="12" fill="' + (o.pants || '#2B2F45') + '"/>'
    + '<ellipse cx="80" cy="412" rx="22" ry="10" fill="#1d1d2b"/><ellipse cx="120" cy="412" rx="22" ry="10" fill="#1d1d2b"/>'
    + '<rect x="50" y="182" width="24" height="104" rx="12" fill="' + o.shirt + '"/><circle cx="62" cy="290" r="14" fill="' + o.skin + '"/>'
    + '<path d="M54 178 Q100 152 146 178 L152 312 Q100 326 48 312 Z" fill="' + o.shirt + '"/>'
    + '<g class="arm"><rect x="126" y="182" width="24" height="104" rx="12" fill="' + o.shirt + '"/><circle cx="138" cy="290" r="14" fill="' + o.skin + '"/></g>'
    + HAIR[o.hair][0].replace(/H"/g, o.hairC + '"')
    + '<rect x="88" y="146" width="24" height="34" rx="8" fill="' + o.skin + '"/>' + faceSVG(o)
    + '<g class="slot" transform="translate(100 262)"></g></svg>';
  // a head-and-shoulders crop of the same person, for headshots printed on cards
  G.headSVG = (o, bg = '#E9EEF5') => '<svg class="hs" viewBox="30 42 140 140" style="display:block;width:100%;height:100%;background:' + bg + '">'
    + HAIR[o.hair][0].replace(/H"/g, o.hairC + '"') + '<path d="M30 200 Q34 176 100 168 Q166 176 170 200Z" fill="' + o.shirt + '"/>'
    + '<rect x="88" y="146" width="24" height="30" rx="8" fill="' + o.skin + '"/>' + faceSVG(o) + '</svg>';
  G.person = (o, parent) => { const el = G.$(`<div class="pup">${G.personSVG(o)}</div>`, parent); el._o = o; el._s = o.s || 1; return el; };
  G.at = (el, x, y, r = 0, s = el._s || 1) => { el.style.transform = `translate(${x - 100}px,${y - 420}px) rotate(${r}deg) scale(${s})`; el._x = x; el._y = y; el._s = s; };
  G.mood = (el, m) => { el.classList.remove('frown', 'wow'); if (m) el.classList.add(m); };
  G.walk = (el, x, y = el._y, speed = 460) => {   // a bobbing walk on twos; a newer walk on the same person takes over
    const id = el._wk = (el._wk || 0) + 1, x0 = el._x, y0 = el._y, d = Math.hypot(x - x0, y - y0);
    if (d < 2) return Promise.resolve();
    return G.tween(d / speed, (e, q) => { if (el._wk !== id) return; const ph = q * d / 34; G.at(el, x0 + (x - x0) * e, y0 + (y - y0) * e - Math.abs(Math.sin(ph * Math.PI)) * 9, Math.sin(ph * Math.PI) * 3); }, 'linear');
  };

  // ---- the PVC card: the Makers Fest '26 design from the team's canvas, one background per attendee type ----
  // one design, a different background for each attendee type (the Makers Fest '26 card from the PVC design canvas)
  G.TH = {
    SPEAKER: { bg: '#FFFFFF', ink: '#1F2937', sub: '#4B5563', a: '#2563EB', b: '#F5B400', c: '#16A34A', d: '#EF4444' },
    VIP: { bg: '#15171F', ink: '#FFFFFF', sub: '#C9CED8', a: '#D4A72C', b: '#F1D27A', c: '#8C6D1F', d: '#FFFFFF' },
    DELEGATE: { bg: '#EEF8F1', ink: '#14301F', sub: '#3F5A49', a: '#16A34A', b: '#86D3A6', c: '#0E7C3A', d: '#F5B400' },
    MEDIA: { bg: '#FFF1EE', ink: '#3B1410', sub: '#6B3A33', a: '#EF4444', b: '#F9A8A0', c: '#B91C1C', d: '#2563EB' },
  };
  G.SIL = '<svg viewBox="30 42 140 140" style="display:block;width:100%;height:100%;background:#D7D9DE"><circle cx="100" cy="108" r="40" fill="#9A9DA5"/><path d="M38 190 Q44 156 100 150 Q156 156 162 190Z" fill="#9A9DA5"/></svg>';
  G.cardHTML = (g, type, photo = g.photo) => {
    const t = G.TH[type], head = photo ? G.headSVG(g.look, type === 'VIP' ? '#2A2D38' : '#E9EEF5') : G.SIL;
    return `<div style="position:relative;width:208px;height:325px;overflow:hidden;background:${t.bg};font-family:'Outfit',system-ui,sans-serif;color:${t.ink}">
  <div style="position:absolute;right:-46px;top:-46px;width:130px;height:130px;border-radius:50%;background:${t.a}"></div>
  <div style="position:absolute;left:-38px;top:140px;width:76px;height:76px;border-radius:50%;background:${t.b}"></div>
  <svg width="30" height="30" viewBox="0 0 30 30" style="position:absolute;right:12px;top:150px;transform:rotate(14deg)"><path d="M15 2L28 27H2z" fill="${t.d}"/></svg>
  <div style="position:absolute;right:-40px;bottom:-40px;width:112px;height:112px;border-radius:50%;background:${t.c}"></div>
  <div style="position:absolute;left:18px;top:232px;width:14px;height:14px;border-radius:50%;border:3px solid ${t.a};box-sizing:border-box"></div>
  <div style="position:absolute;inset:0;box-sizing:border-box;padding:28px 14px 14px;display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;gap:6px"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:2px;width:14px">
  <div style="width:6px;height:6px;border-radius:50%;background:#2563EB"></div><div style="width:6px;height:6px;border-radius:50%;background:#EF4444"></div>
  <div style="width:6px;height:6px;border-radius:50%;background:#F5B400"></div><div style="width:6px;height:6px;border-radius:50%;background:#16A34A"></div></div>
  <div style="font-size:13px;font-weight:800;letter-spacing:-0.02em;line-height:1">makers fest <span style="color:${t.a}">'26</span></div></div>
  <div style="margin-top:16px;align-self:center;width:104px;height:104px;border-radius:50%;padding:4px;box-sizing:border-box;background:conic-gradient(${t.a} 0 25%,${t.d} 0 50%,${t.b} 0 75%,${t.c} 0)">
  <div style="width:96px;height:96px;border-radius:50%;overflow:hidden;border:3px solid ${t.bg};box-sizing:border-box">${head}</div></div>
  <div style="margin-top:10px;font-size:19px;font-weight:700;line-height:1.1;letter-spacing:-0.02em;text-align:center">${g.name}</div>
  <div style="margin-top:3px;font-size:9px;color:${t.sub};text-align:center">${g.title}</div>
  <div style="margin-top:1px;font-size:9px;font-weight:600;color:${t.a};text-align:center">${g.co}</div>
  <div style="flex:1"></div>
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px"><div style="display:flex;flex-direction:column;gap:6px">
  <div style="align-self:flex-start;padding:4px 10px;border-radius:999px;background:${t.a};color:${type === 'VIP' ? '#15171F' : '#FFFFFF'};font-weight:700;font-size:8px;letter-spacing:0.1em">${type}</div>
  <div style="font-size:7.5px;line-height:1.4;font-weight:500;color:${t.sub}">12 DEC 2026<br>SINGAPORE</div></div>
  <div style="width:48px;height:48px;padding:4px;box-sizing:border-box;border-radius:10px;background:#FFFFFF;border:2px solid #1F2937;
   background-image:repeating-conic-gradient(#1F2937 0 25%,#fff 0 50%);background-size:8px 8px;background-clip:content-box"></div></div></div></div>`;
  };

  // ---- the countdown watch ----
  G.watch = (secs, x, y, onEnd) => {
    const el = G.$(`<div class="watch">${secs}</div>`); G.place(el, x, y); G.sfx('stamp', -14);
    let left = secs; const t = setInterval(() => { left--; el.textContent = Math.max(0, left); G.sfx('tick', -20); if (left <= 0) { clearInterval(t); onEnd && onEnd(); } }, 1000);
    return { el, stop() { clearInterval(t); }, get left() { return left; } };
  };

  // ---- the title card and the result card (same for every game) ----
  G.titleCard = (kicker, title, sub, onPlay) => {
    const t = G.$(`<div class="card" style="left:560px;top:300px;width:800px;padding:46px 56px;text-align:center">
      <div style="font:500 22px 'Special Elite';letter-spacing:.2em;color:#8a7a5a">${kicker}</div>
      <div style="font:72px/1.05 'Archivo Black';margin:14px 0 10px">${title}</div>
      <div style="font:30px/1.35 'Special Elite'">${sub}</div></div>`);
    const b = G.button('Tap to play ▸', 790, 690, async () => { await G.audio(); G.music('loop.wav'); t.remove(); b.remove(); onPlay(); }, true);
    return t;
  };
  // the result card; with `lb` ({title, score, label, higher}) a leaderboard panel sits beside it
  G.result = async ({ kicker, heads, rows, stamp, stampColor = 'var(--mustard)', game, again, back, lb }) => {
    const dim = G.$('<div data-dim style="position:absolute;inset:0;background:rgba(231,221,198,.72);z-index:41"></div>'); dim.style.opacity = 0;
    G.tween(.3, e => dim.style.opacity = e);
    const L = lb ? 90 : 410, W = lb ? 1030 : 1100;
    const c = G.$(`<div class="card" style="left:${L}px;top:150px;width:${W}px;padding:40px 50px 30px;box-sizing:border-box">
      <div style="font:500 22px 'Special Elite';letter-spacing:.2em;color:#8a7a5a">${kicker}</div>
      <table class="res"><tr><th></th><th>${heads[0]}</th><th>${heads[1]}</th></tr>
      ${rows.map(r => `<tr><td>${r[0]}</td><td class="v old">${r[1]}</td><td class="v">${r[2]}</td></tr>`).join('')}</table></div>`);
    G.sfx('paper', -10); await G.tween(.3, e => G.place(c, 0, 600 * (1 - e), -1));
    const h = c.offsetHeight;
    await G.stamp(stamp, L + W + 20 - 34 * stamp.length, 70, stampColor, -6, 44);
    G.button('Play again', L + W / 2 - 330, 150 + h + 40, again);
    G.button('Back to the board ▸', L + W / 2 - 10, 150 + h + 40, () => { parent.postMessage({ type: 'game-done', game }, '*'); back(); }, true);
    if (lb) G.lbPanel(game, lb);
  };

  // ---- today's leaderboard: top 5 per game, kept on this screen (localStorage), initials only ----
  G.lb = {
    mem: {},
    day() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
    load(game) {
      try { const v = JSON.parse(localStorage.getItem('booth01-lb-' + game) || 'null'); return v && v.day === G.lb.day() ? v.rows : []; }
      catch (e) { return G.lb.mem[game] || []; }
    },
    save(game, rows) { G.lb.mem[game] = rows; try { localStorage.setItem('booth01-lb-' + game, JSON.stringify({ day: G.lb.day(), rows })); } catch (e) {} },
    place(rows, score, higher) { let i = rows.findIndex(r => higher ? score > r.score : score < r.score); if (i < 0) i = rows.length; return i < 5 ? i : -1; },
  };
  G.lbPanel = (game, lb) => {
    const p = G.$('<div class="card lbp"></div>'); G.place(p, 0, 0, 1);
    const head = `<div class="lbk">TODAY'S TOP 5 · ${lb.title}</div>`;
    const list = hi => {
      const rows = G.lb.load(game);
      p.innerHTML = head + (rows.length ? rows.map((r, i) => `<div class="lr${i === hi ? ' me' : ''}"><span>${i + 1}</span><b>${r.ini}</b><em>${r.label}</em></div>`).join('')
        : '<div class="lbe">No scores yet today.</div>') + (hi < 0 && lb.score != null ? `<div class="lbe">Your score: <b>${lb.label}</b></div>` : '');
    };
    const at = lb.score == null ? -1 : G.lb.place(G.lb.load(game), lb.score, lb.higher);
    if (at < 0) { list(-1); return; }
    let ini = '';
    const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['⌫', 'OK']);
    p.innerHTML = head + `<div class="lbt">Top 5 today! <b>${lb.label}</b></div><div class="lbs"><i></i><i></i><i></i></div>
      <div class="lbg">${keys.map(k => `<button class="lbkey${k === 'OK' ? ' ok' : ''}">${k}</button>`).join('')}</div>`;
    G.sfx('sparkle', -10);
    const slots = [...p.querySelectorAll('.lbs i')], ok = p.querySelector('.ok');
    const show = () => { slots.forEach((s, i) => s.textContent = ini[i] || ''); ok.classList.toggle('off', !ini); };
    show();
    p.querySelectorAll('.lbkey').forEach(b => b.addEventListener('pointerup', () => {
      const k = b.textContent;
      if (k === '⌫') { ini = ini.slice(0, -1); G.sfx('click-soft', -12); }
      else if (k === 'OK') {
        if (!ini) return;
        const rows = G.lb.load(game), i = G.lb.place(rows, lb.score, lb.higher);
        if (i >= 0) { rows.splice(i, 0, { ini, score: lb.score, label: lb.label }); G.lb.save(game, rows.slice(0, 5)); }
        G.sfx('stamp', -10); G.ding(); list(i); return;
      } else if (ini.length < 3) { ini += k; G.key(); }
      show();
    }));
  };

  // ---- idle: back to the start screen after 20 s without a touch ----
  // armed only while the game waits for the player (never during its own animations)
  G.idle = (ms, onIdle) => {
    let t = null, armed = false;
    const fire = () => { if (parent !== window) parent.postMessage({ type: 'game-idle' }, '*'); onIdle(); };   // inside the booth: back to its start screen too
    const reset = () => { clearTimeout(t); if (armed) t = setTimeout(fire, ms); };
    addEventListener('pointerdown', reset);
    return { arm() { armed = true; reset(); }, disarm() { armed = false; clearTimeout(t); } };
  };
})();
