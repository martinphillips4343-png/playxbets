import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import DashboardHeader from "@/components/DashboardHeader";

export default function Deposits() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get("/admin/users");
      setUsers(response.data);
    } catch (error) {
      toast.error("Failed to load users");
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRecharge = async (e) => {
    e.preventDefault();
    
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }

    setLoading(true);

    try {
      await api.post("/admin/recharge", {
        user_id: selectedUserId,
        amount: parseFloat(amount),
        note: note || "Manual recharge by admin",
      });
      toast.success("Wallet recharged successfully!");
      setSelectedUserId("");
      setAmount("");
      setNote("");
      setSearchTerm("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to recharge wallet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <DashboardHeader title="Deposits / Recharge" />
      
      <div className="p-8">
        <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Manual Recharge</h2>
          <form onSubmit={handleRecharge} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Search User</label>
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Type username or user ID..."
                className="w-full text-gray-900"
              />
              
              {searchTerm && filteredUsers.length > 0 && (
                <div className="mt-2 border border-gray-300 rounded-md max-h-48 overflow-y-auto">
                  {filteredUsers.map((user) => (
                    <button
                      key={user.user_id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(user.user_id);
                        setSearchTerm(user.username);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-900 font-medium border-b last:border-b-0"
                    >
                      <div className="font-semibold text-gray-900">{user.username}</div>
                      <div className="text-xs text-gray-600">{user.user_id}</div>
                    </button>
                  ))}
                </div>
              )}
              
              {selectedUserId && (
                <p className="mt-2 text-sm text-green-600 font-semibold">
                  ✓ Selected: {users.find(u => u.user_id === selectedUserId)?.username}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Amount (₹)</label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                required
                className="w-full text-gray-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Note (Optional)</label>
              <Input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter note"
                className="w-full text-gray-900"
              />
            </div>

            <Button 
              type="submit" 
              disabled={loading || !selectedUserId} 
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
            >
              {loading ? "Processing..." : "Recharge Wallet"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

