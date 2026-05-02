const sharp = require('sharp');

const EPS = 1e-8;
const EXPLAIN_METHOD = 'occlusion_sensitivity + region_grounded_concepts + counterfactual_tests';

const clampNumber = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const toFixedMetric = (v, digits = 4) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
};

const saliencyToRgb = (t) => {
  const x = clampNumber(t, 0, 1);
  const r = Math.round(255 * x);
  const g = Math.round(255 * (1 - Math.abs(x - 0.5) * 2) * 0.85);
  const b = Math.round(255 * (1 - x));
  return [r, g, b];
};

const rgbToHueDegrees = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-8) return 0;

  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  h *= 60;
  if (h < 0) h += 360;
  return h;
};

const getHueBand = (h) => {
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 160) return 'green';
  if (h < 200) return 'cyan';
  if (h < 260) return 'blue';
  return 'purple';
};

const getSobelMagnitude = (gray, width, height) => {
  const out = new Float32Array(width * height);
  const gxK = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyK = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      let k = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const v = gray[(y + ky) * width + (x + kx)];
          gx += v * gxK[k];
          gy += v * gyK[k];
          k++;
        }
      }

      out[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return out;
};

const buildPortableInputTensorFromBuffer = async ({ tf, buffer, targetSize }) => {
  const { data, info } = await sharp(buffer)
    .resize(targetSize, targetSize)
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const arr = new Uint8Array(data);
  const tensor = tf.tensor3d(arr, [info.height, info.width, info.channels], 'int32');
  const normalized = tensor.toFloat().div(255.0).expandDims(0);
  tensor.dispose();
  return normalized;
};

const scoreBatchForTargetClass = async ({
  tf,
  predictTensor,
  batchTensor,
  targetClassIndex
}) => {
  const out = predictTensor(batchTensor);
  const probs = await out.data();
  const batch = batchTensor.shape[0] || 1;
  out.dispose();

  const scores = new Float32Array(batch);
  for (let i = 0; i < batch; i++) {
    scores[i] = probs[i * (targetClassIndex + 1) - i * targetClassIndex + targetClassIndex];
  }
  return scores;
};

const resolveOcclusionParams = ({ height, width, explainSteps }) => {
  const minDim = Math.min(height, width);

  const numericSteps = Number(explainSteps);
  const requested = Number.isFinite(numericSteps) ? Math.floor(numericSteps) : 8;

  const gridPerAxis = clampNumber(requested, 4, 24);

  let patchSize = Math.floor(minDim * 0.18);
  patchSize = clampNumber(patchSize, 12, Math.max(12, Math.floor(minDim * 0.28)));

  let stride;
  if (gridPerAxis <= 1 || minDim <= patchSize) {
    stride = patchSize;
  } else {
    stride = Math.floor((minDim - patchSize) / Math.max(1, gridPerAxis - 1));
    stride = clampNumber(stride, 4, patchSize);
  }

  return {
    patchSize,
    stride
  };
};

const getGridPositions = (size, patchSize, stride) => {
  const positions = [];
  if (size <= patchSize) return [0];

  for (let p = 0; p <= size - patchSize; p += stride) {
    positions.push(p);
  }

  const last = size - patchSize;
  if (positions.length === 0 || positions[positions.length - 1] !== last) {
    positions.push(last);
  }

  return positions;
};

const computeOcclusionSensitivity = async ({
  tf,
  inputTensor,
  predictTensor,
  targetClassIndex,
  explainSteps = 8,
  batchSize = 8,
  occlusionFill = 'mean',
  baseScore = null
}) => {
  const safeBatch = clampNumber(Math.floor(Number(batchSize) || 8), 1, 16);

  const squeezed = tf.tidy(() => inputTensor.squeeze());
  const [height, width, channels] = squeezed.shape;

  if (channels !== 3) {
    squeezed.dispose();
    throw new Error(`Expected input with 3 channels, got ${channels}`);
  }

  const inputValues = new Float32Array(await squeezed.data());
  squeezed.dispose();

  const { patchSize, stride } = resolveOcclusionParams({
    height,
    width,
    explainSteps
  });

  const ys = getGridPositions(height, patchSize, stride);
  const xs = getGridPositions(width, patchSize, stride);

  let resolvedBaseScore = Number(baseScore);
  if (!Number.isFinite(resolvedBaseScore)) {
    const pred = predictTensor(inputTensor);
    const probs = await pred.data();
    pred.dispose();
    resolvedBaseScore = probs[targetClassIndex] ?? 0;
  }

  let fillR = 1.0;
  let fillG = 1.0;
  let fillB = 1.0;

  if (occlusionFill === 'black') {
    fillR = 0.0;
    fillG = 0.0;
    fillB = 0.0;
  } else if (occlusionFill === 'mean') {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;

    for (let i = 0; i < height * width; i++) {
      rSum += inputValues[i * 3];
      gSum += inputValues[i * 3 + 1];
      bSum += inputValues[i * 3 + 2];
    }

    const denom = Math.max(1, height * width);
    fillR = rSum / denom;
    fillG = gSum / denom;
    fillB = bSum / denom;
  }

  const saliency = new Float32Array(height * width);
  const coverage = new Float32Array(height * width);

  const jobs = [];
  for (const y of ys) {
    for (const x of xs) {
      jobs.push({ x, y });
    }
  }

  for (let start = 0; start < jobs.length; start += safeBatch) {
    const end = Math.min(jobs.length, start + safeBatch);
    const batchJobs = jobs.slice(start, end);

    const batchArrays = [];
    for (const job of batchJobs) {
      const cloned = new Float32Array(inputValues);

      for (let yy = job.y; yy < job.y + patchSize; yy++) {
        const rowBase = yy * width;
        for (let xx = job.x; xx < job.x + patchSize; xx++) {
          const idx = (rowBase + xx) * 3;
          cloned[idx] = fillR;
          cloned[idx + 1] = fillG;
          cloned[idx + 2] = fillB;
        }
      }

      batchArrays.push(cloned);
    }

    const merged = new Float32Array(batchArrays.length * height * width * 3);
    for (let i = 0; i < batchArrays.length; i++) {
      merged.set(batchArrays[i], i * height * width * 3);
    }

    const batchTensor = tf.tensor4d(merged, [batchArrays.length, height, width, 3], 'float32');
    const out = predictTensor(batchTensor);
    const probs = await out.data();
    out.dispose();
    batchTensor.dispose();

    for (let i = 0; i < batchJobs.length; i++) {
      const occludedScore = probs[i * 4 + targetClassIndex] ?? 0;
      const delta = Math.max(0, resolvedBaseScore - occludedScore);
      const { x, y } = batchJobs[i];

      for (let yy = y; yy < y + patchSize; yy++) {
        const rowBase = yy * width;
        for (let xx = x; xx < x + patchSize; xx++) {
          const idx = rowBase + xx;
          saliency[idx] += delta;
          coverage[idx] += 1;
        }
      }
    }

    await tf.nextFrame();
  }

  for (let i = 0; i < saliency.length; i++) {
    saliency[i] = saliency[i] / Math.max(1, coverage[i]);
  }

  let maxVal = 0;
  for (let i = 0; i < saliency.length; i++) {
    if (saliency[i] > maxVal) maxVal = saliency[i];
  }

  if (maxVal <= EPS) {
    maxVal = 1;
  }

  const attrs = new Float32Array(height * width * 3);
  for (let i = 0; i < saliency.length; i++) {
    const v = saliency[i] / maxVal;
    const base = i * 3;
    attrs[base] = v;
    attrs[base + 1] = v;
    attrs[base + 2] = v;
  }

  return tf.tensor4d(attrs, [1, height, width, 3], 'float32');
};

const buildHeatmaps = async ({
  tf,
  inputTensor,
  attributions,
  supportQuantile = 0.75
}) => {
  const signed = tf.tidy(() => attributions.mean(3).squeeze());
  const pos = tf.tidy(() => signed.relu());

  const norm01 = (t) => tf.tidy(() => {
    const min = t.min();
    const max = t.max();
    return t.sub(min).div(max.sub(min).add(EPS));
  });

  const posN = norm01(pos);
  const [height, width] = posN.shape;

  const posVals = Array.from(await posN.data());

  const img = tf.tidy(() => inputTensor.squeeze());
  const rgb = Array.from(await img.data());
  img.dispose();

  const clipViz = (vals) => {
    const sorted = vals.slice().sort((a, b) => a - b);
    const lo = sorted[Math.max(0, Math.floor(sorted.length * 0.05) - 1)] ?? 0;
    const hi = sorted[Math.max(0, Math.floor(sorted.length * 0.995) - 1)] ?? 1;
    const range = Math.max(hi - lo, EPS);
    return vals.map((v) => clampNumber((v - lo) / range, 0, 1));
  };

  const posViz = clipViz(posVals);

  const sortedPos = posViz.slice().sort((a, b) => a - b);
  const qIdx = Math.max(0, Math.floor(sortedPos.length * supportQuantile) - 1);
  let thr = clampNumber(sortedPos[qIdx] ?? 0.35, 0.10, 0.95);

  const mask = new Uint8Array(width * height);
  let supportCount = 0;

  for (let i = 0; i < mask.length; i++) {
    if (posViz[i] >= thr) {
      mask[i] = 1;
      supportCount++;
    }
  }

  if (supportCount === 0) {
    thr = 0;
    mask.fill(1);
    supportCount = mask.length;
  }

  const supportHeat = new Uint8Array(width * height * 3);

  for (let i = 0; i < width * height; i++) {
    const p = Math.pow(clampNumber(posViz[i], 0, 1), 0.9);
    const [pR, pG, pB] = saliencyToRgb(p);

    supportHeat[i * 3] = pR;
    supportHeat[i * 3 + 1] = pG;
    supportHeat[i * 3 + 2] = pB;
  }

  const supportHeatPng = await sharp(Buffer.from(supportHeat), {
    raw: { width, height, channels: 3 }
  }).png().toBuffer();

  signed.dispose();
  pos.dispose();
  posN.dispose();

  return {
    width,
    height,
    supportHeatmapPngBase64: supportHeatPng.toString('base64'),
    supportMask: mask,
    supportThreshold: thr,
    supportCount
  };
};

const extractConceptsFromSupportRegion = ({
  width,
  height,
  rgbValues01,
  supportMask,
  supportCount
}) => {
  const hueBands = {
    red: 0,
    orange: 0,
    yellow: 0,
    green: 0,
    cyan: 0,
    blue: 0,
    purple: 0
  };

  let brightSum = 0;
  let brightSq = 0;
  let satSum = 0;
  let satSq = 0;
  let minV = Infinity;
  let maxV = -Infinity;

  let sumX = 0;
  let sumY = 0;
  let nearWhite = 0;

  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = clampNumber(rgbValues01[i * 3] * 255, 0, 255);
    const g = clampNumber(rgbValues01[i * 3 + 1] * 255, 0, 255);
    const b = clampNumber(rgbValues01[i * 3 + 2] * 255, 0, 255);

    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;

    if (!supportMask[i]) continue;

    const v = Math.max(r, g, b);
    brightSum += v;
    brightSq += v * v;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;

    const mean = (r + g + b) / 3;
    const sat = Math.sqrt((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 255;
    satSum += sat;
    satSq += sat * sat;

    if (r > 235 && g > 235 && b > 235) nearWhite++;

    const band = getHueBand(rgbToHueDegrees(r, g, b));
    hueBands[band] += 1;

    const y = Math.floor(i / width);
    const x = i - y * width;
    sumX += x;
    sumY += y;
  }

  const brightMean = brightSum / supportCount;
  const brightStd = Math.sqrt(Math.max(brightSq / supportCount - brightMean * brightMean, 0));
  const satMean = satSum / supportCount;
  const satStd = Math.sqrt(Math.max(satSq / supportCount - satMean * satMean, 0));

  const sobel = getSobelMagnitude(gray, width, height);
  let eSum = 0;
  let eSq = 0;

  for (let i = 0; i < sobel.length; i++) {
    eSum += sobel[i];
    eSq += sobel[i] * sobel[i];
  }

  const eMean = eSum / sobel.length;
  const eStd = Math.sqrt(Math.max(eSq / sobel.length - eMean * eMean, 0));
  const hiThr = eMean + eStd;

  let hiEdge = 0;
  let supEdgeSum = 0;
  for (let i = 0; i < width * height; i++) {
    if (!supportMask[i]) continue;
    const v = sobel[i];
    supEdgeSum += v;
    if (v >= hiThr) hiEdge++;
  }

  const cx = sumX / supportCount;
  const cy = sumY / supportCount;

  const cxN = cx / Math.max(1, width - 1);
  const cyN = cy / Math.max(1, height - 1);

  const blueRatio = hueBands.blue / supportCount;
  const redRatio = hueBands.red / supportCount;
  const warmRatio = (hueBands.red + hueBands.orange + hueBands.yellow) / supportCount;
  const coolRatio = (hueBands.cyan + hueBands.blue + hueBands.purple) / supportCount;

  const emptySpaceRatio = nearWhite / supportCount;

  return {
    brightness_mean: toFixedMetric(brightMean),
    brightness_std: toFixedMetric(brightStd),
    saturation_mean: toFixedMetric(satMean),
    saturation_std: toFixedMetric(satStd),
    blue_ratio: toFixedMetric(blueRatio),
    red_ratio: toFixedMetric(redRatio),
    warm_ratio: toFixedMetric(warmRatio),
    cool_ratio: toFixedMetric(coolRatio),
    edge_density: toFixedMetric(hiEdge / supportCount),
    stroke_intensity: toFixedMetric(supEdgeSum / supportCount),
    support_center_x: toFixedMetric(cxN),
    support_center_y: toFixedMetric(cyN),
    empty_space_ratio: toFixedMetric(emptySpaceRatio)
  };
};

const buildMaskPng = async ({ width, height, supportMask }) => {
  const buf = Buffer.alloc(width * height);
  for (let i = 0; i < supportMask.length; i++) {
    buf[i] = supportMask[i] ? 255 : 0;
  }
  return sharp(buf, { raw: { width, height, channels: 1 } }).png().toBuffer();
};

const applyEditInSupportRegion = async ({
  imageBuffer,
  width,
  height,
  maskPngBuffer,
  editType
}) => {
  const base = sharp(imageBuffer).resize(width, height).removeAlpha().toColourspace('srgb');
  let edited = sharp(imageBuffer).resize(width, height).removeAlpha().toColourspace('srgb');

  if (editType === 'brighten') {
    edited = edited.modulate({ brightness: 1.20 });
  } else if (editType === 'desaturate') {
    edited = edited.modulate({ saturation: 0.60 });
  } else if (editType === 'blur') {
    edited = edited.blur(2.0);
  } else if (editType === 'cool_shift') {
    edited = edited.modulate({ hue: 20 });
  } else if (editType === 'warm_shift') {
    edited = edited.modulate({ hue: -20 });
  }

  const editedBuf = await edited.png().toBuffer();

  const alpha = sharp(maskPngBuffer).resize(width, height);
  const editedRgba = await sharp(editedBuf)
    .ensureAlpha()
    .joinChannel(await alpha.raw().toBuffer(), { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  const out = await base
    .composite([{ input: editedRgba }])
    .png()
    .toBuffer();

  return out;
};

const bufferToInputTensor = async ({ tf, buffer, targetSize }) => {
  return buildPortableInputTensorFromBuffer({ tf, buffer, targetSize });
};

const getTargetScoreFromTensor = async ({
  inputTensor,
  predictTensor,
  targetClassIndex
}) => {
  const out = predictTensor(inputTensor);
  const probs = await out.data();
  out.dispose();
  return probs[targetClassIndex] ?? 0;
};

const runCounterfactualConceptTests = async ({
  tf,
  imageBuffer,
  width,
  height,
  maskPngBuffer,
  predictTensor,
  targetClassIndex,
  baseScore,
  inputSize
}) => {
  const tests = [
    { concept: 'low_brightness', edit: 'brighten' },
    { concept: 'high_edge_density', edit: 'blur' },
    { concept: 'low_saturation', edit: 'desaturate' },
    { concept: 'cool_colors', edit: 'warm_shift' },
    { concept: 'warm_colors', edit: 'cool_shift' }
  ];

  const results = [];

  for (const t of tests) {
    const editedBuf = await applyEditInSupportRegion({
      imageBuffer,
      width,
      height,
      maskPngBuffer,
      editType: t.edit
    });

    const editedTensor = await bufferToInputTensor({
      tf,
      buffer: editedBuf,
      targetSize: inputSize
    });

    const editedScore = await getTargetScoreFromTensor({
      inputTensor: editedTensor,
      predictTensor,
      targetClassIndex
    });

    editedTensor.dispose();

    const delta = baseScore - editedScore;
    results.push({
      concept: t.concept,
      edited_score: toFixedMetric(editedScore),
      effect_on_class: toFixedMetric(delta)
    });
  }

  results.sort((a, b) => b.effect_on_class - a.effect_on_class);
  return results;
};

const EMO_TEXT = {
  fear: {
    label: 'fear',
    meaning: 'patterns commonly linked with tension or anxiety in expressive drawings',
    topTemplates: {
      low_brightness: 'dark regions in the drawing',
      high_edge_density: 'dense and sharp strokes',
      cool_colors: 'a strong presence of cool colors',
      empty_space_ratio: 'large empty areas',
      support_center_y: 'attention concentrated near the upper area'
    }
  },
  sad: {
    label: 'sad',
    meaning: 'patterns commonly linked with withdrawal or low mood in expressive drawings',
    topTemplates: {
      low_brightness: 'dark or muted areas',
      low_saturation: 'low color intensity',
      empty_space_ratio: 'large empty areas',
      support_center_y: 'details concentrated lower on the page',
      high_edge_density: 'heavier stroke texture'
    }
  },
  angry: {
    label: 'angry',
    meaning: 'patterns commonly linked with agitation or forceful expression',
    topTemplates: {
      high_edge_density: 'strong, sharp strokes',
      warm_colors: 'warm color dominance',
      stroke_intensity: 'high stroke intensity',
      red_ratio: 'a higher proportion of red hues',
      low_empty_space: 'crowded composition'
    }
  },
  happy: {
    label: 'happy',
    meaning: 'patterns commonly linked with positive and energetic expression',
    topTemplates: {
      high_brightness: 'bright areas and higher overall brightness',
      warm_colors: 'warm, vivid colors',
      higher_saturation: 'more saturated colors',
      balanced_composition: 'balanced placement of drawn elements',
      smoother_strokes: 'less sharp stroke texture'
    }
  }
};

const conceptPhrase = (emotion, concept) => {
  const pack = EMO_TEXT[emotion];
  if (!pack) return concept;
  return pack.topTemplates[concept] || concept.replace(/_/g, ' ');
};

const buildHumanExplanationText = ({
  emotion,
  topConcepts,
  compositionHints
}) => {
  const emoPack = EMO_TEXT[emotion] || {
    label: emotion,
    meaning: 'relevant emotional indicators'
  };

  const phrases = topConcepts.slice(0, 3).map((c) => conceptPhrase(emotion, c.concept));

  const list =
    phrases.length <= 1
      ? phrases[0] || 'a small set of visual cues'
      : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;

  const extra = compositionHints ? ` ${compositionHints}` : '';

  return `The model’s decision was mainly supported by ${list}. These cues match ${emoPack.meaning}.${extra}`;
};

const toLegacyFactors = ({ concepts, conceptEffects, heat }) => ({
  supportRegion: {
    threshold: toFixedMetric(heat.supportThreshold),
    pixelCount: heat.supportCount,
    pixelRatio: toFixedMetric(heat.supportCount / (heat.width * heat.height))
  },
  brightness: {
    meanValue: concepts.brightness_mean,
    stdValue: concepts.brightness_std
  },
  colorDistribution: {
    warmRatio: concepts.warm_ratio,
    coolRatio: concepts.cool_ratio,
    redRatio: concepts.red_ratio,
    blueRatio: concepts.blue_ratio
  },
  strokeAndEdges: {
    edgeDensity: concepts.edge_density,
    strokeIntensity: concepts.stroke_intensity
  },
  spatialPlacement: {
    centerX: concepts.support_center_x,
    centerY: concepts.support_center_y
  },
  emptySpace: {
    ratio: concepts.empty_space_ratio
  },
  counterfactualValidation: conceptEffects
});

const buildExplainabilityPackage = async ({
  tf,
  inputTensor,
  predictTensor,
  imageBuffer,
  targetClassIndex,
  targetClassLabel,
  targetScore,
  inputSizeForEdits,
  explainSteps
}) => {
  const resolvedSteps = Number.isFinite(Number(explainSteps))
    ? Number(explainSteps)
    : 8;

  const attributions = await computeOcclusionSensitivity({
    tf,
    inputTensor,
    predictTensor,
    targetClassIndex,
    explainSteps: resolvedSteps,
    batchSize: 8,
    occlusionFill: 'mean',
    baseScore: targetScore
  });

  const heat = await buildHeatmaps({
    tf,
    inputTensor,
    attributions,
    supportQuantile: 0.75
  });

  const img = tf.tidy(() => inputTensor.squeeze());
  const rgbValues01 = Array.from(await img.data());
  img.dispose();

  const concepts = extractConceptsFromSupportRegion({
    width: heat.width,
    height: heat.height,
    rgbValues01,
    supportMask: heat.supportMask,
    supportCount: heat.supportCount
  });

  const maskPngBuffer = await buildMaskPng({
    width: heat.width,
    height: heat.height,
    supportMask: heat.supportMask
  });

  const conceptEffects = await runCounterfactualConceptTests({
    tf,
    imageBuffer,
    width: heat.width,
    height: heat.height,
    maskPngBuffer,
    predictTensor,
    targetClassIndex,
    baseScore: targetScore,
    inputSize: inputSizeForEdits
  });

  const topConcepts = conceptEffects.slice(0, 3);

  let compositionHint = '';
  if (concepts.support_center_y <= 0.33) {
    compositionHint = 'The supporting evidence is concentrated in the upper region of the page.';
  } else if (concepts.support_center_y >= 0.67) {
    compositionHint = 'The supporting evidence is concentrated in the lower region of the page.';
  }

  const text = buildHumanExplanationText({
    emotion: targetClassLabel,
    topConcepts,
    compositionHints: compositionHint
  });

  attributions.dispose();

  const legacyFactors = toLegacyFactors({ concepts, conceptEffects, heat });
  const targetScoreFixed = toFixedMetric(targetScore);
  const supportRegion = legacyFactors.supportRegion;

  return {
    targetClass: targetClassLabel,
    targetScore: targetScoreFixed,
    target_class: targetClassLabel,
    target_score: targetScoreFixed,
    method: EXPLAIN_METHOD,
    explanationMethod: EXPLAIN_METHOD,
    supportHeatmapPngBase64: heat.supportHeatmapPngBase64,
    factors: legacyFactors,
    explanationText: text,
    where_the_model_looked: {
      support_heatmap_png_base64: heat.supportHeatmapPngBase64,
      support_region: {
        threshold: supportRegion.threshold,
        pixel_count: supportRegion.pixelCount,
        pixel_ratio: supportRegion.pixelRatio
      }
    },
    what_the_model_used: {
      concepts,
      concept_effects: conceptEffects
    }
  };
};

module.exports = {
  buildExplainabilityPackage
};