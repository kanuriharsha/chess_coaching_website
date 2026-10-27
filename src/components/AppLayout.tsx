import { ReactNode } from 'react';
import Navigation from './Navigation';

interface AppLayoutProps {
  children: ReactNode;
  compactTopPadding?: boolean;
}

const AppLayout = ({ children, compactTopPadding = false }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="md:ml-64 pb-20 md:pb-0">
        <div className={`container max-w-5xl px-4 ${compactTopPadding ? 'pt-0 pb-6 md:pb-8' : 'pt-2 pb-6 md:pt-3 md:pb-8'}`}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
