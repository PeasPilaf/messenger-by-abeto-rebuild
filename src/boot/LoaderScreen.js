import { LOADER_MARKUP } from './loaderMarkup.js';

const FADE_MS = 500;

export class LoaderScreen {
  constructor() {

    this.placeholder = document.getElementById('loader');
    this.element = null;
    this._hideTimer = null;
  }

  show() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    if (this.element) {
      this.element.classList.remove('is-hiding');
      return;
    }

    const holder = document.createElement('div');
    holder.innerHTML = LOADER_MARKUP;
    const markup = holder.firstElementChild;
    if (this.placeholder) this.placeholder.replaceWith(markup);
    else document.body.appendChild(markup);
    this.element = markup;

    requestAnimationFrame(() => requestAnimationFrame(() => markup.classList.add('is-visible')));
  }

  hide() {
    if (!this.element) return Promise.resolve();
    const element = this.element;
    element.classList.add('is-hiding');
    element.classList.remove('is-visible');
    return new Promise((resolve) => {
      this._hideTimer = setTimeout(() => {
        element.remove();
        if (this.element === element) this.element = null;
        this._hideTimer = null;
        resolve();
      }, FADE_MS);
    });
  }
}
