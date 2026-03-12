import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SupportTickets() {
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const response = await api.get("/admin/tickets");
      setTickets(response.data);
    } catch (error) {
      toast.error("Failed to load tickets");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Support Tickets</h1>
      
      <div className="space-y-4">
        {tickets.map((ticket) => (
          <div key={ticket.ticket_id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">{ticket.subject}</h3>
                <p className="text-sm text-gray-600">From: {ticket.user_id}</p>
              </div>
              <span className={`px-3 py-1 text-xs rounded ${
                ticket.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
              }`}>
                {ticket.status}
              </span>
            </div>
            <p className="text-gray-700 mb-4">{ticket.message}</p>
            {ticket.admin_reply && (
              <div className="bg-blue-50 p-4 rounded mb-4">
                <p className="text-sm font-medium text-blue-800 mb-1">Admin Reply:</p>
                <p className="text-gray-700">{ticket.admin_reply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
