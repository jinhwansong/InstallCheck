import { prepareMesh, MAX_MODEL_BYTES } from './import3d.ts';
import type { MeshAsset } from './model.ts';

export interface ImportedModel { asset:MeshAsset; size:{w:number;d:number;h:number} }

export function openModelImport(onImport:(model:ImportedModel)=>boolean) {
  const dialog=document.createElement('dialog');dialog.className='model-dialog';
  dialog.setAttribute('aria-labelledby','model-title');
  dialog.innerHTML=`<form><div class="import-heading"><span class="eyebrow">LOCAL MODEL IMPORT</span><button type="button" class="text-button" data-close aria-label="닫기">✕</button></div><h2 id="model-title">3D 파일을 설비로 가져오기</h2><p>기존 CAD에서 내보낸 GLB·STL·OBJ를 읽습니다.<br/>파일은 외부 서버로 전송되지 않습니다.</p><label class="file-drop">파일 선택<input type="file" accept=".glb,.stl,.obj" required/><small>최대 10 MB · 삼각형 20,000개 · 텍스처 없는 정적 형상</small></label><div class="field-grid"><label class="field"><span>파일 좌표 1단위</span><select name="unit"><option value="1">1 mm (밀리미터)</option><option value="10">1 cm (센티미터)</option><option value="1000">1 m (미터)</option></select></label><label class="field"><span>원본의 위쪽 축</span><select name="up"><option value="Y">Y 위쪽</option><option value="Z">Z 위쪽</option></select></label></div><div class="import-size" role="status">파일을 선택하면 가져올 크기가 표시됩니다.</div><p class="import-error" role="alert"></p><label class="import-confirm"><input type="checkbox" required/> 아래 제한을 이해했으며, 표시된 크기와 상향 축을 확인했습니다.</label><div class="import-limit"><strong>형상 표시와 검사 범위는 다릅니다.</strong><br/>형상은 표시용이며 간섭 검사는 외곽 상자 기준입니다. 오목한 부분·빈 공간의 정밀 간섭은 검사하지 않습니다. 재질·색상·텍스처는 가져오지 않습니다. STEP·DWG·이미지 자동 3D 생성은 아직 지원하지 않습니다.</div><div class="import-actions"><button type="button" class="button" data-close>취소</button><button type="submit" class="button primary" disabled>설비로 추가</button></div></form>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form')!,fileInput=dialog.querySelector<HTMLInputElement>('input[type=file]')!,unit=dialog.querySelector<HTMLSelectElement>('[name=unit]')!,up=dialog.querySelector<HTMLSelectElement>('[name=up]')!,confirm=dialog.querySelector<HTMLInputElement>('input[type=checkbox]')!,submit=dialog.querySelector<HTMLButtonElement>('[type=submit]')!,status=dialog.querySelector('.import-size')!,error=dialog.querySelector('.import-error')!;
  let raw:number[]|null=null,worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|undefined,filename='';
  const stop=()=>{worker?.terminate();worker=null;clearTimeout(timer);};
  const dimensions=()=>{
    error.textContent='';submit.disabled=true;
    if(!raw)return;
    try {const result=prepareMesh(raw,Number(unit.value),up.value as 'Y'|'Z');status.textContent=`폭 ${result.size.w.toLocaleString()} × 깊이 ${result.size.d.toLocaleString()} × 높이 ${result.size.h.toLocaleString()} mm · 삼각형 ${(raw.length/9).toLocaleString()}개`;submit.disabled=false;}
    catch(e){status.textContent='크기를 확인할 수 없습니다.';error.textContent=e instanceof Error?e.message:'형상을 확인하세요.';}
  };
  unit.onchange=up.onchange=()=>{confirm.checked=false;dimensions();};
  fileInput.onchange=async()=>{
    stop();raw=null;submit.disabled=true;error.textContent='';confirm.checked=false;
    const file=fileInput.files?.[0];if(!file)return;
    filename=file.name.slice(0,120);
    unit.value=file.name.toLowerCase().endsWith('.glb')?'1000':'1';up.value='Y';
    if(file.size>MAX_MODEL_BYTES){error.textContent='10 MB 이하의 파일을 선택하세요.';return;}
    status.textContent='파일을 읽는 중입니다…';
    let active:Worker;
    try {active=new Worker(new URL('./import-worker.ts',import.meta.url),{type:'module'});worker=active;}
    catch {status.textContent='불러오지 못했습니다.';error.textContent='브라우저에서 파일 처리 작업을 시작할 수 없습니다.';return;}
    const failure=(message:string)=>{if(worker!==active)return;stop();error.textContent=message;status.textContent='불러오지 못했습니다. 현재 프로젝트는 변경되지 않았습니다.';};
    active.onmessage=e=>{
      if(worker!==active)return;
      if(e.data.error){failure(e.data.error);return;}
      raw=e.data.positions;stop();dimensions();
    };
    active.onerror=()=>failure('파일 처리 중 오류가 발생했습니다. 단순화한 파일로 다시 시도하세요.');
    timer=setTimeout(()=>failure('파일 처리 시간이 15초를 넘었습니다. 면 수를 줄여주세요.'),15000);
    try {const buffer=await file.arrayBuffer();if(worker===active)active.postMessage({buffer,name:filename},[buffer]);}
    catch {failure('파일을 읽지 못했습니다.');}
  };
  form.onsubmit=e=>{
    e.preventDefault();if(!raw||submit.disabled||!form.reportValidity())return;
    try {const model=prepareMesh(raw,Number(unit.value),up.value as 'Y'|'Z');if(onImport({asset:{id:crypto.randomUUID(),name:filename,positions:model.positions},size:model.size}))dialog.close();}
    catch(e){error.textContent=e instanceof Error?e.message:'추가하지 못했습니다.';}
  };
  dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('close',()=>{stop();dialog.remove();});
  dialog.showModal();
}
