// 함평군 농촌지도 통합대시보드 - Cloudflare Pages _worker.js (API 키는 서버에서만 사용)
const GRID_VERIFIED = false; // 공식 격자표와 대조한 뒤 true 로 바꾸면 화면의 '임시값' 안내가 사라집니다.
const GRID = [ // [읍·면, nx, ny]  ※ 임시값: 대략적 위치로 계산 → README 참고
  ['함평읍',52,72],['손불면',50,71],['신광면',51,74],['학교면',53,72],['엄다면',54,72],
  ['대동면',52,71],['나산면',54,73],['해보면',52,73],['월야면',53,74]];
const KMA = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';
const AGRI_SPOT = '525811A001';
const AGRI_DEFAULT = 'https://apis.data.go.kr/1390802/AgriWeather/WeatherObsrInfo/V3/GnrlWeather/getWeatherTenMinList3';
const NCPMS = 'http://ncpms.rda.go.kr/npmsAPI/service';
const PTY = {0:'없음',1:'비',2:'비/눈',3:'눈',5:'빗방울',6:'빗방울눈날림',7:'눈날림'};

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const miss = v => v === undefined || v === null || ['', '-'].includes(String(v).trim());
const num = v => { if (miss(v)) return null; const n = Number(v); return Number.isFinite(n) && n !== -999 ? n : null; };
const arr = x => (x == null || x === '' ? [] : Array.isArray(x) ? x : [x]);
const kst = () => new Date(Date.now() + 9 * 3600e3);
const p2 = n => String(n).padStart(2, '0');
const ymd = (d, s = '') => `${d.getUTCFullYear()}${s}${p2(d.getUTCMonth() + 1)}${s}${p2(d.getUTCDate())}`;
const keyOf = k => { try { return encodeURIComponent(decodeURIComponent(k)); } catch { return encodeURIComponent(k); } };

async function get(url, ms = 8000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); return { http: r.status, text: await r.text() }; }
  catch { return { err: 1 }; } finally { clearTimeout(t); }
}
// 최소 XML 파서(CDATA·단일/복수 요소 처리)
function parseXml(s) {
  s = s.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const dec = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
  const fin = n => Object.keys(n.c).length ? Object.fromEntries(Object.entries(n.c).map(([k, a]) => [k, a.length > 1 ? a : a[0]])) : dec(n.t || '');
  const add = (p, k, v) => (p.c[k] = p.c[k] || []).push(v);
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)[^>]*?(\/?)>|([^<]+)/g, root = { c: {} }, st = [root]; let m;
  while ((m = re.exec(s))) {
    const cur = st[st.length - 1];
    if (m[1] !== undefined) cur.t = (cur.t || '') + m[1].trim();
    else if (m[3]) {
      if (m[2]) { if (st.length > 1) { const n = st.pop(); add(st[st.length - 1], m[3], fin(n)); } }
      else if (m[4]) add(cur, m[3], ''); else st.push({ c: {} });
    } else if (m[5] && m[5].trim()) cur.t = (cur.t || '') + m[5].trim();
  }
  return fin(root);
}
const dig = (o, re) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (re.test(k) && typeof v !== 'object') return v; const r = dig(v, re); if (r !== undefined) return r; } };
const lists = o => { const out = []; (function w(x) { if (Array.isArray(x)) { if (x.length && typeof x[0] === 'object') out.push(x); } else if (x && typeof x === 'object') Object.values(x).forEach(w); })(o); return out; };

// 응답 → 상태 분류: ok | auth | query | nodata | conn
function verdict(code, msg, http) {
  const t = `${code} ${msg}`;
  if (/SERVICE_KEY|ACCESS_DENIED|NOT_REGISTERED|DEADLINE|PERMISSION|UNREGISTERED|인증/i.test(t) || ['20', '30', '31', '32', '33'].includes(String(code)) || [401, 403].includes(http)) return 'auth';
  if (String(code) === '03' || /NO_DATA/i.test(t)) return 'nodata';
  if (['04', '05'].includes(String(code)) || http >= 500) return 'conn';
  if (['00', '000', '200', '0'].includes(String(code))) return 'ok';
  if (code === undefined && http && http < 400) return 'ok';
  return 'query';
}
const MSG = { auth: '인증 오류 (키·활용신청·승인 상태 확인)', query: '조회 오류 (요청 조건 또는 호출 한도 확인)', nodata: '자료 없음', conn: '연결 오류 (기관 서버 응답 없음)' };

// ① 기상청 초단기실황
async function kmaOne(key, [name, nx, ny]) {
  const now = kst(); let h = now.getUTCHours() - (now.getUTCMinutes() < 10 ? 1 : 0);
  for (let i = 0; i < 2; i++, h--) {
    const d = new Date(now.getTime() + Math.floor(h / 24) * 86400e3), hh = ((h % 24) + 24) % 24;
    const bd = ymd(new Date(now.getTime() + (h < 0 ? -86400e3 : 0))), bt = p2(hh) + '00';
    const r = await get(`${KMA}?serviceKey=${keyOf(key)}&pageNo=1&numOfRows=60&dataType=JSON&base_date=${bd}&base_time=${bt}&nx=${nx}&ny=${ny}`);
    if (r.err) return { name, nx, ny, status: 'conn', message: MSG.conn };
    let d0 = null, code, msg; try { d0 = JSON.parse(r.text); } catch {}
    if (d0?.response) { code = d0.response.header?.resultCode; msg = d0.response.header?.resultMsg; }
    else { const x = parseXml(r.text); code = dig(x, /returnReasonCode|resultCode/i); msg = dig(x, /returnAuthMsg|resultMsg|errMsg/i) || ''; }
    const st = verdict(code, msg || '', r.http);
    if (st === 'nodata') continue;
    if (st !== 'ok') return { name, nx, ny, status: st, message: MSG[st] };
    const it = arr(d0.response.body?.items?.item); if (!it.length) continue;
    const v = c => { const f = it.find(x => x.category === c); return f ? f.obsrValue : null; };
    const pty = num(v('PTY'));
    return { name, nx, ny, status: 'ok', baseDate: it[0].baseDate, baseTime: it[0].baseTime, t1h: num(v('T1H')), reh: num(v('REH')),
      rn1: miss(v('RN1')) ? null : (num(v('RN1')) ?? String(v('RN1'))), wsd: num(v('WSD')), pty, ptyText: pty == null ? null : (PTY[pty] ?? `코드 ${pty}`) };
  }
  return { name, nx, ny, status: 'nodata', message: MSG.nodata };
}
async function weather(env) {
  if (!env.DATA_GO_KR_SERVICE_KEY) return { status: 'auth', message: 'DATA_GO_KR_SERVICE_KEY 가 설정되지 않았습니다.', items: [], gridVerified: GRID_VERIFIED };
  const res = await Promise.allSettled(GRID.map(g => kmaOne(env.DATA_GO_KR_SERVICE_KEY, g)));
  const items = res.map((r, i) => r.status === 'fulfilled' ? r.value : { name: GRID[i][0], nx: GRID[i][1], ny: GRID[i][2], status: 'conn', message: MSG.conn });
  const ok = items.some(x => x.status === 'ok');
  return { status: ok ? 'ok' : items[0].status, message: ok ? '' : items[0].message, fetchedAt: new Date().toISOString(), gridVerified: GRID_VERIFIED, items };
}

// ② 학교면 농업기상 (기본값: 명세 확인된 '기본 관측데이터' 10분 자료. 상세 API 로 바꾸려면 AGRI_WEATHER_URL 지정)
const MAP = { temp: [/^(temp|ta|airtemp|tmp|tmpr|temperature|기온)/, /soil|ground|water|지중|초상|수중|max|min/], humi: [/^(hum|humi|humidity|rh|reh|습도)/], rain: [/^(rn|rain|rainfall|precip|prcp|pcp|강수)/],
  wind: [/^(ws|windspeed|wspd|wind_?speed|풍속)/, /max|최대/], sun: [/sunshine|sunhr|일조/], rad: [/solar|radi|일사/], soil: [/soil_?moist|soil_?water|smoist|swc|토양수분|moist/] };
async function agri(env) {
  if (!env.DATA_GO_KR_SERVICE_KEY) return { status: 'auth', message: 'DATA_GO_KR_SERVICE_KEY 가 설정되지 않았습니다.' };
  const base = env.AGRI_WEATHER_URL || AGRI_DEFAULT, now = kst();
  let last = { status: 'nodata', message: MSG.nodata };
  for (const back of [0, 1]) {
    const date = ymd(new Date(now.getTime() - back * 86400e3), '-');
    const r = await get(`${base}?serviceKey=${keyOf(env.DATA_GO_KR_SERVICE_KEY)}&Page_No=1&Page_Size=144&date=${date}&obsr_Spot_Cd=${AGRI_SPOT}`);
    if (r.err) return { status: 'conn', message: MSG.conn };
    let x; try { x = r.text.trim()[0] === '{' ? JSON.parse(r.text) : parseXml(r.text); } catch { return { status: 'query', message: MSG.query }; }
    const st = verdict(dig(x, /returnReasonCode|^result_?code$/i), dig(x, /returnAuthMsg|^result_?msg$|errMsg/i) || '', r.http);
    if (st !== 'ok' && st !== 'nodata') return { status: st, message: MSG[st] };
    const rows = (lists(x)[0] || []).filter(o => typeof o === 'object'); if (!rows.length) { last = { status: 'nodata', message: MSG.nodata }; continue; }
    const tk = Object.keys(rows[0]).find(k => /date|time|tm|일시|시각/i.test(k) && /time|tm|시각|일시/i.test(k)) || Object.keys(rows[0]).find(k => /date|time|tm/i.test(k));
    const rec = tk ? rows.slice().sort((a, b) => String(a[tk]).localeCompare(String(b[tk]))).pop() : rows[rows.length - 1];
    const pick = ([inc, exc]) => { const k = Object.keys(rec).find(k => inc.test(k.toLowerCase().replace(/_/g, '')) && !(exc && exc.test(k.toLowerCase()))); return k && !miss(rec[k]) ? num(rec[k]) : null; };
    const values = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [k, pick(v)]));
    return { status: 'ok', fetchedAt: new Date().toISOString(), spot: AGRI_SPOT, obsTime: tk && !miss(rec[tk]) ? String(rec[tk]) : null, values, raw: rec, source: env.AGRI_WEATHER_URL ? 'custom' : 'basic' };
  }
  return last;
}

// ③ NCPMS (상세: SVC05 + sickKey 확인됨 / 목록 서비스코드는 환경변수로 지정)
const field = (o, re) => { const k = Object.keys(o).find(k => re.test(k)); return k && !miss(o[k]) ? String(o[k]) : null; };
const img = o => { const k = Object.keys(o).find(k => /image|img|thumb|file/i.test(k) && /^https?:|^\/\//.test(String(o[k]))); return k ? String(o[k]).replace(/^http:\/\/ncpms/, 'https://ncpms') : null; };
async function ncpmsCall(env, qs) {
  if (!env.NCPMS_API_KEY) return { status: 'auth', message: 'NCPMS_API_KEY 가 설정되지 않았습니다.' };
  const r = await get(`${NCPMS}?apiKey=${encodeURIComponent(env.NCPMS_API_KEY)}&${qs}`);
  if (r.err) return { status: 'conn', message: MSG.conn };
  if (r.http >= 400) { const s = verdict(undefined, '', r.http); return { status: s, message: MSG[s] }; }
  let x; try { x = parseXml(r.text); } catch { return { status: 'query', message: MSG.query }; }
  if (!Object.keys(x || {}).length || typeof x === 'string') return { status: /인증|apiKey|등록/i.test(r.text) ? 'auth' : 'query', message: /인증|apiKey|등록/i.test(r.text) ? MSG.auth : MSG.query };
  return { status: 'ok', x };
}
async function ncpmsList(env) {
  const defs = [['병', env.NCPMS_LIST_SICK_CODE], ['해충', env.NCPMS_LIST_PEST_CODE]].filter(d => d[1]);
  if (!defs.length) return { status: 'query', message: '병·해충 목록 서비스코드(NCPMS_LIST_SICK_CODE, NCPMS_LIST_PEST_CODE)가 아직 설정되지 않았습니다. README 참고.' };
  const out = []; let first = null;
  for (const [kind, code] of defs) {
    const r = await ncpmsCall(env, `serviceCode=${encodeURIComponent(code)}&cropName=${encodeURIComponent('양파')}&displayCount=50&startPoint=1`);
    if (r.status !== 'ok') { first = first || r; continue; }
    for (const o of lists(r.x)[0] || []) out.push({ kind, key: field(o, /sickKey|insectKey|pestKey|Key$/i), name: field(o, /NameKor|KorName|name/i), symptom: field(o, /symptom/i), env: field(o, /development|occur/i), control: field(o, /prevention|control/i), image: img(o) });
  }
  if (!out.length) return first || { status: 'nodata', message: MSG.nodata };
  return { status: 'ok', fetchedAt: new Date().toISOString(), items: out };
}
async function ncpmsDetail(env, key) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(key || '')) return { status: 'query', message: MSG.query };
  const r = await ncpmsCall(env, `serviceCode=SVC05&sickKey=${key}`);
  if (r.status !== 'ok') return r;
  const s = dig(r.x, /^service$/) !== undefined ? (r.x.service || r.x) : r.x, o = Array.isArray(s) ? s[0] : (typeof s === 'object' ? s : r.x);
  const flat = {}; (function w(v) { if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => typeof x === 'object' ? w(x) : (flat[k] = x)); })(o);
  return { status: 'ok', cropName: field(flat, /^cropName$/), nameKor: field(flat, /^sickNameKor$/), nameEng: field(flat, /^sickNameEng$/), symptoms: field(flat, /^symptoms$/), development: field(flat, /^developmentCondition$/), prevention: field(flat, /^preventionMethod$/), route: field(flat, /^infectionRoute$/), image: img(flat) };
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname;
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (p === '/api/weather') return J(await weather(env));
      if (p === '/api/agri-weather') return J(await agri(env));
      if (p === '/api/ncpms/onion') return J(await ncpmsList(env));
      if (p === '/api/ncpms/detail') return J(await ncpmsDetail(env, u.searchParams.get('key')));
      if (p === '/api/env') return J({ DATA_GO_KR_SERVICE_KEY: !!env.DATA_GO_KR_SERVICE_KEY, NCPMS_API_KEY: !!env.NCPMS_API_KEY, NCPMS_LIST_SICK_CODE: !!env.NCPMS_LIST_SICK_CODE, NCPMS_LIST_PEST_CODE: !!env.NCPMS_LIST_PEST_CODE, AGRI_WEATHER_URL: !!env.AGRI_WEATHER_URL });
    } catch { return J({ status: 'conn', message: MSG.conn }, 200); }
    return J({ status: 'query', message: '알 수 없는 경로' }, 404);
  }
};
