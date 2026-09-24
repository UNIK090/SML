// Validation shared by every product-image upload path.
//
// Two endpoints accept an image — the admin uploader (app/api/items/image) and
// the gallery (app/api/items/images) — and both must apply exactly the same
// rules. Keeping them here means a gallery shot cannot be accepted at a size or
// a format the primary image would reject.

/** Uploads are capped so a catalogue row stays small and pages stay fast. */
export const MAX_IMAGE_BYTES = 700 * 1024

/**
 * The most extra photos one item may carry.
 *
 * Chosen for the shop rather than the hard disk: a customer scrolling a product
 * page gives each piece a moment, and eight angles is already more than most
 * will look at. It also keeps one runaway upload loop from filling the table.
 */
export const MAX_GALLERY_IMAGES = 8

/**
 * Confirm the bytes are a browser-displayable image, not a renamed file.
 *
 * The magic-number check is the real gate — `file.type` and the extension are
 * both attacker-controlled — so an executable renamed to .jpg is rejected here
 * and never reaches the database or a customer's browser.
 */
export function detectImage(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

export type PreparedImage = { base64: string; mime: string; byteSize: number }

/**
 * Reads an uploaded file into the shape the database stores, or returns the
 * error message to show the shopkeeper.
 */
export async function prepareImage(file: File): Promise<{ image: PreparedImage } | { error: string }> {
  if (file.size === 0) return { error: 'That image is empty.' }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: `That image is ${Math.round(file.size / 1024)} KB. Please use one under ${MAX_IMAGE_BYTES / 1024} KB.` }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = detectImage(bytes)
  if (!mime) return { error: 'Use a PNG, JPEG, GIF, or WebP image.' }

  return { image: { base64: Buffer.from(bytes).toString('base64'), mime, byteSize: bytes.length } }
}

/**
 * Chooses an image's position on the product page.
 *
 * When a brand-new primary image is uploaded the old one is discarded, so the
 * shop must not lose the photograph a customer was already looking at: the
 * outgoing primary is pushed onto the end of the gallery first. That is what
 * makes "replace the cover photo" behave the way a shopkeeper expects.
 */
export function nextDisplayOrder(existing: number[]): number {
  return existing.length === 0 ? 0 : Math.max(...existing) + 1
}