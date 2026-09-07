import { useCallback, useRef } from 'react';

export type ChessSoundType = 'move' | 'capture' | 'check' | 'checkmate' | 'castle' | 'promote' | 'illegal';

export const useChessSound = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const playTone = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      console.log('Audio not available');
    }
  }, [getAudioContext]);

  const playSound = useCallback((type: ChessSoundType) => {
    try {
      // Play Move (2).mp3 for all move sounds
      if (type === 'move' || type === 'capture' || type === 'castle' || type === 'promote') {
        if (!audioRef.current) {
          audioRef.current = new Audio('/Move (2).mp3');
        }
        audioRef.current.currentTime = 0;
        audioRef.current.volume = 0.5;
        audioRef.current.play().catch(err => console.log('Audio play failed:', err));
        return;
      }
      
      // Fallback to synthetic sounds for other types
      switch (type) {
        case 'check':
          // Alert sound
          playTone(880, 0.1, 'sine');
          setTimeout(() => playTone(1100, 0.1, 'sine'), 100);
          break;
        case 'checkmate':
          // Victory fanfare
          playTone(523, 0.15, 'sine');
          setTimeout(() => playTone(659, 0.15, 'sine'), 150);
          setTimeout(() => playTone(784, 0.2, 'sine'), 300);
          setTimeout(() => playTone(1047, 0.3, 'sine'), 450);
          break;
        case 'illegal':
          // Error sound
          playTone(200, 0.15, 'square');
          break;
      }
    } catch (e) {
      console.log('Audio not available');
    }
  }, [playTone]);

  return { playSound };
};

export default useChessSound;
