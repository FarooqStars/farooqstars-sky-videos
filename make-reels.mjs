// FarooqStars — make-reels.mjs (v3 · 29 Oct 2026 · decision 429)
// The weekly English sign reels of Bolte Sitare. For each of the 12 Western signs:
//   1. open https://farooqstars.com/reel-render.html (the site draws the video from its own readings engine — the same words
//      as the site and the cards) and read the narration it asks for (REEL.say);
//   2. speak each part with Kokoro (free, runs here — no paid service) — voice am_michael, speed 1.1 (Farooq's pick);
//   3. reopen the page with the voice lengths, take every frame (30 fps), mix voice + the site's music bed with ffmpeg;
//   4. send the mp4 + caption to farooqstars.com/api/bs-reels-in.php (key: secret FS_REEL_KEY).
// Studio 2 on the site posts them (Facebook Reel + TikTok), two signs a day. A video already on the site is never made again.
// env: FS_REEL_KEY (required) · SIGNS ('' = all 12, or '0,3') · FORCE=1 · STAMP (w-YYYY-Www, default = this Doha week)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const SITE = process.env.SITE || 'https://farooqstars.com', DRY = process.env.DRY === '1';   // DRY: make only, send nothing (a test)
const KEY = process.env.FS_REEL_KEY || '';
const VOICE = process.env.VOICE || 'am_michael', SPEED = process.env.SPEED || '1.1';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const WORK = path.resolve('work'), OUT = path.resolve('out');
if (!KEY && !DRY) { console.error('FS_REEL_KEY missing'); process.exit(2); }

function dohaWeek(now = new Date()) {   // ISO week (Monday first) of the Doha day (UTC+3)
  const t = new Date(now.getTime() + 3 * 3600e3), d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7);   // the Thursday of this week decides the year
  const y = d.getUTCFullYear();
  return `w-${y}-W${String(Math.floor((d - Date.UTC(y, 0, 1)) / 864e5 / 7) + 1).padStart(2, '0')}`;
}
const STAMP = process.env.STAMP || dohaWeek();
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();
async function post(form) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ key: KEY, stamp: STAMP, ...form })) fd.append(k, v);
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(SITE + '/api/bs-reels-in.php', { method: 'POST', body: fd, headers: { 'User-Agent': UA, Referer: SITE + '/studio-b.html' } });
      const t = await r.text(); try { return JSON.parse(t); } catch { if (i === 3) return { ok: false, err: 'http ' + r.status + ' ' + t.slice(0, 200) }; }
    } catch (e) { if (i === 3) return { ok: false, err: String(e) }; }
    await new Promise(s => setTimeout(s, 5000 * (i + 1)));
  }
}

(async () => {
  const has = DRY ? { ok: true, have: [] } : await post({ action: 'has' });
  if (!has.ok) { console.error('site said', has); process.exit(1); }
  const want = (process.env.SIGNS || '').trim() ? process.env.SIGNS.split(',').map(Number) : [...Array(12).keys()];
  const todo = want.filter(si => process.env.FORCE === '1' || !has.have.includes(si));
  console.log(STAMP, 'already on the site:', has.have.join(',') || '-', '· to make:', todo.join(',') || '-');
  if (!todo.length) return;
  fs.mkdirSync(OUT, { recursive: true });
  const music = path.join(WORK, 'bed.mp3'); fs.mkdirSync(WORK, { recursive: true });
  if (!fs.existsSync(music)) fs.writeFileSync(music, Buffer.from(await (await fetch(SITE + '/media/audio/sky-bed-1.mp3', { headers: { 'User-Agent': UA } })).arrayBuffer()));
  const browser = await chromium.launch(); let bad = 0;
  for (const si of todo) {
    const t0 = Date.now(), dir = path.join(WORK, 's' + si); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir + '/f', { recursive: true });
    try {
      const pg = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      const open = async v => {
        await pg.goto(`${SITE}/reel-render.html?sign=${si}&stamp=${STAMP}&lang=en&sys=western${v ? '&v=' + v : ''}&t=${Date.now()}`, { waitUntil: 'load', timeout: 90000 });
        await pg.waitForFunction(() => window.REEL && (REEL.ready || REEL.error), null, { timeout: 90000 });
        const R = await pg.evaluate(() => ({ dur: REEL.dur, say: REEL.say, at: REEL.at, caption: REEL.caption, err: REEL.error }));
        if (R.err) throw new Error('page: ' + R.err); return R;
      };
      let R = await open('');
      const wavs = R.say.map((t, i) => { const w = `${dir}/v${i}.wav`; execFileSync('python3', ['kokoro-say.py', VOICE, SPEED, w], { input: t, stdio: ['pipe', 'ignore', 'inherit'] }); return w; });
      R = await open(wavs.map(w => dur(w).toFixed(2)).join(','));
      const st = await pg.$('#stage'), N = Math.ceil(R.dur * 30);
      for (let i = 0; i < N; i++) { await pg.evaluate(t => REEL.seek(t), i / 30); await st.screenshot({ path: `${dir}/f/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 }); }
      await pg.close();
      const D = R.dur.toFixed(2), out = path.join(OUT, `${STAMP}-${String(si).padStart(2, '0')}.mp4`);
      const args = ['-v', 'error', '-y', '-framerate', '30', '-i', `${dir}/f/%05d.jpg`, '-i', music]; wavs.forEach(w => args.push('-i', w));
      let fc = `[1:a]atrim=0:${D},afade=t=in:d=1.2,afade=t=out:st=${(R.dur - 2.5).toFixed(2)}:d=2.5,volume=0.22[m]`;
      wavs.forEach((w, i) => { const ms = Math.round(R.at[i] * 1000); fc += `;[${i + 2}:a]aresample=44100,adelay=${ms}|${ms},volume=1.6[v${i}]`; });
      fc += `;[m]${wavs.map((w, i) => `[v${i}]`).join('')}amix=inputs=${wavs.length + 1}:normalize=0,alimiter=limit=0.95[a]`;
      args.push('-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30',
        '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-movflags', '+faststart', '-t', D, out);
      execFileSync('ffmpeg', args, { stdio: 'inherit' });
      const up = DRY ? { ok: true } : await post({ action: 'save', si: String(si), caption: R.caption, sec: D, video: new Blob([fs.readFileSync(out)], { type: 'video/mp4' }) });
      console.log(`sign ${si}: ${D}s · ${(fs.statSync(out).size / 1048576).toFixed(1)} MB · ${Math.round((Date.now() - t0) / 1000)}s ·`, up.ok ? 'sent ✓' : 'NOT SENT ' + up.err);
      if (!up.ok) bad++;
    } catch (e) { bad++; console.error(`sign ${si}: FAILED`, e.message); }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
