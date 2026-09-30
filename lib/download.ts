export async function downloadImage(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("下载失败，请重试。");
  saveBlob(await response.blob(), name);
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function downloadZip(images: {url: string; filename: string}[]) {
  const parts: BlobPart[] = [], directory: BlobPart[] = [];
  let offset = 0, directorySize = 0;
  for (const img of images) {
    const response = await fetch(img.url);
    if (!response.ok) throw new Error("图层下载失败，请重试。");
    const data = new Uint8Array(await response.arrayBuffer());
    const name = new TextEncoder().encode(img.filename);
    const crc = crc32(data);
    const header = new Uint8Array(30 + name.length);
    const h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true); header.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46);
    parts.push(header, data); directory.push(central);
    offset += header.length + data.length; directorySize += central.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, images.length, true); e.setUint16(10, images.length, true);
  e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  saveBlob(new Blob([...parts, ...directory, end], {type: "application/zip"}), "ming-design-layers.zip");
}

