import { Layout, Menu, Spin } from 'antd'
// skipcq: JS-C1003
import * as dcmjs from 'dcmjs'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'

import type { AnnotationSettings } from '../AppConfig'
import type { User } from '../auth'
import { useViewerPanels } from '../contexts/ViewerPanelsContext'
import type DicomWebManager from '../DicomWebManager'
import type { Slide } from '../data/slides'
import { StorageClasses } from '../data/uids'
import { useSlides } from '../hooks/useSlides'
import { type RouteComponentProps, withRouter } from '../utils/router'
import ClinicalTrial from './ClinicalTrial'
import Patient from './Patient'
import SlideList from './SlideList'
import SlideViewer from './SlideViewer'
import Study from './Study'

const { naturalizeDataset } = dcmjs.data.DicomMetaDictionary

interface NaturalizedInstance {
  SeriesInstanceUID: string
  SOPInstanceUID: string
  FrameOfReferenceUID?: string
  ContainerIdentifier?: string
  ReferencedSeriesSequence?: Array<{
    SeriesInstanceUID: string
  }>
  ContentSequence?: Array<{
    ConceptNameCodeSequence: Array<{
      CodeValue: string
    }>
    ContentSequence?: Array<{
      ContentSequence: Array<{
        ReferencedSOPSequence: Array<{
          ReferencedSOPInstanceUID: string
        }>
      }>
    }>
  }>
}

const findSeriesSlide = (
  slides: Slide[],
  seriesInstanceUID: string,
): Slide | undefined =>
  slides.find((slide: Slide) =>
    slide.seriesInstanceUIDs.some((uid: string) => uid === seriesInstanceUID),
  )

/** Loading placeholder when slides are not yet available (avoids redirect loop). */
function ViewerLoadingContent(): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
      }}
    >
      <Spin size="large" tip="Loading slides…" />
    </div>
  )
}

/** Redirects from study-only URL to first series so the slide viewer is shown. */
function RedirectToFirstSeries({
  slides,
  pathname,
}: {
  slides: Slide[]
  pathname: string
}): JSX.Element {
  if (slides.length === 0) {
    return <ViewerLoadingContent />
  }
  const firstSlide = slides[0]
  const firstSeriesUID = firstSlide?.seriesInstanceUIDs?.[0] ?? ''
  if (!firstSeriesUID) {
    return <ViewerLoadingContent />
  }
  const to = `${pathname}/series/${firstSeriesUID}`
  return <Navigate to={to} replace />
}

function ParametrizedSlideViewer({
  clients,
  slides,
  user,
  app,
  preload,
  enableAnnotationTools,
  annotations,
  onSeriesSelection,
  slideMetadataContent,
}: {
  clients: { [key: string]: DicomWebManager }
  slides: Slide[]
  user?: User
  app: {
    name: string
    version: string
    uid: string
    organization?: string
  }
  preload: boolean
  enableAnnotationTools: boolean
  annotations: AnnotationSettings[]
  onSeriesSelection?: (seriesInstanceUID: string) => void
  slideMetadataContent?: ReactNode
}): JSX.Element | null {
  const { studyInstanceUID = '', seriesInstanceUID = '' } = useParams<{
    studyInstanceUID: string
    seriesInstanceUID: string
  }>()
  const location = useLocation()

  const [selectedSlide, setSelectedSlide] = useState(
    findSeriesSlide(slides, seriesInstanceUID),
  )
  const [derivedDataset, setDerivedDataset] =
    useState<NaturalizedInstance | null>(null)

  useEffect(() => {
    const currentSlideMatchesSeries =
      selectedSlide?.seriesInstanceUIDs.some(
        (uid: string) => uid === seriesInstanceUID,
      ) ?? false

    if (
      selectedSlide === null ||
      selectedSlide === undefined ||
      !currentSlideMatchesSeries
    ) {
      const imageSlide = findSeriesSlide(slides, seriesInstanceUID)
      if (imageSlide !== null && imageSlide !== undefined) {
        setSelectedSlide(imageSlide)
        setDerivedDataset(null)
        return
      }

      const findReferencedSlide = async (): Promise<void> => {
        const client = clients[StorageClasses.VL_WHOLE_SLIDE_MICROSCOPY_IMAGE]
        const derivedSeriesMetadata = await client.retrieveSeriesMetadata({
          studyInstanceUID,
          seriesInstanceUID,
        })
        const naturalizedDerivedMetadata = naturalizeDataset(
          derivedSeriesMetadata[0],
        ) as NaturalizedInstance
        if (
          naturalizedDerivedMetadata.ReferencedSeriesSequence != null &&
          naturalizedDerivedMetadata.ReferencedSeriesSequence.length > 0
        ) {
          for (const referencedSeries of naturalizedDerivedMetadata.ReferencedSeriesSequence) {
            const referencedImageSeriesUID = referencedSeries.SeriesInstanceUID
            const referencedSlide = slides.find((slide: Slide) => {
              return slide.seriesInstanceUIDs.some(
                (uid: string) => uid === referencedImageSeriesUID,
              )
            })
            if (referencedSlide !== null && referencedSlide !== undefined) {
              setSelectedSlide(referencedSlide)
              setDerivedDataset(naturalizedDerivedMetadata)
              return
            }
          }
        }
        const IMAGE_LIBRARY_CONCEPT_NAME_CODE = '111028'
        const imageLibrary = naturalizedDerivedMetadata.ContentSequence?.find(
          (contentItem) =>
            contentItem.ConceptNameCodeSequence[0].CodeValue ===
            IMAGE_LIBRARY_CONCEPT_NAME_CODE,
        )
        if (
          imageLibrary?.ContentSequence?.[0]?.ContentSequence?.[0]
            ?.ReferencedSOPSequence?.[0] !== undefined &&
          imageLibrary?.ContentSequence?.[0]?.ContentSequence?.[0]
            ?.ReferencedSOPSequence?.[0] !== null
        ) {
          const referencedSOPInstanceUID =
            imageLibrary.ContentSequence[0].ContentSequence[0]
              .ReferencedSOPSequence[0].ReferencedSOPInstanceUID
          const referencedSlide = slides.find((slide: Slide) => {
            return slide.volumeImages.find(
              (image: { SOPInstanceUID: string }) => {
                return image.SOPInstanceUID === referencedSOPInstanceUID
              },
            )
          })
          setSelectedSlide(referencedSlide)
          setDerivedDataset(naturalizedDerivedMetadata)
        }
      }

      void findReferencedSlide()
    }
  }, [slides, clients, studyInstanceUID, seriesInstanceUID, selectedSlide])

  const searchParams = new URLSearchParams(location.search)
  let presentationStateUID: string | undefined
  if (!searchParams.has('access_token')) {
    const stateParam = searchParams.get('state')
    presentationStateUID = stateParam !== null ? stateParam : undefined
  }

  const currentSlideIndex0 =
    selectedSlide != null
      ? slides.findIndex((s) =>
          s.seriesInstanceUIDs.includes(seriesInstanceUID),
        )
      : -1
  const slideIndex = currentSlideIndex0 >= 0 ? currentSlideIndex0 + 1 : 0
  const totalSlides = slides.length
  const onPrevSlide =
    onSeriesSelection != null && currentSlideIndex0 > 0
      ? () => {
          const prev = slides[currentSlideIndex0 - 1]
          if (prev?.seriesInstanceUIDs?.[0] != null) {
            onSeriesSelection(prev.seriesInstanceUIDs[0])
          }
        }
      : undefined
  const onNextSlide =
    onSeriesSelection != null &&
    currentSlideIndex0 >= 0 &&
    currentSlideIndex0 < slides.length - 1
      ? () => {
          const next = slides[currentSlideIndex0 + 1]
          if (next?.seriesInstanceUIDs?.[0] != null) {
            onSeriesSelection(next.seriesInstanceUIDs[0])
          }
        }
      : undefined

  let viewer: ReactNode = null
  if (selectedSlide != null && selectedSlide !== undefined) {
    viewer = (
      <SlideViewer
        clients={clients}
        studyInstanceUID={studyInstanceUID}
        seriesInstanceUID={seriesInstanceUID}
        selectedPresentationStateUID={presentationStateUID}
        slide={selectedSlide}
        preload={preload}
        annotations={annotations}
        enableAnnotationTools={enableAnnotationTools}
        app={app}
        user={user}
        derivedDataset={derivedDataset ?? undefined}
        slideIndex={slideIndex}
        totalSlides={totalSlides}
        onPrevSlide={onPrevSlide}
        onNextSlide={onNextSlide}
        slideMetadataContent={slideMetadataContent}
      />
    )
  }
  if (viewer != null) return viewer
  if (slides.length === 0) return <ViewerLoadingContent />
  // Have slides but no selectedSlide yet (resolving series or no match) – show spinner instead of blank
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
      }}
    >
      <Spin size="large" tip="Preparing viewer…" />
    </div>
  )
}

interface ViewerProps extends RouteComponentProps {
  clients: { [key: string]: DicomWebManager }
  studyInstanceUID: string
  app: {
    name: string
    version: string
    uid: string
    organization?: string
  }
  annotations: AnnotationSettings[]
  enableAnnotationTools: boolean
  preload: boolean
  user?: User
}

function Viewer(props: ViewerProps): JSX.Element | null {
  const { clients, studyInstanceUID, location, navigate } = props
  const { slides } = useSlides({ clients, studyInstanceUID })
  const panels = useViewerPanels()
  const caseDetailsOpen = panels.isProvided ? panels.caseDetailsOpen : true

  const handleSeriesSelection = ({
    seriesInstanceUID,
  }: {
    seriesInstanceUID: string
  }): void => {
    console.info(`switch to series "${seriesInstanceUID}"`)
    let urlPath = `/studies/${studyInstanceUID}/series/${seriesInstanceUID}`

    if (location.pathname.includes('/projects/')) {
      urlPath = location.pathname
      if (!location.pathname.includes('/series/')) {
        urlPath += `/series/${seriesInstanceUID}`
      } else {
        urlPath = urlPath.replace(
          /\/series\/[^/]+/,
          `/series/${seriesInstanceUID}`,
        )
      }
    }

    if (
      location.pathname.includes('/series/') &&
      location.search !== null &&
      location.search !== undefined
    ) {
      urlPath += location.search
    }

    navigate(urlPath, { replace: true })
  }

  const firstSlide = slides[0]
  const volumeInstances = firstSlide?.volumeImages ?? []
  const refImage = volumeInstances.length > 0 ? volumeInstances[0] : undefined

  /* If a series is encoded in the path, route the viewer to this series.
   * Otherwise select the first series correspondent to
   * the first slide contained in the study.
   */
  let selectedSeriesInstanceUID: string = ''
  if (refImage != null && location.pathname.includes('series/')) {
    const seriesFragment = location.pathname.split('series/')[1]
    selectedSeriesInstanceUID = seriesFragment?.includes('/')
      ? seriesFragment.split('/')[0]
      : (seriesFragment ?? '')
  } else if (refImage != null) {
    selectedSeriesInstanceUID = volumeInstances[0].SeriesInstanceUID
  }

  let clinicalTrialMenu: ReactNode = null
  if (refImage?.ClinicalTrialSponsorName != null) {
    clinicalTrialMenu = (
      <Menu.SubMenu key="clinical-trial" title="Clinical Trial">
        <ClinicalTrial metadata={refImage} />
      </Menu.SubMenu>
    )
  }

  const slideMetadataContent: ReactNode =
    refImage != null ? (
      <Menu
        mode="inline"
        defaultOpenKeys={['patient', 'study', 'clinical-trial', 'slides']}
        style={{ height: '100%', borderRight: 'none' }}
        inlineIndent={14}
      >
        <Menu.SubMenu key="patient" title="Patient">
          <Patient metadata={refImage} />
        </Menu.SubMenu>
        <Menu.SubMenu key="study" title="Study">
          <Study metadata={refImage} />
        </Menu.SubMenu>
        {clinicalTrialMenu}
        <Menu.SubMenu key="slides" title="Slides">
          <SlideList
            clients={props.clients}
            metadata={slides}
            selectedSeriesInstanceUID={selectedSeriesInstanceUID}
            onSeriesSelection={handleSeriesSelection}
          />
        </Menu.SubMenu>
      </Menu>
    ) : null

  const isOnSeriesRoute = location.pathname.includes('series/')

  return (
    <Layout
      style={{
        height: '100%',
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'row',
      }}
      hasSider
    >
      {!isOnSeriesRoute && (
        <Layout.Sider
          width={caseDetailsOpen ? 300 : 0}
          style={{
            height: '100%',
            borderRight: 'solid',
            borderRightWidth: caseDetailsOpen ? 0.25 : 0,
            overflow: 'hidden',
            background: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            transition: 'width 0.2s ease',
            zIndex: 1,
          }}
        >
          {caseDetailsOpen && refImage != null && (
            <Menu
              mode="inline"
              defaultOpenKeys={['patient', 'study', 'clinical-trial', 'slides']}
              style={{ height: '100%' }}
              inlineIndent={14}
            >
              <Menu.SubMenu key="patient" title="Patient">
                <Patient metadata={refImage} />
              </Menu.SubMenu>
              <Menu.SubMenu key="study" title="Study">
                <Study metadata={refImage} />
              </Menu.SubMenu>
              {clinicalTrialMenu}
              <Menu.SubMenu key="slides" title="Slides">
                <SlideList
                  clients={props.clients}
                  metadata={slides}
                  selectedSeriesInstanceUID={selectedSeriesInstanceUID}
                  onSeriesSelection={handleSeriesSelection}
                />
              </Menu.SubMenu>
            </Menu>
          )}
        </Layout.Sider>
      )}

      {/* Wrapper gives the slide viewer a defined size; without it height:100% collapses to 0 */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          marginLeft: !isOnSeriesRoute && caseDetailsOpen ? 300 : 0,
          transition: 'margin-left 0.2s ease',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Routes>
          <Route
            path="series/:seriesInstanceUID"
            element={
              <ParametrizedSlideViewer
                clients={props.clients}
                slides={slides}
                preload={props.preload}
                annotations={props.annotations}
                enableAnnotationTools={props.enableAnnotationTools}
                app={props.app}
                user={props.user}
                onSeriesSelection={(uid) =>
                  handleSeriesSelection({ seriesInstanceUID: uid })
                }
                slideMetadataContent={slideMetadataContent}
              />
            }
          />
          <Route
            index
            element={
              <RedirectToFirstSeries
                slides={slides}
                pathname={location.pathname}
              />
            }
          />
        </Routes>
      </div>
    </Layout>
  )
}

export default withRouter(Viewer)
