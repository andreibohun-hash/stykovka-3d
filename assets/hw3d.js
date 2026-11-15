/* «Стыковка 3D» — проба «инженерное железо» (?look=hw, 16.11.2026). Подключается после scene3d.js и только с ?look=hw.
   Реалистичное инженерное «железо» в духе МКС по рефам Андрея (art-src/refs): модули — модели Tripo по листам GPT
   (art-src/hw/sheet-*.png → assets/hw/*.glb, tools/hw-prep.sh), светлые панели, металлические кольца, оранжевые наклейки,
   голубые огни. Каждый модуль — готовая вещь со своим силуэтом (капсула, отсек, купол, двигатель, узел, контейнер; солнечное
   крыло, малые панели, радиатор, антенна; решётка, баки, мачта), ядро — восьмигранник с голубым сердцем, обломок — астероид.
   Модель: +X — нос по курсу (стыковочное кольцо впереди), вид сверху — как на листе GPT. Свет окон — отдельный слой (маска
   голубых пикселей текстуры, аддитивно, цвет задаёт игра: холодный в очереди, яркий после стыковки).
   Грузится асинхронно (R3.hw.load) после R3.init: игра ждёт модели до первого экрана. */
(function(){
'use strict';
let look = ''; try { look = new URLSearchParams(location.search).get('look') || ''; } catch (e) {}
if (look !== 'hw' || !window.R3 || !R3.lib) return;
const { T, P, torusY, ART, loadGLB } = R3.lib;
const V = '2.2.0';                                   // ?v= моделей — вместе с VERSION игры (Pages кэширует ассеты 10 мин)
const D2R = Math.PI / 180;

// Модели: файл assets/hw/<имя>.glb. len — длина по оси X после поворота (клетка = 1; ферма — 2 клетки), w — предел ширины по Z,
// rx — наклон к камере (показать бок с окнами, как на листе GPT), ry — рысканье, чтобы +X смотрел носом (кольцом стыковки) вперёд.
// fam — семейство (тип модуля в правилах): hab — жилой, pan — панель, truss — ферма; цвет пунктира чертежа — по семейству.
const HW = {
  capsule:  { fam: 'hab',   len: 0.96, w: 0.8,  rx: 40, ry: 180 },     // капсула со стеклом: нос со стеклом сзади по курсу
  hab:      { fam: 'hab',   len: 0.96, w: 0.8,  rx: 40, ry: 0 },       // жилой отсек: окна
  cupola:   { fam: 'hab',   len: 0.96, w: 0.86, rx: 20, ry: 0 },       // купол-обсерватория
  engine:   { fam: 'hab',   len: 0.98, w: 0.8,  rx: 40, ry: 180 },     // двигатель: медный раструб сзади
  node:     { fam: 'hab',   len: 0.92, w: 0.92, rx: 30, ry: 0 },       // узел-крестовина
  cargo:    { fam: 'hab',   len: 0.96, w: 0.8,  rx: 35, ry: 0 },       // грузовой контейнер
  solar:    { fam: 'pan',   len: 0.96, w: 0.98, rx: 30, ry: 90 },      // солнечное крыло: ступица по курсу, панели поперёк
  twin:     { fam: 'pan',   len: 0.94, w: 0.86, rx: 30, ry: 0 },       // малые солнечные панели
  radiator: { fam: 'pan',   len: 0.94, w: 0.94, rx: 30, ry: 0 },       // радиатор
  dish:     { fam: 'pan',   len: 0.94, w: 0.9,  rx: 20, ry: 0 },       // антенна
  truss:    { fam: 'truss', len: 1.94, w: 0.8,  rx: 30, ry: 0 },       // решётчатая ферма
  tanks:    { fam: 'truss', len: 1.94, w: 0.86, rx: 30, ry: 0 },       // баки
  mast:     { fam: 'truss', len: 1.94, w: 0.86, rx: 30, ry: 0 },       // мачта с антенной
  core:     { fam: 'core',  len: 1.04, w: 1.04, rx: 25, ry: 0, fit: 'max' },
  debris:   { fam: 'rock',  len: 0.86, w: 0.86, rx: 0,  ry: 0, fit: 'max' },
};
// Для подбора вида: ?hwrx=capsule:40,hab:30 и ?hwry=… переопределяют таблицу (в игре не нужно)
try { const q = new URLSearchParams(location.search); for (const [k, f] of [['hwrx', 'rx'], ['hwry', 'ry']]) for (const kv of (q.get(k) || '').split(',')){ const [n, v] = kv.split(':'); if (HW[n] && v !== undefined) HW[n][f] = +v; } } catch (e) {}
const Y_MID = 0.34;                                    // центр модуля по высоте (как у v2.0: Y 0.32)

// Маска свечения: голубые светлые пиксели текстуры (окна, огни, сердце ядра) → белое, остальное → чёрное
function glowMask(img){
  const w = Math.min(256, img.width), h = Math.min(256, img.height), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let k = 0; k < p.length; k += 4){ const r = p[k], gg = p[k + 1], b = p[k + 2];
    const cy = Math.max(0, Math.min(1, ((Math.min(gg, b) - r) - 45) / 70)) * Math.max(0, Math.min(1, (b - 110) / 80));
    const v = Math.round(255 * cy); p[k] = p[k + 1] = p[k + 2] = v; p[k + 3] = 255; }
  g.putImageData(d, 0, 0); const t = new T.CanvasTexture(c); t.flipY = false; t.colorSpace = T.SRGBColorSpace; return t;
}
// Поворот к виду и подгонка к клетке: наклон rx (бок с окнами к камере), рысканье ry, длина по X = len, ширина по Z ≤ w,
// центр по XZ в нуле, середина по высоте — Y_MID
function orient(geo, cfg){
  geo.rotateX(-cfg.rx * D2R); geo.rotateY(cfg.ry * D2R);                 // −rx: передний бок (окна на листе GPT) поднимается к камере
  geo.computeBoundingBox(); const b = geo.boundingBox, sz = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
  let k = cfg.fit === 'max' ? cfg.len / Math.max(sz.x, sz.z) : cfg.len / sz.x; if (sz.z * k > cfg.w) k = cfg.w / sz.z;
  geo.translate(-c.x, -c.y, -c.z); geo.scale(k, k, k); geo.translate(0, Y_MID, 0); geo.computeBoundingSphere(); geo.computeBoundingBox();
  geo.userData.keep = true; return geo;
}
const GEO = {};
async function load(){ try { await load1(); } catch (e){ await new Promise(r => setTimeout(r, 600)); await load1(); } }   // сеть моргнула — одна повторная попытка (ревью GPT)
async function load1(){
  const t0 = performance.now();
  await Promise.all(Object.entries(HW).map(async ([name, cfg]) => {
    const { geo, mat } = await loadGLB('assets/hw/' + name + '.glb?v=' + V);
    orient(geo, cfg); GEO[name] = geo;
    mat.roughness = cfg.fam === 'rock' ? 0.9 : 0.52; mat.metalness = cfg.fam === 'rock' ? 0 : 0.12; mat.envMapIntensity = 0.75;
    const glow = mat.map ? new T.MeshBasicMaterial({ map: glowMask(mat.map.image), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }) : null;
    const parts = () => [{ geo, mat, grp: 'tripo', pos: [0, 0, 0], rot: [0, 0, 0] }].concat(glow ? [{ geo, mat: glow, grp: 'lamp', pos: [0, 0, 0], rot: [0, 0, 0] }] : []);
    const key = cfg.fam === 'core' ? 'core' : cfg.fam === 'rock' ? 'rock' : 'hw_' + name;
    R3.addModel(key, parts, cfg.fam !== 'core' && cfg.fam !== 'rock');
  }));
  R3.hw.loaded = true; R3.hw.ms = Math.round(performance.now() - t0);
}
function arts(){
  const { rbox, cyl, sph } = R3.lib, PI = Math.PI;
  ART.coreRing = () => [];
  // муфта между соседями: стальной переходник вдоль оси соседства (+X) с тёмными кольцами и голубым огоньком сверху
  ART.hwCollar = () => [P(R3.lib.cylX(0.13, 0.13, 0.3, 16), '#9aa3ae', [0, 0.34, 0], null, 'metal'),
    ...[-0.1, 0.1].map(x => P(R3.lib.cylX(0.155, 0.155, 0.045, 16), '#3a4049', [x, 0.34, 0], null, 'hull')),
    P(rbox(0.06, 0.02, 0.04, 0.008), '#ffffff', [0, 0.475, 0], null, 'energy')];                                                  // сердце ядра светится маской текстуры — кольца-дуги v2.0 не нужны
  // отражатель и излучатели поля — в палитре железа: светло-серая площадка, оранжевый обод, стальные шары, белая призма
  ART.mirror = () => { const sh = new T.Shape(); sh.moveTo(-0.13, 0); sh.lineTo(0.13, 0); sh.lineTo(0, 0.4); sh.lineTo(-0.13, 0);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: false }); g.translate(0, 0, -0.4); g.rotateY(PI / 2);
    return [P(cyl(0.44, 0.08, 6), '#8d96a3', [0, 0.04, 0], [0, PI / 6, 0], 'hull'), P(new T.TorusGeometry(0.42, 0.035, 6, 6), '#ff8a2a', [0, 0.085, 0], [PI / 2, 0, PI / 6], 'body'),
      P(g, '#e9edf2', [0, 0.08, 0], null, 'body'), P(rbox(0.8, 0.035, 0.05, 0.015), '#ffffff', [0, 0.485, 0], null, 'lamp'),
      ...[-0.42, 0.42].map(x => P(sph(0.1, 16), '#b9c1cc', [x, 0.2, 0], null, 'metal'))]; };
  ART.emitter = () => [P(rbox(0.14, 0.56, 0.14, 0.05), '#d9dee6', [0, 0.28, 0], null, 'body'), P(rbox(0.16, 0.06, 0.16, 0.02), '#ff8a2a', [0, 0.5, 0], null, 'body'),
    P(sph(0.085, 12), '#ffffff', [0, 0.6, 0], null, 'lamp'), P(cyl(0.11, 0.06, 14), '#5a626e', [0, 0.03, 0], null, 'hull')];
}
function mats(){}
// Окружение для бликов: светлая «студия» с мягкими панелями — белые панели модулей читаются чистыми, металл колец бликует
function env(){
  const s = new T.Scene(), box = new T.BoxGeometry(1, 1, 1);
  s.add(new T.Mesh(new T.BoxGeometry(20, 12, 20), new T.MeshBasicMaterial({ color: '#1b2233', side: T.BackSide })));
  const light = (col, int, pos, sc) => { const m = new T.Mesh(box, new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(int) })); m.position.set(...pos); m.scale.set(...sc); s.add(m); };
  light('#ffffff', 4.5, [-2, 5.8, 1], [9, 0.2, 3]);
  light('#dfe8ff', 2.2, [3, 5.8, -3], [6, 0.2, 2]);
  light('#7fd6ff', 2.0, [0, 2, -9.6], [12, 3, 0.2]);
  light('#ffd2a0', 0.9, [0, 1.5, 9.6], [10, 2, 0.2]);
  return s;
}
// Свет: небо-полушарие (светлые панели не проваливаются в черноту), ключ тёплый белый сверху-слева, голубой контровой «сверху экрана»
// (кромки колец), слабая заливка справа
function lights(scene){
  scene.add(new T.HemisphereLight('#dfe8ff', '#1a2238', 1.05));
  const key = new T.DirectionalLight('#fff6ea', 2.3); key.position.set(-5, 9, 5); scene.add(key);
  const rim = new T.DirectionalLight('#7fd2ff', 1.5); rim.position.set(1, 3, -8); scene.add(rim);
  const fill = new T.DirectionalLight('#b8c8ff', 0.5); fill.position.set(7, 4, 2); scene.add(fill);
}
R3.hw = { V, HW, GEO, load, arts, mats, env, lights, exposure: 1.0, ghosts: [], loaded: false };
})();
