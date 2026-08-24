/**
 * Design tokens — single source of truth mirrored by apps/web globals.css.
 * From the reference prototype (visual source of truth).
 */
export const tokens = {
  color: {
    paper: '#F4F6F1', ink: '#16211E', tape: '#FFC526', fat: '#E4572E', lean: '#1E8A5A',
    steel: '#5A6B66', line: '#DDE3DA', card: '#FFFFFF', amber: '#D9930D', bone: '#7A6A55',
    beige: '#EDE8DA', beige2: '#E3DCC9', beigeline: '#D6CDB8', proc: '#2F5D8A',
  },
  font: {
    display: "'Barlow Condensed', sans-serif",   // headings, uppercase
    body: "'IBM Plex Sans', sans-serif",
    mono: "'IBM Plex Mono', monospace",          // labels & figures
  },
  chart: {
    categorical: ['#E4572E', '#1E8A5A', '#D9930D', '#5A6B66', '#2F5D8A', '#7A6A55'],
    stages: { committed: '#1E8A5A', forecast: '#D9930D', pipeline: '#5A6B66' },
  },
} as const;

export type Tokens = typeof tokens;
