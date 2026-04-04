// Global variables
let currentStudentData = null;
let charts = {};
let currentSectionData = null;
let sectionCharts = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadStudentsList();
    loadLeaderboard();
    loadBatchAnalytics();
    updateStudentCount();
    loadCourses();
    loadAssignmentsFilter();
});

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            switchView(view);
        });
    });
    
    // Dashboard search
    const dashboardSearchBtn = document.getElementById('searchBtnDashboard');
    const dashboardSearchInput = document.getElementById('searchRollInput');
    
    if (dashboardSearchBtn) {
        dashboardSearchBtn.addEventListener('click', () => loadStudentData());
    }
    if (dashboardSearchInput) {
        dashboardSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadStudentData();
        });
    }
    
    // Top bar search
    const topSearchBtn = document.getElementById('searchBtn');
    const topSearchInput = document.getElementById('searchRoll');
    
    if (topSearchBtn) {
        topSearchBtn.addEventListener('click', () => {
            const roll = topSearchInput.value.trim();
            if (dashboardSearchInput) dashboardSearchInput.value = roll;
            loadStudentData();
        });
    }
    if (topSearchInput) {
        topSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const roll = topSearchInput.value.trim();
                if (dashboardSearchInput) dashboardSearchInput.value = roll;
                loadStudentData();
            }
        });
    }
    
    // Buttons
    const addStudentBtn = document.getElementById('addStudentBtn');
    const uploadFileBtn = document.getElementById('uploadFileBtn');
    const exportDataBtn = document.getElementById('exportDataBtn');
    const confirmUpload = document.getElementById('confirmUpload');
    const loadSectionBtn = document.getElementById('loadSectionBtn');
    const assignStudentBtn = document.getElementById('assignStudentBtn');
    const viewAssignmentsBtn = document.getElementById('viewAssignmentsBtn');
    const confirmAssignBtn = document.getElementById('confirmAssignBtn');
    const aiAssistantBtn = document.getElementById('aiAssistantBtn');
    
    if (addStudentBtn) addStudentBtn.addEventListener('click', () => openModal('addStudentModal'));
    if (uploadFileBtn) uploadFileBtn.addEventListener('click', () => openModal('uploadModal'));
    if (exportDataBtn) exportDataBtn.addEventListener('click', () => exportData());
    if (confirmUpload) confirmUpload.addEventListener('click', () => uploadFile());
    if (loadSectionBtn) loadSectionBtn.addEventListener('click', () => loadSectionDashboard());
    if (assignStudentBtn) assignStudentBtn.addEventListener('click', () => openAssignModal());
    if (viewAssignmentsBtn) viewAssignmentsBtn.addEventListener('click', () => openViewAssignmentsModal());
    if (confirmAssignBtn) confirmAssignBtn.addEventListener('click', () => assignStudentToSection());
    if (aiAssistantBtn) aiAssistantBtn.addEventListener('click', () => openAIChat());
    
    // Form submit
    const addStudentForm = document.getElementById('addStudentForm');
    if (addStudentForm) {
        addStudentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addStudent();
        });
    }
    
    // Leaderboard filter
    const leaderboardFilter = document.getElementById('leaderboardFilter');
    if (leaderboardFilter) {
        leaderboardFilter.addEventListener('change', () => loadLeaderboard());
    }
    
    // Student search
    const studentSearch = document.getElementById('studentSearch');
    if (studentSearch) {
        studentSearch.addEventListener('input', () => filterStudents());
    }
    
    // Assignment filter
    const viewAssignmentsFilter = document.getElementById('viewAssignmentsFilter');
    if (viewAssignmentsFilter) {
        viewAssignmentsFilter.addEventListener('change', () => loadAllAssignments());
    }
    
    // Close modals
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => closeModal());
    });
    
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) closeModal();
    });
}

function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(`${view}View`);
    if (targetView) targetView.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-view') === view) btn.classList.add('active');
    });
    
    if (view === 'students') loadStudentsList();
    else if (view === 'leaderboard') loadLeaderboard();
    else if (view === 'analytics') loadBatchAnalytics();
    else if (view === 'sectionDashboard' && currentSectionData) {
        if (sectionCharts.difficulty) {
            sectionCharts.difficulty.resize();
        }
    }
}

async function loadStudentData() {
    const rollInput = document.getElementById('searchRollInput');
    const roll = rollInput ? rollInput.value.trim() : '';
    
    if (!roll) {
        showToast('Enter a roll number', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`/api/student/${encodeURIComponent(roll)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                showToast('Student not found!', 'error');
                showEmptyDashboard();
            }
            throw new Error('Failed to fetch');
        }
        
        const data = await response.json();
        currentStudentData = data;
        displayStudentDetails(data);
        
    } catch (error) {
        console.error(error);
        showToast('Error loading student data', 'error');
        showEmptyDashboard();
    } finally {
        hideLoading();
    }
}

function showEmptyDashboard() {
    const studentInfoCard = document.getElementById('studentInfoCard');
    if (studentInfoCard) {
        studentInfoCard.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-code"></i>
                <h3>No Student Selected</h3>
                <p>Enter a roll number above to view performance analytics</p>
            </div>
        `;
    }
    
    const statsPanel = document.getElementById('statsPanel');
    const emptyRightPanel = document.getElementById('emptyRightPanel');
    
    if (statsPanel) statsPanel.style.display = 'none';
    if (emptyRightPanel) emptyRightPanel.style.display = 'flex';
}

function displayStudentDetails(data) {
    const stats = data.stats;
    
    const studentInfoCard = document.getElementById('studentInfoCard');
    if (studentInfoCard) {
        studentInfoCard.innerHTML = `
            <div class="student-detail-view">
                <h2>
                    <i class="fas fa-user-graduate"></i>
                    ${escapeHtml(data.name)}
                </h2>
                <div class="roll-badge">
                    <i class="fas fa-id-card"></i> ${escapeHtml(data.roll)}
                </div>
                <div class="leetcode-ids-list">
                    ${data.leetcode_ids.map(id => `
                        <span class="leetcode-tag">
                            <i class="fab fa-leetcode"></i> ${escapeHtml(id)}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    const easyValue = document.getElementById('easyValue');
    const mediumValue = document.getElementById('mediumValue');
    const hardValue = document.getElementById('hardValue');
    const totalValue = document.getElementById('totalValue');
    
    if (easyValue) easyValue.textContent = stats.Easy || 0;
    if (mediumValue) mediumValue.textContent = stats.Medium || 0;
    if (hardValue) hardValue.textContent = stats.Hard || 0;
    if (totalValue) totalValue.textContent = stats.All || 0;
    
    const topicsList = document.getElementById('topicsList');
    const weakTopicsPanel = document.getElementById('weakTopicsPanel');
    
    if (topicsList && weakTopicsPanel) {
        if (data.weak_topics && data.weak_topics.length > 0) {
            topicsList.innerHTML = data.weak_topics.map(t => 
                `<span class="topic-tag">${escapeHtml(t)}</span>`
            ).join('');
            weakTopicsPanel.style.display = 'block';
        } else {
            topicsList.innerHTML = '<span style="color: var(--success);">✨ Great job! No weak areas found.</span>';
            weakTopicsPanel.style.display = 'block';
        }
    }
    
    const statsPanel = document.getElementById('statsPanel');
    const emptyRightPanel = document.getElementById('emptyRightPanel');
    
    if (statsPanel) statsPanel.style.display = 'flex';
    if (emptyRightPanel) emptyRightPanel.style.display = 'none';
    
    if (charts.difficulty) charts.difficulty.destroy();
    
    const ctx = document.getElementById('difficultyChart');
    if (ctx) {
        charts.difficulty = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Easy', 'Medium', 'Hard'],
                datasets: [{
                    data: [stats.Easy || 0, stats.Medium || 0, stats.Hard || 0],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: '#f1f5f9',
                            font: { size: 11 },
                            padding: 8
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

async function loadStudentsList() {
    try {
        const response = await fetch('/api/students');
        const students = await response.json();
        window.allStudents = students;
        displayStudents(students);
        updateStudentCount();
        populateStudentSelect(students);
    } catch (error) {
        console.error('Error loading students:', error);
    }
}

function displayStudents(students) {
    const container = document.getElementById('studentsList');
    if (!container) return;
    
    if (students.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No students found</p></div>';
        return;
    }
    
    container.innerHTML = students.map(student => `
        <div class="student-card" onclick="viewStudentDetails('${student.roll}')">
            <h4><i class="fas fa-user"></i> ${escapeHtml(student.name)}</h4>
            <div class="roll">${escapeHtml(student.roll)}</div>
            <div class="student-stats-mini">
                <span><i class="fas fa-smile easy"></i> ${student.stats.Easy || 0}</span>
                <span><i class="fas fa-chart-line medium"></i> ${student.stats.Medium || 0}</span>
                <span><i class="fas fa-fire hard"></i> ${student.stats.Hard || 0}</span>
            </div>
            <div class="leetcode-ids">${student.leetcode_ids.map(id => `@${escapeHtml(id)}`).join(', ')}</div>
        </div>
    `).join('');
}

function filterStudents() {
    if (!window.allStudents) return;
    const searchTerm = document.getElementById('studentSearch')?.value.toLowerCase() || '';
    const filtered = window.allStudents.filter(s => 
        s.name.toLowerCase().includes(searchTerm) || 
        s.roll.toLowerCase().includes(searchTerm)
    );
    displayStudents(filtered);
}

async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const leaderboard = await response.json();
        const filter = document.getElementById('leaderboardFilter')?.value || 'total';
        displayLeaderboard(leaderboard, filter);
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

function displayLeaderboard(leaderboard, sortBy) {
    const container = document.getElementById('leaderboardTable');
    if (!container) return;
    
    let sorted = [...leaderboard];
    if (sortBy === 'easy') sorted.sort((a, b) => b.easy - a.easy);
    else if (sortBy === 'medium') sorted.sort((a, b) => b.medium - a.medium);
    else if (sortBy === 'hard') sorted.sort((a, b) => b.hard - a.hard);
    else sorted.sort((a, b) => b.total_solved - a.total_solved);
    
    sorted.forEach((s, i) => s.rank = i + 1);
    
    let html = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Student</th>
                    <th>Roll</th>
                    <th>Easy</th>
                    <th>Medium</th>
                    <th>Hard</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    sorted.forEach(s => {
        let rankClass = s.rank === 1 ? 'rank-1' : s.rank === 2 ? 'rank-2' : s.rank === 3 ? 'rank-3' : '';
        html += `
            <tr onclick="viewStudentDetails('${s.roll}')">
                <td class="${rankClass}">#${s.rank}</td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td>${escapeHtml(s.roll)}</td>
                <td>${s.easy}</td>
                <td>${s.medium}</td>
                <td>${s.hard}</td>
                <td><strong>${s.total_solved}</strong></td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

async function loadBatchAnalytics() {
    try {
        const response = await fetch('/api/batch-analytics');
        const analytics = await response.json();
        displayBatchAnalytics(analytics);
        await loadAIInsights();
        await loadPerformancePredictions();
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function displayBatchAnalytics(analytics) {
    const batch = analytics['Your Batch'];
    if (!batch) return;
    
    // Hero stats
    const totalStudentsHero = document.getElementById('totalStudentsHero');
    const totalProblemsHero = document.getElementById('totalProblemsHero');
    const avgProblemsHero = document.getElementById('avgProblemsHero');
    
    if (totalStudentsHero) totalStudentsHero.textContent = batch.count;
    if (totalProblemsHero) totalProblemsHero.textContent = batch.total_all;
    if (avgProblemsHero) avgProblemsHero.textContent = Math.round(batch.avg_total);
    
    // Difficulty counts
    const totalEasyCount = document.getElementById('totalEasyCount');
    const totalMediumCount = document.getElementById('totalMediumCount');
    const totalHardCount = document.getElementById('totalHardCount');
    
    if (totalEasyCount) totalEasyCount.textContent = batch.total_easy;
    if (totalMediumCount) totalMediumCount.textContent = batch.total_medium;
    if (totalHardCount) totalHardCount.textContent = batch.total_hard;
    
    // Progress bars
    const totalAll = batch.total_easy + batch.total_medium + batch.total_hard;
    const easyProgressFill = document.getElementById('easyProgressFill');
    const mediumProgressFill = document.getElementById('mediumProgressFill');
    const hardProgressFill = document.getElementById('hardProgressFill');
    
    if (easyProgressFill) easyProgressFill.style.width = totalAll > 0 ? (batch.total_easy / totalAll * 100) + '%' : '0%';
    if (mediumProgressFill) mediumProgressFill.style.width = totalAll > 0 ? (batch.total_medium / totalAll * 100) + '%' : '0%';
    if (hardProgressFill) hardProgressFill.style.width = totalAll > 0 ? (batch.total_hard / totalAll * 100) + '%' : '0%';
    
    // Stat cards
    const statEasy = document.getElementById('statEasy');
    const statMedium = document.getElementById('statMedium');
    const statHard = document.getElementById('statHard');
    const statRatio = document.getElementById('statRatio');
    
    if (statEasy) statEasy.textContent = batch.total_easy;
    if (statMedium) statMedium.textContent = batch.total_medium;
    if (statHard) statHard.textContent = batch.total_hard;
    if (statRatio) statRatio.textContent = `${batch.total_easy}:${batch.total_medium}:${batch.total_hard}`;
    
    // Charts
    const doughnutCtx = document.getElementById('batchDoughnutChart');
    if (doughnutCtx) {
        if (charts.batchDoughnut) charts.batchDoughnut.destroy();
        charts.batchDoughnut = new Chart(doughnutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Easy', 'Medium', 'Hard'],
                datasets: [{
                    data: [batch.total_easy, batch.total_medium, batch.total_hard],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'bottom', labels: { color: '#f1f5f9' } } }
            }
        });
    }
    
    const barCtx = document.getElementById('batchBarChart');
    if (barCtx) {
        if (charts.batchBar) charts.batchBar.destroy();
        charts.batchBar = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Easy', 'Medium', 'Hard'],
                datasets: [{
                    label: 'Problems Solved',
                    data: [batch.total_easy, batch.total_medium, batch.total_hard],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#f1f5f9' } } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#f1f5f9' } },
                    x: { grid: { display: false }, ticks: { color: '#f1f5f9' } }
                }
            }
        });
    }
    
    // Top performers
    const topPerformersList = document.getElementById('topPerformersList');
    if (topPerformersList && batch.students) {
        topPerformersList.innerHTML = batch.students.slice(0, 5).map((student, i) => `
            <div class="performer-item">
                <div class="performer-rank rank-${i+1}">${i+1}</div>
                <div class="performer-info">
                    <div class="performer-name">${escapeHtml(student)}</div>
                </div>
            </div>
        `).join('');
    }
}

function viewStudentDetails(roll) {
    const dashboardSearchInput = document.getElementById('searchRollInput');
    if (dashboardSearchInput) dashboardSearchInput.value = roll;
    switchView('dashboard');
    loadStudentData();
}

async function addStudent() {
    const roll = document.getElementById('rollNumber')?.value.trim();
    const name = document.getElementById('studentName')?.value.trim();
    const leetcodeIdsStr = document.getElementById('leetcodeIds')?.value.trim();
    
    if (!roll) {
        showToast('Roll number is required', 'warning');
        return;
    }
    if (!name) {
        showToast('Name is required', 'warning');
        return;
    }
    if (!leetcodeIdsStr) {
        showToast('At least one LeetCode username is required', 'warning');
        return;
    }
    
    const leetcodeIds = leetcodeIdsStr.split(',').map(id => id.trim()).filter(id => id);
    
    if (leetcodeIds.length === 0) {
        showToast('Please enter at least one valid LeetCode username', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roll: roll, name: name, leetcode_ids: leetcodeIds })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message || 'Student added successfully!', 'success');
            closeModal();
            document.getElementById('addStudentForm')?.reset();
            
            Promise.all([
                loadStudentsList(),
                loadLeaderboard(),
                loadBatchAnalytics(),
                updateStudentCount()
            ]).catch(error => {
                console.error('Error refreshing data:', error);
            });
            
        } else {
            showToast(data.error || 'Failed to add student', 'error');
        }
    } catch (error) {
        console.error('Error adding student:', error);
        showToast('Network error: Could not connect to server', 'error');
    } finally {
        hideLoading();
    }
}

async function uploadFile() {
    const fileInput = document.getElementById('uploadFile');
    const file = fileInput?.files[0];
    
    if (!file) {
        showToast('Please select a file', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    showLoading();
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message, 'success');
            closeModal();
            if (fileInput) fileInput.value = '';
            loadStudentsList();
            loadLeaderboard();
            loadBatchAnalytics();
            updateStudentCount();
        } else {
            showToast(data.error || 'Upload failed', 'error');
        }
    } catch (error) {
        showToast('Error uploading file', 'error');
    } finally {
        hideLoading();
    }
}

async function exportData() {
    window.location.href = '/api/export';
    showToast('Export started!', 'success');
}

async function updateStudentCount() {
    try {
        const response = await fetch('/api/students');
        const students = await response.json();
        const studentCountSpan = document.getElementById('studentCount');
        if (studentCountSpan) studentCountSpan.textContent = students.length;
    } catch (error) {
        console.error('Error updating count:', error);
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('active');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===============================
// COURSE & SECTION DASHBOARD
// ===============================

async function loadCourses() {
    try {
        const response = await fetch('/api/courses');
        const courses = await response.json();
        
        const courseSelect = document.getElementById('courseSelect');
        const assignCourseSelect = document.getElementById('assignCourseSelect');
        
        if (courseSelect) {
            courseSelect.innerHTML = '<option value="">Select Course</option>';
            courses.forEach(course => {
                const option = document.createElement('option');
                option.value = course.id;
                option.textContent = `${course.name} (${course.code})`;
                courseSelect.appendChild(option);
            });
            
            courseSelect.addEventListener('change', async () => {
                const sectionSelect = document.getElementById('sectionSelect');
                const loadBtn = document.getElementById('loadSectionBtn');
                
                if (!courseSelect.value) {
                    sectionSelect.innerHTML = '<option value="">Select Section</option>';
                    sectionSelect.disabled = true;
                    loadBtn.disabled = true;
                    return;
                }
                
                loadBtn.disabled = true;
                sectionSelect.disabled = true;
                sectionSelect.innerHTML = '<option value="">Loading...</option>';
                
                try {
                    const sectionsResponse = await fetch(`/api/courses/${courseSelect.value}/sections`);
                    const sections = await sectionsResponse.json();
                    
                    sectionSelect.innerHTML = '<option value="">Select Section</option>';
                    sections.forEach(section => {
                        const option = document.createElement('option');
                        option.value = section.id;
                        option.textContent = `${section.name} (${section.code || 'No code'})`;
                        sectionSelect.appendChild(option);
                    });
                    
                    sectionSelect.disabled = false;
                    
                    sectionSelect.addEventListener('change', () => {
                        loadBtn.disabled = !sectionSelect.value;
                    });
                    
                } catch (error) {
                    console.error('Error loading sections:', error);
                    sectionSelect.innerHTML = '<option value="">Error loading sections</option>';
                }
            });
        }
        
        if (assignCourseSelect) {
            assignCourseSelect.innerHTML = '<option value="">Select Course</option>';
            courses.forEach(course => {
                const option = document.createElement('option');
                option.value = course.id;
                option.textContent = `${course.name} (${course.code})`;
                assignCourseSelect.appendChild(option);
            });
            
            assignCourseSelect.addEventListener('change', async () => {
                const assignSectionSelect = document.getElementById('assignSectionSelect');
                
                if (!assignCourseSelect.value) {
                    assignSectionSelect.innerHTML = '<option value="">First select a course</option>';
                    assignSectionSelect.disabled = true;
                    return;
                }
                
                assignSectionSelect.disabled = true;
                assignSectionSelect.innerHTML = '<option value="">Loading sections...</option>';
                
                try {
                    const sectionsResponse = await fetch(`/api/courses/${assignCourseSelect.value}/sections`);
                    const sections = await sectionsResponse.json();
                    
                    assignSectionSelect.innerHTML = '<option value="">Select Section</option>';
                    sections.forEach(section => {
                        const option = document.createElement('option');
                        option.value = section.id;
                        option.textContent = `${section.name} (${section.code || 'No code'})`;
                        assignSectionSelect.appendChild(option);
                    });
                    
                    assignSectionSelect.disabled = false;
                    
                } catch (error) {
                    console.error('Error loading sections:', error);
                    assignSectionSelect.innerHTML = '<option value="">Error loading sections</option>';
                }
            });
        }
        
    } catch (error) {
        console.error('Error loading courses:', error);
    }
}

async function loadSectionDashboard() {
    const sectionSelect = document.getElementById('sectionSelect');
    const sectionId = sectionSelect?.value;
    
    if (!sectionId) {
        showToast('Please select a section first', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`/api/section/${sectionId}/dashboard`);
        
        if (!response.ok) {
            throw new Error('Failed to load section dashboard');
        }
        
        const data = await response.json();
        currentSectionData = data;
        displaySectionDashboard(data);
        
        switchView('sectionDashboard');
        
        showToast(`Loaded ${data.section.course_name} - ${data.section.name}`, 'success');
        
    } catch (error) {
        console.error('Error loading section dashboard:', error);
        showToast('Error loading section dashboard', 'error');
    } finally {
        hideLoading();
    }
}

function displaySectionDashboard(data) {
    const section = data.section;
    const stats = data.stats;
    
    const sectionTitle = document.getElementById('sectionTitle');
    if (sectionTitle) {
        sectionTitle.textContent = `${section.course_name} - ${section.name}`;
    }
    
    const sectionStudentCount = document.getElementById('sectionStudentCount');
    const sectionEasyCount = document.getElementById('sectionEasyCount');
    const sectionMediumCount = document.getElementById('sectionMediumCount');
    const sectionHardCount = document.getElementById('sectionHardCount');
    const sectionTotalCount = document.getElementById('sectionTotalCount');
    
    if (sectionStudentCount) sectionStudentCount.textContent = stats.total_students;
    if (sectionEasyCount) sectionEasyCount.textContent = stats.total_easy;
    if (sectionMediumCount) sectionMediumCount.textContent = stats.total_medium;
    if (sectionHardCount) sectionHardCount.textContent = stats.total_hard;
    if (sectionTotalCount) sectionTotalCount.textContent = stats.total_solved;
    
    const leaderboardContainer = document.getElementById('sectionLeaderboardTable');
    if (leaderboardContainer && data.leaderboard) {
        if (data.leaderboard.length === 0) {
            leaderboardContainer.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No students in this section yet. Use the "Assign Student" button to add students.</p></div>';
        } else {
            leaderboardContainer.innerHTML = data.leaderboard.map(student => {
                let rankClass = student.rank === 1 ? 'rank-1' : student.rank === 2 ? 'rank-2' : student.rank === 3 ? 'rank-3' : '';
                const total = student.stats.Easy + student.stats.Medium + student.stats.Hard;
                return `
                    <div class="leaderboard-item" onclick="viewStudentDetails('${student.roll}')">
                        <div class="leaderboard-rank ${rankClass}">#${student.rank}</div>
                        <div class="leaderboard-info">
                            <div class="leaderboard-name">${escapeHtml(student.name)}</div>
                            <div class="leaderboard-roll">${escapeHtml(student.roll)}</div>
                        </div>
                        <div class="leaderboard-scores">
                            <span class="easy">${student.stats.Easy}</span>
                            <span class="medium">${student.stats.Medium}</span>
                            <span class="hard">${student.stats.Hard}</span>
                        </div>
                        <div class="leaderboard-total">${total}</div>
                    </div>
                `;
            }).join('');
        }
    }
    
    const summaryDiv = document.getElementById('sectionSummary');
    if (summaryDiv) {
        summaryDiv.innerHTML = `
            <div class="summary-item">
                <span class="summary-label"><i class="fas fa-chart-line"></i> Total Hard Problems</span>
                <span class="summary-value">${stats.total_hard}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label"><i class="fas fa-chart-pie"></i> Easy:Medium:Hard Ratio</span>
                <span class="summary-value">${stats.total_easy}:${stats.total_medium}:${stats.total_hard}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label"><i class="fas fa-crown"></i> Top Performer</span>
                <span class="summary-value highlight">${data.leaderboard[0] ? escapeHtml(data.leaderboard[0].name) : 'N/A'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label"><i class="fas fa-exclamation-triangle"></i> Needs Improvement</span>
                <span class="summary-value">${data.leaderboard.filter(s => (s.stats.Easy + s.stats.Medium + s.stats.Hard) < 10).length} students</span>
            </div>
            <div class="progress-ring">
                <div class="progress-ring-fill" style="width: ${stats.total_students > 0 ? (data.leaderboard.filter(s => (s.stats.Easy + s.stats.Medium + s.stats.Hard) > 20).length / stats.total_students * 100) : 0}%"></div>
            </div>
        `;
    }
    
    const chartCtx = document.getElementById('sectionDifficultyChart');
    if (chartCtx) {
        if (sectionCharts.difficulty) sectionCharts.difficulty.destroy();
        
        sectionCharts.difficulty = new Chart(chartCtx, {
            type: 'doughnut',
            data: {
                labels: ['Easy', 'Medium', 'Hard'],
                datasets: [{
                    data: [stats.total_easy, stats.total_medium, stats.total_hard],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#f1f5f9', font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// ===============================
// SECTION ASSIGNMENT MANAGEMENT
// ===============================

function populateStudentSelect(students) {
    const assignStudentSelect = document.getElementById('assignStudentSelect');
    if (!assignStudentSelect) return;
    
    assignStudentSelect.innerHTML = '<option value="">Select Student</option>';
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.roll;
        option.textContent = `${student.name} (${student.roll})`;
        assignStudentSelect.appendChild(option);
    });
}

async function openAssignModal() {
    if (!window.allStudents) {
        await loadStudentsList();
    }
    openModal('assignSectionModal');
}

async function assignStudentToSection() {
    const studentRoll = document.getElementById('assignStudentSelect')?.value;
    const sectionId = document.getElementById('assignSectionSelect')?.value;
    
    if (!studentRoll) {
        showToast('Please select a student', 'warning');
        return;
    }
    
    if (!sectionId) {
        showToast('Please select a section', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/assign-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_roll: studentRoll,
                section_id: parseInt(sectionId)
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message, 'success');
            closeModal();
            
            document.getElementById('assignStudentSelect').value = '';
            document.getElementById('assignCourseSelect').value = '';
            document.getElementById('assignSectionSelect').innerHTML = '<option value="">First select a course</option>';
            document.getElementById('assignSectionSelect').disabled = true;
            
            const sectionSelect = document.getElementById('sectionSelect');
            if (sectionSelect && sectionSelect.value && document.getElementById('sectionDashboardView').classList.contains('active')) {
                loadSectionDashboard();
            }
        } else {
            showToast(data.error || 'Failed to assign student', 'error');
        }
    } catch (error) {
        console.error('Error assigning student:', error);
        showToast('Error assigning student', 'error');
    } finally {
        hideLoading();
    }
}

async function loadAssignmentsFilter() {
    try {
        const response = await fetch('/api/courses');
        const courses = await response.json();
        
        const filterSelect = document.getElementById('viewAssignmentsFilter');
        if (!filterSelect) return;
        
        filterSelect.innerHTML = '<option value="">All Sections</option>';
        
        for (const course of courses) {
            const sectionsResponse = await fetch(`/api/courses/${course.id}/sections`);
            const sections = await sectionsResponse.json();
            
            sections.forEach(section => {
                const option = document.createElement('option');
                option.value = section.id;
                option.textContent = `${course.name} - ${section.name}`;
                filterSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading filter:', error);
    }
}

async function openViewAssignmentsModal() {
    openModal('viewAssignmentsModal');
    await loadAllAssignments();
}

async function loadAllAssignments() {
    const filterValue = document.getElementById('viewAssignmentsFilter')?.value;
    const assignmentsList = document.getElementById('assignmentsList');
    
    if (!assignmentsList) return;
    
    assignmentsList.innerHTML = '<div class="empty-state">Loading assignments...</div>';
    
    try {
        const response = await fetch('/api/section-assignments');
        let assignments = await response.json();
        
        if (filterValue) {
            assignments = assignments.filter(a => a.section_id === parseInt(filterValue));
        }
        
        if (assignments.length === 0) {
            assignmentsList.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No students assigned to sections yet. Use the "Assign Student" button to add assignments.</p></div>';
            return;
        }
        
        assignmentsList.innerHTML = `
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th>Student Name</th>
                        <th>Roll Number</th>
                        <th>Course</th>
                        <th>Section</th>
                        <th>Assigned Date</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${assignments.map(assignment => `
                        <tr>
                            <td><strong>${escapeHtml(assignment.student_name)}</strong></td>
                            <td>${escapeHtml(assignment.student_roll)}</td>
                            <td>${escapeHtml(assignment.course_name)}</td>
                            <td>${escapeHtml(assignment.section_name)}</td>
                            <td>${new Date(assignment.assigned_at).toLocaleDateString()}</td>
                            <td><button onclick="unassignStudent('${assignment.student_roll}', ${assignment.section_id})" class="icon-btn" style="background: rgba(239, 68, 68, 0.2);"><i class="fas fa-trash"></i></button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        console.error('Error loading assignments:', error);
        assignmentsList.innerHTML = '<div class="empty-state">Error loading assignments</div>';
    }
}

async function unassignStudent(studentRoll, sectionId) {
    if (!confirm(`Remove student ${studentRoll} from this section?`)) return;
    
    showLoading();
    
    try {
        const response = await fetch('/api/unassign-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_roll: studentRoll,
                section_id: sectionId
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message, 'success');
            await loadAllAssignments();
            
            const sectionSelect = document.getElementById('sectionSelect');
            if (sectionSelect && sectionSelect.value && document.getElementById('sectionDashboardView').classList.contains('active')) {
                loadSectionDashboard();
            }
        } else {
            showToast(data.error || 'Failed to unassign student', 'error');
        }
    } catch (error) {
        console.error('Error unassigning student:', error);
        showToast('Error unassigning student', 'error');
    } finally {
        hideLoading();
    }
}

// ===============================
// 🤖 AI FEATURES
// ===============================

async function loadAIInsights() {
    try {
        const response = await fetch('/api/ai/insights');
        const data = await response.json();
        
        const insightsList = document.getElementById('aiInsightsList');
        if (insightsList && data.insights && data.insights.length > 0) {
            insightsList.innerHTML = data.insights.map(insight => `
                <div class="ai-insight-card ${insight.type}">
                    <div class="insight-icon">${insight.icon}</div>
                    <div class="insight-content">
                        <div class="insight-title">${insight.title}</div>
                        <div class="insight-message">${insight.message}</div>
                    </div>
                </div>
            `).join('');
        } else if (insightsList) {
            insightsList.innerHTML = '<div class="ai-insight-card">No insights available yet. Add more student data!</div>';
        }
    } catch (error) {
        console.error('Error loading AI insights:', error);
    }
}

async function loadPerformancePredictions() {
    try {
        const response = await fetch('/api/ai/predict-performance');
        const data = await response.json();
        
        const aiPredictionSpan = document.getElementById('aiPrediction');
        if (aiPredictionSpan && data.predictions && data.predictions.length > 0) {
            const avgGrowth = data.predictions.reduce((sum, p) => sum + p.predicted_1month, 0) / data.predictions.length;
            aiPredictionSpan.textContent = `${Math.round(avgGrowth)} problems`;
        }
    } catch (error) {
        console.error('Error loading predictions:', error);
    }
}

async function openAIChat() {
    openModal('aiChatModal');
    
    const sendBtn = document.getElementById('sendChatBtn');
    const chatInput = document.getElementById('chatInput');
    
    const sendMessage = async () => {
        const query = chatInput.value.trim();
        if (!query) return;
        
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML += `
            <div class="chat-message user">
                <i class="fas fa-user"></i>
                <div class="message-text">${escapeHtml(query)}</div>
            </div>
        `;
        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        chatMessages.innerHTML += `
            <div class="chat-message bot typing">
                <i class="fas fa-robot"></i>
                <div class="message-text">Typing...</div>
            </div>
        `;
        
        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query })
            });
            const data = await response.json();
            
            document.querySelector('.chat-message.typing')?.remove();
            
            chatMessages.innerHTML += `
                <div class="chat-message bot">
                    <i class="fas fa-robot"></i>
                    <div class="message-text">${escapeHtml(data.response)}</div>
                </div>
            `;
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
        } catch (error) {
            document.querySelector('.chat-message.typing')?.remove();
            chatMessages.innerHTML += `
                <div class="chat-message bot error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="message-text">Sorry, I encountered an error. Please try again.</div>
                </div>
            `;
        }
    };
    
    sendBtn.onclick = sendMessage;
    chatInput.onkeypress = (e) => {
        if (e.key === 'Enter') sendMessage();
    };
}