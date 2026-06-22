// Generative gradient palettes per platform. Two-stop gradients chosen so
// that a game without cover art still feels platform-coded at a glance.
export const PLATFORM_PALETTES = {
  PS5: [
    ['#1e3a8a', '#312e81'],
    ['#1e40af', '#0f172a'],
    ['#312e81', '#0f172a'],
  ],
  PS4: [
    ['#1e3a8a', '#0f172a'],
    ['#0c4a6e', '#1e293b'],
  ],
  PS3: [
    ['#164e63', '#0f172a'],
    ['#155e75', '#1e293b'],
  ],
  Switch: [
    ['#7f1d1d', '#1c1917'],
    ['#9f1239', '#171717'],
    ['#881337', '#1c1917'],
  ],
  'Switch 2': [
    ['#991b1b', '#18181b'],
    ['#b91c1c', '#1c1917'],
  ],
  Wii: [
    ['#7c2d12', '#1c1917'],
    ['#92400e', '#1c1917'],
  ],
  N64: [
    ['#365314', '#1c1917'],
    ['#3f6212', '#0f172a'],
  ],
  DS: [
    ['#1e1b4b', '#0c0a09'],
    ['#312e81', '#1c1917'],
  ],
  GBA: [
    ['#854d0e', '#1c1917'],
    ['#92400e', '#0c0a09'],
  ],
  Gameboy: [
    ['#3f6212', '#0c0a09'],
    ['#365314', '#1c1917'],
  ],
};

export const DEFAULT_PALETTE = [
  ['#27272a', '#09090b'],
  ['#3f3f46', '#18181b'],
];

// Manual cover overrides for games RAWG mis-matched or that need a better
// image. Applied at READ time, so no re-enrichment of localStorage is required.
export const COVER_OVERRIDES = {
  'spider-man-miles-morales-2020': {
    coverImage: 'https://media.rawg.io/media/games/048/048b46cdc66cbc7e235e1f359c2a77ec.jpg',
  },
  'the-last-of-us-part-i-2013': {
    coverImage: 'https://media.rawg.io/media/games/71d/71df9e759b2246f9769126c98ac997fc.jpg',
  },
  'pok-mon-scarlet-2022': {
    coverImage: 'https://media.rawg.io/media/games/5ab/5abb8e4af55eb8c867410c3a740355b9.jpg',
  },
  'pok-mon-soul-silver-2009': {
    coverImage: 'https://media.rawg.io/media/games/a9b/a9b87910722fd2ce7d14d8f9a7fa4d5a.jpg',
  },
  'pokopia-2026': {
    coverImage: 'https://media.rawg.io/media/games/67a/67a161425e620772ba69c3caa8f48a95.jpg',
  },
  'sonic-x-shadow-generations-2024': {
    coverImage: 'https://media.rawg.io/media/screenshots/797/797fc5d525fd1ec461268f43aad06dfd.jpg',
  },
  mixtape: {
    coverImage: 'https://media.rawg.io/media/games/a57/a571fcbc2b2ef30fb3e13a4272ef3a93.jpeg',
  },
  'marvel-1943-rise-of-hydra': {
    coverImage: 'https://media.rawg.io/media/screenshots/75b/75b5b95614f7a958a5e7171454d53fd1.jpg',
  },
  'tides-of-annihilation': {
    coverImage: 'https://media.rawg.io/media/screenshots/9f2/9f20a2fa3ecdd23aaa67b23a3f255c9a.jpg',
  },
  // RAWG has no usable cover yet for these — they'll keep their gradient
  // until announced: 'the-duskbloods', 'exodus', 'pok-mon-winds-waves'.
};

// RAWG platform IDs (from /platforms). Only the ones we care about.
export const RAWG_PLATFORM_IDS = {
  PS5: 187, PS4: 18, PS3: 16, PS2: 15, PS: 27,
  'Switch 2': 832, Switch: 7,
  'Wii U': 10, Wii: 11, N64: 83, DS: 9, '3DS': 8,
  GBA: 24, GBC: 26, Gameboy: 26, GameCube: 105,
  NES: 49, SNES: 79,
  'Xbox Series': 186, 'Xbox One': 1, 'Xbox 360': 14, Xbox: 80,
  PC: 4, Mac: 5, Linux: 6, iOS: 3, Android: 21,
};

// Verbose RAWG platform names → the short codes the user types.
export const PLATFORM_SHORT = {
  'PlayStation 5': 'PS5',
  'PlayStation 4': 'PS4',
  'PlayStation 3': 'PS3',
  'PlayStation 2': 'PS2',
  PlayStation: 'PS',
  'Nintendo Switch 2': 'Switch 2',
  'Nintendo Switch': 'Switch',
  'Nintendo 64': 'N64',
  'Nintendo DS': 'DS',
  'Nintendo 3DS': '3DS',
  'Game Boy Advance': 'GBA',
  'Game Boy Color': 'GBC',
  'Game Boy': 'Gameboy',
  'Nintendo GameCube': 'GameCube',
  GameCube: 'GameCube',
  'Wii U': 'Wii U',
  Wii: 'Wii',
  'Nintendo Entertainment System (NES)': 'NES',
  NES: 'NES',
  'Super Nintendo Entertainment System (SNES)': 'SNES',
  SNES: 'SNES',
  'Xbox Series S/X': 'Xbox Series',
  'Xbox One': 'Xbox One',
  'Xbox 360': 'Xbox 360',
  Xbox: 'Xbox',
  PC: 'PC',
  macOS: 'Mac',
  Linux: 'Linux',
  iOS: 'iOS',
  Android: 'Android',
};

// Preference order when RAWG returns a multi-platform game.
// Biases toward modern consoles — matches an AAA/first-party gaming profile.
export const PLATFORM_PRIORITY = [
  'PlayStation 5', 'Nintendo Switch 2', 'PlayStation 4', 'Nintendo Switch',
  'Xbox Series S/X', 'Xbox One',
  'PlayStation 3', 'Wii U', 'PlayStation 2', 'Wii', 'Xbox 360',
  'Nintendo 3DS', 'Nintendo DS', 'PlayStation', 'Xbox', 'Nintendo GameCube',
  'Game Boy Advance', 'Nintendo 64',
  'Super Nintendo Entertainment System (SNES)', 'SNES',
  'Nintendo Entertainment System (NES)', 'NES',
  'Game Boy Color', 'Game Boy',
  'PC', 'macOS', 'Linux', 'iOS', 'Android',
];
