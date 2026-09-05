import * as THREE from "three";
import {
  DISTRICT_BOUNDS,
  DISTRICT_OUTLINE,
  DISTRICT_ROADS,
  LANDMARKS,
  SCANNER_TRIANGLE,
  insideDistrict,
  insideScanner,
} from "./content";
import type { Landmark, LandmarkId } from "./content";
import { createHabitat, ROOM_BOUNDS } from "./habitat";
import type { Furniture, FurnitureId, HabitatFloor } from "./habitat";
import { createStreetLife } from "./street-life";
import type { StreetLifeStatus } from "./street-life";
import type { ActionResult, GameState } from "./game";
import { createJail, JAIL_EXIT } from "./jail";
import { createCompound } from "./compound";

export type WorldAction =
  | { type: "enter-habitat" }
  | { type: "exit-habitat" }
  | { type: "ride-elevator"; floor: HabitatFloor }
  | { type: "select-furniture"; item?: FurnitureId }
  | {
      type: "move-furniture";
      item: FurnitureId;
      dx: number;
      dz: number;
      rotate: boolean;
    };

interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface WorldView {
  playing: boolean;
  paused: boolean;
  carrying: boolean;
  objective?: LandmarkId;
  custody?: GameState["custody"];
  totalYearsServed?: number;
  showerConsumed?: boolean;
}
export interface WorldSnapshot {
  x: number;
  y: number;
  z: number;
  nearest?: Landmark;
  exposed: boolean;
  zoom: number;
  area: "street" | "habitat" | "jail";
  floor: HabitatFloor;
  riding: boolean;
  furniture: readonly Furniture[];
  roomBounds: typeof ROOM_BOUNDS;
  places: readonly Landmark[];
  security: StreetLifeStatus;
  jailExitReachable: boolean;
}

export function createWorld(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x18252b);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute("aria-label", "Walkable isometric district");
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const exterior = new THREE.Group();
  scene.add(exterior);
  let area: "street" | "habitat" | "jail" = "street";
  let nearby: Landmark | undefined;
  scene.fog = new THREE.FogExp2(0x18252b, 0.009);
  scene.add(new THREE.HemisphereLight(0xd0e8e9, 0x495252, 2.8));
  const sun = new THREE.DirectionalLight(0xffe4b8, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const camera = new THREE.OrthographicCamera(-30, 30, 17, -17, 0.1, 180);
  const look = new THREE.Vector3(-10, 0, 13);
  const offset = new THREE.Vector3(32, 32, 32);
  let zoom = 13;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const palette = {
    ground: 0x405357,
    concrete: 0x738080,
    dark: 0x263c43,
    roof: 0x34494d,
    edge: 0x91a09b,
    amber: 0xdfb878,
    glass: 0x243e43,
    teal: 0x6da59e,
    road: 0x35484b,
    paint: 0x94a49a,
    red: 0x9b5145,
    skin: 0xb29980,
  };
  const mats = Object.fromEntries(
    Object.entries(palette).map(([name, color]) => [
      name,
      new THREE.MeshStandardMaterial({ color, roughness: 0.86 }),
    ]),
  ) as Record<keyof typeof palette, THREE.MeshStandardMaterial>;
  const lit = new THREE.MeshStandardMaterial({
    color: 0xe7b870,
    emissive: 0xe0a256,
    emissiveIntensity: 0.65,
  });
  const cyan = new THREE.MeshStandardMaterial({
    color: 0x9ac8bc,
    emissive: 0x549c8d,
    emissiveIntensity: 0.45,
  });
  const collisions: Box[] = [];
  const fadeGroups: {
    group: THREE.Group;
    box: THREE.Box3;
    materials: THREE.MeshStandardMaterial[];
  }[] = [];
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material = mats.concrete,
    parent: THREE.Object3D = exterior,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function tube(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    material: THREE.Material = mats.dark,
    parent: THREE.Object3D = exterior,
  ) {
    const mesh = new THREE.Mesh(cylinder, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(radius, height, radius);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function sign(
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    side = false,
    color = "#d9cba8",
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#24383d";
    ctx.fillRect(0, 0, 768, 192);
    ctx.strokeStyle = "#69847f";
    ctx.lineWidth = 7;
    ctx.strokeRect(12, 12, 744, 168);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 48px monospace";
    ctx.fillText(text, 384, 96, 700);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    if (side) mesh.rotation.y = Math.PI / 2;
    exterior.add(mesh);
    return mesh;
  }
  const b = DISTRICT_BOUNDS;
  const groundSections = [
    {
      x: (b.minX + b.elbowX) / 2,
      z: (b.minZ + b.maxZ) / 2,
      w: b.elbowX - b.minX,
      d: b.maxZ - b.minZ,
    },
    {
      x: (b.elbowX + b.maxX) / 2,
      z: (b.elbowZ + b.maxZ) / 2,
      w: b.maxX - b.elbowX,
      d: b.maxZ - b.elbowZ,
    },
  ];
  for (const section of groundSections) {
    box(section.x, -0.6, section.z, section.w, 1.2, section.d, mats.dark);
    box(section.x, -0.08, section.z, section.w, 0.16, section.d, mats.ground);
    box(
      section.x,
      -1.4,
      section.z,
      section.w + 0.25,
      0.45,
      section.d + 0.25,
      mats.roof,
    );
  }
  // Partition the union into disjoint cells: intersections share edges, never faces.
  const roads = DISTRICT_ROADS.map((road) => ({
    minX:
      Math.min(road.from[0], road.to[0]) -
      (road.from[0] === road.to[0] ? 1.55 : 0),
    maxX:
      Math.max(road.from[0], road.to[0]) +
      (road.from[0] === road.to[0] ? 1.55 : 0),
    minZ:
      Math.min(road.from[1], road.to[1]) -
      (road.from[1] === road.to[1] ? 1.55 : 0),
    maxZ:
      Math.max(road.from[1], road.to[1]) +
      (road.from[1] === road.to[1] ? 1.55 : 0),
  }));
  roads.push({ minX: 12.3, maxX: 15.1, minZ: 16, maxZ: 55 });
  const roadXs = [...new Set(roads.flatMap((r) => [r.minX, r.maxX]))].sort(
    (a, b) => a - b,
  );
  const roadZs = [...new Set(roads.flatMap((r) => [r.minZ, r.maxZ]))].sort(
    (a, b) => a - b,
  );
  const roadVertices: number[] = [];
  for (let x = 1; x < roadXs.length; x++)
    for (let z = 1; z < roadZs.length; z++) {
      const x1 = roadXs[x - 1],
        x2 = roadXs[x],
        z1 = roadZs[z - 1],
        z2 = roadZs[z];
      const mx = (x1 + x2) / 2,
        mz = (z1 + z2) / 2;
      if (
        !roads.some(
          (r) => mx > r.minX && mx < r.maxX && mz > r.minZ && mz < r.maxZ,
        )
      )
        continue;
      if (!insideDistrict(mx, mz) && !(mx >= 12.3 && mx <= 15.1 && mz >= 48))
        continue;
      roadVertices.push(
        x1,
        0.025,
        z1,
        x1,
        0.025,
        z2,
        x2,
        0.025,
        z1,
        x2,
        0.025,
        z1,
        x1,
        0.025,
        z2,
        x2,
        0.025,
        z2,
      );
    }
  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(roadVertices, 3),
  );
  roadGeometry.computeVertexNormals();
  const roadSurface = new THREE.Mesh(roadGeometry, mats.road);
  roadSurface.receiveShadow = true;
  exterior.add(roadSurface);
  DISTRICT_ROADS.forEach((road, index) => {
    const [x1, z1] = road.from,
      [x2, z2] = road.to;
    const vertical = x1 === x2,
      length = Math.hypot(x2 - x1, z2 - z1);
    for (let distance = 1; distance < length; distance += 2) {
      const x = x1 + ((x2 - x1) * distance) / length,
        z = z1 + ((z2 - z1) * distance) / length;
      if (vertical && x === 10 && z < -1) continue;
      // Intersections have no side dashes, including the custody-lane junctions.
      if (
        roads.some(
          (r, i) =>
            i !== index &&
            x + 0.45 > r.minX &&
            x - 0.45 < r.maxX &&
            z + 0.45 > r.minZ &&
            z - 0.45 < r.maxZ,
        )
      )
        continue;
      for (const side of [-1, 1])
        box(
          x + (vertical ? side * 1.35 : 0),
          0.045,
          z + (vertical ? 0 : side * 1.35),
          vertical ? 0.05 : 0.8,
          0.025,
          vertical ? 0.8 : 0.05,
          mats.paint,
        );
    }
  });
  for (const z of [-8, 0, 8])
    for (const x of [-1, 1])
      for (let i = -2; i <= 2; i++)
        box(x * 2, 0.045, z + i * 0.38, 0.6, 0.03, 0.18, mats.paint);
  // Each building owns cloned materials so sightline fading includes its rooftop details.
  function building(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    number: string,
  ) {
    const group = new THREE.Group();
    exterior.add(group);
    const wall = mats.concrete.clone(),
      roof = mats.roof.clone(),
      trim = mats.edge.clone(),
      window = lit.clone(),
      dark = mats.dark.clone();
    const materials = [wall, roof, trim, window, dark];
    box(x, h / 2, z, w, h, d, wall, group);
    box(x, 0.12, z, w + 0.25, 0.24, d + 0.25, trim, group);
    box(x, h + 0.12, z, w + 0.25, 0.24, d + 0.25, trim, group);
    box(x, h + 0.26, z, w - 0.3, 0.12, d - 0.3, roof, group);
    for (let floor = 1; floor < h - 0.5; floor += 1.3) {
      box(x, floor - 0.35, z + d / 2 + 0.015, w, 0.08, 0.1, dark, group);
      for (let col = -w / 2 + 0.7; col < w / 2 - 0.3; col += 1.05)
        box(
          x + col,
          floor,
          z + d / 2 + 0.03,
          0.52,
          0.55,
          0.05,
          (Math.round((col + 10) * 10) + Math.round(floor)) % 3 === 0
            ? dark
            : window,
          group,
        );
      for (let col = -d / 2 + 0.7; col < d / 2 - 0.3; col += 1.15)
        box(x + w / 2 + 0.03, floor, z + col, 0.05, 0.5, 0.6, window, group);
    }
    box(x + 0.5, h + 0.62, z, 1.3, 0.7, 1, dark, group);
    for (let i = -2; i <= 2; i++)
      box(x + 0.5 + i * 0.2, h + 1, z, 0.06, 0.04, 0.8, trim, group);
    tube(x - w / 3, h + 0.7, z - d / 4, 0.38, 1.2, dark, group);
    box(x - w / 3, h + 1.34, z - d / 4, 0.85, 0.14, 0.85, trim, group);
    box(x + w / 2 + 0.08, h / 2, z - d / 3, 0.14, h, 0.17, roof, group);
    collisions.push({ x, z, w: w + 0.25, d: d + 0.25 });
    fadeGroups.push({
      group,
      box: new THREE.Box3(
        new THREE.Vector3(x - w / 2 - 0.2, 0, z - d / 2 - 0.2),
        new THREE.Vector3(x + w / 2 + 0.2, h + 1.5, z + d / 2 + 0.2),
      ),
      materials,
    });
    sign(number, x, h - 0.6, z + d / 2 + 0.08, Math.min(w - 0.3, 3), 0.55);
  }
  building(-5, 12.4, 5.3, 4.8, 8.7, "CAPSULES / H-09");
  box(-7.72, 1, 12, 0.08, 2, 1.4, mats.dark);
  box(-8.6, 2.1, 12, 2, 0.12, 2, mats.teal);
  box(-8.6, 0.04, 12, 2.1, 0.08, 1.8, mats.edge);
  sign("0806 / LEVEL 03", -7.8, 2.7, 12, 2.6, 0.55, true);
  building(5.1, 12.5, 5.5, 4.7, 3.8, "RATIONS");
  building(-5.1, 4.2, 5.2, 4.1, 4.3, "LABOR EXCHANGE");
  building(5.6, 4.4, 4, 3.7, 4.8, "CREDIT AUTHORITY");
  building(-6.5, -4.2, 2.8, 3.7, 3.4, "WATER / 04");
  building(6.5, -4.3, 2.7, 3.6, 3.4, "LOGISTICS");
  building(-5, -12.5, 5.1, 4.6, 5.1, "RECOGNITION");
  building(5, -12, 4.7, 3.9, 4.5, "LICENSED ACCESS");
  // The south concourse and eastern freight arm turn the original core into an L.
  const southNames = [
    "SHIFT HOUSING",
    "RECLAMATION",
    "THERMAL / 04",
    "TRANSIT STAFF",
  ];
  for (let row = 0; row < 4; row++) {
    const z = 20 + row * 8;
    building(-5, z, 5.2, 4.8, 4.4 + (row % 2) * 1.5, southNames[row]);
    building(
      5,
      z,
      5.3,
      4.8,
      3.6 + (row % 3) * 1.2,
      row === 3 ? "PLATFORM / 09" : "LICENSED LABOR",
    );
  }
  // An open, continuous custody-vehicle lane runs down X=13.7.
  box(13.7, -0.08, 51.5, 3.4, 0.16, 7, mats.dark);
  for (const z of [18, 26, 34, 42]) {
    tube(-13.2, 1.5, z, 0.07, 3, mats.dark);
    box(-13.2, 3, z, 1.8, 0.18, 0.35, mats.teal);
    tube(18, 1.6, z, 0.055, 3.2, mats.dark);
    box(18, 3.2, z, 0.65, 0.1, 0.3, cyan);
  }
  box(-13.2, 3.15, 32, 0.16, 0.18, 32, mats.dark);
  box(-12.5, 3.15, 32, 0.16, 0.18, 32, mats.dark);
  for (const z of [20, 28, 36]) {
    tube(-11.9, 0.65, z, 0.62, 1.3, mats.teal);
    box(-11.9, 1.34, z, 1.35, 0.12, 1.35, mats.edge);
    collisions.push({ x: -11.9, z, w: 1.35, d: 1.35 });
  }
  // A tired tram shelter and owner-only cargo gantry give the new arms landmarks.
  box(-1.8, 0.08, 40, 1.4, 0.16, 5, mats.edge);
  for (const z of [38, 42]) {
    box(-1.8, 1.4, z, 0.12, 2.8, 0.12, mats.dark);
    collisions.push({ x: -1.8, z, w: 0.12, d: 0.12 });
  }
  box(-1.8, 2.82, 40, 2.1, 0.15, 5.4, mats.teal);
  box(-1.8, 0.45, 40, 0.55, 0.18, 2.4, mats.edge);
  sign("SERVICE SUSPENDED", -1.8, 2.45, 42.75, 3.2, 0.6);
  sign("SOUTH CONCOURSE", 0, 0.07, 18.2, 4.8, 0.8).rotation.x = -Math.PI / 2;
  sign("EAST GRID EXCHANGE", 29, 0.07, 40, 5, 0.7).rotation.x = -Math.PI / 2;
  sign("TRANSPORT ONLY", 10.5, 1.8, 47, 3, 0.6);
  const compound = createCompound();
  exterior.add(compound.group);
  collisions.push(...compound.collisions);
  fadeGroups.push(...compound.houses);
  // The same six-edge footprint drives the visible perimeter and player bounds.
  for (let edge = 0; edge < DISTRICT_OUTLINE.length; edge++) {
    const [x1, z1] = DISTRICT_OUTLINE[edge],
      [x2, z2] = DISTRICT_OUTLINE[(edge + 1) % DISTRICT_OUTLINE.length];
    const length = Math.hypot(x2 - x1, z2 - z1),
      count = Math.ceil(length / 3);
    const nx = ((z2 - z1) / length) * 0.3,
      nz = (-(x2 - x1) / length) * 0.3;
    for (let index = 0; index < count; index++) {
      const t = (index + 0.5) / count,
        x = x1 + (x2 - x1) * t + nx,
        z = z1 + (z2 - z1) * t + nz;
      if (z1 === b.maxZ && z2 === b.maxZ && x > 10.5 && x < 16.5) continue;
      const vertical = x1 === x2;
      box(
        x,
        0.55,
        z,
        vertical ? 0.25 : length / count,
        0.95,
        vertical ? length / count : 0.25,
        mats.dark,
      );
      box(x, 1.3, z, 0.14, 2.6, 0.14, mats.edge);
      box(
        x,
        2.05,
        z,
        vertical ? 0.075 : length / count,
        0.075,
        vertical ? length / count : 0.075,
        mats.edge,
      );
    }
  }
  box(-1, 7, -23, 7, 14, 6, mats.dark);
  box(-1, 14.3, -23, 8, 0.6, 7, mats.edge);
  box(-1, 15.4, -23, 4, 1.6, 3.5, mats.concrete);
  tube(-1, 18, -23, 0.07, 4, mats.teal);
  for (let x = -3; x <= 1; x += 1) box(x, 7, -19.95, 0.13, 12, 0.05, cyan);
  // Original civic glyph: an owner-disc over an administrative chevron.
  tube(-1, 11.8, -19.7, 0.55, 0.15, lit).rotation.x = Math.PI / 2;
  const emblemLeft = box(-1.5, 10.6, -19.65, 0.18, 1.8, 0.1, mats.amber);
  emblemLeft.rotation.z = -0.5;
  const emblemRight = box(-0.5, 10.6, -19.65, 0.18, 1.8, 0.1, mats.amber);
  emblemRight.rotation.z = 0.5;
  sign("MERIDIAN COMPACT", -1, 5.9, -19.7, 6.5, 1);
  sign("LEADERSHIP PROVIDES", -1, 3.8, -19.7, 6.5, 0.85);
  sign("CITIZENSHIP CONTRIBUTES", -1, 2.5, -19.7, 6.5, 0.85);
  // Monumental invented leader silhouette, no real person or insignia.
  box(-13, 4.5, -18, 3.3, 9, 0.35, mats.dark);
  tube(-13, 7.4, -17.75, 0.5, 0.16, mats.teal).rotation.x = Math.PI / 2;
  box(-13, 5.1, -17.73, 1.25, 3.2, 0.15, mats.teal);
  box(-13, 5.7, -17.72, 2.4, 0.65, 0.15, mats.teal);
  for (const x of [-19, 17, 21])
    for (let i = 0; i < 3; i++) {
      box(x, 0.45, -23 - i * 3.5, 2.3, 0.9, 1.8, mats.roof);
      box(x, 1, -23 - i * 3.5, 2.5, 0.2, 2.1, mats.concrete);
      box(x, 0.45, -22.07 - i * 3.5, 0.3, 0.4, 0.05, lit);
    }
  // Visible steps overlay a continuous walking incline, with closed sides and back.
  for (let i = 0; i < 24; i++) {
    const h = ((i + 1) * 3) / 24;
    box(10, h / 2, -2 - (i + 0.5) / 3, 2.25, h, 1 / 3, mats.edge);
    box(10, h + 0.016, -2 - i / 3 - 0.025, 2.25, 0.035, 0.05, mats.amber);
  }
  box(10, 2.85, -11.5, 2.25, 0.3, 3, mats.edge);
  for (const x of [8.8, 11.2]) {
    collisions.push({ x, z: -7.65, w: 0.16, d: 11.7 });
    for (let i = 0; i <= 11; i++) {
      const z = -2 - i,
        y = Math.min(3, (i * 3) / 8);
      box(x, y + 0.5, z, 0.08, 1, 0.08, mats.dark);
    }
    const rail = box(x, 2.4, -6, 0.09, 0.1, Math.hypot(8, 3), mats.dark);
    rail.rotation.x = Math.atan(3 / 8);
    box(x, 3.9, -11.5, 0.09, 0.1, 3, mats.dark);
  }
  collisions.push({ x: 10, z: -13.2, w: 2.55, d: 0.16 });
  box(10, 3.5, -13.2, 2.5, 1, 0.13, mats.dark);
  box(12.9, 3.1, -11.5, 3.3, 0.3, 1.2, mats.roof);
  // Raised service pipes and suspended footways leave the streets open beneath.
  for (const x of [-8, 8]) {
    tube(x, 2.8, 4, 0.09, 5.6, mats.dark);
    const pipe = tube(x, 5.5, 0, 0.13, 9, mats.teal);
    pipe.rotation.x = Math.PI / 2;
  }
  box(-5, 3.8, 8.3, 2.1, 0.2, 5, mats.roof);
  for (const x of [-6, -4]) box(x, 4.15, 8.3, 0.07, 0.7, 5, mats.edge);
  // Shop shutters, service equipment and human-scale street furniture.
  for (let i = 0; i < 9; i++)
    box(4.8, 0.22 + i * 0.15, 10.1, 2.3, 0.09, 0.05, mats.dark);
  tube(-12.1, 0.65, -7.9, 0.7, 1.3, mats.teal);
  box(-12.1, 1.35, -7.9, 1.5, 0.12, 1.5, mats.edge);
  box(38, 0.65, 38, 0.7, 1.3, 0.7, mats.dark);
  box(38, 1, 38.37, 0.5, 0.3, 0.05, cyan);
  sign("HUMAN WITNESS REQUIRED", 38, 1.7, 38.4, 2.6, 0.5);
  collisions.push({ x: 38, z: 38, w: 0.7, d: 0.7 });
  box(28.3, 0.65, 30.2, 0.7, 1.3, 0.7, mats.dark);
  box(28.3, 1, 30.57, 0.5, 0.3, 0.05, cyan);
  sign("PARCEL DISPATCH / P12", 28.3, 1.7, 30.6, 2.6, 0.5);
  collisions.push({ x: 28.3, z: 30.2, w: 0.7, d: 0.7 });
  for (const [x, z] of [
    [-11.8, 11.8],
    [-4, 7],
    [4, 9],
    [11.8, 8],
    [-11.6, -12],
    [0, -15],
  ]) {
    box(x, 0.5, z, 0.7, 1, 0.65, mats.dark);
    box(x, 0.88, z + 0.34, 0.52, 0.3, 0.035, cyan);
    collisions.push({ x, z, w: 0.7, d: 0.65 });
  }
  sign("WEST SERVICE / NO SCAN", -12.6, 0.06, -3.9, 4.3, 0.7).rotation.x =
    -Math.PI / 2;
  sign("09", -14, 0.07, 12, 2, 1.2).rotation.x = -Math.PI / 2;
  sign("UPPER ACCESS ↑", 12.5, 1.8, -1, 2.6, 0.55);
  const scannerGeometry = new THREE.BufferGeometry();
  scannerGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      SCANNER_TRIANGLE.flatMap(([x, z]) => [x, 0.075, z]),
      3,
    ),
  );
  const scanMaterial = new THREE.MeshBasicMaterial({
    color: 0xc37755,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  exterior.add(new THREE.Mesh(scannerGeometry, scanMaterial));
  const outline = new THREE.BufferGeometry().setFromPoints(
    [...SCANNER_TRIANGLE, SCANNER_TRIANGLE[0]].map(
      ([x, z]) => new THREE.Vector3(x, 0.085, z),
    ),
  );
  exterior.add(
    new THREE.Line(
      outline,
      new THREE.LineBasicMaterial({
        color: 0xcf9864,
        transparent: true,
        opacity: 0.5,
      }),
    ),
  );
  tube(0, 1.4, 3, 0.075, 2.8, mats.dark);
  box(0, 2.9, 2.9, 0.65, 0.3, 0.45, mats.edge);
  box(0, 2.9, 2.65, 0.35, 0.12, 0.03, lit);
  for (const [x, z] of [
    [-12, 4],
    [12, 6],
    [-12, -6],
    [12, -14],
    [2, -14],
  ]) {
    tube(x, 1.6, z, 0.045, 3.2, mats.dark);
    box(x + 0.2, 3.2, z, 0.5, 0.1, 0.25, cyan);
  }
  function person(
    x: number,
    z: number,
    jacket: THREE.Material,
    parent: THREE.Object3D = exterior,
  ) {
    const group = new THREE.Group();
    parent.add(group);
    group.position.set(x, 0, z);
    box(0, 0.78, 0, 0.43, 0.57, 0.3, jacket, group);
    box(0, 1.18, 0, 0.27, 0.29, 0.25, mats.skin, group);
    box(0, 1.35, 0, 0.31, 0.08, 0.28, mats.dark, group);
    const legs = [
      box(-0.13, 0.27, 0, 0.16, 0.5, 0.2, mats.dark, group),
      box(0.13, 0.27, 0, 0.16, 0.5, 0.2, mats.dark, group),
    ];
    box(-0.29, 0.76, 0, 0.12, 0.51, 0.16, jacket, group);
    box(0.29, 0.76, 0, 0.12, 0.51, 0.16, jacket, group);
    return { group, legs };
  }
  person(-10.7, -0.4, mats.teal);
  person(-12.3, 8.1, mats.roof);
  person(2.7, 8.8, mats.roof);
  person(-2.3, 7.4, mats.teal);
  person(12.1, 3, mats.red);
  // Batch only authored static scenery, before adding animated actors and markers.
  // Material identity keeps each building's independent sightline fading intact.
  exterior.updateMatrixWorld(true);
  const staticBatches = new Map<string, THREE.Mesh[]>();
  exterior.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
      return;
    const key = `${object.geometry.id}:${object.material.id}:${object.castShadow}:${object.receiveShadow}`;
    const batch = staticBatches.get(key);
    if (batch) batch.push(object);
    else staticBatches.set(key, [object]);
  });
  for (const meshes of staticBatches.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0];
    const batch = new THREE.InstancedMesh(
      first.geometry,
      first.material,
      meshes.length,
    );
    batch.name = "Static district scenery";
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    for (let i = 0; i < meshes.length; i++) {
      batch.setMatrixAt(i, meshes[i].matrixWorld);
      meshes[i].removeFromParent();
    }
    batch.computeBoundingSphere();
    exterior.add(batch);
  }
  exterior.updateMatrixWorld(true);
  exterior.traverse((object) => {
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
  });
  const player = person(
    -10,
    13,
    new THREE.MeshStandardMaterial({ color: 0xe8ddba, roughness: 0.9 }),
    scene,
  );
  const pack = box(0, 0.85, 0.25, 0.45, 0.4, 0.25, mats.amber, player.group);
  pack.visible = false;
  const playerParts = player.group.children.filter(
    (
      child,
    ): child is THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> =>
      child instanceof THREE.Mesh,
  );
  const playerMaterials = new Map<
    THREE.MeshStandardMaterial,
    THREE.MeshStandardMaterial
  >();
  for (const part of playerParts) {
    let material = playerMaterials.get(part.material);
    if (!material) {
      material = part.material.clone();
      material.transparent = true;
      playerMaterials.set(part.material, material);
    }
    part.material = material;
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.56, 32),
    new THREE.MeshBasicMaterial({ color: 0xe6c278, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  player.group.add(ring);
  const markers = LANDMARKS.map((place) => {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.33, 4),
      new THREE.MeshBasicMaterial({
        color:
          place.id === "underground-contact" || place.id === "relay"
            ? 0x8ec5bf
            : 0xe6c278,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.PI / 4;
    mesh.position.set(
      place.position[0],
      place.position[1] + 0.085,
      place.position[2],
    );
    exterior.add(mesh);
    return { place, mesh };
  });
  const habitat = createHabitat();
  habitat.group.visible = false;
  const jail = createJail();
  exterior.add(jail.vehicle);
  const areaGroups = [
    ["street", exterior],
    ["habitat", habitat.group],
    ["jail", jail.group],
  ] as const;
  let custodyPhase: NonNullable<GameState["custody"]>["phase"] | undefined;
  const streetOfficerPosition: [number, number, number] = [0, 0, 0];
  const streetOfficer: Landmark = {
    id: "street-officer",
    name: "Recognition patrol",
    sector: "COMPLIANCE / VOLUNTARY INSPECTION",
    position: streetOfficerPosition,
    text: "We can inspect your recognition key and cargo. Legal residents pay nothing. Carrying an unregistered relay component means arrest, custody transport and a ten-year consciousness sentence. Your body waits in processing; the torment happens offscreen.",
  };
  const streetPlaces = [...LANDMARKS, streetOfficer];
  const radius = 0.28;
  const streetLife = createStreetLife({ isBlocked: blocked });
  exterior.add(streetLife.group);
  const interiorMarkers = new THREE.Group();
  // Moving residents use cheap contact shadows; city architecture is baked once.
  streetLife.group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = false;
  });
  scene.add(interiorMarkers);
  const markerGeometry = new THREE.RingGeometry(0.27, 0.34, 4);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xe6c278,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (let i = 0; i < 16; i++) {
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.rotation.z = Math.PI / 4;
    interiorMarkers.add(marker);
  }
  const keys = new Set<string>();
  let paused = true,
    playing = false,
    time = 0;
  const moveKeys = [
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ];
  window.addEventListener("keydown", (e) => {
    if (moveKeys.includes(e.code)) {
      if (!paused) e.preventDefault();
      keys.add(e.code);
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    const aspect = innerWidth / innerHeight;
    camera.left = -zoom * aspect;
    camera.right = zoom * aspect;
    camera.top = zoom;
    camera.bottom = -zoom;
    camera.updateProjectionMatrix();
  }
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if ((paused && playing) || habitat.riding) return;
      zoom = THREE.MathUtils.clamp(
        zoom + e.deltaY * 0.012,
        area === "habitat" ? 6 : 9,
        area === "habitat" ? 16 : 34,
      );
      resize();
    },
    { passive: false },
  );
  window.addEventListener("resize", resize);
  resize();
  function blocked(x: number, z: number) {
    if (!insideDistrict(x, z, radius)) return true;
    return collisions.some(
      (b) =>
        Math.abs(x - b.x) < b.w / 2 + radius &&
        Math.abs(z - b.z) < b.d / 2 + radius,
    );
  }
  const ray = new THREE.Ray(),
    target = new THREE.Vector3(),
    hit = new THREE.Vector3(),
    desired = new THREE.Vector3();
  function reset() {
    keys.clear();
    area = "street";
    nearby = undefined;
    custodyPhase = undefined;
    jail.group.visible = false;
    jail.vehicle.visible = false;
    player.group.visible = true;
    exterior.visible = true;
    habitat.group.visible = false;
    interiorMarkers.visible = false;
    habitat.reset();
    streetLife.reset();
    player.group.position.set(-10, 0, 13);
    player.group.rotation.y = 0;
    zoom = 13;
    look.set(-10, 0, 13);
    resize();
  }
  function act(action: WorldAction): ActionResult {
    if (action.type === "select-furniture" && action.item === undefined) {
      habitat.setEditing(undefined);
      return { ok: true, message: "Arrangement closed." };
    }
    if (!playing || habitat.riding || custodyPhase)
      return {
        ok: false,
        message: "Wait for transport or processing to finish.",
      };
    if (action.type === "enter-habitat") {
      if (area !== "street" || nearby?.id !== "habitat-entry")
        return { ok: false, message: "Walk to the Habitat 09 entrance." };
      area = "habitat";
      habitat.enter(player.group.position);
      exterior.visible = false;
      habitat.group.visible = true;
      zoom = 10;
      look.copy(player.group.position);
      nearby = undefined;
      keys.clear();
      resize();
      return {
        ok: true,
        message: "Habitat 09. Take the elevator to level 03 for berth 0806.",
      };
    }
    if (area !== "habitat")
      return { ok: false, message: "Enter your housing block first." };
    if (action.type === "exit-habitat") {
      if (nearby?.id !== "habitat-exit")
        return {
          ok: false,
          message: "The street exit is in the ground-floor lobby.",
        };
      area = "street";
      player.group.position.set(-10, 0, 12.8);
      exterior.visible = true;
      habitat.group.visible = false;
      interiorMarkers.visible = false;
      zoom = 13;
      look.copy(player.group.position);
      nearby = undefined;
      keys.clear();
      resize();
      return {
        ok: true,
        message: "Back outside. Your room arrangement is kept for this day.",
      };
    }
    if (action.type === "ride-elevator") {
      const result = habitat.ride(action.floor, player.group.position);
      if (result.ok) {
        keys.clear();
        nearby = undefined;
      }
      return result;
    }
    if (
      habitat.floor !== 3 ||
      (nearby?.id !== "furniture" && nearby?.id !== "home")
    )
      return {
        ok: false,
        message:
          "Arrange your belongings from the control strip beside berth 0806.",
      };
    if (action.type === "select-furniture") {
      habitat.setEditing(action.item);
      return {
        ok: true,
        message:
          "Move or rotate the highlighted piece. Keep your doorway clear.",
      };
    }
    return habitat.editFurniture(
      action.item,
      action.dx,
      action.dz,
      action.rotate,
      player.group.position,
    );
  }
  function update(delta: number, view: WorldView): WorldSnapshot {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    time += dt;
    paused = view.paused;
    playing = view.playing;
    const nextCustody = view.custody?.phase;
    if (nextCustody !== custodyPhase) {
      keys.clear();
      nearby = undefined;
      if (nextCustody === "transport") {
        jail.begin(
          player.group.position.x,
          player.group.position.z,
          area === "habitat",
        );
        area = "street";
        exterior.visible = true;
        habitat.group.visible = false;
        interiorMarkers.visible = false;
        zoom = 13;
      } else if (nextCustody) {
        area = "jail";
        exterior.visible = false;
        habitat.group.visible = false;
        zoom = 9;
        player.group.position.set(
          nextCustody === "release" ? -1 : 1,
          nextCustody === "release" ? 0 : 0.28,
          nextCustody === "release" ? 2 : 0,
        );
      } else if (custodyPhase) {
        area = "street";
        exterior.visible = true;
        player.group.position.set(13.7, 0, 45);
        zoom = 13;
      }
      custodyPhase = nextCustody;
      look.copy(player.group.position);
      resize();
    }
    // Hidden interiors otherwise still incur recursive matrix updates each frame.
    for (const [region, group] of areaGroups) {
      if (region === area) {
        if (group.parent !== scene) scene.add(group);
      } else if (group.parent === scene) scene.remove(group);
    }
    jail.update(view, player.group.position);
    player.group.visible = nextCustody !== "transport";
    if (area === "habitat")
      habitat.update(
        Math.min(delta, 0.1),
        paused,
        player.group.position,
        view.showerConsumed,
      );
    if (paused) keys.clear();
    let sx = 0,
      sy = 0;
    if (
      !paused &&
      playing &&
      !habitat.riding &&
      (!nextCustody || nextCustody === "release")
    ) {
      sx =
        Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"));
      sy =
        Number(keys.has("KeyS") || keys.has("ArrowDown")) -
        Number(keys.has("KeyW") || keys.has("ArrowUp"));
    }
    const p = player.group.position;
    const length = Math.hypot(sx, sy);
    if (length) {
      const dx = ((sx + sy) / Math.SQRT2 / length) * 4 * dt;
      const dz = ((sy - sx) / Math.SQRT2 / length) * 4 * dt;
      if (area === "habitat") {
        if (!habitat.blocked(p.x + dx, p.z)) p.x += dx;
        if (!habitat.blocked(p.x, p.z + dz)) p.z += dz;
      } else if (area === "jail") {
        if (!jail.blocked(p.x + dx, p.z)) p.x += dx;
        if (!jail.blocked(p.x, p.z + dz)) p.z += dz;
      } else {
        if (!blocked(p.x + dx, p.z) && !streetLife.blocked(p.x + dx, p.z))
          p.x += dx;
        if (!blocked(p.x, p.z + dz) && !streetLife.blocked(p.x, p.z + dz))
          p.z += dz;
      }
      player.group.rotation.y = Math.atan2(dx, dz);
    }
    if (area === "habitat") {
      if (!habitat.riding) p.y = habitat.floor * 4;
    } else if (area === "jail") {
      p.y = nextCustody === "release" ? 0 : 0.28;
    } else
      p.y =
        Math.abs(p.x - 10) < 1.1 && p.z <= -2 && p.z >= -13
          ? Math.min(3, ((-p.z - 2) * 3) / 8)
          : 0;
    const seated = area === "jail" && nextCustody !== "release";
    player.legs[0].rotation.x = seated
      ? -1.2
      : length
        ? Math.sin(time * 13) * 0.4
        : 0;
    player.legs[1].rotation.x = seated ? -1.2 : -player.legs[0].rotation.x;
    ring.rotation.z = -player.group.rotation.y;
    pack.visible = view.carrying;
    desired.copy(p);
    look.lerp(desired, 1 - Math.exp(-dt * 4));
    camera.position.copy(look).add(offset);
    camera.lookAt(look);
    target.copy(p);
    target.y += 0.9;
    ray.origin.copy(camera.position);
    ray.direction.copy(target).sub(camera.position).normalize();
    const distance = camera.position.distanceTo(target);
    let obscured = false;
    for (const building of fadeGroups) {
      const intersects = ray.intersectBox(building.box, hit);
      const fade =
        playing &&
        area === "street" &&
        intersects &&
        camera.position.distanceTo(hit) < distance - 0.4;
      if (fade) obscured = true;
      for (const material of building.materials) {
        material.opacity = THREE.MathUtils.lerp(
          material.opacity,
          fade ? 0.17 : 1,
          1 - Math.exp(-dt * 10),
        );
        material.depthWrite = material.opacity > 0.8;
        if (material.opacity > 0.999) material.opacity = 1;
        const transparent = material.opacity < 1;
        if (material.transparent !== transparent) {
          material.transparent = transparent;
          material.needsUpdate = true;
        }
      }
    }
    // Transparent parapets can still cover the body. Composite the actual player
    // over a faded building, without hiding floors, rails, or changing collisions.
    for (const part of playerParts) {
      part.renderOrder = obscured ? 10 : 0;
      part.material.depthTest = !obscured;
      part.material.depthWrite = !obscured;
    }
    let nearest: Landmark | undefined,
      best = 1.5;
    for (const { place, mesh } of markers) {
      const dist = Math.hypot(p.x - place.position[0], p.z - place.position[2]);
      mesh.visible =
        area === "street" &&
        (dist < 8 ||
          place.id === view.objective ||
          (view.objective === "home" && place.id === "habitat-entry") ||
          !playing);
      mesh.material.opacity = place.id === view.objective ? 0.95 : 0.45;
      mesh.scale.setScalar(
        place.id === view.objective ? 1.4 + Math.sin(time * 3) * 0.1 : 1,
      );
      if (
        area === "street" &&
        dist <= best &&
        Math.abs(p.y - place.position[1]) <= 0.75
      ) {
        nearest = place;
        best = dist;
      }
    }
    interiorMarkers.visible = area === "habitat" && !habitat.riding;
    const places =
      area === "habitat" ? habitat.places : area === "jail" ? [] : streetPlaces;
    if (area === "habitat")
      for (let i = 0; i < interiorMarkers.children.length; i++) {
        const place = places[i],
          marker = interiorMarkers.children[i];
        marker.visible = Boolean(place);
        if (!place) continue;
        marker.position.set(
          place.position[0],
          place.position[1] + 0.055,
          place.position[2],
        );
        const distance = Math.hypot(
          p.x - place.position[0],
          p.z - place.position[2],
        );
        if (distance <= best && Math.abs(p.y - place.position[1]) <= 0.75) {
          nearest = place;
          best = distance;
        }
      }
    nearby = nearest;
    const security = streetLife.update(Math.min(Math.max(delta, 0), 0.25), {
      paused,
      active: playing && area === "street",
      playerX: p.x,
      playerY: p.y,
      playerZ: p.z,
      moving: Boolean(length),
    });
    streetOfficerPosition[0] = security.officerX;
    streetOfficerPosition[2] = security.officerZ;
    if (area === "street" && !nextCustody) {
      const distance = Math.hypot(
        p.x - security.officerX,
        p.z - security.officerZ,
      );
      if (distance <= best && Math.abs(p.y) <= 0.75) nearest = streetOfficer;
    }
    if (nextCustody) nearest = undefined;
    nearby = nearest;
    const exposed = area === "street" && insideScanner(p.x, p.z) && p.y < 0.75;
    scanMaterial.opacity =
      view.carrying && exposed ? 0.22 + Math.sin(time * 8) * 0.08 : 0.12;
    renderer.domElement.dataset.position = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    renderer.domElement.dataset.zoom = String(zoom);
    renderer.domElement.dataset.area = area;
    renderer.domElement.dataset.floor = String(habitat.floor);
    renderer.domElement.dataset.riding = String(habitat.riding);
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      nearest,
      exposed,
      zoom,
      area,
      floor: habitat.floor,
      riding: habitat.riding,
      furniture: habitat.furniture,
      roomBounds: ROOM_BOUNDS,
      places,
      security,
      jailExitReachable:
        area === "jail" &&
        nextCustody === "release" &&
        Math.hypot(p.x - JAIL_EXIT.x, p.z - JAIL_EXIT.z) <= 1.5,
    };
  }
  let shadowArea: WorldSnapshot["area"] | undefined;
  return {
    update,
    reset,
    act,
    render: () => {
      renderer.shadowMap.autoUpdate = area !== "street";
      if (shadowArea !== area) {
        const center = area === "street" ? 16 : 0;
        const extent = area === "street" ? 50 : 24;
        sun.position.set(center - 32, 56, center + 24);
        sun.target.position.set(center, 0, center);
        sun.shadow.camera.left = sun.shadow.camera.bottom = -extent;
        sun.shadow.camera.right = sun.shadow.camera.top = extent;
        sun.shadow.camera.updateProjectionMatrix();
        renderer.shadowMap.needsUpdate = true;
      }
      for (const part of playerParts) part.castShadow = area !== "street";
      shadowArea = area;
      renderer.render(scene, camera);
    },
  };
}
