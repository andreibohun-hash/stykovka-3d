/* «Стыковка 3D» — 3D-сцена (three.js 0.185.1, vendor/three.js). Игра (index.html) держит всю логику и анимацию в мировых
   координатах: клетка = 1 единица, поле в плоскости XZ, Y — вверх, ось +X модели — её нос. Каждый кадр игра вызывает
   R3.begin(), расставляет модели R3.put(тип, матрица, цвет…) и R3.end(); модели рисуются InstancedMesh по типу и материалу,
   поэтому число draw calls не растёт с числом модулей. Статика уровня (v1.2: без доски — силуэт вещи и узлы сетки одной прозрачной
   плоскостью) собирается в R3.setLevel().
   Модели — данными из примитивов (таблица ART: деталь = геометрия, цвет, позиция, поворот, группа материала).
   Группы материалов: body (глянцевый пластик), metal (хром), lamp (окна и огни — без освещения, цвет задаёт игра),
   glass (стекло ячеек панелей). Призраки и голограммы — та же геометрия одним мешем с прозрачным материалом. */
(function(){
'use strict';
const T = window.THREE;
// Палитра сцены — v2.0 стиль A «Тёмный металл и свет» (art-src/ships/A-*.jpg): графитовый металл с фасками, белые бронеплиты,
// золотые панели, оранжевые фермы, энергия — бирюзовые линии. Арт-библия — DESIGN.md «v2.0».
const PAL = {
  graph: '#3a4357', graphDeep: '#1e2331', graphLite: '#4a5468', armor: '#dfe5f0', armorSh: '#aeb8cb', steel: '#69728a', steelDark: '#2a2f3d',
  gold: '#ffb72e', goldDeep: '#d07c10', orange: '#ff7a1a', orangeDeep: '#c4510c', glass: '#2a63d8',
  white: '#f4f1fb', chrome: '#dfe6f5', teal: '#1fd1bd', tealDeep: '#0e7f8f', rock: '#8f7ac8', rockDeep: '#4d4378', navy: '#202a66', violet: '#8a4dff', dark: '#14183a',
  hemiSky: '#c9d3ff', hemiGround: '#1a1730', key: '#f3f5ff', rim: '#7fb8ff', rim2: '#b48cff',
  bpHull: '#46e6ff', bpSolar: '#ffd23d', bpTruss: '#ff9a3d', holo: '#5fe8ff',
};
const SH = {                    // числа вида (в клетках)
  Y: 0.32,                       // центр модуля над доской
  FOV: 26,                       // поле зрения камеры (небольшая перспектива: объём у краёв, сетка почти ровная)
  PITCH: 80,                     // наклон камеры от горизонта, градусы: 90 — строго сверху. v1.0 было 56 — «смущает наклон» (отзыв Андрея)
  CAP: 112,                      // ёмкость пула инстансов на тип
};
// Для сравнения кадров вид можно переопределить в адресе: ?pitch=90&fov=20 (в игре не используется)
try { const q = new URLSearchParams(location.search); if (+q.get('pitch')) SH.PITCH = +q.get('pitch'); if (+q.get('fov')) SH.FOV = +q.get('fov'); } catch (e) {}
const R3 = window.R3 = { ready: false, PAL, SH, EN: null, BOARD_PAD: 0.08, stats: { calls: 0, tris: 0 } };   // BOARD_PAD — поле вокруг клеток в рамке камеры (v1.2: доски нет, запас только под узлы сетки)
let renderer = null, scene, cam, cw = 0, chh = 0, dpr = 1, envTex = null;
const tmpM = new T.Matrix4(), tmpQ = new T.Quaternion(), tmpE = new T.Euler(), tmpV = new T.Vector3(), tmpS = new T.Vector3(), tmpC = new T.Color();
const WHITE = new T.Color(1, 1, 1);

// ---------- геометрия ----------
// Скруглённый брусок w×h×d (h — по Y), радиус фаски r.
function rbox(w, h, d, r, seg){
  r = Math.min(r, w / 2 - 1e-3, d / 2 - 1e-3, h / 2 - 1e-3);
  const iw = w - 2 * r, id = d - 2 * r, rr = Math.min(iw, id) * 0.25, s = new T.Shape();
  s.moveTo(-iw / 2 + rr, -id / 2); s.lineTo(iw / 2 - rr, -id / 2); s.quadraticCurveTo(iw / 2, -id / 2, iw / 2, -id / 2 + rr);
  s.lineTo(iw / 2, id / 2 - rr); s.quadraticCurveTo(iw / 2, id / 2, iw / 2 - rr, id / 2); s.lineTo(-iw / 2 + rr, id / 2);
  s.quadraticCurveTo(-iw / 2, id / 2, -iw / 2, id / 2 - rr); s.lineTo(-iw / 2, -id / 2 + rr); s.quadraticCurveTo(-iw / 2, -id / 2, -iw / 2 + rr, -id / 2);
  const g = new T.ExtrudeGeometry(s, { depth: Math.max(1e-3, h - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg || 3, curveSegments: 5 });
  g.translate(0, 0, -(h - 2 * r) / 2); g.rotateX(-Math.PI / 2);
  return g;
}
const cyl = (r, h, n) => new T.CylinderGeometry(r, r, h, n || 20);
const cylX = (r0, r1, h, n) => { const g = new T.CylinderGeometry(r1, r0, h, n || 20); g.rotateZ(-Math.PI / 2); return g; };   // вдоль +X: r0 у −X, r1 у +X
const torusX = (R, r, n, arc) => { const g = new T.TorusGeometry(R, r, 8, n || 24, arc); g.rotateY(Math.PI / 2); return g; };     // кольцо вокруг оси X
const torusY = (R, r, n, arc) => { const g = new T.TorusGeometry(R, r, 8, n || 28, arc); g.rotateX(Math.PI / 2); return g; };     // кольцо вокруг оси Y (лежит)
const sph = (r, n) => new T.SphereGeometry(r, n || 14, Math.max(6, (n || 14) >> 1));
// Призма: многоугольник pts [[x, z]…] в плоскости XZ, высота h по Y (центр по высоте в нуле), фаска bev (одна грань — «машинная»)
function prism(pts, h, bev){
  bev = bev || 0; const s = new T.Shape();
  pts.forEach(([x, z], k) => k ? s.lineTo(x, -z) : s.moveTo(x, -z));
  const g = new T.ExtrudeGeometry(s, { depth: Math.max(1e-3, h - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(h - 2 * bev) / 2); g.rotateX(-Math.PI / 2); return g;
}
// Плита с прямыми фасками углов (восьмиугольник) w×d, высота h, срез угла c, кромка bev — основа всех модулей стиля A
function chamf(w, d, h, c, bev){
  bev = bev === undefined ? 0.02 : bev; const x = w / 2 - bev, z = d / 2 - bev; c = Math.min(c, x * 0.9, z * 0.9);
  return prism([[-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c], [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c]], h, bev);
}
// Зеркальная копия деталей по Z (левое крыло из правого): матрица детали применяется к геометрии, Z отражается, обход треугольников разворачивается
function mirZ(parts){
  const m = new T.Matrix4(), e = new T.Euler(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1), v = new T.Vector3();
  return parts.map(p => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    m.compose(v.set(...p.pos), q.setFromEuler(e.set(...p.rot)), one); g.applyMatrix4(m);
    const a = g.attributes.position, n = g.attributes.normal;
    for (let k = 0; k < a.count; k++){ a.setZ(k, -a.getZ(k)); n.setZ(k, -n.getZ(k)); }
    for (let k = 0; k + 2 < a.count; k += 3) for (const at of [a, n]){ const t = [at.getX(k + 1), at.getY(k + 1), at.getZ(k + 1)]; at.setXYZ(k + 1, at.getX(k + 2), at.getY(k + 2), at.getZ(k + 2)); at.setXYZ(k + 2, ...t); }
    return { geo: g, col: p.col, pos: [0, 0, 0], rot: [0, 0, 0], grp: p.grp }; });
}
// Деталь: геометрия, цвет, позиция, поворот (эйлер XYZ), группа материала
function P(geo, col, pos, rot, grp){ return { geo, col, pos: pos || [0, 0, 0], rot: rot || [0, 0, 0], grp: grp || 'body' }; }
// Слить детали в одну геометрию с цветом вершин (Color.set переводит sRGB → linear один раз)
function merge(parts){
  const pos = [], nor = [], col = [], c = new T.Color(), m = new T.Matrix4(), e = new T.Euler(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1), v = new T.Vector3();
  for (const p of parts){
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    m.compose(v.set(...p.pos), q.setFromEuler(e.set(...p.rot)), one); g.applyMatrix4(m);
    const a = g.attributes.position.array, n = g.attributes.normal.array; c.set(p.col);
    for (let k = 0; k < a.length; k++){ pos.push(a[k]); nor.push(n[k]); }
    for (let k = 0; k < a.length / 3; k++) col.push(c.r, c.g, c.b);
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new T.Float32BufferAttribute(col, 3)); out.computeBoundingSphere();
  return out;
}

// ---------- модели (1 = клетка; +X — нос/ось стыковки; +Z — правый борт; Y — вверх, низ модуля у y ≈ 0.14) ----------
// v2.0 стиль A: графитовая плита с фасками (hull), белые бронеплиты (body), золотые панели и оранжевые фермы (panel — с тёплым
// самосвечением), стекло кабины и купола (glass), окна-статус (lamp: холодные в очереди, зелёные на питании — цвет задаёт игра),
// энергия (energy: бирюзовые линии и порты — яркость задаёт игра, бежит от ядра). Модуль в очереди и в полёте — «общий» по типу
// (*Q); пристыкованный раскрывается в роль: основа роли (r*) на клетке + выдвижная часть (r*-ext), которую игра анимирует (u 0..1).
// Роль выходит за клетку (нос, сопло, крыло, ствол — до +0,45 клетки) только в пустую сторону — так корабль не читается плиткой.
const Y = SH.Y, TOP = Y + 0.18;
const nubs = (r, sz) => [[r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r]].map(([x, , z]) => P(rbox(x ? 0.06 : sz || 0.16, 0.08, x ? sz || 0.16 : 0.06, 0.02), '#ffffff', [x, Y, z], null, 'energy'));
const plates = (x0, len, z, w, y) => [-1, 1].map(sg => P(chamf(len, w, 0.08, 0.1, 0.015), PAL.armor, [x0, y || TOP + 0.02, sg * z], null, 'body'));
const wingShape = (S, tip) => tip ? [[0.44, 0], [0.02, S], [-0.36, S], [-0.46, 0]] : [[0.44, 0], [0.42, S], [-0.44, S], [-0.46, 0]];
function wingParts(S, tip){
  const k = 0.08, inner = wingShape(S, tip).map(([x, z], i) => [x + (i === 0 || i === 3 ? (x > 0 ? -k : k) : (x > 0 ? -k * 0.7 : k)), z + (i < 1 || i > 2 ? k : -k)]);
  return [P(prism(wingShape(S, tip), 0.09, 0.015), PAL.graph, [0, Y - 0.02, 0], null, 'hull'),
    P(prism(inner, 0.05), PAL.gold, [0, Y + 0.035, 0], null, 'panel'),
    P(rbox(0.86, 0.02, 0.035, 0.01), PAL.graphDeep, [tip ? -0.13 : -0.01, Y + 0.065, S * 0.5], [0, tip ? 0.27 : 0, 0], 'hull'),
    P(rbox(0.05, 0.03, 0.28, 0.012), '#ffffff', [tip ? -0.3 : -0.42, Y + 0.05, S * 0.62], null, 'energy')];
}
const ART = {
  // ---- общие модули (очередь, полёт, до раскрытия) ----
  // Жилой: восьмигранная графитовая плита, белые плиты спереди и сзади, два окна посередине, бирюзовые порты на 4 стороны
  habQ: () => [P(chamf(0.86, 0.86, 0.36, 0.22, 0.03), PAL.graph, [0, Y, 0], null, 'hull'),
    ...[-1, 1].map(sg => P(chamf(0.22, 0.64, 0.08, 0.08, 0.015), PAL.armor, [sg * 0.25, TOP + 0.02, 0], null, 'body')),
    ...[-1, 1].map(sg => P(rbox(0.13, 0.04, 0.16, 0.02), '#ffffff', [0, TOP + 0.01, sg * 0.1], null, 'lamp')), ...nubs(0.45)],
  // Панель (сложена): графитовая рама, две золотые панели вдоль курса
  panQ: () => [P(chamf(0.84, 0.84, 0.28, 0.2, 0.03), PAL.graph, [0, Y - 0.03, 0], null, 'hull'),
    ...[-1, 1].map(sg => P(chamf(0.62, 0.25, 0.06, 0.08, 0.012), PAL.gold, [0, Y + 0.12, sg * 0.15], null, 'panel')),
    P(rbox(0.1, 0.04, 0.1, 0.02), '#ffffff', [0, Y + 0.12, 0], null, 'lamp'), ...nubs(0.44)],
  // Ферма (2 клетки, складывается): торцы-узлы, две оранжевые балки, кресты
  trussQ: () => { const L = 1.86, h = L / 2, parts = [];
    for (const sg of [-1, 1]){ parts.push(P(chamf(0.3, 0.62, 0.42, 0.1, 0.025), PAL.graph, [sg * (h - 0.16), Y, 0], null, 'hull'), P(chamf(0.18, 0.4, 0.06, 0.05, 0.012), PAL.armor, [sg * (h - 0.16), Y + 0.23, 0], null, 'body'),
      P(rbox(0.06, 0.08, 0.16, 0.02), '#ffffff', [sg * h, Y, 0], null, 'energy')); }
    for (const z of [-0.22, 0.22]) parts.push(P(rbox(L - 0.5, 0.09, 0.09, 0.03), PAL.orange, [0, Y + 0.13, z], null, 'panel'), P(rbox(L - 0.5, 0.07, 0.07, 0.025), PAL.orangeDeep, [0, Y - 0.12, z], null, 'panel'));
    const n = 2, inner = h - 0.32, dx = 2 * inner / n, len = Math.hypot(dx, 0.44), a = Math.atan2(0.44, dx);
    for (let k = 0; k < n; k++) for (const sg of [-1, 1]) parts.push(P(rbox(len, 0.07, 0.07, 0.025), PAL.orange, [-inner + dx * (k + 0.5), Y + 0.13, 0], [0, sg * a, 0], 'panel'));
    return parts; },
  // ---- ядро: реактор/мостик — графитовый шестигранник, белое кольцо плит, бирюзовое сердце, энергия по ободу ----
  core: () => [P(cyl(0.5, 0.4, 6), PAL.graph, [0, Y, 0], [0, Math.PI / 6, 0], 'hull'),
    P(cyl(0.47, 0.08, 6), PAL.armor, [0, Y + 0.2, 0], [0, Math.PI / 6, 0], 'body'),
    P(cyl(0.34, 0.1, 6), PAL.graphDeep, [0, Y + 0.23, 0], [0, Math.PI / 6, 0], 'hull'),
    P(cyl(0.22, 0.05, 24), '#ffffff', [0, Y + 0.28, 0], null, 'lamp'),
    P(torusY(0.285, 0.022, 30), '#ffffff', [0, Y + 0.27, 0], null, 'energy'),
    ...[0, 1, 2, 3].map(k => P(rbox(k % 2 ? 0.08 : 0.2, 0.1, k % 2 ? 0.2 : 0.08, 0.025), '#ffffff', [Math.cos(k * Math.PI / 2) * 0.47, Y, Math.sin(k * Math.PI / 2) * 0.47], null, 'energy'))],
  coreRing: () => [0, 1, 2].map(k => P(new T.TorusGeometry(0.16, 0.025, 6, 14, 1.5), '#ffffff', [0, Y + 0.34, 0], [Math.PI / 2, 0, k * 2.094], 'lamp')),
  // ---- роли жилого ----
  // Кабина: основа (плита, бортовые плиты, окно-статус сзади) + нос (rKnose): белый клин и стекло, выдвигается вперёд
  rK: () => [P(chamf(0.92, 0.92, 0.36, 0.26, 0.03), PAL.graph, [-0.03, Y, 0], null, 'hull'), ...plates(-0.1, 0.6, 0.31, 0.24),
    P(rbox(0.09, 0.04, 0.3, 0.02), '#ffffff', [-0.33, TOP + 0.01, 0], null, 'lamp'), P(rbox(0.12, 0.08, 0.06, 0.02), '#ffffff', [-0.46, Y, 0], null, 'energy')],
  rKnose: () => [P(prism([[0.0, -0.37], [0.44, -0.3], [0.9, -0.02], [0.9, 0.02], [0.44, 0.3], [0.0, 0.37]], 0.3, 0.02), PAL.armor, [0, Y - 0.02, 0], null, 'body'),
    P(prism([[0.1, -0.2], [0.5, -0.15], [0.74, 0], [0.5, 0.15], [0.1, 0.2]], 0.08, 0.01), PAL.graphDeep, [0, Y + 0.15, 0], null, 'hull'),
    P((() => { const g = sph(0.5, 18); g.scale(0.62, 0.3, 0.3); return g; })(), PAL.glass, [0.34, Y + 0.16, 0], null, 'glass'),
    P(rbox(0.07, 0.05, 0.05, 0.02), '#ffffff', [0.86, Y + 0.02, 0], null, 'energy')],
  // Отсек корпуса: широкая плита (закрывает швы), бортовые плиты, два окна вдоль оси
  rH: () => [P(chamf(0.98, 0.98, 0.36, 0.16, 0.03), PAL.graph, [0, Y, 0], null, 'hull'), ...plates(0, 0.94, 0.31, 0.26),
    ...[-1, 1].map(sg => P(rbox(0.3, 0.04, 0.07, 0.02), '#ffffff', [0, TOP + 0.01, sg * 0.12], null, 'lamp')), ...nubs(0.48, 0.12)],
  // Купол-сенсор: плита с белым восьмигранником + купол (rDdome): стекло, зелёное кольцо, мачта с огнём — вращается
  rD: () => [P(chamf(0.86, 0.86, 0.32, 0.28, 0.03), PAL.graph, [0, Y - 0.02, 0], null, 'hull'), P(cyl(0.4, 0.06, 8), PAL.armor, [0, TOP, 0], [0, Math.PI / 8, 0], 'body'), ...nubs(0.44, 0.12)],
  rDdome: () => [P((() => { const g = new T.SphereGeometry(0.27, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.8, 1); return g; })(), PAL.glass, [0, TOP + 0.02, 0], null, 'glass'),
    P(torusY(0.29, 0.03, 26), '#ffffff', [0, TOP + 0.04, 0], null, 'lamp'),
    P(cyl(0.025, 0.2, 6), PAL.steel, [0.17, TOP + 0.22, 0], [0, 0, 0.5], 'metal'), P(sph(0.045, 8), '#ffffff', [0.22, TOP + 0.31, 0], null, 'energy')],
  // Двигатель: корпус (плиты по бортам, огонь-статус спереди) + сопло (rEnoz): кожух, колокол за клетку, бирюзовое свечение
  rE: () => [P(chamf(0.9, 0.9, 0.36, 0.24, 0.03), PAL.graph, [0.02, Y, 0], null, 'hull'), ...plates(0.06, 0.62, 0.31, 0.24),
    P(rbox(0.08, 0.04, 0.26, 0.02), '#ffffff', [0.3, TOP + 0.01, 0], null, 'lamp'), P(rbox(0.12, 0.08, 0.06, 0.02), '#ffffff', [0.46, Y, 0], null, 'energy')],
  rEnoz: () => [P(cylX(0.27, 0.27, 0.16, 16), PAL.graphLite, [-0.38, Y, 0], null, 'hull'),
    P(cylX(0.31, 0.22, 0.3, 18), PAL.steel, [-0.6, Y, 0], null, 'metal'), P(torusX(0.27, 0.025, 18), PAL.armor, [-0.47, Y, 0], null, 'body'),
    P(cylX(0.24, 0.24, 0.02, 18), '#ffffff', [-0.755, Y, 0], null, 'energy')],
  // ---- роли панели ----
  rWroot: () => [P(chamf(0.6, 0.3, 0.3, 0.1, 0.02), PAL.graph, [0, Y, 0], null, 'hull'), P(rbox(0.36, 0.04, 0.08, 0.02), '#ffffff', [0, Y + 0.16, 0], null, 'lamp')],
  rWR: () => wingParts(1.34, true), rWRi: () => wingParts(0.92, false),
  rWL: () => mirZ(wingParts(1.34, true)), rWLi: () => mirZ(wingParts(0.92, false)),
  // Радиатор: плита + три светящихся ребра (rRfins), раздвигаются
  rR: () => [P(chamf(0.86, 0.86, 0.26, 0.2, 0.03), PAL.graph, [0, Y - 0.04, 0], null, 'hull'), P(rbox(0.1, 0.04, 0.1, 0.02), '#ffffff', [0.32, Y + 0.11, 0], null, 'lamp'), ...nubs(0.44, 0.12)],
  rRfins: () => [-0.24, 0, 0.24].map(z => P(prism([[-0.34, -0.035], [0.3, -0.035], [0.38, 0.035], [-0.34, 0.035]], 0.2, 0.012), PAL.gold, [0, Y + 0.1, z], null, 'panel')),
  // Антенна / щит: плита + золотая тарелка на мачте (rAdish), поднимается
  rA: () => [P(chamf(0.86, 0.86, 0.26, 0.24, 0.03), PAL.graph, [0, Y - 0.04, 0], null, 'hull'), P(cyl(0.34, 0.05, 8), PAL.armor, [0, Y + 0.1, 0], [0, Math.PI / 8, 0], 'body'), ...nubs(0.44, 0.12)],
  rAdish: () => [P(cyl(0.035, 0.22, 6), PAL.steel, [0, Y + 0.22, 0], null, 'metal'),
    P((() => { const g = new T.SphereGeometry(0.34, 20, 6, 0, Math.PI * 2, 0, 0.9); g.scale(1, 0.42, 1); g.rotateX(Math.PI); return g; })(), PAL.gold, [0, Y + 0.44, 0], null, 'panel'),
    P(sph(0.05, 8), '#ffffff', [0, Y + 0.42, 0], null, 'energy')],
  // Энергоплита: плита, золотая панель, энергия по кромке
  rP: () => [P(chamf(0.96, 0.96, 0.26, 0.2, 0.03), PAL.graph, [0, Y - 0.04, 0], null, 'hull'), P(chamf(0.68, 0.68, 0.06, 0.16, 0.012), PAL.gold, [0, Y + 0.11, 0], null, 'panel'),
    ...[[0, -0.39, 0.6, 0.03], [0, 0.39, 0.6, 0.03], [-0.39, 0, 0.03, 0.6], [0.39, 0, 0.03, 0.6]].map(([x, z, w, d]) => P(rbox(w, 0.03, d, 0.01), '#ffffff', [x, Y + 0.1, z], null, 'energy'))],
  // ---- роли фермы (2 клетки, +X — к носу для продольных, наружу для поперечных) ----
  rT: () => { const L = 1.86, h = L / 2, parts = [];
    for (const sg of [-1, 1]) parts.push(P(chamf(0.32, 0.68, 0.4, 0.12, 0.025), PAL.graph, [sg * (h - 0.16), Y, 0], null, 'hull'), ...[-1, 1].map(z => P(chamf(0.22, 0.16, 0.06, 0.05, 0.012), PAL.armor, [sg * (h - 0.16), TOP + 0.04, z * 0.2], null, 'body')));
    for (const z of [-0.25, 0.25]) parts.push(P(rbox(L - 0.5, 0.09, 0.09, 0.03), PAL.orange, [0, Y + 0.13, z], null, 'panel'), P(rbox(L - 0.5, 0.07, 0.07, 0.025), PAL.orangeDeep, [0, Y - 0.12, z], null, 'panel'));
    const n = 2, inner = h - 0.32, dx = 2 * inner / n, len = Math.hypot(dx, 0.5), a = Math.atan2(0.5, dx);
    for (let k = 0; k < n; k++) for (const sg of [-1, 1]) parts.push(P(rbox(len, 0.07, 0.07, 0.025), PAL.orange, [-inner + dx * (k + 0.5), Y + 0.13, 0], [0, sg * a, 0], 'panel'));
    parts.push(P(rbox(L - 0.1, 0.03, 0.05, 0.012), '#ffffff', [0, Y + 0.2, 0], null, 'energy'));
    return parts; },
  // Ускоритель: сердечник въезжает внутрь фермы, сопло сзади за клетку
  rTB: () => [P(cylX(0.22, 0.22, 1.0, 14), PAL.steel, [-0.05, Y, 0], null, 'metal'), ...[-0.3, 0.2].map(x => P(cylX(0.24, 0.24, 0.08, 14), PAL.armor, [x, Y, 0], null, 'body')),
    P(chamf(0.24, 0.74, 0.42, 0.14, 0.025), PAL.graphLite, [-0.86, Y, 0], null, 'hull'),
    P(cylX(0.36, 0.24, 0.32, 16), PAL.steel, [-1.05, Y, 0], null, 'metal'), P(cylX(0.29, 0.29, 0.02, 16), '#ffffff', [-1.21, Y, 0], null, 'energy')],
  // Таран: белый наконечник с прожектором на переднем конце
  rTL: () => [P(prism([[0.8, -0.3], [1.1, -0.12], [1.22, 0], [1.1, 0.12], [0.8, 0.3]], 0.26, 0.02), PAL.armor, [0, Y, 0], null, 'body'), P(sph(0.07, 10), '#ffffff', [1.18, Y + 0.08, 0], null, 'energy')],
  // Пилон с орудием: ствол на внешнем конце, выезжает
  rTX: () => [P(chamf(0.44, 0.56, 0.36, 0.14, 0.025), PAL.graphLite, [0.84, Y + 0.03, 0], null, 'hull'), P(chamf(0.3, 0.36, 0.06, 0.1, 0.012), PAL.armor, [0.84, Y + 0.22, 0], null, 'body'),
    P(cylX(0.1, 0.1, 0.5, 12), PAL.steel, [1.12, Y + 0.05, 0], null, 'metal'), P(cylX(0.12, 0.12, 0.06, 12), PAL.armor, [1.36, Y + 0.05, 0], null, 'body'),
    P(rbox(0.05, 0.05, 0.05, 0.02), '#ffffff', [1.39, Y + 0.05, 0], null, 'energy')],
  // Связь между соседями станции: тёмная перемычка на шве + энергия от центра клетки к центру соседа (яркость бежит от ядра)
  conduit: () => [P(chamf(0.3, 0.6, 0.28, 0.1, 0.02), PAL.graphDeep, [0, Y, 0], null, 'hull'), P(rbox(1.0, 0.025, 0.05, 0.012), '#ffffff', [0, TOP + 0.025, 0], null, 'energy')],
  seam: () => [P(chamf(0.3, 0.6, 0.28, 0.1, 0.02), PAL.graphDeep, [0, Y, 0], null, 'hull')],                                   // перемычка без энергии (шов вне дерева энергии)
  // ---- препятствия, полёт, служебное ----
  rock: () => { const g = new T.IcosahedronGeometry(0.38, 1), a = g.attributes.position, v = new T.Vector3();
    for (let k = 0; k < a.count; k++){ v.fromBufferAttribute(a, k); const n = 0.8 + 0.2 * Math.abs(Math.sin(v.x * 9.1 + v.y * 7.3 + v.z * 5.7)); a.setXYZ(k, v.x * n, v.y * n * 0.85, v.z * n); }
    g.computeVertexNormals(); return [P(g, PAL.rock, [0, 0.31, 0], null, 'rock')]; },
  // Отражатель: графитовая шестигранная площадка с золотым ободом, светлая призма по диагонали со светящимся гребнем
  mirror: () => { const s = new T.Shape(); s.moveTo(-0.13, 0); s.lineTo(0.13, 0); s.lineTo(0, 0.4); s.lineTo(-0.13, 0);
    const g = new T.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false }); g.translate(0, 0, -0.4); g.rotateY(Math.PI / 2);
    return [P(cyl(0.44, 0.08, 6), PAL.graph, [0, 0.04, 0], [0, Math.PI / 6, 0], 'hull'),
      P(new T.TorusGeometry(0.42, 0.035, 6, 6), PAL.gold, [0, 0.085, 0], [Math.PI / 2, 0, Math.PI / 6], 'metal'),
      P(g, PAL.armor, [0, 0.08, 0], null, 'body'), P(rbox(0.8, 0.035, 0.05, 0.015), '#ffffff', [0, 0.485, 0], null, 'lamp'),
      ...[-0.42, 0.42].map(x => P(sph(0.1, 16), PAL.gold, [x, 0.2, 0], null, 'metal'))]; },
  field: () => [P(rbox(0.78, 0.5, 0.78, 0.12, 2), '#ffffff', [0, 0.28, 0], null, 'add')],
  emitter: () => [P(rbox(0.14, 0.56, 0.14, 0.05), PAL.violet, [0, 0.28, 0]), P(sph(0.085, 12), '#ffffff', [0, 0.6, 0], null, 'lamp'), P(cyl(0.11, 0.06, 14), PAL.graph, [0, 0.03, 0], null, 'hull')],
  // Палец защёлки: шарнир в нуле, палец вдоль +X, на конце — огонь энергии
  claw: () => [P(rbox(0.24, 0.06, 0.08, 0.02), PAL.steel, [0.1, 0, 0], null, 'metal'), P(rbox(0.06, 0.09, 0.09, 0.02), '#ffffff', [0.22, -0.03, 0], null, 'energy')],
  // Сопло общего модуля (очередь и полёт)
  nozzle: () => [P(cylX(0.17, 0.1, 0.14, 16), PAL.steel, [-0.07, 0, 0], null, 'metal'), P(cylX(0.12, 0.12, 0.02, 16), '#ffffff', [-0.145, 0, 0], null, 'energy')],
  chev: () => { const s = new T.Shape(); s.moveTo(0.07, 0); s.lineTo(-0.07, 0.13); s.lineTo(-0.07, -0.13); s.lineTo(0.07, 0);
    const g = new T.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return [P(g, '#ffffff', [0, 0.01, 0], null, 'lamp')]; },
  flame: () => [P(cylX(0.0, 0.13, 0.5, 14), '#ffffff', [-0.25, 0, 0], null, 'add')],          // широкое у сопла (x = 0), остриё назад
};

// Раскрытая роль одной моделью (основа + выдвижная часть на месте): после раскрытия игра рисует её вместо двух пулов.
// shift — детали со сдвигом (dx вперёд, dz вбок) и сжатием по X (короткий нос / сопло, если сосед мешает)
const shift = (parts, dx, dz, sx) => parts.map(p => { let g = p.geo; if (sx && sx !== 1){ g = g.clone(); g.scale(sx, 1, 1); }
  return { geo: g, col: p.col, pos: [p.pos[0] * (sx || 1) + (dx || 0), p.pos[1], p.pos[2] + (dz || 0)], rot: p.rot, grp: p.grp }; });
Object.assign(ART, {
  rKF: () => [...ART.rK(), ...ART.rKnose()], rKFs: () => [...ART.rK(), ...shift(ART.rKnose(), 0, 0, 0.62)],
  rEF: () => [...ART.rE(), ...ART.rEnoz()], rEFs: () => [...ART.rE(), ...shift(ART.rEnoz(), 0, 0, 0.7)],
  rWRF: () => [...shift(ART.rWroot(), 0, -0.3), ...shift(ART.rWR(), 0, -0.42)], rWRiF: () => [...shift(ART.rWroot(), 0, -0.3), ...shift(ART.rWRi(), 0, -0.42)],
  rWLF: () => [...shift(ART.rWroot(), 0, 0.3), ...shift(ART.rWL(), 0, 0.42)], rWLiF: () => [...shift(ART.rWroot(), 0, 0.3), ...shift(ART.rWLi(), 0, 0.42)],
  rRF: () => [...ART.rR(), ...ART.rRfins()],
  rTBF: () => [...ART.rT(), ...ART.rTB()], rTLF: () => [...ART.rT(), ...ART.rTL()], rTXF: () => [...ART.rT(), ...ART.rTX()],
});

// ---------- материалы ----------
const MAT = {};
// Проба «эпичные корабли» (?look=epic, assets/epic3d.js): свои модели, материалы и свет поверх этих. Без пробы ничего не меняется.
R3.lib = { T, P, rbox, chamf, prism, cyl, cylX, torusX, torusY, sph, mirZ, merge, shift, ART, MAT, PAL, SH, Y, TOP, loadGLB };
// Вид пробы: «эпичные корабли» (R3.epic) или «инженерное железо» (R3.hw, assets/hw3d.js) — свои материалы, свет, окружение, модели
const LOOK = () => R3.epic || R3.hw;
function makeMats(){
  MAT.hull = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.72, envMapIntensity: 1.25 });       // графитовый металл
  MAT.body = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05, envMapIntensity: 0.85 });       // белые бронеплиты
  MAT.metal = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.9, envMapIntensity: 1.3 });
  MAT.panel = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, envMapIntensity: 1.0, emissive: '#5a2c00', emissiveIntensity: 0.75 });   // золото и оранжевые фермы — чуть светятся
  MAT.glass = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.6, emissive: '#0b2a88', emissiveIntensity: 0.8 });
  MAT.rock = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, flatShading: true, envMapIntensity: 0.4 });
  MAT.lamp = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });                            // окна-статус: цвет = цвет вершин × lamp инстанса
  MAT.energy = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });                          // энергия: цвет × energy инстанса
  MAT.add = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
  MAT.ghost = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false });
  MAT.holo = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending });
  MAT.body0 = MAT.body;                                                                                     // старое имя группы (модели Tripo)
  if (LOOK()) LOOK().mats(MAT);
}

// ---------- пулы: тип модели → InstancedMesh на группу материала ----------
const MODELS = {};
class Model {
  constructor(name, parts, mode){
    this.name = name; this.n = 0; this.meshes = [];
    const byGrp = {};
    if (mode){ byGrp[mode] = parts.filter(p => p.grp !== 'lamp' || !p.mat).map(p => ({ geo: p.geo, pos: p.pos, rot: p.rot, grp: mode, col: '#ffffff', share: !!p.mat })); }   // призрак/голограмма: одна геометрия, цвет — инстанса (у GLB свой материал не берём, слой свечения окон — тоже)
    else for (const p of parts) (byGrp[p.grp] = byGrp[p.grp] || []).push(p);
    for (const [g, ps] of Object.entries(byGrp)){
      const own = ps[0].mat;                                                                     // деталь со своим материалом (GLB из Tripo): геометрия и текстура как есть
      const mesh = new T.InstancedMesh(own || (ps.length === 1 && ps[0].share) ? ps[0].geo : merge(ps), own || MAT[g], SH.CAP);   // призрак модели GLB — та же индексированная геометрия, без развёртки
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
      mesh.setColorAt(0, WHITE); mesh.instanceColor.setUsage(T.DynamicDrawUsage);
      mesh.userData.grp = g; mesh.renderOrder = g === 'holo' || g === 'ghost' || g === 'add' ? 5 : 0;
      this.meshes.push(mesh); root.add(mesh);
    }
  }
  // tint — множитель цвета корпуса (красная вспышка, затемнение); lamp — цвет окон и огней
  add(m, tint, lamp, en){
    if (this.n >= SH.CAP) return;
    for (const mesh of this.meshes){
      mesh.setMatrixAt(this.n, m);
      const g = mesh.userData.grp;
      mesh.setColorAt(this.n, g === 'lamp' ? (lamp || WHITE) : g === 'energy' ? (en || R3.EN) : (tint || WHITE));
    }
    this.n++;
  }
  // пустой пул, который и в прошлом кадре был пуст, не трогаем — буферы не перезаливаются зря; пустой пул не рисуется (v2.0: моделей ролей много)
  // В GPU уходит только занятая часть буферов (ревью GPT: needsUpdate без диапазона перезаливал все SH.CAP инстансов каждого пула)
  flush(){ if (!this.n && !this.prev) return; this.prev = this.n; for (const mesh of this.meshes){ mesh.count = this.n; mesh.visible = this.n > 0; upd(mesh.instanceMatrix, this.n * 16); if (mesh.instanceColor) upd(mesh.instanceColor, this.n * 3); } }
}
function upd(attr, len){ if (!len) return; attr.clearUpdateRanges(); attr.addUpdateRange(0, len); attr.needsUpdate = true; }
const modelOf = (name, mode) => {
  const key = mode ? name + ':' + mode : name;
  return MODELS[key] || (MODELS[key] = new Model(key, ART[name](), mode));
};
let root = null, staticGroup = null;

// ---------- модели Tripo (GLB): проба v1.1 — сравнение с примитивами на реальном размере клетки (?tripo=hull,core,…) ----------
// Разбор GLB без GLTFLoader (как в korm-dlya-rybok): одна сетка, PBR-материал с текстурами. Узлы запекаются в геометрию.
async function loadGLB(url){
  const res = await fetch(url); if (!res.ok) throw new Error('нет файла ' + url);
  const buf = await res.arrayBuffer(), dv = new DataView(buf);
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength){
    const len = dv.getUint32(off, true), typ = dv.getUint32(off + 4, true); off += 8;
    if (typ === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off, len)));
    else if (typ === 0x004E4942) bin = buf.slice(off, off + len);
    off += len;
  }
  const CT = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const acc = (i) => {                                   // с учётом byteStride: gltf-transform пишет вершины вперемежку
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], Ty = CT[a.componentType], n = NC[a.type], start = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride;
    if (!stride || stride === n * Ty.BYTES_PER_ELEMENT) return new Ty(bin, start, a.count * n);
    const out = new Ty(a.count * n), dv2 = new DataView(bin), get = Ty === Float32Array ? 'getFloat32' : Ty === Uint32Array ? 'getUint32' : Ty === Uint16Array ? 'getUint16' : 'getUint8';
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv2[get](start + k * stride + c * Ty.BYTES_PER_ELEMENT, true);
    return out;
  };
  const tex = async (ti, srgb) => { const im = json.images[json.textures[ti].source], bv = json.bufferViews[im.bufferView];
    const bmp = await createImageBitmap(new Blob([new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength)], { type: im.mimeType || 'image/png' }), { imageOrientation: 'none' });
    const t = new T.CanvasTexture(bmp); t.flipY = false; t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.anisotropy = 4; return t; };
  const m = json.materials[0], pbr = m.pbrMetallicRoughness || {}, opt = { roughness: 1, metalness: 1, envMapIntensity: 0.9 };
  if (pbr.baseColorTexture) opt.map = await tex(pbr.baseColorTexture.index, true);
  if (m.normalTexture) opt.normalMap = await tex(m.normalTexture.index, false);
  opt.roughness = 0.4; opt.metalness = 0;                  // металличность Tripo даёт тёмную «пудру» на хроме — не берём (как в korm-dlya-rybok)
  const mat = new T.MeshStandardMaterial(opt), geos = [];
  const walk = (ni, parent) => { const nd = json.nodes[ni], mx = new T.Matrix4();
    if (nd.matrix) mx.fromArray(nd.matrix); else mx.compose(new T.Vector3().fromArray(nd.translation || [0, 0, 0]), new T.Quaternion().fromArray(nd.rotation || [0, 0, 0, 1]), new T.Vector3().fromArray(nd.scale || [1, 1, 1]));
    mx.premultiply(parent);
    if (nd.mesh !== undefined) for (const pr of json.meshes[nd.mesh].primitives){ const g = new T.BufferGeometry(), at = pr.attributes;
      g.setAttribute('position', new T.BufferAttribute(acc(at.POSITION).slice(), 3)); g.setAttribute('normal', new T.BufferAttribute(acc(at.NORMAL).slice(), 3));
      g.setAttribute('uv', new T.BufferAttribute(acc(at.TEXCOORD_0).slice(), 2)); g.setIndex(new T.BufferAttribute(acc(pr.indices).slice(), 1)); g.applyMatrix4(mx); geos.push(g); }
    for (const c of (nd.children || [])) walk(c, mx); };
  for (const n of json.scenes[json.scene || 0].nodes) walk(n, new T.Matrix4());
  return { geo: geos[0], mat };
}
// Привести модель к клетке: длинная ось → long ('x' | 'z'), доворот yaw, размер по длинной оси = len, низ на y = lift, центр в нуле
const TRIPO = {
  hull: { long: 'x', len: 0.96, lift: 0.02, keep: ['lamp'] }, core: { long: 'x', len: 1.0, lift: 0.02, keep: [], fit: 'max' }, rock: { long: 'x', len: 0.8, lift: 0.02, keep: [] },
  truss: { long: 'x', len: 1.9, lift: 0.08, keep: [] }, mirror: { long: 'x', len: 0.95, lift: 0.0, keep: [] }, solar: { long: 'z', len: 1.06, lift: 0.08, keep: [] },
};
R3.loadTripo = async function(names){
  for (const name of names){
    const cfg = TRIPO[name]; if (!cfg) continue;
    const { geo, mat } = await loadGLB('assets/models/' + name + '.glb');
    // Tripo строит модель «лицом к камере картинки»: лист GPT снят в три четверти сверху, поэтому верх вещи завален к зрителю.
    // Возвращаем наклон (rx), затем ищем рысканье, при котором вещь длиннее всего вдоль своей оси (порты и торцы — по осям клетки).
    const q = new URLSearchParams(location.search), rx = (q.get('trx') !== null ? +q.get('trx') : cfg.rx === undefined ? 35 : cfg.rx) * Math.PI / 180;
    geo.rotateX(-rx);
    // вытянутые вещи (капсула, ферма, панель) — по самой узкой ширине поперёк оси; ядро с четырьмя портами — по самой большой длине
    const pa = geo.attributes.position; let best = 0, bestE = cfg.fit === 'max' ? -1 : 1e9;
    for (let d = 0; d < 180; d += 1){ const a = d * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a); let lo = 1e9, hi = -1e9;
      for (let k = 0; k < pa.count; k += 2){ const along = pa.getX(k) * ca - pa.getZ(k) * sa, across = pa.getX(k) * sa + pa.getZ(k) * ca, v = cfg.fit === 'max' ? along : across; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (cfg.fit === 'max' ? hi - lo > bestE : hi - lo < bestE){ bestE = hi - lo; best = a; } }
    geo.rotateY(best + (cfg.long === 'z' ? Math.PI / 2 : 0) + (cfg.yaw || 0));
    geo.computeBoundingBox(); const sz = geo.boundingBox.getSize(new T.Vector3()); const c = geo.boundingBox.getCenter(new T.Vector3()), k = cfg.len / (cfg.long === 'z' ? sz.z : sz.x);
    geo.translate(-c.x, -geo.boundingBox.min.y, -c.z); geo.scale(k, k, k); geo.translate(0, cfg.lift, 0); geo.computeBoundingSphere();
    const key = name === 'solar' ? 'panQ' : name === 'hull' ? 'habQ' : name === 'truss' ? 'trussQ' : name, old = MODELS[key]; if (!old || !ART[key]) continue;
    for (const mesh of old.meshes){ root.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); }      // общие материалы MAT остаются
    const parts = [{ geo, mat, grp: 'tripo', pos: [0, 0, 0], rot: [0, 0, 0] }, ...ART[key]().filter(p => cfg.keep.includes(p.grp))];
    delete MODELS[key]; MODELS[key] = new Model(key, parts);
  }
  R3.tripo = names;
};

// Заменить или добавить модель (проба hw: модели GLB грузятся после init). parts — детали ART; ghosts — заодно пулы призрака и шлейфа.
R3.addModel = function(name, partsFn, ghosts){
  ART[name] = partsFn;
  for (const key of [name, name + ':ghost', name + ':holo']){ const old = MODELS[key]; if (!old) continue;
    for (const mesh of old.meshes){ root.remove(mesh); if (!mesh.geometry.userData.keep) mesh.geometry.dispose(); mesh.dispose(); } delete MODELS[key]; }
  modelOf(name); if (ghosts){ modelOf(name, 'ghost'); modelOf(name, 'holo'); }
};
// ---------- текстуры: тень-пятно, свечение, плитки чертежа ----------
function canvasTex(w, h, draw, srgb){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); if (srgb !== false) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; }
const TEX = {};
function makeTex(){
  TEX.shadow = canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(4,5,24,0.7)'); g.addColorStop(0.6, 'rgba(4,5,24,0.42)'); g.addColorStop(1, 'rgba(4,5,24,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
  TEX.glow = canvasTex(64, 64, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
  TEX.ring = canvasTex(128, 128, (c, w) => { c.strokeStyle = '#fff'; c.lineWidth = 9; c.shadowColor = '#fff'; c.shadowBlur = 10; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 14, 0, 6.283); c.stroke(); });
  // Гнездо чертежа (v1.2, без доски под ним): стеклянная заливка, светящийся контур — сплошные скруглённые углы и ровные
  // штрихи по сторонам (пунктир симметричный, без обрывков на углах), значок типа. Всё белым — цвет даёт инстанс.
  // Ферма — гнездо 2×1. Контур рисуется дважды: размытое свечение и чёткая линия поверх.
  const PX = 192, IN = 17, RAD = 38, DASH = 26, GAP = 24, WH = 4;   // штрих, зазор, ус у дуги угла (px текстуры)
  const outline = (c, w, h) => {
    const x0 = IN, y0 = IN, x1 = w - IN, y1 = h - IN, r = RAD;
    c.beginPath();
    for (const [cx, cy, a0] of [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]]){   // углы — сплошные дуги с короткими усами
      c.moveTo(cx + Math.cos(a0) * r - Math.cos(a0 + Math.PI / 2) * WH, cy + Math.sin(a0) * r - Math.sin(a0 + Math.PI / 2) * WH);
      c.arc(cx, cy, r, a0, a0 + Math.PI / 2);
      c.lineTo(cx + Math.cos(a0 + Math.PI / 2) * r - Math.cos(a0) * WH, cy + Math.sin(a0 + Math.PI / 2) * r - Math.sin(a0) * WH);
    }
    const side = (ax, ay, bx, by) => {                                       // штрихи по стороне: целое число, зазоры равные
      const L = Math.hypot(bx - ax, by - ay) - 2 * WH, n = Math.max(1, Math.round((L - GAP) / (DASH + GAP))), g = (L - n * DASH) / (n + 1), ux = (bx - ax) / (L + 2 * WH), uy = (by - ay) / (L + 2 * WH);
      for (let k = 0; k < n; k++){ const s0 = WH + g + k * (DASH + g); c.moveTo(ax + ux * s0, ay + uy * s0); c.lineTo(ax + ux * (s0 + DASH), ay + uy * (s0 + DASH)); }
    };
    side(x0 + r, y0, x1 - r, y0); side(x1, y0 + r, x1, y1 - r); side(x1 - r, y1, x0 + r, y1); side(x0, y1 - r, x0, y0 + r);
  };
  const plate = (cells, icon) => canvasTex(PX * cells, PX, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.2)');
    c.fillStyle = g; rr(c, IN, IN, w - 2 * IN, h - 2 * IN, RAD); c.fill();
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#fff';
    c.save(); c.shadowColor = '#fff'; c.shadowBlur = 14; c.globalAlpha = 0.5; c.lineWidth = 8; outline(c, w, h); c.stroke(); c.restore();
    c.lineWidth = 8; outline(c, w, h); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.strokeStyle = 'rgba(255,255,255,0.7)'; icon(c, w, h);
  });
  TEX.bpHull = plate(1, (c, w, h) => { rr(c, w * 0.25, h * 0.36, w * 0.5, h * 0.28, h * 0.14); c.fill(); });
  TEX.bpSolar = plate(1, (c, w, h) => { for (const [x, y] of [[0.29, 0.29], [0.52, 0.29], [0.29, 0.52], [0.52, 0.52]]){ rr(c, w * x, h * y, w * 0.19, h * 0.19, 9); c.fill(); } });
  TEX.bpTruss = plate(2, (c, w, h) => { c.lineWidth = 15; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    for (let k = 0; k <= 6; k++){ const x = w * (0.2 + 0.6 * k / 6), y = h * (k % 2 ? 0.63 : 0.37); if (k) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); });
}
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// Плоские квады (лежат на доске): тень, свечение, кольцо, плитки чертежа — тоже инстансы, цвет и размер задаёт игра
const QUADS = {};
function quadOf(name){
  if (QUADS[name]) return QUADS[name];
  const cells = name === 'bpTruss' ? 2 : 1, g = new T.PlaneGeometry(cells, 1); g.rotateX(-Math.PI / 2);
  const add = name === 'glow' || name === 'ring';
  const mat = new T.MeshBasicMaterial({ map: TEX[name], transparent: true, depthWrite: false, toneMapped: false, blending: add ? T.AdditiveBlending : T.NormalBlending });
  const mesh = new T.InstancedMesh(g, mat, SH.CAP * 2); mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.setColorAt(0, WHITE); mesh.renderOrder = name === 'shadow' ? 1 : name.startsWith('bp') ? 2 : 6;
  root.add(mesh);
  return (QUADS[name] = { mesh, n: 0 });
}

// ---------- студийное окружение для бликов: комната с мягкими «софтбоксами» → PMREM ----------
function makeEnv(){
  if (LOOK() && LOOK().env){ const pm = new T.PMREMGenerator(renderer); envTex = pm.fromScene(LOOK().env(), 0.04).texture; pm.dispose(); return; }
  const s = new T.Scene(), box = new T.BoxGeometry(1, 1, 1);
  const room = new T.Mesh(new T.BoxGeometry(20, 12, 20), new T.MeshBasicMaterial({ color: '#10142a', side: T.BackSide })); s.add(room);
  const light = (col, int, pos, sc) => { const m = new T.Mesh(box, new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(int) })); m.position.set(...pos); m.scale.set(...sc); s.add(m); };
  // v2.0: тёмная комната с узкими световыми полосами — на графитовом металле читаются фаски и блики, а не ровная серая заливка
  light('#f4f6ff', 7, [-3, 5.8, 2], [7, 0.15, 1.2]);   // ключевая полоса сверху
  light('#dfe8ff', 4, [3, 5.8, -2], [6, 0.15, 0.6]);   // вторая полоса сверху
  light('#7fd8ff', 3.2, [6, 2, 0], [0.2, 3, 9]);       // холодная боковая (бирюза)
  light('#9d7bff', 2.6, [0, 3, -9.5], [10, 3, 0.2]);   // фиолетовый контровой
  light('#ffb35c', 1.2, [0, 1, 9.5], [8, 1.5, 0.2]);   // тёплый рефлекс спереди (слабый)
  const pm = new T.PMREMGenerator(renderer); envTex = pm.fromScene(s, 0.04).texture; pm.dispose();
}

// ---------- инициализация ----------
R3.init = function(canvas){
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e){ R3.error = String(e); return false; }
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = (LOOK() && LOOK().exposure) || 1.0;
  renderer.setClearColor(0x000000, 0);
  scene = new T.Scene(); root = new T.Group(); scene.add(root); staticGroup = new T.Group(); scene.add(staticGroup);
  cam = new T.PerspectiveCamera(SH.FOV, 1, 0.5, 300); cam.up.set(0, 0, -1);    // «верх» экрана — −Z: камера может смотреть строго вниз
  makeMats(); makeTex(); makeEnv(); scene.environment = envTex;
  // Свет один на всё: при виде почти сверху ключевой свет стоит ниже и сбоку — округлые формы получают градиент, а не плоскую заливку
  // v2.0 стиль A: ключ белый сверху-слева, контровой холодный сзади-сверху (кромки металла и плит светятся на тёмном небе), второй
  // контровой фиолетовый с другой стороны; небо-полушарие слабее — тёмный металл остаётся тёмным
  if (LOOK()) LOOK().lights(scene);
  else {
  scene.add(new T.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 0.75));
  const key = new T.DirectionalLight(PAL.key, 2.2); key.position.set(-6, 8, 5); scene.add(key);
  const rim = new T.DirectionalLight(PAL.rim, 1.7); rim.position.set(4, 5, -8); scene.add(rim);
  const rim2 = new T.DirectionalLight(PAL.rim2, 0.9); rim2.position.set(-7, 3, -4); scene.add(rim2);
  }
  R3.EN = new T.Color('#3fe6ff');
  if (LOOK()) LOOK().arts();                                            // проба: модели пробы поверх ART (общие модули, ядро, швы — под теми же именами)
  for (const n of Object.keys(ART)) modelOf(n);
  for (const n of ['habQ', 'panQ', 'trussQ']){ modelOf(n, 'ghost'); modelOf(n, 'holo'); }
  if (LOOK()) for (const n of LOOK().ghosts || []){ modelOf(n, 'ghost'); modelOf(n, 'holo'); }   // готовая деталь под пальцем и в шлейфе
  for (const n of ['shadow', 'glow', 'ring', 'bpHull', 'bpSolar', 'bpTruss']) quadOf(n);
  R3.ready = true; return true;
};

// ---------- статика уровня (v1.2): доски нет. Одна прозрачная плоскость с текстурой: силуэт вещи (свечение снаружи контура,
// тонкая линия по контуру, едва заметная заливка внутри); крестиков сетки нет (v1.2.1). Площадки очередей кладёт игра. ----------
// mask[i] — клетка принадлежит вещи (чертёж или ядро). Прозрачность плоскости задаёт игра: R3.board(alpha).
let boardMesh = null;
R3.SILHOUETTE = false;                                                    // силуэт вещи под чертежом (v1.2–1.2.1); выключен в v1.2.2
R3.setLevel = function(w, h, chapter, mask){
  while (staticGroup.children.length){ const o = staticGroup.children.pop(); o.geometry && o.geometry.dispose(); if (o.material){ o.material.map && o.material.map.dispose(); o.material.dispose(); } }
  boardMesh = null; mask = mask || [];
  if (!R3.SILHOUETTE) return;                                             // v1.2.2: по отзыву Андрея под чертежом ничего нет — только гнёзда модулей
  const M = 0.5, px = 128, W = Math.round((w + 2 * M) * px), H = Math.round((h + 2 * M) * px), X = (x) => (M + x) * px;
  const mk = (draw) => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; draw(cv.getContext('2d')); return cv; };
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !!mask[y * w + x];
  // форма вещи: объединение клеток со скруглёнными внешними углами (соседние клетки сшиты перемычками)
  const e = 0.03 * px, r = 0.2 * px;
  const shape = mk((c) => { c.fillStyle = '#fff';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ if (!at(x, y)) continue;
      rr(c, X(x) - e, X(y) - e, px + 2 * e, px + 2 * e, r); c.fill();
      if (at(x + 1, y)) c.fillRect(X(x) + px / 2, X(y) - e, px, px + 2 * e);
      if (at(x, y + 1)) c.fillRect(X(x) - e, X(y) + px / 2, px + 2 * e, px);
    } });
  const tinted = (src, col) => mk((c) => { c.drawImage(src, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = col; c.fillRect(0, 0, W, H); });
  // линия контура: форма, раздутая на t px, минус сама форма
  const t = 3.2, ring = mk((c) => { for (let k = 0; k < 16; k++) c.drawImage(shape, Math.cos(k * Math.PI / 8) * t, Math.sin(k * Math.PI / 8) * t);
    c.globalCompositeOperation = 'destination-out'; c.drawImage(shape, 0, 0); });
  const line = chapter === 2 ? '#ffd9c2' : '#c8f1ff', aura = chapter === 2 ? '#ff9a6b' : '#4fc8ff';
  const tex = new T.CanvasTexture(mk((c) => {
    // свечение снаружи контура: тень формы, сама форма вычтена
    const glow = mk((g) => { g.shadowColor = aura; g.shadowBlur = 0.26 * px; g.shadowOffsetX = 3 * W; g.drawImage(shape, -3 * W, 0); g.drawImage(shape, -3 * W, 0);
      g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowColor = 'transparent'; g.globalCompositeOperation = 'destination-out'; g.drawImage(shape, 0, 0); });
    c.globalAlpha = 0.75; c.drawImage(glow, 0, 0);
    c.globalAlpha = 0.07; c.drawImage(tinted(shape, aura), 0, 0);
    c.globalAlpha = 0.95; c.drawImage(tinted(ring, line), 0, 0);
    // узлы сетки (крестики) убраны в v1.2.1 по отзыву Андрея: поле держат силуэт вещи и гнёзда чертежа
  }));
  tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  const geo = new T.PlaneGeometry(w + 2 * M, h + 2 * M); geo.rotateX(-Math.PI / 2);
  boardMesh = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  boardMesh.position.y = 0.004; boardMesh.renderOrder = 0.5; staticGroup.add(boardMesh);
};
R3.board = function(alpha){ if (!boardMesh) return; boardMesh.visible = alpha > 0.01; boardMesh.material.opacity = alpha; };

// ---------- кадр: игра расставляет инстансы ----------
R3.begin = function(){ for (const m of Object.values(MODELS)) m.n = 0; for (const q of Object.values(QUADS)) q.n = 0; };
// Матрица: позиция, рысканье (поворот вокруг Y, рад), масштаб (число или [x,y,z]), доп. наклон по X/Z (рад)
R3.mat = function(x, y, z, yaw, sc, rx, rz, out){
  const m = out || tmpM;
  tmpE.set(rx || 0, yaw || 0, rz || 0, 'YXZ'); tmpQ.setFromEuler(tmpE);
  if (Array.isArray(sc)) tmpS.set(sc[0], sc[1], sc[2]); else tmpS.set(sc === undefined ? 1 : sc, sc === undefined ? 1 : sc, sc === undefined ? 1 : sc);
  return m.compose(tmpV.set(x, y, z), tmpQ, tmpS);
};
R3.put = function(name, m, tint, lamp, mode, en){ modelOf(name, mode).add(m, tint, lamp, en); };
R3.quad = function(name, x, y, z, sx, sz, yaw, col, alpha){
  const q = quadOf(name); if (q.n >= SH.CAP * 2) return;
  tmpE.set(0, yaw || 0, 0); tmpQ.setFromEuler(tmpE); tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sx, 1, sz));
  q.mesh.setMatrixAt(q.n, tmpM);
  tmpC.copy(col || WHITE); if (alpha !== undefined) tmpC.multiplyScalar(alpha);   // у аддитивных и пунктира прозрачность — яркостью
  q.mesh.setColorAt(q.n, tmpC); q.n++;
};
R3.color = (hex, k) => { const c = new T.Color(hex); if (k !== undefined) c.multiplyScalar(k); return c; };
R3.end = function(){
  for (const m of Object.values(MODELS)) m.flush();
  for (const q of Object.values(QUADS)){ if (!q.n && !q.prev) continue; q.prev = q.n; q.mesh.count = q.n; q.mesh.visible = q.n > 0; upd(q.mesh.instanceMatrix, q.n * 16); if (q.mesh.instanceColor) upd(q.mesh.instanceColor, q.n * 3); }
};

// ---------- камера: вписать точки (мировые) в прямоугольник экрана ----------
// view: { w, h (CSS px холста), top, bottom, side (поля в px под HUD и кнопки) }, pts — [[x,y,z]…], zoom — приближение победы
let camFit = { dist: 20, tx: 0, tz: 0 };
R3.resize = function(w, h, ratio){
  if (!renderer) return;
  dpr = ratio; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); cw = w; chh = h; cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix();
};
function placeCam(dist, tx, tz, shake){
  const p = SH.PITCH * Math.PI / 180;
  cam.position.set(tx + (shake ? shake[0] : 0), Math.sin(p) * dist, tz + Math.cos(p) * dist + (shake ? shake[1] : 0));
  cam.lookAt(tx + (shake ? shake[0] : 0), 0, tz + (shake ? shake[1] : 0)); cam.updateMatrixWorld();
}
R3.fit = function(pts, view){
  if (!renderer || !cw) return;
  const availW = cw - 2 * view.side, availH = chh - view.top - view.bottom, sinP = Math.sin(SH.PITCH * Math.PI / 180);
  const cellAt = (tx, tz) => Math.abs(R3.project(tx + 0.5, 0, tz).x - R3.project(tx - 0.5, 0, tz).x);
  let tx = 0, tz = 0, dist = 20;
  for (let pass = 0; pass < 4; pass++){
    let lo = 3, hi = 200;
    for (let k = 0; k < 26; k++){
      const d = (lo + hi) / 2; placeCam(d, tx, tz);
      const b = bounds(pts);
      if (b.x1 - b.x0 <= availW && b.y1 - b.y0 <= availH) hi = d; else lo = d;
    }
    dist = hi; placeCam(dist, tx, tz);
    // маленькие уровни не раздуваются: клетка не крупнее view.maxCell (иначе первый уровень вдвое крупнее двадцатого)
    const cp = cellAt(tx, tz); if (view.maxCell && cp > view.maxCell){ dist *= cp / view.maxCell; placeCam(dist, tx, tz); }
    // сдвинуть цель так, чтобы рамка точек встала по центру доступного прямоугольника
    const b = bounds(pts), px = cellAt(tx, tz) || 40;
    tx += ((b.x0 + b.x1) / 2 - (view.side + availW / 2)) / px; tz += ((b.y0 + b.y1) / 2 - (view.top + availH / 2)) / (px * sinP);
  }
  camFit = { dist, tx, tz };
  placeCam(dist, tx, tz);
};
function bounds(pts){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts){ const s = R3.project(p[0], p[1], p[2]); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
  return { x0, y0, x1, y1 };
}
// Мир → экран (CSS px холста)
R3.project = function(x, y, z){ tmpV.set(x, y, z).project(cam); return { x: (tmpV.x + 1) / 2 * cw, y: (1 - tmpV.y) / 2 * chh, z: tmpV.z }; };
// Пикселей на клетку у центра поля (для порогов касания, размеров слов и частиц)
R3.cellPx = function(){ const a = R3.project(camFit.tx - 0.5, 0, camFit.tz), b = R3.project(camFit.tx + 0.5, 0, camFit.tz); return Math.abs(b.x - a.x); };

// ---------- отрисовка ----------
R3.render = function(shake, zoom){
  if (!renderer) return;
  placeCam(camFit.dist / (zoom || 1), camFit.tx, camFit.tz, shake);
  renderer.render(scene, cam);
  R3.stats.calls = renderer.info.render.calls; R3.stats.tris = renderer.info.render.triangles;
};
// Прогрев: один раз нарисовать все пулы (шейдеры, буферы, текстуры) крошечными в кадре — урок lesson-threejs-first-draw-warmup
R3.warm = function(){
  if (!renderer) return;
  R3.begin();
  for (const [key, m] of Object.entries(MODELS)) m.add(R3.mat(camFit.tx, 0.2, camFit.tz, 0, 0.001));
  for (const name of Object.keys(QUADS)) R3.quad(name, camFit.tx, 0.01, camFit.tz, 0.001, 0.001);
  R3.end(); R3.render(); R3.begin(); R3.end();
};

// ---------- снимок готового объекта для ангара и карточки победы ----------
// fill(R3) — игра расставляет модели объекта (как в кадре), центр в нуле. Возвращает dataURL PNG с прозрачным фоном.
let snapRT = null, snapOut = null, snapPass = null, snapScene = null, snapCam = null;
// Khronos PBR Neutral (как NeutralToneMapping в three) + линейный → sRGB; альфа без изменений
const SNAP_FRAG = `uniform sampler2D src; uniform float exposure; varying vec2 vUv;
vec3 neutral(vec3 c){ c *= exposure; float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off;
  float peak = max(c.r, max(c.g, c.b)); if (peak < 0.76) return c; float d = 0.24; float np = 1.0 - d * d / (peak + d - 0.76);
  c *= np / peak; float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0); return mix(c, vec3(np), g); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main(){ vec4 t = texture2D(src, vUv); vec3 c = t.a > 0.0 ? t.rgb / t.a : t.rgb; gl_FragColor = vec4(toSRGB(clamp(neutral(c), 0.0, 1.0)), t.a); }`;   // прямая альфа: PNG через putImageData
R3.snapshot = function(fill, size, span){
  if (!renderer) return '';
  size = size || 256; span = span || 5;
  // render target three рисует без тон-маппинга: снимаем в HDR и прогоняем тот же NeutralToneMapping + sRGB своим проходом
  if (!snapRT || snapRT.width !== size){
    snapRT && snapRT.dispose(); snapOut && snapOut.dispose();
    snapRT = new T.WebGLRenderTarget(size, size, { samples: 4, type: T.HalfFloatType, colorSpace: T.LinearSRGBColorSpace });
    snapOut = new T.WebGLRenderTarget(size, size, { type: T.UnsignedByteType });
    snapPass = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ uniforms: { src: { value: snapRT.texture }, exposure: { value: renderer.toneMappingExposure } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: SNAP_FRAG, depthTest: false, depthWrite: false, toneMapped: false, blending: T.NoBlending }));
    snapPass.frustumCulled = false; snapScene = new T.Scene(); snapScene.add(snapPass); snapCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  const c2 = new T.PerspectiveCamera(30, 1, 0.5, 200), p = 64 * Math.PI / 180, d = span / Math.tan(15 * Math.PI / 180) * 0.62;
  c2.up.set(0, 1, 0); c2.position.set(d * 0.12, Math.sin(p) * d, Math.cos(p) * d); c2.lookAt(0, 0.3, 0);
  staticGroup.visible = false;
  R3.begin(); fill(R3); R3.end();
  renderer.setRenderTarget(snapRT); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, c2);
  renderer.setRenderTarget(snapOut); renderer.clear(); renderer.render(snapScene, snapCam);
  const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(snapOut, 0, 0, size, size, px); renderer.setRenderTarget(null);
  staticGroup.visible = true;
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d'), img = c.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);   // WebGL снизу вверх
  c.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
};
R3.info = () => ({ ready: R3.ready, calls: R3.stats.calls, tris: R3.stats.tris, dpr, size: [cw, chh], cam: camFit, models: Object.fromEntries(Object.entries(MODELS).filter(([k, m]) => m.n).map(([k, m]) => [k, m.n])) });
})();
