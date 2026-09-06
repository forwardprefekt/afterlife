import * as THREE from "three";
import {
  DISTRICT_BOUNDS,
  DISTRICT_OUTLINE,
  DISTRICT_ROADS,
  LANDMARKS,
  SCANNER_TRIANGLE,
  STREET_POCKETS,
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
import { createInvestigationWorld } from "./investigation-world";
import {
  INVESTIGATION_SITES,
  INVESTIGATION_PLACES,
  siteAccessReason,
} from "./investigation";
import type { InvestigationSite, InvestigationState } from "./investigation";

export type WorldAction =
  | { type: "enter-habitat" }
  | { type: "exit-habitat" }
  | { type: "ride-elevator"; floor: HabitatFloor }
  | { type: "enter-investigation"; site: InvestigationSite }
  | { type: "exit-investigation" }
  | { type: "ride-depths"; site: "bunker" | "detention" | "routing" }
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
  investigation?: InvestigationState;
}
export interface WorldSnapshot {
  x: number;
  y: number;
  z: number;
  nearest?: Landmark;
  exposed: boolean;
  zoom: number;
  area: "street" | "habitat" | "jail" | "investigation";
  floor: HabitatFloor;
  riding: boolean;
  furniture: readonly Furniture[];
  roomBounds: typeof ROOM_BOUNDS;
  places: readonly Landmark[];
  security: StreetLifeStatus;
  jailExitReachable: boolean;
  investigationSite?: InvestigationSite;
  depth: number;
  destination?: Landmark;
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
  let area: WorldSnapshot["area"] = "street";
  let investigationState: InvestigationState | undefined;
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
    limestone: 0x999184,
    clay: 0x887468,
    oxidized: 0x557d74,
    plaster: 0xa5a396,
    leaf: 0x687e58,
    soil: 0x4a4c3e,
    fabric: 0xb59d76,
    patch: 0x4b5b5c,
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
    owner?: { group: THREE.Group; materials: THREE.MeshStandardMaterial[] },
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
    const material = owner
      ? new THREE.MeshStandardMaterial({
          map: texture,
          side: THREE.DoubleSide,
          roughness: 0.86,
        })
      : new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    if (material instanceof THREE.MeshStandardMaterial)
      owner?.materials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    if (side) mesh.rotation.y = Math.PI / 2;
    (owner?.group ?? exterior).add(mesh);
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
      for (const side of [-1, 1]) {
        const dashX = x + (vertical ? side * 1.35 : 0),
          dashZ = z + (vertical ? 0 : side * 1.35);
        if (
          STREET_POCKETS.some((pocket) =>
            pocket.positions.some(
              ([px, pz]) =>
                Math.abs(dashX - px) < 1.2 && Math.abs(dashZ - pz) < 1.1,
            ),
          )
        )
          continue;
        box(
          dashX,
          0.045,
          dashZ,
          vertical ? 0.05 : 0.8,
          0.025,
          vertical ? 0.8 : 0.05,
          mats.paint,
        );
      }
    }
  });
  for (const z of [-8, 0, 8])
    for (const x of [-1, 1])
      for (let i = -2; i <= 2; i++)
        box(x * 2, 0.045, z + i * 0.38, 0.6, 0.03, 0.18, mats.paint);
  // Authored massing stays inside the original ground footprints. Each block
  // owns its finish materials, including attached repairs, planting and signs.
  function building(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    name: string,
    profile: "setback" | "split" | "steps" | "slab",
    finish: "concrete" | "limestone" | "clay" | "oxidized",
    use: "homes" | "shop" | "service",
  ) {
    const group = new THREE.Group();
    group.name = name;
    exterior.add(group);
    const wall = mats[finish].clone(),
      roof = mats.roof.clone(),
      trim = mats.edge.clone(),
      window = lit.clone(),
      dark = mats.dark.clone(),
      repair = mats.plaster.clone(),
      metal = mats.oxidized.clone(),
      cloth = mats.fabric.clone(),
      leaves = mats.leaf.clone(),
      soil = mats.soil.clone();
    const materials = [
      wall,
      roof,
      trim,
      window,
      dark,
      repair,
      metal,
      cloth,
      leaves,
      soil,
    ];
    const podium = 2.15;
    // A recessed frontage behind two deep masonry piers, not a second shop box.
    box(x, podium / 2, z - 0.2, w, podium, d - 0.4, wall, group);
    for (const side of [-1, 1])
      box(
        x + side * (w / 2 - 0.24),
        podium / 2,
        z + d / 2 - 0.2,
        0.48,
        podium,
        0.4,
        wall,
        group,
      );
    box(x, 0.12, z, w + 0.25, 0.24, d + 0.25, trim, group);
    box(x, podium + 0.08, z, w + 0.12, 0.16, d + 0.12, roof, group);
    box(x, 1.08, z + d / 2 - 0.38, w - 0.96, 1.65, 0.06, dark, group);
    if (use === "shop") {
      const awning = box(
        x - 0.1,
        2.03,
        z + d / 2 + 0.18,
        w - 0.7,
        0.09,
        1.05,
        cloth,
        group,
      );
      awning.rotation.x = 0.12;
      box(x - 0.1, 1.93, z + d / 2 + 0.69, w - 0.7, 0.22, 0.055, metal, group);
      for (let slat = 0; slat < 6; slat++)
        box(
          x + w * 0.15,
          0.55 + slat * 0.18,
          z + d / 2 - 0.33,
          w * 0.35,
          0.08,
          0.04,
          metal,
          group,
        );
      box(
        x - w * 0.23,
        1.15,
        z + d / 2 - 0.33,
        w * 0.24,
        0.65,
        0.045,
        window,
        group,
      );
    } else {
      box(x + 0.22, 0.92, z + d / 2 - 0.33, 0.58, 1.45, 0.05, metal, group);
      box(
        x - w * 0.25,
        1.22,
        z + d / 2 - 0.33,
        0.46,
        0.62,
        0.05,
        window,
        group,
      );
    }
    const masses =
      profile === "split"
        ? [
            { x: x - w * 0.25, z: z - 0.12, w: w * 0.45, d: d - 0.4, top: h },
            {
              x: x + w * 0.26,
              z: z + 0.08,
              w: w * 0.42,
              d: d - 0.65,
              top: h - 0.7,
            },
          ]
        : profile === "steps"
          ? [
              { x: x - w * 0.22, z: z - 0.2, w: w * 0.5, d: d - 0.45, top: h },
              {
                x: x + w * 0.26,
                z: z + 0.16,
                w: w * 0.45,
                d: d - 0.8,
                top: h - 1,
              },
            ]
          : [
              {
                x: x + (profile === "setback" ? 0.22 : 0),
                z: z - (profile === "setback" ? 0.35 : 0),
                w: w - (profile === "setback" ? 0.85 : 0.2),
                d: d - (profile === "setback" ? 1.05 : 0.2),
                top: h,
              },
            ];
    for (const mass of masses) {
      box(
        mass.x,
        (mass.top + podium) / 2,
        mass.z,
        mass.w,
        mass.top - podium,
        mass.d,
        wall,
        group,
      );
      box(
        mass.x,
        mass.top + 0.08,
        mass.z,
        mass.w + 0.1,
        0.16,
        mass.d + 0.1,
        trim,
        group,
      );
      box(
        mass.x,
        mass.top + 0.19,
        mass.z,
        mass.w - 0.2,
        0.06,
        mass.d - 0.2,
        roof,
        group,
      );
      for (let floor = podium + 0.7; floor < mass.top - 0.3; floor += 1.25) {
        for (
          let col = -mass.w / 2 + 0.48;
          col < mass.w / 2 - 0.25;
          col += 0.96
        ) {
          box(
            mass.x + col,
            floor,
            mass.z + mass.d / 2 + 0.025,
            0.46,
            0.58,
            0.045,
            Math.round(col * 10 + floor * 3) % 4 === 0 ? dark : window,
            group,
          );
          box(
            mass.x + col,
            floor - 0.34,
            mass.z + mass.d / 2 + 0.07,
            0.59,
            0.07,
            0.15,
            trim,
            group,
          );
        }
        for (let col = -mass.d / 2 + 0.5; col < mass.d / 2 - 0.25; col += 1.2)
          box(
            mass.x + mass.w / 2 + 0.025,
            floor,
            mass.z + col,
            0.045,
            0.53,
            0.55,
            dark,
            group,
          );
      }
      // Uneven roof membranes and a repaired corner break the repeated parapet.
      box(
        mass.x - mass.w * 0.18,
        mass.top + 0.235,
        mass.z + 0.12,
        mass.w * 0.45,
        0.025,
        mass.d * 0.38,
        metal,
        group,
      );
      box(
        mass.x + mass.w * 0.26,
        mass.top - 0.38,
        mass.z + mass.d / 2 + 0.03,
        mass.w * 0.22,
        0.48,
        0.04,
        repair,
        group,
      );
    }
    const high = masses[0];
    if (use === "homes") {
      tube(
        high.x - high.w * 0.19,
        h + 0.8,
        high.z - 0.45,
        0.48,
        1.1,
        metal,
        group,
      );
      tube(
        high.x - high.w * 0.19,
        h + 1.38,
        high.z - 0.45,
        0.52,
        0.08,
        trim,
        group,
      );
      box(
        high.x + high.w * 0.2,
        h + 0.4,
        high.z + 0.4,
        0.55,
        0.34,
        1.2,
        trim,
        group,
      );
      box(
        high.x + high.w * 0.2,
        h + 0.58,
        high.z + 0.4,
        0.45,
        0.03,
        1.05,
        soil,
        group,
      );
      for (let plant = 0; plant < 3; plant++)
        box(
          high.x + high.w * 0.2,
          h + 0.73 + (plant % 2) * 0.09,
          high.z + 0.04 + plant * 0.36,
          0.39,
          0.25 + (plant % 2) * 0.18,
          0.28,
          leaves,
          group,
        );
      const lineZ = z + d / 2 + 0.23;
      for (const side of [-1, 1])
        box(
          x + side * w * 0.34,
          podium + 0.65,
          lineZ,
          0.04,
          0.9,
          0.04,
          metal,
          group,
        );
      box(x, podium + 1.03, lineZ, w * 0.68, 0.025, 0.025, dark, group);
      for (let item = 0; item < 3; item++)
        box(
          x - w * 0.24 + item * w * 0.22,
          podium + 0.76 - (item % 2) * 0.1,
          lineZ,
          w * 0.14,
          0.44 + (item % 2) * 0.2,
          0.025,
          item === 1 ? metal : cloth,
          group,
        );
    } else {
      box(
        high.x,
        h + 0.52,
        high.z - 0.15,
        Math.min(1.15, high.w - 0.2),
        0.58,
        0.85,
        dark,
        group,
      );
      for (let vent = -2; vent <= 2; vent++)
        box(
          high.x + vent * 0.17,
          h + 0.83,
          high.z - 0.15,
          0.045,
          0.03,
          0.7,
          trim,
          group,
        );
      tube(
        high.x - high.w * 0.3,
        h + 0.57,
        high.z - high.d * 0.25,
        0.16,
        0.72,
        metal,
        group,
      );
    }
    box(
      x + w / 2 + 0.06,
      podium / 2,
      z - d * 0.3,
      0.12,
      podium,
      0.12,
      metal,
      group,
    );
    box(
      x + w / 2 + 0.028,
      1.25,
      z + d * 0.18,
      0.045,
      0.75,
      d * 0.3,
      repair,
      group,
    );
    sign(
      name,
      x,
      podium - 0.25,
      z + d / 2 + 0.09,
      Math.min(w - 0.3, 3),
      0.42,
      false,
      "#d9cba8",
      { group, materials },
    );
    collisions.push({ x, z, w: w + 0.25, d: d + 0.25 });
    fadeGroups.push({
      group,
      box: new THREE.Box3().setFromObject(group),
      materials,
    });
    return { group, materials };
  }
  const capsules = building(
    -5,
    12.4,
    5.3,
    4.8,
    8.7,
    "CAPSULES / H-09",
    "split",
    "concrete",
    "homes",
  );
  const entryDark = mats.dark.clone(),
    entryMetal = mats.oxidized.clone();
  capsules.materials.push(entryDark, entryMetal);
  box(-7.72, 1, 12, 0.08, 2, 1.4, entryDark, capsules.group);
  box(-8.6, 2.1, 12, 2, 0.12, 2, entryMetal, capsules.group);
  box(-8.6, 0.035, 12, 2.1, 0.02, 1.8, mats.patch);
  sign("0806 / LEVEL 03", -7.8, 2.7, 12, 2.6, 0.55, true, "#d9cba8", capsules);
  fadeGroups[fadeGroups.length - 1].box.setFromObject(capsules.group);
  building(5.1, 12.5, 5.5, 4.7, 3.8, "RATIONS", "setback", "limestone", "shop");
  building(-5.1, 4.2, 5.2, 4.1, 4.3, "LABOR EXCHANGE", "steps", "clay", "shop");
  building(
    5.6,
    4.4,
    4,
    3.7,
    4.8,
    "CREDIT AUTHORITY",
    "slab",
    "concrete",
    "service",
  );
  building(
    -6.5,
    -4.2,
    2.8,
    3.7,
    3.4,
    "WATER / 04",
    "setback",
    "oxidized",
    "service",
  );
  building(6.5, -4.3, 2.7, 3.6, 3.4, "LOGISTICS", "slab", "clay", "service");
  building(
    -5,
    -12.5,
    5.1,
    4.6,
    5.1,
    "RECOGNITION",
    "steps",
    "limestone",
    "service",
  );
  building(
    5,
    -12,
    4.7,
    3.9,
    4.5,
    "LICENSED ACCESS",
    "setback",
    "concrete",
    "service",
  );
  // The south concourse and eastern freight arm turn the original core into an L.
  const southNames = [
    "SHIFT HOUSING",
    "RECLAMATION",
    "THERMAL / 04",
    "TRANSIT STAFF",
  ];
  for (let row = 0; row < 4; row++) {
    const z = 20 + row * 8;
    building(
      -5,
      z,
      5.2,
      4.8,
      [4.4, 5.9, 4.8, 6.2][row],
      southNames[row],
      (["setback", "steps", "slab", "split"] as const)[row],
      (["limestone", "oxidized", "clay", "concrete"] as const)[row],
      row === 1 ? "shop" : "homes",
    );
    building(
      5,
      z,
      5.3,
      4.8,
      3.6 + (row % 3) * 1.2,
      row === 3 ? "PLATFORM / 09" : "LICENSED LABOR",
      (["steps", "setback", "split", "slab"] as const)[row],
      (["clay", "concrete", "limestone", "oxidized"] as const)[row],
      row === 3 ? "service" : row === 1 ? "shop" : "homes",
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
  // Repaired public paving sits below contact shadows (0.065) and the scanner.
  // These are surface repairs, never raised obstacles or a second road surface.
  for (const [x, z, w, d] of [
    [-9.2, 10.6, 1.15, 0.65],
    [-10.15, 5.3, 0.9, 1.5],
    [-5.8, 8.6, 1.3, 0.42],
    [2.6, 9.2, 1.05, 0.58],
    [-9.4, 24.5, 0.75, 1.65],
    [-2.2, 31.5, 0.8, 1.1],
    [6.8, 40.3, 1.25, 0.55],
    [-12.9, 32.1, 1.6, 0.38],
  ]) {
    const patch = box(x, 0.038, z, w, 0.014, d, mats.patch);
    patch.castShadow = false;
  }
  for (const pocket of STREET_POCKETS) {
    const group = new THREE.Group();
    group.name = pocket.name;
    exterior.add(group);
    const concrete = mats.limestone.clone(),
      metal = mats.oxidized.clone(),
      dark = mats.dark.clone(),
      cloth = mats.fabric.clone(),
      green = mats.leaf.clone(),
      soil = mats.soil.clone();
    const materials = [concrete, metal, dark, cloth, green, soil];
    // Only supporting posts and furniture have ground footprints; shade is
    // overhead. All shapes stay outside the shared paired approach corridors.
    function solid(
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      material = concrete,
    ) {
      box(x, y, z, w, h, d, material, group);
      collisions.push({ x, z, w, d });
    }
    function seat(x: number, z: number, w: number) {
      solid(x, 0.48, z, w, 0.13, 0.42);
      box(x, 0.76, z - 0.18, w, 0.4, 0.06, metal, group);
      for (const side of [-1, 1])
        box(x + side * w * 0.34, 0.23, z, 0.13, 0.46, 0.32, dark, group);
    }
    function planter(x: number, z: number, w: number, d: number) {
      solid(x, 0.23, z, w, 0.46, d, metal);
      box(x, 0.47, z, w - 0.08, 0.03, d - 0.08, soil, group);
      for (let plant = 0; plant < 3; plant++)
        box(
          x + (plant - 1) * w * 0.24,
          0.62 + (plant % 2) * 0.12,
          z + (plant - 1) * d * 0.13,
          w * 0.34,
          0.27 + (plant % 2) * 0.23,
          d * 0.48,
          green,
          group,
        );
    }
    const [left, right] = pocket.positions;
    const cx = (left[0] + right[0]) / 2,
      cz = (left[1] + right[1]) / 2;
    if (pocket.id === "exchange-court") {
      box(cx, 0.037, cz - 0.02, 2.8, 0.02, 1.35, mats.patch).castShadow = false;
      seat(cx, cz - 0.67, 1.85);
      for (const x of [cx - 1.05, cx + 1.1])
        solid(x, 1.33, cz - 0.55, 0.09, 2.66, 0.09, metal);
      const shade = box(cx, 2.69, cz - 0.25, 2.45, 0.065, 1.35, cloth, group);
      shade.rotation.z = -0.06;
      box(cx + 0.57, 2.72, cz - 0.25, 0.52, 0.04, 1.28, metal, group);
      // Keep the Z8 through-street clear, including the player's radius.
      solid(cx + 1.3, 1.43, cz - 0.37, 0.16, 0.75, 1.2, dark);
      box(cx + 1.3, 0.52, cz - 0.37, 0.12, 1.04, 0.12, metal, group);
      sign(
        "SWAPS / SHIFT NOTICES",
        cx + 1.39,
        1.6,
        cz - 0.37,
        1.14,
        0.28,
        true,
        "#d9cba8",
        { group, materials },
      );
      // Posted slips share their finish instead of making a texture per scrap.
      for (let slip = 0; slip < 3; slip++)
        box(
          cx + 1.39,
          1.18 + (slip % 2) * 0.06,
          cz - 0.53 + slip * 0.2,
          0.02,
          0.2,
          0.13,
          cloth,
          group,
        );
    } else if (pocket.id === "reclamation-yard") {
      box(cx - 0.3, 0.037, cz, 2.5, 0.02, 4, mats.patch).castShadow = false;
      solid(cx - 1.6, 1.13, cz, 0.12, 2.26, 3.8, metal);
      for (const z of [cz - 1.8, cz + 1.8])
        solid(cx - 0.28, 1.05, z, 0.1, 2.1, 0.1, dark);
      const leanTo = box(cx - 0.91, 2.24, cz, 1.7, 0.1, 4.05, metal, group);
      leanTo.rotation.z = -0.12;
      for (const z of [cz - 1.2, cz + 0.75])
        box(cx - 0.91, 2.31, z, 1.66, 0.06, 0.24, concrete, group).rotation.z =
          -0.12;
      solid(cx - 1.03, 0.82, cz - 0.1, 0.62, 0.13, 1.45, concrete);
      for (const z of [cz - 0.62, cz + 0.42])
        box(cx - 1.03, 0.39, z, 0.42, 0.78, 0.14, dark, group);
      box(cx - 1.03, 0.94, cz - 0.32, 0.24, 0.1, 0.42, metal, group);
      box(cx - 1.06, 0.93, cz + 0.34, 0.32, 0.08, 0.15, dark, group);
      planter(cx + 0.75, cz - 1.65, 1, 0.6);
      planter(cx + 0.95, cz + 1.6, 0.65, 0.8);
      solid(cx - 1, 0.3, cz + 1.3, 0.7, 0.6, 0.45, dark);
      sign(
        "MEND / SHARE",
        cx - 0.88,
        1.89,
        cz + 1.95,
        1.4,
        0.4,
        false,
        "#d9cba8",
        { group, materials },
      );
    } else {
      box(cx - 0.2, 0.037, cz, 3.5, 0.02, 1.65, mats.patch).castShadow = false;
      for (const [dx, dz, w, d] of [
        [-0.9, 0.37, 0.75, 0.42],
        [0.15, 0.42, 1.1, 0.32],
        [-0.45, -0.12, 0.6, 0.46],
        [0.7, -0.22, 0.45, 0.64],
      ])
        box(cx + dx, 0.052, cz + dz, w, 0.006, d, mats.limestone).castShadow =
          false;
      seat(cx - 0.1, cz - 0.87, 1.75);
      planter(cx - 2.3, cz - 0.15, 0.75, 0.72);
      planter(cx + 1.28, cz - 0.7, 0.55, 0.5);
      // The original suspended-service shelter remains, with a shorter bench
      // south of the Z41.1 crossing and an honest footprint.
      box(-1.8, 0.037, 40, 1.4, 0.02, 5, mats.patch).castShadow = false;
      for (const z of [38, 42]) solid(-1.8, 1.4, z, 0.12, 2.8, 0.12, dark);
      box(-1.8, 2.82, 40, 2.1, 0.15, 5.4, metal, group);
      box(-2.15, 2.91, 39.2, 0.65, 0.04, 1.2, concrete, group);
      solid(-1.8, 0.45, 39.55, 0.5, 0.18, 1.5);
      for (const z of [39, 40.1])
        box(-1.8, 0.22, z, 0.35, 0.44, 0.12, dark, group);
      sign("SERVICE SUSPENDED", -1.8, 2.45, 42.75, 3.2, 0.6, false, "#d9cba8", {
        group,
        materials,
      });
    }
    fadeGroups.push({
      group,
      box: new THREE.Box3().setFromObject(group),
      materials,
    });
  }
  sign("SOUTH CONCOURSE", 0, 0.07, 18.2, 4.8, 0.8).rotation.x = -Math.PI / 2;
  sign("EAST GRID EXCHANGE", 29, 0.07, 40, 5, 0.7).rotation.x = -Math.PI / 2;
  sign("TRANSPORT ONLY", 10.5, 1.8, 47, 3, 0.6);
  const compound = createCompound();
  exterior.add(compound.group);
  collisions.push(...compound.collisions);
  fadeGroups.push(...compound.houses);
  // Private access ports stay inside the estates' existing ground footprints.
  for (const [house, x, z] of [
    [compound.houses[0], 30, 22.25],
    [compound.houses[1], 28, 38.25],
  ] as const) {
    const casing = mats.dark.clone(),
      display = mats.teal.clone();
    house.materials.push(casing, display);
    box(x, 0.8, z, 0.45, 1.6, 0.25, casing, house.group);
    box(x, 1.23, z + 0.14, 0.34, 0.4, 0.035, display, house.group);
    sign(
      "PRIVATE MODEL PORT",
      x,
      1.93,
      z + 0.15,
      1.55,
      0.3,
      false,
      "#d9cba8",
      house,
    );
    house.box.setFromObject(house.group);
  }
  // A walkable maintenance hatch, not another obstacle in the tram crossing.
  box(-11, 0.031, 40, 1.6, 0.024, 1.8, mats.dark).castShadow = false;
  for (let bar = 0; bar < 6; bar++)
    box(
      -11.63 + bar * 0.25,
      0.048,
      40,
      0.045,
      0.009,
      1.65,
      mats.oxidized,
    ).castShadow = false;
  sign("SERVICE / B9", -11, 0.057, 39.38, 1.25, 0.32).rotation.x = -Math.PI / 2;
  // Civic art uses the same owned-material fading and static batches as buildings.
  // Only the plinths touch the ground; tall overhangs leave adjacent paths open.
  const sculptureGroups: typeof fadeGroups = [];
  const hoopGeometry = new THREE.TorusGeometry(1, 0.09, 6, 32);
  function monument(name: string, x: number, z: number, w: number, d: number) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, 0, z);
    exterior.add(group);
    const stone = mats.limestone.clone(),
      bronze = mats.amber.clone(),
      dark = mats.dark.clone(),
      verdigris = mats.oxidized.clone();
    bronze.metalness = 0.62;
    bronze.roughness = 0.4;
    const materials = [stone, bronze, dark, verdigris];
    const sculpture = { group, box: new THREE.Box3(), materials };
    sculptureGroups.push(sculpture);
    fadeGroups.push(sculpture);
    box(0, 0.18, 0, w, 0.36, d, dark, group);
    box(0, 0.47, 0, w - 0.16, 0.22, d - 0.16, stone, group);
    collisions.push({ x, z, w, d });
    return { group, materials, stone, bronze, dark, verdigris };
  }
  function hoop(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    material: THREE.Material,
    parent: THREE.Object3D,
  ) {
    const mesh = new THREE.Mesh(hoopGeometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, 1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  {
    const art = monument("The Provider", -13.5, -12.7, 2.6, 2.6);
    const { group, stone, bronze, dark, verdigris } = art;
    // An anonymous nine-metre benefactor physically holding its own halo.
    for (const side of [-1, 1]) {
      box(side * 0.48, 0.76, 0.16, 0.65, 0.35, 0.95, dark, group);
      box(side * 0.43, 2, 0, 0.57, 2.25, 0.7, verdigris, group);
      box(side * 1.2, 4.55, 0, 0.48, 1.55, 0.58, verdigris, group).rotation.z =
        side * 0.42;
      box(side * 1.58, 5.35, 0, 0.38, 1.2, 0.48, verdigris, group).rotation.z =
        -side * 0.22;
      box(side * 1.72, 5.91, -0.03, 0.64, 0.25, 0.6, bronze, group);
    }
    box(0, 3.07, 0, 1.52, 0.4, 0.92, bronze, group);
    box(0, 4.25, 0, 1.85, 2.15, 0.9, verdigris, group);
    box(0, 5.27, 0, 2.25, 0.4, 1, stone, group);
    box(0, 5.7, 0, 0.54, 0.55, 0.56, dark, group);
    box(0, 6.63, 0, 1.13, 1.5, 0.9, stone, group);
    box(0.14, 6.63, 0.461, 0.065, 1.08, 0.025, dark, group);
    hoop(0, 7.12, -0.17, 2, 2, bronze, group);
    sign("THE PROVIDER", 0, 0.46, 1.31, 2.3, 0.27, false, "#e2d5b4", art);
  }
  {
    const art = monument("The Witness", 14.1, -5, 2, 1.8);
    const { group, stone, bronze, dark, verdigris } = art;
    for (const side of [-1, 1])
      box(side * 0.38, 1.72, 0, 0.23, 2.4, 0.33, stone, group).rotation.z =
        -side * 0.22;
    const eye = new THREE.Group();
    eye.position.set(0, 3.65, 0);
    eye.rotation.y = Math.PI / 4;
    group.add(eye);
    hoop(0, 0, 0, 1.65, 1.05, bronze, eye);
    hoop(0, 0, 0, 1.4, 0.81, verdigris, eye);
    tube(0, 0, 0, 0.57, 0.16, dark, eye).rotation.x = Math.PI / 2;
    tube(0, 0, 0.12, 0.3, 0.13, bronze, eye).rotation.x = Math.PI / 2;
    tube(0, 0, 0.2, 0.12, 0.12, dark, eye).rotation.x = Math.PI / 2;
    for (const side of [-1, 1])
      box(side * 0.96, 0, 0, 0.88, 0.065, 0.08, dark, eye);
    sign(
      "THE WITNESS / CIVIC ART",
      0,
      0.46,
      0.91,
      1.85,
      0.25,
      false,
      "#e2d5b4",
      art,
    );
  }
  {
    const art = monument("Still Here", -14.4, 20, 1.3, 1.5);
    const { group, stone, bronze, dark, verdigris } = art;
    // Residents welded discarded chairs together; a plant claims the top seat.
    box(0, 1.85, -0.28, 0.09, 2.7, 0.09, dark, group);
    for (let tier = 0; tier < 3; tier++) {
      const chair = new THREE.Group();
      chair.position.set((tier % 2) * 0.12 - 0.06, 0.59 + tier * 0.76, 0);
      chair.rotation.y = (tier - 1) * 0.24;
      group.add(chair);
      const finish = tier === 1 ? bronze : verdigris;
      box(0, 0.4, 0, 0.8, 0.09, 0.7, finish, chair);
      for (const x of [-0.33, 0.33]) {
        for (const z of [-0.26, 0.26])
          box(x, 0.2, z, 0.07, 0.4, 0.07, dark, chair);
        box(x, 0.75, -0.28, 0.07, 0.75, 0.07, finish, chair);
      }
      for (const y of [0.72, 0.99])
        box(0, y, -0.28, 0.73, 0.12, 0.075, finish, chair);
    }
    tube(0, 2.68, 0.08, 0.19, 0.34, stone, group);
    for (const side of [-1, 1])
      box(
        side * 0.15,
        3.02,
        0.08,
        0.14,
        0.5,
        0.22,
        verdigris,
        group,
      ).rotation.z = -side * 0.55;
    sign("STILL HERE", 0, 0.46, 0.76, 1.13, 0.23, false, "#e2d5b4", art);
  }
  {
    const art = monument("Unspent Hours", -13.7, 44, 1.8, 1.8);
    const { group, stone, bronze, dark } = art;
    box(0, 1.15, 0, 0.82, 1.15, 0.75, stone, group);
    box(-0.2, 2.83, 0, 0.25, 2.45, 0.28, dark, group).rotation.z = -0.13;
    const dial = new THREE.Group();
    dial.position.set(0, 5.25, 0);
    dial.rotation.y = Math.PI / 4;
    group.add(dial);
    hoop(0, 0, 0, 1.48, 1.48, bronze, dial);
    for (let tick = 0; tick < 12; tick++) {
      const angle = (tick * Math.PI) / 6;
      box(
        Math.sin(angle) * 1.3,
        Math.cos(angle) * 1.3,
        0,
        0.12,
        0.26,
        0.2,
        stone,
        dial,
      ).rotation.z = -angle;
    }
    // No hands: the allotted hours fall through a permanently empty clock.
    box(0, 0.48, 0, 0.04, 1.65, 0.05, dark, dial);
    for (let hour = 0; hour < 6; hour++)
      box(
        (hour % 2) * 0.18 - 0.09,
        0.74 - hour * 0.34,
        0,
        0.25,
        0.25,
        0.25,
        bronze,
        dial,
      ).rotation.z = Math.PI / 4;
    sign("UNSPENT HOURS", 0, 0.46, 0.91, 1.63, 0.25, false, "#e2d5b4", art);
  }
  {
    const art = monument("The Inertia Share", 28.1, 27.9, 3, 1.8);
    const { group, stone, bronze, dark } = art;
    box(0, 1.43, 0, 0.8, 1.7, 0.8, stone, group);
    const share = new THREE.Group();
    share.position.set(0, 3.85, 0);
    share.rotation.y = Math.PI / 4;
    group.add(share);
    // Exactly 52% of the ring owns the whole miniature city inside it.
    for (const [fraction, start, finish] of [
      [0.52, -Math.PI / 2, bronze],
      [0.48, Math.PI * 0.54, dark],
    ] as const) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(1.65, 0.2, 6, 40, Math.PI * 2 * fraction),
        finish,
      );
      arc.rotation.z = start;
      arc.castShadow = true;
      arc.receiveShadow = true;
      share.add(arc);
    }
    box(0, -0.67, 0, 1.75, 0.15, 0.8, bronze, share);
    for (const [x, h] of [
      [-0.57, 0.65],
      [0, 1.35],
      [0.57, 0.9],
    ]) {
      box(x, h / 2 - 0.6, 0, 0.42, h, 0.57, stone, share);
      box(x, h - 0.58, 0, 0.46, 0.09, 0.61, bronze, share);
    }
    sign("52% / ALL OF IT", 0, 0.46, 0.91, 2.7, 0.27, false, "#e2d5b4", art);
  }
  {
    const art = monument("Seat of Continuity", 28.1, 43.1, 3, 1.8);
    const { group, stone, bronze, dark } = art;
    for (const x of [-0.65, 0.65]) {
      box(x, 0.98, 0, 0.22, 0.8, 0.72, bronze, group);
      box(x, 1.6, 0, 0.21, 0.2, 1, bronze, group);
    }
    box(0, 1.23, 0, 1.5, 0.24, 0.95, stone, group);
    box(0, 2.18, -0.35, 1.45, 1.8, 0.24, dark, group);
    box(0, 3.13, -0.35, 1.6, 0.16, 0.32, bronze, group);
    for (const side of [-1, 1]) {
      box(side * 1.08, 3.2, -0.15, 0.1, 5.25, 0.12, dark, group);
      box(side * 1.2, 5.76, -0.15, 0.4, 0.1, 0.16, dark, group);
    }
    hoop(0, 5.85, -0.15, 1.35, 1.35, bronze, group).rotation.x = Math.PI / 2;
    const toothGeometry = new THREE.ConeGeometry(1, 1, 4);
    for (let tooth = 0; tooth < 7; tooth++) {
      const angle = (tooth * Math.PI * 2) / 7;
      const mesh = new THREE.Mesh(toothGeometry, bronze);
      mesh.position.set(
        Math.cos(angle) * 1.25,
        6.17,
        Math.sin(angle) * 1.25 - 0.15,
      );
      mesh.scale.set(0.25, tooth % 2 ? 0.7 : 1.1, 0.25);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    sign(
      "CONTINUITY HAS A SEAT",
      0,
      0.46,
      0.91,
      2.7,
      0.27,
      false,
      "#e2d5b4",
      art,
    );
  }
  for (const sculpture of sculptureGroups)
    sculpture.box.setFromObject(sculpture.group);
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
  // Mission service equipment remains at its original interaction coordinates.
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
  const investigation = createInvestigationWorld();
  investigation.group.visible = false;
  const investigationTargets = new Map<LandmarkId, InvestigationSite>();
  for (const site of Object.keys(INVESTIGATION_SITES) as InvestigationSite[])
    for (const place of INVESTIGATION_PLACES[site])
      if (place.id !== "deep-lift") investigationTargets.set(place.id, site);
  const areaGroups = [
    ["street", exterior],
    ["habitat", habitat.group],
    ["jail", jail.group],
    ["investigation", investigation.group],
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
      if ((paused && playing) || habitat.riding || investigation.riding) return;
      zoom = THREE.MathUtils.clamp(
        zoom + e.deltaY * 0.012,
        area === "street" ? 9 : 6,
        area === "street" ? 34 : 18,
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
    investigation.group.visible = false;
    investigation.reset();
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
    if (
      action.type === "enter-investigation" ||
      action.type === "exit-investigation" ||
      action.type === "ride-depths"
    ) {
      if (
        !playing ||
        habitat.riding ||
        investigation.riding ||
        custodyPhase ||
        !investigationState
      )
        return {
          ok: false,
          message: "Wait for transport or processing to finish.",
        };
      if (action.type === "enter-investigation") {
        const site = INVESTIGATION_SITES[action.site];
        if (
          area !== "street" ||
          !site.streetEntry ||
          nearby?.id !== site.streetEntry
        )
          return {
            ok: false,
            message: "Use this location's exterior access point.",
          };
        const reason = siteAccessReason(investigationState, action.site);
        if (reason) return { ok: false, message: reason };
        investigation.enter(action.site, player.group.position);
        area = "investigation";
        investigation.group.visible = true;
        exterior.visible = false;
        zoom = 11;
      } else if (area !== "investigation")
        return {
          ok: false,
          message: "Enter the private infrastructure first.",
        };
      else if (action.type === "exit-investigation") {
        const site = INVESTIGATION_SITES[investigation.site];
        if (!site.exit || nearby?.id !== site.exit || !site.streetEntry)
          return {
            ok: false,
            message: "Use the lift to reach the surface exit.",
          };
        const exit = LANDMARKS.find((place) => place.id === site.streetEntry)!;
        player.group.position.set(exit.position[0], 0, exit.position[2] + 0.5);
        area = "street";
        exterior.visible = true;
        investigation.group.visible = false;
        zoom = 13;
      } else {
        if (nearby?.id !== "deep-lift")
          return { ok: false, message: "Walk to the deep service lift." };
        const reason = siteAccessReason(investigationState, action.site);
        if (reason) return { ok: false, message: reason };
        const result = investigation.ride(action.site, player.group.position);
        if (!result.ok) return result;
      }
      nearby = undefined;
      keys.clear();
      interiorMarkers.visible = false;
      look.copy(player.group.position);
      resize();
      return {
        ok: true,
        message:
          action.type === "ride-depths"
            ? "Lift authorized. Cabin doors interlocked."
            : area === "street"
              ? "Back on the public service route."
              : INVESTIGATION_SITES[investigation.site].name,
      };
    }
    if (!playing || habitat.riding || investigation.riding || custodyPhase)
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
  function resolveDestination(
    objective: LandmarkId,
    places: readonly Landmark[],
  ) {
    if (custodyPhase || habitat.riding || investigation.riding)
      return undefined;
    const targetSite = investigationTargets.get(objective);
    let id: LandmarkId | undefined = objective;
    if (area === "street") {
      id = targetSite
        ? (INVESTIGATION_SITES[targetSite].streetEntry ?? "bunker-entrance")
        : objective === "home"
          ? "habitat-entry"
          : objective;
    } else if (area === "habitat") {
      const homeward = objective === "home" || objective === "work-terminal";
      id =
        homeward && habitat.floor === 3
          ? "home"
          : homeward || habitat.floor !== 0
            ? "elevator"
            : "habitat-exit";
    } else if (area === "investigation" && targetSite !== investigation.site) {
      const site = INVESTIGATION_SITES[investigation.site];
      id =
        !site.exit ||
        (investigation.site === "bunker" &&
          (targetSite === "detention" || targetSite === "routing"))
          ? "deep-lift"
          : site.exit;
    }
    return places.find((place) => place.id === id);
  }
  function update(delta: number, view: WorldView): WorldSnapshot {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    time += dt;
    paused = view.paused;
    playing = view.playing;
    investigationState = view.investigation;
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
        investigation.group.visible = false;
        interiorMarkers.visible = false;
        zoom = 13;
      } else if (nextCustody) {
        area = "jail";
        exterior.visible = false;
        habitat.group.visible = false;
        investigation.group.visible = false;
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
    if (investigationState)
      investigation.update(
        Math.min(Math.max(delta, 0), 0.1),
        paused,
        player.group.position,
        investigationState,
      );
    if (paused) keys.clear();
    let sx = 0,
      sy = 0;
    if (
      !paused &&
      playing &&
      !habitat.riding &&
      !investigation.riding &&
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
      } else if (area === "investigation") {
        if (!investigation.blocked(p.x + dx, p.z)) p.x += dx;
        if (!investigation.blocked(p.x, p.z + dz)) p.z += dz;
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
    } else if (area === "investigation") {
      if (!investigation.riding)
        p.y = INVESTIGATION_SITES[investigation.site].depth;
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
    if (investigation.riding) look.copy(p);
    else look.lerp(desired, 1 - Math.exp(-dt * 4));
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
    const places =
      area === "habitat"
        ? habitat.places
        : area === "investigation"
          ? investigation.places
          : area === "jail"
            ? []
            : streetPlaces;
    const riding = habitat.riding || investigation.riding;
    const destination = resolveDestination(
      view.objective ?? "work-terminal",
      places,
    );
    for (const { place, mesh } of markers) {
      const dist = Math.hypot(p.x - place.position[0], p.z - place.position[2]);
      mesh.visible =
        area === "street" &&
        (dist < 8 || place.id === destination?.id || !playing);
      mesh.material.opacity = place.id === destination?.id ? 0.95 : 0.45;
      mesh.scale.setScalar(
        place.id === destination?.id ? 1.4 + Math.sin(time * 3) * 0.1 : 1,
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
    interiorMarkers.visible =
      (area === "habitat" || area === "investigation") && !riding;
    if (interiorMarkers.visible)
      for (let i = 0; i < interiorMarkers.children.length; i++) {
        const place = places[i],
          marker = interiorMarkers.children[i];
        marker.visible = Boolean(place);
        if (!place) continue;
        marker.scale.setScalar(place.id === destination?.id ? 1.4 : 1);
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
    if (nextCustody || riding) nearest = undefined;
    nearby = nearest;
    const exposed = area === "street" && insideScanner(p.x, p.z) && p.y < 0.75;
    scanMaterial.opacity =
      view.carrying && exposed ? 0.22 + Math.sin(time * 8) * 0.08 : 0.12;
    renderer.domElement.dataset.position = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    renderer.domElement.dataset.zoom = String(zoom);
    renderer.domElement.dataset.area = area;
    renderer.domElement.dataset.floor =
      area === "investigation" ? investigation.site : String(habitat.floor);
    renderer.domElement.dataset.riding = String(riding);
    renderer.domElement.dataset.depth = String(
      area === "investigation" ? Math.max(0, -p.y) : 0,
    );
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      nearest,
      exposed,
      zoom,
      area,
      floor: habitat.floor,
      riding,
      furniture: habitat.furniture,
      roomBounds: ROOM_BOUNDS,
      places,
      security,
      jailExitReachable:
        area === "jail" &&
        nextCustody === "release" &&
        Math.hypot(p.x - JAIL_EXIT.x, p.z - JAIL_EXIT.z) <= 1.5,
      investigationSite:
        area === "investigation" ? investigation.site : undefined,
      depth: area === "investigation" ? Math.max(0, -p.y) : 0,
      destination,
    };
  }
  let shadowArea: WorldSnapshot["area"] | undefined;
  let shadowDepth: number | undefined;
  return {
    update,
    reset,
    act,
    render: () => {
      renderer.shadowMap.autoUpdate = area !== "street";
      const depth = area === "investigation" ? player.group.position.y : 0;
      if (shadowArea !== area || shadowDepth !== depth) {
        const center = area === "street" ? 16 : 0;
        const extent = area === "street" ? 50 : 24;
        sun.position.set(center - 32, depth + 56, center + 24);
        sun.target.position.set(center, depth, center);
        sun.shadow.camera.left = sun.shadow.camera.bottom = -extent;
        sun.shadow.camera.right = sun.shadow.camera.top = extent;
        sun.shadow.camera.updateProjectionMatrix();
        renderer.shadowMap.needsUpdate = true;
      }
      for (const part of playerParts) part.castShadow = area !== "street";
      shadowArea = area;
      shadowDepth = depth;
      renderer.render(scene, camera);
    },
  };
}
