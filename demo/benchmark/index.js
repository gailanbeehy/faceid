import { Human } from '../../dist/human.esm.js';

const loop = 20;
let initial = true;
const backends = ['wasm', 'webgl', 'humangl', 'webgpu'];

function str(...msg) {
  if (!Array.isArray(msg)) return msg;
  let line = '';
  for (const entry of msg) {
    if (typeof entry === 'object') line += JSON.stringify(entry).replace(/{|}|"|\[|\]/g, '').replace(/,/g, ', ');
    else line += entry;
  }
  return line;
}

function log(...msg) {
  const dt = new Date();
  const ts = `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}:${dt.getSeconds().toString().padStart(2, '0')}.${dt.getMilliseconds().toString().padStart(3, '0')}`;
  if (msg) console.log(ts, 'Human:', ...msg); // eslint-disable-line no-console
  const el = document.getElementById('log');
  el.innerHTML += str(...msg) + '<br>';
}

const myConfig = {
  modelBasePath: 'https://vladmandic.github.io/human/models',
  // wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@3.18.0/dist/',
  debug: true,
  async: true,
  cacheSensitivity: 0,
  filter: { enabled: false },
  face: {
    enabled: true,
    detector: { enabled: true, rotation: false },
    mesh: { enabled: true },
    iris: { enabled: true },
    description: { enabled: true },
    emotion: { enabled: true },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  hand: { enabled: true },
  body: { enabled: true },
  object: { enabled: true },
};

async function benchmark(backend) {
  myConfig.backend = backend;
  const human = new Human(myConfig);
  await human.init();
  await human.load();
  const loaded = Object.keys(human.models).filter((a) => human.models[a]);
  if (initial) {
    log('Human: ', human.version);
    log('TFJS: ', human.tf.version.tfjs);
    log('Environment: ', { platform: human.env.platform, agent: human.env.agent });
    log('Backends: ', human.env.backends);
    log('Support: ', { offscreen: human.env.offscreen, webgl: human.env.webgl.supported, webgpu: human.env.webgpu.supported, wasm: human.env.wasm.supported, simd: human.env.wasm.simd, multithread: human.env.wasm.multithread });
    log('Models: ', loaded);
    log('');
    initial = false;
  }
  const element = document.getElementById('image');
  const processed = await human.image(element);
  const t0 = human.now();
  await human.detect(processed.tensor, myConfig);
  const t1 = human.now();
  if (human.tf.getBackend().toLowerCase() === backend.toLowerCase()) {
    log('Backend: ', human.tf.getBackend());
    log('Memory state: ', human.tf.engine().memory());
    log('Initial inference: ', Math.round(t1 - t0));
    for (let i = 0; i < loop; i++) {
      const image = await human.image(element);
      human.tf.dispose(image.tensor);
    }
    const t2 = human.now();
    log('Input processing: ', Math.round(10 * (t2 - t1) / loop) / 10);
    for (let i = 0; i < loop; i++) await human.detect(processed.tensor, myConfig);
    const t3 = human.now();
    log('Average inference: ', Math.round((t3 - t1) / loop));
  } else {
    log('Backend error: ', { desired: backend, current: human.tf.getBackend().toLowerCase() });
  }
  log('');
}

log('Attempting backends: ', backends);
async function main() {
  for (const backend of backends) await benchmark(backend);
}

window.onload = main;
