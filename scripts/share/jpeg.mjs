/** Width and height from a JPEG start-of-frame marker, without an image library. */
export function jpegSize(buffer) {
  if (buffer.length < 2 || buffer.readUInt16BE(0) !== 0xffd8) return undefined;
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0–SOF15 carry the frame size; C4, C8 and CC are DHT, JPG and DAC segments.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return undefined;
}
