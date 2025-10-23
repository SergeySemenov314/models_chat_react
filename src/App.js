import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey] = useState(process.env.REACT_APP_GEMINI_API_KEY || '');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [systemPrompt, setSystemPrompt] = useState('Вы полезный AI-ассистент, который отвечает на вопросы пользователей четко и информативно.');
  const [useSystemPrompt, setUseSystemPrompt] = useState(true);
  const messagesEndRef = useRef(null);
  const [provider, setProvider] = useState('gemini'); // 'gemini' | 'custom'
  const customServerUrl = process.env.REACT_APP_CUSTOM_SERVER_URL || '';
  const customModel = process.env.REACT_APP_CUSTOM_MODEL || 'qwen2:0.5b';
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsError, setModelsError] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Выбор лучшей доступной модели на основе списка из API
  const pickBestModel = (modelsList) => {
    const names = modelsList.map(m => m);
    // Предпочитаем 1.5-pro, затем 1.5-flash, затем gemini-pro
    const preferredOrder = [
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-pro'
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
    return 'gemini-pro';
  };

  // Загружаем список доступных моделей (ListModels)
  useEffect(() => {
    const loadModels = async () => {
      if (provider !== 'gemini' || !apiKey.trim()) return;
      try {
        setModelsLoaded(false);
        setModelsError('');
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!resp.ok) {
          throw new Error(`ListModels HTTP ${resp.status}`);
        }
        const json = await resp.json();
        const models = (json.models || [])
          .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name); // имена в формате models/<name>
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
        console.error('ListModels error:', e);
        setModelsError(e.message || 'Не удалось получить список моделей');
        setModelsLoaded(true);
      }
    };

    loadModels();
    // Загружаем при первом наличии ключа и при смене провайдера
  }, [apiKey, selectedModel, provider]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    if (provider === 'gemini' && !apiKey.trim()) return;
    if (provider === 'custom' && !customServerUrl.trim()) return;

    const userMessage = { role: 'user', content: inputValue, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
      if (provider === 'gemini') {
        // Инициализируем Gemini AI
        const genAI = new GoogleGenerativeAI(apiKey);

        // Если выбранная модель недоступна по данным ListModels — выберем лучшую доступную
        let modelNameToUse = selectedModel;
        if (availableModels.length > 0) {
          const flatNames = availableModels.map(n => n.includes('/') ? n.split('/').pop() : n);
          if (!flatNames.includes(modelNameToUse)) {
            modelNameToUse = pickBestModel(availableModels);
          }
        }

        let model = genAI.getGenerativeModel({ model: modelNameToUse });

        // Подготавливаем историю для чата
        let prompt = '';
        if (useSystemPrompt && systemPrompt.trim()) {
          prompt += `Системная инструкция: ${systemPrompt}\n\n`;
        }
        const recentMessages = messages.slice(-10).filter(msg => msg.role !== 'error');
        recentMessages.forEach(msg => {
          const roleLabel = msg.role === 'assistant' ? 'AI' : 'Пользователь';
          prompt += `${roleLabel}: ${msg.content}\n`;
        });
        prompt += `Пользователь: ${currentInput}\nAI: `;

        let result;
        try {
          result = await model.generateContent(prompt);
        } catch (err) {
          const isNotFound = (err && (String(err.message || err).includes('404') || String(err.message || err).includes('not found')));
          if (isNotFound && availableModels.length > 0) {
            const fallback = pickBestModel(availableModels);
            if (fallback && fallback !== modelNameToUse) {
              modelNameToUse = fallback;
              setSelectedModel(fallback);
              model = genAI.getGenerativeModel({ model: modelNameToUse });
              result = await model.generateContent(prompt);
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
        const response = await result.response;
        const text = response.text();

        const aiMessage = { 
          role: 'assistant', 
          content: text, 
          timestamp: new Date(),
          stats: {
            model: modelNameToUse,
            promptTokens: response.usageMetadata?.promptTokenCount || 0,
            responseTokens: response.usageMetadata?.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata?.totalTokenCount || 0
          }
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        // Кастомный сервер (совместим с /api/chat)
        const chatMessages = [];
        if (useSystemPrompt && systemPrompt.trim()) {
          chatMessages.push({ role: 'system', content: systemPrompt });
        }
        const recentMessages = messages.slice(-10).filter(msg => msg.role !== 'error');
        chatMessages.push(...recentMessages.map(msg => ({ role: msg.role, content: msg.content })));
        chatMessages.push({ role: 'user', content: currentInput });

        const resp = await fetch(`${customServerUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: customModel, messages: chatMessages, stream: false })
        });
        if (!resp.ok) {
          const errorData = await resp.text();
          throw new Error(`Custom server HTTP ${resp.status}: ${errorData}`);
        }
        const data = await resp.json();
        const content = data?.message?.content || data?.content || '';
        const aiMessage = {
          role: 'assistant',
          content: content,
          timestamp: new Date(),
          stats: {
            model: customModel,
            totalTokens: data?.usage?.total_tokens || data?.eval_count || 0,
            promptTokens: data?.usage?.prompt_tokens || 0,
            responseTokens: data?.usage?.completion_tokens || 0
          }
        };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Ошибка:', error);
      const errorMessage = { 
        role: 'error', 
        content: `Ошибка Gemini API: ${error.message}`, 
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
        <h1>🤖 Gemini Chat</h1>
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
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  <option value="gemini-pro">gemini-pro</option>
                </>
              ) : (
                <>
                  <option value={customModel}>{customModel}</option>
                </>
              )}
            </select>
          </label>
          {provider === 'gemini' && !modelsLoaded && apiKey.trim() && (
            <div className="models-warning">Загружаю список моделей…</div>
          )}
          {provider === 'gemini' && modelsError && (
            <div className="models-error">Не удалось получить список моделей: {modelsError}</div>
          )}
          <label className="system-prompt-toggle">
            <input 
              type="checkbox" 
              checked={useSystemPrompt}
              onChange={(e) => setUseSystemPrompt(e.target.checked)}
            />
            Использовать системный промпт
          </label>
          <button onClick={clearChat} className="clear-btn">
            Очистить чат
          </button>
        </div>
        
        {useSystemPrompt && (
          <div className="system-prompt-config">
            <label>
              Системный промпт (контекст для AI):
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Введите контекстную информацию для AI модели..."
                rows="3"
                className="system-prompt-textarea"
              />
            </label>
            <div className="system-prompt-info">
              💡 Системный промпт помогает AI понимать контекст и роль в разговоре
            </div>
          </div>
        )}
      </header>

      <main className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Добро пожаловать в Gemini Chat!</h2>
              <p>
                {apiKey.trim() 
                  ? (useSystemPrompt 
                      ? 'Google Gemini готов к работе с настроенным контекстом' 
                      : 'Google Gemini готов помочь вам. Начните диалог!')
                  : '⚠️ Настройте API ключ в файле .env для начала работы'}
              </p>
              {apiKey.trim() && useSystemPrompt && (
                <div className="system-prompt-status active">
                  ✅ Системный промпт активен
                </div>
              )}
              {apiKey.trim() && !useSystemPrompt && (
                <div className="system-prompt-status inactive">
                  ℹ️ Системный промпт отключен - AI работает без дополнительного контекста
                </div>
              )}
              {(provider === 'gemini' ? apiKey.trim() : customServerUrl.trim()) && (
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
              {provider === 'gemini' && !apiKey.trim() && (
                <div className="api-key-help">
                  <p>📝 Настройка API ключа:</p>
                  <ol>
                    <li>Получите ключ на <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></li>
                    <li>Создайте файл <code>.env</code> в корне проекта</li>
                    <li>Добавьте: <code>REACT_APP_GEMINI_API_KEY=ваш_ключ</code></li>
                    <li>Перезапустите приложение</li>
                  </ol>
                  <p>🆓 Бесплатный лимит: 15 запросов/мин, 1500 запросов/день</p>
                </div>
              )}
              {provider === 'custom' && !customServerUrl.trim() && (
                <div className="api-key-help">
                  <p>🛠 Настройка вашего сервера:</p>
                  <ol>
                    <li>Добавьте в <code>.env</code>: <code>REACT_APP_CUSTOM_SERVER_URL=https://your-domain.tld:11434</code></li>
                    <li>(Опционально) <code>REACT_APP_CUSTOM_MODEL=llama3.1:8b</code></li>
                    <li>Перезапустите приложение</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-header">
                <span className="role">
                  {message.role === 'user' ? '👤 Вы' : 
                   message.role === 'assistant' ? '🤖 AI' : '❌ Ошибка'}
                </span>
                <div className="message-actions">
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
            </div>
          ))}

          {isLoading && (
            <div className="message assistant loading">
              <div className="message-header">
                <span className="role">🤖 AI </span>
                <span className="timestamp">печатает...</span>
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
            disabled={!inputValue.trim() || isLoading || (provider === 'gemini' ? !apiKey.trim() : !customServerUrl.trim())}
            className="send-btn"
            title={(provider === 'gemini' ? (!apiKey.trim() ? 'Настройте API ключ в .env' : 'Отправить сообщение') : (!customServerUrl.trim() ? 'Укажите REACT_APP_CUSTOM_SERVER_URL в .env' : 'Отправить сообщение'))}
          >
            {isLoading ? '⏳' : '📤'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;