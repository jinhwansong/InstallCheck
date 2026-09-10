import { inspect } from './inspection.ts';

export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  angle: number;
}
export interface Part extends Omit<Box, 'angle'> {
  id: string;
  name: string;
  meshId?: string;
}
export interface MeshAsset { id: string; name: string; positions: number[] }
export interface Equipment {
  id: string;
  name: string;
  revision: string;
  x: number;
  z: number;
  angle: number;
  parts: Part[];
  clearance: {
    front: number;
    back: number;
    left: number;
    right: number;
    top: number;
  };
}
export interface Obstacle extends Box {
  id: string;
  name: string;
}
export interface Basis {
  name: string;
  customer: string;
  site: {
    name: string;
    width: number;
    depth: number;
    height: number | null;
    doorWidth: number | null;
    doorHeight: number | null;
    measuredAt: string;
    tolerance: number;
  };
  equipment: Equipment[];
  obstacles: Obstacle[];
}
export type Status = 'error' | 'warning' | 'unknown' | 'pass';
export interface Finding {
  id: string;
  equipmentId?: string;
  rule: string;
  status: Status;
  title: string;
  detail: string;
}
export interface Inspection {
  id: string;
  createdAt: string;
  engine: '1.0';
  basis: Basis;
  findings: Finding[];
}
export interface Project extends Basis {
  schema: 1 | 2;
  inspections: Inspection[];
  assets?: MeshAsset[];
}
export const uid = () => crypto.randomUUID();
export function basis(p: Basis): Basis {
  return structuredClone({
    name: p.name,
    customer: p.customer,
    site: p.site,
    equipment: p.equipment,
    obstacles: p.obstacles,
  });
}
export const fingerprint = (p: Basis) => JSON.stringify(basis(p));
export const isStale = (p: Basis, i: Inspection) =>
  fingerprint(p) !== fingerprint(i.basis);
export function createInspection(p: Basis): Inspection {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    engine: '1.0',
    basis: basis(p),
    findings: inspect(p),
  };
}
export function sampleProject(): Project {
  return {
    schema: 1,
    name: '포장라인 증설 검토',
    customer: '샘플 제조사 · 가상 데이터',
    site: {
      name: 'A동 · 포장 구역',
      width: 12000,
      depth: 9000,
      height: 4000,
      doorWidth: 3200,
      doorHeight: 3200,
      measuredAt: '2026-09-09',
      tolerance: 20,
    },
    equipment: [
      {
        id: 'equipment-1',
        name: '자동 포장기 PK-200',
        revision: 'Rev.1',
        x: 4600,
        z: 4400,
        angle: 0,
        clearance: { front: 1000, back: 600, left: 500, right: 500, top: 500 },
        parts: [
          {
            id: 'part-1',
            name: '본체',
            x: 0,
            y: 0,
            z: 0,
            w: 2200,
            d: 1800,
            h: 2300,
          },
          {
            id: 'part-2',
            name: '출구 컨베이어',
            x: 1900,
            y: 800,
            z: 0,
            w: 1600,
            d: 700,
            h: 350,
          },
          {
            id: 'part-3',
            name: '제어반',
            x: -1500,
            y: 0,
            z: -400,
            w: 600,
            d: 650,
            h: 1800,
          },
        ],
      },
    ],
    obstacles: [
      {
        id: 'obstacle-1',
        name: '구조 기둥 C-03',
        x: 7500,
        y: 0,
        z: 4400,
        w: 600,
        d: 600,
        h: 4000,
        angle: 0,
      },
      {
        id: 'obstacle-2',
        name: '기존 검사 설비',
        x: 9300,
        y: 0,
        z: 2100,
        w: 2400,
        d: 1400,
        h: 1900,
        angle: 0,
      },
      {
        id: 'obstacle-3',
        name: '자재 적치 구역',
        x: 2000,
        y: 0,
        z: 1700,
        w: 2000,
        d: 1400,
        h: 1200,
        angle: 0,
      },
    ],
    inspections: [],
  };
}

// Normalize untrusted JSON rather than merging imported keys into application state.
export function validateProject(input: unknown): Project {
  const fail = (): never => {
    throw new Error(
      '프로젝트 형식 또는 치수가 올바르지 않습니다. 원본 JSON 백업을 확인하세요.',
    );
  };
  const obj = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : fail();
  const str = (v: unknown, max = 120): string =>
    typeof v === 'string' && v.length <= max ? v : fail();
  const num = (v: unknown, min = -100000, max = 100000): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
      ? v
      : fail();
  const list = (v: unknown, max: number): unknown[] =>
    Array.isArray(v) && v.length <= max ? v : fail();
  const date = (v: unknown): string => {
    const s = str(v, 10);
    return s === '' ||
      (/^\d{4}-\d{2}-\d{2}$/.test(s) &&
        new Date(s).toISOString().slice(0, 10) === s)
      ? s
      : fail();
  };
  function readBasis(value: unknown): Basis {
    const v = obj(value),
      s = obj(v.site),
      ids = new Set<string>();
    let count = 0;
    const id = (v: unknown) => {
      const s = str(v, 80);
      if (!/^[a-zA-Z0-9-]+$/.test(s) || ids.has(s)) fail();
      ids.add(s);
      return s;
    };
    const dims = (v: Record<string, unknown>) => ({
      x: num(v.x),
      y: num(v.y, 0),
      z: num(v.z),
      w: num(v.w, 1),
      d: num(v.d, 1),
      h: num(v.h, 1),
    });
    const nullable = (v: unknown) => (v === null ? null : num(v, 1));
    const equipment = list(v.equipment, 40).map((value) => {
      const e = obj(value),
        cl = obj(e.clearance);
      return {
        id: id(e.id),
        name: str(e.name),
        revision: str(e.revision, 40),
        x: num(e.x),
        z: num(e.z),
        angle: num(e.angle, -360, 360),
        clearance: {
          front: num(cl.front, 0, 10000),
          back: num(cl.back, 0, 10000),
          left: num(cl.left, 0, 10000),
          right: num(cl.right, 0, 10000),
          top: num(cl.top, 0, 10000),
        },
        parts: list(e.parts, 30).map((value) => {
          if (++count > 250) fail();
          const p = obj(value);
          return { id: id(p.id), name: str(p.name), ...dims(p), ...(p.meshId === undefined ? {} : {meshId:str(p.meshId,80)}) };
        }),
      };
    });
    if (equipment.some((e) => e.parts.length === 0)) fail();
    return {
      name: str(v.name),
      customer: str(v.customer),
      site: {
        name: str(s.name),
        width: num(s.width, 1000),
        depth: num(s.depth, 1000),
        height: nullable(s.height),
        doorWidth: nullable(s.doorWidth),
        doorHeight: nullable(s.doorHeight),
        measuredAt: date(s.measuredAt),
        tolerance: num(s.tolerance, 0, 500),
      },
      equipment,
      obstacles: list(v.obstacles, 100).map((value) => {
        const o = obj(value);
        return {
          id: id(o.id),
          name: str(o.name),
          ...dims(o),
          angle: num(o.angle, -360, 360),
        };
      }),
    };
  }
  const v = obj(input);
  if (v.schema !== 1 && v.schema !== 2) fail();
  let meshValues=0;
  const assetIds=new Set<string>();
  const assets = list(v.assets ?? [], 100).map(value=>{
    const a=obj(value), id=str(a.id,80);
    if(!/^[a-zA-Z0-9-]+$/.test(id)||assetIds.has(id))fail();
    assetIds.add(id);
    const positions=list(a.positions,180000).map(n=>num(n,0,1));
    meshValues+=positions.length;
    if(!positions.length||positions.length%9||meshValues>180000)fail();
    return {id,name:str(a.name),positions};
  });
  const b = readBasis(v);
  const historyIds = new Set<string>();
  const inspections = list(v.inspections, 30).map((value) => {
    const i = obj(value),
      id = str(i.id, 80),
      createdAt = str(i.createdAt, 40);
    if (
      !/^[a-zA-Z0-9-]+$/.test(id) ||
      historyIds.has(id) ||
      i.engine !== '1.0' ||
      !Number.isFinite(Date.parse(createdAt))
    )
      fail();
    historyIds.add(id);
    const b = readBasis(i.basis);
    // Results in imported backups are never trusted; reproduce them using the supported rule version.
    return {
      id,
      createdAt,
      engine: '1.0' as const,
      basis: b,
      findings: inspect(b),
    };
  });
  for(const value of [b,...inspections.map(i=>i.basis)])
    for(const e of value.equipment) for(const part of e.parts)
      if(part.meshId!==undefined&&!assetIds.has(part.meshId))fail();
  return { schema: assets.length ? 2 : 1, ...b, inspections, ...(assets.length?{assets}:{}) };
}
