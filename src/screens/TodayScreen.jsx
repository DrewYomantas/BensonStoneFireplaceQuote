import NextActionBar from '../components/shell/NextActionBar.jsx'
import TodayActionCard from '../components/today/TodayActionCard.jsx'
import { badgesForFile } from '../lib/fieldRulesBadges.js'

const SAMPLE_FILES = [
  {
    id: 'sample-karpinski',
    stamp: 'OVERDUE · 7 DAYS',
    state: 'blocked',
    name: 'Karpinski, Tom',
    note: 'Promised stone allowance estimate Friday.',
    tag: '04-198 · gas insert',
    source: 'bistrack',
    sourceLabel: 'BT-44217',
    nextAction: 'Call about stone allowance before noon',
    fieldRuleSample: {
      lensSetupType: 'zero-clearance-metal-fireplace',
      existingNotes: 'Gas insert into existing prefab; full install scope, drywall finish work.',
      projectAddress: '14 Oak Ln, Rockford IL 61104',
    },
  },
  {
    id: 'sample-hernandez',
    stamp: 'TODAY · 14:30',
    state: 'review',
    name: 'Hernandez, M & J',
    note: 'Showroom appt. Bring Cosmo I35 spec sheet.',
    tag: '04-217 · wood→gas insert',
    source: 'verified',
    nextAction: 'Confirm flue + gas line at the 2:30',
  },
  {
    id: 'sample-powell',
    stamp: 'WAITING · 11 DAYS',
    state: 'waiting',
    name: 'Powell, Rebecca',
    note: 'Asked about gas line cost. No reply.',
    tag: '04-189 · gas insert · prefers text',
    source: 'said',
    sourceLabel: 'CUSTOMER SAID',
    nextAction: 'Send a warm nudge text',
  },
  {
    id: 'sample-vinson',
    stamp: 'NEW · 11:14',
    state: 'review',
    name: 'Vinson, James',
    note: 'Walk-in. Existing zero-clearance, bedroom remodel.',
    tag: 'Draft 04-220 · file unfinished',
    source: 'manual',
    sourceLabel: 'DRAFT',
    nextAction: 'Finish visit capture + add measurements',
    fieldRuleSample: {
      existingNotes: 'Empire vent-free log set in masonry fireplace, customer wants more heat.',
    },
  },
]

export default function TodayScreen({ onOpenStartVisit, onOpenFile }) {
  return (
    <>
      <div className="shell-content">
        <div style={{ padding: '24px 28px 28px' }}>
          <div className="hstack">
            <h2 className="serif-h h3">Good morning, Drew.</h2>
            <span className="spacer" />
            <span className="body-sm">14 active files · 4 need you today · 1 overdue</span>
          </div>
          <p className="body" style={{ marginTop: 4, color: 'var(--slate)' }}>
            Two walk-ins on the books. Two promises from last week. The desk is calm.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 22 }}>
            {SAMPLE_FILES.map((f) => (
              <TodayActionCard
                key={f.id}
                stamp={f.stamp}
                state={f.state}
                name={f.name}
                note={f.note}
                tag={f.tag}
                source={f.source}
                sourceLabel={f.sourceLabel}
                nextAction={f.nextAction}
                fieldRuleBadges={f.fieldRuleSample ? badgesForFile(f.fieldRuleSample) : []}
                onOpen={() => onOpenFile && onOpenFile(f.id)}
              />
            ))}
          </div>
        </div>
      </div>
      <NextActionBar
        action="Call Karpinski before noon — the stone allowance was promised Friday."
        why="7 days since last contact. Customer prefers phone."
        blocking="Stone allowance number not finalised."
        dontForget="Mention the home-measure window — easier to schedule on the call."
        primary={
          <button type="button" className="btn btn-primary" onClick={() => onOpenFile && onOpenFile('sample-karpinski')}>
            Open Karpinski file
          </button>
        }
        secondary={
          <button type="button" className="btn btn-quiet" onClick={onOpenStartVisit}>
            Start a new visit
          </button>
        }
      />
    </>
  )
}
