import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Chess, Move, Square, PieceSymbol } from 'chess.js';
import ChessboardComponent from './components/ChessboardComponent';
import { Key, Dests, Color as CgColor } from 'chessground/types';
import './App.css'; // Ensure CSS is imported

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// --- Engine Files ---
const STOCKFISH_WORKER_PATH = '/stockfish-17-lite-single.js'; // Path for loadEngine to use

// ==================================
// Helper Functions (Defined ONCE)
// ==================================
const allMovesToDests = (moves: Move[]): Dests => {
  const dests = new Map<Key, Key[]>();
  if (!moves) { return dests; }
  for (const m of moves) { if (m && m.from && m.to) { const fromKey = m.from as Key; const toKey = m.to as Key; const destinations = dests.get(fromKey) || []; if (!destinations.includes(toKey)) { dests.set(fromKey, [...destinations, toKey]); } } }
  return dests;
};

function extractFenFromPgnHeaders(pgn: string): string | null {
    const fenRegex = /\[\s*FEN\s*"(.*?)"\s*\]/;
    const match = pgn.match(fenRegex);
    if (match && match[1]) { return match[1].trim(); }
    return null;
}

function cleanPgnForMoveIteration(pgn: string): string {
  let cleaned = pgn.replace(/\[.*?\]\s*/g, '');
  cleaned = cleaned.replace(/\{[^}]*\}/g, '');
  for (let i = 0; i < 5; i++) { cleaned = cleaned.replace(/\([^()]*\)/g, ''); }
  cleaned = cleaned.replace(/\$\d+/g, '');
  cleaned = cleaned.replace(/([a-zA-Z0-9+#=:]+[!?]+)/g, (match) => match.replace(/[!?]/g, ''));
  cleaned = cleaned.replace(/([a-zA-Z0-9+#=:]+[!?]+)/g, (match) => match.replace(/[!?]/g, ''));
  cleaned = cleaned.replace(/(?:1-0|0-1|1\/2-1\/2|\*)\s*$/, '');
  cleaned = cleaned.replace(/\d+\s*\.(\.\.)?\s*/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// Engine Analysis Line Interface
interface AnalysisLine { pv: string; score: number; mate?: number; depth: number; }

// Declare loadEngine globally
declare global { interface Window { loadEngine: (workerPath: string, options?: any) => any; } }


// ==================================
// App Component
// ==================================
function App() {
  // --- State ---
  const [fen, setFen] = useState<string>(START_FEN);
  const [history, setHistory] = useState<Move[]>([]);
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [legalDests, setLegalDests] = useState<Dests>(new Map());
  const [inputValue, setInputValue] = useState<string>(START_FEN);
  const [initialFen, setInitialFen] = useState<string>(START_FEN);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [engineAnalysis, setEngineAnalysis] = useState<AnalysisLine | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const engineRef = useRef<any>(null);
  const game = useRef(new Chess());

  // --- Derived State ---
  const turnColor = game.current.turn() === 'w' ? 'white' : 'black';
  const isViewingLatest = currentPly === history.length;
  const lastMoveData = isViewingLatest && history.length > 0 ? history[history.length - 1] : undefined;
  const lastMoveSquares = lastMoveData ? [lastMoveData.from as Key, lastMoveData.to as Key] : undefined;


  // --- Effects & Handlers ---

   // --- Handler for parsing single UCI lines (for stream callback) ---
   const parseUciLine = (line: string) => {
        if (!line) return;
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        // console.log("[App] Parsing line:", trimmedLine); // Verbose

        if (trimmedLine === 'readyok') { console.log('[App] Received readyok.'); handleReadyOk(); return; }
        if (trimmedLine.startsWith('bestmove')) { console.log("[App] Bestmove:", trimmedLine.split(' ')[1]); setIsAnalyzing(false); return; } // Exit on bestmove

        const parts = trimmedLine.split(' ');
        if (trimmedLine.startsWith('info') && parts.includes('score')) {
            let scoreCp: number | undefined; let mateIn: number | undefined;
            const scoreIndex = parts.indexOf('score');
            if (scoreIndex > -1 && parts[scoreIndex + 1] === 'cp') { scoreCp = parseInt(parts[scoreIndex + 2], 10); }
            else if (scoreIndex > -1 && parts[scoreIndex + 1] === 'mate') { mateIn = parseInt(parts[scoreIndex + 2], 10); }
            const currentTurn = game.current.turn();
            if (scoreCp !== undefined && currentTurn === 'b') { scoreCp *= -1; }
            if (mateIn !== undefined && currentTurn === 'b') { mateIn *= -1; }
            const depthIndex = parts.indexOf('depth');
            const depth = depthIndex > -1 ? parseInt(parts[depthIndex + 1], 10) : 0;
            const pvIndex = parts.indexOf('pv');
            const pv = pvIndex > -1 ? parts.slice(pvIndex + 1).join(' ') : '';
            // Update state immediately if depth is meaningful
            if (depth > 0) {
                setEngineAnalysis({ pv: pv, score: scoreCp ?? (mateIn ? (mateIn > 0 ? 9999 : -9999) : 0), mate: mateIn, depth: depth });
            }
        }
    };

   // --- Handler for FINAL callback of 'go' command ---
   const handleGoResponse = (output: string) => {
        console.log("[App] 'go' command FINISHED callback received.");
        // Parse the final block of output to catch the last info/bestmove
        if (output) {
            parseUciLine(output); // Use line parser, handles bestmove inside
        }
        // Ensure analysis stops if bestmove wasn't in the very last line parsed
        if (isAnalyzing) {
            console.warn("[App] Go finished, but 'bestmove' wasn't the last line? Forcing analysis stop.");
            setIsAnalyzing(false);
        }
   };


   // Helper to send commands
   const sendUciCommand = (command: string, finalCallback?: (output: string) => void, streamCallback?: (line: string) => void) => {
       if (engineRef.current?.send) {
            console.log('[App] >> Engine UCI:', command);
            engineRef.current.send(command, finalCallback, streamCallback);
       } else { console.warn("[App] Cannot send command: Engine ref missing/no 'send'."); }
   };

  // Function to run after receiving 'readyok'
   const handleReadyOk = () => {
       if (!isEngineReady) {
            setIsEngineReady(true);
            console.log("[App] Engine is ready!");
            if (engineRef.current) {
                sendUciCommand(`setoption name Use NNUE value true`);
                sendUciCommand(`position fen ${fen}`);
            }
       }
   };


  // Effect 1: Initialize loadEngine.js and Stockfish
  useEffect(() => {
      let engine: any = null;

      const init = () => {
          console.log("Checking for loadEngine function...");
          if (typeof window.loadEngine === 'function') {
              console.log("Calling window.loadEngine()...");
              try {
                  engine = window.loadEngine(STOCKFISH_WORKER_PATH);
                  engineRef.current = engine;
                  console.log("Setting up response handling via callbacks...");
                  if (typeof engine.send === 'function') {
                      sendUciCommand('uci'); // Send uci, don't need callback
                      // Send 'isready', use parseUciLine for the callback output
                      sendUciCommand('isready', parseUciLine);
                  } else { console.error("Engine object missing 'send' method."); setIsEngineReady(false); }
              } catch (err) { console.error("Error calling loadEngine:", err); alert(`Init Error: ${err instanceof Error ? err.message : String(err)}`); setIsEngineReady(false); }
          } else { console.error("loadEngine fn not found."); alert("loadEngine.js failed"); setIsEngineReady(false); }
      };
      const timerId = setTimeout(init, 150); // Delay init slightly
      // Cleanup function
      return () => {
          clearTimeout(timerId); console.log("Terminating Engine...");
          const engineToClean = engineRef.current;
          // No listener removal needed
          if (engineToClean?.quit) { engineToClean.quit(); }
          engineRef.current = null; setIsEngineReady(false); setIsAnalyzing(false);
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once


  // Effect 2: Send FEN to engine when board changes
   useEffect(() => {
      if (isEngineReady && engineRef.current && fen) {
          sendUciCommand(`position fen ${fen}`);
          if (isAnalyzing) { stopAnalysis(); console.log("[App] Pos changed, stopping analysis."); setEngineAnalysis(null); }
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, isEngineReady]);


  // Effect 3: Synchronize the main `game` ref instance
  useEffect(() => {
    if (history.length === 0 && game.current.history().length > 0) { game.current.reset(); setInitialFen(START_FEN); if (fen !== START_FEN) setFen(START_FEN); if (currentPly !== 0) setCurrentPly(0); return; }
    if (isViewingLatest) { if (game.current.history().length !== history.length || game.current.fen() !== fen ) { game.current.load(initialFen); let success = true; for (const move of history) { try { if (!game.current.move(move.san)) { success = false; break; } } catch (_error) { success = false; break; } } if (!success) { setHistory([]); setCurrentPly(0); setFen(START_FEN); setInitialFen(START_FEN); game.current.reset(); } else { if (fen !== game.current.fen()) setFen(game.current.fen()); } } }
  }, [history, isViewingLatest, fen, initialFen]);


  // Effect 4: Update legal destinations and the input field value
  useEffect(() => {
    if (fen !== inputValue) { setInputValue(fen); }
    if (isViewingLatest) {
       if (game.current.fen() === fen) {
          const moves = game.current.moves({ verbose: true });
          const newDests = allMovesToDests(moves);
          if (JSON.stringify(Array.from(newDests.entries())) !== JSON.stringify(Array.from(legalDests.entries()))) { setLegalDests(newDests); }
       } else { if (legalDests.size > 0) setLegalDests(new Map()); }
    } else { if (legalDests.size > 0) { setLegalDests(new Map()); } }
  }, [fen, isViewingLatest, history.length, legalDests]);


  // --- Action Handlers ---

  // Function to update display board FEN for navigation
  const updateBoardToPly = (ply: number) => {
    if (ply === currentPly) return; if (ply < 0 || ply > history.length) return;
    const tempGame = new Chess(); try { tempGame.load(initialFen); } catch(e) { tempGame.load(START_FEN); }
    for (let i = 0; i < ply; i++) { if (history[i] && !tempGame.move(history[i].san)) { return; } }
    const targetFen = tempGame.fen(); setFen(targetFen); setCurrentPly(ply);
  };

  // Functions to control analysis (Use stream callback)
  const startAnalysis = () => {
      if (engineRef.current && isEngineReady && !isAnalyzing) {
          setEngineAnalysis(null); setIsAnalyzing(true);
          console.log('[App] Sending "go infinite"...');
          // Pass parseUciLine as the STREAM callback (3rd arg)
          // Pass handleGoResponse as the FINAL callback (2nd arg)
          sendUciCommand('go infinite', handleGoResponse, parseUciLine);
      }
  };
  const stopAnalysis = () => {
      if (engineRef.current && isEngineReady && isAnalyzing) {
          console.log('[App] Sending "stop"...');
          sendUciCommand('stop'); // Output handled by callbacks passed to 'go'
      }
  };


  // Input Handling and Loading Logic
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInputValue(event.target.value); };
  const loadFenOrPgn = (input: string) => {
     const trimmedInput = input.trim(); if (!trimmedInput) return; const comparisonFen = isViewingLatest ? game.current.fen() : fen; if (trimmedInput === comparisonFen) return;
     let loadedFen = false; let loadedPgn = false; const looksLikeFen = trimmedInput.split('/').length > 4 && trimmedInput.split(' ').length >= 4 && !trimmedInput.includes('['); const looksLikePgn = trimmedInput.includes('.') || trimmedInput.includes('[');
     if (looksLikePgn) { try { const startingFen = extractFenFromPgnHeaders(trimmedInput) || START_FEN; const cleanedMoves = cleanPgnForMoveIteration(trimmedInput); if (cleanedMoves) { const movesArray = cleanedMoves.split(' '); const tempGamePgn = new Chess(); tempGamePgn.load(startingFen); if (tempGamePgn.fen() !== startingFen && startingFen !== START_FEN) throw new Error(`Invalid start FEN`); let pgnLoadError = null; let successfullyAppliedMoves: string[] = []; for (let i=0; i < movesArray.length; i++) { const sanMove = movesArray[i]; if (!sanMove) continue; const moveResult = tempGamePgn.move(sanMove, { sloppy: true } as any); if (!moveResult) { pgnLoadError = `Invalid move ${i+1}`; break; } else { successfullyAppliedMoves.push(moveResult.san); } } if (!pgnLoadError && (successfullyAppliedMoves.length > 0 || startingFen !== START_FEN)) { game.current.load(startingFen); successfullyAppliedMoves.forEach(san => { game.current.move(san); }); loadedPgn = true; const newHistoryState = game.current.history({ verbose: true }) as Move[]; setInitialFen(startingFen); setHistory(newHistoryState); setCurrentPly(newHistoryState.length); setFen(game.current.fen()); return; } else if (!pgnLoadError) console.log("PGN iter 0 moves."); else console.error(pgnLoadError); } else { console.log("No moves after clean."); } } catch (e) { console.log("PGN iter fail:", e); } }
     if (!loadedPgn && (looksLikeFen || !looksLikePgn)) { try { const testGameFen = new Chess(); testGameFen.load(trimmedInput); const fenAfterLoad = testGameFen.fen(); if (fenAfterLoad !== game.current.fen()) { try { game.current.load(trimmedInput); if (game.current.fen() === fenAfterLoad) { loadedFen = true; setInitialFen(game.current.fen()); setHistory([]); setCurrentPly(0); setFen(game.current.fen()); return; } else { game.current.load(fen); } } catch (mainLoadError) {} } else {} } catch (e) {} }
     if (!loadedFen && !loadedPgn) { alert("Invalid FEN/PGN"); setInputValue(fen); }
  };
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') loadFenOrPgn(inputValue); };

  // Handle making a move on the board
  const handleMove = (from: Key, to: Key) => {
    if (!isViewingLatest) return;
    const moveInput = { from: from as Square, to: to as Square, promotion: 'q' as PieceSymbol };
    let moveResult: Move | null = null;
    try {
      moveResult = game.current.move(moveInput);
      if (moveResult) { const newHistory = game.current.history({ verbose: true }) as Move[]; setHistory(newHistory); setCurrentPly(newHistory.length); setFen(game.current.fen()); }
      else { console.log("Illegal move (null):", from, to); }
    } catch (error) { console.error(`Error move ${from} to ${to}:`, error); setFen(game.current.fen()); }
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
           <div className="engine-analysis-section">
              <h3>Engine Analysis</h3>
              <div className="engine-controls">
                  <button onClick={startAnalysis} disabled={!isEngineReady || isAnalyzing}>
                      {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </button>
                  <button onClick={stopAnalysis} disabled={!isEngineReady || !isAnalyzing}>
                      Stop
                  </button>
                  {!isEngineReady && <span> (Engine loading...)</span>}
              </div>
              <div className="engine-output">
                  {isAnalyzing && !engineAnalysis && <p>Thinking...</p> }
                  {engineAnalysis ? (
                      <div>
                          <p> Depth: {engineAnalysis.depth} | Score: {engineAnalysis.mate ? `Mate in ${Math.abs(engineAnalysis.mate)} (${engineAnalysis.mate > 0 ? 'W' : 'B'})` : (engineAnalysis.score / 100).toFixed(2)} </p>
                          <p className="engine-pv">PV: {engineAnalysis.pv}</p>
                      </div>
                  ) : ( !isAnalyzing && <p>{isEngineReady ? 'Click Analyze to start.' : 'Waiting for engine...'}</p> )}
              </div>
          </div>
          <div className="history-list">
              {history.map((move, index) => (
                  <span key={`${index}-${move.san}`} className={`move-item ${index === currentPly - 1 ? 'current-move' : ''}`} onClick={() => updateBoardToPly(index + 1)}>
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