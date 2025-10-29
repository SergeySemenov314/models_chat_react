import React, { useState, useEffect, useRef } from 'react';
import './FileManager.css';

const FileManager = () => {
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState({ totalFiles: 0, totalSize: '0 Bytes' });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);
  
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  // Загрузка списка файлов
  const loadFiles = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/api/files`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setFiles(data.files);
      setStats(data.stats);
    } catch (err) {
      setError(`Ошибка загрузки файлов: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Загрузка файла
  const uploadFile = async (file) => {
    setUploading(true);
    setUploadProgress(0);
    setError('');
    setSuccess('');

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
          const response = JSON.parse(xhr.responseText);
          setSuccess(`Файл "${response.file.originalName}" успешно загружен!`);
          loadFiles(); // Обновляем список файлов
        } else {
          const errorData = JSON.parse(xhr.responseText);
          setError(`Ошибка загрузки: ${errorData.message || 'Неизвестная ошибка'}`);
        }
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.addEventListener('error', () => {
        setError('Ошибка сети при загрузке файла');
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.open('POST', `${backendUrl}/api/files`);
      xhr.send(formData);
    } catch (err) {
      setError(`Ошибка загрузки файла: ${err.message}`);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Удаление файла
  const deleteFile = async (fileId, fileName) => {
    if (!window.confirm(`Вы уверены, что хотите удалить файл "${fileName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/files/${fileId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      setSuccess(`Файл "${fileName}" успешно удален!`);
      loadFiles(); // Обновляем список файлов
    } catch (err) {
      setError(`Ошибка удаления файла: ${err.message}`);
    }
  };

  // Скачивание файла
  const downloadFile = (fileId, fileName) => {
    const link = document.createElement('a');
    link.href = `${backendUrl}/api/files/${fileId}/download`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Обработка выбора файлов
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    selectedFiles.forEach(uploadFile);
    e.target.value = ''; // Сброс input
  };

  // Drag and Drop обработчики
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

  // Получение иконки файла по типу
  const getFileIcon = (mimetype) => {
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype.includes('pdf')) return '📄';
    if (mimetype.includes('word')) return '📝';
    if (mimetype.includes('excel') || mimetype.includes('sheet')) return '📊';
    if (mimetype.includes('text')) return '📃';
    return '📁';
  };

  // Форматирование даты
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

  // Очистка сообщений
  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  return (
    <div className="file-manager">
      <div className="file-manager-header">
        <h2>📁 Управление файлами</h2>
        <div className="file-stats">
          <span>Всего файлов: {stats.totalFiles}</span>
          <span>Общий размер: {stats.totalSize}</span>
        </div>
      </div>

      {/* Сообщения */}
      {(error || success) && (
        <div className="messages">
          {error && (
            <div className="message error">
              ❌ {error}
              <button onClick={clearMessages} className="close-btn">×</button>
            </div>
          )}
          {success && (
            <div className="message success">
              ✅ {success}
              <button onClick={clearMessages} className="close-btn">×</button>
            </div>
          )}
        </div>
      )}

      {/* Зона загрузки */}
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
            <small>Поддерживаемые форматы: изображения, PDF, документы (макс. 10MB)</small>
          </div>
        )}
      </div>

      {/* Список файлов */}
      <div className="files-section">
        <div className="files-header">
          <h3>Загруженные файлы</h3>
          <button onClick={loadFiles} className="refresh-btn" disabled={loading}>
            {loading ? '⏳' : '🔄'} Обновить
          </button>
        </div>

        {loading && files.length === 0 ? (
          <div className="loading">Загрузка файлов...</div>
        ) : files.length === 0 ? (
          <div className="no-files">
            <p>Файлы не найдены</p>
            <small>Загрузите первый файл, используя область выше</small>
          </div>
        ) : (
          <div className="files-grid">
            {files.map((file) => (
              <div key={file.id} className="file-card">
                <div className="file-icon">
                  {getFileIcon(file.mimetype)}
                </div>
                <div className="file-info">
                  <div className="file-name" title={file.originalName}>
                    {file.originalName}
                  </div>
                  <div className="file-details">
                    <span className="file-size">{file.formattedSize}</span>
                    <span className="file-type">{file.mimetype.split('/')[1]?.toUpperCase()}</span>
                  </div>
                  <div className="file-date">
                    {formatDate(file.uploadedAt)}
                  </div>
                </div>
                <div className="file-actions">
                  <button
                    onClick={() => downloadFile(file.id, file.originalName)}
                    className="action-btn download"
                    title="Скачать файл"
                  >
                    ⬇️
                  </button>
                  <button
                    onClick={() => deleteFile(file.id, file.originalName)}
                    className="action-btn delete"
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
    </div>
  );
};

export default FileManager;
