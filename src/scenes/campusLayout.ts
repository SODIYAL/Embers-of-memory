// Campus stage layout — the composed pixel-art scene. Every coordinate is
// in 1280×720 screen space; sprites are 1×-resolution pixel art drawn at
// scale 2, positioned by their feet (origin 0.5, 1) so depth sorting works.
//
// The scene reads as a Himalayan clifftop plateau: procedural sky backdrop
// (horizon at y≈410), tiled grass with a flagstone courtyard, the founding
// hall at the top, and props scattered around the courtyard the scholars
// wander. Buildings beyond the hall appear as the institution's tier grows.

export interface SetPiece {
  key: string;          // texture key
  x: number;            // feet center x
  y: number;            // feet y
  minTier?: number;     // hidden below this institution tier
  walkable?: boolean;   // true → lives in the actor layer and y-sorts with scholars
}

// Horizon line of the sky backdrop at 2× (backdrop y=205 → screen 410).
export const SKY_HORIZON_Y = 410;

// Ground bands (tileSprites, drawn under everything but the sky).
export const GROUND = {
  // Grass plateau from just above the horizon to the bottom of the screen.
  grass: { x: 0, y: 396, w: 1280, h: 324 },
  // Flagstone courtyard where campus life happens.
  courtyard: { x: 332, y: 444, w: 632, h: 232 },
  // Path from the hall door down into the courtyard.
  path: { x: 596, y: 396, w: 88, h: 56 },
  // Terrace wall along the cliff edge at the bottom.
  rim: { x: 0, y: 692, w: 1280, h: 28 },
};

// Static architecture (above and beside the courtyard — plain stage layer).
export const BUILDINGS: SetPiece[] = [
  { key: 'building_founding_hall',   x: 640,  y: 432 },
  { key: 'building_founders_tower',  x: 156,  y: 420 },
  { key: 'building_library',         x: 320,  y: 426, minTier: 2 },
  { key: 'building_scriptorium_wing',x: 1000, y: 430, minTier: 3 },
  { key: 'building_observatory',     x: 1156, y: 416, minTier: 3 },
];

// Courtyard set pieces — these y-sort with the scholars.
export const COURTYARD_PROPS: SetPiece[] = [
  { key: 'prop_tree',  x: 384,  y: 470, walkable: true },
  { key: 'prop_tree',  x: 1018, y: 502, walkable: true },
  { key: 'prop_well',  x: 836,  y: 478, walkable: true },
  { key: 'prop_bench', x: 478,  y: 624, walkable: true },
  { key: 'prop_bench', x: 802,  y: 624, walkable: true },
  { key: 'prop_garden',             x: 196,  y: 700, walkable: true },
  { key: 'prop_teaching_courtyard', x: 1084, y: 704, walkable: true, minTier: 2 },
];

// Lanterns — texture swaps to prop_lantern_on after dusk; each carries a
// warm halo in the night-lights layer.
export const LANTERNS: Array<{ x: number; y: number }> = [
  { x: 556, y: 440 },   // flanking the hall door
  { x: 724, y: 440 },
  { x: 396, y: 664 },   // courtyard corners
  { x: 884, y: 664 },
];

// Lit hall windows after dark — soft ADD-blend glows over the sprite's
// painted windows (positions relative to the hall at (640, 432)).
export const WINDOW_GLOWS: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 576, y: 350, w: 20, h: 26 },
  { x: 704, y: 350, w: 20, h: 26 },
  { x: 640, y: 300, w: 26, h: 20 },
];
