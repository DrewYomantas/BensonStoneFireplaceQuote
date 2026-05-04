import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getGuidedPathRecommendation, buildGuidedPathPatch } from './guidedPathRules.js'

describe('guidedPathRules', () => {
  it('keeps gas logs and gas insert paths open for masonry less-mess customer', () => {
    const rec = getGuidedPathRecommendation({
      existingApplianceType: 'fireplace',
      existingFuelType: 'wood',
      existingNotes: 'masonry fireplace',
      customerGoal: 'Less mess and better ambiance than wood',
    })
    assert.ok(rec.possiblePaths.some((p) => /gas log/i.test(p.label)))
    assert.ok(rec.possiblePaths.some((p) => /gas insert/i.test(p.label)))
    assert.ok(rec.questions.some((q) => /heat/i.test(q)))
    assert.ok(rec.questions.some((q) => /natural gas|propane|gas/i.test(q)))
  })

  it('recommends inserts for masonry heat goal with chimney and measurement questions', () => {
    const rec = getGuidedPathRecommendation({
      existingApplianceType: 'fireplace',
      existingNotes: 'masonry fireplace',
      customerGoal: 'Need more heat from the fireplace',
    })
    assert.ok(rec.possiblePaths.some((p) => /gas insert/i.test(p.label)))
    assert.ok(rec.possiblePaths.some((p) => /wood insert/i.test(p.label)))
    assert.ok(rec.questions.some((q) => /chimney/i.test(q)))
    assert.ok(rec.questions.some((q) => /opening width/i.test(q)))
  })

  it('slows down prefab or ZC without model tag', () => {
    const rec = getGuidedPathRecommendation({
      existingNotes: 'Customer thinks it is a prefab zero-clearance fireplace',
      customerGoal: 'Wants gas logs',
    })
    assert.equal(rec.possiblePaths[0].id, 'verify-prefab-zc')
    assert.ok(rec.cautions.some((c) => /do not assume/i.test(c)))
    assert.ok(rec.questions.some((q) => /model\/serial tag/i.test(q)))
  })

  it('sends modern remodel to direct vent gas or electric discovery', () => {
    const rec = getGuidedPathRecommendation({ customerGoal: 'New wall remodel with modern linear look' })
    assert.ok(rec.possiblePaths.some((p) => /direct vent gas/i.test(p.label)))
    assert.ok(rec.possiblePaths.some((p) => /electric/i.test(p.label)))
    assert.ok(rec.questions.some((q) => /wall depth|framing/i.test(q)))
  })

  it('appearance-only stays in doors/screens/surrounds lane', () => {
    const rec = getGuidedPathRecommendation({ customerGoal: 'Appearance only, wants new doors and stone surround' })
    assert.equal(rec.possiblePaths[0].id, 'fireplace-appearance-refresh')
    assert.ok(rec.safeDiscussionSummary.includes('appearance refresh'))
  })

  it('builds a save patch without inventing internal-only fields', () => {
    const patch = buildGuidedPathPatch({ customerGoal: 'masonry less mess', existingNotes: 'masonry fireplace' }, { guidedPathNotes: 'Ask about gas line.' })
    assert.ok(patch.likelyPath)
    assert.ok(patch.nextBestQuestion)
    assert.equal(patch.guidedPathNotes, 'Ask about gas line.')
  })
})
