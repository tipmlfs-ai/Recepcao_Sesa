import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Controller from './pages/Controller';
import Login from './pages/Login';
import Admin from './pages/Admin';
import DataAnalytics from './pages/DataAnalytics';
import QueueDisplay from './pages/QueueDisplay';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute, ReceptionRoute, SectorRoute, AdminRoute } from './routes/PrivateRoute';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-container">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/fila" element={<QueueDisplay />} />

            {/* Protected Routes */}
            <Route element={<PrivateRoute />}>

              {/* Admin Only Route */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/analytics" element={<DataAnalytics />} />
              </Route>

              {/* Reception Only Route (Admin also has access) */}
              <Route element={<ReceptionRoute />}>
                <Route path="/" element={<Dashboard />} />
              </Route>

              {/* Sector Only Route */}
              <Route element={<SectorRoute />}>
                <Route path="/painel" element={<Controller />} />
              </Route>

            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
