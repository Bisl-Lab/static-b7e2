// proto/lab/texts.js — lab 이 쓰는 글(정본은 게임 TEXT · 06S — 여기는 옮겨 적은 것) + 규칙서 배치(ink.html · paper.html 이 같이 씀).
(function(){
'use strict';
var L = window.InkLab, scratch = document.createElement('canvas').getContext('2d');
var LOG = {   // 06S-A02 §3.4 · 10-A02 추천안 notebook.*(2026-10-01 확정)
  blue:   ['수위는 선까지 세 마디. 조치 없음.', '수위는 선까지 한 마디. 조치 없음.', '03:47 수위 기준선 초과. 본부 승인 대기.'],
  wet:    ['본부 승인 수신 후 개방 완료. 이상 없음.'],
  pencil: ['선까지 두 마디. 순찰 조작반까지. 이상 없음.', '무전에 수위 보고함. 대기하라고 함.', '03:47 무전이 성명 물음. 당직자라고 응답.'],
  black:  ['선까지 두 마디. 조치 없음.', '기준선 초과. 개방.', '수문 개방. 하류 확인차 강둑 이동. 04:']
};
var RULES = {   // 서장 Core.TEXT.rules1 · ruleHead · ruleBackNote
  h1: '첫 차 대기 안내', lead: '첫 차를 기다리시는 승객께서는 아래 사항을 지켜 주십시오.', h3: '특별 안내', foot: '— 터미널 관리소 —',
  r: ['대합실이 평소와 다르면 도로 쪽 문으로 나갔다 다시 들어오십시오.', '평소와 같으면 그대로 앉아 계십시오.',
    '"승객 한 분, 바로 승강장으로 나와 주십시오." 하는 방송이 나오면 지체 없이 승강장으로 나가십시오.', '매점 셔터가 끝까지 올라가 있으면 매점 쪽을 보지 마십시오.',
    '첫 차는 헤드라이트를 켜고 엔진 소리와 함께 옵니다. 첫 차가 서면 승강장으로 나가십시오.', '게시판에서 떨어진 전단은 제자리에 다시 붙여 주십시오.'],
  back: ['여기 적힌 걸 다', '사람이 쓴 건 아니다.']
};
// 규칙서 — 게임 종이 카드의 글 배치(h2 · lead · ol · h3 · foot)를 면 px 로. 판에 맞춰 글자를 줄인다(fitPaper 와 같은 생각)
function rulesOps(sw, sh){
  var ops = [];
  for (var f = 0.036 * sh; f > 0.016 * sh; f *= 0.97){
    ops = []; var y = 0;
    var add = function(o){ ops.push(o); };
    var center = function(t, size, weight, color, ls){ y += size * 1.05; add({ t: t, x: sw / 2, y: y, size: size, family: L.SANS, weight: weight, align: 'center', ink: 'print', color: color, ls: ls }); y += size * 0.3; };
    center(RULES.h1, 1.143 * f, 700, null, 0.12); y += 0.1 * f;
    L.wrapW(scratch, RULES.lead, L.SANS, 0.893 * f, 400, sw * 0.96).forEach(function(l){ center(l, 0.893 * f, 400, [58, 58, 56], 0); });
    y += 0.55 * f;
    var li = function(n, t){
      L.wrapW(scratch, t, L.SANS, f, 400, sw - 1.45 * f).forEach(function(l, i){ y += f * 1.5 * (i ? 1 : 0.85); if (!i) add({ t: n + '.', x: 1.1 * f, y: y, size: f, family: L.SANS, weight: 400, align: 'right', ink: 'print' }); add({ t: l, x: 1.45 * f, y: y, size: f, family: L.SANS, weight: 400, ink: 'print' }); });
      y += f * 0.65 + 0.4 * f;
    };
    li(1, RULES.r[0]); li(2, RULES.r[1]);
    y += 0.5 * f; y += 0.929 * f; add({ t: RULES.h3, x: 0, y: y, size: 0.929 * f, family: L.SANS, weight: 700, ink: 'print', ls: 0.1 }); y += 0.35 * f;
    for (var i = 2; i < 6; i++) li(i + 1, RULES.r[i]);
    if (y + 1.6 * f <= sh){ add({ t: RULES.foot, x: sw / 2, y: sh - 0.2 * f, size: 0.714 * f, family: L.SANS, weight: 400, align: 'center', ink: 'print', color: [107, 102, 93], ls: 0.1 }); break; }
  }
  return { ops: ops, pad: 0.04 };
}
// 규칙서 뒷면 손글씨(index.html .backnote: 왼 24 · 위 32% · −3°)
function backOps(family){
  return function(sw, sh){
    var size = sh * 0.062 / L.inkH(family) * 0.75, R = L.rng(3);
    return { ops: RULES.back.map(function(t, i){ return { t: t, x: 0.04 * sw, y: 0.3 * sh + i * size * 1.25, size: size, family: family, ink: 'black', color: [31, 45, 51], rot: -3, jit: 0.6 }; }), pad: 0.06 };
  };
}
window.LabText = { LOG: LOG, RULES: RULES, rulesOps: rulesOps, backOps: backOps };
})();
