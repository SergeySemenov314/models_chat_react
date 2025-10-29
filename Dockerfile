FROM nginx:alpine

# Копируем статические файлы сборки React
COPY build/ /usr/share/nginx/html

# Экспонируем порт
EXPOSE 80

# Запускаем nginx в форграунде
CMD ["nginx", "-g", "daemon off;"]


