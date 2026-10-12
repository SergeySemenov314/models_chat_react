import React, { useState, useRef, useEffect, useCallback } from 'react';
import '../App.css';

// Тестовые документы RAG всегда доступны и не удаляются из интерфейса.
const PROTECTED_FILE_NAMES = ['Text about AI.docx', 'text about RAG.txt'];
const isProtectedFile = (originalName) =>
  PROTECTED_FILE_NAMES.some(name => name.toLowerCase() === (originalName || '').toLowerCase());

const ChatSidebar = ({
  clearChat,
  isVisible,
  onClose
}) => {
  const fileInputRef = useRef(null);
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  
  // Touch handling for swipe to close
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  // Minimum swipe distance (in px) required
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null); // Reset touch end
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance; // Swipe left to close (drag to left)

    if (isLeftSwipe) {
      onClose();
    }
  };

  // File management state
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState('');

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
      setFileError('Не удалось получить список файлов с сервера.');
    } finally {
      setFilesLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!files.some(file => file.indexStatus === 'pending')) return;
    const timer = window.setInterval(loadFiles, 5000);
    return () => window.clearInterval(timer);
  }, [files, loadFiles]);

  const uploadFile = async (file) => {
    setFileError('');
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
          let result = {};
          try {
            result = JSON.parse(xhr.responseText);
          } catch (error) {
            setFileError('Сервер вернул некорректный ответ после загрузки файла.');
          }
          if (result.file?.indexStatus === 'disabled') {
            setFileError('Файл сохранён, но поиск по файлам отключён на сервере.');
          }
          loadFiles();
        } else {
          setFileError(`Не удалось загрузить «${file.name}» (HTTP ${xhr.status}).`);
        }
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.addEventListener('error', () => {
        setFileError(`Не удалось загрузить «${file.name}»: ошибка соединения.`);
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

  const downloadFile = async (fileId, fileName) => {
    setFileError('');
    try {
      const response = await fetch(`${backendUrl}/api/files/${fileId}/download`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFileError(`Не удалось скачать «${fileName}». Возможно, файл отсутствует на сервере (${error.message}).`);
      loadFiles();
    }
  };

  const deleteFile = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
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

  const reindexFile = async (fileId) => {
    setFileError('');
    try {
      const response = await fetch(`${backendUrl}/api/files/${fileId}/reindex`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      loadFiles();
    } catch (error) {
      setFileError(`Не удалось повторно обработать файл (${error.message}).`);
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
    <aside 
      className={`chat-sidebar ${isVisible ? 'visible' : ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="sidebar-scroll-container">
        <div className="sidebar-section">
          <button 
            onClick={() => {
              clearChat();
              onClose();
            }} 
            className="clear-btn sidebar-btn"
          >
            Start New Chat
          </button>
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
                accept=".pdf,.docx,.txt"
              />
              
              {uploading ? (
                <div className="upload-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p>Uploading... {uploadProgress}%</p>
                </div>
              ) : (
                <div className="upload-content">
                  <div className="upload-icon">📤</div>
                  <p>Drag or select files</p>
                  <small>Formats: PDF and Word documents</small>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-section files-section" style={{ marginTop: '0.5rem' }}>
          <h3 style={{ marginTop: '0.25rem', marginBottom: '0.75rem', color: '#666', fontSize: '0.875rem', fontWeight: '400' }}>Uploaded files</h3>
          {fileError && <div className="file-error" role="alert">{fileError}</div>}

          {filesLoading && files.length === 0 ? (
            <div className="loading">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="no-files">
              <p>No files found</p>
              <small>Upload your first file</small>
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
                    {file.indexStatus !== 'ready' && (
                      <div className="file-index-status">
                        {file.indexStatus === 'missing' ? 'Файл отсутствует на сервере — загрузите повторно' :
                         file.indexStatus === 'failed' ? 'Поиск по файлу не работает — загрузите повторно' :
                         file.indexStatus === 'disabled' ? 'Поиск по файлам отключён' :
                         file.indexStatus === 'unsupported' ? 'Этот формат не участвует в поиске' :
                         file.indexStatus === 'pending' ? 'Индексация...' : 'Статус поиска неизвестен — загрузите повторно'}
                      </div>
                    )}
                  </div>
                  <div className="file-item-actions">
                    {file.available && ['failed', 'unknown', 'disabled'].includes(file.indexStatus) && (
                      <button
                        onClick={() => reindexFile(file.id)}
                        className="file-item-reindex"
                        title="Повторить поиск по файлу"
                      >
                        ↻
                      </button>
                    )}
                    <button
                      onClick={() => downloadFile(file.id, file.originalName)}
                      disabled={!file.available}
                      className="file-item-download"
                      title="Download file"
                    >
                      ⬇️
                    </button>
                    {!isProtectedFile(file.originalName) && (
                      <button
                        onClick={() => deleteFile(file.id)}
                        className="file-item-delete"
                        title="Delete file"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default ChatSidebar;

