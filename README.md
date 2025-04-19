# Chess Analysis Tool - Project Status

This document summarizes the current state and features of the web-based chess analysis tool project.

**Project Goal:** To create a web-based chess analysis tool inspired by PeshkaChess, running entirely in the browser using React, `react-chessground`, `chess.js`, and Stockfish.

**File Structure:**

```markdown
. 📂 public
├── 📄 loadEngine.js
├── 📄 stockfish-17-lite-single.js
├── 📄 stockfish-17-lite-single.wasm
```

```markdown
. 📂 src
├── 📄 App.css
├── 📄 App.tsx
└── 📂 components/
│  ├── 📄 ChessboardComponent.tsx
├── 📄 main.tsx
└── 📄 vite-env.d.ts
```

**Current Feature Set:**

**I. Core Chess Board & Logic:**

*   **Board Display:** Renders a visual chessboard using `react-chessground`.
*   **Piece Rendering:** Displays standard chess pieces based on the current FEN state.
*   **Move Input:** Allows clicking or dragging pieces.
*   **Move Validation (`chess.js`):** Uses `chess.js` internally for game state and rule enforcement.
*   **Legal Move Enforcement:**
    *   Calculates legal moves using `chess.js`.
    *   Visually highlights legal destinations on piece selection/drag.
    *   Prevents dropping pieces on illegal squares.
*   **State Update:** Legal moves update internal state (`game` ref) and React state (`fen`, `history`, `currentPly`), triggering UI re-renders.
*   **Turn Indication:** Only allows pieces of the current turn's color to be moved.

**II. Game History & Navigation:**

*   **History Tracking:** Records the sequence of moves (`Move` objects).
*   **History Display:** Shows played moves in Standard Algebraic Notation (SAN) with move numbers in the right panel.
*   **Navigation Buttons:** Provides "<" (Back) and ">" (Forward) buttons, disabled appropriately.
*   **Clickable History:** Moves in the history list are clickable for direct navigation.
*   **Current Move Highlight:** Visually highlights the current move in the history list.
*   **View-Only Mode:** Board interaction is disabled when navigating history.

**III. Position/Game Loading:**

*   **Combined Input Field:** Single text input below the board.
*   **Input Display:** Dynamically shows the current FEN.
*   **Editable Input:** Supports typing, deleting, and pasting.
*   **Loading on Enter:** Processes input when Enter is pressed.
*   **FEN Loading:** Parses and loads valid FEN strings, resetting history.
*   **PGN Loading:**
    *   Handles standard PGN strings (including those with `[FEN "..."]` headers).
    *   Cleans PGN (removes comments, variations, annotations, results, move numbers).
    *   Loads the starting FEN (from header or default).
    *   Iteratively applies the cleaned SAN moves using `chess.move()`.
    *   Updates board to final position and populates history.
*   **Error Handling:** Alerts user on invalid FEN/PGN input and reverts the input field.

**IV. Engine Integration (Stockfish):**

*   **Engine Build:** Integrates `stockfish-17-lite-single.js/.wasm`.
*   **Wrapper:** Uses `loadEngine.js` (loaded via `index.html`) to manage the Stockfish Web Worker.
*   **Initialization:** Performs UCI handshake (`uci`, `isready`) and sets basic options via the wrapper.
*   **Readiness:** Detects `readyok` to confirm engine readiness (`isEngineReady` state).
*   **Position Updates:** Sends `position fen ...` commands to the engine on board changes.
*   **Analysis Control:** Provides "Analyze" and "Stop" buttons.
*   **Analysis Parsing:** Parses UCI `info` lines (depth, score, PV) received via the `loadEngine.js` callbacks.
*   **Analysis Display:** Displays the latest analysis line in the right panel. Updates during analysis. Shows status messages. Analysis stops automatically on position change.

**V. Layout & Structure:**

*   **Technology:** React (functional components, hooks), TypeScript.
*   **Layout:** Responsive two-column Flexbox layout.
*   **Board Sizing:** Board maintains a square aspect ratio, filling left column width.
*   **Styling:** Uses CSS Modules (`App.css`).
*   **(Debugging):** Includes Eruda console overlay.
*   **Build Tool:** Configured Vite (`vite.config.ts`) with necessary headers (COOP/COEP).

**Code Structure Summary:**

*   **`App.tsx`:** Main component holding state, refs (`game`, `engineRef`), core logic handlers, and `useEffect` hooks. Renders layout and passes props.
*   **`ChessboardComponent.tsx`:** Wrapper around `react-chessground`.
*   **`loadEngine.js` (in `/public`):** External script managing the Stockfish worker and providing `engine.send`.
*   **Stockfish Files (in `/public`):** The single-threaded JS/WASM build.
*   **`chess.js`:** Used via `game` ref for rules and state.
*   **State Flow:** User Interaction -> Handler -> Updates `game` ref -> Updates React State -> Re-render -> Effects -> Engine Communication -> Callbacks -> Parse Output -> Update React State -> Re-render.

---
*This summary reflects the project state after successfully integrating basic Stockfish analysis using the loadEngine.js wrapper.*