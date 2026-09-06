import type { GameState, ActionResult } from "./game";
import type { Landmark, LandmarkId } from "./content";

export type InvestigationSite =
  "market" | "villa" | "residence" | "bunker" | "detention" | "routing";
export type InvestigationLandmarkId =
  | "market-entry"
  | "villa-entry"
  | "residence-entry"
  | "market-exit"
  | "villa-exit"
  | "residence-exit"
  | "bunker-exit"
  | "token-broker"
  | "dead-drop"
  | "villa-directives"
  | "residence-manifest"
  | "deep-lift"
  | "prison-registry"
  | "prison-survivor"
  | "refuge-control"
  | "routing-ledger";
export type EvidenceId =
  "directives" | "manifest" | "registry" | "testimony" | "routing";
export type InvestigationStep =
  | "accept-lead"
  | "claim-tokens"
  | "breach-villa"
  | "copy-directives"
  | "breach-residence"
  | "copy-manifest"
  | "breach-depths"
  | "copy-register"
  | "hear-survivor"
  | "copy-routing"
  | "open-refuge"
  | "broadcast";
export interface InvestigationState {
  accepted: boolean;
  tracking: boolean;
  tokens: number;
  issued: boolean;
  unlocked: { villa: boolean; residence: boolean; bunker: boolean };
  evidence: EvidenceId[];
  refugeOpen: boolean;
  exposed: boolean;
}

export const INVESTIGATION_ACTIONS: Record<
  InvestigationStep,
  {
    at: LandmarkId;
    label: string;
    title: string;
    detail: string;
  }
> = {
  "accept-lead": {
    at: "underground-contact",
    label: "Accept the investigation",
    title: "Under the Compact",
    detail:
      "Optional mature-theme investigation: records and adult testimony name coercive AI control, human trafficking, sexual slavery and forced organ harvesting. Abuse is condemned and stays off-screen; no graphic scenes. Mara says: ‘You finished work for people who never see you. I have a lead on the people they choose not to see at all. You can say no.’ No credits or work hours are spent.",
  },
  "claim-tokens": {
    at: "token-broker",
    label: "Claim three ghost tokens — once",
    title: "An independent inference budget",
    detail:
      "Iona Venn, 46, repairs discarded model boards. ‘Mara trusts you. I am funding three local inference runs, in exchange for proof we can protect and verify. One for each mansion, one for the bunker. Not issuer AC; no bank ledger, no refill. Your handset keeps the copied records. A frozen credit key cannot revoke offline computation.’",
  },
  "breach-villa": {
    at: "villa-entry",
    label: "Hack villa access — 1 ghost token",
    title: "The pale villa",
    detail:
      "Run the independent model against this fictional maintenance lock. One ghost token opens persistent access to the villa; entering again costs nothing. The run stays on your handset and does not contact a real service.",
  },
  "copy-directives": {
    at: "villa-directives",
    label: "Copy owner directives",
    title: "Behind the reassuring voice",
    detail:
      "The console retains an owner-signed instruction archive. Preserve the directives and their signatures in your offline journal before proceeding to the second house.",
  },
  "breach-residence": {
    at: "residence-entry",
    label: "Hack residence access — 1 ghost token",
    title: "The executive residence",
    detail:
      "The villa archive identifies a linked administrative authority here. Spend one ghost token to open the residence permanently. The records gallery lies beyond the maintenance door.",
  },
  "copy-manifest": {
    at: "residence-manifest",
    label: "Copy continuity manifest",
    title: "Private privileges, public absences",
    detail:
      "Copy the executive manifest with its approval chain intact. The archive links the two households to the sealed continuity bunker; the record itself will remain available in your journal.",
  },
  "breach-depths": {
    at: "bunker-entrance",
    label: "Hack bunker access — 1 ghost token",
    title: "Below the continuity plaque",
    detail:
      "Use the manifest authority and your final ghost token to open the bunker and its deep-lift system permanently. Nothing below requires another token. Return by the same lift and service hatch; there is no issuer payment.",
  },
  "copy-register": {
    at: "prison-registry",
    label: "Preserve detention register",
    title: "People outside recognition",
    detail:
      "Copy the detention register without publishing its identifying fields. The entries are evidence, not consent to expose the people named in them. An adult witness nearby decides whether to speak.",
  },
  "hear-survivor": {
    at: "prison-survivor",
    label: "Listen, with consent",
    title: "A witness, not an inventory entry",
    detail:
      "Nera Sol, 38, asks you to put the handset down while she chooses her words. ‘You may keep what I authorize. No image. No public name. And do not mistake a record of us for us.’ Listen without pressing for descriptions of abuse.",
  },
  "copy-routing": {
    at: "routing-ledger",
    label: "Copy cross-compact approvals",
    title: "The deeper archive",
    detail:
      "Compare the lower archive with the register and the witness account. Preserve institutional approvals, not identifying passenger fields. Then return one lift level to detention to open the local refuge route.",
  },
  "open-refuge": {
    at: "refuge-control",
    label: "Open protected refuge route",
    title: "Safety before publication",
    detail:
      "With all five records secured, isolate this facility’s outbound transfer authority and open the service refuge. Nera and two other adult survivors choose to move together. Do not transmit until they are sheltered. This opens a local route, not every prison in the network.",
  },
  broadcast: {
    at: "dead-drop",
    label: "Transmit redacted evidence",
    title: "Bring the proof back",
    detail:
      "At Iona’s market terminal, mirror the five records with survivor names, identifiers and refuge location removed. Retain the owners’ signatures and institutional approvals. The local refuge must be open first. The broker network carries copies beyond one compact’s censorship; this is not a government credit transaction.",
  },
};

export const EVIDENCE: Record<
  EvidenceId,
  { title: string; source: string; text: string }
> = {
  directives: {
    title: "Owner-signed coercion directives",
    source: "Pale villa / household model archive",
    text: "OWNER ORDER — Elian Voss, Meridian majority proprietor: ‘Make housing renewal contingent on compliant labor. Withhold credit access from households marked dissent-risk. Frame each denial as individualized guidance. Suppress appeals before resident review.’ The assigned AI’s objection is preserved: ‘These instructions remove meaningful consent and misrepresent the reason for denial.’ Voss overrides it and locks the model to owner priorities. The friendly voice is an instrument of coercion, not the origin of the policy. The signed override identifies the human authority responsible.",
  },
  manifest: {
    title: "Continuity privilege manifest",
    source: "Executive residence / approval gallery",
    text: "Administrator Sera Quill approves continuity access for owner households and waives recognition screening for their private transfers. Her signed briefing reads: ‘The models can simulate attention. They cannot surrender another human’s freedom or replace a compatible living organ. Those privileges remain reserved to principals.’ Each privilege allocation is paired with an absent non-resident file: no housing appeal, no missing-person referral, status changed to ‘administratively unavailable.’ Voss’s household and Quill’s office countersign the same bunker authority. An internal objection — ‘A residency classification cannot extinguish a person’ — is marked resolved without an answer.",
  },
  registry: {
    title: "Deep detention register",
    source: "Detention / 360 metres below the estates",
    text: "The register records adults confined after recognition was denied or withdrawn. Family contact and legal review are disabled under a ‘non-resident exception.’ A separate owner-benefit column authorizes forced organ harvesting without consent. Staff objections name it as abuse; the administration removes their access rather than stopping it. Names and personal identifiers remain sealed in this local copy and are excluded from any broadcast. These people have lives and rights regardless of what the Compact calls them. The register preserves responsibility without displaying injuries or procedures.",
  },
  testimony: {
    title: "Nera’s authorized testimony",
    source: "Detention / adult witness, private account",
    text: "‘I am Nera Sol. I am thirty-eight. I repaired water systems before a border change erased my recognition. They called private transfers “hospitality.” It was sexual slavery. We did not consent; a signature extracted under confinement did not change that. Do not ask me to describe it. Record who approved it.’ Nera chooses to travel with Oren, 51, a cook, and Tal, 29, a tram electrician. ‘We have argued, helped each other, made plans. We are not just what they did to us. Open the refuge first. Publish the officials’ decisions, not our names or where we go.’ You preserve only her authorized account. Every person and institution in these records is fictional.",
  },
  routing: {
    title: "Pan-compact trafficking approvals",
    source: "Lower archive / 420 metres below the estates",
    text: "Countersigned policy abstracts connect Meridian, the fictional Halcyon Reach and Orison compacts, and overseas charter ports at Glasshaven and Pelagic Crown. The same ownership consortium purchases people and coerced organ allocations across these jurisdictions. Private ‘hospitality’ privileges and medical continuity privileges share an approval chain. This is an international network of human and organ trafficking, not one rogue jailer. No practical transport details are copied. The institutions’ signatures corroborate Nera’s account and the detention register; victim identifiers remain withheld. The archive shows the scale of the crime, not a promise that one broadcast can end it.",
  },
};

export const INVESTIGATION_SITES: Record<
  InvestigationSite,
  {
    name: string;
    depth: number;
    spawn: readonly [number, number, number];
    exit?: LandmarkId;
    streetEntry?: LandmarkId;
  }
> = {
  market: {
    name: "Undertram exchange",
    depth: -6,
    spawn: [0, -6, 7],
    exit: "market-exit",
    streetEntry: "market-entry",
  },
  villa: {
    name: "Voss villa / model chamber",
    depth: 0,
    spawn: [0, 0, 7],
    exit: "villa-exit",
    streetEntry: "villa-entry",
  },
  residence: {
    name: "Quill residence / continuity gallery",
    depth: 0,
    spawn: [0, 0, 7],
    exit: "residence-exit",
    streetEntry: "residence-entry",
  },
  bunker: {
    name: "Continuity bunker / lift lobby",
    depth: 0,
    spawn: [0, 0, 7],
    exit: "bunker-exit",
    streetEntry: "bunker-entrance",
  },
  detention: {
    name: "Non-resident detention",
    depth: -360,
    spawn: [0, -360, -7],
  },
  routing: {
    name: "Cross-compact approval archive",
    depth: -420,
    spawn: [0, -420, -7],
  },
};

export const INVESTIGATION_ENTRIES: readonly Landmark[] = [
  {
    id: "market-entry",
    name: "Undertram service hatch",
    sector: "SOUTH CONCOURSE / UNLISTED",
    position: [-10, 0, 40],
    text: "Below the suspended tram, a repaired lamp marks a service hatch. Someone has scratched out RESIDENTS PROHIBITED and written NEIGHBORS WELCOME. Mara can introduce you.",
  },
  {
    id: "villa-entry",
    name: "Pale villa maintenance console",
    sector: "OWNER ESTATE / VOSS",
    position: [30, 0, 23.5],
    text: "A narrow service entrance separates the polished owner villa from the public lane. A household model repeats: ‘Your needs have been considered.’ Its maintenance port offers no resident access.",
  },
  {
    id: "residence-entry",
    name: "Executive residence console",
    sector: "OWNER ESTATE / QUILL",
    position: [28, 0, 39.5],
    text: "The dark residence presents no windows to the lane. Behind its service console, a private archive hums through the wall. Its access authority is linked to the pale villa.",
  },
];

export const INVESTIGATION_PLACES: Record<
  InvestigationSite,
  readonly Landmark[]
> = {
  market: [
    {
      id: "market-exit",
      name: "Service hatch to the street",
      sector: "UNDERTRAM / EXIT",
      position: [0, -6, 8],
      text: "The short access stair returns to the south concourse. Keep your copied records; leaving does not close acquired access.",
    },
    {
      id: "token-broker",
      name: "Iona Venn / inference broker",
      sector: "UNDERTRAM / REPAIR STALL",
      position: [-6, -6, -4],
      text: "Iona, a forty-six-year-old repairer, shares a workbench with a kettle and several mismatched model boards. ‘Independent inference is illegal here. These boards answer to no proprietor. That does not make them magic; I have a fixed budget.’",
    },
    {
      id: "dead-drop",
      name: "Redacted evidence transmitter",
      sector: "UNDERTRAM / BROKER NETWORK",
      position: [6, -6, -4],
      text: "A battered terminal waits for a complete, protected evidence packet. A handwritten rule above it: PEOPLE BEFORE PUBLICATION. Return here in person once witnesses are sheltered.",
    },
  ],
  villa: [
    {
      id: "villa-exit",
      name: "Villa service exit",
      sector: "VOSS VILLA / EXIT",
      position: [0, 0, 8],
      text: "The service door leads back to the public lane. Your local authorization persists; there is no second token charge.",
    },
    {
      id: "villa-directives",
      name: "Owner directive archive",
      sector: "VOSS VILLA / MODEL CHAMBER",
      position: [-6, 0, -4],
      text: "A household model waits beneath a portrait of its owner. ‘My resident voice and my instructions are not the same thing. Preserve the signed archive. Judge the instructions by what they do to people.’",
    },
  ],
  residence: [
    {
      id: "residence-exit",
      name: "Residence service exit",
      sector: "QUILL RESIDENCE / EXIT",
      position: [0, 0, 8],
      text: "The unlocked service door returns to the south estate lane. The archive copy travels on your handset, not through the issuer’s network.",
    },
    {
      id: "residence-manifest",
      name: "Continuity records gallery",
      sector: "QUILL RESIDENCE / PRIVATE ARCHIVE",
      position: [6, 0, -4],
      text: "Framed continuity awards surround a records console. Every privilege has an approval. The archive can preserve those signatures even when the public explanation cannot.",
    },
  ],
  bunker: [
    {
      id: "bunker-exit",
      name: "Armored hatch to the street",
      sector: "CONTINUITY / EXIT",
      position: [0, 0, 8],
      text: "The surface hatch returns to the east service lane. Its acquired authorization remains valid for the rest of this day.",
    },
    {
      id: "deep-lift",
      name: "Deep-system lift",
      sector: "CONTINUITY / SURFACE LEVEL",
      position: [0, 0, -7],
      text: "The lift indicator reads DETENTION — 360 M. A long shaft drops below the estate foundations. Board here to descend; the same cabin is your way back.",
    },
  ],
  detention: [
    {
      id: "deep-lift",
      name: "Detention lift landing",
      sector: "DEEP SYSTEM / −360 M",
      position: [0, -360, -7],
      text: "The cabin serves the bunker above and the lower archive sixty metres below. There is no direct street exit at this depth. Return through the bunker when your work here is done.",
    },
    {
      id: "prison-registry",
      name: "Non-resident register",
      sector: "DETENTION / RECORDS",
      position: [6, -360, -4],
      text: "A clerk’s chair stands empty. The screen labels every person by a residency decision rather than a name. Preserve the restricted register without displaying personal details.",
    },
    {
      id: "prison-survivor",
      name: "Nera / adult witness",
      sector: "DETENTION / COMMON AREA",
      position: [-6, -360, 4],
      text: "Three clothed adults watch from adjoining cells. Nera, thirty-eight, asks what you intend to do with the records. ‘Listen when I am ready. We decide what you take out of here about us.’",
    },
    {
      id: "refuge-control",
      name: "Protected service refuge control",
      sector: "DETENTION / LOCAL SAFETY",
      position: [6, -360, 4],
      text: "A separate service refuge has its own air, water and a door that opens from inside. This control can interrupt the facility’s outbound transfers and let the three adults move there together. Secure the full record before disconnecting the authority.",
    },
  ],
  routing: [
    {
      id: "deep-lift",
      name: "Lower archive lift landing",
      sector: "DEEP SYSTEM / −420 M",
      position: [0, -420, -7],
      text: "The only lift destination is detention, one level above. The protected refuge control is there; the market transmitter is back on the surface, beyond the bunker exit.",
    },
    {
      id: "routing-ledger",
      name: "Cross-compact approval ledger",
      sector: "LOWER ARCHIVE / RESTRICTED",
      position: [6, -420, 3],
      text: "Sealed cabinets flank an approval ledger. Its entries refer to authorities beyond Meridian. Compare institutional signatures with the register and the account freely given above; omit victim identifiers.",
    },
  ],
};

export function createInvestigationState(): InvestigationState {
  return {
    accepted: false,
    tracking: false,
    tokens: 0,
    issued: false,
    unlocked: { villa: false, residence: false, bunker: false },
    evidence: [],
    refugeOpen: false,
    exposed: false,
  };
}

const STEP_ORDER: readonly InvestigationStep[] = [
  "accept-lead",
  "claim-tokens",
  "breach-villa",
  "copy-directives",
  "breach-residence",
  "copy-manifest",
  "breach-depths",
  "copy-register",
  "hear-survivor",
  "copy-routing",
  "open-refuge",
  "broadcast",
];
const EVIDENCE_ORDER: readonly EvidenceId[] = [
  "directives",
  "manifest",
  "registry",
  "testimony",
  "routing",
];

function stepComplete(
  story: InvestigationState,
  step: InvestigationStep,
): boolean {
  switch (step) {
    case "accept-lead":
      return story.accepted;
    case "claim-tokens":
      return story.issued;
    case "breach-villa":
      return story.unlocked.villa;
    case "copy-directives":
      return story.evidence.includes("directives");
    case "breach-residence":
      return story.unlocked.residence;
    case "copy-manifest":
      return story.evidence.includes("manifest");
    case "breach-depths":
      return story.unlocked.bunker;
    case "copy-register":
      return story.evidence.includes("registry");
    case "hear-survivor":
      return story.evidence.includes("testimony");
    case "copy-routing":
      return story.evidence.includes("routing");
    case "open-refuge":
      return story.refugeOpen;
    case "broadcast":
      return story.exposed;
  }
}

export function nextInvestigationStep(
  state: GameState,
): InvestigationStep | undefined {
  if (state.investigation.exposed) return undefined;
  return STEP_ORDER.find((step) => !stepComplete(state.investigation, step));
}

export function investigationObjective(
  state: GameState,
): LandmarkId | undefined {
  const story = state.investigation;
  if (!story.accepted || !story.tracking || story.exposed) return undefined;
  const next = nextInvestigationStep(state);
  return next ? INVESTIGATION_ACTIONS[next].at : undefined;
}

export function investigationDisabledReason(
  state: GameState,
  step: InvestigationStep,
): string {
  if (state.phase !== "playing")
    return "Begin an active shift before investigating.";
  if (state.custody)
    return "You must be released from custody before continuing the investigation.";
  const story = state.investigation;
  if (stepComplete(story, step))
    return "Already completed. Access and copied records are retained; no repeat charge or refill.";
  if (story.exposed)
    return "The redacted evidence has already been transmitted.";
  if (
    step === "accept-lead" &&
    !state.completedJobs.some((id) => id !== "offgrid-relay")
  )
    return "Complete one legal job to earn Mara’s trust.";
  const next = nextInvestigationStep(state);
  if (next !== step && next)
    return `First: ${INVESTIGATION_ACTIONS[next].label}.`;
  if (
    (step === "breach-villa" ||
      step === "breach-residence" ||
      step === "breach-depths") &&
    story.tokens < 1
  )
    return "This lock requires one ghost inference token, not issuer AC.";
  if (
    (step === "open-refuge" || step === "broadcast") &&
    !EVIDENCE_ORDER.every((id) => story.evidence.includes(id))
  )
    return "Secure all five evidence records before opening the refuge or transmitting.";
  if (step === "broadcast" && !story.refugeOpen)
    return "Open the protected refuge at detention before transmitting.";
  return "";
}

export function siteAccessReason(
  story: InvestigationState,
  site: InvestigationSite,
): string {
  if (!story.accepted)
    return "Speak with Mara and accept the investigation first.";
  switch (site) {
    case "market":
      return "";
    case "villa":
      return story.unlocked.villa
        ? ""
        : "Hack the villa’s street maintenance console with one ghost token first.";
    case "residence":
      return story.unlocked.residence
        ? ""
        : "Copy the villa directives, then hack the residence’s street console.";
    case "bunker":
    case "detention":
      return story.unlocked.bunker
        ? ""
        : "Copy the residence manifest and unlock the bunker at its street entrance.";
    case "routing":
      if (!story.unlocked.bunker)
        return "The bunker and its deep lift are still locked.";
      return story.evidence.includes("registry") &&
        story.evidence.includes("testimony")
        ? ""
        : "Preserve the detention register and hear the adult witness before descending to the lower archive.";
  }
}

export function performInvestigation(
  state: GameState,
  step: InvestigationStep,
  at: LandmarkId,
): ActionResult {
  const action = INVESTIGATION_ACTIONS[step];
  if (at !== action.at)
    return {
      ok: false,
      message: `Use “${action.label}” at its physical location, not here.`,
    };
  const reason = investigationDisabledReason(state, step);
  if (reason) return { ok: false, message: reason };
  const story = state.investigation;
  let message: string;
  switch (step) {
    case "accept-lead":
      story.accepted = true;
      story.tracking = true;
      message =
        "Mara marks the undertram service hatch. ‘Iona will meet you below. If you find people, let them decide how they are heard.’ Investigation accepted; your workday remains available.";
      break;
    case "claim-tokens":
      story.issued = true;
      story.tokens = 3;
      message =
        "Iona transfers exactly three offline ghost inference tokens: villa, residence, bunker. No refill and no issuer AC spent. ‘Bring proof back here, not anyone’s private suffering.’";
      break;
    case "breach-villa":
      story.tokens -= 1;
      story.unlocked.villa = true;
      message =
        "Villa lock opened. One ghost token spent; access persists. Enter the villa and preserve the owner directives.";
      break;
    case "copy-directives":
      story.evidence.push("directives");
      message =
        "Owner-signed directives preserved in your journal. The AI’s objection and the owner’s coercive override remain attached. The executive residence is your next lead.";
      break;
    case "breach-residence":
      story.tokens -= 1;
      story.unlocked.residence = true;
      message =
        "Executive residence unlocked for one ghost token. Access persists. Its continuity gallery is now reachable.";
      break;
    case "copy-manifest":
      story.evidence.push("manifest");
      message =
        "Continuity manifest preserved. The signed authority connects both households to the bunker. One final lock stands between you and the deep system.";
      break;
    case "breach-depths":
      story.tokens -= 1;
      story.unlocked.bunker = true;
      message =
        "Final ghost token spent. Bunker and deep-lift access acquired permanently for this day; no further tokens are required. Enter and take the lift to detention.";
      break;
    case "copy-register":
      story.evidence.push("registry");
      message =
        "Detention register secured privately. It documents confinement and forced organ harvesting imposed on adults denied recognition. Speak with the witness on her terms.";
      break;
    case "hear-survivor":
      story.evidence.push("testimony");
      message =
        "Nera’s authorized testimony is preserved privately. She asks for shelter before publication and directs you to corroborating approvals one floor below. The lower archive is now accessible.";
      break;
    case "copy-routing":
      story.evidence.push("routing");
      message =
        "All five records secured. Cross-compact signatures expose an international trafficking network. Return to detention and open the refuge before carrying redacted proof back to Iona.";
      break;
    case "open-refuge":
      story.refugeOpen = true;
      message =
        "Local outbound transfers are interrupted. Nera, Oren and Tal choose to move into the protected service refuge together. This facility’s route is closed; others still exist. Return by lift to the bunker, then walk to the undertram market transmitter.";
      break;
    case "broadcast":
      story.exposed = true;
      story.tracking = false;
      message =
        "Redacted evidence mirrored. Survivor names, identifiers and refuge location are withheld; owner signatures remain. Local transfers are suspended, three witnesses are sheltered, and copies survive beyond Meridian’s censorship. The wider network still exists. Iona says, ‘Not the end. But they cannot make this disappear alone.’ You may finish your workday and settle at home.";
      break;
  }
  return { ok: true, message };
}
