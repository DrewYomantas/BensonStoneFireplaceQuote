import { useMemo, useState } from 'react'
import { updateCustomerFile } from '../lib/customerFile.js'
import { buildFollowUpTask, buildSnoozePatch, planFollowUpTasks, upsertFollowUpTask } from '../lib/followUpPlanner.js'

const C = {
  mid: '#2d4a36', paper: '#faf6ec', copper: '#b9743a', gold: '#c9a24c', rust: '#8a3a1e',
  ink: '#2a221a', inkMid: '#5a4f3f', inkLight: '#8a7c64', border: 'rgba(50,38,22,0.18)',
}
const eyebrow = { fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }
const serif = { fontFamily: 'Georgia,"Times New Roman",serif' }
const inputStyle = { padding: '7px 9px', border: `1px solid ${C.border}`, background: '#fff', color: C.ink, fontSize: 12, fontFamily: 'inherit', width: '100%' }

function formatDue(iso) {
  if (!iso) return 'no due date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'invalid date'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function FollowUpPlanPanel({ file, onChange }) {
  const plan = useMemo(() => planFollowUpTasks(file || {}), [file])
  const [customLabel, setCustomLabel] = useState('')
  const [customDue, setCustomDue] = useState('')

  function saveTasks(tasks) {
    if (!file?.id) return
    let list = file.followUpTasks || []
    for (const task of tasks) list = upsertFollowUpTask({ followUpTasks: list }, task)
    const updated = updateCustomerFile(file.id, { followUpTasks: list })
    if (onChange) onChange(updated)
  }

  function addCustom() {
    const task = buildFollowUpTask({ label: customLabel, dueAt: customDue ? new Date(customDue).toISOString() : undefined, channel: 'email' })
    if (!task || !file?.id) return
    const updated = updateCustomerFile(file.id, { followUpTasks: [...(file.followUpTasks || []), task] })
    setCustomLabel('')
    setCustomDue('')
    if (onChange) onChange(updated)
  }

  function markDone(task) {
    if (!file?.id) return
    const updated = updateCustomerFile(file.id, {
      followUpTasks: (file.followUpTasks || []).map((t) => t.id === task.id ? { ...t, doneAt: new Date().toISOString() } : t),
    })
    if (onChange) onChange(updated)
  }

  function snooze(task, days) {
    if (!file?.id) return
    const changed = buildSnoozePatch(task, days)
    if (!changed) return
    const updated = updateCustomerFile(file.id, {
      followUpTasks: (file.followUpTasks || []).map((t) => t.id === task.id ? changed : t),
    })
    if (onChange) onChange(updated)
  }

  const openTasks = (file?.followUpTasks || []).filter((task) => !task.doneAt)

  return (
    <section style={{ background: C.paper, border: `1px solid ${C.border}`, borderLeft: `3px solid ${plan.required ? C.copper : C.mid}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...eyebrow, color: C.copper, fontSize: 8.5 }}>Follow-Up Plan</div>
        <span className={`wb-pill ${plan.required ? 'wb-pill--gold' : 'wb-pill--green'}`}>{plan.required ? 'Action needed' : 'Current'}</span>
      </div>
      <div style={{ ...serif, fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 4 }}>{plan.nextAction}</div>

      {plan.tasks.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...eyebrow, color: C.inkLight, fontSize: 8, marginBottom: 6 }}>Suggested real tasks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plan.tasks.map((task) => (
              <div key={task.planId} style={{ display: 'flex', gap: 8, alignItems: 'center', border: `1px solid ${C.border}`, background: '#fff', padding: '8px 10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{task.label}</div>
                  <div style={{ fontSize: 10.5, color: C.inkMid, marginTop: 2 }}>Due {formatDue(task.dueAt)} · {task.reason}</div>
                </div>
                <button type="button" className="wb-btn wb-btn--primary" onClick={() => saveTasks([task])} style={{ fontSize: 10 }}>Add task</button>
              </div>
            ))}
          </div>
          <button type="button" className="wb-btn" onClick={() => saveTasks(plan.tasks)} style={{ marginTop: 8, fontSize: 11 }}>Add all suggested tasks</button>
        </div>
      )}

      {openTasks.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...eyebrow, color: C.inkLight, fontSize: 8, marginBottom: 6 }}>Open tasks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {openTasks.map((task) => (
              <div key={task.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: `1px solid ${C.border}`, background: '#fff', padding: '8px 10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{task.label}</div>
                  <div style={{ fontSize: 10.5, color: C.inkMid, marginTop: 2 }}>Due {formatDue(task.dueAt)}{task.snoozedAt ? ' · snoozed' : ''}</div>
                </div>
                <button type="button" className="wb-btn" onClick={() => snooze(task, 1)} style={{ fontSize: 10 }}>Snooze +1 day</button>
                <button type="button" className="wb-btn wb-btn--primary" onClick={() => markDone(task)} style={{ fontSize: 10 }}>Done</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Custom follow-up task</span>
          <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...eyebrow, color: C.inkLight, fontSize: 7.5 }}>Due date</span>
          <input type="date" value={customDue} onChange={(e) => setCustomDue(e.target.value)} style={inputStyle} />
        </label>
        <button type="button" className="wb-btn wb-btn--primary" onClick={addCustom} style={{ fontSize: 11 }}>Add</button>
      </div>
    </section>
  )
}
