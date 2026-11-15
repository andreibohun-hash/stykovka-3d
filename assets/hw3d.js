/* «Стыковка 3D» — проба «инженерное железо» (?look=hw), заход 2 (16.11.2026). Подключается после scene3d.js и только с ?look=hw.
   Стиль — по рефам Андрея (art-src/refs): инженерное «железо» в духе МКС — светлые панели, металлические кольца, медь раструба,
   синие ячейки солнечных панелей, оранжевые наклейки, голубые огоньки. Заход 1 (модели Tripo) снят: кривые, без портов и оси.
   Теперь модели — свои, из примитивов three.js: строго симметричные, центр — середина клетки, длина ровно в клетку (ферма — 2),
   у каждого модуля ось +X и стыковочные порты на торцах (x = ±0,5): соседи сходятся порт к порту в одну линию.
   Детализация — текстурами GPT (атлас assets/hw/atlas.jpg: панели, сталь, медь, ячейки, радиатор, контейнер, механика, фольга),
   а не формой. Окна — группа lamp (цвет задаёт игра: холодные в очереди, голубые на питании), огоньки портов — energy (ток от ядра).
   Модель: +X — нос по курсу (порт, которым модуль встаёт к станции), −X — внешний торец (стекло капсулы, раструб двигателя). */
(function(){
'use strict';
let look = ''; try { look = new URLSearchParams(location.search).get('look') || ''; } catch (e) {}
if (look !== 'hw' || !window.R3 || !R3.lib) return;
const { T, P, rbox, sph, ART } = R3.lib;
const V = '2.3.0';                                   // ?v= атласа — вместе с VERSION игры (Pages кэширует ассеты 10 мин)
const PI = Math.PI;

// Семейства (тип модуля в правилах): hab — жилой, pan — панель, truss — ферма. Вид модуля выбирает игра (hwPick) по месту в решении.
const HW = {
  capsule: { fam: 'hab' }, hab: { fam: 'hab' }, cupola: { fam: 'hab' }, engine: { fam: 'hab' }, node: { fam: 'hab' }, cargo: { fam: 'hab' },
  solar: { fam: 'pan' }, twin: { fam: 'pan' }, radiator: { fam: 'pan' }, dish: { fam: 'pan' },
  truss: { fam: 'truss' }, tanks: { fam: 'truss' }, mast: { fam: 'truss' },
  core: { fam: 'core' }, debris: { fam: 'rock' },
};

// ---------- числа формы (клетка = 1) ----------
const YC = 0.38;        // ось модулей над полем
const RB = 0.36;        // радиус корпуса (диаметр 0,72 — модуль заполняет клетку)
const RP = 0.2;         // радиус стыковочного порта — у всех модулей один: соседи сходятся порт к порту
const XB = 0.38;        // корпус от −XB до +XB, дальше конус к порту и порт до 0,5

// ---------- атлас: 4 × 2 плитки (GPT) ----------
// ряд 0 (верх картинки): панели, сталь, радиатор, контейнер; ряд 1: медь, ячейки, механика, фольга
const TILE = { panel: [0, 0], steel: [1, 0], radiator: [2, 0], cargo: [3, 0], copper: [0, 1], solar: [1, 1], greeble: [2, 1], foil: [3, 1] };
const PAD = 0.006;
// uv детали (0..1) → кусок плитки: su/sv — доля плитки, ou/ov — сдвиг (доли плитки)
function remapUV(geo, tile, o){
  const [c, r] = TILE[tile], u0 = c / 4 + PAD, tw = 1 / 4 - 2 * PAD, v0 = (r === 0 ? 0.5 : 0) + PAD, th = 1 / 2 - 2 * PAD;
  const su = o.su || 1, sv = o.sv || 1, ou = o.ou || 0, ov = o.ov || 0, uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + (ou + uv.getX(k) * su) * tw, v0 + (ov + uv.getY(k) * sv) * th);
}
// Текстурная деталь: геометрия с uv 0..1, плитка атласа, позиция, поворот, материал ('skin' — краска и панели, 'metal' — металл)
function TP(geo, tile, pos, rot, o){ o = o || {}; return { geo, tile, pos: pos || [0, 0, 0], rot: rot || [0, 0, 0], o, mat: o.metal ? 'metal' : 'skin', col: o.col || '#ffffff', sc: o.sc }; }
// Слить текстурные детали одного материала в одну геометрию (позиция, нормаль, uv, цвет вершин)
function mergeTex(list){
  const pos = [], nor = [], uvs = [], col = [], c = new T.Color(), m = new T.Matrix4(), e = new T.Euler(), q = new T.Quaternion(), v = new T.Vector3(), s = new T.Vector3();
  for (const p of list){
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()); remapUV(g, p.tile, p.o);
    m.compose(v.set(...p.pos), q.setFromEuler(e.set(...p.rot)), s.set(...(p.sc || [1, 1, 1]))); g.applyMatrix4(m);
    const a = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array; c.set(p.col);
    for (let k = 0; k < a.length; k++){ pos.push(a[k]); nor.push(n[k]); }
    for (let k = 0; k < u.length; k++) uvs.push(u[k]);
    for (let k = 0; k < a.length / 3; k++) col.push(c.r, c.g, c.b);
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere(); out.userData.keep = true; return out;
}
// Собрать модель: текстурные детали → по одной геометрии на материал; прочие (окна, ток, стекло, тёмные кромки) — как в ART
function build(parts){
  const out = [], by = { skin: [], metal: [] };
  for (const p of parts) if (p.tile) by[p.mat].push(p); else out.push(p);
  for (const k of ['skin', 'metal']) if (by[k].length) out.unshift({ geo: mergeTex(by[k]), mat: MATS[k], grp: 'hw_' + k, pos: [0, 0, 0], rot: [0, 0, 0] });
  return out;
}

// ---------- примитивы ----------
// Цилиндр вдоль +X (r0 у −X, r1 у +X), шов развёртки — снизу (сверху камера видит середину плитки)
const tubeX = (r0, r1, len, n, open) => { const g = new T.CylinderGeometry(r1, r0, len, n || 28, 1, !!open, PI / 2); g.rotateZ(-PI / 2); return g; };
const tubeZ = (r, len, n) => { const g = new T.CylinderGeometry(r, r, len, n || 16, 1, false, 0); g.rotateX(PI / 2); return g; };
const box = (w, h, d) => new T.BoxGeometry(w, h, d);
const DARK = '#2a2f37', RIM = '#3b424d';
function flipGeo(g){ g = g.index ? g.toNonIndexed() : g.clone(); for (const at of [g.attributes.position, g.attributes.normal, g.attributes.uv]){ const n = at.itemSize;
    for (let k = 0; k + 2 < at.count; k += 3) for (let c = 0; c < n; c++){ const t = at.array[(k + 1) * n + c]; at.array[(k + 1) * n + c] = at.array[(k + 2) * n + c]; at.array[(k + 2) * n + c] = t; } }
  const nr = g.attributes.normal; for (let k = 0; k < nr.count; k++) nr.setXYZ(k, -nr.getX(k), -nr.getY(k), -nr.getZ(k)); return g; }
function bowl(R, th, n){ const g = new T.SphereGeometry(R, n || 32, 8, 0, 2 * PI, 0, th); g.translate(0, -R, 0); g.scale(1, -1, 1);
  const nr = g.attributes.normal; for (let k = 0; k < nr.count; k++) nr.setXYZ(k, -nr.getX(k), -nr.getY(k), -nr.getZ(k)); return g; }   // низ чаши в y = 0

// Стыковочный порт на торце sg (+1 — нос, −1 — корма): конус от корпуса, стальной порт до x = ±0,5, тёмная кромка, огонёк тока
function port(sg, rFrom, xFrom, xe){
  xe = xe || 0.5; const xp = xe - 0.075, cone = Math.max(0.02, xp - xFrom);
  return [TP(tubeX(sg > 0 ? rFrom : RP + 0.03, sg > 0 ? RP + 0.03 : rFrom, cone, 24), 'steel', [sg * (xFrom + cone / 2), YC, 0], null, { metal: true, sv: 0.3 }),
    TP(tubeX(RP, RP, 0.075, 24), 'steel', [sg * (xp + 0.0375), YC, 0], null, { metal: true, sv: 0.2, ov: 0.4 }),
    P(tubeX(RP + 0.022, RP + 0.022, 0.022, 24), RIM, [sg * (xp + 0.012), YC, 0], null, 'hull'),
    P(rbox(0.035, 0.02, 0.07, 0.008), '#ffffff', [sg * (xp + 0.04), YC + RP + 0.005, 0], null, 'energy')];
}
// Порт вбок (узел, ядро): тот же порт, повёрнутый к ±Z
function portZ(sg, rFrom, zFrom){
  return port(1, rFrom, zFrom).map(p => { const g = p.geo.clone(); const m = new T.Matrix4().makeRotationY(sg > 0 ? -PI / 2 : PI / 2);
    const mm = new T.Matrix4().compose(new T.Vector3(...p.pos), new T.Quaternion(), new T.Vector3(1, 1, 1)); g.applyMatrix4(mm); g.applyMatrix4(m);
    return Object.assign({}, p, { geo: g, pos: [0, 0, 0] }); });
}
// Корпус-цилиндр от x0 до x1: панели (плитка panel), стальные пояса на краях, окна сверху
function hull(x0, x1, o){
  o = o || {}; const len = x1 - x0, xm = (x0 + x1) / 2, out = [TP(tubeX(RB, RB, len, 32), o.tile || 'panel', [xm, YC, 0], null, { su: 1, sv: Math.min(1, len * 0.95), ov: o.ov || 0 })];
  for (const x of o.bands || [x0 + 0.03, x1 - 0.03]) out.push(TP(tubeX(RB + 0.014, RB + 0.014, 0.05, 32), 'steel', [x, YC, 0], null, { metal: true, sv: 0.15 }));
  return out;
}
// Окна: прямоугольники на верхней образующей (группа lamp: холодные в очереди, голубые на питании)
const windows = (xs, w, d, y) => xs.map(x => P(rbox(w || 0.07, 0.03, d || 0.1, 0.012), '#ffffff', [x, (y || YC + RB) - 0.004, 0], null, 'lamp'));
// Солнечное крыло: ячейки (плитка solar) в стальной раме, вдоль X длиной L, от z0 до z1 по борту sg
function wing(sg, x, L, z0, z1, tile){
  const W = z1 - z0, zc = sg * (z0 + W / 2), y = YC;
  return [TP(box(L, 0.02, W), tile || 'solar', [x, y, zc], null, { su: Math.min(1, L * 1.1), sv: Math.min(1, W * 1.1) }),
    ...[-1, 1].map(s2 => TP(box(L + 0.02, 0.03, 0.018), 'steel', [x, y, zc + s2 * W / 2], null, { metal: true, sv: 0.1 })),
    ...[-1, 1].map(s2 => TP(box(0.018, 0.03, W), 'steel', [x + s2 * L / 2, y, zc], null, { metal: true, sv: 0.1 }))];
}

// ---------- модели (имя в игре — hw_<вид>) ----------
const MODELS = {
  // жилой отсек: цилиндр в панелях, два стальных пояса, три окна сверху, порты на обоих торцах
  hab: () => [...hull(-XB, XB, { bands: [-0.27, 0, 0.27] }), ...windows([-0.135, 0.135], 0.08, 0.12), ...port(1, RB, XB), ...port(-1, RB, XB)],
  // контейнер: брусок в плитке контейнера, стальные рёбра по углам, порты
  cargo: () => { const L = 0.74, Hh = 0.6, D = 0.68;
    return [TP(box(L, Hh, D), 'cargo', [0, YC, 0], null, { su: 0.95, sv: 0.8 }),
      ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => TP(box(L + 0.01, 0.05, 0.05), 'steel', [0, YC + a * Hh / 2, b * D / 2], null, { metal: true, sv: 0.12 })),
      ...[-1, 1].map(a => TP(box(0.05, Hh + 0.02, D + 0.02), 'steel', [a * (L / 2 - 0.02), YC, 0], null, { metal: true, sv: 0.3 })),
      P(rbox(0.06, 0.02, 0.06, 0.01), '#ffffff', [0.22, YC + Hh / 2 + 0.01, 0.22], null, 'lamp'),
      ...port(1, 0.26, L / 2), ...port(-1, 0.26, L / 2)]; },
  // капсула: порт спереди (+X), корпус сужается к корме, стекло кабины сверху у внешнего торца, тёмный обтекатель
  capsule: () => [...hull(0.02, XB, { bands: [0.05, 0.35] }),
    TP(tubeX(0.18, RB, 0.4, 32), 'panel', [-0.18, YC, 0], null, { sv: 0.4, ov: 0.5 }),
    TP(sph(0.18, 24), 'steel', [-0.38, YC, 0], null, { metal: true, sc: [0.55, 1, 1], sv: 0.5 }),
    P(sph(1, 24), '#7fbbe6', [-0.17, YC + 0.2, 0], null, 'glass'), ...port(1, RB, XB)].map(p => p.grp === 'glass' ? Object.assign(p, { geo: (() => { const g = sph(1, 24); g.scale(0.2, 0.12, 0.17); return g; })() }) : p)
    .concat(windows([0.2], 0.07, 0.1)),
  // двигатель: корпус у порта, силовая рама конусом, медный раструб на корме (−X), тёмное горло
  engine: () => [...hull(-0.06, XB, { bands: [-0.03, 0.2, 0.35] }),
    TP(tubeX(0.16, RB, 0.14, 28), 'greeble', [-0.13, YC, 0], null, { metal: true, sv: 0.4 }),
    TP(tubeX(0.31, 0.13, 0.3, 32), 'copper', [-0.35, YC, 0], null, { metal: true, sv: 0.42, ov: 0.52 }),
    P(tubeX(0.29, 0.29, 0.01, 28), '#14171c', [-0.49, YC, 0], null, 'hull'),
    TP(tubeX(0.315, 0.315, 0.025, 32), 'steel', [-0.49, YC, 0], null, { metal: true, sv: 0.1 }),
    ...windows([0.16], 0.06, 0.1), ...port(1, RB, XB)],
  // купол: короткий корпус, сверху восьмигранная обзорная башенка — стальной каркас и стекло (не светится)
  cupola: () => { const fr = new T.CylinderGeometry(0.15, 0.25, 0.13, 8, 1, false, PI / 8), top = new T.CylinderGeometry(0.15, 0.15, 0.02, 8, 1, false, PI / 8);
    const ribs = []; for (let k = 0; k < 8; k++){ const a = PI / 8 + k * PI / 4 + PI / 8; if (0) ribs.push(TP(box(0.02, 0.15, 0.02), 'steel', [Math.sin(a) * 0.2, YC + RB + 0.06, Math.cos(a) * 0.2], [Math.cos(a) * 0.65, 0, -Math.sin(a) * 0.65], { metal: true, sv: 0.1 })); }
    return [...hull(-XB, XB, { bands: [-0.3, 0.3] }), TP(tubeX(0.27, 0.27, 0.05, 8), 'steel', [0, YC + RB - 0.02, 0], [0, 0, PI / 2], { metal: true, sv: 0.1 }),
      P(fr, '#86bfe8', [0, YC + RB + 0.06, 0], null, 'glass'), P(top, '#86bfe8', [0, YC + RB + 0.13, 0], null, 'glass'), ...ribs,
      TP(new T.TorusGeometry(0.155, 0.014, 6, 8), 'steel', [0, YC + RB + 0.13, 0], [PI / 2, 0, PI / 8], { metal: true, sv: 0.1 }),
      ...port(1, RB, XB), ...port(-1, RB, XB)]; },
  // узел: шар в панелях с четырьмя портами (±X, ±Z) — к нему сходятся соседи со всех сторон
  node: () => [TP(sph(0.33, 32), 'panel', [0, YC, 0], null, { sv: 0.6 }), TP(new T.TorusGeometry(0.335, 0.018, 8, 32), 'steel', [0, YC, 0], [PI / 2, 0, 0], { metal: true, sv: 0.1 }),
    ...port(1, 0.3, 0.22), ...port(-1, 0.3, 0.22), ...portZ(1, 0.3, 0.22), ...portZ(-1, 0.3, 0.22),
    P(rbox(0.08, 0.02, 0.08, 0.012), '#ffffff', [0, YC + 0.33, 0], null, 'lamp')],
  // солнечное крыло: стальная ось с портами, две панели ячеек поперёк — до края клетки
  solar: () => [TP(tubeX(0.11, 0.11, 0.8, 16), 'steel', [0, YC, 0], null, { metal: true, sv: 0.6 }),
    TP(box(0.18, 0.16, 0.24), 'foil', [0, YC, 0], null, { su: 0.4, sv: 0.4 }), TP(tubeZ(0.025, 0.24), 'steel', [0, YC, 0], null, { metal: true, sv: 0.2 }),
    ...wing(1, 0, 0.78, 0.12, 0.48), ...wing(-1, 0, 0.78, 0.12, 0.48), P(rbox(0.05, 0.02, 0.05, 0.01), '#ffffff', [0, YC + 0.085, 0], null, 'lamp'),
    ...port(1, 0.11, 0.4), ...port(-1, 0.11, 0.4)],
  // малые панели: короб в фольге, по борту две пары малых панелей
  twin: () => [TP(box(0.44, 0.34, 0.36), 'foil', [0, YC, 0], null, { su: 0.6, sv: 0.6 }), TP(tubeZ(0.022, 0.5), 'steel', [0, YC, 0], null, { metal: true, sv: 0.2 }),
    ...[-0.19, 0.19].flatMap(x => [...wing(1, x, 0.33, 0.22, 0.48), ...wing(-1, x, 0.33, 0.22, 0.48)]),
    P(rbox(0.06, 0.02, 0.06, 0.01), '#ffffff', [0.12, YC + 0.18, 0.1], null, 'lamp'),
    ...port(1, 0.17, 0.22), ...port(-1, 0.17, 0.22)],
  // радиатор: ось с портами, белые рёбристые панели по бортам (плитка радиатора), без синих ячеек
  radiator: () => [TP(tubeX(0.12, 0.12, 0.8, 16), 'steel', [0, YC, 0], null, { metal: true, sv: 0.6 }), TP(box(0.22, 0.2, 0.26), 'greeble', [0, YC, 0], null, { metal: true, su: 0.4, sv: 0.4 }),
    ...[1, -1].flatMap(sg => wing(sg, 0, 0.6, 0.14, 0.48, 'radiator')),
    P(rbox(0.05, 0.02, 0.05, 0.01), '#ffffff', [0, YC + 0.11, 0], null, 'lamp'), ...port(1, 0.12, 0.4), ...port(-1, 0.12, 0.4)],
  // антенна: короткий корпус в фольге, сверху белая тарелка с облучателем
  dish: () => { const cap = bowl(0.62, 0.62);
    return [...hull(-0.26, 0.26, { tile: 'foil', bands: [-0.24, 0.24] }), ...port(1, RB, 0.26), ...port(-1, RB, 0.26),
      TP(cap, 'panel', [0, YC + 0.33, 0], null, { su: 0.5, sv: 0.5, ou: 0.25 }), TP(flipGeo(cap), 'panel', [0, YC + 0.33, 0], null, { su: 0.5, sv: 0.5, ou: 0.25 }), TP(new T.TorusGeometry(0.36, 0.014, 6, 32), 'steel', [0, YC + 0.33 + 0.62 - 0.62 * Math.cos(0.62), 0], [PI / 2, 0, 0], { metal: true, sv: 0.1 }),
      TP(new T.CylinderGeometry(0.02, 0.05, 0.3, 10), 'steel', [0, YC + 0.46, 0], null, { metal: true, sv: 0.2 }),
      P(sph(0.035, 10), '#ffffff', [0, YC + 0.62, 0], null, 'lamp')]; },
  // решётчатая ферма (2 клетки): четыре лонжерона, шпангоуты, диагонали, торцевые плиты и порты
  truss: () => lattice(0.27, 0.15, true),
  // баки: тонкая решётка-хребет, два длинных бака по бортам (фольга и панели), порты на торцах
  tanks: () => { const L = 1.5, r = 0.2, out = [...lattice(0.12, 0.25, false)];
    for (const sg of [-1, 1]){ out.push(TP(tubeX(r, r, L, 24), sg > 0 ? 'panel' : 'foil', [0, YC, sg * 0.25], null, { sv: 0.9, ov: 0.05 }));
      for (const x of [-L / 2, L / 2]) out.push(TP(sph(r, 20), 'steel', [x, YC, sg * 0.25], null, { metal: true, sc: [0.45, 1, 1], sv: 0.4 }));
      for (const x of [-0.5, 0, 0.5]) out.push(TP(tubeX(r + 0.012, r + 0.012, 0.04, 24), 'steel', [x, YC, sg * 0.25], null, { metal: true, sv: 0.1 })); }
    return out; },
  // мачта: тонкая решётка, посередине короб в фольге с огоньком на штыре (по решению Андрея — огонёк вместо тарелки)
  mast: () => [...lattice(0.15, 0.25, true), TP(box(0.36, 0.26, 0.4), 'foil', [0, YC, 0], null, { su: 0.6, sv: 0.6 }),
    TP(new T.CylinderGeometry(0.018, 0.018, 0.2, 8), 'steel', [0, YC + 0.23, 0], null, { metal: true, sv: 0.2 }),
    TP(new T.CylinderGeometry(0.05, 0.05, 0.03, 12), 'steel', [0, YC + 0.335, 0], null, { metal: true, sv: 0.1 }),
    P(sph(0.04, 12), '#ffffff', [0, YC + 0.37, 0], null, 'lamp')],
  // ядро: восьмигранная платформа в панелях, стальной обод, голубое сердце (lamp), порты на четыре стороны
  core: () => [TP(new T.CylinderGeometry(0.47, 0.47, 0.36, 8, 1, false, PI / 8), 'panel', [0, YC, 0], null, { sv: 0.4 }),
    TP(new T.CylinderGeometry(0.4, 0.47, 0.06, 8, 1, false, PI / 8), 'panel', [0, YC + 0.21, 0], null, { su: 0.7, sv: 0.7, ou: 0.15 }),
    TP(new T.CylinderGeometry(0.33, 0.33, 0.02, 8, 1, false, PI / 8), 'greeble', [0, YC + 0.245, 0], null, { metal: true, su: 0.35, sv: 0.35, ou: 0.3, ov: 0.3 }),
    TP(new T.TorusGeometry(0.25, 0.04, 10, 32), 'steel', [0, YC + 0.24, 0], [PI / 2, 0, 0], { metal: true, sv: 0.15 }),
    P(new T.CylinderGeometry(0.21, 0.21, 0.04, 32), '#ffffff', [0, YC + 0.23, 0], null, 'lamp'),
    P(new T.CylinderGeometry(0.12, 0.12, 0.05, 24), '#ffffff', [0, YC + 0.245, 0], null, 'energy'),
    ...[0, 1, 2, 3].map(k => { const a = k * PI / 2 + PI / 4; return P(rbox(0.1, 0.03, 0.04, 0.01), '#ffffff', [Math.cos(a) * 0.36, YC + 0.2, Math.sin(a) * 0.36], [0, -a, 0], 'energy'); }),
    ...port(1, 0.3, 0.43), ...port(-1, 0.3, 0.43), ...portZ(1, 0.3, 0.43), ...portZ(-1, 0.3, 0.43)],
  // обломок: каменная глыба, грани плоские
  debris: () => { const g = new T.IcosahedronGeometry(0.34, 1), a = g.attributes.position;
    for (let k = 0; k < a.count; k++){ const x = a.getX(k), y = a.getY(k), z = a.getZ(k), n = 1 + 0.16 * Math.sin(x * 11 + y * 7) * Math.cos(z * 9 - x * 5); a.setXYZ(k, x * n * 1.1, y * n * 0.8, z * n); }
    g.computeVertexNormals(); return [P(g, '#8a8580', [0, 0.34, 0], null, 'rock')]; },
};
// Решётка фермы длиной 2 клетки: полуширина hw, шаг шпангоутов; ends — торцевые плиты с портами
function lattice(hw, step, ends){
  const L = 1.78, out = [], r = 0.022, rod = (len) => tubeX(r, r, len, 6);
  for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) out.push(TP(rod(L), 'steel', [0, YC + y * hw, z * hw], null, { metal: true, sv: 0.9 }));
  const n = Math.round(L / step);
  for (let k = 0; k <= n; k++){ const x = -L / 2 + k * L / n;
    out.push(TP(box(0.03, 0.03, 2 * hw), 'steel', [x, YC + hw, 0], null, { metal: true, sv: 0.1 }), TP(box(0.03, 2 * hw, 0.03), 'steel', [x, YC, hw], null, { metal: true, sv: 0.1 }),
      TP(box(0.03, 2 * hw, 0.03), 'steel', [x, YC, -hw], null, { metal: true, sv: 0.1 }));
    if (k < n){ const dx = L / n, dl = Math.hypot(dx, 2 * hw), a = Math.atan2(2 * hw, dx) * (k % 2 ? 1 : -1);
      out.push(TP(box(dl, 0.02, 0.02), 'steel', [x + dx / 2, YC + hw, 0], [0, a, 0], { metal: true, sv: 0.1, col: '#e9c9a0' })); } }
  if (ends) for (const sg of [-1, 1]){ out.push(TP(box(0.06, 2 * hw + 0.08, 2 * hw + 0.08), 'panel', [sg * (L / 2 + 0.02), YC, 0], null, { su: 0.3, sv: 0.3 })); }
  out.push(...port(1, 0.16, 0.9, 1), ...port(-1, 0.16, 0.9, 1));
  out.push(P(rbox(0.05, 0.02, 0.05, 0.01), '#ffffff', [0.0, YC + hw + 0.02, 0], null, 'lamp'));
  return out;
}

// ---------- материалы: краска и металл по атласу; тёмные кромки, стекло, окна и ток — общие группы ----------
const MATS = {};
let ATLAS = null;
function mats(MAT){
  ATLAS = new T.Texture(); ATLAS.colorSpace = T.SRGBColorSpace; ATLAS.anisotropy = 4;
  MATS.skin = new T.MeshStandardMaterial({ map: ATLAS, vertexColors: true, roughness: 0.5, metalness: 0.08, envMapIntensity: 0.8 });
  MATS.metal = new T.MeshStandardMaterial({ map: ATLAS, vertexColors: true, roughness: 0.32, metalness: 0.72, envMapIntensity: 1.1 });
  MAT.glass = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.7, emissive: '#0a2850', emissiveIntensity: 0.35 });   // стекло купола и кабины — блик, а не свечение
  MAT.hull = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6, envMapIntensity: 0.9 });                                         // тёмные кромки портов
  MAT.rock = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true, envMapIntensity: 0.4 });
}
async function load(){
  const t0 = performance.now();
  const get = () => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('нет атласа')); im.src = 'assets/hw/atlas.jpg?v=' + V; });
  let im; try { im = await get(); } catch (e){ await new Promise(r => setTimeout(r, 600)); im = await get(); }   // сеть моргнула — одна повторная попытка
  ATLAS.image = im; ATLAS.needsUpdate = true;
  R3.hw.loaded = true; R3.hw.ms = Math.round(performance.now() - t0);
}
function arts(){
  for (const [name, fn] of Object.entries(MODELS)){ const key = name === 'core' ? 'core' : name === 'debris' ? 'rock' : 'hw_' + name; ART[key] = () => build(fn()); }
  ART.coreRing = () => [];
  // связь соседей (на месте шва v2.0, по оси соседства +X): трубка-переход, стальная муфта, огонёк тока (conduit — по дереву от ядра)
  const link = (lit) => () => build([TP(tubeX(0.12, 0.12, 0.34, 16), 'steel', [0, YC, 0], null, { metal: true, sv: 0.3 }),
    TP(tubeX(RP + 0.035, RP + 0.035, 0.05, 24), 'steel', [0, YC, 0], null, { metal: true, sv: 0.1 }),
    P(tubeX(RP + 0.045, RP + 0.045, 0.012, 24), RIM, [0, YC, 0], null, 'hull'),
    ...(lit ? [P(rbox(0.12, 0.02, 0.035, 0.008), '#ffffff', [0, YC + RP + 0.045, 0], null, 'energy')] : [])]);
  ART.seam = link(false); ART.conduit = link(true);
  // отражатель и излучатели поля — в палитре железа: светло-серая площадка, оранжевый обод, стальные шары, белая призма
  const { cyl } = R3.lib;
  ART.mirror = () => { const sh = new T.Shape(); sh.moveTo(-0.13, 0); sh.lineTo(0.13, 0); sh.lineTo(0, 0.4); sh.lineTo(-0.13, 0);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: false }); g.translate(0, 0, -0.4); g.rotateY(PI / 2);
    return [P(cyl(0.44, 0.08, 6), '#8d96a3', [0, 0.04, 0], [0, PI / 6, 0], 'hull'), P(new T.TorusGeometry(0.42, 0.035, 6, 6), '#ff8a2a', [0, 0.085, 0], [PI / 2, 0, PI / 6], 'body'),
      P(g, '#e9edf2', [0, 0.08, 0], null, 'body'), P(rbox(0.8, 0.035, 0.05, 0.015), '#ffffff', [0, 0.485, 0], null, 'lamp'),
      ...[-0.42, 0.42].map(x => P(sph(0.1, 16), '#b9c1cc', [x, 0.2, 0], null, 'metal'))]; };
  ART.emitter = () => [P(rbox(0.14, 0.56, 0.14, 0.05), '#d9dee6', [0, 0.28, 0], null, 'body'), P(rbox(0.16, 0.06, 0.16, 0.02), '#ff8a2a', [0, 0.5, 0], null, 'body'),
    P(sph(0.085, 12), '#ffffff', [0, 0.6, 0], null, 'lamp'), P(cyl(0.11, 0.06, 14), '#5a626e', [0, 0.03, 0], null, 'hull')];
}
// Окружение для бликов: светлая «студия» с мягкими панелями — белые панели читаются чистыми, металл колец бликует
function env(){
  const s = new T.Scene(), bx = new T.BoxGeometry(1, 1, 1);
  s.add(new T.Mesh(new T.BoxGeometry(20, 12, 20), new T.MeshBasicMaterial({ color: '#1b2233', side: T.BackSide })));
  const light = (col, int, pos, sc) => { const m = new T.Mesh(bx, new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(int) })); m.position.set(...pos); m.scale.set(...sc); s.add(m); };
  light('#ffffff', 4.5, [-2, 5.8, 1], [9, 0.2, 3]);
  light('#dfe8ff', 2.2, [3, 5.8, -3], [6, 0.2, 2]);
  light('#7fd6ff', 2.0, [0, 2, -9.6], [12, 3, 0.2]);
  light('#ffd2a0', 0.9, [0, 1.5, 9.6], [10, 2, 0.2]);
  return s;
}
// Свет: небо-полушарие, ключ тёплый белый сверху-слева, голубой контровой «сверху экрана» (кромки колец), слабая заливка справа
function lights(scene){
  scene.add(new T.HemisphereLight('#dfe8ff', '#1a2238', 1.0));
  const key = new T.DirectionalLight('#fff6ea', 2.4); key.position.set(-5, 9, 5); scene.add(key);
  const rim = new T.DirectionalLight('#7fd2ff', 1.4); rim.position.set(1, 3, -8); scene.add(rim);
  const fill = new T.DirectionalLight('#b8c8ff', 0.5); fill.position.set(7, 4, 2); scene.add(fill);
}
const ghosts = Object.keys(MODELS).filter(n => n !== 'core' && n !== 'debris').map(n => 'hw_' + n);
R3.hw = { V, HW, load, arts, mats, env, lights, exposure: 1.0, ghosts, loaded: false };
})();
