import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './components/auth/AuthProvider'
import { DataProvider } from './contexts/DataContext'
import Navbar from './components/ui/Navbar'
import ScrollToTop from './components/ui/ScrollToTop'
import Home from './pages/Home'
import Fixtures from './pages/Fixtures'
import MyPredictions from './pages/MyPredictions'
import Groups from './pages/Groups'
import Leaderboard from './pages/Leaderboard'
import Bracket from './pages/Bracket'
import Admin from './pages/Admin'
import Login from './pages/Login'

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <div className="flex flex-col min-h-dvh">
          <Navbar />
          <ScrollToTop />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/fixtures" element={<Fixtures />} />
              <Route path="/predictions" element={<MyPredictions />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/bracket" element={<Bracket />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/login" element={<Login />} />
            </Routes>
          </main>
        </div>
      </DataProvider>
    </AuthProvider>
  )
}
