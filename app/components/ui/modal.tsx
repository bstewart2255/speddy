'use client';

import { Fragment } from 'react';
import { Dialog as HeadlessDialog, Transition } from '@headlessui/react';
import { X } from 'lucide-react';

/**
 * Shared accessible modal (SPE-226).
 *
 * Built on Headless UI's `Dialog`, so it comes with a focus trap, focus
 * restoration to the trigger, `role="dialog"` + `aria-modal`, `Esc`-to-close,
 * outside-click-to-close, and body scroll lock — the accessibility the
 * hand-rolled upload dialogs were missing. Extends the previous Modal's simple
 * `isOpen/onClose/title/children` API (kept backward compatible) with size
 * variants, an optional footer slot, and a `dismissable` lock for
 * work-in-flight states.
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional heading; when set, renders the default header and names the dialog for screen readers. */
  title?: string;
  /** Optional sub-heading rendered under the title. */
  description?: string;
  /** Body content. */
  children: React.ReactNode;
  /** Optional footer (e.g. action buttons); rendered in a bordered footer bar. */
  footer?: React.ReactNode;
  /** Panel max width. Defaults to 'lg' to match the previous Modal. */
  size?: ModalSize;
  /**
   * When false, backdrop clicks, the Escape key, and the header close button do
   * not dismiss the modal. Use `dismissable={!isSubmitting}` to lock the modal
   * while an operation is in flight (parity with the upload wizard's
   * backdrop-disabled-while-uploading behavior). Defaults to true.
   */
  dismissable?: boolean;
  /** Classes for the scrollable body wrapper; defaults to standard padding. Pass '' for full-bleed content. */
  bodyClassName?: string;
  /** Element to focus when the modal opens (defaults to the first focusable element). */
  initialFocus?: React.MutableRefObject<HTMLElement | null>;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'lg',
  dismissable = true,
  bodyClassName = 'px-6 py-4',
  initialFocus,
}: ModalProps) {
  // Headless UI routes both Escape and outside-click through a single `onClose`;
  // gate it so a locked (e.g. submitting) modal can't be dismissed.
  const handleClose = () => {
    if (dismissable) onClose();
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <HeadlessDialog
        as="div"
        className="relative z-50"
        onClose={handleClose}
        initialFocus={initialFocus}
      >
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            aria-hidden="true"
          />
        </Transition.Child>

        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <HeadlessDialog.Panel
                className={`relative my-8 flex max-h-[90vh] w-full ${SIZE_CLASS[size]} transform flex-col overflow-hidden rounded-lg bg-white text-left align-middle shadow-xl transition-all`}
              >
                {title && (
                  <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
                    <div className="min-w-0">
                      <HeadlessDialog.Title as="h2" className="text-lg font-semibold text-gray-900">
                        {title}
                      </HeadlessDialog.Title>
                      {description && (
                        <HeadlessDialog.Description className="mt-1 text-sm text-gray-600">
                          {description}
                        </HeadlessDialog.Description>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={!dismissable}
                      aria-label="Close"
                      className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                <div className={`flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>

                {footer && (
                  <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
                    {footer}
                  </div>
                )}
              </HeadlessDialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </HeadlessDialog>
    </Transition.Root>
  );
}

export default Modal;
