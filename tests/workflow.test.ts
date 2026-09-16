import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleProject, validateProject, createInspection } from '../src/model.ts';
import { resetChangedEvidence, changesSince, questions } from '../src/review.ts';

test('review requires evidence and geometry changes invalidate only relevant confirmations',()=>{
  const p=sampleProject(), e=p.equipment[0];
  assert.equal(questions(e).length,3);
  e.review={model:'PK',source:'제조사 사양서',reviewer:'담당자',date:'2026-09-16',dimensions:true,clearance:true,protrusions:true,notes:''};
  assert.equal(questions(e).length,0);
  const next=structuredClone(p);next.equipment[0].parts[0].w+=100;
  resetChangedEvidence(p,next);
  assert.equal(next.equipment[0].review!.dimensions,false);
  assert.equal(next.equipment[0].review!.protrusions,false);
  assert.equal(next.equipment[0].review!.clearance,true);
  const snapshot=createInspection(p);
  assert.ok(changesSince(next,snapshot.basis).some(x=>x.includes('형상')));
  assert.equal(questions(p.equipment[0]).length,0);
});

test('photo references and review metadata survive snapshots; unsafe images and references fail',()=>{
 const p=sampleProject();
 p.photos=[{id:'photo-1',data:'data:image/jpeg;base64,/9j/2Q=='}];p.equipment[0].photoId='photo-1';
 p.inspections.push(createInspection(p));
 const restored=validateProject(p);assert.equal(restored.schema,4);
 assert.equal(restored.inspections[0].basis.equipment[0].photoId,'photo-1');
 p.photos[0].data='data:image/svg+xml;base64,PHN2Zz4=';assert.throws(()=>validateProject(p));
 p.photos=[];assert.throws(()=>validateProject(p));
});
