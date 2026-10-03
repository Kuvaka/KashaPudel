// Touch: floating joystick (anywhere outside the dash button) + hold-to-dash button.
// Desktop: mouse steers from screen center, or WASD/arrows; Shift/Space dashes.
const STICK_R = 60; // CSS px

export class Input {
  constructor(el, dashBtn) {
    this.stick = null;          // { id, ox, oy, x, y } in CSS px
    this.mouse = null;          // { x, y } when a mouse hovers the canvas
    this.keys = new Set();
    this.dashTouch = false;
    this.enabled = false;

    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') return;
      if (this.stick) return;
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.mouse = { x: e.clientX, y: e.clientY }; return; }
      if (this.stick && e.pointerId === this.stick.id) { this.stick.x = e.clientX; this.stick.y = e.clientY; }
    });
    const end = (e) => { if (this.stick && e.pointerId === this.stick.id) this.stick = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.mouse = null; });
    el.addEventListener('mousedown', () => { this.mouseDash = true; });
    window.addEventListener('mouseup', () => { this.mouseDash = false; });

    const press = (e) => { e.preventDefault(); this.dashTouch = true; dashBtn.classList.add('active'); };
    const release = () => { this.dashTouch = false; dashBtn.classList.remove('active'); };
    dashBtn.addEventListener('pointerdown', press);
    dashBtn.addEventListener('pointerup', release);
    dashBtn.addEventListener('pointercancel', release);
    dashBtn.addEventListener('pointerleave', release);

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.stick = null; release(); });
  }

  // Returns { dirX, dirY, mag, dash } for the player.
  read(viewW, viewH) {
    let x = 0, y = 0, mag = 0;
    if (this.stick) {
      const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > 6) { x = dx / len; y = dy / len; mag = Math.min(1, len / STICK_R); }
    } else {
      const k = this.keys;
      const kx = (k.has('KeyD') || k.has('ArrowRight')) - (k.has('KeyA') || k.has('ArrowLeft'));
      const ky = (k.has('KeyS') || k.has('ArrowDown')) - (k.has('KeyW') || k.has('ArrowUp'));
      if (kx || ky) {
        const len = Math.hypot(kx, ky); x = kx / len; y = ky / len; mag = 1;
      } else if (this.mouse) {
        const dx = this.mouse.x - viewW / 2, dy = this.mouse.y - viewH / 2;
        const len = Math.hypot(dx, dy);
        if (len > 10) { x = dx / len; y = dy / len; mag = Math.min(1, len / 120); }
      }
    }
    const dash = this.dashTouch || !!this.mouseDash || this.keys.has('Space') ||
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    return { dirX: x, dirY: y, mag, dash };
  }

  stickVisual() {
    if (!this.stick) return null;
    const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
    const len = Math.hypot(dx, dy), k = len > STICK_R ? STICK_R / len : 1;
    return { ox: this.stick.ox, oy: this.stick.oy, kx: this.stick.ox + dx * k, ky: this.stick.oy + dy * k, r: STICK_R };
  }
}
