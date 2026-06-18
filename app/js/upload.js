/**
 * upload.js - File upload functionality
 * Handles uploading a DOT graph and optional ROOT rechits file.
 */

const UploadManager = {
    modal: null,
    form: null,
    dotFileInput: null,
    dotFileInfo: null,
    rootFileInput: null,
    rootFileInfo: null,
    rechitsEventIndexInput: null,
    uploadProgress: null,
    uploadStatus: null,
    submitBtn: null,

    /**
     * Initialize upload manager
     */
    init() {
        this.modal = document.getElementById('upload-modal');
        this.form = document.getElementById('upload-form');
        this.dotFileInput = document.getElementById('dot-file-input');
        this.dotFileInfo = document.getElementById('dot-file-info');
        this.dotUrlInput = document.getElementById('dot-url-input');
        this.loadUrlBtn = document.getElementById('load-url-btn');
        this.rootFileInput = document.getElementById('root-file-input');
        this.rootFileInfo = document.getElementById('root-file-info');
        this.rechitsEventIndexInput = document.getElementById('rechits-event-index-input');
        this.uploadProgress = document.getElementById('upload-progress');
        this.uploadStatus = document.getElementById('upload-status');
        this.submitBtn = document.getElementById('upload-submit-btn');

        this.setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Open modal button
        document.getElementById('upload-btn').addEventListener('click', () => {
            this.openModal();
        });

        // Close modal buttons
        document.getElementById('modal-close-btn').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('upload-cancel-btn').addEventListener('click', () => {
            this.closeModal();
        });

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        // File input changes
        this.dotFileInput.addEventListener('change', (e) => {
            this.updateFileInfo(e.target, this.dotFileInfo);
        });
        this.rootFileInput.addEventListener('change', (e) => {
            this.updateFileInfo(e.target, this.rootFileInfo);
        });

        // Form submit
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUpload();
        });

        // Load from URL
        if (this.loadUrlBtn) {
            this.loadUrlBtn.addEventListener('click', () => {
                this.handleLoadUrl(this.dotUrlInput ? this.dotUrlInput.value : '');
            });
        }
        if (this.dotUrlInput) {
            this.dotUrlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleLoadUrl(this.dotUrlInput.value);
                }
            });
        }
    },

    /**
     * Open upload modal
     */
    openModal() {
        this.modal.classList.remove('hidden');
        this.resetForm();
    },

    /**
     * Close upload modal
     */
    closeModal() {
        this.modal.classList.add('hidden');
        this.resetForm();
    },

    /**
     * Reset form
     */
    resetForm() {
        this.form.reset();
        this.dotFileInfo.textContent = 'No file selected';
        this.rootFileInfo.textContent = 'No file selected';
        this.rechitsEventIndexInput.value = '0';
        this.uploadProgress.classList.add('hidden');
        this.submitBtn.disabled = false;
    },

    /**
     * Update file info display
     */
    updateFileInfo(input, infoElement) {
        if (input.files.length > 0) {
            const file = input.files[0];
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            infoElement.textContent = `${file.name} (${sizeMB} MB)`;
        } else {
            infoElement.textContent = 'No file selected';
        }
    },

    /**
     * Handle file upload
     */
    async handleUpload() {
        const dotFile = this.dotFileInput.files[0];
        const rootFile = this.rootFileInput.files[0];
        const rechitsEventIndex = this.parseRechitsEventIndex();

        if (!dotFile) {
            alert('Please select a DOT graph file');
            return;
        }

        if (rootFile && rechitsEventIndex === null) {
            alert('Please enter a non-negative rechits event number');
            return;
        }

        // Show progress
        this.uploadProgress.classList.remove('hidden');
        this.uploadStatus.textContent = 'Uploading files...';
        this.submitBtn.disabled = true;

        try {
            // Create form data
            const formData = new FormData();
            formData.append('dotFile', dotFile);
            if (rootFile) {
                formData.append('rootFile', rootFile);
                formData.append('rechitsEventIndex', String(rechitsEventIndex));
            }

            // Upload files
            const response = await fetch('../upload', {
                method: 'POST',
                body: formData
            });

            const result = await this.parseJsonResponse(response, 'Upload');

            if (result.success) {
                this.uploadStatus.textContent = 'Upload complete. Processing files...';
                await this.waitForBundleBuild();

                this.uploadStatus.textContent = 'Files processed successfully! Reloading...';

                // Wait a bit then reload the page
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.uploadStatus.textContent = `Error: ${error.message}`;
            this.submitBtn.disabled = false;

            alert(`Upload failed: ${error.message}`);
        }
    },

    /**
     * Fetch and process a DOT graph from a URL (server-side, no browser CORS).
     * Reuses the same build-and-reload flow as a file upload. On success the page
     * reloads to the clean path so a ?dot= deep link does not re-trigger the build.
     */
    async handleLoadUrl(url) {
        const trimmedUrl = String(url || '').trim();
        if (!trimmedUrl) {
            alert('Please enter a DOT file URL');
            return;
        }

        // Make sure the modal is visible so the build progress is shown.
        this.modal.classList.remove('hidden');
        this.uploadProgress.classList.remove('hidden');
        this.uploadStatus.textContent = 'Fetching DOT from URL...';
        this.submitBtn.disabled = true;
        if (this.loadUrlBtn) this.loadUrlBtn.disabled = true;

        try {
            const response = await fetch('../load-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: trimmedUrl })
            });

            const result = await this.parseJsonResponse(response, 'Load from URL');

            if (result.success) {
                this.uploadStatus.textContent = 'DOT fetched. Processing...';
                await this.waitForBundleBuild();
                this.uploadStatus.textContent = 'Processed successfully! Reloading...';
                setTimeout(() => {
                    window.location.assign(window.location.pathname);
                }, 1200);
            } else {
                throw new Error(result.error || 'Load from URL failed');
            }
        } catch (error) {
            console.error('Load from URL error:', error);
            this.uploadStatus.textContent = `Error: ${error.message}`;
            this.submitBtn.disabled = false;
            if (this.loadUrlBtn) this.loadUrlBtn.disabled = false;
            alert(`Load from URL failed: ${error.message}`);
        }
    },

    /**
     * Parse a JSON response and produce a useful error for proxy/server HTML pages.
     */
    async parseJsonResponse(response, label) {
        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (error) {
            const message = response.ok
                ? `${label} response was not valid JSON`
                : `${label} failed with HTTP ${response.status}`;
            throw new Error(message);
        }

        if (!response.ok || result.success === false) {
            throw new Error(result.error || `${label} failed with HTTP ${response.status}`);
        }

        return result;
    },

    /**
     * Poll the server until the asynchronous bundle build finishes.
     */
    async waitForBundleBuild() {
        const startedAt = Date.now();
        const timeoutMs = 60 * 60 * 1000;

        while (Date.now() - startedAt < timeoutMs) {
            await this.sleep(2000);

            const response = await fetch('../upload-status');
            const result = await this.parseJsonResponse(response, 'Build status');
            const build = result.build || {};

            if (build.state === 'success') {
                return;
            }

            if (build.state === 'error') {
                throw new Error(build.message || 'Bundle generation failed');
            }

            if (build.message) {
                this.uploadStatus.textContent = build.message;
            }
        }

        throw new Error('Bundle generation is still running after 60 minutes');
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    parseRechitsEventIndex() {
        const value = this.rechitsEventIndexInput.value.trim();
        if (value === '') return 0;

        const eventIndex = Number(value);
        if (!Number.isInteger(eventIndex) || eventIndex < 0) return null;

        return eventIndex;
    }
};
