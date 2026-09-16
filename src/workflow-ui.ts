import type { Equipment, Project, Inspection } from './model.ts';
import { changesSince, questions, reviewLabels, type ReviewKey } from './review.ts';
export const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function reviewForm(e:Equipment){
 const r=e.review;
 return `<section class="panel-section evidence-panel"><span class="eyebrow">SOURCE & VERIFICATION</span><h3>사양과 확인 기록</h3><form id="review-form">${[['model','모델명',120],['source','치수·사양 출처',500],['reviewer','확인 담당자',120],['date','확인일',10]].map(([key,label,max])=>`<label class="field"><span>${label}</span><input name="${key}" type="${key==='date'?'date':'text'}" maxlength="${max}" value="${esc(r?.[key as 'model'|'source'|'reviewer'|'date'])}"/></label>`).join('')}<p class="hint">출처·담당자·확인일이 모두 있어야 체크가 확인 기록으로 인정됩니다. 사양을 바꾸면 관련 체크가 해제됩니다.</p>${(Object.keys(reviewLabels) as ReviewKey[]).map(key=>`<label class="review-check"><input name="${key}" type="checkbox" ${r?.[key]?'checked':''}/><span>${reviewLabels[key]}</span></label>`).join('')}<label class="field"><span>확인 근거·추가 메모</span><textarea name="notes" maxlength="1000" rows="3">${esc(r?.notes)}</textarea></label></form><label class="field"><span>설비 사진 교체 / 추가</span><input id="replace-photo" type="file" accept="image/jpeg,image/png,image/webp"/></label><p class="hint">사진은 식별용입니다. 실제 치수는 사양서·실측으로 확인하세요.</p></section>`;
}
export function reportEvidence(p:Project,i:Inspection){
 const previous=p.inspections[p.inspections.findIndex(x=>x.id===i.id)-1];
 const changes=previous?changesSince(i.basis,previous.basis):[];
 return `<section class="report-evidence"><h2>설비 사진과 확인 근거</h2>${i.basis.equipment.map(e=>{
  const photo=p.photos?.find(a=>a.id===e.photoId),r=e.review,q=questions(e);
  return `<div class="report-equipment">${photo?`<img src="${photo.data}" alt="${esc(e.name)} 식별용 사진"/>`:''}<h3>${esc(e.name)} · ${esc(r?.model||'모델 미입력')}</h3><p>출처: ${esc(r?.source||'미확인')}<br/>확인자: ${esc(r?.reviewer||'미확인')} / 확인일: ${esc(r?.date||'미확인')}</p><p>${esc(r?.notes||'')}</p><ul>${q.length?q.map(item=>`<li>미확인: ${esc(item)}</li>`).join(''):'<li>입력 치수·정비 여유·돌출부에 대한 담당자 확인 기록 있음 (독립 검증·인증 아님)</li>'}</ul></div>`;
 }).join('')}<h2>직전 검토 대비 변경</h2>${previous?`<ul>${changes.length?changes.map(x=>`<li>${esc(x)}</li>`).join(''):'<li>입력값 변경 없음</li>'}</ul>`:'<p>첫 검토 기록입니다.</p>'}</section>`;
}
