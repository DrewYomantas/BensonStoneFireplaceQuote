// Build a Field Rules engine input from the in-progress Setup + Goal Lens
// draft layered onto the saved Customer File. Pure logic so the Lens screen
// can preview the rule findings before saving without duplicating
// rule logic or projection rules.
//
// The engine itself runs `projectFileForFieldRules`, so we only need to
// surface the lens fields the engine reads. We pass the saved customer file
// as the base (so rules that depend on saved-only fields like the ZC ack
// timestamp keep working) and overlay the draft's lens picks plus any
// salesperson notes the rep typed during this Lens session.

import { normalizeLensDraft } from './setupGoalLens.js'

export function buildLensEngineInput(savedFile = {}, rawDraft = {}) {
  const draft = normalizeLensDraft(rawDraft)
  return {
    ...(savedFile || {}),
    lensSetupType: draft.setupType,
    lensSetupTypeSource: draft.setupTypeSource,
    lensFuelGasPresent: draft.fuelGasPresent,
    lensFuelGasPresentSource: draft.fuelGasPresentSource,
    lensFuelElectricPresent: draft.fuelElectricPresent,
    lensFuelElectricPresentSource: draft.fuelElectricPresentSource,
    lensGasType: draft.gasType,
    lensGasTypeSource: draft.gasTypeSource,
    lensVenting: draft.venting,
    lensVentingSource: draft.ventingSource,
    lensConstructionFlags: draft.constructionFlags,
    lensSalespersonNotes: draft.salespersonNotes,
  }
}
