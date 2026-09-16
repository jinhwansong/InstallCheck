import * as T from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MAX_MESH_VALUES = 180000; // 20,000 triangles across a project.
export const MAX_MODEL_BYTES = 10 * 1024 * 1024;

function checkGLB(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20) throw new Error('GLB 헤더가 올바르지 않습니다.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a)
    throw new Error('GLB 2.0 파일을 선택하세요.');
  const length = view.getUint32(12, true);
  if (length > buffer.byteLength - 20) throw new Error('손상된 GLB 파일입니다.');
  const json = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + length)));
  if (json.asset?.version !== '2.0' || !Array.isArray(json.buffers) || json.buffers.length !== 1 || json.buffers.some((b: {uri?:unknown}) => b.uri !== undefined))
    throw new Error('외부 파일을 참조하지 않는 단일 GLB 파일만 지원합니다.');
  if (json.images?.length || json.textures?.length || json.skins?.length || json.animations?.length || json.extensionsUsed?.length || json.extensionsRequired?.length)
    throw new Error('텍스처·애니메이션·압축 확장이 없는 정적 GLB로 다시 내보내세요.');
  if (!Array.isArray(json.nodes) || json.nodes.length > 500 || (json.accessors?.length ?? 0) > 1000)
    throw new Error('노드가 너무 많거나 GLB 구조가 올바르지 않습니다.');
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives ?? []) {
    if ((prim.mode !== undefined && prim.mode !== 4) || prim.targets || prim.extensions)
      throw new Error('삼각형 정적 메시만 지원합니다.');
  }
  for (const accessor of json.accessors ?? []) {
    if (!Number.isInteger(accessor.count) || accessor.count < 0 || accessor.count > MAX_MESH_VALUES)
      throw new Error('메시가 너무 큽니다. 면 수를 줄여 다시 내보내세요.');
  }
}

export async function parseMeshObjects(buffer: ArrayBuffer, filename: string): Promise<{name:string;positions:number[]}[]> {
  if (buffer.byteLength > MAX_MODEL_BYTES) throw new Error('3D 파일은 10 MB 이하만 지원합니다.');
  const extension = filename.split('.').at(-1)?.toLowerCase();
  const manager = new T.LoadingManager();
  manager.setURLModifier(() => { throw new Error('외부 리소스 연결이 차단되었습니다.'); });
  let root: T.Object3D;
  if (extension === 'stl') root = new T.Mesh(new STLLoader(manager).parse(buffer));
  else if (extension === 'obj') root = new OBJLoader(manager).parse(new TextDecoder().decode(buffer));
  else if (extension === 'glb') {
    checkGLB(buffer);
    root = (await new GLTFLoader(manager).parseAsync(buffer, '')).scene;
  } else throw new Error('GLB·STL·OBJ 파일을 선택하세요. STEP·DWG·사진은 아직 지원하지 않습니다.');
  const objects:{name:string;positions:number[]}[]=[];
  let totalValues=0;
  try {
    root.updateMatrixWorld(true);
    root.traverse(object => {
      if (!(object instanceof T.Mesh)) return;
      const positions:number[]=[];
      const geometry = object.geometry;
      const vertex = geometry.getAttribute('position');
      if (!vertex || vertex.itemSize !== 3) throw new Error('메시 좌표가 올바르지 않습니다.');
      const index = geometry.getIndex(), count = index?.count ?? vertex.count;
      if (count % 3 || totalValues + count * 3 > MAX_MESH_VALUES)
        throw new Error('최대 20,000개의 삼각형만 지원합니다. 면 수를 줄여주세요.');
      const point = new T.Vector3();
      for (let i = 0; i < count; i++) {
        const n = index ? index.getX(i) : i;
        if (!Number.isInteger(n) || n < 0 || n >= vertex.count) throw new Error('메시 인덱스 오류입니다.');
        point.fromBufferAttribute(vertex, n).applyMatrix4(object.matrixWorld);
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('유효하지 않은 메시 좌표입니다.');
        positions.push(point.x, point.y, point.z);
      }
      totalValues+=positions.length;
      if(positions.length)objects.push({name:(object.name||object.parent?.name||`객체 ${objects.length+1}`).slice(0,120),positions});
      if(objects.length>100)throw new Error('메시 객체는 최대 100개까지 가져올 수 있습니다.');
    });
    if (!objects.length) throw new Error('표시할 삼각형 메시가 없습니다.');
    return objects;
  } finally {
    root.traverse(object => {
      if (object instanceof T.Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose());
      }
    });
  }
}

export async function parseMesh(buffer:ArrayBuffer, filename:string):Promise<number[]> {
  return (await parseMeshObjects(buffer,filename)).flatMap(object=>object.positions);
}

export function prepareMesh(raw: number[], unit: number, up: 'Y'|'Z') {
  if (![1,10,1000].includes(unit) || !['Y','Z'].includes(up) || !raw.length || raw.length % 9 || raw.length > MAX_MESH_VALUES)
    throw new Error('단위 또는 메시 형식을 확인하세요.');
  const points = raw.slice();
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (let i=0; i<points.length; i+=3) {
    if(up==='Z') {points[i+1]=raw[i+2];points[i+2]=-raw[i+1];}
    for(let a=0;a<3;a++) {
      if(!Number.isFinite(points[i+a])) throw new Error('유효하지 않은 좌표입니다.');
      min[a]=Math.min(min[a],points[i+a]);max[a]=Math.max(max[a],points[i+a]);
    }
  }
  const spans=max.map((n,a)=>n-min[a]);
  if (spans.some(n=>n*unit<1 || n*unit>100000))
    throw new Error('각 치수가 1~100,000 mm여야 합니다. 단위·상향 축을 확인하세요. 평면 메시만 있는 파일은 지원하지 않습니다.');
  return {positions:points.map((n,i)=>Math.round((n-min[i%3])/spans[i%3]*1e6)/1e6), size:{w:Math.ceil(spans[0]*unit),h:Math.ceil(spans[1]*unit),d:Math.ceil(spans[2]*unit)}};
}
