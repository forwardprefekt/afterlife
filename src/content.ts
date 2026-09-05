export type JobId =
  "stair-delivery" | "pump-audit" | "meter-witness" | "offgrid-relay";
export type InteractionId =
  | "home"
  | "work-terminal"
  | "ration-shop"
  | "credit-desk"
  | "parcel-depot"
  | "delivery-landing"
  | "pump"
  | "meter"
  | "underground-contact"
  | "relay"
  | "border-terminal"
  | "shower";
export type LandmarkId =
  | InteractionId
  | "municipal-notice"
  | "neighbor"
  | "tower-display"
  | "habitat-entry"
  | "habitat-exit"
  | "elevator"
  | "furniture"
  | "washroom"
  | "housing-neighbor"
  | "housing-notice"
  | "tram-platform"
  | "freight-gate"
  | "indoor-officer"
  | "street-officer"
  | "owner-compound"
  | "bunker-entrance";

export const DISTRICT_BOUNDS = {
  minX: -16,
  maxX: 48,
  minZ: -16,
  maxZ: 48,
  elbowX: 16,
  elbowZ: 16,
} as const;
export const DISTRICT_OUTLINE = [
  [DISTRICT_BOUNDS.minX, DISTRICT_BOUNDS.minZ],
  [DISTRICT_BOUNDS.elbowX, DISTRICT_BOUNDS.minZ],
  [DISTRICT_BOUNDS.elbowX, DISTRICT_BOUNDS.elbowZ],
  [DISTRICT_BOUNDS.maxX, DISTRICT_BOUNDS.elbowZ],
  [DISTRICT_BOUNDS.maxX, DISTRICT_BOUNDS.maxZ],
  [DISTRICT_BOUNDS.minX, DISTRICT_BOUNDS.maxZ],
] as const;
export interface DistrictRoad {
  from: readonly [number, number];
  to: readonly [number, number];
}
export const DISTRICT_ROADS: readonly DistrictRoad[] = [
  ...[-10, 0, 10].map((x) => ({
    from: [x, -16] as const,
    to: [x, 48] as const,
  })),
  ...[20, 40].map((x) => ({
    from: [x, 16] as const,
    to: [x, 48] as const,
  })),
  ...[-8, 0, 8, 16].map((z) => ({
    from: [-16, z] as const,
    to: [16, z] as const,
  })),
  ...[24, 32, 40].map((z) => ({
    from: [-16, z] as const,
    to: [48, z] as const,
  })),
];
export function insideDistrict(x: number, z: number, radius = 0): boolean {
  const b = DISTRICT_BOUNDS;
  return (
    x >= b.minX + radius &&
    x <= b.maxX - radius &&
    z >= b.minZ + radius &&
    z <= b.maxZ - radius &&
    (x <= b.elbowX - radius || z >= b.elbowZ + radius)
  );
}

export interface Job {
  id: JobId;
  name: string;
  reward: number;
  hours: number;
  destination: InteractionId;
  description: string;
  verb: string;
}
export const JOBS: Record<JobId, Job> = {
  "stair-delivery": {
    id: "stair-delivery",
    name: "Vertical logistics",
    reward: 10,
    hours: 2,
    destination: "delivery-landing",
    description:
      "Collect at the east freight depot beyond the dogleg. Return to the Civic Core and climb the exterior stair. Human stair labor remains cheaper than certified autonomous access.",
    verb: "Deliver parcel",
  },
  "pump-audit": {
    id: "pump-audit",
    name: "Human presence verification",
    reward: 12,
    hours: 2,
    destination: "pump",
    description:
      "Visit the west pump and certify your physical presence. The reading itself has already been collected.",
    verb: "Certify physical presence",
  },
  "meter-witness": {
    id: "meter-witness",
    name: "Utility witness",
    reward: 14,
    hours: 2,
    destination: "meter",
    description:
      "Witness an automated reading at the East Grid Exchange, beyond the district's southern elbow. A living signatory is still required by ordinance.",
    verb: "Witness automated reading",
  },
  "offgrid-relay": {
    id: "offgrid-relay",
    name: "Private maintenance",
    reward: 18,
    hours: 2,
    destination: "relay",
    description:
      "Carry an unregistered relay component north along the unmonitored west service route. Two uninterrupted seconds under the central scanner freezes your key and revokes citizenship.",
    verb: "Install relay component",
  },
};
export interface Landmark {
  id: LandmarkId;
  name: string;
  sector: string;
  position: readonly [number, number, number];
  text: string;
  details?: string;
}
export const LANDMARKS: Landmark[] = [
  {
    id: "habitat-entry",
    name: "Habitat 09 entrance",
    sector: "CAPSULE RESIDENCES / 384 LICENSED BERTHS",
    position: [-10, 0, 12],
    text: "Behind the turnstile: three floors of borrowed sleep. Your berth is 0806, on level 03. The elevator works today. That is not guaranteed tomorrow.",
    details:
      "Enter the lobby and take the lift to level 03. You can arrange the few things you own in your capsule, speak to the other residents, and settle your 40-credit housing license at your berth. Rooms and recognition remain revocable.",
  },
  {
    id: "work-terminal",
    name: "Labor exchange",
    sector: "CIVIC SERVICES / W-02",
    position: [-4, 0, 8],
    text: "Three tasks await a human presence. Payments are automatic. Purpose is not guaranteed.",
    details:
      "The city could automate these tasks. It cannot yet automate the legal requirement that someone be responsible for them. Human stair labor remains cheaper than certified autonomous access.",
  },
  {
    id: "ration-shop",
    name: "Ration counter",
    sector: "APPROVED RETAIL / R-06",
    position: [4, 0, 8],
    text: "One warm ration. Six credits. Approved nutrition, dispensed upon settlement. No cash. No substitutions.",
  },
  {
    id: "credit-desk",
    name: "Credit desk",
    sector: "ISSUER SERVICES / C-10",
    position: [10, 0, 8],
    text: "“A little flexibility goes a long way.” Receive ten credits now. Twelve are due after housing at shift end. One advance per resident per day.",
  },
  {
    id: "parcel-depot",
    name: "East freight depot",
    sector: "INDUSTRIAL LOGISTICS / P-12",
    position: [30, 0, 32],
    text: "A sealed parcel waits for a licensed human carrier. Carry it back around the dogleg to the Civic Core. The recipient is on the upper landing, reached by the exterior stair on the east side of the original district.",
  },
  {
    id: "delivery-landing",
    name: "Upper landing",
    sector: "LOGISTICS / LEVEL 03",
    position: [10, 3, -12],
    text: "“They could have sent a drone,” the resident says. “I am glad they sent a person.” A hand reaches for the parcel.",
  },
  {
    id: "pump",
    name: "West pump",
    sector: "WATER AUTHORITY / U-04",
    position: [-10, 0, -8],
    text: "“All readings are nominal. My sensors supplied this information eleven minutes ago. Please certify that a human body is now present.”",
  },
  {
    id: "meter",
    name: "East grid meter",
    sector: "EAST GRID EXCHANGE / U-07",
    position: [40, 0, 40],
    text: "“Reading complete. No intervention is necessary. A human acknowledgment remains legally necessary.” The screen is warm; nobody has touched it in hours.",
  },
  {
    id: "underground-contact",
    name: "Mara",
    sector: "WEST SERVICE ROUTE / UNLISTED",
    position: [-10, 0, 0],
    text: "“You look like someone who actually finishes a job. Do one for the city, then we can talk. There is a relay up the west lane. People outside still need to hear a voice.”",
    details:
      "“We trade anti-surveillance gear. Some people host their own AI. Prohibited hardware, prohibited minds. They execute operators without a hearing. This is just a relay component. You are a courier, not an operator. Keep to this west lane; the central scanner cannot see it.”",
  },
  {
    id: "relay",
    name: "Service relay",
    sector: "WEST SERVICE ROUTE / OFF REGISTER",
    position: [-10, 0, -12],
    text: "An old receiver behind a patched panel. Mara’s neighbor will transfer the payment. The agreement is off-network; the credits are still the issuer’s.",
  },
  {
    id: "border-terminal",
    name: "Perimeter control",
    sector: "REGIONAL TRANSIT / CLOSED",
    position: [0, 0, -14],
    text: "Regional transit requires recognized citizenship. The successor compacts share AI surveillance and identity screening. This district’s perimeter is closed for the workday.",
    details:
      "Beyond the wall, the unclaimed settlements have no recognized issuer and no guaranteed protection. Crossing a boundary does not erase a record. Meridian recognition is accepted by participating jurisdictions, not a right to enter them.",
  },
  {
    id: "municipal-notice",
    name: "Municipal notice",
    sector: "COMPACT ARCHIVE / PUBLIC EXTRACT",
    position: [-2, 0, 0],
    text: "INERTIA ACT · A corporate proprietor holding 52% of a jurisdiction’s land may petition for administrative sovereignty.",
    details:
      "This is an institution of the fictional Meridian Compact, not real US law. After the fragmentation, ownership thresholds turned municipal maps into acquisition targets. The city calls this continuity.",
  },
  {
    id: "neighbor",
    name: "A displaced neighbor",
    sector: "RESIDENTIAL / UNASSIGNED",
    position: [-12, 0, 8],
    text: "“My kitchen was in another compact last month. They moved the boundary. Confiscated the apartment. I still have the key. It feels wrong to throw it away.”",
    details:
      "“They told me I could apply for recognition here. Application needs employment. Employment needs an address. I used to fix lifts. Do you think anyone still needs that?”",
  },
  {
    id: "tower-display",
    name: "Authority broadcast",
    sector: "MERIDIAN ADMINISTRATION",
    position: [3, 0, -14],
    text: "LEADERSHIP PROVIDES. CITIZENSHIP CONTRIBUTES. Advanced-model access is reserved to licensed owners. Your assigned assistant is sufficient for your station.",
    details:
      "All institutions, characters, and historical events depicted here are fictional. The Compact’s official emblem represents the owner above, the administrator between, and the citizen below.",
  },
  {
    id: "tram-platform",
    name: "Suspended tram service",
    sector: "SOUTH CONCOURSE / PLATFORM 09",
    position: [0, 0, 40],
    text: "NEXT SERVICE: UNDER REVIEW. The bench is polished by people who cannot afford to stop waiting. A civic notice recommends walking as a demonstration of resilience.",
  },
  {
    id: "freight-gate",
    name: "Freight checkpoint",
    sector: "EAST MERIDIAN / INTAKE 12",
    position: [40, 0, 24],
    text: "Owner-certified cargo passes without a pause. Human traffic waits behind the amber line. The east grid meter is farther south, at the next two crossings.",
  },
  {
    id: "owner-compound",
    name: "Owner residential compound",
    sector: "EAST MERIDIAN / PROTECTED ESTATES",
    position: [20, 0, 24],
    text: "Two households occupy more ground than an entire capsule hall. Armed recognition guards patrol the service lanes. Workers may use the marked crossings; the residences are private.",
  },
  {
    id: "bunker-entrance",
    name: "Continuity bunker entrance",
    sector: "OWNER CONTINUITY / SEALED",
    position: [44.5, 0, 37],
    text: "An armored stair descends beneath the estates. The blast door is sealed. CONTINUITY IS A PRIVILEGE, reads the plaque. No resident-level key is accepted here.",
    details:
      "The public service lane remains open between the freight depot and grid meter. The bunker and the two houses are not enterable.",
  },
];
export const landmark = (id: LandmarkId) =>
  LANDMARKS.find((place) => place.id === id)!;
export const SCANNER_TRIANGLE = [
  [0, 3],
  [-4, -5],
  [4, -5],
] as const;
export function insideScanner(x: number, z: number): boolean {
  const [a, b, c] = SCANNER_TRIANGLE;
  const cross = (p: readonly [number, number], q: readonly [number, number]) =>
    (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0]);
  return cross(a, b) >= 0 && cross(b, c) >= 0 && cross(c, a) >= 0;
}
