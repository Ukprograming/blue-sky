export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

export function screenToWorld(camera, point) {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

export function worldToScreen(camera, point) {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}

export function zoomAt(camera, zoom, point) {
  const anchor = screenToWorld(camera, point);
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  camera.zoom = next;
  camera.x = point.x - anchor.x * next;
  camera.y = point.y - anchor.y * next;
}

export function installNavigation({ surface, canvas, handle, camera, onChange, onSunMove }) {
  const pointers = new Map();
  let gesture = null;
  const isScene = target => target === canvas || target === handle;
  const localPoint = event => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = (a, b) => Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));

  function rebase(mode = 'pan') {
    const points = [...pointers.values()];
    surface.classList.toggle('is-panning', points.length > 0 && mode !== 'sun');
    if (points.length >= 2) {
      gesture = { mode: 'pinch', camera: { ...camera }, midpoint: midpoint(...points), distance: distance(...points) };
    } else if (points.length === 1) {
      gesture = { mode, camera: { ...camera }, start: { ...points[0] } };
    } else gesture = null;
  }

  function cancel() {
    const ids = [...pointers.keys()];
    pointers.clear();
    gesture = null;
    surface.classList.remove('is-panning');
    for (const id of ids) if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
  }

  surface.addEventListener('pointerdown', event => {
    if (!isScene(event.target) || pointers.size >= 2 || event.button !== 0) return;
    event.preventDefault();
    pointers.set(event.pointerId, localPoint(event));
    surface.setPointerCapture(event.pointerId);
    rebase(pointers.size === 1 && event.target === handle ? 'sun' : 'pan');
    if (event.target === handle && event.pointerType !== 'touch') handle.focus({ preventScroll: true });
  });

  surface.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, localPoint(event));
    const points = [...pointers.values()];
    if (gesture.mode === 'pinch') {
      const center = midpoint(...points);
      Object.assign(camera, gesture.camera);
      zoomAt(camera, gesture.camera.zoom * distance(...points) / gesture.distance, gesture.midpoint);
      camera.x += center.x - gesture.midpoint.x;
      camera.y += center.y - gesture.midpoint.y;
      onChange();
    } else if (gesture.mode === 'sun') {
      onSunMove(screenToWorld(camera, points[0]));
    } else {
      camera.x = gesture.camera.x + points[0].x - gesture.start.x;
      camera.y = gesture.camera.y + points[0].y - gesture.start.y;
      onChange();
    }
  });

  surface.addEventListener('pointerup', event => {
    if (!pointers.delete(event.pointerId)) return;
    // After a pinch, a remaining finger pans; it never resumes a stale Sun drag.
    rebase();
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  });
  surface.addEventListener('pointercancel', event => { if (pointers.has(event.pointerId)) cancel(); });
  surface.addEventListener('lostpointercapture', event => { if (pointers.has(event.pointerId)) cancel(); });
  surface.addEventListener('wheel', event => {
    if (!isScene(event.target)) return;
    event.preventDefault();
    cancel();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    zoomAt(camera, camera.zoom * Math.exp(-delta * 0.002), localPoint(event));
    onChange();
  }, { passive: false });
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return { cancel };
}
