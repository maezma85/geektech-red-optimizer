const ui = {
    adapterSelect: document.getElementById('adapterSelect'),
    console: document.getElementById('console'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalText: document.getElementById('modal-text'),
    modalConfirmBtn: document.getElementById('modal-confirm'),
    modalCancelBtn: document.getElementById('modal-cancel'),
    buttons: document.querySelectorAll('.btn'),

    resolveModal: null,

    init() {
        this.modalConfirmBtn.addEventListener('click', () => this.handleModal(true));
        this.modalCancelBtn.addEventListener('click', () => this.handleModal(false));
    },

    confirm(text) {
        return new Promise(resolve => {
            this.modalText.textContent = text;
            this.modalOverlay.classList.add('visible');
            this.resolveModal = resolve;
        });
    },

    handleModal(result) {
        if (this.resolveModal) {
            this.resolveModal(result);
        }
        this.modalOverlay.classList.remove('visible');
        this.resolveModal = null;
    },

    log(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.console.appendChild(line);
        this.console.scrollTop = this.console.scrollHeight;
    },

    toggleControls(disabled) {
        this.buttons.forEach(button => {
            if (!button.classList.contains('exit')) {
                button.disabled = disabled;
            }
        });
    },

    populateAdapters(adaptadores) {
        if (!adaptadores || adaptadores.length === 0) {
            this.adapterSelect.innerHTML = '<option value="">No se encontraron adaptadores</option>';
            this.log('No se encontraron adaptadores de red activos.', 'warning');
            return;
        }
        this.adapterSelect.innerHTML = adaptadores.map(a => `<option value="${a.name}">${a.displayName}</option>`).join('');
        this.log(`Adaptador por defecto seleccionado: ${adaptadores[0].displayName}`, 'success');
    },

    getSelectedAdapter() {
        const adapter = this.adapterSelect.value;
        if (!adapter) {
            this.log('Por favor, seleccione un adaptador de red primero.', 'warning');
            return null;
        }
        return adapter;
    }
};

ui.init();