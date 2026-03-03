# DICOMweb QIDO-RS Queries in Slide Viewer

The slide viewer uses the **DICOMweb QIDO-RS** API to search for **series** or **instances** in a study, often filtered by **Modality**. The base URL is your archive’s QIDO-RS endpoint (e.g. `http://localhost:8008/dcm4chee-arc/aets/DCM4CHEE/rs`).

## URL patterns

| Pattern | Meaning |
|--------|---------|
| `.../studies/{studyUID}/**instances**?Modality=X` | Search for **instances** in the study with the given Modality. |
| `.../studies/{studyUID}/**series**?Modality=X`      | Search for **series** in the study with the given Modality. |

- **204 No Content** = the server found no matching series/instances. That is a normal, successful response (no error).
- **200** with a JSON array = one or more matches.

---

## Where each query is called

All of these are triggered from **`SlideViewer.tsx`** after the volume viewer is created and viewports are populated (from `populateViewports` → `loadPresentationStates` and `addAnnotations` / `addAnnotationGroups` / `addSegmentations` / `addParametricMaps`).

### 1. `instances?Modality=PR` (Presentation State)

- **Purpose:** Find **Presentation State** instances (blending, window/level, etc.) that can be applied to the current series.
- **Called from:** `loadPresentationStates()` (around line 426).
- **Client:** `props.clients[StorageClasses.ADVANCED_BLENDING_PRESENTATION_STATE]`.
- **API:** `client.searchForInstances({ studyInstanceUID, queryParams: { Modality: 'PR' } })`.
- **URL:** `.../studies/{studyInstanceUID}/instances?Modality=PR`
- **Typical when empty:** Many studies have no PR objects → **204 No Content** is normal.

---

### 2. `instances?Modality=SR` (Structured Report)

- **Purpose:** Find **Structured Report** instances (e.g. TID 1500 measurement reports) that reference the slide and can be shown as annotations/ROIs.
- **Called from:** `addAnnotations()` (around line 853).
- **Client:** `props.clients[StorageClasses.COMPREHENSIVE_3D_SR]`.
- **API:** `client.searchForInstances({ studyInstanceUID, queryParams: { Modality: 'SR' } })`.
- **URL:** `.../studies/{studyInstanceUID}/instances?Modality=SR`
- **Typical when empty:** No SR documents in the study → **204 No Content** is normal.

---

### 3. `series?Modality=ANN` (Annotation groups)

- **Purpose:** Find **series** whose Modality is **ANN** (used for **Microscopy Bulk Simple Annotations** – annotation groups overlays).
- **Called from:** `addAnnotationGroups()` (around line 1010).
- **Client:** `props.clients[StorageClasses.MICROSCOPY_BULK_SIMPLE_ANNOTATION]`.
- **API:** `client.searchForSeries({ studyInstanceUID, queryParams: { Modality: 'ANN' } })`.
- **URL:** `.../studies/{studyInstanceUID}/series?Modality=ANN`
- **Typical when empty:** No annotation-group series → **204 No Content** is normal.

---

### 4. `series?Modality=SEG` (Segmentation)

- **Purpose:** Find **Segmentation** series (segmentations overlays for the slide).
- **Called from:** `addSegmentations()` (around line 1133).
- **Client:** `props.clients[StorageClasses.SEGMENTATION]`.
- **API:** `client.searchForSeries({ studyInstanceUID, queryParams: { Modality: 'SEG' } })`.
- **URL:** `.../studies/{studyInstanceUID}/series?Modality=SEG`
- **Typical when empty:** No segmentation series → **204 No Content** is normal.

---

### 5. `series?Modality=OT` (Parametric maps)

- **Purpose:** Find **Parametric Map** series (Modality **OT** = “Other” in DICOM; used for parametric maps).
- **Called from:** `addParametricMaps()` (around line 1233).
- **Client:** `props.clients[StorageClasses.PARAMETRIC_MAP]`.
- **API:** `client.searchForSeries({ studyInstanceUID, queryParams: { Modality: 'OT' } })`.
- **URL:** `.../studies/{studyInstanceUID}/series?Modality=OT`
- **Typical when empty:** No parametric map series → **204 No Content** is normal.

---

## Summary

| Modality | Resource   | SlideViewer function     | What it’s for                         |
|----------|------------|---------------------------|----------------------------------------|
| **PR**   | instances  | `loadPresentationStates` | Presentation states (blending, etc.)  |
| **SR**   | instances  | `addAnnotations`         | Structured reports (e.g. measurements) |
| **ANN**  | series     | `addAnnotationGroups`    | Microscopy bulk simple annotations    |
| **SEG**  | series     | `addSegmentations`       | Segmentation overlays                 |
| **OT**   | series     | `addParametricMaps`      | Parametric map overlays               |

All of these are **optional** overlays/supplements. The main slide image is loaded by the **dicom-microscopy-viewer** from the **slide’s volume images** (Whole Slide Microscopy, Modality **SM**), not from these queries. Getting **204 No Content** on PR, SR, ANN, SEG, or OT only means “no extra data of that type” and does not block the slide from displaying.
