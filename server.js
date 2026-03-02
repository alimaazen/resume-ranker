const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const PREFER_GROQ = process.env.PREFER_GROQ === 'true';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Configure multer for file uploads
const storage = multer.memoryStorage();


const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.'));
        }
    }
});

// ===== FILE PARSING FUNCTIONS =====

async function extractTextFromPDF(fileBuffer) {
    try {
        const data = await pdfParse(fileBuffer);
        return data.text;
    } catch (error) {
        console.error('PDF parsing error:', error);
        throw new Error('Failed to parse PDF file');
    }
}

async function extractTextFromDOCX(fileBuffer) {
    try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value;
    } catch (error) {
        console.error('DOCX parsing error:', error);
        throw new Error('Failed to parse DOCX file');
    }
}

async function extractTextFromTXT(fileBuffer) {
    try {
        return fileBuffer.toString('utf-8');
    } catch (error) {
        console.error('TXT parsing error:', error);
        throw new Error('Failed to parse TXT file');
    }
}

async function extractTextFromResume(file) {
    const ext = path.extname(file.originalname).toLowerCase();

    switch (ext) {
        case '.pdf':
            return await extractTextFromPDF(file.buffer);
        case '.docx':
        case '.doc':
            return await extractTextFromDOCX(file.buffer);
        case '.txt':
            return await extractTextFromTXT(file.buffer);
        default:
            throw new Error('Unsupported file type');
    }
}

// ===== LLaMA INTEGRATION =====

// ===== LLM INTEGRATION =====

const RESUME_ANALYSIS_PROMPT = (resumeText, weights) => `
You are an expert HR recruiter and professional resume analyzer. 
Analyze the following resume text and provide a structured assessment.

RESUME TEXT:
${resumeText}

RANKING CRITERIA WEIGHTS:
- Experience: ${weights.experience}%
- Skills: ${weights.skills}%
- Education: ${weights.education}%
- Keywords: ${weights.keywords}%

INSTRUCTIONS:
1. Extract candidate contact info and professional details.
2. Evaluate the resume based on the ranking criteria weights.
3. Provide scores (0-100) for Experience, Skills, Education, and Keywords.
4. Summarize achievements and list technical/soft skills.
5. Return ONLY a valid JSON object.

REQUIRED JSON STRUCTURE:
{
  "name": "Full Name",
  "title": "Current Job Title or Main Role",
  "email": "email@example.com",
  "phone": "Phone Number",
  "location": "City, State/Country",
  "experience": number (total years of experience as an integer),
  "skills": ["Skill 1", "Skill 2", ...],
  "education": "Highest Degree - Major - Institution",
  "experienceScore": number (0-100),
  "skillsScore": number (0-100),
  "educationScore": number (0-100),
  "keywordsScore": number (0-100),
  "summary": "Concise 2-sentence professional summary",
  "achievements": ["Achievement 1", "Achievement 2", ...],
  "certifications": ["Cert 1", "Cert 2", ...]
}
`;

async function analyzeWithOllama(resumeText, weights) {
    console.log('Using Ollama (Local) for analysis...');
    try {
        const response = await axios.post(`${OLLAMA_HOST}/api/generate`, {
            model: OLLAMA_MODEL,
            prompt: RESUME_ANALYSIS_PROMPT(resumeText, weights),
            stream: false,
            format: 'json',
            options: {
                temperature: 0.1, // Lower temperature for more consistent JSON
                num_predict: 2048
            }
        }, { timeout: 120000 });

        const analysis = JSON.parse(response.data.response);
        return { ...analysis, provider: 'ollama' };
    } catch (error) {
        console.error('Ollama analysis error:', error.message);
        throw error;
    }
}

async function analyzeWithGroq(resumeText, weights) {
    if (!GROQ_API_KEY) {
        throw new Error('Groq API Key not configured');
    }

    console.log('Using Groq (Cloud) for analysis...');
    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: GROQ_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that analyzes resumes and returns valid JSON.'
                },
                {
                    role: 'user',
                    content: RESUME_ANALYSIS_PROMPT(resumeText, weights)
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const content = response.data.choices[0].message.content;
        const analysis = JSON.parse(content);
        return { ...analysis, provider: 'groq' };
    } catch (error) {
        console.error('Groq analysis error:', error.message);
        throw error;
    }
}

async function analyzeResumeWithLLaMA(resumeText, weights) {
    try {
        let analysis;

        if (PREFER_GROQ && GROQ_API_KEY) {
            try {
                analysis = await analyzeWithGroq(resumeText, weights);
            } catch (e) {
                if (require.main === module) {
                    console.warn('Groq failed, trying Ollama locally...');
                    analysis = await analyzeWithOllama(resumeText, weights);
                } else {
                    console.warn('Groq failed on Netlify, falling back to basic analysis...');
                    throw e; // This will hit the outer catch and trigger fallbackAnalysis
                }
            }
        } else {
            try {
                analysis = await analyzeWithOllama(resumeText, weights);
            } catch (e) {
                if (GROQ_API_KEY) {
                    console.warn('Ollama failed, trying Groq...');
                    analysis = await analyzeWithGroq(resumeText, weights);
                } else {
                    throw e;
                }
            }
        }

        // Calculate weighted match score
        const matchScore = Math.round(
            (analysis.experienceScore * weights.experience / 100) +
            (analysis.skillsScore * weights.skills / 100) +
            (analysis.educationScore * weights.education / 100) +
            (analysis.keywordsScore * weights.keywords / 100)
        );

        return {
            ...analysis,
            matchScore,
            id: Date.now() + Math.random()
        };
    } catch (error) {
        console.error('AI Analysis failed, falling back to basic extraction:', error.message);
        return fallbackAnalysis(resumeText, weights);
    }
}

// Fallback analysis if LLaMA is unavailable
function fallbackAnalysis(resumeText, weights) {
    console.log('Using fallback analysis...');

    // Basic text extraction
    const emailMatch = resumeText.match(/[\w.-]+@[\w.-]+\.\w+/);
    const phoneMatch = resumeText.match(/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

    // Extract skills (common tech keywords)
    const commonSkills = [
        'JavaScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'PHP', 'Go', 'Rust', 'TypeScript',
        'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring',
        'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch',
        'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'CI/CD', 'Git',
        'Machine Learning', 'AI', 'Deep Learning', 'TensorFlow', 'PyTorch'
    ];

    const foundSkills = commonSkills.filter(skill =>
        resumeText.toLowerCase().includes(skill.toLowerCase())
    );

    // Estimate experience (look for year patterns)
    const yearMatches = resumeText.match(/\d{4}/g) || [];
    const years = yearMatches.map(y => parseInt(y)).filter(y => y >= 1990 && y <= 2026);
    const experience = years.length > 0 ? Math.min(Math.floor((2026 - Math.min(...years)) * 0.7), 15) : 3;

    // Generate scores
    const experienceScore = Math.min(experience * 10, 100);
    const skillsScore = Math.min(foundSkills.length * 12, 100);
    const educationScore = resumeText.toLowerCase().includes('master') ? 95 :
        resumeText.toLowerCase().includes('bachelor') ? 85 : 70;
    const keywordsScore = Math.min((resumeText.split(' ').length / 10), 100);

    const matchScore = Math.round(
        (experienceScore * weights.experience / 100) +
        (skillsScore * weights.skills / 100) +
        (educationScore * weights.education / 100) +
        (keywordsScore * weights.keywords / 100)
    );

    return {
        id: Date.now() + Math.random(),
        provider: 'fallback',
        name: "Candidate " + Math.floor(Math.random() * 1000),
        title: "Professional",
        email: emailMatch ? emailMatch[0] : "not.found@email.com",
        phone: phoneMatch ? phoneMatch[0] : "N/A",
        location: "Not specified",
        experience: experience,
        skills: foundSkills.length > 0 ? foundSkills : ['General Skills'],
        education: "Degree in relevant field",
        experienceScore,
        skillsScore,
        educationScore,
        keywordsScore,
        matchScore,
        summary: `Professional with ${experience} years of experience. Skilled in ${foundSkills.slice(0, 3).join(', ')}.`,
        achievements: ["Contributed to multiple projects", "Demonstrated technical proficiency"],
        certifications: []
    };
}

// ===== API ROUTER =====
const apiRouter = express.Router();

// Health check
apiRouter.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Server is running',
        ollamaHost: OLLAMA_HOST,
        model: OLLAMA_MODEL,
        groqAvailable: !!GROQ_API_KEY
    });
});

// Check Ollama availability
apiRouter.get('/check-ollama', async (req, res) => {
    try {
        const response = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
        const models = response.data.models || [];
        const isModelAvailable = models.some(m => m.name.includes(OLLAMA_MODEL.split(':')[0]));

        res.json({
            available: true,
            models: models.map(m => m.name),
            selectedModel: OLLAMA_MODEL,
            modelAvailable: isModelAvailable,
            groqAvailable: !!GROQ_API_KEY
        });
    } catch (error) {
        res.json({
            available: false,
            error: error.message,
            message: 'Ollama is not running. Will use Groq if available, or fallback.',
            groqAvailable: !!GROQ_API_KEY
        });
    }
});

// Upload and analyze resumes
apiRouter.post('/upload', upload.array('resumes', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            console.error('Upload failed: No files in request');
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const weights = {
            experience: parseInt(req.body.experienceWeight) || 30,
            skills: parseInt(req.body.skillsWeight) || 40,
            education: parseInt(req.body.educationWeight) || 20,
            keywords: parseInt(req.body.keywordsWeight) || 10
        };

        console.log(`Processing ${req.files.length} resume(s) with weights:`, weights);

        const results = [];

        for (const file of req.files) {
            try {
                console.log(`Processing: ${file.originalname}`);

                // Extract text from resume
                const resumeText = await extractTextFromResume(file);

                console.log(`Extracted ${resumeText.length} characters from ${file.originalname}`);

                // Analyze with LLaMA
                const analysis = await analyzeResumeWithLLaMA(resumeText, weights);
                results.push(analysis);

            } catch (error) {
                console.error(`Error processing ${file.originalname}:`, error);
                results.push({
                    error: true,
                    message: `Failed to process ${file.originalname}: ${error.message}`,
                    filename: file.originalname
                });
            }
        }

        console.log(`Successfully processed ${results.filter(r => !r.error).length}/${req.files.length} resumes`);

        res.json({
            success: true,
            count: results.length,
            candidates: results
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
            error: 'Server error processing resumes',
            message: error.message,
            details: process.env.NODE_ENV === 'production' ? null : error.stack
        });
    }
});

// Mount the router at both potential base paths
app.use('/api', apiRouter);
app.use('/.netlify/functions/api', apiRouter);


// Start server only if not running as a function
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 Resume Rank Pro Server Running!`);
        console.log(`📍 URL: http://localhost:${PORT}`);
        console.log(`🤖 Ollama Host: ${OLLAMA_HOST}`);
        console.log(`🧠 Model: ${OLLAMA_MODEL}`);
        console.log(`\n⚠️  Make sure Ollama is running with: ollama run ${OLLAMA_MODEL}`);
        console.log(`   Or install Ollama from: https://ollama.ai\n`);
    });
}

module.exports = app;
