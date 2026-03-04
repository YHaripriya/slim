import { Button, Space, Tooltip } from 'antd'
import type React from 'react'
import { createContext, useCallback, useContext, useState } from 'react'
import { StyledButton } from '../components/styledElements/styleHelper'

export interface ViewerPanelsState {
  caseDetailsOpen: boolean
  viewerLayersOpen: boolean
  worklistPanelOpen: boolean
}

export interface ViewerPanelsContextValue extends ViewerPanelsState {
  isProvided: boolean
  setCaseDetailsOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setViewerLayersOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setWorklistPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  toggleCaseDetails: () => void
  toggleViewerLayers: () => void
  toggleWorklistPanel: () => void
}

const defaultState: ViewerPanelsState = {
  caseDetailsOpen: true,
  viewerLayersOpen: true,
  worklistPanelOpen: false,
}

const defaultContextValue: ViewerPanelsContextValue = {
  ...defaultState,
  isProvided: false,
  setCaseDetailsOpen: () => {},
  setViewerLayersOpen: () => {},
  setWorklistPanelOpen: () => {},
  toggleCaseDetails: () => {},
  toggleViewerLayers: () => {},
  toggleWorklistPanel: () => {},
}

const ViewerPanelsContext =
  createContext<ViewerPanelsContextValue>(defaultContextValue)

export function ViewerPanelsProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [caseDetailsOpen, setCaseDetailsOpen] = useState(false)
  const [viewerLayersOpen, setViewerLayersOpen] = useState(false)
  const [worklistPanelOpen, setWorklistPanelOpen] = useState(false)

  const toggleCaseDetails = useCallback(() => {
    setViewerLayersOpen(false)
    setWorklistPanelOpen(false)
    setCaseDetailsOpen((prev) => !prev)
  }, [])

  const toggleViewerLayers = useCallback(() => {
    setCaseDetailsOpen(false)
    setWorklistPanelOpen(false)
    setViewerLayersOpen((prev) => !prev)
  }, [])

  const toggleWorklistPanel = useCallback(() => {
    setCaseDetailsOpen(false)
    setViewerLayersOpen(false)
    setWorklistPanelOpen((prev) => !prev)
  }, [])

  const value: ViewerPanelsContextValue = {
    caseDetailsOpen,
    viewerLayersOpen,
    worklistPanelOpen,
    isProvided: true,
    setCaseDetailsOpen,
    setViewerLayersOpen,
    setWorklistPanelOpen,
    toggleCaseDetails,
    toggleViewerLayers,
    toggleWorklistPanel,
  }

  return (
    <ViewerPanelsContext.Provider value={value}>
      {children}
    </ViewerPanelsContext.Provider>
  )
}

export function useViewerPanels(): ViewerPanelsContextValue {
  return useContext(ViewerPanelsContext)
}

/**
 * Toggle buttons for Case details and Layers panels. Renders nothing when
 * used outside ViewerPanelsProvider (e.g. on worklist).
 */
export function ViewerPanelToggles(): React.ReactElement | null {
  const panels = useViewerPanels()
  if (!panels.isProvided) {
    return null
  }
  return (
    <Space size="small">
      <Tooltip
        title={
          panels.caseDetailsOpen ? 'Hide Case details' : 'Show Case details'
        }
      >
        <StyledButton
          selected={panels.caseDetailsOpen ?? false}
          onClick={panels.toggleCaseDetails}
        >
          Slide Metadata
        </StyledButton>
      </Tooltip>
      <Tooltip title={panels.viewerLayersOpen ? 'Hide Layers' : 'Show Layers'}>
        <Button
          type={panels.viewerLayersOpen ? 'primary' : 'default'}
          onClick={panels.toggleViewerLayers}
          style={{
            minWidth: '4rem',
            height: '2rem',
            borderRadius: '0.25rem',
            ...(panels.viewerLayersOpen
              ? {}
              : {
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  borderColor: 'rgba(0,0,0,0.15)',
                  color: 'rgba(0,0,0,0.88)',
                }),
          }}
        >
          Overlay Masks
        </Button>
      </Tooltip>
    </Space>
  )
}

export default ViewerPanelsContext
