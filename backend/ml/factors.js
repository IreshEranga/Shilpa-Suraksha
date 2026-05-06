const tfInitializer = require('./tfInitializer');
const { tf: tfInstance } = tfInitializer.initializeTensorFlow({ silent: true });
const tf = tfInstance;
const EPS = 1e-8;

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

async function extractFactors({ input, heatmap }) {
  const [_, H, W, C] = input.shape;
  if (C !== 3) throw new Error('Expected input [1,H,W,3]');

  const img = await input.squeeze().data(); // float32 0..1
  const hm = await heatmap.data();          // float32 0..1

  // ---- Colors: low brightness + blue hue band ----
  let wSum = 0;
  let vSum = 0;
  let blueW = 0;

  const BLUE_FROM = 190;
  const BLUE_TO = 260;

  for (let i = 0; i < H * W; i++) {
    const w = hm[i];
    if (w <= 0) continue;

    const idx = i * 3;
    const r = img[idx];
    const g = img[idx + 1];
    const b = img[idx + 2];

    const { h, v } = rgbToHsv(r, g, b);
    vSum += v * w;
    wSum += w;

    if (h >= BLUE_FROM && h <= BLUE_TO) blueW += w;
  }

  const meanV = wSum > 0 ? vSum / wSum : 0;
  const lowBrightnessScore = clamp01(1 - meanV);
  const blueHueBandScore = wSum > 0 ? clamp01(blueW / wSum) : 0;

  // ---- Strokes: weighted edge density (Sobel) ----
  const edgeDensity = await tf.tidy(async () => {
    const gray = input.mean(-1, true);       // [1,H,W,1]
    const sobel = tf.image.sobelEdges(gray); // [1,H,W,1,2]
    const dx = sobel.slice([0, 0, 0, 0, 0], [1, H, W, 1, 1]).squeeze();
    const dy = sobel.slice([0, 0, 0, 0, 1], [1, H, W, 1, 1]).squeeze();
    const mag = dx.square().add(dy.square()).sqrt(); // [H,W]

    const threshold = 0.18; // tune if you want
    const edgeMask = mag.greater(tf.scalar(threshold)).toFloat();

    const w = heatmap;
    const wSumT = w.sum().add(EPS);
    const densityT = edgeMask.mul(w).sum().div(wSumT);

    const v = (await densityT.data())[0];
    return v;
  });

  const highEdgeDensityScore = clamp01(edgeDensity);

  return {
    colors: [
      { concept: 'low_brightness', score: lowBrightnessScore },
      { concept: 'blue_hue_band', score: blueHueBandScore }
    ],
    strokes: [
      { concept: 'high_edge_density', score: highEdgeDensityScore }
    ]
  };
}

module.exports = { extractFactors };
