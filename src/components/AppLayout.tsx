import { ReactNode } from 'react';
import Navigation from './Navigation';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="md:ml-64 pb-20 md:pb-0">
        <div className="container max-w-5xl py-6 px-4 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
