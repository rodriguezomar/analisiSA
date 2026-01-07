/* Utilidades de parseo y estadística */
function parseTextToXY(text) {
  const lines = text.split(/\r?\n/);
  const data = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line
      .split(/[,\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    data.push({ x, y });
  }
  return data;
}

function extent(arr, key) {
  let min = Infinity,
    max = -Infinity;
  for (const v of arr) {
    const val = v[key];
    if (val < min) min = val;
    if (val > max) max = val;
  }
  return [min, max];
}

function normalizeY(data) {
  const [minY, maxY] = extent(data, "y");
  const span = maxY - minY || 1;
  return data.map((p) => ({ x: p.x, y: (p.y - minY) / span }));
}

/* Savitzky–Golay simple (ventana impar, polinomio grado 2) */
function savitzkyGolay(y, window = 7) {
  const n = y.length;
  if (window < 3 || window % 2 === 0 || window > 51) return y.slice();
  const half = (window - 1) / 2;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - half);
    const i1 = Math.min(n - 1, i + half);
    const m = i1 - i0 + 1;
    const t = [];
    const yy = [];
    for (let j = i0; j <= i1; j++) {
      const tj = j - i;
      t.push(tj);
      yy.push(y[j]);
    }
    let S0 = m,
      S1 = 0,
      S2 = 0,
      S3 = 0,
      S4 = 0;
    let Ty0 = 0,
      Ty1 = 0,
      Ty2 = 0;
    for (let k = 0; k < m; k++) {
      const tk = t[k],
        yk = yy[k];
      const tk2 = tk * tk;
      S1 += tk;
      S2 += tk2;
      S3 += tk2 * tk;
      S4 += tk2 * tk2;
      Ty0 += yk;
      Ty1 += yk * tk;
      Ty2 += yk * tk2;
    }
    function solve3(A, b) {
      const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = A;
      const det =
        a00 * (a11 * a22 - a12 * a21) -
        a01 * (a10 * a22 - a12 * a20) +
        a02 * (a10 * a21 - a11 * a20);
      if (Math.abs(det) < 1e-12) return [b[0] / S0, 0, 0];
      const inv = [
        (a11 * a22 - a12 * a21) / det,
        (a02 * a21 - a01 * a22) / det,
        (a01 * a12 - a02 * a11) / det,
        (a12 * a20 - a10 * a22) / det,
        (a00 * a22 - a02 * a20) / det,
        (a02 * a10 - a00 * a12) / det,
        (a10 * a21 - a11 * a20) / det,
        (a01 * a20 - a00 * a21) / det,
        (a00 * a11 - a01 * a10) / det
      ];
      return [
        inv[0] * b[0] + inv[1] * b[1] + inv[2] * b[2],
        inv[3] * b[0] + inv[4] * b[1] + inv[5] * b[2],
        inv[6] * b[0] + inv[7] * b[1] + inv[8] * b[2]
      ];
    }
    const [a] = solve3([S0, S1, S2, S1, S2, S3, S2, S3, S4], [Ty0, Ty1, Ty2]);
    out[i] = a;
  }
  return out;
}

/* Plot: canvas 2D con zoom/pan */
const canvas = document.getElementById("plot");
const ctx = canvas.getContext("2d");
let dataRaw = [];
let dataView = [];
let xDomain = [0, 1],
  yDomain = [0, 1];
let viewport = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
let dragging = false;
let dragStart = null;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
window.addEventListener("resize", resizeCanvas);

function setMessage(msg) {
  document.getElementById("msg").textContent = msg || "";
}

function applyTransforms() {
  const invertX = document.getElementById("invertX").checked;
  const normalize = document.getElementById("normalizeY").checked;
  const smoothLevel = Number(document.getElementById("smooth").value);

  let d = dataRaw.slice();
  if (normalize) d = normalizeY(d);

  if (invertX) {
    const [minX, maxX] = extent(d, "x");
    d = d
      .map((p) => ({ x: maxX + minX - p.x, y: p.y }))
      .sort((a, b) => a.x - b.x);
  } else {
    d.sort((a, b) => a.x - b.x);
  }

  if (smoothLevel > 0 && d.length > 5) {
    const window = 2 * Math.floor(smoothLevel / 2) + 3; // impar
    const y = d.map((p) => p.y);
    const ys = savitzkyGolay(y, window);
    d = d.map((p, i) => ({ x: p.x, y: ys[i] }));
  }

  dataView = d;
  xDomain = extent(d, "x");
  yDomain = extent(d, "y");
  viewport = {
    xMin: xDomain[0],
    xMax: xDomain[1],
    yMin: yDomain[0],
    yMax: yDomain[1]
  };

  document.getElementById("nPoints").textContent = String(d.length);
  document.getElementById("xRange").textContent = `${xDomain[0].toFixed(
    3
  )} – ${xDomain[1].toFixed(3)} cm⁻¹`;
  document.getElementById("yRange").textContent = `${yDomain[0].toFixed(
    6
  )} – ${yDomain[1].toFixed(6)} a.u.`;

  document.getElementById("reset").disabled = d.length === 0;
  document.getElementById("exportPNG").disabled = d.length === 0;

  // Exponer los datos al window y emitir evento
  window.dataView = dataView;
  window.dispatchEvent(
    new CustomEvent("spectrum:update", { detail: { dataView } })
  );

  draw();
}

function toScreen(x, y) {
  const padding = { left: 60, right: 20, top: 20, bottom: 36 };
  const W = canvas.clientWidth,
    H = canvas.clientHeight;
  const xs =
    padding.left +
    ((x - viewport.xMin) * (W - padding.left - padding.right)) /
      (viewport.xMax - viewport.xMin);
  const ys =
    padding.top +
    ((viewport.yMax - y) * (H - padding.top - padding.bottom)) /
      (viewport.yMax - viewport.yMin);
  return [xs, ys];
}

function toData(xs, ys) {
  const padding = { left: 60, right: 20, top: 20, bottom: 36 };
  const W = canvas.clientWidth,
    H = canvas.clientHeight;
  const x =
    viewport.xMin +
    ((xs - padding.left) * (viewport.xMax - viewport.xMin)) /
      (W - padding.left - padding.right);
  const y =
    viewport.yMax -
    ((ys - padding.top) * (viewport.yMax - viewport.yMin)) /
      (H - padding.top - padding.bottom);
  return [x, y];
}

function drawGrid() {
  const W = canvas.clientWidth,
    H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0d16";
  ctx.fillRect(0, 0, W, H);

  const padding = { left: 60, right: 20, top: 20, bottom: 36 };
  ctx.strokeStyle = "#1b2338";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    padding.left,
    padding.top,
    W - padding.left - padding.right,
    H - padding.top - padding.bottom
  );

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(
    "--grid"
  );
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  const ticksX = 8,
    ticksY = 6;
  for (let i = 1; i < ticksX; i++) {
    const t = viewport.xMin + (i * (viewport.xMax - viewport.xMin)) / ticksX;
    const [xs] = toScreen(t, viewport.yMin);
    ctx.beginPath();
    ctx.moveTo(xs, padding.top);
    ctx.lineTo(xs, H - padding.bottom);
    ctx.stroke();
  }
  for (let i = 1; i < ticksY; i++) {
    const t = viewport.yMin + (i * (viewport.yMax - viewport.yMin)) / ticksY;
    const [, ys] = toScreen(viewport.xMin, t);
    ctx.beginPath();
    ctx.moveTo(padding.left, ys);
    ctx.lineTo(W - padding.right, ys);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(
    "--axis"
  );
  ctx.font = "12px system-ui";
  for (let i = 0; i <= ticksX; i++) {
    const t = viewport.xMin + (i * (viewport.xMax - viewport.xMin)) / ticksX;
    const [xs] = toScreen(t, viewport.yMin);
    ctx.fillText(t.toFixed(0), xs - 10, H - 16);
  }
  for (let i = 0; i <= ticksY; i++) {
    const t = viewport.yMin + (i * (viewport.yMax - viewport.yMin)) / ticksY;
    const [, ys] = toScreen(viewport.xMin, t);
    ctx.fillText(t.toFixed(3), 8, ys + 4);
  }
}

function drawLine() {
  if (dataView.length === 0) return;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(
    "--line"
  );
  ctx.lineWidth = 2;
  ctx.beginPath();
  let first = true;
  for (const p of dataView) {
    if (
      p.x < viewport.xMin ||
      p.x > viewport.xMax ||
      p.y < viewport.yMin ||
      p.y > viewport.yMax
    )
      continue;
    const [xs, ys] = toScreen(p.x, p.y);
    if (first) {
      ctx.moveTo(xs, ys);
      first = false;
    } else {
      ctx.lineTo(xs, ys);
    }
  }
  ctx.stroke();
}

function drawPeaks(peaks) {
  if (!peaks || peaks.length === 0) return;
  ctx.fillStyle = "#67b0ff";
  ctx.strokeStyle = "#67b0ff";
  ctx.font = "11px system-ui";
  for (const p of peaks) {
    const [xs, ys] = toScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(xs, ys, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillText(
      `${p.x.toFixed(0)} cm⁻¹ · prom ${p.prom.toFixed(3)}`,
      xs + 6,
      ys - 6
    );
  }
}

function draw() {
  drawGrid();
  drawLine();
  if (window.__peaks) drawPeaks(window.__peaks);
}

function zoom(factor, centerX, centerY) {
  const xSpan = (viewport.xMax - viewport.xMin) * factor;
  const ySpan = (viewport.yMax - viewport.yMin) * factor;
  viewport.xMin = centerX - xSpan * 0.5;
  viewport.xMax = centerX + xSpan * 0.5;
  viewport.yMin = centerY - ySpan * 0.5;
  viewport.yMax = centerY + ySpan * 0.5;
  draw();
}

function pan(dx, dy) {
  viewport.xMin += dx;
  viewport.xMax += dx;
  viewport.yMin += dy;
  viewport.yMax += dy;
  draw();
}

/* Eventos de UI */
document.getElementById("file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseTextToXY(text);
  if (parsed.length === 0) {
    setMessage(
      "No se pudieron leer pares válidos. Verifica separadores y formato."
    );
    return;
  }
  setMessage("");
  dataRaw = parsed;
  applyTransforms();
});

const drop = document.getElementById("drop");
["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  })
);
drop.addEventListener("drop", async (e) => {
  const file = e.dataTransfer.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseTextToXY(text);
  if (parsed.length === 0) {
    setMessage(
      "No se pudieron leer pares válidos. Verifica separadores y formato."
    );
    return;
  }
  setMessage("");
  dataRaw = parsed;
  applyTransforms();
});

document.getElementById("invertX").addEventListener("change", applyTransforms);
document
  .getElementById("normalizeY")
  .addEventListener("change", applyTransforms);
document.getElementById("smooth").addEventListener("input", (e) => {
  document.getElementById("smoothLabel").textContent = e.target.value;
});
document.getElementById("smooth").addEventListener("change", applyTransforms);

document.getElementById("reset").addEventListener("click", () => {
  viewport = {
    xMin: xDomain[0],
    xMax: xDomain[1],
    yMin: yDomain[0],
    yMax: yDomain[1]
  };
  draw();
});

document.getElementById("exportPNG").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "ftir.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

/* Interacción canvas */
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  viewport = {
    xMin: xDomain[0],
    xMax: xDomain[1],
    yMin: yDomain[0],
    yMax: yDomain[1]
  };
  draw();
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const [x, y] = toData(e.clientX - rect.left, e.clientY - rect.top);
    const factor = e.deltaY < 0 ? 0.85 : 1.15;
    zoom(factor, x, y);
  },
  { passive: false }
);

canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
});
window.addEventListener("mouseup", () => {
  dragging = false;
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  dragStart = { x: e.clientX, y: e.clientY };
  const W = canvas.clientWidth,
    H = canvas.clientHeight;
  const padding = { left: 60, right: 20, top: 20, bottom: 36 };
  const xScale =
    (viewport.xMax - viewport.xMin) / (W - padding.left - padding.right);
  const yScale =
    (viewport.yMax - viewport.yMin) / (H - padding.top - padding.bottom);
  pan(-dx * xScale, dy * yScale);
});

/* Inicializar */
resizeCanvas();

/* Precarga: ejemplo pequeño (opcional, puedes borrar) */
const exampleText = `5.250337e+002, 5.685473e-001
5.255158e+002, 5.689292e-001
5.259979e+002, 5.694290e-001
5.264800e+002, 5.699241e-001
5.269622e+002, 5.702962e-001
5.274443e+002, 5.704758e-001
5.279265e+002, 5.704607e-001
5.284086e+002, 5.703055e-001
5.288907e+002, 5.700956e-001
5.293728e+002, 5.699168e-001
5.298549e+002, 5.698392e-001
5.303370e+002, 5.699114e-001
5.308192e+002, 5.701658e-001
5.313013e+002, 5.706203e-001
5.317834e+002, 5.712718e-001
5.322656e+002, 5.720825e-001
5.327477e+002, 5.729721e-001
5.332298e+002, 5.738221e-001
5.337119e+002, 5.745028e-001
5.341940e+002, 5.749114e-001
5.346762e+002, 5.750802e-001
5.351583e+002, 5.748267e-001
5.356404e+002, 5.744575e-001
5.361225e+002, 5.740802e-001
5.366047e+002, 5.735469e-001
5.370868e+002, 5.731717e-001
5.375689e+002, 5.726605e-001
5.380510e+002, 5.721627e-001`;
dataRaw = parseTextToXY(exampleText);
applyTransforms();

// --- Bandas objetivo para GO/grafeno ---
const bands = [
  { name: "O–H (ancho)", range: [3200, 3550], class: "GO" },
  { name: "O–H ácido", range: [2500, 3300], class: "GO" },
  { name: "C=O (carbonilo)", range: [1700, 1750], class: "GO" },
  { name: "Aromático C=C", range: [1580, 1620], class: "sp2" },
  { name: "C–O (fenólico)", range: [1220, 1260], class: "GO" },
  { name: "Epoxi C–O–C", range: [1050, 1150], class: "GO" },
  { name: "C–H aromático", range: [3050, 3100], class: "sp2" }
];

// --- Utilidades numéricas ---
function normalize01(arr) {
  const min = Math.min(...arr),
    max = Math.max(...arr);
  const span = Math.max(1e-12, max - min);
  return arr.map((v) => (v - min) / span);
}
function median(a) {
  if (!a.length) return 0;
  const b = a.slice().sort((x, y) => x - y);
  const m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : 0.5 * (b[m - 1] + b[m]);
}
function smoothByCm(x, y, windowCm) {
  const n = y.length,
    out = new Array(n);
  for (let i = 0; i < n; i++) {
    const x0 = x[i] - windowCm / 2,
      x1 = x[i] + windowCm / 2;
    let s = 0,
      c = 0;
    for (let j = i; j >= 0 && x[j] >= x0; j--) {
      s += y[j];
      c++;
    }
    for (let j = i + 1; j < n && x[j] <= x1; j++) {
      s += y[j];
      c++;
    }
    out[i] = c ? s / c : y[i];
  }
  return out;
}
function derivative1(x, y) {
  const n = y.length,
    dy = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dx = Math.max(1e-12, x[i] - x[i - 1]);
    dy[i] = (y[i] - y[i - 1]) / dx;
  }
  return dy;
}
function derivative2(x, y) {
  const n = y.length,
    d2 = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const dx1 = Math.max(1e-12, x[i] - x[i - 1]);
    const dx2 = Math.max(1e-12, x[i + 1] - x[i]);
    const d1 = (y[i] - y[i - 1]) / dx1;
    const d2n = (y[i + 1] - y[i]) / dx2;
    const dxm = 0.5 * (dx1 + dx2);
    d2[i] = (d2n - d1) / dxm;
  }
  return d2;
}

// --- Filtro casado (gaussiano) ---
function gaussianKernel(x, center, fwhm) {
  const sigma = fwhm / (2 * Math.sqrt(2 * Math.log(2)));
  return Math.exp(-0.5 * Math.pow((x - center) / sigma, 2));
}
function matchedFilterResponse(x, y, fwhm) {
  const n = y.length,
    resp = new Array(n).fill(0);
  const sigma = fwhm / (2 * Math.sqrt(2 * Math.log(2)));
  const span = 3 * sigma;
  for (let i = 0; i < n; i++) {
    const x0 = x[i] - span,
      x1 = x[i] + span;
    let s = 0,
      c = 0;
    const maxNeighbors = 400;
    const j0 = Math.max(0, i - maxNeighbors);
    const j1 = Math.min(n, i + maxNeighbors);
    for (let j = j0; j < j1; j++) {
      if (x[j] < x0 || x[j] > x1) continue;
      const k = gaussianKernel(x[j], x[i], fwhm);
      s += y[j] * k;
      c += k;
    }
    resp[i] = c ? s / c : 0;
  }
  const min = Math.min(...resp),
    max = Math.max(...resp),
    spanR = Math.max(1e-12, max - min);
  return resp.map((v) => (v - min) / spanR);
}

// --- Baseline correction (polinomio grado 2) ---
function polyFit2(x, y) {
  const n = x.length;
  let S0 = n,
    S1 = 0,
    S2 = 0,
    S3 = 0,
    S4 = 0;
  let Ty0 = 0,
    Ty1 = 0,
    Ty2 = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i],
      yi = y[i],
      xi2 = xi * xi,
      xi3 = xi2 * xi,
      xi4 = xi2 * xi2;
    S1 += xi;
    S2 += xi2;
    S3 += xi3;
    S4 += xi4;
    Ty0 += yi;
    Ty1 += yi * xi;
    Ty2 += yi * xi2;
  }
  const A = [S0, S1, S2, S1, S2, S3, S2, S3, S4];
  const b = [Ty0, Ty1, Ty2];
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = A;
  const det =
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20);
  if (Math.abs(det) < 1e-14) return [0, 0, 0];
  const inv = [
    (a11 * a22 - a12 * a21) / det,
    (a02 * a21 - a01 * a22) / det,
    (a01 * a12 - a02 * a11) / det,
    (a12 * a20 - a10 * a22) / det,
    (a00 * a22 - a02 * a20) / det,
    (a02 * a10 - a00 * a12) / det,
    (a10 * a21 - a11 * a20) / det,
    (a01 * a20 - a00 * a21) / det,
    (a00 * a11 - a01 * a10) / det
  ];
  const a = inv[0] * b[0] + inv[1] * b[1] + inv[2] * b[2];
  const b1 = inv[3] * b[0] + inv[4] * b[1] + inv[5] * b[2];
  const c = inv[6] * b[0] + inv[7] * b[1] + inv[8] * b[2];
  return [a, b1, c];
}
function evalPoly2(a, b, c, x) {
  return a + b * x + c * x * x;
}
function correctBaselineData(data, opts = {}) {
  const x = data.map((p) => p.x);
  const y = data.map((p) => p.y);
  // Opcional: excluir bandas objetivo para no sesgar el baseline
  const excludeBands = opts.excludeBands || [];
  const mask = x.map(() => true);
  for (let i = 0; i < x.length; i++) {
    for (const b of excludeBands) {
      if (x[i] >= b.range[0] && x[i] <= b.range[1]) {
        mask[i] = false;
        break;
      }
    }
  }
  const xUsed = [],
    yUsed = [];
  for (let i = 0; i < x.length; i++)
    if (mask[i]) {
      xUsed.push(x[i]);
      yUsed.push(y[i]);
    }
  const [a, b, c] =
    xUsed.length >= 20 ? polyFit2(xUsed, yUsed) : polyFit2(x, y);
  const yBase = x.map((xi) => evalPoly2(a, b, c, xi));
  const corrected = data.map((p, i) => ({ x: p.x, y: p.y - yBase[i] }));
  return { corrected, baseline: yBase, coeffs: [a, b, c] };
}

// --- Residual signal (solo picos) ---
function residualSignal(data, windowCm = 100) {
  const x = data.map((p) => p.x);
  const y = data.map((p) => p.y);
  const smooth = smoothByCm(x, y, windowCm);
  const resid = y.map((yi, i) => yi - smooth[i]);
  return data.map((p, i) => ({ x: p.x, y: resid[i] }));
}

// --- Mini-fits (Gauss/Lorentz) ---
function initialPeakGuess(xs, ys) {
  const maxY = Math.max(...ys);
  const iMax = ys.indexOf(maxY);
  const pos = xs[iMax];
  const half = maxY * 0.5;
  let l = pos,
    r = pos;
  for (let i = 0; i < ys.length; i++)
    if (ys[i] >= half) {
      l = xs[i];
      break;
    }
  for (let i = ys.length - 1; i >= 0; i--)
    if (ys[i] >= half) {
      r = xs[i];
      break;
    }
  const fwhm = Math.max(1e-6, r - l);
  return { pos, height: maxY, fwhm };
}
function fitGaussian(xs, ys, guess) {
  const mu = guess.pos;
  const A = guess.height;
  const sigma = Math.max(1e-6, guess.fwhm / (2 * Math.sqrt(2 * Math.log(2))));
  const area = A * sigma * Math.sqrt(2 * Math.PI);
  const fwhm = 2 * Math.sqrt(2 * Math.log(2)) * sigma;
  return { pos: mu, height: A, fwhm, area, kind: "Gauss" };
}
function fitLorentz(xs, ys, guess) {
  const x0 = guess.pos;
  const A = guess.height;
  const gamma = Math.max(1e-6, guess.fwhm / 2);
  const area = Math.PI * A * gamma;
  const fwhm = 2 * gamma;
  return { pos: x0, height: A, fwhm, area, kind: "Lorentz" };
}
function miniFitsForPeak(data, peak, opts = {}) {
  const x = data.map((p) => p.x);
  const y = data.map((p) => p.y);
  const wCm = opts.windowCm || 40;
  const x0 = peak.x - wCm / 2,
    x1 = peak.x + wCm / 2;
  const xs = [],
    ys = [];
  for (let i = 0; i < x.length; i++)
    if (x[i] >= x0 && x[i] <= x1) {
      xs.push(x[i]);
      ys.push(y[i]);
    }
  if (xs.length < 7) return null;
  const guess = initialPeakGuess(xs, ys);
  const g = fitGaussian(xs, ys, guess);
  const l = fitLorentz(xs, ys, guess);
  // Selección simple por SSE
  const sseG = ys.reduce((s, yi, i) => {
    const sigma = g.fwhm / (2 * Math.sqrt(2 * Math.log(2)));
    const yhat =
      g.height * Math.exp(-0.5 * Math.pow((xs[i] - g.pos) / sigma, 2));
    return s + (yi - yhat) ** 2;
  }, 0);
  const sseL = ys.reduce((s, yi, i) => {
    const gamma = l.fwhm / 2;
    const yhat = l.height / (1 + Math.pow((xs[i] - l.pos) / gamma, 2));
    return s + (yi - yhat) ** 2;
  }, 0);
  const best = sseG <= sseL ? g : l;
  return best;
}

// --- Detectores ---
// Robusto (prominencia/anchura)
function detectPeaksRobust(data, opts = {}) {
  const x = data.map((p) => p.x),
    y = data.map((p) => p.y),
    n = y.length;
  if (n < 5) return [];
  const xr = opts.xRange || [Math.min(...x), Math.max(...x)];
  const mask = x.map((v) => v >= xr[0] && v <= xr[1]);
  const dxs = [];
  for (let i = 1; i < n; i++)
    if (mask[i] && mask[i - 1]) dxs.push(Math.abs(x[i] - x[i - 1]));
  const dxMed = Math.max(1e-9, median(dxs));
  const ptsPerPeakAuto = Math.max(7, Math.floor(n * 0.002));
  const ptsPerPeak =
    Number.isFinite(opts.ptsPerPeak) && opts.ptsPerPeak > 3
      ? opts.ptsPerPeak
      : ptsPerPeakAuto;
  const winCm = ptsPerPeak * dxMed;
  const ys = smoothByCm(x, y, winCm);
  const yN = normalize01(ys);
  const dy = derivative1(x, yN);

  const candidates = [];
  for (let i = 1; i < n - 1; i++) {
    if (!mask[i]) continue;
    if (dy[i - 1] > 0 && dy[i] <= 0) {
      let l = i - 1,
        r = i + 1;
      while (l > 0 && yN[l - 1] <= yN[l]) l--;
      while (r < n - 1 && yN[r + 1] <= yN[r]) r++;
      const base = Math.max(yN[l], yN[r]);
      const prom = yN[i] - base;
      const widthX = Math.abs(x[r] - x[l]);
      candidates.push({ x: x[i], y: ys[i], prom, idx: i, widthX });
    }
  }
  const promArray = candidates.map((c) => c.prom);
  const promMed = promArray.length
    ? promArray.reduce((a, b) => a + b, 0) / promArray.length
    : 0;
  const promMin =
    Number.isFinite(opts.minProm) && opts.minProm > 0
      ? opts.minProm
      : Math.max(0.008, promMed * 0.6);
  const minDistPts =
    Number.isFinite(opts.minDist) && opts.minDist > 0
      ? opts.minDist
      : Math.max(5, Math.floor(ptsPerPeak));
  const minWidthX =
    Number.isFinite(opts.minWidthX) && opts.minWidthX > 0 ? opts.minWidthX : 8;

  let peaks = candidates.filter(
    (c) => c.prom >= promMin && c.widthX >= minWidthX
  );
  peaks.sort((a, b) => b.prom - a.prom);
  const kept = [];
  for (const p of peaks) {
    if (kept.every((k) => Math.abs(k.idx - p.idx) >= minDistPts)) kept.push(p);
  }
  kept.sort((a, b) => a.x - b.x);
  return kept;
}

// Derivadas + filtro casado (picos pequeños)
function detectPeaksDerivativeAndMF(data, opts = {}) {
  const x = data.map((p) => p.x),
    y = data.map((p) => p.y),
    n = y.length;
  if (n < 5) return [];
  const xr = opts.xRange || [Math.min(...x), Math.max(...x)];
  const mask = x.map((v) => v >= xr[0] && v <= xr[1]);

  const preWin = Number.isFinite(opts.preSmoothCm) ? opts.preSmoothCm : 12;
  const ys = smoothByCm(x, y, preWin);

  const yN = normalize01(ys);
  const dy = derivative1(x, yN);
  const d2 = derivative2(x, yN);

  const fwhm = Number.isFinite(opts.fwhm) ? opts.fwhm : 18;
  const mf = matchedFilterResponse(x, yN, fwhm);

  const curvThresh = Number.isFinite(opts.curvThresh)
    ? opts.curvThresh
    : -0.002;
  const mfThresh = Number.isFinite(opts.mfThresh) ? opts.mfThresh : 0.25;
  const minWidthX = Number.isFinite(opts.minWidthX) ? opts.minWidthX : 6;

  const candidates = [];
  for (let i = 1; i < n - 1; i++) {
    if (!mask[i]) continue;
    const zero = dy[i - 1] > 0 && dy[i] <= 0;
    if (zero && d2[i] < curvThresh && mf[i] >= mfThresh) {
      let l = i - 1,
        r = i + 1;
      while (l > 0 && yN[l - 1] <= yN[l]) l--;
      while (r < n - 1 && yN[r + 1] <= yN[r]) r++;
      const base = Math.max(yN[l], yN[r]);
      const prom = yN[i] - base;
      const widthX = Math.abs(x[r] - x[l]);
      if (widthX >= minWidthX)
        candidates.push({ x: x[i], y: ys[i], prom, idx: i, widthX, mf: mf[i] });
    }
  }
  const promMed = candidates.length
    ? candidates.reduce((a, b) => a + b.prom, 0) / candidates.length
    : 0;
  const promMin = Number.isFinite(opts.minProm)
    ? opts.minProm
    : Math.max(0.006, promMed * 0.5);

  let peaks = candidates.filter((c) => c.prom >= promMin);
  const minSep = Number.isFinite(opts.minSepCm)
    ? opts.minSepCm
    : Math.max(6, fwhm * 0.6);
  peaks.sort((a, b) => b.prom - a.prom);
  const kept = [];
  for (const p of peaks) {
    if (kept.every((k) => Math.abs(k.x - p.x) >= minSep)) kept.push(p);
  }
  kept.sort((a, b) => a.x - b.x);
  return kept;
}

// --- Match + veredicto ---
function matchBands(peaks, ranges) {
  return ranges.map((b) => {
    const hits = peaks.filter((p) => p.x >= b.range[0] && p.x <= b.range[1]);
    const best = hits.length
      ? hits.reduce((m, p) => (p.prom > m.prom ? p : m), hits[0])
      : null;
    return { band: b, hit: best };
  });
}
function decidePresence(matches) {
  const hasGO = matches.some(
    (m) => m.band.class === "GO" && m.hit && m.hit.prom >= 0.03
  );
  const hasAro = matches.some(
    (m) => m.band.class === "sp2" && m.hit && m.hit.prom >= 0.02
  );
  if (hasGO && hasAro)
    return "GO (oxigenada) presente; evalúa rGO si C=O/C–O/epoxi disminuyen tras reducción";
  if (hasGO) return "GO (oxigenada) con O–H/C=O/C–O/epoxi detectables";
  if (!hasGO && hasAro)
    return "Grafeno/grafito poco funcionalizado (oxigenadas ausentes o débiles en FTIR)";
  return "Indeterminado por FTIR; confirma con Raman/XPS";
}

// --- UI y flujo ---
(function attachUI() {
  const panel = document.createElement("div");
  panel.className = "box";
  panel.innerHTML = `
    <h3>Detección de picos (FTIR)</h3>
    <div class="stat"><strong>Modo:</strong>
      <select id="peakMode">
        <option value="robust">Robusto (prominencia/anchura)</option>
        <option value="deriv" selected>Derivadas + filtro casado</option>
      </select>
    </div>
    <div class="stat"><strong>Rango X analizado:</strong>
      <input id="xMin" type="number" step="1" value="400" style="width:80px" /> –
      <input id="xMax" type="number" step="1" value="4000" style="width:80px" /> cm⁻¹
    </div>
    <div class="stat"><strong>Prominencia mínima:</strong> <input id="promMin" type="number" step="0.005" value="" placeholder="auto" style="width:90px" /> a.u. (norm.)</div>
    <div class="stat"><strong>Distancia mínima (puntos, robusto):</strong> <input id="distMin" type="number" step="1" value="" placeholder="auto" style="width:90px" /></div>
    <div class="stat"><strong>Anchura mínima (cm⁻¹):</strong> <input id="minWidthX" type="number" step="1" value="8" style="width:90px" /></div>
    <div class="stat"><strong>Pts por pico (robusto):</strong> <input id="ptsPerPeak" type="number" step="1" value="" placeholder="auto" style="width:90px" /></div>
    <div class="stat"><strong>FWHM objetivo (deriv):</strong> <input id="fwhm" type="number" step="1" value="18" style="width:90px" /></div>
    <div class="stat"><strong>Suavizado previo (cm⁻¹, deriv):</strong> <input id="preSmoothCm" type="number" step="1" value="12" style="width:90px" /></div>
    <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
      <button id="runPeaks" class="btn">Identificar picos</button>
      <button id="applyBaseline" class="btn">Corregir baseline</button>
      <button id="runFits" class="btn">Ajustar picos (mini-fits)</button>
      <button id="toggleResidue" class="btn">Ver solo picos (residuo)</button>
    </div>
    <div id="peaksOut" class="stat" style="margin-top:8px"></div>
    <div id="fitsOut" class="stat" style="margin-top:8px"></div>
  `;
  document.querySelector("aside").appendChild(panel);

  let dv = Array.isArray(window.dataView) ? window.dataView : [];
  let residueMode = false;

  // Escuchar espectro desde app.js
  window.addEventListener("spectrum:update", (e) => {
    dv = e.detail?.dataView || [];
    window.__peaks = null;
    draw();
    document.getElementById("fitsOut").innerHTML = "";
  });

  function runDetection() {
    if (!dv || dv.length < 5) {
      document.getElementById("peaksOut").textContent =
        "No hay datos suficientes.";
      return;
    }
    const mode = document.getElementById("peakMode").value;
    const promMin = Number(document.getElementById("promMin").value);
    const distMin = Number(document.getElementById("distMin").value);
    const minWidthX = Number(document.getElementById("minWidthX").value);
    const ptsPerPeak = Number(document.getElementById("ptsPerPeak").value);
    const fwhm = Number(document.getElementById("fwhm").value);
    const preSmoothCm = Number(document.getElementById("preSmoothCm").value);
    const xMin = Number(document.getElementById("xMin").value);
    const xMax = Number(document.getElementById("xMax").value);

    const opts = {
      minProm: Number.isFinite(promMin) && promMin > 0 ? promMin : undefined,
      minDist: Number.isFinite(distMin) && distMin > 0 ? distMin : undefined,
      minWidthX: Number.isFinite(minWidthX) && minWidthX > 0 ? minWidthX : 8,
      ptsPerPeak:
        Number.isFinite(ptsPerPeak) && ptsPerPeak > 3 ? ptsPerPeak : undefined,
      fwhm: Number.isFinite(fwhm) && fwhm > 2 ? fwhm : 18,
      preSmoothCm:
        Number.isFinite(preSmoothCm) && preSmoothCm > 0 ? preSmoothCm : 12,
      xRange:
        Number.isFinite(xMin) && Number.isFinite(xMax) && xMax > xMin
          ? [xMin, xMax]
          : undefined
    };

    const peaks =
      mode === "deriv"
        ? detectPeaksDerivativeAndMF(dv, opts)
        : detectPeaksRobust(dv, opts);

    const matches = matchBands(peaks, bands);
    const verdict = decidePresence(matches);

    window.__peaks = peaks;
    draw();

    const lines = [];
    lines.push(`<strong>Veredicto:</strong> ${verdict}`);
    lines.push(`<strong>Picos detectados:</strong> ${peaks.length}`);

    const inBands = peaks.filter((p) =>
      bands.some((b) => p.x >= b.range[0] && p.x <= b.range[1])
    );
    const listTop = (mode === "deriv" && inBands.length
      ? inBands
      : peaks
    ).slice(0, 10);
    if (listTop.length) {
      lines.push("<strong>Top picos:</strong>");
      for (const p of listTop) {
        lines.push(
          `• ${p.x.toFixed(1)} cm⁻¹ (prom. ${p.prom.toFixed(3)}, ancho ~${
            p.widthX?.toFixed?.(1) ?? "-"
          } cm⁻¹)`
        );
      }
    }

    lines.push("<strong>Bandas objetivo:</strong>");
    for (const m of matches) {
      const rng = `${m.band.range[0]}–${m.band.range[1]} cm⁻¹`;
      const txt = m.hit
        ? `✓ ${m.band.name} (${rng}) pico en ${m.hit.x.toFixed(
            1
          )} cm⁻¹ (prom. ${m.hit.prom.toFixed(3)})`
        : `— ${m.band.name} (${rng}) no detectada`;
      lines.push(txt);
    }

    document.getElementById("peaksOut").innerHTML = lines
      .map((s) => `<div class="stat">${s}</div>`)
      .join("");
    document.getElementById("fitsOut").innerHTML = "";
  }

  function applyBaseline() {
    if (!dv || dv.length < 5) {
      document.getElementById("peaksOut").textContent =
        "No hay datos suficientes.";
      return;
    }
    const { corrected } = correctBaselineData(dv, { excludeBands: bands });
    window.dataView = corrected;
    dv = corrected;
    window.dispatchEvent(
      new CustomEvent("spectrum:update", { detail: { dataView: corrected } })
    );
    window.__peaks = null;
    draw();

    const msg = `<strong>Baseline:</strong> corregido (poli-2). Puntos: ${dv.length}.`;
    document.getElementById(
      "peaksOut"
    ).innerHTML = `<div class="stat">${msg}</div>`;
    document.getElementById("fitsOut").innerHTML = "";
  }

  function runFits() {
    if (!dv || dv.length < 5) {
      document.getElementById("fitsOut").textContent =
        "No hay datos suficientes.";
      return;
    }
    const peaks = window.__peaks || [];
    if (!peaks.length) {
      document.getElementById("fitsOut").textContent =
        "No hay picos para ajustar. Ejecuta “Identificar picos” primero.";
      return;
    }
    const results = [];
    for (const p of peaks) {
      const fit = miniFitsForPeak(dv, p, { windowCm: 40 });
      if (fit) {
        results.push({
          x: p.x,
          kind: fit.kind,
          pos: fit.pos,
          height: fit.height,
          fwhm: fit.fwhm,
          area: fit.area
        });
      }
    }
    if (!results.length) {
      document.getElementById("fitsOut").textContent =
        "No se pudieron ajustar picos (ventanas insuficientes o señal débil).";
      return;
    }
    const lines = [];
    lines.push("<strong>Mini-fits (Gauss/Lorentz, ventana ~40 cm⁻¹):</strong>");
    for (const r of results) {
      lines.push(
        `• ${r.kind} | pico cerca de ${r.x.toFixed(
          1
        )} cm⁻¹ → pos ${r.pos.toFixed(1)} cm⁻¹, altura ${r.height.toFixed(
          4
        )} a.u., FWHM ${r.fwhm.toFixed(1)} cm⁻¹, área ${r.area.toFixed(4)}`
      );
    }
    document.getElementById("fitsOut").innerHTML = lines
      .map((s) => `<div class="stat">${s}</div>`)
      .join("");
  }

  function toggleResidue() {
    if (!dv || dv.length < 5) return;
    residueMode = !residueMode;
    if (residueMode) {
      const resid = residualSignal(dv, 100);
      window.dataView = resid;
      window.dispatchEvent(
        new CustomEvent("spectrum:update", { detail: { dataView: resid } })
      );
      document.getElementById("toggleResidue").textContent =
        "Ver espectro completo";
    } else {
      window.dataView = dv;
      window.dispatchEvent(
        new CustomEvent("spectrum:update", { detail: { dataView: dv } })
      );
      document.getElementById("toggleResidue").textContent =
        "Ver solo picos (residuo)";
    }
  }

  document.getElementById("runPeaks").addEventListener("click", runDetection);
  document
    .getElementById("applyBaseline")
    .addEventListener("click", applyBaseline);
  document.getElementById("runFits").addEventListener("click", runFits);
  document
    .getElementById("toggleResidue")
    .addEventListener("click", toggleResidue);
})();

// ... (Toda la lógica original de parseo, Savitzky-Golay, Plot y Peaks se mantiene intacta) ...

/**
 * FUNCIÓN PARA GENERAR INFORME PDF PROFESIONAL
 * Incluye: Datos generales, Veredicto, Resultados de picos y Gráfico con fondo blanco.
 */
// Eliminar toda la lógica de PDF (generarInformePDF y el addEventListener de exportPDF)

// Captura combinada: columna izquierda (aside) + figura (canvas-wrap) en un solo PNG

document.getElementById("captureFTIR").addEventListener("click", async () => {
  const aside = document.querySelector("aside");
  const figure = document.getElementById("canvas-wrap");

  // Asegurar captura completa del aside (incluye contenido que excede alto visible)
  const prevOverflow = aside.style.overflow;
  const prevHeight = aside.style.height;
  aside.style.overflow = "visible";
  aside.style.height = "auto";

  const scale = Math.max(2, Math.floor(window.devicePixelRatio) || 2);

  // Capturar aside completo
  const asideCanvas = await html2canvas(aside, {
    scale,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: aside.scrollWidth,
    windowHeight: aside.scrollHeight
  });

  // Restaurar estilos
  aside.style.overflow = prevOverflow;
  aside.style.height = prevHeight;

  // Capturar figura
  const figureCanvas = await html2canvas(figure, {
    scale,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: figure.clientWidth,
    windowHeight: figure.clientHeight
  });

  // Partir aside verticalmente en dos columnas (A y B)
  const asideWidth = asideCanvas.width;
  const asideHeight = asideCanvas.height;
  const halfHeight = Math.ceil(asideHeight / 2);

  // Crear dos cortes del aside: superior (columna A) e inferior (columna B)
  const colA = document.createElement("canvas");
  colA.width = asideWidth;
  colA.height = halfHeight;
  const ctxA = colA.getContext("2d");
  ctxA.drawImage(asideCanvas, 0, 0, asideWidth, halfHeight, 0, 0, asideWidth, halfHeight);

  const colB = document.createElement("canvas");
  colB.width = asideWidth;
  colB.height = asideHeight - halfHeight;
  const ctxB = colB.getContext("2d");
  ctxB.drawImage(
    asideCanvas,
    0, halfHeight, asideWidth, asideHeight - halfHeight,
    0, 0, asideWidth, asideHeight - halfHeight
  );

  // Definir composición horizontal: [colA | colB | figure]
  const margin = 40;     // margen exterior
  const spacing = 30;    // separación entre columnas
  const maxColHeight = Math.max(colA.height, colB.height, figureCanvas.height);

  // Alturas diferentes: alineación superior (tipo informe)
  const totalWidth =
    margin * 2 +
    colA.width + spacing +
    colB.width + spacing +
    figureCanvas.width;

  const totalHeight = margin * 2 + maxColHeight;

  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = totalWidth;
  finalCanvas.height = totalHeight;
  const ctx = finalCanvas.getContext("2d");

  // Fondo blanco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Posiciones X de cada bloque
  let x = margin;
  const yTop = margin;

  // Dibujar colA (parte superior del aside)
  ctx.drawImage(colA, x, yTop);
  x += colA.width + spacing;

  // Dibujar colB (parte inferior del aside)
  ctx.drawImage(colB, x, yTop);
  x += colB.width + spacing;

  // Dibujar figura a la derecha
  ctx.drawImage(figureCanvas, x, yTop);

  // Descargar imagen final
  const link = document.createElement("a");
  link.download = "ftir_analisis_horizontal.png";
  link.href = finalCanvas.toDataURL("image/png");
  link.click();
});