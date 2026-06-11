import { useState } from 'react'
import { ChatInterface } from './components/ChatInterface'
import { SettingsPanel } from './components/SettingsPanel'
import { SecurityDashboard } from './components/SecurityDashboard'
import { BackendGuide } from './components/BackendGuide'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Toaster } from './components/ui/toaster'
import './App.css'

type View = 'chat' | 'settings' | 'security' | 'backend'

function App() {
  const [view, setView] = useState<View>('chat')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="flex h-screen overflow-hidden">
        <Sidebar currentView={view} onViewChange={setView} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            {view === 'chat' && <ChatInterface />}
            {view === 'settings' && <SettingsPanel />}
            {view === 'security' && <SecurityDashboard />}
            {view === 'backend' && <BackendGuide />}
          </main>
        </div>
      </div>
      <Toaster />
    </div>
  )
}

export default App
