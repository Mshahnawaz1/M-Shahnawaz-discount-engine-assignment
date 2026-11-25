/**
 * DataTable.jsx
 *
 * Renders a simple table from an array of objects.
 * Columns are defined as [{ key, label, render? }].
 */

const wrap = { overflowX: 'auto', border: '1px solid #ece7dc', borderRadius: 12 }

export default function DataTable({ columns, rows, emptyMessage = 'No data loaded.' }) {
  if (!rows || rows.length === 0) {
    return <div style={{ ...wrap, padding: '1.2rem', textAlign: 'center', color: '#6f6b63', fontSize: 14 }}>{emptyMessage}</div>
  }

  return (
    <div style={wrap}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#fffce8' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '11px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#22221f',
                  textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', borderBottom: '1px solid #f3ecc9',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.itemId ?? row.ruleId ?? i} style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid #f3f0e8' }}>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '10px 10px', color: '#22221f', verticalAlign: 'top' }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
