import type React from 'react'
import { createContext, useCallback, useContext, useState } from 'react'

export interface ViewerToolbarContextValue {
  toolbar: React.ReactNode
  setToolbar: (node: React.ReactNode) => void
}

const defaultContextValue: ViewerToolbarContextValue = {
  toolbar: null,
  setToolbar: () => {},
}

const ViewerToolbarContext =
  createContext<ViewerToolbarContextValue>(defaultContextValue)

export function ViewerToolbarProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [toolbar, setToolbarState] = useState<React.ReactNode>(null)
  const setToolbar = useCallback((node: React.ReactNode) => {
    setToolbarState(node)
  }, [])

  const value: ViewerToolbarContextValue = {
    toolbar,
    setToolbar,
  }

  return (
    <ViewerToolbarContext.Provider value={value}>
      {children}
    </ViewerToolbarContext.Provider>
  )
}

export function useViewerToolbar(): ViewerToolbarContextValue {
  return useContext(ViewerToolbarContext)
}

export default ViewerToolbarContext
