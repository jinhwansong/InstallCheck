import test from 'node:test';
import assert from 'node:assert/strict';
import { cylinderAsset, presetPart } from '../src/primitives.ts';
import { sampleProject, validateProject, createInspection } from '../src/model.ts';
import { inspect } from '../src/inspection.ts';
import { resetChangedEvidence } from '../src/review.ts';

test('cylinders retain full normalized bounds on all axes and use unchanged box inspection',()=>{
 for(const axis of ['x','y','z'] as const){
  const asset=cylinderAsset(axis);
  assert.equal(asset.positions.length%9,0);assert.ok(asset.positions.every(n=>n>=0&&n<=1));
  for(let a=0;a<3;a++){const values=asset.positions.filter((_,i)=>i%3===a);assert.equal(Math.min(...values),0);assert.equal(Math.max(...values),1);}
  const p=sampleProject(),before=inspect(p);p.assets=[asset];p.equipment[0].parts[0].meshId=asset.id;
  assert.deepEqual(inspect(p),before);p.inspections=[createInspection(p)];
  const restored=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(restored.inspections[0].basis.equipment[0].parts[0].meshId,asset.id);
 }
});
test('tank preset and shape replacement retain evidence history and invalidate current geometry checks',()=>{
 const {part,asset}=presetPart('tank');assert.ok(asset);assert.equal(part.meshId,asset.id);
 const p=sampleProject();p.equipment[0].review={model:'A',source:'spec',reviewer:'owner',date:'2026-09-16',dimensions:true,protrusions:true,clearance:true,notes:''};
 const draft=structuredClone(p);draft.equipment[0].parts.push(part);resetChangedEvidence(p,draft);
 assert.equal(draft.equipment[0].review?.dimensions,false);assert.equal(draft.equipment[0].review?.protrusions,false);assert.equal(p.equipment[0].review.dimensions,true);
});
