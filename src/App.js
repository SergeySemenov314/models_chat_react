import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import ChatSidebar from './components/ChatSidebar';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-lite');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant that answers user questions clearly and informatively.');
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
  const [sidebarVisible, setSidebarVisible] = useState(false);

  // Handle Escape key to close sidebar
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && sidebarVisible) {
        setSidebarVisible(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [sidebarVisible]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Выбор лучшей доступной модели на основе списка из API
  const pickBestModel = (modelsList) => {
    const names = modelsList.map(m => m);
    // Предпочитаем модели с бесплатной квотой (у Gemini 2.0-* free tier сейчас = 0)
    const preferredOrder = [
      'gemini-2.5-flash-lite',
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
    return 'gemini-2.5-flash-lite';
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
        setModelsError(e.message || 'Failed to get models list');
        setModelsLoaded(true);
      }
    };

    loadModels();
    // Загружаем при смене провайдера
  }, [selectedModel, provider, backendUrl]);

  const sendMessage = async (messageText = null) => {
    // Normalize argument: React passes click event to handlers bound directly
    const normalizedArg = typeof messageText === 'string' ? messageText : null;
    const textToSend = normalizedArg ?? inputValue;
    if (typeof textToSend !== 'string' || !textToSend.trim() || isLoading) return;

    const userMessage = { role: 'user', content: textToSend, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = textToSend;
    if (!normalizedArg) {
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
      // System Context отправляется только если поле заполнено и чекбокс включен
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

      // Если ответ пришел от другой модели (после fallback на бэкенде),
      // выбираем её в селекте, чтобы следующие запросы шли через неё
      const respondedModel = data?.stats?.model;
      if (provider === 'gemini' && respondedModel && respondedModel !== selectedModel) {
        setSelectedModel(respondedModel);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = { 
        role: 'error', 
        content: `Error: ${error.message}`, 
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
      // Could add copy notification
      console.log('Text copied!');
    }).catch(err => {
      console.error('Copy error:', err);
    });
  };

  return (
    <div className="App">
      <main className="chat-container">
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setSidebarVisible(!sidebarVisible)}
          aria-label="Toggle sidebar"
        >
          {sidebarVisible ? '✕' : '☰'}
        </button>
        {sidebarVisible && <div className="sidebar-overlay" onClick={() => setSidebarVisible(false)}></div>}
        <div className="chat-layout">
          <div className="chat-content">
            <div className="messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Welcome to Models Chat!</h2>
              <p>
                {`${provider === 'gemini' ? 'Google Gemini' : 'Your server'} is ready to help you. Start the conversation!`}
              </p>
              {useSystemPrompt && systemPrompt.trim() && (
                <div className="system-prompt-status active">
                  ✅ System Context active
                </div>
              )}
              {(!useSystemPrompt || !systemPrompt.trim()) && (
                <div className="system-prompt-status inactive">
                  ℹ️ System Context {!useSystemPrompt ? 'disabled' : 'not set'}
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
                   <button onClick={() => sendMessage('In what year was the first artificial neural network created and who were its creators?')} title="Document search test" style={{ fontWeight: '600' }}>
                    📄 [RAG Test] In what year was the first artificial neural network created and who were its creators?
                  </button>
                  <button onClick={() => sendMessage('What components does the RAG system include?')} title="Document search test" style={{ fontWeight: '600' }}>
                    📄 [RAG Test] What components does the RAG system include?
                  </button>  
                  <button onClick={() => sendMessage('Hello! How are you?')}>
                    Hello! How are you?
                  </button>
                  <button onClick={() => sendMessage('Explain quantum physics in simple terms')}>
                    Explain quantum physics simply
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
                    {message.role === 'user' ? '👤 You' : 
                     message.role === 'assistant' ? '🤖 AI' : '❌ Error'}
                  </span>
                </div>
                <div className="message-header-right">
                  <span className="timestamp">{formatTime(message.timestamp)}</span>
                  {message.role === 'assistant' && (
                    <button 
                      className="copy-btn" 
                      onClick={() => copyToClipboard(message.content)}
                      title="Copy response"
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
                  📝 {message.stats.totalTokens} tokens 
                  ({message.stats.promptTokens} input + {message.stats.responseTokens} output)
                </div>
              )}
              {message.sources && message.sources.length > 0 && (
                <div className="message-sources">
                  <strong>📚 Sources:</strong>
                  <ul>
                    {message.sources.map((source, idx) => (
                      <li key={idx}>
                        📄 {source.document} 
                        {source.similarity && (
                          <span className="similarity">
                            (relevance: {Math.round(source.similarity * 100)}%)
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
                  <span className="timestamp"> typing...</span>
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
                placeholder="Enter your message..."
                disabled={isLoading}
                rows="3"
              />
              <button 
                onClick={() => sendMessage()} 
                disabled={!inputValue.trim() || isLoading || (provider === 'custom' && !customServerConfig.configured)}
                className="send-btn"
                title={(provider === 'custom' && !customServerConfig.configured ? 'Configure custom server in backend .env' : 'Send message')}
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
            isVisible={sidebarVisible}
            onClose={() => setSidebarVisible(false)}
          />
        </div>
      </main>
    </div>
  );
}

export default App;