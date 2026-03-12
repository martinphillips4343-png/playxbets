import { useState, useEffect } from "react";
import { api } from "@/App";

export default function UserDashboard() {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    fetchWallet();
  }, []);

  const fetchWallet = async () => {
    try {
      const response = await api.get("/wallet");
      setWallet(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Wallet Balance</h2>
        <p className="text-4xl font-bold text-blue-600">
          ${wallet?.balance?.toFixed(2) || "0.00"}
        </p>
      </div>
    </div>
  );
}
