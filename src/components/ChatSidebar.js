import React, { useState, useRef, useEffect, useCallback } from 'react';
import '../App.css';

const ChatSidebar = ({
  clearChat,
  provider,
  setProvider,
  selectedModel,
  setSelectedModel,
  availableModels,
  modelsLoaded,
  modelsError,
  systemPrompt,
  setSystemPrompt,
  useRag,
  setUseRag
}) => {
  const fileInputRef = useRef(null);
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  
  // Custom server config state
  const [customServerConfig, setCustomServerConfig] = useState({
    configured: false,
    defaultModel: 'qwen2:0.5b'
  });

  // Load custom server config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const resp = await fetch(`${backendUrl}/api/chat/config`);
        if (resp.ok) {
          const config = await resp.json();
          setCustomServerConfig({
            configured: config.customServerConfigured,
            defaultModel: config.defaultCustomModel
          });
        }
      } catch (e) {
        console.error('Config loading error:', e);
      }
    };

    loadConfig();
  }, [backendUrl]);
  
  // File management state
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  // File management functions
  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/files`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error('Error loading files:', err);
    } finally {
      setFilesLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const uploadFile = async (file) => {
    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 201) {
          loadFiles();
        }
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.addEventListener('error', () => {
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.open('POST', `${backendUrl}/api/files`);
      xhr.send(formData);
    } catch (err) {
      console.error('Error uploading file:', err);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const deleteFile = async (fileId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот файл?')) {
      return;
    }
    try {
      const response = await fetch(`${backendUrl}/api/files/${fileId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        loadFiles();
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    selectedFiles.forEach(uploadFile);
    e.target.value = '';
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(uploadFile);
  };

  const getFileIcon = (mimetype) => {
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype.includes('pdf')) return '📄';
    if (mimetype.includes('word')) return '📝';
    if (mimetype.includes('excel') || mimetype.includes('sheet')) return '📊';
    if (mimetype.includes('text')) return '📃';
    return '📁';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <aside className="chat-sidebar">
      <div className="sidebar-section">
        <button onClick={clearChat} className="clear-btn sidebar-btn">
          Start New Chat
        </button>
      </div>

      <div className="sidebar-section">
        <label className="sidebar-label">
          Провайдер:
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="sidebar-select">
            <option value="gemini">Google Gemini</option>
            <option value="custom">Мой сервер</option>
          </select>
        </label>
      </div>

      <div className="sidebar-section">
        <label className="sidebar-label">
          Модель:
          <select 
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
            className="sidebar-select"
          >
            {provider === 'gemini' && availableModels.length > 0 ? (
              availableModels.map((m) => {
                const short = m.includes('/') ? m.split('/').pop() : m;
                return (
                  <option key={m} value={short}>{short}</option>
                );
              })
            ) : provider === 'gemini' ? (
              <>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              </>
            ) : (
              <>
                <option value={customServerConfig.defaultModel}>{customServerConfig.defaultModel}</option>
              </>
            )}
          </select>
        </label>
        {provider === 'gemini' && !modelsLoaded && (
          <div className="models-warning">Загружаю список моделей…</div>
        )}
        {provider === 'gemini' && modelsError && (
          <div className="models-error">Не удалось получить список моделей: {modelsError}</div>
        )}
      </div>

      <div className="sidebar-section">
        <h3 style={{ marginTop: '1rem', marginBottom: '0.5rem', color: '#333', fontSize: '1rem', fontWeight: '500' }}>Default Context</h3>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Enter contextual information for the AI model..."
          rows="3"
          className="sidebar-textarea"
        />
      </div>

      <div className="sidebar-section">
        <h3 style={{ marginTop: '1rem', marginBottom: '0.5rem', color: '#333', fontSize: '1rem', fontWeight: '500' }}>File Management</h3>
        <label className="rag-toggle" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input 
            type="checkbox" 
            checked={useRag}
            onChange={(e) => setUseRag(e.target.checked)}
          />
          <span>🔍 Search for answers in files</span>
        </label>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-upload-zone">
          <div 
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx"
            />
            
            {uploading ? (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p>Загрузка... {uploadProgress}%</p>
              </div>
            ) : (
              <div className="upload-content">
                <div className="upload-icon">📤</div>
                <p>Перетащите файлы сюда или нажмите для выбора</p>
                <small>Поддерживаемые форматы: изображения, PDF, документы</small>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-section files-section">
        <div className="files-header">
          <h3>Загруженные файлы</h3>
          <button onClick={loadFiles} className="refresh-btn" disabled={filesLoading}>
            {filesLoading ? '⏳' : '🔄'}
          </button>
        </div>

        {filesLoading && files.length === 0 ? (
          <div className="loading">Загрузка файлов...</div>
        ) : files.length === 0 ? (
          <div className="no-files">
            <p>Файлы не найдены</p>
            <small>Загрузите первый файл</small>
          </div>
        ) : (
          <div className="files-list">
            {files.map((file) => (
              <div key={file.id} className="file-item">
                <div className="file-item-icon">
                  {getFileIcon(file.mimetype)}
                </div>
                <div className="file-item-info">
                  <div className="file-item-name" title={file.originalName}>
                    {file.originalName}
                  </div>
                  <div className="file-item-details">
                    <span className="file-item-size">{file.formattedSize}</span>
                    <span className="file-item-date">{formatDate(file.uploadedAt)}</span>
                  </div>
                </div>
                <div className="file-item-actions">
                  <button
                    onClick={() => deleteFile(file.id)}
                    className="file-item-delete"
                    title="Удалить файл"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

export default ChatSidebar;

