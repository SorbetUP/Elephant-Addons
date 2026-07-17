const EOCD_SIGNATURE = 0x06054b50
const ZIP64_EOCD_SIGNATURE = 0x06064b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const ZIP64_EXTRA_ID = 0x0001

const MAX_EOCD_SEARCH = 65_557
const MAX_ENTRIES = 50_000
const MAX_JSON_ENTRY_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_JSON_BYTES = 256 * 1024 * 1024

const toSafeNumber = (value, label) => {
  const numeric = typeof value === 'bigint' ? Number(value) : value
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`${label} is too large for this runtime`)
  }
  return numeric
}

const bytesView = (value) => value instanceof Uint8Array
  ? value
  : new Uint8Array(value instanceof ArrayBuffer ? value : value.buffer, value.byteOffset || 0, value.byteLength)

const createReader = (input) => {
  if (input && typeof input.slice === 'function' && typeof input.arrayBuffer === 'function' && Number.isFinite(input.size)) {
    return {
      size: Number(input.size),
      read: async(start, length) => new Uint8Array(await input.slice(start, start + length).arrayBuffer())
    }
  }
  const bytes = bytesView(input)
  return {
    size: bytes.byteLength,
    read: async(start, length) => bytes.slice(start, start + length)
  }
}

const dataView = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const u16 = (view, offset) => view.getUint16(offset, true)
const u32 = (view, offset) => view.getUint32(offset, true)
const u64 = (view, offset) => view.getBigUint64(offset, true)

const findSignatureBackwards = (bytes, signature) => {
  const view = dataView(bytes)
  for (let offset = bytes.byteLength - 4; offset >= 0; offset -= 1) {
    if (u32(view, offset) === signature) return offset
  }
  return -1
}

const decodeName = (bytes, utf8) => {
  try {
    return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252', { fatal: utf8 }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

const normalizeEntryName = (value) => {
  const raw = String(value || '').replaceAll('\\', '/')
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) return ''
  const parts = []
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') return ''
    parts.push(part)
  }
  return parts.join('/')
}

const parseZip64Extra = (extra, fields) => {
  const view = dataView(extra)
  let offset = 0
  while (offset + 4 <= extra.byteLength) {
    const id = u16(view, offset)
    const size = u16(view, offset + 2)
    const bodyStart = offset + 4
    const bodyEnd = bodyStart + size
    if (bodyEnd > extra.byteLength) break
    if (id === ZIP64_EXTRA_ID) {
      let cursor = bodyStart
      const take = () => {
        if (cursor + 8 > bodyEnd) throw new Error('Invalid ZIP64 extra field')
        const value = u64(view, cursor)
        cursor += 8
        return value
      }
      if (fields.uncompressedSize === 0xffffffff) fields.uncompressedSize = take()
      if (fields.compressedSize === 0xffffffff) fields.compressedSize = take()
      if (fields.localHeaderOffset === 0xffffffff) fields.localHeaderOffset = take()
      return fields
    }
    offset = bodyEnd
  }
  return fields
}

const readDirectoryLocation = async(reader) => {
  const tailLength = Math.min(reader.size, MAX_EOCD_SEARCH)
  const tailStart = reader.size - tailLength
  const tail = await reader.read(tailStart, tailLength)
  const eocdOffset = findSignatureBackwards(tail, EOCD_SIGNATURE)
  if (eocdOffset < 0) throw new Error('The selected file is not a valid ZIP archive')
  const eocd = dataView(tail)
  let entryCount = u16(eocd, eocdOffset + 10)
  let directorySize = u32(eocd, eocdOffset + 12)
  let directoryOffset = u32(eocd, eocdOffset + 16)

  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    const locatorAbsolute = tailStart + eocdOffset - 20
    if (locatorAbsolute < 0) throw new Error('Invalid ZIP64 archive locator')
    const locatorBytes = await reader.read(locatorAbsolute, 20)
    const locator = dataView(locatorBytes)
    if (u32(locator, 0) !== ZIP64_LOCATOR_SIGNATURE) throw new Error('ZIP64 locator is missing')
    const zip64Offset = toSafeNumber(u64(locator, 8), 'ZIP64 directory offset')
    const zip64Bytes = await reader.read(zip64Offset, 56)
    const zip64 = dataView(zip64Bytes)
    if (u32(zip64, 0) !== ZIP64_EOCD_SIGNATURE) throw new Error('ZIP64 end record is missing')
    entryCount = toSafeNumber(u64(zip64, 32), 'ZIP entry count')
    directorySize = toSafeNumber(u64(zip64, 40), 'ZIP directory size')
    directoryOffset = toSafeNumber(u64(zip64, 48), 'ZIP directory offset')
  }

  if (entryCount > MAX_ENTRIES) throw new Error(`ZIP archive contains more than ${MAX_ENTRIES} entries`)
  if (directoryOffset + directorySize > reader.size) throw new Error('ZIP central directory is outside the archive')
  return { entryCount, directorySize, directoryOffset }
}

const parseDirectory = (bytes, expectedEntries) => {
  const view = dataView(bytes)
  const entries = []
  let offset = 0
  while (offset + 46 <= bytes.byteLength && entries.length < expectedEntries) {
    if (u32(view, offset) !== CENTRAL_SIGNATURE) throw new Error('Invalid ZIP central directory entry')
    const flags = u16(view, offset + 8)
    const compression = u16(view, offset + 10)
    const nameLength = u16(view, offset + 28)
    const extraLength = u16(view, offset + 30)
    const commentLength = u16(view, offset + 32)
    const recordEnd = offset + 46 + nameLength + extraLength + commentLength
    if (recordEnd > bytes.byteLength) throw new Error('Truncated ZIP central directory')
    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength)
    const extra = bytes.slice(offset + 46 + nameLength, offset + 46 + nameLength + extraLength)
    const fields = parseZip64Extra(extra, {
      compressedSize: u32(view, offset + 20),
      uncompressedSize: u32(view, offset + 24),
      localHeaderOffset: u32(view, offset + 42)
    })
    entries.push({
      name: normalizeEntryName(decodeName(nameBytes, Boolean(flags & 0x0800))),
      flags,
      compression,
      compressedSize: toSafeNumber(fields.compressedSize, 'ZIP compressed size'),
      uncompressedSize: toSafeNumber(fields.uncompressedSize, 'ZIP uncompressed size'),
      localHeaderOffset: toSafeNumber(fields.localHeaderOffset, 'ZIP local header offset')
    })
    offset = recordEnd
  }
  if (entries.length !== expectedEntries) throw new Error('ZIP central directory entry count is inconsistent')
  return entries
}

const inflateRaw = async(bytes, expectedSize) => {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This runtime cannot decompress ZIP archives. Select the extracted Google Keep folder instead.')
  }
  let stream
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  } catch {
    throw new Error('This runtime cannot decompress this ZIP archive. Select the extracted Google Keep folder instead.')
  }
  const result = new Uint8Array(await new Response(stream).arrayBuffer())
  if (result.byteLength !== expectedSize) throw new Error('A ZIP entry did not decompress to its declared size')
  return result
}

const readEntryBytes = async(reader, entry) => {
  if (entry.flags & 0x0001) throw new Error(`Encrypted ZIP entry is unsupported: ${entry.name}`)
  if (![0, 8].includes(entry.compression)) {
    throw new Error(`Unsupported ZIP compression method ${entry.compression}: ${entry.name}`)
  }
  const localBytes = await reader.read(entry.localHeaderOffset, 30)
  const local = dataView(localBytes)
  if (localBytes.byteLength < 30 || u32(local, 0) !== LOCAL_SIGNATURE) {
    throw new Error(`Invalid ZIP local header: ${entry.name}`)
  }
  const nameLength = u16(local, 26)
  const extraLength = u16(local, 28)
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength
  if (dataOffset + entry.compressedSize > reader.size) throw new Error(`Truncated ZIP entry: ${entry.name}`)
  const compressed = await reader.read(dataOffset, entry.compressedSize)
  return entry.compression === 0 ? compressed : inflateRaw(compressed, entry.uncompressedSize)
}

export const listZipEntries = async(input) => {
  const reader = createReader(input)
  const location = await readDirectoryLocation(reader)
  const directory = await reader.read(location.directoryOffset, location.directorySize)
  return parseDirectory(directory, location.entryCount)
}

export const extractZipJsonDocuments = async(input) => {
  const reader = createReader(input)
  const location = await readDirectoryLocation(reader)
  const directory = await reader.read(location.directoryOffset, location.directorySize)
  const entries = parseDirectory(directory, location.entryCount)
    .filter((entry) => entry.name && entry.name.toLowerCase().endsWith('.json'))

  const documents = []
  let totalBytes = 0
  for (const entry of entries) {
    if (entry.uncompressedSize > MAX_JSON_ENTRY_BYTES) {
      documents.push({ name: entry.name, error: `JSON file exceeds ${MAX_JSON_ENTRY_BYTES / 1024 / 1024} MiB` })
      continue
    }
    totalBytes += entry.uncompressedSize
    if (totalBytes > MAX_TOTAL_JSON_BYTES) throw new Error('Google Keep JSON data exceeds the safe import limit')
    try {
      const bytes = await readEntryBytes(reader, entry)
      documents.push({ name: entry.name, content: new TextDecoder('utf-8').decode(bytes) })
    } catch (error) {
      documents.push({ name: entry.name, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return documents
}
