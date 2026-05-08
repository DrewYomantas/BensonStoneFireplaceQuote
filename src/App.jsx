import { useEffect, useState } from 'react'
import './styles/tokens.css'
import './styles/app.css'
import AppShell from './components/shell/AppShell.jsx'
import TodayScreen from './screens/TodayScreen.jsx'
import StartVisitScreen from './screens/StartVisitScreen.jsx'
import CustomerFileScreen from './screens/CustomerFileScreen.jsx'
import CustomerFilesListScreen from './screens/CustomerFilesListScreen.jsx'
import SetupGoalLensScreen from './screens/SetupGoalLensScreen.jsx'
import QuotePrepScreen from './screens/QuotePrepScreen.jsx'
import BisTrackHandoffScreen from './screens/BisTrackHandoffScreen.jsx'
import ProposalPreviewScreen from './screens/ProposalPreviewScreen.jsx'
import BulkIntakeScreen from './screens/BulkIntakeScreen.jsx'
import BackstageScreen from './screens/BackstageScreen.jsx'
import BackstageBackup from './components/shell/BackstageBackup.jsx'
import { ensureSalesOsBoot } from './lib/salesOsStorageBoot.js'

const TITLES = {
  today: 'Today at the desk',
  visit: 'Start a visit',
  filesList: 'Customer files',
  files: 'Customer file',
  lens: 'Setup + Goal Lens',
  quotePrep: 'Quote / Prep',
  handoff: 'Internal BisTrack Handoff',
  proposalPreview: 'Proposal Preview',
  bulkIntake: 'Bulk Import',
  backstage: 'Backstage',
}

const CRUMBS = {
  today: [],
  visit: ['New visit'],
  filesList: ['Customer files'],
  files: ['Customer files', 'File'],
  lens: ['Customer files', 'Setup + Goal Lens'],
  quotePrep: ['Customer files', 'Quote / Prep'],
  handoff: ['Customer files', 'Internal BisTrack Handoff'],
  proposalPreview: ['Customer files', 'Proposal Preview'],
  bulkIntake: ['Bulk Import'],
  backstage: ['Backstage'],
}

export default function App() {
  const [route, setRoute] = useState({ screen: 'today', fileId: null })

  useEffect(() => { ensureSalesOsBoot() }, [])

  function navigate(screen) {
    if (screen === 'today' || screen === 'visit' || screen === 'backstage') {
      setRoute({ screen, fileId: null })
    } else if (screen === 'files') {
      // Rail "Customer Files" goes to the list; the file detail screen is
      // reached by clicking a row.
      setRoute({ screen: 'filesList', fileId: null })
    }
  }

  function openFile(fileId) {
    setRoute({ screen: 'files', fileId })
  }

  function openFilesList() {
    setRoute({ screen: 'filesList', fileId: null })
  }

  function openLens(fileId) {
    setRoute({ screen: 'lens', fileId })
  }

  function openQuotePrep(fileId) {
    setRoute({ screen: 'quotePrep', fileId })
  }

  function openHandoff(fileId) {
    setRoute({ screen: 'handoff', fileId })
  }

  function openProposalPreview(fileId) {
    setRoute({ screen: 'proposalPreview', fileId })
  }

  function openBulkIntake() {
    setRoute({ screen: 'bulkIntake', fileId: null })
  }

  function onCustomerFileCreated(file) {
    setRoute({ screen: 'files', fileId: file.id })
  }

  return (
    <AppShell
      active={['lens', 'filesList', 'quotePrep', 'handoff', 'proposalPreview', 'bulkIntake'].includes(route.screen) ? 'files' : route.screen}
      onNavigate={navigate}
      title={TITLES[route.screen]}
      crumbs={CRUMBS[route.screen]}
      topActions={<BackstageBackup />}
    >
      {route.screen === 'today' && (
        <TodayScreen
          onOpenStartVisit={() => navigate('visit')}
          onOpenFile={openFile}
          onOpenFilesList={openFilesList}
          onOpenBulkIntake={openBulkIntake}
        />
      )}
      {route.screen === 'visit' && (
        <StartVisitScreen onCustomerFileCreated={onCustomerFileCreated} />
      )}
      {route.screen === 'filesList' && (
        <CustomerFilesListScreen
          onOpenFile={openFile}
          onOpenStartVisit={() => navigate('visit')}
          onOpenBulkIntake={openBulkIntake}
        />
      )}
      {route.screen === 'files' && (
        <CustomerFileScreen
          fileId={route.fileId}
          onBack={openFilesList}
          onOpenLens={openLens}
          onOpenQuotePrep={openQuotePrep}
          onOpenHandoff={openHandoff}
          onOpenProposalPreview={openProposalPreview}
        />
      )}
      {route.screen === 'lens' && (
        <SetupGoalLensScreen
          fileId={route.fileId}
          onBack={() => openFile(route.fileId)}
        />
      )}
      {route.screen === 'quotePrep' && (
        <QuotePrepScreen
          fileId={route.fileId}
          onBack={() => openFile(route.fileId)}
          onOpenLens={openLens}
          onOpenHandoff={openHandoff}
          onOpenProposalPreview={openProposalPreview}
        />
      )}
      {route.screen === 'proposalPreview' && (
        <ProposalPreviewScreen
          fileId={route.fileId}
          onBack={() => openFile(route.fileId)}
          onOpenQuotePrep={openQuotePrep}
          onOpenLens={openLens}
        />
      )}
      {route.screen === 'handoff' && (
        <BisTrackHandoffScreen
          fileId={route.fileId}
          onBack={() => openFile(route.fileId)}
          onOpenLens={openLens}
          onOpenQuotePrep={openQuotePrep}
        />
      )}
      {route.screen === 'bulkIntake' && (
        <BulkIntakeScreen
          onBack={openFilesList}
          onOpenFilesList={openFilesList}
        />
      )}
      {route.screen === 'backstage' && (
        <BackstageScreen onBack={() => navigate('today')} />
      )}
    </AppShell>
  )
}
