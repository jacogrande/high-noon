import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Game } from './pages/Game'
import { MultiplayerGame } from './pages/MultiplayerGame'
import { ConsentDialog } from './ui/ConsentDialog'
import { getConsent, setConsent, initAnalytics } from './analytics'

export function App() {
  const [consentState, setConsentState] = useState(() => getConsent())

  useEffect(() => {
    if (consentState === 'granted') {
      initAnalytics()
    }
  }, [consentState])

  const handleConsentDecision = (granted: boolean) => {
    setConsent(granted ? 'granted' : 'denied')
    setConsentState(granted ? 'granted' : 'denied')
  }

  return (
    <BrowserRouter>
      {consentState === 'unset' && (
        <ConsentDialog onDecision={handleConsentDecision} />
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play" element={<Game />} />
        <Route path="/play-multi" element={<MultiplayerGame />} />
      </Routes>
    </BrowserRouter>
  )
}
