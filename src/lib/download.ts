/**
 * How long an object URL stays alive after the click that hands it over.
 *
 * The browser fetches a `blob:` URL asynchronously *after* the click returns,
 * so revoking on the next line can cancel the download it was meant to start.
 * A generous window costs one blob in memory for a moment; getting it wrong
 * costs the user the backup they thought they saved. 40 s is the delay
 * FileSaver.js settled on after years of this exact bug.
 */
const REVOKE_DELAY_MS = 40_000

/**
 * Save a Blob to the user's device under `filename`.
 *
 * The anchor is attached to the document before it is clicked: Firefox
 * ignores a synthetic click on a detached node, which downloads nothing at
 * all rather than failing loudly.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()

  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, REVOKE_DELAY_MS)
}
