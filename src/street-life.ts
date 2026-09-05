import * as THREE from "three";

type Point = readonly [number, number];
type Notice = {
  id: number;
  text: string;
  tone: "warning" | "dispatch";
  source: "drone" | "patrol";
};
export interface StreetLifeStatus {
  notice?: Notice;
  crowdCount: number;
  policeCount: number;
  droneCount: number;
  event: string;
  officerX: number;
  officerZ: number;
  patrolCarX: number;
  patrolCarZ: number;
}
type StreetView = {
  paused: boolean;
  active: boolean;
  playerX: number;
  playerY: number;
  playerZ: number;
  moving: boolean;
};
type Stage =
  | "waiting"
  | "approach"
  | "review"
  | "escort"
  | "boarding"
  | "closing"
  | "departing"
  | "away"
  | "returning";
interface Actor {
  x: number;
  z: number;
  y: number;
  heading: number;
  stride: number;
  walking: number;
  speed: number;
  route: readonly Point[];
  next: number;
  hidden: boolean;
  hands: boolean;
  pushing: boolean;
  lean: number;
  police: boolean;
  color: number;
  armed: boolean;
  progress: number;
  perimeter: number;
  edgeStarts: readonly number[];
  leader?: Actor;
  spacing: number;
  skin: number;
  initial: {
    x: number;
    z: number;
    next: number;
    heading: number;
    stride: number;
    progress: number;
  };
}

/** Ambient street theatre only: this module never reads or mutates the workday. */
export function createStreetLife(options: {
  isBlocked: (x: number, z: number) => boolean;
}) {
  const group = new THREE.Group();
  group.name = "Residents and recognition patrols";
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const materials = {
    cloth: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x202c2e, roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x485858, roughness: 0.76 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x142f33,
      roughness: 0.3,
      metalness: 0.3,
    }),
    teal: new THREE.MeshStandardMaterial({
      color: 0x8eb4aa,
      emissive: 0x477d73,
      emissiveIntensity: 0.6,
    }),
    amber: new THREE.MeshStandardMaterial({
      color: 0xd4ad70,
      emissive: 0xa36e30,
      emissiveIntensity: 0.65,
    }),
    tire: new THREE.MeshStandardMaterial({ color: 0x151b1d, roughness: 1 }),
  };
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function tube(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    material: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(cylinder, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(radius, height, radius);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  let seed = 73109;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const clothes = [
    0x61736f, 0x777769, 0x536166, 0x857761, 0x475753, 0x676673, 0x77665f,
    0x87918a,
  ];
  const skins = [0xa78469, 0x795b49, 0xb89b7e, 0x644c40, 0x967559];
  // Directed sidewalk circuits never cut through a block. Opposite streams use
  // different sidewalks, not reversed copies of the same line.
  // Keep circuit corners outside vehicle turn pockets; lateral avoidance cannot
  // make a waypoint buried in a stopped, rotating vehicle reachable.
  const routes: readonly (readonly Point[])[] = [
    [
      [-10.65, -8.7],
      [-0.7, -8.7],
      [-0.7, -0.65],
      [-10.65, -0.65],
    ],
    [
      [-10.65, 0.65],
      [-0.65, 0.65],
      [-0.65, 8.2],
      [-10.65, 8.2],
    ],
    [
      [0.6, 0.6],
      [10.6, 0.6],
      [10.6, 8.2],
      [0.6, 8.2],
    ],
    [
      [-8.1, 17.1],
      [-1.1, 17.1],
      [-1.1, 41.1],
      [-8.1, 41.1],
    ],
    [
      [1.1, 41.1],
      [8.1, 41.1],
      [8.1, 17.1],
      [1.1, 17.1],
    ],
    [
      [19.05, 25.15],
      [36.2, 25.15],
      [36.2, 38.95],
      [19.05, 38.95],
    ],
    [
      [20, 41.15],
      [37.2, 41.15],
      [37.2, 22.95],
      [20, 22.95],
    ],
  ];
  const routeMetrics = new Map<
    readonly Point[],
    { starts: number[]; perimeter: number }
  >();
  function staticClear(x: number, z: number) {
    return (
      !options.isBlocked(x, z) &&
      !(x > 8.35 && x < 11.65 && z < -1.2 && z > -13.65)
    );
  }
  function measureRoute(route: readonly Point[]) {
    const existing = routeMetrics.get(route);
    if (existing) return existing;
    const starts: number[] = [];
    let perimeter = 0;
    for (let edge = 0; edge < route.length; edge++) {
      const a = route[edge],
        b = route[(edge + 1) % route.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length === 0) throw new Error("Street route has a zero-length edge");
      starts.push(perimeter);
      // Validate whole edges, not just corners/spawns. Fail visibly on changed
      // authored geometry rather than teleporting a roster to one clear corner.
      const samples = Math.ceil(length / 0.1);
      for (let sample = 0; sample <= samples; sample++) {
        const x = a[0] + ((b[0] - a[0]) * sample) / samples;
        const z = a[1] + ((b[1] - a[1]) * sample) / samples;
        if (!staticClear(x, z))
          throw new Error(
            `Street route blocked at (${x.toFixed(2)}, ${z.toFixed(2)})`,
          );
      }
      perimeter += length;
    }
    const metrics = { starts, perimeter };
    routeMetrics.set(route, metrics);
    return metrics;
  }
  const actors: Actor[] = [];
  function addActor(
    route: readonly Point[],
    speed: number,
    phase: number,
    police = false,
  ) {
    const { starts: edgeStarts, perimeter } = measureRoute(route);
    let distance = phase * perimeter;
    let edge = 0;
    for (; edge < route.length - 1; edge++) {
      const a = route[edge],
        b = route[edge + 1];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (distance < length) break;
      distance -= length;
    }
    const a = route[edge],
      b = route[(edge + 1) % route.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const x = a[0] + ((b[0] - a[0]) * distance) / length;
    const z = a[1] + ((b[1] - a[1]) * distance) / length;
    const heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const stride = random() * Math.PI * 2;
    const actor: Actor = {
      x,
      z,
      y: 0,
      heading,
      stride,
      walking: 0,
      speed,
      route,
      next: (edge + 1) % route.length,
      hidden: false,
      hands: false,
      pushing: false,
      lean: 0,
      police,
      armed: false,
      progress: phase * perimeter,
      perimeter,
      edgeStarts,
      spacing: 0,
      color: police ? 0x293b3f : clothes[Math.floor(random() * clothes.length)],
      skin: skins[Math.floor(random() * skins.length)],
      initial: {
        x,
        z,
        next: (edge + 1) % route.length,
        heading,
        stride,
        progress: phase * perimeter,
      },
    };
    actors.push(actor);
    return actor;
  }
  function populate(
    route: readonly Point[],
    count: number,
    speed: number,
    police = false,
  ) {
    const roster: Actor[] = [];
    for (let i = 0; i < count; i++)
      roster.push(addActor(route, speed, (i + 0.5) / count, police));
    for (let i = 0; i < count; i++) {
      roster[i].leader = roster[(i + 1) % count];
      roster[i].spacing = roster[i].perimeter / count;
    }
    return roster;
  }
  // 40 civic residents (24 walkers + 8 service queues + 8 custody roster),
  // 36 south residents, 36 public-compound residents: still exactly 112.
  for (let i = 0; i < routes.length; i++)
    populate(routes[i], i < 3 ? 8 : 18, 0.62);
  // Two slow, circulating service queues, with clear space around the terminals.
  const queues: readonly (readonly Point[])[] = [
    [
      [5.1, 7.25],
      [8.15, 7.25],
      [8.15, 7.95],
      [5.1, 7.95],
    ],
    [
      [9.25, 3.35],
      [10.4, 3.35],
      [10.4, 6.55],
      [9.25, 6.55],
    ],
  ];
  for (const route of queues) populate(route, 4, 0.16);
  const custodyRoute: readonly Point[] = [
    [12.8, 0.85],
    [14.65, 0.85],
    [14.65, 3.8],
    [12.8, 3.8],
  ];
  const candidates = populate(custodyRoute, 8, 0.4);
  const civilianCount = actors.length;
  const patrols: Actor[] = [];
  for (let pair = 0; pair < 3; pair++)
    patrols.push(...populate(routes[pair], 2, 0.62, true));
  const compoundPatrol: readonly Point[] = [
    // Four existing officers cover the bunker-side public sidewalk. The ends
    // stop short of the car's Z24/Z40 turns rather than sharing their corners.
    [41.15, 26],
    [41.65, 26],
    [41.65, 36.5],
    [41.15, 36.5],
  ];
  const guards = populate(compoundPatrol, 4, 0.62, true);
  for (const guard of guards) guard.armed = true;
  patrols.push(...guards);
  const custodyPatrol: readonly Point[] = [
    [12.65, 1.15],
    [14.8, 1.15],
    [14.8, 4.3],
    [12.65, 4.3],
  ];
  const escorts = [
    addActor(custodyPatrol, 0.4, 0.32, true),
    addActor(custodyPatrol, 0.4, 0.39, true),
  ];
  patrols.push(...escorts);
  const actorParts = Array.from({ length: 11 }, (_, i) => {
    const mesh = new THREE.InstancedMesh(
      cube,
      i === 8 ? materials.teal : i === 9 ? materials.amber : materials.cloth,
      i < 7 ? actors.length : patrols.length,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    // Actors traverse the district; a stale initial instance bound must not cull them.
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });
  const rifles = Array.from({ length: 3 }, () => {
    const mesh = new THREE.InstancedMesh(cube, materials.dark, guards.length);
    mesh.name = "Owner guard low-ready rifle";
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });
  const color = new THREE.Color();
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    for (let part = 0; part < actorParts.length; part++) {
      if (part >= 7 && !actor.police) continue;
      const tint =
        part === 1
          ? actor.skin
          : part === 2 || part === 3 || part === 6 || part === 7 || part === 10
            ? 0x283336
            : actor.color;
      actorParts[part].setColorAt(
        part < 7 ? i : i - civilianCount,
        color.setHex(part === 8 || part === 9 ? 0xffffff : tint),
      );
    }
  }
  const rootMatrix = new THREE.Matrix4();
  const partMatrix = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const contactGeometry = new THREE.CircleGeometry(1, 12);
  const contactMaterial = new THREE.MeshBasicMaterial({
    color: 0x102125,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const contacts = new THREE.InstancedMesh(
    contactGeometry,
    contactMaterial,
    actors.length,
  );
  contacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  contacts.frustumCulled = false;
  group.add(contacts);
  const contactRotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  function renderPart(
    actor: number,
    index: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    rz = 0,
  ) {
    partMatrix.compose(
      position.set(x, y, z),
      rotation.setFromEuler(euler.set(rx, 0, rz)),
      scale.set(w, h, d),
    );
    matrix.multiplyMatrices(rootMatrix, partMatrix);
    actorParts[index].setMatrixAt(
      index < 7 ? actor : actor - civilianCount,
      matrix,
    );
  }
  function renderActors() {
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      matrix
        .makeScale(a.hidden ? 0 : 0.38, a.hidden ? 0 : 0.25, 1)
        .premultiply(contactRotation);
      matrix.setPosition(a.x, 0.065, a.z);
      contacts.setMatrixAt(i, matrix);
      const gait = Math.sin(a.stride) * a.walking;
      rootMatrix.compose(
        position.set(a.x, a.y, a.z),
        rotation.setFromEuler(euler.set(a.lean, a.heading, 0, "YXZ")),
        scale.setScalar(a.hidden ? 0 : 1),
      );
      const bob = Math.abs(gait) * 0.018;
      renderPart(i, 0, 0, 0.79 + bob, 0, 0.42, 0.55, 0.29);
      renderPart(i, 1, 0, 1.19 + bob, 0, 0.25, 0.28, 0.25);
      renderPart(
        i,
        2,
        -0.12,
        0.28,
        gait * 0.095,
        0.15,
        0.48,
        0.19,
        gait * 0.38,
      );
      renderPart(
        i,
        3,
        0.12,
        0.28,
        -gait * 0.095,
        0.15,
        0.48,
        0.19,
        -gait * 0.38,
      );
      renderPart(
        i,
        4,
        -0.28,
        a.hands ? 1.2 : a.pushing ? 1 : a.armed ? 0.78 : 0.79,
        a.pushing ? 0.22 : a.armed ? 0.17 : 0,
        0.12,
        0.47,
        0.15,
        a.pushing ? Math.PI / 2 : a.armed ? -0.65 : -gait * 0.25,
        a.hands ? -2.65 : 0,
      );
      renderPart(
        i,
        5,
        0.28,
        a.hands ? 1.2 : a.pushing ? 1 : a.armed ? 0.78 : 0.79,
        a.pushing ? 0.22 : a.armed ? 0.17 : 0,
        0.12,
        0.47,
        0.15,
        a.pushing ? Math.PI / 2 : a.armed ? -0.65 : gait * 0.25,
        a.hands ? 2.65 : 0,
      );
      renderPart(
        i,
        6,
        0,
        1.36 + bob,
        0,
        a.police ? 0.34 : 0.28,
        a.police ? 0.16 : 0.075,
        0.29,
      );
      if (!a.police) continue;
      renderPart(
        i,
        7,
        0,
        a.police ? 1.32 : 0,
        0.17,
        a.police ? 0.34 : 0,
        0.045,
        0.13,
      );
      renderPart(i, 8, -0.245, 1.005, 0, a.police ? 0.12 : 0, 0.075, 0.31);
      renderPart(i, 9, 0.245, 1.005, 0, a.police ? 0.12 : 0, 0.075, 0.31);
      renderPart(i, 10, 0, 0.55, 0, a.police ? 0.44 : 0, 0.085, 0.32);
      if (a.armed) {
        const guardIndex = guards.indexOf(a);
        // Stock, receiver, and long barrel: held across the waist, muzzle down.
        for (let part = 0; part < rifles.length; part++) {
          partMatrix.compose(
            position.set(
              part === 0 ? -0.23 : part === 1 ? 0.02 : 0.29,
              part === 0 ? 0.77 : part === 1 ? 0.7 : 0.6,
              0.3,
            ),
            rotation.setFromEuler(euler.set(0, 0, -0.3)),
            scale.set(
              part === 0 ? 0.22 : part === 1 ? 0.34 : 0.32,
              part === 0 ? 0.13 : part === 1 ? 0.11 : 0.045,
              0.07,
            ),
          );
          matrix.multiplyMatrices(rootMatrix, partMatrix);
          rifles[part].setMatrixAt(guardIndex, matrix);
        }
      }
    }
    for (const part of actorParts) part.instanceMatrix.needsUpdate = true;
    for (const rifle of rifles) rifle.instanceMatrix.needsUpdate = true;
    contacts.instanceMatrix.needsUpdate = true;
  }

  const van = new THREE.Group();
  van.name = "Recognition custody transport";
  group.add(van);
  const vanX = 13.7,
    parkedZ = 7.1,
    awayZ = 54;
  van.position.set(vanX, 0, parkedZ);
  box(van, 0, 0.39, 0, 1.5, 0.2, 3.1, materials.dark);
  box(van, 0, 1.69, -0.1, 1.55, 0.18, 2.95, materials.metal);
  box(van, -0.71, 1.02, -0.4, 0.12, 1.2, 2.3, materials.metal);
  box(van, 0.71, 1.02, -0.4, 0.12, 1.2, 2.3, materials.metal);
  box(van, 0, 0.78, 1.02, 1.5, 0.58, 1.05, materials.metal);
  box(van, 0, 1.34, 1.3, 1.3, 0.45, 0.075, materials.glass);
  box(van, 0, 1.16, 0.57, 1.36, 0.95, 0.1, materials.dark);
  box(van, 0, 0.43, -1.63, 1.4, 0.12, 0.28, materials.dark);
  box(van, 0, 0.48, 1.6, 1.6, 0.16, 0.12, materials.dark);
  for (const x of [-0.53, 0.53])
    box(van, x, 0.88, 1.56, 0.23, 0.16, 0.045, materials.amber);
  const wheels: THREE.Mesh[] = [];
  for (const x of [-0.78, 0.78]) {
    for (const z of [-0.97, 1.03]) {
      const wheel = tube(van, x, 0.31, z, 0.3, 0.16, materials.tire);
      wheel.rotation.z = Math.PI / 2;
      wheels.push(wheel);
      const hub = tube(van, x * 1.025, 0.31, z, 0.13, 0.17, materials.metal);
      hub.rotation.z = Math.PI / 2;
    }
    box(van, x, 1.12, -0.55, 0.025, 0.09, 1.45, materials.teal);
    // The invented owner-disc / chevron appears on both side panels.
    const disc = tube(
      van,
      x * 1.012,
      1.38,
      -0.45,
      0.13,
      0.025,
      materials.amber,
    );
    disc.rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) {
      const stroke = box(
        van,
        x * 1.015,
        0.98,
        -0.45 + side * 0.13,
        0.03,
        0.34,
        0.07,
        materials.amber,
      );
      stroke.rotation.x = side * 0.45;
    }
  }
  const doors = [-1, 1].map((side) => {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.73, 0, -1.55);
    van.add(hinge);
    box(hinge, -side * 0.355, 1.05, 0, 0.7, 1.2, 0.09, materials.metal);
    box(hinge, -side * 0.355, 1.31, -0.055, 0.44, 0.24, 0.035, materials.glass);
    box(hinge, -side * 0.6, 0.94, -0.065, 0.045, 0.17, 0.045, materials.amber);
    return hinge;
  });
  box(van, 0, 1.84, 0.45, 1.06, 0.1, 0.3, materials.dark);
  const beacons = [-1, 1].map((side) =>
    box(
      van,
      side * 0.34,
      1.95,
      0.45,
      0.29,
      0.15,
      0.23,
      side < 0 ? materials.teal : materials.amber,
    ),
  );
  const patrolCar = new THREE.Group();
  patrolCar.name = "Meridian compliance patrol car";
  group.add(patrolCar);
  for (const vehicle of [van, patrolCar]) {
    const contact = new THREE.Mesh(contactGeometry, contactMaterial);
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.065;
    contact.scale.set(0.9, 1.9, 1);
    vehicle.add(contact);
  }
  // The east lane and west spur avoid turning across resident sidewalk circuits.
  // The custody van retains its separate X13.7 service lane.
  const carRoute: readonly Point[] = [
    [-10, 16],
    [11.2, 16],
    [11.2, 24],
    [40, 24],
    [40, 40],
    [11.2, 40],
    [11.2, 16],
  ];
  let carNext = 1;
  patrolCar.position.set(-10, 0, 16);
  patrolCar.rotation.y = Math.PI / 2;
  box(patrolCar, 0, 0.48, 0, 1.45, 0.48, 3.2, materials.dark);
  box(patrolCar, 0, 0.77, 0.95, 1.4, 0.2, 1.15, materials.metal);
  box(patrolCar, 0, 0.79, -1.13, 1.4, 0.18, 0.72, materials.metal);
  box(patrolCar, 0, 1.03, -0.15, 1.28, 0.5, 1.58, materials.glass);
  box(patrolCar, 0, 1.32, -0.15, 1.35, 0.12, 1.68, materials.metal);
  for (const side of [-1, 1]) {
    box(
      patrolCar,
      side * 0.735,
      0.65,
      -0.05,
      0.035,
      0.14,
      2.65,
      materials.teal,
    );
    box(patrolCar, side * 0.49, 0.66, 1.62, 0.3, 0.15, 0.06, materials.amber);
    box(patrolCar, side * 0.49, 0.62, -1.62, 0.26, 0.13, 0.06, materials.teal);
    box(
      patrolCar,
      side * 0.72,
      0.94,
      -0.07,
      0.035,
      0.3,
      0.3,
      materials.teal,
    ).rotation.x = Math.PI / 4;
  }
  box(patrolCar, 0, 1.43, -0.15, 1.15, 0.09, 0.3, materials.dark);
  const carBeacons = [-1, 1].map((side) =>
    box(
      patrolCar,
      side * 0.35,
      1.51,
      -0.15,
      0.42,
      0.13,
      0.25,
      side < 0 ? materials.teal : materials.amber,
    ),
  );
  const carWheels: THREE.Mesh[] = [];
  for (const x of [-0.76, 0.76])
    for (const z of [-1.05, 1.05]) {
      const wheel = tube(patrolCar, x, 0.31, z, 0.31, 0.19, materials.tire);
      wheel.rotation.z = Math.PI / 2;
      carWheels.push(wheel);
    }
  function blocked(x: number, z: number) {
    const dx = x - patrolCar.position.x,
      dz = z - patrolCar.position.z;
    const sin = Math.sin(patrolCar.rotation.y),
      cos = Math.cos(patrolCar.rotation.y);
    return (
      (van.visible &&
        Math.abs(x - vanX) < 1.03 &&
        Math.abs(z - van.position.z) < 1.93) ||
      (Math.abs(dx * cos - dz * sin) < 1.1 &&
        Math.abs(dx * sin + dz * cos) < 1.88)
    );
  }

  const coneGeometry = new THREE.ConeGeometry(1, 1, 20, 1, true);
  const coneMaterial = new THREE.MeshBasicMaterial({
    color: 0x83b7ac,
    transparent: true,
    opacity: 0.045,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringGeometry = new THREE.RingGeometry(0.94, 1, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x7fa99e,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const droneHomes: readonly Point[] = [
    [-10, -5.5],
    [-1, 7],
    [10, 4.5],
    [-5, -8],
    [0, 28],
    [30, 32],
    [40, 22],
  ];
  const drones = droneHomes.map(([x, z], index) => {
    const rig = new THREE.Group();
    rig.position.set(x, 0, z);
    const body = new THREE.Group();
    body.position.y = 3.8;
    rig.add(body);
    box(body, 0, 0, 0, 0.62, 0.2, 0.42, materials.dark);
    box(body, 0, 0.12, 0, 0.34, 0.08, 0.3, materials.teal);
    const rotors: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      box(body, side * 0.44, 0, 0, 0.5, 0.08, 0.09, materials.metal);
      const rotor = box(
        body,
        side * 0.63,
        0.08,
        0,
        0.63,
        0.025,
        0.1,
        materials.dark,
      );
      rotors.push(rotor);
    }
    const head = new THREE.Group();
    head.position.y = -0.21;
    body.add(head);
    box(head, 0, 0, 0, 0.29, 0.22, 0.28, materials.metal);
    box(head, 0, -0.02, 0.16, 0.18, 0.09, 0.04, materials.teal);
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.y = 1.78;
    cone.scale.set(1.1, 3.55, 1.1);
    rig.add(cone);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.075 + index * 0.001;
    ring.scale.setScalar(1.1);
    rig.add(ring);
    group.add(rig);
    return { rig, body, head, rotors, cone, ring, homeX: x, homeZ: z };
  });
  const cameraLocations: readonly Point[] = [
    [-11.4, -8.8],
    [-1.3, -9],
    [-11.35, 1.1],
    [1.2, -1.15],
    [10.9, 1.2],
    [-11.3, 9.1],
    [1.25, 9.2],
    [10.9, 9.2],
    [-9, 13.5],
    [14.7, 4.5],
    [-11.3, 25.2],
    [1.3, 33.2],
    [21.3, 25.2],
    [31.3, 33.2],
    [41.3, 41.2],
  ];
  const cameras = cameraLocations.map(([x, z], index) => {
    const pole = new THREE.Group();
    pole.position.set(x, 0, z);
    tube(pole, 0, 1.7, 0, 0.048, 3.4, materials.dark);
    box(pole, 0, 0.23, 0, 0.23, 0.46, 0.23, materials.metal);
    box(pole, 0.17, 3.35, 0, 0.39, 0.09, 0.1, materials.dark);
    const swivel = new THREE.Group();
    swivel.position.set(0.32, 3.26, 0);
    swivel.rotation.y = index * 0.7;
    const housing = box(swivel, 0, 0, 0.13, 0.22, 0.2, 0.46, materials.metal);
    housing.rotation.x = 0.25;
    box(swivel, 0, -0.055, 0.365, 0.14, 0.095, 0.045, materials.teal);
    box(swivel, 0.08, 0.12, 0.13, 0.035, 0.035, 0.035, materials.amber);
    pole.add(swivel);
    group.add(pole);
    return swivel;
  });

  // One bounded, seeded roster: each of eight residents is transported once.
  const waits = candidates.map((_, i) =>
    i === 0 ? 32 : 27 + Math.floor(random() * 17),
  );
  let time = 0;
  let stage: Stage = "waiting";
  let stageTime = 0;
  let arrestIndex = 0;
  let detainee: Actor | undefined;
  let idleTime = 0;
  let warningCooldown = 0;
  let droneAttention = 0;
  let attentionDrone = 0;
  let noticeId = 0;
  let doorOpen = 0;
  const notices: Notice[] = [];
  const status: Record<Stage, string> = {
    waiting: "Recognition patrols circulating",
    approach: "Compliance stop in the east service lane",
    review: "Resident held for recognition review",
    escort: "Resident being escorted to custody transport",
    boarding: "Custody boarding — rear access open",
    closing: "Custody transport securing rear doors",
    departing: "Custody transport departing",
    away: "Custody transport off district",
    returning: "Custody transport returning to the east lane",
  };
  function notify(
    text: string,
    tone: Notice["tone"] = "dispatch",
    source: Notice["source"] = "patrol",
  ) {
    notices.push({ id: ++noticeId, text, tone, source });
  }
  function transition(next: Stage) {
    stage = next;
    stageTime = 0;
  }
  function clearAt(x: number, z: number, ignoreVan = false) {
    return staticClear(x, z) && (ignoreVan || !blocked(x, z));
  }
  function tryActorStep(
    a: Actor,
    sx: number,
    sz: number,
    step: number,
    view: StreetView,
    playerDistance: number,
    ignoreVan: boolean,
  ) {
    const nx = a.x + sx * step,
      nz = a.z + sz * step;
    if (!clearAt(nx, nz, ignoreVan)) return false;
    if (
      view.playerY < 0.8 &&
      Math.hypot(nx - view.playerX, nz - view.playerZ) <
        Math.min(0.6, playerDistance)
    )
      return false;
    a.x = nx;
    a.z = nz;
    return true;
  }
  function moveTo(
    a: Actor,
    tx: number,
    tz: number,
    speed: number,
    dt: number,
    view: StreetView,
    ignoreVan = false,
  ) {
    const dx = tx - a.x,
      dz = tz - a.z;
    const distance = Math.hypot(dx, dz);
    a.walking = 0;
    if (distance < 0.001) return true;
    const vx = dx / distance,
      vz = dz / distance;
    const step = Math.min(speed * dt, distance);
    const oldX = a.x,
      oldZ = a.z;
    const playerDistance = Math.hypot(a.x - view.playerX, a.z - view.playerZ);
    // Crossing residents stop outside the car's side clearance while a car
    // already crossing clears them. Cars stop farther ahead than this actor
    // front clearance, so residents can finish crossing in front of a yielding
    // vehicle. No reciprocal repulsion, detour phase jumps or waiting cycles.
    if (
      !tryActorStep(a, vx, vz, step, view, playerDistance, ignoreVan) &&
      !blocked(a.x + vx * step, a.z + vz * step)
    ) {
      const side = a.initial.stride > Math.PI ? 1 : -1;
      const sx = vz * side,
        sz = -vx * side;
      if (
        !tryActorStep(
          a,
          (vx + sx) * Math.SQRT1_2,
          (vz + sz) * Math.SQRT1_2,
          step,
          view,
          playerDistance,
          ignoreVan,
        ) &&
        !tryActorStep(a, sx, sz, step, view, playerDistance, ignoreVan) &&
        !tryActorStep(
          a,
          (vx - sx) * Math.SQRT1_2,
          (vz - sz) * Math.SQRT1_2,
          step,
          view,
          playerDistance,
          ignoreVan,
        )
      )
        tryActorStep(a, -sx, -sz, step, view, playerDistance, ignoreVan);
    }
    const moved = Math.hypot(a.x - oldX, a.z - oldZ);
    if (moved > 0.00001) {
      a.heading = Math.atan2(a.x - oldX, a.z - oldZ);
      a.stride += moved * 8.5;
      a.walking = Math.min(1, moved / Math.max(dt * 0.45, 0.0001));
    }
    return Math.hypot(tx - a.x, tz - a.z) < 0.001;
  }
  function followRoute(a: Actor, dt: number, view: StreetView) {
    const target = a.route[a.next];
    let speed = a.speed;
    const leader = a.leader;
    if (leader && !leader.hidden && leader !== detainee) {
      const gap = (leader.progress - a.progress + a.perimeter) % a.perimeter;
      const minimumGap = Math.min(2, a.spacing * 0.55);
      speed *= Math.max(
        0,
        Math.min(1.2, (gap - minimumGap) / (a.spacing - minimumGap)),
      );
    }
    if (moveTo(a, target[0], target[1], speed, dt, view))
      a.next = (a.next + 1) % a.route.length;
    const edge = (a.next + a.route.length - 1) % a.route.length;
    const start = a.route[edge],
      end = a.route[a.next];
    const dx = end[0] - start[0],
      dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    a.progress =
      (a.edgeStarts[edge] +
        Math.max(
          0,
          Math.min(
            length,
            ((a.x - start[0]) * dx + (a.z - start[1]) * dz) / length,
          ),
        )) %
      a.perimeter;
  }
  function advanceEvent(dt: number, view: StreetView) {
    stageTime += dt;
    if (stage === "waiting") {
      if (arrestIndex < candidates.length && stageTime >= waits[arrestIndex]) {
        detainee = candidates[arrestIndex];
        detainee.hands = true;
        detainee.walking = 0;
        transition("approach");
        notify(
          "Compliance patrol: resident held for recognition review.",
          "warning",
        );
      }
    } else if (stage === "approach" && detainee) {
      const left = moveTo(
        escorts[0],
        detainee.x - 0.62,
        detainee.z - 0.12,
        0.9,
        dt,
        view,
      );
      const right = moveTo(
        escorts[1],
        detainee.x + 0.62,
        detainee.z - 0.12,
        0.9,
        dt,
        view,
      );
      if (left && right && stageTime > 2) transition("review");
    } else if (stage === "review" && detainee) {
      for (const officer of escorts) {
        officer.walking = 0;
        officer.heading = Math.atan2(
          detainee.x - officer.x,
          detainee.z - officer.z,
        );
      }
      if (stageTime >= 3.5) {
        detainee.hands = false;
        transition("escort");
        notify(
          "Patrol dispatch: recognition unresolved. Escorting resident to transport.",
        );
      }
    } else if (stage === "escort" && detainee) {
      const arrived = moveTo(detainee, vanX, parkedZ - 2.15, 0.57, dt, view);
      moveTo(escorts[0], detainee.x - 0.63, detainee.z - 0.35, 0.78, dt, view);
      moveTo(escorts[1], detainee.x + 0.63, detainee.z - 0.35, 0.78, dt, view);
      doorOpen = Math.min(1, doorOpen + dt * 0.7);
      if (arrived && doorOpen >= 1) {
        transition("boarding");
        notify(
          "Custody transport: rear cabin open. Resident ordered aboard.",
          "warning",
        );
      }
    } else if (stage === "boarding" && detainee) {
      // The resident crosses the threshold and remains rendered until inside the opaque cabin.
      detainee.lean = stageTime > 0.5 && stageTime < 1.1 ? 0.13 : 0;
      escorts[0].pushing = stageTime > 0.5 && stageTime < 1.1;
      detainee.y = Math.min(
        0.22,
        Math.max(0, detainee.z - (parkedZ - 1.8)) * 0.5,
      );
      const inside = moveTo(
        detainee,
        vanX,
        parkedZ - 0.25,
        0.72,
        dt,
        view,
        true,
      );
      moveTo(escorts[0], vanX - 0.63, parkedZ - 2.05, 0.7, dt, view);
      moveTo(escorts[1], vanX + 0.63, parkedZ - 2.05, 0.7, dt, view);
      if (escorts[0].pushing)
        escorts[0].heading = Math.atan2(
          detainee.x - escorts[0].x,
          detainee.z - escorts[0].z,
        );
      if (inside) {
        detainee.hidden = true;
        detainee.walking = 0;
        detainee.lean = 0;
        escorts[0].pushing = false;
        transition("closing");
      }
    } else if (stage === "closing") {
      doorOpen = Math.max(0, doorOpen - dt * 0.75);
      if (doorOpen === 0 && stageTime > 1.5) transition("departing");
    } else if (stage === "departing") {
      moveVan(awayZ, dt, view);
      if (van.position.z >= awayZ) {
        van.visible = false;
        transition("away");
        notify("Custody transport departed. The queue closes behind them.");
      }
    } else if (stage === "away" && stageTime >= 10) {
      van.visible = true;
      transition("returning");
    } else if (stage === "returning") {
      moveVan(parkedZ, dt, view);
      if (van.position.z <= parkedZ) {
        arrestIndex++;
        detainee = undefined;
        transition("waiting");
        notify("Patrol dispatch: custody vehicle back on district standby.");
      }
    }
  }
  function moveVan(targetZ: number, dt: number, view: StreetView) {
    const direction = Math.sign(targetZ - van.position.z);
    const step = Math.min(Math.abs(targetZ - van.position.z), dt * 1.85);
    const nextZ = van.position.z + direction * step;
    // Ambient transport never runs over the player; the side lane remains bypassable.
    if (
      view.playerY < 2 &&
      Math.abs(view.playerX - vanX) < 1.1 &&
      Math.abs(view.playerZ - nextZ) < 2.2
    )
      return;
    if (
      Math.abs(patrolCar.position.x - vanX) < 1.9 &&
      Math.abs(patrolCar.position.z - nextZ) < 3.2
    )
      return;
    for (const actor of actors) {
      if (
        !actor.hidden &&
        Math.abs(actor.x - vanX) < 1 &&
        Math.abs(actor.z - nextZ) < 1.9
      )
        return;
    }
    van.position.z = nextZ;
    for (const wheel of wheels) wheel.rotation.x += (direction * step) / 0.3;
  }
  function movePatrolCar(dt: number, view: StreetView) {
    const p = patrolCar.position,
      target = carRoute[carNext];
    const dx = target[0] - p.x,
      dz = target[1] - p.z,
      distance = Math.hypot(dx, dz);
    if (distance < 0.04) {
      carNext = (carNext + 1) % carRoute.length;
      return;
    }
    const heading = Math.atan2(dx, dz);
    const turn = Math.atan2(
      Math.sin(heading - patrolCar.rotation.y),
      Math.cos(heading - patrolCar.rotation.y),
    );
    // Finish a collision-checked turn before translating down a sidewalk.
    // Otherwise a blocked translation also freezes a diagonal vehicle angle.
    const step = Math.abs(turn) > 0.001 ? 0 : Math.min(distance, dt * 2.1);
    const nx = p.x + (dx / distance) * step,
      nz = p.z + (dz / distance) * step;
    if (
      view.playerY < 2 &&
      Math.hypot(view.playerX - nx, view.playerZ - nz) < 2.3
    )
      return;
    // Let a vehicle already in the service crossing clear it before the other enters.
    if (
      van.visible &&
      Math.abs(p.x - vanX) >= 1.9 &&
      Math.abs(nx - vanX) < 2.4 &&
      Math.abs(nz - van.position.z) < 3.2
    )
      return;
    const rotation =
      Math.abs(turn) <= 0.001
        ? heading
        : patrolCar.rotation.y +
          Math.sign(turn) * Math.min(Math.abs(turn), dt * 2);
    const sin = Math.sin(rotation),
      cos = Math.cos(rotation);
    for (const actor of actors) {
      const ax = actor.x - nx,
        az = actor.z - nz;
      if (
        !actor.hidden &&
        Math.abs(ax * cos - az * sin) < 1.03 &&
        Math.abs(ax * sin + az * cos) < 1.9
      )
        return;
    }
    p.set(nx, 0, nz);
    patrolCar.rotation.y = rotation;
    for (const wheel of carWheels) wheel.rotation.x += step / 0.31;
  }
  function animateHardware(dt: number, view: StreetView) {
    warningCooldown = Math.max(0, warningCooldown - dt);
    droneAttention = Math.max(0, droneAttention - dt);
    const inStreet =
      view.playerY < 0.65 &&
      (Math.abs(view.playerX + 10) < 1.6 ||
        Math.abs(view.playerX) < 1.6 ||
        Math.abs(view.playerX - 10) < 1.6 ||
        Math.abs(view.playerZ + 8) < 1.6 ||
        Math.abs(view.playerZ) < 1.6 ||
        Math.abs(view.playerZ - 8) < 1.6 ||
        view.playerX > 12.3);
    if (view.moving || !inStreet) idleTime = 0;
    else idleTime += dt;
    if (idleTime >= 10 && warningCooldown === 0) {
      idleTime = 0;
      warningCooldown = 38;
      droneAttention = 8;
      let nearest = Infinity;
      for (let i = 0; i < drones.length; i++) {
        const distance = Math.hypot(
          drones[i].rig.position.x - view.playerX,
          drones[i].rig.position.z - view.playerZ,
        );
        if (distance < nearest) {
          nearest = distance;
          attentionDrone = i;
        }
      }
      notify(
        "Municipal drone: prolonged stationary presence recorded. Move along, resident. Keep the service lane clear.",
        "warning",
        "drone",
      );
    }
    for (let i = 0; i < drones.length; i++) {
      const drone = drones[i];
      const attending = i === attentionDrone && droneAttention > 0;
      let tx = attending
        ? view.playerX + 0.8
        : drone.homeX + Math.sin(time * 0.13 + i * 1.8) * 1.5;
      let tz = attending
        ? view.playerZ + 0.6
        : drone.homeZ + Math.cos(time * 0.17 + i) * 0.8;
      if (attending && options.isBlocked(tx, tz)) {
        tx = view.playerX;
        tz = view.playerZ;
      }
      const dx = tx - drone.rig.position.x,
        dz = tz - drone.rig.position.z;
      const distance = Math.hypot(dx, dz);
      const transit = distance > 2;
      const altitude =
        (transit ? 6.5 : 3.85) + Math.sin(time * 1.8 + i * 2) * 0.12;
      drone.body.position.y += Math.max(
        -dt * 2.5,
        Math.min(dt * 2.5, altitude - drone.body.position.y),
      );
      const step = Math.min(distance, dt * (attending ? 3.8 : 0.9));
      // Rise above the district rooftops before crossing a block to investigate.
      if (distance > 0.001 && (!transit || drone.body.position.y > 6.2)) {
        drone.rig.position.x += (dx / distance) * step;
        drone.rig.position.z += (dz / distance) * step;
      }
      drone.head.rotation.y = attending
        ? Math.atan2(
            view.playerX - drone.rig.position.x,
            view.playerZ - drone.rig.position.z,
          )
        : time * 0.55 + i;
      drone.head.rotation.x = attending ? 0.55 : 0.25;
      for (const rotor of drone.rotors) rotor.rotation.y = time * 31 + i;
      drone.cone.scale.y = drone.body.position.y - 0.25;
      drone.cone.position.y = drone.cone.scale.y / 2 + 0.055;
      drone.ring.rotation.z = time * 0.22 + i;
    }
    for (let i = 0; i < cameras.length; i++)
      cameras[i].rotation.y =
        i * 0.7 + Math.sin(time * (0.27 + i * 0.013) + i) * 1.1;
    doors[0].rotation.y = doorOpen * 1.8;
    doors[1].rotation.y = -doorOpen * 1.8;
    for (let i = 0; i < beacons.length; i++)
      beacons[i].scale.y =
        0.12 + (Math.sin(time * 8 + i * Math.PI) > 0 ? 0.07 : 0);
  }
  function snapshot(notice?: Notice): StreetLifeStatus {
    let crowdCount = 0;
    for (let i = 0; i < civilianCount; i++) if (!actors[i].hidden) crowdCount++;
    return {
      notice,
      crowdCount,
      policeCount: patrols.length,
      droneCount: drones.length,
      officerX: patrols[0].x,
      officerZ: patrols[0].z,
      patrolCarX: patrolCar.position.x,
      patrolCarZ: patrolCar.position.z,
      event:
        arrestIndex === candidates.length && stage === "waiting"
          ? "Transport roster closed; recognition patrols remain active"
          : status[stage],
    };
  }
  function update(seconds: number, view: StreetView): StreetLifeStatus {
    if (
      view.paused ||
      !view.active ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      return snapshot();
    let remaining = seconds;
    while (remaining > 0) {
      const dt = Math.min(remaining, 0.05);
      remaining -= dt;
      time += dt;
      const escorting =
        stage === "approach" ||
        stage === "review" ||
        stage === "escort" ||
        stage === "boarding" ||
        stage === "closing";
      for (const actor of actors) {
        if (
          actor.hidden ||
          actor === detainee ||
          (escorting && (actor === escorts[0] || actor === escorts[1]))
        )
          continue;
        followRoute(actor, dt, view);
      }
      advanceEvent(dt, view);
      movePatrolCar(dt, view);
      for (let i = 0; i < carBeacons.length; i++)
        carBeacons[i].scale.y =
          0.1 + 0.06 * (1 + Math.sin(time * 3 + i * Math.PI));
      animateHardware(dt, view);
    }
    renderActors();
    return snapshot(notices.shift());
  }
  function reset() {
    time = 0;
    stage = "waiting";
    stageTime = 0;
    arrestIndex = 0;
    detainee = undefined;
    idleTime = 0;
    warningCooldown = 0;
    droneAttention = 0;
    attentionDrone = 0;
    noticeId = 0;
    doorOpen = 0;
    carNext = 1;
    patrolCar.position.set(-10, 0, 16);
    patrolCar.rotation.y = Math.PI / 2;
    for (const wheel of carWheels) wheel.rotation.x = 0;
    notices.length = 0;
    for (const actor of actors) {
      Object.assign(actor, actor.initial);
      actor.y = 0;
      actor.walking = 0;
      actor.hidden = false;
      actor.hands = false;
      actor.pushing = false;
      actor.lean = 0;
    }
    van.position.set(vanX, 0, parkedZ);
    van.visible = true;
    for (const wheel of wheels) wheel.rotation.x = 0;
    for (const door of doors) door.rotation.y = 0;
    for (let i = 0; i < drones.length; i++) {
      const drone = drones[i];
      drone.rig.position.set(drone.homeX, 0, drone.homeZ);
      drone.body.position.y = 3.85 + Math.sin(i * 2) * 0.12;
      drone.head.rotation.set(0.25, i, 0);
      for (const rotor of drone.rotors) rotor.rotation.y = i;
      drone.cone.scale.y = drone.body.position.y - 0.25;
      drone.cone.position.y = drone.cone.scale.y / 2 + 0.055;
      drone.ring.rotation.z = i;
    }
    for (let i = 0; i < cameras.length; i++)
      cameras[i].rotation.y = i * 0.7 + Math.sin(i) * 1.1;
    for (const beacon of beacons) beacon.scale.y = 0.12;
    renderActors();
  }
  reset();
  return { group, update, reset, blocked };
}
