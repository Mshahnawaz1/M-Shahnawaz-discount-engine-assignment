// Shared inline style tokens — mirror the CSS variables in index.css
// (opptra.com palette: orange #ff5800, beige #fffce8, dark grey #22221f).

export const C = {
  navy: '#22221f', // ink (kept key name for existing components)
  orange: '#ff5800',
  orangeDark: '#d74a00',
  orangeTint: '#fff1e8',
  green: '#1e6b3a',
  greenBg: '#e9f6ee',
  grey: '#6f6b63',
  border: '#ece7dc',
  amber: '#8a4a00',
  amberBg: '#fff6e0',
  blue: '#d74a00', // accent for the confirmation card
  blueBg: '#fffce8',
  beige: '#fffce8',
}

const pill = {
  borderRadius: '100vw', fontFamily: "'Raleway', Arial, sans-serif", fontWeight: 600,
  textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
}

export const S = {
  hint: { fontSize: 13, color: C.grey, marginTop: 6 },
  subTitle: { fontSize: 12, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '26px 0 10px' },
  btnSmall: { ...pill, background: C.orange, color: '#fff', border: `2px solid ${C.orange}`, padding: '8px 18px', fontSize: 13 },
  btnGhost: { ...pill, background: 'transparent', color: C.navy, border: `2px solid ${C.border}`, padding: '8px 18px', fontSize: 13 },
  tag: (color, bg) => ({
    display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px',
    borderRadius: '100vw', background: bg, color, textTransform: 'uppercase', letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
  }),
}

export const STATUS_TAG = {
  'max-discount': { label: 'Max discount', color: '#d74a00', bg: '#fff1e8' },
  stacked: { label: 'Stacked', color: '#fffce8', bg: '#22221f' },
  applied: { label: 'Discount applied', color: '#1e6b3a', bg: '#e9f6ee' },
  none: { label: 'No offer', color: '#6f6b63', bg: '#f1eee7' },
}
