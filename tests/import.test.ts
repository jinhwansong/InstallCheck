import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMesh, parseMeshObjects, prepareMesh } from '../src/import3d.ts';

test('generated mesh with arbitrary scale fits verified dimensions and rejects degenerate geometry',()=>{
 const raw=[0,0,0, .001,0,.002, 0,.003,0];
 const target={w:1800,d:1200,h:2400};
 const model=prepareMesh(raw,1,'Y',target);
 assert.deepEqual(model.size,target);assert.deepEqual(model.positions,[0,0,0,1,0,1,0,1,0]);
 assert.throws(()=>prepareMesh(raw,1,'Y',{...target,w:NaN}),/보정 치수/);
 assert.throws(()=>prepareMesh(raw,1,'Y',{...target,w:0}),/보정 치수/);
 assert.throws(()=>prepareMesh([0,0,0,1,0,1,0,0,1],1,'Y',target),/평면/);
});
import { sampleProject, validateProject, createInspection, isStale } from '../src/model.ts';
import { inspect } from '../src/inspection.ts';

const obj = 'v 0 0 0\nv 2 0 0\nv 0 3 0\nv 0 0 4\nf 1 2 3\nf 1 4 2\nf 1 3 4\nf 2 4 3';
const bytes=(s:string)=>new TextEncoder().encode(s).buffer;
test('factory background persists in history, never becomes a solid obstacle, and requires separate site review',()=>{
  const p=sampleProject();
  p.assets=[{id:'factory-mesh',name:'factory.obj',positions:[0,0,0,1,0,0,0,1,1]}];
  p.factory={name:'factory.obj',meshId:'factory-mesh',x:6000,y:0,z:4500,w:12000,d:9000,h:4000,angle:0};
  const original=inspect(sampleProject());
  const results=inspect(p);
  assert.deepEqual(results.filter(f=>f.rule==='collision'),original.filter(f=>f.rule==='collision'));
  assert.ok(results.some(f=>f.rule==='factory-background'&&f.status==='unknown'));
  p.inspections.push(createInspection(p));
  const restored=validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.schema,3);
  assert.deepEqual(restored.factory,p.factory);
  restored.factory!.x+=100;
  assert.ok(isStale(restored,restored.inspections[0]));
  assert.equal(restored.inspections[0].basis.factory!.x,6000);
  delete restored.factory;
  assert.equal(validateProject(restored).schema,3,'history still needs factory-aware schema');
  restored.assets=[];assert.throws(()=>validateProject(restored));
  const bad=structuredClone(p);bad.factory!.angle=Infinity;assert.throws(()=>validateProject(bad));
});
test('OBJ parsing and explicit units/up-axis create a correctly sized preview',async()=>{
  const raw=await parseMesh(bytes(obj),'model.obj');
  const ready=prepareMesh(raw,1000,'Y');
  assert.deepEqual(ready.size,{w:2000,h:3000,d:4000});
  assert.equal(ready.positions.length,36);
  assert.ok(ready.positions.every(n=>n>=0&&n<=1));
  assert.deepEqual(prepareMesh(raw,10,'Z').size,{w:20,h:40,d:30});
});
test('OBJ objects retain names and source positions for separate registration',async()=>{
 const objects=await parseMeshObjects(bytes('o machine\nv 0 0 0\nv 2 0 0\nv 0 3 4\nf 1 2 3\no column\nv 10 0 0\nv 12 0 0\nv 10 3 4\nf 4 5 6'),'parts.obj');
 assert.deepEqual(objects.map(o=>o.name),['machine','column']);assert.equal(objects[1].positions[0],10);
});
test('file import rejects unsupported, invalid, flat and external resource models',async()=>{
  await assert.rejects(parseMesh(bytes('file'),'model.step'),/GLB|STL|OBJ/);
  await assert.rejects(parseMesh(bytes(''),'model.obj'));
  assert.throws(()=>prepareMesh([0,0,0,1,0,0,0,0,1],1,'Y'));
  assert.throws(()=>prepareMesh([0,0,0,1,1,1,0,1,0],0,'Y'));
});
test('ASCII STL imports without guessing its physical units',async()=>{
  const stl='solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 2 0 0\nvertex 0 3 4\nendloop\nendfacet\nendsolid';
  const raw=await parseMesh(bytes(stl),'model.stl');
  assert.deepEqual(prepareMesh(raw,1,'Y').size,{w:2,h:3,d:4});
});
test('mesh assets survive JSON and snapshots while broken references fail',()=>{
  const p=sampleProject();
  p.assets=[{id:'mesh-1',name:'tetra.obj',positions:prepareMesh([0,0,0,2,0,0,0,3,4],1,'Y').positions}];
  p.equipment[0].parts[0].meshId='mesh-1';
  p.inspections.push(createInspection(p));
  const restored=validateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.assets,p.assets);
  assert.equal(restored.schema,2);
  assert.equal(restored.inspections[0].basis.equipment[0].parts[0].meshId,'mesh-1');
  p.assets=[];assert.throws(()=>validateProject(p));
});

test('static binary GLB loads; external buffers are rejected before loading',async()=>{
  const vertices=new Float32Array([0,0,0,2,0,0,0,3,4]);
  const make=(external=false)=>{
    const json=JSON.stringify({asset:{version:'2.0'},buffers:[{byteLength:vertices.byteLength,...(external?{uri:'https://example.com/private.bin'}:{})}],bufferViews:[{buffer:0,byteLength:vertices.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[2,3,4]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0});
    const padded=bytes(json.padEnd(Math.ceil(json.length/4)*4,' '));
    const result=new ArrayBuffer(28+padded.byteLength+vertices.byteLength),v=new DataView(result);
    [0x46546c67,2,result.byteLength,padded.byteLength,0x4e4f534a].forEach((n,i)=>v.setUint32(i*4,n,true));
    new Uint8Array(result,20,padded.byteLength).set(new Uint8Array(padded));
    v.setUint32(20+padded.byteLength,vertices.byteLength,true);v.setUint32(24+padded.byteLength,0x004e4942,true);
    new Uint8Array(result,28+padded.byteLength).set(new Uint8Array(vertices.buffer));return result;
  };
  assert.deepEqual(prepareMesh(await parseMesh(make(),'model.glb'),1000,'Y').size,{w:2000,h:3000,d:4000});
  await assert.rejects(parseMesh(make(true),'model.glb'),/외부 파일/);
});
