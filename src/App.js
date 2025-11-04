import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import FileManager from './components/FileManager';

function App() {
  const [currentView, setCurrentView] = useState('chat'); // 'chat' | 'files'
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-lite');
  const [systemPrompt, setSystemPrompt] = useState('Вы полезный AI-ассистент, который отвечает на вопросы пользователей четко и информативно.');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [useRag, setUseRag] = useState(true);
  const messagesEndRef = useRef(null);
  const [provider, setProvider] = useState('gemini'); // 'gemini' | 'custom'
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  const [customServerConfig, setCustomServerConfig] = useState({
    configured: false,
    defaultModel: 'qwen2:0.5b'
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Выбор лучшей доступной модели на основе списка из API
  const pickBestModel = (modelsList) => {
    const names = modelsList.map(m => m);
    // Предпочитаем gemini-2.5-flash, затем gemini-2.0-flash
    const preferredOrder = [
      'gemini-2.5-flash',
      'gemini-2.0-flash'
    ];
    for (const pref of preferredOrder) {
      if (names.some(n => n === pref)) return pref;
      // также пробуем точные имена из ListModels, которые приходят как models/NAME
      if (names.some(n => n.endsWith('/' + pref))) return pref;
    }
    // Если ничего из предпочтительных нет — берем первый
    if (names.length > 0) {
      const first = names[0];
      return first.includes('/') ? first.split('/').pop() : first;
    }
    return 'gemini-2.5-flash';
  };

  // Загружаем конфигурацию сервера
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

  // Загружаем список доступных моделей через бэкенд
  useEffect(() => {
    const loadModels = async () => {
      if (provider !== 'gemini') return;
      try {
        setModelsLoaded(false);
        setModelsError('');
        const resp = await fetch(`${backendUrl}/api/chat/models`);
        if (!resp.ok) {
          throw new Error(`Backend HTTP ${resp.status}`);
        }
        const json = await resp.json();
        const models = json.models || [];
        setAvailableModels(models);
        setModelsLoaded(true);

        // Если выбранная модель недоступна, выбираем лучшую доступную
        const flatNames = models.map(n => n.includes('/') ? n.split('/').pop() : n);
        const selectedFlat = selectedModel;
        if (!flatNames.includes(selectedFlat)) {
          const best = pickBestModel(models);
          if (best && best !== selectedModel) {
            setSelectedModel(best);
          }
        }
      } catch (e) {
        console.error('Models loading error:', e);
        setModelsError(e.message || 'Не удалось получить список моделей');
        setModelsLoaded(true);
      }
    };

    loadModels();
    // Загружаем при смене провайдера
  }, [selectedModel, provider, backendUrl]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = { role: 'user', content: inputValue, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
      // Подготавливаем сообщения для отправки на бэкенд
      const chatMessages = [];
      const recentMessages = messages.slice(-10).filter(msg => msg.role !== 'error');
      chatMessages.push(...recentMessages.map(msg => ({ 
        role: msg.role, 
        content: msg.content 
      })));
      chatMessages.push({ role: 'user', content: currentInput });

      // Подготавливаем данные для запроса
      // Default Context отправляется только если поле заполнено
      const requestData = {
        provider: provider,
        model: provider === 'gemini' ? selectedModel : customServerConfig.defaultModel,
        messages: chatMessages,
        systemPrompt: systemPrompt.trim() ? systemPrompt.trim() : undefined,
        useRag: useRag
      };

      // Отправляем запрос на бэкенд
      const resp = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!resp.ok) {
        const errorData = await resp.text();
        throw new Error(`Backend HTTP ${resp.status}: ${errorData}`);
      }

      const data = await resp.json();
      const aiMessage = {
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        stats: data.stats,
        sources: data.sources
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Ошибка:', error);
      const errorMessage = { 
        role: 'error', 
        content: `Ошибка: ${error.message}`, 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      // Можно добавить уведомление о копировании
      console.log('Текст скопирован!');
    }).catch(err => {
      console.error('Ошибка копирования:', err);
    });
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-top">
          <h1>🤖 Models Chat React</h1>
          <nav className="main-nav">
            <button 
              className={`nav-btn ${currentView === 'chat' ? 'active' : ''}`}
              onClick={() => setCurrentView('chat')}
            >
              💬 Чат
            </button>
            <button 
              className={`nav-btn ${currentView === 'files' ? 'active' : ''}`}
              onClick={() => setCurrentView('files')}
            >
              📁 Файлы
            </button>
          </nav>
        </div>
        {currentView === 'chat' && (
        <div className="server-config">
          <label>
            Провайдер: 
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="gemini">Google Gemini</option>
              <option value="custom">Мой сервер</option>
            </select>
          </label>
          <label>
            Модель: 
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
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
          <label className="rag-toggle">
            <input 
              type="checkbox" 
              checked={useRag}
              onChange={(e) => setUseRag(e.target.checked)}
            />
            🔍 Search for answers in files
          </label>
          <button 
            onClick={() => setShowSystemPrompt(!showSystemPrompt)}
            className="toggle-prompt-btn"
            type="button"
          >
            {showSystemPrompt ? '🔼 Hide Default Context' : '🔽 Configure Default Context'}
          </button>
          <button onClick={clearChat} className="clear-btn">
            Start New Chat
          </button>
        </div>
        )}
        
        {currentView === 'chat' && showSystemPrompt && (
          <div className="system-prompt-config">
            <label>
              Default Context (AI context):
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter contextual information for the AI model..."
                rows="3"
                className="system-prompt-textarea"
              />
            </label>
            <div className="system-prompt-info">
              💡 Default Context helps AI understand the context and role in the conversation
            </div>
          </div>
        )}
      </header>

      <main className={currentView === 'chat' ? 'chat-container' : 'files-container'}>
        {currentView === 'chat' ? (
        <>
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Добро пожаловать в Models Chat!</h2>
              <p>
                {systemPrompt.trim()
                  ? `${provider === 'gemini' ? 'Google Gemini' : 'Ваш сервер'} готов к работе с настроенным контекстом` 
                  : `${provider === 'gemini' ? 'Google Gemini' : 'Ваш сервер'} готов помочь вам. Начните диалог!`}
              </p>
              {systemPrompt.trim() && (
                <div className="system-prompt-status active">
                  ✅ Default Context active
                  {!showSystemPrompt && (
                    <div style={{fontSize: '0.8em', marginTop: '0.3rem', opacity: 0.95}}>
                      "{systemPrompt.length > 50 ? systemPrompt.substring(0, 50) + '...' : systemPrompt}"
                    </div>
                  )}
                </div>
              )}
              {!systemPrompt.trim() && (
                <div className="system-prompt-status inactive">
                  ℹ️ Default Context not set - AI works without additional context
                </div>
              )}
              {(provider === 'gemini' || (provider === 'custom' && customServerConfig.configured)) && (
                <div className="example-prompts">
                  <button onClick={() => setInputValue('Привет! Как дела?')}>
                    Привет! Как дела?
                  </button>
                  <button onClick={() => setInputValue('Помоги мне написать код на Python')}>
                    Помоги написать код на Python
                  </button>
                  <button onClick={() => setInputValue('Объясни квантовую физику простыми словами')}>
                    Объясни квантовую физику просто
                  </button>
                </div>
              )}
             
            
            </div>
          )}

          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-header">
                <div className="message-header-left">
                  <span className="role">
                    {message.role === 'user' ? '👤 Вы' : 
                     message.role === 'assistant' ? '🤖 AI' : '❌ Ошибка'}
                  </span>
                </div>
                <div className="message-header-right">
                  <span className="timestamp">{formatTime(message.timestamp)}</span>
                  {message.role === 'assistant' && (
                    <button 
                      className="copy-btn" 
                      onClick={() => copyToClipboard(message.content)}
                      title="Копировать ответ"
                    >
                      📋
                    </button>
                  )}
                </div>
              </div>
              <div className="message-content">
                {message.content}
              </div>
              {message.stats && (
                <div className="message-stats">
                  🤖 {message.stats.model} | 
                  📝 {message.stats.totalTokens} токенов 
                  ({message.stats.promptTokens} вход + {message.stats.responseTokens} ответ)
                </div>
              )}
              {message.sources && message.sources.length > 0 && (
                <div className="message-sources">
                  <strong>📚 Источники:</strong>
                  <ul>
                    {message.sources.map((source, idx) => (
                      <li key={idx}>
                        📄 {source.document} 
                        {source.similarity && (
                          <span className="similarity">
                            (релевантность: {Math.round(source.similarity * 100)}%)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="message assistant loading">
              <div className="message-header">
                <div className="message-header-left">
                  <span className="role">🤖 AI</span>
                </div>
                <div className="message-header-right">
                  <span className="timestamp">печатает...</span>
                </div>
              </div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Введите ваше сообщение... (Enter для отправки)"
            disabled={isLoading}
            rows="3"
          />
          <button 
            onClick={sendMessage} 
            disabled={!inputValue.trim() || isLoading || (provider === 'custom' && !customServerConfig.configured)}
            className="send-btn"
            title={(provider === 'custom' && !customServerConfig.configured ? 'Настройте кастомный сервер в .env бэкенда' : 'Отправить сообщение')}
          >
            {isLoading ? '⏳' : '📤'}
          </button>
        </div>
        </>
        ) : (
          <FileManager />
        )}
      </main>
    </div>
  );
}

export default App;