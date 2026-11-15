/* «Стыковка 3D» — проба «эпичные корабли» (?look=epic, 15.11.2026). Подключается после scene3d.js и только с ?look=epic:
   своя палитра «кино-sci-fi» (тёмный графит и оружейный металл с панелями и швами, светлая броня акцентами, один тёплый акцент —
   янтарные «опасные» полосы, один цвет энергии — электрический голубой), свой свет (контровой по краям, тёмное окружение
   с узкими полосами для бликов), свои модели. Общие модули (habQ, panQ, trussQ), ядро и швы (seam, conduit) — под теми же
   именами, что в v2.0, поэтому код игры их не различает. Роли — варианты по классу корабля (eK_*, eE_*, eW_*, …), каждая
   модель — готовая деталь (раскрытия на месте нет: деталь вылетает готовой). Ориентир — art-src/epic/epic-modules.png (GPT).
   Группы материалов: hull (металл, панели и швы рисует шейдер по локальным координатам модели), paint (светлая броня, янтарь),
   glass (стекло, солнечные ячейки), lamp (окна — цвет задаёт игра), energy (голубая энергия — яркость задаёт игра),
   sig (самосветящиеся метки постоянного цвета: цвет семейства модуля в очереди, огни ангара). */
(function(){
'use strict';
let look = ''; try { look = new URLSearchParams(location.search).get('look') || ''; } catch (e) {}
if (look !== 'epic' || !window.R3 || !R3.lib) return;
const { T, P, rbox, chamf, prism, cyl, cylX, torusX, torusY, sph, mirZ, shift, ART, MAT, Y, TOP } = R3.lib;
const PI = Math.PI;

// ---------- палитра ----------
const E = {
  gr: '#3b3f46', gm: '#545a63', gl: '#7d838d', ar: '#959fad', amb: '#e8921f', dk: '#12161d', cells: '#0c2152', glass: '#1d4fa8',
  cyan: '#46e6ff', amber: '#ffb24a', orange: '#ff8a2a', red: '#ff3b3b', green: '#3bff7a', rock: '#4b4842', rockDeep: '#2c2a27',
};
const H0 = 0.36;                                                         // высота корпуса модуля
// ---------- детали ----------
const base = (w, d, c, col, x, h) => P(chamf(w, d, h || H0, c, 0.03), col || E.gm, [x || 0, Y, 0], null, 'hull');
const cap = (w, d, c, x, z, col, dy) => P(chamf(w, d, 0.06, c, 0.012), col || E.gr, [x || 0, TOP + 0.01 + (dy || 0), z || 0], null, 'hull');
const plate = (w, d, x, z, dy) => P(chamf(w, d, 0.04, Math.min(w, d) * 0.3, 0.01), E.ar, [x, TOP + 0.05 + (dy || 0), z], null, 'paint');   // светлая броня — акцент
const win = (x, z, w, d, dy) => P(rbox(w, 0.03, d, 0.01), '#ffffff', [x, TOP + 0.055 + (dy || 0), z], null, 'lamp');
const en = (x, z, w, d, dy) => P(rbox(w, 0.025, d, 0.01), '#ffffff', [x, TOP + 0.055 + (dy || 0), z], null, 'energy');
const sig = (geo, col, pos) => P(geo, col, pos, null, 'sig');
// «Опасная» полоса: n янтарных косых штрихов поперёк оси (along — вдоль X или Z), шаг 0.11, штрих 0.06 × 0.16
function hazard(x, z, n, alongZ, dy){
  const out = [], sh = [[-0.05, -0.08], [0.01, -0.08], [0.05, 0.08], [-0.01, 0.08]];
  for (let k = 0; k < n; k++){ const o = (k - (n - 1) / 2) * 0.11;
    out.push(P(prism(alongZ ? sh.map(([a, b]) => [b, a]) : sh, 0.02), E.amb, [x + (alongZ ? 0 : o), TOP + 0.05 + (dy || 0), z + (alongZ ? o : 0)], null, 'paint')); }
  return out;
}
const ports = (r) => [[r, 0], [-r, 0], [0, r], [0, -r]].map(([x, z]) => P(rbox(x ? 0.05 : 0.18, 0.06, x ? 0.18 : 0.05, 0.015), '#ffffff', [x, Y + 0.02, z], null, 'energy'));

// ---------- общие модули (очередь, промах): тип читается формой и цветом огня — жилой голубой, панель янтарная, ферма оранжевая
// (как гнёзда чертежа) ----------
const habQ = () => [base(0.9, 0.9, 0.2), cap(0.66, 0.66, 0.14),
  sig(rbox(0.07, 0.03, 0.4, 0.012), E.cyan, [0.31, TOP + 0.055, 0]), sig(rbox(0.07, 0.03, 0.4, 0.012), E.cyan, [-0.31, TOP + 0.055, 0]),
  win(-0.02, 0, 0.07, 0.34), plate(0.12, 0.42, 0.14, 0), ...ports(0.45)];
const panQ = () => [P(chamf(0.86, 0.86, 0.26, 0.2, 0.03), E.gm, [0, Y - 0.04, 0], null, 'hull'),
  ...[-1, 1].map(sg => P(chamf(0.66, 0.3, 0.05, 0.06, 0.01), E.cells, [0, Y + 0.115, sg * 0.17], null, 'glass')),
  sig(rbox(0.07, 0.03, 0.62, 0.012), E.amber, [0.36, Y + 0.12, 0]), sig(rbox(0.07, 0.03, 0.62, 0.012), E.amber, [-0.36, Y + 0.12, 0]), ...ports(0.44)];
const trussQ = () => { const L = 1.86, h = L / 2, parts = [];
  for (const sg of [-1, 1]){ parts.push(P(chamf(0.32, 0.66, 0.42, 0.1, 0.025), E.gm, [sg * (h - 0.16), Y, 0], null, 'hull'), cap(0.2, 0.48, 0.06, sg * (h - 0.16)),
    sig(rbox(0.05, 0.04, 0.36, 0.015), E.orange, [sg * (h - 0.05), TOP + 0.055, 0]), P(rbox(0.06, 0.08, 0.16, 0.02), '#ffffff', [sg * h, Y, 0], null, 'energy')); }
  for (const z of [-0.24, 0.24]) parts.push(P(rbox(L - 0.5, 0.08, 0.08, 0.025), E.gl, [0, Y + 0.13, z], null, 'hull'), P(rbox(L - 0.5, 0.07, 0.07, 0.02), E.gm, [0, Y - 0.12, z], null, 'hull'));
  const inner = h - 0.32, len = Math.hypot(inner, 0.48), a = Math.atan2(0.48, inner);
  for (const sg of [-1, 1]) parts.push(P(rbox(len, 0.06, 0.06, 0.02), E.gm, [-inner / 2, Y + 0.13, 0], [0, sg * a, 0], 'hull'), P(rbox(len, 0.06, 0.06, 0.02), E.gm, [inner / 2, Y + 0.13, 0], [0, sg * a, 0], 'hull'));
  parts.push(...hazard(-(h - 0.16), 0, 2, true, 0.06), ...hazard(h - 0.16, 0, 2, true, 0.06));
  return parts; };

// ---------- ядро: реактор — восьмигранный блок, голубое кольцо и сердце ----------
const core = () => [P(cyl(0.54, 0.42, 8), E.gm, [0, Y, 0], [0, PI / 8, 0], 'hull'), P(cyl(0.45, 0.06, 8), E.gr, [0, TOP + 0.02, 0], [0, PI / 8, 0], 'hull'),
  P(cyl(0.33, 0.05, 8), E.dk, [0, TOP + 0.05, 0], [0, PI / 8, 0], 'hull'),
  P(torusY(0.29, 0.03, 32), '#ffffff', [0, TOP + 0.08, 0], null, 'energy'), P(cyl(0.19, 0.04, 24), '#ffffff', [0, TOP + 0.08, 0], null, 'lamp'),
  ...[0, 1, 2, 3].map(k => P(rbox(0.16, 0.03, 0.05, 0.01), '#ffffff', [Math.cos(k * PI / 2) * 0.4, TOP + 0.06, Math.sin(k * PI / 2) * 0.4], [0, -k * PI / 2, 0], 'energy')),
  ...[0, 1, 2, 3].map(k => P(rbox(0.12, 0.02, 0.06, 0.01), E.amb, [Math.cos(k * PI / 2 + PI / 4) * 0.38, TOP + 0.06, Math.sin(k * PI / 2 + PI / 4) * 0.38], [0, -(k * PI / 2 + PI / 4), 0], 'paint')),
  ...ports(0.5)];
const coreRing = () => [0, 1, 2].map(k => P(new T.TorusGeometry(0.15, 0.022, 6, 14, 1.6), '#ffffff', [0, TOP + 0.13, 0], [PI / 2, 0, k * 2.094], 'lamp'));

// ---------- швы: бронеплита-переход вместо перемычки (цельный корпус); с энергией — щель с током; Lo — к панелям (низкие) ----------
const seam = () => [P(chamf(0.5, 0.9, 0.34, 0.06, 0.02), E.gm, [0, Y, 0], null, 'hull'), P(chamf(0.56, 0.72, 0.06, 0.05, 0.012), E.gr, [0, TOP + 0.01, 0], null, 'hull')];   // вровень с крышками соседей: верх читается одной плитой
const conduit = () => [...seam(), P(rbox(0.5, 0.03, 0.07, 0.012), '#ffffff', [0, TOP + 0.05, 0], null, 'energy')];
const seamLo = () => [P(chamf(0.4, 0.56, 0.16, 0.06, 0.015), E.gm, [0, Y - 0.05, 0], null, 'hull')];
const conduitLo = () => [...seamLo(), P(rbox(0.42, 0.03, 0.06, 0.01), '#ffffff', [0, Y + 0.045, 0], null, 'energy')];
const plug = () => [P(chamf(0.7, 0.7, 0.34, 0.12, 0.02), E.gm, [0, Y, 0], null, 'hull'), P(chamf(0.62, 0.62, 0.06, 0.12, 0.012), E.gr, [0, TOP + 0.012, 0], null, 'hull')];   // кластер 2×2 — одна секция

// ---------- роли жилого ----------
const hullBase = (x) => [base(0.97, 0.97, 0.12, E.gm, x || 0)];
// Кабины: фонарь (стеклянный фонарь на клине), мостик-башня (ступенчатая надстройка, окна мостика, мачты с красными огнями),
// сенсорный нос (полукруглый нос, тёмный купол с голубым кольцом). Нос выходит вперёд только в пустую сторону (s — короткий)
const kNose = { canopy: () => [P(prism([[0.3, -0.42], [0.62, -0.3], [0.94, -0.06], [0.94, 0.06], [0.62, 0.3], [0.3, 0.42]], 0.28, 0.02), E.gm, [0, Y - 0.02, 0], null, 'hull'),
    P(prism([[0.36, -0.26], [0.6, -0.18], [0.84, -0.03], [0.84, 0.03], [0.6, 0.18], [0.36, 0.26]], 0.05, 0.01), E.gr, [0, Y + 0.14, 0], null, 'hull'),
    P(sph(0.06, 8), '#ffffff', [0.9, Y + 0.02, 0], null, 'energy')],
  tower: () => [P(prism([[0.34, -0.44], [0.7, -0.22], [0.74, 0], [0.7, 0.22], [0.34, 0.44]], 0.26, 0.02), E.gm, [0, Y - 0.03, 0], null, 'hull'),
    ...hazard(0.56, 0, 3, true, -0.06)],
  sensor: () => [P(new T.CylinderGeometry(0.42, 0.42, 0.3, 24, 1, false, 0, PI), E.gm, [0.36, Y - 0.02, 0], null, 'hull'),
    P(new T.CylinderGeometry(0.34, 0.34, 0.06, 24, 1, false, 0, PI), E.gr, [0.36, Y + 0.14, 0], null, 'hull'),
    P((() => { const g = new T.SphereGeometry(0.22, 18, 8, 0, PI * 2, 0, PI / 2); g.scale(1, 0.55, 1); return g; })(), E.dk, [0.42, Y + 0.16, 0], null, 'glass'),
    P(torusY(0.235, 0.025, 28), '#ffffff', [0.42, Y + 0.17, 0], null, 'energy')] };
const kBody = { canopy: () => [...hullBase(-0.02), cap(0.62, 0.7, 0.12, -0.14),
    P((() => { const g = sph(0.5, 18); g.scale(0.56, 0.28, 0.26); return g; })(), E.glass, [0.24, Y + 0.17, 0], null, 'glass'),
    plate(0.52, 0.15, -0.12, -0.37), plate(0.52, 0.15, -0.12, 0.37), win(-0.08, 0, 0.06, 0.3), ...hazard(-0.38, 0, 3, true)],
  tower: () => [...hullBase(), P(chamf(0.56, 0.66, 0.16, 0.12, 0.02), E.gr, [-0.08, TOP + 0.08, 0], null, 'hull'), P(chamf(0.34, 0.46, 0.13, 0.08, 0.015), E.gm, [-0.12, TOP + 0.22, 0], null, 'hull'),
    win(0.2, 0, 0.05, 0.42, 0.09), P(rbox(0.05, 0.05, 0.3, 0.015), E.glass, [0.06, TOP + 0.27, 0], null, 'glass'),
    P(cyl(0.014, 0.3, 6), E.gl, [-0.26, TOP + 0.37, 0.16], null, 'hull'), sig(sph(0.03, 8), E.red, [-0.26, TOP + 0.53, 0.16]),
    plate(0.5, 0.14, -0.06, -0.38), plate(0.5, 0.14, -0.06, 0.38)],
  sensor: () => [...hullBase(), cap(0.6, 0.74, 0.12, -0.12), plate(0.5, 0.15, -0.1, -0.37), plate(0.5, 0.15, -0.1, 0.37), win(-0.32, -0.14, 0.12, 0.06), win(-0.32, 0.14, 0.12, 0.06), ...hazard(0.02, 0, 3, true)] };
// Двигатели: одиночный (крупный колокол), сдвоенный, кольцевой (широкая щель и голубое кольцо сверху), ионный (три щели и сетка).
// Срезы сопел — ENG_OUT (для факелов в игре). Сзади сосед — сопла короче (s)
const ENG_OUT = { single: [[-0.78, 0, 1]], twin: [[-0.72, -0.22, 0.62], [-0.72, 0.22, 0.62]], ring: [[-0.66, 0, 1.25]], ion: [[-0.68, -0.26, 0.42], [-0.68, 0, 0.42], [-0.68, 0.26, 0.42]] };
const eNoz = { single: () => [P(cylX(0.33, 0.33, 0.16, 18), E.gl, [-0.42, Y, 0], null, 'hull'), P(cylX(0.36, 0.26, 0.3, 20), E.gm, [-0.62, Y, 0], null, 'metal'),
    P(torusX(0.31, 0.03, 20), E.amb, [-0.5, Y, 0], null, 'paint'), P(cylX(0.27, 0.27, 0.02, 20), '#ffffff', [-0.775, Y, 0], null, 'energy')],
  twin: () => [-1, 1].flatMap(sg => [P(cylX(0.2, 0.2, 0.14, 14), E.gl, [-0.4, Y, sg * 0.22], null, 'hull'), P(cylX(0.22, 0.15, 0.26, 16), E.gm, [-0.58, Y, sg * 0.22], null, 'metal'),
    P(cylX(0.16, 0.16, 0.02, 16), '#ffffff', [-0.715, Y, sg * 0.22], null, 'energy')]),
  ring: () => [P(chamf(0.3, 0.9, 0.3, 0.12, 0.02), E.gl, [-0.5, Y, 0], null, 'hull'), P(rbox(0.06, 0.12, 0.72, 0.02), '#ffffff', [-0.66, Y, 0], null, 'energy'),
    P(rbox(0.08, 0.04, 0.8, 0.015), E.amb, [-0.56, TOP - 0.02, 0], null, 'paint')],
  ion: () => [P(chamf(0.3, 0.88, 0.3, 0.1, 0.02), E.gl, [-0.5, Y, 0], null, 'hull'), ...[-0.26, 0, 0.26].map(z => P(rbox(0.05, 0.14, 0.14, 0.02), '#ffffff', [-0.66, Y, z], null, 'energy'))] };
const eBody = { single: () => [...hullBase(0.02), cap(0.6, 0.7, 0.12, 0.1), win(0.3, 0, 0.06, 0.26), plate(0.56, 0.15, 0.04, -0.37), plate(0.56, 0.15, 0.04, 0.37), ...hazard(-0.22, 0, 3, true)],
  twin: () => [...hullBase(0.02), cap(0.6, 0.36, 0.1, 0.1, -0.2), cap(0.6, 0.36, 0.1, 0.1, 0.2), win(0.3, 0, 0.06, 0.26), plate(0.16, 0.6, 0.4, 0), ...hazard(-0.22, 0, 2, true)],
  ring: () => [...hullBase(0.02), P(cyl(0.34, 0.08, 8), E.gr, [-0.02, TOP + 0.02, 0], [0, PI / 8, 0], 'hull'), P(torusY(0.22, 0.022, 28), '#ffffff', [-0.02, TOP + 0.065, 0], null, 'energy'),
    P(cyl(0.16, 0.05, 8), E.gm, [-0.02, TOP + 0.07, 0], [0, PI / 8, 0], 'hull'), plate(0.14, 0.5, 0.36, 0)],
  ion: () => [...hullBase(0.02), cap(0.62, 0.78, 0.12, 0.08), ...[-0.26, 0, 0.26].map(z => en(-0.06, z, 0.56, 0.04)), win(0.34, 0, 0.06, 0.3)] };
// Отсеки: броня (накладные плиты, окна в ряд), ангар (тёмный проём, огни разметки), жилой (два ряда окон)
const hRole = { armor: () => [...hullBase(), cap(0.78, 0.78, 0.14), plate(0.56, 0.15, 0.1, -0.37), plate(0.56, 0.15, -0.1, 0.37), plate(0.15, 0.3, 0.36, 0.1), ...[-0.18, -0.06, 0.06, 0.18].map(z => win(0.02, z, 0.07, 0.06))],
  hangar: () => [...hullBase(), cap(0.82, 0.82, 0.14), plate(0.15, 0.7, 0.4, 0), plate(0.15, 0.7, -0.4, 0), P(rbox(0.52, 0.05, 0.6, 0.02), E.dk, [-0.02, TOP + 0.04, 0], null, 'hull'),
    ...[-0.2, 0.2].map(z => P(rbox(0.5, 0.02, 0.05, 0.01), E.amb, [-0.02, TOP + 0.07, z], null, 'paint')),
    ...[-0.18, -0.06, 0.06, 0.18].map(x => sig(rbox(0.04, 0.02, 0.04, 0.01), E.amber, [x, TOP + 0.075, 0])), win(0.31, 0, 0.05, 0.36)],
  win: () => [...hullBase(), cap(0.8, 0.8, 0.14), ...[-0.17, 0.17].flatMap(x => [-0.2, 0, 0.2].map(z => win(x, z, 0.1, 0.07))), plate(0.5, 0.08, 0, -0.39), plate(0.5, 0.08, 0, 0.39)] };
// Купол: башня (основа; голова eD_head вращается — ствол-двойка) или сенсор (тёмный купол, голубое кольцо, мачта)
const dRole = { turret: () => [base(0.94, 0.94, 0.2, E.gm, 0, 0.3), cap(0.72, 0.72, 0.16, 0, 0, E.gr, -0.03), P(cyl(0.32, 0.06, 16), E.gl, [0, TOP + 0.03, 0], null, 'hull'), ...hazard(0, -0.38, 2, false, -0.03)],
  sensor: () => [base(0.94, 0.94, 0.2, E.gm, 0, 0.3), cap(0.72, 0.72, 0.16, 0, 0, E.gr, -0.03),
    P((() => { const g = new T.SphereGeometry(0.26, 18, 8, 0, PI * 2, 0, PI / 2); g.scale(1, 0.7, 1); return g; })(), E.dk, [0, TOP + 0.0, 0], null, 'glass'),
    P(torusY(0.28, 0.028, 28), '#ffffff', [0, TOP + 0.02, 0], null, 'energy'), P(cyl(0.014, 0.22, 6), E.gl, [-0.2, TOP + 0.16, 0.2], null, 'hull'), sig(sph(0.032, 8), E.red, [-0.2, TOP + 0.28, 0.2])] };
const dHead = () => [P(cyl(0.22, 0.12, 8), E.gm, [0, TOP + 0.1, 0], [0, PI / 8, 0], 'hull'), P(cyl(0.15, 0.04, 8), E.gr, [0, TOP + 0.17, 0], [0, PI / 8, 0], 'hull'),
  ...[-1, 1].map(sg => P(cylX(0.035, 0.03, 0.42, 8), E.gl, [0.3, TOP + 0.12, sg * 0.07], null, 'metal')), P(rbox(0.05, 0.03, 0.1, 0.01), '#ffffff', [0.15, TOP + 0.18, 0], null, 'lamp'),
  P(rbox(0.1, 0.02, 0.05, 0.008), E.amb, [-0.12, TOP + 0.18, 0], null, 'paint')];

// ---------- роли панели: крылья (стреловидное, дельта, солнечное, радиаторы), их внутренние куски, радиатор, антенна, щит, плита ----------
// Крыло правого борта (+Z): корень у внутреннего края клетки (z = −0.5), законцовка выходит на 0.38 за клетку (если сбоку пусто)
const WING = {
  swept:    { tip: [[0.44, -0.5], [0.06, 0.86], [-0.18, 0.86], [-0.46, -0.5]], inner: [[0.44, -0.5], [0.44, 0.5], [-0.46, 0.5], [-0.46, -0.5]] },
  delta:    { tip: [[0.46, -0.5], [-0.28, 0.88], [-0.46, 0.88], [-0.46, -0.5]], inner: [[0.46, -0.5], [0.46, 0.5], [-0.46, 0.5], [-0.46, -0.5]] },
  solar:    { tip: [[0.38, -0.5], [0.38, 0.86], [-0.38, 0.86], [-0.38, -0.5]], inner: [[0.38, -0.5], [0.38, 0.5], [-0.38, 0.5], [-0.38, -0.5]] },
  radiator: { tip: null, inner: null },
};
const inset = (pts, k) => { const cxp = pts.reduce((a, p) => a + p[0], 0) / pts.length, czp = pts.reduce((a, p) => a + p[1], 0) / pts.length; return pts.map(([x, z]) => [cxp + (x - cxp) * k, czp + (z - czp) * k]); };
function wingParts(v, tip){
  const root = [P(chamf(0.86, 0.3, 0.3, 0.08, 0.02), E.gm, [0, Y, -0.35], null, 'hull'), cap(0.6, 0.18, 0.05, 0, -0.35)];
  if (v === 'radiator'){
    const L = tip ? 1.28 : 1.0, z0 = -0.5 + L / 2;
    return [...root, ...[-0.26, 0, 0.26].flatMap(x => [P(chamf(0.1, L, 0.2, 0.04, 0.012), E.gm, [x, Y + 0.02, z0], null, 'hull'),
      P(rbox(0.05, 0.02, L * 0.5, 0.008), E.amb, [x, Y + 0.13, z0 - L * 0.12], null, 'paint'), P(rbox(0.04, 0.025, 0.16, 0.01), '#ffffff', [x, Y + 0.13, -0.5 + L - 0.1], null, 'energy')])];
  }
  const shape = WING[v][tip ? 'tip' : 'inner'], parts = [...root];
  if (v === 'solar'){
    parts.push(P(prism(shape, 0.06, 0.012), E.gm, [0, Y - 0.04, 0], null, 'hull'));
    const z1 = tip ? 0.86 : 0.5, n = tip ? 3 : 2, step = (z1 + 0.2) / n;
    for (let k = 0; k < n; k++) for (const x of [-0.17, 0.17]) parts.push(P(chamf(0.3, step - 0.06, 0.03, 0.03, 0.006), E.cells, [x, Y + 0.0, -0.2 + step * (k + 0.5)], null, 'glass'));
    if (tip) parts.push(sig(rbox(0.6, 0.03, 0.05, 0.012), E.amber, [0, Y + 0.0, z1 - 0.02]));
    return parts;
  }
  parts.push(P(prism(shape, 0.1, 0.015), E.gm, [0, Y - 0.02, 0], null, 'hull'), P(prism(inset(shape, 0.78), 0.04), E.gr, [0, Y + 0.045, 0], null, 'hull'));
  // голубая кромка по передней кромке крыла; янтарная полоса у корня
  const [a, b] = [shape[0], shape[1]], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  parts.push(P(rbox(len * 0.86, 0.03, 0.04, 0.012), '#ffffff', [(a[0] + b[0]) / 2 - 0.05, Y + 0.05, (a[1] + b[1]) / 2], [0, Math.atan2(-dz, dx), 0], 'energy'));
  parts.push(...hazard(-0.06, 0.02, 3, false, Y + 0.0 - TOP));
  if (v === 'delta' && tip) parts.push(plate(0.24, 0.1, -0.3, 0.6, Y - TOP - 0.01));
  return parts;
}
const WV = ['swept', 'delta', 'solar', 'radiator'];
// Радиатор (панель сзади): плита и три ребра в клетке; антенна (сбоку спереди): основа + тарелка eA_head (вращается);
// щит (на оси спереди): излучатель — тёмный купол и голубое кольцо; энергоплита (внутри): солнечные ячейки 2×2 и янтарные углы
const rR = () => [P(chamf(0.9, 0.9, 0.24, 0.16, 0.03), E.gm, [0, Y - 0.05, 0], null, 'hull'), ...[-0.24, 0, 0.24].flatMap(z => [P(chamf(0.72, 0.08, 0.2, 0.03, 0.01), E.gl, [0, Y + 0.1, z], null, 'hull'),
  P(rbox(0.14, 0.025, 0.04, 0.01), '#ffffff', [-0.3, Y + 0.21, z], null, 'energy')]), ...hazard(0.34, 0, 3, true, -0.12)];
const rA = () => [P(chamf(0.9, 0.9, 0.24, 0.2, 0.03), E.gm, [0, Y - 0.05, 0], null, 'hull'), P(cyl(0.3, 0.05, 8), E.gr, [0, Y + 0.09, 0], [0, PI / 8, 0], 'hull'), ...hazard(-0.34, 0, 3, true, -0.14)];
const aHead = () => [P(cyl(0.03, 0.22, 6), E.gl, [0, Y + 0.2, 0], null, 'hull'),
  P((() => { const g = new T.SphereGeometry(0.32, 20, 6, 0, PI * 2, 0, 0.9); g.scale(1, 0.4, 1); g.rotateX(PI); return g; })(), E.gl, [0, Y + 0.4, 0], null, 'hull'),
  P(torusY(0.25, 0.02, 24), E.amb, [0, Y + 0.33, 0], null, 'paint'), P(sph(0.05, 8), '#ffffff', [0, Y + 0.38, 0], null, 'energy')];
const rS = () => [P(chamf(0.92, 0.92, 0.26, 0.24, 0.03), E.gm, [0, Y - 0.04, 0], null, 'hull'),
  P((() => { const g = new T.SphereGeometry(0.3, 20, 8, 0, PI * 2, 0, PI / 2); g.scale(1, 0.4, 1); return g; })(), E.dk, [0, Y + 0.09, 0], null, 'glass'),
  P(torusY(0.33, 0.03, 30), '#ffffff', [0, Y + 0.1, 0], null, 'energy'), ...[0, 1, 2, 3].map(k => P(rbox(0.1, 0.02, 0.05, 0.008), E.amb, [Math.cos(k * PI / 2 + PI / 4) * 0.36, Y + 0.1, Math.sin(k * PI / 2 + PI / 4) * 0.36], [0, -(k * PI / 2 + PI / 4), 0], 'paint'))];
const rP = () => [P(chamf(0.96, 0.96, 0.26, 0.16, 0.03), E.gm, [0, Y - 0.04, 0], null, 'hull'),
  ...[[-0.18, -0.18], [-0.18, 0.18], [0.18, -0.18], [0.18, 0.18]].map(([x, z]) => P(chamf(0.3, 0.3, 0.03, 0.04, 0.006), E.cells, [x, Y + 0.1, z], null, 'glass')),
  ...[[-0.4, -0.4], [0.4, 0.4]].map(([x, z]) => P(rbox(0.1, 0.02, 0.1, 0.01), E.amb, [x, Y + 0.1, z], null, 'paint')), en(0, 0, 0.7, 0.03, Y + 0.1 - TOP - 0.055)];

// ---------- роли фермы (2 клетки; +X — к носу у продольных, наружу у поперечных) ----------
const L2 = 1.9, h2 = L2 / 2;
const spine = {
  lattice: () => { const parts = [];
    for (const sg of [-1, 1]) parts.push(P(chamf(0.34, 0.74, 0.4, 0.12, 0.025), E.gm, [sg * (h2 - 0.17), Y, 0], null, 'hull'), cap(0.22, 0.56, 0.08, sg * (h2 - 0.17)), ...hazard(sg * (h2 - 0.17), 0, 3, true, 0.06));
    for (const z of [-0.26, 0.26]) parts.push(P(rbox(L2 - 0.6, 0.08, 0.08, 0.025), E.gl, [0, Y + 0.13, z], null, 'hull'), P(rbox(L2 - 0.6, 0.07, 0.07, 0.02), E.gm, [0, Y - 0.12, z], null, 'hull'));
    const inner = h2 - 0.34, n = 2, dx = 2 * inner / n, len = Math.hypot(dx, 0.52), a = Math.atan2(0.52, dx);
    for (let k = 0; k < n; k++) for (const sg of [-1, 1]) parts.push(P(rbox(len, 0.06, 0.06, 0.02), E.gm, [-inner + dx * (k + 0.5), Y + 0.13, 0], [0, sg * a, 0], 'hull'));
    parts.push(P(rbox(L2 - 0.2, 0.05, 0.07, 0.015), '#ffffff', [0, Y + 0.04, 0], null, 'energy'));
    return parts; },
  armored: () => [P(chamf(L2, 0.8, 0.38, 0.14, 0.03), E.gm, [0, Y, 0], null, 'hull'), ...[-0.62, 0, 0.62].map(x => cap(0.5, 0.62, 0.1, x)),
    ...[-0.31, 0.31].map(x => en(x, 0, 0.06, 0.44)), en(0, 0, 1.5, 0.04, 0.06), plate(0.6, 0.08, 0, -0.36), plate(0.6, 0.08, 0, 0.36), ...hazard(-0.82, 0, 3, true), ...hazard(0.82, 0, 3, true)],
  rail: () => [P(chamf(L2, 0.66, 0.32, 0.14, 0.03), E.gm, [0, Y - 0.02, 0], null, 'hull'), cap(L2 - 0.2, 0.44, 0.1, 0, 0, E.gr, -0.02),
    ...[-0.12, 0.12].map(z => P(rbox(L2 - 0.16, 0.06, 0.07, 0.02), E.gl, [0, TOP + 0.04, z], null, 'metal')),
    ...[-0.6, -0.2, 0.2, 0.6].map(x => P(torusX(0.17, 0.03, 16), '#ffffff', [x, TOP + 0.02, 0], null, 'energy')), ...hazard(-0.84, 0, 3, true, -0.02), ...hazard(0.84, 0, 3, true, -0.02)],
};
// Ускоритель: бронированный кожух и большое сопло за задним концом; таран: броня и белый клин с прожектором на переднем конце;
// пилон с орудием: балка, башня и рельсовый ствол наружу; пилон без орудия: балка и сенсорная гондола
const rB = () => [P(chamf(1.5, 0.78, 0.4, 0.14, 0.03), E.gm, [0.2, Y, 0], null, 'hull'), ...[-0.2, 0.5].map(x => cap(0.5, 0.6, 0.1, x)), en(0.15, 0, 0.06, 0.44), en(0.15, 0, 1.1, 0.04, 0.06),
  P(cylX(0.36, 0.36, 0.14, 18), E.gl, [-0.62, Y, 0], null, 'hull'), P(cylX(0.42, 0.3, 0.34, 20), E.gm, [-0.86, Y, 0], null, 'metal'),
  P(torusX(0.36, 0.035, 20), E.amb, [-0.72, Y, 0], null, 'paint'), P(cylX(0.32, 0.32, 0.02, 20), '#ffffff', [-1.04, Y, 0], null, 'energy'), ...hazard(0.82, 0, 3, true)];
const rL = () => [...spine.armored(), P(prism([[0.86, -0.4], [1.2, -0.12], [1.24, 0], [1.2, 0.12], [0.86, 0.4]], 0.28, 0.02), E.ar, [0, Y, 0], null, 'paint'), P(sph(0.07, 10), '#ffffff', [1.18, Y + 0.12, 0], null, 'energy')];
const rX = () => [P(chamf(1.3, 0.5, 0.28, 0.1, 0.025), E.gm, [-0.3, Y - 0.02, 0], null, 'hull'), cap(1.0, 0.3, 0.08, -0.32, 0, E.gr, -0.04), en(-0.3, 0, 0.9, 0.04, -0.04),
  P(chamf(0.54, 0.66, 0.4, 0.14, 0.025), E.gl, [0.6, Y + 0.02, 0], null, 'hull'), cap(0.36, 0.46, 0.1, 0.6, 0, E.gm, 0.04),
  P(cylX(0.1, 0.08, 0.8, 12), E.gl, [1.1, Y + 0.08, 0], null, 'metal'), ...[0.9, 1.08, 1.26].map(x => P(torusX(0.12, 0.025, 12), '#ffffff', [x, Y + 0.08, 0], null, 'energy')),
  ...hazard(0.6, 0, 3, true, 0.08), P(rbox(0.05, 0.05, 0.05, 0.02), '#ffffff', [1.52, Y + 0.08, 0], null, 'energy')];
const rTP = () => [P(chamf(1.6, 0.5, 0.28, 0.1, 0.025), E.gm, [-0.15, Y - 0.02, 0], null, 'hull'), cap(1.3, 0.3, 0.08, -0.15, 0, E.gr, -0.04), en(-0.15, 0, 1.2, 0.04, -0.04),
  P(cyl(0.22, 0.3, 10), E.gl, [0.7, Y, 0], null, 'hull'), P(torusY(0.2, 0.025, 20), '#ffffff', [0.7, Y + 0.16, 0], null, 'energy'), ...hazard(0.25, 0, 3, true, -0.04)];

// ---------- препятствия в палитре пробы: тёмный астероид, отражатель (металл, янтарный обод), излучатель поля ----------
const rock = () => { const g = new T.IcosahedronGeometry(0.38, 1), a = g.attributes.position, v = new T.Vector3();
  for (let k = 0; k < a.count; k++){ v.fromBufferAttribute(a, k); const n = 0.78 + 0.22 * Math.abs(Math.sin(v.x * 9.1 + v.y * 7.3 + v.z * 5.7)); a.setXYZ(k, v.x * n, v.y * n * 0.8, v.z * n); }
  g.computeVertexNormals(); return [P(g, E.rock, [0, 0.31, 0], null, 'rock'), P(rbox(0.22, 0.04, 0.1, 0.015), E.amb, [0.06, 0.6, 0.04], [0.3, 0.6, 0.2], 'paint')]; };
const mirror = () => { const s = new T.Shape(); s.moveTo(-0.13, 0); s.lineTo(0.13, 0); s.lineTo(0, 0.4); s.lineTo(-0.13, 0);
  const g = new T.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false }); g.translate(0, 0, -0.4); g.rotateY(PI / 2);
  return [P(cyl(0.44, 0.08, 6), E.gm, [0, 0.04, 0], [0, PI / 6, 0], 'hull'), P(new T.TorusGeometry(0.42, 0.035, 6, 6), E.amb, [0, 0.085, 0], [PI / 2, 0, PI / 6], 'paint'),
    P(g, E.ar, [0, 0.08, 0], null, 'paint'), P(rbox(0.8, 0.035, 0.05, 0.015), '#ffffff', [0, 0.485, 0], null, 'lamp'), ...[-0.42, 0.42].map(x => P(sph(0.1, 16), E.gl, [x, 0.2, 0], null, 'metal'))]; };
const emitter = () => [P(rbox(0.14, 0.56, 0.14, 0.05), E.gm, [0, 0.28, 0], null, 'hull'), P(sph(0.085, 12), '#ffffff', [0, 0.6, 0], null, 'lamp'), P(cyl(0.11, 0.06, 14), E.gr, [0, 0.03, 0], null, 'hull')];
const nav = () => [P(sph(0.05, 10), '#ffffff', [0, 0, 0], null, 'lamp')];

// ---------- реестр ----------
const KV = ['canopy', 'tower', 'sensor'], EV = ['single', 'twin', 'ring', 'ion'], HV = ['armor', 'hangar', 'win'], DV = ['turret', 'sensor'], SV = ['lattice', 'armored', 'rail'];
const ghosts = [];
function arts(){
  const A = { habQ, panQ, trussQ, core, coreRing, seam, conduit, seamLo, conduitLo, plug, rock, mirror, emitter, nav, eD_head: dHead, eA_head: aHead, eR: rR, eA: rA, eS: rS, eP: rP, eB: rB, eL: rL, eX: rX, eTP: rTP };
  for (const v of KV){ A['eK_' + v] = () => [...kBody[v](), ...kNose[v]()]; A['eK_' + v + '_s'] = () => [...kBody[v](), ...shift(kNose[v](), 0, 0, 0.62)]; }
  for (const v of EV){ A['eE_' + v] = () => [...eBody[v](), ...eNoz[v]()]; A['eE_' + v + '_s'] = () => [...eBody[v](), ...shift(eNoz[v](), 0, 0, 0.72)]; }
  for (const v of HV) A['eH_' + v] = hRole[v];
  for (const v of DV) A['eD_' + v] = dRole[v];
  for (const v of WV){ A['eW_' + v + '_R'] = () => wingParts(v, true); A['eW_' + v + '_Ri'] = () => wingParts(v, false); A['eW_' + v + '_L'] = () => mirZ(wingParts(v, true)); A['eW_' + v + '_Li'] = () => mirZ(wingParts(v, false)); }
  for (const v of SV) A['eT_' + v] = spine[v];
  for (const n of Object.keys(ART)) if (/^r[A-Z]/.test(n)) delete ART[n];   // роли v2.0 в пробе не нужны: не создавать и не прогревать
  Object.assign(ART, A);
  for (const n of Object.keys(A)) if (/^e[A-Z]/.test(n)) ghosts.push(n);
}

// ---------- материалы: металл с панелями и швами (шейдер по локальным координатам модели: сетка плит «кирпичом», тёмные швы
// на верхних гранях, разброс тона и шероховатости по плитам) ----------
function panelize(m, scale){
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vNl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position; vNl = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying vec3 vNl;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 pp = vLoc.xz * vec2(${scale[0].toFixed(2)}, ${scale[1].toFixed(2)}); pp.x += step(1.0, mod(floor(pp.y), 2.0)) * 0.5;
  vec2 cid = floor(pp), fp = fract(pp), fw = max(fwidth(pp) * 1.3, vec2(0.02));
  vec2 ed = smoothstep(vec2(0.0), fw, fp) * smoothstep(vec2(0.0), fw, 1.0 - fp);
  float seamL = 1.0 - ed.x * ed.y, topF = smoothstep(0.6, 0.92, vNl.y), ph = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
  diffuseColor.rgb *= mix(1.0, (0.82 + 0.34 * ph) * (1.0 - 0.45 * seamL), topF);
  diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.14, 0.46, vLoc.y));`)   // низ граней темнее — объём и тень в стыках без доп. света
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.7 + 0.6 * ph, topF), 0.08, 1.0);');
  };
  m.customProgramCacheKey = () => 'epic-panel-' + scale.join('x');
  return m;
}
function mats(M){
  M.hull = panelize(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.68, envMapIntensity: 1.3 }), [3.2, 2.6]);
  M.paint = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25, envMapIntensity: 0.75 });
  M.metal = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.95, envMapIntensity: 1.3 });
  M.glass = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.5, envMapIntensity: 1.9, emissive: '#06205a', emissiveIntensity: 0.55 });
  M.rock = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1, flatShading: true, envMapIntensity: 0.5 });
  M.sig = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
}
// Окружение для бликов: почти чёрная комната, узкие полосы — белая сверху, голубая контровая «сверху экрана», слабая тёплая снизу
function env(){
  const s = new T.Scene(), box = new T.BoxGeometry(1, 1, 1);
  s.add(new T.Mesh(new T.BoxGeometry(20, 12, 20), new T.MeshBasicMaterial({ color: '#05070c', side: T.BackSide })));
  const light = (col, int, pos, sc) => { const m = new T.Mesh(box, new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(int) })); m.position.set(...pos); m.scale.set(...sc); s.add(m); };
  light('#f4f4f2', 6, [-2, 5.8, 1], [8, 0.12, 0.8]);
  light('#e6e8ee', 2.5, [3, 5.8, -3], [5, 0.12, 0.4]);
  light('#6fd6ff', 4.5, [0, 1.6, -9.6], [12, 1.2, 0.2]);
  light('#ffad5c', 1.4, [0, 1.2, 9.6], [9, 1, 0.2]);
  light('#8aa0ff', 1.6, [9.6, 2, 0], [0.2, 1.4, 10]);
  return s;
}
// Свет: слабое небо, ключ сверху-слева, голубой контровой низко «сверху экрана» (кромки и фаски), тёплый слабый снизу-справа
function lights(scene){
  scene.add(new T.HemisphereLight('#b9bec8', '#0a0b0e', 0.42));
  const key = new T.DirectionalLight('#f2f5ff', 2.1); key.position.set(-5, 9, 4); scene.add(key);
  const rim = new T.DirectionalLight('#6fd2ff', 3.4); rim.position.set(0, 2.2, -8); scene.add(rim);
  const warm = new T.DirectionalLight('#ffb060', 0.75); warm.position.set(6, 2, 6); scene.add(warm);
  const fill = new T.DirectionalLight('#9fb4ff', 0.45); fill.position.set(7, 5, -2); scene.add(fill);
}
R3.epic = { exposure: 1.22, E, ENG_OUT, KV, EV, HV, DV, WV, SV, arts, mats, env, lights, ghosts };
})();
