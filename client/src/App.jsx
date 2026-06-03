import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import DailyCheckin from './components/DailyCheckin'
import Dashboard from './pages/Dashboard'
import BloodPressure from './pages/BloodPressure'
import FoodHydration from './pages/FoodHydration'
import SleepRecovery from './pages/SleepRecovery'
import Insights from './pages/Insights'

export default function App() {
  return (
    <BrowserRouter>
      <Sidebar />
      <DailyCheckin />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/blood-pressure" element={<BloodPressure />} />
          <Route path="/food-hydration" element={<FoodHydration />} />
          <Route path="/sleep-recovery" element={<SleepRecovery />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
