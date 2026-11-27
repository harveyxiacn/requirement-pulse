#!/usr/bin/env node
/**
 * Produces the Windows .ico, the 1024px PNG used by BrowserWindow, and a
 * 180px preview from build/icon.svg. The ICO embeds PNG frames, which Windows
 * Vista and later support for all sizes.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
const svg = await readFile(path.join(buildDir, 'icon.svg'))

async function renderPng(size) {
  return sharp(svg, { density: Math.max(72, Math.ceil((size / 1024) * 72 * 2)) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
const frames = await Promise.all(sizes.map(renderPng))

// ICO header: reserved(0) | type(1 = icon) | image count
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)

const directory = Buffer.alloc(16 * frames.length)
let offset = header.length + directory.length
frames.forEach((frame, index) => {
  const size = sizes[index]
  const entry = index * 16
  directory.writeUInt8(size >= 256 ? 0 : size, entry) // width (0 means 256)
  directory.writeUInt8(size >= 256 ? 0 : size, entry + 1) // height
  directory.writeUInt8(0, entry + 2) // palette count
  directory.writeUInt8(0, entry + 3) // reserved
  directory.writeUInt16LE(1, entry + 4) // color planes
  directory.writeUInt16LE(32, entry + 6) // bits per pixel
  directory.writeUInt32LE(frame.length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  offset += frame.length
})

await writeFile(path.join(buildDir, 'icon.ico'), Buffer.concat([header, directory, ...frames]))
await writeFile(path.join(buildDir, 'icon.png'), await renderPng(1024))
await writeFile(path.join(buildDir, 'icon-180.png'), await renderPng(180))

console.log(`[build-icons] wrote build/icon.ico (${sizes.join(', ')}px), icon.png, icon-180.png`)
