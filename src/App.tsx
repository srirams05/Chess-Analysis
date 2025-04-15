import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Chess, Move, Square, PieceSymbol } from 'chess.js';
import ChessboardComponent from './components/ChessboardComponent';
import { Key, Dests, Color as CgColor } from 'chessground/types';
import './App.css';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Helper function
const allMovesToDests = (moves: Move[]): Dests => {
  const dests = new Map<Key, Key[]>();
  if (!moves) { return dests; }
  for (const m of moves) { if (m && m.from && m.to) { const fromKey = m.from as Key; const toKey = m.to as Key; const destinations = dests.get(fromKey) || []; if (!destinations.includes(toKey)) { dests.set(fromKey, [...destinations, toKey]); } } }
  return dests;
};

// **** START: Helper to Extract FEN from PGN Headers ****
function extractFenFromPgnHeaders(pgn: string): string | null {
    const fenRegex = /\[\s*FEN\s*"(.*?)"\s*\]/;
    const match = pgn.match(fenRegex);
    if (match && match[1]) {
        return match[1].trim();
    }
    return null;
}
// **** END: Helper ****


// PGN Cleaning Function for Move Iteration (Remove Headers, Move Numbers, etc.)
function cleanPgnForMoveIteration(pgn: string): string {
  let cleaned = pgn.replace(/\[.*?\]\s*/g, ''); // Remove [Header "Value"] tags FIRST
  cleaned = cleaned.replace(/\{[^}]*\}/g, ''); // Remove comments
  for (let i = 0; i < 5; i++) { cleaned = cleaned.replace(/\([^()]*\)/g, ''); } // Remove variations
  cleaned = cleaned.replace(/\$\d+/g, ''); // Remove NAGs
  cleaned = cleaned.replace(/([a-zA-Z0-9+#=:]+[!?]+)/g, (match) => match.replace(/[!?]/g, '')); // Remove annotations
  cleaned = cleaned.replace(/([a-zA-Z0-9+#=:]+[!?]+)/g, (match) => match.replace(/[!?]/g, '')); // Repeat
  cleaned = cleaned.replace(/(?:1-0|0-1|1\/2-1\/2|\*)\s*$/, ''); // Remove result
  cleaned = cleaned.replace(/\d+\s*\.(\.\.)?\s*/g, ''); // Remove move numbers/ellipses
  cleaned = cleaned.replace(/\s+/g, ' ').trim(); // Final cleanup
  return cleaned;
}


function App() {
  const [fen, setFen] = useState<string>(START_FEN);
  const [history, setHistory] = useState<Move[]>([]);
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [legalDests, setLegalDests] = useState<Dests>(new Map());
  const [inputValue, setInputValue] = useState<string>(START_FEN);
  // **** START: Add state for initial FEN ****
  const [initialFen, setInitialFen] = useState<string>(START_FEN);
  // **** END: Add state for initial FEN ****


  const game = useRef(new Chess());

  // Derived state
  const turnColor = game.current.turn() === 'w' ? 'white' : 'black';
  const isViewingLatest = currentPly === history.length;
  const lastMoveData = isViewingLatest && history.length > 0 ? history[history.length - 1] : undefined;
  const lastMoveSquares = lastMoveData ? [lastMoveData.from as Key, lastMoveData.to as Key] : undefined;


  // Effect to sync game instance (based on history changes)
  useEffect(() => {
    // Reset game ref if history is cleared
    if (history.length === 0 && game.current.history().length > 0) {
        game.current.reset();
        setInitialFen(START_FEN); // Reset initialFen if history clears
        if (fen !== START_FEN) setFen(START_FEN);
        if (currentPly !== 0) setCurrentPly(0);
        console.log("History cleared, game instance reset.");
        return;
    }
    // Resync game ref from history state if lengths mismatch
    if (history.length !== game.current.history().length) {
        console.log("Syncing game instance from history state (length mismatch)...");
        // Use the stored initial FEN for resyncing the game instance
        game.current.load(initialFen); // Load correct start position
        let success = true;
        for (const move of history) {
            if (!game.current.move(move.san)) { // Replay history onto game instance
                console.error("Sync fail:", move.san); success = false; break;
            }
        }
        if (!success) { console.error("History state invalid during sync. Resetting."); setHistory([]); setCurrentPly(0); setFen(START_FEN); setInitialFen(START_FEN); game.current.reset(); }
        else {
             console.log("Game instance synced from history.");
             // Ensure display FEN/Ply match the end of the synced history
             if (currentPly !== history.length) setCurrentPly(history.length);
             if (fen !== game.current.fen()) setFen(game.current.fen());
         }
    } else if (isViewingLatest && fen !== game.current.fen()) {
         // If lengths match but FEN is wrong at latest ply, likely external FEN load messed up game ref state
         console.warn("Sync effect: Correcting game ref FEN to match display FEN at latest ply.");
         game.current.load(fen); // Force game ref FEN to match display state
         // This assumes the history state is still the source of truth
    }
  }, [history, initialFen]); // Depend on history and the initial FEN used for replay


  // Effect to calculate dests AND update input field value
  useEffect(() => {
    if (fen !== inputValue) { setInputValue(fen); }
    if (isViewingLatest) {
       // Calculate dests based on the main game instance, assuming it's synced
       if (game.current.fen() === fen) {
          const moves = game.current.moves({ verbose: true });
          const newDests = allMovesToDests(moves);
          if (JSON.stringify(Array.from(newDests.entries())) !== JSON.stringify(Array.from(legalDests.entries()))) {
              setLegalDests(newDests);
          }
       } else { /* Wait for sync effect */ if (legalDests.size > 0) setLegalDests(new Map()); }
    } else { if (legalDests.size > 0) { setLegalDests(new Map()); } }
  // Corrected dependencies
  }, [fen, isViewingLatest, history.length, legalDests]);


  // Function to update display board FEN for navigation
  const updateBoardToPly = (ply: number) => {
    if (ply === currentPly) return;
    if (ply < 0 || ply > history.length) return;

    // Use the stored initial FEN for replay calculation
    const tempGame = new Chess();
    try {
        tempGame.load(initialFen); // <-- USE STORED INITIAL FEN
    } catch (e) {
        console.error("Failed to load initial FEN for navigation:", initialFen, e);
        tempGame.load(START_FEN); // Fallback to default start
    }

    // Replay moves from history state up to the target ply
    for (let i = 0; i < ply; i++) {
        if (history[i] && !tempGame.move(history[i].san)) {
            console.error("Nav replay failed for move:", history[i]?.san);
            return;
        }
    }
    const targetFen = tempGame.fen();
    console.log(`Navigating to ply ${ply}, FEN: ${targetFen}`);
    setFen(targetFen); // Update display FEN
    setCurrentPly(ply); // Update ply number
  };

  // Input Handling and Loading Logic
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const loadFenOrPgn = (input: string) => {
    const trimmedInput = input.trim();
    if (!trimmedInput) { console.log("Input is empty, ignoring."); return; }
    const comparisonFen = isViewingLatest ? game.current.fen() : fen;
    if (trimmedInput === comparisonFen) { console.log("Input matches current FEN, ignoring."); return; }

    let loadedFen = false;
    let loadedPgn = false;
    const looksLikeFen = trimmedInput.split('/').length > 4 && trimmedInput.split(' ').length >= 4 && !trimmedInput.includes('[');
    const looksLikePgn = trimmedInput.includes('.') || trimmedInput.includes('[');

    // --- Attempt PGN Load by Iterating Moves ---
    if (looksLikePgn) {
        try {
            // 1. Extract starting FEN from headers, if present
            const startingFen = extractFenFromPgnHeaders(trimmedInput) || START_FEN;
            console.log("PGN Load: Determined starting FEN:", startingFen);

            // 2. Clean PGN to get only the move sequence
            const cleanedMoves = cleanPgnForMoveIteration(trimmedInput);
            console.log("PGN Load: Cleaned moves:", `"${cleanedMoves}"`);

            // Check if there are actually moves to process after cleaning
            if (cleanedMoves) {
                const movesArray = cleanedMoves.split(' ');
                const tempGamePgn = new Chess(); // Create instance for validation

                // 3. Load starting position into temp instance and VALIDATE
                tempGamePgn.load(startingFen); // Attempt load
                // Check if the load resulted in the expected FEN
                if (tempGamePgn.fen() !== startingFen && startingFen !== START_FEN) {
                    throw new Error(`Invalid starting FEN detected or load failed: ${startingFen}`);
                }
                console.log("PGN Iteration: Temp instance loaded with FEN:", tempGamePgn.fen());

                // 4. Iterate through moves on temp instance
                let moveIndex = 0;
                let pgnLoadError = null;
                let successfullyAppliedMoves: string[] = []; // Store successful SANs

                for (const sanMove of movesArray) {
                    moveIndex++;
                    if (!sanMove) continue; // Skip empty strings from split
                    const moveResult = tempGamePgn.move(sanMove, { sloppy: true } as any);
                    if (!moveResult) {
                        pgnLoadError = `Invalid move in PGN sequence at move ${moveIndex} ('${sanMove}') from pos ${tempGamePgn.fen()}`;
                        console.error(pgnLoadError);
                        break; // Stop processing moves
                    } else {
                        successfullyAppliedMoves.push(moveResult.san); // Store applied SAN
                    }
                }

                // 5. If iteration succeeded (no errors)
                if (!pgnLoadError) {
                     // Check if any moves were applied OR if only a FEN was loaded
                    if (successfullyAppliedMoves.length > 0 || startingFen !== START_FEN) {
                        // Success! Apply to main game instance
                        game.current.load(startingFen); // Load validated start pos
                        successfullyAppliedMoves.forEach(san => { game.current.move(san); }); // Replay validated moves

                        loadedPgn = true;
                        console.log("Loaded PGN by replaying moves successfully.");
                        const newHistoryState = game.current.history({ verbose: true }) as Move[];
                        setInitialFen(startingFen); // <-- STORE STARTING FEN on successful load
                        setHistory(newHistoryState); // Update state
                        setCurrentPly(newHistoryState.length);
                        setFen(game.current.fen());
                        return; // EXIT
                    } else {
                         console.log("PGN processing resulted in zero valid moves (or only loaded start FEN).");
                    }
                }
                 // If error occurred during iteration, fall through
            } else {
                // No moves found, but maybe it was just headers + FEN?
                 console.log("No move sequence found after cleaning PGN. Attempting FEN load.");
            }

        } catch (e) {
             console.log("PGN processing attempt failed:", e);
             if (e instanceof Error) console.error("PGN processing error:", e.message);
             // Fall through to try FEN loading
        }
    }


    // --- Attempt FEN Load if PGN failed OR input looks only like FEN ---
    if (!loadedPgn && (looksLikeFen || !looksLikePgn)) {
        console.log("Attempting load as FEN:", `"${trimmedInput}"`);
        try {
            const testGameFen = new Chess();
            testGameFen.load(trimmedInput); // Test load
            const fenAfterLoad = testGameFen.fen();

            // Check if load produced a different FEN than the current main game state
            if (fenAfterLoad !== game.current.fen()) {
                 try {
                    game.current.load(trimmedInput); // Apply to main instance
                     // Check if main instance matches test instance
                     if (game.current.fen() === fenAfterLoad) {
                         loadedFen = true; console.log("Loaded as FEN:", game.current.fen());
                         setInitialFen(game.current.fen()); // <-- STORE LOADED FEN
                         setHistory([]); setCurrentPly(0); setFen(game.current.fen()); // Reset history
                         return; // EXIT
                     } else { console.warn("Main instance FEN load mismatch after test success."); game.current.load(fen); /* Revert */ }
                } catch (mainLoadError) { console.log("FEN load failed on main instance:", mainLoadError); }
            } else { console.log("FEN load test did not result in a different state (or was same FEN)."); }
        } catch (e) { console.log("FEN load test threw error:", e); }
    }

    // --- If neither worked ---
    if (!loadedFen && !loadedPgn) {
      console.error("Failed to load input as FEN or PGN:", trimmedInput);
      alert("Invalid FEN or PGN string!");
      setInputValue(fen); // Revert input value ONLY if all loads failed
    }
  };


  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      loadFenOrPgn(inputValue);
    }
  };

  // Handle making a move on the board
  const handleMove = (from: Key, to: Key) => {
    if (!isViewingLatest) return;
    console.log(`handleMove triggered! from: ${from}, to: ${to}`);
    const moveInput = { from: from as Square, to: to as Square, promotion: 'q' as PieceSymbol };
    let moveResult: Move | null = null;
    try {
      moveResult = game.current.move(moveInput);
      if (moveResult) {
        console.log("Move successful:", moveResult.san);
        const newHistory = game.current.history({ verbose: true }) as Move[];
        setHistory(newHistory);
        setCurrentPly(newHistory.length);
        setFen(game.current.fen());
      } else { console.log("Illegal move attempted (returned null):", from, to); }
    } catch (error) { console.error("Error during move attempt:", from, to, error); setFen(game.current.fen()); }
  };

  // Navigation Handlers
  const handleGoBack = () => { if (currentPly > 0) updateBoardToPly(currentPly - 1); };
  const handleGoForward = () => { if (currentPly < history.length) updateBoardToPly(currentPly + 1); };


  // **** JSX Return Statement ****
  return (
    <div className="app-container">
      <div className="main-layout">
        <div className="left-column">
          <div className="chessboard-container">
            <ChessboardComponent
              fen={fen}
              onMove={handleMove}
              turnColor={turnColor as CgColor}
              lastMove={lastMoveSquares}
              dests={legalDests}
              viewOnly={!isViewingLatest}
            />
          </div>
          <div className="fen-input-container">
              <input
                  type="text"
                  className="fen-pgn-input"
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Enter FEN or PGN..."
                  spellCheck="false"
              />
          </div>
          <div className="navigation-buttons">
              <button onClick={handleGoBack} disabled={currentPly === 0}>{'<'}</button>
              <span> Move: {currentPly} / {history.length} </span>
              <button onClick={handleGoForward} disabled={isViewingLatest}>{'>'}</button>
          </div>
        </div>
        <div className="right-column">
          <div className="history-list">
              {history.map((move, index) => (
                  <span
                      key={`${index}-${move.san}`}
                      className={`move-item ${index === currentPly - 1 ? 'current-move' : ''}`}
                      onClick={() => updateBoardToPly(index + 1)}
                  >
                      {move.color === 'w' ? `${Math.floor(index / 2) + 1}. ` : ''}{move.san}
                  </span>
              ))}
              {history.length === 0 && <span>No moves yet.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;