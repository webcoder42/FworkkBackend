# Node.js version 20
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm install --prefer-offline

COPY . .

ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
