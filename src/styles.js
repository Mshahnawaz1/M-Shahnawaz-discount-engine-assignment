// Shared inline styles (Opptra palette), extracted from the base App.jsx.

export const C = {
  navy: '#131A48',
  orange: '#FF5800',
  green: '#1e5c2c',
  greenBg: '#e8f5ec',
  grey: '#888',
  border: '#CECECE',
  amber: '#8a5a00',
  amberBg: '#fff7e0',
  blue: '#1a3fa0',
  blueBg: '#e6edfc',
}

export const S = {
  page: { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif', color: C.navy },
  header: { background: C.navy, padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoSpan: { color: C.orange },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main: { maxWidth: 1040, margin: '0 auto', padding: '1.8rem 1rem' },
  section: { background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '1.2rem 1.2rem', marginBottom: '1.2rem', minWidth: 0 },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: C.navy, marginBottom: '0.7rem', paddingBottom: 6, borderBottom: `2px solid ${C.orange}`, display: 'inline-block' },
  subTitle: { fontSize: 11, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '1rem 0 0.4rem' },
  hint: { fontSize: 11, color: C.grey, marginTop: 4 },
  btn: {
    background: C.orange, color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  btnSmall: {
    background: C.orange, color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.45rem 0.9rem', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  btnGhost: {
    background: 'transparent', color: C.navy, border: `1px solid ${C.border}`, borderRadius: 4,
    padding: '0.45rem 0.9rem', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  tag: (color, bg) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 7px',
    borderRadius: 20, background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  }),
}

export const STATUS_TAG = {
  'max-discount': { label: 'Max discount', color: C.amber, bg: C.amberBg },
  stacked: { label: 'Stacked', color: C.blue, bg: C.blueBg },
  applied: { label: 'Discount applied', color: C.green, bg: C.greenBg },
  none: { label: 'No offer', color: '#555', bg: '#eee' },
}
