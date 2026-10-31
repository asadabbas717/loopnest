function bounds(node) {
  const match = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) throw new Error('Native view bounds unavailable.');
  const [left, top, right, bottom] = match.slice(1).map(Number);
  if (right <= left || bottom <= top) throw new Error('Native view bounds are empty.');
  return { left, top, right, bottom };
}
function node(xml, id) {
  return xml.match(new RegExp(`<node\\b[^>]*resource-id="(?:[^"\\s]*:id/)?${id}"[^>]*>`))?.[0];
}
export function checkAndroidSafeArea(xml, displays) {
  const page = bounds(node(xml, 'safe-page-content'));
  const bars = [
    ...displays.matchAll(
      /mType=navigationBars\b[^\n]*?mFrame=\[(\d+),(\d+)\]\[(\d+),(\d+)\][^\n]*?mVisible=(true|false)/g,
    ),
  ]
    .filter((match) => match[5] === 'true')
    .map((match) => ({ left: +match[1], top: +match[2], right: +match[3], bottom: +match[4] }))
    .filter((rect) => rect.bottom > rect.top && rect.right > rect.left && rect.top >= page.top);
  if (!bars.length) throw new Error('Visible native navigation-bar bounds unavailable.');
  const navigationTop = Math.min(...bars.map((rect) => rect.top));
  if (page.bottom > navigationTop) throw new Error('Page content overlaps Android navigation.');
  const dockNode = node(xml, 'bottom-navigation');
  if (dockNode) {
    const dock = bounds(dockNode);
    if (
      dock.bottom > page.bottom ||
      dock.top < page.top ||
      dock.left < page.left ||
      dock.right > page.right
    )
      throw new Error('Bottom dock extends beyond the safe content container.');
  }
  return { pageBottom: page.bottom, navigationTop, dockPresent: !!dockNode };
}
