// Admin Panel UI Logic

(function() {
  // Create and inject admin panel HTML
  function createAdminPanel() {
    const panelHTML = `
      <!-- Admin Login Modal -->
      <div id="admin-login-modal" class="admin-modal" style="display: none;">
        <div class="admin-modal-content admin-login-box">
          <span class="admin-close" onclick="AdminPanel.closeLogin()">&times;</span>
          <h2>Admin Login</h2>
          <input type="password" id="admin-password" placeholder="Enter password" onkeypress="if(event.key==='Enter')AdminPanel.login()">
          <button onclick="AdminPanel.login()">Login</button>
          <p id="admin-login-error" style="color: #ff4444; display: none;">Incorrect password</p>
        </div>
      </div>

      <!-- Admin Panel Modal -->
      <div id="admin-panel-modal" class="admin-modal" style="display: none;">
        <div class="admin-modal-content admin-panel-box">
          <div class="admin-header">
            <h2>Admin Panel</h2>
            <div>
              <button onclick="AdminPanel.logout()" class="admin-btn-secondary">Logout</button>
              <span class="admin-close" onclick="AdminPanel.closePanel()">&times;</span>
            </div>
          </div>

          <!-- Tabs -->
          <div class="admin-tabs">
            <button class="admin-tab active" onclick="AdminPanel.switchTab('home')">Home Projects</button>
            <button class="admin-tab" onclick="AdminPanel.switchTab('archives')">Archive Projects</button>
            <button class="admin-tab" onclick="AdminPanel.switchTab('projects')">Projects Page</button>
          </div>

          <!-- Home Projects Tab -->
          <div id="admin-tab-home" class="admin-tab-content">
            <div class="admin-toolbar">
              <button onclick="AdminPanel.addHomeProject()" class="admin-btn-primary">+ Add Project</button>
              <button onclick="AdminPanel.resetHome()" class="admin-btn-secondary">Reset to Defaults</button>
            </div>
            <div id="admin-home-list" class="admin-project-list"></div>
          </div>

          <!-- Archives Tab -->
          <div id="admin-tab-archives" class="admin-tab-content" style="display: none;">
            <div class="admin-toolbar">
              <button onclick="AdminPanel.addArchiveProject()" class="admin-btn-primary">+ Add Project</button>
              <button onclick="AdminPanel.resetArchives()" class="admin-btn-secondary">Reset to Defaults</button>
            </div>
            <div id="admin-archives-list" class="admin-project-list"></div>
          </div>

          <!-- Projects Page Tab -->
          <div id="admin-tab-projects" class="admin-tab-content" style="display: none;">
            <div class="admin-toolbar">
              <button onclick="AdminPanel.addProject()" class="admin-btn-primary">+ Add Project</button>
              <button onclick="AdminPanel.resetProjects()" class="admin-btn-secondary">Reset to Defaults</button>
            </div>
            <div id="admin-projects-list" class="admin-project-list"></div>
          </div>
        </div>
      </div>

      <!-- Edit Home Project Modal -->
      <div id="admin-edit-home-modal" class="admin-modal" style="display: none;">
        <div class="admin-modal-content admin-edit-box admin-edit-box-wide">
          <span class="admin-close" onclick="AdminPanel.closeEditHome()">&times;</span>
          <h2 id="admin-edit-home-title">Edit Project</h2>
          <form id="admin-edit-home-form">
            <input type="hidden" id="edit-home-id">
            <label>Title</label>
            <input type="text" id="edit-home-title" required>
            <label>Year</label>
            <input type="text" id="edit-home-year" required>
            <label>Category</label>
            <input type="text" id="edit-home-category" required>
            <label>Description</label>
            <textarea id="edit-home-description" rows="3"></textarea>
            <label>Credit (optional)</label>
            <input type="text" id="edit-home-credit">

            <label>Project Type</label>
            <select id="edit-home-type" onchange="AdminPanel.toggleHomeTypeFields()">
              <option value="video">Video (YouTube)</option>
              <option value="images">Images</option>
              <option value="flipbook-pdf">Flipbook PDF</option>
            </select>

            <!-- Video Type Fields -->
            <div id="home-type-video" class="project-type-fields">
              <label>YouTube URL</label>
              <input type="url" id="edit-home-youtube" placeholder="https://www.youtube.com/watch?v=...">
            </div>

            <!-- Images Type Fields -->
            <div id="home-type-images" class="project-type-fields" style="display: none;">
              <label>Select Images from Repository</label>
              <div id="home-image-picker-grid" class="image-picker-grid">
                <!-- Images will be rendered by JavaScript -->
              </div>
              <p class="admin-form-hint">Click images to select/deselect. Selected images have a red border.</p>
              <label>Or Add External URL</label>
              <div class="external-url-input">
                <input type="text" id="edit-home-external-url" placeholder="https://example.com/image.jpg">
                <button type="button" onclick="AdminPanel.addHomeExternalImage()" class="admin-btn-small">Add</button>
              </div>
              <div id="home-selected-images-list" class="selected-images-list"></div>
            </div>

            <!-- Flipbook PDF Type Fields -->
            <div id="home-type-flipbook-pdf" class="project-type-fields" style="display: none;">
              <label>PDF URL or Path</label>
              <input type="text" id="edit-home-pdf" placeholder="https://... or ../document.pdf">
              <p class="admin-form-hint">Direct link to PDF file or local path</p>
            </div>

            <div class="admin-form-buttons">
              <button type="button" onclick="AdminPanel.closeEditHome()" class="admin-btn-secondary">Cancel</button>
              <button type="submit" class="admin-btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Edit Archive Project Modal -->
      <div id="admin-edit-archive-modal" class="admin-modal" style="display: none;">
        <div class="admin-modal-content admin-edit-box admin-edit-box-wide">
          <span class="admin-close" onclick="AdminPanel.closeEditArchive()">&times;</span>
          <h2 id="admin-edit-archive-title">Edit Project</h2>
          <form id="admin-edit-archive-form">
            <input type="hidden" id="edit-archive-id">
            <label>Title</label>
            <input type="text" id="edit-archive-title" required>
            <label>Select Image from Repository</label>
            <div id="archive-image-picker-grid" class="image-picker-grid">
              <!-- Images will be rendered by JavaScript -->
            </div>
            <p class="admin-form-hint">Click an image to select it. Or enter an external URL below.</p>
            <label>Or Enter Image URL</label>
            <input type="text" id="edit-archive-image" placeholder="https://... or ../image.jpg">
            <label>Detail Page Path (optional)</label>
            <input type="text" id="edit-archive-detail" placeholder="../projects_code/project1.html or leave empty">
            <label>Column</label>
            <select id="edit-archive-column">
              <option value="left">Left</option>
              <option value="middle">Middle</option>
              <option value="right">Right</option>
            </select>
            <div class="admin-form-buttons">
              <button type="button" onclick="AdminPanel.closeEditArchive()" class="admin-btn-secondary">Cancel</button>
              <button type="submit" class="admin-btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Edit Project Modal (Projects Page) -->
      <div id="admin-edit-project-modal" class="admin-modal" style="display: none;">
        <div class="admin-modal-content admin-edit-box admin-edit-box-wide">
          <span class="admin-close" onclick="AdminPanel.closeEditProject()">&times;</span>
          <h2 id="admin-edit-project-title">Edit Project</h2>
          <form id="admin-edit-project-form">
            <input type="hidden" id="edit-project-id">
            <label>Title</label>
            <input type="text" id="edit-project-title" required>
            <label>Description (HTML allowed)</label>
            <textarea id="edit-project-description" rows="4"></textarea>
            <label>Project Type</label>
            <select id="edit-project-type" onchange="AdminPanel.toggleProjectTypeFields()">
              <option value="images">Images (one or more)</option>
              <option value="flipbook-images">Flipbook - Pre-rendered Images</option>
              <option value="flipbook-pdf">Flipbook - PDF</option>
            </select>

            <!-- Images Type Fields -->
            <div id="project-type-images" class="project-type-fields">
              <label>Select Images from Repository</label>
              <div id="image-picker-grid" class="image-picker-grid">
                <!-- Images will be rendered by JavaScript -->
              </div>
              <p class="admin-form-hint">Click images to select/deselect. Selected images have a red border.</p>
              <input type="hidden" id="edit-project-images">
              <label>Or Add External URL</label>
              <div class="external-url-input">
                <input type="text" id="edit-project-external-url" placeholder="https://example.com/image.jpg">
                <button type="button" onclick="AdminPanel.addExternalImage()" class="admin-btn-small">Add</button>
              </div>
              <div id="selected-images-list" class="selected-images-list"></div>
              <label>Display Style</label>
              <select id="edit-project-displaystyle">
                <option value="default">Default (stacked)</option>
                <option value="grid-5">Grid (overlapping posters)</option>
              </select>
            </div>

            <!-- Flipbook Images Type Fields -->
            <div id="project-type-flipbook-images" class="project-type-fields" style="display: none;">
              <label>Base Path</label>
              <input type="text" id="edit-project-basepath" placeholder="Handbook_Files/handbook-pages/page-">
              <p class="admin-form-hint">Path prefix for image files (e.g., folder/page-)</p>
              <label>Page Count</label>
              <input type="number" id="edit-project-pagecount" min="1" value="1">
              <label>File Extension</label>
              <input type="text" id="edit-project-extension" value=".png" placeholder=".png or .jpg">
            </div>

            <!-- Flipbook PDF Type Fields -->
            <div id="project-type-flipbook-pdf" class="project-type-fields" style="display: none;">
              <label>PDF URL or Path</label>
              <input type="text" id="edit-project-pdf" placeholder="https://... or ../document.pdf">
              <p class="admin-form-hint">Direct link to PDF file or local path</p>
            </div>

            <div class="admin-form-buttons">
              <button type="button" onclick="AdminPanel.closeEditProject()" class="admin-btn-secondary">Cancel</button>
              <button type="submit" class="admin-btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.id = 'admin-container';
    container.innerHTML = panelHTML;
    document.body.appendChild(container);

    // Add footer link
    addFooterLink();

    // Setup form handlers
    document.getElementById('admin-edit-home-form').addEventListener('submit', function(e) {
      e.preventDefault();
      AdminPanel.saveHomeProject();
    });

    document.getElementById('admin-edit-archive-form').addEventListener('submit', function(e) {
      e.preventDefault();
      AdminPanel.saveArchiveProject();
    });

    document.getElementById('admin-edit-project-form').addEventListener('submit', function(e) {
      e.preventDefault();
      AdminPanel.saveProject();
    });
  }

  // Add admin link to footer or create footer
  function addFooterLink() {
    let footer = document.querySelector('footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.style.cssText = 'text-align: center; padding: 20px; color: #333; font-size: 12px;';
      document.body.appendChild(footer);
    }

    const adminLink = document.createElement('a');
    adminLink.href = '#';
    adminLink.textContent = 'Admin';
    adminLink.style.cssText = 'color: #444; text-decoration: none; font-size: 11px; opacity: 0.5; margin-left: 20px;';
    adminLink.onclick = function(e) {
      e.preventDefault();
      AdminPanel.showLogin();
    };
    footer.appendChild(adminLink);
  }

  // Extract YouTube ID from URL
  function extractYoutubeId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    return match ? match[1] : '';
  }

  // Render home projects list
  function renderHomeProjects() {
    const projects = AdminData.getHomeProjects();
    const list = document.getElementById('admin-home-list');

    const typeLabels = {
      'video': 'Video',
      'images': 'Images',
      'flipbook-pdf': 'Flipbook PDF'
    };

    list.innerHTML = projects.map(p => {
      const type = p.type || 'video';
      return `
      <div class="admin-project-item ${!p.visible ? 'hidden-project' : ''}">
        <div class="admin-project-info">
          <strong>${p.title}</strong>
          <span>${p.year} ${p.category} • ${typeLabels[type]}</span>
        </div>
        <div class="admin-project-actions">
          <label class="admin-toggle">
            <input type="checkbox" ${p.visible ? 'checked' : ''} onchange="AdminPanel.toggleHomeVisibility('${p.id}')">
            <span class="admin-toggle-slider"></span>
          </label>
          <button onclick="AdminPanel.editHomeProject('${p.id}')" class="admin-btn-small">Edit</button>
          <button onclick="AdminPanel.deleteHomeProject('${p.id}')" class="admin-btn-small admin-btn-danger">Delete</button>
        </div>
      </div>
    `}).join('');
  }

  // Render archive projects list
  function renderArchiveProjects() {
    const projects = AdminData.getArchiveProjects();
    const list = document.getElementById('admin-archives-list');

    list.innerHTML = projects.map(p => `
      <div class="admin-project-item ${!p.visible ? 'hidden-project' : ''}">
        <div class="admin-project-info">
          <strong>${p.title}</strong>
          <span>Column: ${p.column}</span>
        </div>
        <div class="admin-project-actions">
          <label class="admin-toggle">
            <input type="checkbox" ${p.visible ? 'checked' : ''} onchange="AdminPanel.toggleArchiveVisibility('${p.id}')">
            <span class="admin-toggle-slider"></span>
          </label>
          <button onclick="AdminPanel.editArchiveProject('${p.id}')" class="admin-btn-small">Edit</button>
          <button onclick="AdminPanel.deleteArchiveProject('${p.id}')" class="admin-btn-small admin-btn-danger">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // Render projects list (Projects Page)
  function renderProjects() {
    const projects = AdminData.getProjects();
    const list = document.getElementById('admin-projects-list');
    if (!list) return; // Not on projects page

    const typeLabels = {
      'images': 'Images',
      'flipbook-images': 'Flipbook (Images)',
      'flipbook-pdf': 'Flipbook (PDF)'
    };

    list.innerHTML = projects.map(p => `
      <div class="admin-project-item ${!p.visible ? 'hidden-project' : ''}">
        <div class="admin-project-info">
          <strong>${p.title}</strong>
          <span>Type: ${typeLabels[p.type] || p.type}</span>
        </div>
        <div class="admin-project-actions">
          <label class="admin-toggle">
            <input type="checkbox" ${p.visible ? 'checked' : ''} onchange="AdminPanel.toggleProjectVisibility('${p.id}')">
            <span class="admin-toggle-slider"></span>
          </label>
          <button onclick="AdminPanel.editProject('${p.id}')" class="admin-btn-small">Edit</button>
          <button onclick="AdminPanel.deleteProject('${p.id}')" class="admin-btn-small admin-btn-danger">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // Admin Panel Methods
  window.AdminPanel = {
    init: function() {
      createAdminPanel();
    },

    showLogin: function() {
      if (AdminData.isAdminLoggedIn()) {
        this.showPanel();
      } else {
        document.getElementById('admin-login-modal').style.display = 'flex';
        document.getElementById('admin-password').focus();
      }
    },

    closeLogin: function() {
      document.getElementById('admin-login-modal').style.display = 'none';
      document.getElementById('admin-password').value = '';
      document.getElementById('admin-login-error').style.display = 'none';
    },

    login: async function() {
      const password = document.getElementById('admin-password').value;
      const isValid = await AdminData.verifyPassword(password);

      if (isValid) {
        AdminData.setAdminLoggedIn(true);
        this.closeLogin();
        this.showPanel();
      } else {
        document.getElementById('admin-login-error').style.display = 'block';
      }
    },

    logout: function() {
      AdminData.setAdminLoggedIn(false);
      this.closePanel();
    },

    showPanel: function() {
      renderHomeProjects();
      renderArchiveProjects();
      renderProjects();
      document.getElementById('admin-panel-modal').style.display = 'flex';
    },

    closePanel: function() {
      document.getElementById('admin-panel-modal').style.display = 'none';
    },

    switchTab: function(tab) {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');

      const tabs = document.querySelectorAll('.admin-tab');
      if (tab === 'home') {
        tabs[0].classList.add('active');
        document.getElementById('admin-tab-home').style.display = 'block';
      } else if (tab === 'archives') {
        tabs[1].classList.add('active');
        document.getElementById('admin-tab-archives').style.display = 'block';
      } else if (tab === 'projects') {
        tabs[2].classList.add('active');
        document.getElementById('admin-tab-projects').style.display = 'block';
      }
    },

    // Home Project Methods
    toggleHomeVisibility: function(id) {
      const projects = AdminData.getHomeProjects();
      const project = projects.find(p => p.id === id);
      if (project) {
        project.visible = !project.visible;
        AdminData.saveHomeProjects(projects);
        renderHomeProjects();
        if (typeof renderHomePage === 'function') renderHomePage();
      }
    },

    addHomeProject: function() {
      document.getElementById('admin-edit-home-title').textContent = 'Add Project';
      document.getElementById('edit-home-id').value = '';
      document.getElementById('edit-home-title').value = '';
      document.getElementById('edit-home-year').value = new Date().getFullYear();
      document.getElementById('edit-home-category').value = 'SHORT FILM';
      document.getElementById('edit-home-description').value = '';
      document.getElementById('edit-home-credit').value = '';
      document.getElementById('edit-home-type').value = 'video';
      document.getElementById('edit-home-youtube').value = '';
      document.getElementById('edit-home-pdf').value = '';
      this.selectedHomeImages = [];
      this.toggleHomeTypeFields();
      document.getElementById('admin-edit-home-modal').style.display = 'flex';
    },

    editHomeProject: function(id) {
      const projects = AdminData.getHomeProjects();
      const project = projects.find(p => p.id === id);
      if (project) {
        document.getElementById('admin-edit-home-title').textContent = 'Edit Project';
        document.getElementById('edit-home-id').value = project.id;
        document.getElementById('edit-home-title').value = project.title;
        document.getElementById('edit-home-year').value = project.year;
        document.getElementById('edit-home-category').value = project.category;
        document.getElementById('edit-home-description').value = project.description;
        document.getElementById('edit-home-credit').value = project.credit || '';

        const projectType = project.type || 'video';
        document.getElementById('edit-home-type').value = projectType;

        if (projectType === 'video') {
          document.getElementById('edit-home-youtube').value = project.youtubeUrl || '';
          this.selectedHomeImages = [];
        } else if (projectType === 'images') {
          this.selectedHomeImages = [...(project.images || [])];
        } else if (projectType === 'flipbook-pdf') {
          document.getElementById('edit-home-pdf').value = project.flipbookPdf || '';
          this.selectedHomeImages = [];
        }

        this.toggleHomeTypeFields();
        document.getElementById('admin-edit-home-modal').style.display = 'flex';
      }
    },

    saveHomeProject: function() {
      const id = document.getElementById('edit-home-id').value;
      const projectType = document.getElementById('edit-home-type').value;

      const projectData = {
        id: id || AdminData.generateId('home'),
        title: document.getElementById('edit-home-title').value,
        year: document.getElementById('edit-home-year').value,
        category: document.getElementById('edit-home-category').value,
        description: document.getElementById('edit-home-description').value,
        credit: document.getElementById('edit-home-credit').value,
        type: projectType,
        visible: true
      };

      // Set type-specific fields
      if (projectType === 'video') {
        const youtubeUrl = document.getElementById('edit-home-youtube').value;
        projectData.youtubeUrl = youtubeUrl;
        projectData.youtubeId = extractYoutubeId(youtubeUrl);
      } else if (projectType === 'images') {
        projectData.images = [...this.selectedHomeImages];
      } else if (projectType === 'flipbook-pdf') {
        projectData.flipbookPdf = document.getElementById('edit-home-pdf').value;
      }

      const projects = AdminData.getHomeProjects();

      if (id) {
        const index = projects.findIndex(p => p.id === id);
        if (index !== -1) {
          projectData.visible = projects[index].visible;
          projects[index] = projectData;
        }
      } else {
        projects.push(projectData);
      }

      AdminData.saveHomeProjects(projects);
      this.closeEditHome();
      renderHomeProjects();
      if (typeof renderHomePage === 'function') renderHomePage();
    },

    deleteHomeProject: function(id) {
      if (confirm('Are you sure you want to delete this project?')) {
        const projects = AdminData.getHomeProjects().filter(p => p.id !== id);
        AdminData.saveHomeProjects(projects);
        renderHomeProjects();
        if (typeof renderHomePage === 'function') renderHomePage();
      }
    },

    closeEditHome: function() {
      document.getElementById('admin-edit-home-modal').style.display = 'none';
    },

    // Home project type management
    selectedHomeImages: [],

    toggleHomeTypeFields: function() {
      const type = document.getElementById('edit-home-type').value;
      document.querySelectorAll('#admin-edit-home-modal .project-type-fields').forEach(f => f.style.display = 'none');
      document.getElementById('home-type-' + type).style.display = 'block';
      if (type === 'images') {
        this.renderHomeImagePicker();
      }
    },

    renderHomeImagePicker: function() {
      const grid = document.getElementById('home-image-picker-grid');
      if (!grid) return;

      const images = AdminData.REPOSITORY_IMAGES || [];
      grid.innerHTML = images.map(img => `
        <div class="image-picker-item ${this.selectedHomeImages.includes(img.path) ? 'selected' : ''}"
             data-image-path="${img.path.replace(/"/g, '&quot;')}"
             title="${img.name}">
          <img src="${img.path}" alt="${img.name}" onerror="this.parentElement.style.display='none'">
          <span class="image-picker-name">${img.name}</span>
        </div>
      `).join('');

      // Add click handlers
      grid.querySelectorAll('.image-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          this.toggleHomeImageSelection(item.getAttribute('data-image-path'));
        });
      });

      this.renderHomeSelectedImagesList();
    },

    toggleHomeImageSelection: function(path) {
      const index = this.selectedHomeImages.indexOf(path);
      if (index === -1) {
        this.selectedHomeImages.push(path);
      } else {
        this.selectedHomeImages.splice(index, 1);
      }
      this.renderHomeImagePicker();
    },

    addHomeExternalImage: function() {
      const input = document.getElementById('edit-home-external-url');
      const url = input.value.trim();
      if (url && !this.selectedHomeImages.includes(url)) {
        this.selectedHomeImages.push(url);
        input.value = '';
        this.renderHomeSelectedImagesList();
      }
    },

    removeHomeSelectedImage: function(path) {
      const index = this.selectedHomeImages.indexOf(path);
      if (index !== -1) {
        this.selectedHomeImages.splice(index, 1);
        this.renderHomeImagePicker();
      }
    },

    renderHomeSelectedImagesList: function() {
      const list = document.getElementById('home-selected-images-list');
      if (!list) return;

      if (this.selectedHomeImages.length === 0) {
        list.innerHTML = '<p class="admin-form-hint">No images selected</p>';
        return;
      }

      list.innerHTML = '<label>Selected Images (' + this.selectedHomeImages.length + ')</label>' +
        this.selectedHomeImages.map((path, i) => `
          <div class="selected-image-item">
            <span class="selected-image-order">${i + 1}.</span>
            <span class="selected-image-path">${path.split('/').pop()}</span>
            <button type="button" data-image-path="${path.replace(/"/g, '&quot;')}" class="admin-btn-small admin-btn-danger remove-home-image">×</button>
          </div>
        `).join('');

      // Add click handlers to remove buttons
      list.querySelectorAll('.remove-home-image').forEach(btn => {
        btn.addEventListener('click', () => {
          this.removeHomeSelectedImage(btn.getAttribute('data-image-path'));
        });
      });
    },

    resetHome: function() {
      if (confirm('Reset all home projects to defaults? This will remove any custom projects.')) {
        localStorage.removeItem('charliecilla_home_projects');
        renderHomeProjects();
        if (typeof renderHomePage === 'function') renderHomePage();
      }
    },

    // Archive Project Methods
    toggleArchiveVisibility: function(id) {
      const projects = AdminData.getArchiveProjects();
      const project = projects.find(p => p.id === id);
      if (project) {
        project.visible = !project.visible;
        AdminData.saveArchiveProjects(projects);
        renderArchiveProjects();
        if (typeof renderArchivePage === 'function') renderArchivePage();
      }
    },

    addArchiveProject: function() {
      document.getElementById('admin-edit-archive-title').textContent = 'Add Project';
      document.getElementById('edit-archive-id').value = '';
      document.getElementById('edit-archive-title').value = '';
      document.getElementById('edit-archive-image').value = '';
      document.getElementById('edit-archive-detail').value = '';
      document.getElementById('edit-archive-column').value = 'left';
      this.renderArchiveImagePicker('');
      document.getElementById('admin-edit-archive-modal').style.display = 'flex';
    },

    editArchiveProject: function(id) {
      const projects = AdminData.getArchiveProjects();
      const project = projects.find(p => p.id === id);
      if (project) {
        document.getElementById('admin-edit-archive-title').textContent = 'Edit Project';
        document.getElementById('edit-archive-id').value = project.id;
        document.getElementById('edit-archive-title').value = project.title;
        document.getElementById('edit-archive-image').value = project.imagePath;
        document.getElementById('edit-archive-detail').value = project.detailPagePath;
        document.getElementById('edit-archive-column').value = project.column;
        this.renderArchiveImagePicker(project.imagePath);
        document.getElementById('admin-edit-archive-modal').style.display = 'flex';
      }
    },

    renderArchiveImagePicker: function(selectedPath) {
      const grid = document.getElementById('archive-image-picker-grid');
      if (!grid) return;

      const images = AdminData.REPOSITORY_IMAGES || [];
      grid.innerHTML = images.map(img => `
        <div class="image-picker-item ${selectedPath === img.path ? 'selected' : ''}"
             data-image-path="${img.path.replace(/"/g, '&quot;')}"
             title="${img.name}">
          <img src="${img.path}" alt="${img.name}" onerror="this.parentElement.style.display='none'">
          <span class="image-picker-name">${img.name}</span>
        </div>
      `).join('');

      // Add click handlers
      grid.querySelectorAll('.image-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          this.selectArchiveImage(item.getAttribute('data-image-path'));
        });
      });
    },

    selectArchiveImage: function(path) {
      document.getElementById('edit-archive-image').value = path;
      this.renderArchiveImagePicker(path);
    },

    saveArchiveProject: function() {
      const id = document.getElementById('edit-archive-id').value;

      const projectData = {
        id: id || AdminData.generateId('archive'),
        title: document.getElementById('edit-archive-title').value,
        imagePath: document.getElementById('edit-archive-image').value,
        detailPagePath: document.getElementById('edit-archive-detail').value || '',
        column: document.getElementById('edit-archive-column').value,
        visible: true
      };

      const projects = AdminData.getArchiveProjects();

      if (id) {
        const index = projects.findIndex(p => p.id === id);
        if (index !== -1) {
          projectData.visible = projects[index].visible;
          projects[index] = projectData;
        }
      } else {
        projects.push(projectData);
      }

      AdminData.saveArchiveProjects(projects);
      this.closeEditArchive();
      renderArchiveProjects();
      if (typeof renderArchivePage === 'function') renderArchivePage();
    },

    deleteArchiveProject: function(id) {
      if (confirm('Are you sure you want to delete this project?')) {
        const projects = AdminData.getArchiveProjects().filter(p => p.id !== id);
        AdminData.saveArchiveProjects(projects);
        renderArchiveProjects();
        if (typeof renderArchivePage === 'function') renderArchivePage();
      }
    },

    closeEditArchive: function() {
      document.getElementById('admin-edit-archive-modal').style.display = 'none';
    },

    resetArchives: function() {
      if (confirm('Reset all archive projects to defaults? This will remove any custom projects.')) {
        localStorage.removeItem('charliecilla_archive_projects');
        renderArchiveProjects();
        if (typeof renderArchivePage === 'function') renderArchivePage();
      }
    },

    // Projects Page Methods
    toggleProjectVisibility: function(id) {
      const projects = AdminData.getProjects();
      const project = projects.find(p => p.id === id);
      if (project) {
        project.visible = !project.visible;
        AdminData.saveProjects(projects);
        renderProjects();
        if (typeof renderProjectsPage === 'function') renderProjectsPage();
      }
    },

    toggleProjectTypeFields: function() {
      const type = document.getElementById('edit-project-type').value;
      document.querySelectorAll('.project-type-fields').forEach(f => f.style.display = 'none');
      document.getElementById('project-type-' + type).style.display = 'block';
      if (type === 'images') {
        this.renderImagePicker();
      }
    },

    // Selected images for current project
    selectedImages: [],

    renderImagePicker: function() {
      const grid = document.getElementById('image-picker-grid');
      if (!grid) return;

      const images = AdminData.REPOSITORY_IMAGES || [];
      grid.innerHTML = images.map(img => `
        <div class="image-picker-item ${this.selectedImages.includes(img.path) ? 'selected' : ''}"
             data-image-path="${img.path.replace(/"/g, '&quot;')}"
             title="${img.name}">
          <img src="${img.path}" alt="${img.name}" onerror="this.parentElement.style.display='none'">
          <span class="image-picker-name">${img.name}</span>
        </div>
      `).join('');

      // Add click handlers
      grid.querySelectorAll('.image-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          this.toggleImageSelection(item.getAttribute('data-image-path'));
        });
      });

      this.renderSelectedImagesList();
    },

    toggleImageSelection: function(path) {
      const index = this.selectedImages.indexOf(path);
      if (index === -1) {
        this.selectedImages.push(path);
      } else {
        this.selectedImages.splice(index, 1);
      }
      this.renderImagePicker();
    },

    addExternalImage: function() {
      const input = document.getElementById('edit-project-external-url');
      const url = input.value.trim();
      if (url && !this.selectedImages.includes(url)) {
        this.selectedImages.push(url);
        input.value = '';
        this.renderSelectedImagesList();
      }
    },

    removeSelectedImage: function(path) {
      const index = this.selectedImages.indexOf(path);
      if (index !== -1) {
        this.selectedImages.splice(index, 1);
        this.renderImagePicker();
      }
    },

    renderSelectedImagesList: function() {
      const list = document.getElementById('selected-images-list');
      if (!list) return;

      if (this.selectedImages.length === 0) {
        list.innerHTML = '<p class="admin-form-hint">No images selected</p>';
        return;
      }

      list.innerHTML = '<label>Selected Images (' + this.selectedImages.length + ')</label>' +
        this.selectedImages.map((path, i) => `
          <div class="selected-image-item">
            <span class="selected-image-order">${i + 1}.</span>
            <span class="selected-image-path">${path.split('/').pop()}</span>
            <button type="button" data-image-path="${path.replace(/"/g, '&quot;')}" class="admin-btn-small admin-btn-danger remove-image">×</button>
          </div>
        `).join('');

      // Add click handlers to remove buttons
      list.querySelectorAll('.remove-image').forEach(btn => {
        btn.addEventListener('click', () => {
          this.removeSelectedImage(btn.getAttribute('data-image-path'));
        });
      });
    },

    addProject: function() {
      document.getElementById('admin-edit-project-title').textContent = 'Add Project';
      document.getElementById('edit-project-id').value = '';
      document.getElementById('edit-project-title').value = '';
      document.getElementById('edit-project-description').value = '';
      document.getElementById('edit-project-type').value = 'images';
      document.getElementById('edit-project-displaystyle').value = 'default';
      document.getElementById('edit-project-basepath').value = '';
      document.getElementById('edit-project-pagecount').value = '1';
      document.getElementById('edit-project-extension').value = '.png';
      document.getElementById('edit-project-pdf').value = '';
      this.selectedImages = [];
      this.toggleProjectTypeFields();
      document.getElementById('admin-edit-project-modal').style.display = 'flex';
    },

    editProject: function(id) {
      const projects = AdminData.getProjects();
      const project = projects.find(p => p.id === id);
      if (project) {
        document.getElementById('admin-edit-project-title').textContent = 'Edit Project';
        document.getElementById('edit-project-id').value = project.id;
        document.getElementById('edit-project-title').value = project.title;
        document.getElementById('edit-project-description').value = project.description || '';
        document.getElementById('edit-project-type').value = project.type || 'images';

        // Set fields based on type
        if (project.type === 'images' || !project.type) {
          this.selectedImages = [...(project.images || [])];
          document.getElementById('edit-project-displaystyle').value = project.displayStyle || 'default';
        } else if (project.type === 'flipbook-images') {
          this.selectedImages = [];
          const fb = project.flipbookImages || {};
          document.getElementById('edit-project-basepath').value = fb.basePath || '';
          document.getElementById('edit-project-pagecount').value = fb.pageCount || 1;
          document.getElementById('edit-project-extension').value = fb.extension || '.png';
        } else if (project.type === 'flipbook-pdf') {
          this.selectedImages = [];
          document.getElementById('edit-project-pdf').value = project.flipbookPdf || '';
        }

        this.toggleProjectTypeFields();
        document.getElementById('admin-edit-project-modal').style.display = 'flex';
      }
    },

    saveProject: function() {
      const id = document.getElementById('edit-project-id').value;
      const type = document.getElementById('edit-project-type').value;

      const projectData = {
        id: id || AdminData.generateId('project'),
        title: document.getElementById('edit-project-title').value,
        description: document.getElementById('edit-project-description').value,
        type: type,
        displayStyle: 'default',
        visible: true
      };

      // Set type-specific fields
      if (type === 'images') {
        projectData.images = [...this.selectedImages];
        projectData.displayStyle = document.getElementById('edit-project-displaystyle').value;
      } else if (type === 'flipbook-images') {
        projectData.flipbookImages = {
          basePath: document.getElementById('edit-project-basepath').value,
          pageCount: parseInt(document.getElementById('edit-project-pagecount').value) || 1,
          extension: document.getElementById('edit-project-extension').value || '.png'
        };
      } else if (type === 'flipbook-pdf') {
        projectData.flipbookPdf = document.getElementById('edit-project-pdf').value;
      }

      const projects = AdminData.getProjects();

      if (id) {
        const index = projects.findIndex(p => p.id === id);
        if (index !== -1) {
          projectData.visible = projects[index].visible;
          projects[index] = projectData;
        }
      } else {
        projects.push(projectData);
      }

      AdminData.saveProjects(projects);
      this.closeEditProject();
      renderProjects();
      if (typeof renderProjectsPage === 'function') renderProjectsPage();
    },

    deleteProject: function(id) {
      if (confirm('Are you sure you want to delete this project?')) {
        const projects = AdminData.getProjects().filter(p => p.id !== id);
        AdminData.saveProjects(projects);
        renderProjects();
        if (typeof renderProjectsPage === 'function') renderProjectsPage();
      }
    },

    closeEditProject: function() {
      document.getElementById('admin-edit-project-modal').style.display = 'none';
    },

    resetProjects: function() {
      if (confirm('Reset all projects to defaults? This will remove any custom projects.')) {
        localStorage.removeItem('charliecilla_projects');
        renderProjects();
        if (typeof renderProjectsPage === 'function') renderProjectsPage();
      }
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', AdminPanel.init.bind(AdminPanel));
  } else {
    AdminPanel.init();
  }
})();
