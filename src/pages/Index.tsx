import { Crown } from 'lucide-react';

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary mb-6 shadow-premium-lg">
          <Crown className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="font-serif mb-4 text-4xl font-bold text-foreground">Chess Coach</h1>
        <p className="text-xl text-muted-foreground mb-8">Master the game, one move at a time</p>
        <a 
          href="/login" 
          className="btn-premium inline-flex items-center gap-2"
        >
          Get Started
        </a>
      </div>
    </div>
  );
};

export default Index;
