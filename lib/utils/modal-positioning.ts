export interface ModalPosition {
  x: number;
  y: number;
}

export interface ModalDimensions {
  width: number;
  height: number;
}

/**
 * Calculates optimal modal position to ensure it stays within viewport boundaries
 * @param triggerRect - DOMRect of the element that triggered the modal
 * @param modalDimensions - Expected width and height of the modal
 * @param offset - Initial offset from trigger element (default: right side with 10px gap)
 * @returns Calculated position that keeps modal within viewport
 */
export function calculateOptimalModalPosition(
  triggerRect: DOMRect,
  modalDimensions: ModalDimensions,
  offset: { x: number; y: number } = { x: 10, y: 0 }
): ModalPosition {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
  };

  const { width: modalWidth, height: modalHeight } = modalDimensions;
  
  // Start with preferred position (right side of trigger)
  let x = triggerRect.right + offset.x;
  let y = triggerRect.top + offset.y;

  // Check horizontal overflow
  if (x + modalWidth > viewport.width) {
    // Try positioning to the left of trigger
    const leftPosition = triggerRect.left - modalWidth - offset.x;
    
    if (leftPosition >= 0) {
      // Left positioning works
      x = leftPosition;
    } else {
      // Neither left nor right works well, clamp to viewport edge
      x = Math.max(10, viewport.width - modalWidth - 10);
    }
  }

  // Check vertical overflow
  if (y + modalHeight > viewport.height) {
    // Try positioning above the trigger
    const abovePosition = triggerRect.top - modalHeight - Math.abs(offset.y);
    
    if (abovePosition >= 0) {
      // Above positioning works
      y = abovePosition;
    } else {
      // Neither above nor below works well, clamp to viewport
      y = Math.max(10, viewport.height - modalHeight - 10);
    }
  }

  // Ensure minimum padding from all edges
  x = Math.max(10, Math.min(x, viewport.width - modalWidth - 10));
  y = Math.max(10, Math.min(y, viewport.height - modalHeight - 10));

  return { x, y };
}

/**
 * Gets the expected dimensions of the SessionAssignmentPopup modal
 * Based on the current CSS classes and content structure
 */
export function getSessionModalDimensions(): ModalDimensions {
  // Based on the current modal structure:
  // - min-w-64 (256px minimum width)
  // - maxWidth: '300px' in style
  // - Height varies based on content but typically around 200px
  return {
    width: 300,
    height: 200
  };
}