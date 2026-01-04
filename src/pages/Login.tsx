import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Crown, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const success = await login(username, password);

    if (success) {
      toast.success('Welcome back!');
      navigate('/puzzles');
    } else {
      toast.error('Invalid credentials or account disabled');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-premium">
            <Crown className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Learn chess from Kanuri Harsha Vardhan</h1>
          <p className="text-muted-foreground mt-2">Master the game, one move at a time</p>
        </div>

        {/* Login Card */}
        <div className="card-premium p-8">
          <h2 className="font-serif text-2xl font-semibold text-foreground mb-6 text-center">
            Sign In
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="label-premium">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-premium"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="label-premium">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-premium pr-12"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-premium w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-center text-muted-foreground">
              Created and designed by Kanuri Harsha Vardhan with ❤️
            </p>
          </div>
        </div>

        {/* Chess pieces decoration */}
        <div className="flex justify-center gap-4 mt-8 text-4xl opacity-20">
          ♔ ♕ ♗ ♘ ♖
        </div>
      </div>
    </div>
  );
};

export default Login;
