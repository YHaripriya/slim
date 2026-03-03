# DICOM Microscopy Viewer patches

## 1. setTarget on render

### Why

The slide image and overview map did not appear because `dicom-microscopy-viewer` only calls `this[_map].setTarget(container)` **inside an async callback** (after fetching ICC profiles). If that async work fails or is slow, the OpenLayers map is never attached to the DOM, so no canvas or `ol-` elements are created.

### What was patched

We call `this[_map].setTarget(container)` **immediately** in `render()`, right after `this[_container] = container`, so the map (and canvas) is attached to the viewport div as soon as `render()` runs. The existing async logic still runs to set up tile loaders and can call `setTarget` again without harm.

## 2. Guard setLoader (avoid "Cannot read properties of null (reading 'setLoader')")

### Why

After the map is attached, the async `forEach` in `render()` still runs. When it resumes after `await _getIccProfiles()`, `item.layer.getSource()` can be null (e.g. layer removed or not ready), so `source.setLoader(loader)` throws.

### What was patched

- **Source**: Before every `source.setLoader(loader)` call, ensure a null check (e.g. `if (source) source.setLoader(loader)`). Applied in `render()` forEach, `showOpticalPath`, and parameter mapping loader setup.
- **Dist**: Replace `source.setLoader(loader)` with `source&&source.setLoader(loader)` in `dist/dynamic-import/dicomMicroscopyViewer.min.js` so the call is skipped when `source` is null.

## 3. Re-fit view in resize (fix blank image when tiles load after container was 0-sized)

### Why

Tiles are fetched successfully (network returns 200 for tile data), but the map’s view was fitted inside dmv’s async `render()` when `this[_map].getSize()` could still be `[0,0]`. The view extent/resolution is then wrong, so the image does not appear even though tiles are in memory. Calling `resize()` later (e.g. from our timeouts or ResizeObserver) only ran `updateSize()` and did not re-fit the view.

### What was patched

- **Source**: In `VolumeImageViewer.resize()`, after `this[_map].updateSize()`, get the view and projection, read the current map size, and if both dimensions are &gt; 0 call `view.fit(projection.getExtent(), { size })`, then call `this[_updateOverviewMapSize]()`.
- **Dist**: Same logic added in the first `resize()` implementation in `dicomMicroscopyViewer.min.js` (the one that calls `this[_updateOverviewMapSize]()`).

In the app, `SlideViewer` also calls `volumeViewerRef.current?.resize()` at 200, 500, 1000, and 2000 ms after `populateViewports()`, so the view is re-fitted once the container has size and tiles have started loading.

## 4. Placeholder loader (avoid "sourceLoader is not a function")

### Why

The map is attached to the DOM at the start of `render()` (patch 1), but the real tile loader is set inside an async `forEach` (after `await _getIccProfiles()`). If the map requests tiles before that async work completes, the DataTileSource’s `loader_` is still undefined and the library throws "sourceLoader is not a function".

### What was patched

- **Source**: When creating `DataTileSource` for optical paths (monochrome and color), pass a `loader` option that returns `Promise.reject(new Error('Tile loader not ready yet'))`. The async `forEach` later replaces it with the real loader via `setLoader()`. Tiles requested too early fail with a clear message and can be retried after pan/zoom.
- **Dist**: Same `loader` option added to both optical-path `DataTileSource` constructions in `dicomMicroscopyViewer.min.js`.

The app’s `errorInterceptor` in `viewerUtils.ts` ignores these transient errors (message contains "sourceLoader is not a function" or "Tile loader not ready yet") so the "Visualization error" modal is not shown for them.

## 5. Delayed overview map refresh and force render (fix overview not rendering)

### Why

The overview map shares the main map’s tile source. It can paint once before enough tiles are in the cache, so the overview sometimes shows only the container and blue viewport box with no map image. Also, if the main viewport has zero size when `_updateOverviewMapSize` first runs, the overview gets 0×0 dimensions and never renders.

### What was patched

- **Source**: (1) In `_updateOverviewMapSize`, use `safeWidth = Math.max(width, 100)` and `safeHeight = Math.max(height, 100)` so the overview always has a non-zero size. (2) After re-adding the control, call `map.render()` if available to force a repaint. (3) In `render()`’s async forEach, after styling and first `_updateOverviewMapSize()`, schedule two more calls at 500 ms and 1500 ms so the overview refreshes after tiles load.
- **Dist**: Same logic in `dicomMicroscopyViewer.min.js` (safe width/height, `map.render()`, and both timeouts).

The app also calls `resize()` at 200, 500, 1000, 2000, 3000 ms, so the overview gets repeated size/refresh updates.

## 6. Source changed() after setLoader (render on first load)

### Why

The map was not rendering on first load; it only updated after zoom/pan. The tile source was updated with the real loader in the async forEach, but the map was not notified to repaint. Zoom triggers a view change and repaint, so the image appeared only then.

### What was patched

- **Source**: In `render()`’s async forEach, after `source.setLoader(loader)`, call `source.changed()` so the source notifies listeners and the map repaints.
- **Dist**: After `source&&source.setLoader(loader)` in the same block, add `if (source) source.changed();`.

The app also nudges the view (setCenter to current center) at 500 ms and 1000 ms after populateViewports so the map gets a change event and repaints on first load.

## Where

1. **Source** (so building the library from source keeps the fix):
   - `node_modules/dicom-microscopy-viewer/src/viewer.js`
   - In `render()`, after `this[_container] = container` add: `this[_map].setTarget(container)`

2. **Dist used by the app** (craco alias points here):
   - `node_modules/dicom-microscopy-viewer/dist/dynamic-import/dicomMicroscopyViewer.min.js`
   - After the line `this[_container] = container;` add: `this[_map].setTarget(container);`

## After `npm install`

Re-applying the patch is only needed if you reinstall and the above files are overwritten. Then:

- In **src/viewer.js**: ensure the two lines are present in `render()`:
  - `this[_container] = container`
  - `this[_map].setTarget(container)`
- In **dist/dynamic-import/dicomMicroscopyViewer.min.js**: insert `this[_map].setTarget(container);` on the line immediately after `this[_container] = container;`.
- **Resize re-fit**: In both `src/viewer.js` and the dist, in the VolumeImageViewer `resize()` method, after `this[_map].updateSize()` add: get view, projection, and size; if `size[0] > 0 && size[1] > 0`, call `view.fit(projection.getExtent(), { size })` before `this[_updateOverviewMapSize]()`.
- **Placeholder loader**: In both `src/viewer.js` and the dist, when creating `DataTileSource` for optical paths (the two places: bandCount 1 and bandCount 3), add `loader: () => Promise.reject(new Error('Tile loader not ready yet'))` so the source always has a callable loader until the real one is set in the async forEach.

Optionally, use [patch-package](https://github.com/ds300/patch-package) to store and re-apply this change automatically after install.
