import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleProject, validateProject, fingerprint, createInspection, isStale } from '../src/model.ts';
import type { Project } from '../src/model.ts';
import { inspect, worldBoxes, overlap } from '../src/inspection.ts';

test('compound model changes invalidate snapshots and do not mutate history', () => {
  const p = sampleProject();
  const saved = createInspection(p);
  p.inspections.push(saved);
  assert.equal(isStale(p, saved), false);
  p.equipment[0].parts[1].w += 400;
  assert.equal(isStale(p, saved), true);
  assert.notEqual(saved.basis.equipment[0].parts[1].w, p.equipment[0].parts[1].w);
  const f = fingerprint(p);
  p.inspections = [];
  assert.equal(fingerprint(p), f);
});

test('rotated compound parts use the assembly transform', () => {
  const p = sampleProject();
  const e = p.equipment[0]; e.x = 4000; e.z = 4000; e.angle = 90;
  e.parts = [{ id: 'p', name: 'test', x: 1000, y: 0, z: 0, w: 1000, d: 500, h: 500 }];
  const b = worldBoxes(e)[0];
  assert.ok(Math.abs(b.x-4000)<0.001);
  assert.ok(Math.abs(b.z-3000)<0.001);
});

test('oriented box intersection rejects AABB false positives and finds contact', () => {
  const a = {x:0,y:0,z:0,w:4000,d:100,h:100,angle:45};
  const b = {...a,x:300,z:300};
  assert.equal(overlap(a,b), false);
  assert.equal(overlap({...a,angle:0},{...a,angle:0,x:4000}), true);
});

test('room boundaries, obstacles and upper clearances are checked', () => {
  const p = sampleProject(); p.site.height = 2200;
  p.equipment[0].x = -500;
  let r = inspect(p);
  assert.ok(r.some(i=>i.rule==='boundary' && i.status==='error'));
  assert.ok(r.some(i=>i.rule==='ceiling' && i.status==='error'));
  const e = p.equipment[0]; e.x=4000;e.z=4000;
  p.obstacles=[{id:'ob',name:'column',x:4000,z:4000,y:0,w:500,d:500,h:3000,angle:0}];
  r=inspect(p);
  assert.ok(r.some(i=>i.rule==='collision' && i.status==='error'));
});

test('missing site measurements never pass', () => {
  const p = sampleProject(); p.site.height=null;p.site.doorWidth=null;p.site.measuredAt='';
  const r=inspect(p);
  assert.ok(r.some(i=>i.rule==='ceiling' && i.status==='unknown'));
  assert.ok(r.some(i=>i.rule==='door' && i.status==='unknown'));
  assert.ok(r.some(i=>i.rule==='measurement' && i.status==='unknown'));
});

test('import rejects invalid geometry, duplicate ids, huge arrays and forged history', () => {
  const p=sampleProject(); assert.doesNotThrow(()=>validateProject(JSON.parse(JSON.stringify(p))));
  p.equipment[0].parts[0].w=-10;assert.throws(()=>validateProject(p));
  const q=sampleProject();q.obstacles[0].id=q.equipment[0].id;assert.throws(()=>validateProject(q));
  const a=sampleProject();a.equipment=Array(101).fill(a.equipment[0]);assert.throws(()=>validateProject(a));
  const b=sampleProject();b.inspections=[{id:'fake'} as never];assert.throws(()=>validateProject(b));
});

test('separated height and zero clearance do not invent an overlap', () => {
  const a={x:1000,y:0,z:1000,w:500,d:500,h:500,angle:37};
  assert.equal(overlap(a,{...a,y:501}),false);
  assert.equal(overlap(a,{...a,y:520},20),true);
});

test('known clear scene passes supported rules while undersized door warns', () => {
  const p=sampleProject();p.obstacles=[];
  p.equipment[0].parts=[{id:'only',name:'small',x:0,y:0,z:0,w:1000,d:1000,h:1000}];
  assert.equal(inspect(p).filter(f=>f.rule!=='evidence').every(f=>f.status==='pass'),true);
  assert.ok(inspect(p).some(f=>f.rule==='evidence'&&f.status==='unknown'));
  p.site.doorWidth=900;
  assert.equal(inspect(p).find(f=>f.rule==='door')?.status,'warning');
});

test('import recalculates tampered findings and rejects unsupported engine', () => {
  const p=sampleProject();p.inspections.push(createInspection(p));p.inspections[0].findings=[];
  const restored=validateProject(p);
  assert.ok(restored.inspections[0].findings.some(f=>f.status==='error'));
  (p.inspections[0] as {engine:string}).engine='9.0';
  assert.throws(()=>validateProject(p));
});

test('input validation rejects nonfinite values, invalid dates and empty assemblies', () => {
  for(const mutate of [(p:Project)=>p.site.width=NaN,(p:Project)=>p.site.measuredAt='2026-02-30',(p:Project)=>p.equipment[0].parts=[]]){
    const p=sampleProject();mutate(p);assert.throws(()=>validateProject(p));
  }
});
