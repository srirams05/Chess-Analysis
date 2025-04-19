# PeshkaChess Application - Feature Summary (Based on Code Analysis)

This summary outlines the observed features of the PeshkaChess application, which serves as the inspiration for our project. The analysis is based on the provided `index.html`, `scripts.js`, and `styles.css` files.

**I. Core Chess Board & Logic (Similar to Current Project)**

*   **Board Display:** Renders a chessboard using custom HTML DOM elements (table/divs) and CSS for appearance. Includes coordinates.
*   **Piece Movement:** Supports drag-and-drop interaction for moving pieces.
*   **FEN/PGN Input:** Provides a text input field (`#searchInput`) for loading positions or games via FEN/PGN strings.
*   **Game Logic:** Employs a `chess.js`-like library for core chess rules, move validation, and state tracking.
*   **Move History Display:** Shows the game's move list in algebraic notation in a dedicated panel (`#history`).
*   **Move Navigation:**
    *   Toolbar buttons for Back (`#buttonBack`) and Forward (`#buttonForward`).
    *   Clickable moves within the history list panel.
    *   A "Revert" button (`#buttonRevert`) presumably to undo changes or reset.

**II. Engine Analysis (More Advanced)**

*   **Stockfish Integration:**
    *   Uses `stockfish.js` via a Web Worker.
    *   **Analysis Panel (`#wMoves`):** Displays multiple engine lines (Principal Variations - PVs).
    *   **Detailed Line Info:** Shows evaluation (centipawn/mate), depth, and the move sequence (PV) for each displayed line.
    *   **Evaluation Quality Indicator:** Uses colored circles (`.ok`, `.mi`, `.bl`) near analysis lines, possibly indicating move quality.
    *   **Control:** Analysis likely starts automatically and is controllable via menu or commands.
*   **Lc0 Integration:**
    *   Integrates Leela Chess Zero using `lc0main.js` and TensorFlow.js.
    *   **Lc0 Panel (`#wLczero`):** Displays Lc0-specific output (Move SAN, Policy value, Parent evaluation).
    *   **Network Loading:** Implies handling of Lc0 network files.
*   **Evaluation Graph (`#wGraph`):**
    *   Visualizes the engine's evaluation score over the game's progression using an HTML Canvas element.

**III. Additional Analysis & UI Features**

*   **Opening Book Display (`#wOpening`):**
    *   Identifies openings by ECO code and Name.
    *   Shows associated statistics (Score, Popularity).
*   **Static Evaluation Breakdown (`#wStatic`):**
    *   Details the components contributing to the static evaluation score (Material, Pawns, Mobility, etc.).
    *   Allows sorting these terms by value or change from the previous move.
*   **Board Editing (`#wEdit`):**
    *   Includes a mode with a piece palette for manually setting up arbitrary board positions.
*   **Visual Annotations:**
    *   Supports drawing colored arrows on the board (via SVG wrappers).
    *   Supports distinct square highlighting styles (`.h0` to `.h3`), likely for checks, selections, threats, or user annotations.
*   **Board Controls:**
    *   Button to flip the board orientation (`#buttonFlip`).
    *   Button to change the side to move (`#buttonStm`).
*   **UI Panels/Widgets:** Uses distinct, resizeable boxes (`.box`) for organizing different information displays.
*   **Menu System (`#buttonMenu`, `#menu`):** Provides a main menu likely used for:
    *   Toggling visibility of optional panels (Opening, Static, Lc0, Edit).
    *   Configuring engine parameters (depth, MultiPV, etc.).
    *   Selecting board themes.
    *   Other game/analysis actions.
*   **Board Themes:** Offers multiple visual board themes (`.c1` to `.c5`) implemented via CSS class overrides, including textured backgrounds.
*   **Material Difference Display (`#materialWrapper`):** Placeholder exists to potentially show captured pieces or material balance.
*   **Player Names Display (`#namesWrapperTop/Bottom`):** Placeholders exist to show player names from PGN headers.
*   **Tooltips (`#tooltip`):** Includes a mechanism for displaying hover tooltips.

**Technology Stack Summary:**

*   Built primarily with vanilla JavaScript, HTML, and CSS.
*   Uses direct DOM manipulation for UI updates and board rendering.
*   Integrates `chess.js` (or similar) for logic.
*   Integrates `stockfish.js` and Lc0/TensorFlow.js via Web Workers/scripts.
*   Uses HTML Canvas for the evaluation graph.

---
*This summary outlines the features observable from the provided PeshkaChess source code.*