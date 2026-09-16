import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Basis, Box, MeshAsset } from './model.ts';
import { corners, envelope, worldBoxes } from './inspection.ts';

export class WorkspaceScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(42, 1, 0.1, 1000);
  private controls: OrbitControls;
  private content = new T.Group();
  private ray = new T.Raycaster();
  private pointer = new T.Vector2();
  private meshes: T.Mesh[] = [];
  private groups = new Map<string, T.Group>();
  private project!: Basis;
  private drag: {
    id: string;
    start: T.Vector3;
    x: number;
    z: number;
    px: number;
    py: number;
    moved: boolean;
  } | null = null;
  private observer: ResizeObserver;
  private plan = false;
  constructor(
    private host: HTMLElement,
    private onSelect: (id: string) => void,
    private onMove: (id: string, x: number, z: number) => void,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor('#eef2f7');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      '설치 구역 3D 보기. 왼쪽 드래그: 설비 이동, 오른쪽 드래그: 화면 회전. 치수 편집에서도 위치를 바꿀 수 있습니다.',
    );
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI / 2.03;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 200;
    this.controls.addEventListener('change', () => this.render());
    this.scene.add(new T.HemisphereLight(0xffffff, 0x7b8b8a, 2.6));
    const sun = new T.DirectionalLight(0xffffff, 3.4);
    sun.position.set(4, 14, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -40,
      right: 40,
      top: 40,
      bottom: -40,
    });
    sun.shadow.bias = -0.0001;
    this.scene.add(sun);
    this.scene.add(this.content);
    this.observer = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.render();
    });
    this.observer.observe(host);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.setRay(e);
      const hit = this.ray.intersectObjects(this.meshes)[0];
      const id = hit?.object.userData.id as string | undefined;
      if (!id) return;
      const equipment = this.project.equipment.find((x) => x.id === id);
      if (!equipment) return;
      const start = this.ground();
      if (!start) return;
      this.drag = {
        id,
        start,
        x: equipment.x,
        z: equipment.z,
        px: e.clientX,
        py: e.clientY,
        moved: false,
      };
      this.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.setRay(e);
      const point = this.ground();
      if (!point) return;
      const d = this.drag;
      if (Math.hypot(e.clientX - d.px, e.clientY - d.py) > 5) d.moved = true;
      if (!d.moved) return;
      const group = this.groups.get(d.id);
      if (group) {
        group.position.x =
          Math.round(((point.x - d.start.x) * 1000) / 50) * 0.05;
        group.position.z =
          Math.round(((point.z - d.start.z) * 1000) / 50) * 0.05;
        this.render();
      }
    });
    const finish = (e: PointerEvent, cancel = false) => {
      if (!this.drag) return;
      const d = this.drag;
      const group = this.groups.get(d.id);
      this.drag = null;
      this.controls.enabled = true;
      el.style.cursor = 'grab';
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
      if (cancel) {
        group?.position.set(0, 0, 0);
        this.render();
        return;
      }
      if (d.moved && group)
        this.onMove(
          d.id,
          Math.round(d.x + group.position.x * 1000),
          Math.round(d.z + group.position.z * 1000),
        );
      else this.onSelect(d.id);
    };
    el.addEventListener('pointerup', (e) => finish(e));
    el.addEventListener('pointercancel', (e) => finish(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  private setRay(e: PointerEvent) {
    const r = this.host.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
  }
  private ground() {
    return this.ray.ray.intersectPlane(
      new T.Plane(new T.Vector3(0, 1, 0), 0),
      new T.Vector3(),
    );
  }
  private label(
    text: string,
    x: number,
    z: number,
    y = 0.04,
    color = '#6a7f9d',
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '500 32px "Malgun Gothic", sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text.slice(0, 40), 384, 60);
    const texture = new T.CanvasTexture(canvas);
    const sprite = new T.Sprite(
      new T.SpriteMaterial({ map: texture, depthTest: false }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(3.3, 0.43, 1);
    this.content.add(sprite);
  }
  update(project: Basis & {assets?: MeshAsset[]}, selected: string, showClearance = true, showFactory = true) {
    this.project = project;
    this.content.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.LineSegments) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
      if (o instanceof T.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.content.clear();
    this.meshes = [];
    this.groups.clear();
    const w = project.site.width / 1000,
      d = project.site.depth / 1000;
    const floor = new T.Mesh(
      new T.BoxGeometry(w, 0.1, d),
      new T.MeshStandardMaterial({ color: 0xdce4de, roughness: 0.9 }),
    );
    floor.position.set(w / 2, -0.07, d / 2);
    floor.receiveShadow = true;
    this.content.add(floor);
    const points: T.Vector3[] = [];
    for (let x = 0; x <= w; x += 0.5)
      points.push(new T.Vector3(x, 0.001, 0), new T.Vector3(x, 0.001, d));
    for (let z = 0; z <= d; z += 0.5)
      points.push(new T.Vector3(0, 0.001, z), new T.Vector3(w, 0.001, z));
    this.content.add(
      new T.LineSegments(
        new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({
          color: 0xb7c6bd,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    );
    for (const [ww, dd, x, z] of [
      [w, 0.08, w / 2, 0],
      [0.08, d, 0, d / 2],
    ]) {
      const wall = new T.Mesh(
        new T.BoxGeometry(ww, 0.6, dd),
        new T.MeshStandardMaterial({ color: 0xd0dcd5 }),
      );
      wall.position.set(x, 0.3, z);
      this.content.add(wall);
    }
    const draw = (
      b: {
        x: number;
        y: number;
        z: number;
        w: number;
        h: number;
        d: number;
        angle: number;
      },
      parent: T.Group,
      color: string,
      id?: string,
      transparent = false,
    ) => {
      const geo = new T.BoxGeometry(b.w / 1000, b.h / 1000, b.d / 1000),
        mat = new T.MeshStandardMaterial({
          color,
          roughness: 0.6,
          metalness: 0.12,
          transparent,
          opacity: transparent ? 0.07 : 1,
          depthWrite: !transparent,
        });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.set(b.x / 1000, (b.y + b.h / 2) / 1000, b.z / 1000);
      mesh.rotation.y = (b.angle * Math.PI) / 180;
      mesh.castShadow = !transparent;
      mesh.receiveShadow = true;
      mesh.userData.id = id;
      parent.add(mesh);
      if (id && !transparent) this.meshes.push(mesh);
      const lines = new T.LineSegments(
        new T.EdgesGeometry(geo),
        new T.LineBasicMaterial({
          color: transparent
            ? '#3976d6'
            : id === selected
              ? '#245ab2'
              : '#566e68',
          transparent: true,
          opacity: transparent ? 0.6 : 0.55,
        }),
      );
      lines.position.copy(mesh.position);
      lines.rotation.copy(mesh.rotation);
      parent.add(lines);
    };
    const drawImported=(asset:MeshAsset,b:Box,parent:T.Group,color:string,id?:string)=>{
      const positions=new Float32Array(asset.positions.length);
      for(let j=0;j<positions.length;j+=3) {
        positions[j]=(asset.positions[j]-.5)*b.w/1000;
        positions[j+1]=asset.positions[j+1]*b.h/1000;
        positions[j+2]=(asset.positions[j+2]-.5)*b.d/1000;
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.BufferAttribute(positions,3));
      geometry.computeVertexNormals();
      const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:.65,side:T.DoubleSide,transparent:!id,opacity:id?1:.25,depthWrite:!!id}));
      mesh.position.set(b.x/1000,b.y/1000,b.z/1000);mesh.rotation.y=b.angle*Math.PI/180;
      mesh.castShadow=!!id;mesh.receiveShadow=!!id;parent.add(mesh);
      if(id){mesh.userData.id=id;this.meshes.push(mesh);}
    };
    const factory=project.factory, factoryAsset=project.assets?.find(a=>a.id===factory?.meshId);
    if(showFactory&&factory&&factoryAsset) drawImported(factoryAsset,factory,this.content,'#6b8094');
    for (const o of project.obstacles) {
      draw(o, this.content, '#a9b4c5');
      this.label(o.name, o.x / 1000, o.z / 1000, (o.y + o.h) / 1000 + 0.2);
    }
    for (const e of project.equipment) {
      const group = new T.Group();
      this.groups.set(e.id, group);
      this.content.add(group);
      worldBoxes(e).forEach((b, i) => {
        const asset=project.assets?.find(a=>a.id===e.parts[i].meshId);
        if(asset) {
          drawImported(asset,b,group,e.id===selected?'#5986d4':'#8c9ebb',e.id);
          draw(b,group,'#3972d3',undefined,true);
        } else draw(
          b,
          group,
          i === 1 ? '#405779' : e.id === selected ? '#7299dd' : '#8c9ebb',
          e.id,
        );
      });
      if (showClearance)
        draw(envelope(e, true), group, '#4384ed', undefined, true);
      const env = envelope(e);
      this.label(
        e.name,
        env.x / 1000,
        env.z / 1000,
        env.h / 1000 + 0.32,
        '#2e4568',
      );
    }
    this.label(`${project.site.width.toLocaleString()} mm`, w / 2, d + 0.45);
    this.label(`${project.site.depth.toLocaleString()} mm`, w + 0.9, d / 2);
    this.render();
  }
  fit(plan = this.plan) {
    this.plan = plan;
    const points=[{x:0,z:0},{x:this.project.site.width,z:this.project.site.depth},...(this.project.factory?corners(this.project.factory):[])];
    const minX=Math.min(...points.map(p=>p.x))/1000,maxX=Math.max(...points.map(p=>p.x))/1000;
    const minZ=Math.min(...points.map(p=>p.z))/1000,maxZ=Math.max(...points.map(p=>p.z))/1000;
    const x=(minX+maxX)/2,z=(minZ+maxZ)/2,size=Math.max(maxX-minX,maxZ-minZ,((this.project.factory?.y??0)+(this.project.factory?.h??0))/1000);
    this.controls.target.set(x, 0, z);
    this.camera.position.set(
      x + (plan ? 0 : size * 0.82),
      size * (plan ? 1.8 : 1.1),
      z + (plan ? 0.001 : size * 0.95),
    );
    this.controls.update();
    this.render();
  }
  focus(id: string) {
    const e = this.project.equipment.find((e) => e.id === id);
    if (!e) return;
    const target = new T.Vector3(e.x / 1000, 1, e.z / 1000);
    const delta = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize()
      .multiplyScalar(9);
    this.controls.target.copy(target);
    this.camera.position.copy(target.clone().add(delta));
    this.controls.update();
    this.render();
  }
  private render() {
    this.renderer.render(this.scene, this.camera);
  }
  capture() {
    this.render();
    return this.renderer.domElement.toDataURL('image/jpeg',.85);
  }
}
