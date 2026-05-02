const fs = require('fs');
const path = require('path');

const { analyzeHandwriting } = require('../ml/handwritingModel');
// const { analyzeHandwriting, analyzeHandwritingExplain } = require('../ml/handwritingModel');

const parseArgs = (argv) => {
  const args = { explain: true };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--image' || token === '-i') {
      args.image = argv[i + 1];
      i++;
    } else if (token === '--steps' || token === '-s') {
      args.explainSteps = Number(argv[i + 1]);
      i++;
    } else if (token === '--heatmap-out' || token === '-o') {
      args.heatmapOut = argv[i + 1];
      i++;
    } else if (token === '--grid-out' || token === '-g') {
      args.gridOut = argv[i + 1];
      i++;
    } else if (token === '--grid-heatmap-out') {
      args.gridHeatmapOut = argv[i + 1];
      i++;
    } else if (token === '--oppose-heatmap-out') {
      args.opposeHeatmapOut = argv[i + 1];
      i++;
    } else if (token === '--no-explain') {
      args.explain = false;
    } else if (token === '--full-json') {
      args.fullJson = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (!String(token).startsWith('-')) {
      positionals.push(token);
    }
  }

  // npm on some Windows setups may strip flag names and pass only values.
  // Support positional fallback: "<imagePath> [steps]".
  if (!args.image && positionals.length > 0) {
    args.image = positionals[0];
  }
  if (!Number.isFinite(args.explainSteps) && positionals.length > 1) {
    const maybeSteps = Number(positionals[1]);
    if (Number.isFinite(maybeSteps)) {
      args.explainSteps = maybeSteps;
    }
  }

  return args;
};

const printHelp = () => {
  console.log('Usage: node scripts/testExplainInference.js --image <path> [options]');
  console.log('       node scripts/testExplainInference.js <imagePath> [steps]');
  console.log('');
  console.log('Options:');
  console.log('  -i, --image <path>         Required input image path');
  console.log('  -s, --steps <num>          Integrated gradients steps (default from service)');
  console.log('  -o, --heatmap-out <path>   Save decoded explain heatmap PNG to a file');
  console.log('      --oppose-heatmap-out <path>  Save opposing attribution heatmap PNG');
  console.log('  -g, --grid-out <path>      Save grid overlay PNG (top attribution tiles)');
  console.log('      --grid-heatmap-out <path>  Save grid heatmap PNG (low=blue, high=red)');
  console.log('      --no-explain           Disable explain mode (prediction only)');
  console.log('      --full-json            Print full JSON response including base64');
  console.log('  -h, --help                 Show this help');
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.image) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const imagePath = path.resolve(args.image);
  if (!fs.existsSync(imagePath)) {
    console.error(`Image file not found: ${imagePath}`);
    process.exit(1);
  }

  const result = await analyzeHandwriting(imagePath, {
    explain: args.explain !== false,
    explainSteps: Number.isFinite(args.explainSteps) ? args.explainSteps : undefined
  });

  const explain = result?.explain || {};
  const supportHeatmapBase64 =
    explain.heatmapPngBase64 ||
    explain.supportHeatmapPngBase64 ||
    explain.where_the_model_looked?.support_heatmap_png_base64 ||
    null;
  const opposeHeatmapBase64 =
    explain.opposeHeatmapPngBase64 ||
    explain.where_the_model_looked?.oppose_heatmap_png_base64 ||
    null;
  const supportOverlayBase64 =
    explain.gridOverlayPngBase64 ||
    explain.overlayHeatmapPngBase64 ||
    explain.supportOverlayPngBase64 ||
    explain.where_the_model_looked?.support_overlay_png_base64 ||
    null;
  const gridHeatmapBase64 =
    explain.gridHeatmapPngBase64 ||
    supportHeatmapBase64 ||
    null;

  if (args.heatmapOut && supportHeatmapBase64) {
    const outputPath = path.resolve(args.heatmapOut);
    const pngBuffer = Buffer.from(supportHeatmapBase64, 'base64');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`Heatmap written: ${outputPath}`);
  }

  if (args.gridOut && supportOverlayBase64) {
    const outputPath = path.resolve(args.gridOut);
    const pngBuffer = Buffer.from(supportOverlayBase64, 'base64');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`Grid overlay written: ${outputPath}`);
  }

  if (args.gridHeatmapOut && gridHeatmapBase64) {
    const outputPath = path.resolve(args.gridHeatmapOut);
    const pngBuffer = Buffer.from(gridHeatmapBase64, 'base64');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`Grid heatmap written: ${outputPath}`);
  }

  if (args.opposeHeatmapOut && opposeHeatmapBase64) {
    const outputPath = path.resolve(args.opposeHeatmapOut);
    const pngBuffer = Buffer.from(opposeHeatmapBase64, 'base64');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`Oppose heatmap written: ${outputPath}`);
  }

  const noExplicitOutputs =
    !args.heatmapOut &&
    !args.opposeHeatmapOut &&
    !args.gridOut &&
    !args.gridHeatmapOut;
  if (noExplicitOutputs && supportHeatmapBase64 && opposeHeatmapBase64) {
    // By design we no longer write heatmaps into the temporary `tmp` folder.
    // Encourage users to specify output paths with the command-line flags.
    console.log('Heatmaps were generated but not saved.');
    console.log('Use --heatmap-out, --oppose-heatmap-out, --grid-out or --grid-heatmap-out to write them to files.');
  }

  if (args.fullJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const summary = {
    emotion: result.emotion,
    confidence: result.confidence,
    method: result.method,
    explainAvailable: Boolean(explain && Object.keys(explain).length > 0),
    explainMethod: explain.explanationMethod || explain.method || null,
    targetClass: explain.targetClass || explain.target_class || null,
    targetScore: explain.targetScore || explain.target_score || null,
    factors: explain.factors || explain.what_the_model_used?.concepts || null,
    explanationText: explain.explanationText || explain.explanation_text || null
  };
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error('Explain inference test failed:', error?.message || error);
  process.exit(1);
});
