/**
 * UI UTILITY MODULE (js/utils/uiUtils.js)
 * Provides centralized toast alerts, accessible modal helpers, and data formatting.
 */

/**
 * Display a modern, non-blocking toast notification.
 * @param {string} title - Brief headline (e.g., 'Success', 'Error')
 * @param {string} message - User-friendly explanatory message
 * @param {'success'|'error'|'warning'|'info'} type - Toast theme
 * @param {number} duration - Milliseconds before auto-dismiss
 */
export function showToast(title, message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || 'ℹ'}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close notification">&times;</button>
  `;

  container.appendChild(toast);

  // Trigger smooth enter animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const dismiss = () => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    }, { once: true });
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

/**
 * Open a modal by DOM element ID.
 * @param {string} modalId
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

/**
 * Close a modal by DOM element ID.
 * @param {string} modalId
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

/**
 * Open a generic confirmation modal (e.g., for customer record deletion).
 * @param {Object} options
 * @param {string} options.title - Header title
 * @param {string} options.message - Confirmation prompt
 * @param {string} [options.confirmText='Confirm'] - Label for action button
 * @param {string} [options.confirmClass='btn-danger'] - Button styling class
 * @param {Function} options.onConfirm - Async callback when user approves
 */
export function showConfirmModal({ title, message, confirmText = 'Confirm', confirmClass = 'btn-danger', onConfirm }) {
  let modal = document.getElementById('global-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'global-confirm-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 480px;">
        <div class="modal-header">
          <h3 class="modal-title" id="confirm-modal-title">Confirm Action</h3>
          <button class="modal-close-btn" id="confirm-modal-x">&times;</button>
        </div>
        <div class="modal-body">
          <p id="confirm-modal-msg" style="color: var(--color-text-main); font-size: var(--font-size-base);"></p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="confirm-modal-cancel">Cancel</button>
          <button type="button" class="btn" id="confirm-modal-proceed">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const titleEl = modal.querySelector('#confirm-modal-title');
  const msgEl = modal.querySelector('#confirm-modal-msg');
  const proceedBtn = modal.querySelector('#confirm-modal-proceed');
  const cancelBtn = modal.querySelector('#confirm-modal-cancel');
  const xBtn = modal.querySelector('#confirm-modal-x');

  titleEl.textContent = title;
  msgEl.textContent = message;
  proceedBtn.textContent = confirmText;
  proceedBtn.className = `btn ${confirmClass}`;

  const cleanup = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  cancelBtn.onclick = cleanup;
  xBtn.onclick = cleanup;
  modal.onclick = (e) => {
    if (e.target === modal) cleanup();
  };

  proceedBtn.onclick = async () => {
    proceedBtn.disabled = true;
    proceedBtn.textContent = 'Processing...';
    try {
      if (onConfirm) await onConfirm();
      cleanup();
    } catch (err) {
      showToast('Error', err.message || 'Operation failed', 'error');
    } finally {
      proceedBtn.disabled = false;
      proceedBtn.textContent = confirmText;
    }
  };

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Format numbers as Indian Rupee (INR ₹) or standard currency.
 * @param {number|string} amount
 * @returns {string} e.g. "₹ 24,500.00"
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Format Firestore Timestamp, Date object, or string into readable format.
 * @param {any} dateValue
 * @returns {string} e.g. "05 Nov 2026"
 */
export function formatDate(dateValue) {
  if (!dateValue) return 'N/A';
  let date;
  if (dateValue.toDate && typeof dateValue.toDate === 'function') {
    date = dateValue.toDate(); // Firestore Timestamp
  } else if (dateValue instanceof Date) {
    date = dateValue;
  } else {
    date = new Date(dateValue);
  }

  if (isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

