# 🤖 Models Chat React

Современное веб-приложение для общения с различными AI моделями. Поддерживает подключение к собственному серверу и интеграцию с Google Gemini API.

## ✨ Возможности

- 💬 **Мультимодельный чат** - поддержка различных AI моделей
- 🌐 **Два провайдера**:
  - **Custom Server** - подключение к вашему собственному серверу с моделями
  - **Google Gemini** - интеграция с Gemini API (gemini-1.5-flash, gemini-1.5-pro и др.)
- 🎯 **Системные промпты** - настройка поведения AI ассистента
- 📱 **Адаптивный дизайн** - работает на всех устройствах
- ⚡ **Быстрый отклик** - оптимизированный интерфейс
- 🔄 **Автоматический выбор модели** - система выбирает лучшую доступную модель
- 📝 **История чата** - сохранение контекста беседы
- 🎨 **Современный UI** - красивый и интуитивный интерфейс

## 🚀 Быстрый старт

### Установка

```bash
# Клонируйте репозиторий
git clone https://github.com/SergeySemenov314/models_chat_react.git

# Перейдите в папку проекта
cd models_chat_react

# Установите зависимости
npm install
```

### Настройка

Создайте файл `.env` в корне проекта:

```env
# Для Google Gemini API
REACT_APP_GEMINI_API_KEY=your_gemini_api_key_here

# Для собственного сервера
REACT_APP_CUSTOM_SERVER_URL=http://localhost:11434
REACT_APP_CUSTOM_MODEL=qwen2:0.5b
```

### Запуск

```bash
npm start
```

Приложение откроется в браузере по адресу http://localhost:3000

## ⚙️ Конфигурация

### Google Gemini API

1. Получите API ключ в [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Добавьте ключ в файл `.env` как `REACT_APP_GEMINI_API_KEY`
3. Выберите провайдер "Gemini" в интерфейсе

**Поддерживаемые модели Gemini:**
- **Gemini 2.5 серия**: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite
- **Gemini 2.0 серия**: gemini-2.0-flash, gemini-2.0-pro-exp, gemini-2.0-flash-thinking-exp
- **Экспериментальные**: gemini-exp-1206, gemini-2.0-flash-exp-image-generation
- **Специализированные**: learnlm-2.0-flash-experimental, gemini-robotics-er-1.5-preview
- **Gemma модели**: gemma-3-1b-it, gemma-3-4b-it, gemma-3-12b-it, gemma-3-27b-it
- **Latest aliases**: gemini-flash-latest, gemini-pro-latest, gemini-flash-lite-latest
- И многие другие preview и экспериментальные версии

### Собственный сервер

Для работы с собственным сервером (например, Ollama):

1. Настройте URL сервера в `.env` как `REACT_APP_CUSTOM_SERVER_URL`
2. Укажите модель в `REACT_APP_CUSTOM_MODEL`
3. Выберите провайдер "Custom Server" в интерфейсе

**Пример настройки Ollama с Docker:**

```bash
# Запуск Ollama с поддержкой CORS
docker run -d --name ollama \
  --memory="2g" \
  --memory-swap="4g" \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  -e OLLAMA_ORIGINS="*" \
  ollama/ollama

# Загрузка модели
docker exec -it ollama ollama pull qwen2:0.5b
```

## 🎯 Использование

1. **Выберите провайдера** - Gemini или Custom Server
2. **Настройте модель** - выберите из доступных или укажите свою
3. **Настройте системный промпт** (опционально) - определите поведение AI
4. **Начните чат** - введите сообщение и получите ответ

### Системные промпты

Системные промпты позволяют настроить поведение AI ассистента:

- Включите/выключите использование системного промпта
- Настройте роль и стиль общения AI
- Задайте специфические инструкции для вашего случая использования

## 🛠️ Технические детали

### Стек технологий

- **Frontend**: React 19, CSS3
- **AI Integration**: 
  - Google Generative AI SDK
  - Custom REST API support
- **Build**: Create React App

### Архитектура

```
src/
├── App.js          # Основной компонент приложения
├── App.css         # Стили приложения
├── index.js        # Точка входа
└── ...
```

### API интеграция

**Gemini API:**
- Использует официальный SDK `@google/generative-ai`
- Поддержка всех актуальных моделей
- Автоматическое определение доступных моделей

**Custom Server:**
- REST API совместимый с Ollama
- Поддержка любых моделей на вашем сервере
- Гибкая настройка эндпоинтов

## 🔧 Разработка

```bash
# Запуск в режиме разработки
npm start

# Сборка для продакшена
npm run build

# Запуск тестов
npm test
```

## 📝 Лицензия

MIT License - используйте свободно для любых целей.

