import { useEffect, useState } from 'react'
import './styles/tokens.css'
import './styles/app.css'
import AppShell from './components/shell/AppShell.jsx'
import TodayScreen from './screens/TodayScreen.jsx'
import StartVisitScreen from './screens/StartVisitScreen.jsx'
import CustomerFileScreen from './screens/CustomerFileScreen.jsx'
import SetupGoalLensScreen from './screens/SetupGoalLensScreen.jsx'
import BackstageBackup from './components/shell/BackstageBackup.jsx'
import { ensureSalesOsBoot } from './lib/salesOsStorageBoot.js'

const TITLES = {
  today: 'Today at the desk',
  visit: 'Start a visit',
  files: 'Customer file',
  lens: 'Setup + Goal Lens',
}

const CRUMBS = {
  today: [],
  visit: ['New visit'],
  files: ['Customer files'],
  lens: ['Customer files', 'Setup + Goal Lens'],
}

export default function App() {
  const [route, setRoute] = useState({ screen: 'today', fileId: null })

  useEffect(() => { ensureSalesOsBoot() }, [])

  function navigate(screen) {
    if (screen === 'today' || screen === 'visit') {
      setRoute({ screen, fileId: null })
    } else if (screen === 'files') {
      setRoute((prev) => ({ screen: 'files', fileId: prev.fileId }))
    }
  }

  function openFile(fileId) {
    setRoute({ screen: 'files', fileId })
  }

  function openLens(fileId) {
    setRoute({ screen: 'lens', fileId })
  }

  function onCustomerFileCreated(file) {
    setRoute({ screen: 'files', fileId: file.id })
  }

  return (
    <AppShell
      active={route.screen === 'lens' ? 'files' : route.screen}
      onNavigate={navigate}
      title={TITLES[route.screen]}
      crumbs={CRUMBS[route.screen]}
      topActions={<BackstageBackup />}
    >
      {route.screen === 'today' && (
        <TodayScreen onOpenStartVisit={() => navigate('visit')} onOpenFile={openFile} />
      )}
      {route.screen === 'visit' && (
        <StartVisitScreen onCustomerFileCreated={onCustomerFileCreated} />
      )}
      {route.screen === 'files' && (
        <CustomerFileScreen
          fileId={route.fileId}
          onBack={() => navigate('today')}
          onOpenLens={openLens}
        />
      )}
      {route.screen === 'lens' && (
        <SetupGoalLensScreen
          fileId={route.fileId}
          onBack={() => openFile(route.fileId)}
        />
      )}
    </AppShell>
  )
}
