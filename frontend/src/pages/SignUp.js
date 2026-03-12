import { useState } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function SignUp({ onSignUp, onSwitchToLogin, isModal = false }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      // Register user
      await api.post("/auth/register", {
        username,
        email: email || undefined,
        password,
      });

      toast.success("Registration successful! Please login.");
      
      // Auto login after registration
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);

      const loginResponse = await api.post("/auth/login", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const { access_token, role, username: user } = loginResponse.data;
      onSignUp({ username: user, role }, access_token);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || "Registration failed";
      toast.error(errorMsg);
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
          <p className="text-gray-600">Create Your Account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" data-testid="signup-form">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username *
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              required
              data-testid="signup-username-input"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email (Optional)
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              data-testid="signup-email-input"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password *
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              data-testid="signup-password-input"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password *
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              data-testid="signup-confirm-password-input"
              className="w-full"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            data-testid="signup-button"
          >
            {loading ? "Creating Account..." : "Sign Up"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{" "}
            <button
              onClick={onSwitchToLogin}
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Login here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
