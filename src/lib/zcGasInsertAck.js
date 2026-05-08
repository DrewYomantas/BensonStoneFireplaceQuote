// Shared helper for the ZC gas-insert acknowledgement (Field Rule 2).
//
// The acknowledgement happens from two surfaces:
//   - Customer File: ack only.
//   - Setup + Goal Lens: ack must persist the in-progress Lens draft in the
//     same write so unsaved field edits are not lost.
//
// Both go through the durable Customer File store. This helper builds a
// single merged patch and writes it once. Callers receive the saved row so
// they can re-project for display without an extra read.

import { updateCustomerFileDurable } from './customerFileDurable.js'
import { buildZcGasInsertAckPatch } from './fieldRules.js'
import { isSensitiveKey } from './salesOsStorageSchema.js'

function stripSensitive(record) {
  if (!record || typeof record !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(record)) {
    if (isSensitiveKey(k)) continue
    out[k] = v
  }
  return out
}

// storage:        Sales OS storage instance (required)
// fileId:         Customer File id (required)
// actor:          Display string for who acknowledged (e.g. customer name)
// extraPatch:     Optional additional fields to merge in the same write
//                 (e.g. the Lens patch). Sensitive keys are stripped.
// now:            Optional Date for deterministic tests.
export async function acknowledgeZcGasInsertOnFile({
  storage,
  fileId,
  actor = '',
  extraPatch = null,
  now = new Date(),
} = {}) {
  if (!storage) throw new Error('acknowledgeZcGasInsertOnFile: storage required')
  if (!fileId) throw new Error('acknowledgeZcGasInsertOnFile: fileId required')
  const ack = buildZcGasInsertAckPatch(now, actor)
  const merged = { ...stripSensitive(extraPatch), ...ack }
  return updateCustomerFileDurable(storage, fileId, merged, now)
}
