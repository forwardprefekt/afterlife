import * as THREE from "three";

interface CompoundCollision {
  x: number;
  z: number;
  w: number;
  d: number;
}

interface CompoundHouse {
  group: THREE.Group;
  box: THREE.Box3;
  materials: THREE.MeshStandardMaterial[];
}

export function createCompound(): {
  group: THREE.Group;
  collisions: CompoundCollision[];
  houses: CompoundHouse[];
} {
  const group = new THREE.Group();
  group.name = "Licensed owner compound";
  const collisions: CompoundCollision[] = [];
  const houses: CompoundHouse[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const column = new THREE.CylinderGeometry(1, 1, 1, 8);
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const palette = {
    pale: 0xb0b6a7,
    stone: 0x89978e,
    dark: 0x263c43,
    roof: 0x34494d,
    trim: 0x91a09b,
    bronze: 0xb69b63,
    glass: 0x203e44,
    paving: 0x627472,
    lawn: 0x435f54,
    foliage: 0x526f60,
    soil: 0x354941,
    amber: 0xdfb878,
  };
  const materials = Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.86 }),
    ]),
  ) as Record<keyof typeof palette, THREE.MeshStandardMaterial>;
  materials.glass.roughness = 0.28;
  materials.glass.metalness = 0.35;
  materials.bronze.metalness = 0.45;
  materials.amber.emissive.setHex(0xe0a256);
  materials.amber.emissiveIntensity = 0.35;

  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.MeshStandardMaterial,
    parent: THREE.Object3D = group,
  ) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = h > 0.15;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function solid(x: number, z: number, w: number, h: number, d: number) {
    box(x, h / 2, z, w, h, d, materials.stone);
    collisions.push({ x, z, w, d });
  }

  function plaque(
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    parent: THREE.Object3D,
    owned?: THREE.MeshStandardMaterial[],
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#263c43";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#b69b63";
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 752, 112);
    ctx.font = "bold 40px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e2d5b4";
    ctx.fillText(text, 384, 66, 724);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
    });
    owned?.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 6), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
  }

  function estate(name: string, z: number, d: number) {
    const home = new THREE.Group();
    home.name = name;
    group.add(home);
    // Every house surface, including glazing and insignia, fades independently.
    const own = Object.fromEntries(
      Object.entries(materials).map(([key, material]) => [
        key,
        material.clone(),
      ]),
    ) as typeof materials;
    const owned = Object.values(own);
    const house = { group: home, box: new THREE.Box3(), materials: owned };
    houses.push(house);
    collisions.push({ x: 28, z, w: 14, d });
    box(28, 0.18, z, 14, 0.36, d, own.stone, home);
    return { home, own, house };
  }

  // Pale, broad armored villa: a low reception wing and a stepped private crown.
  const a = estate("Owner estate / 01", 20, 5);
  box(28, 2.08, 19.85, 13.4, 3.8, 4.3, a.own.pale, a.home);
  box(26.2, 5.1, 19.4, 9.8, 2.4, 3.4, a.own.pale, a.home);
  box(26.2, 6.4, 19.4, 10, 0.2, 3.6, a.own.bronze, a.home);
  box(24.9, 6.68, 19.25, 6.8, 0.36, 2.7, a.own.roof, a.home);
  box(24.9, 6.93, 19.25, 7, 0.14, 2.9, a.own.trim, a.home);
  // Tall recessed glazing and heavyweight piers replace apartment window grids.
  for (const x of [22.5, 25, 27.5, 32.6]) {
    box(x, 2.15, 22.018, 1.8, 2.8, 0.035, a.own.glass, a.home);
    box(x, 2.15, 22.055, 0.08, 2.8, 0.055, a.own.bronze, a.home);
    box(x - 1.02, 2.17, 22.13, 0.25, 3.25, 0.28, a.own.stone, a.home);
  }
  box(26.2, 5.1, 21.118, 8.5, 1.65, 0.035, a.own.glass, a.home);
  for (const x of [22.7, 25, 27.4, 29.7])
    box(x, 5.1, 21.17, 0.14, 1.95, 0.13, a.own.bronze, a.home);
  box(28, 3.93, 21.6, 13.9, 0.26, 1.7, a.own.trim, a.home);
  box(29.95, 1.7, 22.06, 1.6, 2.9, 0.12, a.own.dark, a.home);
  box(29.95, 3.22, 21.7, 3.3, 0.25, 1.55, a.own.bronze, a.home);
  box(29.95, 3.07, 22.28, 2.5, 0.045, 0.08, a.own.amber, a.home);
  // East roof terrace, contained within the fixed ground footprint.
  box(32.6, 4.08, 19.6, 3.65, 0.12, 3.6, a.own.roof, a.home);
  box(34.55, 4.43, 19.7, 0.15, 0.7, 3.8, a.own.stone, a.home);
  box(32.6, 4.43, 17.83, 3.8, 0.7, 0.15, a.own.stone, a.home);
  const emblemA = box(32.6, 2.5, 22.13, 0.62, 0.62, 0.12, a.own.bronze, a.home);
  emblemA.rotation.z = Math.PI / 4;
  plaque("OWNER / 01", 26.2, 6.02, 21.135, 3.1, a.home, a.house.materials);
  a.house.box.setFromObject(a.home);

  // Dark executive residence: twin stone shoulders around a double-height hall.
  const b = estate("Executive residence / 02", 35.5, 6);
  box(28, 2.42, 35.2, 13.4, 4.5, 5.2, b.own.dark, b.home);
  box(23.5, 5.74, 34.8, 4.1, 2.14, 4.2, b.own.roof, b.home);
  box(32.6, 6.04, 34.8, 4.1, 2.74, 4.2, b.own.roof, b.home);
  box(32.6, 7.52, 34.8, 4.35, 0.22, 4.4, b.own.bronze, b.home);
  box(32.6, 7.83, 34.7, 3.5, 0.34, 3.4, b.own.dark, b.home);
  box(23.5, 6.94, 34.8, 4.35, 0.26, 4.4, b.own.trim, b.home);
  box(28, 3.4, 37.83, 4.6, 5.6, 0.06, b.own.glass, b.home);
  for (const x of [25.65, 27.2, 28.8, 30.35])
    box(x, 3.4, 37.91, 0.16, 5.7, 0.18, b.own.bronze, b.home);
  box(28, 6.31, 36.8, 5, 0.24, 2.35, b.own.stone, b.home);
  for (const x of [22.3, 24.2, 31.6, 33.5]) {
    box(x, 2.8, 37.83, 1.15, 3.3, 0.06, b.own.glass, b.home);
    box(x, 5.7, 36.925, 1.15, 1.5, 0.05, b.own.glass, b.home);
  }
  box(28, 1.5, 37.91, 2.3, 2.5, 0.14, b.own.dark, b.home);
  box(28, 3.08, 37.35, 7.3, 0.3, 2.25, b.own.bronze, b.home);
  box(28, 2.9, 38.32, 5.8, 0.06, 0.1, b.own.amber, b.home);
  box(28, 4.9, 34.8, 4.7, 0.2, 4.3, b.own.paving, b.home);
  box(28, 5.34, 32.77, 4.8, 0.65, 0.14, b.own.trim, b.home);
  // Geometric ownership seal, not a real-world insignia.
  const emblemB = box(
    32.6,
    6.65,
    36.95,
    0.64,
    0.64,
    0.15,
    b.own.bronze,
    b.home,
  );
  emblemB.rotation.z = Math.PI / 4;
  box(32.6, 6.65, 37.04, 0.25, 0.25, 0.08, b.own.dark, b.home);
  plaque("PRINCIPAL / 02", 28, 6.02, 37.98, 3.8, b.home, b.house.materials);
  b.house.box.setFromObject(b.home);

  // Stone courts occupy former building plots, never the existing road surfaces.
  box(28.3, 0.015, 27.9, 14, 0.03, 4.2, materials.paving);
  box(28.3, 0.015, 43.2, 14, 0.03, 3.8, materials.paving);
  for (const z of [26.1, 29.7, 41.6, 44.8])
    box(28.3, 0.038, z, 13.8, 0.014, 0.12, materials.stone);
  // Clear central courts retain dispatch access at (30,32), including its kiosk.
  function planter(x: number, z: number, w: number, d: number) {
    solid(x, z, w, 0.38, d);
    box(x, 0.41, z, w - 0.18, 0.06, d - 0.18, materials.soil);
    box(x, 0.6, z, w - 0.35, 0.3, d - 0.3, materials.lawn);
  }
  for (const z of [27.9, 43.1]) {
    planter(23.5, z, 2.5, 2);
    planter(33.6, z, 2.2, 2);
    for (const x of [23.5, 33.6]) {
      const trunk = new THREE.Mesh(column, materials.bronze);
      trunk.position.set(x, 1.08, z);
      trunk.scale.set(0.09, 1.2, 0.09);
      trunk.castShadow = true;
      group.add(trunk);
      const tree = new THREE.Mesh(crown, materials.foliage);
      tree.position.set(x, 2.05, z);
      tree.scale.set(0.8, 1.1, 0.8);
      tree.castShadow = true;
      tree.receiveShadow = true;
      group.add(tree);
    }
    box(28.1, 0.45, z, 3.4, 0.2, 0.65, materials.stone);
    for (const x of [26.8, 29.4])
      box(x, 0.2, z, 0.25, 0.4, 0.5, materials.dark);
    collisions.push({ x: 28.1, z, w: 3.4, d: 0.65 });
  }

  function fence(x: number, z: number, length: number, alongX: boolean) {
    const w = alongX ? length : 0.25;
    const d = alongX ? 0.25 : length;
    solid(x, z, w, 0.55, d);
    box(x, 1.4, z, w, 0.09, d, materials.bronze);
    box(x, 2.03, z, w, 0.1, d, materials.dark);
    const posts = Math.ceil(length / 0.55);
    for (let i = 0; i <= posts; i++) {
      const offset = -length / 2 + (i * length) / posts;
      box(
        x + (alongX ? offset : 0),
        1.32,
        z + (alongX ? 0 : offset),
        0.065,
        1.45,
        0.065,
        materials.dark,
      );
    }
  }
  // West portals leave Z24, Z32 and Z40 unobstructed; X20 remains outside.
  for (const [z, length] of [
    [19.15, 5.3],
    [28, 3.4],
    [36, 3.4],
    [44.1, 3.8],
  ])
    fence(18.1, z, length, false);
  // North/south passages preserve BOTH X20 and the broad X40 security route.
  for (const z of [16.65, 45.85]) {
    fence(29.45, z, 15.3, true);
    fence(44.55, z, 4.5, true);
  }
  fence(46.8, 22.6, 11.8, false);
  fence(46.8, 41, 9.4, false);
  for (const z of [21.8, 26.3, 29.7, 34.3, 37.7, 42.2]) {
    solid(18.1, z, 0.6, 2.6, 0.6);
    box(18.1, 2.68, z, 0.62, 0.12, 0.62, materials.bronze);
    box(18.43, 2.1, z, 0.06, 0.35, 0.25, materials.amber);
  }

  // South-facing armored portal remains visible from the fixed isometric camera.
  // Its open stairwell descends toward a sealed door, not a playable interior.
  solid(44.55, 30, 4.5, 3.15, 2);
  box(44.55, 3.24, 30.1, 4.5, 0.18, 2.2, materials.stone);
  box(44.55, 3.38, 30.1, 4.3, 0.1, 2, materials.roof);
  // Low retaining cheeks expose the stair treads instead of hiding the approach.
  for (const x of [42.65, 46.45]) {
    solid(x, 33.25, 0.7, 1.15, 4.5);
    box(x, 1.24, 33.25, 0.7, 0.18, 4.5, materials.stone);
    box(x, 1.63, 33.25, 0.08, 0.08, 4.1, materials.bronze);
    for (const z of [31.35, 35.15])
      box(x, 1.45, z, 0.08, 0.4, 0.08, materials.dark);
  }
  box(44.55, 1.51, 31.045, 3.5, 2.85, 0.09, materials.dark);
  box(44.55, 1.48, 31.115, 2.85, 2.55, 0.1, materials.roof);
  box(44.55, 1.48, 31.185, 0.055, 2.55, 0.04, materials.bronze);
  for (const x of [43.18, 45.92])
    box(x, 1.48, 31.22, 0.16, 2.45, 0.16, materials.stone);
  for (const y of [0.6, 1.25, 1.9])
    box(44.55, y, 31.28, 2.8, 0.18, 0.2, materials.stone);
  // Descend northward from the public approach at (44.5, 37).
  for (let i = 0; i < 7; i++) {
    const height = 0.68 - i * 0.09;
    const z = 35.225 - i * 0.55;
    box(44.55, height / 2, z, 3.1, height, 0.55, materials.paving);
    box(44.55, height + 0.012, z + 0.255, 3.1, 0.024, 0.04, materials.bronze);
  }
  // No implied underground movement or collision hole beneath the exterior.
  collisions.push({ x: 44.55, z: 33.375, w: 3.1, d: 4.25 });
  for (const x of [42.65, 46.45]) {
    box(x, 0.67, 35.515, 0.6, 1.05, 0.03, materials.dark);
    for (let i = 0; i < 3; i++) {
      const stripe = box(
        x,
        0.36 + i * 0.3,
        35.54,
        0.56,
        0.1,
        0.025,
        materials.amber,
      );
      stripe.rotation.z = -0.35;
    }
  }
  box(44.55, 2.91, 31.23, 3.4, 0.08, 0.08, materials.amber);
  plaque("CONTINUITY / SEALED", 44.55, 3.16, 31.225, 3.7, group);
  return { group, collisions, houses };
}
