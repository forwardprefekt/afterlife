import * as THREE from "three";
import type { Landmark } from "./content";
import type { ActionResult } from "./game";

export type HabitatFloor = 0 | 1 | 3;
export type FurnitureId = "bed" | "table" | "stool" | "locker";
export interface Furniture {
  id: FurnitureId;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  rotated: boolean;
}
export const ROOM_BOUNDS = {
  minX: 4.15,
  maxX: 7.85,
  minZ: 2.7,
  maxZ: 6.3,
} as const;

interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
}
const FLOORS: readonly HabitatFloor[] = [0, 1, 3];
const RADIUS = 0.28;
const ENTRY_STRIP: Footprint = { x: 6, z: 3.65, w: 1, d: 2.3 };
const ORIGINAL_FURNITURE: readonly Furniture[] = [
  {
    id: "bed",
    name: "Narrow capsule bed",
    x: 4.75,
    z: 4.75,
    w: 1,
    d: 2,
    rotated: false,
  },
  {
    id: "table",
    name: "Crate-table",
    x: 7.25,
    z: 5.75,
    w: 0.8,
    d: 0.7,
    rotated: false,
  },
  {
    id: "stool",
    name: "Repaired stool",
    x: 7,
    z: 4.5,
    w: 0.5,
    d: 0.5,
    rotated: false,
  },
  {
    id: "locker",
    name: "Personal locker",
    x: 7.25,
    z: 3.25,
    w: 0.65,
    d: 0.8,
    rotated: false,
  },
];

function intersects(a: Footprint, b: Footprint, clearance = 0): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + clearance &&
    Math.abs(a.z - b.z) < (a.d + b.d) / 2 + clearance
  );
}
function touchesPlayer(box: Footprint, x: number, z: number): boolean {
  const dx = Math.max(Math.abs(x - box.x) - box.w / 2, 0);
  const dz = Math.max(Math.abs(z - box.z) - box.d / 2, 0);
  return dx * dx + dz * dz < RADIUS * RADIUS;
}

export function createHabitat() {
  const group = new THREE.Group();
  group.name = "H-09 capsule habitat";
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const colors = {
    concrete: 0x586a6b,
    floor: 0x34484c,
    dark: 0x23373d,
    metal: 0x82918a,
    teal: 0x719c96,
    amber: 0xd0a465,
    mattress: 0x9ca99a,
    cloth: 0x667b79,
    skin: 0xb29980,
    bag: 0x786d59,
    red: 0x9b5145,
  };
  const waterMaterial = new THREE.MeshBasicMaterial({
    color: 0xa8e2e8,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const porcelain = new THREE.MeshStandardMaterial({
    color: 0xc5d2c8,
    roughness: 0.28,
  });
  const bowlGeometry = new THREE.TorusGeometry(0.27, 0.075, 6, 14);
  const bowlShellGeometry = new THREE.CylinderGeometry(
    0.29,
    0.16,
    0.28,
    14,
    1,
    true,
  );
  const headGeometry = new THREE.SphereGeometry(1, 8, 6);
  const materials = Object.fromEntries(
    Object.entries(colors).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    ]),
  ) as Record<keyof typeof colors, THREE.MeshStandardMaterial>;
  const light = new THREE.MeshStandardMaterial({
    color: 0x9ac8bc,
    emissive: 0x549c8d,
    emissiveIntensity: 0.45,
  });
  const warm = new THREE.MeshStandardMaterial({
    color: 0xe7b870,
    emissive: 0xe0a256,
    emissiveIntensity: 0.45,
  });
  const selectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xf1c67c,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const levels = new Map<HabitatFloor, THREE.Group>();
  const obstacles = new Map<HabitatFloor, Footprint[]>();
  let floor: HabitatFloor = 0;
  let riding = false;
  let destination: HabitatFloor = 0;
  let rideElapsed = 0;
  let startHeight = 0;
  let travelDuration = 0;
  let riderX = 0;
  let riderZ = -7;
  const furniture: Furniture[] = ORIGINAL_FURNITURE.map((piece) => ({
    ...piece,
  }));
  const furnitureMeshes = new Map<FurnitureId, THREE.Group>();
  const highlights = new Map<FurnitureId, THREE.Mesh>();
  type Route = readonly (readonly [number, number])[];
  const walkers: {
    level: HabitatFloor;
    body: THREE.Group;
    limbs: THREE.Group[];
    route: Route;
    target: number;
    speed: number;
    phase: number;
    officer: boolean;
  }[] = [];
  const occupied: {
    body: THREE.Group;
    arm: THREE.Group;
    seated: boolean;
    phase: number;
  }[] = [];
  const cameras: { level: HabitatFloor; swivel: THREE.Group; phase: number }[] =
    [];
  const fallingWater: { mesh: THREE.Mesh; top: number; phase: number }[] = [];
  const lifeElapsed = [0, 0, 0, 0];
  const officerPosition: [number, number, number] = [12.3, 4, 0];

  function box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material = materials.concrete,
  ) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function post(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    material: THREE.Material = materials.metal,
  ) {
    const mesh = new THREE.Mesh(cylinder, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(radius, height, radius);
    parent.add(mesh);
    return mesh;
  }
  function solid(
    level: HabitatFloor,
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    material: THREE.Material = materials.concrete,
  ) {
    obstacles.get(level)!.push({ x, z, w, d });
    return box(levels.get(level)!, x, h / 2, z, w, h, d, material);
  }

  // A single atlas supplies every placard and bunk number in the building.
  const labels = [
    "H-09 / RESIDENT INTAKE",
    "WAIT FOR YOUR NUMBER",
    "ACCESS IS A LICENSE",
    "SHARED WATER / 06:00-22:00",
    "KEEP AISLES CLEAR",
    "0806 / YOUR CAPSULE",
    "PERSONAL ARRANGEMENT",
    "EXIT / STREET",
    "LIFT / 00 01 03",
    "02 / SERVICE ONLY",
    "01 / COMMON LEVEL",
    "03 / RESIDENT LEVEL",
    "NO PRIVATE STORAGE",
    "40 CREDITS / SHIFT",
    "THIN WALLS / QUIET HOURS",
    "WASH / WAIT",
    "0708",
    "0710",
    "SHOWERS / 2 AC",
    "TOILETS / 16 STALLS",
    "PRIVACY IS NOT EXEMPTION",
  ];
  for (const level of [1, 3])
    for (let i = 1; i <= 20; i++)
      labels.push(`${level === 1 ? "01" : "07"}${String(i).padStart(2, "0")}`);
  const atlas = document.createElement("canvas");
  atlas.width = 1024;
  atlas.height = Math.ceil(labels.length / 4) * 64;
  const context = atlas.getContext("2d")!;
  context.fillStyle = "#23373d";
  context.fillRect(0, 0, atlas.width, atlas.height);
  labels.forEach((label, index) => {
    const x = (index % 4) * 256;
    const y = Math.floor(index / 4) * 64;
    context.strokeStyle = "#719c96";
    context.lineWidth = 2;
    context.strokeRect(x + 3, y + 3, 250, 58);
    context.fillStyle = "#e2d4b1";
    context.font = `bold ${label.length > 17 ? 14 : 21}px monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, x + 128, y + 32, 244);
  });
  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });
  const signGeometry = new Map<string, THREE.PlaneGeometry>();
  function sign(
    parent: THREE.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    w = 2.5,
    h = 0.45,
  ) {
    let geometry = signGeometry.get(text);
    if (!geometry) {
      const index = labels.indexOf(text);
      geometry = new THREE.PlaneGeometry(1, 1);
      const uv = geometry.attributes.uv;
      const left = ((index % 4) * 256 + 1) / atlas.width;
      const bottom = 1 - (Math.floor(index / 4) * 64 + 63) / atlas.height;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          left + (uv.getX(i) * 254) / atlas.width,
          bottom + (uv.getY(i) * 62) / atlas.height,
        );
      signGeometry.set(text, geometry);
    }
    const mesh = new THREE.Mesh(geometry, signMaterial);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, 1);
    parent.add(mesh);
    return mesh;
  }

  // All figures represent adults. Robes and stall screens keep washing non-graphic.
  function adult(
    parent: THREE.Object3D,
    uniform = false,
    seated = false,
    bathing = false,
  ) {
    const body = new THREE.Group();
    parent.add(body);
    const jacket = uniform
      ? materials.dark
      : bathing
        ? materials.teal
        : materials.cloth;
    box(body, 0, seated ? 0.93 : 0.98, 0, 0.43, 0.65, 0.3, jacket);
    const head = new THREE.Mesh(headGeometry, materials.skin);
    head.position.y = seated ? 1.41 : 1.49;
    head.scale.set(0.15, 0.19, 0.15);
    body.add(head);
    const limbs: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, seated ? 0.64 : 0.67, 0);
      body.add(leg);
      if (seated) {
        box(leg, 0, -0.04, 0.2, 0.17, 0.17, 0.46, jacket);
        box(leg, 0, -0.3, 0.37, 0.16, 0.53, 0.18, materials.dark);
      } else {
        box(leg, 0, -0.31, 0, 0.16, 0.62, 0.19, materials.dark);
      }
      limbs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(side * 0.29, seated ? 1.17 : 1.22, 0);
      box(arm, 0, -0.25, 0, 0.13, 0.53, 0.16, jacket);
      body.add(arm);
      limbs.push(arm);
    }
    if (bathing) box(body, 0, 0.65, 0, 0.46, 0.62, 0.34, materials.teal);
    if (uniform) {
      box(body, 0, 1.67, 0, 0.36, 0.14, 0.32, materials.dark);
      box(body, 0, 1.62, 0.18, 0.38, 0.035, 0.17, materials.metal);
      box(body, -0.11, 1.14, 0.157, 0.1, 0.13, 0.025, materials.amber);
      box(body, 0, 0.74, 0, 0.46, 0.09, 0.34, materials.metal);
      box(body, 0.3, 0.79, 0, 0.13, 0.22, 0.17, materials.dark);
    }
    return { body, limbs };
  }

  function residents(parent: THREE.Object3D, count: number, annex = false) {
    const level =
      parent === levels.get(0) ? 0 : parent === levels.get(1) ? 1 : 3;
    for (let index = 0; index < count; index++) {
      const figure = adult(parent);
      const lane = index % 2 === 0 ? -0.65 : 0.65;
      // Authored corridors avoid every bunk, queue rail, wash fixture and movable room.
      const route: Route = annex
        ? [
            [12.3, 1.5],
            [30.4, 1.5],
            [30.4, 3.5],
            [12.3, 3.5],
          ]
        : level === 0
          ? [
              [0, 1.5],
              [5.8, 1.5],
              [5.8, 7.9],
              [0, 7.9],
            ]
          : index % 3 === 0
            ? [
                [lane, -4.4],
                [lane, 8.8],
              ]
            : [
                [-10.7, lane],
                [10.7, lane],
              ];
      figure.body.name = `Adult resident ${level}-${walkers.length}`;
      walkers.push({
        level,
        ...figure,
        route,
        target: 1,
        speed: 0.4 + (index % 4) * 0.055,
        phase: index * 1.73,
        officer: false,
      });
    }
  }

  function securityCamera(
    level: HabitatFloor,
    x: number,
    z: number,
    phase: number,
  ) {
    const parent = levels.get(level)!;
    box(parent, x, 2.05, z, 0.09, 0.3, 0.09, materials.metal);
    const swivel = new THREE.Group();
    swivel.position.set(x, 2.27, z);
    parent.add(swivel);
    box(swivel, 0, 0, 0.13, 0.3, 0.21, 0.55, materials.dark);
    box(swivel, 0, -0.015, 0.414, 0.18, 0.13, 0.03, light);
    box(swivel, 0.115, 0.075, 0.4, 0.04, 0.04, 0.025, warm);
    cameras.push({ level, swivel, phase });
  }

  for (const level of FLOORS) {
    const parent = new THREE.Group();
    parent.name = `Habitat level ${level}`;
    parent.position.y = level * 4;
    levels.set(level, parent);
    obstacles.set(level, []);
    group.add(parent);
    const east = level === 1 ? 32 : 12;
    const width = east + 12;
    const center = (east - 12) / 2;
    box(parent, center, -0.12, 0, width, 0.24, 20, materials.floor);
    // Only the common level extends east; lift and private-room coordinates stay fixed.
    solid(level, center, -9.85, width, 0.3, 1.9);
    solid(level, -11.85, 0, 0.3, 20, 0.65);
    solid(level, east - 0.15, 0, 0.3, 20, 0.35);
    solid(level, -6.8, 9.85, 10, 0.3, 0.3);
    solid(level, (east + 1.8) / 2, 9.85, east - 1.8, 0.3, 0.3);
    box(parent, 0, 0.018, 0, 3.1, 0.025, 19.4, materials.dark);
    box(parent, 0, 0.022, 0, 23.4, 0.025, 2.9, materials.dark);
    for (const x of [-1.5, 1.5])
      box(parent, x, 0.041, 0, 0.045, 0.025, 18.6, materials.teal);
    for (const z of [-1.4, 1.4])
      box(parent, 0, 0.045, z, 23, 0.025, 0.045, materials.teal);
    // Cabin enclosure: open south, no roof or foreground wall.
    solid(level, -1.55, -7.15, 0.24, 3.55, 2.1, materials.dark);
    solid(level, 1.55, -7.15, 0.24, 3.55, 0.8, materials.dark);
    solid(level, 0, -8.85, 3.2, 0.24, 2.1, materials.dark);
    sign(parent, "LIFT / 00 01 03", 0, 2.22, -8.7, 2.7, 0.45);
    box(parent, 1.31, 1.05, -6.25, 0.09, 0.42, 0.22, light);
    for (let i = 0; i < 5; i++) {
      box(
        parent,
        -11.5 + i * 5.3,
        2.55,
        -9.57,
        3.2,
        0.09,
        0.09,
        materials.metal,
      );
      box(parent, -11 + i * 5.3, 1.95, -9.56, 1.5, 0.09, 0.12, light);
    }
    for (const x of [-10.9, 10.9]) {
      post(parent, x, 1.1, -9.55, 0.1, 2.2);
      box(parent, x, 0.34, -9.3, 0.45, 0.5, 0.45, materials.dark);
    }
    securityCamera(level, -1.8, -3.9, level * 0.9);
    securityCamera(level, 7, 8.9, level + 2);
  }

  const lobby = levels.get(0)!;
  sign(lobby, "H-09 / RESIDENT INTAKE", -6, 2.05, -8.85, 4.8, 0.7);
  sign(lobby, "WAIT FOR YOUR NUMBER", -6, 1.35, -8.8, 3.5, 0.5);
  sign(lobby, "ACCESS IS A LICENSE", 6, 2, -8.85, 4.5, 0.65);
  sign(lobby, "EXIT / STREET", 0, 0.14, 9.4, 2.4, 0.45).rotation.x =
    -Math.PI / 2;
  for (const x of [-8.2, -5.9, -3.6]) {
    solid(0, x, -7.3, 1.6, 1, 0.92, materials.concrete);
    box(lobby, x, 1.3, -7.48, 0.83, 0.7, 0.16, materials.dark);
    box(lobby, x, 1.32, -7.38, 0.67, 0.48, 0.035, light);
    box(lobby, x, 0.94, -7, 0.7, 0.04, 0.25, materials.metal);
  }
  for (const x of [-9.4, -2.5]) {
    for (const z of [-5.9, -3.1, 0.1]) post(lobby, x, 0.45, z, 0.07, 0.9);
    solid(0, x, -2.9, 0.1, 6.4, 0.7, materials.teal);
  }
  for (const z of [3, 5.2, 7.4]) {
    solid(0, -6.6, z, 4, 0.65, 0.45, materials.metal);
    box(lobby, -6.6, 0.77, z - 0.24, 4, 0.5, 0.12, materials.dark);
    for (const x of [-8.1, -5.1])
      box(lobby, x, 0.23, z, 0.12, 0.45, 0.55, materials.dark);
  }
  solid(0, 7.7, -6.8, 5.7, 1.1, 1.05, materials.concrete);
  sign(lobby, "40 CREDITS / SHIFT", 7.7, 1.55, -6.75, 4.3, 0.6);
  for (const z of [1.7, 4.4, 7.1]) {
    solid(0, 8.9, z, 2.3, 1.15, 0.36, materials.dark);
    box(lobby, 8.65, 0.67, z, 1.45, 0.32, 0.8, materials.bag);
    box(lobby, 9.5, 0.6, z + 0.38, 0.55, 0.45, 0.42, materials.cloth);
  }
  residents(lobby, 14);

  function capsules(
    level: HabitatFloor,
    x: number,
    z: number,
    number: number,
    tiers: number,
  ) {
    const parent = levels.get(level)!;
    obstacles.get(level)!.push({ x, z, w: 2.35, d: 1.7 });
    const height = tiers * 0.99;
    box(parent, x, height / 2, z - 0.79, 2.35, height, 0.12, materials.dark);
    for (const side of [-1, 1])
      box(
        parent,
        x + side * 1.12,
        height / 2,
        z,
        0.11,
        height,
        1.65,
        materials.concrete,
      );
    for (let tier = 0; tier < tiers; tier++) {
      const y = tier * 0.99;
      box(parent, x, y + 0.09, z, 2.25, 0.15, 1.6, materials.metal);
      box(parent, x, y + 0.25, z - 0.05, 1.96, 0.19, 1.35, materials.mattress);
      box(
        parent,
        x - 0.75,
        y + 0.38,
        z - 0.05,
        0.37,
        0.12,
        1.03,
        materials.cloth,
      );
      box(
        parent,
        x + 0.87,
        y + 0.55,
        z + 0.77,
        0.35,
        0.72,
        0.04,
        (number + tier) % 3 === 0 ? materials.amber : materials.cloth,
      );
      box(parent, x, y + 0.93, z + 0.78, 2.22, 0.05, 0.08, materials.dark);
      if ((number + tier) % 3 !== 0) {
        box(parent, x + 0.15, y + 0.43, z, 1.13, 0.27, 0.63, materials.cloth);
        box(
          parent,
          x - 0.61,
          y + 0.46,
          z + 0.04,
          0.28,
          0.27,
          0.28,
          materials.skin,
        );
      }
      box(parent, x - 0.98, y + 0.65, z + 0.7, 0.07, 0.09, 0.05, light);
    }
    for (const side of [-1, 1])
      box(
        parent,
        x + 0.53 + side * 0.19,
        height / 2,
        z + 0.87,
        0.045,
        height,
        0.06,
        materials.metal,
      );
    for (let y = 0.23; y < height; y += 0.27)
      box(parent, x + 0.53, y, z + 0.9, 0.43, 0.04, 0.07, materials.metal);
    sign(
      parent,
      `${level === 1 ? "01" : "07"}${String(number).padStart(2, "0")}`,
      x - 0.35,
      0.63,
      z + 0.87,
      0.85,
      0.21,
    );
  }

  for (const level of [1, 3] as const) {
    const parent = levels.get(level)!;
    let number = 1;
    for (const z of [-7.6, -3.5])
      for (const x of [-9.8, -6.8, -3.8, 3.8, 6.8, 9.8])
        capsules(level, x, z, number++, x < 0 ? 3 : 2);
    for (const z of [3.5, 7.5])
      for (const x of [-9.8, -6.8, -3.8])
        capsules(level, x, z, number++, z > 5 ? 2 : 3);
    capsules(level, 10, 3.5, number++, 2);
    capsules(level, 10, 7.5, number, 2);
    sign(
      parent,
      level === 1 ? "01 / COMMON LEVEL" : "03 / RESIDENT LEVEL",
      -3.7,
      2.9,
      -8.55,
      3.6,
      0.5,
    );
    sign(parent, "KEEP AISLES CLEAR", -6.8, 3.12, -3.5, 2.25, 0.32);
    sign(parent, "THIN WALLS / QUIET HOURS", 6.8, 2.25, -3.5, 2.3, 0.32);
    sign(parent, "NO PRIVATE STORAGE", -9.8, 2.3, 7.5, 2.3, 0.32);
    // Folded washing on lines between the bunks; never a ceiling over the central routes.
    for (const x of [-8.8, -5.8, 9.6]) {
      box(parent, x, 1.85, 5.35, 1.8, 0.025, 0.025, materials.metal);
      for (let i = 0; i < 3; i++)
        box(
          parent,
          x - 0.55 + i * 0.55,
          1.58,
          5.35,
          0.38,
          0.53,
          0.04,
          i % 2 ? materials.cloth : materials.mattress,
        );
    }
    residents(parent, 10);
    for (const x of [-10.5, -7.5, -4.5]) {
      box(parent, x, 0.22, 8.85, 0.7, 0.43, 0.42, materials.bag);
      box(parent, x + 0.42, 0.15, 8.85, 0.28, 0.3, 0.35, materials.cloth);
    }
  }

  const common = levels.get(1)!;
  solid(1, 4, 4.8, 0.18, 4.7, 0.6);
  solid(1, 7.9, 4.8, 0.18, 4.7, 0.4);
  solid(1, 5.95, 7.05, 4.1, 0.18, 0.6);
  for (const x of [4.65, 5.95, 7.25]) {
    solid(1, x, 6.55, 0.9, 0.7, 0.75, materials.metal);
    box(common, x, 0.79, 6.55, 0.62, 0.08, 0.5, materials.dark);
    post(common, x, 0.95, 6.8, 0.035, 0.35);
    box(common, x, 1.38, 6.88, 0.75, 0.7, 0.04, materials.teal);
  }
  sign(common, "SHARED WATER / 06:00-22:00", 5.95, 1.93, 6.98, 3.5, 0.46);
  sign(common, "WASH / WAIT", 4.13, 0.9, 2.65, 1.45, 0.36);
  residents(common, 4, true);

  // The east sanitation annex keeps the original washbasins and every sleeping bank.
  box(common, 21, 0.025, 0, 20, 0.035, 2.5, materials.dark);
  for (const z of [-1.1, 1.1])
    box(common, 21, 0.052, z, 20, 0.018, 0.045, materials.teal);
  box(common, 21, 0.025, -4.05, 18, 0.035, 1.75, materials.dark);
  sign(common, "TOILETS / 16 STALLS", 21, 2.2, -8.3, 5.3, 0.65);
  for (let row = 0; row < 2; row++) {
    const z = row === 0 ? -6.1 : -2;
    const direction = row === 0 ? 1 : -1;
    for (let index = 0; index < 8; index++) {
      const x = 14 + index * 2;
      const toilet = new THREE.Group();
      toilet.name = `Toilet row ${row + 1} stall ${index + 1}`;
      toilet.position.set(x, 0, z);
      toilet.rotation.y = row === 0 ? 0 : Math.PI;
      common.add(toilet);
      obstacles.get(1)!.push({ x, z: z - direction * 0.1, w: 0.76, d: 1.06 });
      post(toilet, 0, 0.15, 0.1, 0.18, 0.3, porcelain);
      const shell = new THREE.Mesh(bowlShellGeometry, porcelain);
      shell.position.set(0, 0.36, 0.16);
      shell.scale.z = 1.32;
      toilet.add(shell);
      const bowl = new THREE.Mesh(bowlGeometry, porcelain);
      bowl.rotation.x = -Math.PI / 2;
      bowl.scale.set(1, 1.32, 1);
      bowl.position.set(0, 0.52, 0.16);
      toilet.add(bowl);
      const water = post(toilet, 0, 0.41, 0.16, 0.21, 0.025, materials.dark);
      water.scale.z *= 1.3;
      box(toilet, 0, 0.7, -0.41, 0.62, 0.65, 0.23, porcelain);
      box(toilet, 0, 1.04, -0.41, 0.67, 0.055, 0.27, porcelain);
      box(toilet, 0.23, 0.91, -0.278, 0.11, 0.04, 0.03, materials.metal);
      solid(1, x, z - direction * 1.12, 2, 0.12, 1.35, materials.teal);
      solid(1, x - 0.96, z, 0.09, 2.3, 1.3, materials.concrete);
      if (index === 7)
        solid(1, x + 0.96, z, 0.09, 2.3, 1.3, materials.concrete);
      const isOccupied =
        (row === 0 && (index === 1 || index === 5)) ||
        (row === 1 && index === 3);
      if (isOccupied) {
        const figure = adult(toilet, false, true);
        figure.body.position.z = 0.1;
        figure.body.name = "Seated adult behind privacy screen";
        figure.limbs[1]!.rotation.x = -0.65;
        figure.limbs[3]!.rotation.x = -0.65;
        occupied.push({
          body: figure.body,
          arm: figure.limbs[1]!,
          seated: true,
          phase: index,
        });
        solid(
          1,
          x + 0.27,
          z + direction * 0.98,
          1.3,
          0.08,
          1.1,
          materials.teal,
        );
        box(toilet, 0.67, 1.16, 1.04, 0.14, 0.08, 0.04, materials.red);
      }
    }
  }

  sign(common, "SHOWERS / 2 AC", 16.8, 2.1, 4.3, 4.5, 0.65);
  sign(common, "PRIVACY IS NOT EXEMPTION", 25.5, 2.2, 8.65, 5, 0.5);
  // Payment console sits beside, not across, the broad south approach.
  solid(1, 12.9, 4.05, 0.5, 0.45, 1.04, materials.dark);
  box(common, 12.9, 1.14, 4.05, 0.43, 0.22, 0.1, light);
  box(common, 21.5, 0.025, 6.45, 18.4, 0.035, 4.4, materials.teal);
  const guestWater = new THREE.Group();
  guestWater.name = "Metered guest shower water";
  guestWater.visible = false;
  common.add(guestWater);
  let guestCycleStarted = false,
    guestCycleRemaining = 0;
  for (let index = 0; index < 6; index++) {
    const x = 14.5 + index * 2.8;
    solid(1, x, 8.6, 2.8, 0.15, 1.55, materials.concrete);
    solid(1, x - 1.35, 6.5, 0.1, 4.2, 1.45, materials.concrete);
    if (index === 5)
      solid(1, x + 1.35, 6.5, 0.1, 4.2, 1.45, materials.concrete);
    post(common, x, 1.35, 8.45, 0.045, 2.7);
    box(common, x, 2.68, 7.97, 0.09, 0.09, 1, materials.metal);
    post(common, x, 2.63, 7.48, 0.29, 0.09, materials.metal);
    post(common, x, 2.57, 7.48, 0.24, 0.035, materials.dark);
    box(common, x, 1.02, 8.35, 0.25, 0.14, 0.08, materials.metal);
    box(common, x, 0.06, 7.45, 0.65, 0.035, 0.65, materials.dark);
    for (let grate = 0; grate < 5; grate++)
      box(
        common,
        x - 0.24 + grate * 0.12,
        0.082,
        7.45,
        0.035,
        0.025,
        0.59,
        materials.metal,
      );
    const waterParent = index === 5 ? guestWater : common;
    for (let stream = 0; stream < 7; stream++) {
      const angle = (stream / 7) * Math.PI * 2;
      const sx = x + Math.cos(angle) * 0.2;
      const sz = 7.48 + Math.sin(angle) * 0.2;
      const thread = box(
        waterParent,
        sx,
        1.34,
        sz,
        0.018,
        2.4,
        0.018,
        waterMaterial,
      );
      thread.castShadow = false;
      thread.receiveShadow = false;
      const drop = box(waterParent, sx, 1, sz, 0.04, 0.16, 0.04, waterMaterial);
      drop.castShadow = false;
      drop.receiveShadow = false;
      fallingWater.push({
        mesh: drop,
        top: 2.48,
        phase: stream / 7 + index / 6,
      });
    }
    if (index < 5) {
      const figure = adult(common, false, false, true);
      figure.body.name = "Adult shower silhouette in modest wrap";
      figure.body.position.set(x, 0, 7.45);
      figure.body.rotation.y = Math.PI;
      figure.limbs[1]!.rotation.x = -1.9;
      occupied.push({
        body: figure.body,
        arm: figure.limbs[1]!,
        seated: false,
        phase: index + 0.7,
      });
      // A staggered screen shields the body while leaving the overhead water visible.
      solid(1, x + 0.4, 5.65, 1.7, 0.1, 1.2, materials.teal);
      obstacles.get(1)!.push({ x, z: 7.45, w: 0.7, d: 0.65 });
    }
  }
  securityCamera(1, 20, 8.45, 3.8);
  securityCamera(1, 29.8, -8.2, 1.4);
  const officer = adult(common, true);
  officer.body.name = "Uniformed habitat security patrol";
  walkers.push({
    level: 1,
    ...officer,
    route: [
      [12.3, 0],
      [30.4, 0],
      [30.4, 2.8],
      [12.3, 2.8],
    ],
    target: 1,
    speed: 0.92,
    phase: 0,
    officer: true,
  });

  const room = levels.get(3)!;
  // Low perimeter panels and an amber door frame identify the player's tiny cutaway capsule.
  solid(3, 4, 4.5, 0.18, 4.2, 0.6);
  solid(3, 8, 4.5, 0.18, 4.2, 0.35);
  solid(3, 6, 6.5, 4.15, 0.18, 0.35);
  solid(3, 4.55, 2.5, 1.1, 0.18, 0.65);
  solid(3, 7.45, 2.5, 1.1, 0.18, 0.45);
  box(room, 6, 0.045, 4.5, 3.7, 0.05, 3.65, materials.concrete);
  for (const x of [5.08, 6.92])
    box(room, x, 1, 2.5, 0.09, 2, 0.12, materials.amber);
  box(room, 6, 2.02, 2.5, 1.93, 0.09, 0.13, warm);
  sign(room, "0806 / YOUR CAPSULE", 6, 2.28, 2.5, 2.5, 0.4);
  sign(room, "PERSONAL ARRANGEMENT", 7.4, 0.93, 2.49, 1.5, 0.28);
  box(room, 7.4, 0.68, 2.39, 0.36, 0.19, 0.07, light);
  for (const x of [4.17, 7.83])
    box(room, x, 0.085, 4.5, 0.045, 0.04, 3.7, materials.amber);
  // Adjacent residents' possessions press right up against the licensed room.
  box(room, 5.9, 0.21, 7.35, 1.25, 0.42, 0.65, materials.bag);
  box(room, 6.4, 0.6, 7.35, 0.45, 0.4, 0.42, materials.cloth);
  sign(room, "0708", 4.4, 0.58, 7.3, 0.7, 0.24);
  residents(room, 2);

  for (const piece of furniture) {
    const mesh = new THREE.Group();
    mesh.name = piece.name;
    room.add(mesh);
    furnitureMeshes.set(piece.id, mesh);
    if (piece.id === "bed") {
      box(mesh, 0, 0.23, 0, 1, 0.35, 2, materials.dark);
      box(mesh, 0, 0.47, 0, 0.95, 0.22, 1.94, materials.mattress);
      box(mesh, 0, 0.61, -0.66, 0.71, 0.1, 0.46, materials.cloth);
      box(mesh, 0, 0.59, 0.36, 0.96, 0.04, 1.1, materials.teal);
      for (const z of [-0.96, 0.96])
        box(mesh, 0, 0.69, z, 1, 0.85, 0.07, materials.dark);
      box(mesh, -0.47, 0.83, 0, 0.055, 1.25, 1.98, materials.concrete);
      box(mesh, -0.43, 1.08, -0.7, 0.06, 0.1, 0.2, warm);
      box(mesh, 0.18, 0.12, 0.77, 0.44, 0.18, 0.32, materials.bag);
    } else if (piece.id === "table") {
      box(mesh, 0, 0.36, 0, 0.8, 0.65, 0.7, materials.bag);
      for (const y of [0.15, 0.43])
        box(mesh, 0, y, 0.354, 0.74, 0.025, 0.02, materials.dark);
      box(mesh, 0, 0.72, 0, 0.8, 0.07, 0.7, materials.metal);
      post(mesh, -0.19, 0.84, 0.12, 0.075, 0.17, materials.teal);
      box(mesh, 0.16, 0.79, -0.08, 0.25, 0.045, 0.3, materials.mattress);
    } else if (piece.id === "stool") {
      box(mesh, 0, 0.48, 0, 0.5, 0.11, 0.5, materials.bag);
      for (const x of [-0.17, 0.17])
        for (const z of [-0.17, 0.17])
          box(mesh, x, 0.23, z, 0.07, 0.46, 0.07, materials.metal);
      box(mesh, 0, 0.24, 0.18, 0.4, 0.07, 0.05, materials.teal);
    } else {
      box(mesh, 0, 0.66, 0, 0.65, 1.3, 0.8, materials.dark);
      box(mesh, 0, 0.68, 0.406, 0.57, 1.17, 0.025, materials.teal);
      box(mesh, 0.19, 0.69, 0.43, 0.045, 0.17, 0.035, materials.amber);
      for (let i = 0; i < 3; i++)
        box(
          mesh,
          0,
          1.04 + i * 0.055,
          0.425,
          0.33,
          0.02,
          0.015,
          materials.dark,
        );
      box(mesh, 0, 1.4, 0, 0.45, 0.18, 0.49, materials.bag);
    }
    const highlight = box(
      mesh,
      0,
      0.075,
      0,
      piece.w + 0.1,
      0.03,
      piece.d + 0.1,
      selectionMaterial,
    );
    highlight.visible = false;
    highlight.castShadow = false;
    highlights.set(piece.id, highlight);
  }
  const gridPoints: number[] = [];
  for (let x = 4.25; x < 7.9; x += 0.25)
    gridPoints.push(x, 12.08, 2.7, x, 12.08, 6.3);
  for (let z = 2.75; z < 6.4; z += 0.25)
    gridPoints.push(4.15, 12.08, z, 7.85, 12.08, z);
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(gridPoints, 3),
    ),
    new THREE.LineBasicMaterial({
      color: 0xd0a465,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  grid.visible = false;
  group.add(grid);

  // The lift is independent of the occupied-floor groups: a genuine moving open cabin.
  const shaft = new THREE.Group();
  shaft.name = "Cutaway lift shaft";
  group.add(shaft);
  for (const x of [-1.65, 1.65]) {
    box(shaft, x, 7, -8.95, 0.15, 14.5, 0.15, materials.metal);
    box(shaft, x, 7, -5.35, 0.09, 14.5, 0.09, materials.dark);
  }
  for (const level of [0, 1, 2, 3]) {
    const y = level * 4;
    box(shaft, 0, y - 0.17, -8.98, 3.6, 0.18, 0.18, materials.dark);
    for (const x of [-1.73, 1.73])
      box(shaft, x, y - 0.17, -7.15, 0.14, 0.18, 3.9, materials.dark);
    box(shaft, 0, y - 0.12, -4.6, 4.8, 0.24, 1.2, materials.concrete);
    box(shaft, 0, y + 0.11, -4.07, 4.8, 0.08, 0.06, materials.amber);
    sign(
      shaft,
      level === 2
        ? "02 / SERVICE ONLY"
        : level === 0
          ? "LIFT / 00 01 03"
          : level === 1
            ? "01 / COMMON LEVEL"
            : "03 / RESIDENT LEVEL",
      0,
      y + 1.9,
      -9,
      3.1,
      0.45,
    );
    if (level === 2)
      for (const x of [-1, -0.5, 0, 0.5, 1])
        box(shaft, x, y + 0.8, -5.3, 0.05, 1.6, 0.05, materials.dark);
  }
  const cabin = new THREE.Group();
  cabin.name = "Passenger lift cabin";
  group.add(cabin);
  box(cabin, 0, -0.035, -7.1, 2.85, 0.07, 3.2, materials.metal);
  box(cabin, 0, 1.05, -8.64, 2.85, 2.1, 0.1, materials.dark);
  box(cabin, -1.4, 0.7, -7.1, 0.09, 1.4, 3.1, materials.dark);
  box(cabin, 1.4, 0.35, -7.1, 0.09, 0.7, 3.1, materials.dark);
  box(cabin, 0, 1.96, -8.56, 2.3, 0.07, 0.05, light);
  box(cabin, 0, 0.91, -8.51, 2.3, 0.05, 0.06, materials.metal);
  const leftDoor = box(
    cabin,
    -1.25,
    0.9,
    -5.53,
    1.27,
    1.8,
    0.1,
    materials.teal,
  );
  const rightDoor = box(
    cabin,
    1.25,
    0.9,
    -5.53,
    1.27,
    1.8,
    0.1,
    materials.teal,
  );
  box(leftDoor, 0.35, 0, 0.6, 0.055, 0.88, 0.025, materials.amber);
  box(rightDoor, -0.35, 0, 0.6, 0.055, 0.88, 0.025, materials.amber);
  function doorOpening(open: number) {
    leftDoor.position.x = -0.64 - open * 1.26;
    rightDoor.position.x = 0.64 + open * 1.26;
  }

  const placesByFloor = new Map<HabitatFloor, readonly Landmark[]>();
  for (const level of FLOORS) {
    const sector =
      level === 0
        ? "H-09 / PUBLIC LOBBY"
        : `H-09 / RESIDENT LEVEL ${String(level).padStart(2, "0")}`;
    const places: Landmark[] = [
      {
        id: "elevator",
        name: "Resident elevator",
        sector,
        position: [0, level * 4, -7],
        text: "A tired cable lift serves the lobby, the common level, and resident level 03. Step into the cabin to choose a floor. Level 02 is locked to maintenance.",
      },
      {
        id: "housing-notice",
        name: "Housing license notice",
        sector,
        position: [level === 0 ? 5.2 : -2.2, level * 4, level === 0 ? -6.2 : 0],
        text: "H-09 is a licensed sleeping facility. Forty credits renew one shift of access. Shared water, shared walls, no claim to the building. Keep everything you own ready to carry.",
        details:
          "In the fictional Meridian Compact, occupancy is revocable. Furnishing your capsule changes no fee, debt, work hours, or citizenship status. The notice calls this flexibility.",
      },
    ];
    if (level === 0)
      places.push({
        id: "habitat-exit",
        name: "Return to the street",
        sector,
        position: [0, 0, 8],
        text: "The intake queue has not moved. Beyond the threshold, the workday continues. Your licensed capsule is on level 03.",
      });
    else {
      places.push({
        id: "housing-neighbor",
        name:
          level === 1
            ? "Ilan, waiting for water"
            : "Sera, your next-door neighbor",
        sector,
        position: [3, level * 4, 2],
        text:
          level === 1
            ? "“Third in line when I got here. Third in line now. I keep my towel in the bag with everything else. If the license goes, at least I won't leave anything behind.”"
            : "“I heard you turn over last night. Not complaining. These walls are barely curtains. Move your things how you like; it helps to have one thing the building didn't choose.”",
        details:
          level === 1
            ? "Ilan is an adult night cleaner. The old common taps remain free. The eastern annex has sixteen toilets and separate screened showers; one optional shower costs 2 AC."
            : "Sera, an adult packing worker, has tied her belongings into two bags. The amber-framed capsule marked 0806 is yours for as long as the issuer honors its license.",
      });
      places.push({
        id: "washroom",
        name: level === 1 ? "Common washroom" : "Shared sanitation notice",
        sector,
        position: [level === 1 ? 6 : -2.2, level * 4, level === 1 ? 3.7 : 6.5],
        text:
          level === 1
            ? "The original three basins still serve the sleeping hall. Follow the clear east aisle to two facing rows of eight toilets and a separate shower hall. A shower costs 2 AC; the taps and toilets have no charge."
            : "The washroom is on level 01. There is no private plumbing in these capsules. A handwritten note asks the late shift to leave the basins clean for the next queue.",
      });
    }
    if (level === 1)
      places.push(
        {
          id: "shower",
          name: "Shared shower · 2 AC",
          sector,
          position: [13, 4, 3],
          text: "Five residents occupy the screened showers. Bay 06, the last bay on the right, is dry until you pay 2 AC here. After payment, step under its showerhead to start one metered water cycle. No work hours are consumed.",
          details:
            "The shower ceiling carries the same scanning cameras as the sleeping hall. Privacy partitions conceal bodies, not recognition status. Payment requires an unfrozen key and at least 2 AC.",
        },
        {
          id: "indoor-officer",
          name: "Habitat security patrol",
          sector,
          position: officerPosition,
          text: "A uniformed Compact officer walks between the wash hall and the toilets, checking resident recognition. You can request an inspection. Carrying prohibited equipment makes that a serious risk.",
        },
      );
    if (level === 3)
      places.push(
        {
          id: "home",
          name: "Your capsule · 0806",
          sector,
          position: [6, 12, 4],
          text: "A narrow bed, a crate-table, a repaired stool, a locker. These possessions are all you have. The capsule itself is a revocable license. Settle 40 credits to retain access until tomorrow.",
          details:
            "Rearrange your own furniture for free at the amber door console. It stays where you leave it when you visit the street. Housing settlement still ends this six-hour workday; the room, food, debt, and citizenship rules have not changed.",
        },
        {
          id: "furniture",
          name: "Arrange your belongings",
          sector,
          position: [6, 12, 2],
          text: "Slide a piece a quarter unit at a time, or turn it a quarter-turn. Keep the doorway and the space beside your bed clear. Nothing here costs credits: these four things already belong to you.",
        },
      );
    placesByFloor.set(level, places);
  }
  const noPlaces: readonly Landmark[] = [];

  function synchronizeFurniture() {
    for (const piece of furniture) {
      const mesh = furnitureMeshes.get(piece.id)!;
      mesh.position.set(piece.x, 0, piece.z);
      mesh.rotation.y = piece.rotated ? Math.PI / 2 : 0;
    }
  }
  function setEditing(id: FurnitureId | undefined): void {
    grid.visible = id !== undefined && floor === 3 && !riding;
    for (const [key, highlight] of highlights)
      highlight.visible = grid.visible && key === id;
  }
  function showFloor() {
    for (const [level, parent] of levels)
      parent.visible = !riding && level === floor;
    shaft.visible = riding;
  }
  function blockedAt(
    x: number,
    z: number,
    arranged: readonly Furniture[],
  ): boolean {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      x < -11.7 + RADIUS ||
      x > (floor === 1 ? 31.7 : 11.7) - RADIUS ||
      z < -9.7 + RADIUS ||
      z > 9.7 - RADIUS
    )
      return true;
    for (const obstacle of obstacles.get(floor)!)
      if (touchesPlayer(obstacle, x, z)) return true;
    if (floor === 3)
      for (const piece of arranged) if (touchesPlayer(piece, x, z)) return true;
    // Open panels slide into pockets beside the cabin rather than obstructing its entrance.
    return false;
  }
  function blocked(x: number, z: number): boolean {
    return riding || blockedAt(x, z, furniture);
  }

  // Edits are infrequent. A small room-local flood fill prevents sealing the player behind a piece.
  function canLeaveRoom(
    player: THREE.Vector3,
    arranged: readonly Furniture[],
  ): boolean {
    if (player.x < 4 || player.x > 8 || player.z < 2.5 || player.z > 6.5)
      return true;
    const width = 17;
    const height = 19;
    const seen = new Uint8Array(width * height);
    const queue: number[] = [];
    function clearSegment(ax: number, az: number, bx: number, bz: number) {
      for (let step = 0; step <= 4; step++)
        if (
          blockedAt(
            ax + ((bx - ax) * step) / 4,
            az + ((bz - az) * step) / 4,
            arranged,
          )
        )
          return false;
      return true;
    }
    for (let row = 0; row < height; row++)
      for (let col = 0; col < width; col++) {
        const x = 4 + col * 0.25;
        const z = 2 + row * 0.25;
        if (
          Math.hypot(player.x - x, player.z - z) <= 0.36 &&
          clearSegment(player.x, player.z, x, z)
        ) {
          const index = row * width + col;
          seen[index] = 1;
          queue.push(index);
        }
      }
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      const col = index % width;
      const row = Math.floor(index / width);
      const x = 4 + col * 0.25;
      const z = 2 + row * 0.25;
      if (z <= 2.25 && x >= 5.5 && x <= 6.5) return true;
      for (const [dc, dr] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nextCol = col + dc;
        const nextRow = row + dr;
        if (nextCol < 0 || nextCol >= width || nextRow < 0 || nextRow >= height)
          continue;
        const next = nextRow * width + nextCol;
        if (!seen[next] && clearSegment(x, z, x + dc * 0.25, z + dr * 0.25)) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    return false;
  }

  function editFurniture(
    id: FurnitureId,
    dx: number,
    dz: number,
    rotate: boolean,
    player: THREE.Vector3,
  ): ActionResult {
    if (
      floor !== 3 ||
      riding ||
      Math.abs(player.y - 12) > 0.75 ||
      player.x < 3.5 ||
      player.x > 8.5 ||
      player.z < 0.5 ||
      player.z > 7
    )
      return {
        ok: false,
        message: "Use the arrangement console at your level 03 capsule.",
      };
    const piece = furniture.find((item) => item.id === id);
    if (!piece)
      return { ok: false, message: "Choose one of your four belongings." };
    if (
      !Number.isFinite(dx) ||
      !Number.isFinite(dz) ||
      Math.abs(dx * 4 - Math.round(dx * 4)) > 0.00001 ||
      Math.abs(dz * 4 - Math.round(dz * 4)) > 0.00001
    )
      return { ok: false, message: "Move furnishings in quarter-unit steps." };
    const candidate: Furniture = {
      ...piece,
      x: piece.x + dx,
      z: piece.z + dz,
      rotated: rotate ? !piece.rotated : piece.rotated,
      w: rotate ? piece.d : piece.w,
      d: rotate ? piece.w : piece.d,
    };
    if (
      candidate.x - candidate.w / 2 < ROOM_BOUNDS.minX ||
      candidate.x + candidate.w / 2 > ROOM_BOUNDS.maxX ||
      candidate.z - candidate.d / 2 < ROOM_BOUNDS.minZ ||
      candidate.z + candidate.d / 2 > ROOM_BOUNDS.maxZ
    )
      return {
        ok: false,
        message: "That would extend outside your licensed capsule.",
      };
    if (intersects(candidate, ENTRY_STRIP, 0.08))
      return {
        ok: false,
        message: "Keep the doorway and the path to your bed clear.",
      };
    if (
      furniture.some(
        (other) => other.id !== id && intersects(candidate, other, 0.08),
      )
    )
      return { ok: false, message: "Another belonging occupies that space." };
    if (touchesPlayer(candidate, player.x, player.z))
      return {
        ok: false,
        message: "Step aside before moving that piece into your space.",
      };
    const arranged = furniture.map((item) =>
      item.id === id ? candidate : item,
    );
    if (!canLeaveRoom(player, arranged))
      return {
        ok: false,
        message:
          "That arrangement would leave you without a clear route to the door.",
      };
    Object.assign(piece, candidate);
    synchronizeFurniture();
    setEditing(id);
    return {
      ok: true,
      message: `${piece.name} ${rotate ? "turned" : "moved"}. Your belongings stay here when you leave; no credits spent.`,
    };
  }

  function ride(target: HabitatFloor, player: THREE.Vector3): ActionResult {
    if (riding)
      return {
        ok: false,
        message: "The lift is already moving. Wait for the doors.",
      };
    if (!FLOORS.includes(target))
      return {
        ok: false,
        message: "That floor is not served by the resident lift.",
      };
    if (
      !Number.isFinite(player.x) ||
      !Number.isFinite(player.y) ||
      !Number.isFinite(player.z) ||
      Math.abs(player.x) > 1.03 ||
      player.z < -8.25 ||
      player.z > -6.05 ||
      Math.abs(player.y - floor * 4) > 0.3
    )
      return {
        ok: false,
        message:
          "Step fully inside the elevator cabin before selecting a floor.",
      };
    if (target === floor)
      return { ok: false, message: "You are already on that floor." };
    destination = target;
    startHeight = floor * 4;
    travelDuration = 1.4 + Math.abs(target * 4 - startHeight) * 0.19;
    rideElapsed = 0;
    riderX = player.x;
    riderZ = player.z;
    riding = true;
    setEditing(undefined);
    showFloor();
    return {
      ok: true,
      message: `Doors closing. Riding to ${target === 0 ? "the public lobby" : `level ${String(target).padStart(2, "0")}`}.`,
    };
  }
  function animateLife(seconds: number) {
    lifeElapsed[floor]! += seconds;
    const time = lifeElapsed[floor]!;
    for (const walker of walkers) {
      if (walker.level !== floor) continue;
      const [tx, tz] = walker.route[walker.target]!;
      const dx = tx - walker.body.position.x;
      const dz = tz - walker.body.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.025) {
        walker.target = (walker.target + 1) % walker.route.length;
        continue;
      }
      const step = Math.min(distance, seconds * walker.speed);
      const x = walker.body.position.x + (dx / distance) * step;
      const z = walker.body.position.z + (dz / distance) * step;
      if (blockedAt(x, z, furniture)) continue;
      walker.body.position.set(x, Math.sin(time * 5 + walker.phase) * 0.018, z);
      walker.body.rotation.y = Math.atan2(dx, dz);
      const swing = Math.sin(time * 5 + walker.phase) * 0.3;
      walker.limbs[0]!.rotation.x = swing;
      walker.limbs[2]!.rotation.x = -swing;
      walker.limbs[1]!.rotation.x = -swing * 0.75;
      walker.limbs[3]!.rotation.x = swing * 0.75;
      if (walker.officer) {
        officerPosition[0] = x;
        officerPosition[2] = z;
      }
    }
    for (const camera of cameras)
      if (camera.level === floor)
        camera.swivel.rotation.y =
          camera.phase + Math.sin(time * 0.55 + camera.phase) * 1.05;
    if (floor === 1) {
      for (const person of occupied) {
        person.body.position.y = Math.sin(time * 1.6 + person.phase) * 0.009;
        person.arm.rotation.x =
          (person.seated ? -0.65 : -1.9) +
          Math.sin(time * 1.1 + person.phase) * 0.12;
      }
      for (const drop of fallingWater)
        drop.mesh.position.y =
          drop.top - ((time * 1.7 + drop.phase * 2.25) % 2.25);
    }
  }

  function resetLife() {
    lifeElapsed.fill(0);
    guestCycleStarted = false;
    guestCycleRemaining = 0;
    guestWater.visible = false;
    walkers.forEach((walker, index) => {
      const segment = walker.officer ? 0 : index % walker.route.length;
      const start = walker.route[segment]!;
      const end = walker.route[(segment + 1) % walker.route.length]!;
      const fraction = walker.officer ? 0 : (index * 0.61803398875) % 1;
      walker.body.position.set(
        start[0] + (end[0] - start[0]) * fraction,
        0,
        start[1] + (end[1] - start[1]) * fraction,
      );
      walker.body.rotation.y = Math.atan2(end[0] - start[0], end[1] - start[1]);
      walker.target = (segment + 1) % walker.route.length;
      for (const limb of walker.limbs) limb.rotation.x = 0;
    });
    officerPosition[0] = 12.3;
    officerPosition[2] = 0;
    for (const camera of cameras)
      camera.swivel.rotation.y = camera.phase + Math.sin(camera.phase) * 1.05;
    for (const person of occupied) {
      person.body.position.y = 0;
      person.arm.rotation.x = person.seated ? -0.65 : -1.9;
    }
    for (const drop of fallingWater)
      drop.mesh.position.y = drop.top - ((drop.phase * 2.25) % 2.25);
  }

  function update(
    seconds: number,
    paused: boolean,
    player: THREE.Vector3,
    showerPaid = false,
  ): void {
    if (paused || !group.visible || !Number.isFinite(seconds) || seconds <= 0)
      return;
    if (!riding) {
      if (floor === 1) {
        if (
          showerPaid &&
          !guestCycleStarted &&
          Math.hypot(player.x - 28.5, player.z - 7.45) < 0.7
        ) {
          guestCycleStarted = true;
          guestCycleRemaining = 8;
        }
        guestCycleRemaining = Math.max(0, guestCycleRemaining - seconds);
        guestWater.visible = guestCycleRemaining > 0;
      }
      animateLife(Math.min(seconds, 0.05));
      return;
    }
    rideElapsed += seconds;
    const doorDuration = 0.65;
    const travel = Math.min(
      1,
      Math.max(0, (rideElapsed - doorDuration) / travelDuration),
    );
    const eased = travel * travel * (3 - 2 * travel);
    cabin.position.y = startHeight + (destination * 4 - startHeight) * eased;
    player.set(riderX, cabin.position.y, riderZ);
    if (rideElapsed < doorDuration) doorOpening(1 - rideElapsed / doorDuration);
    else if (rideElapsed < doorDuration + travelDuration) doorOpening(0);
    else
      doorOpening(
        Math.min(
          1,
          (rideElapsed - doorDuration - travelDuration) / doorDuration,
        ),
      );
    if (rideElapsed >= travelDuration + doorDuration * 2) {
      floor = destination;
      riding = false;
      cabin.position.y = floor * 4;
      player.y = floor * 4;
      doorOpening(1);
      showFloor();
    }
  }
  function resetLift() {
    floor = 0;
    destination = 0;
    riding = false;
    rideElapsed = 0;
    cabin.position.y = 0;
    doorOpening(1);
    setEditing(undefined);
    showFloor();
  }
  function enter(player: THREE.Vector3): void {
    resetLift();
    player.set(0, 0, 8);
  }
  function reset(): void {
    furniture.forEach((piece, index) =>
      Object.assign(piece, ORIGINAL_FURNITURE[index]),
    );
    synchronizeFurniture();
    resetLife();
    resetLift();
  }
  reset();
  return {
    group,
    get floor(): HabitatFloor {
      return floor;
    },
    get riding(): boolean {
      return riding;
    },
    get places(): readonly Landmark[] {
      return riding ? noPlaces : placesByFloor.get(floor)!;
    },
    get furniture(): readonly Furniture[] {
      return furniture;
    },
    enter,
    reset,
    blocked,
    ride,
    update,
    editFurniture,
    setEditing,
  };
}
