/**
 * CsvUploader.jsx
 *
 * Renders a file upload area for a single file.
 * - CSV (default): calls onLoad(text, fileName)
 * - readAs="file": calls onLoad(File, fileName) — used for PDFs, which the
 *   adapter reads itself.
 */

import { useRef } from 'react'

export default function CsvUploader({ label, description, onLoad, hasData, fileName, accept = '.csv', readAs = 'text', busy = false }) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (readAs === 'file') {
      onLoad(file, file.name)
    } else {
      const reader = new FileReader()
      reader.onload = (evt) => onLoad(evt.target.result, file.name)
      reader.readAsText(file)
    }
    // Reset input so the same file can be re-uploaded
    e.target.value = ''
  }

  const open = () => !busy && inputRef.current?.click()

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label}`}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}
      onClick={open}
      style={{
        border: `1.5px dashed ${hasData ? '#1e6b3a' : '#e3d9c2'}`,
        borderRadius: 14,
        padding: '14px 16px',
        background: hasData ? '#e9f6ee' : '#fffce8',
        cursor: busy ? 'progress' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        minWidth: 0,
      }}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleFile} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
            background: hasData ? '#1e6b3a' : '#ff5800', color: '#fff', fontWeight: 700, fontSize: 15,
          }}
        >
          {busy ? '…' : hasData ? '✓' : '↑'}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#22221f' }}>{label}</div>
          <div style={{ fontSize: 12, color: '#6f6b63', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {busy ? 'Reading…' : hasData ? fileName : description}
          </div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: hasData ? '#1e6b3a' : '#ff5800', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {hasData ? 'Change' : 'Upload'}
        </span>
      </div>
    </div>
  )
}
