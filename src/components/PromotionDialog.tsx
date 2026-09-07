import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
  color?: 'w' | 'b';
}

const PIECE_IMAGES: { [color in 'w' | 'b']: { [p in 'q' | 'r' | 'b' | 'n']: string } } = {
  w: {
    q: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wq.png',
    r: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wr.png',
    b: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wb.png',
    n: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wn.png',
  },
  b: {
    q: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bq.png',
    r: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/br.png',
    b: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bb.png',
    n: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bn.png',
  },
};

export default function PromotionDialog({ open, onOpenChange, onSelect, color = 'w' }: Props) {
  // Ensure color is valid, fallback to 'w' if undefined
  const pieceColor = (color === 'w' || color === 'b') ? color : 'w';
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 bg-transparent border-none shadow-2xl max-w-[100px]">
        <div className="flex flex-col items-center bg-white/95 backdrop-blur-sm rounded-lg shadow-2xl overflow-hidden border-2 border-gray-300">
          <button
            aria-label="Cancel promotion"
            onClick={() => onOpenChange(false)}
            className="w-full text-center py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors text-xl font-bold"
          >
            ✕
          </button>
          <div className="flex flex-col items-center py-1 px-1 gap-0">
            <button 
              onClick={() => onSelect('q')} 
              className="w-20 h-20 flex items-center justify-center hover:bg-blue-50 transition-all hover:scale-105 active:scale-95"
            >
              <img src={PIECE_IMAGES[pieceColor].q} alt="queen" className="w-16 h-16 drop-shadow-lg" />
            </button>
            <button 
              onClick={() => onSelect('n')} 
              className="w-20 h-20 flex items-center justify-center hover:bg-blue-50 transition-all hover:scale-105 active:scale-95"
            >
              <img src={PIECE_IMAGES[pieceColor].n} alt="knight" className="w-16 h-16 drop-shadow-lg" />
            </button>
            <button 
              onClick={() => onSelect('r')} 
              className="w-20 h-20 flex items-center justify-center hover:bg-blue-50 transition-all hover:scale-105 active:scale-95"
            >
              <img src={PIECE_IMAGES[pieceColor].r} alt="rook" className="w-16 h-16 drop-shadow-lg" />
            </button>
            <button 
              onClick={() => onSelect('b')} 
              className="w-20 h-20 flex items-center justify-center hover:bg-blue-50 transition-all hover:scale-105 active:scale-95"
            >
              <img src={PIECE_IMAGES[pieceColor].b} alt="bishop" className="w-16 h-16 drop-shadow-lg" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
