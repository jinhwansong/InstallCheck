import { CylinderGeometry } from 'three';
import type { MeshAsset, Part } from './model.ts';
import { uid } from './model.ts';

export type CylinderAxis = 'x'|'y'|'z';
export function cylinderAsset(axis:CylinderAxis):MeshAsset {
  if(!['x','y','z'].includes(axis))throw new Error('원통 방향을 확인하세요.');
  const indexed=new CylinderGeometry(.5,.5,1,32);
  if(axis==='x')indexed.rotateZ(Math.PI/2);
  if(axis==='z')indexed.rotateX(Math.PI/2);
  indexed.translate(.5,.5,.5);
  const geometry=indexed.toNonIndexed();
  try{
    const positions=Array.from(geometry.getAttribute('position').array,n=>Math.max(0,Math.min(1,Math.round(n*1e6)/1e6)));
    return {id:uid(),name:`간이 원통 · ${axis.toUpperCase()}축`,positions};
  }finally{geometry.dispose();indexed.dispose();}
}

export const partPresets = {
  body:{name:'본체 (예시 치수)',w:1600,d:1200,h:1200,y:0},
  tank:{name:'탱크 (예시 치수)',w:800,d:800,h:1200,y:1200},
  conveyor:{name:'컨베이어 (예시 치수)',w:3000,d:500,h:250,y:800},
  control:{name:'제어반 (예시 치수)',w:600,d:400,h:1600,y:0},
};
export function presetPart(kind:keyof typeof partPresets):{part:Part;asset?:MeshAsset}{
  if(!Object.hasOwn(partPresets,kind))throw new Error('부품 종류를 확인하세요.');
  const asset=kind==='tank'?cylinderAsset('y'):undefined;
  return {part:{id:uid(),...partPresets[kind],x:0,z:0,...(asset?{meshId:asset.id}:{})},asset};
}
