import { Button, Col } from 'antd'
import styled from 'styled-components'

interface StyledButtonProps {
  selected?: boolean
}

export const StyledButton = styled(Button)<StyledButtonProps>`
  && {
    min-width: 4rem;
    height: 2rem;
    border-radius: 0.375rem;
    border: none;
    color: #000;
    background-color: transparent;
    transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
  }
  &&:focus,
  &&:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(50, 120, 255, 0.25);
  }
  ${(props) =>
    props.selected
      ? `&&{
             color: rgb(50, 120, 255) !important;
    background: rgba(50, 120, 255, 0.08) !important;
  }`
      : `&&{
          color: rgba(0, 0, 0, 0.54);
  }`}

  &:hover {
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
`

/** Left panel container: overlay on top of slide viewer (right of icon nav), shows Slide Metadata or Overlay Masks */
export const LeftPanelContainer = styled.div<{
  $open: boolean
  $width?: number
}>`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: ${(p) => (p.$open ? `${p.$width ?? 300}px` : '0')};
  height: 100%;
  overflow: hidden;
  background: #fafafa;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.12);
  transition: width 0.2s ease;
  display: flex;
  flex-direction: column;
  z-index: 15;
  pointer-events: ${(p) => (p.$open ? 'auto' : 'none')};
`

/** Inner scrollable area for panel content */
export const LeftPanelContent = styled.div`
  flex: 1;
  overflow: auto;
  padding: 0;
  .ant-menu {
    border-inline-end: none !important;
  }
`

/** Section title in panel (e.g. "Slide Metadata", "Overlay Masks") */
export const PanelSectionTitle = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 12px 16px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: #fff;
`

/** Toolbar bar: same design system (light grey, border, padding) */
export const ToolbarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  min-height: 50px;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  margin: 0 8px;
  z-index: 11;
`

/** Single header bar for slide viewer: three flex partitions (left | center | right) */
export const ViewerHeaderBar = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  gap: 12px;
  background: transparent;
  border-radius: 8px;
 
`

/** Left partition of viewer header (ACTIVE SLIDE) */
export const ViewerHeaderLeft = styled.div`
  flex: 0 0 auto;
  min-width: 0;
`

/** Center partition of viewer header (toolbar) */
export const ViewerHeaderCenter = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  justify-content: center;
  align-items: center;
`

/** Right partition of viewer header (coordinates, actions) */
export const ViewerHeaderRight = styled.div`
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
`

/** Left icon nav container (vertical bar with icons) – sleek vertical strip */
export const LeftNavContainer = styled.div`
  width: 52px;
  min-width: 52px;
  height: 100%;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(248, 249, 250, 0.98) 100%
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10px;
  gap: 4px;
  flex-shrink: 0;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 1px 0 0 rgba(255, 255, 255, 0.8);
  z-index: 15;
`

/** Icon button in left nav – sleek rounded icon button, no harsh focus outline */
export const LeftNavButton = styled(Button)<{ $selected?: boolean }>`
  && {
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 10px;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(0, 0, 0, 0.6);
    transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
    box-shadow: none;
  }
  &&:focus,
  &&:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(50, 120, 255, 0.25);
  }
  ${(p) =>
    p.$selected
      ? `
    && {
      background-color: rgb(50, 120, 255) !important;
      color: #fff !important;
      box-shadow: 0 2px 8px rgba(50, 120, 255, 0.3);
    }
  `
      : `
    &&:hover {
      background-color: rgba(0, 0, 0, 0.06);
      color: rgba(0, 0, 0, 0.88);
    }
  `}
`

export const CloseIconWrp = styled.div`
&&{
  cursor: pointer;
  height :1rem;
  width:1rem;
  span{
    height: 100%;
    width: 100%;
    svg{
    height: 100%;
    width: 100%;
  }
  }
  

}
  
`

export const RightMenu = styled(Col)`
  &&{
    display: flex;
    flex-direction: row;
    position: unset;
    width: max-content;

  }

`

/** Slide Gallery panel: search and list container */
export const SlideGallerySearch = styled.input`
  width: 100%;
  padding: 10px 12px 10px 36px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  font-size: 13px;
  background: #f5f5f5;
  outline: none;
  margin-bottom: 12px;
  &::placeholder {
    color: rgba(0, 0, 0, 0.4);
  }
`

/** Wrapper that groups the selected study card and its "Slides in this study" list as one visual unit */
export const SlideGalleryStudyGroup = styled.div`
  border-radius: 12px;
  border: 1px solid rgba(50, 120, 255, 0.25);
  background: linear-gradient(
    180deg,
    rgba(50, 120, 255, 0.04) 0%,
    rgba(50, 120, 255, 0.01) 100%
  );
  padding: 12px;
  margin-bottom: 12px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  &:hover {
    border-color: rgba(50, 120, 255, 0.4);
    box-shadow: 0 2px 12px rgba(50, 120, 255, 0.08);
  }
`

/** Single slide card in gallery */
export const SlideGalleryCard = styled.div<{ $selected?: boolean }>`
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid
    ${(p) => (p.$selected ? 'rgb(50, 120, 255)' : 'rgba(0, 0, 0, 0.08)')};
  background: #fff;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  &:hover {
    border-color: ${(p) => (p.$selected ? 'rgb(50, 120, 255)' : 'rgba(0, 0, 0, 0.15)')};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
`

/** Circular tick mark for selected slide */
export const SlideGalleryTick = styled.div`
  position: absolute;
  bottom: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgb(50, 120, 255);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
`
