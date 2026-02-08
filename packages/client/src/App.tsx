import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Game } from './pages/Game'
import { MultiplayerGame } from './pages/MultiplayerGame'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play" element={<Game />} />
        <Route path="/play-multi" element={<MultiplayerGame />} />
      </Routes>
    </BrowserRouter>
  )
}
