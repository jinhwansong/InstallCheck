import type { CadCandidate } from './dxf.ts';
import type { Box } from './model.ts';
import { prepareMesh } from './import3d.ts';
export interface CadPlacement extends Box {name:string;role:'wall'|'column'|'equipment';positions?:number[]}
export function openCadImport(add:(items:CadPlacement[],source:string)=>boolean){
 const dialog=document.createElement('dialog');dialog.className='model-dialog cad-dialog';dialog.setAttribute('aria-labelledby','cad-title');
 dialog.innerHTML=`<form><span class="eyebrow">DRAWING REVIEW</span><h2 id="cad-title">도면에서 객체 가져오기</h2><p>DXF 레이어·블록 또는 3D 메시별로 후보를 추출합니다. 종류는 이름에 따른 제안이며 사용자가 확인해야 합니다.</p><label class="field">도면 파일<input type="file" accept=".dxf,.obj,.glb,.stl" required/></label><div class="field-grid"><label class="field">좌표 1단위<select name="unit"><option value="1">1 mm</option><option value="10">1 cm</option><option value="1000">1 m</option></select></label><label class="field">3D 상향 축<select name="up"><option value="Y">Y 위쪽</option><option value="Z">Z 위쪽</option></select></label><label class="field">배치 시작 X mm<input type="number" name="offsetX" value="0" min="-100000" max="100000" required/></label><label class="field">배치 시작 Z mm<input type="number" name="offsetZ" value="0" min="-100000" max="100000" required/></label></div><p class="hint">전체 후보의 최소 X/Z를 원점으로 옮기고 상대 위치를 유지합니다. DXF X/Y는 현장의 X/Z입니다. 단위·축을 바꾸면 표의 수정값이 초기화됩니다.</p><div class="cad-status" role="status">파일을 선택하세요. 최대 100개 후보 / 10 MB (DXF 5 MB).</div><canvas class="cad-preview" width="900" height="230" aria-label="추출 객체의 평면 배치 미리보기"></canvas><div class="cad-table-wrap"><table class="cad-table"><thead><tr><th>종류</th><th>이름 / 레이어</th><th>X</th><th>Z</th><th>폭</th><th>깊이</th><th>높이</th><th>바닥 Y</th></tr></thead><tbody></tbody></table></div><p class="cad-warnings hint"></p><p class="import-error" role="alert"></p><div class="import-limit">DXF는 UTF-8 ASCII의 LINE·CIRCLE·직선 LWPOLYLINE·일반 INSERT 블록만 지원합니다. DWG는 DXF로 내보내세요. 높이는 직접 입력하고, 선의 폭·두께 기본값도 수정하세요. 곡선·회전 형상의 빈 공간을 포함하는 보수적 외곽 상자로 검사합니다. 3D 분리는 메시 단위이며 부품이 기계 하나를 뜻하지 않을 수 있습니다.</div><label class="import-confirm"><input type="checkbox" name="confirmed" required/> 제외 내역과 객체 종류·위치·치수·단위를 확인했습니다.</label><div class="import-actions"><button class="button" type="button" data-close>취소</button><button class="button primary" type="submit" disabled>선택 객체 등록</button></div></form>`;
 const previewNote=document.createElement('p');previewNote.className='hint';previewNote.textContent='위 미리보기는 추출 원본입니다. 표에서 수정한 값과 배치 시작 위치는 등록 후 3D 화면에 반영됩니다.';dialog.querySelector('canvas')!.after(previewNote);
 document.body.append(dialog);dialog.showModal();
 const form=dialog.querySelector('form')!,fileInput=dialog.querySelector<HTMLInputElement>('[type=file]')!,unit=dialog.querySelector<HTMLSelectElement>('[name=unit]')!,up=dialog.querySelector<HTMLSelectElement>('[name=up]')!,body=dialog.querySelector('tbody')!,error=dialog.querySelector('.import-error')!,status=dialog.querySelector('.cad-status')!,warnings=dialog.querySelector('.cad-warnings')!,submit=dialog.querySelector<HTMLButtonElement>('[type=submit]')!,confirmed=dialog.querySelector<HTMLInputElement>('[name=confirmed]')!;
 let candidates:CadCandidate[]=[],objects:{name:string;positions:number[]}[]=[],messages:string[]=[],filename='',worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|undefined;
 let placements:CadPlacement[]=[],loadVersion=0;
 const stop=()=>{worker?.terminate();worker=null;clearTimeout(timer);};
 const preview=()=>{
  const canvas=dialog.querySelector('canvas')!,ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,900,230);ctx.fillStyle='#f1f5f9';ctx.fillRect(0,0,900,230);
  const maxX=Math.max(1,...placements.map(p=>p.x+p.w/2)),maxZ=Math.max(1,...placements.map(p=>p.z+p.d/2)),scale=Math.min(850/maxX,190/maxZ);
  for(const p of placements){ctx.strokeStyle=p.role==='equipment'?'#2563eb':'#64748b';ctx.strokeRect(20+(p.x-p.w/2)*scale,20+(p.z-p.d/2)*scale,Math.max(2,p.w*scale),Math.max(2,p.d*scale));}
 };
 const redraw=()=>{
  placements=[];body.replaceChildren();error.textContent='';confirmed.checked=false;submit.disabled=true;const notes=[...messages];
  try{
   const scale=Number(unit.value),axis=up.value as 'Y'|'Z';
   let raw=candidates;
   if(objects.length)raw=objects.flatMap(o=>{
    try{
     const prepared=prepareMesh(o.positions,scale,axis),min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
     for(let i=0;i<o.positions.length;i+=3){const p=axis==='Y'?o.positions.slice(i,i+3):[o.positions[i],o.positions[i+2],-o.positions[i+1]];for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);}}
     return [{name:o.name,layer:'3D 메시',min,max,positions:prepared.positions}];
    }catch(e){notes.push(`${o.name}: ${e instanceof Error?e.message:'형상 오류'}`);return [];}
   });
   const origin=[Math.min(...raw.map(c=>c.min[0])),Math.min(...raw.map(c=>c.min[1])),Math.min(...raw.map(c=>c.min[2]))];
   for(const c of raw){
    const kind=/wall|벽/i.test(c.name+' '+c.layer)?'wall':/column|pillar|기둥/i.test(c.name+' '+c.layer)?'column':'equipment';
    const p:CadPlacement={name:c.name,role:kind,x:Math.round(((c.min[0]+c.max[0])/2-origin[0])*scale),z:Math.round(((c.min[2]+c.max[2])/2-origin[2])*scale),y:Math.round((c.min[1]-origin[1])*scale),w:Math.max(200,Math.ceil((c.max[0]-c.min[0])*scale)),d:Math.max(200,Math.ceil((c.max[2]-c.min[2])*scale)),h:objects.length?Math.ceil((c.max[1]-c.min[1])*scale):0,angle:0,...(c.positions?{positions:c.positions}:{})};
    // Only zero-width DXF lines need a user-confirmed thickness; preserve positive dimensions.
    p.w=(c.max[0]-c.min[0])*scale>0?Math.max(1,Math.ceil((c.max[0]-c.min[0])*scale)):200;
    p.d=(c.max[2]-c.min[2])*scale>0?Math.max(1,Math.ceil((c.max[2]-c.min[2])*scale)):200;
    placements.push(p);const row=document.createElement('tr');
    row.innerHTML='<td><select aria-label="등록 종류"><option value="skip">제외</option><option value="wall">벽</option><option value="column">기둥</option><option value="equipment">설비</option></select></td><td><input aria-label="객체 이름" maxlength="120" required/><small></small></td>'+(['x','z','w','d','h','y'] as const).map(key=>`<td><input aria-label="${key}" data-key="${key}" type="number" step="1" min="${key==='x'||key==='z'?-100000:key==='y'?0:1}" max="100000" required/></td>`).join('');
    row.querySelector('select')!.value=kind;row.querySelector<HTMLInputElement>('[aria-label="객체 이름"]')!.value=c.name;row.querySelector('small')!.textContent=c.layer;
    row.querySelectorAll<HTMLInputElement>('[data-key]').forEach(input=>{const key=input.dataset.key as 'x'|'z'|'w'|'d'|'h'|'y';input.value=key==='h'&&!p.h?'':String(p[key]);});
    row.querySelector('select')!.onchange=()=>{const skip=row.querySelector('select')!.value==='skip';row.querySelectorAll('input').forEach(input=>input.disabled=skip);confirmed.checked=false;};
    body.append(row);
   }
   status.textContent=`${placements.length}개 후보 · DXF 높이는 직접 입력 · 이름에 따른 종류는 제안입니다.`;warnings.textContent=notes.length?`제외 내역: ${notes.join(' / ')}`:'지원 범위 밖의 객체는 별도로 확인하세요.';submit.disabled=!placements.length;preview();
  }catch(e){error.textContent=e instanceof Error?e.message:'도면을 처리하지 못했습니다.';}
 };
 unit.onchange=up.onchange=redraw;
 body.addEventListener('input',()=>confirmed.checked=false);
 form.addEventListener('input',event=>{if(event.target!==confirmed)confirmed.checked=false;});
 fileInput.onchange=async()=>{
  const version=++loadVersion;
  stop();candidates=[];objects=[];messages=[];placements=[];body.replaceChildren();submit.disabled=true;confirmed.checked=false;error.textContent='';warnings.textContent='';preview();
  const file=fileInput.files?.[0];if(!file)return;filename=file.name;
  const maxBytes=(/\.dxf$/i.test(filename)?5:10)*1024*1024;
  if(file.size>maxBytes){error.textContent=`파일은 ${maxBytes/1024/1024} MB 이하로 줄여주세요.`;return;}
  unit.value=/\.glb$/i.test(filename)?'1000':'1';up.value='Y';up.disabled=/\.dxf$/i.test(filename);status.textContent='객체를 읽는 중…';
  try{
   const active=new Worker(new URL('./import-worker.ts',import.meta.url),{type:'module'});worker=active;
   const fail=(message:string)=>{if(worker!==active)return;stop();error.textContent=message;status.textContent='현재 프로젝트는 변경되지 않았습니다.';};
   active.onmessage=e=>{if(worker!==active)return;if(e.data.error){fail(e.data.error);return;}candidates=e.data.candidates??[];objects=e.data.objects??[];messages=e.data.warnings??[];stop();redraw();};
   active.onerror=()=>fail('파일 처리에 실패했습니다. 단순화한 파일로 다시 시도하세요.');timer=setTimeout(()=>fail('15초를 초과했습니다. 필요한 구역만 내보내세요.'),15000);
   const buffer=await file.arrayBuffer();if(worker===active)active.postMessage({buffer,name:filename,objects:true},[buffer]);
  }catch(e){if(version!==loadVersion||!dialog.open)return;stop();error.textContent=e instanceof Error?e.message:'파일을 열지 못했습니다.';}
 };
 form.onsubmit=e=>{
  e.preventDefault();if(!form.reportValidity()||submit.disabled)return;error.textContent='';
  const f=new FormData(form),items:CadPlacement[]=[];
  body.querySelectorAll('tr').forEach((row,i)=>{const role=row.querySelector('select')!.value;if(role==='skip')return;const p={...placements[i],role:role as CadPlacement['role'],name:row.querySelector<HTMLInputElement>('[aria-label="객체 이름"]')!.value};row.querySelectorAll<HTMLInputElement>('[data-key]').forEach(input=>{p[input.dataset.key as 'x'|'z'|'w'|'d'|'h'|'y']=Number(input.value);});p.x+=Number(f.get('offsetX'));p.z+=Number(f.get('offsetZ'));items.push(p);});
  if(!items.length){error.textContent='등록할 객체를 하나 이상 선택하세요.';return;}
  if(add(items,filename))dialog.close();else error.textContent='등록하지 못했습니다. 프로젝트 한도(설비 40개·장애물 100개), 치수 및 메시 한도를 확인하세요.';
 };
 dialog.querySelector('[data-close]')!.addEventListener('click',()=>dialog.close());dialog.onclose=()=>{loadVersion++;stop();dialog.remove();};
}
