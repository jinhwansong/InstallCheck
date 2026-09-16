export async function readPhoto(file:File):Promise<string> {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('8 MB 이하의 JPG·PNG·WebP 사진을 선택하세요.');
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width*bitmap.height>24000000)throw new Error('2,400만 화소 이하로 줄여주세요.');
    const ratio=Math.min(1,640/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/jpeg',.65);
    if(data.length>180000)throw new Error('사진이 너무 복잡합니다. 배경을 잘라내거나 해상도를 줄여주세요.');
    return data;
  } finally {bitmap.close();}
}
export function openPhotoImport(add:(input:{name:string;model:string;source:string;data:string;w:number;d:number;h:number})=>boolean){
  const dialog=document.createElement('dialog');dialog.className='model-dialog';
  dialog.setAttribute('aria-labelledby','photo-title');
  dialog.innerHTML=`<form><span class="eyebrow">EQUIPMENT LIBRARY</span><h2 id="photo-title">사진으로 설비 등록</h2><p>사진은 식별용으로 저장합니다. 3D 배치와 검사는 아래 입력한 외곽 치수를 사용하며 사진에서 치수를 추정하지 않습니다.</p><label class="field">설비 사진<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required/></label><img class="photo-preview" alt="선택한 설비 사진" hidden/><label class="field">설비명<input name="name" maxlength="120" required/></label><label class="field">모델명<input name="model" maxlength="120"/></label><label class="field">치수 출처 (예: 제조사 사양서 3쪽)<input name="source" maxlength="500"/></label><div class="field-grid three">${[['w','폭'],['d','깊이'],['h','높이']].map(([key,label])=>`<label class="field">${label} mm<input name="${key}" type="number" min="1" max="100000" step="1" required/></label>`).join('')}</div><p class="hint">입력값은 먼저 미확인으로 등록됩니다. 이후 담당자·확인일과 함께 확인 기록을 남기세요. 사진은 축소 저장되며 외부로 전송하지 않습니다.</p><p role="alert" class="import-error"></p><div class="import-actions"><button type="button" class="button" data-close>취소</button><button class="button primary" type="submit">설비 등록</button></div></form>`;
  document.body.append(dialog);dialog.showModal();
  const form=dialog.querySelector('form')!,input=dialog.querySelector<HTMLInputElement>('[name=photo]')!,error=dialog.querySelector('.import-error')!,submit=dialog.querySelector<HTMLButtonElement>('[type=submit]')!,preview=dialog.querySelector<HTMLImageElement>('img')!;
  let data='',generation=0;
  input.onchange=async()=>{
    const generationNow=++generation;data='';preview.hidden=true;submit.disabled=true;error.textContent='';
    try {const file=input.files?.[0];if(!file)return;const result=await readPhoto(file);if(generationNow!==generation||!dialog.open)return;data=result;preview.src=data;preview.hidden=false;}
    catch(e){if(generationNow===generation)error.textContent=e instanceof Error?e.message:'사진을 읽지 못했습니다.';}
    finally{if(generationNow===generation)submit.disabled=false;}
  };
  form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity()||submit.disabled)return;if(!data){error.textContent='유효한 사진을 선택하세요.';return;}
    const f=new FormData(form);if(add({name:String(f.get('name')),model:String(f.get('model')),source:String(f.get('source')),data,w:Number(f.get('w')),d:Number(f.get('d')),h:Number(f.get('h'))}))dialog.close();
    else error.textContent='등록하지 못했습니다. 설비 40개·보존 사진 20개 및 사진 전체 용량 한도를 확인하세요.';
  };
  dialog.querySelector('[data-close]')!.addEventListener('click',()=>dialog.close());
  dialog.onclose=()=>{generation++;dialog.remove();};
}
