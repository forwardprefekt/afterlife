import * as THREE from "three";
import type { Landmark } from "./content";
import type { ActionResult } from "./game";
import {
  INVESTIGATION_PLACES,
  INVESTIGATION_SITES,
  type InvestigationSite,
  type InvestigationState,
} from "./investigation";

interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
}
interface Interior {
  root: THREE.Group;
  scenery: THREE.Group;
  obstacles: Footprint[];
}
type Route = readonly (readonly [number, number])[];
const RADIUS = 0.28;
const NO_PLACES: readonly Landmark[] = [];
const DEEP_SITES: readonly InvestigationSite[] = [
  "bunker",
  "detention",
  "routing",
];

/** Six cutaways share primitives, but only the occupied interior is attached. */
export function createInvestigationWorld(): {
  group: THREE.Group;
  readonly site: InvestigationSite;
  readonly riding: boolean;
  readonly places: readonly Landmark[];
  enter(site: InvestigationSite, player: THREE.Vector3): void;
  ride(site: InvestigationSite, player: THREE.Vector3): ActionResult;
  update(
    delta: number,
    paused: boolean,
    player: THREE.Vector3,
    story: InvestigationState,
  ): void;
  blocked(x: number, z: number): boolean;
  reset(): void;
} {
  const group = new THREE.Group();
  group.name = "Under the Compact / occupied interior";
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const head = new THREE.SphereGeometry(1, 8, 6);
  const modelGeometry = new THREE.IcosahedronGeometry(1, 0);
  const colors = {
    concrete: 0x586968,
    floor: 0x283a40,
    dark: 0x18292f,
    metal: 0x83958e,
    pale: 0xc0c5b0,
    marble: 0x9aab9d,
    bronze: 0xb49761,
    wood: 0x665044,
    cloth: 0x66817b,
    ochre: 0xb18d58,
    blue: 0x526e89,
    skin: 0xac8a71,
    darkSkin: 0x70594d,
    hair: 0x303131,
    red: 0x8f5148,
    cyan: 0x81cec0,
    amber: 0xe4b86f,
    refuge: 0xa6c59c,
    cold: 0x8caeb5,
    insulation: 0x506b78,
  };
  const mats = Object.fromEntries(
    Object.entries(colors).map(([name, color]) => [
      name,
      new THREE.MeshStandardMaterial({ color, roughness: 0.84 }),
    ]),
  ) as Record<keyof typeof colors, THREE.MeshStandardMaterial>;
  for (const key of ["cyan", "amber", "refuge"] as const) {
    mats[key].emissive.copy(mats[key].color);
    mats[key].emissiveIntensity = 0.38;
  }
  mats.metal.metalness = 0.45;
  mats.bronze.metalness = 0.55;
  mats.marble.roughness = 0.35;
  const rooms = {} as Record<InvestigationSite, Interior>;
  const sites = Object.keys(INVESTIGATION_SITES) as InvestigationSite[];
  const labels = [
    ...sites.map((site) => INVESTIGATION_SITES[site].name),
    "GHOST INFERENCE / OFFLINE",
    "REDACTED COPIES ONLY",
    "REPAIR / NOT REPLACE",
    "OWNER DIRECTIVES",
    "CONSENT OVERRIDDEN BY OWNER",
    "HOUSING / CREDIT / APPEALS",
    "PRIVATE CONTINUITY",
    "EXECUTIVE RECORDS",
    "ACCESS FOLLOWS OWNERSHIP",
    "AUTHORIZED DEPTHS",
    "00 / ESTATE ACCESS",
    "360 / DETENTION",
    "420 / ROUTING",
    "NON-RESIDENT REGISTER",
    "PEOPLE ARE NOT PROPERTY",
    "LOCAL REFUGE CONTROL",
    "PROTECTED SERVICE REFUGE",
    "WATER / BLANKETS / FIRST AID",
    "OUTBOUND HOLD",
    "SEALED ROUTING RECORDS",
    "COLD-CHAIN / RESTRICTED",
    "CHAIN OF CUSTODY",
    "RETURN TO STREET",
    "CELL A",
    "CELL B",
    "CELL C",
    "LOCAL ROUTE OPEN",
  ];
  const atlas = document.createElement("canvas");
  atlas.width = 1024;
  atlas.height = Math.ceil(labels.length / 2) * 64;
  const ink = atlas.getContext("2d")!;
  ink.fillStyle = "#18292f";
  ink.fillRect(0, 0, atlas.width, atlas.height);
  ink.font = "bold 23px monospace";
  ink.textAlign = "center";
  ink.textBaseline = "middle";
  for (let i = 0; i < labels.length; i++) {
    const x = (i % 2) * 512;
    const y = Math.floor(i / 2) * 64;
    ink.strokeStyle = "#789c91";
    ink.strokeRect(x + 3, y + 3, 506, 58);
    ink.fillStyle = "#e7e4ca";
    ink.fillText(labels[i]!, x + 256, y + 33, 490);
  }
  const atlasTexture = new THREE.CanvasTexture(atlas);
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshBasicMaterial({ map: atlasTexture });
  const signGeometries = new Map<string, THREE.PlaneGeometry>();

  function box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = h > 0.12;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function solid(
    site: InvestigationSite,
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
  ) {
    rooms[site].obstacles.push({ x, z, w, d });
    return box(rooms[site].scenery, x, h / 2, z, w, h, d, material);
  }
  function sign(
    parent: THREE.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    width = 5,
  ) {
    let geometry = signGeometries.get(text);
    if (!geometry) {
      const index = labels.indexOf(text);
      geometry = new THREE.PlaneGeometry(1, 0.125);
      const uv = geometry.attributes.uv!;
      const left = ((index % 2) * 512 + 1) / atlas.width;
      const bottom = 1 - (Math.floor(index / 2) * 64 + 63) / atlas.height;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(
          i,
          left + (uv.getX(i) * 510) / atlas.width,
          bottom + (uv.getY(i) * 62) / atlas.height,
        );
      }
      signGeometries.set(text, geometry);
    }
    const mesh = new THREE.Mesh(geometry, signMaterial);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(width);
    parent.add(mesh);
    return mesh;
  }
  function place(site: InvestigationSite, id: string): Landmark {
    const result = INVESTIGATION_PLACES[site].find(
      (landmark) => landmark.id === id,
    );
    if (!result)
      throw new Error(`Missing investigation stand point: ${site}/${id}`);
    return result;
  }
  function consoleAt(
    site: InvestigationSite,
    id: string,
    label: string,
    material: THREE.Material = mats.cyan,
  ) {
    const [x, , z] = place(site, id).position;
    const parent = rooms[site].scenery;
    // Coordinates in story metadata are player positions, never furniture centers.
    solid(site, x, z - 1.35, 1.65, 0.95, 0.72, mats.dark);
    box(parent, x, 1.22, z - 1.54, 1.52, 0.68, 0.15, mats.metal);
    box(parent, x, 1.25, z - 1.45, 1.32, 0.46, 0.035, material);
    for (let i = 0; i < 4; i++) {
      box(
        parent,
        x - 0.45 + i * 0.3,
        0.99,
        z - 1.15,
        0.13,
        0.035,
        0.12,
        mats.amber,
      );
    }
    sign(parent, label, x, 1.94, z - 1.53, 3.6);
    box(parent, x, 0.015, z, 1.15, 0.03, 0.85, material);
  }
  function person(
    parent: THREE.Object3D,
    jacket: THREE.Material,
    complexion: THREE.Material,
  ) {
    const body = new THREE.Group();
    parent.add(body);
    const legs: THREE.Group[] = [];
    for (const x of [-0.15, 0.15]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.72, 0);
      box(leg, 0, -0.29, 0, 0.2, 0.58, 0.23, mats.dark);
      box(leg, 0, -0.64, 0.05, 0.23, 0.14, 0.35, mats.hair);
      body.add(leg);
      legs.push(leg);
    }
    box(body, 0, 1.05, 0, 0.52, 0.65, 0.3, jacket);
    box(body, 0, 0.79, 0.025, 0.55, 0.13, 0.34, jacket);
    for (const x of [-0.34, 0.34]) {
      box(body, x, 1.02, 0, 0.15, 0.59, 0.22, jacket);
      box(body, x, 0.68, 0.01, 0.13, 0.14, 0.15, complexion);
    }
    const face = new THREE.Mesh(head, complexion);
    face.position.set(0, 1.59, 0);
    face.scale.set(0.22, 0.27, 0.21);
    face.castShadow = true;
    body.add(face);
    box(body, 0, 1.8, -0.025, 0.39, 0.1, 0.35, mats.hair);
    return { body, legs };
  }
  function shelving(
    site: InvestigationSite,
    x: number,
    z: number,
    cold = false,
  ) {
    const parent = rooms[site].scenery;
    solid(site, x, z, 2.7, 1.65, 1.3, cold ? mats.insulation : mats.wood);
    for (let row = 0; row < 3; row++) {
      box(parent, x, 0.22 + row * 0.51, z + 0.69, 2.48, 0.07, 0.1, mats.bronze);
      for (let column = 0; column < 5; column++) {
        box(
          parent,
          x - 0.99 + column * 0.49,
          0.45 + row * 0.5,
          z + 0.7,
          cold ? 0.39 : 0.27,
          0.33,
          0.08,
          cold ? mats.cold : mats.pale,
        );
      }
    }
  }
  function batchStatic(parent: THREE.Group) {
    // Same geometry/material/shadow batching convention as the district; dynamic
    // doors and actors live outside this subtree and retain their local transforms.
    parent.updateMatrixWorld(true);
    const batches = new Map<string, THREE.Mesh[]>();
    parent.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
        return;
      const key = `${object.geometry.id}:${object.material.id}:${object.castShadow}:${object.receiveShadow}`;
      const meshes = batches.get(key);
      if (meshes) meshes.push(object);
      else batches.set(key, [object]);
    });
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const first = meshes[0]!;
      const batch = new THREE.InstancedMesh(
        first.geometry,
        first.material,
        meshes.length,
      );
      batch.name = "Static investigation scenery";
      batch.castShadow = first.castShadow;
      batch.receiveShadow = first.receiveShadow;
      for (let i = 0; i < meshes.length; i++) {
        batch.setMatrixAt(i, meshes[i]!.matrixWorld);
        meshes[i]!.removeFromParent();
      }
      batch.computeBoundingSphere();
      parent.add(batch);
    }
  }

  for (const site of sites) {
    const root = new THREE.Group();
    root.name = INVESTIGATION_SITES[site].name;
    const scenery = new THREE.Group();
    root.add(scenery);
    rooms[site] = { root, scenery, obstacles: [] };
    const rich = site === "villa" || site === "residence";
    box(scenery, 0, -0.18, 0, 24, 0.36, 20, rich ? mats.marble : mats.floor);
    solid(site, 0, -9.86, 24, 3.1, 0.28, rich ? mats.pale : mats.concrete);
    solid(site, -11.86, 0, 0.28, 2.3, 20, rich ? mats.marble : mats.concrete);
    solid(site, 11.86, 0, 0.28, 0.45, 20, mats.concrete);
    solid(site, 0, 9.86, 24, 0.45, 0.28, mats.concrete);
    // Flush inlays do not become dishonest invisible obstacles in the two aisles.
    for (const x of [-1.35, 1.35]) {
      box(
        scenery,
        x,
        0.014,
        0,
        0.06,
        0.025,
        17.7,
        rich ? mats.bronze : mats.cyan,
      );
    }
    for (const z of [-1.25, 1.25]) {
      box(
        scenery,
        0,
        0.013,
        z,
        22.7,
        0.025,
        0.06,
        rich ? mats.bronze : mats.metal,
      );
    }
    sign(scenery, INVESTIGATION_SITES[site].name, -6, 2.56, -9.68, 8.5);
    if (INVESTIGATION_SITES[site].exit) {
      const exit = place(site, INVESTIGATION_SITES[site].exit!);
      const [x, , z] = exit.position;
      box(scenery, x, 0.015, z, 2.1, 0.03, 1.1, mats.amber);
      sign(scenery, "RETURN TO STREET", x, 1.42, 9.66, 3.2);
    }
  }

  // Exchange: patched counters, salvaged processors, exposed pipework and a broker.
  {
    const site = "market";
    const parent = rooms[site].scenery;
    consoleAt(site, "token-broker", "GHOST INFERENCE / OFFLINE", mats.amber);
    consoleAt(site, "dead-drop", "REDACTED COPIES ONLY");
    const broker = person(parent, mats.ochre, mats.darkSkin);
    broker.body.position.set(-7.9, 0, -5.4);
    rooms[site].obstacles.push({ x: -7.9, z: -5.4, w: 0.76, d: 0.5 });
    for (const x of [-7.5, 7.5]) {
      solid(site, x, 4.6, 4.3, 0.85, 1.55, mats.wood);
      for (let i = 0; i < 4; i++) {
        const unitX = x - 1.5 + i * 0.92;
        box(parent, unitX, 1.11, 4.65, 0.67, 0.5, 0.73, mats.dark);
        box(
          parent,
          unitX,
          1.16,
          5.025,
          0.48,
          0.25,
          0.035,
          i % 2 ? mats.cyan : mats.metal,
        );
        box(parent, unitX + 0.1, 1.3, 5.047, 0.04, 0.12, 0.015, mats.dark);
      }
    }
    for (const x of [-10.4, 9.7]) {
      shelving(site, x, -7.7);
      solid(site, x, 7.9, 1.4, 1.2, 1.2, mats.metal);
      box(parent, x, 1.23, 7.9, 1.4, 0.08, 1.2, mats.ochre);
    }
    for (const y of [2.25, 2.55])
      box(parent, 0, y, -9.49, 22.6, 0.12, 0.12, mats.bronze);
    sign(parent, "REPAIR / NOT REPLACE", 6, 2.62, -9.68, 7);
  }

  // Pale villa: a terraced control model set opposite the actual directives desk.
  {
    const site = "villa";
    const parent = rooms[site].scenery;
    consoleAt(site, "villa-directives", "OWNER DIRECTIVES");
    solid(site, 6, -4.7, 5.1, 0.6, 4, mats.pale);
    box(parent, 6, 0.66, -4.7, 4.8, 0.12, 3.7, mats.dark);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 4; column++) {
        const height = 0.22 + ((column + row * 2) % 4) * 0.18;
        box(
          parent,
          4.35 + column * 1.08,
          0.72 + height / 2,
          -5.85 + row * 1.08,
          0.66,
          height,
          0.7,
          mats.marble,
        );
      }
    }
    const model = new THREE.Mesh(modelGeometry, mats.cyan);
    model.position.set(6, 2.1, -4.7);
    model.scale.setScalar(0.63);
    parent.add(model);
    box(parent, 6, 1.42, -4.7, 0.08, 1.4, 0.08, mats.bronze);
    sign(parent, "CONSENT OVERRIDDEN BY OWNER", 6, 2.4, -7, 6.3);
    sign(parent, "HOUSING / CREDIT / APPEALS", 6, 1.17, -2.68, 4.7);
    for (const x of [-8, 8]) {
      solid(site, x, 5.1, 4.5, 0.45, 1.5, mats.pale);
      box(parent, x, 0.76, 5.65, 4.5, 0.68, 0.32, mats.cloth);
      box(parent, x, 0.54, 5.02, 4.16, 0.2, 1.13, mats.cloth);
      solid(site, x, 8.15, 1.7, 0.9, 1.1, mats.marble);
      box(parent, x, 1.39, 8.15, 0.1, 1.0, 0.1, mats.bronze);
      box(parent, x, 1.95, 8.15, 0.8, 0.18, 0.55, mats.amber);
    }
    for (const x of [-10.4, -2.5, 2.5, 10.4]) {
      solid(site, x, -8.1, 0.64, 2.8, 0.64, mats.pale);
      box(parent, x, 2.88, -8.1, 0.92, 0.16, 0.92, mats.bronze);
    }
  }

  // Dark residence: low archival islands, bronze accession rails, executive dais.
  {
    const site = "residence";
    const parent = rooms[site].scenery;
    consoleAt(site, "residence-manifest", "EXECUTIVE RECORDS", mats.amber);
    for (const x of [-8, -4, 4, 8]) {
      shelving(site, x, 5.4);
      shelving(site, x, 8.3);
    }
    solid(site, -6.2, -5.6, 5.2, 0.9, 2.2, mats.wood);
    box(parent, -6.2, 0.98, -5.6, 5.2, 0.16, 2.2, mats.bronze);
    for (let i = 0; i < 5; i++) {
      box(parent, -7.8 + i * 0.8, 1.12, -5.5, 0.48, 0.12, 0.73, mats.pale);
    }
    for (const x of [-8, -4, 4, 8]) {
      box(parent, x, 1.73, -9.63, 2.05, 2.12, 0.12, mats.bronze);
      box(parent, x, 1.73, -9.54, 1.85, 1.92, 0.08, mats.dark);
      box(parent, x, 1.74, -9.48, 0.54, 0.72, 0.045, mats.metal);
      box(parent, x, 1.16, -9.48, 0.94, 0.45, 0.045, mats.metal);
    }
    sign(parent, "PRIVATE CONTINUITY", -6, 2.51, -7.7, 5.6);
    sign(parent, "ACCESS FOLLOWS OWNERSHIP", 6, 2.51, -7.7, 5.8);
  }

  // Fortified ground lobby deliberately has no workday exit at depth.
  {
    const site = "bunker";
    const parent = rooms[site].scenery;
    for (const x of [-8, 8]) {
      solid(site, x, -5.9, 4.8, 1.2, 1.9, mats.concrete);
      box(parent, x, 1.32, -5.9, 4.8, 0.23, 1.9, mats.metal);
      for (let i = 0; i < 4; i++) {
        box(parent, x - 1.7 + i * 1.1, 1.65, -6, 0.73, 0.44, 0.15, mats.cyan);
      }
      solid(site, x, 5.5, 4.5, 0.65, 1.1, mats.metal);
      for (const z of [-8.3, -2.9, 3, 8.3])
        solid(site, x < 0 ? -10.5 : 10.5, z, 0.9, 2.5, 0.9, mats.concrete);
    }
    for (const x of [-3, 3]) {
      solid(site, x, -7, 0.7, 3.0, 3.8, mats.metal);
      box(parent, x, 2.95, -7, 0.78, 0.1, 3.8, mats.amber);
    }
    sign(parent, "AUTHORIZED DEPTHS", 6, 2.5, -9.67, 6.3);
    sign(parent, "360 / DETENTION", -7, 1.85, -3.6, 4.4);
    sign(parent, "420 / ROUTING", 7, 1.85, -3.6, 4.4);
  }

  const gates: { mesh: THREE.Group; footprint: Footprint }[] = [];
  const survivors: {
    body: THREE.Group;
    legs: THREE.Group[];
    startX: number;
    startZ: number;
    route: Route;
    waypoint: number;
    phase: number;
  }[] = [];
  const detention = rooms.detention;
  const refugeStatus = new THREE.Group();
  detention.root.add(refugeStatus);
  sign(refugeStatus, "LOCAL ROUTE OPEN", 6, 2.05, 5.61, 4.2);
  refugeStatus.visible = false;
  {
    const site = "detention";
    const parent = detention.scenery;
    consoleAt(site, "prison-registry", "NON-RESIDENT REGISTER");
    consoleAt(site, "refuge-control", "LOCAL REFUGE CONTROL", mats.amber);
    sign(parent, "PEOPLE ARE NOT PROPERTY", -7.6, 2.5, -1.45, 6.5);
    // Three west cells: open sightlines through real bars and solid partitions.
    // The closed gate is a continuous collider, not gaps a player can squeeze through.
    const cellCenters = [2.85, 5.55, 8.25];
    for (const z of [1.5, 4.2, 6.9, 9.6])
      solid(site, -9.4, z, 4.8, 0.95, 0.16, mats.concrete);
    for (let i = 0; i < cellCenters.length; i++) {
      const z = cellCenters[i]!;
      const gate = new THREE.Group();
      gate.position.set(-7, 0, z);
      detention.root.add(gate);
      for (let bar = 0; bar < 6; bar++)
        box(gate, 0, 1.15, -0.62 + bar * 0.25, 0.09, 2.3, 0.065, mats.metal);
      for (const y of [0.2, 1.1, 2.2])
        box(gate, 0, y, 0, 0.12, 0.09, 1.45, mats.metal);
      gates.push({ mesh: gate, footprint: { x: -7, z, w: 0.14, d: 1.45 } });
      for (const edge of [-1.04, 1.04]) {
        solid(site, -7, z + edge, 0.16, 2.35, 0.65, mats.metal);
      }
      solid(site, -10.35, z, 1.1, 0.35, 1.85, mats.metal);
      box(parent, -10.35, 0.44, z, 1.04, 0.17, 1.75, mats.cloth);
      box(parent, -10.35, 0.55, z - 0.57, 0.84, 0.12, 0.45, mats.pale);
      sign(
        parent,
        ["CELL A", "CELL B", "CELL C"][i]!,
        -8.8,
        1.9,
        z - 1.21,
        1.8,
      );
      const actor = person(
        detention.root,
        [mats.cloth, mats.ochre, mats.blue][i]!,
        i === 1 ? mats.darkSkin : mats.skin,
      );
      actor.body.name = `Clothed adult survivor ${i + 1}`;
      actor.body.position.set(-8.1, 0, z);
      actor.body.rotation.y = Math.PI / 2;
      survivors.push({
        ...actor,
        startX: -8.1,
        startZ: z,
        waypoint: 0,
        phase: i * 1.8,
        route: [
          [-6, z],
          [-4.8, z],
          [-4.8, 0],
          [0, 0],
          [0, 7.7],
          [3.2, 7.7],
          [4.2 + i * 2, 7.7],
          [4.2 + i * 2, 6.8],
        ],
      });
    }
    // Protected service annex: a clear west doorway, stocked shelves and benches.
    solid(site, 6.85, 5.85, 9.5, 0.7, 0.18, mats.concrete);
    solid(site, 2.1, 6.3, 0.18, 0.8, 0.9, mats.concrete);
    solid(site, 2.1, 9.1, 0.18, 0.8, 1.1, mats.concrete);
    box(parent, 6.7, 0.012, 7.75, 8.9, 0.025, 3.45, mats.cloth);
    for (const x of [4.3, 7.2]) {
      solid(site, x, 8.95, 2.3, 0.45, 0.75, mats.wood);
      box(parent, x, 0.49, 8.95, 2.2, 0.1, 0.7, mats.refuge);
    }
    solid(site, 10.4, 8.5, 1.25, 1.05, 1.6, mats.metal);
    for (const z of [8, 8.6, 9])
      box(parent, 10.4, 1.19, z, 0.73, 0.27, 0.33, mats.pale);
    sign(parent, "PROTECTED SERVICE REFUGE", 6.8, 1.38, 9.63, 6.6);
    sign(parent, "WATER / BLANKETS / FIRST AID", 6.8, 1.94, 9.63, 6.6);
    shelving(site, 9.7, -7.5);
  }

  // Archive: sealed insulated banks and an abstract fictional routing board.
  // No bodies, medical procedures or actionable shipping information are shown.
  {
    const site = "routing";
    const parent = rooms[site].scenery;
    consoleAt(site, "routing-ledger", "SEALED ROUTING RECORDS");
    for (const x of [-8, -4, 4, 8]) {
      shelving(site, x, -5.25, true);
      shelving(site, x, -8, true);
    }
    for (const x of [-9, -5]) {
      solid(site, x, 5.5, 2.65, 1.15, 4.7, mats.insulation);
      for (const z of [3.65, 4.8, 5.95, 7.1]) {
        box(parent, x, 1.21, z, 2.4, 0.12, 0.9, mats.cold);
        box(parent, x + 0.65, 1.29, z, 0.3, 0.07, 0.4, mats.amber);
      }
    }
    solid(site, 7.1, 8, 6.1, 0.85, 1.4, mats.dark);
    box(parent, 7.1, 1.78, 8.15, 5.9, 1.35, 0.14, mats.insulation);
    for (let i = 0; i < 5; i++) {
      box(
        parent,
        4.8 + i * 1.12,
        1.85 + (i % 2) * 0.34,
        8.24,
        0.28,
        0.28,
        0.035,
        mats.cyan,
      );
      if (i < 4)
        box(
          parent,
          5.36 + i * 1.12,
          1.99,
          8.23,
          0.92,
          0.045,
          0.035,
          mats.metal,
        );
    }
    sign(parent, "CHAIN OF CUSTODY", 7.1, 2.65, 8.25, 5.5);
    sign(parent, "COLD-CHAIN / RESTRICTED", 6.1, 2.55, -9.67, 6.9);
    sign(parent, "OUTBOUND HOLD", -7.1, 1.8, 8.25, 4.1);
  }

  // A single cutaway shaft spans all 420 metres. The cage moves continuously;
  // the current room remains the current floor until arrival at its neighbour.
  const shaft = new THREE.Group();
  shaft.name = "Continuous 420 metre service shaft";
  const bottom = INVESTIGATION_SITES.routing.depth;
  const top = INVESTIGATION_SITES.bunker.depth;
  const liftPoint = place("bunker", "deep-lift").position;
  const liftX = liftPoint[0];
  const liftZ = liftPoint[2];
  const shaftHeight = top - bottom + 5;
  box(
    shaft,
    liftX,
    bottom + shaftHeight / 2 - 0.4,
    liftZ - 2.2,
    5,
    shaftHeight,
    0.28,
    mats.dark,
  );
  for (const x of [-1.82, 1.82]) {
    box(
      shaft,
      liftX + x,
      bottom + shaftHeight / 2 - 0.4,
      liftZ - 1.7,
      0.14,
      shaftHeight,
      0.14,
      mats.metal,
    );
  }
  for (let depth = 0; depth <= top - bottom; depth += 10) {
    box(
      shaft,
      liftX,
      top - depth + 1.2,
      liftZ - 1.9,
      4.3,
      0.18,
      0.2,
      mats.concrete,
    );
    box(
      shaft,
      liftX - 1.95,
      top - depth + 1.7,
      liftZ - 1.69,
      0.14,
      0.58,
      0.08,
      mats.cyan,
    );
  }
  for (const site of DEEP_SITES) {
    const depth = INVESTIGATION_SITES[site].depth;
    sign(
      shaft,
      site === "bunker"
        ? "00 / ESTATE ACCESS"
        : site === "detention"
          ? "360 / DETENTION"
          : "420 / ROUTING",
      liftX,
      depth + 3.2,
      liftZ - 1.88,
      3.6,
    );
  }
  batchStatic(shaft);
  const cabin = new THREE.Group();
  cabin.name = "Deep service lift / moving cage";
  cabin.position.set(liftX, 0, liftZ);
  box(cabin, 0, -0.08, 0, 3.4, 0.16, 3.3, mats.metal);
  box(cabin, 0, 1.12, -1.6, 3.4, 2.24, 0.13, mats.dark);
  for (const x of [-1.64, 1.64]) {
    box(cabin, x, 0.18, -0.3, 0.1, 0.36, 2.6, mats.metal);
    for (let z = -1.5; z <= 1; z += 0.5) {
      box(cabin, x, 1.42, z, 0.08, 2.28, 0.08, mats.metal);
    }
    box(cabin, x, 2.61, 0, 0.17, 0.12, 3.4, mats.amber);
  }
  box(cabin, 0, 2.61, -1.6, 3.4, 0.12, 0.15, mats.amber);
  const liftDoors = [-1, 1].map((side) => {
    const door = new THREE.Group();
    for (let i = 0; i < 5; i++)
      box(door, -0.65 + i * 0.33, 1.2, 0, 0.055, 2.4, 0.07, mats.metal);
    for (const y of [0.2, 1.2, 2.3])
      box(door, 0, y, 0, 1.62, 0.07, 0.08, mats.metal);
    door.position.set(side * 2.45, 0, 1.62);
    cabin.add(door);
    return door;
  });
  const meterCanvas = document.createElement("canvas");
  meterCanvas.width = 512;
  meterCanvas.height = 128;
  const meterInk = meterCanvas.getContext("2d")!;
  const meterTexture = new THREE.CanvasTexture(meterCanvas);
  meterTexture.colorSpace = THREE.SRGBColorSpace;
  const meter = new THREE.Mesh(
    new THREE.PlaneGeometry(2.75, 0.69),
    new THREE.MeshBasicMaterial({ map: meterTexture }),
  );
  meter.position.set(0, 1.78, -1.52);
  cabin.add(meter);
  let shownDepth = -1;
  function depthReadout(height: number) {
    const depth = Math.max(0, Math.round(-height));
    if (shownDepth === depth) return;
    shownDepth = depth;
    meterInk.fillStyle = "#101e25";
    meterInk.fillRect(0, 0, 512, 128);
    meterInk.fillStyle = "#a7e1cc";
    meterInk.font = "bold 48px monospace";
    meterInk.textAlign = "center";
    meterInk.fillText(`${String(depth).padStart(3, "0")} m BELOW`, 256, 63);
    meterInk.font = "22px monospace";
    meterInk.fillText("LOCAL SERVICE / 00 - 360 - 420", 256, 104);
    meterTexture.needsUpdate = true;
  }
  for (const site of sites) {
    const room = rooms[site];
    batchStatic(room.scenery);
    room.root.position.y = INVESTIGATION_SITES[site].depth;
  }

  let activeSite: InvestigationSite = "market";
  let riding = false;
  let destination: InvestigationSite = "bunker";
  let rideElapsed = 0;
  let rideDuration = 0;
  let rideStart = 0;
  let refugeRequested = false;
  let gateOpening = 0;
  let survivorTime = 0;
  let survivorsWalking = survivors.length;
  function doors(open: number) {
    liftDoors[0]!.position.x = -0.82 - open * 1.63;
    liftDoors[1]!.position.x = 0.82 + open * 1.63;
    // Open leaves retract into the jamb rather than obstruct the adjacent aisle.
    for (const door of liftDoors) door.visible = open < 1;
  }
  function showSite() {
    for (const site of sites) {
      if (site === activeSite) group.add(rooms[site].root);
      else rooms[site].root.removeFromParent();
    }
    if (DEEP_SITES.includes(activeSite)) {
      group.add(cabin);
      cabin.position.y = INVESTIGATION_SITES[activeSite].depth;
      depthReadout(cabin.position.y);
    } else cabin.removeFromParent();
    if (!riding) shaft.removeFromParent();
  }
  function enter(site: InvestigationSite, player: THREE.Vector3) {
    // Main owns portal authorization. An entry request cannot interrupt a ride.
    if (riding) return;
    activeSite = site;
    const spawn = INVESTIGATION_SITES[site].spawn;
    player.set(spawn[0], spawn[1], spawn[2]);
    doors(1);
    showSite();
  }
  function ride(site: InvestigationSite, player: THREE.Vector3): ActionResult {
    if (riding)
      return {
        ok: false,
        message: "The deep lift is already moving. Wait for the cage to stop.",
      };
    const currentIndex = DEEP_SITES.indexOf(activeSite);
    const targetIndex = DEEP_SITES.indexOf(site);
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      Math.abs(currentIndex - targetIndex) !== 1
    ) {
      return {
        ok: false,
        message:
          "This lift serves adjacent landings only: estate, detention, then routing.",
      };
    }
    const point = place(activeSite, "deep-lift").position;
    if (
      !Number.isFinite(player.x) ||
      !Number.isFinite(player.y) ||
      !Number.isFinite(player.z) ||
      Math.hypot(player.x - point[0], player.z - point[2]) > 1.5 ||
      Math.abs(player.y - point[1]) > 0.75
    ) {
      return {
        ok: false,
        message: "Stand at this floor's lift cage before selecting a depth.",
      };
    }
    destination = site;
    rideStart = INVESTIGATION_SITES[activeSite].depth;
    rideDuration = activeSite === "bunker" || site === "bunker" ? 9 : 4;
    rideElapsed = 0;
    riding = true;
    // Center the passenger inside the cage before closing the open cutaway gate.
    player.set(point[0], point[1], point[2]);
    cabin.position.y = point[1];
    rooms[activeSite].root.removeFromParent();
    group.add(shaft);
    doors(0);
    return {
      ok: true,
      message: `Cage secured. Travelling to ${INVESTIGATION_SITES[site].name}.`,
    };
  }
  function touches(footprint: Footprint, x: number, z: number) {
    return (
      Math.abs(x - footprint.x) < footprint.w / 2 + RADIUS &&
      Math.abs(z - footprint.z) < footprint.d / 2 + RADIUS
    );
  }
  function blocked(x: number, z: number): boolean {
    if (
      riding ||
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      x < -12 + RADIUS ||
      x > 12 - RADIUS ||
      z < -10 + RADIUS ||
      z > 10 - RADIUS
    )
      return true;
    for (const obstacle of rooms[activeSite].obstacles)
      if (touches(obstacle, x, z)) return true;
    if (DEEP_SITES.includes(activeSite)) {
      // Cage walls have the same dimensions as their visible geometry.
      if (
        Math.abs(x - liftX) < 1.7 + RADIUS &&
        Math.abs(z - (liftZ - 1.6)) < 0.065 + RADIUS
      )
        return true;
      if (
        Math.abs(z - (liftZ - 0.3)) < 1.3 + RADIUS &&
        (Math.abs(x - (liftX - 1.64)) < 0.05 + RADIUS ||
          Math.abs(x - (liftX + 1.64)) < 0.05 + RADIUS)
      )
        return true;
    }
    if (activeSite === "detention") {
      if (gateOpening < 1)
        for (const gate of gates)
          if (touches(gate.footprint, x, z)) return true;
      for (const survivor of survivors) {
        if (
          Math.abs(x - survivor.body.position.x) < 0.39 + RADIUS &&
          Math.abs(z - survivor.body.position.z) < 0.23 + RADIUS
        )
          return true;
      }
    }
    return false;
  }
  function update(
    delta: number,
    paused: boolean,
    player: THREE.Vector3,
    story: InvestigationState,
  ) {
    if (
      paused ||
      (typeof document !== "undefined" && document.hidden) ||
      !Number.isFinite(delta) ||
      delta <= 0
    )
      return;
    if (riding && group.visible) {
      rideElapsed = Math.min(rideDuration, rideElapsed + delta);
      const t = rideElapsed / rideDuration;
      const eased = t * t * (3 - 2 * t);
      cabin.position.y =
        rideStart +
        (INVESTIGATION_SITES[destination].depth - rideStart) * eased;
      player.set(liftX, cabin.position.y, liftZ);
      depthReadout(cabin.position.y);
      if (t === 1) {
        activeSite = destination;
        riding = false;
        doors(1);
        showSite();
      }
    }
    if (story.refugeOpen) refugeRequested = true;
    if (!refugeRequested || survivorsWalking === 0) return;
    if (gateOpening < 1) {
      gateOpening = Math.min(1, gateOpening + delta / 1.4);
      for (const gate of gates) gate.mesh.position.y = gateOpening * 2.65;
      if (gateOpening === 1) refugeStatus.visible = true;
      return;
    }
    survivorTime += delta;
    const playerInDetention =
      group.visible && !riding && activeSite === "detention";
    for (const survivor of survivors) {
      if (survivor.waypoint >= survivor.route.length) continue;
      const point = survivor.route[survivor.waypoint]!;
      const dx = point[0] - survivor.body.position.x;
      const dz = point[1] - survivor.body.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.025) {
        survivor.waypoint++;
        if (survivor.waypoint === survivor.route.length) {
          survivorsWalking--;
          survivor.body.position.y = 0;
          survivor.body.rotation.y = Math.PI;
          for (const leg of survivor.legs) leg.rotation.x = 0;
        }
        continue;
      }
      const step = Math.min(distance, delta * 1.25);
      const x = survivor.body.position.x + (dx / distance) * step;
      const z = survivor.body.position.z + (dz / distance) * step;
      // Survivors wait rather than walk through the player at a narrow doorway.
      if (playerInDetention && Math.hypot(x - player.x, z - player.z) < 0.76)
        continue;
      let occupied = false;
      for (const other of survivors) {
        if (other === survivor) continue;
        if (
          Math.hypot(x - other.body.position.x, z - other.body.position.z) <
          0.72
        ) {
          occupied = true;
          break;
        }
      }
      if (occupied) continue;
      survivor.body.position.set(
        x,
        Math.sin(survivorTime * 7 + survivor.phase) * 0.015,
        z,
      );
      survivor.body.rotation.y = Math.atan2(dx, dz);
      const swing = Math.sin(survivorTime * 7 + survivor.phase) * 0.3;
      survivor.legs[0]!.rotation.x = swing;
      survivor.legs[1]!.rotation.x = -swing;
    }
  }
  function reset() {
    riding = false;
    activeSite = "market";
    destination = "bunker";
    rideElapsed = 0;
    rideDuration = 0;
    rideStart = 0;
    refugeRequested = false;
    gateOpening = 0;
    survivorTime = 0;
    survivorsWalking = survivors.length;
    refugeStatus.visible = false;
    for (const gate of gates) gate.mesh.position.y = 0;
    for (const survivor of survivors) {
      survivor.waypoint = 0;
      survivor.body.position.set(survivor.startX, 0, survivor.startZ);
      survivor.body.rotation.y = Math.PI / 2;
      for (const leg of survivor.legs) leg.rotation.x = 0;
    }
    cabin.position.y = INVESTIGATION_SITES.bunker.depth;
    shownDepth = -1;
    depthReadout(cabin.position.y);
    doors(1);
    showSite();
  }
  reset();
  return {
    group,
    get site() {
      return activeSite;
    },
    get riding() {
      return riding;
    },
    get places() {
      return riding ? NO_PLACES : INVESTIGATION_PLACES[activeSite];
    },
    enter,
    ride,
    update,
    blocked,
    reset,
  };
}
