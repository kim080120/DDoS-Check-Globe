# Globe Interaction Analysis

The frontend uses [`react-globe.gl`](https://github.com/vasturiano/react-globe.gl) to render the Earth in 3D. In `src/App.jsx`, the `<Globe />` component is configured with texture and bump maps and uses the library's built-in three.js orbit controls. Those controls enable users to click-and-drag to rotate the globe and scroll/pinch to zoom by default.

Key props showing 3D setup:
- `globeImageUrl` and `bumpImageUrl` provide surface and topology textures.
- `width` and `height` are set from `window.innerWidth`/`innerHeight` to fill the viewport.
- Arc and point data (`arcsData`, `pointsData`) are plotted on the globe but do not disable interaction.

Because no `enablePointerInteraction={false}` or custom controls override is supplied, user rotation/zoom remains enabled, so the globe can be spun with mouse drag or touch.
