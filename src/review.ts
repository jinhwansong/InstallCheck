import type { Basis, Equipment } from './model.ts';
export const reviewLabels = {
  dimensions: '폭·깊이·높이의 출처와 실제 치수가 확인됐나요?',
  clearance: '제조사가 요구하는 작업·정비 여유를 확인했나요?',
  protrusions: '돌출부와 문·커버 개방 공간을 반영했나요?',
};
export type ReviewKey = keyof typeof reviewLabels;
export function questions(e: Equipment): string[] {
  const r=e.review, evidence=!!(r?.source.trim() && r.reviewer.trim() && r.date);
  return (Object.keys(reviewLabels) as ReviewKey[]).filter(key=>!evidence||!r?.[key]).map(key=>reviewLabels[key]);
}
export function resetChangedEvidence(before:Basis, after:Basis) {
  for(const e of after.equipment){
    const old=before.equipment.find(x=>x.id===e.id),r=e.review;
    if(!old||!r)continue;
    if(JSON.stringify(old.parts)!==JSON.stringify(e.parts)) {r.dimensions=false;r.protrusions=false;}
    if(JSON.stringify(old.clearance)!==JSON.stringify(e.clearance))r.clearance=false;
    if(old.revision!==e.revision || old.review?.model!==r.model || old.review?.source!==r.source || old.photoId!==e.photoId)
      r.dimensions=r.clearance=r.protrusions=false;
  }
}
export function changesSince(current:Basis, previous:Basis): string[] {
  const changes:string[]=[];
  if(JSON.stringify(current.site)!==JSON.stringify(previous.site))changes.push('현장 치수·문·실측 기준 변경');
  if(JSON.stringify(current.obstacles)!==JSON.stringify(previous.obstacles))changes.push('현장 장애물 변경');
  if(JSON.stringify(current.factory)!==JSON.stringify(previous.factory))changes.push('공장 배경 변경');
  for(const e of current.equipment){
    const old=previous.equipment.find(x=>x.id===e.id);
    if(!old){changes.push(`${e.name}: 설비 추가`);continue;}
    if(e.x!==old.x||e.z!==old.z||e.angle!==old.angle)changes.push(`${e.name}: 배치 변경`);
    if(JSON.stringify(e.parts)!==JSON.stringify(old.parts))changes.push(`${e.name}: 치수·형상 변경`);
    if(JSON.stringify(e.clearance)!==JSON.stringify(old.clearance))changes.push(`${e.name}: 정비 여유 변경`);
    if(e.revision!==old.revision||e.name!==old.name||e.photoId!==old.photoId||JSON.stringify(e.review)!==JSON.stringify(old.review))changes.push(`${e.name}: 사양·사진·확인 기록 변경`);
  }
  for(const e of previous.equipment)if(!current.equipment.some(x=>x.id===e.id))changes.push(`${e.name}: 설비 삭제`);
  if(current.name!==previous.name||current.customer!==previous.customer)changes.push('프로젝트 정보 변경');
  return changes;
}
