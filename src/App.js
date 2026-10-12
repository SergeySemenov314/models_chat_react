import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import ChatSidebar from './components/ChatSidebar';
import MessageContent from './components/MessageContent';

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Модель на бэке всегда Gemini; храним предпочтительную для fallback-оптимизации
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-lite');
  const messagesEndRef = useRef(null);
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
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

      // На бэке всегда Gemini; поиск по файлам выполняется всегда
      const requestData = {
        model: selectedModel,
        messages: chatMessages,
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
        sources: data.sources,
        fileSearchWarning: data.fileSearchWarning
      };
      setMessages(prev => [...prev, aiMessage]);

      // Если ответ пришёл от другой модели (после fallback на бэкенде),
      // запоминаем её, чтобы следующие запросы шли через неё
      const respondedModel = data?.stats?.model;
      if (respondedModel && respondedModel !== selectedModel) {
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
              <h2>Welcome to Chat with documents!</h2>
              <p>Start the conversation!</p>
              <div className="example-prompts">
                 <button onClick={() => sendMessage('In what year was the first artificial neural network created and who were its creators?')} title="Document search test" style={{ fontWeight: '600' }}>
                  📄 [Test document] In what year was the first artificial neural network created and who were its creators?
                </button>
                <button onClick={() => sendMessage('What components does the RAG system include?')} title="Document search test" style={{ fontWeight: '600' }}>
                  📄 [Test document] What components does the RAG system include?
                </button>
              </div>
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
                {message.role === 'assistant' ? <MessageContent content={message.content} /> : message.content}
              </div>
              {message.stats && (
                <div className="message-stats">
                  🤖 {message.stats.model} | 
                  📝 {message.stats.totalTokens} tokens 
                  ({message.stats.promptTokens} input + {message.stats.responseTokens} output)
                </div>
              )}
              {message.fileSearchWarning && (
                <div className="message-file-warning">{message.fileSearchWarning}</div>
              )}
              {message.sources && message.sources.length > 0 && (
                <div className="message-sources">
                  <strong>📚 Sources:</strong>
                  <ul>
                    {message.sources.map((source, idx) => (
                      <li key={idx}>
                        📄 {source.document} 
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
                disabled={!inputValue.trim() || isLoading}
                className="send-btn"
                title="Send message"
              >
                {isLoading ? '⏳' : '📤'}
              </button>
            </div>
          </div>

          <ChatSidebar
            clearChat={clearChat}
            isVisible={sidebarVisible}
            onClose={() => setSidebarVisible(false)}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
