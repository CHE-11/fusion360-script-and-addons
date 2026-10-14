# CONstrainer

CONstrainer is a Fusion 360 add-in that creates and manages sketch geometric constraints and assembly joints.

The palette has two tabs:

- **Sketches** lists every sketch in the active design, grouped by component. Each sketch shows whether it is fully constrained and lists its geometric constraints. Select geometry in the canvas, click **Use selection**, and apply a constraint that fits that geometry. Click a constraint to select its geometry, or delete it when Fusion allows it.
- **Joints** is shown for assembly and hybrid designs. It lists joints and as-built joints under the component that owns them. Show or hide a joint, suppress it, rename it, or select it. Select two faces, edges, points, or components, then create a rigid, revolute, slider, cylindrical, pin-slot, planar, or ball joint. As-built create is offered when the selection resolves to two components.

Sketch dimensions stay in ProParams. Rigid groups and contact sets are not managed here.

## Install

1. In Fusion, open **Utilities → Scripts and Add-Ins** (or press `Shift+S`).
2. On the **Add-Ins** tab, click the **+** next to **My Add-Ins**.
3. Select the `add-ins/CONstrainer/addin` folder.
4. Run **CONstrainer**. It also starts with Fusion.

The command is added to the Design workspace **Solid** scripts and add-ins panel. The palette docks on the right.

Set `REACT_DEV = True` in `addin/config.py` and run the Vite dev server when you want the palette to load `http://localhost:5173/` instead of the built page.

## Build

From `add-ins/CONstrainer/client` (or the **CONstrainer - Build** task):

1. Build the React client (`client/`) for production.
2. Create/update the palette HTML folder at `addin/commands/constraints/resources/html/`.
3. Generate a single HTML (`index.html`) and JS bundle (`static/palette.js`) from the React build output.
4. Copy `index.html` to `addin/commands/constraints/resources/html/index.html`.
5. Create/update `addin/commands/constraints/resources/html/static/` and write `palette.js` there.
6. Create/update `addin/commands/constraints/resources/html/assets/`.
7. Copy assets from `client/src/assets/` into the palette `assets/` folder.
