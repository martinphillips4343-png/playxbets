import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatIndianDateTime } from "@/utils/dateFormat";
import DashboardHeader from "@/components/DashboardHeader";

export default function SupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [replyText, setReplyText] = useState({});

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

  const handleReply = async (ticketId) => {
    if (!replyText[ticketId]) {
      toast.error("Please enter a reply");
      return;
    }
    try {
      await api.put(`/admin/tickets/${ticketId}`, {
        admin_reply: replyText[ticketId],
        status: "closed"
      });
      toast.success("Reply sent successfully!");
      setReplyText({ ...replyText, [ticketId]: "" });
      fetchTickets();
    } catch (error) {
      toast.error("Failed to send reply");
    }
  };

  return (
    <div>
      <DashboardHeader title="Support Tickets" />
      
      <div className="p-8">
        {tickets.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-700 font-medium">No support tickets</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <div key={ticket.ticket_id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{ticket.subject}</h3>
                    <p className="text-sm text-gray-600 font-medium">
                      From: {ticket.user_id.slice(0, 8)}... | {formatIndianDateTime(ticket.created_at)}
                    </p>
                  </div>
                  <span className={`px-3 py-1 text-xs font-semibold rounded ${
                    ticket.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {ticket.status}
                  </span>
                </div>
                <p className="text-gray-700 font-medium mb-4">{ticket.message}</p>
                
                {ticket.admin_reply ? (
                  <div className="bg-blue-50 p-4 rounded">
                    <p className="text-sm font-bold text-blue-800 mb-1">Admin Reply:</p>
                    <p className="text-gray-700 font-medium">{ticket.admin_reply}</p>
                  </div>
                ) : (
                  <div className="border-t pt-4 mt-4">
                    <label className="block text-sm font-bold text-gray-900 mb-2">Reply to ticket</label>
                    <div className="flex gap-2">
                      <Input
                        value={replyText[ticket.ticket_id] || ""}
                        onChange={(e) => setReplyText({ ...replyText, [ticket.ticket_id]: e.target.value })}
                        placeholder="Type your reply..."
                        className="flex-1 text-gray-900"
                      />
                      <Button
                        onClick={() => handleReply(ticket.ticket_id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Send Reply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
