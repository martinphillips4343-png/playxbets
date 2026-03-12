import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import AdminLayout from "@/layouts/AdminLayout";
import AdminDashboard from "@/pages/admin/Dashboard";
import ManageBettors from "@/pages/admin/ManageBettors";
import ManageGames from "@/pages/admin/ManageGames";
import BetsPlaced from "@/pages/admin/BetsPlaced";
import DeclareOutcomes from "@/pages/admin/DeclareOutcomes";
import Deposits from "@/pages/admin/Deposits";
import Withdrawals from "@/pages/admin/Withdrawals";
import SupportTickets from "@/pages/admin/SupportTickets";
import UserLayout from "@/layouts/UserLayout";
import UserDashboard from "@/pages/user/Dashboard";
import BettingPage from "@/pages/user/BettingPage";
import BetHistory from "@/pages/user/BetHistory";
import MyWithdrawals from "@/pages/user/MyWithdrawals";
import MyTickets from "@/pages/user/MyTickets";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Axios instance
export const api = axios.create({
  baseURL: API,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const response = await api.get("/auth/me");
        setUser(response.data);
      } catch (error) {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
      }
    }
    setLoading(false);
  };

  const handleLogin = (userData, token) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", userData.role);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to={user.role === "admin" ? "/admin" : "/user"} />
              ) : (
                <Login onLogin={handleLogin} />
              )
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              user && user.role === "admin" ? (
                <AdminLayout user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" />
              )
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="bettors" element={<ManageBettors />} />
            <Route path="games" element={<ManageGames />} />
            <Route path="bets" element={<BetsPlaced />} />
            <Route path="outcomes" element={<DeclareOutcomes />} />
            <Route path="deposits" element={<Deposits />} />
            <Route path="withdrawals" element={<Withdrawals />} />
            <Route path="tickets" element={<SupportTickets />} />
          </Route>

          {/* User Routes */}
          <Route
            path="/user"
            element={
              user && user.role === "user" ? (
                <UserLayout user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" />
              )
            }
          >
            <Route index element={<UserDashboard />} />
            <Route path="betting" element={<BettingPage />} />
            <Route path="history" element={<BetHistory />} />
            <Route path="withdrawals" element={<MyWithdrawals />} />
            <Route path="tickets" element={<MyTickets />} />
          </Route>

          <Route
            path="/"
            element={
              <Navigate
                to={user ? (user.role === "admin" ? "/admin" : "/user") : "/login"}
              />
            }
          />
        </Routes>

        <Toaster position="top-right" theme="dark" />
      </BrowserRouter>

      {/* WhatsApp Floating Button */}
      <a
        href="https://wa.me/?text=Hello%20Recharge%20300"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-lg z-50 transition-all"
        data-testid="whatsapp-button"
      >
        <svg
          className="w-8 h-8"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </a>
    </div>
  );
}

export default App;
