import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import ChatSidebar from './components/ChatSidebar';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-lite');
  const [systemPrompt, setSystemPrompt] = useState('Вы полезный AI-ассистент, который отвечает на вопросы пользователей четко и информативно.');
  const [useSystemPrompt, setUseSystemPrompt] = useState(true);
  const [useRag, setUseRag] = useState(true);
  const messagesEndRef = useRef(null);
  const [provider, setProvider] = useState('gemini'); // 'gemini' | 'custom'
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
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

  const sendMessage = async (messageText = null) => {
    const textToSend = messageText || inputValue;
    if (!textToSend.trim() || isLoading) return;

    const userMessage = { role: 'user', content: textToSend, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = textToSend;
    if (!messageText) {
      setInputValue('');
    }
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
      // Default Context отправляется только если поле заполнено и чекбокс включен
      const requestData = {
        provider: provider,
        model: provider === 'gemini' ? selectedModel : customServerConfig.defaultModel,
        messages: chatMessages,
        systemPrompt: (useSystemPrompt && systemPrompt.trim()) ? systemPrompt.trim() : undefined,
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
      <main className="chat-container">
        <div className="chat-layout">
          <div className="chat-content">
            <div className="messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Добро пожаловать в Models Chat!</h2>
              <p>
                {`${provider === 'gemini' ? 'Google Gemini' : 'Ваш сервер'} готов помочь вам. Начните диалог!`}
              </p>
              {useSystemPrompt && systemPrompt.trim() && (
                <div className="system-prompt-status active">
                  ✅ Default Context active
                </div>
              )}
              {(!useSystemPrompt || !systemPrompt.trim()) && (
                <div className="system-prompt-status inactive">
                  ℹ️ Default Context {!useSystemPrompt ? 'disabled' : 'not set'}
                </div>
              )}
              {useRag && (
                <div className="system-prompt-status active">
                  ✅ Search for answers in files active
                </div>
              )}
              {!useRag && (
                <div className="system-prompt-status inactive">
                  ℹ️ Search for answers in files disabled
                </div>
              )}
              {(provider === 'gemini' || (provider === 'custom' && customServerConfig.configured)) && (
                <div className="example-prompts">
                  <button onClick={() => sendMessage('Привет! Как дела?')}>
                    Привет! Как дела?
                  </button>
                  <button onClick={() => sendMessage('Объясни квантовую физику простыми словами')}>
                    Объясни квантовую физику просто
                  </button>
                  <button onClick={() => sendMessage('What components does the RAG system include?')} title="Document search test" style={{ fontWeight: '600' }}>
                    📄 [RAG Test] What components does the RAG system include?
                  </button>
                  <button onClick={() => sendMessage('What document formats does the system support?')} title="Document search test" style={{ fontWeight: '600' }}>
                    📄 [RAG Test] What document formats does the system support?
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
                placeholder="Введите ваше сообщение..."
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
          </div>

          <ChatSidebar
            clearChat={clearChat}
            provider={provider}
            setProvider={setProvider}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            availableModels={availableModels}
            modelsLoaded={modelsLoaded}
            modelsError={modelsError}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            useSystemPrompt={useSystemPrompt}
            setUseSystemPrompt={setUseSystemPrompt}
            useRag={useRag}
            setUseRag={setUseRag}
          />
        </div>
      </main>
    </div>
  );
}

export default App;