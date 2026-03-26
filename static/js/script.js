// Global variables
let currentStudentData = null;
let charts = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadStudentsList();
    loadLeaderboard();
    loadBatchAnalytics();
    updateStudentCount();
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
    
    if (addStudentBtn) addStudentBtn.addEventListener('click', () => openModal('addStudentModal'));
    if (uploadFileBtn) uploadFileBtn.addEventListener('click', () => openModal('uploadModal'));
    if (exportDataBtn) exportDataBtn.addEventListener('click', () => exportData());
    if (confirmUpload) confirmUpload.addEventListener('click', () => uploadFile());
    
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
    
    // Update student info card
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
    
    // Update stats circles
    const easyValue = document.getElementById('easyValue');
    const mediumValue = document.getElementById('mediumValue');
    const hardValue = document.getElementById('hardValue');
    const totalValue = document.getElementById('totalValue');
    
    if (easyValue) easyValue.textContent = stats.Easy || 0;
    if (mediumValue) mediumValue.textContent = stats.Medium || 0;
    if (hardValue) hardValue.textContent = stats.Hard || 0;
    if (totalValue) totalValue.textContent = stats.All || 0;
    
    // Update weak topics
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
    
    // Show stats panel, hide empty panel
    const statsPanel = document.getElementById('statsPanel');
    const emptyRightPanel = document.getElementById('emptyRightPanel');
    
    if (statsPanel) statsPanel.style.display = 'flex';
    if (emptyRightPanel) emptyRightPanel.style.display = 'none';
    
    // Create or update chart
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
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function displayBatchAnalytics(analytics) {
    const batch = analytics['Your Batch'];
    if (!batch) return;
    
    // Stats cards
    const analyticsStats = document.getElementById('analyticsStats');
    if (analyticsStats) {
        analyticsStats.innerHTML = `
            <div class="analytics-card"><h3>${batch.count}</h3><p>Total Students</p></div>
            <div class="analytics-card"><h3>${batch.total_all}</h3><p>Problems Solved</p></div>
            <div class="analytics-card"><h3>${Math.round(batch.avg_total)}</h3><p>Avg per Student</p></div>
            <div class="analytics-card"><h3>${escapeHtml(batch.top_performer)}</h3><p>Top Performer</p></div>
        `;
    }
    
    // Bar chart
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
    
    // Doughnut chart
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
    
    // Top performers
    const topPerformers = document.getElementById('topPerformers');
    if (topPerformers) {
        const top3 = batch.students.slice(0, 3);
        topPerformers.innerHTML = `
            <h3><i class="fas fa-crown"></i> Top Performers</h3>
            <div class="performer-list">
                ${top3.map((s, i) => `<div class="performer"><span class="rank">${i + 1}</span> ${escapeHtml(s)}</div>`).join('')}
            </div>
        `;
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
    
    // Parse LeetCode IDs
    const leetcodeIds = leetcodeIdsStr.split(',').map(id => id.trim()).filter(id => id);
    
    if (leetcodeIds.length === 0) {
        showToast('Please enter at least one valid LeetCode username', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/student', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                roll: roll, 
                name: name, 
                leetcode_ids: leetcodeIds 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(data.message || 'Student added successfully!', 'success');
            closeModal();
            
            // Reset form
            document.getElementById('addStudentForm')?.reset();
            
            // Refresh all data
            await loadStudentsList();
            await loadLeaderboard();
            await loadBatchAnalytics();
            await updateStudentCount();
            
            // Switch to students view to show the new student
            switchView('students');
            
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