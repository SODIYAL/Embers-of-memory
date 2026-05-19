import './modals.css';

export class DecisionModal {
  private el: HTMLElement | null = null;

  show(scholarName: string, text: string, onDismiss: () => void) {
    if (this.el) return;

    this.el = document.createElement('div');
    this.el.className = 'modal-backdrop';
    this.el.innerHTML = `
      <div class="modal-card event-modal-card">
        <div class="event-modal-scholar">${scholarName}</div>
        <div class="event-modal-text">${text}</div>
        <button class="modal-btn" id="event-modal-ok">Continue</button>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.el);

    this.el.querySelector('#event-modal-ok')!.addEventListener('click', () => {
      this.hide();
      onDismiss();
    });
  }

  confirm(opts: {
    heading: string;
    text: string;
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }) {
    if (this.el) return;
    const cancelLabel = opts.cancelLabel ?? 'Keep working';

    this.el = document.createElement('div');
    this.el.className = 'modal-backdrop';
    this.el.innerHTML = `
      <div class="modal-card event-modal-card">
        <div class="event-modal-scholar">${opts.heading}</div>
        <div class="event-modal-text">${opts.text}</div>
        <div class="modal-btn-row">
          <button class="modal-btn modal-btn-secondary" id="decision-cancel">${cancelLabel}</button>
          <button class="modal-btn" id="decision-confirm">${opts.confirmLabel}</button>
        </div>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.el);

    this.el.querySelector('#decision-confirm')!.addEventListener('click', () => {
      this.hide();
      opts.onConfirm();
    });
    this.el.querySelector('#decision-cancel')!.addEventListener('click', () => {
      this.hide();
      opts.onCancel?.();
    });
  }

  choice<T extends string>(opts: {
    heading: string;
    text: string;
    options: Array<{ label: string; value: T; blurb?: string }>;
    onPick: (value: T) => void;
  }) {
    if (this.el) return;

    this.el = document.createElement('div');
    this.el.className = 'modal-backdrop';
    const buttons = opts.options.map((o, i) => `
      <button class="modal-btn modal-btn-choice" data-idx="${i}">
        <span class="modal-btn-label">${o.label}</span>
        ${o.blurb ? `<span class="modal-btn-blurb">${o.blurb}</span>` : ''}
      </button>
    `).join('');

    this.el.innerHTML = `
      <div class="modal-card event-modal-card">
        <div class="event-modal-scholar">${opts.heading}</div>
        <div class="event-modal-text">${opts.text}</div>
        <div class="modal-btn-column">${buttons}</div>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.el);

    this.el.querySelectorAll<HTMLButtonElement>('.modal-btn-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        this.hide();
        opts.onPick(opts.options[idx].value);
      });
    });
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }

  isOpen() { return this.el !== null; }
}
