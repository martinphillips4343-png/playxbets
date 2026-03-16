import { useState } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Login({ onLogin, onSwitchToSignUp, isModal = false }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);

      const response = await api.post("/auth/login", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const { access_token } = response.data;
      
      // Fetch full user data including user_id
      const userResponse = await api.get("/auth/me", {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      
      onLogin(userResponse.data, access_token);
      toast.success("Login successful!");
    } catch (error) {
      toast.error("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const containerClass = isModal
    ? "bg-white rounded-lg p-8 w-full max-w-md"
    : "min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900";

  return (
    <div className={containerClass}>
      <div className={isModal ? "" : "bg-white rounded-lg shadow-2xl p-8 w-full max-w-md"}>
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-600 mb-2">PlayXBets</h1>
          <p className="text-gray-600">Sports Betting Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" data-testid="login-form">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              data-testid="username-input"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              data-testid="password-input"
              className="w-full"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700"
            data-testid="login-button"
          >
            {loading ? "Logging in..." : "Login"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{" "}
            <button
              onClick={onSwitchToSignUp}
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Sign up here
            </button>
          </p>
        </div>

        {!isModal && (
          <div className="mt-6 text-center text-sm text-gray-600 border-t pt-4">
            <p className="font-medium mb-2">Demo Accounts:</p>
            <p>Admin: admin / 123456</p>
            <p>User: user / 123456</p>
          </div>
        )}
      </div>
    </div>
  );
}
