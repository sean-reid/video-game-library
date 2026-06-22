// Rating rubric — ten weighted categories totaling 100. The order here is
// the order they render in the breakdown and the spider chart.
export const CATEGORIES = [
  { key: 'narrative', label: 'Narrative', full: 'Narrative / Engagement' },
  { key: 'worldLevel', label: 'World', full: 'World / Level Design' },
  { key: 'gameplay', label: 'Gameplay', full: 'Gameplay Design' },
  { key: 'art', label: 'Art', full: 'Art Direction' },
  { key: 'scoreAudio', label: 'Audio', full: 'Score & Audio' },
  { key: 'difficulty', label: 'Difficulty', full: 'Difficulty & Reward' },
  { key: 'impact', label: 'Impact', full: 'Impact' },
  { key: 'playTime', label: 'Endurance', full: 'Play Time & Endurance' },
  { key: 'emotional', label: 'Emotion', full: 'Emotional Interest' },
  { key: 'value', label: 'Value', full: 'Value' },
];

// Tier colors — medal-style: Gold / Silver / Bronze.
export const TIER_COLOR_FOR_LABEL = {
  Masterpiece: '#e2b878',
  Amazing: '#a8b4c0',
  Great: '#b87349',
};

// UI metadata per library state.
export const STATE_META = {
  played: { label: 'Played', verb: 'rated' },
  playing: { label: 'Playing', verb: 'currently playing' },
  upcoming: { label: 'Upcoming', verb: 'release confirmed' },
  rumored: { label: 'Rumored', verb: 'no date yet' },
  recommended: { label: 'Recommended', verb: 'on the list' },
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MONTH_TO_NUM = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

// Approximate day-of-year offsets for season-only release dates like
// "Summer 2026". Used as a sort key when no specific month is known.
export const SEASON_OFFSETS = {
  spring: 300, summer: 600, fall: 900, autumn: 900, winter: 1200,
};
