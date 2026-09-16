// ponytail: bounded ASCII 2D DXF subset; unsupported entities are reported, never silently inferred.
export interface CadCandidate { name:string; layer:string; min:[number,number,number]; max:[number,number,number]; positions?:number[] }
type Pair=[number,string];
type Entity={type:string;pairs:Pair[]};
type Matrix=[number,number,number,number,number,number];
const identity:Matrix=[1,0,0,1,0,0];
const value=(e:Entity,code:number,fallback='')=>e.pairs.find(p=>p[0]===code)?.[1]??fallback;
function num(e:Entity,code:number,fallback=0){const n=Number(value(e,code,String(fallback)));if(!Number.isFinite(n)||Math.abs(n)>1e9)throw new Error('유효하지 않은 DXF 좌표입니다.');return n;}
const transform=(m:Matrix,x:number,y:number):[number,number]=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
function multiply(a:Matrix,b:Matrix):Matrix {const t=transform(a,b[4],b[5]);return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],...t];}
export function parseDxf(text:string):{candidates:CadCandidate[];warnings:string[]} {
  if(text.length>5*1024*1024||text.includes('\0'))throw new Error('5 MB 이하의 텍스트 DXF만 지원합니다. DWG는 ASCII DXF로 내보내세요.');
  const lines=text.replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);
  if(lines.length%2)throw new Error('DXF 그룹 코드 쌍이 손상됐습니다.');
  const records:Entity[]=[];let record:Entity|undefined;
  for(let i=0;i<lines.length;i+=2){
    const code=Number(lines[i].trim()),v=lines[i+1].trim();
    if(!/^\d+$/.test(lines[i].trim())||code>1071)throw new Error('DXF 그룹 코드가 올바르지 않습니다.');
    if(code===0){record={type:v,pairs:[]};records.push(record);}else record?.pairs.push([code,v]);
  }
  if(!records.some(e=>e.type==='EOF'))throw new Error('완전한 DXF 파일을 선택하세요.');
  const blocks=new Map<string,{base:[number,number];items:Entity[]}>(),entities:Entity[]=[];
  let section='',block:ReturnType<typeof blocks.get>,found=false;
  for(const e of records){
    if(e.type==='SECTION'){section=value(e,2);if(section==='ENTITIES')found=true;continue;}
    if(e.type==='ENDSEC'){section='';block=undefined;continue;}
    if(section==='BLOCKS'){
      if(e.type==='BLOCK'){block={base:[num(e,10),num(e,20)],items:[]};blocks.set(value(e,2),block);}
      else if(e.type==='ENDBLK')block=undefined;else block?.items.push(e);
    }else if(section==='ENTITIES')entities.push(e);
  }
  if(!found)throw new Error('DXF ENTITIES 구역이 없습니다.');
  const skipped=new Map<string,number>();let visits=0;
  const skip=(reason:string)=>{skipped.set(reason,(skipped.get(reason)??0)+1);return [] as [number,number][];};
  function points(e:Entity,m:Matrix,stack:string[]=[]):[number,number][] {
    if(++visits>10000)throw new Error('DXF 객체가 너무 많습니다. 필요한 구역만 내보내세요.');
    if(num(e,67)!==0)return skip('도면 공간 객체');
    if(num(e,210)!==0||num(e,220)!==0||num(e,230,1)!==1||num(e,30)!==0||num(e,31)!==0||num(e,38)!==0||num(e,39)!==0)return skip('3D 또는 비표준 축 객체');
    if(e.type==='INSERT'){
      const name=value(e,2),b=blocks.get(name);
      if(!b)return skip('외부 참조 또는 미정의 블록');
      if(stack.includes(name)||stack.length>=8)throw new Error('순환하거나 지나치게 깊은 DXF 블록입니다.');
      if(num(e,70,1)!==1||num(e,71,1)!==1)return skip('배열 블록');
      const a=num(e,50)*Math.PI/180,sx=num(e,41,1),sy=num(e,42,1),c=Math.cos(a),s=Math.sin(a);
      if(!sx||!sy)return skip('배율 0 블록');
      const local:Matrix=[c*sx,s*sx,-s*sy,c*sy,num(e,10)-c*sx*b.base[0]+s*sy*b.base[1],num(e,20)-s*sx*b.base[0]-c*sy*b.base[1]];
      const before=new Map(skipped);
      const result=b.items.flatMap(child=>points(child,multiply(m,local),[...stack,name]));
      if([...skipped].some(([type,count])=>count>(before.get(type)??0)&&!['TEXT','MTEXT','ATTDEF','ATTRIB','SEQEND'].includes(type)))return skip('일부 형상을 읽을 수 없는 블록 전체');
      return result;
    }
    let pts:[number,number][]=[];
    if(e.type==='LINE')pts=[[num(e,10),num(e,20)],[num(e,11),num(e,21)]];
    else if(e.type==='CIRCLE'){
      const radius=num(e,40);if(radius<=0)return skip('잘못된 원');
      // Exact transformed ellipse bounds, including nonuniform block scale.
      const [x,y]=transform(m,num(e,10),num(e,20)),rx=radius*Math.hypot(m[0],m[2]),ry=radius*Math.hypot(m[1],m[3]);
      return [[x-rx,y-ry],[x+rx,y+ry]];
    }else if(e.type==='LWPOLYLINE'){
      if(e.pairs.some(([code,v])=>[40,41,42,43].includes(code)&&Number(v)!==0))return skip('곡선 또는 폭이 있는 폴리라인');
      let x:number|undefined;
      for(const [code,v] of e.pairs){if(code===10){if(x!==undefined)throw new Error('폴리라인 정점이 손상됐습니다.');x=Number(v);}if(code===20){if(x===undefined)throw new Error('폴리라인 정점이 손상됐습니다.');pts.push([x,Number(v)]);x=undefined;}}
      if(x!==undefined||pts.length<2||pts.length!==num(e,90))throw new Error('폴리라인 정점 수가 올바르지 않습니다.');
    }else return skip(e.type);
    if(pts.some(p=>p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e9)))throw new Error('잘못된 DXF 정점입니다.');
    return pts.map(([x,y])=>transform(m,x,y));
  }
  const candidates:CadCandidate[]=[];
  for(const e of entities){
    const pts=points(e,identity);if(!pts.length)continue;
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
    candidates.push({name:(e.type==='INSERT'?value(e,2):`${value(e,8,'0')} / ${e.type}`).slice(0,120),layer:value(e,8,'0').slice(0,120),min:[Math.min(...xs),0,Math.min(...ys)],max:[Math.max(...xs),0,Math.max(...ys)]});
    if(candidates.length>100)throw new Error('객체 후보가 100개를 넘습니다. 필요한 레이어만 내보내세요.');
  }
  return {candidates,warnings:[...skipped].map(([type,count])=>`${type}: ${count}개 제외`)};
}
