# ProParams

ProParams is a Fusion 360 Add-In that allows you to easily create and manage parameters for your designs.

## Build
When you run the build script the following will happen: 
1. Build the React client (`client/`) for production.
2. Create/update the palette HTML folder at `_ProParams_/commands/paletteShow/resources/html/`.
3. Generate a single HTML (`index.html`) and JS bundle (`static/palette.js`) from the React build output.
4. Copy `index.html` to `_ProParams_/commands/paletteShow/resources/html/index.html`.
5. Create/update `_ProParams_/commands/paletteShow/resources/html/static/` and write `palette.js` there.
6. Create/update `_ProParams_/commands/paletteShow/resources/html/assets/`.
7. Copy assets from `client/src/assets/` into the palette `assets/` folder.
