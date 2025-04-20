// --- START App.tsx (Baseline + Multi-PV + Effect 2/Handler Fixes) ---

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { Chess, Move, Square, PieceSymbol } from 'chess.js';
import ChessboardComponent from './components/ChessboardComponent';
import { Key, Dests, Color as CgColor } from 'chessground/types';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import './App.css';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const STOCKFISH_WORKER_PATH = '/stockfish-17-lite-single.js';
const MULTI_PV_COUNT = 5; // For Multi-PV

// ==================================
// Helper Functions (Original Implementation)
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

// Engine Analysis Line Interface (with multipv)
interface AnalysisLine {
  multipv: number; pv: string; score: number; mate?: number; depth: number;
}

// Declare loadEngine globally
declare global { interface Window { loadEngine: (workerPath: string, options?: any) => any; } }

// ==================================
// App Component
// ==================================
function App() {
  // console.log("--- App Render ---"); // Keep commented unless debugging renders

  // --- State ---
  const [fen, setFen] = useState<string>(START_FEN);
  const [history, setHistory] = useState<Move[]>([]);
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [legalDests, setLegalDests] = useState<Dests>(new Map());
  const [inputValue, setInputValue] = useState<string>(START_FEN); // Initialize with START_FEN
  const [initialFen, setInitialFen] = useState<string>(START_FEN);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [pvLines, setPvLines] = useState<AnalysisLine[]>([]); // State for multi-PV lines
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);
  const engineRef = useRef<any>(null);
  const game = useRef(new Chess());

  // --- Derived State ---
  const turnColor = game.current.turn() === 'w' ? 'white' : 'black';
  const isViewingLatest = currentPly === history.length;
  const lastMoveData = isViewingLatest && history.length > 0 ? history[history.length - 1] : undefined;
  const lastMoveSquares = lastMoveData ? [lastMoveData.from as Key, lastMoveData.to as Key] : undefined;


  // --- Effects & Handlers ---

  // Helper to send commands (useCallback for stability)
   const sendUciCommand = useCallback((command: string, finalCallback?: (output: string) => void, streamCallback?: (line: string) => void) => {
       if (engineRef.current?.send) {
            // console.log('[App] >> Engine UCI:', command);
            engineRef.current.send(command, finalCallback, streamCallback);
       } else { console.warn("[App] Cannot send command: Engine ref missing/no 'send'."); }
   }, []);

   // Handler for FINAL callback of 'go' command (non-memoized)
   const handleGoResponse = (output: string) => {
        console.log("[App] 'go' command FINISHED callback received.");
        if (output) {
             const lines = output.split('\n');
             lines.forEach(line => parseUciLine(line)); // Process any trailing lines
        }
        // Check state just in case bestmove wasn't processed correctly
        if (isAnalyzing) {
            console.warn("[App] Go finished, but isAnalyzing still true? Forcing state.");
            setIsAnalyzing(false);
        }
   };

   // Function called by parseUciLine when 'readyok' is received (non-memoized)
   // Sets MultiPV option
   const handleReadyOk = () => {
       if (!isEngineReady) {
            setIsEngineReady(true);
            console.log("[App] Engine is ready!");
            if (engineRef.current) {
                sendUciCommand(`setoption name Use NNUE value true`);
                sendUciCommand(`setoption name MultiPV value ${MULTI_PV_COUNT}`); // Set MultiPV preference
                sendUciCommand(`position fen ${fen}`); // Send initial position
            }
       }
   };

   // Handler for parsing single UCI lines (non-memoized)
   // Handles readyok, bestmove, and info lines for MultiPV display
   const parseUciLine = (line: string) => {
        if (!line) return;
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        // console.log("[App] Parsing line:", trimmedLine); // Verbose

        if (trimmedLine === 'readyok') {
            console.log('[App] Received readyok.');
            handleReadyOk();
            return;
        }
        if (trimmedLine.startsWith('bestmove')) {
            console.log("[App] Bestmove received:", trimmedLine.split(' ')[1]);
            // No need to clear pvLines here - keep last result visible
            setIsAnalyzing(false); // Stop analysis state
            return;
        }

        const parts = trimmedLine.split(' ');
        // Process 'info' lines with score and multipv
        if (trimmedLine.startsWith('info') && parts.includes('score') && parts.includes('multipv')) {
            let scoreCp: number | undefined; let mateIn: number | undefined;
            const scoreIndex = parts.indexOf('score');
            if (scoreIndex > -1 && parts[scoreIndex + 1] === 'cp') { scoreCp = parseInt(parts[scoreIndex + 2], 10); }
            else if (scoreIndex > -1 && parts[scoreIndex + 1] === 'mate') { mateIn = parseInt(parts[scoreIndex + 2], 10); }

            // Adjust score perspective based on whose turn it is in the FEN
            const turnInFen = fen.split(' ')[1];
            if (turnInFen === 'b') {
                if (scoreCp !== undefined) scoreCp *= -1;
                if (mateIn !== undefined) mateIn *= -1;
            }

            const depthIndex = parts.indexOf('depth');
            const depth = depthIndex > -1 ? parseInt(parts[depthIndex + 1], 10) : 0;
            const pvIndex = parts.indexOf('pv');
            const pv = pvIndex > -1 ? parts.slice(pvIndex + 1).join(' ') : ''; // UCI PV
            const multipvIndex = parts.indexOf('multipv');
            const multipv = multipvIndex > -1 ? parseInt(parts[multipvIndex + 1], 10) : null;

            if (depth > 0 && pv && multipv !== null) {
                const newLine: AnalysisLine = {
                    multipv, pv, // UCI PV for now
                    score: scoreCp ?? (mateIn ? (mateIn > 0 ? 9999 : -9999) : 0),
                    mate: mateIn, depth
                };
                // Update pvLines state immutably
                setPvLines(prevLines => {
                    const linesMap = new Map<number, AnalysisLine>();
                    prevLines.forEach(line => linesMap.set(line.multipv, line));
                    linesMap.set(newLine.multipv, newLine);
                    const updatedLines = Array.from(linesMap.values())
                        .sort((a, b) => a.multipv - b.multipv)
                        .slice(0, MULTI_PV_COUNT);
                    return updatedLines;
                });
            }
        }
    }; // End parseUciLine


  // Functions to control analysis (Manual Trigger - Not using useCallback now)
  const startAnalysis = () => {
      if (engineRef.current && isEngineReady && !isAnalyzing && isViewingLatest) {
          console.log('[App] Starting Analysis (go infinite)...');
          setPvLines([]); // Clear previous lines
          setIsAnalyzing(true); // Set state
          sendUciCommand(`position fen ${fen}`); // Ensure position is current

          // Wrapper for stream logging if needed
          const streamCallbackWrapper = (line: string) => {
              // console.log("[Stream Callback Raw]:", line); // Uncomment for deep debug
              parseUciLine(line);
          };
          sendUciCommand('go infinite', handleGoResponse, streamCallbackWrapper);
      } else {
          console.warn(`[App] startAnalysis conditions not met: engineReady=${isEngineReady}, analyzing=${isAnalyzing}, viewingLatest=${isViewingLatest}`);
      }
  };
  const stopAnalysis = () => {
      if (engineRef.current && isEngineReady && isAnalyzing) {
          console.log('[App] stopAnalysis: Sending "stop"...');
          sendUciCommand('stop'); // Engine responds with bestmove -> parseUciLine sets isAnalyzing=false
          // Force UI update immediately for responsiveness
          setIsAnalyzing(false);
          console.log('[App] stopAnalysis: Manually set isAnalyzing to false.');
      }
  };


  // Effect 1: Initialize loadEngine.js and Stockfish
  useEffect(() => {
      let engine: any = null;
      const init = () => {
          if (typeof window.loadEngine === 'function') {
              try {
                  engine = window.loadEngine(STOCKFISH_WORKER_PATH);
                  engineRef.current = engine;
                  if (typeof engine.send === 'function') {
                      sendUciCommand('uci'); sendUciCommand('isready', parseUciLine);
                  } else { console.error("Engine has no send method."); setIsEngineReady(false); }
              } catch (err) { console.error("loadEngine error:", err); setIsEngineReady(false); }
          } else { console.error("loadEngine not found."); setIsEngineReady(false); }
      };
      const timerId = setTimeout(init, 150);
      return () => {
          clearTimeout(timerId); console.log("Terminating Engine...");
          // Call non-memoized stopAnalysis directly if needed
          if (engineRef.current && isAnalyzing) {
               console.log("[Effect 1 Cleanup] Calling stopAnalysis.");
               stopAnalysis();
          }
          const engineToClean = engineRef.current;
          if (engineToClean?.quit) engineToClean.quit();
          engineRef.current = null; setIsEngineReady(false); setIsAnalyzing(false); setPvLines([]);
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once


  // Effect 2: Send FEN to engine when board position changes
  // *** SIMPLIFIED: Only sends position, does NOT stop analysis ***
   useEffect(() => {
      if (isEngineReady && engineRef.current && fen) {
          console.log(`[Effect 2 Simplified] FEN (${fen}) or Engine Ready (${isEngineReady}) changed. Sending position.`);
          sendUciCommand(`position fen ${fen}`);
          // Stop logic is now handled EXCLUSIVELY by the action handlers before FEN changes
      }
   }, [fen, isEngineReady, sendUciCommand]); // Dependencies trigger only on position/readiness change


  // Effect 3: Synchronize the main `game` ref instance
  useEffect(() => {
    if (history.length === 0 && game.current.history().length > 0) { game.current.reset(); setInitialFen(START_FEN); if (fen !== START_FEN) setFen(START_FEN); if (currentPly !== 0) setCurrentPly(0); return; }
    if (isViewingLatest) { if (game.current.history().length !== history.length || game.current.fen() !== fen ) { game.current.load(initialFen); let success = true; for (const move of history) { try { if (!game.current.move(move.san)) { success = false; break; } } catch (_error) { success = false; break; } } if (!success) { setHistory([]); setCurrentPly(0); setFen(START_FEN); setInitialFen(START_FEN); game.current.reset(); } else { if (fen !== game.current.fen()) setFen(game.current.fen()); } } }
  }, [history, isViewingLatest, fen, initialFen]);


  // Effect 4: Update legal destinations and the input field value
  // *** Input sync restored, simplified dependencies ***
    // Effect 4: Update legal destinations ONLY

    // Effect 4: Update legal destinations AND Sync input display value FROM FEN state
    useEffect(() => {
      // console.log("[Effect 4] Running. Fen:", fen, "ViewingLatest:", isViewingLatest);
  
      // *** RESTORED: Sync input value FROM fen state ***
      // This updates the input display when FEN changes due to moves/loads
      if (fen !== inputValue) {
          // console.log("[Effect 4] Syncing input value from FEN state.");
          setInputValue(fen);
      }
  
      // Update legal moves based on game state
      if (isViewingLatest) {
         if (game.current.fen() === fen) { // Check sync
            const moves = game.current.moves({ verbose: true });
            const newDests = allMovesToDests(moves);
            // Avoid re-render if possible
            const currentDestsJSON = JSON.stringify(Array.from(legalDests.entries()));
            const newDestsJSON = JSON.stringify(Array.from(newDests.entries()));
            if (newDestsJSON !== currentDestsJSON) {
                 setLegalDests(newDests);
            }
         } else {
             if (legalDests.size > 0) setLegalDests(new Map()); // Clear if not synced
         }
      } else {
          if (legalDests.size > 0) setLegalDests(new Map()); // Clear if navigating
      }
    // *** CORRECTED DEPENDENCIES: Only trigger on FEN/view changes, NOT input/dests changes ***
    }, [fen, isViewingLatest, history.length]); // Removed legalDests, inputValue

  // Effect 5: Handle Keyboard Navigation for History Tab
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'text') return;
      if (activeTabIndex === 1) { // Check tab inside handler
        if (event.key === 'ArrowLeft') { event.preventDefault(); handleGoBack(); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); handleGoForward(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabIndex]); // Depends only on activeTabIndex


  // --- Action Handlers (Ensure stopAnalysis is called correctly) ---

  // Function to update display board FEN for navigation
  const updateBoardToPly = (ply: number) => {
    if (ply === currentPly) return; if (ply < 0 || ply > history.length) return;
    // *** Stop analysis BEFORE changing state ***
    if (isAnalyzing) {
        console.log("[updateBoardToPly] Calling stopAnalysis.");
        stopAnalysis();
    }
    const tempGame = new Chess();
    try { tempGame.load(initialFen); } catch(e) { tempGame.load(START_FEN); }
    for (let i = 0; i < ply; i++) { if (history[i] && !tempGame.move(history[i].san)) { return; } }
    const targetFen = tempGame.fen();
    setFen(targetFen); // Update displayed FEN
    setCurrentPly(ply); // Update ply number
  };

  // Input Handling and Loading Logic
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setInputValue(event.target.value); };
  const loadFenOrPgn = (input: string) => {
     const trimmedInput = input.trim(); if (!trimmedInput) return;
     const comparisonFen = isViewingLatest ? game.current.fen() : fen;
     if (trimmedInput === comparisonFen) return;
     // *** Stop analysis BEFORE attempting load ***
     if (isAnalyzing) {
         console.log("[loadFenOrPgn] Calling stopAnalysis.");
         stopAnalysis();
     }
     let loadedFen = false; let loadedPgn = false; const looksLikeFen = trimmedInput.split('/').length > 4 && trimmedInput.split(' ').length >= 4 && !trimmedInput.includes('['); const looksLikePgn = trimmedInput.includes('.') || trimmedInput.includes('[');
     // ... (rest of PGN/FEN loading logic - assuming it was correct in baseline) ...
     if (looksLikePgn) { try { const startingFen = extractFenFromPgnHeaders(trimmedInput) || START_FEN; const cleanedMoves = cleanPgnForMoveIteration(trimmedInput); if (cleanedMoves || startingFen !== START_FEN) { const movesArray = cleanedMoves ? cleanedMoves.split(' ') : []; const tempGamePgn = new Chess(); try { tempGamePgn.load(startingFen); } catch(e){ throw new Error("Invalid Start FEN")} let pgnLoadError = null; let successfullyAppliedMoves: string[] = []; for (let i=0; i < movesArray.length; i++) { const sanMove = movesArray[i]; if (!sanMove) continue; const moveResult = tempGamePgn.move(sanMove, { sloppy: true } as any); if (!moveResult) { pgnLoadError = `Invalid move ${i+1}: ${sanMove}`; break; } else { successfullyAppliedMoves.push(moveResult.san); } } if (!pgnLoadError) { game.current.load(startingFen); successfullyAppliedMoves.forEach(san => { game.current.move(san); }); loadedPgn = true; const newHistoryState = game.current.history({ verbose: true }) as Move[]; setInitialFen(startingFen); setHistory(newHistoryState); setCurrentPly(newHistoryState.length); setFen(game.current.fen()); return; } else { console.error(pgnLoadError); } } else { console.log("No moves after clean."); } } catch (e) { console.log("PGN loading error:", e); } }
     if (!loadedPgn && (looksLikeFen || !looksLikePgn)) { try { new Chess(trimmedInput); game.current.load(trimmedInput); loadedFen = true; setInitialFen(game.current.fen()); setHistory([]); setCurrentPly(0); setFen(game.current.fen()); return; } catch (e) { console.log("FEN loading error:", e); } }
     if (!loadedFen && !loadedPgn) { alert("Invalid FEN/PGN"); setInputValue(fen); }
  };
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') loadFenOrPgn(inputValue); };

  // Handle making a move on the board
  const handleMove = (from: Key, to: Key) => {
    if (!isViewingLatest) return;
    // *** Stop analysis BEFORE attempting move ***
    if (isAnalyzing) {
        console.log("[handleMove] Calling stopAnalysis.");
        stopAnalysis();
    }
    const moveInput = { from: from as Square, to: to as Square, promotion: 'q' as PieceSymbol };
    let moveResult: Move | null = null;
    try {
      moveResult = game.current.move(moveInput);
      if (moveResult) {
          const newHistory = game.current.history({ verbose: true }) as Move[];
          setHistory(newHistory); setCurrentPly(newHistory.length); setFen(game.current.fen()); // Update state AFTER move
      } else { console.log("Illegal move (null):", from, to); }
    } catch (error) { console.error(`Error move ${from} to ${to}:`, error); setFen(game.current.fen()); }
  };

  // Navigation Handlers
  const handleGoBack = () => { if (currentPly > 0) updateBoardToPly(currentPly - 1); };
  const handleGoForward = () => { if (currentPly < history.length) updateBoardToPly(currentPly + 1); };


  // **** JSX Return Statement ****
  return (
    <div className="app-container">
      <div className="main-layout">
        {/* Left Column */}
        <div className="left-column">
          <div className="chessboard-container">
            <ChessboardComponent
              fen={fen}
              onMove={handleMove} // Use non-memoized handler
              turnColor={turnColor as CgColor}
              lastMove={lastMoveSquares}
              dests={legalDests}
              viewOnly={!isViewingLatest}
            />
          </div>
          <div className="fen-input-container">
              <input type="text" className="fen-pgn-input" value={inputValue} onChange={handleInputChange} onKeyDown={handleInputKeyDown} placeholder="Enter FEN or PGN..." spellCheck="false"/>
          </div>
          <div className="navigation-buttons">
              <button onClick={handleGoBack} disabled={currentPly === 0}>{'<'}</button>
              <span> Move: {currentPly} / {history.length} </span>
              <button onClick={handleGoForward} disabled={isViewingLatest}>{'>'}</button>
          </div>
        </div>
        {/* Right Column */}
        <div className="right-column">
          <Tabs selectedIndex={activeTabIndex} onSelect={index => setActiveTabIndex(index)}>
            <TabList>
              <Tab>Analysis</Tab>
              <Tab>History</Tab>
            </TabList>

            {/* Analysis Panel */}
            <TabPanel>
              <div className="tab-content-wrapper">
                 <div className="engine-analysis-section">
                    <h3>Engine Analysis</h3>
                    <div className="engine-controls">
                        <button onClick={startAnalysis} disabled={!isEngineReady || isAnalyzing || !isViewingLatest}>
                            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                        </button>
                        <button onClick={stopAnalysis} disabled={!isEngineReady || !isAnalyzing}>
                            Stop
                        </button>
                        {!isEngineReady && <span> (Engine loading...)</span>}
                        {!isViewingLatest && isEngineReady && <span style={{marginLeft: '10px', fontStyle: 'italic'}}>(Navigating history)</span>}
                    </div>
                    <div className="engine-output">
                        {!isEngineReady && <span>Engine loading...</span>}
                        {isEngineReady && isAnalyzing && pvLines.length === 0 && <p>Thinking...</p>}
                        {isEngineReady && !isAnalyzing && pvLines.length === 0 && isViewingLatest && <p>Click Analyze to start.</p>}
                        {isEngineReady && !isAnalyzing && pvLines.length === 0 && !isViewingLatest && <p>Analysis unavailable (viewing history).</p>}
                        {isEngineReady && pvLines.length > 0 && (
                            <div className="pv-lines-container">
                                {pvLines.map((line) => (
                                    <div key={line.multipv} className="pv-line">
                                        <span className="pv-score">{line.mate ? `M${line.mate > 0 ? '' : '-'}${Math.abs(line.mate)}` : (line.score / 100).toFixed(2)}</span>
                                        <span className="pv-depth">(D{line.depth})</span>
                                        <span className="pv-text">{line.pv}</span> {/* UCI PV */}
                                    </div>
                                ))}
                            </div>
                        )}
                         {isEngineReady && !isAnalyzing && pvLines.length > 0 && <p style={{fontSize: '0.8em', color: '#666', marginTop: '5px'}}>(Analysis stopped)</p>}
                    </div>
                 </div>
              </div>
            </TabPanel>

            {/* History Panel */}
            <TabPanel>
               <div className="tab-content-wrapper">
                  <div className="history-list">
                      {history.map((move, index) => (
                          <span key={`${index}-${move.san}`} className={`move-item ${index === currentPly - 1 ? 'current-move' : ''}`} onClick={() => updateBoardToPly(index + 1)}>
                              {move.color === 'w' ? `${Math.floor(index / 2) + 1}. ` : ''}{move.san}
                          </span>
                      ))}
                      {history.length === 0 && <span>No moves yet.</span>}
                  </div>
               </div>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default App;

// --- END App.tsx (Baseline + Multi-PV + Effect 2/Handler Fixes) ---