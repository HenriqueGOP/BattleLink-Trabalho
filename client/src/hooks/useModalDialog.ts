import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/** Diálogo nativo mantém o fundo inerte; o escopo garante Tab e retorno ao controle de abertura. */
export function useModalDialog(
  ref: RefObject<HTMLDialogElement | null>,
  open: boolean,
  returnFocusRef?: RefObject<HTMLElement | null>
) {
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const previousFocus =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return
      const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.getClientRects().length > 0 && !element.closest('[inert]')
      )
      if (!controls.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const current = controls.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey
        ? current <= 0
          ? controls.length - 1
          : current - 1
        : current < 0 || current === controls.length - 1
          ? 0
          : current + 1
      event.preventDefault()
      controls[next].focus({ preventScroll: true })
    }
    dialog.addEventListener('keydown', onKey)
    if (!dialog.open) dialog.showModal()
    return () => {
      dialog.removeEventListener('keydown', onKey)
      if (dialog.open) dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [open, ref, returnFocusRef])
}
