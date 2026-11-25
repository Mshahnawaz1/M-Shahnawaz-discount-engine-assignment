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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label}`}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      style={{
        border: `2px dashed ${hasData ? '#1e5c2c' : '#CECECE'}`,
        borderRadius: 6,
        padding: '0.8rem 1rem',
        background: hasData ? '#f0faf2' : '#fafafa',
        cursor: busy ? 'progress' : 'pointer',
        transition: 'border-color 0.15s',
        minWidth: 0,
      }}
      onClick={() => !busy && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleFile} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 20 }}>{busy ? '⏳' : hasData ? '✅' : '📄'}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {busy ? 'Reading…' : hasData ? fileName : description}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: hasData ? '#1e5c2c' : '#FF5800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {hasData ? 'Change' : 'Upload'}
          </span>
        </div>
      </div>
    </div>
  )
}
