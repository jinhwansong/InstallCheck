import './styles.css';
import {
  sampleProject,
  validateProject,
  createInspection,
  isStale,
  uid,
} from './model.ts';
import type { Equipment, Finding, Inspection, Project } from './model.ts';
import { inspect } from './inspection.ts';
import { WorkspaceScene } from './scene.ts';

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const KEY = 'installcheck-project-v1';
let storageLocked = false,
  storageMessage = '';
let project: Project = sampleProject();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) project = validateProject(JSON.parse(raw));
} catch {
  storageLocked = true;
  storageMessage =
    '저장 자료를 읽지 못했습니다. 원본을 보존 중입니다. JSON을 내보내거나 원본 복구 파일을 받으세요.';
}
let selected = project.equipment[0]?.id ?? '',
  tab: 'equipment' | 'site' | 'history' = 'equipment',
  historyId = '',
  showClearance = true,
  showFactory = true,
  filter = 'all';
const undo: Project[] = [],
  redo: Project[] = [];
let scene: WorkspaceScene | undefined;
const statusText = {
  error: '문제',
  warning: '주의',
  unknown: '미확인',
  pass: '기준 충족',
};
function toast(message: string) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 4500);
}
function persist() {
  if (storageLocked) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
    storageMessage = '';
  } catch {
    storageMessage =
      '브라우저 저장에 실패했습니다. 현재 작업을 JSON으로 내보내세요.';
  }
}
window.addEventListener('storage', (e) => {
  if (e.key === KEY && e.newValue !== JSON.stringify(project)) {
    storageLocked = true;
    storageMessage =
      '다른 탭에서 프로젝트가 변경되었습니다. 덮어쓰기를 막기 위해 자동 저장을 중지했습니다. 현재 작업을 JSON으로 백업한 뒤 새로고침하세요.';
    render();
  }
});
function change(fn: (draft: Project) => void) {
  const draft = structuredClone(project);
  try {
    fn(draft);
    const next = validateProject({ ...draft, inspections: [] });
    next.inspections = draft.inspections;
    undo.push(project);
    if (undo.length > 25) undo.shift();
    redo.length = 0;
    project = next;
    historyId = '';
    persist();
    render();
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : '입력을 확인하세요.');
    render();
    return false;
  }
}
function field(
  label: string,
  name: string,
  value: unknown,
  type = 'number',
  min?: number,
  max?: number,
) {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value ?? '')}" ${type === 'number' ? `step="1" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''}` : ''} ${type === 'text' ? 'maxlength="120"' : ''}/></label>`;
}
const num = (fd: FormData, key: string) => Number(fd.get(key));
const optional = (fd: FormData, key: string) =>
  fd.get(key) === '' ? null : num(fd, key);
function getInspection(): Inspection | undefined {
  return (
    project.inspections.find((i) => i.id === historyId) ??
    project.inspections.at(-1)
  );
}
function findings(): Finding[] {
  return historyId ? (getInspection()?.findings ?? []) : inspect(project);
}
function select(id: string) {
  selected = id;
  tab = 'equipment';
  render();
}
function download(data: string, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#app').innerHTML = `
  <header class="topbar"><a class="brand" href="#"><span class="brand-mark">IC</span>InstallCheck<span class="beta">PREVIEW</span></a><div class="top-meta"><span class="local-dot"></span> 로컬 워크스페이스 <span class="separator">/</span> 데이터 외부 전송 없음</div><button id="export" class="top-button">JSON 백업 ↓</button><button id="import" class="top-button">불러오기</button><input id="file" type="file" accept=".json,application/json" hidden/></header>
  <main>
    <section class="projectbar"><div><div class="breadcrumb">프로젝트 <span>/</span> 설치 사전 검토</div><h1 id="project-title"></h1><p id="project-subtitle"></p></div><div class="project-actions"><span id="revision-state" class="pill"></span><button id="print" class="button">검토서 출력 ↗</button><button id="inspect" class="button primary">검사 기록 저장 <span>→</span></button></div></section>
    <div id="storage-alert" class="storage-alert" role="alert" hidden></div>
    <section class="workspace">
      <aside class="inspector"><div class="tabs" role="tablist" aria-label="편집 영역"><button data-tab="equipment" role="tab">설비</button><button data-tab="site" role="tab">현장</button><button data-tab="history" role="tab">검토 이력</button></div><div id="inspector-content"></div><div class="inspector-footer"><span>mm 단위 · 50 mm 이동 스냅</span><button id="reset" class="text-button">샘플로 초기화</button></div></aside>
      <div class="viewport-column"><div class="viewport-toolbar"><div class="view-title"><span class="local-dot"></span><strong>설치 구역</strong><span id="site-label"></span></div><div class="view-actions"><button id="undo" title="되돌리기" aria-label="되돌리기">↶</button><button id="redo" title="다시 실행" aria-label="다시 실행">↷</button><button id="fit">전체 보기</button><button id="plan">평면 보기</button><button id="clearance" aria-pressed="true">정비공간</button></div></div><div class="viewport-wrap"><div id="viewport"></div><div class="scene-badge">LEVEL 2 <span>구성요소 치수 기반</span></div><div class="scene-legend"><span><i class="legend-machine"></i>검토 설비</span><span><i class="legend-obstacle"></i>현장 장애물</span><span><i class="legend-clearance"></i>정비공간</span></div><div class="scene-help">설비 드래그 · 화면 드래그로 회전 · 휠로 확대</div></div><section class="scope-note"><span>ⓘ</span><p><strong>입력된 치수 기준의 사전 검토입니다.</strong> 실제 반입 경로·하중·배관·안전 인증은 검사하지 않습니다. 현장 담당자의 최종 확인이 필요합니다.</p></section></div>
      <aside class="results"><div class="results-heading"><div><span class="eyebrow">INSPECTION</span><h2>검토 결과</h2></div><span id="result-count"></span></div><div id="result-summary"></div><div id="result-mode"></div><div class="result-filters"><button data-filter="all">전체</button><button data-filter="attention">확인 필요</button><button data-filter="pass">기준 충족</button></div><div id="findings"></div><div class="result-footnote">문 치수 충족은 반입 가능 보장이 아닙니다.<br/>검토서는 저장된 입력값과 결과를 사용합니다.</div></aside>
    </section><footer class="page-footer"><span>INSTALLCHECK <b> / </b> 최종 사양과 현장 사이의 마지막 확인</span><span id="save-status"></span></footer>
  </main><div id="toast" role="status" aria-live="polite"></div><article id="report"></article>`;

const modelButton=document.createElement('button');
modelButton.className='button';modelButton.id='import-model';modelButton.textContent='3D 파일 가져오기';
$('.project-actions').prepend(modelButton);
modelButton.onclick=async()=>{
  modelButton.disabled=true;
  try {
  const {openModelImport}=await import('./import-dialog.ts');
  openModelImport(({asset,size,role})=>{
    let addedId='';
    const success=change(p=>{
        p.assets=[...(p.assets??[]),asset];addedId=uid();
        if(role==='factory'){
          p.factory={name:asset.name,meshId:asset.id,x:size.w/2,y:0,z:size.d/2,angle:0,...size};
          return;
        }
      p.equipment.push({id:addedId,name:asset.name,revision:'Import.1',x:p.site.width/2,z:p.site.depth/2,angle:0,
        clearance:{front:800,back:500,left:500,right:500,top:300},
        parts:[{id:uid(),name:asset.name,meshId:asset.id,x:0,y:0,z:0,...size}]});
    });
      if(success){
        if(role==='factory'){tab='site';showFactory=true;render();scene?.fit();toast('공장 배경을 고정했습니다. 현장 치수와 벽·기둥을 별도로 확인하세요.');}
        else {selected=addedId;tab='equipment';render();scene?.focus(addedId);toast('기계를 가져왔습니다. 이동·회전할 수 있으며 검사는 외곽 상자 기준입니다.');}
      }
    return success;
  });
  } catch {toast('3D 가져오기 화면을 열지 못했습니다. 다시 시도하세요.');}
  finally {modelButton.disabled=false;}
};

function renderEquipment() {
  const e =
    project.equipment.find((x) => x.id === selected) ?? project.equipment[0];
  selected = e?.id ?? '';
  return `<div class="panel-section"><div class="section-heading"><h2>검토 설비 <span>${project.equipment.length}</span></h2><button id="add-equipment" class="small-button">+ 추가</button></div><div class="equipment-list">${project.equipment.map((x) => `<button class="equipment-item ${x.id === selected ? 'active' : ''}" data-select="${x.id}"><span class="equipment-icon">▧</span><span><strong>${esc(x.name)}</strong><small>${esc(x.revision)} · 구성요소 ${x.parts.length}개</small></span><span>›</span></button>`).join('')}</div></div>${
    !e
      ? '<div class="empty">설비를 추가해 첫 검토를 시작하세요.</div>'
      : `
    <div class="panel-section"><div class="section-heading"><h3>설비 배치</h3><span class="unit">mm / °</span></div><form id="equipment-form">${field('설비명', 'name', e.name, 'text')}${field('설비 버전', 'revision', e.revision, 'text')}<div class="field-grid">${field('X 위치', 'x', e.x)}${field('Z 위치', 'z', e.z)}${field('회전 각도', 'angle', e.angle, 'number', -360, 360)}</div><p class="hint">구성요소는 설비 원점을 기준으로 함께 회전합니다.</p></form></div>
    <div class="panel-section"><div class="section-heading"><h3>구성요소 <span>${e.parts.length}</span></h3><button id="add-part" class="small-button">+ 추가</button></div>${e.parts.map((p, i) => `<details class="part" ${i === 0 ? 'open' : ''}><summary><span><i class="part-dot"></i>${esc(p.name)}</span><small>${p.w} × ${p.d} × ${p.h}</small></summary><form data-part="${p.id}">${field('구성요소명', 'name', p.name, 'text')}<div class="field-grid three">${field('폭 W', 'w', p.w, 'number', 1, 100000)}${field('깊이 D', 'd', p.d, 'number', 1, 100000)}${field('높이 H', 'h', p.h, 'number', 1, 100000)}${field('로컬 X', 'x', p.x)}${field('로컬 Z', 'z', p.z)}${field('바닥 높이 Y', 'y', p.y, 'number', 0, 100000)}</div><button type="button" class="text-button danger" data-remove-part="${p.id}" ${e.parts.length === 1 ? 'disabled' : ''}>구성요소 삭제</button></form></details>`).join('')}</div>
    <div class="panel-section"><div class="section-heading"><h3>작업·정비 여유</h3><span class="unit">mm</span></div><form id="clearance-form"><div class="field-grid">${(['front', 'back', 'left', 'right', 'top'] as const).map((key, i) => field(['전면 (+Z)', '후면 (-Z)', '좌측 (-X)', '우측 (+X)', '상부'][i], key, e.clearance[key], 'number', 0, 10000)).join('')}</div></form><p class="hint">설비의 로컬 방향 기준입니다. 외곽 상자 전체에 보수적으로 적용합니다.</p></div><div class="panel-section inline-actions"><button id="duplicate" class="button">설비 복제</button><button id="remove-equipment" class="text-button danger">설비 삭제</button></div>`
  }`;
}
function renderFactory() {
  const f=project.factory;
  return `<div class="panel-section"><h3>공장 배경</h3>${f?`<p class="hint">${esc(f.name)} · 드래그 잠금 · 자동 검사 제외</p><button id="toggle-factory" class="button" aria-pressed="${showFactory}">${showFactory?'배경 숨기기':'배경 표시'}</button><form id="factory-form"><div class="field-grid">${field('중심 X','x',f.x)}${field('중심 Z','z',f.z)}${field('바닥 Y','y',f.y,'number',0)}${field('회전 °','angle',f.angle,'number',-360,360)}${field('폭 W','w',f.w,'number',1)}${field('깊이 D','d',f.d,'number',1)}${field('높이 H','h',f.h,'number',1)}</div></form><p class="hint">W/D/H 변경 시 배경 형상이 늘어나거나 줄어듭니다. 현장 유효 치수·천장·문은 아래에서 별도 입력하세요. 숨겨도 검사 범위는 바뀌지 않습니다.</p><button id="remove-factory" class="text-button danger">배경 제거</button>`:'<p class="hint">상단 3D 파일 가져오기에서 ‘공장’을 선택하세요. 기계 파일은 ‘기계’로 각각 불러와 배치할 수 있습니다.</p>'}<p class="hint">공장 안의 벽·기둥·기계는 자동 분리되지 않습니다. 검사할 벽·기둥은 현장 장애물로 등록하세요.</p></div>`;
}
function renderSite() {
  const s = project.site;
  return `<div class="panel-section"><h2>프로젝트 정보</h2><form id="project-form">${field('프로젝트명', 'name', project.name, 'text')}${field('고객 / 현장 구분', 'customer', project.customer, 'text')}</form></div><div class="panel-section"><div class="section-heading"><h3>현장 치수</h3><span class="unit">mm</span></div><form id="site-form">${field('설치 구역명', 'name', s.name, 'text')}<div class="field-grid">${field('폭 X', 'width', s.width, 'number', 1000, 100000)}${field('깊이 Z', 'depth', s.depth, 'number', 1000, 100000)}${field('천장 높이', 'height', s.height, 'number', 1, 100000)}${field('판정 여유', 'tolerance', s.tolerance, 'number', 0, 500)}${field('문 유효 폭', 'doorWidth', s.doorWidth, 'number', 1, 100000)}${field('문 유효 높이', 'doorHeight', s.doorHeight, 'number', 1, 100000)}</div>${field('실측 기준일', 'measuredAt', s.measuredAt, 'date')}</form><p class="hint">천장·문·실측일을 비워두면 미확인으로 표시됩니다. 문 위치와 이동 경로는 검사하지 않습니다.</p></div><div class="panel-section"><div class="section-heading"><h3>현장 장애물</h3><button id="add-obstacle" class="small-button">+ 추가</button></div>${project.obstacles.map((o) => `<details class="part"><summary>${esc(o.name)}<span>⌄</span></summary><form data-obstacle="${o.id}">${field('이름', 'name', o.name, 'text')}<div class="field-grid three">${field('폭', 'w', o.w, 'number', 1)}${field('깊이', 'd', o.d, 'number', 1)}${field('높이', 'h', o.h, 'number', 1)}${field('중심 X', 'x', o.x)}${field('중심 Z', 'z', o.z)}${field('바닥 Y', 'y', o.y, 'number', 0)}${field('회전 °', 'angle', o.angle, 'number', -360, 360)}</div><button type="button" class="text-button danger" data-remove-obstacle="${o.id}">장애물 삭제</button></form></details>`).join('')}</div>`;
}
function renderHistory() {
  return `<div class="panel-section"><h2>저장된 검토 <span>${project.inspections.length}</span></h2><p class="hint">검사 당시의 치수와 결과를 보존합니다. 변경한 현재 작업과 이전 검토를 구분하세요.</p><button id="current-view" class="button wide">현재 작업으로 돌아가기</button></div>${
    project.inspections.length
      ? [...project.inspections]
          .reverse()
          .map(
            (i, idx) =>
              `<button class="history-card ${historyId === i.id ? 'active' : ''}" data-history="${i.id}"><span class="eyebrow">검토 #${project.inspections.length - idx} · ${isStale(project, i) ? '현재와 다름' : '현재와 일치'}</span><strong>${new Date(i.createdAt).toLocaleString('ko-KR')}</strong><small>문제 ${i.findings.filter((f) => f.status === 'error').length} · 주의 ${i.findings.filter((f) => f.status === 'warning').length} · 미확인 ${i.findings.filter((f) => f.status === 'unknown').length}</small></button>`,
          )
          .join('')
      : '<div class="empty"><span>▤</span><h3>아직 저장된 검토가 없어요</h3><p>배치와 치수를 확인한 뒤<br/>‘검사 기록 저장’을 눌러주세요.</p></div>'
  }`;
}
function render() {
  const openParts = Array.from(
    document.querySelectorAll<HTMLDetailsElement>('details[open]'),
  )
    .map(
      (d) =>
        d.querySelector<HTMLFormElement>('form')?.dataset.part ??
        d.querySelector<HTMLFormElement>('form')?.dataset.obstacle,
    )
    .filter(Boolean);
  $('#project-title').textContent = project.name;
  $('#project-subtitle').textContent =
    `${project.customer}  /  ${project.site.name}`;
  $('#site-label').textContent =
    `${project.site.width / 1000} × ${project.site.depth / 1000} m`;
  const last = project.inspections.at(-1),
    stale = last && isStale(project, last);
  const state = $('#revision-state');
  state.textContent = !last
    ? '첫 검토 대기'
    : stale
      ? '● 변경됨 · 재검토 필요'
      : '● 저장된 검토와 일치';
  state.className = `pill ${stale ? 'amber' : last ? 'green' : ''}`;
  $('#inspector-content').innerHTML =
    tab === 'equipment'
      ? renderEquipment()
      : tab === 'site'
        ? renderFactory()+renderSite()
        : renderHistory();
  if(tab==='equipment') for(const part of project.equipment.find(e=>e.id===selected)?.parts??[]) {
    if(!part.meshId)continue;
    const form=document.querySelector<HTMLFormElement>(`[data-part="${part.id}"]`);
    const note=document.createElement('p');note.className='hint mesh-note';
    note.textContent='가져온 형상 · 검사는 외곽 상자 기준입니다. W/D/H 변경 시 형상이 해당 크기로 늘어나거나 줄어듭니다.';
    form?.prepend(note);
  }
  const usesMesh=project.equipment.some(e=>e.parts.some(p=>p.meshId));
    $('.scene-badge').innerHTML=project.factory?'FACTORY <span>공장: 배경 전용 · 등록 장애물만 검사</span>':usesMesh?'3D IMPORT <span>표시: 메시 · 검사: 외곽 상자</span>':'LEVEL 2 <span>구성요소 치수 기반</span>';
  document.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
    const f = d.querySelector<HTMLFormElement>('form');
    if (openParts.includes(f?.dataset.part ?? f?.dataset.obstacle))
      d.open = true;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  });
  const rows = findings(),
    counts = { error: 0, warning: 0, unknown: 0, pass: 0 };
  rows.forEach((r) => counts[r.status]++);
  $('#result-count').textContent = `${rows.length}개 항목`;
  $('#result-summary').innerHTML = Object.entries(counts)
    .map(
      ([s, n]) =>
        `<div class="metric ${s}"><strong>${n}</strong><span>${statusText[s as keyof typeof statusText]}</span></div>`,
    )
    .join('');
  $('#result-mode').innerHTML = historyId
    ? `<span class="mode history">저장된 검토 보기</span><p>3D 화면은 현재 작업입니다. 과거 입력값은 검토서에서 확인하세요.</p>`
    : `<span class="mode">현재 입력값 · 실시간 미리보기</span>${stale ? '<p>변경 사항을 반영하려면 검사를 저장하세요.</p>' : ''}`;
  document
    .querySelectorAll<HTMLElement>('[data-filter]')
    .forEach((b) => b.classList.toggle('active', b.dataset.filter === filter));
  const visible = rows.filter(
    (r) =>
      filter === 'all' ||
      (filter === 'pass' ? r.status === 'pass' : r.status !== 'pass'),
  );
  $('#findings').innerHTML = visible.length
    ? visible
        .map(
          (r) =>
            `<button class="finding ${r.status}" data-focus="${r.equipmentId ?? ''}"><span class="finding-icon">${{ error: '!', warning: '△', unknown: '?', pass: '✓' }[r.status]}</span><span><span class="finding-type">${statusText[r.status]}${r.equipmentId ? ' · ' + esc((historyId ? getInspection()?.basis : project)?.equipment.find((e) => e.id === r.equipmentId)?.name ?? '설비') : ''}</span><strong>${esc(r.title)}</strong><small>${esc(r.detail)}</small></span></button>`,
        )
        .join('')
    : '<div class="empty">해당하는 항목이 없습니다.</div>';
  $('#save-status').textContent = storageLocked
    ? '원본 보존 · 자동 저장 중지'
    : storageMessage
      ? '저장 확인 필요'
      : '이 브라우저에 자동 저장';
  const alert = $('#storage-alert');
  alert.hidden = !storageMessage;
  alert.replaceChildren();
  if (storageMessage) {
    alert.append(document.createTextNode(storageMessage + ' '));
    if (storageLocked) {
      const b = document.createElement('button');
      b.textContent = '원본 복구 파일 받기';
      b.onclick = () =>
        download(
          localStorage.getItem(KEY) ?? '',
          'InstallCheck-recovery.txt',
          'text/plain',
        );
      alert.append(b);
    }
  }
  $('#undo').toggleAttribute('disabled', undo.length === 0);
  $('#redo').toggleAttribute('disabled', redo.length === 0);
  $('#print').toggleAttribute('disabled', !getInspection());
  scene?.update(project, selected, showClearance, showFactory);
  bindPanels();
}

function onChange(
  form: HTMLFormElement | null,
  fn: (fd: FormData, p: Project) => void,
) {
  if (!form) return;
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => {
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    change((p) => fn(fd, p));
  });
}
function equipment(p: Project): Equipment {
  return p.equipment.find((e) => e.id === selected)!;
}
function bindPanels() {
  onChange(document.querySelector('#factory-form'),(f,p)=>{
    if(p.factory) for(const key of ['x','y','z','w','d','h','angle'] as const) p.factory[key]=num(f,key);
  });
  const toggleFactory=$('#toggle-factory');
  if(toggleFactory)toggleFactory.onclick=()=>{showFactory=!showFactory;render();};
  const removeFactory=$('#remove-factory');
  if(removeFactory)removeFactory.onclick=()=>change(p=>{delete p.factory;});
  const obstacleButton=$('#add-obstacle');
  if(obstacleButton){
    const controls=document.createElement('div');controls.className='obstacle-presets';
    controls.innerHTML='<button class="small-button" data-obstacle-kind="wall">+ 벽 등록</button><button class="small-button" data-obstacle-kind="column">+ 기둥 등록</button><p class="hint">배경을 참고해 실제 위치와 치수를 입력하세요. 등록한 상자만 간섭 검사에 사용합니다.</p>';
    obstacleButton.closest('.section-heading')!.after(controls);
    controls.querySelectorAll<HTMLButtonElement>('[data-obstacle-kind]').forEach(button=>button.onclick=()=>change(p=>{
      const wall=button.dataset.obstacleKind==='wall';
      p.obstacles.push({id:uid(),name:wall?'등록 벽':'등록 기둥',x:p.site.width/2,y:0,z:p.site.depth/2,w:wall?3000:500,d:wall?200:500,h:p.site.height??3000,angle:0});
    }));
  }
  document
    .querySelectorAll<HTMLButtonElement>('[data-select]')
    .forEach((b) => (b.onclick = () => select(b.dataset.select!)));
  onChange(document.querySelector('#equipment-form'), (f, p) => {
    const e = equipment(p);
    e.name = String(f.get('name'));
    e.revision = String(f.get('revision'));
    e.x = num(f, 'x');
    e.z = num(f, 'z');
    e.angle = num(f, 'angle');
  });
  onChange(document.querySelector('#clearance-form'), (f, p) => {
    for (const key of ['front', 'back', 'left', 'right', 'top'] as const)
      equipment(p).clearance[key] = num(f, key);
  });
  document.querySelectorAll<HTMLFormElement>('[data-part]').forEach((form) =>
    onChange(form, (f, p) => {
      const part = equipment(p).parts.find((x) => x.id === form.dataset.part)!;
      part.name = String(f.get('name'));
      for (const key of ['x', 'y', 'z', 'w', 'd', 'h'] as const)
        part[key] = num(f, key);
    }),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-remove-part]').forEach(
    (b) =>
      (b.onclick = () =>
        change((p) => {
          const e = equipment(p);
          if (e.parts.length > 1)
            e.parts = e.parts.filter((x) => x.id !== b.dataset.removePart);
        })),
  );
  const add = $('#add-equipment');
  if (add)
    add.onclick = () =>
      change((p) => {
        const id = uid();
        p.equipment.push({
          id,
          name: '신규 설비',
          revision: 'Rev.1',
          x: p.site.width / 2,
          z: p.site.depth / 2,
          angle: 0,
          clearance: { front: 800, back: 500, left: 500, right: 500, top: 300 },
          parts: [
            {
              id: uid(),
              name: '본체',
              x: 0,
              y: 0,
              z: 0,
              w: 1600,
              d: 1200,
              h: 1800,
            },
          ],
        });
        selected = id;
      });
  const part = $('#add-part');
  if (part)
    part.onclick = () =>
      change((p) =>
        equipment(p).parts.push({
          id: uid(),
          name: '추가 구성요소',
          x: 1500,
          y: 0,
          z: 0,
          w: 800,
          d: 600,
          h: 1000,
        }),
      );
  const dup = $('#duplicate');
  if (dup)
    dup.onclick = () =>
      change((p) => {
        const e = structuredClone(equipment(p));
        e.id = uid();
        e.name += ' 복제';
        e.x += 1000;
        e.z += 1000;
        e.parts.forEach((x) => (x.id = uid()));
        p.equipment.push(e);
        selected = e.id;
      });
  const del = $('#remove-equipment');
  if (del)
    del.onclick = () => {
      if (
        confirm(
          '선택한 설비를 현재 작업에서 삭제할까요? 저장된 검토에는 유지됩니다.',
        )
      )
        change(
          (p) => (p.equipment = p.equipment.filter((e) => e.id !== selected)),
        );
    };
  onChange(document.querySelector('#project-form'), (f, p) => {
    p.name = String(f.get('name'));
    p.customer = String(f.get('customer'));
  });
  onChange(document.querySelector('#site-form'), (f, p) => {
    p.site = {
      name: String(f.get('name')),
      width: num(f, 'width'),
      depth: num(f, 'depth'),
      height: optional(f, 'height'),
      doorWidth: optional(f, 'doorWidth'),
      doorHeight: optional(f, 'doorHeight'),
      tolerance: num(f, 'tolerance'),
      measuredAt: String(f.get('measuredAt')),
    };
  });
  document
    .querySelectorAll<HTMLFormElement>('[data-obstacle]')
    .forEach((form) =>
      onChange(form, (f, p) => {
        const o = p.obstacles.find((x) => x.id === form.dataset.obstacle)!;
        o.name = String(f.get('name'));
        for (const key of ['x', 'y', 'z', 'w', 'd', 'h', 'angle'] as const)
          o[key] = num(f, key);
      }),
    );
  const ob = $('#add-obstacle');
  if (ob)
    ob.onclick = () =>
      change((p) =>
        p.obstacles.push({
          id: uid(),
          name: '새 장애물',
          x: 1000,
          z: 1000,
          y: 0,
          w: 600,
          d: 600,
          h: 3000,
          angle: 0,
        }),
      );
  document
    .querySelectorAll<HTMLButtonElement>('[data-remove-obstacle]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          change(
            (p) =>
              (p.obstacles = p.obstacles.filter(
                (o) => o.id !== b.dataset.removeObstacle,
              )),
          )),
    );
  document.querySelectorAll<HTMLButtonElement>('[data-history]').forEach(
    (b) =>
      (b.onclick = () => {
        historyId = b.dataset.history!;
        render();
      }),
  );
  const current = $('#current-view');
  if (current)
    current.onclick = () => {
      historyId = '';
      render();
    };
  document.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.focus;
        if (id && project.equipment.some((e) => e.id === id)) {
          selected = id;
          scene?.update(project, selected, showClearance, showFactory);
          scene?.focus(id);
        } else
          toast(
            '현재 3D 작업에 해당 설비가 없습니다. 검토서에서 저장된 치수를 확인하세요.',
          );
      }),
  );
}

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab as typeof tab;
      render();
    }),
);
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter!;
      render();
    }),
);
$('#inspect').onclick = () => {
  if (project.inspections.length >= 30) {
    toast(
      '검토 이력은 프로젝트당 30개입니다. JSON 백업 후 새 프로젝트를 시작하세요.',
    );
    return;
  }
  change((p) => p.inspections.push(createInspection(p)));
  toast('현재 입력값과 검사 결과를 검토 이력에 저장했습니다.');
};
$('#undo').onclick = () => {
  const prev = undo.pop();
  if (prev) {
    redo.push(project);
    project = prev;
    historyId = '';
    persist();
    render();
  }
};
$('#redo').onclick = () => {
  const next = redo.pop();
  if (next) {
    undo.push(project);
    project = next;
    historyId = '';
    persist();
    render();
  }
};
$('#fit').onclick = () => scene?.fit(false);
$('#plan').onclick = () => scene?.fit(true);
$('#clearance').onclick = () => {
  showClearance = !showClearance;
  $('#clearance').setAttribute('aria-pressed', String(showClearance));
  scene?.update(project, selected, showClearance, showFactory);
};
$('#export').onclick = () =>
  download(
    JSON.stringify(project),
    `InstallCheck-${new Date().toISOString().slice(0, 10)}.json`,
  );
$('#import').onclick = () => $<HTMLInputElement>('#file').click();
$<HTMLInputElement>('#file').onchange = async (e) => {
  const el = e.target as HTMLInputElement,
    file = el.files?.[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024)
      throw new Error('20 MB 이하의 프로젝트 JSON을 선택하세요.');
    const next = validateProject(JSON.parse(await file.text()));
    if (
      !confirm(
        '현재 작업을 불러온 프로젝트로 바꿀까요? 필요한 작업은 먼저 JSON 백업을 받으세요.',
      )
    )
      return;
    undo.push(project);
    redo.length = 0;
    project = next;
    selected = project.equipment[0]?.id ?? '';
    historyId = '';
    storageLocked = false;
    persist();
    render();
    scene?.fit();
    toast(
      '프로젝트를 불러왔습니다. 저장된 검사 결과는 현재 규칙으로 재검증했습니다.',
    );
  } catch (e) {
    toast(e instanceof Error ? e.message : '파일을 읽지 못했습니다.');
  } finally {
    el.value = '';
  }
};
$('#reset').onclick = () => {
  if (
    !confirm(
      '현재 작업을 샘플 프로젝트로 바꿀까요? 필요한 자료는 먼저 JSON으로 백업하세요.',
    )
  )
    return;
  undo.push(project);
  redo.length = 0;
  project = sampleProject();
  storageLocked = false;
  historyId = '';
  selected = project.equipment[0].id;
  persist();
  render();
  scene?.fit();
};

function report(i: Inspection) {
  const b = i.basis,
    s = b.site;
  const row = (cells: unknown[]) =>
    `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
  return `<header><span>INSTALLCHECK / 설치 사전 검토서</span><h1>${esc(b.name)}</h1><p>${esc(b.customer)} · ${esc(s.name)}</p></header><p>검토 기록: ${esc(i.id)}<br/>검토 시각: ${esc(new Date(i.createdAt).toLocaleString('ko-KR'))} · 검사 규칙 ${i.engine}</p>${isStale(project, i) ? '<p class="report-warning">이 보고서는 과거 저장된 입력값 기준입니다. 현재 작업이 변경되어 재검토가 필요합니다.</p>' : ''}<h2>1. 현장 기준</h2><table><tbody>${row(['항목', '값 (mm)'])}${row(['현장 폭 × 깊이', `${s.width} × ${s.depth}`])}${row(['천장 높이', s.height ?? '미확인'])}${row(['문 폭 × 높이', `${s.doorWidth ?? '미확인'} × ${s.doorHeight ?? '미확인'}`])}${row(['판정 여유', s.tolerance])}${row(['실측일', s.measuredAt || '미확인'])}</tbody></table><h2>2. 설비와 구성요소</h2>${b.equipment.map((e) => `<h3>${esc(e.name)} / ${esc(e.revision)}</h3><p>위치 X ${e.x}, Z ${e.z} / 회전 ${e.angle}°<br/>정비 여유 전 ${e.clearance.front}, 후 ${e.clearance.back}, 좌 ${e.clearance.left}, 우 ${e.clearance.right}, 상 ${e.clearance.top} mm</p><table><thead>${row(['구성요소', 'W × D × H', '로컬 X / Y / Z'])}</thead><tbody>${e.parts.map((p) => row([p.name, `${p.w} × ${p.d} × ${p.h}`, `${p.x} / ${p.y} / ${p.z}`])).join('')}</tbody></table>`).join('')}<h2>3. 현장 장애물</h2><table><thead>${row(['이름', 'W × D × H', 'X / Y / Z', '회전'])}</thead><tbody>${b.obstacles.map((o) => row([o.name, `${o.w} × ${o.d} × ${o.h}`, `${o.x} / ${o.y} / ${o.z}`, `${o.angle}°`])).join('')}</tbody></table><h2>4. 검사 결과</h2><table><thead>${row(['상태 / 설비', '검사 항목', '판정 근거'])}</thead><tbody>${i.findings.map((f) => row([`${statusText[f.status]} / ${b.equipment.find((e) => e.id === f.equipmentId)?.name ?? '현장'}`, f.title, f.detail])).join('')}</tbody></table><h2>5. 적용 범위와 최종 확인</h2><p>사용자가 입력한 구성요소 치수 및 장애물을 기준으로 계산한 결과입니다. 미등록 돌출부·형상·측정오차를 모두 반영하지 않습니다. 반입 경로, 회전·분해 반입, 운반장비, 하중·구조, 배관·전기 및 안전 인증은 검사하지 않았습니다. 문 치수 충족은 실제 반입 가능을 보장하지 않습니다. 정비공간은 외곽 상자 기반의 보수적인 검사입니다.</p><p>현장 최종 확인자: ____________________　확인일: ____________________</p><p>이 문서는 인증서·설치 보증서가 아닙니다. 검토 이력은 로컬 파일이며 위변조 방지 인증이 적용되지 않았습니다.</p>`;
}
$('#print').onclick = () => {
  const i = getInspection();
  if (!i) return;
  $('#report').innerHTML = report(i);
  if(i.basis.factory){
    const f=i.basis.factory,note=document.createElement('p');note.className='report-warning';
    note.textContent=`공장 배경: ${f.name} / W×D×H ${f.w}×${f.d}×${f.h} mm / 중심 X ${f.x}, 바닥 Y ${f.y}, 중심 Z ${f.z} mm / 회전 ${f.angle}°. 배경은 표시 참고용이며 자동 충돌 검사에서 제외됩니다. 별도로 등록한 현장 장애물만 검사했습니다.`;
    $('#report').prepend(note);
  }
  const imported=i.basis.equipment.flatMap(e=>e.parts.filter(p=>p.meshId).map(p=>`${e.name} / ${p.name}`));
  if(imported.length){
    const note=document.createElement('p');note.className='report-warning';
    note.textContent=`3D 파일 형상 포함: ${imported.join(', ')}. 위 검사는 가져온 형상의 외곽 상자 기준이며, 삼각형·곡면·빈 공간의 정밀 간섭을 검사한 결과가 아닙니다.`;
    $('#report').prepend(note);
  }
  window.print();
};
render();
try {
  scene = new WorkspaceScene($('#viewport'), select, (id, x, z) =>
    change((p) => {
      const e = p.equipment.find((e) => e.id === id)!;
      e.x = x;
      e.z = z;
      selected = id;
    }),
  );
  scene.update(project, selected, showClearance, showFactory);
  scene.fit();
} catch {
  $('#viewport').innerHTML =
    '<div class="webgl-fallback"><h2>3D 화면을 시작하지 못했습니다</h2><p>브라우저의 하드웨어 가속을 확인해주세요.<br/>치수 편집과 검사·검토서 기능은 계속 사용할 수 있습니다.</p></div>';
}
