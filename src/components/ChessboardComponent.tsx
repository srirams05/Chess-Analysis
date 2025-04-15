import React from 'react';
import Chessground from 'react-chessground';
// Import types needed
import { Key, Piece, Role, Color, Dests } from 'chessground/types';
import 'react-chessground/dist/styles/chessground.css';

// Define the expected props for this component
interface ChessboardComponentProps {
  fen: string;
  turnColor: Color; // Whose turn is it? ('white' | 'black')
  lastMove?: Key[]; // Array like ['g1', 'f3'] for last move highlight
  dests: Dests; // Map of legal destinations for the selected piece
  viewOnly?: boolean;
  onMove: (from: Key, to: Key, piece?: Piece, role?: Role) => void;
  // Remove onSelectSquare: (key: Key | undefined) => void;
  // Add orientation prop later if needed
}

const ChessboardComponent: React.FC<ChessboardComponentProps> = ({
  fen,
  turnColor,
  lastMove,
  dests,
  viewOnly = false,
  onMove,
  // Remove onSelectSquare from destructuring
}) => {

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  };

  // We still need this internal handler for onMove
  const internalMoveHandler = (from: Key, to: Key, piece?: Piece, role?: Role) => {
    if (typeof onMove === 'function') {
      onMove(from, to, piece, role);
    }
  };

  // Remove the handleSelect function
  /*
  const handleSelect = (key: Key | undefined) => {
      if (typeof onSelectSquare === 'function') {
          onSelectSquare(key); // Notify parent component
      }
  };
  */

  return (
    <div style={wrapperStyle}>
      <Chessground
        fen={fen}
        turnColor={turnColor}
        onMove={internalMoveHandler} // Use the internal handler for onMove
        width="100%"
        height="100%"
        viewOnly={viewOnly}
        highlight={{
            lastMove: true,
            check: true,
        }}
        lastMove={lastMove}
        movable={{
            free: false,
            color: viewOnly ? undefined : turnColor,
            dests: viewOnly ? new Map() : dests, // Provide the map of legal destinations
            showDests: true, // Show dots/circles on legal destination squares
        }}
        selectable={{
            enabled: !viewOnly, // Allow selecting pieces
            // We rely on 'dests' to show legal moves, no explicit 'select' event needed now
        }}
        // Remove the 'events' prop entirely
        /*
        events={{
            select: handleSelect
        }}
        */
      />
    </div>
  );
};

export default ChessboardComponent;