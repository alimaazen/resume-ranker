// ===== STATE MANAGEMENT =====
let candidates = [];
let filteredCandidates = [];
let currentView = 'grid';
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `${window.location.protocol}//${window.location.host}/api`
    : '/api';

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeSliders();
    updateStats();
    checkServerStatus();
});

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Upload area
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleFileDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // Search and filters
    document.getElementById('searchInput').addEventListener('input', filterCandidates);
    document.getElementById('filterScore').addEventListener('change', filterCandidates);
    document.getElementById('filterExperience').addEventListener('change', filterCandidates);

    // View controls
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('href');
            document.querySelector(target).scrollIntoView({ behavior: 'smooth' });

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

// ===== SLIDER INITIALIZATION =====
function initializeSliders() {
    const sliders = document.querySelectorAll('.slider');
    sliders.forEach(slider => {
        const valueDisplay = slider.nextElementSibling;

        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value + '%';
            updateRankings();
        });
    });
}

// ===== SERVER STATUS CHECK =====
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        const data = await response.json();
        console.log('✅ Server connected:', data);

        // Check Ollama status
        const ollamaResponse = await fetch(`${API_BASE_URL}/check-ollama`);
        const ollamaData = await ollamaResponse.json();

        if (!ollamaData.available && !ollamaData.groqAvailable) {
            console.warn('⚠️ No LLM providers available. Using fallback analysis.');
            showToast('⚠️ LLaMA unavailable - using basic analysis', 'warning');
        } else {
            if (ollamaData.groqAvailable) {
                console.log('✅ Groq Cloud ready');
            }
            if (ollamaData.available && ollamaData.modelAvailable) {
                console.log('✅ Ollama Local ready:', ollamaData.selectedModel);
            } else if (ollamaData.available && !ollamaData.modelAvailable) {
                console.warn(`⚠️ Ollama model ${ollamaData.selectedModel} not found.`);
            }
        }
    } catch (error) {
        console.error('❌ Server not running:', error);
        showToast('❌ Server not connected! Run: npm start', 'error');
    }
}

// ===== FILE HANDLING =====
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    processFiles(files);
}

async function processFiles(files) {
    if (files.length === 0) return;

    // Validate file types
    const validFiles = files.filter(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        return ['pdf', 'doc', 'docx', 'txt'].includes(ext);
    });

    if (validFiles.length === 0) {
        showToast('❌ Please upload PDF, DOC, DOCX, or TXT files', 'error');
        return;
    }

    if (validFiles.length !== files.length) {
        showToast(`⚠️ ${files.length - validFiles.length} invalid file(s) skipped`, 'warning');
    }

    showToast(`📤 Uploading ${validFiles.length} resume(s)...`, 'info');

    try {
        // Create FormData
        const formData = new FormData();
        validFiles.forEach(file => {
            formData.append('resumes', file);
        });

        // Get current weights
        const weights = getWeights();
        formData.append('experienceWeight', weights.experience);
        formData.append('skillsWeight', weights.skills);
        formData.append('educationWeight', weights.education);
        formData.append('keywordsWeight', weights.keywords);

        // Upload to server
        try {
            const response = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Server error: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Server response:', result);

            if (result.success && result.candidates) {
                const validCandidates = result.candidates.filter(c => !c.error);
                if (validCandidates.length > 0) {
                    candidates.push(...validCandidates);
                    filteredCandidates = [...candidates];
                    renderCandidates();
                    updateStats();
                    updateAnalytics();
                    showToast(`✅ Successfully analyzed ${validCandidates.length} resume(s)!`, 'success');

                    setTimeout(() => {
                        document.getElementById('rankings').scrollIntoView({ behavior: 'smooth' });
                    }, 500);
                    return;
                }
            }
            throw new Error('Invalid server response');

        } catch (serverError) {
            console.warn('📡 Server unreachable or error occurred, using local fallback:', serverError.message);
            showToast('⚠️ Server offline - Using local basic analysis', 'warning');

            // Local Fallback Logic
            for (const file of validFiles) {
                const text = await readFileAsText(file);
                const weights = getWeights();
                const analysis = localFrontendAnalysis(text, weights, file.name);
                candidates.push(analysis);
            }

            filteredCandidates = [...candidates];
            renderCandidates();
            updateStats();
            updateAnalytics();

            setTimeout(() => {
                document.getElementById('rankings').scrollIntoView({ behavior: 'smooth' });
            }, 500);
        }

    } catch (error) {
        console.error('Upload error:', error);
        showToast(`❌ Error: ${error.message}`, 'error');
    }

    // Clear file input
    document.getElementById('fileInput').value = '';
}

// ===== WEIGHTS =====
function getWeights() {
    return {
        experience: parseInt(document.getElementById('experienceWeight').value),
        skills: parseInt(document.getElementById('skillsWeight').value),
        education: parseInt(document.getElementById('educationWeight').value),
        keywords: parseInt(document.getElementById('keywordsWeight').value)
    };
}

// ===== RENDERING =====
function renderCandidates() {
    const container = document.getElementById('candidatesContainer');

    if (filteredCandidates.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">
                <i class="fas fa-inbox" style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                <h3>No candidates found</h3>
                <p>Upload resumes or adjust your filters to see candidates</p>
            </div>
        `;
        return;
    }

    // Sort by match score
    const sorted = [...filteredCandidates].sort((a, b) => b.matchScore - a.matchScore);

    container.innerHTML = sorted.map((candidate, index) => `
        <div class="candidate-card" onclick="showCandidateDetail(${candidate.id})" style="animation-delay: ${index * 0.1}s">
            <div class="candidate-header">
                <div class="candidate-info">
                    <h3>${candidate.name}</h3>
                    <p class="candidate-title">${candidate.title}</p>
                </div>
                <div class="provider-badge provider-${candidate.provider || 'fallback'}">
                    <i class="fas fa-${candidate.provider === 'groq' ? 'bolt' : candidate.provider === 'ollama' ? 'brain' : 'info-circle'}"></i>
                    ${candidate.provider === 'groq' ? 'Groq Cloud' : candidate.provider === 'ollama' ? 'Ollama Local' : 'Basic'}
                </div>
            </div>
            
            <div class="score-section">
                <div class="score-label">
                    <span>Match Score</span>
                    <span class="score-value">${candidate.matchScore}%</span>
                </div>
                <div class="score-bar">
                    <div class="score-fill" style="width: ${candidate.matchScore}%"></div>
                </div>
            </div>

            <div class="candidate-details">
                <div class="detail-row">
                    <i class="fas fa-briefcase"></i>
                    <span>${candidate.experience} years experience</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${candidate.location}</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-envelope"></i>
                    <span>${candidate.email}</span>
                </div>
            </div>

            <div class="skills-tags">
                ${candidate.skills.slice(0, 5).map(skill => `
                    <span class="skill-tag">${skill}</span>
                `).join('')}
                ${candidate.skills.length > 5 ? `<span class="skill-tag">+${candidate.skills.length - 5}</span>` : ''}
            </div>
        </div>
    `).join('');
}

// ===== FILTERING =====
function filterCandidates() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const scoreFilter = document.getElementById('filterScore').value;
    const expFilter = document.getElementById('filterExperience').value;

    filteredCandidates = candidates.filter(candidate => {
        // Search filter
        const matchesSearch = !searchTerm ||
            candidate.name.toLowerCase().includes(searchTerm) ||
            candidate.title.toLowerCase().includes(searchTerm) ||
            candidate.skills.some(skill => skill.toLowerCase().includes(searchTerm));

        // Score filter
        let matchesScore = true;
        if (scoreFilter === 'high') matchesScore = candidate.matchScore >= 80;
        else if (scoreFilter === 'medium') matchesScore = candidate.matchScore >= 60 && candidate.matchScore < 80;
        else if (scoreFilter === 'low') matchesScore = candidate.matchScore < 60;

        // Experience filter
        let matchesExp = true;
        if (expFilter === 'senior') matchesExp = candidate.experience >= 5;
        else if (expFilter === 'mid') matchesExp = candidate.experience >= 2 && candidate.experience < 5;
        else if (expFilter === 'junior') matchesExp = candidate.experience < 2;

        return matchesSearch && matchesScore && matchesExp;
    });

    renderCandidates();
    updateStats();
    updateAnalytics();
}


// ===== VIEW SWITCHING =====
function switchView(view) {
    currentView = view;
    const container = document.getElementById('candidatesContainer');

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    if (view === 'list') {
        container.style.gridTemplateColumns = '1fr';
    } else {
        container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(350px, 1fr))';
    }
}

// ===== MODAL =====
function showCandidateDetail(id) {
    const candidate = candidates.find(c => c.id === id);
    if (!candidate) return;

    const modal = document.getElementById('candidateModal');
    const modalBody = document.getElementById('modalBody');

    modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-avatar">${candidate.name.split(' ').map(n => n[0]).join('')}</div>
            <div class="modal-info">
                <h2>${candidate.name}</h2>
                <p class="modal-subtitle">${candidate.title}</p>
                <div class="provider-badge provider-${candidate.provider || 'fallback'}" style="position: static; display: inline-flex; margin-top: 0.5rem;">
                    <i class="fas fa-${candidate.provider === 'groq' ? 'bolt' : candidate.provider === 'ollama' ? 'brain' : 'info-circle'}"></i>
                    Analyzed by ${candidate.provider === 'groq' ? 'Groq LLaMA Cloud' : candidate.provider === 'ollama' ? 'Ollama LLaMA Local' : 'Basic Analysis'}
                </div>
            </div>
        </div>

        <div class="modal-section">
            <h3><i class="fas fa-chart-bar"></i> Score Breakdown</h3>
            <div style="display: grid; gap: 1rem; margin-top: 1rem;">
                <div>
                    <div class="score-label">
                        <span>Overall Match</span>
                        <span class="score-value">${candidate.matchScore}%</span>
                    </div>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${candidate.matchScore}%"></div>
                    </div>
                </div>
                <div>
                    <div class="score-label">
                        <span>Experience</span>
                        <span class="score-value">${candidate.experienceScore}%</span>
                    </div>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${candidate.experienceScore}%"></div>
                    </div>
                </div>
                <div>
                    <div class="score-label">
                        <span>Skills Match</span>
                        <span class="score-value">${candidate.skillsScore}%</span>
                    </div>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${candidate.skillsScore}%"></div>
                    </div>
                </div>
                <div>
                    <div class="score-label">
                        <span>Education</span>
                        <span class="score-value">${candidate.educationScore}%</span>
                    </div>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${candidate.educationScore}%"></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal-section">
            <h3><i class="fas fa-user"></i> Professional Summary</h3>
            <p>${candidate.summary}</p>
        </div>

        <div class="modal-section">
            <h3><i class="fas fa-briefcase"></i> Experience</h3>
            <p>${candidate.experience} years of professional experience</p>
        </div>

        <div class="modal-section">
            <h3><i class="fas fa-code"></i> Skills</h3>
            <div class="skills-tags">
                ${candidate.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
            </div>
        </div>

        <div class="modal-section">
            <h3><i class="fas fa-graduation-cap"></i> Education</h3>
            <p>${candidate.education}</p>
        </div>

        <div class="modal-section">
            <h3><i class="fas fa-trophy"></i> Key Achievements</h3>
            <ul>
                ${candidate.achievements.map(achievement => `<li>${achievement}</li>`).join('')}
            </ul>
        </div>

        <div class="modal-section">
            <h3><i class="fas fa-envelope"></i> Contact Information</h3>
            <div class="candidate-details">
                <div class="detail-row">
                    <i class="fas fa-envelope"></i>
                    <span>${candidate.email}</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-phone"></i>
                    <span>${candidate.phone}</span>
                </div>
                <div class="detail-row">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${candidate.location}</span>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('candidateModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Close modal on outside click
document.getElementById('candidateModal').addEventListener('click', (e) => {
    if (e.target.id === 'candidateModal') {
        closeModal();
    }
});

// ===== STATS UPDATE =====
function updateStats() {
    const totalResumes = candidates.length;
    const avgScore = candidates.length > 0
        ? Math.round(candidates.reduce((sum, c) => sum + c.matchScore, 0) / candidates.length)
        : 0;
    const topCandidates = candidates.filter(c => c.matchScore >= 85).length;

    const totalElem = document.getElementById('totalResumes');
    const avgElem = document.getElementById('avgScore');
    const topElem = document.getElementById('topCandidates');

    const currentTotal = parseInt(totalElem.textContent) || 0;
    const currentAvg = parseInt(avgElem.textContent) || 0;
    const currentTop = parseInt(topElem.textContent) || 0;

    animateValue('totalResumes', currentTotal, totalResumes, 800);
    animateValue('avgScore', currentAvg, avgScore, 800);
    animateValue('topCandidates', currentTop, topCandidates, 800);
}


function animateValue(id, start, end, duration) {
    const element = document.getElementById(id);
    if (!element) return;

    if (start === end) {
        element.textContent = Math.round(end);
        return;
    }

    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    // Clear existing timer if any
    if (element.dataset.timerId) {
        clearInterval(parseInt(element.dataset.timerId));
    }

    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
            delete element.dataset.timerId;
        }
        element.textContent = Math.round(current);
    }, 16);

    element.dataset.timerId = timer;
}


// ===== ANALYTICS =====
function updateAnalytics() {
    updateTopSkills();
    updateExperienceChart();
    updateScoreDistribution();
}

function updateTopSkills() {
    const skillsCount = {};
    candidates.forEach(candidate => {
        candidate.skills.forEach(skill => {
            skillsCount[skill] = (skillsCount[skill] || 0) + 1;
        });
    });

    const sortedSkills = Object.entries(skillsCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const maxCount = sortedSkills[0]?.[1] || 1;
    const skillsList = document.getElementById('topSkillsList');

    skillsList.innerHTML = sortedSkills.map(([skill, count]) => `
        <div class="skill-item">
            <span class="skill-name">${skill}</span>
            <div class="skill-bar-container">
                <div class="skill-bar-fill" style="width: ${(count / maxCount) * 100}%"></div>
            </div>
            <span class="skill-count">${count}</span>
        </div>
    `).join('');
}

function updateExperienceChart() {
    const junior = candidates.filter(c => c.experience < 2).length;
    const mid = candidates.filter(c => c.experience >= 2 && c.experience < 5).length;
    const senior = candidates.filter(c => c.experience >= 5).length;

    const total = candidates.length || 1;
    const chart = document.getElementById('experienceChart');

    chart.innerHTML = `
        <div class="exp-item">
            <span class="exp-label">Junior (0-2y)</span>
            <div class="exp-bar" style="width: ${(junior / total) * 100}%">
                ${junior}
            </div>
        </div>
        <div class="exp-item">
            <span class="exp-label">Mid (2-5y)</span>
            <div class="exp-bar" style="width: ${(mid / total) * 100}%">
                ${mid}
            </div>
        </div>
        <div class="exp-item">
            <span class="exp-label">Senior (5+y)</span>
            <div class="exp-bar" style="width: ${(senior / total) * 100}%">
                ${senior}
            </div>
        </div>
    `;
}

function updateScoreDistribution() {
    const canvas = document.getElementById('distributionCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const ranges = [
        { label: '0-59', count: candidates.filter(c => c.matchScore < 60).length },
        { label: '60-69', count: candidates.filter(c => c.matchScore >= 60 && c.matchScore < 70).length },
        { label: '70-79', count: candidates.filter(c => c.matchScore >= 70 && c.matchScore < 80).length },
        { label: '80-89', count: candidates.filter(c => c.matchScore >= 80 && c.matchScore < 90).length },
        { label: '90-100', count: candidates.filter(c => c.matchScore >= 90).length }
    ];

    const maxCount = Math.max(...ranges.map(r => r.count), 1);
    const barWidth = canvas.width / ranges.length;
    const chartHeight = canvas.height - 40;

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'center';

    ranges.forEach((range, index) => {
        const barHeight = (range.count / maxCount) * chartHeight;
        const x = index * barWidth;
        const y = canvas.height - barHeight - 30;

        // Gradient bar
        const gradient = ctx.createLinearGradient(0, y, 0, canvas.height - 30);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');

        ctx.fillStyle = gradient;
        ctx.fillRect(x + 10, y, barWidth - 20, barHeight);

        // Label
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(range.label, x + barWidth / 2, canvas.height - 10);

        // Count
        if (range.count > 0) {
            ctx.fillStyle = '#f1f5f9';
            ctx.fillText(range.count, x + barWidth / 2, y - 5);
        }
    });
}

// ===== RANKINGS UPDATE =====
function updateRankings() {
    candidates.forEach(candidate => {
        const weights = getWeights();
        candidate.matchScore = Math.round(
            (candidate.experienceScore * weights.experience / 100) +
            (candidate.skillsScore * weights.skills / 100) +
            (candidate.educationScore * weights.education / 100) +
            (candidate.keywordsScore * weights.keywords / 100)
        );
    });

    filterCandidates();
    updateStats();
    updateAnalytics();
}

// ===== UTILITY FUNCTIONS =====
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const icon = toast.querySelector('i');

    // Update icon based on type
    if (type === 'error') {
        icon.className = 'fas fa-times-circle';
        toast.style.background = '#ef4444';
    } else if (type === 'warning') {
        icon.className = 'fas fa-exclamation-triangle';
        toast.style.background = '#f59e0b';
    } else if (type === 'info') {
        icon.className = 'fas fa-info-circle';
        toast.style.background = '#3b82f6';
    } else {
        icon.className = 'fas fa-check-circle';
        toast.style.background = '#10b981';
    }

    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function scrollToUpload() {
    document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
}

// ===== DEMO DATA =====
function loadDemoData() {
    showToast('📊 Loading demo data...', 'info');

    // Generate demo candidates with realistic data
    const demoCount = 8;
    for (let i = 0; i < demoCount; i++) {
        const candidate = generateDemoCandidate(i);
        candidates.push(candidate);
    }

    filteredCandidates = [...candidates];
    renderCandidates();
    updateStats();
    updateAnalytics();
    showToast(`✅ Loaded ${demoCount} demo candidates!`, 'success');

    setTimeout(() => {
        document.getElementById('rankings').scrollIntoView({ behavior: 'smooth' });
    }, 500);
}

function generateDemoCandidate(index) {
    const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Drew'];
    const lastNames = ['Chen', 'Kumar', 'Smith', 'Garcia', 'Johnson', 'Williams', 'Brown', 'Lee'];
    const titles = [
        'Senior Software Engineer', 'Full Stack Developer', 'Frontend Developer',
        'Backend Engineer', 'DevOps Engineer', 'Data Scientist',
        'Machine Learning Engineer', 'Cloud Architect'
    ];
    const locations = [
        'San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX',
        'Boston, MA', 'Denver, CO', 'Chicago, IL', 'Los Angeles, CA'
    ];

    const skillSets = [
        ['JavaScript', 'React', 'Node.js', 'MongoDB', 'AWS', 'Docker'],
        ['Python', 'Django', 'PostgreSQL', 'Redis', 'Kubernetes', 'CI/CD'],
        ['Java', 'Spring Boot', 'MySQL', 'Azure', 'Microservices', 'Git'],
        ['TypeScript', 'Angular', 'GraphQL', 'Firebase', 'GCP', 'Jenkins'],
        ['Go', 'Kafka', 'Elasticsearch', 'Terraform', 'Linux', 'Prometheus'],
        ['Python', 'TensorFlow', 'PyTorch', 'Pandas', 'SQL', 'Jupyter'],
        ['C#', '.NET', 'Azure', 'SQL Server', 'Entity Framework', 'REST APIs'],
        ['Ruby', 'Rails', 'PostgreSQL', 'Heroku', 'RSpec', 'Sidekiq']
    ];

    const name = `${firstNames[index]} ${lastNames[index]}`;
    const experience = Math.floor(Math.random() * 10) + 1;
    const skills = skillSets[index];

    const experienceScore = Math.min(experience * 10 + Math.random() * 20, 100);
    const skillsScore = 70 + Math.random() * 30;
    const educationScore = 75 + Math.random() * 25;
    const keywordsScore = 65 + Math.random() * 35;

    const weights = getWeights();
    const matchScore = Math.round(
        (experienceScore * weights.experience / 100) +
        (skillsScore * weights.skills / 100) +
        (educationScore * weights.education / 100) +
        (keywordsScore * weights.keywords / 100)
    );

    return {
        id: Date.now() + index,
        name: name,
        title: titles[index],
        email: `${firstNames[index].toLowerCase()}.${lastNames[index].toLowerCase()}@email.com`,
        phone: `+1 (${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
        location: locations[index],
        experience: experience,
        skills: skills,
        education: Math.random() > 0.5 ? "Master's in Computer Science" : "Bachelor's in Computer Science",
        matchScore: matchScore,
        experienceScore: Math.round(experienceScore),
        skillsScore: Math.round(skillsScore),
        educationScore: Math.round(educationScore),
        keywordsScore: Math.round(keywordsScore),
        summary: `${name} is an experienced ${titles[index].toLowerCase()} with ${experience} years of expertise. Proficient in ${skills.slice(0, 3).join(', ')}, with a proven track record of delivering high-quality solutions.`,
        achievements: [
            'Led cross-functional team in successful product launch',
            'Improved system performance and reduced costs',
            'Implemented modern development practices',
            'Mentored junior developers and conducted code reviews'
        ],
        certifications: Math.random() > 0.5 ? ['AWS Certified', 'Agile Certified'] : []
    };
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// ===== RESIZE HANDLER =====
window.addEventListener('resize', () => {
    if (candidates.length > 0) {
        updateScoreDistribution();
    }
});
// ===== LOCAL FALLBACK HELPERS =====
async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function localFrontendAnalysis(resumeText, weights, filename) {
    console.log('Performing local frontend analysis...');

    const emailMatch = resumeText.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = resumeText.match(/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

    const commonSkills = [
        'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'AWS', 'Docker', 'Git'
    ];

    const foundSkills = commonSkills.filter(skill =>
        resumeText.toLowerCase().includes(skill.toLowerCase())
    );

    const experience = 3; // Static estimate for local
    const experienceScore = 70;
    const skillsScore = Math.min(foundSkills.length * 15, 100);
    const educationScore = 80;
    const keywordsScore = 75;

    const matchScore = Math.round(
        (experienceScore * weights.experience / 100) +
        (skillsScore * weights.skills / 100) +
        (educationScore * weights.education / 100) +
        (keywordsScore * weights.keywords / 100)
    );

    return {
        id: Date.now() + Math.random(),
        provider: 'fallback',
        name: filename.split('.')[0],
        title: "Candidate (Local Analysis)",
        email: emailMatch ? emailMatch[0] : "not.found@email.com",
        phone: phoneMatch ? phoneMatch[0] : "N/A",
        location: "Local analysis",
        experience: experience,
        skills: foundSkills.length > 0 ? foundSkills : ['General Skills'],
        education: "Analyzed locally",
        experienceScore,
        skillsScore,
        educationScore,
        keywordsScore,
        matchScore,
        summary: "This candidate was analyzed using basic local logic because the server was unavailable.",
        achievements: ["Analyzed via frontend fallback"],
        certifications: []
    };
}
