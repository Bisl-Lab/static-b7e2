// proto/lab/ink.js — 글자 얹기 시험 렌더러(S1-lab, 2026-10-02). 게임 코드와 무관 — S1 이 Ink.place 로 옮길 때의 본.
// A = 지금 방식(사진 위에 평면 글 — 게임 코드 fitText · notebookPages · .wetink 를 그대로 옮김)
// B = 새 방식: 네 꼭짓점 원근(호모그래피) · 곱하기 섞기 · 사진 밝기 따르기(잉크색 ÷ 종이 평균색) · 잉크 번짐 · 종이 알갱이(절차 잡음 + 사진의 밝은 알갱이)
//     · 가장자리 미세 흐림(사진이 흐린 만큼) · 접힌 자국 따라 밀기 · 캔은 원통 휨. 면 데이터 = surfaces.json { quad, blend, grain, bleed, warp }.
(function(){
'use strict';
var IMG = '../room01/img/';
var SANS = '-apple-system,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,sans-serif';
var PEN_FONTS = {
  nanum:  { name: '나눔손글씨 펜', family: '"Nanum Pen Script"' },
  gaegu:  { name: '개구',          family: '"Gaegu"' },
  melody: { name: '하이멜로디',    family: '"Hi Melody"' }
};
var PER_PERSON = { blue: 'nanum', pencil: 'gaegu', black: 'melody' };   // 「사람마다」 — 펜마다 다른 손
var INK = {   // 잉크 — 색(0~255)과 성질
  blue:    { color: [29, 60, 140],  kind: 'ball' },
  black:   { color: [16, 18, 20],   kind: 'ball' },
  pencil:  { color: [90, 93, 96],   kind: 'pencil' },
  wet:     { color: [16, 30, 66],   kind: 'wet', halo: [52, 84, 150] },
  wallpen: { color: [40, 52, 84],   kind: 'ball' },
  print:   { color: [20, 22, 26],   kind: 'toner' },
  copy:    { color: [38, 38, 36],   kind: 'toner' },
  inkjet:  { color: [22, 22, 24],   kind: 'inkjet' }
};

// ── 작은 도구 ──
function rng(seed){ var s = (seed >>> 0) || 1; return function(){ s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
var imgCache = {};
function loadImg(src){
  if (!imgCache[src]) imgCache[src] = new Promise(function(res, rej){ var im = new Image(); im.onload = function(){ res(im); }; im.onerror = function(){ rej(new Error('그림을 못 받음: ' + src)); }; im.src = IMG + src; });
  return imgCache[src];
}
// 분리형 상자 흐림(Float32, 두 번 = 가우스에 가깝게). r < 1.2 면 3탭.
function blurF(src, w, h, r, passes){
  if (!(r > 0.05)) return src;
  var out = new Float32Array(src), tmp = new Float32Array(src.length), p, x, y, i;
  if (r < 1.2){
    var k = clamp(r * 0.36, 0.02, 0.33), c = 1 - 2 * k;
    for (y = 0; y < h; y++){ i = y * w; for (x = 0; x < w; x++) tmp[i + x] = out[i + x] * c + out[i + (x > 0 ? x - 1 : x)] * k + out[i + (x < w - 1 ? x + 1 : x)] * k; }
    for (y = 0; y < h; y++){ var up = (y > 0 ? y - 1 : y) * w, dn = (y < h - 1 ? y + 1 : y) * w; i = y * w; for (x = 0; x < w; x++) out[i + x] = tmp[i + x] * c + tmp[up + x] * k + tmp[dn + x] * k; }
    return out;
  }
  var R = Math.max(1, Math.round(r * 0.75)), n = 2 * R + 1;
  for (p = 0; p < (passes || 2); p++){
    for (y = 0; y < h; y++){
      var row = y * w, acc = 0;
      for (x = -R; x <= R; x++) acc += out[row + clamp(x, 0, w - 1)];
      for (x = 0; x < w; x++){ tmp[row + x] = acc / n; acc += out[row + Math.min(x + R + 1, w - 1)] - out[row + Math.max(x - R, 0)]; }
    }
    for (x = 0; x < w; x++){
      var acc2 = 0;
      for (y = -R; y <= R; y++) acc2 += tmp[clamp(y, 0, h - 1) * w + x];
      for (y = 0; y < h; y++){ out[y * w + x] = acc2 / n; acc2 += tmp[Math.min(y + R + 1, h - 1) * w + x] - tmp[Math.max(y - R, 0) * w + x]; }
    }
  }
  return out;
}
// 값 잡음(거친 격자를 쌍선형으로 키움) — 0~1
function vnoise(w, h, cell, R){
  cell = Math.max(1.2, cell);
  var gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = new Float32Array(gw * gh), out = new Float32Array(w * h), i, x, y;
  for (i = 0; i < g.length; i++) g[i] = R();
  for (y = 0; y < h; y++){
    var fy = y / cell, iy = fy | 0, ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
    for (x = 0; x < w; x++){
      var fx = x / cell, ix = fx | 0, tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
      var a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      out[y * w + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
  }
  return out;
}
// 단위 사각형 → 네 꼭짓점(왼위, 오른위, 오른아래, 왼아래) 호모그래피와 그 역
function homography(q){
  var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
  var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3, g, h;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9){ g = 0; h = 0; }
  else { var den = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function inv3(m){
  var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
  var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function hmap(m, u, v){ var w = m[6] * u + m[7] * v + m[8]; return [(m[0] * u + m[1] * v + m[2]) / w, (m[3] * u + m[4] * v + m[5]) / w]; }
function dist(p, q){ return Math.hypot(p[0] - q[0], p[1] - q[1]); }

// ── 글꼴 ──
function penFamily(pen, choice){ var id = choice === 'person' ? (PER_PERSON[pen] || 'nanum') : choice; return (PEN_FONTS[id] || PEN_FONTS.nanum).family; }
var inkHCache = {};
function inkH(family, weight){   // 1em 당 한글 높이(「수위는 선까지」 — lab 글에 늘 있는 글자)(글꼴마다 글자 크기가 다르다 — 같은 높이로 맞춘다)
  var key = family + weight; if (inkHCache[key]) return inkHCache[key];
  var c = document.createElement('canvas').getContext('2d'); c.font = (weight || 400) + ' 100px ' + family;
  var m = c.measureText('수위는 선까지'), v = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 100;
  return (inkHCache[key] = v > 0.2 ? v : 0.75);
}
function fontsReady(fams, text){
  var list = [];
  fams.forEach(function(f){ list.push(document.fonts.load('400 40px ' + f, text)); list.push(document.fonts.load('700 40px ' + f, text)); });
  return Promise.all(list).catch(function(){}).then(function(){ return document.fonts.ready; });
}

// ── 화면(자리 보기) ──
function makeView(W, H, crop, imgW, imgH){ var k = W / crop[2]; return { W: W, H: H, k: k, ox: -crop[0] * k, oy: -crop[1] * k, imgW: imgW, imgH: imgH, P: function(f){ return [f[0] * imgW * k - crop[0] * k, f[1] * imgH * k - crop[1] * k]; } }; }
function drawPhoto(ctx, im, v, crop){ ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, crop[0], crop[1], crop[2], crop[3], 0, 0, v.W, v.H); }

// ── 글 놓기(op) — 면 px 안에서 ──
// op = { t, x, y(바탕선), size(px), family, weight, align, color, alpha, rot(도), ls(자간 em), stroke(em), jit(0~1 손떨림), ink }
function measure(ctx, op){ ctx.font = (op.weight || 400) + ' ' + op.size + 'px ' + op.family; var w = 0, ls = (op.ls || 0) * op.size; Array.from(op.t).forEach(function(ch){ w += ctx.measureText(ch).width + ls; }); return w - ls; }
function drawOp(ctx, op, R){
  ctx.save();
  ctx.font = (op.weight || 400) + ' ' + op.size + 'px ' + op.family;
  ctx.textBaseline = 'alphabetic';
  var w = measure(ctx, op), x = op.align === 'center' ? op.x - w / 2 : op.align === 'right' ? op.x - w : op.x, y = op.y, ls = (op.ls || 0) * op.size;
  if (op.rot){ ctx.translate(op.x, op.y); ctx.rotate(op.rot * Math.PI / 180); ctx.translate(-op.x, -op.y); }
  if (op.stroke){ ctx.lineWidth = op.stroke * op.size; ctx.lineJoin = 'round'; }
  var j = op.jit || 0;
  if (!j && !ls){ ctx.fillText(op.t, x, y); if (op.stroke) ctx.strokeText(op.t, x, y); ctx.restore(); return; }
  var drift = R ? (R() - 0.5) * j * 0.02 : 0;   // 한 줄의 기울어짐
  Array.from(op.t).forEach(function(ch, i){
    var cw = ctx.measureText(ch).width;
    if (ch !== ' '){
      ctx.save();
      var dx = R ? (R() - 0.5) * j * 0.06 * op.size : 0, dy = R ? (R() - 0.5) * j * 0.09 * op.size + drift * (x - (op.x || 0)) : 0, rr = R ? (R() - 0.5) * j * 0.12 : 0, sc = R ? 1 + (R() - 0.5) * j * 0.08 : 1;
      ctx.translate(x + cw / 2 + dx, y + dy); ctx.rotate(rr); ctx.scale(sc, sc);
      ctx.fillText(ch, -cw / 2, 0); if (op.stroke) ctx.strokeText(ch, -cw / 2, 0);
      ctx.restore();
    }
    x += cw + ls;
  });
  ctx.restore();
}
function wrapW(ctx, text, family, size, weight, maxW){
  ctx.font = (weight || 400) + ' ' + size + 'px ' + family;
  var out = [], line = '';
  String(text).split(' ').forEach(function(wd){
    var cand = line ? line + ' ' + wd : wd;
    if (line && ctx.measureText(cand).width > maxW){ out.push(line); line = wd; } else line = cand;
    while (ctx.measureText(line).width > maxW && line.length > 1){   // 긴 낱말은 글자로 끊는다
      var cut = line.length - 1; while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
      out.push(line.slice(0, cut)); line = line.slice(cut);
    }
  });
  if (line) out.push(line);
  return out;
}

// ── B: 잉크 래스터(면 공간) — 잉크마다 알파를 따로 만들어 성질을 먹인 뒤 겹친다 ──
function rasterInk(ops, sw, sh, pad, S, kS, seed){
  var px = Math.round(sw * pad), py = Math.round(sh * pad), fw = sw + 2 * px, fh = sh + 2 * py, N = fw * fh;
  var C = [new Float32Array(N), new Float32Array(N), new Float32Array(N)], A = new Float32Array(N);
  var groups = {}, order = [];
  ops.forEach(function(op){ var key = op.ink + '|' + (op.color ? op.color.join(',') : ''); if (!groups[key]){ groups[key] = []; order.push(key); } groups[key].push(op); });
  var cv = document.createElement('canvas'); cv.width = fw; cv.height = fh; var ctx = cv.getContext('2d', { willReadFrequently: true });
  var G = S.grain || {}, B = S.bleed || {};
  order.forEach(function(key, gi){
    var gops = groups[key], ink = INK[gops[0].ink] || INK.black, col = gops[0].color || ink.color, R = rng(seed * 31 + gi * 7 + 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, fw, fh); ctx.translate(px, py);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    var drips = [];
    gops.forEach(function(op){ drawOp(ctx, op, op.jit ? R : null); if (op.drips) drips = drips.concat(op.drips); });
    var d = ctx.getImageData(0, 0, fw, fh).data, a = new Float32Array(N), i;
    for (i = 0; i < N; i++) a[i] = d[i * 4 + 3] / 255 * (gops[0].alpha != null ? gops[0].alpha : 1);
    var size = gops[0].size, fine = vnoise(fw, fh, (G.scale || 1) * kS, R), low = vnoise(fw, fh, size * 0.9, R);
    var halo = null;
    if (ink.kind === 'ball'){
      for (i = 0; i < N; i++){ var t = clamp((fine[i] - 0.42) * 2.4, 0, 1); a[i] *= (1 - (G.press || 0) * 0.55 * low[i]) * (1 - (G.amount || 0) * t); }
      if (B.px){ var b1 = blurF(a, fw, fh, B.px * kS); for (i = 0; i < N; i++) a[i] = Math.max(a[i], b1[i] * 0.6); }
    } else if (ink.kind === 'pencil'){
      var f2 = vnoise(fw, fh, (G.scale || 1) * kS * 0.7, R);
      for (i = 0; i < N; i++){ var t2 = clamp((f2[i] - 0.35) * 2, 0, 1); a[i] *= 0.9 * (1 - (G.press || 0) * 0.6 * low[i]) * (1 - Math.min(0.9, (G.amount || 0) * 1.7) * t2); }
      a = blurF(a, fw, fh, 0.5 * kS);
    } else if (ink.kind === 'wet'){
      // 굵은 글씨 · 번진 잉크: 핵(조금 퍼짐) + 옅은 번짐 테 + 흘러내린 자국
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, fw, fh); ctx.translate(px, py);
      drips.forEach(function(dp){ var g = ctx.createLinearGradient(0, dp.y, 0, dp.y + dp.len); g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(dp.x - dp.w / 2, dp.y); ctx.quadraticCurveTo(dp.x + dp.w * 0.3, dp.y + dp.len * 0.5, dp.x - dp.w * 0.15, dp.y + dp.len); ctx.lineTo(dp.x + dp.w * 0.15, dp.y + dp.len); ctx.quadraticCurveTo(dp.x + dp.w * 0.8, dp.y + dp.len * 0.5, dp.x + dp.w / 2, dp.y); ctx.fill();
        ctx.beginPath(); ctx.ellipse(dp.x, dp.y + dp.len * 0.95, dp.w * 0.42, dp.w * 0.55, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill(); });
      var dd = ctx.getImageData(0, 0, fw, fh).data;
      var core = blurF(a, fw, fh, (B.px || 0.4) * kS * 1.1);
      var wetK = B.wet != null ? B.wet : 1;
      halo = blurF(a, fw, fh, size * 0.16 * wetK, 2);
      for (i = 0; i < N; i++){ var t3 = clamp((fine[i] - 0.5) * 2, 0, 1); a[i] = clamp(Math.max(a[i] * 0.96, core[i] * 0.6) * (1 - 0.25 * (G.amount || 0) * t3) + dd[i * 4 + 3] / 255 * 0.65, 0, 1); halo[i] = clamp(halo[i] * 0.42 * wetK, 0, 0.36); }
    } else if (ink.kind === 'toner'){
      var R2 = rng(seed * 13 + gi + 5);
      for (i = 0; i < N; i++){ var t4 = clamp((fine[i] - 0.55) * 3, 0, 1); a[i] *= (1 - (G.amount || 0) * t4) * (1 - (G.press || 0) * 0.5 * low[i]); }
      if (B.px){ var b2 = blurF(a, fw, fh, B.px * kS); for (i = 0; i < N; i++) a[i] = Math.max(a[i], b2[i] * 0.5); }
      if (G.specks){   // 복사기 토너 점 — 글 둘레에만 드문드문
        var near = blurF(a, fw, fh, size * 0.5, 1), cnt = Math.round(G.specks * N / 900);
        for (var s = 0; s < cnt; s++){ var sx = (R2() * fw) | 0, sy = (R2() * fh) | 0, k0 = sy * fw + sx; if (near[k0] < 0.02 && R2() > 0.15) continue; var rr = 0.6 + R2() * 1.4 * kS * 0.5, al = 0.25 + R2() * 0.45;
          for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++){ var q = (sy + oy) * fw + sx + ox; if (q < 0 || q >= N) continue; var dd2 = Math.hypot(ox, oy); if (dd2 <= rr) a[q] = Math.max(a[q], al * (1 - dd2 / (rr + 0.5))); } }
      }
    } else if (ink.kind === 'inkjet'){
      var pitch = Math.max(2.2, size / 7), rad = pitch * 0.46;
      for (var y = 0; y < fh; y++) for (var x = 0; x < fw; x++){ i = y * fw + x; if (!a[i]) continue; var gx = (x - px) / pitch, gy = (y - py) / pitch, ddx = (gx - Math.round(gx)) * pitch, ddy = (gy - Math.round(gy)) * pitch, dr = Math.hypot(ddx, ddy); a[i] *= clamp((rad - dr) / 0.9 + 0.5, 0, 1) * (1 - (G.amount || 0) * fine[i]); }
      a = blurF(a, fw, fh, 0.35 * kS);
    }
    var c0 = col[0] / 255, c1 = col[1] / 255, c2 = col[2] / 255;
    if (halo){ var hc = ink.halo || col, h0 = hc[0] / 255, h1 = hc[1] / 255, h2 = hc[2] / 255; for (i = 0; i < N; i++){ var ha = halo[i]; if (ha <= 0) continue; var inv = 1 - ha; C[0][i] = C[0][i] * inv + h0 * ha; C[1][i] = C[1][i] * inv + h1 * ha; C[2][i] = C[2][i] * inv + h2 * ha; A[i] = A[i] + ha * (1 - A[i]); } }
    for (i = 0; i < N; i++){ var aa = a[i]; if (aa <= 0) continue; var iv = 1 - aa; C[0][i] = C[0][i] * iv + c0 * aa; C[1][i] = C[1][i] * iv + c1 * aa; C[2][i] = C[2][i] * iv + c2 * aa; A[i] = A[i] + aa * (1 - A[i]); }
  });
  return { w: fw, h: fh, padX: px / fw, padY: py / fh, C: C, A: A };
}

// ── B: 사진 읽기(밝기 · 큰 밝기 · 밝은 알갱이 · 기울기) ──
function analyze(img, W, H, k){
  var d = img.data, N = W * H, L = new Float32Array(N), i;
  for (i = 0; i < N; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  var Lf = blurF(L, W, H, Math.max(1, 1.4 * k), 1), Lm = blurF(L, W, H, Math.max(1.5, 2.5 * k), 2), Lb = blurF(L, W, H, Math.max(6, Math.min(W, H) * 0.04), 2);
  return { L: L, Lf: Lf, Lm: Lm, Lb: Lb, W: W, H: H };
}

// ── B: 면 하나를 사진 위에 ──
function placeB(photo, an, view, S, ops, opt){
  var W = view.W, H = view.H, q = S.quad.map(view.P), d = photo.data;
  // 면 크기(사진 px) — 네 변 평균
  var Q = S.quad.map(function(p){ return [p[0] * view.imgW, p[1] * view.imgH]; });
  var sw0 = (dist(Q[0], Q[1]) + dist(Q[3], Q[2])) / 2, sh0 = (dist(Q[0], Q[3]) + dist(Q[1], Q[2])) / 2;
  var kS = Math.max(1, view.k * (opt.over || 1.5)), sw = Math.round(sw0 * kS), sh = Math.round(sh0 * kS);
  var built = ops(sw, sh);
  var pad = built.pad != null ? built.pad : 0.12;
  var ink = rasterInk(built.ops, sw, sh, pad, S, kS, opt.seed || 7);
  var M = homography(q), Mi = inv3(M), warp = S.warp || {}, cyl = warp.kind === 'cylinder';
  var s0 = cyl ? Math.sin(warp.from * Math.PI / 180) : 0, s1 = cyl ? Math.sin(warp.to * Math.PI / 180) : 1, th0 = cyl ? warp.from * Math.PI / 180 : 0, th1 = cyl ? warp.to * Math.PI / 180 : 0;
  // 사진 위 범위(번짐 여유 포함)
  var xs = [], ys = [];
  [[-pad, -pad], [1 + pad, -pad], [1 + pad, 1 + pad], [-pad, 1 + pad]].forEach(function(uv){ var p = hmap(M, uv[0], uv[1]); xs.push(p[0]); ys.push(p[1]); });
  var x0 = clamp(Math.floor(Math.min.apply(null, xs)) - 2, 0, W - 1), x1 = clamp(Math.ceil(Math.max.apply(null, xs)) + 2, 0, W - 1), y0 = clamp(Math.floor(Math.min.apply(null, ys)) - 2, 0, H - 1), y1 = clamp(Math.ceil(Math.max.apply(null, ys)) + 2, 0, H - 1);
  var bw = x1 - x0 + 1, bh = y1 - y0 + 1, BN = bw * bh, LA = new Float32Array(BN), LC = [new Float32Array(BN), new Float32Array(BN), new Float32Array(BN)];
  var disp = (warp.disp || 0) * view.k, fw = ink.w, fh = ink.h, Aa = ink.A, Cc = ink.C;
  for (var y = y0; y <= y1; y++){
    for (var x = x0; x <= x1; x++){
      var X = x + 0.5, Y = y + 0.5, idx = y * W + x;
      if (disp){ var Lm = an.Lm, gx = (Lm[idx + (x < W - 1 ? 1 : 0)] - Lm[idx - (x > 0 ? 1 : 0)]), gy = (Lm[idx + (y < H - 1 ? W : 0)] - Lm[idx - (y > 0 ? W : 0)]); X += gx * disp * 30; Y += gy * disp * 30; }
      var w = Mi[6] * X + Mi[7] * Y + Mi[8], u = (Mi[0] * X + Mi[1] * Y + Mi[2]) / w, v = (Mi[3] * X + Mi[4] * Y + Mi[5]) / w;
      if (cyl){ var sv = v * (s1 - s0) + s0; v = sv >= -1 && sv <= 1 ? (Math.asin(sv) - th0) / (th1 - th0) : v; }
      var su = (u + pad) / (1 + 2 * pad) * fw - 0.5, svv = (v + pad) / (1 + 2 * pad) * fh - 0.5;
      if (su < 0 || svv < 0 || su >= fw - 1 || svv >= fh - 1) continue;
      var ix = su | 0, iy = svv | 0, tx = su - ix, ty = svv - iy, i00 = iy * fw + ix, i10 = i00 + 1, i01 = i00 + fw, i11 = i01 + 1;
      var w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      var a = Aa[i00] * w00 + Aa[i10] * w10 + Aa[i01] * w01 + Aa[i11] * w11;
      if (a <= 0.001) continue;
      var j = (y - y0) * bw + (x - x0);
      LA[j] = a;
      for (var c = 0; c < 3; c++){ var cc = Cc[c]; LC[c][j] = cc[i00] * w00 + cc[i10] * w10 + cc[i01] * w01 + cc[i11] * w11; }
    }
  }
  // 가장자리 미세 흐림 — 사진이 흐린 만큼(사진 px → 화면 px)
  var soft = (warp.soft || 0) * view.k;
  if (soft > 0.15){ LA = blurF(LA, bw, bh, soft, 1); for (var cI = 0; cI < 3; cI++) LC[cI] = blurF(LC[cI], bw, bh, soft, 1); }
  // 종이 평균색(쿼드 안 밝은 쪽 60%) · 큰 밝기 평균
  var samp = [];
  for (var gy2 = 0; gy2 < 24; gy2++) for (var gx2 = 0; gx2 < 24; gx2++){ var p = hmap(M, (gx2 + 0.5) / 24, (gy2 + 0.5) / 24), px2 = clamp(p[0] | 0, 0, W - 1), py2 = clamp(p[1] | 0, 0, H - 1), k2 = (py2 * W + px2) * 4; samp.push([d[k2], d[k2 + 1], d[k2 + 2], an.Lb[py2 * W + px2]]); }
  samp.sort(function(a2, b2){ return (b2[0] + b2[1] + b2[2]) - (a2[0] + a2[1] + a2[2]); });
  var top = samp.slice(0, Math.round(samp.length * 0.6)), paper = [0, 0, 0], Lmean = 0;
  top.forEach(function(s){ paper[0] += s[0]; paper[1] += s[1]; paper[2] += s[2]; }); paper = paper.map(function(v){ return Math.max(0.08, v / top.length / 255); });
  samp.forEach(function(s){ Lmean += s[3]; }); Lmean = Math.max(0.03, Lmean / samp.length);
  var Bl = S.blend || {}, mode = Bl.mode || 'multiply', follow = Bl.follow != null ? Bl.follow : 1, op = Bl.opacity != null ? Bl.opacity : 1, gp = (S.grain || {}).photo || 0;
  for (var yy = 0; yy < bh; yy++){
    for (var xx = 0; xx < bw; xx++){
      var jj = yy * bw + xx, a0 = LA[jj]; if (a0 <= 0.003) continue;
      var id = (yy + y0) * W + (xx + x0), k4 = id * 4, aa = clamp(a0, 0, 1) * op;
      if (gp){ var hp = an.L[id] - an.Lf[id]; aa *= 1 - gp * clamp(hp * 9, 0, 0.85); }
      var Pr = d[k4] / 255, Pg = d[k4 + 1] / 255, Pb = d[k4 + 2] / 255;
      var cr = LC[0][jj] / a0, cg = LC[1][jj] / a0, cb = LC[2][jj] / a0, or, og, ob;
      if (mode === 'multiply'){
        var mr = cr + (Math.min(1, cr / paper[0]) - cr) * follow, mg = cg + (Math.min(1, cg / paper[1]) - cg) * follow, mb = cb + (Math.min(1, cb / paper[2]) - cb) * follow;
        or = Pr * (1 - aa + aa * mr); og = Pg * (1 - aa + aa * mg); ob = Pb * (1 - aa + aa * mb);
      } else {
        var kk = follow ? Math.pow(clamp(an.Lb[id] / Lmean, 0.3, 1.6), follow) : 1;
        if (mode === 'screen'){ or = 1 - (1 - Pr) * (1 - aa * cr * kk); og = 1 - (1 - Pg) * (1 - aa * cg * kk); ob = 1 - (1 - Pb) * (1 - aa * cb * kk); }
        else { or = Pr * (1 - aa) + cr * kk * aa; og = Pg * (1 - aa) + cg * kk * aa; ob = Pb * (1 - aa) + cb * kk * aa; }
      }
      d[k4] = clamp(or * 255, 0, 255); d[k4 + 1] = clamp(og * 255, 0, 255); d[k4 + 2] = clamp(ob * 255, 0, 255);
    }
  }
  return { paper: paper, sw: sw, sh: sh };
}

// ── A: 지금 게임 코드 그대로(옮김) ──
function gTextW(t, fs, k){ var w = 0; Array.from(t).forEach(function(ch){ w += /[\x20-\x7e]/.test(ch) ? (ch === ' ' ? 0.32 : 0.55) * fs : (k || 1) * fs; }); return w; }
function gWrapT(t, fs, maxW, k){ var out = [], line = ''; String(t).split(' ').forEach(function(wd){ var cand = line ? line + ' ' + wd : wd; if (line && gTextW(cand, fs, k) > maxW){ out.push(line); line = wd; } else line = cand; }); if (line) out.push(line); return out; }
// index.html fitText — 320×260 단위(확대 조각 위). box = [x, y, w, h] 단위.
function gFitText(ctx, view, str, box, o){
  o = o || {}; var fs = o.max || 24, k = o.pen ? 0.82 : 1, lines = [str];
  for (; fs > 8; fs--){ lines = gWrapT(str, fs, box[2], k); if (lines.length * fs * 1.3 <= box[3] && lines.every(function(l){ return gTextW(l, fs, k) <= box[2] + 1; })) break; }
  var y0 = box[1] + box[3] / 2 - (lines.length - 1) * fs * 1.3 / 2 + fs * 0.35, cx = box[0] + box[2] / 2, u = view.k * view.imgW / 320;
  ctx.save(); ctx.setTransform(u, 0, 0, u, view.ox, view.oy);
  if (o.rot){ ctx.translate(cx, box[1] + box[3] / 2); ctx.rotate(o.rot * Math.PI / 180); ctx.translate(-cx, -(box[1] + box[3] / 2)); }
  ctx.font = (o.weight || 400) + ' ' + fs + 'px ' + (o.pen ? PEN_FONTS.nanum.family : SANS); ctx.textAlign = 'center'; ctx.fillStyle = o.fill || '#1b1d20'; ctx.globalAlpha = o.op != null ? o.op : 1;
  lines.forEach(function(l, i){ ctx.fillText(l, cx, y0 + i * fs * 1.3); });
  ctx.restore();
}
function boxOf(fr){ return [fr[0] * 320, fr[1] * 260, (fr[2] - fr[0]) * 320, (fr[3] - fr[1]) * 260]; }
// .wetink(1장 굵은 글씨 · 「있다」) — CSS 그림자 다섯 겹 + 획 0.7px 을 캔버스로(글 크기 19px 기준 비율). sc = 화면 px / 글 단위
function gWetInk(ctx, t, x, y, fsUnits, sc){
  var e = fsUnits * sc / 19, sh = [[0, 0, 1, 'rgba(18,32,64,.95)'], [0, 1, 2.5, 'rgba(24,44,86,.8)'], [1, 3, 5, 'rgba(30,56,108,.6)'], [-2, 5, 9, 'rgba(36,64,124,.45)'], [2, 7, 13, 'rgba(36,64,124,.3)']];
  ctx.save(); ctx.font = '900 ' + fsUnits + 'px ' + PEN_FONTS.nanum.family; ctx.fillStyle = '#122040';
  sh.slice().reverse().forEach(function(s){ ctx.shadowOffsetX = s[0] * e; ctx.shadowOffsetY = s[1] * e; ctx.shadowBlur = s[2] * e; ctx.shadowColor = s[3]; ctx.fillText(t, x, y); });
  ctx.shadowColor = 'transparent'; ctx.lineWidth = 0.7 * fsUnits / 19; ctx.strokeStyle = '#122040'; ctx.strokeText(t, x, y); ctx.fillText(t, x, y);
  ctx.restore();
}

window.InkLab = {
  IMG: IMG, SANS: SANS, PEN_FONTS: PEN_FONTS, PER_PERSON: PER_PERSON, INK: INK,
  rng: rng, clamp: clamp, loadImg: loadImg, blurF: blurF, vnoise: vnoise, homography: homography, inv3: inv3, hmap: hmap,
  penFamily: penFamily, inkH: inkH, fontsReady: fontsReady, makeView: makeView, drawPhoto: drawPhoto,
  measure: measure, drawOp: drawOp, wrapW: wrapW, rasterInk: rasterInk, analyze: analyze, placeB: placeB,
  gTextW: gTextW, gWrapT: gWrapT, gFitText: gFitText, boxOf: boxOf, gWetInk: gWetInk
};
})();
