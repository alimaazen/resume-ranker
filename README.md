# Resume Rank Pro - AI-Powered Resume Analysis Platform

A smart applicant ranking and resume summarization platform that uses LLaMA AI to analyze resumes and rank candidates automatically.

## 🚀 Features

- **AI-Powered Analysis**: Uses LLaMA to intelligently analyze resumes
- **Multiple File Formats**: Supports PDF, DOC, DOCX, and TXT files
- **Customizable Ranking**: Adjust weights for experience, skills, education, and keywords
- **Real-time Processing**: Upload and analyze multiple resumes simultaneously
- **Beautiful UI**: Clean, modern interface with smooth animations
- **Detailed Analytics**: View score distributions, top skills, and experience breakdowns
- **Fallback Analysis**: Works even without LLaMA using intelligent text extraction

## 📋 Prerequisites

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **Ollama** (for LLaMA) - [Download here](https://ollama.ai/)

## 🛠️ Installation

### 1. Install Node.js Dependencies

Open PowerShell in this directory and run:

```powershell
npm install
```

### 2. Install Ollama (for LLaMA AI)

1. Download Ollama from https://ollama.ai/
2. Install and run Ollama
3. Pull the LLaMA model:

```powershell
ollama pull llama3.2
```

Or use a different model (update `.env` file):

```powershell
ollama pull llama2
ollama pull mistral
ollama pull codellama
```

## 🎯 Usage

### Start the Server

```powershell
npm start
```

The server will start on `http://localhost:3000`

### Access the Application

Open your browser and go to:

```
http://localhost:3000
```

### Upload Resumes

1. Click "Upload Resumes" or drag & drop files
2. Adjust ranking criteria weights if desired
3. Upload PDF, DOC, DOCX, or TXT resume files
4. Wait for AI analysis (takes 10-30 seconds per resume)
5. View ranked candidates with detailed insights

### Demo Mode

Click "View Demo" to see the system with sample data (no uploads required)

## ⚙️ Configuration

Edit `.env` file to configure:

```env
PORT=3000                              # Server port
OLLAMA_HOST=http://localhost:11434    # Ollama server URL
OLLAMA_MODEL=llama3.2                 # LLaMA model to use
```

### Available Models

- `llama3.2` (Recommended - fast and accurate)
- `llama2` (Older but stable)
- `mistral` (Alternative option)
- `codellama` (Better for technical resumes)

## 🔧 Troubleshooting

### "Server not connected" Error

Make sure the server is running:

```powershell
npm start
```

### "LLaMA unavailable" Warning

1. Check if Ollama is running
2. Pull the model: `ollama pull llama3.2`
3. Verify Ollama is accessible: `ollama list`

The system will use fallback analysis if LLaMA is unavailable.

### "Failed to parse PDF" Error

- Ensure the PDF is not password-protected
- Try converting to TXT format
- Some scanned PDFs may not work (OCR required)

### Large Files Taking Too Long

- Keep resume files under 5MB
- Use TXT format for fastest processing
- Process fewer files at once (5-10 max)

## 📁 Project Structure

```
resume/
├── index.html          # Frontend UI
├── styles.css          # Styling and animations
├── script.js           # Frontend JavaScript
├── server.js           # Backend Node.js server
├── package.json        # Dependencies
├── .env               # Configuration
├── README.md          # This file
└── uploads/           # Temporary upload folder (auto-created)
```

## 🎨 Features Breakdown

### Frontend

- Drag & drop file upload
- Real-time search and filtering
- Grid/list view toggle
- Detailed candidate modals
- Analytics dashboard
- Responsive design

### Backend

- Express.js server
- File upload handling (Multer)
- PDF/DOC/DOCX/TXT parsing
- LLaMA AI integration
- RESTful API
- Error handling and fallbacks

### AI Analysis

- Extracts candidate information
- Scores experience, skills, education
- Generates professional summaries
- Identifies key achievements
- Weighted ranking algorithm

## 🔒 Security Notes

- Files are automatically deleted after processing
- No data is stored permanently
- All processing is local (requires local Ollama)
- No external API calls (privacy-focused)

## 📝 API Endpoints

- `GET /api/health` - Server health check
- `GET /api/check-ollama` - Check LLaMA availability
- `POST /api/upload` - Upload and analyze resumes

## 🚀 Development

For development with auto-reload:

```powershell
npm run dev
```

Requires `nodemon` (included in dev dependencies)

## 📦 Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **AI**: LLaMA via Ollama
- **File Processing**: pdf-parse, mammoth
- **Upload Handling**: Multer

## 💡 Tips

1. **Better Results**: Use well-formatted resumes with clear sections
2. **Speed**: TXT files process fastest
3. **Accuracy**: Adjust weights based on your needs
4. **Batch Processing**: Upload 5-10 resumes at a time for best performance

## 🤝 Support

For issues or questions:

1. Check the troubleshooting section
2. Verify all prerequisites are installed
3. Check browser console for errors
4. Ensure Ollama is running with the correct model

## 📄 License

MIT License - Feel free to use and modify!

---

**Enjoy ranking candidates with AI! 🎯**
