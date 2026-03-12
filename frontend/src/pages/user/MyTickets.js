import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const response = await api.get("/tickets/my");
      setTickets(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/tickets", { subject, message });
      toast.success("Ticket created successfully!");
      setSubject("");
      setMessage("");
      fetchTickets();
    } catch (error) {
      toast.error("Failed to create ticket");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Support Tickets</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Create New Ticket</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
              <Input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue"
                className="w-full p-2 border rounded min-h-[120px]"
                required
              />
            </div>
            <Button type="submit" className="w-full">Submit Ticket</Button>
          </form>
        </div>
      </div>

      <div className="space-y-4">
        {tickets.map((ticket) => (
          <div key={ticket.ticket_id} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">{ticket.subject}</h3>
                <p className="text-sm text-gray-600">{new Date(ticket.created_at).toLocaleString()}</p>
              </div>
              <span className={`px-3 py-1 text-xs rounded ${
                ticket.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
              }`}>
                {ticket.status}
              </span>
            </div>
            <p className="text-gray-700 mb-4">{ticket.message}</p>
            {ticket.admin_reply && (
              <div className="bg-blue-50 p-4 rounded">
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
