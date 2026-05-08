import { sourceClassName, sourceLabel } from '../../lib/sourceTrust.js'

export default function SourceTrustBadge({ kind, label, children }) {
  const text = children != null ? children : sourceLabel(kind, label)
  return <span className={sourceClassName(kind)}>{text}</span>
}
