import { log } from '../helpers';
import * as tf from '../../dist/tfjs.esm.js';
import * as blazeface from './blazeface';
import * as facepipeline from './facepipeline';
import * as coords from './coords';

export class MediaPipeFaceMesh {
  facePipeline: any;
  config: any;

  constructor(blazeFace, blazeMeshModel, irisModel, config) {
    this.facePipeline = new facepipeline.Pipeline(blazeFace, blazeMeshModel, irisModel);
    this.config = config;
  }

  async estimateFaces(input, config): Promise<{ confidence, boxConfidence, faceConfidence, box, mesh, boxRaw, meshRaw, annotations, image }[]> {
    const predictions = await this.facePipeline.predict(input, config);
    const results: Array<{ confidence, boxConfidence, faceConfidence, box, mesh, boxRaw, meshRaw, annotations, image }> = [];
    for (const prediction of (predictions || [])) {
      if (prediction.isDisposedInternal) continue; // guard against disposed tensors on long running operations such as pause in middle of processing
      const mesh = prediction.coords ? prediction.coords.arraySync() : [];
      // this should be the best way to get the meshRaw with x and y fitting the box with aspect ratio kept (values still normalized to 0..1)
      const size = prediction.box ? Math.max((prediction.box.endPoint[0] - prediction.box.startPoint[0]), (prediction.box.endPoint[1] - prediction.box.startPoint[1])) / 1.5 : 1;
      const meshRaw = mesh.map((pt) => [
        pt[0] / size,
        pt[1] / size,
        pt[2] / this.facePipeline.meshSize,
      ]);
      const annotations = {};
      if (mesh && mesh.length > 0) {
        for (const key of Object.keys(coords.MESH_ANNOTATIONS)) annotations[key] = coords.MESH_ANNOTATIONS[key].map((index) => mesh[index]);
      }
      const box = prediction.box ? [
        Math.max(0, prediction.box.startPoint[0]),
        Math.max(0, prediction.box.startPoint[1]),
        Math.min(input.shape[2], prediction.box.endPoint[0]) - Math.max(0, prediction.box.startPoint[0]),
        Math.min(input.shape[1], prediction.box.endPoint[1]) - Math.max(0, prediction.box.startPoint[1]),
      ] : 0;
      const boxRaw = prediction.box ? [
        prediction.box.startPoint[0] / input.shape[2],
        prediction.box.startPoint[1] / input.shape[1],
        (prediction.box.endPoint[0] - prediction.box.startPoint[0]) / input.shape[2],
        (prediction.box.endPoint[1] - prediction.box.startPoint[1]) / input.shape[1],
      ] : [];
      results.push({
        confidence: prediction.faceConfidence || prediction.boxConfidence || 0,
        boxConfidence: prediction.boxConfidence,
        faceConfidence: prediction.faceConfidence,
        box,
        boxRaw,
        mesh,
        meshRaw,
        annotations,
        image: prediction.image ? prediction.image.clone() : null,
      });
      if (prediction.coords) prediction.coords.dispose();
      if (prediction.image) prediction.image.dispose();
    }
    return results;
  }
}

let faceModels = [null, null, null];
export async function load(config) {
  // @ts-ignore
  faceModels = await Promise.all([
    (!faceModels[0] && config.face.enabled) ? blazeface.load(config) : null,
    (!faceModels[1] && config.face.mesh.enabled) ? tf.loadGraphModel(config.face.mesh.modelPath, { fromTFHub: config.face.mesh.modelPath.includes('tfhub.dev') }) : null,
    (!faceModels[2] && config.face.iris.enabled) ? tf.loadGraphModel(config.face.iris.modelPath, { fromTFHub: config.face.iris.modelPath.includes('tfhub.dev') }) : null,
  ]);
  const faceMesh = new MediaPipeFaceMesh(faceModels[0], faceModels[1], faceModels[2], config);
  if (config.face.mesh.enabled && config.debug) log(`load model: ${config.face.mesh.modelPath.match(/\/(.*)\./)[1]}`);
  if (config.face.iris.enabled && config.debug) log(`load model: ${config.face.iris.modelPath.match(/\/(.*)\./)[1]}`);
  return faceMesh;
}

export const triangulation = coords.TRI468;
