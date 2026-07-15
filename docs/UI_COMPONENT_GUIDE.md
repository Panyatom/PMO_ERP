# PMO ERP UI Component Guide

Use the shared `pmo-*` classes in `styles/components.css` for new features. The goal is consistent UX without introducing a frontend framework.

## Principles

- Use existing design tokens: `--surface`, `--bg`, `--border`, `--text`, `--blue`, `--green`, `--amber`, `--red`, `--r-sm`.
- Keep layouts dense and operational. Avoid marketing-style hero/card-heavy screens for internal tools.
- Prefer `pmo-*` classes over one-off inline styles.
- Keep action labels direct: `Save`, `Cancel`, `Import`, `Export`, `Edit`, `Delete`.
- Use cards for records, modals, drawers, and grouped detail sections. Do not nest cards inside cards.

## Page Layout

```html
<div class="pmo-page">
  <div class="pmo-toolbar">
    <input class="pmo-input pmo-search" placeholder="Search...">
    <button class="pmo-btn">Export</button>
    <button class="pmo-btn pmo-btn-primary">New Item</button>
  </div>

  <section class="pmo-section">
    <div class="pmo-section-head">
      <div>
        <div class="pmo-title">Section title</div>
        <div class="pmo-subtitle">Short operational context</div>
      </div>
    </div>
  </section>
</div>
```

## Buttons

Use:

- `pmo-btn` for secondary commands.
- `pmo-btn pmo-btn-primary` for the primary save/create action.
- `pmo-btn pmo-btn-danger` for destructive actions.
- `pmo-btn pmo-icon-btn` for icon-only buttons with a `title` and `aria-label`.

## Forms

```html
<div class="pmo-form-grid">
  <div class="pmo-field">
    <label>Employee Code</label>
    <input class="pmo-input">
  </div>
  <div class="pmo-field">
    <label>Status</label>
    <select class="pmo-select"></select>
  </div>
</div>
```

## Status And Tags

Use `pmo-pill` for compact metadata:

```html
<span class="pmo-pill pmo-pill-green">Active</span>
<span class="pmo-pill pmo-pill-amber">Pending</span>
<span class="pmo-pill pmo-pill-red">Blocked</span>
```

## Detail Sections

```html
<section class="pmo-section">
  <div class="pmo-section-head">
    <div class="pmo-title">Assignment</div>
  </div>
  <div class="pmo-detail-grid">
    <div class="pmo-detail-field">
      <span>Project</span>
      <strong>AOA-MP</strong>
    </div>
  </div>
</section>
```

## Cards

Use `pmo-card-grid` for repeated cards and `pmo-card` for each record.

```html
<div class="pmo-card-grid">
  <article class="pmo-card">
    <div class="pmo-title">Name</div>
    <div class="pmo-subtitle">Role</div>
  </article>
</div>
```

## Empty State

```html
<div class="pmo-empty">No records match the selected filters.</div>
```

## Migration Guidance

For existing modules, do not refactor everything at once. When touching a feature:

1. Replace new inline button/form/card styles with `pmo-*`.
2. Keep existing module-specific classes only for behavior or truly unique layout.
3. Avoid adding new global classes without the `pmo-` prefix.
4. Add missing shared primitives to `styles/components.css` only when at least two modules need them.
