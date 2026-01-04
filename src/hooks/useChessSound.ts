import { useCallback, useRef } from 'react';

// Chess sound effects using Web Audio API
const createSound = (frequency: number, duration: number, type: OscillatorType = 'sine'): AudioBuffer | null => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const length = sampleRate * duration;
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sample = 0;
      
      if (type === 'sine') {
        sample = Math.sin(2 * Math.PI * frequency * t);
      } else if (type === 'square') {
        sample = Math.sin(2 * Math.PI * frequency * t) > 0 ? 0.5 : -0.5;
      } else {
        sample = Math.sin(2 * Math.PI * frequency * t);
      }
      
      // Apply envelope
      const envelope = Math.exp(-3 * t / duration);
      data[i] = sample * envelope * 0.3;
    }
    
    return buffer;
  } catch {
    return null;
  }
};

export type ChessSoundType = 'move' | 'capture' | 'check' | 'checkmate' | 'castle' | 'promote' | 'illegal';

export const useChessSound = () => {
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
    switch (type) {
      case 'move':
        // Soft click sound
        playTone(800, 0.08, 'sine');
        setTimeout(() => playTone(600, 0.05, 'sine'), 30);
        break;
      case 'capture':
        // More aggressive sound
        playTone(300, 0.12, 'square');
        setTimeout(() => playTone(200, 0.15, 'square'), 40);
        break;
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
      case 'castle':
        // Double move sound
        playTone(600, 0.06, 'sine');
        setTimeout(() => playTone(800, 0.08, 'sine'), 80);
        break;
      case 'promote':
        // Ascending sound
        playTone(400, 0.1, 'sine');
        setTimeout(() => playTone(600, 0.1, 'sine'), 80);
        setTimeout(() => playTone(900, 0.15, 'sine'), 160);
        break;
      case 'illegal':
        // Error sound
        playTone(200, 0.15, 'square');
        break;
    }
  }, [playTone]);

  return { playSound };
};

export default useChessSound;
