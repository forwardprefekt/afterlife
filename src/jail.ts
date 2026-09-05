import * as THREE from "three";
import { CUSTODY_DURATIONS } from "./game";
import type { GameState } from "./game";

export const JAIL_EXIT = { x: -4, z: 4 };
interface CustodyView {
  custody?: GameState["custody"];
  totalYearsServed?: number;
}

/** A cutaway processing room and a separate, exterior custody vehicle. */
export function createJail() {
  const group = new THREE.Group();
  group.name = "Consciousness custody / processing";
  const vehicle = new THREE.Group();
  vehicle.name = "Player custody transport";
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const concrete = new THREE.MeshStandardMaterial({
    color: 0x667779,
    roughness: 0.9,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x203439,
    roughness: 0.8,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0xabb7ac,
    roughness: 0.5,
  });
  const cyan = new THREE.MeshStandardMaterial({
    color: 0x78c8c0,
    emissive: 0x408e88,
    emissiveIntensity: 0.65,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xedbf79,
    emissive: 0xb57f30,
    emissiveIntensity: 0.5,
  });
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
  box(group, 0, -0.15, 0, 14, 0.3, 12, concrete);
  box(group, 0, 2.3, -6, 14, 4.6, 0.25, dark);
  box(group, -7, 1.5, 0, 0.25, 3, 12, dark);
  box(group, 6.9, 0.45, 0, 0.2, 0.9, 12, concrete);
  box(group, 0, 0.35, 5.9, 14, 0.7, 0.2, concrete);
  // Processing chair, head cradle, restraints and hardware; no graphic imagery.
  box(group, 1, 0.35, 0, 1.5, 0.7, 1.8, dark);
  box(group, 1, 0.78, 0, 1.1, 0.16, 1.2, metal);
  box(group, 1, 1.3, -0.5, 1.1, 1.2, 0.18, dark);
  for (const x of [0.3, 1.7]) box(group, x, 1, 0, 0.18, 0.18, 1.25, metal);
  box(group, 1, 1.92, -0.5, 0.65, 0.18, 0.55, cyan);
  for (const x of [3.2, 4.2, 5.2]) {
    box(group, x, 1.25, -4.5, 0.8, 2.5, 0.9, dark);
    for (let y = 0.4; y < 2.4; y += 0.3)
      box(group, x, y, -4.02, 0.55, 0.06, 0.04, cyan);
  }
  box(group, -2, 0.65, -3.5, 1.4, 1.3, 0.8, metal);
  box(group, -2, 1.5, -3.6, 1.3, 0.7, 0.12, cyan);
  box(group, -4, 0.03, 4, 1.8, 0.06, 1.8, amber);
  for (const x of [-5, -3]) box(group, x, 1.3, 4.8, 0.12, 2.6, 0.12, metal);
  box(group, -4, 2.6, 4.8, 2.2, 0.2, 0.2, cyan);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 384;
  const context = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 3.2),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  display.position.set(0, 2.5, -5.84);
  group.add(display);
  let previous = "";
  function wall(state: CustodyView) {
    const phase = state.custody?.phase ?? "release";
    const key = `${phase}:${state.totalYearsServed}`;
    if (key === previous) return;
    previous = key;
    context.fillStyle = "#172b30";
    context.fillRect(0, 0, 1024, 384);
    context.textAlign = "center";
    context.fillStyle = "#99c8bf";
    context.font = "28px monospace";
    context.fillText("MERIDIAN / CONSCIOUSNESS CORRECTION", 512, 54);
    context.fillStyle = "#f2d397";
    context.font = "bold 65px monospace";
    context.fillText(
      `TOTAL: ${state.totalYearsServed ?? 0} YEARS SERVED`,
      512,
      148,
    );
    context.fillStyle = "#ecf2de";
    context.font = "bold 32px monospace";
    context.fillText(
      phase === "announcement" || phase === "release"
        ? "10 YEARS SERVED. HAVE A LOVELY DAY!"
        : phase === "sentence"
          ? "TEN YEARS / OFFSCREEN TORMENT"
          : phase.toUpperCase() + " IN PROGRESS",
      512,
      239,
    );
    context.font = "25px monospace";
    context.fillText(
      phase === "release"
        ? "WALK TO THE AMBER RELEASE GATE / E"
        : "BODY RETAINED HERE / SUBJECT 0806",
      512,
      313,
    );
    texture.needsUpdate = true;
  }
  box(vehicle, 0, 0.65, 0, 1.8, 0.9, 3.3, dark);
  box(vehicle, 0, 1.35, -0.25, 1.75, 0.75, 2.1, concrete);
  box(vehicle, 0, 1.42, 0.83, 1.45, 0.45, 0.04, cyan);
  for (const x of [-0.93, 0.93])
    for (const z of [-1, 1]) box(vehicle, x, 0.32, z, 0.2, 0.55, 0.65, dark);
  const lights = [-0.45, 0.45].map((x) =>
    box(vehicle, x, 1.79, 0, 0.45, 0.12, 0.35, amber),
  );
  box(vehicle, 0, 1.4, -1.34, 0.9, 0.4, 0.05, metal);
  for (const x of [-0.3, 0, 0.3])
    box(vehicle, x, 1.4, -1.38, 0.05, 0.43, 0.04, dark);
  const route: THREE.Vector3[] = [];
  let routeLength = 0;
  function begin(x: number, z: number, indoors: boolean) {
    // Join the nearest authored road, then follow it to the clear south lane.
    const start = new THREE.Vector3(indoors ? -10 : x, 0, indoors ? 12.8 : z);
    const verticals = start.z >= 16 ? [-10, 0, 10, 20, 30, 40] : [-10, 0, 10];
    const horizontals =
      start.x > 16 ? [24, 32, 40] : [-8, 0, 8, 16, 24, 32, 40];
    const nearestLane = verticals.reduce((a, b) =>
      Math.abs(a - start.x) < Math.abs(b - start.x) ? a : b,
    );
    // Keep the vehicle's flank clear of the centerline scanner mast at (0,3).
    const lane = nearestLane === 0 ? 1.2 : nearestLane;
    const cross = horizontals.reduce((a, b) =>
      Math.abs(a - start.z) < Math.abs(b - start.z) ? a : b,
    );
    route.splice(0, route.length, start);
    if (indoors || Math.abs(lane - start.x) <= Math.abs(cross - start.z)) {
      route.push(new THREE.Vector3(lane, 0, start.z));
      // Eastern roads join at Z24, not across the inaccessible L notch.
      route.push(new THREE.Vector3(lane, 0, lane > 16 ? 24 : 16));
      route.push(new THREE.Vector3(13.7, 0, lane > 16 ? 24 : 16));
    } else {
      route.push(new THREE.Vector3(start.x, 0, cross));
      route.push(new THREE.Vector3(13.7, 0, cross));
    }
    route.push(new THREE.Vector3(13.7, 0, 52));
    routeLength = 0;
    for (let i = 1; i < route.length; i++)
      routeLength += route[i - 1].distanceTo(route[i]);
  }
  function update(state: CustodyView, player: THREE.Vector3) {
    wall(state);
    const custody = state.custody;
    vehicle.visible = custody?.phase === "transport";
    group.visible = Boolean(custody && custody.phase !== "transport");
    if (!custody) return;
    if (custody.phase === "transport") {
      let distance =
        Math.max(
          0,
          (custody.elapsed - 1.5) / (CUSTODY_DURATIONS.transport - 1.5),
        ) * routeLength;
      for (let i = 1; i < route.length; i++) {
        const length = route[i - 1].distanceTo(route[i]);
        if (distance <= length || i === route.length - 1) {
          vehicle.position.lerpVectors(
            route[i - 1],
            route[i],
            length ? Math.min(1, distance / length) : 1,
          );
          vehicle.rotation.y = Math.atan2(
            route[i].x - route[i - 1].x,
            route[i].z - route[i - 1].z,
          );
          break;
        }
        distance -= length;
      }
      lights[0].visible = Math.floor(custody.elapsed * 5) % 2 === 0;
      lights[1].visible = !lights[0].visible;
      player.copy(vehicle.position);
    } else if (custody.phase !== "release") player.set(1, 0.28, 0);
  }
  function blocked(x: number, z: number) {
    return (
      x < -6.5 ||
      x > 6.5 ||
      z < -5.4 ||
      z > 5.4 ||
      (Math.abs(x - 1) < 1 && Math.abs(z) < 1.15) ||
      (x > 2.5 && z < -3.6) ||
      (Math.abs(x + 2) < 1 && Math.abs(z + 3.5) < 0.8)
    );
  }
  group.visible = false;
  vehicle.visible = false;
  return { group, vehicle, begin, update, blocked };
}
