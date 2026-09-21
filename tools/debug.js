/* 전환 계측 도구 — 주소 끝에 ?debug 또는 ?speed=0.7 을 붙이면 index.html 이 불러온다.

   ?debug      왼쪽 아래에 마지막 전환의 타임라인을 띄운다.
               입력->시작 / 슬라이드 / 로고 / 문구 / 버튼 / 프레임 / 잠금 중 무시된 스크롤
   ?speed=0.7  모든 움직임(CSS 트랜지션·애니메이션, 캔버스 로고, 타이머)을 0.7배 시간으로 재생.
               페이지의 실제 값은 바꾸지 않으므로 "이 정도면 빠르다" 를 눈으로 비교할 때 쓴다.
   표시되는 시간은 모두 실제 시간(ms)이다. */
(() => {
  const qs = new URLSearchParams(location.search);
  const k = Math.min(3, Math.max(0.1, parseFloat(qs.get('speed')) || 1));
  const realNow = performance.now.bind(performance);
  const realRAF = window.requestAnimationFrame.bind(window);

  /* ---------- 시간 배율 ---------- */
  const rate = a => { if (a.playbackRate !== 1 / k) a.playbackRate = 1 / k; };
  if (k !== 1) {
    const t0 = realNow(), v = t => t0 + (t - t0) / k;
    const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
    performance.now = () => v(realNow());
    window.requestAnimationFrame = cb => realRAF(t => cb(v(t)));
    window.setTimeout  = (fn, ms, ...a) => st(fn, (ms || 0) * k, ...a);
    window.setInterval = (fn, ms, ...a) => si(fn, (ms || 0) * k, ...a);
    ['transitionrun', 'animationstart'].forEach(t =>
      document.addEventListener(t, e => e.target.getAnimations().forEach(rate), true));
  }

  const ready = f => document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', f) : f();

  ready(() => {
    if (k !== 1) document.getAnimations().forEach(rate);

    const panels = [...document.querySelectorAll('.panel')];
    const NAME = {pyderin: '피더린', barulab: '바루랩', tam: '탐뷰티'};
    const nameOf = p => p ? NAME[p.className.match(/b-(\w+)/)[1]] : '첫 화면';
    const LOCK = 700 * k, T_LOGO = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--t-logo')) * k;

    /* ---------- 입력 ----------
       waitFrom: 이번 전환을 일으킨 입력이 시작된 시각.
       스크롤을 굴리기 시작했는데 기준량이 안 차서 넘어가지 않고 기다린 시간이 '입력->시작' 이다. */
    let cur = null, prev, waitFrom = null, lastWheel = -1e9;
    addEventListener('wheel', e => {
      const t = realNow();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (cur && t - cur.t0 < LOCK) { cur.ignored++; draw(); }
      else if (waitFrom === null || t - lastWheel > 300) waitFrom = t;
      lastWheel = t;
    }, {capture: true, passive: true});
    ['keydown', 'pointerdown'].forEach(ev => addEventListener(ev, () => { waitFrom = realNow(); }, true));

    /* ---------- 전환 시작: 활성 패널이 바뀌는 순간 ---------- */
    const history = [];
    function check(){
      const act = panels.find(p => p.classList.contains('is-active')) || null;
      if (act === prev) return;
      prev = act;
      const t0 = realNow();
      if (cur) history.unshift(cur);
      history.length = Math.min(history.length, 5);
      cur = {panel: act, name: nameOf(act), t0, input: waitFrom === null ? null : t0 - waitFrom,
             ignored: 0, slide: null, logo: null, text: [null, null], cta: [null, null], fr: null};
      waitFrom = null;
      frames(cur);
      draw();
    }
    const mo = new MutationObserver(check);
    panels.forEach(p => mo.observe(p, {attributes: true, attributeFilter: ['class']}));

    /* 로고는 캔버스라 이벤트가 없다 -> 원본 이미지로 교체(settled)되는 순간을 완료로 본다 */
    const lo = new MutationObserver(() => {
      if (cur && cur.panel && cur.panel.querySelector('.logo.settled') && cur.logo === null) {
        cur.logo = realNow() - cur.t0; draw();
      }
    });
    document.querySelectorAll('.logo').forEach(l => lo.observe(l, {attributes: true, attributeFilter: ['class']}));

    /* 문구·버튼은 transitionstart(지연이 끝나 실제로 움직이기 시작) / transitionend 로 잰다 */
    const inCur = el => cur && cur.panel && cur.panel.contains(el);
    document.addEventListener('transitionstart', e => {
      if (!inCur(e.target)) return;
      const t = realNow() - cur.t0, c = e.target.classList;
      if (c.contains('ch') && cur.text[0] === null) cur.text[0] = t;
      if (c.contains('cta') && cur.cta[0] === null) cur.cta[0] = t;
      draw();
    }, true);
    document.addEventListener('transitionend', e => {
      if (!cur || e.propertyName !== 'transform') return;
      const t = realNow() - cur.t0, el = e.target;
      if (el.classList.contains('panel')) cur.slide = Math.max(cur.slide || 0, t);
      else if (inCur(el) && el.classList.contains('ch')) cur.text[1] = Math.max(cur.text[1] || 0, t);
      else if (inCur(el) && el.closest('.cta')) cur.cta[1] = Math.max(cur.cta[1] || 0, t);
      draw();
    }, true);

    /* 전환 뒤 2.4초 동안 프레임 간격 */
    function frames(rec){
      const ts = [];
      const loop = t => {
        ts.push(t);
        if (rec !== cur) return;
        if (t - ts[0] < 2400 * Math.max(k, .5)) return realRAF(loop);
        const d = ts.slice(1).map((x, i) => x - ts[i]);
        rec.fr = {fps: 1000 * d.length / (ts[ts.length - 1] - ts[0]),
                  lost: Math.round(d.reduce((s, x) => s + Math.max(0, x / 16.7 - 1), 0)),
                  max: Math.max(...d)};
        draw();
      };
      realRAF(loop);
    }

    /* ---------- 표시 ---------- */
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;pointer-events:none;' +
      'width:380px;padding:12px 14px;border-radius:10px;background:rgba(17,17,17,.86);color:#eee;' +
      'font:12px/1.55 ui-monospace,Consolas,monospace;box-shadow:0 4px 18px rgba(0,0,0,.3)';
    document.body.appendChild(box);

    const s = ms => ms === null ? '—' : (ms / 1000).toFixed(2) + 's';
    const W = 190;
    function bar(a, b, color, span){
      if (a === null || b === null) return `<span style="display:inline-block;width:${W}px;color:#777">대기 중…</span>`;
      const x = a / span * W, w = Math.max(2, (b - a) / span * W);
      return `<span style="position:relative;display:inline-block;width:${W}px;height:9px;background:#333;border-radius:2px;vertical-align:middle">` +
             `<i style="position:absolute;left:${x}px;width:${w}px;top:0;bottom:0;background:${color};border-radius:2px"></i></span>`;
    }
    function row(label, a, b, color, span, note = ''){
      return `<div>${label.padEnd(5, '　')} ${bar(a, b, color, span)} ${s(a)}→${s(b)} ${note}</div>`;
    }
    function draw(){
      if (!cur) {
        box.innerHTML = `<b>전환 계측</b> · 속도 ×${(1 / k).toFixed(2)}<br>스크롤하면 기록이 시작됩니다`;
        return;
      }
      const c = cur, ends = [c.slide, c.logo, c.text[1], c.cta[1]].filter(v => v !== null);
      const done = ends.length ? Math.max(...ends) : null;
      const span = Math.max(2000 * k, done || 0);
      let h = `<div style="margin-bottom:6px"><b>${c.name}</b> 로 전환 · 속도 ×${(1 / k).toFixed(2)}` +
              `<span style="float:right;color:#9cf">완료 ${s(done)}</span></div>`;
      h += `<div>입력→시작 ${c.input === null ? '—' : Math.round(c.input) + 'ms'}` +
           (c.input > 150 ? ' <span style="color:#fc6">(스크롤을 더 굴려야 넘어감)</span>' : '') + '</div>';
      /* --e-soft 는 전체 시간의 41% 지점에서 이미 90% 를 간다 */
      h += row('슬라이드', 0, c.slide, '#7aa2ff', span, c.slide ? `(90%≈${s(c.slide * .412)})` : '');
      if (c.panel) {
        h += row('로고', T_LOGO, c.logo, '#c99bff', span);
        h += row('문구', c.text[0], c.text[1], '#6fd3a0', span);
        h += row('버튼', c.cta[0], c.cta[1], '#ffb86b', span);
      }
      h += `<div style="margin-top:6px">프레임 ${c.fr ? `${c.fr.fps.toFixed(0)}fps · 끊김 ${c.fr.lost} · 최대 ${c.fr.max.toFixed(0)}ms` : '측정 중…'}</div>`;
      h += `<div>잠금(${s(LOCK)}) 중 무시된 스크롤 <b style="color:${c.ignored ? '#fc6' : '#eee'}">${c.ignored}회</b></div>`;
      if (history.length) {
        h += '<div style="margin-top:6px;color:#999">' + history.map(r => {
          const e = [r.slide, r.logo, r.text[1], r.cta[1]].filter(v => v !== null);
          return `${r.name} · 입력 ${r.input === null ? '—' : Math.round(r.input) + 'ms'} · 완료 ${s(e.length ? Math.max(...e) : null)}` +
                 (r.fr ? ` · ${r.fr.fps.toFixed(0)}fps` : '');
        }).join('<br>') + '</div>';
      }
      box.innerHTML = h;
    }
    draw();
  });
})();
