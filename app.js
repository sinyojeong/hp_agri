(function () {
  const C = window.CONFIG, $ = s => document.querySelector(s), app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LBL = { ok: '정상', auth: '인증 오류', query: '조회 오류', nodata: '자료 없음', conn: '연결 오류' };
  const NA = '<span class="na">자료 없음</span>';
  const v = (x, u) => (x === null || x === undefined || x === '' ? NA : esc(x) + (u ? ' ' + u : ''));   // 0 은 정상 값
  const st = {}; // 최근 응답 상태
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, x) => { try { localStorage.setItem(k, x); } catch {} } };
  async function api(path, key) {
    let d; try { const r = await fetch(path); d = await r.json(); } catch { d = { status: 'conn', message: '연결 오류' }; }
    st[key] = d; if (d.status === 'ok') ls.set('ok_' + key, d.fetchedAt || new Date().toISOString()); updTime(); return d;
  }
  const fmt = iso => { if (!iso) return null; const d = new Date(iso); if (isNaN(d)) return null; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  function updTime() { const ts = Object.values(st).filter(x => x && x.status === 'ok' && x.fetchedAt).map(x => x.fetchedAt).sort(); $('#upd').textContent = ts.length ? '최종 자료 갱신 ' + fmt(ts[ts.length - 1]) : '최종 자료 갱신 없음'; }
  const tag = s => `<span class="tag ${s === 'ok' ? '' : s === 'nodata' ? 'n' : 'e'}">${LBL[s] || s}</span>`;
  const err = d => `<p class="bad">${esc(LBL[d.status] || '조회 오류')}</p><p class="note">${esc(d.message || '')}</p>`;

  // ---- 한눈에 보기 ----
  function wCard(i) {
    if (i.status !== 'ok') return `<div class="card w"><div class="n">${esc(i.name)}</div><div class="t"><small class="bad">${LBL[i.status] || '조회 오류'}</small></div><div class="b">${esc(i.message || '')}</div></div>`;
    const bt = i.baseTime ? i.baseTime.slice(0, 2) + ':' + i.baseTime.slice(2) + ' 기준' : '기준시각 없음';
    return `<div class="card w"><div class="n">${esc(i.name)}</div><div class="t">${i.t1h == null ? '<small class="na">자료 없음</small>' : esc(i.t1h) + '<small>℃</small>'}</div>
      <div>습도 ${v(i.reh, '%')}</div><div>강수 ${v(i.rn1, 'mm')}</div><div>풍속 ${v(i.wsd, 'm/s')}</div><div>강수형태 ${v(i.ptyText)}</div><div class="b">${esc(bt)} · 격자 ${i.nx},${i.ny}</div></div>`;
  }
  async function home() {
    app.innerHTML = `<h2>함평군 9개 읍·면 기상현황</h2><p class="sub">기상청 초단기실황</p><div id="wx" class="grid3"><div class="card">불러오는 중…</div></div><p class="note">※ 읍·면별 기상정보는 기상청 동네예보 격자에 매칭된 대표 관측자료입니다.</p><div id="gw"></div>
    <h2>학교면 농업기상 상세관측</h2><p class="sub">함평군 학교면 농업기상 관측소 기준</p><div class="card" id="ag">불러오는 중…</div>
    <h2>금주 농사정보</h2><div class="card" id="wk"></div>
    <h2>금주 공통 영농 주의사항</h2><div class="two" id="nt"></div>`;
    $('#wk').innerHTML = `<p>현재 주간농사정보는 공식 사이트에서 확인합니다. (자동 연동 미구성 — 공식 API 명세 확인 후 추가 예정)</p><p class="note">※ 오늘 날짜가 포함된 적용기간의 호를 선택해 확인하세요. 다음 주 자료가 미리 게시된 경우가 있습니다.</p>` + C.weeklyLinks.map(l => `<a class="btn f" target="_blank" rel="noopener" href="${esc(l.u)}">${esc(l.n)}</a>`).join('');
    $('#nt').innerHTML = C.notices.map(n => `<div class="card"><b>${esc(n.t)}</b><p style="margin:4px 0 0">${esc(n.d)}</p></div>`).join('');
    api('/api/weather', 'weather').then(d => {
      $('#wx').innerHTML = d.items && d.items.length ? d.items.map(wCard).join('') : `<div class="card" style="grid-column:1/-1">${err(d)}</div>`;
      if (d.gridVerified === false) $('#gw').innerHTML = '<p class="warn">※ 격자(nx,ny)는 임시값입니다. 기상청 공식 격자표와 대조 후 _worker.js 의 GRID_VERIFIED 를 true 로 바꾸세요.</p>';
    });
    api('/api/agri-weather', 'agri').then(d => {
      if (d.status !== 'ok') { $('#ag').innerHTML = err(d); return; }
      const x = d.values || {}, raw = d.raw || {};
      $('#ag').innerHTML = `<div class="note">관측시각: ${d.obsTime ? esc(d.obsTime) : '자료 없음'} · 관측지점 ${esc(d.spot)}</div><div class="vals">
        <div><span>기온</span><b>${v(x.temp, '℃')}</b></div><div><span>습도</span><b>${v(x.humi, '%')}</b></div><div><span>강수량</span><b>${v(x.rain, 'mm')}</b></div><div><span>풍속</span><b>${v(x.wind, 'm/s')}</b></div>
        <div><span>일조시간</span><b>${v(x.sun)}</b></div><div><span>일사량</span><b>${v(x.rad)}</b></div><div><span>토양수분</span><b>${v(x.soil, '%')}</b></div></div>
        <details><summary>API 원본 항목 보기 (항목명 확인용)</summary><pre>${esc(JSON.stringify(raw, null, 1))}</pre></details>`;
    });
  }

  // ---- 품목별 정보 ----
  function items() {
    app.innerHTML = C.categories.map(c => `<h2>${esc(c.name)}</h2><div class="grid3">${c.items.map(i => `<a class="card" style="text-decoration:none;color:inherit" href="#items/${esc(i.id)}"><b style="font-size:1.3rem">${esc(i.name)}</b><div class="sub">점검표·공식자료 보기</div></a>`).join('')}</div>`).join('') + '<p class="note">새 품목은 config.js 의 categories 에 항목을 추가하면 카드가 생성됩니다.</p>';
  }
  const checks = arr => `<ul class="cl">${arr.map(t => `<li><label><input type="checkbox"><span>${esc(t)}</span></label></li>`).join('')}</ul><p class="note">체크 표시는 이 화면에서만 사용되며 저장되지 않습니다.</p>`;
  async function onion() {
    const stages = Object.keys(C.onionStages); let cur = stages[1];
    app.innerHTML = `<p><a href="#items">← 품목 목록</a></p><h2>양파</h2><h2 style="font-size:1rem">생육단계 선택</h2><div class="pill" id="sg"></div><div class="card" id="ck"></div>
      <h2>양파 병해충</h2><p class="sub">국가농작물병해충관리시스템 NCPMS</p><div id="pt"><div class="card">불러오는 중…</div></div><div class="card" id="dt" style="display:none;margin-top:12px"></div>`;
    const draw = () => { $('#sg').innerHTML = stages.map(s => `<button class="${s === cur ? 'on' : ''}" data-s="${esc(s)}">${esc(s)}</button>`).join(''); $('#ck').innerHTML = `<b>${esc(cur)} 현장 점검사항</b>` + checks(C.onionStages[cur]); };
    draw(); $('#sg').onclick = e => { const s = e.target.dataset.s; if (s) { cur = s; draw(); } };
    const d = await api('/api/ncpms/onion', 'ncpms');
    if (d.status !== 'ok') { $('#pt').innerHTML = `<div class="card">${err(d)}<a class="btn" target="_blank" rel="noopener" href="https://ncpms.rda.go.kr">NCPMS 공식 사이트에서 양파 병해충 보기</a></div>`; return; }
    $('#pt').innerHTML = `<div class="grid3">${d.items.map((p, n) => `<div class="card pest" data-n="${n}"><span class="tag n">${esc(p.kind)}</span> <b>${v(p.name)}</b><div class="note">증상: ${v(p.symptom)}</div></div>`).join('')}</div>`;
    $('#pt').onclick = async e => {
      const el = e.target.closest('.pest'); if (!el) return; const p = d.items[+el.dataset.n], box = $('#dt'); box.style.display = 'block';
      let h = `<b>${v(p.name)}</b> <span class="tag n">${esc(p.kind)}</span><p>발생환경: ${v(p.env)}</p><p>주요 증상: ${v(p.symptom)}</p><p>방제정보: ${v(p.control)}</p>${p.image ? `<img alt="" src="${esc(p.image)}" style="max-width:100%;border-radius:8px">` : ''}`;
      if (p.kind === '병' && p.key) { box.innerHTML = h + '<p class="note">상세정보 불러오는 중…</p>'; const r = await api('/api/ncpms/detail?key=' + encodeURIComponent(p.key), 'ncpmsd');
        h += r.status === 'ok' ? `<hr><p>발생환경: ${v(r.development)}</p><p>증상: ${v(r.symptoms)}</p><p>방제방법: ${v(r.prevention)}</p><p>전염경로: ${v(r.route)}</p>${r.image ? `<img alt="" src="${esc(r.image)}" style="max-width:100%">` : ''}` : `<hr>${err(r)}`; }
      box.innerHTML = h + '<p><a class="btn" target="_blank" rel="noopener" href="https://ncpms.rda.go.kr">공식 상세정보(NCPMS)</a></p>'; box.scrollIntoView({ behavior: 'smooth' });
    };
  }
  function hanwoo() {
    app.innerHTML = `<p><a href="#items">← 품목 목록</a></p><h2>한우</h2><div class="two"><div class="card"><b>기본 현장점검</b>${checks(C.hanwooChecks)}</div><div class="card"><b>공식자료 바로가기</b><p class="note">초기 버전은 비공식 수집 없이 공식 링크만 제공합니다. API 확정 시 이 영역에 연결합니다.</p>${C.hanwooLinks.map(l => `<a class="btn f" target="_blank" rel="noopener" href="${esc(l.u)}">${esc(l.n)}</a>`).join('')}</div></div>`;
  }

  // ---- 자료실·출처 / API 연결상태 ----
  async function sources() {
    const rows = g => C.sources.filter(s => s.g === g).map(s => { const k = s.k, ok = k && ls.get('ok_' + k); return `<tr><td><b>${esc(s.o)}</b></td><td>${esc(s.data)}</td><td><a target="_blank" rel="noopener" href="${esc(s.u)}">바로가기</a></td><td>${k ? esc(fmt(ok) || '기록 없음') : '-'}</td><td>${k && st[k] ? tag(st[k].status) : k ? '확인 전' : '-'}</td></tr>`; }).join('');
    const draw = () => { app.innerHTML = ['기상', '농업기술', '축산'].map(g => `<h2>${g}</h2><div class="card" style="overflow:auto"><table><tr><th>기관</th><th>사용 데이터</th><th>홈페이지</th><th>최근 정상 수집(이 브라우저)</th><th>연결 상태</th></tr>${rows(g)}</table></div>`).join('') + `<h2>API 연결상태</h2><div class="card" id="as"></div>`; };
    draw(); const defs = [['기상청 초단기실황', '/api/weather', 'weather'], ['학교면 농업기상', '/api/agri-weather', 'agri'], ['NCPMS 양파 병해충', '/api/ncpms/onion', 'ncpms']];
    const env = await fetch('/api/env').then(r => r.json()).catch(() => null);
    await Promise.all(defs.map(([, p, k]) => api(p, k))); draw();
    $('#as').innerHTML = defs.map(([n, , k]) => `<p><b>${n}</b> ${tag(st[k].status)} <span class="note">${esc(st[k].status === 'ok' ? '' : st[k].message || '')}</span></p>`).join('') +
      `<p class="note">서버 설정(값은 표시하지 않음): ${env ? Object.entries(env).map(([k, x]) => `${k} ${x ? '● 설정됨' : '○ 없음'}`).join(' / ') : '확인 불가'}</p>`;
  }

  function route() {
    const h = (location.hash || '#home').slice(1), [p, id] = h.split('/');
    document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.p === p));
    try { ({ home, items: id === 'onion' ? onion : id === 'hanwoo' ? hanwoo : items, sources }[p] || home)(); } catch (e) { app.innerHTML = '<div class="card"><p class="bad">화면을 표시하지 못했습니다.</p></div>'; }
  }
  addEventListener('hashchange', route); route();
})();
