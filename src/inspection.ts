import type { Basis, Box, Equipment, Finding, Status } from './model.ts';

const rad=(a:number)=>a*Math.PI/180;
function turn(x:number,z:number,angle:number) {const a=rad(angle);return {x:x*Math.cos(a)+z*Math.sin(a),z:-x*Math.sin(a)+z*Math.cos(a)};}
export function worldBoxes(e:Equipment):Box[] {return e.parts.map(p=>{const v=turn(p.x,p.z,e.angle);return {...p,x:e.x+v.x,z:e.z+v.z,angle:e.angle};});}
export function corners(b:Box) {return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>{const p=turn(x*b.w/2,z*b.d/2,b.angle);return {x:b.x+p.x,z:b.z+p.z};});}
export function overlap(a:Box,b:Box,margin=0):boolean {
  if(a.y+a.h+margin<b.y||b.y+b.h+margin<a.y)return false;
  const pa=corners(a),pb=corners(b);
  for(const box of [a,b]) for(const direction of [[1,0],[0,1]]) {
    const axis=turn(direction[0],direction[1],box.angle);
    const aa=pa.map(p=>p.x*axis.x+p.z*axis.z),bb=pb.map(p=>p.x*axis.x+p.z*axis.z);
    if(Math.max(...aa)+margin<Math.min(...bb)-1e-7||Math.max(...bb)+margin<Math.min(...aa)-1e-7)return false;
  }
  return true;
}
export function envelope(e:Equipment,service=false):Box {
  const minX=Math.min(...e.parts.map(p=>p.x-p.w/2)),maxX=Math.max(...e.parts.map(p=>p.x+p.w/2));
  const minZ=Math.min(...e.parts.map(p=>p.z-p.d/2)),maxZ=Math.max(...e.parts.map(p=>p.z+p.d/2));
  const cl=service?e.clearance:{left:0,right:0,front:0,back:0,top:0};
  const x0=minX-cl.left,x1=maxX+cl.right,z0=minZ-cl.back,z1=maxZ+cl.front;
  const center=turn((x0+x1)/2,(z0+z1)/2,e.angle);
  return {x:e.x+center.x,z:e.z+center.z,y:0,w:x1-x0,d:z1-z0,h:Math.max(...e.parts.map(p=>p.y+p.h))+cl.top,angle:e.angle};
}
export function inspect(p:Basis):Finding[] {
  const out:Finding[]=[];
  const add=(rule:string,status:Status,title:string,detail:string,equipmentId?:string)=>out.push({id:`finding-${out.length}`,rule,status,title,detail,equipmentId});
  const fmt=(n:number)=>Math.round(n).toLocaleString('ko-KR');
  const t=p.site.tolerance;
  if(!p.site.measuredAt)add('measurement','unknown','현장 실측일 미확인','현장 담당자에게 치수의 기준일과 최신 여부를 확인하세요.');
  if(!p.equipment.length)add('equipment','unknown','검토할 설비가 없습니다','설비를 추가한 뒤 검사를 실행하세요.');
  // ponytail: pairwise checks for <=250 parts; add a spatial index if measured latency grows.
  for(const e of p.equipment) {
    const boxes=worldBoxes(e),targets=[...p.obstacles.map(o=>({name:o.name,box:o})),...p.equipment.filter(o=>o.id!==e.id).flatMap(o=>worldBoxes(o).map(box=>({name:o.name,box})))];
    const outside=(box:Box,margin=0)=>corners(box).some(c=>c.x<margin||c.z<margin||c.x>p.site.width-margin||c.z>p.site.depth-margin);
    const hits=[...new Set(targets.filter(o=>boxes.some(b=>overlap(b,o.box))).map(o=>o.name))];
    const near=[...new Set(targets.filter(o=>boxes.some(b=>overlap(b,o.box,t))).map(o=>o.name))];
    add('collision',hits.length?'error':near.length?'warning':'pass',hits.length?'구성요소 간섭 발견':near.length?'장애물과 여유 부족':'구성요소 간섭 없음',hits.length?`${hits.join(', ')}와 접촉 또는 겹칩니다.`:near.length?`${near.join(', ')}와 판정 여유 ${fmt(t)} mm 이내입니다.`:'등록된 설비 구성요소와 장애물 기준입니다.',e.id);
    const boundary=boxes.some(b=>outside(b)),edge=boxes.some(b=>outside(b,t));
    add('boundary',boundary?'error':edge?'warning':'pass',boundary?'현장 경계 이탈':edge?'현장 경계에 근접':'설치 구역 내 배치',`현장 ${fmt(p.site.width)} × ${fmt(p.site.depth)} mm 기준. 벽의 돌출물은 장애물로 등록하세요.`,e.id);
    const full=envelope(e),service=envelope(e,true);
    if(p.site.height===null)add('ceiling','unknown','천장 높이 미확인','천장 높이를 입력해야 상부 공간을 확인할 수 있습니다.',e.id);
    else {const gap=p.site.height-full.h,required=e.clearance.top;
      add('ceiling',gap<0?'error':gap<required+t?'warning':'pass',gap<0?'천장 높이 초과':gap<required+t?'상부 정비공간 부족':'상부 공간 기준 충족',`상부 여유 ${fmt(gap)} mm / 필요 ${fmt(required)} mm + 판정 여유 ${fmt(t)} mm`,e.id);}
    const blocks=[...new Set(targets.filter(o=>overlap(service,o.box,t)).map(o=>o.name))];
    add('clearance',blocks.length||outside(service,t)?'warning':'pass',blocks.length||outside(service,t)?'작업·정비공간 확인 필요':'작업·정비공간 기준 충족',blocks.length?`${blocks.join(', ')}가 보수적인 정비공간 외곽에 들어옵니다.`:outside(service,t)?'정비공간이 현장 경계를 넘거나 판정 여유가 부족합니다.':'입력한 전·후·좌·우 여유를 외곽 상자에 적용했습니다.',e.id);
    if(p.site.doorWidth===null||p.site.doorHeight===null)add('door','unknown','출입문 치수 미확인','문 유효 폭·높이를 입력하세요. 반입 경로는 검사하지 않습니다.',e.id);
    else {const width=full.w+t*2,height=full.h+t;
      const ok=width<=p.site.doorWidth&&height<=p.site.doorHeight;
      add('door',ok?'pass':'warning',ok?'출입문 치수 비교 충족':'출입문 치수 확인 필요',`설비 로컬 폭 방향 ${fmt(width)} × 높이 ${fmt(height)} mm (여유 포함). 문 ${fmt(p.site.doorWidth)} × ${fmt(p.site.doorHeight)} mm. 회전 반입·경로·운반장비 미검사.`,e.id);}
  }
  return out;
}
