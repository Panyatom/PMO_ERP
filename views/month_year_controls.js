(function () {
  const MONTHS_EN = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const TARGET_SELECTOR = [
    '#ov-from-sel', '#ov-to-sel',
    '#as-from', '#as-to', '#as-manual-from', '#as-manual-to',
    '.sl-start', '.sl-end',
    '#me-start', '#me-end',
  ].join(',');
  const state = { input: null, viewYear: null };

  function normalizeYear(year) {
    const numeric = Number(year);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    return String(numeric > 2400 ? numeric - 543 : numeric).padStart(4, '0');
  }

  function normalizeMonthValue(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{1,2})/);
    if (!match) return '';
    const year = normalizeYear(match[1]);
    const month = Number(match[2]);
    if (!year || month < 1 || month > 12) return '';
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function monthLabel(value) {
    const normalized = normalizeMonthValue(value);
    if (!normalized) return 'Select month';
    const [year, month] = normalized.split('-').map(Number);
    return `${MONTHS_EN[month - 1]} ${year}`;
  }

  function setNativeValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor.set.call(input, normalizeMonthValue(value));
  }

  function ensurePicker() {
    let picker = document.getElementById('pmo-month-picker');
    if (picker) return picker;
    picker = document.createElement('div');
    picker.id = 'pmo-month-picker';
    picker.className = 'pmo-month-picker';
    picker.setAttribute('role', 'dialog');
    picker.innerHTML = `
      <div class="pmo-month-head">
        <button type="button" class="pmo-month-nav" data-year-nav="-1" aria-label="Previous year">‹</button>
        <div class="pmo-month-year"></div>
        <button type="button" class="pmo-month-nav" data-year-nav="1" aria-label="Next year">›</button>
      </div>
      <div class="pmo-month-grid"></div>
      <div class="pmo-month-actions">
        <button type="button" class="pmo-month-cancel">Cancel</button>
      </div>`;
    document.body.appendChild(picker);
    picker.addEventListener('pointerdown', event => event.stopPropagation());
    picker.addEventListener('click', event => {
      event.stopPropagation();
      const nav = event.target.closest('[data-year-nav]');
      if (nav) {
        state.viewYear += Number(nav.dataset.yearNav || 0);
        renderPicker();
        return;
      }
      const month = event.target.closest('[data-month-value]');
      if (month && state.input) {
        setMonthValue(state.input, month.dataset.monthValue, true);
        closePicker();
        return;
      }
      if (event.target.closest('.pmo-month-cancel')) closePicker();
    });
    return picker;
  }

  function positionPicker(input, picker) {
    const trigger = input.closest('.pmo-month-control')?.querySelector('.pmo-month-trigger') || input;
    const rect = trigger.getBoundingClientRect();
    const width = 286;
    const height = 254;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const below = rect.bottom + 8;
    const above = rect.top - height - 8;
    picker.style.left = `${left}px`;
    picker.style.top = `${below + height < window.innerHeight ? below : Math.max(12, above)}px`;
  }

  function renderPicker() {
    const picker = ensurePicker();
    const selected = normalizeMonthValue(state.input?.value);
    picker.querySelector('.pmo-month-year').textContent = String(state.viewYear || new Date().getFullYear());
    picker.querySelector('.pmo-month-grid').innerHTML = MONTHS_EN.map((name, index) => {
      const value = `${state.viewYear}-${String(index + 1).padStart(2, '0')}`;
      return `<button type="button" class="pmo-month-option ${value === selected ? 'is-selected' : ''}" data-month-value="${value}">${name.slice(0, 3)}</button>`;
    }).join('');
  }

  function openPicker(input) {
    if (!input || input.disabled || input.readOnly) return;
    enhanceMonthInput(input);
    state.input = input;
    state.viewYear = Number(normalizeMonthValue(input.value).slice(0, 4)) || new Date().getFullYear();
    const picker = ensurePicker();
    renderPicker();
    positionPicker(input, picker);
    picker.classList.add('is-open');
  }

  function closePicker() {
    document.getElementById('pmo-month-picker')?.classList.remove('is-open');
    state.input = null;
  }

  function syncDisplay(input) {
    const wrap = input.closest('.pmo-month-control');
    const trigger = wrap?.querySelector('.pmo-month-trigger span');
    if (trigger) trigger.textContent = monthLabel(input.value);
  }

  function setMonthValue(input, value, dispatch = false) {
    setNativeValue(input, value);
    syncDisplay(input);
    if (dispatch) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function patchValueProperty(input) {
    if (input.dataset.pmoMonthValuePatched === 'true') return;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return descriptor.get.call(input); },
      set(next) {
        descriptor.set.call(input, normalizeMonthValue(next));
        syncDisplay(input);
      },
    });
    input.dataset.pmoMonthValuePatched = 'true';
  }

  function enhanceMonthInput(input) {
    if (!input || input.dataset.pmoMonthEnhanced === 'true') {
      if (input) syncDisplay(input);
      return;
    }
    const raw = normalizeMonthValue(input.value);
    input.dataset.pmoMonthEnhanced = 'true';
    input.dataset.pmoMonthRaw = 'true';
    input.type = 'hidden';
    patchValueProperty(input);
    setMonthValue(input, raw, false);
    const wrap = document.createElement('span');
    wrap.className = 'pmo-month-control';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.insertAdjacentHTML('beforeend', '<button type="button" class="pmo-month-trigger"><span></span><b aria-hidden="true">▾</b></button>');
    const trigger = wrap.querySelector('.pmo-month-trigger');
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      openPicker(input);
    });
    syncDisplay(input);
  }

  function enhanceMonthControls(root = document) {
    const scope = root instanceof Element || root instanceof Document ? root : document;
    const controls = scope.matches?.(TARGET_SELECTOR) ? [scope] : [...scope.querySelectorAll(TARGET_SELECTOR)];
    controls.forEach(enhanceMonthInput);
  }

  function ceYear(value) {
    return normalizeYear(value);
  }

  function beYear(value) {
    const year = Number(normalizeYear(value));
    return year ? String(year + 543) : '';
  }

  window.PMO_MONTH_YEAR = {
    enhance: enhanceMonthControls,
    enhanceInput: enhanceMonthInput,
    setValue: setMonthValue,
    normalize: normalizeMonthValue,
    label: monthLabel,
    ceYear,
    beYear,
    months: MONTHS_EN.slice(),
  };

  document.addEventListener('pointerdown', event => {
    const picker = document.getElementById('pmo-month-picker');
    if (!picker?.classList.contains('is-open')) return;
    if (event.target.closest('#pmo-month-picker') || event.target.closest('.pmo-month-control')) return;
    closePicker();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePicker();
    if ((event.key === 'Enter' || event.key === ' ') && event.target?.closest?.('.pmo-month-trigger')) {
      event.preventDefault();
      const input = event.target.closest('.pmo-month-control')?.querySelector('input');
      openPicker(input);
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    enhanceMonthControls(document);
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node instanceof Element) enhanceMonthControls(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  window.addEventListener('resize', () => {
    const picker = document.getElementById('pmo-month-picker');
    if (picker?.classList.contains('is-open') && state.input) positionPicker(state.input, picker);
  });
}());
