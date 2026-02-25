# Converting SlideViewer to a Functional Component

`SlideViewer.tsx` is a **~4,500-line class component** with 70+ instance methods, many refs and mutable fields, and deep use of `this`. A direct “convert to functional” in one go is high-risk. This doc outlines scope and a safer path.

---

## Why it’s non-trivial

| Aspect | Count / notes |
|--------|----------------|
| **Lines** | ~4,513 |
| **Instance methods** | 70+ (e.g. `loadPresentationStates`, `populateViewports`, `handleAnnotationFindingSelection`, …) |
| **Private / ref-like fields** | `volumeViewer`, `labelViewer`, `roiStyles`, `hoveredRois`, `handlePointerMoveDebounced`, caches, etc. |
| **Lifecycle** | `constructor`, `componentDidMount`, `componentDidUpdate`, `componentWillUnmount` |
| **`this.` usages** | Hundreds (state, props, refs, methods) |

A single large edit would require:

1. Replacing the class with a function and moving all state to `useState` (and possibly `useReducer` for complex updates).
2. Moving ref-like and mutable data to `useRef`.
3. Replacing constructor logic with `useMemo` (e.g. annotation options) and `useEffect` (e.g. create viewers, set initial bounds).
4. Turning `componentDidUpdate` into a `useEffect` with the right dependencies (pathname, slide, clients, …).
5. Turning `componentDidMount` / `componentWillUnmount` into `useEffect(..., [])` with cleanup.
6. Converting every instance method to a `useCallback` (or a normal function) and replacing every `this.` with the right variable (state, setState, props, refs, or another callback).

One mistake in step 6 (wrong ref/state/callback) can cause subtle bugs that are hard to track in a 4.5k-line file.

---

## Recommended approach: incremental refactor

Do the conversion in stages so each step is testable and reviewable.

### Phase 1: Extract without changing behavior

1. **Extract a custom hook, e.g. `useSlideViewerState(props)`**  
   Move all “derived from props” logic (findingOptions, evaluationOptions, geometryTypeOptions, measurements, initial roiStyles) into the hook. Return `{ findingOptions, evaluationOptions, geometryTypeOptions, measurements, roiStyles }`.  
   In the class, use the hook’s return value instead of computing in the constructor. No behavior change; just moving code.

2. **Extract a second hook, e.g. `useSlideViewerViewers(props, state)`**  
   Encapsulate “create/cleanup viewers and sync with pathname/slide/clients”: the logic currently in constructor + `componentDidUpdate` that calls `constructViewers`, cleans up old viewers, and updates state (e.g. bounds, optical paths).  
   The hook can return `{ volumeViewerRef, labelViewerRef, volumeViewportRef, labelViewportRef }` and accept a `setState` (or dispatch) to update viewer-related state. The class keeps `this.volumeViewer` / `this.labelViewer` as refs that the hook sets.  
   Again, goal is to move logic into hooks without changing behavior.

3. **Extract subcomponents**  
   Identify large blocks in `render()` (e.g. toolbar, sidebar, modals) and move them into separate function components that receive `state`, `setState`, and callbacks as props. This shrinks the class’s `render` and makes the eventual conversion of the remaining class smaller.

### Phase 2: Convert the class to a function

4. **Replace the class with a function component**  
   The component becomes a function that:
   - Calls `useSlideViewerState(props)` and `useSlideViewerViewers(props, state, setState)` (or whatever hooks you introduced).
   - Uses `useState` for the rest of the state (or a single `useReducer` if you prefer).
   - Uses `useRef` for any remaining mutable values (hoveredRois, keysDown, debounced handler, caches, etc.).
   - Uses `useEffect` for mount (setup listeners, populateViewports), update (when pathname/slide/clients change), and unmount (cleanup).

5. **Convert methods to callbacks**  
   One by one (or in small groups), turn each instance method into a `useCallback` (or a normal function) that uses `state`, `setState`, `props`, and refs instead of `this.*`. Prefer doing this in small PRs so each batch can be tested.

6. **Replace `render()` with `return`**  
   Remove `render() { return (` and use a single `return (` at the end of the function. Fix any remaining `this.` in JSX to use the variables from the hooks and state/refs.

---

## Alternative: full conversion in one go

If you want a single large conversion:

- Use a **codemod** or script to do a first pass: e.g. `this.state.` → `state.`, `this.setState` → `setState`, `this.props` → `props`, `this.volumeViewer` → `volumeViewerRef.current`, etc. Then fix compilation and add hooks/structure by hand.
- Or do the structural conversion (steps 1–5 above) manually in one branch, with a strong focus on tests and a full regression pass (viewer, annotations, overlays, keyboard, etc.) before merge.

---

## Summary

- **Scope:** SlideViewer is a large class; a full conversion touches ~4.5k lines and 70+ methods.
- **Safer path:** Incremental refactor (hooks + extracted components first), then replace the class with a function and convert methods to callbacks step by step.
- **Faster but riskier:** One-shot conversion with scripted `this.` replacement and manual fix-up; only with good test coverage and QA.

If you want to proceed incrementally, start with Phase 1 (extract `useSlideViewerState` and optionally `useSlideViewerViewers` and one or two subcomponents); that already reduces the size of the class and makes the final conversion to a functional component much more manageable.
