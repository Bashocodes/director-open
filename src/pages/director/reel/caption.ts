export function wrapCaptionLines(
  caption: string,
  measure: (text: string) => number,
  maxWidth: number,
  maxLines = 3,
) {
  const words = caption.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!words.length || maxLines <= 0 || maxWidth <= 0) return [];
  const lines: string[] = [];
  const ellipsize = (value: string) => {
    let result = value.trim();
    while (result && measure(`${result}…`) > maxWidth) result = result.slice(0, -1).trimEnd();
    return measure(`${result}…`) <= maxWidth ? `${result}…` : '';
  };
  const fittingPrefixLength = (value: string) => {
    let length = 0;
    while (length < value.length && measure(value.slice(0, length + 1)) <= maxWidth) length += 1;
    return Math.max(1, length);
  };

  for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
    let remaining = words[wordIndex];
    while (remaining) {
      if (!lines.length) lines.push('');
      const lineIndex = lines.length - 1;
      const prefix = lines[lineIndex] ? `${lines[lineIndex]} ` : '';
      if (measure(`${prefix}${remaining}`) <= maxWidth) {
        lines[lineIndex] = `${prefix}${remaining}`;
        remaining = '';
        continue;
      }
      if (lines[lineIndex]) {
        if (lines.length === maxLines) {
          lines[lineIndex] = ellipsize(`${lines[lineIndex]} ${remaining} ${words.slice(wordIndex + 1).join(' ')}`);
          return lines;
        }
        lines.push('');
        continue;
      }
      if (lines.length === maxLines) {
        lines[lineIndex] = ellipsize(`${remaining} ${words.slice(wordIndex + 1).join(' ')}`);
        return lines;
      }
      const take = fittingPrefixLength(remaining);
      lines[lineIndex] = remaining.slice(0, take);
      remaining = remaining.slice(take);
      if (remaining) lines.push('');
    }
  }
  return lines;
}

export function drawReelCaption(
  context: CanvasRenderingContext2D,
  caption: string,
  width: number,
  height: number,
) {
  if (!caption.trim()) return;
  context.save();
  try {
    const fontSize = Math.round(Math.max(22, width * 0.046));
    const side = Math.round(width * 0.08);
    const bottom = Math.round(height * 0.1);
    const lineHeight = Math.round(fontSize * 1.18);
    const gradient = context.createLinearGradient(0, height * 0.62, 0, height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,.72)');
    context.fillStyle = gradient;
    context.fillRect(0, height * 0.58, width, height * 0.42);
    context.font = `600 ${fontSize}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.shadowColor = 'rgba(0,0,0,.8)';
    context.shadowBlur = Math.round(fontSize * 0.35);
    context.fillStyle = '#f4f1eb';
    const lines = wrapCaptionLines(caption.slice(0, 180), (text) => context.measureText(text).width, width - side * 2);
    const firstBaseline = height - bottom - lineHeight * (lines.length - 1);
    lines.forEach((line, index) => context.fillText(line, width / 2, firstBaseline + index * lineHeight));
  } finally {
    context.restore();
  }
}
